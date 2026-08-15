// A rally stage is a designed road, not a random walk. The generator composes
// corner primitives into phrases, sequences the phrases for rhythm, then hangs
// elevation, camber, width and surface off that skeleton. Terrain is built last
// and carved around the road so the road is never floating on it.

import { clamp, saturate, lerp, smoothstep, smootherstep, sign } from "./mathx.js";
import { makeRng, fbm2, ridged2, hash2, stringSeed } from "./rng.js";
import { SURFACE, surfaceProps, blendSurface } from "./surfaces.js";

const STEP = 2.0;
const G = 9.81;
const MAX_GRADE = 0.135;
const MAX_BANK = 0.125;
export const SEP_NEAR = Object.freeze({ gap: 20, dist: 16 });
export const SEP_FAR = Object.freeze({ gap: 250, dist: 30 });

// --- corner grammar -------------------------------------------------------

const CORNERS = {
  kink: { sev: 6, radius: [130, 235], arc: [0.16, 0.46], spiral: 0.55 },
  fast: { sev: 5, radius: [78, 138], arc: [0.35, 0.95], spiral: 0.50 },
  medium: { sev: 4, radius: [52, 84], arc: [0.50, 1.30], spiral: 0.45 },
  medium3: { sev: 3, radius: [34, 55], arc: [0.70, 1.70], spiral: 0.42 },
  slow: { sev: 2, radius: [22, 35], arc: [0.90, 2.10], spiral: 0.40 },
  hairpin: { sev: 1, radius: [12.5, 19], arc: [2.45, 3.05], spiral: 0.34 },
  square: { sev: 1, radius: [11, 16], arc: [1.45, 1.78], spiral: 0.30 },
  sweeper: { sev: 5, radius: [72, 165], arc: [1.05, 2.35], spiral: 0.42 },
};

const COMPOUND = new Set(["doubleApex", "decreasing", "chicane"]);

// Curvature is piecewise-linear in arc length, which is exactly an Euler spiral
// between constant-radius arcs — a step change in curvature is the one thing a
// road builder never does and a driver instantly feels.
function pushKnot(knots, len, k) {
  if (len > 0.05) knots.push({ len, k });
}

function emitArc(knots, radius, arc, dir, spiralScale) {
  const k = dir / radius;
  const arcLen = arc * radius;
  let ls = clamp(spiralScale * radius, 8, 55);
  if (ls > arcLen - 4) ls = Math.max(2.5, arcLen - 4);
  const la = arcLen - ls;
  pushKnot(knots, ls, k);
  pushKnot(knots, la, k);
  pushKnot(knots, ls, 0);
  return arcLen + ls;
}

function emitPrimitive(knots, kind, dir, rng) {
  if (kind === "straight") return 0;
  if (kind === "chicane") {
    const r = rng.range(45, 80);
    const k = dir / r;
    const ls = clamp(0.5 * r, 12, 32);
    const hold = rng.range(6, 18);
    pushKnot(knots, ls, k);
    pushKnot(knots, hold, k);
    pushKnot(knots, ls * 2, -k);
    pushKnot(knots, hold, -k);
    pushKnot(knots, ls, 0);
    return ls * 4 + hold * 2;
  }
  if (kind === "doubleApex") {
    const r = rng.range(55, 95);
    const k = dir / r;
    const ls = clamp(0.45 * r, 12, 34);
    const a1 = rng.range(25, 55);
    const relax = rng.range(30, 60);
    pushKnot(knots, ls, k);
    pushKnot(knots, a1, k);
    pushKnot(knots, relax * 0.5, k * 0.42);
    pushKnot(knots, relax * 0.5, k * 0.42);
    pushKnot(knots, relax * 0.5, k);
    pushKnot(knots, a1 * 0.8, k);
    pushKnot(knots, ls, 0);
    return ls * 2 + a1 * 1.8 + relax * 1.5;
  }
  // decreasing radius: the classic trap — it opens like a 4 and shuts to a 2.
  const r1 = rng.range(75, 120);
  const r2 = rng.range(28, 44);
  const k1 = dir / r1;
  const k2 = dir / r2;
  const ls = clamp(0.45 * r1, 14, 36);
  const a1 = rng.range(30, 70);
  const a2 = rng.range(20, 45);
  pushKnot(knots, ls, k1);
  pushKnot(knots, a1, k1);
  pushKnot(knots, rng.range(18, 34), k2);
  pushKnot(knots, a2, k2);
  pushKnot(knots, ls * 0.6, 0);
  return ls * 1.6 + a1 + a2 + 26;
}

// --- phrases --------------------------------------------------------------

const PHRASES = {
  fastSection: {
    label: "fast section",
    deck: [["straight", 3], ["kink", 3], ["fast", 3], ["sweeper", 2], ["medium", 1]],
    straight: [65, 215],
    len: [620, 1150],
    grade: [-0.035, 0.035],
    width: [4.5, 5.5],
    crests: 2,
    jumpWeight: 1.4,
    poles: true,
  },
  plateauBlast: {
    label: "plateau blast",
    deck: [["straight", 4], ["kink", 3], ["sweeper", 2], ["fast", 2]],
    straight: [110, 300],
    len: [650, 1200],
    grade: [-0.02, 0.02],
    width: [5.0, 6.2],
    crests: 2,
    jumpWeight: 2.2,
    poles: true,
    open: true,
  },
  technicalClimb: {
    label: "technical climb",
    deck: [["hairpin", 3], ["slow", 3], ["medium3", 3], ["medium", 2], ["decreasing", 1]],
    straight: [28, 90],
    len: [520, 900],
    grade: [0.075, 0.115],
    width: [3.1, 4.1],
    crests: 0,
    jumpWeight: 0,
    poles: false,
    guaranteed: ["hairpin", "hairpin"],
  },
  switchbackDescent: {
    label: "switchback descent",
    deck: [["hairpin", 3], ["slow", 2], ["medium3", 3], ["doubleApex", 1]],
    straight: [30, 110],
    len: [520, 900],
    grade: [-0.115, -0.075],
    width: [3.2, 4.3],
    crests: 1,
    jumpWeight: 0,
    poles: false,
    guaranteed: ["hairpin"],
  },
  forestFlickFlack: {
    label: "forest flick-flack",
    deck: [["medium3", 3], ["chicane", 2], ["medium", 3], ["slow", 2], ["fast", 1]],
    straight: [35, 130],
    len: [560, 1000],
    grade: [-0.05, 0.05],
    width: [3.2, 4.2],
    crests: 1,
    jumpWeight: 0.5,
    poles: false,
    forest: true,
  },
  descent: {
    label: "descent",
    deck: [["fast", 3], ["medium", 3], ["decreasing", 2], ["kink", 2], ["sweeper", 1]],
    straight: [50, 165],
    len: [600, 1050],
    grade: [-0.10, -0.06],
    width: [3.8, 5.0],
    crests: 2,
    jumpWeight: 1.1,
    poles: true,
  },
  ridgeRun: {
    label: "ridge run",
    deck: [["kink", 4], ["fast", 3], ["straight", 3], ["medium", 1], ["sweeper", 1]],
    straight: [80, 235],
    len: [560, 980],
    grade: [-0.045, 0.045],
    width: [4.2, 5.4],
    crests: 3,
    jumpWeight: 2.4,
    poles: false,
    open: true,
  },
  village: {
    label: "village",
    deck: [["square", 3], ["medium", 3], ["medium3", 2], ["slow", 2], ["kink", 1]],
    straight: [45, 150],
    len: [380, 640],
    grade: [-0.03, 0.03],
    width: [3.0, 4.2],
    crests: 0,
    jumpWeight: 0,
    poles: true,
    tarmac: true,
    junction: true,
  },
  riverCrossing: {
    label: "river crossing",
    deck: [["medium3", 3], ["slow", 2], ["medium", 2], ["chicane", 1]],
    straight: [50, 160],
    len: [360, 620],
    grade: [-0.05, 0.02],
    width: [3.0, 4.0],
    crests: 0,
    jumpWeight: 0,
    poles: false,
    ford: true,
  },
  quarryCut: {
    label: "quarry cut",
    deck: [["square", 2], ["medium", 3], ["medium3", 2], ["slow", 2], ["doubleApex", 1]],
    straight: [55, 170],
    len: [400, 720],
    grade: [-0.04, 0.06],
    width: [3.6, 5.0],
    crests: 1,
    jumpWeight: 0.6,
    poles: false,
    cutting: true,
  },
};

const FINISHERS = ["plateauBlast", "ridgeRun", "descent", "village", "fastSection"];

const PERSONALITY = {
  flowing: { fastSection: 3, forestFlickFlack: 3, descent: 2, ridgeRun: 2, technicalClimb: 1.4, plateauBlast: 1.6, village: 1, switchbackDescent: 1, riverCrossing: 1, quarryCut: 0.7 },
  fast: { fastSection: 4, plateauBlast: 3.4, ridgeRun: 3, descent: 2, forestFlickFlack: 1.2, technicalClimb: 0.8, switchbackDescent: 0.7, village: 0.7, riverCrossing: 0.6, quarryCut: 0.6 },
  technical: { technicalClimb: 3, switchbackDescent: 3, forestFlickFlack: 3, village: 2, quarryCut: 1.6, riverCrossing: 1.4, descent: 1.4, fastSection: 1.2, ridgeRun: 0.8, plateauBlast: 0.6 },
  mixed: { fastSection: 2, forestFlickFlack: 2, technicalClimb: 2, descent: 2, ridgeRun: 1.6, village: 1.4, plateauBlast: 1.4, switchbackDescent: 1.4, riverCrossing: 1.2, quarryCut: 1.2 },
  twisty: { forestFlickFlack: 3.4, technicalClimb: 2.6, switchbackDescent: 2.6, village: 1.8, riverCrossing: 1.6, quarryCut: 1.4, descent: 1.4, fastSection: 1.2, ridgeRun: 0.9, plateauBlast: 0.6 },
  open: { plateauBlast: 3.4, ridgeRun: 3.2, fastSection: 3, descent: 2, quarryCut: 1.4, forestFlickFlack: 1.2, technicalClimb: 1, switchbackDescent: 0.9, village: 0.8, riverCrossing: 0.8 },
};

function weightedPick(rng, weights, exclude) {
  let total = 0;
  for (const key in weights) {
    if (key === exclude) continue;
    total += weights[key];
  }
  let r = rng.next() * total;
  for (const key in weights) {
    if (key === exclude) continue;
    r -= weights[key];
    if (r <= 0) return key;
  }
  for (const key in weights) if (key !== exclude) return key;
  return "fastSection";
}

function deckPick(rng, deck, recent) {
  // Two in a row is a rhythm; three is a stutter. Reject the third.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let total = 0;
    for (const entry of deck) total += entry[1];
    let r = rng.next() * total;
    let chosen = deck[0][0];
    for (const entry of deck) {
      r -= entry[1];
      if (r <= 0) { chosen = entry[0]; break; }
    }
    if (!(recent.length >= 2 && recent[recent.length - 1] === chosen && recent[recent.length - 2] === chosen)) {
      return chosen;
    }
  }
  for (const entry of deck) {
    if (!(recent.length >= 2 && recent[recent.length - 1] === entry[0] && recent[recent.length - 2] === entry[0])) return entry[0];
  }
  return deck[0][0];
}

// --- programme ------------------------------------------------------------

function composeProgramme(rng, params) {
  const weights = PERSONALITY[params.personality] || PERSONALITY.mixed;
  const target = params.length;
  const knots = [];
  const spans = [];
  const corners = [];
  const sections = [];
  const marks = [];
  let s = 0;
  let netTurn = 0;
  let prevPhrase = null;
  const usedPhrases = [];

  const lead = rng.range(110, 240);
  pushKnot(knots, lead, 0);
  s += lead;

  let guard = 0;
  while (s < target - 380 && guard < 40) {
    guard += 1;
    let name;
    const remaining = target - 380 - s;
    if (remaining < 520) {
      name = FINISHERS[Math.floor(rng.next() * FINISHERS.length)];
      if (name === prevPhrase) name = FINISHERS[(FINISHERS.indexOf(name) + 1) % FINISHERS.length];
    } else {
      name = weightedPick(rng, weights, prevPhrase);
      if (params.forceTechnical && usedPhrases.length === 2
        && !usedPhrases.some((p) => p === "technicalClimb" || p === "switchbackDescent")) {
        name = rng.chance(0.5) ? "technicalClimb" : "switchbackDescent";
      }
    }
    const phrase = PHRASES[name];
    const phraseLen = rng.range(phrase.len[0], phrase.len[1]);
    const s0 = s;
    const recent = [];
    const guaranteed = phrase.guaranteed ? phrase.guaranteed.slice() : [];
    let inner = 0;
    while (inner < phraseLen && s - s0 < phraseLen * 1.4) {
      const gap = rng.range(phrase.straight[0], phrase.straight[1]);
      pushKnot(knots, gap, 0);
      s += gap;
      inner += gap;
      const kind = guaranteed.length ? guaranteed.shift() : deckPick(rng, phrase.deck, recent);
      recent.push(kind);
      if (kind === "straight") { inner += 40; continue; }
      // Bias against curling the stage into a spiral; a designed stage wanders.
      const bias = saturate(Math.abs(netTurn) / 2.6) * 0.42;
      const away = netTurn > 0 ? -1 : 1;
      const dir = rng.next() < 0.5 + bias ? away : -away;
      const before = knots.length;
      let len;
      let severity;
      let radius = 0;
      if (COMPOUND.has(kind)) {
        len = emitPrimitive(knots, kind, dir, rng);
        severity = kind === "chicane" ? 4 : 3;
      } else {
        const def = CORNERS[kind];
        radius = rng.range(def.radius[0], def.radius[1]);
        const arc = rng.range(def.arc[0], def.arc[1]);
        len = emitArc(knots, radius, arc, dir, def.spiral);
        severity = def.sev;
        netTurn += dir * arc;
      }
      let turn = 0;
      let prevK = before > 0 ? knots[before - 1].k : 0;
      for (let i = before; i < knots.length; i += 1) {
        turn += (prevK + knots[i].k) * 0.5 * knots[i].len;
        prevK = knots[i].k;
      }
      if (COMPOUND.has(kind)) netTurn += turn;
      corners.push({
        s, sEnd: s + len, kind, dir, severity, radius,
        bank: rng.chance(params.offCamber ?? 0.13) ? -rng.range(0.35, 0.6) : rng.range(0.5, 0.95),
        phrase: name,
      });
      s += len;
      inner += len;
    }
    spans.push({
      s0, s1: s, name, phrase,
      grade: rng.range(phrase.grade[0], phrase.grade[1]),
      width: rng.range(phrase.width[0], phrase.width[1]),
    });
    usedPhrases.push(name);
    prevPhrase = name;
  }

  const runIn = rng.range(180, 320);
  pushKnot(knots, runIn, 0);
  const s0 = s;
  s += runIn;
  spans.push({
    s0, s1: s, name: "finishStraight", phrase: PHRASES.fastSection,
    grade: rng.range(-0.03, 0.02), width: rng.range(4.4, 5.6),
  });

  return { knots, spans, corners, sections, marks, length: s };
}

// --- sampling the curvature programme -------------------------------------

function sampleCurvature(knots, count, step) {
  const k = new Float32Array(count);
  let ki = 0;
  let segStart = 0;
  let kPrev = 0;
  for (let i = 0; i < count; i += 1) {
    const s = i * step;
    while (ki < knots.length && s > segStart + knots[ki].len) {
      segStart += knots[ki].len;
      kPrev = knots[ki].k;
      ki += 1;
    }
    if (ki >= knots.length) { k[i] = kPrev; continue; }
    const seg = knots[ki];
    const t = seg.len > 1e-6 ? (s - segStart) / seg.len : 1;
    k[i] = kPrev + (seg.k - kPrev) * t;
  }
  return k;
}

// --- elevation ------------------------------------------------------------

function placeElevationEvents(rng, prog, params) {
  const events = [];
  const wantJumps = rng.int(params.jumps[0], params.jumps[1]);
  const candidates = [];
  for (const span of prog.spans) {
    const w = span.phrase.jumpWeight || 0;
    if (w <= 0) continue;
    const room = span.s1 - span.s0;
    if (room < 320) continue;
    candidates.push({ span, w });
  }
  let placed = 0;
  let guard = 0;
  while (placed < wantJumps && candidates.length && guard < 60) {
    guard += 1;
    let total = 0;
    for (const c of candidates) total += c.w;
    let r = rng.next() * total;
    let pickIdx = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      r -= candidates[i].w;
      if (r <= 0) { pickIdx = i; break; }
    }
    const cand = candidates[pickIdx];
    const s = rng.range(cand.span.s0 + 150, cand.span.s1 - 160);
    if (events.some((e) => Math.abs(e.s - s) < 300)) { candidates.splice(pickIdx, 1); continue; }
    events.push({
      kind: "jump", s,
      pre: rng.range(70, 120),
      up: rng.range(0.075, 0.105),
      trans: rng.range(17, 24),
      down: -rng.range(0.10, MAX_GRADE),
      post: rng.range(130, 200),
      after: -rng.range(0.01, 0.05),
    });
    cand.w *= 0.35;
    placed += 1;
  }
  for (const span of prog.spans) {
    const n = span.phrase.crests || 0;
    for (let j = 0; j < n; j += 1) {
      const s = rng.range(span.s0 + 60, Math.max(span.s0 + 70, span.s1 - 80));
      if (events.some((e) => Math.abs(e.s - s) < 190)) continue;
      const up = rng.range(0.035, 0.085);
      events.push({
        kind: "crest", s,
        pre: rng.range(50, 100),
        up,
        trans: rng.range(34, 62),
        down: -rng.range(0.045, 0.10),
        post: rng.range(90, 150),
        after: rng.range(-0.03, 0.02),
      });
    }
  }
  events.sort((a, b) => a.s - b.s);
  return events;
}

function buildGradeKnots(prog, events, params) {
  const knots = [];
  knots.push({ s: 0, g: 0 });
  for (const span of prog.spans) {
    const mid = (span.s0 + span.s1) * 0.5;
    knots.push({ s: mid, g: span.grade });
    if (span.s1 - span.s0 > 560) {
      knots.push({ s: span.s0 + (span.s1 - span.s0) * 0.22, g: span.grade * 0.55 });
      knots.push({ s: span.s0 + (span.s1 - span.s0) * 0.78, g: span.grade * 1.15 });
    }
  }
  knots.push({ s: prog.length, g: 0 });
  let out = knots;
  for (const ev of events) {
    const a = ev.s - ev.pre - 20;
    const b = ev.s + ev.post + 20;
    out = out.filter((kn) => kn.s < a || kn.s > b);
    out.push({ s: ev.s - ev.pre, g: ev.up, ev: true });
    out.push({ s: ev.s, g: ev.up, ev: true });
    out.push({ s: ev.s + ev.trans, g: ev.down, ev: true });
    out.push({ s: ev.s + ev.post, g: ev.after, ev: true });
  }
  out.sort((a, b) => a.s - b.s);
  // Pull the stage back toward its intended net climb without touching the
  // event knots, which are the only ones whose exact slope matters.
  const filtered = [];
  for (const kn of out) {
    if (filtered.length && kn.s - filtered[filtered.length - 1].s < 6) continue;
    filtered.push(kn);
  }
  let net = 0;
  for (let i = 1; i < filtered.length; i += 1) {
    net += (filtered[i].g + filtered[i - 1].g) * 0.5 * (filtered[i].s - filtered[i - 1].s);
  }
  const bias = (net - (params.netClimb || 0)) / prog.length;
  for (const kn of filtered) {
    if (kn.ev) continue;
    kn.g = clamp(kn.g - bias, -MAX_GRADE, MAX_GRADE);
  }
  return filtered;
}

function sampleGrade(knots, count, step) {
  const g = new Float32Array(count);
  let ki = 0;
  for (let i = 0; i < count; i += 1) {
    const s = i * step;
    while (ki < knots.length - 2 && s > knots[ki + 1].s) ki += 1;
    const a = knots[ki];
    const b = knots[Math.min(ki + 1, knots.length - 1)];
    const span = b.s - a.s;
    const t = span > 1e-6 ? smootherstep(0, 1, (s - a.s) / span) : 1;
    g[i] = clamp(a.g + (b.g - a.g) * t, -MAX_GRADE, MAX_GRADE);
  }
  return g;
}

function integrateElevation(grade, count, step, base) {
  const y = new Float64Array(count);
  y[0] = 0;
  for (let i = 1; i < count; i += 1) y[i] = y[i - 1] + (grade[i] + grade[i - 1]) * 0.5 * step;
  let min = Infinity;
  for (let i = 0; i < count; i += 1) if (y[i] < min) min = y[i];
  const shift = base - min;
  for (let i = 0; i < count; i += 1) y[i] += shift;
  return y;
}

// --- width, surface, camber ----------------------------------------------

function smoothArray(arr, radius) {
  const n = arr.length;
  const out = new Float32Array(n);
  let acc = 0;
  for (let i = -radius; i <= radius; i += 1) acc += arr[clamp(i, 0, n - 1)];
  const win = radius * 2 + 1;
  for (let i = 0; i < n; i += 1) {
    out[i] = acc / win;
    acc -= arr[clamp(i - radius, 0, n - 1)];
    acc += arr[clamp(i + radius + 1, 0, n - 1)];
  }
  return out;
}

function buildWidth(prog, count, step, rng, params) {
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const s = i * step;
    let w = params.width;
    for (const span of prog.spans) {
      if (s >= span.s0 && s <= span.s1) { w = span.width; break; }
    }
    raw[i] = w;
  }
  // Slow breathing of the road width; a real road is never one constant.
  for (let i = 0; i < count; i += 1) {
    raw[i] += fbm2(i * step * 0.0022, 11.7, params.widthSeed, 3) * 0.42;
  }
  const out = smoothArray(raw, 12);
  for (let i = 0; i < count; i += 1) out[i] = clamp(out[i], 2.5, 6.6);
  return out;
}

function buildSections(prog, rng, params) {
  const sections = [];
  const base = params.surface;
  for (const span of prog.spans) {
    const p = span.phrase;
    if (p.tarmac) sections.push({ s0: span.s0 - 30, s1: span.s1 + 30, id: SURFACE.TARMAC, kind: "village" });
    if (p.cutting && params.cutSurface !== undefined) {
      const a = rng.range(span.s0 + 40, span.s1 - 180);
      sections.push({ s0: a, s1: a + rng.range(120, 240), id: params.cutSurface, kind: "cutting" });
    }
    if (p.ford) {
      const a = (span.s0 + span.s1) * 0.5 + rng.range(-60, 60);
      sections.push({ s0: a - rng.range(4, 7), s1: a + rng.range(4, 7), id: SURFACE.WATER, kind: "ford" });
    }
    if (p.forest && rng.chance(0.65)) {
      const a = rng.range(span.s0 + 40, Math.max(span.s0 + 50, span.s1 - 160));
      sections.push({ s0: a, s1: a + rng.range(70, 160), id: SURFACE.MUD, kind: "shade" });
    }
  }
  if (params.icePatches) {
    const shady = prog.corners.filter((c) => c.severity <= 2);
    const n = Math.min(shady.length, 2);
    for (let i = 0; i < n; i += 1) {
      const c = shady[Math.floor(rng.next() * shady.length)];
      sections.push({ s0: c.s - 12, s1: c.sEnd + 14, id: SURFACE.ICE, kind: "ice" });
    }
  }
  if (params.dirtPatches) {
    for (let i = 0; i < 3; i += 1) {
      const a = rng.range(200, prog.length - 300);
      sections.push({ s0: a, s1: a + rng.range(90, 220), id: SURFACE.DIRT, kind: "worn" });
    }
  }
  sections.sort((a, b) => a.s0 - b.s0);
  return { base, sections };
}

// The primary/alt pair lets surfaceAt cross-fade a transition instead of
// stepping it, while `surface` stays a plain id array for the UI and audio.
function buildSurface(sectionInfo, count, step) {
  const primary = new Uint8Array(count);
  const alt = new Uint8Array(count);
  const mixT = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let id = sectionInfo.base;
    for (const sec of sectionInfo.sections) {
      const s = i * step;
      if (s >= sec.s0 && s <= sec.s1) { id = sec.id; break; }
    }
    primary[i] = id;
    alt[i] = id;
  }
  const blend = 5;
  for (let i = 1; i < count; i += 1) {
    if (primary[i] === primary[i - 1]) continue;
    const a = primary[i - 1];
    const b = primary[i];
    for (let j = -blend; j <= blend; j += 1) {
      const idx = i - 1 + j + (j > 0 ? 0 : 0);
      const k = clamp(i + j, 0, count - 1);
      const u = saturate(0.5 + (j + 0.5) / (2 * blend + 1));
      if (k < i) { alt[k] = b; mixT[k] = Math.max(mixT[k], u); }
      else { alt[k] = a; mixT[k] = Math.max(mixT[k], 1 - u); }
      void idx;
    }
  }
  return { primary, alt, mixT };
}

function buildCamber(prog, curvature, speed, count, step) {
  const bankField = new Float32Array(count);
  for (const c of prog.corners) {
    const i0 = clamp(Math.floor((c.s - 18) / step), 0, count - 1);
    const i1 = clamp(Math.ceil((c.sEnd + 18) / step), 0, count - 1);
    for (let i = i0; i <= i1; i += 1) bankField[i] = c.bank;
  }
  const bank = smoothArray(bankField, 10);
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const k = curvature[i];
    const need = saturate((speed[i] * speed[i] * Math.abs(k)) / G / 1.25);
    raw[i] = sign(k) * need * MAX_BANK * bank[i];
  }
  const out = smoothArray(raw, 6);
  for (let i = 0; i < count; i += 1) out[i] = clamp(out[i], -MAX_BANK, MAX_BANK);
  return out;
}

// --- speed profile --------------------------------------------------------

export const NOMINAL_CAR = Object.freeze({
  mass: 1250,
  power: 248000,
  dragArea: 0.80,      // 0.5 * rho * Cd * A, N per (m/s)^2
  tyreLat: 1.30,
  tyreLong: 1.22,
  topSpeed: 45,
});

// A physics-free profile: lateral limit, then a backward brake pass and a
// forward power pass. Camber, grade and surface all move it, which is what
// makes it worth trusting as a design oracle.
export function speedProfile(stage, car = NOMINAL_CAR, out = null) {
  const n = stage.count;
  const v = out && out.length === n ? out : new Float32Array(n);
  const step = stage.step;
  const latCap = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const props = surfaceProps(stage.surface[i]);
    const mu = props.gripLat * car.tyreLat;
    const k = Math.abs(stage.curvature[i]);
    const theta = stage.camber[i] * sign(stage.curvature[i]);
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const denom = Math.max(0.25, c - mu * sn);
    const aLat = G * (mu * c + sn) / denom;
    const cap = k > 1e-5 ? Math.sqrt(aLat / k) : car.topSpeed;
    latCap[i] = Math.min(cap, car.topSpeed);
    v[i] = latCap[i];
  }
  for (let i = n - 2; i >= 0; i -= 1) {
    const props = surfaceProps(stage.surface[i]);
    const aLong = G * props.gripLong * car.tyreLong;
    const used = saturate((v[i] * v[i] * Math.abs(stage.curvature[i])) / Math.max(1e-3, G * props.gripLat * car.tyreLat));
    // Gravity's along-track term is -G*grade, so it opposes braking on a descent
    // and helps it on a climb — the opposite sign to the power pass below, which
    // is fighting the same term while accelerating.
    const avail = aLong * Math.sqrt(Math.max(0.04, 1 - used * used)) + G * stage.grade[i];
    const vv = Math.sqrt(Math.max(0, v[i + 1] * v[i + 1] + 2 * Math.max(0.5, avail) * step));
    if (vv < v[i]) v[i] = vv;
  }
  for (let i = 1; i < n; i += 1) {
    const props = surfaceProps(stage.surface[i]);
    const aTyre = G * props.gripLong * car.tyreLong;
    const vp = Math.max(4, v[i - 1]);
    const aPower = car.power / (car.mass * vp);
    const drag = (car.dragArea * vp * vp) / car.mass + props.rollingResistance * G;
    const used = saturate((vp * vp * Math.abs(stage.curvature[i - 1])) / Math.max(1e-3, G * props.gripLat * car.tyreLat));
    const grip = aTyre * Math.sqrt(Math.max(0.04, 1 - used * used));
    const avail = Math.min(aPower, grip) - drag - G * stage.grade[i - 1];
    const vv = Math.sqrt(Math.max(1, v[i - 1] * v[i - 1] + 2 * avail * step));
    if (vv < v[i]) v[i] = vv;
  }
  for (let i = 0; i < n; i += 1) if (!Number.isFinite(v[i]) || v[i] < 3) v[i] = 3;
  return v;
}

export function stageTime(stage, speed) {
  let t = 0;
  for (let i = 1; i < stage.count; i += 1) t += (2 * stage.step) / (speed[i] + speed[i - 1]);
  return t;
}

// --- geometry integration -------------------------------------------------

// Curvature is defined against 3D arc length, so a sample step is exactly
// `step` metres of road however steep it is; the horizontal advance shortens by
// cos(pitch) and the tangent stays unit without renormalising.
function integrateGeometry(curvature, grade, y, count, step, yaw0) {
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  const heading = new Float64Array(count);
  let yaw = yaw0;
  x[0] = 0;
  z[0] = 0;
  heading[0] = yaw;
  for (let i = 1; i < count; i += 1) {
    const kMid = (curvature[i - 1] + curvature[i]) * 0.5;
    const midYaw = yaw + kMid * step * 0.5;
    const gMid = (grade[i - 1] + grade[i]) * 0.5;
    const c = Math.sqrt(Math.max(0, 1 - gMid * gMid));
    x[i] = x[i - 1] + Math.sin(midYaw) * step * c;
    z[i] = z[i - 1] + Math.cos(midYaw) * step * c;
    yaw += kMid * step;
    heading[i] = yaw;
  }
  void y;
  return { x, z, heading };
}

// Two rules, both load-bearing. NEAR keeps the road out of its own width — a
// hairpin legitimately doubles back 25 m away, but never 10. FAR stops a stage
// looping back onto itself half a kilometre later. NEAR is also the invariant
// that makes the hinted project() provably exact.
function selfIntersects(x, z, count) {
  const cell = SEP_FAR.dist;
  const buckets = new Map();
  for (let i = 0; i < count; i += 1) {
    const cx = Math.floor(x[i] / cell);
    const cz = Math.floor(z[i] / cell);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const key = (cx + ox) * 73856093 ^ (cz + oz) * 19349663;
        const list = buckets.get(key);
        if (!list) continue;
        for (let j = 0; j < list.length; j += 1) {
          const q = list[j];
          const gap = i - q;
          const dx = x[i] - x[q];
          const dz = z[i] - z[q];
          const d2 = dx * dx + dz * dz;
          if (gap >= SEP_NEAR.gap && d2 < SEP_NEAR.dist * SEP_NEAR.dist) return true;
          if (gap >= SEP_FAR.gap && d2 < SEP_FAR.dist * SEP_FAR.dist) return true;
        }
      }
    }
    const key = cx * 73856093 ^ cz * 19349663;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(i);
  }
  return false;
}

// --- crests and jumps -----------------------------------------------------

// Both are one measurement: how much of the car's weight the vertical curvature
// takes away at the speed it actually arrives at. Past 1.0 the wheels leave.
function buildAirfield(grade, speed, count, step) {
  const crest = new Float32Array(count);
  const jump = new Float32Array(count);
  for (let i = 1; i < count - 1; i += 1) {
    const yy = (grade[i + 1] - grade[i - 1]) / (2 * step);
    if (yy >= 0) continue;
    const v = speed[i];
    const lift = (v * v * -yy) / G;
    crest[i] = saturate(lift);
    jump[i] = saturate((lift - 1.0) / 0.9);
  }
  return { crest, jump };
}

// Ballistic flight over the elevation profile. Used both to tune a jump down
// until it is survivable and to prove in tests that it stayed that way.
export function jumpLanding(stage, index, speed) {
  const step = stage.step;
  const v = speed;
  const g0 = stage.grade[index];
  const c = Math.sqrt(Math.max(1e-6, 1 - g0 * g0));
  const vx = v * c;
  const vy0 = v * g0;
  const y0 = stage.y[index];
  const dt = 0.01;
  for (let t = dt; t < 6; t += dt) {
    const dx = vx * t;
    const j = index + dx / step;
    const ji = Math.floor(j);
    if (ji >= stage.count - 2) return { flight: dx, closing: 0, air: t, landIndex: stage.count - 1 };
    const f = j - ji;
    const ground = stage.y[ji] + (stage.y[ji + 1] - stage.y[ji]) * f;
    const air = y0 + vy0 * t - 0.5 * G * t * t;
    if (air <= ground) {
      const carVy = vy0 - G * t;
      const groundVy = stage.grade[ji] * vx;
      return { flight: dx, closing: Math.abs(carVy - groundVy), air: t, landIndex: ji };
    }
  }
  return { flight: vx * 6, closing: 0, air: 6, landIndex: stage.count - 1 };
}

function peaksOf(arr, count, threshold) {
  const out = [];
  for (let i = 2; i < count - 2; i += 1) {
    if (arr[i] < threshold) continue;
    if (arr[i] < arr[i - 1] || arr[i] < arr[i + 1]) continue;
    if (out.length && i - out[out.length - 1] < 25) {
      if (arr[i] > arr[out[out.length - 1]]) out[out.length - 1] = i;
      continue;
    }
    out.push(i);
  }
  return out;
}

// --- world queries --------------------------------------------------------

const CELL = 12;
const FAST_HALF = 24;
const HINT_SLACK = 2;
const GRID_HALF = 28;

const VERGE = 2.2;
const VERGE_DROP = 0.42;
const BLEND = 22;
const DITCH_W = 3.4;

// How far past its own verge a stretch of road still shapes the ground. Beyond
// it the terrain is the anchor field below, which knows about the whole road
// rather than the nearest bit of it. Wide on purpose: where the road climbs
// back over itself, the ground between the two passes has to cover the whole
// height difference, and a wider reach gives it further to do that in.
const TERRAIN_REACH = 80;
const REACH_CELL = 32;
const ANCHOR_CELL = 64;
const ANCHOR_DEC = 24;
const ANCHOR_EPS = 25;
const ANCHOR_PAD = 340;
const HILL_REACH = 95;

// Scratch for the height field's deferred weights. Module scope because the
// field runs per wheel per substep and must not allocate.
const HOLD_CAP = 2048;
const holdI = new Int32Array(HOLD_CAP);
const holdF = new Float64Array(HOLD_CAP);
const holdW = new Float64Array(HOLD_CAP);
const holdD = new Float64Array(HOLD_CAP);

function makeSurfaceScratch() {
  return {
    id: SURFACE.GRAVEL, name: "Gravel",
    gripLong: 1, gripLat: 1, rollingResistance: 0, looseDepth: 0, roughness: 0,
    dragOffRoad: 0, dustRate: 0, dustColour: [0, 0, 0], sfx: "gravel",
    albedo: [0, 0, 0], specular: 0, wetDarken: 0, owned: true,
  };
}

function buildNearestGrid(stage) {
  const b = stage.bounds;
  const nx = Math.max(2, Math.ceil((b.maxX - b.minX) / CELL) + 2);
  const nz = Math.max(2, Math.ceil((b.maxZ - b.minZ) / CELL) + 2);
  const grid = new Int32Array(nx * nz).fill(-1);
  const cellX = (x) => clamp(Math.floor((x - b.minX) / CELL) + 1, 0, nx - 1);
  const cellZ = (z) => clamp(Math.floor((z - b.minZ) / CELL) + 1, 0, nz - 1);
  const cx = (i) => b.minX + (i - 0.5) * CELL;
  const cz = (j) => b.minZ + (j - 0.5) * CELL;
  const d2 = (i, j, k) => {
    const dx = stage.x[k] - cx(i);
    const dz = stage.z[k] - cz(j);
    return dx * dx + dz * dz;
  };
  for (let k = 0; k < stage.count; k += 1) {
    const i = cellX(stage.x[k]);
    const j = cellZ(stage.z[k]);
    const idx = j * nx + i;
    if (grid[idx] < 0 || d2(i, j, k) < d2(i, j, grid[idx])) grid[idx] = k;
  }
  // Jump flooding: a few halving passes give a near-exact nearest-sample field
  // for the whole map at a fraction of the cost of a brute-force transform.
  for (let stride = Math.max(nx, nz) >> 1; stride >= 1; stride >>= 1) {
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const idx = j * nx + i;
        let best = grid[idx];
        let bestD = best >= 0 ? d2(i, j, best) : Infinity;
        for (let oj = -1; oj <= 1; oj += 1) {
          for (let oi = -1; oi <= 1; oi += 1) {
            const si = i + oi * stride;
            const sj = j + oj * stride;
            if (si < 0 || sj < 0 || si >= nx || sj >= nz) continue;
            const cand = grid[sj * nx + si];
            if (cand < 0) continue;
            const dd = d2(i, j, cand);
            if (dd < bestD) { bestD = dd; best = cand; }
          }
        }
        grid[idx] = best;
      }
    }
  }
  return { grid, nx, nz, cellX, cellZ };
}

// Every segment within reach of a cell, as runs of consecutive indices. A run
// is what a pass of the road looks like from here, so walking the list visits
// each nearby stretch once and in memory order.
function buildReachIndex(stage) {
  const cell = REACH_CELL;
  const b = stage.bounds;
  const pad = TERRAIN_REACH + 24;
  const minX = b.minX - pad;
  const minZ = b.minZ - pad;
  const nx = Math.max(1, Math.ceil((b.maxX + pad - minX) / cell) + 1);
  const nz = Math.max(1, Math.ceil((b.maxZ + pad - minZ) / cell) + 1);
  const lists = new Map();
  const half = cell * 0.70711;
  let total = 0;
  for (let k = 0; k < stage.count - 1; k += 1) {
    const x = stage.x[k];
    const z = stage.z[k];
    // The whole segment has to count, not just the sample it starts at.
    const rad = TERRAIN_REACH + stage.halfWidth[k] + VERGE + half + stage.step;
    const rad2 = rad * rad;
    const i0 = Math.max(0, Math.floor((x - rad - minX) / cell));
    const i1 = Math.min(nx - 1, Math.floor((x + rad - minX) / cell));
    const j0 = Math.max(0, Math.floor((z - rad - minZ) / cell));
    const j1 = Math.min(nz - 1, Math.floor((z + rad - minZ) / cell));
    for (let j = j0; j <= j1; j += 1) {
      const dz = minZ + (j + 0.5) * cell - z;
      for (let i = i0; i <= i1; i += 1) {
        const dx = minX + (i + 0.5) * cell - x;
        if (dx * dx + dz * dz > rad2) continue;
        const key = j * nx + i;
        let run = lists.get(key);
        if (!run) { run = []; lists.set(key, run); }
        if (run.length && run[run.length - 1] === k - 1) run[run.length - 1] = k;
        else { run.push(k, k); total += 1; }
      }
    }
  }
  const start = new Int32Array(nx * nz + 1);
  for (const [key, run] of lists) start[key + 1] = run.length >> 1;
  for (let i = 0; i < nx * nz; i += 1) start[i + 1] += start[i];
  const runs = new Int32Array(total * 2);
  for (const [key, run] of lists) {
    let at = start[key] * 2;
    for (let i = 0; i < run.length; i += 1) { runs[at] = run[i]; at += 1; }
  }
  return { minX, minZ, cell, nx, nz, start, runs };
}

// The far field: what the ground would be at a point if every metre of road had
// a say in it, weighted by 1/distance^2. Sampled on a coarse lattice once, it
// costs a bilinear read at query time and — unlike the nearest sample — it
// cannot jump when the road that owns a place changes.
function buildAnchorField(stage) {
  const cell = ANCHOR_CELL;
  const b = stage.bounds;
  const minX = b.minX - ANCHOR_PAD;
  const minZ = b.minZ - ANCHOR_PAD;
  const nx = Math.max(2, Math.ceil((b.maxX + ANCHOR_PAD - minX) / cell) + 1);
  const nz = Math.max(2, Math.ceil((b.maxZ + ANCHOR_PAD - minZ) / cell) + 1);
  const height = new Float32Array(nx * nz);
  const dist = new Float32Array(nx * nz);
  const n = Math.ceil((stage.count - 1) / ANCHOR_DEC);
  const sx = new Float64Array(n);
  const sz = new Float64Array(n);
  const sy = new Float64Array(n);
  const rx = new Float64Array(n);
  const rz = new Float64Array(n);
  const trend = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    const i = k * ANCHOR_DEC;
    const tl = 1 / Math.max(1e-9, Math.sqrt(stage.tx[i] * stage.tx[i] + stage.tz[i] * stage.tz[i]));
    sx[k] = stage.x[i];
    sz[k] = stage.z[i];
    sy[k] = stage.y[i];
    rx[k] = stage.tz[i] * tl;
    rz[k] = -stage.tx[i] * tl;
    trend[k] = stage.hillTrend[i] * HILL_REACH;
  }
  const eps2 = ANCHOR_EPS * ANCHOR_EPS;
  for (let j = 0; j < nz; j += 1) {
    const pz = minZ + j * cell;
    for (let i = 0; i < nx; i += 1) {
      const px = minX + i * cell;
      let num = 0;
      let den = 0;
      let near = Infinity;
      for (let k = 0; k < n; k += 1) {
        const dx = px - sx[k];
        const dz = pz - sz[k];
        const d2 = dx * dx + dz * dz;
        if (d2 < near) near = d2;
        const w = 1 / (d2 + eps2);
        const lat = dx * rx[k] + dz * rz[k];
        num += w * (sy[k] + trend[k] * Math.tanh(lat / HILL_REACH));
        den += w;
      }
      height[j * nx + i] = num / den;
      dist[j * nx + i] = Math.sqrt(near);
    }
  }
  return { minX, minZ, cell, nx, nz, height, dist };
}

export function stageWorld(stage) {
  if (stage.world) return stage.world;
  const count = stage.count;
  const step = stage.step;
  const X = stage.x;
  const Y = stage.y;
  const Z = stage.z;
  const nearest = buildNearestGrid(stage);
  const reach = buildReachIndex(stage);
  const anchor = buildAnchorField(stage);
  // Unit right vector and camber sine per sample: the height field walks
  // hundreds of segments per query and cannot afford a square root in each.
  // Double precision on purpose: a float32 unit vector moves a lateral offset
  // by a centimetre 100 m out, and project() is held to a micrometre.
  const RX = new Float64Array(count);
  const RZ = new Float64Array(count);
  const SINCAM = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const inv = 1 / Math.max(1e-6, Math.sqrt(stage.tx[i] * stage.tx[i] + stage.tz[i] * stage.tz[i]));
    RX[i] = stage.tz[i] * inv;
    RZ[i] = -stage.tx[i] * inv;
    SINCAM[i] = Math.sin(stage.camber[i]);
  }
  const sepHalf2 = (SEP_NEAR.dist * 0.5) * (SEP_NEAR.dist * 0.5);
  const scanned = new Int32Array(9);
  const roadBlend = makeSurfaceScratch();
  const tmpNormal = { x: 0, y: 1, z: 0 };
  let hintIndex = 0;
  let bestD2 = Infinity;
  let bestI = 0;
  let bestT = 0;

  function scan(px, pz, lo, hi) {
    const a = lo < 0 ? 0 : lo;
    const b = hi > count - 2 ? count - 2 : hi;
    for (let i = a; i <= b; i += 1) {
      const ax = X[i];
      const az = Z[i];
      const bx = X[i + 1] - ax;
      const bz = Z[i + 1] - az;
      const qx = px - ax;
      const qz = pz - az;
      const len2 = bx * bx + bz * bz;
      let t = len2 > 1e-9 ? (qx * bx + qz * bz) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = qx - bx * t;
      const ez = qz - bz * t;
      const d = ex * ex + ez * ez;
      if (d < bestD2) { bestD2 = d; bestI = i; bestT = t; }
    }
  }

  // The fast path is taken only when it is provably exact. A hit within
  // SEP_NEAR.dist/2 of the road puts the true nearest sample within SEP_NEAR.gap
  // indices of the one found — anything further along the road is at least
  // SEP_NEAR.dist away — so a window of FAST_HALF around a hint that landed
  // within HINT_SLACK already contains it. Otherwise fall through to the grid.
  function locate(px, pz, hintS) {
    const i0 = clamp(hintS >= 0 ? Math.round(hintS / step) : hintIndex, 0, count - 2);
    bestD2 = Infinity;
    scan(px, pz, i0 - FAST_HALF, i0 + FAST_HALF);
    if (bestD2 < sepHalf2 && Math.abs(bestI - i0) <= HINT_SLACK) return;
    const gi = nearest.cellX(px);
    const gj = nearest.cellZ(pz);
    let n = 0;
    for (let oj = -1; oj <= 1; oj += 1) {
      for (let oi = -1; oi <= 1; oi += 1) {
        const si = gi + oi;
        const sj = gj + oj;
        if (si < 0 || sj < 0 || si >= nearest.nx || sj >= nearest.nz) continue;
        const cand = nearest.grid[sj * nearest.nx + si];
        if (cand < 0) continue;
        let seen = false;
        for (let k = 0; k < n; k += 1) if (Math.abs(scanned[k] - cand) <= GRID_HALF) { seen = true; break; }
        if (seen) continue;
        scanned[n] = cand;
        n += 1;
        scan(px, pz, cand - GRID_HALF, cand + GRID_HALF);
      }
    }
  }

  function lateralOf(px, pz, i, f) {
    const cx = X[i] + (X[i + 1] - X[i]) * f;
    const cz = Z[i] + (Z[i + 1] - Z[i]) * f;
    return (px - cx) * RX[i] + (pz - cz) * RZ[i];
  }

  const projScratch = { s: 0, lateral: 0, signedLateral: 0, index: 0, frac: 0 };

  function project(px, pz, hintS, out) {
    const target = out || projScratch;
    locate(px, pz, hintS === undefined || hintS === null ? -1 : hintS);
    const signed = lateralOf(px, pz, bestI, bestT);
    target.index = bestI;
    target.frac = bestT;
    target.s = (bestI + bestT) * step;
    target.signedLateral = signed;
    target.lateral = Math.abs(signed);
    hintIndex = bestI;
    return target;
  }

  function roadSurfaceY(i, f, d) {
    const hw = stage.halfWidth[i];
    const dd = d < -hw ? -hw : d > hw ? hw : d;
    return Y[i] + (Y[i + 1] - Y[i]) * f + dd * SINCAM[i];
  }

  // What one stretch of road makes of a point: the road surface itself inside
  // the corridor, the verge just outside it, then a blend out to the hillside
  // that stretch sits on. `t` is how much of that hillside has taken over, so
  // the caller can weigh one stretch against another and add the ground noise
  // once for the place rather than once per stretch.
  const field = { base: 0, t: 0, a: 0 };

  function roadField(px, pz, i, f, dist) {
    const d = lateralOf(px, pz, i, f);
    // The offset is measured across the tangent, which says nothing about how
    // far past the end of a segment the point lies: a point 50 m off the end of
    // the road sits on its centre line and was being handed the road surface.
    const a = dist > Math.abs(d) ? dist : Math.abs(d);
    const hw = stage.halfWidth[i];
    const edgeY = roadSurfaceY(i, f, d);
    field.a = a;
    if (a <= hw) { field.base = edgeY; field.t = 0; return field; }
    const u = a - hw;
    if (u <= VERGE) {
      field.base = edgeY - VERGE_DROP * smootherstep(0, VERGE, u);
      field.t = 0;
      return field;
    }
    const seamY = edgeY - VERGE_DROP;
    const anchor = Y[i] + (Y[i + 1] - Y[i]) * f + stage.hillTrend[i] * HILL_REACH * Math.tanh(d / HILL_REACH);
    const t = smootherstep(0, BLEND, u - VERGE);
    const dz = u - VERGE;
    let ditch = 0;
    if (dz < DITCH_W) {
      // Which side the cutting is on flips with the sign of the offset. Off the
      // end of a segment that sign turns over while the point stands still, so
      // fade the ditch out as the offset stops being what holds the point away
      // from the road.
      const lean = Math.abs(d) / a;
      const cutSide = stage.hillTrend[i] * sign(d) > 0 ? 1 : 0.35;
      const w = Math.sin((Math.PI * dz) / DITCH_W);
      ditch = w * w * 0.55 * cutSide * lean * lean;
    }
    field.base = seamY + (anchor - seamY) * t - ditch;
    field.t = t;
    return field;
  }

  // Anchoring the ground on the nearest sample alone put a cliff wherever two
  // passes of the road came near each other: at the medial axis between them
  // the nearest sample flips, and with it the road height the whole hillside
  // hangs from. Weighting every stretch within reach by 1/u^2 keeps the field
  // continuous — a stretch enters at zero weight at the edge of its reach and
  // dominates as you stand on it, so the road corridor is untouched — and the
  // anchor field carries the ground the rest of the way.
  const wFarField = 1 / (TERRAIN_REACH * TERRAIN_REACH);

  function heightAt(px, pz) {
    const nFar = fbm2(px * 0.0031, pz * 0.0031, stage.terrainSeed, 5) * stage.hillAmp
      + ridged2(px * 0.00105, pz * 0.00105, stage.terrainSeed + 7717, 4) * stage.ridgeAmp;
    const nNear = fbm2(px * 0.042, pz * 0.042, stage.terrainSeed + 4409, 3) * 1.15;

    let num = 0;
    let den = 0;
    let held = 0;
    let nearD2 = Infinity;
    let nearI = -1;
    let nearF = 0;
    const gi = Math.floor((px - reach.minX) / reach.cell);
    const gj = Math.floor((pz - reach.minZ) / reach.cell);
    if (gi >= 0 && gj >= 0 && gi < reach.nx && gj < reach.nz) {
      const cellIdx = gj * reach.nx + gi;
      const r0 = reach.start[cellIdx];
      const r1 = reach.start[cellIdx + 1];
      for (let r = r0; r < r1; r += 1) {
        const from = reach.runs[r * 2];
        const to = reach.runs[r * 2 + 1];
        for (let i = from; i <= to; i += 1) {
          const ax = X[i];
          const az = Z[i];
          const bx = X[i + 1] - ax;
          const bz = Z[i + 1] - az;
          const qx = px - ax;
          const qz = pz - az;
          const len2 = bx * bx + bz * bz;
          let f = len2 > 1e-9 ? (qx * bx + qz * bz) / len2 : 0;
          if (f < 0) f = 0; else if (f > 1) f = 1;
          const ex = qx - bx * f;
          const ez = qz - bz * f;
          const d2 = ex * ex + ez * ez;
          if (d2 < nearD2) { nearD2 = d2; nearI = i; nearF = f; }
          const dist = Math.sqrt(d2);
          const u = dist - stage.halfWidth[i] - VERGE;
          if (u >= TERRAIN_REACH) continue;
          const uu = u > 1e-3 ? u : 1e-3;
          const q = (TERRAIN_REACH - uu) / (TERRAIN_REACH * uu);
          const w = q * q;
          // Hold the weights rather than spending a field evaluation on each:
          // a query on the road answers from the nearest segment alone and
          // never needs them.
          if (held < HOLD_CAP) {
            holdI[held] = i;
            holdF[held] = f;
            holdW[held] = w;
            holdD[held] = dist;
            held += 1;
          } else {
            roadField(px, pz, i, f, dist);
            num += w * (field.base + field.t
              * (nFar * smoothstep(18, 150, field.a) + nNear * smoothstep(3.5, 15, field.a)));
            den += w;
          }
        }
      }
    }

    if (nearI >= 0) {
      hintIndex = nearI;
      roadField(px, pz, nearI, nearF, Math.sqrt(nearD2));
      // On the road and its verge the road is the answer, to the millimetre.
      if (field.t <= 0) return field.base;
    }
    for (let k = 0; k < held; k += 1) {
      const w = holdW[k];
      roadField(px, pz, holdI[k], holdF[k], holdD[k]);
      num += w * (field.base + field.t
        * (nFar * smoothstep(18, 150, field.a) + nNear * smoothstep(3.5, 15, field.a)));
      den += w;
    }

    // How much ground noise a place carries depends on how far it is from any
    // road. Inside the reach that distance is exact; the lattice only has to
    // carry it further out, so hand over well before the exact one runs out.
    let dFar = anchorDist(px, pz);
    if (nearI >= 0) {
      const dn = Math.sqrt(nearD2);
      dFar = dn + (dFar - dn) * smoothstep(TERRAIN_REACH * 0.6, TERRAIN_REACH * 0.9, dn);
    }
    const far = anchorHeight(px, pz)
      + nFar * smoothstep(18, 150, dFar) + nNear * smoothstep(3.5, 15, dFar);
    return (num + wFarField * far) / (den + wFarField);
  }

  function anchorLerp(data, px, pz) {
    let fx = (px - anchor.minX) / anchor.cell;
    let fz = (pz - anchor.minZ) / anchor.cell;
    if (fx < 0) fx = 0; else if (fx > anchor.nx - 1) fx = anchor.nx - 1;
    if (fz < 0) fz = 0; else if (fz > anchor.nz - 1) fz = anchor.nz - 1;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i > anchor.nx - 2) i = anchor.nx - 2;
    if (j > anchor.nz - 2) j = anchor.nz - 2;
    const tx = fx - i;
    const tz = fz - j;
    const row = j * anchor.nx + i;
    const a = data[row];
    const b = data[row + 1];
    const c = data[row + anchor.nx];
    const d = data[row + anchor.nx + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  function anchorHeight(px, pz) { return anchorLerp(anchor.height, px, pz); }
  function anchorDist(px, pz) { return anchorLerp(anchor.dist, px, pz); }

  function normalAt(px, pz, out) {
    const target = out || tmpNormal;
    locate(px, pz, -1);
    const i = bestI;
    hintIndex = i;
    const d = lateralOf(px, pz, i, bestT);
    const a = Math.abs(d);
    const hw = stage.halfWidth[i];
    const edge = smoothstep(hw, hw + BLEND * 0.6, a);
    let nx = stage.nx[i];
    let ny = stage.ny[i];
    let nz = stage.nz[i];
    if (edge > 0) {
      const e = 0.75;
      const h0 = heightAt(px, pz);
      const gx = (heightAt(px + e, pz) - h0) / e;
      const gz = (heightAt(px, pz + e) - h0) / e;
      const inv = 1 / Math.sqrt(gx * gx + gz * gz + 1);
      nx += (-gx * inv - nx) * edge;
      ny += (inv - ny) * edge;
      nz += (-gz * inv - nz) * edge;
    }
    const inv = 1 / Math.max(1e-9, Math.sqrt(nx * nx + ny * ny + nz * nz));
    target.x = nx * inv;
    target.y = ny * inv;
    target.z = nz * inv;
    return target;
  }

  function surfaceAt(px, pz, out) {
    locate(px, pz, out && out.owned ? out.s : -1);
    const i = bestI;
    const f = bestT;
    const d = lateralOf(px, pz, i, f);
    const a = Math.abs(d);
    const hw = stage.halfWidth[i];
    const edge = smoothstep(hw - 0.35, hw + 1.6, a);
    blendSurface(surfaceProps(stage.surface[i]), surfaceProps(stage.surfaceAlt[i]), stage.surfaceMixT[i], roadBlend);
    // out.props is created once per caller-owned out object, never per call: one
    // shared module scratch would alias across the four wheel queries.
    if (!out.props || !out.props.owned) out.props = makeSurfaceScratch();
    blendSurface(roadBlend, surfaceProps(stage.verge[i]), edge, out.props);
    out.surfaceId = out.props.id;
    out.onRoad = a <= hw;
    out.lateral = a;
    out.signedLateral = d;
    out.s = (i + f) * step;
    out.index = i;
    out.edgeBlend = edge;
    out.owned = true;
    const gx = Math.floor(px * 0.8) | 0;
    const gz = Math.floor(pz * 0.8) | 0;
    out.roughness = saturate(out.props.roughness + (hash2(gx, gz, stage.terrainSeed) - 0.5) * 0.22 + edge * 0.3);
    const line = -sign(stage.curvature[i]) * hw * 0.35;
    const w = hw * 0.55 + 0.6;
    const q = (d - line) / w;
    out.ruts = saturate(out.props.looseDepth * Math.exp(-q * q) * (1 - edge) * 1.15);
    hintIndex = i;
    return out;
  }

  function sampleAt(s) {
    return clamp(Math.round(s / step), 0, count - 1);
  }

  return {
    gravity: G,
    heightAt,
    normalAt,
    surfaceAt,
    sampleAt,
    project,
    bounds: stage.bounds,
  };
}

// --- frames ---------------------------------------------------------------

function buildFrames(stage) {
  const n = stage.count;
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const tz = new Float32Array(n);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = i === 0 ? 0 : i - 1;
    const b = i === n - 1 ? n - 1 : i + 1;
    const dx = stage.x[b] - stage.x[a];
    const dz = stage.z[b] - stage.z[a];
    const len = Math.max(1e-9, Math.sqrt(dx * dx + dz * dz));
    const g = stage.grade[i];
    const c = Math.sqrt(Math.max(0, 1 - g * g));
    const hx = (dx / len) * c;
    const hz = (dz / len) * c;
    tx[i] = hx;
    ty[i] = g;
    tz[i] = hz;
    const rl = Math.max(1e-9, Math.sqrt(hx * hx + hz * hz));
    const cam = stage.camber[i];
    const cc = Math.cos(cam);
    const rx = (hz / rl) * cc;
    const ry = Math.sin(cam);
    const rz = (-hx / rl) * cc;
    let vx = g * rz - hz * ry;
    let vy = hz * rx - hx * rz;
    let vz = hx * ry - g * rx;
    const inv = 1 / Math.max(1e-9, Math.sqrt(vx * vx + vy * vy + vz * vz));
    nx[i] = vx * inv;
    ny[i] = vy * inv;
    nz[i] = vz * inv;
  }
  stage.tx = tx;
  stage.ty = ty;
  stage.tz = tz;
  stage.nx = nx;
  stage.ny = ny;
  stage.nz = nz;
}

// --- reverse direction ----------------------------------------------------

function flipF32(arr, negate) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = negate ? -arr[n - 1 - i] : arr[n - 1 - i];
  return out;
}

function flipU8(arr) {
  const n = arr.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = arr[n - 1 - i];
  return out;
}

// Running a stage the other way is the same road, so the geometry is mirrored
// rather than regenerated — that is what makes a reverse stage feel like the
// place you already know, driven backwards.
function reverseGeometry(stage, corners) {
  const n = stage.count;
  const L = stage.length;
  stage.x = flipF32(stage.x, false);
  stage.y = flipF32(stage.y, false);
  stage.z = flipF32(stage.z, false);
  stage.curvature = flipF32(stage.curvature, true);
  stage.grade = flipF32(stage.grade, true);
  stage.camber = flipF32(stage.camber, true);
  stage.halfWidth = flipF32(stage.halfWidth, false);
  stage.hillTrend = flipF32(stage.hillTrend, true);
  stage.surfaceMixT = flipF32(stage.surfaceMixT, false);
  stage.surface = flipU8(stage.surface);
  stage.surfaceAlt = flipU8(stage.surfaceAlt);
  stage.verge = flipU8(stage.verge);
  void n;
  const out = [];
  for (let i = corners.length - 1; i >= 0; i -= 1) {
    const c = corners[i];
    out.push({ ...c, s: L - c.sEnd, sEnd: L - c.s, dir: -c.dir });
  }
  return out;
}

// --- features -------------------------------------------------------------

function buildFeatures(stage, corners, sections, phrases) {
  const feats = [];
  for (const c of corners) {
    if (c.kind === "hairpin") feats.push({ s: c.s, kind: "hairpin", severity: 1, meta: { dir: c.dir, radius: c.radius } });
    else if (c.kind === "square") feats.push({ s: c.s, kind: "junction", severity: 1, meta: { dir: c.dir } });
    else if (c.kind === "chicane") feats.push({ s: c.s, kind: "chicane", severity: 4, meta: { dir: c.dir } });
    if (c.bank < 0) {
      feats.push({ s: c.s, kind: "offCamber", severity: c.severity, meta: { dir: c.dir, bank: c.bank } });
    }
  }
  for (const idx of peaksOf(stage.jump, stage.count, 0.10)) {
    feats.push({ s: idx * stage.step, kind: "jump", severity: 1 + Math.round(stage.jump[idx] * 4), meta: { strength: stage.jump[idx] } });
  }
  for (const idx of peaksOf(stage.crest, stage.count, 0.32)) {
    if (stage.jump[idx] > 0.10) continue;
    feats.push({ s: idx * stage.step, kind: "crest", severity: 1 + Math.round(stage.crest[idx] * 3), meta: { lift: stage.crest[idx] } });
  }
  for (const sec of sections) {
    if (sec.kind === "ford") feats.push({ s: (sec.s0 + sec.s1) * 0.5, kind: "ford", severity: 3, meta: {} });
  }
  for (const ph of phrases) {
    if (ph.bridge) feats.push({ s: ph.bridgeS, kind: "bridge", severity: 3, meta: {} });
    if (ph.tunnel) feats.push({ s: ph.tunnelS, kind: "tunnel", severity: 2, meta: { length: ph.tunnelLen } });
  }
  // Narrows: a local minimum of the road width that is genuinely tight.
  for (let i = 6; i < stage.count - 6; i += 1) {
    if (stage.halfWidth[i] > 3.0) continue;
    if (stage.halfWidth[i] > stage.halfWidth[i - 4] || stage.halfWidth[i] > stage.halfWidth[i + 4]) continue;
    const s = i * stage.step;
    if (feats.some((f) => f.kind === "narrows" && Math.abs(f.s - s) < 120)) continue;
    feats.push({ s, kind: "narrows", severity: 2, meta: { halfWidth: stage.halfWidth[i] } });
  }
  feats.sort((a, b) => a.s - b.s);
  return feats;
}

// --- scenery --------------------------------------------------------------

function rightVec(stage, i, out) {
  const hx = stage.tx[i];
  const hz = stage.tz[i];
  const inv = 1 / Math.max(1e-9, Math.sqrt(hx * hx + hz * hz));
  out.x = hz * inv;
  out.z = -hx * inv;
  return out;
}

const rvec = { x: 0, z: 0 };
const clearProbe = { s: 0, lateral: 0, signedLateral: 0, index: 0, frac: 0 };

// A candidate's lateral offset is measured from the one sample it was built
// from, which says nothing about a different part of the road passing nearby:
// the separation rules let the road come back within 16 m of itself while
// scenery reaches 140 m out, so a tree thrown wide lands on the road you drive
// two minutes later. Ask the world where the road actually is. The verge is
// included because a car that runs wide ends up on it.
const SCENERY_CLEAR = 2.2;

function roadClear(stage, world, px, pz) {
  const p = world.project(px, pz, -1, clearProbe);
  return p.lateral > stage.halfWidth[p.index] + SCENERY_CLEAR;
}

function phraseAt(phrases, s) {
  for (const p of phrases) if (s >= p.s0 && s <= p.s1) return p;
  return phrases[phrases.length - 1];
}

function buildScenery(stage, world, rng, params, phrases) {
  const items = [];
  const step = stage.step;
  const stride = 3;
  const clearExtra = 5.0;
  for (let i = 0; i < stage.count - 1; i += stride) {
    const s = i * step;
    const ph = phraseAt(phrases, s);
    const hw = stage.halfWidth[i];
    rightVec(stage, i, rvec);
    const cx = stage.x[i];
    const cz = stage.z[i];
    const open = ph.phrase.open ? 0.35 : 1;
    const forest = ph.phrase.forest ? 1.5 : 1;
    for (let c = 0; c < 18; c += 1) {
      const side = rng.chance(0.5) ? 1 : -1;
      const lat = side * (hw + clearExtra + rng.next() * rng.next() * 135);
      const along = rng.range(-stride * step * 0.5, stride * step * 0.5);
      const px = cx + rvec.x * lat + stage.tx[i] * along;
      const pz = cz + rvec.z * lat + stage.tz[i] * along;
      const stand = fbm2(px * 0.0062, pz * 0.0062, stage.terrainSeed + 991, 3);
      const density = saturate(0.42 + stand * 0.85) * params.treeDensity * open * forest;
      if (!rng.chance(density * 0.55)) continue;
      if (!roadClear(stage, world, px, pz)) continue;
      const h = world.heightAt(px, pz);
      const gx = world.heightAt(px + 1.2, pz) - h;
      const gz = world.heightAt(px, pz + 1.2) - h;
      const slope = Math.sqrt(gx * gx + gz * gz) / 1.2;
      const northness = saturate(0.5 + gz / 1.2);
      const yaw = rng.range(0, Math.PI * 2);
      if (slope > 0.62) {
        items.push({ kind: "rock", x: px, y: h, z: pz, yaw, scale: rng.range(0.6, 2.4), variant: rng.int(0, 2) });
        continue;
      }
      if (h > params.treeline) {
        if (rng.chance(0.25)) items.push({ kind: "bush", x: px, y: h, z: pz, yaw, scale: rng.range(0.4, 0.9), variant: rng.int(0, 1) });
        continue;
      }
      const treeP = saturate(0.45 + 0.55 * northness) * (1 - saturate((h - params.treeline + 120) / 120) * 0.8);
      if (rng.chance(treeP)) {
        const variant = rng.chance(params.conifer ?? 0.6) ? 0 : (rng.chance(0.92) ? 1 : 2);
        items.push({ kind: "tree", x: px, y: h, z: pz, yaw, scale: rng.range(0.72, 1.55), variant });
      } else if (rng.chance(0.4)) {
        items.push({ kind: "bush", x: px, y: h, z: pz, yaw, scale: rng.range(0.5, 1.1), variant: rng.int(0, 1) });
      }
    }
  }
  // Telegraph poles march along the road wherever the road is a public one.
  const poleSpacing = 38;
  let poleSide = rng.chance(0.5) ? 1 : -1;
  for (let s = 60; s < stage.length - 60; s += poleSpacing) {
    const ph = phraseAt(phrases, s);
    if (!ph.phrase.poles) continue;
    const i = clamp(Math.round(s / step), 0, stage.count - 2);
    rightVec(stage, i, rvec);
    const lat = poleSide * (stage.halfWidth[i] + rng.range(4.5, 7.5));
    const px = stage.x[i] + rvec.x * lat;
    const pz = stage.z[i] + rvec.z * lat;
    if (!roadClear(stage, world, px, pz)) continue;
    items.push({ kind: "pole", x: px, y: world.heightAt(px, pz), z: pz, yaw: Math.atan2(stage.tx[i], stage.tz[i]), scale: rng.range(0.94, 1.06), variant: 0 });
    if (rng.chance(0.06)) poleSide = -poleSide;
  }
  // Buildings gather where roads meet, and a lone barn out in the fields.
  for (const ph of phrases) {
    const junction = ph.phrase.junction;
    const count = junction ? rng.int(5, 9) : (rng.chance(0.45) ? rng.int(1, 2) : 0);
    for (let b = 0; b < count; b += 1) {
      const s = rng.range(ph.s0 + 20, Math.max(ph.s0 + 30, ph.s1 - 20));
      const i = clamp(Math.round(s / step), 0, stage.count - 2);
      rightVec(stage, i, rvec);
      const lat = (rng.chance(0.5) ? 1 : -1) * (stage.halfWidth[i] + rng.range(9, junction ? 26 : 60));
      const px = stage.x[i] + rvec.x * lat;
      const pz = stage.z[i] + rvec.z * lat;
      if (!roadClear(stage, world, px, pz)) continue;
      const h = world.heightAt(px, pz);
      const gx = world.heightAt(px + 2, pz) - h;
      const gz = world.heightAt(px, pz + 2) - h;
      if (Math.sqrt(gx * gx + gz * gz) / 2 > 0.28) continue;
      items.push({
        kind: "building", x: px, y: h, z: pz,
        yaw: Math.atan2(stage.tx[i], stage.tz[i]) + rng.range(-0.5, 0.5),
        scale: rng.range(0.85, 1.35),
        variant: junction ? rng.int(0, 2) : 0,
      });
    }
  }
  return items;
}

// --- props ----------------------------------------------------------------

function pushProp(list, stage, world, s, lat, kind, variant, yawOffset, scale) {
  const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
  rightVec(stage, i, rvec);
  const px = stage.x[i] + rvec.x * lat;
  const pz = stage.z[i] + rvec.z * lat;
  const heading = Math.atan2(stage.tx[i], stage.tz[i]);
  const onRoad = Math.abs(lat) <= stage.halfWidth[i];
  const y = onRoad ? stage.y[i] + lat * Math.sin(stage.camber[i]) : world.heightAt(px, pz);
  list.push({ kind, x: px, y, z: pz, yaw: heading + yawOffset, scale, variant, s });
}

function buildProps(stage, world, rng, corners, features, phrases) {
  const props = [];
  pushProp(props, stage, world, 2, 0, "startGantry", 0, 0, 1);
  pushProp(props, stage, world, 6, -(stage.halfWidth[1] + 3), "banner", 0, Math.PI, 1);
  pushProp(props, stage, world, stage.length - 4, 0, "finishGantry", 0, 0, 1);
  for (let s = 1000; s < stage.length - 200; s += 1000) {
    const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
    pushProp(props, stage, world, s, stage.halfWidth[i] + 2.2, "distanceBoard", Math.round(s / 1000), Math.PI, 1);
  }
  for (const c of corners) {
    if (c.severity > 5) continue;
    const i = clamp(Math.round(c.s / stage.step), 0, stage.count - 2);
    const outside = -c.dir;
    const n = clamp(7 - c.severity, 1, 5);
    const mid = (c.s + c.sEnd) * 0.5;
    // Boards sit on the outside of the corner, square to the approach.
    for (let b = 0; b < (c.severity <= 2 ? 3 : 2); b += 1) {
      const s = lerp(c.s - 6, mid, b / 2);
      const j = clamp(Math.round(s / stage.step), 0, stage.count - 2);
      pushProp(props, stage, world, s, outside * (stage.halfWidth[j] + 1.6), "chevron", n, Math.PI, 1);
    }
    void i;
    if (c.kind === "square" || c.kind === "hairpin") {
      for (let b = 0; b < 4; b += 1) {
        const s = lerp(c.s, c.sEnd, b / 3);
        const j = clamp(Math.round(s / stage.step), 0, stage.count - 2);
        pushProp(props, stage, world, s, c.dir * (stage.halfWidth[j] + 1.1), "hayBale", rng.int(0, 1), 0, 1);
      }
    }
  }
  for (const f of features) {
    if (f.kind === "hairpin" || f.kind === "jump") {
      const cluster = rng.int(f.kind === "jump" ? 14 : 8, f.kind === "jump" ? 34 : 20);
      const side = rng.chance(0.5) ? 1 : -1;
      for (let k = 0; k < cluster; k += 1) {
        const s = f.s + rng.range(-30, 45);
        const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
        const lat = side * (stage.halfWidth[i] + rng.range(4.5, 14));
        pushProp(props, stage, world, s, lat, "spectator", rng.int(0, 5), rng.range(-3, 3), rng.range(0.94, 1.06));
      }
      for (let k = 0; k < 8; k += 1) {
        const s = f.s - 30 + k * 10;
        const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
        pushProp(props, stage, world, s, side * (stage.halfWidth[i] + 3.4), "tape", 0, 0, 1);
      }
    }
    if (f.kind === "ford" || f.kind === "bridge" || f.kind === "junction") {
      pushProp(props, stage, world, f.s - 14, stage.halfWidth[clamp(Math.round(f.s / stage.step), 0, stage.count - 2)] + 2.6, "marshal", 0, Math.PI, 1);
    }
    if (f.kind === "junction") {
      for (let k = 0; k < 5; k += 1) {
        const s = f.s - 20 + k * 10;
        const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
        pushProp(props, stage, world, s, stage.halfWidth[i] + 1.4, "bunting", k, 0, 1);
      }
    }
  }
  for (let s = 1800; s < stage.length - 300; s += 1800) {
    const i = clamp(Math.round(s / stage.step), 0, stage.count - 2);
    pushProp(props, stage, world, s, -(stage.halfWidth[i] + 2.4), "marshal", 0, Math.PI, 1);
  }
  void phrases;
  props.sort((a, b) => a.s - b.s);
  return props;
}

// --- generation -----------------------------------------------------------

const DEFAULTS = {
  length: 9000,
  lengthBand: null,
  surface: SURFACE.GRAVEL,
  personality: "mixed",
  width: 4.4,
  jumps: [2, 4],
  netClimb: 0,
  baseAltitude: 220,
  hillAmp: 34,
  ridgeAmp: 20,
  hillTrendAmp: 0.55,
  treeline: 900,
  treeDensity: 0.55,
  conifer: 0.6,
  vergeSurface: SURFACE.GRASS,
  cutSurface: SURFACE.ROCK,
  icePatches: false,
  dirtPatches: true,
  offCamber: 0.13,
  forceTechnical: true,
  reverse: false,
};

// A jump that always ends the run is a bug, so each one is measured against a
// ballistic landing and either sharpened until it flies or softened until the
// car survives it.
function tuneJumps(draft, events, speed) {
  const step = draft.step;
  let settled = true;
  for (const ev of events) {
    if (ev.kind !== "jump") continue;
    const i0 = clamp(Math.round((ev.s - 12) / step), 1, draft.count - 2);
    const i1 = clamp(Math.round((ev.s + ev.trans + 40) / step), 1, draft.count - 2);
    let best = 0;
    let bi = i0;
    for (let i = i0; i <= i1; i += 1) if (draft.jump[i] > best) { best = draft.jump[i]; bi = i; }
    if (best < 0.20 && ev.trans > 13.5) {
      ev.trans *= 0.86;
      ev.down = clamp(ev.down * 1.05, -MAX_GRADE, -0.05);
      settled = false;
      continue;
    }
    const land = jumpLanding(draft, bi, speed[bi]);
    if (land.closing > 10.5) {
      ev.trans *= 1.16;
      ev.down *= 0.88;
      ev.up *= 0.9;
      settled = false;
    }
  }
  return settled;
}

function attemptLayout(seed, params, attempt, enforceBand) {
  const rng = makeRng(stringSeed(String(seed) + "/layout/" + attempt));
  const prog = composeProgramme(rng, params);
  // Phrases are emitted whole, so a programme runs past its target by up to one
  // of them. The book declares the band the road has to land in; rejecting here
  // costs only the knot maths. The band is ignored once a caller has overridden
  // `length` out of it, because then it plainly belongs to a different road.
  const band = params.lengthBand;
  if (enforceBand && band
    && params.length >= band[0] && params.length <= band[1]
    && (prog.length < band[0] || prog.length > band[1])) return null;
  const step = STEP;
  const count = Math.max(128, Math.round(prog.length / step) + 1);
  const curvature = sampleCurvature(prog.knots, count, step);
  const halfWidth = buildWidth(prog, count, step, rng, params);
  const sectionInfo = buildSections(prog, rng, params);
  const surf = buildSurface(sectionInfo, count, step);
  const events = placeElevationEvents(rng, prog, params);

  const draft = {
    count, step, curvature, halfWidth,
    surface: surf.primary,
    camber: new Float32Array(count),
    grade: new Float32Array(count),
    y: new Float64Array(count),
    crest: new Float32Array(count),
    jump: new Float32Array(count),
  };
  let speed = null;
  for (let pass = 0; pass < 7; pass += 1) {
    const knots = buildGradeKnots(prog, events, params);
    draft.grade = sampleGrade(knots, count, step);
    draft.y = integrateElevation(draft.grade, count, step, params.baseAltitude);
    draft.camber = new Float32Array(count);
    const v0 = speedProfile(draft);
    draft.camber = buildCamber(prog, curvature, v0, count, step);
    speed = speedProfile(draft);
    const air = buildAirfield(draft.grade, speed, count, step);
    draft.crest = air.crest;
    draft.jump = air.jump;
    if (tuneJumps(draft, events, speed)) break;
  }

  const geo = integrateGeometry(curvature, draft.grade, draft.y, count, step, rng.range(0, Math.PI * 2));
  if (selfIntersects(geo.x, geo.z, count)) return null;

  return { rng, prog, draft, geo, sectionInfo, surf, speed, count, step };
}

export function generateStage(seed, options = {}) {
  const params = { ...DEFAULTS, ...options };
  params.seed = seed;
  params.widthSeed = stringSeed(String(seed) + "/width") % 100000;
  const terrainSeed = stringSeed(String(seed) + "/terrain") % 65536;

  // Self-intersection rejects far more programmes than the band does, so the
  // banded round needs a budget several times the plain one to find a road that
  // clears both.
  let laid = null;
  for (let attempt = 0; attempt < 96 && !laid; attempt += 1) {
    laid = attemptLayout(seed, params, attempt, true);
  }
  // A road that wanders is worth more than one of exactly the advertised length,
  // so if no in-band programme also cleared the self-intersection rules, take the
  // best road of any length rather than refusing to build the stage.
  for (let attempt = 0; attempt < 32 && !laid; attempt += 1) {
    laid = attemptLayout(seed, params, attempt, false);
  }
  if (!laid) throw new Error("stage layout did not converge for seed " + seed);

  const { prog, draft, geo, sectionInfo, surf, count, step } = laid;
  const length = (count - 1) * step;
  const decorate = makeRng(stringSeed(String(seed) + "/decor"));

  const s = new Float32Array(count);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const hillTrend = new Float32Array(count);
  const verge = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    s[i] = i * step;
    x[i] = geo.x[i];
    y[i] = draft.y[i];
    z[i] = geo.z[i];
    hillTrend[i] = clamp(fbm2(i * step * 0.0013, 5.5, terrainSeed + 31, 3) * params.hillTrendAmp * 1.6, -0.62, 0.62);
    let v = params.vergeSurface;
    const id = surf.primary[i];
    if (id === SURFACE.SNOW || id === SURFACE.ICE) v = SURFACE.SNOW;
    else if (id === SURFACE.SAND) v = SURFACE.SAND;
    for (const sec of sectionInfo.sections) {
      if (sec.kind === "cutting" && s[i] >= sec.s0 && s[i] <= sec.s1) v = params.cutSurface;
    }
    verge[i] = v;
  }
  const hillSmooth = smoothArray(hillTrend, 18);

  const stage = {
    id: params.id || String(seed),
    name: params.name || "Unnamed Stage",
    country: params.country || "Unmapped",
    region: params.region || "",
    rally: params.rally || "",
    seed: String(seed),
    notes: params.notes || "",
    weather: params.weather || "clear",
    timeOfDay: params.timeOfDay || "day",
    personality: params.personality,
    reverse: !!params.reverse,
    length,
    step,
    count,
    s, x, y, z,
    curvature: draft.curvature,
    grade: draft.grade,
    camber: draft.camber,
    halfWidth: draft.halfWidth,
    surface: surf.primary,
    surfaceAlt: surf.alt,
    surfaceMixT: surf.mixT,
    verge,
    hillTrend: hillSmooth,
    crest: draft.crest,
    jump: draft.jump,
    terrainSeed,
    hillAmp: params.hillAmp,
    ridgeAmp: params.ridgeAmp,
  };

  let corners = prog.corners;
  if (params.reverse) corners = reverseGeometry(stage, corners);
  buildFrames(stage);

  const designSpeed = speedProfile(stage);
  const air = buildAirfield(stage.grade, designSpeed, count, step);
  stage.crest = air.crest;
  stage.jump = air.jump;
  stage.designSpeed = designSpeed;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i += 1) {
    if (x[i] < minX) minX = x[i];
    if (x[i] > maxX) maxX = x[i];
    if (z[i] < minZ) minZ = z[i];
    if (z[i] > maxZ) maxZ = z[i];
  }
  const margin = 240;
  stage.bounds = { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };

  const phrases = prog.spans.map((sp) => (params.reverse
    ? { s0: length - sp.s1, s1: length - sp.s0, name: sp.name, phrase: sp.phrase }
    : { s0: sp.s0, s1: sp.s1, name: sp.name, phrase: sp.phrase }));
  phrases.sort((a, b) => a.s0 - b.s0);
  const sections = sectionInfo.sections.map((sec) => (params.reverse
    ? { ...sec, s0: length - sec.s1, s1: length - sec.s0 }
    : sec));
  for (const ph of phrases) {
    if (ph.phrase.ford && decorate.chance(0.4)) {
      ph.bridge = true;
      ph.bridgeS = (ph.s0 + ph.s1) * 0.5;
    }
    if (params.tunnels && ph.phrase.cutting && decorate.chance(0.5)) {
      ph.tunnel = true;
      ph.tunnelS = (ph.s0 + ph.s1) * 0.5;
      ph.tunnelLen = decorate.range(40, 110);
    }
  }
  stage.corners = corners;
  stage.phrases = phrases;
  stage.features = buildFeatures(stage, corners, sections, phrases);
  stage.splits = [length / 3, (length * 2) / 3];

  const counts = new Map();
  for (let i = 0; i < count; i += 1) counts.set(surf.primary[i], (counts.get(surf.primary[i]) || 0) + 1);
  stage.surfaceMix = [...counts.entries()]
    .filter((e) => e[1] / count > 0.02)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);

  // Read the stage's own arrays, not the locals: `reverseGeometry` replaced them,
  // so the locals still hold the forward road and would put the start line of a
  // reverse stage at the far end of it.
  stage.start = { x: stage.x[0], y: stage.y[0], z: stage.z[0], yaw: Math.atan2(stage.tx[0], stage.tz[0]) };
  stage.finish = { s: length, x: stage.x[count - 1], y: stage.y[count - 1], z: stage.z[count - 1] };

  const world = stageWorld(stage);
  stage.world = world;
  stage.scenery = buildScenery(stage, world, makeRng(stringSeed(String(seed) + "/scenery")), params, phrases);
  stage.props = buildProps(stage, world, makeRng(stringSeed(String(seed) + "/props")), corners, stage.features, phrases);
  return stage;
}

// --- the stage book -------------------------------------------------------

const VASTERKLOFT = { country: "Vasterkloft", rally: "Rally Vasterkloft", region: "Norra Kloft" };
const ALVENDA = { country: "Alvenda", rally: "Rally Alvenda", region: "Sierra Alvenda" };
const NORTHMARCH = { country: "Northmarch", rally: "Northmarch Forest Rally", region: "Kestrel Wolds" };
const TAMAROSA = { country: "Tamarosa", rally: "Rally Tamarosa", region: "Llano Escarpa" };
const VARDHAL = { country: "Vardhal", rally: "Isle of Vardhal Rally", region: "Havnvik Sound" };

export const STAGE_BOOK = Object.freeze([
  {
    id: "kloft-bjornhalt",
    name: "Bjornhalt",
    ...VASTERKLOFT,
    seed: "vasterkloft/bjornhalt",
    lengthBand: [11500, 12500],
    surfaceLabel: "Fast forest gravel",
        // The first stage anyone drives. It shipped overcast, which is by design
        // the flattest-lit sky in the book (shadowStrength 0.28) — nothing to read
        // the shape of the road by. A low raking sun is the one that sells gravel.
    weather: "golden-hour",
    timeOfDay: "morning",
    personality: "flowing",
    notes: "Long, cold and committed. Fourth-gear crests between the pines, then a plateau that goes on longer than you dare.",
    params: {
      length: 12100, surface: SURFACE.GRAVEL, personality: "flowing", width: 4.6,
      jumps: [3, 5], netClimb: 90, baseAltitude: 340, hillAmp: 40, ridgeAmp: 24,
      treeline: 620, treeDensity: 0.72, conifer: 0.86, icePatches: true, offCamber: 0.12,
    },
  },
  {
    id: "kloft-bjornhalt-rev",
    name: "Bjornhalt Reverse",
    ...VASTERKLOFT,
    seed: "vasterkloft/bjornhalt",
    mirrorOf: "kloft-bjornhalt",
    lengthBand: [11500, 12500],
    surfaceLabel: "Fast forest gravel",
    weather: "light-snow",
    timeOfDay: "dusk",
    personality: "flowing",
    notes: "The same road with the plateau first and the descent last, in failing light. The crests you took blind now arrive downhill.",
    params: {
      length: 12100, surface: SURFACE.GRAVEL, personality: "flowing", width: 4.6,
      jumps: [3, 5], netClimb: 90, baseAltitude: 340, hillAmp: 40, ridgeAmp: 24,
      treeline: 620, treeDensity: 0.72, conifer: 0.86, icePatches: true, offCamber: 0.12,
      reverse: true,
    },
  },
  {
    id: "kloft-skarvedal",
    name: "Skarvedal",
    ...VASTERKLOFT,
    seed: "vasterkloft/skarvedal",
    lengthBand: [8000, 9000],
    surfaceLabel: "Narrow gravel, ice in the shade",
    weather: "light-snow",
    timeOfDay: "morning",
    personality: "twisty",
    notes: "Tight, dark and mean. Two shaded hairpins hold ice all day and the trees stand where the ditch ends.",
    params: {
      length: 8500, surface: SURFACE.GRAVEL, personality: "twisty", width: 3.7,
      jumps: [2, 3], netClimb: 40, baseAltitude: 410, hillAmp: 34, ridgeAmp: 26,
      treeline: 660, treeDensity: 0.85, conifer: 0.92, icePatches: true, offCamber: 0.18,
    },
  },
  {
    id: "alvenda-calderas",
    name: "Puerto Calderas",
    ...ALVENDA,
    seed: "alvenda/calderas",
    lengthBand: [10800, 11800],
    surfaceLabel: "Mountain tarmac",
    weather: "midday-hard",
    timeOfDay: "midday",
    personality: "technical",
    notes: "Hairpin after hairpin up the pass, a cutting through the old quarry, then a descent that keeps shutting down on you.",
    params: {
      length: 11300, surface: SURFACE.TARMAC, personality: "technical", width: 3.9,
      jumps: [2, 3], netClimb: 260, baseAltitude: 780, hillAmp: 58, ridgeAmp: 44,
      treeline: 1150, treeDensity: 0.32, conifer: 0.35, cutSurface: SURFACE.ROCK,
      dirtPatches: false, offCamber: 0.16, tunnels: true, vergeSurface: SURFACE.ROCK,
    },
  },
  {
    id: "alvenda-calderas-rev",
    name: "Puerto Calderas Descent",
    ...ALVENDA,
    seed: "alvenda/calderas",
    mirrorOf: "alvenda-calderas",
    lengthBand: [10800, 11800],
    surfaceLabel: "Mountain tarmac",
    weather: "thunderstorm",
    timeOfDay: "evening",
    personality: "technical",
    notes: "Down the pass with the brakes cooking. Every hairpin you climbed now arrives with the nose light.",
    params: {
      length: 11300, surface: SURFACE.TARMAC, personality: "technical", width: 3.9,
      jumps: [2, 3], netClimb: 260, baseAltitude: 780, hillAmp: 58, ridgeAmp: 44,
      treeline: 1150, treeDensity: 0.32, conifer: 0.35, cutSurface: SURFACE.ROCK,
      dirtPatches: false, offCamber: 0.16, tunnels: true, vergeSurface: SURFACE.ROCK,
      reverse: true,
    },
  },
  {
    id: "alvenda-ondas",
    name: "Mirador Ondas",
    ...ALVENDA,
    seed: "alvenda/ondas",
    lengthBand: [7000, 7800],
    surfaceLabel: "Sealed ridge road",
    weather: "clear-dawn",
    timeOfDay: "sunrise",
    personality: "fast",
    notes: "A ridge road with nothing either side of it. Fifth gear, one board on the outside, and a very long way down.",
    params: {
      length: 7400, surface: SURFACE.TARMAC, personality: "fast", width: 4.4,
      jumps: [2, 4], netClimb: -140, baseAltitude: 940, hillAmp: 66, ridgeAmp: 52,
      treeline: 1050, treeDensity: 0.22, conifer: 0.3, dirtPatches: false,
      offCamber: 0.1, vergeSurface: SURFACE.ROCK, cutSurface: SURFACE.ROCK,
    },
  },
  {
    id: "northmarch-kestrel",
    name: "Kestrel Beck",
    ...NORTHMARCH,
    seed: "northmarch/kestrel",
    lengthBand: [9000, 10000],
    surfaceLabel: "Wet forest gravel",
    weather: "light-rain",
    timeOfDay: "afternoon",
    personality: "twisty",
    notes: "Wet, narrow and rutted, with a beck to splash through halfway and mud where the sun never gets in.",
    params: {
      length: 9400, surface: SURFACE.GRAVEL, personality: "twisty", width: 3.6,
      jumps: [2, 3], netClimb: 55, baseAltitude: 180, hillAmp: 26, ridgeAmp: 14,
      treeline: 520, treeDensity: 0.9, conifer: 0.55, offCamber: 0.2,
    },
  },
  {
    id: "northmarch-harrowfen",
    name: "Harrowfen Drift",
    ...NORTHMARCH,
    seed: "northmarch/harrowfen",
    lengthBand: [12800, 13800],
    surfaceLabel: "Open moorland gravel",
    weather: "clear-dawn",
    timeOfDay: "midday",
    personality: "flowing",
    notes: "Out of the trees and onto the moor: long fifth-gear curves, three jumps on the old drove road, one village to thread.",
    params: {
      length: 13300, surface: SURFACE.GRAVEL, personality: "flowing", width: 4.9,
      jumps: [3, 5], netClimb: -60, baseAltitude: 210, hillAmp: 30, ridgeAmp: 12,
      treeline: 300, treeDensity: 0.34, conifer: 0.4, offCamber: 0.12,
    },
  },
  {
    id: "tamarosa-rioseca",
    name: "Rio Seca",
    ...TAMAROSA,
    seed: "tamarosa/rioseca",
    lengthBand: [13400, 14200],
    surfaceLabel: "Hardpack and sand",
    weather: "midday-hard",
    timeOfDay: "midday",
    personality: "fast",
    notes: "The dry river road. Wide, fast, and floored for minutes at a time, with sand in every cutting to catch the greedy.",
    params: {
      length: 13800, surface: SURFACE.DIRT, personality: "fast", width: 5.4,
      jumps: [3, 5], netClimb: 30, baseAltitude: 460, hillAmp: 30, ridgeAmp: 30,
      treeline: 380, treeDensity: 0.16, conifer: 0.1, cutSurface: SURFACE.SAND,
      vergeSurface: SURFACE.SAND, offCamber: 0.1,
    },
  },
  {
    id: "tamarosa-escarpa",
    name: "Canton Escarpa",
    ...TAMAROSA,
    seed: "tamarosa/escarpa",
    lengthBand: [9700, 10500],
    surfaceLabel: "Rock shelf and gravel",
    weather: "golden-hour",
    timeOfDay: "sunset",
    personality: "open",
    notes: "Up onto the escarpment on a shelf cut from the rock, then a plateau blast with a jump you can see coming for half a kilometre.",
    params: {
      length: 10100, surface: SURFACE.GRAVEL, personality: "open", width: 5.0,
      jumps: [3, 5], netClimb: 190, baseAltitude: 520, hillAmp: 44, ridgeAmp: 40,
      treeline: 420, treeDensity: 0.14, conifer: 0.1, cutSurface: SURFACE.ROCK,
      vergeSurface: SURFACE.ROCK, offCamber: 0.14,
    },
  },
  {
    id: "vardhal-havnvik",
    name: "Havnvik Point",
    ...VARDHAL,
    seed: "vardhal/havnvik",
    lengthBand: [6300, 7000],
    surfaceLabel: "Damp coastal tarmac",
    weather: "hill-fog",
    timeOfDay: "morning",
    personality: "mixed",
    notes: "Short, damp and unforgiving. A harbour village, a stone bridge, and a headland where the road is one car wide.",
    params: {
      length: 6600, surface: SURFACE.TARMAC, personality: "mixed", width: 3.4,
      jumps: [2, 3], netClimb: 20, baseAltitude: 40, hillAmp: 22, ridgeAmp: 10,
      treeline: 180, treeDensity: 0.42, conifer: 0.35, dirtPatches: false, offCamber: 0.2,
    },
  },
  {
    id: "vardhal-stormgate",
    name: "Stormgate",
    ...VARDHAL,
    seed: "vardhal/stormgate",
    lengthBand: [9500, 10400],
    surfaceLabel: "Mixed tarmac and gravel",
    weather: "heavy-rain",
    timeOfDay: "afternoon",
    personality: "mixed",
    notes: "Half sealed, half not, and the surface changes exactly where you are hardest on the brakes. Finishes over the sea wall.",
    params: {
      length: 9900, surface: SURFACE.GRAVEL, personality: "mixed", width: 4.2,
      jumps: [2, 4], netClimb: 70, baseAltitude: 60, hillAmp: 26, ridgeAmp: 16,
      treeline: 240, treeDensity: 0.5, conifer: 0.4, offCamber: 0.15,
    },
  },
]);

export function stageBookEntry(id) {
  return STAGE_BOOK.find((e) => e.id === id) || null;
}

// A book stage is a seed plus parameters, so the same id always regenerates the
// same road down to the last tree.
export function stageFromBook(id, overrides = {}) {
  const entry = stageBookEntry(id);
  if (!entry) throw new Error("unknown stage id " + id);
  // A reverse entry deliberately shares its forward twin's seed: the reverse is
  // the same road driven the other way, not a second road. `generateStage`
  // overwrites `params.seed` with its first argument, so a caller's seed
  // override has to arrive there and not in the options.
  return generateStage(overrides.seed ?? entry.seed, {
    ...entry.params,
    lengthBand: entry.lengthBand,
    ...overrides,
    id: entry.id,
    name: entry.name,
    country: entry.country,
    region: entry.region,
    rally: entry.rally,
    notes: entry.notes,
    weather: entry.weather,
    timeOfDay: entry.timeOfDay,
  });
}

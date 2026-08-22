// The co-driver. A call is a corner's tightest radius read through how far the
// corner turns — a ninety-degree sweeper and a ninety-degree pinch are the same
// change of direction and completely different notes — and the way calls are
// strung together carries as much as the calls themselves, so segmentation,
// merging, linking and delivery timing all live in this one module.

import { clamp, saturate, remap, smoothstep } from "./mathx.js";
import { surfaceProps } from "./surfaces.js";

export const DERIVE_DEFAULTS = Object.freeze({
  // A sample only counts as turning above enterK, and a corner keeps running
  // while it stays above exitK. Hysteresis is what stops one corner with a
  // slack mid-section being read out as two.
  enterK: 1 / 600,
  exitK: 1 / 1100,
  smoothSpan: 3,          // samples either side, ±6 m at the 2 m stage step
  minAngle: 0.12,         // rad; below this it is a bend in the road, not a corner
  kinkRadius: 90,         // ...unless it is this tight, when even a flick is a call
  hardMergeGap: 16,       // m; same-direction corners this close are one corner
  mergeGap: 44,           // m; same-direction *gentle* corners this close are one long call
  mergeRadius: 110,       // m; "gentle" for the merge above
  breathGap: 28,          // m; two calls this close are read in one breath
  intoGap: 7,             // m; flowing straight from one into the next
  thenGap: 95,            // m; short gap, called as "then <distance>"
  straightGap: 380,       // m; longer than this earns its own "long straight"
  cautionGap: 190,        // m of approach that makes a slow corner a caution
  maxBreath: 3,           // calls per breath, so a chicane does not become a paragraph
  finishCall: 200,        // m before the finish line
  infoNotes: true,
});

const RUNNER_DEFAULTS = Object.freeze({
  style: "numeric",
  rate: 4.4,              // syllables per second; recce reading is fast and clipped
  travelMin: 2.5,         // s of travel after the note ends, slow technical sections
  travelMax: 4.0,         // s of travel after the note ends, flat out
  travelLoSpeed: 12,
  travelHiSpeed: 38,
  offset: 0,              // player delivery offset, seconds, + = earlier
  pause: 0.35,            // s of silence between two utterances
  minLead: 22,            // m
  maxLead: 420,           // m
  minLeadTime: 0.7,       // s; below this the note is no longer worth saying
  pullLimit: 2.0,         // hard ceiling on how far a backlog may drag a call forward
  queueDepth: 4,
  onNote: null,
});

const SEV_BOUNDS = [28, 48, 80, 130, 220];

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six"];
const DESCRIPTIVE_WORDS = ["", "hairpin", "very slow", "slow", "medium", "fast", "flat"];
const SPECIAL_WORDS = Object.freeze({
  hairpin: "hairpin", acute: "acute", square: "square", flat: "flat",
});
const SPECIAL_GLYPHS = Object.freeze({
  hairpin: "HP", acute: "AC", square: "SQ", flat: "FL",
});

// Spoken before the call, in this order; everything else trails it.
const LEADING_MODS = ["double caution", "caution"];
const MOD_ORDER = [
  "brake", "long", "opens", "tightens", "tightens on exit",
  "cut", "don't cut", "line", "keep left", "keep right",
  "narrows", "off camber", "bumpy",
  "over crest", "into crest", "jump", "big jump",
  "over bridge", "into ford", "into tunnel", "junction",
];
const MOD_RANK = new Map(MOD_ORDER.map((m, i) => [m, i]));

const MOD_GLYPHS = Object.freeze({
  "double caution": "!!", caution: "!", brake: "BRK", long: "LONG",
  opens: "OPEN", tightens: "TGHT", "tightens on exit": "TGHT-EX",
  cut: "CUT", "don't cut": "NO CUT", line: "LINE",
  "keep left": "K-L", "keep right": "K-R", narrows: "NARROW",
  "off camber": "OFF-C", bumpy: "BUMPY", "over crest": "CREST",
  "into crest": "CREST", jump: "JUMP", "big jump": "BIG JUMP",
  "over bridge": "BRIDGE", "into ford": "FORD", "into tunnel": "TUNNEL",
  junction: "JCT",
});

// Distances a co-driver actually says. Anything measured gets snapped onto this
// ladder before it is spoken — "eighty-seven into left four" is not a pace note.
const DIST_LADDER = [20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000];
const DIST_WORDS = Object.freeze({
  20: "twenty", 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty",
  70: "seventy", 80: "eighty", 90: "ninety", 100: "one hundred",
  120: "one twenty", 150: "one fifty", 200: "two hundred", 250: "two fifty",
  300: "three hundred", 350: "three fifty", 400: "four hundred",
  500: "five hundred", 600: "six hundred", 700: "seven hundred",
  800: "eight hundred", 900: "nine hundred", 1000: "one thousand",
});

const INFO_TEXT = Object.freeze({
  crest: "over crest",
  jump: "jump",
  bigjump: "big jump",
  bridge: "over bridge",
  ford: "into ford",
  tunnel: "into tunnel",
  junction: "junction",
  narrows: "narrows",
  straight: "long straight",
  finish: "finish",
});

// Every word the generator can utter. The HUD and the TTS voice are both keyed
// off this, and a test walks it: a call containing a word that is not here is a
// call some speech engine will mangle.
export const PACENOTE_WORDS = Object.freeze(new Set(
  [
    ...NUMBER_WORDS, ...DESCRIPTIVE_WORDS, ...Object.values(SPECIAL_WORDS),
    ...LEADING_MODS, ...MOD_ORDER, ...Object.values(INFO_TEXT),
    ...Object.values(DIST_WORDS),
    "left", "right", "into", "and", "then", "to", "finish",
  ].join(" ").split(/[^a-z']+/).filter(Boolean),
));

export function severityForRadius(effectiveRadius) {
  for (let i = 0; i < SEV_BOUNDS.length; i += 1) {
    if (effectiveRadius < SEV_BOUNDS[i]) return i + 1;
  }
  return 6;
}

// A flick can be cut straight through, so it is called faster than its radius;
// a corner that keeps turning has to be entered slower than its radius, because
// there is no exit to aim at. Both effects are worth about a grade.
export function effectiveRadius(minRadius, angle) {
  const a = Math.max(angle, 0.02);
  const straighten = 1 + 0.9 * Math.exp(-a / 0.5);
  const sustain = 1 - 0.12 * smoothstep(1.6, 3.4, a);
  return minRadius * straighten * sustain;
}

export function specialForCorner(minRadius, angle, effR) {
  if (angle >= 2.35 && minRadius <= 34) return "hairpin";
  if (angle >= 1.90 && angle < 2.35 && minRadius <= 45) return "acute";
  if (angle >= 1.32 && angle < 1.90 && minRadius <= 34) return "square";
  if (effR >= 400) return "flat";
  return null;
}

function snapDistance(m) {
  if (m < 25) return 20;
  if (m < 100) return Math.max(20, Math.round(m / 10) * 10);
  let best = DIST_LADDER[0];
  let bestErr = Infinity;
  for (let i = 0; i < DIST_LADDER.length; i += 1) {
    const err = Math.abs(DIST_LADDER[i] - m);
    if (err < bestErr) { bestErr = err; best = DIST_LADDER[i]; }
  }
  return best;
}

function distanceWord(m) {
  return DIST_WORDS[snapDistance(m)] ?? DIST_WORDS[1000];
}

export function syllableCount(word) {
  let n = 0;
  let prevVowel = false;
  for (let i = 0; i < word.length; i += 1) {
    const c = word[i];
    const vowel = c === "a" || c === "e" || c === "i" || c === "o" || c === "u" || c === "y";
    if (vowel && !prevVowel) n += 1;
    prevVowel = vowel;
  }
  if (n > 1 && word.length > 2 && word.endsWith("e")) {
    const p = word[word.length - 2];
    if (!(p === "a" || p === "e" || p === "i" || p === "o" || p === "u" || p === "y" || p === "l")) n -= 1;
  }
  return n < 1 ? 1 : n;
}

// Reading time for a call. Rally reading is metered by syllables, not
// characters, and the commas are real pauses — they are how "caution, hairpin
// left" lands differently from "hairpin left".
export function spokenDuration(text, rate = RUNNER_DEFAULTS.rate) {
  let syl = 0;
  let commas = 0;
  const words = text.split(/[^a-z']+/);
  for (let i = 0; i < words.length; i += 1) {
    if (words[i]) syl += syllableCount(words[i]);
  }
  for (let i = 0; i < text.length; i += 1) if (text[i] === ",") commas += 1;
  return syl / rate + commas * 0.16 + 0.12;
}

function arrayAt(arr, i, fallback = 0) {
  if (!arr) return fallback;
  const v = arr[i];
  return Number.isFinite(v) ? v : fallback;
}

function stageStep(stage) {
  if (Number.isFinite(stage.step) && stage.step > 0) return stage.step;
  if (stage.s && stage.s.length > 1) return stage.s[1] - stage.s[0];
  return 2;
}

function stageS(stage, i, step) {
  if (stage.s && Number.isFinite(stage.s[i])) return stage.s[i];
  return i * step;
}

function smoothCurvature(k, count, span) {
  const out = new Float64Array(count);
  const width = span * 2 + 1;
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let j = -span; j <= span; j += 1) {
      const idx = clamp(i + j, 0, count - 1);
      sum += k[idx];
    }
    out[i] = sum / width;
  }
  return out;
}

function measureRun(k, i0, i1, dir, step) {
  let maxK = 0;
  let angle = 0;
  for (let i = i0; i <= i1; i += 1) {
    const v = k[i];
    if (Math.sign(v) !== dir) continue;
    const a = Math.abs(v);
    angle += a * step;
    if (a > maxK) maxK = a;
  }
  // The apex is the middle of the tightest part, not its first sample: on a
  // constant-radius corner every sample ties, and the width, camber and crest
  // that shape the call are read at the apex.
  let lo = i0;
  let hi = i0;
  let found = false;
  for (let i = i0; i <= i1; i += 1) {
    const v = k[i];
    if (Math.sign(v) !== dir || Math.abs(v) < maxK * 0.995) continue;
    if (!found) { lo = i; found = true; }
    hi = i;
  }
  return { maxK, angle, apex: (lo + hi) >> 1 };
}

function detectCorners(stage, cfg) {
  const step = stageStep(stage);
  const count = stage.count ?? stage.curvature.length;
  const raw = stage.curvature;
  const sm = smoothCurvature(raw, count, cfg.smoothSpan);
  const runs = [];
  let cursor = 0;
  let i = 0;
  while (i < count) {
    if (Math.abs(sm[i]) < cfg.enterK) { i += 1; continue; }
    const dir = Math.sign(sm[i]);
    let a = i;
    while (a - 1 >= cursor && Math.sign(sm[a - 1]) === dir && Math.abs(sm[a - 1]) >= cfg.exitK) a -= 1;
    let b = i;
    while (b + 1 < count && Math.sign(sm[b + 1]) === dir && Math.abs(sm[b + 1]) >= cfg.exitK) b += 1;
    const m = measureRun(raw, a, b, dir, step);
    if (m.maxK > 0) {
      runs.push({ i0: a, i1: b, dir, maxK: m.maxK, angle: m.angle, apex: m.apex });
      cursor = b + 1;
    }
    i = b + 1;
  }
  return { runs, sm, step, count };
}

function remeasure(run, raw, step) {
  const m = measureRun(raw, run.i0, run.i1, run.dir, step);
  run.maxK = m.maxK;
  run.angle = m.angle;
  run.apex = m.apex;
  return run;
}

// Six flicks the same way are one road feature, not six calls. Merging them
// before anything else is what keeps the co-driver from machine-gunning.
function mergeRuns(runs, raw, step, cfg) {
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let i = 0; i < runs.length - 1; i += 1) {
      const a = runs[i];
      const b = runs[i + 1];
      if (a.dir !== b.dir) continue;
      const gap = (b.i0 - a.i1) * step;
      const gentle = 1 / a.maxK > cfg.mergeRadius && 1 / b.maxK > cfg.mergeRadius;
      if (gap > cfg.hardMergeGap && !(gentle && gap <= cfg.mergeGap)) continue;
      a.i1 = b.i1;
      a.merged = true;
      remeasure(a, raw, step);
      runs.splice(i + 1, 1);
      changed = true;
      break;
    }
  }
  return runs;
}

function meanOver(arr, i0, i1, fallback = 0) {
  if (!arr) return fallback;
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i += 1) {
    const v = arr[i];
    if (Number.isFinite(v)) { sum += v; n += 1; }
  }
  return n ? sum / n : fallback;
}

function maxOver(arr, i0, i1, fallback = 0) {
  if (!arr) return fallback;
  let best = -Infinity;
  for (let i = i0; i <= i1; i += 1) {
    const v = arr[i];
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best === -Infinity ? fallback : best;
}

function minOver(arr, i0, i1, fallback = 0) {
  if (!arr) return fallback;
  let best = Infinity;
  for (let i = i0; i <= i1; i += 1) {
    const v = arr[i];
    if (Number.isFinite(v) && v < best) best = v;
  }
  return best === Infinity ? fallback : best;
}

function meanAbsK(raw, i0, i1) {
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i += 1) { sum += Math.abs(raw[i]); n += 1; }
  return n ? sum / n : 0;
}

function roughnessOver(stage, i0, i1) {
  if (!stage.surface) return 0;
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i += 1) {
    sum += surfaceProps(stage.surface[i]).roughness;
    n += 1;
  }
  return n ? sum / n : 0;
}

// Speed a corner can be taken at, used only to budget approach and caution.
function cornerSpeed(minRadius) {
  return clamp(Math.sqrt(8.0 * minRadius), 7, 55);
}

function peakRuns(arr, count, threshold) {
  const peaks = [];
  if (!arr) return peaks;
  let i = 0;
  while (i < count) {
    if (!(arr[i] > threshold)) { i += 1; continue; }
    let j = i;
    let best = i;
    while (j < count && arr[j] > threshold) {
      if (arr[j] > arr[best]) best = j;
      j += 1;
    }
    peaks.push({ index: best, value: arr[best] });
    i = j;
  }
  return peaks;
}

function pushMod(note, mod) {
  if (!note.mods.includes(mod)) note.mods.push(mod);
}

function sortMods(note) {
  note.mods.sort((a, b) => {
    const ra = LEADING_MODS.includes(a) ? -100 + LEADING_MODS.indexOf(a) : MOD_RANK.get(a) ?? 999;
    const rb = LEADING_MODS.includes(b) ? -100 + LEADING_MODS.indexOf(b) : MOD_RANK.get(b) ?? 999;
    return ra - rb;
  });
}

function makeNote(kind) {
  return {
    index: 0,
    kind,
    s: 0,
    sStart: 0,
    sEnd: 0,
    length: 0,
    dir: 0,
    severity: 0,
    special: null,
    radius: 0,
    effectiveRadius: 0,
    angle: 0,
    apexS: 0,
    mods: [],
    link: null,
    linkGap: 0,
    distance: 0,
    distanceAhead: 0,
    sameBreath: false,
    entrySpeed: 0,
    _text: null,
    _glyphs: null,
  };
}

function cornerNote(stage, run, step) {
  const raw = stage.curvature;
  const i0 = run.i0;
  const i1 = run.i1;
  const n = makeNote("corner");
  n.dir = run.dir;
  n.sStart = stageS(stage, i0, step);
  n.sEnd = stageS(stage, i1, step);
  n.s = n.sStart;
  n.length = n.sEnd - n.sStart;
  n.radius = 1 / run.maxK;
  n.angle = run.angle;
  const effR = effectiveRadius(n.radius, n.angle);
  n.effectiveRadius = effR;
  n.severity = severityForRadius(effR);
  n.special = specialForCorner(n.radius, n.angle, effR);
  n.apexS = stageS(stage, run.apex, step);
  n.entrySpeed = cornerSpeed(n.radius);

  const span = i1 - i0;
  const third = Math.max(1, Math.round(span / 3));
  const kEntry = meanAbsK(raw, i0, Math.min(i1, i0 + third));
  const kExit = meanAbsK(raw, Math.max(i0, i1 - third), i1);
  const rEntry = kEntry > 1e-9 ? 1 / kEntry : 1e9;
  const rExit = kExit > 1e-9 ? 1 / kExit : 1e9;

  // "Long" is not "big": a hairpin is a hundred metres of road and is never
  // called long. A corner is long when it keeps turning past what its own
  // severity leads you to expect.
  const sustained = n.length >= 150 || (n.angle >= 1.75 && n.radius >= 45) || run.merged;
  if (sustained && n.length >= 90) pushMod(n, "long");
  if (rExit > rEntry * 1.45) pushMod(n, "opens");
  else if (rExit < rEntry * 0.72) {
    const quarter = Math.max(1, Math.round(span / 4));
    const kLast = meanAbsK(raw, Math.max(i0, i1 - quarter), i1);
    const kBefore = meanAbsK(raw, i0, Math.max(i0, i1 - quarter));
    pushMod(n, kLast > kBefore * 1.5 ? "tightens on exit" : "tightens");
  }

  const halfWidth = stage.halfWidth;
  const wApex = arrayAt(halfWidth, run.apex, 5);
  const wMin = minOver(halfWidth, i0, i1, 5);
  const approach0 = Math.max(0, i0 - Math.round(60 / step));
  const wApproach = meanOver(halfWidth, approach0, Math.max(approach0, i0), wMin || 5);
  const crestPeak = maxOver(stage.crest, i0, i1, 0);
  let loose = 0;
  if (stage.surface) {
    let sum = 0;
    for (let i = i0; i <= i1; i += 1) sum += surfaceProps(stage.surface[i]).looseDepth;
    loose = sum / (span + 1);
  }

  if (wMin < wApproach * 0.72 || wMin < 2.6) pushMod(n, "narrows");
  if (wApex < 3.2 || crestPeak > 0.35) pushMod(n, "don't cut");
  else if (wApex >= 5.5 && n.severity <= 3 && loose > 0.3) pushMod(n, "cut");
  if (n.severity >= 5 && wMin < 4.0) pushMod(n, "line");

  const camber = meanOver(stage.camber, i0, i1, 0);
  if (n.dir * camber < -0.025) pushMod(n, "off camber");
  if (n.mods.includes("narrows") && Math.abs(camber) > 0.04) {
    pushMod(n, camber > 0 ? "keep right" : "keep left");
  }
  if (roughnessOver(stage, i0, i1) > 0.55) pushMod(n, "bumpy");

  return n;
}

function infoNote(kind, s, mod) {
  const n = makeNote(kind);
  n.s = s;
  n.sStart = s;
  n.sEnd = s;
  if (mod) n.mods.push(mod);
  return n;
}

// A hazard inside a corner is part of that call, not a call of its own — and
// one just past the exit is what "into crest" means. Anything else stands alone.
function attachHazard(corners, s, insideMod, aheadMod, aheadRange) {
  for (let i = 0; i < corners.length; i += 1) {
    const c = corners[i];
    if (s >= c.sStart - 12 && s <= c.sEnd + 12) {
      pushMod(c, insideMod);
      return true;
    }
  }
  if (!aheadMod) return false;
  for (let i = 0; i < corners.length; i += 1) {
    const c = corners[i];
    if (s > c.sEnd && s <= c.sEnd + aheadRange) {
      pushMod(c, aheadMod);
      return true;
    }
  }
  return false;
}

function deriveHazards(stage, corners, step, count, out) {
  const crests = peakRuns(stage.crest, count, 0.30);
  for (let i = 0; i < crests.length; i += 1) {
    const s = stageS(stage, crests[i].index, step);
    if (attachHazard(corners, s, "over crest", "into crest", 60)) continue;
    out.push(infoNote("crest", s, INFO_TEXT.crest));
  }
  const jumps = peakRuns(stage.jump, count, 0.25);
  for (let i = 0; i < jumps.length; i += 1) {
    const s = stageS(stage, jumps[i].index, step);
    const big = jumps[i].value > 0.6;
    const mod = big ? "big jump" : "jump";
    if (attachHazard(corners, s, mod, mod, 30)) continue;
    out.push(infoNote(big ? "bigjump" : "jump", s, mod));
  }
  const features = stage.features ?? [];
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    let mod = null;
    let kind = null;
    if (f.kind === "bridge") { mod = "over bridge"; kind = "bridge"; }
    else if (f.kind === "ford") { mod = "into ford"; kind = "ford"; }
    else if (f.kind === "tunnel") { mod = "into tunnel"; kind = "tunnel"; }
    else if (f.kind === "junction") { mod = "junction"; kind = "junction"; }
    else if (f.kind === "narrows") { mod = "narrows"; kind = "narrows"; }
    if (!mod) continue;
    const severity = Number.isFinite(f.severity) ? f.severity : 0.5;
    let attached = false;
    for (let j = 0; j < corners.length; j += 1) {
      const c = corners[j];
      if (f.s >= c.sStart - 25 && f.s <= c.sEnd + 25) {
        pushMod(c, mod);
        if (severity >= 0.85) pushMod(c, "double caution");
        else if (severity >= 0.6) pushMod(c, "caution");
        attached = true;
        break;
      }
    }
    if (attached) continue;
    const note = infoNote(kind, f.s, mod);
    if (severity >= 0.85) pushMod(note, "double caution");
    else if (severity >= 0.6) pushMod(note, "caution");
    out.push(note);
  }
}

function deriveCautions(notes, cfg) {
  let prevEnd = 0;
  let prevSpeed = 20;
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    if (n.kind !== "corner") { prevEnd = n.sEnd; continue; }
    const gap = n.sStart - prevEnd;
    // How fast you would arrive if you just drove the gap flat.
    const arrival = Math.min(55, Math.sqrt(prevSpeed * prevSpeed + 2 * 3.2 * Math.max(gap, 0)));
    const drop = n.entrySpeed / arrival;
    if (drop < 0.55 && gap >= 50) pushMod(n, "brake");
    if (n.severity <= 2 && gap >= cfg.cautionGap && drop < 0.5) {
      pushMod(n, n.severity === 1 && gap >= cfg.cautionGap * 1.6 ? "double caution" : "caution");
    }
    if (n.mods.includes("big jump")) pushMod(n, "caution");
    // A caution already means "get it slowed"; saying both is a wasted breath
    // on the one call where breath is scarcest.
    if (n.mods.includes("caution") || n.mods.includes("double caution")) {
      const b = n.mods.indexOf("brake");
      if (b >= 0) n.mods.splice(b, 1);
    }
    prevEnd = n.sEnd;
    prevSpeed = n.entrySpeed;
  }
}

function linkNotes(notes, cfg) {
  let prevEnd = 0;
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    const prev = i > 0 ? notes[i - 1] : null;
    const gap = Math.max(0, n.sStart - prevEnd);
    n.linkGap = gap;
    n.sameBreath = false;
    n.link = null;
    n.distance = 0;
    const flows = n.kind !== "straight" && n.kind !== "finish";
    if (prev && !flows && gap < cfg.breathGap) {
      // "right four into long straight" is not a thing anybody says; the road
      // opening up is read as the tail of the corner call, on a comma.
      n.sameBreath = true;
    } else if (prev && flows && gap < cfg.intoGap) {
      n.link = "into";
      n.sameBreath = true;
    } else if (prev && flows && gap < cfg.breathGap) {
      const pair = prev.kind === "corner" && n.kind === "corner";
      n.link = pair ? "and" : "into";
      n.sameBreath = true;
    } else if (gap < cfg.thenGap && prev) {
      n.link = "then";
      n.distance = snapDistance(gap);
    } else if (gap >= 40) {
      n.link = "distance";
      n.distance = snapDistance(gap);
    }
    prevEnd = n.sEnd;
  }
  // A breath is at most maxBreath calls; the fourth in a chicane starts a new one.
  let run = 1;
  for (let i = 1; i < notes.length; i += 1) {
    if (!notes[i].sameBreath) { run = 1; continue; }
    run += 1;
    if (run > cfg.maxBreath) {
      notes[i].sameBreath = false;
      notes[i].link = notes[i].linkGap >= 40 ? "distance" : null;
      if (notes[i].link === "distance") notes[i].distance = snapDistance(notes[i].linkGap);
      run = 1;
    }
  }
}

export function derivePacenotes(stage, opts = {}) {
  const cfg = { ...DERIVE_DEFAULTS, ...opts };
  const { runs, step, count } = detectCorners(stage, cfg);
  mergeRuns(runs, stage.curvature, step, cfg);

  const corners = [];
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const radius = 1 / run.maxK;
    if (run.angle < cfg.minAngle && radius > cfg.kinkRadius) continue;
    corners.push(cornerNote(stage, run, step));
  }

  const notes = corners.slice();
  if (cfg.infoNotes) {
    deriveHazards(stage, corners, step, count, notes);
    const finishS = Number.isFinite(stage.finish?.s) ? stage.finish.s
      : Number.isFinite(stage.length) ? stage.length : stageS(stage, count - 1, step);
    const finishCall = finishS - cfg.finishCall;
    if (notes.length === 0 || finishCall > notes[notes.length - 1].sEnd + 30) {
      notes.push(infoNote("finish", finishCall, INFO_TEXT.finish));
    }
    notes.sort((a, b) => a.sStart - b.sStart || a.sEnd - b.sEnd);
    // Only the run-in to the first call earns a "long straight". Everywhere
    // else the next call's distance already says the road is empty, and saying
    // both is the chatter that makes a co-driver tiring to listen to.
    const withStraights = [];
    let prevEnd = 0;
    for (let i = 0; i < notes.length; i += 1) {
      const gap = notes[i].sStart - prevEnd;
      if (i === 0 && gap >= cfg.straightGap) {
        const st = infoNote("straight", prevEnd + 20, INFO_TEXT.straight);
        st.distanceAhead = snapDistance(gap - 20);
        withStraights.push(st);
      }
      withStraights.push(notes[i]);
      prevEnd = notes[i].sEnd;
    }
    notes.length = 0;
    for (let i = 0; i < withStraights.length; i += 1) notes.push(withStraights[i]);
  }

  notes.sort((a, b) => a.sStart - b.sStart || a.sEnd - b.sEnd);
  deriveCautions(notes, cfg);
  linkNotes(notes, cfg);
  for (let i = 0; i < notes.length; i += 1) {
    sortMods(notes[i]);
    notes[i].index = i;
    notes[i]._text = Object.create(null);
    notes[i]._glyphs = null;
  }
  return notes;
}

function callWords(note, style) {
  if (note.kind !== "corner") return "";
  const dir = note.dir > 0 ? "left" : "right";
  if (note.special) return `${SPECIAL_WORDS[note.special]} ${dir}`;
  // Numeric notes name the corner then grade it; descriptive notes are said the
  // other way round, and "slow left" is the whole reason a driver picks them.
  if (style === "descriptive") return `${DESCRIPTIVE_WORDS[note.severity]} ${dir}`;
  return `${dir} ${NUMBER_WORDS[note.severity]}`;
}

export function pacenoteText(note, style = "numeric") {
  const cached = note._text?.[style];
  if (cached !== undefined) return cached;

  const lead = [];
  const trail = [];
  for (let i = 0; i < note.mods.length; i += 1) {
    const m = note.mods[i];
    if (LEADING_MODS.includes(m)) lead.push(m);
    else trail.push(m);
  }

  let body;
  if (note.kind === "corner") {
    body = callWords(note, style);
  } else if (note.kind === "straight") {
    body = note.distanceAhead ? `${INFO_TEXT.straight}, ${distanceWord(note.distanceAhead)}` : INFO_TEXT.straight;
    trail.length = 0;
  } else if (note.kind === "finish") {
    body = INFO_TEXT.finish;
    trail.length = 0;
  } else {
    body = trail.shift() ?? INFO_TEXT[note.kind] ?? "";
  }

  const spoken = [];
  if (lead.length) spoken.push(lead.join(", "));
  if (body) spoken.push(body);
  for (let i = 0; i < trail.length; i += 1) spoken.push(trail[i]);
  let text = spoken.join(", ");

  if (note.link === "into") text = `into ${text}`;
  else if (note.link === "and") text = `and ${text}`;
  else if (note.link === "then") text = `then ${distanceWord(note.distance)}, ${text}`;
  else if (note.link === "distance") {
    // "one hundred into left four" flows; a caution never takes "into", it takes
    // the beat of a comma, which is the whole point of calling it.
    const joiner = note.kind === "corner" && !lead.length ? " into " : ", ";
    text = `${distanceWord(note.distance)}${joiner}${text}`;
  }

  if (note._text) note._text[style] = text;
  return text;
}

export function pacenoteGlyphs(note) {
  if (note._glyphs) return note._glyphs;
  const out = [];
  // An info note's headline is its hazard, not its caution flag — the flag has
  // its own glyph and must not be drawn twice.
  let headline = null;
  if (note.kind !== "corner") {
    for (let i = 0; i < note.mods.length; i += 1) {
      if (!LEADING_MODS.includes(note.mods[i])) { headline = note.mods[i]; break; }
    }
  }
  if (note.link === "distance" || note.link === "then") {
    out.push({ kind: "dist", text: String(note.distance), severity: 0 });
  }
  if (note.link === "into" || note.link === "and") {
    out.push({ kind: "link", text: note.link, severity: 0 });
  }
  for (let i = 0; i < note.mods.length; i += 1) {
    if (LEADING_MODS.includes(note.mods[i])) {
      out.push({ kind: "caution", text: MOD_GLYPHS[note.mods[i]], severity: 0 });
    }
  }
  if (note.kind === "corner") {
    out.push({ kind: "arrow", text: note.dir > 0 ? "left" : "right", severity: note.severity });
    out.push({
      kind: "sev",
      text: note.special ? SPECIAL_GLYPHS[note.special] : String(note.severity),
      severity: note.severity,
    });
  } else if (note.kind === "straight") {
    out.push({ kind: "info", text: "STRAIGHT", severity: 0 });
    if (note.distanceAhead) out.push({ kind: "dist", text: String(note.distanceAhead), severity: 0 });
  } else if (note.kind === "finish") {
    out.push({ kind: "info", text: "FINISH", severity: 0 });
  } else {
    out.push({
      kind: "info",
      text: (headline && MOD_GLYPHS[headline]) ?? note.kind.toUpperCase(),
      severity: 0,
    });
  }
  for (let i = 0; i < note.mods.length; i += 1) {
    const m = note.mods[i];
    if (LEADING_MODS.includes(m) || m === headline) continue;
    out.push({ kind: "mod", text: MOD_GLYPHS[m] ?? m.toUpperCase(), severity: 0 });
  }
  note._glyphs = out;
  return out;
}

export function createPacenoteRunner(notes, opts = {}) {
  const cfg = { ...RUNNER_DEFAULTS, ...opts };
  const n = notes.length;

  // A breath is a run of notes read as one utterance. Grouping is fixed by the
  // notes, so it is resolved once here and never recomputed in the update path.
  const groupEnd = new Int32Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    groupEnd[i] = (i + 1 < n && notes[i + 1].sameBreath) ? groupEnd[i + 1] : i;
  }
  const phrases = new Array(n).fill(null);
  const durations = new Float64Array(n);

  function phraseFor(head) {
    if (phrases[head] !== null) return phrases[head];
    let text = "";
    for (let i = head; i <= groupEnd[head]; i += 1) {
      const part = pacenoteText(notes[i], cfg.style);
      if (i === head) text = part;
      else text += notes[i].link ? ` ${part}` : `, ${part}`;
    }
    phrases[head] = text;
    durations[head] = spokenDuration(text, cfg.rate);
    return text;
  }

  function durationFor(head) {
    if (phrases[head] === null) phraseFor(head);
    return durations[head];
  }

  const current = {
    index: -1,
    lastIndex: -1,
    text: "",
    style: cfg.style,
    notes: [],
    note: null,
    startedAt: 0,
    endsAt: 0,
    startS: 0,
    lead: 0,
    leadTime: 0,
  };

  const state = {
    head: 0,
    time: 0,
    speakUntil: -1,
    spoken: 0,
    skipped: 0,
    offset: cfg.offset,
  };

  const pending = [];

  function travelLead(speed) {
    return remap(speed, cfg.travelLoSpeed, cfg.travelHiSpeed, cfg.travelMin, cfg.travelMax);
  }

  // The distance at which this breath should start. The base is "finish the
  // sentence, then leave the driver two and a half to four seconds of road".
  // On top of that, a backlog drags the call forward: if the next two breaths
  // cannot fit between here and their own corners, this one has to go early or
  // they never get said at all.
  function leadFor(head, speed) {
    const travel = travelLead(speed);
    const base = speed * (durationFor(head) + travel + state.offset);
    let lead = base;
    let need = 0;
    let prev = head;
    let k = groupEnd[head] + 1;
    let looked = 0;
    while (k < n && looked < 3) {
      need += (durationFor(prev) + cfg.pause) * speed;
      const idealK = notes[k].sStart - speed * (durationFor(k) + travel);
      const required = notes[head].sStart - (idealK - need);
      if (required > lead) lead = required;
      prev = k;
      k = groupEnd[k] + 1;
      looked += 1;
    }
    const ceiling = Math.max(base * cfg.pullLimit, cfg.minLead);
    return clamp(Math.min(lead, ceiling), cfg.minLead, cfg.maxLead);
  }

  function refreshPending() {
    pending.length = 0;
    let i = state.head;
    while (i < n && pending.length < cfg.queueDepth) {
      pending.push(notes[i]);
      i = groupEnd[i] + 1;
    }
  }

  function speak(head, s, speed) {
    const end = groupEnd[head];
    current.notes.length = 0;
    for (let i = head; i <= end; i += 1) current.notes.push(notes[i]);
    current.index = head;
    current.lastIndex = end;
    current.note = notes[head];
    current.text = phraseFor(head);
    current.startedAt = state.time;
    current.endsAt = state.time + durations[head];
    current.startS = s;
    current.lead = notes[head].sStart - s;
    current.leadTime = speed > 0.1 ? current.lead / speed : Infinity;
    state.speakUntil = current.endsAt + cfg.pause;
    state.spoken += end - head + 1;
    state.head = end + 1;
    refreshPending();
    if (cfg.onNote) cfg.onNote(current);
    return current;
  }

  const runner = {
    notes,
    pending,
    current,
    speaking: false,
    get spoken() { return state.spoken; },
    get skipped() { return state.skipped; },
    get offset() { return state.offset; },
    setOffset(seconds) {
      state.offset = Number.isFinite(seconds) ? clamp(seconds, -2, 4) : 0;
    },
    setStyle(style) {
      cfg.style = style;
      current.style = style;
      for (let i = 0; i < n; i += 1) phrases[i] = null;
    },
    textFor(head) {
      return phraseFor(head);
    },
    durationFor,
    update(s, speed, dt) {
      state.time += dt;
      runner.speaking = state.time < state.speakUntil;
      if (runner.speaking || state.head >= n) {
        refreshPending();
        return null;
      }
      const v = speed > 0 ? speed : 0;
      while (state.head < n) {
        const note = notes[state.head];
        const useless = Math.max(cfg.minLead * 0.5, v * cfg.minLeadTime);
        if (s > note.sStart - useless) {
          const end = groupEnd[state.head];
          state.skipped += end - state.head + 1;
          state.head = end + 1;
          continue;
        }
        break;
      }
      if (state.head >= n) {
        refreshPending();
        return null;
      }
      const head = state.head;
      const lead = leadFor(head, v);
      if (s < notes[head].sStart - lead) {
        refreshPending();
        return null;
      }
      const out = speak(head, s, v);
      runner.speaking = true;
      return out;
    },
    reset(s = 0) {
      state.time = 0;
      state.speakUntil = -1;
      state.spoken = 0;
      state.skipped = 0;
      state.head = 0;
      while (state.head < n && notes[state.head].sStart <= s) state.head = groupEnd[state.head] + 1;
      current.index = -1;
      current.lastIndex = -1;
      current.note = null;
      current.text = "";
      current.notes.length = 0;
      runner.speaking = false;
      refreshPending();
    },
  };

  refreshPending();
  return runner;
}

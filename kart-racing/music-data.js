// Apex Karts - music DATA layer. Pure data + pure functions, no WebAudio.
// Songs are written as bar strings (16 sixteenth-steps per bar) and compiled by
// compileTheme() into per-bar, per-step event lists that music.js synthesises.
//
// Bar string grammar (melody):  "G5.3 E5.1 r.2 C5+E5.4!"   token = NOTE[.len][!|*]
//   NOTE = C4, F#5, Bb3 ; "r" = rest ; "A+B" = simultaneous notes ; "!" accent ; "*" soft
//   lengths are in 16th steps and every bar must sum to exactly 16.
// Bass grammar: R root, O octave up, D octave down, T third, F fifth, S seventh,
//   A approach (semitone below next chord root), a (semitone above), r rest.
// Arp grammar: 16 space-separated tokens, "." or chord-tone index (4 = root+octave), "!" accent.
// Comp/stab grammar: 16-char string, x hit, X accent, . rest.
// Drum kits: strings of 16 chars: '.', 'x' (0.78), 'X' (1), 'g' (ghost 0.38).

const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error("bad note " + s);
  return 12 * (parseInt(m[3], 10) + 1) + PCS[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const pcOf = (s) => {
  const m = /^([A-G])([#b]?)$/.exec(s);
  if (!m) throw new Error("bad pc " + s);
  return (PCS[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
};
const QUAL = {
  "": [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus: [0, 5, 7], add9: [0, 4, 7, 2], m9: [0, 3, 7, 10, 2], "7sus": [0, 5, 7, 10], dim: [0, 3, 6],
};
export function parseChord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !QUAL[m[2]]) throw new Error("bad chord " + sym);
  const root = pcOf(m[1]);
  const ivs = QUAL[m[2]];
  const pcs = ivs.map((i) => (root + i) % 12);
  return { sym, root, ivs, pcs, bassPc: m[3] ? pcOf(m[3]) : root };
}

const VEL = { X: 1, x: 0.78, g: 0.38 };

// ---- pure helpers -----------------------------------------------------------------------------
function parseBarString(str, label) {
  const out = [];
  let s = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const m = /^([^.\s]+)\.(\d+)([!*]?)$/.exec(tok);
    if (!m) throw new Error(label + ": bad token '" + tok + "'");
    const l = parseInt(m[2], 10);
    out.push({ s, l, tok: m[1], v: m[3] === "!" ? 1 : m[3] === "*" ? 0.55 : 0.82 });
    s += l;
  }
  if (s !== 16) throw new Error(label + ": bar sums to " + s + " (" + str + ")");
  return out;
}

function stackFrom(pcs, base) {
  const notes = [base];
  for (let i = 1; i < pcs.length; i++) {
    let n = notes[i - 1] + 1;
    while (n % 12 !== pcs[i]) n++;
    notes.push(n);
  }
  return notes;
}

// Choose the inversion/octave placement of a chord that moves the least from `prev`.
export function voiceLead(pcs, prev, lo, hi) {
  let best = null, bc = 1e9;
  for (let r = 0; r < pcs.length; r++) {
    const order = pcs.slice(r).concat(pcs.slice(0, r));
    for (let base = lo; base <= hi; base++) {
      if (base % 12 !== order[0]) continue;
      const notes = stackFrom(order, base);
      if (notes[notes.length - 1] > hi) continue;
      const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
      let cost = Math.abs(avg - (lo + hi) / 2) * 0.15;
      if (prev) {
        for (let i = 0; i < notes.length; i++) {
          let d = 1e9;
          for (const p of prev) d = Math.min(d, Math.abs(notes[i] - p));
          cost += d;
        }
        cost += Math.abs(avg - prev.reduce((a, b) => a + b, 0) / prev.length) * 0.6;
      }
      if (cost < bc) { bc = cost; best = notes; }
    }
  }
  return best || stackFrom(pcs, lo + ((pcs[0] - lo) % 12 + 12) % 12);
}

function bassNote(pc, lo) {
  let n = lo;
  while (n % 12 !== pc) n++;
  return n;
}

const FILLS = {
  // returns drum events [step, drum, vel, pitchHz?] replacing everything from step 8 (or 12) on
  snare: () => {
    const e = [[8, "k", 0.9]];
    for (let i = 8; i < 16; i++) e.push([i, "s", 0.45 + (i - 8) * 0.08]);
    return { from: 8, ev: e };
  },
  tom: () => ({
    from: 8,
    ev: [[8, "k", 0.9], [8, "s", 0.8], [10, "t", 0.85, 230], [11, "t", 0.8, 230], [12, "t", 0.9, 175], [13, "t", 0.85, 175],
      [14, "t", 0.95, 130], [15, "t", 1, 100]],
  }),
  half: () => ({ from: 8, ev: [[8, "k", 0.9], [12, "s", 0.7], [14, "s", 0.8], [15, "s", 0.95]] }),
  roll: () => {
    const e = [[0, "k", 1]];
    for (let i = 4; i < 16; i++) e.push([i, i % 4 === 0 ? "t" : "s", 0.4 + (i - 4) * 0.05, 200 - i * 6]);
    return { from: 0, ev: e };
  },
};

// ---- compile -----------------------------------------------------------------------------------
export function compileTheme(th) {
  const bars = [];
  const ranges = th.ranges || { pad: [52, 72], keys: [55, 76], stab: [58, 79] };
  const prevV = {};
  const bassLo = th.bassLo || 31;
  const arpLo = th.arpLo || 60;
  const motif = (name, label) => {
    if (name === "-" || name === "_") return null;
    const s = th.m && th.m[name];
    if (s == null) throw new Error(label + ": unknown motif " + name);
    return parseBarString(s, label + "/" + name);
  };
  const lane = (part, n, label) => {
    if (!part) return null;
    const names = part.m.trim().split(/\s+/);
    if (names.length !== n) throw new Error(label + ": lane has " + names.length + " entries, need " + n);
    return names;
  };
  // pre-pass: flat chord list for "approach" notes
  const chordFlat = [];
  th.sections.forEach((sec, si) => {
    const prog = sec.prog.trim().split(/\s+/);
    if (prog.length !== sec.bars) throw new Error(th.id + "/" + sec.name + ": prog has " + prog.length + " bars, need " + sec.bars);
    prog.forEach((tok, bi) => tok.split("|").forEach((sym, ci) => chordFlat.push({ si, bi, ci, c: parseChord(sym) })));
  });
  let fi = 0;
  th.sections.forEach((sec, si) => {
    const label = th.id + "/" + sec.name;
    const prog = sec.prog.trim().split(/\s+/);
    const leadL = lane(sec.lead, sec.bars, label + " lead");
    const cntL = lane(sec.counter, sec.bars, label + " counter");
    const bassL = sec.bass ? (Array.isArray(th.bass[sec.bass.pat]) ? th.bass[sec.bass.pat] : [th.bass[sec.bass.pat]]) : null;
    for (let bi = 0; bi < sec.bars; bi++) {
      const syms = prog[bi].split("|");
      const chords = syms.map((sym) => {
        const flatIdx = fi++;
        const c = parseChord(sym);
        c.bass = bassNote(c.bassPc, bassLo);
        c.tones = stackFrom([c.root, ...c.pcs.slice(1)], arpLo + ((c.root - arpLo) % 12 + 12) % 12);
        c.v = {};
        for (const k of ["pad", "keys", "stab"]) {
          c.v[k] = voiceLead(c.pcs, prevV[k], ranges[k][0], ranges[k][1]);
          prevV[k] = c.v[k];
        }
        c._flat = flatIdx;
        return c;
      });
      const half = chords.length === 2;
      const chordAt = (s) => (half && s >= 8 ? chords[1] : chords[0]);
      const nextChord = (s) => {
        const idx = (half && s < 8) ? chords[1]._flat : chords[chords.length - 1]._flat + 1;
        return chordFlat[idx % chordFlat.length].c;
      };
      const bar = { si, sec: sec.name, bi, chords, at: Array.from({ length: 16 }, () => []) };
      const add = (s, e) => bar.at[s].push(e);
      const mel = (names, p, part) => {
        const m = motif(names[bi], label + " " + p);
        if (!m) return;
        for (const ev of m) {
          if (ev.tok === "r") continue;
          for (const nn of ev.tok.split("+")) add(ev.s, { p, n: noteToMidi(nn), l: ev.l, v: ev.v, min: part.min || 0 });
        }
      };
      if (leadL) mel(leadL, "lead", sec.lead);
      if (cntL) mel(cntL, "counter", sec.counter);
      if (bassL) {
        const pat = parseBarString(bassL[bi % bassL.length], label + " bass");
        for (const ev of pat) {
          if (ev.tok === "r") continue;
          const c = chordAt(ev.s);
          let n;
          switch (ev.tok) {
            case "R": n = c.bass; break;
            case "O": n = c.bass + 12; break;
            case "D": n = c.bass - 12; break;
            case "T": n = c.bass + ((c.pcs[1] - c.bassPc + 12) % 12); break;
            case "F": n = c.bass + ((c.pcs[2] - c.bassPc + 12) % 12); break;
            case "S": n = c.bass + ((c.pcs[Math.min(3, c.pcs.length - 1)] - c.bassPc + 12) % 12); break;
            case "A": n = nextChord(ev.s).bassPc; n = bassNote(n, bassLo) - 1; break;
            case "a": n = nextChord(ev.s).bassPc; n = bassNote(n, bassLo) + 1; break;
            default: throw new Error(label + ": bad bass token " + ev.tok);
          }
          add(ev.s, { p: "bass", n, l: ev.l, v: ev.v, min: sec.bass.min || 0 });
        }
      }
      if (sec.arp) {
        const toks = th.arp[sec.arp.pat].trim().split(/\s+/);
        if (toks.length !== 16) throw new Error(label + ": arp pattern length " + toks.length);
        toks.forEach((tk, s) => {
          if (tk === ".") return;
          const acc = tk.endsWith("!");
          const idx = parseInt(tk, 10);
          const c = chordAt(s);
          const n = c.tones[idx % c.tones.length] + 12 * Math.floor(idx / c.tones.length);
          add(s, { p: "arp", n, l: sec.arp.len || 1, v: acc ? 1 : 0.72, min: sec.arp.min || 0 });
        });
      }
      for (const kind of ["keys", "stab"]) {
        const d = sec[kind];
        if (!d) continue;
        const str = th.comp[d.pat];
        if (str.length !== 16) throw new Error(label + ": comp pattern length");
        for (let s = 0; s < 16; s++) {
          if (str[s] === ".") continue;
          add(s, { p: kind, notes: chordAt(s).v[kind], l: d.len || 2, v: str[s] === "X" ? 1 : 0.78, min: d.min || 0 });
        }
      }
      if (sec.pad) {
        chords.forEach((c, ci) => add(half ? ci * 8 : 0, { p: "pad", notes: c.v.pad, l: half ? 8 : 16, v: 0.9, min: sec.pad.min || 0 }));
      }
      if (sec.drums) {
        const kit = th.kits[sec.drums.kit];
        if (!kit) throw new Error(label + ": no kit " + sec.drums.kit);
        const ev = [];
        for (const [key, drum] of [["k", "k"], ["s", "s"], ["c", "c"], ["h", "h"], ["o", "o"], ["r", "r"]]) {
          if (!kit[key]) continue;
          if (kit[key].length !== 16) throw new Error(label + ": kit " + key + " length");
          for (let s = 0; s < 16; s++) if (kit[key][s] !== ".") ev.push([s, drum, VEL[kit[key][s]]]);
        }
        let list = ev;
        if (sec.drums.fill && bi === sec.bars - 1) {
          const f = FILLS[sec.drums.fill]();
          list = ev.filter((e) => e[0] < f.from || e[1] === "h" && f.from >= 8 && e[0] < 12).concat(f.ev);
        }
        const dmin = sec.drums.min || 0;
        for (const e of list) add(e[0], { p: "d", d: e[1], v: e[2], hz: e[3], min: dmin });
        if (sec.drums.crash && bi === 0) add(0, { p: "d", d: "x", v: 1, min: 0 });
      } else if (sec.crash && bi === 0) add(0, { p: "d", d: "x", v: 0.9, min: 0 });
      bars.push(bar);
    }
  });
  const loopBar = Math.max(0, bars.findIndex((b) => b.si === (th.loopFrom || 0)));
  return { id: th.id, bpm: th.bpm, bars, loopBar, th };
}

// ---- song definitions --------------------------------------------------------------------------
const THEME_DEFAULTS = {};

// ===== SUNSET COAST: G major, 128bpm, surf/funk pop =====
const sunset = {
  id: "sunset", name: "Sunset Coast", bpm: 128, swing: 0.07, key: { tonic: 7, mode: "major" },
  extraPcs: [], // pitch classes (besides the scale) allowed in leads
  m: {
    H1: "G5.3 E5.1 G5.2 A5.2 G5.2 E5.2 D5.4",
    H2: "F#5.3 D5.1 F#5.2 A5.2 F#5.2 D5.2 A4.4",
    H3: "D5.2 F#5.2 B5.4 A5.2 F#5.2 D5.4",
    H4: "G5.2 E5.2 B4.2 E5.2 G5.8",
    H7: "B5.3 G5.1 B5.2 D6.2 B5.2 G5.2 D5.4",
    H8a: "G5.6 r.10",
    H8b: "G5.4 r.4 B5.2 D6.2 G6.4",
    V1: "r.4 B4.2 D5.2 G5.4 F#5.2 D5.2",
    V2: "r.4 D5.2 B4.2 G4.4 B4.4",
    V3: "r.4 G5.4 E5.2 C5.2 D5.2 E5.2",
    V4: "r.4 A5.4 F#5.2 E5.2 D5.4",
    V8: "r.4 F#5.2 A5.2 B5.2 A5.2 F#5.2 D5.2",
    B1: "B5.6 A5.2 G5.4 E5.4",
    B2: "E5.6 D5.2 C5.4 A4.4",
    B3: "D5.4 F#5.4 E5.4 G5.4",
    B4: "A5.8 r.4 D6.4",
    I4: "r.8 D5.2 E5.2 G5.2 A5.2",
    CG: "D6.1 B5.1 G5.2 r.12", CEm: "E6.1 B5.1 G5.2 r.12", CC: "E6.1 C6.1 G5.2 r.12", CD: "F#6.1 D6.1 A5.2 r.12",
    CA: "r.12 B5.1 D6.1 E6.1 G6.1",
  },
  bass: {
    A: "R.2 r.1 R.1 O.2 r.1 F.1 R.2 r.1 R.1 T.1 F.1 A.2",
    B: "R.2 R.2 O.2 R.2 R.2 F.2 T.1 F.1 A.2",
    I: "R.4 r.4 R.4 r.2 A.2",
  },
  arp: { g: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 3 ." },
  comp: { skank: "..x...x...x...x.", chorus: "x..x..x...x.x...", stab: "x..x..x...x....." },
  kits: {
    intro: { k: "x.......x.......", h: "x.x.x.x.x.x.x.x.", s: "............x..." },
    verse: { k: "x.....x...x.....", s: "....x.......x...", h: "XgxgXgxgXgxgXgxg" },
    chorus: { k: "x...x...x...x...", s: "....x.......x...", c: "....x.......x...", h: "XgxgXgxgXgxgXgxg", o: "......x.......x." },
    bridge: { k: "x.......x.......", s: "........x.......", h: "x...x...x...x..." },
  },
  sections: [
    { name: "intro", bars: 4, prog: "G Em7 C D",
      lead: { m: "- - - I4", min: 0 }, pad: { min: 0 }, arp: { pat: "g", min: 0 }, bass: { pat: "I", min: 0.2 },
      drums: { kit: "intro", fill: "snare" }, keys: { pat: "skank", min: 0 }, crash: true },
    { name: "verse", bars: 8, prog: "G Em7 C D G Em7 C D",
      lead: { m: "V1 V2 V3 V4 V1 V2 V3 V8" }, counter: { m: "CG CEm CC CD CG CEm CC CD", min: 0.25 },
      pad: { min: 0.3 }, arp: { pat: "g" }, bass: { pat: "A" }, keys: { pat: "skank" },
      drums: { kit: "verse", fill: "half", crash: true } },
    { name: "chorus", bars: 8, prog: "C D Bm7 Em7 C D G G",
      lead: { m: "H1 H2 H3 H4 H1 H2 H7 H8a" }, counter: { m: "- - - CA - - - -", min: 0.3 },
      pad: { min: 0 }, bass: { pat: "B" }, keys: { pat: "chorus" }, stab: { pat: "stab", len: 2, min: 0.45 },
      drums: { kit: "chorus", fill: "tom", crash: true } },
    { name: "bridge", bars: 4, prog: "Em7 Am7 Bm7|C D",
      lead: { m: "B1 B2 B3 B4" }, pad: { min: 0 }, bass: { pat: "I", min: 0 }, keys: { pat: "skank", min: 0.5 },
      arp: { pat: "g", min: 0.4 }, drums: { kit: "bridge", fill: "snare" } },
    { name: "chorus2", bars: 8, prog: "C D Bm7 Em7 C D G G",
      lead: { m: "H1 H2 H3 H4 H1 H2 H7 H8b" }, counter: { m: "- - - CA - - - -", min: 0 },
      pad: { min: 0 }, bass: { pat: "B" }, keys: { pat: "chorus" }, stab: { pat: "stab", len: 2, min: 0 },
      arp: { pat: "g", min: 0.5 }, drums: { kit: "chorus", fill: "tom", crash: true } },
  ],
  ranges: { pad: [55, 72], keys: [57, 76], stab: [60, 79] },
  fx: { rev: { len: 1.8, tau: 0.4 }, dly: { steps: 3, fb: 0.32 } },
  patch: {
    lead: { inst: "synth", oscs: [{ t: "sawtooth", d: -11 }, { t: "sawtooth", d: 0 }, { t: "sawtooth", d: 11 }, { t: "square", d: 5, g: 0.5 }], cut: 3600, env: 2.0, fd: 0.16, q: 1.0, a: 0.01, dec: 0.5, sus: 0.8, rel: 0.1, vib: 8, vd: 0.18, g: 0.2, bright: 0.5 },
    leadDbl: { inst: "synth", oscs: [{ t: "square", d: 0 }, { t: "sawtooth", d: 6 }], cut: 5000, env: 1, a: 0.01, sus: 1, rel: 0.08, g: 0.1 },
    counter: { inst: "marimba", g: 0.5, pan: 0.35 },
    arp: { inst: "ks", kind: "pluck", g: 0.5, pan: -0.3, damp: true },
    keys: { inst: "fm", kind: "ep", idx: 1.6, g: 0.16, dec: 0.5, pan: 0.2 },
    stab: { inst: "chord", wave: "sawtooth", d: 8, w: 0.4, c0: 600, cut: 3200, fa: 0.05, a: 0.012, sus: 0.8, rel: 0.1, g: 0.2 },
    pad: { inst: "chord", wave: "sawtooth", d: 10, w: 0.7, c0: 900, cut: 1700, fa: 0.3, a: 0.35, rel: 0.6, g: 0.12 },
    bass: { inst: "synth", oscs: [{ t: "sawtooth" }, { t: "sine", g: 1.1 }], cut: 700, env: 3.5, fd: 0.1, q: 2, a: 0.004, dec: 0.25, sus: 0.75, rel: 0.05, g: 0.26 },
    kick: { f0: 165, f1: 50, dec: 0.2 },
    snare: { nf: 2800, nd: 0.07, tone: 190 },
  },
  mix: {},
};

// ===== FROSTBITE PASS: E minor, 134bpm, icy synth-pop =====
const snow = {
  id: "snow", name: "Frostbite Pass", bpm: 134, swing: 0, key: { tonic: 4, mode: "minor" },
  m: {
    S1: "E5.2 G5.2 C6.4 B5.2 G5.2 E5.4",
    S2: "D5.2 G5.2 B5.4 A5.2 G5.2 D5.4",
    S3: "F#5.2 A5.2 D6.4 C6.2 A5.2 F#5.4",
    S4: "E5.3 G5.3 B5.2 E6.8",
    S7: "E5.2 A5.2 C6.4 B5.2 A5.2 E5.4",
    S8: "F#5.2 A5.2 D6.2 r.2 A5.2 F#5.2 D5.2 r.2",
    S8b: "F#5.2 A5.2 D6.4 F#6.2 A6.2 D6.4",
    SV1: "r.4 B5.2 B5.2 G5.4 E5.4",
    SV2: "r.4 C6.2 C6.2 G5.4 E5.4",
    SV3: "r.4 B5.2 B5.2 G5.4 D5.4",
    SV4: "r.4 A5.2 A5.2 F#5.4 D5.2 F#5.2",
    SV7: "r.4 C6.2 C6.2 A5.4 E5.4",
    SV8: "A5.2 F#5.2 D5.2 F#5.2 A5.8",
    SB1: "A5.8 E6.8", SB2: "B5.8 G5.8", SB3: "G5.4 C6.4 E6.8", SB4: "F#6.8 D6.4 A5.4",
    I4: "r.8 A5.2 B5.2 D6.2 F#6.2",
    CE: "B6.1 G6.1 E6.2 r.12", CC: "C7.1 G6.1 E6.2 r.12", CG: "B6.1 G6.1 D6.2 r.12", CD: "A6.1 F#6.1 D6.2 r.12", CA: "C7.1 A6.1 E6.2 r.12",
    C4: "r.12 B5.1 E6.1 G6.1 B6.1",
    C8: "r.12 A6.1 F#6.1 D6.1 A5.1",
  },
  bass: {
    A: "R.2 r.1 R.1 R.2 r.1 R.1 O.2 r.1 R.1 R.2 r.1 A.1",
    B: "R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 A.1",
    I: "R.4 R.4 R.4 R.2 A.2",
  },
  arp: { p: "0 . 2 . 1 . 3 . 0 . 2 . 1 . 3 .", b: "0 2 1 2 3 2 1 2 0 2 1 2 3 2 1 2" },
  comp: { chord: "x.....x.....x...", stab: "..x...x...x....." },
  kits: {
    intro: { k: "x...x...x...x...", h: "..x...x...x...x." },
    verse: { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x.", o: "..x...x...x...x." },
    chorus: { k: "x...x...x...x...", s: "....x.......x...", c: "....x.......x...", h: "XgxgXgxgXgxgXgxg", o: "..x...x...x...x." },
    bridge: { k: "x.......x.......", s: "........x.......", h: "x...x...x...x..." },
  },
  sections: [
    { name: "intro", bars: 4, prog: "Em C G D",
      lead: { m: "- - - I4" }, pad: { min: 0 }, arp: { pat: "b", len: 1, min: 0 }, bass: { pat: "I", min: 0.2 },
      drums: { kit: "intro", fill: "snare" }, crash: true },
    { name: "verse", bars: 8, prog: "Em C G D Em C Am D",
      lead: { m: "SV1 SV2 SV3 SV4 SV1 SV2 SV7 SV8" }, counter: { m: "CE CC CG CD CE CC CA -", min: 0 },
      pad: { min: 0.3 }, arp: { pat: "p", len: 1 }, bass: { pat: "A" }, stab: { pat: "stab", min: 0.55 },
      drums: { kit: "verse", fill: "half", crash: true } },
    { name: "chorus", bars: 8, prog: "C G D Em C G Am D",
      lead: { m: "S1 S2 S3 S4 S1 S2 S7 S8" }, counter: { m: "- - - C4 - - - C8", min: 0.3 },
      pad: { min: 0 }, arp: { pat: "b", len: 1, min: 0.2 }, bass: { pat: "B" }, keys: { pat: "chord", min: 0.4 },
      drums: { kit: "chorus", fill: "tom", crash: true } },
    { name: "bridge", bars: 4, prog: "Am Em/G C D",
      lead: { m: "SB1 SB2 SB3 SB4" }, pad: { min: 0 }, arp: { pat: "p", len: 2, min: 0 }, bass: { pat: "I", min: 0.2 },
      drums: { kit: "bridge", fill: "snare" } },
    { name: "chorus2", bars: 8, prog: "C G D Em C G Am D",
      lead: { m: "S1 S2 S3 S4 S1 S2 S7 S8b" }, counter: { m: "- - - C4 - - - C8", min: 0 },
      pad: { min: 0 }, arp: { pat: "b", len: 1, min: 0 }, bass: { pat: "B" }, keys: { pat: "chord", min: 0 },
      drums: { kit: "chorus", fill: "tom", crash: true } },
  ],
  ranges: { pad: [55, 74], keys: [60, 79], stab: [62, 81] },
  fx: { rev: { len: 2.1, tau: 0.45 }, dly: { steps: 3, fb: 0.38 } },
  patch: {
    lead: { inst: "synth", oscs: [{ t: "sawtooth", d: -7 }, { t: "sawtooth", d: 7 }, { t: "sine", m: 2, g: 0.6 }], cut: 6200, env: 1.5, fd: 0.2, q: 1.2, a: 0.008, dec: 0.5, sus: 0.85, rel: 0.14, vib: 9, vd: 0.2, g: 0.18, bright: 0.35 },
    leadDbl: { inst: "bell", g: 0.14, dec: 0.5, ratio: 3.01 },
    counter: { inst: "bell", g: 0.2, dec: 0.7, ratio: 3.5, pan: 0.4 },
    arp: { inst: "ks", kind: "pizz", g: 0.55, pan: -0.35, damp: false },
    keys: { inst: "fm", kind: "ep", idx: 1.2, g: 0.13, dec: 0.5, pan: -0.15 },
    stab: { inst: "bell", g: 0.12, dec: 0.4, ratio: 3.5 },
    pad: { inst: "chord", wave: "sawtooth", d: 12, w: 0.8, c0: 1200, cut: 2800, fa: 0.4, a: 0.4, rel: 0.7, g: 0.1 },
    bass: { inst: "synth", oscs: [{ t: "sawtooth" }, { t: "sine", g: 1.1 }], cut: 900, env: 3, fd: 0.09, q: 2.5, a: 0.003, dec: 0.2, sus: 0.7, rel: 0.04, g: 0.26 },
    kick: { f0: 175, f1: 52, dec: 0.16 },
    snare: { nf: 3200, nd: 0.08, tone: 200 },
  },
  mix: { hat: { g: 0.6 } },
};

// ===== NEON DOCKS: A minor, 122bpm, synthwave =====
const neon = {
  id: "neon", name: "Neon Docks", bpm: 122, swing: 0, key: { tonic: 9, mode: "minor" }, extraPcs: [8],
  m: {
    N1: "C6.6 A5.2 C6.4 E6.4",
    N2: "B5.6 G5.2 B5.4 D6.4",
    N3: "C6.4 E6.4 A6.4 G6.2 E6.2",
    N4: "G6.2 E6.2 B5.4 G5.8",
    N7: "A5.2 C6.2 E6.4 D6.4 C6.4",
    N8: "E6.4 C6.4 B5.2 G#5.2 B5.4",
    NV1: "r.8 E5.4 A5.4", NV2: "C6.6 A5.2 F5.8", NV3: "r.4 E5.4 G5.4 C6.4", NV4: "D6.6 B5.2 G5.8",
    NB1: "F6.8 D6.8", NB2: "E6.8 C6.8", NB3: "C6.4 F6.4 A6.8", NB4: "G6.4 D6.4 B5.4 G#5.4",
    NI4: "r.12 E5.2 G5.2",
    CB1: "E6.2 C6.2 A5.2 C6.2 r.8", CB3: "G6.1 E6.1 C6.2 r.12",
    CH: "r.8 A5.2 C6.2 E6.2 A6.2",
  },
  bass: {
    A: "R.1 R.1 O.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 O.1 R.1 R.1 O.1",
    B: "R.1 R.1 O.1 R.1 R.1 O.1 R.1 R.1 R.1 R.1 O.1 R.1 R.1 O.1 R.1 A.1",
    I: "R.1 R.1 O.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 O.1 R.1 R.1 O.1",
  },
  arp: { a: "0 . 2 1 . 2 3 . 2 1 . 2 3 . 2 .", b: "0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1" },
  comp: { pulse: "x..x..x...x..x..", long: "x...............", stab: "x.....x.........", hold: "x.......x......." },
  kits: {
    intro: { k: "x...x...x...x...", h: "..x...x...x...x." },
    verse: { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x.", o: "..x...x...x...x." },
    chorus: { k: "x...x...x...x...", s: "....X.......X...", c: "....x.......x...", h: "xxxxxxxxxxxxxxxx", o: "..x...x...x...x." },
    bridge: { k: "x.......x.......", s: "........X.......", h: "x.x.x.x.x.x.x.x." },
  },
  sections: [
    { name: "intro", bars: 4, prog: "Am F C G",
      lead: { m: "- - - NI4" }, pad: { min: 0 }, arp: { pat: "a", len: 1, min: 0 }, bass: { pat: "I", min: 0 },
      drums: { kit: "intro", fill: "snare" }, crash: true },
    { name: "verse", bars: 8, prog: "Am F C G Am F C G",
      lead: { m: "- - - - NV1 NV2 NV3 NV4" }, counter: { m: "- - - - CB1 - CB3 -", min: 0 },
      pad: { min: 0 }, arp: { pat: "b", len: 1, min: 0.3 }, bass: { pat: "A" }, keys: { pat: "pulse", min: 0.2 },
      drums: { kit: "verse", fill: "half", crash: true } },
    { name: "chorus", bars: 8, prog: "F G Am Em F G Am Am|E",
      lead: { m: "N1 N2 N3 N4 N1 N2 N7 N8" }, counter: { m: "- - - - - - - -", min: 0 },
      pad: { min: 0 }, arp: { pat: "a", len: 1, min: 0.4 }, bass: { pat: "B" }, keys: { pat: "hold", min: 0.35 },
      stab: { pat: "stab", len: 3, min: 0.55 }, drums: { kit: "chorus", fill: "tom", crash: true } },
    { name: "bridge", bars: 4, prog: "Dm Am F G|E",
      lead: { m: "NB1 NB2 NB3 NB4" }, pad: { min: 0 }, arp: { pat: "b", len: 2, min: 0.3 }, bass: { pat: "I", min: 0 },
      drums: { kit: "bridge", fill: "tom" } },
    { name: "chorus2", bars: 8, prog: "F G Am Em F G Am Am|E",
      lead: { m: "N1 N2 N3 N4 N1 N2 N7 N8" }, pad: { min: 0 }, arp: { pat: "a", len: 1, min: 0 }, bass: { pat: "B" },
      keys: { pat: "hold", min: 0 }, stab: { pat: "stab", len: 3, min: 0 }, drums: { kit: "chorus", fill: "snare", crash: true } },
  ],
  bassLo: 33,
  ranges: { pad: [53, 72], keys: [57, 76], stab: [60, 79] },
  fx: { rev: { len: 2.6, tau: 0.55 }, dly: { steps: 3, fb: 0.4 } },
  patch: {
    lead: { inst: "synth", oscs: [{ t: "sawtooth", d: -16 }, { t: "sawtooth", d: -5 }, { t: "sawtooth", d: 5 }, { t: "sawtooth", d: 16 }], cut: 4200, env: 1.8, fd: 0.3, q: 1.4, a: 0.02, dec: 0.6, sus: 0.85, rel: 0.2, vib: 10, vd: 0.3, g: 0.15, bright: 0.3 },
    leadDbl: { inst: "synth", oscs: [{ t: "sawtooth", d: -8 }, { t: "square", d: 8 }], cut: 5200, env: 1, a: 0.02, sus: 1, rel: 0.15, g: 0.07 },
    counter: { inst: "bell", g: 0.2, dec: 0.9, ratio: 3.5, pan: 0.4 },
    arp: { inst: "synth", oscs: [{ t: "sawtooth", d: -6 }, { t: "square", d: 6, g: 0.6 }], cut: 1900, env: 3.2, fd: 0.07, q: 3, a: 0.003, dec: 0.08, sus: 0.0, rel: 0.05, g: 0.2, pan: -0.3, bright: 0.4 },
    keys: { inst: "fm", kind: "ep", idx: 1.4, g: 0.15, dec: 0.8, pan: 0.2 },
    stab: { inst: "chord", wave: "sawtooth", d: 10, w: 0.6, c0: 500, cut: 2800, fa: 0.08, a: 0.01, sus: 0.7, rel: 0.2, g: 0.16 },
    pad: { inst: "chord", wave: "sawtooth", d: 14, w: 0.85, c0: 700, cut: 1900, fa: 0.7, a: 0.6, rel: 0.9, g: 0.13 },
    bass: { inst: "synth", oscs: [{ t: "sawtooth", d: -4 }, { t: "sawtooth", d: 4 }, { t: "sine", g: 1.0 }], cut: 650, env: 4, fd: 0.08, q: 3, a: 0.003, dec: 0.06, sus: 0.9, rel: 0.03, g: 0.2 },
    kick: { f0: 160, f1: 46, dec: 0.22 },
    snare: { nf: 2200, nd: 0.16, tone: 180, gate: 0.2 },
  },
  mix: { snare: { rev: 0.45 }, pad: { g: 0.95 } },
};

// ===== MENU: F major, 116bpm, welcoming hook-driven loop =====
const menu = {
  id: "menu", name: "Title", bpm: 116, swing: 0.04, key: { tonic: 5, mode: "major" },
  m: {
    M1: "A4.2 C5.2 F5.4 E5.2 D5.2 C5.4",
    M2: "G4.2 C5.2 E5.4 D5.2 C5.2 G4.4",
    M3: "A4.2 D5.2 F5.4 E5.2 D5.2 A4.4",
    M4: "D5.2 F5.2 A5.4 G5.4 F5.4",
    M7: "D5.2 F5.2 Bb5.4 A5.2 G5.2 F5.4",
    M8: "G5.2 E5.2 C5.2 E5.2 G5.8",
    MB1: "D5.4 F5.4 Bb5.8", MB2: "E5.4 G5.4 C6.8", MB3: "C6.4 A5.4 E5.4 C5.4", MB4: "D5.4 F5.4 A5.4 D6.4",
    MB5: "Bb5.4 A5.4 F5.8", MB6: "G5.4 Bb5.4 D6.8", MB7: "E5.4 G5.4 Bb5.4 G5.4", MB8: "C6.4 G5.4 E5.4 C5.2 E5.2",
    K2: "r.8 G5.2 C6.2 E6.4", K4: "r.8 E6.2 G6.2 C7.4", K1: "r.8 C6.2 F6.2 A6.4",
  },
  bass: {
    A: "R.3 r.1 R.2 r.2 O.2 F.2 R.2 r.1 A.1",
    B: "R.4 R.2 O.2 R.4 F.2 A.2",
  },
  arp: { m: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 1 .", h: "0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1" },
  comp: { c: "x.....x.....x...", d: "..x...x...x...x." },
  kits: {
    a: { k: "x.......x.......", s: "........x.......", c: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    b: { k: "x.....x.x.......", s: "....x.......x...", h: "XgxgXgxgXgxgXgxg", o: "......x.......x." },
  },
  sections: [
    { name: "A", bars: 4, prog: "F C/E Dm7 Bbmaj7",
      lead: { m: "M1 M2 M3 M4" }, pad: { min: 0 }, arp: { pat: "m", len: 1, min: 0 }, bass: { pat: "A" }, keys: { pat: "c", min: 0.5 },
      drums: { kit: "a", fill: "half", crash: true } },
    { name: "A2", bars: 4, prog: "F C/E Bb C",
      lead: { m: "M1 M2 M7 M8" }, counter: { m: "- K2 - K4", min: 0 }, pad: { min: 0 }, arp: { pat: "m", len: 1, min: 0 }, bass: { pat: "A" }, keys: { pat: "c", min: 0 },
      drums: { kit: "b" } },
    { name: "B", bars: 4, prog: "Bb C Am7 Dm7",
      lead: { m: "MB1 MB2 MB3 MB4" }, pad: { min: 0 }, arp: { pat: "h", len: 1, min: 0.3 }, bass: { pat: "B" }, keys: { pat: "d", min: 0 },
      drums: { kit: "b", fill: "half" } },
    { name: "B2", bars: 4, prog: "Bb Gm7 C7 C7",
      lead: { m: "MB5 MB6 MB7 MB8" }, counter: { m: "K1 - - -", min: 0 }, pad: { min: 0 }, arp: { pat: "h", len: 1, min: 0.3 }, bass: { pat: "B" }, keys: { pat: "d", min: 0 },
      drums: { kit: "b", fill: "snare" } },
  ],
  ranges: { pad: [53, 72], keys: [57, 76], stab: [60, 79] },
  fx: { rev: { len: 1.9, tau: 0.42 }, dly: { steps: 3, fb: 0.3 } },
  patch: {
    lead: { inst: "fm", kind: "ep", idx: 2.0, g: 0.24, dec: 0.9, pan: 0.05, tine: 1 },
    leadDbl: { inst: "synth", oscs: [{ t: "sawtooth", d: -9 }, { t: "sawtooth", d: 9 }], cut: 3200, env: 1.6, fd: 0.2, a: 0.02, sus: 0.8, rel: 0.12, vib: 7, vd: 0.2, g: 0.09 },
    counter: { inst: "bell", g: 0.2, dec: 0.8, ratio: 3.5, pan: 0.4 },
    arp: { inst: "marimba", g: 0.4, pan: -0.3, dec: 0.28 },
    keys: { inst: "fm", kind: "ep", idx: 1.2, g: 0.13, dec: 0.5, pan: -0.2 },
    stab: { inst: "bell", g: 0.1 },
    pad: { inst: "chord", wave: "sawtooth", d: 10, w: 0.7, c0: 900, cut: 1700, fa: 0.3, a: 0.5, rel: 0.7, g: 0.12 },
    bass: { inst: "synth", oscs: [{ t: "sawtooth" }, { t: "sine", g: 1.1 }], cut: 650, env: 2.5, fd: 0.12, q: 1.5, a: 0.005, dec: 0.3, sus: 0.7, rel: 0.06, g: 0.26 },
    kick: { f0: 150, f1: 50, dec: 0.18 },
    snare: { nf: 2600, nd: 0.07, tone: 185 },
  },
  mix: {},
};

// ===== RESULTS: C major, 100bpm. Fanfare then relaxed loop =====
const results = {
  id: "results", name: "Results", bpm: 100, swing: 0.05, key: { tonic: 0, mode: "major" }, loopFrom: 1,
  m: {
    R1: "G4.2 C5.2 E5.2 G5.2 C6.8", R2: "F5.4 A5.4 G5.4 B5.4", R3: "C6.4 G5.4 E6.4 C6.4", R4: "C6.16",
    L1: "E5.4 G5.2 E5.2 D5.4 C5.4", L2: "D5.4 G5.4 B4.4 D5.4", L3: "E5.4 A5.2 G5.2 E5.4 C5.4", L4: "B4.4 E5.4 G5.8",
    L5: "A5.4 C6.2 A5.2 G5.4 F5.4", L6: "G5.4 E5.4 C5.8", L7: "D5.4 F5.4 A5.4 C6.4", L8: "B5.8 G5.4 D5.4",
    Q1: "r.8 G5.2 C6.2 E6.4", Q3: "r.8 C6.2 E6.2 A6.4", Q5: "r.8 A5.2 C6.2 F6.4", Q7: "r.8 F6.2 A6.2 D7.4",
  },
  bass: { A: "R.3 r.1 R.2 r.2 O.2 F.2 R.2 r.1 A.1", F: "R.4 r.4 R.4 r.4" },
  arp: { m: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 1 ." },
  comp: { c: "x.....x.....x...", f: "x...x...x...x..." },
  kits: {
    fan: { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    loop: { k: "x.......x.......", s: "....x.......x...", h: "..x...x...x...x." },
  },
  sections: [
    { name: "fanfare", bars: 4, prog: "C F|G C C",
      lead: { m: "R1 R2 R3 R4" }, pad: { min: 0 }, stab: { pat: "f", len: 2, min: 0 }, bass: { pat: "F", min: 0 },
      drums: { kit: "fan", fill: "roll", crash: true }, keys: { pat: "f", min: 0 } },
    { name: "loopA", bars: 8, prog: "C G/B Am7 Em7 F C/E Dm7 G",
      lead: { m: "L1 L2 L3 L4 L5 L6 L7 L8" }, pad: { min: 0 }, arp: { pat: "m", len: 1, min: 0.3 }, bass: { pat: "A" }, keys: { pat: "c", min: 0.5 },
      drums: { kit: "loop", fill: "half" } },
    { name: "loopB", bars: 8, prog: "C G/B Am7 Em7 F C/E Dm7 G",
      lead: { m: "L1 L2 L3 L4 L5 L6 L7 L8" }, counter: { m: "Q1 - Q3 - Q5 - Q7 -", min: 0 }, pad: { min: 0 }, arp: { pat: "m", len: 1, min: 0 }, bass: { pat: "A" }, keys: { pat: "c", min: 0 },
      drums: { kit: "loop", fill: "half" } },
  ],
  ranges: { pad: [53, 72], keys: [57, 76], stab: [58, 79] },
  fx: { rev: { len: 2.0, tau: 0.45 }, dly: { steps: 3, fb: 0.3 } },
  patch: {
    lead: { inst: "fm", kind: "ep", idx: 1.7, g: 0.22, dec: 0.9, pan: 0.05, tine: 1 },
    leadDbl: { inst: "chord", wave: "sawtooth", d: 8, w: 0.3, c0: 700, cut: 2600, fa: 0.06, a: 0.02, sus: 0.8, rel: 0.2, g: 0.08 },
    counter: { inst: "bell", g: 0.2, dec: 0.9, ratio: 3.5, pan: 0.4 },
    arp: { inst: "marimba", g: 0.38, pan: -0.3, dec: 0.28 },
    keys: { inst: "fm", kind: "ep", idx: 1.2, g: 0.13, dec: 0.5, pan: -0.2 },
    stab: { inst: "chord", wave: "sawtooth", d: 8, w: 0.4, c0: 500, cut: 3400, fa: 0.05, a: 0.012, sus: 0.85, rel: 0.25, g: 0.26 },
    pad: { inst: "chord", wave: "sawtooth", d: 10, w: 0.7, c0: 900, cut: 1900, fa: 0.3, a: 0.3, rel: 0.7, g: 0.13 },
    bass: { inst: "synth", oscs: [{ t: "sawtooth" }, { t: "sine", g: 1.1 }], cut: 650, env: 2.5, fd: 0.12, q: 1.5, a: 0.005, dec: 0.3, sus: 0.7, rel: 0.06, g: 0.26 },
    kick: { f0: 150, f1: 50, dec: 0.18 },
    snare: { nf: 2600, nd: 0.07, tone: 185 },
  },
  mix: {},
};

export const THEMES = { menu, sunset, snow, neon, results };
export const RACE_THEMES = ["sunset", "snow", "neon"];
export { THEME_DEFAULTS };

// Apex Karts - music DATA layer. Pure data + pure functions, no WebAudio.
// Each theme is a small arrangement written in a compact notation that compileTheme() expands into
// per-bar, per-16th-step event lists; audio/src/gen_music.mjs turns those into MIDI (rendered offline with ferrosintesis).
//
// Lanes (section.lanes.<part>) hold one entry per bar; entries may be repeated with "name*N"; "-" = rest,
// "_" = continuation of a 2-bar motif. A lane key may carry an intensity window: "perc?0.4" (only when the
// race intensity >= 0.4) or "plain?0-0.5". The part's `kind` (in theme.patch) decides how entries read:
//   mel    entry = motif name from theme.m (optionally "name^2" = transpose +2 semitones). A motif is a bar
//          string "G5.3 E5.1 r.2 C5+E5.4!" : NOTE[.len16][!|*], "A+B" = chord, r = rest, "!" accent, "*" soft.
//          Total length per motif must be 16 (one bar) or 32 (two bars: the next entry must be "_").
//   bass   entry = name from theme.bp, tokens R root, O oct up, D oct down, T 3rd, F 5th, S 7th, A approach
//          from below, a approach from above, x dead-note, r rest; each "TOKEN.len[!|*]"; sums to 16.
//   comp   entry = name from theme.cp, 16 chars: X accent, x hit, g ghost/chuck, "-" hold, "." rest.
//          Chord voicing follows the patch (rng, noRoot, n) with smooth voice-leading.
//   arp    entry = name from theme.ap, 16 tokens "." or chord-tone index [":len"][!].
//   drums  entry = name from theme.dr = { kick:"X...x...", snare:"....", hat:... } 16 chars each (X x g).
// Progressions: bars separated by spaces, "A|B" = two chords in a bar (or 4 chords), "Am*2" repeats.
// section.tr transposes the whole section (chords, melodies, bass) by that many semitones.

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
  "": [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  sus4: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 2], m9: [0, 3, 7, 10, 2], "9": [0, 4, 7, 10, 2], maj9: [0, 4, 7, 11, 2],
  "7sus": [0, 5, 7, 10], dim: [0, 3, 6], m7b5: [0, 3, 6, 10], 5: [0, 7], "13": [0, 4, 7, 10, 9], "7#9": [0, 4, 7, 10, 3],
  madd9: [0, 3, 7, 2], "7b9": [0, 4, 7, 10, 1],
};
export function parseChord(sym, tr = 0) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !QUAL[m[2]]) throw new Error("bad chord " + sym);
  const root = (pcOf(m[1]) + tr + 120) % 12;
  const ivs = QUAL[m[2]];
  const pcs = ivs.map((i) => (root + i) % 12);
  return { sym, root, ivs, pcs, bassPc: m[3] ? (pcOf(m[3]) + tr + 120) % 12 : root };
}

const VEL = { X: 1, x: 0.78, g: 0.4 };

function expandList(str, label) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^(.*)\*(\d+)$/.exec(tok);
    if (m) for (let i = 0; i < +m[2]; i++) out.push(m[1]); else out.push(tok);
  }
  return out;
}

function parseBarString(str, label, NS = 16) {
  const out = [];
  let s = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const m = /^([^.\s]+)\.(\d+)([!*]?)$/.exec(tok);
    if (!m) throw new Error(label + ": bad token '" + tok + "'");
    const l = parseInt(m[2], 10);
    out.push({ s, l, tok: m[1], v: m[3] === "!" ? 1 : m[3] === "*" ? 0.55 : 0.82 });
    s += l;
  }
  if (s !== NS && s !== 2 * NS) throw new Error(label + ": bar sums to " + s + " (" + str + ")");
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

function parseKey(k) {
  const m = /^([^?<]+)(?:\?([\d.]+)(?:-([\d.]+))?)?$/.exec(k);
  if (!m) throw new Error("bad lane key " + k);
  return { name: m[1], min: m[2] ? +m[2] : 0, max: m[3] ? +m[3] : 9 };
}

// ---- compile -----------------------------------------------------------------------------------
export function compileTheme(th) {
  const NS = th.steps || 16;               // steps per bar (16 = 4/4 sixteenths; 12 = 12/8 / two 6/8 jig bars of eighths)
  const bars = [];
  const prevV = {};
  const P = th.patch;
  const bassLo = th.bassLo || 28;
  const chordFlat = [];
  const secBars = [];
  th.sections.forEach((sec, si) => {
    const toks = expandList(sec.prog);
    if (toks.length !== sec.bars) throw new Error(th.id + "/" + sec.name + ": prog has " + toks.length + " bars, need " + sec.bars);
    secBars.push(toks);
    toks.forEach((tok, bi) => tok.split("|").forEach((sym, ci) => chordFlat.push({ si, bi, ci, c: parseChord(sym, sec.tr || 0) })));
  });
  let fi = 0;
  const pend = {};                // events that spill into later bars: pend[barIndex] = [[step,ev]]
  th.sections.forEach((sec, si) => {
    const label = th.id + "/" + sec.name;
    const tr = sec.tr || 0;
    const lanes = Object.entries(sec.lanes || {}).map(([k, v]) => ({ ...parseKey(k), list: expandList(v) }));
    for (const ln of lanes) {
      if (ln.list.length !== sec.bars) throw new Error(label + " lane " + ln.name + " has " + ln.list.length + " entries, need " + sec.bars);
      if (!P[ln.name]) throw new Error(label + ": lane " + ln.name + " has no patch");
    }
    for (let bi = 0; bi < sec.bars; bi++) {
      const syms = secBars[si][bi].split("|");
      const n = syms.length;
      if (NS % n !== 0 || n > 4) throw new Error(label + ": chords per bar must divide " + NS + " (max 4)");
      const span = NS / n;
      const chords = syms.map((sym, ci) => {
        const c = parseChord(sym, tr);
        c.bass = bassNote(c.bassPc, bassLo);
        c._flat = fi++;
        c.s0 = ci * span; c.s1 = (ci + 1) * span;
        return c;
      });
      const chordAt = (s) => chords[Math.min(n - 1, Math.floor(s / span))];
      const nextChord = (s) => {
        const ci = Math.min(n - 1, Math.floor(s / span));
        return chordFlat[(chords[ci]._flat + 1) % chordFlat.length].c;
      };
      const barIdx = bars.length;
      const bar = { si, sec: sec.name, bi, chords, at: Array.from({ length: NS }, () => []) };
      bars.push(bar);
      const addAbs = (bIdx, s, e) => {
        if (bIdx === barIdx) bar.at[s].push(e);
        else (pend[bIdx] || (pend[bIdx] = [])).push([s, e]);
      };
      for (const ln of lanes) {
        const entry = ln.list[bi];
        if (entry === "-" || entry === "_") continue;
        const patch = P[ln.name];
        const kind = patch.kind;
        const win = { min: ln.min, max: ln.max };
        const L = label + "/" + ln.name;
        if (kind === "mel") {
          const m = /^([^^]+)(?:\^(-?\d+))?$/.exec(entry);
          const str = th.m[m[1]];
          if (str == null) throw new Error(L + ": unknown motif " + m[1]);
          const t2 = tr + (m[2] ? +m[2] : 0);
          for (const ev of parseBarString(str, L + "/" + m[1], NS)) {
            if (ev.tok === "r") continue;
            const notes = ev.tok.split("+").map((x) => noteToMidi(x) + t2);
            const b = barIdx + Math.floor(ev.s / NS);
            addAbs(b, ev.s % NS, { p: ln.name, n: notes, l: ev.l, v: ev.v, ...win });
          }
        } else if (kind === "bass") {
          const str = th.bp[entry];
          if (str == null) throw new Error(L + ": unknown bass pattern " + entry);
          for (const ev of parseBarString(str, L + "/" + entry, NS)) {
            if (ev.tok === "r") continue;
            const c = chordAt(ev.s);
            const blo = patch.lo || bassLo;
            const cb = bassNote(c.bassPc, blo);
            let nn, ghost = false;
            switch (ev.tok) {
              case "R": nn = cb; break;
              case "x": nn = cb; ghost = true; break;
              case "O": nn = cb + 12; break;
              case "D": nn = cb - 12; break;
              case "T": nn = cb + ((c.pcs[1] - c.bassPc + 12) % 12); break;
              case "F": nn = cb + ((c.pcs[2] - c.bassPc + 12) % 12); break;
              case "S": nn = cb + ((c.pcs[Math.min(3, c.pcs.length - 1)] - c.bassPc + 12) % 12); break;
              case "A": nn = bassNote(nextChord(ev.s).bassPc, blo) - 1; break;
              case "a": nn = bassNote(nextChord(ev.s).bassPc, blo) + 1; break;
              default: throw new Error(L + ": bad bass token " + ev.tok);
            }
            if (nn < blo - 2) nn += 12;
            bar.at[ev.s].push({ p: ln.name, n: [nn], l: ev.l, v: ghost ? 0.4 : ev.v, gh: ghost, ...win });
          }
        } else if (kind === "comp") {
          const str = th.cp[entry];
          if (str == null) throw new Error(L + ": unknown comp pattern " + entry);
          if (str.length !== NS) throw new Error(L + ": comp pattern length " + entry);
          const rng = patch.rng || [52, 76];
          for (let s = 0; s < NS; s++) {
            const ch = str[s];
            if (ch === "." || ch === "-") continue;
            let l = 1;
            while (s + l < NS && str[s + l] === "-") l++;
            const c = chordAt(s);
            let pcs = c.pcs;
            if (patch.pick) pcs = patch.pick.map((i) => c.pcs[Math.min(i, c.pcs.length - 1)]);
            if (patch.noRoot && pcs.length > 2) pcs = pcs.slice(1);
            if (patch.n && pcs.length > patch.n) pcs = pcs.slice(0, patch.n);
            const key = ln.name;
            const notes = voiceLead(pcs, prevV[key], rng[0], rng[1]);
            prevV[key] = notes;
            const ce = Math.max(1, c.s1 - s);
            bar.at[s].push({ p: ln.name, n: notes, l, v: VEL[ch] || 0.78, gh: ch === "g", ce, up: ch === "X", ...win });
          }
        } else if (kind === "arp") {
          const toks = th.ap[entry];
          if (toks == null) throw new Error(L + ": unknown arp pattern " + entry);
          const arr = toks.trim().split(/\s+/);
          if (arr.length !== NS) throw new Error(L + ": arp pattern length " + arr.length);
          const lo = patch.arpLo || 60;
          arr.forEach((tk, s) => {
            if (tk === ".") return;
            const m = /^(\d+)(?::(\d+))?(!?)$/.exec(tk);
            if (!m) throw new Error(L + ": bad arp token " + tk);
            const c = chordAt(s);
            const tones = stackFrom([c.root, ...c.pcs.slice(1)], lo + ((c.root - lo) % 12 + 12) % 12);
            const idx = +m[1];
            const nn = tones[idx % tones.length] + 12 * Math.floor(idx / tones.length);
            bar.at[s].push({ p: ln.name, n: [nn], l: m[2] ? +m[2] : (patch.len || 1), v: m[3] ? 1 : 0.72, ...win });
          });
        } else if (kind === "drums") {
          const pat = (th.dr && th.dr[entry]) || (th.perc && th.perc[entry]);
          if (!pat) throw new Error(L + ": unknown drum pattern " + entry);
          for (const [dn, str] of Object.entries(pat)) {
            if (str.length !== NS) throw new Error(L + ": drum '" + dn + "' length in " + entry);
            for (let s = 0; s < NS; s++) if (str[s] !== "." && VEL[str[s]]) bar.at[s].push({ p: ln.name, d: dn, v: VEL[str[s]], ...win });
          }
        } else throw new Error(L + ": unknown kind " + kind);
      }
    }
  });
  for (const [bi, list] of Object.entries(pend)) {
    const b = bars[+bi % bars.length];
    for (const [s, e] of list) b.at[s].push(e);
  }
  const loopBar = Math.max(0, bars.findIndex((b) => b.si === (th.loopFrom || 0)));
  const banks = [];
  const core = [];
  for (const p of Object.values(P)) {
    for (const b of [p.bank, p.dbl && p.dbl.bank]) if (b && !banks.includes(b)) banks.push(b);
    if (p.core && !core.includes(p.bank)) core.push(p.bank);
  }
  return { id: th.id, bpm: th.bpm, bars, loopBar, th, banks, core, NS };
}

const THEMES_BUILD = {};

// ===== MENU: C major, 116 bpm, upbeat orchestral-pop / fanfare-lite =====
const menu = {
  id: "menu", name: "Welcome to Apex", bpm: 116, swing: 0.04, lift: 0.0, loopFrom: 0, level: 1,
  master: { lo: -2, mud: -1.5, pres: 1.2, air: 2, makeup: 3 },
  fx: { hall: 0.6, room: 0.45, plate: 0.3, gate: 0.3, dly: { steps: 3, fb: 0.28, ret: 0.35 } },
  m: {
    // A: the glockenspiel / trumpet hook
    MA1: "G5.4 E5.2 G5.2 C6.6 r.2",
    MA2: "B5.4 G5.2 B5.2 D6.6 r.2",
    MA3: "C6.4 A5.2 C6.2 E6.4 D6.2 C6.2",
    MA4: "A5.4 G5.2 F5.2 A5.4 C6.4",
    MA5: "G5.4 E5.2 G5.2 C6.4 E6.4",
    MA6: "D6.4 B5.2 D6.2 G6.6 r.2",
    MA7: "F6.4 E6.2 D6.2 C6.4 A5.4",
    MA8: "D6.4 B5.4 G5.4 r.4",
    // B: the singing tune (trumpet / flute)
    MB1: "A5.6 G5.2 F5.4 A5.4",
    MB2: "B5.6 A5.2 G5.4 B5.4",
    MB3: "G5.4 B5.4 E6.4 B5.4",
    MB4: "C6.4 E6.4 A5.8",
    MB5: "A5.4 C6.4 F6.4 E6.4",
    MB6: "D6.6 B5.2 G5.4 B5.4",
    MB7: "C6.8 E6.4 G5.4",
    MB8: "G5.4 r.4 G5.2 A5.2 B5.2 C6.2",
    // C: bridge (violin / strings legato)
    MC1: "E6.8 C6.4 A5.4",
    MC2: "B5.6 G5.2 E5.8",
    MC3: "A5.8 C6.4 F6.4",
    MC4: "E6.6 D6.2 C6.8",
    MC5: "F6.6 E6.2 D6.8",
    MC6: "D6.4 B5.4 G5.4 D6.4",
    MC7: "G#5.4 B5.4 D6.4 E6.4",
    MC8: "D6.8 r.8",
    // fanfare hits
    FH1: "C5+E5+G5+C6.3 r.1 C5+E5+G5+C6.4 r.8",
    FH2: "F5+A5+C6.3 r.1 G5+B5+D6.4 r.8",
    FH3: "r.14 G5+B5+D6.2",
    SP1: "r.4 C6.2 r.2 E6.2 r.2 G6.2 r.2",
  },
  bp: {
    a: "R.4 r.2 R.2 F.4 R.2 A.2",
    b: "R.2 r.2 R.2 O.2 R.2 r.2 F.2 A.2",
    h: "R.8 F.4 A.4",
    s: "R.6 r.2 R.4 O.2 A.2",
  },
  cp: {
    pad: "x---------------",
    stab: "x..x..x.x.......",
    hit: "x.......x.......",
    hits: "x..x..x.x..x.x..",
  },
  ap: {
    pn: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 1 .",
    pn2: "0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1",
    pz: "0! . 1 . 2 . 1 . 0! . 1 . 2 . 3 .",
    gl: "2 . 4 . 3 . 4 . 2 . 4 . 3 . 4 .",
  },
  dr: {
    l: { kick: "X.......X.......", stick: "....x.......x...", shaker: "x.x.x.x.x.x.x.x." },
    lf: { kick: "X.......X.......", snare: "....x...x.x.xxxx", crash: "................" },
    g: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
    gc: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "X..............." },
    gf: { kick: "X.......X.......", snare: "....X...x.x.xxxx", tomM: "................", crash: "................", hat: "x.x.x.x.........", tomH: "..........x....." },
    b: { kick: "X...x...X...x...", snare: "....X.......X...", ride: "x.x.x.x.x.x.x.x." },
    bf: { kick: "X.......X.......", snare: "....x...x.x.xxxx", tomL: "................" },
  },
  perc: { tm: { tamb: "x.x.x.x.x.x.x.x." }, tm2: { tamb: "....x.......x..." } },
  patch: {
    drums: { kind: "drums", bank: "kitRoom", core: true, bus: "drum", g: 1, room: 0.12,
      dk: {
        kick: { g: 0.9, hp: 36, pk: [[70, 1.5, 1], [400, -3, 1.2], [3500, 2, 1]] },
        snare: { g: 0.7, room: 0.2, plate: 0.15, pk: [[220, 1.5, 1], [4500, 1.5, 1]] },
        stick: { g: 0.5, room: 0.2, pan: -0.15 },
        hat: { g: 0.28, pan: -0.3, hp: 400 }, shaker: { g: 0.3, pan: 0.35, hp: 800 },
        ride: { g: 0.35, pan: 0.3, hp: 300, plate: 0.15 },
        tomL: { g: 0.7, pan: -0.35, room: 0.2 }, tomM: { g: 0.7, pan: 0, room: 0.2 }, tomH: { g: 0.7, pan: 0.3, room: 0.2 },
        crash: { g: 0.5, pan: 0.35, plate: 0.2, hp: 300 },
      } },
    perc: { kind: "drums", bank: "kitRoom", bus: "drum", g: 1, duckKick: false, dk: { tamb: { g: 0.4, pan: 0.4, hp: 600, room: 0.1 } } },
    bass: { kind: "bass", bank: "bassF", core: true, bus: "bass", g: 1, hp: 38, pk: [[110, 1.5, 1], [900, 2, 1]], rel: 0.1, att: 0.004, len: 0.9 },
    piano: { kind: "arp", bank: "piano", core: true, arpLo: 50, len: 3, bus: "mus", g: 0.8, hp: 140, pan: -0.15, rev: 0.25, plate: 0.1, rel: 0.35, att: 0.002 },
    pianoM: { kind: "mel", bank: "piano", bus: "mus", g: 0.8, hp: 200, pan: -0.1, rev: 0.25, rel: 0.3, att: 0.002 },
    pad: { kind: "comp", bank: "strings", bus: "mus", g: 0.6, rng: [48, 70], hp: 160, rev: 0.4, chorus: 0.4, att: 0.12, rel: 0.6, len: 1.0, hold: "chord", jit: 0.01, late: 0.01 },
    pizz: { kind: "arp", bank: "pizz", arpLo: 60, len: 1, bus: "mus", g: 0.8, hp: 200, pan: 0.3, rev: 0.25, room: 0.1, rel: 0.1, att: 0.002 },
    horns: { kind: "comp", bank: "brass", bus: "mus", g: 0.7, rng: [55, 76], n: 3, strum: 0.004, hp: 200, pan: 0.2, rev: 0.25, room: 0.1, rel: 0.08, att: 0.01, len: 0.75, pk: [2800, 1.5, 1] },
    fan: { kind: "mel", bank: "brass", bus: "mus", g: 0.7, hp: 200, pan: 0.15, rev: 0.3, room: 0.1, rel: 0.1, att: 0.01, len: 0.75, pk: [2800, 1.5, 1] },
    glock: { kind: "mel", bank: "glock", bus: "lead", g: 0.7, hp: 500, pan: 0.2, rev: 0.4, dly: 0.25, rel: 0.5 },
    glockA: { kind: "arp", bank: "glock", arpLo: 72, len: 2, bus: "mus", g: 0.5, hp: 500, pan: 0.3, rev: 0.4, dly: 0.3, rel: 0.5 },
    trumpet: { kind: "mel", bank: "trumpet", bus: "lead", g: 0.9, hp: 220, pan: 0.05, rev: 0.3, dly: 0.12, rel: 0.12, att: 0.015, len: 0.92, pk: [2800, 1.5, 1] },
    flute: { kind: "mel", bank: "flute", bus: "lead", g: 0.85, hp: 300, pan: -0.15, rev: 0.4, dly: 0.2, rel: 0.25, att: 0.04, len: 0.97 },
    violin: { kind: "mel", bank: "violin", bus: "lead", g: 0.8, hp: 220, pan: -0.15, rev: 0.4, dly: 0.12, rel: 0.2, att: 0.05, len: 0.97, chorus: 0.2 },
  },
  sections: [
    { name: "a1", bars: 8, prog: "C G Am F C G F G7sus",
      lanes: {
        drums: "l*7 lf", bass: "a*8", piano: "pn*8", glock: "MA1 MA2 MA3 MA4 MA5 MA6 MA7 MA8", pad: "pad*8",
        "perc?0.4": "tm*8", "fan?0.6": "FH1 - - - - - - -" } },
    { name: "b", bars: 8, prog: "F G Em Am F G C C",
      lanes: {
        drums: "g*7 gf", bass: "b*8", piano: "pn2*8", pad: "pad*8", trumpet: "MB1 MB2 MB3 MB4 MB5 MB6 MB7 MB8",
        flute: "-*8", pizz: "pz*8", horns: "hit*8", glockA: "gl*8", perc: "tm2*8" } },
    { name: "a2", bars: 8, prog: "C G Am F C G F G7sus",
      lanes: {
        drums: "gc g g g g g g gf", bass: "b*8", piano: "pn2*8", pad: "pad*8", glock: "MA1 MA2 MA3 MA4 MA5 MA6 MA7 MA8", trumpet: "MA1^-12 MA2^-12 MA3^-12 MA4^-12 MA5^-12 MA6^-12 MA7^-12 MA8^-12",
        horns: "hits*8", perc: "tm*8" } },
    { name: "c", bars: 8, prog: "Am Em F C Dm G E7 G",
      lanes: {
        drums: "b*7 bf", bass: "h*8", piano: "pn*8", pad: "pad*8", violin: "MC1 MC2 MC3 MC4 MC5 MC6 MC7 MC8", pizz: "-*8", perc: "tm2*8" } },
  ],
};
THEMES_BUILD.menu = menu;

// ===== SUNSET COAST: A major, 112 bpm, sunny funk / surf-rock band =====
const sunset = {
  id: "sunset", name: "Sunset Coast", bpm: 116, swing: 0.11, lift: 0.04, loopFrom: 1, level: 1,
  master: { lo: -2, mud: -1.5, pres: 1.5, air: 2, makeup: 3 },
  fx: { hall: 0.5, room: 0.55, plate: 0.35, gate: 0.5, dly: { steps: 3, fb: 0.28, ret: 0.4 } },
  m: {
    // verse melody (tenor sax, low and laid back)
    V1: "r.2 E4.2 A4.2 r.2 C#5.4 B4.2 A4.2",
    V2: "A4.4 F#4.2 A4.2 C#5.6 r.2",
    V3: "B4.2 D5.2 B4.2 A4.2 F#4.4 r.4",
    V4: "G#4.4 B4.2 G#4.2 E4.4 r.2 B4.2",
    V6: "A4.2 C#5.2 E5.6 C#5.2 A4.4",
    V7: "D5.4 B4.2 D5.2 F#5.4 E5.2 D5.2",
    V8: "E5.6 D5.2 B4.4 r.2 B4.2",
    // pre-chorus (sax, climbing)
    P1: "D5.2 F#5.2 A5.4 B5.2 A5.2 F#5.4",
    P2: "G#5.2 B5.2 D6.4 E6.2 D6.2 B5.4",
    P3: "E5.2 G#5.2 B5.4 C#6.2 B5.2 G#5.4",
    P4: "r.4 C#6.2 E6.2 F#6.4 E6.2 C#6.2",
    // chorus hook (trumpet)
    H1: "F#5.2 A5.2 D6.4 B5.2 A5.2 F#5.4",
    H2: "G#5.2 B5.2 E6.4 D6.2 B5.2 G#5.4",
    H3: "E5.2 G#5.2 C#6.4 B5.2 G#5.2 E5.4",
    H4: "F#5.2 A5.2 C#6.4 E6.2 C#6.2 A5.4",
    H5: "D6.4 C#6.2 B5.2 A5.4 F#5.4",
    H6: "G#5.2 B5.2 E6.4 D6.4 B5.4",
    H7: "E6.4 C#6.4 A5.8",
    H8: "r.8 E5.2 G#5.2 B5.2 D6.2",
    // chorus counter (flute fills in the gaps)
    C1: "r.12 A5.1 B5.1 C#6.1 D6.1",
    C2: "r.12 B5.1 C#6.1 D6.1 E6.1",
    // bridge (flute)
    B1: "C#6.6 A5.2 F#5.4 A5.4",
    B2: "B5.4 D#6.4 F#6.4 D#6.4",
    B3: "E6.6 B5.2 G#5.4 B5.4",
    B4: "C#6.4 B5.4 G#5.4 E5.4",
    B5: "A5.4 C#6.4 E6.8",
    B6: "F#6.4 D#6.4 B5.8",
    B7: "E6.4 D6.2 B5.2 A5.8",
    B8: "A#5.4 C#6.4 E6.4 F#6.4",
    // intro / tag horn hits
    T1: "r.6 E5+A5+C#6.2 r.4 E5+A5+C#6.2 r.2",
    T2: "r.12 B5.1 C#6.1 D6.1 E6.1",
    T3: "A5.4 r.12",
    // vibes (bridge shimmer)
    W1: "E6.2 r.2 C#6.2 r.2 A5.2 r.2 C#6.2 r.2",
  },
  bp: {
    v: "R.3 r.1 R.1 r.1 O.2 r.2 F.2 T.1 r.1 A.2",
    v2: "R.3 r.1 R.1 x.1 O.2 r.2 F.2 R.1 x.1 A.2",
    c: "R.2 x.1 R.1 r.2 O.2 x.1 R.1 F.2 R.1 r.1 A.2",
    c2: "R.2 x.1 R.1 r.2 O.2 x.1 R.1 F.2 T.1 x.1 A.2",
    b: "R.6 r.2 F.4 r.2 A.2",
    i: "R.4 r.2 R.2 O.2 r.2 F.2 A.2",
    s: "R.8 r.4 F.2 A.2",
  },
  cp: {
    scratch: "g.xg.gxgg.xg.gxg",
    scr2: "g.xgxgxgg.xg.gxg",
    rh: "x--.x-.x-.x-x...",
    rh2: "X--.x--.x-.x-.x-",
    rhb: "x-----.-x-----.-",
    horns: "x..x..x.x..x.x..",
    hornsP: "x...x...x...xxx.",
    pad: "x---------------",
  },
  dr: {
    h: { hat: "x.x.x.x.x.x.x.x.", stick: "....x.......x..." },
    g: { kick: "X.....x.x.x.....", snare: "....X..g.g..X..g", hat: "XgxgXgxgXgxgXg.g", open: "..............x." },
    gc: { kick: "X.....x.x.x...x.", snare: "....X..g.g..X..g", hat: "XgxgXgxgXgxgXg.g", open: "..............x.", crash: "X..............." },
    gb: { kick: "X.......x.......", snare: "........X.......", hat: "x...x...x...x...", stick: "....x.......x..." },
    fl: { kick: "X.....x.X.......", snare: "....X...x.x.....", tomM: "............x...", tomL: "..............x.", hat: "XgxgXgxgXg......" },
    fp: { kick: "X.......X.......", snare: "....x...x.x.xxxx", hat: "x.x.x.x.x.x....." },
    fe: { kick: "X.......X.......", snare: "....X...x.x.....", tomH: "...........x....", tomM: "............x...", tomL: "..............x.", hat: "XgxgXgxg........" },
    tail: { kick: "X.....x.x.x.....", snare: "....X..g.g..X...", hat: "XgxgXgxgXg......", crash: "X..............." },
  },
  perc: {
    sh: { shaker: "XxxxXxxxXxxxXxxx" },
    sh2: { shaker: "xgxxxgxxxgxxxgxx", tamb: "....X.......X..." },
    tb: { tamb: "....X.......X...", cowbell: "x..x..x.x..x..x." },
  },
  ap: {},
  patch: {
    drums: { kind: "drums", bank: "kitStd", core: true, bus: "drum", g: 1, rev: 0, room: 0.1,
      dk: {
        kick: { g: 0.95, hp: 38, pk: [[70, 1.5, 1], [380, -3, 1.2], [3800, 2, 1]] },
        snare: { g: 0.75, room: 0.25, plate: 0.12, pk: [[220, 1.5, 1], [4200, 1.5, 1]] },
        stick: { g: 0.5, room: 0.2, pan: -0.15 },
        hat: { g: 0.3, pan: -0.28, hp: 400 }, open: { g: 0.3, pan: -0.28, hp: 400, room: 0.1 },
        tomL: { g: 0.7, pan: -0.35, room: 0.2 }, tomM: { g: 0.7, pan: 0.0, room: 0.2 }, tomH: { g: 0.7, pan: 0.3, room: 0.2 },
        crash: { g: 0.5, pan: 0.35, plate: 0.2, hp: 300 },
      } },
    perc: { kind: "drums", bank: "kitStd", bus: "drum", g: 1, duckKick: false,
      dk: { shaker: { g: 0.35, pan: 0.38, hp: 800 }, tamb: { g: 0.4, pan: 0.42, hp: 600, room: 0.1 }, cowbell: { g: 0.3, pan: -0.4, room: 0.1 } } },
    bass: { kind: "bass", bank: "bassF", core: true, bus: "bass", g: 1, hp: 38, pk: [[110, 1.5, 1], [900, 2, 1]], rel: 0.1, att: 0.004, len: 0.9, jit: 0.003, late: 0.002 },
    bassS: { kind: "bass", bank: "bassS", bus: "bass", g: 1, hp: 38, pk: [[110, 1.2, 1], [1500, 2, 1]], rel: 0.08, att: 0.003, len: 0.85, jit: 0.003 },
    gtr: { kind: "comp", bank: "gtrM", core: true, bus: "mus", g: 0.8, rng: [57, 76], n: 3, noRoot: false, strum: 0.006, hp: 250, pan: -0.45, rev: 0.06, dly: 0.12, rel: 0.05, len: 0.7, ghostLen: 0.045, duck: 0.0 },
    keys: { kind: "comp", bank: "epiano", core: true, bus: "mus", g: 0.8, rng: [52, 72], noRoot: true, strum: 0.012, hp: 140, pan: 0.3, rev: 0.22, plate: 0.1, dly: 0.12, rel: 0.25, len: 0.95, chorus: 0.25, hold: "chord" },
    pad: { kind: "comp", bank: "strings", bus: "mus", g: 0.5, rng: [50, 70], hp: 160, rev: 0.35, chorus: 0.4, att: 0.1, rel: 0.5, len: 1.0, hold: "chord", jit: 0.01, late: 0.01 },
    hornm: { kind: "mel", bank: "brass", bus: "mus", g: 0.75, hp: 220, pan: 0.2, rev: 0.2, room: 0.1, rel: 0.07, att: 0.006, len: 0.75, pk: [3000, 1.5, 1] },
    horns: { kind: "comp", bank: "brass", bus: "mus", g: 0.75, rng: [58, 78], n: 3, strum: 0.004, hp: 220, pan: 0.2, rev: 0.2, room: 0.1, rel: 0.07, att: 0.006, len: 0.75, ghostLen: 0.08, pk: [3000, 1.5, 1] },
    sax: { kind: "mel", bank: "sax", bus: "lead", g: 0.95, hp: 150, pan: -0.1, rev: 0.28, dly: 0.12, rel: 0.12, att: 0.02, len: 0.92, pk: [2200, 1.5, 1] },
    trumpet: { kind: "mel", bank: "trumpet", bus: "lead", g: 0.9, hp: 220, pan: 0.05, rev: 0.28, dly: 0.2, rel: 0.1, att: 0.015, len: 0.9, pk: [2800, 1.5, 1], dbl: { bank: "flute", oct: 12, min: 0.65, v: 0.55, g: 0.5, hp: 400, rev: 0.3, rel: 0.1, att: 0.02, bus: "lead" } },
    flute: { kind: "mel", bank: "flute", bus: "lead", g: 0.85, hp: 300, pan: 0.15, rev: 0.4, dly: 0.2, rel: 0.2, att: 0.03, len: 0.95 },
  },
  sections: [
    { name: "intro", bars: 4, prog: "A6 F#m7 Bm7 E7",
      lanes: { drums: "h*2 g g", bass: "-*2 i i", gtr: "scratch*4", keys: "-*2 rh rh2", perc: "sh*4", trumpet: "-*3 T2", hornm: "-*2 T1 -" } },
    { name: "verse", bars: 8, prog: "A6 F#m7 Bm7 E7 A6 F#m7 Bm7 E7sus",
      lanes: {
        drums: "g*7 fl", bass: "v v2 v v2 v v2 v v2",
        gtr: "scratch scr2 scratch scr2 scratch scr2 scratch scr2", keys: "rh rh2 rh rh2 rh rh2 rh rh2",
        sax: "V1 V2 V3 V4 V1 V6 V7 V8",
        perc: "sh*8", "pad?0.3": "pad*8", "hornm?0.6": "-*7 T3" } },
    { name: "pre", bars: 4, prog: "Bm7 E7 C#m7 F#7",
      lanes: { drums: "g g g fp", bass: "b b b s", gtr: "scr2*4", keys: "rhb*4", sax: "P1 P2 P3 P4", perc: "sh2*4", pad: "pad*4" } },
    { name: "chorus", bars: 8, prog: "D E7 C#m7 F#m7 Bm7 E7 A E7sus",
      lanes: {
        drums: "gc g g g g g g fe", bassS: "c c2 c c2 c c2 c c2", gtr: "scr2 scratch scr2 scratch scr2 scratch scr2 scratch",
        keys: "rh2 rh rh2 rh rh2 rh rh2 rh", trumpet: "H1 H2 H3 H4 H5 H6 H7 H8",
        horns: "horns*8", perc: "sh2*8", pad: "pad*8" } },
    { name: "bridge", bars: 8, prog: "F#m7 B7 Emaj7 C#m7 F#m7 B7 E7sus F#7",
      lanes: {
        drums: "gb*7 fp", bass: "b*7 s", keys: "rhb*8", flute: "B1 B2 B3 B4 B5 B6 B7 B8",
        pad: "pad*8", perc: "sh*8" } },
    { name: "chorus3", bars: 8, tr: 2, prog: "D E7 C#m7 F#m7 Bm7 E7 A E7sus",
      lanes: {
        drums: "gc g g g g g g fe", bassS: "c c2 c c2 c c2 c c2", gtr: "scr2 scratch scr2 scratch scr2 scratch scr2 scratch",
        keys: "rh2 rh rh2 rh rh2 rh rh2 rh", trumpet: "H1 H2 H3 H4 H5 H6 H7 H8", horns: "horns*8", perc: "sh2*8", pad: "pad*8" } },
    { name: "tag", bars: 4, prog: "A6 F#m7 Bm7 E7sus",
      lanes: { drums: "tail g g fl", bass: "v v2 v s", gtr: "scratch scr2 scratch scr2", keys: "rh rh2 rh rh2", hornm: "T1 - - -", perc: "sh*4" } },
  ],
};
THEMES_BUILD.sunset = sunset;

// ===== FROSTBITE PASS: E minor, 140 bpm, driving cinematic orchestral-rock =====
const snow = {
  id: "snow", name: "Frostbite Pass", bpm: 140, swing: 0, lift: 0.035, loopFrom: 1, level: 1,
  master: { lo: -2, mud: -1.5, pres: 1.2, air: 2, makeup: 3 },
  fx: { hall: 0.6, room: 0.45, plate: 0.3, gate: 0.4, dly: { steps: 3, fb: 0.3, ret: 0.35 } },
  m: {
    // verse theme (French horn)
    SV1: "B4.4 E5.4 G5.6 F#5.2",
    SV2: "E5.4 G5.4 E5.6 D5.2",
    SV3: "D5.4 G5.4 B5.6 A5.2",
    SV4: "A5.4 F#5.4 D5.8",
    SV5: "B4.4 E5.4 G5.4 B5.4",
    SV6: "C6.6 B5.2 G5.4 E5.4",
    SV7: "B5.4 A5.4 G5.4 D5.4",
    SV8: "F#5.6 D#5.2 B4.4 r.4",
    // pre-chorus climb (violin)
    PR1: "G5.4 C6.4 A5.4 D6.4",
    PR2: "B5.4 E6.4 B5.4 D6.4",
    PR3: "C6.4 E6.4 D#6.4 F#6.4",
    PR4: "E6.8 D#6.4 F#6.4",
    // chorus: the heroic theme (trumpet)
    HC1: "G5.6 E5.2 G5.4 C6.4",
    HC2: "B5.6 G5.2 B5.4 D6.4",
    HC3: "A5.6 F#5.2 A5.4 D6.4",
    HC4: "E6.8 D6.4 B5.4",
    HC5: "C6.6 B5.2 G5.4 E5.4",
    HC6: "D6.6 C#6.2 A5.4 F#5.4",
    HC7: "E5.4 G5.4 B5.4 E6.4",
    HC8: "D#6.8 B5.4 F#5.4",
    // celesta answers
    CE4: "r.8 B6.2 A6.2 F#6.2 E6.2",
    CE8: "r.8 F#6.2 D#6.2 B5.2 F#5.2",
    CEv: "r.4 B5.2 r.2 D#6.2 r.2 F#6.2 r.2",
    // bridge (flute)
    BR1: "A5.8 C6.8",
    BR2: "B5.6 G5.2 E5.8",
    BR3: "G5.8 E6.8",
    BR4: "D6.6 B5.2 G5.8",
    BR5: "A5.4 C6.4 E6.8",
    BR6: "E6.6 D6.2 B5.4 G5.4",
    BR7: "F#6.8 E6.4 A5.4",
    BR8: "B5.4 F6.4 G#6.8",
    // tag
    TG1: "B5.8 r.8",
    TG2: "E5.16",
    // intro horn call
    IC: "r.8 B4.4 E5.4",
    IC2: "G5.6 F#5.2 E5.8",
  },
  bp: {
    p8: "R.2 R.2 R.2 R.2 R.2 R.2 R.2 R.2",
    p8c: "R.2 R.2 O.2 R.2 R.2 R.2 O.2 A.2",
    p16: "R.1 R.1 r.2 R.1 R.1 r.2 R.1 R.1 r.2 R.1 R.1 O.1 R.1",
    hold: "R.16",
    tp1: "R.8 r.8",
    tp2: "R.4 r.4 R.2 R.2 r.4",
    tpr: "R.2 R.2 R.2 R.2 R.2 R.2 R.2 R.2",
    tpe: "R.4 r.4 R.4 r.4",
  },
  cp: {
    swell: "x---------------",
    pad: "x---------------",
    stab: "x..x..x.x..x.x..",
    stabB: "x.......x.......",
    chug: "x.xxx.xxx.xxx.xx",
    chug2: "x.xx.xx.x.xx.xxx",
  },
  ap: {
    o16: "0! 1 2 1 0! 1 2 1 0! 1 2 1 0! 1 2 1",
    o16b: "0! 1 2 3 2 1 2 1 0! 1 2 3 2 1 2 1",
    o8: "0! . 1 . 2 . 1 . 0! . 1 . 2 . 1 .",
    pz: "0! . 1 . 2 . 1 . 0! . 1 . 2 . 3 .",
    cel: "0 . 1 . 2 . 4 . 2 . 1 . 0 . . .",
    cel2: "2 . . . 4 . . . 3 . . . 4 . . .",
    low: "0! . . . 0 . . . 0! . . . 0 . 0 .",
  },
  dr: {
    ir: { stick: "x..x..x.x..x..x." },
    v: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
    vf: { kick: "X.......X.x.....", snare: "....X.......xxxx", tomM: "............x...", tomL: "..............x.", hat: "x.x.x.x.x.x....." },
    c: { kick: "X.x.....X.x.x...", snare: "....X.......X...", hat: "x.x.x.x.x.x.x...", open: "..............x.", crash: "X..............." },
    cc: { kick: "X.x.....X.x.x...", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", ride: "................", crash: "................" },
    cf: { kick: "X.......X.......", snare: "....X...x.x.x.xx", tomH: "..........x.....", tomM: "...........x....", tomL: "............x...", crash: "................", hat: "x.x.x.x.........", open: "................" },
    pb: { kick: "X...X...X...X...", snare: "........x...x.x.", hat: "x.x.x.x.x.x.x.x." },
    pf: { kick: "X...X...X...X...", snare: "x.x.x.x.xxxxxxxx", crash: "................" },
    br: { kick: "X...............", ride: "x...x...x...x...", stick: "........x......." },
    br2: { kick: "X.......X.......", snare: "........x.......", ride: "x.x.x.x.x.x.x.x." , tomL: "................" },
    brf: { kick: "X...............", snare: "x.x.x.x.xxxxxxxx", crash: "................" },
    tg: { kick: "X...............", crash: "X..............." },
    tg2: { kick: "X...............", stick: "....x.......x..." },
  },
  perc: {
    tamb: { tamb: "x.x.x.x.x.x.x.x." },
  },
  patch: {
    drums: { kind: "drums", bank: "kitPower", core: true, bus: "drum", g: 1, room: 0.15,
      dk: {
        kick: { g: 0.95, hp: 36, pk: [[65, 1.5, 1], [400, -3, 1.2], [3500, 2, 1]] },
        snare: { g: 0.8, room: 0.25, plate: 0.15, pk: [[200, 1.5, 1], [4500, 1.5, 1]] },
        stick: { g: 0.5, room: 0.2, pan: -0.15 },
        hat: { g: 0.28, pan: -0.3, hp: 400 }, open: { g: 0.3, pan: -0.3, hp: 400 },
        ride: { g: 0.35, pan: 0.3, hp: 300, plate: 0.15 },
        tomL: { g: 0.75, pan: -0.35, room: 0.2 }, tomM: { g: 0.75, pan: 0, room: 0.2 }, tomH: { g: 0.75, pan: 0.3, room: 0.2 },
        crash: { g: 0.55, pan: 0.35, plate: 0.2, hp: 300 },
      } },
    perc: { kind: "drums", bank: "kitPower", bus: "drum", g: 1, duckKick: false,
      dk: { tamb: { g: 0.4, pan: 0.4, hp: 600, room: 0.1 } } },
    bass: { kind: "bass", bank: "bassP", core: true, bus: "bass", g: 1, hp: 38, pk: [[110, 1.5, 1], [1000, 2, 1]], rel: 0.08, att: 0.004, len: 0.88 },
    timp: { kind: "bass", bank: "timp", lo: 38, bus: "mus", g: 1, hp: 50, rev: 0.25, room: 0.2, rel: 0.3, len: 1.4, pan: 0 },
    ostv: { kind: "arp", bank: "violin", core: true, arpLo: 55, len: 1, bus: "mus", g: 0.8, hp: 200, pan: -0.35, rev: 0.15, room: 0.1, rel: 0.05, att: 0.006, duck: 0.0, jit: 0.004 },
    ostc: { kind: "arp", bank: "cello", arpLo: 40, len: 1, bus: "mus", g: 0.8, hp: 70, pan: 0.2, rev: 0.12, rel: 0.05, att: 0.006 },
    pizz: { kind: "arp", bank: "pizz", arpLo: 60, len: 1, bus: "mus", g: 0.8, hp: 200, pan: 0.3, rev: 0.25, room: 0.1, rel: 0.1, att: 0.002 },
    celesta: { kind: "arp", bank: "celesta", arpLo: 72, len: 2, bus: "mus", g: 0.7, hp: 400, pan: 0.2, rev: 0.4, dly: 0.25, rel: 0.5 },
    celm: { kind: "mel", bank: "celesta", bus: "mus", g: 0.7, hp: 400, pan: 0.25, rev: 0.4, dly: 0.25, rel: 0.5 },
    pad: { kind: "comp", bank: "strings", bus: "mus", g: 0.6, rng: [48, 72], hp: 160, rev: 0.4, chorus: 0.4, att: 0.12, rel: 0.6, len: 1.0, hold: "chord", jit: 0.01, late: 0.01 },
    swell: { kind: "comp", bank: "brass", bus: "mus", g: 0.6, rng: [50, 70], hp: 150, rev: 0.4, chorus: 0.2, att: 0.45, rel: 0.5, len: 1.0, hold: "chord", jit: 0.01, late: 0.01 },
    stab: { kind: "comp", bank: "brass", bus: "mus", g: 0.75, rng: [55, 76], n: 3, strum: 0.004, hp: 200, pan: 0.15, rev: 0.25, room: 0.1, rel: 0.08, att: 0.008, len: 0.75, pk: [2800, 1.5, 1] },
    gtr: { kind: "comp", bank: "gtrOD", bus: "mus", g: 0.6, rng: [40, 62], pick: [0, 2], hp: 90, lp: 5500, pan: -0.5, room: 0.12, rel: 0.05, att: 0.003, len: 0.55, ghostLen: 0.05 },
    horn: { kind: "mel", bank: "horn", bus: "lead", g: 0.9, hp: 120, pan: -0.1, rev: 0.3, room: 0.1, rel: 0.2, att: 0.04, len: 0.95, pk: [1800, 1.5, 1] },
    violin: { kind: "mel", bank: "violin", bus: "lead", g: 0.8, hp: 220, pan: -0.15, rev: 0.3, dly: 0.12, rel: 0.15, att: 0.04, len: 0.97, chorus: 0.15 },
    trumpet: { kind: "mel", bank: "trumpet", bus: "lead", g: 0.9, hp: 220, pan: 0.05, rev: 0.3, dly: 0.15, rel: 0.12, att: 0.015, len: 0.92, pk: [2800, 1.5, 1],
      dbl: { bank: "violin", oct: 12, min: 0.55, v: 0.6, g: 0.7, hp: 400, rev: 0.3, rel: 0.12, att: 0.03, bus: "lead" } },
    flute: { kind: "mel", bank: "flute", bus: "lead", g: 0.85, hp: 300, pan: 0.15, rev: 0.4, dly: 0.25, rel: 0.25, att: 0.04, len: 0.97 },
  },
  sections: [
    { name: "intro", bars: 4, prog: "Em C G D",
      lanes: { drums: "ir*3 tg2", pizz: "pz*4", timp: "tp1 tp1 tp1 tpr", celesta: "-*2 cel*2", horn: "-*2 IC IC2", stab: "-*4" } },
    { name: "verse", bars: 8, prog: "Em C G D Em C G B7",
      lanes: {
        drums: "v*7 vf", bass: "p8*8", ostv: "o16*8", ostc: "-*8", pizz: "-*8", timp: "tp1 tp1 tp1 tp1 tp1 tp1 tp1 tp2", horn: "SV1 SV2 SV3 SV4 SV5 SV6 SV7 SV8",
        "pad?0.25": "pad*8", "celm?0.5": "-*7 CEv", "perc?0.45": "tamb*8" } },
    { name: "pre", bars: 4, prog: "C|D Em|G Am|B B7sus|B7",
      lanes: { drums: "pb pb pb pf", bass: "p8*4", ostv: "o16b*4", swell: "swell*4", timp: "tp2 tp2 tpr tpr", violin: "PR1 PR2 PR3 PR4", pad: "pad*4" } },
    { name: "chorus", bars: 8, prog: "C G D Em C D Em B7",
      lanes: {
        drums: "c*7 cf", bass: "p8c*8", ostv: "o16*8", ostc: "low*8", timp: "tp2*7 tpr", trumpet: "HC1 HC2 HC3 HC4 HC5 HC6 HC7 HC8",
        celm: "-*3 CE4 -*3 CE8", stab: "stab*8", pad: "pad*8", "gtr?0.6": "chug chug2 chug chug2 chug chug2 chug chug2", "perc?0.3": "tamb*8" } },
    { name: "bridge", bars: 8, prog: "Am Em C G Am Em B7sus C#7",
      lanes: {
        drums: "br*3 br br br br2 brf", bass: "hold*8", pizz: "pz*8", ostv: "-*8", timp: "tp1 -*5 tpr tpr", flute: "BR1 BR2 BR3 BR4 BR5 BR6 BR7 BR8",
        pad: "pad*8", celesta: "cel2*8", swell: "-*4 swell*4" } },
    { name: "chorus3", bars: 8, tr: 2, prog: "C G D Em C D Em B7",
      lanes: {
        drums: "c*7 cf", bass: "p8c*8", ostv: "o16*8", ostc: "low*8", timp: "tp2*7 tpr", trumpet: "HC1 HC2 HC3 HC4 HC5 HC6 HC7 HC8",
        celm: "-*3 CE4 -*3 CE8", stab: "stab*8", pad: "pad*8", gtr: "chug chug2 chug chug2 chug chug2 chug chug2", perc: "tamb*8", horn: "-*8" } },
    { name: "tag", bars: 4, prog: "B7 Em B7sus B7",
      lanes: { drums: "tg tg2 tg2 pf", bass: "hold hold hold hold", timp: "tp1 tp1 tp1 tpr", pad: "pad*4", flute: "TG1 TG2 TG1 -", swell: "swell*4" } },
  ],
};
THEMES_BUILD.snow = snow;

// ===== NEON DOCKS: D minor, 124 bpm, synthwave / outrun hybrid with real bass + guitars =====
const neon = {
  id: "neon", name: "Neon Docks", bpm: 124, swing: 0, lift: 0.035, loopFrom: 1, level: 1,
  master: { lo: -2, mud: -1.5, pres: 1.2, air: 2.5, makeup: 3 },
  fx: { hall: 0.55, room: 0.35, plate: 0.35, gate: 0.7, dly: { steps: 3, fb: 0.38, ret: 0.45 } },
  m: {
    // verse top-line (saw lead, sparse)
    NV1: "A4.4 r.2 D5.2 F5.4 E5.4",
    NV2: "D5.4 r.2 F5.2 Bb5.4 A5.4",
    NV3: "G5.4 r.2 D5.2 Bb4.4 D5.4",
    NV4: "E5.4 C#5.4 A4.8",
    NV6: "F5.4 D5.4 Bb4.8",
    NV7: "E5.4 G5.4 C6.8",
    NV8: "E5.8 C#5.4 A4.4",
    // pre-chorus climb (saw lead)
    NP1: "D5.4 G5.4 Bb5.4 D6.4",
    NP2: "F5.4 Bb5.4 D6.4 F6.4",
    NP3: "G5.4 C6.4 E6.4 G6.4",
    NP4: "E6.8 C#6.4 A5.4",
    // chorus hook (overdriven guitar)
    NH1: "F5.4 D5.2 F5.2 Bb5.8",
    NH2: "A5.4 F5.2 A5.2 C6.8",
    NH3: "Bb5.4 G5.2 Bb5.2 D6.8",
    NH4: "D6.4 C6.4 A5.4 F5.4",
    NH5: "F5.4 D5.2 F5.2 Bb5.4 D6.4",
    NH6: "C6.4 A5.2 C6.2 F6.8",
    NH7: "E6.4 C#6.4 A5.8",
    NH8: "E6.4 D6.4 A5.8",
    // break (violin)
    BK1: "D6.8 Bb5.4 G5.4",
    BK2: "A5.6 F5.2 D5.8",
    BK3: "D6.8 F6.4 D6.4",
    BK4: "C6.6 A5.2 F5.8",
    BK5: "Bb5.6 D6.2 G6.8",
    BK6: "F6.6 D6.2 A5.8",
    BK7: "G5.4 C#6.4 E6.8",
    BK8: "F#6.4 A6.4 D#6.8",
    // synth-brass stabs and fills
    ST1: "r.2 C5+E5+G5.2 r.4 C5+E5+G5.2 r.6",
    OU1: "A5.8 r.8",
    OU2: "D5.16",
  },
  bp: {
    n8: "R.2 R.2 R.2 R.2 R.2 R.2 R.2 R.2",
    pump: "R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1",
    pump2: "R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 R.1 O.1 R.1 R.1 O.1 R.1 A.1",
    sync: "R.3 r.1 R.2 R.2 O.2 r.1 R.1 R.2 F.2",
    hold: "R.16",
  },
  cp: {
    chug: "x.xxx.xxx.xxx.xx",
    chugX: "X.xxX.xxX.xxX.xx",
    chugR: "X--x--x-X--x--x-",
    pw: "X-------X-------",
    pad: "x---------------",
    syn: "x.x.x.x.x.x.x.x.",
    st: "x..x..x.........",
    stb: "x.......x.x.....",
  },
  ap: {
    a16: "0 . 2 . 4 . 2 . 0 . 2 . 4 . 2 .",
    a16b: "0 2 4 2 0 2 4 2 0 2 4 2 0 2 4 2",
    a8: "0! . 1 . 2 . 1 . 0! . 1 . 2 . 3 .",
    pn: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 1 .",
  },
  dr: {
    i: { kick: "X...............", hat: "x.x.x.x.x.x.x.x." },
    v: { kick: "X...X...X...X...", snare: "....X.......X...", clap: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    vf: { kick: "X...X...X...X...", snare: "....X.......X.xx", clap: "....x.......x...", tomM: "..............x.", tomL: "...............x", hat: "x.x.x.x.x.x....." },
    c: { kick: "X...X...X...X..x", snare: "....X.......X...", clap: "....X.......X...", hat: "x...x...x...x...", open: "..x...x...x...x.", crash: "X..............." },
    cf: { kick: "X...X...X...X...", snare: "....X...x.x.xxxx", clap: "....x...........", tomH: "..........x.....", crash: "................", hat: "x...x...x......." },
    pb: { kick: "X...X...X...X...", snare: "........x...x.x.", hat: "x.x.x.x.x.x.x.x." },
    pf: { kick: "X...X...X...X...", snare: "x.x.x.x.xxxxxxxx", crash: "................" },
    bk: { kick: "X...............", stick: "....x.......x..." },
    bk2: { kick: "X...X...X...X...", hat: "x.x.x.x.x.x.x.x." },
    bkf: { kick: "X...X...X...X...", snare: "x.x.x.x.xxxxxxxx", crash: "................" },
    tg: { kick: "X...............", crash: "X..............." },
  },
  patch: {
    drums: { kind: "drums", bank: "kitPower", core: true, bus: "drum", g: 1, room: 0.1,
      dk: {
        kick: { g: 0.95, hp: 36, pk: [[60, 2, 1], [380, -3, 1.2], [3800, 2.5, 1]] },
        snare: { g: 0.8, gate: 0.85, room: 0.08, pk: [[200, 1.5, 1], [4500, 2, 1]] },
        clap: { g: 0.55, gate: 0.7, pan: 0.05, hp: 500 },
        stick: { g: 0.5, room: 0.15, pan: -0.15 },
        hat: { g: 0.28, pan: -0.3, hp: 500 }, open: { g: 0.3, pan: -0.3, hp: 500 },
        tomL: { g: 0.75, pan: -0.35, gate: 0.4 }, tomM: { g: 0.75, pan: 0, gate: 0.4 }, tomH: { g: 0.75, pan: 0.3, gate: 0.4 },
        crash: { g: 0.55, pan: 0.35, plate: 0.2, hp: 300 },
      } },
    bass: { kind: "bass", bank: "bassP", core: true, bus: "bass", g: 1, hp: 38, pk: [[120, 1.5, 1], [1200, 2.5, 1]], rel: 0.06, att: 0.003, len: 0.8, jit: 0.002 },
    gtr: { kind: "comp", bank: "gtrOD", core: true, bus: "mus", g: 0.6, rng: [40, 62], pick: [0, 2], hp: 90, lp: 5500, pan: -0.5, room: 0.1, rel: 0.05, att: 0.003, len: 0.55, ghostLen: 0.05 },
    gtrR: { kind: "comp", bank: "gtrOD", bus: "mus", g: 0.5, rng: [47, 67], pick: [0, 1, 2], hp: 150, lp: 6000, pan: 0.5, rev: 0.15, room: 0.1, rel: 0.2, att: 0.004, len: 0.95, hold: "chord", strum: 0.01 },
    arp: { kind: "arp", bank: "gtrC", arpLo: 62, len: 1, bus: "mus", g: 0.6, hp: 300, pan: 0.35, rev: 0.2, dly: 0.5, rel: 0.12, att: 0.003, jit: 0.002 },
    pn: { kind: "arp", bank: "piano", arpLo: 55, len: 3, bus: "mus", g: 0.6, hp: 200, pan: -0.2, rev: 0.3, dly: 0.2, rel: 0.4, att: 0.003 },
    pad: { kind: "comp", bank: "strings", bus: "mus", g: 0.6, rng: [50, 72], hp: 160, rev: 0.4, chorus: 0.45, att: 0.15, rel: 0.7, len: 1.0, hold: "chord", jit: 0.01, late: 0.01, duck: 0.35 },
    syn: { kind: "comp", bank: "synstr", bus: "mus", g: 0.5, rng: [52, 74], hp: 180, rev: 0.4, chorus: 0.5, att: 0.1, rel: 0.5, len: 1.0, hold: "chord", jit: 0.01, duck: 0.4 },
    stabs: { kind: "mel", bank: "synbrass", bus: "mus", g: 0.7, hp: 200, pan: 0.2, rev: 0.25, dly: 0.2, rel: 0.1, att: 0.008, len: 0.8 },
    stc: { kind: "comp", bank: "synbrass", bus: "mus", g: 0.7, rng: [55, 76], n: 3, hp: 200, pan: 0.2, rev: 0.25, dly: 0.2, rel: 0.08, att: 0.006, len: 0.7 },
    saw: { kind: "mel", bank: "sawlead", bus: "lead", g: 0.8, hp: 220, pan: 0, rev: 0.3, dly: 0.35, rel: 0.12, att: 0.012, len: 0.9 },
    lead: { kind: "mel", bank: "gtrOD", bus: "lead", g: 0.8, hp: 220, lp: 7000, pan: -0.05, rev: 0.25, dly: 0.3, room: 0.08, rel: 0.2, att: 0.005, len: 0.95,
      dbl: { bank: "sawlead", oct: 0, min: 0.0, v: 0.5, g: 0.6, hp: 300, rev: 0.3, dly: 0.3, rel: 0.12, att: 0.012, bus: "lead", tune: 7 } },
    violin: { kind: "mel", bank: "violin", bus: "lead", g: 0.8, hp: 220, pan: -0.1, rev: 0.4, dly: 0.12, rel: 0.2, att: 0.05, len: 0.97, chorus: 0.2 },
  },
  sections: [
    { name: "intro", bars: 4, prog: "Dm Bb F C",
      lanes: { drums: "i*3 tg", arp: "a16*4", pad: "pad*4", stabs: "-*3 ST1", bass: "-*2 n8 n8" } },
    { name: "verse", bars: 8, prog: "Dm Bb Gm A Dm Bb C A",
      lanes: {
        drums: "v*7 vf", bass: "n8*8", gtr: "chug*8", arp: "a16*8", saw: "NV1 NV2 NV3 NV4 NV1 NV6 NV7 NV8",
        pad: "pad*8", "gtrR?0.5": "pw*8", "stc?0.7": "st*8" } },
    { name: "pre", bars: 4, prog: "Gm Bb C A7",
      lanes: { drums: "pb pb pb pf", bass: "sync*4", gtr: "chugX*4", saw: "NP1 NP2 NP3 NP4", syn: "pad*4", arp: "a16b*4" } },
    { name: "chorus", bars: 8, prog: "Bb F Gm Dm Bb F A A7sus",
      lanes: {
        drums: "c*7 cf", bass: "pump*7 pump2", gtr: "chugX*8", gtrR: "chugR*8", lead: "NH1 NH2 NH3 NH4 NH5 NH6 NH7 NH8", arp: "a8*8",
        syn: "pad*8", pad: "pad*8", "stc?0.4": "stb*8" } },
    { name: "break", bars: 8, prog: "Gm Dm Bb F Gm Dm A7 B7",
      lanes: {
        drums: "bk*4 bk2*3 bkf", bass: "hold*8", pn: "pn*8", violin: "BK1 BK2 BK3 BK4 BK5 BK6 BK7 BK8", pad: "pad*8", syn: "-*4 pad*4" } },
    { name: "chorus3", bars: 8, tr: 2, prog: "Bb F Gm Dm Bb F A A7sus",
      lanes: {
        drums: "c*7 cf", bass: "pump*7 pump2", gtr: "chugX*8", gtrR: "chugR*8", lead: "NH1 NH2 NH3 NH4 NH5 NH6 NH7 NH8", arp: "a8*8",
        syn: "pad*8", pad: "pad*8", stc: "stb*8", violin: "-*8" } },
    { name: "outro", bars: 4, prog: "A7 Dm A7 Dm",
      lanes: { drums: "tg bk bk bk", bass: "hold*4", pad: "pad*4", gtr: "-*4", saw: "OU1 OU2 OU1 -", arp: "a16*4" } },
  ],
};
THEMES_BUILD.neon = neon;

// ===== RESULTS: C major, 108 bpm, triumphant fanfare then a warm loop =====
const results = {
  id: "results", name: "Podium", bpm: 108, swing: 0.03, lift: 0.0, loopFrom: 1, level: 1,
  master: { lo: -2, mud: -1.5, pres: 1.2, air: 2, makeup: 3 },
  fx: { hall: 0.65, room: 0.4, plate: 0.3, gate: 0.3, dly: { steps: 3, fb: 0.28, ret: 0.35 } },
  m: {
    FA1: "r.2 G5.2 G5.2 G5.2 C6.8",
    FA2: "A5.2 A5.2 A5.2 C6.2 B5.4 D6.4",
    FA3: "G5.2 E6.6 D6.2 C6.2 D6.4",
    FA4: "D6.2 D6.2 D6.2 F6.2 G6.8",
    FB1: "C5+E5+G5+C6.16",
    // warm loop
    RL1: "E5.4 G5.4 C6.8",
    RL2: "C6.4 B5.4 A5.8",
    RL3: "A5.4 C6.4 A5.4 F5.4",
    RL4: "G5.4 B5.4 D6.8",
    RL5: "E6.6 D6.2 C6.4 G5.4",
    RL6: "B5.4 G5.4 E5.8",
    RL7: "F5.4 A5.4 C6.4 A5.4",
    RL8: "D6.6 B5.2 G5.8",
    RM1: "G5.8 E6.8",
    RM2: "E6.6 C6.2 A5.8",
    RM3: "C6.8 A5.4 F5.4",
    RM4: "D6.8 B5.8",
    RM5: "G6.6 E6.2 C6.8",
    RM6: "G5.6 B5.2 E6.8",
    RM7: "A5.4 C6.4 F6.8",
    RM8: "D6.4 B5.4 G5.8",
    VB1: "r.2 E6.2 r.2 G6.2 r.2 C7.2 r.4",
  },
  bp: { a: "R.4 r.2 R.2 F.4 R.2 A.2", h: "R.8 F.4 A.4", f: "R.16", tpA: "R.4 r.4 R.2 R.2 r.4" },
  cp: { pad: "x---------------", hit: "x.......x.......", fan: "x--x--x---------" },
  ap: { pn: "0 . 1 . 2 . 1 . 0 . 1 . 2 . 1 .", pn2: "0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1", vb: "2 . . . 4 . . . 3 . . . 4 . . ." },
  dr: {
    fan: { kick: "X.......X.......", snare: "....x...x.x.xxxx", crash: "X..............." },
    fan2: { kick: "X...X...X...X...", snare: "....X...X...X...", crash: "X...............", tomM: "................" },
    fan3: { kick: "X.......X.......", snare: "x.x.x.x.xxxxxxxx", tomL: "................", crash: "................" },
    soft: { kick: "X.......X.......", stick: "....x.......x...", hat: "x...x...x...x..." },
    soft2: { kick: "X.......X.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    tail: { kick: "X.......X.......", stick: "....x.......x...", crash: "X..............." },
  },
  patch: {
    drums: { kind: "drums", bank: "kitRoom", core: true, bus: "drum", g: 1, room: 0.12,
      dk: {
        kick: { g: 0.9, hp: 36, pk: [[70, 1.5, 1], [400, -3, 1.2], [3500, 2, 1]] },
        snare: { g: 0.7, room: 0.2, plate: 0.15, pk: [[220, 1.5, 1], [4500, 1.5, 1]] },
        stick: { g: 0.5, room: 0.2, pan: -0.15 },
        hat: { g: 0.26, pan: -0.3, hp: 400 },
        tomL: { g: 0.7, pan: -0.35, room: 0.2 }, tomM: { g: 0.7, pan: 0, room: 0.2 }, tomH: { g: 0.7, pan: 0.3, room: 0.2 },
        crash: { g: 0.5, pan: 0.35, plate: 0.2, hp: 300 },
      } },
    timp: { kind: "bass", bank: "timp", lo: 38, bus: "mus", g: 1, hp: 50, rev: 0.25, room: 0.2, rel: 0.3, len: 1.4 },
    bass: { kind: "bass", bank: "bassF", core: true, bus: "bass", g: 1, hp: 38, pk: [[110, 1.5, 1], [900, 2, 1]], rel: 0.1, att: 0.004, len: 0.9 },
    piano: { kind: "arp", bank: "piano", core: true, arpLo: 50, len: 3, bus: "mus", g: 0.8, hp: 140, pan: -0.15, rev: 0.25, plate: 0.1, rel: 0.35, att: 0.002 },
    pad: { kind: "comp", bank: "strings", bus: "mus", g: 0.6, rng: [48, 70], hp: 160, rev: 0.4, chorus: 0.4, att: 0.12, rel: 0.6, len: 1.0, hold: "chord", jit: 0.01, late: 0.01 },
    brassP: { kind: "comp", bank: "brass", bus: "mus", g: 0.6, rng: [50, 72], hp: 150, rev: 0.4, chorus: 0.2, att: 0.05, rel: 0.5, len: 1.0, hold: "chord", jit: 0.01 },
    horns: { kind: "comp", bank: "brass", bus: "mus", g: 0.7, rng: [55, 76], n: 3, strum: 0.004, hp: 200, pan: 0.2, rev: 0.25, room: 0.1, rel: 0.1, att: 0.01, len: 0.8, pk: [2800, 1.5, 1] },
    fan: { kind: "mel", bank: "trumpet", bus: "lead", g: 0.9, hp: 220, pan: 0.05, rev: 0.35, room: 0.1, rel: 0.2, att: 0.015, len: 0.95, pk: [2800, 1.5, 1],
      dbl: { bank: "violin", oct: 0, min: 0, v: 0.5, g: 0.6, hp: 300, rev: 0.3, rel: 0.2, att: 0.03, bus: "lead" } },
    fanB: { kind: "mel", bank: "brass", bus: "mus", g: 0.7, hp: 200, rev: 0.4, room: 0.1, rel: 0.5, att: 0.03, len: 1.0 },
    flute: { kind: "mel", bank: "flute", bus: "lead", g: 0.85, hp: 300, pan: -0.15, rev: 0.4, dly: 0.2, rel: 0.25, att: 0.04, len: 0.97 },
    violin: { kind: "mel", bank: "violin", bus: "lead", g: 0.8, hp: 220, pan: -0.15, rev: 0.4, dly: 0.12, rel: 0.2, att: 0.05, len: 0.97, chorus: 0.2 },
    vibes: { kind: "arp", bank: "celesta", arpLo: 72, len: 2, bus: "mus", g: 0.5, hp: 500, pan: 0.3, rev: 0.4, dly: 0.3, rel: 0.5 },
    glock: { kind: "mel", bank: "glock", bus: "lead", g: 0.6, hp: 500, pan: 0.3, rev: 0.4, dly: 0.25, rel: 0.5 },
  },
  sections: [
    { name: "fanfare", bars: 4, prog: "C F|G C Dm|G",
      lanes: {
        drums: "fan fan2 fan2 fan3", timp: "tpA*4", fan: "FA1 FA2 FA3 FA4", brassP: "pad*4", pad: "pad*4", horns: "-*3 hit" } },
    { name: "warm", bars: 8, prog: "C Am F G C Em F G",
      lanes: {
        drums: "soft*7 tail", bass: "a*8", piano: "pn*8", pad: "pad*8", flute: "RL1 RL2 RL3 RL4 RL5 RL6 RL7 RL8" } },
    { name: "warm2", bars: 8, prog: "C Am F G C Em F G",
      lanes: {
        drums: "soft2*8", bass: "a*8", piano: "pn2*8", pad: "pad*8", violin: "RM1 RM2 RM3 RM4 RM5 RM6 RM7 RM8", vibes: "vb*8", brassP: "-*4 pad*4" } },
  ],
};
THEMES_BUILD.results = results;

// ===== SKYWAY STATION: F# minor, 128 bpm, euphoric orbital techno / trance-house =====
// Electronic by design: ferrosintesis synth drum kit (GM2 Electronic slot, channel-10 program 24), synth bass, resonant saw
// lead + acid line with CC74 filter sweeps, supersaw stabs (octave-doubled saw stack), reverse-cymbal swells and snare-roll builds.
const skyway = {
  id: "skyway", name: "Skyway Station", bpm: 128, swing: 0, kit: 24, loopFrom: 1, level: 1,
  bassLo: 30,
  vol: { drums: 86, perc: 80, bass: 127, acid: 125, ldsyn: 120, bells: 105, pn: 68, fx: 127 },
  m: {
    // verse/intro lead: plucked square-lead arpeggio motifs (F#m D A E)
    VL1: "C#6.3 A5.3 F#5.2 r.2 C#6.3 A5.3",
    VL2: "B5.3 F#5.3 D5.2 r.2 B5.3 F#5.3",
    VL3: "C#6.3 A5.3 E5.2 r.2 C#6.3 A5.3",
    VL4: "B5.3 G#5.3 E5.2 r.2 G#5.3 B5.3",
    // build lead: held rising notes
    BU1: "A5.16", BU2: "B5.16", BU3: "C#6.16", BU4: "F6.8 G#6.8",
    // drop hook (saw lead, doubled an octave up on the boost stem)
    H1: "C#6.3 C#6.1 E6.4 C#6.4 A5.4",
    H2: "B5.3 B5.1 D6.4 B5.4 F#5.4",
    H3: "C#6.3 C#6.1 E6.4 A6.4 E6.4",
    H4: "B5.6 G#5.2 E5.4 r.4",
    H5: "F#6.3 F#6.1 A6.4 F#6.4 C#6.4",
    H6: "D6.3 D6.1 F#6.4 D6.4 B5.4",
    H7: "E6.3 E6.1 A6.4 E6.4 C#6.4",
    H8: "G#5.4 C#6.4 F6.4 G#6.4",
    // breakdown melody (long, singing)
    BK1: "A5.6 F#5.2 D5.4 F#5.4",
    BK2: "E5.6 C#5.2 A4.4 C#5.4",
    BK3: "G#5.6 B5.2 E6.8",
    BK4: "C#6.12 A5.4",
    BK5: "A5.6 D6.2 F#6.4 D6.4",
    BK6: "E6.6 C#6.2 A5.4 C#6.4",
    BK7: "B5.4 E6.4 G#6.4 E6.4",
    BK8: "F6.8 G#6.4 F6.4",
    // tag
    TG1: "A5.4 r.4 C#6.8", TG2: "E6.8 r.8",
  },
  bp: {
    roll: "r.1 R.1 R.1 O.1 r.1 R.1 R.1 R.1 r.1 R.1 R.1 O.1 r.1 R.1 R.1 A.1",
    roll2: "r.1 R.1 O.1 R.1 r.1 R.1 R.1 O.1 r.1 R.1 O.1 R.1 r.1 R.1 R.1 A.1",
    off: "r.2 R.2 r.2 R.2 r.2 R.2 r.2 R.2",
    hold: "R.16",
    sub: "R.8 R.6 A.2",
  },
  cp: {
    pad: "x---------------",
    st1: "..x...x...x...x.",
    st2: "x..x..x...x.x...",
    sw: "X---------------",
    sw2: "X--x--X--x--x---",
    fx: "x---------------",
  },
  ap: {
    ac1: "0! . 0 3 . 0 . 2 0! . 0 3 . 5! . 2",
    ac2: "0 0 3 0 5 0 3 0 0 0 3 0 5 3 2 0",
    ar: "0 . 2 . 4 . 2 . 3 . 2 . 4 . 5 .",
    ru: "0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15",
    pn: "0 . 2 . 1 . 2 . 0 . 2 . 1 . 2 .",
    bl: ". . 5 . . . 7 . . . 5 . . . 8 .",
  },
  dr: {
    i1: { hat: "..x...x...x...x." },
    i2: { kick: "X...............", hat: "..x...x...x...x.", open: "................" },
    v1: { kick: "X...X...X...X...", clap: "....X.......X...", open: "..X...X...X...X.", hat: ".g.g.g.g.g.g.g.g", crash: "X..............." },
    v: { kick: "X...X...X...X...", clap: "....X.......X...", open: "..X...X...X...X.", hat: ".g.g.g.g.g.g.g.g" },
    bd1: { kick: "X...X...X...X...", clap: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    bd2: { kick: "X...X...X...X...", snare: "x.x.x.x.x.x.x.x.", hat: "x.x.x.x.x.x.x.x." },
    bd3: { kick: "X...X...X...X...", snare: "gxgxgxgxxxxxxxxx" },
    bd4: { snare: "xxxxXXXXXXXXXXXX", tomH: "............x.x." },
    dp1: { kick: "X...X...X...X...", clap: "....X.......X...", open: "..X...X...X...X.", hat: ".g.g.g.g.g.g.g.g", crash: "X..............." },
    dp: { kick: "X...X...X...X...", clap: "....X.......X...", open: "..X...X...X...X.", hat: ".g.g.g.g.g.g.g.g" },
    dpf: { kick: "X...X...X...X...", clap: "....X...x.x.xxxx", open: "..X...X.........", hat: ".g.g.g.g.g.g...." },
    br: { kick: "X...............", hat: "x.x.x.x.x.x.x.x.", clap: "........g.......".replace("g", "x") },
    br2: { hat: "x.x.x.x.x.x.x.x.", clap: "....g.......g..." },
    brr1: { kick: "X...............", snare: "........x.x.x.x.", hat: "x.x.x.x.x.x.x.x." },
    brr2: { kick: "X...............", snare: "xxxxxxxxXXXXXXXX", tomH: "............x.x." },
    tg1: { kick: "X...X...X...X...", clap: "....X.......X...", open: "..X...X...X...X.", hat: ".g.g.g.g.g.g.g.g" },
    tg2: { kick: "X...X...X...X...", clap: "....X...x.x.xxxx", hat: "x.x.x.x.x.x.x.x.", tomH: "..........x....." },
    tg3: { kick: "X...X...X...X...", snare: "xxxxxxxxXXXXXXXX", tomL: "............x.x." },
  },
  perc: { sh: { shaker: "x.x.x.x.x.x.x.x.", tamb: "....x.......x..." }, sh2: { shaker: "xxxxxxxxxxxxxxxx", tamb: "....x.......x..." } },
  patch: {
    drums: { kind: "drums", bank: "kitSynth", core: true, bus: "drum" },
    perc: { kind: "drums", bank: "kitSynth", bus: "drum" },
    bass: { kind: "bass", bank: "synbass2", core: true, bus: "bass", lo: 30, len: 0.85 },
    pad: { kind: "comp", bank: "warmpad", core: true, rng: [50, 72], hold: "chord", len: 1.0, att: 0.15, rev: 0.45, chorus: 0.5, pan: 0 },
    syn: { kind: "comp", bank: "synstr", rng: [55, 76], hold: "chord", len: 1.0, att: 0.1, rev: 0.4, chorus: 0.5 },
    ldsyn: { kind: "mel", bank: "squarelead", pan: 0.1, rev: 0.3, len: 0.8, cc: { 74: 80 } },
    saw: { kind: "mel", bank: "sawlead", pan: 0, rev: 0.3, len: 0.95,
      dbl: { bank: "squarelead", oct: 12, v: 0.5, rev: 0.3 } },
    acid: { kind: "arp", bank: "sawlead", arpLo: 48, len: 1, pan: -0.15, rev: 0.12, sweep: { cc: 74, def: [55, 100], sec: { intro: [30, 100], verse: [40, 110], break: [30, 70] } } },
    ssaw: { kind: "comp", bank: "sawlead", rng: [54, 78], n: 3, len: 0.7, rev: 0.3, pan: 0.15, dbl: { bank: "sawlead", oct: 12, rev: 0.3 } },
    stc: { kind: "comp", bank: "synbrass", rng: [55, 76], n: 3, len: 0.6, rev: 0.25, pan: -0.2 },
    riser: { kind: "arp", bank: "sawlead", arpLo: 48, len: 1, rev: 0.25, sweep: { cc: 74, def: [30, 127], pow: 1.4 } },
    fx: { kind: "comp", bank: "revcym", rng: [60, 72], n: 1, hold: "chord", len: 1.0, rev: 0.2 },
    pn: { kind: "arp", bank: "piano", arpLo: 52, len: 3, pan: -0.2, rev: 0.3 },
    bells: { kind: "arp", bank: "glock", arpLo: 72, len: 2, pan: 0.3, rev: 0.4 },
  },
  sections: [
    { name: "intro", bars: 4, prog: "F#m D A E",
      lanes: { drums: "i1 i1 i2 i2", pad: "pad*4", ldsyn: "VL1 VL2 VL3 VL4", acid: "ac1*4", "fx?0.3": "fx*4" } },
    { name: "verse", bars: 4, prog: "F#m D A E",
      lanes: { drums: "v1 v v v", bass: "roll roll roll roll2", pad: "pad*4", ldsyn: "VL1 VL2 VL3 VL4", acid: "ac1*4", perc: "sh*4", "stc?0.55": "st1*4" } },
    { name: "build", bars: 4, prog: "D E F#m C#",
      lanes: { drums: "bd1 bd2 bd3 bd4", bass: "off*3 hold", pad: "pad*4", saw: "BU1 BU2 BU3 BU4", acid: "ac2*4", riser: "ru*4", fx: "fx*4", perc: "sh2*4" } },
    { name: "drop", bars: 8, prog: "F#m D A E F#m D A C#",
      lanes: { drums: "dp1 dp*6 dpf", bass: "roll roll2 roll roll2 roll roll2 roll roll2", pad: "pad*8", saw: "H1 H2 H3 H4 H5 H6 H7 H8",
        acid: "ac2*8", perc: "sh*8", ssaw: "sw sw sw sw sw sw sw sw2", "stc?0.6": "st2*8" } },
    { name: "break", bars: 8, prog: "D A E F#m D A E C#",
      lanes: { drums: "br*4 br2*2 brr1 brr2", bass: "sub*6 off hold", pad: "pad*8", syn: "pad*8", saw: "BK1 BK2 BK3 BK4 BK5 BK6 BK7 BK8",
        pn: "pn*8", bells: "bl*8", riser: "-*6 ru ru", fx: "-*6 fx fx", perc: "-*6 sh2 sh2" } },
    { name: "drop2", bars: 8, prog: "F#m D A E F#m D A C#",
      lanes: { drums: "dp1 dp*6 dpf", bass: "roll roll2 roll roll2 roll roll2 roll roll2", pad: "pad*8", syn: "pad*8", saw: "H5 H6 H7 H8 H1 H2 H3 H8",
        acid: "ac2*8", perc: "sh2*8", ssaw: "sw2*8", "stc?0.5": "st2*8", riser: "-*6 ru ru", fx: "fx*8" } },
  ],
};
THEMES_BUILD.skyway = skyway;

// ===== DUNE CANYON: D major, 136 bpm, bluegrass-rally country with a spaghetti-western minor bridge =====
// Banjo rolls, boom-chick acoustic guitar, upright bass (alternating / walking), fiddle hook + double stops, harmonica verse tune,
// echoey whistle, mandolin chop, twangy clean-electric bridge lead, handclaps and a brush-kit shuffle.
const canyon = {
  id: "canyon", name: "Dune Canyon", bpm: 136, swing: 0.1, loopFrom: 1, level: 1, bassLo: 28,
  vol: { perc: 50, fid: 127, tw: 127, harm: 100, wst: 62, fidD: 64, mand: 127, pad: 105, banjo: 115 },
  m: {
    // whistle hook (intro / tag)
    WH1: "r.4 A5.2 D6.2 F#6.4 E6.2 D6.2",
    WH2: "A5.4 F#5.2 A5.2 D6.8",
    WH3: "E6.4 C#6.4 A5.8",
    WT1: "D6.6 A5.2 F#5.8",
    // verse tune (harmonica) over D G D A D G A A
    HV1: "F#4.2 A4.2 D5.4 r.2 D5.2 E5.2 F#5.2",
    HV2: "G5.4 F#5.2 E5.2 D5.4 B4.4",
    HV3: "A4.2 D5.2 F#5.4 A5.4 F#5.2 D5.2",
    HV4: "E5.4 C#5.4 A4.8",
    HV6: "B4.4 D5.4 G5.8",
    HV7: "E5.4 F#5.4 E5.4 C#5.4",
    HV8: "A4.4 C#5.4 E5.8",
    // chorus hook (fiddle) over G D A D G D Em A
    FH1: "D6.4 B5.2 G5.2 A5.4 B5.4",
    FH2: "A5.4 F#5.2 A5.2 D6.8",
    FH3: "E6.4 C#6.2 E6.2 A6.4 E6.4",
    FH4: "D6.6 A5.2 F#5.4 r.4",
    FH5: "D6.4 B5.2 G5.2 B5.4 D6.2 E6.2",
    FH6: "F#6.4 D6.2 A5.2 F#5.4 A5.4",
    FH7: "E6.4 B5.4 G5.4 B5.4",
    FH8: "C#6.4 E6.4 A6.8",
    // spaghetti-western bridge (twang guitar) over Dm Dm Bb C Dm Gm A7 A7
    TW1: "D4.6 A4.2 D5.8",
    TW2: "F5.6 E5.2 D5.4 A4.4",
    TW3: "Bb4.6 D5.2 F5.8",
    TW4: "E5.6 G5.2 C6.8",
    TW5: "A5.6 F5.2 D5.8",
    TW6: "G5.4 Bb5.4 D6.8",
    TW7: "C#6.4 E6.4 G6.4 E6.4",
    TW8: "A5.8 r.8",
    // fiddle swell for the bridge
    FB1: "A5.16", FB2: "A5.16",
  },
  bp: {
    alt: "R.4 r.4 F.4 r.4",
    alt2: "R.4 r.2 R.2 F.4 r.2 F.2",
    walk: "R.4 T.4 F.4 A.4",
    walk2: "R.4 F.4 T.4 A.4",
    held: "R.8 F.8",
    hit: "R.3 r.5 F.3 r.5",
  },
  cp: {
    bc: "....X.g.....X.g.",
    bc2: "g...X.g.g...X.g.",
    bcm: "x.......x.......",
    ch: "....x.......x...",
    ds1: "X-------X-------",
    ds2: "X--x--X-x-x-----",
    sus: "X---------------",
    pad: "x---------------",
  },
  ap: {
    rl1: "0! . 1 . 2 . 0! . 1 . 2 . 0! . 1 .",
    rl2: "2! . 1 . 0 . 2! . 1 . 0 . 2! . 1 .",
    rl3: "0! . 2 . 1 2 0! . 2 . 1 2 0! . 2 .",
    rl4: "0! . 1 . 2 . 3! . 2 . 1 . 0! . 2 .",
  },
  dr: {
    idr: { kick: "X...............", stick: "....x.......x..." },
    dv: { kick: "X.......X.......", stick: "....x.......x...", hat: "g.g.g.g.g.g.g.g." },
    dvf: { kick: "X.......X.......", stick: "....x...x.x.xxxx", hat: "g.g.g.g.g.g....." },
    dc: { kick: "X.......X.......", snare: "x.x.X.x.x.x.X.x.", crash: "X..............." },
    dc2: { kick: "X.......X.......", snare: "x.x.X.x.x.x.X.x." },
    dcf: { kick: "X.......X.......", snare: "x.x.X...x.x.xxxx", tomH: "..........x....." },
    db: { kick: "X.......X..x....", snare: "........X.......", tomL: "..............x." },
    dbf: { kick: "X.......X.......", snare: "x.x.x.x.xxxxXXXX" },
    dt: { kick: "X.......X.......", snare: "x.x.X.x.x.x.X.x." },
    dtf: { kick: "X.......X.......", snare: "x.x.x.x.xxxxxxXX", crash: "................" },
  },
  perc: {
    bsh: { snare: "x.g.x.g.x.g.x.g.", },
    bsh2: { snare: "g.......g.......", tomL: "........x......." },
    cl: { clap: "....X.......X..." },
    cl2: { clap: "....X.x.....X.x." },
    cb: { cowbell: "x..x..x.x..x..x." },
  },
  patch: {
    drums: { kind: "drums", bank: "kit", core: true, bus: "drum" },
    perc: { kind: "drums", bank: "kitBrush", kit: 40, bus: "drum" },
    bass: { kind: "bass", bank: "upright", core: true, bus: "bass", lo: 28, len: 0.82 },
    banjo: { kind: "arp", bank: "banjo", core: true, arpLo: 60, len: 2, pan: -0.25, rev: 0.12, room: 0.1 },
    gtr: { kind: "comp", bank: "steel", core: true, rng: [50, 70], n: 4, strum: 0.006, len: 0.7, pan: 0.3, rev: 0.1, room: 0.1 },
    pad: { kind: "comp", bank: "strings", rng: [48, 68], hold: "chord", len: 1.0, att: 0.2, rev: 0.45, chorus: 0.4 },
    mand: { kind: "comp", bank: "mandolin", rng: [60, 80], n: 3, len: 0.45, pan: 0.4, rev: 0.12 },
    fid: { kind: "mel", bank: "fiddle", pan: -0.05, rev: 0.22, len: 0.97 },
    fidD: { kind: "comp", bank: "fiddle", rng: [62, 80], pick: [0, 2], hold: "chord", len: 0.95, pan: 0.1, rev: 0.25 },
    harm: { kind: "mel", bank: "harmonica", pan: 0.05, rev: 0.2, len: 0.95 },
    wst: { kind: "mel", bank: "whistle", pan: 0.15, rev: 0.55, echo: 0.6, len: 0.97 },
    tw: { kind: "mel", bank: "gtrC", pan: -0.1, rev: 0.45, echo: 0.5, len: 1.0 },
    gtrR: { kind: "comp", bank: "gtrC", rng: [57, 76], pick: [0, 1, 2], hold: "chord", len: 1.0, pan: 0.3, rev: 0.4, chorus: 0.5 },
  },
  sections: [
    { name: "intro", bars: 4, prog: "D G A D",
      lanes: { drums: "idr*4", bass: "alt*4", banjo: "rl1*4", gtr: "-*2 bc bc", wst: "WH1 WH2 WH1 WH3" } },
    { name: "verse", bars: 8, prog: "D G D A D G A A",
      lanes: { drums: "dv*7 dvf", bass: "alt*7 walk", banjo: "rl1 rl2 rl1 rl2 rl1 rl2 rl1 rl2", gtr: "bc*8",
        harm: "HV1 HV2 HV3 HV4 HV1 HV6 HV7 HV8", perc: "bsh*8", "mand?0.3": "ch*8", "perc?0.5": "cl*8" } },
    { name: "chorus", bars: 8, prog: "G D A D G D Em A",
      lanes: { drums: "dc dc2*6 dcf", bass: "walk walk2 walk walk2 walk walk2 walk walk2", banjo: "rl3*8", gtr: "bc2*8",
        fid: "FH1 FH2 FH3 FH4 FH5 FH6 FH7 FH8", "fidD?0.55": "ds1*8", "mand?0.25": "ch*8", "perc?0.4": "cl*8", perc: "bsh*8" } },
    { name: "bridge", bars: 8, prog: "Dm Dm Bb C Dm Gm A7 A7",
      lanes: { drums: "db*7 dbf", bass: "held*8", banjo: "-*8", gtr: "bcm*8", pad: "pad*8", tw: "TW1 TW2 TW3 TW4 TW5 TW6 TW7 TW8",
        wst: "-*4 TW5 TW6 TW7 TW8", "gtrR?0.5": "sus*8", perc: "bsh2*8", "fidD?0.6": "-*4 sus sus sus sus" } },
    { name: "chorus3", bars: 8, tr: 2, prog: "G D A D G D Em A",
      lanes: { drums: "dc dc2*6 dcf", bass: "walk walk2 walk walk2 walk walk2 walk walk2", banjo: "rl3*8", gtr: "bc2*8",
        fid: "FH1 FH2 FH3 FH4 FH5 FH6 FH7 FH8", fidD: "ds2*8", mand: "ch*8", "perc?0.01": "cl2*8", perc: "bsh*8", "gtrR?0.6": "sus*8" } },
    { name: "tag", bars: 4, prog: "G A A7 A7sus",
      lanes: { drums: "dt dt dt dtf", bass: "walk alt alt hit", banjo: "rl1 rl2 rl1 rl2", gtr: "bc*4", wst: "WH2 WH3 WT1 -", perc: "bsh*4" } },
  ],
};
THEMES_BUILD.canyon = canyon;

export const THEMES = THEMES_BUILD;
export const RACE_THEMES = ["sunset", "snow", "neon"].filter((k) => THEMES_BUILD[k]);

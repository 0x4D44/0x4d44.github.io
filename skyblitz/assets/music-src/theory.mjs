// Music-theory + arrangement helpers for the SKYBLITZ composers. Pure functions + a tiny Song/Part model.
// Time is in beats (quarter notes); one bar = 4 beats. Pitches are MIDI numbers.
import { mulberry32 } from '../../src/util.js';

export { mulberry32 };
export const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export const Q = {
  maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7],
  dim: [0, 3, 6], add9: [0, 4, 7, 14], min9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], dom9: [0, 4, 7, 10, 14], five: [0, 7], aug: [0, 4, 8],
  m7b5: [0, 3, 6, 10], min6: [0, 3, 7, 9], maj6: [0, 4, 7, 9], dom7s9: [0, 4, 7, 10, 15], min11: [0, 3, 7, 10, 17],
};
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], pentMaj: [0, 2, 4, 7, 9], pentMin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11],
};
// GM drum map
export const D = {
  kick: 36, rim: 37, snare: 38, clap: 39, hat: 42, hatPedal: 44, hatOpen: 46, tomLo: 41, tomMid: 45, tomHi: 48, tomHi2: 50, crash: 49, ride: 51, crash2: 57,
  tamb: 54, cowbell: 56, shaker: 70, conga: 63, congaLo: 64, bongo: 60, bongoLo: 61, claves: 75, splash: 55, kick2: 35, snare2: 40,
};
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const note = (name, oct) => PC[name] + 12 * (oct + 1);       // note('C',4) = 60
export const chord = (root, q = 'maj') => ({ root: PC[root], q, tones: Q[q], name: root + q });
/** Scale degree -> MIDI. key = pitch class, d = 0-based degree (may be negative or > 6), oct = octave of degree 0 (C-based number: 4 -> middle). */
export function deg(key, scale, d, oct = 4) {
  const s = SCALES[scale], n = s.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
  return key + 12 * (oct + 1) + s[i] + 12 * o;
}
/** Place pitch class pc at the octave nearest to target. */
export function nearest(pc, target) { let m = pc + 12 * Math.round((target - pc) / 12); return m; }

/** Smooth voice leading: pick octave/inversion of `c` (first n tones) closest to the previous voicing, inside [lo,hi]. */
export function voiceLead(prev, c, lo = 55, hi = 79, n = 4) {
  const pcs = c.tones.slice(0, n).map((t) => (c.root + t) % 12);
  const options = (pc) => { const o = []; for (let m = pc; m <= hi; m += 12) if (m >= lo) o.push(m); return o; };
  if (!prev) {
    const mid = (lo + hi) / 2 - 3;
    return pcs.map((pc) => nearest(pc, mid)).sort((a, b) => a - b).map((m) => Math.min(hi, Math.max(lo, m)));
  }
  // brute force over assignment of chord tones to previous voices
  const perms = []; const idx = prev.map((_, i) => i).slice(0, pcs.length);
  const permute = (a, k = 0) => { if (k === a.length) { perms.push(a.slice()); return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; permute(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  permute(idx);
  let best = null, bestCost = 1e9;
  for (const p of perms) {
    let cost = 0; const v = [];
    for (let j = 0; j < pcs.length; j++) {
      const target = prev[p[j]] ?? prev[0], opts = options(pcs[j]);
      let bm = opts[0], bd = 1e9;
      for (const m of opts) { const d = Math.abs(m - target); if (d < bd) { bd = d; bm = m; } }
      v.push(bm); cost += bd;
    }
    v.sort((a, b) => a - b);
    if (new Set(v).size < v.length) cost += 20;
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}

/** Notes of a chord spread over a register: ('root' lowest) for basses / pads. */
export function stack(c, base, count = c.tones.length) { return c.tones.slice(0, count).map((t) => base + ((c.root + t - base) % 12 + 12) % 12 + (t >= 12 ? 12 : 0)); }
export const rootNear = (c, target) => nearest(c.root, target);

// ---------------------------------------------------------------- Song / Part model
export class Part {
  constructor(song, o) { Object.assign(this, { stem: 'base', vol: 100, pan: 64, reverb: 40, program: 0, tight: false, swing: 0, vel: 1 }, o); this.song = song; this.notes = []; this.cc = []; }
  /** t = absolute beat. */
  n(t, d, pitch, v = 90) { this.notes.push({ t, d, n: pitch, v: Math.round(v * this.vel) }); return this; }
  chord(t, d, pitches, v = 85, strum = 0) { pitches.forEach((p, i) => this.n(t + i * strum, d - i * strum, p, v - i)); return this; }
}

export class Song {
  /** sections: [['intro', 2], ['A', 8], ...]; the first section is the intro when `intro: true`. */
  constructor({ id, bpm, key, sections, seed = 1, swing = 0 }) {
    this.id = id; this.bpm = bpm; this.key = key; this.parts = []; this.rand = mulberry32(seed); this.swing = swing;
    let b = 0; this.sections = sections.map(([name, bars]) => { const s = { name, bars, start: b, startBeat: b * 4 }; b += bars; return s; });
    this.totalBars = b; this.introBars = this.sections.filter((s) => s.name === 'intro').reduce((a, s) => a + s.bars, 0);
    this.loopBars = this.totalBars - this.introBars;
  }
  sec(name) { return this.sections.find((s) => s.name === name); }
  part(o) { const p = new Part(this, o); this.parts.push(p); return p; }
  get lengthBeats() { return this.totalBars * 4; }
  /** Humanise: swing (delay off-8ths/16ths by fraction of the grid), timing jitter in beats, velocity jitter. */
  finish() {
    for (const p of this.parts) {
      const jt = p.tight ? 0.004 : 0.010, jv = p.tight ? 3 : 6, sw = p.swing ?? this.swing;
      for (const n of p.notes) {
        if (sw) { const q = Math.round(n.t * 4) / 4, on16 = Math.abs(n.t - q) < 0.02; if (on16 && (Math.round(n.t * 4) % 2 === 1)) n.t += sw * 0.25; }
        n.t = Math.max(0, n.t + (this.rand() - 0.5) * 2 * jt);
        n.v = Math.max(1, Math.min(127, n.v + Math.round((this.rand() - 0.5) * 2 * jv)));
      }
      p.notes.sort((a, b) => a.t - b.t);
    }
    return this;
  }
}

/** Write a drum pattern from step strings (16 chars/bar, '.' = rest, digits/x = hit; 'X' accent, 'g' ghost) into a part. */
export function drumBar(part, startBeat, rows, step = 0.25) {
  for (const [pitch, pat] of Object.entries(rows)) {
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch === '.' || ch === ' ') continue;
      const v = ch === 'X' ? 112 : ch === 'x' ? 92 : ch === 'g' ? 48 : ch === 'o' ? 70 : ch === 'h' ? 78 : 88;
      part.n(startBeat + i * step, 0.12, Number(pitch), v);
    }
  }
}

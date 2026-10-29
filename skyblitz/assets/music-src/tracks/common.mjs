// Shared arrangement helpers for the track composers (kept small and dumb on purpose: the music is in the track files).
import { D, nearest, voiceLead } from '../theory.mjs';

export const trim = (rows, n) => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.slice(0, n)]));

/** Flatten sections into one entry per bar: {s, lb, bar, b0, c, last, phraseEnd}. PROG[name] is the chord list for that section. */
export function flatBars(S, PROG) {
  const flat = [];
  for (const s of S.sections) for (let lb = 0; lb < s.bars; lb++) flat.push({ s, lb, bar: s.start + lb, b0: (s.start + lb) * 4, c: PROG[s.name][lb % PROG[s.name].length], last: lb === s.bars - 1, phraseEnd: lb % 4 === 3 });
  flat.forEach((f, i) => { f.next = flat[i + 1]?.c || flat[S.introBars]?.c || flat[0].c; f.i = i; });
  return flat;
}

/** Drum fill from beat t to the next bar line. kinds: tom | roll | snare | crash */
export function fill(part, t, kind) {
  const end = Math.ceil(t / 4 - 1e-9) * 4;
  if (kind === 'tom') {
    const seq = [D.tomHi, D.tomHi, D.tomMid, D.tomMid, D.tomLo, D.tomLo, D.snare, D.snare];
    for (let k = 0; k * 0.25 + t < end; k++) part.n(t + k * 0.25, 0.12, seq[k % seq.length], 84 + k * 3);
  } else if (kind === 'roll') {
    const n = Math.round((end - t) / 0.125);
    for (let k = 0; k < n; k++) part.n(t + k * 0.125, 0.1, D.snare, 66 + (k / n) * 56);
  } else {
    for (let k = 0; k * 0.25 + t < end; k++) part.n(t + k * 0.25, 0.1, k % 4 === 3 ? D.tomMid : D.snare, 80 + k * 4);
  }
}

/** Standard drum-bar writer with automatic fills: groove rows, plus fill on the last bar of a phrase/section. */
export function drumBars(part, f, groove, { build = false, intro = false, fillKind = 'tom' } = {}) {
  const { b0, last, phraseEnd } = f;
  if (last && !intro) { drumBarRows(part, b0, trim(groove, 8)); fill(part, b0 + 2, build ? 'roll' : fillKind); }
  else if (phraseEnd && !intro) { drumBarRows(part, b0, trim(groove, 12)); fill(part, b0 + 3, 'snare'); }
  else drumBarRows(part, b0, groove);
}
export function drumBarRows(part, start, rows, step = 0.25) {
  for (const [pitch, pat] of Object.entries(rows)) for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]; if (ch === '.' || ch === ' ') continue;
    const v = ch === 'X' ? 112 : ch === 'x' ? 92 : ch === 'g' ? 46 : ch === 'o' ? 70 : ch === 'h' ? 76 : 88;
    part.n(start + i * step, 0.12, Number(pitch), v);
  }
}

/** Place a melody bar: mel = [[beat, dur, degree]...]; toPitch maps a degree (or absolute pitch if abs) to MIDI. */
export function melBar(part, b0, mel, toPitch, vel = 90, { legato = 0.92, shift = 0 } = {}) {
  if (!mel) return;
  for (const [t, d, dg] of mel) part.n(b0 + t, Math.max(0.1, d * legato), toPitch(dg) + shift, vel * (t === 0 ? 1 : 0.94));
}

/** Arpeggio over a chord: pattern = indices into the chord tones stacked over [lo,hi]; step in beats. */
export function arpBar(part, b0, c, pattern, { lo = 60, step = 0.25, dur = null, vel = 80, accent = 8, octUp = 0, count = 5 } = {}) {
  const tones = []; for (let o = 0; o < 3; o++) for (const t of c.tones.slice(0, 4)) tones.push(nearest((c.root + t) % 12, lo) + (tones.length ? 0 : 0) + 12 * Math.floor(o));
  const uniq = [...new Set(c.tones.slice(0, 4).map((t) => (c.root + t) % 12))].map((pc) => nearest(pc, lo + 3)).sort((a, b) => a - b);
  const pool = []; for (let o = 0; o < 3; o++) for (const p of uniq) pool.push(p + 12 * o);
  pool.sort((a, b) => a - b);
  const bar = Math.round(4 / step);
  for (let k = 0; k < bar; k++) part.n(b0 + k * step, dur ?? step * 0.9, pool[pattern[k % pattern.length]] + 12 * octUp, vel + (k % 4 === 0 ? accent : 0));
}

/** Sustained voice-led chord in a bar (pads / strings). returns the voicing for chaining. */
export function padBar(part, b0, c, prev, { lo = 55, hi = 76, n = 4, len = 3.95, vel = 66, strum = 0.02 } = {}) {
  const v = voiceLead(prev, c, lo, hi, n);
  part.chord(b0, len, v, vel, strum);
  return v;
}

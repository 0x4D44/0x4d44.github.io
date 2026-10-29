// "Lagoon Run" - SUNRISE course. Tropical surf-pop, 128 bpm, A major. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) | B(8) | A2(8) | build(4) | drop(4)   (loop = 32 bars = 60 s)
// Stems: base = drums + bass + offbeat guitar | lead = steel-drum hook | drive = marimba ostinato + tremolo surf guitar
//        final = whistle counter-melody + brass stabs + strings + timpani.
import { Song, PC, chord, deg, voiceLead, nearest, drumBar, D } from '../theory.mjs';

export const options = { name: 'Lagoon Run', wet: 0.28, tail: 5, lufs: -17, roles: { base: 'always', lead: 'race', drive: 'speed', final: 'finalLap' } };

const K = PC.A;
const A = chord('A', 'maj'), Fm7 = chord('F#', 'min7'), Dm7 = chord('D', 'maj7'), E = chord('E', 'maj'), Dd = chord('D', 'maj'), Bm7 = chord('B', 'min7'), Fm = chord('F#', 'min');
const PROG = {
  intro: [E, E], A: [A, Fm7, Dm7, E, A, Fm7, Dm7, E], B: [Dd, A, Bm7, E, Dd, A, Bm7, E], A2: [A, Fm7, Dm7, E, A, Fm7, Dm7, E],
  build: [Fm, Dd, Bm7, E], drop: [A, E, Fm, Dd],
};
// melodies as [beat, dur, scale-degree (0 = A4)] per bar
const M_A1 = [
  [[0, .5, 2], [.5, .5, 4], [1, 1.5, 7], [2.5, .5, 4], [3, 1, 2]], [[0, .5, 5], [.5, .5, 4], [1, 1, 2], [2, .75, 5], [2.75, .25, 4], [3, 1, 2]],
  [[0, .5, 3], [.5, .5, 5], [1, 1.5, 7], [2.5, .5, 5], [3, 1, 3]], [[0, .5, 4], [.5, .5, 6], [1, 1, 8], [2, .5, 6], [2.5, .5, 4], [3, 1, 1]],
];
const M_A2 = [
  [[0, .5, 4], [.5, .5, 7], [1, 1.5, 9], [2.5, .5, 7], [3, 1, 4]], [[0, 1, 5], [1, .5, 7], [1.5, .5, 5], [2, 1, 4], [3, 1, 2]],
  [[0, .5, 3], [.5, .5, 5], [1, .5, 7], [1.5, .5, 5], [2, 2, 3]], [[0, 1, 6], [1, 1, 4], [2, 1, 1], [3.5, .5, 2]],
];
const M_B = [
  [[0, 1.5, 5], [1.5, .5, 7], [2, 2, 9]], [[0, 1.5, 9], [1.5, .5, 8], [2, 1, 7], [3, 1, 4]], [[0, 1, 8], [1, .5, 7], [1.5, .5, 5], [2, 1, 3], [3, 1, 5]], [[0, 2, 6], [2, .5, 4], [2.5, .5, 6], [3, 1, 8]],
  [[0, 1.5, 5], [1.5, .5, 7], [2, 1, 9], [3, 1, 10]], [[0, 2, 9], [2, 1, 7], [3, 1, 9]], [[0, 1.5, 8], [1.5, .5, 9], [2, 1, 10], [3, 1, 8]], [[0, 2, 7], [2, 1, 6], [3, 1, 4]],
];
const M_DROP = [
  [[0, 1, 4], [1, 1, 7], [2, 2, 9]], [[0, 1, 8], [1, 1, 6], [2, 2, 4]], [[0, 1, 5], [1, 1, 9], [2, 2, 7]], [[0, 1, 3], [1, 1, 5], [2, 1, 7], [3, 1, 10]],
];

export function compose() {
  const S = new Song({ id: 'sunrise', bpm: 128, key: 'A', seed: 11, sections: [['intro', 2], ['A', 8], ['B', 8], ['A2', 8], ['build', 4], ['drop', 4]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 108, pan: 64, reverb: 28, tight: true });
  const bass = S.part({ name: 'bass', program: 33, stem: 'base', vol: 108, pan: 64, reverb: 10, tight: true });
  const gtr = S.part({ name: 'skank', program: 28, stem: 'base', vol: 84, pan: 40, reverb: 50 });
  const steel = S.part({ name: 'steel', program: 114, stem: 'lead', vol: 100, pan: 72, reverb: 60 });
  const mar = S.part({ name: 'marimba', program: 12, stem: 'drive', vol: 88, pan: 50, reverb: 45 });
  const surf = S.part({ name: 'surf', program: 27, stem: 'drive', vol: 74, pan: 88, reverb: 85 });
  const whistle = S.part({ name: 'whistle', program: 78, stem: 'final', vol: 80, pan: 60, reverb: 70 });
  const brass = S.part({ name: 'brass', program: 61, stem: 'final', vol: 86, pan: 70, reverb: 40 });
  const strings = S.part({ name: 'strings', program: 48, stem: 'final', vol: 76, pan: 64, reverb: 60 });
  const timp = S.part({ name: 'timpani', program: 47, stem: 'final', vol: 96, pan: 64, reverb: 55 });

  let prevGtr = null;
  const flat = [];   // every bar in order: {sec, lb, bar, chord}
  for (const s of S.sections) for (let lb = 0; lb < s.bars; lb++) flat.push({ s, lb, bar: s.start + lb, c: PROG[s.name][lb] });
  const nextChord = (i) => flat[i + 1]?.c || flat[S.introBars]?.c || flat[0].c;

  flat.forEach(({ s, lb, bar, c }, i) => {
    const b0 = bar * 4, name = s.name, last = lb === s.bars - 1, phraseEnd = (lb % 4) === 3;
    const hot = name === 'B' || name === 'drop', build = name === 'build', intro = name === 'intro';
    const e = intro ? 0.7 : name === 'A' ? 0.82 : name === 'A2' ? 0.9 : build ? 0.95 : 1.05;
    const nxt = nextChord(i);
    // ---- drums
    const groove = hot
      ? { [D.kick]: 'X...X...X...X...', [D.snare]: '....X.......X...', [D.clap]: hot && name === 'drop' ? '....x.......x...' : '................', [D.hat]: 'x.xxx.xxx.xxx.xx', [D.hatOpen]: '..o...o...o...o.', [D.tamb]: 'oooooooooooooooo' }
      : build
        ? { [D.kick]: 'X...X...X...X...', [D.snare]: lb < 2 ? '....X.......X...' : 'x.x.x.x.x.x.x.x.', [D.hat]: 'x.x.x.x.x.x.x.x.' }
        : intro
          ? { [D.hat]: lb === 0 ? '................' : 'x.x.x.x.x.x.x.x.', [D.shaker]: 'oooooooooooooooo', [D.kick]: lb === 1 ? 'X...........X...' : '................' }
          : { [D.kick]: 'X.....x.X...x...', [D.snare]: '....X.......X...', [D.hat]: 'x.x.x.x.x.x.x.x.', [D.hatOpen]: '..............o.', [D.shaker]: 'o.o.o.o.o.o.o.o.' };
    if (last && !intro) { drumBar(drums, b0, trim(groove, 8)); fill(drums, b0 + 2, build ? 'roll' : 'tom'); }
    else if (phraseEnd && !intro) { drumBar(drums, b0, trim(groove, 12)); fill(drums, b0 + 3, 'snare'); }
    else drumBar(drums, b0, groove);
    if (lb === 0 && !intro) drums.n(b0, 1.5, D.crash, 110);
    if (intro && lb === 1) fill(drums, b0 + 2, 'tom');
    // ---- bass
    if (!intro || lb === 1) {
      const r = nearest(c.root, 40), nr = nearest(nxt.root, 40);
      const app = nr + (nr > r ? -1 : 1);
      const pat = [[0, .5, r], [.75, .25, r], [1.5, .5, r + 12], [2, .5, r], [2.75, .25, r], [3.25, .25, r + 7], [3.5, .5, phraseEnd ? app : r + 12]];
      for (const [t, d, p] of pat) bass.n(b0 + t, d * 0.9, p, (t === 0 ? 108 : 92) * e);
    }
    // ---- offbeat guitar (voice-led triads)
    prevGtr = voiceLead(prevGtr, c, 58, 76, 3);
    if (!intro || lb === 1) for (const t of [0.5, 1.5, 2.5, 3.5]) gtr.chord(b0 + t, 0.22, prevGtr, (hot ? 84 : 72) * e, 0.012);
    if (hot) for (const t of [0.75, 2.75]) gtr.chord(b0 + t, 0.15, prevGtr, 60 * e, 0.01);
    // ---- steel-drum lead
    const mel = name === 'A' ? (lb < 4 ? M_A1[lb] : M_A2[lb - 4]) : name === 'A2' ? (lb < 4 ? M_A2[lb] : M_A1[lb - 4]) : name === 'B' ? M_B[lb] : name === 'drop' ? M_DROP[lb] : null;
    if (mel) {
      for (const [t, d, dg] of mel) {
        const p = deg(K, 'major', dg, 4);
        steel.n(b0 + t, Math.min(d, 0.9) + (d > 1 ? 0.1 : 0), p, (name === 'drop' ? 104 : hot ? 98 : 90) * (t === 0 ? 1 : 0.94));
        if (d >= 1.5) for (let k = 1; k < d * 2 - 1; k++) steel.n(b0 + t + k * 0.5, 0.4, p, 62);   // rolled sustain
        // surf tremolo guitar doubles long notes an octave down in the hot sections
        if (hot && d >= 1) for (let k = 0; k < d * 8; k++) surf.n(b0 + t + k * 0.125, 0.12, p - 12, 54 + (k % 4 === 0 ? 14 : 0));
        if (hot) whistle.n(b0 + t, Math.min(d, 1.5), deg(K, 'major', dg - 2, 4) + 12 * (name === 'drop' ? 1 : 0), 70);
      }
    }
    if (build) {   // rising steel-drum run
      for (let k = 0; k < 8; k++) steel.n(b0 + k * 0.5, 0.45, deg(K, 'major', 2 + lb * 2 + k * (lb + 1) % 5 + k, 4), 70 + lb * 10 + k * 2);
      for (let k = 0; k < 8 * (lb + 1); k++) surf.n(b0 + k * (0.5 / (lb + 1)), 0.1, deg(K, 'major', 4, 5), 50 + lb * 14);
    }
    if (intro && lb === 1) [[0, 6], [.5, 8], [1, 10], [2, 9], [3, 8]].forEach(([t, dg]) => steel.n(b0 + t, 0.5, deg(K, 'major', dg, 4), 84));
    if (intro) { surf.n(b0, 3.8, deg(K, 'major', lb ? 4 : 1, 5), 70); }
    // ---- marimba ostinato (drive)
    if (!intro && !build) {
      const tones = c.tones.slice(0, 3).map((t) => nearest((c.root + t) % 12, 72)).sort((a, b) => a - b);
      const seq = [0, 1, 2, 1, 2, 1, 0, 1];
      seq.forEach((ix, k) => mar.n(b0 + k * 0.5, 0.4, tones[ix] + (k === 7 ? 12 : 0), (k % 2 ? 66 : 82) * e));
    }
    // ---- final-lap stem: brass stabs, strings, timpani
    if (hot || build) {
      const v = voiceLead(null, c, 55, 70, 3);
      for (const t of hot ? [0, 1.5, 2.5] : [0, 2]) brass.chord(b0 + t, 0.35, v, 92, 0.01);
      strings.chord(b0, 3.9, voiceLead(null, c, 60, 79, 3).map((p) => p + 0), 70, 0.02);
      timp.n(b0, 0.5, nearest(c.root, 45), 100);
      if (!build) timp.n(b0 + 2, 0.4, nearest(c.root, 45), 84);
    }
    if (build) for (let k = 0; k < 4 * (lb + 1); k++) timp.n(b0 + k * (1 / (lb + 1)), 0.2, nearest(c.root, 48), 60 + lb * 18 + k);
    if (name === 'A2' || name === 'A') if (lb % 2 === 0) strings.chord(b0, 7.8, voiceLead(null, c, 62, 79, 3), 56, 0.03);
    if (name === 'A2' && mel) for (const [t, d, dg] of mel) if (d >= 1) whistle.n(b0 + t + 0.0, d, deg(K, 'major', dg + 2, 5), 60);
  });
  return S.finish();
}

const trim = (rows, n) => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.slice(0, n)]));

/** Drum fill starting at beat `t` (runs to the next bar line). */
function fill(part, t, kind) {
  const end = Math.ceil(t / 4) * 4;
  if (kind === 'tom') {
    const seq = [D.tomHi, D.tomHi, D.tomMid, D.tomMid, D.tomLo, D.tomLo, D.snare, D.snare];
    for (let k = 0; k * 0.25 + t < end; k++) part.n(t + k * 0.25, 0.12, seq[k % seq.length], 84 + k * 3);
  } else if (kind === 'roll') {
    const n = Math.round((end - t) / 0.125);
    for (let k = 0; k < n; k++) part.n(t + k * 0.125, 0.1, D.snare, 70 + (k / n) * 52);
  } else {
    for (let k = 0; k * 0.25 + t < end; k++) part.n(t + k * 0.25, 0.1, k % 4 === 3 ? D.tomMid : D.snare, 80 + k * 4);
  }
}

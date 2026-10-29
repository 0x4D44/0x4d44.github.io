// "Podium" - results / victory theme. Bright brass-and-strings pop fanfare, 112 bpm, C major. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) | B(8)   (loop = 16 bars = 34 s).  Stems: base = drums + bass + strings | lead = brass melody | drive = piano + glockenspiel
import { Song, PC, chord, deg, voiceLead, nearest, D } from '../theory.mjs';
import { flatBars, drumBars, melBar, padBar, arpBar } from './common.mjs';

export const options = { name: 'Podium', wet: 0.3, tail: 5, lufs: -17, roles: { base: 'always', lead: 'always', drive: 'always' } };
const K = PC.C;
const C = chord('C', 'maj'), G = chord('G', 'maj'), Am = chord('A', 'min'), F = chord('F', 'maj'), Em = chord('E', 'min'), Gs = chord('G', 'sus4');
const PROG = { intro: [C, Gs], A: [C, G, Am, F, C, G, F, G], B: [F, G, Em, Am, F, G, C, C] };
// degrees of C major (0 C5, 2 E5, 4 G5, 7 C6)
const MA = [
  [[0, .5, 0], [.5, .5, 2], [1, 1, 4], [2, 2, 7]], [[0, 1, 6], [1, 1, 4], [2, 2, 1]], [[0, 1, 5], [1, .5, 4], [1.5, .5, 2], [2, 2, 0]], [[0, 1, 3], [1, 1, 5], [2, 2, 7]],
  [[0, .5, 4], [.5, .5, 7], [1, 1, 9], [2, 2, 11]], [[0, 1, 8], [1, 1, 6], [2, 2, 4]], [[0, 1.5, 7], [1.5, .5, 5], [2, 2, 3]], [[0, 1, 4], [1, 1, 6], [2, 2, 8]],
];
const MB = [
  [[0, 1, 7], [1, 1, 5], [2, 2, 10]], [[0, 1, 8], [1, 1, 6], [2, 2, 11]], [[0, 1, 9], [1, 1, 7], [2, 2, 6]], [[0, 1, 7], [1, 1, 9], [2, 2, 11]],
  [[0, 1, 10], [1, 1, 9], [2, 1, 7], [3, 1, 5]], [[0, 1, 8], [1, 1, 6], [2, 2, 8]], [[0, 1, 7], [1, 1, 9], [2, 2, 11]], [[0, 4, 14]],
];

export function compose() {
  const S = new Song({ id: 'results', bpm: 112, key: 'C', seed: 77, sections: [['intro', 2], ['A', 8], ['B', 8]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 100, reverb: 50, tight: true });
  const bass = S.part({ name: 'bass', program: 33, stem: 'base', vol: 100, pan: 64, reverb: 10, tight: true });
  const strings = S.part({ name: 'strings', program: 48, stem: 'base', vol: 86, pan: 60, reverb: 65 });
  const brass = S.part({ name: 'brass', program: 61, stem: 'lead', vol: 100, pan: 64, reverb: 55 });
  const trumpet = S.part({ name: 'trumpet', program: 56, stem: 'lead', vol: 88, pan: 72, reverb: 55 });
  const piano = S.part({ name: 'piano', program: 0, stem: 'drive', vol: 92, pan: 46, reverb: 45 });
  const glock = S.part({ name: 'glock', program: 9, stem: 'drive', vol: 76, pan: 84, reverb: 85 });
  const mj = (d) => deg(K, 'major', d, 5);
  let prevS = null;
  for (const f of flatBars(S, PROG)) {
    const { s, lb, b0, c } = f, name = s.name, intro = name === 'intro', B = name === 'B';
    const e = intro ? 0.8 : B ? 1.05 : 0.95;
    const groove = intro ? { [D.snare]: lb ? 'x.x.x.x.x.x.xxxx' : '................', [D.crash]: lb ? '................' : 'X...............' }
      : { [D.kick]: 'X.....x.X...x...', [D.snare]: '....X.......X...', [D.hat]: B ? 'x.x.x.x.x.x.x.x.' : 'x...x...x...x...', [D.tamb]: B ? 'o.o.o.o.o.o.o.o.' : '....o.......o...', [D.hatOpen]: '..............o.' };
    drumBars(drums, f, groove, { intro });
    if (lb === 0 && !intro) drums.n(b0, 3, D.crash, 108);
    const r = nearest(c.root, 36);
    if (!intro) for (let k = 0; k < 8; k++) bass.n(b0 + k * 0.5, 0.45, r + (k % 4 === 2 ? 7 : k % 4 === 3 ? 12 : 0), (k === 0 ? 104 : 86) * e);
    prevS = padBar(strings, b0, c, prevS, { lo: 52, hi: 74, n: 4, vel: 68 * e });
    const mel = name === 'A' ? MA[lb] : B ? MB[lb] : null;
    if (mel) { melBar(brass, b0, mel, mj, 100, { legato: 1.0 }); melBar(trumpet, b0, mel, mj, 80, { shift: 12, legato: 0.8 }); }
    if (intro) { brass.chord(b0, lb ? 3.8 : 1.8, voiceLead(null, c, 55, 72, 3), 92, 0.01); if (lb) brass.chord(b0 + 3.4, 0.5, voiceLead(null, C, 55, 72, 3), 100, 0.008); }
    if (!intro) {
      arpBar(piano, b0, c, [0, 1, 2, 1, 3, 2, 1, 2], { lo: 55, step: 0.5, dur: 0.9, vel: 70 * e, accent: 10 });
      for (const t of [0.5, 1.5, 2.5, 3.5]) if (B) glock.n(b0 + t, 0.4, mj(7 + c.tones.indexOf(c.tones[(t * 2) % 3]) * 2), 66);
    }
  }
  return S.finish();
}

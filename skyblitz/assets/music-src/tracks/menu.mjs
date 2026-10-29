// "Skyward" - title / menu theme. Hopeful, heroic orchestral-pop, 96 bpm, G major. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) | B(8) | build(4) | drop(4)   (loop = 24 bars = 60 s)
// Stems: base = soft drums + bass + sustained strings | lead = horn / trumpet melody | drive = piano + harp arpeggios | final = choir + brass + glockenspiel + timpani
import { Song, PC, chord, deg, voiceLead, nearest, D } from '../theory.mjs';
import { flatBars, drumBars, melBar, padBar, arpBar } from './common.mjs';

export const options = { name: 'Skyward', wet: 0.34, tail: 6, lufs: -17, roles: { base: 'always', lead: 'always', drive: 'always', final: 'always' } };
const K = PC.G;
const G = chord('G', 'maj'), Dd = chord('D', 'maj'), Em7 = chord('E', 'min7'), C = chord('C', 'maj'), Am7 = chord('A', 'min7'), Em = chord('E', 'min'), Am = chord('A', 'min'), Dsus = chord('D', 'sus4');
const PROG = {
  intro: [G, Dsus], A: [G, Dd, Em7, C, G, Dd, C, Dd], B: [C, G, Am7, Dd, C, G, Dd, Dd], build: [Em, C, Am, Dsus], drop: [G, Dd, Em, C],
};
const MA = [
  [[0, 1, 0], [1, 1, 4], [2, 2, 7]], [[0, 1.5, 6], [1.5, .5, 4], [2, 2, 8]], [[0, 1, 9], [1, 1, 7], [2, 1, 5], [3, 1, 4]], [[0, 1.5, 5], [1.5, .5, 7], [2, 2, 10]],
  [[0, 1, 7], [1, 1, 9], [2, 2, 11]], [[0, 2, 8], [2, 1, 6], [3, 1, 8]], [[0, 1, 10], [1, 1, 9], [2, 1, 7], [3, 1, 5]], [[0, 2, 6], [2, 2, 4]],
];
const MB = [
  [[0, 1.5, 7], [1.5, .5, 8], [2, 2, 10]], [[0, 1.5, 9], [1.5, .5, 7], [2, 2, 4]], [[0, 1, 8], [1, 1, 10], [2, 2, 12]], [[0, 1, 11], [1, 1, 8], [2, 2, 6]],
  [[0, 1, 10], [1, .5, 9], [1.5, .5, 7], [2, 2, 5]], [[0, 2, 9], [2, 2, 11]], [[0, 1, 13], [1, 1, 11], [2, 2, 8]], [[0, 3, 11], [3, 1, 8]],
];
const MD = [[[0, 1, 7], [1, 1, 11], [2, 2, 14]], [[0, 1.5, 13], [1.5, .5, 11], [2, 2, 8]], [[0, 1, 12], [1, 1, 11], [2, 2, 9]], [[0, 1, 10], [1, 1, 12], [2, 2, 14]]];

export function compose() {
  const S = new Song({ id: 'menu', bpm: 96, key: 'G', seed: 5, sections: [['intro', 2], ['A', 8], ['B', 8], ['build', 4], ['drop', 4]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 96, reverb: 60, tight: true });
  const bass = S.part({ name: 'bass', program: 33, stem: 'base', vol: 98, pan: 64, reverb: 10, tight: true });
  const strings = S.part({ name: 'strings', program: 48, stem: 'base', vol: 90, pan: 60, reverb: 70 });
  const horn = S.part({ name: 'horn', program: 60, stem: 'lead', vol: 100, pan: 64, reverb: 60 });
  const trump = S.part({ name: 'trumpet', program: 56, stem: 'lead', vol: 92, pan: 70, reverb: 55 });
  const piano = S.part({ name: 'piano', program: 0, stem: 'drive', vol: 92, pan: 46, reverb: 50 });
  const harp = S.part({ name: 'harp', program: 46, stem: 'drive', vol: 84, pan: 84, reverb: 80 });
  const choir = S.part({ name: 'choir', program: 52, stem: 'final', vol: 84, pan: 64, reverb: 100 });
  const brass = S.part({ name: 'brass', program: 61, stem: 'final', vol: 90, pan: 60, reverb: 55 });
  const glock = S.part({ name: 'glock', program: 9, stem: 'final', vol: 74, pan: 84, reverb: 90 });
  const timp = S.part({ name: 'timpani', program: 47, stem: 'final', vol: 100, pan: 64, reverb: 70 });

  const mj = (d) => deg(K, 'major', d, 4);
  let prevS = null;
  for (const f of flatBars(S, PROG)) {
    const { s, lb, b0, c } = f, name = s.name, intro = name === 'intro', build = name === 'build', drop = name === 'drop', hot = name === 'B' || drop;
    const e = intro ? 0.72 : name === 'A' ? 0.84 : build ? 0.95 : 1.05;
    const groove = intro ? { [D.hat]: lb ? 'x...x...x...x...' : '................', [D.tomLo]: lb ? 'X...........X...' : 'X...............' }
      : build ? { [D.kick]: 'X.......X.......', [D.snare]: lb < 2 ? '........X.......' : 'x.x.x.x.x.x.x.x.', [D.tomMid]: 'X.......X.......' }
        : hot ? { [D.kick]: 'X.....x.X.....x.', [D.snare]: '........X.......', [D.clap]: '........x.......', [D.hat]: 'x.x.x.x.x.x.x.x.', [D.tamb]: '....o.......o...', [D.tomLo]: 'X.......X.......' }
          : { [D.kick]: 'X.......X.....x.', [D.snare]: '........X.......', [D.rim]: '....x.......x...', [D.hat]: 'x...x...x...x...' };
    drumBars(drums, f, groove, { build, intro });
    if (lb === 0 && !intro) drums.n(b0, 3, D.crash, hot ? 108 : 90);
    const r = nearest(c.root, 36);
    if (!intro || lb === 1) for (let k = 0; k < 8; k++) bass.n(b0 + k * 0.5, 0.45, r + (k % 4 === 2 ? 7 : k % 4 === 3 ? 12 : 0), (k === 0 ? 100 : 82) * e);
    prevS = padBar(strings, b0, c, prevS, { lo: 52, hi: 74, n: 4, vel: 66 * e });
    const mel = name === 'A' ? MA[lb] : name === 'B' ? MB[lb] : drop ? MD[lb] : null;
    if (mel) {
      melBar(name === 'B' ? trump : horn, b0, mel, mj, hot ? 100 : 90, { legato: 1.0 });
      if (hot) melBar(horn, b0, mel, mj, 78, { shift: -12, legato: 1.0 });
    }
    if (intro && lb === 1) melBar(horn, b0, [[0, 2, 0], [2, 2, 4]], mj, 86);
    if (build) for (let k = 0; k < 8; k++) horn.n(b0 + k * 0.5, 0.45, mj(1 + lb * 2 + k), 70 + lb * 10 + k * 3);
    // piano arps + harp (drive)
    if (!intro) {
      arpBar(piano, b0, c, [0, 1, 2, 1, 3, 2, 1, 2], { lo: 55, step: 0.5, dur: 0.9, vel: 70 * e, accent: 10 });
      if (hot) arpBar(harp, b0, c, [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1], { lo: 64, step: 0.25, dur: 0.7, vel: 60 * e, accent: 8 });
    }
    // final: choir, brass, glock sparkle, timpani
    if (hot || build) {
      choir.chord(b0, 3.95, voiceLead(null, c, 55, 74, 3), 74, 0.04);
      brass.chord(b0, 1.6, voiceLead(null, c, 53, 70, 3), 86, 0.012);
      if (!build) brass.chord(b0 + 2, 1.9, voiceLead(null, c, 53, 70, 3), 80, 0.012);
      timp.n(b0, 0.8, nearest(c.root, 43), 100);
      if (!build) glock.n(b0 + 1.5, 0.5, mj(7 + [0, 2, 4][lb % 3]), 70);
    }
    if (build) for (let k = 0; k < 4 * (lb + 1); k++) timp.n(b0 + k / (lb + 1), 0.2, nearest(c.root, 48), 60 + lb * 16 + k);
  }
  return S.finish();
}

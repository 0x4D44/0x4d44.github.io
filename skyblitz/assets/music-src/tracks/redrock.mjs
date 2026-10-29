// "Mesa Burn" - REDROCK course. Desert funk-rock, 104 bpm, E dorian/minor, swung 16ths. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) funk verse | B(8) rock chorus | A2(8) | build(4) | drop(4)
// Stems: base = drums + slap bass + clavinet chops | lead = overdriven guitar riff/melody | drive = Rhodes comping + muted guitar scratches
//        final = brass stabs + organ + screaming octave guitar + cowbell-like lift.
import { Song, PC, chord, deg, voiceLead, nearest, D } from '../theory.mjs';
import { flatBars, drumBars, melBar, padBar } from './common.mjs';

export const options = { name: 'Mesa Burn', wet: 0.22, tail: 4, lufs: -17, bitrate: { base: 46, lead: 36, drive: 32, final: 34 }, roles: { base: 'always', lead: 'race', drive: 'speed', final: 'finalLap' } };
const K = PC.E;
const Em7 = chord('E', 'min7'), A7 = chord('A', 'dom7'), Am7 = chord('A', 'min7'), B7 = chord('B', 'dom7'), C = chord('C', 'maj'), Dd = chord('D', 'maj'), G = chord('G', 'maj'), Em = chord('E', 'min');
const PROG = {
  intro: [Em7, Em7], A: [Em7, Em7, A7, A7, Em7, Em7, A7, B7], B: [C, Dd, Em7, Em7, C, Dd, G, B7], A2: [Em7, Em7, A7, A7, Em7, Em7, A7, B7],
  build: [Em7, Am7, Dd, B7], drop: [Em, C, Dd, B7],
};
// minor-pentatonic riff (degrees of E pentatonic minor: 0 E,1 G,2 A,3 B,4 D; 5 = E up an octave)
const RIFF1 = [[0, .75, 0], [.75, .25, 2], [1, .5, 3], [1.5, .5, 2], [2, .5, 1], [2.5, .5, 0], [3, 1, -1]];
const RIFF2 = [[0, .5, 2], [.5, .5, 3], [1, .5, 5], [1.5, .5, 3], [2, 1.5, 2], [3.5, .5, 1]];
const RIFF3 = [[0, .5, 5], [.5, .5, 4], [1, .5, 3], [1.5, .5, 2], [2, 1, 3], [3, 1, 5]];
const RIFF4 = [[0, .5, 3], [.5, .5, 5], [1, 1, 6], [2, .5, 5], [2.5, .5, 3], [3, 1, 2]];
// chorus melody: scale degrees of E natural minor (0 E4, 2 G4, 4 B4, 5 C5, 6 D5, 7 E5 ...)
const CH = [
  [[0, 1.5, 9], [1.5, .5, 7], [2, 1, 5], [3, 1, 7]], [[0, 1.5, 8], [1.5, .5, 6], [2, 2, 8]], [[0, 1, 11], [1, 1, 9], [2, 1, 7], [3, 1, 4]], [[0, 3, 7], [3, 1, 6]],
  [[0, 1.5, 9], [1.5, .5, 11], [2, 1, 12], [3, 1, 11]], [[0, 1.5, 13], [1.5, .5, 12], [2, 1, 10], [3, 1, 8]], [[0, 1, 9], [1, 1, 11], [2, 2, 13]], [[0, 1, 8], [1, 1, 10], [2, 2, 8]],
];

export function compose() {
  const S = new Song({ id: 'redrock', bpm: 104, key: 'E', seed: 23, swing: 0.2, sections: [['intro', 2], ['A', 8], ['B', 8], ['A2', 8], ['build', 4], ['drop', 4]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 108, reverb: 22, tight: true, swing: 0.16 });
  const bass = S.part({ name: 'slap', program: 36, stem: 'base', vol: 112, pan: 60, reverb: 8, tight: true });
  const clav = S.part({ name: 'clav', program: 7, stem: 'base', vol: 88, pan: 44, reverb: 18, tight: true });
  const gtr = S.part({ name: 'lead guitar', program: 29, stem: 'lead', vol: 100, pan: 74, reverb: 48 });
  const rhodes = S.part({ name: 'rhodes', program: 4, stem: 'drive', vol: 90, pan: 54, reverb: 40 });
  const scratch = S.part({ name: 'scratch', program: 28, stem: 'drive', vol: 82, pan: 90, reverb: 20, tight: true });
  const brass = S.part({ name: 'brass', program: 61, stem: 'final', vol: 96, pan: 66, reverb: 36 });
  const organ = S.part({ name: 'organ', program: 18, stem: 'final', vol: 78, pan: 50, reverb: 45 });
  const scream = S.part({ name: 'scream', program: 30, stem: 'final', vol: 84, pan: 76, reverb: 55 });

  const pent = (d) => deg(K, 'pentMin', d, 4), minor = (d) => deg(K, 'minor', d, 4);
  let prevR = null;
  for (const f of flatBars(S, PROG)) {
    const { s, lb, b0, c, next } = f, name = s.name, intro = name === 'intro', build = name === 'build', chorus = name === 'B', drop = name === 'drop';
    const hot = chorus || drop, e = intro ? 0.75 : name === 'A' ? 0.85 : build ? 0.95 : hot ? 1.05 : 0.92;
    // ---- drums
    const funk = { [D.kick]: lb % 2 ? 'X..x..x...x.....' : 'X....x.x..x..x..', [D.snare]: '....X..g.g..X..g', [D.hat]: 'XxhxXxhxXxhxXxhx', [D.hatOpen]: '..............o.' };
    const rock = { [D.kick]: 'X.....X.X...X...', [D.snare]: '....X.......X...', [D.hat]: 'o.o.o.o.o.o.o.o.', [D.hatOpen]: '................', [D.cowbell]: drop ? 'x...x...x...x...' : '................' };
    const groove = hot ? rock : build ? { [D.kick]: 'X...X...X...X...', [D.snare]: lb < 2 ? '....X.......X...' : 'x.x.x.x.x.x.x.x.', [D.hat]: 'x.x.x.x.x.x.x.x.' } : intro ? { [D.hat]: lb ? 'x.x.x.x.x.x.x.x.' : '................', [D.cowbell]: 'x...x...x...x...', [D.kick]: lb ? 'X..x............' : '................' } : funk;
    drumBars(drums, f, groove, { build, intro });
    if (lb === 0 && !intro) drums.n(b0, 2, D.crash, 108);
    // ---- slap bass: funk 16ths in verse, driving 8ths in rock sections
    const r = nearest(c.root, 40), app = nearest(next.root, 40) + (next.root > c.root ? -1 : 1);
    if (!intro || lb === 1) {
      if (!hot && !build) {
        [[0, .25, 0, 108], [.5, .2, 12, 84], [.75, .25, 0, 92], [1.25, .25, 12, 80], [1.5, .25, 10, 90], [2, .25, 0, 104], [2.5, .2, 12, 84], [2.75, .2, 7, 88], [3.25, .25, 10, 86], [3.5, .25, f.phraseEnd ? app - r : 12, 96]]
          .forEach(([t, d, iv, v]) => bass.n(b0 + t, d, r + iv, v * e));
      } else {
        for (let k = 0; k < 8; k++) bass.n(b0 + k * 0.5, 0.42, r + (k % 4 === 3 ? 7 : k % 2 ? 12 : 0), (k === 0 ? 112 : 92) * e);
        if (f.phraseEnd) bass.n(b0 + 3.5, 0.4, app, 100);
      }
    }
    // ---- clavinet chops on the verse (rock sections thin to stabs)
    const cv = voiceLead(null, c, 60, 74, 3);
    if (!intro) {
      const steps = hot ? [0, 1.5, 2.5] : [0.5, 1, 1.75, 2.5, 3, 3.75];
      for (const t of steps) clav.chord(b0 + t, 0.12, cv, (t === 0 ? 86 : 74) * e, 0.004);
    }
    // ---- lead guitar
    if (name === 'A') melBar(gtr, b0, [RIFF1, RIFF2][lb % 2], pent, 96);
    else if (name === 'A2') melBar(gtr, b0, [RIFF3, RIFF4][lb % 2], pent, 100);
    else if (chorus) melBar(gtr, b0, CH[lb], minor, 98, { legato: 1.0 });
    else if (drop) melBar(gtr, b0, [RIFF1, RIFF2][lb % 2], (d) => pent(d) + 12, 108);
    else if (intro && lb === 1) melBar(gtr, b0, [[0, .5, 0], [.5, .5, 2], [1, .5, 3], [1.5, .5, 5], [2, 2, 6]], pent, 92);
    if (build) for (let k = 0; k < 8; k++) gtr.n(b0 + k * 0.5, 0.45, pent(2 + lb + (k % 4)), 70 + lb * 10 + k * 2);
    // ---- Rhodes comping + muted-guitar scratches (drive)
    if (!intro && !build) {
      prevR = voiceLead(prevR, c, 58, 76, 4);
      for (const t of hot ? [0] : [0.5, 2.5, 3.5]) rhodes.chord(b0 + t, hot ? 3.5 : 0.45, prevR, (hot ? 70 : 78) * e, 0.015);
      for (let k = 0; k < 16; k++) if ('x.xgx.xgx.xgx.xg'[k] !== '.') scratch.n(b0 + k * 0.25, 0.08, cv[k % 3] + 12, 'x.xgx.xgx.xgx.xg'[k] === 'g' ? 44 : 78);
    }
    // ---- final stem: brass hits, organ pad, screaming octave guitar
    if (hot || build) {
      const bv = voiceLead(null, c, 58, 72, 3);
      for (const t of hot ? [0, 1.5, 2.5, 3.5] : [0, 2]) brass.chord(b0 + t, 0.3, bv, 100, 0.008);
      padBar(organ, b0, c, null, { lo: 52, hi: 70, n: 3, vel: 62 });
    }
    if (chorus) melBar(scream, b0, CH[lb], minor, 88, { shift: 12, legato: 1.0 });
    if (drop) melBar(scream, b0, [RIFF1, RIFF2][lb % 2], (d) => pent(d) + 24, 92);
  }
  return S.finish();
}

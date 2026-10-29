// "Glacier Pulse" - FROST course. Icy orchestral-electronic, 126 bpm, D minor. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) | B(8) | A2(8) | build(4) | drop(4)
// Stems: base = electronic drums + sub bass + long strings | lead = celesta/glockenspiel melody + choir | drive = staccato string ostinato + harp
//        final = French horns + choir oohs + timpani + tremolo strings.
import { Song, PC, chord, deg, voiceLead, nearest, D } from '../theory.mjs';
import { flatBars, drumBars, melBar, padBar, arpBar } from './common.mjs';

export const options = { name: 'Glacier Pulse', wet: 0.45, tail: 6, lufs: -17, roles: { base: 'always', lead: 'race', drive: 'speed', final: 'finalLap' } };
const K = PC.D;
const Dm9 = chord('D', 'min9'), Bb = chord('A#', 'maj7'), Fadd = chord('F', 'add9'), Csus = chord('C', 'sus4'), Gm = chord('G', 'min7'), Am = chord('A', 'dom7'), Dm = chord('D', 'min'), C = chord('C', 'maj'), Gm3 = chord('G', 'min');
const PROG = {
  intro: [Dm, Dm], A: [Dm9, Bb, Fadd, Csus, Dm9, Bb, Fadd, Am], B: [Gm, Bb, Fadd, C, Gm, Bb, Am, Am], A2: [Dm9, Bb, Fadd, Csus, Dm9, Bb, Gm, Am],
  build: [Gm, Bb, Gm, Am], drop: [Dm, Bb, Fadd, Gm3],
};
// degrees of D natural minor, oct 5 (0 D5, 2 F5, 4 A5, 5 Bb5, 6 C6, 7 D6)
const MA = [
  [[0, 2, 4], [2, 1, 2], [3, 1, 3]], [[0, 2, 5], [2, 2, 3]], [[0, 1.5, 4], [1.5, .5, 2], [2, 2, 0]], [[0, 2, 1], [2, 2, 4]],
  [[0, 2, 7], [2, 1, 6], [3, 1, 4]], [[0, 1, 5], [1, 1, 4], [2, 2, 3]], [[0, 1.5, 4], [1.5, .5, 5], [2, 2, 7]], [[0, 1, 6], [1, 1, 5], [2, 2, 4]],
];
const MB = [
  [[0, 1, 7], [1, 1, 6], [2, 2, 4]], [[0, 1, 5], [1, 1, 7], [2, 2, 9]], [[0, 1.5, 7], [1.5, .5, 6], [2, 2, 4]], [[0, 1, 6], [1, 1, 4], [2, 2, 2]],
  [[0, 1, 7], [1, 1, 9], [2, 2, 11]], [[0, 1, 9], [1, 1, 7], [2, 1, 5], [3, 1, 7]], [[0, 1, 6], [1, 1, 8], [2, 2, 10]], [[0, 4, 9]],
];
const MD = [[[0, 1, 7], [1, 1, 9], [2, 2, 11]], [[0, 1, 9], [1, 1, 7], [2, 2, 5]], [[0, 1, 9], [1, 1, 11], [2, 2, 14]], [[0, 1, 11], [1, 1, 9], [2, 2, 7]]];

export function compose() {
  const S = new Song({ id: 'frost', bpm: 126, key: 'D', seed: 47, sections: [['intro', 2], ['A', 8], ['B', 8], ['A2', 8], ['build', 4], ['drop', 4]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 100, reverb: 75, tight: true });
  const sub = S.part({ name: 'sub', program: 38, stem: 'base', vol: 100, pan: 64, reverb: 5, tight: true });
  const strings = S.part({ name: 'strings', program: 49, stem: 'base', vol: 84, pan: 56, reverb: 85 });
  const cel = S.part({ name: 'celesta', program: 8, stem: 'lead', vol: 100, pan: 68, reverb: 90 });
  const glock = S.part({ name: 'glockenspiel', program: 9, stem: 'lead', vol: 80, pan: 82, reverb: 95 });
  const choirL = S.part({ name: 'choir', program: 52, stem: 'lead', vol: 70, pan: 50, reverb: 100 });
  const ost = S.part({ name: 'ostinato', program: 45, stem: 'drive', vol: 90, pan: 44, reverb: 50, tight: true });
  const harp = S.part({ name: 'harp', program: 46, stem: 'drive', vol: 84, pan: 80, reverb: 80 });
  const horn = S.part({ name: 'horns', program: 60, stem: 'final', vol: 92, pan: 62, reverb: 70 });
  const choir = S.part({ name: 'oohs', program: 53, stem: 'final', vol: 78, pan: 66, reverb: 100 });
  const timp = S.part({ name: 'timpani', program: 47, stem: 'final', vol: 100, pan: 64, reverb: 80 });
  const trem = S.part({ name: 'tremolo', program: 44, stem: 'final', vol: 74, pan: 60, reverb: 85 });

  const mn = (d) => deg(K, 'minor', d, 5);
  let prevS = null;
  for (const f of flatBars(S, PROG)) {
    const { s, lb, b0, c, next } = f, name = s.name, intro = name === 'intro', build = name === 'build', drop = name === 'drop', hot = name === 'B' || drop;
    const e = intro ? 0.7 : name === 'A' ? 0.82 : name === 'A2' ? 0.92 : build ? 0.97 : 1.06;
    const groove = intro ? { [D.hat]: lb ? 'x.x.x.x.x.x.x.x.' : '................', [D.tomLo]: lb ? 'X.......X.......' : 'X...............' }
      : build ? { [D.kick]: 'X...X...X...X...', [D.clap]: lb < 2 ? '....X.......X...' : 'x.x.x.x.x.x.x.x.', [D.hat]: 'xxxxxxxxxxxxxxxx' }
        : name === 'A' || name === 'A2' ? { [D.kick]: 'X.......X.....x.', [D.snare]: '........X.......', [D.rim]: '....x.......x...', [D.hat]: 'x.x.x.x.x.x.x.xx', [D.tomLo]: 'X...............' }
          : { [D.kick]: 'X...X...X...X...', [D.clap]: '....X.......X...', [D.hat]: 'xhxhxhxhxhxhxhxh', [D.hatOpen]: '..o...o...o...o.', [D.tomLo]: drop ? 'X.......X.......' : '................' };
    drumBars(drums, f, groove, { build, intro });
    if (lb === 0 && !intro) drums.n(b0, 3, D.crash, 100);
    // sub bass pulse
    const r = nearest(c.root, 31);
    if (!intro || lb === 1) for (let k = 0; k < 8; k++) sub.n(b0 + k * 0.5, 0.4, r + (k === 7 && f.phraseEnd ? 2 : 0), (k % 2 ? 76 : 100) * e);
    prevS = padBar(strings, b0, c, prevS, { lo: 50, hi: 72, n: 4, vel: 64 * e, len: 3.97 });
    // lead
    const mel = name === 'A' ? MA[lb] : name === 'A2' ? (lb < 4 ? MA[lb + 4] : MA[lb - 4]) : name === 'B' ? MB[lb] : drop ? MD[lb] : null;
    if (mel) {
      melBar(cel, b0, mel, mn, hot ? 98 : 88, { legato: 0.95 });
      melBar(glock, b0, mel, mn, 70, { shift: 12, legato: 0.6 });
      if (hot) melBar(choirL, b0, mel, mn, 70, { shift: -12, legato: 1.0 });
    }
    if (intro) cel.chord(b0, 3.9, [mn(0), mn(4), mn(7)], 78, 0.15);
    if (build) for (let k = 0; k < 8; k++) cel.n(b0 + k * 0.5, 0.45, mn(2 + lb * 2 + k), 66 + lb * 10 + k * 3);
    // drive: staccato string ostinato (16ths on chord tones) + harp arps
    if (!intro) {
      arpBar(ost, b0, c, [0, 0, 2, 0, 1, 0, 2, 1], { lo: 57, step: 0.25, dur: 0.16, vel: 74 * e, accent: 14 });
      arpBar(harp, b0, c, [0, 1, 2, 3, 4, 3, 2, 1], { lo: 62, step: 0.5, dur: 1.2, vel: 66 * e, accent: 10 });
    }
    // final: horns, oohs, timpani, tremolo strings
    if (hot || build) {
      const hv = voiceLead(null, c, 53, 69, 3);
      horn.chord(b0, 3.9, hv, 90, 0.02);
      choir.chord(b0, 3.95, voiceLead(null, c, 57, 76, 3), 70, 0.03);
      trem.chord(b0, 3.95, voiceLead(null, c, 64, 84, 3), 60, 0.02);
      timp.n(b0, 0.8, nearest(c.root, 43), 104); timp.n(b0 + 2, 0.5, nearest(c.root, 43), 88);
    }
    if (build) for (let k = 0; k < 4 * (lb + 1); k++) timp.n(b0 + k / (lb + 1), 0.2, nearest(c.root, 48), 60 + lb * 16 + k);
  }
  return S.finish();
}

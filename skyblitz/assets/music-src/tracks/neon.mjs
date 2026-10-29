// "Midnight Overdrive" - NEON course. Night-drive synthwave, 120 bpm, A minor. Original composition for SKYBLITZ.
// Form: intro(2) | A(8) | B(8) | A2(8) | build(4) | drop(4)   (loop = 32 bars = 64 s)
// Stems: base = gated drums + pumping synth bass + warm pad | lead = square-wave melody | drive = 16th arpeggios + bell sparkle
//        final = synth brass stabs + octave saw lead + sweep pad.
import { Song, PC, chord, deg, voiceLead, nearest, D } from '../theory.mjs';
import { flatBars, drumBars, melBar, padBar, arpBar } from './common.mjs';

export const options = { name: 'Midnight Overdrive', wet: 0.4, tail: 5, lufs: -17, roles: { base: 'always', lead: 'race', drive: 'speed', final: 'finalLap' } };
const K = PC.A;
const Am = chord('A', 'min'), F = chord('F', 'maj7'), C = chord('C', 'maj'), G = chord('G', 'maj'), Em = chord('E', 'min'), Dm = chord('D', 'min');
const PROG = {
  intro: [Am, Am], A: [Am, F, C, G, Am, F, C, G], B: [F, G, Am, Em, F, G, Am, Am], A2: [Am, F, C, G, Am, F, Dm, Em],
  build: [F, G, F, G], drop: [Am, F, C, G],
};
// melody in degrees of A natural minor (0 = A4: 2 C5, 4 E5, 5 F5, 6 G5, 7 A5, 9 C6)
const MA = [
  [[0, 1.5, 4], [1.5, .5, 2], [2, 2, 0]], [[0, 1.5, 5], [1.5, .5, 4], [2, 2, 2]], [[0, 1, 4], [1, 1, 6], [2, 2, 4]], [[0, 1.5, 6], [1.5, .5, 4], [2, 1, 3], [3, 1, 1]],
  [[0, 1, 7], [1, .5, 6], [1.5, .5, 4], [2, 2, 2]], [[0, 1, 5], [1, 1, 7], [2, 2, 9]], [[0, .5, 9], [.5, .5, 8], [1, 1, 6], [2, 2, 4]], [[0, 2, 8], [2, 2, 6]],
];
const MB = [
  [[0, 1, 9], [1, .5, 7], [1.5, .5, 9], [2, 2, 11]], [[0, 1, 8], [1, 1, 6], [2, 1, 8], [3, 1, 10]], [[0, 1.5, 9], [1.5, .5, 7], [2, 2, 4]], [[0, 1, 6], [1, 1, 4], [2, 2, 2]],
  [[0, 1, 9], [1, .5, 7], [1.5, .5, 9], [2, 2, 12]], [[0, 1, 11], [1, 1, 8], [2, 1, 6], [3, 1, 8]], [[0, 2, 7], [2, 1, 9], [3, 1, 7]], [[0, 4, 9]],
];
const MD = [[[0, 1, 7], [1, 1, 9], [2, 2, 11]], [[0, 1, 9], [1, 1, 7], [2, 2, 5]], [[0, 1, 7], [1, 1, 4], [2, 2, 7]], [[0, 1, 8], [1, 1, 6], [2, 1, 4], [3, 1, 6]]];

export function compose() {
  const S = new Song({ id: 'neon', bpm: 120, key: 'A', seed: 31, sections: [['intro', 2], ['A', 8], ['B', 8], ['A2', 8], ['build', 4], ['drop', 4]] });
  const drums = S.part({ name: 'drums', drums: true, stem: 'base', vol: 108, reverb: 70, tight: true });
  const bass = S.part({ name: 'bass', program: 38, stem: 'base', vol: 104, pan: 64, reverb: 6, tight: true });
  const pad = S.part({ name: 'pad', program: 89, stem: 'base', vol: 78, pan: 64, reverb: 80 });
  const lead = S.part({ name: 'lead', program: 80, stem: 'lead', vol: 92, pan: 70, reverb: 70 });
  const arp = S.part({ name: 'arp', program: 90, stem: 'drive', vol: 82, pan: 40, reverb: 55, tight: true });
  const bell = S.part({ name: 'bell', program: 98, stem: 'drive', vol: 70, pan: 90, reverb: 90 });
  const brass = S.part({ name: 'synth brass', program: 62, stem: 'final', vol: 88, pan: 60, reverb: 50 });
  const saw = S.part({ name: 'octave lead', program: 81, stem: 'final', vol: 80, pan: 58, reverb: 65 });
  const sweep = S.part({ name: 'sweep', program: 95, stem: 'final', vol: 74, pan: 64, reverb: 90 });

  const mn = (d) => deg(K, 'minor', d, 4);
  let prevPad = null, prevArp = null;
  for (const f of flatBars(S, PROG)) {
    const { s, lb, b0, c, next } = f, name = s.name, intro = name === 'intro', build = name === 'build', drop = name === 'drop', hot = name === 'B' || drop;
    const e = intro ? 0.7 : name === 'A' ? 0.84 : name === 'A2' ? 0.92 : build ? 0.96 : 1.05;
    // ---- drums: four on the floor, gated clap, 16th hats
    const groove = intro ? { [D.hat]: lb ? 'x.x.x.x.x.x.x.x.' : '................', [D.kick]: lb ? 'X...X...X...X...' : '................' }
      : build ? { [D.kick]: 'X...X...X...X...', [D.clap]: lb < 2 ? '....X.......X...' : 'x.x.x.x.x.x.x.x.', [D.hat]: 'x.x.x.x.x.x.x.x.' }
        : { [D.kick]: 'X...X...X...X...', [D.clap]: '....X.......X...', [D.snare]: '....x.......x...', [D.hat]: hot ? 'xhxhxhxhxhxhxhxh' : 'x.x.x.x.x.x.x.x.', [D.hatOpen]: '..o...o...o...o.', [D.tamb]: hot ? '....o.......o...' : '................' };
    drumBars(drums, f, groove, { build, intro });
    if (lb === 0 && !intro) drums.n(b0, 3, D.crash, 108);
    // ---- bass: rolling 8ths, octave pump
    const r = nearest(c.root, 33), nr = nearest(next.root, 33);
    if (!intro || lb === 1) for (let k = 0; k < 8; k++) bass.n(b0 + k * 0.5, 0.46, r + (k % 4 === 3 && hot ? 12 : 0), (k % 2 ? 84 : 104) * e);
    if (f.phraseEnd && !intro) bass.n(b0 + 3.5, 0.45, nr + (nr > r ? -2 : 2), 92);
    // ---- pad
    prevPad = padBar(pad, b0, c, prevPad, { lo: 52, hi: 72, n: 4, vel: 62 * e });
    // ---- lead
    const mel = name === 'A' ? MA[lb] : name === 'A2' ? (lb < 4 ? MA[lb + 4] : MA[lb - 4]) : name === 'B' ? MB[lb] : drop ? MD[lb] : null;
    if (mel) { melBar(lead, b0, mel, mn, hot ? 100 : 90, { legato: 1.0 }); if (hot) melBar(saw, b0, mel, mn, 78, { shift: 12, legato: 0.9 }); }
    if (intro && lb === 1) melBar(lead, b0, [[0, 1, 4], [1, 1, 6], [2, 2, 7]], mn, 84);
    if (build) for (let k = 0; k < 8; k++) lead.n(b0 + k * 0.5, 0.45, mn(2 + lb * 2 + k), 70 + lb * 10 + k * 3);
    // ---- arps + bell sparkle (drive)
    if (!intro) {
      arpBar(arp, b0, c, [0, 1, 2, 3, 2, 1, 4, 2], { lo: 57, step: 0.25, vel: 70 * e, accent: 12 });
      if (hot || name === 'A2') for (const t of [0.5, 1.5, 2.5, 3.5]) bell.n(b0 + t, 0.4, nearest((c.root + c.tones[(t * 2) % 3]) % 12, 84), 56);
    }
    // ---- final: stabs + sweep
    if (hot || build) {
      const bv = voiceLead(null, c, 57, 72, 3);
      for (const t of hot ? [0, 1.5, 3] : [0, 2]) brass.chord(b0 + t, 0.35, bv, 94, 0.006);
      sweep.chord(b0, 3.95, voiceLead(null, c, 60, 79, 3), 58, 0.03);
    }
  }
  return S.finish();
}

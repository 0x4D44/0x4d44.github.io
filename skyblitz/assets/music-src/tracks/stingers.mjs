// One-shot stingers: win fanfare, lose sigh, final-lap alarm. Original, composed for SKYBLITZ. Not looped: rendered once, faded, Opus.
import fs from 'node:fs';
import path from 'node:path';
import { Song, D } from '../theory.mjs';

function win() {
  const S = new Song({ id: 'win', bpm: 132, key: 'C', seed: 3, sections: [['a', 3]] });
  const br = S.part({ name: 'brass', program: 61, stem: 'base', vol: 108, reverb: 60 });
  const tp = S.part({ name: 'trumpet', program: 56, stem: 'base', vol: 96, pan: 74, reverb: 60 });
  const st = S.part({ name: 'strings', program: 48, stem: 'base', vol: 90, pan: 56, reverb: 70 });
  const tm = S.part({ name: 'timp', program: 47, stem: 'base', vol: 108, reverb: 60 });
  const dr = S.part({ name: 'drums', drums: true, stem: 'base', vol: 100, reverb: 60 });
  const mel = [[0, .5, 67], [.5, .5, 67], [1, .5, 67], [1.5, 2.5, 72], [4, .5, 71], [4.5, .5, 72], [5, 1, 74], [6, 6, 76]];
  for (const [t, d, p] of mel) { br.n(t, d * 0.95, p, 104); tp.n(t, d * 0.95, p + 12, 90); br.n(t, d * 0.95, p - 5, 80); }
  for (const p of [60, 64, 67, 72]) st.n(0, 11.8, p, 78);
  for (const p of [64, 67, 72, 76]) st.n(4, 8, p, 74);
  tm.n(0, 1, 36, 108); tm.n(1.5, 1, 36, 100); tm.n(6, 4, 36, 110);
  for (let k = 0; k < 6; k++) dr.n(2.5 + k * 0.25, 0.1, D.snare, 70 + k * 8);
  dr.n(6, 3, D.crash, 118); dr.n(0, 2, D.crash, 90); dr.n(6, 0.2, D.kick, 112);
  S.sections[0].bars = 3;
  return S.finish();
}
function lose() {
  const S = new Song({ id: 'lose', bpm: 92, key: 'A', seed: 4, sections: [['a', 3]] });
  const st = S.part({ name: 'strings', program: 49, stem: 'base', vol: 100, pan: 56, reverb: 80 });
  const pn = S.part({ name: 'piano', program: 0, stem: 'base', vol: 94, pan: 60, reverb: 70 });
  const ce = S.part({ name: 'cello', program: 42, stem: 'base', vol: 100, pan: 70, reverb: 65 });
  const mel = [[0, 1, 76], [1, .5, 74], [1.5, 1, 72], [2.5, .5, 71], [3, 2.5, 69], [5.5, 3, 57]];
  for (const [t, d, p] of mel) { pn.n(t, d, p, 80); ce.n(t, d, p - 12, 84); }
  for (const p of [57, 60, 64]) st.n(0, 3, p, 70);
  for (const p of [53, 57, 60]) st.n(3, 2.5, p, 66);
  for (const p of [45, 52, 57, 60]) st.n(5.5, 3, p, 62);
  S.sections[0].bars = 4;
  return S.finish();
}
function finalLap() {
  const S = new Song({ id: 'finalLap', bpm: 150, key: 'E', seed: 6, sections: [['a', 2]] });
  const br = S.part({ name: 'brass', program: 62, stem: 'base', vol: 108, reverb: 45 });
  const sy = S.part({ name: 'riser', program: 81, stem: 'base', vol: 84, pan: 70, reverb: 60 });
  const tm = S.part({ name: 'timp', program: 47, stem: 'base', vol: 108, reverb: 50 });
  const dr = S.part({ name: 'drums', drums: true, stem: 'base', vol: 104, reverb: 55 });
  for (let k = 0; k < 16; k++) dr.n(k * 0.25, 0.1, D.snare, 56 + k * 4);
  for (let k = 0; k < 16; k++) sy.n(k * 0.25, 0.22, 52 + (k % 4) * 3 + Math.floor(k / 4) * 3 + 12, 66 + k * 2);
  for (const p of [64, 67, 71]) br.n(4, 0.7, p, 108);
  for (const p of [64, 68, 71, 76]) br.n(5, 0.7, p, 112);
  for (const p of [64, 71, 76, 83]) br.n(6, 1.9, p, 118);
  tm.n(0, 0.4, 40, 90); tm.n(2, 0.4, 40, 100); tm.n(4, 0.4, 40, 110); tm.n(5, 0.4, 40, 110); tm.n(6, 1.5, 40, 118);
  dr.n(6, 2, D.crash, 120); dr.n(6, 0.2, D.kick, 118);
  S.sections[0].bars = 2;
  return S.finish();
}

export async function buildStingers({ SCRATCH, OUT, FERRO, FFMPEG, RATE, run, writeSong, HERE }) {
  const dir = path.join(SCRATCH, 'stingers'); fs.mkdirSync(dir, { recursive: true });
  const outDir = path.join(OUT, 'stingers'); fs.mkdirSync(outDir, { recursive: true });
  const midDir = path.join(HERE, 'midi'); fs.mkdirSync(midDir, { recursive: true });
  const info = {};
  for (const [id, fn, tail] of [['win', win, 2.2], ['lose', lose, 2.4], ['finalLap', finalLap, 1.6]]) {
    const song = fn(); const endBeat = Math.ceil(song.parts.flatMap((p) => p.notes).reduce((m, n) => Math.max(m, n.t + n.d), 0) * 2) / 2 + 0.5; song.totalBars = endBeat / 4;
    const mid = path.join(midDir, `sting_${id}.mid`);
    writeSong(song, mid);
    const wav = path.join(dir, `${id}.wav`), ogg = path.join(outDir, `${id}.ogg`);
    await run(FERRO, [mid, '-o', wav, '--rate', String(RATE), '--tail', String(tail), '--wet', '0.3', '--lufs', '-15', '--tp-ceiling', '-1.5', '-q'], `sting ${id}`);
    const dur = (song.totalBars * 4 * 60) / song.bpm + tail;  // render = last note-off (parked on the final tick) + tail
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', `afade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5`, '-c:a', 'libopus', '-b:a', '64k', ogg], `enc ${id}`);
    info[id] = { bytes: fs.statSync(ogg).size, sec: Number(dur.toFixed(2)) };
  }
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(info, null, 1));
  console.log('[stingers]', JSON.stringify(info));
}

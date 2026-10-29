// SKYBLITZ music build: composer module -> SMF -> ferrosintesis (full mix + one solo render per stem) -> post.py
// (stem balance fit, loop-tail fold, loudness) -> ffmpeg Ogg Opus -> assets/music/<id>/{stems,meta.json}.
//   node build.mjs <track|all> [--no-render]      (tracks: menu sunrise redrock neon frost results stingers)
// Env: SKY_SCRATCH (default: the agent scratchpad), FERRO (synth exe), FFMPEG.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeSMF } from './midi.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'music');
const SCRATCH = process.env.SKY_SCRATCH || 'H:/temp/skya/audio';
const FERRO = process.env.FERRO || 'H:/temp/skya/tools/bin/ferrosintesis.exe';
const FFMPEG = process.env.FFMPEG || 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
const RATE = 48000;

function run(cmd, args, label) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; }); p.stdout.on('data', () => {});
    p.on('close', (code) => (code === 0 ? res(err) : rej(new Error(`${label || cmd} exited ${code}\n${err.slice(-600)}`))));
  });
}

/** Assign MIDI channels (drums -> 9) and write the song's SMF. Returns {mid, stems:{name:[ch..]}, channels} */
function writeSong(song, midPath) {
  let next = 0; const stems = {};
  const channels = song.parts.map((p) => {
    if (p.drums) p.ch = 9; else { if (next === 9) next++; p.ch = next++; }
    if (p.ch > 15) throw new Error('too many parts (max 15 melodic + drums)');
    (stems[p.stem] ||= []).push(p.ch);
    return { ch: p.ch, program: p.program, name: p.name || `p${p.ch}`, vol: p.vol, pan: p.pan, reverb: p.reverb, notes: p.notes, cc: p.cc };
  });
  fs.writeFileSync(midPath, writeSMF({ bpm: song.bpm, lengthBeats: song.lengthBeats, channels }));
  return { stems, channels };
}

async function buildLooped(id, song, opts) {
  const dir = path.join(SCRATCH, id); fs.mkdirSync(dir, { recursive: true });
  const midDir = path.join(HERE, 'midi'); fs.mkdirSync(midDir, { recursive: true });
  const midPath = path.join(midDir, `${id}.mid`);
  const { stems } = writeSong(song, midPath);
  const tail = opts.tail ?? 5, wet = opts.wet ?? 0.3;
  const base = ['--rate', String(RATE), '--tail', String(tail), '--wet', String(wet), '--peak-normalize'];
  // --peak-normalize is a pure linear gain and the CLI prints the RAW peak, so raw_i = out_i * rawPeak_i / 0.891 (exact stem balance)
  const peaks = {}; const grab = (k) => (e) => { const m = /peak ([\d.]+)/.exec(e); peaks[k] = m ? Number(m[1]) : NaN; };
  if (!opts.skipRender) {
    const jobs = [run(FERRO, [midPath, '-o', path.join(dir, 'full.wav'), ...base], `${id} full`).then(grab('full'))];
    for (const [name, chs] of Object.entries(stems)) jobs.push(run(FERRO, [midPath, '-o', path.join(dir, `stem_${name}.wav`), '--solo', chs.join(','), ...base], `${id} ${name}`).then(grab(name)));
    await Promise.all(jobs);
    fs.writeFileSync(path.join(dir, 'peaks.json'), JSON.stringify(peaks));
  }
  const cfg = { peaks: JSON.parse(fs.readFileSync(path.join(dir, 'peaks.json'), 'utf8')), id, dir, out: path.join(OUT, id), ffmpeg: FFMPEG, rate: RATE, bpm: song.bpm, introBars: song.introBars, loopBars: song.loopBars, tail,
    stems: Object.keys(stems), bitrate: opts.bitrate || {}, targetLufs: opts.lufs ?? -17, peakCeil: opts.peak ?? -1.5 };
  fs.writeFileSync(path.join(dir, 'cfg.json'), JSON.stringify(cfg));
  const out = await run('python', [path.join(HERE, 'post.py'), path.join(dir, 'cfg.json')], `${id} post`);
  // meta
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'post.json'), 'utf8'));
  meta.name = opts.name || id; meta.key = song.key; meta.bpm = song.bpm; meta.bars = { intro: song.introBars, loop: song.loopBars };
  meta.sections = song.sections.map((s) => ({ name: s.name, bar: s.start, bars: s.bars }));
  meta.roles = opts.roles || {};
  fs.writeFileSync(path.join(OUT, id, 'meta.json'), JSON.stringify(meta, null, 1));
  return { out, meta };
}

async function main() {
  const [target = 'all', ...flags] = process.argv.slice(2);
  const ids = target === 'all' ? ['menu', 'sunrise', 'redrock', 'neon', 'frost', 'results', 'stingers'] : [target];
  for (const id of ids) {
    const t0 = Date.now();
    const mod = await import(pathToFileURL(path.join(HERE, 'tracks', `${id}.mjs`)).href);
    if (id === 'stingers') { await mod.buildStingers({ SCRATCH, OUT, FERRO, FFMPEG, RATE, run, writeSong, HERE }); }
    else {
      const song = mod.compose();
      const r = await buildLooped(id, song, { ...mod.options, skipRender: flags.includes('--no-render') });
      console.log(`[${id}] ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(r.meta.stats || {}));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
export { writeSong, run, RATE };

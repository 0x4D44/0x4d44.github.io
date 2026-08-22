import { existsSync, mkdirSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/content.js';

const outputRoot = fileURLToPath(new URL('../public/audio/pacenotes/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'cairn-run-audio-'));
const filter = 'highpass=f=110,lowpass=f=6500,acompressor=threshold=-22dB:ratio=3:attack=5:release=80,volume=2.0';

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status}`);
}

function noteToken(note) {
  if (typeof note.id === 'string' && /^[a-z0-9-]+$/i.test(note.id)) return note.id;
  if (Number.isFinite(note.id)) return String(Math.max(0, Math.round(note.id))).padStart(2, '0');
  throw new Error(`Pace note at ${note.atM}m has no safe asset id.`);
}

function speak(path, phrase) {
  if (process.platform === 'darwin') {
    run('say', ['-v', 'Daniel', '-r', '215', '-o', path, phrase], `say failed for “${phrase}”`);
    return;
  }
  run('espeak', ['-v', 'en-gb', '-s', '205', '-p', '42', '-a', '150', '-w', path, phrase], `espeak failed for “${phrase}”`);
}

let generated = 0;
try {
  mkdirSync(outputRoot, { recursive: true });
  for (const stage of CATALOG.stages) {
    const stageRoot = join(outputRoot, stage.id);
    mkdirSync(stageRoot, { recursive: true });
    for (const note of stage.notes) {
      const token = noteToken(note);
      const source = join(scratch, `${stage.id}-${token}.${process.platform === 'darwin' ? 'aiff' : 'wav'}`);
      const ogg = join(stageRoot, `note-${token}.ogg`);
      const mp3 = join(stageRoot, `note-${token}.mp3`);
      try {
        speak(source, note.phrase);
        run('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-af', filter, '-ac', '2', '-strict', '-2', '-c:a', 'vorbis', '-q:a', '3', ogg], `Ogg encode failed for ${stage.id}/${token}`);
        run('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-af', filter, '-c:a', 'libmp3lame', '-q:a', '5', mp3], `MP3 encode failed for ${stage.id}/${token}`);
      } finally {
        if (existsSync(source)) rmSync(source);
      }
      generated += 1;
    }
  }
} finally {
  if (existsSync(scratch)) rmdirSync(scratch);
}

console.log(`Generated ${generated} stage-qualified pace-note clips in MP3 and Ogg formats.`);

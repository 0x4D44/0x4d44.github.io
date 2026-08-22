import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { STAGE_NOTES } from '../src/stage.js';
const out = new URL('../public/audio/pacenotes/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const note of STAGE_NOTES) {
  const id=String(note.id).padStart(2,'0');
  const wav=new URL(`note-${id}.wav`,out), ogg=new URL(`note-${id}.ogg`,out), mp3=new URL(`note-${id}.mp3`,out);
  const voice=spawnSync('espeak',['-v','en-gb','-s','205','-p','42','-a','150','-w',wav.pathname,note.phrase],{stdio:'inherit'});
  if(voice.status!==0)throw new Error(`espeak failed for ${note.phrase}`);
  const filter='highpass=f=110,lowpass=f=6500,acompressor=threshold=-22dB:ratio=3:attack=5:release=80,volume=2.0';
  const encodeOgg=spawnSync('ffmpeg',['-loglevel','error','-y','-i',wav.pathname,'-af',filter,'-c:a','libvorbis','-q:a','3',ogg.pathname],{stdio:'inherit'});
  const encodeMp3=spawnSync('ffmpeg',['-loglevel','error','-y','-i',wav.pathname,'-af',filter,'-c:a','libmp3lame','-q:a','5',mp3.pathname],{stdio:'inherit'});
  rmSync(wav,{force:true});
  if(encodeOgg.status!==0||encodeMp3.status!==0)throw new Error(`ffmpeg failed for ${note.phrase}`);
}
console.log(`Generated ${STAGE_NOTES.length} local pace-note clips in MP3 and Ogg formats.`);

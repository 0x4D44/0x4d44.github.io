import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioManager,
  deriveEngineCharacter,
  deriveStageSoundscape,
  paceNoteSources,
  readAudioTelemetry
} from '../src/audio.js';

const cairn = {
  id: 'cairn-r4',
  drive: 'awd',
  massKg: 1180,
  powerBhp: 310,
  torqueCurve: [[1500, 250], [3500, 390], [6500, 330], [7600, 260]],
  gearRatios: [3.25, 2.14, 1.48, 1.12, 0.89, 0.72],
  finalDrive: 4.1
};

const lumen = {
  id: 'lumen-f2',
  drive: 'fwd',
  massKg: 925,
  powerBhp: 152,
  torqueCurve: [[1800, 122], [3200, 156], [5200, 149], [6800, 116]],
  gearRatios: [3.54, 2.12, 1.46, 1.11, 0.89],
  finalDrive: 4.35
};

const stage = { id: 'aurora-forest', notes: [] };

test('car data derives materially different engine and transmission layers', () => {
  const cairnSound = deriveEngineCharacter(cairn);
  const lumenSound = deriveEngineCharacter(lumen);
  assert.notDeepEqual(lumenSound, cairnSound);
  assert.notEqual(lumenSound.bodyHz, cairnSound.bodyHz);
  assert.notEqual(lumenSound.transmissionRatio, cairnSound.transmissionRatio);
});

test('stage-qualified pace sources do not collapse distinct stages onto numeric ids', () => {
  const sources = paceNoteSources(stage, { id: 3 });
  assert.ok(sources[0].includes('aurora-forest'));
  assert.ok(sources.every(source => source.startsWith('./public/audio/')));
});

test('audio telemetry uses real load, rpm, gear and shift state', () => {
  const telemetry = readAudioTelemetry({ rpm: 5400, gear: 4, shiftPulse: 0.8, speed: 30 }, { throttle: 0.65, brake: 0.1 }, lumen);
  assert.equal(telemetry.rpm, 5400);
  assert.equal(telemetry.gear, 4);
  assert.ok(telemetry.load > 0.5);
  assert.ok(telemetry.shift > 0.7);
});

test('pace queue drops stale calls after a stage switch and can interrupt safely', () => {
  const audio = new AudioManager();
  audio.setStage(stage);
  assert.equal(audio.queuePace({ id: 1, at: 100 }), true);
  audio.setPaceProgress(140);
  assert.equal(audio.queuePace({ id: 2, at: 90 }), false);
  audio.interruptPace({ id: 3, at: 160 });
  assert.equal(audio.paceState().current.at, 160);
  audio.setStage({ id: 'kestrel-ridge', notes: [] });
  assert.equal(audio.paceState().current, null);
  assert.equal(audio.paceState().queue.length, 0);
});

test('stage soundscape is derived from authored route data', () => {
  const soundscape = deriveStageSoundscape({
    id: 'aurora-forest',
    segments: [
      { lengthM: 100, surface: 'compact', widthM: 7.8, riseM: 20 },
      { lengthM: 200, surface: 'loose', widthM: 6.4, riseM: -8 }
    ]
  });
  assert.equal(soundscape.stageId, 'aurora-forest');
  assert.ok(soundscape.roadLevel > 0);
  assert.ok(soundscape.windLevel > 0);
});

test('a pace call queued before audio startup resumes instead of wedging current', () => {
  const audio = new AudioManager();
  audio.setStage(stage);
  audio.queuePace({ id: 4, at: 200 });
  assert.equal(audio.paceState().current.at, 200);
  let starts = 0;
  audio.started = true;
  audio._startPaceItem = () => { starts += 1; };
  audio._resumePaceQueue();
  assert.equal(starts, 1);
});

test('audio voice instrumentation counts fixed, transient, and pace sources without drift', () => {
  const audio=new AudioManager();
  assert.equal(audio.voiceCount(),0);
  audio.started=true;
  for(const key of ['engine1','engine2','engine3','transmission1','transmission2','gravel','wind','intake','exhaust'])audio[key]={};
  audio._activeOneShots.add({});audio._pace.current={audio:{}};
  assert.equal(audio.voiceCount(),11);
  audio._activeOneShots.clear();audio._pace.current=null;
  assert.equal(audio.voiceCount(),9);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { AURORA_STAGE, LUMEN_F2 } from '../src/content.js';
import { RallyCar } from '../src/vehicle.js';
import { StageRun } from '../src/race.js';
import { autopilotControls } from '../src/input.js';
import { buildStage, nearestStagePoint, requiredFeatureCoverage, roadEdgePoint, sampleStage } from '../src/stage.js';

const stage = buildStage();
const aurora = buildStage(AURORA_STAGE);
test('authored stage meets distance and feature benchmark', () => {
  assert.ok(stage.length >= 5300 && stage.length <= 5500, `length=${stage.length}`);
  assert.deepEqual(requiredFeatureCoverage(stage), {
    straight:true, fastBend:true, mediumBend:true, hairpin:true,
    crest:true, dip:true, brakingZone:true, looseSurface:true
  });
  assert.equal(stage.splits.length, 3);
  assert.ok(stage.hazards.length >= 80);
  assert.ok(stage.barriers.length >= 60);
  for(const type of ['wall','barrier','bridge-rail'])assert.ok(stage.barriers.some(item=>item.type===type));
});

test('route is continuous, bounded, and free of implausible sample jumps', () => {
  for (let i=1;i<stage.samples.length;i++) {
    const a=stage.samples[i-1], b=stage.samples[i];
    const planar=Math.hypot(b.x-a.x,b.z-a.z);
    assert.ok(planar > 3.5 && planar < 4.2, `sample ${i} spacing=${planar}`);
    assert.ok(Math.abs(b.y-a.y)<1.5, `sample ${i} vertical discontinuity`);
  }
  const end=sampleStage(stage,stage.length);
  assert.ok(Number.isFinite(end.x+end.y+end.z+end.heading));
});

test('pace notes are authored, ordered, actionable, and not speech spam', () => {
  assert.ok(stage.notes.length >= 14 && stage.notes.length <= 22);
  for (let i=0;i<stage.notes.length;i++) {
    const note=stage.notes[i];
    assert.ok(note.at>0 && note.at<=stage.length);
    assert.ok(note.phrase.length>=8);
    if(i) assert.ok(note.at-stage.notes[i-1].at>=120, `notes ${i-1}/${i} too dense`);
  }
  assert.ok(stage.notes.some(n=>/HAIRPIN/.test(n.main)));
  assert.ok(stage.notes.some(n=>/CREST/.test(n.main+n.detail)));
  assert.ok(stage.notes.some(n=>/TIGHTENS/.test(n.main+n.detail)));
});


test('continuous sampling reaches the exact endpoint and projects between samples', () => {
  const end=stage.samples.at(-1), sampled=sampleStage(stage,stage.length);
  for(const key of ['x','y','z','s']) assert.ok(Math.abs(sampled[key]-end[key])<1e-9,`${key}: ${sampled[key]} != ${end[key]}`);
  const target=sampleStage(stage,1234.567), point=roadEdgePoint(target,1.37,0), nearest=nearestStagePoint(stage,point.x,point.z,target.index,8);
  assert.ok(Math.abs(nearest.s-target.s)<.08,`projection drift=${nearest.s-target.s}`);
  assert.ok(Math.abs(nearest.lateral-1.37)<.04,`lateral=${nearest.lateral}`);
});

test('Aurora is deterministic authored fast gravel with its own feature fingerprint', () => {
  const second = buildStage(AURORA_STAGE);
  assert.deepEqual(aurora, second);
  assert.ok(aurora.length >= 4500 && aurora.length <= 7500, `length=${aurora.length}`);
  assert.ok(aurora.segments.every(segment => segment.surface === 'compact'));
  assert.ok(aurora.routeIdentity.tags.includes('lakeside'));
  assert.ok(aurora.routeIdentity.tags.includes('narrow-forest'));
  assert.ok(aurora.signatureSequences.length >= 3);
  assert.ok(aurora.segments.filter(segment => segment.feature === 'crest').length >= 2);
  assert.ok(aurora.segments.filter(segment => segment.feature === 'jump').length >= 2);
  assert.ok(aurora.difficultyArc.length >= 3);
  assert.ok(aurora.notes.length >= 14);
  for (let i = 1; i < aurora.notes.length; i++) assert.ok(aurora.notes[i].at > aurora.notes[i - 1].at);
  assert.equal(aurora.samples.at(-1).s, aurora.length);
  assert.equal(aurora.splits.at(-1), aurora.length);
  assert.ok(aurora.finishRun.startM < aurora.length);
  assert.equal(aurora.barriers.some(item => item.type === 'wall' || item.type === 'bridge-rail'), false);
  assert.notDeepEqual(aurora.hazardPlan, stage.hazardPlan);
  assert.notDeepEqual(aurora.barrierPlan, stage.barrierPlan);
});

test('Aurora endpoint is exact and its geometry differs from Kestrel', () => {
  const endpoint = sampleStage(aurora, aurora.length);
  const firstKestrel = stage.samples.slice(0, 100).map(sample => [sample.x, sample.z]);
  const firstAurora = aurora.samples.slice(0, 100).map(sample => [sample.x, sample.z]);
  assert.equal(endpoint.s, aurora.length);
  for (const key of ['x', 'y', 'z', 's']) assert.equal(endpoint[key], aurora.samples.at(-1)[key]);
  assert.notDeepEqual(firstAurora, firstKestrel);
});

test('Lumen F2 completes Aurora under the deterministic reference driver', () => {
  const car = new RallyCar(aurora, LUMEN_F2);
  const run = new StageRun(aurora);
  run.state = 'racing';
  run.countdown = 0;
  const dt = 1 / 120;
  let time = 0;
  let recoveries = 0;
  while (time < 420 && run.state !== 'finished') {
    car.step(autopilotControls(aurora, car), dt);
    run.update(car, dt);
    if (car.needsRecovery) {
      car.recover();
      recoveries += 1;
    }
    time += dt;
  }
  assert.equal(run.state, 'finished');
  assert.ok(time >= aurora.expectedDurationSeconds[0] && time <= aurora.expectedDurationSeconds[1], `time=${time}`);
  assert.equal(recoveries, 0);
  assert.ok(car.damageTotal < 0.08, `damage=${car.damageTotal}`);
  for (const value of [car.x, car.y, car.z, car.vx, car.vy, car.vz, car.yaw, car.yawRate, car.progress]) {
    assert.ok(Number.isFinite(value), `non-finite state: ${value}`);
  }
});

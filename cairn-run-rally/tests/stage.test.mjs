import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage, nearestStagePoint, requiredFeatureCoverage, roadEdgePoint, sampleStage } from '../src/stage.js';

const stage = buildStage();
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

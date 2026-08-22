import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPANSION_CARS,
  EXPANSION_REGIONS,
  EXPANSION_STAGES,
  EXPANSION_SURFACES,
  EXPANSION_WEATHER
} from '../src/content-expansion.js';
import { validateCarSpec, validateRegionSpec, validateStageSpec, validateWeatherSpec } from '../src/contracts.js';
import { buildStage, sampleStage } from '../src/stage.js';

const deepWalk = (value, visit) => {
  visit(value);
  if (value && typeof value === 'object') for (const child of Object.values(value)) deepWalk(child, visit);
};

test('expansion exports four regions, stages, weather slices, and cars', () => {
  assert.equal(EXPANSION_REGIONS.length, 4);
  assert.equal(EXPANSION_STAGES.length, 4);
  assert.equal(EXPANSION_WEATHER.length, 4);
  assert.equal(EXPANSION_CARS.length, 4);
  assert.ok(EXPANSION_SURFACES.length >= 5);
  assert.deepEqual(EXPANSION_REGIONS.map(region => region.name), [
    'Rift Valley Run',
    'Kurotake Pass',
    'Costa Brava Heights',
    'Wattle Creek'
  ]);
  assert.deepEqual(EXPANSION_REGIONS.map(region => region.country), ['Kenya', 'Japan', 'Spain', 'Australia']);
});

test('every expansion spec validates and references only expansion content', () => {
  const surfaceIds = new Set(EXPANSION_SURFACES.map(surface => surface.id));
  const weatherIds = new Set(EXPANSION_WEATHER.map(weather => weather.id));
  const regionIds = new Set(EXPANSION_REGIONS.map(region => region.id));
  const stageIds = new Set(EXPANSION_STAGES.map(stage => stage.id));
  assert.equal(new Set(EXPANSION_SURFACES.map(surface => surface.id)).size, EXPANSION_SURFACES.length);
  for (const surface of EXPANSION_SURFACES) {
    for (const key of ['id', 'name', 'particle', 'audio']) assert.equal(typeof surface[key], 'string');
    for (const key of ['grip', 'friction', 'rollingResistance', 'roughness', 'sink']) assert.ok(Number.isFinite(surface[key]));
  }
  for (const weather of EXPANSION_WEATHER) assert.deepEqual(validateWeatherSpec(weather), []);
  for (const region of EXPANSION_REGIONS) {
    assert.deepEqual(validateRegionSpec(region), []);
    assert.ok(region.stageIds.every(id => stageIds.has(id)));
    assert.ok(region.weatherIds.every(id => weatherIds.has(id)));
  }
  for (const stage of EXPANSION_STAGES) {
    assert.deepEqual(validateStageSpec(stage, surfaceIds), []);
    assert.ok(regionIds.has(stage.regionId));
    assert.equal(stage.notes.length >= 18, true);
    assert.equal(stage.splits.length, 3);
    assert.equal(stage.splits.at(-1), stage.segments.reduce((sum, segment) => sum + segment.lengthM, 0));
    assert.ok(stage.notes.every(note => note.id.startsWith(`${stage.id}-note-`)));
    assert.ok(stage.notes.every(note => note.phrase.includes(',')));
    assert.ok(stage.signatureSequences.length >= 3);
    assert.ok(stage.difficultyArc.length >= 3);
    assert.ok(stage.finishRun.startM < stage.finishRun.endM);
    assert.ok(stage.finishRun.endM <= stage.splits.at(-1));
    assert.ok(stage.barrierPlan.length >= 2);
  }
  for (const car of EXPANSION_CARS) assert.deepEqual(validateCarSpec(car), []);
});

test('expansion stages build deterministically with aligned hazards and barriers', () => {
  const fingerprints = new Set();
  for (const stage of EXPANSION_STAGES) {
    const first = buildStage(stage);
    const second = buildStage(stage);
    assert.deepEqual(first, second);
    assert.ok(first.length >= 5000 && first.length <= 8000);
    assert.equal(first.splits.length, 3);
    assert.equal(first.splits.at(-1), first.length);
    assert.ok(first.hazards.length > 0);
    assert.ok(first.barriers.length > 0);
    for (const barrier of first.barriers) {
      const road = sampleStage(first, barrier.s);
      const rightX = Math.cos(road.heading);
      const rightZ = -Math.sin(road.heading);
      const lateral = (barrier.x - road.x) * rightX + (barrier.z - road.z) * rightZ;
      assert.ok(Math.abs(lateral) > road.width / 2, `${stage.id} barrier ${barrier.id} is not outside its road edge`);
    }
    fingerprints.add(JSON.stringify({
      id: stage.id,
      segments: stage.segments.map(segment => [segment.lengthM, segment.curve, segment.surface, segment.feature]),
      signatures: stage.signatureSequences,
      finish: stage.finishRun
    }));
  }
  assert.equal(fingerprints.size, EXPANSION_STAGES.length);
  const durations = EXPANSION_STAGES.map(stage => stage.expectedDurationSeconds[1] / stage.expectedDurationSeconds[0]);
  assert.ok(Math.max(...durations) / Math.min(...durations) >= 1.15);
});

test('expansion cars provide four mechanically distinct identities, including two RWD cars', () => {
  assert.ok(EXPANSION_CARS.filter(car => car.drive === 'rwd').length >= 2);
  assert.deepEqual(EXPANSION_CARS.map(car => car.silhouette), ['short-coupe', 'long-sedan', 'classic-coupe', 'widebody-special']);
  const vectors = new Set(EXPANSION_CARS.map(car => JSON.stringify({
    drive: car.drive,
    massKg: car.massKg,
    powerBhp: car.powerBhp,
    torqueCurve: car.torqueCurve,
    gearRatios: car.gearRatios,
    tyreGrip: car.tyreGrip,
    suspension: car.suspension,
    durability: car.durability,
    silhouette: car.silhouette,
    benchmarkScale: car.benchmarkScale
  })));
  assert.equal(vectors.size, EXPANSION_CARS.length);
});

test('expansion content is deeply immutable', () => {
  for (const value of [EXPANSION_SURFACES, EXPANSION_WEATHER, EXPANSION_REGIONS, EXPANSION_STAGES, EXPANSION_CARS]) {
    deepWalk(value, entry => assert.ok(Object.isFrozen(entry)));
  }
});

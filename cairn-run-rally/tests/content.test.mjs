import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AURORA_FOREST,
  AURORA_STAGE,
  AURORA_WEATHER,
  CAIRN_R4,
  CHAMPIONSHIPS,
  CARS,
  CATALOG,
  DIFFICULTIES,
  LUMEN_F2,
  KESTREL_RIDGE,
  KESTREL_STAGE,
  RIVALS,
  REGIONS,
  RIDGE_WEATHER,
  STAGES,
  SURFACES,
  WEATHER,
  WORLD_CHAMPIONSHIP,
  validateCatalog
} from '../src/content.js';
import { buildStage } from '../src/stage.js';
import { validateCarSpec, validateRegionSpec, validateStageSpec, validateWeatherSpec } from '../src/contracts.js';
import { createChampionship, validateChampionshipState } from '../src/championship.js';

test('the shipped Kestrel slice is a valid immutable catalog', () => {
  assert.deepEqual(validateCatalog(CATALOG), []);
  assert.deepEqual(validateCarSpec(CARS[0]), []);
  assert.deepEqual(validateStageSpec(KESTREL_STAGE, new Set(SURFACES.map(surface => surface.id))), []);
  assert.deepEqual(validateRegionSpec(KESTREL_RIDGE), []);
  assert.deepEqual(validateWeatherSpec(RIDGE_WEATHER), []);
  assert.equal(CARS[0].id, 'cairn-r4');
  assert.equal(KESTREL_STAGE.id, 'kestrel-ridge');
  assert.equal(KESTREL_RIDGE.stageIds[0], KESTREL_STAGE.id);
  assert.equal(KESTREL_RIDGE.weatherIds[0], RIDGE_WEATHER.id);
  assert.equal(STAGES[0], KESTREL_STAGE);
  assert.equal(REGIONS[0], KESTREL_RIDGE);
  assert.equal(WEATHER[0], RIDGE_WEATHER);
  assert.ok(Object.isFrozen(CATALOG));
  assert.ok(Object.isFrozen(KESTREL_STAGE.segments));
  assert.ok(Object.isFrozen(CARS[0].torqueCurve));
});

test('the full two-stage catalog validates and exposes distinct Aurora content', () => {
  assert.deepEqual(validateCatalog(CATALOG), []);
  assert.equal(AURORA_FOREST.country, 'Finland');
  assert.equal(AURORA_FOREST.stageIds[0], AURORA_STAGE.id);
  assert.equal(AURORA_FOREST.weatherIds[0], AURORA_WEATHER.id);
  assert.equal(LUMEN_F2.name, 'Lumen F2');
  assert.equal(LUMEN_F2.drive, 'fwd');
  assert.ok(LUMEN_F2.benchmarkScale >= 0.8 && LUMEN_F2.benchmarkScale <= 1.3);
  assert.equal(CAIRN_R4.benchmarkScale, 1);
  assert.notEqual(LUMEN_F2.massKg, CAIRN_R4.massKg);
  assert.notEqual(LUMEN_F2.wheelbaseM, CAIRN_R4.wheelbaseM);
  assert.notEqual(LUMEN_F2.yawInertiaKgM2, CAIRN_R4.yawInertiaKgM2);
  assert.notDeepEqual(LUMEN_F2.torqueCurve, CAIRN_R4.torqueCurve);
  assert.notDeepEqual(LUMEN_F2.gearRatios, CAIRN_R4.gearRatios);
  assert.notDeepEqual(LUMEN_F2.tyreGrip, CAIRN_R4.tyreGrip);
  assert.notDeepEqual(LUMEN_F2.suspension, CAIRN_R4.suspension);
  assert.notDeepEqual(LUMEN_F2.durability, CAIRN_R4.durability);
  assert.deepEqual(validateCarSpec(LUMEN_F2), []);
  assert.ok(validateCarSpec({ ...LUMEN_F2, benchmarkScale: 1.31 }).some(error => error.includes('benchmarkScale')));
  assert.ok(validateCarSpec({ ...LUMEN_F2, benchmarkScale: 0.79 }).some(error => error.includes('benchmarkScale')));
  assert.ok(validateCarSpec({ ...LUMEN_F2, benchmarkScale: undefined }).some(error => error.includes('benchmarkScale')));
  assert.deepEqual(validateStageSpec(AURORA_STAGE, new Set(SURFACES.map(surface => surface.id))), []);
  assert.deepEqual(validateRegionSpec(AURORA_FOREST), []);
  assert.deepEqual(validateWeatherSpec(AURORA_WEATHER), []);
  assert.ok(AURORA_FOREST.identityTags.includes('lakeside'));
  assert.ok(AURORA_FOREST.identityTags.includes('narrow-forest'));
  assert.ok(AURORA_STAGE.signatureSequences.length >= 3);
  assert.ok(AURORA_STAGE.segments.some(segment => segment.feature === 'jump'));
  assert.ok(AURORA_STAGE.segments.some(segment => segment.feature === 'crest'));
  assert.notDeepEqual(
    KESTREL_STAGE.segments.map(({ name, lengthM, curve, riseM, feature }) => ({ name, lengthM, curve, riseM, feature })),
    AURORA_STAGE.segments.map(({ name, lengthM, curve, riseM, feature }) => ({ name, lengthM, curve, riseM, feature }))
  );
  assert.ok(Object.isFrozen(AURORA_STAGE.segments));
  assert.ok(Object.isFrozen(LUMEN_F2.torqueCurve));
});

test('catalog validation rejects missing cross-references', () => {
  const broken = structuredClone(CATALOG);
  broken.stages[0].regionId = 'missing-region';
  broken.regions[0].weatherIds = ['missing-weather'];
  broken.stages[0].segments[0].surface = 'missing-surface';
  const errors = validateCatalog(broken);
  assert.ok(errors.some(error => error.includes('missing-region')));
  assert.ok(errors.some(error => error.includes('missing-weather')));
  assert.ok(errors.some(error => error.includes('missing-surface')));
});

test('the catalog-backed default stage remains deterministic and exact', () => {
  const first = buildStage();
  const second = buildStage();
  assert.deepEqual(first, second);
  assert.equal(first.length, 5405);
  assert.equal(first.samples.at(-1).s, 5405);
  assert.deepEqual(first.splits, [1800, 3600, 5405]);
});

test('the vertical championship resolves its stage, weather, difficulty, and rival references', () => {
  assert.equal(CHAMPIONSHIPS.length, 1);
  assert.equal(CHAMPIONSHIPS[0], WORLD_CHAMPIONSHIP);
  assert.equal(WORLD_CHAMPIONSHIP.events.length, 2);
  assert.deepEqual(WORLD_CHAMPIONSHIP.events.map(event => event.stageId), [KESTREL_STAGE.id, AURORA_STAGE.id]);
  assert.deepEqual(WORLD_CHAMPIONSHIP.events.map(event => event.weatherId), [RIDGE_WEATHER.id, AURORA_WEATHER.id]);
  assert.ok(WORLD_CHAMPIONSHIP.events.every(event => event.serviceMinutes === 60));
  assert.deepEqual(WORLD_CHAMPIONSHIP.rivalIds, RIVALS.map(rival => rival.id));
  assert.deepEqual(DIFFICULTIES.map(difficulty => difficulty.id), ['easy', 'normal', 'hard']);
  assert.ok(DIFFICULTIES.every(difficulty => Number.isFinite(difficulty.rivalPace) && difficulty.rivalPace > 0));
  assert.equal(new Set(RIVALS.map(rival => rival.id)).size, 5);
  assert.equal(new Set(RIVALS.map(rival => `${rival.skill}:${rival.consistency}:${rival.damageRisk}:${JSON.stringify(rival.surfaceBias)}:${rival.seed}`)).size, 5);
  assert.deepEqual(validateCatalog(CATALOG), []);
});

test('the shipped championship catalog is deeply frozen and can create a valid state', () => {
  const freezeTree = value => {
    assert.ok(Object.isFrozen(value));
    if (value && typeof value === 'object') for (const child of Object.values(value)) freezeTree(child);
  };
  freezeTree(DIFFICULTIES);
  freezeTree(RIVALS);
  freezeTree(CHAMPIONSHIPS);
  freezeTree(WORLD_CHAMPIONSHIP);
  freezeTree(CATALOG);

  const state = createChampionship({
    championship: WORLD_CHAMPIONSHIP,
    content: CATALOG,
    carId: CAIRN_R4.id,
    difficultyId: 'normal',
    seed: 4401
  });
  assert.equal(state.championshipId, WORLD_CHAMPIONSHIP.id);
  assert.equal(state.eventIndex, 0);
  assert.deepEqual(validateChampionshipState(state, CATALOG), []);
});

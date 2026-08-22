import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARS,
  CATALOG,
  KESTREL_RIDGE,
  KESTREL_STAGE,
  REGIONS,
  RIDGE_WEATHER,
  STAGES,
  SURFACES,
  WEATHER,
  validateCatalog
} from '../src/content.js';
import { buildStage } from '../src/stage.js';
import { validateCarSpec, validateRegionSpec, validateStageSpec, validateWeatherSpec } from '../src/contracts.js';

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

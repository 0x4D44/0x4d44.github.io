import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  validateCarSpec,
  validateChampionshipSpec,
  validateRegionSpec,
  validateRivalSpec,
  validateSaveData,
  validateStageSpec,
  validateWeatherSpec
} from '../src/contracts.js';

const validCar = {
  id: 'test-awd', name: 'Test AWD', era: 1998, drive: 'awd',
  massKg: 1230, yawInertiaKgM2: 1820, wheelbaseM: 2.52, trackM: 1.48,
  frontWeightFraction: 0.56, rideHeightM: 0.52, dragCoefficient: 0.39,
  torqueCurve: [[1200, 210], [3500, 390], [7200, 280]],
  gearRatios: [3.1, 2.05, 1.5, 1.16, 0.94, 0.78], finalDrive: 4.2,
  wheelRadiusM: 0.32, brakeForceN: 11900, brakeBiasFront: 0.64,
  steeringLockRad: 0.6, tyreGrip: { front: 1, rear: 0.96 },
  suspension: { travelM: 0.24, springHz: 1.8, dampingRatio: 0.72 },
  durability: { engine: 0.72, steering: 0.75, suspension: 0.78, brakes: 0.62, body: 0.9 },
  assists: ['automatic', 'stability', 'braking'], benchmarkScale: 1
};

const validStage = {
  id: 'test-stage', regionId: 'test-region', name: 'Test Stage',
  segments: [
    { name: 'Opening', lengthM: 120, curve: [0, 0.002], riseM: 3, widthM: 7, surface: 'compact', feature: 'crest' },
    { name: 'Finish', lengthM: 140, curve: [-0.004, 0], riseM: -2, widthM: 6.8, surface: 'loose', feature: 'finish' }
  ],
  notes: [{ atM: 100, icon: 'R5', main: 'RIGHT FIVE', detail: 'OVER CREST', phrase: 'right five, over crest' }],
  splits: [130, 260], expectedDurationSeconds: [12, 45], landmarkIds: ['test-gate']
};

test('stable content contracts accept a coherent rally slice', () => {
  assert.equal(CONTENT_SCHEMA_VERSION, 1);
  assert.deepEqual(validateCarSpec(validCar), []);
  assert.deepEqual(validateStageSpec(validStage, new Set(['compact', 'loose'])), []);
  assert.deepEqual(validateRegionSpec({
    id: 'test-region', name: 'Test Region', country: 'Testland', stageIds: ['test-stage'],
    palette: { sky: '#112233', terrain: '#334455', road: '#776655' },
    sceneryKit: ['pine', 'rock', 'gate'], weatherIds: ['clear']
  }), []);
  assert.deepEqual(validateWeatherSpec({
    id: 'clear', name: 'Clear', visibilityM: 900, gripScale: 1,
    precipitation: 'none', roadWetness: 0, wind: 0.2, timeOfDay: 'day'
  }), []);
  assert.deepEqual(validateRivalSpec({
    id: 'rival-one', name: 'A. Driver', seed: 42, skill: 0.72,
    consistency: 0.8, surfaceBias: { compact: 0.02 }, damageRisk: 0.2
  }), []);
  assert.deepEqual(validateChampionshipSpec({
    id: 'world-six', name: 'World Six', points: [10, 8, 6, 5, 4, 3],
    events: [{ id: 'event-one', stageId: 'test-stage', weatherId: 'clear', serviceMinutes: 30 }]
  }), []);
});

test('contracts reject identity labels without mechanical vehicle data', () => {
  const errors = validateCarSpec({ ...validCar, drive: 'magic', torqueCurve: [[3000, 400]], gearRatios: [] });
  assert.ok(errors.some(error => error.includes('drive')));
  assert.ok(errors.some(error => error.includes('torqueCurve')));
  assert.ok(errors.some(error => error.includes('gearRatios')));
});

test('stage contract rejects broken routes and unordered timing data', () => {
  const errors = validateStageSpec({
    ...validStage,
    segments: [{ ...validStage.segments[0], lengthM: 0, surface: 'unknown' }],
    notes: [{ ...validStage.notes[0], atM: 999 }],
    splits: [260, 120]
  }, new Set(['compact', 'loose']));
  assert.ok(errors.some(error => error.includes('lengthM')));
  assert.ok(errors.some(error => error.includes('surface')));
  assert.ok(errors.some(error => error.includes('notes')));
  assert.ok(errors.some(error => error.includes('splits')));
});

test('save contract is versioned and rejects partial or non-finite results', () => {
  const validSave = {
    version: SAVE_SCHEMA_VERSION,
    profile: { assists: { automatic: true, stability: 0.25, braking: 0, paceNotes: true }, bindings: {}, gamepadBindings: {} },
    bests: { 'test-stage:test-awd:clear': { timeSeconds: 32.4, splits: [15.2, 32.4] } },
    championship: null
  };
  assert.deepEqual(validateSaveData(validSave), []);
  assert.ok(validateSaveData({ ...validSave, version: 999 }).some(error => error.includes('version')));
  const missingGamepadMap = structuredClone(validSave);
  delete missingGamepadMap.profile.gamepadBindings;
  assert.ok(validateSaveData(missingGamepadMap).some(error => error.includes('gamepadBindings')));
  const corrupt = structuredClone(validSave);
  corrupt.bests['test-stage:test-awd:clear'].timeSeconds = Number.NaN;
  assert.ok(validateSaveData(corrupt).some(error => error.includes('timeSeconds')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMAGE_COMPONENTS,
  REPAIR_MINUTES,
  SETUP_ADJUSTMENT_MINUTES,
  SETUP_LIMITS,
  SETUP_STEP,
  TYRE_OPTIONS,
  TYRE_SERVICE_MINUTES,
  abandon,
  abortRun,
  applyService,
  autoServicePlan,
  availableActions,
  createChampionship,
  overallStandings,
  planService,
  projectedSplits,
  retire,
  rivalOutcome,
  stageStandings,
  startStage,
  submitResult,
  validateChampionshipState
} from '../src/championship.js';

const damage = (engine = 0, steering = 0, suspension = 0, brakes = 0, body = 0) => ({ engine, steering, suspension, brakes, body });

const stage = (id, offset = 0) => ({
  id,
  regionId: 'region-test',
  name: `Test ${id}`,
  segments: [
    { name: 'compact', lengthM: 100 + offset, curve: [0, 0], riseM: 0, widthM: 7, surface: 'compact' },
    { name: 'loose', lengthM: 150, curve: [0.001, 0.001], riseM: 2, widthM: 7, surface: 'loose' },
    { name: 'finish', lengthM: 150, curve: [0, 0], riseM: -2, widthM: 7, surface: 'compact' }
  ],
  splits: [100 + offset, 250 + offset, 400 + offset],
  expectedDurationSeconds: [100 + offset / 3, 145 + offset / 3],
  landmarkIds: ['finish-gate']
});

const stages = Array.from({ length: 6 }, (_, index) => stage(`stage-${index + 1}`, index * 4));
const events = stages.map((entry, index) => ({
  id: `event-${index + 1}`,
  stageId: entry.id,
  weatherId: index % 2 ? 'rain' : 'clear',
  serviceMinutes: 60,
  referenceTimeSeconds: entry.expectedDurationSeconds[0] + 20
}));
const championship = {
  id: 'cairn-test-cup',
  name: 'Cairn test cup',
  points: [12, 9, 7, 5, 3, 1],
  events,
  rivalIds: ['mara', 'orin', 'vesper']
};
const content = {
  championships: [championship],
  stages,
  weather: [
    { id: 'clear', gripScale: 1, visibilityM: 12000, precipitation: 'none', roadWetness: 0, wind: 0, timeOfDay: 'day' },
    { id: 'rain', gripScale: 0.88, visibilityM: 900, precipitation: 'rain', roadWetness: 0.55, wind: 0.3, timeOfDay: 'dusk' }
  ],
  surfaces: [
    { id: 'compact', grip: 0.92 },
    { id: 'loose', grip: 0.68 }
  ],
  cars: [{ id: 'cairn-r4', benchmarkScale: 1 }],
  difficulties: [
    { id: 'easy', rivalPace: 1.06 },
    { id: 'hard', rivalPace: 0.95 }
  ],
  rivals: [
    { id: 'mara', name: 'Mara Vale', seed: 21, skill: 0.76, consistency: 0.92, damageRisk: 0.02, surfaceBias: { loose: 0.05 } },
    { id: 'orin', name: 'Orin Shaw', seed: 22, skill: 0.56, consistency: 0.81, damageRisk: 0.08, surfaceBias: { compact: -0.02, loose: 0.02 } },
    { id: 'vesper', name: 'Vesper Kade', seed: 23, skill: 0.36, consistency: 0.7, damageRisk: 0.14, surfaceBias: { loose: -0.08 } }
  ]
};

// Focused transition tests use a compact three-event calendar.  The batch below
// deliberately uses the full six-event calendar to exercise carry-over state.
const focusedChampionship = { ...championship, events: events.slice(0, 3) };
const focusedContent = { ...content, championships: [focusedChampionship] };

const makeState = (seed = 1234, initialDamage = damage(), difficultyId = 'hard') => createChampionship({
  championship,
  content,
  carId: 'cairn-r4',
  difficultyId,
  seed,
  initialDamage
});
const makeFocusedState = (seed = 1234, initialDamage = damage(), difficultyId = 'hard') => createChampionship({
  championship: focusedChampionship,
  content: focusedContent,
  carId: 'cairn-r4',
  difficultyId,
  seed,
  initialDamage
});

const serviceAndStart = (state, catalog = content) => startStage(applyService(state, autoServicePlan(state, catalog), catalog), catalog);

const resultFor = (state, eventTimeMs = 120000, extraDamage = damage()) => ({
  stageId: events[state.eventIndex].stageId,
  weatherId: events[state.eventIndex].weatherId,
  carId: state.carId,
  timeMs: eventTimeMs,
  splitsMs: [Math.round(eventTimeMs * 0.34), Math.round(eventTimeMs * 0.68), eventTimeMs],
  penaltyMs: 0,
  damage: extraDamage
});

test('championship snapshots are pure, frozen, and JSON round-trip safe', () => {
  const input = structuredClone(focusedContent);
  const state = makeFocusedState(77, damage(0.25, 0.1));
  assert.deepEqual(validateChampionshipState(state, focusedContent), []);
  assert.notEqual(state, input);
  assert(Object.isFrozen(state));
  assert(Object.isFrozen(state.damage));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepEqual(input.championships[0].events[0].serviceMinutes, 60);
  assert.throws(() => { state.eventIndex = 3; }, TypeError);
});

test('phase gates, stale runs, and exactly-once submit are explicit', () => {
  let state = makeFocusedState();
  assert.deepEqual(availableActions(state), ['applyService', 'abandon']);
  assert.throws(() => startStage(state, focusedContent), error => error.code === 'illegal-phase');
  state = applyService(state, autoServicePlan(state, focusedContent), focusedContent);
  assert.deepEqual(availableActions(state), ['startStage', 'abandon']);
  state = startStage(state, focusedContent);
  const firstRun = state.runId;
  assert.deepEqual(availableActions(state), ['submitResult', 'retire', 'abortRun', 'abandon']);
  assert.throws(() => submitResult(state, 'foreign-run', resultFor(state), focusedContent), error => error.code === 'stale-run');
  state = abortRun(state, focusedContent);
  assert.equal(state.phase, 'ready');
  assert.equal(state.runId, null);
  assert.throws(() => submitResult(state, firstRun, resultFor(state), focusedContent), error => error.code === 'stale-run');
  state = startStage(state, focusedContent);
  assert.notEqual(state.runId, firstRun);
  const done = submitResult(state, state.runId, resultFor(state), focusedContent);
  assert.equal(done.results.length, 1);
  assert.equal(submitResult(done, state.runId, { timeMs: 1 }, focusedContent), done);
  assert.throws(() => submitResult(done, firstRun, resultFor(state), focusedContent), error => error.code === 'stale-run');
});

test('result seconds round once to integer milliseconds and preserve the final split invariant', () => {
  let state = serviceAndStart(makeFocusedState(18), focusedContent);
  const rounded = submitResult(state, state.runId, {
    stageId: 'stage-1',
    weatherId: 'clear',
    carId: 'cairn-r4',
    timeSeconds: 12.3456,
    splits: [4.1111, 8.2222, 12.3456],
    damage: state.damage
  }, focusedContent);
  assert.equal(rounded.results[0].timeMs, 12346);
  assert.deepEqual(rounded.results[0].splitsMs, [4111, 8222, 12346]);
  assert.deepEqual(validateChampionshipState(rounded, focusedContent), []);
  let retry = serviceAndStart(makeFocusedState(19), focusedContent);
  assert.throws(() => submitResult(retry, retry.runId, {
    ...resultFor(retry),
    splitsMs: [40000, 80000, 99999],
    timeMs: 100000
  }, focusedContent), error => error.code === 'invalid-result');
});

test('service follows the direct linear repair formula and automatic service is feasible', () => {
  const state = makeFocusedState(5, damage(0.5, 0.2, 0.1, 0.4, 0.3));
  const plan = { repair: { engine: 10, steering: 4, suspension: 2, brakes: 1, body: 3 }, tyreId: 'gravel' };
  const report = planService(state, plan, focusedContent);
  for (const key of DAMAGE_COMPONENTS) {
    const expected = Math.max(0, state.damage[key] - report.repairMinutes[key] / REPAIR_MINUTES[key]);
    assert.equal(report.after[key], expected);
  }
  assert.equal(report.usedMinutes, Object.values(report.repairMinutes).reduce((sum, value) => sum + value, 0) + report.setupMinutes.total);
  assert.equal(report.remainingMinutes, 60 - 20 - TYRE_SERVICE_MINUTES.gravel);
  assert.equal(report.tuning.tyreId, 'gravel');
  assert.throws(() => planService(state, { repair: { engine: 61 } }, focusedContent), error => error.code === 'over-budget');
  assert.throws(() => planService(state, { repair: { engine: -1 } }, focusedContent), error => error.code === 'negative-service');
  assert.throws(() => planService(state, { repair: { gearbox: 1 } }, focusedContent), error => error.code === 'unknown-service-component');
  const automatic = autoServicePlan(state, focusedContent);
  const autoReport = planService(state, automatic, focusedContent);
  const needed = DAMAGE_COMPONENTS.reduce((sum, key) => sum + state.damage[key] * REPAIR_MINUTES[key], 0);
  assert(autoReport.usedMinutes <= 60 + 1e-9);
  assert.equal(autoReport.wastedTotalMinutes, 0);
  assert.equal(autoReport.usedMinutes, Math.min(60, needed));
});

test('service setup choices have explicit costs, bounded steps, and no mutation on invalid plans', () => {
  const state = makeFocusedState(6, damage(0.1, 0.05, 0.05, 0.1, 0));
  const before = structuredClone(state);
  const plan = {
    repair: { engine: 0, steering: 0, suspension: 0, brakes: 0, body: 0 },
    setup: { tyreId: 'wet', brakeBias: 0.1, steeringRatio: -0.05, rideHeight: 0.15, damping: -0.1 }
  };
  const report = planService(state, plan, focusedContent);
  const expectedSetupMinutes = TYRE_SERVICE_MINUTES.wet
    + (Math.abs(plan.setup.brakeBias) / SETUP_STEP) * SETUP_ADJUSTMENT_MINUTES.brakeBias
    + (Math.abs(plan.setup.steeringRatio) / SETUP_STEP) * SETUP_ADJUSTMENT_MINUTES.steeringRatio
    + (Math.abs(plan.setup.rideHeight) / SETUP_STEP) * SETUP_ADJUSTMENT_MINUTES.rideHeight
    + (Math.abs(plan.setup.damping) / SETUP_STEP) * SETUP_ADJUSTMENT_MINUTES.damping;
  assert.equal(report.setupMinutes.total, expectedSetupMinutes);
  assert.equal(report.usedMinutes, expectedSetupMinutes);
  assert.equal(report.remainingMinutes, 60 - expectedSetupMinutes);
  assert.deepEqual(report.tuning, plan.setup);
  assert.deepEqual(state, before);
  assert.ok(TYRE_OPTIONS.includes('standard'));
  assert.ok(TYRE_OPTIONS.includes('tarmac'));
  assert.ok(TYRE_OPTIONS.includes('wet'));
  assert.ok(TYRE_OPTIONS.includes('gravel'));
  for (const key of ['brakeBias', 'steeringRatio', 'rideHeight', 'damping']) {
    assert.equal(SETUP_LIMITS[key], 0.25);
    assert.throws(() => planService(state, { setup: { [key]: 0.3 } }, focusedContent), error => error.code === 'invalid-tuning');
    assert.throws(() => planService(state, { setup: { [key]: 0.03 } }, focusedContent), error => error.code === 'invalid-tuning');
  }
  assert.throws(() => planService(state, { setup: { tyreId: 'slick' } }, focusedContent), error => error.code === 'invalid-tuning');
  assert.deepEqual(state, before);
});

test('applying a setup plan persists the selected tuning into the next stage state', () => {
  const state = makeFocusedState(7);
  const setup = { tyreId: 'gravel', brakeBias: -0.1, steeringRatio: 0.05, rideHeight: 0, damping: 0.1 };
  const ready = applyService(state, { repair: {}, setup }, focusedContent);
  assert.equal(ready.phase, 'ready');
  assert.deepEqual(ready.tuning, setup);
  assert.ok(Object.isFrozen(ready.tuning));
  const next = startStage(ready, focusedContent);
  assert.deepEqual(next.tuning, setup);
});

test('rival outcomes are deterministic, independent of player time, and skill-monotone', () => {
  const state = serviceAndStart(makeFocusedState(99), focusedContent);
  const first = rivalOutcome({ state, catalog: focusedContent });
  const second = rivalOutcome({ state, catalog: focusedContent, playerTimeMs: 999999 });
  assert.deepEqual(first, second);
  const low = structuredClone(content);
  low.rivals[0].skill = 0;
  const high = structuredClone(content);
  high.rivals[0].skill = 1;
  low.championships[0].events = low.championships[0].events.slice(0, 3);
  high.championships[0].events = high.championships[0].events.slice(0, 3);
  const slow = rivalOutcome({ state, catalog: low })[0];
  const fast = rivalOutcome({ state, catalog: high })[0];
  if (slow.status === 'finished' && fast.status === 'finished') assert(fast.timeMs < slow.timeMs);
  assert.deepEqual(first, rivalOutcome({ state, catalog: focusedContent }));
  const easy = rivalOutcome({ state: { ...state, difficultyId: 'easy' }, catalog: focusedContent });
  const hard = rivalOutcome({ state, catalog: focusedContent });
  assert(easy.every((entry, index) => entry.status !== 'finished' || hard[index].status !== 'finished' || entry.timeMs > hard[index].timeMs));
  for (const entry of first) if (entry.status === 'finished') assert(entry.timeMs > 0 && Number.isInteger(entry.timeMs));
});

test('stage standings apply penalties before points and put retirements last', () => {
  const result = {
    status: 'finished',
    timeMs: 100000,
    penaltyMs: 5000,
    rivalResults: [
      { id: 'quick', name: 'Quick', status: 'finished', timeMs: 102000, penaltyMs: 0 },
      { id: 'retired', name: 'Retired', status: 'retired', timeMs: null, penaltyMs: 0 },
      { id: 'slow', name: 'Slow', status: 'finished', timeMs: 101000, penaltyMs: 0 }
    ]
  };
  const standings = stageStandings(result);
  assert.deepEqual(standings.map(row => row.id), ['slow', 'quick', 'player', 'retired']);
  assert.equal(standings[0].points, 25);
  assert.equal(standings.at(-1).points, 0);
});

test('interrupted serialised snapshots replay to the same six-event classification', () => {
  const run = (seed, interrupted = false) => {
    let state = makeState(seed);
    for (let index = 0; index < 6; index += 1) {
      state = serviceAndStart(state);
      const currentDamage = damage(
        Math.min(1, state.damage.engine + 0.01),
        Math.min(1, state.damage.steering + 0.005),
        Math.min(1, state.damage.suspension + 0.008),
        Math.min(1, state.damage.brakes + 0.006),
        Math.min(1, state.damage.body + 0.004)
      );
      state = submitResult(state, state.runId, resultFor(state, 110000 + index * 200, currentDamage), content);
      if (interrupted) state = JSON.parse(JSON.stringify(state));
    }
    return state;
  };
  const uninterrupted = run(123, false);
  const resumed = run(123, true);
  assert.deepEqual(resumed, uninterrupted);
  assert.equal(resumed.phase, 'classified');
  assert.equal(resumed.results.length, 6);
  assert.deepEqual(validateChampionshipState(resumed, content), []);
  assert.deepEqual(overallStandings(resumed, content).map(row => row.id), ['player', 'mara', 'orin', 'vesper']);
  assert.deepEqual(projectedSplits(stages[0], 120), [30, 75, 120]);
});

test('one thousand seeded legal sequences preserve bounded state and classifications', () => {
  for (let seed = 0; seed < 1000; seed += 1) {
    let state = makeState(seed, damage(0.15, 0.1, 0.05, 0.08, 0.04));
    for (let index = 0; index < 6; index += 1) {
      state = serviceAndStart(state);
      const run = state.runId;
      if (seed % 11 === index) {
        state = retire(state, run, { reason: 'seeded puncture' }, content);
      } else {
        const t = 108000 + ((seed * 37 + index * 113) % 9000);
        state = submitResult(state, run, resultFor(state, t, damage(0.02, 0.01, 0.015, 0.01, 0.008)), content);
      }
      assert.deepEqual(validateChampionshipState(state, content), []);
      for (const value of Object.values(state.damage)) assert(value >= 0 && value <= 1 && Number.isFinite(value));
    }
    assert.equal(state.phase, 'classified');
    assert.equal(state.results.length, 6);
  }
});

test('abandon is terminal and idempotent', () => {
  const state = makeFocusedState();
  const abandoned = abandon(state, focusedContent);
  assert.equal(abandoned.phase, 'abandoned');
  assert.equal(abandon(abandoned, focusedContent), abandoned);
  assert.deepEqual(availableActions(abandoned), []);
  let classified = makeState(41);
  for (let index = 0; index < 6; index += 1) {
    classified = serviceAndStart(classified);
    classified = submitResult(classified, classified.runId, resultFor(classified), content);
  }
  assert.throws(() => abandon(classified, content), error => error.code === 'illegal-phase');
});

test('validation rejects corrupt content references and rival result structure', () => {
  let state = serviceAndStart(makeFocusedState(27), focusedContent);
  state = submitResult(state, state.runId, resultFor(state), focusedContent);
  const mutations = [
    value => { delete value.damage.engine; },
    value => { value.results[0].eventId = 'event-2'; },
    value => { value.results[0].rivalResults[0].id = 'missing-rival'; },
    value => { value.results[0].rivalResults[0].timeMs = -1; },
    value => { delete value.results[0].rivalResults[0].reason; },
    value => { value.results[0].rivalResults.push(structuredClone(value.results[0].rivalResults[0])); },
    value => { delete value.results[0].reason; },
    value => { value.carId = 'missing-car'; },
    value => { value.difficultyId = 'missing-difficulty'; }
  ];
  for (const mutate of mutations) {
    const corrupt = structuredClone(state);
    mutate(corrupt);
    assert.notDeepEqual(validateChampionshipState(corrupt, focusedContent), []);
  }
  const reordered = structuredClone(focusedContent);
  reordered.championships[0].events.reverse();
  assert.notDeepEqual(validateChampionshipState(state, reordered), []);
});

test('rival formula has a stable golden result and standings conserve awarded points', () => {
  let state = serviceAndStart(makeFocusedState(99), focusedContent);
  assert.deepEqual(rivalOutcome({ state, catalog: focusedContent }), [
    { id: 'mara', name: 'Mara Vale', status: 'finished', timeMs: 107450, penaltyMs: 0, reason: null },
    { id: 'orin', name: 'Orin Shaw', status: 'finished', timeMs: 115866, penaltyMs: 0, reason: null },
    { id: 'vesper', name: 'Vesper Kade', status: 'finished', timeMs: 124612, penaltyMs: 0, reason: null }
  ]);
  state = submitResult(state, state.runId, resultFor(state, 118000), focusedContent);
  const rows = stageStandings(state, focusedContent, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.points, 0), focusedChampionship.points.slice(0, rows.length).reduce((sum, value) => sum + value, 0));
});

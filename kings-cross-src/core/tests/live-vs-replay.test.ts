import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSamples, comparisonServiceFor, recordedPictureAt, sampleTrains, snapshotWindow } from '../../tools/live-vs-replay.ts';
import type { ScheduleCall } from '../schedule.ts';
import type { MotionSample, SampleTrain } from '../../tools/live-vs-replay.ts';
import type { TrainView } from '../motion.ts';

const sampleTrain = (id: number, description: string, point: [number, number] = [0, 0], edge: [number, number, number] = [1, 2, 3]): SampleTrain => ({
  id, description, edge, t: 0.5, point,
});

const sample = (atMs: number, trains: SampleTrain[]): MotionSample => ({ atMs, trains });

test('comparison service matching aligns live elapsed births with replay epoch births', () => {
  const epoch = Date.parse('2026-11-08T18:40:00Z');
  const calls = [
    { uid: 'SYN-LATE', serviceDate: '2026-11-08', headcode: '1SYN', arrivalMs: epoch + 300_000, departureMs: null, operator: 'GR' },
    { uid: 'SYN-EARLY', serviceDate: '2026-11-08', headcode: '1SYN', arrivalMs: epoch, departureMs: null, operator: 'GN' },
  ] as ScheduleCall[];
  const live = comparisonServiceFor(calls, epoch), replay = comparisonServiceFor(calls);
  assert.equal(live('1SYN', 0), calls[1]);
  assert.equal(live('1SYN', 300_000), calls[0]);
  assert.equal(live('1SYN', 300_000), replay('1SYN', epoch + 300_000));
  assert.equal(replay('1SYN', epoch + 10_000_000), undefined);
});

test('sampleTrains copies physical identity and leading position, sorted by id', () => {
  const views = [
    { id: 8, description: 'SYN8', leading: { edge: { a: 20, b: 21, wayId: 200 }, t: 0.75, point: [8, 9] } },
    { id: 3, description: 'SYN3', leading: { edge: { a: 10, b: 11, wayId: 100 }, t: 0.25, point: [3, 4] } },
  ] as unknown as TrainView[];

  assert.deepEqual(sampleTrains(views), [
    { id: 3, description: 'SYN3', edge: [10, 11, 100], t: 0.25, point: [3, 4] },
    { id: 8, description: 'SYN8', edge: [20, 21, 200], t: 0.75, point: [8, 9] },
  ]);
});

test('identical non-empty samples pass with exact train, id, edge and position agreement', () => {
  const live = [sample(1000, [sampleTrain(1, 'SYN1'), sampleTrain(2, 'SYN2', [10, 0])]), sample(2000, [sampleTrain(1, 'SYN1')])];
  const result = compareSamples(live, structuredClone(live));

  assert.equal(result.passed, true);
  assert.equal(result.samples, 2);
  assert.equal(result.replaySamples, 2);
  assert.equal(result.sameTrainSetSeconds, 2);
  assert.equal(result.missingSampleSeconds, 0);
  assert.equal(result.liveOnlyTrainSamples, 0);
  assert.equal(result.replayOnlyTrainSamples, 0);
  assert.equal(result.matchedTrainSamples, 3);
  assert.equal(result.matchingPhysicalIds, 3);
  assert.equal(result.matchingEdges, 3);
  assert.deepEqual(result.positionDifferenceM, { median: 0, p95: 0, max: 0 });
});

test('reports a description replacement as one live-only and one replay-only train', () => {
  const live = [sample(1000, [sampleTrain(1, 'SYN1'), sampleTrain(2, 'SYN2', [10, 0])])];
  const replay = [sample(1000, [sampleTrain(1, 'SYN1'), sampleTrain(2, 'SYN3', [10, 0])])];
  const result = compareSamples(live, replay);

  assert.equal(result.sameTrainSetSeconds, 0);
  assert.equal(result.seconds[0]!.sameTrains, false);
  assert.equal(result.liveOnlyTrainSamples, 1);
  assert.equal(result.replayOnlyTrainSamples, 1);
  assert.equal(result.commonIdSamples, 2);
  assert.equal(result.descriptionByIdAgreement, 1);
  assert.equal(result.passed, false);
});

test('reports physical id and edge disagreement even when descriptions match', () => {
  const live = [sample(1000, [sampleTrain(1, 'SYN1', [0, 0], [10, 11, 100])])];
  const replay = [sample(1000, [sampleTrain(9, 'SYN1', [1, 0], [10, 12, 100])])];
  const result = compareSamples(live, replay);

  assert.equal(result.sameTrainSetSeconds, 1);
  assert.equal(result.matchedTrainSamples, 1);
  assert.equal(result.matchingPhysicalIds, 0);
  assert.equal(result.matchingEdges, 0);
  assert.equal(result.positionDifferenceM.max, 1);
  assert.equal(result.passed, true);
});

test('rejects position p95 at the 5 m acceptance boundary', () => {
  const live = Array.from({ length: 20 }, (_, i) => sample(i * 1000, [sampleTrain(1, 'SYN1')]));
  const replay = live.map((s, i) => sample(s.atMs, [sampleTrain(1, 'SYN1', [i >= 18 ? 5 : 1, 0])]));
  const result = compareSamples(live, replay);

  assert.equal(result.positionDifferenceM.p95, 5);
  assert.equal(result.passed, false);
});

test('does not pass when both sides contain no samples', () => {
  assert.equal(compareSamples([], []).passed, false);
});

test('starts at the nearest prior checkpoint and preserves same-time recorder order', () => {
  const row = (t: number, kind: string, label: string) => ({
    t,
    e: kind === 'snapshot'
      ? { kind, area: 'TEST', berths: { [label]: label } }
      : { kind, area: 'TEST', descr: label },
  });
  const rows = [
    row(100, 'snapshot', 'old'),
    row(180, 'step', 'before-near'),
    row(200, 'snapshot', 'near-a'),
    row(200, 'step', 'between-near-checkpoints'),
    row(200, 'snapshot', 'near-b'),
    row(200, 'interpose', 'after-near-b'),
    row(250, 'step', 'window-end'),
    row(300, 'snapshot', 'future'),
  ];

  const selected = snapshotWindow(rows as Parameters<typeof snapshotWindow>[0], 225, 250);
  assert.deepEqual(selected, rows.slice(4, 7));
});

test('reconstructs the recorded berth picture without treating motion timeouts as TD cancellations', () => {
  const rows = [
    { t: 0, e: { kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1', OLD: 'SYN2' } } },
    { t: 1, e: { kind: 'step', area: 'TEST', descr: 'SYN1', from: 'A', to: 'B' } },
    { t: 2, e: { kind: 'cancel', area: 'TEST', descr: 'SYN2', from: 'OLD' } },
    { t: 3, e: { kind: 'interpose', area: 'TEST', descr: '****', to: 'HOP' } },
    { t: 4, e: { kind: 'interpose', area: 'OTHER', descr: 'OTHER', to: 'WRONG' } },
    { t: 9_000_000, e: { kind: 'cancel', area: 'TEST', descr: 'SYN1', from: 'B' } },
  ];
  assert.deepEqual(recordedPictureAt(rows, 8_000_000, 'TEST'), { B: 'SYN1', HOP: '****' });
  assert.deepEqual(recordedPictureAt([...rows, { t: 10_000_000, e: { kind: 'snapshot', area: 'TEST', berths: {} } }], 11_000_000, 'TEST'), {});
});


test('round36: duplicate headcodes preserve the number of physical trains', () => {
  const result = compareSamples([sample(1000, [sampleTrain(1, 'SYN1'), sampleTrain(2, 'SYN1')])],
    [sample(1000, [sampleTrain(1, 'SYN1')])]);
  assert.equal(result.sameTrainSetSeconds, 0);
  assert.equal(result.liveOnlyTrainSamples, 1);
  assert.equal(result.passed, false);
});

test('round36: repeated headcodes pair every body once, preferring common physical ids', () => {
  const a = sampleTrain(1, 'SYN1', [0, 0]), b = sampleTrain(2, 'SYN1', [100, 0]);
  const result = compareSamples([sample(1000, [a, b])], [sample(1000, [b, a])]);
  assert.equal(result.passed, true);
  assert.equal(result.matchedTrainSamples, 2);
  assert.equal(result.matchingPhysicalIds, 2);
  assert.deepEqual(result.positionDifferenceM, { median: 0, p95: 0, max: 0 });
});

test('round36: one large position error fails even when p95 is zero', () => {
  const live = Array.from({ length: 101 }, (_, i) => sample(i * 1000, [sampleTrain(1, 'SYN1')]));
  const replay = live.map((s, i) => sample(s.atMs, [sampleTrain(1, 'SYN1', [i === 100 ? 100 : 0, 0])]));
  const result = compareSamples(live, replay);
  assert.equal(result.positionDifferenceM.p95, 0);
  assert.equal(result.positionDifferenceM.max, 100);
  assert.equal(result.passed, false);
});

test('round36: duplicate or out-of-order sample times cannot hide a missing second', () => {
  const a = sample(1000, [sampleTrain(1, 'SYN1')]), b = sample(2000, [sampleTrain(1, 'SYN1')]);
  const duplicate = compareSamples([a, a], [a, b]);
  assert.equal(duplicate.passed, false);
  assert.ok(duplicate.validationIssues.some((s) => s.includes('strictly increasing')));
  assert.equal(compareSamples([b, a], [a, b]).passed, false);
});

test('round36: a stationary hour is transport agreement with an explicit movement evidence gap', () => {
  const rows = Array.from({ length: 3601 }, (_, i) => sample(i * 1000, [sampleTrain(1, 'SYN1')]));
  const result = compareSamples(rows, structuredClone(rows));
  assert.equal(result.passed, true);
  assert.equal(result.activeHourObserved, false);
  assert.equal(result.activity.live.movingTransitions, 0);
  assert.equal(result.activity.live.uniquePhysicalIds, 1);
  assert.ok(result.coverageWarnings.some((s) => s.includes('no drawn train movement')));
});

test('round36: activity counts movement, births, departures and renames without counting initial trains as births', () => {
  const rows = [sample(0, [sampleTrain(1, 'SYN1')]),
    sample(1000, [sampleTrain(1, 'SYN2', [10, 0]), sampleTrain(2, 'SYN3')]),
    sample(3600000, [sampleTrain(2, 'SYN3')])];
  const result = compareSamples(rows, structuredClone(rows));
  assert.deepEqual(result.activity.live, { uniquePhysicalIds: 2, uniqueDescriptions: 3, initialTrains: 1,
    trainSampleCount: 4, emptySamples: 0, movingTransitions: 1, appearedAfterStart: 1, disappearedAfterStart: 1,
    renames: 1, maxDisplacementM: 10 });
  assert.equal(result.activeHourObserved, false, 'an hour-long span with unsampled gaps is not a sampled hour');
  assert.ok(result.coverageWarnings.some((s) => s.includes('sample gap')));
});


test('round36: a complete sampled moving hour is distinguished from the idle hour', () => {
  const rows = Array.from({ length: 3601 }, (_, i) => sample(i * 1000, [sampleTrain(1, 'SYN1', [i, 0])]));
  const result = compareSamples(rows, structuredClone(rows));
  assert.equal(result.passed, true);
  assert.equal(result.activeHourObserved, true);
  assert.equal(result.activity.live.movingTransitions, 3600);
  assert.deepEqual(result.coverageWarnings, []);
});

test('round36: duplicate physical ids are a named invalid comparison even when both inputs agree', () => {
  const rows = [sample(1000, [sampleTrain(1, 'SYN1'), sampleTrain(1, 'SYN2')])];
  const result = compareSamples(rows, structuredClone(rows));
  assert.equal(result.passed, false);
  assert.ok(result.validationIssues.some((s) => s.includes('duplicate physical ids')));
});

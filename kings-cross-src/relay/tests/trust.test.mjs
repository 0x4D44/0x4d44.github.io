import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrustState } from '../trust.mjs';

const baseTime = Date.UTC(2026, 10, 8, 12);

function service(overrides = {}) {
  return {
    uid: 'A12345', headcode: '1A23', operator: 'GR', category: 'XX',
    date: '2026-11-08', serviceDate: '2026-11-08', stp: 'O',
    startDate: '2026-01-01', endDate: '2026-12-31', platform: '4',
    origin: 'DONC', destination: 'KNGX',
    arrival: '12:00', departure: '12:03', publicArrival: '12:00', publicDeparture: '12:03',
    arrivalMs: baseTime, departureMs: baseTime + 180_000,
    publicArrivalMs: baseTime, publicDepartureMs: baseTime + 180_000,
    ...overrides,
  };
}

function activation(overrides = {}) {
  return {
    header: { msg_type: '0001', source_system_id: 'TRUST' },
    body: {
      train_id: 'AA1A23M008', train_uid: 'A12345', schedule_type: 'P',
      schedule_start_date: '2026-01-01', tp_origin_timestamp: '2026-11-08',
      origin_dep_timestamp: String(baseTime - 3_600_000),
      user_id: 'SYNTHETIC-PRIVATE-METADATA', ...overrides,
    },
  };
}

function movement(overrides = {}) {
  return {
    header: { msg_type: '0003', source_system_id: 'TRUST' },
    body: {
      train_id: 'AA1A23M008', current_train_id: '', loc_stanox: '54311',
      event_type: 'ARRIVAL', planned_timestamp: String(baseTime),
      actual_timestamp: String(baseTime + 60_000), gbtt_timestamp: String(baseTime),
      variation_status: 'LATE', timetable_variation: '1', platform: '4',
      user_id: 'SYNTHETIC-PRIVATE-METADATA', ...overrides,
    },
  };
}

test('trust: activation links only to a King’s Cross schedule and emits safe fields', () => {
  const kx = service();
  const other = service({ uid: 'B54321', headcode: '9Z99', date: '2026-11-08', serviceDate: '2026-11-08' });
  const state = createTrustState({ services: () => [kx, other], now: () => baseTime });
  const events = state.apply([
    activation(),
    activation({ train_id: 'CC9Z99M008', train_uid: 'NOTKX', user_id: 'SHOULD-NOT-LEAK' }),
    { header: { msg_type: '0008' }, body: { user_id: 'IGNORED' } },
  ]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    kind: 'trust', area: 'Y9', type: 'activation',
    trainId: 'AA1A23M008', uid: 'A12345', headcode: '1A23',
    serviceDate: '2026-11-08', date: '2026-11-08', eventType: null,
    plannedMs: baseTime - 3_600_000, actualMs: null, publicMs: null,
    variationMinutes: null, platform: '4', matchMethod: 'activation', receivedAtMs: baseTime,
  });
  assert.ok(!JSON.stringify(events).includes('SYNTHETIC-PRIVATE-METADATA'));
  assert.ok(!JSON.stringify(events).includes('SHOULD-NOT-LEAK'));
  assert.equal(state.stats().activations, 1);
  assert.equal(state.stats().rejectedActivations, 1);
});

test('trust: retains startup activations until schedules finish loading', () => {
  const state = createTrustState({ services: () => [], now: () => baseTime });
  assert.deepEqual(state.apply(JSON.stringify([activation()])), []);
  assert.equal(state.stats().pendingActivations, 1);
  const resolved = state.setServices([service()]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].uid, 'A12345');
  assert.equal(resolved[0].matchMethod, 'activation');
  assert.equal(state.stats().pendingActivations, 0);
  assert.equal(state.setServices([service()]).length, 0, 'resolved activations are emitted once');
});

test('trust: activated King’s Cross movement enriches actual and public times with signed early variation', () => {
  const call = service();
  const state = createTrustState({ services: () => [call], now: () => baseTime });
  const actualArrival = baseTime - 2 * 60_000;
  const events = state.apply(JSON.stringify([
    activation(),
    movement({ actual_timestamp: String(actualArrival), variation_status: 'EARLY', timetable_variation: '2' }),
    movement({ loc_stanox: '54312' }),
  ]));
  const [arrival] = events.filter((event) => event.type === 'movement');
  assert.deepEqual({ uid: arrival.uid, headcode: arrival.headcode, serviceDate: arrival.serviceDate,
    date: arrival.date, matchMethod: arrival.matchMethod, eventType: arrival.eventType,
    actualMs: arrival.actualMs, publicMs: arrival.publicMs, variationMinutes: arrival.variationMinutes,
    platform: arrival.platform }, {
    uid: 'A12345', headcode: '1A23', serviceDate: '2026-11-08', date: '2026-11-08',
    matchMethod: 'activation', eventType: 'ARRIVAL', actualMs: actualArrival, publicMs: baseTime,
    variationMinutes: -2, platform: '4',
  });
  const { calls, realtime } = state.enrich();
  assert.equal(realtime.length, 1);
  assert.equal(calls[0].realtime.actualArrivalMs, actualArrival);
  assert.equal(calls[0].realtime.publicArrivalMs, baseTime);
  assert.equal(calls[0].realtime.actualDepartureMs, null);
  assert.ok(!Object.hasOwn(calls[0].realtime, 'expectedArrivalMs'));
  assert.ok(!JSON.stringify({ calls, realtime }).includes('SYNTHETIC-PRIVATE-METADATA'));
});

test('trust: fallback matches the nearest headcode call across midnight', () => {
  const plannedMs = Date.UTC(2026, 6, 1, 23, 30);
  const overnight = service({ uid: 'NIGHT1', headcode: '2H01', date: '2026-07-02', serviceDate: '2026-07-01',
    arrivalMs: plannedMs, departureMs: plannedMs + 120_000, publicArrivalMs: plannedMs, publicDepartureMs: plannedMs + 120_000 });
  const decoy = service({ uid: 'DECOY1', headcode: '2H01', date: '2026-07-02', serviceDate: '2026-07-02',
    arrivalMs: plannedMs + 70 * 60_000, departureMs: plannedMs + 72 * 60_000 });
  const state = createTrustState({ services: () => [decoy, overnight], now: () => plannedMs + 100_000 });
  const event = state.apply([movement({ train_id: 'AA2H01M102', planned_timestamp: String(plannedMs),
    actual_timestamp: String(plannedMs + 60_000), gbtt_timestamp: '' })])[0];
  assert.equal(event.uid, 'NIGHT1');
  assert.equal(event.serviceDate, '2026-07-01');
  assert.equal(event.date, '2026-07-02');
  assert.equal(event.matchMethod, 'headcode-time');
});

test('trust: unmatched King’s Cross movements stay visible while other STANOX rows are dropped', () => {
  const state = createTrustState({ services: () => [], now: () => baseTime });
  const events = state.apply([
    movement({ current_train_id: 'BB1A23M008', train_id: '', loc_stanox: '54311' }),
    movement({ loc_stanox: '54312' }),
    movement({ train_id: '', current_train_id: '', loc_stanox: '54311' }),
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, null);
  assert.equal(events[0].headcode, '1A23');
  assert.equal(events[0].matchMethod, 'unmatched');
  assert.equal(state.stats().unmatchedMovements, 1);
});

test('trust: expires reused train identities and their movements after 24 hours', () => {
  let now = baseTime;
  const call = service();
  const state = createTrustState({ services: () => [call], now: () => now });
  state.apply([activation(), movement()]);
  assert.equal(state.stats().activations, 1);
  assert.equal(state.stats().movements, 1);
  now += 24 * 60 * 60_000 + 1;
  assert.equal(state.stats().activations, 0);
  assert.equal(state.stats().movements, 0);
  assert.equal(state.stats().expiredActivations, 1);
  assert.equal(state.stats().expiredMovements, 1);

  now += 29 * 24 * 60 * 60_000;
  const reused = state.apply([movement({ planned_timestamp: String(now), actual_timestamp: String(now + 60_000),
    gbtt_timestamp: String(now) })])[0];
  assert.equal(reused.trainId, 'AA1A23M008');
  assert.equal(reused.uid, null, 'a month-old train id mapping is never reused');
  assert.equal(reused.matchMethod, 'unmatched');
});

test('trust: bounds pending activations and recent movements', () => {
  const now = baseTime;
  const state = createTrustState({ services: () => [], now: () => now });
  const activations = Array.from({ length: 5_001 }, (_, i) => activation({
    train_id: `AA1A23M${i.toString(36).toUpperCase().padStart(3, '0')}`,
  }));
  const movements = Array.from({ length: 3_001 }, (_, i) => movement({
    event_type: 'ARRIVAL', planned_timestamp: String(baseTime + i * 1_000),
  }));
  state.apply([...activations, ...movements]);
  const stats = state.stats();
  assert.equal(stats.pendingActivations, 5_000);
  assert.equal(stats.droppedPendingActivations, 1);
  assert.equal(stats.movements, 3_000);
  assert.equal(stats.unmatchedMovements, 3_000);
});

test('trust: newer corrections replace realtime values without inventing forecasts', () => {
  const call = service();
  let now = baseTime;
  const state = createTrustState({ services: () => [call], now: () => now });
  const firstActual = baseTime + 60_000;
  const correctedActual = baseTime + 120_000;
  state.apply([activation()]);
  now += 1_000;
  state.apply([movement({ actual_timestamp: String(firstActual), variation_status: 'LATE', timetable_variation: '1' })]);
  now += 1_000;
  state.apply([movement({ planned_timestamp: String(baseTime + 60_000), actual_timestamp: String(correctedActual),
    variation_status: 'LATE', timetable_variation: '2' })]);
  const { calls, realtime } = state.enrich();
  assert.equal(realtime.length, 2, 'both correction records remain visible');
  assert.equal(realtime[0].actualMs, correctedActual, 'latest correction is returned first');
  assert.equal(calls[0].realtime.actualArrivalMs, correctedActual);
  assert.equal(calls[0].realtime.variationMinutes, 2);
  assert.ok(!Object.hasOwn(calls[0].realtime, 'expectedArrivalMs'));

  let crossKindTime = baseTime;
  const crossKind = createTrustState({ services: () => [call], now: () => crossKindTime });
  crossKind.apply([movement({ event_type: 'DEPARTURE', actual_timestamp: String(baseTime + 240_000),
    variation_status: 'LATE', timetable_variation: '3', platform: '5' })]);
  crossKindTime += 1_000;
  crossKind.apply([movement({ event_type: 'ARRIVAL', actual_timestamp: String(baseTime + 120_000),
    variation_status: 'EARLY', timetable_variation: '2', platform: '2' })]);
  const merged = crossKind.enrich().calls[0].realtime;
  assert.equal(merged.eventType, 'ARRIVAL', 'latest received event controls merged metadata across event types');
  assert.equal(merged.variationMinutes, -2);
  assert.equal(merged.platform, '2');
  assert.equal(merged.updatedAtMs, crossKindTime);
  assert.equal(merged.actualArrivalMs, baseTime + 120_000);
  assert.equal(merged.actualDepartureMs, baseTime + 240_000);
});

test('trust: origin epoch determines London service date through summer midnight', () => {
  const serviceDate = '2026-07-02';
  const originEpoch = Date.UTC(2026, 6, 1, 23, 30);
  const call = service({ uid: 'SUMMER', date: serviceDate, serviceDate,
    startDate: '2026-01-01', endDate: '2026-12-31', arrivalMs: originEpoch + 3_600_000 });
  const state = createTrustState({ services: () => [call], now: () => originEpoch });
  const [event] = state.apply([activation({ train_uid: 'SUMMER', train_id: 'AA1A23M008',
    origin_dep_timestamp: String(originEpoch), tp_origin_timestamp: '' })]);
  assert.ok(event, 'the London origin date must link this activation');
  assert.equal(event.serviceDate, '2026-07-02');
  assert.equal(event.date, '2026-07-02');
});

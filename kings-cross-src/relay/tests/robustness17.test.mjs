import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createTrustState } from '../trust.mjs';
import { createScheduleStore, filterSchedule, nameSchedule } from '../schedule.mjs';

const date = '2026-11-08', at = Date.parse(`${date}T12:00:00Z`);
const call = { uid: 'SYN001', headcode: '1Z01', serviceDate: date, date, arrivalMs: at, departureMs: at + 60_000 };
const movement = (extra = {}) => ({ header: { msg_type: '0003' }, body: {
  train_id: '001Z01AA08', loc_stanox: '54311', event_type: 'ARRIVAL', planned_timestamp: at,
  actual_timestamp: at + 60_000, gbtt_timestamp: at, ...extra,
} });
const record = (uid = 'SYN001') => ({ JsonScheduleV1: { CIF_train_uid: uid, CIF_stp_indicator: 'P', schedule_start_date: date,
  schedule_end_date: date, schedule_days_runs: '0000001', schedule_segment: { signalling_id: '1Z01',
    schedule_location: [{ tiploc_code: 'KNGX', departure: '1200' }] } } });
const line = JSON.stringify(record()) + '\n';
async function* chunks(raw, width = 17) { for (let i = 0; i < raw.length; i += width) yield raw.subarray(i, i + width); }
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; }; }

test('round17 TRUST seeded malformed numeric fields never coerce or escape Date range', () => {
  const rng = random(1701);
  const invalid = [true, false, [], [at], {}, null, '', ' ', Infinity, -Infinity, NaN, 8_640_000_000_000_001, '1e309', '0x10', 1.5, '1.5'];
  const state = createTrustState({ services: [call], now: () => at });
  for (let i = 0; i < 128; i++) {
    const value = invalid[rng() % invalid.length];
    const [event] = state.apply([movement({ actual_timestamp: value, planned_timestamp: value, gbtt_timestamp: value, timetable_variation: value })]);
    assert.equal(event.actualMs, null, `case ${i}`);
    assert.equal(event.plannedMs, null, `case ${i}`);
    assert.equal(event.publicMs, null, `case ${i}`);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 10080) assert.equal(event.variationMinutes, null);
  }
});

test('round17 TRUST rejects oversized identifiers and bounds retained optional strings', () => {
  const state = createTrustState({ services: [call], now: () => at });
  assert.deepEqual(state.apply([movement({ train_id: `001Z01${'X'.repeat(10000)}` })]), []);
  for (const length of [33, 64, 128])
    assert.deepEqual(state.apply([movement({ train_id: `001Z01${'X'.repeat(length - 6)}` })]), [], `train id length ${length}`);
  const [event] = state.apply([movement({ platform: 'X'.repeat(10000), variation_status: 'X'.repeat(10000) })]);
  assert.equal(event.platform, null);
  assert.ok(JSON.stringify(event).length < 1000);
});

test('round17 TRUST seeded out-of-order duplicates cannot roll actual arrival backwards', () => {
  const rng = random(1717);
  let now = at, latest = 0;
  const state = createTrustState({ services: [call], now: () => now++ });
  for (let i = 0; i < 128; i++) {
    const actual = at + (rng() % 1000) * 1000;
    latest = Math.max(latest, actual);
    state.apply([movement({ actual_timestamp: actual, planned_timestamp: at + (i % 2) * 1000 })]);
    assert.equal(state.enrich().calls[0].realtime.actualArrivalMs, latest, `case ${i}`);
  }
});

test('round17 schedule applies byte, line and record bounds to plain and gzip streams', async () => {
  for (const compress of [raw => raw, gzipSync]) {
    await assert.rejects(filterSchedule(chunks(compress(Buffer.from(line + ' '.repeat(2048)))), date, { maxLineBytes: 1024 }), /schedule: line limit exceeded/);
    await assert.rejects(filterSchedule(chunks(compress(Buffer.from(line.repeat(8)))), date, { maxDecodedBytes: line.length * 2 }), /schedule: decoded byte limit exceeded/);
    await assert.rejects(filterSchedule(chunks(compress(Buffer.from(line.repeat(4)))), date, { maxRecords: 2 }), /schedule: record limit exceeded/);
  }
});

test('round17 schedule wrong JSON types fail with sanitized errors across seeded chunk boundaries', async () => {
  const rng = random(1723);
  for (const value of [null, true, 17, [], { JsonScheduleV1: null }, { JsonScheduleV1: [] }]) {
    await assert.rejects(filterSchedule(chunks(Buffer.from(line + JSON.stringify(value)), 1 + rng() % 31), date), /^Error: schedule: invalid schedule record$/);
  }
  async function* failedSource() { throw new Error('synthetic-private-upstream'); }
  await assert.rejects(filterSchedule(failedSource(), date), /^Error: schedule: invalid stream$/);
  const zipped = gzipSync(Buffer.from(line));
  await assert.rejects(filterSchedule(chunks(zipped.subarray(0, zipped.length - 4)), date));
  assert.equal((await filterSchedule(chunks(zipped, 1), date)).calls.length, 1);
});

test('round17 schedule ignores malformed optional corpus rows without losing calls', () => {
  for (const TIPLOCDATA of [{}, true, [null, false, { TIPLOC: 'KNGX', NLCDESC: 'Kings Cross' }]]) {
    const [named] = nameSchedule([{ origin: 'KNGX', destination: 'OTHER' }], { TIPLOCDATA });
    assert.equal(named.destinationName, 'OTHER');
  }
});


test('round17 schedule cache refuses file symlinks and sanitizes corrupt cache errors', async t => {
  const base = fileURLToPath(new URL('../../../.scratch/round17-cache-tests', import.meta.url));
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dataDir = path.join(dir, 'private');
  await mkdir(dataDir);
  const outside = path.join(dir, 'outside.json');
  await writeFile(outside, JSON.stringify({ date, calls: [call] }));
  await symlink(outside, path.join(dataDir, `schedule-${date}.json`));
  const store = createScheduleStore({ dataDir, readCredentials: () => assert.fail('no network') });
  t.after(() => store.close());
  await assert.rejects(store.get(date), /^Error: schedule: cache read failed$/);
  await writeFile(path.join(dataDir, 'schedule-2026-11-09.json'), 'synthetic-private-upstream');
  await assert.rejects(store.get('2026-11-09'), /^Error: schedule: cache read failed$/);
});


test('round17 TRUST malformed supplied schedule rows cannot crash matching or enrichment', () => {
  const malformed = [null, false, [], {}, 1, 'synthetic'];
  const state = createTrustState({ services: [...malformed, call], now: () => at });
  assert.equal(state.apply([movement()])[0].uid, call.uid);
  assert.equal(state.enrich([...malformed, call]).calls.length, 1);
  assert.deepEqual(state.setServices(malformed), []);
  assert.equal(state.apply([movement()])[0].uid, null);
});


test('round17 successful refreshes keep the same seven-date memo bound as cache reads', async t => {
  const base = fileURLToPath(new URL('../../../.scratch/round17-cache-tests', import.meta.url));
  await mkdir(base, { recursive: true });
  const dataDir = await mkdtemp(path.join(base, 'memo-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const store = createScheduleStore({ dataDir, enabled: true,
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    fetchImpl: async () => ({ ok: true, body: chunks(Buffer.from(line)) }),
  });
  t.after(() => store.close());
  for (let day = 1; day <= 10; day++) assert.ok(await store.refresh(`2026-11-${String(day).padStart(2, '0')}`));
  assert.equal(store.stats().dates.length, 7);
});


test('round17 TRUST malformed JSON errors never include the upstream body', () => {
  const state = createTrustState();
  assert.throws(() => state.apply('synthetic-private-upstream'), /^Error: trust: invalid JSON$/);
});

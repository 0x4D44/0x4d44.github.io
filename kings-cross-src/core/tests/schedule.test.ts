import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate, parseScheduleLine, callsForDate, createScheduleSelector, matchService } from '../schedule.ts';
import type { ScheduleRecord } from '../schedule.ts';
const day = '2026-11-09'; // Monday
const location = (tiploc_code = 'KNGX', arrival = '1000', platform = '4') => ({ tiploc_code, arrival, platform, public_arrival: '1001' });
function record(stp = 'P', locations: unknown[] = [location()], overrides: Record<string, unknown> = {}): ScheduleRecord {
  return parseScheduleLine(JSON.stringify({ JsonScheduleV1: {
    atoc_code: 'GR', CIF_train_uid: 'A12345', CIF_stp_indicator: stp, schedule_start_date: '2026-01-01', schedule_end_date: '2026-12-31',
    schedule_days_runs: '1111111', transaction_type: 'Create',
    schedule_segment: { signalling_id: '1A01', CIF_train_category: 'XX', schedule_location: locations }, ...overrides,
  } }))!;
}
test('schedule: strict dates and non-schedule headers', () => {
  assert.equal(validDate('2026-02-29'), false); assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-2-03'), false); assert.equal(validDate('bad'), false);
  for (const s of ['{', '{}', '{"TiplocV1":{}}', '{"JsonAssociationV1":{}}']) assert.equal(parseScheduleLine(s), undefined);
  assert.equal(record('X'), undefined); assert.equal(record('P', [], { schedule_days_runs: '1234567' }), undefined);
});
test('schedule: parses metadata clocks and platform limits', () => {
  const r = record('P', [{ ...location('KNGX', '1000H', '11'), departure: '1002', public_departure: '10:03', pass: '2500' }]);
  const c = callsForDate([r], day)[0]!;
  assert.equal(c.uid, 'A12345'); assert.equal(c.headcode, '1A01'); assert.equal(c.operator, 'GR'); assert.equal(c.category, 'XX');
  assert.equal(c.arrival, '10:00:30'); assert.equal(c.departure, '10:02'); assert.equal(c.publicDeparture, '10:03');
  assert.equal(c.arrivalMs, Date.parse(`${day}T10:00:30Z`)); assert.equal(c.publicArrivalMs, Date.parse(`${day}T10:01:00Z`));
  assert.equal(c.platform, null); assert.equal(c.origin, 'KNGX'); assert.equal(c.destination, 'KNGX');
  assert.equal(callsForDate([record('P', [location('KNGX', '1000', '0')])], day)[0]!.platform, '0');
});
test('schedule: Monday-first days and inclusive validity', () => {
  const r = record('P', [location()], { schedule_days_runs: '1000000', schedule_start_date: day, schedule_end_date: day });
  assert.equal(callsForDate([r], day).length, 1);
  assert.equal(callsForDate([r], '2026-11-10').length, 0);
  assert.equal(callsForDate([r], '2026-11-08').length, 0);
  assert.equal(callsForDate([record('P', [location()], { schedule_days_runs: '0000001' })], '2026-11-08').length, 1);
});
test('schedule: STP overlay new and cancellation precedence in either order', () => {
  const p = record(), n = record('N', [location('KNGX', '1100')]), o = record('O', [location('KNGX', '1200')]), c = record('C', []);
  for (const records of [[p, n, o], [o, n, p]]) assert.equal(callsForDate(records, day)[0]!.arrival, '12:00');
  assert.equal(callsForDate([p, n], day)[0]!.stp, 'N');
  for (const records of [[p, o, c], [c, o, p]]) assert.deepEqual(callsForDate(records, day), []);
});
test('schedule: bypass overlays and header-only cancellations suppress permanent', () => {
  assert.deepEqual(callsForDate([record(), record('O', [location('YORK')])], day), []);
  const selector = createScheduleSelector(day);
  selector.apply(record('C', [], { schedule_segment: undefined })); selector.apply(record());
  assert.deepEqual(selector.calls(), []);
});
test('schedule: overnight call keeps origin service date and rolls through pass locations', () => {
  const r = record('P', [location('YORK', '2300'), { tiploc_code: 'PASS', pass: '2359H' }, { tiploc_code: 'KNGX', arrival: '0010', departure: '0012', platform: '10', public_arrival: '0009' }], { schedule_start_date: '2026-11-08', schedule_end_date: '2026-11-08' });
  const c = callsForDate([r], day)[0]!;
  assert.equal(c.serviceDate, '2026-11-08'); assert.equal(c.date, day); assert.equal(c.arrivalMs, Date.parse(`${day}T00:10Z`));
  assert.equal(c.publicArrivalMs, Date.parse(`${day}T00:09Z`)); assert.equal(c.origin, 'YORK'); assert.equal(c.destination, 'KNGX'); assert.equal(c.platform, '10');
});
test('schedule: London summer and DST transitions use local wall time', () => {
  const r = record('P', [location('KNGX', '1000')]);
  assert.equal(callsForDate([r], '2026-07-01')[0]!.arrivalMs, Date.parse('2026-07-01T09:00Z'));
  assert.equal(callsForDate([r], '2026-03-29')[0]!.arrivalMs, Date.parse('2026-03-29T09:00Z'));
  assert.equal(callsForDate([r], '2026-10-25')[0]!.arrivalMs, Date.parse('2026-10-25T10:00Z'));
  assert.equal(callsForDate([record('P', [location('KNGX', '0130')])], '2026-03-29')[0]!.arrivalMs, null);
  assert.equal(callsForDate([record('P', [location('KNGX', '0130')])], '2026-10-25')[0]!.arrivalMs, Date.parse('2026-10-25T00:30Z'));
});
test('schedule: repeated headcodes match nearest call with a bounded deterministic tie', () => {
  const early = record(), late = record('P', [location('KNGX', '1500')], { CIF_train_uid: 'B12345' });
  const services = callsForDate([early, late], day);
  assert.equal(matchService('1A01', Date.parse(`${day}T15:02Z`), services)?.uid, 'B12345');
  assert.equal(matchService('1A01', Date.parse(`${day}T20:00Z`), services), undefined);
  assert.equal(matchService('2A01', Date.parse(`${day}T10:00Z`), services), undefined);
  assert.equal(matchService('1A01', Date.parse(`${day}T11:30Z`), services)?.uid, 'A12345');
  const tie = { ...services[0]!, uid: 'Z12345' };
  assert.equal(matchService('1A01', Date.parse(`${day}T10:00Z`), [tie, services[0]!])?.uid, 'A12345');
});

// PTAC as fleet evidence ahead of the booked diagrams. Every record and table here is invented
// (made-up headcodes, unit numbers and times); no real PTAC or diagram data is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEdinburghKinds } from '../../core/train-neutral.ts';
import type { FleetTable } from '../../core/edinburgh-diagrams.ts';
import { londonWallMs, matchPtac, ptacEvidence, ptacTimes, validatePtacStore } from '../../core/edinburgh-ptac.ts';
import type { PtacStore, PtacTrain } from '../../core/edinburgh-ptac.ts';
import type { TrainView } from '../../core/motion.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { fleetServiceFor, readFleetDocument, waverleyLampSubject } from '../src/edinburgh-live.ts';

const train = (over: Partial<PtacTrain> & { headcode: string }): PtacTrain => ({
  date: '2026-11-10', operator: 'SR', edbArr: null, edbDep: '2026-11-10T10:00:00', classes: ['385'],
  units: ['999101'], unitVehicles: [3], unitFleets: ['385/0'], ...over,
});
const store = (...trains: PtacTrain[]): PtacStore => validatePtacStore({ format: 'kx-ptac/1', area: 'EB', updatedAt: '2026-11-10T00:00:00.000Z',
  trains: Object.fromEntries(trains.map((t, i) => [`${t.date} ${t.headcode} Z0000${i}`, t])) });
// Booked diagrams for the same headcodes, deliberately different from PTAC, so the source that answered shows.
const booked: FleetTable = { source: 'synthetic', builtAt: '2026-11-10T00:00:00.000Z', workings: [
  { headcode: '1Z01', days: 'SX', edinburghMinutes: [600], units: [{ diagram: 'ZZ101', class: '385', cars: 4 }] },
  { headcode: '1Z02', days: 'SX', edinburghMinutes: [600], units: [{ diagram: 'ZZ102', class: '385', cars: 4 }] },
  { headcode: '1Z03', days: 'SX', edinburghMinutes: [600], units: [{ diagram: 'ZZ103', class: '385', cars: 3 }] },
] };
const TUE_10 = Date.UTC(2026, 10, 10, 10, 0); // 10:00 GMT = 10:00 London, a Tuesday
const choose = (serviceFor: ReturnType<typeof fleetServiceFor>, description: string, atMs: number, id = 1) => {
  const kinds = createEdinburghKinds(serviceFor, { rows: EDINBURGH_FLEET });
  kinds.lengthM(description, { id, timeMs: atMs });
  return kinds.formationFor({ id })!;
};

test('London wall times become instants in GMT and BST', () => {
  assert.equal(londonWallMs('2026-11-10T10:00:00'), TUE_10);
  assert.equal(londonWallMs('2026-07-01T10:00:00'), Date.UTC(2026, 6, 1, 9, 0));
  assert.ok(Number.isNaN(londonWallMs('10:00')));
});

test('a PTAC match wins over the booked diagram and is labelled PTAC allocation', () => {
  const ptac = store(train({ headcode: '1Z01', edbDep: '2026-11-10T10:05:00' }));
  assert.deepEqual(matchPtac(ptac, '1Z01', TUE_10), { operator: 'SR', class: '385', cars: 3, units: [{ class: '385', cars: 3 }], basis: 'PTAC allocation' });
  const choice = choose(fleetServiceFor(() => ptac, () => booked), '1Z01', TUE_10);
  assert.equal(choice.kind, 'sr385x3', 'PTAC says 3 cars; the diagram says 4');
  assert.equal(choice.allocation, 'PTAC allocation');
  assert.equal(choice.label, 'ScotRail Class 385 · 3 cars · PTAC allocation');
  assert.doesNotMatch(choice.label, /booked diagram/);
  // Outside the 30-minute window, or another headcode, PTAC has no answer.
  assert.equal(matchPtac(ptac, '1Z01', TUE_10 + 36 * 60_000), undefined);
  assert.equal(matchPtac(ptac, '1Z09', TUE_10), undefined);
});

test('a PTAC miss falls through to the booked diagrams', () => {
  const ptac = store(train({ headcode: '1Z01', edbDep: '2026-11-10T18:00:00' }));
  const serviceFor = fleetServiceFor(() => ptac, () => booked);
  const late = choose(serviceFor, '1Z02', TUE_10);
  assert.deepEqual([late.kind, late.allocation, late.label], ['sr385x4', 'booked diagram', 'ScotRail Class 385 · 4 cars · booked diagram']);
  assert.equal(choose(serviceFor, '1Z01', TUE_10).allocation, 'booked diagram', 'PTAC has the headcode, but not at this time');
  assert.equal(choose(fleetServiceFor(() => undefined, () => booked), '1Z03', TUE_10).kind, 'sr385x3', 'no PTAC store at all');
  assert.equal(choose(fleetServiceFor(() => undefined, () => undefined), '1Z03', TUE_10).kind, 'neutral');
});

test('an unmapped operator stays neutral, and the diagrams do not overrule PTAC', () => {
  const ptac = store(train({ headcode: '1Z03', operator: null }));
  assert.equal(matchPtac(ptac, '1Z03', TUE_10)?.operator, undefined);
  const choice = choose(fleetServiceFor(() => ptac, () => booked), '1Z03', TUE_10);
  assert.deepEqual([choice.kind, choice.allocation], ['neutral', 'assumed fleet']);
});

test('a coupled 3+4 is two units, each with its own class and vehicles, in PTAC order with the order ASSUMED', () => {
  const ptac = store(train({ headcode: '1Z02', units: ['999103', '999204'], unitVehicles: [3, 4], unitFleets: ['385/0', '385/1'] }));
  assert.deepEqual(matchPtac(ptac, '1Z02', TUE_10), { operator: 'SR', units: [{ class: '385', cars: 3 }, { class: '385', cars: 4 }], orderAssumed: true, basis: 'PTAC allocation' });
  const choice = choose(fleetServiceFor(() => ptac, () => booked), '1Z02', TUE_10);
  assert.equal(choice.kind, 'sr385x3+sr385x4');
  assert.equal(choice.label, 'ScotRail Class 385 · 3+4 cars · PTAC allocation · order ASSUMED');
  // Identical units have no order to get wrong.
  assert.equal(ptacEvidence(train({ headcode: '1Z02', units: ['999103', '999104'], unitVehicles: [3, 3], unitFleets: ['385/0', '385/0'] }))!.orderAssumed, undefined);
});

test('a unit with no readable class gives no PTAC evidence; old records without unitFleets work only for one class', () => {
  assert.equal(ptacEvidence(train({ headcode: '1Z04', units: ['a', 'b'], unitVehicles: [2, 3], unitFleets: ['158/7', null] })), undefined);
  const { unitFleets: _drop, ...old } = train({ headcode: '1Z04', units: ['a', 'b'], unitVehicles: [3, 4] });
  assert.deepEqual(ptacEvidence(old)?.units, [{ class: '385', cars: 3 }, { class: '385', cars: 4 }]);
  assert.equal(ptacEvidence({ ...old, classes: ['158', '170'] }), undefined, 'mixed classes need per-unit fleets');
});

test('two different PTAC answers at the same distance are no answer', () => {
  const ptac = store(train({ headcode: '1Z05', edbDep: '2026-11-10T09:50:00' }), train({ headcode: '1Z05', edbDep: '2026-11-10T10:10:00', unitVehicles: [4], unitFleets: ['385/1'] }));
  assert.equal(matchPtac(ptac, '1Z05', TUE_10), undefined);
  assert.equal(matchPtac(ptac, '1Z05', TUE_10 + 5 * 60_000)?.cars, 4, 'the nearer one wins');
});

test('the store check drops malformed records and refuses what is not a kx-ptac/1 store', () => {
  const good = train({ headcode: '1Z06' });
  const checked = validatePtacStore({ format: 'kx-ptac/1', trains: { a: good, b: { ...good, headcode: 'x' }, c: { ...good, unitVehicles: [3, 3] }, d: { ...good, edbDep: null }, e: null } });
  assert.deepEqual(Object.keys(checked.trains), ['a']);
  for (const value of [null, [], { format: 'kx-ptac/2', trains: {} }, { format: 'kx-ptac/1', trains: [] }]) assert.throws(() => validatePtacStore(value), /ptac store/);
});

test('the /fleet document is read section by section', () => {
  const ptac = { format: 'kx-ptac/1', trains: { a: train({ headcode: '1Z07' }) } };
  assert.equal(readFleetDocument({ booked, ptac }).note, 'fleet: PTAC allocation (1 trains) + booked diagrams (3 workings)');
  assert.equal(readFleetDocument({ booked: null, ptac }).note, 'fleet: PTAC allocation (1 trains)');
  assert.equal(readFleetDocument({ booked: { ...booked, extra: 1 }, ptac }).note, 'fleet: PTAC allocation (1 trains) (booked table invalid)');
  assert.equal(readFleetDocument({ booked, ptac: { format: 'x' } }).booked, booked);
  for (const body of [booked, { booked: null, ptac: null }, { booked }, { booked: null, ptac: null, x: 1 }, null, []]) assert.throws(() => readFleetDocument(body));
});

test('PTAC keeps a train\'s Edinburgh times: a through train has both, and only a through train standing at a platform berth gets its cab lamps planned', () => {
  const ptac = store(
    train({ headcode: '1Z05', edbArr: '2026-11-10T09:56:00', edbDep: '2026-11-10T10:00:00' }),
    train({ headcode: '1Z06', edbArr: '2026-11-10T09:58:00', edbDep: null }),
    // two records of one headcode, equally near, with different times: no answer
    train({ headcode: '1Z07', edbArr: null, edbDep: '2026-11-10T10:04:00' }), train({ headcode: '1Z07', edbArr: null, edbDep: '2026-11-10T09:56:00', units: ['999102'] }));
  assert.deepEqual(ptacTimes(ptac, '1Z05', TUE_10), { arrivalMs: TUE_10 - 4 * 60_000, departureMs: TUE_10 });
  assert.deepEqual(ptacTimes(ptac, '1Z06', TUE_10), { arrivalMs: TUE_10 - 2 * 60_000, departureMs: null });
  assert.equal(ptacTimes(ptac, '1Z07', TUE_10), undefined);
  assert.equal(ptacTimes(ptac, '1Z05', TUE_10 + 40 * 60_000), undefined, 'outside the window');
  const view = (description: string, over: Partial<TrainView> = {}): TrainView => ({ id: 3, description, leading: { point: [10, 20] } as TrainView['leading'], heading: 0, speed: 0,
    lengthM: 100, occupiedLengthM: 100, occupied: [], state: 'held', opacity: 1, targetBerth: 'S1', lastBerth: 'S1', blocked: false, distanceM: 50, reversals: 0, ...over });
  const stops = { platformBerths: true, pointOf: (berth: string): [number, number] | undefined => berth === 'S1' ? [10, 21] : undefined };
  const at = TUE_10 - 5 * 60_000;
  assert.deepEqual(waverleyLampSubject(view('1Z05'), ptacTimes(ptac, '1Z05', at), stops, at),
    { subject: { id: 3, description: '1Z05', reversals: 0, atPlatform: true }, departure: { departureMs: TUE_10, source: 'ptac' } }, 'a through train at its platform');
  assert.equal(waverleyLampSubject(view('1Z06'), ptacTimes(ptac, '1Z06', at), stops, at).subject.atPlatform, false, 'a terminating train is left in service state');
  assert.equal(waverleyLampSubject(view('1Z05', { lastBerth: 'S2' }), ptacTimes(ptac, '1Z05', at), stops, at).subject.atPlatform, false, 'not a platform berth');
  assert.equal(waverleyLampSubject(view('1Z05', { blocked: true }), ptacTimes(ptac, '1Z05', at), stops, at).subject.atPlatform, false, 'held short behind another train');
  assert.equal(waverleyLampSubject(view('1Z05', { leading: { point: [10, 40] } as TrainView['leading'] }), ptacTimes(ptac, '1Z05', at), stops, at).subject.atPlatform, false, 'its nose is not at the berth');
  assert.equal(waverleyLampSubject(view('1Z05', { state: 'moving' }), ptacTimes(ptac, '1Z05', at), stops, at).subject.atPlatform, false, 'moving');
  // anchors with no platform berths: any berth's anchor, from shortly before the planned arrival
  const anyStop = { platformBerths: false, pointOf: (): [number, number] => [10, 21] };
  assert.equal(waverleyLampSubject(view('1Z05'), ptacTimes(ptac, '1Z05', at), anyStop, at).subject.atPlatform, true);
  const early = TUE_10 - 15 * 60_000;
  assert.equal(waverleyLampSubject(view('1Z05'), ptacTimes(ptac, '1Z05', early), anyStop, early).subject.atPlatform, false, 'held outside, before its arrival');
});

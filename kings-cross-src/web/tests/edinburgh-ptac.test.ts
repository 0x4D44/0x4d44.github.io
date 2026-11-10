// PTAC as fleet evidence ahead of the booked diagrams. Every record and table here is invented
// (made-up headcodes, unit numbers and times); no real PTAC or diagram data is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEdinburghKinds } from '../../core/train-neutral.ts';
import type { FleetTable } from '../../core/edinburgh-diagrams.ts';
import { londonWallMs, matchPtac, ptacEvidence, validatePtacStore } from '../../core/edinburgh-ptac.ts';
import type { PtacStore, PtacTrain } from '../../core/edinburgh-ptac.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { fleetServiceFor, readFleetDocument } from '../src/edinburgh-live.ts';

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

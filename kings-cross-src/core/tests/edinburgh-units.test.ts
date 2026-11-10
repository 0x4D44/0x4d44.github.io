import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEdinburghKinds, rowsForEvidence } from '../train-neutral.ts';
import type { EdinburghKindRow, EdinburghLayout, EdinburghServiceEvidence } from '../train-neutral.ts';

// Synthetic unit layouts: each car 20 m, bogies 3 m in from each end, cabs at both unit ends.
const unit = (n: number): EdinburghLayout => ({ length: 20 * n, cars: Array.from({ length: n }, (_, i) => ({
  index: i, start: 20 * i, end: 20 * i + 20, length: 20, bogies: [20 * i + 3, 20 * i + 17] as const,
  cab: i === 0 ? 'front' as const : i === n - 1 ? 'rear' as const : null,
})) });
const row = (kind: string, operator: string, classes: string[], cars: number): EdinburghKindRow => ({ kind, operator, operatorName: operator === 'SR' ? 'ScotRail' : operator, classes, cars, layout: () => unit(cars) });
const ROWS = [row('sr385x3', 'SR', ['385'], 3), row('sr385x4', 'SR', ['385'], 4), row('stub158x2', 'SR', ['158'], 2)];
const choose = (evidence: EdinburghServiceEvidence) => {
  const kinds = createEdinburghKinds(() => evidence, { rows: ROWS });
  kinds.lengthM('1A00', { id: 7, timeMs: 0 });
  return kinds.formationFor({ id: 7 })!;
};
const u = (cls: string, cars: number) => ({ class: cls, cars });

test('coupled 385s: 3+3, 3+4 and 4+4 become two whole units end to end, cars numbered along the train', () => {
  const x33 = choose({ operator: 'SR', units: [u('385', 3), u('385', 3)], basis: 'booked diagram' });
  assert.equal(x33.kind, 'sr385x3+sr385x3');
  assert.deepEqual(x33.units, [{ kind: 'sr385x3', offset: 0, cars: 3 }, { kind: 'sr385x3', offset: 60, cars: 3 }]);
  assert.equal(x33.lengthM, 120);
  assert.deepEqual(x33.layout.cars.map(c => [c.index, c.start, c.end, c.bogies[0], c.bogies[1], c.cab]), [
    [0, 0, 20, 3, 17, 'front'], [1, 20, 40, 23, 37, null], [2, 40, 60, 43, 57, 'rear'],
    [3, 60, 80, 63, 77, 'front'], [4, 80, 100, 83, 97, null], [5, 100, 120, 103, 117, 'rear'],
  ]);
  assert.equal(x33.label, 'ScotRail Class 385 · 3+3 cars · booked diagram');

  const x34 = choose({ operator: 'SR', units: [u('385', 3), u('385', 4)], orderAssumed: true, basis: 'booked diagram' });
  assert.deepEqual([x34.kind, x34.lengthM, x34.layout.cars.length, x34.units.map(v => v.offset)], ['sr385x3+sr385x4', 140, 7, [0, 60]]);
  assert.match(x34.label, /3\+4 cars · booked diagram · order ASSUMED$/);
  assert.match(x34.note, /order is ASSUMED/);

  const x44 = choose({ operator: 'SR', units: [u('385', 4), u('385', 4)], basis: 'PTAC allocation' });
  assert.deepEqual([x44.kind, x44.lengthM, x44.allocation, /order ASSUMED/.test(x44.label)], ['sr385x4+sr385x4', 160, 'PTAC allocation', false]);
});

test('if any unit has no row the whole train stays neutral: no partial mixes', () => {
  for (const units of [[u('385', 3), u('385', 5)], [u('385', 3), u('170', 3)], [u('385', 4), u('158', 3)], []]) {
    const c = choose({ operator: 'SR', units, basis: 'booked diagram' });
    assert.deepEqual([c.kind, c.units.length, c.allocation], ['neutral', 0, 'assumed fleet'], JSON.stringify(units));
  }
  assert.equal(rowsForEvidence(ROWS, { units: [u('385', 3)] }), undefined, 'no operator');
  assert.equal(choose({ operator: 'GR', units: [u('385', 3), u('385', 3)] }).kind, 'neutral', 'wrong operator');
});

test('a 2+2 class 158 pair from a stub row, and a single unit given as a units list', () => {
  const pair = choose({ operator: 'SR', units: [u('158', 2), u('158', 2)], basis: 'PTAC allocation' });
  assert.deepEqual([pair.kind, pair.lengthM, pair.layout.cars.map(c => c.index)], ['stub158x2+stub158x2', 80, [0, 1, 2, 3]]);
  assert.equal(pair.label, 'ScotRail Class 158 · 2+2 cars · PTAC allocation');
  const single = choose({ operator: 'SR', units: [u('385', 4)] });
  assert.deepEqual([single.kind, single.lengthM, single.units], ['sr385x4', 80, [{ kind: 'sr385x4', offset: 0, cars: 4 }]]);
  // `units` wins over the single-unit fields when both are given
  assert.equal(choose({ operator: 'SR', class: '385', cars: 3, units: [u('385', 4)] }).kind, 'sr385x4');
});

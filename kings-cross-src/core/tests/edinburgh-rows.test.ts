import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KX_REUSED_ROWS, checkEdinburghRows, createEdinburghKinds, rowForEvidence } from '../train-neutral.ts';
import type { EdinburghKindRow } from '../train-neutral.ts';

const layout = () => ({ length: 40, cars: [{ index: 0, start: 0, end: 20, length: 20, bogies: [3, 17] as const, cab: 'front' as const }, { index: 1, start: 20, end: 40, length: 20, bogies: [23, 37] as const, cab: 'rear' as const }] });
const row = (kind: string, operator: string, classes: string[], cars: number): EdinburghKindRow => ({ kind, operator, operatorName: operator, classes, cars, layout });

test('the row table refuses a duplicate kind, a reserved kind, a missing class and two rows for one piece of evidence', () => {
  const bad: EdinburghKindRow[][] = [
    [row('a', 'SR', ['385'], 3), row('a', 'SR', ['385'], 4)],
    [row('neutral', 'SR', ['385'], 3)],
    [row('a', 'SR', [], 3)],
    [row('a', 'SR', ['385'], 0)],
    [row('a', 'SR', ['385'], 3), row('b', 'SR', ['380', '385'], 3)],
  ];
  assert.deepEqual(bad.map(rows => { try { checkEdinburghRows(rows); return false; } catch { return true; } }), bad.map(() => true));
  assert.doesNotThrow(() => checkEdinburghRows([...KX_REUSED_ROWS, row('a', 'SR', ['385'], 3), row('b', 'SR', ['385'], 4)]));
});

test('a row needs operator, class and car count all present and all matching', () => {
  const rows = [row('x3', 'SR', ['385'], 3), row('x4', 'SR', ['385'], 4)];
  assert.deepEqual([
    { operator: 'SR', class: '385', cars: 3 }, { operator: 'SR', class: '385', cars: 4 }, { operator: 'SR', class: '385', cars: 6 },
    { operator: 'SR', class: '385' }, { operator: 'SR', cars: 3 }, { class: '385', cars: 3 }, { operator: 'GR', class: '385', cars: 3 }, undefined,
  ].map(e => rowForEvidence(rows, e)?.kind), ['x3', 'x4', undefined, undefined, undefined, undefined, undefined, undefined]);
});

test('a booked diagram picks the row and says so in the allocation and the label; the default basis stays service evidence', () => {
  const rows = [row('x3', 'SR', ['385'], 3)];
  const booked = createEdinburghKinds(() => ({ operator: 'SR', class: '385', cars: 3, basis: 'booked diagram' }), { rows });
  booked.lengthM('2Y10', { id: 1, timeMs: 0 });
  const plain = createEdinburghKinds(() => ({ operator: 'SR', class: '385', cars: 3 }), { rows });
  plain.lengthM('2Y10', { id: 1, timeMs: 0 });
  const b = booked.formationFor({ id: 1 })!, p = plain.formationFor({ id: 1 })!;
  assert.deepEqual([b.kind, b.allocation, b.lengthM, /booked diagram/.test(b.label), p.allocation], ['x3', 'booked diagram', 40, true, 'service evidence']);
});

test('createEdinburghKinds refuses an inconsistent row table up front', () => {
  assert.throws(() => createEdinburghKinds(undefined, { rows: [row('a', 'SR', ['385'], 3), row('b', 'SR', ['385'], 3)] }), /matches two kinds/);
});

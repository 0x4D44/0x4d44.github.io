import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLightField, LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE } from '../light-field.ts';
import type { LightField } from '../light-field.ts';
import { testRoadLight as light } from './light-field-fixture.ts';

function cell(field: LightField, x: number, z: number): number[] {
  const col = Math.floor((x - field.origin[0]) / field.spec.cellM);
  const row = Math.floor((z - field.origin[1]) / field.spec.cellM);
  assert.ok(col >= 0 && col < field.columns && row >= 0 && row < field.rows, 'cell exists');
  const view = new DataView(field.grid.buffer);
  const offset = view.getUint32(4 * (row * field.columns + col), true);
  const count = view.getUint16(offset * 2, true);
  return Array.from({ length: count }, (_, i) => view.getUint16((offset + i + 1) * 2, true));
}

test('the field includes a source on both sides of a cell boundary and leaves distant cells empty', () => {
  const field = buildLightField([light('A', [-8, 10.15, 0]), light('B', [120, 12, 120])], LIGHT_GRID_DESKTOP);
  assert.deepEqual(cell(field, -8.001, 0), [0]);
  assert.deepEqual(cell(field, -7.999, 0), [0]);
  assert.deepEqual(cell(field, 50, 50), []);
  assert.deepEqual(cell(field, 120, 120), [1]);
  assert.deepEqual([...field.data.subarray(0, 3)], [-8, Math.fround(10.15), 0]);
});

test('overflow keeps the strongest lights and breaks ties by stable id on both grids', () => {
  const sources = Array.from({ length: 30 }, (_, i) => light(String(i).padStart(2, '0')));
  sources[29] = { ...sources[29]!, lumens: 18000 };
  for (const spec of [LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE]) {
    const a = buildLightField(sources, spec);
    const b = buildLightField(sources.toReversed(), spec);
    assert.equal(a.maxCandidates, 30);
    assert.ok(a.overflowingCells > 0);
    const ids = (f: LightField) => cell(f, 0, 0).map(i => f.sources[i]!.id);
    assert.deepEqual(ids(a), ['29', ...sources.slice(0, spec.cap - 1).map(v => v.id)]);
    assert.deepEqual(ids(b), ids(a));
    assert.deepEqual(a.grid, b.grid);
  }
});

test('cell offsets cross 65535 slots and lamp indices cross 255 without truncation', () => {
  const sources = Array.from({ length: 300 }, (_, i) => light(String(i).padStart(3, '0'), [i * 6, 10.15, 0]));
  const field = buildLightField(sources, { cellM: 2, cap: 16 });
  const view = new DataView(field.grid.buffer);
  const maxOffset = Array.from({ length: field.columns * field.rows }, (_, i) => view.getUint32(i * 4, true))
    .reduce((a, b) => Math.max(a, b), 0);
  assert.ok(maxOffset > 65535, String(maxOffset));
  assert.ok(cell(field, 1794, 0).includes(299));
  assert.ok(Math.max(field.gridWidth, field.gridHeight, field.dataWidth, field.dataHeight) <= 2048);
});

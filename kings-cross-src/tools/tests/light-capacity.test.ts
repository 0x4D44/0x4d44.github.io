import assert from 'node:assert/strict';
import test from 'node:test';
import type { LightSource } from '../../core/light-sources.ts';

test('the grid counts boundary candidates, caps by irradiance and breaks equal scores by id', async () => {
  const { lightGrid, measureCap } = await import('../light-capacity.ts');
  const sources: LightSource[] = Array.from({ length: 9 }, (_, i) => ({
    id: `kx/test/${i}`, station: 'kx', pos: [8, 4, 4], footY: 0, yaw: 0, spectrum: 'led-4000',
    lumens: i === 0 ? 1000 : 2000, optic: { kind: 'downlight', halfAngleDeg: 60, softDeg: 10, radiusM: 6 },
    cover: 'open', tags: [],
  }));
  const grid = lightGrid(sources.toReversed(), 8);
  const cell = grid.cells.get('0,0')!;
  assert.equal(cell.length, 9);
  assert.deepEqual(cell.slice(0, 8).map(v => v.source.id), sources.slice(1).map(s => s.id));
  const at = measureCap(grid, [{ pos: [8, 0, 4], covered: false }], 8);
  assert.equal(at.samples, 1);
  assert.ok(Math.abs(at.droppedPercent - 100 / 17) < 1e-10);
  assert.equal(measureCap(grid, [{ pos: [8, 0, 4], covered: true }], 8).unlimitedLux, 0);
  assert.equal(measureCap(grid, [{ pos: [8, -5, 4], covered: false }], 8).unlimitedLux, 0);
});

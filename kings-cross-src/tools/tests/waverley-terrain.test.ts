import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createTerrain, decodeGrid } from '../../core/terrain.ts';
import { buildWaverleyTerrain } from '../build-waverley-terrain.ts';

test('synthetic DTM preserves slopes relative to reference ground, without warping', async () => {
  const file = await buildWaverleyTerrain(async (x,z) => 50 + x / 10 + z / 20, {x0:-16,z0:-16,x1:16,z1:16});
  const terrain = createTerrain(file);
  assert.equal(file.datumAod, 50.2);
  assert.ok(Math.abs(terrain.heightAt(0,0) + 0.2) < 1e-6);
  assert.ok(Math.abs(terrain.heightAt(16,16) - 2.2) < 1e-6);
});

test('missing DTM coverage is rejected explicitly', async () => {
  await assert.rejects(buildWaverleyTerrain(async (x) => x > 0 ? null : 50, {x0:-16,z0:-16,x1:16,z1:16}), /missing DTM/);
});

test('committed terrain is compact, finite, measured and covers the Waverley study area', () => {
  const json = readFileSync(new URL('../../web/src/data/waverley-terrain.json', import.meta.url), 'utf8');
  const file = JSON.parse(json);
  assert.ok(gzipSync(json).length < 30000);
  assert.equal(file.provenance.crs, 'EPSG:27700');
  assert.equal(file.provenance.sourceResolutionM, 0.5);
  assert.equal(file.provenance.missingSamples, 0);
  assert.equal(file.provenance.railwayWarp, false);
  assert.equal(file.provenance.sampleCount, file.grids[0].nx * file.grids[0].nz);
  const grid = decodeGrid(file.grids[0]);
  assert.ok(grid.h.every(Number.isFinite));
  assert.ok(Math.max(...grid.h) - Math.min(...grid.h) > 30);
  assert.ok(file.extent.x0 < -900 && file.extent.x1 > 1000);
  assert.ok(file.extent.z0 < -600 && file.extent.z1 > 590);
  assert.ok(Math.abs(createTerrain(file).heightAt(0,0) + 0.2) < 0.06);
});

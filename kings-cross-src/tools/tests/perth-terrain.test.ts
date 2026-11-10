import test from 'node:test';
import assert from 'node:assert/strict';
import { PERTH_TERRAIN_EXTENT, PERTH_TERRAIN_SITE, WATER_RINGS, sampleOrBank } from '../build-perth-terrain.ts';
import { buildWaverleyTerrain } from '../build-waverley-terrain.ts';
import { PERTH_TILES } from '../build-perth.ts';
import { PERTH_BBOX } from '../../core/perth-data.ts';

test('a valid pixel is its own sample; a nodata pixel takes the lowest valid pixel on the nearest ring that has one', async () => {
  // Ground 10 m everywhere except a 20 m wide river (nodata) along e 0..20, whose banks fall to 3 m at e -2 and 5 m at e 22.
  const at = async (e: number, n: number) => e >= 0 && e <= 20 ? null : e < 0 ? (e > -3 ? 3 : 10) : (e < 23 ? 5 : 10);
  assert.equal(await sampleOrBank(at, -10, 0), 10);
  assert.equal(await sampleOrBank(at, 1, 0), 3, 'near the west bank: the 2 m ring reaches it');
  assert.equal(await sampleOrBank(at, 10, 0), 3, 'mid-river: the 16 m ring reaches both banks, and the lower is taken');
  assert.equal(await sampleOrBank(async () => null, 0, 0), null, 'nothing within the last ring: refused, not invented');
  assert.equal(WATER_RINGS.at(-1), 128);
});

test('the Perth terrain file is the shared Scottish builder with Perth\'s site: origin, Phase I tiles, its nodata rule stated', async () => {
  const file = await buildWaverleyTerrain(async (x, z) => 20 + x / 100 + z / 200, { x0: -16, z0: -16, x1: 16, z1: 16 }, PERTH_TERRAIN_SITE);
  assert.deepEqual(file.provenance.origin, PERTH_TERRAIN_SITE.origin);
  assert.equal(file.provenance.sourceResolutionM, 1);
  assert.match(file.source, /Phase I 1 m DTM, 16 m nearest-pixel lattice/);
  assert.match(file.attribution, /accessed 2026-11-10/);
  assert.match(file.provenance.method, /LOWEST valid native pixel on the nearest of the rings 2, 4, 8, 16, 32, 64, 128 m/);
  assert.ok((PERTH_TERRAIN_EXTENT.x1 - PERTH_TERRAIN_EXTENT.x0) % 16 === 0 && (PERTH_TERRAIN_EXTENT.z1 - PERTH_TERRAIN_EXTENT.z0) % 16 === 0, 'whole 16 m steps');
});

test('the six OSM tiles cover the Perth bbox exactly, edge to edge', () => {
  const [s, w, n, e] = PERTH_BBOX;
  assert.equal(PERTH_TILES.length, 6);
  const area = PERTH_TILES.reduce((sum, t) => sum + (t.bbox[2]! - t.bbox[0]!) * (t.bbox[3]! - t.bbox[1]!), 0);
  assert.ok(Math.abs(area - (e - w) * (n - s)) < 1e-9);
  assert.equal(Math.min(...PERTH_TILES.map(t => t.bbox[0]!)), w); assert.equal(Math.max(...PERTH_TILES.map(t => t.bbox[2]!)), e);
  assert.equal(Math.min(...PERTH_TILES.map(t => t.bbox[1]!)), s); assert.equal(Math.max(...PERTH_TILES.map(t => t.bbox[3]!)), n);
  for (const t of PERTH_TILES) assert.ok((t.bbox[2]! - t.bbox[0]!) * (t.bbox[3]! - t.bbox[1]!) < 0.25, 'each under the map API area limit');
});

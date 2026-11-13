import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { project } from '../../core/geo.ts';
import { PERTH_BBOX, PERTH_ORIGIN } from '../../core/perth-data.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { decodeCityHeights } from '../build-waverley-city-heights.ts';
import { inExtent } from '../build-perth-city-heights.ts';
import { PERTH_WEST_TILES } from '../build-perth-west.ts';
import { PERTH_WEST_EXTENT } from '../perth-west-extent.ts';
import { PERTH_WEST_AREA, PERTH_WEST_BBOX, PERTH_WEST_REGION, touchesRegion } from '../perth-west-region.ts';

const read = (name: string) => readFileSync(new URL(`../../web/src/data/${name}`, import.meta.url), 'utf8');
const west = unpackWaverleyScene(JSON.parse(read('perth-scene-west.json')));
const context = unpackWaverleyScene(JSON.parse(read('perth-scene.json')));
const heights = JSON.parse(read('perth-city-heights-west.json')) as { source: Record<string, unknown>; q: number; ids: { way: number[]; relation: string[] }; h: number[]; r: number[]; landmarks?: unknown };

test('the shared extent is the one every lane has (widened to x0 -3232 by the lead, 2026-11-13 17:58Z), byte for byte, and is never redefined', () => {
  assert.equal(readFileSync(new URL('../perth-west-extent.ts', import.meta.url), 'utf8'), `import type { Extent } from '../core/terrain.ts';

/** West extension (Perth frame, x east, z south, metres): from the context extent's west edge (x -1200) out past the
 *  A9 western bypass (OSM: the A9 runs at x -3150..-2770 from z -1600 to 200; Broxden roundabout centre about x -2995, z 360), in whole 16 m steps. */
export const PERTH_WEST_EXTENT: Extent = { x0: -3232, z0: -1600, x1: -1200, z1: 1232 };
`);
  assert.deepEqual(PERTH_WEST_EXTENT, { x0: -3232, z0: -1600, x1: -1200, z1: 1232 });
});

test('the OSM cut runs from the extent out to the context scene\'s own west edge, so no strip is in neither', () => {
  const [S, W, N, E] = PERTH_WEST_BBOX;
  const north = project(N, W, PERTH_ORIGIN)[1], south = project(S, W, PERTH_ORIGIN)[1], westX = project(S, W, PERTH_ORIGIN)[0];
  assert.ok(north <= PERTH_WEST_EXTENT.z0 && north > PERTH_WEST_EXTENT.z0 - 20, `north edge z ${north}`);
  assert.ok(south >= PERTH_WEST_EXTENT.z1 && south < PERTH_WEST_EXTENT.z1 + 20, `south edge z ${south}`);
  assert.ok(westX <= PERTH_WEST_EXTENT.x0 && westX > PERTH_WEST_EXTENT.x0 - 20, `west edge x ${westX}`);
  assert.equal(E, PERTH_BBOX[1], 'east edge: the context scene\'s west edge');
  // the context scene's OSM cut stops 178 m east of the extent's own east edge (x -1200): the region covers that strip
  const strip = PERTH_WEST_REGION.x1 - PERTH_WEST_EXTENT.x1;
  assert.ok(strip > 170 && strip < 185, `strip ${strip} m`);
  assert.deepEqual({ ...PERTH_WEST_REGION, x1: PERTH_WEST_EXTENT.x1 }, PERTH_WEST_EXTENT);
  assert.deepEqual(PERTH_WEST_AREA.bbox, PERTH_WEST_BBOX);
  assert.equal(PERTH_WEST_AREA.origin, PERTH_ORIGIN);
});

test('the map API tiles tile the cut exactly (every cell of their edge lattice in exactly one tile), none larger than the context scene\'s, the original six as fetched', () => {
  const [S, W, N, E] = PERTH_WEST_BBOX;
  assert.equal(PERTH_WEST_TILES.length, 9);
  assert.equal(new Set(PERTH_WEST_TILES.map(t => t.name)).size, 9, 'names are unique (they are the raw files)');
  for (const { name, bbox: [w, s, e, n] } of PERTH_WEST_TILES) assert.ok(e! > w! && n! > s! && e! - w! <= 0.02 && n! - s! <= 0.01, `${name}: not empty, and no bigger than a context tile (0.02 x 0.01 degrees)`);
  // the edge lattice spans the cut, and every cell between consecutive edges is in exactly one tile: no gap and no overlap
  const lons = [...new Set(PERTH_WEST_TILES.flatMap(t => [t.bbox[0]!, t.bbox[2]!]))].sort((a, b) => a - b);
  const lats = [...new Set(PERTH_WEST_TILES.flatMap(t => [t.bbox[1]!, t.bbox[3]!]))].sort((a, b) => a - b);
  assert.equal(lons[0], W); assert.equal(lons.at(-1), E); assert.equal(lats[0], S); assert.equal(lats.at(-1), N);
  for (let i = 0; i + 1 < lons.length; i++) for (let j = 0; j + 1 < lats.length; j++) {
    const x = (lons[i]! + lons[i + 1]!) / 2, y = (lats[j]! + lats[j + 1]!) / 2;
    const holding = PERTH_WEST_TILES.filter(({ bbox: [w, s, e, n] }) => x > w! && x < e! && y > s! && y < n!);
    assert.equal(holding.length, 1, `cell ${i},${j} at ${x.toFixed(5)}, ${y.toFixed(5)} is in ${holding.length} tiles`);
  }
  // the raw tiles on disk are named and never checked against a bbox: the original six keep the bboxes they were fetched with (2026-11-13 15:21Z)
  assert.deepEqual(PERTH_WEST_TILES.slice(0, 6).map(t => `${t.name} ${t.bbox.join(',')}`), [
    'w00 -3.4839,56.3803,-3.4694,56.3888', 'w01 -3.4694,56.3803,-3.455,56.3888', 'w10 -3.4839,56.3888,-3.4694,56.3974',
    'w11 -3.4694,56.3888,-3.455,56.3974', 'w20 -3.4839,56.3974,-3.4694,56.4059', 'w21 -3.4694,56.3974,-3.455,56.4059']);
});

test('the west scene: buildings and mapped roofs only, none the context scene already holds, all touching the cut', () => {
  assert.equal(west.rails.length, 0); assert.equal(west.platforms.length, 0);
  assert.ok(west.buildings.length > 5800 && west.buildings.length < 7000, `${west.buildings.length} buildings`);
  assert.ok(west.roofs.length >= 1 && west.roofs.length < 50);
  const ids = [...west.buildings, ...west.roofs].map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const held = new Set([...context.buildings, ...context.roofs].map(b => b.id));
  assert.deepEqual(ids.filter(id => held.has(id)), [], 'a block the context scene draws is not drawn again');
  const R = PERTH_WEST_REGION;
  for (const b of [...west.buildings, ...west.roofs]) {
    const xs = b.outer.map(p => p[0]), zs = b.outer.map(p => p[1]);
    assert.ok(Math.max(...xs) >= R.x0 && Math.min(...xs) <= R.x1 && Math.max(...zs) >= R.z0 && Math.min(...zs) <= R.z1, `${b.id} touches the region (the map API cut is rounded outward and returns a few blocks past the extent's edge)`);
    assert.ok(touchesRegion(b), `${b.id}: the builder's own test agrees`);
  }
  // the 178 m between the extent and the context cut is filled, not bare
  const strip = west.buildings.filter(b => { const x = b.outer.reduce((s, p) => s + p[0], 0) / b.outer.length; return x > PERTH_WEST_EXTENT.x1 && x < PERTH_WEST_REGION.x1; });
  assert.ok(strip.length > 100, `${strip.length} blocks in the strip`);
  // the widening to x -3232 (the A9 bypass inside the extent): the land west of the first cut's edge (x -2800) is filled, not bare
  const widened = west.buildings.filter(b => b.outer.reduce((s, p) => s + p[0], 0) / b.outer.length < -2800);
  assert.ok(widened.length > 500, `${widened.length} blocks west of x -2800`);
  assert.match(west.attribution, /OpenStreetMap contributors \(ODbL\)/); assert.match(west.source.license, /ODbL/);
  assert.deepEqual(west.bbox, PERTH_WEST_BBOX);
});

test('the west heights file: Phase I LiDAR credited, the region recorded, only the west scene\'s own ASSUMED-height blocks', () => {
  assert.equal(heights.q, 0.5);
  assert.equal(heights.landmarks, undefined, 'the west file carries no landmark peaks');
  assert.deepEqual(heights.source.extent, PERTH_WEST_REGION);
  assert.match(String(heights.source.attribution), /Scottish public sector LiDAR.*Open Government Licence v3/);
  assert.match(String(heights.source.licence), /Open Government Licence v3/);
  for (const key of ['dsm', 'dtm'] as const) {
    const urls = heights.source[key] as string[];
    assert.ok(urls.every(u => u.includes(`/lidar/phase-1/${key}/`)), `${key} urls`);
    assert.ok(urls.some(u => u.includes('NO02_1M_')), `${key}: NO02, which holds the west part of the extension`);
    assert.ok(urls.some(u => u.includes('NO12_1M_')));
  }
  const decoded = decodeCityHeights(heights);
  assert.ok(decoded.size > 5200, `${decoded.size} LiDAR heights`);
  const byId = new Map(west.buildings.map(b => [b.id, b]));
  for (const [id, { height, median }] of decoded) {
    const b = byId.get(id);
    assert.ok(b, `${id} is in the west scene`);
    assert.equal(b.minHeight, 0); assert.ok(b.heightBasis.startsWith('ASSUMED'), `${id}: LiDAR only where OSM gives no height`);
    assert.ok(inExtent(b, PERTH_WEST_REGION), `${id} has a corner in the region`);
    assert.ok(height >= 2.5 && height <= 80 && median <= height, `${id}: ${height} m, median ${median}`);
  }
  const wide = [...decoded.keys()].filter(id => byId.get(id)!.outer.reduce((s, p) => s + p[0], 0) / byId.get(id)!.outer.length < -2800);
  assert.ok(wide.length > 400, `${wide.length} LiDAR heights west of x -2800 (NO02: the widening)`);
  const ways = heights.ids.way.reduce<number[]>((a, d) => [...a, (a.at(-1) ?? 0) + d], []);
  assert.ok(ways.every((v, i) => i === 0 || v > ways[i - 1]!), 'way ids ascend');
  assert.ok(gzipSync(read('perth-city-heights-west.json')).length < 10_000, 'a few kilobytes gzipped');
});

test('touchesRegion: a block whose bounding box meets the region, edges included, and not one wholly past an edge', () => {
  const at = (x0: number, z0: number, x1: number, z1: number) => ({ outer: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as [number, number][] });
  const R = PERTH_WEST_REGION;
  assert.equal(touchesRegion(at(R.x0 + 10, R.z0 + 10, R.x0 + 20, R.z0 + 20)), true, 'inside');
  assert.equal(touchesRegion(at(R.x0 + 10, R.z0 - 5, R.x0 + 20, R.z0 + 5)), true, 'straddling the north edge: its far corner is outside, the block is not');
  assert.equal(touchesRegion(at(R.x0 + 10, R.z0 - 10, R.x0 + 20, R.z0)), true, 'its edge on the region\'s');
  assert.equal(touchesRegion(at(R.x0 + 10, R.z0 - 12, R.x0 + 20, R.z0 - 0.5)), false, 'wholly north of the extent, as the 17 the first cut brought');
  assert.equal(touchesRegion(at(R.x0 - 30, R.z0 + 10, R.x0 - 0.5, R.z0 + 20)), false, 'west');
  assert.equal(touchesRegion(at(R.x1 + 0.5, R.z0 + 10, R.x1 + 30, R.z0 + 20)), false, 'east');
  assert.equal(touchesRegion(at(R.x0 + 10, R.z1 + 0.5, R.x0 + 20, R.z1 + 30)), false, 'south');
  assert.equal(touchesRegion(at(R.x0 - 100, R.z0 - 100, R.x1 + 100, R.z1 + 100)), true, 'a block bigger than the region');
  assert.equal(touchesRegion(at(0, 0, 5, 5), { x0: 4, z0: 4, x1: 9, z1: 9 }), true, 'a region of its own');
  assert.equal(touchesRegion(at(0, 0, 3, 3), { x0: 4, z0: 4, x1: 9, z1: 9 }), false);
});

test('inExtent: a block with any corner in the extent, and every block where there is none (the context run)', () => {
  const block = { outer: [[0, 0], [10, 0], [10, 10]] as [number, number][] };
  assert.equal(inExtent(block), true);
  assert.equal(inExtent(block, { x0: 5, z0: 5, x1: 20, z1: 20 }), true, 'one corner inside');
  assert.equal(inExtent(block, { x0: 11, z0: 0, x1: 20, z1: 20 }), false);
  assert.equal(inExtent(block, { x0: 0, z0: 0, x1: 0, z1: 0 }), true, 'edges count');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTerrain, decodeGrid, encodeGrid } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { PERTH_TERRAIN_EXTENT, PERTH_TERRAIN_SITE, WATER_RINGS } from '../build-perth-terrain.ts';
import { EAST_CLASSES, eastAreas, pip } from '../build-perth-east-terrain.ts';
import { PERTH_WEST_EXTENT } from '../perth-west-extent.ts';
import { PERTH_WEST_SITE, PERTH_WEST_STEP, WEST_CLASSES, WEST_OSM_MARGIN, nodeClasses, osmGap, osmWanted, seamMismatches } from '../build-perth-west-terrain.ts';
import type { LonLatBox } from '../build-perth-west-terrain.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../web/src/data/${name}`, import.meta.url), 'utf8'));
type WestFile = TerrainFile & { classNames: string[]; classes: string; classSource: string; provenance: { origin: unknown; referenceGroundAod: number; urls: string[]; method: string; sourceResolutionM: number } };
const west = read('perth-terrain-west.json') as WestFile, main = read('perth-terrain.json') as WestFile;
const W = PERTH_WEST_EXTENT, M = PERTH_TERRAIN_EXTENT, STEP = PERTH_WEST_STEP;

test('the west extent is the shared one, in whole 16 m steps, ending on the main terrain\'s west edge and on its rows', () => {
  assert.equal(STEP, 16);
  assert.equal(STEP, main.grids[0]!.step, 'the main terrain\'s own spacing');
  assert.equal((W.x1 - W.x0) % STEP, 0); assert.equal((W.z1 - W.z0) % STEP, 0);
  assert.equal(W.x1, M.x0, 'it meets the main terrain along the main terrain\'s west edge');
  assert.ok(W.z0 <= M.z0 && W.z1 >= M.z1, 'it spans the main terrain\'s whole west edge');
  assert.equal((M.z0 - W.z0) % STEP, 0, 'the main terrain\'s rows are this lattice\'s rows');
  assert.equal(PERTH_WEST_SITE.step, STEP);
});

test('the committed file is that extent on the main terrain\'s lattice, one datum, the main terrain\'s tiles and rule', () => {
  assert.deepEqual(west.extent, W);
  assert.equal(west.grids.length, 1);
  const g = west.grids[0]!, m = main.grids[0]!;
  assert.deepEqual([g.step, g.x0, g.z0, g.nx, g.nz, g.q], [STEP, W.x0, W.z0, (W.x1 - W.x0) / STEP + 1, (W.z1 - W.z0) / STEP + 1, m.q]);
  assert.equal(west.groundY, main.groundY); assert.equal(west.datumAod, main.datumAod, 'the same datum: one height frame');
  assert.equal(west.provenance.referenceGroundAod, main.provenance.referenceGroundAod);
  assert.deepEqual(west.provenance.origin, main.provenance.origin);
  assert.deepEqual(west.provenance.urls, main.provenance.urls, 'the same Phase I tiles');
  assert.equal(west.provenance.sourceResolutionM, 1);
  assert.deepEqual(PERTH_WEST_SITE.urls, PERTH_TERRAIN_SITE.urls); assert.deepEqual(PERTH_WEST_SITE.origin, PERTH_TERRAIN_SITE.origin);
  assert.match(west.source, /Phase I 1 m DTM, 16 m nearest-pixel lattice/);
  assert.match(west.attribution, /Scottish public sector LiDAR.*Open Government Licence v3.*accessed 2026-11-13/);
  assert.match(west.provenance.method, new RegExp(`LOWEST valid native pixel on the nearest of the rings ${WATER_RINGS.join(', ')} m`));
  assert.match(west.classSource, /OSM map API.*ODbL 1\.0/);
  // a ground class per node, in the east patch's vocabulary
  assert.deepEqual(west.classNames, [...EAST_CLASSES]); assert.deepEqual(west.classNames, [...WEST_CLASSES]);
  assert.equal(west.classes.length, g.nx * g.nz);
  assert.ok([...west.classes].every(ch => Number(ch) >= 0 && Number(ch) < west.classNames.length));
  // the terrain is real relief, not a flat fill: every node is a finite height in the DTM's range for the area (the main terrain's own span)
  const h = decodeGrid(g).h;
  assert.ok(h.every(Number.isFinite) && Math.min(...h) > -1 && Math.max(...h) < 200 && Math.max(...h) - Math.min(...h) > 20, `heights ${Math.min(...h)} to ${Math.max(...h)}`);
});

test('the shared edge is made of the same nodes: all of the main terrain\'s edge nodes carry exactly the west file\'s height', () => {
  const r = seamMismatches(west, main), g = west.grids[0]!, m = main.grids[0]!;
  assert.equal(r.checked, m.nz); assert.equal(r.checked, (M.z1 - M.z0) / STEP + 1);
  assert.deepEqual(r.bad, []);
  // independently of seamMismatches: the raw grids, node by node (the main's column 0 against the west's last column, 25 rows down)
  const gw = decodeGrid(g), gm = decodeGrid(m), row0 = (M.z0 - W.z0) / STEP;
  for (let j = 0; j < m.nz; j++) assert.equal(gw.h[(row0 + j) * g.nx + g.nx - 1], gm.h[j * m.nx], `edge node ${j} (z ${M.z0 + j * STEP})`);
  // and through the terrain API at the edge, where the drawn meshes meet
  const tw = createTerrain(west), tm = createTerrain(main);
  for (let z = M.z0; z <= M.z1; z += STEP) assert.equal(tw.heightAt(W.x1, z), tm.heightAt(W.x1, z), `z ${z}`);
});

test('seamMismatches sees one quantum of disagreement, and refuses files that do not meet', () => {
  const g = decodeGrid(west.grids[0]!), row = (M.z0 - W.z0) / STEP + 40, k = row * g.nx + g.nx - 1, h = Float32Array.from(g.h);
  h[k] = h[k]! + 0.1;
  const bumped: TerrainFile = { ...west, grids: [encodeGrid(h, { step: g.step, x0: g.x0, z0: g.z0, nx: g.nx, nz: g.nz, q: 0.1 })] };
  const r = seamMismatches(bumped, main);
  assert.equal(r.bad.length, 1); assert.equal(r.bad[0]!.z, M.z0 + 40 * STEP); assert.ok(Math.abs(r.bad[0]!.west - r.bad[0]!.main - 0.1) < 1e-4, "one quantum (heights are float32 once decoded)");
  assert.throws(() => seamMismatches({ ...west, extent: { ...W, x1: W.x1 + 16 } }, main), /not the main terrain's west edge/);
});

test('the node classes: nodata is water, the smallest area holding the node wins, the rest is field; the box test changes nothing', async () => {
  const sq = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
  const areas = [{ cls: 'wood' as const, ring: sq(32, 32, 64, 64), area: 1024 }, { cls: 'houses' as const, ring: sq(0, 0, 160, 96), area: 15360 }];
  const E = { x0: 0, z0: 0, x1: 176, z1: 112 }, nx = 12, nz = 8, idx = (c: string) => String(WEST_CLASSES.indexOf(c as (typeof WEST_CLASSES)[number]));
  const wetAt = (x: number, z: number) => x === 80 && z === 48;
  const s = await nodeClasses(areas, E, 16, async (x, z) => wetAt(x, z));
  assert.equal(s.length, nx * nz);
  const at = (x: number, z: number) => s[(z / 16) * nx + x / 16];
  assert.equal(at(48, 48), idx('wood'), 'inside both: the smaller wins');
  assert.equal(at(112, 48), idx('houses'), 'inside the big one only');
  assert.equal(at(80, 48), idx('water'), 'nodata beats the land use under it');
  assert.equal(at(160, 112), idx('field'), 'outside every area');
  assert.equal(at(176, 16), idx('field'));
  // the prefilter against plain point-in-polygon, over a lattice of shapes with a hole-free awkward outline
  const star: [number, number][] = [[10, 0], [60, 40], [120, 0], [90, 60], [150, 100], [80, 80], [30, 110], [50, 50], [10, 0]];
  const more = [...areas, { cls: 'scrub' as const, ring: star, area: 4000 }].sort((a, b) => a.area - b.area);
  const got = await nodeClasses(more, E, 16, async () => false);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const hit = more.find(a => pip(i * 16, j * 16, a.ring));
    assert.equal(got[j * nx + i], idx(hit?.cls ?? 'field'), `node ${i},${j}`);
  }
});

test('OSM areas come from tagged ways and multipolygon outers, never from buildings', () => {
  const node = (id: number, lat: number, lon: number) => ({ type: 'node', id, lat, lon });
  const ring = (id: number, tags: Record<string, string>, ids: number[]) => ({ type: 'way', id, nodes: [...ids, ids[0]!], tags });
  const els = [node(1, 56.39, -3.46), node(2, 56.39, -3.45), node(3, 56.4, -3.45), node(4, 56.4, -3.46), node(5, 56.395, -3.455),
    ring(10, { landuse: 'residential' }, [1, 2, 3, 4]), ring(11, { landuse: 'residential', building: 'yes' }, [1, 2, 3, 4]), ring(12, { highway: 'residential' }, [1, 2, 3, 4]),
    { type: 'relation', id: 20, tags: { type: 'multipolygon', natural: 'wood' }, members: [{ type: 'way', ref: 13, role: 'outer' }] }, ring(13, {}, [1, 2, 5, 4])];
  const areas = eastAreas(els as Parameters<typeof eastAreas>[0]);
  assert.deepEqual(areas.map(a => a.cls).sort(), ['houses', 'wood'], 'the residential way and the wood relation; not the building, not the road');
  assert.ok(areas[0]!.area <= areas[1]!.area, 'smallest first');
});

test('the OSM tiles the file names cover its extent plus the margin, each under the map API\'s area limit', () => {
  const tiles = (west.classSource.match(/-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){3}/g) ?? []).map(t => t.split(',').map(Number) as unknown as LonLatBox);
  assert.equal(tiles.length, 2, `the two tiles the file names: ${west.classSource}`);
  assert.equal(osmGap(tiles, osmWanted(W)), null, `${tiles.map(String).join(' and ')} cover the extent plus ${WEST_OSM_MARGIN} m`);
  for (const [w, s, e, n] of tiles) assert.ok((e - w) * (n - s) < 0.25, 'one request each');
  // the margin is real: the wanted box is wider than the extent by it, on every side
  const [w, s, e, n] = osmWanted(W), [w0, s0, e0, n0] = osmWanted(W, 0);
  assert.ok(w < w0 && s < s0 && e > e0 && n > n0, 'beyond the extent on every side');
});

test('osmGap finds what the tiles leave uncovered, north-west first; tiles that touch or overlap leave none', () => {
  const want: LonLatBox = [0, 0, 10, 10];
  assert.equal(osmGap([[-1, -1, 6, 11], [5, -1, 11, 11]], want), null, 'overlapping');
  assert.equal(osmGap([[-1, -1, 5, 11], [5, -1, 11, 11]], want), null, 'touching');
  assert.deepEqual(osmGap([[-1, -1, 4.9, 11], [5, -1, 11, 11]], want), [4.9, 0, 5, 10], 'a slit between two tiles');
  assert.deepEqual(osmGap([[0, 0, 6, 10], [5, 2, 10, 10]], want), [6, 0, 10, 2], 'the south-east corner, which only the first tile reaches the south of');
  assert.deepEqual(osmGap([[0, 0, 10, 8]], want), [0, 8, 10, 10], 'the north strip');
  assert.deepEqual(osmGap([[20, 20, 30, 30]], want), want, 'a tile elsewhere covers nothing');
  assert.deepEqual(osmGap([], want), want, 'no tiles');
  assert.deepEqual(osmGap([[0, 0, 10, 8], [0, 0, 8, 10]], want), [8, 8, 10, 10], 'two tiles, the corner neither holds');
  assert.deepEqual(osmGap([[0, 0, 10, 10]], [-5, -5, 15, 15]), [-5, 10, 0, 15], 'a tile in the middle of a larger box: the north-west cell is reported first');
});

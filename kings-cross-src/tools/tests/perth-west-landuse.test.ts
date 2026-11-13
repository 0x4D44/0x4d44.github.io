import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unproject } from '../../core/geo.ts';
import type { Pt } from '../../core/geo.ts';
import { PERTH_ORIGIN } from '../../core/perth-data.ts';
import { PERTH_TERRAIN_EXTENT } from '../build-perth-terrain.ts';
import { buildLanduse, M, perthRoad, Q } from '../build-perth-city-landuse.ts';
import type { Element } from '../build-perth-city-landuse.ts';
import { PERTH_WEST_EXTENT } from '../perth-west-extent.ts';
import { TILE_LATTICE, TRUNK_ASSUMED, TRUNK_CLASS, TRUNK_Q, buildWestLanduse, missingAreaRelations, roundabouts, runInside, trunkWidth, trunkWays, westRoad, westTiles } from '../build-perth-west-landuse.ts';

/** A raw OSM snapshot built from points of the Perth frame (metres), as the map API would return them. */
class Osm {
  all = new Map<string, Element>(); private next = 1;
  node(x: number, z: number, tags?: Record<string, string>): number {
    const { lat, lon } = unproject(x, z, PERTH_ORIGIN), id = this.next++;
    this.all.set(`node/${id}`, { type: 'node', id, lat, lon, ...(tags ? { tags } : {}) }); return id;
  }
  way(points: readonly Pt[], tags: Record<string, string>, closed = false): number {
    const ids = points.map(p => this.node(p[0], p[1])), id = this.next++;
    this.all.set(`way/${id}`, { type: 'way', id, nodes: closed ? [...ids, ids[0]!] : ids, tags }); return id;
  }
  /** A way over existing nodes (a ring built of arcs that share their end nodes). */
  arc(ids: number[], tags: Record<string, string>): number { const id = this.next++; this.all.set(`way/${id}`, { type: 'way', id, nodes: ids, tags }); return id; }
  relation(id: number, tags: Record<string, string>, members: { type: string; ref: number; role: string }[]): void { this.all.set(`relation/${id}`, { type: 'relation', id, tags, members }); }
}
const square = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const decode = (d: number[], q: number): Pt[] => { const out: Pt[] = []; let x = 0, z = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]!; z += d[i + 1]!; out.push([x * q, z * q]); } return out; };

test('the context rule is unchanged by the extent parameter: what the Perth file keeps, in its own encoding', () => {
  const o = new Osm();
  o.way([[0, 0], [100, 0]], { highway: 'residential' });
  o.way([[0, 100], [100, 100]], { highway: 'motorway' }); // not in the context's class table: left out
  o.way([[0, 200], [100, 200]], { highway: 'primary', bridge: 'yes', layer: '1' }); // a bridge: left to its own mesh
  o.way([[0, 300], [100, 300]], { highway: 'primary', width: '14' }); // an OSM width wins
  o.way(square(-50, -50, 250, 250), { leisure: 'park' }, true);
  o.way([[20, 20], [60, 20]], { highway: 'footway' }); // a park path: kept
  o.way([[500, 20], [540, 20]], { highway: 'footway' }); // outside every green: left out
  o.node(30, 40, { natural: 'tree', leaf_type: 'needleleaved', height: '7' });
  o.node(200, 200, { tourism: 'viewpoint' });
  const g = buildLanduse(o.all, PERTH_TERRAIN_EXTENT);
  assert.deepEqual(g.roads, { '7': [[0, 0, 50, 0]], '14': [[0, 150, 50, 0]] });
  assert.deepEqual(g.paths, { '2.5': [[10, 10, 20, 0]] });
  assert.equal(g.areas.park.length, 1);
  assert.deepEqual(decode(g.areas.park[0]![0]!, Q), square(-50, -50, 250, 250));
  assert.deepEqual(g.trees, [15, 20]); assert.deepEqual(g.treeTags, [[0, 1, 7]]); assert.equal(g.treeCount, 1);
  assert.deepEqual(g.outlooks, [[100, 100]]);
  assert.deepEqual(perthRoad({ highway: 'trunk' }), { kind: 'road', width: 11 });
  assert.equal(perthRoad({ highway: 'motorway' }), undefined);
});

test('the extent drives what is kept: a street within M m of it is, one beyond is not; a polygon needs a vertex inside', () => {
  const E = { x0: 0, z0: 0, x1: 100, z1: 100 }, o = new Osm();
  o.way([[10, 10], [20, 10]], { highway: 'residential' });
  o.way([[100 + M - 10, 50], [100 + M - 10 + 6, 50]], { highway: 'tertiary' }); // 30 m outside the east edge: in
  o.way([[100 + M + 10, 50], [100 + M + 16, 50]], { highway: 'service' }); // 50 m outside: out
  o.way(square(-100, -100, -20, -20), { landuse: 'grass' }, true); // wholly outside
  o.way(square(80, 80, 300, 300), { landuse: 'farmland' }, true); // one vertex inside
  const g = buildLanduse(o.all, E);
  assert.deepEqual(Object.keys(g.roads).sort(), ['7', '8.5']); assert.equal(g.roads['7']!.length, 1); assert.equal(g.roads['8.5']!.length, 1);
  assert.equal(g.areas.grass.length, 0); assert.equal(g.areas.park.length, 1);
  // the same snapshot over an extent that holds none of it keeps none of it
  const far = buildLanduse(o.all, { x0: 5000, z0: 5000, x1: 5100, z1: 5100 });
  assert.equal(Object.keys(far.roads).length, 0); assert.equal(far.areas.park.length + far.areas.grass.length, 0);
  // and the polygon that was wholly outside is kept by an extent that holds it
  assert.equal(buildLanduse(o.all, { x0: -120, z0: -120, x1: -10, z1: -10 }).areas.grass.length, 1);
});

test('trunk widths: the OSM width, else lanes at the UK lane plus hard strips, else the class make-up; flagged by basis', () => {
  const w = (t: Record<string, string>) => trunkWidth(t);
  assert.deepEqual(w({ highway: 'trunk', width: '12' }), { width: 12, lanes: 0, basis: 'OSM width' });
  assert.deepEqual(w({ highway: 'trunk', lanes: '2', oneway: 'yes' }), { width: 9.3, lanes: 2, basis: 'OSM lanes' }, 'an A9 carriageway: 2 x 3.65 + 2 x 1.0');
  assert.deepEqual(w({ highway: 'motorway', lanes: '2' }), { width: 11.6, lanes: 2, basis: 'OSM lanes' }, 'a motorway adds its 3.3 m hard shoulder and a 1.0 m offside strip');
  assert.equal(w({ highway: 'motorway', lanes: '3' }).width, 15.3);
  assert.deepEqual(w({ highway: 'motorway_link', lanes: '1' }), { width: 6, lanes: 1, basis: 'OSM lanes' }, 'a one-lane slip road is held to the least a painted road is');
  assert.equal(w({ highway: 'trunk_link', lanes: '2' }).width, 9.3);
  assert.deepEqual(w({ highway: 'trunk' }), { width: 9.3, lanes: 2, basis: 'ASSUMED' }, 'no lanes mapped: two, ASSUMED');
  assert.deepEqual(w({ highway: 'trunk_link' }), { width: 6, lanes: 1, basis: 'ASSUMED' });
  assert.deepEqual(w({ highway: 'motorway' }), { width: 11.6, lanes: 2, basis: 'ASSUMED' });
  assert.equal(w({ highway: 'trunk', lanes: '2', width: '45' }).basis, 'OSM lanes', 'an implausible width tag is not taken');
  assert.equal(w({ highway: 'trunk', lanes: '2;3' }).basis, 'ASSUMED', 'a lanes tag that is not one number is not taken');
  // never in the pedestrian setts band (5 to 6 m, waverley-city-ground.ts roadColour), whatever the tags
  for (const hw of ['motorway', 'motorway_link', 'trunk', 'trunk_link']) for (const lanes of [undefined, '1', '2', '3', '4']) {
    const { width } = w({ highway: hw, ...(lanes ? { lanes } : {}) }); assert.ok(width >= TRUNK_ASSUMED.slipMin, `${hw} ${lanes}: ${width}`);
  }
});

test('the west street rule: the trunk class goes to the trunk block, a bridge is painted through, a tunnel is not', () => {
  assert.equal(westRoad({ highway: 'trunk', lanes: '2' }), undefined); assert.equal(westRoad({ highway: 'motorway' }), undefined); assert.equal(westRoad({ highway: 'motorway_link' }), undefined);
  assert.deepEqual(westRoad({ highway: 'primary' }), perthRoad({ highway: 'primary' }));
  assert.deepEqual(westRoad({ highway: 'residential', bridge: 'yes', layer: '1' }), { kind: 'road', width: 7 }, 'a bridged street keeps its line');
  assert.equal(perthRoad({ highway: 'residential', bridge: 'yes', layer: '1' }), undefined, 'the context rule still leaves it out');
  assert.equal(westRoad({ highway: 'residential', tunnel: 'yes', layer: '-1' }), undefined);
  assert.equal(westRoad({ highway: 'residential', layer: '-1' }), undefined);
  assert.equal(westRoad({ highway: 'residential', layer: '1' }), undefined, 'a raised way that is no bridge stays out, as in the context');
  assert.equal(westRoad({ highway: 'residential', bridge: 'yes', layer: '3' }), undefined);
  assert.equal(westRoad({ highway: 'footway', footway: 'sidewalk' }), undefined);
  assert.equal(TRUNK_CLASS.test('trunk_link') && TRUNK_CLASS.test('motorway') && !TRUNK_CLASS.test('primary') && !TRUNK_CLASS.test('motorway_junction'), true);
});

test('a dual carriageway is two one-way ways, each drawn at its own width, with the gap between them its central reserve', () => {
  const o = new Osm(), E = PERTH_WEST_EXTENT;
  const nb = o.way([[-2000, 1000], [-2000, 0], [-2020, -800]], { highway: 'trunk', ref: 'A9', lanes: '2', oneway: 'yes', dual_carriageway: 'yes' });
  const sb = o.way([[-2020 + 15, -800], [-2000 + 15, 0], [-2000 + 15, 1000]], { highway: 'trunk', ref: 'A9', lanes: '2', oneway: 'yes', dual_carriageway: 'yes' });
  const slip = o.way([[-2100, 200], [-2040, 150]], { highway: 'trunk_link', ref: 'A9', lanes: '1', oneway: 'yes' });
  const wide = o.way([[-1500, 0], [-1400, 0]], { highway: 'trunk', width: '14' });
  o.way([[-1800, 400], [-1700, 400]], { highway: 'primary', lanes: '2' }); // a street: class width, in `roads`
  o.way([[-1900, 500], [-1800, 500]], { highway: 'residential', bridge: 'yes', layer: '1' }); // painted through
  o.way([[-2700, -1500], [-2699, -1499]], { highway: 'motorway', tunnel: 'yes' }); // a tunnel: left out
  o.way([[-3500, 0], [-3400, 0]], { highway: 'trunk', ref: 'A85' }); // far outside the extent: left out
  const f = buildWestLanduse(o.all, E);
  assert.deepEqual(f.trunk.ways.map(w => w.id).sort(), [`way/${nb}`, `way/${sb}`, `way/${slip}`, `way/${wide}`].sort());
  const by = (id: number) => f.trunk.ways.find(w => w.id === `way/${id}`)!;
  assert.deepEqual([by(nb).width, by(nb).basis, by(nb).lanes, by(nb).oneway, by(nb).dual], [9.3, 'OSM lanes', 2, true, true]);
  assert.deepEqual([by(slip).width, by(slip).basis], [6, 'OSM lanes']); assert.deepEqual([by(wide).width, by(wide).basis], [14, 'OSM width']);
  // none of them is also a street; the street and the bridged street are
  assert.deepEqual(Object.keys(f.roads).sort(), ['11', '7']);
  // the two carriageways stay 15 m apart in the file: the reserve is what is left between their edges
  const a = decode(by(nb).line, f.trunk.q), b = decode(by(sb).line, f.trunk.q);
  const at = (l: Pt[], z: number) => { for (let i = 1; i < l.length; i++) if ((l[i - 1]![1] - z) * (l[i]![1] - z) <= 0 && l[i - 1]![1] !== l[i]![1]) return l[i - 1]![0] + (l[i]![0] - l[i - 1]![0]) * (z - l[i - 1]![1]) / (l[i]![1] - l[i - 1]![1]); return NaN; };
  assert.ok(Math.abs(Math.abs(at(b, 500) - at(a, 500)) - 15) < 1, `centrelines ${Math.abs(at(b, 500) - at(a, 500))} m apart`);
  assert.ok(15 - by(nb).width > 4, 'a central reserve of several metres shows between the two painted carriageways');
  assert.equal(f.trunk.q, TRUNK_Q); assert.equal(f.q, Q);
  assert.deepEqual(f.extent, E);
});

test('roundabouts: the junction=roundabout ways that share nodes make one ring; a ring of arcs is closed, one arc alone is not', () => {
  const o = new Osm(), c: Pt = [-2000, 100], r = 40, ring = Array.from({ length: 12 }, (_, k): Pt => [c[0] + r * Math.cos(k * Math.PI / 6), c[1] + r * Math.sin(k * Math.PI / 6)]);
  const ids = ring.map(p => o.node(p[0], p[1]));
  const tags = { highway: 'trunk', junction: 'roundabout', lanes: '3', name: 'Test Roundabout', ref: 'A9' };
  o.arc(ids.slice(0, 5), tags); o.arc(ids.slice(4, 9), tags); o.arc([...ids.slice(8), ids[0]!], tags);
  const lone = [o.node(-1500, -500), o.node(-1490, -490), o.node(-1480, -500)]; o.arc(lone, { highway: 'tertiary', junction: 'roundabout' });
  o.node(-1990, 120, { highway: 'motorway_junction', ref: '12', name: 'Test Junction' });
  const rs = roundabouts(o.all, PERTH_WEST_EXTENT);
  assert.equal(rs.length, 2);
  const big = rs.find(x => x.ways.length === 3)!;
  assert.ok(Math.hypot(big.x - c[0], big.z - c[1]) < 1 && Math.abs(big.radius - r) < 1, `${big.x}, ${big.z} r ${big.radius}`);
  assert.deepEqual([big.closed, big.hw, big.lanes, big.name, big.ref], [true, 'trunk', 3, 'Test Roundabout', 'A9']);
  assert.equal(rs.find(x => x.ways.length === 1)!.closed, false);
  assert.deepEqual(buildWestLanduse(o.all, PERTH_WEST_EXTENT).trunk.junctions.map(j => [j.ref, j.name]), [['12', 'Test Junction']]);
});

test('a trunk way is cut to the run near the extent: one vertex either side, nothing if it never comes near', () => {
  const E = { x0: 0, z0: 0, x1: 100, z1: 100 }, line: Pt[] = [[-500, 50], [-300, 80], [-20, 50], [50, 80], [90, 50], [400, 80], [900, 50]];
  assert.deepEqual(runInside(line, E, M), [[-300, 80], [-20, 50], [50, 80], [90, 50], [400, 80]]);
  assert.equal(runInside([[-500, 500], [-400, 500]], E, M), undefined);
  assert.deepEqual(runInside([[10, 10], [20, 20]], E, M), [[10, 10], [20, 20]]);
  const o = new Osm(); o.way(line, { highway: 'trunk', lanes: '2' });
  assert.deepEqual(decode(trunkWays(o.all, E)[0]!.line, TRUNK_Q), [[-300, 80], [-20, 50], [50, 80], [90, 50], [400, 80]], 'the file keeps the run, to 0.5 m');
  // a collinear run is simplified to its ends (Douglas-Peucker, 0.5 m)
  const straight = new Osm(); straight.way([[-500, 50], [-300, 50], [-20, 50], [50, 50], [90, 50], [400, 50], [900, 50]], { highway: 'trunk', lanes: '2' });
  assert.deepEqual(decode(trunkWays(straight.all, E)[0]!.line, TRUNK_Q), [[-300, 50], [400, 50]]);
});

test('the OSM tiles: a fixed lattice covers the extent and its margin, each tile within the API limits, and a wider extent only adds tiles', () => {
  const tiles = westTiles(PERTH_WEST_EXTENT);
  assert.equal(tiles.length, 12);
  assert.equal(new Set(tiles.map(t => t.name)).size, tiles.length, 'unique names');
  for (const t of tiles) {
    const [w, s, e, n] = t.bbox; assert.ok(e > w && n > s && (e - w) * (n - s) < 0.25, `${t.name} under the API's area limit`);
    assert.ok((e - w) * (n - s) < 0.0002, 'a small tile, far under the 50,000-node limit');
    assert.ok(Math.abs((s - TILE_LATTICE.lat0) / TILE_LATTICE.dLat - Math.round((s - TILE_LATTICE.lat0) / TILE_LATTICE.dLat)) < 1e-6, 'on the lattice');
  }
  // the four corners of the extent, and the margin beyond them, fall inside the tiles' union
  for (const p of [[PERTH_WEST_EXTENT.x0 - M, PERTH_WEST_EXTENT.z0 - M], [PERTH_WEST_EXTENT.x1 + M, PERTH_WEST_EXTENT.z0 - M], [PERTH_WEST_EXTENT.x0 - M, PERTH_WEST_EXTENT.z1 + M], [PERTH_WEST_EXTENT.x1 + M, PERTH_WEST_EXTENT.z1 + M]] as const) {
    const { lat, lon } = unproject(p[0], p[1], PERTH_ORIGIN);
    assert.ok(tiles.some(t => lon >= t.bbox[0] && lon <= t.bbox[2] && lat >= t.bbox[1] && lat <= t.bbox[3]), `corner ${p} is covered`);
  }
  const wider = westTiles({ ...PERTH_WEST_EXTENT, x0: -3232 });
  assert.ok(tiles.every(t => wider.some(w => w.name === t.name && w.bbox.join() === t.bbox.join())), 'every tile of the narrower extent is a tile of the wider one, unchanged: a rebuild fetches only the new ones');
  assert.equal(wider.length, 16);
});

test('area multipolygons the tiles hold incompletely are named for a full fetch; buildings, routes and complete ones are not', () => {
  const o = new Osm(), a = o.way(square(0, 0, 10, 10), {}, true), b = o.way(square(20, 0, 30, 10), {}, true);
  o.relation(1, { type: 'multipolygon', landuse: 'forest' }, [{ type: 'way', ref: a, role: 'outer' }, { type: 'way', ref: 999999, role: 'outer' }]);
  o.relation(2, { type: 'multipolygon', landuse: 'forest' }, [{ type: 'way', ref: a, role: 'outer' }, { type: 'way', ref: b, role: 'inner' }]);
  o.relation(3, { type: 'multipolygon', building: 'yes' }, [{ type: 'way', ref: 999998, role: 'outer' }]);
  o.relation(4, { type: 'route', route: 'bus' }, [{ type: 'way', ref: 999997, role: '' }]);
  o.relation(5, { type: 'multipolygon', natural: 'water' }, [{ type: 'way', ref: 999996, role: 'outer' }, { type: 'node', ref: 5, role: 'label' }]);
  assert.deepEqual(missingAreaRelations(o.all), [1, 5]);
});

test('the committed west file: the extent, the encodings, and every trunk way carries its width with where it came from', () => {
  const file = JSON.parse(readFileSync(new URL('../../web/src/data/perth-city-landuse-west.json', import.meta.url), 'utf8'));
  const problems = checkWestFile(file);
  assert.deepEqual(problems, []);
  // the checker does see a broken file (each of these is one fault)
  const bad = (edit: (f: any) => void): string[] => { const f = structuredClone(file); edit(f); return checkWestFile(f); };
  assert.match(bad(f => { f.extent.x0 = -2816; }).join(), /extent/);
  assert.match(bad(f => { f.trunk.ways[0].width = 4; }).join(), /width/);
  assert.match(bad(f => { f.trunk.ways[0].basis = 'guess'; }).join(), /basis/);
  assert.match(bad(f => { f.trunk.ways[0].width += 1; }).join(), /lanes/);
  assert.match(bad(f => { f.trunk.ways[1].id = f.trunk.ways[0].id; }).join(), /duplicate/);
  assert.match(bad(f => { f.trunk.ways[0].line = [0, 0, 1, 1]; }).join(), /extent/);
  assert.match(bad(f => { f.attribution = 'mine'; }).join(), /attribution/);
  assert.match(bad(f => { f.q = 1; }).join(), /q/);
  assert.ok(file.trunk.ways.some((w: any) => w.ref === 'A9') && file.trunk.ways.some((w: any) => w.ref === 'M90'), 'the A9 and the M90 reach the extent');
  assert.ok(file.trunk.ways.every((w: any) => w.basis !== 'ASSUMED' || w.lanes > 0), 'a way with no lanes tag is flagged ASSUMED and still has lanes');
});

/** The faults a west land-use file can have; empty when it is sound. */
function checkWestFile(f: any): string[] {
  const out: string[] = [], E = PERTH_WEST_EXTENT;
  if (JSON.stringify(f.extent) !== JSON.stringify(E)) out.push('extent is not PERTH_WEST_EXTENT');
  if (f.q !== Q) out.push(`q is ${f.q}, not ${Q}`);
  if (f.trunk?.q !== TRUNK_Q) out.push(`trunk q is ${f.trunk?.q}, not ${TRUNK_Q}`);
  if (!/OpenStreetMap contributors \(ODbL\)/.test(f.attribution ?? '')) out.push('attribution is missing the OSM credit');
  const near = (p: Pt) => p[0] >= E.x0 - M && p[0] <= E.x1 + M && p[1] >= E.z0 - M && p[1] <= E.z1 + M;
  const seen = new Set<string>();
  for (const w of f.trunk?.ways ?? []) {
    if (seen.has(w.id)) out.push(`duplicate way ${w.id}`); seen.add(w.id);
    if (!/^way\/\d+$/.test(w.id) || !TRUNK_CLASS.test(w.hw)) out.push(`${w.id} is not a trunk or motorway way`);
    if (!['OSM width', 'OSM lanes', 'ASSUMED'].includes(w.basis)) out.push(`${w.id} basis ${w.basis}`);
    if (!(w.width >= TRUNK_ASSUMED.slipMin && w.width < 30)) out.push(`${w.id} width ${w.width} m`);
    if (w.basis === 'OSM lanes' && trunkWidth({ highway: w.hw, lanes: String(w.lanes) }).width !== w.width) out.push(`${w.id} width ${w.width} m does not follow its ${w.lanes} lanes`);
    const line = decode(w.line, f.trunk.q); if (line.length < 2 || !line.some(near)) out.push(`${w.id} has no point near the extent`);
  }
  // a ring is kept for a vertex in the extent, but simplified (2 m) afterwards: its box must still reach the extent
  for (const k of Object.keys(f.areas)) for (const rs of f.areas[k]) {
    const o = decode(rs[0], f.q), xs = o.map(p => p[0]), zs = o.map(p => p[1]);
    if (o.length < 3 || Math.max(...xs) < E.x0 || Math.min(...xs) > E.x1 || Math.max(...zs) < E.z0 || Math.min(...zs) > E.z1) out.push(`an ${k} ring is nowhere near the extent`);
  }
  return out;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dist, ORIGIN, project, unproject } from '../geo.ts';
import { buildGraph, components, pointAlong, shortestPath, snap } from '../graph.ts';
import { compactOsm } from '../osm.ts';
import type { RawElement } from '../osm.ts';

// ---- geo -----------------------------------------------------------------------------

test('geo: the origin projects to (0,0) and north is -z, east is +x', () => {
  assert.deepEqual(project(ORIGIN.lat, ORIGIN.lon), [0, 0]);
  const north = project(ORIGIN.lat + 0.001, ORIGIN.lon);
  const east = project(ORIGIN.lat, ORIGIN.lon + 0.001);
  assert.ok(north[1] < 0 && Math.abs(north[0]) < 1e-6);
  assert.ok(east[0] > 0 && Math.abs(east[1]) < 1e-6);
});

test('geo: scale is true: 0.001 deg of latitude is about 111 m, of longitude about 69 m at King\'s Cross', () => {
  assert.ok(Math.abs(dist([0, 0], project(ORIGIN.lat + 0.001, ORIGIN.lon)) - 111.2) < 0.5);
  assert.ok(Math.abs(dist([0, 0], project(ORIGIN.lat, ORIGIN.lon + 0.001)) - 69.2) < 0.5);
});

test('geo: unproject inverts project', () => {
  const [x, z] = project(51.5342, -0.1203);
  const back = unproject(x, z);
  assert.ok(Math.abs(back.lat - 51.5342) < 1e-9 && Math.abs(back.lon + 0.1203) < 1e-9);
});

// ---- osm compaction -------------------------------------------------------------------

const way = (id: number, nodes: number[], pts: [number, number][], tags: Record<string, string>): RawElement => ({
  type: 'way',
  id,
  nodes,
  geometry: pts.map(([lat, lon]) => ({ lat, lon })),
  tags,
});

const L = ORIGIN.lat;
const O = ORIGIN.lon;
const sample: RawElement[] = [
  way(1, [10, 11, 12], [[L, O], [L + 0.0001, O], [L + 0.0002, O]], { railway: 'rail', tunnel: 'yes', layer: '-1', electrified: 'contact_line', maxspeed: '20 mph', ref: 'ECM1' }),
  way(2, [12, 13], [[L + 0.0002, O], [L + 0.0002, O + 0.0001]], { railway: 'rail', service: 'siding' }),
  way(3, [20, 21], [[L, O], [L, O + 0.0001]], { railway: 'rail', bridge: 'no', tunnel: 'no' }),
  way(4, [30, 31, 32, 33, 30], [[L, O], [L, O + 0.0002], [L + 0.0002, O + 0.0002], [L + 0.0002, O], [L, O]], { railway: 'platform', ref: '3', name: 'Three' }),
  way(5, [40, 41, 42, 43, 40], [[L, O], [L, O + 0.0002], [L + 0.0002, O + 0.0002], [L + 0.0002, O], [L, O]], { building: 'train_station', height: '18.5', 'building:levels': '2', name: 'Shed' }),
  { type: 'node', id: 12, lat: L + 0.0002, lon: O, tags: { railway: 'switch', 'railway:switch': 'default' } },
  { type: 'node', id: 50, lat: L, lon: O, tags: { railway: 'buffer_stop' } },
  { type: 'node', id: 11, lat: L + 0.0001, lon: O, tags: { railway: 'signal', ref: 'YA1023', 'railway:signal:direction': 'forward', 'railway:signal:main': 'GB-NR:colour_light', 'railway:signal:main:form': 'light' } },
  // a rail way whose geometry is missing a node coordinate must be skipped, not crash
  { type: 'way', id: 6, nodes: [90, 91], geometry: [{ lat: L, lon: O }], tags: { railway: 'rail' } },
  { type: 'relation', id: 7, tags: { public_transport: 'station' } },
];

test('osm: rails keep node ids, service, tunnel, bridge, layer and optional tags', () => {
  const d = compactOsm(sample);
  assert.equal(d.rails.length, 3, 'the way with a missing coordinate is skipped');
  const r1 = d.rails.find((r) => r.id === 1);
  assert.deepEqual(r1?.nodes, [10, 11, 12]);
  assert.equal(r1?.tunnel, true);
  assert.equal(r1?.layer, -1);
  assert.equal(r1?.electrified, 'contact_line');
  assert.equal(r1?.maxspeed, '20 mph');
  assert.equal(r1?.ref, 'ECM1');
  assert.equal(d.rails.find((r) => r.id === 2)?.service, 'siding');
  const r3 = d.rails.find((r) => r.id === 3);
  assert.equal(r3?.service, 'main');
  assert.equal(r3?.tunnel, false, 'tunnel=no is not a tunnel');
  assert.equal(r3?.bridge, false);
});

test('osm: the node table holds projected, rounded coordinates for every used node only', () => {
  const d = compactOsm(sample);
  assert.deepEqual(d.nodes.map((n) => n[0]), [10, 11, 12, 13, 20, 21]);
  const n12 = d.nodes.find((n) => n[0] === 12);
  assert.ok(n12 && Math.abs(n12[2] + 22.2) < 0.1, 'about 22.2 m north');
});

test('osm: platforms and buildings become rings with the closing point dropped', () => {
  const d = compactOsm(sample);
  assert.equal(d.platforms.length, 1);
  assert.equal(d.platforms[0]?.pts.length, 4);
  assert.equal(d.platforms[0]?.ref, '3');
  assert.equal(d.buildings[0]?.pts.length, 4);
  assert.equal(d.buildings[0]?.height, 18.5);
  assert.equal(d.buildings[0]?.levels, 2);
  assert.equal(d.buildings[0]?.kind, 'train_station');
});

test('osm: a platform keeps a non-zero layer and a tunnel tag, and nothing else, so the page can tell tube platforms apart', () => {
  const sq: [number, number][] = [[L, O], [L, O + 0.0002], [L + 0.0002, O + 0.0002], [L + 0.0002, O], [L, O]];
  const plat = (id: number, tags: Record<string, string>): RawElement => way(id, [id, id + 1, id + 2, id + 3, id], sq, { railway: 'platform', ref: '1', ...tags });
  const d = compactOsm([
    plat(1, {}), // ground level, untagged
    plat(2, { layer: '0' }), // explicit zero: nothing to keep
    plat(3, { layer: '1', level: '1' }), // St Pancras upper level
    plat(4, { layer: '-3', tunnel: 'yes', subway: 'yes' }), // deep tube platform
    plat(5, { tunnel: 'no' }), // not a tunnel
  ]);
  const by = (id: number) => d.platforms.find((p) => p.id === id);
  assert.equal('layer' in (by(1) as object), false);
  assert.equal('tunnel' in (by(1) as object), false);
  assert.equal('layer' in (by(2) as object), false, 'layer 0 is not stored');
  assert.equal(by(3)?.layer, 1);
  assert.equal(by(3)?.tunnel, undefined);
  assert.equal(by(4)?.layer, -3);
  assert.equal(by(4)?.tunnel, true);
  assert.equal(by(5)?.tunnel, undefined, 'tunnel=no is not a tunnel');
});

test('osm: signals, switches and buffers carry position and tags', () => {
  const d = compactOsm(sample);
  assert.deepEqual(d.signals[0]?.kinds, ['main', 'main:form']);
  assert.equal(d.signals[0]?.ref, 'YA1023');
  assert.equal(d.signals[0]?.direction, 'forward');
  assert.equal(d.switches[0]?.type, 'default');
  assert.equal(d.buffers.length, 1);
  assert.equal(d.attribution, '© OpenStreetMap contributors (ODbL)');
});

// ---- graph ----------------------------------------------------------------------------

//   1 --100-- 2 --100-- 3        7 --10-- 8       (two components)
//             |
//             +--300--- 4 --50-- 3  (a longer way round: 2-4-3 = 350, so 2-3 direct wins)
const toy = {
  nodes: [[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 100, 300], [7, 500, 500], [8, 510, 500]] as [number, number, number][],
  rails: [
    { id: 1, nodes: [1, 2, 3], service: 'main' as const, tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 4, 3], service: 'siding' as const, tunnel: true, bridge: false, layer: 0 },
    { id: 3, nodes: [7, 8], service: 'main' as const, tunnel: false, bridge: false, layer: 0 },
  ],
};

test('graph: components are found, largest first', () => {
  const comps = components(buildGraph(toy));
  assert.deepEqual(comps.map((c) => c.length), [4, 2]);
});

test('graph: shortest path takes the shorter branch and reports its length', () => {
  const g = buildGraph(toy);
  const r = shortestPath(g, 1, 3);
  assert.deepEqual(r?.nodes, [1, 2, 3]);
  assert.ok(Math.abs((r?.length ?? 0) - 200) < 1e-9);
  const detour = shortestPath(g, 4, 1);
  assert.deepEqual(detour?.nodes, [4, 2, 1], '4-2-1 (~416) beats 4-3-2-1');
});

test('graph: no route between components or to an unknown node', () => {
  const g = buildGraph(toy);
  assert.equal(shortestPath(g, 1, 7), null);
  assert.equal(shortestPath(g, 1, 999), null);
  assert.equal(shortestPath(g, 999, 1), null);
  assert.equal(shortestPath(g, 999, 999), null, 'an unknown node is not a route to itself');
  assert.deepEqual(shortestPath(g, 1, 1), { nodes: [1], length: 0 }, 'a known node is');
});

test('graph: snap finds the nearest point on an edge and can be limited to a component', () => {
  const g = buildGraph(toy);
  const s = snap(g, [50, 20]);
  assert.ok(s);
  assert.ok(Math.abs(s.distance - 20) < 1e-9 && Math.abs(s.point[0] - 50) < 1e-9);
  // [505, 480] is 20 m from the small 7-8 component and over 400 m from the big one
  assert.ok(Math.abs((snap(g, [505, 480])?.distance ?? 0) - 20) < 1e-9, 'unrestricted, it snaps to 7-8');
  const far = snap(g, [505, 480], new Set([1, 2, 3, 4]));
  assert.ok(far && far.distance > 400, 'restricted to the big component, so it does not snap to 7-8');
});

test('graph: pointAlong walks a route and clamps at both ends', () => {
  const g = buildGraph(toy);
  const r = shortestPath(g, 1, 3);
  assert.ok(r);
  assert.deepEqual(pointAlong(g, r, 150), [150, 0]);
  assert.deepEqual(pointAlong(g, r, -5), [0, 0]);
  assert.deepEqual(pointAlong(g, r, 9999), [200, 0]);
});

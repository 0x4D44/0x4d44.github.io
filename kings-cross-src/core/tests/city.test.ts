// core/city.ts: the compact OSM city (streets, canal, squares, parks, trees), the height, style and bay
// rules for buildings, and the geometry built from them. No three.js and no browser here, so every rule is
// tested on numbers: first on small synthetic cases with an answer worked out by hand, then on the real
// committed data (web/src/data/kx-city.json and kx-track.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { ORIGIN, project, unproject } from '../geo.ts';
import type { Pt } from '../geo.ts';
import { pointInPolygon } from '../station.ts';
import type { KxData } from '../osm.ts';
import { railSegments } from '../scene.ts';
import {
  areaKind, area2, bayLayout, BAY_STRETCH, BRIDGE_LIFT, buildCity, CANAL_WIDTH, CANOPY_CLEARANCE, CANOPY_POST, CANOPY_SLAB, chainage,
  CITY_KEYS, compactCity, DOWN, FACADE, FACADE_TEXELS_PER_M, facadeStyle, facadeTint, flatPolygon, hash01, hasShop, inKxCentral, KXC_BOX,
  LAYER_LIFT, lineLength, MAX_BUILDING, MeshAcc, MIN_BUILDING, MIN_PATH_LENGTH, offsetLine, PARAPET, parseMetres, planBuilding, planHeight,
  post, ringArea, ringCentroid, rgb, ROAD_CLASS, ROAD_STYLE, roadRuns, roadSkipReason, roadWidth, roofTint, SegmentGrid, segmentsCross,
  simplify, SIMPLIFY_TOLERANCE, srgbToLinear, storeyOf, STOREY_RANGE, strip, subLine, triangulate, UP, wallFacesStreet, wallParts, wallsOf,
  windOutward,
} from '../city.ts';
import type { BuildingFacts, CityData, CityRoad, CityKey, FacadeKey, RawCityElement, V2, V3 } from '../city.ts';

const city: CityData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url), 'utf8'));
const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const cityFile = readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url));
const toolText = readFileSync(new URL('../../tools/build-city.ts', import.meta.url), 'utf8');

const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const at = <T>(list: readonly T[], i: number): T => list[i] as T;
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const emptyCity: CityData = { attribution: '', origin: ORIGIN, extract: '', roads: [], canals: [], areas: [], trees: [] };
const facts = (over: Partial<BuildingFacts> = {}): BuildingFacts => ({ id: 11, kind: 'yes', pts: rect(0, 0, 10, 10), ...over });

// --- raw Overpass elements built from local metres, for compactCity ---
const ll = (p: Pt): { lat: number; lon: number } => unproject(p[0], p[1]);
const way = (id: number, tags: Record<string, string>, line: Pt[]): RawCityElement => ({ type: 'way', id, tags, geometry: line.map(ll) });
const ringWay = (id: number, tags: Record<string, string>, ring: Pt[]): RawCityElement => way(id, tags, [...ring, at(ring, 0)]);
const treeNode = (id: number, p: Pt, tags: Record<string, string> = { natural: 'tree' }): RawCityElement => ({ type: 'node', id, tags, lat: ll(p).lat, lon: ll(p).lon });

// --- triangles out of an accumulator ---
interface Tri {
  p: [V3, V3, V3];
  n: V3;
  uv: [V2, V2, V2];
}
function trisOf(m: MeshAcc): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const ix = [at(m.indices, i), at(m.indices, i + 1), at(m.indices, i + 2)];
    const v = (k: number): V3 => [at(m.positions, k * 3), at(m.positions, k * 3 + 1), at(m.positions, k * 3 + 2)];
    const t = (k: number): V2 => [at(m.uvs, k * 2), at(m.uvs, k * 2 + 1)];
    out.push({ p: [v(at(ix, 0)), v(at(ix, 1)), v(at(ix, 2))], n: [at(m.normals, at(ix, 0) * 3), at(m.normals, at(ix, 0) * 3 + 1), at(m.normals, at(ix, 0) * 3 + 2)], uv: [t(at(ix, 0)), t(at(ix, 1)), t(at(ix, 2))] });
  }
  return out;
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const triArea = (t: Tri): number => Math.hypot(...cross3(sub3(t.p[1], t.p[0]), sub3(t.p[2], t.p[0]))) / 2;
const triNormal = (t: Tri): V3 => {
  const c = cross3(sub3(t.p[1], t.p[0]), sub3(t.p[2], t.p[0]));
  const l = Math.hypot(...c);
  return [c[0] / l, c[1] / l, c[2] / l];
};
const centroid3 = (t: Tri): V3 => [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
const areaOf = (m: MeshAcc): number => trisOf(m).reduce((s, t) => s + triArea(t), 0);
/** Is a normal this vector? (Compared by component: a flipped normal has -0 in places, which deepStrictEqual tells apart from 0.) */
const same = (n: V3, want: V3, what = 'normal'): void => {
  for (let k = 0; k < 3; k++) close(n[k] as number, want[k] as number, 1e-9, `${what}[${k}]`);
};
const ys = (m: MeshAcc): number[] => m.positions.filter((_, i) => i % 3 === 1);
const minOf = (a: readonly number[]): number => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a: readonly number[]): number => a.reduce((m, v) => (v > m ? v : m), -Infinity);
/** Does a ring cross itself? (A ring that does is not a simple polygon, so its triangle area is not defined.) */
function selfIntersects(ring: readonly Pt[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(at(ring, i), at(ring, (i + 1) % n), at(ring, j), at(ring, (j + 1) % n))) return true;
    }
  }
  return false;
}

// =============================================================================================
// 1. the committed data

// the Overpass box of tools/build-city.ts (south, west, north, east)
const BOX = { south: 51.5275, west: -0.1315, north: 51.5405, east: -0.1140 };

test('the committed city file: exact counts, unique sorted ids, whole rings, attribution and extract date', () => {
  assert.equal(city.roads.length, 1406);
  assert.equal(city.canals.length, 7);
  assert.equal(city.areas.length, 309);
  assert.equal(city.trees.length, 1086);
  for (const [name, list] of [['roads', city.roads], ['canals', city.canals], ['areas', city.areas]] as const) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${name}: ids are unique`);
    assert.ok(list.every((x, i) => i === 0 || (list[i - 1] as { id: number }).id <= x.id), `${name}: sorted by id, so a rebuild makes a small diff`);
  }
  assert.ok(city.roads.every((r) => r.pts.length >= 2), 'every street has two points or more');
  assert.ok(city.canals.every((r) => r.pts.length >= 2));
  assert.ok(city.areas.every((a) => a.pts.length >= 3), 'every area is a ring of three points or more');
  assert.ok(city.areas.every((a) => !(at(a.pts, 0)[0] === at(a.pts, a.pts.length - 1)[0] && at(a.pts, 0)[1] === at(a.pts, a.pts.length - 1)[1])), 'no ring repeats its first point');
  assert.ok([...city.roads, ...city.canals, ...city.areas].every((x) => x.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))));
  assert.match(city.attribution, /OpenStreetMap/);
  assert.match(city.attribution, /ODbL/);
  assert.match(city.extract, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(city.origin, ORIGIN);
});

test('the committed city file: the streets by class, and every class is one the drawing knows', () => {
  const hist: Record<string, number> = {};
  for (const r of city.roads) hist[r.cls] = (hist[r.cls] ?? 0) + 1;
  assert.deepEqual(hist, { trunk: 130, primary: 175, secondary: 1, tertiary: 39, minor: 300, service: 216, pedestrian: 31, path: 393, cycleway: 121 });
  assert.ok(city.roads.every((r) => r.cls in ROAD_STYLE));
  assert.equal(city.roads.filter((r) => r.bridge).length, 18);
  assert.equal(city.roads.filter((r) => r.oneway).length, 402);
  assert.equal(city.roads.filter((r) => r.width !== undefined).length, 35);
  assert.equal(city.roads.filter((r) => r.lanes !== undefined).length, 367);
  assert.ok(city.roads.every((r) => r.width === undefined || (r.width > 0 && r.width <= 60)));
  assert.ok(city.roads.every((r) => r.lanes === undefined || (r.lanes >= 1 && r.lanes <= 8)));
  const kinds: Record<string, number> = {};
  for (const a of city.areas) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { grass: 237, wood: 4, water: 6, pitch: 33, paved: 29 });
});

test('the committed city file: everything lies inside the Overpass box (a way may run out of it; one relation member lies just outside)', () => {
  const [x0, z0] = project(BOX.north, BOX.west);
  const [x1, z1] = project(BOX.south, BOX.east);
  const margin = 5;
  const touches = (pts: readonly Pt[]): boolean => {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return !(maxOf(xs) < x0 - margin || minOf(xs) > x1 + margin || maxOf(zs) < z0 - margin || minOf(zs) > z1 + margin);
  };
  // Barnard Park, id 14351765: a multipolygon whose other member is inside the box
  const OUTSIDE = new Set([14351765]);
  for (const r of city.roads) assert.ok(touches(r.pts), `road ${r.id} ${r.name ?? ''} is in the box`);
  for (const c of city.canals) assert.ok(touches(c.pts), `canal ${c.id} is in the box`);
  for (const a of city.areas) assert.ok(touches(a.pts) || OUTSIDE.has(a.id), `area ${a.id} ${a.name ?? ''} is in the box`);
  for (const t of city.trees) assert.ok(t[0] >= x0 - 1 && t[0] <= x1 + 1 && t[1] >= z0 - 1 && t[1] <= z1 + 1, `tree ${t} is in the box`);
  // the box itself is where the doc says: about 1.2 km by 1.4 km around the station
  close(x1 - x0, 1210.5, 1, 'box width');
  close(z1 - z0, 1445.5, 1, 'box depth');
});

test('the committed city file has the places that make King\'s Cross: Euston Road, Pancras Road, York Way, the canal, the squares and the park', () => {
  const road = (re: RegExp): CityRoad[] => city.roads.filter((r) => r.name !== undefined && re.test(r.name));
  assert.ok(road(/^Euston Road$/).filter((r) => r.cls === 'trunk').length >= 50, 'Euston Road is trunk (a cycle track and one link carry its name too)');
  assert.ok(road(/^Pancras Road$/).length >= 5);
  assert.ok(road(/^York Way$/).length >= 5);
  assert.ok(road(/^Goods Way$/).some((r) => r.cls === 'tertiary'));
  assert.ok(road(/^King's Boulevard$/).some((r) => r.cls === 'pedestrian'));
  assert.ok(city.canals.some((c) => c.name === "Regent's Canal" && c.pts.length >= 10));
  const area = (name: string): (typeof city.areas)[number] => {
    const a = city.areas.find((x) => x.name === name);
    assert.ok(a, `the area ${name} is there`);
    return a as (typeof city.areas)[number];
  };
  assert.equal(area("King's Cross Square").kind, 'paved');
  assert.equal(area('Pancras Square').kind, 'paved');
  assert.equal(area('Lewis Cubitt Square').kind, 'paved');
  assert.equal(area('Camley Street Natural Park').kind, 'wood');
  assert.equal(area('St Pancras Gardens').kind, 'grass');
  assert.equal(area('Battlebridge Basin').kind, 'water');
  // King's Cross Square is in front of the station: east of the origin, south of the platform ends (z > 0 is south)
  const c = ringCentroid(area("King's Cross Square").pts);
  assert.ok(c[0] > -60 && c[0] < 90 && c[1] > -25 && c[1] < 70, `King's Cross Square is at ${c}`);
});

test('the compact file is small: under 260 kB, under 75 kB gzipped (it ships in the page)', () => {
  assert.ok(cityFile.length < 260_000, `${cityFile.length} bytes`);
  assert.ok(gzipSync(cityFile).length < 75_000, `${gzipSync(cityFile).length} bytes gzipped`);
});

test('the tool that builds the file records the Overpass query, the box and the date it was fetched', () => {
  assert.match(toolText, /Recorded fetch: 2026-11-08/);
  assert.ok(toolText.includes(city.extract), 'the header names the extract timestamp the file carries');
  assert.ok(toolText.includes(`(${BOX.south},${BOX.west},${BOX.north},${BOX.east.toFixed(4)})`), 'the query box is the one the tests check');
  assert.match(toolText, /overpass-api\.de/);
  assert.match(toolText, /ODbL/);
  assert.match(toolText, /export const QUERY/);
});

// =============================================================================================
// 2. turning an Overpass extract into the compact file

test('roadSkipReason: which highway ways are not drawn, and why', () => {
  assert.equal(roadSkipReason({ highway: 'residential' }), undefined);
  assert.equal(roadSkipReason({ highway: 'footway', layer: '1' }), undefined);
  assert.equal(roadSkipReason({ highway: 'service', service: 'alley' }), undefined);
  assert.equal(roadSkipReason({ highway: 'steps' }), 'class');
  assert.equal(roadSkipReason({ highway: 'corridor' }), 'class');
  assert.equal(roadSkipReason({}), 'class');
  assert.equal(roadSkipReason({ highway: 'footway', area: 'yes' }), 'area');
  assert.equal(roadSkipReason({ highway: 'primary', tunnel: 'yes' }), 'tunnel');
  assert.equal(roadSkipReason({ highway: 'service', tunnel: 'building_passage' }), 'tunnel');
  assert.equal(roadSkipReason({ highway: 'primary', tunnel: 'no' }), undefined);
  assert.equal(roadSkipReason({ highway: 'footway', indoor: 'yes' }), 'indoor');
  assert.equal(roadSkipReason({ highway: 'footway', layer: '-1' }), 'underground');
  for (const service of ['parking_aisle', 'driveway', 'emergency_access']) assert.equal(roadSkipReason({ highway: 'service', service }), 'service way', service);
  for (const footway of ['sidewalk', 'crossing', 'traffic_island']) assert.equal(roadSkipReason({ highway: 'footway', footway }), 'footway kind', footway);
  assert.equal(roadSkipReason({ highway: 'footway', footway: 'access_aisle' }), undefined);
});

test('ROAD_CLASS maps every highway the query asks for to a class the drawing has', () => {
  for (const cls of Object.values(ROAD_CLASS)) assert.ok(cls in ROAD_STYLE, cls);
  assert.equal(ROAD_CLASS.motorway_link, 'trunk');
  assert.equal(ROAD_CLASS.residential, 'minor');
  assert.equal(ROAD_CLASS.living_street, 'minor');
  assert.equal(ROAD_CLASS.footway, 'path');
  assert.equal(ROAD_CLASS.cycleway, 'cycleway');
  assert.equal(ROAD_CLASS.steps, undefined);
});

test('areaKind: which closed ways are drawn, and as what', () => {
  const kind = (tags: Record<string, string>): string | undefined => areaKind(tags);
  assert.equal(kind({ natural: 'water' }), 'water');
  assert.equal(kind({ highway: 'pedestrian', area: 'yes' }), 'paved');
  assert.equal(kind({ highway: 'footway', area: 'yes' }), 'paved');
  for (const v of ['pedestrian', 'footway', 'cycleway']) assert.equal(kind({ 'area:highway': v }), 'paved', v);
  assert.equal(kind({ 'area:highway': 'primary' }), undefined, 'a carriageway area is the street, not a square');
  assert.equal(kind({ natural: 'wood' }), 'wood');
  assert.equal(kind({ landuse: 'forest' }), 'wood');
  assert.equal(kind({ place: 'square' }), 'paved');
  assert.equal(kind({ place: 'square', leisure: 'park' }), 'grass');
  assert.equal(kind({ place: 'square', surface: 'grass' }), 'grass');
  for (const leisure of ['park', 'garden', 'common', 'nature_reserve']) assert.equal(kind({ leisure }), 'grass', leisure);
  for (const landuse of ['grass', 'recreation_ground', 'village_green', 'meadow', 'flowerbed', 'allotments', 'cemetery']) assert.equal(kind({ landuse }), 'grass', landuse);
  for (const natural of ['grassland', 'heath', 'scrub']) assert.equal(kind({ natural }), 'grass', natural);
  assert.equal(kind({ leisure: 'pitch' }), 'pitch');
  assert.equal(kind({ leisure: 'pitch', surface: 'grass' }), 'grass');
  assert.equal(kind({ leisure: 'playground' }), 'pitch');
  assert.equal(kind({ building: 'yes' }), undefined);
  assert.equal(kind({ landuse: 'retail' }), undefined);
  assert.equal(kind({}), undefined);
});

test('parseMetres reads a width tag in metres and refuses feet, zero, negatives and nonsense', () => {
  assert.equal(parseMetres('7'), 7);
  assert.equal(parseMetres('7.5'), 7.5);
  assert.equal(parseMetres('7 m'), 7);
  assert.equal(parseMetres('60'), 60);
  for (const bad of ["12'", '12 ft', '8"', 'abc', '', '0', '-3', '61', '1e9']) assert.equal(parseMetres(bad), undefined, bad);
  assert.equal(parseMetres(undefined), undefined);
});

/** The distance from a point to a polyline. */
function distToLine(p: Pt, line: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = at(line, i);
    const b = at(line, i + 1);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)));
  }
  return best;
}

test('simplify: drops what is within the tolerance, keeps the ends and the corners, and moves nothing by more than the tolerance', () => {
  assert.deepEqual(simplify([[0, 0], [5, 0.1], [10, 0]], 0.25), [[0, 0], [10, 0]]);
  assert.deepEqual(simplify([[0, 0], [5, 0.5], [10, 0]], 0.25), [[0, 0], [5, 0.5], [10, 0]], 'a half-metre kink is kept');
  assert.deepEqual(simplify([[0, 0], [10, 0], [10, 10]], 0.25), [[0, 0], [10, 0], [10, 10]], 'a right angle is kept');
  assert.deepEqual(simplify([[1, 2], [3, 4]], 0.25), [[1, 2], [3, 4]]);
  assert.deepEqual(simplify([[1, 2]], 0.25), [[1, 2]]);
  // a wobbly line: every original vertex stays within the tolerance of the simplified line
  const line: Pt[] = [];
  for (let i = 0; i < 200; i++) line.push([i * 3, Math.sin(i / 7) * 6 + Math.sin(i * 1.3) * 0.4]);
  const s = simplify(line, SIMPLIFY_TOLERANCE);
  assert.ok(s.length < line.length && s.length > 20, `${line.length} -> ${s.length}`);
  assert.deepEqual(at(s, 0), at(line, 0));
  assert.deepEqual(at(s, s.length - 1), at(line, line.length - 1));
  for (const p of line) assert.ok(distToLine(p, s) <= SIMPLIFY_TOLERANCE + 1e-9, `${p} is ${distToLine(p, s)} from the simplified line`);
});

test('compactCity: keeps the streets that are drawn with their tags, drops the rest, and projects to metres', () => {
  const elements: RawCityElement[] = [
    // a street with a 5 cm wobble in the middle (simplified away), a width, lanes and one-way
    way(100, { highway: 'residential', name: 'Test Street', width: '7 m', lanes: '2', oneway: 'yes' }, [[0, 0], [50, 0.05], [100, 0]]),
    // the same id again: the extract lists a way once per query clause, the model once
    way(100, { highway: 'residential', name: 'Duplicate' }, [[0, 10], [10, 10]]),
    way(101, { highway: 'footway' }, [[0, 20], [5, 20]]), // 5 m: a kerb ramp, not a path
    way(102, { highway: 'footway' }, [[0, 30], [20, 30]]), // 20 m: kept
    way(103, { highway: 'service', service: 'driveway' }, [[0, 40], [30, 40]]),
    way(104, { highway: 'steps' }, [[0, 50], [10, 50]]),
    way(105, { highway: 'primary', tunnel: 'yes' }, [[0, 60], [60, 60]]),
    way(106, { highway: 'primary', bridge: 'yes', layer: '1' }, [[0, 70], [60, 70]]),
    way(107, { highway: 'primary', bridge: 'yes' }, [[0, 80], [60, 80]]), // a bridge with no layer is not lifted
    way(108, { highway: 'minor' }, [[0, 90], [5, 90]]), // not a highway class at all
    way(109, { highway: 'residential', lanes: '12', width: "9'" }, [[0, 100], [30, 100]]), // 12 lanes and feet: both refused
    way(110, { highway: 'cycleway' }, [[0, 110], [6, 110]]), // a 6 m cycleway: dropped like a short path
    way(111, { highway: 'residential' }, [[0, 120], [6, 120]]), // a 6 m street is kept: only paths are dropped by length
    way(200, { waterway: 'canal', name: 'Test Canal', width: '9' }, [[0, 200], [60, 210], [120, 200]]),
    way(201, { waterway: 'canal', tunnel: 'yes' }, [[0, 220], [60, 220]]),
    way(202, { waterway: 'river' }, [[0, 230], [60, 230]]),
    ringWay(300, { leisure: 'park', name: 'Test Park' }, rect(0, 300, 40, 340)),
    way(301, { leisure: 'park' }, [[0, 400], [40, 400], [40, 440], [0, 440]]), // open: not a ring
    ringWay(302, { natural: 'water' }, rect(0, 500, 20, 520)),
    ringWay(303, { building: 'yes' }, rect(0, 600, 20, 620)), // not a surface we draw
    {
      type: 'relation',
      id: 400,
      tags: { type: 'multipolygon', natural: 'water', name: 'Test Basin' },
      members: [
        { type: 'way', ref: 401, role: 'outer', geometry: [...rect(0, 700, 30, 730), at(rect(0, 700, 30, 730), 0)].map(ll) },
        { type: 'way', ref: 402, role: 'inner', geometry: [...rect(10, 710, 20, 720), at(rect(10, 710, 20, 720), 0)].map(ll) },
        { type: 'way', ref: 403, role: 'outer', geometry: [[0, 800], [30, 800], [30, 830]].map((p) => ll(p as Pt)) }, // open: skipped
      ],
    },
    treeNode(500, [10, 10]),
    treeNode(501, [20, 20], {}),
    treeNode(500, [99, 99]), // duplicate id
  ];
  const out = compactCity(elements, ORIGIN, '2026-01-01T00:00:00Z');
  const road = (id: number) => out.roads.find((r) => r.id === id);
  assert.deepEqual(out.roads.map((r) => r.id), [100, 102, 106, 107, 109, 111], 'sorted by id; the short path, driveway, steps, tunnel, unknown class and short cycleway are gone');
  const a = road(100);
  assert.ok(a);
  assert.equal(a.cls, 'minor');
  assert.equal(a.name, 'Test Street');
  assert.equal(a.width, 7);
  assert.equal(a.lanes, 2);
  assert.equal(a.oneway, true);
  assert.equal(a.pts.length, 2, 'the 5 cm wobble is simplified away');
  close(at(a.pts, 1)[0], 100, 0.15);
  close(at(a.pts, 1)[1], 0, 0.15);
  assert.equal(road(102)?.cls, 'path');
  assert.equal(road(106)?.bridge, true);
  assert.equal(road(107)?.bridge, undefined, 'bridge=yes with no layer is not a bridge over the railway');
  assert.equal(road(109)?.lanes, undefined, '12 lanes is nonsense');
  assert.equal(road(109)?.width, undefined, 'a width in feet is refused');
  assert.equal(road(111)?.cls, 'minor');
  assert.ok(MIN_PATH_LENGTH > 6 && MIN_PATH_LENGTH <= 10);
  assert.deepEqual(out.canals.map((c) => c.id), [200], 'the tunnelled canal and the river are not drawn');
  assert.equal(out.canals[0]?.name, 'Test Canal');
  assert.equal(out.canals[0]?.width, 9);
  assert.deepEqual(out.areas.map((x) => [x.id, x.kind]), [[300, 'grass'], [302, 'water'], [401, 'water']], 'the open way, the building and the open outer ring are not areas; a relation uses its outer member id');
  assert.equal(out.areas[0]?.pts.length, 4, 'the closing point is not repeated');
  assert.equal(out.areas[0]?.name, 'Test Park');
  assert.deepEqual(out.trees.length, 1, 'only natural=tree nodes, once each');
  close(at(out.trees, 0)[0], 10, 0.15);
  assert.equal(out.extract, '2026-01-01T00:00:00Z');
  assert.match(out.attribution, /OpenStreetMap/);
});

// =============================================================================================
// 3. widths

test('roadWidth: the width tag wins, then lanes times the lane width, then the class default', () => {
  assert.deepEqual(roadWidth({ cls: 'minor', width: 7 }), { width: 7, basis: 'tag' });
  assert.deepEqual(roadWidth({ cls: 'trunk', width: 9, lanes: 6 }), { width: 9, basis: 'tag' }, 'the tag beats the lanes');
  assert.deepEqual(roadWidth({ cls: 'minor', width: 100 }), { width: 40, basis: 'tag' });
  assert.deepEqual(roadWidth({ cls: 'minor', width: 0.2 }), { width: 1, basis: 'tag' });
  const four = roadWidth({ cls: 'trunk', lanes: 4 });
  assert.equal(four.basis, 'lanes');
  close(four.width, 4 * ROAD_STYLE.trunk.lane, 1e-9);
  const one = roadWidth({ cls: 'minor', lanes: 1 });
  close(one.width, ROAD_STYLE.minor.width * 0.6, 1e-9, 'one lane is not narrower than 60% of the class width');
  assert.deepEqual(roadWidth({ cls: 'path', lanes: 3 }), { width: ROAD_STYLE.path.width, basis: 'class' }, 'a path has no lanes');
  assert.deepEqual(roadWidth({ cls: 'service' }), { width: 3.5, basis: 'class' });
});

test('ROAD_STYLE: wider classes are not narrower, roads have pavements and paths are paving', () => {
  const order = ['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk'] as const;
  for (let i = 1; i < order.length; i++) assert.ok(ROAD_STYLE[at(order, i)].width >= ROAD_STYLE[at(order, i - 1)].width, `${at(order, i)} is as wide as ${at(order, i - 1)}`);
  for (const cls of ['trunk', 'primary', 'secondary', 'tertiary', 'minor'] as const) {
    assert.equal(ROAD_STYLE[cls].surface, 'asphalt');
    assert.ok(ROAD_STYLE[cls].pavement >= 2, `${cls} has a pavement of at least 2 m (the usual minimum footway)`);
  }
  for (const cls of ['pedestrian', 'path', 'cycleway'] as const) {
    assert.equal(ROAD_STYLE[cls].surface, 'paving');
    assert.equal(ROAD_STYLE[cls].pavement, 0);
  }
  assert.equal(ROAD_STYLE.service.pavement, 0);
  assert.equal(CANAL_WIDTH, 9);
});

// =============================================================================================
// 4. building rules: height, style, shops

test('planHeight: a height tag wins, then levels times the storey, then the assumed storeys of the kind', () => {
  const tag = planHeight(facts({ height: 12.45 }), 'stock');
  assert.equal(tag.basis, 'height');
  close(tag.height, 12.45, 1e-9);
  assert.equal(tag.storeys, 4);
  close(tag.storeyHeight, 3.0, 1e-9); // (12.45 - 0.45 parapet) / 4
  const lev = planHeight(facts({ levels: 4 }), 'stock');
  assert.equal(lev.basis, 'levels');
  close(lev.height, 4 * 3.3 + PARAPET, 1e-9);
  assert.equal(lev.storeys, 4);
  close(lev.storeyHeight, 3.3, 1e-9);
  // a levels tag that fights the height tag (10 levels in 12.45 m): the height wins and the storeys are refitted to real ones
  const odd = planHeight(facts({ height: 12.45, levels: 10 }), 'stock');
  assert.equal(odd.basis, 'height');
  assert.equal(odd.storeys, 4);
  close(odd.storeyHeight, 3.0, 1e-9);
  const house = planHeight(facts({ kind: 'house', pts: rect(0, 0, 8, 10) }), 'stock'); // 80 m2
  assert.equal(house.basis, 'assumed');
  assert.equal(house.storeys, 3);
  close(house.height, 3 * 3.3 + PARAPET, 1e-9);
  const office = planHeight(facts({ kind: 'office' }), 'glass');
  assert.equal(office.storeys, 6);
  close(office.height, 6 * 3.9 + PARAPET, 1e-9);
  // a small unlabelled block is not a town house
  assert.equal(planHeight(facts({ kind: 'house', pts: rect(0, 0, 4, 5) }), 'stock').storeys, 1, 'under 25 m2: one storey');
  assert.equal(planHeight(facts({ kind: 'house', pts: rect(0, 0, 6, 8) }), 'stock').storeys, 2, 'under 60 m2: at most two');
  assert.equal(planHeight(facts({ kind: 'kiosk', pts: rect(0, 0, 10, 10) }), 'stock').storeys, 1);
  assert.equal(planHeight(facts({ kind: 'unheard-of', pts: rect(0, 0, 10, 10) }), 'stock').storeys, 3, 'an unknown kind is three storeys');
  // limits
  close(planHeight(facts({ height: 1 }), 'stock').height, MIN_BUILDING, 1e-9);
  close(planHeight(facts({ height: 300 }), 'stock').height, MAX_BUILDING, 1e-9);
  assert.equal(planHeight(facts({ height: 1 }), 'stock').storeys, 1);
});

test('planHeight: n storeys of s metres plus the parapet is exactly the height, whatever the tags say', () => {
  const styles = Object.keys(FACADE) as FacadeKey[];
  for (const style of styles) {
    for (let h = 2; h <= 140; h += 0.7) {
      for (const levels of [undefined, 1, 2, 5, 12]) {
        const p = planHeight(facts({ height: h, levels }), style);
        close(p.storeys * p.storeyHeight + PARAPET, p.height, 1e-9, `${style} h=${h} levels=${levels}`);
        assert.ok(p.storeys >= 1 && Number.isInteger(p.storeys));
        // a real storey, never a pancake or a cathedral: a levels tag is kept while its storey is in STOREY_RANGE (2.5 to 4.8 m),
        // otherwise round(usable / tile) refits it, which can leave a storey a little outside that range (and 5.85 m at most, for
        // a one-storey glass building)
        assert.ok(p.storeyHeight >= 2.2 && p.storeyHeight <= 6, `${style} h=${h} levels=${levels}: storey ${p.storeyHeight}`);
      }
    }
  }
});

test('planBuilding on every real building: a valid, fitted plan, with the basis the tags give', () => {
  let height = 0;
  let levels = 0;
  let assumed = 0;
  for (const b of data.buildings) {
    const p = planBuilding(b);
    const basis = b.height !== undefined ? 'height' : b.levels !== undefined && b.levels >= 1 ? 'levels' : 'assumed';
    if (p.canopy) {
      assert.equal(b.kind, 'roof');
      continue;
    }
    assert.equal(p.basis, basis, `${b.id}`);
    if (basis === 'height') {
      height++;
      close(p.height, Math.min(MAX_BUILDING, Math.max(MIN_BUILDING, b.height as number)), 1e-9, `${b.id} takes its height tag`);
    } else if (basis === 'levels') levels++;
    else assumed++;
    assert.ok(p.height >= MIN_BUILDING && p.height <= MAX_BUILDING);
    assert.ok(p.storeyHeight >= 2.2 && p.storeyHeight <= 6, `${b.id}: a storey of ${p.storeyHeight} m`);
    close(p.storeys * p.storeyHeight + PARAPET, p.height, 1e-9, `${b.id}`);
    assert.ok(Number.isInteger(p.storeys) && p.storeys >= 1);
    assert.equal(p.id, b.id);
    assert.ok(area2(p.ring) >= 0, 'wound outward');
    assert.equal(p.ring.length, b.pts.length);
  }
  assert.equal(height + levels + assumed + data.buildings.filter((b) => b.kind === 'roof').length, data.buildings.length);
  // what the map really says: 23 height tags and 283 levels tags in 1046 buildings; 732 heights are ASSUMED from the kind
  assert.deepEqual({ height, levels, assumed }, { height: 23, levels: 283, assumed: 732 });
});

test('facadeStyle: the rules in order, by name, kind, size and place', () => {
  const big = rect(0, 0, 60, 60); // 3600 m2
  const mid = rect(0, 0, 20, 20); // 400 m2
  const kxc = (r: Pt[]): Pt[] => r.map((p) => [p[0] - 100, p[1] - 600]); // inside King's Cross Central
  const style = (b: Partial<BuildingFacts>): FacadeKey => facadeStyle(facts(b));
  assert.equal(style({ name: 'Coal Drops Yard', kind: 'retail' }), 'red', 'old brick by name');
  assert.equal(style({ name: 'The Granary', kind: 'office', levels: 9 }), 'red');
  assert.equal(style({ kind: 'office', levels: 5, pts: mid }), 'glass');
  assert.equal(style({ kind: 'office', levels: 2, pts: big }), 'glass', 'a big office is glass');
  assert.equal(style({ kind: 'office', levels: 2, pts: mid }), 'panel');
  assert.equal(style({ kind: 'church' }), 'stone');
  assert.equal(style({ kind: 'hotel' }), 'stone');
  for (const kind of ['school', 'warehouse', 'industrial', 'silo', 'service', 'gatehouse', 'disused_station', 'university']) assert.equal(style({ kind }), 'red', kind);
  for (const kind of ['civic', 'dormitory', 'construction', 'train_station']) assert.equal(style({ kind }), 'panel', kind);
  assert.equal(style({ kind: 'sports_hall' }), 'stock');
  assert.equal(style({ kind: 'commercial', levels: 6, pts: mid }), 'panel', 'a tall commercial block outside King\'s Cross Central');
  assert.equal(style({ kind: 'commercial', levels: 6, pts: kxc(mid) }), 'glass', 'and inside it');
  assert.equal(style({ kind: 'commercial', levels: 3, pts: rect(0, 0, 15, 15) }), 'stock', 'a small low commercial building');
  assert.equal(style({ kind: 'commercial', levels: 3, pts: big }), 'panel');
  assert.equal(style({ kind: 'apartments', levels: 8, pts: mid }), 'panel');
  assert.equal(style({ kind: 'apartments', levels: 3, pts: kxc(mid) }), 'panel', 'new flats in King\'s Cross Central');
  assert.equal(style({ kind: 'house', levels: 8, pts: mid }), 'panel', 'seven storeys is not a terrace');
  assert.equal(style({ kind: 'yes', levels: 2, pts: kxc(big) }), 'panel', 'a big unlabelled block in King\'s Cross Central');
  // the Georgian and Victorian street: mostly London stock, some stucco, some red, never a terrace in red
  const share: Record<string, number> = {};
  const N = 20_000;
  for (let id = 1; id <= N; id++) {
    const s = facadeStyle({ id, kind: 'house', pts: mid.map((p) => [p[0] + 400, p[1] + 300] as Pt) });
    share[s] = (share[s] ?? 0) + 1;
  }
  close((share.stone ?? 0) / N, 0.14, 0.015, 'stucco share');
  close((share.red ?? 0) / N, 0.16, 0.015, 'red brick share');
  close((share.stock ?? 0) / N, 0.7, 0.02, 'stock brick share');
  for (let id = 1; id <= 2000; id++) assert.notEqual(facadeStyle({ id, kind: 'terrace', pts: mid.map((p) => [p[0] + 400, p[1] + 300] as Pt) }), 'red', 'a terrace is stock or stucco');
  // the same building looks the same every time
  for (let id = 1; id <= 50; id++) assert.equal(facadeStyle({ id, kind: 'yes', pts: mid }), facadeStyle({ id, kind: 'yes', pts: mid }));
});

test('facadeStyle over the real map uses every facade but the shopfront, and the storey of a style is its tile height', () => {
  const used: Record<string, number> = {};
  for (const b of data.buildings) {
    if (b.kind === 'roof') continue;
    const s = facadeStyle(b);
    used[s] = (used[s] ?? 0) + 1;
  }
  for (const key of ['stock', 'red', 'stone', 'panel', 'glass']) assert.ok((used[key] ?? 0) >= 15, `${key}: ${used[key] ?? 0} buildings`);
  assert.equal(used.shop, undefined, 'a shopfront is a ground storey, never a whole building');
  assert.ok((used.stock ?? 0) > (used.red ?? 0) && (used.stock ?? 0) > (used.stone ?? 0), 'London stock is the commonest');
  for (const key of Object.keys(FACADE) as FacadeKey[]) assert.equal(storeyOf(key), FACADE[key].tile[1]);
});

test('hasShop: retail always, houses never, a small low commercial building or a named cafe, nothing huge', () => {
  assert.equal(hasShop(facts({ kind: 'retail' })), true);
  assert.equal(hasShop(facts({ kind: 'retail', pts: rect(0, 0, 80, 80) })), true, 'retail is retail at any size');
  for (const kind of ['house', 'terrace', 'church', 'school', 'warehouse', 'industrial', 'service', 'kiosk', 'gatehouse', 'university', 'civic']) assert.equal(hasShop(facts({ kind, name: 'Joe Cafe' })), false, kind);
  assert.equal(hasShop(facts({ kind: 'commercial', levels: 3, pts: rect(0, 0, 15, 15) })), true);
  assert.equal(hasShop(facts({ kind: 'commercial', levels: 6, pts: rect(0, 0, 15, 15) })), false, 'a tall commercial block is offices');
  assert.equal(hasShop(facts({ kind: 'commercial', levels: 3, pts: rect(0, 0, 50, 50) })), false, 'over 1500 m2');
  assert.equal(hasShop(facts({ kind: 'hotel', levels: 4, pts: rect(0, 0, 20, 20) })), true);
  assert.equal(hasShop(facts({ kind: 'yes', name: "Joe's Pizza" })), true);
  assert.equal(hasShop(facts({ kind: 'yes', name: 'Tesco Express' })), true);
  assert.equal(hasShop(facts({ kind: 'yes' })), false);
  assert.equal(hasShop(facts({ kind: 'yes', name: 'Tesco Express', pts: rect(0, 0, 80, 80) })), false, 'over 3000 m2 is not a shop');
  assert.equal(hasShop(facts({ kind: 'yes', name: 'Fisher Building' })), false);
});

// =============================================================================================
// 5. facade layout and walls

test('bayLayout: whole bays on a wall, never a window cut by a corner, a blank wall when it will not fit', () => {
  const eq = (len: number, bay: number, bays: number, stretch: number): void => {
    const l = bayLayout(len, bay);
    assert.equal(l.bays, bays, `${len} m of ${bay} m bays`);
    close(l.stretch, stretch, 1e-9, `${len} m of ${bay} m bays`);
  };
  eq(10.8, 2.7, 4, 1);
  eq(5.4, 2.7, 2, 1);
  eq(6, 2.7, 2, 6 / 5.4);
  eq(2.7, 2.7, 1, 1);
  eq(3.9, 2.7, 1, 3.9 / 2.7); // 1.444: just inside the limit
  eq(2.0, 2.7, 0, 1); // 0.74: a window would be squeezed too far
  eq(4.0, 2.7, 0, 1); // 1.48: stretched too far
  eq(0.5, 3.0, 0, 1);
  assert.deepEqual(BAY_STRETCH, [0.8, 1.45]);
  for (const bay of [1.5, 2.7, 3.0]) {
    for (let len = 0.1; len < 80; len += 0.37) {
      const l = bayLayout(len, bay);
      if (l.bays === 0) {
        assert.equal(l.stretch, 1);
        continue;
      }
      assert.ok(Number.isInteger(l.bays));
      assert.ok(l.stretch >= BAY_STRETCH[0] - 1e-12 && l.stretch <= BAY_STRETCH[1] + 1e-12, `${len} m: stretch ${l.stretch}`);
      close(l.bays * bay * l.stretch, len, 1e-9, `${len} m is a whole number of bays`);
    }
  }
});

test('windOutward and wallsOf: unit outward normals for a ring wound either way, and the walls add up to the perimeter', () => {
  const cw = rect(0, 0, 10, 6);
  const ccw = cw.slice().reverse();
  for (const ring of [cw, ccw]) {
    const wound = windOutward(ring);
    assert.ok(area2(wound) > 0);
    const walls = wallsOf(wound);
    assert.equal(walls.length, 4);
    close(walls.reduce((s, w) => s + w.length, 0), 32, 1e-9, 'perimeter');
    const c = ringCentroid(wound);
    for (const w of walls) {
      close(Math.hypot(w.normal[0], w.normal[1]), 1, 1e-9, 'unit normal');
      assert.ok((w.mid[0] - c[0]) * w.normal[0] + (w.mid[1] - c[1]) * w.normal[1] > 0, `wall ${w.i} faces out of the building`);
    }
  }
  assert.deepEqual(wallsOf(windOutward(cw))[0]?.normal, [0, -1], 'the north wall of a block faces north (-z)');
  assert.equal(wallsOf([[0, 0], [0, 0], [10, 0], [10, 6]]).length, 3, 'a doubled vertex makes no wall');
  assert.equal(ringArea(cw), 60);
  assert.deepEqual(ringCentroid(cw), [5, 3]);
});

test('every wall of every real building faces out: a step outside the wall is outside the footprint', () => {
  let walls = 0;
  let wrong = 0;
  for (const b of data.buildings) {
    if (selfIntersects(b.pts)) continue;
    const ring = windOutward(b.pts);
    for (const w of wallsOf(ring)) {
      if (w.length < 0.5) continue;
      walls++;
      const out: Pt = [w.mid[0] + w.normal[0] * 0.05, w.mid[1] + w.normal[1] * 0.05];
      const inn: Pt = [w.mid[0] - w.normal[0] * 0.05, w.mid[1] - w.normal[1] * 0.05];
      if (pointInPolygon(out, ring) || !pointInPolygon(inn, ring)) wrong++;
    }
  }
  assert.ok(walls > 4000, `${walls} walls checked`);
  assert.ok(wrong / walls < 0.005, `${wrong} of ${walls} walls face the wrong way`);
});

test('triangulate: the triangles cover the polygon exactly, for convex and concave rings wound either way', () => {
  const coverage = (ring: Pt[]): number => {
    const t = triangulate(ring);
    assert.equal(t.length % 3, 0);
    let s = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = at(ring, at(t, i));
      const b = at(ring, at(t, i + 1));
      const c = at(ring, at(t, i + 2));
      s += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    return s;
  };
  const L: Pt[] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
  const C: Pt[] = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [30, 20], [30, 30], [0, 30]];
  const comb: Pt[] = [[0, 0], [50, 0], [50, 20], [40, 20], [40, 5], [30, 5], [30, 20], [20, 20], [20, 5], [10, 5], [10, 20], [0, 20]];
  for (const [ring, area] of [[rect(0, 0, 10, 10), 100], [L, 300], [C, 700], [comb, 700]] as [Pt[], number][]) {
    close(coverage(ring), ringArea(ring), 1e-6, 'forward');
    close(coverage(ring.slice().reverse()), ringArea(ring), 1e-6, 'reversed');
    close(ringArea(ring), area, 1e-9, 'the area is what the shape says');
    assert.equal(triangulate(ring).length / 3, ring.length - 2, 'a simple ring of n points has n - 2 triangles');
  }
  close(coverage([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]]), 100, 1e-9, 'a vertex in the middle of an edge');
  assert.deepEqual(triangulate([[0, 0], [1, 1]]), []);
  assert.equal(triangulate([[0, 0], [4, 0], [0, 3]]).length, 3);
  // a ring that crosses itself still ends (a bow tie)
  assert.ok(triangulate([[0, 0], [10, 10], [10, 0], [0, 10]]).length >= 3);
});

test('triangulate on the real map: every simple building ring is covered exactly (a roof with a missing corner shows from above)', () => {
  let checked = 0;
  let notSimple = 0;
  for (const b of data.buildings) {
    if (selfIntersects(b.pts)) {
      notSimple++;
      continue;
    }
    const t = triangulate(b.pts);
    let s = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = at(b.pts, at(t, i));
      const q = at(b.pts, at(t, i + 1));
      const c = at(b.pts, at(t, i + 2));
      s += Math.abs((q[0] - a[0]) * (c[1] - a[1]) - (q[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    close(s, ringArea(b.pts), Math.max(0.05, ringArea(b.pts) * 1e-4), `building ${b.id} (${b.pts.length} points)`);
    checked++;
  }
  assert.ok(checked >= 1000, `${checked} simple rings checked`);
  assert.ok(notSimple <= 20, `${notSimple} rings cross themselves`);
});

// =============================================================================================
// 6. the mesh accumulator and its shapes

test('MeshAcc.tri: the winding is flipped to face the way asked, the normal follows, the UVs stay on their vertices, a sliver is dropped', () => {
  const m = new MeshAcc();
  // (1,0,0) x (0,0,1) = (0,-1,0): this winding faces down, we ask for up
  m.tri([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0], [1, 0], [0, 1], [1, 1, 1], UP);
  assert.equal(m.triangleCount, 1);
  const t = at(trisOf(m), 0);
  same(t.n, [0, 1, 0]);
  close(dot3(triNormal(t), [0, 1, 0]), 1, 1e-12, 'the stored winding faces up');
  for (let k = 0; k < 3; k++) {
    const p = t.p[k] as V3;
    const uv = t.uv[k] as V2;
    close(uv[0], p[0], 1e-12, 'u follows x');
    close(uv[1], p[2], 1e-12, 'v follows z');
  }
  const d = new MeshAcc();
  d.tri([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0], [1, 0], [0, 1], [1, 1, 1], DOWN);
  same(at(trisOf(d), 0).n, [0, -1, 0]);
  close(dot3(triNormal(at(trisOf(d), 0)), [0, -1, 0]), 1, 1e-12);
  const s = new MeshAcc();
  s.tri([0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0], [0, 0], [0, 0], [1, 1, 1], UP);
  assert.equal(s.triangleCount, 0, 'three points in a line make no triangle');
  assert.equal(s.vertexCount, 0);
  const q = new MeshAcc();
  q.quad([0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0], [0, 0], [2, 0], [2, 3], [0, 3], [0.5, 0.5, 0.5], [0, 0, 1]);
  assert.equal(q.triangleCount, 2);
  assert.equal(q.vertexCount, 6);
  close(areaOf(q), 6, 1e-12);
  for (const tri of trisOf(q)) same(tri.n, [0, 0, 1]);
  assert.deepEqual(q.colors.slice(0, 3), [0.5, 0.5, 0.5]);
});

test('flatPolygon: a polygon at one height, facing up or down, whose UVs are metres on the ground', () => {
  for (const [facing, ny] of [[UP, 1], [DOWN, -1]] as const) {
    const m = new MeshAcc();
    flatPolygon(m, [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]], 2.5, [1, 1, 1], facing);
    close(areaOf(m), 300, 1e-9);
    for (const t of trisOf(m)) {
      same(t.n, [0, ny, 0]);
      close(dot3(triNormal(t), [0, ny, 0]), 1, 1e-9);
      for (let k = 0; k < 3; k++) {
        assert.equal((t.p[k] as V3)[1], 2.5);
        assert.equal((t.uv[k] as V2)[0], (t.p[k] as V3)[0]);
        assert.equal((t.uv[k] as V2)[1], (t.p[k] as V3)[2]);
      }
    }
  }
});

test('post: four outward faces of a square post, no top and no bottom', () => {
  const m = new MeshAcc();
  post(m, 5, 5, 0, 3, 0.3, [1, 1, 1]);
  assert.equal(m.triangleCount, 8);
  close(areaOf(m), 4 * 0.3 * 3, 1e-9);
  for (const t of trisOf(m)) {
    const c = centroid3(t);
    assert.ok(dot3(t.n, [c[0] - 5, 0, c[2] - 5]) > 0, 'faces out of the post');
    close(t.n[1], 0, 1e-12, 'upright');
    close(Math.hypot(...t.n), 1, 1e-9);
    for (const p of t.p) assert.ok(Math.abs(p[0] - 5) <= 0.15 + 1e-9 && Math.abs(p[2] - 5) <= 0.15 + 1e-9 && p[1] >= 0 && p[1] <= 3);
  }
});

test('offsetLine: moves a street to its left (north of an eastbound street), mitres corners and limits a hairpin', () => {
  assert.deepEqual(offsetLine([[0, 0], [10, 0]], 2), [[0, -2], [10, -2]]);
  assert.deepEqual(offsetLine([[0, 0], [10, 0]], -2), [[0, 2], [10, 2]]);
  // a right-angle turn to the south: the left offsets of the two legs meet at (11, -1)
  const turn = offsetLine([[0, 0], [10, 0], [10, 10]], 1);
  close(at(turn, 1)[0], 11, 1e-9);
  close(at(turn, 1)[1], -1, 1e-9);
  assert.equal(turn.length, 3);
  // a hairpin: the mitre is cut off at limit times d, so no spike
  const hair = offsetLine([[0, 0], [10, 0], [0.5, 0.1]], 2);
  const spike = Math.hypot(at(hair, 1)[0] - 10, at(hair, 1)[1] - 0);
  assert.ok(spike <= 2.5 * 2 + 1e-9, `a hairpin offsets by ${spike}`);
});

test('strip: a flat ribbon whose area is length times width, facing up, with UVs in metres along and across', () => {
  const m = new MeshAcc();
  strip(m, [[0, 0], [10, 0]], -2, 3, 0.5, [1, 1, 1]);
  assert.equal(m.triangleCount, 2);
  close(areaOf(m), 50, 1e-9);
  for (const t of trisOf(m)) {
    same(t.n, [0, 1, 0]);
    for (const p of t.p) assert.equal(p[1], 0.5);
  }
  assert.deepEqual([minOf(m.uvs.filter((_, i) => i % 2 === 0)), maxOf(m.uvs.filter((_, i) => i % 2 === 0))], [0, 10], 'u along the street in metres');
  assert.deepEqual([minOf(m.uvs.filter((_, i) => i % 2 === 1)), maxOf(m.uvs.filter((_, i) => i % 2 === 1))], [0, 5], 'v across it in metres');
  const two = new MeshAcc();
  strip(two, [[0, 0], [10, 0], [20, 0]], 0, 4, 0, [1, 1, 1]);
  assert.equal(two.triangleCount, 4);
  close(areaOf(two), 80, 1e-9);
  const none = new MeshAcc();
  strip(none, [[0, 0], [10, 0]], 1, 1, 0, [1, 1, 1]);
  strip(none, [[0, 0]], 0, 1, 0, [1, 1, 1]);
  assert.equal(none.triangleCount, 0);
});

test('chainage, lineLength and subLine cut a street into measured pieces', () => {
  const line: Pt[] = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(chainage(line), [0, 10, 20]);
  assert.equal(lineLength(line), 20);
  assert.equal(lineLength([[0, 0]]), 0);
  assert.deepEqual(subLine(line, 5, 15), [[5, 0], [10, 0], [10, 5]]);
  assert.deepEqual(subLine(line, 0, 20), [[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(subLine(line, 12, 18), [[10, 2], [10, 8]]);
  close(lineLength(subLine(line, 3, 17)), 14, 1e-9);
});

test('segmentsCross is a proper crossing: touching, parallel and apart are not', () => {
  assert.equal(segmentsCross([0, 0], [10, 10], [0, 10], [10, 0]), true);
  assert.equal(segmentsCross([0, 0], [10, 0], [5, 0], [5, 10]), false, 'a T: the end touches');
  assert.equal(segmentsCross([0, 0], [10, 0], [0, 5], [10, 5]), false, 'parallel');
  assert.equal(segmentsCross([0, 0], [10, 0], [20, -5], [20, 5]), false, 'apart');
  assert.equal(segmentsCross([0, 0], [10, 0], [5, -5], [5, 5]), true);
});

test('SegmentGrid: the nearest street (less its reach) and whether a segment crosses one, across cell boundaries', () => {
  const g = new SegmentGrid(40);
  g.add({ a: [0, 0], b: [100, 0], reach: 5 });
  close(g.nearest([50, 20], 30), 15, 1e-9, 'across the street');
  close(g.nearest([120, 0], 30), 15, 1e-9, 'beyond the end: distance to the end point');
  assert.equal(g.nearest([50, 500], 30), Infinity, 'nothing near');
  g.add({ a: [0, 300], b: [400, 300], reach: 2 }); // a segment running through ten cells
  close(g.nearest([390, 310], 5), 8, 1e-9);
  close(g.nearest([201, 295], 5), 3, 1e-9);
  const x = new SegmentGrid(40);
  x.add({ a: [0, -10], b: [0, 10], reach: 0 });
  assert.equal(x.crosses([-5, 0], [5, 0]), true);
  assert.equal(x.crosses([5, 0], [10, 0]), false);
  const far = new SegmentGrid(40);
  far.add({ a: [-200, 0], b: [200, 0], reach: 0 });
  assert.equal(far.crosses([150, -50], [150, 50]), true, 'found from a cell far from the segment\'s start');
});

test('wallFacesStreet: a wall with the street in front of it, not behind it and not far off', () => {
  const g = new SegmentGrid();
  g.add({ a: [-50, 0], b: [50, 0], reach: 5 });
  assert.equal(wallFacesStreet({ mid: [0, 10], normal: [0, -1] }, g), true, 'looks at the street');
  assert.equal(wallFacesStreet({ mid: [0, 10], normal: [0, 1] }, g), false, 'its back is to the street');
  assert.equal(wallFacesStreet({ mid: [0, 100], normal: [0, -1] }, g), false, 'a long way off');
  assert.equal(wallFacesStreet({ mid: [0, -10], normal: [0, 1] }, g), true, 'the street can be to the north or south');
});

test('roadRuns: a street cut into runs where a stretch is skipped or lifted over the railway', () => {
  const line: Pt[] = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const none = roadRuns(line, () => false, () => false);
  assert.deepEqual(none, [{ line, lifted: false }]);
  const skipped = roadRuns(line, (m) => m[0] === 15, () => false);
  assert.deepEqual(skipped.map((r) => r.line), [[[0, 0], [10, 0]], [[20, 0], [30, 0]]], 'the middle stretch is not drawn and ends the run');
  const lifted = roadRuns(line, () => false, (a) => a[0] === 10);
  assert.deepEqual(lifted.map((r) => [r.lifted, r.line.length]), [[false, 2], [true, 2], [false, 2]]);
  assert.deepEqual(roadRuns(line, () => true, () => false), []);
  assert.deepEqual(roadRuns([[0, 0]], () => false, () => false), []);
  // consecutive lifted stretches join into one run
  const two = roadRuns(line, () => false, (a) => a[0] >= 10);
  assert.deepEqual(two.map((r) => [r.lifted, r.line.length]), [[false, 2], [true, 3]]);
});

test('the colour helpers: sRGB to linear, the per-building tints and the roof mix are repeatable and in range', () => {
  close(srgbToLinear(0), 0, 1e-12);
  close(srgbToLinear(1), 1, 1e-12);
  close(srgbToLinear(0.5), 0.2140, 1e-4);
  close(srgbToLinear(0.04), 0.04 / 12.92, 1e-12);
  assert.deepEqual(rgb(0xffffff), [1, 1, 1]);
  assert.deepEqual(rgb(0x000000), [0, 0, 0]);
  const grey = rgb(0x808080);
  close(grey[0], 0.2159, 1e-3);
  assert.equal(grey[0], grey[1]);
  const tints: V3[] = [];
  const roofs: V3[] = [];
  for (let id = 1; id <= 4000; id++) {
    const f = facadeTint(id);
    assert.deepEqual(f, facadeTint(id), 'repeatable');
    assert.ok(f.every((c) => c >= 0.75 && c <= 1.2), `facade tint ${f}`);
    const r = roofTint(id);
    assert.deepEqual(r, roofTint(id));
    assert.ok(r.every((c) => c > 0 && c <= 1), `roof tint ${r}`);
    tints.push(f);
    roofs.push(r);
  }
  assert.ok(maxOf(tints.map((t) => t[1])) - minOf(tints.map((t) => t[1])) > 0.25, 'buildings differ in brightness');
  // about an eighth of the roofs are clay tile (red much stronger than blue), the rest bitumen, slate and gravel
  const clay = roofs.filter((r) => r[0] / r[2] > 2).length / roofs.length;
  assert.ok(clay > 0.08 && clay < 0.17, `${(clay * 100).toFixed(1)}% clay`);
});

test('hash01 is the same every time, in [0, 1) and evenly spread', () => {
  assert.equal(hash01(12345), hash01(12345));
  assert.notEqual(hash01(12345, 1), hash01(12345, 2));
  assert.notEqual(hash01(1), hash01(2));
  let sum = 0;
  const bins = new Array<number>(10).fill(0);
  for (let i = 0; i < 20_000; i++) {
    const h = hash01(i * 7 + 3, i % 5);
    assert.ok(h >= 0 && h < 1);
    sum += h;
    bins[Math.floor(h * 10)] = (bins[Math.floor(h * 10)] ?? 0) + 1;
  }
  close(sum / 20_000, 0.5, 0.01, 'mean');
  for (const n of bins) assert.ok(n > 1700 && n < 2300, `bin ${n}`);
});

test('inKxCentral is the box of the 2008-2020 redevelopment, edges included', () => {
  assert.equal(inKxCentral([KXC_BOX.minX, KXC_BOX.minZ]), true);
  assert.equal(inKxCentral([KXC_BOX.maxX, KXC_BOX.maxZ]), true);
  assert.equal(inKxCentral([-100, -600]), true);
  assert.equal(inKxCentral([0, 0]), false, 'the station front is old London');
  assert.equal(inKxCentral([KXC_BOX.maxX + 1, -500]), false);
  assert.equal(inKxCentral([-100, KXC_BOX.minZ - 1]), false);
});

// =============================================================================================
// 7. the whole city, built from synthetic input

const keysWith = (acc: Record<CityKey, MeshAcc>): CityKey[] => CITY_KEYS.filter((k) => acc[k].triangleCount > 0);
const GROUND = -0.2;

test('buildCity: a church block gets stone walls with whole bays, a parapet and a flat roof (every number worked out by hand)', () => {
  const block = { id: 21, kind: 'church', pts: rect(0, 0, 10, 6) };
  const out = buildCity([block], emptyCity, { groundY: GROUND });
  assert.deepEqual(keysWith(out.meshes), ['stone', 'roof']);
  assert.equal(out.stats.buildings, 1);
  assert.equal(out.stats.walls, 4);
  assert.equal(out.stats.byStyle.stone, 1);
  assert.equal(out.stats.byBasis.assumed, 1);
  assert.equal(out.stats.canopies, 0);
  // church: 3 storeys of the stone tile's 3.6 m
  const stone = out.meshes.stone;
  assert.equal(stone.triangleCount, 8, 'one quad per wall');
  const top = GROUND + 3 * 3.6;
  close(minOf(ys(stone)), GROUND, 1e-9, 'walls start on the ground');
  close(maxOf(ys(stone)), top, 1e-9, 'and run up three storeys');
  close(areaOf(stone), 2 * (10 + 6) * 10.8, 1e-9, 'wall area');
  const roof = out.meshes.roof;
  close(maxOf(ys(roof)), top + PARAPET, 1e-9, 'the parapet stands 0.45 m above the roof');
  const flat = trisOf(roof).filter((t) => t.n[1] > 0.999);
  close(flat.reduce((s, t) => s + triArea(t), 0), 60, 1e-9, 'a flat roof the size of the footprint');
  for (const t of flat) for (const p of t.p) close(p[1], top, 1e-9, 'roof height');
  // every wall faces out: a step outside the wall is outside the block, a step inside is inside
  for (const t of trisOf(stone)) {
    const c = centroid3(t);
    close(t.n[1], 0, 1e-12, 'upright');
    assert.equal(pointInPolygon([c[0] + t.n[0] * 0.1, c[2] + t.n[2] * 0.1], block.pts), false);
    assert.equal(pointInPolygon([c[0] - t.n[0] * 0.1, c[2] - t.n[2] * 0.1], block.pts), true);
    close(dot3(triNormal(t), t.n), 1, 1e-9, 'the winding agrees with the normal');
  }
  // texture u: whole bays of the 3.0 m stone tile; 10 m -> 3 bays (9 tile-metres), 6 m -> 2 bays (6)
  const us = new Set<number>();
  for (const t of trisOf(stone)) for (const uv of t.uv) us.add(uv[0]);
  assert.deepEqual([...us].sort((a, b) => a - b), [0, 6, 9]);
  close(maxOf(stone.uvs.filter((_, i) => i % 2 === 1)), 10.8, 1e-9, 'v is three storeys of 3.6 m');
  // the same block wound the other way round is the same block
  const rev = buildCity([{ ...block, pts: block.pts.slice().reverse() }], emptyCity, { groundY: GROUND });
  assert.equal(rev.meshes.stone.triangleCount, 8);
  close(areaOf(rev.meshes.stone), areaOf(stone), 1e-9);
  for (const t of trisOf(rev.meshes.stone)) {
    const c = centroid3(t);
    assert.equal(pointInPolygon([c[0] + t.n[0] * 0.1, c[2] + t.n[2] * 0.1], block.pts), false, 'still faces out');
  }
});

test('buildCity: a wall too short for a window is blank (a fixed column of the tile), and no window is cut by a corner', () => {
  // 10 m x 2 m red-brick school: the 10 m walls take 3 bays of 3.0 m (stretch 1.11), the 2 m ends are blank (0.67 < 0.8)
  const out = buildCity([{ id: 22, kind: 'school', pts: rect(0, 0, 10, 2) }], emptyCity, { groundY: GROUND });
  assert.equal(out.stats.walls, 4);
  assert.equal(out.stats.blankWalls, 2);
  const spans = trisOf(out.meshes.red).map((t) => [minOf(t.uv.map((u) => u[0])), maxOf(t.uv.map((u) => u[0]))]);
  assert.equal(spans.filter(([a, b]) => a === 0 && b === 9).length, 4, 'the two long walls (two triangles each) run u 0 to 9');
  const blank = spans.filter(([a, b]) => Math.abs((a as number) - 0.15) < 1e-9 && a === b);
  assert.equal(blank.length, 4, `the two ends (two triangles each) are one fixed column of the tile (${JSON.stringify(spans)})`);
});

test('buildCity: a ground storey of shopfront goes on a wall that faces a street, and only on that wall', () => {
  const shop = { id: 23, kind: 'retail', pts: rect(0, 0, 12, 10) };
  // a street along the north side at z = -8
  const road: CityRoad = { id: 1, cls: 'minor', pts: [[-40, -8], [60, -8]] };
  const out = buildCity([shop], { ...emptyCity, roads: [road] }, { groundY: GROUND });
  assert.equal(out.stats.shopWalls, 1, 'one wall faces the street');
  const sh = out.meshes.shop;
  assert.ok(sh.triangleCount >= 2);
  close(maxOf(ys(sh)), GROUND + FACADE.shop.tile[1], 1e-9, 'the shopfront is one 4 m storey');
  for (const t of trisOf(sh)) same(t.n, [0, 0, -1], 'on the north wall');
  // the storeys above are the building's own style, and meet the shopfront
  const own = trisOf(out.meshes[planBuilding(shop).style]);
  assert.ok(own.length >= 8);
  close(minOf(ys(out.meshes[planBuilding(shop).style]).filter((y) => y > GROUND + 0.01)), GROUND + FACADE.shop.tile[1], 1e-9, 'the upper storeys start where the shopfront ends');
  // with no street there is no shopfront
  assert.equal(buildCity([shop], emptyCity, { groundY: GROUND }).stats.shopWalls, 0);
  // wallParts: a one-storey building is a shopfront all the way; a tall wall without a shop is one part
  const plan = { style: 'stock' as FacadeKey, storeys: 4, storeyHeight: 3.3, shop: true };
  assert.deepEqual(wallParts(plan, false, 0).map((p) => p.key), ['stock']);
  assert.deepEqual(wallParts(plan, true, 0).map((p) => [p.key, p.storeys]), [['shop', 1], ['stock', 3]]);
  assert.deepEqual(wallParts({ ...plan, storeys: 1 }, true, 0).map((p) => p.key), ['shop']);
  assert.deepEqual(wallParts({ ...plan, storeys: 2, storeyHeight: 3.0 }, true, 0).map((p) => p.key), ['stock'], 'no room for a 4 m shopfront and a storey');
});

test('buildCity: a street is an asphalt ribbon with two kerbed pavements and a dashed centre line, each on its own layer', () => {
  const road = (over: Partial<CityRoad> = {}): CityRoad => ({ id: 1, cls: 'minor', pts: [[0, 0], [100, 0]], ...over });
  const build = (roads: CityRoad[], opts = {}) => buildCity([], { ...emptyCity, roads }, { groundY: 0, ...opts });
  const out = build([road()]);
  assert.deepEqual(keysWith(out.meshes), ['asphalt', 'pavement', 'paint']);
  close(areaOf(out.meshes.asphalt), 5.5 * 100, 1e-6, 'a two-way residential street is 5.5 m');
  close(areaOf(out.meshes.pavement), 2 * 2.0 * 100 + 2 * 0.18 * 100, 1e-6, 'two 2 m pavements and two 0.18 m kerbs');
  // dashes: 3 m long every 9 m from 1 m while 3 m remain: 11 of them, 0.16 m wide
  close(areaOf(out.meshes.paint), 11 * 3 * 0.16, 1e-6);
  assert.equal(out.stats.roads, 1);
  // layers, lowest first: each a centimetre or two above the last, all below the rail head (0.2 m above the ground)
  const y = (k: CityKey): number => minOf(ys(out.meshes[k]));
  close(y('asphalt'), LAYER_LIFT.asphalt, 1e-9);
  close(y('pavement'), LAYER_LIFT.pavement, 1e-9);
  close(y('paint'), LAYER_LIFT.paint, 1e-9);
  const lifts = [LAYER_LIFT.grass, LAYER_LIFT.water, LAYER_LIFT.plaza, LAYER_LIFT.pavement, LAYER_LIFT.asphalt, LAYER_LIFT.paint];
  for (let i = 1; i < lifts.length; i++) assert.ok((lifts[i] as number) > (lifts[i - 1] as number), 'layers are in order');
  assert.ok(maxOf(lifts) + 0.002 < 0.2, 'below the rail head');
  // all faces up
  for (const k of ['asphalt', 'pavement', 'paint'] as const) for (const t of trisOf(out.meshes[k])) same(t.n, [0, 1, 0]);
  // no centre line on a one-way street, a narrow one, or a service road; a width tag changes the ribbon
  assert.equal(build([road({ oneway: true })]).meshes.paint.triangleCount, 0);
  assert.equal(build([road({ width: 4 })]).meshes.paint.triangleCount, 0);
  close(areaOf(build([road({ width: 4 })]).meshes.asphalt), 400, 1e-6);
  const svc = build([road({ cls: 'service' })]);
  close(areaOf(svc.meshes.asphalt), 350, 1e-6);
  assert.equal(svc.meshes.pavement.triangleCount, 0);
  assert.equal(svc.meshes.paint.triangleCount, 0);
  // a pedestrian street is paving, 6 m wide, with no asphalt
  const ped = build([road({ cls: 'pedestrian' })]);
  assert.equal(ped.meshes.asphalt.triangleCount, 0);
  close(areaOf(ped.meshes.pavement), 600, 1e-6);
  // a path is 2 m
  close(areaOf(build([road({ cls: 'path' })]).meshes.pavement), 200, 1e-6);
});

test('buildCity: a street that crosses the railway rides over it; one inside the station is not drawn', () => {
  const road: CityRoad = { id: 1, cls: 'minor', pts: [[0, 0], [100, 0]] };
  const base = { ...emptyCity, roads: [road] };
  // one rail segment, flat xyz pairs, running north-south across the street at x = 50
  const over = buildCity([], base, { groundY: 0, rails: [50, 0, -20, 50, 0, 20] });
  assert.equal(over.stats.liftedRuns, 1);
  close(minOf(ys(over.meshes.asphalt)), LAYER_LIFT.asphalt + BRIDGE_LIFT, 1e-9, 'the deck is above the rail head');
  const clear = buildCity([], base, { groundY: 0, rails: [50, 0, 10, 50, 0, 40] });
  assert.equal(clear.stats.liftedRuns, 0);
  close(minOf(ys(clear.meshes.asphalt)), LAYER_LIFT.asphalt, 1e-9);
  // two segments: only the one over the rail is lifted
  const two = buildCity([], { ...emptyCity, roads: [{ ...road, pts: [[0, 0], [40, 0], [100, 0]] }] }, { groundY: 0, rails: [70, 0, -20, 70, 0, 20] });
  assert.equal(two.stats.liftedRuns, 1);
  const heights = new Set(trisOf(two.meshes.asphalt).map((t) => t.p[0][1].toFixed(3)));
  assert.deepEqual([...heights].sort(), [LAYER_LIFT.asphalt.toFixed(3), (LAYER_LIFT.asphalt + BRIDGE_LIFT).toFixed(3)].sort());
  // the station polygon: nothing is drawn whose middle is inside it
  const gone = buildCity([], base, { groundY: 0, exclude: [rect(-10, -10, 110, 10)] });
  assert.equal(gone.stats.roadsSkipped, 1);
  assert.equal(gone.stats.roads, 0);
  assert.equal(gone.meshes.asphalt.triangleCount, 0);
  const part = buildCity([], { ...emptyCity, roads: [{ ...road, pts: [[0, 0], [50, 0], [100, 0]] }] }, { groundY: 0, exclude: [rect(60, -10, 120, 10)] });
  close(areaOf(part.meshes.asphalt), 5.5 * 50, 1e-6, 'only the stretch outside the polygon');
});

test('buildCity: squares, parks, water and the canal go on their own layers, and the ones in the station polygon are left out', () => {
  const area = (kind: 'grass' | 'wood' | 'pitch' | 'water' | 'paved'): CityData => ({ ...emptyCity, areas: [{ id: 1, kind, pts: rect(0, 0, 50, 40) }] });
  const check = (kind: 'grass' | 'wood' | 'pitch' | 'water' | 'paved', key: CityKey, lift: number): void => {
    const out = buildCity([], area(kind), { groundY: 0 });
    assert.deepEqual(keysWith(out.meshes), [key], kind);
    close(areaOf(out.meshes[key]), 2000, 1e-6, kind);
    close(minOf(ys(out.meshes[key])), lift, 1e-9, kind);
    assert.equal(out.stats.areas, 1);
  };
  check('grass', 'grass', LAYER_LIFT.grass);
  check('wood', 'grass', LAYER_LIFT.grass);
  check('pitch', 'grass', LAYER_LIFT.grass);
  check('water', 'water', LAYER_LIFT.water);
  check('paved', 'plaza', LAYER_LIFT.plaza);
  // wood and pitch are tinted darker and bluer than park grass
  const tintOf = (kind: 'grass' | 'wood' | 'pitch'): number[] => buildCity([], area(kind), { groundY: 0 }).meshes.grass.colors.slice(0, 3);
  assert.deepEqual(tintOf('grass'), [1, 1, 1]);
  assert.ok((tintOf('wood')[0] as number) < 1 && (tintOf('pitch')[2] as number) < 1);
  assert.notDeepEqual(tintOf('wood'), tintOf('pitch'));
  // the area whose centre is inside an excluded polygon is not drawn
  const skip = buildCity([], area('paved'), { groundY: 0, exclude: [rect(10, 10, 40, 30)] });
  assert.equal(skip.stats.areas, 0);
  assert.equal(skip.meshes.plaza.triangleCount, 0);
  // the canal is a ribbon CANAL_WIDTH wide unless it has a width of its own
  const canal = (width?: number): CityData => ({ ...emptyCity, canals: [{ id: 2, pts: [[0, 0], [100, 0]], ...(width ? { width } : {}) }] });
  close(areaOf(buildCity([], canal(), { groundY: 0 }).meshes.water), CANAL_WIDTH * 100, 1e-6);
  close(areaOf(buildCity([], canal(12), { groundY: 0 }).meshes.water), 1200, 1e-6);
  assert.equal(buildCity([], canal(), { groundY: 0 }).stats.canals, 1);
});

test('buildCity: trees stand where OSM puts them, except inside a building or an excluded polygon, repeatably', () => {
  const trees: Pt[] = [[5, 5], [100, 100], [-20, -20], [30, -40]];
  const block = { id: 31, kind: 'yes', pts: rect(0, 0, 10, 10) }; // holds the tree at (5, 5)
  const out = buildCity([block], { ...emptyCity, trees }, { groundY: GROUND, exclude: [rect(90, 90, 110, 110)] });
  assert.deepEqual(out.trees.map((t) => [t.x, t.z]), [[-20, -20], [30, -40]]);
  for (const t of out.trees) {
    assert.ok(t.height >= 6 && t.height <= 12, `a tree is 6 to 12 m: ${t.height}`);
    assert.ok(t.yaw >= 0 && t.yaw < 2 * Math.PI);
    assert.ok(t.tone >= 0 && t.tone < 1);
  }
  const again = buildCity([block], { ...emptyCity, trees }, { groundY: GROUND, exclude: [rect(90, 90, 110, 110)] });
  assert.deepEqual(again.trees, out.trees, 'repeatable');
  assert.deepEqual(buildCity([block], { ...emptyCity, trees }, { groundY: GROUND, trees: false }).trees, []);
  assert.equal(buildCity([block], { ...emptyCity, trees }, { hidden: new Set([31]) }).trees.length, 3, 'a hidden building is drawn some other way: its footprint is still no place for a tree');
});

test('building=roof is an open canopy: a slab on posts at 3.6 m clear, no walls, no facade', () => {
  const plan = planBuilding({ id: 5, kind: 'roof', pts: rect(0, 0, 10, 6) });
  assert.equal(plan.canopy, true);
  assert.equal(plan.shop, false);
  assert.equal(plan.basis, 'assumed');
  close(plan.height, 3.9, 1e-9, '3.6 m clear and a 0.3 m slab');
  assert.equal(planBuilding({ id: 5, kind: 'roof', height: 5, pts: rect(0, 0, 10, 6) }).basis, 'height');
  close(planBuilding({ id: 5, kind: 'roof', height: 5, pts: rect(0, 0, 10, 6) }).height, 5, 1e-9);
  close(planBuilding({ id: 5, kind: 'roof', height: 1, pts: rect(0, 0, 10, 6) }).height, 2.7, 1e-9, 'a canopy is at least 2.4 m clear');
  assert.equal(planBuilding({ id: 6, kind: 'yes', pts: rect(0, 0, 10, 6) }).canopy, false);
  const out = buildCity([{ id: 5, kind: 'roof', pts: rect(0, 0, 10, 6) }], emptyCity, { groundY: GROUND });
  assert.deepEqual(keysWith(out.meshes), ['roof'], 'nothing but the roof mesh');
  assert.equal(out.stats.canopies, 1);
  assert.equal(out.stats.walls, 0);
  assert.deepEqual(Object.values(out.stats.byStyle), [0, 0, 0, 0, 0, 0]);
  const roof = out.meshes.roof;
  // 2 top + 2 underside + 4 fascia quads (8) + 4 posts of 8 triangles
  assert.equal(roof.triangleCount, 2 + 2 + 8 + 4 * 8);
  const topY = GROUND + 3.9;
  const ups = trisOf(roof).filter((t) => t.n[1] > 0.999);
  const downs = trisOf(roof).filter((t) => t.n[1] < -0.999);
  close(ups.reduce((s, t) => s + triArea(t), 0), 60, 1e-9);
  close(downs.reduce((s, t) => s + triArea(t), 0), 60, 1e-9);
  for (const t of ups) close(t.p[0][1], topY, 1e-9, 'slab top');
  for (const t of downs) close(t.p[0][1], GROUND + 3.6, 1e-9, '3.6 m clear underneath');
  close(minOf(ys(roof)), GROUND, 1e-9, 'the posts stand on the ground');
  close(maxOf(ys(roof)), topY, 1e-9, 'no parapet on a canopy');
  assert.deepEqual([CANOPY_CLEARANCE, CANOPY_SLAB, CANOPY_POST], [3.6, 0.3, 0.3], 'the documented sizes');
  // every vertex below the slab is on a post: within 15 cm of a corner of the outline, in both directions
  const below: [number, number][] = [];
  for (let i = 0; i < roof.positions.length; i += 3) if ((roof.positions[i + 1] as number) < GROUND + 3.6 - 1e-9) below.push([roof.positions[i] as number, roof.positions[i + 2] as number]);
  // four posts of four faces: each face is two triangles with three of its six vertices at the foot
  assert.equal(below.length, 4 * 4 * 3, 'the feet of four posts');
  for (const [x, z] of below) {
    const off = Math.min(...rect(0, 0, 10, 6).map((c) => Math.max(Math.abs(x - c[0]), Math.abs(z - c[1]))));
    assert.ok(Math.abs(off - 0.15) < 1e-9, `a post is 0.3 m square: vertex ${x},${z} is ${off} from its corner`);
  }
});

// =============================================================================================
// 8. the whole city, built from the real data

const rails = railSegments(data);
const hiddenIds = new Set(data.buildings.slice(0, 5).map((b) => b.id));
const real = buildCity(data.buildings, city, { hidden: hiddenIds, groundY: GROUND, rails: [...rails.main, ...rails.siding] });

test('the real city: the counts of what was built, and the draw calls it will cost', () => {
  const s = real.stats;
  assert.equal(s.buildings, data.buildings.length - hiddenIds.size, 'a hidden building is skipped');
  assert.equal(s.byBasis.height + s.byBasis.levels + s.byBasis.assumed, s.buildings);
  assert.equal(Object.values(s.byStyle).reduce((a, b) => a + b, 0) + s.canopies, s.buildings);
  assert.ok(s.canopies >= 5 && s.canopies <= 8, `${s.canopies} canopies`);
  assert.ok(s.walls > 4000 && s.shopWalls > 20 && s.blankWalls > 0 && s.blankWalls < s.walls / 3, `${s.walls} walls, ${s.shopWalls} shop, ${s.blankWalls} blank`);
  assert.equal(s.areas, city.areas.length, 'no area is excluded when nothing is');
  assert.equal(s.canals, city.canals.length);
  assert.ok(s.roads + s.roadsSkipped === city.roads.length && s.roads >= 1400, `${s.roads} streets built, ${s.roadsSkipped} skipped`);
  assert.ok(s.liftedRuns >= 5, `${s.liftedRuns} stretches ride over the railway`);
  // merge counts: one mesh per material, so a draw call per material and one more for the trees
  assert.equal(CITY_KEYS.length, 13);
  const used = keysWith(real.meshes);
  assert.ok(used.length >= 12 && used.length <= 13, `${used.length} surface meshes: ${used}`);
  for (const key of ['stock', 'red', 'stone', 'panel', 'glass', 'shop', 'roof', 'asphalt', 'pavement', 'paint', 'plaza', 'grass', 'water'] as CityKey[]) assert.ok(real.meshes[key].triangleCount > 0, `${key} has geometry`);
  assert.ok(used.length + 1 <= 14, 'draw calls added: the surfaces plus one instanced tree mesh');
  // instances
  assert.ok(real.trees.length > 900 && real.trees.length <= city.trees.length, `${real.trees.length} trees`);
  const total = CITY_KEYS.reduce((n, k) => n + real.meshes[k].triangleCount, 0);
  assert.ok(total > 60_000 && total < 100_000, `${total} triangles`);
});

test('the real city: every vertex, normal, index and tint is sound, and every triangle winds the way its normal says', () => {
  for (const key of CITY_KEYS) {
    const m = real.meshes[key];
    const n = m.vertexCount;
    assert.equal(m.normals.length, n * 3, key);
    assert.equal(m.colors.length, n * 3, key);
    assert.equal(m.uvs.length, n * 2, key);
    assert.equal(m.indices.length % 3, 0);
    assert.ok(m.positions.every(Number.isFinite) && m.uvs.every(Number.isFinite) && m.colors.every((c) => Number.isFinite(c) && c >= 0 && c <= 1.5), `${key}: finite`);
    assert.ok(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n), `${key}: indices in range`);
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(at(m.normals, i * 3), at(m.normals, i * 3 + 1), at(m.normals, i * 3 + 2));
      if (Math.abs(l - 1) > 1e-6) assert.fail(`${key}: normal ${i} has length ${l}`);
    }
    for (const t of trisOf(m)) {
      if (dot3(triNormal(t), t.n) < 0.999) assert.fail(`${key}: a triangle winds against its normal`);
    }
    assert.ok(minOf(ys(m)) >= GROUND - 1e-9, `${key}: nothing below the ground`);
    assert.ok(maxOf(ys(m)) <= GROUND + MAX_BUILDING + PARAPET + 1e-6, `${key}: nothing above the tallest building`);
  }
});

test('the real city: facade textures keep their scale, whole storeys and bays, so a window is about 1 m wide and a floor about 3 m', () => {
  // UV units are tile metres: texels per wall metre = 100 x (tile metres per wall metre)
  let along = 0;
  let up = 0;
  let near = 0;
  let total = 0;
  let worst = [Infinity, -Infinity];
  for (const key of ['stock', 'red', 'stone', 'panel', 'glass', 'shop'] as FacadeKey[]) {
    for (const t of trisOf(real.meshes[key])) {
      for (let i = 0; i < 3; i++) {
        const a = t.p[i] as V3;
        const b = t.p[(i + 1) % 3] as V3;
        const ua = t.uv[i] as V2;
        const ub = t.uv[(i + 1) % 3] as V2;
        const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const rise = Math.abs(b[1] - a[1]);
        if (rise < 1e-9 && run > 0.05 && Math.abs(ub[0] - ua[0]) > 1e-9) {
          const d = (Math.abs(ub[0] - ua[0]) / run) * FACADE_TEXELS_PER_M;
          along++;
          worst = [Math.min(worst[0] as number, d), Math.max(worst[1] as number, d)];
          assert.ok(d >= FACADE_TEXELS_PER_M / BAY_STRETCH[1] - 0.01 && d <= FACADE_TEXELS_PER_M / BAY_STRETCH[0] + 0.01, `${key}: ${d.toFixed(1)} texels/m along a wall`);
          total++;
          if (d >= 90 && d <= 111) near++;
        }
        if (run < 1e-9 && rise > 0.05) {
          const d = (Math.abs(ub[1] - ua[1]) / rise) * FACADE_TEXELS_PER_M;
          up++;
          // tile height over fitted storey height: 96 to 143 on the committed map (a storey is 2.5 to 4.6 m against a tile of 3 to 4 m)
          assert.ok(d >= 80 && d <= 160, `${key}: ${d.toFixed(1)} texels/m up a wall`);
        }
      }
    }
  }
  assert.ok(along > 10_000 && up > 10_000, `${along} horizontal and ${up} vertical edges measured`);
  assert.ok(near / total > 0.6, `${((near / total) * 100).toFixed(0)}% of wall edges are within 10% of 100 texels/m`);
});

test('the real city: the same input builds the same city', () => {
  const again = buildCity(data.buildings, city, { hidden: hiddenIds, groundY: GROUND, rails: [...rails.main, ...rails.siding] });
  for (const key of CITY_KEYS) {
    assert.equal(again.meshes[key].vertexCount, real.meshes[key].vertexCount, key);
    assert.deepEqual(again.meshes[key].positions, real.meshes[key].positions, key);
    assert.deepEqual(again.meshes[key].colors, real.meshes[key].colors, key);
  }
  assert.deepEqual(again.trees, real.trees);
});

test('the real city: no tree stands in a building, and an excluded polygon clears the streets, squares and trees inside it', () => {
  for (const t of real.trees) for (const b of data.buildings) {
    if (pointInPolygon([t.x, t.z], b.pts)) assert.fail(`a tree at ${t.x},${t.z} is inside building ${b.id}`);
  }
  // Granary Square and the canal basin: trees, squares and streets in the box are cleared
  const box = rect(-300, -720, -100, -540);
  const inBox = (p: Pt): boolean => pointInPolygon(p, box);
  const opts = { hidden: hiddenIds, groundY: GROUND, rails: [...rails.main, ...rails.siding] };
  const cleared = buildCity(data.buildings, city, { ...opts, exclude: [box] });
  assert.ok(real.trees.some((t) => inBox([t.x, t.z])), 'there are trees in the box to start with');
  for (const t of cleared.trees) assert.equal(inBox([t.x, t.z]), false, 'no tree inside the excluded polygon');
  assert.ok(cleared.stats.areas < real.stats.areas, 'squares in the box are not drawn');
  assert.ok(cleared.meshes.asphalt.triangleCount < real.meshes.asphalt.triangleCount, 'streets through the box are cut');
  assert.equal(cleared.stats.buildings, real.stats.buildings, 'exclusion is for flat things: the buildings stay');
});

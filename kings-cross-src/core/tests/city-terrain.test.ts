// core/city.ts on uneven ground: the city standing on a `Terrain` (core/terrain.ts) instead of the flat plane at
// GROUND_Y. Known surfaces from `terrainFromFunction` (a 10% slope, a bowl, a trench) give answers worked out by
// hand; the committed data (kx-city.json, kx-track.json, kx-terrain.json) checks the whole city; and a digest of the
// flat city, taken before terrain existed, pins that without a terrain nothing changes at all.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ORIGIN } from '../geo.ts';
import type { Pt } from '../geo.ts';
import type { KxData } from '../osm.ts';
import { railSegments } from '../scene.ts';
import { createTerrain, seatY, terrainFromFunction } from '../terrain.ts';
import type { Terrain } from '../terrain.ts';
import {
  boundaryLevel, BRIDGE_LIFT, buildCity, CITY_KEYS, drapeStations, FACADE, flatPolygon, LAYER_LIFT, MeshAcc, PARAPET, planBuilding, POLYGON_MAX_EDGE,
  POND_SPAN, ringArea, ringSpan, strip, STRIP_TOLERANCE, triangulate, UP,
} from '../city.ts';
import type { CityData, CityKey, CityMeshes, CityRoad, HeightAt, V3 } from '../city.ts';

const city: CityData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url), 'utf8'));
const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const real: Terrain = createTerrain(JSON.parse(readFileSync(new URL('../../web/src/data/kx-terrain.json', import.meta.url), 'utf8')));

const GROUND = -0.2;
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const emptyCity: CityData = { attribution: '', origin: ORIGIN, extract: '', roads: [], canals: [], areas: [], trees: [] };
const minOf = (a: readonly number[]): number => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a: readonly number[]): number => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

// --- what a mesh holds ---
const verts = (m: MeshAcc): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) out.push([m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number]);
  return out;
};
const ys = (m: MeshAcc): number[] => verts(m).map((v) => v[1]);
interface Tri {
  p: [V3, V3, V3];
  n: V3;
}
function trisOf(m: MeshAcc): Tri[] {
  const v = (k: number): V3 => [m.positions[k * 3] as number, m.positions[k * 3 + 1] as number, m.positions[k * 3 + 2] as number];
  const out: Tri[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] as number;
    out.push({ p: [v(a), v(m.indices[i + 1] as number), v(m.indices[i + 2] as number)], n: [m.normals[a * 3] as number, m.normals[a * 3 + 1] as number, m.normals[a * 3 + 2] as number] });
  }
  return out;
}
const edge3 = (a: V3, b: V3): V3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const triNormal = (t: Tri): V3 => unit(cross3(edge3(t.p[0], t.p[1]), edge3(t.p[0], t.p[2])));
const surfaceArea = (m: MeshAcc): number => trisOf(m).reduce((s, t) => s + Math.hypot(...cross3(edge3(t.p[0], t.p[1]), edge3(t.p[0], t.p[2]))) / 2, 0);
/** The area a mesh covers seen from above: what a polygon has, whatever its ground does. */
const planArea = (m: MeshAcc): number => trisOf(m).reduce((s, t) => s + Math.abs((t.p[1][0] - t.p[0][0]) * (t.p[2][2] - t.p[0][2]) - (t.p[1][2] - t.p[0][2]) * (t.p[2][0] - t.p[0][0])) / 2, 0);

// --- the known grounds (all on a 1 m grid over EXT; heights round to a millimetre) ---
const EXT = { x0: -20, z0: -60, x1: 140, z1: 60 };
const ground = (f: (x: number, z: number) => number): Terrain => terrainFromFunction(f, EXT, 1);
/** 10% rising to the east */
const slopeAt = (x: number): number => GROUND + 0.1 * x;
const slope = ground((x) => slopeAt(x));
/** a parabola in x and z, lowest at x = 50: its curvature is 0.008 m/m2, so a straight edge 7.75 m long is 6 cm off it at the middle */
const bowl = ground((x, z) => GROUND + 0.004 * ((x - 50) ** 2 + z * z));
const street: CityRoad = { id: 1, cls: 'minor', pts: [[0, 0], [100, 0]] };
const onStreet = (road: CityRoad = street): CityData => ({ ...emptyCity, roads: [road] });
/** the half width of a two-way residential street, and its pavement's outer edge */
const HALF = 2.75;
const OUTER = HALF + 2;

/** The distinct x of a street's cross-sections (east-west street), ascending. */
const sectionsX = (m: MeshAcc): number[] => [...new Set(verts(m).map((v) => round6(v[0])))].sort((a, b) => a - b);
/** The height of an east-west street's edge at z: [x, y] at each cross-section, ascending. */
function edgeAt(m: MeshAcc, z: number): [number, number][] {
  const at = new Map<number, number>();
  for (const v of verts(m)) if (Math.abs(v[2] - z) < 1e-6) at.set(round6(v[0]), v[1]);
  return [...at.entries()].sort((a, b) => a[0] - b[0]);
}
/** The straight edge between cross-sections, read at x. */
function lerpAt(edge: readonly [number, number][], x: number): number {
  for (let i = 0; i + 1 < edge.length; i++) {
    const a = edge[i] as [number, number];
    const b = edge[i + 1] as [number, number];
    if (x >= a[0] - 1e-9 && x <= b[0] + 1e-9) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  throw new Error(`x = ${x} is outside the strip`);
}
/** The most an edge departs from the ground + lift, over a run of x sampled every quarter metre. */
function worstDeparture(edge: readonly [number, number][], t: Terrain, z: number, lift: number, x0 = 0, x1 = 100): number {
  let worst = 0;
  for (let x = x0; x <= x1 + 1e-9; x += 0.25) worst = Math.max(worst, Math.abs(lerpAt(edge, x) - (t.heightAt(x, z) + lift)));
  return worst;
}

// =============================================================================================
// 1. buildings

test('a building on a slope stands on the lowest ground under its footprint; its walls, shopfront, canopy and roof are measured up from there', () => {
  // a church 12 m east-west: the ground under it rises 1.2 m, so the west edge is the lowest
  const church = { id: 21, kind: 'church', pts: rect(40, 0, 52, 8) };
  const seat = slopeAt(40);
  close(seatY(slope, church.pts), seat, 1e-6, 'the base is the lowest ground');
  const out = buildCity([church], emptyCity, { groundY: GROUND, terrain: slope });
  const stone = out.meshes.stone;
  assert.equal(stone.triangleCount, 8, 'the same four walls');
  close(minOf(ys(stone)), seat, 1e-6, 'the wall bottoms are on the lowest ground');
  close(maxOf(ys(stone)), seat + 3 * 3.6, 1e-6, 'and rise three storeys');
  close(maxOf(ys(out.meshes.roof)), seat + 3 * 3.6 + PARAPET, 1e-6, 'the parapet stands on the roof');
  const flatRoof = trisOf(out.meshes.roof).filter((t) => t.n[1] > 0.999);
  assert.ok(flatRoof.length > 0);
  for (const t of flatRoof) for (const p of t.p) close(p[1], seat + 3 * 3.6, 1e-6, 'the roof is one height above the base');
  // the uphill end goes into the hill: the ground at the east wall is 1.2 m above the wall bottom
  close(slope.heightAt(52, 4) - minOf(ys(stone)), 1.2, 1e-6, 'the uphill wall is buried');
  // the page's flat ground is not used when there is a terrain
  assert.deepEqual(buildCity([church], emptyCity, { groundY: 50, terrain: slope }).meshes.stone.positions, stone.positions);

  // a shop on a street: the shopfront is one 4 m storey from the base, the storeys above start where it ends
  const shop = { id: 23, kind: 'retail', pts: rect(40, 0, 52, 10) };
  const north: CityRoad = { id: 1, cls: 'minor', pts: [[0, -8], [100, -8]] };
  const sh = buildCity([shop], onStreet(north), { groundY: GROUND, terrain: slope });
  const shopBase = seatY(slope, shop.pts);
  assert.equal(sh.stats.shopWalls, 1);
  close(minOf(ys(sh.meshes.shop)), shopBase, 1e-6, 'shopfront from the base');
  close(maxOf(ys(sh.meshes.shop)), shopBase + FACADE.shop.tile[1], 1e-6, 'one 4 m storey');
  const upper = ys(sh.meshes[planBuilding(shop).style]);
  close(minOf(upper.filter((y) => y > shopBase + 0.01)), shopBase + FACADE.shop.tile[1], 1e-6, 'the upper storeys start where the shopfront ends');

  // an open canopy: its posts stand on the lowest ground, the slab is 3.9 m above that
  const canopy = { id: 5, kind: 'roof', pts: rect(40, 0, 50, 6) };
  const c = buildCity([canopy], emptyCity, { groundY: GROUND, terrain: slope });
  close(minOf(ys(c.meshes.roof)), slopeAt(40), 1e-6, 'the posts stand on the lowest ground');
  close(maxOf(ys(c.meshes.roof)), slopeAt(40) + 3.9, 1e-6, '3.6 m clear and a 0.3 m slab');
});

// =============================================================================================
// 2. streets and the strips under them

test('a street on a slope lies on the ground: every vertex is its layer above the surface, the normals tilt with it, and a plane needs no extra cross-section', () => {
  const flat = buildCity([], onStreet(), { groundY: GROUND });
  const out = buildCity([], onStreet(), { groundY: GROUND, terrain: slope });
  const lifts = { asphalt: [LAYER_LIFT.asphalt], pavement: [LAYER_LIFT.pavement, LAYER_LIFT.pavement + 0.002], paint: [LAYER_LIFT.paint] };
  const tilt = unit([-0.1, 1, 0]);
  for (const key of ['asphalt', 'pavement', 'paint'] as const) {
    const m = out.meshes[key];
    assert.ok(m.triangleCount > 0, key);
    for (const [x, y, z] of verts(m)) {
      const above = y - slope.heightAt(x, z);
      assert.ok(lifts[key].some((l) => Math.abs(above - l) < 1e-6), `${key}: a vertex at ${x}, ${z} is ${above} above the ground`);
    }
    assert.equal(m.triangleCount, flat.meshes[key].triangleCount, `${key}: a plane needs no cross-section besides the vertices`);
    assert.deepEqual(m.uvs, flat.meshes[key].uvs, `${key}: the texture still runs in ground metres`);
    assert.deepEqual(m.colors, flat.meshes[key].colors, `${key}: and the colours are the same`);
    for (const t of trisOf(m)) {
      for (let k = 0; k < 3; k++) close(t.n[k] as number, tilt[k] as number, 1e-5, `${key}: the normal tilts with the slope`);
      close(dot3(triNormal(t), t.n), 1, 1e-9, `${key}: the winding agrees with the normal`);
    }
  }
  // 100 m east on a 10% slope is 100.5 m of surface: the strip is draped, not flattened
  close(surfaceArea(out.meshes.asphalt), 5.5 * 100 * Math.sqrt(1.01), 1e-3, 'asphalt area');
  close(planArea(out.meshes.asphalt), 5.5 * 100, 1e-6, 'and covers the same ground');
  assert.equal(out.stats.roads, 1);
});

test('a street over curved ground is cut where the ground bends: within the tolerance of the surface, the same cross-sections in every layer, and not a vertex every metre', () => {
  const out = buildCity([], onStreet(), { groundY: GROUND, terrain: bowl });
  const xs = sectionsX(out.meshes.asphalt);
  // the surface is the edge's chords: asphalt on both kerb lines, and the pavement's outer edge that nothing but the shared cross-sections cuts
  for (const z of [HALF, -HALF]) assert.ok(worstDeparture(edgeAt(out.meshes.asphalt, z), bowl, z, LAYER_LIFT.asphalt) <= STRIP_TOLERANCE + 1e-6, `asphalt edge at z = ${z}`);
  for (const z of [OUTER, -OUTER]) assert.ok(worstDeparture(edgeAt(out.meshes.pavement, z), bowl, z, LAYER_LIFT.pavement) <= STRIP_TOLERANCE + 1e-6, `pavement edge at z = ${z}`);
  // 0.06 m of chord error on a 0.004 curve is a span of at most 7.75 m: 14 cross-sections at least, and far fewer than 101
  assert.ok(xs.length >= 14 && xs.length <= 30, `${xs.length} cross-sections along 100 m`);
  assert.deepEqual(sectionsX(out.meshes.pavement), xs, 'the pavement is cut where the asphalt is');
  // a dash lies a centimetre above the asphalt under it, not above the ground: in the bowl the middle of the street is 3 cm below its kerbs, and a dash on the ground would be under the asphalt
  assert.ok(out.meshes.paint.triangleCount > 0);
  const crossing = edgeAt(out.meshes.asphalt, HALF);
  for (const [x, y, z] of verts(out.meshes.paint)) close(y - lerpAt(crossing, x), LAYER_LIFT.paint - LAYER_LIFT.asphalt, 1e-6, `paint at x = ${x}, z = ${z}`);
  // control: with no tolerance to speak of the strip is one quad and the same measure sees the 10 m the bowl dips
  const loose = buildCity([], onStreet(), { groundY: GROUND, terrain: bowl, drape: { tolerance: 1e9 } });
  assert.deepEqual(sectionsX(loose.meshes.asphalt), [0, 100]);
  assert.ok(worstDeparture(edgeAt(loose.meshes.asphalt, HALF), bowl, HALF, LAYER_LIFT.asphalt) > 5, 'one quad over a bowl leaves the ground');
  // a tighter tolerance cuts more, a looser one less
  const tight = buildCity([], onStreet(), { groundY: GROUND, terrain: bowl, drape: { tolerance: 0.01 } });
  assert.ok(sectionsX(tight.meshes.asphalt).length > xs.length);
});

test('drape.maxSpacing cuts a strip so that no two cross-sections are further apart than that, even on a plane; off by default', () => {
  const plain = buildCity([], onStreet(), { groundY: GROUND, terrain: slope });
  assert.deepEqual(sectionsX(plain.meshes.asphalt), [0, 100]);
  const capped = buildCity([], onStreet(), { groundY: GROUND, terrain: slope, drape: { maxSpacing: 4 } });
  const xs = sectionsX(capped.meshes.asphalt);
  for (let i = 1; i < xs.length; i++) assert.ok((xs[i] as number) - (xs[i - 1] as number) <= 4 + 1e-9, `${xs[i - 1]} to ${xs[i]}`);
  assert.ok(xs.length >= 26, `${xs.length} cross-sections for 100 m at 4 m`);
  assert.deepEqual(sectionsX(capped.meshes.pavement), xs, 'in every layer');
  assert.equal(capped.meshes.asphalt.triangleCount, 2 * (xs.length - 1), 'a quad between each pair');
});

test('drapeStations: a cross-section where the ground leaves a straight line by more than the tolerance, none on a plane, each segment on its own', () => {
  const hump: HeightAt = (_x, _z, s) => Math.max(0, 1 - Math.abs(s - 50) / 5);
  const line: Pt[] = [[0, 0], [100, 0]];
  // the peak, and the two feet of the hump: nothing on the flat stretches either side
  assert.deepEqual(drapeStations(line, [0], hump), [45, 50, 55]);
  assert.deepEqual(drapeStations(line, [0], hump, { tolerance: 2 }), [], 'a hump inside the tolerance is not followed');
  assert.deepEqual(drapeStations(line, [0], (x) => 0.1 * x), [], 'a plane needs none');
  // two segments: chainage runs on through the corner; each segment is sampled by itself
  const bent: Pt[] = [[0, 0], [60, 0], [60, 40]];
  const two: HeightAt = (_x, _z, s) => Math.max(0, 1 - Math.abs(s - 50) / 5) + Math.max(0, 1 - Math.abs(s - 80) / 5);
  assert.deepEqual(drapeStations(bent, [0], two), [45, 50, 55, 75, 80, 85]);
  // any of the lateral lines can ask for a cut
  const sideHump: HeightAt = (_x, _z, s, across) => (across === 3 ? hump(0, 0, s, 0) : 0);
  assert.deepEqual(drapeStations(line, [-3, 3], sideHump), [45, 50, 55]);
  assert.deepEqual(drapeStations(line, [-3], sideHump), []);
  // maxSpacing: a cut wherever neighbours are further apart than that
  const capped = drapeStations(line, [0], () => 0, { maxSpacing: 30 });
  assert.ok(capped.length >= 3 && capped.every((s, i) => s - (i ? (capped[i - 1] as number) : 0) <= 30 && s < 100), `${capped}`);
});

test('strip takes a height function: a cross-section at every vertex and at each cut, and the function is told where along and across it is', () => {
  const told = new Set<string>();
  const acc = new MeshAcc();
  const line: Pt[] = [[0, 0], [10, 0], [10, 10]];
  strip(acc, line, -1, 2, (_x, _z, along, across) => {
    told.add(`${along}/${across}`);
    return along;
  }, [1, 1, 1], { cuts: [5, 10, 15] });
  assert.deepEqual([...told].sort(), ['0/-1', '0/2', '10/-1', '10/2', '15/-1', '15/2', '20/-1', '20/2', '5/-1', '5/2'], 'vertices at 0, 10, 20 and cuts at 5 and 15 (the cut at the vertex 10 is not repeated)');
  assert.equal(acc.triangleCount, 8, 'four quads');
  assert.deepEqual([...new Set(ys(acc))].sort((a, b) => a - b), [0, 5, 10, 15, 20], 'each vertex took the height the function gave for it');
  assert.deepEqual([...new Set(acc.uvs.filter((_, i) => i % 2 === 0))].sort((a, b) => a - b), [0, 5, 10, 15, 20], 'u is metres along the line');
  assert.deepEqual([...new Set(acc.uvs.filter((_, i) => i % 2 === 1))].sort((a, b) => a - b), [0, 3], 'v is metres across');
  // a number is one flat height, a cross-section at each vertex only, as ever
  const flat = new MeshAcc();
  strip(flat, line, -1, 2, 1.5, [1, 1, 1]);
  assert.equal(flat.triangleCount, 4);
  assert.deepEqual([...new Set(ys(flat))], [1.5]);
});

// =============================================================================================
// 3. squares, parks and water

test('a polygon on curved ground is split into triangles no longer than the cap, which follow the ground, cover the polygon once and leave no cracks', () => {
  const ring = rect(0, 0, 60, 40);
  const h = (x: number, z: number): number => bowl.heightAt(x, z) + LAYER_LIFT.grass;
  const acc = new MeshAcc();
  flatPolygon(acc, ring, h, [1, 1, 1], UP, { maxEdge: 8 });
  const ts = trisOf(acc);
  assert.ok(ts.length > 2 && ts.length < 300, `${ts.length} triangles for 2400 m2 at 8 m`);
  for (const t of ts) {
    for (let k = 0; k < 3; k++) {
      const a = t.p[k] as V3;
      const b = t.p[(k + 1) % 3] as V3;
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) <= 8 + 1e-9, `an edge of ${Math.hypot(a[0] - b[0], a[2] - b[2])} m`);
      close(a[1], h(a[0], a[2]), 1e-9, 'a vertex is on the ground plus the lift');
    }
    assert.ok(t.n[1] > 0, 'facing up');
    close(dot3(triNormal(t), t.n), 1, 1e-9, 'the winding agrees with the normal');
  }
  close(planArea(acc), 2400, 1e-6, 'the triangles cover the polygon exactly once');
  for (let i = 0; i < acc.positions.length; i += 3) {
    close(acc.uvs[(i / 3) * 2] as number, acc.positions[i] as number, 1e-12, 'u is x');
    close(acc.uvs[(i / 3) * 2 + 1] as number, acc.positions[i + 2] as number, 1e-12, 'v is z');
  }
  assert.deepEqual(crackedEdges(acc, ring), [], 'every edge in the middle is shared by two triangles');
  // irregular rings on ground that is rough everywhere, or flat in places: a triangle on a plane is left whole, but if its
  // neighbour is cut at the edge they share it must be cut there too, or the two do not meet (a crack)
  const rough = (x: number, z: number): number => 0.3 * Math.sin(x * 1.7) * Math.cos(z * 2.3);
  const everywhere = [(x: number, z: number) => bowl.heightAt(x, z), rough];
  const inPlaces = [(x: number, z: number) => (x < 25 ? rough(x, z) : 0), (x: number, z: number) => 0.1 * x + (Math.hypot(x - 30, z - 25) < 10 ? rough(x, z) : 0)];
  const irregular: Pt[][] = [
    [[0, 0], [50, 5], [70, 30], [45, 60], [10, 45]],
    [[0, 0], [40, -5], [55, 20], [30, 15], [45, 50], [5, 40]],
    [[0, 0], [90, 7], [20, 25]],
    [[0, 0], [60, 0], [60, 40], [0, 40]],
  ];
  for (const pts of irregular) for (const f of [...everywhere, ...inPlaces]) {
    const part = new MeshAcc();
    flatPolygon(part, pts, f, [1, 1, 1], UP, { maxEdge: 8 });
    close(planArea(part), ringArea(pts), 1e-6, `the ring ${JSON.stringify(pts)} is covered once`);
    assert.deepEqual(crackedEdges(part, pts), [], `no cracks in ${JSON.stringify(pts)}`);
    if (!everywhere.includes(f)) continue;
    for (const t of trisOf(part)) for (let k = 0; k < 3; k++) {
      const a = t.p[k] as V3;
      const b = t.p[(k + 1) % 3] as V3;
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) <= 8 + 1e-9, `an edge of ${Math.hypot(a[0] - b[0], a[2] - b[2])} m`);
    }
  }
});

/** Edges used by one triangle that are not on the polygon's outline: a crack (a T-junction), where a neighbour was split and this triangle was not. */
function crackedEdges(m: MeshAcc, ring: readonly Pt[]): string[] {
  const key = (a: V3, b: V3): string => {
    const p = `${round6(a[0])},${round6(a[2])}`;
    const q = `${round6(b[0])},${round6(b[2])}`;
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const used = new Map<string, [V3, V3, number]>();
  for (const t of trisOf(m)) {
    for (let k = 0; k < 3; k++) {
      const a = t.p[k] as V3;
      const b = t.p[(k + 1) % 3] as V3;
      const id = key(a, b);
      const prev = used.get(id);
      used.set(id, [a, b, (prev ? prev[2] : 0) + 1]);
    }
  }
  const onOutline = (x: number, z: number): boolean => ring.some((p, i) => {
    const q = ring[(i + 1) % ring.length] as Pt;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return Math.abs((q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])) / len < 1e-6 && (x - p[0]) * (x - q[0]) + (z - p[1]) * (z - q[1]) <= 1e-9;
  });
  const bad: string[] = [];
  for (const [id, [a, b, n]] of used) {
    if (n > 2) bad.push(`${id} is used ${n} times`);
    else if (n === 1 && !(onOutline(a[0], a[2]) && onOutline(b[0], b[2]) && onOutline((a[0] + b[0]) / 2, (a[2] + b[2]) / 2))) bad.push(`${id} is a crack`);
  }
  return bad;
}

test('a polygon is left whole where the ground is a plane (or within 2 cm of one) and split where it is not; a concave one keeps its area and has no cracks, wound either way', () => {
  const ring = rect(0, 0, 60, 40);
  const onGround = (f: (x: number, z: number) => number): MeshAcc => {
    const acc = new MeshAcc();
    flatPolygon(acc, ring, f, [1, 1, 1]);
    return acc;
  };
  assert.equal(onGround((x) => slopeAt(x)).triangleCount, 2, 'a tilted plane: the two triangles of a rectangle');
  assert.equal(onGround(() => 7).triangleCount, 2, 'flat ground');
  assert.equal(onGround((x) => 0.01 * Math.sin(x)).triangleCount, 2, 'a 1 cm ripple is inside the 2 cm tolerance');
  assert.ok(onGround((x) => 0.05 * Math.sin(x)).triangleCount > 2, 'a 5 cm ripple is followed');
  // rough ground never makes triangles longer than the default cap, and never loops
  const rough = onGround((x, z) => 0.3 * Math.sin(x * 1.7) * Math.cos(z * 2.3));
  for (const t of trisOf(rough)) for (let k = 0; k < 3; k++) {
    const a = t.p[k] as V3;
    const b = t.p[(k + 1) % 3] as V3;
    assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) <= POLYGON_MAX_EDGE + 1e-9);
  }
  assert.ok(rough.triangleCount < 400, `${rough.triangleCount}`);
  // an L: a 60 x 40 rectangle less its 30 x 20 corner
  const ell: Pt[] = [[0, 0], [60, 0], [60, 20], [30, 20], [30, 40], [0, 40]];
  for (const pts of [ell, ell.slice().reverse()]) {
    const acc = new MeshAcc();
    flatPolygon(acc, pts, (x, z) => bowl.heightAt(x, z), [1, 1, 1], UP, { maxEdge: 6 });
    close(planArea(acc), 1800, 1e-6, 'the L is covered once');
    assert.equal(ringArea(pts), 1800);
    assert.deepEqual(crackedEdges(acc, pts), []);
    for (const t of trisOf(acc)) assert.ok(t.n[1] > 0, 'facing up');
  }
  assert.equal(triangulate(ell).length / 3, 4, 'an L is four ear triangles before it is split');
});

test('a pond is level at the median ground round its edge; a park or a square follows the ground', () => {
  const pond = { id: 1, kind: 'water' as const, pts: rect(20, -10, 40, 10) };
  const out = buildCity([], { ...emptyCity, areas: [pond] }, { groundY: GROUND, terrain: slope });
  const level = new Set(ys(out.meshes.water).map(round6));
  assert.equal(level.size, 1, 'one height over the whole pond');
  const y = [...level][0] as number;
  // the ground under it runs from 1.8 to 3.8; the median round the edge is near the middle
  close(y, slopeAt(30) + LAYER_LIFT.water, 0.1, 'the middle of the slope, and the water lift above it');
  assert.ok(y > slopeAt(20) + LAYER_LIFT.water && y < slopeAt(40) + LAYER_LIFT.water);
  assert.equal(out.meshes.water.triangleCount, 2, 'level and flat: not split');
  close(planArea(out.meshes.water), 400, 1e-9);
  // boundaryLevel is the median: a short stretch of high ground on one side does not lift the pond
  assert.equal(boundaryLevel((x) => (x > 18 ? 10 : 0), rect(0, 0, 20, 20)), 0);
  assert.equal(boundaryLevel(() => 4, rect(0, 0, 20, 20)), 4);
  // grass and paving follow the ground at their own lifts
  for (const [kind, key, lift] of [['grass', 'grass', LAYER_LIFT.grass], ['paved', 'plaza', LAYER_LIFT.plaza]] as const) {
    const o = buildCity([], { ...emptyCity, areas: [{ id: 2, kind, pts: rect(20, -10, 40, 10) }] }, { groundY: GROUND, terrain: slope });
    assert.equal(o.meshes[key].triangleCount, 2, `${key}: a plane is not split`);
    for (const [x, vy, z] of verts(o.meshes[key])) close(vy, slope.heightAt(x, z) + lift, 1e-6, `${key}: on the ground plus its lift`);
  }
});

test('a water area is a pond, level, only up to POND_SPAN across; a longer one (a canal, a basin) follows the ground', () => {
  assert.equal(ringSpan(rect(0, 0, 60, 10)), 60);
  assert.equal(ringSpan(rect(5, 5, 8, 50)), 45, 'the longer side of the bounding box');
  assert.equal(ringSpan([]), 0);
  const water = (pts: Pt[]) => buildCity([], { ...emptyCity, areas: [{ id: 1, kind: 'water' as const, pts }] }, { groundY: GROUND, terrain: slope }).meshes.water;
  // exactly POND_SPAN is a pond: one height over the whole of it
  const pond = water(rect(20, -5, 20 + POND_SPAN, 5));
  assert.equal(new Set(ys(pond).map(round6)).size, 1, 'a pond is level');
  // a metre longer is not: every vertex is the ground under it, plus the water lift, so it climbs the slope with it
  const canal = water(rect(20, -5, 21 + POND_SPAN, 5));
  for (const [x, vy, z] of verts(canal)) close(vy, slope.heightAt(x, z) + LAYER_LIFT.water, 1e-6, 'on the ground plus the water lift');
  assert.ok(maxOf(ys(canal)) - minOf(ys(canal)) > 5, `it climbs ${(maxOf(ys(canal)) - minOf(ys(canal))).toFixed(2)} m with a 10% slope over 61 m`);
  close(planArea(canal), 61 * 10, 1e-9, 'and covers the same ground');
});

test('drape.lift raises every draped layer by the same height and moves nothing else: no wall, no tree, no count, and nothing without a terrain', () => {
  // a building, a street with kerbs, pavement and a dashed centre line that crosses a railway (so it has a deck), a canal, a pond,
  // a long water area, a park and a square, and trees: one of everything the city draws
  const world: CityData = {
    ...emptyCity,
    roads: [{ id: 1, cls: 'minor', pts: [[0, 0], [40, 0], [60, 0], [100, 0]] }, { id: 2, cls: 'pedestrian', pts: [[10, 20], [90, 30]] }],
    canals: [{ id: 3, pts: [[30, -50], [30, -20], [60, -40]] as Pt[], width: 6 }],
    areas: [
      { id: 4, kind: 'water', pts: rect(70, -40, 80, -30) }, { id: 5, kind: 'water', pts: rect(0, 40, 90, 50) },
      { id: 6, kind: 'grass', pts: rect(10, 35, 40, 55) }, { id: 7, kind: 'paved', pts: rect(50, 35, 80, 55) },
    ],
    trees: [[15, 10], [70, 12]],
  };
  const building = { id: 9, kind: 'church', pts: rect(20, 8, 32, 16) };
  const rails = [50, 0, -20, 50, 0, 20];
  const opts = { groundY: GROUND, terrain: slope, rails };
  const flat = buildCity([building], world, opts);
  for (const lift of [0.1, 0.35]) {
    const up = buildCity([building], world, { ...opts, drape: { lift } });
    assert.deepEqual(up.stats, flat.stats, 'the same things are built');
    assert.deepEqual(up.trees, flat.trees, 'the trees stand where they did');
    assert.ok(up.stats.liftedRuns >= 1 && up.stats.canals === 1 && up.stats.buildings === 1, 'the scene has a deck, a canal and a building');
    for (const key of CITY_KEYS) {
      const a = flat.meshes[key];
      const b = up.meshes[key];
      assert.equal(b.triangleCount, a.triangleCount, `${key}: no layer is cut differently`);
      assert.deepEqual(Array.from(b.indices), Array.from(a.indices), `${key}: indices`);
      assert.deepEqual(Array.from(b.uvs), Array.from(a.uvs), `${key}: uvs`);
      for (let i = 0; i < a.normals.length; i++) close(b.normals[i] as number, a.normals[i] as number, 1e-6, `${key}: normal ${i} (a layer that moves up as a whole does not tilt)`);
      const raised = key === 'grass' || key === 'plaza' || key === 'water' || key === 'pavement' || key === 'asphalt' || key === 'paint';
      for (let i = 0; i < a.positions.length; i += 3) {
        close(b.positions[i] as number, a.positions[i] as number, 1e-9, `${key}: x`);
        close(b.positions[i + 2] as number, a.positions[i + 2] as number, 1e-9, `${key}: z`);
        close((b.positions[i + 1] as number) - (a.positions[i + 1] as number), raised ? lift : 0, 1e-9, `${key}: height`);
      }
    }
    assert.ok(up.meshes.asphalt.triangleCount > 0 && up.meshes.paint.triangleCount > 0 && up.meshes.pavement.triangleCount > 0 && up.meshes.water.triangleCount > 0, 'every flat layer is there to be checked');
  }
  assert.deepEqual(digests(buildCity([building], world, { ...opts, drape: { lift: 0 } })), digests(flat), 'a lift of 0 is no lift');
  // with no terrain there is nothing to lift off: the flat plane is the same city, whatever the lift says
  const flatPlane = buildCity([building], world, { groundY: GROUND, rails });
  assert.deepEqual(digests(buildCity([building], world, { groundY: GROUND, rails, drape: { lift: 0.35 } })), digests(flatPlane));
});

test('a layer at its own lift is under a bump in the ground that a polygon\'s corners do not see; the lift clears it, and only a lift does', () => {
  // an 8 cm cone in the middle of a 10 m square: its corners are on the flat, its two triangles (diagonal 14 m, under the cut cap) are a plane
  const cone = ground((x, z) => GROUND + Math.max(0, 0.08 * (1 - Math.hypot(x - 25, z) / 5)));
  const grass = (lift?: number): MeshAcc => buildCity([], { ...emptyCity, areas: [{ id: 1, kind: 'grass' as const, pts: rect(20, -5, 30, 5) }] }, { groundY: GROUND, terrain: cone, drape: lift === undefined ? undefined : { lift } }).meshes.grass;
  const peak = cone.heightAt(25, 0);
  close(peak, GROUND + 0.08, 1e-6, 'the bump');
  for (const [lift, buried] of [[undefined, true], [0, true], [0.05, true], [0.1, false]] as const) {
    const m = grass(lift);
    assert.equal(m.triangleCount, 2, 'one plane');
    const level = new Set(ys(m).map(round6));
    assert.equal(level.size, 1, 'a flat polygon');
    const y = [...level][0] as number;
    close(y, GROUND + LAYER_LIFT.grass + (lift ?? 0), 1e-6, `lift ${lift}: its lift above the corners`);
    assert.equal(y < peak, buried, `lift ${lift}: the grass is ${buried ? 'under' : 'clear of'} the peak (${(y - peak).toFixed(3)} m above it)`);
  }
});

test('a canal is level across its width: both banks take the ground under the centre line, plus the water lift', () => {
  const tilt = ground((x, z) => GROUND + 0.1 * x + 0.05 * z); // 10% up to the east across the canal, 5% up to the south along it
  const canal = { id: 2, pts: [[0, -50], [0, 0], [0, 50]] as Pt[], width: 6 };
  const out = buildCity([], { ...emptyCity, canals: [canal] }, { groundY: GROUND, terrain: tilt });
  const water = out.meshes.water;
  const sections = new Map<number, number[]>();
  for (const [x, y, z] of verts(water)) {
    assert.ok(Math.abs(Math.abs(x) - 3) < 1e-9, `a bank at x = ${x}`);
    const at = sections.get(round6(z));
    if (at) at.push(y);
    else sections.set(round6(z), [y]);
  }
  assert.deepEqual([...sections.keys()].sort((a, b) => a - b), [-50, 0, 50], 'a cross-section at each vertex: a plane needs no more');
  for (const [z, heights] of sections) {
    for (const y of heights) close(y, tilt.heightAt(0, z) + LAYER_LIFT.water, 1e-6, `water at z = ${z}`);
    // the banks themselves are 0.6 m apart in height, so the level is not a bank's ground
    assert.ok(Math.abs(tilt.heightAt(3, z) - tilt.heightAt(-3, z)) > 0.5);
  }
  assert.equal(out.stats.canals, 1);
});

// =============================================================================================
// 4. bridges

test('a street that crosses the railway is a straight deck from the ground at one end to the ground at the other: over a trench it spans, it does not dive', () => {
  // 5% up to the east, with a 6 m trench from x = 45 to 55 under the middle of the road
  const trench = ground((x) => GROUND + 0.05 * x - (x >= 45 && x <= 55 ? 6 : 0));
  const road: CityRoad = { id: 1, cls: 'minor', pts: [[0, 0], [40, 0], [60, 0], [100, 0]] };
  const rails = [50, 0, -20, 50, 0, 20]; // across the road at x = 50
  const out = buildCity([], onStreet(road), { groundY: GROUND, terrain: trench, rails });
  assert.equal(out.stats.liftedRuns, 1, 'only the middle segment crosses');
  const g0 = trench.heightAt(40, 0);
  const g1 = trench.heightAt(60, 0);
  const deckAt = (x: number): number => g0 + ((g1 - g0) * (x - 40)) / 20;
  const lifts: Record<'asphalt' | 'pavement' | 'paint', number[]> = { asphalt: [LAYER_LIFT.asphalt], pavement: [LAYER_LIFT.pavement, LAYER_LIFT.pavement + 0.002], paint: [LAYER_LIFT.paint] };
  /** the triangles of the deck (the draped road either side shares its end vertices, so go by where the triangle is) and of the rest */
  const split = (m: MeshAcc): { deck: Tri[]; rest: Tri[] } => {
    const cx = (t: Tri): number => (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3;
    const all = trisOf(m);
    return { deck: all.filter((t) => cx(t) > 40 && cx(t) < 60), rest: all.filter((t) => cx(t) <= 40 || cx(t) >= 60) };
  };
  // every asphalt, pavement and paint vertex on the deck is on the straight line, BRIDGE_LIFT above its usual layer
  for (const key of ['asphalt', 'pavement', 'paint'] as const) {
    const { deck, rest } = split(out.meshes[key]);
    assert.ok(deck.length >= 2, `${key}: ${deck.length} triangles on the deck`);
    for (const t of deck) for (const [x, y] of t.p) {
      const above = y - deckAt(x) - BRIDGE_LIFT;
      assert.ok(lifts[key].some((l) => Math.abs(above - l) < 1e-9), `${key}: at x = ${x} the deck is ${above} above its layer`);
      assert.ok(y > Math.min(g0, g1) + BRIDGE_LIFT && y < Math.max(g0, g1) + BRIDGE_LIFT + 0.2, `${key}: between the ground at its two ends, plus the lift`);
      assert.ok(y > trench.heightAt(x, 0), 'never below the ground it spans');
    }
    // the road either side is on the ground, as ever
    for (const t of rest) for (const [x, y, z] of t.p) assert.ok(lifts[key].some((l) => Math.abs(y - trench.heightAt(x, z) - l) < 1e-6), `${key} off the deck at x = ${x}`);
  }
  // level across: the two edges of a cross-section have one height
  const byX = new Map<number, Set<number>>();
  for (const t of split(out.meshes.asphalt).deck) for (const [x, y] of t.p) byX.set(round6(x), (byX.get(round6(x)) ?? new Set<number>()).add(round6(y)));
  assert.deepEqual([...byX.keys()].sort((a, b) => a - b), [40, 60], 'a cross-section at each end of the deck: a straight line needs no more');
  for (const [x, heights] of byX) assert.equal(heights.size, 1, `at x = ${x}`);
  // control: the same road with no railway under it follows the trench down
  const dive = buildCity([], onStreet(road), { groundY: GROUND, terrain: trench });
  assert.equal(dive.stats.liftedRuns, 0);
  assert.ok(minOf(ys(dive.meshes.asphalt)) < trench.heightAt(50, 0) + 0.2, 'draped, it goes into the trench');
  assert.ok(minOf(split(out.meshes.asphalt).deck.flatMap((t) => t.p.map((p) => p[1]))) > trench.heightAt(50, 0) + 5, 'as a deck it spans it');
});

test('a street tagged as a bridge is a deck too, without the railway lift: straight between the ground at its ends', () => {
  const trench = ground((x) => GROUND + 0.05 * x - (x >= 45 && x <= 55 ? 6 : 0));
  const road: CityRoad = { id: 1, cls: 'minor', pts: [[0, 0], [40, 0], [60, 0], [100, 0]], bridge: true };
  const out = buildCity([], onStreet(road), { groundY: GROUND, terrain: trench });
  assert.equal(out.stats.liftedRuns, 0, 'it does not cross a rail');
  const g0 = trench.heightAt(0, 0);
  const g1 = trench.heightAt(100, 0);
  for (const [x, y] of verts(out.meshes.asphalt)) close(y, g0 + ((g1 - g0) * x) / 100 + LAYER_LIFT.asphalt, 1e-6, `deck at x = ${x}`);
  assert.deepEqual(sectionsX(out.meshes.asphalt), [0, 40, 60, 100], 'a straight line needs a cross-section at each vertex only');
  const plain = buildCity([], onStreet({ ...road, bridge: undefined }), { groundY: GROUND, terrain: trench });
  assert.ok(minOf(ys(plain.meshes.asphalt)) < minOf(ys(out.meshes.asphalt)) - 3, 'the same street not tagged follows the ground into the trench');
});

// =============================================================================================
// 5. trees

test('a tree stands where the ground is; with no terrain a spot has no height of its own', () => {
  const trees: Pt[] = [[10, 10], [60, -20], [95, 40]];
  const hilly = buildCity([], { ...emptyCity, trees }, { terrain: slope });
  assert.equal(hilly.trees.length, 3);
  for (const t of hilly.trees) {
    assert.equal(t.y, slope.heightAt(t.x, t.z), 'on the ground under it');
    close(t.y as number, slopeAt(t.x), 1e-6, 'the slope');
  }
  const bowlTrees = buildCity([], { ...emptyCity, trees }, { terrain: bowl });
  for (const t of bowlTrees.trees) assert.equal(t.y, bowl.heightAt(t.x, t.z));
  assert.notEqual(bowlTrees.trees[0]?.y, bowlTrees.trees[1]?.y);
  const flat = buildCity([], { ...emptyCity, trees }, { groundY: GROUND });
  for (const t of flat.trees) assert.equal('y' in t, false, 'the page puts a tree on its flat ground');
  // everything else about a tree is the same
  assert.deepEqual(hilly.trees.map(({ y: _y, ...rest }) => rest), flat.trees);
});

// =============================================================================================
// 6. the real city on the real ground

const rails = railSegments(data);
const hiddenIds = new Set(data.buildings.slice(0, 5).map((b) => b.id));
const base = { hidden: hiddenIds, groundY: GROUND, rails: [...rails.main, ...rails.siding] };
const flatCity = buildCity(data.buildings, city, base);
const hillyCity = buildCity(data.buildings, city, { ...base, terrain: real });
const total = (c: CityMeshes): number => CITY_KEYS.reduce((n, k) => n + c.meshes[k].triangleCount, 0);
const WALLS: CityKey[] = ['stock', 'red', 'stone', 'panel', 'glass', 'shop', 'roof'];

test('the real city on the real ground: the same things are built, hidden and excluded things stay out, and the buildings are the same buildings', () => {
  const box = rect(-300, -720, -100, -540);
  for (const extra of [{}, { exclude: [box] }]) {
    const flat = Object.keys(extra).length ? buildCity(data.buildings, city, { ...base, ...extra }) : flatCity;
    const hilly = Object.keys(extra).length ? buildCity(data.buildings, city, { ...base, ...extra, terrain: real }) : hillyCity;
    assert.deepEqual(hilly.stats, flat.stats, 'buildings, styles, walls, shopfronts, streets, lifted runs, canals and areas');
    assert.deepEqual(hilly.trees.map((t) => [t.x, t.z, t.height, t.yaw, t.tone]), flat.trees.map((t) => [t.x, t.z, t.height, t.yaw, t.tone]), 'the same trees');
    for (const key of WALLS) assert.equal(hilly.meshes[key].triangleCount, flat.meshes[key].triangleCount, `${key}: a slope moves a building, it does not change it`);
  }
  assert.equal(hillyCity.stats.buildings, data.buildings.length - hiddenIds.size, 'a hidden building is skipped');
  for (const t of hillyCity.trees) for (const b of data.buildings) if (hiddenIds.has(b.id)) assert.equal(isInside(t.x, t.z, b.pts), false);
  const cleared = buildCity(data.buildings, city, { ...base, exclude: [box], terrain: real });
  assert.ok(cleared.stats.areas < hillyCity.stats.areas && cleared.meshes.asphalt.triangleCount < hillyCity.meshes.asphalt.triangleCount, 'an excluded polygon clears streets and squares');
  for (const t of cleared.trees) assert.equal(isInside(t.x, t.z, box), false, 'and trees');
});

function isInside(x: number, z: number, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Pt;
    const b = ring[j] as Pt;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

test('every real building stands on the lowest ground under its footprint, from its wall bottoms to its parapet', () => {
  let offTheFlat = 0;
  let checked = 0;
  for (const b of data.buildings) {
    if (b.pts.length < 3) continue;
    const plan = planBuilding(b);
    const out = buildCity([b], emptyCity, { terrain: real });
    const seat = seatY(real, plan.ring);
    const all = CITY_KEYS.flatMap((k) => ys(out.meshes[k]));
    close(minOf(all), seat, 1e-9, `building ${b.id}: wall bottoms`);
    close(maxOf(all), seat + plan.height, 1e-9, `building ${b.id}: the top`);
    if (Math.abs(seat - GROUND) > 1) offTheFlat++;
    checked++;
  }
  assert.equal(checked, data.buildings.length);
  assert.ok(offTheFlat > 500, `${offTheFlat} of ${checked} buildings stand more than a metre off the old flat ground`);
});

test('the real city on the real ground costs the same draw calls and not many more triangles: the budget', () => {
  const used = (c: CityMeshes): CityKey[] => CITY_KEYS.filter((k) => c.meshes[k].triangleCount > 0);
  assert.deepEqual(used(hillyCity), used(flatCity), 'the same materials, so the same draw calls');
  assert.ok(used(hillyCity).length + 1 <= 14, 'at most thirteen surfaces and one tree mesh');
  const ratio = total(hillyCity) / total(flatCity);
  assert.ok(ratio < 1.6, `${total(hillyCity)} triangles against ${total(flatCity)}: x${ratio.toFixed(3)}`);
  assert.ok(ratio > 1.05, 'and the layers really are draped');
  for (const m of CITY_KEYS.map((k) => hillyCity.meshes[k])) {
    assert.ok(m.positions.every(Number.isFinite) && m.normals.every(Number.isFinite), 'finite');
    assert.ok(m.indices.every((i) => i >= 0 && i < m.vertexCount));
  }
});

test('on the real ground every tree has a height, the ground under it; the streets are on the ground almost everywhere', () => {
  assert.equal(hillyCity.trees.length, flatCity.trees.length);
  for (const t of hillyCity.trees) assert.equal(t.y, real.heightAt(t.x, t.z));
  assert.ok(new Set(hillyCity.trees.map((t) => Math.round((t.y as number) * 10))).size > 20, 'the trees stand at many heights');
  const asphalt = hillyCity.meshes.asphalt;
  const on = verts(asphalt).filter(([x, y, z]) => Math.abs(y - real.heightAt(x, z) - LAYER_LIFT.asphalt) < 1e-6).length;
  assert.ok(on / asphalt.vertexCount > 0.99, `${on} of ${asphalt.vertexCount} asphalt vertices are on the ground (the rest are decks over the railway and bridges)`);
});

test('flat ground adds no triangles: on a terrain that is flat at the page ground every mesh is the flat city, to a micron', () => {
  const flatGround = terrainFromFunction(() => GROUND, real.extent, 8);
  const out = buildCity(data.buildings, city, { ...base, terrain: flatGround });
  for (const key of CITY_KEYS) assert.equal(out.meshes[key].triangleCount, flatCity.meshes[key].triangleCount, `${key}: triangles`);
  assert.deepEqual(out.stats, flatCity.stats);
  // everything built from strips and walls is the same numbers; polygons that are split into the same number of triangles may be cut differently
  for (const key of [...WALLS, 'asphalt', 'pavement', 'paint'] as CityKey[]) {
    const a = out.meshes[key].positions;
    const b = flatCity.meshes[key].positions;
    assert.equal(a.length, b.length, key);
    for (let i = 0; i < a.length; i++) if (Math.abs((a[i] as number) - (b[i] as number)) > 1e-6) assert.fail(`${key}: coordinate ${i} is ${a[i]}, flat is ${b[i]}`);
    const na = out.meshes[key].normals;
    const nb = flatCity.meshes[key].normals;
    for (let i = 0; i < na.length; i++) if (Math.abs((na[i] as number) - (nb[i] as number)) > 1e-6) assert.fail(`${key}: normal component ${i} is ${na[i]}, flat is ${nb[i]}`);
  }
  for (const [key, lift] of [['grass', LAYER_LIFT.grass], ['plaza', LAYER_LIFT.plaza], ['water', LAYER_LIFT.water]] as const) {
    for (const y of ys(out.meshes[key])) close(y, GROUND + lift, 1e-6, `${key}: at the flat ground plus its lift`);
    close(planArea(out.meshes[key]), planArea(flatCity.meshes[key]), 1e-6, `${key}: the same ground covered`);
  }
});

// =============================================================================================
// 7. without a terrain nothing changes

// Digests of the flat city made by the code before `terrain` existed (each mesh's positions, normals, uvs and colours rounded to a
// micron, its indices, the trees and the stats). If you change the flat city on purpose, the failure names the meshes that moved:
// run `node --test` here, read the new digests from the message, and paste them in.
function digests(out: CityMeshes): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of CITY_KEYS) {
    const m = out.meshes[k];
    const h = createHash('sha256');
    for (const a of [m.positions, m.normals, m.uvs, m.colors]) h.update(new Uint8Array(Float64Array.from(a, (v) => Math.round(v * 1e6)).buffer));
    h.update(new Uint8Array(Uint32Array.from(m.indices).buffer));
    r[k] = h.digest('hex').slice(0, 16);
  }
  r.trees = createHash('sha256').update(JSON.stringify(out.trees)).digest('hex').slice(0, 16);
  r.stats = createHash('sha256').update(JSON.stringify(out.stats)).digest('hex').slice(0, 16);
  return r;
}
const GOLDEN_MAIN: Record<string, string> = {
  stock: '0230db63d9fb69d5', red: 'e1ba21d72f05b745', stone: 'b5a00e73a856b2d5', panel: 'd1ea21111840594c', glass: '72e919d1e7e74468', shop: '896a30ea3775831e',
  roof: '8a1b214f31f92083', asphalt: 'f466b6063542bed5', pavement: 'c05c6e0466042d79', paint: '6b0c52596475db45', plaza: '44965b2905fc39cd', grass: '627c75a137a002bf',
  water: '96a8bcf65c78092d', trees: '9fdda58f58aa4a7a', stats: 'e6c6aaea8d2d0e6f',
};
const GOLDEN_BARE: Record<string, string> = {
  stock: '792c346af40f1083', red: '33bc10740e948436', stone: '752f3a1faf5a8e5a', panel: 'ec3ce7b2f16db490', glass: '6b186d652c3cab8a', shop: '04e3e6e0cc936e65',
  roof: '938ff29c87f8d9f8', asphalt: 'dbeaa49dab436e44', pavement: '32be82d7e1adf395', paint: 'f4757a06a421b006', plaza: 'f652efd55343d42d', grass: 'e1e6ba71bf64f294',
  water: '12e4984d65962b96', trees: '9fdda58f58aa4a7a', stats: '93a6d25c658849be',
};

test('without a terrain the city is byte for byte the one built before terrain existed (the same with `terrain: undefined`)', () => {
  assert.deepEqual(digests(flatCity), GOLDEN_MAIN, 'the options the page passes');
  assert.deepEqual(digests(buildCity(data.buildings, city, { ...base, terrain: undefined, drape: { tolerance: 0.001, maxEdge: 1, lift: 0.5 } })), GOLDEN_MAIN, 'no terrain, no draping, no lift, whatever `drape` says');
  assert.deepEqual(digests(buildCity(data.buildings, city, { groundY: 0 })), GOLDEN_BARE, 'every building, no railway, ground at 0');
});

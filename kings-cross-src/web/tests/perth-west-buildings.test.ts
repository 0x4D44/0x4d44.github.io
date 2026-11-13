import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import type { WaverleyArea } from '../../core/waverley-data.ts';
import { PERTH_WEST_EXTENT } from '../../tools/perth-west-extent.ts';
import { ROOF_MESHES } from '../src/cover.ts';
import { perthCityHeight, PERTH_CITY_EXTENT, PERTH_LIDAR_HEIGHTS } from '../src/perth-city-heights.ts';
import { PERTH_ROOF_TONES, perthBuildingHeight, perthRoofTone } from '../src/perth-city.ts';
import {
  BOX_MAX_AREA, PERTH_WEST_DETAIL, PERTH_WEST_LIDAR_HEIGHTS, PERTH_WEST_LIDAR_SOURCE, PERTH_WEST_MESHES, PERTH_WEST_ROOF_SHAPE, PERTH_WEST_TERRAINS,
  addPerthWestBlock, buildPerthWestBuildings, loadPerthWestScene, perthWestDetail, perthWestHeight, rectOf, rectRing, westBatches,
} from '../src/perth-west-buildings.ts';
import type { WestDetail } from '../src/perth-west-buildings.ts';
import { cityBlockColours, buildWaverleyCity } from '../src/waverley-city.ts';
import { roofPlan } from '../src/waverley-city-roofs.ts';
import { Batch } from '../src/materials.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene-west.json', import.meta.url), 'utf8')));
const flat = { rangeUnder: () => ({ min: 0, max: 0, mean: 0 }) };
const ASSUMED = 'ASSUMED 12m; OSM height absent; ASSUMED minHeight 0m';
/** A w x d rectangle centred on (cx, cz), turned by `turn` radians. */
const rect = (cx: number, cz: number, w: number, d: number, turn = 0): Pt[] => [[w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]].map(([x, z]) => [cx + x! * Math.cos(turn) - z! * Math.sin(turn), cz + x! * Math.sin(turn) + z! * Math.cos(turn)] as Pt);
const block = (id: string, outer: Pt[], tags: Record<string, string>, height = 8, heightBasis = ASSUMED): WaverleyArea => ({ id, outer, holes: [], height, minHeight: 0, heightBasis, tags, kind: 'building' });
/** An L-shaped house of 12 x 8 m less a 5 x 4 m corner: six corners, 76 m2. */
const ell = (cx: number, cz: number): Pt[] => [[0, 0], [12, 0], [12, 4], [7, 4], [7, 8], [0, 8]].map(([x, z]) => [cx + x!, cz + z!] as Pt);
const tris = (o: ReturnType<typeof westBatches>) => ({ walls: o.walls.triangles + o.plain.triangles, roof: o.tops.triangles });
const draw = (b: WaverleyArea, detail: WestDetail, height = b.height, base = 0) => { const o = westBatches(); addPerthWestBlock(o, b, base, height, detail); return o; };
const all = (o: ReturnType<typeof westBatches>) => [o.walls, o.plain, o.tops];
/** The triangles of a batch as corner triples with the normal stored for the first corner. */
function triangles(b: Batch): { p: [number[], number[], number[]]; n: number[] }[] {
  const out = [];
  for (let i = 0; i < b.indices.length; i += 3) {
    const at = (k: number) => [b.positions[3 * b.indices[i + k]!]!, b.positions[3 * b.indices[i + k]! + 1]!, b.positions[3 * b.indices[i + k]! + 2]!];
    out.push({ p: [at(0), at(1), at(2)] as [number[], number[], number[]], n: [b.normals[3 * b.indices[i]!]!, b.normals[3 * b.indices[i]! + 1]!, b.normals[3 * b.indices[i]! + 2]!] });
  }
  return out;
}
const cross = (a: number[], b: number[], c: number[]) => { const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]; return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]; };
/** The roof's height at (x, z) from the triangle of `roof` that holds the point (null off the roof). */
function heightFrom(roof: Batch, x: number, z: number): number | null {
  for (const { p } of triangles(roof)) {
    const [a, b, c] = p, det = (b[0]! - a[0]!) * (c[2]! - a[2]!) - (c[0]! - a[0]!) * (b[2]! - a[2]!);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((x - a[0]!) * (c[2]! - a[2]!) - (c[0]! - a[0]!) * (z - a[2]!)) / det, l2 = ((b[0]! - a[0]!) * (z - a[2]!) - (x - a[0]!) * (b[2]! - a[2]!)) / det;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l1 + l2 <= 1 + 1e-9) return a[1]! + l1 * (b[1]! - a[1]!) + l2 * (c[1]! - a[1]!);
  }
  return null;
}

test('a rectangular house is flat faces with no cuts: a gable 14 triangles, a hip 14, a flat roof 10', () => {
  const gable = draw(block('way/1', rect(0, 0, 12, 8), { building: 'house' }), 'box');
  assert.deepEqual(tris(gable), { walls: 10, roof: 4 }, 'two long walls, two gable ends in one piece, two roof planes');
  const hip = draw(block('way/2', rect(0, 0, 12, 8), { building: 'detached' }), 'box');
  assert.deepEqual(tris(hip), { walls: 8, roof: 6 }, 'four walls; two trapezoids and two triangles');
  const garage = draw(block('way/3', rect(0, 0, 6, 3), { building: 'garage' }, 2.6), 'box');
  assert.deepEqual(tris(garage), { walls: 8, roof: 2 }, 'a flat roof: four walls and a top');
  const deep = draw(block('way/4', rect(0, 0, 24, 16), { building: 'house' }), 'box');
  assert.deepEqual(tris(deep), { walls: 12, roof: 6 }, 'a plan too deep for the rise gets its flat top: hexagonal gable ends, three roof planes');
});

test('the roof stands where roofPlan puts it: the exact faces reproduce its height field, gable, hip, platform and all', () => {
  for (const [kind, w, d, turn] of [['house', 12, 8, 0], ['house', 11, 7, 0.6], ['detached', 12, 8, 0], ['detached', 14, 9, 2.2], ['house', 24, 16, 0], ['detached', 30, 18, 1], ['house', 9, 9, 0.3]] as const) {
    const b = block(`way/${kind}${w}`, rect(5, -3, w, d, turn), { building: kind }, 9.5), o = draw(b, 'box', 9.5, 100);
    const plan = roofPlan({ ...b, height: 9.5, tags: PERTH_WEST_ROOF_SHAPE[kind] ? { ...b.tags, 'roof:shape': PERTH_WEST_ROOF_SHAPE[kind]! } : b.tags }, 100);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      // a point well inside the plan: a fixed spiral of offsets in the plan's own axes
      const a = (i * 2.399963) % (2 * Math.PI), r = Math.sqrt(i / 400) * 0.97, lx = Math.cos(a) * r * w / 2, lz = Math.sin(a) * r * d / 2;
      const x = 5 + lx * Math.cos(turn) - lz * Math.sin(turn), z = -3 + lx * Math.sin(turn) + lz * Math.cos(turn), y = heightFrom(o.tops, x, z);
      assert.notEqual(y, null, `${kind} ${w}x${d}: a roof over (${x.toFixed(2)}, ${z.toFixed(2)})`);
      assert.ok(Math.abs(y! - plan.at(x, z)) < 1e-6, `${kind} ${w}x${d}: ${y} against roofPlan ${plan.at(x, z)} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      checked++;
    }
    assert.equal(checked, 400);
    assert.ok(Math.abs(Math.max(...o.tops.positions.filter((_, i) => i % 3 === 1)) - (100 + 9.5)) < 1e-9, 'the ridge (or flat top) is the height over the base');
  }
});

test('every face of the cheap form is wound as its normal says and faces outward: walls level and away from the block, roofs up', () => {
  for (const [kind, w, d] of [['house', 12, 8], ['detached', 12, 8], ['garage', 6, 3], ['house', 24, 16]] as const) {
    const o = draw(block('way/n', rect(7, 9, w, d, 0.7), { building: kind }, kind === 'garage' ? 2.6 : 8), 'box');
    for (const b of all(o)) for (const { p, n } of triangles(b)) {
      const g = cross(p[0], p[1], p[2]), len = Math.hypot(g[0]!, g[1]!, g[2]!);
      assert.ok(len > 1e-6, 'no sliver');
      assert.ok((g[0]! * n[0]! + g[1]! * n[1]! + g[2]! * n[2]!) / len > 0.999, `${kind}: winding follows the stored normal`);
    }
    for (const t of triangles(o.walls).concat(triangles(o.plain))) {
      const cx = (t.p[0][0]! + t.p[1][0]! + t.p[2][0]!) / 3 - 7, cz = (t.p[0][2]! + t.p[1][2]! + t.p[2][2]!) / 3 - 9;
      assert.ok(Math.abs(t.n[1]!) < 1e-9 && t.n[0]! * cx + t.n[2]! * cz > 0, `${kind}: a wall looks away from the block`);
    }
    for (const t of triangles(o.tops)) assert.ok(t.n[1]! > 0.5, `${kind}: a roof looks up`);
  }
});

test('the cheap form is closed: every edge but the four at the foot is shared by two faces', () => {
  for (const [kind, w, d] of [['house', 12, 8], ['detached', 12, 8], ['garage', 6, 3], ['house', 24, 16], ['detached', 30, 18]] as const) {
    const o = draw(block('way/c', rect(7, 9, w, d, 0.4), { building: kind }, kind === 'garage' ? 2.6 : 8), 'box', undefined, 20), count = new Map<string, { n: number; y: number }>();
    const key = (a: number[], b: number[]) => { const k = (p: number[]) => p.map(v => Math.round(v * 1000)).join(','); const [s, t] = [k(a), k(b)].sort(); return `${s}|${t}`; };
    for (const b of all(o)) for (const { p } of triangles(b)) for (const [a, c] of [[p[0], p[1]], [p[1], p[2]], [p[2], p[0]]] as const) { const e = count.get(key(a, c)) ?? { n: 0, y: Math.max(a[1]!, c[1]!) }; e.n++; count.set(key(a, c), e); }
    const open = [...count].filter(([, e]) => e.n % 2 === 1);
    assert.equal(open.length, 4, `${kind}: ${open.length} open edges`);
    assert.ok(open.every(([, e]) => Math.abs(e.y - (20 - .15)) < 1e-9), `${kind}: the open edges are the foot, 0.15 m under the base`);
  }
});

test('detail ladder: full draws the true plan with stacks, lean the true plan, box a rectangle of the same area; each is cheaper than the last', () => {
  const house = block('way/ell', ell(0, 0), { building: 'house' }, 8);
  const [full, lean, box] = (['full', 'lean', 'box'] as const).map(d => draw(house, d));
  const n = (o: ReturnType<typeof westBatches>) => o.walls.triangles + o.plain.triangles + o.tops.triangles;
  assert.ok(n(full) > n(lean) && n(lean) > n(box), `${n(full)} > ${n(lean)} > ${n(box)}`);
  assert.equal(n(box), 14, 'a gabled box');
  assert.equal(lean.plain.triangles, 0, 'no chimney stacks below full');
  // a stack is ten triangles in the plain batch, as many stacks as roofPlan places, only at full
  const stacked = block('way/stacks', rect(0, 0, 14, 8), { building: 'house' }, 8), stacks = roofPlan(stacked, 0).chimneys.length;
  assert.ok(stacks >= 2, `${stacks} stacks on a 14 m gable`);
  assert.equal(draw(stacked, 'full').plain.triangles, 10 * stacks);
  for (const d of ['lean', 'box'] as const) assert.equal(draw(stacked, d).plain.triangles, 0, `${d}: no stacks`);
  const r = rectOf(ell(0, 0), true), ring = rectRing(r), area = (q: Pt[]) => Math.abs(q.reduce((s, p, i) => { const o = q[(i + 1) % q.length]!; return s + p[0] * o[1] - o[0] * p[1]; }, 0)) / 2;
  assert.ok(Math.abs(area(ring) - area(ell(0, 0))) < 1e-9, 'the box is the block\'s own area (an L is not bloated into its bounding rectangle)');
  assert.ok(rectOf(ell(0, 0)).ratio > 1.2, 'the true rectangle is well over the L');
  // a lean block that is a rectangle already takes the cheap form; one that is not keeps its plan: no roof over the L's notch (where the
  // area-equal box does stand), a roof over the L itself
  assert.equal(n(draw(block('way/r', rect(0, 0, 12, 8, 0.3), { building: 'house' }), 'lean')), 14);
  const roofOf = (d: WestDetail) => draw(block('way/l', ell(0, 0), { building: 'house' }), d).tops;
  for (const d of ['full', 'lean'] as const) { assert.equal(heightFrom(roofOf(d), 9.5, 6), null, `${d}: the notch is open`); assert.notEqual(heightFrom(roofOf(d), 3, 6), null, `${d}: a roof over the L`); }
  assert.notEqual(heightFrom(roofOf('box'), 9.5, 6), null, 'the box stands over the notch');
  // no roof rises over its block's height, whatever the form
  for (const d of ['full', 'lean', 'box'] as const) assert.ok(Math.max(...draw(house, d, 8, 50).tops.positions.filter((_, i) => i % 3 === 1)) <= 58 + 1e-9);
});

test('roof form by type: detached houses and bungalows hip, every other house gables, garages and the flat kinds stay flat', () => {
  assert.deepEqual(PERTH_WEST_ROOF_SHAPE, { detached: 'hipped', bungalow: 'hipped' });
  const t = (kind: string, h = 8) => tris(draw(block('way/t', rect(0, 0, 12, 8), { building: kind }, h), 'box'));
  // a roof plane looking along the long axis (here x) is a hip; a gable's planes look only across it
  const hips = (kind: string, h = 8) => triangles(draw(block('way/t', rect(0, 0, 12, 8), { building: kind }, h), 'box').tops).some(({ n }) => Math.abs(n[0]!) > 0.2);
  assert.ok(hips('detached') && hips('bungalow', 6), 'hipped');
  for (const kind of ['house', 'semidetached_house', 'terrace', 'apartments', 'yes', 'school']) assert.equal(hips(kind), false, `${kind}: gabled`);
  assert.equal(t('detached').roof, 6, 'a sharp hip: two trapezoids and two triangles');
  for (const kind of ['house', 'semidetached_house', 'terrace', 'apartments', 'yes', 'school']) assert.equal(t(kind).roof, 4, `${kind}: gabled`);
  for (const kind of ['garage', 'retail', 'industrial', 'commercial', 'warehouse']) assert.equal(t(kind).roof, 2, `${kind}: flat`);
  assert.equal(t('house', 4.5).roof, 2, 'a block under 5 m is flat whatever it is');
  // a mapped roof:shape wins over the type
  assert.equal(tris(draw(block('way/m', rect(0, 0, 12, 8), { building: 'detached', 'roof:shape': 'flat' }), 'box')).roof, 2);
  assert.equal(tris(draw(block('way/m2', rect(0, 0, 12, 8), { building: 'house', 'roof:shape': 'hipped' }), 'box')).roof, 6);
  // a square plan cannot hip (roofPlan: the long axis must be 5% over the short one) and gables
  assert.equal(t('detached').roof, 6); assert.equal(tris(draw(block('way/sq', rect(0, 0, 9, 9), { building: 'detached' }), 'box')).roof, 4);
});

test('an elevated part keeps its void: walls from base + minHeight at every detail, never the cheap form that stands on the ground', () => {
  const part = { ...block('way/part', rect(0, 0, 12, 8), { building: 'house' }, 9), minHeight: 3 };
  for (const d of ['full', 'lean', 'box'] as const) {
    const o = draw(part, d, 9, 20), ys = o.plain.positions.filter((_, i) => i % 3 === 1);
    assert.ok(o.plain.triangles > 0 && o.walls.triangles === 0, `${d}: an elevated part is plain walls`);
    assert.ok(Math.min(...ys) >= 23 - 1e-9, `${d}: the lowest wall vertex ${Math.min(...ys)} stands at base + minHeight (23)`);
  }
  const ground = draw(block('way/ground', rect(0, 0, 12, 8), { building: 'house' }, 9), 'box', 9, 20);
  assert.ok(Math.min(...ground.walls.positions.filter((_, i) => i % 3 === 1)) < 20, 'a block on the ground is sunk 0.15 m under it');
});

test('walls: windowed for houses, plain for garages, sheds, retail, industry and the shared plain kinds, and for anything under 40 m2', () => {
  for (const [kind, w, d, windowed] of [['house', 12, 8, true], ['detached', 12, 8, true], ['apartments', 20, 12, true], ['garage', 7, 7, false], ['garages', 24, 6, false], ['carport', 7, 6, false], ['shed', 8, 6, false], ['retail', 30, 20, false], ['commercial', 20, 15, false], ['industrial', 40, 30, false], ['warehouse', 40, 30, false], ['church', 20, 10, false], ['house', 5, 6, false]] as const) {
    const o = draw(block('way/w', rect(0, 0, w, d), { building: kind }), 'box');
    assert.equal(o.walls.triangles > 0, windowed, `${kind} ${w}x${d}`); assert.equal(o.plain.triangles > 0, !windowed, `${kind} ${w}x${d}`);
  }
});

test('perthWestDetail: full near the focus, lean past it, and a small residential plan a box beyond that; a school, a courtyard or a mapped roof is never boxed', () => {
  const at = (x: number, outer = ell(0, 0), tags: Record<string, string> = { building: 'house' }, holes: Pt[][] = []) => perthWestDetail({ outer: outer.map(p => [p[0] + x, p[1]] as Pt), holes, tags });
  assert.deepEqual(PERTH_WEST_DETAIL.focus, [0, 0]);
  assert.equal(at(-1000), 'full'); assert.equal(at(-PERTH_WEST_DETAIL.full + 20), 'full', 'inside the full radius');
  assert.equal(at(-PERTH_WEST_DETAIL.full - 20), 'lean'); assert.equal(at(-PERTH_WEST_DETAIL.lean + 20), 'lean');
  assert.equal(at(-PERTH_WEST_DETAIL.lean - 20), 'box'); assert.equal(at(-2800), 'box');
  const far = -PERTH_WEST_DETAIL.lean - 100;
  assert.equal(at(far, rect(0, 0, 40, 30)), 'lean', `${BOX_MAX_AREA} m2 and over keeps its own plan`);
  assert.equal(at(far, ell(0, 0), { building: 'house', 'roof:shape': 'gabled' }), 'lean');
  assert.equal(at(far, rect(0, 0, 10, 10), { building: 'house' }, [rect(0, 0, 3, 3)]), 'lean', 'a courtyard');
  assert.equal(at(far, rect(0, 0, 10, 8)), 'box');
  assert.equal(perthWestDetail({ outer: ell(-2000, 500), holes: [], tags: { building: 'house' } }, { focus: [-2000, 500], full: 10, lean: 20 }), 'full', 'the focus is a rule, not the station');
});

test('heights: OSM\'s where mapped, else the LiDAR height of the west file where usable, else Perth\'s fallback by type', () => {
  const [id, lidar] = [...PERTH_WEST_LIDAR_HEIGHTS].find(([k, v]) => v.height > 6 && v.height - v.median < 6 && data.buildings.find(b => b.id === k)?.heightBasis.startsWith('ASSUMED 12m'))!;
  const b = data.buildings.find(q => q.id === id)!;
  const h = perthWestHeight(b);
  assert.equal(h.basis, 'LiDAR'); assert.ok(Math.abs(h.height - Math.max(2.5, Math.round(lidar.height * 10) / 10)) < 1e-9);
  assert.deepEqual(perthWestHeight({ ...b, heightBasis: 'OSM height; ASSUMED minHeight 0m', height: 21 }), { height: 21, basis: 'OSM' });
  const unmeasured = { ...b, id: 'way/1' }; // no LiDAR height for this id
  assert.deepEqual(perthWestHeight({ ...unmeasured, tags: { building: 'house' } }), { height: 7, basis: 'ASSUMED' }, 'Perth\'s house fallback');
  assert.deepEqual(perthWestHeight({ ...unmeasured, tags: { building: 'bungalow' } }), { height: 4.5, basis: 'ASSUMED' });
  assert.deepEqual(perthWestHeight({ ...unmeasured, tags: { building: 'house' }, heightBasis: 'ASSUMED 3m per OSM building:levels; ASSUMED minHeight 0m', height: 6 }), { height: 6, basis: 'OSM' }, 'levels stand');
  // not off the drawn ground: a block reaching outside the west terrain and the context terrain takes the fallback, though it has a LiDAR height
  const shifted = (dx: number, dz = 0) => ({ ...b, outer: b.outer.map(([x, z]) => [x + dx, z + dz] as Pt) });
  assert.equal(perthWestHeight(shifted(-3000)).basis, 'ASSUMED', 'west of the extent');
  const [cx, cz] = b.outer[0]!;
  assert.equal(perthWestHeight(shifted(-1100 - cx, -cz)).basis, 'LiDAR', 'in the strip between the west terrain and the context terrain\'s own west edge');
  assert.equal(perthWestHeight(shifted(-1100 - cx, 1100 - cz)).basis, 'ASSUMED', 'x -1100, z 1100: in neither terrain');
  assert.equal(perthWestHeight(shifted(-1200 - cx + 2, -cz)).basis, 'LiDAR', 'straddling the join at x -1200 takes both terrains');
  assert.deepEqual(PERTH_WEST_TERRAINS, [PERTH_WEST_EXTENT, PERTH_CITY_EXTENT]);
  assert.match(PERTH_WEST_LIDAR_SOURCE.attribution, /Scottish public sector LiDAR.*Open Government Licence v3/);
  // the context city's own rule is unchanged: its heights, its extent
  const context = [...PERTH_LIDAR_HEIGHTS.keys()][0]!;
  assert.equal(PERTH_WEST_LIDAR_HEIGHTS.has(context), false, 'the two files hold different blocks');
});

test('the context city\'s height rule, given no source, is exactly what it was', () => {
  const [id] = [...PERTH_LIDAR_HEIGHTS].find(([, v]) => v.height > 6 && v.height - v.median < 6)!;
  const b = { id, outer: rect(500, 0, 10, 10), height: 12, minHeight: 0, heightBasis: ASSUMED, tags: { building: 'house' } };
  assert.equal(perthCityHeight(b, perthBuildingHeight).basis, 'LiDAR');
  assert.equal(perthCityHeight({ ...b, outer: rect(-1190, 0, 30, 10) }, perthBuildingHeight).basis, 'ASSUMED', 'a corner past the context terrain\'s west edge (x -1200)');
  assert.equal(perthCityHeight({ ...b, outer: rect(500, 0, 10, 10) }, perthBuildingHeight, { heights: new Map(), extents: [PERTH_CITY_EXTENT] }).basis, 'ASSUMED', 'a given source is the one read');
});

test('cityBlockColours is the tint buildWaverleyCity has always given a block (the shared helper holds the hash, not a copy)', () => {
  // a flat roof: the city's pitched roofs carry dormers, whose own faces are not slate-tinted
  const b = block('way/123456789', rect(0, 0, 14, 9), { building: 'house', 'roof:shape': 'flat' }, 9, 'OSM height; ASSUMED minHeight 0m');
  const city = buildWaverleyCity({ buildings: [b] }, flat), { color, roofColor } = cityBlockColours(b.id);
  try {
    const walls = (city.group.getObjectByName('waverley-building-walls') as THREE.Mesh).geometry.getAttribute('color'), tops = (city.group.getObjectByName('waverley-building-tops') as THREE.Mesh).geometry.getAttribute('color');
    for (let i = 0; i < walls.count; i++) for (const k of [0, 1, 2]) assert.ok(Math.abs(walls.getComponent(i, k) - color[k]!) < 1e-6);
    for (let i = 0; i < tops.count; i++) for (const k of [0, 1, 2]) assert.ok(Math.abs(tops.getComponent(i, k) - roofColor[k]!) < 1e-6);
    assert.ok(walls.count > 0 && tops.count > 0);
  } finally { city.dispose(); }
  assert.notDeepEqual(cityBlockColours('way/1').color, cityBlockColours('way/2').color, 'a block of its own');
  // known answers of the formula buildWaverleyCity had inline before the helper was shared: the Waverley and Perth towns' tints do not move
  const near = (a: readonly number[], w: readonly number[]) => a.length === w.length && a.every((v, i) => Math.abs(v - w[i]!) < 1e-9);
  assert.ok(near(cityBlockColours('way/123456789').color, [1.01808, 1.01, 0.97162]) && near(cityBlockColours('way/123456789').roofColor, [0.84, 0.84, 0.8568]));
  assert.ok(near(cityBlockColours('way/258095237').color, [0.98, 0.98, 0.9506]) && near(cityBlockColours('way/258095237').roofColor, [0.84, 0.84, 0.8568]));
  assert.ok(near(cityBlockColours('relation/1').color, [0.95, 0.95, 0.9215]) && near(cityBlockColours('relation/1').roofColor, [0.98, 0.98, 0.9996]));
});

test('roofs wear the slate shift and Perth\'s tone of their block, whichever form draws them', () => {
  const b = block('way/777', ell(0, 0), { building: 'house' }), { roofColor } = cityBlockColours(b.id), tone = PERTH_ROOF_TONES[perthRoofTone(roofColor[0])]!;
  const want = [roofColor[0] * tone[0], roofColor[1] * tone[1], roofColor[2] * tone[2]];
  for (const d of ['full', 'lean', 'box'] as const) {
    const c = draw(b, d).tops.colors;
    assert.ok(c.length > 0);
    for (let i = 0; i < c.length; i += 3) for (const k of [0, 1, 2]) assert.ok(Math.abs(c[i + k]! - want[k]!) < 1e-9, `${d}: roof colour`);
  }
  const rb = block('way/778', rect(0, 0, 12, 8), { building: 'house' }), wantWall = cityBlockColours(rb.id).color, o = draw(rb, 'box');
  for (let i = 0; i < o.walls.colors.length; i += 3) for (const k of [0, 1, 2]) assert.ok(Math.abs(o.walls.colors[i + k]! - wantWall[k]!) < 1e-9);
});

test('the whole west on the real data: three draws, well under the lead\'s 250 k triangles whichever detail, merged and sound', () => {
  assert.ok(data.buildings.length > 5000);
  const run = (rule = PERTH_WEST_DETAIL) => buildPerthWestBuildings(data, flat, { detail: rule });
  const scene = run();
  try {
    assert.equal(scene.stats.drawCalls, 3);
    assert.deepEqual(scene.group.children.map(c => c.name).sort(), Object.values(PERTH_WEST_MESHES).sort());
    assert.equal(scene.group.name, 'perth-west-buildings');
    assert.ok(Object.values(PERTH_WEST_MESHES).every(n => !ROOF_MESHES.includes(n)), 'not in the weather\'s cover map: it would stretch the map from the town to the whole extension');
    const drawn = scene.group.children.reduce((s, c) => s + ((c as THREE.Mesh).geometry.getIndex()!.count / 3), 0);
    assert.equal(scene.stats.triangles, drawn, 'the stats are what is drawn');
    assert.ok(scene.stats.triangles <= 150_000, `default detail: ${scene.stats.triangles} triangles`);
    assert.equal(scene.buildingIds.length, data.buildings.length); assert.equal(scene.detail.full + scene.detail.lean + scene.detail.box, data.buildings.length);
    assert.ok(scene.detail.full > 100 && scene.detail.lean > 300 && scene.detail.box > 3000, JSON.stringify(scene.detail));
    assert.equal(scene.heightBasis.OSM + scene.heightBasis.LiDAR + scene.heightBasis.ASSUMED, data.buildings.length);
    assert.ok(scene.heightBasis.LiDAR > 4000, `LiDAR heights: ${scene.heightBasis.LiDAR}`);
    for (const m of scene.group.children as THREE.Mesh[]) {
      const p = m.geometry.getAttribute('position'), c = m.geometry.getAttribute('color');
      assert.equal(c.count, p.count); assert.ok(p.array.every(Number.isFinite), `${m.name}: finite`);
      let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); }
      assert.ok(lo >= -0.15 - 1e-6 && hi <= 40, `${m.name}: heights ${lo}..${hi} over a flat ground`);
    }
  } finally { scene.dispose(); scene.dispose(); }
  // the cheapest and the dearest settings
  const cheap = run({ focus: [0, 0], full: 0, lean: 0 }), dear = run({ focus: [0, 0], full: 0, lean: 1e9 });
  try {
    assert.ok(cheap.stats.triangles <= 100_000, `all box: ${cheap.stats.triangles}`);
    assert.ok(dear.stats.triangles <= 250_000, `all lean: ${dear.stats.triangles}`);
    assert.ok(cheap.stats.triangles < scene.stats.triangles && scene.stats.triangles < dear.stats.triangles);
  } finally { cheap.dispose(); dear.dispose(); }
  // omitted blocks are left out, by id, and the build is deterministic
  const some = data.buildings.slice(0, 50).map(b => b.id), a = buildPerthWestBuildings(data, flat, { omitBuildingIds: some }), b2 = buildPerthWestBuildings(data, flat, { omitBuildingIds: some });
  try {
    assert.equal(a.buildingIds.length, data.buildings.length - 50);
    const pa = (a.group.children[0] as THREE.Mesh).geometry.getAttribute('position').array, pb = (b2.group.children[0] as THREE.Mesh).geometry.getAttribute('position').array;
    assert.deepEqual(Array.from(pa.slice(0, 3000)), Array.from(pb.slice(0, 3000)));
    assert.equal(a.stats.triangles, b2.stats.triangles);
  } finally { a.dispose(); b2.dispose(); }
});

test('each block stands on the lowest ground under its footprint (sunk 0.15 m), its roof at the height over that', () => {
  const ground = { rangeUnder: () => ({ min: 12.5, max: 20, mean: 15 }) };
  // lean at most: chimney stacks, which rise over the ridge, belong to the full detail
  const s = buildPerthWestBuildings({ buildings: data.buildings.slice(0, 60) }, ground, { height: () => ({ height: 9, basis: 'ASSUMED' }), detail: { focus: [0, 0], full: 0, lean: 1e9 } });
  try {
    let lo = Infinity, hi = -Infinity;
    for (const m of s.group.children as THREE.Mesh[]) { const p = m.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); } }
    assert.ok(Math.abs(lo - 12.35) < 1e-4, `lowest vertex ${lo} (float32 positions)`);
    assert.ok(Math.abs(hi - 21.5) < 1e-4, `highest vertex ${hi}: the ridge is the height over the base`);
    assert.equal(s.heightBasis.ASSUMED, 60, 'a given height rule is the one read');
  } finally { s.dispose(); }
});

test('loadPerthWestScene reads the committed scene lazily', async () => {
  const s = await loadPerthWestScene();
  assert.equal(s.buildings.length, data.buildings.length);
  assert.equal(s.roofs.length, data.roofs.length);
});

// web/src/landmarks.ts on the ground: the three buildings are built standing on y = 0 and raised, as they are, onto their seats (core's
// landmarkSeats). Checked on surfaces whose lowest ground is known (a plane tilted 10%, a step, flat ground), then on the real terrain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { distToRing } from '../../core/kxcentral.ts';
import { BARLOW_SINK, FIGURES, landmarkFootprints, landmarkPlans, landmarkSeats } from '../../core/landmarks.ts';
import type { LandmarkName } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon, worldToShed } from '../../core/station.ts';
import { createTerrain } from '../../core/terrain.ts';
import { extremesOver, middleX, stepAt, terrainOver, tilted } from '../../core/tests/ground-fixtures.ts';
import { addLandmarks, barlowGeometry, createMaterials, hotelGeometry, landmarkGeometry, liftParts, midlandGeometry, partMarks } from '../src/landmarks.ts';
import type { Key } from '../src/landmarks.ts';
import { Batch, mergeParts } from '../src/materials.ts';
import type { PartMap } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const plans = landmarkPlans(data);
const rings = landmarkFootprints(plans);
const NAMES: LandmarkName[] = ['hotel', 'midland', 'barlow'];
const everyRing = Object.values(rings).flat();

/** landmarkGeometry gives the hotel, the Midland Grand and the shed, in that order */
const named = (sets: PartMap<Key>[]): Record<LandmarkName, PartMap<Key>> => ({ hotel: sets[0] as PartMap<Key>, midland: sets[1] as PartMap<Key>, barlow: sets[2] as PartMap<Key> });
const entries = (parts: PartMap<Key>): [Key, Batch][] => Object.entries(parts) as [Key, Batch][];
/** Everything of every building stands on its base: the Barlow shed's ribs and boarding start at its springing line, none below it. */
const shellOf = (_name: LandmarkName, parts: PartMap<Key>): Key[] => Object.keys(parts) as Key[];
/** the y of every vertex of the given parts */
function heights(parts: PartMap<Key>, keys: readonly Key[] = Object.keys(parts) as Key[]): number[] {
  const out: number[] = [];
  for (const k of keys) {
    const p = (parts[k] as Batch).positions;
    for (let i = 1; i < p.length; i += 3) out.push(p[i] as number);
  }
  return out;
}
const lowest = (ys: readonly number[]): number => ys.reduce((m, y) => Math.min(m, y), Infinity);
const highest = (ys: readonly number[]): number => ys.reduce((m, y) => Math.max(m, y), -Infinity);
/** where the vertices at height `y` stand in plan */
function feetAt(parts: PartMap<Key>, keys: readonly Key[], y: number): Pt[] {
  const out: Pt[] = [];
  for (const k of keys) {
    const p = (parts[k] as Batch).positions;
    for (let i = 0; i < p.length; i += 3) if (Math.abs((p[i + 1] as number) - y) < 1e-6) out.push([p[i] as number, p[i + 2] as number]);
  }
  return out;
}
interface MeshData {
  name: string;
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}
const meshData = (group: THREE.Group): MeshData[] =>
  (group.children as THREE.Mesh[]).map((m) => ({
    name: m.name,
    position: Array.from(m.geometry.getAttribute('position').array),
    normal: Array.from(m.geometry.getAttribute('normal').array),
    uv: Array.from(m.geometry.getAttribute('uv').array),
    index: Array.from((m.geometry.index as THREE.BufferAttribute).array),
  }));
const partData = (parts: PartMap<Key>): Record<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }> =>
  Object.fromEntries(entries(parts).map(([k, b]) => [k, { positions: [...b.positions], normals: [...b.normals], uvs: [...b.uvs], indices: [...b.indices] }]));

/** A tilted plane whose lowest ground under the shed is 0.4 m below y = 0: above the shed's floor, so nothing holds it up. */
const slope = tilted(-0.4 - extremesOver(tilted(), rings.barlow).lo);

// ---- the lift ----------------------------------------------------------------------------------

test('partMarks and liftParts: a lift moves the y of every vertex and nothing else; from a mark it moves only what was added since; by nothing it touches nothing', () => {
  const quad = (b: Batch, y: number): void => b.quadUV([0, y, 0], [4, y, 0], [4, y + 2, 0], [0, y + 2, 0], [[0, y], [4, y], [4, y + 2], [0, y + 2]], [0, 0, 1]);
  type K = 'a' | 'b' | 'c';
  const make = (): PartMap<K> => {
    const a = new Batch();
    quad(a, 1);
    const b = new Batch();
    quad(b, 5);
    return { a, b };
  };
  const copy = (p: PartMap<K>): Record<string, number[][]> => Object.fromEntries(Object.entries(p).map(([k, b]) => [k, [[...(b as Batch).positions], [...(b as Batch).normals], [...(b as Batch).uvs], [...(b as Batch).indices]]]));

  const whole = make();
  assert.deepEqual(partMarks(whole), { a: 12, b: 12 }, 'three numbers a vertex, four vertices a quad');
  const before = copy(whole);
  liftParts(whole, 0);
  assert.deepEqual(copy(whole), before, 'a lift of nothing leaves every array as it was');
  liftParts(whole, 5);
  for (const k of ['a', 'b'] as const) {
    const b = whole[k] as Batch;
    const was = before[k] as number[][];
    b.positions.forEach((v, i) => assert.equal(v, (was[0] as number[])[i] as number + (i % 3 === 1 ? 5 : 0), `${k}[${i}]: only y moves`));
    assert.deepEqual(b.normals, was[1], 'the normals stay');
    assert.deepEqual(b.uvs, was[2], 'the UVs stay');
    assert.deepEqual(b.indices, was[3], 'the triangles stay');
  }

  // a structure built after the mark: its own vertices rise, the earlier ones stay, and a part that did not exist at the mark rises whole
  const parts = make();
  const marks = partMarks(parts);
  quad(parts.a as Batch, 20);
  parts.c = new Batch();
  quad(parts.c, 30);
  const after = copy(parts);
  liftParts(parts, -3, marks);
  const yOf = (k: K): number[] => (parts[k] as Batch).positions.filter((_, i) => i % 3 === 1);
  const yWas = (k: K): number[] => (after[k] as number[][])[0]?.filter((_, i) => i % 3 === 1) as number[];
  assert.deepEqual(yOf('a').slice(0, 4), yWas('a').slice(0, 4), 'the first quad of a is left alone');
  assert.deepEqual(yOf('a').slice(4), yWas('a').slice(4).map((y) => y - 3), 'the second is lowered');
  assert.deepEqual(yOf('b'), yWas('b'), 'b was added to nothing');
  assert.deepEqual(yOf('c'), yWas('c').map((y) => y - 3), 'a part that is new since the mark is lowered whole');
});

// ---- standing on a slope -----------------------------------------------------------------------

test('on a plane tilted 10% east and south: each building\'s lowest vertex is on the lowest ground under its footprint, to a centimetre, and nothing is below it', () => {
  const seats = landmarkSeats(plans, terrainOver(everyRing, slope));
  const seated = named(landmarkGeometry(plans, seats));
  for (const name of NAMES) {
    const e = extremesOver(slope, rings[name]);
    assert.ok(e.hi - e.lo > 5, `${name}: a slope of 10% is metres of relief under a building, got ${e.hi - e.lo}`);
    const ys = heights(seated[name], shellOf(name, seated[name]));
    close(lowest(ys), e.lo, 0.01, `${name}: the lowest vertex`);
    assert.ok(ys.every((y) => y >= e.lo - 0.01), `${name}: a vertex below the lowest ground by ${e.lo - lowest(ys)} m`);
  }
  assert.equal(new Set(NAMES.map((n) => (seats[n].y).toFixed(2))).size, 3, 'three buildings, three seats');
});

test('seated, only y moves: x, z, normals, UVs and triangles are as built and every vertex is up by the seat, so every roof stands as high above its base as before', () => {
  const seats = landmarkSeats(plans, terrainOver(everyRing, slope));
  const plain = named(landmarkGeometry(plans));
  const seated = named(landmarkGeometry(plans, seats));
  for (const name of NAMES) {
    assert.deepEqual(Object.keys(seated[name]), Object.keys(plain[name]), `${name}: the same parts`);
    assert.ok(Math.abs(seats[name].y) > 0.3, `${name}: seated off the y = 0 it was built on, so a shift shows`);
    for (const [key, s] of entries(seated[name])) {
      const p = plain[name][key] as Batch;
      assert.equal(s.positions.length, p.positions.length, `${name}/${key}: the same vertices`);
      let worst = 0;
      for (let i = 0; i < p.positions.length; i += 3) {
        assert.equal(s.positions[i], p.positions[i], `${name}/${key}: x`);
        assert.equal(s.positions[i + 2], p.positions[i + 2], `${name}/${key}: z`);
        worst = Math.max(worst, Math.abs((s.positions[i + 1] as number) - (p.positions[i + 1] as number) - seats[name].y));
      }
      assert.ok(worst < 1e-9, `${name}/${key}: every vertex is up by ${seats[name].y}, the worst is off by ${worst}`);
      assert.deepEqual(s.normals, p.normals, `${name}/${key}: normals`);
      assert.deepEqual(s.uvs, p.uvs, `${name}/${key}: UVs, so the brick courses are where they were`);
      assert.deepEqual(s.indices, p.indices, `${name}/${key}: triangles`);
    }
  }
  // The slate ridge and the assumed stacks are separate heights. The exact per-vertex
  // translation check above still covers every dormer and chimney vertex.
  close(highest(heights(seated.hotel, ['slate'])) - seats.hotel.y, plans.hotel.ridge, 1e-9, 'the hotel\'s slate ridge above its base');
  const stackTop = highest(heights(plain.hotel, ['stone']));
  assert.ok(stackTop > plans.hotel.ridge, 'the assumed chimney stacks extend above the slate ridge');
  close(highest(heights(seated.hotel, ['stone'])) - stackTop, seats.hotel.y, 1e-9, 'the chimney stacks rise with the hotel seat');
  close(highest(heights(seated.midland)) - seats.midland.y, FIGURES.midland.clockTowerHeight, 1e-9, 'the clock tower above its base');
  close(highest(heights(seated.barlow, ['slate', 'roofGlass'])) - seats.barlow.y, FIGURES.barlow.rise, 1e-3, 'the Barlow crown above its springings');
});

test('on a step 3 m high that cuts each footprint: the base is on the low side and level, so the walls are sunk 3 m into the high side', () => {
  for (const name of NAMES) {
    const at = middleX(rings[name]);
    const seats = landmarkSeats(plans, terrainOver(rings[name], stepAt(at, 0, 3)));
    const parts = named(landmarkGeometry(plans, seats))[name];
    const keys = shellOf(name, parts);
    close(lowest(heights(parts, keys)), 0, 0.01, `${name}: stands on the low ground`);
    const feet = feetAt(parts, keys, lowest(heights(parts, keys)));
    assert.ok(feet.some((p) => p[0] < at - 1) && feet.some((p) => p[0] > at + 1), `${name}: feet on both sides of the step at x = ${at}, all at one level`);
  }
});

// ---- the shed at track level -------------------------------------------------------------------

test('the Barlow shed is held no lower than 0.3 m under the railway\'s ground where the ground is lower; its ribs and boarding stand on the same floor, and the other buildings go down to the ground', () => {
  const seats = landmarkSeats(plans, terrainOver(everyRing, () => -3));
  const parts = named(landmarkGeometry(plans, seats));
  const floor = GROUND_Y - BARLOW_SINK;
  close(lowest(heights(parts.barlow, shellOf('barlow', parts.barlow))), floor, 1e-9, 'the shell stands on the floor, 0.3 m under the ground of the tracks');
  close(lowest(heights(parts.hotel)), -3, 0.01, 'the hotel follows the ground down');
  close(lowest(heights(parts.midland)), -3, 0.01, 'the Midland Grand too');
  const asBuilt = named(landmarkGeometry(plans)).barlow;
  for (const key of ['rib', 'lining'] as const) {
    assert.ok(lowest(heights(asBuilt, [key])) > -1e-9, `${key} do not hang under the springing line as built`);
    close(lowest(heights(parts.barlow, [key])) - floor, lowest(heights(asBuilt, [key])), 1e-9, `${key} keep their place over the shell once it is seated`);
  }
});

test('on ground level with the railway\'s own (GROUND_Y) the hotel, the Midland Grand and the shed, built on y = 0, come down by 0.2 m onto it', () => {
  const plain = named(landmarkGeometry(plans));
  const seated = named(landmarkGeometry(plans, landmarkSeats(plans, terrainOver(everyRing, () => GROUND_Y))));
  for (const name of NAMES) {
    close(lowest(heights(plain[name], shellOf(name, plain[name]))), 0, 1e-9, `${name}: built on y = 0`);
    close(lowest(heights(seated[name], shellOf(name, seated[name]))), GROUND_Y, 1e-6, `${name}: seated on the ground`);
  }
});

// ---- the footprints are where the buildings are ------------------------------------------------

test('the footprints are where the walls are: every vertex of the hotel and the Midland Grand is within a cornice\'s reach of its rings, the walls\' feet are on them, and the shed lies inside its rectangle, end to end', () => {
  const plain = named(landmarkGeometry(plans));
  // cornices stand proud of the wall by up to 1 m (the hotel's, hist-a), bands and pavilions by less; the hotel's cornice is broken forward 0.4 m over each advanced block, 1.4 m from
  // the wall, and where the end of its pilaster passes a facet join of the road front the corner of that block stands 1.5 m from the ring
  const reach: Record<LandmarkName, number> = { hotel: 1.51, midland: 1 + 1e-6, barlow: 0.01 };
  for (const name of NAMES) {
    let worst = 0;
    const xs: number[] = [];
    const zs: number[] = [];
    for (const [, b] of entries(plain[name])) {
      for (let i = 0; i < b.positions.length; i += 3) {
        const p: Pt = [b.positions[i] as number, b.positions[i + 2] as number];
        xs.push(p[0]);
        zs.push(p[1]);
        if (!rings[name].some((r) => pointInPolygon(p, r))) worst = Math.max(worst, Math.min(...rings[name].map((r) => distToRing(p, r))));
      }
    }
    assert.ok(worst <= reach[name], `${name}: a vertex ${worst} m outside its rings`);
    if (name === 'barlow') continue;
    // the rings are not bigger than the building: its extent covers theirs, and by no more than the cornice
    const rx = rings[name].flat().map((p) => p[0]);
    const rz = rings[name].flat().map((p) => p[1]);
    const over = [Math.min(...rx) - Math.min(...xs), Math.max(...xs) - Math.max(...rx), Math.min(...rz) - Math.min(...zs), Math.max(...zs) - Math.max(...rz)];
    for (const o of over) assert.ok(o >= -0.01 && o <= 1 + 1e-6, `${name}: the building reaches ${o} m beyond its rings' extent`);
    const keys = Object.keys(plain[name]) as Key[];
    const feet = feetAt(plain[name], keys, 0);
    assert.ok(feet.length >= 40, `${name}: ${feet.length} wall feet`);
    // the walls stand on the rings; only the stone at their foot stands out from them: the hotel's base 0.06 m, the Midland's entrance blocks 0.5 m (its base is 0.12 m)
    for (const p of feetAt(plain[name], keys.filter((k) => k !== 'stone'), 0)) assert.ok(rings[name].some((r) => distToRing(p, r) < 0.01), `${name}: a wall foot at ${p} is off its rings`);
    const proud = name === 'hotel' ? 0.06 : 0.5;
    const stoneFeet = feetAt(plain[name], ['stone'], 0);
    assert.ok(stoneFeet.length >= 20, `${name}: ${stoneFeet.length} stone feet`);
    // a mitred band's corner at a facet join stands proud / cos(half the turn) from its vertex: under 1 % more for the joins in these outlines (turns up to 12 degrees)
    for (const p of stoneFeet) assert.ok(rings[name].some((r) => distToRing(p, r) <= proud * 1.01 + 1e-6), `${name}: a stone foot at ${p} is more than ${proud} m off its rings`);
  }
  // the shed: along its length the rectangle is the vault, from the south wall to the north end
  const frame = { origin: plans.barlow.origin, heading: plans.barlow.heading };
  const vs = entries(plain.barlow).flatMap(([, b]) => b.positions.filter((_, i) => i % 3 === 0).map((x, j) => worldToShed(frame, [x, b.positions[j * 3 + 2] as number]).v));
  assert.ok(lowest(vs) < 0.2, `the vault starts at the rectangle's south end, ${lowest(vs)}`);
  close(highest(vs), plans.barlow.length, 1e-6, 'and runs to its north end');
});

// ---- nothing changes without a terrain, and what does not change with one --------------------

test('without a terrain the buildings are exactly what the plain builders make: no options, an empty object or an undefined terrain give the same vertices, normals, UVs and triangles, and no seats', () => {
  const sets = [hotelGeometry(plans.hotel), midlandGeometry(plans.midland), barlowGeometry(plans.barlow)];
  const viaPlans = landmarkGeometry(plans);
  assert.equal(viaPlans.length, 3);
  sets.forEach((s, i) => assert.deepEqual(partData(viaPlans[i] as PartMap<Key>), partData(s), `building ${i}: as built`));
  const set = createMaterials();
  const expected = meshData(mergeParts<Key>(sets, set.table, 'landmarks', { roofGlass: 2 }).group);
  assert.ok(expected.length >= 8 && expected[0]?.position.length, 'meshes to compare');
  for (const opts of [undefined, {}, { terrain: undefined }]) {
    const scene = new THREE.Scene();
    const lm = opts ? addLandmarks(scene, data, opts) : addLandmarks(scene, data);
    assert.equal(lm.seats, undefined, 'no terrain, no seats');
    assert.deepEqual(meshData(lm.group), expected, `${JSON.stringify(opts)}: the same meshes`);
    lm.dispose();
  }
  for (const o of set.owned) o.dispose();
});

test('with a terrain: the same draw calls, meshes, triangles and materials as without, the meshes carry the seated vertices, and the seats are reported', () => {
  const terrain = terrainOver(everyRing, slope);
  const flat = addLandmarks(new THREE.Scene(), data);
  const lm = addLandmarks(new THREE.Scene(), data, { terrain });
  assert.deepEqual(lm.group.children.map((c) => c.name), flat.group.children.map((c) => c.name), 'one mesh per material, the same ones');
  assert.ok(lm.group.children.length <= 10 + 6, `${lm.group.children.length} draw calls: the 10 of the first build, and the 6 the fidelity rubric allows`);
  assert.deepEqual(lm.group.children.map((c) => ((c as THREE.Mesh).geometry.index as THREE.BufferAttribute).count), flat.group.children.map((c) => ((c as THREE.Mesh).geometry.index as THREE.BufferAttribute).count), 'the same triangles in each');
  assert.deepEqual(lm.stats, flat.stats);
  assert.deepEqual(lm.excludeIds, flat.excludeIds);
  assert.deepEqual(lm.seats, landmarkSeats(plans, terrain));
  assert.deepEqual(Object.keys(lm.seats as object), NAMES);
  const set = createMaterials();
  const expected = meshData(mergeParts<Key>(landmarkGeometry(plans, lm.seats), set.table, 'landmarks', { roofGlass: 2 }).group);
  assert.deepEqual(meshData(lm.group), expected, 'the scene holds the seated parts');
  assert.notDeepEqual(meshData(lm.group).map((m) => m.position), meshData(flat.group).map((m) => m.position), 'and they are not where the flat ones are');
  for (const o of set.owned) o.dispose();
  flat.dispose();
  lm.dispose();
});

// ---- the real ground ---------------------------------------------------------------------------

test('on the real terrain: each building is on the lowest ground under its footprint (against a 0.5 m lattice of the ground itself), the shed no lower than 0.3 m under the tracks, the meshes as many as before', () => {
  const real = createTerrain(JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8')));
  const flat = addLandmarks(new THREE.Scene(), data);
  const lm = addLandmarks(new THREE.Scene(), data, { terrain: real });
  const seats = lm.seats as NonNullable<typeof lm.seats>;
  const seated = named(landmarkGeometry(plans, seats));
  for (const name of NAMES) {
    const e = extremesOver((x, z) => real.heightAt(x, z), rings[name]);
    close(seats[name].min, e.lo, 0.05, `${name}: the lowest ground under it`); // 2 m samples against a 0.5 m lattice
    const base = name === 'barlow' ? Math.max(seats[name].min, real.groundY - BARLOW_SINK) : seats[name].min;
    close(seats[name].y, base, 1e-9, `${name}: its seat`);
    close(lowest(heights(seated[name], shellOf(name, seated[name]))), seats[name].y, 1e-9, `${name}: the lowest vertex is the seat`);
  }
  assert.ok(lowest(heights(seated.barlow, shellOf('barlow', seated.barlow))) >= real.groundY - BARLOW_SINK - 1e-9, 'the shed is no lower than 0.3 m under the tracks');
  assert.equal(lm.group.children.length, flat.group.children.length, 'the same draw calls');
  assert.equal(lm.stats.triangles, flat.stats.triangles, 'the same triangles');
  flat.dispose();
  lm.dispose();
});

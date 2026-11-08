// web/src/kxcentral.ts on the ground: every structure of King's Cross Central is built standing on GROUND_Y and raised, as it is, onto its
// seat (core's kxSeats). Checked on surfaces whose lowest ground is known (a plane tilted 10%, a step, flat ground), then on the real terrain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { distToRing, FIG, gasholderName, kxSeats, pointInPolygon, structureFootprints } from '../../core/kxcentral.ts';
import type { Gasholder, Seat } from '../../core/kxcentral.ts';
import type { KxData } from '../../core/osm.ts';
import { createTerrain } from '../../core/terrain.ts';
import { extremesOver, middleX, stepAt, terrainOver, tilted } from '../../core/tests/ground-fixtures.ts';
import {
  addKxCentral,
  coalDropsGeometry,
  crickGeometry,
  createMaterials,
  gasholderGeometry,
  granaryComplexGeometry,
  gymnasiumGeometry,
  kxGeometry,
  kxPlans,
  landscraperGeometry,
  libraryGeometry,
  seatRise,
  treeMesh,
} from '../src/kxcentral.ts';
import type { Key } from '../src/kxcentral.ts';
import { Batch, mergeParts } from '../src/materials.ts';
import type { PartMap } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const plans = kxPlans(data);
const rings = structureFootprints(plans);
const NAMES = Object.keys(rings);
const everyRing = Object.values(rings).flat();
const ringsOf = (name: string): Pt[][] => rings[name] as Pt[][];
const GAS: Gasholder[] = [...plans.gas.triplet, plans.gas.park];
const GAS_NAMES = GAS.map(gasholderName);
/** the structures that are one set of parts each; the gasholders share one, for all four */
const SOLID = NAMES.filter((n) => !GAS_NAMES.includes(n));
/** a gradient of 10% east and south */
const slope = tilted();

const entries = (parts: PartMap<Key>): [Key, Batch][] => Object.entries(parts) as [Key, Batch][];
const heights = (sets: readonly PartMap<Key>[]): number[] => sets.flatMap((s) => entries(s).flatMap(([, b]) => b.positions.filter((_, i) => i % 3 === 1)));
const lowest = (ys: readonly number[]): number => ys.reduce((m, y) => Math.min(m, y), Infinity);
const highest = (ys: readonly number[]): number => ys.reduce((m, y) => Math.max(m, y), -Infinity);
/** where the vertices at height `y` stand in plan */
const feetAt = (sets: readonly PartMap<Key>[], y: number): Pt[] =>
  sets.flatMap((s) => entries(s).flatMap(([, b]) => b.positions.flatMap((_, i) => (i % 3 === 0 && Math.abs((b.positions[i + 1] as number) - y) < 1e-6 ? [[b.positions[i] as number, b.positions[i + 2] as number] as Pt] : []))));
const partData = (parts: PartMap<Key>): Record<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }> =>
  Object.fromEntries(entries(parts).map(([k, b]) => [k, { positions: [...b.positions], normals: [...b.normals], uvs: [...b.uvs], indices: [...b.indices] }]));
interface MeshData {
  name: string;
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}
const meshData = (group: THREE.Group): MeshData[] =>
  (group.children as THREE.Mesh[])
    .filter((m) => !(m as THREE.InstancedMesh).isInstancedMesh)
    .map((m) => ({
      name: m.name,
      position: Array.from(m.geometry.getAttribute('position').array),
      normal: Array.from(m.geometry.getAttribute('normal').array),
      uv: Array.from(m.geometry.getAttribute('uv').array),
      index: Array.from((m.geometry.index as THREE.BufferAttribute).array),
    }));
const treesOf = (group: THREE.Group): THREE.InstancedMesh => group.children.find((c) => c.name === 'kxcentral-trees') as THREE.InstancedMesh;
/** which of the sets of the geometry `kxGeometry` makes holds a structure */
const setsOf = (geo: Record<string, PartMap<Key>[]>, name: string): PartMap<Key>[] => geo[GAS_NAMES.includes(name) ? 'gasholders' : name] as PartMap<Key>[];

/** The gasholders' vertices by gasholder, found by raising each by a different, huge amount: the index into GAS of whoever built each vertex, by part. */
const TAG = 1000;
function gasOwners(): Map<Key, number[]> {
  const plain = gasholderGeometry(plans.gas);
  const out = new Map<Key, number[]>();
  for (const [key, t] of entries(gasholderGeometry(plans.gas, (g) => TAG * (GAS.indexOf(g) + 1)))) {
    const p = (plain[key] as Batch).positions;
    out.set(key, t.positions.filter((_, i) => i % 3 === 1).map((y, v) => Math.round((y - (p[v * 3 + 1] as number)) / TAG) - 1));
  }
  return out;
}
/** The y of the vertices of the gasholders' parts that gasholder `k` built; with `only`, those that were built at that height (before any lift). */
function gasHeights(parts: PartMap<Key>, owners: Map<Key, number[]>, k: number, only?: { key: Key; built: PartMap<Key>; y: number }): number[] {
  const out: number[] = [];
  for (const [key, b] of entries(parts)) {
    if (only && key !== only.key) continue;
    const own = owners.get(key) as number[];
    const built = only ? (only.built[key] as Batch).positions : [];
    for (let v = 0; v < own.length; v++) if (own[v] === k && (!only || Math.abs((built[v * 3 + 1] as number) - only.y) < 1e-9)) out.push(b.positions[v * 3 + 1] as number);
  }
  return out;
}

// ---- the seats the geometry is raised to -------------------------------------------------------

test('seatRise: how far a seat is above GROUND_Y, where everything is built; nothing without seats, and a structure with no seat is an error, not a guess', () => {
  const seat = (y: number): Seat => ({ y, min: y, max: y + 1 });
  assert.equal(seatRise(undefined, 'coalDrops'), 0);
  close(seatRise({ coalDrops: seat(GROUND_Y + 2.5) }, 'coalDrops'), 2.5, 1e-12, 'a seat above');
  close(seatRise({ coalDrops: seat(GROUND_Y - 1) }, 'coalDrops'), -1, 1e-12, 'a seat below');
  assert.throws(() => seatRise({ coalDrops: seat(0) }, 'crick'), /no seat for crick/);
  assert.throws(() => kxGeometry(plans, {}), /no seat for coalDrops/);
  const seats = kxSeats(plans, terrainOver(everyRing, slope));
  assert.doesNotThrow(() => kxGeometry(plans, seats), 'a seat for every structure is what kxSeats gives');
});

// ---- standing on a slope -----------------------------------------------------------------------

test('on a plane tilted 10% east and south: the lowest vertex of each structure is the lowest ground under its footprint, to a centimetre, and nothing is below it', () => {
  const geo = kxGeometry(plans, kxSeats(plans, terrainOver(everyRing, slope)));
  for (const name of SOLID) {
    const e = extremesOver(slope, ringsOf(name));
    assert.ok(e.hi - e.lo > 3, `${name}: a slope of 10% is metres of relief under a structure, got ${e.hi - e.lo}`);
    const ys = heights(setsOf(geo, name));
    close(lowest(ys), e.lo, 0.01, `${name}: the lowest vertex`);
    assert.ok(ys.every((y) => y >= e.lo - 0.01), `${name}: a vertex below the lowest ground by ${e.lo - lowest(ys)} m`);
  }
});

test('on a step 3 m high that cuts each footprint: the base is on the low side and level, so the walls are sunk 3 m into the high side', () => {
  for (const name of SOLID) {
    const at = middleX(ringsOf(name));
    const seats = kxSeats(plans, terrainOver(ringsOf(name), stepAt(at, 0, 3)));
    const sets = setsOf(kxGeometry(plans, seats), name);
    const ys = heights(sets);
    close(lowest(ys), 0, 0.01, `${name}: stands on the low ground`);
    const feet = feetAt(sets, lowest(ys));
    assert.ok(feet.some((p) => p[0] < at - 1) && feet.some((p) => p[0] > at + 1), `${name}: feet on both sides of the step at x = ${at}, all at one level`);
  }
});

// ---- the gasholders one by one -----------------------------------------------------------------

test('the gasholders are raised one by one: each vertex goes up by its own gasholder\'s lift and no other\'s, once, and stands inside that gasholder\'s circle', () => {
  const plain = gasholderGeometry(plans.gas);
  const tagged = gasholderGeometry(plans.gas, (g) => TAG * (GAS.indexOf(g) + 1));
  assert.deepEqual(Object.keys(tagged), Object.keys(plain), 'the same parts');
  const counts = GAS.map(() => 0);
  for (const [key, t] of entries(tagged)) {
    const p = plain[key] as Batch;
    assert.equal(t.positions.length, p.positions.length, `${key}: the same vertices`);
    for (let i = 0; i < p.positions.length; i += 3) {
      const shift = (t.positions[i + 1] as number) - (p.positions[i + 1] as number);
      const k = Math.round(shift / TAG) - 1;
      assert.ok(k >= 0 && k < GAS.length && Math.abs(shift - TAG * (k + 1)) < 1e-6, `${key}[${i / 3}] is raised by ${shift}: one gasholder's amount, once`);
      counts[k] = (counts[k] as number) + 1;
      const g = GAS[k] as Gasholder;
      assert.ok(Math.hypot((p.positions[i] as number) - g.centre[0], (p.positions[i + 2] as number) - g.centre[1]) <= g.radius + 0.5, `${key}[${i / 3}] stands outside the circle of the gasholder that raises it`);
      assert.equal(t.positions[i], p.positions[i], `${key}: x`);
      assert.equal(t.positions[i + 2], p.positions[i + 2], `${key}: z`);
    }
    assert.deepEqual(t.normals, p.normals, `${key}: normals`);
    assert.deepEqual(t.uvs, p.uvs, `${key}: UVs`);
    assert.deepEqual(t.indices, p.indices, `${key}: triangles`);
  }
  assert.ok(counts.every((c) => c > 200), `every gasholder has vertices of its own: ${counts}`);
  assert.deepEqual(partData(gasholderGeometry(plans.gas, () => 0)), partData(plain), 'a lift of nothing is no lift');
});

test('each gasholder stands on its own ground: on a tilted plane and on a step, its lowest vertex is the lowest ground under its circle, and its courtyard lawn goes up with it', () => {
  const owners = gasOwners();
  const plain = gasholderGeometry(plans.gas);
  const lawn = (parts: PartMap<Key>, k: number): number[] => gasHeights(parts, owners, k, { key: 'green', built: plain, y: GROUND_Y + 0.05 });
  // a plane 0.1 (x + z): the lowest point of a disc of radius r about (cx, cz) is 0.1 (cx + cz - sqrt 2 r), on its south-west edge
  const tilt = (kxGeometry(plans, kxSeats(plans, terrainOver(everyRing, slope))).gasholders as [PartMap<Key>])[0];
  GAS.forEach((g, k) => {
    const expected = 0.1 * (g.centre[0] + g.centre[1] - Math.SQRT2 * g.radius);
    const ys = gasHeights(tilt, owners, k);
    close(lowest(ys), expected, 0.01, `gasholder ${g.id} on the plane: its lowest vertex`);
    assert.ok(ys.every((y) => y >= expected - 0.01), `gasholder ${g.id}: a vertex below its ground`);
    if (g.drum) {
      const grass = lawn(tilt, k);
      assert.ok(grass.length > 20, `gasholder ${g.id}: a lawn in its courtyard`);
      for (const y of grass) close(y, expected + 0.05, 0.01, `gasholder ${g.id}: the lawn is a hair over its base`);
    }
  });
  // a step through each in turn: the base is on the low ground, and the gasholder is as tall as it was built
  GAS.forEach((g, k) => {
    const ring = ringsOf(gasholderName(g));
    const step = kxSeats(plans, terrainOver(ring, stepAt(middleX(ring), 0, 3)));
    const ys = gasHeights((kxGeometry(plans, step).gasholders as [PartMap<Key>])[0], owners, k);
    const built = gasHeights(plain, owners, k);
    close(lowest(ys), 0, 0.01, `gasholder ${g.id} on the step`);
    close(highest(ys) - lowest(ys), highest(built) - lowest(built), 1e-9, `gasholder ${g.id}: as tall as it was built`);
  });
});

// ---- only y moves ------------------------------------------------------------------------------

test('seated, only y moves: x, z, normals, UVs and triangles are as built and every vertex is up by its structure\'s seat, so every roof stands as high above its base as before', () => {
  const seats = kxSeats(plans, terrainOver(everyRing, slope));
  const plain = kxGeometry(plans);
  const seated = kxGeometry(plans, seats);
  const owners = gasOwners();
  assert.deepEqual(Object.keys(seated), Object.keys(plain));
  for (const [group, sets] of Object.entries(seated)) {
    const was = plain[group] as PartMap<Key>[];
    assert.equal(sets.length, was.length, `${group}: the same buildings`);
    sets.forEach((s, n) => {
      assert.deepEqual(Object.keys(s), Object.keys(was[n] as PartMap<Key>), `${group}/${n}: the same parts`);
      for (const [key, b] of entries(s)) {
        const p = (was[n] as PartMap<Key>)[key] as Batch;
        assert.equal(b.positions.length, p.positions.length, `${group}/${key}: the same vertices`);
        let worst = 0;
        for (let i = 0; i < p.positions.length; i += 3) {
          assert.equal(b.positions[i], p.positions[i], `${group}/${key}: x`);
          assert.equal(b.positions[i + 2], p.positions[i + 2], `${group}/${key}: z`);
          const owner = group === 'gasholders' ? ((owners.get(key) as number[])[i / 3] as number) : -1;
          const rise = seatRise(seats, group === 'gasholders' ? gasholderName(GAS[owner] as Gasholder) : group);
          worst = Math.max(worst, Math.abs((b.positions[i + 1] as number) - (p.positions[i + 1] as number) - rise));
        }
        assert.ok(worst < 1e-9, `${group}/${key}: every vertex is up by its seat's rise, the worst is off by ${worst}`);
        assert.deepEqual(b.normals, p.normals, `${group}/${key}: normals`);
        assert.deepEqual(b.uvs, p.uvs, `${group}/${key}: UVs, so the textures are where they were`);
        assert.deepEqual(b.indices, p.indices, `${group}/${key}: triangles`);
      }
    });
  }
  // what the sources give is measured from the base: the kiss of the Coal Drops' roofs, the Granary's ridge, Platform 37's eleven storeys
  const top = (name: string): number => highest(heights(setsOf(seated, name))) - (seats[name] as Seat).y;
  close(top('coalDrops'), FIG.coal.apex - GROUND_Y, 1e-9, 'Coal Drops: the kiss, above the ground it stands on');
  close(top('granary'), plans.granary.granary.eaves + plans.granary.granary.roofRise - GROUND_Y, 1e-9, 'Granary: the ridge');
  close(top('landscraper'), 11 * 4.2 - GROUND_Y, 1e-9, 'Platform 37: 11 storeys');
});

test('the roof gardens\' trees go up with their terrace: each is up by the landscraper\'s rise, no further across, and stands on a roof of the landscraper as seated', () => {
  const terrain = terrainOver(everyRing, slope);
  const flat = addKxCentral(new THREE.Scene(), data);
  const kx = addKxCentral(new THREE.Scene(), data, { terrain });
  const rise = seatRise(kx.seats, 'landscraper');
  assert.ok(Math.abs(rise) > 1, `the terrace is seated well off GROUND_Y (${rise} m)`);
  const roofs = new Set<number>();
  const green = (kxGeometry(plans, kx.seats).landscraper as PartMap<Key>[])[0]?.green as Batch;
  for (let i = 1; i < green.positions.length; i += 3) roofs.add(Math.round((green.positions[i] as number) * 1e6) / 1e6);
  const a = new THREE.Matrix4();
  const b = new THREE.Matrix4();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const mesh = treesOf(kx.group);
  const was = treesOf(flat.group);
  assert.equal(mesh.count, 250);
  assert.equal(was.count, mesh.count);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, a);
    was.getMatrixAt(i, b);
    a.decompose(pa, q, s);
    b.decompose(pb, q, s);
    close(pa.x, pb.x, 1e-3, 'x');
    close(pa.z, pb.z, 1e-3, 'z');
    close(pa.y - pb.y, rise, 1e-3, `tree ${i} goes up with the terrace`);
    const soil = pa.y - 0.5 - s.x * 0.45; // a trunk's worth above the soil; the crown's size is its scale
    assert.ok([...roofs].some((y) => Math.abs(y - soil) < 1e-3), `tree ${i}: soil at ${soil} is on no roof of the seated landscraper`);
  }
  assert.deepEqual(flat.group.children.map((c) => c.name), kx.group.children.map((c) => c.name));
  flat.dispose();
  kx.dispose();
});

test('on ground level with the railway\'s own (GROUND_Y) nothing moves, to a micrometre (the terrain keeps its heights in 32 bits): the structures are built on it', () => {
  const plain = kxGeometry(plans);
  const level = kxGeometry(plans, kxSeats(plans, terrainOver(everyRing, () => GROUND_Y)));
  for (const [group, sets] of Object.entries(level)) {
    sets.forEach((s, n) => {
      for (const [key, b] of entries(s)) {
        const p = ((plain[group] as PartMap<Key>[])[n] as PartMap<Key>)[key] as Batch;
        b.positions.forEach((v, i) => assert.ok(Math.abs(v - (p.positions[i] as number)) < 1e-6, `${group}/${key}[${i}]: ${v} against ${p.positions[i]}`));
      }
    });
  }
});

// ---- the footprints are where the structures are -----------------------------------------------

test('the footprints are where the walls are: every vertex of each structure is within what stands proud of the wall from its rings, their extent is the building\'s, and the walls\' feet are on them', () => {
  const geo = kxGeometry(plans);
  // how far what stands proud of a wall (window decals, hoist piers, the Library's simplified outline) may reach outside the rings, and how far a wall's foot: measured, with a little over
  const reach: Record<string, number> = { coalDrops: 0.1, granary: FIG.granary.hoistProjection + 0.1, crick: 0.05, library: 3, gymnasium: 0.5, landscraper: 0.05 };
  const footReach: Record<string, number> = { coalDrops: 0.05, granary: FIG.granary.hoistProjection + 0.01, crick: 0.05, library: 0.05, gymnasium: 0.05, landscraper: 0.05 };
  for (const name of SOLID) {
    const sets = setsOf(geo, name);
    const rs = ringsOf(name);
    const xs: number[] = [];
    const zs: number[] = [];
    let worst = 0;
    for (const s of sets) {
      for (const [, b] of entries(s)) {
        for (let i = 0; i < b.positions.length; i += 3) {
          const p: Pt = [b.positions[i] as number, b.positions[i + 2] as number];
          xs.push(p[0]);
          zs.push(p[1]);
          if (!rs.some((r) => pointInPolygon(p, r))) worst = Math.max(worst, Math.min(...rs.map((r) => distToRing(p, r))));
        }
      }
    }
    assert.ok(worst <= (reach[name] as number), `${name}: a vertex ${worst} m outside its rings`);
    const rx = rs.flat().map((p) => p[0]);
    const rz = rs.flat().map((p) => p[1]);
    const over = [Math.min(...rx) - Math.min(...xs), Math.max(...xs) - Math.max(...rx), Math.min(...rz) - Math.min(...zs), Math.max(...zs) - Math.max(...rz)];
    for (const o of over) assert.ok(o >= -0.01 && o <= 1, `${name}: the structure reaches ${o} m beyond its rings' extent`);
    const feet = feetAt(sets, GROUND_Y);
    assert.ok(feet.length >= 20, `${name}: ${feet.length} wall feet`);
    for (const p of feet) assert.ok(rs.some((r) => distToRing(p, r) <= (footReach[name] as number)), `${name}: a wall foot at ${p} is off its rings`);
  }
});

// ---- nothing changes without a terrain, and what does not change with one --------------------

test('without a terrain every structure is exactly what the plain builders make: no options, an empty object or an undefined terrain give the same vertices, normals, UVs, triangles and trees, and no seats', () => {
  const builders: Record<string, PartMap<Key>[]> = {
    coalDrops: [coalDropsGeometry(plans.coal)],
    granary: granaryComplexGeometry(plans.granary),
    gasholders: [gasholderGeometry(plans.gas)],
    crick: [crickGeometry(plans.crick)],
    library: [libraryGeometry(plans.library)],
    gymnasium: [gymnasiumGeometry(plans.gymnasium)],
    landscraper: [landscraperGeometry(plans.landscraper)],
  };
  const viaPlans = kxGeometry(plans);
  assert.deepEqual(Object.keys(viaPlans), Object.keys(builders));
  for (const [group, sets] of Object.entries(builders)) {
    assert.equal((viaPlans[group] as PartMap<Key>[]).length, sets.length);
    sets.forEach((s, n) => assert.deepEqual(partData((viaPlans[group] as PartMap<Key>[])[n] as PartMap<Key>), partData(s), `${group}/${n}: as built`));
  }
  const set = createMaterials();
  const expected = meshData(mergeParts<Key>(Object.values(builders).flat(), set.table, 'kxcentral', { roofGlass: 2 }).group);
  assert.equal(expected.length, 14, 'one mesh per material');
  for (const opts of [undefined, {}, { terrain: undefined }]) {
    const lm = opts ? addKxCentral(new THREE.Scene(), data, opts) : addKxCentral(new THREE.Scene(), data);
    assert.equal(lm.seats, undefined, 'no terrain, no seats');
    assert.deepEqual(meshData(lm.group), expected, `${JSON.stringify(opts)}: the same meshes`);
    const plainTrees = treeMesh(plans.landscraper.trees);
    assert.deepEqual(Array.from(treesOf(lm.group).instanceMatrix.array), Array.from(plainTrees.instanceMatrix.array), 'the same trees');
    plainTrees.geometry.dispose();
    (plainTrees.material as THREE.Material).dispose();
    lm.dispose();
  }
  for (const o of set.owned) o.dispose();
});

test('with a terrain: the same draw calls, meshes, triangles and materials as without, the meshes carry the seated vertices, and the seats are reported', () => {
  const terrain = terrainOver(everyRing, slope);
  const flat = addKxCentral(new THREE.Scene(), data);
  const kx = addKxCentral(new THREE.Scene(), data, { terrain });
  assert.equal(kx.group.children.length, 15, 'fourteen materials and the trees: the same draw calls');
  assert.deepEqual(kx.group.children.map((c) => c.name), flat.group.children.map((c) => c.name));
  assert.deepEqual(meshData(kx.group).map((m) => m.index), meshData(flat.group).map((m) => m.index), 'the same triangles in each');
  assert.deepEqual(kx.stats, flat.stats);
  assert.deepEqual(kx.excludeIds, flat.excludeIds);
  assert.deepEqual(kx.seats, kxSeats(plans, terrain));
  assert.deepEqual(Object.keys(kx.seats as object), NAMES);
  const set = createMaterials();
  const expected = meshData(mergeParts<Key>(Object.values(kxGeometry(plans, kx.seats)).flat(), set.table, 'kxcentral', { roofGlass: 2 }).group);
  assert.deepEqual(meshData(kx.group), expected, 'the scene holds the seated parts');
  assert.notDeepEqual(meshData(kx.group).map((m) => m.position), meshData(flat.group).map((m) => m.position), 'and they are not where the flat ones are');
  for (const o of set.owned) o.dispose();
  flat.dispose();
  kx.dispose();
});

// ---- the real ground ---------------------------------------------------------------------------

test('on the real terrain: each structure is on the lowest ground under its footprint (against a 0.5 m lattice of the ground itself), nothing is below its seat, the meshes as many as before', () => {
  const real = createTerrain(JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8')));
  const flat = addKxCentral(new THREE.Scene(), data);
  const kx = addKxCentral(new THREE.Scene(), data, { terrain: real });
  const seats = kx.seats as Record<string, Seat>;
  assert.deepEqual(Object.keys(seats), NAMES);
  const geo = kxGeometry(plans, seats);
  const owners = gasOwners();
  for (const name of NAMES) {
    const e = extremesOver((x, z) => real.heightAt(x, z), ringsOf(name));
    const seat = seats[name] as Seat;
    close(seat.min, e.lo, 0.05, `${name}: the lowest ground under it`); // 2 m samples against a 0.5 m lattice
    close(seat.y, seat.min, 1e-9, `${name}: its seat`);
    const ys = GAS_NAMES.includes(name) ? gasHeights((geo.gasholders as PartMap<Key>[])[0] as PartMap<Key>, owners, GAS_NAMES.indexOf(name)) : heights(setsOf(geo, name));
    close(lowest(ys), seat.y, 1e-9, `${name}: the lowest vertex is the seat`);
  }
  assert.equal(kx.group.children.length, flat.group.children.length, 'the same draw calls');
  assert.equal(kx.stats.triangles, flat.stats.triangles, 'the same triangles');
  flat.dispose();
  kx.dispose();
});

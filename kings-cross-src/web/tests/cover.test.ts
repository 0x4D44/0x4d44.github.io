// web/src/cover.ts: roofs keep the weather off. The map is drawn from the real roof meshes (the shed, the concourse, the platform canopies, the
// landmarks), and what the tests hold is that a point under one of them gets no rain, no snow and no wetness while a point in the open, or above
// the roof it is over, gets all of it. The shaders that read the map are run, on these roofs, in cover-shaders.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, concourseHeight, pointInPolygon, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse } from '../src/concourse.ts';
import { applyCover, buildCoverMap, COVER_BLUR, COVER_CELL, COVER_DEEP, COVER_GLSL, COVER_MAX_CELLS, COVER_SHALLOW, COVER_STEP, coverAt, coverHeightAt, coverSoftAt, coverUniforms, findRoofs, groundCoverAt, groundOpenShare, openShare, ROOF_MESHES, ROOM_ROOFS } from '../src/cover.ts';
import { buildFurniture, furniturePlan } from '../src/furniture.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { buildShed, ROOF_SKIN } from '../src/shed.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import type { CoverMap } from '../src/cover.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const footprint = stationBuilding(data)!.pts;
const plan = furniturePlan(data, layout);
const R = SHED_SPAN_WIDTH / 2;

// the real station, as main.ts builds it
const scene = new THREE.Scene();
scene.add(buildShed(layout));
scene.add(buildConcourse(canopy, footprint, layout, data.buildings.filter((b) => b.id === 46821177).map((b) => b.pts)));
scene.add(buildFurniture(data, layout));
const map = buildCoverMap(scene) as CoverMap;
const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
const cover = (p: [number, number, number]): number => coverAt(map, p[0], p[1], p[2]);
const roofAt = (p: [number, number, number]): number => coverHeightAt(map, p[0], p[2]);

/** A flat or sloped roof of `corners` (world x, y, z, four of them, in order), as a mesh named like a real roof. */
function roof(corners: [number, number, number][], name = 'canopy-glass', indexed = true): THREE.Mesh {
  const flat = corners.flat();
  const g = new THREE.BufferGeometry();
  if (indexed) {
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
  } else {
    const c = corners;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...c[0]!, ...c[1]!, ...c[2]!, ...c[0]!, ...c[2]!, ...c[3]!], 3));
  }
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}
const slab = (x0: number, x1: number, z0: number, z1: number, y: number, name?: string): THREE.Mesh =>
  roof([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], name);
const sceneOf = (...meshes: THREE.Object3D[]): THREE.Scene => { const s = new THREE.Scene(); s.add(...meshes); return s; };

test('the roofs the cover is drawn from are the real builders\' meshes, by name: a renamed roof would let the rain through', () => {
  const found = findRoofs(scene).map((m) => m.name).sort();
  assert.deepEqual(found, ['canopy-glass', 'concourse-glass', 'concourse-panels', 'shed-aisle-roofs', 'shed-roof-cladding', 'shed-roof-glass'], 'the shed, the concourse and the canopies');
  const landmarks = new THREE.Scene();
  addLandmarks(landmarks, data, {});
  assert.deepEqual(findRoofs(landmarks).map((m) => m.name).sort(), ['landmarks-roofGlass', 'landmarks-slate'], 'and the Barlow shed (the hotels\' slate comes with it)');
  const scottish = buildWaverleyScene({ lighting: false });
  try {
    const roofs = findRoofs(scottish.group).map(m => m.name);
    assert.deepEqual(roofs.sort(), ['waverley-building-tops', 'waverley-mapped-roofs']);
    assert.deepEqual([...ROOF_MESHES].sort(), [...found, ...findRoofs(landmarks).map((m) => m.name), ...roofs].sort(), 'and no name is listed that is not a roof');
  } finally { scottish.dispose(); }
  for (const m of findRoofs(scene)) assert.ok(m.geometry.getAttribute('position').count >= 3, `${m.name} has triangles`);
  assert.deepEqual(findRoofs(new THREE.Scene()), []);
  assert.ok(buildCoverMap(new THREE.Scene()) === null, 'no roofs, no map');
});

test('the shed: every point of its floor is under a roof, at every height below it, and the sky above the roof is open', () => {
  assert.ok(map.nx * map.nz <= COVER_MAX_CELLS && map.cell >= COVER_CELL);
  for (let v = 4; v < layout.length - 3; v += 9.7) {
    for (let u = 1; u < layout.width - 0.9; u += 2.3) {
      const roofY = roofAt(at(u, v, 0));
      assert.ok(roofY > layout.springing - 0.3, `a roof over the shed at u ${u.toFixed(1)}, v ${v.toFixed(1)}: ${roofY}`);
      assert.ok(roofY < layout.crown + ROOF_SKIN + 0.2, `and no higher than its crown: ${roofY}`);
      for (const y of [-0.2, PLATFORM_HEIGHT, PLATFORM_HEIGHT + 1.6, 4]) {
        assert.equal(cover(at(u, v, y)), 1, `under the roof at u ${u.toFixed(1)}, v ${v.toFixed(1)}, ${y} m up`);
        assert.equal(openShare(map, ...at(u, v, y)), 0, 'no weather reaches it');
      }
      assert.equal(cover(at(u, v, roofY + 0.5)), 0, 'above the roof the rain is falling on it');
      assert.equal(cover(at(u, v, roofY + 30)), 0);
    }
  }
});

test('the shed\'s roof is the drawn one: the arch of each vault, the valley between them, the flat aisle roofs', () => {
  const crown = layout.crown + ROOF_SKIN;
  for (const uc of [layout.aisle + R, layout.aisle + 3 * R]) {
    assert.ok(Math.abs(roofAt(at(uc, 100, 0)) - crown) < 0.3, `the crown of the vault at ${uc.toFixed(1)}: ${roofAt(at(uc, 100, 0))} against ${crown}`);
    for (const d of [3, 6, 9, 12]) {
      for (const side of [-1, 1]) {
        const arch = layout.springing + Math.sqrt((R + ROOF_SKIN) ** 2 - d * d);
        assert.ok(Math.abs(roofAt(at(uc + side * d, 100, 0)) - arch) < 0.5, `${d} m off the crown line: ${roofAt(at(uc + side * d, 100, 0)).toFixed(2)} against the arch's ${arch.toFixed(2)}`);
      }
    }
  }
  for (const aisle of [layout.aisle / 2, layout.width - layout.aisle / 2]) {
    assert.ok(Math.abs(roofAt(at(aisle, 100, 0)) - layout.springing) < 0.3, `an aisle roof at the springing: ${roofAt(at(aisle, 100, 0))}`);
  }
  const valley = roofAt(at(layout.aisle + 2 * R, 100, 0));
  assert.ok(valley > layout.springing + 1 && valley < crown - 6, `where the vaults meet the roof is low: ${valley}`);
});

test('in the open nothing is covered: outside the shed walls, beyond both ends, in the next street, and far from the station', () => {
  const W = layout.width, L = layout.length;
  const open: [string, [number, number, number]][] = [
    ['east of the east wall', at(W + 4, 100, 1.5)], ['east of the east wall, high', at(W + 4, 100, 12)], ['north of the shed', at(W / 2, L + 6, 1.5)],
    ['south of the south front', at(W / 2, -8, 1.5)], ['the far east', at(W + 120, 100, 1.5)], ['far away', [4000, 1.5, 4000]], ['far below the map', [-5000, 1.5, -5000]],
  ];
  for (const [label, p] of open) {
    assert.equal(cover(p), 0, label);
    assert.equal(openShare(map, ...p), 1, `${label}: all the weather`);
  }
  assert.equal(coverAt(null, 0, 0, 0), 0, 'with no map there is no roof');
});

test('the edge of a roof is where the weather starts: stepping out of the shed across its east wall goes from covered to open in one place and stays open', () => {
  const W = layout.width;
  const line = Array.from({ length: 80 }, (_, i) => cover(at(W - 8 + i * 0.2, 100, 1.5)));
  const out = line.findIndex((c) => c < 0.5);
  assert.ok(out > 0 && out < 79, `it leaves the roof within the line: ${out}`);
  assert.ok(line.slice(0, out).every((c) => c === 1) && line.slice(out).every((c) => c === 0), `once out, it stays out: ${line.join('')}`);
  assert.ok(Math.abs((W - 8 + out * 0.2) - W) <= 1, `at the wall, give or take a cell: the roof ends at ${(W - 8 + out * 0.2).toFixed(1)} against ${W.toFixed(1)}`);
});

test('the concourse: under every triangle of the dome, and across its floor, is covered; above the dome is open', () => {
  // each drawn roof triangle, at its middle: a person's height under it is under cover and the sky 3 m over it is open
  let triangles = 0, under = 0;
  for (const mesh of findRoofs(scene).filter((m) => m.name === 'concourse-glass' || m.name === 'concourse-panels')) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i + 2 < position.count; i += 3) {
      const mid = [0, 1, 2].reduce((m, k) => m.add(new THREE.Vector3(position.getX(i + k), position.getY(i + k), position.getZ(i + k))), new THREE.Vector3()).multiplyScalar(1 / 3);
      triangles++;
      if (coverAt(map, mid.x, mid.y - 1.5, mid.z) === 1) under++;
      assert.equal(coverAt(map, mid.x, mid.y + 3, mid.z), 0, 'and the sky above the dome is open');
    }
  }
  assert.ok(triangles > 500, `${triangles} dome triangles to try`);
  assert.ok(under / triangles > 0.995, `under every triangle of the dome: ${under} of ${triangles}`);
  // the dome's own height: at the stalk the drawn roof is near the published 20 m, near the rim it is low
  const centre = coverHeightAt(map, canopy.centre[0], canopy.centre[1]);
  assert.ok(centre > concourseHeight(canopy, 0) - 3 && centre <= concourseHeight(canopy, 0) + 1, `at the stalk: ${centre}`);
  // across the floor: the footprint west of the shed, inside the building, is under the roof except in the small corners of the OSM outline
  // the roof ring does not reach (the floor is the whole outline; the roof is the diagrid inside it)
  const edgeDistance = (p: [number, number]): number => Math.min(...footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
  }));
  let floor = 0, covered = 0;
  const bare: string[] = [];
  for (let x = canopy.centre[0] - canopy.radius; x <= canopy.centre[0] + canopy.radius; x += 2) {
    for (let z = canopy.centre[1] - canopy.radius; z <= canopy.centre[1] + canopy.radius; z += 2) {
      if (!pointInPolygon([x, z], footprint) || worldToShed(layout, [x, z]).u > -50) continue;
      floor++;
      if (cover([x, 1.5, z]) === 1) covered++;
      else if (edgeDistance([x, z]) > 5) bare.push(`${x.toFixed(0)},${z.toFixed(0)}`);
    }
  }
  assert.ok(floor > 400, `${floor} floor points to try`);
  assert.ok(covered / floor > 0.95, `the concourse floor is under its roof: ${covered} of ${floor}`);
  assert.deepEqual(bare, [], 'and what is not is at the building\'s edge, never in the middle of the floor');
});

test('the platform canopies: the strip between a canopy\'s edge beams is covered, the track beside it is open', () => {
  assert.ok(plan.canopies.length >= 2, 'the plan has the canopies of platforms 9 and 10');
  for (const c of plan.canopies) {
    for (let i = 1; i + 1 < c.left.length; i += Math.max(1, Math.floor(c.left.length / 8))) {
      const l = c.left[i] as [number, number], r = c.right[i] as [number, number];
      const mid = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2] as const;
      assert.ok(Math.abs(coverHeightAt(map, mid[0], mid[1]) - (c.roofY - 0.05)) < 0.3, `platform ${c.ref}: the roof over its middle is the canopy's: ${coverHeightAt(map, mid[0], mid[1])} against ${c.roofY}`);
      assert.equal(coverAt(map, mid[0], PLATFORM_HEIGHT + 1.6, mid[1]), 1, `platform ${c.ref}: a person standing there is under cover`);
      assert.equal(coverAt(map, mid[0], c.roofY + 1, mid[1]), 0, `platform ${c.ref}: above the canopy is open`);
      const len = Math.hypot(r[0] - l[0], r[1] - l[1]);
      for (const [from, away] of [[l, -1], [r, 1]] as const) {
        const x = from[0] + ((away * (r[0] - l[0])) / len) * 2.5, z = from[1] + ((away * (r[1] - l[1])) / len) * 2.5;
        assert.equal(coverAt(map, x, PLATFORM_HEIGHT + 1.6, z), 0, `platform ${c.ref}: 2.5 m beyond an edge beam is open to the rain`);
      }
    }
  }
});

test('the weather\'s share: none of the rain, the snow or the wet under a roof; all of it in the open and on top of a roof', () => {
  const rain = weatherState(forcedObservation('rain')), snow = weatherState(forcedObservation('snow'));
  assert.ok(rain.wet > 0.5 && snow.snowCover > 0.5, 'the weather has something to keep off');
  const shed = at(layout.aisle + R, 100, PLATFORM_HEIGHT);
  const open = at(layout.width + 15, 100, PLATFORM_HEIGHT);
  const onTheRoof = at(layout.aisle + R, 100, layout.crown + 2);
  const [concourse] = [[canopy.centre[0] - canopy.radius * 0.3, 1.5, canopy.centre[1]] as [number, number, number]];
  // what each shader multiplies by: drops by the share that reaches them, the ground's wet and snow by the share that reaches it (with a soft edge)
  const dropsAt = (p: [number, number, number]): number => openShare(map, ...p);
  const wetAt = (p: [number, number, number]): number => rain.wet * groundOpenShare(map, ...p);
  const whiteAt = (p: [number, number, number]): number => snow.snowCover * groundOpenShare(map, ...p);
  for (const under of [shed, at(layout.aisle / 2, 60, PLATFORM_HEIGHT), at(layout.aisle + 3 * R, 180, 2), concourse]) {
    assert.equal(dropsAt(under), 0, `no drops under a roof at ${under}`);
    assert.equal(wetAt(under), 0, 'no wetness');
    assert.equal(whiteAt(under), 0, 'no snow');
  }
  for (const out of [open, onTheRoof, at(layout.width / 2, layout.length + 30, 0)]) {
    assert.equal(dropsAt(out), 1, `all the drops in the open at ${out}`);
    assert.equal(wetAt(out), rain.wet, 'all the wetness');
    assert.equal(whiteAt(out), snow.snowCover, 'all the snow');
  }
});

test('a drop comes out from under a roof over its last stretch, not in one step: wholly under at 0.6 m below, gone from the roof itself', () => {
  assert.equal(COVER_DEEP, 0.6);
  assert.equal(COVER_SHALLOW, 0.05);
  const p = at(layout.aisle + R, 100, 0);
  const roofY = roofAt(p);
  const share = (below: number): number => coverAt(map, p[0], roofY - below, p[2]);
  assert.equal(share(COVER_DEEP), 1);
  assert.equal(share(3), 1);
  assert.equal(share(COVER_SHALLOW), 0);
  assert.equal(share(0), 0);
  assert.equal(share(-2), 0);
  const mid = share((COVER_DEEP + COVER_SHALLOW) / 2);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, `half way: ${mid}`);
  let last = 1;
  for (let below = COVER_DEEP; below >= COVER_SHALLOW; below -= 0.01) {
    const s = share(below);
    assert.ok(s <= last + 1e-12, 'it only ever lets more through as it rises toward the roof');
    last = s;
  }
});

test('drawn from meshes: a flat roof covers exactly its footprint at its height; a slope is followed; a wall is not a roof; the highest roof wins', () => {
  const flat = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 6)))!;
  assert.ok(Math.abs(coverHeightAt(flat, 7, 6) - 6) <= COVER_STEP / 2 + 1e-9, `${coverHeightAt(flat, 7, 6)}`);
  for (const [x, z] of [[2.1, 3.1], [11.9, 8.9], [2.1, 8.9], [11.9, 3.1], [7, 5.9]]) assert.ok(coverHeightAt(flat, x!, z!) > 5.8, `inside at ${x}, ${z}`);
  for (const [x, z] of [[1.7, 6], [12.3, 6], [7, 2.7], [7, 9.3], [-40, -40], [100, 100]]) assert.equal(coverHeightAt(flat, x!, z!), 0, `outside at ${x}, ${z}`);
  assert.equal(coverAt(flat, 7, 2, 6), 1);
  assert.equal(coverAt(flat, 7, 7, 6), 0);

  const sloped = buildCoverMap(sceneOf(roof([[0, 4, 0], [0, 4, 10], [10, 9, 10], [10, 9, 0]])))!;
  for (const x of [1, 3.3, 5, 7.7, 9.5]) assert.ok(Math.abs(coverHeightAt(sloped, x, 5) - (4 + 0.5 * x)) < 0.25, `the slope at x = ${x}: ${coverHeightAt(sloped, x, 5)}`);

  const wall = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([5, 0, 0, 5, 0, 10, 5, 10, 10, 5, 10, 0], 3)).setIndex([0, 1, 2, 0, 2, 3]), new THREE.MeshBasicMaterial());
  wall.name = 'shed-aisle-roofs';
  const walled = buildCoverMap(sceneOf(wall, slab(20, 30, 0, 10, 5)))!;
  assert.equal(coverHeightAt(walled, 5, 5), 0, 'a wall stands on edge in plan: it covers nothing');
  assert.ok(coverHeightAt(walled, 25, 5) > 4.8);

  const stacked = buildCoverMap(sceneOf(slab(0, 10, 0, 10, 6), slab(5, 15, 0, 10, 9, 'shed-roof-cladding')))!;
  assert.ok(Math.abs(coverHeightAt(stacked, 2, 5) - 6) < 0.1 && Math.abs(coverHeightAt(stacked, 12, 5) - 9) < 0.1 && Math.abs(coverHeightAt(stacked, 7, 5) - 9) < 0.1, 'where roofs overlap the higher one counts');

  const lower = buildCoverMap(sceneOf(slab(5, 15, 0, 10, 9, 'shed-roof-cladding'), slab(0, 10, 0, 10, 6)))!;
  assert.ok(Math.abs(coverHeightAt(lower, 7, 5) - 9) < 0.1, 'whichever was drawn first');
  assert.equal(coverHeightAt(buildCoverMap(sceneOf(slab(0, 10, 0, 10, 60)))!, 5, 5), 255 * COVER_STEP, 'a very high roof is held at the highest height the map can store');
  assert.equal(coverHeightAt(buildCoverMap(sceneOf(slab(0, 10, 0, 10, 0.03)))!, 5, 5), 0, 'and a roof lower than a step of the map is no roof');
});

test('drawn from meshes: a roof under a moved and turned parent is covered where it is in the world; indexed or not, both windings', () => {
  const group = new THREE.Group();
  group.rotation.y = 0.6;
  group.position.set(100, 2, -50);
  group.add(slab(0, 10, 0, 10, 6));
  const world = buildCoverMap(sceneOf(group))!;
  const inside = new THREE.Vector3(5, 6, 5).applyMatrix4(group.matrixWorld);
  assert.ok(Math.abs(coverHeightAt(world, inside.x, inside.z) - 8) <= 0.1, `the roof stands 2 m higher by the parent: ${coverHeightAt(world, inside.x, inside.z)}`);
  assert.equal(coverHeightAt(world, 5, 5), 0, 'and not where it was built');
  const corner = new THREE.Vector3(10.4, 6, 10.4).applyMatrix4(group.matrixWorld);
  assert.equal(coverHeightAt(world, corner.x, corner.z), 0, 'the turned footprint ends where the turned roof does');
  const back = new THREE.Mesh(roof([[0, 5, 0], [10, 5, 0], [10, 5, 10], [0, 5, 10]]).geometry, new THREE.MeshBasicMaterial());
  back.name = 'canopy-glass';
  assert.ok(Math.abs(coverHeightAt(buildCoverMap(sceneOf(back))!, 5, 5) - 5) < 0.1, 'a roof wound the other way is a roof');
  const plain = roof([[0, 5, 0], [0, 5, 10], [10, 5, 10], [10, 5, 0]], 'canopy-glass', false);
  assert.ok(Math.abs(coverHeightAt(buildCoverMap(sceneOf(plain))!, 5, 5) - 5) < 0.1, 'a roof with no index is a roof');
  const other = new THREE.Mesh(slab(0, 10, 0, 10, 6).geometry, new THREE.MeshBasicMaterial());
  other.name = 'a-building';
  assert.ok(buildCoverMap(sceneOf(other)) === null, 'only the named roofs count');
});

test('a very wide area gets bigger cells rather than a bigger map', () => {
  const wide = buildCoverMap(sceneOf(slab(0, 6000, 0, 6000, 8)))!;
  assert.ok(wide.cell > COVER_CELL, `${wide.cell}`);
  assert.ok(wide.nx * wide.nz <= COVER_MAX_CELLS, `${wide.nx} x ${wide.nz}`);
  assert.ok(Math.abs(coverHeightAt(wide, 3000, 3000) - 8) <= COVER_STEP);
  assert.equal(coverHeightAt(wide, 7000, 3000), 0);
  // the cells grow a quarter metre at a time to the first size that fits: 2002 m over 1000 cells needs 2.002 m, and the next size up from 0.5 m that clears it is 2.25 m
  const big = buildCoverMap(sceneOf(slab(0, 2000, 0, 2000, 8)))!;
  assert.equal(big.cell, 2.25, 'the smallest cell, in quarter-metre steps, that keeps the map to a million cells');
  assert.ok(big.nx * big.nz <= COVER_MAX_CELLS && Math.ceil(2002 / 2) ** 2 > COVER_MAX_CELLS, 'and 2 m would not have fitted');
  assert.equal(buildCoverMap(sceneOf(slab(0, 400, 0, 400, 8)))!.cell, COVER_CELL, 'a map that fits keeps the half-metre cells');
});

test('heights are held to the nearest 15 cm up to 38 m, rounded and not floored; a higher roof counts as the highest', () => {
  const held = (y: number): number => coverHeightAt(buildCoverMap(sceneOf(slab(0, 10, 0, 10, y)))!, 5, 5);
  for (const [y, want] of [[10.14, 10.2], [10.1, 10.05], [10.04, 10.05], [6, 6], [0.2, 0.15], [37.9, 37.95]] as const) {
    assert.ok(Math.abs(held(y) - want) < 1e-9, `a roof at ${y} m is held as ${held(y)} m, not ${want} m`);
  }
  assert.ok(Math.abs(held(60) - 38.25) < 1e-9, `${held(60)}: a roof above 38 m counts as 38.25 m`);
});

/** A mesh of the triangles in `points` (x, y, z each, three to a triangle) with no index, named like a real roof. */
const triangles = (points: number[], name = 'canopy-glass'): THREE.Mesh => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
};

test('a roof of a single triangle is a roof, and so is a small one; a sloped roof is read at the middle of each cell', () => {
  const one = buildCoverMap(sceneOf(triangles([0, 6, 0, 0, 6, 10, 10, 6, 0])));
  assert.ok(one, 'a mesh of one triangle draws a map');
  assert.ok(Math.abs(coverHeightAt(one, 2, 2) - 6) < 0.1, `inside it: ${coverHeightAt(one, 2, 2)}`);
  assert.equal(coverHeightAt(one, 8, 8), 0, 'and not beyond its far edge');
  // 0.8 m by 0.8 m, right-angled: a third of a square metre, with just one cell centre inside it (at 0.25, 0.25)
  const small = buildCoverMap(sceneOf(triangles([0, 6, 0, 0, 6, 0.8, 0.8, 6, 0])));
  assert.ok(small, 'a roof less than a square metre draws a map');
  assert.ok(Math.abs(coverHeightAt(small, 0.25, 0.25) - 6) < 0.1, `a small roof still covers what is under it: ${coverHeightAt(small, 0.25, 0.25)}`);
  assert.equal(coverHeightAt(small, 0.75, 0.25), 0);

  // a roof that rises 0.5 m for every metre east: the height of a cell is the roof's at the cell's middle (so the quantised value of that, to the step)
  const sloped = buildCoverMap(sceneOf(roof([[0, 4, 0], [0, 4, 10], [10, 9, 10], [10, 9, 0]])))!;
  for (const x of [1, 3.3, 5, 7.7, 9.5]) {
    const middle = sloped.x0 + (Math.floor((x - sloped.x0) / sloped.cell) + 0.5) * sloped.cell;
    const want = Math.round((4 + 0.5 * middle) / COVER_STEP) * COVER_STEP;
    assert.ok(Math.abs(coverHeightAt(sloped, x, 5) - want) < 1e-9, `at x = ${x} (the cell's middle is ${middle}): ${coverHeightAt(sloped, x, 5)} against ${want}`);
  }
});

test('a point beyond the last cell of the map, on any side, is open sky: nothing is read from off the end of the bytes', () => {
  const flat = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 6)))!;
  const farX = flat.x0 + flat.nx * flat.cell, farZ = flat.z0 + flat.nz * flat.cell;
  const outside: [number, number][] = [[farX + 0.1, farZ - 0.1], [farX + 0.1, 6], [farX + 3, farZ - 0.1], [7, farZ + 0.1], [flat.x0 - 0.1, 6], [7, flat.z0 - 0.1], [flat.x0 - 0.1, farZ - 0.1]];
  for (const [x, z] of outside) {
    assert.equal(coverHeightAt(flat, x, z), 0, `the roof over ${x}, ${z}`);
    assert.equal(coverAt(flat, x, 2, z), 0, `the cover at ${x}, ${z}`);
  }
});

test('the shaders are given the step of the map they are given, and the default step when there is none', () => {
  const tiny: CoverMap = { x0: 0, z0: 0, cell: 1, nx: 2, nz: 2, step: 0.3, heights: new Uint8Array(4), soft: new Uint8Array(4), rooms: new Uint8Array(4) };
  try {
    applyCover(tiny);
    assert.equal(coverUniforms.uCoverScale.value, 0.3);
  } finally { applyCover(null); }
  assert.equal(coverUniforms.uCoverScale.value, COVER_STEP);
});

test('the shaders\' maps: the bytes the CPU reads are the bytes the GPU is given, one byte to a cell, the heights and the rooms looked up and the soft map blended, and none is the empty one', () => {
  applyCover(map);
  const t = coverUniforms.uCoverMap.value as THREE.DataTexture, soft = coverUniforms.uCoverSoft.value as THREE.DataTexture, rooms = coverUniforms.uCoverRooms.value as THREE.DataTexture;
  assert.ok(t !== soft && t !== rooms && soft !== rooms);
  // (each is one channel, a texture of its own: a two-channel heights texture, with the rooms in its green, cost the shed view a third of its frame rate on Apple's GPU)
  for (const [texture, bytes, filter, what] of [[t, map.heights, THREE.NearestFilter, 'the heights, looked up'], [soft, map.soft, THREE.LinearFilter, 'the soft map, blended'], [rooms, map.rooms, THREE.NearestFilter, 'the rooms, looked up']] as const) {
    assert.equal(texture.image.width, map.nx, what);
    assert.equal(texture.image.height, map.nz, what);
    assert.ok(texture.image.data === bytes, `${what}: the same bytes`); // (not assert.equal: a failure would print both maps, and its diff of 225,000 lines does not finish)
    assert.equal(texture.format, THREE.RedFormat, what);
    assert.equal(texture.type, THREE.UnsignedByteType, what);
    assert.equal(texture.minFilter, filter, what);
    assert.equal(texture.magFilter, filter, what);
    assert.equal(texture.generateMipmaps, false, what);
    assert.equal(texture.unpackAlignment, 1, `${what}: rows of bytes, not of four`);
    assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping, what);
    assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping, what);
  }
  assert.deepEqual(coverUniforms.uCoverRect.value.toArray(), [map.x0, map.z0, 1 / (map.nx * map.cell), 1 / (map.nz * map.cell)]);
  assert.equal(coverUniforms.uCoverScale.value, map.step);
  // a texel read the way the shader does it: uv = (p - lowest) / extent, texel = floor(uv * size), is the cell coverHeightAt reads
  const [rx, rz, sx, sz] = coverUniforms.uCoverRect.value.toArray() as [number, number, number, number];
  for (const [x, z] of [[canopy.centre[0], canopy.centre[1]], ...[10, 60, 140, 200].map((v) => shedToWorld(layout, layout.aisle + R + 3, v))] as [number, number][]) {
    const i = Math.floor((x - rx) * sx * map.nx), j = Math.floor((z - rz) * sz * map.nz);
    assert.equal((map.heights[j * map.nx + i] as number) * coverUniforms.uCoverScale.value, coverHeightAt(map, x, z), `the texel at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  let freed = 0;
  for (const texture of [t, soft, rooms]) texture.addEventListener('dispose', () => { freed++; });
  applyCover(null);
  assert.equal(freed, 3, 'a map that is replaced is freed, all its textures');
  assert.equal(coverUniforms.uCoverRect.value.z, 0, 'with no map the shaders see no roof');
  assert.equal(coverUniforms.uCoverScale.value, COVER_STEP);
  assert.equal((coverUniforms.uCoverMap.value as THREE.DataTexture).image.width, 1);
  assert.equal((coverUniforms.uCoverSoft.value as THREE.DataTexture).image.width, 1);
  assert.equal((coverUniforms.uCoverRooms.value as THREE.DataTexture).image.width, 1);
  const empty = [coverUniforms.uCoverMap.value, coverUniforms.uCoverSoft.value, coverUniforms.uCoverRooms.value];
  let kept = 0;
  for (const texture of empty) texture.addEventListener('dispose', () => { kept++; });
  applyCover(map);
  applyCover(null);
  assert.equal(kept, 0, 'the empty textures are shared, never freed');
  assert.deepEqual([coverUniforms.uCoverMap.value, coverUniforms.uCoverSoft.value, coverUniforms.uCoverRooms.value], empty, 'and they are what comes back');
});

test('the rooms: a cell is a room where the highest roof over it is one of the concourse dome\'s, and nowhere else; no cell at the map\'s edge is roofed or a room', () => {
  assert.deepEqual([...ROOM_ROOFS], ['concourse-glass', 'concourse-panels']);
  // the dome's panels and glass side by side, a taller slate roof over half of the panels and of the glass, a shed roof apart, and open ground between
  const m = buildCoverMap(sceneOf(slab(0, 10, 0, 10, 6, 'concourse-panels'), slab(10, 14, 0, 10, 6, 'concourse-glass'), slab(5, 20, 0, 10, 9, 'landmarks-slate'), slab(30, 40, 0, 10, 12, 'shed-roof-cladding'))) as CoverMap;
  const room = (x: number, z: number): number => m.rooms[Math.floor((z - m.z0) / m.cell) * m.nx + Math.floor((x - m.x0) / m.cell)] as number;
  const height = (x: number, z: number): number => m.heights[Math.floor((z - m.z0) / m.cell) * m.nx + Math.floor((x - m.x0) / m.cell)] as number;
  assert.equal(room(2, 5), 255, 'the panels, with nothing over them');
  assert.equal(room(7, 5), 0, 'the panels under the hotel\'s roof: the highest wins, and that is not a room');
  assert.equal(room(12, 5), 0, 'the glass under it too');
  assert.equal(room(16, 5), 0, 'the hotel\'s roof alone');
  assert.equal(room(35, 5), 0, 'the shed\'s roof');
  assert.equal(room(25, 5), 0, 'open ground');
  assert.ok(height(7, 5) > 0 && height(35, 5) > 0, 'those are roofed cells all the same');
  const glass = buildCoverMap(sceneOf(slab(0, 10, 0, 10, 6, 'concourse-glass'))) as CoverMap;
  assert.equal(glass.rooms[Math.floor((5 - glass.z0) / glass.cell) * glass.nx + Math.floor((5 - glass.x0) / glass.cell)], 255, 'the glass is a room roof too');
  assert.ok(m.rooms.every((r, i) => r === 0 || ((m.heights[i] as number) > 0 && r === 255)), 'a room cell is a roofed cell, and the flag is 0 or 255');
  for (const mm of [m, map]) {
    let edge = 0;
    for (let i = 0; i < mm.nx; i++) for (const j of [0, mm.nz - 1]) edge += (mm.heights[j * mm.nx + i] as number) + (mm.rooms[j * mm.nx + i] as number);
    for (let j = 0; j < mm.nz; j++) for (const i of [0, mm.nx - 1]) edge += (mm.heights[j * mm.nx + i] as number) + (mm.rooms[j * mm.nx + i] as number);
    assert.equal(edge, 0, 'the clear metre round the roofs: past the map\'s edge the flag is 0 whichever way the texture is clamped');
  }
});

test('the rooms in the real station: the concourse floor is a room, and so is the air 0.6 m west of the Western Range\'s face (where the fill looks for the wall); the platforms under the shed are not', () => {
  const room = (x: number, z: number): number => map.rooms[Math.floor((z - map.z0) / map.cell) * map.nx + Math.floor((x - map.x0) / map.cell)] as number;
  assert.equal(room(canopy.centre[0], canopy.centre[1]), 255, 'the middle of the concourse');
  for (const v of [20, 50, 80, 110, 135]) {
    const [x, z] = shedToWorld(layout, -12 - 0.6, v); // the Range's concourse face is at u = -12 (cover.ts ROOM_ROOFS, lighting.ts INTERIOR)
    assert.equal(room(x, z), 255, `0.6 m in front of the Range's face at v ${v}`);
  }
  for (const v of [20, 100]) { const [x, z] = shedToWorld(layout, layout.aisle + R, v); assert.equal(room(x, z), 0, `a platform under the shed at v ${v}`); }
  assert.ok(map.rooms.reduce((n, r) => n + (r ? 1 : 0), 0) > 10000, 'and the dome is a good few cells');
});

test('the soft map is the roofed cells blurred by the documented kernel, row by row and column by column, to a byte', () => {
  assert.deepEqual(COVER_BLUR, [1, 4, 6, 4, 1]);
  // a roof 10 m by 6 m, its edge on a cell boundary, in the middle of a cell row: the profile across the edge is the kernel's running sum
  const flat = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 6)))!;
  const row = Math.floor((6 - flat.z0) / flat.cell), cellAt = (x: number): number => Math.floor((x - flat.x0) / flat.cell);
  const profile = [1.25, 1.75, 2.25, 2.75, 3.25, 7.25].map((x) => flat.soft[row * flat.nx + cellAt(x)]);
  assert.deepEqual(profile, [16, 80, 175, 239, 255, 255], 'across the west edge, from two cells out: 1, 5, 11, 15 and 16 sixteenths of 255');
  assert.equal((profile[1] as number) + (profile[2] as number), 255, 'a cell out and a cell in from the edge make the whole');
  assert.equal((profile[0] as number) + (profile[3] as number), 255, 'and so do two out and two in');
  assert.deepEqual([11.75, 12.25].map((x) => flat.soft[row * flat.nx + cellAt(x)]), [175, 80], 'the east edge is the west one reversed');
  const column = [2.25, 2.75, 3.25, 3.75, 4.25, 6.25, 8.25, 8.75, 9.25, 9.75].map((z) => flat.soft[Math.floor((z - flat.z0) / flat.cell) * flat.nx + cellAt(7)]);
  assert.deepEqual(column, [16, 80, 175, 239, 255, 255, 239, 175, 80, 16], 'and down the columns, both ends');
  // any roof counts, however low (a shelter, a bench canopy): the blur is of where there is a roof, not of how high it is
  const low = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 1.5)))!;
  assert.ok(low.heights.some((h) => h > 0) && low.heights.every((h, k) => h > 0 === ((flat.heights[k] as number) > 0)), 'the low roof covers the same cells');
  assert.ok(Buffer.compare(low.soft, flat.soft) === 0, 'and its soft map is the same one');
  // and everywhere, on the real station: the same sum done the long way (a 5 x 5 window), so the passes agree with the kernel
  const w = COVER_BLUR, total = w.reduce((a, b) => a + b, 0);
  let wrong = '';
  for (let j = 0; j < map.nz && !wrong; j++) {
    for (let i = 0; i < map.nx; i++) {
      let sum = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (i + di >= 0 && i + di < map.nx && j + dj >= 0 && j + dj < map.nz && map.heights[(j + dj) * map.nx + i + di]) sum += (w[di + 2] as number) * (w[dj + 2] as number);
      if (map.soft[j * map.nx + i] !== Math.round((sum * 255) / (total * total))) { wrong = `cell ${i}, ${j}: ${map.soft[j * map.nx + i]} against ${Math.round((sum * 255) / (total * total))}`; break; }
    }
  }
  assert.equal(wrong, '', 'every cell of the real station');
  for (let k = 0; k < map.heights.length; k += 97) {
    if (map.heights[k]) assert.ok((map.soft[k] as number) > 0, 'a roofed cell is never wholly dry of roof');
  }
});

test('the ground\'s cover is the soft map: whole under a roof, none in the open or on top of one, and a soft line between that never goes back', () => {
  const flat = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 6)))!;
  assert.equal(groundCoverAt(null, 7, 1, 6), 0, 'with no map there is no roof');
  assert.equal(groundCoverAt(flat, 7, 1, 6), 1, 'under the middle of it');
  assert.equal(groundCoverAt(flat, 7, 5.3, 6), 1, 'a surface 0.6 m or more below the roof is wholly under it');
  const part = groundCoverAt(flat, 7, 5.7, 6);
  assert.ok(part > 0.05 && part < 0.95, `and one nearer the roof is part way out: ${part}`);
  assert.equal(groundCoverAt(flat, 7, 6.5, 6), 0, 'and on top of it, in the rain');
  assert.equal(groundCoverAt(flat, -50, 1, 6), 0, 'far outside the map');
  assert.equal(groundCoverAt(flat, 14, 1, 6), 0, 'well out in the open');
  let last = 1;
  for (let x = 3.5; x >= -0.5; x -= 0.02) { // walking out from under the roof, over the edge at x = 2
    const c = groundCoverAt(flat, x, 1, 6);
    assert.ok(c <= last + 1e-12, `it only ever dries less on the way out: ${c} after ${last} at x = ${x.toFixed(2)}`);
    last = c;
  }
  assert.equal(last, 0, 'to nothing');
  assert.ok(Math.abs(groundCoverAt(flat, 2, 1, 6) - 0.5) < 0.02, `half wet at the edge itself: ${groundCoverAt(flat, 2, 1, 6)}`);
  assert.ok(Math.abs(groundOpenShare(flat, 2, 1, 6) - 0.5) < 0.02);
  assert.equal(groundOpenShare(flat, 7, 1, 6), 0);
  assert.equal(groundOpenShare(flat, 14, 1, 6), 1);
});

test('the soft map is read as the GPU reads it: a cell\'s own value at its centre, the mean half way between two, the corners held to the edge, nothing outside', () => {
  const flat = buildCoverMap(sceneOf(slab(2, 12, 3, 9, 6)))!;
  const centre = (i: number, j: number): [number, number] => [flat.x0 + (i + 0.5) * flat.cell, flat.z0 + (j + 0.5) * flat.cell];
  const j = Math.floor((6 - flat.z0) / flat.cell), i = Math.floor((2.25 - flat.x0) / flat.cell);
  assert.ok(Math.abs(coverSoftAt(flat, ...centre(i, j)) - 175 / 255) < 1e-12, 'at a cell\'s centre it is the cell');
  const [x0, z] = centre(i, j), [x1] = centre(i + 1, j);
  assert.ok(Math.abs(coverSoftAt(flat, (x0 + x1) / 2, z) - (175 + 239) / 2 / 255) < 1e-12, 'half way between two cells it is their mean');
  assert.ok(Math.abs(coverSoftAt(flat, x0 + 0.25 * (x1 - x0), z) - (0.75 * 175 + 0.25 * 239) / 255) < 1e-12, 'and a quarter of the way, a quarter of the way');
  const full = { ...flat, soft: new Uint8Array(flat.nx * flat.nz).fill(200) }; // a map that is all soft, to see the corners held to the edge
  const far = flat.x0 + flat.nx * flat.cell, deep = flat.z0 + flat.nz * flat.cell;
  for (const [x, y] of [[flat.x0 + 0.05, flat.z0 + 0.05], [far - 0.05, flat.z0 + 0.05], [flat.x0 + 0.05, deep - 0.05], [far - 0.05, deep - 0.05]] as const) {
    assert.equal(coverSoftAt(full, x, y), 200 / 255, `between the map's edge and the first centre the first cell holds: ${x.toFixed(2)}, ${y.toFixed(2)}`);
  }
  assert.equal(coverSoftAt(full, flat.x0 - 0.1, 5), 0, 'outside the map');
  assert.equal(coverSoftAt(full, far + 0.1, 5), 0);
  assert.equal(coverSoftAt(full, 5, flat.z0 - 0.1), 0);
  assert.equal(coverSoftAt(full, 5, deep + 0.1), 0);
  assert.equal(coverSoftAt(null, 0, 0), 0);
});

test('the GLSL declares exactly the uniforms the page supplies, once each', () => {
  const declared = [...COVER_GLSL.matchAll(/^uniform\s+\w+\s+(\w+);/gm)].map((m) => m[1]).sort();
  assert.deepEqual(declared, Object.keys(coverUniforms).sort());
  assert.equal(COVER_GLSL.split('float coverAt(').length - 1, 1);
  assert.equal(COVER_GLSL.split('float coverGroundAt(').length - 1, 1);
  const fade = `smoothstep(roof - ${COVER_DEEP.toFixed(2)}, roof - ${COVER_SHALLOW.toFixed(2)}, p.y)`;
  assert.equal(COVER_GLSL.split(fade).length - 1, 2, 'the drops and the ground fade over the same stretch as the CPU read');
});

test('the map is quick to draw and small to hold, with every roof of the station and the landmarks in it', () => {
  const everything = new THREE.Scene();
  everything.add(...scene.children.map((c) => c.clone()));
  addLandmarks(everything, data, {});
  const started = performance.now();
  const all = buildCoverMap(everything)!;
  const ms = performance.now() - started;
  assert.ok(ms < 500, `${ms.toFixed(0)} ms to draw it`);
  assert.ok(all.heights.length <= COVER_MAX_CELLS, `${all.heights.length} bytes`);
  assert.ok(all.nx > map.nx, 'the landmarks reach further than the station');
  const barlow = findRoofs(everything).filter((m) => m.name === 'landmarks-roofGlass');
  assert.ok(barlow.length === 1);
  const box = new THREE.Box3().setFromObject(barlow[0]!);
  const centre = box.getCenter(new THREE.Vector3());
  assert.ok(coverHeightAt(all, centre.x, centre.z) > 5, `the Barlow shed is covered: ${coverHeightAt(all, centre.x, centre.z)}`);
});

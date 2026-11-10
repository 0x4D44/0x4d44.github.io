import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { PERTH_TERRAIN_EXTENT } from '../../tools/build-perth-terrain.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { PERTH_CITY_EXTENT, PERTH_CITY_LIDAR_SOURCE, PERTH_LIDAR_HEIGHTS, PERTH_LIDAR_LANDMARKS, perthCityHeight } from '../src/perth-city-heights.ts';
import { inPerthFrontageGroundMask, perthFrontageGroundMask } from '../src/perth-frontage-mask.ts';
import { stationOutline } from '../src/perth-station.ts';
import { KINNOULL_TOWER, KIRK_TOWER, TOWER_LOOK, kinnoullTower, SHORE, VIADUCT_FORM, VIADUCT_LOOK, PIER_FORM, waterLevel, PERTH_DRAPE, PERTH_LANDUSE, PERTH_LANDUSE_BRIDGES, TAY_VIADUCT, WATER, tayViaduct } from '../src/perth-city-features.ts';
import { PERTH_CITY_ASHLAR, PERTH_CITY_STONE, perthBuildingHeight } from '../src/perth-city.ts';
import { WAVERLEY_CITY_ASHLAR, WAVERLEY_CITY_STONE } from '../src/waverley-city.ts';
import { CLIFF_EYE, CRAG, KINNOULL_EYE, KINNOULL_PEAK, SIGHT, WOODLAND, kinnoullCrag, onCliff, sightHeight } from '../src/perth-woodland.ts';
import { CANOPY, ISLAND_CANOPY, isIslandBelt, islandBeltTrees, kinnoullCanopy } from '../src/perth-canopy.ts';
/** The small islands' tree belts, and whether (x, z) is over one (its box, plus a 6 m lattice step and a little). */
const islandBelts = () => PERTH_LANDUSE.areas.wood.filter(rs => isIslandBelt(rs, PERTH_LANDUSE.areas.water));
const inIslandBelt = (x: number, z: number) => islandBelts().some(rs => { let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity; for (const [px, pz] of rs[0]!) { ax = Math.min(ax, px); az = Math.min(az, pz); bx = Math.max(bx, px); bz = Math.max(bz, pz); } const m = ISLAND_CANOPY.step + 2; return x >= ax - m && x <= bx + m && z >= az - m && z <= bz + m; });
import { SUMMIT, SUMMIT_CENTRE, inSummitHole, summitBushes } from '../src/perth-summit.ts';
import { EAST_SKIRT, PERTH_EAST, PERTH_EAST_FILE, eastWater } from '../src/perth-east-ground.ts';
import { GROUND_COLOUR, GROUND_Y } from '../src/world.ts';
import { Batch } from '../src/materials.ts';
import { GROUND_COLOURS } from '../src/waverley-city-ground.ts';
import { GARDENS, PERTH_RESIDENTIAL, perthGardens, segDist, streetsNear } from '../src/perth-gardens.ts';
import type { GardenRect } from '../src/waverley-city-ground.ts';
import { clearAir, fogFar } from "../src/atmosphere.ts";
import type { Haze } from "../src/atmosphere.ts";
import { PERTH_CLEAR_AIR, PERTH_HAZE, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { CLEAR_FOG, fogRange } from '../../core/daylight.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());
const pip = (x: number, z: number, p: readonly (readonly [number, number])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };

test('city heights: LiDAR (Phase I DSM less DTM, OGL credited) replaces the ASSUMED fallback wherever it is usable', () => {
  assert.deepEqual(PERTH_CITY_EXTENT, PERTH_TERRAIN_EXTENT, 'the heights rule uses the terrain extent');
  assert.ok(PERTH_CITY_LIDAR_SOURCE.dsm.every(u => u.includes('/lidar/phase-1/dsm/')));
  assert.match(PERTH_CITY_LIDAR_SOURCE.attribution, /Scottish public sector LiDAR.*Open Government Licence v3/);
  const { OSM, LiDAR, ASSUMED } = scene.heightBasis;
  assert.equal(OSM + LiDAR + ASSUMED, scene.buildingIds.length);
  assert.ok(ASSUMED < 3856 / 8, `far fewer ASSUMED than the 3,856 of phase 1: ${ASSUMED}`);
  assert.ok(LiDAR > 4000, `LiDAR heights: ${LiDAR}`);
  // a block with a LiDAR height and no OSM height is drawn at it; an OSM height still wins
  const b = data.buildings.find(q => PERTH_LIDAR_HEIGHTS.has(q.id) && q.heightBasis.startsWith('ASSUMED 12m') && q.minHeight === 0 && q.outer.length > 4)!;
  const h = perthCityHeight(b, perthBuildingHeight);
  assert.equal(h.basis, 'LiDAR'); assert.ok(Math.abs(h.height - PERTH_LIDAR_HEIGHTS.get(b.id)!.height) < .11 || h.height < PERTH_LIDAR_HEIGHTS.get(b.id)!.height);
  assert.equal(perthCityHeight({ ...b, heightBasis: 'OSM height; ASSUMED minHeight 0m', height: 21 }, perthBuildingHeight).basis, 'OSM');
});

test('the Tay is OSM water drawn over the DTM\'s filled river, never under it', () => {
  assert.ok(PERTH_LANDUSE.areas.water.length >= 2, 'the river polygons');
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh;
  assert.ok(water, 'the water sheet');
  // down through the river at every wet lattice node (16 m): where the node is the filled river (its ground at the river's level) the
  // sheet is over the drape; where the 16 m terrain climbs the bank inside the OSM outline, the drape covers it as a shore
  const level = waterLevel(scene.terrain);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let below = 0, n = 0, river = 0;
  for (const [o] of PERTH_LANDUSE.areas.water) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of o!) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let x = Math.ceil(x0 / 16) * 16; x <= x1; x += 16) for (let z = Math.ceil(z0 / 16) * 16; z <= z1; z += 16) {
      if (x <= PERTH_CITY_EXTENT.x0 || x >= PERTH_CITY_EXTENT.x1 || z <= PERTH_CITY_EXTENT.z0 || z >= PERTH_CITY_EXTENT.z1) continue;
      ray.set(new THREE.Vector3(x, 500, z), down); const hit = ray.intersectObject(water)[0]; if (!hit) continue; n++;
      const y = scene.terrain.heightAt(x, z); if (y > level(x, z) + .25) continue; river++;
      if (hit.point.y < y + PERTH_DRAPE + .05) below++;
    }
  }
  assert.ok(n > 300, `points on the water: ${n}`);
  assert.ok(river > .6 * n, `the filled river is most of the water: ${river} of ${n}`);
  assert.equal(below, 0, `water under the land-use drape on the filled river: ${below} of ${river}`);
  // the Bridgend viewpoint (OSM node/737405988, on the east bank) stands above the water, not under a sheet lifted to the bank
  assert.ok(level(938, -326) + PERTH_DRAPE + WATER.lift < scene.terrain.heightAt(938, -326), `the river below Bridgend: ${level(938, -326)}`);
  assert.ok(level(922, -43) < -4, `the sheet at the viaduct lies at the river, not the bank: ${level(922, -43)}`);
  // mid-river under the viaduct is water
  assert.ok(PERTH_LANDUSE.areas.water.some(([o]) => pip(922, -43, o!)), 'the Tay under the viaduct');
});

test('no road bridge overlaps the viaduct: the railway\'s own bridge outline is not drawn as a road bridge', () => {
  const line = PERTH_LANDUSE_BRIDGES.length ? (JSON.parse(readFileSync(new URL('../src/data/perth-city-landuse.json', import.meta.url), 'utf8')).bridges.viaduct.line as [number, number][]) : [];
  assert.ok(PERTH_LANDUSE_BRIDGES.some(b => b.name === 'Perth Bridge') && PERTH_LANDUSE_BRIDGES.some(b => b.name === "Queen's Bridge"), 'the two road bridges');
  for (const b of PERTH_LANDUSE_BRIDGES) {
    // every metre of the viaduct's path, outside every road bridge's outline
    let inside = 0;
    for (let i = 1; i < line.length; i++) { const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < n; k++) if (pip(ax + (bx - ax) * k / n, az + (bz - az) * k / n, b.outline)) inside++; }
    assert.equal(inside, 0, `${b.id} ${b.name} overlaps the viaduct line at ${inside} points`);
  }
});

test('the Tay Viaduct: seven girder spans, ten arches on Moncreiffe Island, six spans east, along OSM way/4438951', () => {
  const layout = tayViaduct(new Batch({ colored: true }), new Batch(), scene.terrain);
  assert.ok(Math.abs(layout.length - 443) < 3, `mapped length: ${layout.length}`);
  assert.equal(layout.piers.length, TAY_VIADUCT.westSpans + 1 + TAY_VIADUCT.eastSpans + 1);
  assert.ok(layout.island[1] - layout.island[0] > 60, `the island crossing: ${layout.island}`);
  const block = layout.arches[1] - layout.arches[0];
  assert.ok(Math.abs(block - (TAY_VIADUCT.arches * (TAY_VIADUCT.archClear + TAY_VIADUCT.archPier) + TAY_VIADUCT.archPier)) < 1e-6);
  assert.ok(layout.arches[0] > 0 && layout.arches[1] < layout.length, 'the arch block lies inside the bridge');
  for (const name of ['perth-viaduct-iron', 'perth-city-masonry', 'perth-bridge-roads']) assert.ok(scene.group.getObjectByName(name), name);
  assert.deepEqual(PERTH_LANDUSE_BRIDGES.map(b => b.name).filter(Boolean).sort(), ['Perth Bridge', "Queen's Bridge"]);
});

test('the viaduct\'s girder piers are twin columns under a cap, its girders pale grey and its railing white, as photographed (round 2, C4)', () => {
  const masonry = new Batch({ colored: true }), iron = new Batch({ colored: true });
  const layout = tayViaduct(masonry, iron, scene.terrain), mesh = new THREE.Mesh(masonry.build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(), F = VIADUCT_FORM, L = VIADUCT_LOOK;
  let gaps = 0, columns = 0, caps = 0;
  layout.pierPlan.forEach(({ p, t }, k) => {
    const n = [-t[1], t[0]], y = F.girder[0] - L.cap - 1.5;
    if (y < scene.terrain.heightAt(p[0], p[1]) + .5) return; // a pier standing too low to see between its columns
    if (layout.arches.some(a => Math.abs(a - layout.piers[k]!) < 3)) return; // the arch block's end piers carry its masonry beside them
    // along the track through the pier's centreline: joined between the two columns into one mass (round 4, lead's ruling on the round-3
    // score: 2166751's pair reads as one dumbbell mass; round 2 asserted the opposite, an open trestle)
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, y, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); ray.far = 10;
    if (ray.intersectObject(mesh).length > 0) gaps++;
    // under each girder: a column
    for (const side of [-1, 1]) { ray.set(new THREE.Vector3(p[0] + n[0] * side * F.girderOffset - t[0] * 5, y, p[1] + n[1] * side * F.girderOffset - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) columns++; }
    // the cap spans across, over the gap
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, F.girder[0] - L.cap / 2, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) caps++;  });
  assert.ok(gaps >= 8, `piers joined between their columns: ${gaps}`);
  assert.equal(columns, 2 * gaps, 'two columns at each open pier');
  assert.equal(caps, gaps, 'a cap over each');
  const lum = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const ig = iron.build(), col = ig.getAttribute('color');
  let dark = 0; for (let i = 0; i < col.count; i++) if (lum([col.getX(i), col.getY(i), col.getZ(i)]) < .5) dark++;
  assert.equal(dark, 0, 'no dark ironwork: girders pale grey, railing white');
  assert.ok(lum(L.railing) > lum(L.girder), 'the railing is whiter than the girders');
  // round 3 (2166751): tall round columns, about 3:1 over the water where the deck's height allows it
  for (const c of layout.columns) assert.ok(c.diameter <= PIER_FORM.diameter[1] + 1e-9 && (c.visible / c.diameter >= PIER_FORM.aspect - 1e-6 || c.diameter === PIER_FORM.diameter[0]), `column ${c.diameter.toFixed(2)} m wide, ${c.visible.toFixed(2)} m over the water`);
  // in the river (where the deck stands high enough over the water for a 3:1 column of the least diameter), every column is about 3:1
  const wet = layout.columns.filter(c => c.visible >= PIER_FORM.aspect * PIER_FORM.diameter[0]);
  assert.ok(wet.length >= 8 && wet.every(c => Math.abs(c.visible / c.diameter - PIER_FORM.aspect) < .05), `river columns: ${wet.map(c => (c.visible / c.diameter).toFixed(2))}`);
  const mp = mesh.geometry.getAttribute('position');
  for (const c of layout.columns.slice(0, 3)) {
    // round: the column's ring corners all lie at one radius about its axis
    const n = [-layout.pierPlan.find(q => q.p === c.p)!.t[1], layout.pierPlan.find(q => q.p === c.p)!.t[0]], ax = c.p[0] + n[0]! * F.girderOffset, az = c.p[1] + n[1]! * F.girderOffset;
    const radii = new Set<string>(); for (let i = 0; i < mp.count; i++) { const r = Math.hypot(mp.getX(i) - ax, mp.getZ(i) - az); if (r < c.diameter) radii.add(r.toFixed(2)); }
    assert.ok([...radii].some(r => Math.abs(Number(r) - c.diameter / 2) < .01), `a ring at radius ${(c.diameter / 2).toFixed(2)}`);
  }
  // no gap over the cap: a cross girder between the plate girders, from the cap up towards the deck; and stiffeners on the girders
  const ip = ig.getAttribute('position'); let cross = 0, stiff = 0;
  for (const { p } of layout.pierPlan) for (let i = 0; i < ip.count; i++) if (Math.hypot(ip.getX(i) - p[0], ip.getZ(i) - p[1]) < F.girderOffset && Math.abs(ip.getY(i) - PIER_FORM.crossTop) < 1e-3) { cross++; break; }
  for (let i = 0; i < ip.count; i++) if (Math.abs(ip.getY(i) - F.girder[1]) < 1e-3) stiff++;
  assert.equal(cross, layout.pierPlan.length, 'a cross girder over every girder pier');
  assert.ok(lum(L.girder) > .75 && PIER_FORM.stiffenerShade < .8, 'a pale girder band with stiffeners that read');
  const ironMesh = scene.group.getObjectByName('perth-viaduct-iron') as THREE.Mesh, ironMat = ironMesh.material as THREE.MeshLambertMaterial;
  assert.ok(ironMat.name === 'perth-viaduct-paint' && !ironMat.map && ironMat.vertexColors, 'the ironwork in its own plain painted material, no darkening map');
  assert.ok(stiff / 8 > 2 * (layout.length * .6) / PIER_FORM.stiffener, `stiffener tops: ${stiff / 8}`);
});

test('Kinnoull Hill\'s woods, the Inches and the kirk come from OSM, the DSM and HES, not by eye', () => {
  const near = (rs: readonly (readonly (readonly [number, number])[])[][], x: number, z: number) => rs.some(([o]) => pip(x, z, o!));
  const woodsOnKinnoull = PERTH_LANDUSE.areas.wood.filter(([o]) => o!.some(([x]) => x > 1700)).length;
  assert.ok(woodsOnKinnoull >= 3, `wood polygons on Kinnoull Hill: ${woodsOnKinnoull}`);
  // North Inch (way/24240615) and South Inch (way/24240849) are OSM parks; the river is not painted park
  const parks = [...PERTH_LANDUSE.areas.park, ...PERTH_LANDUSE.areas.grass];
  assert.ok(near(parks, 300, -1000) || near(parks, 400, -900), 'the North Inch');
  assert.ok(near(parks, 300, 500), 'the South Inch');
  const spire = scene.group.getObjectByName('perth-kirk-spire') as THREE.Mesh;
  spire.geometry.computeBoundingBox();
  const kirk = data.buildings.find(b => b.id === PERTH_LIDAR_LANDMARKS.kirk.id)!;
  const base = scene.terrain.rangeUnder(kirk.outer, 4).min;
  assert.ok(Math.abs(spire.geometry.boundingBox!.max.y - (base + KIRK_TOWER.top)) < 1e-3, 'the spire top at 155 ft (HES LB39300)');
  assert.ok(pip(PERTH_LIDAR_LANDMARKS.kirk.x, PERTH_LIDAR_LANDMARKS.kirk.z, kirk.outer), 'the tower stands on the kirk');
});

test('the land-use drape leaves holes where P2 draws its own ground: the King\'s Place cut and the forecourt (lead ruling 13:18)', () => {
  const cover = scene.group.getObjectByName('waverley-ground-cover') as THREE.Mesh;
  const mask = perthFrontageGroundMask(stationOutline(data)?.outer), inMask = (x: number, z: number) => inPerthFrontageGroundMask(mask, x, z);
  const pos = cover.geometry.getAttribute('position'), index = cover.geometry.getIndex()!;
  let over = 0;
  for (let i = 0; i < index.count; i += 3) {
    const v = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const cx = v.reduce((a, k) => a + pos.getX(k), 0) / 3, cz = v.reduce((a, k) => a + pos.getZ(k), 0) / 3;
    if (inMask(cx, cz) || v.some(k => inMask(pos.getX(k), pos.getZ(k)))) over++;
  }
  assert.equal(over, 0, `drape triangles over P2's ground: ${over}`);
  // the two places the lead found covered: the forecourt and the 0.5 m road cut
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const [x, z] of [[-5, -50], [90, -50]] as const) { assert.ok(inMask(x, z), `(${x}, ${z}) is in the mask`); ray.set(new THREE.Vector3(x, 200, z), down); assert.equal(ray.intersectObject(cover).length, 0, `no drape over (${x}, ${z})`); }
  assert.ok(index.count / 3 > 10_000, 'the drape is still there elsewhere');
});

test('Kinnoull\'s woods are one continuous, mixed canopy, open westward from the summit, with gorse at the clearing (round 3, C1/C2)', () => {
  const [px, pz] = KINNOULL_PEAK;
  // the canopy: one draped mesh over the hill's OSM woods, in place of separate crowns (4307, 4599836: a closed canopy)
  const mesh = scene.group.getObjectByName('perth-kinnoull-canopy') as THREE.Mesh;
  assert.ok(mesh, 'the canopy mesh');
  let cityGroup = false; mesh.traverseAncestors(a => { if (a === scene.parts.buildings) cityGroup = true; }); assert.ok(cityGroup, 'in the city group');
  const P = mesh.geometry.getAttribute('position'), C = mesh.geometry.getAttribute('color');
  const top: { x: number; z: number; h: number; y: number; g: number }[] = [];
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), h = P.getY(i) - scene.terrain.heightAt(x, z); if (h > 0) top.push({ x, z, h, y: P.getY(i), g: C.getY(i) }); }
  assert.ok(top.length > 3000, `canopy nodes over the woods: ${top.length}`);
  // the crown texture is laid in plan metres
  const UV = mesh.geometry.getAttribute('uv'); for (let i = 0; i < P.count; i += 101) assert.ok(Math.abs(UV.getX(i) - P.getX(i)) < 1e-3 && Math.abs(UV.getY(i) - P.getZ(i)) < 1e-3, 'crown UVs in metres');
  // continuous: nearly every point of the hill's woods (away from the clearing, the cliff and the sightline) is under it
  const canopy = kinnoullCanopy(scene.terrain, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.cliffs, PERTH_LANDUSE.areas.water);
  const pipw = (x: number, z: number, rs: readonly (readonly (readonly number[])[])[]) => { const p = rs[0]!; let yes = false; for (let a = 0, b = p.length - 1; a < p.length; b = a++) if ((p[a]![1]! > z) !== (p[b]![1]! > z) && x < (p[b]![0]! - p[a]![0]!) * (z - p[a]![1]!) / (p[b]![1]! - p[a]![1]!) + p[a]![0]!) yes = !yes; return yes; };
  const hillWoods = PERTH_LANDUSE.areas.wood.filter(rs => rs[0]!.some(([x]) => x! > 1700));
  let inWood = 0, covered = 0;
  for (let x = 1700; x < 3000; x += 23) for (let z = -800; z < 900; z += 23) {
    if (!hillWoods.some(rs => pipw(x, z, rs)) || Math.hypot(x - px, z - pz) < WOODLAND.gorse.inner + 10 || onCliff(scene.terrain, PERTH_LANDUSE.cliffs, x, z) || (sightHeight(scene.terrain, x, z) ?? Infinity) - WOODLAND.sight.clear - scene.terrain.heightAt(x, z) < CANOPY.min + 1) continue;
    inWood++; if (canopy.inCanopy(x, z)) covered++;
  }
  assert.ok(inWood > 500 && covered / inWood > .95, `covered ${covered} of ${inWood} wood points`);
  // mixed size: stands of old and young trees (the crown height's 90th percentile over its 10th)
  const hs = top.map(t => t.h).sort((a, b) => a - b), q10 = hs[Math.floor(hs.length * .1)]!, q90 = hs[Math.floor(hs.length * .9)]!;
  assert.ok(q90 / q10 > 1.5, `canopy height spread: ${(q90 / q10).toFixed(2)}`);
  // mixed tone: pine and birch both present
  const greens = top.map(t => t.g).sort((a, b) => a - b);
  assert.ok(greens[Math.floor(greens.length * .9)]! > 1.35 * greens[Math.floor(greens.length * .1)]!, 'pine and birch tones both present');
  // open westward: no canopy node in the panorama's frame rises above the line from the eye to the town
  const over = top.filter(t => { const s = sightHeight(scene.terrain, t.x, t.z, inIslandBelt(t.x, t.z) ? SIGHT.island : SIGHT.shadow); return s !== undefined && t.y > s - WOODLAND.sight.clear + 1e-3; });
  assert.equal(over.length, 0, `canopy over the summit's westward sightline: ${over.length}`);
  // the summit clearing and the cliff stay open
  assert.equal(top.filter(t => Math.hypot(t.x - px, t.z - pz) < WOODLAND.gorse.inner - CANOPY.step).length, 0, 'the summit clearing is open');
  assert.equal(top.filter(t => onCliff(scene.terrain, PERTH_LANDUSE.cliffs, t.x, t.z)).length, 0, 'no canopy on the cliff');
  // the crowns still placed: none under the canopy, none over the sightline or on the cliff; gorse at the clearing's edge (152)
  const wood = scene.group.getObjectByName('waverley-wood-crowns') as THREE.InstancedMesh;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3();
  const hill: { x: number; z: number; top: number; h: number }[] = [];
  for (let i = 0; i < wood.count; i++) { wood.getMatrixAt(i, m); m.decompose(p, q, k); if (Math.hypot(p.x - px, p.z - pz) <= 900) hill.push({ x: p.x, z: p.z, top: p.y + k.y, h: k.y }); }
  const trees = hill.filter(t => t.h > 1.5), gorse = hill.filter(t => t.h <= 1.5);
  assert.equal(trees.filter(t => canopy.inCanopy(t.x, t.z)).length, 0, 'no separate crowns under the canopy');
  assert.equal(trees.filter(t => { const s = sightHeight(scene.terrain, t.x, t.z); return s !== undefined && t.top > s - WOODLAND.sight.clear + 1e-3; }).length, 0, 'no crown over the sightline');
  const edge = gorse.filter(t => { const d = Math.hypot(t.x - px, t.z - pz); return d >= WOODLAND.gorse.inner - 10 && d <= WOODLAND.gorse.outer + 10; });
  assert.ok(edge.length > 30, `gorse at the summit clearing's edge: ${edge.length}`);
  assert.equal(hill.filter(t => onCliff(scene.terrain, PERTH_LANDUSE.cliffs, t.x, t.z)).length, 0, 'no crowns on the cliff');
  let face = 0; for (let x = 2400; x < 2620; x += 8) for (let z = 260; z < 380; z += 8) if (onCliff(scene.terrain, PERTH_LANDUSE.cliffs, x, z)) face++;
  assert.ok(face > 40, `the cliff below the tower is steep ground by the OSM line: ${face} points`);
  // it frees triangles: the canopy and the remaining crowns cost less than round 2's crowns alone (51,580)
  const tri = (o: THREE.Mesh) => (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
  const crowns = (wood.geometry.index ? wood.geometry.index.count : wood.geometry.getAttribute('position').count) / 3 * wood.count;
  assert.ok(tri(mesh) + crowns < 51_580, `canopy ${tri(mesh)} + crowns ${crowns}`);
  // every Perth wood is canopy, not massed crowns: the town's and riverside woods too (the 9e565a39 Bridgend view had two 8 to 10 m
  // faceted crowns on the island 35 m from its eye)
  let townWood = 0, townCovered = 0;
  for (let x = -1200; x < 1700; x += 17) for (let z = -1200; z < 900; z += 17) if (PERTH_LANDUSE.areas.wood.some(rs => pipw(x, z, rs)) && (sightHeight(scene.terrain, x, z) ?? Infinity) - WOODLAND.sight.clear - scene.terrain.heightAt(x, z) >= CANOPY.min + 1) { townWood++; if (canopy.inCanopy(x, z)) townCovered++; }
  assert.ok(townWood > 200 && townCovered / townWood > .95, `town woods (where the summit's view allows a canopy) covered ${townCovered} of ${townWood}`);
  // the Bridgend island's wood is single round trees with light between (46028), not canopy and not the shared fill's faceted balls
  const belts = islandBeltTrees(scene.terrain, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.areas.water);
  for (const [x, z] of [[920.4, -278.1], [919.6, -291.8]] as const) assert.ok(belts.inBelt(x, z) && !canopy.inCanopy(x, z), `the island wood at ${x}, ${z} is a belt of single trees`);
  const near = belts.trees.filter(t => Math.hypot(t.x - 916, t.z - 310) < 1e9 && t.x > 880 && t.x < 950 && t.z > -370 && t.z < -250);
  assert.ok(near.length >= 8 && near.filter(t => t.height >= 8).length >= .8 * near.length, `Bridgend island trees: ${near.map(t => t.height.toFixed(1))}`);
  const isl = scene.group.getObjectByName('perth-island-trees') as THREE.InstancedMesh;
  assert.ok(isl && isl.count === belts.trees.length, 'the island trees are drawn, one crown each');
  // light between: from the Bridgend eye, rays toward the town over the belt clear its crowns in places
  const bcam = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8'))['pt-tay-from-bridgend'] as { pos: [number, number, number] };
  const beye = new THREE.Vector3(...bcam.pos), br = new THREE.Raycaster(); scene.group.updateMatrixWorld(true);
  let through = 0, rays = 0;
  for (let z = -340; z <= -265; z += 3) for (const y of [-3, -1, 1]) { rays++; br.set(beye, new THREE.Vector3(900, y, z).sub(beye).normalize()); br.far = 80; if (!br.intersectObject(isl, false).length) through++; }
  assert.ok(through > .25 * rays && through < .9 * rays, `rays through the belt: ${through} of ${rays}`);
  let crownsInWood = 0;
  for (let i = 0; i < wood.count; i++) { wood.getMatrixAt(i, m); m.decompose(p, q, k); if (k.y > 1.5 && canopy.inCanopy(p.x, p.z)) crownsInWood++; }
  assert.equal(crownsInWood, 0, `massed crowns left under the canopy anywhere: ${crownsInWood}`);
});

test('Kinnoull\'s cliff is pale rock in blocks and ledges set into the face, not a smooth ramp (8703; round 3, C1)', () => {
  const blocks = kinnoullCrag(scene.terrain, PERTH_LANDUSE.cliffs);
  assert.ok(blocks.length > 60, `rock blocks: ${blocks.length}`);
  const lum = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  for (const b of blocks) {
    // each stands on the cliff, set into it (its foot under the ground, its top a ledge over it), in a pale rock tone
    const ax = b.x - Math.sin(b.rotY) * (b.d - 2) / 2, az = b.z - Math.cos(b.rotY) * (b.d - 2) / 2; // where it is set into the face
    assert.ok(onCliff(scene.terrain, PERTH_LANDUSE.cliffs, ax, az), 'on the cliff');
    assert.ok(b.y - b.h / 2 < scene.terrain.heightAt(ax, az), 'its foot is in the ground');
    assert.ok(b.y + b.h / 2 > scene.terrain.heightAt(ax, az) + .5, 'its top stands out of the face as a ledge');
    assert.ok(lum(b.rgb) > .18, `pale rock (linear): ${lum(b.rgb).toFixed(2)}`);
  }
  // broken: the blocks differ in size and tone
  assert.ok(new Set(blocks.map(b => b.rgb.join())).size >= 4, 'several rock tones');
  // none stands in front of the cliff camera's eye, filling its frame
  const eye = (JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[] }>)['pt-kinnoull-cliff']!.pos;
  assert.deepEqual([...CLIFF_EYE], eye, 'the crag keeps clear of the frozen camera itself');
  // a 9 m block 30 m from the eye filled a third of the frame (capture at f6930822); none nearer than 50 m
  assert.equal(blocks.filter(b => Math.hypot(b.x - eye[0], b.z - eye[2]) < 50).length, 0, 'no block near the cliff camera');
  const hs = blocks.map(b => b.h).sort((a, b) => a - b); assert.ok(hs.at(-1)! - hs[0]! > (CRAG.height[1] - CRAG.height[0]) * .6, 'mixed heights');
  const mesh = scene.group.getObjectByName('perth-kinnoull-crag') as THREE.Mesh;
  let city = false; mesh.traverseAncestors(o => { if (o === scene.parts.buildings) city = true; }); assert.ok(city, 'in the city group');
});

test('from the frozen summit eye the Tay and the North Inch are open: no canopy or massed crown stands in front of ground the bare hill leaves in view (round 3 score, C2)', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[] }>;
  const cam = cams['pt-kinnoull-panorama']!, [ex, ey, ez] = cam.pos as [number, number, number], [tx, , tz] = cam.target as [number, number, number];
  const axis = Math.atan2(tz - ez, tx - ex), half = 36 * Math.PI / 180;
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  // the North Inch: the 1.5 km2 park on the Tay's west bank north of the town; the Tay: the mapped water
  const area = (r: readonly (readonly number[])[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! - r[i]![0]!) * (r[j]![1]! + r[i]![1]!); return Math.abs(a / 2); };
  const inch = PERTH_LANDUSE.areas.park.filter(rs => pip(1339, -801, rs[0]!) && area(rs[0]!) > 1e6);
  assert.equal(inch.length, 1, 'the North Inch polygon');
  assert.ok(islandBelts().length >= 5, `small island belts: ${islandBelts().length}`);
  const islandBelt = inIslandBelt;
  const blockers = ['perth-kinnoull-canopy', 'waverley-wood-crowns', 'perth-island-trees'].map(n => scene.group.getObjectByName(n)!).filter(Boolean);
  scene.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), eye = new THREE.Vector3(ex, ey, ez);
  const check = (rings: typeof PERTH_LANDUSE.areas.water, what: string) => {
    let open = 0, blocked = 0, far = 0, islands = 0;
    for (let x = -1200; x < 2624; x += 50) for (let z = -1200; z < 912; z += 50) {
      const b = Math.atan2(z - ez, x - ex) - axis; if (Math.abs(Math.atan2(Math.sin(b), Math.cos(b))) > half) continue;
      if (!rings.some(rs => pip(x, z, rs[0]!))) continue;
      // in view over the bare ground: the eye-to-point line clears the drawn ground all the way
      const y = scene.terrain.heightAt(x, z) + .5, d = Math.hypot(x - ex, z - ez); let clear = true;
      for (let t = 30; t < d - 20 && clear; t += 6) { const f = t / d; if (scene.terrain.heightAt(ex + (x - ex) * f, ez + (z - ez) * f) > ey + (y - ey) * f) clear = false; }
      if (!clear) continue; open++;
      const to = new THREE.Vector3(x, y, z).sub(eye), length = to.length(); ray.set(eye, to.normalize()); ray.far = length - 5;
      const hit = ray.intersectObjects(blockers, false)[0];
      // a canopy may hide only the strip just behind itself (SIGHT.shadow m, plus a lattice step), never ground further off
      // the small islands' tree belts (ISLAND_CANOPY) stand full height in the river and may hide the channel behind them; counted apart
      if (hit && islandBelt(hit.point.x, hit.point.z)) islands++;
      else if (hit) { blocked++; if (Math.hypot(hit.point.x - x, hit.point.z - z) > SIGHT.shadow + CANOPY.step) far++; }
    }
    assert.ok(open > 40 && far === 0 && blocked <= open * .15 && islands <= open * .2, `${what}: ${blocked} of ${open} open points hidden by the canopy, ${far} of them further than ${SIGHT.shadow} m behind it; ${islands} behind island belts`);
  };
  check(PERTH_LANDUSE.areas.water, 'the Tay');
  check(inch, 'the North Inch');
});

test('the summit clearing has its own close ground under the panorama, in a hole in the town-wide drape (152; round 3, C2)', () => {
  const patch = scene.group.getObjectByName('perth-summit-ground') as THREE.Mesh;
  assert.ok(patch, 'the summit patch');
  let city = false; patch.traverseAncestors(o => { if (o === scene.parts.buildings) city = true; }); assert.ok(city, 'in the city group');
  const P = patch.geometry.getAttribute('position'), U = patch.geometry.getAttribute('uv');
  let far = 0; const ups: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]); far = Math.max(far, d);
    const up = P.getY(i) - scene.terrain.heightAt(x, z); ups.push(up); assert.ok(up >= SUMMIT.lift - 1e-3 && up < 2.5, `on the drawn ground, lifted: ${up.toFixed(2)}`);
    assert.ok(U.getX(i) >= 0 && U.getX(i) <= 1 && U.getY(i) >= 0 && U.getY(i) <= 1, 'one canvas over the disc');
  }
  assert.ok(ups.filter(u => u < .5).length > .95 * ups.length, 'seated close: most corners within 0.5 m of the ground');
  assert.ok(far > SUMMIT.hole + SUMMIT.step && far <= SUMMIT.patch + 1e-6, `the patch reaches past the hole: ${far.toFixed(1)}`);
  // no facet dips under the drawn ground (round 3's capture showed the bare ground through the patch's chords on the convex summit)
  const PI = patch.geometry.getIndex()!;
  for (let i = 0; i < PI.count; i += 3) for (const [u, w] of [[1 / 3, 1 / 3], [.5, 0], [0, .5], [.5, .5]] as const) {
    const [a, b, c] = [PI.getX(i), PI.getX(i + 1), PI.getX(i + 2)], s = 1 - u - w;
    const x = P.getX(a) * s + P.getX(b) * u + P.getX(c) * w, z = P.getZ(a) * s + P.getZ(b) * u + P.getZ(c) * w, y = P.getY(a) * s + P.getY(b) * u + P.getY(c) * w;
    assert.ok(y > scene.terrain.heightAt(x, z), `facet over the ground at ${x.toFixed(0)}, ${z.toFixed(0)}: ${(y - scene.terrain.heightAt(x, z)).toFixed(2)}`);
  }
  // the drape leaves the hole: no drape triangle with a corner inside it
  const cover = scene.group.getObjectByName('waverley-ground-cover') as THREE.Mesh, cp = cover.geometry.getAttribute('position'), ci = cover.geometry.getIndex()!;
  let over = 0; for (let i = 0; i < ci.count; i++) if (inSummitHole(scene.terrain, cp.getX(ci.getX(i)), cp.getZ(ci.getX(i)))) over++;
  assert.equal(over, 0, `drape corners in the summit hole: ${over}`);
  // the panorama's eye stands over it, and the patch covers the whole hole: no gap where neither it nor the drape is drawn
  const ray = new THREE.Raycaster(new THREE.Vector3(KINNOULL_EYE.pos[0], 400, KINNOULL_EYE.pos[2]), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(patch).length > 0, 'the patch is under the panorama\'s eye');
  let holes = 0, gaps = 0;
  for (let x = SUMMIT_CENTRE[0] - SUMMIT.hole; x <= SUMMIT_CENTRE[0] + SUMMIT.hole; x += 10) for (let z = SUMMIT_CENTRE[1] - SUMMIT.hole; z <= SUMMIT_CENTRE[1] + SUMMIT.hole; z += 10) {
    if (!inSummitHole(scene.terrain, x, z)) continue; holes++;
    ray.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0)); if (!ray.intersectObject(patch).length) gaps++;
  }
  assert.ok(holes > 500 && gaps === 0, `hole points ${holes}, uncovered ${gaps}`);
  // close grain: the paint is multiplied by a tiling detail map, right after it is sampled, fading out with distance
  const mat = patch.material as THREE.MeshLambertMaterial, shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  const f = shader.fragmentShader, at = f.indexOf('texture2D( uDetail, detailUv )');
  assert.ok(f.indexOf('#include <map_fragment>') >= 0 && at > f.indexOf('#include <map_fragment>') && at < f.indexOf('#include <color_fragment>') && f.includes('uniform sampler2D uDetail;') && f.includes('fwidth( detailUv )'), 'the detail multiplies the paint after it is sampled, with a distance fade');
  assert.equal((shader.uniforms.uDetailRepeat!.value as number), 2 * SUMMIT.patch / SUMMIT.detail.tile, 'one detail tile every SUMMIT.detail.tile m');
  assert.equal(mat.customProgramCacheKey(), 'perth-summit-detail', 'its own program');
  // the path is worn grey-green earth, not salmon (round 3 score): green at least red, red little over blue
  const rgbOf = (c: string) => { const m = c.match(/\d+/g); if (c.startsWith('#')) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; } return m!.slice(0, 3).map(Number); };
  for (const c of [SUMMIT.path.tone, SUMMIT.worn.tone]) { const [r, g, bl] = rgbOf(c) as [number, number, number]; assert.ok(g >= r - 2 && r - bl < 30, `grey-green, not orange: ${c}`); }
  // low gorse bushes near the eye, in the frame, off the paths (152)
  const nearPaths = PERTH_LANDUSE.paths.filter(q => q.line.some(([x, z]) => Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]) < SUMMIT.patch + 20));
  const bushes = summitBushes(scene.terrain, nearPaths), gm = scene.group.getObjectByName('perth-summit-gorse') as THREE.InstancedMesh;
  assert.ok(gm && gm.count === bushes.length, 'the bushes are drawn');
  const axisB = Math.atan2(KINNOULL_EYE.target[2] - SUMMIT_CENTRE[1], KINNOULL_EYE.target[0] - SUMMIT_CENTRE[0]);
  const framed = bushes.filter(b => { const a = Math.atan2(b.z - SUMMIT_CENTRE[1], b.x - SUMMIT_CENTRE[0]) - axisB; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < KINNOULL_EYE.halfWidthDeg * Math.PI / 180; });
  assert.ok(bushes.length >= 8 && framed.length >= 5, `bushes ${bushes.length}, in frame ${framed.length}`);
  for (const b of bushes) {
    const d = Math.hypot(b.x - SUMMIT_CENTRE[0], b.z - SUMMIT_CENTRE[1]); assert.ok(d >= SUMMIT.bush.ring[0] && d <= SUMMIT.bush.ring[1] && b.height <= SUMMIT.bush.height[1], 'low and near the eye');
    for (const q of nearPaths) for (let i = 1; i < q.line.length; i++) { const a0 = q.line[i - 1]!, b0 = q.line[i]!, dx = b0[0] - a0[0], dz = b0[1] - a0[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((b.x - a0[0]) * dx + (b.z - a0[1]) * dz) / L)) : 0; assert.ok(Math.hypot(b.x - a0[0] - u * dx, b.z - a0[1] - u * dz) - q.width / 2 >= b.radius, 'off the path'); }
  }
});

test('Kinnoull Tower stands where the LiDAR resolves it, near its OSM outline, in the photographs\' proportion', () => {
  const L = PERTH_LIDAR_LANDMARKS.kinnoullTower, tower = data.buildings.find(b => b.id === L.id)!;
  assert.ok(L.rise < 5, `the OSM outline itself is open ground in the DSM: ${L.rise} m`);
  const cx = tower.outer.reduce((a, p) => a + p[0], 0) / tower.outer.length, cz = tower.outer.reduce((a, p) => a + p[1], 0) / tower.outer.length;
  assert.ok(Math.hypot(KINNOULL_TOWER.x - cx, KINNOULL_TOWER.z - cz) < 15, 'the LiDAR tower within 15 m of the mapped outline');
  assert.equal(KINNOULL_TOWER.height, L.near!.rise, 'the drawn height is the DSM rise, not an assumption');
  const ratio = KINNOULL_TOWER.height / (2 * KINNOULL_TOWER.radius);
  assert.ok(ratio > 1.8 && ratio < 3.2, `height over width as 8703 and 4307 show it (about 2.5): ${ratio.toFixed(2)}`);
  // the tower's base is the cliff top, not the face below it
  assert.ok(Math.abs(scene.terrain.heightAt(KINNOULL_TOWER.x, KINNOULL_TOWER.z) - scene.terrain.heightAt(cx, cz)) < 8, 'on the cliff top');
});

test('Kinnoull Tower is pale coursed stone with red string courses, a cornice and its lower annexe (8703, 4307; round 3, C1)', () => {
  const b = new Batch({ colored: true }), base = 100, { top, annexeTop } = kinnoullTower(b, base), g = b.build();
  const P = g.getAttribute('position'), U = g.getAttribute('uv'), C = g.getAttribute('color');
  // the stone map is laid in metres: the shaft's UVs span its height and girth, not all one texel (round 2's near-black tower)
  let vMax = 0, uMax = 0; for (let i = 0; i < U.count; i++) { vMax = Math.max(vMax, U.getY(i)); uMax = Math.max(uMax, U.getX(i)); }
  assert.ok(vMax > top - 1 && uMax > 2 * Math.PI * KINNOULL_TOWER.radius * .9, `UVs: u to ${uMax.toFixed(1)}, v to ${vMax.toFixed(1)}`);
  // pale overall, with red courses at the band heights
  const lum = (i: number) => .2126 * C.getX(i) + .7152 * C.getY(i) + .0722 * C.getZ(i);
  // linear vertex colours: pale stone is over .45 in luminance (the near-black round-2 tower was the ashlar map's mean under its tint, about .2)
  let pale = 0, red = 0; for (let i = 0; i < C.count; i++) { if (lum(i) > .45) pale++; if (C.getX(i) > C.getY(i) + .15) red++; }
  assert.ok(pale > C.count / 2 && red > 0, `pale ${pale}, red ${red} of ${C.count}`);
  for (const share of TOWER_LOOK.bands) { let at = false; for (let i = 0; i < P.count; i++) if (C.getX(i) > C.getY(i) + .15 && Math.abs(P.getY(i) - (base + KINNOULL_TOWER.height * share)) < 1e-3) at = true; assert.ok(at, `a red course at ${share}`); }
  // the annexe: masonry beside the shaft, up to about half its height, on its north side
  let annexe = 0; for (let i = 0; i < P.count; i++) if (P.getZ(i) < KINNOULL_TOWER.z - KINNOULL_TOWER.radius - 1 && Math.abs(P.getY(i) - annexeTop) < 1e-3) annexe++;
  assert.ok(annexe >= 4 && annexeTop < base + KINNOULL_TOWER.height * .6, `annexe corners at its top: ${annexe}`);
  assert.equal(top, base + KINNOULL_TOWER.height, 'the drawn top is the LiDAR rise');
});

test('the east patch meets the main terrain without a seam, over the covered corridor only, falling away at its outer edges', () => {
  const mesh = scene.group.getObjectByName('perth-east-ground') as THREE.Mesh;
  assert.ok(mesh, 'the east patch is drawn, in the city group');
  let inCity = false; mesh.traverseAncestors(a => { if (a === scene.parts.buildings) inCity = true; }); assert.ok(inCity, 'in the city group');
  const E = PERTH_EAST_FILE.extent;
  assert.deepEqual([E.x0, E.z0, E.x1, E.z1], [PERTH_CITY_EXTENT.x1, 80, 4128, 1232], 'from the main edge east, the Phase I corridor only');
  const zMain = PERTH_CITY_EXTENT.z1;
  assert.deepEqual(scene.terrainMore, [E], 'the scene hands the patch to the world, which carves its flat plane there too');
  // the data agree at the seam: the patch's own 32 m nodes on x 2624 against the main terrain's field there (same tile, same reference)
  for (let z = E.z0; z <= zMain; z += 32) assert.ok(Math.abs(PERTH_EAST.heightAt(E.x0, z) - scene.terrain.heightAt(E.x0, z)) < .75, `data seam at z ${z}: ${PERTH_EAST.heightAt(E.x0, z)} vs ${scene.terrain.heightAt(E.x0, z)}`);
  // the drawn seam is watertight: every patch vertex on x 2624 inside the corridor is the drawn main ground there, at every 16 m
  const pos = mesh.geometry.getAttribute('position'); let seam = 0;
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getX(v) - E.x0) > 1e-6 || pos.getZ(v) < E.z0 - 1e-6 || pos.getZ(v) > zMain + 1e-6) continue; seam++;
    assert.ok(Math.abs(pos.getY(v) - scene.terrain.heightAt(E.x0, pos.getZ(v))) < 1e-3, `drawn seam at z ${pos.getZ(v)}`);
  }
  assert.equal(seam, (zMain - E.z0) / 16 + 1, 'a seam vertex every 16 m along the main terrain');
  // no hard wall and no ruled edge (round 3, C3): the skirt runs out EAST_SKIRT.out m to just under the world's flat plane; round 4 (the
  // plane still showed as a grey band at the cliff view's horizon): out at least 5 km, into the haze, ending in a hazed field tone, not grey
  assert.ok(EAST_SKIRT.out >= 5000, 'the apron runs out into the haze');
  const ends = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace), grey = new THREE.Color().setHex(GROUND_COLOUR, THREE.SRGBColorSpace);
  assert.ok(ends.g > ends.r * 1.05 && ends.g > ends.b * 1.05 && Math.abs(ends.g - grey.g) > .02, 'the apron ends green-grey, not the plane\'s grey');
  const col = mesh.geometry.getAttribute('color'), plane = ends; let apron = 0;
  for (let v = 0; v < pos.count; v++) {
    const out = pos.getZ(v) < E.z0 - 1 || pos.getZ(v) > E.z1 + 1 || pos.getX(v) > E.x1 + 1; if (!out) continue; apron++;
    assert.ok(pos.getZ(v) <= E.z0 - EAST_SKIRT.out + 1e-6 || pos.getZ(v) >= E.z1 + EAST_SKIRT.out - 1e-6 || pos.getX(v) >= E.x1 + EAST_SKIRT.out - 1e-6, 'the apron runs out its full width');
    assert.ok(pos.getY(v) <= EAST_SKIRT.to + 1e-6 && EAST_SKIRT.to < GROUND_Y, 'the apron ends under the flat plane');
    assert.ok(Math.abs(col.getX(v) - plane.r) < 1e-3 && Math.abs(col.getY(v) - plane.g) < 1e-3 && Math.abs(col.getZ(v) - plane.b) < 1e-3, 'the apron ends in its hazed tone');
  }
  assert.ok(apron > 100, `apron vertices: ${apron}`);
});

test('the east patch\'s Tay is one continuous river sheet, with trees along its banks (2166751, 46028; round 3, C3)', () => {
  const water = scene.group.getObjectByName('perth-east-water') as THREE.Mesh, trees = scene.group.getObjectByName('perth-east-bank-trees') as THREE.InstancedMesh;
  assert.ok(water && trees, 'the river sheet and the bank trees');
  // one connected sheet: union the triangles' vertices, and the largest component holds nearly all the sheet's area
  const idx = water.geometry.getIndex()!, P = water.geometry.getAttribute('position'), parent = [...Array(P.count).keys()];
  const find = (a: number): number => parent[a] === a ? a : (parent[a] = find(parent[a]!));
  for (let i = 0; i < idx.count; i += 3) { const a = find(idx.getX(i)), b = find(idx.getX(i + 1)), c = find(idx.getX(i + 2)); parent[b] = a; parent[c] = a; }
  const area = new Map<number, number>(); let total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)], ar = Math.abs((P.getX(b) - P.getX(a)) * (P.getZ(c) - P.getZ(a)) - (P.getX(c) - P.getX(a)) * (P.getZ(b) - P.getZ(a))) / 2;
    total += ar; area.set(find(a), (area.get(find(a)) ?? 0) + ar);
  }
  const big = Math.max(...area.values());
  assert.ok(total > 2e5 && big / total > .9, `the largest sheet holds ${(100 * big / total).toFixed(1)}% of ${total.toFixed(0)} m²`);
  // the sheet lies on or over the ground everywhere
  for (let i = 0; i < P.count; i++) assert.ok(P.getY(i) >= PERTH_EAST.heightAt(P.getX(i), P.getZ(i)) + .1, 'the sheet is over the ground');
  // bank trees: many, each standing on land within a lattice step of the wet nodes
  const wet = eastWater(), G = PERTH_EAST_FILE.grids[0]!, m = new THREE.Matrix4(), v = new THREE.Vector3();
  assert.ok(trees.count > 150, `bank trees: ${trees.count}`);
  for (let k = 0; k < trees.count; k++) {
    trees.getMatrixAt(k, m); v.setFromMatrixPosition(m);
    let near = false; for (let j = 0; j < G.nz && !near; j++) for (let i = 0; i < G.nx; i++) if (wet[j * G.nx + i] && Math.hypot(G.x0 + i * G.step - v.x, G.z0 + j * G.step - v.z) < 2 * G.step) { near = true; break; }
    assert.ok(near, `tree ${k} by the river`);
  }
});

test('the Tay\'s shore is shingle, not a dark band, and its water carries a wash in metres (round 2, C3)', () => {
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
  const sheet = lum(`#${WATER.colour.toString(16).padStart(6, '0')}`), grass = lum(GROUND_COLOURS.grass), shore = lum(SHORE.shore);
  // the bank inside the river outline shows above the sheet: its paint sits between the grass and the water, not far below both
  assert.ok(shore >= Math.min(grass, sheet) - .02 && shore <= Math.max(grass, sheet) + .02, `shore ${shore.toFixed(3)} against grass ${grass.toFixed(3)}, water ${sheet.toFixed(3)}`);
  assert.ok(shore - lum(GROUND_COLOURS.water) > .12, 'lighter than the old water paint that read as a dark band');
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh, pos = water.geometry.getAttribute('position'), uv = water.geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 97) assert.ok(Math.abs(uv.getX(i) - pos.getX(i)) < 1e-3 && Math.abs(uv.getY(i) - pos.getZ(i)) < 1e-3, 'the wash is placed in plan metres');
});

test('Perth\'s residential land is painted as gardens, darker and broken, not park lawn (round 2, C6)', () => {
  assert.equal(PERTH_RESIDENTIAL.length, 51, 'the 51 OSM landuse=residential polygons');
  const g = perthGardens(), lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
  assert.ok(g.plots.length > 500, `plots: ${g.plots.length}`);
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  for (const p of g.plots.filter((_, i) => i % 23 === 0)) assert.ok(PERTH_RESIDENTIAL.some(rs => pip(p.x + p.w / 2, p.z + p.d / 2, rs[0]!)), 'each plot is in residential land');
  // broken: no one tone covers most of it, and several show
  const share = new Map<string, number>(); for (const p of g.plots) share.set(p.tone, (share.get(p.tone) ?? 0) + 1);
  assert.ok(share.size >= 4, `tones: ${share.size}`);
  assert.ok(Math.max(...share.values()) / g.plots.length < .5, 'no tone over half the plots');
  // darker than the park paint it replaces, with hedges and tree crowns darker still
  const mean = g.plots.reduce((a, p) => a + lum(p.tone), 0) / g.plots.length;
  assert.ok(mean < lum(GROUND_COLOURS.park) - .02, `gardens ${mean.toFixed(3)} against park ${lum(GROUND_COLOURS.park).toFixed(3)}`);
  assert.ok(lum(GARDENS.hedgeTone) < mean && lum(GARDENS.crownTone) < mean, 'hedges and crowns darker than the plots');
  assert.ok(g.crowns.length > g.plots.length / 3, `tree-dotted: ${g.crowns.length} crowns`);
});

test('Perth\'s garden plots run with their streets in varied sizes, and the town centre\'s bare paving is broken into yards (round 3, C6)', () => {
  const g = perthGardens(), quarter = Math.PI / 2;
  const off = (a: number, b: number) => { const d = Math.abs(((a - b) % quarter + quarter) % quarter); return Math.min(d, quarter - d); };
  // aligned: a plot within 15 m of a street lies within 12 degrees (modulo a right angle) of that street, for most plots
  const check = (rects: readonly GardenRect[], what: string) => {
    let near = 0, along = 0;
    for (const r of rects) {
      const cx = r.x + r.w / 2, cz = r.z + r.d / 2, segs = streetsNear(cx, cz, 15); if (!segs.length) continue; near++;
      const [a, b] = segs.sort((p, q) => segDist(cx, cz, p) - segDist(cx, cz, q))[0]!;
      if (off(r.rot ?? 0, Math.atan2(b[1] - a[1], b[0] - a[0])) < 12 * Math.PI / 180) along++;
    }
    assert.ok(near > 200 && along / near > .7, `${what} along their streets: ${along} of ${near}`);
  };
  check(g.plots, 'plots');
  // varied: widths and depths spread over several metres, not one size
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  assert.ok(spread(g.plots.map(p => p.w)) > 10 && spread(g.plots.map(p => p.d)) > 12 && new Set(g.plots.map(p => Math.round(p.w))).size >= 8, 'varied plot sizes');
  // the town centre: patches outside the residential land, several tones with none over half, street-aligned
  const patches = g.patches ?? [];
  assert.ok(patches.length > 2000, `town patches: ${patches.length}`);
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  for (const r of patches.filter((_, i) => i % 41 === 0)) assert.ok(!PERTH_RESIDENTIAL.some(rs => pip(r.x + r.w / 2, r.z + r.d / 2, rs[0]!) && !rs.slice(1).some(h => pip(r.x + r.w / 2, r.z + r.d / 2, h))), 'patches stay off the gardens');
  const share = new Map<string, number>(); for (const r of patches) share.set(r.tone, (share.get(r.tone) ?? 0) + 1);
  assert.ok(share.size >= 5 && Math.max(...share.values()) / patches.length < .4, `patch tones: ${[...share.values()]}`);
  check(patches, 'patches');
});

test('Perth\'s stone tints are grey-buff: cooler than round 1\'s buff-brown, still a touch warmer than Edinburgh\'s (round 2, C5)', () => {
  const cool = (c: number) => (c & 255) / (c >> 16); // blue over red: the tint's coolness over the warm facade textures
  assert.ok(cool(PERTH_CITY_STONE) >= 1.1, `stone ${cool(PERTH_CITY_STONE).toFixed(3)}`);
  assert.ok(cool(PERTH_CITY_ASHLAR) >= 1.18, `ashlar ${cool(PERTH_CITY_ASHLAR).toFixed(3)}`);
  assert.ok(cool(PERTH_CITY_STONE) < cool(WAVERLEY_CITY_STONE) && cool(PERTH_CITY_ASHLAR) < cool(WAVERLEY_CITY_ASHLAR), 'warmer than Edinburgh\'s');
});

test('P3 cost: the city stays inside its caps over its phase-1 blockout (84,441 triangles in 2 meshes)', () => {
  // measured on the city group alone (parts.buildings), so the station and frontage elements' own growth does not count against P3:
  // the blockout city on main at a3244d8e, before this branch, was 84,441 triangles in 2 meshes
  let triangles = 0, draws = 0;
  scene.parts.buildings.traverse(o => { if (!(o instanceof THREE.Mesh)) return; const g = o.geometry, n = (g.index ? g.index.count : g.getAttribute('position').count) / 3; triangles += o instanceof THREE.InstancedMesh ? o.count * n : n; draws++; });
  assert.ok(triangles - 84_441 <= 320_000, `triangles +${triangles - 84_441}`);
  assert.ok(draws - 2 <= 24, `draws +${draws - 2}`);
  const hidden = buildPerthScene({ lighting: false, cityVisible: false });
  try { for (const name of ['perth-tay-water', 'perth-viaduct-iron', 'perth-city-roofs', 'perth-kirk-spire']) { let shown = false; hidden.group.getObjectByName(name)!.traverseAncestors(a => { if (a === hidden.parts.buildings) shown = a.visible; }); assert.equal(shown, false, `${name} hides with the city`); } }
  finally { hidden.dispose(); }
});

test('Perth\'s haze: Waverley\'s near the ground, its own clear air from the hill; thicker weather keeps its own', () => {
  const far = (visibility: number, y: number, haze: Haze = PERTH_HAZE) => fogFar(clearAir(fogRange(visibility, y), visibility, haze).far, y, haze);
  assert.equal(far(30_000, 2), WAVERLEY_HAZE.far, 'the river banks: the Scottish haze');
  assert.equal(far(30_000, 400), PERTH_CLEAR_AIR, 'above the haze: Perth\'s own clear air, not the page\'s 2.6 km');
  const kinnoull = far(30_000, 212.7);
  assert.ok(kinnoull > 2600 * 1.5 && kinnoull < PERTH_CLEAR_AIR, `from Kinnoull the town at 2.4 km is not lost in the fog: ${kinnoull}`);
  assert.equal(far(3000, 212.7), far(3000, 212.7, WAVERLEY_HAZE), 'mist keeps its own range');
  let last = far(9000, 400); for (let v = 9500; v <= 21_000; v += 500) { const f = far(v, 400); assert.ok(f >= last && f - last < 700, `no step at ${v} m`); last = f; }
  assert.equal(far(30_000, 400, WAVERLEY_HAZE), CLEAR_FOG.far, 'Waverley unchanged');
});

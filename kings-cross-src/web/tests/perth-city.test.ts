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
import { KINNOULL_TOWER, KIRK_TOWER, TOWER_LOOK, kinnoullTower, SHORE, VIADUCT_FORM, VIADUCT_LOOK, waterLevel, PERTH_DRAPE, PERTH_LANDUSE, PERTH_LANDUSE_BRIDGES, TAY_VIADUCT, WATER, tayViaduct } from '../src/perth-city-features.ts';
import { PERTH_CITY_ASHLAR, PERTH_CITY_STONE, perthBuildingHeight } from '../src/perth-city.ts';
import { WAVERLEY_CITY_ASHLAR, WAVERLEY_CITY_STONE } from '../src/waverley-city.ts';
import { KINNOULL_PEAK, WOODLAND, onCliff, sightHeight } from '../src/perth-woodland.ts';
import { EAST_SKIRT, PERTH_EAST, PERTH_EAST_FILE } from '../src/perth-east-ground.ts';
import { Batch } from '../src/materials.ts';
import { GROUND_COLOURS } from '../src/waverley-city-ground.ts';
import { GARDENS, PERTH_RESIDENTIAL, perthGardens } from '../src/perth-gardens.ts';
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
    // along the track through the pier's centreline: open between the two columns
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, y, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); ray.far = 10;
    if (ray.intersectObject(mesh).length === 0) gaps++;
    // under each girder: a column
    for (const side of [-1, 1]) { ray.set(new THREE.Vector3(p[0] + n[0] * side * F.girderOffset - t[0] * 5, y, p[1] + n[1] * side * F.girderOffset - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) columns++; }
    // the cap spans across, over the gap
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, F.girder[0] - L.cap / 2, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) caps++;  });
  assert.ok(gaps >= 8, `piers open between their columns: ${gaps}`);
  assert.equal(columns, 2 * gaps, 'two columns at each open pier');
  assert.equal(caps, gaps, 'a cap over each');
  const lum = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const ig = iron.build(), col = ig.getAttribute('color');
  let dark = 0; for (let i = 0; i < col.count; i++) if (lum([col.getX(i), col.getY(i), col.getZ(i)]) < .5) dark++;
  assert.equal(dark, 0, 'no dark ironwork: girders pale grey, railing white');
  assert.ok(lum(L.railing) > lum(L.girder), 'the railing is whiter than the girders');
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

test('Kinnoull\'s woods are broken mixed woodland, open westward from the summit, with gorse at the clearing', () => {
  const wood = scene.group.getObjectByName('waverley-wood-crowns') as THREE.InstancedMesh;
  assert.ok(wood && wood.instanceColor, 'the massed crowns, coloured per tree');
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3(), c = new THREE.Color();
  const hill: {x: number; z: number; top: number; h: number; tone: string}[] = [], [px, pz] = KINNOULL_PEAK;
  for (let i = 0; i < wood.count; i++) {
    wood.getMatrixAt(i, m); m.decompose(p, q, k); wood.getColorAt(i, c);
    if (Math.hypot(p.x - px, p.z - pz) > 900) continue;
    hill.push({x: p.x, z: p.z, top: p.y + k.y, h: k.y, tone: c.getHexString()});
  }
  const trees = hill.filter(t => t.h > 1.5), gorse = hill.filter(t => t.h <= 1.5);
  assert.ok(trees.length > 300, `wood crowns on the hill: ${trees.length}`);
  // mixed size: the tallest crowns at least twice the depth of the smallest (WOODLAND.size, 0.6 to 1.3)
  const hs = trees.map(t => t.h).sort((a, b) => a - b), q10 = hs[Math.floor(hs.length * .1)]!, q90 = hs[Math.floor(hs.length * .9)]!;
  assert.ok(q90 / q10 > 1.5, `crown depth spread, 90th over 10th percentile: ${(q90 / q10).toFixed(2)}`);
  // mixed tone: the darkest (pine) and the lightest (birch in sun) crowns differ in green by over a third
  const greens = trees.map(t => new THREE.Color('#' + t.tone).g).sort((a, b) => a - b);
  assert.ok(greens[Math.floor(greens.length * .9)]! > 1.35 * greens[Math.floor(greens.length * .1)]!, 'pine and birch tones both present');
  // open westward: no wood crown in the panorama's frame rises above the line from the eye to the town
  const blocking = trees.filter(t => { const s = sightHeight(t.x, t.z); return s !== undefined && t.top > s - WOODLAND.sight.clear + 1e-3; });
  assert.equal(blocking.length, 0, `crowns over the summit's westward sightline: ${blocking.length}`);
  // gorse at the clearing's edge (England_and_Scotland_152)
  const edge = gorse.filter(t => { const d = Math.hypot(t.x - px, t.z - pz); return d >= WOODLAND.gorse.inner - 10 && d <= WOODLAND.gorse.outer + 10; });
  assert.ok(edge.length > 30, `gorse at the summit clearing's edge: ${edge.length}`);
  // the cliff is bare rock (8703, 4307): no crown on its steep ground beside the OSM cliff line, and Kinnoull's paler rock is used
  const onIt = hill.filter(t => onCliff(scene.terrain, PERTH_LANDUSE.cliffs, t.x, t.z));
  assert.equal(onIt.length, 0, `crowns on the cliff: ${onIt.length}`);
  let face = 0; for (let x = 2400; x < 2620; x += 8) for (let z = 260; z < 380; z += 8) if (onCliff(scene.terrain, PERTH_LANDUSE.cliffs, x, z)) face++;
  assert.ok(face > 40, `the cliff below the tower is steep ground by the OSM line: ${face} points`);
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
  let pale = 0, red = 0; for (let i = 0; i < C.count; i++) { if (lum(i) > .7) pale++; if (C.getX(i) > C.getY(i) + .15) red++; }
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
  // no hard wall at the north edge: the skirt falls away outward, its slope well under vertical
  for (let v = 0; v < pos.count; v++) if (pos.getZ(v) < E.z0 - 1) assert.ok(pos.getZ(v) <= E.z0 - EAST_SKIRT.out + 1e-6 && EAST_SKIRT.down / EAST_SKIRT.out < .5, 'the north skirt slopes away');
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

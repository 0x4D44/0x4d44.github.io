import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { PERTH_TERRAIN_EXTENT } from '../../tools/build-perth-terrain.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { PERTH_CITY_EXTENT, PERTH_CITY_LIDAR_SOURCE, PERTH_LIDAR_HEIGHTS, PERTH_LIDAR_LANDMARKS, perthCityHeight } from '../src/perth-city-heights.ts';
import { KIRK_TOWER, waterLevel, PERTH_DRAPE, PERTH_LANDUSE, PERTH_LANDUSE_BRIDGES, TAY_VIADUCT, WATER, tayViaduct } from '../src/perth-city-features.ts';
import { perthBuildingHeight } from '../src/perth-city.ts';
import { inPerthFrontageGroundMask, perthFrontageGroundMask } from '../src/perth-frontage-mask.ts';
import { stationOutline } from '../src/perth-station.ts';
import { KINNOULL_PEAK, WOODLAND, sightHeight } from '../src/perth-woodland.ts';
import { Batch } from '../src/materials.ts';
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
      if (x <= -1200 || x >= 2624 || z <= -1200 || z >= 912) continue;
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

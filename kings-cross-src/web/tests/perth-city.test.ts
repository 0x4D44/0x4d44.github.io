import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { PERTH_TERRAIN_EXTENT } from '../../tools/build-perth-terrain.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { PERTH_CITY_EXTENT, PERTH_CITY_LIDAR_SOURCE, PERTH_LIDAR_HEIGHTS, PERTH_LIDAR_LANDMARKS, perthCityHeight } from '../src/perth-city-heights.ts';
import { KIRK_TOWER, PERTH_DRAPE, PERTH_LANDUSE, PERTH_LANDUSE_BRIDGES, TAY_VIADUCT, WATER, tayViaduct } from '../src/perth-city-features.ts';
import { perthBuildingHeight } from '../src/perth-city.ts';
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
  const pos = water.geometry.getAttribute('position'), index = water.geometry.getIndex()!;
  let below = 0, n = 0;
  for (let i = 0; i < index.count; i += 7) { const v = index.getX(i); n++; if (pos.getY(v) < scene.terrain.heightAt(pos.getX(v), pos.getZ(v)) + PERTH_DRAPE + WATER.lift - 1e-3) below++; }
  assert.equal(below, 0, `water vertices under the land-use drape + lift: ${below} of ${n}`);
  // mid-river under the viaduct is water
  assert.ok(PERTH_LANDUSE.areas.water.some(([o]) => pip(922, -43, o!)), 'the Tay under the viaduct');
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

test('P3 cost: the city stays inside its caps over phase 1 (579,835 triangles, 12 draws)', () => {
  assert.ok(scene.stats.triangles - 579_835 <= 320_000, `triangles +${scene.stats.triangles - 579_835}`);
  assert.ok(scene.stats.drawCalls - 12 <= 24, `draws +${scene.stats.drawCalls - 12}`);
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

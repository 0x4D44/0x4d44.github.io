// P3 city: the ground, the town's mapped roofs and the OSM city blocks. perth-scene.ts calls these once and adds what they fill to its
// terrain, roof and buildings parts. Horizontal geometry is OSM (ODbL); the ground is the Scottish Phase I 1 m DTM (OGLv3,
// tools/build-perth-terrain.ts). Phase 1 scaffold, moved here unchanged from perth-scene.ts: the city element adds LiDAR heights (Phase I
// DSM less DTM, as waverley-city-heights.ts), roof forms, OSM land use, the Tay's water and bridges and Kinnoull Hill
// (gfx-rubrics/perth-city.md).
import * as THREE from 'three';
import type {WaverleyArea, WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {buildTerrainMesh, overMesh} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch, material, terrainMaterial} from './materials.ts';
import {fillSurface, shell, walls} from './waverley-mesh.ts';
import {prism} from './waverley-frontage-mesh.ts';
import {buildPerthEastGround} from './perth-east-ground.ts';
import {buildWaverleyCity} from './waverley-city.ts';
import {Footprints} from './waverley-city-ground.ts';
import {Streets} from './waverley-city-shops.ts';
import {perthCityHeight, PERTH_LIDAR_LANDMARKS} from './perth-city-heights.ts';
import {buildPerthCityGround, KINNOULL_TOWER, outlookClearings, kirkTower, PERTH_FEATURE_OMIT_IDS, PERTH_LANDUSE_BRIDGES, roadBridge, tayViaduct} from './perth-city-features.ts';
import {PERTH_LANDUSE} from './perth-city-features.ts';
import {stationRailwayIntrusions} from './station-railway.ts';
import {PERTH_FASCIA, stationOutline} from './perth-station.ts';
import {inPerthFrontageGroundMask, perthFrontageGroundMask} from './perth-frontage-mask.ts';
import type {PerthBuild} from './perth-scene.ts';

/** ASSUMED fallback heights (m) by OSM building type, where OSM gives neither height nor levels: Perth's houses are mostly two storeys
 *  under a pitched roof, not the 12 m the shared builder assumes (core/waverley-data.ts heights). The city element replaces these with
 *  LiDAR heights (Phase I DSM less DTM, as Waverley's waverley-city-heights.ts). */
export const PERTH_FALLBACK_HEIGHTS: Readonly<Record<string, number>> = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 8, bungalow: 4.5, residential: 8, garage: 2.6, garages: 2.6, shed: 2.4,
  hut: 2.4, roof: 4, kiosk: 3, toilets: 3.5, greenhouse: 2.5, allotment_house: 2.4, carport: 2.6, service: 3,
};
/** Everything else with no OSM height or levels: ASSUMED three storeys of 3 m, the town centre's common tenement and shop height. */
export const PERTH_DEFAULT_HEIGHT = 9;
/** A block's top above its foot (m) and where it came from: OSM height or levels as the shared builder read them, else the fallbacks. */
export function perthBuildingHeight(b: Pick<WaverleyArea, 'height' | 'minHeight' | 'heightBasis' | 'tags'>): {height: number; basis: 'OSM' | 'ASSUMED'} {
  if (!b.heightBasis.startsWith('ASSUMED 12m') && !b.heightBasis.startsWith('ASSUMED 8m')) return {height: b.height, basis: 'OSM'};
  const kind = b.tags.building ?? b.tags['building:part'] ?? 'yes';
  return {height: Math.max(b.minHeight + 2, PERTH_FALLBACK_HEIGHTS[kind] ?? PERTH_DEFAULT_HEIGHT), basis: 'ASSUMED'};
}

/** Ground: the DTM with the station floor flattened (perth-scene.ts perthGround), one draw. Returns the drawn mesh's ground. */
export function addPerthGround(build: PerthBuild, field: Terrain, group: THREE.Group): Terrain {
  const {own, stats, geometries} = build;
  const tm = buildTerrainMesh(field, {maxLeaf: 16, tolerance: () => .08});
  const ground = overMesh(field, tm);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tm.positions, 3)); tg.setIndex(new THREE.BufferAttribute(tm.indices, 1)); tg.computeVertexNormals();
  // ASSUMED neutral grass-grey: no land-use polygons yet (the city element adds OSM land use and the Tay's water).
  const groundMaterial = own(terrainMaterial('ground').clone() as THREE.MeshLambertMaterial); groundMaterial.color.setHex(0x6f7564);
  const terrainMesh = new THREE.Mesh(tg, groundMaterial); terrainMesh.name = 'perth-ground'; group.add(terrainMesh); geometries.add(tg);
  stats.triangles += tm.triangles; stats.drawCalls++;
  return ground;
}

/** The town's other mapped roofs (OSM building=roof: fuel-station and market canopies) as slabs at their OSM or ASSUMED height over their
 *  own ground, into `roofTops`, with their fascias into the roof part's shared `fascia` batch after the station's. */
export function addPerthMappedRoofs(data: Pick<PerthData, 'roofs'>, ground: Terrain, roofTops: Batch, fascia: Batch): void {
  for (const r of data.roofs) {
    const top = ground.rangeUnder(r.outer, 4).mean + r.height;
    fillSurface(roofTops, r.outer, r.holes, () => top);
    walls(fascia, r.outer, r.holes, () => top - PERTH_FASCIA, () => top);
  }
}

/** The town's tone (ASSUMED, matched by eye to R-pt3-d and R-pt3-a: Perth's buff-grey sandstone and harling, a touch warmer than
 *  Edinburgh's), as tints over the city facade and ashlar textures (waverley-city.ts WAVERLEY_CITY_STONE explains the method). */
export const PERTH_CITY_STONE = 0x9a9aa2, PERTH_CITY_ASHLAR = 0xc2c6dc;
/** The city mesh names; the tops are a roof for the cover map (cover.ts ROOF_MESHES). */
export const PERTH_CITY_MESHES = {walls: 'perth-city-walls', ashlar: 'perth-city-ashlar', tops: 'perth-city-roofs', shops: 'perth-city-shops'} as const;
/** Perth's shop streets: the mapped carriageways of the main classes (primary to tertiary, 8.5 m and over) and the pedestrian High
 *  Street and its kin (5 m), as data/perth-city-landuse.json carries them (ASSUMED proxy: the town centre's shops face these). */
const shopStreets = () => new Streets(PERTH_LANDUSE.roads.filter(r => r.width >= 8.5 || r.width === 5));

/** The city: every mapped block not standing on the railway, extruded from its lowest ground to its OSM, LiDAR or ASSUMED height
 *  under its roof (waverley-city.ts buildWaverleyCity, with Perth's heights and tone); then the ground cover, the Tay, its bridges and
 *  the towers (perth-city-features.ts). All of it is in `group`, the buildings part, so the city toggle hides it. */
export function addPerthCity(build: PerthBuild, data: PerthData, ground: Terrain, group: THREE.Group): {buildingIds: string[]; heightBasis: {OSM: number; LiDAR: number; ASSUMED: number}} {
  const {add, own, stats, geometries} = build;
  const omitted = new Set([...stationRailwayIntrusions(data), ...PERTH_FEATURE_OMIT_IDS]);
  const take = (part: {group: THREE.Group; stats: {triangles: number; drawCalls: number}}) => {
    group.add(part.group); stats.triangles += part.stats.triangles; stats.drawCalls += part.stats.drawCalls;
    part.group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geometries.add(m.geometry);
      for (const mat of [m.material].flat()) { own(mat); const map = (mat as THREE.MeshLambertMaterial).map; if (map) mat.addEventListener('dispose', () => map.dispose()); } });
  };
  const fabric = buildWaverleyCity(data, ground, {omitBuildingIds: omitted, style: {height: b => perthCityHeight(b, perthBuildingHeight), stone: PERTH_CITY_STONE, ashlar: PERTH_CITY_ASHLAR, names: PERTH_CITY_MESHES, streets: shopStreets(), dormers: false}});
  fabric.group.name = 'perth-city'; take(fabric);
  const buildingIds = [...fabric.buildingIds], heightBasis = {...fabric.heightBasis};
  // the ground cover, trees and the Tay, over the drawn ground
  const mask = perthFrontageGroundMask(stationOutline(data)?.outer);
  take(buildPerthCityGround(ground, new Footprints([...[...data.buildings, ...data.roofs].map(b => b.outer), ...outlookClearings()]), (x, z) => inPerthFrontageGroundMask(mask, x, z)));
  // the Tay's corridor east of the main terrain, which the cliff camera looks over (perth-east-ground.ts)
  take(buildPerthEastGround(ground));
  // the bridges and towers
  const masonry = new Batch({colored: true}), ironwork = new Batch(), deck = new Batch(), lead = new Batch();
  tayViaduct(masonry, ironwork, ground);
  for (const b of PERTH_LANDUSE_BRIDGES) roadBridge(masonry, deck, ground, b);
  const kirk = data.buildings.find(b => b.id === PERTH_LIDAR_LANDMARKS.kirk.id);
  if (kirk) kirkTower(masonry, lead, kirk, ground.rangeUnder(kirk.outer, 4).min);
  const tower = data.buildings.find(b => b.id === KINNOULL_TOWER.id);
  if (tower) {
    const {x, z, radius, height, sides} = KINNOULL_TOWER, base = ground.heightAt(x, z);
    prism(masonry, x, z, radius, base - .3, base + height, sides); buildingIds.push(tower.id); heightBasis.LiDAR++;
  }
  const ashlar = own(material('stone').clone() as THREE.MeshLambertMaterial); ashlar.color.setHex(PERTH_CITY_ASHLAR); ashlar.vertexColors = true;
  const iron = own(material('steel').clone() as THREE.MeshLambertMaterial); iron.color.setHex(0x3c4446);
  const leadMaterial = own(new THREE.MeshLambertMaterial({color: 0x6e7479, side: THREE.DoubleSide}));
  add(group, masonry, ashlar, 'perth-city-masonry');
  add(group, ironwork, iron, 'perth-viaduct-iron');
  add(group, deck, own(material('asphalt').clone()), 'perth-bridge-roads');
  add(group, lead, leadMaterial, 'perth-kirk-spire');
  stats.buildings = buildingIds.length;
  return {buildingIds, heightBasis};
}

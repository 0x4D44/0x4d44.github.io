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
import {fillSurface, walls} from './waverley-mesh.ts';
import {stationRailwayIntrusions} from './station-railway.ts';
import {PERTH_FASCIA} from './perth-station.ts';
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

/** The city: every mapped block not standing on the railway, extruded from its lowest ground to its height, with a flat top. */
export function addPerthCity(build: PerthBuild, data: PerthData, ground: Terrain, group: THREE.Group): {buildingIds: string[]; heightBasis: {OSM: number; ASSUMED: number}} {
  const {add, own, stats} = build;
  const omitted = new Set(stationRailwayIntrusions(data)), buildingIds: string[] = [], heightBasis = {OSM: 0, ASSUMED: 0};
  const wallsBatch = new Batch({colored: true}), topsBatch = new Batch({colored: true});
  for (const b of data.buildings) {
    if (omitted.has(b.id)) continue;
    buildingIds.push(b.id);
    const h = perthBuildingHeight(b); heightBasis[h.basis]++;
    const base = ground.rangeUnder(b.outer, 4).min, top = base + h.height;
    let hash = 0; for (const c of b.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    const tone = .78 + (hash % 19) * .012;
    walls(wallsBatch, b.outer, b.holes, () => b.minHeight ? base + b.minHeight : base - .15, () => top, [tone, tone * .98, tone * .94]);
    const from = topsBatch.colors.length;
    fillSurface(topsBatch, b.outer, b.holes, () => top);
    const roofTone = .8 + ((hash >>> 7) % 11) * .02;
    for (let i = from; i < topsBatch.colors.length; i += 3) { topsBatch.colors[i] *= roofTone; topsBatch.colors[i + 1] *= roofTone; topsBatch.colors[i + 2] *= roofTone * 1.02; }
  }
  stats.buildings = buildingIds.length;
  // ASSUMED: Perth's sandstone is a paler buff-grey than Edinburgh's; the city element sources the tone from photographs.
  const sandstone = own(material('stone').clone() as THREE.MeshLambertMaterial); sandstone.vertexColors = true; sandstone.color.setHex(0xb8b2a2);
  const slate = own(material('slate').clone() as THREE.MeshLambertMaterial); slate.vertexColors = true;
  add(group, wallsBatch, sandstone, 'perth-city-walls');
  add(group, topsBatch, slate, 'perth-city-roofs');
  return {buildingIds, heightBasis};
}

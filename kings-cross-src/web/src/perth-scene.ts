// Perth (Scotland) is an independent local scene, like Waverley's (waverley-scene.ts). Lazy-load this MODULE, then call buildPerthScene();
// it owns no renderer, animation loop, feed, camera or DOM. No London/NR data is imported.
// Horizontal geometry is OSM (ODbL, core/perth-data.ts); the 16 m context grid is the Scottish Phase I 1 m DTM (OGLv3,
// tools/build-perth-terrain.ts). This file is the orchestrator: it loads the data, levels the ground and calls the three elements once
// each, in a fixed order: P1 station (perth-station.ts: track, platforms, station roof), P2 frontage (perth-frontage.ts), P3 city
// (perth-city.ts: the ground mesh, the town's mapped roofs, the OSM blocks). Phase 1 scaffold: plain extrusions the elements replace.
//
// VERTICAL LIMIT, as Waverley's: the DTM is not a rail survey, so rail heads use a schematic common y = 0 and the ground is flattened under
// the platforms and the mapped canopies and within 8 m of open rail (station-railway.ts stationGround). Track on a mapped bridge (OSM
// bridge=yes: the Tay viaduct, the road overbridges) does not pull the ground up to it: it stands on a deck over the real ground.
// ASSUMED, not measured Perth dimensions: the 0.915 m platform height, rail and sleeper sizes, the deck depth, every fallback height.
import * as THREE from 'three';
import type {WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {createTerrain} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import {Batch, material} from './materials.ts';
import {meshAdder} from './waverley-mesh.ts';
import {stationGround} from './station-railway.ts';
import {addWaverleyLights} from './station-weather.ts';
import {addPerthPlatforms, addPerthStationRoof, addPerthTrack, perthGlazing, perthTrack, stationOutline} from './perth-station.ts';
import {PERTH_FRONTAGE_OMIT_IDS, addPerthFrontage} from './perth-frontage.ts';
import {kingsPlaceCut} from './perth-frontage-bridge.ts';
import {addPerthCity, addPerthGround, addPerthMappedRoofs} from './perth-city.ts';
export {PERTH_LEVELS, PERTH_STATION_ROOF_HEIGHT, onBridge, perthTrack, stationOutline} from './perth-station.ts';
export {PERTH_DEFAULT_HEIGHT, PERTH_FALLBACK_HEIGHTS, perthBuildingHeight} from './perth-city.ts';
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk.
const [{default: dataFile}, {default: terrainFile}] = await Promise.all([
  import('./data/perth-scene.json', {with: {type: 'json'}}),
  import('./data/perth-terrain.json', {with: {type: 'json'}}),
]);

/** The station floor (platforms and the station's roofed outline) is level; the ground blends to the DTM away from the open rail off the
 *  bridges. The other mapped roofs (OSM building=roof) are canopies elsewhere in the town, not the station's, so they do not level it. */
export function perthGround(data: PerthData, raw: Terrain): Terrain {
  const station = stationOutline(data);
  const track = perthTrack(data).ground;
  // P2's King's Place cut (perth-frontage-bridge.ts): the road under the Tay Coast Line's 1849 bridge, which the 16 m DTM cannot resolve.
  return kingsPlaceCut(stationGround(raw, track, [...data.platforms.map(p => p.path), ...station ? [station.outer] : []]), track);
}

/** What every element builds with: the scene's mesh adder (counts triangles and draws, owns geometries), its owned-material register, its
 *  stats and its geometry set. Elements import this type only (`import type`), never this module, which awaits its data at the top. */
export interface PerthBuild {
  add: ReturnType<typeof meshAdder>;
  own: <T extends THREE.Material>(m: T) => T;
  stats: PerthScene['stats'];
  geometries: Set<THREE.BufferGeometry>;
}

export interface PerthOptions {
  data?: PerthData;
  /** Optional source terrain (in Perth's local metric frame), for testing. */
  terrain?: Terrain;
  /** Default true. Omit lights if the caller supplies them. */
  lighting?: boolean;
  /** Default true; hide the canopies for track/platform inspection. */
  roofVisible?: boolean;
  cityVisible?: boolean;
}
export interface PerthScene {
  group: THREE.Group;
  parts: {terrain: THREE.Group; track: THREE.Group; platforms: THREE.Group; roof: THREE.Group; buildings: THREE.Group};
  origin: PerthData['origin'];
  attribution: string;
  groundAttribution: string;
  /** Ground of the drawn mesh, including the railway flattening, not a rail survey. */
  terrain: Terrain;
  stats: {triangles: number; drawCalls: number; platforms: number; buildings: number; roofs: number; sleepers: number; bridgeSegments: number};
  /** The mapped city blocks drawn, in data order: not those standing on the railway. */
  buildingIds: string[];
  /** How many drawn blocks stand at an OSM, a LiDAR (perth-city-heights.ts) or an ASSUMED height. */
  heightBasis: {OSM: number; LiDAR: number; ASSUMED: number};
  dispose(): void;
}

/** Lazy import contract: const {buildPerthScene}=await import('./perth-scene.ts'); const p=buildPerthScene(); scene.add(p.group); */
export function buildPerthScene(options: PerthOptions = {}): PerthScene {
  const data = options.data ?? unpackWaverleyScene(dataFile);
  const contextTerrain = options.terrain ?? createTerrain(terrainFile as unknown as TerrainFile);
  const field = perthGround(data, contextTerrain);
  const group = new THREE.Group(); group.name = 'perth';
  const geometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const own = <T extends THREE.Material>(m: T): T => { ownedMaterials.add(m); return m; };
  const track = perthTrack(data);
  const stats = {triangles: 0, drawCalls: 0, platforms: data.platforms.length, buildings: 0, roofs: data.roofs.length, sleepers: 0, bridgeSegments: track.bridge.length};
  const build: PerthBuild = {add: meshAdder(stats, geometries), own, stats, geometries};
  const terrain = new THREE.Group(), trackGroup = new THREE.Group(), platforms = new THREE.Group(), roof = new THREE.Group(), buildings = new THREE.Group();
  const parts = {terrain, track: trackGroup, platforms, roof, buildings};
  for (const [key, value] of Object.entries(parts)) { value.name = `perth-${key}`; group.add(value); }

  const ground = addPerthGround(build, field, terrain);
  addPerthTrack(build, track, trackGroup);
  addPerthPlatforms(build, data, platforms);
  // The roof part: the station's glazed roof (P1) and the town's mapped roofs (P3), with one shared fascia draw, station's first.
  const glass = new Batch(), roofTops = new Batch(), fascia = new Batch();
  addPerthStationRoof(data, glass, fascia, build, roof);
  addPerthMappedRoofs(data, ground, roofTops, fascia);
  const glazing = perthGlazing(own(material('shedGlass').clone() as THREE.MeshLambertMaterial)); glazing.side = THREE.DoubleSide;
  build.add(roof, glass, glazing, 'perth-station-roof');
  const roofMaterial = own(material('slate').clone() as THREE.MeshLambertMaterial); roofMaterial.side = THREE.DoubleSide;
  build.add(roof, roofTops, roofMaterial, 'perth-mapped-roofs');
  build.add(roof, fascia, own(material('whiteSteel').clone()), 'perth-roof-fascia');
  addPerthFrontage(build, data, ground, group);
  // The blocks the frontage draws itself (the Station Hotel) are left out of the city's draw by id, never by geometry overlap.
  const frontageOwned = new Set(PERTH_FRONTAGE_OMIT_IDS);
  const {buildingIds, heightBasis} = addPerthCity(build, {...data, buildings: data.buildings.filter(b => !frontageOwned.has(b.id))}, ground, buildings);

  parts.roof.visible = options.roofVisible !== false; parts.buildings.visible = options.cityVisible !== false;
  if (options.lighting !== false) addWaverleyLights(group);
  let disposed = false;
  return {group, parts, origin: {...data.origin}, attribution: `${data.attribution}; ${terrainFile.attribution}`, groundAttribution: terrainFile.attribution,
    terrain: ground, stats, buildingIds, heightBasis,
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const g of geometries) g.dispose(); for (const m of ownedMaterials) m.dispose(); group.clear(); }};
}

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
import type {Extent, Terrain, TerrainFile} from '../../core/terrain.ts';
import {Batch, material} from './materials.ts';
import {meshAdder} from './waverley-mesh.ts';
import {stationGround, stationTrackCurves} from './station-railway.ts';
import {addWaverleyLights} from './station-weather.ts';
import {addPerthPlatforms, addPerthStationRoof, addPerthTrack, perthGlazing, perthTrack, stationOutline} from './perth-station.ts';
import {PERTH_ERA} from './perth-station-structure.ts';
import type {PerthEra} from './perth-station-structure.ts';
import {PERTH_FRONTAGE_OMIT_IDS, addPerthFrontage} from './perth-frontage.ts';
import {kingsPlaceCut} from './perth-frontage-bridge.ts';
import {addPerthCity, addPerthGround, addPerthMappedRoofs} from './perth-city.ts';
import {PERTH_EAST, PERTH_EAST_FILE} from './perth-east-ground.ts';
import {loadPerthWestScene} from './perth-west-buildings.ts';
import {addPerthWest, PERTH_WEST_DRAWN} from './perth-west-scene.ts';
import type {PerthWestPart} from './perth-west-scene.ts';
export {PERTH_LEVELS, PERTH_STATION_ROOF_HEIGHT, onBridge, perthTrack, stationOutline} from './perth-station.ts';
export {PERTH_DEFAULT_HEIGHT, PERTH_FALLBACK_HEIGHTS, perthBuildingHeight} from './perth-city.ts';
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk. The west extension's blocks are a lazy chunk of their own.
const [{default: dataFile}, {default: terrainFile}, westData] = await Promise.all([
  import('./data/perth-scene.json', {with: {type: 'json'}}),
  import('./data/perth-terrain.json', {with: {type: 'json'}}),
  loadPerthWestScene(),
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
  /** Which Perth the station draws (perth-station-structure.ts PERTH_ERA): default 'pre-2012', without the south lift bridge. */
  era?: PerthEra;
  /** Default false (Perth unchanged): draw the track on the faired curves (station-railway.ts stationTrackCurves) instead of the chords. */
  curves?: boolean;
  /** Draw the west extension (perth-west-scene.ts) out to the A9: by default wherever the drawn terrain's west edge is the tile's east edge
   *  (the committed terrain; a test's own terrain may not meet it). False: Perth as it was before it, the main apron round the west edge. */
  west?: boolean;
  /** The west blocks (perth-west-buildings.ts loadPerthWestScene's), for testing. */
  westData?: Parameters<typeof addPerthWest>[2];
}
export interface PerthScene {
  group: THREE.Group;
  parts: {terrain: THREE.Group; track: THREE.Group; platforms: THREE.Group; roof: THREE.Group; buildings: THREE.Group};
  origin: PerthData['origin'];
  attribution: string;
  groundAttribution: string;
  /** Ground of the drawn mesh, including the railway flattening, not a rail survey. */
  terrain: Terrain;
  /** Drawn ground beyond `terrain.extent` (the city's east patch, perth-east-ground.ts): the world's flat plane is carved there too. */
  terrainMore: Extent[];
  /** The drawn ground's height over `terrain`, the east patch (as perth-east-ground.ts seams them) and the west tile, for the camera clamp (camera-ground.ts). */
  groundAt(x: number, z: number): number;
  /** The west extension (perth-west-scene.ts), or null where it is not drawn. It hides with the city (`cityVisible`), as the east patch does. */
  west: PerthWestPart | null;
  stats: {triangles: number; drawCalls: number; platforms: number; buildings: number; roofs: number; sleepers: number; bridgeSegments: number};
  /** The mapped city blocks drawn, in data order: not those standing on the railway. */
  buildingIds: string[];
  /** How many drawn blocks stand at an OSM, a LiDAR (perth-city-heights.ts) or an ASSUMED height. */
  heightBasis: {OSM: number; LiDAR: number; ASSUMED: number};
  dispose(): void;
}

/** Lazy import contract: const {buildPerthScene}=await import('./perth-scene.ts'); const p=buildPerthScene(); scene.add(p.group); */
/** The drawn ground over the main terrain and the east patch: the patch's own DTM east of the seam (perth-east-ground.ts reads the main
 *  ground on the seam itself), the main drawn ground elsewhere (its `groundY` beyond both). `west`: the west tile's drawn surface over its
 *  extent west of its seam with the main terrain (perth-west-ground.ts: the two share the seam's vertices). */
export function perthGroundAt(main: Pick<Terrain, 'heightAt' | 'extent'>, east: Pick<Terrain, 'heightAt' | 'extent'> = PERTH_EAST, west?: Pick<Terrain, 'heightAt' | 'extent'>): (x: number, z: number) => number {
  const E = east.extent, W = west?.extent;
  return (x, z) => W && x >= W.x0 && x < W.x1 && z >= W.z0 && z <= W.z1 ? west!.heightAt(x, z)
    : x > E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1 && !(x <= main.extent.x1 && z <= main.extent.z1) ? east.heightAt(x, z) : main.heightAt(x, z);
}

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
  const drawWest = options.west ?? ground.extent.x0 === PERTH_WEST_DRAWN.x1;
  addPerthTrack(build, track, trackGroup, options.curves ? stationTrackCurves(data) : undefined);
  const era = options.era ?? PERTH_ERA;
  addPerthPlatforms(build, data, platforms, era);
  // The roof part: the station's glazed roof (P1) and the town's mapped roofs (P3), with one shared fascia draw, station's first.
  const glass = new Batch(), roofTops = new Batch(), fascia = new Batch();
  addPerthStationRoof(data, glass, fascia, build, roof, era);
  addPerthMappedRoofs(data, ground, roofTops, fascia);
  const glazing = perthGlazing(own(material('shedGlass').clone() as THREE.MeshLambertMaterial)); glazing.side = THREE.DoubleSide;
  build.add(roof, glass, glazing, 'perth-station-roof');
  const roofMaterial = own(material('slate').clone() as THREE.MeshLambertMaterial); roofMaterial.side = THREE.DoubleSide;
  build.add(roof, roofTops, roofMaterial, 'perth-mapped-roofs');
  build.add(roof, fascia, own(material('whiteSteel').clone()), 'perth-roof-fascia');
  addPerthFrontage(build, data, ground, group);
  // The blocks the frontage draws itself (the Station Hotel) are left out of the city's draw by id, never by geometry overlap.
  const frontageOwned = new Set(PERTH_FRONTAGE_OMIT_IDS);
  const {buildingIds, heightBasis} = addPerthCity(build, {...data, buildings: data.buildings.filter(b => !frontageOwned.has(b.id))}, ground, buildings, {west: drawWest});
  // the west extension (perth-west-scene.ts), its own group beside the parts, never a block the context city draws
  const west = drawWest ? addPerthWest(build, ground, options.westData ?? westData, group, {omitBuildingIds: data.buildings.map(b => b.id)}) : null;

  parts.roof.visible = options.roofVisible !== false; parts.buildings.visible = options.cityVisible !== false;
  if (west) west.group.visible = parts.buildings.visible;
  if (options.lighting !== false) addWaverleyLights(group);
  let disposed = false;
  // the credits: the context's OSM and DTM, then any west source whose credit (its first sentence: the data and the licence) they do not
  // already give. The west's are the same two (OSM, ODbL; the Scottish LiDAR, OGL v3), so today the line is unchanged.
  const credits = [data.attribution, terrainFile.attribution], creditOf = (c: string) => c.split('. ')[0]!.trim();
  for (const c of west?.attribution ?? []) if (!credits.some(k => creditOf(k) === creditOf(c))) credits.push(c);
  return {group, parts, origin: {...data.origin}, attribution: credits.join('; '), groundAttribution: terrainFile.attribution,
    terrain: ground, terrainMore: [{...PERTH_EAST_FILE.extent}, ...west ? [{...PERTH_WEST_DRAWN}] : []], groundAt: perthGroundAt(ground, PERTH_EAST, west?.ground), west, stats, buildingIds, heightBasis,
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const g of geometries) g.dispose(); for (const m of ownedMaterials) m.dispose(); group.clear(); }};
}

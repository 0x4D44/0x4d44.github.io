// Perth (Scotland) is an independent local scene, like Waverley's (waverley-scene.ts). Lazy-load this MODULE, then call buildPerthScene();
// it owns no renderer, animation loop, feed, camera or DOM. No London/NR data is imported.
// Horizontal geometry is OSM (ODbL, core/perth-data.ts); the 16 m context grid is the Scottish Phase I 1 m DTM (OGLv3,
// tools/build-perth-terrain.ts). Phase 1 scaffold: the ground, the track, the platforms, the mapped canopies and the OSM city as plain
// extrusions. The element workers (station, frontage, city) replace these with sourced detail.
//
// VERTICAL LIMIT, as Waverley's: the DTM is not a rail survey, so rail heads use a schematic common y = 0 and the ground is flattened under
// the platforms and the mapped canopies and within 8 m of open rail (station-railway.ts stationGround). Track on a mapped bridge (OSM
// bridge=yes: the Tay viaduct, the road overbridges) does not pull the ground up to it: it stands on a deck over the real ground.
// ASSUMED, not measured Perth dimensions: the 0.915 m platform height, rail and sleeper sizes, the deck depth, every fallback height.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyArea, WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {PERTH_STATION_BUILDING_ID} from '../../core/perth-data.ts';
import {createTerrain, buildTerrainMesh, overMesh} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import {Batch, material, terrainMaterial} from './materials.ts';
import type {V3} from './materials.ts';
import {WAVERLEY_LEVELS, fillSurface, meshAdder, walls} from './waverley-mesh.ts';
import {railStrip, stationGround, stationRailwayIntrusions, stationTrackSegments} from './station-railway.ts';
import type {TrackSegment} from './station-railway.ts';
import {addWaverleyLights} from './station-weather.ts';
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk.
const [{default: dataFile}, {default: terrainFile}] = await Promise.all([
  import('./data/perth-scene.json', {with: {type: 'json'}}),
  import('./data/perth-terrain.json', {with: {type: 'json'}}),
]);

/** ASSUMED levels: Waverley's preview datum and track dimensions (waverley-mesh.ts), and a deck under track on a mapped bridge. */
export const PERTH_LEVELS = {...WAVERLEY_LEVELS, deckTop: -.3, deckDepth: 1.2, deckHalfWidth: WAVERLEY_LEVELS.ballastHalfWidth + .6} as const;

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

/** The rails on a mapped bridge, which stand on a deck rather than pull the ground up (bridge=yes, or any bridge tag but "no"). */
export const onBridge = (tags: Record<string, string>): boolean => !!tags.bridge && tags.bridge !== 'no';
/** The surface track segments, split into those on the ground and those on a mapped bridge. */
export function perthTrack(data: Pick<PerthData, 'rails'>): {ground: TrackSegment[]; bridge: TrackSegment[]} {
  return {ground: stationTrackSegments({rails: data.rails.filter(r => !onBridge(r.tags))}), bridge: stationTrackSegments({rails: data.rails.filter(r => onBridge(r.tags))})};
}
/** The mapped station (OSM way/4064272, building=train_station, layer 1): its 14,500 m2 outline spans the main platforms and their tracks,
 *  so it is the station's roofed area, not a solid block (the railway rule, stationRailwayIntrusions, already keeps it out of the city).
 *  Phase 1 draws it as one glazed roof at PERTH_STATION_ROOF_HEIGHT; the station element replaces it with the sourced structure. */
export const stationOutline = (data: Pick<PerthData, 'buildings'>): WaverleyArea | undefined => data.buildings.find(b => b.id === PERTH_STATION_BUILDING_ID);
/** ASSUMED eaves height (m above rail) of the phase 1 station roof: no published figure found yet. */
export const PERTH_STATION_ROOF_HEIGHT = 9;
/** The station floor (platforms and the station's roofed outline) is level; the ground blends to the DTM away from the open rail off the
 *  bridges. The other mapped roofs (OSM building=roof) are canopies elsewhere in the town, not the station's, so they do not level it. */
export function perthGround(data: PerthData, raw: Terrain): Terrain {
  const station = stationOutline(data);
  return stationGround(raw, perthTrack(data).ground, [...data.platforms.map(p => p.path), ...station ? [station.outer] : []]);
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
  /** How many drawn blocks stand at an OSM or an ASSUMED height. */
  heightBasis: {OSM: number; ASSUMED: number};
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
  const add = meshAdder(stats, geometries);
  const terrain = new THREE.Group(), trackGroup = new THREE.Group(), platforms = new THREE.Group(), roof = new THREE.Group(), buildings = new THREE.Group();
  const parts = {terrain, track: trackGroup, platforms, roof, buildings};
  for (const [key, value] of Object.entries(parts)) { value.name = `perth-${key}`; group.add(value); }

  // Ground: the DTM with the station floor flattened, one draw.
  const tm = buildTerrainMesh(field, {maxLeaf: 16, tolerance: () => .08});
  const ground = overMesh(field, tm);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tm.positions, 3)); tg.setIndex(new THREE.BufferAttribute(tm.indices, 1)); tg.computeVertexNormals();
  // ASSUMED neutral grass-grey: no land-use polygons yet (the city element adds OSM land use and the Tay's water).
  const groundMaterial = own(terrainMaterial('ground').clone() as THREE.MeshLambertMaterial); groundMaterial.color.setHex(0x6f7564);
  const terrainMesh = new THREE.Mesh(tg, groundMaterial); terrainMesh.name = 'perth-ground'; terrain.add(terrainMesh); geometries.add(tg);
  stats.triangles += tm.triangles; stats.drawCalls++;

  // Track: ballast, rail heads and sleepers on every surface segment; a deck under the bridge segments.
  const ballast = new Batch(), rails = new Batch(), deck = new Batch(), sleepers: V3[] = [];
  for (const [ax, az, bx, bz] of [...track.ground, ...track.bridge]) {
    const a: Pt = [ax, az], b: Pt = [bx, bz], dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    railStrip(ballast, a, b, PERTH_LEVELS.ballastHalfWidth, -.14);
    for (const side of [-1, 1]) {
      const offset = side * (PERTH_LEVELS.railHalfGauge + PERTH_LEVELS.railHeadWidth / 2);
      railStrip(rails, [ax + nx * offset, az + nz * offset], [bx + nx * offset, bz + nz * offset], PERTH_LEVELS.railHeadWidth / 2, 0);
    }
    for (let s = .325; s < length; s += .65) sleepers.push([ax + dx * s / length, Math.atan2(dx, dz), az + dz * s / length]);
  }
  for (const [ax, az, bx, bz] of track.bridge) {
    const length = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    deck.box([cx, PERTH_LEVELS.deckTop - PERTH_LEVELS.deckDepth / 2, cz], [PERTH_LEVELS.deckHalfWidth * 2, PERTH_LEVELS.deckDepth, length + .02], {rotY: Math.atan2(bx - ax, bz - az)});
  }
  add(trackGroup, ballast, material('ballast'), 'perth-ballast');
  add(trackGroup, rails, material('steel'), 'perth-rail-heads');
  add(trackGroup, deck, material('concrete'), 'perth-bridge-decks');
  if (sleepers.length) {
    const g = new THREE.BoxGeometry(2.6, .05, .25), m = new THREE.InstancedMesh(g, material('concrete'), sleepers.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    sleepers.forEach(([x, yaw, z], i) => { q.setFromAxisAngle(up, yaw); matrix.compose(new THREE.Vector3(x, -.125, z), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, matrix); });
    m.instanceMatrix.needsUpdate = true; m.name = 'perth-sleepers'; trackGroup.add(m); geometries.add(g);
    stats.triangles += sleepers.length * 12; stats.drawCalls++; stats.sleepers = sleepers.length;
  }

  // Platforms: OSM outlines at the ASSUMED 0.915 m deck, with faces down to the station floor.
  const tops = new Batch(), faces = new Batch();
  for (const p of data.platforms) {
    fillSurface(tops, p.path, [], () => PERTH_LEVELS.platform);
    walls(faces, p.path, [], () => PERTH_LEVELS.ground, () => PERTH_LEVELS.platform);
  }
  const faceStone = own(material('stone').clone() as THREE.MeshLambertMaterial); faceStone.color.multiply(new THREE.Color(0x7a6e60));
  add(platforms, tops, material('concourseFloor'), 'perth-platform-surfaces');
  add(platforms, faces, faceStone, 'perth-platform-faces');

  // The station roof over the mapped station outline (stationOutline), glazed, with a fascia; the town's other mapped roofs (OSM
  // building=roof: fuel-station and market canopies) as slabs at their OSM or ASSUMED height over their own ground.
  const glass = new Batch(), roofTops = new Batch(), fascia = new Batch();
  const FASCIA = .6; // ASSUMED fascia depth (m)
  const station = stationOutline(data);
  if (station) {
    const top = PERTH_STATION_ROOF_HEIGHT;
    fillSurface(glass, station.outer, station.holes, () => top);
    walls(fascia, station.outer, station.holes, () => top - FASCIA, () => top);
  }
  for (const r of data.roofs) {
    const top = ground.rangeUnder(r.outer, 4).mean + r.height;
    fillSurface(roofTops, r.outer, r.holes, () => top);
    walls(fascia, r.outer, r.holes, () => top - FASCIA, () => top);
  }
  const glazing = own(material('shedGlass').clone() as THREE.MeshLambertMaterial); glazing.side = THREE.DoubleSide;
  add(roof, glass, glazing, 'perth-station-roof');
  const roofMaterial = own(material('slate').clone() as THREE.MeshLambertMaterial); roofMaterial.side = THREE.DoubleSide;
  add(roof, roofTops, roofMaterial, 'perth-mapped-roofs');
  add(roof, fascia, own(material('whiteSteel').clone()), 'perth-roof-fascia');

  // The city: every mapped block not standing on the railway, extruded from its lowest ground to its height, with a flat top.
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
  add(buildings, wallsBatch, sandstone, 'perth-city-walls');
  add(buildings, topsBatch, slate, 'perth-city-roofs');
  parts.roof.visible = options.roofVisible !== false; parts.buildings.visible = options.cityVisible !== false;
  if (options.lighting !== false) addWaverleyLights(group);
  let disposed = false;
  return {group, parts, origin: {...data.origin}, attribution: `${data.attribution}; ${terrainFile.attribution}`, groundAttribution: terrainFile.attribution,
    terrain: ground, stats, buildingIds, heightBasis,
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const g of geometries) g.dispose(); for (const m of ownedMaterials) m.dispose(); group.clear(); }};
}

// P1 station: the track, the platforms and the station roof. perth-scene.ts calls these once, in this order, and adds what they fill to its
// track, platforms and roof parts. Horizontal geometry is OSM (ODbL, core/perth-data.ts). ASSUMED, not measured Perth dimensions: the
// 0.915 m platform height, rail and sleeper sizes, the deck depth. The roof, the island building, the canopies, the footbridges and the
// fittings are planned and shaped in perth-station-structure.ts, from the photographs in gfx-rubrics/perth-station.md (sources there).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyArea, WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import {PERTH_STATION_BUILDING_ID} from '../../core/perth-data.ts';
import {Batch, material} from './materials.ts';
import type {V3} from './materials.ts';
import {WAVERLEY_LEVELS, fillSurface, walls} from './waverley-mesh.ts';
import {stationTexture} from './waverley-station-textures.ts';
import {paintMaterial} from './waverley-station-structure.ts';
import {islandBuildingBatches, PERTH_ROOF_RIDGE, PERTH_STATION, perthStationBatches, perthStationPlan} from './perth-station-structure.ts';
import type {PerthStationBatches} from './perth-station-structure.ts';
import {railStrip, stationTrackSegments} from './station-railway.ts';
import type {TrackSegment} from './station-railway.ts';
import type {PerthBuild} from './perth-scene.ts';

/** ASSUMED levels: Waverley's preview datum and track dimensions (waverley-mesh.ts), and a deck under track on a mapped bridge. */
export const PERTH_LEVELS = {...WAVERLEY_LEVELS, deckTop: -.3, deckDepth: 1.2, deckHalfWidth: WAVERLEY_LEVELS.ballastHalfWidth + .6} as const;

/** The rails on a mapped bridge, which stand on a deck rather than pull the ground up (bridge=yes, or any bridge tag but "no"). */
export const onBridge = (tags: Record<string, string>): boolean => !!tags.bridge && tags.bridge !== 'no';
/** The surface track segments, split into those on the ground and those on a mapped bridge. */
export function perthTrack(data: Pick<PerthData, 'rails'>): {ground: TrackSegment[]; bridge: TrackSegment[]} {
  return {ground: stationTrackSegments({rails: data.rails.filter(r => !onBridge(r.tags))}), bridge: stationTrackSegments({rails: data.rails.filter(r => onBridge(r.tags))})};
}
/** The mapped station (OSM way/4064272, building=train_station, layer 1): its 14,500 m2 outline spans the main platforms and their tracks,
 *  so it is the station's roofed area, not a solid block (the railway rule, stationRailwayIntrusions, already keeps it out of the city).
 *  The overall roof covers it (perth-station-structure.ts perthRoofRings), the island building standing under it. */
export const stationOutline = (data: Pick<PerthData, 'buildings'>): WaverleyArea | undefined => data.buildings.find(b => b.id === PERTH_STATION_BUILDING_ID);
/** The overall roof's ridge (m above rail): the glazing's top. ASSUMED (perth-station-structure.ts: Waverley's profile, 8 m gutter + 2.4 m rise). */
/** (Rounded to float32, as the drawn geometry holds it, so the scene test can compare the two exactly.) */
export const PERTH_STATION_ROOF_HEIGHT = Math.fround(PERTH_ROOF_RIDGE);
/** ASSUMED fascia depth (m) of the station roof and the town's mapped roofs (perth-city.ts addPerthMappedRoofs). */
export const PERTH_FASCIA = .6;

/** Track: ballast, rail heads and sleepers on every surface segment; a deck under the bridge segments. */
export function addPerthTrack(build: PerthBuild, track: {ground: TrackSegment[]; bridge: TrackSegment[]}, group: THREE.Group): void {
  const {add, stats, geometries} = build;
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
  add(group, ballast, material('ballast'), 'perth-ballast');
  add(group, rails, material('steel'), 'perth-rail-heads');
  add(group, deck, material('concrete'), 'perth-bridge-decks');
  if (sleepers.length) {
    const g = new THREE.BoxGeometry(2.6, .05, .25), m = new THREE.InstancedMesh(g, material('concrete'), sleepers.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    sleepers.forEach(([x, yaw, z], i) => { q.setFromAxisAngle(up, yaw); matrix.compose(new THREE.Vector3(x, -.125, z), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, matrix); });
    m.instanceMatrix.needsUpdate = true; m.name = 'perth-sleepers'; group.add(m); geometries.add(g);
    stats.triangles += sleepers.length * 12; stats.drawCalls++; stats.sleepers = sleepers.length;
  }
}

/** The element's plan and batches, made once per scene data (the platforms and the roof both draw from them). */
const batchCache = new WeakMap<object, PerthStationBatches>();
function stationBatches(data: Pick<PerthData, 'platforms' | 'rails' | 'buildings'>): PerthStationBatches {
  let b = batchCache.get(data);
  if (!b) { b = perthStationBatches(perthStationPlan(data, stationOutline(data)?.outer)); batchCache.set(data, b); }
  return b;
}

/** Platforms: OSM outlines at the ASSUMED 0.915 m deck in pale flags, the coper and tactile strip on every track edge, the faces, and what
 *  stands on them: the island building, the roof's columns, the footbridges, furniture and clocks (perth-station-structure.ts). */
export function addPerthPlatforms(build: PerthBuild, data: Pick<PerthData, 'platforms' | 'rails' | 'buildings'>, group: THREE.Group): void {
  const {add, own} = build;
  const tops = new Batch();
  for (const p of data.platforms) fillSurface(tops, p.path, [], () => PERTH_LEVELS.platform);
  const s = stationBatches(data);
  const faceStone = own(material('stone').clone() as THREE.MeshLambertMaterial); faceStone.color.multiply(new THREE.Color(0x7a6e60));
  const flagMap = stationTexture('flags'), paving = own(material('concourseFloor').clone() as THREE.MeshLambertMaterial); if (flagMap) { paving.map = flagMap; paving.color.setHex(0xffffff); }
  const blister = own(material('platformEdgeStrip').clone() as THREE.MeshLambertMaterial), blisterMap = stationTexture('blister'); blister.map = blisterMap; blister.color.setHex(blisterMap ? 0xffffff : 0xcfae3a);
  add(group, tops, paving, 'perth-platform-surfaces');
  add(group, s.platform.faces, faceStone, 'perth-platform-faces');
  const edges = new Batch({colored: true, uv: false}); edges.append(s.platform.edges); edges.append(s.platform.lip);
  add(group, edges, own(paintMaterial(material('platformEdgeStrip'))), 'perth-platform-edges');
  add(group, s.platform.tactile, blister, 'perth-platform-tactile');
  add(group, s.fittings, own(paintMaterial(material('whiteSteel'))), 'perth-columns-bridges-furniture');
  // The island building (perth-station-structure.ts islandBuildingBatches), its stone coloured per vertex: divide out the stone texture's
  // own average (materials.ts stone, 0xa99a7c) as Waverley's central block does, so the texture adds only coursing.
  const station = stationOutline(data);
  const parts = islandBuildingBatches(perthStationPlan(data, station?.outer).island), stone = own(material('stone').clone() as THREE.MeshLambertMaterial); stone.vertexColors = true;
  const avg = new THREE.Color(0xa99a7c); if (stone.map) stone.color.setRGB(1 / avg.r, 1 / avg.g, 1 / avg.b); else stone.color.setHex(0xffffff);
  add(group, parts.stone, stone, 'perth-island-building');
  add(group, parts.windows, material('sash'), 'perth-island-building-windows');
  const top = own(material('slate').clone() as THREE.MeshLambertMaterial); top.color.multiply(new THREE.Color(0xa9a59b));
  add(group, parts.top, top, 'perth-island-building-top');
}

/** The overall roof: its glazing into `glass` (perth-scene.ts draws it, named for the rain cover), the Dundee canopies' valance into the roof
 *  part's shared `fascia` batch (the town's mapped roofs add theirs after it), and, given the scene's adder and roof group, the solid strips
 *  and the ironwork (trusses, girders, gables) as their own draws. */
export function addPerthStationRoof(data: Pick<PerthData, 'buildings' | 'platforms' | 'rails'>, glass: Batch, fascia: Batch, build?: PerthBuild, group?: THREE.Group): void {
  const station = stationOutline(data);
  if (!station) return;
  const s = stationBatches(data), plan = perthStationPlan(data, station.outer);
  glass.append(s.glass);
  if (plan.canopy.length >= 3) walls(fascia, plan.canopy, [], () => PERTH_STATION.canopy.top - PERTH_STATION.canopy.valance, () => PERTH_STATION.canopy.top);
  if (!build || !group) return;
  const strips = build.own(material('whiteSteel').clone() as THREE.MeshLambertMaterial); strips.color.setHex(0x4a4d50); strips.side = THREE.DoubleSide;
  build.add(group, s.strips, strips, 'perth-roof-strips');
  build.add(group, s.ironwork, build.own(paintMaterial(material('whiteSteel'))), 'perth-roof-ironwork');
}

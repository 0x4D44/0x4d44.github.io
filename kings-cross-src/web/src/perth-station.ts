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
import {islandBuildingBatches, perthRoofOver, platformParts, titeRoofBatches, PERTH_ROOF_RIDGE, PERTH_STATION, perthStationBatches, perthStationPlan} from './perth-station-structure.ts';
import type {PerthStationBatches} from './perth-station-structure.ts';
import {railStrip, stationTrackSegments} from './station-railway.ts';
import type {TrackSegment} from './station-railway.ts';
import type {PerthBuild} from './perth-scene.ts';

/** ASSUMED levels: Waverley's preview datum and track dimensions (waverley-mesh.ts), and a deck under track on a mapped bridge. */
export const PERTH_LEVELS = {...WAVERLEY_LEVELS, deckTop: -.3, deckDepth: 1.2, deckHalfWidth: WAVERLEY_LEVELS.ballastHalfWidth + .6} as const;

/** The rails on a mapped bridge, which stand on a deck rather than pull the ground up (bridge=yes, or any bridge tag but "no"). */
export const onBridge = (tags: Record<string, string>): boolean => !!tags.bridge && tags.bridge !== 'no';
/** The surface track segments, split into those on the ground and those on a mapped bridge. */
/** The open platforms' red asphalt (R-pt1-b, Abbott 6573357). ASSUMED shade. */
export const PERTH_OPEN_ASPHALT = 0x6e4c45;
/** The Dundee platforms' open ends in dark grey asphalt instead (lead ruling 2026-11-10, after round 3: R-pt1-c, Abbott 2012, and
 *  Champion 2011, geograph 2687800, both show platform 1 grey). ASSUMED shade. */
export const PERTH_OPEN_GREY = 0x4c4d4f;
export const PERTH_GREY_PLATFORMS: readonly string[] = ['1', '2'];
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
  // The tops: worn mid-grey flags under the roof; in the open beyond both its ends (perth-station-structure.ts platformParts), continuous
  // red asphalt, untextured (round 3: the flag texture had read as a tile chequer; Abbott 6573357, R-pt1-b, shows plain red surfacing),
  // but dark grey on the Dundee platforms (PERTH_GREY_PLATFORMS).
  const tops = new Batch(), open = new Batch(), grey = new Batch();
  for (const p of data.platforms) { const parts = platformParts(p.path); if (parts.covered.length) fillSurface(tops, parts.covered, [], () => PERTH_LEVELS.platform); for (const q of parts.open) fillSurface(PERTH_GREY_PLATFORMS.includes(p.ref ?? '') ? grey : open, q, [], () => PERTH_LEVELS.platform); }
  const s = stationBatches(data);
  // Red brick faces (Abbott 6573357, R-pt1-b), under the buff coper (perth-station-structure.ts).
  const faceStone = own(material('brickRed').clone() as THREE.MeshLambertMaterial); faceStone.color.multiply(new THREE.Color(0xb8aca4));
  const flagMap = stationTexture('flags'), paving = own(material('concourseFloor').clone() as THREE.MeshLambertMaterial); if (flagMap) { paving.map = flagMap; paving.color.setHex(0xb4b0a8); }
  const surfacing = own(new THREE.MeshLambertMaterial({color: PERTH_OPEN_ASPHALT}));
  const blister = own(material('platformEdgeStrip').clone() as THREE.MeshLambertMaterial), blisterMap = stationTexture('blister'); blister.map = blisterMap; blister.color.setHex(blisterMap ? 0xffffff : 0xcfae3a);
  add(group, tops, paving, 'perth-platform-surfaces');
  add(group, open, surfacing, 'perth-platform-surfaces-open');
  add(group, grey, own(new THREE.MeshLambertMaterial({color: PERTH_OPEN_GREY})), 'perth-platform-surfaces-open-grey');
  add(group, s.platform.faces, faceStone, 'perth-platform-faces');
  const edges = new Batch({colored: true, uv: false}); edges.append(s.platform.edges); edges.append(s.platform.lip);
  add(group, edges, own(paintMaterial(material('platformEdgeStrip'))), 'perth-platform-edges');
  add(group, s.platform.tactile, blister, 'perth-platform-tactile');
  add(group, s.fittings, own(paintMaterial(material('whiteSteel'))), 'perth-columns-bridges-furniture');
  // The bridges' and kiosk's glass panels (round 3): see-through, so the platform 4 elevation reads past the lift bridge's stairs. ASSUMED opacity.
  add(group, s.panes, own(new THREE.MeshLambertMaterial({vertexColors: true, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide})), 'perth-bridge-glass');
  // The island building (perth-station-structure.ts islandBuildingBatches), its stone coloured per vertex: divide out the stone texture's
  // own average (materials.ts stone, 0xa99a7c) as Waverley's central block does, so the texture adds only coursing.
  const station = stationOutline(data);
  const plan = perthStationPlan(data, station?.outer), parts = islandBuildingBatches(plan.island, perthRoofOver(plan));
  // Tite's 1848 block and its octagonal tower (perth-station-structure.ts PERTH_TITE), in the same draws.
  if (plan.tite) {
    const walls = islandBuildingBatches(plan.tite.ring), roof = titeRoofBatches(plan.tite.ring, plan.tite.tower);
    parts.stone.append(walls.stone); parts.stone.append(roof.stone); parts.windows.append(walls.windows); parts.top.append(walls.top);
    // Its hipped slate roof and spire stand outside the glazing, so they are a roof of their own for the rain cover (cover.ts ROOF_MESHES).
    const slate = own(material('slate').clone() as THREE.MeshLambertMaterial); slate.color.multiply(new THREE.Color(0xa9a59b));
    add(group, roof.slate, slate, 'perth-tite-roof');
  }
  const stone = own(material('stone').clone() as THREE.MeshLambertMaterial); stone.vertexColors = true;
  const avg = new THREE.Color(0xa99a7c); if (stone.map) stone.color.setRGB(1 / avg.r, 1 / avg.g, 1 / avg.b); else stone.color.setHex(0xffffff);
  add(group, parts.stone, stone, 'perth-island-building');
  add(group, parts.windows, material('sash'), 'perth-island-building-windows');
  const top = own(material('slate').clone() as THREE.MeshLambertMaterial); top.color.multiply(new THREE.Color(0xa9a59b));
  add(group, parts.top, top, 'perth-island-building-top');
}

/** The station roof's glazing material, from the scene's shared glass (perth-scene.ts): R-pt1-a, R-pt1-c and R-pt1-d show translucent
 *  white panes (obscured or weathered wired glass), not clear blue sky through them: a milky, mostly opaque pane. ASSUMED shade. */
export function perthGlazing(m: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  // The clear-pane texture (its alpha lets the sky through) gives way to a flat milky pane; the glazing bars are the roof's own rafters.
  m.map = null; m.emissiveMap = null; m.color.setHex(0xc9c7bf); m.emissive.setHex(0x7d7b74); m.transparent = true; m.opacity = .84;
  return m;
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
  const strips = build.own(material('whiteSteel').clone() as THREE.MeshLambertMaterial); strips.color.setHex(0x34312d); strips.side = THREE.DoubleSide;
  build.add(group, s.strips, strips, 'perth-roof-strips');
  build.add(group, s.ironwork, build.own(paintMaterial(material('whiteSteel'))), 'perth-roof-ironwork');
  // The glazing's weathered outer face (perth-station-structure.ts PerthStationBatches.weather): seen from above only.
  // Round 3: opaque, so the transparent sort can no longer put the milky panes over it (round 2's overview read white and streaky); its
  // faces look up, so from under the roof it is culled and the panes show. A weathered grey, ASSUMED shade.
  // Pulled toward the eye by a polygon offset: from pt-overview's 1.5 km the 4 cm lift is under the depth buffer's resolution and the panes
  // beneath won the depth test in patches (the white stripes); the offset counts in depth steps, so it holds at any range.
  const weather = build.own(new THREE.MeshLambertMaterial({color: 0x7a7b78, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8}));
  build.add(group, s.weather, weather, 'perth-roof-weathering');
}

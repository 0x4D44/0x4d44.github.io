// The Perth west extension in the scene (Perth west brief, 2026-11-13): the land from the main terrain's west edge (x -1200) out past the A9
// western bypass and Broxden (PERTH_WEST_EXTENT, x -3232): the terrain tile (perth-west-ground.ts), its land-use cover and trees
// (perth-west-cover.ts) and its OSM blocks (perth-west-buildings.ts). perth-scene.ts calls addPerthWest once, after the city.
// - Layering, as the context city's ground: the tile is the drawn ground (Perth's addPerthGround mesh), and the cover is a coarser drape seated
//   PERTH_DRAPE over it with a polygon offset (waverley-city-ground.ts), as buildPerthCityGround's is over the main terrain. Both are kept:
//   the tile carries the skirt into the haze, the seam curtain and the surface the drape, the trees and the blocks are seated on, and fills any
//   drape triangle left out; the drape carries the land use, streets and the A9. Neither replaces the other.
// - The main apron's west strip and its west corners lie where the tile is: perth-city.ts draws the apron without them (buildPerthEastGround's
//   `west`), and the tile's curtain meets the apron's north and south strips (perth-west-ground.ts mainApronEdge).
// - Seating: the cover on the tile's own terrain; a block on the tile's terrain west of x -1200 and the main drawn terrain east of it, point by
//   point (withWest), never the lower of two terrains.
// - The blocks' roofs are not in cover.ts ROOF_MESHES (perth-west-buildings.ts explains why).
import * as THREE from 'three';
import type {Extent, Terrain} from '../../core/terrain.ts';
import type {WaverleyScene} from '../../core/waverley-data.ts';
import {buildPerthWestGround, PERTH_WEST_FILE as WEST_TERRAIN_FILE, withWest} from './perth-west-ground.ts';
import {buildPerthWestCover, PERTH_WEST_FILE as WEST_LANDUSE_FILE} from './perth-west-cover.ts';
import {buildPerthWestBuildings, loadPerthWestScene, PERTH_WEST_LIDAR_SOURCE} from './perth-west-buildings.ts';
import {Footprints} from './waverley-city-ground.ts';
import type {PerthBuild} from './perth-scene.ts';

/** W4 review (2026-11-13, pt-west-from-station: a jagged row of pale-blue boxes on the horizon, lighter than the sky). From a low eye the
 *  Scottish haze is full by about 2.2 km (station-weather.ts PERTH_HAZE), and the west runs out to 3.2 km: its far blocks and tree crowns are
 *  drawn wholly in the fog colour, which is paler than the sky behind them, so they stand up as ghosts. So, as the fog takes them, they
 *  thin out (a screen-door dither, no blending or sorting) from `from` to gone at `to` of the fog: where they would be fog-coloured, the
 *  ground or the sky behind them shows instead. The land stays (it is under the horizon); from the hill, in its clear air, nothing
 *  changes. ASSUMED thresholds. */
export const WEST_FOG_FADE = {from: .8, to: .995, meshes: ['perth-west-walls', 'perth-west-ashlar', 'perth-west-roofs', 'perth-west-wood-crowns']} as const;
/** Patch `m` to thin out as the fog takes it (WEST_FOG_FADE), after whatever patch it already has. */
export function fogFade(m: THREE.Material): void {
  const before = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
  if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < smoothstep(${WEST_FOG_FADE.from.toFixed(4)}, ${WEST_FOG_FADE.to.toFixed(4)}, fogFactor)) discard;
#endif`);
  };
  m.customProgramCacheKey = () => `${key}+perth-west-fog-fade`;
  m.needsUpdate = true;
}

/** The extension's group in the Perth scene: the tile ('perth-west'), the cover ('perth-west-cover') and the blocks ('perth-west-buildings'). */
export const PERTH_WEST_GROUP = 'perth-west-extension';
/** The drawn west ground's extent (the tile's, not its skirt). */
export const PERTH_WEST_DRAWN: Extent = {...WEST_TERRAIN_FILE.extent};

/** The west blocks and mapped roofs (perth-west-buildings.ts loadPerthWestScene: their own lazy chunk). perth-scene.ts imports this module
 *  lazily too, so the extension's code and its terrain, land-use and heights data stay out of the main Perth chunk. */
export const loadPerthWest = loadPerthWestScene;

export interface PerthWestPart {
  group: THREE.Group;
  /** The drawn tile's height and extent, for the camera clamp (perth-scene.ts perthGroundAt). */
  ground: Pick<Terrain, 'heightAt' | 'extent'>;
  stats: {triangles: number; drawCalls: number};
  buildingIds: string[];
  heightBasis: {OSM: number; LiDAR: number; ASSUMED: number};
  /** The extension's sources' credits (OSM, the Scottish LiDAR DTM and DSM), each once. */
  attribution: string[];
}

/** The extension over `ground` (the main drawn terrain), into a group of its own under `parent`. `data`: the west blocks and mapped roofs
 *  (perth-west-buildings.ts loadPerthWestScene). */
export function addPerthWest(build: PerthBuild, ground: Terrain, data: Pick<WaverleyScene, 'buildings' | 'roofs' | 'attribution'>, parent: THREE.Group,
  options: {omitBuildingIds?: Iterable<string>} = {}): PerthWestPart {
  const {own, stats: sceneStats, geometries} = build, stats = {triangles: 0, drawCalls: 0};
  const group = new THREE.Group(); group.name = PERTH_WEST_GROUP; parent.add(group);
  const take = (part: {group: THREE.Group; stats: {triangles: number; drawCalls: number}}) => {
    group.add(part.group); stats.triangles += part.stats.triangles; stats.drawCalls += part.stats.drawCalls;
    part.group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geometries.add(m.geometry);
      for (const mat of [m.material].flat()) { own(mat); const map = (mat as THREE.MeshLambertMaterial).map; if (map) mat.addEventListener('dispose', () => map.dispose()); } });
  };
  const tile = buildPerthWestGround(ground); take(tile);
  take(buildPerthWestCover(tile.terrain, new Footprints([...data.buildings, ...data.roofs].map(b => b.outer))));
  const blocks = buildPerthWestBuildings(data, withWest(ground, tile.terrain), {omitBuildingIds: options.omitBuildingIds}); take(blocks);
  for (const name of WEST_FOG_FADE.meshes) { const m = group.getObjectByName(name) as THREE.Mesh | undefined; if (m) for (const mat of [m.material].flat()) fogFade(mat); }
  sceneStats.triangles += stats.triangles; sceneStats.drawCalls += stats.drawCalls;
  const attribution = [...new Set([data.attribution, WEST_LANDUSE_FILE.attribution, WEST_TERRAIN_FILE.attribution, PERTH_WEST_LIDAR_SOURCE.attribution].filter(Boolean))];
  return {group, ground: {heightAt: tile.heightAt, extent: PERTH_WEST_DRAWN}, stats, buildingIds: blocks.buildingIds, heightBasis: blocks.heightBasis, attribution};
}

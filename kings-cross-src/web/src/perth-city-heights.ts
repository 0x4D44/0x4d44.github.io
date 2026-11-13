// P3 city heights: the Scottish Government LiDAR Phase I (2011-12, 1 m DSM minus DTM, OGLv3) roof height of each mapped Perth block that
// OSM gives no height, from data/perth-city-heights.json (tools/build-perth-city-heights.ts, Waverley's method: h is the 90th-percentile
// surface above the lowest ground under the footprint, which is how the scene seats a block). The rule is Waverley's cityHeight
// (waverley-city-heights.ts): not for footprints under LIDAR_MIN_AREA m2 (a tree over a shed reads as a roof), elevated parts, or blocks
// reaching outside the terrain extent; a tower or spire on part of a plan (median more than LIDAR_TOWER under the 90th percentile) takes
// the median plus LIDAR_TOWER_RISE. Elsewhere Perth's own fallbacks (perth-city.ts perthBuildingHeight) stand.
// The same rule serves the west extension (perth-west-buildings.ts): perthCityHeight takes the LiDAR heights and the terrain extents to
// apply it within as a `source`, and reads the context city's (data/perth-city-heights.json, PERTH_CITY_EXTENT) when none is given.
import type {Pt} from '../../core/geo.ts';
import type {Extent} from '../../core/terrain.ts';
import {LIDAR_MIN_AREA, LIDAR_TOWER, LIDAR_TOWER_RISE, TINY_HEIGHT, tinyBlock} from './waverley-city-heights.ts';
import file from './data/perth-city-heights.json' with {type: 'json'};

export const PERTH_CITY_LIDAR_SOURCE = {dsm: file.source.dsm, licence: file.source.licence, attribution: file.source.attribution} as const;
/** The LiDAR peaks the landmarks stand their towers on (tools/build-perth-city-heights.ts PERTH_LIDAR_LANDMARKS): the highest DSM sample
 *  over the footprint, its rise above the footprint's low ground, and the footprint's 90th-percentile surface above the same ground. */
export const PERTH_LIDAR_LANDMARKS = file.landmarks;
/** The terrain extent (data/perth-terrain.json; tools/build-perth-terrain.ts PERTH_TERRAIN_EXTENT, held equal by the city test). */
export const PERTH_CITY_EXTENT = {x0: -1200, z0: -1200, x1: 2624, z1: 912} as const;
/** id -> the 90th-percentile surface (`height`) and median surface (`median`) above the lowest ground under the footprint, in metres, from a
 *  heights file (tools/build-perth-city-heights.ts: q metres a unit; ids as ascending way-id deltas, then relation ids as text). */
export function decodePerthHeights(f: {q: number; ids: {way: readonly number[]; relation: readonly string[]}; h: readonly number[]; r: readonly number[]}): Map<string, {height: number; median: number}> {
  const out = new Map<string, {height: number; median: number}>();
  let id = 0, k = 0;
  const put = (key: string) => { out.set(key, {height: f.h[k]! * f.q, median: (f.h[k]! - f.r[k]!) * f.q}); k++; };
  for (const d of f.ids.way) { id += d; put(`way/${id}`); }
  for (const r of f.ids.relation) put(`relation/${r}`);
  return out;
}
const lidar = decodePerthHeights(file);
export const PERTH_LIDAR_HEIGHTS: ReadonlyMap<string, {height: number; median: number}> = lidar;
/** Where a height rule reads its LiDAR heights, and the terrain extents it applies them within: a block with a corner outside every extent is
 *  not on the drawn ground (the scene seats it on the flat groundY), so a LiDAR height would sit tens of metres off. */
export interface CityHeightSource {heights: ReadonlyMap<string, {height: number; median: number}>; extents: readonly Extent[]}
const CONTEXT: CityHeightSource = {heights: lidar, extents: [PERTH_CITY_EXTENT]};
const area = (r: readonly Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

type Block = {id: string; outer: readonly Pt[]; height: number; minHeight: number; heightBasis: string; tags: Readonly<Record<string, string>>};
/** The height a Perth block is drawn at, with its basis: OSM's mapped height; else LiDAR's where usable; else `fallback` (OSM levels, or
 *  Perth's ASSUMED fallbacks). */
export function perthCityHeight(b: Block, fallback: (b: Block) => {height: number; basis: 'OSM' | 'ASSUMED'}, source: CityHeightSource = CONTEXT): {height: number; basis: 'OSM' | 'LiDAR' | 'ASSUMED'} {
  if (!b.heightBasis.startsWith('ASSUMED')) return {height: b.height, basis: 'OSM'};
  if (tinyBlock(b)) return {height: TINY_HEIGHT, basis: 'ASSUMED'};
  const l = source.heights.get(b.id);
  const on = ([x, z]: Pt) => source.extents.some(e => x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1);
  if (!l || b.minHeight > 0 || area(b.outer) < LIDAR_MIN_AREA || !b.outer.every(on)) return fallback(b);
  const height = l.height - l.median > LIDAR_TOWER ? l.median + LIDAR_TOWER_RISE : l.height;
  return {height: Math.max(2.5, Math.round(height * 10) / 10), basis: 'LiDAR'};
}

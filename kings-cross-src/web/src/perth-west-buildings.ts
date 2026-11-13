// P3 west buildings: the OSM blocks of the Perth west extension (tools/perth-west-extent.ts; data/perth-scene-west.json by
// tools/build-perth-west.ts, heights data/perth-city-heights-west.json by tools/build-perth-city-heights.ts --west) as prisms under a roof by
// type, merged into three draws: windowed walls, plain walls (garages, sheds, retail and industrial units) and roofs. Horizontal geometry is
// OSM (ODbL); heights are the Scottish Phase I LiDAR (DSM less DTM, OGLv3) by the context city's rule (perth-city-heights.ts perthCityHeight),
// else Perth's ASSUMED fallbacks (perth-city.ts perthBuildingHeight). Nothing here touches a scene: the integration lane calls
// buildPerthWestBuildings once, over the west ground, and adds the group:
//   const west = buildPerthWestBuildings(await loadPerthWestScene(), ground, {omitBuildingIds}); scene.add(west.group); ... west.dispose();
// `ground` must answer over the whole region (x -3232 to -1021: the west terrain, and the context terrain east of x -1200): the lowest ground
// under a footprint is read at its corners, edge midpoints and an interior lattice, and a terrain answers its groundY outside every grid.
//
// Budget. The west is about six thousand blocks, nearly all houses, so the cost is per house: three levels of detail, chosen by block when
// the mesh is built (not per frame: the camera is never in the suburbs, which lie 1.2 km or more from the station), by the footprint's
// distance from the station. 'full' is the context city's block (true footprint, roof planes cut along every crease, a chimney stack at each
// gable); 'lean' drops the stacks (ten triangles each, about half a house) and draws a block that already is a rectangle (within RECT_RATIO of
// its minimum-area rectangle) as flat faces with no cuts; 'box' also takes a small residential block's footprint to a rectangle of the same
// area (its minimum-area rectangle shrunk about its centre) and draws that. No dormers and no shop bands (waverley-city.ts).
// The roofs are deliberately not in cover.ts ROOF_MESHES: the weather's cover map takes its bounds from every roof it names, and this
// mesh would stretch it from the town to the whole extension and coarsen its cells at the station.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {ringArea} from '../../core/city.ts';
import type {Extent, Terrain} from '../../core/terrain.ts';
import {decodePerthWestBlocks} from './perth-west-blocks.ts';
import type {PerthWestBlocksFile} from './perth-west-blocks.ts';
import type {WaverleyArea, WaverleyScene} from '../../core/waverley-data.ts';
import {PERTH_WEST_EXTENT} from '../../tools/perth-west-extent.ts';
import {Batch, cityMaterial, material} from './materials.ts';
import type {Rgb, V3} from './materials.ts';
import {chimney, rectangleOf, ROOF_ASSUMED, roofPeak, roofPlan, roofSurface, withCreases} from './waverley-city-roofs.ts';
import type {RoofPlan} from './waverley-city-roofs.ts';
import {cityBlockColours, PLAIN_AREA, PLAIN_KINDS} from './waverley-city.ts';
import {fillSurface, meshAdder, walls} from './waverley-mesh.ts';
import {decodePerthHeights, perthCityHeight, PERTH_CITY_EXTENT} from './perth-city-heights.ts';
import {PERTH_CITY_ASHLAR, PERTH_CITY_STONE, PERTH_ROOF_TONES, perthBuildingHeight, perthRoofTone, TOWN_LOOK} from './perth-city.ts';
import heightsFile from './data/perth-city-heights-west.json' with {type: 'json'};

export const PERTH_WEST_LIDAR_SOURCE = {dsm: heightsFile.source.dsm, licence: heightsFile.source.licence, attribution: heightsFile.source.attribution} as const;
/** The LiDAR heights of the west blocks that OSM gives no height (id -> surface and median above the lowest ground under the footprint). */
export const PERTH_WEST_LIDAR_HEIGHTS: ReadonlyMap<string, {height: number; median: number}> = decodePerthHeights(heightsFile);
/** The terrain a west block may stand on for its LiDAR height to apply: the west terrain and the context terrain it joins at x -1200 (a block
 *  reaching outside both is seated on the flat groundY, perth-city-heights.ts). */
export const PERTH_WEST_TERRAINS: readonly Extent[] = [PERTH_WEST_EXTENT, PERTH_CITY_EXTENT];
type Block = Parameters<typeof perthCityHeight>[0];
/** A west block's height above its lowest ground, with its basis: OSM's; else LiDAR's where usable; else `fallback` (OSM levels, or Perth's
 *  ASSUMED fallbacks by type). */
export function perthWestHeight(b: Block, fallback: (b: Block) => {height: number; basis: 'OSM' | 'ASSUMED'} = perthBuildingHeight): {height: number; basis: 'OSM' | 'LiDAR' | 'ASSUMED'} {
  return perthCityHeight(b, fallback, {heights: PERTH_WEST_LIDAR_HEIGHTS, extents: PERTH_WEST_TERRAINS});
}

/** The west scene (buildings and mapped roofs only), its own lazy chunk: data/perth-west-blocks.json, the page's compact copy of
 *  data/perth-scene-west.json (perth-west-blocks.ts). */
export async function loadPerthWestScene(): Promise<WaverleyScene> {
  const {default: file} = await import('./data/perth-west-blocks.json', {with: {type: 'json'}});
  return decodePerthWestBlocks(file as unknown as PerthWestBlocksFile);
}

/** ASSUMED roof form by OSM building type where no roof:shape is mapped: detached houses and bungalows take a hipped roof (on a plan longer
 *  than wide: roofPlan falls back to a gable on a square one); every other type keeps roofPlan's own rule, a gable on residential blocks and a
 *  flat roof on the flat kinds (garages, retail, industry), on anything under 5 m and on very large plans. */
export const PERTH_WEST_ROOF_SHAPE: Readonly<Record<string, string>> = {detached: 'hipped', bungalow: 'hipped'};
/** ASSUMED: kinds that are not windowed fabric in the suburbs, drawn in plain walls whatever their size: the shared plain kinds (waverley-city.ts)
 *  and the garages, sheds, units and sheds-in-fields a plan this size is usually (OSM building=garage|shed|retail|industrial ...). */
export const PERTH_WEST_PLAIN_KINDS: ReadonlySet<string> = new Set([...PLAIN_KINDS, 'garage', 'garages', 'carport', 'shed', 'hut', 'service', 'retail', 'commercial', 'industrial', 'warehouse', 'supermarket', 'roof', 'transportation']);
/** The three draws' names (not roofs for the cover map: see the head of this file). */
export const PERTH_WEST_MESHES = {walls: 'perth-west-walls', ashlar: 'perth-west-ashlar', tops: 'perth-west-roofs'} as const;

export type WestDetail = 'full' | 'lean' | 'box';
/** How a block's detail follows the distance of its vertex centroid from `focus` (the station, the frame's origin): 'full' under `full` m,
 *  'lean' under `lean` m, 'box' beyond. ASSUMED radii, from the triangle counts in web/tests/perth-west-buildings.test.ts. */
export interface WestDetailRule {focus: Pt; full: number; lean: number}
export const PERTH_WEST_DETAIL: WestDetailRule = {focus: [0, 0], full: 1500, lean: 1800};
/** A block beyond the 'lean' radius is a 'box' if its plan is at most BOX_MAX_AREA m2 with no holes and no mapped roof:shape (a school or a
 *  retail park keeps its own plan). A 'lean' block whose minimum-area rectangle is at most RECT_RATIO times its area is that rectangle already
 *  (nine in ten four-cornered houses here are within 1.5%), and is drawn as one from the cheap form below. */
export const BOX_MAX_AREA = 400, RECT_RATIO = 1.04;

/** A block's minimum-area rectangle (waverley-city-roofs.ts rectangleOf: centre, unit long axis, half-length, half-width), and its area over
 *  the block's own; `equal` takes it in about its centre to the block's own area (an L-shaped house becomes a box of the same size). */
export interface Rect {c: Pt; u: Pt; L: number; W: number; ratio: number}
export function rectOf(outer: readonly Pt[], equal = false): Rect {
  const {c, u, L, W} = rectangleOf(outer), ratio = 4 * L * W / (ringArea(outer) || 1), k = equal && ratio > 1 ? 1 / Math.sqrt(ratio) : 1;
  return {c, u, L: L * k, W: W * k, ratio};
}
/** The rectangle's corners as a ring. */
export function rectRing({c, u, L, W}: Rect): Pt[] {
  const v: Pt = [-u[1], u[0]], at = (a: number, b: number): Pt => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b];
  return [at(L, W), at(-L, W), at(-L, -W), at(L, -W)];
}
/** The detail a block is drawn at. */
export function perthWestDetail(b: Pick<WaverleyArea, 'outer' | 'holes' | 'tags'>, rule: WestDetailRule = PERTH_WEST_DETAIL): WestDetail {
  const n = b.outer.length, cx = b.outer.reduce((s, p) => s + p[0], 0) / n, cz = b.outer.reduce((s, p) => s + p[1], 0) / n, d = Math.hypot(cx - rule.focus[0], cz - rule.focus[1]);
  if (d < rule.full) return 'full';
  if (d < rule.lean) return 'lean';
  return b.holes.length === 0 && !b.tags['roof:shape'] && ringArea(b.outer) <= BOX_MAX_AREA ? 'box' : 'lean';
}

/** One batch a draw: windowed walls, plain walls (and chimney stacks) and roofs, all vertex-coloured. */
export interface WestBatches {walls: Batch; plain: Batch; tops: Batch}
export const westBatches = (): WestBatches => ({walls: new Batch({colored: true}), plain: new Batch({colored: true}), tops: new Batch({colored: true})});

/** A rectangular block as flat faces, no cuts: walls from `base` (0.15 m sunk, as the context city) to the eave, the gable ends in one piece up to
 *  the ridge, and the roof as its planes (waverley-city-roofs.ts roofPlan's own eave, top and 40 degree pitch; a flat top where the plan is too
 *  deep for the rise, as roofPlan makes it). A gabled house is 14 triangles, a hipped one 14, a flat one 10. False, drawing nothing, where `plan`
 *  is not a flat roof, a gable or a hip. */
function addRect(out: WestBatches, r: Rect, plan: RoofPlan, hipped: boolean, base: number, color: Rgb, slate: Rgb, plain: boolean): boolean {
  const flat = plan.shape === 'flat';
  if (!flat && !(plan.shape === 'planes' && plan.creases.length > 0)) return false;
  const {c, u, L, W} = r, v: Pt = [-u[1], u[0]], y0 = base - .15, eave = plan.eave, top = plan.top;
  const P = (a: number, b: number, y: number): V3 => [c[0] + u[0] * a + v[0] * b, y, c[1] + u[1] * a + v[1] * b];
  const wall = (pts: V3[], n: Pt) => {
    const a = pts[0]!, e = pts[1]!, len = Math.hypot(e[0] - a[0], e[2] - a[2]) || 1, dx = (e[0] - a[0]) / len, dz = (e[2] - a[2]) / len;
    (plain ? out.plain : out.walls).poly(pts, pts.map(p => [(p[0] - a[0]) * dx + (p[2] - a[2]) * dz, p[1] - y0] as [number, number]), {facing: [n[0], 0, n[1]], color});
  };
  const roof = (pts: V3[]) => out.tops.poly(pts, pts.map(p => [p[0], p[2]] as [number, number]), {facing: [0, 1, 0], color: slate});
  // the flat top's half-width w (0: a sharp ridge), and for a hip the ridge's half-length l: both over the run the rise takes at 40 degrees
  const run = flat ? 0 : (top - eave) / Math.tan(ROOF_ASSUMED.pitchDeg * Math.PI / 180), w = flat ? W : Math.max(0, W - run), l = hipped ? Math.max(0, L - run) : L;
  const ridge = w < .01;
  for (const sg of [1, -1]) {
    wall([P(-L, sg * W, y0), P(L, sg * W, y0), P(L, sg * W, eave), P(-L, sg * W, eave)], [v[0] * sg, v[1] * sg]);
    const end: V3[] = [P(sg * L, -W, y0), P(sg * L, W, y0), P(sg * L, W, eave)];
    if (!flat && !hipped) end.push(...ridge ? [P(sg * L, 0, top)] : [P(sg * L, w, top), P(sg * L, -w, top)]);
    end.push(P(sg * L, -W, eave));
    wall(end, [u[0] * sg, u[1] * sg]);
  }
  if (flat) roof([P(-L, -W, eave), P(L, -W, eave), P(L, W, eave), P(-L, W, eave)]);
  else if (!hipped) {
    for (const sg of [1, -1]) roof([P(-L, sg * W, eave), P(L, sg * W, eave), P(L, sg * w, top), P(-L, sg * w, top)]);
    if (!ridge) roof([P(-L, -w, top), P(L, -w, top), P(L, w, top), P(-L, w, top)]);
  } else {
    for (const sg of [1, -1]) {
      roof([P(-L, sg * W, eave), P(L, sg * W, eave), P(l, sg * w, top), P(-l, sg * w, top)]);
      roof(ridge ? [P(sg * L, -W, eave), P(sg * L, W, eave), P(sg * l, 0, top)] : [P(sg * L, -W, eave), P(sg * L, W, eave), P(sg * l, w, top), P(sg * l, -w, top)]);
    }
    if (!ridge) roof([P(-l, -w, top), P(l, -w, top), P(l, w, top), P(-l, w, top)]);
  }
  return true;
}

/** One block into `out`: its walls from `base` (0.15 m sunk, as the context city; an elevated part, OSM min_height, from base + minHeight and
 *  never in the cheap form) to the roof, and the roof from `height` over `base` (OSM's convention: the top of the roof), at `detail`. The tint
 *  of the walls and of the slates are the context city's (waverley-city.ts cityBlockColours), the slates then toned as Perth's roofs are
 *  (perth-city.ts PERTH_ROOF_TONES). 'full' and 'lean' are the true plan under waverley-city-roofs.ts roofPlan's roof planes cut along every
 *  crease, 'full' with its chimney stacks; a 'lean' block that is a rectangle already, and every 'box', take the cheap form (addRect), a 'box'
 *  on the rectangle of the block's own area. */
export function addPerthWestBlock(out: WestBatches, b: WaverleyArea, base: number, height: number, detail: WestDetail): void {
  const kind = b.tags.building ?? b.tags['building:part'] ?? 'yes', mapped = b.tags['roof:shape'], form = mapped ? undefined : PERTH_WEST_ROOF_SHAPE[kind];
  const tags = form ? {...b.tags, 'roof:shape': form} : b.tags;
  const {color, roofColor} = cityBlockColours(b.id), tone = PERTH_ROOF_TONES[perthRoofTone(roofColor[0])]!;
  const slate: Rgb = [roofColor[0] * tone[0], roofColor[1] * tone[1], roofColor[2] * tone[2]];
  const plain = b.minHeight > 0 || ringArea(b.outer) < PLAIN_AREA || PERTH_WEST_PLAIN_KINDS.has(kind);
  const simple = detail !== 'full' && b.minHeight === 0 && b.holes.length === 0 && !tags['roof:height'] && !tags['roof:levels'];
  const rect = simple ? rectOf(b.outer, detail === 'box') : undefined, box = rect && (detail === 'box' || rect.ratio <= RECT_RATIO) ? rect : undefined;
  const src: WaverleyArea = {...b, height, tags, ...(box ? {outer: rectRing(box), holes: []} : {})};
  const plan = roofPlan(src, base), planes = plan.shape === 'planes';
  const hipped = tags['roof:shape'] === 'hipped' && box !== undefined && box.L > box.W * 1.05;
  if (box && [undefined, 'gabled', 'hipped'].includes(tags['roof:shape']) && addRect(out, box, plan, hipped, base, color, slate, plain)) return;
  const outer = planes ? withCreases(src.outer, plan.creases) : src.outer, holes = planes ? src.holes.map(h => withCreases(h, plan.creases)) : src.holes;
  const foot = () => b.minHeight ? base + b.minHeight : base - .15;
  walls(plain ? out.plain : out.walls, outer, holes, foot, planes ? plan.at : () => plan.eave, color);
  const from = out.tops.colors.length;
  if (planes) roofSurface(out.tops, src.outer, src.holes, plan);
  else { fillSurface(out.tops, src.outer, src.holes, () => plan.eave); if (plan.shape !== 'flat') roofPeak(out.tops, src.outer, plan); }
  for (let i = from; i < out.tops.colors.length; i += 3) { out.tops.colors[i]! *= slate[0]; out.tops.colors[i + 1]! *= slate[1]; out.tops.colors[i + 2]! *= slate[2]; }
  if (detail === 'full') for (const c of plan.chimneys) chimney(out.plain, c, plan.u, plan.eave, color);
}

export interface PerthWestOptions {
  /** Blocks drawn by something else, by id. */
  omitBuildingIds?: Iterable<string>;
  /** How the detail follows the distance (default PERTH_WEST_DETAIL). */
  detail?: WestDetailRule;
  /** A block's height and its basis (default perthWestHeight). */
  height?: (b: WaverleyArea) => {height: number; basis: 'OSM' | 'LiDAR' | 'ASSUMED'};
}
export interface PerthWestBuildings {
  /** `perth-west-buildings`: the three draws, PERTH_WEST_MESHES. */
  group: THREE.Group;
  stats: {triangles: number; drawCalls: number};
  /** The blocks drawn, in data order. */
  buildingIds: string[];
  /** How many drawn blocks stand at an OSM, a LiDAR or an ASSUMED height. */
  heightBasis: {OSM: number; LiDAR: number; ASSUMED: number};
  /** How many drawn blocks are at each detail. */
  detail: Record<WestDetail, number>;
  dispose(): void;
}

/** The west blocks, merged into three draws, each footprint on the lowest ground under it (`ground.rangeUnder`, as the context city). `ground`
 *  is the drawn west terrain (and the context's where a block stands on both). */
export function buildPerthWestBuildings(data: Pick<WaverleyScene, 'buildings'>, ground: Pick<Terrain, 'rangeUnder'>, options: PerthWestOptions = {}): PerthWestBuildings {
  const group = new THREE.Group(); group.name = 'perth-west-buildings';
  const stats = {triangles: 0, drawCalls: 0}, geometries = new Set<THREE.BufferGeometry>(), add = meshAdder(stats, geometries);
  const omitted = new Set(options.omitBuildingIds ?? []), rule = options.detail ?? PERTH_WEST_DETAIL, heightOf = options.height ?? ((b: WaverleyArea) => perthWestHeight(b));
  const out = westBatches(), buildingIds: string[] = [], heightBasis = {OSM: 0, LiDAR: 0, ASSUMED: 0}, detail: Record<WestDetail, number> = {full: 0, lean: 0, box: 0};
  for (const b of data.buildings) {
    if (omitted.has(b.id)) continue;
    buildingIds.push(b.id);
    const h = heightOf(b), d = perthWestDetail(b, rule); heightBasis[h.basis]++; detail[d]++;
    addPerthWestBlock(out, b, ground.rangeUnder(b.outer, 4).min, h.height, d);
  }
  // The context city's own materials (perth-city.ts, waverley-city.ts): Perth's stone and ashlar tints, the slate darkened as the town's roofs are
  const sandstone = cityMaterial('stone').clone() as THREE.MeshLambertMaterial; sandstone.color.setHex(PERTH_CITY_STONE); sandstone.vertexColors = true;
  const ashlar = material('stone').clone() as THREE.MeshLambertMaterial; ashlar.color.setHex(PERTH_CITY_ASHLAR); ashlar.vertexColors = true;
  const slate = material('slate').clone() as THREE.MeshLambertMaterial; slate.color.multiply(new THREE.Color(0xada99f)); slate.color.multiplyScalar(TOWN_LOOK.roofs); slate.vertexColors = true;
  add(group, out.walls, sandstone, PERTH_WEST_MESHES.walls); add(group, out.plain, ashlar, PERTH_WEST_MESHES.ashlar); add(group, out.tops, slate, PERTH_WEST_MESHES.tops);
  let disposed = false;
  return {group, stats, buildingIds, heightBasis, detail, dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const g of geometries) g.dispose(); sandstone.dispose(); ashlar.dispose(); slate.dispose(); group.clear(); }};
}

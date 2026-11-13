// P3 west extension (web/src/perth-west-cover.ts; the west terrain tile itself is perth-west-ground.ts): the ground cover over the west terrain (PERTH_WEST_EXTENT, tools/perth-west-extent.ts): OSM land use, streets, the
// trunk roads and motorways drawn as dual carriageways, and the mapped and filled trees, from data/perth-city-landuse-west.json
// (tools/build-perth-west-landuse.ts). Pure functions for the scene's integration to call; nothing here is wired into a scene.
// - Ground and trees: Waverley's ground builder (waverley-city-ground.ts) on a drape over the west terrain, with the context's drape
//   tolerance and tree fill (perth-city-features.ts), its gardens over the residential land (perth-gardens.ts) and a canvas of about
//   the context's texel density (PERTH_WEST_CANVAS). One draped mesh and one instanced draw for every tree (the mapped trees join the
//   wood trees' batch, `mappedWithMassed`): two draws.
// - The trunk roads: the two carriageways of a dual carriageway are two one-way ways in OSM, each painted at its own width (the OSM
//   width tag; else its lanes times the UK lane width plus hard strips, ASSUMED: tools/build-perth-west-landuse.ts trunkWidth); the gap
//   between them is the central reserve. They are painted with the streets, so they add no triangles; trees keep clear of them
//   (trunkClearance), as they do of a building.
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {buildWaverleyCityGround, decodeLanduse, Footprints} from './waverley-city-ground.ts';
import type {GardenPaint, Landuse, LanduseFile, OpenGround, WaverleyCityGround} from './waverley-city-ground.ts';
import {PERTH_WEST_FILE as WEST_TERRAIN_FILE} from './perth-west-ground.ts';
import {perthGardens, streetIndex} from './perth-gardens.ts';
import {PERTH_DRAPE, PERTH_FILL_STEP} from './perth-city-features.ts';
import {PERTH_ROCK_TONES} from './perth-woodland.ts';
import file from './data/perth-city-landuse-west.json' with {type: 'json'};

/** Texels across the west extent's x span. W4 review (2026-11-13: the near drape 25-40 px a texel 250-300 m off, from pt-west-broxden): as
 *  fine as the 2,048 px cap lets the extent's long side be, 1,469 x 2,047 texels, 0.72 a metre (was 1,024 across, 0.50; the context's
 *  is 0.54). The open land, most of what the near views see, is not on the canvas at all (OPEN_LAND). */
export const PERTH_WEST_CANVAS = 1469;
/** W4 review (2026-11-13, pt-west-broxden: past the A9 the drape's farmland was a flat lime with a hard straight edge against the
 *  backdrop's olive patchwork, ruled by grey stripes, the unmapped strips between the mapped fields painted as paving). The open land is
 *  left to the west tile under the drape (perth-west-ground.ts), which draws it as the skirt beyond it does, in the field tone under the
 *  LAND_FIELDS patchwork: one surface out to the haze, so there is no edge. Open: a node of the tile's lattice in the 'field' class (OSM
 *  farmland, or no mapped land use at all), with no building or mapped roof within `clear` m (a yard, a car park or a forecourt round
 *  the buildings keeps the drape's paving). ASSUMED distance. */
export const OPEN_LAND = {clear: 24} as const;
/** The tile's open nodes (OPEN_LAND), for the drape to be cut out over. */
export function perthWestOpen(rings: readonly (readonly Pt[])[]): OpenGround {
  const g = WEST_TERRAIN_FILE.grids[0]!, field = WEST_TERRAIN_FILE.classNames.indexOf('field'), c = OPEN_LAND.clear, cell = c;
  const near = new Map<string, Pt[]>(), key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const r of rings) for (let k = 0; k < r.length; k++) { // every vertex, and the edges' points every `c` m, so a long wall counts too
    const a = r[k]!, b = r[(k + 1) % r.length]!, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / c));
    for (let t = 0; t < n; t++) { const p: Pt = [a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n], q = key(p[0], p[1]); let l = near.get(q); if (!l) near.set(q, l = []); l.push(p); }
  }
  const built = (x: number, z: number) => { const i = Math.floor(x / cell), j = Math.floor(z / cell);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const p of near.get(`${i + di},${j + dj}`) ?? []) if (Math.hypot(p[0] - x, p[1] - z) < c) return true;
    return false; };
  const open = new Uint8Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i; if (Number(WEST_TERRAIN_FILE.classes[k]) !== field) continue;
    if (!built(g.x0 + i * g.step, g.z0 + j * g.step)) open[k] = 1;
  }
  return {x0: g.x0, z0: g.z0, step: g.step, nx: g.nx, nz: g.nz, open};
}
/** How a trunk way's width was found (tools/build-perth-west-landuse.ts trunkWidth). */
export type TrunkBasis = 'OSM width' | 'OSM lanes' | 'ASSUMED';
/** One highway=motorway or trunk way (or its slip road or roundabout ring) as the file holds it; `line` is delta integers at the block's `q`. */
export interface TrunkWayFile {id: string; hw: string; ref: string; name: string; lanes: number; width: number; basis: TrunkBasis; oneway: boolean; dual: boolean; roundabout: boolean; bridge: boolean; line: number[]}
export interface RoundaboutFile {ways: string[]; ref: string; name: string; hw: string; lanes: number; x: number; z: number; radius: number; closed: boolean}
export interface JunctionFile {id: string; ref: string; name: string; x: number; z: number}
export interface TrunkBlock {q: number; basis: string; assumed: {lane: number; hardStrip: number; hardShoulder: number; slipMin: number}; ways: TrunkWayFile[]; junctions: JunctionFile[]; roundabouts: RoundaboutFile[]}
/** The west land-use file: the context file's layout (LanduseFile) and `residential`, less the Tay's bridges, plus the trunk block. */
export interface PerthWestFile extends LanduseFile {attribution: string; source: string; residential: number[][][]; trunk: TrunkBlock}
/** A trunk or motorway way in metres of the Perth frame. */
export interface TrunkRoad extends Omit<TrunkWayFile, 'line'> {line: Pt[]}

/** The trunk block's ways, decoded (delta integers at the block's q, as the land-use file's own lines are). */
export function decodeTrunk(block: Pick<TrunkBlock, 'q' | 'ways'>): TrunkRoad[] {
  return block.ways.map(({line, ...way}) => {
    const out: Pt[] = []; let x = 0, z = 0;
    for (let i = 0; i < line.length; i += 2) { x += line[i]!; z += line[i + 1]!; out.push([x * block.q, z * block.q]); }
    return {...way, line: out};
  });
}
export interface PerthWest {
  /** The ground the painter reads: the file's areas, streets, paths, trees and cliffs, with every trunk way added to the streets at its own width. */
  landuse: Landuse;
  trunk: TrunkRoad[];
  roundabouts: RoundaboutFile[];
  junctions: JunctionFile[];
  /** landuse=residential rings (they are also in `landuse.areas.park`): the gardens are painted over them. */
  residential: Pt[][][];
}
/** Decode a west land-use file. The trunk ways join `landuse.roads`, which the painter sorts by width, so a wider carriageway runs over a narrower street. */
export function decodePerthWest(f: PerthWestFile): PerthWest {
  const base = decodeLanduse(f), trunk = decodeTrunk(f.trunk);
  return {
    landuse: {...base, roads: [...base.roads, ...trunk.map(t => ({width: t.width, line: t.line}))]},
    trunk, roundabouts: f.trunk.roundabouts, junctions: f.trunk.junctions,
    residential: decodeLanduse({...f, areas: {park: f.residential} as unknown as LanduseFile['areas']}).areas.park,
  };
}
export const PERTH_WEST_FILE = file as unknown as PerthWestFile;
export const PERTH_WEST: PerthWest = decodePerthWest(PERTH_WEST_FILE);
export const PERTH_WEST_LANDUSE: Landuse = PERTH_WEST.landuse;

/** The outline of a carriageway: the polyline's two edges `half` m out (mitred where it turns, the mitre held to twice `half`), as one ring. */
export function ribbon(line: readonly Pt[], half: number): Pt[] {
  if (line.length < 2) return [];
  const unit = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const left: Pt[] = [], right: Pt[] = [];
  line.forEach((p, i) => {
    const t0 = i > 0 ? unit(line[i - 1]!, p) : unit(p, line[i + 1]!), t1 = i < line.length - 1 ? unit(p, line[i + 1]!) : t0;
    // the join's normal is the mean of the two segments' normals, lengthened by 1 / cos(half the turn), at most twice
    let nx = -(t0[1] + t1[1]), nz = t0[0] + t1[0]; const l = Math.hypot(nx, nz);
    if (l < 1e-9) { nx = -t0[1]; nz = t0[0]; } else { nx /= l; nz /= l; }
    const cos = Math.max(.5, nx * -t0[1] + nz * t0[0]), r = half / cos;
    left.push([p[0] + nx * r, p[1] + nz * r]); right.push([p[0] - nx * r, p[1] - nz * r]);
  });
  return [...left, ...right.reverse()];
}
/** The rings trees keep clear of: each trunk carriageway and a verge of `verge` m (ASSUMED) either side. Pass them to the Footprints of
 *  buildPerthWestCover, with the buildings' outlines. */
export function trunkClearance(trunk: readonly TrunkRoad[] = PERTH_WEST.trunk, verge = 2): Pt[][] {
  return trunk.map(t => ribbon(t.line, t.width / 2 + verge)).filter(r => r.length >= 3);
}

let gardens: GardenPaint | undefined;
/** The garden paint over the west's residential land (perth-gardens.ts, with the west's streets and extent), built once. */
export function perthWestGardens(west: PerthWest = PERTH_WEST): GardenPaint {
  if (west !== PERTH_WEST) return perthGardens(west.residential, {extent: west.landuse.extent, streets: streetIndex(west.landuse.roads)});
  return gardens ??= perthGardens(west.residential, {extent: west.landuse.extent, streets: streetIndex(west.landuse.roads)});
}
/** The west ground cover, trees and trunk roads on `ground` (the west terrain, whose extent is the file's): the draped cover (one draw)
 *  and the trees (one instanced draw: the mapped trees are drawn with the wood). `footprints` are the outlines trees keep clear of (the west buildings and roofs; the trunk
 *  carriageways are added here); `uncovered` is ground another element draws itself, as in buildWaverleyCityGround. The meshes are named
 *  perth-west-*, not waverley-*, so they stay apart from the context's in one scene. */
export function buildPerthWestCover(ground: Terrain, footprints: Footprints, uncovered?: (x: number, z: number) => boolean, west: PerthWest = PERTH_WEST,
  open: OpenGround | null = perthWestOpen(footprints.rings)): WaverleyCityGround {
  const keep = new Footprints([...footprints.rings, ...trunkClearance(west.trunk)]);
  const cover = buildWaverleyCityGround(ground, keep, west.landuse, {fillStep: PERTH_FILL_STEP, woodTrunks: false, drape: PERTH_DRAPE, rockTones: PERTH_ROCK_TONES, gardens: perthWestGardens(west), canvasWidth: PERTH_WEST_CANVAS, mappedWithMassed: true, uncovered, ...open ? {open} : {}});
  cover.group.name = 'perth-west-cover';
  cover.group.traverse(o => { if (o.name.startsWith('waverley-')) o.name = `perth-west-${o.name.slice('waverley-'.length)}`; });
  return cover;
}

// Builds web/src/data/kx-terrain.json: the ground under King's Cross, from the Environment Agency's LIDAR DTM.
//
//   node tools/build-terrain.ts [--raw ~/kx-data/terrain] [--out web/src/data/kx-terrain.json] [--report <file.json>] [--profile]
//
// DATA. Environment Agency "LIDAR Composite DTM 1m" (bare earth, 1 m posts, heights in metres above Ordnance
// Datum Newlyn), Open Government Licence v3, from the Defra data services WCS
// https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs . One
// GetCoverage request covers the whole model (about 25 MB, uncompressed float32 GeoTIFF in EPSG:27700); it is
// saved under --raw and reused, never committed. The page credits "Contains Environment Agency information
// (c) Environment Agency and/or database right 2026". Position: the model's equirectangular frame is mapped to
// National Grid with the Ordnance Survey OSTN15 grid (as the PROJ project ships it: uk_os_OSTN15_NTv2_OSGBtoETRS.tif,
// from cdn.proj.org, BSD-2-clause) so the DTM lines up with OpenStreetMap to a few centimetres.
//
// WHAT IS DONE TO THE NUMBERS. The model puts every rail at y = 0 and the ground at GROUND_Y = -0.2 everywhere
// (trains, track, signals and motion all assume it), but the real railway climbs and falls: from the buffers
// (16.8 m AOD) to the Gasworks Tunnel's south mouth it drops about 2.2 m (14.6 m AOD), then rises to 18.9 m AOD
// at the tunnel's north mouth and 21.9 m AOD, 5.3 m above the buffers, at the Copenhagen Tunnel's south mouth
// (`--profile` prints the table every 25 m). Re-levelling the railway is a separate decision, so the ground is
// re-levelled instead:
//   1. DATUM. y = AOD - datumAod, where the ground at the King's Cross buffer stops (the DTM there is
//      interpolated under the shed roof) is GROUND_Y and the rail head y = 0.
//   2. RAIL LEVEL. Every open rail node gets the DTM under it (median of 3 x 3 samples, 2 m apart); the nodes of
//      shallow tunnels (OSM layer -1) get a harmonic fill from the open nodes they join. A rail is therefore
//      "where the real rail is, above the buffers' datum".
//   3. WARP. y_ground = DTM - datumAod - A(d) * shift: `shift` is the soft-minimum-weighted mean of the rail levels
//      of the nearest rails (weights exp(-(d - dmin) / 15 m), only rails within dmin + 75 m); A is 1 within 50 m of a
//      rail, fading with a smoothstep to 0 at 200 m. Near a railway the land is moved up or down by the railway's
//      own offset, so a cutting keeps its real depth and a tunnel its real cover whatever the model's rails do;
//      200 m away the ground is at the true height again.
//   4. FLOOR. Within 3.5 m of an open rail (and under surface platforms), blending out over 4 m, the ground is
//      exactly GROUND_Y: the ballast bed. Ends of open rails that meet a tunnel stop at the portal's plane.
//   5. FEATHER. The outer 150 m of the extent fade to GROUND_Y, so the flat plane outside is seamless.
// The outcome and the real numbers are printed by this tool (--report writes them as JSON).
//
// FILE. A few grids, coarse first (core/terrain.ts has the format): 8 m everywhere, 4 m along the railway,
// 2 m and 1 m at the tunnel mouths. A finer grid is blended into its parent over its outer ring, so the surface is
// continuous. Heights are stored to 5 cm (10 cm for the 8 m grid).
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createTerrain, decodeGrid, encodeGrid, sampleGrid } from '../core/terrain.ts';
import type { Extent, Grid, GridFile, TerrainFile } from '../core/terrain.ts';
import { ORIGIN, unproject } from '../core/geo.ts';
import type { Pt } from '../core/geo.ts';
import type { KxData, Rail } from '../core/osm.ts';
import { shedBufferStops, shedLayout } from '../core/station.ts';
import { FIGURES, tunnelMouths } from '../core/landmarks.ts';
import type { Mouth } from '../core/landmarks.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import type { GeoTiff, Ostn15 } from './terrain-source.ts';

export const GROUND_Y = -0.2; // web/src/world.ts: GROUND_Y (a test pins the two together)
export const EXTENT: Extent = { x0: -704, z0: -1984, x1: 896, z1: 576 };
/** National Grid box fetched from the EA: the extent plus a margin (the tool checks that it holds the extent). */
export const BNG_BOX = { e0: 529410, e1: 531230, n0: 182315, n1: 185070 };
export const WCS = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs';
export const COVERAGE = '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m';
export const OSTN_URL = 'https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif';
export const ATTRIBUTION = 'Contains Environment Agency information © Environment Agency and/or database right 2026. Open Government Licence v3.0.';

const FEATHER = 150; // m
const WARP_STEP = 4; // m, the raster the warp is kept on
const D_FULL = 50; // m, warp at full strength within this distance of a rail
const D_NONE = 200; // m, no warp beyond this
const LAMBDA = 15; // m, soft-minimum length
const REACH = 75; // m, rails further than dmin + REACH do not count
const FLOOR_FULL = 3.5; // m
const FLOOR_FADE = 4; // m

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---- raw data ------------------------------------------------------------------------------------

async function fetchTo(url: string, file: string): Promise<Uint8Array> {
  if (existsSync(file)) return new Uint8Array(await readFile(file));
  console.error(`fetching ${url}`);
  const res = await fetch(url, { headers: { 'user-agent': 'kings-cross-model build-terrain (no credentials)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

export async function loadSources(rawDir: string): Promise<{ dtm: GeoTiff; ostn: Ostn15 }> {
  const ostn = { grid: readGeoTiff(await fetchTo(OSTN_URL, path.join(rawDir, 'uk_os_OSTN15_NTv2_OSGBtoETRS.tif'))) };
  const b = BNG_BOX;
  const url = `${WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${COVERAGE}&format=image/tiff&subset=E(${b.e0},${b.e1})&subset=N(${b.n0},${b.n1})`;
  const dtm = readGeoTiff(await fetchTo(url, path.join(rawDir, 'dtm', `kx-dtm1m-E${b.e0}-N${b.n0}.tif`)));
  return { dtm, ostn };
}

// ---- the DTM in the model frame ------------------------------------------------------------------

export interface Dtm {
  /** National Grid easting, northing of a model point (a 16 m lattice of the exact OSTN15 mapping, bilinear between) */
  en(x: number, z: number): [number, number];
  /** DTM height, metres AOD, bilinear between 1 m posts; NaN outside the tile or on no-data */
  at(x: number, z: number): number;
  /** mean of a k x k lattice over the square of side `step` centred on the point */
  avg(x: number, z: number, step: number): number;
  stats: { cells: number; nodata: number; min: number; max: number; mean: number };
  /** largest difference between the lattice mapping and the exact one over sampled points, metres */
  enError: number;
}

export function makeDtm(dtm: GeoTiff, ostn: Ostn15, extent: Extent): Dtm {
  const H = 16;
  const x0 = extent.x0 - 2 * H;
  const z0 = extent.z0 - 2 * H;
  const nx = Math.ceil((extent.x1 - extent.x0) / H) + 5;
  const nz = Math.ceil((extent.z1 - extent.z0) / H) + 5;
  const E = new Float64Array(nx * nz);
  const N = new Float64Array(nx * nz);
  const exact = (x: number, z: number): [number, number] => {
    const { lat, lon } = unproject(x, z, ORIGIN);
    return etrs89ToGrid(ostn, lat, lon);
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [e, n] = exact(x0 + i * H, z0 + j * H);
      E[j * nx + i] = e;
      N[j * nx + i] = n;
    }
  }
  const en = (x: number, z: number): [number, number] => {
    const fx = (x - x0) / H;
    const fz = (z - z0) / H;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = fx - i;
    const tz = fz - j;
    const o = j * nx + i;
    const lerp = (a: Float64Array): number => a[o]! * (1 - tx) * (1 - tz) + a[o + 1]! * tx * (1 - tz) + a[o + nx]! * (1 - tx) * tz + a[o + nx + 1]! * tx * tz;
    return [lerp(E), lerp(N)];
  };
  let enError = 0;
  for (let k = 0; k < 200; k++) {
    const x = extent.x0 + ((k * 7919) % 1600);
    const z = extent.z0 + ((k * 104729) % 2560);
    const a = exact(x + 0.37, z + 0.61);
    const b = en(x + 0.37, z + 0.61);
    enError = Math.max(enError, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  const band = dtm.bands[0] as Float32Array;
  const [ax, bx, , ay, , fy] = dtm.affine;
  const nodata = dtm.nodata;
  const cell = (r: number, c: number): number => {
    const v = band[Math.max(0, Math.min(dtm.height - 1, r)) * dtm.width + Math.max(0, Math.min(dtm.width - 1, c))] as number;
    return v === nodata || !Number.isFinite(v) ? Number.NaN : v;
  };
  const atEN = (e: number, n: number): number => {
    const col = (e - ax) / bx - 0.5;
    const row = (n - ay) / fy - 0.5;
    if (col < -1 || row < -1 || col > dtm.width || row > dtm.height) return Number.NaN;
    const c = Math.floor(col);
    const r = Math.floor(row);
    const fc = col - c;
    const fr = row - r;
    return cell(r, c) * (1 - fc) * (1 - fr) + cell(r, c + 1) * fc * (1 - fr) + cell(r + 1, c) * (1 - fc) * fr + cell(r + 1, c + 1) * fc * fr;
  };
  const at = (x: number, z: number): number => {
    const [e, n] = en(x, z);
    return atEN(e, n);
  };
  const avg = (x: number, z: number, step: number): number => {
    const k = Math.max(1, Math.round(step / 2));
    let s = 0;
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < k; i++) s += at(x + ((i + 0.5) / k - 0.5) * step, z + ((j + 0.5) / k - 0.5) * step);
    }
    return s / (k * k);
  };
  let nod = 0;
  let mn = Infinity;
  let mx = -Infinity;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < band.length; i++) {
    const v = band[i] as number;
    if (v === nodata || !Number.isFinite(v)) nod++;
    else {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
      cnt++;
    }
  }
  return { en, at, avg, stats: { cells: band.length, nodata: nod, min: mn, max: mx, mean: sum / cnt }, enError };
}

// ---- the rails -----------------------------------------------------------------------------------

export interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** rail level (m, relative to the datum ground) at each end */
  ra: number;
  rb: number;
  /** the end node is a tunnel portal: the floor does not run past it */
  capA: boolean;
  capB: boolean;
  len: number;
}

export interface RailField {
  /** segments that warp the ground: open rails and shallow tunnels */
  warp: Seg[];
  /** segments that get a floor: open rails */
  floor: Seg[];
  /** rail level of every node used, m above the datum ground (AOD - datumGround) */
  level: Map<number, number>;
  /** nodes whose level came from the DTM under them */
  known: Set<number>;
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export function buildRailField(data: Pick<KxData, 'nodes' | 'rails'>, dtm: Dtm, datumGround: number): RailField {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z]]));
  const isOpen = (r: Rail): boolean => !r.tunnel && !r.bridge;
  const isShallowTunnel = (r: Rail): boolean => r.tunnel && r.layer >= -1;
  const openNodes = new Set<number>();
  const tunnelNodes = new Set<number>();
  const adj = new Map<number, number[]>();
  for (const r of data.rails) {
    const open = isOpen(r);
    if (!open && !isShallowTunnel(r)) continue;
    for (const n of r.nodes) (open ? openNodes : tunnelNodes).add(n);
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = r.nodes[i] as number;
      const b = r.nodes[i + 1] as number;
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }
  }
  // an open node within 12 m of a tunnel node is at a mouth: the DTM there straddles the cliff of the portal, so its level is filled in instead
  const tunnelPts = [...tunnelNodes].map((n) => pos.get(n) as Pt);
  const atMouth = (p: Pt): boolean => tunnelPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 12);
  const level = new Map<number, number>();
  const known = new Set<number>();
  for (const n of openNodes) {
    const [x, z] = pos.get(n) as Pt;
    if (tunnelNodes.has(n) || atMouth([x, z])) continue;
    const v: number[] = [];
    for (const dz of [-2, 0, 2]) for (const dx of [-2, 0, 2]) {
      const h = dtm.at(x + dx, z + dz);
      if (Number.isFinite(h)) v.push(h);
    }
    if (!v.length) continue;
    level.set(n, median(v) - datumGround);
    known.add(n);
  }
  // light median along each open way: a single node on a bridge abutment or under a roof should not stand out
  const smoothed = new Map<number, number>();
  for (const r of data.rails) {
    if (!isOpen(r) || r.nodes.length < 3) continue;
    for (let i = 1; i + 1 < r.nodes.length; i++) {
      const a = level.get(r.nodes[i - 1] as number);
      const b = level.get(r.nodes[i] as number);
      const c = level.get(r.nodes[i + 1] as number);
      if (a !== undefined && b !== undefined && c !== undefined && !smoothed.has(r.nodes[i] as number)) smoothed.set(r.nodes[i] as number, median([a, b, c]));
    }
  }
  for (const [n, v] of smoothed) level.set(n, v);
  // harmonic fill (inverse-distance weights over the rail graph) of every node without a level: tunnels and mouths
  const unknown = [...new Set([...openNodes, ...tunnelNodes])].filter((n) => !known.has(n));
  // only nodes that can reach a known node count; the rest keep no level and their ways are dropped
  const reach = new Set<number>(known);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of unknown) {
      if (reach.has(n)) continue;
      if ((adj.get(n) ?? []).some((m) => reach.has(m))) {
        reach.add(n);
        grew = true;
      }
    }
  }
  const fill = unknown.filter((n) => reach.has(n));
  const mean = [...known].reduce((s, n) => s + (level.get(n) as number), 0) / Math.max(1, known.size);
  for (const n of fill) level.set(n, mean);
  for (let it = 0; it < 20000; it++) {
    let moved = 0;
    for (const n of fill) {
      const p = pos.get(n) as Pt;
      let s = 0;
      let w = 0;
      for (const m of adj.get(n) ?? []) {
        const v = level.get(m);
        if (v === undefined) continue;
        const q = pos.get(m) as Pt;
        const wt = 1 / Math.max(1, Math.hypot(p[0] - q[0], p[1] - q[1]));
        s += v * wt;
        w += wt;
      }
      if (w > 0) {
        const nv = s / w;
        moved = Math.max(moved, Math.abs(nv - (level.get(n) as number)));
        level.set(n, nv);
      }
    }
    if (moved < 1e-6) break;
  }
  // portal nodes: open nodes that a tunnel way also uses
  const portal = new Set<number>();
  for (const r of data.rails) if (isShallowTunnel(r)) for (const n of r.nodes) if (openNodes.has(n)) portal.add(n);
  const warp: Seg[] = [];
  const floor: Seg[] = [];
  for (const r of data.rails) {
    const open = isOpen(r);
    if (!open && !isShallowTunnel(r)) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = r.nodes[i] as number;
      const b = r.nodes[i + 1] as number;
      const la = level.get(a);
      const lb = level.get(b);
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (la === undefined || lb === undefined || !pa || !pb) continue;
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (len < 1e-6) continue;
      const seg: Seg = { ax: pa[0], az: pa[1], bx: pb[0], bz: pb[1], ra: la, rb: lb, capA: false, capB: false, len };
      warp.push(seg);
      if (open) {
        // the floor stops at a portal: a way's end node that a tunnel also uses
        floor.push({ ...seg, capA: i === 0 && portal.has(a), capB: i + 2 === r.nodes.length && portal.has(b) });
      }
    }
  }
  return { warp, floor, level, known };
}

// ---- spatial index over segments -------------------------------------------------------------------

export class SegIndex {
  private readonly cells = new Map<number, Seg[]>();
  private readonly cell: number;
  constructor(segs: readonly Seg[], cell: number, reach: number) {
    this.cell = cell;
    for (const s of segs) {
      const x0 = Math.floor((Math.min(s.ax, s.bx) - reach) / cell);
      const x1 = Math.floor((Math.max(s.ax, s.bx) + reach) / cell);
      const z0 = Math.floor((Math.min(s.az, s.bz) - reach) / cell);
      const z1 = Math.floor((Math.max(s.az, s.bz) + reach) / cell);
      for (let j = z0; j <= z1; j++) {
        for (let i = x0; i <= x1; i++) {
          const k = j * 100003 + i;
          const list = this.cells.get(k);
          if (list) list.push(s);
          else this.cells.set(k, [s]);
        }
      }
    }
  }
  near(x: number, z: number): readonly Seg[] {
    return this.cells.get(Math.floor(z / this.cell) * 100003 + Math.floor(x / this.cell)) ?? [];
  }
}

/** Distance from a point to a segment and the parameter t of the nearest point (clamped to 0..1). */
function toSeg(s: Seg, x: number, z: number): { d: number; t: number; raw: number } {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const raw = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
  const t = Math.max(0, Math.min(1, raw));
  return { d: Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)), t, raw };
}

/** The warp shift (m) at a point: A(dmin) times the soft-minimum-weighted mean of the nearest rails' levels. */
export function shiftAt(index: SegIndex, x: number, z: number): { shift: number; dmin: number } {
  const segs = index.near(x, z);
  let dmin = Infinity;
  const ds: number[] = [];
  const rs: number[] = [];
  for (const s of segs) {
    const { d, t } = toSeg(s, x, z);
    ds.push(d);
    rs.push(s.ra + (s.rb - s.ra) * t);
    if (d < dmin) dmin = d;
  }
  if (!(dmin < D_NONE)) return { shift: 0, dmin };
  let sw = 0;
  let sr = 0;
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i] as number;
    if (d > dmin + REACH) continue;
    const w = Math.exp(-(d - dmin) / LAMBDA);
    sw += w;
    sr += w * (rs[i] as number);
  }
  const a = 1 - smooth((dmin - D_FULL) / (D_NONE - D_FULL));
  return { shift: (a * sr) / sw, dmin };
}

/** Floor weight at a point: 1 on the track bed, 0 beyond FLOOR_FULL + FLOOR_FADE from an open rail. */
export function floorWeight(index: SegIndex, platforms: readonly { pts: Pt[] }[], x: number, z: number): number {
  let d = Infinity;
  for (const s of index.near(x, z)) {
    const r = toSeg(s, x, z);
    // the floor stops at a portal's plane
    if ((r.raw < 0 && s.capA) || (r.raw > 1 && s.capB)) continue;
    if (r.d < d) d = r.d;
  }
  for (const p of platforms) {
    const e = polygonDistance(p.pts, x, z);
    if (e < d) d = e;
  }
  return 1 - smooth((d - FLOOR_FULL) / FLOOR_FADE);
}

function polygonDistance(pts: readonly Pt[], x: number, z: number): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Pt;
    const b = pts[j] as Pt;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
    if (d < best) best = d;
  }
  // a platform's edge is its face: the floor is 1 m beyond it, so treat the outline as 1 m closer
  return inside ? 0 : Math.max(0, best - 1);
}

// ---- the field and the grids -----------------------------------------------------------------------

export interface GridSpec {
  name: string;
  step: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** metres per stored height unit */
  q: number;
  /** apply the floor flatten (needs a step of 4 m or less to resolve a track bed) */
  floor: boolean;
  /** width of the ring over which the grid is blended into its parent */
  blend: number;
}

export function gridSpecs(mouths: { id: string; origin: Pt }[]): GridSpec[] {
  const e = EXTENT;
  const specs: GridSpec[] = [{ name: 'base 8 m', step: 8, x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, q: 0.1, floor: false, blend: 0 }];
  // the city, the throat and the cutting: 4 m resolves a cutting side, the canal's banks and a track bed
  specs.push({ name: 'city 4 m', step: 4, x0: -540, z0: -1500, x1: 700, z1: 380, q: 0.1, floor: true, blend: 16 });
  for (const m of mouths) {
    const cx = Math.round(m.origin[0] / 2) * 2;
    const cz = Math.round(m.origin[1] / 2) * 2;
    specs.push({ name: `mouth ${m.id} 2 m`, step: 2, x0: cx - 80, z0: cz - 80, x1: cx + 80, z1: cz + 80, q: 0.05, floor: true, blend: 12 });
    specs.push({ name: `mouth ${m.id} 1 m`, step: 1, x0: cx - 48, z0: cz - 48, x1: cx + 48, z1: cz + 48, q: 0.05, floor: true, blend: 8 });
  }
  return specs;
}

export interface BuildInputs {
  dtm: Dtm;
  datumGround: number;
  warpIndex: SegIndex;
  floorIndex: SegIndex;
  platforms: readonly { pts: Pt[] }[];
  mouths: readonly Pick<Mouth, 'origin' | 'axis' | 'across' | 'halfWidth'>[];
  extent: Extent;
}

/** Ground over a tunnel's first metres is at least this high, so the bores' crowns are always under earth (see the mouth rule below). */
export const MOUTH_COVER = FIGURES.tunnel.crown + 1.2;

/**
 * The DTM is a 1 m raster of a face that is a cliff: it blurs the portal into a ramp that runs 4 to 8 m up behind the
 * face, lower than a bore's crown. Behind a portal face (w >= 1 m into the tunnel, across the face and a little beyond)
 * the ground is at least MOUTH_COVER, which fades out 10 to 16 m in. The face wall and its block (web/src/portals.ts)
 * stand where the ramp used to begin.
 */
export function mouthLift(m: BuildInputs['mouths'][number], x: number, z: number, y: number): number {
  const dx = x - m.origin[0];
  const dz = z - m.origin[1];
  const w = dx * m.axis[0] + dz * m.axis[1];
  if (w < 0.5 || w > 16 || y >= MOUTH_COVER) return y;
  const lat = dx * m.across[0] + dz * m.across[1];
  const a = Math.abs(lat) - (m.halfWidth + 1.5);
  if (a > 4.5) return y;
  const mask = (1 - smooth(a / 4.5)) * smooth(w - 0.5) * (1 - smooth((w - 10) / 6));
  return y + (MOUTH_COVER - y) * mask;
}

/** The re-levelled ground height at one point (before the finer grids are blended into their parents). */
export function fieldAt(inp: BuildInputs, x: number, z: number, step: number, floor: boolean, shiftRaster?: ShiftRaster): number {
  const e = inp.extent;
  const edge = Math.min(x - e.x0, e.x1 - x, z - e.z0, e.z1 - z);
  const fw = smooth(edge / FEATHER);
  if (fw <= 0) return GROUND_Y;
  const shift = shiftRaster ? shiftRaster.at(x, z) : shiftAt(inp.warpIndex, x, z).shift;
  let y = inp.dtm.avg(x, z, step) - inp.datumGround + GROUND_Y - shift;
  if (!Number.isFinite(y)) y = GROUND_Y;
  y = GROUND_Y + fw * (y - GROUND_Y);
  if (floor) {
    const wf = floorWeight(inp.floorIndex, inp.platforms, x, z);
    if (wf > 0) y += wf * (GROUND_Y - y);
  }
  for (const m of inp.mouths) y = mouthLift(m, x, z, y);
  return y;
}

/** The warp shift on a regular raster, interpolated: it is smooth, and the same raster serves every grid. */
export class ShiftRaster {
  readonly nx: number;
  readonly nz: number;
  readonly v: Float32Array;
  readonly dmin: Float32Array;
  private readonly extent: Extent;
  private readonly step: number;
  constructor(extent: Extent, index: SegIndex, step = WARP_STEP) {
    this.extent = extent;
    this.step = step;
    this.nx = Math.round((extent.x1 - extent.x0) / step) + 1;
    this.nz = Math.round((extent.z1 - extent.z0) / step) + 1;
    this.v = new Float32Array(this.nx * this.nz);
    this.dmin = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const r = shiftAt(index, extent.x0 + i * step, extent.z0 + j * step);
        this.v[j * this.nx + i] = r.shift;
        this.dmin[j * this.nx + i] = Number.isFinite(r.dmin) ? r.dmin : 9999;
      }
    }
  }
  at(x: number, z: number): number {
    const fx = (x - this.extent.x0) / this.step;
    const fz = (z - this.extent.z0) / this.step;
    const i = Math.max(0, Math.min(this.nx - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));
    const o = j * this.nx + i;
    return this.v[o]! * (1 - tx) * (1 - tz) + this.v[o + 1]! * tx * (1 - tz) + this.v[o + this.nx]! * (1 - tx) * tz + this.v[o + this.nx + 1]! * tx * tz;
  }
}

/** Heights of one grid, blended into the grids already built over its outer ring. */
export function buildGrid(spec: GridSpec, inp: BuildInputs, raster: ShiftRaster, parents: Grid[]): Float32Array {
  const nx = Math.round((spec.x1 - spec.x0) / spec.step) + 1;
  const nz = Math.round((spec.z1 - spec.z0) / spec.step) + 1;
  const h = new Float32Array(nx * nz);
  const parentAt = (x: number, z: number): number => {
    for (let k = parents.length - 1; k >= 0; k--) {
      const g = parents[k] as Grid;
      if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return sampleGrid(g, x, z);
    }
    return GROUND_Y;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = spec.x0 + i * spec.step;
      const z = spec.z0 + j * spec.step;
      let y = fieldAt(inp, x, z, spec.step, spec.floor, raster);
      if (spec.blend > 0) {
        const edge = Math.min(x - spec.x0, spec.x1 - x, z - spec.z0, spec.z1 - z);
        const w = smooth(edge / spec.blend);
        if (w < 1) y = parentAt(x, z) * (1 - w) + y * w;
      }
      h[j * nx + i] = Math.round(y / spec.q) * spec.q;
    }
  }
  return h;
}

// ---- the real profile of the East Coast Main Line ----------------------------------------------------

export interface ProfileRow {
  /** metres along the through track from the buffer stops */
  s: number;
  x: number;
  z: number;
  open: boolean;
  /** DTM under the centre line, m AOD (the ground above, in a tunnel) */
  dtmAod: number;
  /** the rail's own level, m AOD (from the DTM where open, interpolated through a tunnel) */
  railAod: number;
  /** the finished terrain at the centre line, model y */
  terrainY: number;
}

/** One through track of the main line, north from the buffer stops, as a polyline of [node id] with tunnel flags per segment. */
export function ecmlChain(data: Pick<KxData, 'nodes' | 'rails' | 'buffers'>, from: Pt): { ids: number[]; tunnel: boolean[] } {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z]]));
  type Edge = { to: number; tunnel: boolean };
  const adj = new Map<number, Edge[]>();
  for (const r of data.rails) {
    if (r.ref !== 'ECM1' || r.service !== 'main' || r.bridge) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = r.nodes[i] as number;
      const b = r.nodes[i + 1] as number;
      adj.set(a, [...(adj.get(a) ?? []), { to: b, tunnel: r.tunnel }]);
      adj.set(b, [...(adj.get(b) ?? []), { to: a, tunnel: r.tunnel }]);
    }
  }
  let start = -1;
  let best = Infinity;
  for (const id of adj.keys()) {
    const p = pos.get(id) as Pt;
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d < best) { best = d; start = id; }
  }
  const ids = [start];
  const tunnel: boolean[] = [];
  const seen = new Set<number>([start]);
  let heading: Pt = [0, -1];
  for (;;) {
    const here = ids[ids.length - 1] as number;
    const p = pos.get(here) as Pt;
    let pick: Edge | undefined;
    let bestDot = 0.2;
    for (const e of adj.get(here) ?? []) {
      if (seen.has(e.to)) continue;
      const q = pos.get(e.to) as Pt;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l < 1e-6) continue;
      const dot = ((q[0] - p[0]) * heading[0] + (q[1] - p[1]) * heading[1]) / l;
      if (dot > bestDot) { bestDot = dot; pick = e; }
    }
    if (!pick) break;
    const q = pos.get(pick.to) as Pt;
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    heading = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    seen.add(pick.to);
    ids.push(pick.to);
    tunnel.push(pick.tunnel);
  }
  return { ids, tunnel };
}

/** The through track's profile every `every` metres: the real DTM and rail level, and the finished terrain. */
export function profileRows(data: Pick<KxData, 'nodes' | 'rails' | 'buffers'>, built: Built, dtm: Dtm, every = 25): ProfileRow[] {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z]]));
  const chain = ecmlChain(data, [43, -24]);
  const terrain = createTerrain(built.file);
  const rows: ProfileRow[] = [];
  let run = 0;
  let next = 0;
  const datum = built.inputs.datumGround;
  for (let i = 0; i + 1 < chain.ids.length; i++) {
    const a = pos.get(chain.ids[i] as number) as Pt;
    const b = pos.get(chain.ids[i + 1] as number) as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const la = (built.rails.level.get(chain.ids[i] as number) ?? 0) + datum;
    const lb = (built.rails.level.get(chain.ids[i + 1] as number) ?? 0) + datum;
    while (next <= run + len) {
      const t = (next - run) / len;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      rows.push({ s: next, x, z, open: !chain.tunnel[i], dtmAod: dtm.at(x, z), railAod: la + (lb - la) * t, terrainY: terrain.heightAt(x, z) });
      next += every;
    }
    run += len;
  }
  return rows;
}

// ---- main ----------------------------------------------------------------------------------------

export interface Built {
  file: TerrainFile;
  raster: ShiftRaster;
  inputs: BuildInputs;
  rails: RailField;
  report: Record<string, unknown>;
}

export function build(data: KxData, dtm: Dtm): Built {
  const layout = shedLayout(data);
  const stops = shedBufferStops(data, layout);
  const bufferH = stops.map((s) => dtm.at(s.x, s.z));
  const datumGround = bufferH.reduce((s, v) => s + v, 0) / bufferH.length;
  const rails = buildRailField(data, dtm, datumGround);
  const warpIndex = new SegIndex(rails.warp, 64, D_NONE + REACH);
  const floorIndex = new SegIndex(rails.floor, 16, FLOOR_FULL + FLOOR_FADE + 2);
  const platforms = data.platforms.filter((p) => !p.tunnel && (p.layer ?? 0) >= 0);
  const raster = new ShiftRaster(EXTENT, warpIndex);
  const mouths = tunnelMouths(data);
  const inputs: BuildInputs = { dtm, datumGround, warpIndex, floorIndex, platforms, mouths, extent: EXTENT };
  const specs = gridSpecs(mouths);
  const built: Grid[] = [];
  const files: GridFile[] = [];
  for (const spec of specs) {
    const h = buildGrid(spec, inputs, raster, built);
    const nx = Math.round((spec.x1 - spec.x0) / spec.step) + 1;
    const nz = Math.round((spec.z1 - spec.z0) / spec.step) + 1;
    const f = encodeGrid(h, { step: spec.step, x0: spec.x0, z0: spec.z0, nx, nz, q: spec.q });
    files.push(f);
    built.push(decodeGrid(f));
  }
  const file: TerrainFile = {
    attribution: ATTRIBUTION,
    source: 'Environment Agency LIDAR Composite DTM 1m, re-levelled to the model rail datum by tools/build-terrain.ts',
    groundY: GROUND_Y,
    datumAod: Math.round((datumGround - GROUND_Y) * 100) / 100,
    extent: EXTENT,
    grids: files,
  };
  return { file, raster, inputs, rails, report: { bufferH, datumGround } };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const rawDir = flag('--raw') ?? path.join(os.homedir(), 'kx-data', 'terrain');
  const outPath = flag('--out') ?? 'web/src/data/kx-terrain.json';
  const reportPath = flag('--report');
  const data: KxData = JSON.parse(await readFile(new URL('../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const t0 = performance.now();
  const { dtm: tif, ostn } = await loadSources(rawDir);
  const dtm = makeDtm(tif, ostn, EXTENT);
  console.error(`DTM ${tif.width} x ${tif.height}, ${dtm.stats.nodata} no-data cells, ${dtm.stats.min.toFixed(2)}..${dtm.stats.max.toFixed(2)} m AOD (mean ${dtm.stats.mean.toFixed(2)}); lattice error ${(dtm.enError * 1000).toFixed(2)} mm`);
  const out = build(data, dtm);
  const json = JSON.stringify(out.file);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, json);
  const gz = gzipSync(Buffer.from(json), { level: 9 }).length;
  for (const g of out.file.grids) {
    console.error(`  grid ${String(g.step).padStart(2)} m ${String(g.nx).padStart(4)} x ${String(g.nz).padStart(4)} at (${g.x0}, ${g.z0}), q ${g.q}: ${g.data.length} base64 bytes, ${gzipSync(Buffer.from(g.data), { level: 9 }).length} gzipped`);
  }
  console.error(`wrote ${outPath}: ${json.length} bytes, ${gz} gzipped, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const profile = profileRows(data, out, dtm, 25);
  if (args.includes('--profile')) console.error(profileTable(profile, out.inputs.datumGround));
  if (reportPath) await writeFile(reportPath, JSON.stringify({ bytes: json.length, gzip: gz, ...out.report, profile }, null, 1));
}

/** The through track's profile as a text table: the real DTM and rail level (m AOD), their fall from the buffers, and the finished terrain's model y. */
export function profileTable(rows: ProfileRow[], datumGround: number): string {
  const lines = ['     s       x       z   where   DTM AOD   rail AOD   rail vs buffers   terrain y'];
  for (const r of rows) {
    lines.push([r.s.toFixed(0).padStart(6), r.x.toFixed(0).padStart(7), r.z.toFixed(0).padStart(7), (r.open ? 'open' : 'tunnel').padStart(8), r.dtmAod.toFixed(2).padStart(9), r.railAod.toFixed(2).padStart(10), (r.railAod - datumGround).toFixed(2).padStart(17), r.terrainY.toFixed(2).padStart(11)].join(' '));
  }
  return lines.join('\n');
}

if (import.meta.url.endsWith(path.basename(process.argv[1] ?? ''))) await main();

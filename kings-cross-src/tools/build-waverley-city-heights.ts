// Rebuild: node tools/build-waverley-city-heights.ts --cache ../.scratch/lidar-cache
// LiDAR heights for the Waverley city blocks whose OSM tags carry no height (heightBasis 'ASSUMED ...').
// Numeric Scottish Government Phase V 0.5 m DSM and DTM, read through the same range-request GeoTIFF reader
// and OSTN15 transform as the terrain tool (waverley-terrain-source.ts, terrain-source.ts). Nothing is
// invented: a block whose samples are missing or implausible is left out and stays ASSUMED.
//
// Height above ground = the 90th percentile of the DSM over the footprint (shrunk inward by SHRINK_M so wall
// edges, neighbouring trees and streets stay out) minus the low ground under the footprint. That mirrors the
// scene: core/terrain.ts `seatY` stands a block on the lowest ground under it and OSM `height` is
// ground-to-roof-top. The tool also prints a validation against blocks that DO carry an OSM height.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { unproject } from '../core/geo.ts';
import type { Pt } from '../core/geo.ts';
import { createTerrain } from '../core/terrain.ts';
import type { TerrainFile } from '../core/terrain.ts';
import { unpackWaverleyScene, WAVERLEY_ORIGIN } from '../core/waverley-data.ts';
import type { WaverleyArea } from '../core/waverley-data.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import type { Ostn15 } from './terrain-source.ts';
import { openScottishDtm } from './waverley-terrain-source.ts';

const TILES = ['NT27SE', 'NT27SW'];
const OSTN_URL = 'https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif';
/** Lattice spacing and inward shrink (metres) for the footprint samples. */
const SPACING_M = 1, SHRINK_M = 1;
/** A footprint with fewer lattice points than this retries with a finer lattice and a smaller shrink. */
const MIN_LATTICE = 8;
/** Cap on lattice points per block: a very large footprint widens its spacing instead. */
const MAX_POINTS = 2500;
/** Spacing (metres) of the DTM samples along the outline. */
const OUTLINE_STEP_M = 2;
/** Fewer valid DSM or DTM samples than this rejects a block. */
const MIN_VALID = 4;
const MIN_HEIGHT_M = 2.5, MAX_HEIGHT_M = 80;
/** Shipped resolution, metres: 0.5 m, inside the LiDAR roof's own spread (the 90th percentile of a 0.5 m DSM) and half the gzip of 0.1 m. */
const Q = 0.5;

// ---- pure geometry and statistics -------------------------------------------------------------------

/** Linear-interpolated quantile p (0..1) of values; does not modify the input. NaN for an empty input. */
export function quantile(values: readonly number[], p: number): number {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const at = p * (s.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

function inRing(x: number, z: number, ring: readonly Pt[]): boolean {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

function ringDistance(x: number, z: number, ring: readonly Pt[], cap: number): number {
  let best = cap;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!, dx = b[0] - a[0], dz = b[1] - a[1], len = dx * dx + dz * dz;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len));
    const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
    if (d < best) best = d;
  }
  return best;
}

/** Inside the outer ring and outside every hole. */
export function insideArea(x: number, z: number, area: Pick<WaverleyArea, 'outer' | 'holes'>): boolean {
  return inRing(x, z, area.outer) && !area.holes.some(h => inRing(x, z, h));
}

/**
 * The footprint lattice: points about SPACING_M apart, inside the outline and outside holes, at least SHRINK_M
 * from any wall. A footprint too small for that retries finer and with a smaller shrink, and last with every
 * interior point (`tier` 1 and 2), so a tiny block still gets a centre sample rather than none.
 */
export function footprintLattice(area: Pick<WaverleyArea, 'outer' | 'holes'>): { pts: Pt[]; tier: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of area.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const rings = [area.outer, ...area.holes];
  const tiers = [{ step: SPACING_M, shrink: SHRINK_M }, { step: SPACING_M / 2, shrink: SHRINK_M / 2 }, { step: SPACING_M / 2, shrink: 0 }];
  let pts: Pt[] = [];
  for (let tier = 0; tier < tiers.length; tier++) {
    const { shrink } = tiers[tier]!;
    const step = Math.max(tiers[tier]!.step, Math.sqrt(((x1 - x0) * (z1 - z0)) / MAX_POINTS));
    pts = [];
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (!insideArea(x, z, area)) continue;
      if (shrink > 0 && rings.some(r => ringDistance(x, z, r, shrink) < shrink)) continue;
      pts.push([x, z]);
    }
    if (pts.length >= MIN_LATTICE || tier === tiers.length - 1) return { pts, tier };
  }
  return { pts, tier: tiers.length - 1 };
}

/** Points along the outer ring about OUTLINE_STEP_M apart, vertices included. */
export function outlinePoints(outer: readonly Pt[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!, b = outer[(i + 1) % outer.length]!, n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / OUTLINE_STEP_M));
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return pts;
}

export function footprintArea(area: Pick<WaverleyArea, 'outer' | 'holes'>): number {
  const shoelace = (r: readonly Pt[]): number => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  return shoelace(area.outer) - area.holes.reduce((t, h) => t + shoelace(h), 0);
}

// ---- LiDAR sampling ---------------------------------------------------------------------------------

export interface Lidar {
  /** DSM and DTM elevation (metres AOD) at a local-frame point; null where either tile has no value there. */
  dsm(x: number, z: number): Promise<number | null>;
  dtm(x: number, z: number): Promise<number | null>;
  urls: { dsm: string[]; dtm: string[] };
}

const DSM_FROM_DTM_BASE = '../../../dsm/27700/gridded/';

export async function openLidar(cache: string): Promise<Lidar> {
  await mkdir(cache, { recursive: true });
  const ostnPath = path.join(cache, 'ostn15.tif');
  let ostnBytes: Uint8Array;
  try { ostnBytes = await readFile(ostnPath); } catch {
    const response = await fetch(OSTN_URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`OSTN15 HTTP ${response.status}`);
    ostnBytes = new Uint8Array(await response.arrayBuffer()); await writeFile(ostnPath, ostnBytes);
  }
  const ostn: Ostn15 = { grid: readGeoTiff(ostnBytes) };
  // openScottishDtm prefixes the phase-5 DTM base to its name, so a name that climbs back out reaches the DSM
  // twin of each tile (same tiling, same TIFF layout); the cache key is the file name, so DSM and DTM never clash.
  const dtm = await Promise.all(TILES.map(t => openScottishDtm(`${t}_50CM_DTM_PHASE5.tif`, cache)));
  const dsm = await Promise.all(TILES.map(t => openScottishDtm(`${DSM_FROM_DTM_BASE}${t}_50CM_DSM_PHASE5.tif`, cache)));
  const grid = (x: number, z: number): [number, number] => { const p = unproject(x, z, WAVERLEY_ORIGIN); return etrs89ToGrid(ostn, p.lat, p.lon); };
  const read = (sources: typeof dtm) => async (x: number, z: number): Promise<number | null> => {
    const [e, n] = grid(x, z);
    for (const s of sources) { const v = await s.at(e, n); if (v !== null) return v; }
    return null;
  };
  return { dsm: read(dsm), dtm: read(dtm), urls: { dsm: dsm.map(s => new URL(s.url).href), dtm: dtm.map(s => new URL(s.url).href) } };
}

export interface Measure {
  /** valid DSM samples */
  n: number;
  /** footprint lattice tier: 0 normal, 1 and 2 fallbacks for tiny footprints */
  tier: number;
  /** DSM quantiles (metres AOD) over the shrunk footprint */
  dsm: { p50: number; p75: number; p90: number; p95: number; max: number };
  /** candidate low grounds (metres AOD) */
  ground: { outline10: number; outlineMin: number; interior10: number; all10: number };
}
export type Rejection = 'footprint too small' | 'too few valid LiDAR samples' | 'below 2.5 m' | 'above 80 m';

export async function measure(lidar: Lidar, area: Pick<WaverleyArea, 'outer' | 'holes'>): Promise<Measure | Rejection> {
  const { pts, tier } = footprintLattice(area);
  if (pts.length < MIN_VALID) return 'footprint too small';
  const dsm: number[] = [], interior: number[] = [], outline: number[] = [];
  for (const [x, z] of pts) {
    const [s, g] = await Promise.all([lidar.dsm(x, z), lidar.dtm(x, z)]);
    if (s !== null && g !== null) { dsm.push(s); interior.push(g); }
  }
  for (const [x, z] of outlinePoints(area.outer)) { const g = await lidar.dtm(x, z); if (g !== null) outline.push(g); }
  if (dsm.length < MIN_VALID || outline.length + interior.length < MIN_VALID) return 'too few valid LiDAR samples';
  const ground = {
    outline10: outline.length ? quantile(outline, 0.1) : quantile(interior, 0.1),
    outlineMin: outline.length ? Math.min(...outline) : Math.min(...interior),
    interior10: quantile(interior, 0.1),
    all10: quantile([...outline, ...interior], 0.1),
  };
  return { n: dsm.length, tier, dsm: { p50: quantile(dsm, 0.5), p75: quantile(dsm, 0.75), p90: quantile(dsm, 0.9), p95: quantile(dsm, 0.95), max: Math.max(...dsm) }, ground };
}

/** The published value: the 90th percentile DSM above the footprint's lowest ground (the 10th percentile of every DTM sample, outline and interior), and the median DSM above the same ground. */
export function heightsOf(m: Measure): { h: number; e: number } {
  const ground = m.ground.all10;
  return { h: m.dsm.p90 - ground, e: m.dsm.p50 - ground };
}

// ---- file format ------------------------------------------------------------------------------------

export interface CityHeightsFile {
  source: Record<string, unknown>;
  /** metres per unit of h and e */
  q: number;
  /** `way`: OSM way ids ascending, the first absolute and then deltas; `relation`: the part after 'relation/', as text. h and e run over way ids then relation ids. */
  ids: { way: number[]; relation: string[] };
  /** height of the roof top above the lowest ground under the footprint, in units of q */
  h: number[];
  /** roof rise, in units of q: h minus the median surface above the same ground. Near 0 for a flat roof; for a pitched one the median sits between eave and ridge, so h - r is a mid-slope level and h - 2r about the eave. */
  r: number[];
}

/** id -> metres, from a CityHeightsFile. */
export function decodeCityHeights(file: Pick<CityHeightsFile, 'q' | 'ids' | 'h' | 'r'>): Map<string, { height: number; median: number }> {
  const out = new Map<string, { height: number; median: number }>();
  let id = 0, k = 0;
  const put = (key: string): void => { out.set(key, { height: Math.round(file.h[k]! * file.q * 100) / 100, median: Math.round((file.h[k]! - file.r[k]!) * file.q * 100) / 100 }); k++; };
  for (const d of file.ids.way) { id += d; put(`way/${id}`); }
  for (const r of file.ids.relation) put(`relation/${r}`);
  return out;
}

/** r is kept only above this (6 m, in units of Q = 0.5 m): the renderer uses it only to tell a tower on part of a plan (waverley-city-heights.ts LIDAR_TOWER); zeros compress to nothing. */
export const TOWER_R = 12;
export function encodeCityHeights(entries: readonly { id: string; h: number; e: number }[], source: Record<string, unknown>): CityHeightsFile {
  const ways = entries.filter(e => e.id.startsWith('way/')).map(e => ({ ...e, n: Number(e.id.slice(4)) })).sort((a, b) => a.n - b.n);
  const relations = entries.filter(e => e.id.startsWith('relation/')).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  if (ways.length + relations.length !== entries.length) throw new Error('unexpected building id kind');
  let previous = 0;
  const deltas = ways.map(w => { const d = w.n - previous; previous = w.n; return d; });
  const ordered = [...ways, ...relations];
  return { source, q: Q, ids: { way: deltas, relation: relations.map(r => r.id.slice(9)) }, h: ordered.map(e => Math.round(e.h / Q)), r: ordered.map(e => { const r = Math.round((e.h - e.e) / Q); return r > TOWER_R ? r : 0; }) };
}

// ---- driver -----------------------------------------------------------------------------------------

async function pool<T, R>(items: readonly T[], width: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => { while (next < items.length) { const i = next++; out[i] = await work(items[i]!, i); } }));
  return out;
}

const f1 = (v: number): string => v.toFixed(1);
const med = (v: readonly number[]): number => quantile(v, 0.5);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const cache = value('--cache', '../.scratch/lidar-cache');
  const dataDir = fileURLToPath(new URL('../web/src/data/', import.meta.url));
  const out = value('--out', path.join(dataDir, 'waverley-city-heights.json'));
  const accessed = value('--accessed', new Date().toISOString().slice(0, 10));
  const scene = unpackWaverleyScene(JSON.parse(await readFile(path.join(dataDir, 'waverley-scene.json'), 'utf8')));
  const terrain = createTerrain(JSON.parse(await readFile(path.join(dataDir, 'waverley-terrain.json'), 'utf8')) as TerrainFile);
  const lidar = await openLidar(cache);

  const flat = scene.buildings.filter(b => b.minHeight === 0);
  const assumed = flat.filter(b => b.heightBasis.startsWith('ASSUMED'));
  const osm = flat.filter(b => b.heightBasis.startsWith('OSM height'));
  console.log(`buildings ${scene.buildings.length}; ASSUMED height with minHeight 0: ${assumed.length} (skipped ${scene.buildings.filter(b => b.heightBasis.startsWith('ASSUMED')).length - assumed.length} with minHeight > 0); OSM height with minHeight 0: ${osm.length}`);

  // The validation sample: OSM-height blocks of at least 10 m2 (smaller ones are columns and kiosks), evenly spread by id, at most 400.
  const comparable = osm.filter(b => footprintArea(b) >= 10);
  const sample = Array.from({ length: Math.min(400, comparable.length) }, (_, i) => comparable[Math.floor(i * comparable.length / Math.min(400, comparable.length))]!);
  // The Scott Monument is drawn by the landmarks, so its outline is not in the scene's buildings: measure it from data/waverley-city.json.
  const scottFile = JSON.parse(await readFile(path.join(dataDir, 'waverley-city.json'), 'utf8')) as { scott: { id: string; height: number; ring: number[][] } };
  const scott: WaverleyArea = { id: scottFile.scott.id, outer: scottFile.scott.ring.map(p => [p[0]!, p[1]!] as Pt), holes: [], height: scottFile.scott.height, minHeight: 0, heightBasis: 'OSM height', tags: {}, kind: 'building' };
  const scottMeasure = await measure(lidar, scott);
  const todo = [...assumed, ...sample];
  let done = 0;
  const results = await pool(todo, 12, async b => {
    const m = await measure(lidar, b);
    if (++done % 500 === 0) console.log(`  measured ${done}/${todo.length}`);
    return m;
  });
  const result = new Map(todo.map((b, i) => [b, results[i]!] as const));

  // -- the published set
  const kept: { id: string; h: number; e: number; b: WaverleyArea; m: Measure }[] = [];
  const rejected = new Map<string, number>();
  for (const b of assumed) {
    const m = result.get(b)!;
    if (typeof m === 'string') { rejected.set(m, (rejected.get(m) ?? 0) + 1); continue; }
    const { h, e } = heightsOf(m);
    if (!(h >= MIN_HEIGHT_M)) { rejected.set('below 2.5 m', (rejected.get('below 2.5 m') ?? 0) + 1); continue; }
    if (!(h <= MAX_HEIGHT_M)) { rejected.set('above 80 m', (rejected.get('above 80 m') ?? 0) + 1); continue; }
    kept.push({ id: b.id, h, e: Math.min(e, h), b, m });
  }
  const source = {
    dsm: lidar.urls.dsm, dtm: lidar.urls.dtm,
    licence: 'Open Government Licence v3: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: 'Contains Scottish public sector LiDAR data © Scottish Government, made available under the Open Government Licence v3.',
    accessed,
    method: 'Phase V 0.5 m DSM minus DTM per ASSUMED-height OSM block: h = 90th-percentile DSM inside the footprint (1 m lattice, 1 m in from the walls) above the 10th-percentile DTM over it; r = h minus the median surface, kept above 6 m; full method in tools/build-waverley-city-heights.ts',
  };
  const file = encodeCityHeights(kept, source);
  const json = JSON.stringify(file) + '\n';
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  const gz = gzipSync(json).length;

  console.log(`\nASSUMED blocks measured: ${assumed.length}; LiDAR height for ${kept.length}; rejected ${assumed.length - kept.length}`);
  for (const [why, n] of [...rejected].sort((a, b) => b[1] - a[1])) console.log(`  rejected, ${why}: ${n}`);
  console.log(`  fallback lattice (tiny footprint): tier 1 ${kept.filter(k => k.m.tier === 1).length}, tier 2 ${kept.filter(k => k.m.tier === 2).length}`);
  const hs = kept.map(k => k.h);
  console.log(`  h percentiles m: min ${f1(Math.min(...hs))}, p10 ${f1(quantile(hs, 0.1))}, median ${f1(med(hs))}, p90 ${f1(quantile(hs, 0.9))}, max ${f1(Math.max(...hs))}`);
  const was = new Map<string, number[]>();
  for (const k of kept) { const key = k.b.heightBasis.startsWith('ASSUMED 12m') ? '12 m' : 'levels x 3 m'; (was.get(key) ?? was.set(key, []).get(key)!).push(k.h - k.b.height); }
  for (const [key, d] of was) console.log(`  LiDAR minus the ASSUMED height, ${key}: n ${d.length}, median ${f1(med(d))} m, p10 ${f1(quantile(d, 0.1))}, p90 ${f1(quantile(d, 0.9))}`);
  // How far a block drawn at (coarse 16 m terrain seat + h) lands from the LiDAR roof level (AOD - datum).
  const seatErr = kept.map(k => Math.abs(terrain.rangeUnder(k.b.outer, 4).min + k.h - (k.m.dsm.p90 - terrain.datumAod)));
  console.log(`  drawn top (coarse terrain seat + h) vs LiDAR roof level: median ${f1(med(seatErr))} m, p90 ${f1(quantile(seatErr, 0.9))} m, max ${f1(Math.max(...seatErr))} m`);
  const { x0: ex0, z0: ez0, x1: ex1, z1: ez1 } = terrain.extent;
  const outside = (b: WaverleyArea): boolean => b.outer.some(([x, z]) => x < ex0 || x > ex1 || z < ez0 || z > ez1);
  const off = kept.filter((k, i) => seatErr[i]! > 3);
  console.log(`  drawn top more than 3 m off: ${off.length} blocks, ${off.filter(k => outside(k.b)).length} of them with a vertex outside the terrain extent (the scene seats those on flat groundY)`);
  const tallest = kept.slice().sort((a, b) => b.h - a.h).slice(0, 8);
  console.log('  tallest LiDAR blocks (h / ASSUMED m; area; id):');
  for (const k of tallest) console.log(`    ${k.id.padEnd(22)} ${f1(k.h).padStart(5)} / ${k.b.height.toFixed(1).padStart(5)}  ${footprintArea(k.b).toFixed(0).padStart(6)} m2  r ${f1(k.h - k.e)}`);
  const badSeat = kept.map((k, i) => ({ k, e: seatErr[i]! })).sort((a, b) => b.e - a.e).slice(0, 5);
  console.log('  worst drawn-top vs LiDAR roof level (error m; centre x,z; id):');
  for (const { k, e } of badSeat) console.log(`    ${k.id.padEnd(22)} ${f1(e).padStart(5)}  ${k.b.outer[0]!.join(', ')}`);
  console.log(`\nwrote ${out}: ${json.length} bytes, ${gz} bytes gzip (${kept.length} ids)`);

  // -- validation against OSM heights
  type Row = { b: WaverleyArea; m: Measure };
  const rows: Row[] = [], dropped: string[] = [];
  for (const b of sample) { const m = result.get(b)!; if (typeof m === 'string') dropped.push(`${b.id} ${m}`); else rows.push({ b, m }); }
  console.log(`\nValidation: ${sample.length} OSM-height blocks of at least 10 m2 (of ${osm.length} with minHeight 0); ${rows.length} measured, ${dropped.length} rejected before the height test${dropped.length ? ` (${dropped.slice(0, 5).join('; ')})` : ''}`);
  const variants: [string, (m: Measure) => number][] = [];
  for (const [gname, g] of [['outline p10', (m: Measure) => m.ground.outline10], ['outline min', (m: Measure) => m.ground.outlineMin], ['interior p10', (m: Measure) => m.ground.interior10], ['all p10', (m: Measure) => m.ground.all10]] as const)
    for (const [dname, d] of [['p75', (m: Measure) => m.dsm.p75], ['p90', (m: Measure) => m.dsm.p90], ['p95', (m: Measure) => m.dsm.p95], ['max', (m: Measure) => m.dsm.max]] as const)
      variants.push([`DSM ${dname} - ${gname}`, m => d(m) - g(m)]);
  const stats = (pick: (m: Measure) => number, subset: Row[]) => {
    const err = subset.map(r => pick(r.m) - r.b.height), abs = err.map(Math.abs);
    return `n ${String(subset.length).padStart(3)}  median abs ${f1(med(abs)).padStart(5)} m  p90 abs ${f1(quantile(abs, 0.9)).padStart(5)} m  median signed ${f1(med(err)).padStart(5)} m`;
  };
  const inRange = rows;
  console.log('  method variants (LiDAR - OSM height):');
  for (const [name, pick] of variants) console.log(`    ${name.padEnd(28)} ${stats(pick, inRange)}${name === 'DSM p90 - all p10' ? '   <- published' : ''}`);
  const chosen = (m: Measure): number => heightsOf(m).h;
  console.log('  published method by OSM height band:');
  for (const [lo, hi] of [[0, 9], [9, 15], [15, 22], [22, 35], [35, 200]] as const) {
    const sub = inRange.filter(r => r.b.height >= lo && r.b.height < hi);
    if (sub.length) console.log(`    OSM ${String(lo).padStart(2)}-${String(hi).padEnd(3)} m  ${stats(chosen, sub)}`);
  }
  console.log('  published method by OSM element kind (a part is often one storey of a taller building):');
  for (const kind of ['building', 'part'] as const) { const sub = inRange.filter(r => r.b.kind === kind); if (sub.length) console.log(`    ${kind.padEnd(14)} ${stats(chosen, sub)}`); }
  console.log('  published method by footprint area:');
  for (const [lo, hi] of [[10, 40], [40, 150], [150, 500], [500, 1e9]] as const) {
    const sub = inRange.filter(r => { const a = footprintArea(r.b); return a >= lo && a < hi; });
    if (sub.length) console.log(`    ${String(lo).padStart(3)}-${(hi > 1e8 ? 'up' : String(hi)).padEnd(4)} m2  ${stats(chosen, sub)}`);
  }
  const worst = [...inRange].sort((a, b) => Math.abs(chosen(b.m) - b.b.height) - Math.abs(chosen(a.m) - a.b.height)).slice(0, 8);
  console.log('  largest disagreements (OSM / LiDAR h / LiDAR median, m; area m2; id):');
  for (const r of worst) console.log(`    ${r.b.id.padEnd(22)} ${r.b.height.toFixed(1).padStart(5)} / ${f1(chosen(r.m)).padStart(5)} / ${f1(heightsOf(r.m).e).padStart(5)}   ${footprintArea(r.b).toFixed(0).padStart(5)} m2  ${r.b.tags.name ?? ''}`);

  // -- spot checks
  console.log('\nSpot checks (OSM height / LiDAR h / DSM max above ground / median above ground; area):');
  const line = (b: WaverleyArea, m: Measure, label: string) => {
    const g = m.ground.all10;
    console.log(`  ${label.padEnd(26)} ${b.id.padEnd(20)} OSM ${b.height.toFixed(1).padStart(5)} (${b.heightBasis.slice(0, 12)}) / h ${f1(m.dsm.p90 - g).padStart(5)} / max ${f1(m.dsm.max - g).padStart(5)} / med ${f1(m.dsm.p50 - g).padStart(5)}   ${footprintArea(b).toFixed(0).padStart(5)} m2, ${m.n} samples`);
  };
  if (typeof scottMeasure !== 'string') line(scott, scottMeasure, 'Scott Monument (spire)'); else console.log(`  Scott Monument: ${scottMeasure}`);
  const bigAssumed = kept.slice().sort((a, b) => footprintArea(b.b) - footprintArea(a.b)).slice(0, 4);
  for (const k of bigAssumed) line(k.b, k.m, 'large ASSUMED block');
  const bigOsm = rows.filter(r => r.b.id !== 'way/39044819').sort((a, b) => footprintArea(b.b) - footprintArea(a.b)).slice(0, 2);
  for (const r of bigOsm) line(r.b, r.m, 'large OSM-height block');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

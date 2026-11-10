// Rebuild: node tools/build-perth-city-heights.ts --cache /Users/md/kx-data/perth-lidar
// P3 LiDAR heights for the Perth city blocks whose OSM tags carry no height (heightBasis 'ASSUMED ...'), as Waverley's
// tools/build-waverley-city-heights.ts: the same footprint lattice, quantiles and file format, on the Scottish Government Phase I
// (2011-12) 1 m DSM and DTM (OGLv3), read through the range-request GeoTIFF reader and OSTN15 transform of the terrain tool. The tile
// byte ranges stay in the cache, outside git; only the derived heights are committed (web/src/data/perth-city-heights.json). Nothing
// is invented: a block whose samples are missing or implausible is left out and stays ASSUMED.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { unproject } from '../core/geo.ts';
import { unpackWaverleyScene } from '../core/waverley-data.ts';
import type { WaverleyArea } from '../core/waverley-data.ts';
import { PERTH_ORIGIN } from '../core/perth-data.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import { openScottishDtm, SCOTTISH_DTM_PHASE1_BASE } from './waverley-terrain-source.ts';
import { encodeCityHeights, footprintArea, footprintLattice, heightsOf, measure, quantile } from './build-waverley-city-heights.ts';
import type { Lidar, Measure } from './build-waverley-city-heights.ts';

/** Perth lies in NO12; NO02 (west) and NO11 (south) are read only where a footprint crosses into them. */
const TILES = ['NO12', 'NO02', 'NO11'];
export const SCOTTISH_DSM_PHASE1_BASE = 'https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-1/dsm/27700/gridded/';
const OSTN_URL = 'https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif';
const MIN_HEIGHT_M = 2.5, MAX_HEIGHT_M = 80;
/** The landmarks whose LiDAR peak the renderer places a tower or spire on: St John's Kirk (OSM way/740861202, its central tower and
 *  spire) and Kinnoull Tower (way/323543760, the folly on the hill's cliff edge). */
export const PERTH_LIDAR_LANDMARKS = { kirk: 'way/740861202', kinnoullTower: 'way/323543760' } as const;

/** The highest DSM sample over a footprint (1 m lattice, no inward shrink), with the 10th-percentile DTM under the footprint. */
export async function peakOf(lidar: Lidar, b: Pick<WaverleyArea, 'outer' | 'holes'>): Promise<{ x: number; z: number; top: number; ground: number; p90: number }> {
  const pts: [number, number][] = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of b.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const inside = footprintLattice(b).pts; for (const p of inside) pts.push(p);
  let best = { x: 0, z: 0, top: -Infinity }; const ground: number[] = [], surface: number[] = [];
  for (const [x, z] of pts) { const [s, g] = await Promise.all([lidar.dsm(x, z), lidar.dtm(x, z)]); if (g !== null) ground.push(g); if (s === null) continue; surface.push(s); if (s > best.top) best = { x, z, top: s }; }
  if (!Number.isFinite(best.top) || !ground.length) throw new Error('landmark has no LiDAR samples');
  return { ...best, ground: quantile(ground, 0.1), p90: quantile(surface, 0.9) };
}

/** A structure the DSM resolves beside its OSM outline (Kinnoull Tower: the mapped outline shows 3 m, open ground): the greatest DSM
 *  rise above the DTM on a 1 m lattice within `reach` m of the outline's centre, over ground within `level` m of the outline's own
 *  ground (so trees on the cliff face below do not count), and its width (lattice cells within 3 m of the peak rising over half its
 *  rise). */
export async function towerNear(lidar: Lidar, b: Pick<WaverleyArea, 'outer' | 'holes'>, reach = 20, level = 3): Promise<{ x: number; z: number; rise: number; ground: number; cells: number; offset: number }> {
  let cx = 0, cz = 0; for (const [x, z] of b.outer) { cx += x; cz += z; } cx /= b.outer.length; cz /= b.outer.length;
  const base: number[] = []; for (const [x, z] of footprintLattice(b).pts) { const g = await lidar.dtm(x, z); if (g !== null) base.push(g); }
  const g0 = quantile(base, 0.5);
  let best = { x: cx, z: cz, rise: -Infinity, ground: g0 };
  for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
    if (Math.hypot(dx, dz) > reach) continue;
    const x = Math.round(cx) + dx, z = Math.round(cz * 2) / 2 + dz, [s, g] = await Promise.all([lidar.dsm(x, z), lidar.dtm(x, z)]);
    if (s === null || g === null || Math.abs(g - g0) > level) continue;
    if (s - g > best.rise) best = { x, z, rise: s - g, ground: g };
  }
  let cells = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const [s, g] = await Promise.all([lidar.dsm(best.x + dx, best.z + dz), lidar.dtm(best.x + dx, best.z + dz)]); if (s !== null && g !== null && s - g > best.rise / 2) cells++; }
  return { ...best, cells, offset: Math.hypot(best.x - cx, best.z - cz) };
}

export async function openPerthLidar(cache: string): Promise<Lidar> {
  await mkdir(cache, { recursive: true });
  const ostnPath = path.join(cache, 'ostn15.tif');
  let ostnBytes: Uint8Array;
  try { ostnBytes = await readFile(ostnPath); } catch {
    const response = await fetch(OSTN_URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`OSTN15 HTTP ${response.status}`);
    ostnBytes = new Uint8Array(await response.arrayBuffer()); await writeFile(ostnPath, ostnBytes);
  }
  const ostn = { grid: readGeoTiff(ostnBytes) };
  const dtm = await Promise.all(TILES.map(t => openScottishDtm(`${t}_1M_DTM_PHASE1.tif`, cache, SCOTTISH_DTM_PHASE1_BASE)));
  const dsm = await Promise.all(TILES.map(t => openScottishDtm(`${t}_1M_DSM_PHASE1.tif`, cache, SCOTTISH_DSM_PHASE1_BASE)));
  const read = (sources: typeof dtm) => async (x: number, z: number): Promise<number | null> => {
    const p = unproject(x, z, PERTH_ORIGIN); const [e, n] = etrs89ToGrid(ostn, p.lat, p.lon);
    for (const s of sources) { const v = await s.at(e, n); if (v !== null) return v; }
    return null;
  };
  return { dsm: read(dsm), dtm: read(dtm), urls: { dsm: dsm.map(s => s.url), dtm: dtm.map(s => s.url) } };
}

async function pool<T, R>(items: readonly T[], width: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: width }, async () => { while (next < items.length) { const i = next++; out[i] = await work(items[i]!); } }));
  return out;
}
const f1 = (v: number): string => v.toFixed(1);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const cache = value('--cache', '/Users/md/kx-data/perth-lidar');
  const dataDir = fileURLToPath(new URL('../web/src/data/', import.meta.url));
  const out = value('--out', path.join(dataDir, 'perth-city-heights.json'));
  const accessed = value('--accessed', new Date().toISOString().slice(0, 10));
  const scene = unpackWaverleyScene(JSON.parse(await readFile(path.join(dataDir, 'perth-scene.json'), 'utf8')));
  const lidar = await openPerthLidar(cache);
  const flat = scene.buildings.filter(b => b.minHeight === 0);
  const assumed = flat.filter(b => b.heightBasis.startsWith('ASSUMED'));
  const osm = flat.filter(b => b.heightBasis.startsWith('OSM height') && footprintArea(b) >= 10);
  const sample = Array.from({ length: Math.min(300, osm.length) }, (_, i) => osm[Math.floor(i * osm.length / Math.min(300, osm.length))]!);
  const todo = [...assumed, ...sample];
  let done = 0;
  const results = await pool(todo, 12, async b => { const m = await measure(lidar, b); if (++done % 500 === 0) console.log(`  measured ${done}/${todo.length}`); return m; });
  const result = new Map(todo.map((b, i) => [b, results[i]!] as const));
  const kept: { id: string; h: number; e: number }[] = [];
  const rejected = new Map<string, number>();
  const reject = (why: string) => rejected.set(why, (rejected.get(why) ?? 0) + 1);
  for (const b of assumed) {
    const m = result.get(b)!;
    if (typeof m === 'string') { reject(m); continue; }
    const { h, e } = heightsOf(m);
    if (!(h >= MIN_HEIGHT_M)) { reject('below 2.5 m'); continue; }
    if (!(h <= MAX_HEIGHT_M)) { reject('above 80 m'); continue; }
    kept.push({ id: b.id, h, e: Math.min(e, h) });
  }
  const source = {
    dsm: lidar.urls.dsm, dtm: lidar.urls.dtm,
    licence: 'Open Government Licence v3: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: 'Contains Scottish public sector LiDAR data © Scottish Government, made available under the Open Government Licence v3.',
    accessed,
    method: 'Phase I 1 m DSM minus DTM per ASSUMED-height OSM block: h = 90th-percentile DSM inside the footprint (1 m lattice, 1 m in from the walls) above the 10th-percentile DTM over it; r = h minus the median surface, kept above 6 m; method in tools/build-waverley-city-heights.ts, driver tools/build-perth-city-heights.ts',
  };
  const landmarks: Record<string, { id: string; x: number; z: number; rise: number; body: number; near?: { x: number; z: number; rise: number; cells: number; offset: number } }> = {};
  for (const [key, id] of Object.entries(PERTH_LIDAR_LANDMARKS)) {
    const b = scene.buildings.find(q => q.id === id); if (!b) throw new Error(`${id} not in the scene`);
    const p = await peakOf(lidar, b), r = (v: number) => Math.round(v * 10) / 10;
    landmarks[key] = { id, x: r(p.x), z: r(p.z), rise: r(p.top - p.ground), body: r(p.p90 - p.ground) };
    console.log(`landmark ${key} ${id}: peak ${r(p.top - p.ground)} m above ground at ${r(p.x)}, ${r(p.z)}; 90th percentile ${r(p.p90 - p.ground)} m`);
    if (key === 'kinnoullTower') {
      const t = await towerNear(lidar, b);
      landmarks[key]!.near = { x: r(t.x), z: r(t.z), rise: r(t.rise), cells: t.cells, offset: r(t.offset) };
      console.log(`landmark ${key} ${id}: LiDAR tower ${r(t.rise)} m at ${r(t.x)}, ${r(t.z)} (${t.cells} cells over half), ${r(t.offset)} m from the outline's centre`);
    }
  }
  const json = JSON.stringify({ ...encodeCityHeights(kept, source), landmarks }) + '\n';
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  console.log(`ASSUMED blocks with minHeight 0: ${assumed.length}; LiDAR height for ${kept.length}; rejected ${assumed.length - kept.length}`);
  for (const [why, n] of [...rejected].sort((a, b) => b[1] - a[1])) console.log(`  rejected, ${why}: ${n}`);
  const hs = kept.map(k => k.h);
  console.log(`  h m: p10 ${f1(quantile(hs, 0.1))}, median ${f1(quantile(hs, 0.5))}, p90 ${f1(quantile(hs, 0.9))}, max ${f1(Math.max(...hs))}`);
  console.log(`wrote ${out}: ${json.length} bytes, ${gzipSync(json).length} bytes gzip`);
  const rows = sample.map(b => ({ b, m: result.get(b)! })).filter((r): r is { b: WaverleyArea; m: Measure } => typeof r.m !== 'string');
  const err = rows.map(r => heightsOf(r.m).h - r.b.height), abs = err.map(Math.abs);
  if (rows.length) console.log(`Validation vs OSM height (${rows.length} of ${sample.length} blocks >= 10 m2): median abs ${f1(quantile(abs, 0.5))} m, p90 abs ${f1(quantile(abs, 0.9))} m, median signed ${f1(quantile(err, 0.5))} m`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

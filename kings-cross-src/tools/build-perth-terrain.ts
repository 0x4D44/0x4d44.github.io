// Rebuild: node tools/build-perth-terrain.ts --cache ../.scratch/perth/terrain
// Numeric Scottish Government Phase I 1 m DTM (Perth lies in NO12; NO02 and NO11 are read only where the lattice crosses into them),
// sampled by the Waverley terrain builder (build-waverley-terrain.ts buildWaverleyTerrain): native pixels on a 16 m lattice, 0.1 m
// quantisation, no averaging, no railway warp, no fill. The tiles' byte ranges and the OSTN15 grid stay in the cache, outside git.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { unproject } from '../core/geo.ts';
import type { Extent } from '../core/terrain.ts';
import { PERTH_ORIGIN } from '../core/perth-data.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import { openScottishDtm, SCOTTISH_DTM_PHASE1_BASE } from './waverley-terrain-source.ts';
import { buildWaverleyTerrain } from './build-waverley-terrain.ts';
import type { ScottishTerrainSite } from './build-waverley-terrain.ts';

/** ASSUMED context extent (Perth frame, x east, z south): the station, the town centre, the Tay and Bridgend, and Kinnoull Hill
 *  (summit about x 2,400, z -570) with its west face, in whole 16 m steps. */
export const PERTH_TERRAIN_EXTENT: Extent = { x0: -1200, z0: -1200, x1: 2560, z1: 912 };
const SOURCE_NAMES = ['NO12_1M_DTM_PHASE1.tif', 'NO02_1M_DTM_PHASE1.tif', 'NO11_1M_DTM_PHASE1.tif'];
const OSTN_URL = 'https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif';

/** ASSUMED search for a node on a nodata pixel: ring radii (m) and bearings per ring. The Tay is under 200 m wide here. */
export const WATER_RINGS = [2, 4, 8, 16, 32, 64, 128] as const;
export const WATER_RAYS = 16;
/** The node's native pixel; else the lowest valid pixel on the nearest ring that has one (PERTH_TERRAIN_SITE.nodata); else null. */
export async function sampleOrBank(at: (e: number, n: number) => Promise<number | null>, e: number, n: number): Promise<number | null> {
  const own = await at(e, n); if (own !== null) return own;
  for (const r of WATER_RINGS) {
    let low: number | null = null;
    for (let k = 0; k < WATER_RAYS; k++) {
      const v = await at(e + r * Math.cos(2 * Math.PI * k / WATER_RAYS), n + r * Math.sin(2 * Math.PI * k / WATER_RAYS));
      if (v !== null && (low === null || v < low)) low = v;
    }
    if (low !== null) return low;
  }
  return null;
}

export const PERTH_TERRAIN_SITE: ScottishTerrainSite = {
  origin: PERTH_ORIGIN, urls: SOURCE_NAMES.map(name => SCOTTISH_DTM_PHASE1_BASE + name),
  dataset: 'Phase I 1 m DTM', resolutionM: 1, step: 16, accessed: '2026-11-10',
  nodata: `A node on a nodata pixel (the Tay's water surface and isolated Phase I gaps) takes the LOWEST valid native pixel on the nearest of the rings ${WATER_RINGS.join(', ')} m round it (${WATER_RAYS} bearings each) that has one: ASSUMED, the bank's lowest ground standing for the water surface; beyond ${WATER_RINGS.at(-1)} m the build refuses.`,
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const cache = value('--cache', '../.scratch/perth/terrain');
  const out = value('--out', 'web/src/data/perth-terrain.json');
  await mkdir(cache, { recursive: true });
  const ostnPath = path.join(cache, 'ostn15.tif');
  let ostnBytes: Uint8Array;
  try { ostnBytes = await readFile(ostnPath); } catch {
    const response = await fetch(OSTN_URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`OSTN15 HTTP ${response.status}`);
    ostnBytes = new Uint8Array(await response.arrayBuffer()); await writeFile(ostnPath, ostnBytes);
  }
  const ostn = { grid: readGeoTiff(ostnBytes) };
  const sources = await Promise.all(SOURCE_NAMES.map(name => openScottishDtm(name, cache, SCOTTISH_DTM_PHASE1_BASE)));
  const sample = async (x: number, z: number): Promise<number | null> => {
    const p = unproject(x, z, PERTH_ORIGIN);
    const [e, n] = etrs89ToGrid(ostn, p.lat, p.lon);
    return sampleOrBank(async (pe, pn) => { for (const source of sources) { const v = await source.at(pe, pn); if (v !== null) return v; } return null; }, e, n);
  };
  const file = await buildWaverleyTerrain(sample, PERTH_TERRAIN_EXTENT, PERTH_TERRAIN_SITE);
  const json = JSON.stringify(file);
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  const report = { referenceGroundAod: file.provenance.referenceGroundAod, datumAod: file.datumAod, gzipBytes: gzipSync(json).length,
    sampleCount: file.provenance.sampleCount, sourceUrls: file.provenance.urls,
    samples: await Promise.all([[0, 0], [800, 0], [2400, -570], [-600, 0], [0, -800]].map(async ([x, z]) => ({ x, z, aod: await sample(x!, z!) }))) };
  await writeFile(path.join(cache, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

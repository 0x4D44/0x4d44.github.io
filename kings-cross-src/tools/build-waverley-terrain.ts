// Rebuild: node tools/build-waverley-terrain.ts --cache ../.scratch/b44/terrain
// Numeric Scottish Government Phase V DTM, NOT a hillshade or inferred building/contour terrain.
// Native 0.5 m pixel samples are retained on a 16 m model lattice, quantised to 0.1 m.
// No averaging, railway warp, fabricated relief, roof substitution or missing-value fill.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { unproject } from '../core/geo.ts';
import { encodeGrid } from '../core/terrain.ts';
import type { Extent, TerrainFile } from '../core/terrain.ts';
import { etrs89ToGrid, readGeoTiff } from './terrain-source.ts';
import { openScottishDtm } from './waverley-terrain-source.ts';

export const WAVERLEY_TERRAIN_ORIGIN = { lat: 55.9519018, lon: -3.1904199 };
export const WAVERLEY_TERRAIN_EXTENT: Extent = { x0: -912, z0: -624, x1: 1088, z1: 608 };
const STEP = 16;
const GROUND_Y = -0.2;
const SOURCE_NAMES = ['NT27SE_50CM_DTM_PHASE5.tif', 'NT27SW_50CM_DTM_PHASE5.tif'];
const OSTN_URL = 'https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif';

export interface WaverleyTerrainFile extends TerrainFile {
  provenance: {
    urls: string[];
    licence: string;
    licenceEvidence: string;
    crs: string;
    sourceResolutionM: number;
    outputSpacingM: number;
    sampleCount: number;
    missingSamples: number;
    referenceGroundAod: number;
    origin: typeof WAVERLEY_TERRAIN_ORIGIN;
    railwayWarp: false;
    method: string;
    limitations: string;
  };
}

/** Sample physical AOD ground; the origin ground becomes -0.2 m, rails remain the scene's responsibility. */
export async function buildWaverleyTerrain(sampleAod: (x: number, z: number) => Promise<number | null>, extent = WAVERLEY_TERRAIN_EXTENT): Promise<WaverleyTerrainFile> {
  const reference = await sampleAod(0, 0);
  if (reference === null || !Number.isFinite(reference)) throw new Error('missing DTM at reference ground');
  const nx = Math.round((extent.x1 - extent.x0) / STEP) + 1;
  const nz = Math.round((extent.z1 - extent.z0) / STEP) + 1;
  const heights = new Float32Array(nx * nz);
  // Sequential rows bound the network work, whilst one row can fetch independent TIFF tiles concurrently.
  for (let j = 0; j < nz; j++) {
    const row = await Promise.all(Array.from({ length: nx }, async (_, i) => {
      const value = await sampleAod(extent.x0 + i * STEP, extent.z0 + j * STEP);
      if (value === null || !Number.isFinite(value)) throw new Error(`missing DTM at grid ${i},${j}`);
      return value - reference + GROUND_Y;
    }));
    heights.set(row, j * nx);
  }
  return {
    attribution: 'Contains Scottish public sector LiDAR data © Scottish Government, made available under the Open Government Licence v3. Scottish Public Sector LiDAR Dataset accessed 2026-11-09 from https://registry.opendata.aws/scottish-lidar/.',
    source: 'Scottish Government LiDAR Phase V 0.5 m DTM, 16 m nearest-pixel lattice, 0.1 m quantisation. Physical relative terrain; no railway warp. Datum is sampled station-origin ground plus 0.2 m, not a surveyed rail-head level.',
    groundY: GROUND_Y,
    datumAod: reference - GROUND_Y,
    extent,
    grids: [encodeGrid(heights, { step: STEP, x0: extent.x0, z0: extent.z0, nx, nz, q: 0.1 })],
    provenance: {
      urls: SOURCE_NAMES.map(name => `https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-5/dtm/27700/gridded/${name}`),
      licence: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licenceEvidence: 'https://registry.opendata.aws/scottish-lidar/',
      crs: 'EPSG:27700', sourceResolutionM: 0.5, outputSpacingM: STEP,
      sampleCount: heights.length, missingSamples: 0, referenceGroundAod: reference,
      origin: WAVERLEY_TERRAIN_ORIGIN, railwayWarp: false,
      method: 'Local x east/z south equirectangular frame; WGS84 treated as ETRS89 then OSTN15 to OSGB36/BNG. Each lattice node samples its containing native DTM pixel. Model y=AOD-referenceGroundAod-0.2.',
      limitations: '16 m point sampling does not resolve track beds, retaining walls, bridge decks or narrow cuttings; 0.1 m quantisation is not source accuracy. Official DTM contains elevated surfaces/interpolation near the station (independently verified with Pillow/libtiff); it is not a rail profile. DTM beneath the station roof is processed/interpolated bare-earth, not independently surveyed rail height. No source vertical RMSE is asserted. Rails drawn at y=0 need a separate consistent scene ground treatment. Outside the extent the existing terrain API returns flat groundY.',
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback;
  const cache = value('--cache', '../.scratch/b44/terrain');
  const out = value('--out', 'web/src/data/waverley-terrain.json');
  await mkdir(cache, { recursive: true });
  const ostnPath = path.join(cache, 'ostn15.tif');
  let ostnBytes: Uint8Array;
  try { ostnBytes = await readFile(ostnPath); } catch {
    const response = await fetch(OSTN_URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`OSTN15 HTTP ${response.status}`);
    ostnBytes = new Uint8Array(await response.arrayBuffer()); await writeFile(ostnPath, ostnBytes);
  }
  const ostn = { grid: readGeoTiff(ostnBytes) };
  const sources = await Promise.all(SOURCE_NAMES.map(name => openScottishDtm(name, cache)));
  const sample = async (x: number, z: number): Promise<number | null> => {
    const p = unproject(x, z, WAVERLEY_TERRAIN_ORIGIN);
    const [e,n] = etrs89ToGrid(ostn, p.lat, p.lon);
    for (const source of sources) { const v = await source.at(e,n); if (v !== null) return v; }
    return null;
  };
  const file = await buildWaverleyTerrain(sample);
  const json = JSON.stringify(file);
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, json);
  const report = { stationLimitation: 'Source DTM includes station-area samples 15-20 m above reference ground. Independent Pillow/libtiff decoding confirms these heights; their surface classification is unverified. Keep station/platform ground treatment separate from the physical context grid.', referenceGroundAod: file.provenance.referenceGroundAod, datumAod: file.datumAod, gzipBytes: gzipSync(json).length, sampleCount: file.provenance.sampleCount, sourceUrls: file.provenance.urls, samples: await Promise.all([[0,0],[-200,0],[200,0],[0,-200],[0,200]].map(async ([x,z]) => ({x,z,aod:await sample(x!,z!)}))) };
  await writeFile(path.join(cache, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

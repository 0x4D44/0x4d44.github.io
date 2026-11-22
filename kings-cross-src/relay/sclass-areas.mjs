import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSclassJob } from './sclass-job.mjs';
import { areaDataDir } from './areas.mjs';
import { STATIONS } from '../core/station-config.ts';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The committed public render assets of each area beyond Y9 (Y9's are the relearn CLI's defaults): its OSM signal overlay and
 * its track. The relearn writes the area's private table under <dataDir>/areas/<area>/, never beside these.
 */
export function areaAssetsFor(perthAreas = STATIONS.perth.tdAreas) {
  // Retained for offline TD experiments on the approaches. The Perth station page uses TRUST and CIF.
  const assets = {
    EB: Object.freeze({ overlayPath: path.join(packageRoot, 'web/src/data/waverley-signals.json'), trackPath: path.join(packageRoot, 'web/src/data/waverley-scene.json') }),
  };
  const perth = Object.freeze({ overlayPath: path.join(packageRoot, 'web/src/data/perth-signals.json'), trackPath: path.join(packageRoot, 'web/src/data/perth-scene.json') });
  const otherAreas = new Set(Object.values(STATIONS).filter(station => station.id !== 'perth').flatMap(station => station.tdAreas));
  for (const area of perthAreas) {
    if (typeof area !== 'string' || !/^[A-Z0-9]{2}$/.test(area)) throw new Error('Invalid Perth area');
    if (otherAreas.has(area) || Object.hasOwn(assets, area)) throw new Error(`Area ${area} already belongs to a station or is repeated`);
    assets[area] = perth;
  }
  return Object.freeze(assets);
}

export const DEFAULT_AREA_ASSETS = areaAssetsFor();

/** Build daily private relearn jobs with one state directory per area. */
export function createAreaSclassJobs({ dataDir, areas, anchorsPath, tablePath, areaAssets = DEFAULT_AREA_ASSETS, createJob = createSclassJob,
  log = () => {}, ...jobOptions } = {}) {
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('area sclass dataDir is required');
  if (!Array.isArray(areas) || !areas.length) throw new Error('area sclass areas are required');
  if (!areaAssets || typeof areaAssets !== 'object' || Array.isArray(areaAssets)) throw new Error('area sclass assets must be an object');
  if (typeof createJob !== 'function') throw new Error('area sclass createJob must be a function');

  const seen = new Set();
  const jobs = [];
  const unavailable = [];
  const recordingsDir = path.join(dataDir, 'recordings');
  for (const area of areas) {
    if (typeof area !== 'string') throw new Error(`Invalid area ${String(area)}`);
    const areaData = areaDataDir(dataDir, area);
    if (seen.has(area)) throw new Error(`duplicate area ${area}`);
    seen.add(area);

    const areaConfig = areaAssets[area] ?? {};
    if (!areaConfig || typeof areaConfig !== 'object' || Array.isArray(areaConfig)) throw new Error(`Invalid S-class config for ${area}`);
    const isY9 = area === 'Y9';
    if (!isY9 && (!areaConfig.overlayPath || !areaConfig.trackPath)) {
      const entry = { area, reason: 'area-specific overlay and track are required' };
      unavailable.push(entry);
      try { log(`sclass relearn unavailable for ${area}: ${entry.reason}`); } catch { /* Logging cannot affect area setup. */ }
      continue;
    }
    if (Boolean(areaConfig.overlayPath) !== Boolean(areaConfig.trackPath)) {
      throw new Error(`S-class overlay and track must be configured together for ${area}`);
    }

    jobs.push(createJob({ ...jobOptions,
      dataDir: areaData,
      area,
      log,
      anchorsPath: isY9 ? anchorsPath : areaConfig.anchorsPath ?? path.join(areaData, 'anchors.json'),
      tablePath: isY9 ? tablePath : areaConfig.tablePath ?? path.join(areaData, 'sclass.json'),
      recordingsDir: isY9 ? undefined : recordingsDir,
      overlayPath: areaConfig.overlayPath,
      trackPath: areaConfig.trackPath,
    }));
  }

  return {
    unavailable,
    start() { for (const job of jobs) job.start(); },
    async stop() { await Promise.all(jobs.map(job => job.stop())); },
  };
}

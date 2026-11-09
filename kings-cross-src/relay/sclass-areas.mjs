import path from 'node:path';
import { createSclassJob } from './sclass-job.mjs';
import { areaDataDir } from './areas.mjs';

/** Build daily private relearn jobs with one state directory per area. */
export function createAreaSclassJobs({ dataDir, areas, anchorsPath, tablePath, areaAssets = {}, createJob = createSclassJob,
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

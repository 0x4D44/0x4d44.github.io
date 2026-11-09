// The per-camera frame-rate sweep over every fixed station camera: which cameras to run, and how one pair's results (and the three
// cold/warm pairs' together) are summarised for the axis 8 evidence. Pure functions: the perf tool does the browser work.

/**
 * The cameras of a sweep from the station cameras (evidence.mjs `stationCameras`) and a `--stations` value: `all`, `none`, or
 * comma-separated camera names. Each entry is what the page needs to place the lens.
 */
export function sweepCameraList(stationCameras, spec = 'all') {
  const names = Object.keys(stationCameras ?? {});
  if (spec === 'none') return [];
  const chosen = spec === 'all' ? names : String(spec).split(',').map(name => name.trim());
  const unknown = chosen.filter(name => !names.includes(name));
  if (unknown.length || chosen.some(name => !name)) throw new Error(`--stations must be all, none or station camera names; unknown: ${unknown.join(', ') || '(empty name)'}`);
  if (new Set(chosen).size !== chosen.length) throw new Error('--stations names a camera twice');
  return chosen.map(name => {
    const { pos, target, fov, near, grid } = stationCameras[name];
    return { name, pos, target, fov: fov ?? 50, near: near ?? .1, ...(grid ? { grid: true } : {}) };
  });
}

const finite = value => typeof value === 'number' && Number.isFinite(value);
const spread = values => {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  return sorted.length ? { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1) } : null;
};

/** One pair's sweep: how many cameras held 60 FPS, how many were measured at the peak, and the worst of each figure. */
export function sweepSummary(cameras) {
  const rows = Object.entries(cameras ?? {});
  const worst = (pick, direction) => rows.reduce((best, [name, camera]) => {
    const value = pick(camera);
    return finite(value) && (!best || (direction === 'min' ? value < best.value : value > best.value)) ? { camera: name, value } : best;
  }, null);
  const medians = rows.map(([, camera]) => camera.trainsShown?.median);
  return {
    cameras: rows.length,
    steadyAt60: rows.filter(([, camera]) => camera.steady60 === true).length,
    notSteady: rows.filter(([, camera]) => camera.steady60 !== true).map(([name]) => name),
    busy: rows.filter(([, camera]) => camera.busy === true).length,
    notBusy: rows.filter(([, camera]) => camera.busy !== true).map(([name]) => name),
    allRealMetal: rows.length > 0 && rows.every(([, camera]) => camera.realMetal === true && camera.rAFThrottleDetected === false),
    worstMedianFps: worst(camera => camera.fps?.median, 'min'),
    slowestP99Ms: worst(camera => camera.frameDistribution?.p99, 'max'),
    mostSlowFrames: worst(camera => camera.frameDistribution?.slowShare, 'max'),
    trainsShownMedian: spread(medians),
  };
}

/**
 * The sweeps of several cold/warm pairs together, per camera: the spread of its median FPS over the pairs, its worst slow-frame share and
 * p99, and whether it was steady at 60 and busy in every pair. `reports` are perf reports; those without a station sweep are ignored.
 */
export function sweepAcrossPairs(reports) {
  const swept = reports.filter(report => report.stationCameras && Object.keys(report.stationCameras).length);
  if (!swept.length) return null;
  const names = [...new Set(swept.flatMap(report => Object.keys(report.stationCameras)))];
  const everyPair = name => swept.every(report => report.stationCameras[name]);
  const cameras = Object.fromEntries(names.map(name => {
    const perPair = swept.map(report => report.stationCameras[name]).filter(Boolean);
    return [name, {
      pairs: perPair.length,
      medianFps: spread(perPair.map(c => c.fps?.median)),
      p5Fps: spread(perPair.map(c => c.fps?.p5)),
      p99FrameMs: spread(perPair.map(c => c.frameDistribution?.p99)),
      slowShare: spread(perPair.map(c => c.frameDistribution?.slowShare)),
      missedSlots: spread(perPair.map(c => c.frameDistribution?.missedSlots)),
      trainsShownMedian: spread(perPair.map(c => c.trainsShown?.median)),
      steadyEveryPair: everyPair(name) && perPair.every(c => c.steady60 === true),
      busyEveryPair: everyPair(name) && perPair.every(c => c.busy === true),
      realMetalEveryPair: everyPair(name) && perPair.every(c => c.realMetal === true && c.rAFThrottleDetected === false),
    }];
  }));
  const all = Object.values(cameras);
  return {
    pairs: swept.length, cameraCount: names.length, cameras,
    everyCameraEveryPair: all.every(camera => camera.pairs === swept.length),
    allSteadyAt60: all.every(camera => camera.steadyEveryPair),
    allBusy: all.every(camera => camera.busyEveryPair),
    allRealMetal: all.every(camera => camera.realMetalEveryPair),
    notSteady: names.filter(name => !cameras[name].steadyEveryPair), notBusy: names.filter(name => !cameras[name].busyEveryPair),
    worstMedianFps: Math.min(...all.map(camera => camera.medianFps?.min ?? Infinity)),
    slowestP99FrameMs: Math.max(...all.map(camera => camera.p99FrameMs?.max ?? -Infinity)),
    peak: swept[0].replayPeak ?? null,
    definition: 'Per fixed station camera, in every cold/warm pair: a fresh page load on the peak replay, the camera placed as in the evidence pack, two seconds to settle, then the frame times of a short window. Steady at 60 means the median second reached 60 FPS and at most 1% of the frames were slow (later than 20 ms). Busy means the camera\'s median trains drawn reached the floor set from the peak window; trains drawn counts the train groups the page shows (visible, with a visible car), whether or not this camera\'s frustum reaches them, since the renderer culls those itself. Grid-view cameras (top, side) are placed as in the pack but measured without the 10 m grid overlay. Frames are counted at draw submission, so this is an upper bound on what a display shows.',
  };
}

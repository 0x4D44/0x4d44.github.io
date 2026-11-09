// Frame-time statistics for the per-camera performance sweep: the whole distribution of frame times, not three percentiles.
// A frame time here is the gap between two requestAnimationFrame callbacks. At 60 Hz it is 16.7 ms when nothing is late; a late frame
// shows as a whole number of extra slots (33.3 ms, 50 ms), so "how many frames were late, and by how much" is the honest figure.
export const FRAME_BUDGET_MS = 1000 / 60;
/** A frame later than this missed its slot (the next slot is 33.3 ms), with room for timer jitter on the 16.7 ms ones. */
export const SLOW_FRAME_MS = 20;
/** A camera is steady at 60 FPS if its median second reached 60 and no more than this share of its frames was slow. */
export const STEADY_SLOW_SHARE = 0.01;
/** Upper edges of the histogram bins, in ms; the last bin is everything above the final edge. */
export const FRAME_HISTOGRAM_EDGES_MS = Object.freeze([17.5, 20, 25, 34, 51, 100]);

const roundTo = (value, digits) => value === null ? null : Number(value.toFixed(digits));
const quantile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : null;

/**
 * The distribution of a run of frame times (ms): count, percentiles, slow frames, missed 60 Hz slots and a histogram.
 * Non-finite and non-positive entries are not frames and are dropped.
 */
export function frameDistribution(frameMs, { budgetMs = FRAME_BUDGET_MS, slowMs = SLOW_FRAME_MS, edges = FRAME_HISTOGRAM_EDGES_MS } = {}) {
  const values = (frameMs ?? []).filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const counts = Array(edges.length + 1).fill(0);
  let slowFrames = 0, missedSlots = 0;
  for (const value of values) {
    const bin = edges.findIndex(edge => value <= edge);
    counts[bin < 0 ? edges.length : bin]++;
    if (value > slowMs) { slowFrames++; missedSlots += Math.max(1, Math.round(value / budgetMs) - 1); }
  }
  return {
    frames: values.length,
    p50: roundTo(quantile(sorted, .5), 2), p90: roundTo(quantile(sorted, .9), 2), p95: roundTo(quantile(sorted, .95), 2),
    p99: roundTo(quantile(sorted, .99), 2), p999: roundTo(quantile(sorted, .999), 2), max: roundTo(sorted.at(-1) ?? null, 2),
    slowFrames, slowShare: values.length ? roundTo(slowFrames / values.length, 4) : null, missedSlots,
    histogram: { edgesMs: [...edges], counts },
    definition: `A slow frame is later than ${slowMs} ms (a 60 Hz slot is ${roundTo(budgetMs, 2)} ms); each slow frame costs the whole slots it overran (missedSlots). Histogram bins are frame time <= each edge in ms, then everything above the last edge.`,
  };
}

/** Steady at 60 FPS: the median second reached 60 and at most STEADY_SLOW_SHARE of the frames were slow. */
export function steadyAt60(fpsMedian, distribution) {
  return typeof fpsMedian === 'number' && fpsMedian >= 60 && distribution?.slowShare != null && distribution.slowShare <= STEADY_SLOW_SHARE;
}

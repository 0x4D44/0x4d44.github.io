// Finding the busiest stretch of a replay recording and starting the page there, without a seek in the page.
//
// The replay page plays a recording from its first row at `speed` times real time and has no start-time parameter, so the quiet start of
// a recording (a few trains) is all a measurement sees unless the recording itself is cut. `windowRecording` cuts it the way a live
// connection does: it replaces every row before the chosen instant by one `snapshot` row (the berth picture and the signal bytes at that
// instant) and keeps every later row verbatim. The page places each described train in its berth at once, then plays on. No row after the
// instant is changed. The recording is private data: this module reads it in memory and the perf tool serves the result to its own
// Chrome only; nothing here writes a recording to disk.
import { trackSclass } from '../core/sclass.ts';

/** A replay is scanned at this speed to find its busy stretch; the page advances its simulation in event-time slices, so speed does not change what is drawn. */
export const SCAN_SPEED = 120;
/** Share of the window's median train count that a camera's own median must reach for the camera to count as measured at the peak. */
export const BUSY_FLOOR_SHARE = .75;

function parseRows(text) {
  const rows = [];
  String(text).split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`recording line ${index + 1} is not JSON`); }
    if (!row || typeof row !== 'object' || !Number.isFinite(row.t) || !row.e || typeof row.e !== 'object') throw new Error(`recording line ${index + 1} has no time and event`);
    rows.push({ t: row.t, e: row.e, line });
  });
  // The page sorts by time, stably, so equal times keep the recorder's order; do the same.
  return rows.sort((a, b) => a.t - b.t);
}

/**
 * Which description sits in which berth after the TD events before an instant, by the page's own rule (core/motion.ts berthOwners):
 * a step empties its origin berth and fills its destination; an interpose fills one; a cancel empties the berth that holds the description
 * (or only the named origin when it names one).
 */
function berthsAfter(rows, area) {
  const berths = new Map();
  for (const { e } of rows) {
    if (e.area !== area) continue;
    if (e.kind === 'step' && e.from) berths.delete(e.from);
    if ((e.kind === 'step' || e.kind === 'interpose') && e.to && e.descr) berths.set(e.to, e.descr);
    if (e.kind === 'cancel' && e.descr) for (const [berth, owner] of [...berths]) if (owner === e.descr && (!e.from || e.from === berth)) berths.delete(berth);
  }
  return Object.fromEntries([...berths].sort(([a], [b]) => a.localeCompare(b)));
}

/** The snapshot event for one TD area at an instant: berths, plus the signal bytes when any were seen. */
function snapshotAt(rowsBefore, area) {
  const berths = berthsAfter(rowsBefore, area);
  const bytes = trackSclass(rowsBefore.filter(row => row.e.area === area), area).state;
  const data = Object.fromEntries(Object.entries(bytes).map(([address, value]) => [address, value.toString(16).padStart(2, '0')]));
  const addresses = Object.keys(data).length;
  return { kind: 'snapshot', area, berths, ...(addresses ? { sclass: { addresses, data } } : {}) };
}

/**
 * The recording text, restarted at `startMs` (replay clock, epoch ms): one snapshot row per TD area seen before it, stamped `startMs`,
 * then every row at or after it exactly as recorded.
 * @returns {{ text: string, startMs: number, areas: string[], rowsBefore: number, rowsAfter: number, berths: Record<string, number> }}
 */
export function windowRecording(text, startMs) {
  if (!Number.isFinite(startMs)) throw new Error('the window start must be a finite replay clock time');
  const rows = parseRows(text);
  const before = rows.filter(row => row.t < startMs), after = rows.filter(row => row.t >= startMs);
  const areas = [...new Set(before.map(row => row.e.area).filter(area => typeof area === 'string'))].sort();
  const snapshots = areas.map(area => ({ t: startMs, e: snapshotAt(before, area) }));
  const lines = [...snapshots.map(row => JSON.stringify(row)), ...after.map(row => row.line)];
  return {
    text: lines.length ? `${lines.join('\n')}\n` : '', startMs, areas, rowsBefore: before.length, rowsAfter: after.length,
    berths: Object.fromEntries(snapshots.map(row => [row.e.area, Object.keys(row.e.berths).length])),
  };
}

const lowerQuantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];

/**
 * The busiest window of a scan. `series` is `[{ clockMs, shown }]`: the replay clock and the trains drawn at it. The window is the
 * `windowMs` stretch (or the whole series when it is shorter) whose quietest sample is the busiest, so a lone spike does not win over a
 * stretch that stays busy and a dip at the start (where every camera's page load begins) cannot hide in the average; ties go to the
 * higher median, then the earlier start. A window never runs past the last sample.
 * @returns {null | { startMs, endMs, windowMs, samples, minShown, p25Shown, medianShown, meanShown, maxShown, busyFloor }}
 */
export function peakWindow(series, windowMs, { floorShare = BUSY_FLOOR_SHARE } = {}) {
  const samples = (series ?? []).filter(s => Number.isFinite(s?.clockMs) && Number.isFinite(s?.shown)).sort((a, b) => a.clockMs - b.clockMs);
  if (!samples.length) return null;
  const first = samples[0].clockMs, last = samples.at(-1).clockMs;
  const span = Math.max(0, Math.min(windowMs, last - first));
  let best = null;
  for (const { clockMs: startMs } of samples) {
    if (startMs + span > last) break;
    const shown = samples.filter(s => s.clockMs >= startMs && s.clockMs <= startMs + span).map(s => s.shown).sort((a, b) => a - b);
    const quietest = shown[0], median = lowerQuantile(shown, .5);
    if (best && (quietest < best.minShown || (quietest === best.minShown && median <= best.medianShown))) continue;
    best = { startMs, endMs: startMs + span, windowMs: span, samples: shown.length, minShown: quietest, p25Shown: lowerQuantile(shown, .25), medianShown: median,
      meanShown: Number((shown.reduce((sum, value) => sum + value, 0) / shown.length).toFixed(2)), maxShown: shown.at(-1) };
  }
  return best && { ...best, busyFloor: Math.max(1, Math.floor(floorShare * best.medianShown)) };
}

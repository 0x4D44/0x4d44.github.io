// Rules, scoring, difficulty, timetable helpers. Pure functions - unit tested.
import { clamp, wrapL } from './util.js';

export const DIFFICULTY = {
  easy: { id: 'easy', label: 'Easy', overTolKmh: 6, atpKmh: 14, autoBrake: true, autoDoors: true, vigilance: false, lagApply: 0.45, lagRelease: 0.6, penalty: 0.5, hints: true, ignoreSide: true, signalCutout: true },
  standard: { id: 'standard', label: 'Standard', overTolKmh: 3, atpKmh: 10, autoBrake: false, autoDoors: false, vigilance: true, lagApply: 0.6, lagRelease: 0.9, penalty: 1, hints: true, ignoreSide: false, signalCutout: false },
  expert: { id: 'expert', label: 'Expert', overTolKmh: 1.5, atpKmh: 6, autoBrake: false, autoDoors: false, vigilance: true, lagApply: 0.9, lagRelease: 1.3, penalty: 1.6, hints: false, ignoreSide: false, signalCutout: false },
};

/** Platform interval along chainage for a stop whose mark is the cab/front position. */
export function platformInterval(stop, trainLen, platLen) {
  const len = Math.max(platLen || 0, trainLen + 6);
  const centre = stop.s - trainLen / 2;
  return { start: centre - len / 2, end: centre + len / 2, centre, len };
}

/**
 * Which side of the track (relative to travel) the platform is on: +1 right, -1 left.
 * `straight` {cx,cz,tx,tz} is the local track centre/heading; platform centre (px,pz) from data.
 */
export function platformSide(straight, plat, lineKey, fallback = 1) {
  if (!plat || !straight) return fallback;
  const px = plat.centreX, pz = plat.centreZ;
  if (!isFinite(px) || !isFinite(pz)) return fallback;
  const rx = -straight.tz, rz = straight.tx;
  const off = (px - straight.cx) * rx + (pz - straight.cz) * rz;
  if (Math.abs(off) < 0.9 || Math.abs(off) > 40) return fallback;
  return off > 0 ? 1 : -1;
}

/**
 * Door permission. front/rear chainage in the same (unwrapped) frame as the platform interval.
 * Returns { ok, reason }.
 */
export function doorPermission({ v, front, rear, pf, side, platSide, ignoreSide = false, tol = 0.6 }) {
  if (v > 0.1) return { ok: false, reason: 'TRAIN NOT STOPPED' };
  if (rear < pf.start - tol || front > pf.end + tol) {
    return { ok: false, reason: front > pf.end + tol ? 'OVERRUN - NOT AT PLATFORM' : 'NOT AT PLATFORM' };
  }
  if (!ignoreSide && side !== platSide) return { ok: false, reason: 'WRONG SIDE - PLATFORM ' + (platSide > 0 ? 'RIGHT' : 'LEFT') };
  return { ok: true, reason: '' };
}

/** err = front - mark (m): negative = stopped short, positive = overshoot. */
export function berthingScore(err) {
  const a = Math.abs(err);
  if (a <= 0.5) return 100;
  if (a <= 1.0) return 90;
  if (a <= 2.0) return 75;
  if (a <= 4.0) return 55;
  if (a <= 8.0) return 30;
  return 10;
}
export function berthingLabel(err) {
  const a = Math.abs(err);
  if (a <= 0.5) return 'PERFECT';
  if (a <= 1) return 'EXCELLENT';
  if (a <= 2) return 'GOOD';
  if (a <= 4) return 'FAIR';
  return err < 0 ? 'SHORT' : 'LONG';
}
/** late > 0 means behind timetable. */
export function punctualityScore(lateS) {
  const a = Math.abs(lateS);
  if (a <= 5) return 100;
  return Math.max(0, Math.round(100 - (a - 5) * 2.2));
}

/** Build a timetable from run times. Returns { arr[], dep[], period }. runTimes[k] = dep(k) -> arr(k+1). */
export function buildSchedule(runTimes, dwells, slack = 1.06, startDep = 0) {
  const n = runTimes.length, arr = new Array(n), dep = new Array(n);
  dep[0] = startDep; arr[0] = startDep - dwells[0];
  for (let k = 1; k < n; k++) {
    arr[k] = dep[k - 1] + runTimes[k - 1] * slack;
    dep[k] = arr[k] + dwells[k];
  }
  const period = dep[n - 1] + runTimes[n - 1] * slack - arr[0] - 0 - (dep[0] - arr[0]) + (dep[0] - arr[0]);
  return { arr, dep, period: dep[n - 1] + runTimes[n - 1] * slack - dep[0] };
}

export function schedTime(schedule, k, lap, which) {
  return schedule[which][k] + lap * schedule.period;
}

export function gradeFromScore(total, max) {
  const r = max > 0 ? total / max : 0;
  if (r >= 0.9) return 'S';
  if (r >= 0.8) return 'A';
  if (r >= 0.65) return 'B';
  if (r >= 0.5) return 'C';
  return 'D';
}

/** Passenger exchange at a stop: returns { alight, board, missed }. */
export function paxExchange(onboard, waiting, capacity, rng) {
  const alight = Math.min(onboard, Math.round(onboard * (0.28 + rng() * 0.3)));
  const room = capacity - (onboard - alight);
  const board = Math.max(0, Math.min(waiting, room));
  return { alight, board, missed: Math.max(0, waiting - board) };
}

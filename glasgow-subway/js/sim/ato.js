// Automatic train operation / driver assist: computes a service cmd (-1..1) to track the
// safe-speed profile and stop at a target chainage. Pure.
import { G, KMH, clamp } from './util.js';

/**
 * @param train  Train  (s = front chainage, unwrapped or wrapped consistently with track)
 * @param track  Track
 * @param dStop  distance ahead (m) to the stop mark, or null if none
 * @param o      { aStop:0.72, margin:0.0, speedFactor:0.97 }
 * @returns { cmd, vTarget, vStop, needBrake }  needBrake: brake fraction required by constraints (0..1)
 */
export function atoControl(train, track, dStop, o = {}) {
  const aStop = o.aStop ?? 0.72, sf = o.speedFactor ?? 0.97;
  const s = train.s, v = train.v;
  const grade = track.gradient(s), k = track.curvature(s);
  const vSafe = Math.min(track.safeSpeed(s + v * 1.2), track.limit(s)) * sf;
  let vStop = Infinity;
  if (dStop != null) {
    const d = Math.max(0, dStop);
    // approach curve with a gentle final creep so the stop is exact
    vStop = Math.sqrt(2 * aStop * d);
    if (d < 6) vStop = Math.min(vStop, 0.35 + 0.8 * d);
    if (d < 0.25) vStop = 0;
  }
  const vT = Math.min(vSafe, vStop, train.stock.maxKmh * KMH * 0.98);
  const aBrk = train.brakeAccel();
  // desired acceleration to converge on vT within ~1.2 s
  let aReq = clamp((vT - v) / 1.2, -aBrk * 0.95, train.tractiveAccel(v) * 0.95);
  // coast down gently when only slightly above target
  const aNeed = aReq + G * grade * train.dir + train.resistance(v, k);
  let cmd;
  if (aNeed >= 0) cmd = clamp(aNeed / Math.max(0.1, train.tractiveAccel(v)), 0, 1);
  else cmd = -clamp(-aNeed / aBrk, 0, 1);
  // braking requirement from stop distance (anticipates lag)
  let needBrake = 0;
  if (dStop != null && v > 0.05) {
    const d = Math.max(0.15, dStop - v * 0.35);
    const aReqStop = v * v / (2 * d);
    needBrake = clamp((aReqStop + G * grade * train.dir * 0 ) / aBrk, 0, 1.5);
    if (needBrake > 0.9 * (aStop / aBrk) && cmd > -needBrake) cmd = -Math.min(1, needBrake);
  }
  if (v > vSafe * 1.03) needBrake = Math.max(needBrake, 0.35);
  if (dStop != null && dStop < 0.6 && v < 0.6) cmd = -1; // hold at the mark
  if (vT <= 0.01 && v < 0.2) cmd = -1;
  return { cmd, vTarget: vT, vStop, vSafe, needBrake };
}

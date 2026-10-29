// Combined-slip tyre model (DYNAMICS lane). Pure, allocation free.
// Brush-like normalised slip with a friction ellipse: slip ratio and slip angle are normalised by the
// surface's peak slip, force magnitude follows a curve that peaks at s = 1 then falls to muSlide with a
// surface-dependent decay (gravel falls off gently => slides are controllable and catchable).

import { SURFACE_INFO } from "./surfaces.mjs";

// per-surface grip multiplier for each tyre compound (index = SURFACE id, 13 entries)
export const TYRE_GRIP = {
  //          gravel dirt  tarmac mud  snow  pumice grass leaf tussock scree sand snowD water
  gravel: [1.04, 1.02, 0.93, 1.08, 0.9, 1.02, 1, 1, 1, 1, 1, 1, 1],
  tarmac: [0.86, 0.88, 1.06, 0.72, 0.5, 0.84, 0.82, 0.82, 0.82, 0.82, 0.85, 0.6, 0.9],
  snow: [0.96, 0.96, 0.82, 1.04, 1.36, 0.95, 1, 1, 1, 1, 1, 1.1, 1],
};
export const TYRE_ROLL = { gravel: 1.0, tarmac: 0.9, snow: 1.1 };

const VMIN = 1.1; // m/s: low-speed floor of the slip denominators (keeps the model finite at rest)
const KX = 1.04; // longitudinal peak a touch above lateral
const KY = 1.0;

export const tyreOut = { fx: 0, fy: 0, kappa: 0, alpha: 0, skid: 0, dFxdw: 0, power: 0 };

/** Falloff rate beyond peak: tarmac drops sharply, gravel/snow gently. */
export function falloffOf(peakSlip) {
  const k = 3.0 - 10 * peakSlip;
  return k < 0.7 ? 0.7 : k > 2.6 ? 2.6 : k;
}

/**
 * @param fz      normal load (N)
 * @param vx,vy   contact patch velocity in wheel frame (m/s) (x forward, y right)
 * @param wr      wheel surface speed omega*R (m/s)
 * @param surf    SURFACE id
 * @param grip    overall grip multiplier (compound, damage, temperature, axle bias)
 * @param loadRef static load of this wheel (N) for load sensitivity
 * @param R       wheel radius
 * Writes tyreOut {fx, fy, kappa, alpha, skid, dFxdw (N per rad/s, for implicit wheel integration)}.
 */
export function tyreForce(fz, vx, vy, wr, surf, grip, loadRef, R) {
  const o = tyreOut;
  const si = SURFACE_INFO[surf] || SURFACE_INFO[0];
  if (fz <= 1) {
    o.fx = 0; o.fy = 0; o.kappa = 0; o.alpha = 0; o.skid = 0; o.dFxdw = 0; o.power = 0;
    return o;
  }
  const lr = fz / loadRef - 1;
  const ls = lr < -0.6 ? -0.6 : lr > 1.5 ? 1.5 : lr;
  const mu = si.mu * grip * (1 - 0.2 * ls);
  const den = Math.sqrt(vx * vx + VMIN * VMIN);
  const kappa = (wr - vx) / den;
  const tanA = vy / den;
  const sx = kappa / si.peakSlip;
  const sy = tanA / si.peakSlip;
  const s = Math.sqrt(sx * sx + sy * sy);
  let f;
  if (s < 1) {
    const u = 1 - s;
    f = 1 - u * u;
  } else {
    const ms = si.muSlide;
    f = ms + (1 - ms) * Math.exp(-(s - 1) * falloffOf(si.peakSlip));
  }
  // a locked or wildly spinning wheel loses grip (wedge/plough on loose surfaces)
  const ak = kappa < 0 ? -kappa : kappa;
  if (ak > 0.3 && s > 1e-6) {
    const t = (ak - 0.3) / 0.6;
    const lp = (t > 1 ? 1 : t) * (si.mu >= 0.95 ? 0.1 : 0.2) * (kappa > 0 ? 0.4 : 1) * ((sx * sx) / (s * s));
    f *= 1 - lp;
  }
  const fmag = mu * fz * f;
  if (s > 1e-6) {
    o.fx = (fmag * KX * sx) / s;
    o.fy = (-fmag * KY * sy) / s;
  } else {
    o.fx = 0;
    o.fy = 0;
  }
  o.kappa = kappa;
  o.alpha = Math.atan(tanA);
  const sk = (s - 0.85) / 1.3;
  o.skid = sk < 0 ? 0 : sk > 1 ? 1 : sk;
  // stiffness for implicit wheel spin integration
  const slope = s < 1 ? Math.max(0.25, 2 * (1 - s)) : 0.25;
  o.dFxdw = (mu * fz * KX * slope * R) / (si.peakSlip * den);
  o.power = Math.abs(o.fx * (wr - vx)) + Math.abs(o.fy * vy);
  return o;
}

// Shared maths helpers. Pure, no DOM, no THREE. Lead-owned contract file: add, never change.
// Conventions (see ../CONTRACTS.md): SI units, +Y up, forward at yaw 0 is -Z, yaw is Three.js rotation.y.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (a, b, c, d, v) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (a, b, v) => {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, v) => {
  const t = clamp01(invLerp(a, b, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const sign = (v) => (v < 0 ? -1 : 1);
export const mod = (a, n) => ((a % n) + n) % n;

/** Wrap an angle into (-PI, PI]. */
export const wrapPi = (a) => {
  a = mod(a + Math.PI, TAU) - Math.PI;
  return a === -Math.PI ? Math.PI : a;
};

/** Frame-rate independent exponential smoothing toward a target. `lambda` is 1/seconds. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current, target, maxDelta) =>
  current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target);

/** Forward unit vector (x, z) for a yaw. yaw 0 -> (0, -1). */
export const forwardOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
/** Right-hand unit vector (x, z) for a yaw. yaw 0 -> (1, 0). */
export const rightOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
/** Yaw whose forward vector points along (fx, fz). */
export const yawOfDir = (fx, fz) => Math.atan2(-fx, -fz);

export const hypot2 = (x, z) => Math.sqrt(x * x + z * z);
export const kmh = (ms) => ms * 3.6;
export const ms = (kmhv) => kmhv / 3.6;

/** Format seconds as M:SS.mmm (or SS.mmm under a minute when `short`). */
export function formatTime(sec, short = false) {
  if (!Number.isFinite(sec)) return "--:--.---";
  const neg = sec < 0;
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const body = short && m === 0 ? s.toFixed(3) : `${m}:${s.toFixed(3).padStart(6, "0")}`;
  return neg ? `-${body}` : body;
}

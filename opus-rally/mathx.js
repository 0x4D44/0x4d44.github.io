// Scalar helpers shared by the whole game. Everything here is allocation-free
// and branch-light, because most of it runs four times per wheel per substep.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function saturate(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export const mix = lerp;

export function invLerp(a, b, v) {
  return a === b ? 0 : (v - a) / (b - a);
}

export function remap(v, inA, inB, outA, outB) {
  return lerp(outA, outB, saturate(invLerp(inA, inB, v)));
}

export function smoothstep(a, b, v) {
  const t = saturate(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}

export function smootherstep(a, b, v) {
  const t = saturate(invLerp(a, b, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Framerate-independent exponential smoothing. `rate` is the reciprocal of the
// time constant, so a rate of 8 settles ~63% of the way in an eighth of a second
// whatever the step size — the naive `lerp(a, b, 0.1)` does not.
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

export function moveToward(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export const approach = moveToward;

export function sign(v) {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

// Wrap to (-PI, PI]. Used everywhere a heading is differenced.
export function wrapAngle(a) {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export function cubicHermite(p0, m0, p1, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0
    + (t3 - 2 * t2 + t) * m0
    + (-2 * t3 + 3 * t2) * p1
    + (t3 - t2) * m1;
}

export function catmullRom(p0, p1, p2, p3, t) {
  return cubicHermite(p1, (p2 - p0) * 0.5, p2, (p3 - p1) * 0.5, t);
}

export function easeOutCubic(t) {
  const u = 1 - saturate(t);
  return 1 - u * u * u;
}

export function easeInOutCubic(t) {
  const x = saturate(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutBack(t) {
  const x = saturate(t) - 1;
  return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
}

// Signed magnitude-preserving power curve — the shape steering and throttle
// response want: gentle near centre, linear at full lock.
export function shape(v, gamma) {
  const a = Math.abs(v);
  return Math.sign(v) * Math.pow(a, gamma);
}

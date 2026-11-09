// The shape of a cab end, as pure functions of distance from the nose tip: how wide, how tall and how
// low the body is, and how round its section is. The train builder lofts rings through these, so the
// nose is a smooth surface rather than a wedge of flat panels.
//
// Three curves (width, roof line, underside) are monotone cubics through a few readings of the
// profile, so they cannot wobble between the readings; the front edge is rounded by a quarter-circle
// fillet; and the section morphs from a rounded, egg-like shape at the tip into the car's boxy one
// over the length of the nose (the front of a modern EMU is a bullet in section, the body is not).
import { clamp01, lerp, monotoneCurve, smootherstep } from './train-geom.ts';

export interface NoseKnot {
  /** distance from the tip, metres */
  s: number;
  /** the roof line (the top of the section on the centre line), metres above the rail head */
  top: number;
  /** half-width as a fraction of the body's half-width */
  ws: number;
  /** the underside of the nose, metres above the rail head */
  bottom: number;
}

export interface NoseSpec {
  /** Tip to where the body goes full section. */
  length: number;
  /** At least two knots, strictly increasing s, the first at 0 and the last at `length`. */
  knots: readonly NoseKnot[];
  /** Radius of the rounded front edge, metres: the front face joins the sides over this length. */
  fillet: number;
  /** The fraction of the nose's size the flat front face has lost to that rounding (0.3: the face is 70 % of the ring behind). */
  filletLoss: number;
  /**
   * How many ring gaps the fillet is cut into (default 12). A tight corner on a tall face (a flat-faced cab's: 0.06 lost over 0.2 m) turns the surface through
   * its quarter circle in the same number of steps as a loose one, each a sharper edge: it takes more rings to stay smooth.
   */
  filletSteps?: number;
  /** By this distance from the tip the section has morphed back to the car's. */
  roundLen: number;
  /** Where the tip section is widest, as a fraction of its height (0 at the underside, 1 at the roof), and how boxy it is (2 = ellipse). */
  widest: number;
  boxiness: number;
}

export interface Ring {
  s: number;
  /** half-width as a fraction of the body's */
  ws: number;
  top: number;
  bottom: number;
  /** 1 at the tip (the section is an egg), 0 where it has become the car's section */
  round: number;
}

/** The right half of a car's cross-section, from the bottom corner up to the roof's centre line, in metres. */
export interface Section {
  half: readonly [number, number][];
  /** Half-width of the body (the largest x). */
  width: number;
  floor: number;
  crown: number;
}

const samplers = new WeakMap<NoseSpec, { top: (s: number) => number; ws: (s: number) => number; bottom: (s: number) => number }>();
function curves(spec: NoseSpec): { top: (s: number) => number; ws: (s: number) => number; bottom: (s: number) => number } {
  let c = samplers.get(spec);
  if (!c) {
    const xs = spec.knots.map((k) => k.s);
    c = { top: monotoneCurve(xs, spec.knots.map((k) => k.top)), ws: monotoneCurve(xs, spec.knots.map((k) => k.ws)), bottom: monotoneCurve(xs, spec.knots.map((k) => k.bottom)) };
    samplers.set(spec, c);
  }
  return c;
}

/** The size factor of the rounded front edge at distance s from the tip: 1 - loss at the face, 1 from `fillet` back. A quarter circle, so the surface leaves the face square-on. */
export function filletFactor(spec: NoseSpec, s: number): number {
  if (s >= spec.fillet) return 1;
  const t = 1 - Math.max(0, s) / spec.fillet;
  return 1 - spec.filletLoss + spec.filletLoss * Math.sqrt(Math.max(0, 1 - t * t));
}

/** The ring at distance `s` from the nose tip. */
export function ringAt(spec: NoseSpec, s: number): Ring {
  const k = curves(spec);
  const f = filletFactor(spec, s);
  const top0 = k.top(s);
  const bottom0 = k.bottom(s);
  const mid = (top0 + bottom0) / 2;
  return {
    s,
    ws: k.ws(s) * f,
    top: mid + (top0 - mid) * f,
    bottom: mid - (mid - bottom0) * f,
    round: 1 - smootherstep(s / spec.roundLen),
  };
}

/**
 * Where the rings go: close together at the tip (the fillet), then about every 0.07 m. Ends exactly at `length`. (Twice as fine as it was before the budget ruling of 2026-11-09,
 * which was 6 gaps in the fillet and 0.14 m between the rings after it: a ring edge of the loft turns the surface about half as far.)
 */
export function ringStations(spec: NoseSpec): number[] {
  const out: number[] = [];
  const steps = spec.filletSteps ?? 12;
  for (let k = 0; k <= steps; k++) out.push(spec.fillet * (1 - Math.cos((k / steps) * (Math.PI / 2))));
  const n = Math.max(1, Math.ceil((spec.length - spec.fillet) / 0.07));
  for (let k = 1; k <= n; k++) out.push(lerp(spec.fillet, spec.length, k / n));
  return out;
}

/** The car section in (u, v): u across (1 at the full half-width), v up (0 at the floor, 1 at the crown). */
export function normalised(sec: Section): [number, number][] {
  return sec.half.map(([x, y]): [number, number] => [x / sec.width, (y - sec.floor) / (sec.crown - sec.floor)]);
}

/**
 * The tip's section: the same number of points as the car's, on a superellipse, spaced along it in
 * proportion to how they are spaced along the car's section (so each point keeps its place in the order
 * and the morph between the two is a straight blend, point by point).
 */
export function eggSection(norm: readonly [number, number][], widest: number, boxiness: number): [number, number][] {
  const K = norm.length;
  const cum: number[] = [0];
  for (let k = 1; k < K; k++) {
    const a = norm[k - 1] as [number, number];
    const b = norm[k] as [number, number];
    cum.push((cum[k - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[K - 1] as number;
  const vc = widest;
  const b = Math.max(vc, 1 - vc);
  const n = boxiness;
  // the ellipse meets the underside (v = 0) at this angle; the crown is at pi / 2
  const th0 = Math.asin(-Math.pow(Math.min(0.999, vc / b), n / 2));
  return norm.map((_, k): [number, number] => {
    const th = lerp(th0, Math.PI / 2, (cum[k] as number) / total);
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n), vc + b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)];
  });
}

/** The right-half points of the section at a ring, in metres: x across, y above the rail head. */
export function halfAt(sec: Section, norm: readonly [number, number][], egg: readonly [number, number][], r: Ring): [number, number][] {
  const w = 1 - r.round;
  return norm.map(([uc, vc], k): [number, number] => {
    const [ue, ve] = egg[k] as [number, number];
    return [r.ws * sec.width * lerp(ue, uc, w), r.bottom + lerp(ve, vc, w) * (r.top - r.bottom)];
  });
}

/** The whole closed outline: up the right side, down the left; the last point joins the first along the underside. */
export function loopFromHalf(half: readonly [number, number][]): [number, number][] {
  return [...half, ...half.slice(0, -1).reverse().map(([x, y]): [number, number] => [-x, y])];
}

/** x of the right-hand outline at height y (the first crossing from the bottom). */
export function xAtY(half: readonly [number, number][], y: number): number {
  for (let k = 0; k + 1 < half.length; k++) {
    const a = half[k] as [number, number];
    const b = half[k + 1] as [number, number];
    if ((y >= a[1] && y <= b[1]) || (y <= a[1] && y >= b[1])) {
      const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
      return lerp(a[0], b[0], clamp01(t));
    }
  }
  return (half[half.length - 1] as [number, number])[0];
}

/** y of the right-hand outline at distance x from the centre line, on the roof side (searched from the crown down). */
export function yAtX(half: readonly [number, number][], x: number): number {
  for (let k = half.length - 1; k >= 1; k--) {
    const a = half[k - 1] as [number, number];
    const b = half[k] as [number, number];
    if (x >= b[0] && x <= a[0]) {
      const t = a[0] === b[0] ? 1 : (a[0] - x) / (a[0] - b[0]);
      return lerp(a[1], b[1], clamp01(t));
    }
  }
  return (half[half.length - 1] as [number, number])[1];
}

/** The roof line sampled at n+1 even steps along the nose: [s, y], for the smoothness tests. */
export function sideProfile(spec: NoseSpec, n = 200): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const s = (spec.length * i) / n;
    return [s, ringAt(spec, s).top];
  });
}

/** The plan outline (half-width in metres) sampled the same way, for a body half-width `width`. */
export function planProfile(spec: NoseSpec, width: number, n = 200): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const s = (spec.length * i) / n;
    return [s, ringAt(spec, s).ws * width];
  });
}

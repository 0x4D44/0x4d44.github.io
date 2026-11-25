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

/**
 * A raked face: the whole front of a cab leans back (a Class 180's face and its screen, GC180-01, GC180-02 and GC180-05), by shearing the loft along its length. A point of the
 * loft at distance `s` from the tip and height `y` stands `rakeSet` metres farther back than the ring it is on: nothing at the chin, `lean` metres per metre of height over
 * `from` at the tip, easing to nothing by `reach`. The section and the plan are the rings' own and the roof line's heights are the knots' own: what changes is how far back
 * each height stands, so the face is a plane leaning back and the glass over it steepens (its foot is set back the most), with no new ring and no kink in the surface.
 */
export interface NoseRake {
  /** Metres set back per metre of height over `from`, at the tip: the tangent of the face's lean off the vertical (0.36 is 20 degrees). */
  lean: number;
  /** The height the lean is measured from, metres over the rail head: at or under the lowest point of the loft at the chin, so nothing is drawn forward of the tip. */
  from: number;
  /** By this distance from the tip the lean has gone, metres. It falls as (1 - s / reach) squared, which leaves the shear's own bend smooth where it ends. */
  reach: number;
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
  /**
   * A fuller cheek low on the nose, where it has one: from `s[0]` to `s[3]` back from the tip (full from `s[1]` to `s[2]`, easing in and out), between the heights `y[0]` and `y[3]`
   * (full from `y[1]` to `y[2]`), the section's outer part stands up to `by` of its half-width further out (never past the body's side: CHEEK_CLEAR). Only the width changes: the roof line and the underside stay the knots'.
   */
  cheek?: NoseCheek;
  /** The face's lean, where it has one (an upright face, and the AT300's beak, have none). Everything laid on the nose follows it: see `rakeSet`. */
  rake?: NoseRake;
}

export interface NoseCheek {
  by: number;
  s: readonly [number, number, number, number];
  y: readonly [number, number, number, number];
  /** Only the section's outer part fills out: nothing inside `u[0]` of the ring's half-width, all of `by` from `u[1]` out, easing between. */
  u: readonly [number, number];
}

/**
 * A nose's cheek fills out nothing where the section is already this fraction of the body's half-width or more, and all of its fill from CHEEK_EASE below it in, blending
 * between (so it never reaches past the body's side). CHANGED (round B15; was 0.97 and 0.12, the fill faded by a smootherstep of how far in the section stood): the fill faded
 * faster than the section widened, so along the nose the filled outline stood out, came back in 13 mm and went out again (at 1.43 m up, 1.45 to 1.9 m back: the surface there
 * faced backwards, a dark crease across the white in the 3/4 views, the B14 score). The filled width is now a monotone curve of the plain one (`cheekWidth`), never narrowing
 * as the plain section widens: this wide a blend keeps it monotone for any fill up to 0.15, and the lamps' section (0.83 of the half-width or less) keeps all of it.
 */
const CHEEK_CLEAR = 0.995;
const CHEEK_EASE = 0.165;

/**
 * The filled width, as a fraction of the body's half-width, of a section point `a` of the half-width out that the cheek fills out by the fraction `f`: `a (1 + f)` up to
 * CHEEK_CLEAR - CHEEK_EASE, `a` from CHEEK_CLEAR out, and between them the cubic Hermite joining the two lines with their slopes (C1, and monotone in `a`: round B15).
 */
export function cheekWidth(a: number, f: number): number {
  const a0 = CHEEK_CLEAR - CHEEK_EASE;
  if (f <= 0 || a >= CHEEK_CLEAR) return a;
  if (a <= a0) return a * (1 + f);
  const t = (a - a0) / CHEEK_EASE;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a0 * (1 + f) + (t3 - 2 * t2 + t) * CHEEK_EASE * (1 + f) + (-2 * t3 + 3 * t2) * CHEEK_CLEAR + (t3 - t2) * CHEEK_EASE;
}

/** 0 outside [a0, a3], 1 across [a1, a2], easing smoothly between. */
function plateau(a: readonly [number, number, number, number], x: number): number {
  if (x <= a[0] || x >= a[3]) return 0;
  if (x < a[1]) return smootherstep((x - a[0]) / (a[1] - a[0]));
  if (x > a[2]) return smootherstep((a[3] - x) / (a[3] - a[2]));
  return 1;
}

export interface Ring {
  s: number;
  /** half-width as a fraction of the body's */
  ws: number;
  top: number;
  bottom: number;
  /** 1 at the tip (the section is an egg), 0 where it has become the car's section */
  round: number;
  /** The nose's fuller cheek at this ring (its `by` eased by the distance from the tip), if any. */
  cheek?: NoseCheek;
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

/** How much of the tip's lean is left at distance `s` from the tip: 1 at the tip, 0 from `reach` back, falling as a quadratic. */
export function rakeEase(rake: NoseRake, s: number): number {
  if (s >= rake.reach) return 0;
  const t = 1 - Math.max(0, s) / rake.reach;
  return t * t;
}

/** The lean at distance `s`: metres set back per metre of height (the rake's `lean` at the tip), 0 for a nose without one. */
export function rakeLean(spec: NoseSpec, s: number): number {
  return spec.rake ? spec.rake.lean * rakeEase(spec.rake, s) : 0;
}

/** How fast the lean falls with the distance from the tip, per metre of height per metre of length (never positive). */
export function rakeLeanSlope(spec: NoseSpec, s: number): number {
  const r = spec.rake;
  return r && s < r.reach ? (-2 * r.lean * (1 - Math.max(0, s) / r.reach)) / r.reach : 0;
}

/**
 * How far back the rake sets the point at distance `s` from the tip and height `y`, metres: the lean there times its height over the rake's `from` (0 for a point under it,
 * and for a nose with no rake). The point's place along the car is `s + rakeSet`; its place across and its height stay.
 */
export function rakeSet(spec: NoseSpec, s: number, y: number): number {
  return rakeLean(spec, s) * Math.max(0, y - (spec.rake?.from ?? 0));
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
    ...(spec.cheek && plateau(spec.cheek.s, s) > 0 ? { cheek: { ...spec.cheek, by: spec.cheek.by * plateau(spec.cheek.s, s) } } : {}),
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
    const y = r.bottom + lerp(ve, vc, w) * (r.top - r.bottom);
    const u = lerp(ue, uc, w);
    const c = r.cheek;
    // (and nothing where the section already stands near the body's own width, so the cheek never reaches past the body's side: CHEEK_CLEAR, cheekWidth)
    const fill = c ? c.by * plateau(c.y, y) * smootherstep((u - c.u[0]) / (c.u[1] - c.u[0])) : 0;
    return [c ? sec.width * cheekWidth(r.ws * u, fill) : r.ws * sec.width * u, y];
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

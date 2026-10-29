// Stair core generator (pure data). One design everywhere: a DOGLEG stair (two parallel flights joined by a half landing)
// so that flight k+2 stacks exactly over flight k. Plan, in core coordinates (u across, s along the flights):
//
//   s<0 : landing (solid at every floor)          s in [0,lfl] : lane A (rises)  | divider |  lane B (rises back)
//   s in [lfl, lfl+LH] : half landing across both lanes (mid-height)
//
// Floor k (k>=1) has a slab HOLE over the whole core except the landing. Flight A(t) goes floor t -> half landing,
// flight B(t) goes half landing -> floor t+1 and arrives on the landing of floor t+1 (flush with the slab).
// The space under B(t) at floor t is a low nook: it is blocked off by a panel (collider + mesh) so nobody bumps the soffit.
import { R, rectMinusRects } from './geom.js';

export const STAIR = { RUN: 0.27, FW: 0.95, DIV: 0.12, LDG: 1.0, LH: 1.0 };

export function coreDims(fh) {
  const n = 2 * Math.max(7, Math.min(9, Math.round(fh / 0.36))), nh = n / 2;
  const lfl = (nh - 1) * STAIR.RUN;
  return { n, nh, rise: fh / n, run: STAIR.RUN, lfl, across: 2 * STAIR.FW + STAIR.DIV, along: STAIR.LDG + lfl + STAIR.LH };
}

/**
 * origin = [x,z] of the corner (u=0, s=0) on the landing edge; U,S = axis-aligned unit vectors (across, along the flights).
 * nUp = number of floor transitions served (0..nUp-1); fh = floor-to-floor; y0 = local y of floor 0.
 */
export function makeCore({ origin, U, S, fh, nUp, floors, roof, y0 = 0 }) {
  const d = coreDims(fh), { n, nh, rise, run, lfl } = d;
  const { FW, DIV, LDG, LH } = STAIR, across = d.across;
  const P = (u, s) => [origin[0] + U[0] * u + S[0] * s, origin[1] + U[1] * u + S[1] * s];
  const rect = (u0, s0, u1, s1) => {
    const a = P(u0, s0), b = P(u1, s1);
    return R(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
  };
  const uB = FW + DIV;
  const whole = rect(0, -LDG, across, lfl + LH);
  const landing = rect(0, -LDG, across, 0);
  const voidRect = rect(0, 0, across, lfl + LH);
  const flights = [], halfLandings = [], dividers = [], nooks = [], guards = [], paths = [], stairs = [];
  for (let t = 0; t < nUp; t++) {
    const yb = y0 + t * fh, yh = yb + nh * rise;
    const a = { id: `A${t}`, lane: 'A', t, rect: rect(0, 0, FW, lfl), from: P(FW / 2, 0), to: P(FW / 2, lfl), yFrom: yb + rise, yTo: yh, y0: yb, y1: yh, dirS: +1 };
    const b = { id: `B${t}`, lane: 'B', t, rect: rect(uB, 0, across, lfl), from: P(uB + FW / 2, lfl), to: P(uB + FW / 2, 0), yFrom: yh + rise, yTo: yb + fh, y0: yh, y1: yb + fh, dirS: -1 };
    flights.push(a, b);
    halfLandings.push({ t, rect: rect(0, lfl, across, lfl + LH), y: yh });
    // collider extends 1 m above the upper floor: physics ignores walls lower than feet+0.4, and the player stands near that level
    dividers.push({ t, p1: P(FW + DIV / 2, 0), p2: P(FW + DIV / 2, lfl), y0: yb, y1: yb + fh + 1.0, half: DIV / 2 });
    // only the lowest flight has an open nook underneath it (above the ground floor); higher up the space under B(t) is B(t-1)
    if (t === 0) nooks.push({ t, p1: P(uB, 0.02), p2: P(across, 0.02), y0: yb, y1: yb + fh, rect: rect(uB, 0, across, lfl) });
    const pa = P(FW / 2, 0), pb = P(FW / 2, lfl), ph = P(across / 2, lfl + LH / 2), pc = P(uB + FW / 2, lfl), pd = P(uB + FW / 2, 0);
    const l0 = P(across / 2, -LDG / 2);
    paths.push({ t, pts: [[l0[0], l0[1], yb], [pa[0], pa[1], yb + rise], [pb[0], pb[1], yh], [ph[0], ph[1], yh], [pc[0], pc[1], yh + rise], [pd[0], pd[1], yb + fh], [l0[0], l0[1], yb + fh]] });
    stairs.push({
      floors: [t, t + 1], from: [pa[0], pa[1]], to: [pd[0], pd[1]], width: FW, steps: n, rise, run,
      hole: [[voidRect.x0, voidRect.z0], [voidRect.x1, voidRect.z0], [voidRect.x1, voidRect.z1], [voidRect.x0, voidRect.z1]],
      flights: [{ from: a.from, to: a.to, y0: yb, y1: yh, steps: nh }, { from: b.from, to: b.to, y0: yh, y1: yb + fh, steps: nh }],
      landing: rect(0, -LDG, across, 0), halfLanding: rect(0, lfl, across, lfl + LH), path: paths[paths.length - 1].pts,
    });
  }
  // the top served floor has an open lane A void (no flight above it): guard it
  if (nUp > 0) {
    const yt = y0 + nUp * fh;
    guards.push({ floor: nUp, p1: P(0, 0.04), p2: P(FW, 0.04), y0: yt, y1: yt + 1.0, rail: true });
  }
  return {
    ...d, origin, U, S, P, rect: whole, landing, voidRect, flights, halfLandings, dividers, nooks, guards, paths, stairs, nUp,
    /** Slab holes: floors 1..nUp get the void rect (roof floor index = `floors`). */
    holeAt(k) { return k >= 1 && k <= nUp ? voidRect : null; },
    landingAt(k) { return k >= 0 && k <= nUp ? landing : null; },
  };
}

/** Floor rectangles of `outer` minus the given holes, as colliders helper (local rects). */
export function slabPieces(outer, holes) { return rectMinusRects(outer, holes.filter(Boolean)); }

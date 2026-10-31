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
/** The stair of a public building (the school): flights 1.4 m wide, a landing and a half landing at least as deep as a flight is wide. LDG and LH are the layout's to set (it knows the depth it has). */
export const STAIR_WIDE = { RUN: 0.27, FW: 1.4, DIV: 0.12, LDG: 1.6, LH: 1.5 };

/** Dimensions of the dogleg core for floor-to-floor height `fh`; `style` is one of the STAIR tables above (a layout may pass its own LDG / LH). */
export function coreDims(fh, style = STAIR) {
  const n = 2 * Math.max(7, Math.min(9, Math.round(fh / 0.36))), nh = n / 2;
  const lfl = (nh - 1) * style.RUN;
  return { n, nh, rise: fh / n, run: style.RUN, lfl, fw: style.FW, div: style.DIV, ldg: style.LDG, lh: style.LH, across: 2 * style.FW + style.DIV, along: style.LDG + lfl + style.LH };
}

/**
 * origin = [x,z] of the corner (u=0, s=0) on the landing edge; U,S = axis-aligned unit vectors (across, along the flights).
 * nUp = number of floor transitions served (0..nUp-1); fh = floor-to-floor; y0 = local y of floor 0.
 */
export function makeCore({ origin, U, S, fh, nUp, floors, roof, y0 = 0, style = STAIR }) {
  const d = coreDims(fh, style), { n, nh, rise, run, lfl } = d;
  const { fw: FW, div: DIV, ldg: LDG, lh: LH } = d, across = d.across;
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
  const inRect = (r, x, z) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
  return {
    ...d, origin, U, S, P, rect: whole, landing, voidRect, flights, halfLandings, dividers, nooks, guards, paths, stairs, nUp,
    /** Slab holes: floors 1..nUp get the void rect (roof floor index = `floors`). */
    holeAt(k) { return k >= 1 && k <= nUp ? voidRect : null; },
    landingAt(k) { return k >= 0 && k <= nUp ? landing : null; },
    /**
     * Every height (building-local y) a person can stand at over the plan point (x, z): the landing of each floor, the treads of a flight (a ramp through the tread tops, a
     * little high rather than low) and a half landing. Windows and posters in a stair wall hang from these, not from the storey (openings.js `stairClear`).
     */
    surfacesAt(x, z) {
      const out = [];
      if (inRect(landing, x, z)) for (let k = 0; k <= nUp; k++) out.push(y0 + k * fh);
      for (const f of flights) {
        if (!inRect(f.rect, x, z)) continue;
        const dx = f.to[0] - f.from[0], dz = f.to[1] - f.from[1], t = ((x - f.from[0]) * dx + (z - f.from[1]) * dz) / (dx * dx + dz * dz);
        out.push(f.yFrom + Math.max(0, Math.min(1, t)) * (f.yTo - f.yFrom));
      }
      for (const h of halfLandings) if (inRect(h.rect, x, z)) out.push(h.y);
      return out;
    },
  };
}

/** Floor rectangles of `outer` minus the given holes, as colliders helper (local rects). */
export function slabPieces(outer, holes) { return rectMinusRects(outer, holes.filter(Boolean)); }

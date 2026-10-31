// Window grilles (rejas): wrought iron in front of the glass, in four patterns (R1 "rejas, cables, depth of thresholds": every grille was the same picket row with three rails).
//   bars       upright pickets and three rails, the plain barrotes of a house
//   diamond    a lattice of two sets of diagonals (rombos)
//   grid       upright and cross bars in a square mesh (cuadricula)
//   medallion  pickets that stop at a ring in the middle of the window (medallon)
// The iron is flat strips 14-26 mm wide, drawn from both sides (two quads at one plane, one looking each way: `grille_iron` is a single-sided material), so a bar costs 4
// triangles where the 14 mm box it replaces cost 8, and the four patterns together are cheaper than the one grille they replace. The pattern is a hash of the lot (a house has its
// one herrero, so most of its windows carry the same pattern), with now and then a window of another.
import { qd, hash01 } from './mb.js';

export const REJA_PATTERNS = ['bars', 'diamond', 'grid', 'medallion'];
const IRON = 0.014, RAIL = 0.024, RING = 0.026, PITCH = 0.11, LAYER = 0.0015;

/** The pattern of one window's grille (`win` needs `id`, `w`, `h`): the lot's own for seven windows in ten, else one the window's id hashes to. A pattern that needs room falls back to bars. */
export function rejaPattern(lotId, win) {
  const pick = hash01(String(lotId), 71) < 0.7 ? hash01(String(lotId), 72) : hash01(String(win.id), 73);
  let p = REJA_PATTERNS[Math.min(3, Math.floor(pick * 4))];
  if (p === 'medallion' && (win.w < 0.8 || win.h < 0.8)) p = 'bars';
  if (p === 'diamond' && (win.w < 0.5 || win.h < 0.5)) p = 'bars';
  return p;
}

/** One flat iron strip from a to c (wall coordinates [u, y]), `wd` wide in the plane of the wall, on layer k (k x 1.5 mm toward the street, so crossing bars never fight for depth). */
function strip(b, mat, P, look, back, a, c, wd, col, k) {
  const du = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(du, dy);
  if (l < 1e-4) return;
  const nu = (-dy / l) * (wd / 2), ny = (du / l) * (wd / 2);
  const A = P(a[0] + nu, a[1] + ny, k), B = P(c[0] + nu, c[1] + ny, k), C = P(c[0] - nu, c[1] - ny, k), D = P(a[0] - nu, a[1] - ny, k);
  qd(b, mat, A, B, C, D, look, { col });
  qd(b, mat, A, B, C, D, back, { col });
}

/**
 * Build one grille filling the rectangle u0..u1 x y0..y1 (wall coordinates: u along the wall, y up). `P(u, y, k)` maps a wall point on layer k to a building-local point,
 * `look` is the horizontal direction the street face looks along. Every pattern has the same frame (a rail along the top and the foot, a stile at each end).
 */
export function buildReja(b, mat, P, look, { u0, u1, y0, y1 }, pattern, col) {
  const back = [-look[0], -look[1], -look[2]], gw = u1 - u0, gh = y1 - y0, uc = (u0 + u1) / 2, yc = (y0 + y1) / 2, e = RAIL / 2;
  const S = (a, c, wd, k) => strip(b, mat, P, look, back, a, c, wd, col, k);
  const inner = { a: u0 + e, c: u1 - e, d: y0 + e, f: y1 - e };                                   // the iron runs to the middle of the frame, whose strips cover the cut ends
  const post = (u, ya = inner.d, yb = inner.f, k = 0) => S([u, ya], [u, yb], IRON, k);
  const rail = (y, k = 2) => S([u0, y], [u1, y], RAIL, k);
  const frame = () => { rail(y0 + e); rail(y1 - e); S([u0 + e, y0], [u0 + e, y1], RAIL, 2); S([u1 - e, y0], [u1 - e, y1], RAIL, 2); };
  if (pattern === 'diamond') {
    const nx = Math.max(2, Math.round(gw / 0.2)), ny = Math.max(2, Math.round(gh / 0.26)), dx = (inner.c - inner.a) / nx, dy = (inner.f - inner.d) / ny;
    for (const sgn of [1, -1]) for (let k = -(ny - 1); k <= nx - 1; k++) {                       // lines of slope sgn x dy / dx through the lattice points of the foot, cut to the rectangle
      const px = sgn > 0 ? inner.a + k * dx : inner.c - k * dx, t0 = Math.max(0, sgn > 0 ? (inner.a - px) / dx : (px - inner.c) / dx), t1 = Math.min(ny, sgn > 0 ? (inner.c - px) / dx : (px - inner.a) / dx);
      if (t1 - t0 < 1e-3) continue;
      S([px + sgn * t0 * dx, inner.d + t0 * dy], [px + sgn * t1 * dx, inner.d + t1 * dy], IRON, sgn > 0 ? 0 : 1);
    }
    frame();
  } else if (pattern === 'grid') {
    const nx = Math.max(2, Math.round(gw / 0.16)), ny = Math.max(2, Math.round(gh / 0.2));
    for (let i = 1; i < nx; i++) post(inner.a + ((inner.c - inner.a) * i) / nx);
    for (let j = 1; j < ny; j++) { const y = inner.d + ((inner.f - inner.d) * j) / ny; S([inner.a, y], [inner.c, y], IRON, 1); }
    frame();
  } else if (pattern === 'medallion') {
    const r = Math.min(0.28, Math.max(0.12, 0.3 * Math.min(gw, gh))), n = Math.max(4, Math.round(gw / 0.12)), N = 12;
    for (let i = 1; i < n; i++) {
      const u = u0 + (gw * i) / n, du = Math.abs(u - uc);
      if (du < r - 0.004) { const dy = Math.sqrt(r * r - du * du); post(u, inner.d, yc - dy); post(u, yc + dy, inner.f); } else post(u);       // a picket that meets the ring stops at it
    }
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, c = ((i + 1) / N) * Math.PI * 2;
      S([uc + r * Math.cos(a), yc + r * Math.sin(a)], [uc + r * Math.cos(c), yc + r * Math.sin(c)], RING, 3);
    }
    frame();
  } else {
    const n = Math.max(3, Math.round((gw) / PITCH));
    for (let i = 1; i < n; i++) post(u0 + (gw * i) / n);
    rail(yc, 1);
    frame();
  }
}

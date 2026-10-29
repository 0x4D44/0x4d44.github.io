// Small 2D helpers shared by the architecture modules (pure data, no THREE). Everything is in the building-local frame
// (x = width axis, z = depth axis, +z = front/street) unless a name says "world".
export const T_EXT = 0.22;      // exterior wall thickness
export const T_INT = 0.11;      // interior partition thickness
export const SLAB = 0.18;       // floor slab thickness
export const EPS = 1e-4;

/** Clear rectangle {x0,z0,x1,z1}, x0<x1, z0<z1. */
export const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
export const rw = (r) => r.x1 - r.x0;
export const rd = (r) => r.z1 - r.z0;
export const rcx = (r) => (r.x0 + r.x1) / 2;
export const rcz = (r) => (r.z0 + r.z1) / 2;
export const rarea = (r) => Math.max(0, rw(r)) * Math.max(0, rd(r));
export const rcopy = (r) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
export const rinside = (r, x, z, e = 0) => x >= r.x0 - e && x <= r.x1 + e && z >= r.z0 - e && z <= r.z1 + e;
export const rpoly = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
export const roverlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS;
export const rgrow = (r, m) => R(r.x0 - m, r.z0 - m, r.x1 + m, r.z1 + m);

/** Split `r` with a partition wall of thickness t centred on z=zc -> [north (smaller z), south]. */
export function cutZ(r, zc, t = T_INT) {
  return [R(r.x0, r.z0, r.x1, zc - t / 2), R(r.x0, zc + t / 2, r.x1, r.z1)];
}
/** Split `r` with a partition wall centred on x=xc -> [west (smaller x), east]. */
export function cutX(r, xc, t = T_INT) {
  return [R(r.x0, r.z0, xc - t / 2, r.z1), R(xc + t / 2, r.z0, r.x1, r.z1)];
}
/** Cut a strip of clear depth `d` off the south (large z) edge: -> [rest (north), strip (south)]. */
export function cutSouth(r, d, t = T_INT) { return cutZ(r, r.z1 - d - t / 2, t); }
/** Cut a strip of clear depth `d` off the north edge: -> [strip (north), rest (south)]. */
export function cutNorth(r, d, t = T_INT) { return cutZ(r, r.z0 + d + t / 2, t); }
/** Cut a strip of clear width `w` off the east (large x) edge: -> [rest (west), strip (east)]. */
export function cutEast(r, w, t = T_INT) { return cutX(r, r.x1 - w - t / 2, t); }
/** Cut a strip of clear width `w` off the west edge: -> [strip (west), rest (east)]. */
export function cutWest(r, w, t = T_INT) { return cutX(r, r.x0 + w + t / 2, t); }

/**
 * Wall shared by two clear rects separated by a partition gap (0.5..1.6 x T_INT): {dir:'x'|'z', at, a0, a1}
 * dir 'z' = the wall runs along z at x=at (rects are west/east of each other); a0..a1 = overlap interval along the wall.
 * `aFirst` tells which of the two rects is on the low side.
 */
export function sharedWall(a, b, tmax = 0.35) {
  const gx1 = b.x0 - a.x1, gx2 = a.x0 - b.x1, gz1 = b.z0 - a.z1, gz2 = a.z0 - b.z1;
  const ok = (g) => g > 0.02 && g <= tmax;
  const zo0 = Math.max(a.z0, b.z0), zo1 = Math.min(a.z1, b.z1), xo0 = Math.max(a.x0, b.x0), xo1 = Math.min(a.x1, b.x1);
  if (ok(gx1) && zo1 - zo0 > 0.1) return { dir: 'z', at: a.x1 + gx1 / 2, a0: zo0, a1: zo1, t: gx1, aLow: true };
  if (ok(gx2) && zo1 - zo0 > 0.1) return { dir: 'z', at: b.x1 + gx2 / 2, a0: zo0, a1: zo1, t: gx2, aLow: false };
  if (ok(gz1) && xo1 - xo0 > 0.1) return { dir: 'x', at: a.z1 + gz1 / 2, a0: xo0, a1: xo1, t: gz1, aLow: true };
  if (ok(gz2) && xo1 - xo0 > 0.1) return { dir: 'x', at: b.z1 + gz2 / 2, a0: xo0, a1: xo1, t: gz2, aLow: false };
  return null;
}

/** `r` minus a list of rects -> array of disjoint rects covering the remainder. */
export function rectMinusRects(r, holes) {
  let pieces = [rcopy(r)];
  for (const h of holes) {
    const next = [];
    for (const p of pieces) {
      const ix0 = Math.max(p.x0, h.x0), ix1 = Math.min(p.x1, h.x1), iz0 = Math.max(p.z0, h.z0), iz1 = Math.min(p.z1, h.z1);
      if (ix1 - ix0 <= EPS || iz1 - iz0 <= EPS) { next.push(p); continue; }
      if (ix0 - p.x0 > EPS) next.push(R(p.x0, p.z0, ix0, p.z1));
      if (p.x1 - ix1 > EPS) next.push(R(ix1, p.z0, p.x1, p.z1));
      if (iz0 - p.z0 > EPS) next.push(R(ix0, p.z0, ix1, iz0));
      if (p.z1 - iz1 > EPS) next.push(R(ix0, iz1, ix1, p.z1));
    }
    pieces = next;
  }
  return pieces;
}

/** Merge touching collinear intervals [[a0,a1],...] (within `gap`). */
export function mergeIntervals(list, gap = 0) {
  const s = list.map((v) => [v[0], v[1]]).sort((p, q) => p[0] - q[0]), out = [];
  for (const v of s) {
    const last = out[out.length - 1];
    if (last && v[0] <= last[1] + gap) last[1] = Math.max(last[1], v[1]); else out.push(v);
  }
  return out;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const round2 = (v) => Math.round(v * 100) / 100;
export const round3 = (v) => Math.round(v * 1000) / 1000;

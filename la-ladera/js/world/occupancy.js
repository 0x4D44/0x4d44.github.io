// "What is on the ground here?" - a 0.5 m bit grid over the plot, built from the plan (pure data, runs under node).
// Props, flora, vehicles and the vista ask it where a thing may stand without blocking a street, door, stair, nav edge or plaza.
import { HALF, CELL, N } from './field.js';
import { segDist, pointInPoly, polyDistPoint, footprint } from './geom.js';

export const OCC = {
  ROAD: 1,       // inside the width of a street / alley / path (not stairs)
  CORE: 2,       // ... and further than 1.1 m from either edge (the walking and driving lane)
  PLAZA: 4,      // plaza, court, mirador (+0.3 m)
  STAIR: 8,      // stairway (+0.45 m)
  LOT: 16,       // building footprint (+0.35 m)
  STEEP: 32,     // gradient above ~0.5 (retaining-wall bands, cuts, fills)
  NAV: 64,       // within 0.8 m of a nav edge (where people walk)
  DOOR: 128,     // within 1.8 m of a building entrance
};
const ALL = 255;

export function buildOccupancy(plan) {
  const f = plan._field, bits = new Uint8Array(N * N);
  const nodeById = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  const mark = (x0, z0, x1, z1, fn) => f.nodes(x0, z0, x1, z1, fn);

  for (const st of plan.streets) {
    const hw = st.width / 2, stair = st.kind === 'stair', reach = stair ? hw + 0.45 : hw, pts = st._d.pts;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      mark(Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach, (i, x, z) => {
        const d = segDist(x, z, a, b);
        if (d > reach) return;
        if (stair) bits[i] |= OCC.STAIR;
        else { bits[i] |= OCC.ROAD; if (d <= hw - 1.1) bits[i] |= OCC.CORE; }
      });
    }
  }
  for (const pl of plan.plazas) {
    const xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]);
    mark(Math.min(...xs) - 0.4, Math.min(...zs) - 0.4, Math.max(...xs) + 0.4, Math.max(...zs) + 0.4, (i, x, z) => { if (pointInPoly(pl.poly, x, z) || polyDistPoint(pl.poly, x, z) <= 0.3) bits[i] |= OCC.PLAZA; });
  }
  for (const l of plan.lots) {
    const poly = footprint(l, 0.35), xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    mark(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), (i, x, z) => { if (pointInPoly(poly, x, z)) bits[i] |= OCC.LOT; });
  }
  const H = plan.heightAt;
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    const gx = (H(x + CELL, z) - H(x - CELL, z)) / (2 * CELL), gz = (H(x, z + CELL) - H(x, z - CELL)) / (2 * CELL);
    if (Math.hypot(gx, gz) > 0.5) bits[j * N + i] |= OCC.STEEP;
  }
  for (const [a, c] of plan.nav.edges) {
    const A = nodeById.get(a), C = nodeById.get(c); if (!A || !C) continue;
    mark(Math.min(A.x, C.x) - 0.8, Math.min(A.z, C.z) - 0.8, Math.max(A.x, C.x) + 0.8, Math.max(A.z, C.z) + 0.8, (i, x, z) => { if (segDist(x, z, [A.x, A.z], [C.x, C.z]) <= 0.8) bits[i] |= OCC.NAV; });
  }
  for (const n of plan.nav.nodes) {
    if (n.kind !== 'door') continue;
    mark(n.x - 1.8, n.z - 1.8, n.x + 1.8, n.z + 1.8, (i, x, z) => { if (Math.hypot(x - n.x, z - n.z) <= 1.8) bits[i] |= OCC.DOOR; });
  }

  // circles already taken by solid props (4 m spatial hash)
  const taken = new Map(), HC = 4, hk = (a, b) => (a + 256) * 512 + (b + 256);
  const occ = {
    bits,
    /** bit mask at a point (out of the plot = everything). */
    at(x, z) {
      const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
      return i < 0 || j < 0 || i >= N || j >= N ? ALL : bits[j * N + i];
    },
    /** true when no cell within r metres has any bit of `mask` (default: every bit). */
    clear(x, z, r = 0, mask = ALL) {
      if (r <= 0) return (occ.at(x, z) & mask) === 0;
      const n = Math.ceil(r / CELL);
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
        if (Math.hypot(di, dj) * CELL > r + 0.01) continue;
        if (occ.at(x + di * CELL, z + dj * CELL) & mask) return false;
      }
      return true;
    },
    /** gradient magnitude of the ground at a point */
    slope(x, z) {
      const e = 0.5;
      return Math.hypot((H(x + e, z) - H(x - e, z)) / (2 * e), (H(x, z + e) - H(x, z - e)) / (2 * e));
    },
    /** reserve a disc for a solid prop; false when it overlaps one already taken. */
    take(x, z, r) {
      if (occ.overlaps(x, z, r)) return false;
      const k = hk(Math.floor(x / HC), Math.floor(z / HC)); let a = taken.get(k); if (!a) taken.set(k, a = []);
      a.push([x, z, r]); return true;
    },
    overlaps(x, z, r) {
      const a0 = Math.floor((x - r - 3) / HC), a1 = Math.floor((x + r + 3) / HC), b0 = Math.floor((z - r - 3) / HC), b1 = Math.floor((z + r + 3) / HC);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
        const arr = taken.get(hk(a, b)); if (!arr) continue;
        for (const [tx, tz, tr] of arr) if (Math.hypot(x - tx, z - tz) < r + tr) return true;
      }
      return false;
    },
    count() { let n = 0; for (const a of taken.values()) n += a.length; return n; },
  };
  return occ;
}

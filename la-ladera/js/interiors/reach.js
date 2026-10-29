// Standing spots in a furnished room (shared by the anchors in index.js and the interactables / discoveries in stories.js):
// a point is standable when it is inside the room (0.3 m off the walls), clear of furniture and stair openings, and connected to a door.
import { obbDist } from './layout.js';

/** The free floor point nearest the room centre that is at least `clear` metres from every blocker (or null). */
export function freePoint(L, clear = 0.55, conn = L.connectivity()) {
  const r = L.r, bl = L.blockers(), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  let best = null, bs = Infinity;
  for (let x = r.x0 + 0.5; x <= r.x1 - 0.5 + 1e-6; x += 0.15) for (let z = r.z0 + 0.5; z <= r.z1 - 0.5 + 1e-6; z += 0.15) {
    if (L.keep.some((k) => x > k.x0 - 0.2 && x < k.x1 + 0.2 && z > k.z0 - 0.2 && z < k.z1 + 0.2)) continue;
    if (bl.some((it) => obbDist(it.ob, x, z) < clear)) continue;
    if (!L.inMainRegion(x, z, conn, 1)) continue;
    const s = Math.hypot(x - cx, z - cz);
    if (s < bs) { bs = s; best = [x, z]; }
  }
  return best;
}

/** Is (x,z) a place a person can stand: inside the room (0.3 m off the walls), clear of furniture and stair openings? */
export function standable(L, x, z, conn, clear = 0.27) {
  const r = L.r;
  if (x < r.x0 + 0.3 || x > r.x1 - 0.3 || z < r.z0 + 0.3 || z > r.z1 - 0.3) return false;
  for (const k of L.keep) if (k.why?.startsWith('stair') && x > k.x0 - 0.15 && x < k.x1 + 0.15 && z > k.z0 - 0.15 && z < k.z1 + 0.15) return false;
  for (const it of L.blockers()) if (obbDist(it.ob, x, z) < clear) return false;
  return L.inMainRegion(x, z, conn, 4);                 // and connected to the doors (no walled-off pockets)
}

/** Nearest standable point to (x,z) within `rad` metres, or null. */
export function snapStand(L, x, z, conn, rad = 0.9) {
  if (standable(L, x, z, conn)) return [x, z];
  let best = null, bd = Infinity;
  for (let dx = -rad; dx <= rad + 1e-6; dx += 0.1) for (let dz = -rad; dz <= rad + 1e-6; dz += 0.1) {
    const d = Math.hypot(dx, dz);
    if (d >= bd || d > rad || !standable(L, x + dx, z + dz, conn)) continue;
    best = [x + dx, z + dz]; bd = d;
  }
  return best;
}

/**
 * A spot just OUTSIDE an item's outline from where a person can use it (the interaction targeting rejects a target whose line of sight
 * crosses a furniture outline, so interactables sit in front of the item, not in it). Tries the front, then the sides, then the back.
 * Returns [x, z] in the building frame or null.
 */
export function usePoint(L, it, conn, gap = 0.34) {
  if (it.wall) {                                                             // a hanging: stand in front of the wall, a little to either side if the front is taken
    for (const [lx, lz] of [[0, 0.5], [0.45, 0.55], [-0.45, 0.55], [0, 0.85], [0.8, 0.8], [-0.8, 0.8], [0, 1.2]]) {
      const [x, z] = L.rel(it, lx, lz);
      if (standable(L, x, z, conn, 0.2)) return [x, z];
    }
    return null;
  }
  const base = it.parent && !it.floor ? it.parent : it;                      // a tabletop thing is used from beside its table
  const hw = base.w / 2, hd = base.d / 2;
  const cands = [[0, hd + gap], [hw + gap, 0], [-(hw + gap), 0], [0, -(hd + gap)], [hw + gap, hd * 0.6 + gap * 0.4], [-(hw + gap), hd * 0.6 + gap * 0.4]];
  for (const [lx, lz] of cands) {
    const [x, z] = L.rel(base, lx, lz);
    if (standable(L, x, z, conn, 0.2)) return [x, z];
  }
  for (const [lx, lz] of cands) {                                            // a little further out
    const [x, z] = L.rel(base, lx * 1.5 + Math.sign(lx) * 0.15, lz * 1.5 + Math.sign(lz) * 0.15);
    if (standable(L, x, z, conn, 0.2)) return [x, z];
  }
  return null;
}

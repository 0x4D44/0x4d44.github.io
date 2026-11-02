// Standing spots in a furnished room (shared by the anchors in index.js and the interactables / discoveries in stories.js):
// a point is standable when it is inside the room (0.3 m off the walls), clear of furniture and stair openings, and connected to a door.
import { obbDist, segObb, mkObb } from './layout.js';

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
export const standable = (L, x, z, conn, clear) => L.standable(x, z, conn, clear);       // (layout.js owns it: its own `_accessOk` asks whether a cook can stand at a stove)

/** Where a person can stand to use a slot of the piece `rec`: building-frame points 0.55 to 1.3 m in front of the slot's front plane, clear of furniture, connected to the doors and SEEING the front
 *  (nearest to 1 m first). containers.js asks it for every front it registers; contents.js asks it, before anything is built, which kinds of container a household can really open (R4-118).
 *  Seeing is the kernel's own sight line (core/interact.js `_tryShaped`): a body sweep from the eye (1.6 m) toward the middle of the front that stops `lead` short of it, which no other piece may cross
 *  (a privacy screen, a table, a chair stood between the spot and a desk's drawers: a spot behind it is a place to stand, not a place to open the drawers from). */
export function standSpots(bp, rec, slot, conn) {
  const L = bp.interior?.layouts?.get(rec.room); if (!L) return [];
  conn ??= L.connectivity();
  const cs = Math.cos(rec.ry ?? 0), sn = Math.sin(rec.ry ?? 0), r = slot.rect, cx = (r.x0 + r.x1) / 2, out = [];
  const bl = (lx, lz) => [rec.x + lx * cs + lz * sn, rec.z - lx * sn + lz * cs];
  const [fx, fz] = bl(cx, slot.zf + 0.02), eye = (L.room?.y ?? 0) + EYE, fy = (rec.kind === 'ceil' ? rec.y - rec.h : rec.y) + (r.y0 + r.y1) / 2, lead = rec.kind === 'wall' ? LEAD_WALL : LEAD;      // (a record's y is the building's: the room's floor level and up)
  const others = L.blockers().filter((it) => it.id !== rec.id);
  for (const d of [1.0, 1.15, 0.85, 1.3, 0.7, 0.55]) for (const s of [0, -0.25, 0.25, -0.5, 0.5]) {
    const [bx, bz] = bl(cx + s, slot.zf + d);
    if (!standable(L, bx, bz, conn, 0.3)) continue;
    const t = Math.hypot(Math.hypot(fx - bx, fz - bz), eye - fy), k = t > lead ? (t - lead) / t : 0, ex = bx + (fx - bx) * k, ez = bz + (fz - bz) * k;      // (the sweep covers `k` of the way: the ray's own length less the lead, flattened by the pitch)
    if (!others.some((it) => segObb(it.ob, bx, bz, ex, ez))) out.push([bx, bz]);
  }
  return out;
}
const EYE = 1.6, LEAD = 0.35, LEAD_WALL = 0.75;                 // (the eye of a standing person, and the leads containers.js gives the target of a closed front: the cupboard over a counter looks from further back)

/** Nearest standable point to (x,z) within `rad` metres, or null. */
export const snapStand = (L, x, z, conn, rad) => L.snapStand(x, z, conn, rad);

/** How near a walker's centre may pass a keeper at his post (people/sim.js AISLE: a walker is pushed off a way that passes nearer a standing person, and a customer pushed off the aisle stood against the counter for ever, L61). */
export const KEEPER_AISLE = 0.8;
/**
 * The floor of the room a customer can walk to from the street without passing the keeper at `post` ([x, z], the room frame): the free floor of the room (a body `inflate` wide, the anchors' own 0.34 m) with
 * the keeper and KEEPER_AISLE round him taken out, flooded from the doors `isStreet(landing)` says are the street's. `has(x, z)` asks whether (x, z) is within 0.4 m of that floor (the reach `standable` allows a spot).
 * The counter of a narrow shop leaves the customers a strip no body can stand in, and the spot a customer's anchor then snaps to may lie past the counter's end, where only the keeper's lane leads (L58, a 2.4 m
 * butcher's: the second spot was reached down the lane the keeper stands in, the way in 0.05 m from his post): that is no customer spot. Null when there is nothing to judge by (no street door with floor to stand on).
 */
export function customerFloor(L, post, isStreet, inflate = 0.34) {
  const half = KEEPER_AISLE - inflate, keeper = { floor: true, block: true, ob: mkObb(post[0], post[1], 2 * half, 2 * half, 0) };      // (a box `inflate` short of the aisle on each side: the flood grows every blocker by that much)
  L.items.push(keeper);
  let c; try { c = L.connectivity(inflate); } finally { L.items.pop(); }
  const street = new Set(); c.srcs.forEach((s, k) => { if (c.ids[k] >= 0 && isStreet(s.l)) street.add(c.ids[k]); });
  if (!street.size) return null;
  return {
    has(x, z, cells = 4) {
      const [ix, iz] = c.cellOf(x, z);
      for (let rad = 0; rad <= cells; rad++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        const X = ix + dx, Z = iz + dz;
        if (X >= 0 && Z >= 0 && X < c.nx && Z < c.nz && street.has(c.comp[Z * c.nx + X])) return true;
      }
      return false;
    },
  };
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

// Helpers shared by the layout files (layouts.js: the house family; layouts_special.js: the patio buildings and institutions). Pure data.
import { T_INT, cutSouth, cutNorth, cutEast, cutWest, rw, rd, rcx, sharedWall } from './geom.js';
import { Z0, coastLive } from '../world/coast.js';

const ti = T_INT;

/** Split `rect` (south -> north) into stacked rooms: specs [[type, depth|null, opts?], ...]; null/last = remainder. */
export function stack(S, k, rect, specs) {
  const out = []; let cur = rect;
  for (let i = 0; i < specs.length; i++) {
    const [type, d, o] = specs[i];
    if (i === specs.length - 1 || d == null) { out.push(S.addRoom(k, type, cur, o)); break; }
    const [rest, strip] = cutSouth(cur, d);
    out.push(S.addRoom(k, type, strip, o)); cur = rest;
  }
  return out;
}

/** The bath of a flat: 1.6 m deep (a bath 3 m wide is generous at that), and never more than half of a narrow kitchen (R4-209: kitchens 1.41 m deep beside baths 1.7 m deep). */
export const FLAT_BATH = { d: 1.6, share: true };

/** How a bathroom of the default 1.55 x 1.7 m (or `o.w` x `o.d`) is cut from a room `w` x `d` m: { beside, bw, bd }. `o.share` keeps the room at least as large as the bath on a narrow room. */
export function bathCut(w, d, o = {}) {
  const bd = o.d ?? 1.7, bw = o.share ? Math.min(o.w ?? 1.55, (w - ti) / 2 - 0.005) : (o.w ?? 1.55);
  // classic rule: beside the room when it is wide enough, else across its back wall; but never leave a sliver (< 1.4 m) behind:
  // when the classic choice does, take the other cut if that leaves more
  const left = (b) => (b ? Math.min(w - bw - ti, d) : Math.min(w, d - bd - ti));
  let beside = w >= bw + ti + 1.9;
  if (left(beside) < 1.4 && left(!beside) > left(beside)) beside = !beside;
  return { beside, bw, bd };
}

/** Carve a bathroom out of `room` (its rect shrinks); returns the new bathroom room. `o` as for `bathCut` (`FLAT_BATH` for a flat). */
export function carveBath(S, room, k, awaySide, o = {}) {
  const r = room.rect, { beside, bw, bd } = bathCut(rw(r), rd(r), o);
  if (beside) {
    const [a, b] = awaySide === 'east' ? cutEast(r, bw) : cutWest(r, bw);
    room.rect = awaySide === 'east' ? a : b;
    return S.addRoom(k, 'bathroom', awaySide === 'east' ? b : a);
  }
  const [bath, rest] = cutNorth(r, bd);
  room.rect = rest;
  return S.addRoom(k, 'bathroom', bath);
}

/** Where the lot wants its front door (building-local x). */
export function entranceU(S) { const e = S.lot.entrance; return e && e.side === 'front' ? (e.u ?? 0) : 0; }

/** Length of the wall two rooms share (0 when they do not touch). */
export function wallLen(a, b) { const sw = sharedWall(a.rect, b.rect); return sw ? sw.a1 - sw.a0 : 0; }

/**
 * Link `room` to the candidate that shares the longest wall with it (at least `min` metres: a 0.9 m door needs 1.1 m of wall to sit wholly inside it).
 * `pref` candidates win when they reach `min`, whatever the rest offer. `into` makes the leaf swing into `room` (a classroom, a bathroom) instead of the cell.
 * Returns { cell, door } or null when nothing is long enough.
 */
export function linkBest(S, room, cells, o = {}) {
  const pick = (list) => {
    let best = null;
    for (const c of list) {
      if (!c || c === room) continue;
      const sw = sharedWall(room.rect, c.rect); if (!sw) continue;
      const len = sw.a1 - sw.a0;
      if (len >= (o.min ?? 1.1) && (!best || len > best.len)) best = { c, sw, len };
    }
    return best;
  };
  const best = pick(o.pref ?? []) ?? pick(cells);
  if (!best) return null;
  const at = o.at ?? (best.sw.a0 + best.sw.a1) / 2;
  return { cell: best.c, door: o.into ? S.link(best.c, room, { ...(o.link ?? {}), at }) : S.link(room, best.c, { ...(o.link ?? {}), at }) };
}

/**
 * Carve a bathroom strip off the `away` side (east/west) of `room` (its rect shrinks). A strip deep enough for it also gets a utility room at the
 * street end (`utility` type); returns { bath, util|null, strip } with the strip's rooms already created on floor `k`.
 */
export function bathStrip(S, room, k, away, o = {}) {
  const bw = o.w ?? 1.7, r = room.rect;
  const [a, b] = away === 'east' ? cutEast(r, bw) : cutWest(r, bw);
  const strip = away === 'east' ? b : a;
  room.rect = away === 'east' ? a : b;
  const dr = rd(strip), need = 2.0;
  if (o.utility && dr >= need + ti + 1.5) {
    const [util, bath] = stack(S, k, strip, [[o.utility, dr - need - ti], ['bathroom', null]]);
    return { bath, util, strip };
  }
  return { bath: S.addRoom(k, 'bathroom', strip), util: null, strip };
}

// ---- the south row's back to the promenade (round 7, dev/FEATURE-BEACH.md 1.3) ---------------------------------------------------------------------------------------------------------
/** The kinds of lot that turn their back to the promenade: the ones a household or a trade lives in (an institution's back is its own yard wall). */
const BEACH_KINDS = new Set(['house', 'shophouse', 'cornerstore', 'workshop']);
/** The shops whose storeroom opens onto the promenade: the cafe and the restaurant, which have a terrace on it. */
const BEACH_HOSPITALITY = new Set(['cafe', 'restaurante']);
/** How near the plot's south edge a rear wall stands for the lot to have its back to the beach (the south row's backs are at z = Z0 - 1.9). */
const BEACH_REACH = 3.2;

/**
 * Which lots have their back to the promenade, and what their back does: 'door' (a cafe or a restaurant: its storeroom gets a service door onto the promenade, `beachDoor`, and a terrace over
 * it, shellfacade `beachRear`), 'rear' (a dressed rear wall, no door), or null (every other lot; nothing in the plan or on the wall is touched). A lot's back is on the promenade when its rear wall
 * faces south (rotY of pi: local -z is world +z) and stands within BEACH_REACH of the plot's south edge. Pure data from the lot: no stamp on it, no randomness. Where the beach is not live
 * (`?skip=coast`, or a Node build that did not ask for the coast: world/coast.js `coastLive`) the south row is as it was: the gate is shut, there is no promenade to open onto.
 */
export function beachSide(lot, ctx) {
  if (!coastLive(ctx?.opts)) return null;
  if (!BEACH_KINDS.has(lot.kind) || !(Math.cos(lot.rotY ?? 0) < -0.99)) return null;
  const rear = lot.z + lot.d / 2;
  if (rear > Z0 || rear < Z0 - BEACH_REACH) return null;
  return (lot.kind === 'shophouse' || lot.kind === 'cornerstore') && BEACH_HOSPITALITY.has(lot.shop) ? 'door' : 'rear';
}

/**
 * The service door of a promenade cafe or restaurant: an outside door in the back wall of its storeroom, made LAST by the layout so that no other door's id, no hinge draw
 * and no stream moves (the hinge is given, so `extDoor` draws nothing). An `alley` entrance: `makeEntrances` ranks it after the shop's and the main door, so the lot's own entrances keep their
 * ids and the people sim still enters by the shop. The windows keep 0.3 m clear of it (`genWindows`), the steps (`planSteps`) come from the ground behind the wall.
 */
export function beachDoor(S) {
  if (beachSide(S.lot, S.ctx) !== 'door') return null;
  const room = S.rooms.find((r) => r.floor === 0 && r.type === 'backroom' && Math.abs(r.rect.z0 - S.inner.z0) < 1e-3);      // (a storeroom against the back wall; a shop with none gets no door, only the dressing)
  return room ? S.extDoor(room, 'back', rcx(room.rect), { entrance: 'alley', w: 1.0, h: 2.1, hinge: 'right' }) : null;
}

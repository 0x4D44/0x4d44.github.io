// Helpers shared by the layout files (layouts.js: the house family; layouts_special.js: the patio buildings and institutions). Pure data.
import { T_INT, cutSouth, cutNorth, cutEast, cutWest, rw, rd, sharedWall } from './geom.js';

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

/** Carve a bathroom out of `room` (its rect shrinks); returns the new bathroom room. */
export function carveBath(S, room, k, awaySide) {
  const r = room.rect, bw = 1.55, bd = 1.7;
  // classic rule: beside the room when it is wide enough, else across its back wall; but never leave a sliver (< 1.4 m) behind:
  // when the classic choice does, take the other cut if that leaves more
  const left = (beside) => (beside ? Math.min(rw(r) - bw - ti, rd(r)) : Math.min(rw(r), rd(r) - bd - ti));
  let beside = rw(r) >= bw + ti + 1.9;
  if (left(beside) < 1.4 && left(!beside) > left(beside)) beside = !beside;
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

// Per-kind room layouts. Each layout(S) fills S with rooms/doors/core for every floor. Pure data.
import { T_INT, R, cutSouth, cutNorth, cutEast, cutWest, cutX, rw, rd, rcx, rcz, clamp, rectMinusRects } from './geom.js';
import { coreGeo } from './coregeo.js';
import { coreDims } from './stairs.js';

const ti = T_INT;

/** Split `rect` (south -> north) into stacked rooms: specs [[type, depth|null, opts?], ...]; null/last = remainder. */
function stack(S, k, rect, specs) {
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
function carveBath(S, room, k, awaySide) {
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

const landingAt = (S) => (S.core ? S.core.landing : null);

/** One floor of a "home" (rooms around a stair core): public = sala/comedor/cocina, private = dormitorios. */
function homeFloor(S, g, k, role) {
  const pub = role === 'public';
  const front = S.addRoom(k, pub ? 'living' : 'bedroom', g.front, pub ? {} : { occupant: 'family' });
  const core = S.coreRooms[k], lz = landingAt(S);
  const away = g.coreLeft ? 'east' : 'west';
  if (g.orient === 'x') {
    // tight plot: core along x at the back; one room beside it
    const room = S.addRoom(k, pub ? 'kitchen' : 'bedroom', g.rest);
    const bath = carveBath(S, room, k, g.coreLeft ? 'east' : 'west');
    S.link(front, core, { kind: pub ? 'door' : 'door', atX: rcx(lz) });
    S.link(front, room, { atX: rcx(room.rect) });
    S.link(room, bath);
    return { front, core, rooms: [room, bath] };
  }
  const Rb = g.restB, Dr = rd(Rb);
  let south, north;
  if (Dr >= 4.9) {
    const ds = clamp(Dr * 0.5 - 0.1, 2.4, 3.6);
    [south, north] = stack(S, k, Rb, [[pub ? 'dining' : 'bedroom', ds], [pub ? 'kitchen' : 'bedroom', null]]);
  } else { south = north = S.addRoom(k, pub ? 'kitchen' : 'bedroom', Rb); }
  const bath = g.back ? S.addRoom(k, 'bathroom', g.back) : carveBath(S, north, k, away);
  if (core) {
    S.link(front, core, pub ? { kind: 'arch', w: 1.3, atX: rcx(core.rect) } : { atX: rcx(core.rect) });
    S.link(core, south, { atZ: rcz(lz) });
  }
  S.link(front, south, pub ? { kind: 'arch', w: 1.2 } : {});
  if (south !== north) S.link(south, north);
  S.link(north, bath);
  return { front, core, rooms: [south, north, bath] };
}

/** Single storey, no stairs. */
function flatHome(S, k = 0) {
  const { inner } = S, Di = rd(inner), Wi = rw(inner);
  if (Di < 5.2 || Wi < 2.4) return S.addRoom(k, 'living', inner);                 // too small to divide
  const [B, front] = cutSouth(inner, clamp(0.4 * Di, 2.6, 4.4));
  const sala = S.addRoom(k, 'living', front);
  const away = S.rng.chance(0.5) ? 'east' : 'west';
  if (rd(B) >= 4.9) {
    const [dorm, cocina] = stack(S, k, B, [['bedroom', clamp(rd(B) * 0.55, 2.4, 3.6), { occupant: 'family' }], ['kitchen', null]]);
    const bath = carveBath(S, cocina, k, away);
    S.link(sala, dorm); S.link(dorm, cocina); S.link(cocina, bath);
  } else if (rw(B) >= 4.8) {                                   // shallow back band: bedroom | kitchen(+bath)
    const [w, e] = cutX(B, B.x0 + clamp(rw(B) * 0.5, 2.2, 3.4));
    const dorm = S.addRoom(k, 'bedroom', w, { occupant: 'family' }), cocina = S.addRoom(k, 'kitchen', e);
    const bath = carveBath(S, cocina, k, 'east');
    S.link(sala, dorm); S.link(sala, cocina); S.link(cocina, bath);
  } else {
    const cocina = S.addRoom(k, 'kitchen', B);
    const bath = rd(B) >= 3.6 && rw(B) >= 2.4 ? carveBath(S, cocina, k, away) : null;   // carve first: a door placed before the cut can end up off the kitchen's wall
    S.link(sala, cocina);
    if (bath) S.link(cocina, bath);
  }
  return sala;
}

/** Kiosk / stall big enough to step into: one room, a wide roll-up opening, a side window. */
export function layoutKiosk(S) {
  const room = S.addRoom(0, 'shop', S.inner, { occupant: 'shopkeeper' });
  room.shopType = S.lot.shop ?? 'tienda';
  S.extDoor(room, 'front', 0, { kind: 'shutter', w: clamp(rw(S.inner) - 0.9, 1.6, 2.4), h: 2.2, entrance: 'shop' });
}

function entranceU(S) { const e = S.lot.entrance; return e && e.side === 'front' ? (e.u ?? 0) : 0; }

/** Respect the unmet-core fallback: if the core does not fit, drop to a single storey. */
function geoOrDegrade(S, style, o) {
  const g = coreGeo(S, style, o);
  if (g && g.fail) { S.degrade(`core does not fit ${S.W}x${S.D}`); return null; }
  return g;
}

export function layoutHouse(S) {
  const g = S.nUp ? geoOrDegrade(S, 'home') : null;
  if (!g) {
    const sala = flatHome(S, 0);
    S.extDoor(sala, 'front', entranceU(S), { entrance: 'main' });
    return;
  }
  S.placeCore(g.core, g.orient, g.flip); S.addCoreRooms();
  for (let k = 0; k < S.F; k++) {
    const role = k === 0 ? 'public' : 'private';
    const r = homeFloor(S, g, k, role);
    if (k === 0) S.extDoor(r.front, 'front', entranceU(S), { entrance: 'main' });
  }
}

/** Shop below, home above. Ground floor = columns [entry | core | back] + [shop | backroom]. */
export function layoutShopHouse(S) {
  const g = S.nUp ? geoOrDegrade(S, 'column') : null;
  const shopType = S.lot.shop ?? 'tienda';
  if (!g) {  // single-storey shop: shop in front, back room + bath behind
    const { inner } = S, [B, front] = cutSouth(inner, clamp(0.58 * rd(inner), 3.4, 6.5));
    const shop = S.addRoom(0, 'shop', front, { occupant: 'shopkeeper' }); shop.shopType = shopType;
    const back = S.addRoom(0, 'backroom', B);
    const bath = carveBath(S, back, 0, 'east');
    S.link(shop, back); S.link(back, bath);
    S.extDoor(shop, 'front', entranceU(S), { kind: 'shutter', w: clamp(rw(front) * 0.5, 1.8, 2.6), h: 2.2, entrance: 'shop' });
    return;
  }
  S.placeCore(g.core, g.orient, g.flip); S.addCoreRooms();
  const entry = S.addRoom(0, 'entry', g.entry);
  // behind the shop: a storeroom and a bathroom. The shop must reach back past the stair landing (its door has to sit wholly inside the wall the
  // two rooms share). Where the bath cannot sit beside the storeroom (a narrow plot) it would leave a sliver of storeroom, so the storeroom gets
  // the depth it needs for both, or is dropped and the shop runs back to the bathroom.
  const rest = g.restFull, Dr = rd(rest), shopMin = S.inner.z1 - rcz(S.core.landing) + 0.6;
  const sideOk = !!g.back || rw(rest) >= 1.55 + ti + 1.4;
  const bdNeed = sideOk ? 1.8 : 1.7 + ti + 1.5;
  const bd = Math.min(sideOk ? clamp(Dr * 0.3, 2.4, 3.4) : Math.max(clamp(Dr * 0.3, 2.4, 3.4), bdNeed), Dr - ti - shopMin);
  const keepBack = bd >= bdNeed && Dr - bd - ti >= 3.6;
  let shop, back = null, bath, shopR;
  if (keepBack) {
    const [backR, sr] = cutSouth(rest, Dr - bd - ti);
    shopR = sr;
    shop = S.addRoom(0, 'shop', shopR, { occupant: 'shopkeeper' });
    back = S.addRoom(0, 'backroom', backR);
    bath = g.back ? S.addRoom(0, 'bathroom', g.back) : carveBath(S, back, 0, g.coreLeft ? 'east' : 'west');
  } else {
    const [bathR, sr] = cutSouth(rest, Dr - 1.7 - ti);
    shopR = sr;
    shop = S.addRoom(0, 'shop', shopR, { occupant: 'shopkeeper' });
    bath = S.addRoom(0, 'bathroom', bathR);
  }
  shop.shopType = shopType;
  const core = S.coreRooms[0], lz = S.core.landing;
  S.link(entry, core, { kind: 'arch', w: 1.3, atX: rcx(core.rect) });
  S.link(shop, entry); S.link(core, shop, { atZ: rcz(lz) });
  if (back) { S.link(shop, back); S.link(back, bath); } else S.link(shop, bath);
  const sw = clamp(rw(shopR) * 0.55, 1.8, 2.7);
  const e = S.lot.entrance;
  const shopU = e && e.side === 'front' && e.u != null && e.u >= shopR.x0 && e.u <= shopR.x1 ? e.u : rcx(shopR);
  S.extDoor(shop, 'front', shopU, { kind: 'shutter', w: sw, h: 2.2, entrance: 'shop' });
  S.extDoor(entry, 'front', rcx(entry.rect), { entrance: 'main' });
  // upper floors: home
  for (let k = 1; k < S.F; k++) homeFloor(S, g, k, k === 1 ? 'public' : 'private');
}

/** Block of flats: [unit | hall+core | unit] on every floor. */
export function layoutApartments(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), cd = coreDims(S.fh);
  // a unit is living (>= 3.0) + bedroom (>= 2.8) + kitchen/bath band (>= 2.4) front to back; a shallower plot is planned as a house
  if (!S.nUp || Wi < cd.across + 2 * ti + 5.6 || Di < cd.along + ti + 3 || Di < 3.0 + 2.8 + 2.4 + 2 * ti) { return layoutHouse(S); }
  const cw = cd.across, wu = (Wi - cw - 2 * ti) / 2;
  const left = R(inner.x0, inner.z0, inner.x0 + wu, inner.z1), mid = R(left.x1 + ti, inner.z0, left.x1 + ti + cw, inner.z1), right = R(mid.x1 + ti, inner.z0, inner.x1, inner.z1);
  const df = Di - cd.along - ti;
  const [upper, hallRect] = cutSouth(mid, df);
  S.placeCore(upper, 'z', false); S.addCoreRooms();
  const units = [left, right];
  for (let k = 0; k < S.F; k++) {
    const hall = S.addRoom(k, k === 0 ? 'entry' : 'hall', hallRect);
    const core = S.coreRooms[k];
    S.link(hall, core, { kind: 'arch', w: 1.3, atX: rcx(core.rect) });
    for (const [ui, u] of units.entries()) {
      const ds = clamp(0.34 * Di, 3.0, 4.2), dd = clamp(0.3 * Di, 2.8, 3.6);
      const [sala, dorm, cocina] = stack(S, k, u, [['living', ds], ['bedroom', dd, { occupant: ui ? 'young' : 'family' }], ['kitchen', null]]);
      const bath = carveBath(S, cocina, k, ui ? 'east' : 'west');
      S.link(hall, sala, { atZ: sala.rect.z1 - 1.0 });
      S.link(sala, dorm); S.link(dorm, cocina); S.link(cocina, bath);
    }
    if (k === 0) S.extDoor(hall, 'front', rcx(hallRect), { entrance: 'main', w: 1.0 });
  }
}

/** Obra negra: finished rooms below, open skeleton on top. */
export function layoutUnfinished(S) {
  if (S.F < 2 || !S.nUp) return layoutHouse(S);
  const g = geoOrDegrade(S, 'home');
  if (!g) { const sala = flatHome(S, 0); S.extDoor(sala, 'front', entranceU(S), { entrance: 'main' }); return; }
  S.placeCore(g.core, g.orient, g.flip); S.addCoreRooms();
  const top = S.F - 1;
  for (let k = 0; k < top; k++) {
    const r = homeFloor(S, g, k, k === 0 ? 'public' : 'private');
    if (k === 0) S.extDoor(r.front, 'front', entranceU(S), { entrance: 'main' });
  }
  // open top floor: everything but the core is one open deck, split only where the core splits it
  const pieces = rectMinusRects(S.inner, [S.core.rect]);
  for (const p of pieces) if (rw(p) > 0.5 && rd(p) > 0.5) S.addRoom(top, 'terrace', p, { outdoor: true, tag: 'deck' });
  S.floorsData[top].open = true;
}

/** Capilla: one nave behind a tall front door, a sacristy and a small bathroom behind the altar wall (A3 furnishes `chapel` rooms with pews and an altar). */
export function layoutChapel(S) {
  const { inner } = S, Di = rd(inner), Wi = rw(inner);
  if (S.F > 1 || Di < 7 || Wi < 4.6) return layoutHouse(S);
  const bd = clamp(Di * 0.2, 2.4, 3.2);
  const [back, front] = cutSouth(inner, Di - bd - ti);
  const nave = S.addRoom(0, 'chapel', front, { name: 'Capilla' });
  const [sacR, bathR] = cutX(back, back.x0 + clamp(rw(back) * 0.64, 2.6, 7.5));
  const sacristy = S.addRoom(0, 'office', sacR, { name: 'Sacristía' });
  const bath = S.addRoom(0, 'bathroom', bathR);
  S.link(nave, sacristy, { atX: rcx(sacR) });
  S.link(sacristy, bath);
  S.extDoor(nave, 'front', 0, { entrance: 'main', w: 1.3, h: 2.4 });
}

/** Taller: the shop-house plan with a workshop (not a shop) at the street, behind a roll-up door. */
export function layoutWorkshop(S) {
  layoutShopHouse(S);
  for (const r of S.rooms) if (r.type === 'shop') { r.type = 'workshop'; r.name = 'Taller'; r.zone = 'public'; }
}

export const LAYOUTS = {
  house: layoutHouse, rowhouse: layoutHouse, shophouse: layoutShopHouse, cornerstore: layoutShopHouse, apartments: layoutApartments, unfinished: layoutUnfinished,
  kiosk: layoutKiosk, chapel: layoutChapel, workshop: layoutWorkshop,
};

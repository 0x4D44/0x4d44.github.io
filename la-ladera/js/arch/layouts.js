// Per-kind room layouts. Each layout(S) fills S with rooms/doors/core for every floor. Pure data.
import { T_INT, R, cutSouth, cutX, cutWest, cutEast, rw, rd, rcx, rcz, clamp, rectMinusRects } from './geom.js';
import { coreGeo } from './coregeo.js';
import { coreDims } from './stairs.js';
import { stack, carveBath, bathCut, FLAT_BATH, entranceU, wallLen, beachDoor } from './layouthelp.js';
import { planCourtyard, planTenement, planSchool, planClinic, planHall } from './layouts_special.js';
import { NAVE_H, LOW_H, DAIS_H, DAIS_D, DAIS_HALF } from './chapel_interior.js';

const ti = T_INT;

const landingAt = (S) => (S.core ? S.core.landing : null);

/**
 * Smallest bedroom (m2) and narrowest (m) a cell of the front band of a private floor may be when the band is cut into two; a band that cannot give two of them stays one bedroom. A single bed
 * (0.9 x 1.9 m) with 0.5 m beside it is a room 1.55 x 2.5 (arch-rowhouse), and its door leaves 0.8 m of the wall clear beside it for the head of the bed (R4-103): 0.9 + 0.8 + the 0.1 m margin of the
 * door is 1.8 m. 4.8 m2 is what the narrowest rowhouse bands (4.06 m wide, 2.5 m deep) give the half over the hall.
 */
const PRIV_BED_AREA = 4.8, PRIV_BED_W = 1.8;

/**
 * A private floor of a home (R4-301, R4-302, R1-101: a bathroom reached through one bedroom or two, a bedroom reached through another). A bedroom is a LEAF of the door tree: the floor's hub is the
 * stair's landing and the rest column beside it, which is ONE room (the hall: a sitting room upstairs when it is big) with the bathroom hanging off it. The bedrooms are the front band, cut along the
 * wall between the two columns: the room over the stair opens onto the landing, the one over the hall onto the hall, and the family has the larger of the two. A band that cannot give two bedrooms
 * of PRIV_BED_AREA m2 stays one, and the household of the ground floor sleeps there.
 * The door count of the plan it replaces (4 doors, 5 where the rest column held two rooms) is kept with `spare`, so the ids and the streams after it stay as they were.
 */
function privateFloor(S, g, k) {
  const core = S.coreRooms[k], lz = landingAt(S), Rb = g.restB, Dr = rd(Rb), away = g.coreLeft ? 'east' : 'west', F = g.front, c = core.rect;
  const [overStairR, overRestR] = g.coreLeft ? [R(F.x0, F.z0, c.x1, F.z1), R(Rb.x0, F.z0, F.x1, F.z1)] : [R(c.x0, F.z0, F.x1, F.z1), R(F.x0, F.z0, Rb.x1, F.z1)];
  const fits = (r) => rw(r) >= PRIV_BED_W - 1e-9 && rw(r) * rd(r) >= PRIV_BED_AREA - 1e-9;
  const two = fits(overStairR) && fits(overRestR), oldDoors = Dr >= 4.9 && !g.upOne ? 5 : 4;          // the rest column held two rooms (five doors) or one (four)
  let area = rw(Rb) * Dr;
  if (!g.back) { const { beside, bw, bd } = bathCut(rw(Rb), Dr); area = beside ? (rw(Rb) - bw - ti) * Dr : rw(Rb) * (Dr - bd - ti); }
  const stairBig = rw(overStairR) * rd(overStairR) > rw(overRestR) * rd(overRestR) + 1e-9;
  // the rooms, in the order that keeps the ids of the plan before: the family's bedroom first (the old front band), the hall (the old room beside the stair), the bathroom last
  let overStair, overRest = null, hall, bath;
  if (two) {
    const first = S.addRoom(k, 'bedroom', stairBig ? overStairR : overRestR, { occupant: 'family' });
    hall = S.addRoom(k, area >= 9 ? 'living' : 'hall', Rb);
    const second = oldDoors === 5 ? S.addRoom(k, 'bedroom', stairBig ? overRestR : overStairR) : null;
    bath = g.back ? S.addRoom(k, 'bathroom', g.back) : carveBath(S, hall, k, away);
    const last = second ?? S.addRoom(k, 'bedroom', stairBig ? overRestR : overStairR);
    [overStair, overRest] = stairBig ? [first, last] : [last, first];
  } else {
    overStair = S.addRoom(k, 'bedroom', F, { occupant: 'family' });
    hall = S.addRoom(k, area >= 9 ? 'living' : 'hall', Rb);
    bath = g.back ? S.addRoom(k, 'bathroom', g.back) : carveBath(S, hall, k, away);
  }
  const n0 = S.seq.door;
  // The room over the stair is only as wide as the stair column (2 m): its door goes to the outer end of the landing's wall (`link` clamps an infinite `at` to the wall's 0.1 m margin), away from the
  // landing's door to the hall, and the strip beyond it stays free for a bed (R4-103).
  S.link(overStair, core, { atX: g.coreLeft ? -Infinity : Infinity });
  S.link(core, hall, { atZ: rcz(lz) });
  // The room over the hall is under 2 m wide on the narrowest lots: its door goes to the end the stair is on and the far strip stays free for a bed (R4-103). The leaf swings into the bedroom,
  // not into the hall: the landing's door opens into the hall at the same corner and the two leaves would sweep over each other. (A leaf opens into `rooms[swing]`: the bedroom is the second room
  // of its door, as the landing's and the bathroom's are; the interiors read `rooms[swing]`, so a `swing` of -1 would name no room at all.)
  if (overRest) S.link(hall, overRest, { atX: g.coreLeft ? -Infinity : Infinity });
  S.link(hall, bath);
  S.spare(oldDoors - (S.seq.door - n0));
}

/** One floor of a "home" (rooms around a stair core): public = sala/comedor/cocina, private = dormitorios. */
function homeFloor(S, g, k, role) {
  const pub = role === 'public';
  if (!pub && g.orient !== 'x' && S.coreRooms[k]) return privateFloor(S, g, k);
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
  if (Dr >= 4.9 && !(g.upOne && !pub)) {                                                 // `upOne`: upstairs, one long room beside the stair instead of two small ones
    const ds = g.dd ?? clamp(Dr * 0.5 - 0.1, 2.4, 3.6);
    [south, north] = stack(S, k, Rb, [[pub ? 'dining' : 'bedroom', ds], [pub ? 'kitchen' : 'bedroom', null]]);
  } else { south = north = S.addRoom(k, pub ? 'kitchen' : 'bedroom', Rb); }
  const bath = g.back ? S.addRoom(k, 'bathroom', g.back) : carveBath(S, north, k, away);
  if (core) {
    S.link(front, core, pub ? { kind: 'arch', w: 1.3, atX: rcx(core.rect) } : { atX: rcx(core.rect) });
    S.link(core, south, { atZ: rcz(lz) });
  }
  // The middle room of a private floor is under 2 m wide: doors in the centre of both short walls would cut it into a 0.9 m aisle and two 0.5 m strips with no room for a bed,
  // so both go to the end the stair door is on (`link` clamps an infinite `at` to the wall's 0.1 m margin) and the far strip stays free (R4-103).
  const hug = pub ? {} : { atX: g.coreLeft ? -Infinity : Infinity };
  S.link(front, south, pub ? { kind: 'arch', w: 1.2 } : hug);
  if (south !== north) S.link(south, north, hug);
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
  // The bedroom is a leaf off the living room, the kitchen and the bath hang off the living room too (R4-301: a deep back band used to run living -> bedroom -> kitchen -> bath).
  if (rw(B) >= 4.8) {                                          // back band wide enough for two rooms: bedroom | kitchen(+bath), however deep
    const [w, e] = cutX(B, B.x0 + clamp(rw(B) * 0.5, 2.2, 3.4));
    const dorm = S.addRoom(k, 'bedroom', w, { occupant: 'family' }), cocina = S.addRoom(k, 'kitchen', e);
    const bath = carveBath(S, cocina, k, 'east');
    S.link(sala, dorm); S.link(sala, cocina); S.link(cocina, bath);
  } else if (rd(B) >= 4.9) {                                   // deep and narrow: kitchen (+bath) behind the living room, the bedroom behind the kitchen
    const [cocina, dorm] = stack(S, k, B, [['kitchen', clamp(rd(B) * 0.45, 2.4, 3.6)], ['bedroom', null, { occupant: 'family' }]]);
    const bath = carveBath(S, cocina, k, away);
    S.link(sala, cocina); S.link(cocina, bath); S.link(cocina, dorm);
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

/** Respect the unmet-core fallback: if the core does not fit, drop to a single storey. */
function geoOrDegrade(S, style, o) {
  const g = coreGeo(S, style, o);
  if (g && g.fail) { S.degrade(`core does not fit ${S.W}x${S.D}`); return null; }
  return g;
}

export function layoutHouse(S, geo) {
  const g = geo ?? (S.nUp ? geoOrDegrade(S, 'home') : null);
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

// ---- rowhouse (R4-007) ----------------------------------------------------------------------------------------------------------------------------
const ROW_DF_MIN = 2.5, ROW_BD_MIN = 1.4, ROW_BD_MAX = 2.0, ROW_SLACK_MAX = 5.6;   // shortest front room; depth range of the bathroom strip behind the stair; front room + strip beyond which the house proportions apply
const ROW_KITCHEN_MIN = 5.0, ROW_BEDROOM_MIN = 5.0, ROW_DINING_DEPTH_MIN = 2.1;      // m2 of a kitchen, of a bedroom beside the stair; m of the shortest dining room

/**
 * The geometry of a rowhouse: the house plan with its bathroom in a strip BEHIND the stair, so the rest column (beside the stair) holds a dining room and a kitchen of at least
 * 5 m2 instead of a kitchen and a bath at 4 m2 each, and upstairs two bedrooms (or, by lot, one long one) instead of a 4 m2 cell. The strip's depth (1.4-2.0 m) and with it the
 * front room's (2.5 m up) vary by lot, the stair sits against the party wall (or either side), and the kitchen takes the depth it needs (a narrow lot gets a smaller dining room
 * and, upstairs, one long bedroom instead of a second one under 5 m2). A deeper plot (front room + strip over 5.6 m) keeps the house plan's own proportions (front room at 38%
 * of the depth, a strip behind the stair from what is left). A plot too small for a strip (null) keeps the plain house plan.
 */
function rowhouseGeo(S) {
  if (!S.nUp) return null;
  const { inner } = S, cd = coreDims(S.fh), Wi = rw(inner), Di = rd(inner), slack = Di - cd.along - 2 * ti;       // front room + bathroom strip share this depth
  if (Wi - cd.across - ti < 1.6 || slack < ROW_DF_MIN + ROW_BD_MIN - 1e-9) return null;
  const R = S.rng.fork('rowhouse'), stock = slack > ROW_SLACK_MAX;
  const coreLeft = S.party.left && !S.party.right ? true : S.party.right && !S.party.left ? false : R.chance(0.5);
  const bd = R.range(ROW_BD_MIN, Math.max(ROW_BD_MIN, Math.min(ROW_BD_MAX, slack - ROW_DF_MIN))), oneDraw = R.next();
  const g = coreGeo(S, 'home', stock ? { coreLeft } : { coreLeft, df: slack - bd, backMin: bd - 1e-6 });
  if (!g || g.fail || !g.back || (!stock && Math.abs(rd(g.back) - bd) > 1e-6)) return null;
  const Dr = rd(g.restB), W = rw(g.restB), dk = Math.max((Dr - ti) / 2, ROW_KITCHEN_MIN / W), dd = Dr - ti - dk;          // kitchen (the back room) and dining room (the front one) depths
  if (dd < ROW_DINING_DEPTH_MIN) return null;
  g.dd = dd;
  g.upOne = oneDraw < 0.35 || W * dd < ROW_BEDROOM_MIN;
  return g;
}

const FLAT_BED_W = 1.9, FLAT_LIVING_AREA = 6.0;     // the narrowest bedroom (m) and the smallest split-plan living room (m2) a flat is planned with

/**
 * The one home floor of a shop with a single storey above it (shop, home, roof): a flat. A home needs a bedroom of its own, and this floor held a living room, a kitchen and a
 * bathroom (17 of the barrio's shop homes had nowhere to sleep). The bedroom belongs to the shopkeeper's household (`occupant: 'shopkeeper'`, the shop's own), so the keeper has a bed.
 * Three plans, by what the lot gives:
 *  - a rest column deep enough for two rooms (5 m, and the bedroom at least FLAT_BED_W wide: that is 5.5 m2 and more for every lot the planner takes, 7 to 12 m deep and 4.2 to 10 m
 *    wide), the bath in its own strip behind the stair: the kitchen beside the stair (the hub: the landing's door and the living room's arch open onto it), the bedroom behind it
 *    and the bath off the bedroom; the whole front band stays the living room;
 *  - a front band that takes both (the front band cut at its middle, so each room has a window bay of its own; the living room above the stair, at least the stair column's width
 *    and FLAT_LIVING_AREA m2, the bedroom at least FLAT_BED_W wide): [living | bedroom], the bedroom's door onto the living room at the stair end; the rest column is the kitchen
 *    (or dining room and kitchen) and the bath as in any home;
 *  - else a studio: the whole front band is the bedroom, its door on the landing, and the kitchen (or a living room beside the stair) is where the home sits.
 */
function flatFloor(S, g, k) {
  const core = S.coreRooms[k], lz = landingAt(S), Rb = g.restB, Dr = rd(Rb), away = g.coreLeft ? 'east' : 'west', own = { occupant: 'shopkeeper' };
  const ds = clamp(Dr * 0.5 - 0.1, 2.4, 3.6), restSide = g.coreLeft ? 'right' : 'left';
  const lit = (r) => { r.needsWindow = true; return r; };                  // genWindows lights a flagged room whose bays left it without glass (openings.js lightFlagged)
  // The plan this lot used to have (the living room in front, the kitchen and then the bedroom in the rest column, the bath behind the bedroom: the bath through the bedroom, R4-301) is gone: such a
  // lot is split or a studio now. Its five doors are kept with `spare`, so the ids and the streams after them stay as they were.
  const wasStack = g.back && Dr >= 4.9 && rw(Rb) >= FLAT_BED_W - 1e-9 && !(S.party.back && S.party[restSide]);
  const fw = rw(g.front), fd = rd(g.front), across = rw(core.rect);
  const wA = Math.max(across + 0.3, fw / 2 - ti / 2), wB = fw - wA - ti;
  const split = wB >= FLAT_BED_W - 1e-9 && wA * fd >= FLAT_LIVING_AREA;
  let living = null, bedroom;
  if (split) {
    const [p, q] = g.coreLeft ? cutWest(g.front, wA) : cutEast(g.front, wA);
    living = lit(S.addRoom(k, 'living', g.coreLeft ? p : q));
    bedroom = lit(S.addRoom(k, 'bedroom', g.coreLeft ? q : p, own));
  } else bedroom = lit(S.addRoom(k, 'bedroom', g.front, own));
  let south, north;
  if (Dr >= 4.9) [south, north] = stack(S, k, Rb, [[split ? 'dining' : 'living', ds], ['kitchen', null]]);
  else south = north = S.addRoom(k, 'kitchen', Rb);
  const bath = g.back ? S.addRoom(k, 'bathroom', g.back) : carveBath(S, north, k, away);
  const n0 = S.seq.door;
  if (split) {
    S.link(living, core, { kind: 'arch', w: 1.3, atX: rcx(core.rect) });
    S.link(living, bedroom, { atZ: -Infinity });
    // (this arch closes the ring living - landing - south, the heaviest door of it, so the budget always drops it: a lot that had the five doors of the old plan does without it, `spare` counts it)
    const len = wallLen(living, south);
    if (len >= 1.5 && !wasStack) S.link(living, south, { kind: 'arch', w: Math.min(1.2, len - 0.3) });
  } else S.link(core, bedroom, { atX: rcx(core.rect) });
  S.link(core, south, { atZ: rcz(lz) });
  if (south !== north) S.link(south, north);
  S.link(north, bath);
  if (wasStack) S.spare(5 - (S.seq.door - n0));
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
    beachDoor(S);                                                                                                // (only a promenade cafe or restaurant: layouthelp.js beachSide)
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
  // upper floors: home. One storey above the shop is a flat (flatFloor: a home needs a bedroom); a taller one has its living floor and the private floors above it
  if (S.F === 2) flatFloor(S, g, 1);
  else for (let k = 1; k < S.F; k++) homeFloor(S, g, k, k === 1 ? 'public' : 'private');
  beachDoor(S);                                                                                                  // the promenade door comes last: no other door's id or draw moves (layouthelp.js)
}

/** Narrowest a flat may be when it has the floor to itself (beside the hall and stair column); two to a floor need 2.8 m each. */
const FLAT_ALONE_MIN = 3.4;
/** Shallowest a flat's living room (3.0) and bedroom (2.8) may be: the depth the kitchen and bath band may take from them. */
const FLAT_LIVING_MIN = 3.0, FLAT_BEDROOM_MIN = 2.8;

/**
 * Depths of a flat's living room and bedroom on a lot `Di` deep, flat `Wf` wide. The kitchen/bath band is what is left; when the bath is cut across the back of a narrow flat the
 * kitchen is the rest of it, so the band must hold the bath, a wall and a kitchen a hand deeper than the bath (R4-209: 3.2 x 1.41 m kitchens next to 3.2 x 1.7 m baths). A band that
 * is short takes the difference from the living room first, then the bedroom, never below their minimums; when even that is not enough the depths stay as they were and the bath is
 * cut beside the kitchen instead (`carveBath`; the bath takes no more than half the width).
 */
export function flatDepths(Di, Wf) {
  let ds = clamp(0.34 * Di, FLAT_LIVING_MIN, 4.2), dd = clamp(0.3 * Di, FLAT_BEDROOM_MIN, 3.6);
  const need = FLAT_BATH.d + ti + FLAT_BATH.d + 0.15, short = need - (Di - ds - dd - 2 * ti);
  if (short > 1e-9 && !bathCut(Wf, need, FLAT_BATH).beside) {
    const a = Math.min(short, ds - FLAT_LIVING_MIN), b = Math.min(short - a, dd - FLAT_BEDROOM_MIN);
    if (a + b >= short - 1e-9) { ds -= a; dd -= b; }
  }
  return { ds, dd };
}
/** Who lives in a flat (interiors/household.js turns it into the household's kind): drawn per flat, weighted like the barrio's own mix of families, couples and students, and elders. */
const FLAT_OCC = [['family', 4], ['young', 5], ['elder', 3]];

/**
 * Block of flats: a hall + stair column, and beside it on every floor ONE flat (a narrow lot: [flat | column] or [column | flat]) or TWO ([flat | column | flat], a lot that gives
 * each 2.8 m or more). The column is the building's own: the street door opens into its hall on the ground floor and the stair is the one stair, so it serves every flat; a flat
 * opens onto the hall by ONE door and holds all of its rooms on its own floor (living, bedroom, kitchen, bath: a flat never has to borrow a bedroom from another floor or
 * unit). Every room of a flat carries the flat's `unit` and `occupant`, which interiors/household.js turns into ONE household per flat; the hall and the stair of a floor
 * carry those of its first flat, so they make no household of their own (one with no bedroom). A lot too small for even one flat (under 5.5 m inside, or 8.4 m deep) is planned as a house.
 */
export function layoutApartments(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), cd = coreDims(S.fh), cw = cd.across;
  const two = Wi >= cw + 2 * ti + 5.6;
  // a flat is living (>= 3.0) + bedroom (>= 2.8) + kitchen/bath band (>= 2.4) front to back; a shallower plot is planned as a house
  if (!S.nUp || (!two && Wi < cw + ti + FLAT_ALONE_MIN) || Di < cd.along + ti + 3 || Di < 3.0 + 2.8 + 2.4 + 2 * ti) { return layoutHouse(S); }
  let mid, flats;                                             // the column, and each flat's rect with the side its bath goes to (away from the hall)
  if (two) {
    const wu = (Wi - cw - 2 * ti) / 2, left = R(inner.x0, inner.z0, inner.x0 + wu, inner.z1);
    mid = R(left.x1 + ti, inner.z0, left.x1 + ti + cw, inner.z1);
    flats = [[left, 'west'], [R(mid.x1 + ti, inner.z0, inner.x1, inner.z1), 'east']];
  } else {
    // the column against a party wall (the flat keeps its windows), else on the side the lot's street door is on
    const colLeft = S.party.left && !S.party.right ? true : S.party.right && !S.party.left ? false : entranceU(S) <= 0;
    mid = colLeft ? R(inner.x0, inner.z0, inner.x0 + cw, inner.z1) : R(inner.x1 - cw, inner.z0, inner.x1, inner.z1);
    flats = [colLeft ? [R(mid.x1 + ti, inner.z0, inner.x1, inner.z1), 'east'] : [R(inner.x0, inner.z0, mid.x0 - ti, inner.z1), 'west']];
  }
  const df = Di - cd.along - ti;
  const [upper, hallRect] = cutSouth(mid, df);
  S.placeCore(upper, 'z', false); S.addCoreRooms();
  const orng = S.rng.fork('flats'), { ds, dd } = flatDepths(Di, rw(flats[0][0]));
  for (let k = 0; k < S.F; k++) {
    const hall = S.addRoom(k, k === 0 ? 'entry' : 'hall', hallRect);
    const core = S.coreRooms[k];
    S.link(hall, core, { kind: 'arch', w: 1.3, atX: rcx(core.rect) });
    let first = null;
    flats.forEach(([u, away], ui) => {
      const o = { unit: 'ab'[ui], occupant: orng.weighted(FLAT_OCC, (t) => t[1])[0] };
      first ??= o;
      // The living room is the MIDDLE band: the flat's one door (hall -> living) opens into it, and the bedroom in front of it and the kitchen behind it are leaves off it, the bath hangs off the kitchen.
      // A flat used to run hall -> living -> bedroom -> kitchen -> bath, the kitchen and the bath through the bedroom (R4-301). The rooms are made in the old order (living, bedroom, kitchen), so a
      // room's id keeps its type; a middle band that the hall does not reach for 1.1 m falls back to the old order.
      const [restB, bedBand] = cutSouth(u, dd), [restK, livBand] = cutSouth(restB, ds);
      const hubOk = wallLen({ rect: hallRect }, { rect: livBand }) >= 1.1;
      let sala, dorm, cocina;
      if (hubOk) {
        sala = S.addRoom(k, 'living', livBand, o); dorm = S.addRoom(k, 'bedroom', bedBand, o); cocina = S.addRoom(k, 'kitchen', restK, o);
      } else [sala, dorm, cocina] = stack(S, k, u, [['living', ds, o], ['bedroom', dd, o], ['kitchen', null, o]]);
      const bath = carveBath(S, cocina, k, away, FLAT_BATH);
      bath.unit = o.unit; bath.occupant = o.occupant;
      if (hubOk) {
        S.link(hall, sala); S.link(sala, dorm); S.link(sala, cocina); S.link(cocina, bath);
      } else {
        S.link(hall, sala, { atZ: sala.rect.z1 - 1.0 });
        S.link(sala, dorm); S.link(dorm, cocina); S.link(cocina, bath);
      }
    });
    // the hall and the stair are nobody's home but must be in a household (interiors/household.js keys every room): the floor's first flat's, so the block has no household
    // without a bedroom (a resident cast into one would have no bed of their own)
    for (const r of [hall, core]) { r.unit = first.unit; r.occupant = first.occupant; }
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
  // a nave is tall: the plan's 4.2 m storey grows to NAVE_H + 0.3 so a flat pine ceiling with beams sits at NAVE_H under the roof (chapel_interior.js dresses it);
  // the sacristy and the bathroom keep the ordinary 2.9 m ceiling under the same walls
  S.fh = NAVE_H + 0.3; S.h = NAVE_H; S.slab = 0.3;
  for (const fd of S.floorsData) { fd.y = fd.index * S.fh; fd.h = S.h; }
  const bd = clamp(Di * 0.2, 2.4, 3.2);
  const [back, front] = cutSouth(inner, Di - bd - ti);
  const nave = S.addRoom(0, 'chapel', front, { name: 'Capilla' });
  nave.finish.ceiling = 'ceiling_pine#e0c9a8';
  const [sacR, bathR] = cutX(back, back.x0 + clamp(rw(back) * 0.64, 2.6, 7.5));
  const sacristy = S.addRoom(0, 'office', sacR, { name: 'Sacristía' });
  const bath = S.addRoom(0, 'bathroom', bathR);
  sacristy.h = bath.h = LOW_H;
  S.link(nave, sacristy, { atX: sacR.x0 + 1.1 });                                                          // by the west corner: the altar and its dais keep the middle of the back wall
  S.link(sacristy, bath);
  const hw = Math.min(DAIS_HALF, rw(front) / 2 - 0.9);                                                      // the sanctuary: one step up along the back wall (chapel_interior.js lays the floor, the altar and the retablo on it)
  const dais = R((front.x0 + front.x1) / 2 - hw, front.z0, (front.x0 + front.x1) / 2 + hw, front.z0 + DAIS_D);
  S.platforms.push({ room: nave.id, floor: 0, rect: dais, h: DAIS_H });
  S.chapel = { room: nave.id, dais };
  S.extDoor(nave, 'front', 0, { entrance: 'main', w: 1.8, h: 2.5, double: true });                     // a double door under an arch (shellfacade `chapel`)
}

/** Taller: the shop-house plan with a workshop (not a shop) at the street, behind a roll-up door. */
export function layoutWorkshop(S) {
  layoutShopHouse(S);
  for (const r of S.rooms) if (r.type === 'shop') { r.type = 'workshop'; r.name = 'Taller'; r.zone = 'public'; }
}

/** A special plan returns false when the lot does not suit it (S untouched): the house plan takes over. */
const orHouse = (plan) => (S) => { if (!plan(S)) layoutHouse(S); };

export const LAYOUTS = {
  house: layoutHouse, rowhouse: (S) => layoutHouse(S, rowhouseGeo(S) ?? undefined), shophouse: layoutShopHouse, cornerstore: layoutShopHouse, apartments: layoutApartments, unfinished: layoutUnfinished,
  kiosk: layoutKiosk, chapel: layoutChapel, workshop: layoutWorkshop, courtyard: orHouse(planCourtyard), tenement: orHouse(planTenement), school: orHouse(planSchool), clinic: orHouse(planClinic), hall: orHouse(planHall),
};

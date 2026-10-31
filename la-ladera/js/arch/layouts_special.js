// Layouts of the buildings that are not a house: the patio house (casa patio) and, further down this file, the institutions.
// A plan function returns true when it laid the building out and false when the lot does not suit it, in which case S is untouched and the caller
// falls back to the house plan (layouts.js `orHouse`). Everything is authored in the building-local frame: +z is the street.
import { T_INT, R, cutX, rw, rd, rcz, clamp, sharedWall } from './geom.js';
import { coreDims, STAIR_WIDE } from './stairs.js';
import { entranceU, linkBest, bathStrip } from './layouthelp.js';

const ti = T_INT;
/** Thickness of the wall between a gallery and the patio: heavy enough to read as a pier between two arches. */
export const TA = 0.30;
/** Arches and arcade bays top out here; the ceiling is 2.4 - 2.9 m. */
const ARCH_H = 2.2, SILL = 0.95;

/** Mirror a rect about x = 0 when `flip` (every patio plan is drawn with its stair on the west and mirrored when the stair belongs on the east). */
const mirror = (flip) => (r) => (flip ? R(-r.x1, r.z0, -r.x0, r.z1) : r);

/** Arch bays along the gallery walls of a patio band [mz0, mz0 + Dm]: one or two, the same on every floor (ground floor arches, upstairs arcade windows). */
function bayLayout(Dm, mz0) {
  const nBay = Dm >= 4.9 ? 2 : 1, bayW = clamp((Dm - (nBay + 1) * 0.7) / nBay, 1.4, 2.6);
  return { bayW, bays: Array.from({ length: nBay }, (_, i) => mz0 + ((i + 0.5) * Dm) / nBay) };
}

/** The stair goes beside the party wall when there is one (fewer windows lost), else on a coin toss. */
function coreOnWest(S, hasCore) {
  if (!hasCore) return S.rng.chance(0.5);
  return S.party.left && !S.party.right ? true : S.party.right && !S.party.left ? false : S.rng.chance(0.5);
}

// ---- casa patio ------------------------------------------------------------------------------------------------------------------------------
//   back band   | stair core | kitchen / bedrooms ........ | bath + utility |      depth Db (the core's own depth when there are stairs)
//   middle band | gallery | patio (open to the sky) | gallery | (side room) |      depth Dm; galleries are rooms, the patio is an outdoor room
//   front band  | sala | zaguan (the front door, an arch onto the patio) | sala |   depth Df
// Upstairs the patio is a void ringed by the same two galleries; their wall onto it is a solid arcade (windows from 0.95 m up) so nobody can fall.

function courtyardDims(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), hasCore = S.nUp > 0, cd = coreDims(S.fh);
  const g = 1.4;
  const Db = hasCore ? cd.along : clamp(0.3 * Di, 2.4, 3.6);
  const budget = Di - Db - 2 * ti;
  if (budget < 5.3 || Di > 13.4) return null;
  const Dm = clamp(budget * 0.5, hasCore ? 2.8 : 3.0, 4.4), Df = budget - Dm;
  if (Df < 2.4) return null;
  let P = Wi - 2 * g - 2 * TA, wR = 0;
  if (P < 2.4) return null;
  if (P > 5.4 + 2.3 + ti) { wR = P - 5.4 - ti; P = 5.4; }
  return { Db, Dm, Df, g, P, wR, hasCore, cd };
}

export function planCourtyard(S) {
  const dm = courtyardDims(S);
  if (!dm) return false;
  const { inner } = S, { Db, Dm, Df, g, wR, hasCore, cd } = dm;
  const flip = !coreOnWest(S, hasCore), M = mirror(flip);
  const room = (k, type, r, o) => S.addRoom(k, type, M(r), o);

  // ---- unflipped geometry (stair on the west) ----
  const x0 = inner.x0, x1 = inner.x1, z0 = inner.z0, z1 = inner.z1;
  const bz1 = z0 + Db, mz0 = bz1 + ti, mz1 = mz0 + Dm, fz0 = mz1 + ti;
  const gx1 = x0 + g, rx0 = wR ? x1 - wR : x1, hx1 = wR ? rx0 - ti : x1, hx0 = hx1 - g, px0 = gx1 + TA, px1 = hx0 - TA;
  const Rg1 = R(x0, mz0, gx1, mz1), Rp = R(px0, mz0, px1, mz1), Rg2 = R(hx0, mz0, hx1, mz1), Rside = wR ? R(rx0, mz0, x1, mz1) : null;
  const coreR = hasCore ? R(x0, z0, x0 + cd.across, bz1) : null;
  const backR = R(hasCore ? x0 + cd.across + ti : x0, z0, x1, bz1);
  const pcx = (px0 + px1) / 2;

  const { bayW, bays } = bayLayout(Dm, mz0);

  // ---- front door geometry ----
  const u0 = entranceU(S), uu = flip ? -u0 : u0, zw = 2.2, minSide = 2.2;
  let zx0 = clamp(uu - zw / 2, x0, x1 - zw), zx1 = zx0 + zw;
  const hasL = zx0 - ti - x0 >= minSide, hasR = x1 - ti - zx1 >= minSide;
  if (!hasL) zx0 = x0;
  if (!hasR) zx1 = x1;
  const Rz = R(zx0, fz0, zx1, z1), Rl = hasL ? R(x0, fz0, zx0 - ti, z1) : null, Rr = hasR ? R(zx1 + ti, fz0, x1, z1) : null;
  const zType = rw(Rz) <= 3.2 ? 'entry' : 'living';
  // the wider room beside the door is the living room (the left one when both are as wide), the other a dining room when it is 2.6 m wide, else a bedroom: a one-storey house with two
  // equal rooms beside its door got two living rooms and no bedroom at all
  const sideType = (r, other, left) => (zType === 'entry' && (!other || rw(r) > rw(other) + 1e-6 || (left && Math.abs(rw(r) - rw(other)) <= 1e-6)) ? 'living' : rw(r) >= 2.6 ? 'dining' : 'bedroom');
  const archToPatio = { kind: 'arch', w: bayW, h: ARCH_H };

  if (hasCore) { S.placeCore(M(coreR), 'z', false); S.addCoreRooms(); }

  // ---- ground floor ----
  const g1 = room(0, 'corridor', Rg1), pat = S.addPatio(M(Rp)), g2 = room(0, 'corridor', Rg2);
  const sd = Rside ? room(0, 'bedroom', Rside, { occupant: 'family' }) : null;
  for (const z of bays) { S.link(g1, pat, { ...archToPatio, at: z }); S.link(g2, pat, { ...archToPatio, at: z }); }
  if (sd) S.link(sd, g2);
  if (hasCore) linkBest(S, S.coreRooms[0], [g1], { min: 1.0 });
  const zr = room(0, zType, Rz, {}), lr = Rl ? room(0, sideType(Rl, Rr, true), Rl) : null, rr = Rr ? room(0, sideType(Rr, Rl, false), Rr) : null;
  if (lr) S.link(zr, lr);
  if (rr) S.link(zr, rr);
  linkBest(S, zr, [g1, g2], { pref: [pat], link: zType === 'entry' ? { kind: 'arch', w: 1.4, h: ARCH_H } : {} });
  for (const r of [lr, rr]) if (r) linkBest(S, r, [g1, g2], { pref: [pat] });
  S.extDoor(zr, 'front', u0, { entrance: 'main' });
  backFloor(0);

  // ---- upper floors ----
  for (let k = 1; k < S.F; k++) {
    const gk1 = room(k, 'corridor', Rg1), gk2 = room(k, 'corridor', Rg2);
    const sk = Rside ? room(k, 'bedroom', Rside, { occupant: 'young' }) : null;
    const ra = room(k, 'bedroom', R(x0, fz0, pcx - ti / 2, z1), { occupant: 'family' }), rb = room(k, 'bedroom', R(pcx + ti / 2, fz0, x1, z1), { occupant: k % 2 ? 'young' : 'family' });
    S.link(ra, rb);
    linkBest(S, ra, [gk1, gk2]); linkBest(S, rb, [gk2, gk1]);
    if (sk) S.link(sk, gk2);
    const core = S.coreRooms[k];
    if (core) linkBest(S, core, [gk1], { min: 1.0 });
    for (const gk of [gk1, gk2]) for (const z of bays) S.arcade(gk, M(Rp), { at: z, w: bayW, sill: SILL, h: ARCH_H - SILL });
    const back = backFloor(k);
    for (const r of [ra, rb, ...back.rooms]) { const sw = S.arcade(r, M(Rp), { w: 1.3, sill: SILL, h: 1.15, grille: true }); void sw; }
  }

  /** The back band of one floor: [stair core] [kitchen | bedroom(s)] [utility + bath] */
  function backFloor(k) {
    const ground = k === 0;
    const main = room(k, ground ? 'kitchen' : 'bedroom', backR, ground ? {} : { occupant: 'family' });
    const { bath, util } = bathStrip(S, main, k, flip ? 'west' : 'east', { utility: ground ? 'laundry' : 'backroom' });
    const rooms = [main];
    let near = main;
    if (rw(main.rect) >= 5.8) {                                         // wide: kitchen beside the stair, a bedroom beside the bath
      const [w, e] = cutX(main.rect, (main.rect.x0 + main.rect.x1) / 2);
      const [kitchenPart, otherPart] = flip ? [e, w] : [w, e];
      main.rect = kitchenPart;
      near = S.addRoom(k, ground ? 'bedroom' : 'bedroom', otherPart, { occupant: 'family' });
      rooms.push(near);
      S.link(main, near);
    }
    S.link(near, bath);
    if (util) S.link(near, util);
    const core = S.coreRooms[k];
    if (!ground && core) linkBest(S, core, [main], { min: 0.95 });         // upstairs the landing reaches the back rooms through its side wall
    const walk = ground ? [g1Rooms(0).g2, g1Rooms(0).g1] : [];
    if (ground) {
      for (const r of rooms) linkBest(S, r, walk, { pref: [pat] });
      if (util) linkBest(S, util, [g1Rooms(0).g2], { min: 1.0 });
    }
    return { rooms, bath, util };
  }
  function g1Rooms(k) { const ids = S.floorsData[k].rooms.map((id) => S.roomById(id)); const cs = ids.filter((r) => r.type === 'corridor'); return { g1: cs[0], g2: cs[1] }; }

  return true;
}

// ---- inquilinato (tenement) ------------------------------------------------------------------------------------------------------------------
//   front band | cuartos | pasillo (the street door at its front end) | cuartos |        n rooms a side, 2.3 - 3.4 m deep
//   back band  | bath | stair core | pasillo | shared kitchen |                          depth Db (the core's own depth)
// Every storey is the same: the pasillo runs the full depth and every door in the building opens onto it. The bath hangs off the stair landing (one per storey,
// shared by every cuarto); upstairs the kitchen's place is one more, bigger, room. Each cuarto is a household of its own (interiors/index.js `householdFor`).

const CUARTO_OCC = ['family', 'young', 'elder', 'family', 'young'];

function tenementDims(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), hasCore = S.nUp > 0, cd = coreDims(S.fh);
  const cw = 1.4;
  const Db = hasCore ? cd.along : clamp(0.32 * Di, 3.0, 3.9);
  const Df = Di - Db - ti;
  if (Df < 2.4) return null;
  const bathW = 1.7, wWmin = (hasCore ? cd.across : bathW) + ti + 1.5, wEmin = 2.8;     // west column: [bath | stair core] (or [bath | laundry] on one storey)
  if (Wi < cw + 2 * ti + wWmin + wEmin) return null;
  return { cw, Db, Df, wWmin, wEmin, bathW, hasCore, cd };
}

export function planTenement(S) {
  const dm = tenementDims(S);
  if (!dm) return false;
  const { inner } = S, { cw, Db, Df, wWmin, wEmin, bathW, hasCore, cd } = dm;
  const flip = !coreOnWest(S, hasCore), M = mirror(flip);
  const room = (k, type, r, o) => S.addRoom(k, type, M(r), o);

  // ---- unflipped geometry (stair and bath on the west) ----
  const x0 = inner.x0, x1 = inner.x1, z0 = inner.z0, z1 = inner.z1;
  const u0 = entranceU(S), uu = flip ? -u0 : u0;
  const cx = clamp(uu, x0 + wWmin + ti + cw / 2, x1 - wEmin - ti - cw / 2);
  const c0 = cx - cw / 2, c1 = cx + cw / 2, wW = c0 - ti - x0, wE = x1 - c1 - ti;
  const bz1 = z0 + Db, fz0 = bz1 + ti;
  const dcTarget = clamp(12 / ((wW + wE) / 2), 2.4, 3.4);                                   // about 12 m2 a cuarto
  const n = clamp(Math.round((Df + ti) / (dcTarget + ti)), 1, Math.max(1, Math.floor((Df + ti) / (2.3 + ti))));
  const dc = (Df - (n - 1) * ti) / n;
  const bands = Array.from({ length: n }, (_, i) => [z1 - (i + 1) * dc - i * ti, z1 - i * (dc + ti)]);
  const corR = R(c0, z0, c1, z1), kitR = R(c1 + ti, z0, x1, bz1);
  const coreR = hasCore ? R(c0 - ti - cd.across, z0, c0 - ti, bz1) : null;
  const bathR = hasCore ? R(x0, z0, c0 - ti - cd.across - ti, bz1) : null;
  const [flatBathR, flatLaundryR] = hasCore ? [null, null] : cutX(R(x0, z0, c0 - ti, bz1), x0 + bathW + ti / 2);

  if (hasCore) { S.placeCore(M(coreR), 'z', false); S.addCoreRooms(); }

  for (let k = 0; k < S.F; k++) {
    const ground = k === 0;
    const cor = room(k, 'corridor', corR);
    bands.forEach(([za0, za1], i) => {
      const west = room(k, 'bedroom', R(x0, za0, c0 - ti, za1), { occupant: CUARTO_OCC[(2 * i + k) % 5] });
      const east = room(k, 'bedroom', R(c1 + ti, za0, x1, za1), { occupant: CUARTO_OCC[(2 * i + k + 1) % 5] });
      S.link(cor, west); S.link(cor, east);                                                   // the leaf swings into the cuarto, never into the pasillo
    });
    const kit = room(k, ground ? 'kitchen' : 'bedroom', kitR, ground ? {} : { occupant: CUARTO_OCC[(k + 2) % 5] });
    S.link(cor, kit);
    if (hasCore) {
      const core = S.coreRooms[k], bath = room(k, 'bathroom', bathR), at = rcz(S.core.landing);
      S.link(cor, core, { atZ: at });
      S.link(core, bath, { atZ: at });
    } else {
      const bath = room(k, 'bathroom', flatBathR), laundry = room(k, 'laundry', flatLaundryR);
      S.link(cor, laundry); S.link(laundry, bath);
    }
    if (ground) S.extDoor(cor, 'front', u0, { entrance: 'main' });
  }
  return true;
}

// ---- escuela (school) ------------------------------------------------------------------------------------------------------------------------
//   back band   | classroom | classroom |                                                          depth Db (the classrooms: equal, 6.7 m wide)
//   middle band | corridor | schoolyard (open to the sky) | corridor |                             depth Dm; the corridors are the casa patio's galleries
//   front band  | stair core | entrance hall (the street door) | strip (a corridor along the yard) | depth Df (the core's own depth)
//                                                              | staff room | toilets | toilets  |    ground floor, below the strip
//                                                              | library (or a second one)       |    upstairs, below the strip
// The standard plan: the street door opens into the entrance hall; the hall opens onto the foot of the stair, onto the yard and onto the staff room; the toilets
// open onto the strip, a corridor on the yard side. Upstairs the stair lands in the upper hall (the same footprint as the entrance hall), which leads to the library
// and, along the strip, to the east corridor; the west corridor opens straight off the landing; the classrooms are off the two corridors, none of them a thoroughfare.
// The stair is the public one (STAIR_WIDE): flights 1.4 m wide, a landing as deep as the strip, a half landing as deep as the depth left over.

/** Depth of the strip along the yard, and of the stair's lower and upper landing: deeper than a flight is wide. */
const SD = 1.7;
/** The names of the rooms below the strip upstairs, one per floor (a library first). */
const UPPER_ROOMS = ['Biblioteca', 'Sala de computación', 'Sala de música'];

function schoolDims(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), hasCore = S.nUp > 0;
  const g = 1.8, hallMin = 3.2, staffMin = 2.1, wcMin = 1.5;
  const c0 = coreDims(S.fh, { ...STAIR_WIDE, LDG: SD });                                      // the flights' length (lfl) and the width (across); the half landing is sized below
  const cw = hasCore ? c0.across : 2.9;                                                       // a school without a stair has a staff room where the stair would be
  const Dfmin = hasCore ? SD + c0.lfl + STAIR_WIDE.LH : SD + ti + 3.2;
  const rem = Di - 2 * ti;
  let Dm = 3.4, Db = 5.3, Df = rem - Dm - Db;
  if (Df < Dfmin) { Db = Math.max(4.7, Db - (Dfmin - Df)); Df = rem - Dm - Db; }
  if (Df < Dfmin) { Dm = 3.2; Df = rem - Dm - Db; }
  if (Df < Dfmin - 1e-9) return null;
  const Dfmax = Dfmin + 1.2;
  if (Df > Dfmax) { const extra = Df - Dfmax, dy = Math.min(extra * 0.4, 1.2); Dm += dy; Db += extra - dy; Df = rem - Dm - Db; }
  const yardW = Wi - 2 * g - 2 * TA;
  if (yardW < 4.6 || yardW * Dm < 25 || Wi < cw + ti + hallMin + ti + staffMin + 2 * wcMin + 2 * ti) return null;
  const style = { ...STAIR_WIDE, LDG: SD, LH: hasCore ? Df - SD - c0.lfl : STAIR_WIDE.LH };
  return { g, hallMin, staffMin, wcMin, cw, Dm, Db, Df, hasCore, style };
}

export function planSchool(S) {
  const dm = schoolDims(S);
  if (!dm) return false;
  const { inner } = S, { g, hallMin, staffMin, wcMin, cw, Dm, Db, Df, hasCore, style } = dm;
  const x0 = inner.x0, x1 = inner.x1, z0 = inner.z0, z1 = inner.z1, u0 = entranceU(S);
  // the entrance hall starts beside the stair and runs far enough east to hold the street door; what is left of the width is the east block (staff room + toilets)
  const hallAt = (uu) => { const hx0 = x0 + cw + ti, hx1 = Math.max(hx0 + hallMin, uu + 0.95); return { hx0, hx1, ok: uu >= hx0 + 0.02 && x1 - hx1 - ti >= staffMin + 2 * wcMin + 2 * ti }; };
  const fitsWest = hallAt(u0).ok, fitsEast = hallAt(-u0).ok;                                  // stair on the west / on the east (the plan is drawn for the west and mirrored)
  if (!fitsWest && !fitsEast) return false;
  let flip = !coreOnWest(S, hasCore);
  if (flip ? !fitsEast : !fitsWest) flip = !flip;
  const M = mirror(flip), mx = (x) => (flip ? -x : x), room = (k, type, r, o) => S.addRoom(k, type, M(r), o);
  const uu = flip ? -u0 : u0, { hx0, hx1 } = hallAt(uu);

  // ---- unflipped geometry (the stair at the front, on the west) ----
  const bz1 = z0 + Db, mz0 = bz1 + ti, mz1 = mz0 + Dm, fz0 = mz1 + ti;
  const gx1 = x0 + g, gx2 = x1 - g, px0 = gx1 + TA, px1 = gx2 - TA;
  const Rg1 = R(x0, mz0, gx1, mz1), Rp = R(px0, mz0, px1, mz1), Rg2 = R(gx2, mz0, x1, mz1);
  const [Rc1, Rc2] = cutX(R(x0, z0, x1, bz1), (x0 + x1) / 2);
  const { bayW, bays } = bayLayout(Dm, mz0);
  const archToPatio = { kind: 'arch', w: bayW, h: ARCH_H }, archW = (w) => ({ kind: 'arch', w, h: ARCH_H });
  const coreR = hasCore ? R(x0, fz0, x0 + cw, z1) : null, Rslot = hasCore ? null : R(x0, fz0, hx0 - ti, z1);
  const Rv = R(hx0, fz0, hx1, z1);                                                            // the entrance hall (and the upper hall): the full depth of the front band
  const sx0 = hx1 + ti, ew = x1 - sx0, sz1 = fz0 + SD, dz0 = sz1 + ti, Ds = z1 - dz0;
  const Rs = R(sx0, fz0, x1, sz1);                                                            // the strip: a corridor along the south side of the yard
  const wcw = clamp((ew - 2 * ti - staffMin) / 2, wcMin, 1.9), staffW = ew - 2 * ti - 2 * wcw;
  const Rstaff = R(sx0, dz0, sx0 + staffW, z1), Rt1 = R(Rstaff.x1 + ti, dz0, Rstaff.x1 + ti + wcw, z1), Rt2 = R(Rt1.x1 + ti, dz0, x1, z1);
  const upper = ew / Ds > 1.9 ? cutX(R(sx0, dz0, x1, z1), (sx0 + x1) / 2) : [R(sx0, dz0, x1, z1)];     // below the strip upstairs: one room, or two on a wide lot

  if (hasCore) { S.stairStyle = style; S.placeCore(M(coreR), 'z', true); S.addCoreRooms(); }  // the landing faces the corridor behind it and the entrance hall beside it
  const landingZ = fz0 + SD / 2;

  // ---- ground floor ----
  const g1 = room(0, 'corridor', Rg1), pat = S.addPatio(M(Rp)), g2 = room(0, 'corridor', Rg2);
  for (const z of bays) { S.link(g1, pat, { ...archToPatio, at: z }); S.link(g2, pat, { ...archToPatio, at: z }); }
  const cl = [room(0, 'classroom', Rc1), room(0, 'classroom', Rc2)];
  linkBest(S, cl[0], [g1, g2], { into: true }); linkBest(S, cl[1], [g2, g1], { into: true });
  const vest = room(0, 'hall', Rv, { name: 'Vestíbulo' }), strip = room(0, 'corridor', Rs);
  const slot = Rslot ? room(0, 'office', Rslot, { name: 'Sala de profesores' }) : null;
  const staff = room(0, 'office', Rstaff, { name: slot ? 'Secretaría' : 'Sala de profesores' });
  const t1 = room(0, 'bathroom', Rt1, { name: 'Baño de niños' }), t2 = room(0, 'bathroom', Rt2, { name: 'Baño de niñas' });
  S.extDoor(vest, 'front', u0, { entrance: 'main' });
  if (hasCore) { const stair = S.coreRooms[0]; S.link(vest, stair, { ...archW(1.4), atZ: landingZ }); linkBest(S, stair, [g1], { min: 1.0 }); }
  if (slot) S.link(vest, slot);
  S.link(vest, staff);
  S.link(vest, strip, archW(1.4));
  linkBest(S, vest, [pat], { link: archW(2.0) });
  linkBest(S, strip, [pat], { link: archW(2.0) });
  S.link(strip, g2, archW(1.4));
  S.link(strip, t1); S.link(strip, t2);
  for (const c of cl) S.arcade(c, M(Rp), { w: 1.3, sill: SILL, h: 1.15, grille: true });

  // ---- upper floors: the stair lands in the upper hall; the corridors and the library are off it; the toilets stay on the ground floor ----
  for (let k = 1; k < S.F; k++) {
    const gk1 = room(k, 'corridor', Rg1), gk2 = room(k, 'corridor', Rg2);
    const ck = [room(k, 'classroom', Rc1), room(k, 'classroom', Rc2)];
    linkBest(S, ck[0], [gk1, gk2], { into: true }); linkBest(S, ck[1], [gk2, gk1], { into: true });
    const hall = room(k, 'hall', Rv, { name: 'Pasillo' }), sk = room(k, 'corridor', Rs);
    const core = S.coreRooms[k];
    if (core) { linkBest(S, core, [gk1], { min: 1.0 }); S.link(core, hall, { ...archW(1.4), atZ: landingZ }); }
    S.link(hall, sk, archW(1.4));
    S.link(sk, gk2, archW(1.4));
    const south = upper.map((r, i) => (Ds >= 4.6 && rw(r) >= 4.6 ? room(k, 'classroom', r) : room(k, 'office', r, { name: UPPER_ROOMS[(k - 1 + i) % UPPER_ROOMS.length] })));
    south.forEach((r, i) => S.link(i === 0 ? hall : sk, r));
    for (const gk of [gk1, gk2]) for (const z of bays) S.arcade(gk, M(Rp), { at: z, w: bayW, sill: SILL, h: ARCH_H - SILL });
    S.arcade(sk, M(Rp), { at: mx((Math.max(sx0, px0) + px1) / 2), w: bayW, sill: SILL, h: ARCH_H - SILL });
    for (const c of [...ck, hall]) S.arcade(c, M(Rp), { w: 1.3, sill: SILL, h: 1.15, grille: true });
  }
  return true;
}

// ---- puesto de salud (clinic) ----------------------------------------------------------------------------------------------------------------
//   back band  | stair core | consultorio | consultorio ... |                 depth Db (the core's own depth)
//   front band | waiting room (the street door) ............ | droguería |     depth Df
//                                                              | toilets   |
// The waiting room is the hub: every other room opens onto it, and the pharmacy counter is a hatch in the wall between the two. Upstairs the footprint repeats:
// a waiting hall, consulting rooms, an office where the pharmacy is, a bathroom.

function clinicDims(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), hasCore = S.nUp > 0, cd = coreDims(S.fh);
  const Db = hasCore ? cd.along : 3.6, Df = Di - Db - ti;
  if (Df < 4.4) return null;
  const Wex = Wi - (hasCore ? cd.across + ti : 0);
  const n = clamp(Math.floor((Wex + ti) / (3.6 + ti)), 2, 4), e = (Wex - (n - 1) * ti) / n;
  const ws = Math.min(3.0, e - 1.21);                              // the last consulting room must still touch the waiting room over 1.1 m for its door
  if (e < 3.0 || ws < 1.8) return null;
  return { Db, Df, n, e, ws, hasCore, cd };
}

export function planClinic(S) {
  const dm = clinicDims(S);
  if (!dm) return false;
  const { inner } = S, { Db, Df, n, e, ws, hasCore, cd } = dm;
  const u0 = entranceU(S);
  const flip = S.party.left !== S.party.right ? S.party.left : Math.abs(u0) > 0.5 ? u0 > 0 : !coreOnWest(S, hasCore);   // the toilets and the pharmacy go beside a party wall, or away from the door
  const M = mirror(flip), room = (k, type, r, o) => S.addRoom(k, type, M(r), o);

  // ---- unflipped geometry (the stair on the west, the pharmacy strip on the east) ----
  const x0 = inner.x0, x1 = inner.x1, z0 = inner.z0, z1 = inner.z1;
  const bz1 = z0 + Db, fz0 = bz1 + ti, ex0 = hasCore ? x0 + cd.across + ti : x0, xs0 = x1 - ws;
  const coreR = hasCore ? R(x0, z0, x0 + cd.across, bz1) : null;
  const exams = Array.from({ length: n }, (_, i) => R(ex0 + i * (e + ti), z0, ex0 + i * (e + ti) + e, bz1));
  const Rw = R(x0, fz0, xs0 - ti, z1);
  const dp = Math.min(Df - 1.7 - ti, Math.max(3.2, 6.2 / ws));                              // the pharmacy: 6 m2 or more, the toilets get what is left (1.7 m and more)
  const Rph = R(xs0, z1 - dp, x1, z1), Rwc = R(xs0, fz0, x1, z1 - dp - ti);

  if (hasCore) { S.placeCore(M(coreR), 'z', false); S.addCoreRooms(); }
  for (let k = 0; k < S.F; k++) {
    const ground = k === 0;
    const wait = room(k, 'hall', Rw, { name: ground ? 'Sala de espera' : 'Sala de espera (vacunas)' });
    const exs = exams.map((r, i) => room(k, 'office', r, { name: `Consultorio ${ground ? i + 1 : n + i + 1}` }));
    const core = S.coreRooms[k];
    if (core) linkBest(S, core, [wait], { min: 1.0 });
    for (const r of exs) linkBest(S, r, [wait], { into: true });
    S.link(wait, room(k, 'bathroom', Rwc, { name: 'Baños' }));
    if (ground) {
      const pharmacy = room(0, 'shop', Rph, { name: 'Droguería', occupant: 'shopkeeper' });
      pharmacy.shopType = 'drogueria';
      S.link(wait, pharmacy, { at: z1 - dp + 0.75 });                                       // staff door at the back, the counter hatch at the street end
      S.arcade(wait, M(Rph), { at: z1 - 0.95, w: 1.2, sill: 1.0, h: 1.0 });
      S.extDoor(wait, 'front', u0, { entrance: 'main' });
    } else S.link(wait, room(k, 'office', Rph, { name: 'Administración' }));
  }
  return true;
}

// ---- salón comunal (hall) --------------------------------------------------------------------------------------------------------------------
//   strip (stair core, toilets, kitchen: one room wide) | the hall ........................  |   the strip stands away from the street door
//                                                       | the stage (raised, behind an arch) |   (or beside a party wall)
// One big room with a stage at the back; the hatch of the small kitchen opens onto it. Upstairs: a meeting room over the hall, an office over the stage,
// a bathroom over the toilets and a store over the kitchen.

const STAGE_H = 0.4;

function hallDims(S) {
  const { inner } = S, Wi = rw(inner), Di = rd(inner), hasCore = S.nUp > 0, cd = coreDims(S.fh);
  const ws = hasCore ? cd.across : 2.4, Wh = Wi - ws - ti;
  const wcD = 1.9, kitMin = 2.4;
  if (Wh < 5.2 || Di < 7.5 || Di < (hasCore ? cd.along : 2.2 + ti) + ti + wcD + ti + kitMin) return null;
  const Ds = clamp(0.25 * Di, 2.2, hasCore ? Math.min(3.4, cd.along - 1.0 - ti - 0.2) : 3.4);      // the landing must still face the hall, not the stage
  return { ws, Wh, Ds, wcD, hasCore, cd };
}

export function planHall(S) {
  const dm = hallDims(S);
  if (!dm) return false;
  const { inner } = S, { ws, Wh, Ds, wcD, hasCore, cd } = dm;
  const u0 = entranceU(S);
  const flip = Math.abs(u0) > 0.5 ? u0 < 0 : S.party.left !== S.party.right ? S.party.right : !coreOnWest(S, hasCore);
  const M = mirror(flip), room = (k, type, r, o) => S.addRoom(k, type, M(r), o);

  // ---- unflipped geometry (the strip on the west) ----
  const x0 = inner.x0, x1 = inner.x1, z0 = inner.z0, z1 = inner.z1;
  const hx0 = x0 + ws + ti, hz0 = z0 + Ds + ti;
  const Rstage = R(hx0, z0, x1, z0 + Ds), Rhall = R(hx0, hz0, x1, z1);
  const coreR = hasCore ? R(x0, z0, x0 + ws, z0 + cd.along) : null;
  const wz0 = hasCore ? coreR.z1 + ti : hz0, wz1 = wz0 + wcD;
  const Rwc = R(x0, wz0, x0 + ws, wz1), Rkit = R(x0, wz1 + ti, x0 + ws, z1);
  const Rcam = hasCore ? null : R(x0, z0, x0 + ws, z0 + Ds);                                // one storey, no stair: a dressing room behind the stage

  if (hasCore) { S.placeCore(M(coreR), 'z', false); S.addCoreRooms(); }
  for (let k = 0; k < S.F; k++) {
    const ground = k === 0;
    const hall = room(k, 'hall', Rhall, { name: ground ? 'Salón comunal' : 'Sala de reuniones' });
    const back = room(k, ground ? 'hall' : 'office', Rstage, ground ? { name: 'Escenario', tag: 'stage', noFurnish: true } : { name: 'Oficina de la Junta' });
    const wc = room(k, 'bathroom', Rwc), kit = room(k, ground ? 'kitchen' : 'backroom', Rkit);
    const core = S.coreRooms[k];
    if (core) S.link(hall, core, { atZ: rcz(S.core.landing) });
    S.link(hall, wc);
    if (ground) {
      back.raise = STAGE_H; back.y += STAGE_H; back.h -= STAGE_H;                                  // the room's own floor and ceiling heights follow the deck
      S.platforms.push({ room: back.id, floor: 0, rect: { ...back.rect }, h: STAGE_H });
      S.link(hall, back, { kind: 'arch', w: clamp(Wh - 1.4, 2.4, 3.5), h: 2.4 });               // the proscenium
      S.link(hall, kit, { at: z1 - 0.75 });
      S.arcade(hall, M(Rkit), { at: wz1 + ti + 0.9, w: 1.4, sill: 1.0, h: 0.9 });                  // the serving hatch
      if (Rcam) S.link(back, room(0, 'backroom', Rcam, { name: 'Camerino' }));
      S.extDoor(hall, 'front', u0, { entrance: 'main' });
    } else {
      S.link(hall, back); S.link(hall, kit);
    }
  }
  return true;
}

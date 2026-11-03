// Shop fit-outs for the 14 SHOP_TYPES (vocab.js). A shop room has a SERVICE WALL (shelving, no door), a COUNTER parallel to it with
// 0.9 m of keeper space behind, a customer floor in front, and type-specific fixtures, goods and hand-lettered signs.
import { CATALOG } from './catalog.js';
import { wallInfo, wallPoint } from './layout.js';
import { D, chairsAround, fillMin, moreLights, TUBE_WARM } from './rooms.js';
import { art, clock, own } from './decor.js';
import { DECALS } from './decals.js';

const PI = Math.PI;
const any = (...fns) => { for (const f of fns) { const r = f(); if (r) return r; } return null; };

/** The wall that holds the shelves: longest free wall that has no door, preferring the one opposite the shop entrance. */
function serviceWall(L) {
  const doorWalls = new Set(); const exterior = new Set();
  for (const w of ['-z', '+z', '-x', '+x']) for (const o of L.obs[w]) if (o.kind === 'door') { doorWalls.add(w); const d = (L.bp.doors ?? []).find((x) => x.id === o.door); if (!d || d.kind === 'exterior' || d.kind === 'shutter' || d.kind === 'gate') exterior.add(w); }
  const opp = { '-z': '+z', '+z': '-z', '-x': '+x', '+x': '-x' };
  const cands = L.wallsByFree().map((w) => ({ ...w, s: w.len + (doorWalls.has(w.wall) ? -2.5 : 0) + ([...exterior].some((e) => opp[e] === w.wall) ? 1.5 : 0) }));
  cands.sort((a, b) => b.s - a.s);
  return cands[0].wall;
}

/** Counter parallel to the service wall, keeper space behind it. `o.flush`: no keeper space, the counter's back to the service wall (a room too narrow for both). Returns the counter item. */
function counterAt(L, E, name, sw, o = {}) {
  const wi = wallInfo(L.r, sw), depth = (o.shelfDepth ?? 0.4) + 0.95 + CATALOG[name].size[2] / 2;
  const mid = o.u ?? (wi.lo + wi.hi) / 2;
  const [tx, tz] = wallPoint(L.r, sw, mid, depth);
  const { flush, ...po } = o;
  const c = any(
    () => (flush ? L.wall(name, sw, { prio: 0, at: 'center', ...po }) : null),
    () => L.at(name, tx, tz, wi.ry, { prio: 0, ...po }),
    () => L.free(name, { near: [tx, tz], rad: 0.9, ry: wi.ry, prio: 0, ...po }),
    () => L.wall(name, 'any', { prio: 0, awayDoors: true, ...po }));
  if (c) c.flags = { ...(c.flags ?? {}), counter: true };
  return c;
}
const OPP = { '-z': '+z', '+z': '-z', '-x': '+x', '+x': '-x' };
/** The wall the street door is in (null when the room has none). */
function streetWall(L) {
  for (const w of ['-z', '+z', '-x', '+x']) for (const o of L.obs[w]) if (o.kind === 'door') { const d = (L.bp.doors ?? []).find((x) => x.id === o.door); if (d && (d.kind === 'exterior' || d.kind === 'shutter' || d.kind === 'gate')) return w; }
  return null;
}
/** Room-frame point just inside the street door's wall (what a customer in the doorway stands next to), or null. */
function streetPoint(L) {
  const ew = streetWall(L); if (!ew) return null;
  const wi = wallInfo(L.r, ew); return wallPoint(L.r, ew, (wi.lo + wi.hi) / 2, 0.3);
}
/** A shop's own lettering. A customer in the doorway looks at the opposite wall, so the sign goes there (over its back door when the room is tall enough, else beside it); otherwise on `fallback`. */
function sign(L, id, fallback = 'any', o = {}) {
  const ew = streetWall(L), face = ew ? OPP[ew] : null, top = L.h - 0.05 - (DECALS[id]?.h ?? 0.4);
  const lintel = face && top >= 2.2 && L.obs[face].some((q) => q.kind === 'door') ? D(L, id, face, { ...o, y: Math.min(2.2, top), at: 'center' }) : null;
  return lintel ?? (face && D(L, id, face, { ...o, at: 'center' })) ?? D(L, id, fallback, o) ?? D(L, id, 'any', o);
}
const shelves = (L, sw, name, n, o = {}) => L.run(sw, Array(n).fill(name), { prio: 1, skipMissing: true, ...o });
const standCust = (L, E, near, n, names) => {
  for (let k = 0; k < n; k++) any(() => L.free(L.rng.pick(names), { near, rad: 2.0, prio: 2 }));
};

// ---------------------------------------------------------------- seating (cafe, restaurante): a table and its chairs go in together
/** The point of each of `n` seating zones: the floor cut into a grid that follows the room's shape (a 2.4 x 6.6 m shop gets them one after the other down its length),
 *  the one farthest from the service wall first, so the tables fill the room from the back and leave the counter its wall. */
function zonesOf(L, n, sw, spine) {
  const r = L.r, cols = spine ? 1 : Math.max(1, Math.min(n, Math.round(Math.sqrt(n * L.W / L.D)))), rows = Math.ceil(n / cols), out = [];
  if (spine) {                                           // down the middle of the long axis: in a room with doors on three walls the grid's corners lie in the door lanes, and a table seeks its pose from there
    for (let k = 0; k < n; k++) out.push(L.W >= L.D ? [r.x0 + (k + 0.5) * L.W / n, (r.z0 + r.z1) / 2] : [(r.x0 + r.x1) / 2, r.z0 + (k + 0.5) * L.D / n]);
  } else for (let k = 0; k < n; k++) out.push([r.x0 + ((k % cols) + 0.5) * L.W / cols, r.z0 + (Math.floor(k / cols) + 0.5) * L.D / rows]);
  const [wx, wz] = servicePoint(L, sw);
  return out.sort((a, b) => Math.hypot(b[0] - wx, b[1] - wz) - Math.hypot(a[0] - wx, a[1] - wz));
}
/** The middle of the service wall (room frame). */
function servicePoint(L, sw) { const wi = wallInfo(L.r, sw); return wallPoint(L.r, sw, (wi.lo + wi.hi) / 2, 0); }
const POSE_BUDGET = 60;                                // poses tried per table: each costs a connectivity test and up to four chair tests
/** One table with its chairs as a single piece. The table and at least `min` chairs go in together or not at all: a table nobody can sit at is a prop, not a restaurant. Poses,
 *  nearest the zone first (the grid finds the spot against the wall a 2.4 m wide shop leaves for its tables, the aisle on the other side). Null with the room as it was. */
function seatTable(L, name, chairNames, want, min, near) {
  let tried = 0;
  for (const t of L.freePoses(name, near, { prio: 1 })) {
    if (++tried > POSE_BUDGET) return null;
    L._commit(t, { prio: 1 });
    const chairs = chairsAround(L, t, want, chairNames);
    if (chairs.length >= min) return { table: t, chairs };
    for (const c of chairs) L.remove(c);
    L.remove(t);
  }
  return null;
}
/**
 * The furniture of a shop that serves food: a counter and `o.tables` tables, each with at least two chairs. The counter goes in after `k` tables, k = 0 (the counter first, the
 * keeper's place fixed by the room) up to all of them; the first k that holds the counter and two seated tables wins, else the one that held most (the 2.4 x 6.6 m restaurant
 * seats its tables on one wall before the counter takes the other). A room that holds no such k with the counter's free zones (0.8 m of floor in front, 0.7 m behind) tries
 * again with the zones given up: the tables then stand right up to the counter, as they do in a small restaurant. o: { sw, counter: [names, best first], shelfDepth, tables,
 * table, chairs, want, dressCounter(c), dressTable(t) }. Returns the counter (or null).
 */
function dining(L, E, o) {
  const zones = zonesOf(L, o.tables, o.sw, o.spine), aim = Math.min(2, o.tables), full = 2 * aim;
  const score = (r) => (r.counter ? aim : 0) + Math.min(r.tables.length, aim);
  const attempt = (k, squeeze) => {                              // k tables, the counter, the rest of the tables
    const before = new Set(L.items), r = { counter: null, tables: [] };
    const seat = (from, to) => { for (const near of zones.slice(from, to)) { const got = seatTable(L, o.table, o.chairs, o.want, 2, near); if (got) r.tables.push(got); } };
    seat(0, k);
    for (const name of o.counter) { r.counter = counterAt(L, E, name, o.sw, { shelfDepth: o.shelfDepth, ...(squeeze ? { noClear: true, flush: true, ...o.squeezeAt } : {}) }); if (r.counter) break; }
    if (r.counter && squeeze) r.counter.zones = [];
    seat(k, zones.length);
    r.tables = r.tables.filter((t) => {                           // a seat nobody can walk up to is no seat: the table keeps the chairs that can be reached, and goes with fewer than two
      const ok = t.chairs.filter((c) => L._accessOk(c, true));
      for (const c of t.chairs) if (!ok.includes(c)) L.remove(c);
      if (ok.length >= 2) { t.chairs = ok; return true; }
      for (const c of ok) L.remove(c);
      L.remove(t.table);
      return false;
    });
    r.undo = () => { for (const it of L.items.filter((i) => !before.has(i))) L.remove(it); };
    return r;
  };
  let got = null, best = { k: 0, squeeze: false, score: -1 };
  for (const squeeze of [false, true]) for (let k = 0; k <= zones.length && !got; k++) {
    const r = attempt(k, squeeze), s = score(r);
    if (s >= full) got = r;
    else { if (s > best.score) best = { k, squeeze, score: s }; r.undo(); }
  }
  got ??= attempt(best.k, best.squeeze);
  if (got.counter) o.dressCounter?.(got.counter);
  if (o.dressTable) for (const t of got.tables) o.dressTable(t.table);
  return got.counter;
}

/** A barber's chair facing its mirror on the service wall. It is placed under the room's walking rule (the aisle behind it stays >= 0.9 m; a chair that cuts the room is taken out
 *  again by healing, which is how L05 lost its only chair), so the gap to the wall closes from 0.12 m to 0.03 m before the chair gives up. */
export function barberChair(L, sw, at, others = []) {
  for (const gap of [0.12, 0.07, 0.03]) {
    const ch = L.wall('barber_chair', sw, { flip: true, gap, noClear: true, prio: 1, awayDoors: true, ...(at != null ? { at } : {}), clearOf: others, clearBy: 0.55 });         // (0.55 m between two chairs: the barber walks between them)
    if (ch) return ch;
  }
  return null;
}

const FIT = {
  tienda(L, E, hh, sw) {
    const rng = L.rng, nsh = Math.max(1, Math.min(3, Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.2)));
    shelves(L, sw, 'shelf_tienda', nsh);
    const c = counterAt(L, E, 'shop_counter_glass', sw);
    if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); L.top(c, 'bottles_group', { at: 'center' }); }
    any(() => L.wall('fridge_drinks', 'any', { prio: 1 }));
    any(() => L.wall('chips_rack', 'any', { prio: 1 }));
    for (let k = 0; k < 2; k++) L.wall(rng.pick(['box_cardboard_l', 'box_cardboard_m']), 'any', { prio: 2, at: 'corner' });
    L.wall('stool_wood', 'any', { prio: 2 });
    sign(L, 'sign_tienda', sw); own(L, E, 'calendar_tienda', sw); D(L, 'price_list', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c, cat: rng.chance(0.4) };
    if (E.shop.cat) L.free('cat_sitting', { near: c ?? undefined, rad: 2.5, prio: 2 });
  },
  panaderia(L, E, hh, sw) {
    const rng = L.rng;
    shelves(L, sw, 'shelf_cafe', 2, { mut: { flags: { goods: 'bread' } } });                  // the baker's shelves hold loaves, not packets
    const c = counterAt(L, E, 'bread_case_glass', sw, { shelfDepth: 0.3 });
    if (c) { L.top(c, 'bread_basket', { at: 'left' }); L.top(c, 'bread_basket', { at: 'right' }); }
    any(() => L.wall('bread_rack', 'any', { prio: 1, at: 'corner' }));
    any(() => L.wall('bread_rack', 'any', { prio: 2 }));
    any(() => L.wall('dough_table', 'any', { prio: 1 }), () => L.wall('side_table', 'any', { prio: 2 }));
    any(() => L.wall('oven_baker', 'any', { prio: 1 }));
    L.wall('fridge_drinks', 'any', { prio: 2 });
    sign(L, 'sign_pan', sw); D(L, 'price_bread', 'any'); own(L, E, 'calendar_pan', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  fruver(L, E, hh, sw) {
    const rng = L.rng;
    const names = ['crate_stack_mango', 'crate_stack_lulo', 'crate_stack_tomato', 'crate_stack_veg'];
    L.run(sw, rng.shuffle([...names]), { prio: 1, skipMissing: true });
    for (let k = 0; k < 2; k++) any(() => L.free('fruit_stand', { rad: Math.max(L.W, L.D) / 2, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 0, awayDoors: true }));
    if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'fruit_bowl', { at: 'right' }); c.flags = { counter: true }; }
    for (let k = 0; k < 3; k++) L.wall(rng.pick(['fruit_crate_small', 'box_cardboard_m', 'crate_stack_veg']), 'any', { prio: 2, at: 'corner', jitter: 1 });
    L.wall('plant_pot_clay', 'any', { prio: 2, at: 'corner' });
    sign(L, 'sign_fruver', sw); D(L, 'price_list', 'any'); own(L, E, 'calendar_agua', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  carniceria(L, E, hh, sw) {
    const c = counterAt(L, E, 'fridge_meat', sw, { shelfDepth: 0.3 });
    L.hang('meat_hooks', sw, { y: 1.65, jitter: 0.1 });
    any(() => L.wall('butcher_block', 'any', { prio: 1 }));
    if (c) { L.top(c, 'phone_landline', { at: 'right' }); }                                  // (no drinks cooler: the butchers carried 112 bottles between them, R4-308)
    L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
    sign(L, 'sign_carne', sw); D(L, 'price_meat', 'any'); own(L, E, 'calendar_carne', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  peluqueria(L, E, hh, sw) {
    const wi = wallInfo(L.r, sw), n = Math.max(1, Math.min(3, Math.floor((wi.hi - wi.lo) / 1.6)));
    const roomy = Math.min(L.W, L.D) >= 2.9;           // a counter, 0.55 m of floor and a chair need about 2 m of depth, plus a passage behind the chair
    const chairs = [];
    const mirror = (over) => L.hang('mirror_barber', sw, { over, y: 1.0, w: 1.2, h: 0.9, def: { ...CATALOG.mirror_barber, size: [1.2, 0.9, 0.03] }, deepOver: false });
    for (let k = 0; k < n; k++) {
      const at = n > 1 ? (k + 0.5) / n : undefined;    // the chairs share the service wall out: two chairs 5 cm apart left the barber no room between them (R4-312)
      if (roomy) {                                     // a station under its mirror, the chair 0.55 m in front of it
        const st = L.wall('barber_station', sw, { prio: 1, at });
        if (!st) break;
        st.zones = [];                                 // the chair stands in the station's own clear zone
        mirror(st); L.top(st, 'bottles_group', { at: 'left' }); L.top(st, 'photo_frames', { at: 'right' });
        const [cx, cz] = L.rel(st, 0, st.d / 2 + 0.55);
        const ch = L.at('barber_chair', cx, cz, st.ry + PI, { prio: 1, noClear: true }) ?? L.free('barber_chair', { near: [cx, cz], rad: 0.7, face: st, prio: 1, noClear: true });
        if (ch) { ch.flags = { barber: true }; chairs.push(ch); }
      } else {                                         // a narrow room has no counter: the chair faces its mirror on the wall at arm's length and the other wall stays the passage
        const ch = barberChair(L, sw, at, chairs);
        if (!ch) break;
        ch.flags = { barber: true }; chairs.push(ch); mirror(ch);
      }
    }
    if (roomy) any(() => L.wall('shampoo_chair', 'any', { prio: 2 }));
    L.wall('bench_wood', 'any', { prio: 2, awayDoors: true });
    if (!roomy) any(() => L.hang('shelf_barber', sw, { y: 1.0, at: 'start' }), () => L.hang('shelf_barber', 'any', { y: 1.0 }));       // (after the bench: the shelf goes where nobody who waits on it meets it with their head, R4-710; on another wall when the service wall is full)
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 1, awayDoors: true })); if (c) { L.top(c, 'phone_landline', { at: 'right' }); c.flags = { counter: true }; }
    sign(L, 'sign_barber', sw); D(L, 'barber_pole', sw, { near: streetPoint(L) ?? undefined, nearW: 3 }); D(L, 'price_hair', 'any'); art(L, E, 'sport', 'any'); clock(L, E, 'any', {});
    L.wall('cat_sitting', 'any', { at: 'corner', prio: 2 });
    E.shop = { counter: c, cat: true, barber: chairs[0] };
  },
  ferreteria(L, E, hh, sw) {
    const rng = L.rng, nsh = Math.max(1, Math.min(4, Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.2)));
    shelves(L, sw, 'shelf_ferre', nsh);
    const c = counterAt(L, E, 'shop_counter_wood', sw, { shelfDepth: 0.4 });
    if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); }
    L.hang('tool_pegboard', 'any', { y: 1.0 });
    any(() => L.wall('cement_sacks', 'any', { prio: 1, at: 'corner' }));
    any(() => L.wall('paint_cans_stack', 'any', { prio: 1 }));
    any(() => L.wall('pipes_bundle', 'any', { prio: 2 }));
    any(() => L.wall('wheelbarrow', 'any', { prio: 2, at: 'corner' }));
    L.wall('bucket_big', 'any', { prio: 2 });
    any(() => L.wall('broom', 'any', { prio: 2, at: 'corner' })); any(() => L.wall('mop_bucket', 'any', { prio: 2 }));          // what a hardware store sells besides tools: brooms and mops (the goods library has four hardware articles, R4-308)
    sign(L, 'sign_ferre', sw); D(L, 'price_ferre', 'any'); own(L, E, 'calendar_ferre', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  drogueria(L, E, hh, sw) {
    const nsh = Math.max(1, Math.min(3, Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.2)));
    shelves(L, sw, 'shelf_pharma', nsh);
    const c = counterAt(L, E, 'pharmacy_counter', sw, { shelfDepth: 0.35 });
    if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); }
    any(() => L.wall('fridge_meds', 'any', { prio: 1 }));
    any(() => L.wall('chair_plastic', 'any', { prio: 2, awayDoors: true })); any(() => L.wall('chair_plastic', 'any', { prio: 2, awayDoors: true }));
    L.free('medical_scale', { rad: 3, prio: 2 });
    sign(L, 'sign_pharma', sw); own(L, E, 'calendar_pharma', 'any'); D(L, 'health_poster', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  cafe(L, E, hh, sw) {
    const rng = L.rng;
    shelves(L, sw, 'shelf_cafe', 2);
    any(() => L.wall('fridge_drinks', 'any', { prio: 2, far: servicePoint(L, sw), awayDoors: true }));           // the wall pieces first: the tables take the floor that is left
    L.wall('plant_pot_clay', 'any', { prio: 2, at: 'corner' });
    const c = dining(L, E, {
      sw, counter: ['cafe_counter', 'shop_counter_short'], shelfDepth: 0.3, tables: Math.max(2, Math.min(5, Math.floor(L.W * L.D / 5))), table: 'table_cafe_round', chairs: ['chair_metal', 'chair_wood'], want: 2,
      dressCounter: (k) => { L.top(k, 'thermos_set', { at: 'left' }); L.top(k, 'bread_basket', { at: 'right' }); L.top(k, 'radio_boombox', { at: 'center' }); },
    });
    sign(L, 'sign_tinto', sw); D(L, 'menu_board', 'any'); art(L, E, 'sport', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  restaurante(L, E, hh, sw) {
    const before = new Set(L.items), seated = () => L.items.filter((i) => i.floor && i.name === 'table_plastic').length;
    const fridge = () => any(() => L.wall('fridge_drinks', 'any', { prio: 1, far: servicePoint(L, sw), awayDoors: true }));
    const dine = (spine) => dining(L, E, {
      sw, spine, squeezeAt: spine ? { at: 'start' } : undefined, counter: ['cafe_counter', 'shop_counter_short'], shelfDepth: 0.2, tables: Math.max(2, Math.min(6, Math.floor(L.W * L.D / 4.5))), table: 'table_plastic', chairs: ['chair_plastic'], want: 4,
      dressCounter: (k) => { L.top(k, 'thermos_set', { at: 'left' }); L.top(k, 'phone_landline', { at: 'right' }); },
      dressTable: (t) => L.top(t, 'bottles_group', { at: 'center' }),
    });
    fridge();                                                                                                    // the wall pieces first: the tables take the floor that is left
    let c = dine();
    if (seated() < 2) {                                                                                         // one table reads as a counter cafe, not a restaurant (R4-117: L14 is 13.9 m2 with four doors and one free wall)
      for (const it of L.items.filter((i) => !before.has(i))) L.remove(it);                                      // the tables win: seats down the middle, the counter at the end of its wall, the drinks fridge last, if any wall is left
      c = dine(true); fridge();
    }
    L.hang('tv_wall', 'any', { y: 1.9, prio: 2 });
    sign(L, 'sign_resto', sw); D(L, 'menu_board', 'any'); art(L, E, 'sport', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c, tvWall: L.find('tv_wall') };
  },
  papeleria(L, E, hh, sw) {
    const nsh = Math.max(1, Math.min(3, Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.2)));
    shelves(L, sw, 'shelf_papel', nsh);
    const c = counterAt(L, E, 'shop_counter_wood', sw, { shelfDepth: 0.35 });
    if (c) { L.top(c, 'printer', { at: 'left' }); L.top(c, 'pc_set', { at: 'right' }); }
    any(() => L.wall('photocopier', 'any', { prio: 1 }));
    any(() => L.wall('spinner_rack', 'any', { prio: 2 }));
    L.free('school_bag', { rad: 3, prio: 2 }); L.free('box_cardboard_m', { rad: 3, prio: 2 });
    sign(L, 'sign_papel', sw); D(L, 'price_papel', 'any'); D(L, 'poster_map', 'any'); own(L, E, 'calendar_coop', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  minutos(L, E, hh, sw) {
    const n = Math.max(3, Math.min(6, Math.floor((L.W + L.D) / 1.4)));
    const cab = { prio: 1, skipMissing: true, winOk: true };                           // a row of cabins may stand in front of a window: that is where the light is
    L.run(sw, Array(n).fill('cabin_pc'), cab);
    for (const w of ['-x', '+x', '-z', '+z']) if (w !== sw && L.items.filter((i) => i.name === 'cabin_pc').length < n) L.run(w, ['cabin_pc', 'cabin_pc'], cab);
    for (const b of L.items.filter((i) => i.name === 'cabin_pc')) {
      const ch = L.at('stool_bar', ...L.rel(b, 0, b.d / 2 + 0.3), b.ry + PI, { prio: 2 });
      if (ch) ch.flags = { cabinSeat: true };
    }
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 0, awayDoors: true }));
    if (c) { L.top(c, 'phone_landline', { at: 'left' }); L.top(c, 'pc_set', { at: 'right' }); c.flags = { counter: true }; }
    any(() => L.wall('phone_booth', 'any', { prio: 2, winOk: true }));
    sign(L, 'sign_minutos', sw); D(L, 'price_minutos', 'any'); own(L, E, 'calendar_loteria', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: c };
  },
  modista(L, E, hh, sw) {
    const rng = L.rng;
    any(() => L.wall('rack_fabric', sw, { prio: 1, at: 'corner' })); any(() => L.wall('rack_fabric', 'any', { prio: 2 }));
    const st = any(() => L.wall('sewing_table', 'any', { at: 'window', prio: 0 }));
    if (st) { L.top(st, 'sewing_machine', { at: 'center' }); const ch = L.at('chair_wood', ...L.rel(st, 0, st.d / 2 + 0.35), st.ry + PI, { prio: 2, tuck: st }); if (ch) ch.flags = { work: true }; }
    if (L.W * L.D > 10) { const st2 = any(() => L.wall('sewing_table', 'any', { prio: 1 })); if (st2) { L.top(st2, 'sewing_machine', { at: 'center' }); L.at('chair_wood', ...L.rel(st2, 0, st2.d / 2 + 0.35), st2.ry + PI, { prio: 2, tuck: st2 }); } }
    any(() => L.free('cutting_table', { rad: Math.max(L.W, L.D) / 2, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
    for (let k = 0; k < 2; k++) any(() => L.wall('mannequin', 'any', { prio: 2, at: 'corner' }));
    any(() => L.wall('fitting_curtain', 'any', { prio: 1, at: 'corner', awayDoors: true }));
    L.free('ironing_board', { rad: 3, prio: 2 });
    L.hang('mirror_wall', 'any', { y: 0.5, w: 0.6, h: 1.5, def: { ...CATALOG.mirror_wall, size: [0.6, 1.5, 0.03] } });
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 1, awayDoors: true })); if (c) c.flags = { counter: true };
    sign(L, 'sign_modista', sw); D(L, 'price_modista', 'any'); own(L, E, 'calendar_church', 'any'); clock(L, E, 'any', {});
    L.wall('radio_old', 'any', { prio: 2 });
    E.shop = { counter: c, machine: st };
  },
  zapateria(L, E, hh, sw) {
    shelves(L, sw, 'shelf_shoes', Math.max(1, Math.min(3, Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.2))));
    const cb = any(() => L.wall('cobbler_bench', 'any', { prio: 0, awayDoors: true }));
    if (cb) { const s = L.at('stool_wood', ...L.rel(cb, 0, cb.d / 2 + 0.3), cb.ry + PI, { prio: 2 }); if (s) s.flags = { work: true }; }
    any(() => L.wall('shoe_grinder', 'any', { prio: 1 }));
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 1, awayDoors: true })); if (c) { c.flags = { counter: true }; L.top(c, 'shoes_pair', { at: 'center' }); }
    L.free('shoes_pair', { rad: 3, prio: 2 }); L.free('shoes_pair', { rad: 3, prio: 2 }); L.free('box_cardboard_s', { rad: 3, prio: 2 });
    sign(L, 'sign_zapa', sw); D(L, 'price_shoes', 'any'); own(L, E, 'calendar_optica', 'any'); clock(L, E, 'any', {}); L.wall('radio_old', 'any', { prio: 2 });
    E.shop = { counter: c, bench: cb };
  },
  taller(L, E, hh, sw) {
    if (/solda/i.test(E.bp.lot?.name ?? '')) return soldadura(L, E, hh, sw);          // 'Taller de Soldadura El Chispa' is a welder's, not a motorbike mechanic's (R4-307)
    const rng = L.rng;
    for (let k = 0; k < (L.W * L.D > 18 ? 2 : 1); k++) any(() => L.free('motorbike', { rad: Math.max(L.W, L.D) / 2, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
    any(() => L.wall('workbench_metal', sw, { prio: 0 })); any(() => L.wall('tool_cabinet_roll', 'any', { prio: 1 }));
    any(() => L.wall('tire_stack', 'any', { prio: 2, at: 'corner' })); any(() => L.wall('tire_stack', 'any', { prio: 2, at: 'corner' }));
    any(() => L.wall('oil_drum', 'any', { prio: 2, at: 'corner' })); any(() => L.wall('parts_shelf', 'any', { prio: 1 }));
    L.wall('radio_boombox', 'any', { prio: 2 });
    L.wall('bucket_big', 'any', { prio: 2, at: 'corner' });
    sign(L, 'sign_taller', sw); own(L, E, 'calendar_repuestos', 'any'); art(L, E, 'sport', 'any'); D(L, 'price_taller', 'any'); clock(L, E, 'any', {});
    E.shop = { counter: null };
  },
};

/** A welder's workshop, for a lot whose name says so ('Taller de Soldadura El Chispa'), from the library's own pieces: the metal bench with the pegboard over it (a second bench in a big room), the two gas
 *  bottles stood together in a corner by the bench, bar stock (the pipes bundle) along a wall, the tool cabinet with the radio on it, the parts shelf, the quench drum, the tin of anticorrosive paint and the
 *  bucket. No motorbike and no tyres: those are the mechanic's next door (R4-307). */
function soldadura(L, E, hh, sw) {
  const bench = any(() => L.wall('workbench_metal', sw, { prio: 0 }), () => L.wall('workbench_metal', 'any', { prio: 0 }));
  if (L.W * L.D > 18) any(() => L.wall('workbench_metal', 'any', { prio: 1, awayDoors: true }));
  const first = any(() => L.wall('gas_cylinder', 'any', { prio: 1, at: 'corner', ...(bench ? { near: bench, nearW: 1 } : {}) }), () => L.wall('gas_cylinder', 'any', { prio: 1, at: 'corner' }));
  any(() => (first ? L.wall('gas_cylinder', first.wallSide, { prio: 1, near: first, nearW: 8 }) : null), () => L.wall('gas_cylinder', 'any', { prio: 1, at: 'corner' }));
  any(() => L.wall('pipes_bundle', 'any', { prio: 1 }));
  const cab = any(() => L.wall('tool_cabinet_roll', 'any', { prio: 1 }));
  if (cab) L.top(cab, 'radio_boombox', { at: 'center' });
  any(() => L.wall('parts_shelf', 'any', { prio: 1 }));
  any(() => L.wall('oil_drum', 'any', { prio: 2, at: 'corner' }));
  any(() => L.wall('paint_cans_stack', 'any', { prio: 2, at: 'corner' }));
  L.wall('bucket_big', 'any', { prio: 2, at: 'corner' });
  if (bench) L.hang('tool_pegboard', 'any', { y: 1.15, over: bench });
  sign(L, 'sign_soldadura', sw); own(L, E, 'calendar_ferre', 'any'); art(L, E, 'sport', 'any'); D(L, 'price_solda', 'any'); clock(L, E, 'any', {});
  E.shop = { counter: null };
}

export function shopRoom(L, E, hh) {
  const type = E.forceShop && FIT[E.forceShop] ? E.forceShop : E.bp.lot?.shop && FIT[E.bp.lot.shop] ? E.bp.lot.shop : 'tienda';
  L.circulation = false;
  const sw = serviceWall(L);
  const rng = L.rng;
  L.laneEntrance(1.1);                                  // a shop is 2 to 4.5 m wide: the street door's entrance is a 1.1 m lane (a 2.4 m shutter would keep 2.6 m of the floor bare)
  FIT[type](L, E, hh, sw);
  E.shopType = type;
  // ceiling fixture: ALWAYS a fluorescent tube (shops are brightly lit), a warm-white one (rooms.js TUBE_WARM, about 3300 K); a fan, when the room is long enough, hangs beside it
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2, longW = L.W >= L.D, span = longW ? L.W : L.D, off = Math.min(span / 4, 1.5);
  let tx = cx, tz = cz;
  if (span >= 4.2 && L.W * L.D >= 12 && rng.chance(0.5)) {
    L.ceil('fan_ceiling', longW ? cx + off : cx, longW ? cz : cz + off, { ry: rng.range(0, PI) });
    tx = longW ? cx - off : cx; tz = longW ? cz : cz - off;
  }
  L.ceil('light_tube', tx, tz, { ry: longW ? 0 : PI / 2 });
  L.fixture = { x: tx, z: tz, kind: 'tube', color: TUBE_WARM, i: 10, d: 8 };
  moreLights(L, 'tube');
  fillMin(L, E, hh, 8);
}
export const SHOP_FITOUTS = Object.keys(FIT);

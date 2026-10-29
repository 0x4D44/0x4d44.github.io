// Shop fit-outs for the 14 SHOP_TYPES (vocab.js). A shop room has a SERVICE WALL (shelving, no door), a COUNTER parallel to it with
// 0.9 m of keeper space behind, a customer floor in front, and type-specific fixtures, goods and hand-lettered signs.
import { CATALOG } from './catalog.js';
import { wallInfo, wallPoint } from './layout.js';
import { D, chairsAround, fillMin, moreLights } from './rooms.js';

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

/** Counter parallel to the service wall, keeper space behind it. Returns the counter item. */
function counterAt(L, E, name, sw, o = {}) {
  const wi = wallInfo(L.r, sw), depth = (o.shelfDepth ?? 0.4) + 0.95 + CATALOG[name].size[2] / 2;
  const mid = o.u ?? (wi.lo + wi.hi) / 2;
  const [tx, tz] = wallPoint(L.r, sw, mid, depth);
  const c = any(
    () => L.at(name, tx, tz, wi.ry, { prio: 0, ...o }),
    () => L.free(name, { near: [tx, tz], rad: 0.9, ry: wi.ry, prio: 0, ...o }),
    () => L.wall(name, 'any', { prio: 0, awayDoors: true, ...o }));
  if (c) c.flags = { ...(c.flags ?? {}), counter: true };
  return c;
}
const shelves = (L, sw, name, n, o = {}) => L.run(sw, Array(n).fill(name), { prio: 1, skipMissing: true, ...o });
const standCust = (L, E, near, n, names) => {
  for (let k = 0; k < n; k++) any(() => L.free(L.rng.pick(names), { near, rad: 2.0, prio: 2 }));
};

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
    D(L, 'calendar_tienda', sw); D(L, 'price_list', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c, cat: rng.chance(0.4) };
    if (E.shop.cat) L.free('cat_sitting', { near: c ?? undefined, rad: 2.5, prio: 2 });
  },
  panaderia(L, E, hh, sw) {
    const rng = L.rng;
    shelves(L, sw, 'shelf_cafe', 2);
    const c = counterAt(L, E, 'bread_case_glass', sw, { shelfDepth: 0.3 });
    if (c) { L.top(c, 'bread_basket', { at: 'left' }); L.top(c, 'bread_basket', { at: 'right' }); }
    any(() => L.wall('bread_rack', 'any', { prio: 1, at: 'corner' }));
    any(() => L.wall('bread_rack', 'any', { prio: 2 }));
    any(() => L.wall('dough_table', 'any', { prio: 1 }), () => L.wall('side_table', 'any', { prio: 2 }));
    any(() => L.wall('oven_baker', 'any', { prio: 1 }));
    L.wall('fridge_drinks', 'any', { prio: 2 });
    D(L, 'sign_pan', sw, { y: 1.95 }); D(L, 'price_list', 'any'); L.hang('clock_wall', 'any', {});
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
    D(L, 'price_list', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c };
  },
  carniceria(L, E, hh, sw) {
    const c = counterAt(L, E, 'fridge_meat', sw, { shelfDepth: 0.3 });
    L.hang('meat_hooks', sw, { y: 1.65, jitter: 0.1 });
    any(() => L.wall('butcher_block', 'any', { prio: 1 }));
    L.wall('fridge_drinks', 'any', { prio: 2 });
    if (c) { L.top(c, 'phone_landline', { at: 'right' }); }
    L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
    D(L, 'price_list', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c };
  },
  peluqueria(L, E, hh, sw) {
    const rng = L.rng;
    const mirrorLen = Math.floor((wallInfo(L.r, sw).hi - wallInfo(L.r, sw).lo) / 1.5);
    const n = Math.max(1, Math.min(3, mirrorLen));
    const placed = [];
    for (let k = 0; k < n; k++) {
      const st = any(() => L.run(sw, ['barber_station'], { prio: 1, skipMissing: true, stretch: 0 })[0]);
      if (!st) break;
      placed.push(st);
    }
    for (const st of placed) {
      L.hang('mirror_barber', sw, { over: st, y: 1.0, w: 1.2, h: 0.9, def: { ...CATALOG.mirror_barber, size: [1.2, 0.9, 0.03] }, deepOver: false });
      L.top(st, 'bottles_group', { at: 'left' }); L.top(st, 'photo_frames', { at: 'right' });
      const [cx, cz] = L.rel(st, 0, st.d / 2 + 0.55);
      const ch = L.at('barber_chair', cx, cz, st.ry + PI, { prio: 1 }) ?? L.free('barber_chair', { near: [cx, cz], rad: 0.7, face: st, prio: 1 });
      if (ch) ch.flags = { barber: true };
    }
    any(() => L.wall('shampoo_chair', 'any', { prio: 2 }));
    L.wall('bench_wood', 'any', { prio: 2, awayDoors: true });
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 1, awayDoors: true })); if (c) { L.top(c, 'phone_landline', { at: 'right' }); c.flags = { counter: true }; }
    D(L, 'sign_barber', 'any', { y: 1.75 }); D(L, 'poster_football_c', 'any'); D(L, 'price_list', 'any'); L.hang('clock_wall', 'any', {});
    L.free('cat_sitting', { rad: 3, prio: 2 });
    E.shop = { counter: c, cat: true, barber: placed[0] };
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
    D(L, 'sign_ferre', sw, { y: 2.05 }); D(L, 'price_list', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
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
    D(L, 'sign_pharma', sw, { y: 1.95 }); D(L, 'calendar_pharma', 'any'); D(L, 'health_poster', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c };
  },
  cafe(L, E, hh, sw) {
    const rng = L.rng;
    shelves(L, sw, 'shelf_cafe', 2);
    const c = counterAt(L, E, 'cafe_counter', sw, { shelfDepth: 0.3 });
    if (c) { L.top(c, 'thermos_set', { at: 'left' }); L.top(c, 'bread_basket', { at: 'right' }); L.top(c, 'radio_boombox', { at: 'center' }); }
    const nt = Math.max(2, Math.min(5, Math.floor(L.W * L.D / 5)));
    for (let k = 0; k < nt; k++) {
      const t = any(() => L.free('table_cafe_round', { rad: Math.max(L.W, L.D), prio: 1 }));
      if (t) chairsAround(L, t, 2, ['chair_metal', 'chair_wood']);
    }
    any(() => L.wall('fridge_drinks', 'any', { prio: 2 }));
    D(L, 'sign_tinto', sw, { y: 1.95 }); D(L, 'menu_board', 'any'); D(L, 'poster_football_c', 'any'); L.hang('clock_wall', 'any', {});
    L.wall('plant_pot_clay', 'any', { prio: 2, at: 'corner' });
    E.shop = { counter: c };
  },
  restaurante(L, E, hh, sw) {
    const rng = L.rng;
    const c = counterAt(L, E, 'cafe_counter', sw, { shelfDepth: 0.2 });
    if (c) { L.top(c, 'thermos_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); }
    const nt = Math.max(2, Math.min(6, Math.floor(L.W * L.D / 4.5)));
    for (let k = 0; k < nt; k++) {
      const t = any(() => L.free('table_plastic', { rad: Math.max(L.W, L.D), prio: 1 }));
      if (t) { chairsAround(L, t, 4, ['chair_plastic']); L.top(t, 'bottles_group', { at: 'center' }); }
    }
    any(() => L.wall('fridge_drinks', 'any', { prio: 1 }));
    L.hang('tv_wall', 'any', { y: 1.9, prio: 2 });
    D(L, 'menu_board', sw); D(L, 'price_list', 'any'); D(L, 'poster_football_a', 'any'); L.hang('clock_wall', 'any', {});
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
    D(L, 'price_list', 'any'); D(L, 'poster_map', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c };
  },
  minutos(L, E, hh, sw) {
    const n = Math.max(2, Math.min(6, Math.floor((L.W + L.D) / 1.4)));
    L.run(sw, Array(n).fill('cabin_pc'), { prio: 1, skipMissing: true });
    for (const w of ['-x', '+x', '-z', '+z']) if (w !== sw && L.items.filter((i) => i.name === 'cabin_pc').length < n) L.run(w, ['cabin_pc', 'cabin_pc'], { prio: 1, skipMissing: true });
    for (const cab of L.items.filter((i) => i.name === 'cabin_pc')) {
      const ch = L.at('stool_bar', ...L.rel(cab, 0, cab.d / 2 + 0.3), cab.ry + PI, { prio: 2 });
      if (ch) ch.flags = { cabinSeat: true };
    }
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 0, awayDoors: true }));
    if (c) { L.top(c, 'phone_landline', { at: 'left' }); L.top(c, 'pc_set', { at: 'right' }); c.flags = { counter: true }; }
    any(() => L.wall('phone_booth', 'any', { prio: 2 }));
    D(L, 'sign_minutos', 'any', { y: 1.9 }); D(L, 'price_list', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: c };
  },
  modista(L, E, hh, sw) {
    const rng = L.rng;
    any(() => L.wall('rack_fabric', sw, { prio: 1, at: 'corner' })); any(() => L.wall('rack_fabric', 'any', { prio: 2 }));
    const st = any(() => L.wall('sewing_table', 'any', { at: 'window', prio: 0 }));
    if (st) { L.top(st, 'sewing_machine', { at: 'center' }); const ch = L.at('chair_wood', ...L.rel(st, 0, st.d / 2 + 0.35), st.ry + PI, { prio: 2 }); if (ch) ch.flags = { work: true }; }
    if (L.W * L.D > 10) { const st2 = any(() => L.wall('sewing_table', 'any', { prio: 1 })); if (st2) { L.top(st2, 'sewing_machine', { at: 'center' }); L.at('chair_wood', ...L.rel(st2, 0, st2.d / 2 + 0.35), st2.ry + PI, { prio: 2 }); } }
    any(() => L.free('cutting_table', { rad: Math.max(L.W, L.D) / 2, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
    for (let k = 0; k < 2; k++) any(() => L.wall('mannequin', 'any', { prio: 2, at: 'corner' }));
    any(() => L.wall('fitting_curtain', 'any', { prio: 1, at: 'corner', awayDoors: true }));
    L.free('ironing_board', { rad: 3, prio: 2 });
    L.hang('mirror_wall', 'any', { y: 0.5, w: 0.6, h: 1.5, def: { ...CATALOG.mirror_wall, size: [0.6, 1.5, 0.03] } });
    const c = any(() => L.wall('shop_counter_short', 'any', { prio: 1, awayDoors: true })); if (c) c.flags = { counter: true };
    D(L, 'price_list', 'any'); D(L, 'calendar_church', 'any'); L.hang('clock_wall', 'any', {});
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
    D(L, 'price_list', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {}); L.wall('radio_old', 'any', { prio: 2 });
    E.shop = { counter: c, bench: cb };
  },
  taller(L, E, hh, sw) {
    const rng = L.rng;
    for (let k = 0; k < (L.W * L.D > 18 ? 2 : 1); k++) any(() => L.free('motorbike', { rad: Math.max(L.W, L.D) / 2, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
    any(() => L.wall('workbench_metal', sw, { prio: 0 })); any(() => L.wall('tool_cabinet_roll', 'any', { prio: 1 }));
    any(() => L.wall('tire_stack', 'any', { prio: 2, at: 'corner' })); any(() => L.wall('tire_stack', 'any', { prio: 2, at: 'corner' }));
    any(() => L.wall('oil_drum', 'any', { prio: 2, at: 'corner' })); any(() => L.wall('parts_shelf', 'any', { prio: 1 }));
    L.wall('radio_boombox', 'any', { prio: 2 });
    L.wall('bucket_big', 'any', { prio: 2, at: 'corner' });
    D(L, 'calendar_tienda', 'any'); D(L, 'poster_football_a', 'any'); D(L, 'price_list', 'any'); L.hang('clock_wall', 'any', {});
    E.shop = { counter: null };
  },
};

export function shopRoom(L, E, hh) {
  const type = E.forceShop && FIT[E.forceShop] ? E.forceShop : E.bp.lot?.shop && FIT[E.bp.lot.shop] ? E.bp.lot.shop : 'tienda';
  L.circulation = false;
  const sw = serviceWall(L);
  const rng = L.rng;
  FIT[type](L, E, hh, sw);
  E.shopType = type;
  // ceiling fixture: ALWAYS a cool fluorescent tube (shops are brightly lit, homes are warm); a fan, when the room is long enough, hangs beside it
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2, longW = L.W >= L.D, span = longW ? L.W : L.D, off = Math.min(span / 4, 1.5);
  let tx = cx, tz = cz;
  if (span >= 4.2 && L.W * L.D >= 12 && rng.chance(0.5)) {
    L.ceil('fan_ceiling', longW ? cx + off : cx, longW ? cz : cz + off, { ry: rng.range(0, PI) });
    tx = longW ? cx - off : cx; tz = longW ? cz : cz - off;
  }
  L.ceil('light_tube', tx, tz, { ry: longW ? 0 : PI / 2 });
  L.fixture = { x: tx, z: tz, kind: 'tube', color: 0xeaf2ff, i: 10, d: 8 };
  moreLights(L, 'tube');
  fillMin(L, E, hh, 8);
}
export const SHOP_FITOUTS = Object.keys(FIT);

// Special rooms: chapel, classroom, clinic (waiting / exam), community hall, workshop, one-room tenement homes, building-site rooms.
import { CATALOG } from './catalog.js';
import { opposite, wallInfo, wallPoint, mkObb } from './layout.js';
import { decalDef } from './decals.js';
import { D, chairsAround, fillMin, outdoor } from './rooms.js';
import { SHOP_FITOUTS } from './shops.js';

const PI = Math.PI;
const any = (...fns) => { for (const f of fns) { const r = f(); if (r) return r; } return null; };

/** The wall facing the main entrance: the 'front' of a nave / classroom / hall. */
function headWalls(L, preferWindowless = false) {
  const opp = opposite;
  const door = [];
  for (const w of ['-z', '+z', '-x', '+x']) { const n = L.obs[w].filter((o) => o.kind === 'door').length; const wn = L.obs[w].filter((o) => o.kind === 'window').length; door.push({ w, n, wn, len: L.freeLen(w) }); }
  const entrance = door.filter((d) => d.n > 0).sort((a, b) => b.n - a.n)[0];
  const noDoor = door.filter((d) => d.n === 0), withDoor = door.filter((d) => d.n > 0).sort((a, b) => a.n - b.n);
  if (entrance) { const o = opp(entrance.w); noDoor.sort((a, b) => (b.w === o) - (a.w === o) || b.len - a.len); }
  else noDoor.sort((a, b) => b.len - a.len);
  if (preferWindowless) noDoor.sort((a, b) => a.wn - b.wn || b.len - a.len);
  return [...noDoor, ...withDoor].map((d) => d.w);
}
const headWall = (L, preferWindowless = false) => headWalls(L, preferWindowless)[0];

export function chapel(L, E, hh) {
  const rng = L.rng;
  let hw = headWall(L), altar = null;
  for (const w of headWalls(L)) { altar = L.wall('altar_main', w, { at: 'center', prio: 0, winOk: true }); if (altar) { hw = w; break; } }
  altar ??= L.wall('altar_main', 'any', { prio: 0, winOk: true });
  const wi = wallInfo(L.r, hw);
  const len = wi.hi - wi.lo, depth = wi.ax === 'x' ? L.D : L.W;
  if (altar) {
    altar.flags = { altar: true, chapel: true };
    L.top(altar, 'candles_set', { at: 'left' }); L.top(altar, 'candles_set', { at: 'right' }); L.top(altar, 'vase_flowers', { at: 'center' });
    L.hang('crucifix_large', altar.wallSide, { over: altar, y: Math.min(1.9, L.h - 1.3) });
    for (const side of [-1, 1]) {
      const [x, z] = L.rel(altar, side * (altar.w / 2 + 0.75), 0.1);
      const st = L.at('statue_saint_large', x, z, altar.ry, { prio: 1, winOk: true });
      if (st) st.flags = { statue: true };
    }
    any(() => L.at('lectern', ...L.rel(altar, altar.w / 2 + 1.3, 0.5), altar.ry + 0.3, { prio: 2, winOk: true }), () => L.wall('lectern', 'any', { prio: 2 }));
    const kn = L.at('kneeler', ...L.rel(altar, 0, altar.d / 2 + 0.9), altar.ry, { prio: 2 }); void kn;
    any(() => L.at('candle_rack', ...L.rel(altar, -(altar.w / 2 + 1.5), 0.3), altar.ry, { prio: 2, winOk: true }), () => L.wall('candle_rack', 'any', { prio: 2 }));
  }
  // pews: rows facing the altar, centre aisle
  const ry = wi.ry + PI;
  const aisle = len >= 5.6 ? 1.1 : 0.9, pewName = len >= 5.6 ? 'bench_pew' : 'bench_pew_short';
  const pw = CATALOG[pewName].size[0], pd = CATALOG[pewName].size[2];
  const cols = len >= 4.2 ? [-1, 1] : [1];
  const along = (wi.lo + wi.hi) / 2;
  const startD = 2.6, pitch = pd + 0.55;
  let rows = 0;
  for (let t = startD; t + pd / 2 < depth - 0.5; t += pitch) {
    for (const cs of cols) {
      const u = along + cs * (aisle / 2 + pw / 2);
      const [x, z] = wallPoint(L.r, hw, u, t);
      const p = L.at(pewName, x, z, ry, { prio: 1 });
      if (p) p.flags = { pew: true };
    }
    rows++;
  }
  // wall decor: stations of the cross, Virgin, calendar
  for (let k = 0; k < 6; k++) D(L, 'stations', k % 2 ? ['-x', '-z'] : ['+x', '+z'], { y: 1.55 });
  D(L, 'picture_virgin', 'any'); D(L, 'calendar_church', 'any'); D(L, 'blessing', 'any');
  any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 })); any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('bulb_bare', cx, cz);
  L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffe0b0, i: 6, d: 8 };
  fillMin(L, E, hh, 8);
}

export function classroom(L, E, hh) {
  const rng = L.rng, bw = headWall(L, true), wi = wallInfo(L.r, bw);
  const len = wi.hi - wi.lo, depth = wi.ax === 'x' ? L.D : L.W;
  const bl = Math.min(2.4, len - 0.8);
  D(L, 'chalkboard', bw, { w: bl, h: bl * 1.1 / 2.4, def: { ...decalDef('chalkboard'), size: [bl, bl * 1.1 / 2.4, 0.025] }, at: 'center', jitter: 0.01 });
  const td = any(() => L.at('desk_teacher', ...wallPoint(L.r, bw, wi.lo + 1.0 + 0.65, 0.8), wi.ry + PI, { prio: 0 }), () => L.wall('desk_teacher', 'any', { prio: 0, awayDoors: true }));
  if (td) { L.at('chair_wood', ...L.rel(td, 0, -(td.d / 2 + 0.35)), td.ry, { prio: 2 }); L.top(td, 'books_stack', { at: 'left' }); L.top(td, 'photo_frames', { at: 'right' }); }
  // student desks: columns in pairs with aisles, rows facing the board
  const dn = 'desk_school', dw = CATALOG[dn].size[0], dd = CATALOG[dn].size[2];
  const ry = wi.ry + PI;
  const cols = []; let u = wi.lo + 0.55;
  while (u + dw < wi.hi - 0.4) { cols.push(u + dw / 2); u += dw + ((cols.length % 2) ? 0.8 : 0.02); }
  const startD = 2.0;
  let n = 0;
  for (let t = startD; t + dd < depth - 0.55; t += dd + 0.12) for (const cu of cols) {
    const [x, z] = wallPoint(L.r, bw, cu, t + dd / 2);
    const d = L.at(dn, x, z, ry, { prio: 1 });
    if (d) { n++; if (rng.chance(0.25)) { const p = L.top(d, 'books_stack', { at: 'center' }); void p; } }
  }
  any(() => L.wall('locker_pair', 'any', { prio: 2, awayDoors: true })); any(() => L.wall('cubby_shelf', 'any', { prio: 2, awayDoors: true }));
  any(() => L.wall('bookshelf', 'any', { prio: 2, awayDoors: true }));
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  D(L, 'alphabet_chart', 'any', { y: 1.65 }); D(L, 'flag_co', 'any', { y: 1.7 }); D(L, 'times_table', 'any'); D(L, 'schedule', 'any');
  D(L, 'kids_drawing_a', 'any'); D(L, 'kids_drawing_b', 'any'); D(L, 'kids_drawing_a', 'any'); L.hang('clock_wall', 'any', {}); L.hang('coat_rack_wall', 'any', { y: 1.2 });
  L.free('school_bag', { rad: 4, prio: 2 });
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: 0xeaf2ff, i: 10, d: 9 };
  E.classroomDesks = (E.classroomDesks ?? 0) + n;
  fillMin(L, E, hh, 10);
}

export function clinicWaiting(L, E, hh) {
  const rng = L.rng;
  const c = any(() => L.wall('shop_counter_short', 'any', { prio: 0, awayDoors: true }));
  if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); c.flags = { counter: true }; E.shop = { counter: c, clinic: true }; }
  for (let k = 0; k < 2; k++) any(() => L.wall('waiting_row', 'any', { prio: 1, awayDoors: true }));
  const st = any(() => L.wall('side_table', 'any', { prio: 2, at: 'corner' })); if (st) L.top(st, 'books_stack', { at: 'center' });
  any(() => L.wall('wheelbarrow', 'any', { prio: 3 }) && null);
  any(() => L.free('wheelchair', { rad: 3, prio: 2 }));
  L.wall('plant_pot_clay', 'any', { prio: 2, at: 'corner' });
  L.wall('water_stand', 'any', { prio: 2, at: 'corner' });
  D(L, 'health_poster', 'any'); D(L, 'vaccines', 'any'); D(L, 'calendar_pharma', 'any'); D(L, 'blessing', 'any'); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: 0xeaf6ff, i: 10, d: 8 };
  fillMin(L, E, hh, 8);
}
export function clinicExam(L, E, hh) {
  const bed = any(() => L.wall('exam_bed', 'any', { prio: 0, awayDoors: true, sideNeed: 0.6 }), () => L.wall('exam_bed', 'any', { prio: 0 }));
  if (bed) bed.flags = { exam: true };
  const d = any(() => L.wall('desk_office', 'any', { prio: 1, awayDoors: true }), () => L.wall('desk_wood', 'any', { prio: 1 }));
  if (d) { L.top(d, 'pc_set', { at: 'left' }); L.top(d, 'books_stack', { at: 'right' }); L.at('office_chair', ...L.rel(d, 0, d.d / 2 + 0.4), d.ry + PI, { prio: 2 }); }
  any(() => L.wall('med_cabinet', 'any', { prio: 1 })); any(() => L.wall('medical_scale', 'any', { prio: 2, at: 'corner' }));
  any(() => L.wall('basin_pedestal', 'any', { prio: 2 })); any(() => L.free('privacy_screen', { rad: 2, prio: 2 })); any(() => L.free('iv_stand', { rad: 3, prio: 2 }));
  any(() => L.wall('chair_metal', 'any', { prio: 2 }));
  D(L, 'eye_chart', 'any'); D(L, 'health_poster', 'any'); D(L, 'diploma', 'any'); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: 0xeaf6ff, i: 10, d: 7 };
  fillMin(L, E, hh, 8);
}

export function hall(L, E, hh) {
  const rng = L.rng, area = L.W * L.D;
  if (area > 22) any(() => L.free(rng.chance(0.5) ? 'table_pingpong' : 'table_foosball', { rad: Math.max(L.W, L.D) / 3, prio: 1, rys: L.W >= L.D ? [0, PI] : [PI / 2, -PI / 2] }));
  for (let k = 0; k < Math.min(3, Math.floor(area / 14)); k++) { const t = any(() => L.free('folding_table', { rad: Math.max(L.W, L.D) / 2, prio: 1 })); if (t) chairsAround(L, t, 4, ['chair_plastic']); }
  any(() => L.wall('trophy_case', 'any', { prio: 1, awayDoors: true }));
  for (let k = 0; k < 3; k++) L.wall('chair_plastic', 'any', { prio: 2, jitter: 1 });
  any(() => L.wall('bench_wood', 'any', { prio: 2, awayDoors: true }));
  L.wall('speaker', 'any', { prio: 2, at: 'corner' }); L.free('football', { rad: 4, prio: 2 }); L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  D(L, 'poster_football_c', 'any'); D(L, 'poster_football_a', 'any'); D(L, 'schedule', 'any'); D(L, 'photo_collage', 'any'); D(L, 'flag_co', 'any', { y: 1.8 }); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('fan_ceiling', cx, cz); L.fixture = { x: cx, z: cz, kind: 'fan', color: 0xffe2b0, i: 8, d: 9 };
  fillMin(L, E, hh, 9);
}

export function workshop(L, E, hh) {
  // reuse the motorbike-workshop fit-out through the shop module
  E.forceShop = 'taller';
}

/** A one-room home (tenement 'inquilinato' room): everything in one room. */
export function studio(L, E, hh) {
  const rng = L.rng, area = L.W * L.D;
  const bedNames = hh.kind === 'couple' || hh.kind === 'family' ? (area > 11 ? ['bed_double', 'bed_single'] : ['bed_single_metal', 'bed_single']) : ['bed_single_metal', 'bed_single', 'mattress_floor'];
  let bed = null;
  for (const n of bedNames) { bed = any(() => L.wall(n, 'any', { prio: 0, sideNeed: 0.35, awayDoors: true })); if (bed) { bed.flags = { unmade: rng.chance(1 - hh.tidy) }; break; } }
  if (bed && hh.kids && area > 10) any(() => L.wall(hh.babies ? 'bed_crib' : 'bed_bunk', 'any', { prio: 1 }));
  // kitchen corner
  const run = L.run(L.wallsByFree()[0].wall, ['counter_base', 'stove_gas', 'counter_base'], { prio: 0, skipMissing: true, fromEnd: rng.chance(0.5) });
  const stove = L.find('stove_gas');
  if (stove) { L.top(stove, 'pot_stack', { at: 'center' }); any(() => L.wall('gas_cylinder', stove.wallSide ?? 'any', { near: stove, nearW: 6, at: 'corner', prio: 1 })); }
  if (run[0]) L.top(run[0], 'dish_rack', { at: 'center' });
  any(() => L.wall('water_stand', 'any', { at: 'corner', prio: 2 }));
  const t = any(() => L.wall('table_formica_4', 'any', { prio: 1, awayDoors: true }));
  if (t) chairsAround(L, t, 2, ['chair_plastic', 'stool_wood']);
  any(() => L.wall('wardrobe_2', 'any', { prio: 1, awayDoors: true }), () => L.wall('chest_trunk', 'any', { prio: 1 }), () => L.wall('dresser_4', 'any', { prio: 1 }));
  const stand = any(() => L.wall('tv_stand', 'any', { prio: 2, awayDoors: true }), () => L.wall('side_table', 'any', { prio: 2 }));
  if (stand) L.top(stand, hh.income ? 'tv_flat' : 'tv_crt', { at: 'center' });
  L.wall('fan_stand', 'any', { at: 'corner', prio: 2 }); L.wall('drying_rack', 'any', { prio: 2 }); L.wall('bucket_big', 'any', { prio: 2, at: 'corner' });
  if (hh.altar) { const a = L.wall('altar_home', 'any', { at: 'corner', prio: 2 }); if (a) { L.top(a, 'statue_virgin', { at: 'center' }); L.top(a, 'candles_set', { at: 'left' }); a.flags = { altar: true }; D(L, 'picture_virgin', a.wallSide, { over: a, y: 1.5 }); } }
  L.hang('clothesline', 'any', { y: 1.45, w: Math.min(2.0, Math.max(L.W, L.D) - 0.8), def: { ...CATALOG.clothesline, size: [Math.min(2.0, Math.max(L.W, L.D) - 0.8), 0.55, 0.05] } });
  D(L, 'photo_family_a', 'any'); D(L, 'calendar_tienda', 'any'); D(L, 'blessing', 'any'); L.hang('crucifix_wall', 'any', {}); L.hang('clock_wall', 'any', {});
  L.free('shoes_pair', { rad: 3, prio: 2 });
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('bulb_bare', cx, cz); L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 5.5, d: 6 };
  fillMin(L, E, hh, 8);
}

/** Rooms of an unfinished building ("obra negra") without a finished interior: stacks of materials and a camp bed. */
export function construction(L, E, hh) {
  const rng = L.rng;
  for (const n of ['cement_sacks', 'cement_sacks', 'paint_cans_stack', 'wheelbarrow', 'bucket_big', 'box_cardboard_l', 'pipes_bundle', 'tire_stack']) {
    if (rng.chance(0.75)) L.wall(n, 'any', { prio: 2, at: rng.chance(0.5) ? 'corner' : 'any', jitter: 1 });
  }
  if (!L.room.outdoor && rng.chance(0.6)) { const b = L.wall('mattress_floor', 'any', { prio: 2 }); if (b) b.flags = { unmade: true }; L.wall('chair_plastic', 'any', { prio: 2 }); }
  if (!L.room.outdoor) { L.ceil('bulb_bare', (L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2); L.fixture = { x: (L.r.x0 + L.r.x1) / 2, z: (L.r.z0 + L.r.z1) / 2, kind: 'bulb', color: 0xffd9a0, i: 5, d: 6 }; }
  L.wall('radio_boombox', 'any', { prio: 2 }); L.free('shoes_pair', { rad: 3, prio: 2 });
  fillMin(L, E, hh, 4);
}

export function schoolyard(L, E, hh) {
  outdoor(L, E, hh);
  for (let k = 0; k < 2; k++) L.wall('bench_wood', 'any', { prio: 2, jitter: 1 });
  L.free('football', { rad: 4, prio: 2 }); L.wall('water_stand', 'any', { prio: 2, at: 'corner' });
  D(L, 'flag_co', 'any', { y: 1.9 }); D(L, 'kids_drawing_a', 'any');
}
void mkObb;

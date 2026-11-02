// Special rooms: chapel, classroom, clinic (waiting / exam), community hall, workshop, one-room tenement homes, building-site rooms.
import { CATALOG } from './catalog.js';
import { KNEEHOLE } from './carcass.js';
import { opposite, wallInfo, wallPoint, mkObb } from './layout.js';
import { decalDef } from './decals.js';
import { D, chairsAround, fillMin, moreLights, ceilingFixture, TUBE_WARM, fillBeds, householdPlaces } from './rooms.js';
import { art, clock, own } from './decor.js';
import { SHOP_FITOUTS } from './shops.js';
import { chapelFurnish } from '../arch/chapel_interior.js';

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
  if (chapelFurnish(L, E, hh, { D, fillMin, moreLights })) return;                  // A2's nave (arch/chapel_interior.js): altar on the back wall, clean pew rows, 14 Stations as geometry; the code below is the fallback
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
  moreLights(L, 'bulb');
  fillMin(L, E, hh, 8);
}

/**
 * The board of a classroom and the wall it hangs on: the first head wall (windowless first) that takes a board, 2.4 m wide (less on a short wall), then 2.0, 1.6 and 1.2 m where a window
 * or door cuts the stretch. A room of desks without a board is not a class, so a wall that takes none lets the next one try (the front classroom upstairs in L00 had no board: its
 * windowless wall is cut by a window and a fixed 2.4 m did not fit). The desks and the teacher's desk face the wall the board went on.
 */
function classBoard(L) {
  const walls = headWalls(L, true);
  for (const bw of walls) {
    const wi = wallInfo(L.r, bw), first = Math.min(2.4, wi.hi - wi.lo - 0.8);
    for (const bl of [first, ...[2.0, 1.6, 1.2].filter((w) => w < first - 0.05)]) {
      if (bl < 1.2) continue;
      const h = bl * 1.1 / 2.4;
      if (D(L, 'chalkboard', bw, { w: bl, h, def: { ...decalDef('chalkboard'), size: [bl, h, 0.025] }, at: 'center', jitter: 0.01 })) return { bw, wi };
    }
  }
  return { bw: walls[0], wi: wallInfo(L.r, walls[0]) };
}

export function classroom(L, E, hh) {
  const rng = L.rng, { bw, wi } = classBoard(L);
  const depth = wi.ax === 'x' ? L.D : L.W;
  const td = any(() => L.at('desk_teacher', ...wallPoint(L.r, bw, wi.lo + 1.0 + 0.65, 0.8), wi.ry + PI, { prio: 0 }), () => L.wall('desk_teacher', 'any', { prio: 0, awayDoors: true }));
  if (td) { L.at('chair_wood', ...L.rel(td, 0, -(td.d / 2 + 0.35)), td.ry, { prio: 2 }); L.top(td, 'books_stack', { at: 'left' }); L.top(td, 'photo_frames', { at: 'right' }); }
  // student desks: columns in pairs with aisles, rows facing the board
  const dn = 'desk_school', dw = CATALOG[dn].size[0], dd = CATALOG[dn].size[2];
  const ry = wi.ry + PI;
  const cols = []; let u = wi.lo + 0.55;
  while (u + dw < wi.hi - 0.4) { cols.push(u + dw / 2); u += dw + ((cols.length % 2) ? 0.8 : 0.02); }
  const shallow = depth < 5.2, startD = shallow ? 1.85 : 2.0, back = shallow ? 0.45 : 0.55;        // the teacher's desk and the 0.6 m in front of it end 1.73 m from the board; a shallow room starts its rows just past that
  let n = 0;
  for (let t = startD; t + dd < depth - back; t += dd + 0.12) for (const cu of cols) {
    const [x, z] = wallPoint(L.r, bw, cu, t + dd / 2);
    const d = L.at(dn, x, z, ry, { prio: 1 });
    if (d) { n++; if (rng.chance(0.25)) { const p = L.top(d, 'books_stack', { at: 'center' }); void p; } }
  }
  any(() => L.wall('locker_pair', 'any', { prio: 2, awayDoors: true })); any(() => L.wall('cubby_shelf', 'any', { prio: 2, awayDoors: true }));
  any(() => L.wall('bookshelf', 'any', { prio: 2, awayDoors: true }));
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  D(L, 'alphabet_chart', 'any', { y: 1.65 }); D(L, 'flag_co', 'any', { y: 1.7 }); D(L, 'times_table', 'any'); D(L, 'schedule', 'any');
  art(L, E, 'kids', 'any'); art(L, E, 'kids', 'any'); art(L, E, 'kids', 'any'); L.hang('clock_wall', 'any', {}); L.hang('coat_rack_wall', 'any', { y: 1.2 });
  L.free('school_bag', { rad: 4, prio: 2 });
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: TUBE_WARM, i: 10, d: 9 };
  moreLights(L, 'tube');
  E.classroomDesks = (E.classroomDesks ?? 0) + n;
  fillMin(L, E, hh, 10);
}

/** A clinic poster, at most two of a kind in the whole building: a clinic of six rooms is not papered with one eye chart (R4-114). */
const poster = (L, E, id) => { const n = (E.posters ??= {}); if ((n[id] ?? 0) >= 2) return null; const d = D(L, id, 'any'); if (d) n[id] = (n[id] ?? 0) + 1; return d; };

export function clinicWaiting(L, E, hh) {
  const rng = L.rng;
  const c = any(() => L.wall('shop_counter_short', 'any', { prio: 0, awayDoors: true }));
  if (c) { L.top(c, 'pc_set', { at: 'left' }); L.top(c, 'phone_landline', { at: 'right' }); c.flags = { counter: true }; E.shop = { counter: c, clinic: true }; }
  for (let k = 0; k < 2; k++) any(() => L.wall('waiting_row', 'any', { prio: 1, awayDoors: true }));
  const st = any(() => L.wall('side_table', 'any', { prio: 2, at: 'corner' })); if (st) L.top(st, 'books_stack', { at: 'center' });
  any(() => L.free('wheelchair', { rad: 3, prio: 2 }));                                      // (no wheelbarrow: that is a hardware shop's, not a waiting room's)
  L.wall('plant_pot_clay', 'any', { prio: 2, at: 'corner' });
  L.wall('water_stand', 'any', { prio: 2, at: 'corner' });
  poster(L, E, 'health_poster'); poster(L, E, 'vaccines'); own(L, E, 'calendar_pharma', 'any'); art(L, E, 'blessing', 'any'); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: TUBE_WARM, i: 10, d: 8 };
  fillMin(L, E, hh, 8);
}
export function clinicExam(L, E, hh) {
  const bed = any(() => L.wall('exam_bed', 'any', { prio: 0, awayDoors: true, sideNeed: 0.6 }), () => L.wall('exam_bed', 'any', { prio: 0 }));
  if (bed) bed.flags = { exam: true };
  const d = any(() => L.wall('desk_office', 'any', { prio: 1, awayDoors: true }), () => L.wall('desk_wood', 'any', { prio: 1 }));
  if (d) { L.top(d, 'pc_set', { at: 'left' }); L.top(d, 'books_stack', { at: 'right' }); L.at('office_chair', ...L.rel(d, KNEEHOLE, d.d / 2 + 0.4), d.ry + PI, { prio: 2, tuck: d }); }
  any(() => L.wall('med_cabinet', 'any', { prio: 1 })); any(() => L.wall('medical_scale', 'any', { prio: 2, at: 'corner' }));
  any(() => L.wall('basin_pedestal', 'any', { prio: 2 })); any(() => L.free('privacy_screen', { near: bed ?? undefined, rad: 2, prio: 2, ...(bed && { rys: [bed.ry + PI / 2, bed.ry - PI / 2] }) })); any(() => L.free('iv_stand', { near: bed ?? undefined, rad: 3, prio: 2 }));       // (beside the couch they are for, and ALONG it: a screen in the middle of a small room stood between the desk and everyone, and one across the couch's end ran in front of the desk's drawers)
  any(() => L.wall('chair_metal', 'any', { prio: 2 }));
  poster(L, E, 'eye_chart'); poster(L, E, 'health_poster'); art(L, E, ['diploma'], 'any'); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
  L.fixture = { x: cx, z: cz, kind: 'tube', color: TUBE_WARM, i: 10, d: 7 };
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
  art(L, E, 'sport', 'any'); art(L, E, 'sport', 'any'); D(L, 'schedule', 'any'); art(L, E, 'family', 'any'); D(L, 'flag_co', 'any', { y: 1.8 }); L.hang('clock_wall', 'any', {});
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.ceil('fan_ceiling', cx, cz); L.fixture = { x: cx, z: cz, kind: 'fan', color: 0xffe2b0, i: 8, d: 9 };
  moreLights(L, 'bulb');
  fillMin(L, E, hh, 9);
}

export function workshop(L, E, hh) {
  // reuse the motorbike-workshop fit-out through the shop module
  E.forceShop = 'taller';
}

/** A one-room home (tenement 'inquilinato' room): everything in one room. */
export function studio(L, E, hh) {
  const rng = L.rng, area = L.W * L.D;
  const parents = hh.kind === 'couple' || hh.kind === 'family' || hh.kind === 'shopkeeper';
  const bedNames = parents ? (area >= 9 ? ['bed_double', 'bed_single_metal', 'bed_single'] : ['bed_single_metal', 'bed_single']) : ['bed_single_metal', 'bed_single', 'mattress_floor'];
  let bed = null;
  for (const n of bedNames) { bed = any(() => L.wall(n, 'any', { prio: 0, sideNeed: 0.35, awayDoors: true })); if (bed) { bed.flags = { unmade: rng.chance(1 - hh.tidy) }; break; } }
  // the whole household sleeps in this one room: a bed for each (a bunk holds two) as far as the beds leave the kitchen corner, the table and the lanes their floor (about a third of it)
  if (bed) fillBeds(L, E, hh, [bed], Math.min(householdPlaces(hh), Math.max(2, Math.floor(area * 0.36))), parents);
  if (bed && hh.babies && area > 10) any(() => L.wall('bed_crib', 'any', { prio: 1 }));
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
  if (hh.altar) { const a = L.wall('altar_home', 'any', { at: 'corner', prio: 2 }); if (a) { L.top(a, 'statue_virgin', { at: 'center' }); L.top(a, 'candles_set', { at: 'left' }); a.flags = { altar: true }; art(L, E, 'faithPic', a.wallSide, { over: a, y: 1.5 }); } }
  L.hang('clothesline', 'any', { y: 1.45, w: Math.min(2.0, Math.max(L.W, L.D) - 0.8), def: { ...CATALOG.clothesline, size: [Math.min(2.0, Math.max(L.W, L.D) - 0.8), 0.55, 0.05] } });
  art(L, E, 'family', 'any'); art(L, E, 'cal', 'any'); art(L, E, 'blessing', 'any'); L.hang('crucifix_wall', 'any', {}); clock(L, E, 'any', {});
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

// ---------------------------------------------------------------- the rest of a school (the lead's round-4 list: 'furnishing follows the replans')
// A school lot's rooms are furnished by what they are, not where A2 puts them: `schoolFurnisher` routes by type and, for offices, by name, so a replan that moves, resizes or adds rooms
// of these kinds still furnishes them as a school. None of these leaves a household's shoe rack, shoes, family photographs or washing line behind.

/** The furnisher of a room of a school, or null (furnished as before: a house-plan fallback's kitchen, say). */
export function schoolFurnisher(room, area) {
  const t = room.type, name = room.name ?? '';
  if (t === 'classroom' || t === 'living' || t === 'dining' || t === 'shop') return classroom;      // living, dining, shop: a lot too narrow for the school plan, planned as a house
  if (t === 'bedroom' && area > 24) return classroom;
  if (t === 'patio') return schoolyard;
  if (t === 'bathroom') return room.tag === 'wc' ? schoolStall : room.tag === 'wash' ? schoolWash : schoolToilets;      // (A2's lavatory block, R4-204: a cubicle each, off a washroom passage; a lot too small for it keeps its one room of old)
  if (t === 'hall' || t === 'entry' || t === 'corridor') return schoolHall;
  if (t === 'office') return /profesor|docente|maestr/i.test(name) ? staffRoom : /bibliot/i.test(name) ? library : /computaci|inform[aá]tica|sistemas/i.test(name) ? computerRoom : /m[uú]sica/i.test(name) ? musicRoom : null;      // (the secretary's office, Secretaría, is an office: the desk, computer, telephone and files of the generic recipe)
  return null;
}

/** Enough on the walls and floor that a room is not bare, from things a school has (`fillMin` also reaches for shoes and family photographs). */
function schoolFill(L, E, min) {
  const deco = () => L.items.filter((i) => !i.ceil).length;
  const tries = [() => art(L, E, 'kids', 'any'), () => L.hang('clock_wall', 'any', {}), () => D(L, 'schedule', 'any'), () => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }),
    () => art(L, E, 'notice', 'any'), () => art(L, E, 'cal', 'any'), () => L.wall('trash_bin', 'any', { at: 'corner', prio: 2 }), () => D(L, 'flag_co', 'any', { y: 1.8 })];
  for (let g = 0; g < 10 && deco() < min; g++) tries[g % tries.length]();
}
const centreLight = (L, kind, color, i, d) => {
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  if (kind === 'tube') L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 }); else L.ceil('bulb_bare', cx, cz);
  L.fixture = { x: cx, z: cz, kind, color, i, d };
  moreLights(L, kind);
};

/** The children's lavatory (Baño de niños / de niñas): toilets side by side, basins under mirrors, a bin and a mop bucket; no shower, no towel rail. */
export function schoolToilets(L, E, hh) {
  const area = L.W * L.D, want = area >= 9 ? 3 : 2, wcs = [], basins = [];
  for (let k = 0; k < want; k++) {
    const prev = wcs[wcs.length - 1];
    const t = any(() => L.wall('toilet', prev ? prev.wallSide : 'any', { prio: 0, awayDoors: true, near: prev ? [prev.x, prev.z] : undefined, nearW: 2 }), () => L.wall('toilet', 'any', { prio: k ? 1 : 0, awayDoors: true }));
    if (t) wcs.push(t);
  }
  for (let k = 0; k < 2; k++) {
    const prev = basins[basins.length - 1];
    const b = any(() => L.wall('basin_pedestal', prev ? prev.wallSide : 'any', { prio: 0, near: prev ? [prev.x, prev.z] : wcs[0] ? [wcs[0].x, wcs[0].z] : undefined, nearW: 1.5 }), () => L.wall('basin_pedestal', 'any', { prio: 1 }));
    if (b) basins.push(b);
  }
  for (const b of basins) L.hang('mirror_bath', b.wallSide, { over: b, y: 1.25 });
  if (basins.length && !L.items.some((i) => i.name === 'mirror_bath')) L.hang('mirror_bath', 'any', { near: [basins[0].x, basins[0].z], nearW: 2, y: 1.25 });
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  any(() => L.wall('mop_bucket', 'any', { at: 'corner', prio: 2 }));
  art(L, E, ['chores'], 'any');                                                       // the cleaning rota hangs in one lavatory of the school, not in both (decor.js: a building hangs a notice once)
  centreLight(L, 'bulb', 0xffd9a0, 5.5, 6);
}

/**
 * One cubicle of the lavatory block (A2's tag 'wc', about 1.15 x 1.5 to 1.9 m, its door on a long side near one end): a toilet at the end away from the door, back to the partition,
 * the rest of the floor to stand on; a bin, a hook for a bag, a bulb. The toilet may stand in the door's keep-out when the cubicle is short: it is the toilet the door is for.
 */
export function schoolStall(L, E, hh) {
  const ends = L.D >= L.W ? ['-z', '+z'] : ['-x', '+x'];
  const wc = any(() => L.wall('toilet', ends, { at: 'center', prio: 0, awayDoors: true }), () => L.wall('toilet', ends, { at: 'center', prio: 0, awayDoors: true, ignoreKeep: true }),
    () => L.wall('toilet', 'any', { at: 'center', prio: 0, awayDoors: true, ignoreKeep: true, noConn: true }));
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  L.hang('coat_rack_wall', 'any', { y: 1.55, w: 0.5 });
  centreLight(L, 'bulb', 0xffd9a0, 4.5, 4);
}

/**
 * The passage of the lavatory block (A2's tag 'wash', 1 to 1.25 m wide, doors down both sides and the strip's at one end): the basins at the end wall with the door-less end, mirrors over
 * them, a bin, a mop bucket, the cleaning rota and a bulb. It is the washroom for the cubicles on both sides of it.
 */
export function schoolWash(L, E, hh) {
  const ends = L.D >= L.W ? ['-z', '+z'] : ['-x', '+x'], bare = ends.filter((w) => !L.obs[w].some((o) => o.kind === 'door')), end = bare.length ? bare : ends, basins = [];
  for (const at of ['start', 'end']) {
    const b = any(() => L.wall('basin_pedestal', end, { at, prio: 0 }), () => (basins.length ? null : L.wall('basin_pedestal', end, { at: 'center', prio: 0 })));
    if (b) basins.push(b);
  }
  if (!basins.length) { const b = any(() => L.wall('basin_pedestal', 'any', { prio: 0 }), () => L.wall('basin_pedestal', 'any', { prio: 0, ignoreKeep: true })); if (b) basins.push(b); }
  for (const b of basins) L.hang('mirror_bath', b.wallSide, { over: b, y: 1.25 });
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  any(() => L.wall('mop_bucket', end, { at: 'corner', prio: 2 }), () => L.wall('mop_bucket', 'any', { at: 'corner', prio: 2 }));
  art(L, E, ['chores'], 'any');                                                       // (the cleaning rota hangs in one lavatory of the school: decor.js hangs a notice once to a building)
  centreLight(L, 'bulb', 0xffd9a0, 5.5, 6);
}

/** The staff room (Sala de profesores): a table with chairs round it, a tinto corner, pigeonholes, a timetable and the notices. */
export function staffRoom(L, E, hh) {
  const area = L.W * L.D, wide = Math.min(L.W, L.D) >= 3.8;                          // a narrow staff room (2.1 to 3.5 m) has its table against a wall and the chairs on its open side
  if (area >= 9) { const d = any(() => L.wall('desk_wood', 'any', { at: 'window', prio: 2 })); if (d) { L.top(d, 'pc_set', { at: 'left' }); L.at('chair_wood', ...L.rel(d, KNEEHOLE, d.d / 2 + 0.4), d.ry + PI, { prio: 2, tuck: d }); } }       // (the marking desk first, with its chair: the table and the chairs round it take what is left)
  const t = any(() => (wide ? L.free('table_wood_6', { rad: Math.max(L.W, L.D) / 2, prio: 0 }) : null), () => L.wall('table_formica_4', 'any', { prio: 0, awayDoors: true }), () => L.wall('folding_table', 'any', { prio: 0, awayDoors: true }));
  if (t) { chairsAround(L, t, area >= 12 ? 6 : 4, ['chair_wood', 'chair_plastic']); L.top(t, 'books_stack', { at: 'left' }); L.top(t, 'thermos_set', { at: 'right' }); }
  any(() => L.wall('bench_wood', 'any', { prio: 2, awayDoors: true }));
  const side = any(() => L.wall('side_table', 'any', { at: 'corner', prio: 1 }));
  if (side) { L.top(side, 'kettle', { at: 'left' }); L.top(side, 'thermos_set', { at: 'right' }); }
  any(() => L.wall('cubby_shelf', 'any', { prio: 1, awayDoors: true }), () => L.wall('bookshelf_low', 'any', { prio: 1 }));
  any(() => L.wall('bookshelf', 'any', { prio: 1, awayDoors: true }), () => L.wall('filing_cabinet', 'any', { prio: 1 }));
  any(() => L.wall('water_stand', 'any', { at: 'corner', prio: 2 }));
  L.hang('coat_rack_wall', 'any', { y: 1.55 });
  D(L, 'schedule', 'any'); art(L, E, 'notice', 'any'); art(L, E, ['diploma'], 'any'); art(L, E, 'cal', 'any'); L.hang('clock_wall', 'any', {});
  if (L.rng.chance(0.5)) art(L, E, 'faithPic', 'any');
  ceilingFixture(L, E, hh, 'tube');
  schoolFill(L, E, 8);
}

/** The library (Biblioteca): shelves round the walls, a reading table with chairs, a librarian's desk. */
export function library(L, E, hh) {
  const area = L.W * L.D;
  const librarian = () => {                                                                       // the desk on the first wall that has room for its chair too (a desk in a corner of a narrow library, which A2's R4-204 lavatories leave upstairs, has no place to sit); returns the chair
    for (const w of ['any', '-z', '+z', '-x', '+x']) {
      const d = any(() => L.wall('desk_wood', w, { prio: 1, awayDoors: true })); if (!d) continue;
      L.top(d, 'books_stack', { at: 'right' });
      const c = L.at('chair_wood', ...L.rel(d, KNEEHOLE, d.d / 2 + 0.4), d.ry + PI, { prio: 2, tuck: d });
      if (c) return c;
      L.remove(d);
    }
    return null;
  };
  const deskFirst = area >= 12 && Math.min(L.W, L.D) >= 3.5;                                      // a library of 12 m2 and more, 3.5 m across, has the desk and its chair first (the shelves and the reading table take what is left); a small or narrow one gives the table the floor first
  let seat = deskFirst ? librarian() : null;
  const narrow = Math.min(L.W, L.D) < 3.5, rad = Math.max(L.W, L.D) / 2;
  for (let k = 0; k < Math.min(narrow ? 3 : 4, 1 + Math.floor(area / (narrow ? 5 : 4))); k++) any(() => L.wall(k % 2 ? 'bookshelf_low' : 'bookshelf', 'any', { prio: 1, awayDoors: true }), () => L.wall('bookshelf', 'any', { prio: 1 }));          // (a narrow library has the shelves its walls can spare: the reading table, with room to sit at it, comes first)
  const t = any(() => (narrow ? L.free('table_formica_4', { rad, prio: 1 }) : null), () => L.free('table_wood_6', { rad, prio: 1 }), () => L.free('table_formica_4', { rad, prio: 1 }));
  if (t) {
    const chairs = chairsAround(L, t, 4, ['chair_wood', 'chair_plastic']); L.top(t, 'books_stack', { at: 'center' });
    if (seat) for (const c of chairs.sort((a, b) => Math.hypot(a.x - seat.x, a.z - seat.z) - Math.hypot(b.x - seat.x, b.z - seat.z))) { if (L._accessOk(seat, true)) break; L.remove(c); }          // (the reading chairs nearest the librarian's give way if they wall it in: nobody can walk up to a seat in a niche, and the room's last pass drops it)
  }
  if (!deskFirst) seat = librarian();
  art(L, E, ['poster_map'], 'any'); art(L, E, 'kids', 'any'); L.hang('clock_wall', 'any', {});          // (a school with two reading rooms hangs its map once)
  L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 });
  ceilingFixture(L, E, hh, 'tube');
  schoolFill(L, E, 7);
}

/** The computer room (Sala de computación): a workstation (desk, computer, chair) along each wall, the teacher's desk, a printer. */
export function computerRoom(L, E, hh) {
  const area = L.W * L.D, want = Math.max(3, Math.min(8, Math.floor(area / 2.2)));
  const td = any(() => L.wall('desk_teacher', 'any', { prio: 0, awayDoors: true }));
  if (td) { L.top(td, 'pc_set', { at: 'left' }); L.at('office_chair', ...L.rel(td, KNEEHOLE, td.d / 2 + 0.4), td.ry + PI, { prio: 2, tuck: td }); }
  let first = null;
  for (let k = 0; k < want; k++) {
    const d = any(() => L.wall('desk_student', 'any', { prio: 1, awayDoors: true }));
    if (!d) break;
    L.top(d, 'pc_set', { at: 'right' });                                            // (over the knee-hole, where the chair is: the pedestal's end is left for the printer, and for the drawers)
    if (!L.at('chair_plastic', ...L.rel(d, KNEEHOLE, d.d / 2 + 0.35), d.ry + PI, { prio: 2, tuck: d })) { L.remove(d); break; }          // (a workstation with nowhere to sit is not one: the room is full)
    first ??= d;
  }
  if (first) L.top(first, 'printer', { at: 'left' });
  any(() => L.wall('filing_cabinet', 'any', { at: 'corner', prio: 2 }));
  D(L, 'schedule', 'any'); art(L, E, 'notice', 'any'); L.hang('clock_wall', 'any', {});
  ceilingFixture(L, E, hh, 'tube');
  schoolFill(L, E, 6);
}

/** The music room (Sala de música): the board on the front wall, rows of chairs facing it, the teacher's stool beside it, the shelf of instruments with a boombox on it, guitars and a speaker against the walls, the music posters. */
export function musicRoom(L, E, hh) {
  const rng = L.rng, { bw, wi } = classBoard(L), depth = wi.ax === 'x' ? L.D : L.W, ry = wi.ry + PI, seat = rng.chance(0.5) ? 'chair_plastic' : 'chair_wood';
  any(() => L.at('stool_wood', ...wallPoint(L.r, bw, wi.hi - 0.7, 0.8), wi.ry, { prio: 2 }));                      // the teacher sits beside the board, facing the class
  for (let t = 1.7, row = 0; t < depth - 0.9 && row < 3; t += 0.8, row++) for (let u = wi.lo + 0.7, k = 0; u < wi.hi - 0.6 && k < 6; u += 0.7, k++) {
    const [x, z] = wallPoint(L.r, bw, u, t);
    L.at(seat, x, z, ry, { prio: 1 });
  }
  const cub = any(() => L.wall('cubby_shelf', 'any', { prio: 1, awayDoors: true }), () => L.wall('bookshelf_low', 'any', { prio: 1 }));
  if (cub) L.top(cub, 'radio_boombox', { at: 'center' });
  any(() => L.wall('bookshelf', 'any', { prio: 2, awayDoors: true }));
  for (let k = 0; k < 2; k++) L.wall('guitar_lean', 'any', { at: 'corner', prio: 2 });
  L.wall('speaker', 'any', { at: 'corner', prio: 2 });
  art(L, E, 'music', 'any'); art(L, E, 'music', 'any'); D(L, 'schedule', 'any'); art(L, E, 'kids', 'any'); L.hang('clock_wall', 'any', {});
  ceilingFixture(L, E, hh, 'tube');
  schoolFill(L, E, 6);
}

/** The entrance hall (Vestíbulo, Zaguán, Pasillo) and the galleries round the yard: a bench, the children's coat hooks and bags, the flag, the timetable, notices and drawings. */
export function schoolHall(L, E, hh) {
  L.circulation = true;
  const t = L.room.type, area = L.W * L.D, gallery = t === 'corridor';
  const exterior = L.landings.some((l) => (E.bp.doors ?? []).find((d) => d.id === l.door)?.kind === 'exterior');
  if (exterior) any(() => L.wall('doormat', 'any', { prio: 2 }));
  if (area >= 6) for (let k = 0; k < (area >= 16 ? 2 : 1); k++) any(() => L.wall('bench_wood', 'any', { prio: 1, awayDoors: true }));
  if (!gallery && area >= 12) any(() => L.wall('trophy_case', 'any', { prio: 1, awayDoors: true }));
  L.hang('coat_rack_wall', 'any', { y: 1.2 });
  L.free('school_bag', { rad: 3, prio: 2 });
  any(() => L.wall('water_stand', 'any', { at: 'corner', prio: 2 }));
  if (area >= 8) any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (!gallery) D(L, 'flag_co', 'any', { y: 1.8 });
  D(L, 'schedule', 'any'); art(L, E, 'notice', 'any'); art(L, E, 'kids', 'any'); if (!gallery) art(L, E, ['photo_grad', 'diploma'], 'any');
  L.hang('clock_wall', 'any', {});
  if (L.rng.chance(0.4)) art(L, E, 'faithPic', 'any');
  centreLight(L, area > 14 ? 'tube' : 'bulb', area > 14 ? TUBE_WARM : 0xffd9a0, 6, 7);
  schoolFill(L, E, 4);
}

/** The yard: benches, plants, a football, the water jug, the flag and the children's drawings; a trough to wash at, but no washing line, machine or canary. */
export function schoolyard(L, E, hh) {
  const rng = L.rng, area = L.W * L.D;
  L.circulation = false;
  any(() => L.wall('lavadero', 'any', { at: 'corner', prio: 1 }));
  for (let k = 0; k < Math.min(5, 2 + Math.floor(area / 8)); k++) L.wall(rng.pick(['plant_bucket', 'plant_pot_clay', 'plant_big', 'plant_pot_clay']), 'any', { prio: 2, jitter: 1 });
  for (let k = 0; k < (area > 30 ? 3 : 2); k++) L.wall('bench_wood', 'any', { prio: 2, jitter: 1 });
  L.free('football', { rad: 4, prio: 2 }); L.wall('water_stand', 'any', { prio: 2, at: 'corner' });
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 }); L.wall('broom', 'any', { at: 'corner', prio: 2 });
  D(L, 'flag_co', 'any', { y: 1.9 }); art(L, E, 'kids', 'any');
}
void mkObb;

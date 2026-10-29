// Per-room-type furnishers for homes. Each takes (L: Layout, E: env, hh: household) and places items through the Layout API.
// Real-world logic: bed head to the wall with access on a side, sofa facing the TV, counter run on the longest free wall,
// stove beside a gas cylinder, toilet/shower/basin with front clearance, chairs tucked around tables, decor hung clear of doors/windows.
import { CATALOG } from './catalog.js';
import { opposite, wallInfo, wallPoint } from './layout.js';
import { decalDef } from './decals.js';

const PI = Math.PI;
/** Hang a decal by id. */
export const D = (L, id, walls, o = {}) => L.hang('decal:' + id, walls ?? 'any', { def: decalDef(id), ...o });
const any = (...fns) => { for (const f of fns) { const r = f(); if (r) return r; } return null; };
const floorArea = (L) => L.W * L.D;
const nm = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];

/** Chairs tucked around a table (n of them, as many as fit). */
export function chairsAround(L, table, n, names, o = {}) {
  if (!table) return [];
  const rng = L.rng, out = [];
  const hw = table.c.size[0] / 2, hd = table.c.size[2] / 2;
  const sides = [];
  const longX = hw >= hd;
  const cnt = (len) => Math.max(1, Math.min(3, Math.floor(len / 0.55)));
  const mk = (lx0, lz0, dx, dz, k, dry, gapAxis) => {
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0 : (i / (k - 1) - 0.5) * (k - 1) * 0.55;
      sides.push({ lx: lx0 + dx * t, lz: lz0 + dz * t, dry, axis: gapAxis });
    }
  };
  const c0 = CATALOG[names[0]], cd = c0.size[2] / 2 + (o.gap ?? 0.03);
  mk(0, hd + cd, 1, 0, cnt(hw * 2), PI, 'z');      // +z side faces -z
  mk(0, -hd - cd, 1, 0, cnt(hw * 2), 0, 'z');
  mk(hw + cd, 0, 0, 1, longX ? 1 : cnt(hd * 2), -PI / 2, 'x');
  mk(-hw - cd, 0, 0, 1, longX ? 1 : cnt(hd * 2), PI / 2, 'x');
  // balance: interleave long sides first
  const order = sides.map((s, i) => ({ s, k: (longX ? (s.axis === 'z' ? 0 : 1) : (s.axis === 'x' ? 0 : 1)) * 10 + (i % 3) + rng.next() * 0.3 })).sort((a, b) => a.k - b.k).map((x) => x.s);
  for (const s of order) {
    if (out.length >= n) break;
    const it = L.atRel(nm(names, rng), table, s.lx, s.lz, s.dry, { prio: 2 });
    if (it) out.push(it);
  }
  return out;
}

/** Ceiling fixture of a room (bulb / tube / fan). Records L.fixture for the light + mesh stage. */
function ceilingFixture(L, E, hh, kind) {
  if (L.room.outdoor) return;
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  const area = floorArea(L), t = L.room.type;
  const wantFan = !L.circulation && area >= 7 && (t === 'living' || t === 'bedroom' || t === 'dining' || t === 'classroom' || t === 'shop' || t === 'office')
    && L.rng.chance(hh && hh.income ? 0.8 : 0.5);
  const tube = kind === 'tube';
  if (wantFan) {
    L.ceil('fan_ceiling', cx, cz, { ry: L.rng.range(0, PI) });
    L.fixture = { x: cx, z: cz, kind: 'fan', color: 0xffe2b0, i: 6.5, d: 6.5 };
  } else if (tube) {
    L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
    L.fixture = { x: cx, z: cz, kind: 'tube', color: 0xeaf2ff, i: 9, d: 7.5 };
  } else {
    L.ceil('bulb_bare', cx, cz);
    L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 6, d: 6.5 };
  }
}

// ---------------------------------------------------------------- decoration helpers
function frames(L, E, hh, n, ids) {
  let k = 0;
  for (const id of ids) { if (k >= n) break; if (D(L, id, 'any')) k++; }
  return k;
}
function religiousWall(L, E, hh, over) {
  const pic = L.rng.chance(0.5) ? 'picture_virgin' : 'picture_heart';
  const p = D(L, pic, over ? over.wallSide : 'any', over ? { over, y: Math.max(1.5, over.h + 0.1) } : {});
  if (!p) return null;
  if (L.rng.chance(0.55)) L.hang('crucifix_wall', p.wallSide, { near: [p.x, p.z], nearW: 4, y: 1.9 });
  return p;
}
/** Extra things so that no room is bare: tops, plants, clutter, wall decor (until `min` items). */
export function fillMin(L, E, hh, min = 4) {
  const rng = L.rng, deco = () => L.items.filter((i) => !i.ceil || i.name === 'fan_ceiling' || i.name === 'plant_hanging').length;
  const tries = [
    () => D(L, nm(['picture_landscape', 'picture_flowers', 'picture_coast'], rng), 'any'),
    () => L.hang('clock_wall', 'any', {}),
    () => D(L, nm(['photo_family_a', 'photo_family_b'], rng), 'any'),
    () => D(L, nm(['calendar_pharma', 'calendar_church', 'calendar_tienda'], rng), 'any'),
    () => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }),
    () => L.wall('box_cardboard_m', 'any', { at: 'corner', prio: 2 }),
    () => L.hang('mirror_wall', 'any', {}),
    () => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }),
    () => L.free('shoes_pair', { rad: 3, prio: 2 }),
    () => L.hang('shelf_wall', 'any', {}),
  ];
  for (let g = 0; g < 14 && deco() < min; g++) tries[g % tries.length]();
}

// ---------------------------------------------------------------- LIVING
export function living(L, E, hh) {
  const rng = L.rng, area = floorArea(L), small = area < 9.5;
  const walls = L.wallsByFree();
  const tvWall = walls[0].wall;
  const stand = any(() => L.wall('tv_stand', tvWall, { at: 'center', prio: 0 }), () => L.wall('tv_stand', 'any', { at: 'center', prio: 0 }), () => L.wall('dresser_low', 'any', { prio: 0 }));
  let tv = null;
  if (stand) tv = L.top(stand, hh.tvBig ? 'tv_flat' : hh.income ? 'tv_flat' : 'tv_crt', { at: 'center' });
  const sofaNames = (small ? ['sofa_2_', 'sofa_3_'] : ['sofa_3_', 'sofa_2_']).flatMap((p) => [p + (hh.vinyl ? 'vinyl' : 'fabric')]);
  const sofaWall = stand ? opposite(stand.wallSide) : 'any';
  const sofa = any(...sofaNames.map((n) => () => L.wall(n, sofaWall, { at: 'center', prio: 0 })), ...sofaNames.map((n) => () => L.wall(n, 'any', { far: stand ?? [L.r.x0, L.r.z0], prio: 0 })));
  let coffee = null;
  if (sofa && area >= 8) coffee = L.at('coffee_table', ...L.rel(sofa, 0, sofa.d / 2 + 0.45 + 0.275), sofa.ry, { prio: 2 }) ?? L.at('side_table', ...L.rel(sofa, sofa.w / 2 + 0.3, 0.1), sofa.ry, { prio: 2 });
  if (sofa && area >= 12) {
    const an = hh.vinyl ? 'armchair_vinyl' : 'armchair_fabric';
    const side = rng.chance(0.5) ? 1 : -1;
    const adj = ['-z', '+z', '-x', '+x'].filter((w) => w !== sofa.wallSide && w !== opposite(sofa.wallSide));
    any(() => L.wall(an, adj, { near: L.rel(sofa, side * (sofa.w / 2 + 0.5), sofa.d / 2 + 0.3), nearW: 3, prio: 2 }),
      () => L.free(an, { near: coffee ?? sofa, rad: 1.8, face: coffee ?? tv ?? sofa, prio: 2 }));
  }
  if (area >= 10) {
    const unit = hh.income ? any(() => L.wall('wall_unit_big', 'any', { awayDoors: true, prio: 1 }), () => L.wall('wall_unit_small', 'any', { awayDoors: true, prio: 1 })) : any(() => L.wall('display_cabinet', 'any', { prio: 1 }), () => L.wall('dresser_low', 'any', { prio: 1 }));
    if (unit && unit.c.tags.includes('wallunit')) unit.flags = { knick: true };
  } else if (area >= 7) {
    any(() => L.wall('dresser_low', 'any', { prio: 1, awayDoors: true }), () => L.wall('bookshelf_low', 'any', { prio: 1, awayDoors: true }));
  }
  // altar in the corner of a religious home
  let altar = null;
  if (hh.altar && !small) {
    altar = L.wall('altar_home', 'any', { at: 'corner', prio: 1, awayDoors: true });
    if (altar) {
      L.top(altar, 'statue_virgin', { at: 'center' });
      L.top(altar, 'candles_set', { at: 'left' });
      L.top(altar, 'vase_flowers', { at: 'right' });
      altar.flags = { altar: true };
      religiousWall(L, E, hh, altar);
    }
  }
  if (area >= 9) any(() => L.wall('lamp_floor', 'any', { at: 'corner', near: sofa ?? undefined, prio: 2 }));
  if (coffee && area >= 11 && rng.chance(0.7)) L.free(rng.chance(0.5) ? 'rug_big' : 'rug_small', { near: coffee, rad: 0.3, ry: sofa.ry, prio: 2 });
  if (area >= 8) any(() => L.wall(rng.chance(0.5) ? 'plant_big' : 'plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (rng.chance(0.5)) any(() => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }));
  if (hh.pets.includes('dog') && rng.chance(0.7)) L.free('dog_sleeping', { near: sofa ?? undefined, rad: 2.4, prio: 2 });
  if (hh.pets.includes('cat') && rng.chance(0.7)) L.free('cat_sitting', { near: sofa ?? undefined, rad: 2.4, prio: 2 });
  if (hh.pets.includes('canary')) L.hang('cage_canary', 'any', { y: 1.5 });
  // tops: radio / frames
  if (stand) { L.top(stand, 'photo_frames', { at: 'left' }); if (rng.chance(0.5)) L.top(stand, 'radio_old', { at: 'right' }); }
  if (hh.hobby === 'football') L.free('football', { rad: 3, prio: 2 });
  if (hh.hobby === 'music') L.wall('guitar_lean', 'any', { at: 'corner', prio: 2 });
  if (hh.kids) L.free('toy_pile', { rad: 3, near: coffee ?? undefined, prio: 2 });
  // wall decor
  frames(L, E, hh, 2, ['photo_family_a', 'photo_family_b', 'photo_wedding']);
  D(L, rng.pick(['picture_landscape', 'picture_flowers', 'picture_coast']), 'any');
  L.hang('clock_wall', 'any', {});
  if (!altar && hh.religious > 0.3) religiousWall(L, E, hh, null);
  D(L, rng.pick(['calendar_pharma', 'calendar_church', 'calendar_tienda']), 'any');
  if (hh.hobby === 'football' && rng.chance(0.7)) D(L, rng.pick(['poster_football_a', 'poster_football_b', 'poster_football_c']), 'any');
  if (rng.chance(0.4)) D(L, 'blessing', 'any');
  if (rng.chance(0.4)) L.hang('mirror_wall', 'any', {});
  ceilingFixture(L, E, hh, 'bulb');
  if (area > 17) diningSet(L, E, hh, true);
  E.living = { sofa, tv, stand, altar, coffee };
  fillMin(L, E, hh, 7);
}

// ---------------------------------------------------------------- DINING
export function diningSet(L, E, hh, annex) {
  const rng = L.rng, area = floorArea(L), longX = L.W >= L.D;
  const tname = area > 15 || annex ? rng.pick(['table_formica_6', 'table_wood_6']) : area > 9 ? 'table_formica_6' : 'table_formica_4';
  const rys = longX ? [0, PI / 2] : [PI / 2, 0];
  const cx = annex ? (longX ? L.r.x1 - L.W * 0.25 : (L.r.x0 + L.r.x1) / 2) : (L.r.x0 + L.r.x1) / 2, cz = annex ? (longX ? (L.r.z0 + L.r.z1) / 2 : L.r.z1 - L.D * 0.25) : (L.r.z0 + L.r.z1) / 2;
  const table = any(() => L.free(tname, { near: [cx, cz], rad: annex ? 2.0 : 0.9, rys, prio: 0 }), () => L.free('table_formica_4', { near: [cx, cz], rad: 1.4, rys, prio: 0 }), () => L.free('table_round_small', { near: [cx, cz], rad: 1.6, prio: 0 }));
  if (!table) return null;
  const names = hh.plastic ? ['chair_plastic'] : hh.income ? ['chair_wood_padded', 'chair_wood'] : ['chair_wood'];
  chairsAround(L, table, table.w > 1.2 ? 6 : 4, names);
  if (rng.chance(0.6)) L.top(table, 'fruit_bowl', { at: 'center' });
  else L.top(table, 'vase_flowers', { at: 'center' });
  return table;
}
export function dining(L, E, hh) {
  const rng = L.rng;
  const table = diningSet(L, E, hh, false);
  any(() => L.wall(rng.chance(0.5) ? 'display_cabinet' : 'dresser_low', 'any', { prio: 1, awayDoors: true }));
  const side = L.find('dresser_low') ?? L.find('display_cabinet');
  if (side && side.c.size[1] < 1.2) { L.top(side, 'knickknacks', { at: 'center' }); L.top(side, 'photo_frames', { at: 'left' }); }
  D(L, rng.pick(['picture_landscape', 'picture_flowers', 'picture_coast']), 'any');
  L.hang('clock_wall', 'any', {});
  D(L, rng.pick(['calendar_pharma', 'calendar_church']), 'any');
  if (hh.religious > 0.4) D(L, 'blessing', 'any');
  any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (L.W * L.D > 9) any(() => L.wall('fridge_small', 'any', { prio: 2 }));
  ceilingFixture(L, E, hh, 'bulb');
  void table;
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- KITCHEN
export function kitchen(L, E, hh) {
  const rng = L.rng, area = floorArea(L);
  const walls = L.wallsByFree();
  let run = [];
  for (const w of walls.slice(0, 2)) {
    const st = L.freeStretches(w.wall, 0.5)[0]; const len = st ? st.hi - st.lo : 0;
    let seq;
    if (len >= 4.4) seq = rng.pick([['fridge', 'counter_base', 'stove_gas', 'counter_base', 'sink_kitchen', 'counter_base'], ['counter_base', 'sink_kitchen', 'counter_base', 'stove_gas', 'counter_base', 'fridge']]);
    else if (len >= 3.4) seq = rng.pick([['fridge', 'counter_base', 'stove_gas', 'sink_kitchen'], ['sink_kitchen', 'counter_base', 'stove_gas', 'fridge']]);
    else if (len >= 2.5) seq = rng.pick([['stove_gas', 'counter_base', 'sink_kitchen'], ['sink_kitchen', 'stove_gas', 'counter_base']]);
    else if (len >= 1.75) seq = ['stove_gas', 'sink_kitchen'];
    else if (len >= 0.8) seq = ['stove_gas'];
    else continue;
    run = L.run(w.wall, seq, { fromEnd: rng.chance(0.5), prio: 0, skipMissing: true });
    if (run.length >= 2) break;
    for (const it of run) L.remove(it);
    run = [];
  }
  if (!run.length) {
    const st = any(() => L.wall('stove_gas', 'any', { prio: 0 }), () => null); run = st ? [st] : [];
    any(() => L.wall('sink_kitchen', 'any', { prio: 0 }), () => L.wall('counter_base', 'any', { prio: 0 }));
  }
  const stove = L.find('stove_gas'), sink = L.find('sink_kitchen');
  // second run (L-shape) on a free adjacent wall when there is room
  if (area >= 7) {
    const used = run[0]?.wallSide;
    const adj = used ? ['-z', '+z', '-x', '+x'].filter((w) => w !== used && w !== opposite(used)) : [];
    for (const w of adj) {
      const extra = L.run(w, [!L.find('fridge') && area >= 8 ? 'fridge' : 'counter_base', 'counter_base', 'counter_base'], { fromEnd: rng.chance(0.5), prio: 1, skipMissing: true });
      if (extra.length) break;
    }
  }
  // gas cylinder beside the stove
  if (stove) any(() => L.wall('gas_cylinder', stove.wallSide ?? 'any', { near: stove, nearW: 6, at: 'corner', prio: 1 }), () => L.wall('gas_cylinder', 'any', { near: stove, nearW: 6, prio: 1 }));
  // things on the stove / counters
  if (stove) { L.top(stove, 'pot_stack', { at: 'left' }); if (rng.chance(0.6)) L.top(stove, 'kettle', { at: 'right' }); }
  const counters = L.items.filter((i) => i.name === 'counter_base' || i.name === 'counter_base_long');
  if (sink) L.top(sink, 'dish_rack', { at: 'left' });
  if (counters[0]) L.top(counters[0], rng.chance(0.5) ? 'thermos_set' : 'fruit_bowl', { at: 'center' });
  if (counters[1]) L.top(counters[1], rng.chance(0.5) ? 'bread_basket' : 'knickknacks', { at: 'center' });
  const fr = L.find('fridge'); if (fr) { /* magnets live on the stand-in */ fr.flags = { magnets: true }; }
  // upper cabinets over the counters, pot rack over the stove
  for (const it of [...counters, sink].filter(Boolean)) L.hang('kitchen_upper', it.wallSide ?? 'any', { over: it, y: 1.45, deepOver: false });
  if (stove && rng.chance(0.7)) L.hang('pot_rack_wall', stove.wallSide ?? 'any', { over: stove, y: 1.5 });
  // table with seats
  if (area >= 9) {
    const t = any(() => L.free('table_formica_4', { near: [(L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2], rad: 1.3, rys: L.W >= L.D ? [0, PI / 2] : [PI / 2, 0], prio: 1 }));
    if (t) { chairsAround(L, t, 4, hh.plastic ? ['chair_plastic'] : ['chair_wood', 'stool_wood']); L.top(t, rng.chance(0.5) ? 'fruit_bowl' : 'thermos_set', { at: 'center' }); }
  } else if (area >= 5.5) {
    const s = any(() => L.wall('table_formica_4', 'any', { prio: 2, awayDoors: true }), () => L.wall('side_table', 'any', { prio: 2 }));
    if (s) chairsAround(L, s, 2, ['stool_wood', 'chair_plastic']);
  }
  any(() => L.wall('water_stand', 'any', { at: 'corner', prio: 2 }), () => L.wall('bucket_big', 'any', { at: 'corner', prio: 2 }));
  if (hh.income) any(() => L.wall('washing_machine', 'any', { at: 'corner', prio: 2 }));
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  if (hh.pets.includes('cat') && rng.chance(0.6)) L.free('cat_sitting', { rad: 3, prio: 2 });
  D(L, rng.pick(['calendar_pharma', 'calendar_tienda', 'chores']), 'any');
  L.hang('clock_wall', 'any', {});
  if (rng.chance(0.5)) L.hang('shelf_wall', 'any', { y: 1.55 });
  if (rng.chance(0.5)) D(L, 'blessing', 'any');
  ceilingFixture(L, E, hh, 'tube');
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- BEDROOM
function bedroomRole(E, hh) {
  const st = E.state(hh), i = st.beds++;
  switch (hh.kind) {
    case 'elder': return i === 0 ? 'elder' : i === 1 ? 'guest' : 'storage';
    case 'couple': return i === 0 ? 'master' : i === 1 ? 'study' : 'guest';
    case 'students': return 'student';
    default:
      if (i === 0) return 'master';
      if (hh.kids >= 1 && i === 1) return hh.kids >= 2 ? 'kids' : 'child';
      if (hh.teen && i === 2) return 'teen';
      return i % 2 ? 'guest' : 'kids';
  }
}
function placeBed(L, E, hh, names, o = {}) {
  const rng = L.rng;
  for (const n of names) {
    const b = any(
      () => L.wall(n, 'any', { at: o.at ?? 'center', sideNeed: o.sideNeed ?? 0.45, awayDoors: true, prio: 0 }),
      () => L.wall(n, 'any', { sideNeed: 0.3, awayDoors: true, prio: 0 }),
      () => L.wall(n, 'any', { prio: 0 }));
    if (b) { b.flags = { unmade: rng.chance(1 - hh.tidy) }; return b; }
  }
  return null;
}
export function bedroom(L, E, hh) {
  const rng = L.rng, area = floorArea(L), role = E.roleOverride ?? bedroomRole(E, hh);
  E.lastRole = role; L.role = role;
  const tiny = area < 5.5;
  let beds = [];
  const single = hh.income ? ['bed_single'] : ['bed_single_metal', 'bed_single'];
  switch (role) {
    case 'master': beds = [placeBed(L, E, hh, tiny ? single : hh.income ? ['bed_double_wood', 'bed_double'] : ['bed_double', 'bed_double_wood'] )]; break;
    case 'elder': beds = [placeBed(L, E, hh, rng.chance(0.5) ? ['bed_single_metal', 'bed_single'] : ['bed_double', 'bed_single'])]; break;
    case 'kids': beds = area >= 8 ? [placeBed(L, E, hh, ['bed_bunk', 'bed_single'])] : [placeBed(L, E, hh, ['bed_bunk', 'bed_single'])]; break;
    case 'student': {
      const a = placeBed(L, E, hh, ['bed_single_metal', 'bed_single']); beds = [a];
      if (area >= 8 && rng.chance(0.7)) beds.push(placeBed(L, E, hh, ['bed_single', 'mattress_floor'], { sideNeed: 0.2 }));
      break;
    }
    case 'study': beds = []; break;
    case 'storage': beds = [placeBed(L, E, hh, ['mattress_floor'])]; break;
    default: beds = [placeBed(L, E, hh, single)];
  }
  beds = beds.filter(Boolean);
  const bed = beds[0];
  // nightstands, lamp, crib
  if (bed && area >= 6) {
    const ns = hh.income ? 'nightstand_b' : 'nightstand_a';
    const ln = L.atRel(ns, bed, -(bed.w / 2 + 0.22), -(bed.d / 2) + 0.2, 0, { prio: 2 });
    const rn = bed.w > 1.2 ? L.atRel(ns, bed, bed.w / 2 + 0.22, -(bed.d / 2) + 0.2, 0, { prio: 2 }) : null;
    for (const n of [ln, rn].filter(Boolean)) { if (rng.chance(0.7)) L.top(n, 'lamp_table', { at: 'center' }); else L.top(n, 'photo_frames', { at: 'center' }); }
    if (ln && !L.items.some((i) => i.parent === ln)) L.top(ln, 'radio_old', { at: 'center' });
  }
  if ((role === 'master') && hh.babies) any(() => L.wall('bed_crib', 'any', { prio: 1, awayDoors: true }));
  // storage
  if (area >= 6.5 || role === 'student') {
    const wn = area >= 10 && role === 'master' ? 'wardrobe_3' : 'wardrobe_2';
    any(() => L.wall(wn, 'any', { at: 'corner', prio: 1, awayDoors: true }), () => L.wall('wardrobe_2', 'any', { prio: 1, awayDoors: true }), () => L.wall('wardrobe_metal', 'any', { prio: 1 }));
  }
  if (area >= 8.5) any(() => L.wall('dresser_4', 'any', { prio: 2, awayDoors: true }));
  // study corner
  if (role === 'teen' || role === 'student' || role === 'study' || role === 'child') {
    const desk = any(() => L.wall(role === 'study' ? 'desk_wood' : 'desk_student', 'any', { at: 'window', prio: 1, awayDoors: true }), () => L.wall('desk_student', 'any', { prio: 1 }));
    if (desk) {
      const ch = L.at(hh.plastic ? 'chair_plastic' : 'chair_wood', ...L.rel(desk, 0, desk.d / 2 + 0.3), desk.ry + PI, { prio: 2 }) ?? L.free('chair_wood', { near: L.rel(desk, 0, desk.d / 2 + 0.3), rad: 0.5, prio: 2 });
      if (ch) ch.flags = { pulled: true };
      L.top(desk, role === 'student' ? 'pc_set' : 'books_stack', { at: 'left' });
      if (role !== 'student') L.top(desk, 'lamp_table', { at: 'right' });
      D(L, 'exam_notes', desk.wallSide, { near: [desk.x, desk.z], nearW: 3, y: 1.15, jitter: 0.1 });
      desk.flags = { study: true };
    }
    if (area >= 8) L.wall('bookshelf', 'any', { prio: 2 });
  }
  if (role === 'kids' || role === 'child') { L.free('toy_pile', { rad: 3, prio: 2 }); if (rng.chance(0.7)) L.free('school_bag', { rad: 3, prio: 2 }); D(L, rng.pick(['kids_drawing_a', 'kids_drawing_b']), 'any'); if (rng.chance(0.6)) D(L, rng.pick(['kids_drawing_a', 'kids_drawing_b']), 'any'); }
  if (role === 'teen' || role === 'student') { if (hh.hobby === 'football' || rng.chance(0.4)) D(L, rng.pick(['poster_football_a', 'poster_football_b', 'poster_football_c']), 'any'); else D(L, 'poster_music', 'any'); if (hh.hobby === 'music') L.wall('guitar_lean', 'any', { at: 'corner', prio: 2 }); }
  if (role === 'elder' && hh.altar) {
    const altar = L.wall('altar_home', 'any', { at: 'corner', prio: 1 });
    if (altar) { L.top(altar, 'statue_virgin', { at: 'center' }); L.top(altar, 'candles_set', { at: 'left' }); altar.flags = { altar: true }; religiousWall(L, E, hh, altar); }
    L.free('rocking_chair', { rad: 2.5, prio: 2 });
  }
  // rug beside the bed
  if (bed && area >= 9 && rng.chance(0.6)) L.free('rug_small', { near: L.rel(bed, bed.w / 2 + 0.5, bed.d / 4), rad: 0.4, ry: bed.ry, prio: 2 });
  // wall decor
  if (bed) {
    if (hh.religious > 0.35) L.hang('crucifix_wall', bed.wallSide, { over: bed, y: 1.75 });
    else if (rng.chance(0.6)) D(L, rng.pick(['picture_landscape', 'picture_flowers']), bed.wallSide, { over: bed, y: 1.4 });
  }
  if (rng.chance(0.6)) frames(L, E, hh, 1, ['photo_family_a', 'photo_family_b', 'photo_grad']);
  if (rng.chance(0.5)) L.hang('mirror_wall', 'any', {});
  if (role !== 'storage') L.hang('clock_wall', 'any', {});
  L.free('shoes_pair', { rad: 3, prio: 2 });
  if (rng.chance(0.4)) any(() => L.wall('chest_trunk', 'any', { prio: 2 }));
  ceilingFixture(L, E, hh, 'bulb');
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- BATHROOM
export function bathroom(L, E, hh) {
  const rng = L.rng;
  const shower = any(() => L.wall('shower_tray', 'any', { at: 'corner', awayDoors: true, prio: 0 }), () => L.wall('shower_tray', 'any', { prio: 0 }));
  const toilet = any(() => L.wall('toilet', shower ? [opposite(shower.wallSide), ...['-z', '+z', '-x', '+x'].filter((w) => w !== shower.wallSide && w !== opposite(shower.wallSide))] : 'any', { at: 'center', prio: 0, awayDoors: true }), () => L.wall('toilet', 'any', { prio: 0 }));
  const basin = any(() => L.wall(hh.income ? 'basin_vanity' : 'basin_pedestal', 'any', { prio: 0, near: toilet ?? undefined, nearW: 0.6 }), () => L.wall('basin_pedestal', 'any', { prio: 0 }));
  if (shower) L.hang('shower_head_electric', shower.wallSide, { near: [shower.x, shower.z], nearW: 8, y: 1.9, w: 0.2, h: 0.25 });
  if (basin) L.hang('mirror_bath', basin.wallSide, { over: basin, y: 1.25 });
  if (basin) L.hang('towel_rail', 'any', { near: [basin.x, basin.z], nearW: 1, y: 1.15 });
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  if (!hh.income) any(() => L.wall('bucket_big', 'any', { at: 'corner', prio: 2 }));
  L.hang('shelf_wall', 'any', { y: 1.5, w: 0.5 });
  ceilingFixture(L, E, hh, 'bulb');
  fillMin(L, E, hh, 5);
}

// ---------------------------------------------------------------- CIRCULATION (hall, corridor, entry, stairwell, landing)
/** A strip too narrow to stand furniture in (< 0.9 m): wall-hung things only, so it still reads as a kitchen / stockroom / bath. */
export function thin(L, E, hh) {
  const t = L.room.type, cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.circulation = true;
  const long = L.W >= L.D ? ['-z', '+z'] : ['-x', '+x'];
  const hangs = t === 'kitchen' ? ['kitchen_upper', 'kitchen_upper', 'pot_rack_wall', 'shelf_wall', 'clock_wall']
    : t === 'bathroom' ? ['mirror_bath', 'towel_rail', 'shelf_wall']
      : t === 'backroom' || t === 'office' ? ['shelf_wall', 'shelf_wall', 'tool_pegboard', 'clock_wall']
        : ['shelf_wall', 'coat_rack_wall', 'clock_wall', 'mirror_wall'];
  for (const n of hangs) { L.hang(n, long, {}) || L.hang(n, 'any', {}); }
  for (const n of hangs.slice(0, 2)) L.hang(n, 'any', { y: (CATALOG[n]?.y ?? 1.4) - 0.5 });      // a second row where the wall is long enough
  if (t === 'kitchen') D(L, 'calendar_tienda', 'any'); else D(L, 'blessing', 'any');
  D(L, 'notice_rent', 'any'); D(L, 'calendar_pharma', 'any');
  if (!L.room.outdoor) { L.ceil('bulb_bare', cx, cz); L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 5, d: 5 }; }
}

/** Rooms A2 keeps empty (stair cores): a bulb, a notice or two, nothing on the floor. */
export function lightOnly(L, E, hh) {
  L.circulation = true;
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  if (!L.room.outdoor) { L.ceil('bulb_bare', cx, cz); L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 5.5, d: 6 }; }
  D(L, 'notice_rent', 'any'); if (L.rng.chance(0.6)) D(L, 'picture_virgin', 'any'); if (L.rng.chance(0.4)) D(L, 'poster_football_a', 'any');
}

export function circulation(L, E, hh) {
  L.circulation = true;
  const rng = L.rng, t = L.room.type, area = floorArea(L);
  const exterior = L.landings.some((l) => (E.bp.doors ?? []).find((d) => d.id === l.door)?.kind === 'exterior');
  if (t === 'stairwell' || t === 'landing') {
    if (rng.chance(0.6)) D(L, rng.pick(['picture_virgin', 'picture_landscape', 'notice_rent', 'calendar_church']), 'any');
    L.hang('clock_wall', 'any', {});
    if (area > 3) any(() => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }));
    ceilingFixture(L, E, hh, rng.chance(0.5) ? 'tube' : 'bulb');
    return;
  }
  if (area >= 3) {
    any(() => L.wall('shoe_rack', 'any', { at: 'awayDoor', prio: 2 }), () => L.wall('shoe_rack', 'any', { prio: 2 }));
    if (exterior || rng.chance(0.5)) any(() => L.wall('doormat', 'any', { prio: 2 }), () => null);
  }
  L.hang('coat_rack_wall', 'any', { y: 1.55 });
  if (rng.chance(0.7)) L.hang('mirror_wall', 'any', {});
  if (hh.religious > 0.3) D(L, rng.chance(0.5) ? 'blessing' : 'picture_virgin', 'any');
  D(L, rng.pick(['picture_landscape', 'photo_family_a', 'calendar_tienda']), 'any');
  if (area >= 4) any(() => L.wall(rng.chance(0.5) ? 'plant_pot_clay' : 'side_table', 'any', { at: 'corner', prio: 2 }));
  if (hh.kids && exterior) L.free('school_bag', { rad: 3, prio: 2 });
  L.free('shoes_pair', { rad: 3, prio: 2 });
  ceilingFixture(L, E, hh, 'bulb');
  fillMin(L, E, hh, 4);
}

// ---------------------------------------------------------------- OUTDOOR (patio, terrace, balcony)
export function outdoor(L, E, hh) {
  const rng = L.rng, t = L.room.type, area = floorArea(L);
  L.circulation = false;
  if (t === 'patio') {
    any(() => L.wall('lavadero', 'any', { at: 'corner', prio: 1 }));
    if (hh.income) any(() => L.wall('washing_machine', 'any', { prio: 2 }));
    for (let k = 0; k < Math.min(5, 2 + Math.floor(area / 6)); k++) {
      L.wall(rng.pick(['plant_bucket', 'plant_pot_clay', 'plant_big', 'plant_pot_clay']), 'any', { prio: 2, jitter: 1 });
    }
    if (area >= 6) { const tb = any(() => L.free('table_plastic', { rad: Math.max(L.W, L.D) / 2, prio: 2 })); if (tb) chairsAround(L, tb, 3, ['chair_plastic', 'chair_wood']); }
    L.hang('clothesline', 'any', { y: 1.45, w: Math.max(1.4, Math.min(L.W, L.D) - 0.5), def: { ...CATALOG.clothesline, size: [Math.max(1.4, Math.min(L.W, L.D) - 0.5), 0.55, 0.05] } });
    if (hh.pets.includes('canary') || rng.chance(0.3)) L.hang('cage_canary', 'any', { y: 1.6 });
    L.wall('drying_rack', 'any', { prio: 2 });
    L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
    L.wall('broom', 'any', { at: 'corner', prio: 2 });
    if (hh.pets.includes('dog')) L.free('dog_sleeping', { rad: 3, prio: 2 });
    if (hh.pets.includes('cat')) L.free('cat_sitting', { rad: 3, prio: 2 });
  } else if (t === 'terrace') {
    if (hh.hobby === 'pigeons' || rng.chance(0.22)) { const loft = any(() => L.wall('pigeon_loft', 'any', { at: 'corner', prio: 1 })); if (loft) loft.flags = { loft: true }; }
    L.hang('clothesline', 'any', { y: 1.45, w: Math.max(1.6, Math.min(L.W, L.D) - 0.6), def: { ...CATALOG.clothesline, size: [Math.max(1.6, Math.min(L.W, L.D) - 0.6), 0.55, 0.05] } });
    if (area > 12) L.hang('clothesline', 'any', { y: 1.4, w: 2.0, def: { ...CATALOG.clothesline, size: [2.0, 0.55, 0.05] } });
    const tb = any(() => L.free('table_plastic', { rad: 3, prio: 2 })); if (tb) chairsAround(L, tb, 3, ['chair_plastic']);
    for (let k = 0; k < 3; k++) L.wall(rng.pick(['plant_bucket', 'plant_pot_clay', 'plant_tin']), 'any', { prio: 2, jitter: 1 });
    L.wall('drying_rack', 'any', { prio: 2 }); L.wall('bucket_big', 'any', { prio: 2 });
    if (rng.chance(0.4)) L.wall('water_tank_small', 'any', { at: 'corner', prio: 2 });
  } else {                                                // balcony
    const tb = any(() => L.free('side_table', { prio: 2 })); if (tb) chairsAround(L, tb, 2, ['chair_plastic']);
    for (let k = 0; k < 2; k++) L.wall(rng.pick(['plant_bucket', 'plant_pot_clay']), 'any', { prio: 2, jitter: 1 });
    if (rng.chance(0.5)) L.wall('drying_rack', 'any', { prio: 2 });
    if (rng.chance(0.4)) L.hang('cage_canary', 'any', { y: 1.6 });
  }
  fillMin(L, E, hh, 4);
}

// ---------------------------------------------------------------- LAUNDRY / BACKROOM / OFFICE / GARAGE
export function laundry(L, E, hh) {
  any(() => L.wall('washing_machine', 'any', { at: 'corner', prio: 1 }));
  any(() => L.wall('lavadero', 'any', { prio: 1 }));
  L.wall('drying_rack', 'any', { prio: 2 }); L.free('laundry_basket', { rad: 3, prio: 2 });
  L.free('ironing_board', { rad: 3, prio: 2, rys: [0, PI / 2] });
  L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
  L.hang('shelf_wall', 'any', { y: 1.5 });
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}
export function office(L, E, hh) {
  const d = any(() => L.wall('desk_office', 'any', { at: 'window', prio: 0 }), () => L.wall('desk_wood', 'any', { prio: 0 }));
  if (d) { L.top(d, 'pc_set', { at: 'left' }); L.top(d, 'phone_landline', { at: 'right' }); L.at('office_chair', ...L.rel(d, 0, d.d / 2 + 0.4), d.ry + PI, { prio: 2 }); }
  L.wall('filing_cabinet', 'any', { at: 'corner', prio: 1 }); L.wall('bookshelf', 'any', { prio: 1 });
  chairsAround(L, d, 0, ['chair_wood']);
  const vis = any(() => L.free('chair_plastic', { rad: 2.6, prio: 2 })); void vis;
  L.free('trash_bin', { rad: 3, prio: 2 });
  D(L, 'diploma', 'any'); D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 6);
}
export function garage(L, E, hh) {
  const rng = L.rng;
  if (rng.chance(0.7)) L.wall('motorbike', 'any', { prio: 1 });
  L.wall('tire_stack', 'any', { at: 'corner', prio: 2 }); L.wall('workbench', 'any', { prio: 1 });
  L.wall('oil_drum', 'any', { at: 'corner', prio: 2 }); L.wall('parts_shelf', 'any', { prio: 2 }); L.wall('bucket_big', 'any', { prio: 2 });
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}
export function backroom(L, E, hh) {
  const rng = L.rng;
  L.wall('shelf_tienda', 'any', { prio: 1 }); L.wall('shelf_tienda', 'any', { prio: 2 });
  for (let k = 0; k < 3; k++) L.wall(rng.pick(['box_cardboard_l', 'box_cardboard_m', 'crate_stack_veg']), 'any', { prio: 2, jitter: 1 });
  L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
  L.wall('broom', 'any', { at: 'corner', prio: 2 });
  if (rng.chance(0.6)) L.wall('chair_plastic', 'any', { prio: 2 });
  if (rng.chance(0.4)) L.wall('fridge', 'any', { prio: 2 });
  D(L, 'calendar_tienda', 'any'); L.hang('clock_wall', 'any', {});
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}

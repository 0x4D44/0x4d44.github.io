// Round-6 fit-out (R4-304, R4-305, R4-307, R4-312): a table has a chair drawn up to it, a barber's chairs stand a barber's width apart each before its own mirror, nothing tall hides the board of a
// classroom, and the workshop whose name says welding is fitted for welding (a metal bench, two gas bottles, bar stock, its own sign and price list), not for motorbikes.
// Before round 6: 45 of the 144 tables of the barrio had no chair (25 dining rooms, a 6-seat table in L08's living room), L05's barber chairs stood 5 cm apart, a pair of lockers stood in front of
// the chalkboard of L00.f0.r4, and 'Taller de Soldadura El Chispa' had two motorbikes, a stack of tyres and a sign that read TALLER DE MOTOS.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-fitout.test.mjs
//   A3_SABOTAGE=bare|crowd|board|motorbike|noseat   corrupts the furnished plan on purpose, so the matching test must FAIL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { Layout } from '../js/interiors/layout.js';
import { layoutOf } from '../js/interiors/carcass.js';
import { standSpots } from '../js/interiors/reach.js';
import { seatOffsets, seatZoff } from '../js/interiors/catalog.js';
import { isChildRoom } from '../js/interiors/garments.js';
import { makeRng } from '../js/core/rng.js';
import * as ROOMS from '../js/interiors/rooms.js';

const SAB = process.env.A3_SABOTAGE;
const { bps } = await furnishedBatch({ real: true });
const EATING = /^table_(formica_4|formica_6|wood_6|round_small)$/, SITS = new Set(['chair', 'stool', 'bench']);
const floorOf = (bp, rid) => bp.furniture.filter((f) => f.room === rid && f.kind === 'floor' && !f.parent);
const span = (f) => { const c = Math.abs(Math.cos(f.ry)), s = Math.abs(Math.sin(f.ry)); return { hx: (c * f.w + s * f.d) / 2, hz: (s * f.w + c * f.d) / 2 }; };
if (SAB === 'bare') for (const bp of bps) bp.furniture = bp.furniture.filter((f) => !SITS.has(CATALOG[f.name]?.arch));                                // every chair gone
if (SAB === 'crowd') for (const bp of bps) for (const t of bp.furniture.filter((f) => EATING.test(f.name))) { t.x += 0.3; bp.furniture = bp.furniture.filter((f) => !(SITS.has(CATALOG[f.name]?.arch) && f.room === t.room && Math.hypot(f.x - t.x, f.z - t.z) < 1.2)); }
if (SAB === 'board') for (const bp of bps) for (const b of bp.furniture.filter((f) => f.name === 'decal:chalkboard')) bp.furniture.push({ ...b, id: b.id + '.cab', name: 'locker_pair', kind: 'floor', parent: null, h: 1.8, w: b.w * 0.6, d: 0.5, y: b.y - 0.95, z: b.z, x: b.x });
if (SAB === 'motorbike') for (const bp of bps) if (/solda/i.test(bp.lot?.name ?? '')) for (const f of bp.furniture) if (f.name === 'decal:sign_soldadura') f.name = 'decal:sign_taller';
if (SAB === 'noseat') for (const bp of bps) { const living = new Set(bp.rooms.filter((r) => r.type === 'living').map((r) => r.id)); bp.furniture = bp.furniture.filter((f) => !(living.has(f.room) && CATALOG[f.name]?.seat)); }

// ---------------------------------------------------------------- tables and their chairs (R4-304)
/** Every table that people eat at, with the chairs, stools and benches within a hand's breadth of its edge (in its own frame). */
const tables = [];
for (const bp of bps) {
  for (const r of bp.rooms) {
    const fl = floorOf(bp, r.id);
    for (const t of fl.filter((f) => EATING.test(f.name))) {
      const c = Math.cos(t.ry), s = Math.sin(t.ry);
      const seats = fl.filter((f) => f !== t && SITS.has(CATALOG[f.name]?.arch) && Math.abs((f.x - t.x) * c - (f.z - t.z) * s) <= t.w / 2 + 0.55 && Math.abs((f.x - t.x) * s + (f.z - t.z) * c) <= t.d / 2 + 0.55).length;
      tables.push({ id: `${r.id} ${t.name}`, room: r.id, type: r.type, seats });
    }
  }
}
test('no table stands without a chair: a table nobody can sit at is taken out or given its chairs', () => {
  assert.ok(tables.length >= 100, `${tables.length} tables to look at`);
  const bare = tables.filter((t) => t.seats === 0);
  console.log(`# tables: ${tables.length}, ${bare.length} without a chair, ${tables.filter((t) => t.seats >= 2).length} with two or more`);
  assert.equal(bare.length, 0, `${bare.length} tables without a chair: ${bare.slice(0, 10).map((t) => t.id).join(', ')}`);
});
test('most tables seat two or more (a 1 m table, two on a side), and every dining room has a chair or a stool', () => {
  const two = tables.filter((t) => t.seats >= 2).length / tables.length;
  assert.ok(two >= 0.6, `${(two * 100).toFixed(0)}% of ${tables.length} tables seat two or more (30% before round 6)`);
  const dining = bps.flatMap((bp) => bp.rooms.filter((r) => r.type === 'dining').map((r) => ({ id: r.id, chairs: floorOf(bp, r.id).filter((f) => SITS.has(CATALOG[f.name]?.arch)).length, tables: floorOf(bp, r.id).filter((f) => EATING.test(f.name)).length })));
  const empty = dining.filter((d) => d.tables && !d.chairs);
  assert.ok(dining.length >= 20, `${dining.length} dining rooms to look at`);
  assert.equal(empty.length, 0, `${empty.length} dining rooms with a table and no chair or stool: ${empty.slice(0, 10).map((d) => d.id).join(', ')}`);
});

// ---------------------------------------------------------------- the barber's chairs (R4-312)
test('the chairs of a barber shop stand 0.4 m or more apart, each in front of its own mirror', () => {
  const shops = bps.flatMap((bp) => bp.rooms.filter((r) => r.type === 'shop' && bp.interior?.rooms?.[r.id]?.shopType === 'peluqueria').map((r) => ({ bp, r })));
  let pairs = 0;
  for (const { bp, r } of shops) {
    const chairs = bp.furniture.filter((f) => f.room === r.id && f.name === 'barber_chair'), mirrors = bp.furniture.filter((f) => f.room === r.id && f.name === 'mirror_barber');
    if (chairs.length < 2) continue;
    const along = Math.abs(Math.sin(chairs[0].ry)) > 0.7 ? 'z' : 'x';                      // the chairs stand at a wall: the gap is measured along it
    const us = chairs.map((c) => c[along]).sort((p, q) => p - q);
    us.slice(1).forEach((u, i) => { pairs++; assert.ok(u - us[i] - chairs[0].w >= 0.4, `${r.id}: two barber chairs ${(u - us[i] - chairs[0].w).toFixed(2)} m apart`); });
    for (const c of chairs) {
      const off = Math.min(...mirrors.map((m) => Math.abs(m[along] - c[along])));
      assert.ok(off <= 0.25, `${r.id}: a barber chair stands ${off.toFixed(2)} m off the middle of its mirror`);
    }
  }
  assert.ok(pairs >= 1, `${pairs} pairs of barber chairs to look at`);
});

// ---------------------------------------------------------------- the board of a classroom (R4-305)
test('nothing tall stands in front of the chalkboard of a classroom (a pair of lockers hid the end of it in L00.f0.r4)', () => {
  const hidden = [];
  let boards = 0;
  for (const bp of bps) {
    for (const b of bp.furniture.filter((f) => f.name === 'decal:chalkboard')) {
      boards++;
      const nx = b.wallSide === '-x' || b.wallSide === '+x' ? 1 : 0;
      for (const f of floorOf(bp, b.room)) {
        if (f.h < 0.9) continue;
        const { hx, hz } = span(f);
        const along = nx ? Math.min(b.z + b.w / 2, f.z + hz) - Math.max(b.z - b.w / 2, f.z - hz) : Math.min(b.x + b.w / 2, f.x + hx) - Math.max(b.x - b.w / 2, f.x - hx);
        const dist = nx ? Math.abs(f.x - b.x) - hx : Math.abs(f.z - b.z) - hz;
        if (along > 0.3 && dist < 0.35) hidden.push(`${b.room}: ${f.name} (${f.h} m) hides ${along.toFixed(2)} m of the board`);
      }
    }
  }
  assert.ok(boards >= 4, `${boards} chalkboards to look at`);
  assert.equal(hidden.length, 0, hidden.join('; '));
});

// ---------------------------------------------------------------- a welder's workshop (R4-307)
const workshops = bps.filter((bp) => bp.lot?.kind === 'workshop').map((bp) => ({ bp, name: bp.lot.name ?? '', room: bp.rooms.find((r) => r.type === 'workshop') })).filter((w) => w.room);
const kit = (w) => { const names = w.bp.furniture.filter((f) => f.room === w.room.id).map((f) => f.name); const has = (re) => names.filter((n) => re.test(n)).length; return { names, has }; };
test("'Taller de Soldadura' is fitted for welding: a metal bench, two gas bottles, bar stock, its own sign and price list and no motorbike", () => {
  const welders = workshops.filter((w) => /solda/i.test(w.name));
  assert.ok(welders.length >= 1, `${workshops.length} workshops, ${welders.length} of them welders`);
  for (const w of welders) {
    const { names, has } = kit(w), where = `${w.bp.id} ${w.name}`;
    assert.ok(has(/^workbench_metal$/) >= 1, `${where}: a welding bench`);
    assert.ok(has(/^gas_cylinder$/) >= 2, `${where}: two gas bottles`);
    assert.ok(has(/^pipes_bundle$/) >= 1, `${where}: bar stock`);
    assert.ok(names.includes('decal:sign_soldadura'), `${where}: its own sign, not the mechanic's`);
    assert.ok(names.includes('decal:price_solda'), `${where}: its own price list, not the mechanic's`);
    assert.equal(has(/^(motorbike|tire_stack)$|^decal:(sign|price)_taller$/), 0, `${where}: a motorbike, tyres or the mechanic's sign in a welder's shop: ${names.filter((n) => /motorbike|tire|_taller/.test(n)).join(', ')}`);
  }
});
test("a mechanic's workshop keeps its motorbikes and its sign: the welder's fit-out is chosen by the name over the door", () => {
  const mechanics = workshops.filter((w) => !/solda/i.test(w.name));
  assert.ok(mechanics.length >= 1, `${workshops.length} workshops, ${mechanics.length} of them mechanics`);
  for (const w of mechanics) {
    const { names, has } = kit(w);
    assert.ok(has(/^motorbike$/) >= 1 && names.includes('decal:sign_taller'), `${w.bp.id} ${w.name}: motorbikes and the sign TALLER DE MOTOS`);
    assert.equal(has(/^(gas_cylinder|pipes_bundle)$|^decal:(sign|price)_solda(dura)?$/), 0, `${w.bp.id} ${w.name}: a welder's gas bottles, bar stock or lettering in a motorbike shop`);
  }
});
test('the bench of a workshop carries tools and tins, not a row of identical coils of rope', () => {
  for (const w of workshops) {
    const bench = w.bp.furniture.filter((f) => f.room === w.room.id && f.name === 'workbench_metal').map((f) => f.id);
    const stock = (w.bp.goods ?? []).filter((g) => bench.includes(g.parent));
    assert.ok(!stock.some((g) => g.name === 'goods_rope_coil'), `${w.bp.id} ${w.name}: rope on the bench`);
  }
});

// ---------------------------------------------------------------- a set has a seat to watch it from (R4-702)
const TVSET = /^tv_(flat|crt)$/;
/** A seat that sees the set the way index.js `emitAnchors` counts one: facing it (cos > 0.5), a metre or more off. */
const sees = (L, seat, tv) => { const dx = tv.x - seat.x, dz = tv.z - seat.z, d = Math.hypot(dx, dz), f = L.face(seat); return d >= 1 && (f[0] * dx + f[1] * dz) / d > 0.5; };
/** Two of A2's living rooms with no wall left for a sofa, as the furnisher meets them: the flat's (L06.f1.r2, 3.16 x 3.01 m, a door in the north, the south and the east wall) and the shophouse's (L05.f1.r2, 1.93 x 2.83 m,
 *  a door north and east, a window west). The stand takes a wall and the sofa has nowhere across from it. */
const LIVINGS = {
  flat: { rect: { x0: -4.28, z0: -1.21, x1: -1.12, z1: 1.8 }, doors: [[-2.7, -1.21], [-2.7, 1.8], [-1.12, 0.51]], windows: [] },
  shophouse: { rect: { x0: -2.03, z0: -1.5, x1: -0.1, z1: 1.34 }, doors: [[-1.06, -1.5], [-0.1, 0.84]], windows: [{ x: -2.03, z: 0, w: 1.44, y: 0.98, h: 1.1 }] },
};
function livingRoom(shape, seed) {
  const { rect, doors, windows } = LIVINGS[shape];
  const room = { id: 'F.f1.r2', type: 'living', floor: 1, rect, y: 0, h: 2.62 };
  const door = (id, [x, z]) => ({ id, kind: 'interior', x, z, w: 0.9, rooms: ['F.f1.r0', room.id], swing: 1, hinge: 'left' });
  const bp = { id: 'F', rooms: [room], windows: windows.map((w) => ({ ...w, room: room.id })), stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: doors.map((d, i) => door('F.d' + i, d)) };
  const hh = { tints: {}, income: 0, kind: 'family', kids: 0, pets: [], tidy: 0.5, religious: 0, hobby: null };
  return { L: new Layout({ bp, room, rng: makeRng(seed), hh }), E: { bp, used: new Set() }, hh };
}
test('every living room with a TV on its stand has somewhere to sit (31 of the barrio\'s 195 living rooms had none: every flat of L06 and L16)', () => {
  let withSet = 0;
  const lacking = [];
  for (const bp of bps) {
    for (const r of bp.rooms.filter((q) => q.type === 'living')) {
      const fl = bp.furniture.filter((f) => f.room === r.id);
      if (!fl.some((f) => TVSET.test(f.name))) continue;
      withSet++;
      if (!fl.some((f) => f.kind === 'floor' && CATALOG[f.name]?.seat)) lacking.push(r.id);
    }
  }
  console.log(`# living rooms with a TV: ${withSet}, ${lacking.length} with nowhere to sit`);
  assert.ok(withSet >= 150, `${withSet} living rooms with a TV to look at`);
  assert.equal(lacking.length, 0, `${lacking.length} living rooms with a TV and nowhere to sit: ${lacking.slice(0, 12).join(', ')}`);
});
test('a living room too small for a sofa seats its TV with a seat that faces it (an armchair, a chair or a stool: the flats of L06, L16, L71, the shophouses L05, L57, L76)', () => {
  let bare = 0, n = 0;
  for (const shape of Object.keys(LIVINGS)) for (let seed = 1; seed <= 12; seed++) {
    n++;
    const { L, E, hh } = livingRoom(shape, seed);
    ROOMS.living(L, E, hh);                                                                                // (the furnisher alone: the seat is placed with the set, before the room's decoration takes the walls)
    const tv = L.items.find((i) => TVSET.test(i.name)), seats = L.items.filter((i) => i.floor && i.c.seat);
    if (!seats.length) bare++;
    assert.ok(tv, `${shape} ${seed}: the set stays (${L.items.map((i) => i.name).join(', ')})`);
    assert.ok(seats.some((s) => sees(L, s, tv)), `${shape} ${seed}: no seat faces the set (${seats.map((s) => `${s.name}@${s.x},${s.z}`).join(', ') || 'none at all'})`);
  }
  assert.equal(bare, 0, `${bare} of ${n} living rooms with a TV and nowhere to sit`);
});
test('a TV whose seat healing took out gets one again, in front of it (ensureSeats, as for a table)', () => {
  for (const shape of Object.keys(LIVINGS)) for (let seed = 1; seed <= 12; seed++) {
    const { L, E, hh } = livingRoom(shape, seed);
    ROOMS.living(L, E, hh);
    for (const s of L.items.filter((i) => i.floor && i.c.seat)) L.remove(s);                                // (what a heal that walled the seat in would do)
    const gone = ROOMS.ensureSeats(L), tv = L.items.find((i) => TVSET.test(i.name)), seats = L.items.filter((i) => i.floor && i.c.seat);
    assert.ok(tv && !gone.length, `${shape} ${seed}: the set stays (took out: ${gone.map((g) => g.name).join(', ') || 'nothing'})`);
    assert.ok(seats.some((s) => sees(L, s, tv)), `${shape} ${seed}: a seat faces the set again (${seats.map((s) => s.name).join(', ') || 'none'})`);
  }
});
test('a set with no room to sit in front of it is taken out, its stand stays (a 1.3 x 0.95 m room: the stand and 5 cm)', () => {
  const rect = { x0: 0, z0: 0, x1: 1.3, z1: 0.95 };
  const room = { id: 'S.f0.r1', type: 'living', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [] };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {} } });
  const stand = L.at('tv_stand', 0.65, 0.21, 0, { force: true, prio: 0 }), tv = L.top(stand, 'tv_crt', { at: 'center' });
  assert.ok(stand && tv, 'the setup: a stand with a set on it');
  const gone = ROOMS.ensureSeats(L);
  assert.deepEqual(gone.map((g) => g.name), ['tv_crt'], 'the set goes');
  assert.ok(L.items.includes(stand) && !L.items.some((i) => TVSET.test(i.name)), 'the stand stays, the set is gone');
});

// ---------------------------------------------------------------- hand-made rooms of the barrio (R4-704, R4-705)
/** A room as the furnisher meets it: `rect`, `doors` ([x, z, width, kind, out]: `out` = the door lists this room first, as the plan does for a room behind another) and `windows`
 *  ([x, z, width, sill, height]) as A2's plan has them; `put` pieces go in at exact poses; `hhx` overrides the household. */
function homeRoom(spec, seed = 1, hhx = {}) {
  const { type, rect, doors = [], windows = [], y = 0, floor = 0, outdoor = false, lot = 'rowhouse' } = spec;
  const room = { id: 'H.f0.r2', type, floor, rect, y, h: spec.h ?? 2.62, outdoor };
  const bp = {
    id: 'H', lot: { kind: lot }, rooms: [room], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    windows: windows.map(([x, z, w, sill, h]) => ({ x, z, w, y: sill, h, room: room.id })),
    doors: doors.map(([x, z, w, kind, out], i) => ({ id: `H.d${i}`, kind, x, z, w, rooms: out ? [room.id, 'H.f0.r9'] : ['H.f0.r1', room.id], swing: 1, hinge: 'left' })),
  };
  const hh = { id: 'H.all.family', tints: {}, income: 0, kind: 'family', kids: 0, babies: 0, teen: 0, elder: 0, pets: [], tidy: 0.5, religious: 0, hobby: null, plastic: true, ...hhx };
  const L = new Layout({ bp, room, rng: makeRng(seed), hh });
  for (const [name, x, z, ry, prio = 0] of spec.put ?? []) L.at(name, x, z, ry, { force: true, prio });
  return { L, E: { bp, used: new Set() }, hh, room, bp };
}
/** For every piece of the room that opens: how many of its fronts a person can stand in front of (reach.js `standSpots`, the rule containers.js `registerFronts` holds every front to: a front nobody can stand
 *  at is decoration, R4-118), counted here on its own, not by rooms.js. */
function frontsOf(h) {
  h.bp.interior = { layouts: new Map([[h.room.id, h.L]]) };
  const conn = h.L.connectivity(), out = new Map();
  for (const it of h.L.items) {
    const lay = layoutOf(CATALOG[it.name]); if (!lay) continue;
    const rec = { id: it.id, room: h.room.id, kind: it.ceil ? 'ceil' : it.top ? 'top' : it.wall ? 'wall' : 'floor', x: it.x, y: it.y ?? 0, z: it.z, ry: it.ry, h: it.h };
    out.set(it, lay.slots.filter((s) => standSpots(h.bp, rec, s, conn).length).length);
  }
  return out;
}
/** A seat gets a sit anchor if floor of the doors' region lies within its radius of one of its seat points (index.js `emitAnchors`, said again here with the same catalogue helpers). */
const hasSitAnchor = (L, it) => { const conn = L.connectivity(0.34), cells = Math.ceil((Math.hypot(it.w, it.d) / 2 + 0.8) / 0.1); return seatOffsets(it.c).some((ox) => { const [sx, sz] = L.rel(it, ox, seatZoff(it.c)); return L.inMainRegion(sx, sz, conn, cells); }); };

// ---------------------------------------------------------------- a table seats two (R4-704)
// Before round 7: 75 of the barrio's 322 tables had one chair or stool at them, or none: the 1 m table of a rowhouse's 1.93 m dining passage (a chair is 0.5 m deep, a stool 0.33 m), a plastic table on a roof
// terrace or a patio, a table whose second chair healing took out (ensureSeats took one seat for a set).
const EATING_ALL = /^table_(formica_4|formica_6|wood_6|round_small|plastic)$/;
/** The chairs, stools and benches within a hand's breadth of a table's edge (in its own frame): `list` of pieces with x, z, w, d, ry; `archOf(piece)` the catalogue's name for what it is. */
const seatsList = (list, t, archOf) => { const c = Math.cos(t.ry), s = Math.sin(t.ry); return list.filter((f) => f !== t && SITS.has(archOf(f)) && Math.abs((f.x - t.x) * c - (f.z - t.z) * s) <= t.w / 2 + 0.55 && Math.abs((f.x - t.x) * s + (f.z - t.z) * c) <= t.d / 2 + 0.55); };
const strict = [];
for (const bp of bps) {
  for (const r of bp.rooms) {
    const fl = floorOf(bp, r.id);
    for (const t of fl.filter((f) => EATING_ALL.test(f.name))) strict.push({ id: `${r.id} ${t.name}`, name: t.name, seats: seatsList(fl, t, (f) => CATALOG[f.name]?.arch).length });
  }
}
test('every table people eat at seats two: fewer only at the 0.7 m round table of a nook, never none (75 of the barrio\'s 316 seated one or nobody: R4-704)', () => {
  assert.ok(strict.length >= 250, `${strict.length} tables to look at`);
  const weak = strict.filter((t) => t.seats < 2), bad = weak.filter((t) => t.name !== 'table_round_small' || t.seats < 1);
  console.log(`# eating tables: ${strict.length}, ${weak.length} seating fewer than two`);
  assert.equal(bad.length, 0, `${bad.length} tables seat fewer than two: ${bad.slice(0, 12).map((t) => `${t.id} (${t.seats})`).join(', ')}`);
  assert.ok(weak.length <= 10, `${weak.length} round tables seat only one: ${weak.map((t) => t.id).join(', ')}`);
});

test('the kitchen of L78.f2.r4 (3.3 x 2.5 m) keeps its 0.7 m round table, its stool and its pantry: seating the table does not take out a pantry that opens (R4-118; with the pantry given up the table was taken out)', () => {
  const names = floorOf(bps.find((b) => b.id === 'L78'), 'L78.f2.r4').map((f) => f.name);
  for (const want of ['table_round_small', 'stool_wood', 'pantry_cabinet']) assert.ok(names.includes(want), `L78.f2.r4 has no ${want} (${names.join(', ')})`);
});

/** Three rooms R4-704 found a table in with one seat, as the plan makes them (the dump of each room of L24, L20 and L35). */
const TABLE_ROOMS = {
  passage: { furnish: 'dining', type: 'dining', rect: { x0: -2.03, z0: -1.2715, x1: -0.1, z1: 1.377 }, doors: [[-1.06, 1.43, 1.2, 'arch'], [-1.06, -1.33, 0.9, 'interior', true]], windows: [[-2.14, 0, 1.14, 1.02, 1.08]] },            // L24.f0.r2: 1.93 x 2.65 m, a door at each end
  kitchen: { furnish: 'kitchen', type: 'kitchen', floor: 1, y: 2.8, rect: { x0: -2.78, z0: -2.47, x1: 0.65, z1: -0.39 }, doors: [[0.7, -0.89, 0.85, 'interior'], [-1.06, -2.52, 0.9, 'interior', true]] },                                 // L20.f1.r2: 3.43 x 2.08 m
  patio: { furnish: 'outdoor', type: 'patio', outdoor: true, rect: { x0: -2.58, z0: -1.28, x1: 2.58, z1: 1.95 }, doors: [[-2.73, 0.33, 1.83, 'arch'], [2.73, 0.33, 1.83, 'arch'], [-0.32, 2, 0.9, 'interior'], [0.16, -1.33, 0.9, 'interior']] },   // L35.f0.r2: 5.16 x 3.23 m
};
const tableOf = (L) => L.items.filter((i) => i.floor && !i.parent && /^table_/.test(i.name));
const seatedAt = (L, t) => seatsList(L.items.filter((i) => i.floor && !i.parent), t, (i) => i.c.arch);
/** The room furnished, healed and given its seats, in the order of index.js `furnishSteps`. */
function tableRoom(shape, seed) {
  const r = homeRoom(TABLE_ROOMS[shape], seed, { kids: 1 });
  ROOMS[TABLE_ROOMS[shape].furnish](r.L, r.E, r.hh);
  r.L.heal();
  ROOMS.ensureSeats(r.L);
  return r;
}
test('the 1 m table in the 1.93 m passage of a rowhouse dining room (L24.f0.r2) seats two, on stools where chairs do not fit (12 seeds: it seated one in all 12)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { L } = tableRoom('passage', seed), got = tableOf(L);
    assert.equal(got.length, 1, `seed ${seed}: one table, not ${got.length}`);
    assert.ok(seatedAt(L, got[0]).length >= 2, `seed ${seed}: the ${got[0].name} seats ${seatedAt(L, got[0]).length} (${L.items.filter((i) => i.floor && !i.parent).map((i) => i.name).join(', ')})`);
  }
});
test('a plastic table on a patio (L35.f0.r2) seats two (12 seeds: the furnisher drew it one chair, or none, in three of them)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { L } = tableRoom('patio', seed), got = tableOf(L);
    assert.equal(got.length, 1, `seed ${seed}: one table, not ${got.length}`);
    assert.ok(seatedAt(L, got[0]).length >= 2, `seed ${seed}: the ${got[0].name} seats ${seatedAt(L, got[0]).length}`);
  }
});
test('ensureSeats gives a table left with one chair a second seat: a half set is not a set (a heal that walled the other chair in)', () => {
  for (const shape of ['passage', 'patio']) for (let seed = 1; seed <= 6; seed++) {
    const { L } = tableRoom(shape, seed), [t] = tableOf(L), seats = seatsList(L.items.filter((i) => i.floor && !i.parent), t, (i) => i.c.arch);
    assert.ok(seats.length >= 2, `${shape} ${seed}: the setup seats two (${seats.length})`);
    for (const s of seats.slice(1)) L.remove(s);                                                                           // (one chair left)
    ROOMS.ensureSeats(L);
    const now = tableOf(L);
    assert.equal(now.length, 1, `${shape} ${seed}: the table stays (${now.length})`);
    assert.ok(seatedAt(L, now[0]).length >= 2, `${shape} ${seed}: the ${now[0].name} seats ${seatedAt(L, now[0]).length} after ensureSeats`);
  }
});
test('a table too big to seat two is swapped for the next size down, a round 0.7 m one (the kitchen of L20.f1.r2, 30 seeds)', () => {
  let tables = 0, smaller = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { L } = tableRoom('kitchen', seed);
    for (const t of tableOf(L)) {
      tables++;
      if (t.name === 'table_round_small') smaller++;
      const n = seatedAt(L, t).length;
      assert.ok(n >= 2 || (t.name === 'table_round_small' && n >= 1), `seed ${seed}: the ${t.name} seats ${n}`);
    }
  }
  assert.ok(tables >= 15, `${tables} tables over 30 seeds`);
  assert.ok(smaller >= 1, `${smaller} tables came down a size: the swap is looked at (the kitchen furnisher draws a 1 m table only)`);
});
/** The terrace of T02.f2.r2 in the synthetic batch (3.64 x 2.06 m, one door in the south wall, the pigeon loft in the corner): a 0.85 m plastic table in it seats two on stools only one at a time. */
const TERRACE = { type: 'terrace', outdoor: true, rect: { x0: -3.12, z0: -4.41, x1: 0.52, z1: -2.34 }, doors: [[-0.976, -2.242, 0.9, 'interior']], windows: [[-1.3, -4.5056, 1.2, 0.95, 1.2], [-3.2207, -3.3738, 0.9, 0.95, 1.2]],
  put: [['pigeon_loft', 0.11, -3.81, -Math.PI / 2, 1], ['table_plastic', -1.65, -3.68, Math.PI / 2]] };
test('a stool that the next one walled in is no seat: every seat drawn up to a table can be walked up to (the terrace of T02.f2.r2 had one with no sit anchor)', () => {
  let seats = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const { L } = homeRoom(TERRACE, seed), [t] = tableOf(L);
    assert.ok(t, `seed ${seed}: the setup, a table`);
    const cs = ROOMS.chairsAround(L, t, 2, ['chair_plastic', 'stool_wood'], { dense: true, small: 'stool_wood' });
    seats += cs.length;
    for (const c of cs) assert.ok(L._accessOk(c, true) && hasSitAnchor(L, c), `seed ${seed}: the ${c.name} at ${c.x.toFixed(2)}, ${c.z.toFixed(2)} is shut in (${cs.length} seats)`);
    assert.equal(L.items.filter((i) => i.floor && L._needsAccess(i) && !L._accessOk(i, true)).length, 0, `seed ${seed}: something in the room is shut in`);
  }
  assert.ok(seats >= 24, `${seats} seats over 24 seeds: the terrace holds seats, the test is looked at`);
});
/** A 3.2 x 3.0 m kitchen with one door (a hand-made one: the real kitchens of L20, L35 and the like are as tight): its counter, sink and cupboards each have floor in front of them to open from. */
const KITCHEN = { furnish: 'kitchen', type: 'kitchen', rect: { x0: 0, z0: 0, x1: 3.2, z1: 3.0 }, doors: [[0.6, -0.05, 0.9, 'interior']], windows: [[3.25, 1.5, 1.0, 1.0, 1.0]] };
test('ensureSeats seats a table without taking a front from what opens: the counter, the sink and the cupboards of a kitchen stay usable (63 fronts of 102 hand-made rooms went before)', () => {
  let rooms = 0, reseated = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const h = homeRoom(KITCHEN, seed, { kids: 1 });
    ROOMS[KITCHEN.furnish](h.L, h.E, h.hh);
    h.L.heal();
    for (const t of tableOf(h.L)) for (const s of seatedAt(h.L, t).slice(1)) h.L.remove(s);                              // (a heal that took the other seats out: ensureSeats gives them back)
    const before = frontsOf(h), tables = tableOf(h.L).length;
    if (!tables || ![...before.values()].some((n) => n > 0)) continue;
    rooms++;
    ROOMS.ensureSeats(h.L);
    const after = frontsOf(h);
    reseated += tableOf(h.L).filter((t) => seatedAt(h.L, t).length >= 2).length;
    for (const [it, n] of before) if (n) {
      assert.ok(h.L.items.includes(it), `seed ${seed}: the ${it.name} is gone`);
      assert.ok(after.get(it) >= n, `seed ${seed}: the ${it.name} could be opened from ${n} of its fronts, and now from ${after.get(it)}`);
    }
  }
  assert.ok(rooms >= 12, `${rooms} kitchens with a table and something to open: the test is looked at`);
  assert.ok(reseated >= 6, `${reseated} tables were given their second seat: ensureSeats did its work`);
});

// ---------------------------------------------------------------- a child's place in every home with children (R4-705)
// Before round 7: 123 of the barrio's 193 households with children had no child's bed (89 owned a bedroom that held only the parents' double, 34 owned no bedroom: they slept where the plan's other
// household left them room), and 41 of the 173 buildings with beds or toys had two signs of children (toy piles, school bags) and no bed for one.
const CHILD_BED = /^(bed_(bunk|single|single_metal)|mattress_)/, NOT_HOMES = new Set(['chapel', 'school', 'clinic', 'hall', 'unfinished']), KID_SIGNS = /toy_pile|school_bag|kids_draw|picture_nino|football$|doll/;
test('no home holds two signs of children and no child\'s bed: the toy piles and school bags stood beside a double bed (R4\'s census of buildings, flats one by one: 34 homes had)', () => {
  const units = new Map();
  for (const bp of bps) {
    if (NOT_HOMES.has(bp.lot?.kind)) continue;
    const flats = bp.lot?.kind === 'apartments' || bp.lot?.kind === 'tenement';
    for (const f of bp.furniture) {
      const key = flats ? `${bp.id}/${bp.interior?.rooms?.[f.room]?.hh ?? 'x'}` : bp.id, u = units.get(key) ?? units.set(key, { signs: 0, beds: 0 }).get(key);
      if (KID_SIGNS.test(f.name)) u.signs++;
      if (CHILD_BED.test(f.name) || f.name === 'bed_crib') u.beds++;
    }
  }
  const lacking = [...units].filter(([, u]) => u.signs >= 2 && !u.beds).map(([k]) => k);
  console.log(`# homes with two signs of children: ${[...units.values()].filter((u) => u.signs >= 2).length}, ${lacking.length} with no child's bed`);
  assert.ok([...units.values()].filter((u) => u.signs >= 2).length >= 60, 'homes with two signs of children to look at');
  assert.ok(lacking.length <= 5, `${lacking.length} homes with two signs of children and no child's bed: ${lacking.join(', ')}`);
});
test('a household with children and a bedroom or a living room to put them in has a child\'s bed there; the few without live in a tenant\'s bedroom of 1.9 x 2.5 m or a living room with no wall to spare (92 had none)', () => {
  let homes = 0;
  const lacking = [];
  for (const bp of bps) {
    if (NOT_HOMES.has(bp.lot?.kind)) continue;
    const meta = bp.interior?.rooms ?? {};
    for (const hh of bp.interior?.hh ?? []) {
      if (!(hh.kids > 0)) continue;
      const rooms = bp.rooms.filter((r) => meta[r.id]?.hh === hh.id && !r.outdoor);
      if (!rooms.some((r) => (r.type === 'bedroom' || r.type === 'living') && r.rect.x1 - r.rect.x0 >= 0.9 && r.rect.z1 - r.rect.z0 >= 0.9)) continue;     // (the keeper of a shop who lives elsewhere: not a home)
      homes++;
      const ids = new Set(rooms.map((r) => r.id)), names = bp.furniture.filter((f) => ids.has(f.room) && f.kind === 'floor' && !f.parent).map((f) => f.name);
      if (!names.some((n) => CHILD_BED.test(n) || (n === 'bed_crib' && hh.kids === 1))) lacking.push(hh.id);
    }
  }
  console.log(`# households with children and somewhere to sleep: ${homes}, ${lacking.length} with no child's bed`);
  assert.ok(homes >= 100, `${homes} households to look at`);
  assert.ok(lacking.length <= 30, `${lacking.length} households with children and no child's bed: ${lacking.join(', ')}`);
});
test('a sleeper lies in a bedroom (people-homelife "the night"): every sleep anchor of the barrio is in a bedroom, and the child\'s bunk, single or crib of a living room (R4-705) is still there for the eye', () => {
  // the people sim lies a sleeper on an anchor of kind 'sleep' (people/homelife.js WANT.sleep) and its test holds that anchor's room to be a bedroom: round 7's child's beds in living rooms had one each (a bunk two),
  // and n03 of the night lay in the living room of her home
  const outside = [];
  let inBedrooms = 0, livingBeds = 0;
  for (const bp of bps) {
    const type = new Map(bp.rooms.map((r) => [r.id, r.type]));
    for (const a of bp.anchors) if (a.kind === 'sleep') { if (type.get(a.room) === 'bedroom') inBedrooms++; else outside.push(`${bp.id} ${a.room} (${type.get(a.room)}): ${a.tags.join('/')}`); }
    for (const f of bp.furniture) if (f.kind === 'floor' && !f.parent && /^bed_(bunk|single|single_metal|crib)$/.test(f.name) && type.get(f.room) === 'living') livingBeds++;
  }
  console.log(`# sleep anchors: ${inBedrooms} in bedrooms, ${outside.length} elsewhere; bunks, singles and cribs standing in living rooms: ${livingBeds}`);
  assert.ok(inBedrooms >= 300, `${inBedrooms} sleep anchors in bedrooms: the census looks at nothing`);
  assert.ok(livingBeds >= 8, `${livingBeds} bunks, singles and cribs in living rooms: R4-705's beds were taken out instead of their sleep anchors (11 stand there)`);
  assert.equal(outside.length, 0, `${outside.length} sleep anchors outside a bedroom:\n  ${outside.slice(0, 10).join('\n  ')}`);
});

/** Homes as round 6 leaves them, by hand: the parents' double with a wardrobe and a trunk and nothing for the children. */
const ROOMY = { type: 'bedroom', rect: { x0: 0, z0: 0, x1: 3.6, z1: 3.4 }, doors: [[1.0, -0.05, 0.9, 'interior']], windows: [[2.4, 3.45, 1.2, 1.0, 1.1]],
  put: [['bed_double', 2.6, 1.7, -Math.PI / 2], ['wardrobe_2', 0.3, 2.4, Math.PI / 2, 1], ['chest_trunk', 0.5, 0.6, Math.PI / 2, 1]] };                                                // 3.6 x 3.4 m, a door in the north wall, a window in the south wall
const KIDS_ROOMS = {
  roomy: ROOMY,
  roomyNoWindow: { ...ROOMY, windows: [] },
  roomyDecor: { ...ROOMY, put: [...ROOMY.put, ['plant_pot_clay', 2.6, 0.25, 0, 2], ['shoes_pair', 1.9, 0.3, 0, 2]] },          // a plant and shoes on the one wall that has a pose for the bunk
  tenant: { type: 'bedroom', rect: { x0: 0, z0: 0, x1: 2.02, z1: 2.54 }, doors: [[0.45, -0.05, 0.9, 'interior']], put: [['bed_double', 1.0, 1.55, 0], ['chest_trunk', 0.45, 0.45, 0, 1]] },   // a tenant's bedroom: 2.02 x 2.54 m
  living: { type: 'living', rect: { x0: 0, z0: 0, x1: 3.6, z1: 3.4 }, doors: [[1.0, -0.05, 0.9, 'interior']], windows: [[3.65, 1.7, 1.2, 1.0, 1.1]],
    put: [['tv_stand', 2.7, 0.25, 0], ['sofa_3_fabric', 2.0, 3.0, Math.PI, 1], ['armchair_fabric', 0.45, 1.6, Math.PI / 2, 1], ['plant_pot_clay', 3.4, 0.2, 0, 2]] },
  livingCabinet: { type: 'living', rect: { x0: 0, z0: 0, x1: 3.6, z1: 3.4 }, doors: [[1.0, -0.05, 0.9, 'interior']], windows: [[3.65, 1.7, 1.2, 1.0, 1.1]],
    put: [['display_cabinet', 2.7, 0.22, 0, 1], ['sofa_3_fabric', 1.9, 3.0, Math.PI, 1], ['armchair_fabric', 0.45, 1.6, Math.PI / 2, 1], ['bookshelf_low', 3.4, 2.8, -Math.PI / 2, 1]] },
};
const kidsHome = (shape, hhx, seed = 1, lot = 'rowhouse') => homeRoom({ ...KIDS_ROOMS[shape], lot }, seed, hhx);
const kidsPass = (...homes) => ROOMS.ensureKidsBeds(homes.map(({ room, hh, L }) => ({ room, hh, L })), homes[0].E);
const metrics = (L) => ({ pockets: L.seriousPockets().length, shut: L.items.filter((i) => i.floor && L._needsAccess(i) && !L._accessOk(i, true)).length, whole: L.connectivity().ok });
const itemKey = (L) => L.items.map((i) => [i.id, i.name, i.x, i.z, i.ry].join()).join(';');
/** The room is as walkable as it was: no new dead-end lane, nobody shut in, still in one piece. */
function noWorse(L, before, what) {
  const after = metrics(L);
  assert.ok(after.pockets <= before.pockets, `${what}: ${after.pockets} dead-end lanes, ${before.pockets} before`);
  assert.ok(after.shut <= before.shut, `${what}: ${after.shut} beds or seats shut in, ${before.shut} before`);
  assert.ok(!before.whole || after.whole, `${what}: the room is cut in two`);
}
test('a bedroom that holds only the parents\' double gets the children\'s bunk, and keeps it off the window (3.6 x 3.4 m, two children)', () => {
  const free = kidsHome('roomyNoWindow', { kids: 2 }), south = kidsPass(free);
  assert.deepEqual(south.map((o) => o.bed.name), ['bed_bunk'], 'the premise: with no window the bunk goes in');
  assert.ok(south[0].bed.z > 2.4, `the premise: with no window the bunk stands on the south wall (z ${south[0].bed.z})`);
  const h = kidsHome('roomy', { kids: 2 }), before = metrics(h.L), out = kidsPass(h);
  assert.deepEqual(out.map((o) => o.bed.name), ['bed_bunk'], 'the bunk');
  assert.equal(out[0].room, h.room.id);
  assert.equal(out[0].hh, h.hh.id);
  assert.ok(h.L.items.includes(out[0].bed) && h.L.items.some((i) => i.name === 'bed_double'), 'the bunk is in the room beside the double');
  assert.ok(!h.L._windowHit(out[0].bed.ob, 99), 'the bunk does not stand under the window');
  assert.ok(out[0].bed.z < 2.4, `so it is not on the south wall (z ${out[0].bed.z})`);
  assert.ok(h.L._accessOk(out[0].bed, true), 'somebody can walk up to the bunk');
  noWorse(h.L, before, 'roomy');
});
test('three children: a bunk and a single, the second wherever it still fits (no window in the way)', () => {
  const h = kidsHome('roomyNoWindow', { kids: 3 }), before = metrics(h.L), out = kidsPass(h);
  assert.deepEqual(out.map((o) => o.bed.name), ['bed_bunk', 'bed_single'], 'a bunk for two and a single');
  for (const o of out) assert.ok(h.L._accessOk(o.bed, true), `${o.bed.name}: somebody can walk up to it`);
  noWorse(h.L, before, 'roomy, three children');
});
test('a plant and a pair of shoes on the one wall that fits the bunk go, the bunk stays: decoration gives way to a child\'s bed, the furniture does not', () => {
  const h = kidsHome('roomyDecor', { kids: 2 }), before = metrics(h.L), out = kidsPass(h);
  assert.deepEqual(out.map((o) => o.bed.name), ['bed_bunk'], 'a bunk, not a mattress');
  assert.deepEqual(h.L.items.map((i) => i.name).sort(), ['bed_bunk', 'bed_double', 'chest_trunk', 'wardrobe_2'], 'the plant and the shoes that stood where it does are gone, nothing else');
  noWorse(h.L, before, 'roomy with decoration');
});
test('a dresser on the wall the bed would try first stays, and the bed takes the wall where the decoration stood: a real bed, not a mattress on its edge (what opens is somewhere to keep things)', () => {
  const spec = { ...ROOMY, put: [ROOMY.put[0], ['dresser_4', 0.3, 1.8, Math.PI / 2, 2], ['plant_pot_clay', 2.6, 0.25, 0, 2], ['shoes_pair', 1.9, 0.3, 0, 2]] };      // the double on the east wall, the dresser on the west one, the plant and the shoes on the north one
  for (const [kids, bed] of [[1, 'bed_single'], [2, 'bed_bunk']]) for (const seed of [1, 2, 3]) {
    const h = homeRoom(spec, seed, { kids }), dresser = h.L.items.find((i) => i.name === 'dresser_4'), fronts = frontsOf(h).get(dresser);
    assert.ok(fronts > 0, 'the setup: a person can stand at the dresser');
    const out = kidsPass(h), what = `${kids} children, seed ${seed}`;
    assert.deepEqual(out.map((o) => o.bed.name), [bed], `${what}: a ${bed}, not a mattress`);
    assert.ok(h.L.items.includes(dresser) && frontsOf(h).get(dresser) === fronts, `${what}: the dresser stays with its ${fronts} fronts`);
    assert.ok(!h.L.items.some((i) => i.name === 'plant_pot_clay' || i.name === 'shoes_pair'), `${what}: the plant and the shoes where the bed stands are gone`);
  }
});
test('a home with no bedroom puts the children in the living room: a bed where one fits (a cabinet gives way to it), else a mattress stood on its edge by day', () => {
  const cab = kidsHome('livingCabinet', { kids: 2 }), before = metrics(cab.L), out = kidsPass(cab);
  assert.deepEqual(out.map((o) => [o.room, CHILD_BED.test(o.bed.name) && o.bed.name !== 'mattress_leaning']), [[cab.room.id, true]], 'a bed in the living room');
  assert.ok(!cab.L.items.some((i) => i.name === 'display_cabinet'), 'the cabinet that stood where it does is gone');
  assert.ok(cab.L.items.some((i) => i.name === 'sofa_3_fabric') && cab.L.items.some((i) => i.name === 'armchair_fabric'), 'the seats stay');
  noWorse(cab.L, before, 'living room with a cabinet');
  const h = kidsHome('living', { kids: 2 }), b2 = metrics(h.L), got = kidsPass(h);
  assert.deepEqual(got.map((o) => [o.room, o.bed.name]), [[h.room.id, 'mattress_leaning']], 'no bed fits: a mattress stood on its edge');
  assert.ok(h.L.items.some((i) => i.name === 'tv_stand' && i.floor) && h.L.items.some((i) => i.name === 'sofa_3_fabric'), 'the set and the sofa stay');
  noWorse(h.L, b2, 'living room');
});
test('the baby who is a home\'s only child has a crib; two children and a baby have beds, the crib is not one of them', () => {
  const one = kidsHome('roomy', { kids: 1, babies: 1 }), out = kidsPass(one);
  assert.deepEqual(out.map((o) => o.bed.name), ['bed_crib'], 'a crib');
  assert.ok(one.L._accessOk(out[0].bed, true), 'the crib can be walked up to');
  const two = kidsHome('roomyNoWindow', { kids: 2, babies: 1 });
  assert.deepEqual(kidsPass(two).map((o) => o.bed.name), ['bed_bunk'], 'a bunk for the two, whatever the baby sleeps in');
});
test('a room too tight for any bed stays exactly as it was (a tenant\'s bedroom of 2.02 x 2.54 m: the double, a trunk and 0.5 m)', () => {
  const h = kidsHome('tenant', { kids: 2 }), key = itemKey(h.L);
  assert.deepEqual(kidsPass(h), [], 'nothing fits');
  assert.equal(itemKey(h.L), key, 'not a piece moved or taken out');
});
test('what is no home with children is left alone, and a home that has its child\'s bed already is not given another', () => {
  for (const lot of NOT_HOMES) {
    const h = kidsHome('roomy', { kids: 2 }, 1, lot), key = itemKey(h.L);
    assert.deepEqual(kidsPass(h), [], `a ${lot} has no children's beds`);
    assert.equal(itemKey(h.L), key, `${lot}: untouched`);
  }
  const none = kidsHome('roomy', { kids: 0 }), key = itemKey(none.L);
  assert.deepEqual(kidsPass(none), [], 'no children');
  assert.equal(itemKey(none.L), key, 'no children: untouched');
  const h = kidsHome('roomyNoWindow', { kids: 2 });
  assert.equal(kidsPass(h).length, 1, 'the first time');
  const done = itemKey(h.L);
  assert.deepEqual(kidsPass(h), [], 'the second time: the child has a bed');
  assert.equal(itemKey(h.L), done, 'the second time: untouched');
});
test('whatever the room, the beds the pass sets keep the room\'s rules: no new dead-end lane, nobody shut in, in one piece, off the windows (162 hand-made bedrooms and living rooms)', () => {
  let rooms = 0, bedded = 0, beds = 0;
  for (const type of ['bedroom', 'living']) for (const w of [2.4, 3.0, 3.6]) for (const d of [2.5, 3.0, 3.4]) for (const at of [0.2, 0.5, 0.8]) for (const kids of [1, 2, 3]) {
    const spec = { type, rect: { x0: 0, z0: 0, x1: w, z1: d }, doors: [[w * at, -0.05, 0.9, 'interior']], windows: [[w + 0.05, d / 2, 1.1, 1.0, 1.1]],
      put: type === 'bedroom' ? [['bed_double', w - 1.0, d / 2, -Math.PI / 2], ['wardrobe_2', 0.3, d - 0.7, Math.PI / 2, 1]] : [['tv_stand', w - 0.8, 0.25, 0], ['sofa_3_fabric', w / 2, d - 0.5, Math.PI, 1]] };
    const h = homeRoom(spec, 1, { kids }), before = metrics(h.L), out = kidsPass(h), what = `${type} ${w} x ${d}, door at ${at}, ${kids} children`;
    rooms++;
    if (out.length) bedded++;
    noWorse(h.L, before, what);
    for (const o of out) {
      beds++;
      const small = o.bed.name === 'mattress_leaning' || o.bed.name === 'bed_crib';                                       // (a crib and a leaning mattress are held to their own height, a bed frame to any window)
      assert.ok(!h.L._windowHit(o.bed.ob, small ? o.bed.h : 99), `${what}: a ${o.bed.name} under the window`);
    }
  }
  assert.ok(bedded >= 60, `${bedded} of ${rooms} rooms got a bed (${beds} beds): the sweep must look at rooms that take them`);
});

// ---------------------------------------------------------------- a child's bed takes nothing that opens, and shuts nobody out (R4-118: decoration is a front nobody can stand at)
/** Bedrooms as round 6 leaves them, the parents' double along the east wall and one piece that opens against the west or the south wall: the pass used to put a bed in the dresser's place, and a bunk across the
 *  front of the chest and the nightstand (the first bed that the walls give, 0.6 m from them). */
const FRONT_ROOMS = {
  dresser: { type: 'bedroom', rect: { x0: 0, z0: 0, x1: 3.4, z1: 3.0 }, doors: [[0.85, -0.05, 0.9, 'interior']], windows: [[3.45, 1.5, 1.1, 1.0, 1.1]], put: [['bed_double', 2.4, 1.5, -Math.PI / 2], ['dresser_4', 0.3, 1.8, Math.PI / 2, 2]] },
  chest: { type: 'bedroom', rect: { x0: 0, z0: 0, x1: 3.8, z1: 3.8 }, doors: [[0.95, -0.05, 0.9, 'interior']], windows: [[3.85, 1.9, 1.1, 1.0, 1.1]], put: [['bed_double', 2.8, 1.9, -Math.PI / 2], ['chest_trunk', 1.9, 3.5, Math.PI, 1]] },
  nightstand: { type: 'bedroom', rect: { x0: 0, z0: 0, x1: 3.8, z1: 3.8 }, doors: [[0.95, -0.05, 0.9, 'interior']], windows: [[3.85, 1.9, 1.1, 1.0, 1.1]], put: [['bed_double', 2.8, 1.9, -Math.PI / 2], ['nightstand_a', 1.9, 3.5, Math.PI, 2]] },
};
test('a child\'s bed takes no piece that opens and no front of one: the dresser stays, no bunk goes across a chest or a nightstand (the children get a mattress on its edge where nothing else is left)', () => {
  for (const [what, spec] of Object.entries(FRONT_ROOMS)) for (const kids of [1, 2, 3]) {
    const h = homeRoom(spec, 1, { kids }), before = frontsOf(h), pieces = [...before.keys()];
    assert.equal(pieces.length, 1, `${what}: the setup, one piece that opens`);
    assert.ok(before.get(pieces[0]) > 0, `${what}: the setup, a person can stand at its front`);
    const out = kidsPass(h), after = frontsOf(h);
    assert.ok(out.length >= 1 && out.every((o) => CHILD_BED.test(o.bed.name)), `${what}, ${kids} children: a child's bed of some kind (${out.map((o) => o.bed.name)})`);
    assert.ok(h.L.items.includes(pieces[0]), `${what}, ${kids} children: the ${pieces[0].name} was taken out for a bed (${out.map((o) => o.bed.name)})`);
    assert.equal(after.get(pieces[0]), before.get(pieces[0]), `${what}, ${kids} children: the ${pieces[0].name} kept ${after.get(pieces[0])} of its ${before.get(pieces[0])} fronts (${out.map((o) => `${o.bed.name} at ${o.bed.x.toFixed(2)}, ${o.bed.z.toFixed(2)}`)})`);
  }
});
/** The living room of L39.f1.r5 as the furnisher leaves it (a courtyard flat, a 4.62 x 3.89 m room, two children): the sofa against the north wall with 0.7 m between it and the table, a strip with a lane out at each end. */
const SOFA_STRIP = { type: 'living', floor: 1, y: 2.8, lot: 'courtyard', rect: { x0: -2.15, z0: -4.78, x1: 2.47, z1: -0.89 }, doors: [[2.53, -1.78, 0.9, 'interior', true], [-2.2, -1.39, 0.85, 'interior']], windows: [[0, -4.89, 1.67, 1.02, 1.13]],
  put: [['tv_stand', 0.16, -1.1, 3.142], ['sofa_3_fabric', 0.16, -4.31, 0], ['side_table', 1.41, -4.21, 0, 2], ['armchair_fabric', -1.73, -3.48, 1.571, 2], ['wall_unit_small', 2.25, -3.08, -1.571, 1], ['lamp_floor', -1.965, -4.605, 1.571, 2],
    ['side_table', -1.11, -4.36, 0, 2], ['plant_big', 2.1, -4.42, 0, 2], ['plant_pot_clay', 2.285, -1.065, -1.571, 2], ['toy_pile', 1.41, -3.71, 0, 2], ['table_wood_6', 0.15, -2.705, 0], ['stool_wood', 1.145, -2.705, -1.571, 2],
    ['chair_wood', -0.92, -2.705, 1.571, 2], ['school_bag', 0.15, -3.245, 0, 2], ['box_cardboard_m', 1.4, -1.1, 3.142, 2]] };
/** The strip's west lane holds `lane` (a piece: [name, x, z, ry, prio]) where SOFA_STRIP has the chair of the table's west end. */
const stripRoom = (lane) => ({ ...SOFA_STRIP, put: SOFA_STRIP.put.map((p) => (p[0] === 'chair_wood' ? lane : p)) });
const sitters = (h, out) => { for (const i of h.L.items) if (i.floor && i.c.seat) assert.ok(hasSitAnchor(h.L, i), `the ${i.name} at ${i.x.toFixed(2)}, ${i.z.toFixed(2)} has no sitter after the beds (${out.map((o) => `${o.bed.name} at ${o.bed.x.toFixed(2)}, ${o.bed.z.toFixed(2)}`)})`); };
test('a bed set down late takes no seat from a table and seals no sofa in: the chair of the strip\'s lane stays or the bed does not (the living room of L39.f1.r5 had no sit anchor for its sofa, and one seat at its table)', () => {
  const h = homeRoom(SOFA_STRIP, 1, { kids: 2 }), sofa = h.L.items.find((i) => i.name === 'sofa_3_fabric'), [table] = tableOf(h.L);
  assert.ok(sofa && hasSitAnchor(h.L, sofa), 'the setup: the sofa has a sitter before the bed');
  assert.equal(seatedAt(h.L, table).length, 2, 'the setup: the table has two seats');
  const out = kidsPass(h);
  assert.ok(out.length >= 1 && out.every((o) => CHILD_BED.test(o.bed.name)), `the children sleep somewhere (${out.map((o) => o.bed.name)})`);
  assert.equal(seatedAt(h.L, table).length, 2, `the table keeps its two seats (${out.map((o) => `${o.bed.name} at ${o.bed.x.toFixed(2)}, ${o.bed.z.toFixed(2)}`)})`);
  sitters(h, out);
});
test('what would seal the sofa in goes, the bed stays: a box that stood in the strip\'s lane is dropped when the bed leaves it no room (decoration gives way to a child\'s bed)', () => {
  const h = homeRoom(stripRoom(['box_cardboard_m', -0.92, -2.705, 1.571, 2]), 1, { kids: 2 }), sofa = h.L.items.find((i) => i.name === 'sofa_3_fabric');
  assert.ok(sofa && hasSitAnchor(h.L, sofa), 'the setup: the sofa has a sitter before the bed');
  const out = kidsPass(h);
  assert.ok(out.some((o) => o.bed.name !== 'mattress_leaning'), `a real bed, not a mattress on its edge (${out.map((o) => o.bed.name)})`);
  sitters(h, out);
});
test('a sofa\'s, an armchair\'s and a school desk\'s sit anchor stands where the furnisher asked whether it could be reached: seatZoff behind the middle (rooms.js shutAmong and index.js emitAnchors ask about the same floor: L39.f1.r5\'s sofa passed one and was shut in by the other)', () => {
  let seats = 0, anchors = 0;
  const off = [];
  for (const bp of bps) for (const [rid, L] of bp.interior?.layouts ?? []) for (const it of L.items) {
    if (!it.floor || !it.c.seat || seatZoff(it.c) === 0) continue;
    seats++;
    const points = seatOffsets(it.c).map((ox) => L.rel(it, ox, seatZoff(it.c)));
    for (const a of bp.anchors.filter((q) => q.item === it.id)) {
      anchors++;
      const [lx, , lz] = bp.frame.toLocal(a.x, a.y, a.z);
      if (!points.some(([sx, sz]) => Math.hypot(sx - lx, sz - lz) < 0.01)) off.push(`${bp.id} ${rid} ${it.name}: a ${a.kind} anchor at ${lx.toFixed(2)}, ${lz.toFixed(2)}, the seat points are ${points.map((p) => p.map((v) => v.toFixed(2)).join(', ')).join(' | ')}`);
    }
  }
  console.log(`# sofas, armchairs and school desks: ${seats}, ${anchors} sit anchors, ${off.length} off the seat point`);
  assert.ok(seats >= 150 && anchors >= 150, `${seats} such seats and ${anchors} anchors to look at`);
  assert.deepEqual(off, [], `${off.length} sit anchors are not at the point the furnisher checked:\n  ${off.slice(0, 8).join('\n  ')}`);
});
test('a living room that holds a bunk or a crib is a child\'s room for the clothes pass, as a bedroom is: no adult clothes where a child sleeps (interiors-garments.test.mjs held the sala of one home to it)', () => {
  assert.equal(isChildRoom({ role: null, items: [{ name: 'bed_bunk' }] }, 'living'), true, 'a bunk in the sala');
  assert.equal(isChildRoom({ role: null, items: [{ name: 'bed_crib' }] }, 'living'), true, 'a crib in the sala');
  assert.equal(isChildRoom({ role: null, items: [{ name: 'bed_single' }] }, 'living'), false, 'a single is anyone\'s');
  assert.equal(isChildRoom({ role: null, items: [{ name: 'bed_bunk' }] }, 'kitchen'), false, 'no bed in a kitchen counts');
  assert.equal(isChildRoom({ role: 'master', items: [{ name: 'bed_bunk' }] }, 'bedroom'), true, 'a bunk in a bedroom, as before');
});

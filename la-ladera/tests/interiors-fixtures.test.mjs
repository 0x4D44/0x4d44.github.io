// INTERIORS fixtures: the pieces a room is defined by (a kitchen's stove and sink, a bathroom's toilet, basin and shower, a bedroom's bed, a home's fridge)
// are there however small A2's plan made the room, and healing a split room never takes the stove out before the clutter, the counters or the fridge.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-fixtures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout, fixtureRank, mkObb, obbDist } from '../js/interiors/layout.js';
import { bathroom, ensureFixtures, ensureHomeFridge, solveFixtures, slot, kitchenSlots, REAL_BED, SHOWER } from '../js/interiors/rooms.js';
import { makeRng } from '../js/core/rng.js';
import { barberChair } from '../js/interiors/shops.js';
import { standSpots } from '../js/interiors/reach.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf, KNEEHOLE } from '../js/interiors/carcass.js';
import { furnishedBatch } from './interiors-lib.mjs';

/** A hand-made kitchen shaped like A2's L25 one (1.93 x 5.43 m, two doors in the -x wall and one in the +z wall): the run of sink, stove and counter on the -x wall
 *  and the fridge across from it leave 0.65 m between them, under the 0.8 m a body needs, so the doors at either end of the room are cut apart. */
function narrowKitchen() {
  const rect = { x0: 0.1, z0: -4.03, x1: 2.03, z1: 1.4044 };
  const room = { id: 'T.f0.r2', type: 'kitchen', floor: 0, rect, y: 0, h: 2.6 };
  const bp = {
    id: 'T', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    doors: [{ id: 'd1', x: 0.1, z: 0.85, w: 0.9, rooms: [room.id] }, { id: 'd2', x: 0.1, z: -3.31, w: 0.9, rooms: [room.id] }, { id: 'd3', x: 1.07, z: 1.4044, w: 1.2, rooms: [room.id] }],
  };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {} } });
  const put = (name, x, z, ry, prio = 0) => L.at(name, x, z, ry, { force: true, prio });
  const run = { sink: put('sink_kitchen', 0.38, -2.16, 1.57), stove: put('stove_gas', 0.41, -1.26, 1.57), counter: put('counter_base', 0.41, -0.66, 1.57) };
  const extras = [put('pantry_cabinet', 1.79, -2.98, -1.57, 2), put('water_stand', 1.87, -3.86, 0, 2), put('gas_cylinder', 0.27, -0.12, 1.57, 1)];
  const fridge = put('fridge', 1.68, 0.2, -1.57);
  return { L, ...run, fridge, extras };
}

test('fixtureRank: the stove, sink, toilet and beds outlast the fridge, basin and shower, and those outlast everything else', () => {
  const r = (name) => fixtureRank({ name });
  for (const n of ['stove_gas', 'sink_kitchen', 'sink_small', 'lavadero', 'toilet', 'bed_single', 'bed_double_wood', 'bed_cot', 'mattress_leaning']) assert.equal(r(n), 3, n);
  for (const n of ['shower_tray', 'shower_small', 'basin_pedestal', 'basin_vanity']) assert.equal(r(n), 2, n);
  assert.equal(r('fridge'), 1);
  assert.equal(r('fridge_small'), 1);
  for (const n of ['counter_base', 'pantry_cabinet', 'table_formica_4', 'gas_cylinder', 'wardrobe_2', 'towel_rail']) assert.equal(r(n), 0, n);
});

/** A2's 2.02 x 1.41 rowhouse bathroom (L24.f0.r4): one door in the short -x wall that takes 0.9 m of its 1.41 m and swings into the room around a hinge at one end of it. */
function narrowBath(hinge) {
  const rect = { x0: 0.01, z0: -4.03, x1: 2.03, z1: -2.623 };
  const room = { id: 'B.f0.r4', type: 'bathroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = {
    id: 'B', rooms: [room], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    windows: [{ room: room.id, x: 1.0, z: -4.03, w: 0.64, y: 1.57, h: 0.5 }],
    doors: [{ id: 'B.d4', kind: 'interior', x: -0.05, z: -3.33, w: 0.9, rooms: ['B.f0.r3', room.id], swing: 1, hinge }],
  };
  const hh = { tints: {}, income: 0 };
  return { bp, room, hh, L: new Layout({ bp, room, rng: makeRng(5), hh }) };
}
const box = (x, z, s = 0.2) => mkObb(x, z, s, s, 0);

test('sweepKeeps(): the leaf\'s quarter disc and a 0.7 m lane stay blocked, the far corner of the whole-door rectangle is free', () => {
  // door 0.9 m wide at z -3.78..-2.88 in the -x wall; the hinge post is at the low end (left) or the high end (right) of it
  for (const [hinge, nearHinge, farCorner] of [['left', [0.85, -3.7], [0.85, -2.95]], ['right', [0.85, -2.96], [0.85, -3.7]]]) {
    const { L } = narrowBath(hinge);
    assert.ok(L._keepHit(box(...farCorner)), `${hinge}: the rectangle of width + 0.08 m covers the far corner`);
    assert.equal(L.sweepKeeps(), 1, `${hinge}: one door's rectangle replaced`);
    assert.ok(L._keepHit(box(0.4, -3.3)), `${hinge}: the lane in front of the opening stays`);
    assert.ok(L._keepHit(box(...nearHinge)), `${hinge}: the quarter disc around the hinge post stays (the leaf passes there)`);
    assert.equal(L._keepHit(box(...farCorner)), null, `${hinge}: away from the hinge, outside the lane and the disc, the floor is free`);
  }
});

test('solveFixtures(): a 2.0 x 1.4 m bathroom whose door takes most of one wall holds shower, toilet and basin - and nothing stands under the leaf', () => {
  for (const hinge of ['left', 'right']) {
    const { L, hh } = narrowBath(hinge), E = {};
    bathroom(L, E, hh);
    ensureFixtures(L, E, hh, bathroom);
    const names = L.items.map((i) => i.name);
    assert.ok(names.some((n) => SHOWER.test(n)), `${hinge}: a shower (${names.join(', ')})`);
    assert.ok(names.includes('toilet'), `${hinge}: a toilet (${names.join(', ')})`);
    assert.ok(names.some((n) => /^basin_/.test(n)), `${hinge}: a basin (${names.join(', ')})`);
    assert.ok(names.includes('shower_head_electric'), `${hinge}: the shower head on the wall (${names.join(', ')})`);
    L.sweepKeeps();
    for (const it of L.items.filter((i) => i.floor && i.block)) assert.equal(L._keepHit(it.ob, 0.05), null, `${hinge}: ${it.name} at ${it.x},${it.z} stands in the door's sweep or in the opening`);
  }
});

/** A2's 2.02 x 1.82 house bathroom (test lot A00.f0.r4): a window in each of two walls and the door in the third, so the shower in its corner has no free wall beside it for the head. */
function windowedBath(seed) {
  const rect = { x0: -2.78, z0: -4.78, x1: -0.76, z1: -2.9628 };
  const room = { id: 'W.f0.r4', type: 'bathroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = {
    id: 'W', rooms: [room], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    windows: [{ room: room.id, x: -1.39, z: -4.78, w: 0.6, y: 1.59, h: 0.51 }, { room: room.id, x: -2.78, z: -3.87, w: 0.66, y: 1.57, h: 0.53 }],
    doors: [{ id: 'W.d4', kind: 'interior', x: -0.76, z: -3.87, w: 0.9, rooms: ['W.f0.r3', room.id], swing: 1, hinge: 'left' }],
  };
  const hh = { tints: {}, income: 0 };
  return { L: new Layout({ bp, room, rng: makeRng(seed), hh }), hh };
}

test('ensureFixtures(): a bathroom whose walls beside the shower are taken by two windows and the door still gets its head, up over the tray (A00.f0.r4 had none)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { L, hh } = windowedBath(seed), E = {};
    bathroom(L, E, hh);
    ensureFixtures(L, E, hh, bathroom);
    const tray = L.items.find((i) => SHOWER.test(i.name)), head = L.items.find((i) => i.name === 'shower_head_electric');
    assert.ok(tray, `seed ${seed}: a shower (${L.items.map((i) => i.name)})`);
    assert.ok(head, `seed ${seed}: the shower head on the wall (${L.items.map((i) => i.name)})`);
    assert.ok(Math.hypot(head.x - tray.x, head.z - tray.z) < 1.0, `seed ${seed}: the head is ${Math.hypot(head.x - tray.x, head.z - tray.z).toFixed(2)} m from the tray`);
  }
});

test('solveFixtures(): a roomy bathroom keeps the clearances in front of its fixtures (the gentlest rung wins)', () => {
  const rect = { x0: 0, z0: 0, x1: 2.6, z1: 2.4 };
  const room = { id: 'R.f0.r1', type: 'bathroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'R', rooms: [room], stairs: [], entrances: [], windows: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'R.d1', kind: 'interior', x: 1.3, z: 2.45, w: 0.9, rooms: ['R.f0.r0', room.id], swing: 1, hinge: 'left' }] };
  const L = new Layout({ bp, room, rng: makeRng(2), hh: { tints: {}, income: 0 } });
  const got = solveFixtures(L, [slot(['shower_tray', 'shower_small'], { at: 'corner' }), slot(['toilet'], { at: 'center' }), slot(['basin_pedestal'])]);
  assert.ok(got && got.every(Boolean), 'all three placed');
  for (const it of got) assert.ok(it.zones.length > 0, `${it.name} keeps the clearance in front of it`);
});

test('heal(): a kitchen whose doors a fridge cuts apart loses the clutter, the counter and the fridge - never the stove or the sink', () => {
  const { L, sink, stove, counter, fridge, extras } = narrowKitchen();
  assert.equal(L.connectivity().ok, false, 'the setup must split the room: the fridge sits across from the run');
  const removed = L.heal();
  assert.equal(L.connectivity().ok, true, 'healed: every door reaches every other');
  assert.ok(L.items.includes(stove), `the stove survives (removed: ${removed.map((i) => i.name).join(', ')})`);
  assert.ok(L.items.includes(sink), `the sink survives (removed: ${removed.map((i) => i.name).join(', ')})`);
  for (const e of extras) assert.ok(removed.includes(e), `the clutter goes first: ${e.name}`);
  assert.ok(removed.includes(counter) || removed.includes(fridge), 'the counter or the fridge pays for the lane');
});

/** A bare room with one interior door, for the placement tests: pieces go in at exact poses (`put`, unchecked) and heal() is asked what it takes out. */
function bareRoom(id, type, rect, door) {
  const room = { id, type, floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'T', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'T.d1', kind: 'interior', w: 0.9, rooms: ['T.r0', id], swing: 1, hinge: 'left', ...door }] };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {} } });
  return { L, put: (name, x, z, ry, prio = 0) => L.at(name, x, z, ry, { force: true, prio }) };
}
/** Where the cook stands at a stove: the spot index.js `emitAnchors` asks for, 0.5 m off its face, snapped to the floor a 0.34 m body can reach (null: nowhere). */
const cookSpot = (L, stove) => { const [x, z] = L.rel(stove, 0, stove.d / 2 + 0.5); return L.snapStand(x, z, L.connectivity(0.34)); };
const off = (spot, it) => Math.hypot(spot[0] - it.x, spot[1] - it.z);

test('tables block: a table with a cloth (`top: <material>`) is an obstacle like any other, only what stands ON a surface (`top: true`) is not', () => {
  const { L, put } = bareRoom('T.r4', 'kitchen', { x0: 0, z0: 0, x1: 4, z1: 3 }, { x: -0.05, z: 1.5 });
  const cloths = Object.entries(CATALOG).filter(([, c]) => typeof c.top === 'string').map(([name]) => name);
  assert.ok(cloths.length >= 3, `the library has tables with a cloth (${cloths})`);
  for (const name of cloths) {
    const it = put(name, 2, 1.5, 0);
    assert.ok(it.block && L.blockers().includes(it), `${name} blocks (it was walked through: its cloth made \`top\` truthy)`);
    const c = L.connectivity(), [ix, iz] = c.cellOf(2, 1.5);
    assert.equal(c.blk[iz * c.nx + ix], 1, `${name}: the floor under it is not free in the connectivity grid`);
    L.remove(it);
  }
  assert.equal(put('tv_flat', 2, 1.5, 0).block, false, 'a television on a table stands on a surface and blocks nothing');
});

test('heal(): a stove whose front a table walls off from the door loses the table, not the gas bottle beside it (A37.f2.r2, a bed-sitting room, had no cook)', () => {
  // 5.22 x 2.31 m, the door in the -x wall; the run (counter, stove, counter) on the -z wall at the far end, the single bed on the +z wall under it, and the table at the other end of the run:
  // the table's corner and the bed's corner are 0.71 m apart across the aisle, under the 0.68 m a 0.34 m body needs along the grid, so the stove's front is a pocket
  const { L, put } = bareRoom('T.f2.r2', 'bedroom', { x0: 0.81, z0: 4.4725, x1: 6.03, z1: 6.78 }, { x: 0.75, z: 5.63 });
  const bed = put('bed_single_metal', 5.045, 6.305, -1.571), run = [put('counter_base', 5.73, 4.778, 0), put('counter_base', 4.53, 4.778, 0)], stove = put('stove_gas', 5.13, 4.788, 0);
  const bottle = put('gas_cylinder', 3.97, 4.643, 0, 1), table = put('table_formica_4', 3.26, 4.83, 0, 1);
  assert.equal(cookSpot(L, stove), null, 'the setup shuts the cook out: no standing spot within 0.9 m of the cook point');
  assert.equal(L._accessOk(stove, true), false);
  const removed = L.heal();
  assert.deepEqual(removed.map((i) => i.name), ['table_formica_4'], 'the one piece whose going frees the cook, and nothing else');
  assert.ok(removed[0] === table);
  for (const it of [bed, stove, bottle, ...run]) assert.ok(L.items.includes(it), `${it.name} stays`);
  assert.ok(cookSpot(L, stove), 'the cook has somewhere to stand');
  assert.equal(L._accessOk(stove, true), true);
});

test('heal(): a table pushed up to a stove is taken out - the cook stands within 1.2 m of the stove (A38.f0.r4)', () => {
  // 3.4 x 2.7 m kitchen; the stove on the -z wall and a table 4 cm off its face: the floor beyond the table is free, so the cook can be put there, 1.3 m from the stove
  const { L, put } = bareRoom('T.r2', 'kitchen', { x0: 0, z0: 0, x1: 3.4, z1: 2.7 }, { x: 3.45, z: 1.8 });
  const stove = put('stove_gas', 1.7, 0.315, 0), table = put('table_formica_4', 1.7, 1.015, 0, 1);
  const before = cookSpot(L, stove);
  assert.ok(before && off(before, stove) > 1.2, `the setup leaves the cook only a spot past the table (${before})`);
  assert.equal(L._accessOk(stove, true), false, 'a spot 1.3 m from the stove is no way to cook at it');
  assert.deepEqual(L.heal(), [table]);
  const after = cookSpot(L, stove);
  assert.ok(after && off(after, stove) <= 1.2, `the cook stands at the stove now (${after})`);
});

test('heal(): a stove at the end of a galley 0.79 m wide - a way through for a 0.34 m body, not for a 0.4 m one - takes nothing out of the room', () => {
  // counters along both long walls with the aisle between them (z 0.625 to 1.415) and the stove at the far end of the north run: the cook's spot is 2.7 m into the aisle from where it opens
  const { L, put } = bareRoom('T.r3', 'kitchen', { x0: 0, z0: 0, x1: 4.6, z1: 2.6 }, { x: -0.05, z: 1.3 });
  const stove = put('stove_gas', 3.7, 0.315, 0), bottle = put('gas_cylinder', 4.3, 2.2, 0, 1);
  for (const x of [1.3, 1.9, 2.5, 3.1, 4.3]) put('counter_base', x, 0.305, 0);
  for (const x of [1.3, 1.9, 2.5, 3.1, 3.7]) put('counter_base', x, 1.715, 0);
  const spot = cookSpot(L, stove), [fx, fz] = L.rel(stove, 0, stove.d / 2 + 0.5);
  assert.ok(spot && off(spot, stove) <= 1.2, `the setup leaves the cook a place in the aisle (${spot})`);
  assert.equal(L.snapStand(fx, fz, L.connectivity()), null, 'the premise: the 0.4 m body of the doors\' lanes cannot get in');
  assert.equal(L._accessOk(stove, true), true);
  assert.deepEqual(L.heal(), [], 'nothing walls the cook in: the room stays as furnished');
  assert.ok(L.items.includes(bottle));
});

test('heal(): a bed walled in by a wardrobe 2.7 m from its middle - past a neighbour\'s 2.2 m - gets its way back', () => {
  const { L, put } = bareRoom('T.r1', 'bedroom', { x0: 0, z0: 0, x1: 5.2, z1: 2.3 }, { x: -0.05, z: 1.15 });
  const bed = put('bed_single_metal', 4.7, 1.15, 0), wardrobe = put('wardrobe_2', 2.0, 1.15, Math.PI / 2, 1);       // (the bed across the room's depth at the far end, the wardrobe across it between the two)
  assert.equal(L._accessOk(bed, true), false, 'the wardrobe across the room cuts the bed off from the door');
  assert.deepEqual(L.heal(), [wardrobe]);
  assert.equal(L._accessOk(bed, true), true);
  assert.ok(L.items.includes(bed), 'the bed stays');
});

// ---------------------------------------------------------------- the census over every A2 plan (R4-003 / R4-005 / R4-103): what a room is defined by is there
// No tolerance list: a room the plan leaves no wall for is the plan's to change (dev/REQUESTS.md), not this file's to excuse.
const real = (await furnishedBatch({ real: true })).bps;
const has = (L, re) => L.items.some((i) => re.test(i.name));
const NOT_HOMES = new Set(['chapel', 'school', 'clinic', 'hall']);
const STORAGE = /^(wardrobe|dresser|chest_trunk|coat_rack)/;                  // somewhere to keep clothes: a wardrobe, a dresser, a trunk, pegs on the wall
/** The rooms of every real plan that lack a fixture, as 'kind building.room WxD [items]' lines, by fixture. */
function census(bps) {
  const out = { wc: [], basin: [], shower: [], showerhead: [], stove: [], sink: [], fridge: [], bed: [], storage: [], light: [] };
  const note = (k, bp, rid, L) => out[k].push(`${bp.id}.${rid} ${L.W.toFixed(2)}x${L.D.toFixed(2)} [${L.items.filter((i) => i.floor).map((i) => i.name).join(',')}]`);
  for (const bp of bps) {
    const I = bp.interior; if (!I?.layouts) continue;
    const kind = bp.lot?.kind, home = !NOT_HOMES.has(kind) && !I.shopType;
    let fridge = false;
    for (const [rid, L] of I.layouts) {
      if (has(L, /^fridge/)) fridge = true;
      if (kind === 'unfinished' && (L.room.outdoor || L.room.floor > 0)) continue;          // the building site is furnished with cement sacks on purpose
      const t = L.room.type;
      if (t === 'bathroom') {
        if (!has(L, /^toilet$/)) note('wc', bp, rid, L);
        if (!has(L, /^basin_/)) note('basin', bp, rid, L);
        if (kind !== 'school') {                                                              // a school's lavatory has no shower (interiors-school.test.mjs asserts the inverse: toilets, basins, a mirror, no shower)
          if (!has(L, SHOWER)) note('shower', bp, rid, L); else if (!has(L, /^shower_head_electric$/)) note('showerhead', bp, rid, L);
        }
      }
      if (t === 'kitchen') {
        if (!has(L, /^stove_/)) note('stove', bp, rid, L);
        if (!has(L, /^sink_|^lavadero$/)) note('sink', bp, rid, L);
      }
      if (t === 'bedroom' && I.rooms[rid]?.role && !has(L, REAL_BED)) note('bed', bp, rid, L);       // the plan's classrooms and exam rooms typed 'bedroom' have no role
      if (t === 'bedroom' && I.rooms[rid]?.role && !has(L, STORAGE)) note('storage', bp, rid, L);
      if (t === 'bedroom' && I.rooms[rid]?.role && !L.fixture) note('light', bp, rid, L);
    }
    if (home && !fridge) out.fridge.push(`${bp.id} (${bp.lot?.kind})`);
  }
  return out;
}
const found = census(real);
const none = (what, list) => assert.equal(list.length, 0, `${list.length} ${what}:\n  ${list.slice(0, 12).join('\n  ')}${list.length > 12 ? '\n  ...' : ''}`);

test('census: every bathroom of every plan has a toilet and a basin, and every home\'s a shower with its electric head', () => {
  none('bathrooms without a toilet', found.wc);
  none('bathrooms without a basin', found.basin);
  none('bathrooms without a shower', found.shower);
  none('showers without a head on the wall', found.showerhead);
});

test('census: every kitchen of every plan has a stove and a sink, and every home has a fridge somewhere', () => {
  none('kitchens without a stove', found.stove);
  none('kitchens without a sink', found.sink);
  none('homes without a fridge', found.fridge);
});

test('census: every bedroom whose walls and doors leave room for a bed has one (the pipeline never misses a bed the solver can place)', () => {
  const missed = [];
  for (const bp of real) for (const [rid, L0] of bp.interior?.layouts ?? []) {
    if (L0.room.type !== 'bedroom' || !bp.interior.rooms[rid]?.role || has(L0, REAL_BED)) continue;
    const L = new Layout({ bp, room: bp.rooms.find((r) => r.id === rid), rng: makeRng(11), hh: L0.hh });          // the empty room, as A2 drew it
    const got = solveFixtures(L, [slot(['bed_single', 'bed_single_metal', 'bed_cot', 'bed_bunk'], { alongToo: true })], { maxRung: 3 });
    if (got) missed.push(`${bp.id}.${rid}: ${got[0].name} fits at ${got[0].x},${got[0].z}`);
  }
  none('bedrooms with only a leaned mattress that the solver can give a bed', missed);
});

test('census: every bedroom of every plan has a real bed (a frame, a bunk or a cot - not a mattress leaned on the wall)', () => {
  none('bedrooms without a real bed (A2: door positions, REQUESTS "A3 -> A2 (R4-103")', found.bed);
});

test('census: every bedroom of every plan has somewhere to keep clothes (a wardrobe, a dresser, a trunk or pegs on the wall) and a light - the 5 to 7 m2 bedrooms of the shop homes and flats had no storage', () => {
  none('bedrooms with nowhere to keep clothes', found.storage);
  none('bedrooms without a ceiling light', found.light);
});

test('the last resort of a bedroom is a trunk where one fits and pegs on the wall only where none does: most bedrooms without a wardrobe or dresser keep their clothes in a trunk', () => {
  let bare = 0, trunk = 0;
  for (const bp of real) for (const [rid, L] of bp.interior?.layouts ?? []) {
    if (L.room.type !== 'bedroom' || !bp.interior.rooms[rid]?.role || has(L, /^(wardrobe|dresser)/)) continue;
    bare++; if (has(L, /^chest_trunk$/)) trunk++;
  }
  assert.ok(bare >= 50, `${bare} bedrooms without a wardrobe or dresser to look at`);
  assert.ok(trunk >= bare * 0.5, `${trunk} of ${bare} bedrooms without a wardrobe or dresser have a trunk (about 60% when this was written; the rest have pegs)`);
});

test('study desks: a student\'s, a teenager\'s or a child\'s bedroom of 8 m2 or more keeps its desk, and the desk its chair (storage placed first once took the desk\'s wall: 2 desks left where 11 had stood)', () => {
  const STUDY = new Set(['teen', 'student', 'study', 'child']);
  let rooms = 0, desks = 0, seated = 0;
  for (const bp of real) for (const [rid, L] of bp.interior?.layouts ?? []) {
    if (L.room.type !== 'bedroom' || !STUDY.has(bp.interior.rooms[rid]?.role) || L.W * L.D < 8) continue;
    rooms++;
    const desk = L.items.find((i) => i.floor && /^desk_/.test(i.name));
    if (desk) { desks++; if (L.items.some((i) => i.floor && /^chair_/.test(i.name) && Math.hypot(i.x - desk.x, i.z - desk.z) < 1.0)) seated++; }
  }
  assert.ok(rooms >= 15, `${rooms} study bedrooms of 8 m2 or more to look at`);
  assert.ok(desks >= rooms * 0.35, `${desks} of ${rooms} study bedrooms have their desk (41% when this was written; 32% before the desk came first, 14% when a trunk took its wall)`);
  assert.ok(seated >= desks * 0.6, `${seated} of ${desks} desks have a chair within a metre of them`);
});

test('census: the deck in front of every roof door is clear - no piece of furniture within 0.9 m of the landing, and the terrace is still furnished (A5, R2a)', () => {
  const near = [], bare = [];
  let doors = 0;
  for (const bp of real) for (const e of (bp.entrances ?? []).filter((x) => x.kind === 'roof')) {
    doors++;
    const [lx, , lz] = bp.frame.toLocal(...e.outside);
    const L = [...bp.interior.layouts.values()].find((l) => lx >= l.r.x0 - 0.05 && lx <= l.r.x1 + 0.05 && lz >= l.r.z0 - 0.05 && lz <= l.r.z1 + 0.05 && l.room.type === 'terrace');
    assert.ok(L, `${bp.id}: the landing of ${e.doorId} lies in no terrace`);
    for (const it of L.items) if (it.floor && it.c.size[1] >= 0.05 && obbDist(it.ob, lx, lz) < 0.88) near.push(`${it.id} ${it.name} ${obbDist(it.ob, lx, lz).toFixed(2)} m from the landing of ${e.doorId}`);
    if (L.items.filter((i) => i.floor).length < 3) bare.push(`${L.room.id} has ${L.items.filter((i) => i.floor).length} floor items`);
  }
  assert.ok(doors >= 50, `the real plans have roof doors (${doors})`);
  none('things on a roof door\'s landing', near);
  none('terraces left bare by the clear landing', bare);
});

// ---------------------------------------------------------------- what a shop is defined by (R4 round 2: restaurante L81 had no table, L14 a table with one chair, barber L05 no chair)
const shopRooms = (...types) => real.flatMap((bp) => (types.includes(bp.interior?.shopType) ? [...bp.interior.layouts].filter(([, L]) => L.room.type === 'shop').map(([rid, L]) => ({ bp, rid, L })) : []));

test('census: every restaurante and cafe has its counter and a table, and every table has two chairs a person can walk up to', () => {
  const dining = shopRooms('restaurante', 'cafe'), bad = [];
  assert.ok(dining.length >= 4, `the real plans have restaurants and cafes (${dining.length})`);
  for (const { bp, rid, L } of dining) {
    const tables = L.items.filter((i) => i.floor && /^table_/.test(i.name)), where = `${bp.id}.${rid} ${bp.interior.shopType} ${L.W.toFixed(2)}x${L.D.toFixed(2)}`;
    if (!L.items.some((i) => i.floor && i.flags?.counter)) bad.push(`${where}: no counter`);
    if (!tables.length) bad.push(`${where}: no table`);
    for (const t of tables) {
      const chairs = L.items.filter((c) => c.floor && c.c.arch === 'chair' && Math.hypot(c.x - t.x, c.z - t.z) < 0.9 && L._accessOk(c, true));
      if (chairs.length < 2) bad.push(`${where}: ${t.id} has ${chairs.length} chair(s) a person can reach`);
    }
  }
  none('dining shops short of a counter, a table or its chairs', bad);
});

test('census: a restaurante seats at least two tables, each with two chairs a person can walk up to (R4-117: L14 had one, which reads as a counter cafe)', () => {
  const rest = shopRooms('restaurante'), bad = [];
  assert.ok(rest.length >= 2, `the real plans have restaurants (${rest.length})`);
  for (const { bp, rid, L } of rest) {
    const tables = L.items.filter((i) => i.floor && /^table_/.test(i.name));
    const seated = tables.filter((t) => L.items.filter((c) => c.floor && c.c.arch === 'chair' && Math.hypot(c.x - t.x, c.z - t.z) < 0.9 && L._accessOk(c, true)).length >= 2);
    if (seated.length < 2) bad.push(`${bp.id}.${rid} ${L.W.toFixed(2)}x${L.D.toFixed(2)}: ${seated.length} seated table(s) of ${tables.length}`);
  }
  none('restaurants with fewer than two seated tables', bad);
});

test('barberChair(): in a 1.93 m wide shop the chair stands where the aisle behind it stays walkable, so healing never has to take it out', () => {
  const rect = { x0: 0, z0: 0, x1: 1.93, z1: 5.2 };                                       // A2's L05: a long wall for the chair, the street shutter at one end, a door on the other wall
  const room = { id: 'B.f0.r2', type: 'shop', floor: 0, rect, y: 0, h: 2.6 };
  const bp = {
    id: 'B', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    doors: [{ id: 'd1', kind: 'interior', x: 1.93, z: 2.9, w: 0.9, rooms: [room.id], swing: 0 }, { id: 'd2', kind: 'shutter', x: 0.96, z: 5.2, w: 1.8, rooms: [room.id] }],
  };
  const L = new Layout({ bp, room, rng: makeRng(3), hh: { tints: {} } });
  const chair = barberChair(L, '-x');
  assert.ok(chair, 'a chair fits the long wall');
  assert.ok(L.connectivity().ok, 'both doors still connect');
  assert.deepEqual(L.heal(), [], 'healing has nothing to take out');
  assert.ok(L.items.includes(chair), 'the chair is still there');
});

/** The correlated colour temperature (K) of an sRGB hex colour, by McCamy's formula from its CIE chromaticity. A candle is 1900 K, a bulb 2700, daylight 6500, a blue-white tube 7000 and over. */
function kelvin(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin((hex >> 16) & 255), g = lin((hex >> 8) & 255), b = lin(hex & 255);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b, s = X + Y + Z;
  const n = (X / s - 0.3320) / (0.1858 - Y / s);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

test('census: every ceiling tube is warm white (2700 to 3300 K), never the blue-white that lit the shops cold from the street at night (R1-D19)', () => {
  const bad = [];
  let tubes = 0, shops = 0;
  assert.ok(kelvin(0xeaf2ff) > 6500 && kelvin(0xffd9a0) < 4500 && kelvin(0xffa850) < 2600, 'the colour formula tells blue-white from warm');
  for (const bp of real) for (const L of bp.interior.layouts.values()) {
    for (const f of [L.fixture, ...(L.extra ?? [])]) {
      if (f?.kind !== 'tube') continue;
      tubes++; if (L.room.type === 'shop') shops++;
      const hex = f.light?.color ?? f.color, k = kelvin(hex);
      if (!(k >= 2700 && k <= 3300)) bad.push(`${bp.id}.${L.room.id} (${L.room.type}): ${hex.toString(16)} = ${Math.round(k)} K`);
    }
  }
  assert.ok(tubes >= 100 && shops >= 20, `the real plans have ceiling tubes (${tubes}, ${shops} of them in shops)`);
  none('ceiling tubes that are not warm white', bad);
});

test('census: every peluqueria has a barber chair that healing left in place, and a mirror on the wall', () => {
  const bad = [], barbers = shopRooms('peluqueria');
  assert.ok(barbers.length >= 2, `the real plans have barbers (${barbers.length})`);
  for (const { bp, rid, L } of barbers) {
    const where = `${bp.id}.${rid} ${L.W.toFixed(2)}x${L.D.toFixed(2)}`;
    if (!L.items.some((i) => i.floor && i.name === 'barber_chair')) bad.push(`${where}: no barber chair (healing took out: ${bp.interior.rooms[rid].removed.join(', ') || 'nothing'})`);
    if (!L.items.some((i) => i.name === 'mirror_barber')) bad.push(`${where}: no mirror`);
  }
  none('barbers without a chair or a mirror', bad);
});

// ---------------------------------------------------------------- the safety nets behind the census: they must still catch what the real plans no longer need today
// The real plans hold every fixture without them (the census above passes with both turned off), so each net is tried on the plans with the thing it catches taken out.
const stateOf = (layouts) => layouts.map((L) => ({ L, items: L.items.slice(), decor: Object.fromEntries(Object.entries(L.decor).map(([k, v]) => [k, v.slice()])) }));
const putBack = (saved) => { for (const { L, items, decor } of saved) { L.items = items; for (const k of Object.keys(decor)) L.decor[k] = decor[k]; } };
const FRIDGE = /^fridge/;
/** Run `fn(I, built)` on every real home that has a fridge, with every fridge taken out of it first and the layouts put back after. */
function withoutFridges(rooms, fn) {
  let homes = 0;
  for (const bp of real) {
    const I = bp.interior; if (!I?.layouts || NOT_HOMES.has(bp.lot?.kind) || I.shopType) continue;
    const layouts = [...I.layouts.values()];
    if (!layouts.some((L) => has(L, FRIDGE))) continue;
    homes++;
    const saved = stateOf(layouts);
    try {
      for (const L of layouts) for (const f of L.items.filter((i) => FRIDGE.test(i.name))) L.remove(f);
      fn(bp, [...I.layouts].filter(([, L]) => rooms(L.room)).map(([, L]) => ({ room: L.room, hh: L.hh, L })));
    } finally { putBack(saved); }
  }
  return homes;
}

test('ensureHomeFridge(): a home without a fridge gets one back in a room that stays walkable, and the dining or living room takes it when the kitchen cannot', () => {
  for (const [what, rooms, share] of [['any room', () => true, 0.9], ['no kitchen in the list', (r) => r.type !== 'kitchen', 0.4]]) {
    const placed = [], bad = [];
    const homes = withoutFridges(rooms, (bp, built) => {
      const got = ensureHomeFridge(built);
      if (!got) return;
      placed.push(bp.id);
      if (!['kitchen', 'dining', 'living', 'hall', 'entry'].includes(got.room.type) || !has(got.L, FRIDGE) || !got.L.connectivity().ok) bad.push(`${bp.id}.${got.room.id} (${got.room.type})`);
    });
    none(`fridges in the wrong room or across a lane (${what})`, bad);
    assert.ok(placed.length >= share * homes, `${what}: the fridge came back in ${placed.length} of ${homes} homes (at least ${Math.round(share * 100)}% when this was written)`);
  }
});

test('solveFixtures(): the default search holds stove, sink and fridge where one pose per piece or a tiny budget cannot - the narrow rowhouse kitchens at the gentle rungs', () => {
  const lost = { fan: [], budget: [] }, bad = [];
  for (const bp of real) for (const [rid, L0] of bp.interior?.layouts ?? []) {
    if (L0.room.type !== 'kitchen' || L0.W < 0.9 || L0.D < 0.9) continue;
    const room = bp.rooms.find((r) => r.id === rid);
    const solve = (o) => { const L = new Layout({ bp, room, rng: makeRng(11), hh: L0.hh }); return solveFixtures(L, kitchenSlots(L), { maxRung: 2, ...o }) && L; };
    const L = solve({});
    if (!L) continue;                                                  // the room that needs the rung that cuts a lane (the census checks those at the real rung)
    const tag = `${bp.id}.${rid} ${L0.W.toFixed(2)}x${L0.D.toFixed(2)}`;
    if (!L.connectivity().ok || !has(L, /^stove_/) || !has(L, /^sink_/) || !has(L, FRIDGE)) bad.push(tag);
    if (!solve({ fan: 1 })) lost.fan.push(tag);
    if (!solve({ budget: 6 })) lost.budget.push(tag);
  }
  none('searched kitchens that lack a fixture or cut the room apart', bad);
  assert.ok(lost.fan.length >= 2, `${lost.fan.length} real kitchens need more than one pose per piece (4 when this was written): ${lost.fan.join(', ')}`);
  assert.ok(lost.budget.length >= 1, `${lost.budget.length} real kitchens need more than a budget of 6 poses (2 when this was written): ${lost.budget.join(', ')}`);
});

// ---------------------------------------------------------------- the chair at a desk
test('tuck: a chair may stand in the front zone of the desk it belongs to (the desk\'s own 0.6 m), and in no other piece\'s - without it no desk ever had a chair', () => {
  const rect = { x0: 0, z0: 0, x1: 4, z1: 3 };
  const room = { id: 'D.f0.r1', type: 'office', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'D', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'D.d1', x: 4, z: 1.5, w: 0.9, rooms: [room.id] }] };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {} } });
  const a = L.at('desk_office', 2.0, 0.36, 0, { force: true, prio: 1 }), b = L.at('desk_office', 0.7, 2.64, Math.PI, { force: true, prio: 1 });          // a on the -z wall facing +z, b on the +z wall facing -z
  assert.ok(a && b && a.zones.length === 1 && b.zones.length === 1, 'two desks, each with a front zone');
  const can = (x, z, o) => L.valid(L._make('chair_wood', x, z, 0, o), o);                      // (nothing is committed: valid() only asks)
  assert.equal(can(2.0, 1.0), false, 'a chair in the front zone of a desk is refused (the zone is the room to use it)');
  assert.equal(can(2.0, 1.0, { tuck: a }), true, 'the chair of desk a stands in desk a\'s zone');
  assert.equal(can(2.0, 1.0, { tuck: b }), false, 'the chair of desk b may not stand in desk a\'s zone');
  assert.equal(can(0.7, 1.9, { tuck: a }), false, 'the chair of desk a may not stand in desk b\'s zone');
  assert.equal(can(0.7, 1.9, { tuck: b }), true, 'the chair of desk b stands in desk b\'s zone');
  const seat = L.at('office_chair', ...L.rel(a, 0, a.d / 2 + 0.4), a.ry + Math.PI, { prio: 2, tuck: a });
  assert.ok(seat, 'the usual call (a desk, its chair 0.4 m past the front edge, facing the desk) places the chair');
});

test('KNEEHOLE: every chair a furnisher puts at a desk stands in front of the knee-hole - its footprint never reaches in front of the drawer pedestal, nor past the desk\'s far end', () => {
  const bad = [];
  for (const desk of ['desk_wood', 'desk_student', 'desk_office', 'desk_teacher']) for (const chair of ['chair_wood', 'chair_plastic', 'chair_metal', 'office_chair']) {
    const pedestal = layoutOf(CATALOG[desk]).slots[0].rect.x1, W = CATALOG[desk].size[0], cw = CATALOG[chair].size[0];          // (the drawers' right edge, from the desk's middle)
    if (KNEEHOLE - cw / 2 < pedestal - 0.03) bad.push(`${chair} at ${desk}: its left edge ${(KNEEHOLE - cw / 2).toFixed(3)} is in front of the drawers (they end at ${pedestal.toFixed(3)})`);
    if (KNEEHOLE + cw / 2 > W / 2) bad.push(`${chair} at ${desk}: its right edge ${(KNEEHOLE + cw / 2).toFixed(3)} is past the desk's end (${(W / 2).toFixed(3)})`);
  }
  assert.equal(bad.length, 0, bad.join('\n'));
});

test('standSpots(): a spot counts only where it SEES the drawer front - a chair or a screen between the spot and the drawers takes it; a chair in the knee-hole takes none of the pedestal\'s', () => {
  const rect = { x0: 0, z0: 0, x1: 4, z1: 4 };
  const room = { id: 'S.f0.r1', type: 'office', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', x: 4, z: 2.5, w: 0.9, rooms: [room.id] }] };
  const L = new Layout({ bp, room, rng: makeRng(2), hh: { tints: {} } });
  bp.interior = { layouts: new Map([[room.id, L]]) };
  const desk = L.at('desk_wood', 2.0, 0.36, 0, { force: true, prio: 1 });                      // on the -z wall facing +z: its drawers are the pedestal at the left, 1.6 m from the room's left wall
  const rec = { id: desk.id, room: room.id, kind: 'floor', x: desk.x, y: 0, z: desk.z, ry: desk.ry, h: desk.h }, slot = layoutOf(CATALOG.desk_wood).slots[0];
  const spots = () => standSpots(bp, rec, slot), pedestalX = desk.x + (slot.rect.x0 + slot.rect.x1) / 2;
  const bare = spots();
  assert.ok(bare.length >= 8, `${bare.length} places to stand in front of a bare desk in a 4 x 4 m room`);
  const seat = L.at('chair_wood', ...L.rel(desk, KNEEHOLE, desk.d / 2 + 0.4), desk.ry + Math.PI, { prio: 2, tuck: desk });
  assert.ok(seat, 'the chair stands in the knee-hole');
  const seated = spots();
  assert.ok(seated.some(([x]) => Math.abs(x - pedestalX) < 0.05), 'with the chair in the knee-hole a person can still stand straight in front of the drawers');
  L.remove(seat);
  const wrong = L.at('chair_wood', ...L.rel(desk, slot.rect.x0 / 2 + slot.rect.x1 / 2, desk.d / 2 + 0.4), desk.ry + Math.PI, { prio: 2, tuck: desk });
  assert.ok(wrong, 'a chair in front of the pedestal (the old way, with the chair in the desk\'s middle on a narrow desk)');
  assert.equal(spots().length, 0, 'a chair straight in front of the drawers hides them from every place to stand');
  L.remove(wrong);
  const screen = L.at('privacy_screen', desk.x - 0.4, 1.25, 0, { force: true });
  assert.ok(screen, 'a privacy screen across the room');
  assert.equal(spots().length, 0, 'a screen between the desk and every place to stand: the places behind it do not see the drawers');
  L.remove(screen);
  assert.equal(spots().length, bare.length, 'with everything taken away the same places are back');
});

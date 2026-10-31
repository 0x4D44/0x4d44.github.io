// Dead ends: no furnished room leaves a lane or a niche of 0.55-0.85 m that a walker can squeeze into and cannot use, and every sleeper's anchor has floor to stand on within reach.
// The stuck sweep (tests/stuck.mjs --cell 0.3) found four such pockets in A2's plans (L33, L45, L70, L89: a 0.6 m aisle between a bed and a wardrobe, a diagonal 0.6 m mouth between a bed and a wardrobe, a 0.6 m
// slot between a box and a pile of sacks, a 0.77 m lane closed by a pot) and two beds (L04, L15) whose sleeper lies 1.3 m from any floor a body can stand on (the sweep wants a node within 1.4 m).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-deadends.test.mjs
//   A3_PLANS=real   also judges every room and bed of A2's real world (default: the six lots below and the synthetic batch)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout, seriousPocket, obbDist } from '../js/interiors/layout.js';
import { SLEEP_REACH } from '../js/interiors/index.js';
import { makeRng } from '../js/core/rng.js';
import { buildData } from './headless.mjs';
import { analyze } from './stuck-lib.mjs';
import { furnishedBatch, SLEEP_ARCH } from './interiors-lib.mjs';

const PI = Math.PI;
const REAL = (process.env.A3_PLANS ?? '').split(',').includes('real');

// ---------------------------------------------------------------- a hand-built bedroom: A2's L33 one, a bed and a wardrobe with an aisle between them that runs up to the head wall
/** A 4.28 x 4.6 m bedroom, its door in the south wall. A double bed with its head to the north wall (`head`) and, if asked, a nightstand beside the head that goes with it (`attach`); a wardrobe on the east
 *  wall whose face stands `gap` m from the bed's east side. `z` and `robeZ` are the middles of the two along the wall (the bed floats off the head wall unless `head`). */
function aisleRoom({ gap = 0.61, nightstand = false, z = 0.96, robeZ = 0.76, head = true } = {}) {
  const W = 4.28, D = 4.6, rect = { x0: 0, z0: 0, x1: W, z1: D };
  const room = { id: 'P.f0.r1', type: 'bedroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'P', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'P.d1', x: 0.6, z: D, w: 0.9, rooms: [room.id] }] };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {} } });
  const put = (name, x, zz, ry, prio = 1) => L.at(name, x, zz, ry, { force: true, prio });
  const robe = put('wardrobe_3', W - 0.29, robeZ, -PI / 2); robe.wallSide = '+x'; robe.u = robeZ;           // 0.56 m deep, 1.5 m along the wall, 0.01 m off it
  const bed = put('bed_double', W - 0.57 - gap - 0.7, z, 0, 0); if (head) { bed.wallSide = '-z'; bed.u = bed.x; }
  let ns = null;
  if (nightstand) { ns = put('nightstand_a', bed.x - 0.7 - 0.22, 0.2, 0, 2); ns.attach = bed; }
  return { L, bed, robe, ns };
}
const describe = (p) => `depth ${p.depth} m, mouth ${p.gap} m at x ${p.x0.toFixed(2)}..${p.x1.toFixed(2)}, z ${p.z0.toFixed(2)}..${p.z1.toFixed(2)} (${p.by.map((b) => b.name).join(' + ')})`;

test('pockets(): a dead-end aisle of 0.55-0.85 m is one; a flush gap, a 0.5 m slot, a 0.9 m aisle and a lane with two ends are not', () => {
  for (const gap of [0.61, 0.7, 0.8]) {
    const ps = aisleRoom({ gap }).L.seriousPockets();
    assert.equal(ps.length, 1, `a ${gap} m aisle up to the head wall: one pocket (${ps.map(describe).join('; ')})`);
    assert.ok(ps[0].depth >= 1.2, `${gap} m: ${describe(ps[0])}`);
    assert.deepEqual(ps[0].by.map((b) => b.name).sort(), ['bed_double', 'wardrobe_3'], `${gap} m: what bounds it`);
  }
  for (const gap of [0, 0.5, 0.9, 1.1]) {
    const ps = aisleRoom({ gap }).L.pockets();
    assert.equal(ps.length, 0, `a ${gap} m gap (flush, shut, open): no pocket (${ps.map(describe).join('; ')})`);
  }
  const lane = aisleRoom({ gap: 0.61, z: 2.25, robeZ: 2.15, head: false }).L.pockets();
  assert.equal(lane.length, 0, `a 0.61 m lane with a way out at each end is a short cut, not a pocket (${lane.map(describe).join('; ')})`);
});

test('pockets(): the thresholds - deep or squeezed, not a shallow wide niche', () => {
  const { L } = aisleRoom({ gap: 0.7 });
  const [p] = L.pockets();
  assert.ok(p && seriousPocket(p), 'a 0.7 m aisle 1.4 m deep is serious');
  assert.ok(!seriousPocket({ depth: 0.25, gap: 0.6 }), 'under 0.3 m deep nobody is wedged');
  assert.ok(seriousPocket({ depth: 0.35, gap: 0.62 }), 'a 0.35 m niche behind a 0.62 m mouth is');
  assert.ok(!seriousPocket({ depth: 0.5, gap: 0.8 }), 'a 0.5 m niche behind a 0.8 m mouth is not (the body turns in it)');
  assert.ok(seriousPocket({ depth: 1.0, gap: 0.85 }), 'a lane 0.9 m deep or more is, whatever its mouth');
});

test('curePockets(): the bed slides 0.3 m off the wardrobe with the nightstand that stands beside it, and the aisle opens to 0.9 m', () => {
  const { L, bed, robe, ns } = aisleRoom({ nightstand: true });
  const was = { bed: [bed.x, bed.z], ns: [ns.x, ns.z], robe: [robe.x, robe.z] };
  assert.equal(L.seriousPockets().length, 1, 'the room starts with its pocket');
  assert.deepEqual(L.curePockets(), [], 'nothing was dropped: a slide was enough');
  assert.equal(L.pockets().length, 0, `no pocket is left (${L.pockets().map(describe).join('; ')})`);
  const dx = bed.x - was.bed[0];
  assert.ok(dx < -0.29 && dx > -0.36, `the bed went ${dx.toFixed(2)} m away from the wardrobe (the least that opens the aisle to 0.9 m)`);
  assert.equal(bed.z, was.bed[1], 'along the head wall only');
  assert.ok(Math.abs((ns.x - was.ns[0]) - dx) < 0.011 && ns.z === was.ns[1], `the nightstand went with the bed (${(ns.x - was.ns[0]).toFixed(2)} m, not ${dx.toFixed(2)} m)`);
  assert.deepEqual([robe.x, robe.z], was.robe, 'the wardrobe, fixed to its wall, stays');
  const aisle = (robe.x - robe.d / 2) - (bed.x + bed.w / 2);
  assert.ok(aisle >= 0.9 - 0.011, `the aisle is ${aisle.toFixed(2)} m`);
  const at = [bed.x, ns.x, robe.x];
  assert.deepEqual(L.curePockets(), [], 'a second pass changes nothing');
  assert.deepEqual([bed.x, ns.x, robe.x], at, 'and moves nothing');
});

// ---------------------------------------------------------------- A2's real plans: the six lots of the sweep's report
const LOTS = ['L04', 'L15', 'L33', 'L45', 'L70', 'L89'];
const TRAP_ROOMS = ['L33.f1.r1', 'L45.f1.r3', 'L70.f2.r2', 'L89.f0.r3'];        // bedroom, bedroom, terrace, bedroom: a trap cluster each
const BED_ROOMS = ['L04.f1.r2', 'L15.f1.r1'];                                    // the beds whose sleeper's anchor had no node within 1.4 m
let sixP;
const six = () => (sixP ??= buildData({ lots: LOTS, furnish: true }));
const layoutIn = (buildings, rid) => buildings.find((bp) => rid.startsWith(bp.id + '.'))?.interior.layouts.get(rid);

test('A2 plans: the four rooms the stuck sweep found trap clusters in have no serious dead-end pocket', async () => {
  const { buildings } = await six();
  const bad = [];
  for (const rid of TRAP_ROOMS) {
    const L = layoutIn(buildings, rid);
    assert.ok(L, `${rid} is in the batch`);
    for (const p of L.seriousPockets()) bad.push(`${rid} (${L.room.type}): ${describe(p)}`);
  }
  assert.equal(bad.length, 0, `${bad.length} pockets:\n  ` + bad.join('\n  '));
});

/** How far from (lx, lz) the nearest floor a body can stand on is: 0.31 m clear of every blocker (the body's radius and a hair), inside the room's main region. A 5 cm grid, 1.6 m round. */
function standDist(L, lx, lz) {
  const r = L.r, bl = L.blockers(), conn = L.connectivity(0.34);
  let best = Infinity;
  for (let x = Math.max(r.x0 + 0.31, lx - 1.6); x <= Math.min(r.x1 - 0.31, lx + 1.6) + 1e-9; x += 0.05) {
    for (let z = Math.max(r.z0 + 0.31, lz - 1.6); z <= Math.min(r.z1 - 0.31, lz + 1.6) + 1e-9; z += 0.05) {
      const d = Math.hypot(x - lx, z - lz); if (d >= best) continue;
      if (bl.some((b) => obbDist(b.ob, x, z) < 0.31)) continue;
      if (!L.inMainRegion(x, z, conn, 1)) continue;
      best = d;
    }
  }
  return best;
}
/** Every sleep anchor of the buildings: [{ bp, L, a, bed, dist }] with the bed under it (null for a crib) and the distance to floor a body can stand on. */
function sleepers(bps) {
  const out = [];
  for (const bp of bps) for (const a of bp.anchors.filter((x) => x.kind === 'sleep')) {
    const L = bp.interior?.layouts.get(a.room); if (!L) continue;
    const [lx, , lz] = bp.frame.toLocal(a.x, 0, a.z);
    const bed = L.items.find((i) => i.floor && SLEEP_ARCH.has(i.c.arch) && Math.hypot(i.x - lx, i.z - lz) < 0.6) ?? null;
    out.push({ bp, L, a, bed, lx, lz, dist: bed ? standDist(L, lx, lz) : null });
  }
  return out;
}

test('A2 plans: every sleeper in the six lots lies within 1.1 m of floor a body can stand on, and within 0.6 m of the middle of the bed', async () => {
  const { buildings } = await six();
  const rows = sleepers(buildings).filter((s) => s.bed);
  assert.ok(rows.length >= 8, `${rows.length} beds`);
  for (const s of rows) {
    assert.ok(s.dist <= SLEEP_REACH + 0.1, `${s.a.room} ${s.bed.name}: the sleeper is ${s.dist.toFixed(2)} m from the nearest floor to stand on (the sweep wants a node within 1.4 m)`);
    assert.ok(Math.hypot(s.bed.x - s.lx, s.bed.z - s.lz) <= 0.6 + 1e-6, `${s.a.room}: the anchor is off the bed`);
  }
  for (const rid of BED_ROOMS) assert.ok(rows.some((s) => s.a.room === rid), `${rid} has a bed`);
});

// ---------------------------------------------------------------- the real kernel
/** The stuck sweep's walker (tests/stuck-lib.mjs `analyze`: the lead's `stuck.mjs --cell 0.3`) let loose in one room from the landing of its door, its 0.3 m lattice shifted by (ox, oz). A node holds the first
 *  position that reaches its cell, so whether a pocket reads as a trap depends on where the lattice falls: the old pockets showed at 1 offset in 25 (L33, L45), 7 (L89) and 10 (L70), the old anchors
 *  of L04 at 2 and of L15 at 15. Returns the room's trap clusters and the anchors with no return-capable node near. */
function sweep(ctx, bp, rid, ox, oz) {
  const L = bp.interior.layouts.get(rid), room = L.room, fr = bp.frame, P = ctx.physics, r = room.rect, fy = bp.lot.y + (room.y ?? 0);
  const land = L.landings.find((l) => l.kind === 'door') ?? L.landings[0];
  const [wx, , wz] = fr.toWorld(land.x + ox, 0, land.z + oz);
  const cs = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].map(([x, z]) => fr.toWorld(x, 0, z));
  const region = [Math.min(...cs.map((c) => c[0])) - 1.2, Math.min(...cs.map((c) => c[2])) - 1.2, Math.max(...cs.map((c) => c[0])) + 1.2, Math.max(...cs.map((c) => c[2])) + 1.2];
  const phys = { doors: P.doors, setDoor: (...a) => P.setDoor(...a), move: (...a) => P.move(...a), groundAt: (x, z, y) => (x === wx && z === wz && y === 1e3 ? fy : P.groundAt(x, z, y)) };
  const res = analyze({ physics: phys, spawn: { x: wx, z: wz }, plan: { pois: [], nav: { nodes: [] } }, buildings: [], anchors: ctx.anchors.filter((a) => a.room === rid), cell: 0.3, region, maxList: 50, arcs: true });
  const inRoom = (t) => { const [lx, , lz] = fr.toLocal(t.at[0], t.y[0], t.at[1]); return lx > r.x0 - 0.5 && lx < r.x1 + 0.5 && lz > r.z0 - 0.5 && lz < r.z1 + 0.5; };      // a cluster at the clipped edge of the region is the probe's, not the room's
  return { traps: res.traps.filter((t) => Math.abs(t.y[0] - fy) < 1.2 && inRoom(t)), missing: res.missing };
}

test('kernel: the sweep\'s walker finds no trap in the four rooms and no sleep anchor without a node it can return from, at the lattice offsets that caught the old layouts', async () => {
  const { ctx, buildings } = await six();
  const OFFSETS = [[0, 0], [0, 0.12], [0.24, 0.12], [0, 0.18]];                 // L70, L89 and L15 at the first; L33 at the second; L45 and L04 at the third; L04 at the fourth
  const bad = [];
  for (const rid of [...TRAP_ROOMS, ...BED_ROOMS]) {
    const bp = buildings.find((b) => rid.startsWith(b.id + '.'));
    for (const [ox, oz] of OFFSETS) {
      const { traps, missing } = sweep(ctx, bp, rid, ox, oz);
      for (const t of traps) bad.push(`${rid} @${ox},${oz}: trap of ${t.cells} nodes at ${t.at.join(',')} (y ${t.y.join('..')})`);
      for (const m of missing) bad.push(`${rid} @${ox},${oz}: ${m.what} ${m.id} at ${m.x},${m.z} has no node to return from`);
    }
  }
  assert.equal(bad.length, 0, `${bad.length} problems:\n  ` + bad.slice(0, 12).join('\n  '));
});

// ---------------------------------------------------------------- every plan
let batchP;
const batch = () => (batchP ??= furnishedBatch());

test('every nightstand a bedroom gets is attached to its bed (a bed that slides takes its nightstands along)', async () => {
  const { bps } = await batch();
  let n = 0;
  for (const bp of bps) for (const [, L] of bp.interior?.layouts ?? []) for (const it of L.items) {
    if (!it.floor || !/^nightstand_/.test(it.name)) continue;
    n++;
    assert.ok(it.attach && SLEEP_ARCH.has(it.attach.c.arch), `${it.id} (${it.name}) in ${L.room.id} is not attached to a bed`);
  }
  assert.ok(n >= 20, `only ${n} nightstands in the batch`);
});

test('every sleeper of the batch lies within reach of floor to stand on (a handful of beds in rooms with no floor to spare excepted)', async () => {
  const { bps } = await batch();
  const rows = sleepers(bps).filter((s) => s.bed), far = rows.filter((s) => s.dist > SLEEP_REACH + 0.1);
  assert.ok(rows.length >= 60, `${rows.length} beds`);
  const allowed = REAL ? 0 : Math.ceil(rows.length * 0.03);                      // A2's plans: none (the farthest was 1.35 m before the slide, 1.05 m after); the synthetic ones: 11 in 100 before, 1 after
  assert.ok(far.length <= allowed, `${far.length} of ${rows.length} sleepers lie over ${SLEEP_REACH + 0.1} m from floor to stand on (at most ${allowed}): ` + far.slice(0, 6).map((s) => `${s.a.room} ${s.dist.toFixed(2)} m`).join(', '));
});

test('the cure leaves at most 7% of the rooms with a serious dead-end pocket (before it: 11% of the synthetic rooms and 9% of A2\'s)', async () => {
  const { bps } = await batch();
  let rooms = 0, serious = 0; const where = [];
  for (const bp of bps) for (const [rid, L] of bp.interior?.layouts ?? []) {
    rooms++;
    const ps = L.seriousPockets();
    if (ps.length) { serious++; where.push(`${rid} ${L.room.type} (${ps.map((p) => `${p.depth} m deep, ${p.gap} m mouth`).join('; ')})`); }
  }
  assert.ok(rooms >= 300, `${rooms} rooms`);
  assert.ok(serious <= rooms * 0.07, `${serious} of ${rooms} rooms keep a serious pocket (${(100 * serious / rooms).toFixed(1)}%, at most 7%):\n  ` + where.slice(0, 10).join('\n  '));
});

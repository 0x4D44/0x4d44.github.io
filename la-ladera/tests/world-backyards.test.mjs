// Back yards (round 6, R1-102 at ground level): the upper rows are cut into the hillside, and behind each back wall the bank climbs to open lawn. Every house read as a coloured box set down on grass.
// A yard is the worn path along the top of that bank and what a household keeps there. The planner is pure; the builder only fills ground that nothing else took, and moves nothing.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-backyards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson, loadClutterFromDisk, loadVehiclesFromDisk } from './headless.mjs';
import { createContext } from '../js/core/ctx.js';
import { makeRng } from '../js/core/rng.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { planBuilding } from '../js/arch/index.js';
import { OCC } from '../js/world/occupancy.js';
import { planYard, yardLots, deck, YARD_MASK, SLOPE_MAX } from '../js/world/backyards.js';

// the ground a yard may never take, written out here rather than imported: street, plaza, stair, building, doorstep, steep ground, a walking line
const FORBIDDEN = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.DOOR | OCC.STEEP | OCC.NAV;
const NOT_A_HOME = ['chapel', 'school', 'kiosk', 'hall', 'clinic', 'courtyard'];
const memo = new Map();
const world = (key, make) => { if (!memo.has(key)) memo.set(key, make()); return memo.get(key); };
const withYards = (seed) => world('with' + seed, () => buildData({ world: true, furnish: false, seed }));
/** The same world with the yards switched off (`yards: false`), built the way buildData builds it (no furnishing: the yards do not look at the rooms). */
const withoutYards = () => world('without', async () => {
  const ctx = createContext({ headless: true, yards: false });
  await ctx.assets.init(readAssetJson);
  ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
  await buildWorld(ctx);
  for (const lot of ctx.plan.lots) ctx.buildings.set(lot.id, planBuilding(ctx, lot));
  for (const bp of ctx.buildings.values()) ctx.physics.add(bp.colliders ?? {});
  await loadClutterFromDisk(ctx); await loadVehiclesFromDisk(ctx);
  await buildProps(ctx);
  return { ctx, plan: ctx.plan };
});
const stream = (lot) => makeRng(20261029).fork('props:yard:' + lot.id).fork('plan');
const toLocal = (lot, x, z) => {                                   // world -> the lot's own frame: u along the back wall, behind = metres out from it
  const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), dx = x - lot.x, dz = z - lot.z;
  return { u: dx * c - dz * s, behind: -lot.d / 2 - (dx * s + dz * c) };
};

test('the lots with a yard are the upper rows of homes, not the chapel, the school or a kiosk', async () => {
  const { plan } = await withYards();
  const lots = yardLots(plan);
  assert.ok(lots.length >= 40 && lots.length <= 70, `${lots.length} lots have a yard`);
  for (const l of lots) assert.ok(l.y >= 10 && !NOT_A_HOME.includes(l.kind), `${l.id} (${l.kind}, pad ${l.y}) is an upper home`);
  for (const l of plan.lots.filter((q) => q.y < 10 || NOT_A_HOME.includes(q.kind))) assert.ok(!lots.includes(l), `${l.id} (${l.kind}, pad ${l.y}) has none`);
  assert.ok(lots.some((l) => l.kind === 'unfinished') && lots.some((l) => l.kind === 'house') && lots.some((l) => l.kind === 'rowhouse'));
});

test('a lot\'s yard comes from the lot and its own stream alone, in the lot\'s own frame', async () => {
  const { plan } = await withYards();
  const lots = yardLots(plan), forward = lots.map((l) => planYard(l, stream(l))), backward = lots.slice().reverse().map((l) => planYard(l, stream(l))).reverse();
  assert.deepEqual(forward, backward, 'the yards drawn before it do not change a yard');
  assert.notDeepEqual(planYard(lots[0], stream(lots[0])), planYard(lots[0], makeRng(5).fork('x')), 'another stream, another yard');
  const kits = new Set(forward.map((p) => p.kit));
  for (const k of ['cisterna', 'tendedero', 'llantas', 'sentadero', 'basura', 'obra']) assert.ok(kits.has(k), `the draw can give ${k}`);
  for (const [i, p] of forward.entries()) {
    const lot = lots[i];
    assert.equal(p.kit === 'obra', lot.kind === 'unfinished', `${lot.id}: only a house that is still going up keeps a building site`);
    for (const it of p.items) {
      assert.ok(Math.abs(it.u) <= lot.w / 2 + 1e-9 && it.v >= 0 && it.v <= 4, `${lot.id} ${it.t} at u ${it.u}, v ${it.v}: along the wall, in from the yard's edge, within 4 m`);
      assert.ok(it.r > 0 && it.size.length === 3 && it.size.every((n) => n > 0), `${lot.id} ${it.t} has a size and a disc`);
    }
    if (p.fence) assert.ok(Math.abs(Math.abs(p.fence.u) - lot.w / 2) < 1e-9 && p.fence.len >= 2 && p.fence.len <= 3.6, `${lot.id}: a fence stands on the plot line, 2 to 3.6 m long`);
  }
  // a lot that already has a yard line (hill.js) is not given a second one: its washing kit turns into tyres
  const lot = lots.find((l) => planYard(l, stream(l), { kit: 'tendedero' }).items.some((i) => i.t === 'line'));
  assert.ok(lot, 'the washing line is offered');
  const noLine = planYard(lot, stream(lot), { kit: 'tendedero', noLine: true });
  assert.ok(!noLine.items.some((i) => i.t === 'line') && noLine.items.some((i) => i.t === 'planter'), 'tyres instead of a second line');
  // the kits are dealt like cards: one pack of fourteen, shuffled once, so a row of yards is never all water tanks
  const pack = deck(makeRng(3)), count = (k) => pack.filter((c) => c === k).length;
  assert.equal(pack.length, 14);
  assert.deepEqual(['cisterna', 'tendedero', 'llantas', 'sentadero', 'basura', 'none'].map(count), [3, 3, 3, 2, 2, 1]);
  assert.deepEqual(deck(makeRng(3)), pack, 'the same seed deals the same pack');
  assert.notDeepEqual(deck(makeRng(4)), pack, 'another seed shuffles it another way');
});

test('the world dresses the backs of the upper rows, on this seed and on another', async () => {
  for (const [seed, floor] of [[undefined, { lots: 22, items: 60, lane: 110 }], [2, { lots: 18, items: 55, lane: 100, tyres: true }]]) {
    const { ctx } = await withYards(seed), Y = ctx.world.backYards, by = Y.byKey, n = (...ks) => ks.reduce((a, k) => a + (by[k] ?? 0), 0);
    assert.ok(Y, 'the yards were built');
    // a lot that already hangs a line (hill.js) is not given a second one: on seed 2 the washing is dealt to one of them, and it keeps tyres instead
    const hill = new Set(ctx.world.cables.filter((c) => c.kind === 'yard').map((c) => c.lot));
    assert.ok(hill.size >= 2, `${hill.size} lots have a clothes line of their own`);
    for (const r of Y.records) if (r.t === 'line') assert.ok(!hill.has(r.lot), `${r.lot} already has a clothes line: a second one is not hung`);
    if (floor.tyres) assert.ok(Y.records.some((r) => r.kit === 'tendedero' && hill.has(r.lot) && r.t === 'planter'), 'the washing dealt to a lot with a line becomes tyres');
    assert.ok(Y.lots >= floor.lots && Y.items >= floor.items && Y.laneM >= floor.lane, `${Y.lots} yards, ${Y.items} pieces, ${Y.laneM} m of path`);
    assert.ok(Y.records.length === Y.items && Y.dropped <= 20, `${Y.dropped} pieces found no ground`);
    assert.ok(Object.keys(Y.byKit).filter((k) => k !== 'none').length >= 5, `kits used: ${Object.keys(Y.byKit)}`);
    assert.ok(['cisterna', 'tendedero', 'llantas', 'sentadero', 'basura'].every((k) => Y.byKit[k] >= 2 && Y.byKit[k] <= 9), `the kits are dealt evenly, none left out and none everywhere: ${JSON.stringify(Y.byKit)}`);
    assert.ok(n('clutter_tank_blue', 'clutter_tank_black') >= 3 && n('clutter_washing_line') >= 2 && n('clutter_tyre') >= 8 && n('clutter_bin_wheelie', 'clutter_bin_metal') >= 4 && n('clutter_chair') >= 4, JSON.stringify(by));
    assert.ok(n('bricks') >= 3 && n('sand') >= 2 && Y.fences >= 2 && Y.scrub >= 40 && Y.bushes >= 3 && Y.planters >= 8, JSON.stringify(Y.byKey));
    assert.deepEqual(ctx.errors, []);
  }
});

test('every piece stands behind its own back wall, on ground nothing else uses, clear of the doors and of every path', async () => {
  const { ctx, plan } = await withYards(), { ctx: bare } = await withoutYards();
  const occ = ctx.world.occ, H = plan.heightAt, lots = new Map(plan.lots.map((l) => [l.id, l])), doors = [...ctx.buildings.values()].flatMap((bp) => (bp.entrances ?? []).map((e) => e.outside)).filter(Boolean);
  const walls = ctx.physics.walls.filter((w) => w.id === 'prop'), near = (x, z) => Math.min(...walls.map((w) => {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
    return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) - (w.t ?? 0);
  }));
  assert.equal(YARD_MASK & FORBIDDEN, FORBIDDEN, 'a yard keeps off every ground in the list above');
  assert.ok(SLOPE_MAX <= 0.32 + 1e-9, 'and off any slope steeper than 0.32');
  const R = ctx.world.backYards.records;
  assert.ok(R.length >= 60);
  for (const r of R) {
    const lot = lots.get(r.lot), { u, behind } = toLocal(lot, r.x, r.z), at = `${r.lot} ${r.key} at ${r.x},${r.z}`;
    assert.ok(behind >= 0.5 && behind <= 8, `${at}: ${behind.toFixed(2)} m behind the wall`);
    assert.ok(Math.abs(u) <= lot.w / 2 + 0.7, `${at}: along the wall, u ${u.toFixed(2)}`);
    if (r.t === 'fence') continue;                                  // (a fence's record is where it starts: the run itself is checked below)
    assert.equal(occ.at(r.x, r.z) & FORBIDDEN, 0, `${at} is not on a street, stair, building, doorstep, steep ground or a walking line`);
    assert.ok(occ.slope(r.x, r.z) <= 0.32 + 1e-9, `${at} is on ground that is not too steep`);
    assert.ok(occ.navDist(r.x, r.z) >= r.r + 0.62 - 1e-9, `${at} leaves the people a clear walk`);
    for (const o of doors) assert.ok(Math.hypot(o[0] - r.x, o[2] - r.z) >= 1.7, `${at} is clear of the door at ${o[0]},${o[2]}`);
    if (r.t !== 'line') assert.ok(!bare.world.occ.overlaps(r.x, r.z, r.r - 1e-6), `${at} does not stand on anything that was there before it`);
    if (r.key?.startsWith('clutter_')) assert.ok(r.y <= H(r.x, r.z) + 0.05 && r.y >= H(r.x, r.z) - 0.6, `${at} rests on the ground (y ${r.y}, ground ${H(r.x, r.z).toFixed(2)})`);
    if (r.t !== 'line' && r.t !== 'rebar') assert.ok(near(r.x, r.z) <= 0.25, `${at} is solid: a collider stands on it`);
    if (r.t === 'line') {                                           // the washing is strung between two posts, on free ground at one height
      const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), ends = [-1, 1].map((e) => [r.x + e * c * r.len / 2, r.z - e * s * r.len / 2]);
      assert.ok(Math.abs(H(...ends[0]) - H(...ends[1])) <= 0.35 + 1e-9, `${at}: the two posts stand at one height`);
      for (const [x, z] of ends) assert.equal(occ.at(x, z) & FORBIDDEN, 0, `${at}: a post of the line stands on free ground`);
    }
  }
  const solid = R.filter((r) => r.t !== 'line' && r.t !== 'fence');
  for (const [i, a] of solid.entries()) for (const b of solid.slice(i + 1)) if (Math.hypot(a.x - b.x, a.z - b.z) < 3) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r - 1e-6, `${a.key} and ${b.key} of ${a.lot}/${b.lot} do not overlap`);
  // a fence stands on the plot line: both ends and the middle on free, gentle ground, with a collider along it
  for (const f of R.filter((r) => r.t === 'fence')) {
    const lot = lots.get(f.lot), c = Math.cos(lot.rotY), s = Math.sin(lot.rotY);
    for (let v = 0; v <= 2; v += 0.5) { const x = f.x - s * v, z = f.z - c * v; assert.equal(occ.at(x, z) & (OCC.ROAD | OCC.STAIR | OCC.LOT | OCC.STEEP), 0, `the fence of ${f.lot} is on free ground ${v} m along`); }
    assert.ok(near(f.x - s * 1, f.z - c * 1) <= 0.1, `the fence of ${f.lot} is solid`);
  }
});

test('a yard changes nothing else: every other prop, cable, discovery and collider is where it was, and the yards are only added', async () => {
  const { ctx: a } = await withYards(), { ctx: b } = await withoutYards();
  assert.equal(b.world.backYards, undefined, 'yards: false builds none');
  const keep = {
    clutterPlacements: (c) => c.world.clutterPlacements.map((r) => [r.key, r.x, r.y, r.z, r.yaw]), clutterDress: (c) => c.world.clutterDress, hill: (c) => c.world.hill, navFit: (c) => c.world.navFit,
    cables: (c) => c.world.cables.map((q) => [q.kind, q.a, q.c, q.sag]), vehicles: (c) => c.world.vehicleList.map((v) => [v.x, v.z]), poles: (c) => c.world.poleList.map((v) => [v.x, v.z]),
  };
  for (const [k, f] of Object.entries(keep)) assert.deepEqual(JSON.parse(JSON.stringify(f(a) ?? null)), JSON.parse(JSON.stringify(f(b) ?? null)), `world.${k} is the same with the yards`);
  const disc = (c) => [...c.discover.items.values()].map((d) => [d.id, d.x, d.y, d.z]);
  assert.deepEqual(disc(a), disc(b), 'every discovery is where it was');
  const wa = a.physics.walls, wb = b.physics.walls;
  assert.ok(wa.length > wb.length + 40, `${wa.length - wb.length} colliders are added`);
  assert.deepEqual(wa.slice(0, wb.length), wb, 'the walls that were there are the same, in the same order');
  assert.ok(a.clutter.records.length > b.clutter.records.length + 40 && a.clutter.records.slice(0, b.clutter.records.length).every((r, i) => r.key === b.clutter.records[i].key && r.x === b.clutter.records[i].x && r.z === b.clutter.records[i].z), 'the library models that were placed are the same, and the yards come after them');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});

test('the yards are drawn: library models tagged as a yard, and a few small meshes of path, heaps and fences', async () => {
  const { ctx } = await withYards();
  ctx.batch.flushAll();
  const Y = ctx.world.backYards, library = Y.records.filter((r) => r.key?.startsWith('clutter_')), tagged = ctx.clutter.records.filter((r) => r.scene === 'yard');
  assert.equal(tagged.length, library.length, 'every library piece of a yard is in the instanced batches');
  assert.ok(tagged.every((r) => r.source === 'addition'));
  let tris = 0, meshes = 0;
  ctx.scene.traverse((o) => { if (o.isMesh && o.name.startsWith('props.yards')) { tris += o.geometry.index.count / 3; meshes++; } });
  assert.ok(meshes >= 3 && meshes <= 60, `${meshes} meshes`);
  assert.ok(tris >= 1000 && tris <= 6000, `${tris} triangles of path, heaps and fences`);
  // the worn path is only ever laid on free, gentle ground: never over a street, a stair, a plaza, a building, a doorstep or a bank
  const occ = ctx.world.occ; let verts = 0;
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.userData.matKey !== 'dirt_path' || !String(o.userData.groupId).startsWith('props.yards')) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++, verts++) assert.equal(occ.at(p.getX(i), p.getZ(i)) & (OCC.ROAD | OCC.STAIR | OCC.PLAZA | OCC.LOT | OCC.DOOR | OCC.STEEP), 0, `a worn path lies on free ground at ${p.getX(i).toFixed(2)}, ${p.getZ(i).toFixed(2)}`);
  });
  assert.ok(verts >= 400, `${verts} vertices of worn path`);
});

// THE PROGRESSIVE CAST (js/people/sim.js `build(..., { progressive: true })`, `onLotData`, `pumpCast`; js/people/spots.js `addAnchors`): the lazy boot (js/main.js) brings the people into the barrio as the
// buildings are furnished. It used to wait for the LAST building (70 s after the page was playable: the street was empty, the shutters were down, and then all 86 came at once: R3-210, R1-107).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-progressive.test.mjs
//   PROG_SABOTAGE=<early|order|noshop|noanchors> breaks the property the matching test holds (proof the test can fail):
//     early      a shopkeeper comes in before the building of his shop is furnished
//     order      the cast comes in as it was made, not the arrival cohort first and then the nearest to the arrival point
//     noshop     the shop of a furnished building is not made
//     noanchors  the anchors of a furnished building do not join the places
// What is held: nobody keeps a shop that does not exist; the street's people need no building at all; a furnished shop gets its shop and its keeper, and nothing else changes; the first people in are
// the ones the first view is made of, then the nearest; once every building is furnished the barrio is the eager boot's (the cast, every shop, every anchor), whatever the order the buildings came in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from './headless.mjs';
import { InteriorManager } from '../js/interiors/lazy.js';
import { finishBuilding } from '../js/interiors/index.js';
import { PeopleSim } from '../js/people/sim.js';
import { Spots } from '../js/people/spots.js';
import { pickArrivals } from '../js/people/arrival.js';
import { blockAt } from '../js/people/schedule.js';

const SABOTAGE = process.env.PROG_SABOTAGE ?? '';
if (SABOTAGE === 'early') PeopleSim.prototype._admissible = () => true;
if (SABOTAGE === 'order') {
  const begin = PeopleSim.prototype._beginProgressive;
  PeopleSim.prototype._beginProgressive = function (sp) { const r = begin.call(this, sp); this.pending.sort((a, b) => (a.id < b.id ? -1 : 1)); return r; };
}
if (SABOTAGE === 'noshop') {
  const on = PeopleSim.prototype.onLotData;
  PeopleSim.prototype.onLotData = function (id) { on.call(this, id); this._shopQueue.length = 0; };
}
if (SABOTAGE === 'noanchors') {
  const on = PeopleSim.prototype.onLotData;
  PeopleSim.prototype.onLotData = function (id) { this.spots.addAnchors = () => 0; try { on.call(this, id); } finally { delete this.spots.addAnchors; } };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const METAS = new Map(JSON.parse(readFileSync(resolve(ROOT, 'assets/models/people/people_meta.json'), 'utf8')).people.map((m) => [m.id, m]));
const HOUR = 17.2;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const J = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' ? r3(x) : x));
const pt = (p) => (p ? [p.x, p.y, p.z, p.ry] : null);
const who = (c) => [c.id, c.name, c.persona, c.charId, c.shopLot?.id ?? null, c.homeLot?.id ?? null, c.household ?? null];
const shopDigest = (sh) => J({ lot: sh.lot, type: sh.type, name: sh.name, post: pt(sh.post), cust: sh.cust.map((c) => [c.kind, pt(c)]), cpoint: pt(sh.cpoint), sealed: sh.sealed, ent: sh.ent ?? null });
const anchorSpots = (sim) => sim.spots.all.filter((s) => s.src === 'anchor');

// the eager boot: everything furnished before the people are
const E = await buildData();
E.ctx.hour = HOUR;
const eager = new PeopleSim(E.ctx);
assert.ok(eager.build(METAS), 'the eager cast is built');
const sp = E.plan.spawn;

/** The lazy boot's data layer as the page has it when the people unit runs: planned, the shells finished and shut in, the chapel furnished; nothing else. The cast is made and waits. */
async function lazy() {
  const w = await buildData({ furnish: false, colliders: false });
  const { ctx } = w; ctx.hour = HOUR;
  const mgr = new InteriorManager(ctx, { meshes: false });
  for (const bp of ctx.buildings.values()) finishBuilding(ctx, bp);
  for (const bp of ctx.buildings.values()) if (bp.lot?.kind === 'chapel') mgr.ensureData(bp.id);
  mgr.addShellColliders();
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS, null, { progressive: true }), 'the progressive cast is built');
  for (const id of ctx.buildings.keys()) if (mgr.dataDone(id)) sim.onLotData(id);          // (what world.js `_followData` does: the buildings that were furnished already)
  ctx.events.on('interiors:data', (e) => sim.onLotData(e?.id));                            // ... and each one that is furnished from now on
  const order = []; sim.onNpcCreated = (n) => order.push(n);
  return { ...w, mgr, sim, order };
}

test('a progressive build makes the eager cast: the same people, bodies, homes, shops and households; nobody is in the barrio yet', async () => {
  const { sim } = await lazy();
  assert.equal(J(sim.cast.map(who)), J(eager.cast.map(who)), 'the cast differs from the eager one (households are read from the seed while the building is not furnished)');
  assert.equal(sim.npcs.length, 0, 'nobody is placed by the build');
  assert.equal(sim.pending.length, eager.npcs.length, 'everybody waits');
  assert.equal(sim.shops.size, 0, 'no shop is made before its building is furnished');
  assert.equal(sim.ready, true);
  assert.equal(sim.castLeft, eager.npcs.length);
});

test('before any building is furnished the street comes in: the first view first, then nearest first; a shopkeeper waits for his shop; no shop is made', async () => {
  const { sim, order, mgr } = await lazy();
  const keepers = sim.pending.filter((n) => n.shopLotId), community = sim.pending.filter((n) => !n.shopLotId);
  assert.ok(keepers.length >= 5 && community.length >= 40, `a cast of shops and a community (${keepers.length} keepers, ${community.length} others)`);
  const cohort = pickArrivals(sim.pending, HOUR, blockAt, sp);
  assert.ok(cohort.size >= 4, `the first view has its people (${cohort.size})`);
  assert.equal(sim.pumpCast(0), 1, 'a slice with no time left still does one thing');
  assert.equal(order.length, 1);
  sim.drainCast();
  assert.equal(order.length, community.length, 'everybody who keeps no shop is in');
  assert.ok(order.every((n) => !n.shopLotId), 'no shopkeeper came in: his shop does not exist');
  assert.equal(sim.shops.size, 0, 'no shop yet');
  assert.equal(sim.pending.length, keepers.length);
  assert.equal(sim.npcs.length, community.length);
  assert.deepEqual(order.slice(0, cohort.size).map((n) => n.id), [...cohort.keys()].map((n) => n.id), 'the people of the first view are the first in, in the order arrival.js picked them');
  const rest = order.slice(cohort.size);
  for (let i = 1; i < rest.length; i++) assert.ok(d2(rest[i - 1].homePos, sp) <= d2(rest[i].homePos, sp) + 1e-9, `${rest[i].id} came in after ${rest[i - 1].id} though it starts nearer the arrival point`);
  assert.equal(mgr.nData, 1, 'nothing but the chapel was furnished by any of this');
});

test('a furnished shop makes its shop and lets its keeper in; every other shop and keeper waits', async () => {
  const { sim, order, mgr, plan } = await lazy();
  sim.drainCast();
  const shops = plan.lots.filter((l) => l.shop && sim.pending.some((n) => n.shopLotId === l.id));
  assert.ok(shops.length >= 3, `shops with a keeper (${shops.length})`);
  const [a, b] = shops, mine = (lot) => sim.pending.filter((n) => n.shopLotId === lot.id).map((n) => n.id);
  const keepersA = mine(a), before = order.length;
  mgr.ensureData(a.id);                                                                    // -> interiors:data -> onLotData
  assert.equal(sim.castLeft, sim.pending.length + 1, 'the shop is queued');
  assert.equal(sim.shops.has(a.id), false, 'a slice makes it, not the event (the event comes out of a data step)');
  assert.equal(sim.pumpCast(0), 1);
  assert.equal(sim.shops.has(a.id), true, 'the shop is made first');
  assert.equal(order.length, before, 'nobody came in with it');
  sim.drainCast();
  assert.deepEqual(order.slice(before).map((n) => n.id), keepersA, 'his keepers came in, nobody else');
  assert.equal(sim.shops.has(b.id), false, 'the next shop is not made: its building is not furnished');
  assert.ok(sim.pending.some((n) => n.shopLotId === b.id), 'and its keeper waits');
  assert.equal(shopDigest(sim.shops.get(a.id)), shopDigest(eager.shops.get(a.id)), `${a.id}: the shop the eager boot makes (post, customers, door)`);
  assert.equal(sim.shops.get(a.id).keeper, eager.shops.get(a.id).keeper, `${a.id}: the keeper stands at the post, shutter up, as in the eager boot (${eager.shops.get(a.id).keeper})`);
  assert.equal(sim.shops.get(a.id).open, eager.shops.get(a.id).open);
});

test('every building furnished, in any order: the progressive barrio is the eager one (cast, every shop, every anchor), and whenAllIn() resolves with the last arrival and not before', async () => {
  const { sim, order, mgr, ctx } = await lazy();
  let all = false; const done = sim.whenAllIn().then(() => { all = true; });
  sim.drainCast(); await Promise.resolve();
  assert.equal(all, false, 'the shopkeepers have no shop yet');
  const ids = [...ctx.buildings.keys()], lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rnd = lcg(5); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  for (let i = 0; i < ids.length; i++) {                                                   // the buildings in a shuffled order, the cast pumped between them as the frames do
    mgr.ensureData(ids[i]); sim.pumpCast(0);
    if (i < ids.length - 1) assert.equal(all, false, 'not all in before the last building');
  }
  assert.equal(mgr.sealed, true);
  sim.drainCast(); await done;
  assert.equal(all, true, 'whenAllIn resolved');
  assert.equal(sim.castLeft, 0); assert.equal(sim.pending.length, 0);
  assert.equal(order.length, eager.npcs.length, 'everybody is in');
  assert.deepEqual(sim.npcs.map((n) => n.id).sort(), eager.npcs.map((n) => n.id).sort());
  assert.deepEqual([...sim.shops.keys()].sort(), [...eager.shops.keys()].sort(), 'the shops');
  const bad = [...eager.shops.keys()].filter((id) => shopDigest(sim.shops.get(id)) !== shopDigest(eager.shops.get(id)));
  assert.deepEqual(bad, [], 'shops that differ from the eager boot');
  const key = (s) => [s.building, s.kind, ...pt(s).map(r3)].join('|');
  assert.deepEqual(anchorSpots(sim).map(key).sort(), anchorSpots(eager).map(key).sort(), 'the places inside the buildings are the eager boot\'s');
  assert.equal(new Set(anchorSpots(sim).map((s) => s.id)).size, anchorSpots(sim).length, 'no two places share an id');
  assert.equal(await sim.whenAllIn(), undefined, 'and again, at once');
  assert.equal(ctx.errors.length, 0, ctx.errors.map((e) => e.message).join('\n'));
  assert.deepEqual(sim.faults, []);
});

test('the barrio lives while it is being furnished: 90 s of a frame per data step, the cast coming in between, no fault; the shops that are open when everything is in are the eager boot\'s', async () => {
  const { sim, mgr, ctx } = await lazy();
  sim.setPlayer(sp.x, sp.y ?? 0, sp.z, sp.yaw ?? 0);
  let frames = 0;
  while (!(mgr.sealed && !sim.castLeft)) {
    mgr.pump(0); sim.pumpCast(0); sim.step(1 / 30); frames++;
    assert.ok(frames < 400000, 'never finished');
  }
  for (let i = 0; i < 30 * 90; i++) sim.step(1 / 30);
  assert.deepEqual(sim.faults, [], 'no fault: ' + sim.faults.map((f) => f.message ?? f).join('; '));
  assert.equal(ctx.errors.length, 0);
  const open = (s) => [...s.shops.values()].filter((x) => x.open).map((x) => x.lot).sort();
  assert.ok(open(sim).length >= 3, `shops are open (${open(sim)})`);
  assert.ok(sim.npcs.every((n) => Number.isFinite(n.x) && Number.isFinite(n.z)), 'nobody is lost');
  assert.deepEqual(open(sim), open(eager), 'the same shops are open at the same time as in the eager boot');
});

test('Spots.addAnchors takes every anchor once, whichever call brings it, and `inside` sees it at once', () => {
  const a = (id, building, kind) => ({ id, building, kind, x: 1, y: 0, z: 2, ry: 0, tags: [] });
  const list = [a('a1', 'L01', 'counter'), a('a2', 'L01', 'customer')], S = new Spots({ plan: { lots: [], pois: [] }, anchors: list });
  assert.equal(S.inside('L01', 'counter').length, 1);
  const more = a('a3', 'L02', 'counter');
  assert.equal(S.addAnchors([...list, more]), 1, 'the list given again whole adds only what is new');
  assert.equal(S.addAnchors([...list, more]), 0, 'and nothing the second time');
  assert.equal(S.inside('L02', 'counter').length, 1, 'a late anchor is seen at once');
  assert.equal(S.all.length, 3);
  assert.equal(S.addAnchors(undefined), 0);
});

if (SABOTAGE) test(`SABOTAGE=${SABOTAGE} is active`, () => { assert.ok(['early', 'order', 'noshop', 'noanchors'].includes(SABOTAGE)); });

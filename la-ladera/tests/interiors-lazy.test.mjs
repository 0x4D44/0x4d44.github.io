// LAZY INTERIORS (js/interiors/lazy.js): the world a lazy boot makes is the eager world, byte for byte, whatever order the buildings are asked for in.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-lazy.test.mjs
//   LAZY_SABOTAGE=<cursor|uid|seal> breaks the property the matching test holds (proof the test can fail):
//     cursor  the discoveries are made when a building's data is done, in the order the buildings were asked for, not in the boot's order
//     uid     the module's id counter is not put back between the steps of two interleaved buildings
//     seal    the anchors keep the order they were registered in
// What is compared (every section is a digest of what the section holds; a failing test names the sections that differ):
//   exactly equal   furniture records, rooms, finishes, households, shop goods, stories, garments, discoveries (content AND order), the anchors (content, order, ids), the colliders of
//                   the shells and of the furniture, the physics world's counts
//   equal as sets   the lights and the prompts (their ids come from a counter that follows the order of registration)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildData } from './headless.mjs';
import { InteriorManager } from '../js/interiors/lazy.js';
import { finishBuilding, furnishSteps, collectDiscoveryStories } from '../js/interiors/index.js';

const SABOTAGE = process.env.LAZY_SABOTAGE ?? '';
if (SABOTAGE === 'cursor') {                                    // the discoveries are made as each building's data is done, in the order the buildings were asked for
  InteriorManager.prototype._advance = function () {
    for (const j of this.jobs) if (j.d === 2 && !j.disc) { collectDiscoveryStories(this.ctx, j.bp, j.E); j.E = null; j.disc = true; this.cursor++; }
    if (!this.sealed && this.cursor >= this.jobs.length) this._seal();
  };
}
if (SABOTAGE === 'uid') {                                       // the id counter of layout.js is not put back at each step: two interleaved buildings share it
  InteriorManager.prototype._dataStep = function (j) {
    if (!j.gen) { j.gen = furnishSteps(this.ctx, j.bp, { lazy: true }); j.d = 1; }
    const r = j.gen.next();
    if (r.done) { j.d = 2; j.gen = null; j.E = r.value ?? null; this._dataDone(j); }
  };
}
if (SABOTAGE === 'seal') {                                      // the anchors stay in the order they were registered in
  InteriorManager.prototype._seal = function () { this.sealed = true; };
}
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const J = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? undefined : x instanceof Map ? [...x] : x instanceof Set ? [...x] : x));
const sortedJ = (list) => list.map(J).sort();

/** One digest per section of the data world. */
function digest(ctx) {
  const B = [...ctx.buildings.values()], S = {};
  const add = (k, v) => { S[k] = sha(J(v)); };
  add('furniture', B.map((b) => [b.id, b.furniture]));
  add('rooms', B.map((b) => [b.id, b.interior?.rooms]));
  add('finish', B.map((b) => [b.id, (b.rooms ?? []).map((r) => [r.id, r.finish])]));
  add('households', B.map((b) => [b.id, b.interior?.hh]));
  add('goods', B.map((b) => [b.id, b.goods]));
  add('stories', B.map((b) => [b.id, b.interior?.stories]));
  add('garments', B.map((b) => [b.id, b.interior?.garments]));
  add('discoveries', [...ctx.discover.items.values()]);
  add('anchors', ctx.anchors);
  add('anchors-by-building', B.map((b) => [b.id, b.anchors]));
  add('furniture-colliders', B.map((b) => [b.id, (b.colliders?.walls ?? []).filter((w) => w.furniture)]));
  add('shell-colliders', B.map((b) => [b.id, (b.colliders?.walls ?? []).filter((w) => !w.furniture), b.colliders?.floors]));
  add('physics', ctx.physics.stats());
  add('lights (set)', sortedJ(ctx.lights.list.map((l) => ({ ...l, id: null }))));
  add('lights-by-building (set)', B.map((b) => [b.id, sortedJ(b.lights.map((l) => ({ ...l, id: null })))]));
  add('prompts (set)', sortedJ([...ctx.interact.items.values()].map((i) => [i.kind, i.x, i.y, i.z, i.radius, i.building, i.pri, i.static ?? false])));
  return S;
}
const same = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

// a small seeded stream for the order of the demands (the test must not depend on Math.random)
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const shuffled = (list, rnd) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const eager = await buildData();
const eagerDigest = digest(eager.ctx);

/** A lazy boot's data layer, as the page's does it: planned, the shells' finishes, the chapel's furniture, the shells' colliders; nothing else yet. */
async function lazyWorld({ meshes = false } = {}) {
  const w = await buildData({ furnish: false, colliders: false });
  const mgr = new InteriorManager(w.ctx, { meshes });
  for (const bp of w.ctx.buildings.values()) finishBuilding(w.ctx, bp);
  for (const bp of w.ctx.buildings.values()) if (bp.lot?.kind === 'chapel') mgr.ensureData(bp.id);
  mgr.addShellColliders();
  return { ...w, mgr };
}

test('lazy boot: a stub of the player walking all over the barrio, one step per frame, makes the eager world', async () => {
  const { ctx, mgr } = await lazyWorld();
  const rnd = lcg(7), spots = shuffled([...ctx.buildings.values()], rnd).slice(0, 9).map((b) => ({ x: (b.bounds.x0 + b.bounds.x1) / 2, z: (b.bounds.z0 + b.bounds.z1) / 2 }));
  ctx.player = { s: { x: spots[0].x, y: 0, z: spots[0].z } };
  let frames = 0;
  while (!mgr.sealed) {
    if (frames % 5 === 0) { const sp = spots[Math.floor(rnd() * spots.length)]; ctx.player.s.x = sp.x; ctx.player.s.z = sp.z; }   // the queue bounces from building to building mid-way
    mgr.pump(0); frames++;
    assert.ok(frames < 200000, 'the data pass never finished');
  }
  assert.ok(mgr.stats.steps > ctx.buildings.size * 4, `the data pass is one step per room and seam, not one per building (${mgr.stats.steps} steps for ${ctx.buildings.size} buildings)`);
  assert.equal(ctx.errors.length, 0, ctx.errors.map((e) => e.message).join('\n'));
  const lazyDigest = digest(ctx);
  assert.deepEqual(same(eagerDigest, lazyDigest), [], 'sections that differ from the eager boot');
});

test('lazy boot: the buildings are asked for in a shuffled order, half of them are left mid-way and finished by ensure()', async () => {
  const { ctx, mgr } = await lazyWorld();
  const ids = shuffled([...ctx.buildings.keys()], lcg(11));
  for (let i = 0; i < ids.length; i++) {
    if (i % 3 === 0) { mgr.need(ids[i]); for (let k = 0; k < 4; k++) mgr.pump(0); }                       // a few steps of whatever is next: jobs sit half done
    else if (i % 3 === 1) mgr.ensureData(ids[i]);
  }
  assert.ok(!mgr.sealed || mgr.cursor === ctx.buildings.size, 'sealed implies the cursor reached the end');
  mgr.drain({ meshes: false });
  assert.equal(mgr.sealed, true);
  assert.equal(mgr.cursor, ctx.buildings.size);
  assert.deepEqual(same(eagerDigest, digest(ctx)), [], 'sections that differ from the eager boot');
});

test('the discoveries wait for the cursor: none of a building is registered before every building before it is furnished', async () => {
  const { ctx, mgr } = await lazyWorld();
  const world = ctx.discover.items.size, ids = [...ctx.buildings.keys()];
  mgr.ensureData(ids[ids.length - 1]);                                                                    // the LAST building first
  assert.equal(ctx.discover.items.size, world, 'a discovery of the last building was registered before the first buildings were furnished');
  assert.equal(mgr.sealed, false);
  assert.ok(ctx.interact.items.size > 0, 'its prompts are registered at once (they depend on nothing else)');
  mgr.ensureData(ids[0]);
  assert.ok(ctx.discover.items.size > world, 'the first building has now passed the cursor');
  assert.equal(mgr.cursor, 1);
  mgr.drain({ meshes: false });
  assert.equal(mgr.cursor, ids.length);
});

test('a step that is asked for ahead of its turn does not disturb the buildings around it (the id counter belongs to the job)', async () => {
  const { ctx, mgr } = await lazyWorld();
  const [a, b] = [...ctx.buildings.keys()].slice(30, 32);
  const ja = mgr.job(a), jb = mgr.job(b);
  // interleave the two jobs one step at a time, as a player walking between them would
  for (let k = 0; k < 400 && (ja.d !== 2 || jb.d !== 2); k++) { if (ja.d !== 2) mgr._step(ja); if (jb.d !== 2) mgr._step(jb); }
  assert.equal(ja.d, 2); assert.equal(jb.d, 2);
  const ref = await buildData({ lots: [a, b] });                                                         // the same two buildings furnished the plain way, in the plain order
  for (const id of [a, b]) {
    assert.equal(J(ctx.buildings.get(id).furniture), J(ref.ctx.buildings.get(id).furniture), `${id}: furniture`);
    assert.equal(J(ctx.buildings.get(id).interior.rooms), J(ref.ctx.buildings.get(id).interior.rooms), `${id}: rooms`);
  }
});

test('the anchors take the eager order and numbers when the data pass seals', async () => {
  const { ctx, mgr } = await lazyWorld();
  const ids = shuffled([...ctx.buildings.keys()], lcg(3));
  for (const id of ids) mgr.ensureData(id);
  assert.equal(mgr.sealed, true);
  assert.deepEqual(ctx.anchors.map((a) => a.id), eager.ctx.anchors.map((a) => a.id));
  assert.equal(J(ctx.anchors), J(eager.ctx.anchors));
  assert.ok(new Set(ctx.anchors.map((a) => a.id)).size === ctx.anchors.length, 'anchor ids are unique');
});

test('pump keeps its budget: one indivisible step at a time, always making progress, never more than asked after the clock runs out', async () => {
  const { ctx, mgr } = await lazyWorld();
  let calls = 0, guard = 0;
  const steps0 = mgr.stats.steps;
  while (mgr.pump(0)) { calls++; if (++guard > 100000) assert.fail('pump(0) makes no progress'); }
  assert.ok(mgr.stats.steps - steps0 >= calls, 'pump(0) did at least one step per call');
  assert.ok(mgr.stats.steps - steps0 <= calls + 1, `pump(0) did more than one step per call (${mgr.stats.steps - steps0} steps in ${calls + 1} calls)`);
  assert.equal(mgr.sealed, true);
  assert.equal(mgr.pump(0), false, 'nothing is left to do once the data is in and no packs are due');
  assert.equal(ctx.errors.length, 0);
});

test('ready(), need() and whenReady() agree about what is built', async () => {
  const { ctx, mgr } = await lazyWorld({ meshes: true });
  const id = [...ctx.buildings.keys()][5];
  assert.equal(mgr.ready(id), false);
  assert.equal(mgr.dataDone(id), false);
  let resolved = false; mgr.whenReady(id).then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(mgr.pump(0), true);
  assert.equal(mgr.job(id).urgent > 0, true, 'a building somebody waits for is first in the queue');
  assert.ok(mgr.job(id).d >= 1, 'the first step went to the building somebody waits for');
  assert.equal(mgr.ready('no such building'), true, 'an unknown id never holds a door');
});

if (SABOTAGE) test(`SABOTAGE=${SABOTAGE} is active`, () => { assert.ok(['cursor', 'uid', 'seal'].includes(SABOTAGE)); });

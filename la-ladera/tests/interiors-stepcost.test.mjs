// LAZY INTERIORS: a step of a furnish job is a slice of a search, never the whole of one (round 6, 02f).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-stepcost.test.mjs
// The lazy runner (js/interiors/lazy.js) takes one step of `furnishSteps` at a time and spends a 4 ms slice of a frame on as many as fit, never cutting one. A step that was a whole search for
// the beds of a 6 m2 bedroom (a 4-bed list that fails is 230 000 to 340 000 poses tried, 300 to 800 ms) stalled the page for that long: tests/interiors-lazy-page.test.mjs, "no call of a frame took
// 488 ms". What is held here is the WORK of a step, counted in poses (`Layout.valid` calls) and floods (`Layout.connectivity` calls), so it means the same on any machine and whatever else it is doing.
//   1. on the lots of the barrio with the longest bed searches no step tries more than 12 000 poses or floods more than 1 000 times (before the solver yielded: 340 000 and 42 000), and a step of
//      the solver is no wider than three slices;
//   2. the solver cuts a failing 4-bed search into slices of about a thousand poses, and what it finds (or does not) is what `solveFixtures` finds, with the same ids taken;
//   3. two orders of the same pieces are one search (the twins shortcut): it runs half of the 4-bed list's orders and leaves the world, and the ids the next pieces get, exactly as they were;
//   4. the job cut into steps and interleaved with another building's, the way the runner does, makes the world a drained job makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './headless.mjs';
import { furnishSteps } from '../js/interiors/index.js';
import { Layout, getUid, setUid } from '../js/interiors/layout.js';
import * as R from '../js/interiors/rooms.js';
import { makeRng } from '../js/core/rng.js';

const SLICE = R.SOLVE_SLICE;
const WORK = { poses: 0, floods: 0 };
{ const valid = Layout.prototype.valid, flood = Layout.prototype.connectivity;
  Layout.prototype.valid = function (...a) { WORK.poses++; return valid.apply(this, a); };
  Layout.prototype.connectivity = function (...a) { WORK.floods++; return flood.apply(this, a); }; }

const WORST = ['L40', 'L16', 'L50', 'L87', 'L06'];       // the barrio's longest bed searches: bedrooms of 6 to 12 m2 owed three or four beds (L40.f1.r3, L16.f0.r7, L50.f1.r2, L87.f1.r1, L06.f1.r7)
const STEP_POSES = 12000, STEP_FLOODS = 1000;

/** Every step of a building's furnish job, as the lazy runner takes them (the id counter put back at each): [{ label, poses, floods }]. */
function stepsOf(ctx, bp) {
  const gen = furnishSteps(ctx, bp, { lazy: true }), out = [];
  let uid = 0;
  for (;;) {
    setUid(uid);
    const p0 = WORK.poses, f0 = WORK.floods, r = gen.next();
    uid = getUid();
    out.push({ label: r.done ? 'end' : r.value, poses: WORK.poses - p0, floods: WORK.floods - f0 });
    if (r.done) return out;
  }
}

test('the worst lots of the barrio: no step of the furnish job tries more than 12 000 poses or floods more than 1 000 times, and a step of the solver is no wider than three slices', async () => {
  const { ctx, buildings } = await buildData({ furnish: false, colliders: false, lots: WORST });
  assert.deepEqual(buildings.map((b) => b.id).sort(), [...WORST].sort());
  let worst = { poses: 0 }, widest = { floods: 0 }, widestSolve = { poses: 0 }, total = 0, solves = 0, steps = 0;
  for (const bp of buildings) {
    for (const s of stepsOf(ctx, bp)) {
      steps++; total += s.poses;
      if (s.label === 'solve') { solves++; if (s.poses > widestSolve.poses) widestSolve = { ...s, bp: bp.id }; }
      if (s.poses > worst.poses) worst = { ...s, bp: bp.id };
      if (s.floods > widest.floods) widest = { ...s, bp: bp.id };
    }
  }
  assert.ok(total > 100000, `the lots have real searches to cut (${total} poses in all)`);
  assert.ok(worst.poses <= STEP_POSES, `the widest step of ${worst.bp} (${worst.label}) tried ${worst.poses} poses, over ${STEP_POSES}: a search that is not cut into slices (before: 340 000)`);
  assert.ok(widest.floods <= STEP_FLOODS, `the widest step of ${widest.bp} (${widest.label}) flooded the room ${widest.floods} times, over ${STEP_FLOODS} (before: 42 000)`);
  assert.ok(solves >= 200, `the solver yielded ${solves} times in ${steps} steps over ${total} poses: it is cut into slices`);
  assert.ok(widestSolve.poses <= 3 * SLICE, `a step of the solver tried ${widestSolve.poses} poses (${widestSolve.bp}), over three slices of ${SLICE}`);
});

/** A 3.4 x 2.9 m bedroom with one door in its -x wall, and the slots `repackBeds` makes for a list of beds. */
function bedroom() {
  const rect = { x0: 0, z0: 0, x1: 3.4, z1: 2.9 }, room = { id: 'S.f0.r1', type: 'bedroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d0', x: 0, z: 1.45, w: 0.9, rooms: [room.id] }] };
  return new Layout({ bp, room, rng: makeRng(1), hh: { tints: { bedding: 0xf2f0ea }, income: 0 } });         // (a household with a tint for the bedding: no pose draws one from the room's stream)
}
const NAMES = { double: ['bed_double', 'bed_double_wood'], bunk: ['bed_bunk'], single: ['bed_single_metal', 'bed_single'] };
const bedSlots = (L, list) => {
  const o = { awayDoors: true, alongToo: true, connAll: true }, accept = (it) => !L._windowHit(it.ob, 99);
  return list.map((k, n) => R.slot(NAMES[k], n || k === 'bunk' ? { ...o, accept } : o));
};
const SEARCH = { maxRung: 3, budget: 60, fan: 5 };
/** One solve on a fresh, empty room: what it returned, the poses it tried, the ids it took, the room it left, and the poses between each two yields (none: it ran synchronously). */
function solve(list, opts = {}, how = 'steps', L = bedroom()) {
  const slots = bedSlots(L, list);
  setUid(0); WORK.poses = 0;
  const slices = []; let got;
  if (how === 'sync') got = R.solveFixtures(L, slots, { ...SEARCH, ...opts });
  else {
    const gen = R.solveFixturesSteps(L, slots, { ...SEARCH, ...opts });
    let last = 0, r;
    for (r = gen.next(); !r.done; r = gen.next()) { slices.push(WORK.poses - last); last = WORK.poses; }
    slices.push(WORK.poses - last); got = r.value;
  }
  return { got: got && got.map((i) => [i.name, i.x, i.z, i.ry]), poses: WORK.poses, ids: getUid(), left: L.items.length, rng: L.rng.next(), slices };       // (rng: where the room's stream stands: the next draw)
}
const TWINS = ['single', 'single', 'bunk', 'single'];     // the 4-bed list of a family with two children and a teenager: no room of 9.9 m2 holds it, so every order of it is searched

test('solveFixturesSteps: a failing 4-bed search is cut into slices of about a thousand poses, and ends where solveFixtures does, with the same ids taken', () => {
  const steps = solve(TWINS), sync = solve(TWINS, {}, 'sync');
  assert.equal(steps.got, null, 'the list does not fit: the whole search runs');
  assert.ok(steps.poses > 50000, `a real search (${steps.poses} poses)`);
  assert.ok(steps.slices.length >= 50, `${steps.slices.length} slices of ${Math.round(steps.poses / steps.slices.length)} poses on average`);
  assert.ok(Math.max(...steps.slices) <= 3 * SLICE, `the widest slice is ${Math.max(...steps.slices)} poses (a slice is ${SLICE})`);
  assert.deepEqual({ got: steps.got, poses: steps.poses, ids: steps.ids, left: steps.left, rng: steps.rng }, { got: sync.got, poses: sync.poses, ids: sync.ids, left: sync.left, rng: sync.rng }, 'steps drained and the synchronous call are one search');
  assert.equal(steps.left, 0, 'the room is as it was: nothing of the failed search is left in it');
  const fits = solve(['double', 'bunk', 'single']), fitsSync = solve(['double', 'bunk', 'single'], {}, 'sync');
  assert.ok(fits.got && fits.got.length === 3, 'a list that fits is found');
  assert.deepEqual(fits, { ...fitsSync, slices: fits.slices }, 'and found the same either way');
});

test('the twins shortcut: two orders of the same pieces are one search, run once, and the world (what is found, the ids taken) is what all the orders make', () => {
  for (const list of [TWINS, ['double', 'bunk', 'single'], ['single', 'single', 'bunk'], ['single', 'bunk']]) {
    const every = solve(list, { dedupe: false }), twins = solve(list);
    assert.deepEqual({ got: twins.got, ids: twins.ids, left: twins.left, rng: twins.rng }, { got: every.got, ids: every.ids, left: every.left, rng: every.rng }, `${list.join('+')}: found the same, took the same ids, left the room and its stream the same`);
    if (list === TWINS) assert.ok(twins.poses <= 0.6 * every.poses, `a list with a pair of alike beds is half the search: ${twins.poses} poses against ${every.poses}`);
    else assert.ok(twins.poses <= every.poses, `${list.join('+')}: never more than all the orders (${twins.poses} against ${every.poses})`);
  }
  // a household with no tint for the bedding: a pose draws one from the room's stream, so no order is skipped (the stream would not be the one it was)
  const bare = () => { const L = bedroom(); L.hh = { tints: {}, income: 0 }; return L; };
  const shortcut = solve(TWINS, {}, 'steps', bare()), every = solve(TWINS, { dedupe: false }, 'steps', bare());
  assert.equal(shortcut.poses, every.poses, 'without a tint for its colours the room runs every order');
  assert.equal(shortcut.rng, every.rng, 'and its stream is where every order leaves it');
});

test('Layout.valid floods the room once for a bed or a seat (the connection test and the access test read the same flood), and once more for a stove (a 0.34 m body is another flood)', () => {
  const L = bedroom();
  const floods = (name) => {
    const it = L.wallPoses(name, 'any', { prio: 0 }).next().value;
    assert.ok(it, `${name} has a pose in the room`);
    const f0 = WORK.floods, ok = L.valid(it);
    return ok ? WORK.floods - f0 : -1;
  };
  assert.equal(floods('bed_single'), 1, 'a bed: the room with it in it is flooded once (it asks both whether the room stays whole and whether it can be walked up to)');
  assert.equal(floods('chair_wood'), 1, 'a seat: the same');
  assert.equal(floods('wardrobe_2'), 1, 'a wardrobe asks only whether the room stays whole');
  assert.equal(floods('stove_gas'), 2, 'a stove asks the cook\'s question of the 0.34 m body besides');
  assert.equal(floods('rug_small'), 0, 'a rug blocks nothing: no flood');
});

test('the job cut into steps and interleaved with another building\'s, as the lazy runner takes them, makes the world the drained job makes (ids, poses, tints, every record)', async () => {
  const lots = ['L40', 'L50'];
  const eager = await buildData({ lots, colliders: false });
  const lazy = await buildData({ lots, furnish: false, colliders: false });
  const jobs = lazy.buildings.map((bp) => ({ bp, gen: furnishSteps(lazy.ctx, bp, { lazy: true }), uid: 0, done: false }));
  for (let n = 0; jobs.some((j) => !j.done); n++) {                      // one step each, round and round
    const j = jobs[n % jobs.length]; if (j.done) continue;
    setUid(j.uid);
    const r = j.gen.next();
    j.uid = getUid();
    if (r.done) j.done = true;
  }
  for (const bp of eager.buildings) {
    const other = lazy.buildings.find((b) => b.id === bp.id);
    assert.ok(bp.furniture.length > 100, `${bp.id} is furnished`);
    assert.equal(JSON.stringify(other.furniture), JSON.stringify(bp.furniture), `${bp.id}: the furniture records (ids, poses, tints) are the drained job's`);
    assert.equal(JSON.stringify([...other.interior.layouts].map(([id, L]) => [id, L.sleeps, L.owed])), JSON.stringify([...bp.interior.layouts].map(([id, L]) => [id, L.sleeps, L.owed])), `${bp.id}: the beds each room holds and owes`);
  }
});

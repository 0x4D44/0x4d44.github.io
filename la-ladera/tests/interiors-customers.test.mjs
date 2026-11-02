// A customer's spot at a shop counter is floor the street reaches without passing the keeper at his post (round 6, tests/people-spots.test.mjs: L58, 'the post is 0.05 m from the way the customers walk in').
// The counter of a narrow shop leaves the customers a strip no body can stand in, and the spot a customer's anchor snaps to (within 0.9 m: layout.js `snapStand`) lay past the counter's end, where only the
// keeper's own lane leads. L58 (a 2.4 m wide butcher's): its drinks cooler stood at that end and took the spot (a butcher keeps none, R4-308); once it was gone the spot was there, the way in to it ran down
// the keeper's lane and past him, and a customer who walked it was pushed off it for ever (people/sim.js AISLE). reach.js `customerFloor` is the floor the street reaches with the keeper and 0.8 m round him
// taken out; index.js `emitAnchors` puts a customer only on it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-customers.test.mjs
//   A3_SABOTAGE=behind   puts a customer spot in the keeper's lane of every shop on purpose, so the barrio test must FAIL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { Layout, mkObb } from '../js/interiors/layout.js';
import { customerFloor, KEEPER_AISLE } from '../js/interiors/reach.js';
import { makeRng } from '../js/core/rng.js';

const PI = Math.PI;
const SAB = process.env.A3_SABOTAGE;
const isStreet = (L) => (l) => l.kind === 'door' && ['exterior', 'shutter', 'gate'].includes((L.bp.doors ?? []).find((d) => d.id === l.door)?.kind);

/** A shop `W` wide and 6.58 m long (L58's), its street door in the middle of the +z wall and a door to the entry hall in the -x wall; L58's counter, a 1.8 x 0.8 m case with its back to the +x wall
 *  (the service wall) and 0.3 m of hooks on it, and its butcher's block against that wall too. The keeper stands in the lane behind the counter, the customers' spots at the counter's two ends. */
function shop(W) {
  const rect = { x0: 0, z0: 0, x1: W, z1: 6.58 }, room = { id: 'S.f0.r2', type: 'shop', floor: 0, rect, y: 0, h: 2.8 };
  const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    doors: [{ id: 'S.d0', x: 1.02, z: 6.58, w: 0.9, kind: 'exterior', rooms: [room.id] }, { id: 'S.d1', x: 0, z: 5.2, w: 0.9, kind: 'interior', rooms: [room.id] }] };
  const L = new Layout({ bp, room, rng: makeRng(1), hh: { tints: {}, income: 0 } });
  const cx = W - 1.55, box = (name, x, z, w, d, ry) => { const it = { name, floor: true, block: true, ob: mkObb(x, z, w, d, ry) }; L.items.push(it); return it; };      // (the counter's centre: 1.15 m of lane behind it, as L58's, which the 0.3 m shelf and 0.95 m of lane asked 0.1 m more of than the room had)
  box('fridge_meat', cx, 2.69, 1.8, 0.8, -PI / 2);
  box('butcher_block', W - 0.4, 5.05, 0.8, 0.8, -PI / 2);
  return { L, counter: { x: cx, z: 2.69 }, keeper: [cx + 0.9, 2.69] };
}

test('customerFloor: in a 2.4 m shop the spot past the counter\'s far end, which only the keeper\'s lane leads to, is no customer floor; the spot at the near end is, and in a 3.6 m shop both are', () => {
  const narrow = shop(2.43), nearEnd = [0.33, 3.89], farEnd = [0.33, 1.49];
  const plain = narrow.L.connectivity(0.34);
  assert.ok(narrow.L.inMainRegion(...farEnd, plain, 4), 'the far end is reachable by the old rule (the doors reach it: down the keeper\'s lane)');
  const floor = customerFloor(narrow.L, narrow.keeper, isStreet(narrow.L));
  assert.ok(floor, 'the street door has floor to stand on');
  assert.ok(floor.has(...nearEnd), 'the near end of the counter, which the street reaches without passing the keeper, is customer floor');
  assert.ok(!floor.has(...farEnd), 'the far end, reached only down the keeper\'s lane, is not');
  const wide = shop(3.6), floorW = customerFloor(wide.L, wide.keeper, isStreet(wide.L));
  assert.ok(floorW.has(...nearEnd) && floorW.has(...farEnd), 'a wide shop leaves the customers a strip down the counter: both ends are theirs');
  assert.ok(floorW.has(1.2, 2.69), 'and so is the middle of the strip in front of the counter');
  assert.ok(!floorW.has(...wide.keeper), 'the keeper\'s own place is not');
  assert.equal(KEEPER_AISLE, 0.8, 'the aisle people/sim.js keeps a keeper\'s post from the way a customer walks in');
});

test('customerFloor: a shop with no street door, or whose street door is buried in furniture, has nothing to judge by (null); the flood leaves the room as it was', () => {
  const { L, keeper } = shop(2.43), before = L.items.length;
  assert.equal(customerFloor(L, keeper, () => false), null, 'no door counts as the street');
  assert.equal(L.items.length, before, 'the keeper was put in the room for the flood and taken out again');
  const buried = shop(2.43); buried.L.items.push({ name: 'crate', floor: true, block: true, ob: mkObb(1.02, 6.0, 3, 1.4, 0) });
  assert.equal(customerFloor(buried.L, buried.keeper, isStreet(buried.L)), null, 'the street landing is covered: nothing to go by');
});

// ---------------------------------------------------------------- the barrio
const { bps } = await furnishedBatch({ real: true });

test('the barrio: every customer spot of every shop is floor the street reaches without passing the keeper at his post', () => {
  const bad = []; let shops = 0, spots = 0;
  for (const bp of bps) {
    for (const room of bp.rooms ?? []) {
      const L = bp.interior?.layouts?.get(room.id), here = (bp.anchors ?? []).filter((a) => a.room === room.id), posts = here.filter((a) => a.kind === 'counter' && (a.tags ?? []).includes('shopkeeper'));
      if (!L || !posts.length || !bp.frame?.toLocal) continue;
      const local = (a) => { const [x, , z] = bp.frame.toLocal(a.x, a.y, a.z); return [x, z]; };
      const custs = here.filter((a) => a.kind === 'customer');
      if (SAB === 'behind') for (const p of posts) custs.push({ ...p, kind: 'customer', x: p.x + 0.3, id: 'sabotage' });          // a customer standing in the keeper's lane
      if (!custs.length) continue;
      shops++;
      for (const c of custs) {
        const [cx, cz] = local(c), post = posts.map(local).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz))[0];      // (the keeper of the counter it belongs to: the nearest)
        const floor = customerFloor(L, post, isStreet(L));
        if (!floor) continue;
        spots++;
        if (!floor.has(cx, cz)) bad.push(`${room.id} (${bp.interior.rooms?.[room.id]?.shopType}): the customer spot at (${cx.toFixed(2)}, ${cz.toFixed(2)}) is past the keeper at (${post[0].toFixed(2)}, ${post[1].toFixed(2)})`);
      }
    }
  }
  console.log(`# ${shops} shops with a counter, ${spots} customer spots judged`);
  assert.ok(shops >= 5 && spots >= 8, `${shops} shops and ${spots} customer spots to look at (7 and 12 when this was written: the other shops have no keeper anchor to judge by, and the sim finds their keepers' posts itself, off the way in)`);
  assert.deepEqual(bad, [], `${bad.length} customer spots only the keeper's lane leads to`);
});

// INTERIORS: the lane in front of every doorway is deep enough to walk in (round 6, 02e; A2's door walk, R2a-006).
// A2's walk takes the real player through every door of the barrio, at the middle of the opening and 0.1275 m to each side of it, and stops 0.5 m past the door plane. Six doors stopped it 3 mm short
// (L31.d10 L55.d6 L73.d5 L77.d6 L95.d11 L103.d6): the end of a 0.8 x 0.45 m trunk stood 0.75 m in from the wall, and the body's front, 0.3 m ahead of its centre, reaches 0.745 m from the face of a wall
// 0.11 m thick. The floor the layout keeps clear in front of a doorway was 0.75 m deep for a leaf that swings away and 0.7 m for the relaxed and the swept keep-outs (rooms with three doors, bathrooms).
// layout.js `DOOR_LANE` is the one lane of all three now. This test walks the same body, as geometry, against every blocking piece of every room of the barrio (the six doors are the walks that came
// within 0.5 cm here), and holds the three keep-outs of a synthetic room to the depth the walk needs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-doorlane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { Layout, DOOR_LANE, obbDist } from '../js/interiors/layout.js';
import { makeRng } from '../js/core/rng.js';

const BODY = 0.3, ARRIVE = 0.5, FACE = 0.055;                    // the walker's radius; how far past the door plane the walk goes on; the plane's distance from the inner face of a 0.11 m wall
const REACH = 0.01, SLACK = 0.01;                                // a piece may reach 1 cm into a keep-out (Layout.valid's margin); the walk must clear the nearest piece by 1 cm
const NEED = BODY + ARRIVE - FACE + REACH + SLACK;               // 0.765 m of lane, measured from the room's inner face
const OFFS = [0, 0.1275, -0.1275], STEP = 0.005;

/** A 3.4 x 2.9 m room, with a door that swings away on its +z wall and a door that swings in, hinged on the left, on its -x wall. */
function room() {
  const rect = { x0: 0, z0: 0, x1: 3.4, z1: 2.9 }, r = { id: 'T.f0.r0', type: 'bedroom', floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'T', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] },
    doors: [{ id: 'T.d0', x: 0.9, z: 2.9, w: 0.9, kind: 'interior', rooms: [r.id, 'T.f0.r9'], swing: 1 },
      { id: 'T.d1', x: 0, z: 1.5, w: 0.9, kind: 'interior', rooms: [r.id, 'T.f0.r9'], swing: 0, hinge: 'left' }] };
  return new Layout({ bp, room: r, rng: makeRng(1), hh: { tints: {}, income: 0 } });
}
const doorKeeps = (L, id) => L.keep.filter((k) => k.why === 'door' && k.door === id && !k.sweep);

test('the lane: a door that swings away, a door whose keep-out was relaxed and one whose keep-out was swept to the leaf each keep the walk\'s depth clear, and DOOR_LANE is it', () => {
  assert.ok(DOOR_LANE >= NEED, `DOOR_LANE ${DOOR_LANE} m: the walk needs ${NEED.toFixed(3)} m from the inner face (${BODY} + ${ARRIVE} - ${FACE} + ${REACH} + ${SLACK})`);
  const L = room();
  assert.equal(doorKeeps(L, 'T.d0')[0].depth, DOOR_LANE, 'a leaf that swings away from the room keeps the lane in front of it');
  assert.ok(doorKeeps(L, 'T.d1')[0].depth > DOOR_LANE + 0.1, 'a leaf that sweeps in keeps the whole door-wide rectangle until it is swept or relaxed');
  const swept = room(), n = swept.sweepKeeps();
  assert.equal(n, 1, 'the one hinged leaf that swings in was swept');
  assert.ok(doorKeeps(swept, 'T.d1')[0].depth >= NEED, `the swept leaf's lane is ${doorKeeps(swept, 'T.d1')[0].depth} m deep, the walk needs ${NEED.toFixed(3)}`);
  assert.ok(doorKeeps(swept, 'T.d0')[0].depth >= NEED, 'and the door that swings away keeps its lane');
  const relaxed = room(); relaxed.relaxKeeps();
  for (const id of ['T.d0', 'T.d1']) assert.ok(doorKeeps(relaxed, id)[0].depth >= NEED, `${id}: the relaxed keep-out is ${doorKeeps(relaxed, id)[0].depth} m deep, the walk needs ${NEED.toFixed(3)}`);
  assert.equal(doorKeeps(relaxed, 'T.d1')[0].depth, DOOR_LANE, 'a relaxed keep-out is the lane');
});

// ---------------------------------------------------------------- the barrio
const { bps } = await furnishedBatch({ real: true });

test('the barrio: a body of 0.3 m walks in at every door, at the middle and 0.1275 m to each side, to 0.5 m past the door plane, and clears every piece of the room by 1 cm', () => {
  const bad = []; let walks = 0, doors = 0, tight = { slack: Infinity };
  for (const bp of bps) for (const d of bp.doors) {
    if (d.kind === 'shutter') continue;                                                  // (a shop shutter has its own, deeper keep-out)
    const alongX = d.wall?.dir === 'x', at = d.wall?.at; if (at == null) continue;
    doors++;
    for (const rid of d.rooms ?? []) {
      const L = rid && bp.interior?.layouts?.get(rid); if (!L) continue;
      const r = L.room.rect, mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2, n = mid > at ? 1 : -1, u = alongX ? d.x : d.z, blk = L.blockers();
      for (const o of OFFS) {
        let best = Infinity, who = null;
        for (let t = 0; t <= ARRIVE + 1e-9; t += STEP) {
          const x = alongX ? u + o : at + n * t, z = alongX ? at + n * t : u + o;
          for (const b of blk) { const dd = obbDist(b.ob, x, z); if (dd < best) { best = dd; who = b; } }
        }
        walks++;
        const slack = best - BODY, row = { slack, text: `${d.id} into ${rid} (${L.room.type}), ${o >= 0 ? '+' : ''}${o} m off the middle: ${(slack * 100).toFixed(1)} cm from ${who ? `${who.name} ${who.w}x${who.d}` : 'nothing'}` };
        if (slack < tight.slack) tight = row;
        if (slack < SLACK) bad.push(row);
      }
    }
  }
  console.log(`# ${doors} doors, ${walks} walks; the tightest: ${tight.text}`);
  assert.ok(walks >= 5000, `${walks} walks to look at (7 332 when this was written)`);
  bad.sort((a, b) => a.slack - b.slack);
  assert.deepEqual(bad.map((b) => b.text).slice(0, 12), [], `${bad.length} walks come within 1 cm of a piece (or are stopped by it)`);
});

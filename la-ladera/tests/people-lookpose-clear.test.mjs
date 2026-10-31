// lookPose (the reviewers' __ladera.lookAtNpc, owner of the helper: A4; the bystander rule: A1, R3-003): the place it stands the player must have a CLEAR line to the face.
// Two neighbours chatting face to face stand 0.8 m apart, so "straight in front of one" is "0.7 m behind the other": the crosshair rests on the bystander and E talks to
// the wrong person. The pose now skips places with another person on the line of sight (the aim capsule's radius plus a hand) or within a body's width of the spot,
// and falls back to the old first-valid place only when nothing better exists (a crowd must never make the helper fail).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-lookpose-clear.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { personHit } from '../js/core/interact.js';

const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const ph = ctx.physics;

function fresh(hour) {
  for (const [id] of ph.doors) ph.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS), 'the cast is built');
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  return sim;
}
function run(sim, secs, dt = 0.05) { for (let t = 0; t < secs; t += dt) sim.step(dt); }
const body = (n) => ({ x: n.st.x, y: n.st.y + (n.sitH != null ? 1.0 : 1.45), z: n.st.z, radius: 3.2 });          // the item people/world.js registers (the aim capsule hangs on it)
const colocated = (a, b) => Math.hypot(a.st.x - b.st.x, a.st.z - b.st.z) < 0.25;

/** The ray the crosshair makes from the pose to the face: how far to the body of `n`, and which other person's body it meets before that (or null). */
function inTheWay(sim, n, p) {
  const eye = { x: p.feet.x, y: p.eye, z: p.feet.z }, h = p.head, l = Math.hypot(h.x - eye.x, h.y - eye.y, h.z - eye.z), dir = { x: (h.x - eye.x) / l, y: (h.y - eye.y) / l, z: (h.z - eye.z) / l };
  const own = personHit(null, body(n), eye, dir);
  if (!(own >= 0)) return { own, other: 'the ray misses the person it was made for' };
  for (const m of sim.npcs) {
    if (m === n || m.away || colocated(m, n) || Math.abs(m.st.y - n.st.y) > 1.2) continue;
    const t = personHit(null, body(m), eye, dir);
    if (t >= 0 && t < own - 0.05) return { own, other: `${m.id} at ${t.toFixed(2)} m` };
  }
  return null;
}

test('R3-003: at the reviewers\' 1.5 m (and the default 1.3 m) the crosshair on a face has no other person\'s body in front of it', () => {
  const sim = fresh(16.5); run(sim, 10);
  const seen = sim.npcs.filter((n) => !n.away); assert.ok(seen.length >= 60, `${seen.length} people about at half past four`);
  for (const dist of [1.5, 1.3]) {
    const bad = []; let ok = 0;
    for (const n of seen) {
      const p = sim.lookPose(n.id, { dist }); if (!p.ok) continue;
      ok++; const w = inTheWay(sim, n, p); if (w) bad.push(`${n.id} (${w.other})`);
    }
    assert.ok(ok >= seen.length * 0.9, `${ok} of ${seen.length} can be framed at ${dist} m`);
    assert.deepEqual(bad, [], `dist ${dist}: ${bad.length} of ${ok} poses look through another person`);
  }
});

test('R3-003: two neighbours chatting face to face (0.8 m apart): each is framed from the side, never from behind the other', () => {
  const sim = fresh(16.5); run(sim, 10);
  const spare = sim.npcs.filter((n) => !n.away && n.sitH == null);
  let a = null;
  for (const n of spare) { const p = sim.lookPose(n.id, { dist: 1.5 }); if (p.ok && p.bearing === 0 && !sim._bystander(n, p.feet.x, p.feet.z, p.head)) { a = n; break; } }
  assert.ok(a, 'somebody can be framed from straight in front, with nobody near');
  const b = spare.find((n) => n !== a && Math.hypot(n.st.x - a.st.x, n.st.z - a.st.z) > 6);
  b.st.x = a.st.x + Math.sin(a.ry) * 0.8; b.st.z = a.st.z + Math.cos(a.ry) * 0.8; b.st.y = a.st.y; b.ry = a.ry + Math.PI;           // b stands where a is looking, 0.8 m off, looking back
  for (const [x, y] of [[a, b], [b, a]]) {
    const p = sim.lookPose(x.id, { dist: 1.5 });
    assert.ok(p.ok, `${x.id} can still be framed`);
    assert.notEqual(p.bearing, 0, `${x.id}: not from straight in front (that is the back of ${y.id})`);
    assert.equal(inTheWay(sim, x, p), null, `${x.id}: nobody in the way`);
    assert.ok(Math.abs(p.dist - 1.5) < 0.9, `and still at conversation distance (${p.dist} m)`);
  }
});

test('lookPose never fails because of a crowd: with every place crowded the old first valid place is returned', () => {
  const sim = fresh(16.5); run(sim, 10);
  const n = sim.npcs.find((m) => !m.away && m.sitH == null && sim.lookPose(m.id, { dist: 1.5 }).ok);
  sim._bystander = () => false; const open = sim.lookPose(n.id, { dist: 1.5 });
  sim._bystander = () => true; const crowded = sim.lookPose(n.id, { dist: 1.5 });
  assert.ok(open.ok && crowded.ok, 'both are framed');
  assert.deepEqual([crowded.feet, crowded.bearing, crowded.dist], [open.feet, open.bearing, open.dist], 'the first valid place, as before this rule existed');
  delete sim._bystander;
});

test('bystander rule: in front of the person, or at the spot, is in the way; beside the line, behind the person or the player, co-located, indoors or upstairs is not', () => {
  const sim = fresh(16.5), [n, m] = sim.npcs.filter((x) => !x.away);
  const head = { x: 10, y: 1.5, z: 0 }; n.st.x = 10; n.st.z = 0; n.st.y = 0;                                                             // the person at (10, 0); the spot at (8.5, 0): 1.5 m in front
  const put = (x, z, y = 0) => { m.st.x = x; m.st.z = z; m.st.y = y; m.away = false; };
  const spot = (x = 8.5, z = 0) => sim._bystander(n, x, z, head);
  put(9.2, 0.0); assert.equal(spot(), true, 'standing between them (0.8 m from the person)');
  put(9.5, 0.0); assert.equal(spot(), true, 'half a metre in front of the person: their body is entered first');
  put(9.2, 0.35); assert.equal(spot(), true, '0.35 m off the line: within the reach of the aim');
  put(9.2, 0.5); assert.equal(spot(), false, '0.5 m off the line: clear');
  put(10.0, 0.5); assert.equal(spot(), false, 'beside the person');
  put(8.5, 0.3); assert.equal(spot(), true, 'at the spot: the player would be inside them');
  put(8.2, 0.0); assert.equal(spot(), true, '0.3 m behind the spot: too close');
  put(8.0, 0.0); assert.equal(spot(), false, '0.5 m behind the player: not in the way');
  put(10, 0); assert.equal(spot(), false, 'exactly where the person is (two children on one spot of the court): entered at the same distance, no place tells them apart');
  put(9.8, 0.0); assert.equal(spot(), true, '0.2 m in front of the person: their body is entered first');
  put(10.2, 0.1); assert.equal(spot(), false, 'a hand\'s breadth behind the person');
  put(10.4, 0.0); assert.equal(spot(), false, '0.4 m behind the person, on the line: behind it, not in front');
  put(9.2, 0.0, 3.0); assert.equal(spot(), false, 'on another floor');
  put(9.2, 0.0); m.away = true; assert.equal(spot(), false, 'indoors (not drawn)');
  m.away = false; assert.equal(spot(), true, 'and back');
});

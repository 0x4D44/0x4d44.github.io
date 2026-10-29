// Kernel additions by A1: Physics.canStand (headroom for un-crouching / jumping), Physics.surfaceAt (what am I standing on) and the unstick
// (a character wedged inside wall zones is put on the nearest free spot instead of being frozen for good).
//   node --test la-ladera/tests/engine-physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, floorRect, wallsRect } from '../js/core/physics.js';

const flat = () => { const P = new Physics(); P.setTerrain(() => 0); return P; };

test('canStand: open air above the player is fine', () => {
  assert.equal(flat().canStand(0, 0, 0), true);
});

test('canStand: a low soffit between crouched and standing head height blocks standing', () => {
  const P = flat(); P.addFloor(floorRect(0, 0, 4, 4, 0, 1.5));                       // soffit 1.5 m above the ground
  assert.equal(P.canStand(0, 0, 0), false, 'under a 1.5 m soffit');
  assert.equal(P.canStand(5, 0, 0), true, 'beside it');
});

test('canStand: a normal ceiling (2.4 m) and a soffit below crouch height behave', () => {
  const P = flat(); P.addFloor(floorRect(0, 0, 4, 4, 0, 2.4));
  assert.equal(P.canStand(0, 0, 0), true, '2.4 m ceiling leaves room to stand');
  const Q = flat(); Q.addFloor(floorRect(0, 0, 4, 4, 0, 1.1));                       // below crouched head: it is a step/obstacle, not headroom
  assert.equal(Q.canStand(0, 0, 0), true, 'a 1.1 m obstacle does not block standing (the crouched body already shares that space)');
});

test('canStand: the body width counts (a soffit just off-centre still blocks)', () => {
  const P = flat(); P.addFloor(floorRect(0.7, 0, 1, 1, 0, 1.5));                     // covers x 0.2..1.2: the centre (x = 0) is clear, the body is not
  assert.equal(P.canStand(0, 0, 0), false, 'soffit edge within the body radius');
  assert.equal(P.canStand(-0.6, 0, 0), true, 'clear of it');
});

test('canStand as a jump test: a 2.3 m ceiling forbids jumping, 3.2 m allows it', () => {
  const low = flat(); low.addFloor(floorRect(0, 0, 4, 4, 0, 2.3));
  const high = flat(); high.addFloor(floorRect(0, 0, 4, 4, 0, 3.2));
  const jumpOk = (P) => P.canStand(0, 0, 0, { height: 1.78 + 0.7, crouchHeight: 1.78 });
  assert.equal(jumpOk(low), false);
  assert.equal(jumpOk(high), true);
});

test('surfaceAt: terrain, stacked floors and the step-up limit', () => {
  const P = flat();
  P.addFloor(floorRect(0, 0, 4, 4, 0, 0.3, { id: 'step' }));
  P.addFloor(floorRect(0, 0, 4, 4, 0, 3.0, { id: 'upper' }));
  assert.deepEqual(P.surfaceAt(10, 10, 0), { y: 0, id: null, terrain: true });
  const a = P.surfaceAt(0, 0, 0);                                                     // feet at 0: the 0.3 m step is within reach, the 3 m slab is not
  assert.equal(a.id, 'step'); assert.equal(a.terrain, false); assert.ok(Math.abs(a.y - 0.3) < 1e-9);
  assert.equal(P.surfaceAt(0, 0, 2.8).id, 'upper', 'standing on the upper slab');
  assert.equal(P.surfaceAt(0, 0, 0, 0.1).id, null, 'with a 0.1 m reach only the terrain qualifies');
});

test('surfaceAt: a ramp reports its interpolated height', () => {
  const P = new Physics(); P.setTerrain(() => -10);
  P.addFloor({ pts: [[0, 0], [4, 0], [4, 4], [0, 4]], y: 0, px: 0, pz: 0, a: 0, b: 0.5, id: 'ramp' });   // rises 0.5 m per metre of z
  const r = P.surfaceAt(2, 2, 1.0);
  assert.equal(r.id, 'ramp'); assert.ok(Math.abs(r.y - 1.0) < 1e-9);
});

// ---- unstick: wedged inside wall zones (found by tests/stuck.mjs: a jump onto a low furniture outline can land inside a second one) ----
const me = (x, z) => ({ x, y: 0, z, vy: 0, onGround: true });
const clear = (P, s) => !P._overlaps(s.x, s.z, s.y, 0.3, 1.78);
const run = (P, s, dx, dz, frames) => { for (let i = 0; i < frames; i++) P.move(s, dx, dz, 1 / 60); return s; };
/** a hollow outline narrower than the body: every spot inside it overlaps its wall zone (R 0.3 + t 0.01 > half width 0.25) */
const pocket = (P, y1 = 1.7) => P.addWalls(wallsRect(0, 0, 0.5, 0.5, 0, 0, y1, 0.01));
const corridor = (P, y1) => { P.addWall({ x1: -3, z1: -0.25, x2: 3, z2: -0.25, t: 0.01, y0: 0, y1 }); P.addWall({ x1: -3, z1: 0.25, x2: 3, z2: 0.25, t: 0.01, y0: 0, y1 }); };

test('a character wedged inside wall zones is put on the nearest free spot, whichever way it tries to walk', () => {
  for (const [dx, dz] of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.04, 0.04], [-0.04, -0.04]]) {
    const P = flat(); pocket(P);
    const s = run(P, me(0, 0), dx, dz, 3);
    assert.ok(clear(P, s), `still inside a wall zone at ${s.x.toFixed(2)}, ${s.z.toFixed(2)} (heading ${dx}, ${dz})`);
    assert.ok(Math.hypot(s.x, s.z) <= 1.65, `moved ${Math.hypot(s.x, s.z).toFixed(2)} m`);
    assert.equal(s.unstuck, 1, 'counted once');
    run(P, s, dx, dz, 30);
    assert.ok(clear(P, s) && s.unstuck === 1, 'and it walks on freely afterwards');
  }
});

test('it prefers the way it was walking', () => {
  const P = flat(); pocket(P);
  const e = run(P, me(0, 0), 0.05, 0, 2), w = run(P, me(0, 0), -0.05, 0, 2);
  assert.ok(e.x > 0.3 && w.x < -0.3, `east ${e.x.toFixed(2)}, west ${w.x.toFixed(2)}`);
});

test('standing still is not moved, and walking into a wall is blocked, not teleported', () => {
  const P = flat(); pocket(P);
  const still = run(P, me(0, 0), 0, 0, 30);
  assert.deepEqual([still.x, still.z, still.unstuck], [0, 0, undefined]);
  const Q = flat(); Q.addWall({ x1: 5, z1: -10, x2: 5, z2: 10, t: 0.1, y0: 0, y1: 2.6 });
  const s = run(Q, me(4, 0), 0.05, 0, 60);
  assert.equal(s.unstuck, undefined);
  assert.ok(Math.abs(s.x - 4.6) < 0.02 && Math.abs(s.z) < 1e-9, `stands against the wall at ${s.x.toFixed(3)}, ${s.z.toFixed(3)}`);
});

test('furniture outlines are crossed to get out, a room wall is not', () => {
  const low = flat(); corridor(low, 1.0);
  const a = run(low, me(0, 0), 0.05, 0, 3);
  assert.ok(clear(low, a) && a.unstuck === 1 && Math.hypot(a.x, a.z) <= 1.65, `low walls: ${a.x.toFixed(2)}, ${a.z.toFixed(2)}`);
  const tall = flat(); corridor(tall, 2.6);
  const b = run(tall, me(0, 0), 0.05, 0, 30);
  assert.deepEqual([b.x, b.z, b.unstuck], [0, 0, undefined], 'a crack between two room walls: no spot within reach without crossing one');
  assert.equal(b.blocked, true);
});

test('it never lands on another floor or on a slope it could not climb: not the drop, not the steep bank beside the pocket', () => {
  for (const [what, ground] of [['a 3 m drop', (x) => (x < -0.55 ? -3 : 0)], ['a bank too steep to climb', (x) => (x < -0.55 ? (-0.55 - x) * 2 : 0)]]) {
    const P = new Physics(); P.setTerrain(ground); pocket(P);
    const s = run(P, me(0, 0), -0.05, 0, 3);
    assert.ok(clear(P, s) && s.unstuck === 1 && s.y === 0 && s.x > -0.45, `ended at ${s.x.toFixed(2)}, y ${s.y}: the west side, the way it was walking, is ${what}`);
  }
});

test('a slope too steep to climb stops the character; that is not a wedge, so it is not moved', () => {
  const P = new Physics(); P.setTerrain((x) => (x > 5 ? (x - 5) * 3 : 0));
  const s = run(P, me(4, 0), 0.05, 0, 80);
  assert.equal(s.unstuck, undefined);
  assert.ok(s.blocked && s.x > 4.9 && s.x < 5.2, `stopped at ${s.x.toFixed(2)}`);
});

test('a long step (a slow frame) from a pocket relocates, then goes on along the heading', () => {
  const P = flat(); pocket(P);
  const s = run(P, me(0, 0), 0.3, 0, 1);
  assert.ok(clear(P, s) && s.unstuck === 1 && s.x > 0.75, `ended at ${s.x.toFixed(2)}`);
});

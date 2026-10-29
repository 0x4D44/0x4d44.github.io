// Kernel additions by A1: Physics.canStand (headroom for un-crouching / jumping) and Physics.surfaceAt (what am I standing on).
//   node --test la-ladera/tests/engine-physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, floorRect } from '../js/core/physics.js';

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

// Kernel additions by A1: Physics.canStand (headroom for un-crouching / jumping), Physics.surfaceAt (what am I standing on) and the unstick
// (a character wedged inside wall zones, or shut in a sliver it can walk about in but not leave, is put outside instead of being frozen for good).
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
    const s = run(P, me(0, 0), -0.05, 0, 1);                                  // one frame: where it is put (what it does next is up to the player)
    assert.ok(clear(P, s) && s.unstuck === 1 && s.y === 0 && s.x >= -0.55, `put at ${s.x.toFixed(3)}, y ${s.y}: the west side, the way it was walking, is ${what} from x -0.55`);
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

// ---- pockets that are not a full wedge: a sliver the body can move in but not leave -----------------------------------------------------------
/** a closed low outline 0.7 x 1.0 m (t 0.01): the body (R 0.3) fits only in a 0.12 x 0.42 m sliver in the middle, where it can still walk about */
const sliver = (P, y1 = 1.0) => P.addWalls(wallsRect(0, 0, 0.7, 1.0, 0, 0, y1, 0.01));
const outside = (s) => Math.abs(s.x) >= 0.6 || Math.abs(s.z) >= 0.75;

test('a sliver the body can walk about in but not leave is a pocket too: it is put outside, whichever way it pushes', () => {
  for (const [dx, dz] of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.04, 0.04], [-0.04, 0.04]]) {
    const P = flat(); sliver(P);
    const s = run(P, me(0.02, 0.1), dx, dz, 8);
    assert.ok(clear(P, s) && outside(s), `still in the sliver at ${s.x.toFixed(2)}, ${s.z.toFixed(2)} (heading ${dx}, ${dz})`);
    assert.equal(s.unstuck, 1, 'counted once');
    assert.ok(Math.hypot(s.x - 0.02, s.z - 0.1) <= 1.65);
    run(P, s, dx, dz, 30);
    assert.ok(clear(P, s) && s.unstuck === 1, 'and it walks on freely afterwards');
  }
});

test('a lane that goes on is not a pocket: the character walks to its closed end and stops there, unmoved', () => {
  const P = flat();
  P.addWall({ x1: -3, z1: -0.35, x2: 3, z2: -0.35, t: 0.01, y0: 0, y1: 1.0 }); P.addWall({ x1: -3, z1: 0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  P.addWall({ x1: 3, z1: -0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  const s = run(P, me(-2.5, 0), 0.05, 0, 200);
  assert.equal(s.unstuck, undefined, 'never relocated');
  assert.ok(Math.abs(s.x - 2.71) < 0.03 && Math.abs(s.z) < 0.07, `stops at the closed end: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
});

test('inside a small room with tall walls nothing is done: there is no spot within reach that does not cross a wall', () => {
  const P = flat(); P.addWalls(wallsRect(0, 0, 1.1, 1.1, 0, 0, 2.6, 0.06));
  for (const [x, z, dx, dz] of [[0.1, 0.1, 0.05, 0.02], [0.2, 0.2, 0.05, 0.05], [0, 0, -0.05, 0], [-0.2, 0.2, 0, -0.05]]) {
    const s = run(P, me(x, z), dx, dz, 40);
    assert.equal(s.unstuck, undefined, `from ${x}, ${z}`);
    assert.ok(Math.abs(s.x) < 0.25 && Math.abs(s.z) < 0.25, `still inside at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  }
});

test('against a wall in the open the pocket test stops after a handful of trials (every blocked walker runs it every frame)', () => {
  const P = flat(); P.addWall({ x1: 5, z1: -10, x2: 5, z2: 10, t: 0.1, y0: 0, y1: 2.6 });
  let n = 0; const step = P._stepPos.bind(P); P._stepPos = (...a) => { n++; return step(...a); };
  assert.equal(P._pocket(4.6, 0, 0, 0.3, 1.78, 0.5, 0.9), null, 'room to go on');
  assert.ok(n <= 80, `${n} trials`);
  n = 0; pocket(P);
  assert.ok(P._pocket(0, 0, 0, 0.3, 1.78, 0.5, 0.9) === 0 && n === 8, `a full wedge: all eight neighbours refused (${n} trials)`);
  n = 0; const sl = flat(); sliver(sl); const step2 = sl._stepPos.bind(sl); sl._stepPos = (...a) => { n++; return step2(...a); };
  const reach = sl._pocket(0.02, 0.1, 0, 0.3, 1.78, 0.5, 0.9);
  assert.ok(reach > 0.2 && reach < 0.5 && n < 400, `the sliver reaches ${reach} m after ${n} trials`);
});

test('pressing on a wall for a long time costs one search, not one a frame, and a new spot is searched again', () => {
  const P = flat(); P.addWall({ x1: 5, z1: -10, x2: 5, z2: 10, t: 0.1, y0: 0, y1: 2.6 });
  P.addWalls(wallsRect(20, 0, 0.7, 1.0, 0, 0, 1.0, 0.01));
  let n = 0; const pk = P._pocket.bind(P); P._pocket = (...a) => { n++; return pk(...a); };
  const s = run(P, me(4, 0), 0.05, 0, 200);
  assert.ok(Math.abs(s.x - 4.6) < 0.02 && s.unstuck === undefined, `stands against the wall at ${s.x.toFixed(2)}`);
  assert.ok(n >= 1 && n <= 4, `${n} searches in 200 frames`);
  s.x = 20.02; s.z = 0.1;                                                  // carried into a sliver somewhere else: the old answer does not apply there
  run(P, s, 0.05, 0, 8);
  assert.equal(s.unstuck, 1, 'searched again, found a pocket, put outside');
  assert.ok(Math.abs(s.x - 20) >= 0.6 || Math.abs(s.z) >= 0.75, `now at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
});

test('whatever the shape of the pocket, the character is put OUTSIDE it, not just somewhere else in it (120 closed low outlines, random start and heading)', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const inside = (x, z, w, d, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return Math.abs(x * c - z * s) < w / 2 && Math.abs(x * s + z * c) < d / 2; };
  let cases = 0;
  while (cases < 120) {
    const w = 0.60 + rnd() * 0.9, d = 0.60 + rnd() * 1.1, ry = rnd() * Math.PI;
    const sx = (rnd() - 0.5) * w * 0.3, sz = (rnd() - 0.5) * d * 0.3, a = rnd() * Math.PI * 2;
    if (Math.hypot(w - 0.58, d - 0.58) > 0.75) continue;                    // a free band bigger than the search covers is a room, not a pocket
    cases++;
    const P = flat(); P.addWalls(wallsRect(0, 0, w, d, ry, 0, 1.0, 0.01));
    const s = run(P, me(sx, sz), 0.05 * Math.cos(a), 0.05 * Math.sin(a), 60);
    assert.ok(clear(P, s) && !inside(s.x, s.z, w, d, ry), `case ${cases}: ${w.toFixed(2)} x ${d.toFixed(2)} outline, ended at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  }
});

/** Every start 7 cm in from a wall of a W x D outline (the sides and the corners), every heading of 12: where each ends after `frames` frames of 0.04 m. */
function fromTheRim(W, D, h, frames, check) {
  const e = 0.07, ex = W / 2 - e, ez = D / 2 - e;
  let n = 0;
  for (const [sx, sz] of [[ex, 0], [-ex, 0], [0, ez], [0, -ez], [ex, ez], [-ex, ez], [ex, -ez], [-ex, -ez]]) for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6, P = flat(); P.addWalls(wallsRect(0, 0, W, D, 0, 0, h, 0.01));
    assert.equal(clear(P, me(sx, sz)), false, `the start (${sx.toFixed(2)}, ${sz.toFixed(2)}) really overlaps a wall zone`);
    check(run(P, me(sx, sz), 0.04 * Math.cos(a), 0.04 * Math.sin(a), frames), P, `start (${sx.toFixed(2)}, ${sz.toFixed(2)}) heading ${k * 30} deg`, [sx, sz]);
    n++;
  }
  return n;
}

test('A5: a walker 7 cm inside a thin cabinet outline (0.5 x 0.5, 1.7 m high) stepping 0.04 m a frame is put outside at once, on the nearest free spot, not frozen for good (the pocket probe steps 0.12 m, so it saw past the wall)', () => {
  const inside = (s) => Math.abs(s.x) < 0.25 && Math.abs(s.z) < 0.25;
  const n = fromTheRim(0.5, 0.5, 1.7, 1, (s, P, what, [sx, sz]) => {                 // ONE frame: where it is put
    assert.ok(clear(P, s) && !inside(s), `${what}: after 1 frame at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}${inside(s) ? ' (still inside)' : ' (in a wall zone)'}`);
    assert.equal(s.unstuck, 1, `${what}: counted once`);
    const d = Math.hypot(s.x - sx, s.z - sz);
    assert.ok(d <= 0.45, `${what}: put ${d.toFixed(2)} m away (the nearest spot clear of the zone is 0.4 m from here)`);
  });
  assert.equal(n, 96);
  fromTheRim(0.5, 0.5, 1.7, 90, (s, P, what) => assert.ok(clear(P, s) && !inside(s) && s.unstuck === 1, `${what}: after 1.5 s at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}, unstuck ${s.unstuck}: out, and not put out again`));
});

test('a walker 7 cm inside a wardrobe outline (0.9 x 0.7, 1.7 m high) with a free sliver in the middle: out within 20 frames from every side, corner and heading, and then free', () => {
  const inside = (s) => Math.abs(s.x) < 0.45 && Math.abs(s.z) < 0.35;
  fromTheRim(0.9, 0.7, 1.7, 20, (s, P, what) => assert.ok(clear(P, s) && !inside(s), `${what}: after 20 frames at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}${inside(s) ? ' (still inside)' : ' (in a wall zone)'}`));
});

test('rescue: a walker 7 cm inside a thin outline is shut in, not "free" (the pocket probe hops the thin wall by push-out; the stall net used to leave it there)', () => {
  const P = flat(); pocket(P);
  const s = me(0.18, 0), r = P.rescue(s, 0.05, 0);
  assert.equal(r, 'moved'); assert.ok(clear(P, s) && Math.abs(s.x) > 0.25, `put at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`); assert.equal(s.unstuck, 1);
  const free = flat(); pocket(free);
  assert.equal(free.rescue(me(3, 3), 0.05, 0), 'free', 'and one in the open is left alone');
});

// ---- rescue: the runtime net for a pocket nobody drew a way out of (the player's stall timer: keys held, 1.2 s, not 0.1 m further) ------------------
/** a closed low box (t 0.06, 1.0 m high): from 2.6 x 2.6 m the free space inside runs 0.94 m each way from the middle, more than the 0.84 m the automatic escape in move() looks at */
const planter = (P, w = 2.6, d = 2.6, y1 = 1.0) => P.addWalls(wallsRect(0, 0, w, d, 0, 0, y1, 0.06));
const inBox = (s, w = 2.6, d = 2.6) => Math.abs(s.x) < w / 2 && Math.abs(s.z) < d / 2;
/** a 3 x 3 room with tall walls and a 1.2 m gap in the south wall, filled by `gap` ('door' = a shut door, 'wall' = nothing: the room is sealed) */
const room = (P, gap) => {
  const t = 0.06, w = (x1, z1, x2, z2, extra = {}) => P.addWall({ x1, z1, x2, z2, t, y0: 0, y1: 2.6, ...extra });
  w(-1.5, -1.5, 1.5, -1.5); w(-1.5, -1.5, -1.5, 1.5); w(1.5, -1.5, 1.5, 1.5); w(-1.5, 1.5, -0.6, 1.5); w(0.6, 1.5, 1.5, 1.5);
  w(-0.6, 1.5, 0.6, 1.5, gap === 'door' ? { door: 'd1', id: 'd1' } : {});
};

test('rescue: a closed low box 2.6 x 2.6 m is bigger than the automatic window, so walking never leaves it; the rescue puts the walker outside, on the side it wants', () => {
  const P = flat(); planter(P);
  const s = run(P, me(0, 0), 0.05, 0, 180);                                          // three seconds of walking east, to the wall
  assert.ok(inBox(s) && s.unstuck === undefined && s.x > 0.9, `walking only reaches the wall: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  assert.equal(P.rescue(s, 0.05, 0), 'moved');
  assert.ok(!inBox(s) && clear(P, s) && s.unstuck === 1 && s.x > 1.3, `put outside, east: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  assert.equal(P.rescue(s, 0.05, 0), 'free', 'and once outside there is nothing more to do');
  for (const [dx, dz, ok] of [[1, 0, (s) => s.x > 1.3], [-1, 0, (s) => s.x < -1.3], [0, 1, (s) => s.z > 1.3], [0, -1, (s) => s.z < -1.3]]) {
    const t = me(0, 0); assert.equal(P.rescue(t, dx, dz), 'moved');                       // from the middle all four sides are as near: the heading chooses
    assert.ok(!inBox(t) && clear(P, t) && ok(t), `heading ${dx}, ${dz}: ${t.x.toFixed(2)}, ${t.z.toFixed(2)}`);
  }
});

test('rescue: a wall in the open, a long lane and a big room are not pockets: nothing is done, and finding that out costs a few hundred trials', () => {
  const P = flat(); P.addWall({ x1: 5, z1: -10, x2: 5, z2: 10, t: 0.1, y0: 0, y1: 2.6 });
  let n = 0; const step = P._stepPos.bind(P); P._stepPos = (...a) => { n++; return step(...a); };
  const s = me(4.6, 0);
  assert.equal(P.rescue(s, 0.05, 0), 'free');
  assert.deepEqual([s.x, s.z, s.unstuck], [4.6, 0, undefined]);
  assert.ok(n <= 400, `${n} trials against a wall in the open`);
  const lane = flat();
  lane.addWall({ x1: -3, z1: -0.35, x2: 3, z2: -0.35, t: 0.01, y0: 0, y1: 1.0 }); lane.addWall({ x1: -3, z1: 0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  lane.addWall({ x1: 3, z1: -0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  const l = me(2.6, 0); assert.equal(lane.rescue(l, 0.05, 0), 'free', 'the closed end of a 6 m lane'); assert.deepEqual([l.x, l.z, l.unstuck], [2.6, 0, undefined]);
  for (const size of [6, 8]) {
    const big = flat(); big.addWalls(wallsRect(0, 0, size, size, 0, 0, 1.0, 0.06));
    const b = me(0, 0); assert.equal(big.rescue(b, 0.05, 0), 'free', `a ${size} x ${size} m yard: room enough to walk about`); assert.deepEqual([b.x, b.z, b.unstuck], [0, 0, undefined]);
  }
});

test('rescue: a room with a shut door is not a pocket, the door is still shut afterwards (and one that was open stays open), even when the search throws', () => {
  const P = flat(); room(P, 'door');
  const s = me(0, 0);
  assert.equal(P.rescue(s, 0.05, 0), 'free', 'the shut door is a way out');
  assert.deepEqual([s.x, s.z, s.unstuck, P.doorOpen('d1')], [0, 0, undefined, false], 'nobody moved, the door is shut again');
  P.setDoor('d1', true);
  assert.equal(P.rescue(me(0, 0), 0.05, 0), 'free'); assert.equal(P.doorOpen('d1'), true, 'an open door stays open');
  P.setDoor('d1', false);
  const pk = P._pocket; P._pocket = () => { throw new Error('boom'); };
  assert.throws(() => P.rescue(me(0, 0), 0.05, 0), /boom/);
  P._pocket = pk;
  assert.equal(P.doorOpen('d1'), false, 'the door is shut again after a throw');
  assert.equal(P.walls.filter((w) => w.door === 'd1' && !w.on).length, 0);
});

test('rescue: a sealed room with tall walls (a room nobody gave a door) is the last resort: the walker is put through its wall, when nothing else works', () => {
  const P = flat(); room(P, 'wall');
  const s = me(0.2, -0.3);
  assert.equal(P.rescue(s, 0.05, 0), 'crossed');
  assert.ok((Math.abs(s.x) > 1.5 || Math.abs(s.z) > 1.5) && clear(P, s) && s.unstuck === 1, `outside the room: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  const tiny = flat(); tiny.addWalls(wallsRect(0, 0, 1.1, 1.1, 0, 0, 2.6, 0.06));
  const t = me(0.1, 0.1); assert.equal(tiny.rescue(t, 0.05, 0), 'crossed');
  assert.ok((Math.abs(t.x) > 0.55 || Math.abs(t.z) > 0.55) && clear(tiny, t) && t.unstuck === 1, `outside the closet: ${t.x.toFixed(2)}, ${t.z.toFixed(2)}`);
});

test('rescue: a low box inside a closet with tall walls: the only way out leads through a room wall, so that is where it goes', () => {
  const P = flat(); planter(P); P.addWalls(wallsRect(0, 0, 3.0, 3.0, 0, 0, 2.6, 0.06));       // the closet leaves 0.5 m round the box: no body fits there
  const s = me(0.1, 0);
  assert.equal(P.rescue(s, 0.05, 0), 'crossed');
  assert.ok((Math.abs(s.x) > 1.5 || Math.abs(s.z) > 1.5) && clear(P, s) && s.unstuck === 1, `outside the closet: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
});

test('rescue: shut in with no standable spot within 2.4 m past the pocket, even through walls (a closet on a pillar with a 3 m drop all round): nothing is done', () => {
  const P = new Physics(); P.setTerrain((x, z) => (Math.hypot(x, z) < 0.8 ? 0 : -3)); P.addWalls(wallsRect(0, 0, 1.1, 1.1, 0, 0, 2.6, 0.06));
  const s = me(0.1, 0.1);
  assert.equal(P.rescue(s, 0.05, 0), 'shut');
  assert.deepEqual([s.x, s.z, s.unstuck], [0.1, 0.1, undefined]);
});

test('rescue: it never lands on another floor: not on the drop beside the box', () => {
  const P = new Physics(); P.setTerrain((x) => (x > 1.4 ? -3 : 0)); planter(P);                  // a 3 m drop beyond the east wall
  const s = me(0.1, 0); assert.equal(P.rescue(s, 0.05, 0), 'moved');
  assert.ok(s.y === 0 && s.x < 1.4 && !inBox(s) && clear(P, s), `put at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}: east is the drop`);
});

test('rescue: a closed pocket as big as the search takes about a thousand cells, not an unbounded search', () => {
  const P = flat(); planter(P, 4.0, 4.0);
  let n = 0; const step = P._stepPos.bind(P); P._stepPos = (...a) => { n++; return step(...a); };
  const s = me(0, 0); assert.equal(P.rescue(s, 0.05, 0), 'moved');
  assert.ok(!inBox(s, 4, 4) && clear(P, s) && n < 9000, `${n} trials`);
});

test('rescue: the search sizes keep their own visited grids (the automatic window is unchanged by a rescue)', () => {
  const P = flat(); planter(P);
  assert.equal(P._pocket(0, 0, 0, 0.3, 1.78, 0.5, 0.9), null, 'K 7: room to go (0.94 m of free space each way from the middle)');
  assert.ok(P._pocket(0, 0, 0, 0.3, 1.78, 0.5, 0.9, 20) > 1.0, 'K 20: a pocket');
  assert.equal(P._pocket(0, 0, 0, 0.3, 1.78, 0.5, 0.9), null, 'and the small window still answers the same afterwards');
});

test('rescue: a way out up to 2.4 m past the pocket is found (two low boxes one inside the other, the gap between them too narrow to stand in)', () => {
  const P = flat(); planter(P); P.addWalls(wallsRect(0, 0, 3.6, 3.6, 0, 0, 1.0, 0.06));
  const s = me(0, 0); assert.equal(P.rescue(s, 0.05, 0), 'moved');
  assert.ok(Math.abs(s.x) > 1.8 || Math.abs(s.z) > 1.8, `outside the outer box: ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  assert.ok(clear(P, s) && s.unstuck === 1);
});

test('rescue: it asks about the body it is given: a wide body is shut in a lane a narrow one is not, a standing one under a low soffit a crouched one is not', () => {
  const lane = flat();
  lane.addWall({ x1: -3, z1: -0.35, x2: 3, z2: -0.35, t: 0.01, y0: 0, y1: 1.0 }); lane.addWall({ x1: -3, z1: 0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  lane.addWall({ x1: 3, z1: -0.35, x2: 3, z2: 0.35, t: 0.01, y0: 0, y1: 1.0 });
  assert.equal(lane.rescue(me(2.6, 0), 0.05, 0), 'free');
  const w = me(2.6, 0); assert.equal(lane.rescue(w, 0.05, 0, { radius: 0.45 }), 'moved'); assert.ok(Math.abs(w.z) > 0.5, `out of the lane: ${w.z.toFixed(2)}`);
  const soffit = flat(); soffit.addFloor(floorRect(3, 0, 6, 6, 0, 1.5));                       // a slab 1.5 m up over x 0..6
  assert.equal(soffit.rescue(me(1, 0), 0.05, 0, { height: 1.25 }), 'free', 'crouched it can walk out');
  const t = me(1, 0); assert.equal(soffit.rescue(t, 0.05, 0), 'moved'); assert.ok(t.x < 0 && t.unstuck === 1, `standing it is put outside: ${t.x.toFixed(2)}`);
});

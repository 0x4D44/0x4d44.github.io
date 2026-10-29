// node --test la-ladera/tests/physics.test.mjs     (pure Node, no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, wallsRect, floorRect, floorRamp } from '../js/core/physics.js';

const P = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };
const mk = (x = 0, z = 0, y = 0) => ({ x, y, z, vy: 0, onGround: true });
const run = (ph, s, dx, dz, secs = 1, fps = 60) => { const n = Math.round(secs * fps); for (let i = 0; i < n; i++) ph.move(s, (dx / n), (dz / n), 1 / fps, P); return s; };

test('flat ground: walking moves the requested distance', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  const s = run(ph, mk(), 3, 0);
  assert.ok(Math.abs(s.x - 3) < 1e-6 && s.y === 0 && s.onGround);
});

test('a wall blocks and the character slides along it', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addWall({ x1: 2, z1: -5, x2: 2, z2: 5, t: 0.06, y0: 0, y1: 3 });
  const s = run(ph, mk(), 4, 2);                    // diagonal into the wall
  assert.ok(s.x < 2 - 0.3 + 0.01, `stopped at wall (x=${s.x})`);
  assert.ok(s.z > 1.5, `slid along the wall (z=${s.z})`);
});

test('no tunnelling through a thin wall at low frame rate', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addWall({ x1: 1, z1: -5, x2: 1, z2: 5, t: 0.03, y0: 0, y1: 3 });
  const s = mk(); for (let i = 0; i < 20; i++) ph.move(s, 0.8, 0, 0.1, P);   // 8 m/s at 10 fps
  assert.ok(s.x < 1, `x=${s.x}`);
});

test('door: closed blocks, open passes', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addWall({ x1: 2, z1: -5, x2: 2, z2: -0.45, t: 0.06, y0: 0, y1: 3 });
  ph.addWall({ x1: 2, z1: 0.45, x2: 2, z2: 5, t: 0.06, y0: 0, y1: 3 });
  ph.addWall({ x1: 2, z1: -0.45, x2: 2, z2: 0.45, t: 0.04, y0: 0, y1: 2.1, door: 'd1' });
  let s = run(ph, mk(), 4, 0); assert.ok(s.x < 2, 'closed door blocks');
  ph.setDoor('d1', true); s = run(ph, mk(), 4, 0); assert.ok(s.x > 3.9, `open door passes (x=${s.x})`);
});

test('curb 0.3 m is stepped; retaining wall 0.9 m blocks', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addFloor({ pts: [[2, -5], [4, -5], [4, 5], [2, 5]], y: 0.3 });
  ph.addFloor({ pts: [[6, -5], [8, -5], [8, 5], [6, 5]], y: 0.9 });
  let s = run(ph, mk(), 3, 0); assert.ok(Math.abs(s.y - 0.3) < 1e-6 && s.x > 2.9, `curb: y=${s.y} x=${s.x}`);
  s = run(ph, mk(4.5, 0), 3, 0); assert.ok(s.x < 6, `wall blocks x=${s.x}`);
});

test('stairs: ramp climbs to the upper floor, slab hole lets us through, head bump under the slab', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  // upper slab at y=3 with a stairwell hole x in [1,5] z in [-1,0.2]; stair ramp along +x from x=0.5 (y=0) to x=5 (y=3)
  ph.addFloor({ pts: [[-5, -5], [10, -5], [10, -1], [-5, -1]], y: 3 });
  ph.addFloor({ pts: [[-5, 0.2], [10, 0.2], [10, 5], [-5, 5]], y: 3 });
  ph.addFloor({ pts: [[5, -1], [10, -1], [10, 0.2], [5, 0.2]], y: 3 });
  ph.addFloor({ pts: [[-5, -1], [1, -1], [1, 0.2], [-5, 0.2]], y: 3 });
  ph.addFloor(floorRamp([[1, -0.8], [5, -0.8], [5, 0], [1, 0]], [1, -0.4], [5, -0.4], 0, 3));
  const st = { x: 0.2, y: 0, z: -0.4, vy: 0, onGround: true };
  for (let i = 0; i < 240; i++) ph.move(st, 0.04, 0, 1 / 60, P);
  assert.ok(st.y > 2.9 && st.x > 5, `reached top (y=${st.y}, x=${st.x})`);
  // under the slab at x=-2 (y=0): slab above head -> walkable
  const u = mk(-2, 2, 0); run(ph, u, 1, 0); assert.ok(u.y === 0);
});

test('head bump: a ramp that runs under a slab stops where the head would hit', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addFloor({ pts: [[-5, -5], [10, -5], [10, 5], [-5, 5]], y: 3 });                     // solid slab everywhere at y=3
  ph.addFloor(floorRamp([[0, -1], [6, -1], [6, 1], [0, 1]], [0, 0], [6, 0], 0, 3));        // 0 -> 3 m under it
  const st = { x: -0.5, y: 0, z: 0, vy: 0, onGround: true };
  for (let i = 0; i < 300; i++) ph.move(st, 0.03, 0, 1 / 60, P);
  assert.ok(st.y < 3 - 1.78 + 0.1, `stopped below head clearance (y=${st.y})`);
  assert.ok(st.y > 1.0, `but climbed most of the way (y=${st.y})`);
});

test('falling off an edge lands on the lower surface', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addFloor({ pts: [[-5, -5], [2, -5], [2, 5], [-5, 5]], y: 3 });
  const s = mk(0, 0, 3);
  for (let i = 0; i < 90; i++) ph.move(s, 0.05, 0, 1 / 60, P);
  assert.ok(s.x > 2 && s.y === 0 && s.onGround, `y=${s.y}`);
});

test('steep terrain cannot be climbed, gentle slope can', () => {
  const ph = new Physics(); ph.setTerrain((x) => (x > 2 ? Math.min((x - 2) * 3, 20) : 0));    // 300% slope
  let s = run(ph, mk(), 4, 0); assert.ok(s.x < 2.6, `steep blocked x=${s.x}`);
  const ph2 = new Physics(); ph2.setTerrain((x) => Math.max(0, (x - 2) * 0.3));                 // 17 deg
  s = run(ph2, mk(), 6, 0, 3); assert.ok(s.x > 5.9, `gentle ok x=${s.x}`);
});

test('segmentBlocked sees walls and ignores a named door', () => {
  const ph = new Physics(); ph.setTerrain(() => 0);
  ph.addWall({ x1: 2, z1: -3, x2: 2, z2: 3, t: 0.06, y0: 0, y1: 3, door: 'dd' });
  assert.ok(ph.segmentBlocked(0, 0, 4, 0, 0, 1.6));
  assert.ok(!ph.segmentBlocked(0, 0, 4, 0, 0, 1.6, 'dd'));
});

test('wallsRect/floorRect helpers produce consistent shapes', () => {
  const w = wallsRect(10, 10, 4, 6, 0.7, 0, 3), f = floorRect(10, 10, 4, 6, 0.7, 0);
  assert.equal(w.length, 4); assert.equal(f.pts.length, 4);
  assert.ok(Physics.inside(f.pts, 10, 10));
});

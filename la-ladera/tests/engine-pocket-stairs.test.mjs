// The kernel's pocket probe on a stair (review R6, R2a-002 "Te desatascaste ... moved through a room wall"): `Physics._pocket` / `rescue` judged a body shut in whenever the walk out of it
// was cut by a surface 1.78 m above its FEET, and it held the feet at the height it started at. A body on a half landing (1.4 m up) that walked back down the flight met the slab over the
// landing (2.8 m up: 1.4 m above those feet) and the next flight's underside, so on every stair the free space it saw was the half landing and the top of one flight: under the 2.4 m
// that makes a pocket. A walker who ran up the stairs and kept W pressed into the wall at the top was lifted out through the core's wall into the next room or house after 1.2 s
// (299 of 648 presses over the 108 stairs of the barrio) or, with no standable spot within reach, told he was trapped (72). The probe now keeps the feet on the surface under each step.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-pocket-stairs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics, floorRamp } from '../js/core/physics.js';
import { Player } from '../js/engine/player.js';
import { buildData } from './headless.mjs';

const BODY = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9 };
const me = (x, z, y) => ({ x, y, z, vy: 0, onGround: true });

/**
 * A straight 1 m lane between tall walls, going north (+z): the landing z -3..0 under a slab 2.8 m up (the next storey's floor, over z -3..0.9), a flight from z 0 (0.18 m up) to z 2 (1.4 m up), a
 * flat half landing z 2..3 at 1.4 m, and the lane's end wall at z 3. `closed`: a second wall across the foot of the flight, sealing the lane (a pocket on a ramp).
 */
function stair(closed = false) {
  const P = new Physics(); P.setTerrain(() => 0);
  const wall = (x1, z1, x2, z2) => P.addWall({ x1, z1, x2, z2, t: 0.06, y0: -1, y1: 5, id: 'w' });
  wall(-0.5, -3, -0.5, 3); wall(0.5, -3, 0.5, 3); wall(-0.5, 3, 0.5, 3); if (closed) wall(-0.5, 0.2, 0.5, 0.2);
  P.addFloor({ pts: [[-0.5, -3], [0.5, -3], [0.5, 0], [-0.5, 0]], y: 0, id: 'landing' });
  P.addFloor(floorRamp([[-0.5, 0], [0.5, 0], [0.5, 2], [-0.5, 2]], [0, 0], [0, 2], 0.18, 1.4, { id: 'flight' }));
  P.addFloor({ pts: [[-0.5, 2], [0.5, 2], [0.5, 3], [-0.5, 3]], y: 1.4, id: 'half' });
  P.addFloor({ pts: [[-0.5, -3], [0.5, -3], [0.5, 0.9], [-0.5, 0.9]], y: 2.8, id: 'slab' });
  return P;
}

test('a body on the top of a flight, under the slab over the landing, is not shut in: it can walk back down (the feet follow the ramp)', () => {
  const P = stair(), s = me(0, 2.6, 1.4);
  assert.equal(P.rescue(s, 0, 0.05, BODY), 'free');
  assert.deepEqual([s.x, s.z, s.unstuck], [0, 2.6, undefined], 'nobody moved');
  assert.equal(P._pocket(0, 2.6, 1.4, 0.3, 1.78, 0.5, 0.9, 20), null, 'room to go on, down the flight and out over the landing');
  for (const z of [0.3, 0.8, 1.3, 1.9]) { const y = 0.18 + (1.22 * z) / 2, q = me(0, z, y); assert.equal(P.rescue(q, 0, 0.05, BODY), 'free', `half way up the flight (z ${z}, ${y.toFixed(2)} m up)`); }
});

test('and a pocket on a ramp is still found: the foot of the flight walled off, a body on the flight is shut in and put out (through the wall, as the last resort)', () => {
  const P = stair(true), s = me(0, 1.2, 0.18 + (1.22 * 1.2) / 2);
  const how = P.rescue(s, 0, 0.05, BODY);
  assert.ok(how === 'crossed' || how === 'shut', `${how}`);
  const free = stair(), t = me(0, 1.2, 0.18 + (1.22 * 1.2) / 2); assert.equal(free.rescue(t, 0, 0.05, BODY), 'free', 'the same body with the foot open is free');
});

test('the Player: running up a flight and holding W into the wall at the top for 3 s is never "Te desatascaste" and never a hint', () => {
  const P = stair(), events = [], toasts = [];
  const ctx = {
    physics: P, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: {} }, buildings: new Map(), errors: [], running: true,
    events: { emit: (n, d) => events.push([n, d]) }, ui: { toast: (t) => toasts.push(t), prompt() {} }, interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
  };
  const p = new Player(ctx); ctx.player = p;
  p.teleport(0, -1.5, { y: 0.05, yaw: Math.PI }); p.keys.add('KeyW'); p.keys.add('ShiftLeft');                  // yaw pi looks toward +z: up the flight
  for (let i = 0; i < 60 * 5; i++) p.update(1 / 60);
  assert.ok(p.s.z > 2.5 && Math.abs(p.s.y - 1.4) < 0.05, `at the top: z ${p.s.z.toFixed(2)}, ${p.s.y.toFixed(2)} m up`);
  assert.deepEqual([events.filter(([n]) => n === 'player:unstuck').length, toasts.length], [0, 0], 'no stall net');
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- the barrio's own stairs
const data = await buildData({ world: true, furnish: true, clutter: false, vehicles: false });
const events = [], toasts = [];
const ctx = {
  physics: data.ctx.physics, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: {} }, buildings: new Map(), errors: [], running: true,
  events: { emit: (n, d) => events.push([n, d]) }, ui: { toast: (t) => toasts.push(t), prompt() {} }, interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
};
const player = new Player(ctx); ctx.player = player;

test('every half landing of every stair (648 presses: end wall, side wall, the far lane\'s end wall): holding W into the wall for 4 s lifts nobody and traps nobody', { timeout: 600000 }, () => {
  const bad = [];
  let runs = 0;
  for (const bp of data.buildings) {
    const core = bp.shell?.core; if (!core?.nUp) continue;
    const [ox, oz] = core.origin, [ux, uz] = core.U, [sx, sz] = core.S;
    const toUS = (wx, wz) => { const l = bp.frame.toLocal(wx, 0, wz), dx = l[0] - ox, dz = l[2] - oz; return [+(dx * ux + dz * uz).toFixed(2), +(dx * sx + dz * sz).toFixed(2)]; };
    const world = (u, s) => { const q = core.P(u, s), w = bp.frame.toWorld(q[0], 0, q[1]); return [w[0], w[2]]; };
    const fy0 = bp.frame.toWorld(0, 0, 0)[1];
    for (let t = 0; t < core.nUp; t++) for (const [what, from, to] of [['end wall', [0.5, core.lfl + 0.45], [0.5, core.lfl + 3]], ['side wall', [0.5, core.lfl + 0.45], [-3, core.lfl + 0.45]], ['end wall of lane B', [1.55, core.lfl + 0.45], [1.55, core.lfl + 3]]]) {
      const y = fy0 + t * bp.shell.fh + core.nh * core.rise, a = world(...from), b = world(...to);
      player.keys.clear(); player.input = { f: 0, s: 0, sprint: false, jump: false, crouch: false }; events.length = 0; toasts.length = 0;
      player.teleport(a[0], a[1], { y: y + 0.02 }); for (let i = 0; i < 5; i++) player.update(1 / 60);
      if (Math.abs(player.s.y - y) > 0.3) { bad.push(`${bp.id} floor ${t} ${what}: not on the half landing (${(player.s.y - y).toFixed(2)} m off)`); continue; }
      runs++;
      for (let k = 0; k < 240; k++) { const dx = b[0] - player.s.x, dz = b[1] - player.s.z; player.setLook(Math.atan2(-dx, -dz), 0); player.input = { f: 1, s: 0, sprint: false, jump: false, crouch: false }; player.update(1 / 60); }
      const lifted = events.filter(([n]) => n === 'player:unstuck').map(([, e]) => `${e.how} to ${toUS(e.x, e.z)}`);
      if (lifted.length || toasts.length) bad.push(`${bp.id} floor ${t} ${what}: ${lifted.join(', ') || 'no lift'}, ${toasts.length} toasts (${toasts[0] ?? ''})`);
    }
  }
  assert.ok(runs >= 600, `${runs} presses`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} of ${runs} presses were lifted or trapped`);
});

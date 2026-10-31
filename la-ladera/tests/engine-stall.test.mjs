// The player's two review-R2 safety nets, with the real Player and the real kernel under node (owner: A1, js/engine/player.js `_stallNet`, `viewFov`):
//  - the stall net: movement keys held and the body not 0.1 m further after 1.2 s. If the kernel finds it shut in a pocket nobody drew a way out of, it is put
//    outside ('Te desatascaste'); a wall, a shut door or a big room's corner is not a pocket and nothing happens;
//  - the portrait field of view: widened for a tall narrow screen, but never above 90 degrees (at the slider's 100 a phone got 135: a fisheye).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-stall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics, wallsRect } from '../js/core/physics.js';
import { Player, viewFov } from '../js/engine/player.js';

const EAST = -Math.PI / 2, SOUTH = Math.PI;                                                    // yaw 0 looks toward -z; forward = (-sin yaw, -cos yaw)
const POCKET = 'Te desatascaste', HINT = /^Estás atrapado/;

/** a player on flat ground in a world made by build(physics), with a recording ctx; `calls` counts the kernel's rescue() calls */
function world(build, aspect = 16 / 9) {
  const physics = new Physics(); physics.setTerrain(() => 0); build?.(physics);
  const toasts = [], events = [], calls = { rescue: 0, air: 0 };
  const rescue = physics.rescue.bind(physics); physics.rescue = (...a) => { calls.rescue++; calls.way = [a[1], a[2]]; if (!a[0].onGround) calls.air++; return rescue(...a); };
  const ctx = {
    physics, camera: new THREE.PerspectiveCamera(72, aspect, 0.1, 900), settings: { v: {} }, buildings: new Map(), errors: [], running: true,
    events: { emit: (n, d) => events.push([n, d]) }, ui: { toast: (t) => toasts.push(t), prompt() {} },
    interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
  };
  const p = new Player(ctx); ctx.player = p;
  return { ctx, p, toasts, events, calls, physics };
}
const frames = (p, secs, each) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { each?.(i); p.update(1 / 60); } };
const hold = (p, secs, key = 'KeyW') => { p.keys.add(key); frames(p, secs); };
const release = (p, secs) => { p.keys.clear(); frames(p, secs); };
const unstuck = (w) => w.events.filter(([n]) => n === 'player:unstuck');

/** a closed low box 2.6 x 2.6 m: bigger than the kernel's automatic 0.84 m window, so only the net gets a walker out of it */
const planter = (P, h = 1.0) => P.addWalls(wallsRect(0, 0, 2.6, 2.6, 0, 0, h, 0.06));
const inBox = (s) => Math.abs(s.x) < 1.3 && Math.abs(s.z) < 1.3;
/** a 3 x 3 room with tall walls and a 1.2 m gap in the south wall: filled by a shut door ('door'), or by a wall (sealed) */
const room = (P, gap) => {
  const w = (x1, z1, x2, z2, extra = {}) => P.addWall({ x1, z1, x2, z2, t: 0.06, y0: 0, y1: 2.6, ...extra });
  w(-1.5, -1.5, 1.5, -1.5); w(-1.5, -1.5, -1.5, 1.5); w(1.5, -1.5, 1.5, 1.5); w(-1.5, 1.5, -0.6, 1.5); w(0.6, 1.5, 1.5, 1.5);
  w(-0.6, 1.5, 0.6, 1.5, gap === 'door' ? { door: 'd1', id: 'd1' } : {});
};
/** at the east wall inside the box, facing it: blocked from the first frame, so the stall timer starts at 0 */
const atTheWall = (w) => { w.p.teleport(0.9, 0, { yaw: EAST }); return w; };

// ---- the portrait field of view ---------------------------------------------------------------------------------------------------------------
test('viewFov: landscape keeps the setting (the sprint kick added), portrait widens it up to 1.35x but never past 90 degrees', () => {
  assert.equal(viewFov(72, 16 / 9), 72); assert.equal(viewFov(100, 16 / 9, 5), 105); assert.equal(viewFov(72, 1), 72);
  assert.ok(Math.abs(viewFov(55, 390 / 844) - 55 * 1.35) < 1e-9, '55 degrees on a phone: widened by the full 1.35');
  assert.equal(viewFov(72, 390 / 844), 90, '72 on a phone would be 97: held at 90');
  assert.equal(viewFov(100, 390 / 844), 90, 'the slider\'s maximum on a phone was 135');
  assert.equal(viewFov(72, 390 / 844, 5), 90, 'the sprint kick stays inside the cap');
  assert.ok(Math.abs(viewFov(72, 0.75) - 72 * 1.2125) < 1e-9 && viewFov(72, 0.75) < 90, 'a tablet in portrait: widened, under the cap');
  let worst = 0;
  for (let base = 55; base <= 100; base += 5) for (let a = 0.2; a < 1; a += 0.04) for (const kick of [0, 5]) worst = Math.max(worst, viewFov(base, a, kick));
  assert.equal(worst, 90, 'no portrait screen, setting or kick goes above 90');
  for (let a = 0.3; a < 0.98; a += 0.02) assert.ok(viewFov(60, a) >= viewFov(60, a + 0.02) - 1e-9, `a narrower screen never gets a narrower view (${a.toFixed(2)})`);
});

test('the camera takes the clamped field of view in a portrait window and the plain one in a landscape window', () => {
  const tall = world(null, 390 / 844); tall.ctx.settings.v.fov = 100; tall.p.teleport(0, 0); tall.p.update(1 / 60);
  assert.equal(tall.ctx.camera.fov, 90);
  const wide = world(null, 16 / 9); wide.ctx.settings.v.fov = 100; wide.p.teleport(0, 0); wide.p.update(1 / 60);
  assert.equal(wide.ctx.camera.fov, 100);
});

// ---- the stall net -----------------------------------------------------------------------------------------------------------------------------
test('stall net: shut in a closed low box and holding W, the player is put outside after 1.2 s of not getting anywhere, with the toast and the event, and walks on', () => {
  const w = world(planter), { p } = w;
  p.teleport(0, 0, { yaw: EAST }); hold(p, 1.0);                                                  // walks to the east wall (about 0.5 s) and stands against it
  assert.ok(inBox(p.s) && p.s.x > 0.85 && w.toasts.length === 0, `still in the box at ${p.s.x.toFixed(2)}, no toast yet`);
  frames(p, 2.5);
  assert.deepEqual(w.toasts, [POCKET]);
  assert.ok(!inBox(p.s), `put outside: ${p.s.x.toFixed(2)}, ${p.s.z.toFixed(2)}`);
  const ev = unstuck(w); assert.equal(ev.length, 1); assert.equal(ev[0][1].how, 'moved'); assert.equal(w.calls.rescue, 1);
  const x1 = p.s.x; frames(p, 1.0);
  assert.ok(p.s.x > x1 + 1.5 && w.toasts.length === 1, `and it walks on east: ${x1.toFixed(2)} to ${p.s.x.toFixed(2)}`);
});

test('stall net: it puts the player outside on the side it was walking to', () => {
  for (const [what, yaw, there] of [['west', Math.PI / 2, (s) => s.x < -1.3], ['north', 0, (s) => s.z < -1.3], ['south', SOUTH, (s) => s.z > 1.3]]) {
    const w = world(planter); w.p.teleport(0, 0, { yaw }); hold(w.p, 3.5);
    assert.deepEqual(w.toasts, [POCKET], what); assert.ok(there(w.p.s), `${what}: ${w.p.s.x.toFixed(2)}, ${w.p.s.z.toFixed(2)}`);
  }
  const e = world(planter); e.p.teleport(0, 0, { yaw: EAST }); hold(e.p, 3.5);
  assert.ok(e.calls.way[0] > 1 && Math.abs(e.calls.way[1]) < 0.01, `the kernel is told the way it was walking: east is ${e.calls.way.map((v) => v.toFixed(2))}`);
  const n = world(planter); n.p.teleport(0, 0, { yaw: 0 }); hold(n.p, 3.5);
  assert.ok(n.calls.way[1] < -1 && Math.abs(n.calls.way[0]) < 0.01, `north is ${n.calls.way.map((v) => v.toFixed(2))}`);
});

test('stall net: the rescue is no walking: no footstep, no speed, no velocity, and the body is on a spot it can stand on', () => {
  const w = atTheWall(world(planter)), { p } = w;
  const steps = []; w.ctx.events.emit = (n, d) => { if (n === 'player:step') steps.push(d); w.events.push([n, d]); };
  p.keys.add('KeyW'); frames(p, 1.1);
  const before = steps.length; let at = null;
  for (let i = 0; i < 12 && !at; i++) { const x = p.s.x; p.update(1 / 60); if (Math.abs(p.s.x - x) > 0.5) at = { speed: p.speed, vx: p.vx, vz: p.vz, steps: steps.length - before }; }
  assert.ok(at, 'it was moved');
  assert.deepEqual([at.speed, at.vx, at.vz, at.steps], [0, 0, 0, 0]);
  assert.ok(Math.hypot(p.safe.x - p.s.x, p.safe.z - p.s.z) < 0.05, 'and the place it was put on is its safe place now (a fall out of the world restores it)');
  assert.equal(w.physics._overlaps(p.s.x, p.s.z, p.s.y, 0.3, 1.78), false);
});

test('stall net: against a wall in the open, in front of a shut door, and in the corner of a big yard nothing happens (and the kernel is asked once per spot)', () => {
  const cases = [
    ['a wall in the open', (P) => P.addWall({ x1: 5, z1: -10, x2: 5, z2: 10, t: 0.1, y0: 0, y1: 2.6 }), 4, 0, EAST, (s) => s.x > 4.5],
    ['a shut door', (P) => room(P, 'door'), 0, 0, SOUTH, (s) => s.z > 1.05 && s.z < 1.2],
    ['an 8 x 8 m yard', (P) => P.addWalls(wallsRect(0, 0, 8, 8, 0, 0, 1.0, 0.06)), 0, 0, EAST, (s) => s.x > 3.5],
  ];
  for (const [what, build, x, z, yaw, there] of cases) {
    const w = world(build); w.p.teleport(x, z, { yaw });
    hold(w.p, 8);
    assert.ok(there(w.p.s), `${what}: stands against it at ${w.p.s.x.toFixed(2)}, ${w.p.s.z.toFixed(2)}`);
    assert.deepEqual([w.toasts, unstuck(w).length, w.p.s.unstuck], [[], 0, undefined], what);
    assert.equal(w.calls.rescue, 1, `${what}: asked once, not every frame`);
    if (what === 'a shut door') assert.equal(w.physics.doorOpen('d1'), false, 'the door is still shut');
  }
});

test('stall net: the 0.1 m rule: a body that stays within 0.1 m of where it was is stalled, one that creeps on is not', () => {
  const drive = (step, back) => {
    const w = world((P) => P.addWalls(wallsRect(0, 0, 8, 8, 0, 0, 1.0, 0.06))); w.p.teleport(0, 0); assert.equal(w.p.s.onGround, true);
    let dir = 1;
    for (let i = 0; i < 120; i++) { if (i % 6 === 0) { w.p.s.x += dir * step; if (back) dir = -dir; } w.p._stallNet(1 / 60, true, 1, 0, 1.78); }
    return w.calls.rescue;
  };
  assert.equal(drive(0.05, true), 1, 'a body that shuffles 0.05 m back and forth for 2 s is stalled: the kernel is asked, once');
  assert.equal(drive(0.15, false), 0, 'a body that creeps 0.15 m every tenth of a second is getting somewhere');
});

test('stall net: walking across open ground never asks the kernel anything', () => {
  const w = world((P) => P.addWalls(wallsRect(30, 0, 2.6, 2.6, 0, 0, 1.0, 0.06))); w.p.teleport(-20, 0, { yaw: EAST });
  hold(w.p, 8);
  assert.ok(w.p.s.x > -20 + 8 * 2.0, `walked ${w.p.s.x.toFixed(1)}`);
  assert.equal(w.calls.rescue, 0);
});

test('stall net: a sealed room nobody gave a door: the player is put through its wall as the last resort (toast, and the event says so)', () => {
  const w = world((P) => room(P, 'wall')), { p } = w;
  p.teleport(0, 0, { yaw: EAST }); hold(p, 4);
  assert.deepEqual(w.toasts, [POCKET]);
  assert.ok(Math.abs(p.s.x) > 1.5 || Math.abs(p.s.z) > 1.5, `outside the room: ${p.s.x.toFixed(2)}, ${p.s.z.toFixed(2)}`);
  const ev = unstuck(w); assert.equal(ev.length, 1); assert.equal(ev[0][1].how, 'crossed');
});

test('stall net: shut in with nowhere to stand within reach (a closet on a pillar, a drop all round): a hint about the pause menu, not every 1.2 s, nobody moved', () => {
  const w = world((P) => { P.setTerrain((x, z) => (Math.hypot(x, z) < 0.8 ? 0 : -3)); P.addWalls(wallsRect(0, 0, 1.1, 1.1, 0, 0, 2.6, 0.06)); }), { p } = w;
  p.teleport(0.1, 0.1, { yaw: EAST }); hold(p, 4);
  assert.equal(w.toasts.length, 1); assert.match(w.toasts[0], HINT); assert.match(w.toasts[0], /Volver al punto de partida/);
  assert.ok(Math.hypot(p.s.x, p.s.z) < 0.8 && unstuck(w).length === 0, 'still in the closet');
  hold(p, 6); assert.equal(w.toasts.length, 1, 'the same spot does not nag');
  release(p, 1.0); hold(p, 3); assert.equal(w.toasts.length, 1, 'a second try a few seconds later: still no second hint');
  release(p, 20); hold(p, 3); assert.equal(w.toasts.length, 2, 'twenty seconds later it may say it again'); assert.match(w.toasts[1], HINT);
});

test('stall net: not during a conversation or while sitting, and the clock starts over afterwards', () => {
  const w = atTheWall(world(planter)), { p } = w;
  p.lock('dialogue'); hold(p, 5);
  assert.equal(w.toasts.length, 0, 'locked: keys do nothing, so nothing is stuck');
  p.unlock('dialogue'); frames(p, 0.6); assert.equal(w.toasts.length, 0, '0.6 s after the conversation: the clock started over'); frames(p, 1.6); assert.deepEqual(w.toasts, [POCKET]);
  const s = atTheWall(world(planter)); s.ctx.interiorSit = { active: { building: 'L01' } }; hold(s.p, 5);
  assert.equal(s.toasts.length, 0, 'sitting: the body stays on its feet by the seat and any key stands you up');
});

test('stall net: brief key releases do not start it over, a long one does; with no key held nothing is ever asked', () => {
  const a = atTheWall(world(planter));
  hold(a.p, 0.8); release(a.p, 0.3); hold(a.p, 0.3); assert.equal(a.toasts.length, 0, '1.1 s held in all');
  hold(a.p, 0.3); assert.deepEqual(a.toasts, [POCKET], 'a 0.3 s gap does not matter: 1.2 s held in all');
  const b = atTheWall(world(planter));
  hold(b.p, 0.8); release(b.p, 0.7); hold(b.p, 0.8); assert.equal(b.toasts.length, 0, 'a 0.7 s release starts it over');
  hold(b.p, 0.6); assert.deepEqual(b.toasts, [POCKET]);
  const d = atTheWall(world(planter));
  hold(d.p, 0.4); release(d.p, 0.3); hold(d.p, 0.4); release(d.p, 0.3); hold(d.p, 0.3); assert.equal(d.toasts.length, 0, '1.1 s held in all'); hold(d.p, 0.2);
  assert.deepEqual(d.toasts, [POCKET], 'two 0.3 s gaps are two brief releases, not one long one');
  const c = atTheWall(world(planter)); frames(c.p, 12);
  assert.deepEqual([c.toasts.length, c.calls.rescue, inBox(c.p.s)], [0, 0, true], 'standing still in a pocket is not a stall: the player is not trying to go anywhere');
});

test('stall net: a trapped player who hops is rescued too (the frames in the air count, the check waits for the ground; a 1.4 m wall is too high to hop over)', () => {
  const w = atTheWall(world((P) => planter(P, 1.4))), { p } = w;
  p.keys.add('KeyW');
  frames(p, 4, (i) => { p.input.jump = i % 20 < 10; });                                          // a hop about every third of a second
  assert.deepEqual(w.toasts, [POCKET]); assert.ok(!inBox(p.s));
  assert.equal(unstuck(w)[0][1].how, 'moved'); assert.equal(w.calls.air, 0, 'the kernel was only asked with the feet on the ground');
});

test('stall net: a crouched player is asked about as a crouched body (under a low slab it is against a wall, not in a pocket: a standing body could not even be there)', () => {
  const w = world((P) => { P.addFloor({ pts: [[0, -3], [6, -3], [6, 3], [0, 3]], y: 1.5 }); P.addWall({ x1: 3, z1: -3, x2: 3, z2: 3, t: 0.06, y0: 0, y1: 2.6 }); }), { p } = w;     // a slab 1.5 m up over x 0..6, a wall across it at x 3
  p.teleport(-0.5, 0, { yaw: EAST }); p.keys.add('KeyC'); frames(p, 0.6); p.keys.add('KeyW'); frames(p, 5);
  assert.ok(p.s.x > 2.5 && p.s.x < 2.7, `crouched, it walked in under the slab to the wall: ${p.s.x.toFixed(2)}`);
  assert.deepEqual([w.calls.rescue, w.toasts.length], [1, 0], 'asked once, as a crouched body: room to go back, so not a pocket');
});

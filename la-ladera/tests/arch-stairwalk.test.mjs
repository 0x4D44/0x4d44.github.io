// A2: the stairs, walked by the REAL player in the page's world (guard walls, props, furniture), with the player's own stall net on (review R6: R2a-001, R2a-002).
//  * R2a-001: L31's stair could not be walked up from floor 1 to 2 or from 2 to 3: the retaining boxes' invisible guard lines (world/walls.js) ran on through the building and one stood across the
//    half landing, so the walker stopped at y 11.35 and 14.15 and only a jump got him onto the next flight. 28 of the 109 buildings had a guard line inside the footprint. The lines now stop at the outline
//    (`outsideLots`) and a lip of 0.15 m over the floor goes on inside it (id 'lip': it keeps the box under the building shut to a body on the pad, world-mesh), and the sweep below walks every flight of
//    every stair up, down and crouched: all of them arrive, nobody is lifted by the stall net.
//  * R2a-002: the nook under the first flight is closed by a panel; the panel was a room wall (2.8 m) and the nook is a pocket, so a body put there (a teleport onto the divider line, R2a's
//    "arch + 1.2 m", or the push-out from the divider's end) was 'crossed' by the stall net through the core's outer wall into the next room or the next house (74 of 102 stairwells, 54 of them into another
//    room or house). The panel now stops at NOOK_H (1.9 m): a jump cannot clear it, the rescue may cross it, and the body lands on the landing in front of it.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-stairwalk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildData } from './headless.mjs';
import { Player } from '../js/engine/player.js';
import { Physics } from '../js/core/physics.js';
import { outsideLots, splitAtLots, FLOOR_LIP } from '../js/world/walls.js';
import { NOOK_H } from '../js/arch/colliders.js';

const data = await buildData({ world: true, furnish: true, clutter: false, vehicles: false });
const physics = data.ctx.physics, B = data.buildings;
const events = [], toasts = [];
const ctx = {
  physics, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: {} }, buildings: new Map(), errors: [], running: true,
  events: { emit: (n, d) => events.push([n, d]) }, ui: { toast: (t) => toasts.push(t), prompt() {} },
  interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
};
const player = new Player(ctx); ctx.player = player;
const idle = () => { player.keys.clear(); player.input = { f: 0, s: 0, sprint: false, jump: false, crouch: false }; events.length = 0; toasts.length = 0; };
const at = (x, z, y) => { idle(); player.teleport(x, z, { y: y + 0.05 }); for (let i = 0; i < 3; i++) player.update(1 / 60); };
/** hold forward toward (tx, tz) for up to `max` frames; `until` may stop it early */
function push(tx, tz, max = 300, o = {}) {
  for (let k = 0; k < max && !events.some(([n]) => n === 'player:unstuck'); k++) {
    const dx = tx - player.s.x, dz = tz - player.s.z;
    if (o.arrive && Math.hypot(dx, dz) < o.arrive) return true;
    player.setLook(Math.atan2(-dx, -dz), 0); player.input = { f: 1, s: 0, sprint: !!o.sprint, jump: false, crouch: !!o.crouch }; player.update(1 / 60);
  }
  return false;
}
const unstuck = () => events.filter(([n]) => n === 'player:unstuck').map(([, e]) => e);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- R2a-001: guard lines
const inPoly = (f, x, z) => { let c = false; for (let i = 0, j = f.length - 1; i < f.length; j = i++) { const a = f[i], b = f[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
/** The buildings whose outer rectangle (shrunk 5 cm) holds a point of a guard line of `walls` (the retaining boxes' invisible walls: id 'guard'). */
function guardsInside(walls, buildings) {
  const hit = new Set();
  for (const w of walls) {
    if (w.id !== 'guard') continue;
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1), n = Math.max(1, Math.ceil(len / 0.1));
    for (const bp of buildings) {
      const o = bp.shell.outer, pad = 0.05;
      for (let i = 0; i <= n; i++) {
        const l = bp.frame.toLocal(w.x1 + ((w.x2 - w.x1) * i) / n, 0, w.z1 + ((w.z2 - w.z1) * i) / n);
        if (l[0] > o.x0 + pad && l[0] < o.x1 - pad && l[2] > o.z0 + pad && l[2] < o.z1 - pad) { hit.add(bp.id); break; }
      }
    }
  }
  return [...hit].sort();
}

test('outsideLots: a guard line stops at a building outline, whichever way the footprint winds and wherever the line cuts it', () => {
  const sq = [[0, 0], [4, 0], [4, 6], [0, 6]], r2 = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)));
  for (const f of [sq, [...sq].reverse()]) {
    assert.deepEqual(r2(outsideLots({ x1: -3, z1: 3, x2: 7, z2: 3 }, [f])), [[[-3, 3], [0, 3]], [[4, 3], [7, 3]]], 'a line across the building keeps its two ends');
    assert.deepEqual(r2(outsideLots({ x1: -3, z1: 3, x2: 2, z2: 3 }, [f])), [[[-3, 3], [0, 3]]], 'a line that ends inside keeps the part outside');
    assert.deepEqual(r2(outsideLots({ x1: 1, z1: 2, x2: 3, z2: 5 }, [f])), [], 'a line wholly inside is dropped');
    assert.deepEqual(r2(outsideLots({ x1: -3, z1: 8, x2: 7, z2: 8 }, [f])), [[[-3, 8], [7, 8]]], 'a line clear of it is kept whole');
    assert.deepEqual(r2(outsideLots({ x1: 4.2, z1: -2, x2: 4.2, z2: 9 }, [f])), [[[4.2, -2], [4.2, 9]]], 'a line 20 cm outside a wall, along it, is kept');
    assert.deepEqual(r2(outsideLots({ x1: 3.8, z1: -2, x2: 3.8, z2: 9 }, [f])), [[[3.8, -2], [3.8, 0]], [[3.8, 6], [3.8, 9]]], 'and one 20 cm inside it is cut at the two ends');
  }
  const turned = sq.map(([x, z]) => [10 + x * 0.8 - z * 0.6, 5 + x * 0.6 + z * 0.8]);                  // the same 4 x 6 plot turned by 37 degrees
  const cut = outsideLots({ x1: 0, z1: 8, x2: 20, z2: 8 }, [turned]);
  assert.equal(cut.length, 2, 'a turned plot cuts a line in two'); assert.ok(inPoly(turned, 10 + 2 * 0.8 - 3 * 0.6, 5 + 2 * 0.6 + 3 * 0.8), 'its middle is inside');
  for (const piece of cut) for (const k of [0.1, 0.5, 0.9]) assert.ok(!inPoly(turned, piece[0][0] + (piece[1][0] - piece[0][0]) * k, piece[0][1] + (piece[1][1] - piece[0][1]) * k), 'no kept piece runs through the plot');
  const two = outsideLots({ x1: -3, z1: 3, x2: 12, z2: 3 }, [sq, [[6, 0], [9, 0], [9, 6], [6, 6]]]);
  assert.deepEqual(r2(two), [[[-3, 3], [0, 3]], [[4, 3], [6, 3]], [[9, 3], [12, 3]]], 'two plots with a lane between them: the lane keeps its piece');
});

test('R2a-001: no guard line of the page\'s world runs through a building (28 of the 109 had one), and the check can fail', () => {
  const walls = physics.walls.filter((w) => w.id === 'guard');
  assert.ok(walls.length > 300, `${walls.length} guard lines in the world`);
  assert.deepEqual(guardsInside(walls, B), [], 'guard lines inside a building');
  const bp = B.find((q) => q.id === 'L31'), o = bp.shell.outer, a = bp.frame.toWorld(o.x0 - 2, 0, (o.z0 + o.z1) / 2), b = bp.frame.toWorld(o.x1 + 2, 0, (o.z0 + o.z1) / 2);
  const planted = [...walls, { id: 'guard', x1: a[0], z1: a[2], x2: b[0], z2: b[2] }];
  assert.ok(guardsInside(planted, B).includes('L31'), 'a planted line across L31 is found (and across its neighbours: it runs 2 m past each side)');
  assert.deepEqual(guardsInside([{ id: 'guard', x1: a[0], z1: a[2], x2: bp.frame.toWorld(o.x0 + 0.04, 0, (o.z0 + o.z1) / 2)[0], z2: bp.frame.toWorld(o.x0 + 0.04, 0, (o.z0 + o.z1) / 2)[2] }], [bp]), [], 'a line that ends in the wall (4 cm in) is no line through the building');
});

test('splitAtLots: the pieces of a line inside a footprint come back too, each with the footprint it lies in', () => {
  const sq = [[0, 0], [4, 0], [4, 6], [0, 6]], r2 = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)));
  for (const f of [sq, [...sq].reverse()]) {
    assert.deepEqual(r2(splitAtLots({ x1: -3, z1: 3, x2: 7, z2: 3 }, [f])), { out: [[[-3, 3], [0, 3]], [[4, 3], [7, 3]]], inn: [[[0, 3], [4, 3], 0]] }, 'a line across the building: two ends outside, the middle inside');
    assert.deepEqual(r2(splitAtLots({ x1: 1, z1: 2, x2: 3, z2: 5 }, [f])), { out: [], inn: [[[1, 2], [3, 5], 0]] }, 'a line wholly inside is all inside');
    assert.deepEqual(r2(splitAtLots({ x1: -3, z1: 8, x2: 7, z2: 8 }, [f])), { out: [[[-3, 8], [7, 8]]], inn: [] }, 'a line clear of it is all outside');
  }
  const two = splitAtLots({ x1: -3, z1: 3, x2: 12, z2: 3 }, [sq, [[6, 0], [9, 0], [9, 6], [6, 6]]]);
  assert.deepEqual(r2(two.inn), [[[0, 3], [4, 3], 0], [[6, 3], [9, 3], 1]], 'two plots: each piece names its own');
  assert.deepEqual(r2(two.out), r2(outsideLots({ x1: -3, z1: 3, x2: 12, z2: 3 }, [sq, [[6, 0], [9, 0], [9, 6], [6, 6]]])), 'outsideLots is the outside half');
});

/**
 * Cutting the guard lines off at the building outline (R2a-001) left the retaining box open under the building to a body on its pad (0.3 m under the floor): world-mesh's walkers of the far side, who start
 * on a lot's pad, ended inside the box. What stands of a line inside a building is a lip, FLOOR_LIP over the floor (walls.js): the kernel lets a wall hold a body whose feet are over 0.4 m under its top.
 */
test('R2a-001, the box under a building: of every guard line that ran through one only a lip stands (id lip, 0.15 m over the floor): a body on the floor walks over it, a body on the pad is held by it', () => {
  const lips = physics.walls.filter((w) => w.id === 'lip');
  assert.ok(lips.length > 20, `${lips.length} lips in the world`);
  const mid = (w) => [(w.x1 + w.x2) / 2, (w.z1 + w.z2) / 2], lotOf = (w) => B.find((bp) => inPoly(bp.footprint, ...mid(w)));
  /** does a body with its feet at `y` walk across the middle of `w` (0.8 m before it to 0.8 m past it, 5 cm a frame) in a kernel that holds `walls` only? */
  const crosses = (w, y, walls) => {
    const k = new Physics(); k.setTerrain(() => y); k.addWalls(walls);
    const [mx, mz] = mid(w), l = Math.hypot(w.x2 - w.x1, w.z2 - w.z1), nx = -(w.z2 - w.z1) / l, nz = (w.x2 - w.x1) / l;
    const s = { x: mx - nx * 0.8, y, z: mz - nz * 0.8, vy: 0, onGround: true };
    for (let i = 0; i < 40; i++) k.move(s, nx * 0.05, nz * 0.05, 1 / 60);
    return (s.x - mx) * nx + (s.z - mz) * nz > 0.3;
  };
  const wrong = [], inside = [];
  for (const w of lips) {
    const bp = lotOf(w);
    if (!bp) { wrong.push(`lip at ${mid(w).map((v) => v.toFixed(1))}: in no building`); continue; }
    if (w.y1 > bp.lot.y + FLOOR_LIP + 1e-9) wrong.push(`${bp.id}: a lip ${(w.y1 - bp.lot.y).toFixed(2)} m over the floor`);
    inside.push([w, bp]);
  }
  assert.deepEqual(wrong.slice(0, 6), []);
  const heldFloor = [], loose = [];
  for (const [w, bp] of inside) {                                                              // head on at the middle of each piece, however short: its zone is a disc round it
    if (!crosses(w, bp.lot.y, [w])) heldFloor.push(bp.id);                                    // on the floor: nothing holds him
    if (crosses(w, bp.lot.y - 0.3, [w])) loose.push(bp.id);                                    // on the pad (the lot's own ground, 0.3 m under the floor): the lip holds him
  }
  assert.deepEqual(heldFloor, [], 'a body on the floor is held by a lip');
  assert.deepEqual(loose, [], 'a body on the pad walks across a lip');
  // TEETH: the check sees both faults. A piece 2 m taller than the lip (the old full-height guard line) holds a body on the floor; with no wall at all a body on the pad walks across.
  const [w, bp] = inside[0];
  assert.equal(crosses(w, bp.lot.y, [{ ...w, y1: bp.lot.y + 2 }]), false, 'TEETH: a full-height line holds a body on the floor');
  assert.equal(crosses(w, bp.lot.y - 0.3, []), true, 'TEETH: without the lip a body on the pad walks across');
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- R2a-001: every flight, walked
test('every flight of every stair is walked up, down and crouched by the real player, with the stall net on and never used (648 walks)', { timeout: 600000 }, () => {
  const fails = [], used = [];
  let walks = 0;
  for (const bp of B) for (const [i, s] of (bp.stairs ?? []).entries()) {
    if (!s.path?.length) continue;
    const pts = s.path.map(([x, z, y]) => bp.frame.toWorld(x, y, z));
    for (const mode of ['up', 'down', 'crouch']) {
      const seq = mode === 'down' ? [...pts].reverse() : pts;
      at(seq[0][0], seq[0][2], seq[0][1]);
      const y0 = player.s.y;
      let ok = true;
      for (let k = 1; k < seq.length && ok; k++) {
        ok = false;
        for (let f = 0; f < 240 && !ok; f++) {
          const dx = seq[k][0] - player.s.x, dz = seq[k][2] - player.s.z;
          if (Math.hypot(dx, dz) < 0.3) { ok = true; break; }
          player.setLook(Math.atan2(-dx, -dz), 0); player.input = { f: 1, s: 0, sprint: mode !== 'crouch', jump: false, crouch: mode === 'crouch' }; player.update(1 / 60);
        }
      }
      const last = seq[seq.length - 1];
      if (Math.abs(y0 - seq[0][1]) >= 0.3) continue;                                        // the start itself is not on this flight's floor (a stair that begins on a stoop): not a walk
      walks++;
      if (!ok || Math.abs(player.s.y - last[1]) > 0.35) fails.push(`${bp.id}.s${i} ${mode}: stopped at y ${(player.s.y - bp.frame.y).toFixed(2)} (local), wanted ${(last[1] - bp.frame.y).toFixed(2)}`);
      if (unstuck().length) used.push(`${bp.id}.s${i} ${mode}: the stall net lifted the walker (${unstuck().map((e) => e.how).join(', ')})`);
    }
  }
  assert.ok(walks >= 600, `${walks} walks`);
  assert.deepEqual(fails, [], `${fails.length} of ${walks} walks did not arrive`);
  assert.deepEqual(used, [], 'the stall net had to lift a walker');
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- R2a-002: the nook
const inRect = (r, x, z) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
/** Where a body at world (x, y, z) is: 'core' (the stairwell or its landing), 'outside' (no building), or the room / the building it was lifted into. */
function where(bp, wx, wy, wz) {
  const l = bp.frame.toLocal(wx, wy, wz), fl = Math.max(0, Math.round(l[1] / bp.shell.fh));
  const room = bp.rooms.find((r) => !r.outdoor && r.floor === fl && inRect(r.rect, l[0], l[2]));
  if (room) return room.type === 'stairwell' || room.type === 'landing' || room.core ? 'core' : `room ${room.id} (${room.type})`;
  for (const o of B) if (o !== bp && inPoly(o.footprint, wx, wz)) return `building ${o.id}`;
  return inPoly(bp.footprint, wx, wz) ? 'inside the footprint, in no room' : 'outside';
}
const frameOf = (bp) => {
  const core = bp.shell.core, [ox, oz] = core.origin, [ux, uz] = core.U, [sx, sz] = core.S, fy = bp.frame.toWorld(0, 0, 0)[1];
  return {
    core, fy,
    world: (u, s) => { const q = core.P(u, s), w = bp.frame.toWorld(q[0], 0, q[1]); return [w[0], w[2]]; },
    us: (wx, wz) => { const l = bp.frame.toLocal(wx, 0, wz), dx = l[0] - ox, dz = l[2] - oz; return [+(dx * ux + dz * uz).toFixed(2), +(dx * sx + dz * sz).toFixed(2)]; },
  };
};
const cores = B.filter((bp) => bp.shell.core?.nUp > 0 && bp.shell.core.nooks.length);

test('the nook panel is a wall the jump cannot clear and the rescue may cross: 1.06 m or more, under 2 m', () => {
  assert.ok(cores.length >= 100, `${cores.length} stair cores`);
  assert.ok(NOOK_H >= 1.06 && NOOK_H < 2.0, `NOOK_H ${NOOK_H}: the jump apex (0.66 m) plus the kernel's 0.4 m wall clearance is 1.06 m; a wall 2 m or more above the feet is a room wall the rescue will not cross`);
  const bad = [];
  for (const bp of cores) {
    const w = bp.colliders.walls.find((q) => q.id === `${bp.id}.nook0`);
    if (!w) bad.push(`${bp.id}: no nook panel`); else if (Math.abs(w.y1 - w.y0 - NOOK_H) > 1e-6) bad.push(`${bp.id}: panel ${(w.y1 - w.y0).toFixed(2)} m`);
  }
  assert.deepEqual(bad.slice(0, 8), []);
});

test('R2a-002: a body put in the nook under the first flight and pushed deeper is lifted OUT onto the landing, never through the core\'s wall into the next room or house (102 stairwells)', { timeout: 600000 }, () => {
  const bad = [];
  let ran = 0, lifted = 0;
  for (const bp of cores) {
    const f = frameOf(bp), { core } = f, uB = core.fw + core.div + core.fw / 2;
    for (const s of [0.7, 1.3]) {
      const start = f.world(uB, s), far = f.world(uB, s + 3);                           // in the middle of lane B under the flight, pushing toward its low end
      at(start[0], start[1], f.fy);
      if (Math.abs(player.s.y - f.fy) > 0.3) continue;
      ran++;
      push(far[0], far[1], 300);
      for (const e of unstuck()) {
        lifted++;
        const w = where(bp, e.x, e.y, e.z);
        if (e.how !== 'moved' || (w !== 'core' && w !== 'outside')) bad.push(`${bp.id} from s ${s}: ${e.how} to ${w}`);
      }
    }
  }
  assert.ok(ran >= 150, `${ran} pushes`); assert.ok(lifted >= 100, `${lifted} bodies lifted: the nook is a pocket, the net must act`);
  assert.deepEqual(bad, [], `${bad.length} bodies crossed a room wall`);
});

test('R2a-002 as R2a ran it: L14, from the arch centre + 1.2 m along its normal toward the deep end of lane B (his (15.06, 96.56)): the body ends on the landing', () => {
  const bp = B.find((q) => q.id === 'L14'), d = bp.doors.find((q) => q.id === 'L14.d0'), f = frameOf(bp);
  const c = bp.frame.toWorld(d.x, 0, d.z), cn = bp.frame.toWorld(d.x + d.nx, 0, d.z + d.nz), nx = cn[0] - c[0], nz = cn[2] - c[2];
  const tg = f.world(1.72, 1.57);
  assert.ok(Math.hypot(tg[0] - 15.06, tg[1] - 96.56) < 0.05, `the target is his: ${tg.map((v) => v.toFixed(2))}`);
  const start = f.us(c[0] + nx * 1.2, c[2] + nz * 1.2);
  assert.ok(Math.abs(start[0] - 1.01) < 0.02 && start[1] > 0.05 && start[1] < 0.3, `his spot is on the divider line, ${start[1]} m past the start of the lanes (the landing is 1.0 m deep): nobody walks there, a teleport put him in it`);
  at(c[0] + nx * 1.2, c[2] + nz * 1.2, c[1]);
  push(tg[0], tg[1], 400);
  const ev = unstuck();
  assert.equal(ev.length, 1, 'the stall net acts once'); assert.equal(ev[0].how, 'moved', 'it puts the body outside the pocket, through no room wall');
  assert.equal(where(bp, ev[0].x, ev[0].y, ev[0].z), 'core');
  const us = f.us(ev[0].x, ev[0].z); assert.ok(us[1] < 0, `on the landing, in front of the panel: u,s ${us}`);
});

test('the nook replay can fail: with the panel at the ceiling (the old 2.8 m) the same push is "crossed" into another room', () => {
  const bp = B.find((q) => q.id === 'L14'), f = frameOf(bp), uB = f.core.fw + f.core.div + f.core.fw / 2;
  const panel = physics.walls.find((w) => w.id === 'L14.nook0'), y1 = panel.y1;
  try {
    panel.y1 = panel.y0 + 2.8;
    const start = f.world(uB, 0.7), far = f.world(uB, 3.7);
    at(start[0], start[1], f.fy); push(far[0], far[1], 300);
    const ev = unstuck(); assert.equal(ev.length, 1);
    assert.equal(ev[0].how, 'crossed', `${ev[0].how} to ${where(bp, ev[0].x, ev[0].y, ev[0].z)}`);
  } finally { panel.y1 = y1; }
});

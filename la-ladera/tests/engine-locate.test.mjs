// Which room the player is in (owner: A1, js/engine/player.js `_locate`), with the real Player under node.
// R4-202: the height test of a room runs from 0.45 m under its floor to 0.3 m over its ceiling, so the ground-floor room's test still held at the first-floor floor (2.8 m) and
// `find` met it first: all 1001 upstairs rooms of the barrio reported the room below, and 196 of 200 upstairs terraces counted as indoors. The light pool (which lamps are lit),
// the footstep surface and the indoor blend of the light read the room.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-locate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics } from '../js/core/physics.js';
import { Player } from '../js/engine/player.js';

/** A two-storey house 6 x 4 m at world (10..16, 20..24): storeys 2.8 m, rooms 2.62 m high as the barrio's. Upstairs: a pine bedroom over the red-cement living room, and a terrace over the kitchen. */
function house() {
  const room = (id, floor, x0, x1, extra) => ({ id, floor, y: floor * 2.8, h: 2.62, rect: { x0, z0: 0, x1, z1: 4 }, ...extra });
  const rooms = [
    room('H.f0.r0', 0, 0, 3, { type: 'living', finish: { floor: 'floor_cement_red' } }),
    room('H.f0.r1', 0, 3, 6, { type: 'kitchen', finish: { floor: 'floor_tile_ceramic' } }),
    room('H.f1.r0', 1, 0, 3, { type: 'bedroom', finish: { floor: 'floor_pine' } }),
    room('H.f1.r1', 1, 3, 6, { type: 'terrace', outdoor: true, finish: { floor: 'floor_cement' } }),
  ];
  return {
    id: 'H', lot: { y: 0, floors: 2, fh: 2.8 }, footprint: [[10, 20], [16, 20], [16, 24], [10, 24]], bounds: { y0: -0.5, y1: 6.5 }, roof: { y: 5.6 }, rooms,
    floors: [{ index: 0, y: 0 }, { index: 1, y: 2.8 }], frame: { y: 0, toLocal: (x, y, z) => [x - 10, y, z - 20], toWorld: (x, y, z) => [x + 10, y, z + 20] },
  };
}
function world() {
  const physics = new Physics(); physics.setTerrain(() => 0);
  const bp = house(), ctx = {
    physics, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: {} }, buildings: new Map([[bp.id, bp]]), errors: [], running: true,
    events: { emit() {} }, ui: { toast() {}, prompt() {} }, interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
  };
  const p = new Player(ctx); ctx.player = p;
  return { p, bp };
}
/** stand at local (lx, lz) with the feet `y` above the ground floor; what the player then says about where it is */
const at = (w, lx, y, lz = 2) => { w.p.teleport(10 + lx, 20 + lz, { y }); return { room: w.p.room?.id, indoors: w.p.indoors, surface: w.p.surface, floor: w.p.floor }; };

test('on the ground floor the room is the ground-floor room', () => {
  const w = world();
  assert.deepEqual(at(w, 1.5, 0), { room: 'H.f0.r0', indoors: true, surface: 'concrete', floor: 0 });
  assert.equal(at(w, 4.5, 0).room, 'H.f0.r1');
});

test('on the first floor the room is the one on the first floor, not the one under it (the light pool and the footsteps follow it)', () => {
  const w = world();
  assert.deepEqual(at(w, 1.5, 2.8), { room: 'H.f1.r0', indoors: true, surface: 'wood', floor: 1 }, 'a pine bedroom over a red-cement living room: wood under the feet');
  assert.equal(at(w, 1.5, 3.4).room, 'H.f1.r0', 'a jump on the first floor');
  assert.equal(at(w, 1.5, 2.5).room, 'H.f1.r0', 'the last step of the stairs, 0.3 m under the first floor');
});

test('on the stairs, under the last 0.45 m of the climb, the room is still the one below', () => {
  const w = world();
  assert.equal(at(w, 1.5, 1.4).room, 'H.f0.r0');
  assert.equal(at(w, 1.5, 2.2).room, 'H.f0.r0');
});

test('a terrace on the first floor is outdoors; it was counted as the kitchen under it, and so as indoors', () => {
  const w = world();
  const t = at(w, 4.5, 2.8);
  assert.equal(t.room, 'H.f1.r1'); assert.equal(t.indoors, false, 'a terrace is outdoors');
  assert.equal(at(w, 4.5, 0).indoors, true, 'and the kitchen under it is not');
});

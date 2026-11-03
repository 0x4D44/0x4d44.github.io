// A room behind the lit glass, and the evening of each lit room (owner: A1; review round 6, R1-104: "at night lit windows are flat uniform yellow panels with no room behind them, so facades read
// as cut-outs"). js/engine/windowroom.js patches the `window_lit` material into an interior-mapping card; arch/shellwin.js and arch/shellfacade.js `mirador` tell each lit pane which room it shows
// and when that room's lights are on (arch/mb.js `roomSeed` / `roomLitAt`). This is the node half: the shader text against three's real standard shader, the bookkeeping, and the barrio's panes.
// The pixel half (a room has structure, a room gone to bed is dark) is tests/engine-windowroom-page.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-windowroom.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MaterialLib } from '../js/core/matlib.js';
import { windowRoom, setRoomHour, syncRoomLooks, ROOM_APPLY, ROOM_FUNCS, ROOM_TABLE } from '../js/engine/windowroom.js';
import { roomSeed, roomLitAt, ROOM_ON, ROOM_OFF, roomSizeOf, ROOM_SLOTS } from '../js/arch/mb.js';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';

const count = (s, sub) => s.split(sub).length - 1;
const compile = (m) => { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh, null); return sh; };

test('the patch lands in three\'s standard shaders once, with the evening table, and its uniforms are the material\'s own objects', () => {
  const orig = THREE.ShaderLib.standard;
  for (const a of ['#include <common>', '#include <begin_vertex>']) assert.equal(count(orig.vertexShader, a), 1, `the stock vertex shader has ${a} once`);
  for (const a of ['#include <common>', '#include <emissivemap_fragment>']) assert.equal(count(orig.fragmentShader, a), 1, `the stock fragment shader has ${a} once`);
  const m = windowRoom(new THREE.MeshStandardMaterial({ emissive: 0xffc46b })), sh = compile(m);
  assert.equal(count(sh.vertexShader, 'vLrA = color;'), 1, 'the vertex stage hands the colour (seed, evening, size) on');
  assert.equal(count(sh.vertexShader, 'vLrUv = uv;'), 1);
  assert.equal(count(sh.fragmentShader, ROOM_FUNCS), 1); assert.equal(count(sh.fragmentShader, ROOM_APPLY), 1); assert.equal(count(sh.fragmentShader, ROOM_TABLE), 1);
  assert.ok(sh.fragmentShader.indexOf('#include <emissivemap_fragment>') < sh.fragmentShader.indexOf(ROOM_APPLY), 'the room replaces the glow after the stock emissive is set');
  assert.equal(count(sh.fragmentShader, 'uniform float lrHour;'), 1);
  for (const k of ['lrGain', 'lrTune', 'lrHour']) assert.equal(sh.uniforms[k], m.userData.lrU[k], `${k}: the same object, so a later change reaches the program`);
  setRoomHour(m, 23.25); assert.equal(sh.uniforms.lrHour.value, 23.25, 'the clock reaches the compiled program');
  assert.equal(m.customProgramCacheKey(), m.customProgramCacheKey(), 'one program');
  assert.ok(ROOM_TABLE.includes(`float[${ROOM_ON.length}]( ${ROOM_ON.map((v) => v.toFixed(2)).join(', ')} )`), 'the shader\'s on-hours are arch/mb.js ROOM_ON');
  assert.ok(ROOM_TABLE.includes(`float[${ROOM_OFF.length}]( ${ROOM_OFF.map((v) => v.toFixed(2)).join(', ')} )`), 'and its off-hours ROOM_OFF');
  assert.ok(/totalEmissiveRadiance \*= lrOn \* step\( 0\.0, dot\( lrNo, lrEye \) \);/.test(ROOM_APPLY), 'a room that is off has no glow at all, near or far');
});

test('only window_lit carries the patch, and it starts on the clock as it is', () => {
  const lib = new MaterialLib({ night: 1, hour: 22.5 });
  const lit = lib.get('window_lit'), glass = lib.get('glass');
  assert.equal(lit.userData.room, true); assert.ok(!glass.userData.room);
  assert.equal(lit.userData.lrU.lrHour.value, 22.5);
});

test('the evening rule: a code says when its room comes on and goes off; the street does not switch as one', () => {
  for (let i = 1; i < 8; i++) { assert.ok(ROOM_ON[i] > ROOM_ON[i - 1]); assert.ok(ROOM_OFF[i] > ROOM_OFF[i - 1]); }
  assert.ok(ROOM_ON[7] < ROOM_OFF[0], 'every room is on for a while');
  const c = roomSeed(0.3, 0.2, 0.5);                                    // on at ROOM_ON[2] (18.3), off at ROOM_OFF[1] (22.25)
  assert.ok(c >= 2 && c - 2 - Math.floor(c - 2) < 1);
  assert.deepEqual([17, 18.2, 18.3, 21, 22.2, 22.25, 23, 2, 9].map((h) => roomLitAt(c, h)), [false, false, true, true, true, false, false, false, false]);
  assert.equal(roomLitAt(roomSeed(0, 0.99, 0.999), 3), true, 'an all-night room is lit at 3 a.m.');
  assert.equal(roomLitAt(roomSeed(0.99, 0.99, 0.999), 20), false, 'and a late one is not yet at 20:00');
  assert.equal(roomSeed(0.05, 0.3, 0.37), 2 + 2 + 0.37 * 0.999, 'the codes the page test writes out (engine-windowroom-page.test.mjs BED) are roomSeed\'s');
  assert.equal(roomSeed(0.05, 0.99, 0.37), 2 + 7 + 0.37 * 0.999, '(and OWL)');
  for (const s of [0, 0.5, 0.999]) assert.equal(Math.floor(roomSeed(0.99, 0.99, s) - 2 + 0.0005), 63, 'the look never spills into the evening code');
});

// The real barrio, furnished and built: every lit pane of every building (a lit pane's height carries its room's slot: arch/mb.js roomSize).
const real = await buildData({ furnish: true });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const panes = [];
for (const bp of real.buildings) {
  const g = real.ctx.batch.groups.get(bp.id + '.ext');
  for (const m of g?.meshes ?? []) {
    if (m.userData.matKey !== 'window_lit') continue;
    const col = m.geometry.attributes.color, uv = m.geometry.attributes.uv;
    for (let i = 0; i < col.count; i++) { const z = roomSizeOf(col.getZ(i)); panes.push({ bp: bp.id, x: col.getX(i), w: col.getY(i), h: col.getX(i) >= 2 ? z.h : col.getZ(i), slot: col.getX(i) >= 2 ? z.slot : 0, u: uv.getX(i), v: uv.getY(i) }); }
  }
}

test('R1-104: the lit panes of the barrio carry a room (seed, evening, size, uv), and a few legacy lights do not', () => {
  const rooms = panes.filter((p) => p.x >= 2), legacy = panes.filter((p) => p.x < 2);
  assert.ok(rooms.length > 1000, `${rooms.length} pane corners carry a room (the old panes carried colour (1, 1, 1))`);
  assert.ok(rooms.length > 8 * legacy.length, `the legacy lights (rose window, door lights: ${legacy.length}) are the exception`);
  for (const p of rooms) {
    assert.ok(Math.abs(p.w) > 0.15 && Math.abs(p.w) < 4 && p.h > 0.15 && p.h < 3.5, `${p.bp}: a pane of ${p.w} x ${p.h} m`);
    assert.ok(p.u > -1e-4 && p.u < 1 + 1e-4 && p.v > -1e-4 && p.v < 1 + 1e-4, `${p.bp}: uv (${p.u}, ${p.v}) inside the window`);
    assert.ok(p.x < 2 + 64, `${p.bp}: code ${p.x}`);
  }
  const codes = new Set(rooms.map((p) => Math.floor(p.x - 2 + 0.0005)));
  assert.ok(codes.size >= 40, `${codes.size} of 64 evenings in use`);
});

test('R1-104: fewer windows glow at 23:00 than at 21:00, fewer at 19:30 (not home yet), a few after midnight', () => {
  const rooms = [...new Map(panes.filter((p) => p.x >= 2).map((p) => [p.x, p])).values()];          // one per pane (its four corners share the code)
  const on = (h) => rooms.filter((p) => roomLitAt(p.x, h)).length / rooms.length;
  const f = { 19.5: on(19.5), 21: on(21), 23: on(23), 1.5: on(1.5) };
  assert.ok(f[21] > 0.95, `21:00: ${f[21]} of the lived-in rooms are lit`);
  assert.ok(f[23] < 0.8 * f[21] && f[23] > 0.3, `23:00: ${f[23]}: some have gone to bed`);
  assert.ok(f[19.5] > 0.35 && f[19.5] < 0.85, `19:30: ${f[19.5]}: some are not home yet`);
  assert.ok(f[1.5] > 0.05 && f[1.5] < f[23], `01:30: ${f[1.5]}: a few late ones`);
});

test('R1-202: from inside the room a lit pane gives no light of its own (it is glass over the night), from the street it glows', () => {
  assert.ok(/totalEmissiveRadiance \*= lrOn \* step\( 0\.0, dot\( lrNo, lrEye \) \);/.test(ROOM_APPLY), 'the glow is gated by the side the eye is on');
  assert.ok(ROOM_APPLY.indexOf('vec3 lrNo') < ROOM_APPLY.indexOf('totalEmissiveRadiance *= lrOn'), 'the street side is known before the gate');
  assert.ok(/#ifdef FLIP_SIDED\s+lrNo = - lrNo;\s+#endif/.test(ROOM_APPLY), 'the back-face pass of a double-sided transparent mesh (FLIP_SIDED: vNormal negated) still knows which side is the street');
  assert.ok(ROOM_APPLY.indexOf('#ifdef FLIP_SIDED') < ROOM_APPLY.indexOf('totalEmissiveRadiance *= lrOn'));
});

test('R1-211: every lit pane names its room in the room-look table; the panes of one room share one slot, two rooms never do', () => {
  const lit = panes.filter((p) => p.x >= 2);
  const withSlot = lit.filter((p) => p.slot > 0);
  assert.ok(withSlot.length > 0.9 * lit.length, `${withSlot.length} of ${lit.length} lit pane corners carry a slot (the mirador's has no room record)`);
  const T = real.ctx.roomSlots;
  assert.ok(T && T.list.length > 100 && T.list.length < ROOM_SLOTS, `${T?.list.length} rooms with a lit window`);
  for (const p of withSlot) { const e = T.list[p.slot - 1]; assert.equal(e.bp, p.bp, `slot ${p.slot} belongs to ${e.bp}, the pane to ${p.bp}`); }
  assert.equal(new Set(T.list.map((e) => `${e.bp}:${e.room}`)).size, T.list.length, 'one slot per room');
});

test('R1-211: once the rooms are furnished the table holds each room\'s wall paint, kind and ceiling light, and an unfurnished room stays unknown', () => {
  const T = real.ctx.roomSlots, tex = { image: { data: new Uint8Array(128 * 32 * 4) }, needsUpdate: false };
  for (const e of T.list) e.ok = false;
  const left = syncRoomLooks(real.ctx, tex);
  assert.equal(tex.needsUpdate, true);
  assert.ok(left < 0.05 * T.list.length, `${left} of ${T.list.length} rooms not furnished`);
  let painted = 0, lamps = 0, kinds = 0;
  T.list.forEach((e, i) => {
    const s = i + 1, o = ((s >> 6) * 128 + 2 * (s & 63)) * 4, d = tex.image.data, bp = real.ctx.buildings.get(e.bp), room = bp.rooms.find((r) => r.id === e.room);
    if (!room.finish) { assert.equal(d[o + 7], 0, `${e.room}: unfurnished, unknown`); return; }
    assert.equal(d[o + 7], 255, `${e.room}: known`);
    if (typeof room.finish.wallTint === 'number') { assert.deepEqual([...d.subarray(o, o + 3)], [(room.finish.wallTint >> 16) & 255, (room.finish.wallTint >> 8) & 255, room.finish.wallTint & 255], `${e.room}: its paint`); painted++; }
    const l = bp.lights.find((x) => x.room === e.room && x.kind === 'ceiling');
    if (l) { assert.deepEqual([...d.subarray(o + 4, o + 7)], [(l.color >> 16) & 255, (l.color >> 8) & 255, l.color & 255], `${e.room}: its lamp`); lamps++; }
    if (d[o + 3]) kinds++;
  });
  assert.ok(painted > 0.6 * T.list.length && lamps > 0.5 * T.list.length && kinds > 0.5 * T.list.length, `painted ${painted}, lamps ${lamps}, kinds ${kinds} of ${T.list.length}`);
  assert.equal(syncRoomLooks(real.ctx, tex), left, 'a second pass changes nothing');
});
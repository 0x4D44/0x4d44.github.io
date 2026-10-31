// The real-light pool (owner: A1, js/engine/lights.js), on a hand-made registry, under node: which lights are on by day, by night, indoors and
// outdoors, that a teleport (the door of a shop at night, a shot tool, `__ladera.enter`) shows the right lights in the SAME frame, and that a
// walk through a door fades instead of popping. A 'street' lamp follows the night; ceiling / lamp / candle / tv follow the player's building.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-lights.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LightPool } from '../js/engine/lights.js';

const STREET = 18, CEIL = 6;
/** `lamps` street lamps in a row at the origin; a shop 'B1' (three ceiling lights, one floor-above light) 50 m away; the player on the street. */
function setup({ night = 1, max = 8, lamps = 10 } = {}) {
  const list = [];
  for (let i = 0; i < lamps; i++) list.push({ x: -8 + i * 1.6, y: 4.5, z: 0, color: 0xffc27a, intensity: STREET, distance: 14, kind: 'street' });
  for (let i = 0; i < 3; i++) list.push({ x: 50 + i * 2, y: 2.4, z: 10, color: 0xffd9a0, intensity: CEIL, distance: 6.5, kind: 'ceiling', building: 'B1', room: 'B1.r0' });
  list.push({ x: 51, y: 6.1, z: 10, color: 0xffd9a0, intensity: CEIL, distance: 6.5, kind: 'ceiling', building: 'B1', room: 'B1.r9' });   // the floor above
  const ctx = { scene: { add() {} }, night, lights: { list }, player: { s: { x: 0, y: 0, z: 2 }, indoors: false, building: null, room: null } };
  return { ctx, pool: new LightPool(ctx, max), list };
}
const goInside = (ctx) => { Object.assign(ctx.player, { indoors: true, building: 'B1', room: 'B1.r0' }); Object.assign(ctx.player.s, { x: 51, y: 0, z: 10 }); };
const goOutside = (ctx) => { Object.assign(ctx.player, { indoors: false, building: null, room: null }); Object.assign(ctx.player.s, { x: 0, y: 0, z: 2 }); };
const lit = (pool) => pool.slots.filter((s) => s.light.intensity > 0.01);
const kinds = (pool) => lit(pool).map((s) => s.src.kind).sort();
const run = (pool, seconds, dt = 1 / 60, each = null) => { for (let t = 0; t < seconds - 1e-9; t += dt) { pool.update(dt); each?.(); } };

test('by night the street lamps nearest the player are on, to the pool size and no more', () => {
  const { pool } = setup();
  pool.update(0, true);
  assert.equal(lit(pool).length, 8);
  assert.deepEqual([...new Set(kinds(pool))], ['street']);
  assert.ok(lit(pool).every((s) => s.light.intensity === STREET), 'at full candela');
  const { pool: small } = setup({ max: 3 });
  small.update(0, true);
  assert.deepEqual(lit(small).map((s) => s.light.position.x.toFixed(1)).sort(), ['-1.6', '0.0', '1.6'], 'a pool of three lights the three lamps nearest the player');
  small.setActive(1);
  small.update(0, true);
  assert.deepEqual(lit(small).map((s) => s.light.position.x.toFixed(1)), ['0.0'], 'setActive(1) keeps the nearest one');
});

test('by day the street lamps are off, and a room is lit only while the player is in its building', () => {
  const { ctx, pool } = setup({ night: 0 });
  pool.update(0, true);
  assert.equal(lit(pool).length, 0, 'noon, on the street: nothing lights up (the shop is a lit window, not a real light)');
  goInside(ctx); pool.update(0, true);
  assert.deepEqual(kinds(pool), ['ceiling', 'ceiling', 'ceiling'], 'noon, in the shop: its three ceiling lights, and not the floor above');
  goOutside(ctx); pool.update(0, true);
  assert.equal(lit(pool).length, 0, 'back on the street at noon: dark again');
});

test('outdoors a lit shop is a lit window, not a real light: only the street lamps are, however few they are', () => {
  const { pool } = setup({ lamps: 3 });
  pool.update(0, true);
  assert.deepEqual(kinds(pool), ['street', 'street', 'street'], `the pool has 8 slots but only the 3 lamps are real lights outdoors; lit: ${kinds(pool)}`);
});

test('in a big building the lights of the player\'s own room come first, then the nearer ones next door', () => {
  const list = [];
  for (let i = 0; i < 6; i++) list.push({ x: 1 + i * 0.3, y: 2.4, z: 0, color: 0xffd9a0, intensity: CEIL, distance: 6.5, kind: 'ceiling', building: 'B1', room: 'next' });  // 1..2.5 m away, behind a wall
  for (let i = 0; i < 6; i++) list.push({ x: -3 - i * 0.3, y: 2.4, z: 0, color: 0xffd9a0, intensity: CEIL, distance: 6.5, kind: 'ceiling', building: 'B1', room: 'mine' }); // 3..4.5 m away
  const ctx = { scene: { add() {} }, night: 0, lights: { list }, player: { s: { x: 0, y: 0, z: 0 }, indoors: true, building: 'B1', room: 'mine' } };
  const pool = new LightPool(ctx, 8);
  pool.update(0, true);
  const rooms = lit(pool).map((s) => s.src.room).sort();
  assert.deepEqual(rooms, ['mine', 'mine', 'mine', 'mine', 'mine', 'mine', 'next', 'next'], 'all six of the room, then the two nearest next door');
});

test('a candle and a tv flicker, a ceiling light does not, and a light with no colour or range gets the defaults of its kind', () => {
  const list = [
    { x: 0, y: 1, z: 0.5, intensity: 3, kind: 'candle', building: 'B1', room: 'r' },
    { x: 1, y: 1, z: 0.5, intensity: 3, kind: 'tv', building: 'B1', room: 'r' },
    { x: 2, y: 2.4, z: 0.5, intensity: 3, kind: 'ceiling', building: 'B1', room: 'r' },
    { x: 3, y: 4.5, z: 0.5, intensity: 3, kind: 'street' },
  ];
  const ctx = { scene: { add() {} }, night: 1, lights: { list }, player: { s: { x: 0, y: 0, z: 0 }, indoors: true, building: 'B1', room: 'r' } };
  const pool = new LightPool(ctx, 8);
  pool.update(0, true);
  const by = (kind) => pool.slots.find((s) => s.src?.kind === kind), seen = { candle: [], tv: [], ceiling: [] };
  run(pool, 2, 1 / 60, () => { for (const k of Object.keys(seen)) seen[k].push(by(k).light.intensity); });
  const spread = (a) => (Math.max(...a) - Math.min(...a)) / 3;
  assert.ok(spread(seen.candle) > 0.15, `candle spread ${spread(seen.candle).toFixed(2)}`);
  assert.ok(spread(seen.tv) > 0.25, `tv spread ${spread(seen.tv).toFixed(2)}`);
  assert.equal(spread(seen.ceiling), 0, 'a ceiling light holds still');
  assert.ok(Math.min(...seen.candle) >= 3 * 0.75 - 1e-9 && Math.max(...seen.candle) <= 3 * 1.25 + 1e-9, `a candle flickers +-25%, not to black: ${Math.min(...seen.candle).toFixed(2)}..${Math.max(...seen.candle).toFixed(2)} of 3 cd`);
  assert.ok(Math.min(...seen.tv) >= 3 * 0.65 - 1e-9 && Math.max(...seen.tv) <= 3 * 1.35 + 1e-9, 'a tv flickers +-35%');
  assert.deepEqual(['candle', 'tv', 'ceiling', 'street'].map((k) => [by(k).light.color.getHex(), by(k).light.distance]),
    [[0xffd9a0, 8], [0x9fb8ff, 8], [0xffd9a0, 8], [0xffc27a, 14]], 'default colour and range by kind (a street lamp reaches further than a room light)');
});

test('a light on another floor of the same building does not shine through the slab', () => {
  const { ctx, pool } = setup({ night: 0 });
  goInside(ctx); pool.update(0, true);
  const ys = lit(pool).map((s) => s.light.position.y);
  assert.ok(ys.length === 3 && ys.every((y) => y < 3), `lit heights ${ys}`);
  ctx.player.s.y = 6.0;                                                    // two floors up: the 6.1 m light is this floor's, the 2.4 m ones are not
  pool.update(0, true);
  assert.deepEqual(lit(pool).map((s) => s.light.position.y), [6.1]);
});

test('a teleport from a lamp-lit street into a shop at night shows the shop at once', () => {
  const { ctx, pool } = setup();
  pool.update(0, true);
  assert.equal(lit(pool).length, 8, 'eight street lamps lit before the jump');
  goInside(ctx); pool.update(0, true);                                     // exactly what the engine does on `player:teleport`
  const now = lit(pool);
  assert.equal(now.length, 3, `${now.length} lights lit in the same frame as the jump: ${kinds(pool)}`);
  assert.ok(now.every((s) => s.src.kind === 'ceiling' && Math.abs(s.light.intensity - CEIL) < 1e-9), 'the shop lights at full candela, no lamp of the street left');
  assert.deepEqual(now.map((s) => s.light.position.x).sort((a, b) => a - b), [50, 52, 54]);
  goOutside(ctx); pool.update(0, true);                                    // and back out
  assert.deepEqual([...new Set(kinds(pool))], ['street']);
  assert.equal(lit(pool).length, 8);
});

test('an hour change at night with the player already in the shop keeps the shop lit', () => {
  const { ctx, pool } = setup({ night: 0 });
  goInside(ctx); pool.update(0, true);
  assert.equal(lit(pool).length, 3);
  ctx.night = 1; pool.update(0, true);                                     // `ctx.setHour` re-snaps the pool
  assert.equal(lit(pool).length, 3);
  assert.deepEqual([...new Set(kinds(pool))], ['ceiling']);
});

test('walking in through the door fades the street out and the shop in, with no pop', () => {
  const { ctx, pool } = setup();
  pool.update(0, true);
  goInside(ctx);
  const last = new Map(pool.slots.map((s) => [s, s.light.intensity])); let worst = 0, t = 0, first = null;
  run(pool, 2.0, 1 / 60, () => {
    t += 1 / 60;
    for (const s of pool.slots) { worst = Math.max(worst, Math.abs(s.light.intensity - last.get(s))); last.set(s, s.light.intensity); }
    if (first === null && lit(pool).some((s) => s.src.kind === 'ceiling')) first = t;
  });
  assert.ok(worst < 0.2 * STREET, `largest one-frame change ${worst.toFixed(2)} cd (a pop would be ${STREET} cd)`);
  assert.equal(lit(pool).length, 3, 'two seconds later only the shop is lit');
  assert.ok(lit(pool).every((s) => s.src.kind === 'ceiling' && Math.abs(s.light.intensity - CEIL) < 0.05 * CEIL), 'and at full candela');
  // the street lamps must not hold the pool until they are gone: a faded-down slot (under 4 %) is handed over, so the room starts to light by ~0.6 s
  assert.ok(first !== null && first < 0.7, `the first shop light shows after ${first?.toFixed(2)} s (the hand-over starts when a lamp is under 4%: ~0.46 s plus the 0.12 s selection step)`);
});

test('a lamp or candle standing free (no building) follows the night; a street lamp too; none of them by day', () => {
  const list = [
    { x: 1, y: 1, z: 0.5, intensity: 3, kind: 'candle' },                        // a shrine candle on the street
    { x: 2, y: 1.4, z: 0.5, intensity: 3, kind: 'lamp' },                        // a free-standing lamp
  ];
  const at = (night) => { const ctx = { scene: { add() {} }, night, lights: { list }, player: { s: { x: 0, y: 0, z: 0 }, indoors: false, building: null, room: null } }; const p = new LightPool(ctx, 8); p.update(0, true); return p; };
  assert.equal(lit(at(0)).length, 0, 'noon: dark');
  assert.equal(lit(at(0.2)).length, 0, 'night factor 0.2 (the sky is still bright): dark');
  const dusk = lit(at(0.5));
  assert.equal(dusk.length, 2, 'night factor 0.5: lit');
  assert.ok(dusk.every((s) => Math.abs(s.light.intensity - 1.5) < 0.6), 'at about half power');                // candle flicker is +-25%
  assert.ok(lit(at(1)).every((s) => s.light.intensity > 2), 'night: full');
});

test('a light switched off in the registry (`on: false`) stays off, and switches on when it is set', () => {
  const { pool, list } = setup({ lamps: 4 });
  list[0].on = false;
  pool.update(0, true);
  assert.equal(lit(pool).length, 3);
  assert.ok(lit(pool).every((s) => s.src !== list[0]));
  list[0].on = true; pool.update(0, true);
  assert.equal(lit(pool).length, 4);
});

test('a pool cut down to two lights (medium / low profile) still follows the player: the nearest lamp is lit, two lights stay two', () => {
  const { ctx, pool } = setup({ lamps: 16 });
  pool.setActive(2);
  pool.update(0, true);
  const before = lit(pool).map((s) => s.light.position.x.toFixed(1)).sort();
  assert.equal(before.length, 2);
  ctx.player.s.x = 3.2; pool.update(0, true);                             // three metres on: the old two are still among the eight nearest
  const after = lit(pool).map((s) => s.light.position.x.toFixed(1)).sort();
  assert.equal(after.length, 2, `${after}`);
  assert.ok(after.includes('3.2'), `the nearest lamp (3.2) is lit: ${after} (a light given a switched-off slot is killed, and the old two stay)`);
  assert.notDeepEqual(after, before);
  pool.setActive(4); ctx.player.s.x = 11; pool.update(0, true);
  assert.equal(lit(pool).length, 4, 'and four are four');
});

test('the fade is not instant either: half a frame in, the street is still mostly there', () => {
  const { ctx, pool } = setup();
  pool.update(0, true);
  goInside(ctx);
  run(pool, 0.1);                                                          // 6 frames
  const street = pool.slots.filter((s) => s.src?.kind === 'street').reduce((a, s) => a + s.light.intensity, 0);
  assert.ok(street > 0.3 * 8 * STREET, `street light left after 0.1 s: ${street.toFixed(1)} of ${8 * STREET} cd`);
});

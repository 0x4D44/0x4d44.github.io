// INTERIORS storage (round 6, R4-118): a dresser is put where a person can stand at its drawers, and a bedroom that healing left without a wardrobe, dresser or trunk gets somewhere to keep clothes again.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-storage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout } from '../js/interiors/layout.js';
import { ensureStorage, frontStand, dresserAt } from '../js/interiors/rooms.js';
import { makeRng } from '../js/core/rng.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf } from '../js/interiors/carcass.js';
import { standSpots } from '../js/interiors/reach.js';
import { furnishedBatch } from './interiors-lib.mjs';

const KEEPS = /^(wardrobe|dresser|chest_trunk|coat_rack)/;
const keeps = (L) => L.items.filter((i) => KEEPS.test(i.name));

/** A hand-made room with one interior door: pieces go in at exact poses (`put`, unchecked). */
function room(rect, door, { type = 'bedroom', role = 'master', seed = 1 } = {}) {
  const r = { id: 'S.f0.r1', type, floor: 0, rect, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', kind: 'interior', w: 0.9, rooms: ['S.r0', r.id], swing: 1, hinge: 'left', ...door }] };
  const L = new Layout({ bp, room: r, rng: makeRng(seed), hh: { tints: {} } });
  L.role = role;
  return { L, bp, put: (name, x, z, ry, prio = 0) => L.at(name, x, z, ry, { force: true, prio }) };
}

test('ensureStorage(): the wardrobe heal() takes out of a bedroom is replaced by somewhere else to keep clothes, and nothing it adds shuts the bed in', () => {
  // the 5.2 x 2.3 m room of interiors-fixtures: the wardrobe across its depth walls the bed off from the door, so healing removes it, and the room is left keeping nothing
  const { L, put } = room({ x0: 0, z0: 0, x1: 5.2, z1: 2.3 }, { x: -0.05, z: 1.15 });
  const bed = put('bed_single_metal', 4.7, 1.15, 0), wardrobe = put('wardrobe_2', 2.0, 1.15, Math.PI / 2, 1);
  assert.deepEqual(L.heal(), [wardrobe]);
  assert.equal(keeps(L).length, 0, 'the premise: the healed room keeps no clothes anywhere');
  assert.equal(ensureStorage(L, {}, L.hh), true);
  assert.ok(keeps(L).length >= 1, `the room keeps clothes somewhere again (${L.items.map((i) => i.name)})`);
  assert.equal(L.connectivity().ok, true, 'the way in is still open');
  assert.equal(L._accessOk(bed, true), true, 'the bed can still be got to');
  assert.deepEqual(L.heal(), [], 'what it added is not what healing would take out again');
});

test('ensureStorage(): a bedroom that keeps clothes already, a room that is no bedroom and a bedroom no household sleeps in are left as they are', () => {
  const rect = { x0: 0, z0: 0, x1: 5.2, z1: 2.3 }, door = { x: -0.05, z: 1.15 };
  for (const [what, o, pre] of [['a bedroom with a wardrobe', {}, 'wardrobe_2'], ['a kitchen', { type: 'kitchen' }, null], ['a bedroom without a role', { role: null }, null]]) {
    const { L, put } = room(rect, door, o);
    if (pre) put(pre, 2.5, 0.3, 0, 1);
    const before = L.items.map((i) => i.id);
    ensureStorage(L, {}, L.hh);
    assert.deepEqual(L.items.map((i) => i.id), before, `${what}: nothing added`);
  }
});

test('dresserAt(): a dresser is put where a person can stand at its drawers - the room of a flat with a double bed along its long wall left 0.69 m to the dresser, and a front no one can stand at is decoration', () => {
  // 3.14 to 3.6 m wide, 2.87 m deep (A2's flat bedrooms): the double bed's head on the +x wall, the door in the -z wall by the bed's side; the dresser asked for last, as bedroomDress does
  let blind = 0, placed = 0, rooms = 0;
  for (const w of [3.0, 3.14, 3.3, 3.45, 3.6]) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const build = () => { const r = room({ x0: 0, z0: 0, x1: w, z1: 2.87 }, { x: 1.0, z: -0.05, rooms: ['S.r0', 'S.f0.r1'] }, { seed }); r.put('bed_double_wood', w - 1.0, 1.4, -Math.PI / 2, 3); return r; };
    rooms++;
    const old = build().L, was = old.wall('dresser_4', 'any', { prio: 2, awayDoors: true });          // what bedroomDress asked before: a pose with the catalogue's 0.6 m in front, whatever stands there
    if (was && !frontStand(old, was)) blind++;
    const { L } = build(), d = dresserAt(L);
    if (!d) continue;
    placed++;
    assert.ok(frontStand(L, d), `${w} x 2.87 seed ${seed}: the dresser at ${d.x.toFixed(2)},${d.z.toFixed(2)} has a spot to stand at its drawers`);
    assert.equal(L.connectivity().ok, true, `${w} x 2.87 seed ${seed}: the room stays whole`);
  }
  assert.ok(placed >= rooms / 2, `${placed} of ${rooms} rooms keep a dresser (a room may have none, most should)`);
  assert.ok(blind >= 1, `the premise: the plain wall pose put a dresser in front of which nobody can stand in ${blind} of ${rooms} of these rooms (none: the test is not looking at the case)`);
});

test('reach (R4-118): the drawers of a dresser can be stood in front of: at most 5% of the barrio\'s dressers are left as decoration (44 of 284 were: the catalogue kept 0.6 m clear in front of them, a body at the drawers needs 0.85 m)', async () => {
  const bps = (await furnishedBatch({ real: true })).bps, lay = layoutOf(CATALOG.dresser_4);
  let made = 0, decor = 0; const where = [];
  for (const bp of bps) {
    const conns = new Map();
    for (const rec of bp.furniture) {
      if (rec.name !== 'dresser_4') continue;
      const L = bp.interior?.layouts?.get(rec.room); if (!L) continue;
      const conn = conns.get(L) ?? conns.set(L, L.connectivity()).get(L);
      for (const slot of lay.slots) { made++; if (!standSpots(bp, rec, slot, conn).length) { decor++; where.push(rec.room); } }
    }
  }
  console.log(`# dressers: ${made} fronts, ${decor} left as decoration (${(100 * decor / made).toFixed(1)}%) ${where.join(' ')}`);
  assert.ok(made >= 150, `${made} dresser fronts to look at`);
  assert.ok(decor <= 0.05 * made, `${decor} of ${made} dresser fronts are decoration only (${(100 * decor / made).toFixed(1)}%): ${where.join(' ')}`);
});

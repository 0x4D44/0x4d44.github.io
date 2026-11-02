// Beds follow the household (R4-303): a couple sleeps in a double bed or two singles, two students have a bed each, the children of a family have beds (a bunk holds two), and a home whose
// rooms cannot hold them all lacks only what the plan's walls cannot give. Round 6: family flats with 2-3 children had one single bed, three couples shared a single bed, ten two-student flats
// had one single bed (of 216 homes with a bedroom, 160 had fewer places than people: 354 of 741 people had no bed).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-beds.test.mjs
//   A3_SABOTAGE=onebed   leaves every home its first bed only: the two census tests must FAIL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { householdKey } from '../js/interiors/household.js';
import { bedsOwed, householdPlaces } from '../js/interiors/rooms.js';

const SAB = process.env.A3_SABOTAGE;
const PLACES = { bed_double: 2, bed_double_wood: 2, bed_bunk: 2, bed_single: 1, bed_single_metal: 1, bed_cot: 1, mattress_floor: 1 };       // (a crib is the baby's; a mattress stood on its edge is put away by day)
const NOT_HOME = new Set(['school', 'clinic', 'chapel', 'hall']);

/** One row per household that sleeps in the plan: how many it has to put up and how many places its beds give. */
function census(bps) {
  const rows = [];
  for (const bp of bps) {
    if (!bp.interior?.hh || NOT_HOME.has(bp.lot?.kind)) continue;
    for (const hh of bp.interior.hh) {
      const rooms = bp.rooms.filter((r) => householdKey(bp, r) === hh.id && !(bp.lot.kind === 'unfinished' && (r.outdoor || r.floor > 0)));
      if (!rooms.some((r) => r.type === 'bedroom') && !(bp.lot.kind === 'tenement' && rooms.some((r) => r.type === 'living'))) continue;     // nowhere to sleep in the plan: the plan's business
      let beds = bp.furniture.filter((f) => rooms.some((r) => r.id === f.room) && !f.parent && PLACES[f.name]);
      if (SAB === 'onebed') beds = beds.slice(0, 1);
      rows.push({ id: hh.id, kind: hh.kind, people: householdPlaces(hh), places: beds.reduce((s, f) => s + PLACES[f.name], 0) });
    }
  }
  return rows;
}
const worlds = [['A2 plans', await furnishedBatch({ real: true })], ['synthetic', await furnishedBatch({ n: +(process.env.A3_N || 60) })]];
// What the bedrooms can hold, with some room for A2's plans to move: before round 6 the old furnishing gave 55% / 48% on A2's plans (29 of 53 couples and student flats, 293 of 613 people) and 36% / 57%
// on the synthetic ones; now 91% / 71% and 71% / 81%. The rest is the plans' own: a 9 m2 flat bedroom with a door in each of two facing walls, a 1.93 m rowhouse bedroom, a 5 m2 shop-home room.
const FLOOR = { 'A2 plans': { pairs: 0.85, families: 0.65 }, synthetic: { pairs: 0.6, families: 0.7 } };

test('who sleeps where: the places each bedroom owes add up to the household', () => {
  const E = (n) => ({ bedroomCount: () => n });
  const fam = { kind: 'family', kids: 3, teen: true, elder: true }, small = { kind: 'family', kids: 1 };
  assert.deepEqual([bedsOwed(E(1), fam, 0)], [6], 'one bedroom (a flat): everybody sleeps in it');
  assert.deepEqual([0, 1].map((i) => bedsOwed(E(2), fam, i)), [2, 4], 'two: the parents; the children and the grandparent');
  assert.deepEqual([0, 1, 2].map((i) => bedsOwed(E(3), fam, i)), [2, 3, 1], 'three: the parents; the little ones and the grandparent; the teenager alone');
  assert.deepEqual([0, 1, 2, 3].map((i) => bedsOwed(E(4), fam, i)), [2, 2, 1, 1], 'four: the grandparent has the last');
  assert.deepEqual([0, 1].map((i) => bedsOwed(E(2), small, i)), [2, 1]);
  for (const hh of [fam, small, { kind: 'shopkeeper', kids: 2, teen: true }, { kind: 'couple' }, { kind: 'students' }]) {
    for (let n = 1; n <= 4; n++) {
      const sum = Array.from({ length: n }, (_, i) => bedsOwed(E(n), hh, i)).reduce((s, v) => s + v, 0);
      assert.equal(sum, householdPlaces(hh), `${hh.kind} in ${n} bedroom(s): every person has one bedroom to sleep in`);
    }
  }
  assert.equal(bedsOwed(E(1), { kind: 'elder' }, 0), 0, 'an old person alone keeps the one bed the room gives');
  assert.equal(householdPlaces({ kind: 'students' }), 2); assert.equal(householdPlaces({ kind: 'couple' }), 2); assert.equal(householdPlaces({ kind: 'elder' }), 1);
});

for (const [label, w] of worlds) {
  const rows = census(w.bps);
  test(`${label}: a couple has a double bed (or two singles) and two students a bed each`, () => {
    const pairs = rows.filter((r) => r.kind === 'couple' || r.kind === 'students');
    assert.ok(pairs.length >= 3, `${pairs.length} couples and student flats to look at`);
    const ok = pairs.filter((r) => r.places >= 2).length / pairs.length;
    console.log(`# beds (${label}): ${pairs.filter((r) => r.places >= 2).length} of ${pairs.length} couples and student flats have a place for each`);
    assert.ok(ok >= FLOOR[label].pairs, `${(ok * 100).toFixed(0)}% of ${pairs.length} couples and student flats have a place for each; short: ${pairs.filter((r) => r.places < 2).map((r) => r.id + ' ' + r.places).join(', ')}`);
  });
  test(`${label}: the children of a family have beds (a bunk holds two)`, () => {
    const fams = rows.filter((r) => r.kind === 'family' || r.kind === 'shopkeeper');
    assert.ok(fams.length >= 5, `${fams.length} families to look at`);
    const people = fams.reduce((s, r) => s + r.people, 0), housed = fams.reduce((s, r) => s + Math.min(r.places, r.people), 0);
    console.log(`# beds (${label}): ${housed} of ${people} people of ${fams.length} families have a place to sleep (${(housed / people * 100).toFixed(0)}%); ${fams.filter((r) => r.places >= r.people).length} families have all of them`);
    assert.ok(housed / people >= FLOOR[label].families, `${housed} of ${people} people of ${fams.length} families have a place to sleep (${(housed / people * 100).toFixed(0)}%)`);
  });
  test(`${label}: a bunk bed never stands in front of a window (it is 1.75 m high: the first round-6 build hid six windows behind one)`, () => {
    const span = (f) => { const c = Math.abs(Math.cos(f.ry)), s = Math.abs(Math.sin(f.ry)); return { hx: (c * f.w + s * f.d) / 2, hz: (s * f.w + c * f.d) / 2 }; };
    const hidden = [];
    let bunks = 0;
    for (const bp of w.bps) {
      const bunkList = bp.furniture.filter((f) => f.name === 'bed_bunk' && !f.parent);
      bunks += bunkList.length;
      for (const win of bp.windows ?? []) {
        if (win.nx == null || win.nz == null) continue;
        for (const f of bunkList.filter((q) => q.room === win.room)) {
          const { hx, hz } = span(f), onX = Math.abs(win.nx) > 0.5;
          const along = onX ? Math.min(win.z + win.w / 2, f.z + hz) - Math.max(win.z - win.w / 2, f.z - hz) : Math.min(win.x + win.w / 2, f.x + hx) - Math.max(win.x - win.w / 2, f.x - hx);
          const dist = onX ? Math.abs(f.x - win.x) - hx : Math.abs(f.z - win.z) - hz;
          if (along > Math.min(0.3, win.w * 0.4) && dist < 0.35) hidden.push(`${f.room}: a bunk hides ${along.toFixed(2)} m of window ${win.id}`);
        }
      }
    }
    assert.ok(bunks >= 5, `${bunks} bunk beds to look at`);
    assert.equal(hidden.length, 0, `${hidden.length} windows with a bunk in front: ${hidden.slice(0, 8).join('; ')}`);
  });
}

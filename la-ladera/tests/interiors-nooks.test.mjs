// INTERIORS (A3, round 7): tight nooks. A walk of L95 found, on its first floor in room 4, a 0.8 x 0.8 m pocket made by the shower tray, the toilet and the basin of a 2.0 x 1.8 m bathroom, entered
// by a 0.65 m mouth against the player's 0.6 m capsule (5 cm of play: it can be walked out of, and it is no way to leave a room). L75.f1.r4 and 36 more bathrooms were the same arrangement.
//  - `tightPocket` names such a niche: 0.3 m deep or more behind a mouth under 0.75 m (the capsule and 15 cm to spare).
//  - A bathroom whose fixtures leave one gets its basin, its toilet and basin, or its tray (for the corner stall) set again, the first of the three that leaves none; a bucket never closes one.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-nooks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout, tightPocket, TIGHT } from '../js/interiors/layout.js';
import { bathroom, ensureFixtures, firstFixtures, seatFixtures, SHOWER } from '../js/interiors/rooms.js';
import { makeRng } from '../js/core/rng.js';
import { furnishedBatch } from './interiors-lib.mjs';

/** The plan's own 2.0 x 1.8 m bathrooms (rect, door and windows as A2 drew them): L95.f1.r4 and L75.f1.r4 left the niche; L37.f0.r4 is a plan with a window in two of its walls, whose stall has no wall. */
const PLAN = {
  'L95.f1.r4': { rect: { x0: -3.03, z0: -4.78, x1: -1.01, z1: -2.9628 }, door: { x: -0.95, z: -3.87, hinge: 'right' }, windows: [{ x: -2.02, z: -4.89, w: 0.65, y: 1.6, h: 0.5 }] },
  'L75.f1.r4': { rect: { x0: 0.01, z0: -4.28, x1: 2.03, z1: -2.4473 }, door: { x: -0.05, z: -3.36, hinge: 'left' }, windows: [{ x: 1.02, z: -4.39, w: 0.65, y: 1.58, h: 0.52 }] },
  'L37.f0.r4': { rect: { x0: -2.78, z0: -4.78, x1: -0.76, z1: -2.9628 }, door: { x: -0.7, z: -3.87, hinge: 'right' }, windows: [{ x: -1.77, z: -4.89, w: 0.65, y: 1.56, h: 0.54 }, { x: -2.89, z: -3.87, w: 0.65, y: 1.57, h: 0.53 }] },
};
function bath(id, seed, income = 0) {
  const g = PLAN[id], room = { id, type: 'bathroom', floor: 0, rect: g.rect, y: 0, h: 2.62 };
  const bp = {
    id: id.split('.')[0], rooms: [room], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, windows: g.windows.map((w) => ({ room: id, ...w })),
    doors: [{ id: `${id}.d`, kind: 'interior', x: g.door.x, z: g.door.z, w: 0.9, rooms: ['x', id], swing: 1, hinge: g.door.hinge }],
  };
  const hh = { tints: {}, income };
  return { L: new Layout({ bp, room, rng: makeRng(seed), hh }), hh };
}
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** What the bathroom's rules ask of the pieces on the floor: each fixture there once, none in a door's sweep, every door reaching every other. */
function rulesHold(L, label) {
  for (const re of [SHOWER, /^toilet$/, /^basin_/]) assert.equal(L.items.filter((i) => re.test(i.name)).length, 1, `${label}: one ${re}`);
  L.sweepKeeps();
  for (const it of L.items.filter((i) => i.floor && i.block)) assert.equal(L._keepHit(it.ob, 0.05), null, `${label}: ${it.name} at ${it.x.toFixed(2)},${it.z.toFixed(2)} stands in a door's sweep or in the opening`);
  assert.equal(L.connectivity().ok, true, `${label}: the doors reach each other`);
}

test('tightPocket: 0.3 m deep or more behind a mouth under 0.75 m (the capsule is 0.6 m across: 15 cm to spare, and the grid reads a mouth 2 cm wide)', () => {
  assert.deepEqual(TIGHT, { depth: 0.3, mouth: 0.75 });
  assert.equal(tightPocket({ depth: 0.63, gap: 0.67 }), true, 'the niche of L95.f1.r4: 0.63 m deep behind a 0.67 m mouth');
  assert.equal(tightPocket({ depth: 0.3, gap: 0.74 }), true, 'on the line: 0.3 m deep');
  assert.equal(tightPocket({ depth: 0.3, gap: 0.75 }), false, 'a 0.75 m mouth passes');
  assert.equal(tightPocket({ depth: 0.29, gap: 0.55 }), false, 'a dent under 0.3 m deep is a dent, not a niche');
  assert.equal(tightPocket({ depth: 1.2, gap: 0.9 }), false, 'a wide mouth passes however deep');
});

test('seatFixtures(): a bathroom whose fixtures first stand on a tight niche (L95.f1.r4, L75.f1.r4: 21 and 39 of 40 seeds) gets an arrangement with none, and the rules of the room hold', () => {
  let tightFirst = 0;
  for (const id of ['L95.f1.r4', 'L75.f1.r4']) for (const income of [0, 1]) for (const seed of SEEDS) {
    const label = `${id} seed ${seed} income ${income}`, { L, hh } = bath(id, seed, income), f = firstFixtures(L, hh);
    if (!f.shower || !f.toilet || !f.basin || !L.tightPockets().length) continue;
    tightFirst++;
    const out = seatFixtures(L, f.walls, f.shower, f.toilet, f.basin);
    assert.deepEqual(L.tightPockets().map((p) => p.by.map((b) => b.name)), [], `${label}: a tight niche is left (${L.items.filter((i) => i.floor).map((i) => `${i.name}@${i.x.toFixed(2)},${i.z.toFixed(2)}`).join(' | ')})`);
    for (const k of ['shower', 'toilet', 'basin']) assert.ok(L.items.includes(out[k]), `${label}: the returned ${k} is the one standing in the room`);
    rulesHold(L, label);
  }
  assert.ok(tightFirst >= 8, `the scenario is real: ${tightFirst} of 48 first arrangements leave a tight niche`);
});

test('seatFixtures(): fixtures that leave no niche stay exactly where they are (a 2.6 x 2.4 m bathroom: the same pieces, the same list)', () => {
  let left = 0;
  for (const income of [0, 1]) for (const seed of SEEDS) {
    const room = { id: 'R.f0.r1', type: 'bathroom', floor: 0, rect: { x0: 0, z0: 0, x1: 2.6, z1: 2.4 }, y: 0, h: 2.6 }, hh = { tints: {}, income };
    const bp = { id: 'R', rooms: [room], stairs: [], entrances: [], windows: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'R.d1', kind: 'interior', x: 1.3, z: 2.45, w: 0.9, rooms: ['R.f0.r0', room.id], swing: 1, hinge: 'left' }] };
    const L = new Layout({ bp, room, rng: makeRng(seed), hh }), f = firstFixtures(L, hh), label = `seed ${seed} income ${income}`;
    if (!f.shower || !f.toilet || !f.basin || L.tightPockets().length) continue;
    const was = L.items.slice(), out = seatFixtures(L, f.walls, f.shower, f.toilet, f.basin);
    assert.deepEqual([out.shower, out.toilet, out.basin], [f.shower, f.toilet, f.basin], `${label}: the same pieces come back`);
    assert.ok(L.items.length === was.length && was.every((it, k) => L.items[k] === it), `${label}: the list is as it was`);
    left++;
  }
  assert.ok(left >= 12, `the roomy bathroom's fixtures leave no niche in most seeds (${left} of 24)`);
});

test('bathroom() + ensureFixtures(): the plan\'s L95.f1.r4 and L75.f1.r4 are furnished with no tight niche, whatever the seed, and the head and the mirror follow the pieces as they were set again', () => {
  for (const id of ['L95.f1.r4', 'L75.f1.r4']) for (const income of [0, 1]) for (const seed of SEEDS) {
    const label = `${id} seed ${seed} income ${income}`, { L, hh } = bath(id, seed, income), E = {};
    bathroom(L, E, hh);
    ensureFixtures(L, E, hh, bathroom);
    assert.deepEqual(L.tightPockets().map((p) => p.by.map((b) => b.name)), [], `${label}: a tight niche (${L.items.filter((i) => i.floor).map((i) => `${i.name}@${i.x.toFixed(2)},${i.z.toFixed(2)}`).join(' | ')})`);
    rulesHold(L, label);
    const tray = L.items.find((i) => SHOWER.test(i.name)), basin = L.items.find((i) => /^basin_/.test(i.name)), head = L.items.find((i) => i.name === 'shower_head_electric'), mirror = L.items.find((i) => i.name === 'mirror_bath');
    assert.ok(head, `${label}: the shower head`);
    assert.ok(Math.hypot(head.x - tray.x, head.z - tray.z) < 1.0, `${label}: the head is ${Math.hypot(head.x - tray.x, head.z - tray.z).toFixed(2)} m from the tray`);
    if (mirror) assert.ok(Math.hypot(mirror.x - basin.x, mirror.z - basin.z) < 0.8, `${label}: the mirror is ${Math.hypot(mirror.x - basin.x, mirror.z - basin.z).toFixed(2)} m from the basin`);
  }
});

test('seatFixtures(): where no pose of the basin, the toilet or the stall leaves no niche (a 2.0 x 1.8 m bathroom with a window in two walls), the fixtures stand exactly as they were and nothing is lost', () => {
  for (const seed of [1, 2, 3]) {
    const { L, hh } = bath('L37.f0.r4', seed), E = {};
    bathroom(L, E, hh);
    ensureFixtures(L, E, hh, bathroom);
    const was = L.items.slice(), pieces = [SHOWER, /^toilet$/, /^basin_/].map((re) => L.items.find((i) => re.test(i.name)));
    assert.ok(L.tightPockets().length > 0, `seed ${seed}: the room is one whose niche cannot be cured (the stall has no wall: a window or a door's keep-out on every corner)`);
    const out = seatFixtures(L, 'any', ...pieces);
    assert.deepEqual([out.shower, out.toilet, out.basin], pieces, `seed ${seed}: the same pieces come back`);
    assert.equal(L.items.length, was.length, `seed ${seed}: nothing lost`);
    for (let k = 0; k < was.length; k++) assert.equal(L.items[k], was[k], `seed ${seed}: item ${k} (${was[k].name}) is where it was in the list`);
    for (const p of pieces) assert.ok(L.items.includes(p) && p.ob, `seed ${seed}: ${p.name} stands`);
  }
});

const w = await furnishedBatch({ real: true });

/** Is a pose of the basin alone enough to leave no niche? (An independent restatement of the first of the rule's three steps: the poses `wall()` takes, nearest the toilet first, at most 40.) The basin is back where it was. */
function basinAloneIsEnough(L, f) {
  L.remove(f.basin);
  let found = false, k = 0;
  for (const b of L.wallPoses(f.basin.name, 'any', { prio: 0, near: f.toilet, nearW: 0.6 })) {
    if (k++ >= 40) break;
    L.items.push(b); const ok = L.tightPockets().length === 0; L.items.pop();
    if (ok) { found = true; break; }
  }
  L.items.push(f.basin);
  return found;
}
/** Is a pose of the toilet with a pose of the basin enough to leave no niche, the tray staying? (An independent restatement of the second step: the toilet's first 12 poses, the basin's first 40 near each.) Both are back where they were. */
function pairIsEnough(L, f) {
  L.remove(f.basin); L.remove(f.toilet);
  let found = false, k = 0;
  for (const t of L.wallPoses('toilet', f.walls, { at: 'center', prio: 0, awayDoors: true })) {
    if (k++ >= 12) break;
    L.items.push(t);
    let j = 0;
    for (const b of L.wallPoses(f.basin.name, 'any', { prio: 0, near: t, nearW: 0.6 })) {
      if (j++ >= 40) break;
      L.items.push(b); const ok = L.tightPockets().length === 0; L.items.pop();
      if (ok) { found = true; break; }
    }
    L.items.pop();
    if (found) break;
  }
  L.items.push(f.toilet, f.basin);
  return found;
}

test('seatFixtures() over every bathroom of the real plans (two seeds, both incomes): a first arrangement on a tight niche is set again to one with none (the basin alone where that is enough, then the toilet and basin, the stall last), and the rules of the room hold', () => {
  let runs = 0, tightFirst = 0, alone = 0, pairs = 0, incomplete = 0; const bad = [];
  for (const bp of w.bps) for (const room of bp.rooms.filter((r) => r.type === 'bathroom')) for (const income of [0, 1]) for (const seed of [1, 2]) {
    const hh = { tints: {}, income }, L = new Layout({ bp, room, rng: makeRng(seed), hh }), f = firstFixtures(L, hh), label = `${room.id} seed ${seed} income ${income}`;
    runs++;
    if (!f.shower || !f.toilet || !f.basin) { incomplete++; continue; }            // (the solver completes these: `bathroom()` + `ensureFixtures()`, the census below)
    if (!L.tightPockets().length) continue;
    tightFirst++;
    const basinAlone = basinAloneIsEnough(L, f), pair = !basinAlone && pairIsEnough(L, f), out = seatFixtures(L, f.walls, f.shower, f.toilet, f.basin);
    if (L.tightPockets().length) { bad.push(`${label}: a niche is left`); continue; }
    if (basinAlone) { alone++; if (out.toilet !== f.toilet || out.shower !== f.shower) bad.push(`${label}: the basin alone was enough, and the toilet or the tray was moved`); }
    if (pair) { pairs++; if (out.shower !== f.shower) bad.push(`${label}: the toilet and the basin were enough, and the tray was swapped for the stall`); }
    try { rulesHold(L, label); } catch (e) { bad.push(e.message.split('\n')[0]); }
  }
  assert.ok(runs >= 400 && tightFirst >= 80 && alone >= 20 && pairs >= 2, `${runs} runs (${incomplete} first passes incomplete), ${tightFirst} first arrangements on a niche, ${alone} of them cured by the basin alone, ${pairs} by the toilet and the basin: the census has too little to look at`);
  assert.deepEqual(bad, [], `${bad.length} of ${tightFirst} arrangements on a niche:`);
});

/** Every bathroom of the barrio: { id, L }. */
const bathrooms = w.bps.flatMap((bp) => [...(bp.interior?.layouts ?? [])].filter(([, L]) => L.room.type === 'bathroom').map(([id, L]) => ({ id, L })));
/** The bathrooms that keep their niche: a 2.02 x 1.82 m room with a window in its -z wall and one in a side wall. Every corner of it is under a window or in the door's keep-out, so the stall has no pose, and the toilet and the basin have too few to part from the tray. */
const STUCK = ['L37.f0.r4', 'L59.f0.r4', 'L77.f0.r4', 'L77.f1.r4'];

test('census: no bathroom of the barrio has a tight niche but the four whose stall has no wall (L95.f1.r4 and L75.f1.r4 had one; 56 rooms did)', () => {
  assert.ok(bathrooms.length >= 100, `the real plans have bathrooms (${bathrooms.length})`);
  const tight = bathrooms.filter(({ L }) => L.tightPockets().length).map(({ id }) => id);
  assert.deepEqual(tight.filter((id) => !STUCK.includes(id)), [], 'bathrooms with a niche 0.3 m deep or more behind a mouth under 0.75 m');
  assert.deepEqual(STUCK.filter((id) => !tight.includes(id)), [], 'a room of the list that has been cured: take it off the list');
  for (const id of ['L95.f0.r4', 'L95.f1.r4', 'L95.f2.r4', 'L75.f1.r4']) assert.ok(bathrooms.some((b) => b.id === id), `${id} is a bathroom of the barrio`);
});

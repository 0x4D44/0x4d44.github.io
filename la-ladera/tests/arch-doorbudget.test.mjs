// A2: the door budget. A building does not get more doors than it needs: on each floor the interior doors (doors and arches between two rooms) are a TREE over the rooms, so every room
// is reached one way and a door is never a second way into a room that another door already reaches (a shop with two doors onto the same stair column, a landing and a living room
// that both open onto the dining room, bedrooms that open onto each other as well as onto the landing). Arthur's playtest, L08 Droguería La Salud: "a strange internal layout with
// more doors than seem necessary" (19 rooms, 18 doors: a loop on each of its three floors).
//  * the census runs over all 109 buildings of the barrio and over the test lots, which cover every layout kind and a spread of plots;
//  * a loop is allowed only where the plan calls for one: the layout says so with `S.loops = '<why>'` (state.js `budgetDoors`), and only the cloister of a school does;
//  * wet rooms have one door (a toilet block's washroom is the one exception: its doors lead to its own cubicles), and no room but a hall has more than four;
//  * a bedroom is a LEAF of the door tree, never a way through (round 6, R4-301 / R4-302 / R1-101, the owner's own "strange layout": 83 floors had their only bathroom behind a bedroom, 41
//    behind two, 40 bedrooms were reached only through another bedroom, and all 50 flats were railroads, hall - living - the one bedroom - kitchen - bath): a bedroom has one door to another
//    room, and no room of any kind is reached only through a bedroom. The way in is the stair, the entry or a door to the street; the bath, the kitchen and the other bedrooms hang
//    from a hub (the landing, a hall, a corridor or the living room). The plans were drawn to give that (layouts.js `privateFloor`, `flatHome`, `layoutApartments`);
//  * no two door leaves swing over each other (doors that open straight onto each other: 79 pairs in 68 of the 109 buildings, every one beside a loop); the cubicle doors of a school's toilet
//    block, which open into their 1 m passage, are the one exception.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-doorbudget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { CIRCULATION } from '../js/arch/state.js';

const real = await buildData({ furnish: false });
const synth = planAll(testLots(), undefined, true, 0.4, 0);
const ALL = [['real', real.buildings], ['test', synth.bps]].flatMap(([tag, bps]) => bps.map((bp) => ({ tag, bp })));

/** The kinds whose plan has a ring of circulation on purpose (the cloister of a school: its hall, strip and galleries open onto the yard and onto each other). */
const LOOP_KINDS = new Set(['school']);
/** A room with more doors than this is a hall (circulation, the patio) or a toilet block's washroom: nothing else has to be a crossroads of five. */
const MAX_DOORS = 4;

const between = (d) => !!(d.rooms[0] && d.rooms[1]);
const tail = (id) => (id ? id.split('.').slice(1).join('.') : 'OUT');
const doorsOf = (bp, room) => bp.doors.filter((d) => d.rooms.includes(room.id));
const label = (bp, d) => `${bp.id} ${d.id} (${d.kind} ${d.rooms.map((id) => (id ? `${tail(id)} ${bp.rooms.find((r) => r.id === id).type}` : 'outside')).join(' - ')})`;
const finder = (rooms) => {
  const parent = new Map(rooms.map((r) => [r.id, r.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  return { find, join: (a, b) => parent.set(find(a), find(b)) };
};

/** Pairs of rooms that two doors join. */
function duplicates(bp) {
  const seen = new Map(), out = [];
  for (const d of bp.doors.filter(between)) {
    const k = [...d.rooms].sort().join(' | ');
    if (seen.has(k)) out.push(`${bp.id}: ${seen.get(k)} and ${d.id} both join ${k}`); else seen.set(k, d.id);
  }
  return out;
}
/** The doors that close a loop: the declared ones first (they are allowed), then the rest in the order the plan made them; a door that joins two rooms already joined is a loop. */
function loops(bp) {
  const { find, join } = finder(bp.rooms), inter = bp.doors.filter(between), out = { declared: [], undeclared: [] };
  for (const d of [...inter.filter((q) => q.loop), ...inter.filter((q) => !q.loop)]) {
    if (find(d.rooms[0]) !== find(d.rooms[1])) join(d.rooms[0], d.rooms[1]);
    else (d.loop ? out.declared : out.undeclared).push(d);
  }
  return out;
}
/** Wet rooms, bedrooms and crossroads: the rooms with more doors than the rule gives them (a bedroom is a leaf: one door to another room; an outside door does not count against it). */
function crowded(bp) {
  const out = [];
  for (const r of bp.rooms) {
    const n = doorsOf(bp, r).length;
    if (r.type === 'bathroom' && r.tag !== 'wash' && n !== 1) out.push(`${r.id} bathroom has ${n} doors`);
    else if (r.type === 'bedroom') { const inner = doorsOf(bp, r).filter(between).length; if (inner > 1) out.push(`${r.id} bedroom has ${inner} doors to other rooms (a bedroom is a leaf)`); }
    else if (n > MAX_DOORS && !CIRCULATION.has(r.type) && r.type !== 'patio' && r.tag !== 'wash') out.push(`${r.id} ${r.type} has ${n} doors`);
  }
  return out;
}
/** The rooms reached only through a bedroom. The way in is the stair (its landing or well), an entry hall or a door to the street; from there a bedroom is entered but never left (not even a bedroom
 *  with a street door of its own). A room with no door is `stranded`'s business, and a roof terrace is not judged (the stair head's door is not a way in). */
function behindBedrooms(bp) {
  const adj = new Map(bp.rooms.map((r) => [r.id, []])), type = new Map(bp.rooms.map((r) => [r.id, r.type])), roots = new Set();
  for (const d of bp.doors) {
    if (between(d)) { adj.get(d.rooms[0]).push(d.rooms[1]); adj.get(d.rooms[1]).push(d.rooms[0]); }
    else if (!d.roof) roots.add(d.rooms[0] || d.rooms[1]);
  }
  for (const r of bp.rooms) if (['stairwell', 'landing', 'entry'].includes(r.type)) roots.add(r.id);
  const seen = new Set(roots), queue = [...roots];
  while (queue.length) {
    const c = queue.shift();
    if (type.get(c) === 'bedroom') continue;
    for (const n of adj.get(c)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return bp.rooms.filter((r) => !r.outdoor && r.type !== 'terrace' && adj.get(r.id).length && !seen.has(r.id));
}
/** Pairs of door leaves (arches have none) on one floor whose swing squares overlap by more than 2 dm2: two doors that open onto each other. `toilets` marks the pairs that both belong to one washroom. */
function swings(bp) {
  const out = [], leaves = bp.doors.filter((d) => d.kind !== 'arch' && d.clear), area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  const wash = (d) => d.rooms.some((id) => id && bp.rooms.find((r) => r.id === id).tag === 'wash');
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const p = leaves[i], q = leaves[j];
    if (p.floor === q.floor && area(p.clear, q.clear) > 0.02) out.push({ p, q, toilets: wash(p) && wash(q) });
  }
  return out;
}
/** Rooms nobody can enter: an indoor room without a door (on a floor that is walled: the open deck of an unfinished house has none), or a group of rooms that reaches neither the street nor the stair. */
function stranded(bp) {
  const out = [], { find, join } = finder(bp.rooms), open = new Set(bp.floors.filter((f) => f.open).map((f) => f.index));
  for (const d of bp.doors.filter(between)) join(d.rooms[0], d.rooms[1]);
  for (const r of bp.rooms) if (!r.outdoor && !open.has(r.floor) && !doorsOf(bp, r).length) out.push(`${r.id} ${r.type} has no door`);
  for (const k of new Set(bp.rooms.map((r) => r.floor))) {
    if (open.has(k)) continue;
    const indoor = bp.rooms.filter((r) => r.floor === k && !r.outdoor && doorsOf(bp, r).length);
    const exits = new Set(bp.rooms.filter((r) => r.floor === k && doorsOf(bp, r).some((d) => d.ext || !d.rooms[0] || d.roof)).map((r) => find(r.id)));
    const stairs = new Set(bp.rooms.filter((r) => r.floor === k && r.core).map((r) => find(r.id)));
    for (const p of new Set(indoor.map((r) => find(r.id)))) if (!exits.has(p) && !stairs.has(p)) out.push(`${bp.id} floor ${k}: a group of rooms (${indoor.filter((r) => find(r.id) === p).map((r) => tail(r.id)).join(', ')}) reaches neither the street nor the stair`);
  }
  return out;
}

test('the census reaches every building: 109 of the barrio and the test lots of every layout kind', () => {
  assert.equal(real.buildings.length, 109, 'the barrio has 109 buildings');
  const kinds = new Set(ALL.map(({ bp }) => bp.lot.kind));
  for (const k of ['house', 'rowhouse', 'shophouse', 'cornerstore', 'apartments', 'unfinished', 'courtyard', 'tenement', 'school', 'clinic', 'hall', 'chapel', 'workshop']) assert.ok(kinds.has(k), `a ${k} is in the census (${[...kinds]})`);
  assert.ok(ALL.reduce((n, { bp }) => n + bp.doors.length, 0) > 2000, 'there are doors to count');
});

test('no two doors join the same two rooms', () => {
  assert.deepEqual(ALL.flatMap(({ tag, bp }) => duplicates(bp).map((s) => `${tag} ${s}`)), []);
});

test('the interior doors of a floor are a tree: a door never joins two rooms that others already join, unless the plan declares the loop', () => {
  const bad = [];
  for (const { tag, bp } of ALL) {
    const { declared, undeclared } = loops(bp);
    for (const d of undeclared) bad.push(`${tag} ${label(bp, d)} closes a loop (floor ${d.floor})`);
    for (const d of declared) if (!LOOP_KINDS.has(bp.lot.kind) || typeof d.loop !== 'string' || !d.loop) bad.push(`${tag} ${label(bp, d)}: a loop declared where no plan calls for one (${JSON.stringify(d.loop)})`);
  }
  assert.ok(ALL.some(({ bp }) => bp.lot.kind === 'school'), 'the school is in the census');
  assert.deepEqual(bad, []);
});

test('a wet room has one door (a toilet block\'s washroom, the passage to its cubicles, excepted); a bedroom one door to another room; only a hall has more than four', () => {
  let wash = 0, baths = 0, bedrooms = 0;
  for (const { bp } of ALL) for (const r of bp.rooms) { if (r.type === 'bathroom') { baths++; if (r.tag === 'wash') wash++; } else if (r.type === 'bedroom') bedrooms++; }
  assert.ok(wash >= 2 && baths > 250 && bedrooms > 300, `rooms to look at: ${baths} bathrooms (${wash} washrooms), ${bedrooms} bedrooms`);
  assert.deepEqual(ALL.flatMap(({ tag, bp }) => crowded(bp).map((s) => `${tag} ${s}`)), []);
});

test('a bedroom is a leaf, never a way through: no bathroom, kitchen or other bedroom is reached only through a bedroom, in the barrio, its flats and the test lots (R4-301, R4-302, R1-101)', () => {
  const bad = [];
  let floors = 0, flats = 0, bedrooms = 0, baths = 0;
  for (const { tag, bp } of ALL) {
    flats += bp.rooms.filter((r) => r.unit && r.type === 'bedroom').length;
    bedrooms += bp.rooms.filter((r) => r.type === 'bedroom').length;
    baths += bp.rooms.filter((r) => r.type === 'bathroom').length;
    floors += new Set(bp.rooms.filter((r) => r.type === 'bedroom').map((r) => r.floor)).size;
    for (const r of behindBedrooms(bp)) bad.push(`${tag} ${bp.id} ${tail(r.id)} ${r.type} is reached only through a bedroom`);
  }
  assert.ok(floors > 200 && flats >= 50 && baths > 250, `rooms to look at: ${floors} floors with bedrooms, ${flats} flats, ${baths} bathrooms (${bedrooms} bedrooms)`);
  assert.deepEqual(bad, []);
});

test('no two door leaves swing over each other (a toilet block\'s cubicle doors, which open into their passage, excepted)', () => {
  const school = real.buildings.find((b) => b.lot.kind === 'school');
  assert.ok(swings(school).length > 0 && swings(school).every((s) => s.toilets), `the school's toilet block is the exception: ${swings(school).length} pairs there, all of them in the washroom`);
  assert.deepEqual(ALL.flatMap(({ tag, bp }) => swings(bp).filter((s) => !s.toilets).map((s) => `${tag} ${bp.id}: ${s.p.id} and ${s.q.id} swing over each other (${tail(s.p.rooms[0])} - ${tail(s.p.rooms[1])}, ${tail(s.q.rooms[0])} - ${tail(s.q.rooms[1])})`)), []);
});

test('the budget removes loops, never the way in: every indoor room has a door and every group of rooms reaches the street or the stair', () => {
  assert.deepEqual(ALL.flatMap(({ tag, bp }) => stranded(bp).map((s) => `${tag} ${s}`)), []);
});

test('TEETH: each check finds the fault planted in a copy of L08 Droguería La Salud and of the L06 flats (and both are clean)', () => {
  const l08 = real.buildings.find((b) => b.id === 'L08'), room = (id) => l08.rooms.find((r) => r.id === id);
  assert.ok(l08 && l08.rooms.length === 19, 'L08 has its 19 rooms');
  const mk = (extra, drop = []) => ({ ...l08, doors: [...l08.doors.filter((d) => !drop.includes(d.id)), ...extra] });
  const door = (id, a, b, o = {}) => ({ ...l08.doors.find((d) => d.kind === 'interior' && d.rooms.every(Boolean)), id, rooms: [a, b], floor: room(a).floor, ...o });
  // L08 as planned: a tree on every floor, one door to each bathroom, every bedroom a leaf and nothing behind one, nothing stranded
  assert.deepEqual([duplicates(l08), loops(l08).undeclared, crowded(l08), behindBedrooms(l08), stranded(l08)], [[], [], [], [], []]);
  // a second door between the dining room and the kitchen: a duplicate pair, and a loop
  const dup = mk([door('L08.x1', 'L08.f1.r2', 'L08.f1.r3')]);
  assert.equal(duplicates(dup).length, 1);
  assert.equal(loops(dup).undeclared.length, 1);
  // the living room opening onto the dining room as well as onto the landing: a loop, on its own
  const tri = mk([door('L08.x2', 'L08.f1.r1', 'L08.f1.r2')]);
  assert.deepEqual([duplicates(tri).length, loops(tri).undeclared.length], [0, 1]);
  // a loop the plan declares (every door of the ring marked) is counted as declared, not as a fault (the kind decides whether it may be one)
  const ring = { ...l08, doors: [...l08.doors.map((d) => (['L08.d7', 'L08.d8'].includes(d.id) ? { ...d, loop: 'cloister' } : d)), door('L08.x3', 'L08.f1.r1', 'L08.f1.r2', { loop: 'cloister' })] };
  assert.deepEqual([loops(ring).undeclared.length, loops(ring).declared.length], [0, 1]);
  // a second door into a bathroom, a door between the two bedrooms of the top floor (each is no longer a leaf), a fifth into a shop
  assert.deepEqual(crowded(mk([door('L08.x4', 'L08.f1.r4', 'L08.f1.r0')])), ['L08.f1.r4 bathroom has 2 doors']);
  assert.deepEqual(crowded(mk([door('L08.x5', 'L08.f2.r1', 'L08.f2.r3')])), ['L08.f2.r1 bedroom has 2 doors to other rooms (a bedroom is a leaf)', 'L08.f2.r3 bedroom has 2 doors to other rooms (a bedroom is a leaf)']);
  assert.ok(crowded(mk([door('L08.x6', 'L08.f0.r2', 'L08.f0.r0'), door('L08.x7', 'L08.f0.r2', 'L08.f0.r1')])).some((s) => s.startsWith('L08.f0.r2 shop has 5 doors')));
  // the bathroom of the top floor opening onto the bedroom instead of the living room (the owner's complaint: landing - bedroom - bedroom - bath), and a bedroom reached through the other one
  const bathBehind = mk([door('L08.x9', 'L08.f2.r1', 'L08.f2.r4')], ['L08.d15']);
  assert.deepEqual(behindBedrooms(bathBehind).map((r) => r.id), ['L08.f2.r4']);
  assert.deepEqual(stranded(bathBehind), [], 'the bath is reached, only through a bedroom: the budget alone would not see it');
  assert.deepEqual(behindBedrooms(mk([door('L08.x10', 'L08.f2.r1', 'L08.f2.r3')], ['L08.d14'])).map((r) => r.id), ['L08.f2.r1']);
  // a flat as a railroad (hall - living - the one bedroom - kitchen - bath: the 50 flats of the barrio before round 6), made of L06's first flat, then left alone as planned
  const l06 = real.buildings.find((b) => b.id === 'L06'), rail = { ...l06, doors: [...l06.doors.filter((d) => d.id !== 'L06.d3'), { ...l06.doors.find((d) => d.id === 'L06.d2'), id: 'L06.x1', rooms: ['L06.f0.r3', 'L06.f0.r4'] }] };
  assert.deepEqual([duplicates(l06), loops(l06).undeclared, crowded(l06), behindBedrooms(l06), stranded(l06)], [[], [], [], [], []]);
  assert.deepEqual(behindBedrooms(rail).map((r) => `${r.type} ${tail(r.id)}`), ['kitchen f0.r4', 'bathroom f0.r5']);
  assert.deepEqual(crowded(rail), ['L06.f0.r3 bedroom has 2 doors to other rooms (a bedroom is a leaf)']);
  // a second leaf that swings over the landing's door of the bedroom floor: two doors that open onto each other
  assert.deepEqual(swings(l08), []);
  assert.deepEqual(swings(mk([door('L08.x8', 'L08.f2.r1', 'L08.f2.r2', { clear: l08.doors.find((d) => d.id === 'L08.d13').clear })])).map((s) => `${s.p.id}/${s.q.id}/${s.toilets}`), ['L08.d13/L08.x8/false']);
  // the doors of the bathroom taken away: a room nobody can enter
  assert.deepEqual(stranded(mk([], ['L08.d15'])).filter((s) => s.includes('f2.r4')), ['L08.f2.r4 bathroom has no door']);
  // the doors of the stair landing taken away: a group of rooms with no way to the stair or the street
  assert.ok(stranded(mk([], ['L08.d12', 'L08.d13'])).some((s) => s.includes('floor 2: a group of rooms')));
});

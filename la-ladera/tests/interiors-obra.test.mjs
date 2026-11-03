// INTERIORS (A3, round 7): the unfinished houses (R4-709).
//  - Ten of the barrio's twelve houses still in concrete had households that slept on nothing: the plan has no bedroom on the street floor, the second family's one room is a raw bedroom upstairs, and the raw
//    rooms were furnished as store rooms (cement, paint, a mattress by chance that was nobody's). `special.js construction` now says what each raw room is for (`use`: 'camp' where a household sleeps,
//    'store' for the rest indoors, 'obra' for the open deck) and gives each household its camp beds, a seat in the room it lives in, and no tile in a bathroom of bare concrete.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-obra.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout } from '../js/interiors/layout.js';
import * as special from '../js/interiors/special.js';
import { householdPlaces } from '../js/interiors/rooms.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { roomFinish } from '../js/arch/finish.js';
import { makeRng } from '../js/core/rng.js';
import { furnishedBatch } from './interiors-lib.mjs';

const { construction, takesCamp } = special;                  // (a namespace import: on the code before the patch, where `takesCamp` does not exist, the censuses still run, and fail)
const w = await furnishedBatch({ real: true });
const houses = w.bps.filter((bp) => bp.lot?.kind === 'unfinished');

const PLACES = { bed_double: 2, bed_double_wood: 2, bed_bunk: 2, bed_single: 1, bed_single_metal: 1, bed_cot: 1, mattress_floor: 1 };
const piecesOf = (bp, r) => bp.furniture.filter((f) => f.room === r.id && !f.decal && !f.parent);
const isSeat = (f) => !!CATALOG[f.name]?.seat;
/** The rooms `index.js pickFurnisher` hands to `special.js construction`: above the street floor, or open to the sky. */
const rawOf = (bp) => bp.rooms.filter((r) => r.outdoor || r.floor > 0);
const CORE = new Set(['stairwell', 'landing']);

test('census: every household of every unfinished house has a bed to sleep in and a sleep anchor of its own, and none is given more places than it needs (ten of the twelve houses had households that slept on nothing)', () => {
  assert.ok(houses.length >= 12, `the real plans have unfinished houses (${houses.length})`);
  const bad = []; let hhs = 0, owed = 0, had = 0;
  for (const bp of houses) for (const h of bp.interior.hh) {
    hhs++;
    const beds = bp.furniture.filter((f) => !f.decal && PLACES[f.name] && bp.interior.rooms[f.room]?.hh === h.id);
    const places = beds.reduce((s, f) => s + PLACES[f.name], 0), owes = householdPlaces(h);
    const anchors = bp.anchors.filter((a) => a.kind === 'sleep' && a.owner === h.id).length;
    owed += owes; had += places;
    if (!beds.length || !anchors) bad.push(`${h.id} (${h.kind}, ${h.kids ?? 0} children): ${beds.length} bed(s), ${anchors} sleep anchor(s)`);
    if (places > owes) bad.push(`${h.id}: ${places} places for the ${owes} it needs`);
  }
  assert.ok(hhs >= 24, `the unfinished houses have households (${hhs})`);
  assert.deepEqual(bad, [], 'households without a bed, or with more than they need');
  assert.ok(had >= owed / 2, `half of the sleeping places the households need (${had} of ${owed}: a raw bedroom of 3 to 6 m2 holds two or three mattresses)`);
});

test('census: a raw room says what it is used for: "camp" where a household sleeps (and only there), "store" for the rest indoors, "obra" on the open deck, nothing for a stair core; the plan\'s own type is untouched', () => {
  const seen = { camp: 0, store: 0, obra: 0 };
  for (const bp of houses) for (const r of rawOf(bp)) {
    const rec = bp.interior.rooms[r.id], mats = piecesOf(bp, r).filter((f) => f.name === 'mattress_floor').length, where = `${bp.id}.${r.id} (${r.type})`;
    assert.ok(rec, `${where}: no record`);
    assert.equal(rec.type, r.type, `${where}: the plan's type is what the record says`);
    if (CORE.has(r.type)) { assert.equal(rec.use, null, `${where}: a stair core is not used for anything`); continue; }
    if (r.outdoor) assert.equal(rec.use, 'obra', `${where}: the open deck is the building site`);
    else assert.ok(rec.use === 'camp' || rec.use === 'store', `${where}: use ${rec.use}`);
    assert.equal(rec.use === 'camp', mats > 0, `${where}: use ${rec.use} with ${mats} mattress(es)`);
    seen[rec.use]++;
  }
  assert.ok(seen.camp >= 24 && seen.store >= 12 && seen.obra >= 12, `the barrio has raw rooms of each use (${JSON.stringify(seen)})`);
});

test('census: a raw bathroom is a store room: no toilet, basin, shower, seat, mattress or radio in a room of bare concrete', () => {
  let seen = 0;
  for (const bp of houses) for (const r of rawOf(bp).filter((x) => x.type === 'bathroom' && !x.outdoor)) {
    seen++;
    const names = piecesOf(bp, r).map((f) => f.name), where = `${bp.id}.${r.id}`;
    assert.equal(bp.interior.rooms[r.id].use, 'store', `${where}: a bathroom is a store`);
    assert.deepEqual(names.filter((n) => /^(toilet|basin_|shower_)/.test(n) || n === 'mattress_floor' || n === 'radio_boombox' || CATALOG[n]?.seat), [], `${where}: holds a fixture, a bed, a seat or the household's radio`);
  }
  assert.ok(seen >= 12, `the unfinished houses have raw bathrooms (${seen})`);
});

test('census: no raw room has a dado (arch/finish.js gave a bathroom of bare concrete a tiled one 1.6 m high, and a living room or a hall a painted one)', () => {
  let seen = 0; const bad = [];
  for (const bp of houses) for (const r of bp.rooms.filter((x) => x.finish?.floor === 'floor_concrete_raw')) {
    seen++;
    const d = roomFinish(r, bp).dado;
    if (d) bad.push(`${bp.id}.${r.id} (${r.type}): a dado of ${d.m} ${d.h} m`);
  }
  assert.ok(seen >= 100, `the unfinished houses have raw rooms (${seen})`);
  assert.deepEqual(bad, [], 'raw rooms with a dado');
});

test('census: every raw living room and hall above the street has a seat (the six living rooms of L22, L37, L59, L67, L79 and L105 had none: the chair was walled in by the sacks and dropped), and so do most camps', () => {
  let seen = 0; const bad = [];
  for (const bp of houses) for (const r of rawOf(bp).filter((x) => !x.outdoor && (x.type === 'living' || x.type === 'hall'))) {
    seen++;
    if (!piecesOf(bp, r).some(isSeat)) bad.push(`${bp.id}.${r.id} (${r.type}): no seat in ${piecesOf(bp, r).map((f) => f.name)}`);
  }
  assert.ok(seen >= 12, `the unfinished houses have raw living rooms and halls (${seen})`);
  assert.deepEqual(bad, [], 'raw living rooms and halls without a seat');
  // a camp is a room people sleep in and sit in: a seat where its mattresses leave a wall for one (24 camps, 18 have one: two to four mattresses fill the other six)
  const camps = houses.flatMap((bp) => rawOf(bp).filter((x) => !x.outdoor && bp.interior.rooms[x.id].use === 'camp').map((x) => ({ bp, x })));
  const seated = camps.filter(({ bp, x }) => piecesOf(bp, x).some(isSeat)).length;
  assert.ok(camps.length >= 24 && seated >= camps.length * 2 / 3, `a camp has a seat where its mattresses leave the floor for one (${seated} of ${camps.length} camps)`);
});

/** A fake house in concrete: the plan's rooms (above the street floor unless said), one household per occupant, a household's own ids as `householdKey` makes them. */
const rawRoom = (id, type, floor, occupant, o = {}) => ({ id, type, floor, occupant, rect: { x0: 0, z0: 0, x1: 3, z1: 3 }, y: 3 * floor, h: 2.6, ...o });
const envOf = (rooms, finished = 0) => ({ bp: { id: 'X', lot: { kind: 'unfinished' }, rooms }, used: new Set(), states: new Map(), bedroomCount: () => finished, state(h) { let s = this.states.get(h.id); if (!s) this.states.set(h.id, s = { beds: 0 }); return s; } });
const house = (occupant, o = {}) => ({ id: `X.all.${occupant ?? ''}`, kind: 'family', kids: 2, elder: false, tints: {}, tidy: 0.5, income: 0, religious: 0, pets: [], hobby: null, ...o });

test('takesCamp(): a household with no finished bedroom camps in each raw bedroom upstairs that is its own, else in its first raw living room, else in its first hall; never on the street floor, on the deck, or in the rooms of another household', () => {
  const r = Object.fromEntries([
    rawRoom('X.f1.r1', 'bedroom', 1, 'family'), rawRoom('X.f1.r3', 'bedroom', 1), rawRoom('X.f1.r5', 'bedroom', 1), rawRoom('X.f1.r2', 'living', 1), rawRoom('X.f1.r4', 'bathroom', 1),
    rawRoom('X.f0.r1', 'bedroom', 0), rawRoom('X.f2.r1', 'terrace', 2, undefined, { outdoor: true }),
  ].map((x) => [x.id.slice(2), x]));
  const E = envOf(Object.values(r)), fam = house('family'), all = house(undefined);
  assert.equal(takesCamp(E, fam, r['f1.r1']), true, "the second family's one raw bedroom");
  assert.equal(takesCamp(E, fam, r['f1.r3']), false, "a bedroom that is the other household's");
  assert.equal(takesCamp(E, all, r['f1.r3']), true, 'the ground-floor household camps in its raw bedroom');
  assert.equal(takesCamp(E, all, r['f1.r5']), true, '... and in every other raw bedroom it owns');
  assert.equal(takesCamp(E, all, r['f1.r2']), false, 'it has raw bedrooms, so its living room is not a camp');
  assert.equal(takesCamp(E, all, r['f1.r4']), false, 'a bathroom is never a camp');
  assert.equal(takesCamp(E, all, r['f0.r1']), false, 'the street floor is not raw');
  assert.equal(takesCamp(E, all, r['f2.r1']), false, 'the open deck is no camp');
  assert.equal(takesCamp(envOf(Object.values(r), 1), all, r['f1.r3']), false, 'a household with a finished bedroom sleeps in it');
  // no raw bedroom: the first living room, and only the first; no living room either: the first hall
  const live = [rawRoom('X.f1.r2', 'living', 1), rawRoom('X.f1.r6', 'living', 1), rawRoom('X.f1.r7', 'hall', 1), rawRoom('X.f1.r8', 'hall', 1)], EL = envOf(live);
  assert.deepEqual(live.map((x) => takesCamp(EL, all, x)), [true, false, false, false], 'the first raw living room alone');
  const halls = live.filter((x) => x.type === 'hall'), EH = envOf(halls);
  assert.deepEqual(halls.map((x) => takesCamp(EH, all, x)), [true, false], 'the first hall alone');
});

test('construction(): the camp beds a household still lacks are counted across its raw rooms (the second raw bedroom takes what the first left owing, then it is a store), the first raw living room of one with no bedroom camps and has its seat', () => {
  const hh = house(undefined, { kids: 1 }), owed = householdPlaces(hh);                        // 2 + 1 children = 3 places
  const door = (id, room, x) => ({ id, kind: 'interior', w: 0.9, rooms: ['X.r0', room.id], swing: 1, hinge: 'left', x, z: -0.05 });
  const A = rawRoom('X.f1.r1', 'bedroom', 1, undefined, { rect: { x0: 0, z0: 0, x1: 2, z1: 2.4 } }), B = rawRoom('X.f1.r3', 'bedroom', 1), C = rawRoom('X.f1.r4', 'bedroom', 1);
  const E = envOf([A, B, C]);
  E.bp.windows = []; E.bp.stairs = []; E.bp.entrances = []; E.bp.colliders = { walls: [], floors: [] }; E.bp.doors = [door('X.d1', A, 1.0), door('X.d2', B, 1.5), door('X.d3', C, 1.5)];
  const run = (room, seed = 5) => { const L = new Layout({ bp: E.bp, room, rng: makeRng(seed), hh }); construction(L, E, hh); return { L, mats: L.items.filter((i) => i.name === 'mattress_floor').length, use: L.use }; };
  const a = run(A), b = run(B), c = run(C);
  assert.ok(a.mats >= 1 && a.mats < owed, `the small room takes some of the ${owed} places (${a.mats})`);
  assert.equal(a.use, 'camp');
  assert.equal(b.mats, owed - a.mats, `the next raw bedroom takes what is left owing (${b.mats} after ${a.mats})`);
  assert.equal(b.use, 'camp');
  assert.equal(c.mats, 0, 'a household that has its places leaves the third a store room');
  assert.equal(c.use, 'store');
  assert.equal(E.state(hh).camped, owed, 'the household\'s count of camp beds');
  for (const L of [a.L, b.L]) for (const m of L.items.filter((i) => i.name === 'mattress_floor')) assert.equal(m.flags?.unmade, true, 'a camp bed is not made up');
  // a household with no raw bedroom: its first raw living room is the camp
  const livingA = rawRoom('X.f1.r2', 'living', 1), livingB = rawRoom('X.f1.r6', 'living', 1), E2 = envOf([livingA, livingB]);
  E2.bp.windows = []; E2.bp.stairs = []; E2.bp.entrances = []; E2.bp.colliders = { walls: [], floors: [] }; E2.bp.doors = [door('X.d4', livingA, 1.5), door('X.d5', livingB, 1.5)];
  const runL = (room) => { const L = new Layout({ bp: E2.bp, room, rng: makeRng(7), hh }); construction(L, E2, hh); return L; };
  const la = runL(livingA), lb = runL(livingB);
  assert.equal(la.use, 'camp', 'the first raw living room is the camp');
  assert.ok(la.items.some((i) => i.name === 'mattress_floor') && la.items.some(isSeat), 'it has a bed and a seat');
  assert.equal(lb.use, 'store', 'the second is a store');
  assert.ok(lb.items.some(isSeat), 'a raw living room has its seat, camp or not');
});

test('construction(): in a raw living room too small for its materials and a chair (1.6 x 1.6 m) the materials give way, the last put down first, and the seat stands; only site materials are taken out', () => {
  const MATERIALS = ['cement_sacks', 'paint_cans_stack', 'wheelbarrow', 'bucket_big', 'box_cardboard_l', 'pipes_bundle', 'tire_stack'];
  const hh = house(undefined, { kind: 'couple', kids: 0 });
  for (const seed of [1, 2, 3, 4, 5]) {
    const room = rawRoom('X.f1.r2', 'living', 1, undefined, { rect: { x0: 0, z0: 0, x1: 1.6, z1: 1.6 } }), E = envOf([room], 1);
    E.bp.windows = []; E.bp.stairs = []; E.bp.entrances = []; E.bp.colliders = { walls: [], floors: [] };
    E.bp.doors = [{ id: 'X.d1', kind: 'interior', w: 0.9, rooms: ['X.r0', room.id], swing: 1, hinge: 'left', x: 0.8, z: -0.05 }];
    const L = new Layout({ bp: E.bp, room, rng: makeRng(seed), hh }), gone = [], late = [], remove = L.remove.bind(L);
    L.remove = (it) => {
      const mats = L.items.filter((i) => i.floor && MATERIALS.includes(i.name));                  // the materials still there, in the order they were put down
      gone.push(it.name); late.push(mats[mats.length - 1] === it);
      return remove(it);
    };
    construction(L, E, hh);
    assert.ok(gone.length > 0, `seed ${seed}: the materials left the seat no wall, so some gave way (this room is that scenario)`);
    assert.deepEqual(gone.filter((n) => !MATERIALS.includes(n)), [], `seed ${seed}: only site materials give way (${gone})`);
    assert.deepEqual(late.filter((x) => !x), [], `seed ${seed}: the last put down gives way first, the first put down stays (${gone})`);
    assert.ok(L.items.some(isSeat), `seed ${seed}: a seat stands in the room (${L.items.map((i) => i.name)})`);
  }
});

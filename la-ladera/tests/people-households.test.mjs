// Who lives where and what they are called: the residents of the barrio are members of the households the interiors furnish (js/interiors/household.js), with that member's
// first name and the household's surname, so a diary that says "Camila" is about the girl who lives there (the coordinator's ask; the diaries' voices are authorOf in
// js/interiors/content.js). Under Node, no browser. Every check has a mutant that turns it red (.scratch/a4/mutations_hh.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-households.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { planCast } from '../js/people/cast.js';
import { PERSONAS, kidGender, nameFromLot } from '../js/people/personas.js';
import { NAMES, householdsOf, studentOf } from '../js/interiors/household.js';
import { genderOf as nameGender } from '../js/interiors/content.js';
import { makeRng } from '../js/core/rng.js';

const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const castOf = (plan, households, seed = 1, count = null) => planCast({ plan, charMetas: METAS, rng: makeRng(seed).fork('people').fork('cast'), households, count });
const roleGender = (p) => (p.household.role === 'woman' ? 'f' : p.household.role === 'man' ? 'm' : kidGender(p.name.first));
const tagsOf = (p) => METAS.get(p.charId).tags ?? [];

// ---- a small made-up street: an elder couple, a family with a teenager, a couple, a student flat, a family with one child, a second elder couple -----------------------------------
const lotOf = (id, kind = 'house', extra = {}) => ({ id, kind, name: id, entrance: { outside: [0, 0, 0] }, ...extra });
const hhOf = (id, kind, names, o = {}) => ({ id, kind, kids: 0, teen: false, ...o, names });
const STUB = () => ({
  plan: { lots: [lotOf('H1'), lotOf('H2'), lotOf('H3'), lotOf('H4', 'apartments'), lotOf('H5'), lotOf('H6')] },
  households: new Map([
    ['H1', [hhOf('H1.all.', 'elder', { woman: 'Gilma', man: 'Alirio', sur: 'Cano', kid: 'Santiago', kid2: 'Sofía' })]],
    ['H2', [hhOf('H2.all.', 'family', { woman: 'Rosalba', man: 'Hernán', sur: 'Moreno', kid: 'Camila', kid2: 'Mateo' }, { kids: 2, teen: true })]],
    ['H3', [hhOf('H3.all.', 'couple', { woman: 'Nubia', man: 'Jairo', sur: 'Tovar', kid: 'Samuel', kid2: 'Luciana' })]],
    ['H4', [hhOf('H4.f1.', 'students', { woman: 'Fanny', man: 'Wilson', sur: 'Pineda', kid: 'Valentina', kid2: 'Andrés' })]],
    ['H5', [hhOf('H5.all.', 'elder', { woman: 'Consuelo', man: 'Evelio', sur: 'Ochoa', kid: 'Isabella', kid2: 'Sebastián' })]],
    ['H6', [hhOf('H6.all.', 'family', { woman: 'Luz Marina', man: 'Ramiro', sur: 'Gómez', kid: 'Juan David', kid2: 'Mariana' }, { kids: 1 })]],
  ]),
});
const hhById = (households, id) => [...households.values()].flat().find((h) => h.id === id);

test('a resident is a member of a household: that member\'s name, the household\'s surname, the member\'s gender, in the lot they live in', () => {
  const { plan, households } = STUB();
  for (let seed = 1; seed <= 40; seed++) {
    const cast = castOf(plan, households, seed, 12);
    assert.equal(cast.length, 12);
    for (const p of cast.filter((c) => c.household)) {
      const hh = hhById(households, p.household.id), role = p.household.role;
      assert.ok(hh, `seed ${seed}: ${p.name.display} lives in a household that exists`);
      assert.equal(p.name.first, hh.names[role], `seed ${seed}: ${p.persona} is called what the household calls its ${role}`);
      assert.equal(p.name.sur, hh.names.sur, `seed ${seed}: ${p.name.display} has the household's surname`);
      assert.equal(p.gender, roleGender(p), `seed ${seed}: ${p.name.first} is drawn as a ${roleGender(p) === 'f' ? 'woman or girl' : 'man or boy'}`);
      assert.equal(p.homeLot.id, p.household.lot, `seed ${seed}: ${p.name.display} lives in the lot of their household`);
    }
  }
});

test('a household member has one resident at most; the elders are the elderly couples, the children live where there are children, a teenager where there is one', () => {
  const { plan, households } = STUB();
  let teens = 0, kids = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const cast = castOf(plan, households, seed, 12), withHh = cast.filter((c) => c.household);
    const slots = withHh.map((p) => `${p.household.id}/${p.household.role}`);
    assert.equal(new Set(slots).size, slots.length, `seed ${seed}: nobody is cast twice as the same member (${slots.join(' ')})`);
    for (const p of withHh) {
      const hh = hhById(households, p.household.id);
      assert.equal(hh.kind === 'elder', p.age === 'elder', `seed ${seed}: ${p.persona} (${p.age}) in a ${hh.kind} household: the elders live with the elders and nobody else does`);
      if (p.age === 'kid' || p.age === 'teen') assert.ok(hh.kids >= 1 && ['kid', 'kid2'].includes(p.household.role), `seed ${seed}: the child ${p.name.display} lives where the interiors put children`);
      else assert.ok(hh.kind === 'students' ? ['kid', 'kid2'].includes(p.household.role) : ['woman', 'man'].includes(p.household.role), `seed ${seed}: a grown-up is a parent, one of a couple or a student`);
      if (p.persona === 'adolescente') { teens++; assert.equal(hh.teen, true, `seed ${seed}: the teenager lives in the household with a teenager`); }
      if (p.persona === 'nino') kids++;
    }
  }
  assert.ok(teens >= 30 && kids >= 30, `the checks ran on ${teens} teenagers and ${kids} children`);
});

test('a student flat\'s residents are young, with no "Don" or "Doña"; nobody who looks young is called Don or Doña', () => {
  const { plan, households } = STUB();
  let students = 0;
  for (let seed = 1; seed <= 80; seed++) {
    for (const p of castOf(plan, households, seed, 13).filter((c) => c.household)) {
      const hh = hhById(households, p.household.id), young = tagsOf(p).includes('young');
      if (hh.kind === 'students') { students++; assert.ok(young, `seed ${seed}: ${p.name.display} in the student flat is drawn young (${p.charId})`); }
      if (young) assert.equal(p.name.honor, '', `seed ${seed}: the young ${p.name.display} is not a Don or a Doña`);
    }
  }
  assert.ok(students >= 20, `${students} students checked`);
});

test('a shop sign\'s name is kept ("Doña Rosa") with the household\'s surname; a shop without a person on the sign has the household\'s keeper', () => {
  const lots = [lotOf('S1', 'shophouse', { shop: 'tienda', name: 'Tienda Doña Rosa' }), lotOf('S2', 'shophouse', { shop: 'tienda', name: 'Tienda La Esquina' })];
  const households = new Map([
    ['S1', [hhOf('S1.all.', 'shopkeeper', { woman: 'Amparo', man: 'Ramiro', sur: 'Arboleda', kid: 'Mateo', kid2: 'Sofía' }, { kids: 1 })]],
    ['S2', [hhOf('S2.all.', 'shopkeeper', { woman: 'Edilma', man: 'Octavio', sur: 'Quintero', kid: 'Camila', kid2: 'Samuel' }, { kids: 1 })]],
  ]);
  const cast = castOf({ lots }, households, 1, 2), by = Object.fromEntries(cast.map((p) => [p.shopLot.id, p]));
  const rosa = by.S1;
  assert.equal(rosa.name.first, 'Rosa'); assert.equal(rosa.name.honor, 'Doña'); assert.equal(rosa.name.display, 'Doña Rosa');
  assert.equal(rosa.name.sur, 'Arboleda', 'the surname is the household\'s');
  assert.equal(rosa.household.matched, false, 'the sign\'s Rosa is not the household\'s Amparo: told, not hidden');
  assert.equal(rosa.household.id, 'S1.all.');
  const esq = by.S2, hh = households.get('S2')[0];
  assert.equal(esq.name.first, hh.names[esq.gender === 'f' ? 'woman' : 'man'], 'the keeper of a shop without a person on the sign is the household\'s woman or man');
  assert.equal(esq.name.sur, 'Quintero'); assert.equal(esq.household.matched, true);
});

test('without households (an unfurnished build, a test) the cast is the same kind of cast: no household, unique names', () => {
  const { plan } = STUB();
  const cast = castOf(plan, null, 1, 12);
  assert.equal(cast.length, 12);
  assert.ok(cast.every((p) => p.household === null && p.homeLot), 'nobody claims a household that is not there; everybody still has a home');
  assert.equal(new Set(cast.map((p) => p.name.display)).size, cast.length, 'display names are unique');
});

// ---- the real barrio ---------------------------------------------------------------------------------------------------------------------------------
const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const HH = new Map();   // lot id -> the households the interiors furnished
for (const lot of plan.lots) { const bp = ctx.buildings.get(lot.id); if (bp?.interior?.hh?.length) HH.set(lot.id, bp.interior.hh); }
const cell = (h) => JSON.stringify([h.id, h.kind, h.kids, h.teen, h.names]);

test('the households of an unfurnished building are the households furnishing makes (same ids, kinds, children, names): either source gives the cast the same names', () => {
  let n = 0;
  for (const [id, hhs] of HH) {
    assert.deepEqual(householdsOf(ctx, ctx.buildings.get(id)).map(cell), hhs.map(cell), `lot ${id}`);
    n += hhs.length;
  }
  assert.ok(n > 200, `${n} households compared`);
});

test('the barrio: everybody has a household in the lot they live in, with that member\'s name; only a shopkeeper whose sign names a person keeps another name', () => {
  const cast = castOf(plan, HH, 1);
  assert.ok(cast.length >= 80, `${cast.length} people`);
  const matched = cast.filter((p) => p.household?.matched);
  assert.ok(matched.length / cast.length >= 0.9, `${matched.length} of ${cast.length} carry the name of the household member they are`);
  for (const p of cast) {
    assert.ok(p.household, `${p.name.display} has a household`);
    const hh = (HH.get(p.household.lot) ?? []).find((h) => h.id === p.household.id), role = p.household.role;
    assert.ok(hh, `${p.name.display}: household ${p.household.id} is one of lot ${p.household.lot}`);
    assert.equal(p.name.sur, hh.names.sur, `${p.name.display}: the household's surname`);
    assert.equal(p.homeLot.id, p.household.lot, `${p.name.display} lives in the household's lot`);
    assert.equal(p.gender, roleGender(p), `${p.name.display} (${role}) has the member's gender`);
    if (p.household.matched) assert.equal(p.name.first, hh.names[role], `${p.name.display} is called what the household calls its ${role}`);
    else {
      const sign = p.shopLot && nameFromLot(p.shopLot.name);
      assert.ok(sign, `${p.name.display} keeps a name that is not the household's, and no shop sign gives it`);
      assert.equal(p.name.first, sign.first, 'the name on the sign');
      assert.notEqual(sign.first, hh.names[role], 'unmatched means the sign and the household really differ');
    }
  }
  for (const p of cast.filter((c) => c.shopLot && !nameFromLot(c.shopLot.name))) assert.equal(p.household.matched, true, `${p.shopLot.name}: no person on the sign, so the keeper is the household's`);
  const slots = cast.map((p) => `${p.household.id}/${p.household.role}`);
  assert.equal(new Set(slots).size, slots.length, 'one resident per household member');
});

test('the barrio: elders live with the elderly, children where there are children, students look young; residents spread over the homes', () => {
  const cast = castOf(plan, HH, 1), per = new Map();
  for (const p of cast) {
    const hh = (HH.get(p.household.lot) ?? []).find((h) => h.id === p.household.id);
    if (!p.shopLot) per.set(p.homeLot.id, (per.get(p.homeLot.id) ?? 0) + 1);
    if (p.shopLot) continue;
    if (p.age === 'elder') assert.equal(hh.kind, 'elder', `${p.name.display} (${p.persona}) lives in a ${hh.kind} household`);
    else if (p.age === 'adult') assert.notEqual(hh.kind, 'elder', `${p.name.display} (${p.persona}) lives with the elderly`);
    if (p.age === 'kid' || p.age === 'teen') assert.ok(hh.kids >= 1, `${p.name.display} is a child in a household with ${hh.kids} children`);
    if (hh.kind === 'students') { assert.ok(tagsOf(p).includes('young'), `${p.name.display} lives in a student flat and is drawn ${p.charId}`); assert.equal(p.name.honor, '', `${p.name.display}`); }
  }
  const teens = cast.filter((p) => p.persona === 'adolescente'), inTeenHome = teens.filter((p) => (HH.get(p.household.lot) ?? []).find((h) => h.id === p.household.id).teen);
  assert.ok(teens.length >= 5 && inTeenHome.length / teens.length >= 0.8, `${inTeenHome.length} of ${teens.length} teenagers live where the interiors put a teenager`);
  const most = Math.max(...per.values());
  assert.ok(most <= 2, `no home lot has more than two of the community (the most: ${most}): they are spread over ${per.size} lots`);
});

test('names stay unique over many casts: no two people share a display name or a full name', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const cast = castOf(plan, HH, seed), disp = new Map(), full = new Map();
    for (const p of cast) {
      assert.ok(!disp.has(p.name.display), `seed ${seed}: "${p.name.display}" is both ${disp.get(p.name.display)} and ${p.id} ${p.persona}`); disp.set(p.name.display, `${p.id} ${p.persona}`);
      assert.ok(!full.has(p.name.full), `seed ${seed}: "${p.name.full}" is both ${full.get(p.name.full)} and ${p.id} ${p.persona}`); full.set(p.name.full, `${p.id} ${p.persona}`);
    }
  }
});

test('the first names the interiors draw all have a gender the casting can read (a boy is never drawn as a girl because the table lacks the name)', () => {
  for (const n of [...NAMES.women, ...NAMES.men, ...NAMES.kids]) assert.ok(nameGender(n), `${n} is in the interiors' gender table (js/interiors/content.js genderOf)`);
  for (const n of NAMES.women) assert.equal(kidGender(n), 'f', n);
  for (const n of NAMES.men) assert.equal(kidGender(n), 'm', n);
  NAMES.kids.forEach((n, i) => assert.equal(kidGender(n), i % 2 ? 'f' : 'm', `${n} (kids alternate boy, girl)`));
  assert.equal(kidGender('Luna'), 'f', 'a name the table does not know is judged by its ending, not left undefined');
  assert.equal(kidGender('Nicolás'), 'm');
});

// ---- the world carries it ------------------------------------------------------------------------------------------------------------------------------
test('PeopleSim casts from the interiors\' households: every person has the household, the lot and the name', () => {
  for (const [id] of ctx.physics.doors) ctx.physics.setDoor(id, false);
  ctx.hour = 12; ctx.errors = [];
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS), 'the cast is built');
  assert.equal(sim.faults.length, 0);
  assert.ok(sim.npcs.length >= 80);
  let matched = 0;
  for (const n of sim.npcs) {
    assert.ok(n.household, `${n.display} has a household`);
    assert.equal(n.homeLotId, n.household.lot, `${n.display} lives in the household's lot`);
    const hh = (HH.get(n.household.lot) ?? []).find((h) => h.id === n.household.id);
    assert.ok(hh, `${n.display}: household ${n.household.id}`);
    assert.equal(n.name.sur, hh.names.sur);
    if (n.household.matched) { matched++; assert.equal(n.name.first, hh.names[n.household.role]); }
  }
  assert.ok(matched / sim.npcs.length >= 0.9, `${matched} of ${sim.npcs.length} carry their household member's name`);
});

test('households are found for a building that has not been furnished: replayed from the seed, they are the furnished ones', () => {
  const buildings = new Map();
  for (const [id, bp] of ctx.buildings) buildings.set(id, { ...bp, interior: undefined });      // as if furnishing had not run
  const sim = new PeopleSim(Object.assign(Object.create(ctx), { buildings, errors: [] }));
  const map = sim._households(plan);
  assert.equal(sim.faults.length, 0);
  assert.deepEqual([...map.keys()].sort(), [...HH.keys()].sort(), 'a household list for every lot that has one');
  for (const [id, hhs] of HH) assert.deepEqual(map.get(id).map(cell), hhs.map(cell), `lot ${id}`);
});

test('a building whose households cannot be made is reported once as a fault, and the rest of the barrio is still cast from its households', () => {
  const spy = []; const ce = console.error; console.error = (...a) => spy.push(a.join(' '));
  try {
    const bad = { id: 'LX', get rooms() { throw new Error('no rooms here'); }, lot: { id: 'LX' } };
    const buildings = new Map(ctx.buildings); buildings.set('LX', bad);
    const sim = new PeopleSim(Object.assign(Object.create(ctx), { buildings, errors: [] }));
    const map = sim._households({ lots: [{ id: 'LX' }, ...plan.lots.slice(0, 3)] });
    assert.equal(map.has('LX'), false, 'nothing for the broken building');
    assert.ok(map.size >= 1 && [...map.keys()].every((k) => k !== 'LX'), `the others are there (${map.size})`);
    assert.equal(sim.faults.length, 1, 'one fault recorded');
    assert.match(sim.faults[0].msg, /no rooms here/);
  } finally { console.error = ce; }
  assert.ok(spy.length >= 1 && /no rooms here/.test(spy[0]), 'the fault was written to the console error once for whoever is looking');
});

test('personas: the community quotas still add up to the people the barrio is meant to have (the households did not change who is cast)', () => {
  const cast = castOf(plan, HH, 1), count = (persona) => cast.filter((p) => p.persona === persona).length;
  for (const [id, p] of Object.entries(PERSONAS)) if (p.kind === 'community') assert.equal(count(id), p.quota, `${id}`);
});

// ---- first names are handed out without replacement (R3-016: seven Amparos among 86 people, three of twelve talks with a "Doña Amparo") ------------------------
const tally = (names) => { const by = new Map(); for (const f of names) by.set(f, (by.get(f) ?? 0) + 1); return [...by].sort((a, b) => b[1] - a[1]); };
const showTop = (rows, over) => rows.filter(([, k]) => k > over).slice(0, 8).map(([f, k]) => `${f} x${k}`).join(', ');

test('first names: the pools are long (40+ a sex, 40+ children of each), real, and no name is in two of them', () => {
  const pools = { women: NAMES.women, men: NAMES.men, boys: NAMES.kids.filter((_, i) => i % 2 === 0), girls: NAMES.kids.filter((_, i) => i % 2 === 1) };
  for (const [what, list] of Object.entries(pools)) {
    assert.ok(list.length >= 40, `${what}: ${list.length} names`);
    assert.equal(new Set(list).size, list.length, `${what}: no name twice`);
    for (const n of list) assert.match(n, /^\p{Lu}[\p{L}]+( \p{Lu}[\p{L}]+)?$/u, `${what}: "${n}" is a first name (one or two capitalised words)`);
  }
  const all = Object.values(pools).flat();
  assert.equal(new Set(all).size, all.length, `a name in two pools: ${tally(all).filter(([, k]) => k > 1).map(([f]) => f).join(', ')}`);
  assert.ok(NAMES.surnames.length >= 60 && new Set(NAMES.surnames).size === NAMES.surnames.length, `${NAMES.surnames.length} surnames`);
});

test('first names: no first name belongs to more than two of the households\' adult residents of the whole barrio', () => {
  const adults = [];
  for (const hhs of HH.values()) for (const hh of hhs) adults.push(...(hh.kind === 'students' ? [hh.names.kid, hh.names.kid2] : [hh.names.woman, hh.names.man]));
  const rows = tally(adults);
  assert.ok(adults.length >= 500, `${adults.length} adult residents (the whole barrio: the plans' flats and houses set the number; the floor was 600 until the 2026-10-31 14:30 tree, which has 582)`);
  assert.equal(rows.filter(([, k]) => k > 2).length, 0, `${adults.length} adult residents, ${rows.length} different first names; used more than twice: ${showTop(rows, 2)}`);
});

test('first names: among the people of the cast no first name is borne by more than three, whatever the seed', () => {
  let people = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const cast = castOf(plan, HH, seed), rows = tally(cast.map((p) => p.name.first));
    people = cast.length;
    assert.ok(rows[0][1] <= 3, `seed ${seed}: ${showTop(rows, 3)} among ${cast.length} people`);
  }
  assert.ok(people >= 80, `${people} people cast`);
});

test('first names: the two children of a household never share a name, and about half of the first children are girls (a diary\'s {K} is a boy as often as a girl)', () => {
  let n = 0, girls = 0;
  for (const hhs of HH.values()) for (const hh of hhs) {
    n++; if (nameGender(hh.names.kid) === 'f') girls++;
    assert.notEqual(hh.names.kid, hh.names.kid2, `${hh.id}: both children are called ${hh.names.kid}`);
    assert.notEqual(hh.names.woman, hh.names.man);
  }
  assert.ok(girls / n > 0.35 && girls / n < 0.65, `${girls} of ${n} households have a girl as their first child`);
});

// The grown-ups of a student flat are named from the children's list (born in the 2000s) but counted among the ADULTS, so they take the names without replacement on their own: the Nth student
// flat of the barrio gets the Nth pair of one shuffled list of all the children's names (2026-10-31: the 291 households of the replanned barrio gave "Isabella x3" by the old place % 80).
const blocksOf = (n, seed) => {   // a made-up barrio of n apartment blocks, one flat each: the odd blocks ask for young people (a coin: a couple or students), the even ones draw their own kind
  const buildings = new Map();
  for (let i = 0; i < n; i++) {
    const id = `S${String(i).padStart(3, '0')}`, occupant = i % 2 ? 'young' : undefined;
    buildings.set(id, { id, lot: { id, kind: 'apartments', seed: i * 7 + 3 }, rooms: [{ id: `${id}.f0.r0`, floor: 0, type: 'living', occupant }, { id: `${id}.f0.r1`, floor: 0, type: 'bedroom', occupant }] });
  }
  return { seed, buildings };
};
const flatsOf = (fake) => [...fake.buildings.values()].flatMap((bp) => householdsOf(fake, bp).map((hh) => [bp, hh]));

test('first names: the student flats take the children\'s names without replacement by their place among the student flats (once each below 80 flats, never more than twice below 160)', () => {
  for (const [n, most, seed] of [[110, 1, 7], [110, 1, 11], [400, 2, 7], [400, 2, 12]]) {
    const fake = blocksOf(n, seed), flats = flatsOf(fake), students = flats.filter(([, hh]) => hh.kind === 'students');
    assert.ok(students.length > 20 && students.length <= 160 && (most === 1 ? students.length <= 80 : students.length > 80), `${n} blocks, seed ${seed}: ${students.length} student flats (the premise of this check)`);
    const rows = tally(students.flatMap(([, hh]) => [hh.names.kid, hh.names.kid2]));
    assert.ok(rows[0][1] <= most, `${n} blocks, seed ${seed}: ${students.length} student flats, ${rows.length} different names; used more than ${most === 1 ? 'once' : 'twice'}: ${showTop(rows, most)}`);
    for (const [, hh] of students) assert.notEqual(hh.names.kid, hh.names.kid2, `${hh.id}: both students are called ${hh.names.kid}`);
    for (const [, hh] of flats) assert.ok(nameGender(hh.names.kid) && nameGender(hh.names.kid2), `${hh.id}: the students' names have a gender the casting can read`);
  }
});

test('first names: the roster and the households agree on which flats are student flats (a student flat has its place, no other household has one) - in a made-up barrio and in the real one', () => {
  const fake = blocksOf(110, 7);
  const rows = [...flatsOf(fake).map(([bp, hh]) => [fake, bp, hh]), ...[...HH].flatMap(([id, hhs]) => hhs.map((hh) => [ctx, ctx.buildings.get(id), hh]))];
  let students = 0;
  for (const [c, bp, hh] of rows) {
    const place = studentOf(c, bp, hh.id);
    assert.equal(place != null, hh.kind === 'students', `${hh.id} is a ${hh.kind} household and has student place ${place}`);
    students += place != null ? 1 : 0;
  }
  assert.ok(students >= 40, `${students} student flats compared`);
  const places = rows.filter(([c]) => c === ctx).map(([c, bp, hh]) => studentOf(c, bp, hh.id)).filter((p) => p != null).sort((a, b) => a - b);
  assert.deepEqual(places, places.map((_, i) => i), 'the real barrio\'s student flats are numbered 0, 1, 2 ... with no gap and no repeat');
});

test('first names: neighbours do not share a surname - one building never repeats one, and no surname is the barrio\'s too often', () => {
  const sur = [];
  for (const hhs of HH.values()) {
    assert.equal(new Set(hhs.map((h) => h.names.sur)).size, hhs.length, `${hhs[0].id}: the households of one building have their own surnames`);
    sur.push(...hhs.map((h) => h.names.sur));
  }
  const rows = tally(sur);
  assert.ok(rows[0][1] <= 6, `${rows.length} surnames over ${sur.length} households; the most common: ${rows.slice(0, 4).map(([f, k]) => `${f} x${k}`).join(', ')}`);
});

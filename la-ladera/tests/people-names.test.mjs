// The names of the people of La Ladera on MY side of the line: the fallback pools (js/people/names.js, for a resident who is not a member of an interiors' household), makeName, kidGender
// and the cast's spread of first names (R3-016: seven "Amparo" among 86 residents, three of twelve talks with a "Doña Amparo"). The households' own pools are the interiors' (js/interiors/
// names.js, household.js; tests/people-households.test.mjs holds them). Under Node, no browser. Every check has a mutant that turns it red (.scratch/a4/mutations_names.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-names.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { planCast } from '../js/people/cast.js';
import { PERSONAS, NAMES, makeName, kidGender } from '../js/people/personas.js';
import { POOLS, ORIGIN, WOMEN, MEN, ELDER_WOMEN, ELDER_MEN, GIRLS, BOYS, SURNAMES, KNOWN_FIRST, genderOf } from '../js/people/names.js';
import { genderOf as interiorsGender } from '../js/interiors/content.js';
import { makeRng } from '../js/core/rng.js';

const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const { plan } = await buildData({ furnish: false, colliders: false });
const tally = (names) => { const by = new Map(); for (const f of names) by.set(f, (by.get(f) ?? 0) + 1); return [...by].sort((a, b) => b[1] - a[1]); };

// ---- the pools ------------------------------------------------------------------------------------------------------------------------------------------
test('pools: 60+ names for each of women, men, elder women, elder men, girls and boys, 300+ surnames, none twice, real-looking, one list per name', () => {
  const want = { women: 60, men: 60, elderWomen: 60, elderMen: 60, girls: 60, boys: 60, surnames: 300 };
  for (const [what, list] of Object.entries(POOLS)) {
    assert.ok(list.length >= want[what], `${what}: ${list.length} names, wanted ${want[what]}+`);
    assert.equal(new Set(list).size, list.length, `${what}: a name twice: ${tally(list).filter(([, k]) => k > 1).map(([n]) => n).join(', ')}`);
    for (const n of list) assert.match(n, /^\p{Lu}[\p{L}]+( \p{Lu}[\p{L}]+)?$/u, `${what}: "${n}" is one or two capitalised words`);
  }
  const first = [WOMEN, MEN, ELDER_WOMEN, ELDER_MEN, GIRLS, BOYS].flat();
  assert.equal(new Set(first).size, first.length, `a first name in two pools: ${tally(first).filter(([, k]) => k > 1).map(([n]) => n).join(', ')}`);
  assert.equal(first.filter((n) => SURNAMES.includes(n)).length, 0, `a name both a first name and a surname: ${first.filter((n) => SURNAMES.includes(n)).join(', ')}`);
  assert.equal(KNOWN_FIRST.length, first.length);
});

test('pools: every first name has the gender of its list (a woman is never a man), and the interiors\' own table never says otherwise', () => {
  for (const [list, g] of [[WOMEN, 'f'], [ELDER_WOMEN, 'f'], [GIRLS, 'f'], [MEN, 'm'], [ELDER_MEN, 'm'], [BOYS, 'm']]) for (const n of list) {
    assert.equal(genderOf(n), g, n);
    assert.equal(kidGender(n), g, `${n} read by the casting`);
    const theirs = interiorsGender(n);
    if (theirs) assert.equal(theirs, g, `${n}: the interiors' table says ${theirs}`);
  }
  assert.equal(genderOf('Zzyzx'), null);
});

test('pools: a Colombian barrio with Venezuelan, Peruvian and Ecuadorian neighbours: names of the three countries are in the lists', () => {
  const all = new Set([...KNOWN_FIRST]), sur = new Set(SURNAMES);
  for (const [country, o] of Object.entries(ORIGIN)) {
    assert.ok(o.first.length >= 10 && o.sur.length >= 20, `${country}: ${o.first.length} first names, ${o.sur.length} surnames`);
    for (const n of o.first) assert.ok(all.has(n), `${country}: first name ${n} is in a pool`);
    for (const n of o.sur) assert.ok(sur.has(n), `${country}: surname ${n} is in the pool`);
  }
  const foreign = new Set(Object.values(ORIGIN).flatMap((o) => o.first)), colombian = KNOWN_FIRST.filter((n) => !foreign.has(n));
  assert.ok(colombian.length > 4 * foreign.size, `the Colombian names are the bulk (${colombian.length} of ${KNOWN_FIRST.length})`);
});

test('personas NAMES: the old table is still there for whoever reads it, from the same lists', () => {
  assert.deepEqual(NAMES.kf, GIRLS); assert.deepEqual(NAMES.km, BOYS); assert.deepEqual(NAMES.sur, SURNAMES);
  assert.ok(NAMES.f.length >= 130 && NAMES.m.length >= 130, `${NAMES.f.length} women, ${NAMES.m.length} men`);
});

// ---- makeName -------------------------------------------------------------------------------------------------------------------------------------------
test('makeName: a name of the age of the person (an elder from the elders\' lists, a child from the children\'s, a grown-up from the grown-ups\') and a surname of the pool', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 80; i++) {
    for (const [gender, age, pool] of [['f', 'elder', ELDER_WOMEN], ['m', 'elder', ELDER_MEN], ['f', 'adult', WOMEN], ['m', 'adult', MEN], ['f', 'kid', GIRLS], ['m', 'kid', BOYS], ['f', 'teen', GIRLS], ['m', 'teen', BOYS]]) {
      const n = makeName(rng, gender, age, 'vecina');
      assert.ok(pool.includes(n.first), `${gender} ${age}: ${n.first}`);
      assert.ok(SURNAMES.includes(n.sur), n.sur);
      assert.equal(n.full, `${n.first} ${n.sur}`);
    }
  }
});

test('makeName: nobody takes a first name another resident already has, while the pool has one left', () => {
  const rng = makeRng(11), taken = new Set();
  const seen = new Set();
  for (let i = 0; i < ELDER_WOMEN.length; i++) { const n = makeName(rng, 'f', 'elder', 'abuela', null, taken); assert.ok(!seen.has(n.display), `"${n.display}" twice at ${i}`); seen.add(n.display); }
});

test('makeName: a name given by the household or the shop sign is kept as it is, whatever the pools hold', () => {
  const rng = makeRng(3), taken = new Set(['Doña Quetzal']);
  const a = makeName(rng, 'f', 'adult', 'vecina', null, taken, { first: 'Quetzal', sur: 'Zzyzx' });
  assert.equal(a.first, 'Quetzal'); assert.equal(a.sur, 'Zzyzx'); assert.equal(a.full, 'Quetzal Zzyzx');
  const b = makeName(rng, 'f', 'adult', 'tienda', { honor: 'Doña', first: 'Berta', gender: 'f' }, taken, { first: 'Amparo', sur: 'Quintero' });   // the sign names her Berta; the household's surname is hers
  assert.equal(b.display, 'Doña Berta'); assert.equal(b.full, 'Berta Quintero');
});

test('kidGender: a name no table knows is judged by its ending (the casting never assumes the pools)', () => {
  assert.equal(kidGender('Zzyzxa'), 'f'); assert.equal(kidGender('Zzyzxo'), 'm'); assert.equal(kidGender(undefined), 'm');
  assert.equal(kidGender('Luna'), 'f'); assert.equal(kidGender('Nicolás'), 'm');
});

// ---- the cast spreads the first names ---------------------------------------------------------------------------------------------------------------------
// A made-up barrio on the real plan: one household per home lot and per shop lot, each first name borne by TWO adjacent households (the worst a pool can do and still leave a free name
// for every resident: 50 names, 100 households), and arbitrary strange surnames. Nobody of the cast may share a first name with another resident.
function syntheticHouseholds(offset = 0) {
  const out = new Map(); let i = 0;
  for (const lot of plan.lots) {
    const home = ['house', 'rowhouse', 'apartments', 'shophouse', 'courtyard', 'tenement', 'unfinished', 'cornerstore'].includes(lot.kind);
    if (!home && !lot.shop) continue;
    const k = Math.floor((i + offset) / 2), kind = lot.shop ? 'shopkeeper' : i % 6 === 5 ? 'elder' : i % 6 === 2 ? 'couple' : 'family';
    const girlFirst = k % 2 === 0;
    out.set(lot.id, [{
      id: `${lot.id}.syn.`, kind, kids: kind === 'family' || kind === 'shopkeeper' ? 2 : 0, teen: kind === 'family' && i % 4 === 0,
      names: {
        woman: (kind === 'elder' ? ELDER_WOMEN : WOMEN)[k % 50], man: (kind === 'elder' ? ELDER_MEN : MEN)[k % 50], sur: `Zz${i}`,
        kid: (girlFirst ? GIRLS : BOYS)[k % 50], kid2: (girlFirst ? BOYS : GIRLS)[k % 50],
      },
    }]);
    i++;
  }
  return out;
}
const castOf = (households, seed) => planCast({ plan, charMetas: METAS, rng: makeRng(seed).fork('people').fork('cast'), households });

test('cast: among the residents no first name is borne twice while the households offer another (R3-016), whatever the seed', () => {
  let people = 0, households = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const hh = syntheticHouseholds(seed % 2); households = [...hh.values()].flat().length;
    const cast = castOf(hh, seed).filter((p) => !p.shopLot), rows = tally(cast.map((p) => p.name.first));
    people = cast.length;
    assert.ok(rows[0][1] === 1, `seed ${seed}: ${rows.filter(([, k]) => k > 1).map(([f, k]) => `${f} x${k}`).join(', ')} among ${cast.length} residents of ${households} households`);
  }
  assert.ok(people >= 50 && households >= 90, `${people} residents, ${households} households: a real test`);
});

test('cast: with no names to choose from (every household has the same names) it still casts everybody, and the displays stay different', () => {
  const same = new Map();
  for (const [id, hhs] of syntheticHouseholds()) same.set(id, hhs.map((h) => ({ ...h, names: { ...h.names, woman: h.kind === 'elder' ? 'Gloria' : 'Amparo', man: h.kind === 'elder' ? 'Hernando' : 'Libardo' } })));
  const cast = castOf(same, 5);
  assert.ok(cast.length >= 80, `${cast.length} cast`);
  const disp = tally(cast.map((p) => p.name.display)), full = tally(cast.map((p) => p.name.full));
  assert.equal(disp[0][1], 1, `a display twice: ${disp.filter(([, k]) => k > 1).map(([f]) => f).join(', ')}`);
  assert.equal(full[0][1], 1, `a full name twice: ${full.filter(([, k]) => k > 1).map(([f]) => f).join(', ')}`);
});

test('cast: names the casting has never seen are taken as they are (it assumes no pool)', () => {
  const odd = new Map();
  for (const [id, hhs] of syntheticHouseholds()) odd.set(id, hhs.map((h, j) => ({ ...h, names: { ...h.names, woman: `Quetzalia${id}${j}`, man: `Xochitlo${id}${j}`, kid: `Zyxa${id}`, kid2: `Wyxo${id}` } })));
  const cast = castOf(odd, 9);
  assert.ok(cast.length >= 80);
  for (const p of cast.filter((c) => c.household?.matched)) {
    const hh = [...odd.values()].flat().find((h) => h.id === p.household.id);
    assert.equal(p.name.first, hh.names[p.household.role], `${p.persona} keeps the household's name`);
    assert.equal(p.gender, p.household.role === 'woman' ? 'f' : p.household.role === 'man' ? 'm' : kidGender(p.name.first));
  }
  assert.ok(PERSONAS.vecina);
});

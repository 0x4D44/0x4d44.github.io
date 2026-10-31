// Who may say a line, and when (R3-020, R3-021): a pool line can name the speakers it fits (age, persona, shopkeeper or not) beside its hour window, so a shared line is never in the wrong mouth
// (the mototaxista "waiting for the bus", a teenager speaking as a parent) and a time-bound line is never said out of its time (the "blazing sun" at dusk, "I have just come out of class" and
// "the bell is waiting for me" in one talk).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-guards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/people/lines/index.js';
import { Dialogue, inWindow, mayBeSaid, newLineMemory } from '../js/people/dialogue.js';
import { PERSONAS, SHOP_PERSONAS } from '../js/people/personas.js';
import { SCHOOL } from '../js/people/schedule.js';
import { makeRng } from '../js/core/rng.js';

const WORLD = { landmarks: [], player: { x: 0, y: 0, z: 0, yaw: 0 }, discoveries: [] };
const talk = (bank, persona, o = {}) => new Dialogue({
  npc: { id: o.id ?? 'n1', persona, name: o.name ?? 'Rosa', gender: o.gender ?? 'f', age: o.age, mem: o.mem ?? null, shopName: o.shopName, act: o.act },
  bank, rng: makeRng(o.seed ?? 7), hour: o.hour ?? 10, world: WORLD, address: 'm', memory: o.memory ?? null,
});
const seeds = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('a line can say who may say it: an age, a persona, a shopkeeper or not (a speaker without an age counts as an adult)', () => {
  const TOY = {
    personas: { joven: {}, padre: {}, moto: {}, tendero: {} },
    shared: { family: [['SOLO-ADULTOS', 'x', { age: ['adult', 'elder'] }], ['NO-MOTO', 'x', { not: ['moto'] }], ['SOLO-MOTO', 'x', { only: ['moto'] }], ['NO-TENDERO', 'x', { shop: false }], ['SOLO-TENDERO', 'x', { shop: true }], ['TODOS', 'x']] },
  };
  const said = (persona, o) => [...new Set(seeds(80).map((seed) => { const d = talk(TOY, persona, { ...o, seed }); d.open(); return d.pick('family').line.es; }))].sort();
  assert.deepEqual(said('joven', { age: 'teen' }), ['NO-MOTO', 'NO-TENDERO', 'TODOS'], 'a teenager: no parent line, no shopkeeper line, no persona line that is not theirs');
  assert.deepEqual(said('padre', { age: 'adult' }), ['NO-MOTO', 'NO-TENDERO', 'SOLO-ADULTOS', 'TODOS']);
  assert.deepEqual(said('moto', { age: 'adult' }), ['NO-TENDERO', 'SOLO-ADULTOS', 'SOLO-MOTO', 'TODOS'], '"not" keeps the mototaxista out, "only" lets only them in');
  assert.deepEqual(said('tendero', { age: 'adult', shopName: 'Tienda Doña Rosa' }), ['NO-MOTO', 'SOLO-ADULTOS', 'SOLO-TENDERO', 'TODOS'], '"shop: false" keeps a keeper out, "shop: true" lets only a keeper in');
  assert.deepEqual(said('padre', {}), said('padre', { age: 'adult' }), 'no age given: an adult');
});

test('a topic whose lines nobody of this age may say is not offered, and the draw falls back to the filler instead of a wrong line', () => {
  const TOY = { personas: { joven: {} }, shared: { family: [['SOLO-ADULTOS', 'x', { age: ['adult'] }]], filler: [['Mmm.', 'Hmm.']] } };
  const d = talk(TOY, 'joven', { age: 'teen' }); d.open();
  assert.ok(!d.availableTopics().includes('family'), 'no family topic for a teenager when its only line is a parent\'s');
  assert.equal(d.pick('family').line.es, 'Mmm.');
  const a = talk(TOY, 'joven', { age: 'adult' }); a.open();
  assert.ok(a.availableTopics().includes('family')); assert.equal(a.pick('family').line.es, 'SOLO-ADULTOS');
  // a topic the teenager has said everything of stays done: a parent's line they may not say does not hold it open as "tell me more"
  const FOUR = { personas: { joven: {} }, shared: { family: [['T1', 'x'], ['T2', 'x'], ['T3', 'x'], ['SOLO-ADULTOS', 'x', { age: ['adult'] }]], filler: [['Mmm.', 'Hmm.']] } };
  const t = talk(FOUR, 'joven', { age: 'teen' }); t.open();
  assert.deepEqual([t.pick('family').line.es, t.pick('family').line.es, t.pick('family').line.es].sort(), ['T1', 'T2', 'T3']);
  assert.ok(!t.availableTopics().includes('family'), 'everything they may say has been said: the topic is done, whatever lines are left that are not theirs');
});

test('the barrio\'s round of a pool starts over when everything this kind of speaker may say has been said: a line they may not say never holds it open', () => {
  const TOY = { personas: { joven: {} }, shared: { family: [['T1', 'x'], ['T2', 'x'], ['SOLO-ADULTOS', 'x', { age: ['adult'] }]] } };
  for (const seed of seeds(40)) {
    const memory = newLineMemory(), said = [];
    for (let k = 0; k < 3; k++) { const d = talk(TOY, 'joven', { id: 'n' + k, age: 'teen', seed: seed * 7 + k, memory }); d.open(); said.push(d.pick('family').line.es); }      // three teenagers, one after the other
    assert.notEqual(said[1], said[0], `seed ${seed}: ${said}`);
    assert.notEqual(said[2], said[1], `seed ${seed}: the third teenager repeats the second (the round did not start over): ${said}`);
  }
});

// ---- R3-020: the shared pools -----------------------------------------------------------------------------------------------------------------------------------------------------
const BUS = /Esperando que pase el bus/;
test('R3-020: nobody who is the transport or minds a shop "waits for the bus"; a neighbour still does', () => {
  const opening = (persona, o) => seeds(300).map((seed) => talk(BANK, persona, { ...o, seed, act: 'wait', hour: 17.2 }).open().line.es);
  assert.ok(opening('vecino', { gender: 'm', age: 'adult' }).some((l) => BUS.test(l)), 'control: a neighbour who is waiting says it');
  assert.ok(!opening('mototaxista', { gender: 'm', age: 'adult' }).some((l) => BUS.test(l)), 'a mototaxista is the transport');
  for (const persona of SHOP_PERSONAS) assert.ok(!opening(persona, { gender: 'f', age: 'adult', shopName: 'La Esquina' }).some((l) => BUS.test(l)), `${persona}: a keeper waiting in their own shop is not at a bus stop`);
});

const PARENT = /Los muchachos crecen volando|Mis hijos se fueron a trabajar/;
test('R3-020: a child or a teenager never says a parent\'s family line, even when their own are used up and the shared pool answers', () => {
  const lines = (persona, age, gender, n = 8) => seeds(30).flatMap((seed) => {
    const memory = newLineMemory(), npcMem = { met: 0, lastHour: null, used: {}, heard: new Set() }, out = [];
    for (let k = 0; k < n; k++) { const d = talk(BANK, persona, { mem: npcMem, memory, seed: seed * 31 + k, age, gender }); d.open(); out.push(d.pick('family').line.es); }
    return out;
  });
  assert.ok(lines('vecina', 'adult', 'f', 12).some((l) => PARENT.test(l)), 'control: a grown woman says them when her own lines are used up');
  assert.ok(!lines('adolescente', 'teen', 'm').some((l) => PARENT.test(l)), 'a teenager is not a parent');
  assert.ok(!lines('nino', 'kid', 'm').some((l) => PARENT.test(l)), 'nor is a child');
});

// The rest of the shared pools (R3-020's second note): what one person says about themselves must still be true a minute later, whichever pool the next line comes from.
// `drawn` asks one topic `asks` times in a row, each ask a new conversation of the same person (one memory for the person, one for the barrio), so the persona's own lines are used up and the shared pool answers.
const drawn = (persona, key, o = {}, asks = 12, n = 30) => new Set(seeds(n).flatMap((seed) => {
  const memory = newLineMemory(), npcMem = { met: 0, lastHour: null, used: {}, heard: new Set() }, out = [];
  for (let k = 0; k < asks; k++) { const d = talk(BANK, persona, { ...o, mem: npcMem, memory, seed: seed * 31 + k }); d.open(); out.push(d.pick(key).line.es); }
  return out;
}));
const AGE_OF = (persona) => PERSONAS[persona]?.age ?? 'adult';

const ODD = /Uno se rebusca|Trabajo en lo que salga|hace de todo un poquito/, TAKE_WHAT_COMES = new Set(['vecino', 'vecina', 'obrero', 'mototaxista', 'ambulante']);
test('R3-020: "I work at whatever comes up" is only said by people who take what comes, never by a keeper, a teacher, a nurse, a pensioner, a teenager or a child', () => {
  const shops = new Set(SHOP_PERSONAS);
  for (const persona of Object.keys(BANK.personas)) {
    const said = [...drawn(persona, 'job', { age: AGE_OF(persona), gender: 'f', shopName: shops.has(persona) ? 'La Esquina' : undefined })].filter((l) => ODD.test(l));
    if (TAKE_WHAT_COMES.has(persona)) assert.ok(said.length >= 3, `control: ${persona} says all three when their own lines are used up (${said.length})`);
    else assert.deepEqual(said, [], `${persona} has a job of their own and does not say "${said[0]}"`);
  }
});

const TRADES = { taxi: /\btaxi(sta)?\b/i, fábrica: /fábrica/i, albañil: /albañil/i }, RIGHT_NOW = /^(Estoy|Estamos) \S+(ando|iendo|yendo)\b/i;
test('R3-020: a person has one trade and one thing they are doing right now: the job lines of a persona, shared ones included, never name two (not a taxi driver and a factory hand, a bricklayer and a shoemaker, a child at tag and in goal)', () => {
  for (const [id, p] of Object.entries(BANK.personas)) {
    const pool = [...(p.job ?? []), ...BANK.shared.job.filter((l) => mayBeSaid(l[2], { persona: id, age: AGE_OF(id) }))];
    const trades = Object.entries(TRADES).filter(([, re]) => pool.some((l) => re.test(l[0]))).map(([t]) => t);
    assert.ok(trades.length <= 1, `${id} names ${trades.join(' and ')} in one job pool: ${pool.map((l) => l[0]).join(' | ')}`);
    const now = pool.filter((l) => RIGHT_NOW.test(l[0]));
    assert.ok(now.length <= 1, `${id} says what they are doing right now twice: ${now.map((l) => l[0]).join(' | ')}`);
  }
  assert.ok(RIGHT_NOW.test('Estoy jugando a que soy el portero') && RIGHT_NOW.test('Estamos jugando a la lleva') && !RIGHT_NOW.test('En la cancha jugamos a la lleva'), 'the right-now pattern reads the present progressive');
  assert.ok(BANK.personas.nino.job.filter((l) => RIGHT_NOW.test(l[0])).length === 1, 'control: the child still says one thing they are doing right now');
  assert.ok(BANK.personas.vecino.job.some((l) => TRADES.taxi.test(l[0])) && BANK.personas.abuelo.job.some((l) => TRADES.albañil.test(l[0])), 'control: the two keep their trade');
});

const famLine = (re) => BANK.shared.family.find((l) => re.test(l[0]));
test('R3-020: the empty nest and the full house are never one speaker\'s, and an elder\'s mother does not live with them', () => {
  const NEST = famLine(/Mis hijos se fueron/), FULL = famLine(/Los muchachos crecen/), MOM = famLine(/Mi mamá vive conmigo/);
  assert.ok(NEST && FULL && MOM, 'the three family lines exist');
  for (const age of ['kid', 'teen', 'adult', 'elder']) assert.ok(!(mayBeSaid(NEST[2], { age }) && mayBeSaid(FULL[2], { age })), `a speaker of age ${age} may say both "my children left" and "the kids grow so fast"`);
  assert.ok(mayBeSaid(NEST[2], { age: 'elder' }) && mayBeSaid(FULL[2], { age: 'adult' }), 'control: an elder has an empty nest, an adult a full house');
  for (const age of ['kid', 'teen', 'adult']) assert.ok(mayBeSaid(MOM[2], { age }), `${age}: "my mother lives with me"`);
  assert.ok(!mayBeSaid(MOM[2], { age: 'elder' }), 'an elder\'s mother');
  // through the draw, with the persona's own lines used up: the elder woman, the neighbour
  const pick = (persona, age, re) => [...drawn(persona, 'family', { age, gender: 'f' })].filter((l) => re.test(l));
  assert.ok(pick('abuela', 'elder', /Mis hijos se fueron/).length, 'control: the grandmother has an empty nest');
  assert.deepEqual(pick('abuela', 'elder', /Los muchachos crecen|Mi mamá vive conmigo/), [], 'the grandmother has neither a full house nor a mother at home');
  assert.ok(pick('vecina', 'adult', /Los muchachos crecen/).length, 'control: the neighbour has a full house');
  assert.deepEqual(pick('vecina', 'adult', /Mis hijos se fueron/), [], 'the neighbour\'s children are home (her own lines say so)');
});

const GROWNUP = /las cuentas y las escaleras|Este barrio lo levantamos|Antes aquí no había ni luz/;
test('R3-020: the bills and "we built this barrio" are a grown-up\'s lines: a child or a teenager does not say them, an adult does', () => {
  const said = (persona, age) => ['mood', 'barrio'].flatMap((key) => [...drawn(persona, key, { age, gender: 'm' })]).filter((l) => GROWNUP.test(l));
  assert.ok(new Set(said('vecino', 'adult')).size >= 3, 'control: a neighbour says all three when their own lines are used up');
  assert.deepEqual(said('adolescente', 'teen'), [], 'a teenager has no bills and did not build the barrio');
  assert.deepEqual(said('nino', 'kid'), [], 'nor does a child');
});

test('every guard in the bank is well formed: known keys, real ages, personas that exist', () => {
  const KEYS = new Set(['from', 'to', 'age', 'only', 'not', 'shop']), AGES = new Set(['kid', 'teen', 'adult', 'elder']);
  let guarded = 0;
  const pools = [...Object.entries(BANK.shared).map(([k, p]) => [`shared.${k}`, p]), ...Object.entries(BANK.personas).flatMap(([id, ps]) => Object.entries(ps).filter(([, p]) => Array.isArray(p)).map(([k, p]) => [`${id}.${k}`, p]))];
  for (const [where, pool] of pools) for (const l of pool) {
    const w = Array.isArray(l) ? l[2] : null; if (w === undefined || w === null) continue;
    guarded++;
    assert.equal(typeof w, 'object', `${where}: "${l[0]}" has a third element that is not an object`);
    for (const k of Object.keys(w)) assert.ok(KEYS.has(k), `${where}: "${l[0]}" uses the unknown guard "${k}"`);
    for (const a of w.age ?? []) assert.ok(AGES.has(a), `${where}: "${l[0]}" names the age "${a}"`);
    for (const p of [...(w.only ?? []), ...(w.not ?? [])]) assert.ok(PERSONAS[p] || BANK.personas[p], `${where}: "${l[0]}" names the persona "${p}", which does not exist`);
    if (w.shop !== undefined) assert.equal(typeof w.shop, 'boolean', `${where}: "${l[0]}": shop is true or false`);
  }
  assert.ok(guarded >= 8, `${guarded} guarded lines in the bank`);
});

// ---- R3-021: lines with a time -------------------------------------------------------------------------------------------------------------------------------------------------
test('R3-021: the mototaxi "with this blazing sun" greeting is only said while the sun is up (until half past four), like the neighbours\' twin', () => {
  const greet = (hour) => seeds(300).map((seed) => talk(BANK, 'mototaxista', { gender: 'm', age: 'adult', seed, hour }).open().line.es);
  assert.ok(greet(14).some((l) => /solazo/.test(l)), 'control: at two in the afternoon it is said');
  for (const h of [16.5, 17.2, 17.9]) assert.ok(!greet(h).some((l) => /solazo/.test(l)), `at ${h} the sun is low`);
});

const CLASS = /Acabo de salir de clase/, BELL = /el timbre me espera/;
test('R3-021: the teacher has "just come out of class" only after school, and "the bell is waiting for me" only while it is on: never both in one talk', () => {
  const greetA = BANK.personas.maestra.greet_a.find((l) => CLASS.test(l[0])), byeBell = BANK.personas.maestra.bye.find((l) => BELL.test(l[0]));
  assert.ok(greetA && byeBell, 'both lines exist');
  assert.equal(greetA[2]?.from, SCHOOL.end, 'she is out of class from the minute the school day ends (schedule.js SCHOOL.end)');
  assert.equal(byeBell[2]?.to, SCHOOL.end, 'the bell calls her back only until the school day ends');
  for (let h = 0; h < 24; h += 0.05) assert.ok(!(inWindow(greetA[2], h) && inWindow(byeBell[2], h)), `at ${h.toFixed(2)} both lines can be said`);
  const one = (hour, seed) => { const d = talk(BANK, 'maestra', { hour, seed, age: 'adult' }); return [d.open().line.es, d.pick('bye').line.es]; };
  let sawClass = false, sawBell = false; const byes = new Set();
  for (const hour of [7.5, 9, 12.5, 12.79, 12.8, 13.5, 15, 17.2, 20, 23]) for (const seed of seeds(60)) {
    const [a, z] = one(hour, seed);
    assert.ok(!(CLASS.test(a) && BELL.test(z)), `at ${hour}: "${a}" and then "${z}"`);
    if (hour >= SCHOOL.end) assert.doesNotMatch(z, BELL, `at ${hour} school is out`); else assert.doesNotMatch(a, CLASS, `at ${hour} she is still in class`);
    if (CLASS.test(a)) sawClass = true; if (BELL.test(z)) sawBell = true; if (hour === 15) byes.add(z);
  }
  assert.ok(sawClass && sawBell, 'both are still said, each in its time');
  assert.ok(byes.size >= 2, `after school she still has more than one way to say goodbye (${[...byes].join(' | ')})`);
});

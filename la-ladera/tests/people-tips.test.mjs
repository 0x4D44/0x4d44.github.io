// "Anything worth seeing?" (R3-022): a person does not name a place they have already named, the barrio does not send everybody to the same place one after the other, and a sleeping dog is
// not introduced as "nature".
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-tips.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/people/lines/index.js';
import { Dialogue, newLineMemory } from '../js/people/dialogue.js';
import { hintPhrase, HINT_INTRO, PHRASE } from '../js/people/hints.js';
import { makeRng } from '../js/core/rng.js';

const D = (id, name, en, kind, x, z) => ({ id, name, en, kind, x, y: 2, z, found: false });
const PLACES = [                                                            // nearest first from the player at the origin
  D('w.rayuela', 'La rayuela', 'A hopscotch in chalk.', 'object', -5, -6),
  D('w.cancha', 'La Cancha El Cerro', 'The futsal court.', 'story', 12, 9),
  D('w.perro', 'El perro dormido', 'A street dog asleep in the sun.', 'nature', 16, 12),
  D('w.virgen', 'La Virgen del Carmen', "A neighbours' shrine.", 'shrine', 20, 22),
  D('w.cruz', 'La Cruz de la Cumbre', 'The summit cross.', 'vista', 30, -30),
  D('w.fiesta', 'El mural de la Fiesta de la Ladera', 'A mural.', 'mural', -40, 35),
];
const NAMES = { 'w.rayuela': /rayuela/, 'w.cancha': /Cancha El Cerro/, 'w.perro': /perro dormido/, 'w.virgen': /Virgen del Carmen/, 'w.cruz': /Cruz de la Cumbre/, 'w.fiesta': /Fiesta de la Ladera/ };
const which = (line) => Object.keys(NAMES).filter((id) => NAMES[id].test(line.es));

const WORLD = (discoveries) => ({ landmarks: [], player: { x: 0, y: 0, z: 0, yaw: 0 }, discoveries });
let npcSeq = 0;
const ask = ({ mem, memory, seed, discoveries = PLACES, persona = 'vecino' }) => {
  const d = new Dialogue({ npc: { id: 'n' + (++npcSeq), persona, name: 'Rosa', gender: 'f', age: 'adult', mem }, bank: BANK, rng: makeRng(seed), hour: 12, world: WORLD(discoveries), address: 'm', memory });
  return d.hint();
};
const freshMem = () => ({ met: 0, lastHour: null, used: {}, heard: new Set() });
const seeds = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('one person never names the same place twice while there are places they have not named (talk after talk, same memory)', () => {
  for (const seed of seeds(40)) {
    const mem = freshMem(), memory = newLineMemory(), named = [];
    for (let k = 0; k < PLACES.length; k++) named.push(...which(ask({ mem, memory, seed: seed * 17 + k })));
    assert.equal(new Set(named).size, PLACES.length, `seed ${seed}: ${named.join(', ')}`);
  }
});

test('one person who has told every place starts over (a tip is still answered and the second round names each place once too), and a place that was found is not named', () => {
  for (const seed of seeds(20)) {
    const mem = freshMem(), named = [];
    for (let k = 0; k < 2 * PLACES.length; k++) named.push(...which(ask({ mem, memory: null, seed: seed * 11 + k })));
    assert.equal(named.length, 2 * PLACES.length, 'every ask is answered with a place');
    assert.equal(new Set(named.slice(0, PLACES.length)).size, PLACES.length, `seed ${seed}, first round: ${named}`);
    assert.equal(new Set(named.slice(PLACES.length)).size, PLACES.length, `seed ${seed}, second round (the person started over): ${named}`);
  }
  const left = PLACES.map((p, i) => (i < 2 ? { ...p, found: true } : p));
  for (const seed of seeds(40)) for (const id of which(ask({ mem: freshMem(), memory: null, seed, discoveries: left }))) assert.ok(!['w.rayuela', 'w.cancha'].includes(id), `${id} was found already`);
});

test('the barrio does not send the next person to the place the last ones were sent to', () => {
  for (const seed of seeds(40)) {
    const memory = newLineMemory(), named = [];
    for (let k = 0; k < 5; k++) named.push(...which(ask({ mem: freshMem(), memory, seed: seed * 13 + k })));        // five different people, one after the other
    assert.equal(new Set(named).size, 5, `seed ${seed}: ${named.join(', ')}`);
  }
  // without a barrio memory (a Dialogue made on its own) a person still answers, and still does not repeat themselves
  const mem = freshMem(); const a = which(ask({ mem, memory: null, seed: 3 })), b = which(ask({ mem, memory: null, seed: 3 }));
  assert.notDeepEqual(a, b, 'the same person asked twice names two places even when the rng is the same');
});

test('two places only: nobody is left without an answer, and the nearer one is still told first-hand by turns', () => {
  const two = PLACES.slice(0, 2), memory = newLineMemory(), named = [];
  for (let k = 0; k < 6; k++) named.push(...which(ask({ mem: freshMem(), memory, seed: 20 + k, discoveries: two })));
  assert.equal(named.length, 6, 'every ask is answered with a place');
  for (let k = 1; k < named.length; k++) assert.notEqual(named[k], named[k - 1], `two in a row: ${named.join(', ')}`);
});

test('a sleeping dog (or hens, pigeons) is noticed, not introduced as "nature"; trees still are', () => {
  for (const id of ['w.perro', 'w.guardian', 'w.gallinas', 'w.palomas']) {
    const g = hintPhrase({ id, kind: 'nature' }).group;
    assert.notEqual(g, 'nature', `${id}: an animal is not "nature"`); assert.ok(HINT_INTRO[g], `${id}: the group "${g}" has openings`);
  }
  assert.equal(hintPhrase({ id: 'w.almendros', kind: 'nature' }).group, 'nature');
  const dog = [PLACES[2]], said = seeds(80).map((seed) => ask({ mem: freshMem(), memory: null, seed, discoveries: dog }));
  for (const l of said) { assert.doesNotMatch(l.es, /naturaleza/i, l.es); assert.doesNotMatch(l.en, /nature/i, l.en); assert.match(l.es, /perro dormido/); }
  assert.ok(said.some((l) => /animales/.test(l.es)), 'one of the openings speaks of animals');
});

// ---- R3-202: the verb after the place agrees with it. The tip always said "Queda" ("las placas de las calles. Queda ...", "los Almendros. Queda ...": 5 of the 31 places are plural), an animal is
// somewhere rather than located ("Está"), and "mire el perro" lacks the personal a ("mire al perro"). The English said "It's" after a plural.
const PHRASE_IDS = Object.keys(PHRASE), plural = (id) => /^(los|las)\s/i.test(PHRASE[id][0]), animal = (id) => PHRASE[id][2] === 'animal';
const told = (id, x, z, seed, kind = 'object') => ask({ mem: freshMem(), memory: null, seed, discoveries: [D(id, 'Un nombre', 'A name', kind, x, z)] });          // (the table names the place, not the discovery's own name)
const KINDS = ['object', 'vista', 'shrine', 'mural', 'story', 'nature'];                                       // every group of openings (an animal's group is the table's, whatever its kind)

test('hints.js: every place declares its number, and the declaration is what its article says', () => {
  assert.ok(PHRASE_IDS.length >= 31 && PHRASE_IDS.some(plural) && PHRASE_IDS.some(animal) && PHRASE_IDS.some((id) => plural(id) && animal(id)) && PHRASE_IDS.some((id) => !plural(id) && animal(id)), 'the table has plural places, animals, and both');
  for (const id of PHRASE_IDS) assert.equal(hintPhrase({ id }).plural, plural(id), `${id}: ${PHRASE[id][0]}`);
  assert.equal(hintPhrase({ id: 'w.zzz', kind: 'object', name: 'La Ceiba', en: 'The ceiba' }).plural, null, 'a place the table does not know: the caller reads the number off the article it puts on the name');
});

test('every place a neighbour can name: Queda / Quedan, and Está / Están for an animal, in the Spanish, It\'s / They\'re in the English, and the personal a after "mire" and "mirar"', () => {
  for (const id of PHRASE_IDS) {
    const pl = plural(id), an = animal(id), verb = an ? (pl ? 'Están' : 'Está') : (pl ? 'Quedan' : 'Queda'), other = an ? (pl ? 'Está' : 'Están') : (pl ? 'Queda' : 'Quedan'), wrong = an ? /Queda/ : /Está/;
    for (const [x, z, kind] of KINDS.flatMap((k) => [[2, -30, k], [3, 31, k]])) {                          // ahead, and behind the visitor ("Se devuelve y sigue"), whatever the kind
      for (let seed = 1; seed <= 8; seed++) {
        const l = told(id, x, z, seed, kind), es = l.es;
        assert.match(es, new RegExp(`\\. ${verb} `), `${id}: ${es}`); assert.doesNotMatch(es, new RegExp(`\\. ${other} `), `${id}: ${es}`); assert.doesNotMatch(es.split('. ').slice(1).join('. '), wrong, `${id}: ${es}`);
        assert.match(l.en, pl ? /\. They're / : /\. It's /, `${id}: ${l.en}`); assert.doesNotMatch(l.en, pl ? /\. It's / : /\. They're /, `${id}: ${l.en}`);
        const asObject = /\b(mire|mirar|miraría|ver|pierda) (a |al |el |la |los |las )/.exec(es.split('. ')[0])?.[2];       // what stands after "mire" and its kind
        if (an && asObject) assert.match(asObject, /^(a |al )/, `${id}: an animal after "mire" takes the personal a: ${es}`);
        if (!an && asObject) assert.doesNotMatch(asObject, /^(a |al )/, `${id}: a thing does not: ${es}`);
        if (an) assert.doesNotMatch(es, /(mire|mirar|miraría) (el|la|los|las) /, `${id}: ${es}`);
        assert.doesNotMatch(es, / a el /, es);
      }
    }
  }
  const dogs = seeds(60).map((seed) => told('w.perro', 2, -30, seed).es); assert.ok(dogs.some((s) => /mir(e|ar) al perro dormido\. Está /.test(s)), 'one of the openings is "mire al perro dormido. Está ..."');
  const hens = seeds(60).map((seed) => told('w.gallinas', 2, -30, seed).es); assert.ok(hens.some((s) => /mir(e|ar) a las gallinas de doña Rosa\. Están /.test(s)), 'and "mire a las gallinas de doña Rosa. Están ..."');
  assert.ok(seeds(60).map((seed) => told('w.perro', 2, -30, seed).es).some((s) => /^Fíjese en el perro dormido\. Está /.test(s)), '"fíjese en" keeps no a');
});

test('a place the table does not know takes its verb from the article its name gets: Los Mangos quedan, La Ceiba queda', () => {
  const say = (name, seed) => ask({ mem: freshMem(), memory: null, seed, discoveries: [D('w.zzz', name, 'The ' + name.replace(/^(Los|Las|La|El) /, ''), 'object', 2, -30)] });
  for (const seed of seeds(12)) {
    assert.match(say('Los Mangos', seed).es, /\. Quedan /); assert.match(say('Las Brisas', seed).es, /\. Quedan /); assert.match(say('La Ceiba', seed).es, /\. Queda /); assert.match(say('El Puente', seed).es, /\. Queda /);
    assert.match(say('Los Mangos', seed).en, /\. They're /); assert.match(say('La Ceiba', seed).en, /\. It's /);
  }
});

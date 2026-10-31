// "Anything worth seeing?" (R3-022): a person does not name a place they have already named, the barrio does not send everybody to the same place one after the other, and a sleeping dog is
// not introduced as "nature".
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-tips.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/people/lines/index.js';
import { Dialogue, newLineMemory } from '../js/people/dialogue.js';
import { hintPhrase, HINT_INTRO } from '../js/people/hints.js';
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

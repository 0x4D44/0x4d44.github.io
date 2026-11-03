// core/registries.js ANCHOR_KINDS (A1, round 7: A5's ask (h)): the vocabulary of places a person can stand, sit or work at. The beach adds nine (lie swim wade raft fish volley watch launch moor), which
// plan.coast.pois already uses and which the people phase will merge into plan.pois (tests/world-lib.mjs placeErrors refuses a poi whose kind is not in this list).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-registries.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of core-sea.test.mjs):
//   missing  'moor' is not registered      dup  'swim' is registered twice      moved  the town's kinds are not first (an index someone stored would shift)      extra  a kind nobody uses
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import { ANCHOR_KINDS as real } from '../js/core/registries.js';
import { createCoast } from '../js/world/coast.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const KINDS = (() => {
  let k = [...real];
  if (on('missing')) k = k.filter((x) => x !== 'moor');
  if (on('dup')) k.push('swim');
  if (on('moved')) k = [...k.slice(-2), ...k.slice(0, -2)];
  if (on('extra')) k.push('juggle');
  return k;
})();
const TOWN = ['stand', 'sit', 'sleep', 'cook', 'counter', 'customer', 'tv', 'sweep', 'laundry', 'chat', 'lean', 'bench', 'read', 'phone', 'work', 'pray', 'play', 'wash', 'carry', 'vend', 'greet'];
const BEACH = ['lie', 'swim', 'wade', 'raft', 'fish', 'volley', 'watch', 'launch', 'moor'];

test('the anchor kinds are the town\'s twenty-one, first and in their order, then the beach\'s nine, each once', () => {
  assert.deepEqual(KINDS, [...TOWN, ...BEACH]);
  assert.equal(new Set(KINDS).size, KINDS.length, 'no kind twice');
});

test('every kind the coast\'s points of interest use is registered, and every beach kind is used by one (nothing is registered for nothing)', () => {
  const coast = createCoast({ seed: 1, edge: () => 0.1 }), used = new Set(coast.pois.map((p) => p.kind));
  for (const k of used) assert.ok(KINDS.includes(k), `plan.coast.pois has a '${k}' and ANCHOR_KINDS does not: the people phase would refuse it`);
  for (const k of BEACH) assert.ok(used.has(k), `'${k}' is registered but no point of interest of the beach uses it`);
  assert.ok(used.size >= 10 && coast.pois.length > 60, `the beach has ${coast.pois.length} points of interest of ${used.size} kinds: the check saw them`);
});

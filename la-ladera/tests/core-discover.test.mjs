// core/registries.js Discoveries (owner: A1): the world discoveries found by walking up to them, and the FINDS (kind 'hallazgo', the special things in drawers and
// wardrobes) found by interaction through mark(). Pure node.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-discover.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Discoveries, isFind } from '../js/core/registries.js';

const mk = () => { const sent = []; const ctx = { events: { emit: (n, d) => sent.push([n, d]) } }; return { D: new Discoveries(ctx), sent }; };
const spot = (id, x, z, extra = {}) => ({ id, name: id, en: 'the ' + id, x, y: 0, z, kind: 'mural', ...extra });
const FIND = { id: 'find:moneda:L07', name: 'Un centenario de oro', en: 'A gold centenario', kind: 'hallazgo', collection: 'Monedas de oro', x: 10, y: 1, z: 20 };

test('isFind: hallazgo and its alias find, nothing else', () => {
  assert.equal(isFind({ kind: 'hallazgo' }), true);
  assert.equal(isFind({ kind: 'find' }), true);
  assert.equal(isFind({ kind: 'mural' }), false);
  assert.equal(isFind({}), false);
  assert.equal(isFind(null), false);
  assert.equal(isFind(undefined), false);
});

test('mark: a new find is registered, found, announced once, and reported as new', () => {
  const { D, sent } = mk();
  assert.equal(D.mark({ ...FIND }), true);
  const it = D.items.get(FIND.id);
  assert.ok(it, 'registered');
  assert.deepEqual([it.kind, it.manual, it.radius, it.collection, it.name, it.en], ['hallazgo', true, 0, 'Monedas de oro', 'Un centenario de oro', 'A gold centenario']);
  assert.ok(D.found.has(FIND.id), 'found');
  assert.equal(sent.length, 1); assert.equal(sent[0][0], 'discover'); assert.equal(sent[0][1], it, 'the event carries the registered item');
  assert.equal(D.mark({ ...FIND }), false, 'the second time it is old news');
  assert.equal(sent.length, 1, 'and nothing is announced again');
  assert.equal(D.items.size, 1);
});

test('mark: the alias find becomes hallazgo; any other kind is kept; the caller\'s object is not edited', () => {
  const { D } = mk();
  const src = { ...FIND, id: 'a', kind: 'find' }; Object.freeze(src);
  assert.equal(D.mark(src), true);
  assert.equal(D.items.get('a').kind, 'hallazgo');
  assert.equal(D.mark(spot('b', 0, 0, { kind: 'mural' })), true);
  assert.equal(D.items.get('b').kind, 'mural');
  assert.equal(D.items.get('b').manual, true);
});

test('mark: nonsense is refused without a sound', () => {
  const { D, sent } = mk();
  for (const bad of [null, undefined, {}, { name: 'no id' }]) assert.equal(D.mark(bad), false);
  assert.equal(sent.length, 0); assert.equal(D.items.size, 0); assert.equal(D.found.size, 0);
});

test('mark: an id registered up front is only marked, the registered object stays', () => {
  const { D, sent } = mk();
  const reg = D.register(spot('mirador', 5, 5));
  assert.equal(D.mark({ id: 'mirador', name: 'otro', x: 99, z: 99 }), true);
  assert.equal(D.items.get('mirador'), reg, 'not replaced');
  assert.equal(reg.name, 'mirador'); assert.equal(reg.manual, undefined, 'and not turned into a manual one');
  assert.ok(D.found.has('mirador')); assert.equal(sent.length, 1);
  assert.equal(D.mark({ id: 'mirador' }), false);
});

test('check: walking up finds a world discovery once; a find is never proximity-triggered, however close you stand', () => {
  const { D, sent } = mk();
  D.register(spot('mural', 0, 0, { radius: 4 }));
  D.register(spot('hidden', 0, 0, { radius: 4, manual: true }));
  D.items.set('f', { ...FIND, id: 'f', x: 0, z: 0, radius: 4, manual: true });
  D.check(30, 0, 30); assert.equal(sent.length, 0, 'far away');
  D.check(1, 0, 1); assert.deepEqual(sent.map((s) => s[1].id), ['mural'], 'only the plain one');
  D.check(1, 0, 1); assert.equal(sent.length, 1, 'once');
  assert.ok(!D.found.has('hidden') && !D.found.has('f'));
  D.mark({ id: 'f' }); assert.ok(D.found.has('f'));
});

test('check: a find registered WITHOUT the manual flag is still never walked into (the kind decides, not the flag)', () => {
  const { D, sent } = mk();
  D.items.set('g', { ...FIND, id: 'g', x: 0, z: 0, radius: 4 });
  D.check(0, 0, 0);
  assert.equal(sent.length, 0);
  assert.ok(!D.found.has('g'));
});

test('counters: total and count are about the world; finds are counted apart; found has everything', () => {
  const { D } = mk();
  D.register(spot('a', 0, 0, { radius: 3 })); D.register(spot('b', 50, 0)); D.register(spot('c', 90, 0));
  assert.deepEqual([D.total, D.count, D.finds, D.found.size], [3, 0, 0, 0]);
  D.check(0, 0, 0);
  assert.deepEqual([D.total, D.count, D.finds, D.found.size], [3, 1, 0, 1]);
  D.mark({ ...FIND, id: 'f1' }); D.mark({ ...FIND, id: 'f2', kind: 'find' });
  assert.deepEqual([D.total, D.count, D.finds, D.found.size], [3, 1, 2, 3], 'finds do not move N de M');
  D.mark({ id: 'b' });
  assert.deepEqual([D.total, D.count, D.finds, D.found.size], [3, 2, 2, 4]);
  D.items.delete('c');
  assert.equal(D.total, 2, 'total follows the registry');
});

test('counters survive a swapped registry and ids found but unknown', () => {
  const { D } = mk();
  D.found.add('ghost'); D.register(spot('a', 0, 0));
  assert.deepEqual([D.total, D.count, D.finds], [1, 0, 0]);
  D.items = new Map(); D.found = new Set();
  assert.deepEqual([D.total, D.count, D.finds], [0, 0, 0]);
});

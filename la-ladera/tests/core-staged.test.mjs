// The AFTER-PLAYABLE queue (js/core/staged.js, owner A1): the seam a later sector (the beach, a substation) registers a loader and a build step on.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-staged.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Staged } from '../js/core/staged.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

test('nothing starts before run(), then units start in dependency order and settled resolves after the last', async () => {
  const st = new Staged({ errors: [] }), order = [];
  const unit = (id, needs = [], ms = 4) => st.register({ id, needs, start: async () => { order.push('start:' + id); await sleep(ms); order.push('end:' + id); } });
  unit('c', ['a', 'b']); unit('a'); unit('b', ['a']);
  await sleep(10);
  assert.deepEqual(order, [], 'the milestone has not been reached: nothing runs');
  assert.equal(st.done, false);
  st.run(); await st.settled;
  assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  assert.equal(st.progress, 1); assert.equal(st.done, true); assert.deepEqual(st.log.map((l) => l.id), ['a', 'b', 'c']);
});

test('independent units run side by side', async () => {
  const st = new Staged({ errors: [] }); let live = 0, peak = 0;
  for (const id of ['x', 'y', 'z']) st.register({ id, start: async () => { peak = Math.max(peak, ++live); await sleep(5); live--; } });
  st.run(); await st.settled;
  assert.equal(peak, 3);
});

test('a unit that rejects, or throws, counts as finished: it is reported, and what needs it still runs', async () => {
  const off = quiet();
  try {
    const ctx = { errors: [] }, st = new Staged(ctx), ran = [];
    st.register({ id: 'bad-async', start: async () => { throw new Error('pack missing'); } });
    st.register({ id: 'bad-sync', start: () => { throw new Error('boom'); } });
    st.register({ id: 'after', needs: ['bad-async', 'bad-sync'], start: () => { ran.push('after'); } });
    st.run(); await st.settled;
    assert.deepEqual(ran, ['after']);
    assert.deepEqual(ctx.errors.map((e) => e.stage).sort(), ['stream:bad-async', 'stream:bad-sync']);
    assert.equal(st.log.find((l) => l.id === 'bad-async').failed, true);
    assert.equal(st.log.find((l) => l.id === 'after').failed, false);
  } finally { off(); }
});

test('a unit that needs a unit nobody registered is not held up (a sector that is not there)', async () => {
  const st = new Staged({ errors: [] }); let ran = false;
  st.register({ id: 'solo', needs: ['beach'], start: () => { ran = true; } });
  st.run(); await st.settled;
  assert.equal(ran, true);
});

test('a unit registered after the queue settled starts at once, and the queue is not settled until it finishes', async () => {
  const st = new Staged({ errors: [] });
  st.register({ id: 'first', start: async () => { await sleep(2); } });
  st.run(); await st.settled;
  assert.equal(st.done, true);
  let release; const gate = new Promise((r) => { release = r; });
  st.register({ id: 'beach', label: 'La playa', weight: 4, needs: ['first'], start: () => gate });
  await sleep(5);
  assert.equal(st.state('beach'), 'running', 'its needs were met: it started on registration');
  assert.equal(st.done, false); assert.equal(st.label, 'La playa');
  let settled = false; st.settled.then(() => { settled = true; });
  await sleep(5); assert.equal(settled, false, 'settled is a new promise: it waits for the late unit');
  release(); await st.settled;
  assert.equal(st.done, true); assert.deepEqual(st.log.map((l) => l.id), ['first', 'beach']);
});

test('progress is the finished weight over the registered weight, when(id) waits for one unit, onChange hears every change', async () => {
  const st = new Staged({ errors: [] }), seen = [];
  let open; const gate = new Promise((r) => { open = r; });
  st.register({ id: 'small', weight: 1, start: async () => {} });
  st.register({ id: 'big', weight: 3, needs: ['small'], start: () => gate });
  const off = st.onChange((s) => seen.push(+s.progress.toFixed(2)));
  assert.equal(st.progress, 0);
  st.run(); await st.when('small');
  assert.equal(st.progress, 0.25);
  let big = false; st.when('big').then(() => { big = true; });
  await sleep(3); assert.equal(big, false);
  open(); await st.settled; await sleep(1);
  assert.equal(big, true); assert.equal(st.progress, 1);
  assert.equal(seen[seen.length - 1], 1); assert.ok(seen.includes(0.25));
  off();
  assert.equal(await st.when('nobody'), undefined, 'a unit that does not exist is finished');
});

test('a unit needs an id and a start(), and an id is registered once', () => {
  const st = new Staged({ errors: [] });
  assert.throws(() => st.register({ id: 'x' }), /id and a start/);
  assert.throws(() => st.register({ start() {} }), /id and a start/);
  st.register({ id: 'x', start() {} });
  assert.throws(() => st.register({ id: 'x', start() {} }), /twice/);
});

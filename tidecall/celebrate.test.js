'use strict';

// ALM-BUG-KILN-00029 (behavioural oracle for the confetti invariant, ALM-BUG-KILN-00003):
// one shared canvas => one owner. An overlapping celebrate() must cancel the live loop
// before starting a new one; two loops would each clearRect the other's particles and leave
// a zombie running. The old guard only asserted the *cancel line existed* — it stayed green
// even with the celebrateRaf assignments reverted. This drives the real celebrate() with a
// fake rAF scheduler and asserts exactly one live loop survives an overlapping call.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const celebrateSrc = app.match(/ {2}function celebrate\(count\) \{[\s\S]*?\n {2}\}/);
assert.ok(celebrateSrc, 'celebrate() function should be found in app.js');

function makeHarness() {
  const pending = new Map();
  let nextId = 1;
  let cancels = 0;
  const requestAnimationFrame = (cb) => { const id = nextId++; pending.set(id, cb); return id; };
  const cancelAnimationFrame = (id) => { if (pending.delete(id)) cancels += 1; };
  const tick = (now) => { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb(now)); };
  let clears = 0;
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'clearRect') return () => { clears += 1; };
      return () => {};
    },
    set() { return true; },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 };
  const performance = { now: () => 0 };
  const dom = { celebrationCanvas: canvas };
  const factory = new Function(
    'requestAnimationFrame', 'cancelAnimationFrame', 'window', 'performance', 'dom',
    `let celebrateRaf = 0; ${celebrateSrc[0]}; return { celebrate, liveRaf: () => celebrateRaf };`,
  );
  const api = factory(requestAnimationFrame, cancelAnimationFrame, window, performance, dom);
  return { ...api, liveLoops: () => pending.size, cancels: () => cancels, clears: () => clears, tick };
}

function test(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`); }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

test('a first celebrate() schedules exactly one live loop', () => {
  const h = makeHarness();
  h.celebrate(4);
  assert.equal(h.liveLoops(), 1, 'one animation loop is scheduled');
  assert.notEqual(h.liveRaf(), 0, 'the live rAF id is captured in celebrateRaf');
});

test('an overlapping celebrate() cancels the previous loop — never two owners of the canvas', () => {
  const h = makeHarness();
  h.celebrate(4);
  const firstId = h.liveRaf();
  h.celebrate(4); // overlap before the first frame runs
  assert.equal(h.cancels(), 1, 'the previous loop was cancelled');
  assert.equal(h.liveLoops(), 1, 'still exactly one live loop, not two');
  assert.notEqual(h.liveRaf(), firstId, 'celebrateRaf now tracks the NEW loop');
});

test('overlap after a frame has rescheduled still leaves one loop (frame reassigns celebrateRaf)', () => {
  const h = makeHarness();
  h.celebrate(4);
  h.tick(16); // run one frame; particles still alive => frame reschedules and updates celebrateRaf
  assert.equal(h.liveLoops(), 1, 'the loop rescheduled itself');
  const before = h.cancels();
  h.celebrate(4); // overlap the rescheduled loop
  assert.equal(h.cancels(), before + 1, 'the rescheduled loop was cancelled by the new burst');
  assert.equal(h.liveLoops(), 1, 'one live loop after the overlap');
});

if (!process.exitCode) process.stdout.write('\nTidecall confetti oracle passed.\n');

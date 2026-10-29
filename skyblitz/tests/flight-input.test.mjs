// Input unit tests with a faked window. Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/flight-input.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {};
globalThis.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
let now = 1000;
globalThis.performance = { now: () => now };
const fire = (type, code, extra = {}) => (handlers[type] || []).forEach((f) => f({ code, repeat: false, target: {}, preventDefault() {}, ...extra }));
const { createInput } = await import('../src/flight/input.js');

function make(settings = { pitchMode: 'flight' }) {
  const emitted = [];
  const game = { settings, state: 'race', events: { on() {}, emit: (n) => emitted.push(n) } };
  const input = createInput(game);
  return { input, emitted, game };
}
const run = (input, n) => { let c; for (let i = 0; i < n; i++) c = input.sample(); return c; };

test('flight convention: W pushes the nose down, S pulls up; arcade flips it', () => {
  const a = make();
  fire('keydown', 'KeyW'); assert.ok(run(a.input, 30).pitch < -0.9); fire('keyup', 'KeyW');
  fire('keydown', 'KeyS'); assert.ok(run(a.input, 30).pitch > 0.9); fire('keyup', 'KeyS');
  const b = make({ pitchMode: 'arcade' });
  fire('keydown', 'KeyW'); assert.ok(run(b.input, 30).pitch > 0.9); fire('keyup', 'KeyW');
});

test('bank keys, boost, airbrake, fire, item latch, look back', () => {
  const { input } = make();
  fire('keydown', 'KeyD'); fire('keydown', 'ShiftLeft'); fire('keydown', 'ControlLeft'); fire('keydown', 'Space'); fire('keydown', 'KeyF'); fire('keydown', 'KeyV');
  let c = run(input, 1);
  assert.ok(c.roll > 0 && c.boost && c.airbrake === 1 && c.fire && c.item && c.lookBack);
  c = run(input, 20); assert.ok(c.roll > 0.95); assert.equal(c.item, false, 'item is an edge');
  ['KeyD', 'ShiftLeft', 'ControlLeft', 'Space', 'KeyV'].forEach((k) => fire('keyup', k));
  c = run(input, 20); assert.ok(c.roll === 0 && !c.boost && !c.fire && !c.lookBack && c.airbrake === 0);
});

test('Q / E barrel roll is an edge; with doubleTapRoll ON a double-tap A / D within 220 ms barrel-rolls, slower taps do not', () => {
  const { input } = make({ pitchMode: 'flight', doubleTapRoll: true });
  fire('keydown', 'KeyE'); fire('keyup', 'KeyE'); assert.equal(run(input, 1).barrel, 1); assert.equal(run(input, 1).barrel, 0);
  fire('keydown', 'KeyQ'); fire('keyup', 'KeyQ'); assert.equal(run(input, 1).barrel, -1);
  now = 5000; fire('keydown', 'KeyA'); now += 150; fire('keyup', 'KeyA'); fire('keydown', 'KeyA'); fire('keyup', 'KeyA');
  assert.equal(run(input, 1).barrel, -1, 'double-tap A = barrel left'); assert.equal(run(input, 1).barrel, 0);
  now = 9000; fire('keydown', 'KeyD'); now += 100; fire('keyup', 'KeyD'); now += 400; fire('keydown', 'KeyD'); fire('keyup', 'KeyD');
  assert.equal(run(input, 1).barrel, 0, 'slow taps are not a barrel');
  now += 100; fire('keydown', 'KeyD'); fire('keyup', 'KeyD'); now += 100; fire('keydown', 'KeyD'); fire('keyup', 'KeyD');
  assert.equal(run(input, 1).barrel, 1, 'double-tap D = barrel right');
});

test('blur clears held keys; enable(false) neutralises; pause / camera events', () => {
  const { input, emitted } = make();
  fire('keydown', 'KeyD'); assert.ok(run(input, 20).roll > 0.9); (handlers.blur || []).forEach((f) => f());
  assert.equal(run(input, 20).roll, 0, 'blur releases keys');
  fire('keydown', 'KeyD'); input.enable(false); const c = run(input, 5); assert.equal(c.roll, 0); input.enable(true);
  fire('keyup', 'KeyD');
  fire('keydown', 'Escape'); fire('keydown', 'KeyP'); fire('keydown', 'KeyC'); fire('keydown', 'KeyV');
  assert.deepEqual(emitted.filter((e) => e.startsWith('input:')), ['input:pause', 'input:pause', 'input:camera', 'input:lookback']);
});

test('bindingsText lists every control group and follows pitchMode', () => {
  const a = make().input.bindingsText(), b = make({ pitchMode: 'arcade' }).input.bindingsText();
  assert.deepEqual(a.map((g) => g.group), ['Keyboard', 'Gamepad', 'Touch']);
  assert.ok(a[0].rows.some(([k, v]) => /W/.test(k) && /down/i.test(v)));
  assert.ok(b[0].rows.some(([k, v]) => /W/.test(k) && /up/i.test(v)));
});

test('K-1: double-tap A / D does nothing by default (setting off); Q / E always roll; the Controls text says so', () => {
  for (const settings of [{ pitchMode: 'flight' }, { pitchMode: 'flight', doubleTapRoll: false }]) {
    const { input } = make(settings);
    now = 20000; fire('keydown', 'KeyA'); now += 150; fire('keyup', 'KeyA'); fire('keydown', 'KeyA'); fire('keyup', 'KeyA');
    assert.equal(run(input, 1).barrel, 0, 'two KeyA presses 150 ms apart: no barrel with the setting off');
    now += 100; fire('keydown', 'ArrowRight'); now += 100; fire('keyup', 'ArrowRight'); fire('keydown', 'ArrowRight'); fire('keyup', 'ArrowRight');
    assert.equal(run(input, 1).barrel, 0, 'arrow keys likewise');
    fire('keydown', 'KeyQ'); fire('keyup', 'KeyQ'); assert.equal(run(input, 1).barrel, -1, 'Q still rolls left');
    fire('keydown', 'KeyE'); fire('keyup', 'KeyE'); assert.equal(run(input, 1).barrel, 1, 'E still rolls right');
    const row = input.bindingsText()[0].rows.find((r) => /Double-tap/.test(r[0]));
    assert.ok(/off/.test(row[1]), 'controls text: ' + row);
  }
  const on = make({ pitchMode: 'flight', doubleTapRoll: true });
  assert.ok(/ON/.test(on.input.bindingsText()[0].rows.find((r) => /Double-tap/.test(r[0]))[1]));
  now = 30000; fire('keydown', 'KeyA'); now += 150; fire('keyup', 'KeyA'); fire('keydown', 'KeyA'); fire('keyup', 'KeyA');
  assert.equal(run(on.input, 1).barrel, -1, 'two KeyA presses 150 ms apart: barrel left with the setting on');
});

test('P-17: a held bank key tops out below the 0.99 full stick that Pro assist reads as a continuous roll', () => {
  const { input } = make();
  fire('keydown', 'KeyD'); const c = run(input, 90);
  assert.ok(c.roll > 0.95 && c.roll < 0.99, `held D roll ${c.roll}`); fire('keyup', 'KeyD');
  fire('keydown', 'ArrowLeft'); const d = run(input, 90);
  assert.ok(d.roll < -0.95 && d.roll > -0.99, `held Left roll ${d.roll}`); fire('keyup', 'ArrowLeft');
});

test('E-03: keys pressed while a menu or the pause screen is open are not latched, and pause / resume drop what was held', () => {
  const listeners = {};
  const game = { settings: { pitchMode: 'flight' }, state: 'race', paused: false, events: { on: (n, f) => { (listeners[n] ||= []).push(f); }, emit() {} } };
  const input = createInput(game);
  const emitEv = (n) => (listeners[n] || []).forEach((f) => f({}));
  game.paused = true; fire('keydown', 'Enter'); fire('keydown', 'Space'); game.paused = false; emitEv('game:resume');
  let c = run(input, 2); assert.ok(!c.item && !c.fire, 'Enter / Space pressed under the pause menu never reach the flight controls');
  fire('keyup', 'Enter'); fire('keyup', 'Space');
  fire('keydown', 'KeyF'); emitEv('game:pause'); c = run(input, 1); assert.ok(!c.item, 'pausing drops a latched press');
  fire('keydown', 'KeyF'); c = run(input, 1); assert.ok(c.item, 'a fresh press in flight still works');
  game.state = 'results'; fire('keydown', 'KeyF'); game.state = 'race'; c = run(input, 1); assert.ok(!c.item, 'a key pressed on the results screen is ignored too');
});

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
  fire('keydown', 'KeyD'); fire('keydown', 'ShiftLeft'); fire('keydown', 'KeyX'); fire('keydown', 'Space'); fire('keydown', 'KeyF'); fire('keydown', 'KeyV');
  let c = run(input, 1);
  assert.ok(c.roll > 0 && c.boost && c.airbrake === 1 && c.fire && c.item && c.lookBack);
  c = run(input, 20); assert.ok(c.roll > 0.95); assert.equal(c.item, false, 'item is an edge');
  ['KeyD', 'ShiftLeft', 'KeyX', 'Space', 'KeyV'].forEach((k) => fire('keyup', k));
  c = run(input, 20); assert.ok(c.roll === 0 && !c.boost && !c.fire && !c.lookBack && c.airbrake === 0);
});

// ---------------- round 2: V-2 (no Ctrl in the defaults), R2-P-05 (last device), R2-P-03 (respawn) ----------------
test('V-2: no default binding uses Ctrl; X brakes; Ctrl alone does not; the Controls text says X', () => {
  const { input } = make();
  const rows = input.bindingsText().flatMap((g) => g.rows);
  assert.ok(!rows.some(([k]) => /ctrl|control/i.test(k)), 'no Controls row names Ctrl');
  assert.deepEqual(input.bindingsText()[0].rows.find(([, a]) => a === 'Airbrake'), ['X', 'Airbrake']);
  fire('keydown', 'ControlLeft'); fire('keydown', 'ControlRight'); assert.equal(run(input, 2).airbrake, 0, 'Ctrl is not the airbrake');
  fire('keyup', 'ControlLeft'); fire('keyup', 'ControlRight');
  fire('keydown', 'KeyX'); assert.equal(run(input, 2).airbrake, 1, 'X brakes'); fire('keyup', 'KeyX'); assert.equal(run(input, 2).airbrake, 0);
});

test('V-2: in a race every bound key is default-prevented, with Ctrl held too; in a menu or with input off nothing is', () => {
  for (const k in handlers) handlers[k].length = 0;      // the listeners of earlier tests' inputs share this fake window
  const { game, input } = make();
  const prevented = (code, extra = {}, state = 'race') => { let p = false; game.state = state; fire('keydown', code, { preventDefault() { p = true; }, ...extra }); fire('keyup', code); game.state = 'race'; return p; };
  for (const code of ['KeyW', 'KeyS', 'KeyD', 'KeyF', 'KeyX', 'KeyR', 'Space', 'ArrowUp', 'Tab', 'KeyV']) assert.ok(prevented(code), `${code} plain`);
  for (const code of ['KeyW', 'KeyS', 'KeyD', 'KeyF', 'KeyA', 'KeyX']) assert.ok(prevented(code, { ctrlKey: true }), `Ctrl+${code}`);
  assert.ok(prevented('KeyD', { metaKey: true }) && prevented('KeyD', { altKey: true }));
  assert.ok(!prevented('KeyD', { cancelable: false }), 'an event that cannot be cancelled is left alone');
  assert.ok(!prevented('F5') && !prevented('KeyZ') && !prevented('KeyL'), 'keys the game does not bind keep their browser meaning');
  assert.ok(!prevented('KeyD', {}, 'menu'), 'menus keep Ctrl+F etc.');
  input.enable(false); assert.ok(!prevented('KeyD'), 'input off'); input.enable(true);
});

test('R2-P-05: the guide follows the device that last sent input, not whether a pad is plugged in', () => {
  const pad = { connected: true, id: 'pad', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  try {
    const { input, game } = make({ pitchMode: 'flight', assist: 'standard' });
    game.player = { flight: {} }; game.course = {};
    let calls = 0; input.guide.blend = (g, fs, r, p, out) => { calls++; out.roll = r; out.pitch = p; return 0; };
    run(input, 3); assert.equal(input.lastDevice, 'keyboard'); assert.equal(calls, 3, 'pad plugged in but idle: the guide is on');
    pad.axes[0] = 0.8; run(input, 2); assert.equal(input.lastDevice, 'pad'); const n = calls; run(input, 3); assert.equal(calls, n, 'stick moved: the guide is off');
    pad.axes[0] = 0; run(input, 3); assert.equal(input.lastDevice, 'pad', 'a centred stick does not hand the device back'); assert.equal(calls, n);
    fire('keydown', 'KeyA'); run(input, 2); assert.equal(input.lastDevice, 'keyboard'); assert.ok(calls > n, 'a key press: the guide is on again'); fire('keyup', 'KeyA');
    pad.buttons[0].pressed = true; run(input, 1); assert.equal(input.lastDevice, 'pad', 'a pad button counts');
  } finally { delete globalThis.navigator; }
});

test('R2-P-03: holding R for 0.6 s while racing emits input:respawn once (payload { source }); a tap, a menu or a pause emits nothing; pad Back works', () => {
  const pad = { connected: true, id: 'pad', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const payloads = [];
  const game = { settings: { pitchMode: 'flight' }, state: 'race', events: { on() {}, emit: (n, d) => { if (n === 'input:respawn') payloads.push(d); } } };
  const input = createInput(game);
  fire('keydown', 'KeyR'); run(input, 30); assert.equal(payloads.length, 0, '0.5 s is not enough');
  run(input, 10); assert.deepEqual(payloads, [{ source: 'keyboard' }], 'fires at 0.6 s'); run(input, 120); assert.equal(payloads.length, 1, 'once per hold');
  fire('keyup', 'KeyR'); run(input, 2); fire('keydown', 'KeyR'); run(input, 40); fire('keyup', 'KeyR'); run(input, 80); assert.equal(payloads.length, 2, 'a second hold fires again');
  game.race = { state: 'countdown' }; fire('keydown', 'KeyR'); run(input, 60); fire('keyup', 'KeyR'); assert.equal(payloads.length, 2, 'not before GO'); game.race = { state: 'racing' };
  game.state = 'menu'; fire('keydown', 'KeyR'); run(input, 60); fire('keyup', 'KeyR'); game.state = 'race'; assert.equal(payloads.length, 2, 'not in a menu');
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  try { pad.buttons[8].pressed = true; run(input, 40); assert.deepEqual(payloads[2], { source: 'pad' }); } finally { delete globalThis.navigator; }
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

test('T9: handsOffT counts seconds of guided flight with no key pressed, resets on any key class, and stays 0 for pad / touch / guide off / disabled', () => {
  for (const k in handlers) handlers[k].length = 0;
  const { input, game } = make({ pitchMode: 'flight', assist: 'standard' });
  game.player = { flight: {} }; game.course = {};
  let w = 0.5; input.guide.blend = (g, fs, r, p, out) => { out.roll = r; out.pitch = p; return w; };
  run(input, 60); assert.ok(Math.abs(input.handsOffT - 1) < 0.02, `1 s idle -> ${input.handsOffT}`);
  for (const code of ['KeyD', 'KeyW', 'ArrowLeft', 'ShiftLeft', 'KeyX', 'KeyF', 'Space', 'KeyQ', 'KeyV', 'KeyC', 'KeyB', 'Enter']) {
    run(input, 40); assert.ok(input.handsOffT > 0.3, 'accumulating before ' + code);
    fire('keydown', code); run(input, 1); assert.equal(input.handsOffT, 0, code + ' resets'); fire('keyup', code); run(input, 40);
  }
  fire('keydown', 'KeyZ'); fire('keyup', 'KeyZ'); run(input, 1); assert.equal(input.handsOffT, 0, 'a tap down and up inside one frame still resets');
  run(input, 40); assert.ok(input.handsOffT > 0.3, 'recovers once the release ramps have decayed');
  w = 0; run(input, 5); assert.equal(input.handsOffT, 0, 'guide not flying (Pro / off / not racing / tumbling all return weight 0)'); w = 0.5;
  run(input, 30); assert.ok(input.handsOffT > 0.3);
  input.lastDevice = 'touch'; run(input, 2); assert.equal(input.handsOffT, 0, 'touch'); input.lastDevice = 'pad'; run(input, 2); assert.equal(input.handsOffT, 0, 'pad');
  input.lastDevice = 'keyboard'; run(input, 30); assert.ok(input.handsOffT > 0.3); input.enable(false); run(input, 1); assert.equal(input.handsOffT, 0, 'disabled'); input.enable(true);
});

// ---------------- gamepad hardening (R2 engineering lens): faked Gamepad objects ----------------
const mkPad = (index, o = {}) => ({ index, id: 'pad' + index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...o });
const withPads = (list, fn) => { Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => list }, configurable: true }); try { return fn(); } finally { delete globalThis.navigator; } };
const press = (pad, i, v = 1) => { pad.buttons[i].pressed = v > 0; pad.buttons[i].value = v; };
function pmake(settings = { pitchMode: 'flight', assist: 'pro' }) {
  const events = []; const game = { settings, state: 'race', events: { on() {}, emit: (n, d) => events.push([n, d]) } };
  return { input: createInput(game), events, game };
}

test('PAD: the pad that last produced input wins, not the first connected', () => {
  for (const k in handlers) handlers[k].length = 0;
  const p0 = mkPad(0), p1 = mkPad(1), { input } = pmake();
  withPads([p0, p1], () => {
    now = 100000; p1.axes[0] = 0.9; assert.ok(run(input, 2).roll > 0.5, 'pad 1 (the only active one) steers');
    p1.axes[0] = 0; now += 1000; p0.axes[0] = -0.9; assert.ok(run(input, 2).roll < -0.5, 'pad 0 pressed later: it wins');
    assert.equal(input.pad.id, 'pad0');
    now += 1000; p1.axes[0] = 0.9; p0.axes[0] = 0; assert.ok(run(input, 2).roll > 0.5, 'and pad 1 again after it');
    assert.equal(input.pad.id, 'pad1');
  });
});

test('PAD: a non-standard mapping is read through the DirectInput layout (no dead triggers, no phantom brake) and flagged once with input:padunmapped', () => {
  for (const k in handlers) handlers[k].length = 0;
  const pad = mkPad(0, { mapping: '', id: 'Generic DirectInput', axes: [0, 0, -1, 0, 0, -1] }), { input, events } = pmake();
  withPads([pad], () => {
    let c = run(input, 3); assert.equal(c.boost, false); assert.equal(c.airbrake, 0, 'a trigger axis at rest (-1) is not a pressed brake');
    pad.axes[5] = 1; c = run(input, 2); assert.equal(c.boost, true, 'right trigger on axis 5 boosts');
    pad.axes[5] = -1; pad.axes[2] = 1; c = run(input, 2); assert.ok(c.airbrake > 0.9, 'left trigger on axis 2 brakes');
    pad.axes[2] = -1; pad.axes[3] = 0.9; assert.ok(run(input, 2).yaw > 0.4, 'right stick x is axis 3 on a six-axis layout');
    pad.axes[3] = 0; pad.axes[0] = 0.9; assert.ok(run(input, 2).roll > 0.5, 'left stick still steers');
    pad.axes[0] = 0; press(pad, 7); run(input, 2); press(pad, 7, 0);
    assert.equal(input.padMapping, 'dinput');
    assert.deepEqual(events.filter(([n]) => n === 'input:padunmapped'), [['input:padunmapped', { id: 'Generic DirectInput', mapping: '' }]], 'emitted exactly once');
    assert.ok(events.some(([n]) => n === 'input:pause'), 'Start is button 7 on this layout');
  });
  const std = mkPad(0), t = pmake();
  withPads([std], () => { run(t.input, 3); assert.equal(t.input.padMapping, 'standard'); assert.equal(t.events.filter(([n]) => n === 'input:padunmapped').length, 0, 'a standard pad raises no notice'); });
});

test('PAD: hot-unplug while racing zeroes the controls without an exception; the next key (or the unplug itself) puts the keyboard back', () => {
  for (const k in handlers) handlers[k].length = 0;
  const pad = mkPad(0), list = [pad], { input } = pmake({ pitchMode: 'flight', assist: 'standard' });
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => list }, configurable: true });
  try {
    pad.axes[0] = 0.9; press(pad, 7); assert.ok(run(input, 3).roll > 0.5); assert.equal(input.lastDevice, 'pad');
    list[0] = null; pad.connected = false;
    fire('gamepaddisconnected', undefined, { gamepad: pad });
    let c; assert.doesNotThrow(() => { c = run(input, 5); }); assert.equal(input.lastDevice, 'keyboard', 'the unplug hands the device back at once');
    assert.equal(c.roll, 0); assert.equal(c.boost, false); assert.equal(input.pad.connected, false); assert.equal(input.padMapping, '');
    fire('keydown', 'KeyD'); c = run(input, 20); assert.equal(input.lastDevice, 'keyboard'); assert.ok(c.roll > 0.5, 'keys steer after the unplug'); fire('keyup', 'KeyD');
  } finally { delete globalThis.navigator; }
});

test('PAD: dead zone 0.12, full deflection is 1, the response is monotone, both signs', () => {
  for (const k in handlers) handlers[k].length = 0;
  const pad = mkPad(0), { input } = pmake();
  withPads([pad], () => {
    let prev = 0;
    for (let v = 0; v <= 1.0001; v += 0.02) {
      pad.axes[0] = Math.min(1, v); const r = run(input, 2).roll;
      if (v <= 0.12) assert.equal(r, 0, `inside the dead zone (${v.toFixed(2)})`);
      assert.ok(r >= prev - 1e-9, `monotone at ${v.toFixed(2)}`); prev = r;
    }
    assert.ok(Math.abs(prev - 1) < 1e-9, 'full deflection = 1'); pad.axes[0] = -1; assert.ok(Math.abs(run(input, 2).roll + 1) < 1e-9);
    pad.axes[0] = 0.13; assert.ok(run(input, 2).roll > 0, 'just outside the dead zone moves');
  });
});

test('PAD: Xbox-style button map matches the Controls screen (RT boost, LT brake, X cannon, A / B item, B held backwards, LB / RB barrel, RS click look back, Y camera, Start pause, Back respawn)', () => {
  for (const k in handlers) handlers[k].length = 0;
  const pad = mkPad(0), { input, events } = pmake();
  const names = () => events.map(([n]) => n); const rows = input.bindingsText()[1].rows.map((r) => r.join(' = ')).join(' | ');
  withPads([pad], () => {
    run(input, 2);
    press(pad, 7, 0.4); assert.equal(run(input, 2).boost, true, 'RT boosts from a light pull'); press(pad, 7, 0);
    press(pad, 6, 0.6); assert.ok(run(input, 2).airbrake > 0.5, 'LT brakes'); press(pad, 6, 0);
    press(pad, 2); assert.equal(run(input, 2).fire, true, 'X cannon'); press(pad, 2, 0);
    press(pad, 0); let c = run(input, 1); assert.equal(c.item, true, 'A uses the item'); assert.equal(run(input, 1).item, false, 'an edge'); press(pad, 0, 0); run(input, 1);
    press(pad, 1); c = run(input, 1); assert.equal(c.item, true, 'B uses it too'); assert.equal(c.itemBack, true, 'and held backwards'); press(pad, 1, 0); run(input, 2);
    press(pad, 4); assert.equal(run(input, 1).barrel, -1, 'LB barrel left'); press(pad, 4, 0); run(input, 2);
    press(pad, 5); assert.equal(run(input, 1).barrel, 1, 'RB barrel right'); press(pad, 5, 0); run(input, 2);
    press(pad, 11); c = run(input, 2); assert.equal(c.lookBack, true, 'right-stick click looks back'); press(pad, 11, 0); run(input, 2);
    press(pad, 3); run(input, 2); press(pad, 3, 0); run(input, 2);
    press(pad, 9); run(input, 2); press(pad, 9, 0); run(input, 2);
    assert.ok(names().includes('input:camera'), 'Y changes camera'); assert.ok(names().includes('input:pause'), 'Start pauses'); assert.ok(names().includes('input:lookback'));
    press(pad, 8); run(input, 40); assert.deepEqual(events.filter(([n]) => n === 'input:respawn'), [['input:respawn', { source: 'pad' }]], 'holding Back respawns once'); press(pad, 8, 0);
  });
  for (const w of ['Right trigger', 'RT', 'Boost', 'Cannon', 'Respawn']) assert.ok(new RegExp(w, 'i').test(rows), `Controls screen mentions ${w}: ${rows}`);
});

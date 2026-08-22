import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BINDINGS,
  DEFAULT_GAMEPAD_BINDINGS,
  InputManager,
  formatBinding,
  formatGamepadBinding,
  normalizeBindings,
  normalizeGamepadBindings,
} from '../src/input.js';

class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, code, { repeat = false, target = {} } = {}) {
    const event = {
      code,
      repeat,
      target,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    this.listeners.get(type)?.(event);
    return event;
  }
}

function createInput(gamepads = [], options = {}) {
  const fakeWindow = new FakeWindow();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => gamepads } });
  for (const name of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
  }
  return { input: new InputManager(null, options), fakeWindow };
}

function tap(fakeWindow, input, code) {
  const event = fakeWindow.dispatch('keydown', code);
  const controls = input.read(null);
  fakeWindow.dispatch('keyup', code);
  return { controls, event };
}

test('arrow keys steer in their visible direction', () => {
  const { input, fakeWindow } = createInput();
  assert.equal(tap(fakeWindow, input, 'ArrowLeft').controls.steer, 1, 'Left Arrow must steer left');
  assert.equal(tap(fakeWindow, input, 'ArrowRight').controls.steer, -1, 'Right Arrow must steer right');
});

test('A/Z and comma/period form the primary driving layout', () => {
  const { input, fakeWindow } = createInput();
  const accelerate = tap(fakeWindow, input, 'KeyA');
  const brake = tap(fakeWindow, input, 'KeyZ');
  const left = tap(fakeWindow, input, 'Comma');
  const right = tap(fakeWindow, input, 'Period');

  assert.deepEqual(accelerate.controls, { steer: 0, throttle: 1, brake: 0, handbrake: 0, shiftUp: false, shiftDown: false });
  assert.deepEqual(brake.controls, { steer: 0, throttle: 0, brake: 1, handbrake: 0, shiftUp: false, shiftDown: false });
  assert.equal(left.controls.steer, 1, 'Comma must steer left');
  assert.equal(right.controls.steer, -1, 'Period must steer right');
  for (const event of [accelerate.event, brake.event, left.event, right.event]) {
    assert.equal(event.defaultPrevented, true, 'driving keys must not trigger browser actions');
  }
});

test('gamepad stick steering follows the same visible-direction contract', () => {
  const leftPad = { index: 0, axes: [-1, 0], buttons: [] };
  const rightPad = { index: 0, axes: [1, 0], buttons: [] };
  assert.equal(createInput([leftPad]).input.read(null).steer, 1, 'left stick must steer left');
  assert.equal(createInput([rightPad]).input.read(null).steer, -1, 'right stick must steer right');
});

test('default bindings are immutable and normalize a complete custom keyboard layout', () => {
  assert.deepEqual(DEFAULT_BINDINGS, {
    accelerate: 'KeyA', brake: 'KeyZ', steerLeft: 'Comma', steerRight: 'Period',
    handbrake: 'Space', shiftUp: 'KeyE', shiftDown: 'KeyQ'
  });
  assert.equal(Object.isFrozen(DEFAULT_BINDINGS), true);
  const custom = normalizeBindings({
    accelerate: 'KeyW', brake: 'KeyS', steerLeft: 'KeyQ', steerRight: 'KeyE',
    handbrake: 'ShiftLeft', shiftUp: 'KeyD', shiftDown: 'KeyF'
  });
  assert.deepEqual(custom, {
    accelerate: 'KeyW', brake: 'KeyS', steerLeft: 'KeyQ', steerRight: 'KeyE',
    handbrake: 'ShiftLeft', shiftUp: 'KeyD', shiftDown: 'KeyF'
  });
  assert.equal(Object.isFrozen(custom), true);
});

test('invalid, duplicate, or fixed-arrow mappings fall back to the complete default layout', () => {
  for (const candidate of [
    { accelerate: 'KeyW', brake: 'KeyW' },
    { accelerate: 'NotAKeyboardCode' },
    { accelerate: 'ArrowUp' },
    { shiftUp: 'KeyC', shiftDown: 'KeyC' },
  ]) assert.deepEqual(normalizeBindings(candidate), DEFAULT_BINDINGS, JSON.stringify(candidate));
  assert.deepEqual(normalizeBindings({ accelerate: 'KeyW', futureAction: 'KeyP' }).accelerate, 'KeyW');
});

test('custom bindings drive controls while arrows remain fixed fallbacks', () => {
  const options = { bindings: { accelerate: 'KeyW', brake: 'KeyS', steerLeft: 'KeyQ', steerRight: 'KeyE', handbrake: 'ShiftLeft', shiftUp: 'KeyD', shiftDown: 'KeyF' } };
  const { input, fakeWindow } = createInput([], options);
  assert.equal(tap(fakeWindow, input, 'KeyW').controls.throttle, 1);
  assert.equal(tap(fakeWindow, input, 'KeyS').controls.brake, 1);
  assert.equal(tap(fakeWindow, input, 'KeyQ').controls.steer, 1);
  assert.equal(tap(fakeWindow, input, 'KeyE').controls.steer, -1);
  assert.equal(tap(fakeWindow, input, 'ShiftLeft').controls.handbrake, 1);
  assert.equal(tap(fakeWindow, input, 'ArrowUp').controls.throttle, 1);
  assert.equal(tap(fakeWindow, input, 'ArrowDown').controls.brake, 1);
  assert.equal(tap(fakeWindow, input, 'ArrowLeft').controls.steer, 1);
  assert.equal(tap(fakeWindow, input, 'ArrowRight').controls.steer, -1);
});

test('shift bindings produce one edge while a key remains held', () => {
  const { input, fakeWindow } = createInput([], { bindings: { shiftUp: 'KeyD', shiftDown: 'KeyF' } });
  fakeWindow.dispatch('keydown', 'KeyD');
  assert.equal(input.read(null).shiftUp, true);
  assert.equal(input.read(null).shiftUp, false);
  fakeWindow.dispatch('keyup', 'KeyD');
  fakeWindow.dispatch('keydown', 'KeyF');
  assert.equal(input.read(null).shiftDown, true);
  assert.equal(input.read(null).shiftDown, false);
});

test('binding labels are stable and readable for the remapping UI', () => {
  assert.equal(formatBinding('KeyW'), 'W');
  assert.equal(formatBinding('ArrowUp'), '↑');
  assert.equal(formatBinding('ShiftLeft'), 'LEFT SHIFT');
  assert.equal(formatBinding('Space'), 'SPACE');
  assert.equal(formatBinding('garbage'), '—');
});

test('gamepad bindings normalize safely and expose stable labels', () => {
  assert.deepEqual(DEFAULT_GAMEPAD_BINDINGS, {
    accelerate: 7, brake: 6, handbrake: 2, shiftUp: 4, shiftDown: 5
  });
  assert.equal(Object.isFrozen(DEFAULT_GAMEPAD_BINDINGS), true);
  assert.deepEqual(normalizeGamepadBindings({ accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5 }), {
    accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5
  });
  for (const candidate of [
    { accelerate: 0 },
    { accelerate: 2, brake: 2 },
    { shiftUp: 12 },
    { shiftDown: 'RB' },
  ]) assert.deepEqual(normalizeGamepadBindings(candidate), DEFAULT_GAMEPAD_BINDINGS, JSON.stringify(candidate));
  assert.equal(formatGamepadBinding(7), 'RT');
  assert.equal(formatGamepadBinding(42), 'BUTTON 42');
});

test('gamepad remapping drives analog controls and one-shot shift edges', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { index: 0, axes: [0, 0], buttons };
  const { input } = createInput([pad], {
    gamepadBindings: { accelerate: 2, brake: 10, handbrake: 8, shiftUp: 11, shiftDown: 5 }
  });
  buttons[2] = { pressed: true, value: 1 };
  buttons[10] = { pressed: true, value: 1 };
  buttons[8] = { pressed: true, value: 1 };
  buttons[11] = { pressed: true, value: 1 };
  input.pollGamepad();
  const first = input.read(null);
  const held = input.read(null);
  assert.equal(first.throttle, 1);
  assert.equal(first.brake, 1);
  assert.equal(first.handbrake, 1);
  assert.equal(first.shiftUp, true);
  assert.equal(held.shiftUp, false);
  buttons[11] = { pressed: false, value: 0 };
  buttons[5] = { pressed: true, value: 1 };
  input.pollGamepad();
  assert.equal(input.read(null).shiftDown, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/input.js';

class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, code) {
    const event = {
      code,
      repeat: false,
      target: {},
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    this.listeners.get(type)?.(event);
    return event;
  }
}

function createInput(gamepads = []) {
  const fakeWindow = new FakeWindow();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => gamepads } });
  for (const name of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
  }
  return { input: new InputManager(null), fakeWindow };
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

  assert.deepEqual(accelerate.controls, { steer: 0, throttle: 1, brake: 0, handbrake: 0 });
  assert.deepEqual(brake.controls, { steer: 0, throttle: 0, brake: 1, handbrake: 0 });
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

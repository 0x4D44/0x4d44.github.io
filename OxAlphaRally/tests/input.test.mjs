// The keyboard path is the one that has to be *tuned* rather than merely
// correct, so these assert the shape of the response and not just its bounds:
// a stab of opposite lock must bite immediately, releasing must return more
// slowly than applying, and steering authority must fall away with speed.

import assert from "node:assert/strict";
import test from "node:test";
import { applyDeadzone, createInput, makeInput, DEFAULT_BINDINGS, ACTIONS } from "../input.js";

function fakeTarget() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn);
    },
    fire(type, event) {
      for (const fn of handlers.get(type) ?? []) fn({ preventDefault() {}, ...event });
    },
    count(type) {
      return handlers.get(type)?.size ?? 0;
    },
  };
}

function press(target, code) {
  target.fire("keydown", { code });
}

function release(target, code) {
  target.fire("keyup", { code });
}

// Node exposes a `navigator` with no getGamepads, so the pad poll returns null
// of its own accord and the keyboard path is what these exercise.
test("node's navigator carries no gamepad support, so the pad poll stays inert", () => {
  assert.equal(typeof globalThis.navigator?.getGamepads, "undefined");
});

test("deadzone removes rest drift and stays continuous above it", () => {
  assert.equal(applyDeadzone(0.05, 0.1, 1), 0);
  assert.equal(applyDeadzone(-0.05, 0.1, 1), 0);
  assert.equal(applyDeadzone(0.1, 0.1, 1), 0);
  assert.ok(applyDeadzone(0.1001, 0.1, 1) < 0.002, "just past the deadzone is still near zero");
  assert.ok(Math.abs(applyDeadzone(1, 0.1, 1) - 1) < 1e-9, "full deflection reaches full output");
  assert.equal(applyDeadzone(-1, 0.1, 1.35), -1);
  for (let v = 0.1; v <= 1; v += 0.01) {
    const a = applyDeadzone(v, 0.1, 1.35);
    const b = applyDeadzone(v + 0.01, 0.1, 1.35);
    assert.ok(b >= a - 1e-12, `monotonic at ${v}`);
  }
});

test("a held key builds steering over time rather than snapping to lock", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  press(target, "ArrowLeft");
  const after1 = input.update(1 / 60, 0).steer;
  assert.ok(after1 > 0 && after1 < 0.3, `one frame gives a slice of lock, got ${after1}`);
  let steer = after1;
  for (let i = 0; i < 40; i += 1) steer = input.update(1 / 60, 0).steer;
  assert.ok(steer > 0.95, `holding reaches full lock, got ${steer}`);
  input.destroy();
});

test("releasing returns to centre more slowly than applying", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  press(target, "ArrowLeft");
  let frames = 0;
  while (input.update(1 / 240, 0).steer < 0.99 && frames < 5000) frames += 1;
  const applyFrames = frames;
  release(target, "ArrowLeft");
  frames = 0;
  while (input.update(1 / 240, 0).steer > 0.01 && frames < 5000) frames += 1;
  assert.ok(frames > applyFrames, `return (${frames}) is slower than apply (${applyFrames})`);
  input.destroy();
});

test("opposite lock is applied at the fast rate, not the speed-scaled one", () => {
  const target = fakeTarget();
  const fast = createInput({ target: fakeTarget() });
  const input = createInput({ target });
  press(target, "ArrowLeft");
  for (let i = 0; i < 200; i += 1) input.update(1 / 240, 0);
  const held = input.input.steer;
  release(target, "ArrowLeft");
  press(target, "ArrowRight");
  const oneStep = input.update(1 / 240, 45).steer;
  assert.ok(held - oneStep > 0.015, "reversing lock moves quickly even at speed");
  input.destroy();
  fast.destroy();
});

test("steering authority falls away with speed", () => {
  const slow = createInput({ target: fakeTarget() });
  const fast = createInput({ target: fakeTarget() });
  const slowTarget = fakeTarget();
  const fastTarget = fakeTarget();
  const a = createInput({ target: slowTarget });
  const b = createInput({ target: fastTarget });
  press(slowTarget, "ArrowLeft");
  press(fastTarget, "ArrowLeft");
  let steerSlow = 0;
  let steerFast = 0;
  for (let i = 0; i < 600; i += 1) {
    steerSlow = a.update(1 / 240, 5).steer;
    steerFast = b.update(1 / 240, 50).steer;
  }
  assert.ok(steerSlow > steerFast + 0.1,
    `low speed steers harder (${steerSlow.toFixed(3)}) than high (${steerFast.toFixed(3)})`);
  a.destroy(); b.destroy(); slow.destroy(); fast.destroy();
});

test("blur drops every held key so alt-tab does not leave the throttle pinned", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  press(target, "ArrowUp");
  for (let i = 0; i < 60; i += 1) input.update(1 / 60, 0);
  assert.ok(input.input.throttle > 0.9);
  target.fire("blur", {});
  for (let i = 0; i < 60; i += 1) input.update(1 / 60, 0);
  assert.ok(input.input.throttle < 0.01, "throttle released on blur");
  input.destroy();
});

test("shift edges fire once per press", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  press(target, "KeyE");
  assert.equal(input.update(1 / 60, 0).shiftUp, true);
  assert.equal(input.update(1 / 60, 0).shiftUp, false, "an edge does not repeat while held");
  release(target, "KeyE");
  press(target, "KeyE");
  assert.equal(input.update(1 / 60, 0).shiftUp, true);
  input.destroy();
});

test("touch input bypasses the keyboard rate limiter", () => {
  const input = createInput({ target: fakeTarget() });
  input.setTouch({ steer: -0.8, throttle: 1, brake: 0, handbrake: 0 });
  const out = input.update(1 / 60, 20);
  assert.equal(out.steer, -0.8, "an on-screen analogue control is already analogue");
  assert.equal(out.throttle, 1);
  assert.equal(input.scheme, "touch");
  input.clearTouch();
  input.destroy();
});

test("every action has at least one binding and rebinding takes effect", () => {
  for (const action of ACTIONS) {
    assert.ok((DEFAULT_BINDINGS[action] ?? []).length > 0, `${action} is bound`);
  }
  const target = fakeTarget();
  const input = createInput({ target });
  input.setBinding("throttle", ["KeyZ"]);
  press(target, "KeyZ");
  for (let i = 0; i < 60; i += 1) input.update(1 / 60, 0);
  assert.ok(input.input.throttle > 0.9, "the new key drives the throttle");
  press(target, "ArrowUp");
  input.destroy();
});

test("destroy unhooks every listener", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  assert.equal(target.count("keydown"), 1);
  input.destroy();
  assert.equal(target.count("keydown"), 0);
  assert.equal(target.count("keyup"), 0);
  assert.equal(target.count("blur"), 0);
});

test("input values stay finite and bounded under a long random-ish drive", () => {
  const target = fakeTarget();
  const input = createInput({ target });
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];
  let state = 12345;
  const rnd = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let i = 0; i < 20000; i += 1) {
    const k = keys[Math.floor(rnd() * keys.length)];
    if (rnd() < 0.5) press(target, k); else release(target, k);
    const out = input.update(1 / 240, rnd() * 60);
    for (const key of ["steer", "throttle", "brake", "handbrake", "clutch"]) {
      assert.ok(Number.isFinite(out[key]), `${key} finite at ${i}`);
    }
    assert.ok(out.steer >= -1 && out.steer <= 1);
    assert.ok(out.throttle >= 0 && out.throttle <= 1);
    assert.ok(out.brake >= 0 && out.brake <= 1);
  }
  input.destroy();
});

test("makeInput returns a fresh neutral record", () => {
  const a = makeInput();
  const b = makeInput();
  a.steer = 1;
  assert.equal(b.steer, 0);
  assert.equal(b.gear, null);
});

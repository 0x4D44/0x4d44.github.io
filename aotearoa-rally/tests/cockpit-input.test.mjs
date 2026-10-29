import test from "node:test";
import assert from "node:assert/strict";
import { createInput, shapeAxis, mapKeyboard, mapGamepad, mapTouchSteer, mapTilt, DEFAULT_BINDINGS, normaliseBindings, DEFAULT_PAD } from "../core/input.mjs";
import { createStorage, createMemoryStorage } from "../core/storage.mjs";

const key = (target, type, code) => { const e = new Event(type); e.code = code; target.dispatchEvent(e); };
const pad = (axes = [0, 0, 0, 0], pressed = {}) => ({ connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed[i] > 0.5, value: pressed[i] || 0 })) });

test("dead-zone and response curve", () => {
  assert.equal(shapeAxis(0.1, 0.14), 0);
  assert.equal(shapeAxis(-0.14, 0.14), 0);
  assert.ok(shapeAxis(0.3, 0.14, 1.6) > 0 && shapeAxis(0.3, 0.14, 1.6) < 0.3);
  assert.ok(Math.abs(shapeAxis(1, 0.14, 1.6) - 1) < 1e-9);
  assert.ok(Math.abs(shapeAxis(-1) + 1) < 1e-9);
  assert.ok(shapeAxis(0.5) < shapeAxis(0.7));
});

test("default keys: A accelerate, Z brake, comma left, period right; arrows are alternates; WASD no longer drives", () => {
  const b = normaliseBindings(null);
  const none = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  assert.deepEqual(mapKeyboard(new Set(["KeyA", "Period"]), b), { ...none, steer: 1, throttle: 1 });
  assert.deepEqual(mapKeyboard(new Set(["KeyZ", "Comma"]), b), { ...none, steer: -1, brake: 1 });
  assert.deepEqual(mapKeyboard(new Set(["ArrowUp", "ArrowRight"]), b), { ...none, steer: 1, throttle: 1 });
  assert.deepEqual(mapKeyboard(new Set(["ArrowDown", "ArrowLeft"]), b), { ...none, steer: -1, brake: 1 });
  for (const wasd of ["KeyW", "KeyS", "KeyD"]) assert.deepEqual(mapKeyboard(new Set([wasd]), b), none, wasd + " is unbound");
  assert.deepEqual(DEFAULT_BINDINGS.steerLeft, ["Comma", "ArrowLeft"]);
  // simultaneous keys all count
  const m = mapKeyboard(new Set(["KeyA", "Comma", "Space", "ShiftLeft", "KeyQ"]), b);
  assert.deepEqual(m, { steer: -1, throttle: 1, brake: 0, handbrake: 1, gearUp: true, gearDown: true });
  assert.equal(mapKeyboard(new Set(["Comma", "Period"]), b).steer, 0, "both directions cancel");
});

test("a key press is prevented while driving (no Ctrl+A / Space scroll) and ignored when the game is not active", () => {
  const t = new EventTarget();
  let active = true;
  const inp = createInput({ target: t, getGamepads: () => [], isActive: () => active, isPaused: () => false });
  const ev = (type, code) => { const e = new Event(type, { cancelable: true }); e.code = code; t.dispatchEvent(e); return e; };
  assert.equal(ev("keydown", "KeyA").defaultPrevented, true);
  assert.equal(ev("keydown", "Space").defaultPrevented, true);
  ev("keyup", "KeyA"); ev("keyup", "Space");
  active = false; // a menu or a stage-less screen: A / Z / , / . must not drive
  ev("keydown", "KeyA"); ev("keydown", "Comma");
  assert.equal(ev("keydown", "Escape").defaultPrevented, false, "menus keep Escape");
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  const o = inp.poll(1 / 60);
  assert.equal(o.throttle, 0); assert.equal(o.steer, 0);
  inp.dispose();
});

test("stale saved bindings (old v1 WASD) are ignored and the new defaults apply", () => {
  const store = createStorage(createMemoryStorage({ "aotearoa-rally.bindings.v1": JSON.stringify({ throttle: ["KeyW"], brake: ["KeyS"], steerLeft: ["KeyA"], steerRight: ["KeyD"] }) }));
  const inp = createInput({ target: new EventTarget(), storage: store, getGamepads: () => [] });
  assert.deepEqual(inp.bindings.throttle, DEFAULT_BINDINGS.throttle);
  assert.deepEqual(inp.bindings.steerLeft, DEFAULT_BINDINGS.steerLeft);
  inp.dispose();
});

test("blur releases every held key", () => {
  const t = new EventTarget();
  const inp = createInput({ target: t, getGamepads: () => [] });
  key(t, "keydown", "KeyA"); key(t, "keydown", "Period");
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).throttle, 1);
  t.dispatchEvent(new Event("blur"));
  for (let i = 0; i < 60; i++) inp.poll(1 / 60);
  const o = inp.poll(1 / 60);
  assert.equal(o.throttle, 0); assert.equal(o.steer, 0);
  inp.dispose();
});

test("poll returns exactly the input shape, with steering ramping and gear edges", () => {
  const t = new EventTarget();
  const inp = createInput({ target: t, getGamepads: () => [] });
  const a = inp.poll(1 / 60);
  assert.deepEqual(Object.keys(a).sort(), ["brake", "gearDown", "gearUp", "handbrake", "steer", "throttle"]);
  assert.deepEqual({ ...a }, { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
  key(t, "keydown", "Period");
  const s1 = inp.poll(1 / 60).steer;
  assert.ok(s1 > 0 && s1 < 0.3, "ramps in: " + s1);
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).steer, 1);
  key(t, "keyup", "Period");
  assert.ok(inp.poll(1 / 60).steer < 1);
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).steer, 0);
  key(t, "keydown", "ShiftLeft");
  assert.equal(inp.poll(1 / 60).gearUp, true);
  assert.equal(inp.poll(1 / 60).gearUp, false, "edge triggered");
  key(t, "keyup", "ShiftLeft");
  key(t, "keydown", "KeyA");
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).throttle, 1);
  inp.dispose();
});

test("pause, camera, reset and hud keys fire callbacks once per press", () => {
  const t = new EventTarget();
  const seen = []; let pauses = 0;
  const inp = createInput({ target: t, onPause: () => pauses++, onAction: (a) => seen.push(a), getGamepads: () => [] });
  key(t, "keydown", "Escape"); key(t, "keydown", "Escape"); key(t, "keyup", "Escape");
  key(t, "keydown", "KeyP"); key(t, "keydown", "KeyC"); key(t, "keydown", "KeyR"); key(t, "keydown", "KeyH");
  assert.equal(pauses, 2);
  assert.deepEqual(seen, ["pause", "pause", "camera", "reset", "hud"]);
  inp.dispose();
});

test("gamepad: analogue triggers, stick with dead-zone, bumpers and buttons", () => {
  const m = mapGamepad(pad([0.05, 0, 0, 0], { 7: 0.6, 6: 0.25 }));
  assert.equal(m.steer, 0);
  assert.equal(m.throttle, 0.6);
  assert.equal(m.brake, 0.25);
  const m2 = mapGamepad(pad([-0.8, 0, 0, 0], { 5: 1, 4: 1, 1: 1, 2: 1, 3: 1, 9: 1 }));
  assert.ok(m2.steer < -0.4 && m2.steer > -1);
  assert.equal(m2.gearUp && m2.gearDown && m2.handbrake === 1 && m2.camera && m2.reset && m2.pause, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], { 15: 1 })).steer, 1, "d-pad steers");
  const t = new EventTarget();
  let gp = pad([0.9, 0, 0, 0], { 7: 1 });
  const inp = createInput({ target: t, getGamepads: () => [gp] });
  const a = inp.poll(1 / 60);
  assert.ok(a.steer > 0.6); assert.equal(a.throttle, 1);
  assert.equal(inp.gamepadConnected, true);
  gp = null;
  inp.poll(1 / 60);
  assert.equal(inp.gamepadConnected, false);
  inp.dispose();
});

test("touch zone and tilt mapping", () => {
  assert.equal(mapTouchSteer(150, 100, 100), 0);
  assert.ok(mapTouchSteer(100, 100, 100) <= -0.99);
  assert.ok(mapTouchSteer(300, 100, 100) >= 0.99, "clamped past the edge");
  assert.ok(mapTouchSteer(180, 100, 100) > 0.4);
  assert.equal(mapTilt(0), 0);
  assert.ok(mapTilt(-14) < 0 && mapTilt(14) > 0);
  assert.equal(mapTilt(80), 1);
});

test("touch state feeds poll when enabled and is ignored when disabled", () => {
  const t = new EventTarget();
  const inp = createInput({ target: t, getGamepads: () => [] });
  inp.touch.state.throttle = 1; inp.touch.state.steer = -0.5;
  assert.equal(inp.poll(1 / 60).throttle, 0, "touch off");
  inp.showTouch(true);
  inp.touch.state.throttle = 1; inp.touch.state.steer = -0.5; inp.touch._pressGear.up = true;
  const a = inp.poll(1 / 60);
  assert.equal(a.throttle, 1); assert.equal(a.steer, -0.5); assert.equal(a.gearUp, true);
  inp.showTouch(false);
  assert.equal(inp.touch.state.throttle, 0);
  inp.dispose();
});

test("rebinding is applied, rejects junk, and persists through storage", async () => {
  const store = createStorage(createMemoryStorage());
  const t = new EventTarget();
  const inp = createInput({ target: t, storage: store, getGamepads: () => [] });
  inp.setBindings({ ...inp.bindings, throttle: ["KeyI"], steerLeft: "bogus", brake: [] });
  assert.deepEqual(inp.bindings.throttle, ["KeyI"]);
  assert.deepEqual(inp.bindings.steerLeft, DEFAULT_BINDINGS.steerLeft, "junk falls back to default");
  assert.deepEqual(inp.bindings.brake, DEFAULT_BINDINGS.brake);
  key(t, "keydown", "KeyA");
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).throttle, 0, "old key no longer drives");
  key(t, "keyup", "KeyA"); key(t, "keydown", "KeyI");
  for (let i = 0; i < 30; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).throttle, 1);
  inp.dispose();
  const inp2 = createInput({ target: new EventTarget(), storage: store, getGamepads: () => [] });
  assert.deepEqual(inp2.bindings.throttle, ["KeyI"], "persisted");
  const cap = inp2.captureKey();
  const t2 = new EventTarget();
  void t2;
  inp2.dispose();
  void cap;
  assert.equal(DEFAULT_PAD.deadzone > 0, true);
});

test("captureKey resolves with the next key pressed and swallows it", async () => {
  const t = new EventTarget();
  const inp = createInput({ target: t, getGamepads: () => [] });
  const p = inp.captureKey();
  key(t, "keydown", "KeyZ");
  assert.equal(await p, "KeyZ");
  for (let i = 0; i < 20; i++) inp.poll(1 / 60);
  assert.equal(inp.poll(1 / 60).throttle, 0);
  inp.dispose();
});

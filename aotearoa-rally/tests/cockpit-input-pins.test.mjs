// Literal pins for the gamepad, touch and tilt constants and the binding limits (found by a x10 / /10 mutation sweep).
import test from "node:test";
import assert from "node:assert/strict";
import { shapeAxis, mapGamepad, mapTouchSteer, mapTilt, normaliseBindings, DEFAULT_PAD } from "../core/input.mjs";

const near = (a, b, e = 2e-3) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("shapeAxis: dead-zone 0.14, power 1.6, full deflection is exactly 1", () => {
  assert.equal(shapeAxis(0.1), 0); assert.equal(shapeAxis(-0.13), 0);
  near(shapeAxis(0.5), 0.2482); near(shapeAxis(-0.5), -0.2482);
  assert.equal(shapeAxis(1), 1); assert.equal(shapeAxis(-1), -1); assert.equal(shapeAxis(3), 1);
  assert.equal(DEFAULT_PAD.deadzone, 0.14); assert.equal(DEFAULT_PAD.curve, 1.6);
});

test("gamepad mapping: standard button indices, analogue triggers clamp to 1, d-pad steers", () => {
  const pad = (set) => ({ axes: [0], buttons: Array.from({ length: 16 }, (_, i) => (set[i] ?? 0)) });
  assert.equal(mapGamepad(pad({ 7: 1 })).throttle, 1); assert.equal(mapGamepad(pad({ 7: 3 })).throttle, 1);
  near(mapGamepad(pad({ 7: 0.4 })).throttle, 0.4, 1e-9);
  assert.equal(mapGamepad(pad({ 6: 3 })).brake, 1); near(mapGamepad(pad({ 6: 0.3 })).brake, 0.3, 1e-9);
  assert.equal(mapGamepad(pad({ 5: 1 })).gearUp, true); assert.equal(mapGamepad(pad({ 4: 1 })).gearDown, true);
  assert.equal(mapGamepad(pad({ 1: 1 })).handbrake, 1); assert.equal(mapGamepad(pad({ 1: 0.4 })).handbrake, 0); assert.equal(mapGamepad(pad({ 1: 0.6 })).handbrake, 1);
  assert.equal(mapGamepad(pad({ 2: 1 })).camera, true); assert.equal(mapGamepad(pad({ 3: 1 })).reset, true); assert.equal(mapGamepad(pad({ 9: 1 })).pause, true);
  assert.equal(mapGamepad(pad({})).camera, false);
  assert.equal(mapGamepad(pad({ 14: 1 })).steer, -1); assert.equal(mapGamepad(pad({ 15: 1 })).steer, 1);
  assert.equal(mapGamepad({ axes: [1], buttons: [] }).steer, 1);
  assert.equal(mapGamepad({ axes: [0.1], buttons: [] }).steer, 0);
});

test("touch steering: centre dead-zone 6 %, gentle curve, edges clamp to +-1", () => {
  assert.equal(mapTouchSteer(150, 100, 100), 0);
  assert.equal(mapTouchSteer(152, 100, 100), 0);
  near(mapTouchSteer(160, 100, 100), 0.112);
  assert.equal(mapTouchSteer(200, 100, 100), 1); assert.equal(mapTouchSteer(100, 100, 100), -1);
  assert.equal(mapTouchSteer(900, 100, 100), 1); assert.equal(mapTouchSteer(-900, 100, 100), -1);
  assert.equal(mapTouchSteer(100, 100, 0), -1, "zero-width rect does not divide by zero");
});

test("tilt steering: 28 degrees is full lock, 5 % dead-zone", () => {
  assert.equal(mapTilt(28), 1); assert.equal(mapTilt(-28), -1); assert.equal(mapTilt(100), 1);
  assert.equal(mapTilt(1), 0);
  assert.ok(mapTilt(14) > 0.4 && mapTilt(14) < 0.5);
});

test("bindings: codes longer than 31 characters are dropped, at most four codes per action", () => {
  const b = normaliseBindings({ throttle: ["KeyA", "x".repeat(31), "x".repeat(32), "KeyB", "KeyC", "KeyD"], brake: ["x".repeat(32)] });
  assert.deepEqual(b.throttle, ["KeyA", "x".repeat(31), "KeyB", "KeyC"]);
  assert.deepEqual(b.brake, ["KeyZ", "ArrowDown"], "an empty list falls back to the defaults");
  assert.deepEqual(normaliseBindings(null).throttle, ["KeyA", "ArrowUp"]);
});

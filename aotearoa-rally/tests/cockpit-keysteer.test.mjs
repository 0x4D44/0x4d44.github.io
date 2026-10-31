import test from "node:test";
import assert from "node:assert/strict";
import { shapeKeySteer, KEY_STEER, createInput } from "../core/input.mjs";

const hold = (dir, speed, seconds, start = 0, dt = 1 / 60) => { let s = start; for (let t = 0; t < seconds - 1e-9; t += dt) s = shapeKeySteer(s, dir, speed, dt); return s; };

test("key steering: at rest it winds on at 10/s to full lock", () => {
  assert.ok(Math.abs(shapeKeySteer(0, 1, 0, 0.05) - 0.5) < 1e-9);
  assert.equal(hold(1, 0, 1), 1);
});

test("key steering: the maximum lock shrinks with speed (1.0 at rest, 0.7 from 45 m/s)", () => {
  assert.equal(hold(1, 0, 3), 1);
  assert.ok(Math.abs(hold(1, 22.5, 3) - 0.85) < 1e-9);
  assert.ok(Math.abs(hold(1, 45, 3) - 0.7) < 1e-9);
  assert.ok(Math.abs(hold(1, 90, 3) - 0.7) < 1e-9, "capped at full speed");
  assert.ok(Math.abs(hold(-1, -45, 3) + 0.7) < 1e-9, "left, reversing speed sign ignored");
});

test("key steering: winds on a little more slowly at speed (10/s at rest, 7/s at 45 m/s)", () => {
  assert.ok(Math.abs(shapeKeySteer(0, 1, 45, 0.05) - 0.35) < 1e-9);
  assert.ok(shapeKeySteer(0, 1, 30, 0.05) < shapeKeySteer(0, 1, 10, 0.05));
});

test("key steering: centres faster at speed (9/s at rest, 14/s at 45 m/s) and reversal is a centring move", () => {
  assert.ok(Math.abs(shapeKeySteer(0.55, 0, 0, 0.01) - 0.46) < 1e-9);
  assert.ok(Math.abs(shapeKeySteer(0.55, 0, 45, 0.01) - 0.41) < 1e-9);
  assert.ok(Math.abs(shapeKeySteer(0.5, -1, 45, 0.01) - 0.36) < 1e-9, "from right to left starts with the quick rate");
  assert.equal(hold(0, 45, 0.5, 0.55), 0);
});

test("key steering: speed lowers the lock under an already-held larger value at the quick rate, never jumps", () => {
  const s = shapeKeySteer(1, 1, 45, 1 / 60);
  assert.ok(s < 1 && s > 1 - 14 / 60 - 1e-9);
  assert.ok(Math.abs(shapeKeySteer(0.2, 1, NaN, 0.01) - 0.3) < 1e-9);
});

test("poll(dt, speed) shapes the keyboard: the same held key reaches less lock at 45 m/s", () => {
  const mk = () => { const t = new EventTarget(); const inp = createInput({ target: t, getGamepads: () => [] }); t.dispatchEvent(Object.assign(new Event("keydown"), { code: "Period" })); return inp; };
  const slow = mk(), fast = mk();
  let a, b;
  for (let i = 0; i < 180; i++) { a = slow.poll(1 / 60, 0).steer; b = fast.poll(1 / 60, 45).steer; }
  assert.equal(a, 1);
  assert.ok(Math.abs(b - 0.7) < 1e-9);
  assert.equal(KEY_STEER.fullSpeed, 45);
});

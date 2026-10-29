// WORLD lane: warmup visibility restore, cascade splits, particle fade maths (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import { forceVisible, cascadeSplits, nearFade, flakeSize } from "../render/quality.mjs";

test("forceVisible shows everything then restores the exact previous flags", () => {
  const objs = [{ visible: false }, { visible: true }, { visible: false }];
  const restore = forceVisible(objs);
  assert.deepEqual(objs.map((o) => o.visible), [true, true, true]);
  restore();
  assert.deepEqual(objs.map((o) => o.visible), [false, true, false]);
});

test("cascade splits cover 0..far with an overlap and are ordered", () => {
  const c = cascadeSplits(40, 140);
  assert.equal(c.near.start, 0);
  assert.equal(c.far.end, 140);
  assert.ok(c.far.start < c.near.end, "cascades overlap");
  assert.ok(c.far.start > 0 && c.near.end < c.far.end);
});

test("nearFade is 0 close up, 1 at range, monotone", () => {
  assert.equal(nearFade(0.1, 4.5), 0);
  assert.equal(nearFade(4.5, 4.5), 1);
  assert.equal(nearFade(100, 4.5), 1);
  let prev = -1;
  for (let d = 0; d < 6; d += 0.25) { const v = nearFade(d, 4.5); assert.ok(v >= prev); prev = v; }
});

test("flake size never grows into a disc near the camera", () => {
  assert.ok(flakeSize(0.03, 1, 0.5) <= 0.5 * 0.0075 + 1e-9);
  assert.ok(flakeSize(0.03, 0.5, 50) <= 0.03 * 1.1 + 1e-9);
});

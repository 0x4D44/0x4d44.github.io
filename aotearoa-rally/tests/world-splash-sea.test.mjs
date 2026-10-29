// WORLD lane: wheel spray amount, water span test, shoreline crossings (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import { sprayAmount, inWaterSpan } from "../render/splash.mjs";
import { waterlineCrossings } from "../render/sea.mjs";

test("spray: none when standing, full when fast in water, small on wet road", () => {
  assert.equal(sprayAmount(true, 0, 0), 0);
  assert.equal(sprayAmount(true, 0, 20), 1);
  assert.equal(sprayAmount(false, 0.2, 30), 0);
  const wet = sprayAmount(false, 1, 30);
  assert.ok(wet > 0 && wet <= 0.28);
});

test("inWaterSpan is true only near a span centre", () => {
  const w = [{ x: 100, z: 50, halfLen: 10 }];
  assert.equal(inWaterSpan(w, 105, 50), true);
  assert.equal(inWaterSpan(w, 140, 50), false);
  assert.equal(inWaterSpan(undefined, 0, 0), false);
});

test("waterline crossings find the sign change and the seaward direction", () => {
  const lats = [0, 10, 20, 30];
  const c = waterlineCrossings(lats, [5, 2, -2, -6], 0);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].lat - 15) < 1e-9);
  assert.equal(c[0].seaward, 1);
  assert.equal(waterlineCrossings(lats, [5, 4, 3, 2], 0).length, 0);
  assert.equal(waterlineCrossings(lats, [-6, -2, 2, 5], 0)[0].seaward, -1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrameClock } from "../core/frameclock.mjs";

test("ticks return the seconds since the last accepted frame", () => {
  const c = createFrameClock(1000);
  assert.equal(c.tick(1016), 0.016);
  assert.equal(c.tick(1033), 0.017);
  assert.equal(c.last, 1033);
});

test("a repeated or older timestamp returns 0 and does not move the clock", () => {
  const c = createFrameClock(500);
  c.tick(600);
  assert.equal(c.tick(600), 0);
  assert.equal(c.tick(550), 0);
  assert.equal(c.last, 600);
  assert.equal(c.tick(616), 0.016);
});

test("a stale frame that runs after a reset does not rewind the clock (the warm-up block)", () => {
  // Measured on the real GPU, cold shader cache: frames at 4296, a 5.8 s block, the clock reset at 10100,
  // then a queued frame stamped 4311 runs, then the first fresh frame at 10140.
  const c = createFrameClock(0);
  c.tick(4296);
  c.reset(10100);
  assert.equal(c.tick(4311), 0, "the stale frame is skipped");
  assert.equal(c.last, 10100, "and the clock stays where the reset put it");
  assert.ok(Math.abs(c.tick(10140) - 0.04) < 1e-9, "the next fresh frame sees a normal step, not 5.8 s");
});

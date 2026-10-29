import test from "node:test";
import assert from "node:assert/strict";
import { dirtFor } from "../render/car.mjs";
import { SURFACE } from "../core/surfaces.mjs";

test("dirtFor: mud and fords dirty fast, tarmac never, rain on tarmac washes, standing still does nothing", () => {
  const mud = dirtFor(SURFACE.MUD, 25, 1, 0), tar = dirtFor(SURFACE.TARMAC, 25, 0, 0);
  assert.ok(mud.rate > 0.015 && mud.spray > 0.9);
  assert.equal(tar.rate, 0);
  assert.ok(dirtFor(SURFACE.TARMAC, 25, 0.9, 0.9).rate < 0);
  assert.equal(dirtFor(SURFACE.MUD, 0, 1, 0).rate, 0);
  assert.ok(dirtFor(SURFACE.WATER, 20, 1, 0).rate > mud.rate);
  assert.ok(dirtFor(SURFACE.GRAVEL, 25, 1, 0).rate > dirtFor(SURFACE.GRAVEL, 25, 0, 0).rate * 3, "wet gravel dirties much faster than dry");
  assert.ok(dirtFor(SURFACE.SNOW, 20, 0, 0).rate > 0);
});

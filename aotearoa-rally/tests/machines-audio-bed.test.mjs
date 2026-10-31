// Round 4, M4: the shared ambience bed is cut at standstill so the engine, not the bed, sets the idle spectrum (full-mix idle centroids
// differed only ~6 % across cars before; see machines-audio-timbre.mjs for the rendered check).
import test from "node:test";
import assert from "node:assert/strict";
import { bedLevel, BED_IDLE, CROWD_BASE } from "../audio/ambience.mjs";

test("bed is near-silent standing, rises monotonically and is full by 12 m/s", () => {
  assert.ok(BED_IDLE <= 0.03, `standstill bed ${BED_IDLE}`);
  assert.equal(bedLevel(0), BED_IDLE);
  let prev = -1;
  for (const v of [0, 2, 5, 8, 12, 30]) { const b = bedLevel(v); assert.ok(b >= prev); prev = b; }
  assert.equal(bedLevel(12), 1);
  assert.equal(bedLevel(-12), 1, "reversing counts as moving");
  assert.ok(Number.isFinite(bedLevel(undefined)));
});

test("start-line crowd is a murmur, not a bed", () => assert.ok(CROWD_BASE <= 0.1));

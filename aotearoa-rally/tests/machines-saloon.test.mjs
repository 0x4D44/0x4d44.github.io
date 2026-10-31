// Round 4, M5: the Huia reads as a four-door saloon (two full-length doors a side, a B pillar between them, a boot lid, a steep rear screen).
import test from "node:test";
import assert from "node:assert/strict";
import { dimsFor, doorLinesT } from "../render/cars/profiles.mjs";
import { CARS } from "../core/cars.mjs";

test("huia: two real doors a side, a boot lid cut and a steep rear screen", () => {
  const d = dimsFor(CARS.huia), c = d.cabin, L = doorLinesT(d);
  assert.equal(L.length, 4);
  const front = d.zAt(L[1]) - d.zAt(L[0]), rear = d.zAt(L[3]) - d.zAt(L[2]);
  assert.ok(Math.abs(front) >= 0.75 && Math.abs(rear) >= 0.75, `door lengths ${front.toFixed(2)} ${rear.toFixed(2)} m`);
  assert.ok(Math.abs(d.zAt(L[2]) - d.zAt(L[1])) <= 0.2, "B pillar slot is slim");
  assert.ok(c.boot > c.t1 + 0.02 && c.boot < 0.95, "boot lid cut sits behind the rear screen");
  const slope = (d.roof - d.topC(c.t1)) / Math.abs(d.zAt(c.t1) - d.zAt(c.re));
  assert.ok(slope >= 1.1, `rear screen rise/run ${slope.toFixed(2)}`);
});

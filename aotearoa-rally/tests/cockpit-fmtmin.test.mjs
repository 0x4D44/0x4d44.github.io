import test from "node:test";
import assert from "node:assert/strict";
import { fmtMin } from "../ui/dom.mjs";

test("fmtMin never shows zero for a real amount, 0.01 to 60 minutes, and never decreases", () => {
  let prev = 0;
  for (let m = 0.01; m <= 60.0001; m += 0.01) {
    const s = fmtMin(m);
    assert.match(s, /^\d+(\.\d)? min$/, s);
    const v = parseFloat(s);
    assert.ok(v > 0, `${m} -> ${s}`);
    assert.ok(v >= m - 1e-6, `${m} -> ${s} rounds down`);
    assert.ok(v >= prev, `${m} -> ${s} went backwards`);
    prev = v;
  }
});

test("fmtMin exact values", () => {
  assert.equal(fmtMin(0), "0.0 min");
  assert.equal(fmtMin(0.01), "0.1 min");
  assert.equal(fmtMin(0.3), "0.3 min");
  assert.equal(fmtMin(0.31), "0.4 min");
  assert.equal(fmtMin(9.95), "10.0 min");
  assert.equal(fmtMin(10), "10 min");
  assert.equal(fmtMin(10.2), "11 min");
  assert.equal(fmtMin(60), "60 min");
  assert.equal(fmtMin(NaN), "0.0 min");
});

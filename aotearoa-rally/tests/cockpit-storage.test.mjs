import test from "node:test";
import assert from "node:assert/strict";
import { createStorage, createMemoryStorage, browserStorage } from "../core/storage.mjs";

test("memory backend stores, overwrites and removes", () => {
  const s = createStorage(createMemoryStorage());
  assert.equal(s.get("a"), null);
  assert.equal(s.set("a", "1"), true);
  assert.equal(s.get("a"), "1");
  s.set("a", 2);
  assert.equal(s.get("a"), "2");
  s.remove("a");
  assert.equal(s.get("a"), null);
});

test("JSON helpers round-trip and fall back on corrupt data", () => {
  const s = createStorage(null);
  assert.equal(s.setJSON("k", { a: [1, 2, { b: 3 }] }), true);
  assert.deepEqual(s.getJSON("k"), { a: [1, 2, { b: 3 }] });
  assert.deepEqual(s.getJSON("missing", { d: 1 }), { d: 1 });
  s.set("bad", "{oops");
  assert.equal(s.getJSON("bad", "fallback"), "fallback");
  assert.ok(s.failures >= 1);
  const cyc = {}; cyc.self = cyc;
  assert.equal(s.setJSON("cyc", cyc), false);
});

test("a throwing backend never throws out of the adapter", () => {
  const boom = () => { throw new Error("blocked"); };
  const s = createStorage({ getItem: boom, setItem: boom, removeItem: boom });
  assert.equal(s.get("x"), null);
  assert.equal(s.set("x", "1"), false);
  assert.equal(s.remove("x"), true === false);
  assert.equal(s.getJSON("x", 7), 7);
  assert.equal(s.setJSON("x", {}), false);
  assert.ok(s.failures >= 4);
});

test("browserStorage falls back to memory outside a browser", () => {
  const s = browserStorage();
  s.set("z", "1");
  assert.equal(s.get("z"), "1");
});

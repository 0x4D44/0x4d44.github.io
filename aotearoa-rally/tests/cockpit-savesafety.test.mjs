import test from "node:test";
import assert from "node:assert/strict";
import { createCareer, SAVE_KEY, GHOST_KEY } from "../core/career.mjs";
import { createStorage, createMemoryStorage } from "../core/storage.mjs";

const protoNames = () => Object.getOwnPropertyNames(Object.prototype).sort().join();

test("a save with __proto__/constructor/prototype keys never pollutes Object.prototype and still loads", () => {
  const before = protoNames();
  const evil = '{"v":1,"profile":{"best":{"__proto__":{"polluted":123},"constructor":{"prototype":9},"waitomo":{"__proto__":5,"huia":88.5,"constructor":7}},'
    + '"splits":{"__proto__":{"polluted":[1]},"prototype":{"x":[1]},"waitomo":{"__proto__":[2],"huia":[1,2]}},'
    + '"options":{"__proto__":{"polluted":1},"constructor":{"x":1},"units":"mph"},"stats":{"__proto__":{"polluted":1}}},'
    + '"championship":{"__proto__":{"polluted":1},"difficulty":"pro","carId":"huia","stageIndex":0,"results":[],"service":{"plan":{"__proto__":{"polluted":1},"engine":0.5}}}}';
  const store = createStorage(createMemoryStorage({ [SAVE_KEY]: evil, [GHOST_KEY("__proto__", "constructor")]: '{"__proto__":{"polluted":1},"n":1,"d":[0,0,0,0,0,0]}' }));
  const c = createCareer({ storage: store });
  assert.equal(c.load(), true);
  assert.equal({}.polluted, undefined);
  assert.equal(protoNames(), before);
  assert.equal(c.bestTime("waitomo", "huia"), 88.5);
  assert.equal(c.bestTime("__proto__", "polluted"), null);
  assert.deepEqual(Object.keys(c.profile.best), ["waitomo"]);
  assert.deepEqual(Object.keys(c.profile.best.waitomo), ["huia"]);
  assert.deepEqual(Object.keys(c.profile.splits.waitomo), ["huia"]);
  assert.equal(c.recordBest("__proto__", "x", 5, [1]).isBest, false);
  assert.equal(c.recordBest("waitomo", "constructor", 5, [1]).isBest, false);
  assert.equal(c.setOption("__proto__", 1), false);
  assert.equal(c.setOption("constructor", 1), false);
  c.loadGhost("__proto__", "constructor");
  assert.equal({}.polluted, undefined);
  assert.equal(protoNames(), before);
});

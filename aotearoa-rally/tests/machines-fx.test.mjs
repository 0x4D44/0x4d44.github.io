import test from "node:test";
import assert from "node:assert/strict";
import { Pool, dustRate, wheelSlipAmount, toRGB, KIND } from "../render/fx.mjs";
import { SURFACE, SURFACE_INFO } from "../core/surfaces.mjs";

const emit = (p, life = 1) => p.emit(0, 1, 0, 0, 0, 0, life, 0.5, 2, 1, 1, 1, 0.3);

test("pool allocates sequentially, counts live particles and reports a high-water mark", () => {
  const p = new Pool(8, "soft");
  for (let i = 0; i < 3; i++) emit(p);
  p.update(0.01, 0, 0);
  assert.equal(p.live, 3);
  assert.equal(p.high, 3);
});

test("pool is a ring: when full the oldest slot is overwritten and the count never exceeds capacity", () => {
  const p = new Pool(4, "soft");
  for (let i = 0; i < 10; i++) emit(p);
  p.update(0.001, 0, 0);
  assert.equal(p.live, 4);
  assert.equal(p.high, 4);
  assert.equal(p.next, 2);
});

test("particles die at the end of their life: size and alpha go to zero, slot is reusable", () => {
  const p = new Pool(4, "soft");
  const i = emit(p, 0.5);
  p.update(0.25, 0, 0);
  assert.equal(p.live, 1);
  assert.ok(p.col[i * 4 + 3] > 0 && p.data[i * 4 + 1] > 0);
  p.update(0.3, 0, 0);
  assert.equal(p.live, 0);
  assert.equal(p.alive[i], 0);
  assert.equal(p.data[i * 4 + 1], 0);
  assert.equal(p.col[i * 4 + 3], 0);
  assert.equal(p.high, 0);
});

test("soft particles grow over their life and fade in then out", () => {
  const p = new Pool(2, "soft");
  const i = emit(p, 2);
  const sizes = [], alphas = [];
  for (let k = 0; k < 20; k++) { p.update(0.1, 0, 0); sizes.push(p.data[i * 4 + 1]); alphas.push(p.col[i * 4 + 3]); }
  for (let k = 1; k < sizes.length - 1; k++) assert.ok(sizes[k] >= sizes[k - 1]);
  const peak = Math.max(...alphas);
  assert.ok(peak > 0 && peak <= 0.3 + 1e-9);
  assert.ok(alphas[0] < peak && alphas[alphas.length - 2] < peak);
});

test("wind drags particles that are coupled to it; uncoupled ones ignore it", () => {
  const p = new Pool(2, "soft");
  const a = p.emit(0, 1, 0, 0, 0, 0, 5, 1, 1, 1, 1, 1, 0.3, { wind: 2, drag: 0 });
  const b = p.emit(0, 1, 0, 0, 0, 0, 5, 1, 1, 1, 1, 1, 0.3, { wind: 0, drag: 0 });
  for (let k = 0; k < 60; k++) p.update(1 / 60, 4, 0);
  assert.ok(p.pos[a * 3] > 1.5, `x ${p.pos[a * 3]}`);
  assert.equal(p.pos[b * 3], 0);
});

test("hard particles bounce off the ground and come to rest above it", () => {
  const p = new Pool(2, "hard");
  const i = p.emit(0, 2, 0, 0, 0, 0, 10, 0.03, 0.03, 1, 1, 1, 1, { grav: 9.8, bounce: 0.4, kind: KIND.STONE });
  const ground = () => 0.5;
  let minY = 9;
  for (let k = 0; k < 600; k++) { p.update(1 / 120, 0, 0, ground); minY = Math.min(minY, p.pos[i * 3 + 1]); }
  assert.ok(minY >= 0.5 - 1e-6, `fell through: ${minY}`);
  assert.ok(Math.abs(p.pos[i * 3 + 1] - 0.52) < 0.05, `rest ${p.pos[i * 3 + 1]}`);
});

test("glow sparks are oriented along their screen-space velocity", () => {
  const p = new Pool(2, "glow");
  const i = p.emit(0, 1, 0, 0, 5, 0, 1, 0.05, 0.03, 1, 0.6, 0.2, 1, { kind: KIND.SPARK });
  p.update(0.01, 0, 0, null, { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 });
  assert.ok(Math.abs(p.data[i * 4 + 2] - Math.PI / 2) < 0.05);
  assert.ok(p.misc[i * 2 + 1] > 0);
});

test("clear() empties the pool", () => {
  const p = new Pool(3, "soft");
  emit(p); emit(p);
  p.clear();
  p.update(0.01, 0, 0);
  assert.equal(p.live, 0);
  assert.equal(p.high, 0);
});

test("no allocation in the hot loop: update runs 20k particles-steps without growing heap objects", () => {
  const p = new Pool(2000, "soft");
  for (let i = 0; i < 2000; i++) emit(p, 5);
  const before = process.memoryUsage().heapUsed;
  for (let k = 0; k < 20; k++) p.update(1 / 60, 1, 1, null, { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 });
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 4e6, `heap grew ${grown}`);
});

test("wheel slip amount combines ratio, angle and skid, bounded", () => {
  assert.equal(wheelSlipAmount({}), 0);
  assert.ok(wheelSlipAmount({ slipAngle: 0.2 }) > wheelSlipAmount({ slipAngle: 0.05 }));
  assert.ok(wheelSlipAmount({ slipRatio: 99, skid: 99 }) <= 1.5);
  assert.ok(wheelSlipAmount({ skid: 0.7 }) >= 0.7 - 1e-9);
});

test("dust: gravel makes more than tarmac, wet reduces it, spray surfaces ignore wetness, and more slip = more dust", () => {
  const g = SURFACE_INFO[SURFACE.GRAVEL], t = SURFACE_INFO[SURFACE.TARMAC], m = SURFACE_INFO[SURFACE.MUD];
  assert.ok(dustRate(g, 0.5, 25, 0) > 0);
  assert.equal(dustRate(t, 0.5, 25, 0), 0);
  assert.ok(dustRate(g, 0.5, 25, 1) < dustRate(g, 0.5, 25, 0));
  assert.equal(dustRate(m, 0.5, 25, 1), dustRate(m, 0.5, 25, 0));
  let prev = -1;
  for (let s = 0; s <= 1.2; s += 0.1) { const r = dustRate(g, s, 20, 0); assert.ok(r >= prev); prev = r; }
  assert.ok(dustRate(g, 0, 0, 0) === 0 || dustRate(g, 0, 0, 0) < dustRate(g, 0, 20, 0));
  assert.ok(Number.isFinite(dustRate(undefined, 1, 1, 1)));
});

test("toRGB handles hex numbers, strings, colour-likes and arrays", () => {
  assert.deepEqual(toRGB(0xff8000, [0, 0, 0]).map((v) => Math.round(v * 255)), [255, 128, 0]);
  assert.deepEqual(toRGB("#0000ff", [0, 0, 0]).map((v) => Math.round(v * 255)), [0, 0, 255]);
  assert.deepEqual(toRGB({ r: 0.1, g: 0.2, b: 0.3 }, [0, 0, 0]), [0.1, 0.2, 0.3]);
  assert.deepEqual(toRGB([1, 0, 0], [0, 0, 0]), [1, 0, 0]);
  assert.ok(toRGB(undefined, [0, 0, 0]).every((v) => v > 0));
});

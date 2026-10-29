import test from "node:test";
import assert from "node:assert/strict";
import { leakProblems } from "./leak-trend.mjs";

const series = (stage, geos, tex, prog) => geos.map((g, i) => ({ stage, geometries: g, textures: tex[i] ?? tex.at(-1), programs: prog[i] ?? prog.at(-1) }));
const interleave = (a, b) => a.flatMap((x, i) => [x, b[i]]);

test("a stable run, with a noisy geometry count and a cold first visit, passes", () => {
  const a = series("otago", [80, 96, 94, 96, 95, 96, 94], [20, 24, 24, 24, 24, 24, 24], [10, 10, 10, 10, 10, 10, 10]);
  const b = series("waitomo", [70, 90, 91, 90, 92, 90, 91], [20, 22, 22, 22, 22, 22, 22], [10, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(leakProblems(interleave(a, b)), []);
});

test("a missing dispose (geometries creeping up each visit) is caught", () => {
  const a = series("otago", [80, 96, 100, 106, 112, 118, 124], [24], [10]);
  const b = series("waitomo", [70, 90, 90, 90, 90, 90, 90], [22], [10]);
  const p = leakProblems(interleave(a, b));
  assert.equal(p.length, 1);
  assert.match(p[0], /otago: geometries trend/);
});

test("a single leaked texture or program is caught", () => {
  const a = series("otago", [90, 90, 90, 90, 90, 90, 90], [24, 24, 24, 24, 25, 25, 25], [10]);
  const b = series("waitomo", [90, 90, 90, 90, 90, 90, 90], [22], [10, 10, 10, 10, 10, 11, 11]);
  const p = leakProblems(interleave(a, b));
  assert.equal(p.length, 2);
  assert.ok(p.some((x) => /otago: textures/.test(x)) && p.some((x) => /waitomo: programs/.test(x)));
});

test("too few visits is reported rather than silently passing", () => {
  assert.equal(leakProblems(series("otago", [1, 1, 1], [1], [1])).length, 1);
});

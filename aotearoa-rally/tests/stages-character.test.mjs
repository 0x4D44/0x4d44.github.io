// Round 3: no endless straights, per-stage slope character, smooth pitch changes, set pieces.
// STAGES_BREAK=straight|pitch|grade-flat deliberately corrupts the data so each check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";
import { SURFACE } from "../core/surfaces.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const stages = {};
for (const id of STAGE_IDS) stages[id] = buildStage(id);
const GRADES = { waitomo: 0.09, whakarewarewa: 0.12, coromandel: 0.14, otago: 0.08, remarkables: 0.18, fiordland: 0.11 };
if (BREAK === "straight") for (let i = 600; i < 1400; i++) stages.otago.curv[i] = 0;
if (BREAK === "pitch") stages.waitomo.slope[700] += 0.08;
if (BREAK === "grade-flat") for (const id of STAGE_IDS) stages[id].maxGrade = 0.145;

for (const id of STAGE_IDS) {
  test(`${id}: no straight longer than 650 m`, () => {
    const st = stages[id];
    let run = 0, best = 0, at = 0;
    for (let i = 0; i < st.N; i++) {
      if (Math.abs(st.curv[i]) < 1 / 1500) { run++; if (run > best) { best = run; at = i - run + 1; } } else run = 0;
    }
    assert.ok(best * st.ds <= 650, `${id}: straight of ${best * st.ds} m from s=${at * st.ds}`);
  });

  test(`${id}: slope character matches its declared max grade; pitch changes are smooth`, () => {
    const st = stages[id];
    assert.equal(st.maxGrade, GRADES[id]);
    let mx = 0;
    for (let i = 0; i < st.N; i++) mx = Math.max(mx, Math.abs(st.slope[i]));
    assert.ok(Math.abs(mx - GRADES[id]) <= 0.015, `${id}: max grade ${mx.toFixed(3)} vs declared ${GRADES[id]}`);
    // away from a jump lip the grade changes by at most 3 % per 2 m station
    const jz = st.hazards.filter((h) => h.kind === "jump").map((h) => h.s);
    for (let i = 1; i < st.N; i++) {
      const s = i * st.ds;
      if (jz.some((z) => Math.abs(z - s) < 24)) continue;
      assert.ok(Math.abs(st.slope[i] - st.slope[i - 1]) <= 0.03, `${id}: grade steps ${st.slope[i - 1].toFixed(3)} -> ${st.slope[i].toFixed(3)} at s=${s}`);
    }
  });
}

test("the six stages have at least five distinct max grades", () => {
  const set = new Set(STAGE_IDS.map((id) => stages[id].maxGrade));
  assert.ok(set.size >= 5, `${[...set]}`);
});

test("set pieces: Waitomo jump into a hairpin and cave tunnel, Otago descent into a ford", () => {
  const w = stages.waitomo.setPieces, o = stages.otago.setPieces;
  assert.ok(w.some((p) => p.id === "jump_hairpin" && p.s1 > p.s0), "waitomo jump_hairpin");
  assert.ok(w.some((p) => p.id === "cave_tunnel" && p.s1 - p.s0 >= 100), "waitomo cave_tunnel");
  const fd = o.find((p) => p.id === "ford_descent");
  assert.ok(fd && fd.s1 - fd.s0 > 1000, "otago ford_descent");
  const st = stages.otago, ford = st.water.find((q) => q.kind === "ford");
  assert.ok(ford && Math.abs(ford.s - fd.s1) < 5, "ford ends the descent");
  const prj = st.project(ford.x, ford.z, ford.s, {});
  assert.ok(Math.abs(prj.lat) < 0.2, "ford water is centred on the road");
  assert.equal(st.surfaceAt(ford.x, ford.z), SURFACE.WATER);
  assert.ok(st.pacenotes.some((n) => n.kind === "ford" && Math.abs(n.s - ford.s) < 40));
  assert.ok(stages.waitomo.pacenotes.some((n) => n.kind === "caution" && /cave/i.test(n.speak)), "cave pace note");
});

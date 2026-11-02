// Round 6: Waitomo opens gently. Nothing tighter than R70 in the first 1.2 km; the first R<=45 corner is announced
// by a call at least 150 m before it. STAGES_BREAK=hard-intro makes the opening bend R40 / drops the early call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const st = buildStage("waitomo");
if (BREAK === "hard-intro") { for (let i = 100; i < 160; i++) st.curv[i] = 1 / 40; }

const minR = (s0, s1) => {
  let k = 0;
  for (let i = Math.round(s0 / st.ds); i <= Math.round(s1 / st.ds); i++) k = Math.max(k, Math.abs(st.curv[i]));
  return k ? 1 / k : Infinity;
};

test("Waitomo: no corner tighter than R70 in the first 1.2 km", () => {
  assert.ok(minR(0, 1200) >= 70, `min radius ${minR(0, 1200).toFixed(0)} m`);
});

test("Waitomo: the first R<=45 corner is announced at least 150 m earlier", () => {
  let first = -1;
  for (let i = 0; i < st.N; i++) if (Math.abs(st.curv[i]) >= 1 / 45) { first = i * st.ds; break; }
  assert.ok(first > 1200, `first tight corner at s=${first}`);
  const corner = st.pacenotes.find((n) => (n.kind === "corner" || n.kind === "hairpin") && n.s + n.length >= first - 1);
  assert.ok(corner);
  const warn = st.pacenotes.filter((n) => n.kind !== "surface" && n !== corner && n.s <= corner.s - 150 && n.s >= corner.s - 400);
  assert.ok(warn.length > 0, `no call 150-400 m before the tight corner at s=${corner.s.toFixed(0)}`);
});

test("other stages: report min radius in the first 300 m", async () => {
  for (const id of ["whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]) {
    const o = buildStage(id);
    let k = 0;
    for (let i = 0; i <= 150; i++) k = Math.max(k, Math.abs(o.curv[i]));
    console.log(`# ${id}: min radius in first 300 m = ${k ? (1 / k).toFixed(0) : "inf"} m`);
  }
});

// Round 9: Fiordland opens on loose ground too: no corner under R87 in the first 1.2 km, and the first R<=45 corner is announced.
test("Fiordland: no corner tighter than R87 in the first 1.2 km", () => {
  const f = buildStage("fiordland");
  if (BREAK === "hard-fiordland") for (let i = 71; i < 91; i++) f.curv[i] = 1 / 37;
  let k = 0;
  for (let i = 0; i <= 600; i++) k = Math.max(k, Math.abs(f.curv[i]));
  assert.ok(1 / k >= 87, `min radius ${(1 / k).toFixed(0)} m`);
  const first = f.curv.findIndex((c) => Math.abs(c) >= 1 / 45) * f.ds;
  assert.ok(first > 1200, `first tight corner at s=${first}`);
  const c = f.pacenotes.find((n) => (n.kind === "corner" || n.kind === "hairpin") && n.s + n.length >= first - 1);
  assert.ok(f.pacenotes.some((n) => n.kind !== "surface" && n !== c && n.s <= c.s - 150 && n.s >= c.s - 400));
});

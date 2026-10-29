// S7 cut policing: the soft walls must not let a driver shorten a bend across the verge.
// STAGES_BREAK=wide-walls opens every wall to 30 m so the checks can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const stages = {};
for (const id of STAGE_IDS) {
  stages[id] = buildStage(id);
  if (BREAK === "wide-walls") {
    const st = stages[id];
    for (let i = 0; i < st.N; i++) { st.boundaryLeft[i] = st.width[i] / 2 + 30; st.boundaryRight[i] = st.width[i] / 2 + 30; }
  }
}

/**
 * Taut-string relaxation: the shortest path from the centreline at s0 to the centreline at s0 + W that stays inside
 * the lateral limits (-left, +right).  Returns the fraction of W saved.  Gauss-Seidel on 4 m stations: each point
 * slides to the line through its neighbours, then is clamped to its limits.
 */
export function tautSaving(st, s0, W, limits, step = 4, iters = 250) {
  const n = Math.round(W / step);
  const lo = [], hi = [], nx = [], nz = [], cx = [], cz = [];
  const o = {}, b = {};
  for (let k = 0; k <= n; k++) {
    const s = Math.min(st.lengthM, s0 + k * step);
    st.sample(s, o);
    cx.push(o.x); cz.push(o.z); nx.push(o.nx); nz.push(o.nz);
    if (limits === "road") { lo.push(-o.width / 2); hi.push(o.width / 2); }
    else { st.boundaryAt(s, b); lo.push(-b.left); hi.push(b.right); }
  }
  const lat = new Float64Array(n + 1);
  const x = (k) => cx[k] + nx[k] * lat[k], z = (k) => cz[k] + nz[k] * lat[k];
  for (let it = 0; it < iters; it++) {
    for (let k = 1; k < n; k++) {
      const mx = (x(k - 1) + x(k + 1)) / 2, mz = (z(k - 1) + z(k + 1)) / 2;
      const t = (mx - cx[k]) * nx[k] + (mz - cz[k]) * nz[k];
      lat[k] = Math.min(hi[k], Math.max(lo[k], t));
    }
  }
  let len = 0;
  for (let k = 0; k < n; k++) len += Math.hypot(x(k + 1) - x(k), z(k + 1) - z(k));
  return 1 - len / (n * step);
}

test("tautSaving: a pinned straight saves nothing, a bend saves something", () => {
  const st = stages.coromandel;
  assert.ok(tautSaving(st, 0, 100, "road") < 0.002);
  // the widest limits on a hairpin cut well over 1 %
  const h = st.pacenotes.find((n) => n.kind === "hairpin");
  const wide = { ...st, boundaryAt: (s, out) => { out.left = 30; out.right = 30; return out; } };
  assert.ok(tautSaving(wide, Math.max(0, h.s - 120), 300, "bound") > 0.03);
});

for (const id of STAGE_IDS) {
  test(`${id}: the inside wall of every tight bend closes to the road edge + 2.5 m`, () => {
    const st = stages[id];
    const b = {};
    let checked = 0;
    for (const n of st.pacenotes) {
      if (n.kind !== "hairpin" && !(n.kind === "corner" && n.severity <= 3)) continue;
      const s = n.s + n.length / 2;
      st.boundaryAt(s, b);
      const inside = n.dir === "right" ? b.right : b.left;
      const hw = st.sample(s, {}).width / 2;
      assert.ok(inside <= hw + 2.5 + 1e-3, `${id} ${n.kind} ${n.dir}${n.severity} at s=${n.s}: inside wall ${inside.toFixed(2)} vs road half ${hw.toFixed(2)}`);
      checked++;
    }
    assert.ok(checked >= 1, "no tight bends to check");
  });

  test(`${id}: across the verge, no 300 m window can be shortened by more than the road allows plus 2.5 %`, () => {
    const st = stages[id];
    let worst = 0, at = 0;
    for (let s0 = 0; s0 + 300 <= st.lengthM; s0 += 50) {
      const excess = tautSaving(st, s0, 300, "bound") - tautSaving(st, s0, 300, "road");
      if (excess > worst) { worst = excess; at = s0; }
    }
    console.log(`# ${id}: worst extra saving from the walls ${(worst * 100).toFixed(2)} % (window at s=${at})`);
    assert.ok(worst <= 0.025, `window at s=${at} can be cut ${(worst * 100).toFixed(2)} % beyond the road edges`);
  });
}

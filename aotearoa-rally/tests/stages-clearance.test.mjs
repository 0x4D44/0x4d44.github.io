// Round 4 S5: the terrain never rises above the road surface across the road width (+1 m margin), and the shoulder
// beyond the edge blends smoothly.  STAGES_BREAK=lump raises the ground 0.3 m over a bend so the check can be seen to fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";

for (const id of STAGE_IDS) {
  test(`${id}: terrain does not cover the road; the shoulder blends smoothly`, () => {
    const st = buildStage(id);
    let hf = st.heightAt;
    if (BREAK === "lump") { const h0 = st.heightAt, q = {}; hf = (x, z) => { const h = h0(x, z); st.project(x, z, 1400, q); return Math.abs(q.s - 1400) < 30 && Math.abs(q.lat) < 6 ? h + 0.3 : h; }; }
    const o = {}, oo = {}, pj = {};
    let worst = 0, at = "", steepest = 0, steepAt = "";
    for (let s = 0; s <= st.lengthM; s += 2) {
      st.sample(s, o);
      const half = o.width / 2;
      // the road surface as the game defines it: the height and camber at the point's own nearest centreline position
      for (let l = -half - 1; l <= half + 1.001; l += 0.5) {
        const x = o.x + o.nx * l, z = o.z + o.nz * l;
        st.project(x, z, s, pj);
        st.sample(pj.s, oo);
        const hw = oo.width / 2, lc = Math.max(-hw, Math.min(hw, pj.lat)); // beyond the edge: the edge height
        const road = oo.y - lc * Math.tan(oo.bank);
        const over = hf(x, z) - road;
        if (over > worst) { worst = over; at = `s=${s} lat=${l.toFixed(1)}`; }
      }
      // shoulder: ground gradient over the 3 m beyond each edge stays gentle (a ditch bank, not a wall)
      for (const side of [-1, 1]) {
        let prev = hf(o.x + o.nx * side * half, o.z + o.nz * side * half);
        for (let d = 1; d <= 3; d += 1) {
          const gg = hf(o.x + o.nx * side * (half + d), o.z + o.nz * side * (half + d));
          const sl = Math.abs(gg - prev);
          if (sl > steepest) { steepest = sl; steepAt = `s=${s} side=${side} d=${d}`; }
          prev = gg;
        }
      }
    }
    console.log(`# ${id}: worst terrain-over-road ${(worst * 100).toFixed(1)} cm (${at}); steepest shoulder step ${steepest.toFixed(2)} m per m (${steepAt})`);
    assert.ok(worst <= 0.02, `${id}: terrain ${(worst * 100).toFixed(1)} cm above the road at ${at}`);
    assert.ok(steepest <= 2.0, `${id}: shoulder step ${steepest.toFixed(2)} m per m at ${steepAt}`);
  });
}

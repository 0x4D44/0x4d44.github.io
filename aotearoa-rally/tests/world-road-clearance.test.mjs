// WORLD lane: the drawn terrain (LOD mesh) lies at least 2 cm below the road ribbon across the full road width at the sharpest
// curvature peaks of every stage. WORLD_BREAK=nosink removes the road sink so the check can be seen to fail (self-test).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { createTerrain } from "../render/terrain.mjs";
import { QUALITY } from "../render/quality.mjs";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.WORLD_BREAK || "";

for (const id of STAGE_IDS) {
  test(`${id}: drawn terrain is 2 cm or more under the road surface at every curvature peak`, () => {
    const st = buildStage(id);
    const T = createTerrain(THREE, { SU: {}, textures: { get: () => null, meters: () => 10 }, getCfg: () => QUALITY.high });
    T.setStage(st);
    const idx = []; for (let i = 3; i < st.N - 3; i++) idx.push(i);
    idx.sort((a, b) => Math.abs(st.curv[b]) - Math.abs(st.curv[a]));
    const picks = []; for (const i of idx) { if (picks.every((p) => Math.abs(p - i) > 40)) picks.push(i); if (picks.length >= 8) break; }
    let worst = -1e9;
    for (const i of picks) {
      T.fillSync(st.px[i], st.pz[i], 90);
      const tl = Math.hypot(st.px[i + 1] - st.px[i - 1], st.pz[i + 1] - st.pz[i - 1]);
      const nx = -(st.pz[i + 1] - st.pz[i - 1]) / tl, nz = (st.px[i + 1] - st.px[i - 1]) / tl;
      const hw = st.width[i] * 0.5;
      for (let l = -hw; l <= hw; l += 0.25) {
        const surf = st.py[i] - Math.tan(st.bank[i]) * l - 0.02 * Math.min(1, (l / hw) * (l / hw)) + 0.012; // road.mjs ribbon
        const drawn = T.renderedHeightAt(st.px[i] + nx * l, st.pz[i] + nz * l) + (BREAK === "nosink" ? 0.12 : 0);
        worst = Math.max(worst, drawn - surf);
      }
    }
    assert.ok(worst <= -0.02, `terrain pokes ${(worst * 100).toFixed(1)} cm relative to the road surface (needs <= -2 cm)`);
  });
}

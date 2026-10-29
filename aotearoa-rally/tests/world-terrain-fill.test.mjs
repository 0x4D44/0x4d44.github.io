// WORLD lane: no terrain is missing within the view distance at stage start or right after a jump of the camera, and no prop
// hovers above the terrain as it is actually drawn (the LOD mesh of the chunk under it). Pure JS: no GPU needed.
// WORLD_BREAK=nofill disables the jump fill so the check can be seen to fail (self-test).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { createTerrain } from "../render/terrain.mjs";
import { QUALITY, CHUNK_SIZE, LOD_QUADS, chunkKey } from "../render/quality.mjs";
import { buildStage } from "../core/stage.mjs";

const BREAK = process.env.WORLD_BREAK || "";
const cfg = QUALITY.high;
const textures = { get: () => null, meters: () => 10 };

function make(id) {
  const stage = buildStage(id);
  const terrain = createTerrain(THREE, { SU: {}, textures, getCfg: () => cfg });
  terrain.setStage(stage);
  if (BREAK === "nofill") terrain.fillSync = () => 0;
  return { stage, terrain };
}

/** wanted chunks within the view distance that have no mesh, and props with no terrain under them or hovering above it */
function audit(stage, terrain, px, pz) {
  const vd = terrain.viewDist;
  let missing = 0;
  for (const w of terrain.wanted(px, pz, vd, cfg)) if (!terrain.chunks.has(chunkKey(w.cx, w.cz))) missing++;
  const hover = [];
  let noTerrain = 0, inRange = 0;
  for (const p of stage.props) {
    const dx = p.x - px, dz = p.z - pz;
    if (dx * dx + dz * dz > vd * vd) continue;
    inRange++;
    const h = terrain.renderedHeightAt(p.x, p.z);
    if (h === null) { noTerrain++; continue; }
    const c = terrain.chunks.get(chunkKey(Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE)));
    const tol = 1.5 + 0.4 * (CHUNK_SIZE / LOD_QUADS[c.lod]); // a coarse mesh may cut a ridge by a fraction of its quad size
    if (p.y - h > tol) hover.push(`${p.kind}@lod${c.lod} ${(p.y - h).toFixed(1)}m`);
  }
  return { missing, noTerrain, inRange, hover };
}

for (const id of ["otago", "remarkables"]) {
  test(`${id}: after the stage prebuild no terrain is missing and no prop hovers`, async () => {
    const { stage, terrain } = make(id);
    const sp = stage.startPose ?? { x: stage.px[0], z: stage.pz[0] };
    await terrain.prebuild(sp.x, sp.z, terrain.viewDist);
    const a = audit(stage, terrain, sp.x, sp.z);
    assert.ok(a.inRange > 100, "props in range to judge");
    assert.deepEqual({ missing: a.missing, noTerrain: a.noTerrain }, { missing: 0, noTerrain: 0 });
    assert.deepEqual(a.hover.slice(0, 5), [], `${a.hover.length} props hover over the drawn terrain`);
  });

  test(`${id}: one update after a teleport leaves no terrain missing and no prop hovering`, async () => {
    const { stage, terrain } = make(id);
    const sp = stage.startPose ?? { x: stage.px[0], z: stage.pz[0] };
    await terrain.prebuild(sp.x, sp.z, terrain.viewDist);
    for (const f of [0.55, 0.9]) {
      const sm = stage.sample(f * stage.lengthM, {});
      terrain.update({ x: sm.x, z: sm.z }, { x: sm.x, z: sm.z });
      const a = audit(stage, terrain, sm.x, sm.z);
      assert.deepEqual({ missing: a.missing, noTerrain: a.noTerrain }, { missing: 0, noTerrain: 0 }, `at ${f}`);
      assert.deepEqual(a.hover.slice(0, 5), [], `at ${f}: ${a.hover.length} props hover`);
    }
  });
}

test("the renderer prebuilds the terrain out to the full view distance, not a fixed shorter radius", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../render/renderer.mjs", import.meta.url), "utf8");
  assert.match(src, /terrain\.prebuild\(sp\.x, sp\.z, terrain\.viewDist,/);
});

test("renderedHeightAt matches the height field at LOD 0 sample points and is null outside any chunk", () => {
  const { stage, terrain } = make("otago");
  const sp = stage.startPose ?? { x: stage.px[0], z: stage.pz[0] };
  terrain.fillSync(sp.x, sp.z, 300);
  const c = [...terrain.chunks.values()].find((k) => k.lod === 0);
  const x = c.cx * CHUNK_SIZE + 10, z = c.cz * CHUNK_SIZE + 20; // multiples of the 2 m LOD0 spacing
  assert.ok(Math.abs(terrain.renderedHeightAt(x, z) - stage.heightAt(x, z)) < 1e-3);
  assert.equal(terrain.renderedHeightAt(1e7, 1e7), null);
});

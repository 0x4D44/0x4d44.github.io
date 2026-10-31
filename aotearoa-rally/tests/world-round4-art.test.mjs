// WORLD lane, round 4: lazy per-stage textures, the rock material, the prop atlas layout and the new prop geometry
// (sheep with fleece, toetoe and pohutukawa alpha cards, boulder variants).
// WORLD_BREAK=<name> corrupts one input so each check can be seen to fail:
//   nonormal (1), notlazy (2), lazyeager (3), atlasdup (4), rocksingle (5), cell / sheepflat (6, 7), lod1 (8 and 9: a low-LOD build stands in for a bare crown / a faceted rock).
// Test 8 also fails for a real source mutation: scenery.mjs pohutukawa `clusters: 40` -> `clusters: 0` (a bare multi-trunk).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three.module.min.js";
import { loadTextureSet, stageTextures, BIOME_ROCK, LAZY_TEX } from "../render/textures.mjs";
import { ATLAS_CELLS, atlasCell, createRockMaterial } from "../render/materials.mjs";
import { buildPropGeometry } from "../render/scenery.mjs";

const BREAK = process.env.WORLD_BREAK || "";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEX = join(ROOT, "assets/tex");
const manifest = JSON.parse(readFileSync(join(TEX, "manifest.json"), "utf8"));

test("every biome has its own rock photo, with a normal map, at most 300 KB", () => {
  const biomes = ["pasture", "redwood", "coast", "tussock", "alpine", "rainforest"];
  assert.equal(new Set(biomes.map((b) => BIOME_ROCK[b])).size, 6, "six different rocks");
  const man = BREAK === "nonormal" ? { textures: { ...manifest.textures, [BIOME_ROCK.coast]: { ...manifest.textures[BIOME_ROCK.coast], normal: null } } } : manifest;
  for (const b of biomes) {
    const e = man.textures[BIOME_ROCK[b]];
    assert.ok(e, `${BIOME_ROCK[b]} in the manifest`);
    assert.ok(e.normal, `${BIOME_ROCK[b]} has a normal map`);
    assert.equal(e.size, 1024);
    assert.ok(statSync(join(TEX, e.file)).size <= 300 * 1024, `${e.file} <= 300 KB`);
  }
});

test("stageTextures asks only for what the stage uses", () => {
  assert.deepEqual(stageTextures("alpine"), ["rock_cliff"]);
  assert.deepEqual(stageTextures("coast"), ["rock_coastal", "wool_fleece", "foliage_toetoe", "foliage_pohutukawa"]);
  assert.deepEqual(stageTextures("redwood"), ["rock_volcanic"]);
  const lazy = BREAK === "notlazy" ? new Set([...LAZY_TEX].filter((n) => n !== "wool_fleece")) : LAZY_TEX;
  for (const b of Object.keys(BIOME_ROCK)) for (const n of stageTextures(b)) assert.ok(lazy.has(n), `${n} is lazy`);
});

test("loadTextureSet fetches the stage-specific textures only when ensure() asks for them", async () => {
  const asked = [];
  const g = globalThis, saved = { fetch: g.fetch, Image: g.Image };
  g.fetch = async () => ({ ok: true, json: async () => manifest });
  g.Image = class { set src(u) { asked.push(u.split("/").pop()); this.naturalWidth = 8; this.naturalHeight = 8; Promise.resolve().then(() => this.onload?.()); } };
  try {
    const set = await loadTextureSet({}, { baseUrl: "http://x/tex/" });
    if (BREAK === "lazyeager") await set.ensure(["rock_cliff"]); // simulates an eager load of a stage texture
    const lazy = asked.filter((f) => /^(rock_|wool_|foliage_toetoe|foliage_pohutukawa)/.test(f));
    assert.deepEqual(lazy, [], "no stage-specific file fetched at start-up");
    assert.ok(set.isReal("gnd_grass2") && !set.isReal("rock_cliff"));
    await set.ensure(["rock_cliff"]);
    assert.ok(set.isReal("rock_cliff") && !set.isReal("rock_fiord"));
    assert.ok(asked.includes("rock_cliff.jpg") && asked.includes("rock_cliff_n.jpg"));
    const n = asked.length;
    await set.ensure(["rock_cliff"]);
    assert.equal(asked.length, n, "ensure is idempotent");
  } finally { g.fetch = saved.fetch; g.Image = saved.Image; }
});

test("prop atlas cells are unique, inside the sheet, and the new cells exist", () => {
  const cells = BREAK === "atlasdup" ? [...ATLAS_CELLS.slice(0, -1), ATLAS_CELLS[0]] : ATLAS_CELLS;
  assert.equal(new Set(cells).size, cells.length, "cells are unique");
  assert.ok(cells.length <= 20);
  for (const n of ["wool_fleece", "foliage_toetoe", "foliage_pohutukawa", "rock_stage"]) assert.ok(cells.includes(n), n);
  const rects = cells.map(atlasCell);
  for (const [u0, v0, u1, v1] of rects) assert.ok(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1 && u1 > u0 && v1 > v0);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${cells[i]} overlaps ${cells[j]}`);
  }
});

test("rock material maps the photo triplanar in world space with a broad second layer", () => {
  const m = createRockMaterial(THREE, {}, { uWet: { value: 0 }, uSnow: { value: 0 } }, 4);
  assert.equal(m.customProgramCacheKey(), "ar-rock");
  const shader = {
    uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <fog_fragment>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>",
  };
  m.onBeforeCompile(shader);
  if (BREAK === "rocksingle") shader.fragmentShader = shader.fragmentShader.replace(/uRockTile \* 0\.15/g, "uRockTile");
  assert.match(shader.fragmentShader, /vWPos \* uRockTile/);
  assert.match(shader.fragmentShader, /uRockTile \* 0\.15/, "broad low-frequency layer");
  assert.match(shader.fragmentShader, /bwR\.x[\s\S]*bwR\.z[\s\S]*bwR\.y/, "three projections");
  assert.equal(shader.uniforms.uRockTile.value, 0.25, "4 m tile");
});

const uvIn = (g, cell) => {
  const uv = g.attributes.uv.array; let inside = 0;
  for (let i = 0; i < uv.length; i += 2) if (uv[i] >= cell[0] - 1e-4 && uv[i] <= cell[2] + 1e-4 && uv[i + 1] >= cell[1] - 1e-4 && uv[i + 1] <= cell[3] + 1e-4) inside++;
  return inside / (uv.length / 2);
};
const tris = (g) => g.index.count / 3;
const box = (g) => { g.computeBoundingBox(); return g.boundingBox; };

test("sheep: 3D body with fleece, head, ears, four legs; variants differ", () => {
  const want = BREAK === "cell" ? atlasCell("fabric") : atlasCell("wool_fleece");
  const gs = [0, 1, 2].map((v) => buildPropGeometry(THREE, "sheep", v, 0));
  for (const g of gs) {
    assert.ok(tris(g) > 250 && tris(g) < 1800, `sheep triangles ${tris(g)}`);
    assert.ok(uvIn(g, want) > 0.6, "most of the sheep carries the fleece cell");
    const b = box(g); assert.ok(b.max.y > 0.8 && b.max.y < 1.3 && b.max.z - b.min.z > 1.0, "sheep sized like a sheep, longer than tall");
  }
  assert.notEqual(box(gs[0]).max.y.toFixed(3), box(gs[1]).max.y.toFixed(3), "scale varies per variant");
  if (BREAK === "sheepflat") assert.fail("self-test");
});

test("toetoe: 3-5 crossed upright alpha cards from the photographed plant", () => {
  const cell = atlasCell(BREAK === "cell" ? "foliage_flax" : "foliage_toetoe");
  const g0 = buildPropGeometry(THREE, "toetoe", 0, 0), g2 = buildPropGeometry(THREE, "toetoe", 1, 2);
  assert.ok(uvIn(g0, cell) > 0.99);
  const cards = g0.attributes.position.count / 8; // 4 vertices-per-row pairs: 3 rows -> 8 vertices per card
  assert.ok(cards >= 3 && cards <= 5, `cards ${cards}`);
  assert.ok(box(g0).max.y > 2.0 && box(g0).max.x - box(g0).min.x > 1.0, "tall and wide");
  assert.ok(g2.attributes.position.count < g0.attributes.position.count + 1);
});

test("pohutukawa crown is dense cards of the flowering branch mixed with dark-green leaf cards, on a multi-trunk", () => {
  const g = buildPropGeometry(THREE, "pohutukawa", 0, BREAK === "lod1" ? 1 : 0, { foliage: 0x2d5a2c, foliage2: 0x3a6a30 });
  const pcell = atlasCell("foliage_pohutukawa"), bcell = atlasCell("foliage_broadleaf");
  const bloom = uvIn(g, pcell), leaf = uvIn(g, bcell);
  assert.ok(bloom > 0.15 && bloom < 0.7, `flowering share ${bloom.toFixed(2)}`);
  assert.ok(leaf > 0.2, `dark-green leaf share ${leaf.toFixed(2)}`);
  assert.ok(tris(g) > 400 && tris(g) < 9000, `triangles ${tris(g)}`);
});

test("boulders come in 4 smooth variants that differ in size", () => {
  const sizes = new Set();
  for (let v = 0; v < 4; v++) {
    const g = buildPropGeometry(THREE, "boulder", v, BREAK === "lod1" ? 1 : 0);
    assert.ok(tris(g) > 1200 && tris(g) < 6000, `boulder tris ${tris(g)}`);
    const b = box(g); sizes.add((b.max.x - b.min.x).toFixed(2) + "x" + (b.max.y - b.min.y).toFixed(2));
    const n = g.attributes.normal.array; let smooth = 0, cnt = 0;
    for (let i = 0; i < n.length; i += 9) { // consecutive vertices of a face: smooth normals differ little
      const d = n[i] * n[i + 3] + n[i + 1] * n[i + 4] + n[i + 2] * n[i + 5]; smooth += d; cnt++;
    }
    assert.ok(smooth / cnt > 0.9, `mean adjacent-normal dot ${(smooth / cnt).toFixed(2)} (smooth shading)`);
  }
  assert.ok(sizes.size >= 3, `variants differ: ${[...sizes]}`);
});

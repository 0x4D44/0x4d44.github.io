// WORLD lane: prop-kind coverage and the texture manifest (pure file checks, no THREE).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROP_KIND_LIST, PROP_TABLE, propLod, keepProp, QUALITY } from "../render/quality.mjs";
import { PROP_KINDS } from "../core/stage.mjs";
import { ALL_TEX_NAMES } from "../render/textures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("renderer prop list matches the Stage contract exactly", () => {
  assert.deepEqual([...PROP_KIND_LIST].sort(), [...PROP_KINDS].sort());
});

test("every prop kind has a distance table entry and a geometry builder", () => {
  const src = readFileSync(join(ROOT, "render/scenery.mjs"), "utf8");
  const block = src.slice(src.indexOf("const BUILD = {"), src.indexOf("function fallbackBox"));
  for (const k of PROP_KINDS) {
    assert.ok(PROP_TABLE[k], `PROP_TABLE.${k}`);
    assert.match(block, new RegExp(`\\n  ${k}: \\(`), `BUILD.${k}`);
    const t = PROP_TABLE[k];
    assert.ok(t.lods >= 1 && t.lods <= 3);
    assert.ok(t.max > 0);
  }
  assert.equal(Object.keys(PROP_TABLE).length, PROP_KINDS.length, "no stray table entries");
});

test("propLod honours distances and density thinning is deterministic", () => {
  assert.equal(propLod("pine", 10), 0);
  assert.equal(propLod("pine", 150), 1);
  assert.equal(propLod("pine", 500), 2);
  assert.equal(propLod("pine", 5000), -1);
  assert.equal(propLod("sign_chevron", 100), 0, "single-LOD kinds stay LOD0");
  assert.equal(propLod("grass_tuft", 500), -1);
  assert.ok(propLod("pine", 150, 0.5) > propLod("pine", 150, 1), "lower distMul steps down sooner");
  const d = QUALITY.low.density;
  let kept = 0;
  for (let i = 0; i < 4000; i++) { const a = keepProp(i, "tussock", d); assert.equal(a, keepProp(i, "tussock", d)); if (a) kept++; }
  assert.ok(kept > 1200 && kept < 2000, `tussock thinned to ~40%: ${kept}`);
  assert.equal(keepProp(5, "pine", QUALITY.high.density), true);
});

test("texture manifest: every entry exists, size limits, total weight", () => {
  const dir = join(ROOT, "assets/tex");
  const mf = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  assert.equal(mf.version, 1);
  const names = Object.keys(mf.textures);
  assert.ok(names.length >= 15, "enough textures listed");
  let total = 0;
  for (const [name, e] of Object.entries(mf.textures)) {
    const f = join(dir, e.file);
    assert.ok(existsSync(f), `${name}: ${e.file} exists`);
    const sz = statSync(f).size;
    assert.ok(sz <= 600 * 1024, `${e.file} <= 600 KB (${sz})`);
    total += sz;
    assert.ok(e.meters > 0, `${name}.meters`);
    assert.equal(typeof e.alpha, "boolean");
    if (e.normal) {
      assert.ok(existsSync(join(dir, e.normal)), `${name}: normal ${e.normal} exists`);
      const nsz = statSync(join(dir, e.normal)).size;
      assert.ok(nsz <= 600 * 1024);
      total += nsz;
    }
    if (name.startsWith("foliage_")) assert.equal(e.alpha, true, `${name} has alpha`);
  }
  assert.ok(total <= 24 * 1024 * 1024, `total ${total} <= 24 MB`);
  // shipped set must cover what the renderer asks for (missing ones fall back to procedural, so only warn-level: require roads+key ground)
  for (const n of ["road_gravel", "road_dirt", "road_tarmac", "road_mud", "road_snow", "road_pumice", "gnd_grass2", "gnd_leaf", "bark_redwood", "foliage_pine"]) {
    assert.ok(mf.textures[n], `manifest has ${n}`);
  }
  for (const n of ALL_TEX_NAMES) assert.ok(typeof n === "string" && n.length > 3);
  // no orphan files
  const listed = new Set(["manifest.json"]);
  for (const e of Object.values(mf.textures)) { listed.add(e.file); if (e.normal) listed.add(e.normal); }
  const onDisk = (readdirSyncSafe(dir)).filter((f) => !f.startsWith("car-"));
  for (const f of onDisk) assert.ok(listed.has(f), `orphan texture file ${f}`);
});

import { readdirSync } from "node:fs";
function readdirSyncSafe(d) { try { return readdirSync(d); } catch { return []; } }

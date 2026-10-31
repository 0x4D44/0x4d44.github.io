// Round 4 S4: stage determinism is pinned.  Two builds are bit-identical (centreline, props, colliders, pace notes),
// the seeded generators give their golden values, and core/** contains no Math.random or Date.now.
// STAGES_BREAK=imul-noise makes Math.imul (inside rng.mjs hashing and mulberry32) wrong on 0.1 % of calls, the same
// effect as a stray Math.random blend in rng.range, without editing core/rng.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BREAK = process.env.STAGES_BREAK || "";
if (BREAK === "imul-noise") {
  const imul = Math.imul;
  Math.imul = (a, b) => (Math.random() < 0.001 ? imul(a, b) ^ 1 : imul(a, b));
}
const { makeRng, hash2, hashString } = await import("../core/rng.mjs");
const { buildStage, STAGE_IDS } = await import("../core/stage.mjs");

test("seeded generators give their golden values", () => {
  const r = makeRng(12345);
  assert.deepEqual([r.next(), r.next(), r.range(5, 10), r.int(1, 100), r.normal()],
    [0.9797282677609473, 0.3067522644996643, 7.421027107629925, 82, -0.6676634049638013]);
  assert.deepEqual([hash2(3, 7, 11), hash2(-5, 40, 2), hashString("aotearoa")], [0.44454308203421533, 0.5670265825465322, 2174779981]);
});

const digest = (st) => {
  const h = createHash("sha256");
  for (const a of [st.px, st.py, st.pz, st.tx, st.tz, st.slope, st.width, st.curv, st.bank, st.surf, st.verge, st.boundaryLeft, st.boundaryRight]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  h.update(JSON.stringify(st.props));
  h.update(JSON.stringify(st.pacenotes));
  h.update(JSON.stringify(st.hazards));
  const o = [];
  const p = {};
  for (let i = 0; i < 300; i++) { st.sample((i * 97.3) % st.lengthM, p); o.push(st.heightAt(p.x + 11, p.z - 7)); }
  h.update(JSON.stringify(o));
  return h.digest("hex");
};

for (const id of STAGE_IDS) {
  test(`${id}: two builds are identical (centreline, props, colliders, notes, terrain)`, () => {
    const a = buildStage(id), b = buildStage(id);
    assert.equal(digest(a), digest(b));
    assert.equal(a.obstacleCount, b.obstacleCount);
    const q = [], r = [];
    for (let k = 0; k < 50; k++) {
      const s = (k * 79.1) % a.lengthM;
      a.sample(s, {}); const pa = a.sample(s, {});
      assert.equal(JSON.stringify(a.obstaclesNear(pa.x + 6, pa.z, 8, q)), JSON.stringify(b.obstaclesNear(pa.x + 6, pa.z, 8, r)));
    }
  });
}

test("core/** has no Math.random and no Date.now outside comments", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "core");
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith(".mjs") && files.push(p); } };
  walk(dir);
  assert.ok(files.length > 10);
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.ok(!/Math\.random\s*\(/.test(src), `${f} uses Math.random`);
    assert.ok(!/Date\.now\s*\(/.test(src), `${f} uses Date.now`);
  }
});

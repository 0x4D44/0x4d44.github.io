// WORLD round 5: roadside adverts. Placement is pure and deterministic; every ad maps to a real almanac piece; the atlas is in budget.
// WORLD_BREAK=<name> corrupts one input so the check can be seen to fail: clearance (1), badslug (3), uvout (4), bigatlas (5), house (6).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";
import { planAdverts, ADVERT_CLEAR, HOUSE_SHARE } from "../render/adverts.mjs";
import { QUALITY } from "../render/quality.mjs";

const BREAK = process.env.WORLD_BREAK || "";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(readFileSync(join(ROOT, "assets/tex/adverts.json"), "utf8"));
const dataJs = readFileSync(join(ROOT, "../data.js"), "utf8");
const stages = new Map(STAGE_IDS.map((id) => [id, buildStage(id)]));

test("adverts: placement is deterministic and finite for every stage", () => {
  for (const [id, st] of stages) {
    const a = planAdverts(st, meta), b = planAdverts(buildStage(id), meta);
    assert.deepEqual(a, b, `${id} plan repeats`);
    assert.ok(a.length >= 8, `${id}: ${a.length} boards`);
    for (const it of a) for (const k of ["x", "y", "z", "yaw", "s"]) assert.ok(Number.isFinite(it[k]), `${id} ${k}`);
  }
});

test("adverts: boards keep clear of the road, colliders and water, and face the oncoming driver", () => {
  for (const [id, st] of stages) {
    const plan = planAdverts(st, meta);
    for (const it of plan) {
      const pr = st.project(it.x, it.z, it.s, {});
      const e = st.sample(pr.s, {});
      const min = e.width / 2 + ADVERT_CLEAR - 1;
      assert.ok(pr.dist >= (BREAK === "clearance" ? 1e9 : min), `${id} s=${it.s | 0}: ${pr.dist.toFixed(1)} m from the centreline, need ${min.toFixed(1)}`);
      assert.equal(st.obstaclesNear(it.x, it.z, 3).length, 0, `${id} s=${it.s | 0} sits inside a collider`);
      for (const w of st.water ?? []) assert.ok(Math.hypot(it.x - w.x, it.z - w.z) > w.halfLen + w.reach, `${id} on water`);
      const a = st.sample(it.s, {});
      const nx = Math.sin(it.yaw), nz = Math.cos(it.yaw);
      assert.ok(nx * a.tx + nz * a.tz < -0.6, `${id} s=${it.s | 0}: the face looks back along the road (toward the driver)`);
    }
  }
});

test("adverts: about one in four is the house ad, and the rest cover the other pieces", () => {
  let house = 0, n = 0; const seen = new Set();
  for (const st of stages.values()) for (const it of planAdverts(st, meta)) { n++; if (it.ad === (BREAK === "house" ? -1 : 0)) house++; seen.add(it.ad); }
  assert.ok(house / n > HOUSE_SHARE - 0.1 && house / n < HOUSE_SHARE + 0.12, `house share ${(house / n).toFixed(2)} of ${n}`);
  assert.ok(seen.size >= 10, `${seen.size} distinct ads used`);
});

test("adverts: lower tiers show a prefix of the same plan, low shows none", () => {
  assert.equal(QUALITY.low.adverts, 0);
  assert.ok(QUALITY.medium.adverts > 0 && QUALITY.medium.adverts < QUALITY.high.adverts);
  const plan = planAdverts(stages.get("otago"), meta);
  const med = plan.filter((p) => p.rank < QUALITY.medium.adverts).length;
  assert.ok(med >= plan.length * 0.4 && med < plan.length, `medium keeps ${med} of ${plan.length}`);
});

test("adverts: atlas map is inside the atlas, cells do not overlap, slugs are real almanac pieces", () => {
  const [W, H] = meta.size;
  const ads = BREAK === "uvout" ? [...meta.ads.slice(0, -1), { ...meta.ads.at(-1), rect: [W - 10, 0, W + 502, 256] }] : meta.ads;
  for (const a of ads) {
    const [x0, y0, x1, y1] = a.rect;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H && x1 > x0 && y1 > y0, `${a.id} rect inside the atlas`);
  }
  for (let i = 0; i < ads.length; i++) for (let j = i + 1; j < ads.length; j++) {
    const a = ads[i].rect, b = ads[j].rect;
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${ads[i].id} overlaps ${ads[j].id}`);
  }
  assert.equal(ads[0].slug, null, "slot 0 is the house ad");
  for (const a of ads.slice(1)) {
    const slug = BREAK === "badslug" && a === ads[1] ? "no-such-piece" : a.slug;
    const i = dataJs.indexOf(`slug: "${slug}"`);
    assert.ok(i >= 0, `${slug} exists in data.js`);
    assert.match(dataJs.slice(i + 6, i + 3000).split("slug:")[0], /real:\s*true/, `${slug} is real:true`);
  }
});

test("adverts: atlas file exists and stays under the texture cap", () => {
  const size = statSync(join(ROOT, "assets/tex", meta.file)).size + (BREAK === "bigatlas" ? 700 * 1024 : 0);
  assert.ok(size > 50 * 1024 && size <= 600 * 1024, `atlas ${(size / 1024) | 0} KB`);
});

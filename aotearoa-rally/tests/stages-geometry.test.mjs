// Centreline, terrain and surface invariants for all six stages.
// STAGES_BREAK=<name> deliberately corrupts the data so each check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";
import { minSelfApproach } from "../core/spline.mjs";
import { makeRng } from "../core/rng.mjs";
import { SURFACE, isRoadSurface } from "../core/surfaces.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const stages = {};
for (const id of STAGE_IDS) stages[id] = buildStage(id);
if (BREAK === "width") stages.waitomo.width[40] = 3;
if (BREAK === "curv") stages.otago.curv[100] = 0.2;
if (BREAK === "grade") stages.fiordland.slope[50] = 0.2;
if (BREAK === "surf") stages.coromandel.surf[5] = 99;
if (BREAK === "height") { const s = stages.waitomo, h = s.heightAt; s.heightAt = (x, z) => h(x, z) + (x > 500 ? 0.5 : 0); }
if (BREAK === "step") stages.remarkables.px[300] += 5;

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

for (const id of STAGE_IDS) {
  test(`${id}: centreline continuity, curvature, gradient, width`, () => {
    const st = stages[id];
    const { N, ds, px, pz, tx, tz, curv, slope, width, bank } = st;
    assert.equal(ds, 2);
    assert.equal(N, Math.round(st.lengthM / ds) + 1);
    assert.ok(st.lengthM >= 3000 && st.lengthM <= 5500, `length ${st.lengthM}`);
    assert.ok(Math.abs(st.lengthM - st.def.lengthTarget) / st.def.lengthTarget < 0.05, `length ${st.lengthM} vs target ${st.def.lengthTarget}`);
    for (const a of [st.px, st.py, st.pz, st.tx, st.tz, st.slope, st.width, st.curv, st.bank]) {
      assert.ok(a instanceof Float32Array && a.length === N);
    }
    assert.ok(st.surf instanceof Uint8Array && st.surf.length === N && st.verge instanceof Uint8Array && st.verge.length === N);
    let minR = Infinity;
    for (let i = 0; i < N; i++) {
      assert.ok(Math.abs(Math.hypot(tx[i], tz[i]) - 1) < 1e-4, `tangent not unit at ${i}`);
      if (i < N - 1) {
        const d = Math.hypot(px[i + 1] - px[i], pz[i + 1] - pz[i]);
        assert.ok(Math.abs(d - ds) < 0.02, `station spacing ${d} at ${i}`);
        // bearing = atan2(tx, -tz); right turn increases it
        const dh = wrapPi(Math.atan2(tx[i + 1], -tz[i + 1]) - Math.atan2(tx[i], -tz[i]));
        assert.ok(Math.abs(dh - 0.5 * (curv[i] + curv[i + 1]) * ds) < 0.004, `heading step ${dh} vs curvature at ${i}`);
        // chord direction agrees with mean tangent
        const cx = (px[i + 1] - px[i]) / d, cz = (pz[i + 1] - pz[i]) / d;
        assert.ok(cx * (tx[i] + tx[i + 1]) / 2 + cz * (tz[i] + tz[i + 1]) / 2 > 0.99, `chord vs tangent at ${i}`);
      }
      assert.ok(Math.abs(slope[i]) <= 0.12 + 1e-6, `gradient ${slope[i]} at ${i}`);
      assert.ok(width[i] >= 5.5 - 1e-6 && width[i] <= 8 + 1e-6, `width ${width[i]} at ${i}`);
      assert.ok(Math.abs(bank[i]) <= 0.12);
      if (Math.abs(curv[i]) > 1e-6) minR = Math.min(minR, 1 / Math.abs(curv[i]));
      assert.ok(Math.abs(curv[i]) <= 1 / 9 + 1e-4, `corner tighter than 9 m radius at ${i}`);
      // camber on bends: bank has the sign of the curvature
      if (Math.abs(curv[i]) > 0.02) assert.ok(bank[i] * curv[i] > 0, `camber sign at ${i}`);
    }
    // heights finite
    for (let i = 0; i < N; i++) assert.ok(Number.isFinite(st.py[i]));
    assert.ok(minR >= 9, `min radius ${minR}`);
  });

  test(`${id}: no self-approach under 60 m`, () => {
    const st = stages[id];
    const r = minSelfApproach(st, 200);
    assert.ok(r.d >= 60, `roads ${r.i * 2} m and ${r.j * 2} m come within ${r.d.toFixed(1)} m`);
  });

  test(`${id}: surface ids valid and per-station`, () => {
    const st = stages[id];
    const def = st.def;
    for (let i = 0; i < st.N; i++) {
      assert.ok(isRoadSurface(st.surf[i]) || st.surf[i] === SURFACE.WATER, `road surface ${st.surf[i]} at ${i}`);
      assert.ok(st.verge[i] >= 6 && st.verge[i] <= 12, `verge ${st.verge[i]} at ${i}`);
    }
    const used = new Set(st.surf);
    for (const u of used) if (u !== SURFACE.WATER) assert.ok(def.roadSurfaces.includes(u), `${id}: road surface ${u} not listed in def.roadSurfaces`);
  });

  test(`${id}: sample / project round trip`, () => {
    const st = stages[id];
    const rng = makeRng(5);
    const o = {}, p = {};
    for (let k = 0; k < 400; k++) {
      const s = rng.range(0, st.lengthM);
      st.sample(s, o);
      assert.ok(Math.abs(Math.hypot(o.tx, o.tz) - 1) < 1e-6 && Math.abs(o.nx + o.tz) < 1e-9 && Math.abs(o.nz - o.tx) < 1e-9);
      st.project(o.x, o.z, undefined, p);
      assert.ok(Math.abs(p.s - s) < 0.5, `project s ${p.s} vs ${s}`);
      assert.ok(Math.abs(p.lat) < 0.05 && p.dist < 0.05, `lat ${p.lat}`);
      st.project(o.x, o.z, s + rng.range(-30, 30), p);
      assert.ok(Math.abs(p.s - s) < 0.5);
      // offset to the right is positive lat
      const w = st.sample(s, {}).width / 2;
      st.project(o.x + o.nx * 2.5, o.z + o.nz * 2.5, s, p);
      assert.ok(Math.abs(p.lat - 2.5) < 0.15, `right lat ${p.lat}`);
      assert.ok(Number.isFinite(p.y) && Number.isFinite(p.tx));
      assert.ok(w > 2.5);
    }
    // far away still returns valid data
    const far = st.project(st.px[0] + 5000, st.pz[0] - 5000, undefined, {});
    assert.ok(Number.isFinite(far.s) && Number.isFinite(far.lat) && far.dist > 1000);
    assert.equal(st.sample(-5).s, 0);
    assert.equal(st.sample(1e9).s, st.lengthM);
  });

  test(`${id}: heightAt matches the road, is continuous, normals are unit`, () => {
    const st = stages[id];
    const rng = makeRng(9);
    const o = {};
    for (let i = 0; i < st.N; i += 3) {
      assert.ok(Math.abs(st.heightAt(st.px[i], st.pz[i]) - st.py[i]) <= 0.03, `heightAt(centre ${i}) = ${st.heightAt(st.px[i], st.pz[i])} vs ${st.py[i]}`);
    }
    // road cross-section follows the camber
    for (let k = 0; k < 200; k++) {
      const s = rng.range(10, st.lengthM - 10);
      st.sample(s, o);
      const lat = rng.range(-o.width / 2, o.width / 2);
      const h = st.heightAt(o.x + o.nx * lat, o.z + o.nz * lat);
      assert.ok(Math.abs(h - (o.y - lat * Math.tan(o.bank))) < 0.06, `bed height off by ${h - (o.y - lat * Math.tan(o.bank))}`);
    }
    // C0: tiny steps never jump (checked in a band around the road, plus far out)
    let worst = 0;
    for (let k = 0; k < 3000; k++) {
      const s = rng.range(0, st.lengthM);
      st.sample(s, o);
      const lat = rng.range(-70, 70);
      const x = o.x + o.nx * lat, z = o.z + o.nz * lat;
      const a = rng.range(0, Math.PI * 2);
      const e = 0.2;
      const d = Math.abs(st.heightAt(x + Math.cos(a) * e, z + Math.sin(a) * e) - st.heightAt(x, z));
      if (d > worst) worst = d;
    }
    assert.ok(worst < 0.8, `height jumps ${worst} m over 0.2 m`);
    for (let k = 0; k < 300; k++) {
      const s = rng.range(0, st.lengthM);
      st.sample(s, o);
      const lat = rng.range(-120, 120);
      const n = st.normalAt(o.x + o.nx * lat, o.z + o.nz * lat, {});
      assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-6 && n.y > 0.2, `normal ${JSON.stringify(n)}`);
    }
    const n0 = st.normalAt(st.px[100], st.pz[100]);
    assert.ok(n0.y > 0.9);
  });

  test(`${id}: surfaceAt agrees with width, verge and fords`, () => {
    const st = stages[id];
    const rng = makeRng(13);
    const o = {};
    for (let k = 0; k < 300; k++) {
      const s = rng.range(5, st.lengthM - 5);
      st.sample(s, o);
      const i = Math.round(s / st.ds);
      const half = o.width / 2;
      const onRoad = st.surfaceAt(o.x + o.nx * (half - 0.3) * rng.sign(), o.z + o.nz * 0);
      void onRoad;
      const lat = rng.range(-half + 0.2, half - 0.2);
      const got = st.surfaceAt(o.x + o.nx * lat, o.z + o.nz * lat);
      assert.equal(got, st.surf[i], `centre-road surface at s=${s}`);
      const side = rng.sign();
      const vv = st.surfaceAt(o.x + o.nx * side * (half + 3), o.z + o.nz * side * (half + 3));
      assert.ok(vv >= 6 && vv <= 12, `verge surface ${vv}`);
      if (vv !== SURFACE.WATER) assert.equal(vv, st.verge[i]);
    }
    // water in every ford
    for (const w of st.water.filter((q) => q.kind === "ford")) {
      st.sample(w.s, o);
      assert.equal(st.surfaceAt(o.x, o.z), SURFACE.WATER);
      assert.equal(st.surfaceAt(o.x + o.nx * (o.width / 2 + 3), o.z + o.nz * (o.width / 2 + 3)), SURFACE.WATER);
    }
  });

  test(`${id}: boundary, start pose, checkpoints, hazards, minimap, bounds, par`, () => {
    const st = stages[id];
    const b = {};
    for (let s = 0; s <= st.lengthM; s += 25) {
      st.boundaryAt(s, b);
      const half = st.sample(s, {}).width / 2;
      assert.ok(b.left > half + 0.3 && b.right > half + 0.3 && b.left < 60 && b.right < 60, `boundary ${b.left}/${b.right} at ${s}`);
    }
    const sp = st.startPose;
    const p = st.project(sp.x, sp.z, 0, {});
    assert.ok(p.s < 5 && Math.abs(p.lat) < 0.1);
    const h = st.sample(p.s, {}).heading;
    assert.ok(Math.abs(wrapPi(sp.yaw - h)) < 0.01);
    assert.ok(Math.abs(sp.y - st.sample(p.s, {}).y) < 0.05);
    const cp = st.checkpoints;
    assert.equal(cp[0].s, 0);
    assert.equal(cp[cp.length - 1].s, st.lengthM);
    assert.ok(cp.length >= 4);
    for (let i = 1; i < cp.length; i++) assert.ok(cp[i].s > cp[i - 1].s);
    for (let i = 1; i < cp.length - 1; i++) assert.ok(Math.abs(cp[i].s - (st.lengthM * i) / (cp.length - 1)) < 100);
    for (const hz of st.hazards) {
      assert.ok(["jump", "crest", "ford", "bridge", "cattlegrid", "hairpin", "tunnel", "waterfall"].includes(hz.kind));
      assert.ok(hz.s >= 0 && hz.s <= st.lengthM && Number.isFinite(hz.x));
    }
    assert.equal(st.minimap.length, 400);
    const bd = st.bounds;
    for (let i = 0; i < st.N; i += 10) {
      assert.ok(st.px[i] - bd.minX > 250 && bd.maxX - st.px[i] > 250 && st.pz[i] - bd.minZ > 250 && bd.maxZ - st.pz[i] > 250);
      assert.ok(st.py[i] >= bd.minY && st.py[i] <= bd.maxY);
    }
    assert.ok(st.parTime > 60 && st.parTime < 420, `parTime ${st.parTime}`);
    const avg = (st.lengthM / st.parTime) * 3.6;
    assert.ok(avg > 55 && avg < 140, `average speed ${avg} km/h`);
  });
}

test("stage character: required features exist", () => {
  const has = (id, k) => stages[id].hazards.some((h) => h.kind === k);
  assert.ok(has("coromandel", "hairpin") && has("remarkables", "hairpin"));
  assert.ok(has("fiordland", "ford") && has("fiordland", "bridge"));
  assert.ok(has("otago", "jump") && has("waitomo", "cattlegrid") && has("waitomo", "jump"));
  assert.ok(new Set(stages.coromandel.surf).has(SURFACE.TARMAC) && new Set(stages.coromandel.surf).has(SURFACE.GRAVEL));
  assert.ok(new Set(stages.remarkables.surf).has(SURFACE.SNOW));
  assert.ok(new Set(stages.whakarewarewa.surf).has(SURFACE.MUD) && new Set(stages.whakarewarewa.surf).has(SURFACE.PUMICE));
  assert.ok(stages.remarkables.py[stages.remarkables.N - 1] - stages.remarkables.py[0] > 150, "remarkables climbs");
});

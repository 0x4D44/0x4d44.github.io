// Props, obstacles, determinism, detail levels and build time.
// STAGES_BREAK=<name> deliberately corrupts the data so each check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildStage, STAGE_IDS, PROP_KINDS, CORRIDOR_KINDS } from "../core/stage.mjs";
import { makeRng } from "../core/rng.mjs";
import { SURFACE } from "../core/surfaces.mjs";

const BREAK = process.env.STAGES_BREAK || "";
/** CPU milliseconds (user + system) spent in fn. Wall time reads several times high when the box is busy; CPU time does not. */
function cpuMs(fn) {
  const c0 = process.cpuUsage();
  const value = fn();
  const c = process.cpuUsage(c0);
  return { ms: (c.user + c.system) / 1000, value };
}
const times = {};
const stages = {};
for (const id of STAGE_IDS) {
  const r = cpuMs(() => buildStage(id));
  stages[id] = r.value;
  times[id] = r.ms;
}
if (BREAK === "prop-corridor") { const s = stages.otago; s.props.push({ ...s.props.find((p) => p.kind === "tussock"), x: s.px[400], z: s.pz[400] }); }
if (BREAK === "kind") stages.waitomo.props[3].kind = "dragon";
if (BREAK === "obst") { const s = stages.fiordland, f = s.obstaclesNear; s.obstaclesNear = (x, z, r, out) => f(x, z, r * 0.5, out); }

const hashOf = (...arrs) => {
  const h = createHash("sha256");
  for (const a of arrs) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return h.digest("hex");
};
const propsHash = (st) => createHash("sha256").update(JSON.stringify(st.props)).digest("hex");
const roadHash = (st) => hashOf(st.px, st.py, st.pz, st.tx, st.tz, st.slope, st.width, st.curv, st.bank, st.surf, st.verge);

for (const id of STAGE_IDS) {
  test(`${id}: props use the vocabulary and stay out of the corridor`, () => {
    const st = stages[id];
    assert.ok(st.props.length > 4000, `only ${st.props.length} props`);
    const p = {};
    const kinds = new Set(PROP_KINDS);
    const allow = new Set(CORRIDOR_KINDS);
    let tight = 0;
    for (const pr of st.props) {
      assert.ok(kinds.has(pr.kind), `unknown kind ${pr.kind}`);
      for (const k of ["x", "y", "z", "rot", "scale", "r"]) assert.ok(Number.isFinite(pr[k]), `${pr.kind}.${k}`);
      assert.ok(Number.isInteger(pr.variant) && typeof pr.collide === "boolean" && pr.r >= 0);
      assert.ok(pr.scale > 0);
      st.project(pr.x, pr.z, undefined, p);
      const half = st.sample(p.s, {}).width / 2;
      if (!allow.has(pr.kind)) {
        assert.ok(Math.abs(p.lat) > half + 1.2 - 0.05, `${pr.kind} at s=${p.s.toFixed(0)} lat=${p.lat.toFixed(2)} half=${half.toFixed(2)}`);
      }
      if (pr.collide) assert.ok(Math.abs(p.lat) > half - 0.1 || allow.has(pr.kind));
      if (Math.abs(p.lat) < half + 3) tight++;
    }
    assert.ok(tight > 100, "roadside furniture missing");
    // props stand on the ground
    const rng = makeRng(3);
    for (let k = 0; k < 300; k++) {
      const pr = st.props[rng.int(0, st.props.length - 1)];
      if (["bridge_deck", "cattlegrid", "banner_arch", "culvert"].includes(pr.kind)) continue;
      const g = st.heightAt(pr.x, pr.z);
      assert.ok(Math.abs(pr.y - g) < 0.7, `${pr.kind} floats ${pr.y - g}`);
    }
  });

  test(`${id}: start / finish dressing, signs and features`, () => {
    const st = stages[id];
    const near = (kind, s0, d) => st.props.filter((p) => {
      if (p.kind !== kind) return false;
      const q = st.project(p.x, p.z, s0, {});
      return Math.abs(q.s - s0) < d;
    });
    assert.equal(near("banner_arch", 0, 4).length, 1);
    assert.equal(near("banner_arch", st.lengthM, 4).length, 1);
    for (const k of ["spectator_group", "marshal", "tape_barrier"]) {
      assert.ok(near(k, 20, 50).length >= 3, `${k} at start`);
      assert.ok(near(k, st.lengthM - 20, 50).length >= 3, `${k} at finish`);
    }
    assert.ok(st.props.filter((p) => p.kind === "sign_chevron").length >= 12);
    assert.ok(st.props.filter((p) => p.kind === "marker_post").length >= 20);
    const hairpins = st.pacenotes.filter((n) => n.kind === "hairpin");
    for (const h of hairpins) assert.ok(near("spectator_group", h.s + h.length / 2, 80).length >= 1, "hairpin crowd");
    for (const hz of st.hazards.filter((q) => q.kind === "bridge")) assert.ok(near("bridge_deck", hz.s + 8, 20).length === 1);
    for (const hz of st.hazards.filter((q) => q.kind === "cattlegrid")) assert.ok(near("cattlegrid", hz.s, 6).length === 1);
  });

  test(`${id}: obstaclesNear agrees with brute force and reuses out`, () => {
    const st = stages[id];
    const colliders = st.props.filter((p) => p.collide);
    assert.ok(colliders.length > 200);
    const rng = makeRng(77);
    const out = [];
    const o = {};
    let hits = 0;
    for (let k = 0; k < 400; k++) {
      const s = rng.range(0, st.lengthM);
      st.sample(s, o);
      const lat = rng.range(-40, 40);
      const x = o.x + o.nx * lat, z = o.z + o.nz * lat, r = rng.range(0.4, 4);
      const res = st.obstaclesNear(x, z, r, out);
      assert.equal(res, out, "must reuse out");
      const want = colliders.filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= (p.r + r) ** 2);
      assert.equal(res.length, want.length, `count at (${x.toFixed(1)}, ${z.toFixed(1)}) r=${r.toFixed(2)}`);
      const key = (a) => `${a.x.toFixed(3)},${a.z.toFixed(3)}`;
      assert.deepEqual(res.map(key).sort(), want.map(key).sort());
      for (const ob of res) {
        assert.ok(ob.r > 0 && ob.hardness >= 0 && ob.hardness <= 1 && ob.y1 > ob.y0 && typeof ob.kind === "string");
      }
      hits += res.length;
    }
    assert.ok(hits > 20, `random queries found only ${hits} obstacles`);
    assert.ok(Array.isArray(st.obstaclesNear(1e7, 1e7, 5)));
    // a prop's own position always finds it
    const c0 = colliders[Math.floor(colliders.length / 2)];
    assert.ok(st.obstaclesNear(c0.x, c0.z, 0.1, out).some((q) => q.x === c0.x && q.z === c0.z));
  });

  test(`${id}: detail low is a thinner subset with the same road`, () => {
    const hi = stages[id];
    const lo = buildStage(id, { detail: "low" });
    assert.equal(roadHash(lo), roadHash(hi));
    assert.ok(lo.props.length < hi.props.length * 0.55 && lo.props.length > hi.props.length * 0.15, `${lo.props.length} vs ${hi.props.length}`);
    assert.equal(lo.heightAt(hi.px[500] + 30, hi.pz[500]), hi.heightAt(hi.px[500] + 30, hi.pz[500]));
  });

  test(`${id}: deterministic; a different seed changes only the props`, () => {
    const a = stages[id];
    const b = buildStage(id);
    assert.equal(roadHash(a), roadHash(b));
    assert.equal(propsHash(a), propsHash(b));
    assert.equal(JSON.stringify(a.pacenotes), JSON.stringify(b.pacenotes));
    assert.equal(hashOf(a.minimap), hashOf(b.minimap));
    const c = buildStage(id, { seed: 424242 });
    assert.equal(roadHash(a), roadHash(c));
    assert.notEqual(propsHash(a), propsHash(c));
    assert.equal(a.heightAt(a.px[900] + 40, a.pz[900]), c.heightAt(a.px[900] + 40, a.pz[900]));
  });

  test(`${id}: build time under 1500 ms of CPU`, () => {
    const dt = cpuMs(() => buildStage(id)).ms;
    console.log(`# ${id}: build ${dt.toFixed(0)} ms cpu (first ${times[id].toFixed(0)} ms), ${stages[id].props.length} props, ${stages[id].obstacleCount} colliders`);
    assert.ok(dt < 1500 && times[id] < 1500, `build ${dt} / ${times[id]} ms cpu`);
  });
}

// S1: big props (visual radius >= 1.2 m) clear the road edge by 1 m (6 m on a hairpin's inside); colliders by 0.3 m
if (BREAK === "prop-big") { const s = stages.remarkables; s.props.push({ ...s.props.find((p) => p.kind === "schist"), x: s.px[300] + 4, z: s.pz[300] }); }
test("big props and colliders stay clear of the road on every stage", () => {
  const allow = new Set(CORRIDOR_KINDS);
  const p = {}, q = {};
  let bigSeen = 0;
  for (const id of STAGE_IDS) {
    const st = stages[id];
    for (const pr of st.props) {
      if (allow.has(pr.kind)) continue;
      const big = pr.r >= 1.2;
      if (!big && !pr.collide) continue;
      st.project(pr.x, pr.z, undefined, p);
      st.sample(p.s, q);
      const edge = Math.abs(p.lat) - pr.r - q.width / 2;
      const where = `${id} ${pr.kind} r=${pr.r.toFixed(2)} at s=${p.s.toFixed(0)} lat=${p.lat.toFixed(2)}`;
      if (pr.collide) assert.ok(edge >= 0.3 - 1e-3, `collider ${where} reaches ${(-edge).toFixed(2)} m into the road margin`);
      if (big) {
        bigSeen++;
        assert.ok(edge >= 1.0 - 1e-3, `big prop ${where} is only ${edge.toFixed(2)} m off the road edge`);
        if (edge < 6) {
          const i0 = Math.round(p.s / st.ds);
          let k = 0;
          for (let i = Math.max(0, i0 - 10); i <= Math.min(st.N - 1, i0 + 10); i++) if (Math.abs(st.curv[i]) > Math.abs(k)) k = st.curv[i];
          assert.ok(!(Math.abs(k) > 1 / 32 && p.lat * k > 0), `big prop ${where} inside a hairpin, ${edge.toFixed(1)} m from the edge`);
        }
      }
    }
  }
  assert.ok(bigSeen > 50, `only ${bigSeen} big props to check`);
});

// S6: every ford is wet across the whole road (and 6 m beyond each edge)
if (BREAK === "ford-dry") for (const w of stages.otago.water) if (w.kind === "ford") w.halfWidth = 2;
test("every ford holds water across the road, shallow, with the road surface WATER", () => {
  let fords = 0;
  const o = {};
  for (const id of STAGE_IDS) {
    const st = stages[id];
    for (const hz of st.hazards.filter((h) => h.kind === "ford")) {
      fords++;
      const w = st.water.find((q) => q.kind === "ford" && Math.abs(q.s - hz.s) < 3);
      assert.ok(w, `${id}: ford at s=${hz.s} has no water entry`);
      st.sample(hz.s, o);
      assert.ok(w.halfWidth >= o.width / 2 + 6 - 1e-6, `${id}: ford water half width ${w.halfWidth} < road half ${o.width / 2} + 6`);
      assert.ok(w.depth > 0.05 && w.depth <= 0.6, `${id}: ford depth ${w.depth}`);
      // sample the road along the ford: surface is WATER, the plane sits above the road bed by about `depth`
      for (let s = w.s - w.halfLen + 4; s <= w.s + w.halfLen - 4; s += 2) {
        st.sample(s, o);
        for (let lat = -o.width / 2 + 0.3; lat <= o.width / 2 - 0.3; lat += 1) {
          const x = o.x + o.nx * lat, z = o.z + o.nz * lat;
          if (Math.abs(s - w.s) <= (w.halfLen - 3)) {
            assert.equal(st.surfaceAt(x, z), SURFACE.WATER,`${id}: dry road at s=${s} lat=${lat.toFixed(1)}`);
            const over = w.y - st.heightAt(x, z);
            assert.ok(over > 0.02 && over < 0.9, `${id}: water ${over.toFixed(2)} m over the bed at s=${s}`);
          }
        }
      }
    }
  }
  assert.ok(fords >= 4, `${fords} fords`);
});

test("heightAt is fast and allocation-light", () => {
  const st = stages.otago;
  const rng = makeRng(1);
  const pts = [];
  for (let i = 0; i < 2000; i++) pts.push([st.px[rng.int(0, st.N - 1)] + rng.range(-40, 40), st.pz[rng.int(0, st.N - 1)] + rng.range(-40, 40)]);
  const t0 = performance.now();
  let acc = 0;
  for (let rep = 0; rep < 20; rep++) for (const [x, z] of pts) acc += st.heightAt(x, z);
  const per = ((performance.now() - t0) * 1000) / (20 * pts.length);
  console.log(`# heightAt ${per.toFixed(2)} us/call`);
  assert.ok(Number.isFinite(acc));
  assert.ok(per < 25, `heightAt ${per} us`);
});

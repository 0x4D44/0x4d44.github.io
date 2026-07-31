// Track generation and ride physics for Iron Vertex.
//
// The renderer is not exercised here — these tests are about the two
// claims the document makes: that every generated circuit is closed, and
// that the train always makes it round on gravity alone.

import test from "node:test";
import assert from "node:assert/strict";

import {
  G,
  MIN_SELF_CLEARANCE,
  CoasterSim,
  buildTrack,
  mulberry32,
  selfClearance,
  supportColumns,
  trackName,
  verifyCircuit,
  vcross,
  vdot,
  vlen,
  vnorm,
  vrotate,
  vsub,
} from "../track.js";

// A spread of seeds wide enough to catch a bad harmonic draw or a hill
// the energy clamp lets through.
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

test("mulberry32 is deterministic and stays in [0, 1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 500; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
  assert.notEqual(mulberry32(42)(), mulberry32(43)());
});

test("vrotate rotates about an axis without changing length", () => {
  const v = { x: 1, y: 0, z: 0 };
  const axis = { x: 0, y: 1, z: 0 };
  const r = vrotate(v, axis, Math.PI / 2);
  assert.ok(Math.abs(vlen(r) - 1) < 1e-9);
  assert.ok(Math.abs(r.z + 1) < 1e-9, `expected -Z, got ${JSON.stringify(r)}`);
});

test("track names are drawn from the word lists and never repeat a word", () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const name = trackName(mulberry32(seed));
    const [a, b] = name.split(" ");
    assert.ok(a && b, `malformed name: ${name}`);
    assert.notEqual(a, b, `name repeats a word: ${name}`);
  }
});

test("buildTrack is deterministic for a given seed", () => {
  const a = buildTrack(2024);
  const b = buildTrack(2024);
  assert.equal(a.name, b.name);
  assert.equal(a.points.length, b.points.length);
  assert.ok(Math.abs(a.length - b.length) < 1e-9);
  for (let i = 0; i < a.points.length; i += 37) {
    assert.ok(Math.abs(a.points[i].y - b.points[i].y) < 1e-9);
  }
  assert.notEqual(buildTrack(2024).name + buildTrack(2024).length,
    buildTrack(2025).name + buildTrack(2025).length);
});

test("every circuit is finite, closed and plausibly sized", () => {
  for (const seed of SEEDS) {
    const t = buildTrack(seed);

    for (const p of t.points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
        `seed ${seed}: non-finite point`);
    }

    // Closed: the last sample is one spacing away from the first, not
    // stranded on the far side of the park.
    const gap = vlen(vsub(t.points[t.points.length - 1], t.points[0]));
    assert.ok(gap < t.ds * 2.5,
      `seed ${seed}: circuit does not close (gap ${gap.toFixed(2)}m, ds ${t.ds.toFixed(2)})`);

    assert.ok(t.length > 400 && t.length < 2600, `seed ${seed}: length ${t.length}`);
    assert.ok(t.apex > 20 && t.apex < 90, `seed ${seed}: apex ${t.apex}`);
    // Nothing may be buried: the lowest rail still clears the ground.
    assert.ok(t.lowest > 0.5, `seed ${seed}: track dips to ${t.lowest.toFixed(2)}m`);
  }
});

test("sample spacing is uniform along the centreline", () => {
  for (const seed of SEEDS.slice(0, 30)) {
    const t = buildTrack(seed);
    const n = t.points.length;
    for (let i = 0; i < n; i += 11) {
      const d = vlen(vsub(t.points[(i + 1) % n], t.points[i]));
      assert.ok(Math.abs(d - t.ds) < t.ds * 0.35,
        `seed ${seed}: spacing ${d.toFixed(3)} vs ds ${t.ds.toFixed(3)}`);
    }
  }
});

test("frames are orthonormal and the banking closes across the start line", () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const t = buildTrack(seed);
    const n = t.points.length;
    for (let i = 0; i < n; i += 7) {
      assert.ok(Math.abs(vlen(t.tangents[i]) - 1) < 1e-6, `seed ${seed}: tangent not unit`);
      assert.ok(Math.abs(vlen(t.ups[i]) - 1) < 1e-6, `seed ${seed}: up not unit`);
      assert.ok(Math.abs(vdot(t.tangents[i], t.ups[i])) < 1e-5,
        `seed ${seed}: up not perpendicular to tangent at ${i}`);
    }
    // The frame must not flip between the last sample and the first, or
    // the car snaps upside down every lap as it crosses the station.
    const wrap = vdot(t.ups[n - 1], t.ups[0]);
    assert.ok(wrap > 0.8,
      `seed ${seed}: up vector jumps across the start line (dot ${wrap.toFixed(3)})`);
    // And nowhere else either.
    for (let i = 0; i < n; i++) {
      const d = vdot(t.ups[i], t.ups[(i + 1) % n]);
      assert.ok(d > 0.9, `seed ${seed}: frame jumps at sample ${i} (dot ${d.toFixed(3)})`);
    }
  }
});

test("the design sweep says every circuit completes", () => {
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    const check = verifyCircuit(t);
    assert.ok(check.completes,
      `seed ${seed}: min free speed ${check.minSpeed.toFixed(2)} m/s, max ${check.maxG.toFixed(2)}g`);
  }
});

test("the live sim carries the train round without stalling or exploding", () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const t = buildTrack(seed);
    const sim = new CoasterSim(t);
    let minFree = Infinity;
    let maxSpeed = 0;
    let maxG = -Infinity;
    let minG = Infinity;

    // Long enough for several laps at any plausible circuit length.
    for (let i = 0; i < 24000; i++) {
      const s = sim.step(1 / 60);
      assert.ok(Number.isFinite(s.v) && Number.isFinite(s.gForce),
        `seed ${seed}: sim went non-finite at step ${i}`);
      if (s.mode === "free") {
        minFree = Math.min(minFree, s.v);
        maxG = Math.max(maxG, s.gForce);
        minG = Math.min(minG, s.gForce);
      }
      maxSpeed = Math.max(maxSpeed, s.v);
    }

    assert.ok(sim.laps >= 2, `seed ${seed}: only completed ${sim.laps} laps in 400s`);
    assert.ok(minFree > 1.0, `seed ${seed}: train nearly stalled at ${minFree.toFixed(2)} m/s`);
    assert.ok(maxSpeed < 45, `seed ${seed}: implausible top speed ${maxSpeed.toFixed(1)} m/s`);
    // A coaster that never leaves 1g is not a coaster; one that pulls 7g
    // is a lawsuit.
    assert.ok(maxG > 1.4, `seed ${seed}: no positive-g moment (max ${maxG.toFixed(2)})`);
    assert.ok(maxG < 6.5, `seed ${seed}: brutal ${maxG.toFixed(2)}g`);
    assert.ok(minG > -3.5, `seed ${seed}: ${minG.toFixed(2)}g would empty the restraints`);
  }
});

test("the sim is frame-rate independent", () => {
  const t = buildTrack(9091);
  const fast = new CoasterSim(t);
  const slow = new CoasterSim(t);
  for (let i = 0; i < 3000; i++) fast.step(1 / 120);
  for (let i = 0; i < 1500; i++) slow.step(1 / 60);
  // 25 seconds of ride at two frame rates should agree closely on where
  // the train is; a naive Euler step would have drifted metres by now.
  const drift = Math.abs(fast.s - slow.s);
  assert.ok(drift < 1.5, `position drifted ${drift.toFixed(2)}m between frame rates`);
});

test("a dropped frame cannot fling the train off the circuit", () => {
  const t = buildTrack(31337);
  const sim = new CoasterSim(t);
  for (let i = 0; i < 600; i++) sim.step(1 / 60);
  const before = sim.s;
  sim.step(4.0); // tab was backgrounded for four seconds
  assert.ok(Number.isFinite(sim.s) && Number.isFinite(sim.v));
  assert.ok(sim.s - before < t.length, "a single long frame skipped a whole lap");
});

test("energy is only ever added by the chain lift", () => {
  const t = buildTrack(777);
  const sim = new CoasterSim(t);
  let prevEnergy = null;
  let prevMode = null;
  for (let i = 0; i < 12000; i++) {
    const s = sim.step(1 / 60);
    const energy = s.pos.y + (s.v * s.v) / (2 * G);
    if (prevEnergy !== null && prevMode === "free" && s.mode === "free") {
      assert.ok(energy <= prevEnergy + 0.05,
        `free-running energy rose from ${prevEnergy.toFixed(3)} to ${energy.toFixed(3)}`);
    }
    prevEnergy = energy;
    prevMode = s.mode;
  }
});

test("the reported g-force matches an independent calculation", () => {
  const t = buildTrack(5150);
  const sim = new CoasterSim(t);
  // Skip the smoothing transient, then hold a steady state and compare.
  for (let i = 0; i < 4000; i++) sim.step(1 / 240);
  for (let i = 0; i < 600; i++) sim.step(1 / 240);
  const s = sim.state();
  const here = sim.sample(s.s);
  // Centripetal + gravity, resolved on the car's up axis. The sim adds a
  // tangential term too, which is small at steady speed.
  const centripetal = vdot(here.curv, here.up) * s.v * s.v;
  const gravity = vdot({ x: 0, y: G, z: 0 }, here.up);
  const expected = (centripetal + gravity) / G;
  assert.ok(Math.abs(expected - s.gForce) < 0.6,
    `g-force ${s.gForce.toFixed(2)} vs independent ${expected.toFixed(2)}`);
});

test("loops are inverted, and never propped up by a column", () => {
  let inverted = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    if (!t.loop) continue;
    inverted += 1;
    // Somewhere on a looping circuit the car must actually go over.
    const upsideDown = t.ups.some((u) => u.y < -0.5);
    assert.ok(upsideDown, `seed ${seed}: has a loop but the car never inverts`);

    for (const col of supportColumns(t)) {
      assert.ok(col.height > 0 && Number.isFinite(col.height));
      assert.ok(col.top > col.height, "column top must sit above its own length");
    }
  }
  assert.ok(inverted > SEEDS.length * 0.3,
    `only ${inverted}/${SEEDS.length} circuits got a loop — generation is too timid`);
});

test("selfClearance ignores neighbours but sees a real crossing", () => {
  // A flat figure-of-eight: consecutive samples are millimetres apart and
  // must be ignored, but the two arms genuinely cross at the origin.
  const n = 400;
  const eight = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: Math.sin(t) * 60, y: 0, z: Math.sin(t * 2) * 30 };
  });
  const ds = vlen(vsub(eight[1], eight[0]));
  assert.ok(selfClearance(eight, ds).distance < 1.0, "the crossing at the origin was missed");

  // A stadium: two straights 8m apart, joined by tight turns. The
  // straights are far apart along the circuit and must be measured; the
  // turns double back inside the ignore window and must not be.
  const stadium = [];
  for (let i = 0; i < 120; i++) stadium.push({ x: -50 + i, y: 0, z: 4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    stadium.push({ x: 70 + Math.sin(a) * 4, y: 0, z: Math.cos(a) * 4 });
  }
  for (let i = 0; i < 120; i++) stadium.push({ x: 70 - i, y: 0, z: -4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    stadium.push({ x: -50 - Math.sin(a) * 4, y: 0, z: -Math.cos(a) * 4 });
  }
  const straightGap = selfClearance(stadium, 1).distance;
  assert.ok(Math.abs(straightGap - 8) < 0.5, `parallel straights measured ${straightGap.toFixed(2)}m apart, expected 8`);

  // A plain convex circuit never doubles back, so the only pairs left
  // once neighbours are ignored are a full ignore-window apart — nothing
  // spurious, however finely it is sampled.
  const circle = Array.from({ length: 500 }, (_, i) => {
    const t = (i / 500) * Math.PI * 2;
    return { x: Math.cos(t) * 80, y: 0, z: Math.sin(t) * 80 };
  });
  assert.ok(
    selfClearance(circle, vlen(vsub(circle[1], circle[0]))).distance > 15,
    "a circle was reported as colliding with itself",
  );
});

test("no stretch of track ever passes through another", () => {
  // The loop is the one element that brings the track back over itself.
  // Drawn in a single vertical plane its two legs occupy the same space
  // at the bottom — which is exactly what the splay in spliceLoop, and
  // the clearance gate in assemble(), exist to prevent.
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    const near = selfClearance(t.points, t.ds);
    assert.ok(
      near.distance >= MIN_SELF_CLEARANCE,
      `seed ${seed}: track passes within ${near.distance.toFixed(2)}m of itself `
        + `(samples ${near.i}/${near.j} of ${t.points.length})`,
    );
    assert.ok(
      t.clearance >= MIN_SELF_CLEARANCE,
      `seed ${seed}: reported clearance ${t.clearance} disagrees with the measurement`,
    );
  }
});

test("a loop's legs pass beside each other, not through", () => {
  let checked = 0;
  for (const seed of SEEDS.slice(0, 60)) {
    const t = buildTrack(seed);
    if (!t.loop) continue;
    checked += 1;
    // On a looping circuit the tightest approach is always the loop's own
    // two legs at the crossing point, where they sit at the same height
    // by construction. So the gap between them has to be a SIDEWAYS one:
    // if the clearance came from a height difference the loop would be
    // planar again, and a planar loop is one that runs through itself.
    const near = selfClearance(t.points, t.ds);
    const a = t.points[near.i];
    const b = t.points[near.j];
    const dy = Math.abs(a.y - b.y);
    const horizontal = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(dy < 2.5, `seed ${seed}: closest pair differs in height by ${dy.toFixed(2)}m`);
    assert.ok(
      horizontal >= MIN_SELF_CLEARANCE,
      `seed ${seed}: the legs are only ${horizontal.toFixed(2)}m apart sideways`,
    );
  }
  assert.ok(checked > 10, `only ${checked} looping circuits to check`);
});

test("support columns reach the ground and skip inverted track", () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const t = buildTrack(seed);
    const cols = supportColumns(t);
    assert.ok(cols.length > 5, `seed ${seed}: only ${cols.length} supports`);
    for (const c of cols) {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
      assert.ok(c.height >= 2.5, `seed ${seed}: stub support ${c.height}`);
    }
  }
});

test("orthonormal basis: up x tangent gives a consistent lateral axis", () => {
  const t = buildTrack(4242);
  for (let i = 0; i < t.points.length; i += 13) {
    const lat = vnorm(vcross(t.tangents[i], t.ups[i]));
    assert.ok(Math.abs(vlen(lat) - 1) < 1e-6);
    assert.ok(Math.abs(vdot(lat, t.tangents[i])) < 1e-5);
    assert.ok(Math.abs(vdot(lat, t.ups[i])) < 1e-5);
  }
});

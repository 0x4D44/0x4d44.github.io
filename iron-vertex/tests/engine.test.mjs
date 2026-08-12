// Track generation and ride physics for Iron Vertex.
//
// The renderer is not exercised here — these tests are about the two
// claims the document makes: that every generated circuit is closed, and
// that the train always makes it round on gravity alone.

import test from "node:test";
import assert from "node:assert/strict";

import {
  G,
  LAUNCH_ACCEL,
  MIN_SELF_CLEARANCE,
  CoasterSim,
  RideLog,
  buildTrack,
  DIALS,
  mulberry32,
  selfClearance,
  supportColumns,
  trackName,
  tunnelSite,
  hillBump,
  enclosureProfile,
  tuckIn,
  BORE_RADIUS,
  SHED_ROOF,
  SHED_HALF,
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
  // Measured on the TRAIN's centre of mass, not on the front car.
  //
  // A 13.8 m train's potential energy is set by where its middle is, and
  // that is what the sim integrates against — so front-car height plus
  // v^2/2g is no longer a constant, and should not be: the front car
  // rises and falls relative to the train's middle on every crest. This
  // asserts the invariant the integrator actually has.
  const t = buildTrack(777);
  const sim = new CoasterSim(t);
  let prevEnergy = null;
  let prevMode = null;
  for (let i = 0; i < 12000; i++) {
    const s = sim.step(1 / 60);
    const energy = sim.trainCentroidY() + (s.v * s.v) / (2 * G);
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
    // There are now two ways for a circuit to come close to itself, and
    // they are cleared in different directions.
    //
    // The loop's two legs meet at the same height by construction, so
    // their gap has to be a SIDEWAYS one — that is what the splay is
    // for, and if the clearance came from a height difference the loop
    // would be planar again, which is a loop that runs through itself.
    //
    // A figure-eight crosses its own shadow in PLAN, and there the two
    // passes are directly above one another: the clearance is vertical
    // and the horizontal gap is nearly nothing. That is not a fault, it
    // is the layout — one leg goes over the other.
    //
    // So the assertion is a disjunction, and it stays sharp: a planar
    // loop satisfies neither branch, because its legs are at equal
    // height (failing the vertical test) and occupy the same line
    // (failing the sideways one).
    const near = selfClearance(t.points, t.ds);
    const a = t.points[near.i];
    const b = t.points[near.j];
    const dy = Math.abs(a.y - b.y);
    const horizontal = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(
      horizontal >= MIN_SELF_CLEARANCE || dy >= MIN_SELF_CLEARANCE,
      `seed ${seed}: closest pair clears by neither ${horizontal.toFixed(2)}m sideways `
        + `nor ${dy.toFixed(2)}m vertically`,
    );
  }
  assert.ok(checked > 10, `only ${checked} looping circuits to check`);
});

// Contiguous runs of one role, as {start, end} half-open index ranges.
function spansOf(track, role) {
  const n = track.roles.length;
  const spans = [];
  for (let i = 0; i < n; i++) {
    if (track.roles[i] !== role || track.roles[(i - 1 + n) % n] === role) continue;
    let end = i;
    while (track.roles[(end + 1) % n] === role && end - i < n) end += 1;
    spans.push({ start: i, end: end + 1 });
  }
  return spans;
}

test("both kinds of circuit turn up, and both are self-consistent", () => {
  const styles = { chain: 0, launch: 0 };
  let doubleLift = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    assert.ok(t.style === "chain" || t.style === "launch", `seed ${seed}: odd style ${t.style}`);
    styles[t.style] += 1;

    const lifts = spansOf(t, "lift");
    const launches = spansOf(t, "launch");
    if (t.style === "launch") {
      // A launched circuit is launched, not lifted: no chain anywhere.
      assert.equal(lifts.length, 0, `seed ${seed}: a launched circuit grew a chain lift`);
      assert.equal(launches.length, 1, `seed ${seed}: ${launches.length} launch sections`);
      assert.ok(t.launchSpeed > 15 && t.launchSpeed < 40,
        `seed ${seed}: implausible launch speed ${t.launchSpeed.toFixed(1)} m/s`);
      // The launch has to be long enough to reach that speed at 12 m/s².
      const runway = (launches[0].end - launches[0].start) * t.ds;
      const needed = (t.launchSpeed * t.launchSpeed - 16) / (2 * LAUNCH_ACCEL);
      assert.ok(runway > needed * 0.9,
        `seed ${seed}: ${runway.toFixed(0)}m of launch track to reach ${t.launchSpeed.toFixed(1)} m/s (needs ${needed.toFixed(0)}m)`);
    } else {
      assert.equal(launches.length, 0, `seed ${seed}: a lifted circuit grew a launch`);
      assert.ok(lifts.length >= 1 && lifts.length <= 2, `seed ${seed}: ${lifts.length} lifts`);
      assert.equal(t.launchSpeed, 0, `seed ${seed}: a lifted circuit carries a launch speed`);
      if (lifts.length === 2) doubleLift += 1;
    }
    assert.equal(t.lifts, lifts.length, `seed ${seed}: reported lift count disagrees with the roles`);
  }
  assert.ok(styles.launch > SEEDS.length * 0.15,
    `only ${styles.launch}/${SEEDS.length} circuits are launched`);
  assert.ok(styles.chain > SEEDS.length * 0.3,
    `only ${styles.chain}/${SEEDS.length} circuits are lifted`);
  assert.ok(doubleLift > 5, `only ${doubleLift} circuits got a second lift`);
});

test("a launch reaches its speed on the launch track, and nowhere else", () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    if (t.style !== "launch") continue;
    checked += 1;
    const sim = new CoasterSim(t);
    let peakOnLaunch = 0;
    let peakAnywhere = 0;
    let sawLaunch = false;
    for (let i = 0; i < 5000; i++) {
      const s = sim.step(1 / 60);
      peakAnywhere = Math.max(peakAnywhere, s.v);
      if (s.mode === "launch") {
        sawLaunch = true;
        peakOnLaunch = Math.max(peakOnLaunch, s.v);
      }
    }
    assert.ok(sawLaunch, `seed ${seed}: the train never entered the launch`);
    assert.ok(peakOnLaunch > t.launchSpeed * 0.97,
      `seed ${seed}: launch only reached ${peakOnLaunch.toFixed(1)} of ${t.launchSpeed.toFixed(1)} m/s`);
    // Gravity gives the height back, and no more: the fastest the train
    // ever goes is the launch speed, bar a whisker of numerical slack.
    assert.ok(peakAnywhere < t.launchSpeed * 1.05,
      `seed ${seed}: reached ${peakAnywhere.toFixed(1)} m/s from a ${t.launchSpeed.toFixed(1)} m/s launch`);
    if (checked >= 12) break;
  }
  assert.ok(checked > 5, `only ${checked} launched circuits to check`);
});

test("a second lift climbs, and lands the train higher than it found it", () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    const lifts = spansOf(t, "lift");
    if (lifts.length < 2) continue;
    checked += 1;
    for (const lift of lifts) {
      const bottom = t.points[lift.start].y;
      const top = t.points[(lift.end - 1) % t.points.length].y;
      assert.ok(top > bottom + 5,
        `seed ${seed}: a lift only climbed ${(top - bottom).toFixed(1)}m`);
    }
    // The two are genuinely separate stretches of track, not one chain
    // reported twice.
    const gap = lifts[1].start - lifts[0].end;
    assert.ok(gap * t.ds > 40,
      `seed ${seed}: the two lifts are only ${(gap * t.ds).toFixed(0)}m apart`);
  }
  assert.ok(checked > 5, `only ${checked} double-lift circuits to check`);
});

test("a tunnel site is level and low, and buries no track but its own", () => {
  // The park is flat under the coaster — the terrain only starts to roll
  // beyond 170m, and the plan curve stays inside that — so a flat ground
  // function is a faithful stand-in here.
  const flat = () => 0;
  let found = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    const site = tunnelSite(t, flat);
    if (!site) continue;
    found += 1;

    assert.ok(site.span.length * t.ds > 40,
      `seed ${seed}: tunnel only ${(site.span.length * t.ds).toFixed(0)}m long`);
    // Contiguous, and all of it the sort of track you can build a hill on.
    for (let k = 0; k < site.span.length; k++) {
      const i = site.span[k];
      if (k > 0) {
        assert.equal(i, (site.span[k - 1] + 1) % t.points.length,
          `seed ${seed}: the tunnel span is not contiguous`);
      }
      assert.equal(t.roles[i], "free", `seed ${seed}: tunnel over non-free track`);
      assert.ok(t.points[i].y > 0.5 && t.points[i].y < 21,
        `seed ${seed}: tunnel around track at ${t.points[i].y.toFixed(1)}m`);
    }
    // Banking inside the bore is fine — the tube is swept along the
    // frame — but each MOUTH carries a stone arch standing on the
    // hillside, so the ends have to be upright and clear of the grass.
    for (const i of [site.span[0], site.span[site.span.length - 1]]) {
      assert.ok(t.ups[i].y > 0.65,
        `seed ${seed}: a tunnel mouth is banked on its side`);
      assert.ok(t.points[i].y > 3.3,
        `seed ${seed}: a tunnel mouth is only ${t.points[i].y.toFixed(1)}m up`);
    }

    // And nothing outside the span may be inside the hill — not one
    // sample, at any distance along the track.
    //
    // The earlier version of this test exempted a window either side of
    // the portals, reasoning that the approach legitimately runs along
    // the hillside. It does, right up until it curves back INTO the
    // hill, and then the train rides through solid grass a metre past
    // the portal (reported on seed 3102803771). The exemption is what
    // hid it, so there is no exemption. The surface tested is the one
    // the renderer builds, bumps and all — shared, not approximated —
    // and the only track allowed inside it is the track in the bore.
    const inSpan = new Set(site.span);
    const h = site.hill;
    for (let i = 0; i < t.points.length; i++) {
      if (inSpan.has(i)) continue;
      const p = t.points[i];
      const dx = (p.x - h.x) / h.rx;
      const dy = (p.y - h.y) / h.ry;
      const dz = (p.z - h.z) / h.rz;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // The rendered surface in that direction, not the bare ellipsoid.
      const surface = r < 1e-6 ? 1 : hillBump(dx / r, dy / r, dz / r);
      assert.ok(r >= surface,
        `seed ${seed}: sample ${i} is buried inside the tunnel's hill`);
    }
  }
  assert.ok(found > SEEDS.length * 0.4,
    `only ${found}/${SEEDS.length} circuits found anywhere to put a tunnel`);
});

test("the dials move what they say they move, and only that", () => {
  // A dial that quietly does nothing is worse than no dial. Each is
  // swept across its range on a spread of seeds and the FINISHED track
  // is measured — not the keyframes it was asked for.
  const seeds = SEEDS.slice(0, 12);
  const topSpeed = (t) => Math.max(...t.speeds) * 3.6;
  let speedAsks = 0;
  let speedTraded = 0;

  for (const seed of seeds) {
    // Undialled is the reference: the dials must not have changed what
    // a plain seed produces.
    const plain = buildTrack(seed);

    for (const want of [DIALS.length.min, 900, 1500, DIALS.length.max]) {
      const t = buildTrack(seed, { length: want });
      // Within a tenth. The floor is real: a circuit cannot be shrunk
      // past the point where its tightest turn stops being rideable, so
      // the short end is allowed to come up short.
      const slack = want === DIALS.length.min ? 0.25 : 0.10;
      assert.ok(Math.abs(t.length - want) < want * slack,
        `seed ${seed}: asked ${want}m of track, got ${t.length.toFixed(0)}m`);
      assert.equal(t.name, plain.name, `seed ${seed}: length reshuffled the circuit`);
    }

    for (const want of [DIALS.height.min, 40, 60, DIALS.height.max]) {
      const t = buildTrack(seed, { height: want });
      assert.ok(Math.abs(t.apex - want) < want * 0.12,
        `seed ${seed}: asked ${want}m of lift, got ${t.apex.toFixed(0)}m`);
    }

    for (const want of [DIALS.speed.min, 90, 120, DIALS.speed.max]) {
      const t = buildTrack(seed, { speed: want });
      speedAsks += 1;
      // The dial is honoured unless honouring it would cost the circuit
      // its ability to go round — see buildTrack's `speedHonoured`. When
      // the generator makes that trade it says so, and the count below
      // holds it to being rare rather than routine; what it may never do
      // is claim the dial was met and then miss it.
      if (!t.speedHonoured) {
        speedTraded += 1;
        continue;
      }
      assert.ok(Math.abs(topSpeed(t) - want) < Math.max(9, want * 0.10),
        `seed ${seed}: asked ${want}km/h, got ${topSpeed(t).toFixed(0)}km/h`);
    }
  }

  // Trading the speed dial away for a circuit that completes has to stay
  // the rare exception it is documented as being.
  assert.ok(speedTraded <= speedAsks * 0.05,
    `${speedTraded} of ${speedAsks} speed asks were traded away for rideability`);

  // Out-of-range asks are clamped, not obeyed and not thrown at.
  const silly = buildTrack(seeds[0], { length: 40, height: 900, speed: -20 });
  assert.ok(Number.isFinite(silly.length) && silly.length > 300);
  assert.ok(silly.apex < 120);
});

test("a dialled circuit is still a rideable circuit", () => {
  // The dials are allowed to make a coaster the generator would never
  // have drawn. They are not allowed to make one that stalls, or one
  // that would hurt somebody.
  const combos = [
    { length: 420, height: 78, speed: 145 },   // short, tall and fast
    { length: 2400, height: 22, speed: 60 },   // long, low and slow
    { length: 2400, height: 78, speed: 145 },  // everything at once
    { length: 420, height: 22, speed: 60 },    // nothing at all
    { length: 1200, height: 30, speed: 140 },  // low and launched
    { length: 700, height: 70, speed: 70 },    // tall lift, trimmed drop
  ];
  for (const seed of SEEDS.slice(0, 8)) {
    for (const combo of combos) {
      const label = `seed ${seed} ${JSON.stringify(combo)}`;
      const t = buildTrack(seed, combo);
      const check = verifyCircuit(t);
      assert.ok(Number.isFinite(t.length) && t.length > 300, `${label}: degenerate circuit`);
      assert.ok(t.lowest > 0.5, `${label}: track dips to ${t.lowest.toFixed(2)}m`);
      for (const p of t.points) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
          `${label}: non-finite point`);
      }
      const gap = vlen(vsub(t.points[t.points.length - 1], t.points[0]));
      assert.ok(gap < t.ds * 2.5, `${label}: circuit does not close`);
      assert.ok(check.completes,
        `${label}: min free speed ${check.minSpeed.toFixed(2)} m/s, max ${check.maxG.toFixed(2)}g`);
      // And it still clears itself.
      const clear = selfClearance(t.points, t.ds);
      assert.ok(clear.distance > MIN_SELF_CLEARANCE - 0.15,
        `${label}: two stretches of track ${clear.distance.toFixed(2)}m apart`);
    }
  }
});

test("the trailing cameras fit through everything the train fits through", () => {
  // Chase and wing are one rig: an orbit about the middle of the train,
  // which the rider can swing anywhere they like. A camera five metres
  // above the rails is right in the open and fatal under a roof — it
  // flies into the hillside over the portal, and the station shed
  // swallows it whole — so the offset is squeezed against a profile of
  // how enclosed the track is, and the squeezing has to be DONE by the
  // time it reaches the mouth, not started there.
  //
  // The rig is tested at its two homes AND at the extremes a drag can
  // reach, because the whole point of an orbit is that the camera does
  // not stay where it was put.
  const flat = () => 0;
  const rigs = [
    { name: "chase home", yaw: Math.PI, pitch: 0.22, dist: 24.5 },
    { name: "wing home", yaw: 2.30, pitch: 0.33, dist: 11.0 },
    { name: "overhead", yaw: Math.PI, pitch: 1.28, dist: 90 },
    { name: "underneath", yaw: 0, pitch: -0.42, dist: 90 },
    { name: "hard abeam", yaw: Math.PI / 2, pitch: 0, dist: 90 },
    { name: "in close", yaw: -1.1, pitch: 0.9, dist: 6 },
  ];
  const offsets = rigs.map((r) => ({
    name: r.name,
    along: r.dist * Math.cos(r.pitch) * Math.cos(r.yaw),
    side: r.dist * Math.cos(r.pitch) * Math.sin(r.yaw),
    rise: r.dist * Math.sin(r.pitch),
  }));

  let tunnels = 0;
  for (const seed of SEEDS) {
    const t = buildTrack(seed);
    const site = tunnelSite(t, flat);
    const stationIdx = Math.max(0, t.roles.indexOf("station"));
    const profile = enclosureProfile(t, stationIdx, site ? site.span : null);
    assert.equal(profile.length, t.points.length);

    const clears = (i, where, headroom, halfWidth) => {
      const e = profile[i];
      assert.ok(e >= 0 && e <= 1, `seed ${seed}: enclosure ${e} out of range`);
      for (const o of offsets) {
        const fit = tuckIn(o, e);
        assert.ok(Math.abs(fit.rise) < headroom,
          `seed ${seed}: ${o.name} is ${fit.rise.toFixed(2)}m up in the ${where}`);
        assert.ok(Math.abs(fit.side) < halfWidth,
          `seed ${seed}: ${o.name} is ${fit.side.toFixed(2)}m out in the ${where}`);
        // Out AND up at once, so in a round bore it is the diagonal that
        // has to fit.
        if (where === "bore") {
          assert.ok(Math.hypot(fit.side, fit.rise) < headroom,
            `seed ${seed}: ${o.name} clips the bore wall`);
        }
        // Along the track is never squeezed: a bore and a shed are both
        // longer than the camera's reach up them.
        assert.equal(fit.along, o.along);
      }
    };

    if (site) {
      tunnels += 1;
      for (const i of site.span) clears(i, "bore", BORE_RADIUS - 0.5, BORE_RADIUS - 0.5);
    }
    const shed = Math.ceil(SHED_HALF / t.ds);
    for (let k = -shed; k <= shed; k++) {
      const i = ((stationIdx + k) % t.points.length + t.points.length) % t.points.length;
      clears(i, "station", SHED_ROOF - 0.5, 3.9);
    }

    // And in the open it must NOT be tucked in, or the whole point of a
    // camera you can swing is lost.
    const open = profile.reduce((a, b) => Math.min(a, b), 1);
    assert.ok(open < 0.05, `seed ${seed}: the camera never comes back out (min ${open.toFixed(2)})`);
    const free = tuckIn(offsets[0], 0);
    assert.deepEqual(free, { along: offsets[0].along, side: offsets[0].side, rise: offsets[0].rise });
  }
  assert.ok(tunnels > 20, `only ${tunnels} tunnels among ${SEEDS.length} seeds`);
});

test("tuckIn keeps a camera on its own side of the train", () => {
  // Squeezing must never push the camera through the train to the other
  // side, or a wing shot flips from one flank to the other as it enters
  // a tunnel. Sign is preserved at every enclosure.
  for (const side of [-40, -2, -0.4, 0.4, 2, 40]) {
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const fit = tuckIn({ along: 0, side, rise: side }, e);
      assert.equal(Math.sign(fit.side), Math.sign(side),
        `side ${side} flipped at e=${e.toFixed(2)}`);
      assert.ok(Math.abs(fit.side) <= Math.abs(side) + 1e-9,
        `side ${side} grew at e=${e.toFixed(2)}`);
    }
  }
  // A camera already inside the caps is left exactly where it is.
  const tight = { along: 3, side: 1.0, rise: 0.5 };
  assert.deepEqual(tuckIn(tight, 1), tight);
});

test("the back seat is a different ride from the front seat", () => {
  // This is the whole reason enthusiasts queue longer for the back: over
  // a crest the front car is already falling while the back is still
  // being dragged up over it, so the two seats do not feel the same
  // thing at the same moment.
  let biggestDifference = 0;
  let backHarder = 0;
  let frontHarder = 0;
  for (const seed of SEEDS.slice(0, 20)) {
    const t = buildTrack(seed);
    const sim = new CoasterSim(t);
    for (let i = 0; i < 4000; i++) {
      const ride = sim.step(1 / 60);
      if (ride.mode !== "free") continue;
      const front = sim.feltAt(ride.s);
      const back = sim.feltAt(ride.s - 13.8); // four cars behind
      assert.ok(Number.isFinite(front) && Number.isFinite(back),
        `seed ${seed}: non-finite g at a seat`);
      assert.ok(Math.abs(back) < 12, `seed ${seed}: ${back.toFixed(1)}g in the back seat`);
      const difference = back - front;
      biggestDifference = Math.max(biggestDifference, Math.abs(difference));
      if (difference > 0.4) backHarder += 1;
      if (difference < -0.4) frontHarder += 1;
    }
  }
  assert.ok(biggestDifference > 0.5,
    `the seats never differed by more than ${biggestDifference.toFixed(2)}g — they are the same ride`);
  assert.ok(backHarder > 0 && frontHarder > 0,
    "one seat was always the harder one, which is not how a train works");
});

test("feltAt agrees with the sim's own reading at the sim's own position", () => {
  const t = buildTrack(5150);
  const sim = new CoasterSim(t);
  for (let i = 0; i < 3000; i++) sim.step(1 / 240);
  // The sim smooths its readout for legibility, so this is a sanity
  // check that the two are the same calculation, not a bit-match.
  const direct = sim.feltAt(sim.s);
  assert.ok(Math.abs(direct - sim.gForce) < 1.0,
    `feltAt says ${direct.toFixed(2)}g where the sim reads ${sim.gForce.toFixed(2)}g`);
});

test("the ride log times laps and counts airtime", () => {
  const t = buildTrack(20260726);
  const sim = new CoasterSim(t);
  const log = new RideLog();
  const laps = [];
  for (let i = 0; i < 60 * 300 && laps.length < 3; i++) {
    const ride = sim.step(1 / 60);
    const finished = log.sample(ride, 1 / 60);
    if (finished) laps.push(finished);
  }

  assert.ok(laps.length >= 2, `only ${laps.length} laps logged`);
  for (const lap of laps) {
    assert.ok(lap.complete);
    // A lap of a 400-2600m circuit at coaster speeds is tens of seconds.
    assert.ok(lap.seconds > 10 && lap.seconds < 400, `lap took ${lap.seconds.toFixed(1)}s`);
    assert.ok(lap.topSpeed > 10, `top speed only ${lap.topSpeed.toFixed(1)} m/s`);
    assert.ok(lap.maxG > 1, `max g only ${lap.maxG.toFixed(2)}`);
    assert.ok(lap.airtime >= 0 && lap.airtime < lap.seconds,
      `${lap.airtime.toFixed(1)}s of airtime in a ${lap.seconds.toFixed(1)}s lap`);
    assert.ok(lap.maxHeight > 10, `never got above ${lap.maxHeight.toFixed(1)}m`);
  }

  // Laps after the first are the same ride, so they should agree closely.
  const [, second, third] = laps;
  assert.ok(Math.abs(second.seconds - third.seconds) < 2,
    `two laps of the same circuit took ${second.seconds.toFixed(1)}s and ${third.seconds.toFixed(1)}s`);
  assert.ok(log.best.airtime >= second.airtime && log.best.airtime >= third.airtime,
    "the best lap is not the best lap");
  assert.equal(log.last, laps[laps.length - 1]);
});

test("the ride log ignores a zero or backwards frame", () => {
  const log = new RideLog();
  const ride = { v: 20, gForce: 1, mode: "free", height: 5, laps: 0 };
  assert.equal(log.sample(ride, 0), null);
  assert.equal(log.sample(ride, -1), null);
  assert.equal(log.current.seconds, 0, "a zero-length frame still advanced the clock");
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

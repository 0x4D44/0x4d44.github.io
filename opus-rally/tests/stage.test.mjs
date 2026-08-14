import test from "node:test";
import assert from "node:assert/strict";

import {
  STAGE_BOOK,
  stageBookEntry,
  stageFromBook,
  generateStage,
  stageWorld,
  speedProfile,
  stageTime,
  jumpLanding,
  NOMINAL_CAR,
  SEP_NEAR,
} from "../stage.js";
import { surfaceProps } from "../surfaces.js";

const G = 9.81;

// Building the book costs a second or so, and every test below reads the same
// twelve roads, so build it once.
const BOOK = STAGE_BOOK.map((entry) => ({ entry, stage: stageFromBook(entry.id) }));

const TYPED = [
  "s", "x", "y", "z", "tx", "ty", "tz", "nx", "ny", "nz",
  "curvature", "grade", "camber", "halfWidth", "crest", "jump",
  "hillTrend", "surfaceMixT", "designSpeed",
];

function forEachStage(fn) {
  for (const { entry, stage } of BOOK) fn(stage, entry);
}

function segmentDistance(stage, i, px, pz) {
  const ax = stage.x[i];
  const az = stage.z[i];
  const bx = stage.x[i + 1] - ax;
  const bz = stage.z[i + 1] - az;
  const qx = px - ax;
  const qz = pz - az;
  const len2 = bx * bx + bz * bz;
  let t = len2 > 1e-9 ? (qx * bx + qz * bz) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(qx - bx * t, qz - bz * t);
}

// Point-to-segment distance to the whole centreline, by exhaustive search: the
// oracle project() has to match.
function nearestSegment(stage, px, pz) {
  let best = Infinity;
  let index = 0;
  let frac = 0;
  for (let i = 0; i < stage.count - 1; i += 1) {
    const ax = stage.x[i];
    const az = stage.z[i];
    const bx = stage.x[i + 1] - ax;
    const bz = stage.z[i + 1] - az;
    const qx = px - ax;
    const qz = pz - az;
    const len2 = bx * bx + bz * bz;
    let t = len2 > 1e-9 ? (qx * bx + qz * bz) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const ex = qx - bx * t;
    const ez = qz - bz * t;
    const d = ex * ex + ez * ez;
    if (d < best) { best = d; index = i; frac = t; }
  }
  return { index, frac, distance: Math.sqrt(best) };
}

// The same lateral measure stage.js uses: offset from the tangent frame at the
// segment's own sample, not the Euclidean distance to the polyline.
function lateralOf(stage, px, pz, i, f) {
  const cx = stage.x[i] + (stage.x[i + 1] - stage.x[i]) * f;
  const cz = stage.z[i] + (stage.z[i + 1] - stage.z[i]) * f;
  const tx = stage.tx[i];
  const tz = stage.tz[i];
  const inv = 1 / Math.max(1e-6, Math.sqrt(tx * tx + tz * tz));
  return ((px - cx) * tz - (pz - cz) * tx) * inv;
}

// Points spread across the road and well off it, in the tangent frame of a
// sample, so a test can say where it expected the answer to be.
function* probePoints(stage, stride, lats) {
  for (let i = 30; i < stage.count - 30; i += stride) {
    const rl = Math.hypot(stage.tx[i], stage.tz[i]);
    const rx = stage.tz[i] / rl;
    const rz = -stage.tx[i] / rl;
    for (const lat of lats) {
      yield { i, lat, px: stage.x[i] + rx * lat, pz: stage.z[i] + rz * lat };
    }
  }
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

test("the stage book gets the length it advertises", () => {
  forEachStage((stage, entry) => {
    const [lo, hi] = entry.lengthBand;
    assert.ok(
      stage.length >= lo && stage.length <= hi,
      `${entry.id}: ${Math.round(stage.length)} m is outside its declared band ${lo}-${hi}`,
    );
    // The target lives in `params`, not on the entry. A caller who spreads the
    // whole entry into generateStage silently gets the 9 km default instead,
    // which is where the "12.8 km vs 8.9 km" story came from.
    assert.equal(entry.length, undefined, `${entry.id}: the entry itself must not carry a length`);
    assert.ok(
      entry.params.length >= lo && entry.params.length <= hi,
      `${entry.id}: params.length ${entry.params.length} sits outside its own band`,
    );
  });
});

test("stageFromBook and a direct generateStage of the same parameters agree", () => {
  for (const entry of STAGE_BOOK) {
    const direct = generateStage(entry.seed, { ...entry.params, lengthBand: entry.lengthBand });
    const book = stageFromBook(entry.id);
    assert.equal(direct.length, book.length, `${entry.id}: length`);
    assert.equal(direct.count, book.count, `${entry.id}: count`);
    for (let i = 0; i < book.count; i += 1) {
      assert.equal(direct.x[i], book.x[i], `${entry.id}: x[${i}]`);
      assert.equal(direct.curvature[i], book.curvature[i], `${entry.id}: curvature[${i}]`);
    }
  }
});

test("a reverse stage is the forward road driven the other way", () => {
  const mirrors = STAGE_BOOK.filter((e) => e.mirrorOf);
  assert.ok(mirrors.length >= 2, "the book should carry reverse variants to test");

  for (const entry of mirrors) {
    const forwardEntry = stageBookEntry(entry.mirrorOf);
    assert.ok(forwardEntry, `${entry.id}: names a forward twin that exists`);
    // Same seed on purpose: a reverse stage is the road you already know.
    assert.equal(entry.seed, forwardEntry.seed, `${entry.id}: shares its twin's seed`);

    const rev = stageFromBook(entry.id);
    const fwd = stageFromBook(forwardEntry.id);
    const n = fwd.count;

    assert.equal(rev.count, n, `${entry.id}: same sample count`);
    assert.equal(rev.length, fwd.length, `${entry.id}: same length`);
    assert.equal(rev.reverse, true, `${entry.id}: flagged as reverse`);

    for (let i = 0; i < n; i += 1) {
      const j = n - 1 - i;
      assert.equal(rev.x[i], fwd.x[j], `${entry.id}: x[${i}] mirrors`);
      assert.equal(rev.y[i], fwd.y[j], `${entry.id}: y[${i}] mirrors`);
      assert.equal(rev.z[i], fwd.z[j], `${entry.id}: z[${i}] mirrors`);
      assert.equal(rev.halfWidth[i], fwd.halfWidth[j], `${entry.id}: halfWidth[${i}] mirrors`);
      assert.equal(rev.surface[i], fwd.surface[j], `${entry.id}: surface[${i}] mirrors`);
      // Left and right swap with the direction of travel, and so does uphill.
      assert.equal(rev.curvature[i], -fwd.curvature[j], `${entry.id}: curvature[${i}] flips sign`);
      assert.equal(rev.grade[i], -fwd.grade[j], `${entry.id}: grade[${i}] flips sign`);
      assert.equal(rev.camber[i], -fwd.camber[j], `${entry.id}: camber[${i}] flips sign`);
    }

    // Where the forward stage stopped is where this one starts.
    assert.equal(rev.start.x, fwd.finish.x, `${entry.id}: starts at the forward finish (x)`);
    assert.equal(rev.start.y, fwd.finish.y, `${entry.id}: starts at the forward finish (y)`);
    assert.equal(rev.start.z, fwd.finish.z, `${entry.id}: starts at the forward finish (z)`);
    assert.equal(rev.finish.x, fwd.start.x, `${entry.id}: finishes at the forward start (x)`);
    assert.equal(rev.finish.z, fwd.start.z, `${entry.id}: finishes at the forward start (z)`);

    // And it faces back down the road it came up.
    const fwdArrival = Math.atan2(fwd.tx[fwd.count - 1], fwd.tz[fwd.count - 1]);
    let turn = rev.start.yaw - fwdArrival;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    assert.ok(
      Math.abs(Math.abs(turn) - Math.PI) < 0.05,
      `${entry.id}: the reverse start faces ${turn.toFixed(3)} rad from the forward arrival, not about pi`,
    );
  }
});

test("the centreline is parameterised by arc length", () => {
  forEachStage((stage, entry) => {
    let worst = 0;
    for (let i = 1; i < stage.count; i += 1) {
      const d = Math.hypot(
        stage.x[i] - stage.x[i - 1],
        stage.y[i] - stage.y[i - 1],
        stage.z[i] - stage.z[i - 1],
      );
      worst = Math.max(worst, Math.abs(d / stage.step - 1));
    }
    assert.ok(worst < 0.01, `${entry.id}: sample spacing is off by ${(worst * 100).toFixed(2)}%`);
    assert.equal(stage.s[0], 0, `${entry.id}: s starts at zero`);
    assert.equal(stage.length, (stage.count - 1) * stage.step, `${entry.id}: length matches the sample count`);
    for (let i = 1; i < stage.count; i += 1) {
      assert.equal(stage.s[i] - stage.s[i - 1], stage.step, `${entry.id}: s[${i}] advances by one step`);
    }
  });
});

test("tangents are unit and point along the centreline", () => {
  forEachStage((stage, entry) => {
    let worstUnit = 0;
    let worstAlign = 0;
    for (let i = 1; i < stage.count - 1; i += 1) {
      worstUnit = Math.max(worstUnit, Math.abs(Math.hypot(stage.tx[i], stage.ty[i], stage.tz[i]) - 1));
      const dx = stage.x[i + 1] - stage.x[i - 1];
      const dy = stage.y[i + 1] - stage.y[i - 1];
      const dz = stage.z[i + 1] - stage.z[i - 1];
      const len = Math.hypot(dx, dy, dz);
      const dot = (stage.tx[i] * dx + stage.ty[i] * dy + stage.tz[i] * dz) / len;
      worstAlign = Math.max(worstAlign, 1 - dot);
    }
    assert.ok(worstUnit < 1e-5, `${entry.id}: tangent length is off by ${worstUnit}`);
    assert.ok(worstAlign < 1e-3, `${entry.id}: tangent disagrees with the points by ${worstAlign}`);
    // ty is dy/ds by construction, which is exactly the published grade.
    for (let i = 0; i < stage.count; i += 1) {
      assert.ok(Math.abs(stage.ty[i] - stage.grade[i]) < 1e-6, `${entry.id}: ty[${i}] is not the grade`);
    }
  });
});

test("curvature is the heading change the road actually makes", () => {
  forEachStage((stage, entry) => {
    const errors = [];
    let peak = 0;
    for (let i = 0; i < stage.count; i += 1) peak = Math.max(peak, Math.abs(stage.curvature[i]));

    let integrated = 0;
    let drift = 0;
    let residual = 0;
    const h0 = Math.atan2(stage.tx[0], stage.tz[0]);
    for (let i = 1; i < stage.count; i += 1) {
      integrated += (stage.curvature[i] + stage.curvature[i - 1]) * 0.5 * stage.step;
      let heading = Math.atan2(stage.tx[i], stage.tz[i]) - h0;
      while (heading - integrated > Math.PI) heading -= 2 * Math.PI;
      while (integrated - heading > Math.PI) heading += 2 * Math.PI;
      drift = Math.max(drift, Math.abs(heading - integrated));

      if (i >= 2 && i < stage.count - 2) {
        let d = Math.atan2(stage.tx[i + 1], stage.tz[i + 1]) - Math.atan2(stage.tx[i - 1], stage.tz[i - 1]);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const differenced = d / (2 * stage.step);
        errors.push(Math.abs(differenced - stage.curvature[i]));

        // Positions come from a midpoint integrator, which puts the heading at a
        // sample half a curvature-slope behind the analytic one. Differencing it
        // therefore returns k[i] plus exactly these two second differences of the
        // curvature — a term that only shows up on the spiral joins where the
        // slope changes. Subtract it and there is nothing left to explain.
        if (i >= 3 && i < stage.count - 3) {
          const near = stage.curvature[i + 1] - 2 * stage.curvature[i] + stage.curvature[i - 1];
          const far = stage.curvature[i + 2] - 2 * stage.curvature[i] + stage.curvature[i - 2];
          residual = Math.max(residual, Math.abs(differenced - (stage.curvature[i] + near / 4 + far / 16)));
        }
      }
    }
    errors.sort((a, b) => a - b);

    assert.ok(residual < 1e-3, `${entry.id}: heading and curvature disagree by ${residual} beyond the integrator`);
    // Total turn is the integral of curvature: this catches any systematic
    // disagreement over the whole road, where a local check cannot.
    assert.ok(drift < 0.05, `${entry.id}: heading drifts ${drift.toFixed(4)} rad from the curvature integral`);
    assert.ok(percentile(errors, 0.5) < 1e-4, `${entry.id}: median curvature error ${percentile(errors, 0.5)}`);
    const worst = errors[errors.length - 1];
    assert.ok(worst < peak * 0.2, `${entry.id}: worst curvature error ${worst} against a peak of ${peak}`);
  });
});

test("normals are unit, square to the tangent, and carry the camber", () => {
  forEachStage((stage, entry) => {
    let worstUnit = 0;
    let worstSquare = 0;
    let worstCamber = 0;
    for (let i = 0; i < stage.count; i += 1) {
      worstUnit = Math.max(worstUnit, Math.abs(Math.hypot(stage.nx[i], stage.ny[i], stage.nz[i]) - 1));
      worstSquare = Math.max(
        worstSquare,
        Math.abs(stage.nx[i] * stage.tx[i] + stage.ny[i] * stage.ty[i] + stage.nz[i] * stage.tz[i]),
      );
      // Positive camber banks the surface down to the left, so the normal leans
      // left by that angle: its component along horizontal-right is -sin(camber).
      const rl = Math.hypot(stage.tx[i], stage.tz[i]);
      const rx = stage.tz[i] / rl;
      const rz = -stage.tx[i] / rl;
      worstCamber = Math.max(
        worstCamber,
        Math.abs(stage.nx[i] * rx + stage.nz[i] * rz + Math.sin(stage.camber[i])),
      );
      assert.ok(stage.ny[i] > 0.95, `${entry.id}: normal[${i}] is not pointing up`);
    }
    assert.ok(worstUnit < 1e-5, `${entry.id}: normal length is off by ${worstUnit}`);
    assert.ok(worstSquare < 1e-5, `${entry.id}: normal is ${worstSquare} out of square with the tangent`);
    assert.ok(worstCamber < 5e-3, `${entry.id}: normal roll disagrees with camber by ${worstCamber}`);
  });
});

test("the road never comes back within its own width", () => {
  forEachStage((stage, entry) => {
    const cell = 40;
    const buckets = new Map();
    let worst = Infinity;
    let worstPair = null;
    for (let i = 0; i < stage.count; i += 1) {
      const cx = Math.floor(stage.x[i] / cell);
      const cz = Math.floor(stage.z[i] / cell);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          const list = buckets.get(`${cx + ox},${cz + oz}`);
          if (!list) continue;
          for (const j of list) {
            if (i - j < SEP_NEAR.gap) continue;
            const gap = Math.hypot(stage.x[i] - stage.x[j], stage.z[i] - stage.z[j])
              - stage.halfWidth[i] - stage.halfWidth[j];
            if (gap < worst) { worst = gap; worstPair = [j, i]; }
          }
        }
      }
      const key = `${cx},${cz}`;
      let list = buckets.get(key);
      if (!list) { list = []; buckets.set(key, list); }
      list.push(i);
    }
    assert.ok(
      worst > 0,
      `${entry.id}: two stretches of road overlap by ${(-worst).toFixed(1)} m at samples ${worstPair}`,
    );
  });
});

test("the design speed profile is rally-plausible", () => {
  forEachStage((stage, entry) => {
    const v = speedProfile(stage);
    assert.equal(v.length, stage.count, `${entry.id}: profile covers every sample`);

    const seconds = stageTime(stage, v);
    const average = (stage.length / seconds) * 3.6;
    assert.ok(
      average > 70 && average < 170,
      `${entry.id}: average ${average.toFixed(1)} km/h is not a rally stage average`,
    );
    assert.ok(seconds > 120 && seconds < 900, `${entry.id}: stage time ${seconds.toFixed(0)} s`);

    let top = 0;
    let slowest = Infinity;
    for (let i = 0; i < stage.count; i += 1) {
      assert.ok(Number.isFinite(v[i]), `${entry.id}: speed[${i}] is not finite`);
      top = Math.max(top, v[i]);
      slowest = Math.min(slowest, v[i]);
    }
    assert.ok(top > NOMINAL_CAR.topSpeed * 0.9, `${entry.id}: never gets near top speed (${top.toFixed(1)} m/s)`);
    assert.ok(top <= NOMINAL_CAR.topSpeed + 1e-6, `${entry.id}: exceeds the car's top speed`);
    assert.ok(slowest > 4, `${entry.id}: slows to ${slowest.toFixed(1)} m/s, which is a stop, not a corner`);

    // The caller's array is filled rather than a new one returned.
    const reuse = new Float32Array(stage.count);
    assert.equal(speedProfile(stage, NOMINAL_CAR, reuse), reuse, `${entry.id}: speedProfile reuses the out array`);
  });
});

test("no corner asks for more braking than the approach can deliver", () => {
  forEachStage((stage, entry) => {
    const v = speedProfile(stage);
    let worst = 0;
    let at = 0;
    for (let i = 0; i < stage.count - 1; i += 1) {
      const required = (v[i] * v[i] - v[i + 1] * v[i + 1]) / (2 * stage.step);
      if (required <= 0) continue;
      const props = surfaceProps(stage.surface[i]);
      const used = Math.min(
        1,
        (v[i] * v[i] * Math.abs(stage.curvature[i])) / Math.max(1e-3, G * props.gripLat * NOMINAL_CAR.tyreLat),
      );
      // What is left of the friction circle for slowing down, less whatever
      // gravity is doing: a descent takes braking away, a climb hands it back.
      const available = G * props.gripLong * NOMINAL_CAR.tyreLong * Math.sqrt(Math.max(0.04, 1 - used * used))
        + G * stage.grade[i];
      const ratio = required / Math.max(0.5, available);
      if (ratio > worst) { worst = ratio; at = i; }
    }
    assert.ok(
      worst <= 1.05,
      `${entry.id}: at s=${at * stage.step} the profile brakes ${worst.toFixed(2)}x harder than the surface allows`,
    );
  });
});

test("every jump lands somewhere a car survives", () => {
  forEachStage((stage, entry) => {
    const v = speedProfile(stage);
    const jumps = stage.features.filter((f) => f.kind === "jump");
    assert.ok(jumps.length > 0, `${entry.id}: has no jump at all`);
    for (const jump of jumps) {
      const i = Math.max(1, Math.min(stage.count - 2, Math.round(jump.s / stage.step)));
      const land = jumpLanding(stage, i, v[i]);
      assert.ok(Number.isFinite(land.flight) && land.flight > 0, `${entry.id}: jump at ${jump.s} has no flight`);
      assert.ok(land.air > 0 && land.air <= 6, `${entry.id}: jump at ${jump.s} is airborne for ${land.air}s`);
      assert.ok(land.landIndex > i, `${entry.id}: jump at ${jump.s} lands behind its own take-off`);
      // The generator tunes each jump until the closing speed at touchdown is
      // under 10.5 m/s; nothing downstream may quietly undo that.
      assert.ok(
        land.closing < 10.5,
        `${entry.id}: the jump at ${Math.round(jump.s)} m lands at ${land.closing.toFixed(1)} m/s closing`,
      );
    }
  });
});

test("every stage has a hairpin, a crest, a jump and a flat-out section", () => {
  forEachStage((stage, entry) => {
    const kinds = new Map();
    for (const f of stage.features) kinds.set(f.kind, (kinds.get(f.kind) || 0) + 1);
    for (const wanted of ["hairpin", "crest", "jump"]) {
      assert.ok(kinds.get(wanted) > 0, `${entry.id}: no ${wanted} anywhere on the stage`);
    }

    const v = stage.designSpeed;
    let run = 0;
    let longest = 0;
    for (let i = 0; i < stage.count; i += 1) {
      const straight = Math.abs(stage.curvature[i]) < 0.004;
      if (straight && v[i] > NOMINAL_CAR.topSpeed * 0.85) { run += 1; longest = Math.max(longest, run); }
      else run = 0;
    }
    assert.ok(
      longest * stage.step >= 150,
      `${entry.id}: longest flat-out run is only ${longest * stage.step} m`,
    );
  });
});

test("the corner sequence has rhythm rather than a constant wiggle", () => {
  forEachStage((stage, entry) => {
    assert.ok(stage.corners.length >= 15, `${entry.id}: only ${stage.corners.length} corners`);

    let repeat = 1;
    let longest = 1;
    let flips = 0;
    for (let i = 1; i < stage.corners.length; i += 1) {
      repeat = stage.corners[i].kind === stage.corners[i - 1].kind ? repeat + 1 : 1;
      longest = Math.max(longest, repeat);
      if (stage.corners[i].dir !== stage.corners[i - 1].dir) flips += 1;
    }
    assert.ok(longest <= 4, `${entry.id}: ${longest} identical corner primitives in a row`);
    assert.ok(
      flips / (stage.corners.length - 1) > 0.25,
      `${entry.id}: the road only changes direction on ${flips} of ${stage.corners.length - 1} corner joins`,
    );

    const kinds = new Set(stage.corners.map((c) => c.kind));
    const severities = new Set(stage.corners.map((c) => c.severity));
    assert.ok(kinds.size >= 4, `${entry.id}: only ${kinds.size} kinds of corner`);
    assert.ok(severities.size >= 3, `${entry.id}: only ${severities.size} corner severities`);

    let sum = 0;
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < stage.count; i += 1) {
      sum += stage.curvature[i];
      sumSq += stage.curvature[i] * stage.curvature[i];
      peak = Math.max(peak, Math.abs(stage.curvature[i]));
    }
    const sd = Math.sqrt(sumSq / stage.count - (sum / stage.count) ** 2);
    assert.ok(sd > 0.004, `${entry.id}: curvature barely varies (sd ${sd.toFixed(5)})`);
    assert.ok(sd / peak > 0.06, `${entry.id}: curvature is a constant wiggle (sd/peak ${(sd / peak).toFixed(3)})`);
  });
});

test("heightAt is continuous across the road edge", () => {
  forEachStage((stage, entry) => {
    const world = stage.world;
    let worst = 0;
    let at = null;
    for (let i = 30; i < stage.count - 30; i += 9) {
      const rl = Math.hypot(stage.tx[i], stage.tz[i]);
      const rx = stage.tz[i] / rl;
      const rz = -stage.tx[i] / rl;
      const hw = stage.halfWidth[i];
      for (const side of [1, -1]) {
        let previous = null;
        for (let u = -1; u <= 1.0001; u += 0.05) {
          const lat = side * (hw + u);
          const h = world.heightAt(stage.x[i] + rx * lat, stage.z[i] + rz * lat);
          assert.ok(Number.isFinite(h), `${entry.id}: heightAt is not finite at s=${i * stage.step}`);
          if (previous !== null && Math.abs(h - previous) > worst) {
            worst = Math.abs(h - previous);
            at = { s: i * stage.step, side, u: u.toFixed(2) };
          }
          previous = h;
        }
      }
    }
    // A 5 cm transect over the seam: the verge drop is a slope, not a step.
    assert.ok(worst < 0.12, `${entry.id}: the road edge steps ${worst.toFixed(3)} m at ${JSON.stringify(at)}`);
  });
});

// What the ground is allowed to do to a car that runs wide.
//
// A rally stage is banked, cut and ditched, so "gentle" is the wrong bar: the
// bar is the line between a bank a car slides down and a wall or a hole it is
// thrown by. Suspension travel is 0.19-0.23 m over a 2.5 m wheelbase
// (physics.js), so ground steeper than about 1 m per metre is already more than
// the springs can swallow — a car meets it as a bank, loses grip and slides.
// What actually launched cars was not steepness but discontinuity: the field
// used to anchor each point on the *nearest* road sample, so where two passes
// of the road ran near each other the anchor flipped across the medial axis
// between them and the ground stepped by their whole height difference —
// 539 m per metre on northmarch-harrowfen, 196 on kloft-skarvedal, 34 m in a
// single 8 m stride. A wheel that finds the ground 30 m below the chassis in
// one substep levers the car over: that is the cartwheel.
//
// So the bounds below are cliff bounds, not comfort bounds. Anything under them
// is ground a wheel can be given without the chassis being levered; anything
// over them can only be a step. They sit roughly 30% above the worst the
// generator produces, which is set by the road layout rather than the terrain:
// the separation rules let the road climb back over itself 70 m higher only
// 90 m away, and the ground in between has to cover that somehow.
const CLIFF = 5.0;
const NEAR_CLIFF = 3.0;
const NEAR_BAND = 12;

// A bank and a step look the same at one sampling distance and different at
// two: shrink the stride and a bank's height change shrinks with it while a
// step's does not. A millimetre apart, the ground under a wheel must not move
// by more than the suspension has travel to take — 0.19 m on the softest car
// in physics.js. The steepest ground the generator makes is under 4 m per
// metre, which is 4 mm over a millimetre; the old field stepped tens of metres
// with no stride small enough to make it shrink.
const STEP = 0.19;
const FINE = 0.001;

function worstStep(probe, at, span) {
  let worst = 0;
  for (let l = at - span; l <= at + span; l += FINE) {
    worst = Math.max(worst, Math.abs(probe(l + FINE) - probe(l)));
  }
  return worst;
}

test("no ground off the road is a cliff", () => {
  forEachStage((stage, entry) => {
    const world = stage.world;
    const dl = 0.25;
    let worst = 0;
    let worstAt = { i: 20, side: 1, off: 0 };
    let near = 0;
    let nearAt = null;
    for (let i = 20; i < stage.count - 20; i += 97) {
      const rl = Math.hypot(stage.tx[i], stage.tz[i]);
      const rx = stage.tz[i] / rl;
      const rz = -stage.tx[i] / rl;
      const hw = stage.halfWidth[i];
      for (const side of [1, -1]) {
        let previous = null;
        for (let off = 0; off <= 150; off += dl) {
          const lat = side * (hw + off);
          const h = world.heightAt(stage.x[i] + rx * lat, stage.z[i] + rz * lat);
          assert.ok(Number.isFinite(h), `${entry.id}: heightAt is ${h} at s=${i * stage.step} lat ${lat}`);
          if (previous !== null) {
            const grade = Math.abs(h - previous) / dl;
            if (grade > worst) { worst = grade; worstAt = { i, side, off }; }
            if (off <= NEAR_BAND && grade > near) { near = grade; nearAt = { i, side, off }; }
          }
          previous = h;
        }
      }
    }
    assert.ok(
      worst <= CLIFF,
      `${entry.id}: the ground moves ${worst.toFixed(1)} m per metre at ${JSON.stringify(worstAt)}`,
    );
    assert.ok(
      near <= NEAR_CLIFF,
      `${entry.id}: ${NEAR_BAND} m off the road the ground moves ${near.toFixed(1)} m per metre at ${JSON.stringify(nearAt)}`,
    );

    // The steepest place found is a bank, not a step hiding under the stride.
    const { i, side } = worstAt;
    const rl = Math.hypot(stage.tx[i], stage.tz[i]);
    const rx = stage.tz[i] / rl;
    const rz = -stage.tx[i] / rl;
    const probe = (off) => world.heightAt(
      stage.x[i] + rx * side * (stage.halfWidth[i] + off),
      stage.z[i] + rz * side * (stage.halfWidth[i] + off),
    );
    const step = worstStep(probe, worstAt.off, 0.3);
    assert.ok(
      step <= STEP,
      `${entry.id}: the ground at ${JSON.stringify(worstAt)} moves ${step.toFixed(3)} m `
      + `across a millimetre, so it is a step and not a bank`,
    );
  });
});

// The regression the field was rebuilt for. Two passes of the road that come
// near each other with a big height difference between them are exactly where
// the nearest-sample anchor used to flip, and the medial axis between them is
// where the cliff stood.
function stackedPairs(stage, want) {
  const cell = 60;
  const buckets = new Map();
  const found = [];
  for (let i = 0; i < stage.count; i += 2) {
    const cx = Math.floor(stage.x[i] / cell);
    const cz = Math.floor(stage.z[i] / cell);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const list = buckets.get(`${cx + ox},${cz + oz}`);
        if (!list) continue;
        for (const j of list) {
          // Far enough apart along the road to be a different pass of it.
          if (i - j < 60) continue;
          const gap = Math.hypot(stage.x[i] - stage.x[j], stage.z[i] - stage.z[j]);
          if (gap > 90) continue;
          found.push({ i, j, gap, drop: Math.abs(stage.y[i] - stage.y[j]) });
        }
      }
    }
    const key = `${cx},${cz}`;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(i);
  }
  found.sort((a, b) => b.drop - a.drop);
  const out = [];
  for (const pair of found) {
    if (out.some((q) => Math.abs(q.i - pair.i) < 150 || Math.abs(q.j - pair.j) < 150)) continue;
    out.push(pair);
    if (out.length >= want) break;
  }
  return out;
}

test("where the road passes over itself the ground between is a slope, not a step", () => {
  let stacked = 0;
  let deepest = 0;
  forEachStage((stage, entry) => {
    const world = stage.world;
    for (const pair of stackedPairs(stage, 3)) {
      if (pair.drop > 10) stacked += 1;
      deepest = Math.max(deepest, pair.drop);
      const ax = stage.x[pair.i];
      const az = stage.z[pair.i];
      const bx = stage.x[pair.j];
      const bz = stage.z[pair.j];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const probe = (l) => world.heightAt(ax + ux * l, az + uz * l);
      let worst = 0;
      let at = 0;
      let previous = null;
      for (let l = 0; l <= len; l += 0.1) {
        const h = probe(l);
        if (previous !== null) {
          const grade = Math.abs(h - previous) / 0.1;
          if (grade > worst) { worst = grade; at = l; }
        }
        previous = h;
      }
      const label = `${entry.id}: the ${pair.drop.toFixed(0)} m of height between samples `
        + `${pair.j} and ${pair.i}, ${pair.gap.toFixed(0)} m apart`;
      assert.ok(worst <= CLIFF, `${label}, is a ${worst.toFixed(1)} m per metre cliff ${at.toFixed(1)} m along`);

      // And it is still a slope a thousand times closer in.
      const step = worstStep(probe, at, 0.3);
      assert.ok(
        step <= STEP,
        `${label}, moves ${step.toFixed(3)} m across a millimetre ${at.toFixed(1)} m along, so it is a step`,
      );
    }
  });
  // The test only means something if the book actually stacks the road over
  // itself; if a future generator stops doing that, this stops being a test.
  assert.ok(stacked >= 6, `only ${stacked} stacked pairs of road in the whole book`);
  assert.ok(deepest > 30, `the closest passes of road are never more than ${deepest.toFixed(0)} m apart in height`);
});

test("the terrain field leaves the road surface exactly where the stage put it", () => {
  forEachStage((stage, entry) => {
    const world = stage.world;
    let worstCentre = 0;
    let worstEdge = 0;
    for (let i = 6; i < stage.count - 6; i += 11) {
      const rl = Math.hypot(stage.tx[i], stage.tz[i]);
      const rx = stage.tz[i] / rl;
      const rz = -stage.tx[i] / rl;
      worstCentre = Math.max(worstCentre, Math.abs(world.heightAt(stage.x[i], stage.z[i]) - stage.y[i]));
      // Across the road the surface is the centreline plus the camber. Abeam a
      // sample the segment behind can win the projection by a hair, and its
      // tangent plane sits a centimetre or two lower through a tight corner on
      // a steep grade, so this is a few centimetres rather than exact.
      for (const lat of [-0.8, 0.8, -1, 1].map((k) => k * stage.halfWidth[i] * 0.9)) {
        const h = world.heightAt(stage.x[i] + rx * lat, stage.z[i] + rz * lat);
        worstEdge = Math.max(worstEdge, Math.abs(h - (stage.y[i] + lat * Math.sin(stage.camber[i]))));
      }
    }
    assert.equal(worstCentre, 0, `${entry.id}: the centreline is ${worstCentre} m off stage.y`);
    assert.ok(worstEdge < 0.06, `${entry.id}: the road surface is ${worstEdge.toFixed(4)} m off its own camber`);
  });
});

test("heightAt stays inside a terrain build's budget", () => {
  const { stage } = BOOK[0];
  const world = stage.world;
  const b = stage.bounds;
  const side = 320;
  const dx = (b.maxX - b.minX) / side;
  const dz = (b.maxZ - b.minZ) / side;
  let sink = 0;
  for (let j = 0; j < 40; j += 1) for (let i = 0; i < 40; i += 1) sink += world.heightAt(b.minX + i * dx, b.minZ + j * dz);

  const started = process.hrtime.bigint();
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) sink += world.heightAt(b.minX + i * dx, b.minZ + j * dz);
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(Number.isFinite(sink), "the queries produced numbers");
  // meshes.js samples the whole map on a lattice to build the terrain and the
  // physics asks four times a substep, so this is a tripwire for a field that
  // has gone back to walking the road rather than an index of it: a hundred
  // thousand queries take about 250 ms here, and walking every segment in
  // reach without the index takes three times that.
  assert.ok(ms < 1500, `${side * side} lattice heightAt calls took ${ms.toFixed(0)} ms`);
});

test("nothing anywhere in a stage is NaN", () => {
  forEachStage((stage, entry) => {
    for (const field of TYPED) {
      const arr = stage[field];
      assert.equal(arr.length, stage.count, `${entry.id}: ${field} is the wrong length`);
      for (let i = 0; i < arr.length; i += 1) {
        assert.ok(Number.isFinite(arr[i]), `${entry.id}: ${field}[${i}] is ${arr[i]}`);
      }
    }
    for (const item of [...stage.scenery, ...stage.props]) {
      for (const key of ["x", "y", "z", "yaw", "scale"]) {
        assert.ok(Number.isFinite(item[key]), `${entry.id}: ${item.kind}.${key} is ${item[key]}`);
      }
    }
    for (const f of stage.features) {
      assert.ok(Number.isFinite(f.s) && f.s >= 0 && f.s <= stage.length, `${entry.id}: feature ${f.kind} at ${f.s}`);
    }
    for (const v of Object.values(stage.bounds)) assert.ok(Number.isFinite(v), `${entry.id}: bounds`);
    for (const split of stage.splits) {
      assert.ok(split > 0 && split < stage.length, `${entry.id}: split at ${split}`);
    }
  });
});

test("nothing is planted on the road", () => {
  forEachStage((stage, entry) => {
    const out = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
    let worst = Infinity;
    let culprit = null;
    for (const item of stage.scenery) {
      stage.world.project(item.x, item.z, -1, out);
      const clearance = out.lateral - stage.halfWidth[out.index];
      if (clearance < worst) { worst = clearance; culprit = { ...item, s: out.s, lateral: out.lateral }; }
    }
    assert.ok(
      worst > 0,
      `${entry.id}: a ${culprit?.kind} stands ${(-worst).toFixed(2)} m inside the road at s=${Math.round(culprit?.s)}`,
    );
  });
});

test("project finds the same place with a stale hint as with a fresh one", () => {
  forEachStage((stage, entry) => {
    const world = stage.world;
    const fresh = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
    const stale = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
    const cold = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
    let checked = 0;

    for (const { i, lat, px, pz } of probePoints(stage, 97, [0, 2.5, -6, 14, -35, 90])) {
      const truth = nearestSegment(stage, px, pz);
      // Abeam a sample two segments are exactly equidistant, so which index wins
      // is a tie-break, not an answer. Judge the distance instead.
      const slack = truth.distance * 0.005 + 1e-9;

      world.project(px, pz, i * stage.step, fresh);
      world.project(px, pz, (i * stage.step + stage.length * 0.45) % stage.length, stale);
      world.project(px, pz, -1, cold);

      for (const [name, got] of [["fresh", fresh], ["stale", stale], ["cold", cold]]) {
        const excess = segmentDistance(stage, got.index, px, pz) - truth.distance;
        assert.ok(
          excess <= slack,
          `${entry.id}: the ${name} hint landed ${excess.toFixed(4)} m off the nearest road at lat ${lat}`,
        );
        const frac = got.s / stage.step - got.index;
        assert.ok(frac >= -1e-9 && frac <= 1 + 1e-9, `${entry.id}: ${name} hint gave s and index that disagree`);
        assert.ok(
          Math.abs(got.signedLateral - lateralOf(stage, px, pz, got.index, frac)) < 1e-6,
          `${entry.id}: ${name} hint reported an offset its own segment does not support`,
        );
        assert.equal(got.lateral, Math.abs(got.signedLateral), `${entry.id}: lateral is not |signedLateral|`);
        // The offset really is the distance from the road: it is read off the
        // tangent frame, so it comes up a shade short through the tightest
        // corners, but never by enough to misplace a car.
        assert.ok(
          Math.abs(got.lateral - truth.distance) <= truth.distance * 0.03 + 1e-3,
          `${entry.id}: lateral ${got.lateral} against a true distance of ${truth.distance}`,
        );
      }

      // A hint must change how fast the answer is found, never what it is.
      assert.ok(Math.abs(stale.lateral - fresh.lateral) <= slack, `${entry.id}: a stale hint changed the answer`);
      assert.ok(Math.abs(cold.lateral - fresh.lateral) <= slack, `${entry.id}: dropping the hint changed the answer`);
      checked += 1;
    }
    assert.ok(checked > 200, `${entry.id}: only ${checked} projections checked`);
  });
});

test("surfaceAt fills the caller's object and allocates nothing", () => {
  const { stage } = BOOK[0];
  const world = stage.world;
  const mine = {};
  const yours = {};

  const first = world.surfaceAt(stage.x[400], stage.z[400], mine);
  assert.equal(first, mine, "surfaceAt returns the object it was given");
  const props = mine.props;
  assert.ok(props, "surfaceAt fills in a props object");

  for (let i = 0; i < 500; i += 1) {
    const k = 400 + i;
    assert.equal(world.surfaceAt(stage.x[k], stage.z[k] + 4, mine), mine, "still the caller's object");
    assert.equal(mine.props, props, "props is reused rather than reallocated");
  }

  world.surfaceAt(stage.x[400], stage.z[400], yours);
  assert.notEqual(yours.props, mine.props, "two callers must not share one props object");

  for (const key of ["surfaceId", "onRoad", "lateral", "signedLateral", "s", "edgeBlend", "roughness", "ruts"]) {
    assert.ok(key in mine, `surfaceAt fills ${key}`);
  }
  assert.equal(typeof mine.onRoad, "boolean", "onRoad is a boolean");
  assert.equal(mine.props.id, mine.surfaceId, "surfaceId matches the blended props");
  for (const field of ["lateral", "signedLateral", "s", "edgeBlend", "roughness", "ruts"]) {
    assert.ok(Number.isFinite(mine[field]), `${field} is finite`);
  }
  assert.ok(mine.edgeBlend >= 0 && mine.edgeBlend <= 1, "edgeBlend is a fraction");
  assert.ok(mine.ruts >= 0 && mine.ruts <= 1, "ruts is a fraction");

  // On the centreline the car is on the road; a long way off it is not.
  world.surfaceAt(stage.x[400], stage.z[400], mine);
  assert.equal(mine.onRoad, true, "the centreline is on the road");
  assert.ok(mine.lateral < 1e-3, "the centreline has no lateral offset");
  const rl = Math.hypot(stage.tx[400], stage.tz[400]);
  world.surfaceAt(
    stage.x[400] + (stage.tz[400] / rl) * 40,
    stage.z[400] - (stage.tx[400] / rl) * 40,
    mine,
  );
  assert.equal(mine.onRoad, false, "40 m off the centreline is not the road");
  assert.ok(mine.signedLateral > 0, "positive signedLateral is to the right of travel");
});

test("200k world queries with a moving hint stay well inside a frame budget", () => {
  const { stage } = BOOK[0];
  const world = stage.world;
  const projection = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
  const surface = {};
  let s = 0;
  let sink = 0;

  const started = process.hrtime.bigint();
  for (let n = 0; n < 200_000; n += 1) {
    s += 0.5;
    if (s > stage.length - 6) s = 0;
    const i = Math.round(s / stage.step);
    const px = stage.x[i] + 1.5;
    const pz = stage.z[i] - 0.7;
    world.project(px, pz, projection.s, projection);
    world.surfaceAt(px, pz, surface);
    sink += projection.lateral + surface.roughness;
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(Number.isFinite(sink), "the queries produced numbers");
  assert.ok(ms < 3000, `200k project+surfaceAt took ${ms.toFixed(0)} ms`);
});

test("stageWorld hands back the world the stage already carries", () => {
  forEachStage((stage, entry) => {
    assert.equal(stageWorld(stage), stage.world, `${entry.id}: stageWorld reuses the stage's world`);
    assert.equal(stage.world.gravity, G, `${entry.id}: gravity`);
    assert.equal(stage.world.bounds, stage.bounds, `${entry.id}: the world shares the stage bounds`);
    assert.equal(stage.world.sampleAt(0), 0, `${entry.id}: sampleAt(0)`);
    assert.equal(stage.world.sampleAt(stage.length), stage.count - 1, `${entry.id}: sampleAt(length)`);
    assert.equal(stage.world.sampleAt(stage.length * 4), stage.count - 1, `${entry.id}: sampleAt clamps`);
    const normal = { x: 0, y: 0, z: 0 };
    assert.equal(stage.world.normalAt(stage.x[10], stage.z[10], normal), normal, `${entry.id}: normalAt returns out`);
    assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-6, `${entry.id}: normalAt is unit`);
  });
});

test("the same seed builds the same stage, byte for byte", () => {
  for (const entry of STAGE_BOOK) {
    const a = stageFromBook(entry.id);
    const b = stageFromBook(entry.id);
    assert.equal(a.length, b.length, `${entry.id}: length`);
    assert.equal(a.count, b.count, `${entry.id}: count`);
    for (const field of [...TYPED, "surface", "surfaceAlt", "verge"]) {
      const x = a[field];
      const y = b[field];
      assert.equal(x.constructor, y.constructor, `${entry.id}: ${field} type`);
      for (let i = 0; i < x.length; i += 1) {
        if (x[i] !== y[i]) assert.fail(`${entry.id}: ${field}[${i}] drifted ${x[i]} vs ${y[i]}`);
      }
    }
    assert.deepEqual(a.scenery, b.scenery, `${entry.id}: scenery`);
    assert.deepEqual(a.props, b.props, `${entry.id}: props`);
    assert.deepEqual(a.features, b.features, `${entry.id}: features`);
    assert.deepEqual(a.start, b.start, `${entry.id}: start`);
    assert.deepEqual(a.finish, b.finish, `${entry.id}: finish`);
  }
});

test("a seed override builds a different road under the same name", () => {
  const entry = STAGE_BOOK.find((e) => !e.mirrorOf);
  const stock = stageFromBook(entry.id);
  const custom = stageFromBook(entry.id, { seed: "opus-rally/alternate" });
  assert.equal(custom.id, entry.id, "the override keeps the book's identity");
  assert.equal(custom.name, entry.name, "the override keeps the book's name");
  assert.notEqual(custom.seed, stock.seed, "the override reaches the generator");
  let differs = false;
  for (let i = 0; i < Math.min(stock.count, custom.count); i += 1) {
    if (stock.x[i] !== custom.x[i]) { differs = true; break; }
  }
  assert.ok(differs || stock.count !== custom.count, "a different seed must lay a different road");
  // The band still applies: a custom seed is the same stage, not a free-for-all.
  assert.ok(
    custom.length >= entry.lengthBand[0] && custom.length <= entry.lengthBand[1],
    `a re-seeded ${entry.id} is ${Math.round(custom.length)} m, outside ${entry.lengthBand}`,
  );
  assert.equal(stageFromBook(entry.id).length, stock.length, "the stock stage is unchanged by the override");
});

// Eleven of the twelve entries once named a weather that weather.js has never
// heard of ("sea fog", "squalls", "sleet"), so every stage but one threw on
// load and the game was effectively one stage. Nothing caught it because no
// test had ever asked weather.js whether the book's ids were real.
test("every stage in the book names a weather preset that exists", async () => {
  const weather = await import("../weather.js");
  const known = new Set(weather.WEATHER_PRESETS.map((p) => p.id));
  const bad = STAGE_BOOK
    .filter((entry) => !known.has(entry.weather))
    .map((entry) => `${entry.id} -> "${entry.weather}"`);
  assert.deepEqual(bad, [], `unknown weather ids: ${bad.join(", ")}`);
});

test("an unknown weather id costs a stage its sky, not the whole game", async () => {
  const THREE = await import("../three.module.min.js");
  const weather = await import("../weather.js");
  const warned = [];
  const realWarn = console.warn;
  console.warn = (m) => warned.push(String(m));
  try {
    const rig = weather.createWeather(THREE, new THREE.Scene(), "not-a-real-preset");
    assert.ok(rig, "createWeather still returns a rig");
    assert.ok(
      warned.some((m) => /unknown preset/.test(m)),
      `and says so on the console (saw: ${warned.join(" | ") || "nothing"})`,
    );
    weather.disposeWeather(rig);
  } finally {
    console.warn = realWarn;
  }
});

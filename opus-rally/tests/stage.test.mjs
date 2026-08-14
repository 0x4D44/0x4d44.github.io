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

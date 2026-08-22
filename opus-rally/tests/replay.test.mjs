// replay.js is the one module whose whole job is to be exactly reproducible, so
// every bound it promises is asserted here as a number rather than described.
// The car is a stub: a replay that only reproduces itself when physics.js is
// present has not been tested, it has been observed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  RUN_TAG, RUN_VERSION,
  createRecorder, createPlayback, createGhost,
  inputAt, keyframeAt, encodeRun, decodeRun, runByteSize,
  makeReplayInput, makeReplayState,
} from "../replay.js";
import { wrapAngle } from "../mathx.js";

// The bounds the storage layout forces, derived from it rather than measured:
// steer is a signed byte scaled by 127, the pedals an unsigned byte scaled by
// 255, the ghost angles an Int16 over ±π, its clock whole milliseconds and its
// speed centimetres per second. Half a step is the worst a round can be out.
const STEER_Q = 0.5 / 127;          // 3.9370e-3
const PEDAL_Q = 0.5 / 255;          // 1.9608e-3
const ANGLE_Q = Math.PI / 65534;    // 4.7935e-5 rad
const TIME_Q_MS = 0.5;
const SPEED_Q = 0.5 / 100;
// Ghost and keyframe positions are Float32, so their error is relative: one ulp
// is 2^-24 of the value, and an interpolation between two of them adds no more.
const F32_REL = 1.2e-7;

const PLANES = [
  "steer", "throttle", "brake", "handbrake", "clutch", "flags", "gear",
  "keys", "gx", "gy", "gz", "gyaw", "gpitch", "groll", "gt", "gv",
];

function firstNonFinite(arr) {
  for (let i = 0; i < arr.length; i += 1) if (!Number.isFinite(arr[i])) return i;
  return -1;
}

function assertWellFormed(run, label) {
  for (const key of PLANES) {
    const arr = run[key];
    assert.ok(arr && typeof arr.length === "number", `${label}: ${key} is a typed array`);
    assert.equal(firstNonFinite(arr), -1, `${label}: ${key} holds a non-finite value`);
  }
  // A subarray shorter than its declared count is what an out-of-bounds write
  // looks like from the outside: the recorder claimed a slot it never had.
  for (const key of ["steer", "throttle", "brake", "handbrake", "clutch", "flags", "gear"]) {
    assert.equal(run[key].length, run.tickCount, `${label}: ${key} length vs tickCount`);
  }
  assert.equal(run.keys.length, run.keyCount * 16, `${label}: keys length vs keyCount`);
  for (const key of ["gx", "gy", "gz", "gyaw", "gpitch", "groll", "gt", "gv"]) {
    assert.equal(run[key].length, run.ghostCount, `${label}: ${key} length vs ghostCount`);
  }
  for (const key of ["tickCount", "keyCount", "ghostCount", "durationS", "distanceM", "inputHz", "keyStride", "ghostStepM"]) {
    assert.ok(Number.isFinite(run[key]), `${label}: ${key} is ${run[key]}`);
  }
  let last = -1;
  for (let i = 0; i < run.ghostCount; i += 1) {
    assert.ok(run.gt[i] >= last, `${label}: ghost clock ran backwards at slot ${i}`);
    last = run.gt[i];
  }
}

// A car with a shape but no physics: enough state to have a trajectory a bug in
// the input stream would visibly bend, and nothing that could drift on its own.
function stubCar() {
  const car = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, dist: 0 };
  return {
    car,
    step(input, dt) {
      const drive = input.throttle * 8.5 - input.brake * 13 - input.handbrake * 5;
      const accel = drive - 0.004 * car.speed * car.speed - 0.2 * car.speed;
      car.speed = Math.max(0, car.speed + accel * dt);
      const agility = car.speed / (car.speed + 8);
      car.yaw += input.steer * 1.1 * agility * dt;
      car.pitch = -0.02 * accel;
      car.roll = 0.05 * input.steer * agility;
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      car.dist += car.speed * dt;
    },
    getState(out) {
      out.pos.x = car.x; out.pos.y = car.y; out.pos.z = car.z;
      out.vel.x = Math.sin(car.yaw) * car.speed;
      out.vel.y = 0;
      out.vel.z = Math.cos(car.yaw) * car.speed;
      out.yaw = car.yaw; out.pitch = car.pitch; out.roll = car.roll;
      out.yawRate = 0;
      out.speed = car.speed; out.distance = car.dist;
      out.engineRpm = 1000 + car.speed * 90;
      out.gear = 3;
      out.airborne = false;
      return out;
    },
    setState(kf) {
      car.x = kf.pos.x; car.y = kf.pos.y; car.z = kf.pos.z;
      car.yaw = kf.yaw; car.pitch = kf.pitch; car.roll = kf.roll;
      car.speed = kf.speed; car.dist = kf.distance;
    },
  };
}

// Already on the quantiser's grid, so the recorded stream is the driven one bit
// for bit and the replay has to land on the same doubles, not merely near them.
function gridDriver(t, i, out) {
  // `|| 0` because a signed byte has no negative zero: -0 is the one value the
  // stream cannot carry, and it would read as a divergence rather than as the
  // rounding it is.
  out.steer = Math.round(Math.sin(t * 0.8) * 0.72 * 127) / 127 || 0;
  out.throttle = Math.round((0.55 + 0.45 * Math.sin(t * 0.37 + 1)) * 255) / 255;
  out.brake = i % 240 < 30 ? Math.round(0.6 * 255) / 255 : 0;
  out.handbrake = i % 601 < 8 ? 1 : 0;
  out.clutch = 0;
  out.shiftUp = i % 137 === 0;
  out.shiftDown = i % 311 === 0;
  out.gear = 1 + (Math.floor(i / 600) % 5);
  return out;
}

// The same drive off the grid, so what is left is exactly the quantisation.
function rawDriver(t, i, out) {
  out.steer = Math.sin(t * 0.8) * 0.72 + Math.sin(t * 2.7) * 0.19;
  out.throttle = 0.55 + 0.45 * Math.sin(t * 0.37 + 1);
  out.brake = i % 240 < 30 ? 0.61234 : 0;
  out.handbrake = i % 601 < 8 ? 0.87 : 0;
  out.clutch = i % 97 < 5 ? 0.42 : 0;
  out.shiftUp = i % 137 === 0;
  out.shiftDown = i % 311 === 0;
  out.gear = 1 + (Math.floor(i / 600) % 5);
  return out;
}

const HZ = 60;
const TICKS = 40 * HZ;

function recordRun(rig, drive, opts = {}) {
  const hz = opts.inputHz ?? HZ;
  const ticks = opts.ticks ?? TICKS;
  const rec = createRecorder({
    inputHz: hz,
    keyframeHz: opts.keyframeHz ?? 2,
    ghostStepM: opts.ghostStepM ?? 5,
    capacitySeconds: opts.capacitySeconds ?? ticks / hz + 5,
    capacityMetres: opts.capacityMetres ?? 40000,
    meta: opts.meta ?? { stageId: "hovden-ridge", carId: "vantor-gt", label: "unit" },
  });
  const input = makeReplayInput();
  const state = makeReplayState();
  for (let i = 0; i < ticks; i += 1) {
    const t = i / hz;
    drive(t, i, input);
    rig.getState(state);
    rec.sample(t, input, state);
    rig.step(input, 1 / hz);
  }
  rig.getState(state);
  return { rec, run: rec.finish(ticks / hz, state) };
}

test("replay: a grid-exact input stream replays to the identical trajectory", () => {
  const { run } = recordRun(stubCar(), gridDriver);
  assert.equal(run.tickCount, TICKS);
  assertWellFormed(run, "grid run");

  // The truth: the same stub driven directly, tick for tick.
  const truth = stubCar();
  const rig = stubCar();
  const play = createPlayback(run, rig, { correct: false });
  const input = makeReplayInput();

  for (let i = 0; i < TICKS; i += 1) {
    assert.equal(play.step(), true, `playback stopped early at tick ${i}`);
    gridDriver(i / HZ, i, input);
    truth.step(input, 1 / HZ);
    for (const field of ["x", "z", "yaw", "pitch", "roll", "speed", "dist"]) {
      assert.equal(rig.car[field], truth.car[field], `${field} diverged at tick ${i}`);
    }
  }
  assert.equal(play.done, true);
  assert.equal(play.corrections, 0, "an exact replay needs no correction");
  assert.ok(truth.car.dist > 200, `the stub should have driven somewhere, got ${truth.car.dist}`);
  // The only residual is the Float32 keyframe the drift check compares against.
  assert.ok(play.maxDrift < 1e-3, `drift against the keyframe track was ${play.maxDrift}`);
});

test("replay: a run that has been through the codec replays identically", () => {
  const { run } = recordRun(stubCar(), gridDriver);
  const back = decodeRun(encodeRun(run));
  assert.ok(back, "the run should decode");

  const a = stubCar();
  const b = stubCar();
  createPlayback(run, a, { correct: false }).playAll();
  createPlayback(back, b, { correct: false }).playAll();
  for (const field of ["x", "z", "yaw", "pitch", "roll", "speed", "dist"]) {
    assert.equal(b.car[field], a.car[field], `${field} differs after a codec round trip`);
  }
});

test("replay: input quantisation stays inside the byte it is stored in", () => {
  const { run } = recordRun(stubCar(), rawDriver);
  const raw = makeReplayInput();
  const got = makeReplayInput();
  let maxSteer = 0;
  let maxPedal = 0;
  for (let i = 0; i < run.tickCount; i += 1) {
    rawDriver(i / HZ, i, raw);
    inputAt(run, i, got);
    const steerRef = Math.max(-1, Math.min(1, raw.steer));
    maxSteer = Math.max(maxSteer, Math.abs(got.steer - steerRef));
    maxPedal = Math.max(
      maxPedal,
      Math.abs(got.throttle - raw.throttle),
      Math.abs(got.brake - raw.brake),
      Math.abs(got.handbrake - raw.handbrake),
      Math.abs(got.clutch - raw.clutch),
    );
    // Discrete channels are stored whole and must survive whole.
    assert.equal(got.shiftUp, raw.shiftUp, `shiftUp at tick ${i}`);
    assert.equal(got.shiftDown, raw.shiftDown, `shiftDown at tick ${i}`);
    assert.equal(got.gear, raw.gear, `gear at tick ${i}`);
  }
  assert.ok(maxSteer <= STEER_Q + 1e-12, `steer error ${maxSteer} > ${STEER_Q}`);
  assert.ok(maxPedal <= PEDAL_Q + 1e-12, `pedal error ${maxPedal} > ${PEDAL_Q}`);
  // And the scan really did exercise the quantiser rather than sail past it.
  assert.ok(maxSteer > STEER_Q * 0.5, `steer error ${maxSteer} looks too good to be a byte`);
  assert.ok(maxPedal > PEDAL_Q * 0.5, `pedal error ${maxPedal} looks too good to be a byte`);
});

test("replay: an over-range input is clamped, not wrapped", () => {
  const rec = createRecorder({ inputHz: 60, keyframeHz: 1, capacitySeconds: 10 });
  const input = makeReplayInput();
  const state = makeReplayState();
  const pushed = [-9, -1, 0, 1, 9, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, NaN];
  for (let i = 0; i < pushed.length; i += 1) {
    input.steer = pushed[i];
    input.throttle = pushed[i];
    input.brake = pushed[i];
    input.handbrake = pushed[i];
    input.clutch = pushed[i];
    input.gear = pushed[i];
    rec.sample(i / 60, input, state);
  }
  const run = rec.finish(pushed.length / 60, state);
  const got = makeReplayInput();
  for (let i = 0; i < run.tickCount; i += 1) {
    inputAt(run, i, got);
    assert.ok(got.steer >= -1 && got.steer <= 1, `steer ${got.steer} at tick ${i}`);
    for (const ch of ["throttle", "brake", "handbrake", "clutch"]) {
      assert.ok(got[ch] >= 0 && got[ch] <= 1, `${ch} ${got[ch]} at tick ${i}`);
    }
    assert.ok(Number.isFinite(got.gear) && got.gear >= -1 && got.gear <= 12, `gear ${got.gear}`);
  }
  assertWellFormed(run, "clamped run");
});

// Linear in distance on purpose: the recorder interpolates the ghost grid, so
// only a state that interpolates exactly leaves quantisation as the sole error.
// The heading ramps while the path runs straight — no car does that, but this is
// a fixture for the codec, not for the handling model.
const LIN_V = 20;
const linX = (d) => 12 + 0.31 * d;
const linY = (d) => 4 + 0.011 * d;
const linZ = (d) => -7 - 0.42 * d;
const linYaw = (d) => 0.31 + 0.0011 * d;
const linPitch = (d) => -0.18 + 0.00021 * d;
const linRoll = (d) => 0.24 - 0.00017 * d;

function linearCar(speed = LIN_V) {
  const car = { n: 0, d: 0 };
  return {
    car,
    step(_input, dt) {
      car.n += 1;
      car.d = car.n * speed * dt;
    },
    getState(out) {
      out.pos.x = linX(car.d); out.pos.y = linY(car.d); out.pos.z = linZ(car.d);
      out.vel.x = 0; out.vel.y = 0; out.vel.z = 0;
      out.yaw = linYaw(car.d);
      out.pitch = linPitch(car.d);
      out.roll = linRoll(car.d);
      out.yawRate = 0;
      out.speed = speed;
      out.distance = car.d;
      out.engineRpm = 4000;
      out.gear = 4;
      out.airborne = false;
      return out;
    },
    setState() {},
  };
}

function recordLinear(opts = {}) {
  return recordRun(linearCar(opts.speed ?? LIN_V), () => {}, Object.assign({ ticks: 61 * HZ }, opts));
}

test("ghost: the pose it hands back is its recorded pose to within its quantiser", () => {
  const { run } = recordLinear();
  const ghost = createGhost(run);
  assert.ok(ghost.valid);
  assert.ok(ghost.totalM > 1000, `ghost covered only ${ghost.totalM} m`);

  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  let maxPos = 0;
  let maxAngle = 0;
  let maxTime = 0;
  let maxSpeed = 0;
  // Deliberately off the 5 m grid as well as on it, so the interpolation is
  // measured and not just the stored samples.
  for (let m = 0; m <= ghost.totalM; m += 1.7) {
    ghost.poseAtDistance(m, pose);
    for (const [got, want] of [[pose.x, linX(m)], [pose.y, linY(m)], [pose.z, linZ(m)]]) {
      const err = Math.abs(got - want);
      assert.ok(err <= Math.abs(want) * F32_REL + 1e-9, `position error ${err} at ${m} m`);
      maxPos = Math.max(maxPos, err);
    }
    for (const [got, want] of [[pose.yaw, linYaw(m)], [pose.pitch, linPitch(m)], [pose.roll, linRoll(m)]]) {
      const err = Math.abs(wrapAngle(got - want));
      assert.ok(err <= ANGLE_Q * 1.001, `angle error ${err} rad at ${m} m, bound ${ANGLE_Q}`);
      maxAngle = Math.max(maxAngle, err);
    }
    const timeErr = Math.abs(ghost.timeAtDistance(m) - (m / LIN_V) * 1000);
    assert.ok(timeErr <= TIME_Q_MS + 1e-6, `clock error ${timeErr} ms at ${m} m`);
    maxTime = Math.max(maxTime, timeErr);
    const speedErr = Math.abs(ghost.speedAtDistance(m) - LIN_V);
    assert.ok(speedErr <= SPEED_Q + 1e-9, `speed error ${speedErr} m/s at ${m} m`);
    maxSpeed = Math.max(maxSpeed, speedErr);
  }
  // The angle channel is an Int16 and should look like one.
  assert.ok(maxAngle > ANGLE_Q * 0.2, `angle error ${maxAngle} looks too good for an Int16`);
  assert.ok(maxPos < 1e-3, `worst ghost position error ${maxPos} m`);
  assert.ok(maxTime <= TIME_Q_MS + 1e-6);
  assert.ok(maxSpeed <= SPEED_Q + 1e-9);
});

test("ghost: the pose interpolates the short way across the ±π seam", () => {
  const rec = createRecorder({ inputHz: 60, keyframeHz: 1, ghostStepM: 5, capacitySeconds: 30 });
  const input = makeReplayInput();
  const state = makeReplayState();
  // A heading walking through π: 3.0 rad to 3.3 rad over 200 m, wrapped.
  const yawAt = (d) => wrapAngle(3.0 + d * 0.0015);
  for (let i = 0; i <= 600; i += 1) {
    const d = i * (200 / 600);
    state.distance = d;
    state.speed = 20;
    state.pos.x = d; state.pos.y = 0; state.pos.z = 0;
    state.yaw = yawAt(d);
    rec.sample(i / 60, input, state);
  }
  const ghost = createGhost(rec.finish(10, state));
  assert.ok(ghost.valid);
  for (let m = 0; m <= 200; m += 0.9) {
    ghost.poseAtDistance(m, ghost.pose);
    const err = Math.abs(wrapAngle(ghost.pose.yaw - yawAt(m)));
    // A seam handled the long way round shows up as a swing of order π, not as
    // a quantisation error, so the bound is generous and still decisive.
    assert.ok(err < 0.01, `yaw error ${err} rad at ${m} m — the seam was crossed the long way`);
  }
});

test("ghost: the delta at a known distance is the time the player owes", () => {
  const { run } = recordLinear();
  const ghost = createGhost(run);
  const marker = 400;
  const ghostMs = (marker / LIN_V) * 1000;   // 20 000 ms at a flat 20 m/s

  assert.ok(Math.abs(ghost.timeAtDistance(marker) - ghostMs) <= TIME_Q_MS + 1e-6);

  ghost.update(marker, ghostMs);
  assert.ok(Math.abs(ghost.deltaMs) <= 1, `dead level should read zero, got ${ghost.deltaMs}`);
  assert.ok(Math.abs(ghost.gapM) <= 0.05, `dead level gap ${ghost.gapM} m`);
  assert.equal(ghost.distance, marker);
  assert.equal(ghost.finished, false);
  assert.ok(Math.abs(ghost.speed - LIN_V) <= SPEED_Q + 1e-9);

  // Four seconds up at the same point: four seconds of credit, and the ghost is
  // 80 m back down the road because it has only travelled 16 s worth.
  ghost.update(marker, ghostMs - 4000);
  assert.ok(Math.abs(ghost.deltaMs + 4000) <= 1, `faster delta ${ghost.deltaMs}`);
  assert.ok(Math.abs(ghost.gapM + 80) <= 0.05, `faster gap ${ghost.gapM} m, expected -80`);

  // Five seconds down: five seconds owed, ghost 100 m up the road.
  ghost.update(marker, ghostMs + 5000);
  assert.ok(Math.abs(ghost.deltaMs - 5000) <= 1, `slower delta ${ghost.deltaMs}`);
  assert.ok(Math.abs(ghost.gapM - 100) <= 0.05, `slower gap ${ghost.gapM} m, expected +100`);
});

test("ghost: update is monotonic in distance and never leaves the arrays", () => {
  const { run } = recordLinear();
  const ghost = createGhost(run);
  let lastTime = -1;
  let lastDistance = -1;
  for (let m = -200; m <= ghost.totalM + 400; m += 3.3) {
    ghost.update(m, (m / LIN_V) * 1000);
    assert.ok(Number.isFinite(ghost.timeMs) && Number.isFinite(ghost.deltaMs), `non-finite at ${m} m`);
    assert.ok(Number.isFinite(ghost.gapM) && Number.isFinite(ghost.speed), `non-finite at ${m} m`);
    assert.ok(Number.isFinite(ghost.pose.x + ghost.pose.y + ghost.pose.z), `non-finite pose at ${m} m`);
    assert.ok(Number.isFinite(ghost.pose.yaw + ghost.pose.pitch + ghost.pose.roll), `non-finite pose at ${m} m`);
    assert.ok(ghost.timeMs >= lastTime - 1e-9, `ghost clock went backwards at ${m} m`);
    assert.ok(ghost.distance >= lastDistance - 1e-9, `ghost distance went backwards at ${m} m`);
    assert.ok(ghost.distance >= 0 && ghost.distance <= ghost.totalM, `distance ${ghost.distance} escaped the track`);
    lastTime = ghost.timeMs;
    lastDistance = ghost.distance;
  }
  assert.equal(ghost.timeAtDistance(-1e9), ghost.timeAtDistance(0));
  assert.equal(ghost.timeAtDistance(1e9), ghost.timeAtDistance(ghost.totalM));
  assert.equal(ghost.distanceAtTime(-1e9), 0);
  assert.equal(ghost.distanceAtTime(1e9), ghost.totalM);
});

test("ghost: one shorter than the stage clamps instead of running off the end", () => {
  // 120 m of ghost against a player who drives 5 km.
  const { run } = recordLinear({ ticks: 6 * HZ });
  const ghost = createGhost(run);
  assert.ok(ghost.valid);
  assert.ok(ghost.totalM > 100 && ghost.totalM < 130, `short ghost is ${ghost.totalM} m`);

  const endPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  ghost.poseAtDistance(ghost.totalM, endPose);

  for (const m of [ghost.totalM, ghost.totalM + 1, 500, 5000, 1e7]) {
    ghost.update(m, (m / LIN_V) * 1000);
    assert.equal(ghost.distance, ghost.totalM, `distance should stop at the ghost's end, got ${ghost.distance}`);
    assert.equal(ghost.timeMs, ghost.totalMs);
    assert.equal(ghost.pose.x, endPose.x, `pose should hold at the last sample past ${m} m`);
    assert.equal(ghost.pose.yaw, endPose.yaw);
    assert.ok(Number.isFinite(ghost.deltaMs) && Number.isFinite(ghost.gapM));
    assert.ok(ghost.gapM <= 0, `a finished ghost cannot be up the road at ${m} m`);
  }
  assert.equal(ghost.finished, true);

  // The smallest ghost that is still a ghost: two samples, so i+1 is the last
  // index there is and the interpolator has nowhere left to reach.
  const tiny = createGhost(recordLinear({ ticks: Math.ceil((6 / LIN_V) * HZ) }).run);
  assert.equal(tiny.count, 2, `expected a two-sample ghost, got ${tiny.count}`);
  assert.equal(tiny.valid, true);
  for (let m = -50; m <= 50; m += 0.37) {
    tiny.update(m, m * 50);
    assert.ok(Number.isFinite(tiny.pose.x + tiny.pose.yaw + tiny.timeMs + tiny.gapM), `non-finite at ${m} m`);
  }

  // And a run too short to have a second sample is simply not a ghost.
  const stillborn = createGhost(recordLinear({ ticks: 2 }).run);
  assert.equal(stillborn.valid, false);
  stillborn.update(500, 60000);
  assert.ok(Number.isFinite(stillborn.deltaMs + stillborn.gapM + stillborn.pose.x));

  // Nor is a ghost built from nothing at all.
  for (const source of [null, undefined, "", "not a run", "OR1.####"]) {
    const dud = createGhost(source);
    assert.equal(dud.valid, false, `${String(source)} should not make a ghost`);
    dud.update(100, 1000);
    assert.ok(Number.isFinite(dud.deltaMs + dud.gapM + dud.pose.x + dud.timeMs));
  }
});

test("codec: encodeRun and decodeRun round-trip a run exactly", () => {
  const { run } = recordRun(stubCar(), rawDriver);
  const text = encodeRun(run);
  assert.ok(text.startsWith(RUN_TAG));
  assert.equal(RUN_TAG, "OR1.");
  assert.equal(RUN_VERSION, 1);

  const back = decodeRun(text);
  assert.ok(back, "a run this module wrote must decode");
  for (const key of ["tickCount", "keyCount", "ghostCount", "inputHz", "keyframeHz", "keyStride", "ghostStepM"]) {
    assert.equal(back[key], run[key], `scalar ${key}`);
  }
  assert.equal(back.durationS, Math.round(run.durationS * 1000) / 1000, "duration to the millisecond");
  assert.equal(back.distanceM, Math.round(run.distanceM * 100) / 100, "distance to the centimetre");
  assert.deepEqual(back.meta, run.meta);
  for (const key of PLANES) {
    assert.equal(back[key].constructor, run[key].constructor, `plane ${key} type`);
    assert.deepEqual(Array.from(back[key]), Array.from(run[key]), `plane ${key} contents`);
  }
  // Re-encoding a decoded run must land on the same string, which is the only
  // proof that nothing was lost that the planes alone would not show.
  assert.equal(encodeRun(back), text, "encode(decode(x)) is not x");
  assertWellFormed(back, "decoded run");

  assert.equal(runByteSize(run), PLANES.reduce((n, k) => n + run[k].byteLength, 0));
  assert.ok(runByteSize(run) > 0);
  assert.equal(encodeRun(null), "");
  assert.equal(runByteSize(null), 0);
});

test("codec: a truncated or corrupted paste reads as no run and never throws", () => {
  const { run } = recordRun(stubCar(), rawDriver);
  const text = encodeRun(run);

  for (const junk of [null, undefined, 0, 42, {}, [], true, Symbol.iterator.toString()]) {
    assert.equal(decodeRun(junk), null, `${String(junk)} should decode to null`);
  }
  for (const junk of ["", " ", "OR1", "OR1.", "OR1.A", "OR1.AB", "OR1.####", `OR1.${"A".repeat(4096)}`]) {
    assert.equal(decodeRun(junk), null, `"${junk.slice(0, 12)}" should decode to null`);
  }

  // Every truncation of a good run, at every length.
  for (let n = 0; n < text.length; n += 1) {
    assert.equal(decodeRun(text.slice(0, n)), null, `truncation at ${n} chars decoded`);
  }
  // Anything glued on the end is corruption too.
  for (const tail of ["A", "AAAA", "=", "é", "!!"]) {
    assert.equal(decodeRun(text + tail), null, `trailing "${tail}" decoded`);
  }
  // And a single flipped character anywhere in the payload.
  for (let i = RUN_TAG.length; i < text.length; i += 137) {
    const swap = text[i] === "A" ? "B" : "A";
    const flipped = `${text.slice(0, i)}${swap}${text.slice(i + 1)}`;
    assert.equal(decodeRun(flipped), null, `a flipped character at ${i} decoded`);
  }
  // Non-alphabet bytes in the middle, including outside Latin-1.
  for (const bad of ["*", "£", "中", "\n"]) {
    const spiked = `${text.slice(0, 60)}${bad}${text.slice(61)}`;
    assert.equal(decodeRun(spiked), null, `"${bad}" in the payload decoded`);
  }
});

// The wire format, mirrored so the test can forge a header the encoder will not
// write. If either half of this drifts from replay.js the round-trip assertion
// below stops matching and says so.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64Encode(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

function b64Decode(text) {
  const inv = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i += 1) inv[B64.charCodeAt(i)] = i;
  const n = text.length;
  const full = n >> 2;
  const rest = n & 3;
  const out = new Uint8Array(full * 3 + (rest === 2 ? 1 : rest === 3 ? 2 : 0));
  let o = 0;
  let i = 0;
  for (; i + 3 < n; i += 4) {
    const v = (inv[text.charCodeAt(i)] << 18) | (inv[text.charCodeAt(i + 1)] << 12)
      | (inv[text.charCodeAt(i + 2)] << 6) | inv[text.charCodeAt(i + 3)];
    out[o++] = (v >> 16) & 255; out[o++] = (v >> 8) & 255; out[o++] = v & 255;
  }
  if (rest === 2) {
    out[o++] = ((inv[text.charCodeAt(i)] << 2) | (inv[text.charCodeAt(i + 1)] >> 4)) & 255;
  } else if (rest === 3) {
    const a = inv[text.charCodeAt(i)]; const b = inv[text.charCodeAt(i + 1)]; const c = inv[text.charCodeAt(i + 2)];
    out[o++] = ((a << 2) | (b >> 4)) & 255;
    out[o++] = (((b & 15) << 4) | (c >> 2)) & 255;
  }
  return out;
}

function fnv1a(bytes) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Rewrites the binary version word and repairs the checksum, so the run is
// rejected for its version and nothing else.
function withVersion(text, version) {
  const raw = b64Decode(text.slice(RUN_TAG.length));
  const body = raw.subarray(4);
  new DataView(body.buffer, body.byteOffset, body.byteLength).setUint16(0, version, true);
  new DataView(raw.buffer, 0, 4).setUint32(0, fnv1a(body), true);
  return RUN_TAG + b64Encode(raw);
}

test("codec: a foreign tag or a foreign version is refused, not guessed at", () => {
  const { run } = recordRun(stubCar(), gridDriver, { ticks: 5 * HZ });
  const text = encodeRun(run);

  // Rebuilding with the version it already has must reproduce the string, or
  // the forgery below would be testing this test rather than replay.js.
  assert.equal(withVersion(text, RUN_VERSION), text, "the mirrored codec drifted from replay.js");
  assert.ok(decodeRun(withVersion(text, RUN_VERSION)), "a re-checksummed run still decodes");

  for (const version of [0, RUN_VERSION + 1, 2, 255, 65535]) {
    if (version === RUN_VERSION) continue;
    assert.equal(decodeRun(withVersion(text, version)), null, `version ${version} was accepted`);
  }

  const payload = text.slice(RUN_TAG.length);
  for (const tag of ["OR2.", "or1.", "OR1", "XX1.", "ORA.", "", "OR1..", ".OR1"]) {
    assert.equal(decodeRun(tag + payload), null, `tag "${tag}" was accepted`);
  }
  assert.ok(decodeRun(RUN_TAG + payload), "the real tag still works");
});

test("recorder: capacity is a preallocation hint, so a long stage is not lost", () => {
  // game.js asks for capacityMetres = stage length + 500 m and takes the default
  // 420 s; a slow run on a long stage overruns both, and must still be recorded.
  const rig = stubCar();
  const { rec, run } = recordRun(rig, gridDriver, {
    ticks: 30 * HZ, capacitySeconds: 10, capacityMetres: 50, ghostStepM: 5,
  });
  assert.equal(rec.overflowed, false, "growing past the hint is not an overflow");
  assert.equal(run.truncated, false);
  assert.equal(run.tickCount, 30 * HZ, "the ticks past capacitySeconds were kept");
  assert.ok(run.ghostCount * run.ghostStepM > 50, "the ghost past capacityMetres was kept");
  assertWellFormed(run, "grown run");

  const played = stubCar();
  createPlayback(run, played, { correct: false }).playAll();
  assert.equal(played.car.x, rig.car.x, "a grown run still replays");
  assert.equal(played.car.dist, rig.car.dist);
});

test("recorder: the tick ceiling is enforced exactly and marks the run truncated", () => {
  const HZ10 = 10;
  const CEILING = 4 * 60 * 60 * HZ10;    // the four-hour guard inside growTicks
  const rec = createRecorder({
    inputHz: HZ10, keyframeHz: 0.2, ghostStepM: 50,
    capacitySeconds: 10, capacityMetres: 100,
  });
  const input = makeReplayInput();
  const state = makeReplayState();
  input.throttle = 1;
  input.steer = 0.5;
  // One sample a second — sample() fills the ticks in between, which is also the
  // path a stalled frame takes.
  const stopAt = CEILING / HZ10 + 200;
  for (let t = 0; t <= stopAt; t += 1) rec.sample(t, input, state);
  const run = rec.finish(stopAt, state);

  assert.equal(rec.overflowed, true, "four hours of input should trip the guard");
  assert.equal(run.truncated, true);
  assert.equal(run.tickCount, CEILING, `ceiling overshot by ${run.tickCount - CEILING} ticks`);
  assertWellFormed(run, "ceilinged run");
  // The keyframe track has no guard of its own, so it has to stop where the
  // ticks it corrects stop rather than growing for as long as sampling lasts.
  assert.ok(
    (run.keyCount - 1) * run.keyStride <= CEILING,
    `${run.keyCount} keyframes describe ticks past the ${CEILING}-tick ceiling`,
  );

  const got = makeReplayInput();
  inputAt(run, CEILING - 1, got);
  assert.ok(Math.abs(got.throttle - 1) <= PEDAL_Q, "the last tick under the ceiling was written");
  assert.ok(Math.abs(got.steer - 0.5) <= STEER_Q);
});

test("recorder: the ghost ceiling is enforced exactly and writes nothing beyond it", () => {
  const CEILING = 400000;                // the guard inside growGhost
  const stepM = 5;
  const rec = createRecorder({
    inputHz: 60, keyframeHz: 1, ghostStepM: stepM,
    capacitySeconds: 30, capacityMetres: 20000,
  });
  const input = makeReplayInput();
  const state = makeReplayState();
  // 200 km a frame: the ghost grid is written by distance, so each frame fills
  // 40 000 slots and twelve of them are more than the guard will allow.
  for (let i = 0; i <= 12; i += 1) {
    state.distance = i * 200000;
    state.pos.x = i * 200000;
    state.speed = 40;
    rec.sample(i * 0.5, input, state);
  }
  const run = rec.finish(6, state);

  assert.equal(rec.overflowed, true);
  assert.equal(run.ghostCount, CEILING, `ceiling overshot by ${run.ghostCount - CEILING} slots`);
  assert.equal(run.gx.length, CEILING, "the ghost planes match the count they declare");
  assert.equal(firstNonFinite(run.gx), -1);
  assert.equal(firstNonFinite(run.gt), -1);
  // x tracks distance in this fixture, so the last slot proves where writing
  // stopped: one step short of the ceiling, not one past it.
  const lastM = (CEILING - 1) * stepM;
  assert.ok(Math.abs(run.gx[CEILING - 1] - lastM) < 1, `last ghost slot holds ${run.gx[CEILING - 1]}, expected ${lastM}`);
  assert.ok(run.gx[CEILING - 2] < run.gx[CEILING - 1], "the last slots were really written");
});

test("recorder: a paused, rewound or stalled clock cannot corrupt the run", () => {
  const rec = createRecorder({ inputHz: 60, keyframeHz: 2, ghostStepM: 5, capacitySeconds: 60 });
  const input = makeReplayInput();
  const state = makeReplayState();
  const feed = (t, d, steer) => {
    input.steer = steer;
    input.throttle = 0.5;
    state.distance = d;
    state.speed = 20;
    state.pos.x = d; state.pos.y = 0; state.pos.z = 0;
    state.yaw = 0.1;
    rec.sample(t, input, state);
  };

  for (let i = 0; i < 600; i += 1) feed(i / 60, i / 3, 0.2);   // 10 s, 200 m
  feed(10, 200, 0.3);          // the frame the clock stopped on
  feed(10, 200, 0.3);          // repeated timestamp, nothing moved
  feed(10, 205, 0.3);          // repeated timestamp, the car did move
  feed(9.5, 210, -0.4);        // the clock jumped backwards
  feed(9.5, 214, -0.4);
  feed(10.5, 230, 0.1);        // and forwards again
  feed(-1, 240, 0.1);          // a negative stamp is not a tick at all
  feed(14.5, 320, 0.1);        // a four-second stall
  const run = rec.finish(14.5, state);

  assertWellFormed(run, "rewound run");
  assert.equal(run.tickCount, Math.floor(14.5 * 60) + 1);
  assert.ok(run.ghostCount > 60, `the ghost track kept filling, ${run.ghostCount} slots`);
  assert.ok(decodeRun(encodeRun(run)), "a run recorded through a rewind still encodes");

  // The gap readout bisects the ghost clock, so a clock that steps backwards
  // does not merely look odd, it returns the wrong distance.
  const ghost = createGhost(run);
  assert.ok(ghost.valid);
  let last = -1;
  for (let m = 0; m <= ghost.totalM; m += ghost.stepM) {
    const t = ghost.timeAtDistance(m);
    assert.ok(t >= last, `ghost clock went backwards at ${m} m: ${t} after ${last}`);
    last = t;
  }
  let lastD = -1;
  for (let ms = 0; ms <= ghost.totalMs + 500; ms += 25) {
    const d = ghost.distanceAtTime(ms);
    assert.ok(Number.isFinite(d), `distanceAtTime(${ms}) is ${d}`);
    assert.ok(d >= lastD - 1e-9, `distanceAtTime went backwards at ${ms} ms`);
    lastD = d;
  }
});

test("replay: recording, encoding and replaying are all deterministic", () => {
  const first = recordRun(stubCar(), rawDriver);
  const second = recordRun(stubCar(), rawDriver);

  for (const key of ["tickCount", "keyCount", "ghostCount", "durationS", "distanceM"]) {
    assert.equal(second.run[key], first.run[key], `scalar ${key} differs between two identical drives`);
  }
  for (const key of PLANES) {
    assert.deepEqual(Array.from(second.run[key]), Array.from(first.run[key]), `plane ${key} differs`);
  }
  assert.equal(encodeRun(second.run), encodeRun(first.run), "the export is not deterministic");

  // Playback twice, including a seek, lands in the same place both times.
  const a = stubCar();
  const b = stubCar();
  const playA = createPlayback(first.run, a, { correct: true, tolerance: -1 });
  const playB = createPlayback(first.run, b, { correct: true, tolerance: -1 });
  playA.seek(17.3);
  playB.seek(30);
  playB.seek(17.3);
  assert.equal(playB.tick, playA.tick);
  for (const field of ["x", "z", "yaw", "speed", "dist"]) {
    assert.equal(b.car[field], a.car[field], `${field} differs after an identical seek`);
  }

  // And the ghost reads the same numbers for the same query, twice over.
  const g1 = createGhost(first.run);
  const g2 = createGhost(encodeRun(second.run));
  for (let m = 0; m <= g1.totalM; m += 11) {
    g1.update(m, m * 47);
    g2.update(m, m * 47);
    assert.equal(g2.deltaMs, g1.deltaMs, `ghost delta differs at ${m} m`);
    assert.equal(g2.gapM, g1.gapM, `ghost gap differs at ${m} m`);
    assert.equal(g2.pose.x, g1.pose.x, `ghost pose differs at ${m} m`);
  }
});

test("replay: a keyframe restores the state it was captured from", () => {
  const { run } = recordRun(stubCar(), gridDriver);
  const rig = stubCar();
  const live = makeReplayState();
  const kf = makeReplayState();
  const input = makeReplayInput();
  let maxPos = 0;
  let maxAngle = 0;
  for (let i = 0; i < run.tickCount; i += 1) {
    if (i % run.keyStride === 0 && i / run.keyStride < run.keyCount) {
      rig.getState(live);
      keyframeAt(run, i / run.keyStride, kf);
      assert.equal(kf.timeS, i / run.inputHz, `keyframe ${i / run.keyStride} is stamped wrong`);
      maxPos = Math.max(maxPos, Math.abs(live.pos.x - kf.pos.x), Math.abs(live.pos.z - kf.pos.z));
      maxAngle = Math.max(maxAngle, Math.abs(live.yaw - kf.yaw), Math.abs(live.roll - kf.roll));
    }
    gridDriver(i / HZ, i, input);
    rig.step(input, 1 / HZ);
  }
  // Float32 over stage-sized coordinates and radians.
  assert.ok(maxPos < 1e-3, `keyframe position error ${maxPos} m`);
  assert.ok(maxAngle < 1e-6, `keyframe angle error ${maxAngle} rad`);

  // Out-of-range slots clamp rather than read off the end.
  const lo = keyframeAt(run, -50);
  const hi = keyframeAt(run, run.keyCount + 50);
  assert.equal(lo.timeS, 0);
  assert.equal(hi.timeS, (run.keyCount - 1) * run.keyStride / run.inputHz);
  assert.ok(Number.isFinite(hi.pos.x + hi.pos.y + hi.pos.z + hi.yaw + hi.speed));
});

test("replay: an empty run is a run, not a crash", () => {
  const rec = createRecorder({ inputHz: 60, keyframeHz: 1, capacitySeconds: 10 });
  const run = rec.finish();
  assert.equal(run.tickCount, 0);
  assert.equal(run.ghostCount, 0);
  assertWellFormed(run, "empty run");

  const got = inputAt(run, 0);
  assert.equal(got.steer, 0);
  assert.equal(got.throttle, 0);
  assert.equal(got.gear, 0);

  const rig = stubCar();
  const play = createPlayback(run, rig, { correct: false });
  assert.equal(play.done, true);
  assert.equal(play.playAll(), 0);
  assert.equal(play.step(), false);
  assert.equal(rig.car.x, 0);

  const text = encodeRun(run);
  const back = decodeRun(text);
  assert.ok(back, "an empty run still encodes and decodes");
  assert.equal(back.tickCount, 0);
  assert.equal(createGhost(back).valid, false);

  // reset() puts the recorder back where it started rather than half-way.
  rec.reset({ label: "second" });
  const input = makeReplayInput();
  const state = makeReplayState();
  input.throttle = 1;
  for (let i = 0; i < 120; i += 1) {
    state.distance = i * 0.25;
    state.speed = 15;
    rec.sample(i / 60, input, state);
  }
  const second = rec.finish(2, state);
  assert.equal(second.tickCount, 120);
  assert.equal(second.meta.label, "second");
  assert.equal(second.gt[0], 0, "a reset run starts its ghost clock at zero");
  assertWellFormed(second, "reset run");
});

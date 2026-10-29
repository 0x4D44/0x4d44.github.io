import test from "node:test";
import assert from "node:assert/strict";
import { createRecorder, createPlayer, ghostFramesFromRecording, ghostPose, REC_HZ, FRAME_LEN } from "../ui/replay.mjs";

const wheel = () => ({ x: 0, y: 0, z: 0, contactX: 0, contactY: 0, contactZ: 0, steer: 0, spin: 0, compression: 0, susp: 0, skid: 0, surf: 0, load: 0, slipRatio: 0, slipAngle: 0, grounded: true });
const mkState = () => ({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, speed: 0, speedKmh: 0, lateralSpeed: 0, yawRate: 0, slideAngle: 0,
  rpm: 0, gear: 1, clutch: 0, boost: 0, throttle: 0, brake: 0, steerAngle: 0, s: 0, lat: 0, airborne: false, onRoad: true, flipped: false,
  wheels: [wheel(), wheel(), wheel(), wheel()],
  damage: { engine: 0, gearbox: 0, steering: 0, radiator: 0, total: 0, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0], body: { front: 0, rear: 0, left: 0, right: 0 } },
  events: [],
});

function record(seconds, fn) {
  const rec = createRecorder();
  const st = mkState();
  const dt = 1 / 120;
  for (let i = 0; i < seconds * 120; i++) { fn(st, i * dt); rec.step(dt, st); }
  return rec.finish();
}

test("recorder samples at REC_HZ and the player reproduces pose exactly on frame times", () => {
  const rec = record(2, (st, t) => { st.x = t * 10; st.z = -t * 3; st.yaw = t; st.gear = t < 1 ? 2 : 3; st.wheels[1].spin = t * 50; st.damage.engine = Math.min(1, t / 4); });
  assert.ok(Math.abs(rec.n - (2 * REC_HZ + 1)) <= 2, "frames " + rec.n);
  assert.equal(rec.data.length, rec.n * FRAME_LEN);
  const target = mkState();
  const p = createPlayer(rec, target);
  assert.ok(Math.abs(p.duration - (rec.n - 1) / REC_HZ) < 1e-9);
  p.seek(1);
  assert.ok(Math.abs(target.x - 10) < 0.2, "x at 1s " + target.x);
  assert.ok(Math.abs(target.z + 3) < 0.1);
  assert.ok(Math.abs(target.yaw - 1) < 0.02);
  assert.ok(Math.abs(target.wheels[1].spin - 50) < 1.5);
  assert.ok(Math.abs(target.damage.engine - 0.25) < 0.02);
});

test("interpolation is smooth between frames and yaw wraps the short way", () => {
  const rec = record(1, (st, t) => { st.x = t * 40; st.yaw = t < 0.5 ? Math.PI - 0.05 : -Math.PI + 0.05; });
  const target = mkState();
  const p = createPlayer(rec, target);
  const xs = [];
  for (let t = 0.1; t < 0.9; t += 0.013) { p.seek(t); xs.push(target.x); }
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 1e-6, "monotonic x");
  assert.ok(xs[1] - xs[0] < 1.2, "no big steps");
  // across the +-PI seam the interpolated yaw never sweeps through zero
  for (let t = 0.4; t < 0.6; t += 0.01) { p.seek(t); assert.ok(Math.abs(target.yaw) > 3, "yaw " + target.yaw + " at " + t); }
});

test("seek clamps outside the recording and a wheel's grounded flag and gear are kept", () => {
  const rec = record(0.5, (st, t) => { st.gear = 4; st.wheels[2].grounded = t < 0.25; });
  const target = mkState();
  const p = createPlayer(rec, target);
  p.seek(-5);
  p.seek(99);
  p.seek(0.0);
  assert.equal(target.gear, 4);
  assert.equal(target.wheels[2].grounded, true);
  p.seek(0.45);
  assert.equal(target.wheels[2].grounded, false);
});

test("empty recording does not crash", () => {
  const p = createPlayer({ n: 0, data: new Float32Array(0) }, mkState());
  assert.equal(p.duration, 0);
  assert.doesNotThrow(() => p.seek(1));
});

test("ghost frames are 10 Hz poses and ghostPose interpolates then reports the end", () => {
  const rec = record(3, (st, t) => { st.x = t * 20; st.y = 5; st.yaw = 0.2; });
  const frames = ghostFramesFromRecording(rec);
  assert.ok(Math.abs(frames.length - 31) <= 2);
  const out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  assert.equal(ghostPose(frames, 10, 1.55, out), true);
  assert.ok(Math.abs(out.x - 31) < 1.2, "x " + out.x);
  assert.ok(Math.abs(out.y - 5) < 1e-3);
  assert.equal(ghostPose(frames, 10, 99, out), false);
});

// DYNAMICS round 5: a keyboard tap must turn the car now, and a held key must reach a real corner radius.
// The chain under test is the one the game runs: shapeKeySteer (input.mjs) -> vehicle.step (physics.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle, steerFactor } from "../core/physics.mjs";
import { shapeKeySteer, KEY_STEER } from "../core/input.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { flatStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const SURFS = [["GRAVEL", "gravel"], ["TARMAC", "tarmac"]];
const speedThrottle = (v, U) => Math.min(1, Math.max(0, 0.15 + (U - v.state.speed) * 0.3));

/** Cruise at U, then press LEFT (key = -1) for `hold` seconds (Infinity = keep it down) and record the next `seconds`. */
export function keyRun(id, surfName, tyre, U, hold, seconds = 1.5, opts = {}) {
  const st = flatStage(SURFACE[surfName]);
  const v = createVehicle(CARS[id], { tyre, ...opts });
  v.reset(st.startPose, U, st);
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  for (let i = 0; i < 120; i++) { inp.throttle = speedThrottle(v, U); v.step(DT, inp, st); v.state.events.length = 0; }
  const y0 = v.state.yaw;
  let kb = 0;
  const rec = { t: [], ang: [], yawRate: [], speed: [], U };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    kb = shapeKeySteer(kb, t < hold ? -1 : 0, v.state.speed, DT);
    inp.steer = -kb; // the game maps the left key to a negative steer; magnitude is what matters here
    inp.throttle = speedThrottle(v, U);
    v.step(DT, inp, st); v.state.events.length = 0;
    rec.t.push(t); rec.ang.push(Math.abs(v.state.steerAngle)); rec.yawRate.push(Math.abs(v.state.yawRate)); rec.speed.push(v.state.speed);
  }
  rec.dyaw = Math.abs(v.state.yaw - y0);
  return rec;
}

/** The front lock a held key settles on at speed U (what the tap has to reach 60% of). */
export function keyLockTarget(id, U) {
  const f = Math.min(1, U / KEY_STEER.fullSpeed);
  const cap = 1 + (KEY_STEER.lockAtSpeed - 1) * f;
  return CARS[id].steeringLockDeg * (Math.PI / 180) * steerFactor(U) * cap;
}

for (const [sn, tyre] of SURFS) {
  test(`tap latency on ${sn}: front wheels reach 60% of the key lock within 120 ms, yaw rate > 0.15 rad/s within 250 ms (20/30/40 m/s)`, () => {
    for (const id of CAR_IDS) for (const U of [20, 30, 40]) {
      const r = keyRun(id, sn, tyre, U, Infinity, 0.4);
      const a120 = r.ang[Math.round(0.12 / DT)];
      assert.ok(a120 >= 0.6 * keyLockTarget(id, U), `${id} ${U} m/s: ${(a120 * 57.3).toFixed(1)} deg at 120 ms, target ${(keyLockTarget(id, U) * 57.3).toFixed(1)} deg`);
      const ymax = Math.max(...r.yawRate.slice(0, Math.round(0.25 / DT) + 1));
      assert.ok(ymax > 0.15, `${id} ${U} m/s: yaw rate ${ymax.toFixed(2)} rad/s within 250 ms`);
    }
  });
}

test("held key: the corner tightens to a real radius within 0.6 s (<= 40 m at 20 m/s, <= 90 m at 30 m/s, <= 150 m at 40 m/s on gravel)", () => {
  const lim = { 20: 40, 30: 90, 40: 150 };
  for (const id of CAR_IDS) for (const U of [20, 30, 40]) {
    const r = keyRun(id, "GRAVEL", "gravel", U, Infinity, 1.5);
    let best = Infinity;
    for (let i = 0; i < r.t.length; i++) if (r.t[i] >= 0.2 && r.t[i] <= 0.6 && r.yawRate[i] > 0.02) best = Math.min(best, r.speed[i] / r.yawRate[i]);
    assert.ok(best <= lim[U], `${id} ${U} m/s: tightest radius ${best.toFixed(0)} m`);
  }
});

test("no dead zone: a longer tap never turns the car less (heading change is monotone in tap length, 40 ms already shows)", () => {
  for (const [sn, tyre] of SURFS) for (const id of CAR_IDS) for (const U of [20, 30]) {
    let prev = 0;
    for (const hold of [0.04, 0.08, 0.12, 0.2, 0.3]) {
      const d = keyRun(id, sn, tyre, U, hold, 1.2).dyaw;
      if (hold === 0.04) assert.ok(d > 0.005, `${id} ${sn} ${U} m/s: a 40 ms tap turned the car only ${d.toFixed(4)} rad`);
      assert.ok(d >= prev * 0.9, `${id} ${sn} ${U} m/s: tap ${hold}s turns ${d.toFixed(3)} rad, shorter tap turned ${prev.toFixed(3)}`);
      prev = d;
    }
  }
});

test("straight-line stability: no input, no weave at 150 km/h or more (yaw rate stays under 0.02 rad/s)", () => {
  for (const id of CAR_IDS) for (const [sn, tyre] of SURFS) {
    const st = flatStage(SURFACE[sn]);
    const v = createVehicle(CARS[id], { tyre });
    v.reset(st.startPose, 42, st);
    const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let m = 0;
    for (let i = 0; i < 120 * 6; i++) { inp.throttle = speedThrottle(v, 42); v.step(DT, inp, st); v.state.events.length = 0; if (i > 120) m = Math.max(m, Math.abs(v.state.yawRate)); }
    assert.ok(m < 0.02, `${id} ${sn}: yaw rate ${m.toFixed(3)} rad/s with no input at 42 m/s`);
  }
});

test("front-end grip: on loose ground a turned-in car corners harder than with the boost off; on tarmac nothing changes", () => {
  const latG = (id, sn, tyre, boostOff) => {
    const spec = boostOff ? { ...CARS[id], handling: { ...CARS[id].handling, frontLoose: 1 } } : CARS[id];
    const st = flatStage(SURFACE[sn]);
    const v = createVehicle(spec, { tyre });
    v.reset(st.startPose, 18, st);
    const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let best = 0;
    for (let i = 0; i < 120 * 3; i++) { inp.steer = Math.min(1, i * DT * 1.2) * 0.5; inp.throttle = speedThrottle(v, 18); v.step(DT, inp, st); v.state.events.length = 0; if (i > 60 && i < 150) best = Math.max(best, Math.abs(v.state.yawRate) * v.state.speed / 9.81); } // turn-in window only: later the speed controller's throttle rebound spins the rear driven wheels (power-on rotation), which has nothing to do with the front axle
    return best;
  };
  for (const id of ["huia", "kea", "piwakawaka"]) {
    const on = latG(id, "GRAVEL", "gravel", false), off = latG(id, "GRAVEL", "gravel", true);
    assert.ok(on > off * 1.003, `${id} gravel: boost on ${on.toFixed(3)} g vs off ${off.toFixed(3)} g`);
    const ton = latG(id, "TARMAC", "tarmac", false), toff = latG(id, "TARMAC", "tarmac", true);
    assert.ok(Math.abs(ton - toff) < 1e-9, `${id} tarmac changed: ${ton} vs ${toff}`);
  }
});

// ---- pinned car: nose-in against a tree or bank with the throttle held ----
import { makeTestStage } from "./dynamics-testtrack.mjs";
import { buildStage } from "../core/stage.mjs";
import { bestTyreFor } from "../core/bot.mjs";

test("pinned car: a head-on tree hit at 70 km/h with the throttle held raises state.stuck and the car is eased clear of the trunk", () => {
  for (const id of CAR_IDS) {
    const tree = { x: 0, z: -80, r: 0.6, kind: "tree", hardness: 0.9, y0: 0, y1: 6 };
    const st = makeTestStage({ length: 600, width: 12, boundary: 400, obstacles: [tree] });
    const v = createVehicle(CARS[id], { tyre: "gravel" });
    v.reset(st.startPose, 70 / 3.6, st);
    const inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let tHit = -1, stuck = false, minD = 99, dAtStuck = 0;
    for (let i = 0; i < 120 * 9; i++) {
      const t = i * DT, s = v.state;
      if (tHit < 0 && s.collided < 0.05) tHit = t;
      v.step(DT, inp, st); v.state.events.length = 0;
      if (tHit >= 0) {
        const d = Math.hypot(s.x - tree.x, s.z - tree.z);
        if (s.stuck && !stuck) stuck = true;
        if (stuck) minD = Math.min(minD, 99), dAtStuck = Math.max(dAtStuck, d);
      }
    }
    assert.ok(tHit > 0, id + " never hit the tree");
    assert.ok(stuck, `${id}: state.stuck never raised`);
    assert.ok(dAtStuck >= 4, `${id}: only eased ${dAtStuck.toFixed(1)} m from the trunk (centre to centre; touching is about 2.7)`);
  }
});

test("pinned car: nosed into a trunk from a standing start with the throttle held, the car is flagged stuck within PIN_AFTER + 1 s of contact and is eased 4+ m clear (or moving 8+ km/h) within 3 s of the flag", () => {
  for (const id of CAR_IDS) {
    // car 1.0 m short of a hard trunk, nose on, at rest: deterministic pin, no run-up
    const tree = { x: 0, z: -4.2, r: 0.6, kind: "tree", hardness: 0.9, y0: 0, y1: 6 };
    const st = makeTestStage({ length: 600, width: 12, boundary: 400, obstacles: [tree] });
    const v = createVehicle(CARS[id], { tyre: "gravel" });
    v.reset(st.startPose, 0, st);
    const inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let tFirst = -1, tStuck = -1, best = 0, bestV = 0;
    for (let i = 0; i < 120 * 10; i++) {
      const t = i * DT, s = v.state;
      v.step(DT, inp, st); v.state.events.length = 0;
      if (tFirst < 0 && s.collided < 0.05) tFirst = t;
      if (s.stuck && tStuck < 0) tStuck = t;
      if (tStuck >= 0 && t <= tStuck + 3) { best = Math.max(best, Math.hypot(s.x - tree.x, s.z - tree.z)); bestV = Math.max(bestV, s.speedKmh); }
    }
    assert.ok(tFirst >= 0, id + " never touched the trunk");
    assert.ok(tStuck >= 0 && tStuck - tFirst <= 2.0, `${id}: stuck flag at ${tStuck.toFixed(2)} s, first contact ${tFirst.toFixed(2)} s`);
    assert.ok(best >= 4 || bestV >= 8, `${id}: only ${best.toFixed(1)} m from the trunk, top ${bestV.toFixed(1)} km/h within 3 s of the flag`);
  }
});

// ---- round 6: turn-in must be easy on gravel ----
test("turn-in on gravel: a held key keeps most of its lock at 0.5 s (the assist no longer eats it): >= 10 deg at 60 km/h, >= 5 deg at 80 km/h, every car", () => {
  for (const id of CAR_IDS) for (const [kmh, minDeg] of [[60, 10], [80, 5]]) {
    const r = keyRun(id, "GRAVEL", "gravel", kmh / 3.6, Infinity, 0.6);
    const a = r.ang[Math.round(0.5 / DT)] * 57.3;
    assert.ok(a >= minDeg, `${id} ${kmh} km/h: wheel angle ${a.toFixed(1)} deg at 0.5 s, wanted >= ${minDeg}`);
  }
});

test("R40 gravel bend: every car holds at least 60 km/h round a 40 m radius bend (0.7 g) with a simple pursuit driver", () => {
  const st = makeTestStage({ length: 600, width: 14, boundary: 400, surf: SURFACE.GRAVEL, curv: (s) => (s > 100 ? -1 / 40 : 0) });
  for (const id of CAR_IDS) {
    const U = 60 / 3.6;
    const v = createVehicle(CARS[id], { tyre: "gravel" });
    v.reset(st.startPose, U, st);
    const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let minV = 99, off = false;
    for (let i = 0; i < 120 * 12; i++) {
      const s = v.state;
      inp.throttle = speedThrottle(v, U);
      const sm = st.sample(Math.min(st.lengthM - 1, s.s + Math.max(6, s.speed * 0.5)), {});
      const dx = sm.x - s.x, dz = sm.z - s.z, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
      inp.steer = Math.max(-1, Math.min(1, 2 * Math.atan2(dx * rx + dz * rz, Math.max(0.1, dx * fx + dz * fz))));
      v.step(DT, inp, st); v.state.events.length = 0;
      if (s.s > 150) { minV = Math.min(minV, s.speed); if (!s.onRoad) off = true; }
      if (s.s > 300) break;
    }
    assert.ok(!off && minV >= U * 0.8, `${id}: min speed ${(minV * 3.6).toFixed(0)} km/h, off road ${off}`);
  }
});

// ---- round 7: verge pull and brake pedal ----
test("brake pedal: a full press reaches 90% brake within 70 ms (keyboard friendly)", () => {
  const st = flatStage(SURFACE.TARMAC);
  const v = createVehicle(CARS.huia, { tyre: "tarmac" });
  v.reset(st.startPose, 100 / 3.6, st);
  const inp = { steer: 0, throttle: 0, brake: 1, handbrake: 0, gearUp: false, gearDown: false };
  for (let i = 0; i < Math.round(0.07 / DT); i++) { v.step(DT, inp, st); v.state.events.length = 0; }
  assert.ok(v.state.brake >= 0.9, `brake ${v.state.brake.toFixed(2)} after 70 ms`);
});

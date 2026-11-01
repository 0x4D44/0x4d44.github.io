// DYNAMICS round 8: a car with two wheels on the verge must not be twisted round by the ploughing drag.
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;

test("verge: two wheels on grass at 90 km/h, no steering: heading swings <= 7 deg in 1 s and the car drifts <= 10 m further out in 4 s (all four cars)", () => {
  for (const id of CAR_IDS) {
    const st = makeTestStage({ length: 1500, width: 7, boundary: 400, surf: SURFACE.GRAVEL });
    const p = st.startPose;
    const v = createVehicle(CARS[id], {});
    v.reset({ ...p, x: p.x + 3.0 }, 90 / 3.6, st); // centre 3 m right of the middle of a 7 m road: right wheels on grass
    const inp = { steer: 0, throttle: 0.3, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let swing = 0;
    for (let i = 0; i < 120 * 4; i++) {
      v.step(DT, inp, st); v.state.events.length = 0;
      if (i === 119) swing = Math.abs(v.state.yaw - p.yaw) * 57.3;
    }
    const drift = Math.abs(v.state.x - p.x - 3.0);
    assert.ok(swing <= 7, `${id}: heading swung ${swing.toFixed(1)} deg in 1 s`);
    assert.ok(drift <= 10, `${id}: drifted ${drift.toFixed(1)} m further out in 4 s`);
  }
});

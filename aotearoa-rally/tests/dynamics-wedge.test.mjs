// Round 9: a car wedged between a tree and a boulder backs out (throttle cut, reverse push) instead of
// sitting pinned. Held throttle, 2.4 m gap: with the back-out Huia clears the pair; without it, it stays stuck.
import test from "node:test";
import assert from "node:assert/strict";
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

test("a car wedged between a tree and a boulder gets away", () => {
  const gap = 2.4;
  const obstacles = [
    { x: -0.5 - gap / 2, z: -6, r: 0.75, kind: "macrocarpa", hardness: 0.9, y0: 0, y1: 14 },
    { x: 0.5 + gap / 2, z: -6.5, r: 1.4, kind: "boulder", hardness: 0.9, y0: 0, y1: 1.6 },
  ];
  const st = makeTestStage({ length: 600, width: 14, boundary: 400, obstacles });
  const v = createVehicle(CARS.huia, { tyre: "gravel" });
  v.reset(st.startPose, 3, st);
  const inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  for (let i = 0; i < 120 * 15; i++) { v.step(1 / 120, inp, st); v.state.events.length = 0; }
  assert.ok(v.state.z < -20, `Huia should be past the pair, z=${v.state.z.toFixed(1)}`);
});

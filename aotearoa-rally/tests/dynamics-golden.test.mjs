// DYNAMICS round 3: golden pins for surface / tyre tables and the physics constants that no other test pins by value.
// Digest mismatch = someone changed a table: if intended, re-run with GOLDEN_PRINT=1 and paste the new digests.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE, SURFACE_INFO } from "../core/surfaces.mjs";
import { TYRE_GRIP, TYRE_ROLL } from "../core/tyre.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const digest = (o) => createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
const inp = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
const flat = (surf) => makeTestStage({ length: 1500, width: 12, boundary: 400, surf });

/** Behaviours of the reference car (huia). */
function measure() {
  const out = {};
  const car = CARS.huia;
  for (const [name, surf, tyre] of [["tarmac", SURFACE.TARMAC, "tarmac"], ["gravel", SURFACE.GRAVEL, "gravel"], ["snow", SURFACE.SNOW, "snow"], ["mud", SURFACE.MUD, "gravel"]]) {
    const st = flat(surf);
    // 0-100 km/h
    let v = createVehicle(car, { tyre });
    v.reset(st.startPose, 0, st);
    let i = inp(); i.throttle = 1;
    let t = 0;
    while (v.state.speed < 100 / 3.6 && t < 40) { v.step(DT, i, st); v.state.events.length = 0; t += DT; }
    out["accel100_" + name] = t;
    // 100-0 braking distance
    v = createVehicle(car, { tyre });
    v.reset(st.startPose, 100 / 3.6, st);
    i = inp(); i.brake = 1;
    const s0 = v.state.s;
    for (let k = 0; k < 120 * 12 && v.state.speed > 0.5; k++) { v.step(DT, i, st); v.state.events.length = 0; }
    out["brake100_" + name] = v.state.s - s0;
    // steady cornering: peak lateral g under a steering ramp at ~22 m/s
    v = createVehicle(car, { tyre });
    v.reset(st.startPose, 22, st);
    i = inp();
    let best = 0;
    for (let k = 0; k < 120 * 8; k++) {
      i.steer = Math.min(1, k * DT * 0.35);
      i.throttle = v.state.speed < 22 ? 0.5 : 0.12;
      v.step(DT, i, st); v.state.events.length = 0;
      if (Math.abs(v.state.gLat) > best) best = Math.abs(v.state.gLat);
    }
    out["peakG_" + name] = best;
    // coast-down: rolling resistance + drag, 30 m/s with no pedals for 6 s
    v = createVehicle(car, { tyre });
    v.reset(st.startPose, 30, st);
    i = inp();
    for (let k = 0; k < 120 * 6; k++) { v.step(DT, i, st); v.state.events.length = 0; }
    out["coast6s_" + name] = v.state.speed;
  }
  // top speed on tarmac (drag + gearing), 40 s
  {
    const st = flat(SURFACE.TARMAC);
    const v = createVehicle(car, { tyre: "tarmac" });
    v.reset(st.startPose, 0, st);
    const i = inp(); i.throttle = 1;
    for (let k = 0; k < 120 * 40; k++) { v.step(DT, i, st); v.state.events.length = 0; if (v.state.s > 1450) break; }
    out.topSpeed = v.state.speed * 3.6;
  }
  // 120 km/h head-on into a tree: damage and rebound
  {
    const st = makeTestStage({ length: 600, width: 12, boundary: 400, surf: SURFACE.GRAVEL, obstacles: [{ x: 0, z: -80, r: 0.5, kind: "tree", hardness: 1, y0: 0, y1: 6 }] });
    const v = createVehicle(car, { tyre: "gravel" });
    v.reset(st.startPose, 120 / 3.6, st);
    const i = inp(); i.throttle = 0.3;
    for (let k = 0; k < 120 * 4; k++) { v.step(DT, i, st); v.state.events.length = 0; }
    out.crash120 = v.state.damage.total;
  }
  // landing from a 1.2 m hump at 30 m/s: apex and damage
  {
    const ramp = (x, z) => (z < -150 && z > -174 ? 1.2 * Math.sin(Math.PI * (-150 - z) / 24) : 0);
    const st = makeTestStage({ length: 600, width: 12, boundary: 400, height: ramp });
    const v = createVehicle(car, { tyre: "gravel" });
    v.reset(st.startPose, 30, st);
    const i = inp(); i.throttle = 1;
    let apex = -1e9, air = 0;
    for (let k = 0; k < 120 * 12; k++) { v.step(DT, i, st); v.state.events.length = 0; apex = Math.max(apex, v.state.y); if (v.state.airborne) air += DT; }
    out.jumpApex = apex; out.jumpAir = air; out.jumpDamage = v.state.damage.total;
  }
  return out;
}

const GOLDEN = {
  digests: { SURFACE_INFO: "385a3d87cb06", TYRE_GRIP: "a16078adcf48", TYRE_ROLL: "af7fb448dcca" },
  tol: 0.05,
  values: {"accel100_tarmac":4.675,"brake100_tarmac":48.736,"peakG_tarmac":0.815,"coast6s_tarmac":21.898,"accel100_gravel":5.092,"brake100_gravel":70.084,"peakG_gravel":0.668,"coast6s_gravel":21.165,"accel100_snow":6.283,"brake100_snow":89.5,"peakG_snow":0.541,"coast6s_snow":19.463,"accel100_mud":6.258,"brake100_mud":87.215,"peakG_mud":0.542,"coast6s_mud":19.39,"topSpeed":212.718,"crash120":0.533,"jumpApex":3.776,"jumpAir":1.567,"jumpDamage":0.276},
};

if (process.env.GOLDEN_PRINT) {
  console.log("digests", JSON.stringify({ SURFACE_INFO: digest(SURFACE_INFO), TYRE_GRIP: digest(TYRE_GRIP), TYRE_ROLL: digest(TYRE_ROLL) }));
  console.log("values", JSON.stringify(Object.fromEntries(Object.entries(measure()).map(([k, v]) => [k, +v.toFixed(3)]))));
}

test("surface and tyre tables are unchanged (digest pins)", () => {
  assert.equal(digest(SURFACE_INFO), GOLDEN.digests.SURFACE_INFO, "SURFACE_INFO changed");
  assert.equal(digest(TYRE_GRIP), GOLDEN.digests.TYRE_GRIP, "TYRE_GRIP changed");
  assert.equal(digest(TYRE_ROLL), GOLDEN.digests.TYRE_ROLL, "TYRE_ROLL changed");
});

test("reference-car behaviours stay within 5% (acceleration, braking, cornering, drag, crash, jump)", () => {
  const m = measure();
  const bad = [];
  for (const [k, want] of Object.entries(GOLDEN.values)) {
    const got = m[k];
    const tol = Math.max(GOLDEN.tol * Math.abs(want), k.startsWith("jumpDamage") || k === "crash120" ? 0.04 : 0);
    if (!(Math.abs(got - want) <= tol)) bad.push(`${k}: ${got.toFixed(3)} vs golden ${want}`);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(GOLDEN.values).sort(), Object.keys(m).sort(), "golden table out of date");
});

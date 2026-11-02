// DYNAMICS round 9: rocks must collide where they look. Collider radius vs the real mesh, and car-box penetration at speed.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { buildPropGeometry } from "../render/scenery.mjs";
import { buildStage } from "../core/stage.mjs";
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const NV = { boulder: 4, limestone: 3, schist: 3 };
function meshR(kind, v) {
  const a = buildPropGeometry(THREE, kind, v, 0).attributes.position;
  let m = 0;
  for (let i = 0; i < a.count; i++) { const y = a.getY(i); if (y > 0.1 && y < 1.5) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i))); }
  return m;
}

test("rock colliders cover the visible mesh (within 10 cm at scale 1) on every stage, every variant of boulder, limestone and schist", () => {
  const mr = {};
  for (const k of Object.keys(NV)) { mr[k] = []; for (let v = 0; v < NV[k]; v++) mr[k].push(meshR(k, v)); }
  let n = 0;
  for (const sid of ["waitomo", "coromandel", "whakarewarewa"]) {
    const st = buildStage(sid);
    for (const p of st.props) {
      if (!p.collide || !NV[p.kind]) continue;
      const want = mr[p.kind][p.variant % NV[p.kind]] * p.scale;
      assert.ok(p.r >= want - 0.1, `${sid} ${p.kind} v${p.variant}: collider ${p.r.toFixed(2)} m, mesh ${want.toFixed(2)} m`);
      n++;
    }
  }
  assert.ok(n > 20, "too few rocks checked: " + n);
});

test("the car box stays within 20 cm of a rock-sized circle at 60, 90 and 130 km/h, dead-on and offset (Huia)", () => {
  const DT = 1 / 120;
  for (const R of [1.06, 1.43]) for (const kmh of [60, 90, 130]) for (const off of [0, 0.9]) {
    const ob = { x: off, z: -80, r: R, kind: "boulder", hardness: 0.9, y0: 0, y1: 1.6 };
    const st = makeTestStage({ length: 400, width: 12, boundary: 400, obstacles: [ob] });
    const v = createVehicle(CARS.huia, { tyre: "gravel" });
    v.reset(st.startPose, kmh / 3.6, st);
    const inp = { steer: 0, throttle: 0.2, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
    let mx = 0;
    const L = CARS.huia.length, Wd = CARS.huia.width;
    for (let i = 0; i < 120 * 6; i++) {
      v.step(DT, inp, st); v.state.events.length = 0;
      const s = v.state, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
      for (let a = -1; a <= 1; a += 0.25) for (let b = -1; b <= 1; b += 0.25) {
        if (Math.abs(a) < 1 && Math.abs(b) < 1) continue;
        const x = s.x + fx * a * L / 2 + rx * b * Wd / 2, z = s.z + fz * a * L / 2 + rz * b * Wd / 2;
        mx = Math.max(mx, R - Math.hypot(x - ob.x, z - ob.z));
      }
    }
    assert.ok(mx <= 0.2, `R${R} ${kmh} km/h off ${off}: ${mx.toFixed(2)} m into the rock`);
  }
});

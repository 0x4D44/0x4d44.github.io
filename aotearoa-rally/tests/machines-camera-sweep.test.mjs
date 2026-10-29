// Sweeps a car along the real Remarkables / Whakarewarewa / Fiordland roads and checks the chase and far camera
// placement invariants (pure maths, no THREE): never inside the car box + 0.4 m, never below ground + 0.45 m, never
// inside a rock volume, and the arm never collapses (>= MIN_ARM_FRAC of the nominal arm, horizontally).
import test from "node:test";
import assert from "node:assert/strict";
import { buildStage } from "../core/stage.mjs";
import {
  placeChaseCamera, enforceCameraClear, chaseArm, chaseHeadingTarget, springStep,
  MIN_ARM_FRAC, CAM_GROUND_CLEAR, CAM_BODY_MARGIN,
} from "../render/camera.mjs";
import { CARS } from "../core/cars.mjs";

const spec = CARS.huia || Object.values(CARS)[0];
const HL = (spec.length || 4.2) * 0.6, HW = (spec.width || 1.75) / 2, TOP = (spec.height || 1.4) + 0.1;

function check(stage, cam, car, arm, tag, scratch) {
  const h = stage.heightAt(cam.x, cam.z);
  assert.ok(cam.y >= h + CAM_GROUND_CLEAR - 1e-6, `${tag}: camera ${(cam.y - h).toFixed(2)} m above ground`);
  // car box
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  const dx = cam.x - car.x, dz = cam.z - car.z;
  const lf = Math.abs(dx * -sy + dz * -cy), lr = Math.abs(dx * cy + dz * -sy);
  const inside = lf < HL + CAM_BODY_MARGIN - 1e-6 && lr < HW + CAM_BODY_MARGIN - 1e-6 && cam.y < car.y + TOP + CAM_BODY_MARGIN - 1e-6 && cam.y > car.y - 0.5;
  assert.ok(!inside, `${tag}: camera inside the car box (lf=${lf.toFixed(2)} lr=${lr.toFixed(2)} dy=${(cam.y - car.y).toFixed(2)})`);
  // rock volumes
  const near = stage.obstaclesNear(cam.x, cam.z, 0.5, scratch);
  for (const o of near) {
    if (cam.y < o.y0 - 0.3 || cam.y > o.y1 + 0.5) continue;
    assert.ok(Math.hypot(cam.x - o.x, cam.z - o.z) >= o.r + 0.5, `${tag}: camera inside obstacle ${o.kind}`);
  }
}

for (const id of ["remarkables", "whakarewarewa", "fiordland"]) {
  test(`chase/far camera invariants hold along ${id} (every 5 m, several speeds and slide angles)`, () => {
    const stage = buildStage(id);
    const smp = {}, scratch = [];
    const car = { x: 0, y: 0, z: 0, yaw: 0, hl: HL, hw: HW, top: TOP };
    const cam = { x: 0, y: 0, z: 0 };
    let n = 0, minFrac = Infinity;
    for (let s = 5; s < stage.lengthM; s += 5) {
      stage.sample(s, smp);
      car.x = smp.x; car.z = smp.z; car.y = stage.heightAt(smp.x, smp.z); car.yaw = smp.heading;
      for (const kmh of [15, 70, 140, 200]) {
        for (const slide of [0, 0.5, -0.8]) {
          const head = chaseHeadingTarget(car.yaw, car.yaw + slide, kmh / 3.6);
          for (const far of [false, true]) {
            placeChaseCamera({ heightAt: stage.heightAt, obstaclesNear: stage.obstaclesNear, car, head, kmh, far, pitch: 0 }, cam);
            const arm = chaseArm(kmh, far);
            const tag = `${id} s=${s} ${kmh}km/h slide=${slide} ${far ? "far" : "chase"}`;
            check(stage, cam, car, arm, tag, scratch);
            const hd = Math.hypot(cam.x - car.x, cam.z - car.z);
            minFrac = Math.min(minFrac, hd / arm.dist);
            assert.ok(hd >= arm.dist * MIN_ARM_FRAC - 0.9, `${tag}: arm collapsed to ${hd.toFixed(2)} of ${arm.dist.toFixed(2)} m`);
            n++;
          }
        }
      }
    }
    assert.ok(n > 1000);
  });

  test(`sprung camera (spring lag + hard constraint) stays clear while driving ${id}`, () => {
    const stage = buildStage(id);
    const smp = {}, scratch = [];
    const car = { x: 0, y: 0, z: 0, yaw: 0, hl: HL, hw: HW, top: TOP };
    const des = { x: 0, y: 0, z: 0 }, cp = { x: 0, y: 0, z: 0 };
    const sx = { x: 0, v: 0 }, sy = { x: 0, v: 0 }, sz = { x: 0, v: 0 };
    const kmh = 110, v = kmh / 3.6, dt = 1 / 60;
    let s = 5, frames = 0, jump = 0, prev = null;
    stage.sample(s, smp);
    while (s < stage.lengthM - 5) {
      stage.sample(s, smp);
      car.x = smp.x; car.z = smp.z; car.y = stage.heightAt(smp.x, smp.z); car.yaw = smp.heading;
      const head = chaseHeadingTarget(car.yaw, car.yaw + 0.3 * Math.sin(s / 40), v);
      placeChaseCamera({ heightAt: stage.heightAt, obstaclesNear: stage.obstaclesNear, car, head, kmh, far: false, pitch: 0 }, des);
      if (frames === 0) { sx.x = des.x; sy.x = des.y; sz.x = des.z; }
      springStep(sx, des.x, 10, 1, dt); springStep(sz, des.z, 10, 1, dt); springStep(sy, des.y, 7, 1, dt);
      cp.x = sx.x; cp.y = sy.x; cp.z = sz.x;
      enforceCameraClear(cp, stage.heightAt, stage.obstaclesNear, car);
      check(stage, cp, car, chaseArm(kmh, false), `${id} frame ${frames} s=${s.toFixed(0)}`, scratch);
      if (prev) jump = Math.max(jump, Math.hypot(cp.x - prev.x, cp.y - prev.y, cp.z - prev.z));
      prev = { x: cp.x, y: cp.y, z: cp.z };
      s += v * dt; frames++;
    }
    assert.ok(frames > 500);
    assert.ok(jump < 1.8, `camera moved ${jump.toFixed(2)} m in one frame (pop)`);
  });
}

test("camera placement is a no-op in open flat ground", () => {
  const car = { x: 0, y: 0, z: 0, yaw: 0, hl: HL, hw: HW, top: TOP };
  const cam = placeChaseCamera({ heightAt: () => 0, obstaclesNear: null, car, head: 0, kmh: 0, far: false, pitch: 0 }, { x: 0, y: 0, z: 0 });
  const arm = chaseArm(0, false);
  assert.ok(Math.abs(cam.z - arm.dist) < 1e-9 && Math.abs(cam.y - (0.9 + arm.height)) < 1e-9);
});

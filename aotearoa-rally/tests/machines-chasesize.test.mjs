// Chase camera: the car's projected width must stay steady across speed and after a reset / teleport (round 4, M2).
// Before the fix (old arm 5.4..7.2 m, spring lag of 0.2 s x speed, FOV +0.085/kmh) the max/min width ratio was 6.72 at
// 1280x720 and 4.90 at 390x844.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { createCameraRig } from "../render/camera.mjs";
import { CARS } from "../core/cars.mjs";

const spec = CARS.huia;
const stage = { heightAt: () => 0 };
const mk = (v, yaw = 0) => ({ x: 0, y: 0.5, z: 0, yaw, pitch: 0, roll: 0, speed: v, speedKmh: v * 3.6, steerAngle: 0, vx: -Math.sin(yaw) * v, vy: 0, vz: -Math.cos(yaw) * v, yawRate: 0, events: [], wheels: [0, 1, 2, 3].map(() => ({ grounded: true, compression: 0.5, contactY: 0, x: 0, y: 0, z: 0 })) });

let lowest = 0; // lowest projected car point (ndc y, -1 = bottom edge) seen by the last width() call
function widths(aspect, W) {
  const camera = new THREE.PerspectiveCamera(62, aspect, 0.06, 3000);
  const width = (st) => {
    camera.updateMatrixWorld(true);
    let mn = 1e9, mx = -1e9;
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) for (const dy of [0, 1.3]) {
      const c = Math.cos(st.yaw), s = Math.sin(st.yaw), lx = sx * spec.width / 2, lz = dz * spec.length / 2;
      const p = new THREE.Vector3(st.x + lx * c + lz * s, dy, st.z - lx * s + lz * c).project(camera);
      mn = Math.min(mn, p.x); mx = Math.max(mx, p.x); lowest = Math.min(lowest, p.y);
    }
    return ((mx - mn) / 2) * W;
  };
  const out = [];
  for (const v of [0, 5, 15, 30, 60]) {
    const r = createCameraRig(THREE, camera); r.setCarSpec(spec); r.setMode("chase");
    const st = mk(v); r.snap(st, stage);
    for (let i = 0; i < 120; i++) { st.z -= v / 60; r.update(1 / 60, st, stage, {}); }
    out.push(width(st));
  }
  for (const f of [0, 5, 30, 60]) {
    const r = createCameraRig(THREE, camera); r.setCarSpec(spec); r.setMode("chase");
    let st = mk(0); r.snap(st, stage);
    for (let i = 0; i < 40; i++) r.update(1 / 60, st, stage, {});
    st = mk(0, 1.0); st.x = 200; st.z = 100; r.snap(st, stage);
    for (let i = 0; i < f; i++) r.update(1 / 60, st, stage, {});
    out.push(width(st));
  }
  return out;
}

for (const [name, aspect, W] of [["1280x720", 1280 / 720, 1280], ["390x844", 390 / 844, 390]]) {
  test(`chase: the car's lowest point clears the bottom control band (${name})`, () => {
    lowest = 0;
    const w = widths(aspect, W);
    assert.ok(w.every(Number.isFinite));
    const H = aspect < 1 ? 844 : 720, bottomPx = (1 - lowest) / 2 * H;
    // portrait phone: the touch controls start near y 732 of 844, so the car stays above 700. Landscape 1280x720: unchanged (bottom 665 at rest, 637 at 60 m/s).
    if (aspect < 1) assert.ok(bottomPx <= 700, `portrait car bottom at ${bottomPx.toFixed(0)} px of 844`);
    else assert.ok(bottomPx >= 655 && bottomPx <= 675, `landscape car bottom moved to ${bottomPx.toFixed(0)} px of 720`);
  });

  test(`chase: projected car width varies <= 1.3x over speed 0..60 m/s and frames after reset (${name})`, () => {
    const w = widths(aspect, W);
    assert.ok(w.every(Number.isFinite), String(w));
    const ratio = Math.max(...w) / Math.min(...w);
    assert.ok(ratio <= 1.3, `ratio ${ratio.toFixed(2)} widths ${w.map((x) => x.toFixed(0))}`);
  });
}

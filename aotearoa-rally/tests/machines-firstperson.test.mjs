// First-person camera + car visual regressions: stale wheel contacts after a teleport, and the first-person near plane.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { createCameraRig } from "../render/camera.mjs";
import { createCarVisual } from "../render/car.mjs";
import { CARS } from "../core/cars.mjs";

const spec = CARS.huia;
const cg = spec.cgHeight;

function wheels(contactY) {
  return [0, 1, 2, 3].map(() => ({ grounded: true, compression: 0.5, contactY, x: 0, y: contactY, z: 0, steer: 0, spin: 0 }));
}
function state(y, contactY) {
  return { x: 0, y, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, speedKmh: 0, steerAngle: 0, vx: 0, vy: 0, vz: 0, yawRate: 0, events: [], wheels: wheels(contactY) };
}
function rig() {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 3000);
  const r = createCameraRig(THREE, camera);
  r.setCarSpec(spec);
  return { r, camera };
}
const stage = { heightAt: () => 0 };

test("groundRef: a stale ~23 m contact reading does not drag the bonnet eye off the car", () => {
  const { r, camera } = rig();
  r.setMode("bonnet");
  const y = 60;
  r.snap(state(y, y - cg), stage);
  const sane = camera.position.y - y;
  for (let i = 0; i < 30; i++) r.update(1 / 60, state(y, y - 23.6), stage, {});
  const stale = camera.position.y - y;
  assert.ok(Math.abs(stale - sane) < 0.05, `eye moved ${stale - sane} m under stale contacts`);
});

test("groundRef: converges within ~1 s once readings are sane (follows a real ride-height change)", () => {
  const { r, camera } = rig();
  r.setMode("bonnet");
  const y = 60;
  r.snap(state(y, y - cg), stage);
  const base = camera.position.y - y;
  for (let i = 0; i < 60; i++) r.update(1 / 60, state(y, y - (cg - 0.1)), stage, {});
  const shift = camera.position.y - y - base;
  assert.ok(Math.abs(shift - 0.1) < 0.012, `eye shift ${shift}, want ~0.1`);
});

test("first-person lenses use a 0.06 m near plane; chase and far stay 0.2", () => {
  const { r, camera } = rig();
  for (const m of ["bumper", "bonnet", "cockpit"]) {
    r.setMode(m); r.snap(state(60, 60 - cg), stage);
    assert.equal(camera.near, 0.06, m);
  }
  for (const m of ["chase", "far"]) {
    r.setMode(m); r.snap(state(60, 60 - cg), stage);
    assert.equal(camera.near, 0.2, m);
  }
});

function fakeDom() {
  const ctx = new Proxy({}, {
    get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : k === "getImageData" ? () => ({}) : k === "measureText" ? () => ({ width: 10 }) : typeof k === "string" ? (t[k] ?? (() => {})) : undefined),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

test("car rigY learning rejects a contact reading more than 0.4 m from cgHeight", () => {
  fakeDom();
  const car = createCarVisual(THREE, spec, {});
  const y = 60;
  car.update(state(y, y - 23.6), 1 / 60, {});
  assert.ok(Math.abs(car.groundOffset - cg) < 1e-6, `groundOffset ${car.groundOffset} after stale reading`);
  car.update(state(y, y - (cg + 0.05)), 1 / 60, {});
  assert.ok(Math.abs(car.groundOffset - (cg + 0.05)) < 1e-6, `groundOffset ${car.groundOffset} after sane reading`);
  car.dispose();
});

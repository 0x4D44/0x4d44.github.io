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

// ---- round 4 (M1): the cockpit eye is where the driver's head is, for every car
import { dimsFor, eyePoints } from "../render/cars/profiles.mjs";
import { cockpitLayout } from "../render/cars/layout.mjs";
import { CAR_IDS } from "../core/cars.mjs";
import { readFileSync } from "node:fs";

// COCKPIT_BREAK=old restores the round-3 formula (a fixed 1.16 m behind the windscreen base) to prove the tests can fail.
function cockpitEye(id) {
  const d = dimsFor(CARS[id]);
  if (process.env.COCKPIT_BREAK === "old") return [0.36, Math.min(d.sill + 1.0, d.roof - 0.2), d.zAt(d.cabin.t0) + 0.06 + 0.6 + 0.5];
  return eyePoints(CARS[id]).cockpit;
}

for (const id of CAR_IDS) {
  test(`cockpit eye (${id}): inside the cabin, in front of the seat back, behind the wheel`, () => {
    const d = dimsFor(CARS[id]), L = cockpitLayout(d), e = cockpitEye(id);
    assert.ok(e[2] > d.zAt(d.cabin.t0) && e[2] < d.zAt(d.cabin.t1), `eye z ${e[2]} outside cabin`);
    assert.ok(e[1] < d.roof - 0.1 && e[1] > d.sill + 0.6, `eye y ${e[1]}`);
    assert.ok(e[2] < L.ZS + 0.38 - 0.1, `eye z ${e[2]} not in front of the seat back ${(L.ZS + 0.38).toFixed(2)}`);
    assert.ok(e[2] > L.wheel.z + 0.3, `eye z ${e[2]} not behind the wheel ${L.wheel.z.toFixed(2)}`);
  });

  test(`cockpit eye (${id}): the forward cone toward the windscreen meets no interior surface nearer than 0.6 m`, () => {
    fakeDom();
    const car = createCarVisual(THREE, CARS[id], {});
    car.setViewMode("cockpit");
    car.update(state(60, 60 - CARS[id].cgHeight), 1 / 60, {});
    const d = dimsFor(CARS[id]), e = cockpitEye(id);
    car.object3d.position.set(0, 0, 0); car.object3d.rotation.set(0, 0, 0); car.object3d.updateMatrixWorld(true);
    const rigY = -car.groundOffset;
    const meshes = [];
    car.object3d.traverse((o) => { if (o.isMesh && o.visible && !(o.material.isMeshBasicMaterial && o.material.transparent)) meshes.push(o); });
    const origin = new THREE.Vector3(e[0], e[1] + rigY, e[2]);
    // windscreen centre: midway between the screen base and the header
    const base = new THREE.Vector3(0, d.topC(d.cabin.t0 + 0.012), d.zAt(d.cabin.t0 + 0.012)), top = new THREE.Vector3(0, d.roof, d.zAt(d.cabin.rs));
    const aim = base.add(top).multiplyScalar(0.5); aim.y += rigY;
    const fwd = aim.sub(origin).normalize();
    const yaw0 = Math.atan2(-fwd.x, -fwd.z), pit0 = Math.asin(fwd.y);
    const ray = new THREE.Raycaster();
    let nearest = Infinity, what = "";
    for (let dy = -8; dy <= 8; dy += 4) for (let dx = -15; dx <= 15; dx += 5) {
      const yaw = yaw0 + dx * Math.PI / 180, pit = pit0 + dy * Math.PI / 180;
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit));
      ray.set(origin, dir); ray.near = 0; ray.far = 0.6;
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit && hit.distance < nearest) { nearest = hit.distance; what = `dx ${dx} dy ${dy} mesh verts ${hit.object.geometry.attributes.position.count}`; }
    }
    assert.ok(nearest === Infinity, `interior surface at ${nearest.toFixed(2)} m inside the forward cone (${what})`);
    car.dispose();
  });

  // The cone above is narrow (+-15 x +-8 deg). The round-4 Piwakawaka mirror sat 0.27 m from the eye, up and to the left: outside
  // the cone, but a dark block over the top-left of the screen. Across the whole visible frustum nothing may be this close.
  test(`cockpit eye (${id}): nothing within 0.3 m of the eye anywhere in the visible frustum (+-40 x -20..+24 deg)`, () => {
    fakeDom();
    const car = createCarVisual(THREE, CARS[id], {});
    car.setViewMode("cockpit");
    car.update(state(60, 60 - CARS[id].cgHeight), 1 / 60, {});
    const e = cockpitEye(id);
    car.object3d.position.set(0, 0, 0); car.object3d.rotation.set(0, 0, 0); car.object3d.updateMatrixWorld(true);
    const rigY = -car.groundOffset;
    const meshes = [];
    car.object3d.traverse((o) => { if (o.isMesh && o.visible && !(o.material.isMeshBasicMaterial && o.material.transparent)) meshes.push(o); });
    const origin = new THREE.Vector3(e[0], e[1] + rigY, e[2]);
    const ray = new THREE.Raycaster();
    let nearest = Infinity, what = "";
    for (let dy = -20; dy <= 24; dy += 4) for (let dx = -40; dx <= 40; dx += 5) {
      const yaw = dx * Math.PI / 180, pit = dy * Math.PI / 180; // straight ahead (-z), the view the camera rig gives
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit));
      ray.set(origin, dir); ray.near = 0; ray.far = 0.3;
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit && hit.distance < nearest) { nearest = hit.distance; what = `dx ${dx} dy ${dy} mesh verts ${hit.object.geometry.attributes.position.count}`; }
    }
    assert.ok(nearest === Infinity, `surface at ${nearest.toFixed(2)} m inside the view (${what})`);
    car.dispose();
  });
}

import { cabinVolume, insideCabin } from "../render/cars/layout.mjs";
for (const id of CAR_IDS) {
  test(`cockpit weather (${id}): the cabin volume contains the eye and the seats, not the road ahead, the roof top or the tail; it is on only in the cockpit view`, () => {
    fakeDom();
    const d = dimsFor(CARS[id]), v = cabinVolume(d), e = cockpitEye(id), env = {};
    const car = createCarVisual(THREE, CARS[id], {});
    car.setViewMode("cockpit");
    car.update(state(60, 60 - CARS[id].cgHeight), 1 / 60, env);
    assert.ok(env.cabin && env.cabin.on === true, "cockpit view must switch the cabin cull on");
    assert.ok(env.cabin.inv && env.cabin.vol, "cabin carries the world->rig matrix and the volume");
    assert.ok(insideCabin(v, e[0], e[1], e[2]), `eye ${e} is inside the cabin`);
    assert.ok(insideCabin(v, e[0], e[1] + 0.12, e[2] - 0.15), "headliner air above the dash is inside");
    assert.ok(!insideCabin(v, 0, d.roof * 0.7, v.zb - 0.4), "road side of the windscreen is outside");
    assert.ok(!insideCabin(v, 0, d.roof + 0.4, e[2]), "above the roof is outside");
    assert.ok(!insideCabin(v, 0, (d.sill + d.roof) / 2, v.zRear + 0.4), "behind the rear glass is outside");
    assert.ok(!insideCabin(v, v.hw + 0.3, e[1], e[2]), "beside the car is outside");
    // the matrix maps world to rig space: with the car at the origin and level, the world-space eye maps back to the rig-space eye
    const p = new THREE.Vector3(e[0], e[1] + (-car.groundOffset), e[2]).applyMatrix4(env.cabin.inv);
    assert.ok(Math.hypot(p.x - e[0], p.z - e[2]) < 0.35, `inv maps the eye to ${p.toArray().map((x) => x.toFixed(2))}`);
    const base = Math.hypot(e[1] - v.yb, e[2] - v.zb);
    assert.ok(env.cabin.glassDist > base && env.cabin.glassDist < base + 0.5, `lens drop plane ${env.cabin.glassDist} is just beyond the windscreen base (${base.toFixed(2)})`);
    car.setViewMode("chase"); car.update(state(60, 60 - CARS[id].cgHeight), 1 / 60, env);
    assert.equal(env.cabin.on, false, "other views switch it off");
    car.dispose();
  });
}
test("weather vertex shader culls particles inside the cabin volume (rain and snow share it)", () => {
  const src = readFileSync(new URL("../render/weather.mjs", import.meta.url), "utf8");
  assert.ok(/uCabinOn > 0\.5/.test(src) && /vFade = 0\.0/.test(src), "cabin cull in the particle vertex shader");
  // the screen-space lens droplets (render/fx.mjs, the dots that sat on the Huia headliner in snow) are depth-tested at the glass in the cockpit view
  const fx = readFileSync(new URL("../render/fx.mjs", import.meta.url), "utf8");
  assert.ok(/lensMat\.depthTest = !!cab/.test(fx) && /uNdcZ/.test(fx), "fx lens droplets are depth-tested against the cabin in the cockpit view");
  assert.ok(/environment\.cabin/.test(readFileSync(new URL("../render/renderer.mjs", import.meta.url), "utf8")), "renderer hands environment.cabin to weather.update");
});

test("no Math.random in render/car.mjs or render/cars/* (visuals are seeded)", () => {
  for (const f of ["../render/car.mjs", "../render/cars/body.mjs", "../render/cars/geo.mjs", "../render/cars/interior.mjs", "../render/cars/layout.mjs", "../render/cars/livery.mjs", "../render/cars/materials.mjs", "../render/cars/profiles.mjs", "../render/cars/wheels.mjs"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.random/.test(src), `${f} uses Math.random`);
  }
});

// Run: node --test tests/render.test.mjs
//
// THREE constructs fine under Node as long as nothing asks for a WebGLRenderer,
// so createRenderer() takes a `rendererFactory` and these tests hand it a
// counting stub. That means the scene graph, the geometries, the materials and
// the render targets under test are the real ones — only the GL calls are fake.
//
// The rig maths, the pools, the autoscaler, the shadow fit and the LOD selector
// are pure exports and are tested without any of that.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "../three.module.min.js";
import { surfaceProps, SURFACE } from "../surfaces.js";
import {
  CAMERA_MODES,
  CAMERA_CYCLE,
  QUALITY_LEVELS,
  SCALE_STEPS,
  qualitySettings,
  cameraParams,
  makeCarSample,
  sampleCar,
  makeCameraRig,
  resetCameraRig,
  updateCameraRig,
  boomTarget,
  boomDirectionTarget,
  lookTarget,
  chaseFov,
  createParticlePool,
  resetParticlePool,
  spawnParticle,
  stepParticlePool,
  packParticles,
  dustSpawnRate,
  roosterStrength,
  createAutoScaler,
  autoScalerSample,
  autoScalerLevel,
  autoScalerScale,
  makeShadowFit,
  fitShadowFrustum,
  shadowLightSpace,
  roadSpanPoints,
  selectLod,
  lodFade,
  LOD_BANDS,
  createResourceBin,
  createRenderer,
} from "../render.js";

const RENDER_SRC = readFileSync(fileURLToPath(new URL("../render.js", import.meta.url)), "utf8");

// ---- helpers -------------------------------------------------------------

function sampleAt(over = {}) {
  const s = makeCarSample();
  return Object.assign(s, over);
}

function flatGround() {
  return () => 0;
}

function rigDistance(rig, s) {
  return Math.hypot(rig.px - s.x, rig.pz - s.z);
}

// ---- camera rig ----------------------------------------------------------

test("camera modes and cycle are coherent", () => {
  assert.ok(CAMERA_MODES.includes("chase"));
  assert.ok(CAMERA_MODES.includes("cockpit"));
  assert.ok(CAMERA_MODES.includes("tv"));
  assert.ok(CAMERA_MODES.includes("finish"));
  for (const m of CAMERA_CYCLE) assert.ok(CAMERA_MODES.includes(m), `${m} missing from modes`);
  // The finish flourish is entered by the state machine, never by the camera key.
  assert.ok(!CAMERA_CYCLE.includes("finish"));
  for (const m of CAMERA_MODES) {
    const p = cameraParams(m);
    assert.equal(p.mode, m);
    assert.ok(p.fovMax >= p.fovBase);
  }
});

test("chase camera settles behind and above the car by the intended amount", () => {
  const p = cameraParams("chase");
  const s = sampleAt({ x: 100, y: 20, z: -40, yaw: 0 });
  const rig = makeCameraRig("chase");
  resetCameraRig(rig, s, p, null);
  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);

  // yaw 0 means the nose points down +Z, so the boom sits at -Z.
  assert.ok(Math.abs(rig.px - s.x) < 1e-3, `x drifted: ${rig.px - s.x}`);
  assert.ok(Math.abs((s.z - rig.pz) - p.distance) < 1e-3, `distance ${s.z - rig.pz}`);
  assert.ok(Math.abs((rig.py - s.y) - p.height) < 1e-2, `height ${rig.py - s.y}`);
  assert.ok(Math.abs(rigDistance(rig, s) - p.distance) < 1e-2);
});

test("chase camera sits behind the car whatever the heading", () => {
  const p = cameraParams("chase");
  for (const yaw of [0, 0.7, Math.PI / 2, 2.4, -1.1, Math.PI]) {
    const s = sampleAt({ yaw });
    const rig = makeCameraRig("chase");
    resetCameraRig(rig, s, p, null);
    for (let i = 0; i < 400; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // The vector from the camera to the car must point along the nose.
    const dx = s.x - rig.px;
    const dz = s.z - rig.pz;
    const len = Math.hypot(dx, dz);
    const dot = (dx / len) * fx + (dz / len) * fz;
    assert.ok(dot > 0.999, `yaw ${yaw}: dot ${dot}`);
    assert.ok(Math.abs(len - p.distance) < 1e-2);
  }
});

test("field of view is monotonic in speed and clamped at both ends", () => {
  const p = cameraParams("chase");
  let prev = -Infinity;
  for (let v = -20; v <= 200; v += 0.5) {
    const f = chaseFov(v, p);
    assert.ok(f >= prev - 1e-9, `fov fell at ${v}: ${f} < ${prev}`);
    assert.ok(f >= p.fovBase - 1e-9 && f <= p.fovMax + 1e-9, `fov out of range at ${v}: ${f}`);
    prev = f;
  }
  assert.equal(chaseFov(0, p), p.fovBase);
  assert.ok(Math.abs(chaseFov(500, p) - p.fovMax) < 1e-9);
  // Widening with speed is the cheapest speed cue there is; it must actually widen.
  assert.ok(chaseFov(60, p) - chaseFov(5, p) > 15);
});

test("the in-car cameras never pump their field of view", () => {
  for (const mode of ["bonnet", "cockpit", "bumper"]) {
    const p = cameraParams(mode);
    assert.equal(p.fovBase, p.fovMax, `${mode} pumps`);
    assert.equal(chaseFov(0, p), chaseFov(80, p));
  }
});

test("the chase rig is framerate independent (this is what catches a fixed lerp)", () => {
  const p = cameraParams("chase");
  const s = sampleAt({ x: 12, y: 3, z: 8, yaw: 0.4, vx: 0, vz: 0, speed: 0 });

  const a = makeCameraRig("chase");
  const b = makeCameraRig("chase");
  for (const rig of [a, b]) {
    resetCameraRig(rig, s, p, null);
    // Displace the damped state so the comparison is of a real transient, not of
    // two rigs that were already at rest.
    rig.bx += 7; rig.by += 4.5; rig.bz -= 6;
    rig.ax -= 9; rig.ay += 2; rig.az += 5;
    rig.fov += 12;
    rig.roll += 0.2;
  }

  for (let i = 0; i < 8; i += 1) updateCameraRig(a, s, p, 1 / 30, null);
  for (let i = 0; i < 16; i += 1) updateCameraRig(b, s, p, 1 / 60, null);

  const eps = 1e-6;
  for (const k of ["bx", "by", "bz", "ax", "ay", "az", "fov", "roll", "px", "py", "pz"]) {
    assert.ok(Math.abs(a[k] - b[k]) < eps, `${k}: ${a[k]} vs ${b[k]}`);
  }
  assert.ok(Math.abs(a.time - b.time) < 1e-9);
});

test("a fixed lerp would fail the framerate test (control)", () => {
  // The same experiment against a naive rig, to prove the assertion above has
  // teeth rather than passing because both sides did nothing.
  const lerpStep = (c, t) => c + (t - c) * 0.12;
  let a = 10;
  let b = 10;
  for (let i = 0; i < 8; i += 1) a = lerpStep(a, 0);
  for (let i = 0; i < 16; i += 1) b = lerpStep(b, 0);
  assert.ok(Math.abs(a - b) > 1, `naive lerp agreed: ${a} vs ${b}`);
});

test("every camera kind is framerate independent at rest", () => {
  const s = sampleAt({ x: 4, y: 2, z: -3, yaw: 0.2 });
  for (const mode of CAMERA_MODES) {
    if (mode === "finish") continue;   // orbit advances with time, tested below
    const p = cameraParams(mode);
    const a = makeCameraRig(mode);
    const b = makeCameraRig(mode);
    for (const rig of [a, b]) {
      rig.hasAnchor = true;
      rig.anchorX = 30; rig.anchorY = 9; rig.anchorZ = 12;
      resetCameraRig(rig, s, p, null);
      rig.bx += 5; rig.by += 3; rig.bz -= 4;
      rig.ax += 6;
    }
    for (let i = 0; i < 6; i += 1) updateCameraRig(a, s, p, 1 / 30, null);
    for (let i = 0; i < 12; i += 1) updateCameraRig(b, s, p, 1 / 60, null);
    for (const k of ["bx", "by", "bz", "ax", "ay", "az"]) {
      assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${mode}.${k}: ${a[k]} vs ${b[k]}`);
    }
  }
});

test("the look target leads the velocity, not the nose, when the car is sideways", () => {
  const p = cameraParams("chase");
  // Nose down +Z, travelling almost straight down +X: a big slide.
  const s = sampleAt({
    yaw: 0, vx: 24, vz: 3, speed: Math.hypot(24, 3), forwardSpeed: 3, slipAngle: 1.4,
  });
  const t = { x: 0, y: 0, z: 0 };
  lookTarget(t, s, p);
  assert.ok(t.x > 0, "target should be down the velocity");
  assert.ok(t.x > t.z * 3, `target followed the nose: (${t.x}, ${t.z})`);

  // Straight ahead, the two agree.
  const straight = sampleAt({ yaw: 0, vx: 0, vz: 24, speed: 24, forwardSpeed: 24 });
  lookTarget(t, straight, p);
  assert.ok(Math.abs(t.x) < 1e-9);
  assert.ok(t.z > 5);

  // At a standstill it falls back to the nose rather than dividing by zero.
  const still = sampleAt({ yaw: Math.PI / 2 });
  lookTarget(t, still, p);
  assert.ok(t.x > 4 && Math.abs(t.z) < 1e-6, `standstill target (${t.x}, ${t.z})`);
});

test("the boom rotates onto the velocity with speed and never behind a reversing car", () => {
  const p = cameraParams("chase");
  const still = sampleAt({ yaw: 0.3 });
  assert.equal(boomDirectionTarget(still, p), 0.3);

  const sliding = sampleAt({
    yaw: 0, vx: 20, vz: 4, speed: Math.hypot(20, 4), forwardSpeed: 4,
  });
  const dir = boomDirectionTarget(sliding, p);
  assert.ok(dir > 0.2, `boom did not follow the slide: ${dir}`);
  assert.ok(dir < Math.atan2(20, 4), "boom over-rotated past the velocity");

  const reversing = sampleAt({ yaw: 0, vx: 0, vz: -6, speed: 6, forwardSpeed: -6 });
  assert.equal(boomDirectionTarget(reversing, p), 0, "camera swapped ends in reverse");
});

test("the camera is never left below the terrain", () => {
  const p = cameraParams("chase");
  // A wall of terrain behind the car: the boom would sit inside it.
  const ground = (x, z) => (z < -2 ? 40 : 0);
  const s = sampleAt({ x: 0, y: 0, z: 0, yaw: 0 });
  const rig = makeCameraRig("chase");
  resetCameraRig(rig, s, p, ground);
  for (let i = 0; i < 300; i += 1) {
    updateCameraRig(rig, s, p, 1 / 60, ground);
    assert.ok(rig.py >= ground(rig.px, rig.pz) + p.clearance - 1e-6,
      `camera under terrain: y=${rig.py} ground=${ground(rig.px, rig.pz)}`);
  }
  assert.ok(rig.py > 40, `camera did not climb the bank: ${rig.py}`);
});

test("the camera rises over a jump and settles again", () => {
  const p = cameraParams("chase");
  const rig = makeCameraRig("chase");
  const grounded = sampleAt({ speed: 30, vz: 30, forwardSpeed: 30 });
  resetCameraRig(rig, grounded, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, grounded, p, 1 / 60, null);
  const settled = rig.py;

  const airborne = sampleAt({ speed: 30, vz: 30, forwardSpeed: 30, airTime: 0.8, onGround: 0 });
  for (let i = 0; i < 90; i += 1) updateCameraRig(rig, airborne, p, 1 / 60, null);
  assert.ok(rig.py > settled + 0.4, `camera did not lift over the jump: ${rig.py} vs ${settled}`);

  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, grounded, p, 1 / 60, null);
  assert.ok(Math.abs(rig.py - settled) < 0.02, `camera did not settle: ${rig.py} vs ${settled}`);
});

test("the camera rolls and pitches with g, and the roll is bounded", () => {
  const p = cameraParams("chase");
  const rig = makeCameraRig("chase");
  const left = sampleAt({ lateralG: 1.6, longitudinalG: -1.2 });
  resetCameraRig(rig, left, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, left, p, 1 / 60, null);
  assert.ok(rig.roll < -0.01, `no roll under lateral g: ${rig.roll}`);
  assert.ok(Math.abs(rig.roll) <= 0.30 + 1e-9);
  assert.ok(rig.pitchTrim < 0, `no pitch under braking: ${rig.pitchTrim}`);

  const right = sampleAt({ lateralG: -1.6 });
  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, right, p, 1 / 60, null);
  assert.ok(rig.roll > 0.01, "roll did not reverse with the corner");

  const huge = sampleAt({ lateralG: 40 });
  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, huge, p, 1 / 60, null);
  assert.ok(Math.abs(rig.roll) <= 0.30 + 1e-9, `roll unbounded: ${rig.roll}`);
});

test("shake scales with roughness and speed and stays small", () => {
  const p = cameraParams("chase");
  function settledShake(roughness, speed, onGround = 4) {
    const rig = makeCameraRig("chase");
    const s = sampleAt({ roughness, speed, vz: speed, forwardSpeed: speed, onGround });
    resetCameraRig(rig, s, p, null);
    for (let i = 0; i < 600; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
    return rig.shake;
  }
  assert.equal(settledShake(0, 40), 0);
  assert.ok(settledShake(0.9, 40) > settledShake(0.2, 40));
  assert.ok(settledShake(0.9, 40) > settledShake(0.9, 5));
  // In the air there is nothing to shake against.
  assert.ok(settledShake(0.9, 40, 0) < settledShake(0.9, 40) * 0.5);
  // It must never be large enough to hide the road.
  assert.ok(settledShake(1, 120) < 0.25, "shake too strong");
});

test("the cockpit camera has head inertia and counter-steers into the corner", () => {
  const p = cameraParams("cockpit");
  const rig = makeCameraRig("cockpit");
  const s = sampleAt({ steer: 0.8, lateralG: 1.4, slipAngle: 0.2 });
  resetCameraRig(rig, s, p, null);
  assert.equal(rig.headX, 0);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
  assert.ok(Math.abs(rig.headX) > 1e-4, "no head inertia under lateral g");
  assert.ok(rig.lookYaw > 0.01, `no look into the corner: ${rig.lookYaw}`);
  assert.ok(Math.abs(rig.lookYaw) <= 0.42 + 1e-9);

  // The look is bounded even with an absurd slip angle.
  const spun = sampleAt({ steer: 1, slipAngle: -3 });
  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, spun, p, 1 / 60, null);
  assert.ok(Math.abs(rig.lookYaw) <= 0.42 + 1e-9);
});

test("a mounted camera rides with the chassis", () => {
  const p = cameraParams("bumper");
  const rig = makeCameraRig("bumper");
  const s = sampleAt({ x: 5, y: 1, z: 9, yaw: Math.PI / 2 });
  resetCameraRig(rig, s, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
  // yaw = pi/2 means the nose points down +X, so the bumper is +X of the car.
  assert.ok(Math.abs((rig.px - s.x) - p.localZ) < 1e-3, `x ${rig.px - s.x}`);
  assert.ok(Math.abs(rig.pz - s.z) < 1e-3, `z ${rig.pz - s.z}`);
  assert.ok(Math.abs((rig.py - s.y) - p.localY) < 1e-3);
});

test("the finish flourish orbits the car", () => {
  const p = cameraParams("finish");
  const rig = makeCameraRig("finish");
  const s = sampleAt({});
  resetCameraRig(rig, s, p, null);
  const a0 = Math.atan2(rig.px - s.x, rig.pz - s.z);
  for (let i = 0; i < 240; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
  const a1 = Math.atan2(rig.px - s.x, rig.pz - s.z);
  assert.notEqual(a0.toFixed(3), a1.toFixed(3), "the flourish did not move");
  assert.ok(Math.abs(rigDistance(rig, s) - p.distance) < 0.6);
});

test("sampleCar reads exactly the CarState fields the contract pins", () => {
  const car = {
    pos: { x: 1, y: 2, z: 3 },
    vel: { x: 4, y: 5, z: 6 },
    yaw: 0.1, pitch: 0.2, roll: 0.3,
    speed: 30, forwardSpeed: 29, slipAngle: 0.4,
    lateralG: 1.1, longitudinalG: -0.5, verticalG: 1.3,
    input: { steer: 0.6 },
    airTime: 0.2, onGround: 3,
  };
  const out = sampleCar(makeCarSample(), car, { roughness: 0.7 });
  assert.equal(out.x, 1);
  assert.equal(out.vz, 6);
  assert.equal(out.steer, 0.6);
  assert.equal(out.roughness, 0.7);
  assert.equal(out.onGround, 3);
  // No surface supplied: falls back rather than throwing.
  const bare = sampleCar(makeCarSample(), car, null);
  assert.equal(typeof bare.roughness, "number");
});

// ---- particle pool -------------------------------------------------------

function spawnOne(pool, life = 1) {
  return spawnParticle(pool, 0, 0, 0, 0, 0, 0, life, 0.2, 0.6, 1, 1, 1, 0, 1, 1, 0);
}

test("the particle pool never grows, whatever it is asked for", () => {
  const pool = createParticlePool(64);
  const before = {
    cap: pool.capacity,
    x: pool.x.length,
    life: pool.life.length,
    out: pool.outPos.length,
  };
  for (let i = 0; i < 20000; i += 1) spawnOne(pool, 5);
  assert.equal(pool.capacity, before.cap);
  assert.equal(pool.x.length, before.x);
  assert.equal(pool.life.length, before.life);
  assert.equal(pool.outPos.length, before.out);
  assert.ok(pool.alive <= pool.capacity, `alive ${pool.alive} > capacity`);
  assert.ok(pool.recycled > 0, "overflow did not recycle");
  assert.equal(pool.spawned, 20000);
});

test("dead particles go back on the free list and are reused", () => {
  const pool = createParticlePool(16);
  for (let i = 0; i < 16; i += 1) spawnOne(pool, 0.5);
  assert.equal(pool.alive, 16);
  assert.equal(pool.freeCount, 0);
  // The step clamps dt to 100 ms, so a long stall cannot teleport a plume; age
  // them out over several steps rather than one impossible one.
  for (let i = 0; i < 8; i += 1) stepParticlePool(pool, 0.1, 0, 0, 0);
  assert.equal(pool.alive, 0);
  assert.equal(pool.freeCount, 16);
  // The next 16 spawns must come out of the free list, not the steal cursor.
  const recycledBefore = pool.recycled;
  for (let i = 0; i < 16; i += 1) spawnOne(pool, 1);
  assert.equal(pool.alive, 16);
  assert.equal(pool.recycled, recycledBefore);
});

test("the recycle cursor walks the pool rather than thrashing one slot", () => {
  const pool = createParticlePool(8);
  for (let i = 0; i < 8; i += 1) spawnOne(pool, 100);
  const touched = new Set();
  for (let i = 0; i < 8; i += 1) touched.add(spawnOne(pool, 100));
  assert.equal(touched.size, 8, "overflow reused the same slot");
});

test("particles integrate, drift with the wind and expire", () => {
  const pool = createParticlePool(4);
  spawnParticle(pool, 0, 10, 0, 0, 0, 0, 2, 0.2, 0.6, 1, 1, 1, 0, 0.5, 1, 0);
  stepParticlePool(pool, 0.1, 8, 0, 0);
  assert.ok(pool.x[0] > 0, "no wind drift");
  assert.ok(pool.y[0] < 10, "no gravity");
  assert.equal(pool.alive, 1);
  for (let i = 0; i < 40; i += 1) stepParticlePool(pool, 0.1, 0, 0, 0);
  assert.equal(pool.alive, 0);
});

test("packing compacts live particles to the front and fades them over life", () => {
  const pool = createParticlePool(8);
  for (let i = 0; i < 6; i += 1) spawnOne(pool, 1);
  stepParticlePool(pool, 0.05, 0, 0, 0);
  let n = packParticles(pool, 0, 1, 0);
  assert.equal(n, 6);
  assert.equal(pool.outCount, 6);
  for (let i = 0; i < n; i += 1) assert.ok(pool.outFade[i] > 0, `slot ${i} invisible`);

  // Kill three, and the pack must close up rather than leave holes.
  for (let i = 0; i < 3; i += 1) { pool.age[i] = 0.99; }
  stepParticlePool(pool, 0.05, 0, 0, 0);
  n = packParticles(pool, 0, 1, 0);
  assert.equal(n, 3);
  for (let i = 0; i < n; i += 1) assert.ok(Number.isFinite(pool.outPos[i * 3]));
});

test("resetParticlePool empties the pool without reallocating it", () => {
  const pool = createParticlePool(32);
  const buf = pool.x;
  for (let i = 0; i < 100; i += 1) spawnOne(pool, 10);
  resetParticlePool(pool);
  assert.equal(pool.alive, 0);
  assert.equal(pool.freeCount, 32);
  assert.equal(pool.x, buf, "reset reallocated the pool");
});

// ---- spawn rate ----------------------------------------------------------

function wheel(over = {}) {
  return Object.assign({
    contact: true, slipRatio: 0, slipAngle: 0, load: 3000, isFront: false,
  }, over);
}

test("dust rate tracks slip, load, speed and the surface", () => {
  const gravel = surfaceProps(SURFACE.GRAVEL);
  const tarmac = surfaceProps(SURFACE.TARMAC);

  assert.equal(dustSpawnRate(tarmac, wheel(), 30, 0), 0, "tarmac made dust");
  assert.equal(dustSpawnRate(gravel, wheel({ contact: false }), 30, 0), 0, "airborne wheel made dust");
  assert.equal(dustSpawnRate(gravel, wheel(), 0, 0), 0, "stationary wheel made dust");
  assert.equal(dustSpawnRate(null, wheel(), 30, 0), 0);

  const rolling = dustSpawnRate(gravel, wheel(), 20, 0);
  const slipping = dustSpawnRate(gravel, wheel({ slipRatio: 0.9 }), 20, 0);
  const sliding = dustSpawnRate(gravel, wheel({ slipAngle: 0.6 }), 20, 0);
  assert.ok(rolling > 0);
  assert.ok(slipping > rolling * 2, `slip did not raise the rate: ${slipping} vs ${rolling}`);
  assert.ok(sliding > rolling, "a sliding wheel should throw more than a rolling one");

  const loaded = dustSpawnRate(gravel, wheel({ load: 6000 }), 20, 0);
  const light = dustSpawnRate(gravel, wheel({ load: 200 }), 20, 0);
  assert.ok(loaded > light);

  const wet = dustSpawnRate(gravel, wheel(), 20, 1);
  assert.ok(wet < rolling * 0.4, `rain did not damp the dust: ${wet} vs ${rolling}`);

  // Monotonic in speed up to the reference, then saturating rather than exploding.
  let prev = -1;
  for (let v = 0; v <= 20; v += 1) {
    const r = dustSpawnRate(gravel, wheel(), v, 0);
    assert.ok(r >= prev, `rate fell at ${v} m/s`);
    prev = r;
  }
  assert.equal(dustSpawnRate(gravel, wheel(), 60, 0), dustSpawnRate(gravel, wheel(), 20, 0));

  // A dustier surface throws more for the same wheel.
  const sand = surfaceProps(SURFACE.SAND);
  assert.ok(dustSpawnRate(sand, wheel(), 20, 0) > dustSpawnRate(gravel, wheel(), 20, 0));

  // The quality scale is a straight multiplier, so a phone gets the same shape.
  assert.ok(Math.abs(dustSpawnRate(gravel, wheel(), 20, 0, 0.5) - rolling * 0.5) < 1e-6);
});

test("only a driven rear wheel throws a rooster tail", () => {
  assert.equal(roosterStrength(wheel({ isFront: true, slipRatio: 1 }), 1), 0);
  assert.equal(roosterStrength(wheel({ contact: false, slipRatio: 1 }), 1), 0);
  assert.equal(roosterStrength(wheel({ slipRatio: 1 }), 0), 0, "off the throttle");
  assert.ok(roosterStrength(wheel({ slipRatio: 1 }), 1) > 0.5);
  assert.ok(roosterStrength(wheel({ slipRatio: 1 }), 1)
    > roosterStrength(wheel({ slipRatio: 0.2 }), 1));
});

// ---- quality autoscaler --------------------------------------------------

function feed(as, ms, frames) {
  let actions = 0;
  for (let i = 0; i < frames; i += 1) {
    if (autoScalerSample(as, ms, ms / 1000) !== 0) actions += 1;
  }
  return actions;
}

test("the autoscaler steps down under sustained load", () => {
  const as = createAutoScaler({ index: 3 });
  assert.equal(autoScalerLevel(as), "ultra");
  assert.equal(autoScalerScale(as), 1);
  feed(as, 45, 4000);
  assert.equal(as.scaleIndex, SCALE_STEPS.length - 1, "resolution did not bottom out");
  assert.equal(as.index, 0, `level did not bottom out: ${autoScalerLevel(as)}`);
  assert.equal(as.ups, 0, "it gave something back while still overloaded");
});

test("resolution goes before quality does", () => {
  const as = createAutoScaler({ index: 3 });
  // One decision only: enough frames for a full window, then stop.
  feed(as, 45, as.window);
  assert.equal(as.index, 3, "gave up a quality level before dropping resolution");
  assert.equal(as.scaleIndex, 1);
  assert.ok(autoScalerScale(as) < 1);
});

test("the autoscaler takes it back when the load clears", () => {
  const as = createAutoScaler({ index: 3 });
  feed(as, 45, 4000);
  assert.equal(as.index, 0);
  feed(as, 7, 8000);
  assert.equal(as.index, 3, `did not recover: ${autoScalerLevel(as)}`);
  assert.equal(as.scaleIndex, 0, "did not recover resolution");
  assert.ok(as.ups > 0);
});

test("a frame time sitting exactly on the threshold changes nothing", () => {
  const as = createAutoScaler({ index: 2 });
  const changes = feed(as, as.downMs, 6000);
  assert.equal(changes, 0, `it flapped on the boundary: ${as.changes} changes`);
  assert.equal(as.index, 2);
  assert.equal(as.scaleIndex, 0);
});

test("a series straddling the threshold makes at most one change", () => {
  const as = createAutoScaler({ index: 2 });
  let last = 0;
  for (let i = 0; i < 6000; i += 1) {
    const ms = as.downMs + (i % 2 === 0 ? 0.4 : -0.4);
    const action = autoScalerSample(as, ms, ms / 1000);
    if (action !== 0) {
      assert.ok(last === 0 || action === last, "it reversed direction on the boundary");
      last = action;
    }
  }
  assert.ok(as.changes <= 1, `oscillated: ${as.changes} changes`);
  assert.ok(as.lastAvg > as.downMs - 0.05 && as.lastAvg < as.downMs + 0.05,
    `the test did not actually sit on the threshold: ${as.lastAvg}`);
});

test("a load clearly over the threshold only ever steps down, never back and forth", () => {
  const as = createAutoScaler({ index: 3 });
  for (let i = 0; i < 8000; i += 1) {
    const ms = as.downMs * 1.1;
    const action = autoScalerSample(as, ms, ms / 1000);
    assert.ok(action <= 0, "it stepped up while still over the down threshold");
  }
  assert.equal(as.ups, 0);
  assert.ok(as.downs > 0);
});

test("a small overshoot is tolerated rather than costing a quality level", () => {
  const as = createAutoScaler({ index: 3 });
  // One percent over budget is noise, not a reason to switch the shadows off.
  const ms = as.downMs * 1.01;
  for (let i = 0; i < 4000; i += 1) autoScalerSample(as, ms, ms / 1000);
  assert.equal(as.changes, 0, `gave up quality for a 1% overshoot (${as.changes} changes)`);
});

test("every change costs a cooldown, so changes cannot come back to back", () => {
  const as = createAutoScaler({ index: 3, hold: 2 });
  let lastChangeFrame = -1;
  let minGap = Infinity;
  for (let i = 0; i < 3000; i += 1) {
    if (autoScalerSample(as, 45, 0.045) !== 0) {
      if (lastChangeFrame >= 0) minGap = Math.min(minGap, i - lastChangeFrame);
      lastChangeFrame = i;
    }
  }
  // Two seconds of cooldown at 45 ms a frame is ~44 frames, plus a fresh window.
  assert.ok(minGap >= 44, `changes came ${minGap} frames apart`);
});

test("a disabled or fixed-quality scaler leaves everything alone", () => {
  const as = createAutoScaler({ index: 2, enabled: false });
  feed(as, 90, 2000);
  assert.equal(as.index, 2);
  assert.equal(as.changes, 0);
});

test("quality levels are ordered and every level is fully specified", () => {
  assert.deepEqual([...QUALITY_LEVELS], ["low", "medium", "high", "ultra"]);
  let prevParticles = -1;
  let prevDistance = -1;
  for (const level of QUALITY_LEVELS) {
    const q = qualitySettings(level);
    assert.equal(q.name, level);
    for (const key of ["shadowMapSize", "particleBudget", "sceneryDistance",
      "sceneryBudget", "pixelRatioCap", "trailCount"]) {
      assert.equal(typeof q[key], "number", `${level}.${key}`);
      assert.ok(q[key] > 0, `${level}.${key} is ${q[key]}`);
    }
    assert.ok(Array.isArray(q.lodBands) && q.lodBands.length === 3);
    assert.ok(q.particleBudget > prevParticles, `${level} particle budget out of order`);
    assert.ok(q.sceneryDistance > prevDistance, `${level} draw distance out of order`);
    prevParticles = q.particleBudget;
    prevDistance = q.sceneryDistance;
  }
  // An unknown name must not crash the renderer mid-session.
  assert.equal(qualitySettings("nonsense").name, "high");
  assert.equal(qualitySettings(undefined).name, "high");
});

// ---- shadow frustum ------------------------------------------------------

function makeStraightStage(count = 400, step = 2, halfWidth = 4) {
  const stage = {
    count, step, length: count * step,
    x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count),
    tx: new Float32Array(count), ty: new Float32Array(count), tz: new Float32Array(count),
    nx: new Float32Array(count), ny: new Float32Array(count), nz: new Float32Array(count),
    halfWidth: new Float32Array(count),
    camber: new Float32Array(count),
    curvature: new Float32Array(count),
    surface: new Uint8Array(count),
    crest: new Float32Array(count),
    jump: new Float32Array(count),
    splits: [], features: [], scenery: [], props: [],
    start: { x: 0, y: 0, z: 0, yaw: 0 },
    finish: { s: count * step, x: 0, y: 0, z: count * step },
    bounds: { minX: -300, maxX: 300, minZ: -50, maxZ: count * step + 50 },
    surfaceMix: [SURFACE.GRAVEL],
    id: "test", name: "Test", country: "Nowhere", seed: 1, notes: "",
  };
  for (let i = 0; i < count; i += 1) {
    stage.x[i] = 0;
    stage.y[i] = 0;
    stage.z[i] = i * step;
    stage.tx[i] = 0; stage.ty[i] = 0; stage.tz[i] = 1;
    stage.nx[i] = 0; stage.ny[i] = 1; stage.nz[i] = 0;
    stage.halfWidth[i] = halfWidth;
    stage.surface[i] = SURFACE.GRAVEL;
  }
  return stage;
}

test("road span points cover both edges of the road ahead", () => {
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const n = roadSpanPoints(buf, stage, 10, 40, 5, 1, 1.5);
  assert.equal(n, (40 + 5 + 1) * 2);
  let sawLeft = false;
  let sawRight = false;
  for (let i = 0; i < n; i += 1) {
    const x = buf[i * 3];
    if (x > 4) sawRight = true;
    if (x < -4) sawLeft = true;
  }
  assert.ok(sawLeft && sawRight, "the span only covered one side of the road");
  // Never runs off the ends of the arrays.
  assert.ok(roadSpanPoints(buf, stage, 0, 10_000, 10_000, 1, 1) > 0);
});

test("the fitted shadow box contains the car and the visible road span", () => {
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const carIndex = 60;
  const n = roadSpanPoints(buf, stage, carIndex, 45, 6, 1, 2.5);
  const fit = makeShadowFit();
  // A low-ish afternoon sun, which is the hardest case for a fit.
  const sun = { x: 0.55, y: 0.42, z: -0.72 };
  fitShadowFrustum(fit, buf, n, sun.x, sun.y, sun.z, 2048, 3.5);
  assert.ok(fit.ok);

  const ls = { r: 0, u: 0, f: 0 };
  for (let i = 0; i < n; i += 1) {
    shadowLightSpace(fit, buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2], ls);
    assert.ok(ls.r >= fit.left - 1e-4 && ls.r <= fit.right + 1e-4,
      `point ${i} outside horizontally: ${ls.r} not in [${fit.left}, ${fit.right}]`);
    assert.ok(ls.u >= fit.bottom - 1e-4 && ls.u <= fit.top + 1e-4,
      `point ${i} outside vertically: ${ls.u}`);
    assert.ok(ls.f >= fit.near - 1e-4 && ls.f <= fit.far + 1e-4,
      `point ${i} outside in depth: ${ls.f} not in [${fit.near}, ${fit.far}]`);
  }
});

test("the fitted box is close to the ideal — a loose fit is the staircase bug", () => {
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const n = roadSpanPoints(buf, stage, 60, 45, 6, 1, 2.5);
  const fit = makeShadowFit();
  const margin = 3.5;
  fitShadowFrustum(fit, buf, n, 0.55, 0.42, -0.72, 2048, margin);

  // The ideal is the exact bounding extent of the same points in the same basis.
  let minR = Infinity; let maxR = -Infinity;
  let minU = Infinity; let maxU = -Infinity;
  const ls = { r: 0, u: 0, f: 0 };
  for (let i = 0; i < n; i += 1) {
    shadowLightSpace(fit, buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2], ls);
    if (ls.r < minR) minR = ls.r; if (ls.r > maxR) maxR = ls.r;
    if (ls.u < minU) minU = ls.u; if (ls.u > maxU) maxU = ls.u;
  }
  const idealSide = Math.max(maxR - minR, maxU - minU);
  const side = fit.right - fit.left;
  // A square box around the longest axis plus the margin, and nothing more.
  assert.ok(side >= idealSide - 1e-6, "the fit is smaller than the content");
  assert.ok(side <= idealSide + 2 * margin + 2 * fit.texel + 1e-6,
    `fit is loose: ${side} vs ideal ${idealSide}`);

  // And it must be nowhere near a stage-wide box. 4096 texels over 10 km is a
  // texel every 2.4 m; this has to be centimetres.
  assert.ok(fit.texel < 0.12, `texel is ${fit.texel} m — shadows would be stairs`);
  assert.ok(side < 220, `box is ${side} m across`);
});

test("the shadow centre snaps to whole texels, so the edges do not crawl", () => {
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const a = makeShadowFit();
  const b = makeShadowFit();
  const n = roadSpanPoints(buf, stage, 60, 45, 6, 1, 2.5);
  fitShadowFrustum(a, buf, n, 0.4, 0.6, -0.7, 2048, 3.5);
  // Nudge every point by a fraction of a texel: the fitted centre must not move.
  for (let i = 0; i < n; i += 1) buf[i * 3] += a.texel * 0.2;
  fitShadowFrustum(b, buf, n, 0.4, 0.6, -0.7, 2048, 3.5);
  const moved = Math.hypot(a.lightX - b.lightX, a.lightY - b.lightY, a.lightZ - b.lightZ);
  assert.ok(moved < a.texel * 1.01, `centre crawled ${moved} m for a sub-texel move`);
});

test("the shadow fit survives a sun overhead, on the horizon, and no points at all", () => {
  const fit = makeShadowFit();
  const pts = new Float32Array([0, 0, 0, 10, 2, 10, -5, 1, 7]);
  for (const sun of [[0, 1, 0], [1, 0, 0], [0, 0.02, 1], [0, -1, 0]]) {
    fitShadowFrustum(fit, pts, 3, sun[0], sun[1], sun[2], 1024, 2);
    assert.ok(fit.ok, `fit failed for sun ${sun}`);
    assert.ok(Number.isFinite(fit.left) && Number.isFinite(fit.far));
    assert.ok(fit.far > fit.near);
    assert.ok(fit.right > fit.left);
    // The basis stays orthonormal whatever the sun does.
    const dot = fit.rx * fit.ux + fit.ry * fit.uy + fit.rz * fit.uz;
    assert.ok(Math.abs(dot) < 1e-6, `basis not orthogonal: ${dot}`);
    assert.ok(Math.abs(Math.hypot(fit.rx, fit.ry, fit.rz) - 1) < 1e-6);
    const ls = { r: 0, u: 0, f: 0 };
    for (let i = 0; i < 3; i += 1) {
      shadowLightSpace(fit, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], ls);
      assert.ok(ls.r >= fit.left - 1e-4 && ls.r <= fit.right + 1e-4);
      assert.ok(ls.f >= fit.near - 1e-4 && ls.f <= fit.far + 1e-4);
    }
  }
  fit.ok = true;
  fitShadowFrustum(fit, pts, 0, 0, 1, 0, 1024, 2);
  assert.equal(fit.ok, false, "an empty point set should not produce a fit");
});

// ---- level of detail -----------------------------------------------------

test("LOD selection is monotonic in distance", () => {
  for (const current of [0, 1, 2, 3]) {
    let prev = -1;
    for (let d = 0; d < 900; d += 3) {
      const lod = selectLod(d, current, LOD_BANDS, 12);
      assert.ok(lod >= prev, `lod fell from ${prev} to ${lod} at ${d} m`);
      prev = lod;
    }
    assert.equal(selectLod(0, current, LOD_BANDS, 12), 0);
    assert.equal(selectLod(5000, current, LOD_BANDS, 12), LOD_BANDS.length);
  }
});

test("LOD selection has hysteresis around every band", () => {
  const h = 12;
  for (let i = 0; i < LOD_BANDS.length; i += 1) {
    const b = LOD_BANDS[i];
    // Just inside the band, coming from the near side: stays coarse-side-down.
    assert.equal(selectLod(b, i, LOD_BANDS, h), i, `band ${i}: promoted too early`);
    // Just inside the band, coming from the far side: stays coarse.
    assert.equal(selectLod(b, i + 1, LOD_BANDS, h), i + 1, `band ${i}: demoted too early`);
    // Clear of the dead band in either direction, both agree.
    assert.equal(selectLod(b + h + 1, i, LOD_BANDS, h), i + 1);
    assert.equal(selectLod(b - h - 1, i + 1, LOD_BANDS, h), i);
  }
});

test("the far LOD fades out rather than popping", () => {
  assert.equal(lodFade(0, 400, 40), 1);
  assert.equal(lodFade(400, 400, 40), 0);
  assert.equal(lodFade(500, 400, 40), 0);
  const mid = lodFade(380, 400, 40);
  assert.ok(mid > 0 && mid < 1, `no fade band: ${mid}`);
  let prev = 2;
  for (let d = 340; d <= 410; d += 1) {
    const f = lodFade(d, 400, 40);
    assert.ok(f <= prev + 1e-9, "fade is not monotonic");
    prev = f;
  }
});

// ---- resource bin --------------------------------------------------------

function countingResource(counter) {
  return {
    disposed: 0,
    dispose() { this.disposed += 1; counter.n += 1; },
  };
}

test("the resource bin disposes everything once and empties itself", () => {
  const counter = { n: 0 };
  const bin = createResourceBin("t");
  const a = countingResource(counter);
  const b = countingResource(counter);
  bin.track(a);
  bin.track(b);
  bin.track(a);              // the same object twice must not dispose it twice
  assert.equal(bin.size, 2);
  bin.disposeAll();
  assert.equal(counter.n, 2);
  assert.equal(a.disposed, 1);
  assert.equal(bin.size, 0);
  bin.disposeAll();          // safe to call twice
  assert.equal(counter.n, 2);
});

test("the bin ignores things that cannot be disposed and survives one that throws", () => {
  const bin = createResourceBin("t");
  bin.track(null);
  bin.track({});
  bin.track(42);
  assert.equal(bin.size, 0);
  const counter = { n: 0 };
  bin.track({ dispose() { throw new Error("boom"); } });
  const ok = countingResource(counter);
  bin.track(ok);
  bin.disposeAll();
  assert.equal(ok.disposed, 1, "one bad resource stranded the rest of the bin");
  assert.equal(bin.size, 0);
});

test("the bin follows materials to their textures and trees to their meshes", () => {
  const bin = createResourceBin("t");
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  bin.trackTree(group);
  assert.ok(bin.items.includes(geo));
  assert.ok(bin.items.includes(mat));
  assert.ok(bin.items.includes(tex), "a material's texture was not taken over");
  bin.disposeAll();
  assert.equal(bin.size, 0);
});

test("50 build/clear cycles leak nothing", () => {
  const counter = { n: 0 };
  let created = 0;
  for (let cycle = 0; cycle < 50; cycle += 1) {
    const bin = createResourceBin(`cycle${cycle}`);
    for (let i = 0; i < 20; i += 1) {
      bin.track(countingResource(counter));
      created += 1;
    }
    assert.equal(bin.size, 20, "the bin grew across cycles");
    bin.disposeAll();
    assert.equal(bin.size, 0);
  }
  assert.equal(counter.n, created);
});

// ---- the renderer, against a stub GL --------------------------------------

function stubRenderer(webgl2 = false) {
  const calls = { render: 0, setRenderTarget: 0, setSize: 0, dispose: 0, clear: 0 };
  return {
    calls,
    opusWebGL2: webgl2,
    capabilities: { isWebGL2: webgl2 },
    domElement: null,
    outputColorSpace: null,
    toneMapping: null,
    toneMappingExposure: 1,
    useLegacyLights: true,
    shadowMap: { enabled: false, type: null, autoUpdate: true },
    info: { render: { calls: 0, triangles: 0 } },
    setPixelRatio() {},
    setSize() { calls.setSize += 1; },
    setRenderTarget() { calls.setRenderTarget += 1; },
    clear() { calls.clear += 1; },
    render() { calls.render += 1; },
    getContext() { return null; },
    dispose() { calls.dispose += 1; },
  };
}

function stubCanvas() {
  return { clientWidth: 960, clientHeight: 540, width: 960, height: 540, getContext: () => null };
}

function makeRenderer(over = {}) {
  const { webgl2 = false, ...opts } = over;
  const gl = stubRenderer(webgl2);
  const api = createRenderer(stubCanvas(), {
    THREE,
    quality: "high",
    rendererFactory: () => gl,
    seed: "test",
    ...opts,
  });
  return { api, gl };
}

function fakeCar(stage) {
  const wheels = [];
  for (let i = 0; i < 4; i += 1) {
    wheels.push({
      index: i, isFront: i < 2, isLeft: i % 2 === 0,
      localPos: { x: 0, y: 0, z: 0 },
      worldPos: { x: 0, y: 0.33, z: 0 },
      contact: true,
      contactPoint: { x: 0, y: 0, z: 0 },
      contactNormal: { x: 0, y: 1, z: 0 },
      compression: 0.4, suspensionForce: 3000, load: 3000,
      steerAngle: 0, spinRate: 60, slipRatio: 0.3, slipAngle: 0.2,
      fx: 0, fy: 0, surfaceId: SURFACE.GRAVEL, gripUsed: 0.5,
      skidding: true, dustRate: 100, temperature: 60, wear: 0, punctured: false,
    });
  }
  return {
    spec: { id: "test-car", name: "Test", engine: { limitRpm: 7000 } },
    pos: { x: 0, y: 0.4, z: stage ? stage.z[20] : 0 },
    vel: { x: 2, y: 0, z: 24 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    yaw: 0, pitch: 0, roll: 0,
    yawRate: 0, pitchRate: 0, rollRate: 0,
    speed: 24, forwardSpeed: 24, slipAngle: 0.08,
    lateralG: 0.6, longitudinalG: 0.2, verticalG: 1,
    engineRpm: 5000, engineLoad: 0.8, turboBoost: 0.5, turboSpool: 0.5,
    gear: 3, gearShiftTimer: 0, clutchEngage: 1,
    wheels, onGround: 4, airTime: 0, rolledOver: false,
    damage: null, odometer: 0,
    input: { steer: 0.2, throttle: 1, brake: 0, handbrake: 0, clutch: 0 },
  };
}

function fakeSurface() {
  return {
    props: surfaceProps(SURFACE.GRAVEL),
    surfaceId: SURFACE.GRAVEL,
    onRoad: true, lateral: 0, signedLateral: 0, s: 0,
    edgeBlend: 0, roughness: 0.45, ruts: 0.3,
  };
}

function fakeWorld(stage) {
  return {
    gravity: 9.81,
    heightAt: () => 0,
    normalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: (x, z, out) => out,
    sampleAt: (s) => Math.max(0, Math.min(stage.count - 1, Math.round(s / stage.step))),
    project: (x, z, hint, out) => {
      out.s = Math.max(0, z);
      out.lateral = Math.abs(x);
      out.signedLateral = x;
      out.index = 0;
      return out;
    },
    bounds: stage.bounds,
  };
}

test("createRenderer throws a clear error when there is no WebGL at all", () => {
  assert.throws(() => createRenderer({ getContext: () => null }, { THREE }), /WebGL/);
  assert.throws(() => createRenderer(null, { THREE }), /canvas/);
});

test("a fresh renderer has a scene, a camera and a default mode", () => {
  const { api } = makeRenderer();
  assert.ok(api.scene.isScene);
  assert.ok(api.camera.isCamera);
  assert.equal(api.cameraMode, "chase");
  assert.equal(api.quality, "high");
  api.dispose();
});

test("setCamera and cycleCamera walk the cycle and reject nonsense", () => {
  const { api } = makeRenderer();
  api.setCamera("cockpit");
  assert.equal(api.cameraMode, "cockpit");
  api.setCamera("not-a-camera");
  assert.equal(api.cameraMode, "cockpit", "an unknown mode was accepted");
  api.setCamera(CAMERA_CYCLE[0]);
  for (let i = 0; i < CAMERA_CYCLE.length; i += 1) {
    assert.equal(api.cameraMode, CAMERA_CYCLE[i]);
    api.cycleCamera();
  }
  assert.equal(api.cameraMode, CAMERA_CYCLE[0], "the cycle did not come back round");
  api.dispose();
});

test("setQuality moves the level and turns auto back on", () => {
  const { api } = makeRenderer();
  api.setQuality("low");
  assert.equal(api.quality, "low");
  assert.equal(api.resolutionScale, 1);
  api.setQuality("ultra");
  assert.equal(api.quality, "ultra");
  api.setQuality("auto");
  assert.ok(QUALITY_LEVELS.includes(api.quality));
  api.dispose();
});

test("toggleHeadlights flips and stays flipped", () => {
  const { api } = makeRenderer();
  const a = api.toggleHeadlights();
  const b = api.toggleHeadlights();
  assert.equal(a, !b);
  api.dispose();
});

test("updateIdle renders without a stage and does not touch stage systems", () => {
  const { api, gl } = makeRenderer();
  for (let i = 0; i < 10; i += 1) api.updateIdle(1 / 60);
  assert.ok(gl.calls.render > 0, "the idle path never rendered");
  api.dispose();
});

test("update() after clearStage falls back to idle instead of walking a dead scene", () => {
  const stage = makeStraightStage(120);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer();
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  api.update({ car, stage, alpha: 0, state: "racing", surface: fakeSurface() }, 1 / 60);
  api.clearStage();
  // game.js keeps its stage reference across toMenu(), so this is the real case.
  assert.doesNotThrow(() => {
    api.update({ car, stage, alpha: 0, state: "menu", surface: fakeSurface() }, 1 / 60);
  });
  api.dispose();
});

test("a built stage drives the camera, the particles, the marks and the shadow fit", () => {
  const stage = makeStraightStage(200);
  stage.world = fakeWorld(stage);
  stage.scenery = [];
  for (let i = 0; i < 300; i += 1) {
    stage.scenery.push({
      kind: i % 3 === 0 ? "tree" : i % 3 === 1 ? "rock" : "bush",
      x: (i % 17) * 6 - 50, y: 0, z: i * 3, yaw: i * 0.1, scale: 1, variant: 0,
    });
  }
  const { api, gl } = makeRenderer();
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  const frame = { car, stage, weather: null, ghost: null, alpha: 0.5, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 90; i += 1) {
    car.pos.z += 24 / 60;
    car.wheels[2].contactPoint.z = car.pos.z;
    car.wheels[3].contactPoint.z = car.pos.z;
    api.update(frame, 1 / 60);
  }
  assert.ok(gl.calls.render > 0);
  assert.ok(api.stats.dust > 0, "no dust on a gravel stage under power");
  assert.ok(api.dustPool.alive <= api.dustPool.capacity);
  assert.ok(api.stats.draws > 0, "no scenery instances were issued");
  assert.ok(api.shadowFit.ok, "the shadow was never fitted");
  assert.ok(api.shadowFit.radius < 200, `shadow box is ${api.shadowFit.radius} m`);
  // The camera must be behind the car, not on top of it.
  const behind = api.camera.position.z < car.pos.z;
  assert.ok(behind, "the chase camera ended up in front of the car");
  api.dispose();
});

test("the scenery instance budget is never exceeded", () => {
  const stage = makeStraightStage(200);
  stage.world = fakeWorld(stage);
  stage.scenery = [];
  for (let i = 0; i < 6000; i += 1) {
    stage.scenery.push({
      kind: "tree", x: (i % 60) * 2 - 60, y: 0, z: (i % 200) * 2, yaw: 0, scale: 1, variant: 0,
    });
  }
  const { api } = makeRenderer({ quality: "medium" });
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 20; i += 1) api.update(frame, 1 / 60);
  assert.ok(api.stats.draws <= qualitySettings("medium").sceneryBudget,
    `issued ${api.stats.draws} instances over budget`);
  api.dispose();
});

test("impactEffect spawns for every impact kind the damage model can raise", () => {
  const { api } = makeRenderer();
  const kinds = ["hit", "scrape", "kerb", "tree", "rock", "bale", "water", "landing", "roll"];
  for (const kind of kinds) {
    const before = api.dustPool.spawned + api.debrisPool.spawned;
    api.impactEffect({
      kind, speed: 18,
      point: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
    });
    const after = api.dustPool.spawned + api.debrisPool.spawned;
    assert.ok(after > before, `${kind} produced nothing`);
  }
  assert.doesNotThrow(() => api.impactEffect(null));
  assert.doesNotThrow(() => api.impactEffect({ kind: "hit", speed: 5 }));
  assert.ok(api.dustPool.alive <= api.dustPool.capacity);
  assert.ok(api.debrisPool.alive <= api.debrisPool.capacity);
  api.dispose();
});

test("50 build/clear cycles against a real scene graph leave nothing behind", () => {
  const stage = makeStraightStage(60);
  stage.world = fakeWorld(stage);
  stage.scenery = [
    { kind: "tree", x: 8, y: 0, z: 10, yaw: 0, scale: 1, variant: 0 },
    { kind: "rock", x: -8, y: 0, z: 20, yaw: 0, scale: 1, variant: 0 },
  ];
  const { api } = makeRenderer();
  const car = fakeCar(stage);
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };

  // A geometry or a material that is never disposed shows up as a growing count
  // of live THREE resources; the scene graph is the other half of the leak.
  const disposed = { n: 0 };
  const onDispose = () => { disposed.n += 1; };

  let baselineChildren = 0;
  for (let cycle = 0; cycle < 50; cycle += 1) {
    api.buildStage(stage, { car });
    const stageGroup = api.scene.children.find((c) => c.name === "opus.stage");
    assert.ok(stageGroup, "the stage group vanished");
    let tracked = 0;
    stageGroup.traverse((o) => {
      if (o.geometry && !o.geometry.__counted) {
        o.geometry.__counted = true;
        o.geometry.addEventListener("dispose", onDispose);
        tracked += 1;
      }
    });
    api.update(frame, 1 / 60);
    api.clearStage();
    assert.equal(stageGroup.children.length, 0, `cycle ${cycle}: stage group not emptied`);
    if (cycle === 0) baselineChildren = api.scene.children.length;
    assert.equal(api.scene.children.length, baselineChildren,
      `cycle ${cycle}: the scene grew to ${api.scene.children.length} children`);
    assert.ok(tracked > 0, "nothing was built");
    assert.ok(disposed.n >= tracked, `cycle ${cycle}: ${disposed.n} disposals for ${tracked} geometries`);
    // The pools are recycled, not rebuilt.
    assert.equal(api.dustPool.alive, 0);
    assert.equal(api.debrisPool.alive, 0);
  }
  api.dispose();
});

test("clearStage is safe before a build and safe twice", () => {
  const { api } = makeRenderer();
  assert.doesNotThrow(() => api.clearStage());
  assert.doesNotThrow(() => api.clearStage());
  const stage = makeStraightStage(40);
  stage.world = fakeWorld(stage);
  api.buildStage(stage, { car: fakeCar(stage) });
  api.clearStage();
  assert.doesNotThrow(() => api.clearStage());
  assert.doesNotThrow(() => api.dispose());
});

test("dispose tears the renderer down and hands the GL context back", () => {
  const { api, gl } = makeRenderer();
  const stage = makeStraightStage(40);
  stage.world = fakeWorld(stage);
  api.buildStage(stage, { car: fakeCar(stage) });
  api.dispose();
  assert.equal(gl.calls.dispose, 1);
  assert.ok(!api.scene.children.some((c) => c.name === "opus.dust"));
});

function fakeWeather(over = {}) {
  return {
    current: {
      exposure: 1.1, windSpeed: 6, windDirection: 0.3, fogDensity: 0.004,
      precipRate: 10, turbidity: 6, roadWetness: 0.6, visibility: 2000,
    },
    wet: { film: 0.6, standing: 0.2, snowCover: 0 },
    metrics: { headlights: true, lightLevel: 0.15, sunElevation: 0.1 },
    lights: null,
    _sunDir: { x: 0.3, y: 0.5, z: -0.81 },
    ...over,
  };
}

test("the headlights come on at night, aim down the road, and show a beam in fog", () => {
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  car.yaw = 0;               // nose down +Z
  const weather = fakeWeather();
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);

  const left = api.scene.getObjectByName("opus.headlight.l");
  const pod = api.scene.getObjectByName("opus.lightpod");
  assert.ok(left.intensity > 1, `headlights stayed off at night: ${left.intensity}`);
  assert.ok(pod.intensity > left.intensity, "the light pod should outreach the headlights");
  assert.ok(left.target.position.z > left.position.z + 10,
    "the beam is not aimed down the road");
  assert.ok(left.position.x < 0 && api.scene.getObjectByName("opus.headlight.r").position.x > 0,
    "the lamps are not either side of the nose");

  const beams = api.scene.getObjectByName("opus.beams");
  assert.equal(beams.visible, true, "no visible beam cone in fog at night");
  assert.ok(beams.children[0].material.uniforms.uStrength.value > 0);
  api.dispose();
});

test("toggleHeadlights overrides the automatic decision in both directions", () => {
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer();
  const car = fakeCar(stage);
  // Bright daylight: the automatic answer is "off".
  const weather = fakeWeather({ metrics: { headlights: false, lightLevel: 1, sunElevation: 1 } });
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  const off = api.scene.getObjectByName("opus.headlight.l").intensity;
  assert.ok(off < 0.5, `headlights were on in daylight: ${off}`);

  api.toggleHeadlights();
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  assert.ok(api.scene.getObjectByName("opus.headlight.l").intensity > 1,
    "the manual override did not switch them on");

  api.toggleHeadlights();
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  assert.ok(api.scene.getObjectByName("opus.headlight.l").intensity < 0.5,
    "the manual override did not switch them back off");
  api.dispose();
});

test("a weather object missing its derived state does not take a frame down", () => {
  const stage = makeStraightStage(60);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  // createWeather() fills `wet` on its first step, so this is the real first frame.
  const bare = { current: fakeWeather().current, metrics: null, wet: null, lights: null };
  api.buildStage(stage, { car, weather: bare });
  assert.doesNotThrow(() => {
    api.update({ car, stage, weather: bare, alpha: 0, state: "racing", surface: fakeSurface() }, 1 / 60);
  });
  api.dispose();
});

test("the brake lights answer the brake pedal", () => {
  const stage = makeStraightStage(60);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer();
  const car = fakeCar(stage);
  api.buildStage(stage, { car, weather: fakeWeather() });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  api.update(frame, 1 / 60);
  const mat = api.scene.getObjectByName("opus.car").userData.brakeMaterial;
  const coasting = mat.emissive.r;
  car.input.brake = 1;
  api.update(frame, 1 / 60);
  assert.ok(mat.emissive.r > coasting + 0.5, `brake lights did not light: ${mat.emissive.r}`);
  car.input.brake = 0;
  car.input.handbrake = 1;
  api.update(frame, 1 / 60);
  assert.ok(mat.emissive.r > coasting + 0.4, "the handbrake did not light them");
  api.dispose();
});

test("a car model with no brake light still gets one, and the exhaust is not it", () => {
  const stage = makeStraightStage(60);
  stage.world = fakeWorld(stage);
  // The real car model names its rear pipe "exhaustTail" and carries no brake
  // part at all: a loose name match would light the exhaust under braking.
  const group = new THREE.Group();
  group.name = "car-test";
  const exhaustMat = new THREE.MeshStandardMaterial({ emissive: 0x000000 });
  const exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), exhaustMat);
  exhaust.name = "exhaustTail";
  group.add(exhaust);
  let disposed = 0;
  const meshes = {
    buildCarMesh: () => ({ group, dispose() { disposed += 1; } }),
    carDimensions: () => ({ tailZ: -2.1, beltY: 0.9, sillY: 0.2, bodyHalfWidth: 0.8 }),
  };

  const { api } = makeRenderer({ meshes });
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  api.update(frame, 1 / 60);
  assert.equal(exhaustMat.emissive.r, 0, "the exhaust was wired up as a brake light");

  const supplied = group.getObjectByName("opus.brake0");
  assert.ok(supplied, "no brake light was supplied for a model that lacks one");
  assert.ok(supplied.position.z < -1.5, "the supplied brake light is not at the back");
  car.input.brake = 1;
  api.update(frame, 1 / 60);
  assert.ok(supplied.material.emissive.r > 0.5, "the supplied brake light does not light");
  assert.equal(exhaustMat.emissive.r, 0);

  api.clearStage();
  assert.equal(disposed, 1, "the car descriptor's own dispose() was not called");
  api.dispose();
});

test("the post chain runs its passes when the device can carry them", () => {
  const { api, gl } = makeRenderer({ webgl2: true, quality: "ultra" });
  assert.equal(api.stats.post, true, "post was off on a capable device");
  assert.equal(api.stats.hdr, true);
  gl.calls.render = 0;
  gl.calls.setRenderTarget = 0;
  api.updateIdle(1 / 60);
  // Scene, bright pass, three bloom iterations of two blurs each, composite.
  assert.ok(gl.calls.render >= 8, `only ${gl.calls.render} passes were issued`);
  assert.ok(gl.calls.setRenderTarget >= 8);
  api.dispose();
});

test("a device without float targets gets the single-pass path, not a black screen", () => {
  const { api, gl } = makeRenderer({ webgl2: false, quality: "ultra" });
  assert.equal(api.stats.post, false, "post ran without a float target to run it in");
  gl.calls.render = 0;
  gl.calls.setRenderTarget = 0;
  api.updateIdle(1 / 60);
  assert.equal(gl.calls.render, 1);
  assert.equal(gl.calls.setRenderTarget, 0);
  // The tone map has to move to the renderer, or the image is unmapped linear.
  assert.equal(gl.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(gl.outputColorSpace, THREE.SRGBColorSpace);
  api.dispose();
});

test("low quality skips the post chain even on a capable device", () => {
  const { api } = makeRenderer({ webgl2: true, quality: "low" });
  assert.equal(api.stats.post, false);
  api.setQuality("high");
  assert.equal(api.stats.post, true, "post did not come back with the quality level");
  api.dispose();
});

test("a mesh library that throws never takes the stage build with it", () => {
  const stage = makeStraightStage(40);
  stage.world = fakeWorld(stage);
  const angry = {
    buildRoadMesh() { throw new Error("no"); },
    buildTerrainMesh() { throw new Error("no"); },
    buildCarMesh() { throw new Error("no"); },
    buildWheelMesh() { throw new Error("no"); },
    buildSceneryLibrary() { throw new Error("no"); },
    buildPropLibrary() { throw new Error("no"); },
  };
  const { api } = makeRenderer({ meshes: angry });
  assert.doesNotThrow(() => api.buildStage(stage, { car: fakeCar(stage) }));
  const stageGroup = api.scene.children.find((c) => c.name === "opus.stage");
  assert.ok(stageGroup.children.length > 0, "nothing was built from the fallbacks");
  api.dispose();
});

// ---- integration with the modules that actually feed it -------------------
//
// meshes.js hands back descriptors — `{ group, …, dispose() }` — not bare
// Object3Ds, and its prop library is a library with a build() rather than a
// finished group. Every one of those is a shape render.js has to *recognise*: a
// shape it does not recognise falls silently back to the crude placeholders
// below, which looks like nothing is wrong until someone opens the game.

test("a stage built from the real stage.js, meshes.js and physics.js is adopted whole", async () => {
  const stageMod = await import("../stage.js");
  const meshes = await import("../meshes.js");
  const physics = await import("../physics.js");

  const def = stageMod.STAGE_BOOK[0];
  const stage = stageMod.generateStage(def.seed, { ...def, length: 1200 });
  const car = physics.createCar(physics.CARS[0].id, {});
  physics.resetCar(car, stage.start.x, stage.start.y, stage.start.z, stage.start.yaw);

  const { api } = makeRenderer({ webgl2: true, quality: "medium", meshes });
  const surface = fakeSurface();
  const frame = { car, stage, alpha: 0, state: "racing", surface };

  let baseline = 0;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    api.buildStage(stage, { car });
    const group = api.scene.children.find((c) => c.name === "opus.stage");
    const names = group.children.map((c) => c.name);
    assert.ok(group.children.length >= 3, `only built ${names.join(",")}`);
    // "opus.*" is this module's own placeholder geometry. Seeing it here means a
    // builder's return shape stopped being recognised.
    for (const own of ["opus.road", "opus.terrain", "opus.scenery"]) {
      assert.ok(!names.includes(own),
        `fell back to the placeholder ${own} — meshes.js's shape was not recognised`);
    }

    car.vel.z = 25; car.speed = 25; car.forwardSpeed = 25;
    car.input.throttle = 1;
    for (const w of car.wheels) {
      w.contact = true; w.load = 3000; w.slipRatio = 0.4; w.slipAngle = 0.2;
    }
    for (let i = 0; i < 20; i += 1) api.update(frame, 1 / 60);
    assert.ok(api.stats.dust > 0, "a gravel stage under power threw no dust");
    assert.ok(api.shadowFit.ok && api.shadowFit.radius < 200);

    api.clearStage();
    assert.equal(group.children.length, 0, `cycle ${cycle}: stage group not emptied`);
    if (cycle === 0) baseline = api.scene.children.length;
    assert.equal(api.scene.children.length, baseline,
      `cycle ${cycle}: the scene accumulated children`);
  }
  api.dispose();
});

// ---- discipline ----------------------------------------------------------

test("render.js never reaches for Math.random", () => {
  assert.equal(/Math\s*\.\s*random/.test(RENDER_SRC), false,
    "Math.random() in render.js would make a replay unreproducible");
});

test("the per-frame path allocates nothing", () => {
  // By construction: no `new` and no object/array literal inside the functions
  // update() calls every frame. This is a source check because a leak here is
  // invisible until it is a stutter.
  const hot = [
    "function updateCameraRig",
    "function stepParticlePool",
    "function packParticles",
    "function boomTarget",
    "function lookTarget",
    "function fitShadowFrustum",
    "function selectLod",
    "function dustSpawnRate",
    "function autoScalerSample",
  ];
  for (const marker of hot) {
    const start = RENDER_SRC.indexOf(marker);
    assert.ok(start > 0, `${marker} not found`);
    // Read to the closing brace at column 0, which is how this file is formatted.
    const end = RENDER_SRC.indexOf("\n}\n", start);
    const body = RENDER_SRC.slice(start, end > 0 ? end : start + 4000);
    assert.equal(/\bnew\s+[A-Z]/.test(body), false, `${marker} allocates with new`);
    assert.equal(/=\s*\{\s*[a-zA-Z"']/.test(body), false, `${marker} allocates an object literal`);
    assert.equal(/=\s*\[/.test(body), false, `${marker} allocates an array literal`);
  }
});

test("the module-scope scratch is shared, not re-created per call", () => {
  const p = cameraParams("chase");
  const s = sampleAt({ vx: 10, vz: 10, speed: 14 });
  const a = { x: 0, y: 0, z: 0 };
  const first = lookTarget(a, s, p);
  assert.equal(first, a, "lookTarget returned a fresh object");
  const fit = makeShadowFit();
  const pts = new Float32Array([0, 0, 0, 1, 1, 1]);
  assert.equal(fitShadowFrustum(fit, pts, 2, 0, 1, 0, 1024, 1), fit);
  const pool = createParticlePool(4);
  assert.equal(packParticles(pool, 0, 1, 0), 0);
});

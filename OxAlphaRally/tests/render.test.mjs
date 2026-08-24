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
  cornerLook,
  chaseFov,
  mountLocalX,
  mountLocalZ,
  adaptCameraParams,
  portraitBlend,
  fovForAspect,
  CAMERA_DESIGN_ASPECT,
  wakeLift,
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
  SHADOW_CASTER_HEIGHT,
  shadowLightSpace,
  roadSpanPoints,
  selectLod,
  lodFade,
  LOD_BANDS,
  createResourceBin,
  createRenderer,
  HEADLIGHT,
  CONTACT_SHADOW,
  makeContactShadowFit,
  contactShadowFit,
} from "../render.js";

// Normalised to LF. Git hands this file out with CRLF endings on Windows, and
// the source scan below anchors on a newline-brace-newline sequence to find a
// function's closing brace. Against CRLF that anchor never matches, the scan
// silently falls back to a blind 4000-character window that spills into the
// following functions, and the test then reports whatever they happen to
// contain. It passed in the authoring worktree and failed in a fresh checkout
// of the very same commit.
const RENDER_SRC = normaliseEol(
  readFileSync(fileURLToPath(new URL("../render.js", import.meta.url)), "utf8"),
);

function normaliseEol(text) {
  return text.split("\r\n").join("\n");
}

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
  // Widening with speed is the cheapest speed cue there is, and it has to happen
  // across the band a rally car actually uses. The previous form of this
  // assertion asked for more than 15 degrees between 5 and 60 m/s, which is only
  // reachable if the numbers are horizontal FOV — and holding it there is what
  // kept a 94-degree-horizontal fisheye in the game. Ask instead that the effect
  // is substantially spent by the time you are travelling quickly.
  const atRest = chaseFov(0, p);
  const quick = chaseFov(28, p);      // ~100 km/h
  const flatOut = chaseFov(45, p);    // ~160 km/h
  assert.ok(quick - atRest > (p.fovMax - p.fovBase) * 0.4,
    `by 100 km/h the camera has only widened ${(quick - atRest).toFixed(1)} of `
    + `${(p.fovMax - p.fovBase).toFixed(1)} available degrees`);
  assert.ok(flatOut - atRest > (p.fovMax - p.fovBase) * 0.85,
    "flat out, the widening should be essentially complete");
});

// three.js takes a VERTICAL field of view. Authoring these numbers as though
// they were horizontal put the chase camera at 94 degrees horizontal, which
// drags the horizon to the middle of the frame and flattens every corner —
// exactly what an art director reported seeing. Nothing else in the suite would
// notice, because every other assertion is about ratios and monotonicity.
test("every camera's field of view is a plausible VERTICAL angle", () => {
  for (const mode of CAMERA_MODES) {
    const p = cameraParams(mode);
    for (const [name, deg] of [["fovBase", p.fovBase], ["fovMax", p.fovMax]]) {
      assert.ok(deg >= 20 && deg <= 60,
        `${mode}.${name} is ${deg} degrees vertical `
        + `(${(2 * Math.atan(Math.tan((deg * Math.PI) / 360) * (16 / 9)) * 180 / Math.PI).toFixed(0)} horizontal at 16:9)`);
    }
    // The speed at which the widening is spent is in metres per second. Giving
    // it a degree-sized number is the mistake that made the effect unreachable.
    assert.ok(p.fovRefSpeed >= 12 && p.fovRefSpeed <= 45,
      `${mode}.fovRefSpeed is ${p.fovRefSpeed} m/s (${(p.fovRefSpeed * 3.6).toFixed(0)} km/h)`);
  }
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

// Which way a camera should swing cannot be settled from a literal in this file,
// because the bug was a *sign*: a test that asserts `lookYaw > 0` for `steer:
// 0.8` only agrees with whatever convention the rig already used, and the rig
// used the wrong one — every in-car camera looked out of the corner. So drive
// physics.js, take the sign of the corner from the car's own centripetal
// acceleration, and ask whether the aim moved that way.
//
// Returns the settled rig plus the frame the answer has to be read in.
async function corneringRig(mode, opts = {}) {
  const physics = await import("../physics.js");
  // A featureless plain, so the only thing steering the car is the steering. On
  // a generated stage the road's own curvature dominates and the mirrored case
  // simply drives off it.
  const props = surfaceProps(SURFACE.TARMAC);
  const world = {
    gravity: 9.81,
    heightAt: () => 0,
    normalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: (x, z, out) => {
      out.props = props;
      out.surfaceId = props.id;
      out.onRoad = true;
      out.lateral = 0; out.signedLateral = 0; out.s = 0;
      out.edgeBlend = 0; out.roughness = 0; out.ruts = 0;
      return out;
    },
    sampleAt: () => 0,
    project: (x, z, hintS, out) => { out.s = 0; out.lateral = 0; out.signedLateral = 0; out.index = 0; return out; },
    bounds: { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 },
  };
  const car = physics.createCar(physics.CARS[0].id, {});
  physics.resetCar(car, 0, 0, 0, 0);
  const input = physics.makeInput();
  input.throttle = 1;
  for (let i = 0; i < 600; i += 1) physics.stepCar(car, input, world, 1 / 120);
  input.steer = opts.steer === undefined ? 1 : opts.steer;
  for (let i = 0; i < 200; i += 1) physics.stepCar(car, input, world, 1 / 120);

  const s = sampleCar(makeCarSample(), car, null);
  const p = cameraParams(mode);
  const rig = makeCameraRig(mode);
  resetCameraRig(rig, s, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
  // The car's right in world terms, and the direction its centripetal
  // acceleration points: that is the inside of the corner, whatever the sign
  // convention of yaw happens to be.
  const right = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
  const insideX = right.x * Math.sign(s.lateralG);
  const insideZ = right.z * Math.sign(s.lateralG);
  // How far the aim has swung off the car, along the inside of the corner.
  const swing = (rig.tx - s.x) * insideX + (rig.tz - s.z) * insideZ;
  return { rig, s, p, swing, car };
}

test("an in-car camera looks into the corner, not out of it", async () => {
  const { rig, s, swing } = await corneringRig("cockpit");
  assert.ok(Math.abs(s.lateralG) > 0.05, `the car is not cornering: ${s.lateralG}`);
  assert.ok(Math.abs(rig.headX) > 1e-4, "no head inertia under lateral g");
  assert.ok(Math.abs(rig.lookYaw) > 0.01, `no look into the corner: ${rig.lookYaw}`);
  assert.ok(swing > 0.5,
    `the driver is looking ${swing < 0 ? "out of" : "barely into"} the corner: ${swing.toFixed(3)} m`);

  // Mirrored: the same steering the other way has to swing the other way.
  const other = await corneringRig("cockpit", { steer: -1 });
  assert.ok(Math.sign(other.s.lateralG) === -Math.sign(s.lateralG), "the corner did not reverse");
  assert.ok(other.swing > 0.5, `mirrored corner: ${other.swing.toFixed(3)} m`);
  assert.ok(Math.sign(other.rig.lookYaw) === -Math.sign(rig.lookYaw), "the look did not reverse");
});

test("the chase camera swings its aim into the corner", async () => {
  const { rig, s, p, swing } = await corneringRig("chase");
  assert.ok(p.lookIntoCorner > 0, "the chase rig has no corner look at all");
  // Straight ahead, the same car and rig must aim square down the road: the
  // swing is a corner behaviour, not a permanent squint.
  const straight = sampleAt({
    x: s.x, z: s.z, yaw: s.yaw, speed: s.speed,
    vx: Math.sin(s.yaw) * s.speed, vz: Math.cos(s.yaw) * s.speed, forwardSpeed: s.speed,
  });
  const flat = makeCameraRig("chase");
  resetCameraRig(flat, straight, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(flat, straight, p, 1 / 60, null);
  const right = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
  const flatSwing = Math.abs((flat.tx - s.x) * right.x + (flat.tz - s.z) * right.z);
  assert.ok(flatSwing < 0.3, `the aim is off-centre in a straight line: ${flatSwing.toFixed(3)} m`);
  assert.ok(swing > 1.5,
    `the chase camera sits square behind the nose at the apex: ${swing.toFixed(3)} m`);
  assert.ok(Math.abs(rig.lookYaw) <= 0.42 + 1e-9, "the corner look is unbounded");
});

test("the corner look is bounded and dies at a standstill", () => {
  const p = cameraParams("cockpit");
  const rig = makeCameraRig("cockpit");
  const spun = sampleAt({ speed: 30, yawRate: -40, slipAngle: -3, steer: 1 });
  resetCameraRig(rig, spun, p, null);
  for (let i = 0; i < 400; i += 1) updateCameraRig(rig, spun, p, 1 / 60, null);
  assert.ok(Math.abs(rig.lookYaw) <= 0.42 + 1e-9, `unbounded: ${rig.lookYaw}`);

  // Stopped, a yaw rate is noise and a slip angle means nothing.
  const still = sampleAt({ speed: 0, yawRate: -2, slipAngle: 0.9, steer: 1 });
  const parked = makeCameraRig("cockpit");
  resetCameraRig(parked, still, p, null);
  for (let i = 0; i < 400; i += 1) updateCameraRig(parked, still, p, 1 / 60, null);
  assert.ok(Math.abs(parked.lookYaw) < 1e-6, `the camera squints while parked: ${parked.lookYaw}`);
});

test("a mounted camera rides with the chassis", () => {
  const p = cameraParams("bumper");
  const rig = makeCameraRig("bumper");
  const s = sampleAt({ x: 5, y: 1, z: 9, yaw: Math.PI / 2 });
  resetCameraRig(rig, s, p, null);
  for (let i = 0; i < 200; i += 1) updateCameraRig(rig, s, p, 1 / 60, null);
  // yaw = pi/2 means the nose points down +X, so the bumper is +X of the car.
  assert.ok(Math.abs((rig.px - s.x) - mountLocalZ(s, p)) < 1e-3, `x ${rig.px - s.x}`);
  assert.ok(Math.abs(rig.pz - s.z) < 1e-3, `z ${rig.pz - s.z}`);
  // s.y is the centre of mass; mountY is measured from the road under it.
  const road = s.y - s.comHeight;
  assert.ok(Math.abs((rig.py - road) - p.mountY) < 1e-3,
    `height above the road ${rig.py - road}, wanted ${p.mountY}`);
});

test("an in-car camera sits at a driver's eye line above the road, in every car", async () => {
  // The mounts are authored as heights above the road because that is the only
  // frame they mean anything in; the rig is fed a centre of mass. Applying one
  // in the other's frame put every in-car view a whole COM height too high, and
  // it is invisible from inside the code — this is the check that sees it.
  const physics = await import("../physics.js");
  const p = cameraParams("cockpit");
  for (const spec of physics.CARS) {
    const car = physics.createCar(spec.id, {});
    physics.resetCar(car, 0, 0, 0, 0);
    const s = sampleCar(makeCarSample(), car, null);
    assert.equal(s.comHeight, car.setup.comHeight, `${spec.id}: COM height not sampled`);
    const rig = makeCameraRig("cockpit");
    resetCameraRig(rig, s, p, flatGround());
    for (let i = 0; i < 240; i += 1) updateCameraRig(rig, s, p, 1 / 60, flatGround());
    // resetCar puts the car on the ground at y = 0, so the road is y = 0.
    assert.ok(rig.py >= 1.1 && rig.py <= 1.3,
      `${spec.id}: eye line ${rig.py.toFixed(3)} m above the road, not 1.1–1.3 m`);
  }
});

// Where a mount sits, resolved against the car meshes.js actually builds. The
// rig is authored in the chassis frame, so a probe needs both.
async function mountProbe(spec, mode) {
  const meshes = await import("../meshes.js");
  const physics = await import("../physics.js");
  const car = meshes.buildCarMesh(THREE, spec);
  // The shell is single-sided, so from inside the cabin every panel that matters
  // is a back face. Look at both sides or the probe sees nothing.
  for (const m of car.materials) m.side = THREE.DoubleSide;
  car.group.updateMatrixWorld(true);
  const d = car.dimensions;
  const p = cameraParams(mode);
  const state = physics.createCar(spec.id, {});
  physics.resetCar(state, 0, 0, 0, 0);
  const s = sampleCar(makeCarSample(), state, null);
  // Chassis-frame y is measured from the centre of mass; d.ground is the road.
  const eye = new THREE.Vector3(mountLocalX(s, p), p.mountY + d.ground, mountLocalZ(s, p));

  const shoot = (from, x, y, z) => {
    const rc = new THREE.Raycaster(from, new THREE.Vector3(x, y, z).normalize(), 0.001, 6);
    const hits = rc.intersectObject(car.group, true);
    return hits.length ? hits[0] : null;
  };
  // What fraction of the frame each named part covers, at the rig's own fov and
  // aim. A frame is the only place "the bonnet camera shows no bonnet" is a
  // statement about anything.
  const census = (aspect = CAMERA_DESIGN_ASPECT, cols = 40, rows = 22) => {
    const cam = new THREE.PerspectiveCamera(p.fovBase, aspect, p.near, p.far);
    cam.position.copy(eye);
    cam.up.set(0, 1, 0);
    cam.lookAt(eye.x, eye.y + p.lookHeight, eye.z + p.lookAhead);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const rc = new THREE.Raycaster();
    rc.near = 0.001; rc.far = 12;
    const ndc = new THREE.Vector2();
    const out = new Map();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        ndc.x = (c + 0.5) / cols * 2 - 1;
        ndc.y = 1 - (r + 0.5) / rows * 2;
        rc.setFromCamera(ndc, cam);
        // Glass is transparent: the player sees through it, so it is not cover.
        const hit = rc.intersectObject(car.group, true).find((h) => h.object.name !== "glass");
        const name = hit ? hit.object.name : "";
        out.set(name, (out.get(name) || 0) + 1);
      }
    }
    const total = cols * rows;
    return (...names) => names.reduce((sum, n) => sum + (out.get(n) || 0), 0) / total;
  };
  return { car, d, p, s, eye, shoot, census };
}

test("the cockpit eye is under the roof, not in the windscreen aperture", async () => {
  // The regression this exists to catch: the eye sat 0.16 m *forward* of the
  // roof's leading edge, in the screen aperture, and the old headroom assertion
  // passed anyway because 84 mm of windscreen counts as "something over your
  // head". It is not a roof. So the part overhead is named, not merely present —
  // and the eye is checked against the cabin's own longitudinal datum.
  //
  // The rest of the frame follows from that one error: with the driver's head in
  // the screen the whole length of the bonnet is below him, and what filled the
  // bottom of the picture was exterior paint rather than a dashboard.
  const physics = await import("../physics.js");
  const CABIN = /^(cabinTrim|interior|rollCage|body|roofScoop)$/;
  for (const spec of physics.CARS) {
    const { car, d, eye, shoot, census } = await mountProbe(spec, "cockpit");
    const id = spec.id;
    // meshes.js hangs the cabin off the front axle: screen base at −0.30, roof
    // leading edge at −1.10, seat datum at −1.15.
    const screenBase = d.frontAxle - 0.30;
    const roofFront = d.frontAxle - 1.10;
    assert.ok(eye.z < roofFront,
      `${id}: the eye is ${(eye.z - roofFront).toFixed(3)} m forward of the roof's leading edge`);
    assert.ok(eye.z > d.rearAxle + 0.32 - 0.52,
      `${id}: the eye is behind the cabin altogether (z ${eye.z.toFixed(2)})`);
    assert.ok(eye.x < 0 && Math.abs(eye.x) < d.bodyHalfWidth,
      `${id}: the driver's eye is not over a seat (x ${eye.x})`);

    const up = shoot(eye, 0, 1, 0);
    assert.ok(up, `${id}: nothing over the driver's head — the eye is above the roof`);
    assert.ok(CABIN.test(up.object.name),
      `${id}: what is over the driver's head is ${up.object.name}, not a roof`);
    assert.ok(up.distance > 0.06,
      `${id}: only ${up.distance.toFixed(3)} m of headroom under the roof`);
    assert.ok(shoot(eye, 0, -1, 0), `${id}: nothing under the driver — the eye is outside the body`);

    // Behind the screen: the first thing straight ahead is the glasshouse, not
    // the outside of the car. Named parts rather than an exact match, because
    // meshes.js is free to hang trim in front of a driver — but never paint.
    const ahead = shoot(eye, 0, 0, 1);
    assert.ok(ahead, `${id}: the cockpit view has no windscreen in front of it`);
    assert.ok(!/^(body|bonnet|bumperFront|lightPod)$/.test(ahead.object.name),
      `${id}: the driver is looking at ${ahead.object.name}, not out of the car`);

    // And the frame reads as a cabin: a dashboard under the view, and barely any
    // exterior paint. At the shipped eyepoint the bonnet alone covered 5.6% of
    // the frame with no cabin trim in it at all.
    const share = census();
    assert.ok(share("interior") > 0.10,
      `${id}: only ${(share("interior") * 100).toFixed(1)}% of the frame is a dashboard`);
    assert.ok(share("bonnet") < 0.04,
      `${id}: ${(share("bonnet") * 100).toFixed(1)}% of the cockpit frame is bonnet paint`);
    assert.ok(share("interior", "cabinTrim", "rollCage", "body") > 0.25,
      `${id}: the cabin barely frames the view`);
    assert.ok(share("") > 0.45,
      `${id}: only ${(share("") * 100).toFixed(1)}% of the cockpit frame is road`);
    car.dispose();
  }
});

test("the bonnet camera is out on the bonnet, with the bonnet in frame", async () => {
  // It shipped 1.20 m ahead of the centre of mass, which on half the cars is
  // past the nose: a free-floating viewpoint with no car in it at all, and the
  // ground four metres ahead filling the bottom half of the picture.
  const physics = await import("../physics.js");
  for (const spec of physics.CARS) {
    const { car, d, eye, shoot, census } = await mountProbe(spec, "bonnet");
    const id = spec.id;
    assert.ok(eye.z < d.noseZ - 0.4,
      `${id}: the bonnet camera hangs off the nose (z ${eye.z.toFixed(2)} of ${d.noseZ.toFixed(2)})`);

    const onto = shoot(eye, 0, -1, 0);
    assert.ok(onto, `${id}: the bonnet camera has no bonnet under it`);
    assert.ok(onto.distance > 0.08 && onto.distance < 0.5,
      `${id}: the bonnet camera is ${onto.distance.toFixed(3)} m off the bonnet`);
    assert.equal(shoot(eye, 0, 1, 0), null,
      `${id}: the bonnet camera is under the roof, not out on the bonnet`);

    const share = census();
    const hood = share("bonnet", "body", "lightPod", "bumperFront");
    assert.ok(hood > 0.12,
      `${id}: only ${(hood * 100).toFixed(1)}% of the bonnet camera's frame is car`);
    assert.ok(hood < 0.35,
      `${id}: the bonnet fills ${(hood * 100).toFixed(1)}% of the frame and buries the road`);
    car.dispose();
  }
});

test("the bumper camera is on the bumper of every car", async () => {
  // Same trap as the bonnet camera, one axle further forward: a constant offset
  // from the centre of mass lands inside the nose of a long car and a hand's
  // width past the nose of a short one.
  const physics = await import("../physics.js");
  for (const spec of physics.CARS) {
    const { car, d, eye, shoot } = await mountProbe(spec, "bumper");
    const id = spec.id;
    assert.ok(eye.z < d.noseZ - 0.10,
      `${id}: the bumper camera floats ahead of the nose (z ${eye.z.toFixed(2)} of ${d.noseZ.toFixed(2)})`);
    assert.ok(eye.z > d.frontAxle + 0.20,
      `${id}: the bumper camera is back at the axle (z ${eye.z.toFixed(2)})`);
    const behind = shoot(eye, 0, 0, -1);
    assert.ok(behind, `${id}: nothing behind the bumper camera — it is not on the car`);
    assert.ok(eye.y > d.ground + 0.15 && eye.y < d.beltY,
      `${id}: the bumper camera is not at bumper height (y ${eye.y.toFixed(2)})`);
    car.dispose();
  }
});

// The horizontal half-angle a vertical fov gives at an aspect ratio. This is the
// number a portrait frame destroys and the one nobody measured.
function halfHFov(fovDeg, aspect) {
  return Math.atan(Math.tan(fovDeg * 0.5 * Math.PI / 180) * aspect) * 180 / Math.PI;
}

test("a portrait frame is re-framed, not just narrowed", () => {
  const phone = 390 / 844;
  assert.equal(portraitBlend(CAMERA_DESIGN_ASPECT), 0);
  assert.equal(portraitBlend(2.4), 0);
  assert.equal(portraitBlend(phone), 1);
  assert.ok(portraitBlend(1.0) > 0.5 && portraitBlend(1.0) < 1);

  const base = cameraParams("chase");
  // THREE's fov is vertical, so a tall window keeps the whole vertical field and
  // throws the horizontal away. Unadapted, the chase camera's horizontal field
  // collapses to a slot narrower than the car it is following.
  assert.ok(halfHFov(base.fovBase, phone) * 2 < 22,
    "the unadapted horizontal field is not actually broken — this test proves nothing");

  const out = Object.assign({}, base);
  adaptCameraParams(out, base, phone);
  assert.ok(halfHFov(out.fovBase, phone) * 2 > 32,
    `portrait horizontal field is still ${(halfHFov(out.fovBase, phone) * 2).toFixed(1)} degrees`);
  assert.ok(out.fovBase <= 66 + 1e-9, `the widening became a fisheye: ${out.fovBase}`);
  assert.ok(out.fovMax >= out.fovBase, "fovMax fell below fovBase");

  // The rest has to come from the rig: higher, closer, and aimed further down the
  // road, so the extra vertical field lands on stage rather than on sky and verge.
  assert.ok(out.height > base.height * 1.3, `portrait boom did not rise: ${out.height}`);
  assert.ok(out.distance < base.distance, `portrait boom did not come in: ${out.distance}`);
  assert.ok(out.lookAhead > base.lookAhead, "the portrait aim did not go further down the road");
  assert.ok(out.lookHeight < base.lookHeight * 0.5, "the portrait aim did not drop");

  // The camera has to end up pitched down harder than it is in landscape, which
  // is the whole claim: a taller frame wants a different pitch, not a narrower
  // field at the same one.
  const pitch = (q) => Math.atan2(q.height - q.lookHeight, q.distance + q.lookAhead);
  assert.ok(pitch(out) > pitch(base) * 1.5,
    `portrait pitch ${(pitch(out) * 180 / Math.PI).toFixed(1)} vs landscape ${(pitch(base) * 180 / Math.PI).toFixed(1)}`);

  // Landscape is untouched, and adapting is idempotent — resize fires repeatedly.
  const wide = Object.assign({}, base);
  adaptCameraParams(wide, base, CAMERA_DESIGN_ASPECT);
  for (const k of ["height", "distance", "lookAhead", "lookHeight", "fovBase", "fovMax"]) {
    assert.equal(wide[k], base[k], `landscape ${k} moved`);
  }
  const twice = Object.assign({}, base);
  adaptCameraParams(twice, base, phone);
  adaptCameraParams(twice, base, phone);
  for (const k of ["height", "distance", "lookAhead", "lookHeight", "fovBase", "fovMax"]) {
    assert.equal(twice[k], out[k], `adapting twice moved ${k}`);
  }
});

test("a portrait in-car camera widens but stays a mount", () => {
  const phone = 390 / 844;
  const base = cameraParams("cockpit");
  const out = Object.assign({}, base);
  adaptCameraParams(out, base, phone);
  assert.ok(out.fovBase > base.fovBase, "the in-car field did not widen at all");
  assert.ok(out.fovBase <= 58 + 1e-9, `an in-car fisheye: ${out.fovBase}`);
  // A mount is bolted to the car: its placement cannot move with the window.
  assert.equal(out.mountY, base.mountY);
  assert.equal(out.localZAxle, base.localZAxle);
  assert.equal(out.localXFrac, base.localXFrac);
  assert.ok(out.lookHeight < base.lookHeight, "the in-car aim did not drop for the taller frame");
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

  // Monotonic in speed, and still climbing well past the point the old rate
  // saturated at. This is the assertion that replaces `rate(60) === rate(20)`:
  // that equality was the whole reason a gravel car at 100 km/h threw two wisps
  // that died inside a car length. The rate has to keep growing where the plume
  // should be at its biggest, and still be bounded so it cannot eat the pool.
  let prev = -1;
  for (let v = 0; v <= 60; v += 1) {
    const r = dustSpawnRate(gravel, wheel(), v, 0);
    assert.ok(r >= prev, `rate fell at ${v} m/s`);
    prev = r;
  }
  const at20 = dustSpawnRate(gravel, wheel(), 20, 0);
  const at100kph = dustSpawnRate(gravel, wheel(), 27.8, 0);
  assert.ok(at100kph > at20 * 1.2,
    `100 km/h threw no more than 72: ${at100kph.toFixed(1)} vs ${at20.toFixed(1)}`);
  assert.ok(dustSpawnRate(gravel, wheel(), 90, 0) < at100kph * 1.6, "the rate runs away with speed");

  // And a straight-running wheel at speed is not nearly silent. What makes the
  // tail is the tyre displacing loose material at thirty metres a second, so the
  // no-slip floor has to be a large fraction of a sliding wheel's rate, not 15%.
  const pinned = dustSpawnRate(gravel, wheel({ slipRatio: 1, slipAngle: 0.6 }), 27.8, 0);
  assert.ok(at100kph > pinned * 0.30,
    `a straight wheel throws only ${(at100kph / pinned * 100).toFixed(0)}% of a sliding one`);

  // A dustier surface throws more for the same wheel.
  const sand = surfaceProps(SURFACE.SAND);
  assert.ok(dustSpawnRate(sand, wheel(), 20, 0) > dustSpawnRate(gravel, wheel(), 20, 0));

  // The quality scale is a straight multiplier, so a phone gets the same shape.
  assert.ok(Math.abs(dustSpawnRate(gravel, wheel(), 20, 0, 0.5) - rolling * 0.5) < 1e-6);
});

test("the wake carries the plume up, and only once the car is moving", () => {
  assert.equal(wakeLift(0), 0);
  assert.equal(wakeLift(8), 0);
  assert.ok(wakeLift(20) > 0.4 && wakeLift(20) < 0.7);
  assert.equal(wakeLift(30), 1);
  assert.equal(wakeLift(120), 1, "the wake term is unbounded");
});

// Drive the whole renderer, because the size of the plume is decided by the
// spawn loop and the budget together, not by dustSpawnRate alone.
async function plumeAfter(seconds, dt, quality = "medium") {
  const stageMod = await import("../stage.js");
  const meshes = await import("../meshes.js");
  const def = stageMod.STAGE_BOOK[0];
  const stage = stageMod.generateStage(def.seed, { ...def, length: 800 });
  const { api } = makeRenderer({ webgl2: true, quality, meshes });
  const car = makeDustyCar();
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    // Drive it down the road. A car parked at the origin drops its whole plume
    // on one spot, and then every question about where the dust ended up
    // answers itself.
    car.pos.z += car.vel.z * dt;
    for (const w of car.wheels) {
      w.contactPoint.x = w.isLeft ? -0.75 : 0.75;
      // All four on one station, so the only thing that can spread a frame's
      // spawns along z is the spawn loop laying them down the road.
      w.contactPoint.z = car.pos.z;
      w.worldPos.x = w.contactPoint.x;
      w.worldPos.z = w.contactPoint.z;
    }
    api.update(frame, dt);
  }
  // Alive is only half the story. What a chase camera sees is the part of the
  // plume still within a few car lengths; spread the same particles over eighty
  // metres of road instead of twenty and the count is unchanged while the
  // picture goes from a rooster tail to a faint haze. So measure both, and
  // measure the gaps too — a frame's worth of spawns dropped on one point is a
  // row of clumps, not a plume.
  const pool = api.dustPool;
  let near = 0;
  // How far along the road the *newest* batch is spread. stepParticlePool clamps
  // its step to 0.1 s, so everything spawned in the last frame shares an age
  // below that and nothing older does.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pool.capacity; i += 1) {
    if (pool.life[i] <= 0) continue;
    const dx = pool.x[i] - car.pos.x;
    const dz = pool.z[i] - car.pos.z;
    if (dx * dx + dz * dz < 400) near += 1;
    if (pool.age[i] <= 0.1 + 1e-6) {
      if (pool.z[i] < lo) lo = pool.z[i];
      if (pool.z[i] > hi) hi = pool.z[i];
    }
  }
  const out = { alive: api.stats.dust, near, batchSpread: hi > lo ? hi - lo : 0 };
  api.dispose();
  return out;
}

function makeDustyCar() {
  const wheels = [];
  for (let i = 0; i < 4; i += 1) {
    wheels.push({
      index: i, isFront: i < 2, isLeft: i % 2 === 0,
      worldPos: { x: 0, y: 0.3, z: 0 }, contactPoint: { x: 0, y: 0, z: 0 },
      contactNormal: { x: 0, y: 1, z: 0 },
      contact: true, load: 3200, slipRatio: 0.05, slipAngle: 0.02,
      steerAngle: 0, spinRate: 90, compression: 0.4, skidding: false, surfaceId: SURFACE.GRAVEL,
    });
  }
  // 100 km/h in a straight line on gravel: the frame the plume is judged on.
  return {
    spec: { id: "test" },
    pos: { x: 0, y: 0.5, z: 0 }, vel: { x: 0, y: 0, z: 27.8 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    yaw: 0, pitch: 0, roll: 0, yawRate: 0,
    speed: 27.8, forwardSpeed: 27.8, slipAngle: 0.02,
    lateralG: 0, longitudinalG: 0.2, verticalG: 1,
    engineRpm: 5000, gear: 4, wheels, onGround: 4, airTime: 0,
    input: { throttle: 1, brake: 0, steer: 0, handbrake: 0 },
    damage: null,
  };
}

test("a gravel car at 100 km/h throws a plume worth looking at", async () => {
  // Straight-line, no wheelspin, dry gravel: the case the shipped renderer made
  // two wisps of. The plume is a hundreds-of-particles thing or it is nothing,
  // and the ones that count are the ones still near the car.
  const settled = await plumeAfter(3, 1 / 60);
  assert.ok(settled.alive > 900,
    `a rally car at 100 km/h on gravel threw ${settled.alive} particles`);
  assert.ok(settled.alive <= qualitySettings("medium").particleBudget,
    `${settled.alive} particles is over the medium budget`);
  assert.ok(settled.near > 250,
    `only ${settled.near} particles are within 20 m of the car — the plume is a haze`);

  // A quality level is allowed to buy less of it, and must actually get less.
  const cheap = await plumeAfter(3, 1 / 60, "low");
  assert.ok(cheap.alive < settled.alive, "the low preset spends as much as medium");
});

test("the plume is laid along the road, not dropped in heaps", async () => {
  // A frame's spawns go at the contact patch of a wheel that has just travelled
  // `speed * dt`. Dropping them all on the end point costs nothing at 60 fps and
  // everything below 20, where the puffs separate into a row of clumps metres
  // apart — and a dip in frame rate is exactly what a big plume causes.
  const dt = 1 / 6;
  const coarse = await plumeAfter(2, dt);
  const travel = 27.8 * dt;
  assert.ok(coarse.batchSpread > travel * 0.55,
    `a frame's dust covers ${coarse.batchSpread.toFixed(2)} m of the ${travel.toFixed(2)} m the wheel ran`);
  assert.ok(coarse.batchSpread < travel * 1.6,
    `a frame's dust is smeared over ${coarse.batchSpread.toFixed(2)} m, more than the wheel travelled`);
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

// A rAF-driven game on a 60 Hz panel reports the display's own quantum, not the
// work it did: whether the frame took 4 ms or 15 ms of GPU time, the next one
// arrives 16.67 ms later. An up-threshold below that quantum is unreachable, so
// the scaler becomes a one-way ratchet and one hitch costs the player its
// shadows, bloom, particles and a third of its resolution for the session.
function vsyncSeries(as, seconds, hz = 60, dropOneIn = 0) {
  const period = 1000 / hz;
  const frames = Math.round((seconds * 1000) / period);
  let ups = 0;
  for (let i = 0; i < frames; i += 1) {
    const ms = dropOneIn && i % dropOneIn === 0 ? period * 2 : period;
    if (autoScalerSample(as, ms, ms / 1000) > 0) ups += 1;
  }
  return ups;
}

test("the up-threshold is reachable on a vsync-locked 60 Hz display", () => {
  const as = createAutoScaler({ index: 2 });
  assert.ok(as.upMs * (1 - as.tolerance) > 1000 / 60,
    `an up-step needs ${as.upMs * (1 - as.tolerance)} ms, which 60 Hz vsync never delivers`);
  assert.ok(as.upMs < as.downMs, "the thresholds crossed over");
});

test("a hitch costs a quality level, and a clean 60 Hz series wins it back", () => {
  const as = createAutoScaler({ index: 2 });
  // Four seconds of 25 fps: something real went wrong.
  feed(as, 40, 100);
  const dropped = as.downs;
  assert.ok(dropped > 0, "the scaler ignored a sustained 25 fps");
  const beforeIndex = as.index;
  const beforeScale = as.scaleIndex;

  // Then thirty seconds of honest 60 Hz with the odd dropped frame, which is
  // what a healthy game on a healthy machine actually looks like.
  const ups = vsyncSeries(as, 30, 60, 90);
  assert.ok(ups > 0, "a clean 60 Hz series never won anything back: still a ratchet");
  assert.ok(as.scaleIndex < beforeScale || as.index > beforeIndex,
    "nothing was actually restored");
  assert.equal(as.scaleIndex, 0, `resolution stuck at ${autoScalerScale(as)}`);
  assert.equal(as.index, 3, `quality stuck at ${autoScalerLevel(as)}`);
});

test("recovery is paced, so the shadows do not blink on and off", () => {
  // A device that cannot hold the level it just returned to: the frame time
  // alternates between healthy and overloaded every few seconds.
  const as = createAutoScaler({ index: 2 });
  let changes = 0;
  for (let cycle = 0; cycle < 12; cycle += 1) {
    vsyncSeries(as, 3);
    feed(as, 40, 90);
    changes = as.changes;
  }
  // Without the escalating quiet period this alternation produces a change
  // every window; the penalty has to hold it well under one per second.
  assert.ok(changes < 24, `flapped ${changes} times over 12 alternations`);
  assert.ok(as.upDelay > as.upDelayBase, "the penalty never grew");
});

test("a slow device still steps down without waiting out the up penalty", () => {
  const as = createAutoScaler({ index: 3 });
  feed(as, 60, 600);
  assert.equal(as.index, 0, `did not bottom out: ${autoScalerLevel(as)}`);
  assert.equal(as.scaleIndex, SCALE_STEPS.length - 1);
  assert.equal(as.ups, 0);
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

test("a tree at the edge of the visible road is inside the shadow volume", () => {
  // Every caster stands on the span, not in it: the canopy of a roadside conifer
  // is 20–30 m above the ground the fit is handed. Fitting to the ground alone
  // leaves it behind the near plane, and a forest then throws nothing onto the
  // road — which is exactly what the game looked like.
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const carIndex = 60;
  const n = roadSpanPoints(buf, stage, carIndex, 45, 6, 1, 2.5);
  const fit = makeShadowFit();
  const ls = { r: 0, u: 0, f: 0 };
  // Every sun a stage can be run under, from a hard midday to a low golden hour.
  for (const sun of [[0.55, 0.42, -0.72], [0.1, 0.95, 0.2], [-0.8, 0.18, 0.5], [0, 0.35, 1]]) {
    fitShadowFrustum(fit, buf, n, sun[0], sun[1], sun[2], 2048, 3.5);
    assert.ok(fit.ok);
    for (let i = 0; i < n; i += 1) {
      // The tallest thing the fit promises to hold, standing on a span point.
      shadowLightSpace(fit, buf[i * 3], buf[i * 3 + 1] + SHADOW_CASTER_HEIGHT, buf[i * 3 + 2], ls);
      assert.ok(ls.r >= fit.left - 1e-4 && ls.r <= fit.right + 1e-4,
        `sun ${sun}: canopy ${i} outside horizontally: ${ls.r} not in [${fit.left}, ${fit.right}]`);
      assert.ok(ls.u >= fit.bottom - 1e-4 && ls.u <= fit.top + 1e-4,
        `sun ${sun}: canopy ${i} outside vertically: ${ls.u} not in [${fit.bottom}, ${fit.top}]`);
      assert.ok(ls.f >= fit.near - 1e-4 && ls.f <= fit.far + 1e-4,
        `sun ${sun}: canopy ${i} clipped in depth: ${ls.f} not in [${fit.near}, ${fit.far}]`);
    }
  }
  // And the ground it casts onto is still inside, so nothing was traded away.
  fitShadowFrustum(fit, buf, n, 0.55, 0.42, -0.72, 2048, 3.5);
  for (let i = 0; i < n; i += 1) {
    shadowLightSpace(fit, buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2], ls);
    assert.ok(ls.f >= fit.near - 1e-4 && ls.f <= fit.far + 1e-4, `ground ${i} at ${ls.f}`);
    assert.ok(ls.u >= fit.bottom - 1e-4 && ls.u <= fit.top + 1e-4);
  }
});

test("the fitted box is close to the ideal — a loose fit is the staircase bug", () => {
  const stage = makeStraightStage();
  const buf = new Float32Array(512 * 3);
  const n = roadSpanPoints(buf, stage, 60, 45, 6, 1, 2.5);
  const fit = makeShadowFit();
  const margin = 3.5;
  fitShadowFrustum(fit, buf, n, 0.55, 0.42, -0.72, 2048, margin);

  // The ideal is the exact bounding extent of the volume the fit has to hold:
  // the span, and the same span raised by the caster height.
  let minR = Infinity; let maxR = -Infinity;
  let minU = Infinity; let maxU = -Infinity;
  const ls = { r: 0, u: 0, f: 0 };
  for (let i = 0; i < n; i += 1) {
    for (const lift of [0, SHADOW_CASTER_HEIGHT]) {
      shadowLightSpace(fit, buf[i * 3], buf[i * 3 + 1] + lift, buf[i * 3 + 2], ls);
      if (ls.r < minR) minR = ls.r; if (ls.r > maxR) maxR = ls.r;
      if (ls.u < minU) minU = ls.u; if (ls.u > maxU) maxU = ls.u;
    }
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
    capabilities: { isWebGL2: webgl2, getMaxAnisotropy: () => 16 },
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

// ---- the weather rig is borrowed, not owned -------------------------------

test("clearStage hands the weather rig back instead of leaving it in the scene", async () => {
  const weatherMod = await import("../weather.js");
  const stage = makeStraightStage(60);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);

  const countLights = () => {
    let n = 0;
    api.scene.traverse((o) => { if (o.isLight) n += 1; });
    return n;
  };
  const bare = countLights();

  let first = 0;
  // game.js builds a fresh weather rig into renderer.scene on every beginStage
  // and never disposes one, so whoever ends a stage has to detach it. Measured
  // before this: 10 lights, then 15, then 20, then 25 — every extra key light
  // relighting the image and forcing a material recompile.
  for (let race = 0; race < 4; race += 1) {
    const weather = weatherMod.createWeather(THREE, api.scene, "overcast");
    api.buildStage(stage, { car, weather });
    const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
    api.update(frame, 1 / 60);
    const lights = countLights();
    if (race === 0) first = lights;
    assert.equal(lights, first,
      `race ${race + 1} is lit by ${lights} lights where race 1 had ${first}`);
    assert.ok(lights > bare, "the weather rig was never in the scene to begin with");
    api.clearStage();
    assert.equal(countLights(), bare,
      `clearStage left ${countLights() - bare} of the weather rig behind`);
    assert.equal(api.scene.fog, null, "the weather's fog outlived its stage");
  }
  api.dispose();
});

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
  assert.ok(left.intensity > HEADLIGHT.mainIntensity * 0.5,
    `headlights stayed off at night: ${left.intensity}`);
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

// Where the axis of a lamp meets the road, in metres ahead of the lamp. This is
// the whole question the shipped rig got wrong: it aimed from the centre of mass
// at a point 2.2 m under the road, so the beam crossed the surface a metre off
// the bumper and everything past that was lit from below.
function poolDistance(light, roadY) {
  const drop = light.position.y - roadY;
  const dy = light.position.y - light.target.position.y;
  const dh = Math.hypot(light.target.position.x - light.position.x,
    light.target.position.z - light.position.z);
  return dy > 1e-6 ? dh * (drop / dy) : Infinity;
}

// Three's own falloff for a spot light with useLegacyLights off, applied to a
// patch of level road `d` metres ahead: inverse square on distance, the cone's
// smoothstep from the axis to its rim, and the cosine of a very oblique
// incidence. Written out here so the test measures illuminance in lux rather
// than trusting a number in the source to mean something.
function roadIrradiance(light, roadY, d) {
  const h = light.position.y - roadY;
  const to = Math.hypot(d, h);
  const beta = Math.atan2(h, d);
  const aimDrop = light.position.y - light.target.position.y;
  const aimRun = Math.hypot(light.target.position.x - light.position.x,
    light.target.position.z - light.position.z);
  const theta = Math.abs(beta - Math.atan2(aimDrop, aimRun));
  const coneCos = Math.cos(light.angle);
  const penumbraCos = Math.cos(light.angle * (1 - light.penumbra));
  const t = Math.min(1, Math.max(0,
    (Math.cos(theta) - coneCos) / Math.max(1e-6, penumbraCos - coneCos)));
  const spot = t * t * (3 - 2 * t);
  let fall = light.intensity / Math.pow(to, light.decay);
  if (light.distance > 0) {
    const w = Math.max(0, 1 - Math.pow(to / light.distance, 4));
    fall *= w * w;
  }
  return fall * spot * Math.sin(beta);
}

test("the headlamps put a pool of light on the road ahead, not a glow in the air", async () => {
  const weatherMod = await import("../weather.js");
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  car.yaw = 0;
  const weather = fakeWeather();
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);

  // fakeCar carries no comHeight, so the rig falls back to the module default.
  const roadY = car.pos.y - 0.49;
  const left = api.scene.getObjectByName("opus.headlight.l");
  const pod = api.scene.getObjectByName("opus.lightpod");
  const spill = api.scene.getObjectByName("opus.headlight.spill");

  for (const lamp of [left, pod, spill]) {
    const height = lamp.position.y - roadY;
    assert.ok(height > 0.5 && height < 1.0,
      `${lamp.name} is ${height.toFixed(2)} m over the road, not at lamp height`);
    assert.ok(lamp.target.position.y < lamp.position.y,
      `${lamp.name} is not aimed downwards at all`);
  }
  const main = poolDistance(left, roadY);
  assert.ok(main > 15 && main < 45, `the dipped beam meets the road at ${main.toFixed(1)} m`);
  assert.ok(poolDistance(pod, roadY) > main, "the lamp bar throws no further than the dip");
  assert.ok(poolDistance(spill, roadY) < main, "the flood does not fill the near ground");

  // The pool has to beat the night sky it is competing with, or the road under
  // the beam is no brighter than the road beside it. A hemisphere light gives an
  // up-facing surface about half its intensity.
  const night = weatherMod.WEATHER_PRESETS.find((w) => w.id === "night-clear");
  const ambient = night.hemiIntensity * 0.5 + night.ambientIntensity;
  const lit = (d) => roadIrradiance(left, roadY, d) + roadIrradiance(pod, roadY, d)
    + roadIrradiance(spill, roadY, d);
  for (const d of [8, 15, 25]) {
    assert.ok(lit(d) > ambient * 3,
      `road at ${d} m gets ${lit(d).toFixed(3)} lx from the lamps `
      + `against ${ambient.toFixed(3)} of night sky — no visible pool`);
  }
  // And it has to fall off, or it is a flat wash rather than a beam. Measured
  // over a long baseline on purpose: the dipped pair and the lamp bar each put
  // their own lobe on the road, and the trough between them near 8 m is the
  // structure of a real dipped beam rather than a failure to fade. Reading the
  // falloff across a short baseline that straddles the trough measures the
  // trough, not the beam.
  assert.ok(lit(10) > lit(40) * 5, "the pool does not fade down the road");
  assert.ok(lit(60) < lit(15), "the beam does not run out");
  api.dispose();
});

// The composite's own transfer, transcribed from COMPOSITE_FRAG: exposure, then
// ACES, then the sRGB encode. Every judgement about how bright a lamp should be
// has to be made through this and not in linear, because linear cannot tell a
// bright road from a white hole — ACES is already within a couple of codes of
// 1.0 by the time the scene value reaches 4.
function acesFilmic(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function toneByte(linear, exposure) {
  const c = acesFilmic(Math.max(0, linear) * exposure);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, s) * 255);
}

// Irradiance on a level patch of road at a world point, from a lamp anywhere and
// aimed anywhere. roadIrradiance() above works in the vertical plane through the
// lamp's own axis, so it cannot see the toe that swings the dipped pair off the
// centreline — which is exactly where the two pools are.
function roadIrradianceAt(light, roadY, px, pz) {
  const lx = light.position.x, ly = light.position.y, lz = light.position.z;
  const ax = light.target.position.x - lx;
  const ay = light.target.position.y - ly;
  const az = light.target.position.z - lz;
  const al = Math.hypot(ax, ay, az);
  const dx = px - lx, dy = roadY - ly, dz = pz - lz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6 || al < 1e-6 || dy >= 0) return 0;
  const cosA = (dx * ax + dy * ay + dz * az) / (d * al);
  const coneCos = Math.cos(light.angle);
  const penumbraCos = Math.cos(light.angle * (1 - light.penumbra));
  const t = Math.min(1, Math.max(0,
    (cosA - coneCos) / Math.max(1e-6, penumbraCos - coneCos)));
  const spot = t * t * (3 - 2 * t);
  if (spot <= 0) return 0;
  let fall = light.intensity / Math.max(Math.pow(d, light.decay), 0.01);
  if (light.distance > 0) {
    const w = Math.max(0, 1 - Math.pow(d / light.distance, 4));
    fall *= w * w;
  }
  return fall * spot * (-dy / d);
}

// All three lamp colours are full red, so the red channel is the one that clips
// first and modelling it needs no colour at all.
function litRoad(lamps, roadY, px, pz) {
  let sum = 0;
  for (let i = 0; i < lamps.length; i += 1) sum += roadIrradianceAt(lamps[i], roadY, px, pz);
  return sum;
}

async function nightLampRig() {
  const weatherMod = await import("../weather.js");
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  car.yaw = 0;
  const weather = fakeWeather();
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  const night = weatherMod.WEATHER_PRESETS.find((w) => w.id === "night-clear");
  return {
    api,
    car,
    roadY: car.pos.y - 0.49,
    exposure: night.exposure,
    lamps: [
      api.scene.getObjectByName("opus.headlight.l"),
      api.scene.getObjectByName("opus.headlight.r"),
      api.scene.getObjectByName("opus.lightpod"),
      api.scene.getObjectByName("opus.headlight.spill"),
    ],
  };
}

test("the brightest part of the headlight pool still shows the road surface", async () => {
  const rig = await nightLampRig();
  assert.ok(rig.lamps.every(Boolean), "a lamp is missing from the rig");

  // Gravel's own albedo, and the light and dark grains a gravel texture is made
  // of. If the tone curve has already clipped, the two land on the same byte and
  // the pool is a white hole with no surface in it — which is what shipped.
  const albedo = surfaceProps(SURFACE.GRAVEL).albedo[0];
  const dark = albedo * 0.75;
  const light = albedo * 1.25;

  let peak = 0;
  let peakZ = 0;
  for (let z = rig.car.pos.z + 2; z <= rig.car.pos.z + 60; z += 0.25) {
    for (let x = -6; x <= 6.0001; x += 0.25) {
      const e = litRoad(rig.lamps, rig.roadY, x, z);
      if (e > peak) { peak = e; peakZ = z - rig.car.pos.z; }
    }
  }
  assert.ok(peak > 0, "the lamps put nothing on the road at all");

  const radiance = (a) => (a / Math.PI) * peak;
  const hot = toneByte(radiance(albedo), rig.exposure);
  const gap = toneByte(radiance(light), rig.exposure) - toneByte(radiance(dark), rig.exposure);

  assert.ok(gap >= 12,
    `a light and a dark gravel grain come out ${gap} codes apart in the hot spot `
    + `(${peak.toFixed(2)} lx at ${peakZ.toFixed(1)} m) — the surface is gone`);
  assert.ok(hot <= 242,
    `the brightest road under the lamps tone-maps to ${hot}/255 at ${peakZ.toFixed(1)} m — `
    + "no headroom left for bloom or a wet specular");

  // And the pool has to still be a pool: far brighter than the night sky it is
  // competing with, out to where the driver needs to see.
  const sky = 0.225;
  const at = (d) => litRoad(rig.lamps, rig.roadY, 0, rig.car.pos.z + d);
  assert.ok(at(25) > sky * 3, `road at 25 m gets ${at(25).toFixed(2)} lx — the pool died`);
  rig.api.dispose();
});

test("the dipped pair reads as two pools, not one merged blob", async () => {
  const rig = await nightLampRig();
  // Metres from the lamps themselves, not from the car: the lamps stand most of
  // a metre ahead of the centre of mass and the near flood covers everything
  // inside about 3 m of them.
  const lampZ = rig.lamps[0].position.z;
  const at = (x, d) => litRoad(rig.lamps, rig.roadY, x, lampZ + d);

  // Across the whole band the dipped pair owns, before the lamp bar's lobe takes
  // over at 8 m. The weakest separation in the band is the one that matters: the
  // pod that shipped flooded the crown from 5 m out, and a scan that keeps its
  // best row still finds two lobes at 4 m and calls that two beams.
  let split = Infinity;
  let worst = 0;
  for (let d = 4; d <= 7.001; d += 0.5) {
    let lobe = 0;
    for (let x = 0.25; x <= 4.0001; x += 0.25) lobe = Math.max(lobe, at(x, d));
    const ratio = lobe / Math.max(1e-6, at(0, d));
    if (ratio < split) { split = ratio; worst = d; }
  }
  assert.ok(split > 1.5,
    `at ${worst} m the brightest point off the crown is only ${split.toFixed(2)}x the crown `
    + "itself — the two beams have merged into one pool");

  // Symmetric, or one lamp is aimed wrong.
  for (const d of [5, 8, 15]) {
    const l = at(-1.5, d);
    const r = at(1.5, d);
    assert.ok(Math.max(l, r) > 0, `nothing lit at ${d} m either side of the crown`);
    assert.ok(Math.abs(l - r) < Math.max(l, r) * 0.02 + 1e-6,
      `the beam is lopsided at ${d} m: ${l.toFixed(3)} left, ${r.toFixed(3)} right`);
  }
  rig.api.dispose();
});

test("the beam leads the car: hotspot ahead, gentle nose, twin pools at mid range", async () => {
  const rig = await nightLampRig();
  const lampZ = rig.lamps[0].position.z;
  const at = (x, d) => litRoad(rig.lamps, rig.roadY, x, lampZ + d);

  let peak = 0;
  let peakD = 0;
  for (let d = 2; d <= 40; d += 0.25) {
    const e = at(0, d);
    if (e > peak) { peak = e; peakD = d; }
  }
  assert.ok(peak > 0, "the lamps put nothing on the road");
  // The shipped pool's crown peak sat 10.7 m out with the flood at the bumper
  // at 85% of it: one blob centred on the car. A rally beam leads — the
  // brightest crown light lands well down the road and the nose is a wash.
  assert.ok(peakD >= 13,
    `the crown peak is ${peakD.toFixed(1)} m ahead — it should lead the car, not sit on it`);
  assert.ok(at(0, 3) <= peak * 0.55,
    `the road 3 m ahead runs at ${(at(0, 3) / peak * 100).toFixed(0)}% of the peak — the beam is a blob on the bumper`);

  // Twin pools survive past the near flood: at 12 and 16 m the brightest light
  // is off the crown, where a toed pair puts it, not dead centre. The shipped
  // rig measured exactly 1.00x at both — one merged pool.
  //
  // And the pool is shaped, not one blob: a real beam has a trough between the
  // dipped pair's near ground and the lamp bar's far reach. The shipped profile
  // ran monotonically down from its 4 m peak with no second maximum at all.
  let trough = Infinity;
  for (let d = 6; d <= 10; d += 0.5) trough = Math.min(trough, at(0, d));
  assert.ok(trough <= peak * 0.6,
    `the crown never dips below ${(trough / peak * 100).toFixed(0)}% of its peak on the way out — `
    + "the beam is one blob with no structure in it");

  // And the far hotspot is a real second maximum, not a tail: past the twin
  // pools the beam is still at three quarters of its peak. The shipped rig
  // reached 65% and fell away from there.
  let far = 0;
  for (let d = 16; d <= 32; d += 0.5) far = Math.max(far, at(0, d));
  assert.ok(far >= peak * 0.75,
    `the beam at 16-32 m only reaches ${(far / peak * 100).toFixed(0)}% of its peak — the light dies at the bonnet`);
  rig.api.dispose();
});

// ---- edge anti-aliasing ---------------------------------------------------
//
// The composite owns the image, so it is also the one place an edge-aware
// smoothing pass can live: five extra taps inside a fullscreen pass that
// already touches every pixel, instead of doubling the scene target's sample
// count. The mirror below is anchored on the literal source, like every other
// shader mirror in this suite.

const AA_ANCHORS = [
  "vec3 aaSample(vec3 cM, vec2 uv, vec2 texel) {",
  "if (range < AA_EDGE_MIN) return cM;",
  "vec3 side = texture2D(tScene, uv + dir * texel * AA_REACH).rgb",
  "return mix(cM, side * 0.5, strength);",
  "u.uAa.value = q.aa || 0;",
];

test("the composite carries an edge-AA pass and the quality dial drives it", () => {
  for (const line of AA_ANCHORS) {
    assert.ok(RENDER_SRC.includes(line),
      `render.js no longer contains "${line}" — the AA mirror below is measuring maths nobody runs`);
  }
  const { api } = makeRenderer({ webgl2: true, quality: "medium" });
  assert.ok(api.stats.aa > 0, `medium renders with aa=${api.stats.aa} — the AA pass is wired to nothing`);
  api.setQuality("low");
  assert.equal(api.stats.aa, 0, "low must not pay for an AA pass it cannot run");
  api.dispose();
});

test("the AA blend softens a hard edge and leaves flat areas alone (mirror)", () => {
  // JS mirror of aaSample's arithmetic, anchored above. An edge pixel must
  // move most of the way to the two sides' average; a flat patch must come
  // back untouched; a weak gradient must barely move.
  const EDGE_MIN = 0.04;
  const EDGE_FULL = 0.20;
  const AMOUNT = 0.85;
  const hermite = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  function aaSample(cM, cN, cS, cE, cW, sideA, sideB) {
    const lM = lumaOf(cM);
    const lN = lumaOf(cN);
    const lS = lumaOf(cS);
    const lE = lumaOf(cE);
    const lW = lumaOf(cW);
    const range = Math.max(lM, lN, lS, lE, lW) - Math.min(lM, lN, lS, lE, lW);
    if (range < EDGE_MIN) return cM;
    // The shader derives the across-edge direction from the same luma deltas
    // and taps sideA/sideB at +-dir * texel * AA_REACH; the caller supplies
    // those two taps so the mirror tests the blend, not the sampling.
    const strength = AMOUNT * hermite(EDGE_MIN, EDGE_FULL, range);
    const mix = (a, b, t) => a + (b - a) * t;
    return [mix(cM[0], (sideA[0] + sideB[0]) * 0.5, strength),
      mix(cM[1], (sideA[1] + sideB[1]) * 0.5, strength),
      mix(cM[2], (sideA[2] + sideB[2]) * 0.5, strength)];
  }

  const dark = [0.08, 0.085, 0.09];
  const bright = [0.75, 0.75, 0.75];
  // Edge pixel on the dark side of a hard vertical edge: the bright side is
  // east, the dark side continues west, north and south are the same dark.
  const out = aaSample(dark, dark, dark, bright, dark, bright, dark);
  const before = Math.abs(lumaOf(dark) - lumaOf(bright));
  const after = Math.abs(lumaOf(out) - lumaOf(bright));
  assert.ok(after <= before * 0.65,
    `a hard edge only softened from ${before.toFixed(2)} to ${after.toFixed(2)} contrast`);

  // Flat patch: identical everywhere, so the early-out must return it exactly.
  const flat = [0.31, 0.30, 0.29];
  assert.equal(aaSample(flat, flat, flat, flat, flat, flat, flat), flat,
    "a flat patch was altered by the AA pass");

  // Weak gradient: range just over the floor, so the blend is nearly nothing.
  const weak = [0.30, 0.30, 0.30];
  const weakUp = [0.36, 0.36, 0.36];
  const weakOut = aaSample(weak, weakUp, weakUp, weakUp, weak, weakUp, weak);
  assert.ok(Math.abs(lumaOf(weakOut) - lumaOf(weak)) < 0.01,
    `a gentle gradient moved ${Math.abs(lumaOf(weakOut) - lumaOf(weak)).toFixed(3)} — the pass is blurring, not alias-fixing`);
});

// ---- contact shadow ------------------------------------------------------

test("the contact pool tightens under compression and spreads as the car rises", () => {
  const fit = makeContactShadowFit();
  const nom = 0.49;

  contactShadowFit(fit, nom, nom, 0);
  const rest = { spread: fit.spread, alpha: fit.alpha };
  assert.ok(Math.abs(rest.spread - 1) < 1e-9, `at rest the footprint is ${rest.spread}x`);
  assert.ok(rest.alpha > 0.3 && rest.alpha < 0.92, `at rest the pool is ${rest.alpha} dark`);

  contactShadowFit(fit, nom - 0.12, nom, 0);
  assert.ok(fit.spread < rest.spread,
    `a compressed car's pool is ${fit.spread}x, no tighter than the ${rest.spread}x at rest`);
  assert.ok(fit.alpha > rest.alpha, "a compressed car's pool did not darken");

  contactShadowFit(fit, nom + 0.12, nom, 0);
  assert.ok(fit.spread > rest.spread, "an extended car's pool did not spread");
  assert.ok(fit.alpha < rest.alpha, "an extended car's pool did not lighten");

  // Energy, roughly: whatever the pool spreads over, it loses in darkness. A
  // footprint that grew without lightening would read as the car growing a
  // bigger, equally solid shadow as it took off.
  const area = (f) => f.spread * f.spread * f.alpha;
  contactShadowFit(fit, nom, nom, 0);
  const a0 = area(fit);
  contactShadowFit(fit, nom + 0.3, nom, 0);
  assert.ok(Math.abs(area(fit) - a0) < a0 * 0.05,
    "the pool gains darkness as it spreads instead of conserving it");
});

test("the contact pool fades out when the car is airborne", () => {
  const fit = makeContactShadowFit();
  const nom = 0.49;

  contactShadowFit(fit, nom, nom, 0.05);
  assert.ok(fit.visible, "a wheel skipping over a stone put the pool out");
  const brief = fit.alpha;

  contactShadowFit(fit, nom, nom, 0.25);
  assert.ok(fit.alpha < brief, "a quarter of a second of air did not start the fade");

  contactShadowFit(fit, nom, nom, 1.5);
  assert.equal(fit.visible, false, `still drawing a pool after 1.5 s of air: ${fit.alpha}`);

  // And a car a metre up has a pool that is wide and almost gone, on height
  // alone, so a launch off a crest fades before airTime has caught up.
  contactShadowFit(fit, nom + 1, nom, 0);
  assert.ok(fit.spread > 1.5 && fit.alpha < 0.25,
    `a metre off the ground the pool is ${fit.spread}x at ${fit.alpha}`);
});

test("the contact pool sits on the ground under the car, in one draw call", () => {
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  car.yaw = 0.4;
  const weather = fakeWeather();
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  api.update(frame, 1 / 60);

  const pool = api.scene.getObjectByName("opus.contactShadow");
  assert.ok(pool && pool.isMesh, "there is no contact shadow in the scene");
  assert.equal(pool.visible, true, "the contact shadow is not being drawn");
  assert.equal(pool.children.length, 0, "the contact shadow is more than one draw call");
  assert.equal(pool.material.blending, THREE.MultiplyBlending,
    "the pool is added to the scene rather than taken out of it");
  assert.equal(pool.material.depthWrite, false, "the pool writes depth");
  assert.ok(pool.material.uniforms.uAlpha.value > 0.2,
    `the pool is drawn at ${pool.material.uniforms.uAlpha.value} — invisible`);

  // fakeWorld's ground is y = 0 everywhere.
  assert.ok(Math.abs(pool.position.x - car.pos.x) < 1e-6
    && Math.abs(pool.position.z - car.pos.z) < 1e-6, "the pool is not under the car");
  assert.ok(pool.position.y > 0 && pool.position.y < 0.12,
    `the pool floats ${pool.position.y} m over the ground`);

  // It has to be big enough to look like the car and small enough not to shade
  // the verge.
  assert.ok(pool.scale.z > 3 && pool.scale.z < 7, `pool is ${pool.scale.z} m long`);
  assert.ok(pool.scale.x > 1.6 && pool.scale.x < 4, `pool is ${pool.scale.x} m wide`);
  assert.ok(pool.scale.z > pool.scale.x, "the pool is wider than the car is long");

  // Turned with the car, so it reads as the car's own footprint.
  const e = new THREE.Euler().setFromQuaternion(pool.quaternion, "YXZ");
  assert.ok(Math.abs(e.y - car.yaw) < 1e-5, `pool yaw is ${e.y}, car yaw is ${car.yaw}`);

  // A dive under braking pitches the body; the pool must stay flat on the road.
  car.pitch = 0.12;
  car.quat = { x: 0.06, y: 0, z: 0, w: 0.998 };
  api.update(frame, 1 / 60);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pool.quaternion);
  assert.ok(up.y > 0.9999, `the pool tipped with the chassis: up.y = ${up.y}`);

  api.clearStage();
  assert.equal(pool.visible, false, "the pool outlived its stage onto the menu backdrop");
  api.dispose();
});

test("the contact pool follows ride height and lets go when the car takes off", () => {
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  const weather = fakeWeather();
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  const pool = api.scene.getObjectByName("opus.contactShadow");

  car.pos.y = 0.49;
  api.update(frame, 1 / 60);
  const restAlpha = pool.material.uniforms.uAlpha.value;
  const restWidth = pool.scale.x;

  car.pos.y = 0.37;
  api.update(frame, 1 / 60);
  assert.ok(pool.material.uniforms.uAlpha.value > restAlpha, "a squatting car's pool is no darker");
  assert.ok(pool.scale.x < restWidth, "a squatting car's pool is no tighter");

  car.pos.y = 2.4;
  car.airTime = 0.9;
  car.onGround = 0;
  api.update(frame, 1 / 60);
  assert.equal(pool.visible, false, "the car is 2 m in the air and still standing on its shadow");
  api.dispose();
});

test("the composite still tone-maps after exposure, so the lamp numbers mean what they say", () => {
  const composite = RENDER_SRC.slice(RENDER_SRC.indexOf("const COMPOSITE_FRAG"));
  const exposure = composite.indexOf("col *= uExposure");
  const tone = composite.indexOf("col = acesFilmic(col)");
  assert.ok(exposure > 0 && tone > exposure,
    "the composite no longer applies exposure and then ACES — the lamp intensities "
    + "were sized against that curve and have to be re-sized");
});

test("the beam cone only exists where there is something in the air to scatter off", () => {
  const stage = makeStraightStage(80);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true });
  const car = fakeCar(stage);
  car.yaw = 0;
  // A clear, dry, frosty night: lights on, nothing airborne.
  const weather = fakeWeather({
    current: {
      exposure: 2.3, windSpeed: 1.2, windDirection: 0.3, fogDensity: 0.0009,
      precipRate: 0, turbidity: 1.8, roadWetness: 0.05, visibility: 6500,
    },
    wet: { film: 0, standing: 0, snowCover: 0 },
  });
  api.buildStage(stage, { car, weather });
  const frame = { car, stage, weather, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);

  const beams = api.scene.getObjectByName("opus.beams");
  assert.ok(api.scene.getObjectByName("opus.headlight.l").intensity > 1,
    "the lights are meant to be on for this one");
  assert.equal(beams.visible, false,
    "a light cone hangs in clear night air — this is the white balloon over the bonnet");

  // Same night, now in hill fog: the cone is the point of it.
  weather.current.fogDensity = 0.019;
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  assert.equal(beams.visible, true, "no beam in fog");
  assert.ok(beams.children[0].material.uniforms.uStrength.value > 0.1,
    "the beam in fog is too faint to see");

  // Whatever the weather, the cone lies along the beam rather than level: its
  // far end has to be lower than its apex.
  const tip = new THREE.Vector3(0, 0, 20).applyQuaternion(beams.quaternion);
  assert.ok(tip.y < -0.2, `the cone is level, not dipped onto the road (${tip.y.toFixed(3)})`);
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
  // Thresholds are fractions of the lamp's own rating: it is quoted in candela,
  // so an absolute figure here would only measure the units.
  const on = HEADLIGHT.mainIntensity * 0.5;
  const dark = HEADLIGHT.mainIntensity * 0.005;
  const off = api.scene.getObjectByName("opus.headlight.l").intensity;
  assert.ok(off < dark, `headlights were on in daylight: ${off}`);

  api.toggleHeadlights();
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  assert.ok(api.scene.getObjectByName("opus.headlight.l").intensity > on,
    "the manual override did not switch them on");

  api.toggleHeadlights();
  for (let i = 0; i < 60; i += 1) api.update(frame, 1 / 60);
  assert.ok(api.scene.getObjectByName("opus.headlight.l").intensity < dark,
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

// ---- antialiasing ---------------------------------------------------------

test("the scene target is multisampled where WebGL2 allows it", () => {
  for (const level of ["medium", "high", "ultra"]) {
    const { api } = makeRenderer({ webgl2: true, quality: level });
    assert.equal(api.stats.post, true, `${level} lost the post chain`);
    // Once post owns the image the canvas `antialias` attribute is dead — the
    // back buffer only ever receives a full-screen quad — so the render target
    // is the only place the resolve can happen.
    assert.equal(api.stats.samples, qualitySettings(level).msaa,
      `${level} rendered the scene into a non-multisampled target`);
    assert.ok(api.stats.samples > 0);
    api.dispose();
  }
});

test("a device without WebGL2 gets a plain target rather than a broken one", () => {
  const { api } = makeRenderer({ webgl2: false, quality: "ultra" });
  assert.equal(api.stats.samples, 0, "asked WebGL1 for a multisampled target");
  api.dispose();
});

test("the multisample count follows a quality change", () => {
  const { api } = makeRenderer({ webgl2: true, quality: "ultra" });
  assert.equal(api.stats.samples, qualitySettings("ultra").msaa);
  api.setQuality("medium");
  assert.equal(api.stats.samples, qualitySettings("medium").msaa,
    "the target kept the old sample count");
  // Post off means no render targets at all: 18 MB of VRAM on the one device
  // that just told us it cannot afford them.
  api.setQuality("low");
  assert.equal(api.stats.post, false);
  assert.equal(api.stats.samples, 0);
  api.setQuality("high");
  assert.equal(api.stats.samples, qualitySettings("high").msaa,
    "the targets did not come back with the post chain");
  api.dispose();
});

// ---- anisotropy -----------------------------------------------------------

function texturedLibrary(THREE_) {
  const tex = () => {
    const t = new THREE_.DataTexture(new Uint8Array(4), 1, 1);
    t.needsUpdate = true;
    return t;
  };
  const mat = new THREE_.MeshStandardMaterial({
    map: tex(), normalMap: tex(), roughnessMap: tex(),
  });
  const geo = new THREE_.PlaneGeometry(1, 1);
  const make = (name) => {
    const g = new THREE_.Group();
    const m = new THREE_.Mesh(geo, mat);
    m.name = name;
    g.add(m);
    return { group: g, dispose() {} };
  };
  return { material: mat, lib: { buildRoadMesh: () => make("road"), buildTerrainMesh: () => make("terrain") } };
}

test("adopted ground textures are filtered anisotropically at the quality asked for", () => {
  const { material, lib } = texturedLibrary(THREE);
  const stage = makeStraightStage(40);
  stage.world = fakeWorld(stage);
  const { api } = makeRenderer({ webgl2: true, quality: "high", meshes: lib });
  api.buildStage(stage, { car: fakeCar(stage) });
  // Trilinear filtering blurs along the wrong axis on a surface seen edge-on, so
  // a road turns into a featureless band about 30 m out. The knob was declared
  // at all four levels and read by nobody.
  for (const key of ["map", "normalMap", "roughnessMap"]) {
    assert.equal(material[key].anisotropy, qualitySettings("high").anisotropy,
      `${key} was left at the default filter`);
  }
  api.setQuality("low");
  assert.equal(material.map.anisotropy, qualitySettings("low").anisotropy,
    "a quality change did not re-filter the textures");
  api.setQuality("ultra");
  // Capped by what the device can actually do, not by what the table asks for.
  assert.equal(material.map.anisotropy, Math.min(qualitySettings("ultra").anisotropy, 16));
  api.clearStage();
  api.dispose();
});

// ---- scenery LOD on the shipping path -------------------------------------
//
// meshes.js hands back a finished group of InstancedMeshes, not a per-kind LOD
// library, and each of those meshes carries one bounding sphere spanning the
// whole stage — so three's frustum test is all-or-nothing and every tree in a
// 9 km stage is submitted every frame, twice over with the shadow pass. These
// tests drive that exact shape: if the shipping path ever stops taking the
// placement over, the counts below go straight back to "all of it".

function instancedSceneryLibrary(THREE_, items) {
  const geo = new THREE_.ConeGeometry(1, 4, 5);
  const mat = new THREE_.MeshStandardMaterial({ color: 0x2c4a22 });
  const mesh = new THREE_.InstancedMesh(geo, mat, items.length);
  mesh.name = "scenery-tree:0";
  mesh.castShadow = true;
  const m = new THREE_.Matrix4();
  const p = new THREE_.Vector3();
  const q = new THREE_.Quaternion();
  const s = new THREE_.Vector3(1, 1, 1);
  const colour = new THREE_.Color();
  for (let i = 0; i < items.length; i += 1) {
    p.set(items[i].x, items[i].y, items[i].z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    colour.setRGB(1, 0.9, 0.95);
    mesh.setColorAt(i, colour);
  }
  const group = new THREE_.Group();
  group.name = "meshes.scenery";
  group.add(mesh);
  return { mesh, lib: { buildSceneryLibrary: () => ({ group, meshes: [{ key: "tree", mesh }], dispose() {} }) } };
}

function sceneryStage(n, spacing = 6) {
  const stage = makeStraightStage(400);
  stage.world = fakeWorld(stage);
  stage.scenery = [];
  for (let i = 0; i < n; i += 1) {
    stage.scenery.push({
      kind: "tree", x: (i % 2 ? 9 : -9), y: 0, z: i * spacing, yaw: 0, scale: 1, variant: 0,
    });
  }
  stage.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: n * spacing + 60 };
  return stage;
}

test("a pre-instanced scenery group is distance-culled, not drawn whole", () => {
  const stage = sceneryStage(1200);
  const { mesh, lib } = instancedSceneryLibrary(THREE, stage.scenery);
  const { api } = makeRenderer({ webgl2: true, quality: "high", meshes: lib });
  const car = fakeCar(stage);
  car.pos.z = 0;
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  api.update(frame, 1 / 60);

  const q = qualitySettings("high");
  assert.ok(api.stats.draws > 0, "the shipping path issued no scenery at all");
  assert.ok(mesh.count > 0, "every instance was culled");
  assert.ok(mesh.count < stage.scenery.length,
    `all ${mesh.count} instances were submitted — nothing is being culled`);
  assert.ok(mesh.count <= q.sceneryBudget, `over budget: ${mesh.count}`);
  // Nothing beyond the draw distance may be in the submitted set.
  const far = q.sceneryDistance + 40;
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const dz = m.elements[14] - api.camera.position.z;
    const dx = m.elements[12] - api.camera.position.x;
    assert.ok(Math.hypot(dx, dz) <= far, `instance ${i} is ${Math.hypot(dx, dz)} m away`);
  }
  api.dispose();
});

test("the culled set follows the car down the stage", () => {
  const stage = sceneryStage(1200);
  const { mesh, lib } = instancedSceneryLibrary(THREE, stage.scenery);
  const { api } = makeRenderer({ webgl2: true, quality: "medium", meshes: lib });
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };

  car.pos.z = 40;
  for (let i = 0; i < 4; i += 1) api.update(frame, 1 / 60);
  const near = new Set();
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) { mesh.getMatrixAt(i, m); near.add(Math.round(m.elements[14])); }
  assert.ok(near.size > 4, "nothing was drawn near the start");

  // Well past everything: the far end of the stage has no scenery within range.
  // setCamera snaps the rig rather than waiting out its spring.
  car.pos.z = 1200 * 6 + 4000;
  api.setCamera("chase");
  for (let i = 0; i < 4; i += 1) api.update(frame, 1 / 60);
  assert.equal(mesh.count, 0, `${mesh.count} instances drawn with the stage 4 km behind`);
  assert.equal(api.stats.draws, 0);
  api.dispose();
});

test("the per-frame instance budget holds on a dense pre-instanced stage", () => {
  const stage = sceneryStage(4000, 1.2);
  const { mesh, lib } = instancedSceneryLibrary(THREE, stage.scenery);
  const { api } = makeRenderer({ webgl2: true, quality: "low", meshes: lib });
  const car = fakeCar(stage);
  car.pos.z = 1200;
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 4; i += 1) api.update(frame, 1 / 60);
  const q = qualitySettings("low");
  assert.ok(api.stats.draws <= q.sceneryBudget, `issued ${api.stats.draws} over ${q.sceneryBudget}`);
  assert.equal(mesh.count, api.stats.draws);
  // The budget must buy the *nearest* scenery: walking the grid from its
  // minimum corner spends it on whatever lies north-west of the car.
  const m = new THREE.Matrix4();
  let worst = 0;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    worst = Math.max(worst, Math.abs(m.elements[14] - api.camera.position.z));
  }
  assert.ok(worst < q.sceneryDistance,
    `the budget was spent on scenery ${worst} m away while nearer trees went undrawn`);
  api.dispose();
});

test("the far edge of the scenery fades out rather than popping", () => {
  const stage = sceneryStage(1200);
  const { mesh, lib } = instancedSceneryLibrary(THREE, stage.scenery);
  const { api } = makeRenderer({ webgl2: true, quality: "high", meshes: lib });
  const car = fakeCar(stage);
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  api.update(frame, 1 / 60);
  const q = qualitySettings("high");
  const m = new THREE.Matrix4();
  let sawFaded = false;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const d = Math.hypot(m.elements[12] - api.camera.position.x,
      m.elements[14] - api.camera.position.z);
    const scale = Math.hypot(m.elements[0], m.elements[1], m.elements[2]);
    assert.ok(scale > 0 && scale <= 1.001, `instance ${i} scaled to ${scale}`);
    if (d > q.sceneryDistance - 55) sawFaded = sawFaded || scale < 0.98;
    else assert.ok(scale > 0.99, `a near instance was shrunk to ${scale}`);
  }
  assert.ok(sawFaded, "the outermost instances popped in at full size");
  api.dispose();
});

test("scenery behind the camera is not submitted", () => {
  // The instanced meshes carry one bounding sphere over the whole stage and are
  // marked frustumCulled = false, so nothing downstream can reject them: what is
  // written into the buffer *is* what the GPU draws. Half of a distance-culled
  // set is behind the car, and paying for it every frame is the whole cost of
  // this defect.
  const stage = makeStraightStage(700);
  stage.world = fakeWorld(stage);
  stage.scenery = [];
  for (let z = 0; z < 1400; z += 7) {
    stage.scenery.push({ kind: "tree", x: -9, y: 0, z, yaw: 0, scale: 1, variant: 0 });
    stage.scenery.push({ kind: "tree", x: 9, y: 0, z, yaw: 0, scale: 1, variant: 0 });
  }
  stage.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 1460 };
  const { mesh, lib } = instancedSceneryLibrary(THREE, stage.scenery);
  const { api } = makeRenderer({ webgl2: true, quality: "high", meshes: lib });
  const car = fakeCar(stage);
  car.pos.z = 700;
  api.buildStage(stage, { car });
  const frame = { car, stage, alpha: 0, state: "racing", surface: fakeSurface() };
  for (let i = 0; i < 4; i += 1) api.update(frame, 1 / 60);

  const q = qualitySettings("high");
  const cam = api.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  let reachable = 0;
  for (const it of stage.scenery) {
    if (Math.hypot(it.x - cam.position.x, it.z - cam.position.z) <= q.sceneryDistance) reachable += 1;
  }
  assert.ok(mesh.count > 20, `only ${mesh.count} instances drawn — the view is empty`);
  assert.ok(mesh.count < reachable * 0.75,
    `${mesh.count} of ${reachable} in-range instances submitted — the view is not being used`);

  // A cell is 96 m of grid plus the pad that keeps off-screen shadow casters, so
  // this is how far behind the camera an instance can legitimately still be.
  const behindLimit = -(96 + 28 + 10);
  const m = new THREE.Matrix4();
  let worstBehind = 0;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    const along = (m.elements[12] - cam.position.x) * fwd.x + (m.elements[14] - cam.position.z) * fwd.z;
    worstBehind = Math.min(worstBehind, along);
  }
  assert.ok(worstBehind >= behindLimit,
    `an instance ${(-worstBehind).toFixed(0)} m behind the camera was submitted`);
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

    // The real meshes.js scenery, on the path the game actually takes. A zero
    // here means the LOD and budget system has fallen back to dead code again
    // and the whole stage's trees are being submitted every frame.
    let placed = 0;
    group.traverse((o) => {
      if (o.isInstancedMesh && /scenery/.test(o.name || "")) placed += o.instanceMatrix.count;
    });
    assert.ok(placed > 0, "meshes.js placed no scenery instances at all");
    assert.ok(api.stats.draws > 0, "no scenery was issued on the shipping path");
    assert.ok(api.stats.draws < placed,
      `all ${placed} instances were submitted — nothing is distance-culled`);
    assert.ok(api.stats.draws <= qualitySettings("medium").sceneryBudget,
      `${api.stats.draws} instances is over the frame budget`);
    assert.equal(api.stats.anisotropy, qualitySettings("medium").anisotropy,
      "meshes.js's ground textures were left at the default filter");

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
    "function contactShadowFit",
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

test("the contact shadow update allocates nothing either", () => {
  // Same construction as above, but this one lives inside createRenderer(), so
  // its closing brace is at two spaces rather than at column 0.
  const start = RENDER_SRC.indexOf("  function updateContactShadow");
  assert.ok(start > 0, "updateContactShadow not found");
  const end = RENDER_SRC.indexOf("\n  }\n", start);
  const body = RENDER_SRC.slice(start, end);
  assert.ok(body.length > 200 && body.length < 3000, `body scan took ${body.length} chars`);
  assert.equal(/\bnew\s+[A-Z]/.test(body), false, "updateContactShadow allocates with new");
  assert.equal(/=\s*\{\s*[a-zA-Z"']/.test(body), false,
    "updateContactShadow allocates an object literal");
  // And the quaternion and vector it works through are built once, outside it.
  for (const scratch of ["const qTilt = new three.Quaternion()",
    "const qYaw = new three.Quaternion()", "const vNormal = new three.Vector3()"]) {
    assert.ok(RENDER_SRC.includes(scratch), `${scratch} is not a shared scratch`);
  }
  assert.ok(CONTACT_SHADOW.lift > 0, "the pool would z-fight the ground it sits on");
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

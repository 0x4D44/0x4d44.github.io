import test from "node:test";
import assert from "node:assert/strict";
import { springStep, speedFov, chaseArm, chaseHeadingTarget, avoidTerrain, shakeFromEvents, nextShot, CAMERA_MODES } from "../render/camera.mjs";
import { makeRng } from "../core/rng.mjs";
import { curve, dimsFor, eyePoints, inArch } from "../render/cars/profiles.mjs";
import { CARS, CAR_IDS } from "../core/cars.mjs";

test("camera modes are the contract set", () => {
  assert.deepEqual(CAMERA_MODES, ["chase", "far", "bumper", "bonnet", "cockpit", "cinematic", "replay"]);
});

test("springStep converges on the target without overshoot when critically damped", () => {
  const s = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 300; i++) { springStep(s, 10, 8, 1, 1 / 60); max = Math.max(max, s.x); }
  assert.ok(Math.abs(s.x - 10) < 1e-3, `x=${s.x}`);
  assert.ok(max <= 10.0001, `overshoot ${max}`);
});

test("springStep is stable for large dt (sub-stepped) and ignores dt<=0", () => {
  const s = { x: 0, v: 0 };
  springStep(s, 5, 40, 1, 0.1);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 20);
  const t = { x: 3, v: 1 };
  springStep(t, 5, 10, 1, 0);
  assert.deepEqual(t, { x: 3, v: 1 });
});

test("an under-damped spring overshoots (sanity that damping ratio matters)", () => {
  const s = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 120; i++) { springStep(s, 1, 10, 0.3, 1 / 60); max = Math.max(max, s.x); }
  assert.ok(max > 1.1);
});

test("speed FOV rises monotonically and is bounded", () => {
  let prev = -1;
  for (let k = 0; k <= 300; k += 10) { const f = speedFov(62, k); assert.ok(f >= prev); prev = f; }
  assert.ok(speedFov(62, 1e6) < 62 + 30);
  assert.equal(speedFov(62, 0, 5), 67);
});

test("chase arm gets longer and higher with speed", () => {
  const a = chaseArm(0), b = chaseArm(200);
  assert.ok(b.dist > a.dist && b.height > a.height);
  assert.ok(chaseArm(100, true).dist > chaseArm(100, false).dist);
});

test("chase heading follows the body when slow and leans toward velocity in a slide", () => {
  assert.equal(chaseHeadingTarget(0.3, 1.5, 1), 0.3);
  const h = chaseHeadingTarget(0, 1.0, 25);
  assert.ok(h > 0.3 && h < 1.0, `h=${h}`);
  // wraps correctly across +-pi
  const w = chaseHeadingTarget(3.1, -3.1, 25);
  assert.ok(Math.abs(w) > 3.0, `wrap ${w}`);
});

test("terrain avoidance lifts the camera above a hill and pulls it in when the arm is blocked", () => {
  const hill = (x, z) => (z > 5 && z < 12 ? 6 : 0);
  const out = { x: 0, y: 2, z: 14 };
  const f = avoidTerrain(hill, 0, 1.5, 0, out, 0.6);
  assert.ok(f < 1, `frac ${f}`);
  assert.ok(f >= 0.55 - 1e-9, `arm shortened below the floor: ${f}`);
  assert.ok(out.z >= 14 * 0.55 - 1e-6, `z ${out.z}`);
  assert.ok(out.y > hill(0, out.z) + 0.45, `camera lifted over the hill: y ${out.y}`);
  const free = { x: 0, y: 3, z: 14 };
  assert.equal(avoidTerrain(() => 0, 0, 1, 0, free, 0.6), 1);
  assert.equal(free.z, 14);
  const low = { x: 0, y: -2, z: 5 };
  avoidTerrain(() => 0, 0, 1, 0, low, 0.6);
  assert.ok(low.y >= 0.6 - 1e-9);
});

test("crash and landing events raise shake, which decays", () => {
  let s = 0;
  s = shakeFromEvents(s, [{ t: "impact", strength: 1 }], 1 / 60);
  assert.ok(s > 0.9);
  const after = shakeFromEvents(s, [], 1);
  assert.ok(after < s * 0.1);
  assert.ok(shakeFromEvents(0, [{ t: "landing", strength: 0.5 }], 0.016) > 0.2);
  assert.equal(shakeFromEvents(0, [{ t: "shift" }], 0.016), 0);
  assert.ok(shakeFromEvents(0, [{ t: "impact", strength: 50 }], 0.016) <= 1);
});

test("cinematic shot scheduler is deterministic and returns sane durations", () => {
  const a = makeRng(9), b = makeRng(9);
  let prev = "";
  for (let i = 0; i < 30; i++) {
    const x = nextShot(a, false, prev), y = nextShot(b, false, prev);
    assert.deepEqual(x, y);
    assert.ok(x.dur >= 3 && x.dur <= 7 && (x.side === 1 || x.side === -1));
    prev = x.type;
  }
});

test("curve() is monotone between monotone control points and hits them", () => {
  const f = curve([[0, 0], [0.3, 1], [0.6, 1.1], [1, 3]]);
  assert.equal(f(0), 0); assert.equal(f(1), 3);
  let prev = -1;
  for (let t = 0; t <= 1; t += 0.01) { const v = f(t); assert.ok(v >= prev - 1e-9); prev = v; }
});

test("car dimensions: every car fits its spec and the cabin sits over the wheelbase", () => {
  for (const id of CAR_IDS) {
    const d = dimsFor(CARS[id]);
    assert.ok(Math.abs((d.zR - d.zF) - CARS[id].length) < 1e-6, id);
    assert.ok(d.cabin.t0 > 0.2 && d.cabin.t1 < 1.0 && d.cabin.rs < d.cabin.re);
    assert.ok(d.roof > 1.2 && d.roof < 1.6, `${id} roof ${d.roof}`);
    // wheels inside the body envelope, arches cut the flank
    for (const w of d.wheels) { assert.ok(Math.abs(w.x) < d.hw + 0.05); assert.ok(w.z > d.zF && w.z < d.zR); assert.ok(inArch(d, w.x * 1.6, w.r, w.z)); }
    const e = eyePoints(CARS[id]);
    assert.ok(e.bonnet[1] > 0.9 && e.bonnet[1] < d.roof && e.bumper[2] < d.zF + 0.01, id);
    for (let t = 0; t <= 1; t += 0.05) assert.ok(Number.isFinite(d.topC(t)) && d.topC(t) > d.sill);
  }
});

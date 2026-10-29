// DYNAMICS lane: collisions, tunnelling, damage, jumps. Run: node --test tests/dynamics-collision.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const input = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
const tree = (x, z, r = 0.5, hardness = 1) => ({ x, z, r, kind: "tree", hardness, y0: 0, y1: 6 });

function run(stage, id, speed, seconds, inp, onStep) {
  const v = createVehicle(CARS[id], { tyre: "gravel" });
  v.reset(stage.startPose, speed, stage);
  const evs = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    v.step(DT, inp, stage);
    for (const e of v.state.events) evs.push({ ...e });
    v.state.events.length = 0;
    if (onStep) onStep(v.state, i * DT);
  }
  return { v, evs };
}
const speedOf = (s) => Math.hypot(s.vx, s.vy, s.vz);

test("head-on tree hit: impact event at the front, big speed loss, energy never increases", () => {
  for (const id of CAR_IDS) {
    const st = makeTestStage({ length: 600, width: 12, boundary: 400, obstacles: [tree(0, -80)] });
    let maxAfter = 0, hit = false;
    const { v, evs } = run(st, id, 22, 6, input(), (s) => {
      if (s.collided < 0.5) hit = true;
      if (hit) maxAfter = Math.max(maxAfter, speedOf(s));
    });
    const imp = evs.filter((e) => e.t === "impact");
    assert.ok(imp.length >= 1, id + " no impact event");
    assert.equal(imp[0].zone, "front", id + " zone");
    assert.ok(imp[0].strength > 0.2 && imp[0].strength <= 1, id + " strength " + imp[0].strength);
    assert.ok(maxAfter <= 22 * 1.02, `${id} gained speed after impact: ${maxAfter.toFixed(1)}`);
    assert.ok(speedOf(v.state) < 6, `${id} still moving at ${speedOf(v.state).toFixed(1)} m/s`);
    assert.ok(v.state.damage.body.front > 0.05, id + " no front damage");
    assert.ok(Math.abs(v.state.z + 80) < 15, id + " ended far from the tree");
    assert.ok(v.state.collided < 99);
  }
});

test("no tunnelling: a thin post at 200 km/h still stops the car; a soft boundary wall holds it", () => {
  for (const id of CAR_IDS) {
    const st = makeTestStage({ length: 900, width: 12, boundary: 400, obstacles: [tree(0.2, -400, 0.12)] });
    let minZ = 0;
    const inp = input(); inp.throttle = 1;
    const { v } = run(st, id, 55.5, 8, inp, (s) => { minZ = Math.min(minZ, s.z); });
    assert.ok(minZ > -401.5, `${id} passed through the post (min z ${minZ.toFixed(1)})`);
  }
  const wall = makeTestStage({ length: 900, width: 12, boundary: 7, surf: SURFACE.GRAVEL });
  let maxLat = 0;
  const inp = input(); inp.throttle = 0.6; inp.steer = 0.12;
  run(wall, "huia", 30, 12, inp, (s) => { maxLat = Math.max(maxLat, Math.abs(s.lat)); });
  assert.ok(maxLat < 11, "boundary wall leaked: lat " + maxLat.toFixed(1));
});

test("damage is monotonic across repeated hits and zoned by impact side", () => {
  const st = makeTestStage({ length: 600, width: 12, boundary: 400, obstacles: [tree(0, -60), tree(0, -120), tree(0, -180)] });
  const v = createVehicle(CARS.huia, { tyre: "gravel" });
  v.reset(st.startPose, 20, st);
  const inp = input(); inp.throttle = 0.7;
  let prev = null, regress = 0, impacts = 0;
  for (let i = 0; i < 120 * 14; i++) {
    v.step(DT, inp, st);
    for (const e of v.state.events) if (e.t === "impact") impacts++;
    v.state.events.length = 0;
    const d = v.state.damage;
    const flat = [d.engine, d.gearbox, d.steering, d.radiator, d.total, ...d.suspension, ...d.tyres, d.body.front, d.body.rear, d.body.left, d.body.right];
    if (prev) for (let k = 0; k < flat.length; k++) if (flat[k] < prev[k] - 1e-12) regress++;
    prev = flat;
    // relaunch short of the next tree so the car really takes several hits (damage persists across reset)
    if (v.state.speed < 2 && impacts >= 1 && impacts < 3) v.reset({ x: 0, y: 0, z: -60 * impacts - 20, yaw: 0 }, 20, st);
  }
  assert.ok(impacts >= 2, "only " + impacts + " impacts");
  assert.equal(regress, 0, "damage decreased without repair");
  assert.ok(v.state.damage.total > 0.1 && v.state.damage.total <= 1);
  // zoning: a hit on the right side hurts the right more than the left; a front hit hurts the front most
  const side = makeTestStage({ length: 400, width: 12, boundary: 400, obstacles: [tree(1.1, -60, 0.4)] });
  const w = createVehicle(CARS.kea, { tyre: "gravel" });
  w.reset(side.startPose, 20, side);
  const si = input(); si.throttle = 0.5; si.steer = 0.0;
  for (let i = 0; i < 120 * 5; i++) { w.step(DT, si, side); w.state.events.length = 0; }
  const b = w.state.damage.body;
  assert.ok(b.right > b.left, `side hit zoning right ${b.right.toFixed(3)} left ${b.left.toFixed(3)}`);
  // repair lowers, resetAll clears
  const before = v.state.damage.total;
  const bodyBefore = v.state.damage.body.front;
  assert.ok(bodyBefore > 0);
  v.repair({ body: 1 });
  assert.equal(v.state.damage.body.front, 0);
  v.repair();
  assert.ok(v.state.damage.total < before && v.state.damage.total === 0);
  v.resetAll(st.startPose, 0, st);
  assert.equal(v.state.damage.total, 0);
});

test("a crash damaged enough breaks the engine and raises engine_fail once", () => {
  const obs = [];
  for (let z = -60; z > -600; z -= 40) obs.push(tree(0, z, 0.6));
  const st = makeTestStage({ length: 700, width: 12, boundary: 400, obstacles: obs });
  const inp = input(); inp.throttle = 1;
  const v = createVehicle(CARS.piwakawaka, { tyre: "gravel" });
  v.reset(st.startPose, 30, st);
  let fails = 0;
  for (let i = 0; i < 120 * 40; i++) {
    v.step(DT, inp, st);
    for (const e of v.state.events) if (e.t === "engine_fail") fails++;
    v.state.events.length = 0;
    // keep re-launching so the car keeps hitting trees
    if (v.state.speed < 3) v.reset({ x: 0, y: 0, z: v.state.z + 12, yaw: 0 }, 30, st);
  }
  assert.ok(v.state.damage.total > 0.5, "total " + v.state.damage.total);
  assert.ok(fails <= 1, "engine_fail fired " + fails);
});

test("jump: leaving a ramp makes the car airborne, then a landing event with strength follows", () => {
  const ramp = (x, z) => (z < -150 && z > -174 ? 1.2 * Math.sin(Math.PI * (-150 - z) / 24) : 0); // a smooth 1.2 m hump, like the stage jump hazards
  const st = makeTestStage({ length: 600, width: 12, boundary: 400, height: ramp });
  const inp = input(); inp.throttle = 1;
  const v = createVehicle(CARS.huia, { tyre: "gravel" });
  v.reset(st.startPose, 30, st);
  let airT = 0, maxY = -1e9, landing = null;
  for (let i = 0; i < 120 * 14; i++) {
    v.step(DT, inp, st);
    if (v.state.airborne) airT += DT;
    maxY = Math.max(maxY, v.state.y);
    for (const e of v.state.events) if (e.t === "landing" && !landing) landing = { ...e };
    v.state.events.length = 0;
  }
  assert.ok(airT > 0.3, "air time " + airT.toFixed(2));
  assert.ok(maxY > 1.5, "apex " + maxY.toFixed(2));
  assert.ok(maxY < 4, "apex absurdly high " + maxY.toFixed(2));
  assert.ok(landing && landing.strength > 0.05 && landing.strength <= 1, "landing " + JSON.stringify(landing));
  assert.ok(Math.abs(v.state.y) < 1 && !v.state.flipped, "ended upright on the ground");
});

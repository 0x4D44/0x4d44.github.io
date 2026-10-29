// Literal pins for the stage-rule constants: every threshold is tested one step each side, with
// the number written out (never RULES.x), so changing a constant x10 or /10 fails a test.
import test from "node:test";
import assert from "node:assert/strict";
import { createRun, RULES } from "../core/rules.mjs";

function mockStage() {
  return {
    id: "mock", lengthM: 1000,
    checkpoints: [{ s: 0, name: "Start" }, { s: 250, name: "Split 1" }, { s: 500, name: "Split 2" }, { s: 750, name: "Split 3" }, { s: 1000, name: "Finish" }],
    startPose: { x: 0, y: 0, z: 0, yaw: 0 },
    sample(s, out = {}) { out.s = s; out.x = 0; out.y = 0; out.z = -s; out.tx = 0; out.tz = -1; out.nx = 1; out.nz = 0; out.width = 8; return out; },
    boundaryAt(s, out = {}) { out.left = 10; out.right = 10; return out; },
  };
}
function mk(difficulty = "pro", par = null) {
  const stage = mockStage();
  const state = { x: 0, y: 0, z: 0, yaw: 0, s: 0, lat: 0, speed: 0, onRoad: true, airborne: false, flipped: false, throttle: 0, damage: { total: 0 } };
  const vehicle = { state, reset(pose, speed) { state.x = pose.x; state.z = pose.z; state.yaw = pose.yaw; state.s = -pose.z; state.speed = speed; state.flipped = false; } };
  return { run: createRun({ stage, vehicle, difficulty, par }), state };
}
const step = (run, state, seconds, dt = 0.1) => { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) run.update(dt, state); };
const go = (run, state) => { run.start(); step(run, state, 3.05, 0.05); assert.equal(run.status, "running"); };

test("pins: the constants themselves (a change must be deliberate)", () => {
  assert.deepEqual({ ...RULES, respawnPenalty: { ...RULES.respawnPenalty } }, {
    countdownSeconds: 3, falseStartSpeed: 1.2, falseStartMove: 1.0, falseStartPenalty: 5, stuckSpeed: 0.9, stuckSeconds: 6, stuckGrace: 4,
    flippedSeconds: 0.4, respawnCooldown: 4, noProgressMetres: 40, noProgressSeconds: 25, timeCapFactor: 3, timeCapExtra: 480,
    wrongWayDot: -0.25, wrongWaySeconds: 1.2, offRoadSeconds: 0.6, corridorFraction: 0.82, dnfDamage: 1,
    respawnPenalty: { rookie: 8, pro: 10, expert: 15 },
  });
});

test("countdown lasts 3 s", () => {
  const { run, state } = mk();
  run.start();
  step(run, state, 2.9, 0.05); assert.equal(run.status, "countdown");
  step(run, state, 0.3, 0.05); assert.equal(run.status, "running");
});

test("false start: speed 1.0 is fine, 1.5 costs 5 s; moving 0.8 m is fine, 1.3 m costs 5 s", () => {
  let { run, state } = mk(); run.start(); state.speed = 1.0; step(run, state, 1); assert.equal(run.penaltyTotal, 0);
  state.speed = 1.5; step(run, state, 0.2); assert.equal(run.penaltyTotal, 5);
  ({ run, state } = mk()); run.start(); state.z = -0.8; step(run, state, 0.5); assert.equal(run.penaltyTotal, 0);
  state.z = -1.3; step(run, state, 0.2); assert.equal(run.penaltyTotal, 5);
});

test("stuck: 5.9 s stationary is no penalty, 6.1 s is a 10 s penalty (pro), 8 for rookie, 15 for expert", () => {
  for (const [d, pen] of [["pro", 10], ["rookie", 8], ["expert", 15]]) {
    const { run, state } = mk(d); go(run, state);
    state.s = 100; state.speed = 12; step(run, state, 5); // armed (past the 4 s grace) and moving
    assert.equal(run.respawns, 0);
    state.speed = 0;
    step(run, state, 5.9); assert.equal(run.respawns, 0, d + " 5.9 s");
    assert.equal(run.penaltyTotal, 0);
    step(run, state, 0.2); assert.equal(run.respawns, 1, d + " 6.1 s");
    assert.equal(run.penaltyTotal, pen);
    assert.equal(run.penalties.at(-1).kind, "stuck");
  }
});

test("stuck: detection arms after 4 s of run time (9.9 s from the start no, 10.3 s yes)", () => {
  const { run, state } = mk(); go(run, state);
  state.s = 100; state.speed = 0;
  step(run, state, 9.8); assert.equal(run.respawns, 0);
  step(run, state, 0.5); assert.equal(run.respawns, 1);
});

test("stuck speed: 0.8 m/s counts as stuck, 1.0 m/s does not", () => {
  let { run, state } = mk(); go(run, state); state.s = 100; state.speed = 1.0;
  step(run, state, 20); assert.equal(run.respawns, 0);
  ({ run, state } = mk()); go(run, state); state.s = 100; state.speed = 0.8;
  step(run, state, 11); assert.equal(run.respawns, 1);
});

test("flipped: 0.3 s no respawn, 0.6 s respawn", () => {
  let { run, state } = mk(); go(run, state); state.s = 40; state.speed = 8; state.flipped = true;
  step(run, state, 0.3); assert.equal(run.respawns, 0);
  ({ run, state } = mk()); go(run, state); state.s = 40; state.speed = 8; state.flipped = true;
  step(run, state, 0.6); assert.equal(run.respawns, 1);
});

test("respawn cooldown: no second respawn at 3.5 s, one by 4.5 s", () => {
  const { run, state } = mk(); go(run, state); state.s = 40; state.speed = 8; state.flipped = true;
  step(run, state, 0.6); assert.equal(run.respawns, 1);
  state.flipped = true; state.speed = 8; state.s = 40;
  step(run, state, 3.5); assert.equal(run.respawns, 1);
  state.flipped = true; step(run, state, 1.0); assert.equal(run.respawns, 2);
});

test("no progress: throttle on but 25 m in 25 s respawns; 2 m/s (40+ m per 25 s) never does", () => {
  let { run, state } = mk(); go(run, state); state.throttle = 1; state.speed = 5;
  for (let i = 0; i < 240; i++) { state.s += 0.1; run.update(0.1, state); } // 24 s, 24 m
  assert.equal(run.respawns, 0);
  for (let i = 0; i < 30; i++) { state.s += 0.1; run.update(0.1, state); }
  assert.equal(run.respawns, 1);
  assert.equal(run.penalties.at(-1).kind, "no_progress");
  ({ run, state } = mk()); go(run, state); state.throttle = 1; state.speed = 5;
  for (let i = 0; i < 700; i++) { state.s += 0.2; run.update(0.1, state); } // 70 s at 2 m/s
  assert.equal(run.respawns, 0);
});

test("time cap: par 100 s is cut at 300 s; par 1000 s is cut at par + 480 s", () => {
  let { run, state } = mk("pro", 100); go(run, state); state.s = 100; state.speed = 12;
  for (let i = 0; i < 299; i++) { state.speed = 12; run.update(1, state); }
  assert.equal(run.status, "running");
  for (let i = 0; i < 2; i++) run.update(1, state);
  assert.equal(run.status, "dnf"); assert.equal(run.dnfReason, "timeout");
  ({ run, state } = mk("pro", 1000)); go(run, state); state.s = 100; state.speed = 12;
  for (let i = 0; i < 1479; i++) { state.speed = 12; run.update(1, state); }
  assert.equal(run.status, "running");
  for (let i = 0; i < 2; i++) run.update(1, state);
  assert.equal(run.status, "dnf");
});

test("wrong way: heading cos -0.1 is fine, -0.5 is wrong; 2.0 m/s is fine, 3.0 is wrong; needs 1.2 s", () => {
  const mkWrong = (yaw, speed) => { const r = mk(); go(r.run, r.state); r.state.s = 100; r.state.yaw = yaw; r.state.speed = speed; return r; };
  let r = mkWrong(Math.acos(-0.1), 15); step(r.run, r.state, 3); assert.equal(r.run.warnings.wrongWay, false);
  r = mkWrong(Math.acos(-0.5), 15); step(r.run, r.state, 1.0); assert.equal(r.run.warnings.wrongWay, false, "1.0 s");
  step(r.run, r.state, 0.4); assert.equal(r.run.warnings.wrongWay, true, "1.4 s");
  r = mkWrong(Math.PI, 2.0); step(r.run, r.state, 3); assert.equal(r.run.warnings.wrongWay, false);
  r = mkWrong(Math.PI, 3.0); step(r.run, r.state, 1.5); assert.equal(r.run.warnings.wrongWay, true);
  r = mkWrong(0, -4); step(r.run, r.state, 1.5); assert.equal(r.run.warnings.wrongWay, true, "reversing fast");
});

test("off road: 0.5 s off the road is no warning, 0.8 s is; lateral 4.7 m is on the road, 4.9 m is off (8 m wide)", () => {
  let { run, state } = mk(); go(run, state); state.s = 100; state.speed = 20; state.onRoad = false;
  step(run, state, 0.5); assert.equal(run.warnings.offRoad, false);
  step(run, state, 0.3); assert.equal(run.warnings.offRoad, true);
  ({ run, state } = mk()); go(run, state); state.s = 100; state.speed = 20; state.lat = 4.7;
  step(run, state, 1.5); assert.equal(run.warnings.offRoad, false);
  state.lat = 4.9; step(run, state, 1.5); assert.equal(run.warnings.offRoad, true);
});

test("corridor warning at 82 % of the boundary (10 m): 8.1 m no, 8.3 m yes", () => {
  const { run, state } = mk(); go(run, state); state.s = 100; state.speed = 20; state.lat = 8.1;
  step(run, state, 0.2); assert.equal(run.warnings.corridor, false);
  state.lat = 8.3; step(run, state, 0.2); assert.equal(run.warnings.corridor, true);
});

test("damage 0.99 keeps running, 1.0 is a DNF", () => {
  const { run, state } = mk(); go(run, state); state.s = 100; state.speed = 20;
  state.damage = { total: 0.99 }; step(run, state, 0.2); assert.equal(run.status, "running");
  state.damage = { total: 1 }; step(run, state, 0.2); assert.equal(run.status, "dnf");
});

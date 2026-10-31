import test from "node:test";
import assert from "node:assert/strict";
import { createRun, RULES } from "../core/rules.mjs";

// A dead-straight 1 km stage running toward -Z, checkpoints every 250 m.
function mockStage() {
  return {
    id: "mock",
    lengthM: 1000,
    checkpoints: [{ s: 0, name: "Start" }, { s: 250, name: "Split 1" }, { s: 500, name: "Split 2" }, { s: 750, name: "Split 3" }, { s: 1000, name: "Finish" }],
    startPose: { x: 0, y: 0, z: 0, yaw: 0 },
    sample(s, out = {}) {
      out.s = s; out.x = 0; out.y = 0; out.z = -s; out.tx = 0; out.tz = -1; out.nx = 1; out.nz = 0; out.width = 8;
      return out;
    },
    boundaryAt(s, out = {}) { out.left = 10; out.right = 10; return out; },
  };
}
function mockVehicle() {
  const state = { x: 0, y: 0, z: 0, yaw: 0, s: 0, lat: 0, speed: 0, onRoad: true, airborne: false, flipped: false, damage: { total: 0 } };
  const resets = [];
  return { state, resets, reset(pose, speed, stage) { resets.push({ pose: { ...pose }, speed, stage }); state.x = pose.x; state.z = pose.z; state.yaw = pose.yaw; state.s = -pose.z; state.speed = speed; } };
}
const mk = (difficulty = "pro") => {
  const stage = mockStage(), vehicle = mockVehicle();
  return { stage, vehicle, run: createRun({ stage, vehicle, difficulty }) };
};
const advance = (run, vehicle, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) run.update(dt, vehicle.state); };
const goRunning = (run, vehicle) => { run.start(); advance(run, vehicle, RULES.countdownSeconds + 0.1); assert.equal(run.status, "running"); };

test("countdown runs 3-2-1-GO then starts the clock at zero", () => {
  const { run, vehicle } = mk();
  assert.equal(run.status, "ready");
  run.start();
  assert.equal(run.status, "countdown");
  advance(run, vehicle, 2.5);
  assert.equal(run.status, "countdown");
  assert.equal(run.time, 0);
  advance(run, vehicle, 0.7);
  assert.equal(run.status, "running");
  const ev = run.drainEvents().map((e) => (e.t === "countdown" ? "c" + e.n : e.t));
  assert.deepEqual(ev.filter((x) => x !== "falseStart"), ["c3", "c2", "c1", "go"]);
  assert.ok(run.time < 0.25, "clock only counts time after GO, was " + run.time);
  advance(run, vehicle, 1);
  assert.ok(Math.abs(run.time - 1.2) < 0.05, "clock runs after GO, was " + run.time);
});

test("false start adds a 5 s penalty exactly once", () => {
  const { run, vehicle } = mk();
  run.start();
  advance(run, vehicle, 1);
  vehicle.state.speed = 6; vehicle.state.z = -4; vehicle.state.s = 4;
  advance(run, vehicle, 0.5);
  advance(run, vehicle, 0.5);
  assert.equal(run.falseStart, true);
  assert.equal(run.penalties.filter((p) => p.kind === "false_start").length, 1);
  assert.equal(run.penaltyTotal, RULES.falseStartPenalty);
  advance(run, vehicle, 2);
  assert.equal(run.penaltyTotal, RULES.falseStartPenalty);
  assert.ok(run.total >= run.time + 5);
});

test("a clean start has no penalty", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  assert.equal(run.penaltyTotal, 0);
  assert.equal(run.falseStart, false);
});

test("checkpoints record splits in order and the finish ends the run", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  for (const s of [260, 510, 760]) { vehicle.state.s = s; vehicle.state.z = -s; run.update(0.5, vehicle.state); }
  assert.deepEqual(run.splits.map((x) => x.index), [1, 2, 3]);
  assert.ok(run.splits[0].time < run.splits[1].time && run.splits[1].time < run.splits[2].time);
  assert.equal(run.status, "running");
  vehicle.state.s = 1001; run.update(0.5, vehicle.state);
  assert.equal(run.status, "finished");
  assert.equal(run.splits.length, 4);
  assert.ok(Math.abs(run.finishTime - run.splits[3].time) < 1e-9);
  const t = run.time;
  run.update(1, vehicle.state);
  assert.equal(run.time, t, "clock stops at the finish");
});

test("skipping a checkpoint still records all passed splits when s jumps", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  vehicle.state.s = 600; run.update(0.1, vehicle.state);
  assert.deepEqual(run.splits.map((x) => x.index), [1, 2]);
});

test("driving backwards at a bad heading raises wrong-way", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  vehicle.state.s = 100; vehicle.state.yaw = Math.PI; vehicle.state.speed = 15; // facing +Z, stage goes -Z
  advance(run, vehicle, RULES.wrongWaySeconds + 0.5);
  assert.equal(run.warnings.wrongWay, true);
  vehicle.state.yaw = 0;
  advance(run, vehicle, 3);
  assert.equal(run.warnings.wrongWay, false);
});

test("off-road and corridor warnings follow lateral offset", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  vehicle.state.s = 100; vehicle.state.speed = 20; vehicle.state.lat = 6; vehicle.state.onRoad = false;
  advance(run, vehicle, 1);
  assert.equal(run.warnings.offRoad, true);
  assert.equal(run.warnings.corridor, false);
  vehicle.state.lat = 9;
  advance(run, vehicle, 0.2);
  assert.equal(run.warnings.corridor, true);
  vehicle.state.lat = 0; vehicle.state.onRoad = true;
  advance(run, vehicle, 1);
  assert.equal(run.warnings.offRoad, false);
});

test("stuck car respawns near where it stopped (15 m back, never behind the checkpoint) with a penalty", () => {
  const { run, vehicle, stage } = mk("pro");
  goRunning(run, vehicle);
  vehicle.state.s = 600; vehicle.state.z = -600; vehicle.state.speed = 12;
  run.update(0.1, vehicle.state); // passes splits 1 and 2 (last at 500)
  assert.equal(run.lastCheckpointS, 500);
  vehicle.state.speed = 0;
  advance(run, vehicle, RULES.stuckGrace + RULES.stuckSeconds + 1);
  assert.equal(run.respawns, 1);
  assert.equal(vehicle.resets.length, 1);
  const rs = -vehicle.resets[0].pose.z;
  assert.ok(rs >= 600 - 25 && rs <= 600 && rs >= run.lastCheckpointS, "respawn s " + rs + " is within 25 m of where it stopped, not behind the split");
  assert.ok(Math.abs(rs - 585) < 0.001);
  assert.equal(vehicle.resets[0].stage, stage);
  assert.equal(run.penalties.at(-1).kind, "stuck");
  assert.equal(run.penaltyTotal, RULES.respawnPenalty.pro);
});

test("flipped car respawns, and cooldown stops respawn loops", () => {
  const { run, vehicle } = mk("expert");
  goRunning(run, vehicle);
  vehicle.state.s = 40; vehicle.state.speed = 8; vehicle.state.flipped = true;
  advance(run, vehicle, RULES.flippedSeconds + 0.3);
  assert.equal(run.respawns, 1);
  assert.equal(run.penaltyTotal, RULES.respawnPenalty.expert);
  vehicle.state.flipped = true;
  advance(run, vehicle, 1);
  assert.equal(run.respawns, 1, "cooldown holds");
  advance(run, vehicle, RULES.respawnCooldown + 1);
  assert.equal(run.respawns, 2);
});

test("manual recover adds a penalty and puts the car 15 m back on the road (the start pose near the start)", () => {
  const { run, vehicle } = mk("rookie");
  goRunning(run, vehicle);
  vehicle.state.s = 80; run.update(0.1, vehicle.state);
  run.respawn("reset");
  assert.equal(vehicle.resets[0].pose.z, -65);
  assert.equal(vehicle.resets[0].speed, 0);
  assert.equal(run.penaltyTotal, RULES.respawnPenalty.rookie);
  const b = mk("rookie");
  goRunning(b.run, b.vehicle);
  b.vehicle.state.s = 10; b.run.update(0.1, b.vehicle.state);
  b.run.respawn("reset");
  assert.equal(b.vehicle.resets[0].pose.z, 0, "clamped to the start");
});

test("respawn loop guard: a second respawn within 20 s and 40 m steps back a further 30 m, never behind the split", () => {
  const { run, vehicle } = mk("pro");
  goRunning(run, vehicle);
  vehicle.state.s = 400; vehicle.state.z = -400; run.update(0.1, vehicle.state); // split 1 at 250
  run.respawn("manual");
  assert.equal(-vehicle.resets[0].pose.z, 385);
  vehicle.state.s = 390; run.update(0.1, vehicle.state);
  run.respawn("manual");
  assert.equal(-vehicle.resets[1].pose.z, 355, "385 - 30");
  vehicle.state.s = 360; run.update(0.1, vehicle.state);
  run.respawn("manual");
  assert.equal(-vehicle.resets[2].pose.z, 325);
  for (let i = 0; i < 6; i++) { vehicle.state.s = -vehicle.resets.at(-1).pose.z + 5; run.update(0.1, vehicle.state); run.respawn("manual"); }
  assert.ok(vehicle.resets.every((r) => -r.pose.z >= 253), "never behind the last checkpoint");
  // outside the window: a later respawn is a plain 15 m back
  advance(run, vehicle, 25);
  vehicle.state.s = 700; vehicle.state.z = -700; vehicle.state.speed = 12; run.update(0.1, vehicle.state);
  run.respawn("manual");
  assert.equal(-vehicle.resets.at(-1).pose.z, 685);
  assert.equal(run.penaltyTotal, RULES.respawnPenalty.pro * run.respawns, "penalty unchanged per respawn");
});

test("total damage of 1 is a DNF and has an infinite result time", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  vehicle.state.damage.total = 0.99; run.update(0.1, vehicle.state);
  assert.equal(run.status, "running");
  vehicle.state.damage.total = 1; run.update(0.1, vehicle.state);
  assert.equal(run.status, "dnf");
  assert.equal(run.result().total, Infinity);
  assert.equal(run.dnfReason, "damage");
});

test("skipCountdown starts straight away without a false-start penalty", () => {
  const { run, vehicle } = mk();
  run.skipCountdown(vehicle.state);
  assert.equal(run.status, "running");
  vehicle.state.speed = 30;
  advance(run, vehicle, 1);
  assert.equal(run.penaltyTotal, 0);
});

test("no progress: throttle applied but under 40 m in 25 s respawns with a penalty", () => {
  const { run, vehicle } = mk("pro");
  goRunning(run, vehicle);
  vehicle.state.s = 300; vehicle.state.z = -300; run.update(0.1, vehicle.state);
  vehicle.state.throttle = 1; vehicle.state.speed = 6;
  advance(run, vehicle, 23);
  assert.equal(run.respawns, 0);
  advance(run, vehicle, 3);
  assert.equal(run.respawns, 1);
  assert.equal(run.penalties.at(-1).kind, "no_progress");
});

test("steady progress never trips no-progress, and coasting without throttle does not either", () => {
  const a = mk("pro");
  goRunning(a.run, a.vehicle);
  a.vehicle.state.throttle = 1; a.vehicle.state.speed = 20;
  for (let i = 0; i < 3600; i++) { a.vehicle.state.s += 20 / 60; a.vehicle.state.z = -a.vehicle.state.s % 900; a.run.update(1 / 60, a.vehicle.state); if (a.vehicle.state.s > 900) break; }
  assert.equal(a.run.respawns, 0);
  const b = mk("pro");
  goRunning(b.run, b.vehicle);
  b.vehicle.state.throttle = 0; b.vehicle.state.speed = 5;
  advance(b.run, b.vehicle, 40);
  assert.ok(!b.run.penalties.some((p) => p.kind === "no_progress"));
});

test("time cap: min(3 x par, par + 8 min) is a DNF with reason timeout", () => {
  const { stage, vehicle } = mk();
  assert.equal(createRun({ stage, vehicle, par: 100 }).timeCap, 300);
  assert.equal(createRun({ stage, vehicle, par: 600 }).timeCap, 1080);
  assert.equal(createRun({ stage, vehicle }).timeCap, Infinity);
  const run = createRun({ stage, vehicle, par: 100 });
  goRunning(run, vehicle);
  vehicle.state.speed = 30;
  for (let t = 0; t < 290; t++) { vehicle.state.s = Math.min(900, vehicle.state.s + 1); run.update(1, vehicle.state); }
  assert.equal(run.status, "running");
  for (let t = 0; t < 20; t++) run.update(1, vehicle.state);
  assert.equal(run.status, "dnf");
  assert.equal(run.dnfReason, "timeout");
  assert.equal(run.result().total, Infinity);
});

test("countdown length is configurable (time trial uses a short one)", () => {
  const { stage, vehicle } = mk();
  const run = createRun({ stage, vehicle, countdown: 1 });
  run.start();
  advance(run, vehicle, 1.2);
  assert.equal(run.status, "running");
});

test("retire is a DNF with reason retired, and cannot undo a finish", () => {
  const { run, vehicle } = mk();
  goRunning(run, vehicle);
  run.retire();
  assert.equal(run.status, "dnf");
  assert.equal(run.result().dnfReason, "retired");
  assert.equal(run.result().total, Infinity);
  const f = mk();
  goRunning(f.run, f.vehicle);
  f.vehicle.state.s = 1000; f.run.update(0.1, f.vehicle.state);
  assert.equal(f.run.status, "finished");
  f.run.retire();
  assert.equal(f.run.status, "finished");
});

// DYNAMICS round 4 (Y3): jump landings. A clean wheels-down landing costs little, a bad one still hurts.
// Run: node --test tests/dynamics-landing.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { buildStage } from "../core/stage.mjs";
import { yawOfDir } from "../core/mathx.mjs";

const DT = 1 / 120;

/** Drive at a jump from 110 m out and return the damage taken by 45 m past it. mode "keys": steering is bang-bang to the
 *  centreline at a held speed (a keyboard player); "bot": the skill-1 bot; yawOff turns the car away from the road first. */
function jumpRun(st, carId, jump, mode, kmh, yawOff = 0) {
  const v = createVehicle(CARS[carId], { tyre: bestTyreFor(st) });
  const sm = st.sample(jump.s - 110, {});
  v.reset({ x: sm.x, y: st.heightAt(sm.x, sm.z) + 0.4, z: sm.z, yaw: yawOfDir(sm.tx, sm.tz) + yawOff }, mode === "bot" ? 20 : kmh / 3.6, st);
  const bot = mode === "bot" ? createBot(st, v, { skill: 1 }) : null;
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  let air = 0, run = 0, flipped = false, hitSomething = false;
  for (let i = 0; i < 120 * 14 && v.state.s <= jump.s + 45; i++) {
    if (bot) Object.assign(inp, bot.control(DT));
    else if (!yawOff) {
      const q = v.state, sp = Math.max(0, q.speed), t = st.sample(Math.min(st.lengthM - 1, q.s + Math.max(8, sp * 0.6)), {});
      const dx = t.x - q.x, dz = t.z - q.z, fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw), rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);
      const al = Math.atan2(dx * rx + dz * rz, Math.max(0.1, dx * fx + dz * fz));
      inp.steer = al > 0.03 ? 1 : al < -0.03 ? -1 : 0;
      inp.throttle = sp < kmh / 3.6 ? 1 : 0.35;
    } else { inp.steer = 0; inp.throttle = 1; }
    v.step(DT, inp, st);
    if (v.state.airborne) { run++; air = Math.max(air, run); } else run = 0;
    if (v.state.flipped) flipped = true;
    for (const e of v.state.events) if (e.t === "impact" && e.kind !== "terrain") hitSomething = true; // a sign or a tree is not a landing
    v.state.events.length = 0;
  }
  return { dmg: v.state.damage.total, air: air * DT, flipped, hitSomething };
}

const STAGES = ["waitomo", "otago", "remarkables"];
test("a clean landing at 100-140 km/h costs <= 10% for a keyboard run and <= 4% for the bot", { timeout: 600000 }, () => {
  const bad = [];
  let jumps = 0;
  for (const sid of STAGES) {
    const st = buildStage(sid);
    for (const j of st.hazards.filter((h) => h.kind === "jump")) for (const id of CAR_IDS) {
      for (const kmh of [100, 140]) {
        const r = jumpRun(st, id, j, "keys", kmh);
        if (r.hitSomething) continue;
        jumps++;
        if (r.dmg > 0.1) bad.push(`${sid} s=${Math.round(j.s)} ${id} ${kmh} km/h keys: ${(r.dmg * 100).toFixed(0)}%`);
      }
      const b = jumpRun(st, id, j, "bot", 0);
      if (!b.hitSomething && b.dmg > 0.04) bad.push(`${sid} s=${Math.round(j.s)} ${id} bot: ${(b.dmg * 100).toFixed(1)}%`);
    }
  }
  assert.ok(jumps >= 30, "jump coverage: " + jumps);
  assert.deepEqual(bad, []);
});

test("a bad landing still hurts: arriving sideways at 100 km/h costs a lot more than a clean one", { timeout: 600000 }, () => {
  const st = buildStage("waitomo");
  const j = st.hazards.filter((h) => h.kind === "jump").find((h) => Math.round(h.s) === 2609) || st.hazards.find((h) => h.kind === "jump");
  const bad = [];
  for (const id of CAR_IDS) {
    const clean = jumpRun(st, id, j, "keys", 100);
    const side = jumpRun(st, id, j, "keys", 100, 1.2);
    if (process.env.DYN_PRINT) console.log(id, "clean", clean.dmg.toFixed(3), "sideways", side.dmg.toFixed(3), side.flipped);
    if (!(side.dmg >= 0.15 && side.dmg >= clean.dmg * 3)) bad.push(`${id}: sideways ${side.dmg.toFixed(3)} vs clean ${clean.dmg.toFixed(3)}`);
  }
  assert.deepEqual(bad, []);
});

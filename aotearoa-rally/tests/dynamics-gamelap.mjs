// DYNAMICS round 3: the bot lap exactly as the game runs it (createRun rules, career vehicle options, recommended tyre),
// compared with the calibrated PAR_TIMES. Node-only: no browser needed.
//   node tests/dynamics-gamelap.mjs [stage,stage,...] [car]      prints game lap vs PAR_TIMES and the % difference
// The in-browser equivalent is `__AR__.finishRun()` after `__AR__.startStage({stageId, carId, bot:true})`; compare its time to this.
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot } from "../core/bot.mjs";
import { buildStage } from "../core/stage.mjs";
import { createRun } from "../core/rules.mjs";
import { DEFAULT_SETUP, recommendedTyre, vehicleOptionsFor, createCareer } from "../core/career.mjs";
import { getStageDef } from "../core/stagedefs.mjs";
import { PAR_TIMES } from "../core/partimes.mjs";
import { fileURLToPath } from "node:url";

const DT = 1 / 120;

/** Returns { time, status, penalties } for one bot lap run the way game.mjs runs it. */
export function gameLap(stageId, carId, { skill = 1 } = {}) {
  const def = getStageDef(stageId);
  const stage = buildStage(stageId);
  const options = createCareer().options; // the player's default option set (gearbox auto, steer assist 0.5, ...)
  const vopts = vehicleOptionsFor(CARS[carId], { ...DEFAULT_SETUP, tyre: recommendedTyre(def) }, { ...options, difficulty: "pro" });
  const v = createVehicle(CARS[carId], vopts);
  v.reset(stage.startPose, 0, stage);
  const run = createRun({ stage, vehicle: v, difficulty: "pro", par: stage.parTime, countdown: 3 });
  const bot = createBot(stage, v, { skill });
  bot.reset();
  run.skipCountdown(v.state);
  const hold = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  let n = 0;
  while (run.status === "running" && n < 120 * 900) {
    const inp = bot.control(DT);
    v.step(DT, run.status === "countdown" ? hold : inp, stage);
    run.update(DT, v.state);
    v.state.events.length = 0;
    run.events.length = 0;
    n++;
  }
  return { time: run.time, status: run.status, penalties: run.penalties.length, steps: n };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, "/").replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ":") || process.argv[1] && process.argv[1].endsWith("dynamics-gamelap.mjs")) {
  const stages = (process.argv[2] || "waitomo,whakarewarewa,fiordland").split(",");
  const car = process.argv[3] || "huia";
  for (const sid of stages) {
    const r = gameLap(sid, car);
    const par = PAR_TIMES[sid][car];
    console.log(`${sid.padEnd(14)} ${car}: game lap ${Number(r.time).toFixed(1)} s (${r.status}, ${r.penalties} penalties) vs PAR_TIMES ${par.toFixed(1)} s  ${(((r.time / par) - 1) * 100).toFixed(2)}%`);
  }
}

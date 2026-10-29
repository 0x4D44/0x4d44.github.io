// Shared bot-lap runner for the DYNAMICS tests and tests/calibrate-par.mjs.
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { buildStage } from "../core/stage.mjs";

const DT = 1 / 120;

/** Drive one stage with the bot. Returns { finished, time, offRoad, maxLat, damage, flips, impacts }. */
export function botLap(stageId, carId, skill = 1, stage = null) {
  const st = stage || buildStage(stageId);
  const v = createVehicle(CARS[carId], { tyre: bestTyreFor(st) });
  v.reset(st.startPose, 0, st);
  const bot = createBot(st, v, { skill });
  const limit = Math.max(st.parTime || 200, 120) * 3 + 120;
  let t = 0, off = 0, maxLat = 0, flips = 0, impacts = 0;
  const end = st.lengthM - 3;
  while (v.state.s < end && t < limit) {
    const inp = bot.control(DT);
    v.step(DT, inp, st);
    t += DT;
    const s = v.state;
    if (!s.onRoad) off += DT;
    if (Math.abs(s.lat) > maxLat) maxLat = Math.abs(s.lat);
    if (s.flipped) flips++;
    for (const e of s.events) if (e.t === "impact") impacts++;
    s.events.length = 0;
  }
  return { finished: v.state.s >= end, time: t, offRoad: off, maxLat, damage: v.state.damage.total, flips, impacts, length: st.lengthM };
}

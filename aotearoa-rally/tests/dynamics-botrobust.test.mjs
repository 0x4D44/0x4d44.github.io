// DYNAMICS round 2: bot recovery from arbitrary starts, and monotonic skill. Parametric on the stage list.
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { STAGE_IDS, buildStage } from "../core/stage.mjs";
import { botLap } from "./dynamics-botrun.mjs";

const DT = 1 / 120;
let seed = 20261029;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function runFrom(st, carId, s0, kmh) {
  const v = createVehicle(CARS[carId], { tyre: bestTyreFor(st) });
  const sm = st.sample(s0, {});
  v.reset({ x: sm.x, y: sm.y + 0.2, z: sm.z, yaw: Math.atan2(-sm.tx, -sm.tz) }, kmh / 3.6, st);
  const bot = createBot(st, v, { skill: 1 });
  // a car teleported at 90 km/h into a 25 km/h hairpin cannot stop in physics: cap the start at what the
  // speed profile (plus a braking allowance) makes survivable; everything below that must be recovered.
  const ip = Math.min(st.N - 1, Math.round(s0 / st.ds));
  let reach = 1e9;
  for (let k = 0; k < 40 && ip + k < st.N; k++) reach = Math.min(reach, Math.sqrt(bot.speedProfile[ip + k] ** 2 + 2 * 5 * k * st.ds));
  if (v.state.speed > reach * 1.05) v.reset({ x: sm.x, y: sm.y + 0.2, z: sm.z, yaw: Math.atan2(-sm.tx, -sm.tz) }, reach, st);
  const remain = st.lengthM - 3 - v.state.s;
  const par = (st.parTime || 200) * (remain / st.lengthM);
  const limit = Math.max(40, 1.6 * par * 1.4) + 20;
  let t = 0, offRun = 0, worstOff = 0;
  while (v.state.s < st.lengthM - 3 && t < limit) {
    v.step(DT, bot.control(DT), st);
    v.state.events.length = 0;
    t += DT;
    if (!v.state.onRoad) { offRun += DT; worstOff = Math.max(worstOff, offRun); } else offRun = 0;
  }
  return { done: v.state.s >= st.lengthM - 3, t, worstOff, limit, s: v.state.s };
}

for (const sid of STAGE_IDS) {
  test(`bot finishes ${sid} from 3 seeded mid-stage starts with random speed 0-110 km/h`, { timeout: 600000 }, () => {
    const st = buildStage(sid);
    for (let k = 0; k < 3; k++) {
      const car = CAR_IDS[Math.floor(rnd() * 4)];
      const s0 = 100 + rnd() * (st.lengthM - 400);
      const kmh = rnd() * 110;
      const r = runFrom(st, car, s0, kmh);
      assert.ok(r.done, `${sid}/${car} from s=${s0.toFixed(0)} at ${kmh.toFixed(0)} km/h stuck at s=${r.s.toFixed(0)}`);
      assert.ok(r.worstOff <= 3, `${sid}/${car} off-road run ${r.worstOff.toFixed(1)} s`);
    }
  });
}

test("bot skill is monotonic: lower skill is slower, all skills finish clean", { timeout: 600000 }, () => {
  const sid = STAGE_IDS[0];
  const st = buildStage(sid);
  const times = [1, 0.9, 0.75, 0.6].map((sk) => {
    const r = botLap(sid, "huia", sk, st);
    assert.ok(r.finished, `skill ${sk} did not finish`);
    assert.ok(r.offRoad <= 3, `skill ${sk} off-road ${r.offRoad.toFixed(1)}`);
    return r.time;
  });
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], "not monotonic: " + times.map((x) => x.toFixed(1)).join(" "));
  assert.ok(times[2] / times[0] > 1.04 && times[2] / times[0] < 1.2, "skill 0.75 ratio " + (times[2] / times[0]).toFixed(3));
});

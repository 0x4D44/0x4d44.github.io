// DYNAMICS round 3: a keyboard-only driver (bang-bang steering, throttle on/off) must stay on the road with every car.
// Run: node --test tests/dynamics-keyboard.test.mjs   (KB_STAGES=waitomo,... KB_SECONDS=40 to narrow)
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { buildStage } from "../core/stage.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const STAGES = (process.env.KB_STAGES || "waitomo,coromandel,fiordland").split(",");
const SECONDS = +(process.env.KB_SECONDS || 40);

/** Digital driver: steering is +-1 or 0 (small dead band), target = centreline point 0.6 s ahead,
 *  throttle on unless speed > 0.9 x the stage's safe speed (the skill-1 bot's speed profile). */
export function keyboardRun(st, carId, seconds, opts = {}) {
  const v = createVehicle(CARS[carId], { tyre: bestTyreFor(st) });
  v.reset(st.startPose, 0, st);
  const bot = createBot(st, v, { skill: 1 });
  const safe = bot.speedProfile;
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  let off = 0, offMax = 0, offRun = 0, flips = 0, impacts = 0, steerPrev = 0;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const s = v.state;
    const sp = Math.max(0, s.speed);
    const look = Math.max(8, sp * (opts.lookT || 0.6));
    const sm = st.sample(Math.min(st.lengthM - 1, s.s + look), {});
    const dx = sm.x - s.x, dz = sm.z - s.z;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const alpha = Math.atan2(dx * rx + dz * rz, Math.max(0.1, dx * fx + dz * fz));
    const band = opts.band === undefined ? 0.03 : opts.band;
    inp.steer = alpha > band ? 1 : alpha < -band ? -1 : 0;
    const vs = safe[Math.min(st.N - 1, Math.max(0, Math.round(s.s / st.ds)))];
    inp.throttle = sp > 0.9 * vs ? 0 : 1;
    v.step(DT, inp, st);
    if (!v.state.onRoad) { off += DT; offRun += DT; if (offRun > offMax) offMax = offRun; } else offRun = 0;
    if (v.state.flipped) flips++;
    for (const e of v.state.events) if (e.t === "impact") impacts++;
    v.state.events.length = 0;
    if (v.state.s >= st.lengthM - 3) break;
  }
  return { off, offMax, flips, impacts, s: v.state.s };
}

for (const sid of STAGES) {
  test(`keyboard proxy on ${sid}: no car is off the road for > 1.5 s or flips in ${SECONDS} s`, { timeout: 600000 }, () => {
    const st = buildStage(sid);
    const bad = [];
    for (const id of CAR_IDS) {
      const r = keyboardRun(st, id, SECONDS);
      if (r.offMax > 1.5 || r.flips > 0) bad.push(`${id}: off-road run ${r.offMax.toFixed(1)} s, flips ${r.flips}, impacts ${r.impacts}, reached s=${r.s.toFixed(0)}`);
    }
    assert.deepEqual(bad, []);
  });
}

test("braking while turning in rotates the car: same corner, same entry speed, braking gives a tighter line", () => {
  // 100 m straight then a constant R=60 m right-hander on gravel; entry 22 m/s; steer 0.5 from the turn-in point
  const curv = (s) => (s > 100 ? -1 / 60 : 0);
  const st = makeTestStage({ length: 400, width: 14, boundary: 400, surf: SURFACE.GRAVEL, curv });
  for (const id of CAR_IDS) {
    const lines = [];
    for (const brake of (process.env.KB_BR ? process.env.KB_BR.split(",").map(Number) : [0, 0.3, 1])) {
      const v = createVehicle(CARS[id], { tyre: "gravel" });
      v.reset(st.startPose, 22, st);
      const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
      let yawAt = 0, tIn = -1, d0 = 0;
      const y0 = (() => { let y = 0; return y; })();
      for (let i = 0; i < 120 * 8; i++) {
        const s = v.state;
        if (s.s > 100) { inp.steer = -0.5; inp.brake = brake; inp.throttle = brake ? 0 : 0.25; }
        else { inp.throttle = 0.25; inp.brake = 0; inp.steer = 0; }
        v.step(DT, inp, st);
        v.state.events.length = 0;
        if (s.s > 100 && yawAt === 0) { yawAt = s.yaw; tIn = i; d0 = s.distance; }
        if (tIn >= 0 && i - tIn >= 120 * 1.2) break;
      }
      // heading change since turn-in, 35 m into the corner (bigger = rotated more = tighter line)
      lines.push(Math.abs(v.state.yaw - yawAt) / (v.state.distance - d0)); // path curvature (rad per metre): bigger = tighter line
      void y0;
    }
    if (process.env.KB_DEBUG) console.log(id, lines.map((x) => x.toFixed(4)).join(" "));
    assert.ok(lines[1] > lines[0] * 1.1, `${id}: coasting curvature ${lines[0].toFixed(4)}, trail braking ${lines[1].toFixed(4)}`);
    assert.ok(lines[2] > lines[0] * 0.7, `${id}: full brake on turn-in plows on (${lines[2].toFixed(4)} vs coasting ${lines[0].toFixed(4)})`);
  }
});

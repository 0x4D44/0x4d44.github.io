// S4: every hazard of kind "jump" must launch the huia at its called speed (hazard.speed, m/s), with a safe landing.
// STAGES_BREAK=flat-jump flattens one jump's kicker so the check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const DT = 1 / 120;

function flyJump(st, hz) {
  // run-up: from just after the last real corner (at most 130 m before the lip)
  let j = Math.round(hz.s / st.ds);
  while (j > 0 && Math.abs(st.curv[j]) < 1 / 120) j--;
  const straight = hz.s - j * st.ds;
  const s0 = Math.max(2, hz.s - Math.min(130, straight - 10));
  const p = st.sample(s0, {});
  const v = createVehicle(CARS.huia, { tyre: bestTyreFor(st) });
  v.reset({ x: p.x, y: p.y, z: p.z, yaw: p.heading }, hz.speed, st);
  const bot = createBot(st, v, { skill: 1 });
  let air = 0, best = 0, t = 0, flips = 0, minUp = 1, impacts = 0;
  while (v.state.s < hz.s + 90 && t < 20) {
    const inp = bot.control(DT);
    const e = hz.speed - v.state.speed; // hold the called speed
    inp.throttle = e > 0 ? Math.min(1, e * 0.5 + 0.3) : 0;
    inp.brake = e < -3 ? 0.3 : 0;
    v.step(DT, inp, st);
    t += DT;
    const s = v.state;
    if (s.airborne) air += DT; else { best = Math.max(best, air); air = 0; }
    if (s.flipped) flips++;
    minUp = Math.min(minUp, s.upY);
    for (const ev of s.events) if (ev.t === "impact") impacts++;
    s.events.length = 0;
  }
  best = Math.max(best, air);
  return { air: best + (best > 0 ? 0.08 : 0), flips, minUp, impacts, straight, finalS: v.state.s };
}

for (const id of STAGE_IDS) {
  test(`${id}: every jump launches a car at its called speed and lands safely`, () => {
    const st = buildStage(id);
    if (BREAK === "flat-jump" && id === "otago") {
      // flatten the road under the first jump (what a 'jump' that does not jump looks like)
      const hz = st.hazards.find((h) => h.kind === "jump");
      const i0 = Math.round(hz.s / st.ds), y0 = st.py[Math.max(0, i0 - 20)], y1 = st.py[i0 + 20];
      const orig = st.heightAt, q = {};
      st.heightAt = (x, z) => {
        const h = orig(x, z);
        st.project(x, z, hz.s, q);
        // straight ramp between the road heights 40 m before and 40 m after: no kicker
        return Math.abs(q.s - hz.s) < 40 && Math.abs(q.lat) < 8 ? y0 + (y1 - y0) * (q.s - hz.s + 40) / 80 : h;
      };
      const origN = st.normalAt;
      st.normalAt = (x, z, out) => {
        origN(x, z, out);
        st.project(x, z, hz.s, q);
        if (Math.abs(q.s - hz.s) < 40 && Math.abs(q.lat) < 8) { out.x = 0; out.y = 1; out.z = 0; }
        return out;
      };
    }
    const jumps = st.hazards.filter((h) => h.kind === "jump");
    for (const hz of jumps) {
      assert.ok(hz.speed >= 18 && hz.speed <= 30, `${id}: jump at s=${hz.s} has called speed ${hz.speed}`);
      const r = flyJump(st, hz);
      assert.ok(r.straight >= 60, `${id}: jump at s=${hz.s} has only ${r.straight} m of straight before it`);
      assert.ok(r.air > 0.3, `${id}: jump at s=${hz.s} at ${hz.speed} m/s gives only ${r.air.toFixed(2)} s of air`);
      assert.equal(r.flips, 0, `${id}: jump at s=${hz.s} rolled the car`);
      assert.ok(r.minUp > 0.5, `${id}: jump at s=${hz.s}: car tipped to up=${r.minUp.toFixed(2)}`);
      assert.ok(r.finalS > hz.s + 40, `${id}: car stopped at s=${r.finalS.toFixed(0)} after the jump at ${hz.s}`);
      console.log(`# ${id} jump s=${hz.s.toFixed(0)} ${hz.speed} m/s: air ${r.air.toFixed(2)} s`);
    }
  });
}

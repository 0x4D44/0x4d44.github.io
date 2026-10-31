// DYNAMICS round 4 (Y1, Y2): lift-off rotation and the per-car handling fingerprint.
// Run: node --test tests/dynamics-liftoff.test.mjs
// Self-test switches (the test must fail with them set): DYN_BREAK=nolift (no longitudinal load transfer, the round-3 physics),
// DYN_BREAK=clones (every car is the Huia, so the fingerprint cannot tell them apart).
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { flatStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const BREAK = process.env.DYN_BREAK || "";
const specOf = (id) => {
  const base = BREAK === "clones" ? CARS.huia : CARS[id];
  if (BREAK === "nolift") return { ...base, handling: { ...base.handling, liftRotate: 0 } };
  return base;
};
const mk = (id, surf, tyre, speed) => {
  const st = flatStage(surf);
  const v = createVehicle(specOf(id), { tyre });
  v.reset(st.startPose, speed, st);
  return { st, v };
};
const input = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });

/** Straight cruise at a maintenance throttle, steer ramps in at 2 s, throttle either held or lifted at 5 s.
 *  Returns the mean yaw rate 0.1-0.5 s after the lift point and the worst slide angle after it. */
function cornerLift(id, surf, tyre, kmh, steer, lift) {
  const { st, v } = mk(id, surf, tyre, kmh / 3.6);
  const inp = input();
  let sum = 0, n = 0, worst = 0;
  for (let i = 0; i < 120 * 6.5; i++) {
    const t = i * DT;
    inp.steer = Math.min(1, Math.max(0, t - 2) / 0.8) * steer;
    inp.throttle = t < 5 || !lift ? THR : 0;
    v.step(DT, inp, st);
    v.state.events.length = 0;
    if (t > 5.1 && t <= 5.5) { sum += v.state.yawRate; n++; }
    if (t > 5) worst = Math.max(worst, Math.abs(v.state.slideAngle));
  }
  return { yr: sum / n, worst };
}
const THR = +(process.env.THR || 0.65), KT = +(process.env.KT || 90), KG = +(process.env.KG || 60);
const STEERS = [0.12, 0.15, 0.18];
function liftGain(id, surf, tyre, kmh) {
  let g = 0, worst = 0;
  for (const s of STEERS) {
    const a = cornerLift(id, surf, tyre, kmh, s, false), b = cornerLift(id, surf, tyre, kmh, s, true);
    if (process.env.DYN_PRINT && process.env.DYN_ALL) console.log("#   steer", s, "hold", a.yr.toFixed(3), "lift", b.yr.toFixed(3));
    g += (Math.abs(b.yr) - Math.abs(a.yr)) / Math.max(Math.abs(a.yr), 0.15); // floor on the divisor: a near-straight hold gives a meaningless ratio
    worst = Math.max(worst, b.worst);
  }
  return { gain: g / STEERS.length, worst };
}

test("lift-off at corner entry raises yaw rate by >= 15% on tarmac and >= 20% on gravel, without a spin (all four cars)", () => {
  const bad = [];
  for (const id of CAR_IDS) {
    const t = liftGain(id, SURFACE.TARMAC, "tarmac", KT), g = liftGain(id, SURFACE.GRAVEL, "gravel", KG);
    if (process.env.DYN_PRINT) console.log(id, "tarmac", (t.gain * 100).toFixed(0) + "%", t.worst.toFixed(2), "gravel", (g.gain * 100).toFixed(0) + "%", g.worst.toFixed(2));
    if (t.gain < 0.15) bad.push(`${id} tarmac lift-off yaw gain ${(t.gain * 100).toFixed(0)}% < 15%`);
    if (g.gain < 0.2) bad.push(`${id} gravel lift-off yaw gain ${(g.gain * 100).toFixed(0)}% < 20%`);
    if (t.worst > 0.6 || g.worst > 0.6) bad.push(`${id} lift-off slide ${Math.max(t.worst, g.worst).toFixed(2)} rad is a spin`);
  }
  assert.deepEqual(bad, []);
});

// ---------- handling fingerprint (Y2) ----------
function steadyGain(id, surf, tyre, ms, steer) {
  const { st, v } = mk(id, surf, tyre, ms);
  const inp = input();
  let thr = 0.1;
  const ys = [];
  for (let i = 0; i < 120 * 5; i++) {
    const t = i * DT;
    inp.steer = t < 1 ? 0 : steer;
    thr = Math.max(0, Math.min(1, thr + (ms - v.state.speed) * 0.02));
    inp.throttle = thr;
    v.step(DT, inp, st);
    v.state.events.length = 0;
    ys.push(Math.abs(v.state.yawRate));
  }
  const fin = ys.slice(-120).reduce((a, b) => a + b, 0) / 120;
  let tr = 0;
  for (let i = 120; i < ys.length; i++) if (ys[i] >= 0.63 * fin) { tr = (i - 120) * DT; break; }
  return { gain: fin / Math.abs(steer), tr };
}
function brakeDistance(id) {
  const { st, v } = mk(id, SURFACE.TARMAC, "tarmac", 100 / 3.6);
  const inp = input();
  inp.brake = 1;
  const d0 = v.state.distance;
  for (let i = 0; i < 120 * 10 && v.state.speed > 0.5; i++) { v.step(DT, inp, st); v.state.events.length = 0; }
  return v.state.distance - d0;
}
export function fingerprint(id) {
  return {
    understeer: steadyGain(id, SURFACE.TARMAC, "tarmac", 25, 0.2).gain, // steady yaw rate per unit steer at 90 km/h (low = understeer)
    response: steadyGain(id, SURFACE.GRAVEL, "gravel", 16, 0.2).tr, // time to 63% of the steady yaw rate after a steer step
    liftYaw: liftGain(id, SURFACE.TARMAC, "tarmac", 65).gain, // lift-off yaw gain
    braking: brakeDistance(id), // 100 to 0 km/h on tarmac
  };
}

test("handling fingerprint: any two cars differ by >= 12% in at least three of four measures", () => {
  const fp = Object.fromEntries(CAR_IDS.map((id) => [id, fingerprint(id)]));
  const keys = Object.keys(fp.huia);
  if (process.env.DYN_PRINT) for (const id of CAR_IDS) console.log("# fp", id, JSON.stringify(fp[id]));
  const bad = [];
  for (let i = 0; i < CAR_IDS.length; i++) for (let j = i + 1; j < CAR_IDS.length; j++) {
    const A = fp[CAR_IDS[i]], B = fp[CAR_IDS[j]];
    const apart = keys.filter((k) => Math.abs(A[k] - B[k]) / Math.min(A[k], B[k]) >= 0.12);
    if (process.env.DYN_PRINT) console.log(CAR_IDS[i], CAR_IDS[j], apart.join(","));
    if (apart.length < 3) bad.push(`${CAR_IDS[i]} vs ${CAR_IDS[j]} differ in only ${apart.length}: ${apart.join(",")}`);
  }
  assert.deepEqual(bad, []);
});

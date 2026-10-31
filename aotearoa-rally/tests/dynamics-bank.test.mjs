// DYNAMICS round 4 (Y4): bank hits. A roadside bank (3 m high, ~50 degree face) hit at 20/45/70 degrees and 40/70/100 km/h:
// the car loses some speed, never stops dead on a glancing hit, never launches off the top, never flips over.
// Run: node --test tests/dynamics-bank.test.mjs      (DYN_PRINT=1 prints the table)
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const BANK_TOP = 3;
const bank = (x) => (x > 6 ? Math.min(BANK_TOP, (x - 6) * 1.2) : 0);
const stage = makeTestStage({ length: 600, width: 10, boundary: 400, surf: SURFACE.GRAVEL, height: (x) => bank(x) });

function hit(id, deg, kmh) {
  const v = createVehicle(CARS[id], { tyre: "gravel" });
  v.reset({ ...stage.startPose, x: 0, z: stage.startPose.z - 10, yaw: -(deg * Math.PI) / 180 }, kmh / 3.6, stage);
  const inp = { steer: 0, throttle: 0.3, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  const y0 = v.state.y;
  let hitT = -1, after = 0, minUp = 1, rise = 0, vMin = 1e9;
  for (let i = 0; i < 120 * 5; i++) {
    v.step(DT, inp, stage);
    const q = v.state;
    for (const e of q.events) if (e.t === "impact" && hitT < 0) hitT = i * DT;
    if (hitT >= 0 && !after && i * DT > hitT + 1) after = q.speed * 3.6;
    if (hitT >= 0) vMin = Math.min(vMin, q.speed * 3.6);
    rise = Math.max(rise, q.y - y0);
    minUp = Math.min(minUp, q.upY ?? 1);
    q.events.length = 0;
  }
  return { hitT, after, vMin, rise, minUp, dmg: v.state.damage.total };
}

test("bank hit table: loses some speed, never stops on a glancing hit, never launches over the top, never flips", () => {
  const bad = [];
  for (const id of CAR_IDS) for (const deg of [20, 45, 70]) for (const kmh of [40, 70, 100]) {
    const r = hit(id, deg, kmh);
    if (process.env.DYN_PRINT) console.log(id, deg, kmh, "after", r.after.toFixed(0), "min", r.vMin.toFixed(0), "rise", r.rise.toFixed(2), "up", r.minUp.toFixed(2), "dmg", r.dmg.toFixed(2));
    const tag = `${id} ${deg} deg ${kmh} km/h`;
    if (r.hitT < 0) bad.push(tag + ": never touched the bank");
    if (r.rise > BANK_TOP - 0.4) bad.push(`${tag}: climbed ${r.rise.toFixed(1)} m, launched off the ${BANK_TOP} m bank`);
    if (r.minUp < 0.35) bad.push(`${tag}: rolled over (up ${r.minUp.toFixed(2)})`);
    if (r.dmg > 0.3) bad.push(`${tag}: damage ${r.dmg.toFixed(2)} too high for a bank`);
    if (r.vMin < -12) bad.push(`${tag}: bounced back at ${r.vMin.toFixed(0)} km/h`);
    if (deg === 20 && !(r.after >= 0.5 * kmh && r.after <= 1.0 * kmh)) bad.push(`${tag}: ${r.after.toFixed(0)} km/h a second later, wanted 50-100% of entry`);
    if (deg === 45 && !(r.after >= 0.25 * kmh && r.after <= 0.9 * kmh)) bad.push(`${tag}: ${r.after.toFixed(0)} km/h a second later, wanted 25-90% of entry`);
    if (deg === 70 && !(r.after <= 0.75 * kmh)) bad.push(`${tag}: ${r.after.toFixed(0)} km/h a second later, a head-on hit must scrub off more speed`);
  }
  assert.deepEqual(bad, []);
});

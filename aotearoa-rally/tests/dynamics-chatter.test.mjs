// DYNAMICS round 4 retune: a keyboard throttle chatters (bang-bang at 4-6 Hz) and must not spin the car through the
// lift-off rotation. The kick is one-shot per genuine corner-entry lift (throttle held > 0.6 for 0.3 s first, one kick per 0.6 s),
// so chatter must add (almost) no slide over the same car with no lift rotation at all.
// Run: node --test tests/dynamics-chatter.test.mjs
// Fails on the round-4 first-delivery constants (a kick on every throttle toggle, arm time 0, cooldown 0, Huia gain 0.7/1.6).
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { flatStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const worstSlide = (spec, surf, hz, steer, kmh) => {
  const st = flatStage(surf);
  const v = createVehicle(spec, { tyre: "gravel" });
  v.reset(st.startPose, kmh / 3.6, st);
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  let worst = 0;
  for (let i = 0; i < 120 * 10; i++) {
    const t = i * DT;
    inp.steer = Math.min(1, t / 0.5) * steer; // steering held
    inp.throttle = Math.floor(t * hz * 2) % 2 === 0 ? 1 : 0; // digital chatter
    v.step(DT, inp, st);
    v.state.events.length = 0;
    if (t > 1) worst = Math.max(worst, Math.abs(v.state.slideAngle));
  }
  return worst;
};

for (const [surf, name] of [[SURFACE.GRAVEL, "gravel"], [SURFACE.PUMICE, "pumice"]]) {
  test(`throttle chatter at 4-6 Hz with steering held does not spin or add slide on ${name} (all four cars)`, () => {
    const bad = [];
    for (const id of CAR_IDS) {
      const off = { ...CARS[id], handling: { ...CARS[id].handling, liftRotate: 0 } }; // the same car without lift rotation
      let added = 0, worst = 0;
      for (const hz of [4, 5, 6]) for (const steer of [0.15, 0.3, 0.5]) for (const kmh of [50, 80]) {
        const w = worstSlide(CARS[id], surf, hz, steer, kmh);
        worst = Math.max(worst, w);
        added = Math.max(added, w - worstSlide(off, surf, hz, steer, kmh));
      }
      if (worst > 1.0) bad.push(`${id} spun (slide ${worst.toFixed(2)} rad)`);
      if (added > 0.15) bad.push(`${id} chatter adds ${added.toFixed(2)} rad of slide over no lift rotation (limit 0.15)`);
    }
    assert.deepEqual(bad, []);
  });
}

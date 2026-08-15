// Can a stage actually be driven, start to finish?
//
// Every other test checks a part: the tyre model, the road geometry, the note
// timing. None of them answers the question a player asks first. This one puts a
// simple autopilot in the car and drives every stage in the book to the finish
// line, then asserts things that are only visible from inside a whole run —
// that the road can be followed at a rally pace, that nothing launches the car
// into orbit, that the surface under the wheels is the surface the stage says,
// and that a stage time lands somewhere a human would recognise.
//
// The autopilot is deliberately slow: pure pursuit on the centreline plus a
// speed plan built from the stage's own profile. It is not meant to be fast. If
// a driver this cautious cannot get down the road, the road is wrong.

import test from "node:test";
import assert from "node:assert/strict";

import { STAGE_BOOK, stageFromBook, stageWorld, speedProfile } from "../stage.js";
import { CARS, createCar, resetCar, stepCar, makeInput } from "../physics.js";
import { clamp, wrapAngle } from "../mathx.js";

const DT = 1 / 200;
const G = 9.81;
const CAR_ID = CARS.find((c) => c.drive === "4WD")?.id ?? CARS[0].id;

// What the autopilot plans to brake at. Well under what the car can do: the
// plan is followed by a proportional controller, not a trajectory tracker, so
// it has to arrive at the corner early or it does not arrive at all.
const PLAN_BRAKE = 6.0;

// Leave 15% of the car's weight on the wheels over a crest. Past that the road
// decides where the car lands, and a pure-pursuit driver has no say in it.
const CREST_LOAD = 0.85;

// Below this the pace derate stops being caution and becomes a stall: a car
// that plans to crawl a 9% mud or ice climb arrives without the momentum to
// finish it and cannot restart. Measured window is 10..14 m/s — under 10 the
// climbs beat it, over 14 it starts running wide — so 12 is a choice with room
// either side rather than a fitted number.
const CRAWL = 12;

// Look further ahead the faster you are going: a fixed aim point either wanders
// at speed or cuts every hairpin at walking pace.
function aimDistance(speed) {
  return clamp(9 + speed * 0.55, 12, 48);
}

// The speed the autopilot intends to be doing at every sample, worked out once.
// speedProfile is the LIMIT curve, and three things must happen to it before a
// pure-pursuit driver can follow it: derate it, because the limit belongs to a
// car on the ideal line; cap it wherever the road falls away from under the
// wheels; then walk it backwards so the braking begins before the corner
// instead of in it.
function drivingPlan(stage, profile, pace) {
  const n = stage.count;
  const step = stage.step;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let cap = (profile[i] ?? 30) * pace;
    // Vertical curvature — the same measure stage.js uses to decide a crest has
    // become a jump. The profile itself ignores it, so a stage can read "flat
    // out" 20 m before it throws the car into the trees.
    const yy = i > 0 && i < n - 1 ? (stage.grade[i + 1] - stage.grade[i - 1]) / (2 * step) : 0;
    if (yy < 0) cap = Math.min(cap, Math.sqrt((CREST_LOAD * G) / -yy));
    v[i] = cap;
  }
  for (let i = n - 2; i >= 0; i -= 1) {
    const vv = Math.sqrt(v[i + 1] * v[i + 1] + 2 * PLAN_BRAKE * step);
    if (vv < v[i]) v[i] = vv;
  }
  return v;
}

function driveStage(stage, opts = {}) {
  const world = stageWorld(stage);
  const car = createCar(opts.carId ?? CAR_ID, {
    preset: "arcade",
    assists: {
      autoShift: true, autoClutch: true, abs: true,
      tractionControl: 0.5, stability: 0.45,
      steerAssist: 0.4, speedSensitiveSteer: true,
    },
  });
  resetCar(car, stage.start.x, stage.start.y + 0.2, stage.start.z, stage.start.yaw);

  const profile = speedProfile(stage);
  const plan = drivingPlan(stage, profile, opts.pace ?? 0.72);
  const input = makeInput();
  const proj = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
  const surf = {};

  const report = {
    finished: false,
    timeS: 0,
    maxLateral: 0,
    offRoadS: 0,
    maxAirTime: 0,
    airborneS: 0,
    maxVerticalG: 0,
    rolled: false,
    stuckS: 0,
    surfaceMismatch: 0,
    samples: 0,
    minSpeed: Infinity,
    maxSpeed: 0,
  };

  const limit = Math.ceil((opts.maxSeconds ?? 900) / DT);
  let sinceProgress = 0;
  let bestS = 0;

  for (let step = 0; step < limit; step += 1) {
    world.project(car.pos.x, car.pos.z, proj.s, proj);
    const halfWidth = stage.halfWidth[proj.index] ?? 4;
    const offRoad = proj.lateral > halfWidth;

    // Aim at a point down the road rather than at the road beside us — and much
    // closer when recovering, so the nose points at the road instead of along it.
    const lead = offRoad ? 10 : aimDistance(car.speed);
    const i = world.sampleAt(Math.min(stage.length - 1, proj.s + lead));
    const dx = stage.x[i] - car.pos.x;
    const dz = stage.z[i] - car.pos.z;
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - car.yaw);

    // Both terms are negated against the naive form, because the frame is not
    // the intuitive one: a POSITIVE steer points the wheels LEFT, which produces
    // a NEGATIVE yaw rate. Getting this backwards drives straight off the road
    // in the first fifty metres, which is exactly what it did.
    const steer = clamp(-err * (offRoad ? 2.2 : 1.5) + car.yawRate * 0.28, -1, 1);

    // The plan already carries the derate, the crests and the braking distance,
    // so the throttle only has to hold the car on it. The floor is the one thing
    // the plan cannot know: where the limit curve is already low, obeying the
    // derate on top of it is how the car ends up stopped on a climb.
    const j = world.sampleAt(Math.min(stage.length - 1, proj.s + 12));
    let target = Math.max(plan[j], Math.min(CRAWL, (profile[j] ?? 30) * 0.9));
    target = Math.min(target, opts.speedCap ?? 999);
    // The verge is not a place to carry speed, and trying to is how a recovery
    // becomes a roll.
    if (offRoad) target = Math.min(11, target);
    const over = car.speed - target;
    input.steer = steer;
    input.throttle = over < 0 ? clamp(-over * 0.45, 0, 1) : 0;
    input.brake = over > 0 ? clamp(over * 0.30, 0, 1) : 0;
    input.handbrake = 0;
    // Beached. Give it everything, and if that does not work the road is at
    // fault, not the driver.
    if (sinceProgress > 1.5 && car.speed < 3) {
      input.throttle = 1;
      input.brake = 0;
    }

    stepCar(car, input, world, DT);

    report.timeS += DT;
    report.samples += 1;
    report.maxLateral = Math.max(report.maxLateral, proj.lateral);
    report.maxAirTime = Math.max(report.maxAirTime, car.airTime);
    report.maxVerticalG = Math.max(report.maxVerticalG, Math.abs(car.verticalG));
    report.minSpeed = Math.min(report.minSpeed, car.speed);
    report.maxSpeed = Math.max(report.maxSpeed, car.speed);
    if (car.onGround === 0) report.airborneS += DT;
    if (car.rolledOver) report.rolled = true;

    if (offRoad) report.offRoadS += DT;

    world.surfaceAt(car.pos.x, car.pos.z, surf);
    if (proj.lateral <= halfWidth * 0.5 && surf.onRoad === false) report.surfaceMismatch += 1;

    if (proj.s > bestS + 1) {
      bestS = proj.s;
      sinceProgress = 0;
    } else {
      sinceProgress += DT;
      if (sinceProgress > 12) { report.stuckS = sinceProgress; break; }
    }

    if (proj.s >= stage.finish.s - 5) { report.finished = true; break; }
  }

  report.distance = bestS;
  report.avgKph = (bestS / Math.max(report.timeS, 1e-6)) * 3.6;
  return report;
}

// Building and driving twelve stages is minutes of work, so do it once.
const runs = new Map();
function runFor(id) {
  if (!runs.has(id)) {
    const stage = stageFromBook(id);
    runs.set(id, { stage, report: driveStage(stage) });
  }
  return runs.get(id);
}

for (const entry of STAGE_BOOK) {
  test(`${entry.id} can be driven to the finish`, () => {
    const { stage, report } = runFor(entry.id);
    assert.ok(
      report.finished,
      `only reached ${Math.round(report.distance)} m of ${Math.round(stage.length)} m`
      + `${report.stuckS ? ` (stuck for ${report.stuckS.toFixed(1)} s)` : ""}`
      + `${report.rolled ? " (rolled over)" : ""}`,
    );
  });

  test(`${entry.id} keeps the car on the road and the right way up`, () => {
    const { report } = runFor(entry.id);
    // A crude autopilot will run wide sometimes; what it must not do is spend a
    // meaningful part of the stage off the road, or end up on its roof.
    assert.ok(!report.rolled, "the autopilot rolled the car");
    const offRoadFraction = report.offRoadS / Math.max(report.timeS, 1e-6);
    assert.ok(
      offRoadFraction < 0.25,
      `spent ${(offRoadFraction * 100).toFixed(1)}% of the stage off the road`,
    );
  });

  test(`${entry.id} never launches the car`, () => {
    const { report } = runFor(entry.id);
    // A rally car gets air over a crest; two and a half seconds of it means the
    // road threw the car off a cliff, which is what a terrain discontinuity
    // looks like from the driver's seat.
    assert.ok(
      report.maxAirTime < 2.5,
      `longest flight was ${report.maxAirTime.toFixed(2)} s`,
    );
    const airFraction = report.airborneS / Math.max(report.timeS, 1e-6);
    assert.ok(
      airFraction < 0.15,
      `airborne for ${(airFraction * 100).toFixed(1)}% of the stage`,
    );
    assert.ok(
      report.maxVerticalG < 14,
      `peak vertical load ${report.maxVerticalG.toFixed(1)} g would destroy the car`,
    );
  });

  test(`${entry.id} runs at a rally pace`, () => {
    const { stage, report } = runFor(entry.id);
    assert.ok(
      report.avgKph > 45 && report.avgKph < 150,
      `a crude autopilot averaged ${report.avgKph.toFixed(1)} km/h over `
      + `${(stage.length / 1000).toFixed(2)} km`,
    );
    assert.ok(
      report.maxSpeed * 3.6 > 90,
      `never exceeded ${(report.maxSpeed * 3.6).toFixed(0)} km/h — nothing here is fast`,
    );
  });

  test(`${entry.id} puts road under the middle of the road`, () => {
    const { report } = runFor(entry.id);
    // Well inside the drivable width, surfaceAt must agree that we are on it.
    // A mismatch means the road mesh and the physics surface disagree about
    // where the road is, which the player feels as grip vanishing on a
    // perfectly good-looking surface.
    assert.equal(
      report.surfaceMismatch, 0,
      `${report.surfaceMismatch} samples inside the road read as off-road`,
    );
  });
}

test("the same stage driven twice is identical", () => {
  const stage = stageFromBook(STAGE_BOOK[0].id);
  const a = driveStage(stage, { maxSeconds: 90 });
  const b = driveStage(stage, { maxSeconds: 90 });
  assert.equal(a.distance, b.distance);
  assert.equal(a.timeS, b.timeS);
  assert.equal(a.maxAirTime, b.maxAirTime);
});

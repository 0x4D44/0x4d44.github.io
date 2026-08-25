// physics.js is the module the whole game is judged by, so this file measures it
// against numbers rather than smoke-testing it: acceleration and top speed against
// the engine and the gearing, braking against the friction available, load transfer
// against the CoM height and wheelbase, and the tyre against surfaces.js.
//
// Everything runs on a flat synthetic world at a fixed 1/120 s step (the largest
// step the contract allows), so every figure below is reproducible and a band that
// moves is a real change in the car, not in the harness.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CARS, ASSIST_PRESETS, createCar, resetCar, stepCar, makeInput, carSpec, carTelemetry,
} from "../physics.js";
import { SURFACE, surfaceProps } from "../surfaces.js";

const DT = 1 / 120;
const G = 9.81;
const RHO = 1.225;
const KPH = 3.6;

// The `world` contract from CONTRACTS.md, uniform, climbing at `grade` (dy/dz) in
// the +Z direction a fresh car faces. `surfaceAt` fills the caller's object because
// physics.js hands it the same scratch every wheel.
function slopedWorld(surfaceId = SURFACE.TARMAC, groundY = 0, grade = 0) {
  const props = surfaceProps(surfaceId);
  const inv = 1 / Math.sqrt(1 + grade * grade);
  return {
    gravity: G,
    heightAt: (x, z) => groundY + z * grade,
    normalAt: (x, z, out) => { out.x = 0; out.y = inv; out.z = -grade * inv; return out; },
    surfaceAt: (x, z, out) => {
      out.props = props;
      out.surfaceId = surfaceId;
      out.onRoad = true;
      out.lateral = 0;
      out.signedLateral = 0;
      out.s = 0;
      out.edgeBlend = 0;
      out.roughness = props.roughness;
      out.ruts = 0;
      return out;
    },
    sampleAt: () => 0,
    project: (x, z, hint, out) => { out.s = 0; out.lateral = 0; out.signedLateral = 0; out.index = 0; return out; },
    bounds: { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 },
  };
}

const flatWorld = (surfaceId = SURFACE.TARMAC, groundY = 0) => slopedWorld(surfaceId, groundY, 0);

// The default preset is the sim one, whose gearbox is manual; a driver-facing car
// gets the shift servo. Tests that are not about the gearbox use this.
function driven(id, over = {}) {
  return createCar(id, { assists: { autoShift: true, autoClutch: true, abs: true }, ...over });
}

function steps(seconds) {
  return Math.round(seconds / DT);
}

function hold(car, input, world, seconds) {
  const n = steps(seconds);
  for (let i = 0; i < n; i += 1) stepCar(car, input, world, DT);
  return car;
}

function accelerateTo(car, world, kph, limit = 45) {
  const input = makeInput();
  input.throttle = 1;
  let t = 0;
  while (car.speed * KPH < kph && t < limit) {
    stepCar(car, input, world, DT);
    t += DT;
  }
  return t;
}

const axleLoad = (car, front) => (front
  ? car.wheels[0].load + car.wheels[1].load
  : car.wheels[2].load + car.wheels[3].load);

const sumFx = (car) => car.wheels[0].fx + car.wheels[1].fx + car.wheels[2].fx + car.wheels[3].fx;

function peakPowerW(spec) {
  let best = 0;
  for (const [rpm, torque] of spec.engine.torque) best = Math.max(best, torque * rpm * Math.PI * 2 / 60);
  return best;
}

// ---- straight line -------------------------------------------------------

// Measured on this harness; the bands are +/-14%, which is wide enough to survive
// a tyre or diff tweak and narrow enough that a broken gear ratio shows up.
const SPRINT = {
  "vireo-r2": { t100: [7.8, 10.4], topKph: [165, 191] },
  "sprint-j2": { t100: [7.4, 9.9], topKph: [198, 228] },
  "brackmoor-t8": { t100: [8.7, 11.6], topKph: [169, 195] },
  // Re-measured: this band was recorded while the auto-clutch pinned the engine
  // at ~2100 rpm off the line, below the 3200 rpm its turbo lights at, so it read
  // the bog rather than the car. With the launch fixed the 640 sprints in 4.9 s.
  "delta-b640": { t100: [4.2, 5.6], topKph: [202, 233] },
  "corvine-rs2000": { t100: [4.5, 6.1], topKph: [187, 216] },
  "falke-4s": { t100: [4.7, 6.4], topKph: [182, 209] },
  "ardent-r1": { t100: [3.3, 4.5], topKph: [185, 213] },
  "astra-corsa": { t100: [3.1, 4.2], topKph: [197, 227] },
};

test("every car reaches 100 km/h in a time its power-to-weight can explain", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    const t = accelerateTo(car, world, 100);
    const band = SPRINT[spec.id];
    assert.ok(band, `no 0-100 band recorded for ${spec.id}`);
    assert.ok(
      t >= band.t100[0] && t <= band.t100[1],
      `${spec.id} 0-100 km/h took ${t.toFixed(2)} s, outside ${band.t100[0]}-${band.t100[1]} s`,
    );

    // Two bounds no car may break whatever the tuning: it cannot out-accelerate
    // the friction under it, nor beat the time its peak power would give with a
    // perfect launch and no losses.
    const v = 100 / KPH;
    const muLong = spec.tyre.muLong * (spec.tyre.surfaceGrip?.[SURFACE.TARMAC] ?? 1);
    const tTraction = v / (muLong * G);
    const tPower = spec.mass * v * v / (2 * peakPowerW(spec));
    assert.ok(
      t > tTraction,
      `${spec.id} reached 100 km/h in ${t.toFixed(2)} s, beating the ${tTraction.toFixed(2)} s its tyres allow`,
    );
    assert.ok(
      t > tPower,
      `${spec.id} reached 100 km/h in ${t.toFixed(2)} s, beating the ${tPower.toFixed(2)} s its peak power allows`,
    );
    assert.ok(
      t < tPower * 8,
      `${spec.id} took ${t.toFixed(2)} s to 100 km/h, ${(t / tPower).toFixed(1)}x the ${tPower.toFixed(2)} s ideal — the drivetrain is losing far too much`,
    );
  }
});

test("top speed is what the top gear, the limiter and the drag allow", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    const input = makeInput();
    input.throttle = 1;
    hold(car, input, world, 90);

    const band = SPRINT[spec.id].topKph;
    const kph = car.speed * KPH;
    assert.ok(
      kph >= band[0] && kph <= band[1],
      `${spec.id} topped out at ${kph.toFixed(1)} km/h, outside ${band[0]}-${band[1]} km/h`,
    );
    assert.equal(car.gear, spec.gearbox.ratios.length, `${spec.id} finished flat out in gear ${car.gear}`);

    // Flat out the cars are limiter-bound, so the speed must sit just under the
    // one the gearing gives at the cut — under it, because a driven tyre slips.
    const overall = spec.gearbox.ratios[spec.gearbox.ratios.length - 1] * spec.gearbox.final;
    const geared = spec.engine.limiterRpm * (Math.PI * 2 / 60) * spec.wheelRadius / overall;
    const ratio = car.speed / geared;
    assert.ok(
      ratio > 0.90 && ratio <= 1.0,
      `${spec.id} ran at ${(ratio * 100).toFixed(1)}% of its ${(geared * KPH).toFixed(1)} km/h geared limit (${kph.toFixed(1)} km/h)`,
    );
  }
});

// Flat out, every car in the catalogue is limiter-bound rather than drag-bound, so
// drag has to be measured where it is the only force left: a coast.
function coastDecel(specId, tune) {
  const world = flatWorld(SURFACE.TARMAC);
  const car = driven(specId, tune ? { tune } : {});
  accelerateTo(car, world, 126);
  const input = makeInput();
  input.clutch = 1;
  hold(car, input, world, 1.5);
  const v0 = car.speed;
  hold(car, input, world, 1);
  return { decel: v0 - car.speed, v: (v0 + car.speed) * 0.5 };
}

test("drag scales the coast-down with the frontal area", () => {
  const spec = carSpec("corvine-rs2000");
  const stock = coastDecel(spec.id);
  const draggy = coastDecel(spec.id, { "aero.dragArea": spec.aero.dragArea * 2.5 });
  const ratio = draggy.decel / stock.decel;
  assert.ok(
    ratio > 1.8 && ratio < 2.5,
    `2.5x the drag area changed the coast-down from ${stock.decel.toFixed(4)} to ${draggy.decel.toFixed(4)} m/s^2`
    + ` (ratio ${ratio.toFixed(3)}); rolling resistance is unchanged, so it should be a little under 2.5x`,
  );
});

// ---- gearbox -------------------------------------------------------------

test("the shift servo climbs to top gear and does not hunt", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    const input = makeInput();
    input.throttle = 1;

    let leftFirst = null;
    let downshifts = 0;
    let previous = car.gear;
    const n = steps(45);
    for (let i = 0; i < n; i += 1) {
      stepCar(car, input, world, DT);
      if (leftFirst === null && car.gear > 1) leftFirst = i * DT;
      if (car.gear < previous) downshifts += 1;
      previous = car.gear;
    }
    assert.ok(leftFirst !== null && leftFirst < 6, `${spec.id} sat in first gear for ${leftFirst ?? ">45"} s`);
    assert.equal(car.gear, spec.gearbox.ratios.length, `${spec.id} never reached top gear (stopped at ${car.gear})`);
    assert.equal(downshifts, 0, `${spec.id} downshifted ${downshifts} times while accelerating flat out`);

    // A steady 110 km/h must not oscillate between two gears: the up and down
    // thresholds have to leave a band the car can sit in.
    const cruise = driven(spec.id);
    accelerateTo(cruise, world, 110);
    let shifts = 0;
    let gear = cruise.gear;
    const cruiseInput = makeInput();
    for (let i = 0; i < steps(20); i += 1) {
      cruiseInput.throttle = cruise.speed * KPH < 110 ? 0.45 : 0.05;
      stepCar(cruise, cruiseInput, world, DT);
      if (cruise.gear !== gear) { shifts += 1; gear = cruise.gear; }
    }
    assert.equal(shifts, 0, `${spec.id} hunted ${shifts} times holding 110 km/h`);
  }
});

test("a manual gearbox holds its gear and shift inputs are edge-triggered", () => {
  const world = flatWorld(SURFACE.TARMAC);
  const car = createCar("corvine-rs2000");   // default preset: the box is manual
  assert.equal(car.assists.autoShift, false, "the sim preset is supposed to leave the gearbox manual");

  const input = makeInput();
  input.throttle = 1;
  hold(car, input, world, 3);
  assert.equal(car.gear, 1, `an untouched manual box left first gear on its own (gear ${car.gear})`);

  input.shiftUp = true;
  hold(car, input, world, 2);
  assert.equal(car.gear, 2, `holding shift-up for 2 s gave gear ${car.gear}; it must advance one gear per press`);

  input.shiftUp = false;
  stepCar(car, input, world, DT);
  input.shiftUp = true;
  hold(car, input, world, 0.5);
  assert.equal(car.gear, 3, `a released-and-pressed shift-up gave gear ${car.gear}`);

  input.shiftUp = false;
  input.gear = 5;
  hold(car, input, world, 0.5);
  assert.equal(car.gear, 5, `an explicit gear request gave gear ${car.gear}`);

  // Reverse is refused above walking pace and accepted at rest.
  input.gear = -1;
  hold(car, input, world, 0.5);
  assert.equal(car.gear, 5, `reverse engaged at ${(car.speed * KPH).toFixed(0)} km/h`);

  input.gear = null;
  input.throttle = 0;
  input.brake = 1;
  let t = 0;
  while (car.speed > 0.2 && t < 20) { stepCar(car, input, world, DT); t += DT; }
  input.brake = 0;
  input.gear = -1;
  hold(car, input, world, 0.5);
  assert.equal(car.gear, -1, "reverse would not engage at a standstill");
  input.gear = null;
  input.throttle = 0.7;
  hold(car, input, world, 3);
  assert.ok(car.forwardSpeed < -1, `in reverse the car went forwards at ${car.forwardSpeed.toFixed(2)} m/s`);
});

// What physics.js calls stopped. Mirrored here so the loop below asks about the
// gear only while the car is genuinely still going forwards.
const STOPPED = 0.6;

// The report this covers: "braking should turn into reverse after the car has come
// to a stop". Reverse existed but had to be selected by hand, which no rally game
// asks of a player trying to back out of a ditch.
test("the brake becomes reverse once the car has stopped, and the throttle brings it back", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    const input = makeInput();
    input.throttle = 1;
    hold(car, input, world, 3);
    assert.ok(car.speed > 3, `${spec.id} never got rolling`);

    input.throttle = 0;
    input.brake = 1;
    let t = 0;
    while (car.forwardSpeed > STOPPED && t < 20) {
      stepCar(car, input, world, DT);
      t += DT;
      assert.ok(car.gear > 0, `${spec.id} took reverse while still doing ${(car.forwardSpeed * KPH).toFixed(1)} km/h forwards`);
    }
    // The pedal stays down through the stop, which is the whole gesture.
    hold(car, input, world, 0.6);
    assert.equal(car.gear, -1, `${spec.id} sat on the brake at a standstill and stayed in gear ${car.gear}`);
    hold(car, input, world, 2);
    assert.ok(
      car.forwardSpeed < -1,
      `${spec.id} selected reverse but the brake pedal did not drive it: ${car.forwardSpeed.toFixed(2)} m/s`,
    );

    // The mirror, so nobody is stranded facing the way he came: the throttle stops
    // it and hands back a forward gear.
    input.brake = 0;
    input.throttle = 1;
    let t2 = 0;
    while (car.gear < 0 && t2 < 6) { stepCar(car, input, world, DT); t2 += DT; }
    assert.equal(car.gear, 1, `${spec.id} would not leave reverse on the throttle (gear ${car.gear} after ${t2.toFixed(1)} s)`);
    hold(car, input, world, 2);
    assert.ok(
      car.forwardSpeed > 1,
      `${spec.id} came out of reverse but would not drive forward (${car.forwardSpeed.toFixed(2)} m/s)`,
    );
  }
});

test("a hard stop does not slam into reverse, and neither the handbrake nor the start-line hold does", () => {
  const world = flatWorld(SURFACE.TARMAC);
  const car = driven("corvine-rs2000");
  const input = makeInput();
  input.throttle = 1;
  hold(car, input, world, 3);

  // Crossing zero is not the moment to select reverse: a driver who is only
  // stopping still has the pedal down for a moment afterwards.
  input.throttle = 0;
  input.brake = 1;
  let stopped = null;
  let engaged = null;
  let t = 0;
  while (engaged === null && t < 20) {
    stepCar(car, input, world, DT);
    t += DT;
    if (stopped === null && car.speed < 0.2) stopped = t;
    if (car.gear < 0) engaged = t;
  }
  assert.ok(stopped !== null, "the car never came to a stop under full braking");
  assert.ok(engaged !== null, "the brake never became reverse");
  assert.ok(
    engaged - stopped > 0.2,
    `reverse arrived ${(engaged - stopped).toFixed(3)} s after the car stopped — that is a hard stop slamming into it`,
  );

  // The handbrake is a driver holding the car still, not a request for reverse.
  const hb = driven("corvine-rs2000");
  const hbIn = makeInput();
  hbIn.throttle = 1;
  hold(hb, hbIn, world, 3);
  hbIn.throttle = 0;
  hbIn.brake = 1;
  hbIn.handbrake = 1;
  let ht = 0;
  while (hb.speed > 0.2 && ht < 20) { stepCar(hb, hbIn, world, DT); ht += DT; }
  hold(hb, hbIn, world, 3);
  assert.ok(hb.gear > 0, `three seconds stopped on the handbrake put the car in gear ${hb.gear}`);

  // Let it go and the same brake pedal does engage — the guard is the handbrake
  // itself, not some state it left behind.
  hbIn.handbrake = 0;
  hold(hb, hbIn, world, 0.6);
  assert.equal(hb.gear, -1, "reverse would not engage once the handbrake was released");

  // game.js holds the car on the start line with the brake AND the clutch down for
  // a five-second countdown. A clutch pedal is not a request for reverse, and if it
  // were the field would reverse off the line before the lights went green.
  // The pedal that has to carry it is the clutch: a driver who waits for the lights
  // without revving is otherwise stopped, on the brake and off the throttle, which
  // is the transition exactly.
  const line = driven("corvine-rs2000");
  const lineIn = makeInput();
  lineIn.brake = 1;
  lineIn.clutch = 1;
  hold(line, lineIn, world, 5);
  assert.equal(line.gear, 1, `the start-line hold left the car in gear ${line.gear}`);
  assert.ok(line.speed < 0.5, `the car crept off the start line at ${(line.speed * KPH).toFixed(1)} km/h`);
});

test("reverse is speed-limited however long it is held", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    const input = makeInput();
    input.gear = -1;                 // by hand, the way a manual box does it
    hold(car, input, world, 0.5);
    assert.equal(car.gear, -1, `${spec.id} would not take reverse at a standstill`);

    // Selected by hand, the pedals stay where they are: throttle drives it.
    input.gear = null;
    input.throttle = 1;
    let worst = 0;
    const n = steps(25);
    for (let i = 0; i < n; i += 1) {
      stepCar(car, input, world, DT);
      worst = Math.min(worst, car.forwardSpeed);
    }
    const kph = -worst * KPH;
    assert.ok(kph > 20, `${spec.id} reverse is unusable at ${kph.toFixed(1)} km/h`);
    assert.ok(kph < 55, `${spec.id} reached ${kph.toFixed(1)} km/h backwards — reverse is geared, not unlimited`);
  }
});

test("no car can be pinned in first gear with the shift servo on", () => {
  // The regression this file exists for: a player held the throttle down and the
  // gearbox never shifted, so the car stopped at first gear's limiter speed.
  assert.equal(ASSIST_PRESETS.arcade.autoShift, true, "the arcade preset must shift for the player");

  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const servo = driven(spec.id);
    const manual = createCar(spec.id);
    const input = makeInput();
    input.throttle = 1;
    hold(servo, input, world, 25);
    hold(manual, input, world, 25);

    const firstGearKph = spec.engine.limiterRpm * (Math.PI * 2 / 60) * spec.wheelRadius
      / (spec.gearbox.ratios[0] * spec.gearbox.final) * KPH;

    assert.ok(
      servo.gear > 1 && servo.speed * KPH > firstGearKph * 1.5,
      `${spec.id} with autoShift reached only ${(servo.speed * KPH).toFixed(1)} km/h in gear ${servo.gear}`
      + ` — first gear alone is worth ${firstGearKph.toFixed(1)} km/h`,
    );
    assert.ok(
      servo.speed * KPH > 150,
      `${spec.id} with autoShift managed ${(servo.speed * KPH).toFixed(1)} km/h flat out for 25 s`,
    );
    // And the failing case is exactly the one the servo removes.
    assert.equal(manual.gear, 1, `${spec.id} left first gear with no shift input (gear ${manual.gear})`);
    assert.ok(
      manual.speed * KPH < firstGearKph * 1.15,
      `${spec.id} pinned in first reached ${(manual.speed * KPH).toFixed(1)} km/h,`
      + ` past the ${firstGearKph.toFixed(1)} km/h the ratio allows`,
    );
  }
});

// ---- launching and restarting -------------------------------------------

// The arcade preset is the one a player gets: shift servo, traction control and
// the auto-clutch. Flat out from rest up a climb is the move that strands a car.
function hillStart(specId, surfaceId, grade, over = {}) {
  const world = slopedWorld(surfaceId, 0, grade);
  const car = createCar(specId, { preset: "arcade", ...over });
  const input = makeInput();
  // Sit still in gear off the throttle first, the way a car that has just stopped
  // part-way up the climb sits before the driver gets back on it.
  hold(car, input, world, 0.5);
  input.throttle = 1;

  let minRpm = Infinity;
  let stalledSteps = 0;
  const settle = steps(0.25);
  const n = steps(6);
  for (let i = 0; i < n; i += 1) {
    stepCar(car, input, world, DT);
    if (i >= settle) minRpm = Math.min(minRpm, car.engineRpm);
    if (car.engineStalled) stalledSteps += 1;
  }
  return { kph: car.forwardSpeed * KPH, minRpm, stalledSteps, gear: car.gear };
}

const LOOSE_CLIMBS = [SURFACE.GRAVEL, SURFACE.DIRT, SURFACE.SNOW, SURFACE.MUD];

test("a car pulls away up a low-grip climb instead of bogging the engine", () => {
  // The failure this test exists for: on anything looser than tarmac the
  // auto-clutch fed torque in proportional to engine speed with a band that
  // opened at half the launch rpm, so the engine settled wherever the clutch's
  // torque crossed its own — deep below the launch rpm — and the car slid
  // backwards down the hill. A player who stops on an ice or mud climb is
  // stranded, and the stage cannot be finished.
  for (const spec of CARS) {
    for (const surfaceId of LOOSE_CLIMBS) {
      for (const grade of [0.04, 0.088]) {
        const name = `${spec.id} on ${surfaceProps(surfaceId).name} at ${(grade * 100).toFixed(1)}%`;
        const r = hillStart(spec.id, surfaceId, grade);
        assert.ok(r.kph > 4, `${name} was still doing ${r.kph.toFixed(2)} km/h after 6 s flat out from rest`);
        assert.equal(r.stalledSteps, 0, `${name} stalled the engine pulling away`);
        assert.ok(
          r.minRpm > spec.engine.idleRpm * 0.98,
          `${name} dragged the engine to ${r.minRpm.toFixed(0)} rpm, under its ${spec.engine.idleRpm} rpm idle`
          + " — the auto-clutch is meant to slip, not to bog",
        );
      }
    }

    // The hard surfaces have grip to spare, so a bogged launch shows up as a
    // number rather than as a sign.
    for (const surfaceId of [SURFACE.GRAVEL, SURFACE.DIRT]) {
      const r = hillStart(spec.id, surfaceId, 0.088);
      assert.ok(
        r.kph > 12,
        `${spec.id} reached only ${r.kph.toFixed(1)} km/h in 6 s up an 8.8% ${surfaceProps(surfaceId).name} climb`,
      );
    }

    // Sheet ice at a gentle grade is the limit case: the car may crawl, but it
    // may not slide backwards and it may not bog.
    const ice = hillStart(spec.id, SURFACE.ICE, 0.04);
    assert.ok(ice.kph > 0.5, `${spec.id} slid backwards at ${(-ice.kph).toFixed(2)} km/h on a 4% ice climb`);
    assert.equal(ice.stalledSteps, 0, `${spec.id} stalled on a 4% ice climb`);
    assert.ok(
      ice.minRpm > spec.engine.idleRpm * 0.98,
      `${spec.id} dragged the engine to ${ice.minRpm.toFixed(0)} rpm on ice, under its ${spec.engine.idleRpm} rpm idle`,
    );
  }
});

// Drives a climb the car cannot get traction on and reports what the gearbox did.
function wheelspinClimb(specId, surfaceId, grade, seconds) {
  const world = slopedWorld(surfaceId, 0, grade);
  const car = createCar(specId, { preset: "arcade", assists: { tractionControl: 0 } });
  const input = makeInput();
  input.throttle = 1;
  let maxGear = car.gear;
  let maxSlip = 0;
  let maxKph = 0;
  const n = steps(seconds);
  for (let i = 0; i < n; i += 1) {
    stepCar(car, input, world, DT);
    maxGear = Math.max(maxGear, car.gear);
    maxKph = Math.max(maxKph, Math.abs(car.forwardSpeed) * KPH);
    for (const w of car.wheels) {
      if (Math.abs(w.driveTorque) > 1) maxSlip = Math.max(maxSlip, w.slipRatio);
    }
  }
  return { maxGear, maxSlip, maxKph, gear: car.gear };
}

test("the shift servo does not walk up the box on a spinning wheel", () => {
  // With the traction control off on an icy climb the driven wheels spin, and a
  // spinning wheel is what turns the engine — so engine rpm stops being a
  // statement about road speed. Keying the shift off it walked the box to sixth
  // at walking pace and left the car nothing to climb in.
  for (const spec of CARS) {
    const r = wheelspinClimb(spec.id, SURFACE.ICE, 0.088, 8);
    assert.ok(
      r.maxSlip > 2,
      `${spec.id} only reached ${r.maxSlip.toFixed(2)} slip ratio on an 8.8% ice climb`
      + " — without real wheelspin this test proves nothing",
    );
    assert.equal(
      r.maxGear, 1,
      `${spec.id} shifted up to gear ${r.maxGear} while spinning its wheels at ${r.maxKph.toFixed(1)} km/h`,
    );
  }
});

test("the shift servo still upshifts once the wheels are carrying the car", () => {
  // The other half of the same rule: refusing a shift under slip must not turn
  // into refusing to shift at all. On gravel every car has to work through the
  // box, and every shift has to land with the driven wheels hooked up.
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.GRAVEL);
    const car = driven(spec.id);
    const input = makeInput();
    input.throttle = 1;

    let previous = car.gear;
    let upshifts = 0;
    let worstShiftSlip = 0;
    const n = steps(30);
    for (let i = 0; i < n; i += 1) {
      let slip = 0;
      for (const w of car.wheels) {
        if (Math.abs(w.driveTorque) > 1) slip = Math.max(slip, w.slipRatio);
      }
      stepCar(car, input, world, DT);
      if (car.gear > previous) {
        upshifts += 1;
        worstShiftSlip = Math.max(worstShiftSlip, slip);
      }
      previous = car.gear;
    }
    assert.ok(
      upshifts >= spec.gearbox.ratios.length - 1,
      `${spec.id} made only ${upshifts} upshifts in 30 s flat out on gravel`,
    );
    assert.ok(
      worstShiftSlip < 1,
      `${spec.id} upshifted with a driven wheel at ${worstShiftSlip.toFixed(2)} slip ratio`,
    );
  }
});

// Peak crank power over mass: the one figure that says how hard a car should be
// able to launch, before lag, gearing and traction have their say.
function powerToWeight(spec) {
  return peakPowerW(spec) / spec.mass;
}

function launchKph(specId, seconds = 4) {
  const world = flatWorld(SURFACE.TARMAC);
  const car = driven(specId);
  const input = makeInput();
  input.throttle = 1;
  hold(car, input, world, seconds);
  return car.speed * KPH;
}

test("off the line the cars rank by power-to-weight, not against it", () => {
  // The measurement that found the bug: 4 s from rest at full throttle, the
  // 383 kW/t four-wheel-drive car was LAST of the eight, behind a 111 kW/t
  // front-drive hatchback, because the auto-clutch held it below its boost
  // threshold. Power-to-weight cannot dictate the order outright — lag and
  // traction legitimately reshuffle neighbours — but it must explain it.
  const cars = CARS.map((spec) => ({
    id: spec.id, drive: spec.drive, kph: launchKph(spec.id), pw: powerToWeight(spec),
  }));
  const byPw = [...cars].sort((a, b) => b.pw - a.pw);
  const byKph = [...cars].sort((a, b) => b.kph - a.kph);

  let d2 = 0;
  for (const c of cars) d2 += (byPw.indexOf(c) - byKph.indexOf(c)) ** 2;
  const n = cars.length;
  const rho = 1 - 6 * d2 / (n * (n * n - 1));
  assert.ok(
    rho > 0.70,
    `the 4 s launch order ranks against power-to-weight (Spearman ${rho.toFixed(3)}): `
    + byKph.map((c) => `${c.id} ${c.kph.toFixed(1)} km/h @ ${c.pw.toFixed(0)} kW/t`).join(", "),
  );

  // Four driven wheels put down roughly twice the tyre, so no two-wheel-drive car
  // in this catalogue may out-launch a four-wheel-drive one. This is the assertion
  // the original defect broke outright.
  const worst4wd = cars.filter((c) => c.drive === "4WD").reduce((a, b) => (b.kph < a.kph ? b : a));
  const best2wd = cars.filter((c) => c.drive !== "4WD").reduce((a, b) => (b.kph > a.kph ? b : a));
  assert.ok(
    worst4wd.kph > best2wd.kph * 1.25,
    `${worst4wd.id} (4WD) launched to ${worst4wd.kph.toFixed(1)} km/h against`
    + ` ${best2wd.id} (${best2wd.drive}) on ${best2wd.kph.toFixed(1)} km/h`,
  );

  // And no car may be beaten off the line by one with barely half its specific
  // power, whatever the layout.
  for (const a of cars) {
    for (const b of cars) {
      if (b.kph <= a.kph) continue;
      assert.ok(
        b.pw > a.pw * 0.55,
        `${b.id} (${b.pw.toFixed(0)} kW/t) out-launched ${a.id} (${a.pw.toFixed(0)} kW/t),`
        + ` ${b.kph.toFixed(1)} against ${a.kph.toFixed(1)} km/h`,
      );
    }
  }
});

// ---- braking -------------------------------------------------------------

function brakeFrom100(specId, surfaceId, tune) {
  const tarmac = flatWorld(SURFACE.TARMAC);
  const world = flatWorld(surfaceId);
  const car = driven(specId, tune ? { tune } : {});
  accelerateTo(car, tarmac, 100);

  // Hand the car over to the test surface and settle it at 100 km/h first, so the
  // stop is measured on that surface from end to end.
  const settle = makeInput();
  for (let i = 0; i < steps(0.5); i += 1) {
    settle.throttle = car.speed * KPH < 100 ? 0.3 : 0;
    stepCar(car, settle, world, DT);
  }

  const v0 = car.speed;
  const x0 = car.pos.x;
  const z0 = car.pos.z;
  const input = makeInput();
  input.brake = 1;
  let t = 0;
  while (car.speed > 0.6 && t < 60) { stepCar(car, input, world, DT); t += DT; }
  const distance = Math.hypot(car.pos.x - x0, car.pos.z - z0);
  return { v0, distance, time: t, g: v0 * v0 / (2 * distance) / G };
}

test("braking from 100 km/h stops in a distance the friction allows", () => {
  for (const spec of CARS) {
    const tarmac = brakeFrom100(spec.id, SURFACE.TARMAC);
    assert.ok(
      tarmac.distance > 30 && tarmac.distance < 58,
      `${spec.id} stopped from 100 km/h in ${tarmac.distance.toFixed(1)} m on tarmac`,
    );
    assert.ok(
      tarmac.g < 1.4,
      `${spec.id} braked at ${tarmac.g.toFixed(3)} g on tarmac — no tyre in this game can do that`,
    );
    assert.ok(tarmac.g > 0.6, `${spec.id} only managed ${tarmac.g.toFixed(3)} g on tarmac`);

    const gravel = brakeFrom100(spec.id, SURFACE.GRAVEL);
    assert.ok(
      gravel.distance > tarmac.distance,
      `${spec.id} stopped in ${gravel.distance.toFixed(1)} m on gravel against ${tarmac.distance.toFixed(1)} m on tarmac`,
    );
    assert.ok(
      gravel.g < 1.0,
      `${spec.id} braked at ${gravel.g.toFixed(3)} g on gravel — well beyond a loose surface`,
    );
  }
});

test("each looser surface lengthens the stop", () => {
  // Compound trims are neutralised here: a studded winter tyre legitimately stops
  // shorter on snow than on gravel, so leaving them in would test the tyre choice
  // rather than the surface table.
  const neutral = { "tyre.surfaceGrip": null };
  for (const spec of CARS) {
    const order = [SURFACE.TARMAC, SURFACE.GRAVEL, SURFACE.SNOW, SURFACE.ICE];
    const runs = order.map((s) => brakeFrom100(spec.id, s, neutral));
    for (let i = 1; i < runs.length; i += 1) {
      assert.ok(
        runs[i].distance > runs[i - 1].distance,
        `${spec.id} stopped in ${runs[i].distance.toFixed(1)} m on ${surfaceProps(order[i]).name}`
        + ` but ${runs[i - 1].distance.toFixed(1)} m on ${surfaceProps(order[i - 1]).name}`,
      );
    }
    assert.ok(
      runs[3].g < 0.3,
      `${spec.id} braked at ${runs[3].g.toFixed(3)} g on ice`,
    );
  }
});

// ---- cornering -----------------------------------------------------------

// A slow ramp of steering lock at a held speed: the quasi-steady way to find the
// limit without having to guess the angle that reaches it.
function rampSteer(specId, surfaceId, { target = 22, seconds = 24, tune } = {}) {
  const world = flatWorld(surfaceId);
  const car = driven(specId, tune ? { tune } : {});
  accelerateTo(car, world, target * KPH);

  const input = makeInput();
  let best = 0;
  const n = steps(seconds);
  for (let i = 0; i < n; i += 1) {
    input.steer = i / n;
    input.throttle = car.speed < target ? Math.min(0.6, (target - car.speed) * 0.5) : 0;
    input.brake = car.speed > target + 1 ? 0.15 : 0;
    stepCar(car, input, world, DT);
    // Past a big slip angle the car is spinning, not cornering.
    if (Math.abs(car.slipAngle) < 0.7 && Math.abs(car.lateralG) > best) best = Math.abs(car.lateralG);
  }
  return best;
}

test("skidpad lateral g is 0.9-1.3 on tarmac and falls with the surface", () => {
  const neutral = { tune: { "tyre.surfaceGrip": null } };
  for (const spec of CARS) {
    const tarmac = rampSteer(spec.id, SURFACE.TARMAC, neutral);
    const gravel = rampSteer(spec.id, SURFACE.GRAVEL, neutral);
    const snow = rampSteer(spec.id, SURFACE.SNOW, neutral);
    const ice = rampSteer(spec.id, SURFACE.ICE, neutral);

    assert.ok(
      tarmac >= 0.90 && tarmac <= 1.30,
      `${spec.id} held ${tarmac.toFixed(3)} g on a tarmac skidpad`,
    );
    // Gravel is allowed to come close to tarmac because the berm the tyre digs is
    // deliberate, but it may never beat it outright.
    assert.ok(
      gravel < tarmac * 1.10,
      `${spec.id} held ${gravel.toFixed(3)} g on gravel against ${tarmac.toFixed(3)} g on tarmac`,
    );
    assert.ok(snow < gravel, `${spec.id}: snow ${snow.toFixed(3)} g was not below gravel ${gravel.toFixed(3)} g`);
    assert.ok(ice < snow, `${spec.id}: ice ${ice.toFixed(3)} g was not below snow ${snow.toFixed(3)} g`);
    assert.ok(
      snow < tarmac * 0.68,
      `${spec.id} held ${snow.toFixed(3)} g on snow, ${(snow / tarmac * 100).toFixed(0)}% of its tarmac figure`,
    );
    assert.ok(
      ice < tarmac * 0.33,
      `${spec.id} held ${ice.toFixed(3)} g on ice, ${(ice / tarmac * 100).toFixed(0)}% of its tarmac figure`,
    );
  }
});

// ---- the tyre itself -----------------------------------------------------

// Pins the chassis at a fixed body slip angle with the wheels rolling freely, so
// what comes back is the tyre's own lateral curve rather than a chassis balance.
function tyreProbe(specId, surfaceId, beta, { speed = 22, neutral = true } = {}) {
  const world = flatWorld(surfaceId);
  const car = createCar(specId, {
    assists: { autoShift: true, autoClutch: true },
    tune: neutral ? { "tyre.surfaceGrip": null } : undefined,
  });
  const vx = speed * Math.sin(beta);
  const vz = speed * Math.cos(beta);
  const y = car.pos.y;
  const rolling = speed * Math.cos(beta) / car.setup.wheelRadius;
  const input = makeInput();
  for (let i = 0; i < steps(3); i += 1) {
    car.pos.x = 0; car.pos.y = y; car.pos.z = 0;
    car.vel.x = vx; car.vel.y = 0; car.vel.z = vz;
    car.omega.x = 0; car.omega.y = 0; car.omega.z = 0;
    car.quat.x = 0; car.quat.y = 0; car.quat.z = 0; car.quat.w = 1;
    for (const w of car.wheels) w.spinRate = rolling;
    stepCar(car, input, world, DT);
  }
  let fy = 0;
  let load = 0;
  for (const w of car.wheels) { fy += w.fy; load += w.load; }
  return -fy / load;
}

const PROBE_BETAS = [0.02, 0.04, 0.06, 0.08, 0.10, 0.13, 0.16, 0.20, 0.25, 0.31, 0.38, 0.47, 0.58, 0.72, 0.90];

function lateralCurve(specId, surfaceId, neutral = true) {
  const points = PROBE_BETAS.map((beta) => ({ beta, mu: tyreProbe(specId, surfaceId, beta, { neutral }) }));
  const peak = points.reduce((a, b) => (b.mu > a.mu ? b : a));
  return { points, peak, at: (beta) => points.find((p) => p.beta === beta).mu };
}

test("peak lateral grip follows the surface table", () => {
  const order = [SURFACE.TARMAC, SURFACE.GRAVEL, SURFACE.SNOW, SURFACE.ICE];
  const tarmacProps = surfaceProps(SURFACE.TARMAC);
  for (const spec of CARS) {
    const peaks = order.map((s) => lateralCurve(spec.id, s).peak.mu);
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(
        peaks[i] < peaks[i - 1],
        `${spec.id}: peak lateral mu ${peaks[i].toFixed(3)} on ${surfaceProps(order[i]).name}`
        + ` is not below ${peaks[i - 1].toFixed(3)} on ${surfaceProps(order[i - 1]).name}`,
      );
      // And the size of each drop must track surfaces.js, not just its sign. The
      // slack allows the loose-surface bonus, which lifts gravel and snow a little.
      const expected = surfaceProps(order[i]).gripLat / tarmacProps.gripLat;
      const measured = peaks[i] / peaks[0];
      assert.ok(
        measured > expected * 0.9 && measured < expected * 1.35,
        `${spec.id}: ${surfaceProps(order[i]).name} gave ${(measured * 100).toFixed(0)}% of tarmac grip`
        + ` where surfaces.js asks for ${(expected * 100).toFixed(0)}%`,
      );
    }
  }
});

test("a loose surface holds its lateral force past the peak; tarmac does not", () => {
  for (const id of ["corvine-rs2000", "vireo-r2", "falke-4s"]) {
    const tarmac = lateralCurve(id, SURFACE.TARMAC);
    const gravel = lateralCurve(id, SURFACE.GRAVEL);

    // The peak arrives far later on gravel — that is the angle a rally driver lives at.
    assert.ok(
      gravel.peak.beta >= tarmac.peak.beta * 2,
      `${id}: gravel peaked at ${gravel.peak.beta} rad against ${tarmac.peak.beta} rad on tarmac`,
    );

    const tarmacTail = tarmac.at(0.90) / tarmac.peak.mu;
    const gravelTail = gravel.at(0.90) / gravel.peak.mu;
    assert.ok(
      tarmacTail < 0.85,
      `${id}: tarmac still held ${(tarmacTail * 100).toFixed(1)}% of peak at 0.9 rad — it should fall away`,
    );
    assert.ok(
      gravelTail > 0.90,
      `${id}: gravel held only ${(gravelTail * 100).toFixed(1)}% of peak at 0.9 rad — the dig-in is missing`,
    );
    assert.ok(
      gravelTail > tarmacTail + 0.10,
      `${id}: gravel retention ${(gravelTail * 100).toFixed(1)}% is not clearly above tarmac's ${(tarmacTail * 100).toFixed(1)}%`,
    );

    // The sharpest statement of the same thing, and the one that survives a change
    // to the peak: sideways at 0.9 rad, gravel is still pulling harder than it was
    // at the angle tarmac peaks at. The loose layer does not just soften the
    // falloff, it removes it.
    const recovery = gravel.at(0.90) / gravel.at(tarmac.peak.beta);
    assert.ok(
      recovery > 1.02,
      `${id}: gravel made ${(recovery * 100).toFixed(1)}% at 0.9 rad of what it made at ${tarmac.peak.beta} rad`
      + " — the curve is falling away instead of digging in",
    );

    // Past its peak, tarmac must fall monotonically — no phantom recovery.
    const past = tarmac.points.filter((p) => p.beta > tarmac.peak.beta);
    for (let i = 1; i < past.length; i += 1) {
      assert.ok(
        past[i].mu < past[i - 1].mu,
        `${id}: tarmac lateral mu rose from ${past[i - 1].mu.toFixed(3)} at ${past[i - 1].beta} rad`
        + ` to ${past[i].mu.toFixed(3)} at ${past[i].beta} rad`,
      );
    }
  }
});

// How far the car rolls before a stepped slip angle has built 63% of its force.
// The chassis is pinned so the answer is the tyre's relaxation, not the springs.
function relaxationDistance(specId, speed, beta = 0.10) {
  // A finer step than the rest of the file: at 36 m/s a 1/120 s step already
  // covers most of a 0.4 m relaxation length, and the answer would be quantised.
  const dt = 1 / 960;
  const world = flatWorld(SURFACE.TARMAC);
  const car = createCar(specId, { assists: { autoShift: true, autoClutch: true } });
  const vx = speed * Math.sin(beta);
  const vz = speed * Math.cos(beta);
  const y = car.pos.y;
  const rolling = speed * Math.cos(beta) / car.setup.wheelRadius;
  const input = makeInput();
  const target = 0.63 * beta;
  let previous = 0;
  for (let i = 0; i < Math.round(4 / dt); i += 1) {
    car.pos.x = 0; car.pos.y = y; car.pos.z = 0;
    car.vel.x = vx; car.vel.y = 0; car.vel.z = vz;
    car.omega.x = 0; car.omega.y = 0; car.omega.z = 0;
    car.quat.x = 0; car.quat.y = 0; car.quat.z = 0; car.quat.w = 1;
    for (const w of car.wheels) w.spinRate = rolling;
    stepCar(car, input, world, dt);
    const now = Math.abs(car.wheels[2].slipAngle);
    if (now >= target) {
      const frac = (target - previous) / (now - previous);
      return (i + frac) * dt * speed;
    }
    previous = now;
  }
  return Infinity;
}

test("lateral force builds over distance rolled, not over time", () => {
  for (const id of ["corvine-rs2000", "astra-corsa", "brackmoor-t8"]) {
    const spec = carSpec(id);
    const slow = relaxationDistance(id, 12);
    const fast = relaxationDistance(id, 36);
    for (const [label, d] of [["12 m/s", slow], ["36 m/s", fast]]) {
      assert.ok(
        d > spec.tyre.relaxLength * 0.6 && d < spec.tyre.relaxLength * 2.2,
        `${id} at ${label} built 63% of its slip angle over ${d.toFixed(3)} m,`
        + ` nowhere near its ${spec.tyre.relaxLength} m relaxation length`,
      );
    }
    // Tripling the speed must not change the distance — that is what makes it a
    // relaxation length rather than a time constant.
    const ratio = fast / slow;
    assert.ok(
      ratio > 0.7 && ratio < 1.4,
      `${id} took ${slow.toFixed(3)} m to build force at 12 m/s but ${fast.toFixed(3)} m at 36 m/s`,
    );
  }
});

test("the friction ellipse is never exceeded", () => {
  let worstEllipse = 0;
  let worstCircle = 0;
  let sawTheLimit = false;
  for (const spec of CARS) {
    for (const surfaceId of [SURFACE.TARMAC, SURFACE.GRAVEL, SURFACE.SNOW]) {
      const world = flatWorld(surfaceId);
      const car = driven(spec.id, { assists: { autoShift: true, autoClutch: true, abs: false } });
      accelerateTo(car, world, 108);
      const input = makeInput();
      for (let i = 0; i < steps(6); i += 1) {
        input.brake = 0.4 + 0.6 * Math.abs(Math.sin(i * DT * 1.7));
        input.steer = Math.sin(i * DT * 0.9);
        stepCar(car, input, world, DT);
        for (const w of car.wheels) {
          if (!w.contact || w.load <= 0) continue;
          const ellipse = Math.hypot(w.fx / (w.muLong * w.load), w.fy / (w.muLat * w.load));
          const circle = Math.hypot(w.fx, w.fy) / (Math.max(w.muLong, w.muLat) * w.load);
          if (ellipse > worstEllipse) worstEllipse = ellipse;
          if (circle > worstCircle) worstCircle = circle;
          if (ellipse > 0.98) sawTheLimit = true;
        }
      }
    }
  }
  assert.ok(sawTheLimit, "combined braking and cornering never reached the friction limit — the test proves nothing");
  assert.ok(
    worstEllipse <= 1 + 1e-9,
    `a tyre used ${worstEllipse.toFixed(9)} of its friction ellipse`,
  );
  assert.ok(
    worstCircle <= 1 + 1e-9,
    `a tyre produced ${worstCircle.toFixed(9)} x mu x load of force`,
  );
});

// ---- weight transfer -----------------------------------------------------

// Steady-state axle load under a held brake or throttle, with the aerodynamic
// downforce and the rolling drag separated out so what is left is the pitch
// couple: the longitudinal force at the contact patches times h / L.
function loadTransfer(specId, mode, tune) {
  const world = flatWorld(SURFACE.TARMAC);
  const car = driven(specId, tune ? { tune } : {});
  const setup = car.setup;
  accelerateTo(car, world, mode === "brake" ? 62 : 35);

  const input = makeInput();
  if (mode === "brake") input.brake = 0.45; else input.throttle = 1;
  const span = mode === "brake" ? 1.2 : 2.0;

  let front = 0;
  let rear = 0;
  let fx = 0;
  let rolling = 0;
  let q = 0;
  let n = 0;
  const total = steps(span);
  const sampleFrom = steps(span - 0.4);
  for (let i = 0; i < total; i += 1) {
    stepCar(car, input, world, DT);
    if (i < sampleFrom) continue;
    front += axleLoad(car, true);
    rear += axleLoad(car, false);
    fx += sumFx(car);
    for (const w of car.wheels) rolling += surfaceProps(w.surfaceId).rollingResistance * w.load;
    q += 0.5 * RHO * (car.vel.x ** 2 + car.vel.y ** 2 + car.vel.z ** 2);
    n += 1;
  }
  front /= n; rear /= n; fx /= n; rolling /= n; q /= n;

  const staticFront = setup.mass * G * setup.weightDistFront;
  const staticRear = setup.mass * G * (1 - setup.weightDistFront);
  // Downforce applied at the CoM plus its own pitch couple lands exactly q*liftFront
  // on the front axle; rolling drag pushes back at the patches like any other
  // longitudinal force, so it belongs inside the couple.
  const couple = (fx - rolling) * setup.comHeight / setup.wheelbase;
  return {
    front, rear, fx,
    staticFront, staticRear,
    predictedFront: staticFront + q * setup.aero.liftFront - couple,
    predictedRear: staticRear + q * setup.aero.liftRear + couple,
    transfer: front - staticFront,
  };
}

test("weight transfer is what the CoM height and wheelbase predict", () => {
  for (const spec of CARS) {
    const braking = loadTransfer(spec.id, "brake");
    assert.ok(
      braking.transfer > 0.10 * braking.staticFront,
      `${spec.id} moved only ${braking.transfer.toFixed(0)} N onto the front axle under braking`,
    );
    assert.ok(
      Math.abs(braking.front - braking.predictedFront) < 0.15 * Math.abs(braking.transfer),
      `${spec.id} braking front load ${braking.front.toFixed(0)} N against ${braking.predictedFront.toFixed(0)} N predicted`
      + ` (transfer ${braking.transfer.toFixed(0)} N, ${(Math.abs(braking.front - braking.predictedFront) / Math.abs(braking.transfer) * 100).toFixed(1)}% out)`,
    );
    assert.ok(
      Math.abs(braking.rear - braking.predictedRear) < 0.15 * Math.abs(braking.transfer),
      `${spec.id} braking rear load ${braking.rear.toFixed(0)} N against ${braking.predictedRear.toFixed(0)} N predicted`,
    );

    const power = loadTransfer(spec.id, "accel");
    assert.ok(
      power.transfer < -0.05 * power.staticFront,
      `${spec.id} shed only ${(-power.transfer).toFixed(0)} N from the front axle under power`,
    );
    assert.ok(
      Math.abs(power.front - power.predictedFront) < 0.15 * Math.abs(power.transfer),
      `${spec.id} power-on front load ${power.front.toFixed(0)} N against ${power.predictedFront.toFixed(0)} N predicted`
      + ` (transfer ${power.transfer.toFixed(0)} N, ${(Math.abs(power.front - power.predictedFront) / Math.abs(power.transfer) * 100).toFixed(1)}% out)`,
    );
  }
});

test("halving the CoM height halves the transfer", () => {
  for (const spec of CARS) {
    const tall = loadTransfer(spec.id, "brake");
    const low = loadTransfer(spec.id, "brake", { comHeight: spec.comHeight * 0.5 });
    const ratio = low.transfer / tall.transfer;
    assert.ok(
      ratio > 0.38 && ratio < 0.62,
      `${spec.id}: halving the CoM height moved the transfer from ${tall.transfer.toFixed(0)} N`
      + ` to ${low.transfer.toFixed(0)} N (ratio ${ratio.toFixed(3)}, expected about 0.5)`,
    );
  }
});

// ---- drivetrain layout ---------------------------------------------------

// Settles a steady gravel corner, then asks for full throttle and reports what
// the layout did with it.
function powerOn(specId) {
  const world = flatWorld(SURFACE.GRAVEL);
  const car = driven(specId, { assists: { autoShift: true, autoClutch: true } });
  accelerateTo(car, world, 18 * KPH);

  const input = makeInput();
  input.steer = 0.45;
  for (let i = 0; i < steps(3); i += 1) {
    input.throttle = car.speed < 18 ? 0.3 : 0.1;
    stepCar(car, input, world, DT);
  }
  const before = { slip: car.slipAngle, curvature: car.yawRate / Math.max(car.speed, 1) };
  input.throttle = 1;
  hold(car, input, world, 1.2);
  return {
    drive: car.setup.drive,
    slipBefore: before.slip,
    slipAfter: car.slipAngle,
    curvatureGain: (car.yawRate / Math.max(car.speed, 1)) / before.curvature - 1,
  };
}

test("front, rear and four-wheel drive answer power-on differently", () => {
  const fwd = powerOn("vireo-r2");
  const rwd = powerOn("brackmoor-t8");
  const awd = powerOn("corvine-rs2000");
  assert.equal(fwd.drive, "FWD");
  assert.equal(rwd.drive, "RWD");
  assert.equal(awd.drive, "4WD");

  // Power-on slip angle: the front-driven car pulls itself straight, the
  // rear-driven car swings, the four-wheel-drive car sits between them. What is
  // measured is the slip the THROTTLE added, not the absolute figure: the latter
  // also counts however sideways the car happened to arrive, which made the old
  // bound a statement about the entry rather than about the drivetrain.
  assert.ok(
    Math.abs(fwd.slipAfter) < 0.10,
    `FWD slid to ${fwd.slipAfter.toFixed(3)} rad on power — a front-driven car should tighten up, not swing`,
  );
  const rwdSwing = Math.abs(rwd.slipAfter) - Math.abs(rwd.slipBefore);
  assert.ok(
    rwdSwing > 0.40,
    `full throttle added only ${rwdSwing.toFixed(3)} rad of slip to the RWD car`
    + ` (${rwd.slipBefore.toFixed(3)} -> ${rwd.slipAfter.toFixed(3)} rad)`,
  );
  assert.ok(
    Math.abs(rwd.slipAfter) > 0.45,
    `RWD only reached ${rwd.slipAfter.toFixed(3)} rad of slip on power`,
  );
  assert.ok(
    Math.abs(awd.slipAfter) > Math.abs(fwd.slipAfter) && Math.abs(awd.slipAfter) < Math.abs(rwd.slipAfter),
    `4WD slip ${awd.slipAfter.toFixed(3)} rad does not sit between FWD ${fwd.slipAfter.toFixed(3)}`
    + ` and RWD ${rwd.slipAfter.toFixed(3)}`,
  );

  // And the line each one takes: the front-driven car runs wide, the rear-driven
  // car tightens hard.
  assert.ok(
    fwd.curvatureGain < 0.10,
    `FWD tightened its line by ${(fwd.curvatureGain * 100).toFixed(1)}% on power — it should run wide`,
  );
  assert.ok(
    rwd.curvatureGain > 0.40,
    `RWD tightened its line by only ${(rwd.curvatureGain * 100).toFixed(1)}% on power`,
  );
});

// ---- airborne ------------------------------------------------------------

test("with no wheel in contact there is no tyre force", () => {
  const world = flatWorld(SURFACE.TARMAC, -60);
  const car = driven("corvine-rs2000");
  car.vel.z = 30;
  car.vel.y = 6;
  const input = makeInput();
  input.throttle = 1;
  input.brake = 1;
  input.steer = 1;
  for (let i = 0; i < steps(1.5); i += 1) {
    stepCar(car, input, world, DT);
    assert.equal(car.onGround, 0, `a car 60 m above the ground reported ${car.onGround} wheels in contact`);
    for (const w of car.wheels) {
      assert.equal(w.fx, 0, `wheel ${w.index} made ${w.fx.toFixed(1)} N of longitudinal force in mid-air`);
      assert.equal(w.fy, 0, `wheel ${w.index} made ${w.fy.toFixed(1)} N of lateral force in mid-air`);
      assert.equal(w.load, 0, `wheel ${w.index} carried ${w.load.toFixed(1)} N in mid-air`);
      assert.equal(w.gripUsed, 0, `wheel ${w.index} reported ${w.gripUsed.toFixed(3)} grip used in mid-air`);
    }
  }
  assert.ok(car.airTime > 1.4, `airTime only reached ${car.airTime.toFixed(2)} s over a 1.5 s flight`);
});

test("in-air steering has some authority but not much", () => {
  const world = flatWorld(SURFACE.TARMAC, -60);
  const straight = driven("corvine-rs2000");
  const turned = driven("corvine-rs2000");
  straight.vel.z = 35;
  turned.vel.z = 35;
  const idle = makeInput();
  const steered = makeInput();
  steered.steer = 1;
  const yaw0 = turned.yaw;
  hold(straight, idle, world, 1);
  hold(turned, steered, world, 1);

  assert.ok(
    Math.abs(straight.yaw) < 1e-9,
    `an unsteered car yawed ${straight.yaw.toFixed(6)} rad in a second of flight`,
  );
  const yawed = Math.abs(turned.yaw - yaw0);
  assert.ok(
    yawed > 0.02,
    `full lock in the air moved the nose only ${yawed.toFixed(4)} rad in a second — the driver cannot aim a landing`,
  );
  assert.ok(
    yawed < 0.6,
    `full lock in the air moved the nose ${yawed.toFixed(4)} rad in a second — the car is flying, not falling`,
  );
});

test("a launched car lands on its wheels without tumbling", () => {
  const world = flatWorld(SURFACE.TARMAC, 0);
  const car = driven("corvine-rs2000");
  accelerateTo(car, world, 30 * KPH);
  car.pos.y += 3;
  car.vel.y = 5;

  const input = makeInput();
  input.throttle = 0.2;
  let maxAir = 0;
  let maxRoll = 0;
  for (let i = 0; i < steps(6); i += 1) {
    stepCar(car, input, world, DT);
    maxAir = Math.max(maxAir, car.airTime);
    maxRoll = Math.max(maxRoll, Math.abs(car.roll));
    assert.equal(car.rolledOver, false, `the car rolled over ${(i * DT).toFixed(2)} s into a straight-line jump`);
  }
  assert.ok(maxAir > 0.8, `a 3 m launch gave only ${maxAir.toFixed(2)} s of air`);
  assert.ok(maxRoll < 0.15, `a straight-line landing rolled the car to ${maxRoll.toFixed(3)} rad`);
  assert.equal(car.onGround, 4, `the car settled on ${car.onGround} wheels`);
  assert.ok(car.speed > 20, `the landing cost too much speed: ${(car.speed * KPH).toFixed(1)} km/h`);
});

// ---- energy --------------------------------------------------------------

test("coasting on the flat only ever loses speed", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    accelerateTo(car, world, 130);

    const input = makeInput();
    input.clutch = 1;   // a true coast: the driveline's stored spin is not part of the question
    hold(car, input, world, 1);

    let previous = car.speed;
    for (let i = 0; i < steps(20); i += 1) {
      stepCar(car, input, world, DT);
      assert.ok(
        car.speed < previous,
        `${spec.id} gained ${(car.speed - previous).toExponential(2)} m/s while coasting`
        + ` at ${(car.speed * KPH).toFixed(1)} km/h, ${(i * DT).toFixed(2)} s in`,
      );
      previous = car.speed;
    }
  }
});

test("coast-down deceleration matches the drag and rolling losses", () => {
  for (const spec of CARS) {
    const world = flatWorld(SURFACE.TARMAC);
    const car = driven(spec.id);
    accelerateTo(car, world, 126);

    const input = makeInput();
    input.clutch = 1;
    hold(car, input, world, 1.5);

    const v0 = car.speed;
    hold(car, input, world, 2);
    const decel = (v0 - car.speed) / 2;
    const v = (v0 + car.speed) / 2;
    const q = 0.5 * RHO * v * v;
    const downforce = spec.mass * G + q * (spec.aero.liftFront + spec.aero.liftRear);
    const predicted = (q * spec.aero.dragArea + surfaceProps(SURFACE.TARMAC).rollingResistance * downforce) / spec.mass;
    const ratio = decel / predicted;
    assert.ok(
      ratio > 0.85 && ratio < 1.10,
      `${spec.id} coasted down at ${decel.toFixed(4)} m/s^2 at ${v.toFixed(1)} m/s`
      + ` against ${predicted.toFixed(4)} m/s^2 from drag and rolling resistance (ratio ${ratio.toFixed(3)})`,
    );
  }
});

// ---- determinism and robustness -----------------------------------------

function snapshot(car) {
  const out = {
    "pos.x": car.pos.x, "pos.y": car.pos.y, "pos.z": car.pos.z,
    "vel.x": car.vel.x, "vel.y": car.vel.y, "vel.z": car.vel.z,
    "quat.x": car.quat.x, "quat.y": car.quat.y, "quat.z": car.quat.z, "quat.w": car.quat.w,
    "omega.x": car.omega.x, "omega.y": car.omega.y, "omega.z": car.omega.z,
    yaw: car.yaw, pitch: car.pitch, roll: car.roll,
    speed: car.speed, forwardSpeed: car.forwardSpeed, lateralSpeed: car.lateralSpeed,
    slipAngle: car.slipAngle, lateralG: car.lateralG, longitudinalG: car.longitudinalG,
    verticalG: car.verticalG, engineOmega: car.engineOmega, engineRpm: car.engineRpm,
    turboBoost: car.turboBoost, turboSpool: car.turboSpool, gear: car.gear,
    gearShiftTimer: car.gearShiftTimer, clutchEngage: car.clutchEngage,
    // Both halves of brake-to-reverse. Without them here, resetCar could stop
    // clearing autoReverse and every test would still pass: the R-key recovery
    // would leave the mode armed with the gear back at 1, so the next manual
    // reverse would silently swap the pedals under the driver.
    autoReverse: car.autoReverse, reverseDwell: car.reverseDwell,
    airTime: car.airTime, onGround: car.onGround,
    odometer: car.odometer, distanceTravelled: car.distanceTravelled, time: car.time,
  };
  for (const w of car.wheels) {
    const k = `w${w.index}.`;
    out[`${k}load`] = w.load;
    out[`${k}fx`] = w.fx;
    out[`${k}fy`] = w.fy;
    out[`${k}spinRate`] = w.spinRate;
    out[`${k}slipRatio`] = w.slipRatio;
    out[`${k}slipAngle`] = w.slipAngle;
    out[`${k}compression`] = w.compression;
    out[`${k}strutLength`] = w.strutLength;
    out[`${k}temperature`] = w.temperature;
    out[`${k}steerAngle`] = w.steerAngle;
    out[`${k}wear`] = w.wear;
  }
  return out;
}

// resetCar puts the car back on its wheels; it is also what recoverCar calls
// mid-stage, so the counters that measure a career rather than a state — distance,
// clock, tyre wear — are meant to survive it.
const CUMULATIVE = ["odometer", "distanceTravelled", "time", "w0.wear", "w1.wear", "w2.wear", "w3.wear"];

function inputSequence(count) {
  const seq = [];
  for (let i = 0; i < count; i += 1) {
    seq.push({
      steer: Math.sin(i * 0.013) * 0.9,
      throttle: 0.5 + 0.5 * Math.sin(i * 0.007),
      brake: i % 600 < 60 ? 0.8 : 0,
      handbrake: i % 900 < 30 ? 1 : 0,
      clutch: 0,
      shiftUp: false,
      shiftDown: false,
      gear: null,
    });
  }
  return seq;
}

test("identical inputs give bit-identical trajectories", () => {
  const sequence = inputSequence(6000);
  const drive = (yaw) => {
    const world = flatWorld(SURFACE.GRAVEL);
    const car = driven("corvine-rs2000", { yaw });
    const input = makeInput();
    for (const frame of sequence) {
      Object.assign(input, frame);
      stepCar(car, input, world, DT);
    }
    return car;
  };

  const a = snapshot(drive(0));
  const b = snapshot(drive(0));
  for (const key of Object.keys(a)) {
    assert.ok(Object.is(a[key], b[key]), `${key} diverged: ${a[key]} vs ${b[key]} after ${sequence.length} steps`);
  }
  assert.ok(a.odometer > 200, `the run covered only ${a.odometer.toFixed(1)} m, so the comparison proves nothing`);

  // The comparison has to be able to fail: a different start must not land here.
  const c = snapshot(drive(1e-3));
  assert.ok(
    Object.keys(a).some((key) => !Object.is(a[key], c[key])),
    "a car started at a different heading produced an identical trajectory",
  );
});

test("extreme and contradictory inputs never produce a non-finite number", () => {
  const worlds = [
    flatWorld(SURFACE.TARMAC),
    flatWorld(SURFACE.ICE),
    flatWorld(SURFACE.MUD),
    flatWorld(SURFACE.TARMAC, -1000),   // zero load: nothing under the wheels at all
  ];
  for (const spec of CARS) {
    const car = driven(spec.id);
    const input = makeInput();
    for (let i = 0; i < 8000; i += 1) {
      input.steer = i % 7 < 3 ? 1 : -1;
      input.throttle = 1;
      input.brake = i % 5 < 2 ? 1 : 0;          // throttle and brake together
      input.handbrake = i % 11 < 2 ? 1 : 0;
      input.clutch = i % 13 < 2 ? 1 : 0;
      input.gear = i % 400 === 0 ? -1 : null;   // reverse at speed
      stepCar(car, input, worlds[Math.floor(i / 2000)], DT);
      if (i === 2000) { car.vel.z = -70; }                      // 250 km/h backwards
      if (i === 4000) { car.quat.x = 1; car.quat.w = 0; }       // upside down
      if (i === 6000) { car.vel.x = 69; car.vel.z = 69; }       // full lock at 350 km/h
    }
    for (const [name, value] of Object.entries({
      "pos.x": car.pos.x, "pos.y": car.pos.y, "pos.z": car.pos.z,
      "vel.x": car.vel.x, "vel.y": car.vel.y, "vel.z": car.vel.z,
      "quat.x": car.quat.x, "quat.y": car.quat.y, "quat.z": car.quat.z, "quat.w": car.quat.w,
      yaw: car.yaw, pitch: car.pitch, roll: car.roll,
      yawRate: car.yawRate, pitchRate: car.pitchRate, rollRate: car.rollRate,
      speed: car.speed, forwardSpeed: car.forwardSpeed, lateralSpeed: car.lateralSpeed,
      slipAngle: car.slipAngle, lateralG: car.lateralG, longitudinalG: car.longitudinalG,
      verticalG: car.verticalG, engineRpm: car.engineRpm, engineLoad: car.engineLoad,
      turboBoost: car.turboBoost, turboSpool: car.turboSpool, gear: car.gear,
      gearShiftTimer: car.gearShiftTimer, clutchEngage: car.clutchEngage,
      odometer: car.odometer, airTime: car.airTime,
    })) {
      assert.ok(Number.isFinite(value), `${spec.id}: CarState.${name} is ${value}`);
    }
    for (const w of car.wheels) {
      for (const [name, value] of Object.entries({
        load: w.load, suspensionForce: w.suspensionForce, compression: w.compression,
        strutLength: w.strutLength, steerAngle: w.steerAngle, spinRate: w.spinRate,
        slipRatio: w.slipRatio, slipAngle: w.slipAngle, slipSpeed: w.slipSpeed,
        fx: w.fx, fy: w.fy, muLong: w.muLong, muLat: w.muLat, gripUsed: w.gripUsed,
        temperature: w.temperature, wear: w.wear, dustRate: w.dustRate,
        "worldPos.x": w.worldPos.x, "worldPos.y": w.worldPos.y, "worldPos.z": w.worldPos.z,
      })) {
        assert.ok(Number.isFinite(value), `${spec.id}: wheel ${w.index}.${name} is ${value}`);
      }
    }
  }
});

test("resetCar clears the dynamic state and keeps the counters", () => {
  const world = flatWorld(SURFACE.GRAVEL);
  const car = driven("falke-4s");
  const fresh = snapshot(driven("falke-4s"));
  const input = makeInput();
  input.throttle = 1;
  hold(car, input, world, 8);
  input.steer = 0.3;
  hold(car, input, world, 4);

  const moving = snapshot(car);
  assert.ok(
    moving.speed > 5 && Math.abs(moving.yaw) > 0.5 && moving.odometer > 100,
    `the car barely moved (${moving.speed.toFixed(1)} m/s, ${moving.yaw.toFixed(2)} rad,`
    + ` ${moving.odometer.toFixed(0)} m), so the reset proves little`,
  );

  // Arm brake-to-reverse before resetting. Without this the mode's two fields
  // are false on both sides of the comparison, so resetCar could stop clearing
  // them and nothing here would notice — and the failure that lets through is
  // real: R-key recovery mid-reverse would leave the mode armed with the gear
  // back at 1, and the driver's next manual reverse would swap his pedals.
  input.steer = 0;
  input.throttle = 0;
  input.brake = 1;
  hold(car, input, world, 8);
  assert.ok(
    car.autoReverse && car.gear < 0,
    `the car never entered auto-reverse (gear ${car.gear}, autoReverse ${car.autoReverse}),`
    + " so this test proves nothing about clearing it",
  );

  const driven8s = snapshot(car);

  resetCar(car, 0, 0, 0, 0);
  const after = snapshot(car);
  for (const key of Object.keys(fresh)) {
    if (CUMULATIVE.includes(key)) continue;
    assert.ok(Object.is(after[key], fresh[key]), `${key} survived resetCar: ${after[key]} vs ${fresh[key]} on a fresh car`);
  }
  for (const key of CUMULATIVE) {
    assert.ok(Object.is(after[key], driven8s[key]), `${key} was cleared by resetCar: ${driven8s[key]} -> ${after[key]}`);
  }
  assert.ok(after.odometer > 100, `the odometer read ${after.odometer.toFixed(1)} m after 8 s flat out`);
});

test("carTelemetry reports the state without allocating a new object", () => {
  const world = flatWorld(SURFACE.GRAVEL);
  const car = driven("ardent-r1");
  accelerateTo(car, world, 90);
  const first = carTelemetry(car);
  const second = carTelemetry(car);
  assert.equal(first, second, "carTelemetry allocated a fresh object on the second call");
  assert.ok(Math.abs(first.speedKph - car.speed * KPH) < 1e-9, `telemetry speed ${first.speedKph} vs ${car.speed * KPH}`);
  assert.equal(first.gear, car.gear);
  assert.equal(first.rpm, car.engineRpm);
  for (let i = 0; i < 4; i += 1) assert.equal(first.load[i], car.wheels[i].load);
});

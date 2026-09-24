import test from 'node:test';
import assert from 'node:assert/strict';
import { CAIRN_R4, LUMEN_F2 } from '../src/content.js';
import {
  aeroDownforceN,
  axleGripCapacity,
  axleInertiaKg,
  axleLoads,
  combinedSlipForces,
  combinedTyreForces,
  drivenAxleShares,
  interpolateTorque,
  lateralLoadTransfer,
  relaxTyreState,
  slipCurve,
  slipStiffness,
  stepPowertrain,
  stepWheelSpeed,
  tyreLongitudinalForce
} from '../src/dynamics.js';

test('torque interpolation follows the authored curve without extrapolated spikes', () => {
  assert.equal(interpolateTorque(CAIRN_R4.torqueCurve, 950), CAIRN_R4.torqueCurve[0][1]);
  assert.equal(interpolateTorque(CAIRN_R4.torqueCurve, 9000), CAIRN_R4.torqueCurve.at(-1)[1]);
  const [a, b] = CAIRN_R4.torqueCurve;
  assert.equal(interpolateTorque(CAIRN_R4.torqueCurve, (a[0] + b[0]) / 2), (a[1] + b[1]) / 2);
});

test('axle loads conserve weight and move forward under braking', () => {
  const staticLoads = axleLoads(CAIRN_R4, 0);
  const brakingLoads = axleLoads(CAIRN_R4, -7);
  const weight = CAIRN_R4.massKg * 9.81;
  assert.ok(Math.abs(staticLoads.front + staticLoads.rear - weight) < 1e-9);
  assert.ok(Math.abs(brakingLoads.front + brakingLoads.rear - weight) < 1e-9);
  assert.ok(brakingLoads.front > staticLoads.front);
  assert.ok(brakingLoads.rear < staticLoads.rear);
  assert.ok(brakingLoads.front > 0 && brakingLoads.rear > 0);
});

test('driven axle shares distinguish front, rear, and all-wheel drive', () => {
  assert.deepEqual(drivenAxleShares('fwd'), { front: 1, rear: 0 });
  assert.deepEqual(drivenAxleShares('rwd'), { front: 0, rear: 1 });
  assert.deepEqual(drivenAxleShares('awd'), { front: 0.5, rear: 0.5 });
});

test('combined tyre forces obey each friction circle', () => {
  const capacity = { front: 5200, rear: 4800 };
  const forces = combinedTyreForces({ front: 5000, rear: 4500 }, { front: 3900, rear: -3100 }, capacity);
  for (const axle of ['front', 'rear']) {
    assert.ok(Math.hypot(forces.longitudinal[axle], forces.lateral[axle]) <= capacity[axle] + 1e-9);
  }
  assert.ok(Math.abs(forces.lateral.front) < 5000);
  assert.ok(Math.abs(forces.lateral.rear) < 4500);
});

test('authored gearing produces shifts, interruption, and distinct engine character', () => {
  let state = { gear: 1, rpm: 1500, shiftRemaining: 0 };
  const first = stepPowertrain(state, { speedMps: 23, throttle: 1, shiftUp: false, shiftDown: false }, CAIRN_R4, 1 / 120, { automatic: true });
  assert.equal(first.gear, 2);
  assert.ok(first.shiftRemaining > 0);
  assert.equal(first.driveForceN, 0);
  for (let i = 0; i < 40; i += 1) state = stepPowertrain(i === 0 ? first : state, { speedMps: 23, throttle: 1 }, CAIRN_R4, 1 / 120, { automatic: true });
  assert.ok(state.driveForceN > 0);
  const lumen = stepPowertrain({ gear: 2, rpm: 3000, shiftRemaining: 0 }, { speedMps: 18, throttle: 1 }, LUMEN_F2, 1 / 120, { automatic: false });
  const cairn = stepPowertrain({ gear: 2, rpm: 3000, shiftRemaining: 0 }, { speedMps: 18, throttle: 1 }, CAIRN_R4, 1 / 120, { automatic: false });
  assert.notEqual(lumen.rpm, cairn.rpm);
  assert.ok(cairn.driveForceN > lumen.driveForceN);
});

test('manual shifts change only on explicit edges', () => {
  const state = { gear: 2, rpm: 3500, shiftRemaining: 0 };
  const held = stepPowertrain(state, { speedMps: 18, throttle: 0.7 }, CAIRN_R4, 1 / 120, { automatic: false });
  assert.equal(held.gear, 2);
  const shifted = stepPowertrain(held, { speedMps: 18, throttle: 0.7, shiftUp: true }, CAIRN_R4, 1 / 120, { automatic: false });
  assert.equal(shifted.gear, 3);
  assert.ok(shifted.shiftRemaining > 0);
});

// --- combined-slip tyre and wheel model -------------------------------------

test('the slip curve is odd, peaks at the authored peak slip, and falls off past it', () => {
  assert.equal(slipCurve(0), 0);
  for (const slip of [0.02, 0.09, 0.14, 0.4, 1.2]) {
    assert.ok(Math.abs(slipCurve(slip) + slipCurve(-slip)) < 1e-12, `curve is not odd at ${slip}`);
    assert.ok(Math.abs(slipCurve(slip)) <= 1, `curve exceeded unity at ${slip}`);
  }
  const peak = slipCurve(0.14);
  assert.ok(peak > 0.97, `peak=${peak}`);
  assert.ok(slipCurve(0.07) < peak, 'rising branch should sit below the peak');
  assert.ok(slipCurve(0.6) < peak, 'force should fall away past the peak');
  assert.ok(slipCurve(0.6) > peak * 0.6, 'the fall-off should be gentle, not a cliff');
  assert.ok(slipCurve(0.28, 0.28) > 0.97, 'the peak follows the authored peak slip');
});

test('longitudinal tyre force never exceeds the axle capacity', () => {
  for (const slip of [-4, -0.3, -0.05, 0, 0.05, 0.3, 4]) {
    const force = tyreLongitudinalForce(slip, 5200, 0.16);
    assert.ok(Math.abs(force) <= 5200 + 1e-9, `force=${force} at slip=${slip}`);
    assert.equal(Math.sign(force), Math.sign(slip));
  }
  assert.equal(tyreLongitudinalForce(0.2, -100), 0);
});

test('slip stiffness matches the measured slope of the curve at the origin', () => {
  const capacity = 6100;
  const peak = 0.15;
  const step = 1e-6;
  const measured = (tyreLongitudinalForce(step, capacity, peak) - tyreLongitudinalForce(-step, capacity, peak)) / (2 * step);
  assert.ok(Math.abs(measured - slipStiffness(capacity, peak)) / measured < 1e-3, `${measured} vs ${slipStiffness(capacity, peak)}`);
});

test('axle inertia carries the driveline in low gears and only the wheels when undriven', () => {
  const first = axleInertiaKg(CAIRN_R4, 1, 0.5);
  const top = axleInertiaKg(CAIRN_R4, CAIRN_R4.gearRatios.length, 0.5);
  const undriven = axleInertiaKg(CAIRN_R4, 1, 0);
  assert.ok(first > top * 2, `first=${first}, top=${top}`);
  assert.ok(top > undriven, `top=${top}, undriven=${undriven}`);
  assert.ok(undriven > 0 && Number.isFinite(first));
  assert.ok(axleInertiaKg(CAIRN_R4, 99, 0.5) === axleInertiaKg(CAIRN_R4, CAIRN_R4.gearRatios.length, 0.5), 'gear index must be clamped');
});

test('combined slip shares one contact patch between braking and cornering', () => {
  const capacity = 5400;
  const peakSlip = 0.16;
  const peakSlipAngle = 0.2;
  const pure = combinedSlipForces({ slipRatio: 0.16, slipAngle: 0, capacityN: capacity, peakSlip, peakSlipAngle });
  assert.ok(pure.longitudinal > capacity * 0.95);
  assert.ok(Math.abs(pure.lateral) < 1e-9, 'no slip angle must mean no lateral force');
  const cornering = combinedSlipForces({ slipRatio: 0, slipAngle: 0.2, capacityN: capacity, peakSlip, peakSlipAngle });
  assert.ok(cornering.lateral < 0, 'lateral force opposes the slip angle');
  assert.ok(Math.abs(cornering.lateral) > capacity * 0.9);
  const combined = combinedSlipForces({ slipRatio: 0.16, slipAngle: 0.2, capacityN: capacity, peakSlip, peakSlipAngle });
  assert.ok(Math.hypot(combined.longitudinal, combined.lateral) <= capacity + 1e-9, 'the friction ellipse must hold');
  assert.ok(Math.abs(combined.lateral) < Math.abs(cornering.lateral), 'driving must cost cornering force');
  assert.ok(combined.longitudinal < pure.longitudinal, 'cornering must cost drive force');
  assert.equal(combinedSlipForces({ capacityN: capacity }).magnitude, 0);
});

test('a wheel spins up when the surface cannot take the drive force', () => {
  const dt = 1 / 120;
  let spinning = { wheelSpeed: 12 };
  let gripped = { wheelSpeed: 12 };
  for (let step = 0; step < 120; step += 1) {
    spinning = stepWheelSpeed({ ...spinning, roadSpeed: 12, driveForceN: 9000, capacityN: 2600, inertiaKg: 60, dt });
    gripped = stepWheelSpeed({ ...gripped, roadSpeed: 12, driveForceN: 9000, capacityN: 11000, inertiaKg: 60, dt });
  }
  assert.ok(spinning.slipRatio > 0.2, `slip=${spinning.slipRatio}`);
  assert.ok(gripped.slipRatio < spinning.slipRatio * 0.5, `${gripped.slipRatio} vs ${spinning.slipRatio}`);
  assert.ok(spinning.force <= 2600 + 1e-9);
});

test('braking stops a wheel without driving it backwards, and stays stable at 120 Hz', () => {
  const dt = 1 / 120;
  let wheel = { wheelSpeed: 20 };
  const speeds = [];
  for (let step = 0; step < 240; step += 1) {
    wheel = stepWheelSpeed({ ...wheel, roadSpeed: 20, brakeForceN: 40000, capacityN: 5000, inertiaKg: 25, dt });
    speeds.push(wheel.wheelSpeed);
    assert.ok(Number.isFinite(wheel.wheelSpeed), 'wheel speed went non-finite');
    assert.ok(wheel.wheelSpeed >= -1e-6, `brake reversed the wheel: ${wheel.wheelSpeed}`);
  }
  assert.ok(wheel.locked, 'a wheel under 40 kN of brake against 5 kN of grip should lock');
  const tail = speeds.slice(-60);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 0.5, 'locked wheel speed should settle, not oscillate');
});

test('lateral load transfer conserves its total and follows the roll-stiffness share', () => {
  const transfer = lateralLoadTransfer(1180, 8, 1.5, 0.5, 0.6);
  assert.ok(Math.abs(transfer.front + transfer.rear - transfer.total) < 1e-9);
  assert.ok(Math.abs(transfer.front / transfer.total - 0.6) < 1e-9);
  assert.equal(Math.sign(lateralLoadTransfer(1180, -8, 1.5, 0.5).total), -1);
  const wide = lateralLoadTransfer(1180, 8, 2.1, 0.5);
  assert.ok(Math.abs(wide.total) < Math.abs(transfer.total), 'a wider track transfers less load');
});

test('axle grip falls as load transfer moves weight across the axle', () => {
  const flat = axleGripCapacity(5800, 0, 0.9, 5800);
  const transferred = axleGripCapacity(5800, 2000, 0.9, 5800);
  const extreme = axleGripCapacity(5800, 5000, 0.9, 5800);
  assert.ok(transferred < flat, `${transferred} >= ${flat}`);
  assert.ok(extreme < transferred, 'more transfer must cost more grip');
  assert.ok(extreme > flat * 0.7, 'the loss should be a tyre-sensitivity effect, not a collapse');
  assert.ok(axleGripCapacity(7000, 0, 0.9, 5800) > flat, 'more load still means more grip');
  assert.equal(axleGripCapacity(0, 0, 0.9, 5800), 0);
});

test('downforce grows with the square of speed and is never negative', () => {
  const profile = { dragCoefficient: 0.43 };
  assert.equal(aeroDownforceN(0, profile), 0);
  const slow = aeroDownforceN(20, profile);
  const fast = aeroDownforceN(40, profile);
  assert.ok(Math.abs(fast / slow - 4) < 1e-9, `${fast} vs ${slow}`);
  assert.ok(aeroDownforceN(-30, profile) > 0, 'reversing is still air');
  assert.equal(aeroDownforceN(30, { downforceCoefficient: 0 }), 0);
});

test('tyre relaxation converges towards its target and never overshoots', () => {
  let state = 0;
  const target = 0.2;
  for (let step = 0; step < 240; step += 1) {
    const next = relaxTyreState(state, target, 25, 1 / 120, 0.5);
    assert.ok(next >= state - 1e-12 && next <= target + 1e-12, `overshoot: ${next}`);
    state = next;
  }
  assert.ok(Math.abs(state - target) < 1e-3, `state=${state}`);
  // A standing car still relaxes, slowly, rather than freezing its tyre state.
  assert.ok(relaxTyreState(0, 0.2, 0, 1 / 120, 0.5) > 0);
});

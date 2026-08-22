import test from 'node:test';
import assert from 'node:assert/strict';
import { CAIRN_R4, LUMEN_F2 } from '../src/content.js';
import {
  axleLoads,
  combinedTyreForces,
  drivenAxleShares,
  interpolateTorque,
  stepPowertrain
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

import { clamp, lerp } from './math.js';

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
const SHIFT_SECONDS = 0.18;

export function interpolateTorque(curve, rpm) {
  if (!Array.isArray(curve) || curve.length === 0) return 0;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const lower = curve[index - 1];
    const upper = curve[index];
    if (rpm <= upper[0]) return lerp(lower[1], upper[1], (rpm - lower[0]) / (upper[0] - lower[0]));
  }
  return curve.at(-1)[1];
}

export function axleLoads(profile, longitudinalAcceleration = 0, gravity = GRAVITY) {
  const weight = profile.massKg * gravity;
  const staticFront = weight * profile.frontWeightFraction;
  const centreHeight = clamp(profile.rideHeightM * 0.92, 0.3, 0.75);
  const transfer = -longitudinalAcceleration * profile.massKg * centreHeight / profile.wheelbaseM;
  const front = clamp(staticFront + transfer, weight * 0.08, weight * 0.92);
  return { front, rear: weight - front };
}

export function drivenAxleShares(layout, torqueSplitFront = 0.5) {
  if (layout === 'fwd') return { front: 1, rear: 0 };
  if (layout === 'rwd') return { front: 0, rear: 1 };
  const front = clamp(torqueSplitFront, 0.25, 0.75);
  return { front, rear: 1 - front };
}

export function combinedTyreForces(lateralDemand, longitudinalDemand, capacity) {
  const longitudinal = {};
  const lateral = {};
  for (const axle of ['front', 'rear']) {
    const limit = Math.max(0, Number(capacity[axle]) || 0);
    const requestedLongitudinal = Number(longitudinalDemand[axle]) || 0;
    const requestedLateral = Number(lateralDemand[axle]) || 0;
    const magnitude = Math.hypot(requestedLongitudinal, requestedLateral);
    const scale = magnitude > limit && magnitude > 0 ? limit / magnitude : 1;
    longitudinal[axle] = requestedLongitudinal * scale;
    lateral[axle] = requestedLateral * scale;
  }
  return { longitudinal, lateral };
}

function coupledRpm(speedMps, profile, gear) {
  const wheelRpm = Math.abs(speedMps) / profile.wheelRadiusM * 60 / TWO_PI;
  return wheelRpm * profile.gearRatios[gear - 1] * profile.finalDrive;
}

export function stepPowertrain(previous, input, profile, dt, options = {}) {
  const gearCount = profile.gearRatios.length;
  const idleRpm = profile.torqueCurve[0][0];
  const redlineRpm = profile.torqueCurve.at(-1)[0];
  let gear = clamp(Math.round(previous.gear || 1), 1, gearCount);
  let shiftRemaining = Math.max(0, Number(previous.shiftRemaining) || 0);
  const speedMps = Number(input.speedMps) || 0;
  const automatic = options.automatic !== false;
  const rpmInGear = clamp(coupledRpm(speedMps, profile, gear), idleRpm, redlineRpm * 1.04);
  let direction = 0;
  if (input.shiftUp) direction = 1;
  else if (input.shiftDown) direction = -1;
  else if (automatic && shiftRemaining <= 0) {
    if (rpmInGear > redlineRpm * 0.88 && gear < gearCount) direction = 1;
    else if (rpmInGear < redlineRpm * 0.42 && gear > 1) direction = -1;
  }
  if (direction && shiftRemaining <= 0) {
    const nextGear = clamp(gear + direction, 1, gearCount);
    if (nextGear !== gear) {
      gear = nextGear;
      shiftRemaining = SHIFT_SECONDS;
    }
  } else if (shiftRemaining > 0) shiftRemaining = Math.max(0, shiftRemaining - dt);

  const coupled = clamp(coupledRpm(speedMps, profile, gear), idleRpm, redlineRpm * 1.04);
  const smoothing = 1 - Math.exp(-18 * dt);
  let rpm = Number(previous.rpm) || idleRpm;
  rpm += (coupled - rpm) * smoothing;
  rpm = clamp(rpm, idleRpm, redlineRpm * 1.04);
  const clutch = shiftRemaining > 0 ? 0 : 1;
  const throttle = clamp(Number(input.throttle) || 0, 0, 1);
  const torqueNm = interpolateTorque(profile.torqueCurve, rpm);
  const ratio = profile.gearRatios[gear - 1] * profile.finalDrive;
  const driveForceN = torqueNm * ratio * 0.82 / profile.wheelRadiusM * throttle * clutch;
  const engineBrakeForceN = torqueNm * ratio * 0.045 / profile.wheelRadiusM * (1 - throttle) * clutch;
  return {
    gear,
    rpm,
    shiftRemaining,
    clutch,
    driveForceN,
    engineBrakeForceN,
    torqueNm,
    shifted: direction !== 0 && shiftRemaining === SHIFT_SECONDS
  };
}

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
  // Revs follow the driven wheels, but the automatic must not shift on a
  // spinning wheel: that upshifts a bogged car out of the gear it needs.
  const shiftSpeedMps = Number.isFinite(Number(input.shiftSpeedMps)) ? Number(input.shiftSpeedMps) : speedMps;
  const rpmInGear = clamp(coupledRpm(shiftSpeedMps, profile, gear), idleRpm, redlineRpm * 1.04);
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

// --- Tyre and wheel model ---------------------------------------------------
// The longitudinal path used to hand the chassis whatever force the engine
// asked for, so a gravel launch was as clean as a tarmac one and a locked
// wheel was indistinguishable from a rolling one. These functions give each
// axle a wheel speed of its own, so slip ratio — not throttle position —
// decides how much force actually reaches the road.

const SLIP_SHAPE_B = 2.05;
const SLIP_SHAPE_C = 1.55;

/** Normalised slip curve: linear off zero, peak at the authored peak slip, mild fall-off past it. */
export function slipCurve(slipRatio, peakSlip = 0.14) {
  const peak = Math.max(1e-3, peakSlip);
  return Math.sin(SLIP_SHAPE_C * Math.atan(SLIP_SHAPE_B * (Number(slipRatio) || 0) / peak));
}

/** Longitudinal tyre force for a slip ratio, bounded by the axle's friction capacity. */
export function tyreLongitudinalForce(slipRatio, capacityN, peakSlip = 0.14) {
  return Math.max(0, Number(capacityN) || 0) * slipCurve(slipRatio, peakSlip);
}

/** dF/dslip at the origin — the implicit wheel step needs it to stay stable at 120 Hz. */
export function slipStiffness(capacityN, peakSlip = 0.14) {
  return Math.max(0, Number(capacityN) || 0) * SLIP_SHAPE_B * SLIP_SHAPE_C / Math.max(1e-3, peakSlip);
}

/**
 * Rotational inertia of one axle expressed as an equivalent mass at the contact
 * patch. The driven axle also carries the engine and gearbox through the
 * current ratio squared, which is why first gear bogs and sixth does not.
 */
export function axleInertiaKg(profile, gear = 1, driveShare = 0, engineInertiaKgM2 = 0.21) {
  const radius = Math.max(0.15, Number(profile?.wheelRadiusM) || 0.32);
  const wheelPair = 2 * (0.62 * Math.max(8, (Number(profile?.massKg) || 1180) * 0.016) * radius * radius);
  const ratio = (profile?.gearRatios?.[clamp(Math.round(gear), 1, profile.gearRatios.length) - 1] || 1) * (Number(profile?.finalDrive) || 1);
  const driveline = Math.max(0, driveShare) * engineInertiaKgM2 * ratio * ratio;
  return (wheelPair + driveline) / (radius * radius);
}

/**
 * Combined slip. One contact patch cannot serve braking and cornering
 * independently: the two slips form a vector, the tyre answers with one force
 * along it, and the split falls out of the geometry rather than out of a clamp.
 */
export function combinedSlipForces({ slipRatio = 0, slipAngle = 0, capacityN = 0, peakSlip = 0.14, peakSlipAngle = 0.2 }) {
  const longitudinalSlip = (Number(slipRatio) || 0) / Math.max(1e-3, peakSlip);
  const lateralSlip = Math.tan(clamp(Number(slipAngle) || 0, -1.35, 1.35)) / Math.max(1e-3, peakSlipAngle);
  const sigma = Math.hypot(longitudinalSlip, lateralSlip);
  if (sigma < 1e-9) return { longitudinal: 0, lateral: 0, sigma: 0, magnitude: 0 };
  const magnitude = Math.max(0, Number(capacityN) || 0) * slipCurve(sigma * peakSlip, peakSlip);
  return {
    longitudinal: magnitude * longitudinalSlip / sigma,
    lateral: -magnitude * lateralSlip / sigma,
    sigma,
    magnitude
  };
}

/**
 * One implicit-damped wheel step. Explicit Euler is unstable here: the slip
 * curve is stiff near zero slip, so the local slope is folded into the
 * denominator instead of being integrated forward.
 */
export function stepWheelSpeed({
  wheelSpeed = 0, roadSpeed = 0, slipAngle = 0, driveForceN = 0, brakeForceN = 0, capacityN = 0,
  inertiaKg = 20, peakSlip = 0.14, peakSlipAngle = 0.2, grounded = true, dt = 1 / 120
}) {
  const reference = Math.max(Math.abs(roadSpeed), 1.6);
  const slipRatio = (wheelSpeed - roadSpeed) / reference;
  const traction = grounded ? 1 : 0.02;
  const available = Math.max(0, Number(capacityN) || 0) * traction;
  const combined = combinedSlipForces({ slipRatio, slipAngle, capacityN: available, peakSlip, peakSlipAngle });
  const force = combined.longitudinal;
  // The curve flattens past its peak, so damp less where the wheel is already
  // spinning — otherwise the implicit term suppresses the wheelspin itself.
  const slope = slipStiffness(available, peakSlip) * clamp(1 / Math.max(1, combined.sigma), 0.12, 1) / reference;
  // tanh keeps a standing wheel from chattering between +brake and -brake.
  const brake = Math.max(0, brakeForceN) * Math.tanh(wheelSpeed / 0.4);
  const mass = Math.max(1, inertiaKg);
  let next = wheelSpeed + dt * (driveForceN - force - brake) / (mass + dt * Math.max(0, slope));
  // Brakes stop a wheel; they never drive it backwards.
  if (brakeForceN > 0 && driveForceN <= 0 && wheelSpeed * next < 0) next = 0;
  if (!Number.isFinite(next)) next = roadSpeed;
  return {
    wheelSpeed: next,
    force,
    lateral: combined.lateral,
    slipRatio,
    sigma: combined.sigma,
    locked: Math.abs(next) < 0.6 && Math.abs(roadSpeed) > 3
  };
}

/**
 * Lateral weight transfer split across the axles by roll-stiffness share. The
 * stiffer end takes more transfer and therefore loses more grip, which is how
 * a setup change turns into understeer or oversteer rather than a flat number.
 */
export function lateralLoadTransfer(massKg, lateralAccel, trackM, centreHeightM, frontRollShare = 0.52) {
  const track = Math.max(0.8, Number(trackM) || 1.5);
  const total = (Number(massKg) || 0) * (Number(lateralAccel) || 0) * Math.max(0.15, Number(centreHeightM) || 0.5) / track;
  const front = clamp(Number(frontRollShare) || 0.5, 0.2, 0.8);
  return { front: total * front, rear: total * (1 - front), total };
}

/**
 * Axle grip with tyre load sensitivity: doubling the load on one wheel buys
 * less than double the grip, so transfer costs the axle capacity.
 */
export function axleGripCapacity(axleLoadN, transferN, mu, referenceLoadN, sensitivity = 0.14) {
  const load = Math.max(0, Number(axleLoadN) || 0);
  const reference = Math.max(1, Number(referenceLoadN) || load || 1);
  const shift = Math.min(Math.abs(Number(transferN) || 0), load * 0.5);
  const inner = Math.max(0, load / 2 - shift);
  const outer = Math.max(0, load / 2 + shift);
  const scale = wheel => wheel * Math.pow(Math.max(wheel, 1) / (reference / 2), -clamp(sensitivity, 0, 0.4));
  return Math.max(0, mu) * (scale(inner) + scale(outer));
}

/** Aerodynamic downforce. Rally cars carry little, but it is not nothing at 180 km/h. */
export function aeroDownforceN(speedMps, profile) {
  const coefficient = Number.isFinite(Number(profile?.downforceCoefficient))
    ? Number(profile.downforceCoefficient)
    : (Number(profile?.dragCoefficient) || 0.4) * 0.55;
  return Math.max(0, coefficient) * (Number(speedMps) || 0) ** 2;
}

/**
 * Tyre relaxation: a tyre needs about half a metre of rolling to build its
 * lateral deflection, so a flick of steering does not teleport the force into
 * the chassis.
 */
export function relaxTyreState(current, target, speedMps, dt, relaxationLengthM = 0.5) {
  const rate = Math.abs(Number(speedMps) || 0) / Math.max(0.05, relaxationLengthM);
  const blend = 1 - Math.exp(-Math.max(rate, 1.5) * dt);
  return current + ((Number(target) || 0) - current) * blend;
}

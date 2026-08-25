// Vehicle dynamics. Everything a car does — how it loads a tyre, how it slides,
// how it lands — is decided here; render.js, hud.js, audio.js and damage.js only
// read what this module writes.
//
// Frame: +Y up, car-local +Z forward, +X right. World forward for a heading is
// (sin yaw, 0, cos yaw), so a POSITIVE yaw rate turns the car to its RIGHT.
// A positive steer angle points the wheel LEFT. Pitch is positive nose-up, roll
// is positive right-side-down; the quaternion built from them is
// qY(yaw) * qX(-pitch) * qZ(-roll).
//
// CarState (public, pinned — consumers may rely on every name here):
//   spec, setup, assists, preset
//   pos{x,y,z} vel{x,y,z} quat{x,y,z,w}
//   yaw pitch roll  yawRate pitchRate rollRate
//   speed forwardSpeed lateralSpeed slipAngle
//   lateralG longitudinalG verticalG
//   engineRpm engineLoad engineTorque engineStalled turboBoost turboSpool
//   gear gearShiftTimer clutchEngage clutchSlip driveshaftRpm autoReverse
//   wheels[4]  onGround airTime rolledOver rolloverTimer
//   damage input odometer distanceTravelled time
// Each wheel:
//   index isFront isLeft localPos{x,y,z} worldPos{x,y,z}
//   contact contactPoint{x,y,z} contactNormal{x,y,z}
//   compression suspensionForce load steerAngle spinRate
//   slipRatio slipAngle fx fy muLong muLat
//   surfaceId gripUsed skidding dustRate temperature wear punctured
//   driveTorque brakeTorque slipSpeed

import { clamp, saturate, lerp, smoothstep, damp, sign } from "./mathx.js";
import { SURFACE, surfaceProps } from "./surfaces.js";

const RPM_PER_RAD = 60 / (Math.PI * 2);
const RAD_PER_RPM = 1 / RPM_PER_RAD;
const RHO = 1.225;
const G0 = 9.81;

// Brake-to-reverse. 0.6 m/s (2 km/h) is "stopped": under walking pace, and well
// inside the 2 m/s guard requestGear already puts on reverse. The 0.35 s dwell is
// what keeps a hard stop under braking from slamming into reverse the moment
// forward speed crosses zero — a driver who is only stopping is off the pedal
// within a quarter-second of the car settling, so 0.35 s clears him without
// reading as a wait. The cap is there because reverse is geared like first and
// nobody drives it to first's limiter speed.
const REVERSE_STOP = 0.6;
const REVERSE_DWELL = 0.35;
const REVERSE_CAP = 12;         // m/s, ~43 km/h

function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

// ---- car catalogue -------------------------------------------------------

export const CAR_CLASSES = Object.freeze([
  Object.freeze({
    id: "junior",
    name: "Junior Cup",
    blurb: "Two-wheel drive, small turbos, huge commitment. Where every seat time starts.",
    order: 0,
  }),
  Object.freeze({
    id: "heritage",
    name: "Heritage",
    blurb: "No aids, no diffs worth the name. Twitchy period machinery on skinny tyres.",
    order: 1,
  }),
  Object.freeze({
    id: "works4wd",
    name: "Works 4WD",
    blurb: "Two litres, anti-lag and three differentials. The homologation era at its peak.",
    order: 2,
  }),
  Object.freeze({
    id: "topclass",
    name: "Top Class",
    blurb: "Current-generation four-wheel drive. Aero, brutal shift speed, no excuses.",
    order: 3,
  }),
]);

// Fully-boosted crank torque, Nm at rpm. The turbo model scales between the
// naturally-aspirated fraction and this curve as boost builds.
const CURVE_2L_TURBO = [
  [1000, 190], [2000, 330], [3000, 450], [4000, 505], [5000, 495],
  [6000, 452], [7000, 385], [7800, 305],
];
const CURVE_16_TURBO = [
  [1200, 130], [2200, 235], [3200, 300], [4200, 325], [5200, 318],
  [6200, 285], [7200, 236], [7800, 195],
];
const CURVE_16_NA = [
  [1500, 118], [2500, 150], [3500, 172], [4500, 186], [5500, 190],
  [6500, 178], [7400, 155], [8000, 128],
];
const CURVE_CLASSIC_NA = [
  [1500, 165], [2500, 208], [3500, 236], [4500, 248], [5500, 244],
  [6500, 224], [7200, 198], [7600, 168],
];
const CURVE_GROUPB = [
  [1500, 240], [2500, 400], [3500, 610], [4500, 700], [5500, 685],
  [6500, 610], [7400, 500], [7900, 400],
];
const CURVE_TOPCLASS = [
  [1500, 300], [2500, 470], [3500, 560], [4500, 588], [5500, 570],
  [6500, 512], [7200, 448], [7600, 390],
];

const DEFAULT_TYRE = {
  muLong: 1.22,
  muLat: 1.30,
  bLong: 16.0, cLong: 1.65, eLong: 0.50,
  bLat: 15.0, cLat: 1.55, eLat: 0.35,
  loadSensitivity: 0.17,   // fractional mu lost per unit of extra load over static
  loadFloor: 0.52,         // mu never falls below this fraction of nominal
  relaxLength: 0.42,       // metres of travel over which lateral force builds
  looseTail: 0.72,         // how much of the post-peak falloff the loose layer fills back in
  bermGain: 0.32,          // extra lateral mu dug out of a loose surface at big slip
  digGain: 0.26,           // same idea longitudinally — a spinning wheel finds the hard base
  surfaceGrip: null,       // optional per-SURFACE multiplier array
  wearRate: 0.0000075,
  heatRate: 0.0016,
  coolRate: 0.55,
};

function tyre(over) {
  return Object.freeze(Object.assign({}, DEFAULT_TYRE, over));
}

// Per-surface grip trims. A studded snow tyre is transformative on ice and
// mediocre everywhere else; a tarmac slick is the mirror image.
function surfaceTrim(map) {
  const arr = new Array(10).fill(1);
  for (const k of Object.keys(map)) arr[SURFACE[k]] = map[k];
  return Object.freeze(arr);
}

const SNOW_TYRE = surfaceTrim({ SNOW: 1.62, ICE: 1.78, GRAVEL: 0.93, TARMAC: 0.80, DIRT: 0.95 });
const TARMAC_TYRE = surfaceTrim({ TARMAC: 1.10, GRAVEL: 0.86, DIRT: 0.88, SNOW: 0.74, ICE: 0.80 });
const GRAVEL_TYRE = surfaceTrim({ TARMAC: 0.90, GRAVEL: 1.06, DIRT: 1.05, SNOW: 0.92, ICE: 0.90 });

function diff(over) {
  return Object.freeze(Object.assign({
    preload: 60,      // Nm of locking present with no input torque
    ramp: 0.18,       // extra locking per Nm of torque through the diff
    viscous: 26,      // Nm per rad/s of cross-shaft speed difference
    maxLock: 2600,
  }, over));
}

const OPEN_DIFF = diff({ preload: 0, ramp: 0, viscous: 0, maxLock: 0 });
const LOCKED_DIFF = diff({ preload: 900, ramp: 1.2, viscous: 900, maxLock: 26000 });

function mkCar(spec) {
  const s = Object.assign({
    year: 1998,
    drive: "4WD",
    comHeight: 0.50,
    weightDistFront: 0.56,
    wheelbase: 2.55,
    trackFront: 1.55,
    trackRear: 1.53,
    wheelRadius: 0.315,
    wheelInertia: 1.25,
    inertiaScale: { pitch: 1, yaw: 1, roll: 1 },
    tyre: tyre({}),
    steer: { maxAngle: 0.52, ackermann: 0.13, toeFront: 0.0015, toeRear: 0.0035, speedFalloff: 34 },
    aero: {
      dragArea: 0.78, liftFront: 0.18, liftRear: 0.30,
      pitchTrim: 0.85, pitchDamp: 3.2, rollDamp: 2.0, yawDamp: 2.4, airYaw: 1250,
    },
    brakes: { maxTorque: 6200, bias: 0.62, handbrakeTorque: 2600, absSlip: 0.14 },
  }, spec);

  s.engine = Object.assign({
    idleRpm: 1200, stallRpm: 620, maxRpm: 7600, limiterRpm: 7500, limiterCut: 0.055,
    inertia: 0.30, frictionA: 9, frictionB: 0.016, engineBrake: 0.055,
    naFraction: 1, maxBoost: 0, boostSpoolRpm: 2200, boostFullRpm: 4200,
    spoolUp: 3.4, spoolDown: 5.5, antiLag: 0, autoRestart: 1.1,
    shiftUpRpm: 7150, shiftDownRpm: 3100,
  }, spec.engine);

  s.gearbox = Object.assign({
    ratios: [3.40, 2.35, 1.80, 1.45, 1.20, 1.00],
    reverse: 3.20, final: 4.30, shiftTime: 0.13, efficiency: 0.94, inertia: 0.055,
  }, spec.gearbox);

  s.diffs = Object.assign({
    centreSplitFront: 0.40, centre: diff({}), front: diff({}), rear: diff({}),
  }, spec.diffs);

  s.susp = Object.assign({
    front: { springRate: 42000, bump: 2700, rebound: 4300, travel: 0.21, arb: 17000, bumpStop: 0.84, bumpStopRate: 620000 },
    rear: { springRate: 38000, bump: 2500, rebound: 4000, travel: 0.22, arb: 12000, bumpStop: 0.84, bumpStopRate: 560000 },
  }, spec.susp);

  s.class = spec.class;
  s.id = spec.id;
  return deepFreeze(clone(s));
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o;
  }
  return v;
}

function deepFreeze(v) {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}

export const CARS = Object.freeze([
  mkCar({
    id: "vireo-r2",
    name: "Kestrel Vireo R2",
    team: "Kestrel Autosport",
    class: "junior",
    year: 2016,
    drive: "FWD",
    mass: 1090,
    comHeight: 0.485,
    weightDistFront: 0.63,
    wheelbase: 2.48,
    trackFront: 1.50, trackRear: 1.47,
    wheelRadius: 0.305, wheelInertia: 1.05,
    engine: {
      idleRpm: 1250, stallRpm: 640, maxRpm: 8000, limiterRpm: 7900,
      inertia: 0.19, frictionA: 6.5, frictionB: 0.013, engineBrake: 0.048,
      shiftUpRpm: 7550, shiftDownRpm: 3200,
      torque: CURVE_16_NA,
    },
    gearbox: { ratios: [3.55, 2.30, 1.72, 1.36, 1.11], reverse: 3.30, final: 4.45, shiftTime: 0.16, efficiency: 0.93 },
    diffs: { centreSplitFront: 1, centre: OPEN_DIFF, front: diff({ preload: 140, ramp: 0.30, viscous: 40, maxLock: 1600 }), rear: OPEN_DIFF },
    brakes: { maxTorque: 4700, bias: 0.68, handbrakeTorque: 1900, absSlip: 0.14 },
    susp: {
      front: { springRate: 36000, bump: 2200, rebound: 3500, travel: 0.19, arb: 15000, bumpStop: 0.84, bumpStopRate: 520000 },
      rear: { springRate: 30000, bump: 1900, rebound: 3100, travel: 0.20, arb: 14500, bumpStop: 0.84, bumpStopRate: 480000 },
    },
    steer: { maxAngle: 0.56, ackermann: 0.14, toeFront: 0.0018, toeRear: 0.0040, speedFalloff: 32 },
    aero: { dragArea: 0.70, liftFront: 0.10, liftRear: 0.16, pitchTrim: 0.72, pitchDamp: 2.9, rollDamp: 1.8, yawDamp: 2.2, airYaw: 950 },
    tyre: tyre({ muLong: 1.16, muLat: 1.22, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#e8e4dc", stripe: "#1b6ec2", accent: "#f2a900", pattern: "chevron", team: "Kestrel Autosport", number: 42 },
  }),

  mkCar({
    id: "sprint-j2",
    name: "Alcove Sprint J2",
    team: "Alcove Rallysport",
    class: "junior",
    year: 2021,
    drive: "FWD",
    mass: 1135,
    comHeight: 0.475,
    weightDistFront: 0.615,
    wheelbase: 2.53,
    trackFront: 1.53, trackRear: 1.50,
    wheelRadius: 0.310, wheelInertia: 1.10,
    engine: {
      idleRpm: 1150, stallRpm: 600, maxRpm: 7800, limiterRpm: 7650,
      inertia: 0.22, frictionA: 7.5, frictionB: 0.014, engineBrake: 0.052,
      naFraction: 0.50, maxBoost: 1.05, boostSpoolRpm: 2400, boostFullRpm: 4300,
      spoolUp: 3.0, spoolDown: 5.2, antiLag: 0,
      shiftUpRpm: 7350, shiftDownRpm: 3300,
      torque: CURVE_16_TURBO,
    },
    gearbox: { ratios: [3.30, 2.24, 1.70, 1.36, 1.12, 0.96], reverse: 3.15, final: 4.20, shiftTime: 0.10, efficiency: 0.94 },
    diffs: { centreSplitFront: 1, centre: OPEN_DIFF, front: diff({ preload: 220, ramp: 0.42, viscous: 70, maxLock: 2400 }), rear: OPEN_DIFF },
    brakes: { maxTorque: 5300, bias: 0.70, handbrakeTorque: 2100, absSlip: 0.14 },
    susp: {
      front: { springRate: 40000, bump: 2500, rebound: 3900, travel: 0.20, arb: 17000, bumpStop: 0.84, bumpStopRate: 560000 },
      rear: { springRate: 33000, bump: 2100, rebound: 3400, travel: 0.21, arb: 16000, bumpStop: 0.84, bumpStopRate: 520000 },
    },
    steer: { maxAngle: 0.55, ackermann: 0.14, toeFront: 0.0016, toeRear: 0.0038, speedFalloff: 34 },
    aero: { dragArea: 0.73, liftFront: 0.14, liftRear: 0.22, pitchTrim: 0.78, pitchDamp: 3.0, rollDamp: 1.9, yawDamp: 2.3, airYaw: 1050 },
    tyre: tyre({ muLong: 1.19, muLat: 1.26, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#111418", stripe: "#d81f26", accent: "#ffffff", pattern: "arrow", team: "Alcove Rallysport", number: 27 },
  }),

  mkCar({
    id: "brackmoor-t8",
    name: "Brackmoor Type 8 GT",
    team: "Brackmoor Works",
    class: "heritage",
    year: 1974,
    drive: "RWD",
    mass: 965,
    comHeight: 0.505,
    weightDistFront: 0.47,
    wheelbase: 2.34,
    trackFront: 1.40, trackRear: 1.38,
    wheelRadius: 0.300, wheelInertia: 1.00,
    inertiaScale: { pitch: 0.95, yaw: 0.92, roll: 1.05 },
    engine: {
      idleRpm: 950, stallRpm: 520, maxRpm: 7600, limiterRpm: 7300,
      inertia: 0.34, frictionA: 8.5, frictionB: 0.018, engineBrake: 0.078,
      shiftUpRpm: 6950, shiftDownRpm: 3000,
      torque: CURVE_CLASSIC_NA,
    },
    gearbox: { ratios: [2.98, 2.05, 1.52, 1.18, 0.96], reverse: 3.05, final: 4.55, shiftTime: 0.26, efficiency: 0.91 },
    diffs: { centreSplitFront: 0, centre: OPEN_DIFF, front: OPEN_DIFF, rear: diff({ preload: 190, ramp: 0.34, viscous: 46, maxLock: 1900 }) },
    brakes: { maxTorque: 4100, bias: 0.60, handbrakeTorque: 2000, absSlip: 0.16 },
    susp: {
      front: { springRate: 27000, bump: 1750, rebound: 2900, travel: 0.20, arb: 9000, bumpStop: 0.82, bumpStopRate: 420000 },
      rear: { springRate: 24000, bump: 1600, rebound: 2650, travel: 0.21, arb: 5200, bumpStop: 0.82, bumpStopRate: 390000 },
    },
    steer: { maxAngle: 0.58, ackermann: 0.10, toeFront: 0.0012, toeRear: 0.0018, speedFalloff: 30 },
    aero: { dragArea: 0.86, liftFront: -0.04, liftRear: 0.02, pitchTrim: 0.62, pitchDamp: 2.4, rollDamp: 1.5, yawDamp: 1.8, airYaw: 780 },
    tyre: tyre({ muLong: 1.02, muLat: 1.08, loadSensitivity: 0.22, relaxLength: 0.52, bLat: 12.5, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#1d5c2f", stripe: "#f4f1e6", accent: "#c8a032", pattern: "stripe", team: "Brackmoor Works", number: 8 },
  }),

  mkCar({
    id: "delta-b640",
    name: "Vantel Delta-B 640",
    team: "Vantel Competizione",
    class: "heritage",
    year: 1986,
    drive: "4WD",
    mass: 1085,
    comHeight: 0.470,
    weightDistFront: 0.42,
    wheelbase: 2.44,
    trackFront: 1.62, trackRear: 1.64,
    wheelRadius: 0.320, wheelInertia: 1.30,
    inertiaScale: { pitch: 0.88, yaw: 0.84, roll: 1.0 },   // mid-engined: low polar moment, snaps fast
    engine: {
      idleRpm: 1400, stallRpm: 700, maxRpm: 8000, limiterRpm: 7850,
      inertia: 0.31, frictionA: 12, frictionB: 0.020, engineBrake: 0.062,
      naFraction: 0.30, maxBoost: 2.35, boostSpoolRpm: 3200, boostFullRpm: 5400,
      spoolUp: 1.75, spoolDown: 4.6, antiLag: 0.42,
      shiftUpRpm: 7550, shiftDownRpm: 4200,
      torque: CURVE_GROUPB,
    },
    gearbox: { ratios: [2.80, 1.95, 1.50, 1.22, 1.02], reverse: 3.00, final: 4.10, shiftTime: 0.22, efficiency: 0.92 },
    diffs: {
      centreSplitFront: 0.32,
      centre: diff({ preload: 400, ramp: 0.55, viscous: 130, maxLock: 5200 }),
      front: diff({ preload: 200, ramp: 0.28, viscous: 48, maxLock: 2200 }),
      rear: diff({ preload: 380, ramp: 0.50, viscous: 90, maxLock: 3800 }),
    },
    brakes: { maxTorque: 6600, bias: 0.58, handbrakeTorque: 3000, absSlip: 0.16 },
    susp: {
      front: { springRate: 41000, bump: 2600, rebound: 4200, travel: 0.23, arb: 14000, bumpStop: 0.83, bumpStopRate: 600000 },
      rear: { springRate: 44000, bump: 2800, rebound: 4500, travel: 0.24, arb: 11000, bumpStop: 0.83, bumpStopRate: 640000 },
    },
    steer: { maxAngle: 0.50, ackermann: 0.12, toeFront: 0.0014, toeRear: 0.0030, speedFalloff: 36 },
    aero: { dragArea: 0.92, liftFront: 0.24, liftRear: 0.42, pitchTrim: 0.95, pitchDamp: 3.0, rollDamp: 1.9, yawDamp: 2.1, airYaw: 1150 },
    tyre: tyre({ muLong: 1.20, muLat: 1.26, loadSensitivity: 0.20, relaxLength: 0.46, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#f5f5f2", stripe: "#e2001a", accent: "#0b2f6b", pattern: "blocks", team: "Vantel Competizione", number: 4 },
  }),

  mkCar({
    id: "corvine-rs2000",
    name: "Corvine Tempest 300",
    team: "Corvine Motorsport",
    class: "works4wd",
    year: 1998,
    drive: "4WD",
    mass: 1235,
    comHeight: 0.500,
    weightDistFront: 0.575,
    wheelbase: 2.55,
    trackFront: 1.56, trackRear: 1.54,
    wheelRadius: 0.315, wheelInertia: 1.25,
    engine: {
      idleRpm: 1250, stallRpm: 640, maxRpm: 7700, limiterRpm: 7550,
      inertia: 0.28, frictionA: 10, frictionB: 0.017, engineBrake: 0.056,
      naFraction: 0.34, maxBoost: 1.85, boostSpoolRpm: 2300, boostFullRpm: 3900,
      spoolUp: 3.6, spoolDown: 5.0, antiLag: 0.62,
      shiftUpRpm: 7250, shiftDownRpm: 3400,
      torque: CURVE_2L_TURBO,
    },
    gearbox: { ratios: [3.40, 2.35, 1.80, 1.45, 1.20, 1.00], reverse: 3.20, final: 4.30, shiftTime: 0.11, efficiency: 0.94 },
    diffs: {
      centreSplitFront: 0.40,
      centre: diff({ preload: 320, ramp: 0.48, viscous: 110, maxLock: 4200 }),
      front: diff({ preload: 180, ramp: 0.26, viscous: 44, maxLock: 2000 }),
      rear: diff({ preload: 300, ramp: 0.42, viscous: 78, maxLock: 3200 }),
    },
    brakes: { maxTorque: 6400, bias: 0.62, handbrakeTorque: 2800, absSlip: 0.14 },
    susp: {
      front: { springRate: 43000, bump: 2750, rebound: 4400, travel: 0.22, arb: 17000, bumpStop: 0.84, bumpStopRate: 630000 },
      rear: { springRate: 39000, bump: 2550, rebound: 4100, travel: 0.23, arb: 12500, bumpStop: 0.84, bumpStopRate: 580000 },
    },
    tyre: tyre({ muLong: 1.22, muLat: 1.30, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#0e2a5c", stripe: "#ffd400", accent: "#ffffff", pattern: "swoop", team: "Corvine Motorsport", number: 3 },
  }),

  mkCar({
    id: "falke-4s",
    name: "Nordhavn Falke 4S",
    team: "Nordhavn Vinterlag",
    class: "works4wd",
    year: 2001,
    drive: "4WD",
    mass: 1265,
    comHeight: 0.520,
    weightDistFront: 0.555,
    wheelbase: 2.60,
    trackFront: 1.58, trackRear: 1.57,
    wheelRadius: 0.325, wheelInertia: 1.34,
    engine: {
      idleRpm: 1200, stallRpm: 620, maxRpm: 7600, limiterRpm: 7400,
      inertia: 0.29, frictionA: 10, frictionB: 0.017, engineBrake: 0.058,
      naFraction: 0.36, maxBoost: 1.70, boostSpoolRpm: 2100, boostFullRpm: 3600,
      spoolUp: 4.0, spoolDown: 4.8, antiLag: 0.55,
      shiftUpRpm: 7100, shiftDownRpm: 3200,
      torque: CURVE_2L_TURBO,
    },
    gearbox: { ratios: [3.62, 2.52, 1.92, 1.52, 1.24, 1.03], reverse: 3.40, final: 4.35, shiftTime: 0.12, efficiency: 0.94 },
    diffs: {
      centreSplitFront: 0.46,
      centre: diff({ preload: 500, ramp: 0.62, viscous: 190, maxLock: 6000 }),
      front: diff({ preload: 260, ramp: 0.34, viscous: 62, maxLock: 2600 }),
      rear: diff({ preload: 340, ramp: 0.44, viscous: 84, maxLock: 3400 }),
    },
    brakes: { maxTorque: 6000, bias: 0.58, handbrakeTorque: 2900, absSlip: 0.12 },
    susp: {
      front: { springRate: 33000, bump: 2300, rebound: 3700, travel: 0.27, arb: 11000, bumpStop: 0.86, bumpStopRate: 500000 },
      rear: { springRate: 30000, bump: 2150, rebound: 3450, travel: 0.28, arb: 8500, bumpStop: 0.86, bumpStopRate: 470000 },
    },
    steer: { maxAngle: 0.58, ackermann: 0.15, toeFront: 0.0014, toeRear: 0.0032, speedFalloff: 38 },
    aero: { dragArea: 0.84, liftFront: 0.14, liftRear: 0.24, pitchTrim: 0.88, pitchDamp: 3.3, rollDamp: 2.1, yawDamp: 2.6, airYaw: 1180 },
    tyre: tyre({
      muLong: 1.10, muLat: 1.16, loadSensitivity: 0.14, relaxLength: 0.50,
      looseTail: 0.82, bermGain: 0.40, digGain: 0.34, surfaceGrip: SNOW_TYRE,
    }),
    livery: { base: "#eef4f8", stripe: "#0d3b66", accent: "#7ec8e3", pattern: "split", team: "Nordhavn Vinterlag", number: 11 },
  }),

  mkCar({
    id: "ardent-r1",
    name: "Meridian Ardent R1",
    team: "Meridian Racing",
    class: "topclass",
    year: 2024,
    drive: "4WD",
    mass: 1260,
    comHeight: 0.475,
    weightDistFront: 0.545,
    wheelbase: 2.62,
    trackFront: 1.66, trackRear: 1.64,
    wheelRadius: 0.320, wheelInertia: 1.28,
    engine: {
      idleRpm: 1350, stallRpm: 680, maxRpm: 7600, limiterRpm: 7450,
      inertia: 0.26, frictionA: 11, frictionB: 0.016, engineBrake: 0.054,
      naFraction: 0.38, maxBoost: 2.05, boostSpoolRpm: 2000, boostFullRpm: 3500,
      spoolUp: 4.6, spoolDown: 5.4, antiLag: 0.70,
      shiftUpRpm: 7200, shiftDownRpm: 3600,
      torque: CURVE_TOPCLASS,
    },
    gearbox: { ratios: [3.20, 2.26, 1.76, 1.44, 1.20, 1.02], reverse: 3.05, final: 4.25, shiftTime: 0.055, efficiency: 0.95 },
    diffs: {
      centreSplitFront: 0.42,
      centre: LOCKED_DIFF,
      front: diff({ preload: 240, ramp: 0.32, viscous: 58, maxLock: 2400 }),
      rear: diff({ preload: 360, ramp: 0.46, viscous: 86, maxLock: 3600 }),
    },
    brakes: { maxTorque: 7400, bias: 0.63, handbrakeTorque: 3200, absSlip: 0.13 },
    susp: {
      front: { springRate: 47000, bump: 3000, rebound: 4700, travel: 0.23, arb: 20000, bumpStop: 0.85, bumpStopRate: 700000 },
      rear: { springRate: 43000, bump: 2800, rebound: 4400, travel: 0.24, arb: 14000, bumpStop: 0.85, bumpStopRate: 650000 },
    },
    steer: { maxAngle: 0.52, ackermann: 0.13, toeFront: 0.0015, toeRear: 0.0034, speedFalloff: 36 },
    aero: { dragArea: 0.86, liftFront: 0.42, liftRear: 0.66, pitchTrim: 1.05, pitchDamp: 3.6, rollDamp: 2.2, yawDamp: 2.8, airYaw: 1320 },
    tyre: tyre({ muLong: 1.26, muLat: 1.34, relaxLength: 0.40, surfaceGrip: GRAVEL_TYRE }),
    livery: { base: "#101014", stripe: "#00c2a8", accent: "#f25c05", pattern: "gradient", team: "Meridian Racing", number: 1 },
  }),

  mkCar({
    id: "astra-corsa",
    name: "Sable Verrata GT",
    team: "Sable Corse",
    class: "topclass",
    year: 2023,
    drive: "4WD",
    mass: 1230,
    comHeight: 0.445,
    weightDistFront: 0.535,
    wheelbase: 2.58,
    trackFront: 1.68, trackRear: 1.66,
    wheelRadius: 0.318, wheelInertia: 1.22,
    inertiaScale: { pitch: 0.96, yaw: 0.94, roll: 0.92 },
    engine: {
      idleRpm: 1400, stallRpm: 700, maxRpm: 7800, limiterRpm: 7650,
      inertia: 0.25, frictionA: 11, frictionB: 0.016, engineBrake: 0.052,
      naFraction: 0.40, maxBoost: 1.95, boostSpoolRpm: 2100, boostFullRpm: 3600,
      spoolUp: 4.8, spoolDown: 5.6, antiLag: 0.66,
      shiftUpRpm: 7400, shiftDownRpm: 3700,
      torque: CURVE_TOPCLASS,
    },
    gearbox: { ratios: [3.05, 2.18, 1.72, 1.42, 1.19, 1.02], reverse: 2.95, final: 4.05, shiftTime: 0.05, efficiency: 0.95 },
    diffs: {
      centreSplitFront: 0.38,
      centre: diff({ preload: 560, ramp: 0.70, viscous: 240, maxLock: 7000 }),
      front: diff({ preload: 300, ramp: 0.38, viscous: 66, maxLock: 2800 }),
      rear: diff({ preload: 420, ramp: 0.52, viscous: 96, maxLock: 4000 }),
    },
    brakes: { maxTorque: 8200, bias: 0.65, handbrakeTorque: 3000, absSlip: 0.12 },
    susp: {
      front: { springRate: 72000, bump: 4200, rebound: 6200, travel: 0.13, arb: 34000, bumpStop: 0.80, bumpStopRate: 1100000 },
      rear: { springRate: 66000, bump: 3900, rebound: 5800, travel: 0.14, arb: 24000, bumpStop: 0.80, bumpStopRate: 1000000 },
    },
    steer: { maxAngle: 0.48, ackermann: 0.11, toeFront: 0.0012, toeRear: 0.0028, speedFalloff: 40 },
    aero: { dragArea: 0.80, liftFront: 0.50, liftRear: 0.78, pitchTrim: 1.10, pitchDamp: 3.8, rollDamp: 2.4, yawDamp: 3.0, airYaw: 1280 },
    tyre: tyre({
      muLong: 1.34, muLat: 1.44, loadSensitivity: 0.19, relaxLength: 0.34,
      bLat: 17.5, bLong: 18.0, looseTail: 0.52, bermGain: 0.20, digGain: 0.16,
      surfaceGrip: TARMAC_TYRE,
    }),
    livery: { base: "#8c1230", stripe: "#f0e6d2", accent: "#111111", pattern: "checker", team: "Sable Corse", number: 7 },
  }),
]);

const CAR_BY_ID = new Map(CARS.map((c) => [c.id, c]));

export function carSpec(id) {
  if (typeof id === "number") {
    const byIndex = CARS[id];
    if (byIndex) return byIndex;
  }
  const s = CAR_BY_ID.get(id);
  if (!s) throw new Error(`physics: unknown car "${id}"`);
  return s;
}

export function carsInClass(classId) {
  return CARS.filter((c) => c.class === classId);
}

// ---- assists -------------------------------------------------------------

export const ASSIST_PRESETS = Object.freeze({
  sim: Object.freeze({
    steerAssist: 0, speedSensitiveSteer: false, abs: false,
    tractionControl: 0, stability: 0, autoClutch: true, autoShift: false,
  }),
  arcade: Object.freeze({
    steerAssist: 0.55, speedSensitiveSteer: true, abs: true,
    tractionControl: 0.6, stability: 0.55, autoClutch: true, autoShift: true,
  }),
});

export function makeInput() {
  return {
    steer: 0, throttle: 0, brake: 0, handbrake: 0, clutch: 0,
    shiftUp: false, shiftDown: false, gear: null,
  };
}

export const CarInput = makeInput;

// ---- rigid-body helpers --------------------------------------------------

function quatBasis(q, right, up, fwd) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  right.x = 1 - (yy + zz); right.y = xy + wz; right.z = xz - wy;
  up.x = xy - wz; up.y = 1 - (xx + zz); up.z = yz + wx;
  fwd.x = xz + wy; fwd.y = yz - wx; fwd.z = 1 - (xx + yy);
}

// q = qY(yaw) * qX(-pitch) * qZ(-roll)
function quatFromEuler(q, yaw, pitch, roll) {
  const hy = yaw * 0.5, hp = -pitch * 0.5, hr = -roll * 0.5;
  const cy = Math.cos(hy), sy = Math.sin(hy);
  const cp = Math.cos(hp), sp = Math.sin(hp);
  const cr = Math.cos(hr), sr = Math.sin(hr);
  const ax = cy * sp, ay = sy * cp, az = -sy * sp, aw = cy * cp;
  q.x = ax * cr + ay * sr;
  q.y = ay * cr - ax * sr;
  q.z = az * cr + aw * sr;
  q.w = aw * cr - az * sr;
  return q;
}

function quatNormalise(q) {
  const n = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (!(n > 1e-9)) { q.x = 0; q.y = 0; q.z = 0; q.w = 1; return; }
  const s = 1 / n;
  q.x *= s; q.y *= s; q.z *= s; q.w *= s;
}

// dq/dt = 0.5 * q (x) omega_body, integrated explicitly then renormalised —
// steadier than an exponential map at the rates a car actually reaches.
function quatIntegrate(q, wx, wy, wz, dt) {
  const { x, y, z, w } = q;
  const dx = w * wx + y * wz - z * wy;
  const dy = w * wy + z * wx - x * wz;
  const dz = w * wz + x * wy - y * wx;
  const dw = -(x * wx + y * wy + z * wz);
  const h = 0.5 * dt;
  q.x = x + dx * h; q.y = y + dy * h; q.z = z + dz * h; q.w = w + dw * h;
  quatNormalise(q);
}

function finite(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

// ---- tyre ----------------------------------------------------------------

function magic(x, B, C, E) {
  const bx = B * x;
  const t = bx - E * (bx - Math.atan(bx));
  return Math.sin(C * Math.atan(t));
}

const tyreOut = { fx: 0, fy: 0, muLong: 0, muLat: 0, grip: 0 };

// Pacejka in both axes with a friction ellipse across them, plus the one thing
// that makes a gravel car a gravel car: past the peak the tread stops sliding
// on the loose layer and starts ploughing it into a berm, so the curve does not
// fall away — it recovers. Without that the car simply spins at the angle a
// rally driver actually lives at.
function tyreForces(t, tp, load, kappa, alpha, surfaceGrip, punctureMul) {
  const loose = tp.looseDepth;
  const bLat = t.bLat * (1 - 0.42 * loose);
  const bLong = t.bLong * (1 - 0.30 * loose);
  const alphaPeak = 1.86 / bLat;
  const kappaPeak = 1.74 / bLong;

  const trim = t.surfaceGrip ? (t.surfaceGrip[tp.id] ?? 1) : 1;
  const base = surfaceGrip * trim * punctureMul;

  // Load sensitivity: mu falls as the tyre is squashed, which is the whole
  // reason weight transfer decides a corner.
  const rel = load / Math.max(t.nominalLoad, 1);
  const sens = clamp(1 - t.loadSensitivity * (rel - 1), t.loadFloor, 1.45);

  const aAbs = Math.abs(alpha);
  const kAbs = Math.abs(kappa);
  const berm = loose * t.bermGain * smoothstep(alphaPeak, alphaPeak * 3.0, aAbs);
  const dig = loose * t.digGain * smoothstep(kappaPeak, kappaPeak * 3.5, kAbs);

  const muLat = t.muLat * tp.gripLat * base * sens * (1 + berm);
  const muLong = t.muLong * tp.gripLong * base * sens * (1 + dig);

  let sLat = magic(alpha, bLat, t.cLat, t.eLat);
  let sLong = magic(kappa, bLong, t.cLong, t.eLong);
  const tailLat = loose * t.looseTail * smoothstep(alphaPeak, alphaPeak * 3.2, aAbs);
  const tailLong = loose * t.looseTail * 0.7 * smoothstep(kappaPeak, kappaPeak * 3.5, kAbs);
  if (tailLat > 0) sLat += (sign(alpha) - sLat) * tailLat;
  if (tailLong > 0) sLong += (sign(kappa) - sLong) * tailLong;

  const capLat = muLat * load;
  const capLong = muLong * load;
  let fx = capLong * sLong;
  let fy = -capLat * sLat;   // opposes the slip; +alpha is sliding right

  const nx = capLong > 1e-6 ? fx / capLong : 0;
  const ny = capLat > 1e-6 ? fy / capLat : 0;
  const e = Math.sqrt(nx * nx + ny * ny);
  if (e > 1) {
    const s = 1 / e;
    fx *= s; fy *= s;
  }

  tyreOut.fx = fx;
  tyreOut.fy = fy;
  tyreOut.muLong = muLong;
  tyreOut.muLat = muLat;
  tyreOut.grip = e;
  return tyreOut;
}

// ---- construction --------------------------------------------------------

function makeWheel(index, setup) {
  const isFront = index < 2;
  const isLeft = (index & 1) === 0;
  const a = setup.wheelbase * (1 - setup.weightDistFront);
  const b = setup.wheelbase * setup.weightDistFront;
  const track = isFront ? setup.trackFront : setup.trackRear;
  const s = isFront ? setup.susp.front : setup.susp.rear;
  const corner = setup.mass * G0 * (isFront ? setup.weightDistFront : 1 - setup.weightDistFront) * 0.5;
  const staticDeflect = Math.min(corner / s.springRate, s.travel * 0.75);
  const restLength = s.travel - staticDeflect;

  return {
    index, isFront, isLeft,
    localPos: v3(isLeft ? -track * 0.5 : track * 0.5, setup.wheelRadius - setup.comHeight, isFront ? a : -b),
    anchorY: (setup.wheelRadius - setup.comHeight) + restLength,
    staticLoad: corner,
    worldPos: v3(),
    contact: false,
    contactPoint: v3(),
    contactNormal: v3(0, 1, 0),
    compression: staticDeflect / s.travel,
    strutLength: restLength,
    prevStrutLength: restLength,
    suspensionForce: corner,
    load: corner,
    steerAngle: 0,
    spinRate: 0,
    slipRatio: 0,
    slipAngle: 0,
    slipAngleLag: 0,
    slipSpeed: 0,
    fx: 0, fy: 0,
    muLong: 0, muLat: 0,
    driveTorque: 0,
    brakeTorque: 0,
    surfaceId: SURFACE.TARMAC,
    gripUsed: 0,
    skidding: false,
    dustRate: 0,
    temperature: 20,
    wear: 0,
    punctured: false,
    absLevel: 0,
    _fwd: v3(), _right: v3(), _vel: v3(), _r: v3(),
  };
}

export function createCar(specId, opts = {}) {
  const spec = carSpec(specId);
  const setup = clone(spec);
  if (opts.tune) applyTune(setup, opts.tune);

  const preset = opts.preset === "arcade" ? "arcade" : "sim";
  const assists = Object.assign({}, ASSIST_PRESETS[preset], opts.assists || {});

  const wb = setup.wheelbase;
  const trackAvg = (setup.trackFront + setup.trackRear) * 0.5;
  const isc = setup.inertiaScale || { pitch: 1, yaw: 1, roll: 1 };
  const inertia = setup.inertia || {
    pitch: setup.mass * (0.47 * wb) * (0.47 * wb) * (isc.pitch ?? 1),
    yaw: setup.mass * (0.50 * wb) * (0.50 * wb) * (isc.yaw ?? 1),
    roll: setup.mass * (0.40 * trackAvg) * (0.40 * trackAvg) * (isc.roll ?? 1),
  };

  setup.tyre.nominalLoad = setup.mass * G0 * 0.25;
  let peak = 0;
  for (const p of setup.engine.torque) peak = Math.max(peak, p[1]);
  setup.engine.peakTorque = peak;
  // A rally clutch is sized to hold full boosted torque with margin; that margin
  // is also what lets it slip a launch instead of stalling.
  setup.engine.clutchCapacity = setup.engine.clutchCapacity || peak * 1.9;

  const car = {
    spec, setup, assists, preset,
    mass: setup.mass,
    inertia,
    invI: { x: 1 / inertia.pitch, y: 1 / inertia.yaw, z: 1 / inertia.roll },
    pos: v3(), vel: v3(), quat: { x: 0, y: 0, z: 0, w: 1 },
    omega: v3(),
    yaw: 0, pitch: 0, roll: 0,
    yawRate: 0, pitchRate: 0, rollRate: 0,
    speed: 0, forwardSpeed: 0, lateralSpeed: 0, slipAngle: 0,
    lateralG: 0, longitudinalG: 0, verticalG: 1,
    engineRpm: setup.engine.idleRpm,
    engineOmega: setup.engine.idleRpm * RAD_PER_RPM,
    engineLoad: 0, engineTorque: 0, engineStalled: false, restartTimer: 0,
    turboBoost: 0, turboSpool: 0, limiterTimer: 0,
    gear: 1, pendingGear: 1, gearShiftTimer: 0, clutchEngage: 1, clutchSlip: 0,
    driveshaftRpm: 0, autoReverse: false, reverseDwell: 0,
    wheels: [],
    onGround: 4, airTime: 0, rolledOver: false, rolloverTimer: 0,
    damage: opts.damage || null,
    input: makeInput(),
    odometer: 0, distanceTravelled: 0, time: 0,
    tcCut: 0, escCut: 0,
    prevShiftUp: false, prevShiftDown: false,
    _right: v3(), _up: v3(), _fwd: v3(),
    _force: v3(), _torque: v3(), _tb: v3(), _acc: v3(),
    _surf: {
      props: null, surfaceId: SURFACE.TARMAC, onRoad: true, lateral: 0,
      signedLateral: 0, s: 0, edgeBlend: 0, roughness: 0, ruts: 0,
    },
    _n: v3(0, 1, 0),
    _dmg: {
      enginePower: 1, steeringPull: 0, brakeImbalance: 0, brakeLoss: 0,
      gripLoss: 0, susp: [1, 1, 1, 1], punctures: [0, 0, 0, 0],
    },
    _telemetry: null,
  };
  for (let i = 0; i < 4; i += 1) car.wheels.push(makeWheel(i, setup));
  resetCar(car, opts.x || 0, opts.y || 0, opts.z || 0, opts.yaw || 0);
  return car;
}

// Path-addressed override so a setup screen or a test can retune one number
// without rebuilding the tree: { "diffs.centreSplitFront": 0.6 }.
function applyTune(setup, tune) {
  for (const path of Object.keys(tune)) {
    const parts = path.split(".");
    let o = setup;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (o[parts[i]] === undefined) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = tune[path];
  }
}

// `y` is the ground height at the point, not the centre of mass — that is what
// a stage start line hands us.
export function resetCar(car, x, y, z, yaw) {
  const s = car.setup;
  car.pos.x = x; car.pos.y = y + s.comHeight; car.pos.z = z;
  car.vel.x = 0; car.vel.y = 0; car.vel.z = 0;
  car.omega.x = 0; car.omega.y = 0; car.omega.z = 0;
  quatFromEuler(car.quat, yaw, 0, 0);
  car.yaw = yaw; car.pitch = 0; car.roll = 0;
  car.yawRate = 0; car.pitchRate = 0; car.rollRate = 0;
  car.speed = 0; car.forwardSpeed = 0; car.lateralSpeed = 0; car.slipAngle = 0;
  car.lateralG = 0; car.longitudinalG = 0; car.verticalG = 1;
  car.engineOmega = s.engine.idleRpm * RAD_PER_RPM;
  car.engineRpm = s.engine.idleRpm;
  car.engineStalled = false; car.restartTimer = 0; car.limiterTimer = 0;
  car.turboBoost = 0; car.turboSpool = 0;
  car.gear = 1; car.pendingGear = 1; car.gearShiftTimer = 0;
  car.autoReverse = false; car.reverseDwell = 0;
  car.clutchEngage = 1; car.clutchSlip = 0; car.driveshaftRpm = 0;
  car.onGround = 4; car.airTime = 0; car.rolledOver = false; car.rolloverTimer = 0;
  car.tcCut = 0; car.escCut = 0;
  car.prevShiftUp = false; car.prevShiftDown = false;
  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    const sp = w.isFront ? s.susp.front : s.susp.rear;
    const deflect = Math.min(w.staticLoad / sp.springRate, sp.travel * 0.75);
    w.strutLength = sp.travel - deflect;
    w.prevStrutLength = w.strutLength;
    w.compression = deflect / sp.travel;
    w.suspensionForce = w.staticLoad;
    w.load = w.staticLoad;
    w.contact = true;
    w.spinRate = 0; w.slipRatio = 0; w.slipAngle = 0; w.slipAngleLag = 0;
    w.fx = 0; w.fy = 0; w.gripUsed = 0; w.skidding = false; w.dustRate = 0;
    w.steerAngle = 0; w.absLevel = 0; w.driveTorque = 0; w.brakeTorque = 0;
    w.temperature = 20;
  }
  return car;
}

// A rolled car goes back on its wheels facing the way it was pointing. Height
// comes from the world because physics.js does not own the terrain.
export function recoverCar(car, world) {
  const groundY = world && world.heightAt
    ? world.heightAt(car.pos.x, car.pos.z)
    : car.pos.y - car.setup.comHeight;
  return resetCar(car, car.pos.x, groundY + 0.02, car.pos.z, car.yaw);
}

// ---- engine + drivetrain helpers ----------------------------------------

function torqueAt(curve, rpm) {
  const n = curve.length;
  const first = curve[0];
  const last = curve[n - 1];
  if (rpm <= first[0]) return first[1] * Math.max(rpm / first[0], 0);
  if (rpm >= last[0]) return Math.max(last[1] * (1 - 0.55 * (rpm - last[0]) / 1200), 0);
  for (let i = 1; i < n; i += 1) {
    if (rpm <= curve[i][0]) {
      const a = curve[i - 1];
      const b = curve[i];
      return a[1] + (b[1] - a[1]) * ((rpm - a[0]) / (b[0] - a[0]));
    }
  }
  return last[1];
}

function gearRatio(car) {
  const gb = car.setup.gearbox;
  if (car.gear === 0) return 0;
  if (car.gear < 0) return -gb.reverse;
  return gb.ratios[car.gear - 1] || 0;
}

// Reports whether the shift was taken, because brake-to-reverse may only arm its
// pedal swap once the box has actually accepted reverse.
function requestGear(car, g) {
  const gb = car.setup.gearbox;
  const want = clamp(g | 0, -1, gb.ratios.length);
  if (want === car.gear || car.gearShiftTimer > 0) return false;
  if (want < 0 && car.forwardSpeed > 2) return false;   // no reverse at speed
  car.pendingGear = want;
  car.gearShiftTimer = gb.shiftTime;
  return true;
}

// A differential's locking torque may only ever pull the two shafts together,
// never past each other in a single step — that bound is what keeps a locked
// centre diff from ringing at 120 Hz.
function lockTorque(d, tIn, dOmega, inertia, dt, shareA, shareB) {
  const cap = d.preload + d.ramp * Math.abs(tIn);
  if (cap <= 0) return 0;
  const stable = inertia * Math.abs(dOmega) / (2 * Math.max(dt, 1e-5));
  // A clutch-pack diff biases torque; only its preload can actually drag the
  // faster shaft backwards. Without that bound a big centre split runs away and
  // ends up driving one axle in reverse.
  const bias = d.preload + Math.min(Math.abs(shareA), Math.abs(shareB));
  const lim = Math.min(cap, stable, d.maxLock, bias);
  const raw = d.viscous * dOmega + d.preload * Math.tanh(dOmega * 4);
  return clamp(raw, -lim, lim);
}

// damage.js owns the ledger; we only ever read multipliers off it, and it may
// legitimately be null for a fresh car or a test.
function readDamage(car) {
  const d = car._dmg;
  d.enginePower = 1; d.steeringPull = 0; d.brakeImbalance = 0;
  d.brakeLoss = 0; d.gripLoss = 0;
  for (let i = 0; i < 4; i += 1) { d.susp[i] = 1; d.punctures[i] = 0; }
  const src = car.damage;
  if (!src || typeof src !== "object") return d;
  const e = (src.effects && typeof src.effects === "object") ? src.effects
    : (src.multipliers && typeof src.multipliers === "object") ? src.multipliers
      : src;
  d.enginePower = clamp(finite(e.enginePower ?? e.engine ?? e.power, 1), 0, 1);
  d.steeringPull = clamp(finite(e.steeringPull ?? e.pull, 0), -0.3, 0.3);
  d.brakeImbalance = clamp(finite(e.brakeImbalance ?? e.brakeBias, 0), -1, 1);
  d.brakeLoss = clamp(1 - finite(e.brakes ?? e.brakePower ?? 1, 1), 0, 0.9);
  d.gripLoss = clamp(1 - finite(e.grip ?? 1, 1), 0, 0.8);
  const sus = e.suspension ?? e.susp ?? e.suspensionDeflection;
  if (Array.isArray(sus)) {
    for (let i = 0; i < 4; i += 1) d.susp[i] = clamp(finite(sus[i], 1), 0.15, 1);
  } else if (Number.isFinite(sus)) {
    for (let i = 0; i < 4; i += 1) d.susp[i] = clamp(sus, 0.15, 1);
  }
  const p = e.punctures ?? e.puncture ?? e.tyres;
  if (Array.isArray(p)) {
    for (let i = 0; i < 4; i += 1) d.punctures[i] = clamp(finite(p[i], 0), 0, 1);
  } else if (Number.isFinite(p)) {
    for (let i = 0; i < 4; i += 1) d.punctures[i] = clamp(p, 0, 1);
  }
  return d;
}

const FLAT_SURFACE = surfaceProps(SURFACE.TARMAC);
const ZERO_WIND = { x: 0, y: 0, z: 0 };

export function stepCar(car, input, world, dt) {
  const h = clamp(finite(dt, 1 / 120), 1e-5, 1 / 60);
  const s = car.setup;
  const eng = s.engine;
  const gb = s.gearbox;
  const a = car.assists;
  const dmg = readDamage(car);
  const g = finite(world && world.gravity, G0);
  const gripScale = clamp(finite(world && world.gripScale, 1), 0.05, 2) * (1 - dmg.gripLoss);
  const wind = (world && world.wind) || ZERO_WIND;
  const heightAt = (world && world.heightAt) ? world.heightAt : null;

  const raw = input || car.input;
  const steerIn = clamp(finite(raw.steer, 0), -1, 1);
  const throttlePedal = saturate(finite(raw.throttle, 0));
  const brakePedal = saturate(finite(raw.brake, 0));
  const handbrakeIn = saturate(finite(raw.handbrake, 0));
  const clutchIn = saturate(finite(raw.clutch, 0));

  quatBasis(car.quat, car._right, car._up, car._fwd);
  const right = car._right;
  const up = car._up;
  const fwd = car._fwd;

  const ox = car.omega.x, oy = car.omega.y, oz = car.omega.z;
  const owx = right.x * ox + up.x * oy + fwd.x * oz;
  const owy = right.y * ox + up.y * oy + fwd.y * oz;
  const owz = right.z * ox + up.z * oy + fwd.z * oz;

  const speed = Math.sqrt(car.vel.x * car.vel.x + car.vel.z * car.vel.z);

  // --- shifting ---
  const upEdge = !!raw.shiftUp && !car.prevShiftUp;
  const downEdge = !!raw.shiftDown && !car.prevShiftDown;
  car.prevShiftUp = !!raw.shiftUp;
  car.prevShiftDown = !!raw.shiftDown;

  if (car.gearShiftTimer > 0) {
    car.gearShiftTimer -= h;
    if (car.gearShiftTimer <= gb.shiftTime * 0.5 && car.gear !== car.pendingGear) car.gear = car.pendingGear;
    if (car.gearShiftTimer < 0) car.gearShiftTimer = 0;
  } else {
    if (Number.isFinite(raw.gear) && raw.gear !== null) requestGear(car, raw.gear);
    else if (upEdge) requestGear(car, car.gear + 1);
    else if (downEdge) requestGear(car, car.gear - 1);
    else if (a.autoShift && car.gear > 0) {
      // Every decision is answerable to the ROAD speed, because during wheelspin
      // the engine is being turned by the spinning wheels and its rpm says nothing
      // about how fast the car is going. Left on engine rpm alone the box walks
      // itself to top gear at walking pace on an icy climb and then has no first
      // gear left to pull away in.
      const roadRpm = (Math.abs(car.forwardSpeed) / s.wheelRadius) * gb.final * RPM_PER_RAD;
      const here = roadRpm * gb.ratios[car.gear - 1];
      const next = car.gear < gb.ratios.length ? roadRpm * gb.ratios[car.gear] : 0;
      // The engine still calls the upshift — that is the rpm the driver and the
      // limiter see — but only into a gear the car is genuinely travelling fast
      // enough to hold.
      if (car.engineRpm > eng.shiftUpRpm && car.gear < gb.ratios.length && next > eng.shiftDownRpm) {
        requestGear(car, car.gear + 1);
      } else if (here < eng.shiftDownRpm && car.gear > 1) {
        requestGear(car, car.gear - 1);
      }
    }
    // A gear the driver picks himself ends the mode below: the pedal swap belongs
    // to brake-to-reverse, not to whatever gear it happened to leave the box in.
    if (car.autoReverse && car.pendingGear >= 0) { car.autoReverse = false; car.reverseDwell = 0; }
  }

  // --- brake-to-reverse ---
  // No rally driver reaches for a reverse gear: he stops, keeps the brake down,
  // and the car backs out of the ditch. The same hold then drives it, because the
  // swap below hands the brake pedal to the engine. Throttle does the mirror of
  // it, so the player can never be stranded facing backwards.
  //
  // The handbrake is a driver holding the car still and the clutch pedal is the
  // start-line hold — neither may be read as asking for reverse.
  const settled = handbrakeIn <= 0.05 && clutchIn <= 0.5 && speed < REVERSE_STOP;
  const wantReverse = settled && car.gear > 0 && brakePedal > 0.5 && throttlePedal < 0.05;
  const wantForward = settled && car.autoReverse && car.gear < 0
    && throttlePedal > 0.5 && brakePedal < 0.05;
  if (wantReverse || wantForward) {
    car.reverseDwell += h;
    if (car.reverseDwell >= REVERSE_DWELL && requestGear(car, wantReverse ? -1 : 1)) {
      car.autoReverse = wantReverse;
      car.reverseDwell = 0;
    }
  } else {
    car.reverseDwell = 0;
  }
  const swapPedals = car.autoReverse && car.gear < 0;
  const throttleIn = swapPedals ? brakePedal : throttlePedal;
  const brakeIn = swapPedals ? throttlePedal : brakePedal;

  // --- steering (assists fold into the angle, never into a second code path) ---
  let maxSteer = s.steer.maxAngle;
  if (a.speedSensitiveSteer) maxSteer *= lerp(1, 0.38, saturate(speed / s.steer.speedFalloff));
  let steerCmd = steerIn * maxSteer;
  if (a.steerAssist > 0) {
    const want = clamp(-car.slipAngle * 1.15, -maxSteer, maxSteer);
    const blend = a.steerAssist * saturate((Math.abs(car.slipAngle) - 0.06) / 0.22);
    steerCmd = lerp(steerCmd, want, blend);
  }
  steerCmd += dmg.steeringPull * maxSteer;
  steerCmd = clamp(steerCmd, -maxSteer * 1.2, maxSteer * 1.2);

  const ack = s.steer.ackermann;
  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    if (w.isFront) {
      const inner = (steerCmd > 0) === w.isLeft;
      const toe = w.isLeft ? -s.steer.toeFront : s.steer.toeFront;
      w.steerAngle = steerCmd * (inner ? 1 + ack : 1 - ack) + toe;
    } else {
      w.steerAngle = w.isLeft ? -s.steer.toeRear : s.steer.toeRear;
    }
  }

  // --- suspension geometry pass ---
  let contacts = 0;
  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    const sp = w.isFront ? s.susp.front : s.susp.rear;
    const health = dmg.susp[i];
    const travel = sp.travel * (0.55 + 0.45 * health);
    const anchorX = car.pos.x + right.x * w.localPos.x + up.x * w.anchorY + fwd.x * w.localPos.z;
    const anchorY = car.pos.y + right.y * w.localPos.x + up.y * w.anchorY + fwd.y * w.localPos.z;
    const anchorZ = car.pos.z + right.z * w.localPos.x + up.z * w.anchorY + fwd.z * w.localPos.z;
    const probeX = anchorX - up.x * w.prevStrutLength;
    const probeZ = anchorZ - up.z * w.prevStrutLength;

    const groundY = heightAt ? finite(heightAt(probeX, probeZ), 0) : 0;
    let nx = 0, ny = 1, nz = 0;
    if (world && world.normalAt) {
      const n = world.normalAt(probeX, probeZ, car._n);
      nx = finite(n.x, 0); ny = finite(n.y, 1); nz = finite(n.z, 0);
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
    }
    const radius = s.wheelRadius * (1 - 0.14 * dmg.punctures[i]);
    const targetY = groundY + radius / Math.max(ny, 0.35);
    let L = (anchorY - targetY) / Math.max(up.y, 0.35);
    const contact = L < travel;
    if (!(L > 0)) L = 0;
    if (L > travel) L = travel;

    w._travel = travel;
    w._radius = radius;
    w._anchorX = anchorX; w._anchorY = anchorY; w._anchorZ = anchorZ;
    w.contact = contact;
    w.contactNormal.x = nx; w.contactNormal.y = ny; w.contactNormal.z = nz;
    w.strutLength = L;
    w.compression = travel > 1e-6 ? saturate((travel - L) / travel) : 0;
    w.worldPos.x = anchorX - up.x * L;
    w.worldPos.y = anchorY - up.y * L;
    w.worldPos.z = anchorZ - up.z * L;
    w.contactPoint.x = w.worldPos.x - nx * radius;
    w.contactPoint.y = w.worldPos.y - ny * radius;
    w.contactPoint.z = w.worldPos.z - nz * radius;
    if (contact) contacts += 1;
  }

  // --- drivetrain ---
  const drive = s.drive;
  const split = drive === "FWD" ? 1 : drive === "RWD" ? 0 : clamp(s.diffs.centreSplitFront, 0, 1);
  const wF = 0.5 * (car.wheels[0].spinRate + car.wheels[1].spinRate);
  const wR = 0.5 * (car.wheels[2].spinRate + car.wheels[3].spinRate);
  const wDrive = split * wF + (1 - split) * wR;
  const ratio = gearRatio(car);
  const drivenRatio = ratio * gb.final;
  const wIn = wDrive * drivenRatio;
  car.driveshaftRpm = Math.abs(wIn) * RPM_PER_RAD;

  let rpm = car.engineOmega * RPM_PER_RAD;
  if (car.limiterTimer > 0) car.limiterTimer -= h;
  if (rpm > eng.limiterRpm) car.limiterTimer = eng.limiterCut;

  let throttle = throttleIn * (1 - car.tcCut);
  // Reverse is geared like first, so left alone it is worth 60-plus km/h backwards.
  // The throttle fades out across the 2 m/s below the cap, so the car settles on it
  // instead of surging against a hard cut; the idle line below still holds the
  // engine up.
  if (car.gear < 0) throttle *= 1 - saturate((-car.forwardSpeed - REVERSE_CAP + 2) / 2);
  if (rpm < eng.idleRpm && !car.engineStalled) {
    throttle = Math.max(throttle, saturate((eng.idleRpm - rpm) / (eng.idleRpm * 0.5)) * 0.42);
  }
  const fuelCut = car.limiterTimer > 0 ? 0 : 1;

  if (eng.maxBoost > 0) {
    const rpmF = saturate((rpm - eng.boostSpoolRpm) / Math.max(eng.boostFullRpm - eng.boostSpoolRpm, 1));
    let target = eng.maxBoost * rpmF * Math.pow(saturate(throttle), 0.7);
    // Anti-lag burns fuel in the exhaust to keep the turbine lit off-throttle —
    // the reason a works car has boost the instant the driver comes back on it.
    if (eng.antiLag > 0 && throttleIn < 0.25 && rpm > eng.boostSpoolRpm) {
      target = Math.max(target, eng.maxBoost * eng.antiLag * rpmF);
    }
    const rate = target > car.turboBoost ? eng.spoolUp : eng.spoolDown;
    car.turboBoost = Math.min(damp(car.turboBoost, target, rate, h), eng.maxBoost);
    car.turboSpool = saturate(car.turboBoost / eng.maxBoost);
  } else {
    car.turboBoost = 0;
    car.turboSpool = 0;
  }
  const boostMul = eng.maxBoost > 0 ? lerp(eng.naFraction, 1, car.turboSpool) : 1;

  let indicated = torqueAt(eng.torque, rpm) * boostMul * throttle * fuelCut * dmg.enginePower;
  if (car.engineStalled) indicated = 0;
  const friction = eng.frictionA + eng.frictionB * car.engineOmega;
  const pumping = eng.engineBrake * car.engineOmega * (1 - throttle);
  const Te = indicated - friction - pumping;

  let engage = 1;
  if (car.gearShiftTimer > 0) {
    engage = saturate((gb.shiftTime * 0.5 - car.gearShiftTimer) / (gb.shiftTime * 0.5));
  }
  engage *= 1 - clutchIn;
  if (a.autoClutch) {
    // Not an on/off aid: a servo that holds the engine on its launch rpm while it
    // feeds torque in, locks solid the moment the driveline catches the engine,
    // and lets go before the engine falls under idle.
    //
    // The band has to open AT the launch rpm rather than at half of it. The
    // clutch's torque-per-rpm across the band is far stiffer than any engine's
    // torque curve, so the engine settles wherever the two cross: open the band
    // early and a laggy motor is pinned down in its lag hole making a third of
    // its torque. That is what made the 640 the slowest car off the line and what
    // left every car unable to pull away up a loose climb.
    const dlRpm = Math.abs(wIn) * RPM_PER_RAD;
    const launch = lerp(eng.idleRpm * 1.25, eng.shiftUpRpm * 0.52, throttleIn);
    const servo = saturate((rpm - launch) / (launch * 0.30));
    const matched = 1 - smoothstep(0.10, 0.55, Math.abs(rpm - dlRpm) / Math.max(rpm, 800));
    // Referenced to idle, not to the stall line: a driver slips the clutch to keep
    // the engine alive on a climb. A guard that only opens as the engine dies has
    // already let the driveline drag it well under idle, where it makes nothing.
    const stallGuard = smoothstep(eng.idleRpm, eng.idleRpm * 1.40, rpm);
    const auto = Math.min(Math.max(matched, servo * Math.max(throttleIn, 0.12)), stallGuard);
    engage = Math.min(engage, auto);
  }
  // The hydraulic handbrake trips the clutch, which is the only reason a locked
  // centre diff car can be thrown into a hairpin without stalling.
  if (handbrakeIn > 0.05 && drive !== "FWD") engage *= 1 - 0.9 * handbrakeIn;
  if (ratio === 0) engage = 0;
  car.clutchEngage = engage;

  const nDriven = drive === "4WD" ? 4 : 2;
  const iWheels = s.wheelInertia * nDriven;
  // The clutch is solved implicitly: it removes a fixed fraction of the speed
  // difference between the two inertias the integrator actually carries, and that
  // fraction is 0.7 only while iRef is those inertias and nothing else. Counting a
  // gearbox inertia no body owns here inflates it, and in a tall first gear — where
  // the wheels reflect through the square of a 14:1 reduction and all but vanish —
  // the coupling overshoots into a limit cycle that reads as permanent wheelspin
  // and pins the car at a third of the speed the gear allows.
  const iRef = drivenRatio !== 0 ? iWheels / (drivenRatio * drivenRatio) : 1e6;
  const iEff = (eng.inertia * iRef) / (eng.inertia + iRef);
  const clutchDamp = 0.7 * iEff / h;
  const slipRate = car.engineOmega - wIn;
  let Tc = ratio === 0 ? 0 : clamp(clutchDamp * slipRate, -eng.clutchCapacity, eng.clutchCapacity) * engage;
  car.clutchSlip = Math.abs(slipRate);

  car.engineOmega += ((Te - Tc) / eng.inertia) * h;
  if (!(car.engineOmega > 0)) car.engineOmega = 0;
  rpm = car.engineOmega * RPM_PER_RAD;
  if (!car.engineStalled && rpm < eng.stallRpm && engage > 0.25 && ratio !== 0) {
    car.engineStalled = true;
    car.restartTimer = eng.autoRestart;
  }
  if (car.engineStalled) {
    car.restartTimer -= h;
    if (car.restartTimer <= 0) {
      car.engineStalled = false;
      car.engineOmega = eng.idleRpm * RAD_PER_RPM;
    }
  }
  car.engineRpm = car.engineOmega * RPM_PER_RAD;
  car.engineTorque = Te;
  car.engineLoad = saturate(Math.abs(indicated) / Math.max(eng.peakTorque, 1));

  const Tout = Tc * drivenRatio * gb.efficiency;
  let Tfront = 0;
  let Trear = 0;
  if (drive === "FWD") {
    Tfront = Tout;
  } else if (drive === "RWD") {
    Trear = Tout;
  } else {
    const lock = lockTorque(s.diffs.centre, Tout, wF - wR, s.wheelInertia * 2, h,
      split * Tout, (1 - split) * Tout);
    Tfront = split * Tout - lock;
    Trear = (1 - split) * Tout + lock;
  }
  const lockF = lockTorque(s.diffs.front, Tfront, car.wheels[0].spinRate - car.wheels[1].spinRate,
    s.wheelInertia, h, 0.5 * Tfront, 0.5 * Tfront);
  const lockR = lockTorque(s.diffs.rear, Trear, car.wheels[2].spinRate - car.wheels[3].spinRate,
    s.wheelInertia, h, 0.5 * Trear, 0.5 * Trear);
  car.wheels[0].driveTorque = 0.5 * Tfront - lockF;
  car.wheels[1].driveTorque = 0.5 * Tfront + lockF;
  car.wheels[2].driveTorque = 0.5 * Trear - lockR;
  car.wheels[3].driveTorque = 0.5 * Trear + lockR;

  // --- brakes, ABS, stability ---
  const bt = s.brakes;
  const braked = brakeIn * bt.maxTorque * (1 - dmg.brakeLoss);
  let escLeft = 0;
  let escRight = 0;
  if (a.stability > 0 && contacts > 1 && speed > 6) {
    const K = 0.0024;
    const desired = -speed * steerCmd / (s.wheelbase * (1 + K * speed * speed));
    const err = car.yawRate - desired;
    const t = clamp(err * a.stability * 2200, -2600, 2600);
    if (t > 0) escLeft = t; else escRight = -t;   // too much right yaw -> brake the left side
  }
  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    const axle = w.isFront ? bt.bias : 1 - bt.bias;
    const imb = w.isLeft ? 1 + dmg.brakeImbalance : 1 - dmg.brakeImbalance;
    let t = braked * axle * 0.5 * imb;
    t += w.isLeft ? escLeft : escRight;
    if (a.abs && speed > 2.5) {
      const lockUp = w.slipRatio < -bt.absSlip ? 1 : 0;
      w.absLevel = damp(w.absLevel, lockUp, 26, h);
      t *= 1 - 0.85 * w.absLevel;
    } else {
      w.absLevel = 0;
    }
    if (!w.isFront) t += handbrakeIn * bt.handbrakeTorque * 0.5;
    w.brakeTorque = t;
  }

  // --- tyres, wheel spin, force accumulation ---
  let fX = 0, fY = 0, fZ = 0;
  let tX = 0, tY = 0, tZ = 0;
  let maxDriveSlip = 0;

  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    const sp = w.isFront ? s.susp.front : s.susp.rear;
    const health = dmg.susp[i];
    const radius = w._radius;

    let force = 0;
    if (w.contact) {
      const springRate = sp.springRate * (0.35 + 0.65 * health);
      const deflect = w._travel - w.strutLength;
      force = springRate * deflect;
      if (w.compression > sp.bumpStop) {
        const over = (w.compression - sp.bumpStop) * w._travel;
        force += sp.bumpStopRate * over * over / 0.03;
      }
      const rate = (w.prevStrutLength - w.strutLength) / h;
      force += clamp((rate > 0 ? sp.bump : sp.rebound) * rate, -32000, 42000);

      const other = car.wheels[i ^ 1];
      const otherDeflect = other.contact ? other._travel - other.strutLength : 0;
      force += sp.arb * (deflect - otherDeflect);
      if (force < 0) force = 0;
    }
    w.suspensionForce = force;
    w.load = force;
    w.prevStrutLength = w.strutLength;

    const nx = w.contactNormal.x, ny = w.contactNormal.y, nz = w.contactNormal.z;
    const rx = w.contactPoint.x - car.pos.x;
    const ry = w.contactPoint.y - car.pos.y;
    const rz = w.contactPoint.z - car.pos.z;

    // surface under this specific wheel
    let tp = FLAT_SURFACE;
    if (world && world.surfaceAt) {
      const so = world.surfaceAt(w.contactPoint.x, w.contactPoint.z, car._surf);
      tp = (so && so.props) || surfaceProps(so ? so.surfaceId : SURFACE.TARMAC);
    }
    w.surfaceId = tp.id;

    if (!w.contact) {
      w.fx = 0; w.fy = 0; w.gripUsed = 0; w.skidding = false; w.dustRate = 0;
      w.slipRatio = 0; w.slipSpeed = 0;
      w.muLong = 0; w.muLat = 0;
      const dw = (w.driveTorque / s.wheelInertia) * h;
      let spin = w.spinRate + dw - w.spinRate * 0.4 * h;
      const dwB = (w.brakeTorque / s.wheelInertia) * h;
      spin = Math.abs(spin) <= dwB ? 0 : spin - Math.sign(spin) * dwB;
      w.spinRate = finite(spin, 0);
      w.temperature = damp(w.temperature, 20, s.tyre.coolRate, h);
      continue;
    }

    // wheel frame, projected into the contact plane
    const cd = Math.cos(w.steerAngle);
    const sd = Math.sin(w.steerAngle);
    let wfx = fwd.x * cd - right.x * sd;
    let wfy = fwd.y * cd - right.y * sd;
    let wfz = fwd.z * cd - right.z * sd;
    const dn = wfx * nx + wfy * ny + wfz * nz;
    wfx -= nx * dn; wfy -= ny * dn; wfz -= nz * dn;
    const wl = Math.sqrt(wfx * wfx + wfy * wfy + wfz * wfz) || 1;
    wfx /= wl; wfy /= wl; wfz /= wl;
    const wrx = ny * wfz - nz * wfy;
    const wry = nz * wfx - nx * wfz;
    const wrz = nx * wfy - ny * wfx;

    const vpx = car.vel.x + owy * rz - owz * ry;
    const vpy = car.vel.y + owz * rx - owx * rz;
    const vpz = car.vel.z + owx * ry - owy * rx;
    const vLong = vpx * wfx + vpy * wfy + vpz * wfz;
    const vLat = vpx * wrx + vpy * wry + vpz * wrz;

    const slipVel = w.spinRate * radius - vLong;
    const kappa = clamp(slipVel / Math.max(Math.abs(vLong), 2.0), -6, 6);
    const alphaRaw = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.8));
    // Relaxation length: lateral force builds over distance rolled, not time —
    // this is the delay a driver feels between turning in and the car biting.
    const relax = Math.max(Math.abs(vLong), 0.6) / s.tyre.relaxLength;
    w.slipAngleLag = finite(damp(w.slipAngleLag, alphaRaw, relax, h), alphaRaw);
    const alpha = w.slipAngleLag;

    const punctureMul = 1 - 0.62 * dmg.punctures[i];
    const wearMul = 1 - 0.18 * w.wear;
    const heatMul = 1 - 0.22 * saturate((w.temperature - 130) / 130);
    const r = tyreForces(s.tyre, tp, force, kappa, alpha, gripScale * wearMul * heatMul, punctureMul);
    let fxT = r.fx;
    const fyT = r.fy;

    // The tyre may remove the slip it is fed, never reverse it inside one step.
    const tyreDelta = (-fxT * radius * radius / s.wheelInertia) * h;
    if (slipVel !== 0 && tyreDelta * slipVel < 0 && Math.abs(tyreDelta) > Math.abs(slipVel)) {
      fxT *= Math.abs(slipVel) / Math.abs(tyreDelta);
    }

    let spin = w.spinRate + ((w.driveTorque - fxT * radius) / s.wheelInertia) * h;
    const dwB = (w.brakeTorque / s.wheelInertia) * h;
    spin = Math.abs(spin) <= dwB ? 0 : spin - Math.sign(spin) * dwB;
    w.spinRate = finite(spin, 0);

    w.fx = fxT;
    w.fy = fyT;
    w.muLong = r.muLong;
    w.muLat = r.muLat;
    w.slipRatio = kappa;
    w.slipAngle = alpha;
    w.slipSpeed = Math.sqrt(slipVel * slipVel + vLat * vLat);
    w.gripUsed = r.grip;
    w.skidding = r.grip > 0.94 && w.slipSpeed > 1.6;
    w.dustRate = tp.dustRate * saturate(w.slipSpeed / 20) * (0.25 + 0.75 * saturate(Math.abs(vLong) / 20));
    w.punctured = dmg.punctures[i] > 0.5;
    w.temperature = damp(w.temperature, 20 + 150 * saturate(w.slipSpeed * r.grip / 14), s.tyre.heatRate * w.slipSpeed + s.tyre.coolRate, h);
    w.wear = saturate(w.wear + s.tyre.wearRate * w.slipSpeed * r.grip * h * 60);

    // rolling resistance + ploughing: real losses, kept outside the friction
    // ellipse because they are not slip-generated forces
    const roll = -tp.rollingResistance * force * Math.tanh(Math.abs(vLong) / 0.6) * sign(vLong);
    const plough = -tp.dragOffRoad * 0.25 * vLong * Math.abs(vLong) * w.compression;
    const along = fxT + roll + plough;

    const wx = wfx * along + wrx * fyT + nx * force;
    const wy = wfy * along + wry * fyT + ny * force;
    const wz = wfz * along + wrz * fyT + nz * force;
    fX += wx; fY += wy; fZ += wz;
    tX += ry * wz - rz * wy;
    tY += rz * wx - rx * wz;
    tZ += rx * wy - ry * wx;

    if (Math.abs(w.driveTorque) > 1) maxDriveSlip = Math.max(maxDriveSlip, kappa);
  }

  if (a.tractionControl > 0) {
    const want = maxDriveSlip > 0.16 ? a.tractionControl : 0;
    car.tcCut = damp(car.tcCut, want, want > car.tcCut ? 26 : 9, h);
  } else {
    car.tcCut = 0;
  }

  // --- aerodynamics ---
  const rvx = car.vel.x - finite(wind.x, 0);
  const rvy = car.vel.y - finite(wind.y, 0);
  const rvz = car.vel.z - finite(wind.z, 0);
  const rv = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
  const q = 0.5 * RHO * rv * rv;
  const kDrag = 0.5 * RHO * s.aero.dragArea * rv;
  fX -= kDrag * rvx;
  fY -= kDrag * rvy;
  fZ -= kDrag * rvz;

  const aFront = s.wheelbase * (1 - s.weightDistFront);
  const aRear = -s.wheelbase * s.weightDistFront;
  const dfF = q * s.aero.liftFront;
  const dfR = q * s.aero.liftRear;
  fX -= up.x * (dfF + dfR);
  fY -= up.y * (dfF + dfR);
  fZ -= up.z * (dfF + dfR);
  let tbX = -(dfF * aFront + dfR * aRear);   // body-X moment from downforce arms
  let tbY = 0;
  let tbZ = 0;

  fY -= car.mass * g;

  // world torque -> body
  tbX += tX * right.x + tY * right.y + tZ * right.z;
  tbY += tX * up.x + tY * up.y + tZ * up.z;
  tbZ += tX * fwd.x + tY * fwd.y + tZ * fwd.z;

  if (contacts === 0) {
    // Airborne trim: a rally car noses down over a big jump because of where its
    // aero centre sits, and the front wheels give a little yaw authority. Both
    // are what make a landing something the driver can aim.
    tbX += s.aero.pitchTrim * q - s.aero.pitchDamp * q * car.omega.x;
    tbZ -= s.aero.rollDamp * q * car.omega.z;
    tbY -= s.aero.yawDamp * q * car.omega.y;
    tbY -= steerCmd * s.aero.airYaw * saturate(rv / 18);
    car.airTime += h;
  } else {
    car.airTime = 0;
  }

  // --- integrate ---
  const ax = fX / car.mass;
  const ay = fY / car.mass;
  const az = fZ / car.mass;

  const gyroX = car.omega.y * (car.inertia.roll * car.omega.z) - car.omega.z * (car.inertia.yaw * car.omega.y);
  const gyroY = car.omega.z * (car.inertia.pitch * car.omega.x) - car.omega.x * (car.inertia.roll * car.omega.z);
  const gyroZ = car.omega.x * (car.inertia.yaw * car.omega.y) - car.omega.y * (car.inertia.pitch * car.omega.x);
  car.omega.x = finite(car.omega.x + (tbX - gyroX) * car.invI.x * h, 0);
  car.omega.y = finite(car.omega.y + (tbY - gyroY) * car.invI.y * h, 0);
  car.omega.z = finite(car.omega.z + (tbZ - gyroZ) * car.invI.z * h, 0);
  const oMax = 24;
  car.omega.x = clamp(car.omega.x, -oMax, oMax);
  car.omega.y = clamp(car.omega.y, -oMax, oMax);
  car.omega.z = clamp(car.omega.z, -oMax, oMax);

  car.vel.x = finite(car.vel.x + ax * h, 0);
  car.vel.y = finite(car.vel.y + ay * h, 0);
  car.vel.z = finite(car.vel.z + az * h, 0);
  car.pos.x = finite(car.pos.x + car.vel.x * h, car.pos.x);
  car.pos.y = finite(car.pos.y + car.vel.y * h, car.pos.y);
  car.pos.z = finite(car.pos.z + car.vel.z * h, car.pos.z);

  quatIntegrate(car.quat, car.omega.x, car.omega.y, car.omega.z, h);
  quatBasis(car.quat, right, up, fwd);

  // --- derived state ---
  car.yaw = Math.atan2(fwd.x, fwd.z);
  car.pitch = Math.asin(clamp(fwd.y, -1, 1));
  car.roll = Math.atan2(-right.y, up.y);
  car.yawRate = right.y * car.omega.x + up.y * car.omega.y + fwd.y * car.omega.z;
  car.pitchRate = -car.omega.x;
  car.rollRate = -car.omega.z;

  car.speed = Math.sqrt(car.vel.x * car.vel.x + car.vel.z * car.vel.z);
  car.forwardSpeed = car.vel.x * fwd.x + car.vel.y * fwd.y + car.vel.z * fwd.z;
  car.lateralSpeed = car.vel.x * right.x + car.vel.y * right.y + car.vel.z * right.z;
  car.slipAngle = Math.atan2(car.lateralSpeed, Math.max(Math.abs(car.forwardSpeed), 0.5));

  const sx = ax;
  const sy = ay + g;
  const sz = az;
  car.longitudinalG = (sx * fwd.x + sy * fwd.y + sz * fwd.z) / G0;
  car.lateralG = (sx * right.x + sy * right.y + sz * right.z) / G0;
  car.verticalG = (sx * up.x + sy * up.y + sz * up.z) / G0;

  car.onGround = contacts;
  if (up.y < 0.25) car.rolloverTimer += h; else car.rolloverTimer = 0;
  car.rolledOver = car.rolloverTimer > 1.2;

  const dist = car.speed * h;
  car.odometer += dist;
  car.distanceTravelled += dist;
  car.time += h;

  const ci = car.input;
  ci.steer = steerIn;
  ci.throttle = throttle;
  ci.brake = brakeIn;
  ci.handbrake = handbrakeIn;
  ci.clutch = clutchIn;
  ci.shiftUp = !!raw.shiftUp;
  ci.shiftDown = !!raw.shiftDown;
  ci.gear = car.gear;
  ci.steerAngle = steerCmd;

  return car;
}

// ---- telemetry -----------------------------------------------------------

export function carTelemetry(car) {
  let t = car._telemetry;
  if (!t) {
    t = car._telemetry = {
      speedKph: 0, rpm: 0, rpmLimit: 0, gear: 0, boost: 0, spool: 0,
      lateralG: 0, longitudinalG: 0, verticalG: 0, slipAngle: 0, yawRate: 0,
      onGround: 0, airTime: 0, rolledOver: false, gripUsed: 0, engineLoad: 0,
      clutch: 0, stalled: false, odometer: 0, surface: "",
      load: [0, 0, 0, 0], slipRatio: [0, 0, 0, 0], wheelSlipAngle: [0, 0, 0, 0],
      compression: [0, 0, 0, 0], fx: [0, 0, 0, 0], fy: [0, 0, 0, 0],
      grip: [0, 0, 0, 0], temperature: [0, 0, 0, 0], spinRate: [0, 0, 0, 0],
    };
  }
  t.speedKph = car.speed * 3.6;
  t.rpm = car.engineRpm;
  t.rpmLimit = car.setup.engine.limiterRpm;
  t.gear = car.gear;
  t.boost = car.turboBoost;
  t.spool = car.turboSpool;
  t.lateralG = car.lateralG;
  t.longitudinalG = car.longitudinalG;
  t.verticalG = car.verticalG;
  t.slipAngle = car.slipAngle;
  t.yawRate = car.yawRate;
  t.onGround = car.onGround;
  t.airTime = car.airTime;
  t.rolledOver = car.rolledOver;
  t.engineLoad = car.engineLoad;
  t.clutch = car.clutchEngage;
  t.stalled = car.engineStalled;
  t.odometer = car.odometer;
  let grip = 0;
  for (let i = 0; i < 4; i += 1) {
    const w = car.wheels[i];
    t.load[i] = w.load;
    t.slipRatio[i] = w.slipRatio;
    t.wheelSlipAngle[i] = w.slipAngle;
    t.compression[i] = w.compression;
    t.fx[i] = w.fx;
    t.fy[i] = w.fy;
    t.grip[i] = w.gripUsed;
    t.temperature[i] = w.temperature;
    t.spinRate[i] = w.spinRate;
    if (w.gripUsed > grip) grip = w.gripUsed;
  }
  t.gripUsed = grip;
  t.surface = surfaceProps(car.wheels[2].surfaceId).name;
  return t;
}

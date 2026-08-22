// Component damage. Every impact is turned into joules, routed to the parts that
// were physically in the way, and from there into the multipliers physics.js
// applies. Nothing here is cosmetic-only: if the UI says the steering rack is
// bent, the car pulls.
//
// Health is 1 = factory, 0 = destroyed, and never recovers outside the service
// park. Impacts are events; stepDamage is the slow burn that turns a holed
// radiator four kilometres from the finish into a seized engine.

import { clamp, saturate, lerp } from "./mathx.js";
import { makeRng } from "./rng.js";

const CAT_BODY = 0;
const CAT_GLASS = 1;
const CAT_LIGHT = 2;
const CAT_SUSP = 3;
const CAT_STEER = 4;
const CAT_BRAKE = 5;
const CAT_TYRE = 6;
const CAT_ENGINEBAY = 7;
const CAT_DRIVE = 8;
const CAT_EXHAUST = 9;
const CAT_COUNT = 10;

// Positions are chassis-local metres for a ~4.1 m car: +Z nose, +X right,
// +Y up, origin at the centre of mass. `reach` is the Gaussian sigma of the
// part's exposure to a contact point, so a nose-on hit finds the radiator and
// not the exhaust. Parts that are long in one axis and thin in another — a
// flank, a propshaft, a bumper — override it per axis with rx/ry/rz, otherwise
// a hit on the left-front wing reaches across and flattens the right-hand door.
const SPECS = [
  {
    key: "engine", label: "Engine", group: "Engine", cat: CAT_ENGINEBAY,
    px: 0, py: -0.05, pz: 1.15, reach: 0.75,
    armour: 120e3, yield: 6000, importance: 1.0, repairMinutes: 25, partial: true,
    shield: "bodyFront", shieldFactor: 0.60, rollBias: 0.8,
  },
  {
    key: "turbo", label: "Turbocharger", group: "Engine", cat: CAT_ENGINEBAY,
    px: 0.25, py: 0.05, pz: 1.35, reach: 0.55,
    armour: 45e3, yield: 2500, importance: 0.50, repairMinutes: 12, partial: true,
    shield: "bodyFront", shieldFactor: 0.55, rollBias: 0.7,
  },
  {
    key: "radiator", label: "Radiator", group: "Engine", cat: CAT_ENGINEBAY,
    px: 0, py: -0.05, pz: 1.85, reach: 0.60,
    armour: 22e3, yield: 1500, importance: 0.75, repairMinutes: 8, partial: true,
    shield: "bodyFront", shieldFactor: 0.75, rollBias: 0.5,
  },
  {
    key: "exhaust", label: "Exhaust", group: "Engine", cat: CAT_EXHAUST,
    px: 0.30, py: -0.35, pz: -1.60, reach: 1.20, rx: 0.60, ry: 0.45, rz: 1.10,
    armour: 20e3, yield: 900, importance: 0.20, repairMinutes: 3, partial: true,
    shield: null, shieldFactor: 0, rollBias: 1.1,
  },
  {
    key: "gearbox", label: "Gearbox", group: "Drivetrain", cat: CAT_DRIVE,
    px: 0, py: -0.20, pz: 0.55, reach: 0.70,
    armour: 90e3, yield: 5000, importance: 0.85, repairMinutes: 20, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.5,
  },
  {
    key: "clutch", label: "Clutch", group: "Drivetrain", cat: CAT_DRIVE,
    px: 0, py: -0.15, pz: 0.75, reach: 0.60,
    armour: 60e3, yield: 4000, importance: 0.60, repairMinutes: 18, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.4,
  },
  {
    key: "driveshaft", label: "Driveshaft", group: "Drivetrain", cat: CAT_DRIVE,
    px: 0, py: -0.28, pz: 0.0, reach: 1.40, rx: 0.50, ry: 0.45, rz: 1.50,
    armour: 70e3, yield: 3500, importance: 0.80, repairMinutes: 9, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.6,
  },
  {
    key: "suspFL", label: "Suspension FL", group: "Chassis", cat: CAT_SUSP,
    px: -0.78, py: -0.20, pz: 1.30, reach: 0.85,
    armour: 55e3, yield: 2500, importance: 0.85, repairMinutes: 7, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.9,
  },
  {
    key: "suspFR", label: "Suspension FR", group: "Chassis", cat: CAT_SUSP,
    px: 0.78, py: -0.20, pz: 1.30, reach: 0.85,
    armour: 55e3, yield: 2500, importance: 0.85, repairMinutes: 7, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.9,
  },
  {
    key: "suspRL", label: "Suspension RL", group: "Chassis", cat: CAT_SUSP,
    px: -0.78, py: -0.20, pz: -1.30, reach: 0.85,
    armour: 58e3, yield: 2500, importance: 0.70, repairMinutes: 7, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.9,
  },
  {
    key: "suspRR", label: "Suspension RR", group: "Chassis", cat: CAT_SUSP,
    px: 0.78, py: -0.20, pz: -1.30, reach: 0.85,
    armour: 58e3, yield: 2500, importance: 0.70, repairMinutes: 7, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.9,
  },
  {
    key: "steering", label: "Steering rack", group: "Chassis", cat: CAT_STEER,
    px: 0, py: -0.10, pz: 1.05, reach: 0.90, rx: 0.90, ry: 0.45, rz: 0.60,
    armour: 42e3, yield: 2000, importance: 0.95, repairMinutes: 6, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.6,
  },
  {
    key: "brakeFront", label: "Front brakes", group: "Chassis", cat: CAT_BRAKE,
    px: 0, py: -0.25, pz: 1.30, reach: 1.00, rx: 1.00, ry: 0.50, rz: 0.60,
    armour: 50e3, yield: 2200, importance: 0.75, repairMinutes: 5, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.5,
  },
  {
    key: "brakeRear", label: "Rear brakes", group: "Chassis", cat: CAT_BRAKE,
    px: 0, py: -0.25, pz: -1.30, reach: 1.00, rx: 1.00, ry: 0.50, rz: 0.60,
    armour: 50e3, yield: 2200, importance: 0.55, repairMinutes: 5, partial: true,
    shield: null, shieldFactor: 0, rollBias: 0.5,
  },
  {
    key: "tyreFL", label: "Tyre FL", group: "Wheels", cat: CAT_TYRE,
    px: -0.80, py: -0.35, pz: 1.30, reach: 0.70,
    armour: 26e3, yield: 800, importance: 0.60, repairMinutes: 0.8, partial: false,
    shield: null, shieldFactor: 0, rollBias: 0.8,
  },
  {
    key: "tyreFR", label: "Tyre FR", group: "Wheels", cat: CAT_TYRE,
    px: 0.80, py: -0.35, pz: 1.30, reach: 0.70,
    armour: 26e3, yield: 800, importance: 0.60, repairMinutes: 0.8, partial: false,
    shield: null, shieldFactor: 0, rollBias: 0.8,
  },
  {
    key: "tyreRL", label: "Tyre RL", group: "Wheels", cat: CAT_TYRE,
    px: -0.80, py: -0.35, pz: -1.30, reach: 0.70,
    armour: 26e3, yield: 800, importance: 0.55, repairMinutes: 0.8, partial: false,
    shield: null, shieldFactor: 0, rollBias: 0.8,
  },
  {
    key: "tyreRR", label: "Tyre RR", group: "Wheels", cat: CAT_TYRE,
    px: 0.80, py: -0.35, pz: -1.30, reach: 0.70,
    armour: 26e3, yield: 800, importance: 0.55, repairMinutes: 0.8, partial: false,
    shield: null, shieldFactor: 0, rollBias: 0.8,
  },
  {
    key: "bodyFront", label: "Front bodywork", group: "Body", cat: CAT_BODY,
    px: 0, py: 0.0, pz: 2.05, reach: 1.30, rx: 1.10, ry: 0.70, rz: 0.75,
    armour: 60e3, yield: 200, importance: 0.25, repairMinutes: 6, partial: true,
    shield: null, shieldFactor: 0, rollBias: 1.0,
  },
  {
    key: "bodyRear", label: "Rear bodywork", group: "Body", cat: CAT_BODY,
    px: 0, py: 0.0, pz: -2.05, reach: 1.30, rx: 1.10, ry: 0.70, rz: 0.75,
    armour: 55e3, yield: 200, importance: 0.15, repairMinutes: 5, partial: true,
    shield: null, shieldFactor: 0, rollBias: 1.0,
  },
  {
    key: "bodyLeft", label: "Left flank", group: "Body", cat: CAT_BODY,
    px: -0.90, py: 0.05, pz: 0.0, reach: 1.80, rx: 0.65, ry: 0.90, rz: 1.30,
    armour: 65e3, yield: 200, importance: 0.15, repairMinutes: 5, partial: true,
    shield: null, shieldFactor: 0, rollBias: 1.3,
  },
  {
    key: "bodyRight", label: "Right flank", group: "Body", cat: CAT_BODY,
    px: 0.90, py: 0.05, pz: 0.0, reach: 1.80, rx: 0.65, ry: 0.90, rz: 1.30,
    armour: 65e3, yield: 200, importance: 0.15, repairMinutes: 5, partial: true,
    shield: null, shieldFactor: 0, rollBias: 1.3,
  },
  {
    key: "bodyRoof", label: "Roof", group: "Body", cat: CAT_BODY,
    px: 0, py: 0.75, pz: 0.10, reach: 1.60, rx: 0.95, ry: 0.55, rz: 1.30,
    armour: 70e3, yield: 400, importance: 0.20, repairMinutes: 9, partial: true,
    shield: null, shieldFactor: 0, rollBias: 2.2,
  },
  {
    key: "windscreen", label: "Windscreen", group: "Body", cat: CAT_GLASS,
    px: 0, py: 0.60, pz: 0.95, reach: 0.90, rx: 0.85, ry: 0.45, rz: 0.60,
    armour: 18e3, yield: 1200, importance: 0.35, repairMinutes: 4, partial: false,
    shield: null, shieldFactor: 0, rollBias: 1.8,
  },
  {
    key: "headlights", label: "Headlights", group: "Body", cat: CAT_LIGHT,
    px: 0, py: 0.15, pz: 2.00, reach: 1.10, rx: 1.00, ry: 0.45, rz: 0.60,
    armour: 9e3, yield: 400, importance: 0.30, repairMinutes: 2, partial: false,
    shield: null, shieldFactor: 0, rollBias: 0.9,
  },
];

export const COMPONENTS = Object.freeze(SPECS.map((s) => Object.freeze(s)));
const N = SPECS.length;

const INDEX = Object.create(null);
for (let i = 0; i < N; i += 1) INDEX[SPECS[i].key] = i;
export const COMPONENT_INDEX = Object.freeze({ ...INDEX });

const I_ENGINE = INDEX.engine;
const I_TURBO = INDEX.turbo;
const I_RADIATOR = INDEX.radiator;
const I_EXHAUST = INDEX.exhaust;
const I_GEARBOX = INDEX.gearbox;
const I_CLUTCH = INDEX.clutch;
const I_DRIVESHAFT = INDEX.driveshaft;
const I_STEERING = INDEX.steering;
const I_BRAKE_F = INDEX.brakeFront;
const I_BRAKE_R = INDEX.brakeRear;
const I_WINDSCREEN = INDEX.windscreen;
const I_HEADLIGHTS = INDEX.headlights;
const I_BODY_F = INDEX.bodyFront;
const I_BODY_R = INDEX.bodyRear;
const I_BODY_L = INDEX.bodyLeft;
const I_BODY_RT = INDEX.bodyRight;
const I_ROOF = INDEX.bodyRoof;

const SUSP_IDX = [INDEX.suspFL, INDEX.suspFR, INDEX.suspRL, INDEX.suspRR];
const TYRE_IDX = [INDEX.tyreFL, INDEX.tyreFR, INDEX.tyreRL, INDEX.tyreRR];

const SHIELD_IDX = new Int16Array(N);
const IMPORTANCE_SUM = SPECS.reduce((a, s) => a + s.importance, 0);
const INV_RX = new Float64Array(N);
const INV_RY = new Float64Array(N);
const INV_RZ = new Float64Array(N);
for (let i = 0; i < N; i += 1) {
  const s = SPECS[i];
  SHIELD_IDX[i] = s.shield == null ? -1 : INDEX[s.shield];
  INV_RX[i] = 1 / (s.rx ?? s.reach);
  INV_RY[i] = 1 / (s.ry ?? s.reach);
  INV_RZ[i] = 1 / (s.rz ?? s.reach);
}

function route(map) {
  const out = new Float32Array(CAT_COUNT);
  for (let i = 0; i < CAT_COUNT; i += 1) out[i] = map[i] ?? 0;
  return out;
}

// scale     overall energy multiplier for the kind
// focus     1 = the contact point decides who gets hurt, 0 = the whole car does
// cosFloor  minimum effective obliqueness — a roll has no single clean normal
// tangent   share of the sliding energy that still scuffs things
// puncture  how eagerly this kind cuts a tyre
const KINDS = {
  hit: {
    name: "hit", scale: 1.00, focus: 1.00, cosFloor: 0.00, tangent: 0.03, puncture: 0.7,
    route: route([1.00, 0.55, 1.00, 0.90, 0.80, 0.55, 0.55, 0.85, 0.55, 0.50]),
  },
  scrape: {
    name: "scrape", scale: 0.20, focus: 1.00, cosFloor: 0.00, tangent: 0.05, puncture: 0.25,
    route: route([1.00, 0.06, 0.45, 0.18, 0.12, 0.10, 0.70, 0.06, 0.08, 0.55]),
  },
  kerb: {
    name: "kerb", scale: 0.55, focus: 0.90, cosFloor: 0.10, tangent: 0.08, puncture: 1.6,
    route: route([0.22, 0.04, 0.10, 1.60, 1.00, 0.55, 1.50, 0.15, 0.45, 0.80]),
  },
  tree: {
    name: "tree", scale: 1.35, focus: 1.00, cosFloor: 0.00, tangent: 0.02, puncture: 0.6,
    route: route([1.20, 0.85, 1.20, 1.00, 0.90, 0.50, 0.40, 1.10, 0.55, 0.50]),
  },
  rock: {
    name: "rock", scale: 1.45, focus: 0.95, cosFloor: 0.05, tangent: 0.06, puncture: 2.0,
    route: route([1.00, 0.30, 0.80, 1.30, 0.90, 0.75, 1.40, 0.90, 1.20, 1.60]),
  },
  bale: {
    name: "bale", scale: 0.22, focus: 0.80, cosFloor: 0.10, tangent: 0.02, puncture: 0.15,
    route: route([0.80, 0.12, 0.55, 0.20, 0.12, 0.08, 0.18, 0.15, 0.08, 0.15]),
  },
  water: {
    name: "water", scale: 0.35, focus: 0.30, cosFloor: 0.50, tangent: 0.02, puncture: 0.05,
    route: route([0.20, 0.05, 0.35, 0.15, 0.10, 0.25, 0.10, 1.20, 0.30, 0.90]),
  },
  landing: {
    name: "landing", scale: 1.00, focus: 0.15, cosFloor: 0.55, tangent: 0.00, puncture: 0.8,
    route: route([0.22, 0.04, 0.15, 1.00, 0.30, 0.35, 0.60, 0.20, 0.90, 0.50]),
  },
  roll: {
    name: "roll", scale: 1.15, focus: 0.05, cosFloor: 0.60, tangent: 0.10, puncture: 0.5,
    route: route([1.00, 1.60, 1.10, 0.85, 0.70, 0.45, 0.55, 0.70, 0.55, 0.90]),
  },
};

export const IMPACT_KINDS = Object.freeze(Object.keys(KINDS));

// Only the kinds with an inherent direction get a default normal; for the rest an
// unspecified normal means "the face squared up to the contact point".
const DEFAULT_NORMAL = Object.freeze({ landing: [0, 1, 0], roll: [0, 1, 0] });

const PARTS = [
  { key: "bumperFront", driver: I_BODY_F, threshold: 0.35 },
  { key: "bumperRear", driver: I_BODY_R, threshold: 0.32 },
  { key: "bonnet", driver: I_BODY_F, threshold: 0.16 },
  { key: "doorLeft", driver: I_BODY_L, threshold: 0.14 },
  { key: "doorRight", driver: I_BODY_RT, threshold: 0.14 },
  { key: "mirrorLeft", driver: I_BODY_L, threshold: 0.62 },
  { key: "mirrorRight", driver: I_BODY_RT, threshold: 0.62 },
  { key: "spare", driver: I_BODY_R, threshold: 0.40 },
  { key: "exhaustTail", driver: I_EXHAUST, threshold: 0.22 },
  { key: "wingRear", driver: I_BODY_R, threshold: 0.25 },
];
export const DETACHABLE_PARTS = Object.freeze(PARTS.map((p) => p.key));

const STATUS = ["destroyed", "broken", "bent", "dented", "scratched", "ok"];
const STATUS_MIN = [0, 0.10, 0.35, 0.62, 0.90, 0.985];

export function componentStatus(health) {
  const h = saturate(health);
  for (let i = STATUS.length - 1; i >= 0; i -= 1) {
    if (h >= STATUS_MIN[i]) return STATUS[i];
  }
  return "destroyed";
}

const SEVERITY_LABELS = ["clean", "light", "moderate", "heavy", "critical", "terminal"];
const SEVERITY_MIN = [0, 0.04, 0.14, 0.32, 0.55, 0.78];

export function severityLabel(severity) {
  const s = saturate(severity);
  for (let i = SEVERITY_LABELS.length - 1; i >= 0; i -= 1) {
    if (s >= SEVERITY_MIN[i]) return SEVERITY_LABELS[i];
  }
  return "clean";
}

// Declared ranges for everything damageEffects() hands to physics.js. Exported
// so consumers (and the tests) can assert against one source of truth rather
// than a second copy of the numbers.
export const EFFECT_BOUNDS = Object.freeze({
  powerScale: [0, 1],
  revLimitScale: [0.45, 1],
  turboScale: [0, 1],
  misfire: [0, 1],
  shiftTimeScale: [1, 4],
  clutchSlip: [0, 0.95],
  drivetrainScale: [0, 1],
  frontDriveBias: [0, 1],
  steerPull: [-0.10, 0.10],
  steerRangeScale: [0.35, 1],
  steerSlop: [0, 0.06],
  brakeFrontScale: [0.05, 1],
  brakeRearScale: [0.05, 1],
  aeroDragScale: [1, 1.6],
  aeroDownforceScale: [0.4, 1],
  coolantLevel: [0, 1],
  oilLevel: [0, 1],
  engineTemp: [-40, 400],
  overheat: [0, 1],
  severity: [0, 1],
});

export const ARRAY_EFFECT_BOUNDS = Object.freeze({
  tyreGrip: [0.18, 1],
  tyreRolling: [1, 4],
  tyreRadiusScale: [0.80, 1],
  suspTravelScale: [0.30, 1],
  suspDampScale: [0.10, 1.6],
  suspRideDrop: [0, 0.09],
  suspCamber: [-0.14, 0.14],
});

const AMBIENT_DEFAULT = 15;
const TEMP_START = 82;
const TEMP_WARN = 112;
const TEMP_DAMAGE = 130;
const TEMP_MAX = 400;
const KOUT = 0.030;

// Snapshot used so one impact cannot cascade through its own shielding: the
// front panel being flattened by this hit must not also expose the radiator to
// the same hit.
const snapshot = new Float64Array(N);
const impactResult = {
  kind: "hit", energy: 0, obliqueness: 0, worst: "", worstDelta: 0,
  totalDelta: 0, punctured: -1, severity: 0,
};

function makeEffects() {
  const susp = [];
  for (let i = 0; i < 4; i += 1) {
    susp.push({ travelScale: 1, dampScale: 1, stuck: false, rideDrop: 0, camber: 0 });
  }
  return {
    powerScale: 1,
    revLimitScale: 1,
    turboScale: 1,
    misfire: 0,
    gearBlocked: new Uint8Array(9),
    shiftTimeScale: 1,
    clutchSlip: 0,
    drivetrainScale: 1,
    driveMode: "awd",
    frontDriveBias: 0.5,
    suspension: susp,
    steerPull: 0,
    steerRangeScale: 1,
    steerSlop: 0,
    brakeFrontScale: 1,
    brakeRearScale: 1,
    tyreGrip: new Float64Array([1, 1, 1, 1]),
    tyreRolling: new Float64Array([1, 1, 1, 1]),
    tyreRadiusScale: new Float64Array([1, 1, 1, 1]),
    punctureStage: new Int8Array(4),
    aeroDragScale: 1,
    aeroDownforceScale: 1,
    coolantLevel: 1,
    oilLevel: 1,
    engineTemp: TEMP_START,
    overheat: 0,
    seized: false,
    severity: 0,
    severityLabel: "clean",
    retired: false,
    retiredReason: "",
  };
}

function makeVisual() {
  const wheels = [];
  for (let i = 0; i < 4; i += 1) {
    wheels.push({ flat: false, rim: false, missing: false, camber: 0, wobble: 0 });
  }
  const detached = Object.create(null);
  for (let i = 0; i < PARTS.length; i += 1) detached[PARTS[i].key] = false;
  return {
    panels: { front: 0, rear: 0, left: 0, right: 0, roof: 0, bonnet: 0, bootlid: 0 },
    detached,
    detachedList: new Array(PARTS.length).fill(""),
    detachedCount: 0,
    glass: { windscreenCracked: false, windscreenShattered: false, sideShattered: false },
    lights: { leftOut: false, rightOut: false, glassBroken: false },
    wheels,
    smoke: 0,
    steam: 0,
    oil: 0,
    sparks: 0,
    fire: 0,
  };
}

function makeRows() {
  const rows = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const s = SPECS[i];
    rows[i] = {
      idx: i, key: s.key, label: s.label, group: s.group,
      health: 1, status: "ok", damaged: false, critical: false, note: "",
    };
  }
  return rows;
}

export function createDamage(opts = {}) {
  const o = (typeof opts === "number" || typeof opts === "string") ? { seed: opts } : (opts || {});
  const damage = {
    seed: o.seed ?? "opusrally-damage",
    rng: makeRng(o.seed ?? "opusrally-damage"),
    health: new Float64Array(N),
    ambient: Number.isFinite(o.ambient) ? o.ambient : AMBIENT_DEFAULT,
    engineTemp: TEMP_START,
    coolantLevel: 1,
    coolantLeak: 0,
    oilLevel: 1,
    oilLeak: 0,
    seized: false,
    retired: false,
    retiredReason: "",
    severity: 0,
    tyrePressure: new Float64Array([1, 1, 1, 1]),
    tyreLeak: new Float64Array(4),
    rimDistance: new Float64Array(4),
    gearBlocked: new Uint8Array(9),
    gearFailures: 0,
    baseDrive: o.drive ?? "awd",
    driveModeFail: null,
    detached: new Uint8Array(PARTS.length),
    headlightOut: new Uint8Array(2),
    invertedTime: 0,
    rattleTimer: 0,
    slowTimer: 0,
    impactCount: 0,
    impactEnergy: 0,
    lastImpactEnergy: 0,
    lastImpactKind: "",
    time: 0,
    dirty: true,
    effects: makeEffects(),
    visual: makeVisual(),
    rows: makeRows(),
  };
  damage.health.fill(1);
  damage.effects.driveMode = damage.baseDrive;
  recompute(damage);
  return damage;
}

const scratchDir = { x: 0, y: 0, z: 1 };
const normalVec = { x: 0, y: 0, z: -1 };
const approachVec = { x: 0, y: 0, z: 1 };

function unit(x, y, z, fallbackZ) {
  const m = Math.sqrt(x * x + y * y + z * z);
  if (!(m > 1e-6)) {
    scratchDir.x = 0; scratchDir.y = 0; scratchDir.z = fallbackZ;
    return scratchDir;
  }
  scratchDir.x = x / m; scratchDir.y = y / m; scratchDir.z = z / m;
  return scratchDir;
}

// Returns a shared scratch summary (energy, worst component, whether a tyre went)
// for audio and the HUD flash. Read it before the next impact.
export function applyImpact(damage, car, impact) {
  const kind = KINDS[impact && impact.kind] || KINDS.hit;
  const speed = Math.max(0, Number.isFinite(impact && impact.speed) ? impact.speed : 0);
  const mass = (car && car.spec && Number.isFinite(car.spec.mass)) ? car.spec.mass : 1200;

  const p = (impact && impact.point) || null;
  const cx = p && Number.isFinite(p.x) ? p.x : 0;
  const cy = p && Number.isFinite(p.y) ? p.y : 0;
  const cz = p && Number.isFinite(p.z) ? p.z : 2.0;

  const nSrc = (impact && impact.normal) || null;
  if (nSrc) {
    const u = unit(nSrc.x || 0, nSrc.y || 0, nSrc.z || 0, -1);
    normalVec.x = u.x; normalVec.y = u.y; normalVec.z = u.z;
  } else {
    const d = DEFAULT_NORMAL[kind.name];
    if (d) { normalVec.x = d[0]; normalVec.y = d[1]; normalVec.z = d[2]; } else {
      // No normal given: assume the struck face squares up to the contact point.
      const u = unit(-cx, -cy, -cz, -1);
      normalVec.x = u.x; normalVec.y = u.y; normalVec.z = u.z;
    }
  }

  setApproach(damage, car, impact, cx, cy, cz);

  const raw = -(approachVec.x * normalVec.x + approachVec.y * normalVec.y + approachVec.z * normalVec.z);
  const cos = lerp(saturate(raw), 1, kind.cosFloor);
  const cos2 = cos * cos;
  const ke = 0.5 * mass * speed * speed;
  const energy = (ke * cos2 + ke * (1 - cos2) * kind.tangent) * kind.scale;

  const health = damage.health;
  for (let i = 0; i < N; i += 1) snapshot[i] = health[i];

  impactResult.kind = kind.name;
  impactResult.energy = energy;
  impactResult.obliqueness = cos;
  impactResult.worst = "";
  impactResult.worstDelta = 0;
  impactResult.totalDelta = 0;
  impactResult.punctured = -1;

  const isRoll = kind === KINDS.roll;
  for (let i = 0; i < N; i += 1) {
    const spec = SPECS[i];
    let w = kind.route[spec.cat];
    if (w <= 0) continue;
    if (isRoll) w *= spec.rollBias;
    const dx = (cx - spec.px) * INV_RX[i];
    const dy = (cy - spec.py) * INV_RY[i];
    const dz = (cz - spec.pz) * INV_RZ[i];
    const geom = Math.exp(-(dx * dx + dy * dy + dz * dz) * 0.5);
    w *= 1 - kind.focus + kind.focus * geom;
    const sh = SHIELD_IDX[i];
    if (sh >= 0) w *= 1 - spec.shieldFactor * snapshot[sh];
    const e = energy * w;
    if (e <= spec.yield) continue;
    const delta = (e - spec.yield) / spec.armour;
    if (!(delta > 0)) continue;
    health[i] = Math.max(0, health[i] - delta);
    impactResult.totalDelta += delta * spec.importance;
    if (delta > impactResult.worstDelta) {
      impactResult.worstDelta = delta;
      impactResult.worst = spec.key;
    }
    if (spec.cat === CAT_TYRE) tyreImpact(damage, i, e, kind);
  }

  damage.impactCount += 1;
  damage.impactEnergy += energy;
  damage.lastImpactEnergy = energy;
  damage.lastImpactKind = kind.name;
  if (isRoll) damage.invertedTime = Math.max(damage.invertedTime, 0.5);

  updateDetachments(damage);
  recompute(damage);
  impactResult.severity = damage.severity;
  return impactResult;
}

function setApproach(damage, car, impact, cx, cy, cz) {
  const d = impact && impact.dir;
  if (d && (d.x || d.y || d.z)) {
    const u = unit(d.x || 0, d.y || 0, d.z || 0, 1);
    approachVec.x = u.x; approachVec.y = u.y; approachVec.z = u.z;
    return;
  }
  if (car && car.vel && Number.isFinite(car.yaw)) {
    const s = Math.sin(car.yaw);
    const c = Math.cos(car.yaw);
    const vx = car.vel.x || 0;
    const vy = car.vel.y || 0;
    const vz = car.vel.z || 0;
    // Contract frame: forward = (sin yaw, 0, cos yaw), right = (cos yaw, 0, -sin yaw).
    const lx = vx * c - vz * s;
    const lz = vx * s + vz * c;
    if (lx * lx + vy * vy + lz * lz > 0.25) {
      const u = unit(lx, vy, lz, 1);
      approachVec.x = u.x; approachVec.y = u.y; approachVec.z = u.z;
      return;
    }
  }
  const u = unit(cx, cy, cz, 1);
  approachVec.x = u.x; approachVec.y = u.y; approachVec.z = u.z;
}

function tyreImpact(damage, idx, energy, kind) {
  const w = TYRE_IDX.indexOf(idx);
  if (w < 0) return;
  if (damage.tyrePressure[w] <= 0.02) return;
  if (energy > 45e3 * (0.6 + 0.4 / Math.max(0.2, kind.puncture))) {
    damage.tyrePressure[w] = 0;
    damage.tyreLeak[w] = 0;
    impactResult.punctured = w;
    return;
  }
  const p = clamp(((energy - 2500) / 35000) * kind.puncture, 0, 0.95);
  if (p > 0 && damage.rng.chance(p)) {
    damage.tyreLeak[w] = Math.max(damage.tyreLeak[w], damage.rng.range(0.008, 0.05));
    impactResult.punctured = w;
  }
}

function updateDetachments(damage) {
  const health = damage.health;
  for (let i = 0; i < PARTS.length; i += 1) {
    if (damage.detached[i]) continue;
    const part = PARTS[i];
    const h = health[part.driver];
    if (h >= part.threshold) continue;
    const p = saturate((part.threshold - h) / part.threshold) * 0.55;
    if (damage.rng.chance(p)) damage.detached[i] = 1;
  }
  const hl = health[I_HEADLIGHTS];
  if (hl < 0.6 && !damage.headlightOut[0] && !damage.headlightOut[1]) {
    damage.headlightOut[damage.rng.chance(0.5) ? 0 : 1] = 1;
  }
  if (hl < 0.25) { damage.headlightOut[0] = 1; damage.headlightOut[1] = 1; }
}

const GEAR_FAIL_ORDER = [0, 5, 6, 4, 3, 2, 7, 8, 1];
const GEAR_THRESHOLDS = [0.62, 0.44, 0.30, 0.18, 0.08];
const gearCandidates = new Int8Array(3);

function updateGearFailures(damage) {
  const h = damage.health[I_GEARBOX];
  let want = 0;
  for (let i = 0; i < GEAR_THRESHOLDS.length; i += 1) if (h < GEAR_THRESHOLDS[i]) want += 1;
  while (damage.gearFailures < want) {
    let n = 0;
    for (let i = 0; i < GEAR_FAIL_ORDER.length && n < 3; i += 1) {
      const g = GEAR_FAIL_ORDER[i];
      if (!damage.gearBlocked[g]) gearCandidates[n++] = g;
    }
    if (n === 0) break;
    damage.gearBlocked[gearCandidates[damage.rng.int(0, n - 1)]] = 1;
    damage.gearFailures += 1;
  }
}

function updateDriveFailure(damage) {
  if (damage.driveModeFail) {
    if (damage.health[I_DRIVESHAFT] <= 0.04) damage.driveModeFail = "none";
    return;
  }
  const h = damage.health[I_DRIVESHAFT];
  if (h > 0.25) return;
  if (h <= 0.04) { damage.driveModeFail = "none"; return; }
  if (damage.baseDrive === "awd") damage.driveModeFail = damage.rng.chance(0.5) ? "fwd" : "rwd";
  else damage.driveModeFail = "none";
}

export function stepDamage(damage, car, dt) {
  if (!(dt > 0)) return damage;
  // A tab that was backgrounded must not deliver a minute of heat in one step.
  const step = dt > 0.25 ? 0.25 : dt;
  damage.time += step;

  const health = damage.health;
  const speed = (car && Number.isFinite(car.speed)) ? Math.abs(car.speed) : 0;
  const load = (car && Number.isFinite(car.engineLoad)) ? saturate(car.engineLoad) : 0;
  const running = !damage.seized;

  const hole = saturate((0.50 - health[I_RADIATOR]) / 0.50);
  damage.coolantLeak = hole;
  if (hole > 0) {
    damage.coolantLevel = Math.max(0, damage.coolantLevel - hole * (0.014 + 0.010 * load) * step);
  }

  const coolant = damage.coolantLevel;
  const capacity = 0.10 + 0.90 * coolant;
  const airflow = 0.95 + 0.012 * Math.min(speed, 55);
  // Thermostat and fan: with coolant aboard, cooling authority rises sharply
  // past 100 C, which is exactly why a healthy car cannot cook itself.
  const fan = 1 + 1.6 * saturate((damage.engineTemp - 100) / 12) * coolant;
  const heatIn = running ? 2.0 + 1.0 * load : 0.15;
  const heatOut = (damage.engineTemp - damage.ambient) * KOUT * capacity * airflow * fan;
  damage.engineTemp = clamp(damage.engineTemp + (heatIn - heatOut) * step, -40, TEMP_MAX);

  if (damage.engineTemp > TEMP_DAMAGE && running) {
    health[I_ENGINE] = Math.max(0, health[I_ENGINE] - (damage.engineTemp - TEMP_DAMAGE) * 0.0022 * step);
  }

  // Oil: a flattened sump or a cooked engine bleeds, and a dry engine eats itself.
  damage.oilLeak = saturate((0.35 - health[I_ENGINE]) / 0.35) * 0.8
    + saturate((0.30 - health[I_EXHAUST]) / 0.30) * 0.2;
  if (damage.oilLeak > 0 && running) {
    damage.oilLevel = Math.max(0, damage.oilLevel - damage.oilLeak * 0.006 * step);
  }
  if (damage.oilLevel < 0.35 && running) {
    health[I_ENGINE] = Math.max(0, health[I_ENGINE] - (0.35 - damage.oilLevel) * 0.010 * step);
  }

  for (let w = 0; w < 4; w += 1) {
    const leak = damage.tyreLeak[w];
    if (leak > 0 && damage.tyrePressure[w] > 0) {
      damage.tyrePressure[w] = Math.max(0, damage.tyrePressure[w] - leak * step);
    }
    const pr = damage.tyrePressure[w];
    if (pr < 0.60 && speed > 3) {
      const rub = (0.60 - pr) * speed * 0.00035 * step;
      const t = TYRE_IDX[w];
      health[t] = Math.max(0, health[t] - rub);
      if (pr < 0.15) {
        damage.rimDistance[w] += speed * step;
        const s = SUSP_IDX[w];
        health[s] = Math.max(0, health[s] - speed * 0.00004 * step);
      }
    }
  }

  damage.rattleTimer += step;
  if (damage.rattleTimer >= 0.25) {
    const shake = damage.rattleTimer * (0.25 + speed / 30);
    damage.rattleTimer = 0;
    for (let i = 0; i < N; i += 1) {
      const spec = SPECS[i];
      if (spec.cat === CAT_GLASS || spec.cat === CAT_LIGHT) continue;
      const h = health[i];
      if (h <= 0 || h >= 0.35) continue;
      if (damage.rng.chance((0.35 - h) * 0.02 * shake)) {
        health[i] = Math.max(0, h - damage.rng.range(0.05, 0.20));
      }
    }
    updateDetachments(damage);
  }

  if (car && car.rolledOver) {
    damage.invertedTime += step;
  } else if (damage.invertedTime > 0) {
    damage.invertedTime = Math.max(0, damage.invertedTime - step * 2);
  }

  recompute(damage);
  return damage;
}

function tyreGripFor(pressure, health) {
  return (0.36 + 0.64 * Math.pow(saturate(pressure), 0.7)) * (0.55 + 0.45 * saturate(health));
}

function recompute(damage) {
  const health = damage.health;
  const fx = damage.effects;

  updateGearFailures(damage);
  updateDriveFailure(damage);

  if (health[I_ENGINE] <= 0) damage.seized = true;

  const eng = saturate(health[I_ENGINE]);
  const overheat = saturate((damage.engineTemp - TEMP_WARN) / (TEMP_DAMAGE + 20 - TEMP_WARN));
  const heatDerate = 1 - 0.45 * saturate((damage.engineTemp - 115) / 30);
  const oilDerate = 1 - 0.30 * saturate((0.35 - damage.oilLevel) / 0.35);

  fx.seized = damage.seized;
  fx.powerScale = damage.seized ? 0 : clamp((0.20 + 0.80 * eng) * heatDerate * oilDerate, 0, 1);
  fx.revLimitScale = damage.seized ? 0.45 : clamp(0.55 + 0.45 * eng, 0.45, 1);
  fx.misfire = damage.seized ? 1 : saturate((1 - eng) * 1.2 + overheat * 0.4);

  const turbo = saturate(health[I_TURBO]);
  const exh = saturate(health[I_EXHAUST]);
  fx.turboScale = damage.seized || turbo < 0.15
    ? 0
    : clamp((0.15 + 0.85 * turbo) * (0.85 + 0.15 * exh), 0, 1);

  const gb = saturate(health[I_GEARBOX]);
  const cl = saturate(health[I_CLUTCH]);
  const ds = saturate(health[I_DRIVESHAFT]);
  for (let g = 0; g < 9; g += 1) fx.gearBlocked[g] = damage.gearBlocked[g];
  fx.shiftTimeScale = clamp(1 + 1.8 * (1 - gb) * (1 - gb) + 0.6 * (1 - cl), 1, 4);
  fx.clutchSlip = clamp(Math.pow(1 - cl, 1.5) * 0.9, 0, 0.95);
  fx.drivetrainScale = damage.seized ? 0 : clamp((0.30 + 0.70 * ds) * (0.50 + 0.50 * gb), 0, 1);
  fx.driveMode = damage.driveModeFail || damage.baseDrive;
  fx.frontDriveBias = fx.driveMode === "fwd" ? 1 : fx.driveMode === "rwd" ? 0 : 0.5;
  if (fx.driveMode === "none") fx.drivetrainScale = 0;

  for (let w = 0; w < 4; w += 1) {
    const h = saturate(health[SUSP_IDX[w]]);
    const s = fx.suspension[w];
    s.travelScale = clamp(0.30 + 0.70 * h, 0.30, 1);
    // A damper first blows its seals and loses authority, then jams solid — the
    // V through h = 0.20 is that, not a discontinuity.
    s.dampScale = clamp(h < 0.20 ? lerp(1.6, 0.52, h / 0.20) : 0.40 + 0.60 * h, 0.10, 1.6);
    s.stuck = h < 0.20;
    s.rideDrop = clamp((1 - h) * 0.07, 0, 0.09);
    s.camber = clamp((1 - h) * 0.13 * (w === 0 || w === 2 ? -1 : 1), -0.14, 0.14);
  }

  const st = saturate(health[I_STEERING]);
  const fl = saturate(health[SUSP_IDX[0]]);
  const fr = saturate(health[SUSP_IDX[1]]);
  // A bent left corner drags the car left; a bent rack adds its own bias in the
  // direction of whichever front corner took the hit.
  const asym = (fr - fl) * 0.055 + (1 - st) * 0.04 * (fl <= fr ? 1 : -1);
  fx.steerPull = clamp(asym, -0.10, 0.10);
  fx.steerRangeScale = clamp(0.35 + 0.65 * st, 0.35, 1);
  fx.steerSlop = clamp((1 - st) * 0.06, 0, 0.06);

  fx.brakeFrontScale = clamp(0.05 + 0.95 * saturate(health[I_BRAKE_F]), 0.05, 1);
  fx.brakeRearScale = clamp(0.05 + 0.95 * saturate(health[I_BRAKE_R]), 0.05, 1);

  for (let w = 0; w < 4; w += 1) {
    const pr = saturate(damage.tyrePressure[w]);
    const th = saturate(health[TYRE_IDX[w]]);
    fx.tyreGrip[w] = clamp(tyreGripFor(pr, th), 0.18, 1);
    fx.tyreRolling[w] = clamp(1 + 2.6 * Math.pow(1 - pr, 1.5) + 0.4 * (1 - th), 1, 4);
    fx.tyreRadiusScale[w] = clamp(0.80 + 0.20 * pr, 0.80, 1);
    fx.punctureStage[w] = pr > 0.92 ? 0 : pr > 0.55 ? 1 : pr > 0.12 ? 2 : 3;
  }

  let missingPanels = 0;
  for (let i = 0; i < PARTS.length; i += 1) if (damage.detached[i]) missingPanels += 1;
  const bodyLoss = (1 - saturate(health[I_BODY_F])) * 0.5 + (1 - saturate(health[I_ROOF])) * 0.3
    + (1 - saturate(health[I_BODY_R])) * 0.2;
  fx.aeroDragScale = clamp(1 + 0.30 * bodyLoss + 0.03 * missingPanels, 1, 1.6);
  fx.aeroDownforceScale = clamp(1 - 0.35 * bodyLoss - 0.03 * missingPanels, 0.4, 1);

  fx.coolantLevel = saturate(damage.coolantLevel);
  fx.oilLevel = saturate(damage.oilLevel);
  fx.engineTemp = clamp(damage.engineTemp, -40, TEMP_MAX);
  fx.overheat = overheat;

  let weighted = 0;
  for (let i = 0; i < N; i += 1) weighted += SPECS[i].importance * saturate(health[i]);
  let severity = saturate(1 - weighted / IMPORTANCE_SUM);
  severity = saturate(severity + 0.10 * overheat + (damage.seized ? 0.25 : 0));
  damage.severity = severity;
  fx.severity = severity;
  fx.severityLabel = severityLabel(severity);

  if (!damage.retired) {
    if (damage.seized) {
      damage.retired = true;
      damage.retiredReason = "Engine seized";
    } else if (health[SUSP_IDX[0]] <= 0.02 && health[SUSP_IDX[1]] <= 0.02) {
      damage.retired = true;
      damage.retiredReason = "Both front suspensions destroyed";
    } else if (damage.invertedTime > 10) {
      damage.retired = true;
      damage.retiredReason = "Rolled and unable to restart";
    }
  }
  fx.retired = damage.retired;
  fx.retiredReason = damage.retiredReason;

  damage.dirty = false;
  return fx;
}

export function damageEffects(damage) {
  if (damage.dirty) recompute(damage);
  return damage.effects;
}

export function componentHealth(damage, key) {
  const idx = INDEX[key];
  return idx === undefined ? 1 : damage.health[idx];
}

// For carrying damage between stages of a rally, and for tests that want a
// specific car rather than a specific crash.
export function setComponentHealth(damage, key, health) {
  const idx = INDEX[key];
  if (idx === undefined) return damage;
  damage.health[idx] = saturate(health);
  recompute(damage);
  return damage;
}

export function damageReport(damage) {
  const rows = damage.rows;
  const health = damage.health;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const h = saturate(health[row.idx]);
    row.health = h;
    row.status = componentStatus(h);
    row.damaged = h < 0.985;
    row.critical = h < 0.35 && SPECS[row.idx].importance >= 0.6;
    row.note = "";
    const cat = SPECS[row.idx].cat;
    if (cat === CAT_TYRE) {
      const w = TYRE_IDX.indexOf(row.idx);
      const stage = damage.effects.punctureStage[w];
      row.note = stage === 1 ? "deflating" : stage === 2 ? "flat" : stage === 3 ? "on the rim" : "";
      if (row.note) row.damaged = true;
    } else if (row.idx === I_RADIATOR && damage.coolantLeak > 0) {
      row.note = damage.coolantLevel <= 0.02 ? "dry" : "leaking coolant";
    } else if (row.idx === I_ENGINE) {
      if (damage.seized) row.note = "seized";
      else if (damage.engineTemp > TEMP_DAMAGE) row.note = "overheating";
      else if (damage.engineTemp > TEMP_WARN) row.note = "running hot";
    }
  }
  rows.sort(rowOrder);
  return rows;
}

function rowOrder(a, b) {
  if (a.health !== b.health) return a.health - b.health;
  return a.idx - b.idx;
}

export function damageVisuals(damage) {
  if (damage.dirty) recompute(damage);
  const v = damage.visual;
  const health = damage.health;
  const p = v.panels;
  p.front = 1 - saturate(health[I_BODY_F]);
  p.rear = 1 - saturate(health[I_BODY_R]);
  p.left = 1 - saturate(health[I_BODY_L]);
  p.right = 1 - saturate(health[I_BODY_RT]);
  p.roof = 1 - saturate(health[I_ROOF]);
  p.bonnet = saturate(p.front * 1.15);
  p.bootlid = saturate(p.rear * 1.15);

  v.detachedCount = 0;
  for (let i = 0; i < PARTS.length; i += 1) {
    const on = damage.detached[i] === 1;
    v.detached[PARTS[i].key] = on;
    if (on) v.detachedList[v.detachedCount++] = PARTS[i].key;
  }

  const ws = saturate(health[I_WINDSCREEN]);
  v.glass.windscreenCracked = ws < 0.80;
  v.glass.windscreenShattered = ws < 0.35;
  v.glass.sideShattered = saturate(health[I_ROOF]) < 0.45
    || saturate(health[I_BODY_L]) < 0.25 || saturate(health[I_BODY_RT]) < 0.25;

  const hl = saturate(health[I_HEADLIGHTS]);
  v.lights.leftOut = damage.headlightOut[0] === 1;
  v.lights.rightOut = damage.headlightOut[1] === 1;
  v.lights.glassBroken = hl < 0.75;

  let sparks = 0;
  for (let w = 0; w < 4; w += 1) {
    const pr = saturate(damage.tyrePressure[w]);
    const th = saturate(health[TYRE_IDX[w]]);
    const sh = saturate(health[SUSP_IDX[w]]);
    const wheel = v.wheels[w];
    wheel.flat = pr <= 0.55;
    wheel.rim = pr <= 0.12;
    wheel.missing = th <= 0 && sh <= 0.05;
    wheel.camber = damage.effects.suspension[w].camber;
    wheel.wobble = saturate((1 - sh) * 0.8 + (1 - th) * 0.4);
    if (wheel.rim && !wheel.missing) sparks = 1;
  }

  const eng = saturate(health[I_ENGINE]);
  v.smoke = saturate((1 - eng) * 0.9 + damage.effects.overheat * 0.4);
  v.steam = saturate(damage.coolantLeak * (0.3 + 0.7 * saturate((damage.engineTemp - 100) / 25)));
  v.oil = saturate(damage.oilLeak);
  v.sparks = sparks;
  v.fire = damage.seized && damage.engineTemp > 190 ? saturate((damage.engineTemp - 190) / 60) : 0;
  return v;
}

// Service park. A crew has minutes, not hours: the plan is a greedy pass by
// value-per-minute, and the item that is worth most gets the leftover time
// rather than a cheap trinket sneaking in underneath it.
export function createRepairPlan(damage, minutes, opts = {}) {
  const crew = Number.isFinite(opts.crewScale) && opts.crewScale > 0 ? opts.crewScale : 1;
  const setup = Number.isFinite(opts.setupMinutes) ? opts.setupMinutes : 0.2;
  const budget = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const plan = {
    minutes: budget, usedMinutes: 0, remainingMinutes: budget,
    items: [], skipped: [], predictedSeverity: damage.severity, crewScale: crew,
  };
  if (budget <= 0) return plan;

  const health = damage.health;
  const candidates = [];
  for (let i = 0; i < N; i += 1) {
    const spec = SPECS[i];
    const h = saturate(health[i]);
    const punctured = spec.cat === CAT_TYRE && damage.tyrePressure[TYRE_IDX.indexOf(i)] < 0.92;
    const missing = punctured ? Math.max(1 - h, 0.6) : 1 - h;
    if (missing <= 0.02) continue;
    const full = spec.repairMinutes * missing / crew + setup;
    let urgency = 1;
    if (i === I_STEERING && h < 0.6) urgency = 2.2;
    if ((i === SUSP_IDX[0] || i === SUSP_IDX[1]) && h < 0.5) urgency = 2.2;
    if ((i === I_BRAKE_F || i === I_BRAKE_R) && h < 0.5) urgency = 1.8;
    if (i === I_RADIATOR && damage.coolantLeak > 0) urgency = 2.4;
    if (spec.cat === CAT_TYRE && punctured) urgency = 2.2;
    if (i === I_ENGINE && damage.seized) urgency = 2.0;
    candidates.push({
      idx: i, key: spec.key, label: spec.label, from: h, missing,
      full, partial: spec.partial, density: (spec.importance * missing * urgency) / full,
    });
  }
  candidates.sort((a, b) => b.density - a.density || a.idx - b.idx);

  let left = budget;
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (left <= 1e-9) { plan.skipped.push(skip(c, "no time")); continue; }
    if (c.full <= left + 1e-9) {
      const spend = Math.min(c.full, left);
      left -= spend;
      plan.items.push({ key: c.key, label: c.label, from: c.from, to: 1, minutes: spend, full: true });
      continue;
    }
    if (c.partial && left >= 0.4 + setup) {
      const work = (left - setup) * crew / SPECS[c.idx].repairMinutes;
      const to = Math.min(1, c.from + work);
      plan.items.push({ key: c.key, label: c.label, from: c.from, to, minutes: left, full: false });
      left = 0;
      continue;
    }
    plan.skipped.push(skip(c, c.partial ? "no time" : "cannot be part-repaired"));
  }

  plan.usedMinutes = budget - left;
  plan.remainingMinutes = left;
  plan.predictedSeverity = predictSeverity(damage, plan);
  return plan;
}

function skip(c, reason) {
  return { key: c.key, label: c.label, minutes: c.full, reason };
}

function predictSeverity(damage, plan) {
  let weighted = 0;
  for (let i = 0; i < N; i += 1) {
    let h = saturate(damage.health[i]);
    for (let j = 0; j < plan.items.length; j += 1) {
      if (plan.items[j].key === SPECS[i].key) { h = saturate(plan.items[j].to); break; }
    }
    weighted += SPECS[i].importance * h;
  }
  return saturate(1 - weighted / IMPORTANCE_SUM);
}

export function applyRepairs(damage, plan) {
  if (!plan || !plan.items) return damage;
  for (let j = 0; j < plan.items.length; j += 1) {
    const item = plan.items[j];
    const idx = INDEX[item.key];
    if (idx === undefined) continue;
    const to = saturate(item.to);
    // The side effects still run when health was already full: a wheel change
    // repairs the pressure, not the carcass.
    if (to > damage.health[idx]) damage.health[idx] = to;
    const spec = SPECS[idx];
    if (spec.cat === CAT_TYRE && to >= 0.6) {
      const w = TYRE_IDX.indexOf(idx);
      damage.tyrePressure[w] = 1;
      damage.tyreLeak[w] = 0;
      damage.rimDistance[w] = 0;
    }
    if (idx === I_RADIATOR && to >= 0.6) {
      damage.coolantLevel = 1;
      damage.coolantLeak = 0;
      damage.engineTemp = Math.min(damage.engineTemp, 95);
    }
    if (idx === I_ENGINE && to >= 0.6) {
      damage.seized = false;
      damage.oilLevel = 1;
      damage.oilLeak = 0;
      damage.engineTemp = Math.min(damage.engineTemp, 95);
    }
    if (idx === I_GEARBOX && to >= 0.7) {
      damage.gearBlocked.fill(0);
      damage.gearFailures = 0;
    }
    if (idx === I_DRIVESHAFT && to >= 0.5) damage.driveModeFail = null;
    if (idx === I_HEADLIGHTS && to >= 0.6) { damage.headlightOut[0] = 0; damage.headlightOut[1] = 0; }
  }
  for (let i = 0; i < PARTS.length; i += 1) {
    if (damage.detached[i] && damage.health[PARTS[i].driver] > 0.6) damage.detached[i] = 0;
  }
  damage.invertedTime = 0;
  // A car that left the service park is by definition still in the rally.
  damage.retired = false;
  damage.retiredReason = "";
  recompute(damage);
  return damage;
}

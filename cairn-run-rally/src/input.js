import { clamp, wrapAngle } from './math.js';
import { sampleStage } from './stage.js';

// Reference-driver calibration. It leaves a margin against the theoretical
// corner speed because bumps, camber changes and surface joins all spend grip
// it cannot see: it is a steady driver rather than a fast one.
export const AUTOPILOT_TUNING = Object.freeze({
  topSpeed: 41,
  reactiveCap: 37,
  cornerMargin: .333,
  looseSpeed: 30,
  brakingMargin: .62,
  driveMargin: .5,
  headingGain: 2.4,
  lineGain: .17,
  lineAuthority: .55,
  yawDamping: .65,
  slideGain: 1,
  throttleGain: .3,
  brakeGain: .23,
  recoverySpeed: 14,
  edgeCaution: .45,
  slipCut: 2.2,
  slideCut: 3.2
});
const AUTOPILOT_HORIZON=[25,50,80,115,150];
// Friction the reference driver assumes per surface. It mirrors the catalog
// rather than importing it: the driver is allowed to be a little pessimistic.
const SURFACE_GRIP={compact:.88,loose:.66,grass:.4,tarmac:1,'wet-tarmac':.78,snow:.34,ice:.2,mud:.5,'desert-gravel':.72};

export const DEFAULT_BINDINGS = Object.freeze({
  accelerate: 'KeyA',
  brake: 'KeyZ',
  steerLeft: 'Comma',
  steerRight: 'Period',
  handbrake: 'Space',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ'
});

export const DEFAULT_GAMEPAD_BINDINGS = Object.freeze({
  accelerate: 7,
  brake: 6,
  handbrake: 2,
  shiftUp: 4,
  shiftDown: 5
});

const BINDING_ACTIONS = Object.freeze(Object.keys(DEFAULT_BINDINGS));
const GAMEPAD_BINDING_ACTIONS = Object.freeze(Object.keys(DEFAULT_GAMEPAD_BINDINGS));
const FIXED_FALLBACKS = Object.freeze(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const RESERVED_MENU_KEYS = new Set(['KeyR', 'Escape', 'Enter']);
const RESERVED_GAMEPAD_BUTTONS = new Set([0, 1, 3, 9, 12, 13, 14, 15]);
const VALID_KEY_CODE = /^(?:Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Arrow(?:Up|Down|Left|Right)|(?:Space|Comma|Period|Slash|Semicolon|Quote|Backquote|BracketLeft|BracketRight|Backslash|Minus|Equal|Tab|CapsLock|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Meta(?:Left|Right)|ContextMenu|Insert|Delete|Home|End|PageUp|PageDown|PrintScreen|ScrollLock|Pause|NumLock|F(?:[1-9]|1[0-2])))$/;
const DRIVING_KEYS = new Set([
  ...FIXED_FALLBACKS,
  ...Object.values(DEFAULT_BINDINGS),
  'KeyR', 'Escape', 'Enter'
]);
const isInteractive = target => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;

function own(value, key) {
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

function readBinding(value, key) {
  try {
    return own(value, key) ? value[key] : undefined;
  } catch {
    return undefined;
  }
}

function isValidBinding(code) {
  return typeof code === 'string' && VALID_KEY_CODE.test(code)
    && !FIXED_FALLBACKS.includes(code) && !RESERVED_MENU_KEYS.has(code);
}

/**
 * Normalize persisted keyboard bindings with one deliberately simple rule:
 * any invalid or duplicate action makes the whole config revert to defaults.
 * This keeps recovery deterministic and prevents a remap from stealing menu keys.
 */
export function normalizeBindings(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_BINDINGS;
  const requested = {};
  for (const action of BINDING_ACTIONS) {
    let code = readBinding(value, action);
    if (code === undefined && action === 'accelerate') code = readBinding(value, 'throttle');
    if (code === undefined) continue;
    if (!isValidBinding(code)) return DEFAULT_BINDINGS;
    requested[action] = code;
  }

  const normalized = { ...DEFAULT_BINDINGS, ...requested };
  const codes = [...FIXED_FALLBACKS, ...Object.values(normalized)];
  if (new Set(codes).size !== codes.length) return DEFAULT_BINDINGS;
  return Object.freeze(normalized);
}

export function formatBinding(code) {
  if (typeof code !== 'string' || !VALID_KEY_CODE.test(code)) return '—';
  const labels = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Space: 'SPACE', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    Quote: "'", Backquote: '`', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=',
    ShiftLeft: 'LEFT SHIFT', ShiftRight: 'RIGHT SHIFT',
    ControlLeft: 'LEFT CTRL', ControlRight: 'RIGHT CTRL',
    AltLeft: 'LEFT ALT', AltRight: 'RIGHT ALT',
    MetaLeft: 'LEFT CMD', MetaRight: 'RIGHT CMD'
  };
  if (labels[code]) return labels[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6).toUpperCase()}`;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function isValidGamepadBinding(index) {
  return Number.isInteger(index) && index >= 0 && index <= 31 && !RESERVED_GAMEPAD_BUTTONS.has(index);
}

export function isReservedGamepadButton(index) {
  return RESERVED_GAMEPAD_BUTTONS.has(index);
}

/**
 * Normalize button indices independently from keyboard codes. Menu buttons are
 * fixed so a driving remap can never steal confirm, back, restart, start, or D-pad.
 */
export function normalizeGamepadBindings(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_GAMEPAD_BINDINGS;
  const requested = {};
  for (const action of GAMEPAD_BINDING_ACTIONS) {
    const index = readBinding(value, action);
    if (index === undefined) continue;
    if (!isValidGamepadBinding(index)) return DEFAULT_GAMEPAD_BINDINGS;
    requested[action] = index;
  }
  const normalized = { ...DEFAULT_GAMEPAD_BINDINGS, ...requested };
  const values = Object.values(normalized);
  if (values.some(index => RESERVED_GAMEPAD_BUTTONS.has(index)) || new Set(values).size !== values.length) return DEFAULT_GAMEPAD_BINDINGS;
  return Object.freeze(normalized);
}

export function formatGamepadBinding(index) {
  if (!Number.isInteger(index) || index < 0) return '—';
  const labels = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'BACK', 9: 'START', 10: 'LS', 11: 'RS', 12: 'DPAD UP', 13: 'DPAD DOWN',
    14: 'DPAD LEFT', 15: 'DPAD RIGHT'
  };
  return labels[index] || `BUTTON ${index}`;
}

export class InputManager {
  constructor(stage, { autopilot = false, bindings = DEFAULT_BINDINGS, gamepadBindings = DEFAULT_GAMEPAD_BINDINGS } = {}) {
    this.stage = stage;
    this.autopilot = autopilot;
    this.bindings = normalizeBindings(bindings);
    this.gamepadBindings = normalizeGamepadBindings(gamepadBindings);
    this.keys = new Set();
    this.pressed = new Set();
    this.gamepadIndex = null;
    this.lastPad = { confirm:false, back:false, start:false, restart:false, up:false, down:false, left:false, right:false, shiftUp:false, shiftDown:false };

    window.addEventListener('keydown', event => {
      const interactive = isInteractive(event.target);
      if (!interactive && this.isDrivingCode(event.code)) event.preventDefault();
      if (interactive && event.code !== 'Escape') return;
      if (!event.repeat) this.pressed.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.clearPadEdges(); });
    window.addEventListener('gamepadconnected', event => { this.gamepadIndex = event.gamepad.index; });
    window.addEventListener('gamepaddisconnected', event => {
      if (this.gamepadIndex === event.gamepad.index) { this.gamepadIndex = null; this.clearPadEdges(); }
    });
  }

  isDrivingCode(code) {
    return DRIVING_KEYS.has(code) || BINDING_ACTIONS.some(action => this.bindings[action] === code);
  }

  setBindings(bindings) {
    this.bindings = normalizeBindings({ ...this.bindings, ...(bindings || {}) });
    return this.bindings;
  }

  setGamepadBindings(bindings) {
    this.gamepadBindings = normalizeGamepadBindings({ ...this.gamepadBindings, ...(bindings || {}) });
    return this.gamepadBindings;
  }

  clearPadEdges() { for (const key of Object.keys(this.lastPad)) this.lastPad[key] = false; }
  consume(code) { const hit=this.pressed.has(code); this.pressed.delete(code); return hit; }
  consumeAny(codes) { for (const code of codes) if (this.consume(code)) return true; return false; }
  clearPressed() { this.pressed.clear(); }

  getGamepad() {
    const pads = navigator.getGamepads?.() || [];
    const selected = this.gamepadIndex == null ? Array.from(pads).find(Boolean) : pads[this.gamepadIndex];
    if (selected && this.gamepadIndex == null) this.gamepadIndex = selected.index;
    return selected || null;
  }

  activeGamepadButtons() {
    const pad = this.getGamepad();
    if (!pad) return new Set();
    return new Set((pad.buttons || []).map((button, index) => {
      const value = Number(button?.value);
      return button?.pressed || Number.isFinite(value) && value >= .55 ? index : null;
    }).filter(index => index !== null));
  }

  pollGamepad() {
    const pad = this.getGamepad();
    if (!pad) { this.clearPadEdges(); return; }
    const axisX = pad.axes[0] || 0, axisY = pad.axes[1] || 0;
    const buttonPressed = index => {
      const button = pad.buttons?.[index];
      const value = Number(button?.value);
      return Boolean(button?.pressed) || Number.isFinite(value) && value >= .55;
    };
    const state = {
      confirm:Boolean(pad.buttons[0]?.pressed),
      back:Boolean(pad.buttons[1]?.pressed),
      restart:Boolean(pad.buttons[3]?.pressed),
      start:Boolean(pad.buttons[9]?.pressed),
      up:Boolean(pad.buttons[12]?.pressed) || axisY < -.62,
      down:Boolean(pad.buttons[13]?.pressed) || axisY > .62,
      left:Boolean(pad.buttons[14]?.pressed) || axisX < -.72,
      right:Boolean(pad.buttons[15]?.pressed) || axisX > .72,
      shiftUp:buttonPressed(this.gamepadBindings.shiftUp),
      shiftDown:buttonPressed(this.gamepadBindings.shiftDown)
    };
    const codes = { confirm:'PadConfirm', back:'PadBack', restart:'PadRestart', start:'PadStart', up:'PadUp', down:'PadDown', left:'PadLeft', right:'PadRight', shiftUp:'PadShiftUp', shiftDown:'PadShiftDown' };
    for (const [name,active] of Object.entries(state)) {
      if (active && !this.lastPad[name]) this.pressed.add(codes[name]);
      this.lastPad[name] = active;
    }
  }

  read(car) {
    if (this.autopilot) return { ...this.readAutopilot(car), shiftUp:false, shiftDown:false };
    // The chase view presents positive vehicle steer as visual left, so every
    // manual steering source maps left to +1 and right to -1 here.
    let steer = (this.keys.has('ArrowLeft')||this.keys.has(this.bindings.steerLeft)?1:0) - (this.keys.has('ArrowRight')||this.keys.has(this.bindings.steerRight)?1:0);
    let throttle = this.keys.has('ArrowUp')||this.keys.has(this.bindings.accelerate) ? 1 : 0;
    let brake = this.keys.has('ArrowDown')||this.keys.has(this.bindings.brake) ? 1 : 0;
    let handbrake = this.keys.has(this.bindings.handbrake) ? 1 : 0;
    const pad=this.getGamepad();
    if (pad) {
      const dead = value => Math.abs(value)<.12?0:Math.sign(value)*(Math.abs(value)-.12)/.88;
      const axis=-dead(pad.axes[0]||0); if(Math.abs(axis)>Math.abs(steer))steer=axis;
      const buttonValue = index => {
        const button = pad.buttons?.[index];
        const value = Number(button?.value);
        return clamp(Number.isFinite(value) ? value : button?.pressed ? 1 : 0, 0, 1);
      };
      throttle=Math.max(throttle,buttonValue(this.gamepadBindings.accelerate));
      brake=Math.max(brake,buttonValue(this.gamepadBindings.brake));
      handbrake=Math.max(handbrake,buttonValue(this.gamepadBindings.handbrake));
    }
    return {
      steer:clamp(steer,-1,1),
      throttle:clamp(throttle,0,1),
      brake:clamp(brake,0,1),
      handbrake:clamp(handbrake,0,1),
      shiftUp:this.consumeAny([this.bindings.shiftUp, 'PadShiftUp']),
      shiftDown:this.consumeAny([this.bindings.shiftDown, 'PadShiftDown'])
    };
  }

  readAutopilot(car) { return autopilotControls(this.stage,car); }
}

/**
 * Deterministic reference driver. It is the QA harness's hands, so it has to
 * drive the physics the game actually ships: brake for the grip it has, aim at
 * a pursuit point rather than at a heading, and catch its own slides.
 */
/**
 * Speed profile for a route: corner speeds from curvature, then a backward pass
 * for braking and a forward pass for acceleration. Planning the whole stage
 * once beats reacting to a lookahead window, which is why real pace notes exist.
 */
export function planReferenceSpeeds(stage, lateralGripMps2, tuning = AUTOPILOT_TUNING) {
  const samples = stage.samples;
  const speeds = new Float64Array(samples.length);
  const corner = Math.max(1, lateralGripMps2 * tuning.cornerMargin);
  const braking = Math.max(1, lateralGripMps2 * tuning.brakingMargin);
  const driving = Math.max(1, lateralGripMps2 * tuning.driveMargin);
  for (let i = 0; i < samples.length; i += 1) {
    const curvature = Math.abs(samples[i].curvature);
    speeds[i] = curvature > 1e-5 ? Math.min(tuning.topSpeed, Math.sqrt(corner / curvature)) : tuning.topSpeed;
  }
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const ds = Math.max(0.5, samples[i + 1].s - samples[i].s);
    speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i + 1] * speeds[i + 1] + 2 * braking * ds));
  }
  for (let i = 1; i < samples.length; i += 1) {
    const ds = Math.max(0.5, samples[i].s - samples[i - 1].s);
    speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i - 1] * speeds[i - 1] + 2 * driving * ds));
  }
  return speeds;
}

const referencePlans = new WeakMap();
function referenceSpeedAt(stage, progress, lateralGrip, tuning) {
  let plans = referencePlans.get(stage);
  if (!plans) { plans = new Map(); referencePlans.set(stage, plans); }
  // Bucket the grip so a surface change reuses one plan instead of replanning
  // the whole stage every frame.
  const key = Math.round(lateralGrip * 4);
  let speeds = plans.get(key);
  if (!speeds) { speeds = planReferenceSpeeds(stage, key / 4, tuning); plans.set(key, speeds); }
  // Sample spacing is near-uniform but not exactly uniform, and the error
  // compounds: assuming it would put the braking points tens of metres out by
  // the end of a stage. Seed from the estimate, then walk onto the real index.
  const samples = stage.samples;
  const spacing = Math.max(0.5, samples[1].s - samples[0].s);
  let index = clamp(Math.round(progress / spacing), 0, speeds.length - 1);
  while (index > 0 && samples[index].s > progress) index -= 1;
  while (index < speeds.length - 1 && samples[index + 1].s <= progress) index += 1;
  return speeds[index];
}

/** Lateral grip, in m/s^2, a named surface offers this car in this weather. */
export function surfaceGripFor(surfaceId, car) {
  const weather = car.weather || {};
  const wetness = clamp(Number(weather.roadWetness) || 0, 0, 1);
  const gripScale = Number.isFinite(Number(weather.gripScale)) ? Number(weather.gripScale) : 1;
  const wetLoss = surfaceId === 'tarmac' ? wetness * .16 : wetness * .045;
  const surfaceGrip = SURFACE_GRIP[surfaceId] ?? .8;
  return Math.max(2.2, surfaceGrip * gripScale * (1 - wetLoss) * 9.81 * (1 - (car.damage?.suspension || 0) * .25));
}

/** Lateral grip, in m/s^2, that this car has under it right now. */
export function autopilotGrip(car) {
  return surfaceGripFor(car.surface, car);
}

/**
 * Deterministic reference driver. It is the QA harness's hands, so it drives
 * the physics the game actually ships: a planned speed profile for the whole
 * stage, Stanley path tracking on the centreline, and a traction budget that
 * gives cornering first call on the grip.
 */
export function autopilotControls(stage, car, options = null) {
  const tuning = options ? { ...AUTOPILOT_TUNING, ...options } : AUTOPILOT_TUNING;
  const speed = Math.max(car.speed, .01);
  const profile = car.profile || {};
  const lateralGrip = autopilotGrip(car);
  const front = sampleStage(stage, Math.min(stage.length, car.progress + 2));
  // Pace comes from the tightest curvature inside a window ahead, held until
  // the window clears: the planned-profile version of this drove the stages
  // faster than the authored duration bands, and those bands are also the
  // rivals' pace, so the conservative window is the one that belongs here.
  let tightest = 0;
  let horizonGrip = lateralGrip;
  for (const ahead of AUTOPILOT_HORIZON) {
    const sample = sampleStage(stage, Math.min(stage.length, car.progress + ahead));
    tightest = Math.max(tightest, Math.abs(sample.curvature));
    // Plan for the worst surface in the window, not the one under the car:
    // arriving at a loose section carrying compact-gravel speed is a departure.
    horizonGrip = Math.min(horizonGrip, surfaceGripFor(sample.surface, car));
  }
  const cornerSpeed = tightest < 7e-4
    ? tuning.topSpeed
    : clamp(Math.sqrt(horizonGrip * tuning.cornerMargin / Math.max(6e-4, tightest)), 10, tuning.reactiveCap);
  // Running out of road is the one mistake that compounds: it costs the line,
  // then the surface, then the car. Give up speed early when the car is drifting
  // towards the edge rather than waiting until it is over it.
  const halfWidth = Math.max(2, front.width * .5);
  const edgeUse = clamp((Math.abs(car.lateral) / halfWidth - .55) / .45, 0, 1);
  const outward = Math.sign(car.lateral || 1) * (car.lateralSpeed || 0) > 0 ? 1 : .45;
  const edgeScale = 1 - edgeUse * outward * tuning.edgeCaution;
  const targetSpeed = Math.min(cornerSpeed, car.surface === 'loose' ? tuning.looseSpeed : tuning.topSpeed) * edgeScale;

  // Steering keeps the proven law: a proportional pull towards the road heading
  // with line, yaw-rate and slide-catching damping. The slip term is what
  // countersteers, and its sign was checked against a measured slide recovery.
  // Look closer while catching a slide: a distant aim point asks for lock the
  // car cannot use yet.
  const look = clamp(18 + speed * .55, 20, 45) * (Math.abs(car.slipAngle) > .42 ? .6 : 1);
  const aim = sampleStage(stage, Math.min(stage.length, car.progress + look));
  // On the road, follow the road's heading. Off it, aim at the road itself:
  // holding a parallel heading out in a field never brings the car back.
  const rejoin = clamp((Math.abs(car.lateral) - halfWidth) / 7, 0, 1);
  const bearingToRoute = Math.atan2(aim.x - car.x, aim.z - car.z);
  const desiredHeading = rejoin > 0 ? aim.heading + wrapAngle(bearingToRoute - aim.heading) * rejoin : aim.heading;
  const headingError = wrapAngle(desiredHeading - car.yaw);
  // The line term has to be bounded. Unclamped, a car twenty metres off the
  // road pins the steering at full lock on that term alone, and then nothing
  // the heading or slide terms say can reach the wheels.
  const steer = headingError * tuning.headingGain
    - clamp(car.lateral * tuning.lineGain, -tuning.lineAuthority, tuning.lineAuthority)
    - car.yawRate * tuning.yawDamping
    - car.slipAngle * tuning.slideGain;

  // Recovery mode. A big slide or a trip onto the verge is where a reactive
  // driver compounds its mistake: it keeps chasing the line and spins again.
  // Straighten first, slow down, and only then rejoin.
  const slideAngle = Math.abs(car.slipAngle);
  const offRoad = Math.abs(car.lateral) > front.width * .5 + 1;
  const recovering = slideAngle > .42 || (offRoad && speed > 6) || car.recoveryCooldown > 0;
  const error = (recovering ? Math.min(targetSpeed, tuning.recoverySpeed) : targetSpeed) - speed;
  let throttle = clamp(error * tuning.throttleGain, 0, 1);
  const brake = clamp(-error * tuning.brakeGain, 0, 1);
  // Traction budget: cornering has first call on the grip, and only what is
  // left may be spent on drive. This is the difference between a driver and a
  // throttle switch.
  // Cornering demand, not cornering force: at walking pace a couple of degrees
  // of slip already produces most of the tyre's force, and reading that as a
  // spent grip budget left a car stranded on a verge unable to power out.
  const pathDemand = speed * speed * Math.abs(front.curvature) / lateralGrip;
  const measured = Math.abs(car.lateralAcceleration || 0) / lateralGrip * clamp(speed / 10, 0, 1);
  const lateralUse = clamp(Math.max(pathDemand, measured), 0, 1);
  // On a front-driven car the same axle is steering, cornering and pulling, so
  // its share of the budget is smaller; a rear-driven one can spend more.
  const layout = String(profile.drive || 'awd').toLowerCase();
  const driveShare = layout === 'fwd' ? .72 : layout === 'rwd' ? 1.08 : 1;
  throttle = Math.min(throttle, Math.sqrt(Math.max(0, 1 - lateralUse * lateralUse)) * driveShare + .12);
  const drivenSlip = Math.max(car.slipRatio?.front || 0, car.slipRatio?.rear || 0);
  throttle *= clamp(1 - (drivenSlip - .14) * tuning.slipCut, .1, 1);
  throttle *= clamp(1 - (Math.abs(car.slipAngle) - .12) * tuning.slideCut, .05, 1);
  // Only ever a deliberate rotation aid, never a panic button.
  const handbrake = Math.abs(headingError) > .45 && speed > targetSpeed + 6 ? .25 : 0;
  return { steer: clamp(steer, -1, 1), throttle: clamp(throttle, 0, 1), brake, handbrake };
}

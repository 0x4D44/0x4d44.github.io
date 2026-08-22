import { clamp, wrapAngle } from './math.js';
import { sampleStage } from './stage.js';

export const DEFAULT_BINDINGS = Object.freeze({
  accelerate: 'KeyA',
  brake: 'KeyZ',
  steerLeft: 'Comma',
  steerRight: 'Period',
  handbrake: 'Space',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ'
});

const BINDING_ACTIONS = Object.freeze(Object.keys(DEFAULT_BINDINGS));
const FIXED_FALLBACKS = Object.freeze(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const RESERVED_MENU_KEYS = new Set(['KeyR', 'Escape', 'Enter']);
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

export class InputManager {
  constructor(stage, { autopilot = false, bindings = DEFAULT_BINDINGS } = {}) {
    this.stage = stage;
    this.autopilot = autopilot;
    this.bindings = normalizeBindings(bindings);
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

  pollGamepad() {
    const pad = this.getGamepad();
    if (!pad) { this.clearPadEdges(); return; }
    const axisX = pad.axes[0] || 0, axisY = pad.axes[1] || 0;
    const state = {
      confirm:Boolean(pad.buttons[0]?.pressed),
      back:Boolean(pad.buttons[1]?.pressed),
      restart:Boolean(pad.buttons[3]?.pressed),
      start:Boolean(pad.buttons[9]?.pressed),
      up:Boolean(pad.buttons[12]?.pressed) || axisY < -.62,
      down:Boolean(pad.buttons[13]?.pressed) || axisY > .62,
      left:Boolean(pad.buttons[14]?.pressed) || axisX < -.72,
      right:Boolean(pad.buttons[15]?.pressed) || axisX > .72,
      shiftUp:Boolean(pad.buttons[4]?.pressed),
      shiftDown:Boolean(pad.buttons[5]?.pressed)
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
      throttle=Math.max(throttle,pad.buttons[7]?.value||0,pad.buttons[0]?.pressed?.6:0);
      brake=Math.max(brake,pad.buttons[6]?.value||0,pad.buttons[1]?.pressed?.7:0);
      handbrake=Math.max(handbrake,pad.buttons[2]?.pressed?1:0);
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

export function autopilotControls(stage,car) {
  const lookDistance=clamp(18+car.speed*.55,20,45), target=sampleStage(stage,car.progress+lookDistance);
  let maxCurve=0;
  for(const ahead of [25,50,80,115,150]) maxCurve=Math.max(maxCurve,Math.abs(sampleStage(stage,car.progress+ahead).curvature));
  const curveSpeed=maxCurve<.0007?40:clamp(Math.sqrt(.72*9.81/Math.max(.0006,maxCurve))*.68,10,37);
  const targetSpeed=Math.min(curveSpeed,car.surface==='loose'?30:41);
  const headingError=wrapAngle(target.heading-car.yaw);
  const steer=clamp(headingError*2.4-car.lateral*.17-car.yawRate*.65-car.slipAngle*1.0,-1,1);
  const error=targetSpeed-car.speed;
  const throttle=clamp(error*.14,0,1);
  const brake=clamp(-error*.23,0,1);
  const handbrake=maxCurve>.015&&car.speed>targetSpeed+5&&Math.abs(headingError)>.35?.25:0;
  return {steer,throttle,brake,handbrake};
}

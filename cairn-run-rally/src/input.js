import { clamp, wrapAngle } from './math.js';
import { sampleStage } from './stage.js';

const DRIVING_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyA','KeyZ','Comma','Period','Space','KeyR','Escape','Enter','KeyC']);
const isInteractive = target => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;

export class InputManager {
  constructor(stage, { autopilot = false } = {}) {
    this.stage = stage;
    this.autopilot = autopilot;
    this.keys = new Set();
    this.pressed = new Set();
    this.gamepadIndex = null;
    this.lastPad = { confirm:false, back:false, start:false, restart:false, up:false, down:false, left:false, right:false };

    window.addEventListener('keydown', event => {
      const interactive = isInteractive(event.target);
      if (!interactive && DRIVING_KEYS.has(event.code)) event.preventDefault();
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
      right:Boolean(pad.buttons[15]?.pressed) || axisX > .72
    };
    const codes = { confirm:'PadConfirm', back:'PadBack', restart:'PadRestart', start:'PadStart', up:'PadUp', down:'PadDown', left:'PadLeft', right:'PadRight' };
    for (const [name,active] of Object.entries(state)) {
      if (active && !this.lastPad[name]) this.pressed.add(codes[name]);
      this.lastPad[name] = active;
    }
  }

  read(car) {
    if (this.autopilot) return this.readAutopilot(car);
    // The chase view presents positive vehicle steer as visual left, so every
    // manual steering source maps left to +1 and right to -1 here.
    let steer = (this.keys.has('ArrowLeft')||this.keys.has('Comma')?1:0) - (this.keys.has('ArrowRight')||this.keys.has('Period')?1:0);
    let throttle = this.keys.has('ArrowUp')||this.keys.has('KeyA') ? 1 : 0;
    let brake = this.keys.has('ArrowDown')||this.keys.has('KeyZ') ? 1 : 0;
    let handbrake = this.keys.has('Space') ? 1 : 0;
    const pad=this.getGamepad();
    if (pad) {
      const dead = value => Math.abs(value)<.12?0:Math.sign(value)*(Math.abs(value)-.12)/.88;
      const axis=-dead(pad.axes[0]||0); if(Math.abs(axis)>Math.abs(steer))steer=axis;
      throttle=Math.max(throttle,pad.buttons[7]?.value||0,pad.buttons[0]?.pressed?.6:0);
      brake=Math.max(brake,pad.buttons[6]?.value||0,pad.buttons[1]?.pressed?.7:0);
      handbrake=Math.max(handbrake,pad.buttons[2]?.pressed?1:0);
    }
    return { steer:clamp(steer,-1,1),throttle:clamp(throttle,0,1),brake:clamp(brake,0,1),handbrake:clamp(handbrake,0,1) };
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

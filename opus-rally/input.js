// Keyboard, gamepad and touch collapsed into the one input record physics.js
// takes. Everything analogue-ish is shaped here rather than in the car model, so
// a keyboard player and a wheel player feed the same simulation.
//
// The keyboard is the hard case: a digital key has to become a steering angle
// that can be held mid-corner. Two things make it drivable — a rate limit that
// is faster at low speed than high, and a return-to-centre that is *slower* than
// the apply rate, so a stab of opposite lock does not snap the car back.

import { clamp, damp, moveToward, shape, saturate } from "./mathx.js";

export const DEFAULT_BINDINGS = Object.freeze({
  // Comma and period alongside the arrows, and A/Z for the pedals: the layout
  // every home-computer driving game used before WASD existed, and the one
  // people who learned to drive on those still reach for. A and D leave the
  // steering because A is now the throttle; W and S stay on the pedals.
  steerLeft: ["ArrowLeft", "Comma"],
  steerRight: ["ArrowRight", "Period"],
  throttle: ["ArrowUp", "KeyW", "KeyA"],
  brake: ["ArrowDown", "KeyS", "KeyZ"],
  handbrake: ["Space"],
  shiftUp: ["KeyE", "ShiftRight"],
  shiftDown: ["KeyQ", "ShiftLeft"],
  clutch: ["KeyC"],
  lookBack: ["KeyB"],
  camera: ["KeyV"],
  reset: ["KeyR"],
  repeatNote: ["KeyN"],
  pause: ["Escape", "KeyP"],
  headlights: ["KeyL"],
  wipers: ["KeyK"],
  horn: ["KeyH"],
});

const ACTIONS = Object.keys(DEFAULT_BINDINGS);

// A gamepad's sticks rest a little off centre and its triggers rest a little
// above zero; both would otherwise show up as a permanent creep.
function applyDeadzone(v, dead, gamma) {
  const a = Math.abs(v);
  if (a <= dead) return 0;
  const t = (a - dead) / (1 - dead);
  return Math.sign(v) * Math.pow(t, gamma);
}

export function makeInput() {
  return {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    clutch: 0,
    shiftUp: false,
    shiftDown: false,
    gear: null,
    lookBack: false,
    reset: false,
  };
}

export function createInput(opts = {}) {
  const target = opts.target ?? (typeof window !== "undefined" ? window : null);
  const bindings = { ...DEFAULT_BINDINGS, ...(opts.bindings ?? {}) };
  const keyToAction = new Map();
  const held = new Set();
  const edges = new Set();
  const input = makeInput();

  const settings = {
    steerDeadzone: opts.steerDeadzone ?? 0.10,
    triggerDeadzone: opts.triggerDeadzone ?? 0.06,
    steerGamma: opts.steerGamma ?? 1.35,
    steerRate: opts.steerRate ?? 4.6,      // 1/s at a standstill
    steerReturn: opts.steerReturn ?? 3.2,
    steerSpeedFalloff: opts.steerSpeedFalloff ?? 0.55,
    pedalRate: opts.pedalRate ?? 7.0,
    invertY: false,
    gamepadIndex: null,
  };

  const touch = { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false };
  const events = { onAction: opts.onAction ?? null };

  let padSteerRaw = 0;
  let usingPad = false;
  let usingTouch = false;
  const padPrev = [];

  function rebuildKeyMap() {
    keyToAction.clear();
    for (const action of ACTIONS) {
      for (const code of bindings[action] ?? []) {
        if (!keyToAction.has(code)) keyToAction.set(code, []);
        keyToAction.get(code).push(action);
      }
    }
  }
  rebuildKeyMap();

  function onKeyDown(e) {
    const actions = keyToAction.get(e.code);
    if (!actions) return;
    // Space and the arrows scroll the page; a rally stage that scrolls is over.
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    usingPad = false;
    usingTouch = false;
    for (const a of actions) {
      held.add(a);
      edges.add(a);
      events.onAction?.(a, true);
    }
  }

  function onKeyUp(e) {
    const actions = keyToAction.get(e.code);
    if (!actions) return;
    e.preventDefault();
    for (const a of actions) {
      held.delete(a);
      events.onAction?.(a, false);
    }
  }

  function onBlur() {
    held.clear();
  }

  if (target) {
    target.addEventListener("keydown", onKeyDown, { passive: false });
    target.addEventListener("keyup", onKeyUp, { passive: false });
    target.addEventListener("blur", onBlur);
  }

  function pollGamepad() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav?.getGamepads) return null;
    const pads = nav.getGamepads();
    let pad = settings.gamepadIndex != null ? pads[settings.gamepadIndex] : null;
    if (!pad) {
      for (const p of pads) {
        if (p?.connected) { pad = p; break; }
      }
    }
    return pad ?? null;
  }

  // Held-down state comes from the pad every frame; a "pressed this frame" edge
  // has to be derived, because the Gamepad API has no events for it.
  function padEdge(pad, index) {
    const now = !!pad.buttons[index]?.pressed;
    const was = padPrev[index] ?? false;
    padPrev[index] = now;
    return now && !was;
  }

  function update(dt, speed = 0) {
    const pad = pollGamepad();
    let steerTarget = 0;
    let throttleTarget = 0;
    let brakeTarget = 0;
    let handbrakeTarget = 0;
    let clutchTarget = 0;
    let shiftUp = false;
    let shiftDown = false;
    let immediate = false;

    if (pad) {
      const axis = pad.axes[0] ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const active = Math.abs(axis) > settings.steerDeadzone
        || rt > settings.triggerDeadzone || lt > settings.triggerDeadzone
        || pad.buttons.some((b) => b?.pressed);
      if (active) { usingPad = true; usingTouch = false; }
      if (usingPad) {
        padSteerRaw = applyDeadzone(axis, settings.steerDeadzone, settings.steerGamma);
        steerTarget = padSteerRaw;
        throttleTarget = applyDeadzone(rt, settings.triggerDeadzone, 1.0);
        brakeTarget = applyDeadzone(lt, settings.triggerDeadzone, 1.0);
        handbrakeTarget = pad.buttons[0]?.pressed ? 1 : 0;
        clutchTarget = pad.buttons[2]?.pressed ? 1 : 0;
        shiftUp = padEdge(pad, 5);
        shiftDown = padEdge(pad, 4);
        if (padEdge(pad, 3)) events.onAction?.("camera", true);
        if (padEdge(pad, 1)) events.onAction?.("reset", true);
        if (padEdge(pad, 9)) events.onAction?.("pause", true);
        // A stick is already analogue — rate-limiting it would add lag for no gain.
        immediate = true;
      }
    }

    if (touch.active) {
      usingTouch = true;
      usingPad = false;
      steerTarget = touch.steer;
      throttleTarget = touch.throttle;
      brakeTarget = touch.brake;
      handbrakeTarget = touch.handbrake;
      immediate = true;
    }

    if (!usingPad && !usingTouch) {
      // POSITIVE steer is RIGHT. This is not a matter of taste: physics, the
      // autopilot and the gamepad X axis all agree on it, and the keyboard was
      // the one path that did not — it computed `left - right`, so every key a
      // player pressed steered the other way. Measured rather than argued:
      // sampling the autopilot down a stage, the sign of its steer opposed the
      // sign of the road's curvature (documented POSITIVE = turns LEFT) in 156
      // of 156 samples, with not one agreeing.
      const left = held.has("steerLeft") ? 1 : 0;
      const right = held.has("steerRight") ? 1 : 0;
      steerTarget = right - left;
      throttleTarget = held.has("throttle") ? 1 : 0;
      brakeTarget = held.has("brake") ? 1 : 0;
      handbrakeTarget = held.has("handbrake") ? 1 : 0;
      clutchTarget = held.has("clutch") ? 1 : 0;
      shiftUp = edges.has("shiftUp");
      shiftDown = edges.has("shiftDown");
    }

    if (immediate) {
      input.steer = steerTarget;
      input.throttle = throttleTarget;
      input.brake = brakeTarget;
    } else {
      // Steering authority shrinks with speed so a keyboard stab at 160 km/h is
      // a correction rather than a spin.
      const speedScale = 1 / (1 + speed * settings.steerSpeedFalloff * 0.02);
      const rate = (steerTarget === 0 || Math.sign(steerTarget) !== Math.sign(input.steer)
        ? settings.steerRate
        : settings.steerRate * speedScale);
      const returning = steerTarget === 0;
      input.steer = moveToward(
        input.steer,
        steerTarget * speedScale,
        (returning ? settings.steerReturn : rate) * dt,
      );
      input.throttle = moveToward(input.throttle, throttleTarget, settings.pedalRate * dt);
      input.brake = moveToward(input.brake, brakeTarget, settings.pedalRate * dt);
    }

    input.handbrake = damp(input.handbrake, handbrakeTarget, 22, dt);
    input.clutch = damp(input.clutch, clutchTarget, 18, dt);
    input.steer = clamp(input.steer, -1, 1);
    input.throttle = saturate(input.throttle);
    input.brake = saturate(input.brake);
    input.shiftUp = shiftUp;
    input.shiftDown = shiftDown;
    input.lookBack = held.has("lookBack");
    edges.clear();
    return input;
  }

  return {
    input,
    settings,
    bindings,
    update,
    setTouch(patch) {
      Object.assign(touch, patch);
      touch.active = true;
    },
    clearTouch() {
      touch.active = false;
      touch.steer = 0;
      touch.throttle = 0;
      touch.brake = 0;
      touch.handbrake = 0;
    },
    setBinding(action, codes) {
      bindings[action] = codes.slice();
      rebuildKeyMap();
    },
    isHeld: (action) => held.has(action),
    get scheme() {
      return usingTouch ? "touch" : usingPad ? "gamepad" : "keyboard";
    },
    onAction(fn) { events.onAction = fn; },
    destroy() {
      if (!target) return;
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      held.clear();
    },
  };
}

// Exported for tests and for the settings screen's live preview.
export { applyDeadzone, ACTIONS };
export function steerShape(v, gamma) { return shape(clamp(v, -1, 1), gamma); }

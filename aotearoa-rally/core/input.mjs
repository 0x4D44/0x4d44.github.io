// Input: keyboard, gamepad, touch (on-screen controls with optional tilt) -> the `input` shape
// of CONTRACTS section 3. Mapping helpers are pure and exported for tests; createInput() needs
// an EventTarget (window in the browser, a bare EventTarget in tests).

import { clamp, approach } from "./mathx.mjs";

export const DEFAULT_BINDINGS = Object.freeze({
  // physical keys (event.code): A accelerate, Z brake / reverse, comma steer left, period steer right; arrows are the alternate set
  steerLeft: ["Comma", "ArrowLeft"],
  steerRight: ["Period", "ArrowRight"],
  throttle: ["KeyA", "ArrowUp"],
  brake: ["KeyZ", "ArrowDown"],
  handbrake: ["Space"],
  gearUp: ["ShiftLeft", "ShiftRight", "KeyE"],
  gearDown: ["ControlLeft", "ControlRight", "KeyQ"],
  camera: ["KeyC"],
  reset: ["KeyR"],
  pause: ["KeyP", "Escape"],
  hud: ["KeyH"],
  restart: ["KeyT"],
});

// v2: the default keys changed (WASD removed); older saved bindings are ignored so nobody keeps stale codes
export const BINDINGS_KEY = "aotearoa-rally.bindings.v2";
export const ACTIONS = Object.keys(DEFAULT_BINDINGS);
export const ACTION_LABELS = {
  steerLeft: "Steer left", steerRight: "Steer right", throttle: "Throttle", brake: "Brake / reverse",
  handbrake: "Handbrake", gearUp: "Gear up", gearDown: "Gear down", camera: "Change camera",
  reset: "Back to checkpoint", pause: "Pause", hud: "Hide HUD", restart: "Restart (single stage and trial)",
};

export const DEFAULT_PAD = Object.freeze({
  steerAxis: 0, throttle: 7, brake: 6, gearUp: 5, gearDown: 4, handbrake: 1, camera: 2, reset: 3, pause: 9, deadzone: 0.14, curve: 1.6,
});

/** Dead-zone then power curve, sign preserved. Output -1..1, zero inside the dead-zone. */
export function shapeAxis(v, deadzone = 0.14, curve = 1.6) {
  const a = Math.abs(v);
  if (!(a > deadzone)) return 0;
  const n = clamp((a - deadzone) / (1 - deadzone), 0, 1);
  return Math.sign(v) * Math.pow(n, curve);
}

/** Merge user bindings over defaults; unknown actions and non-string codes are dropped. */
export function normaliseBindings(user) {
  const out = {};
  for (const a of ACTIONS) {
    const list = user && Array.isArray(user[a]) ? user[a].filter((c) => typeof c === "string" && c.length < 32) : null;
    out[a] = list && list.length ? list.slice(0, 4) : DEFAULT_BINDINGS[a].slice();
  }
  return out;
}

const down = (keys, codes) => {
  for (let i = 0; i < codes.length; i++) if (keys.has(codes[i])) return true;
  return false;
};

/** Pure keyboard mapping of the held-key set into raw targets (no smoothing). */
export function mapKeyboard(keys, bindings) {
  const l = down(keys, bindings.steerLeft), r = down(keys, bindings.steerRight);
  return {
    steer: (r ? 1 : 0) - (l ? 1 : 0),
    throttle: down(keys, bindings.throttle) ? 1 : 0,
    brake: down(keys, bindings.brake) ? 1 : 0,
    handbrake: down(keys, bindings.handbrake) ? 1 : 0,
    gearUp: down(keys, bindings.gearUp),
    gearDown: down(keys, bindings.gearDown),
  };
}

const btn = (gp, i) => (gp.buttons && gp.buttons[i] ? (typeof gp.buttons[i] === "number" ? gp.buttons[i] : gp.buttons[i].value ?? (gp.buttons[i].pressed ? 1 : 0)) : 0);
const pressed = (gp, i) => !!(gp.buttons && gp.buttons[i] && (gp.buttons[i].pressed || btn(gp, i) > 0.5));

/** Pure gamepad mapping (standard layout). Triggers are analogue. */
export function mapGamepad(gp, pad = DEFAULT_PAD) {
  const steerRaw = gp.axes ? gp.axes[pad.steerAxis] || 0 : 0;
  const dpad = (pressed(gp, 15) ? 1 : 0) - (pressed(gp, 14) ? 1 : 0);
  return {
    steer: dpad || shapeAxis(steerRaw, pad.deadzone, pad.curve),
    throttle: clamp(btn(gp, pad.throttle), 0, 1),
    brake: clamp(btn(gp, pad.brake), 0, 1),
    handbrake: pressed(gp, pad.handbrake) ? 1 : 0,
    gearUp: pressed(gp, pad.gearUp),
    gearDown: pressed(gp, pad.gearDown),
    camera: pressed(gp, pad.camera),
    reset: pressed(gp, pad.reset),
    pause: pressed(gp, pad.pause),
  };
}

/** Map a horizontal touch position inside a rect to steering -1..1 with a small centre dead-zone. */
export function mapTouchSteer(clientX, left, width) {
  const n = ((clientX - left) / Math.max(1, width)) * 2 - 1;
  return shapeAxis(clamp(n, -1, 1), 0.06, 1.15);
}

/** Device tilt (gamma, degrees, screen-orientation adjusted) to steering. */
export function mapTilt(gammaDeg, range = 28) {
  return shapeAxis(clamp(gammaDeg / range, -1, 1), 0.05, 1.2);
}

export function createInput({ target, onPause, onAction, getGamepads, storage, isActive, isPaused } = {}) {
  const T = target || (typeof window !== "undefined" ? window : new EventTarget());
  const keys = new Set();
  let bindings = normaliseBindings(storage ? storage.getJSON(BINDINGS_KEY, null) : null);
  let pad = { ...DEFAULT_PAD };
  const prev = { gearUp: false, gearDown: false, camera: false, reset: false, pause: false };
  const out = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  let kbSteer = 0, kbThrottle = 0, kbBrake = 0;
  let rebindResolver = null;
  let enabled = true;
  const fire = (name) => {
    if (name === "pause") onPause && onPause();
    onAction && onAction(name);
  };
  const touch = {
    enabled: false,
    visible: false,
    tilt: false,
    state: { steer: 0, throttle: 0, brake: 0, handbrake: 0 },
    tiltSteer: 0,
    _pressGear: { up: false, down: false },
  };
  const info = { gamepadConnected: false, lastDevice: "keyboard" };

  const codeToAction = (code) => {
    for (const a of ACTIONS) if (bindings[a].includes(code)) return a;
    return null;
  };
  const onKeyDown = (e) => {
    if (rebindResolver) {
      e.preventDefault && e.preventDefault();
      const r = rebindResolver;
      rebindResolver = null;
      r(e.code);
      return;
    }
    if (!enabled) return;
    if (e.code === "Tab" || e.altKey || e.metaKey) return;
    const a = codeToAction(e.code);
    if (!a) return;
    // Outside driving, menus own the keys (arrows navigate, Escape goes back). Only "pause" stays live
    // so the same key that opened the pause menu closes it.
    if (isActive && !isActive() && (a !== "pause" || (isPaused && !isPaused()))) return;
    if (e.preventDefault) e.preventDefault(); // Ctrl+A / Ctrl+Z / Space / arrows never reach the browser while driving
    info.lastDevice = "keyboard";
    if (!keys.has(e.code)) {
      keys.add(e.code);
      if (a === "camera" || a === "reset" || a === "pause" || a === "hud" || a === "restart") fire(a);
    }
  };
  const onKeyUp = (e) => void keys.delete(e.code);
  const onBlur = () => keys.clear();
  T.addEventListener("keydown", onKeyDown);
  T.addEventListener("keyup", onKeyUp);
  if (typeof window !== "undefined" && T !== window) window.addEventListener("blur", onBlur);
  else T.addEventListener("blur", onBlur);
  const onPad = (e) => {
    info.gamepadConnected = true;
    void e;
  };
  T.addEventListener("gamepadconnected", onPad);
  T.addEventListener("gamepaddisconnected", () => (info.gamepadConnected = false));

  const readPads = getGamepads || (() => (typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : []));
  let tiltListener = null;

  const api = {
    get bindings() {
      return bindings;
    },
    get pad() {
      return pad;
    },
    get gamepadConnected() {
      return info.gamepadConnected;
    },
    get lastDevice() {
      return info.lastDevice;
    },
    touch,
    set enabled(v) {
      enabled = !!v;
      if (!v) keys.clear();
    },
    get enabled() {
      return enabled;
    },
    setBindings(next, persist = true) {
      bindings = normaliseBindings(next);
      if (persist && storage) storage.setJSON(BINDINGS_KEY, bindings);
    },
    resetBindings() {
      api.setBindings(null);
    },
    /** Resolve with the next key code pressed (for the rebinding UI). */
    captureKey() {
      return new Promise((res) => (rebindResolver = res));
    },
    cancelCapture() {
      rebindResolver = null;
    },
    setPad(p) {
      pad = { ...DEFAULT_PAD, ...p };
    },
    setTilt(on) {
      touch.tilt = !!on;
      if (typeof window === "undefined") return;
      if (on && !tiltListener) {
        tiltListener = (ev) => {
          const g = ev.gamma ?? 0, b = ev.beta ?? 0;
          const ang = (screen.orientation && screen.orientation.angle) || 0;
          const v = ang === 90 ? b : ang === 270 || ang === -90 ? -b : g;
          touch.tiltSteer = mapTilt(v);
        };
        window.addEventListener("deviceorientation", tiltListener);
      } else if (!on && tiltListener) {
        window.removeEventListener("deviceorientation", tiltListener);
        tiltListener = null;
        touch.tiltSteer = 0;
      }
    },
    /** Sample all devices. `dt` seconds since the last poll (for key-steer smoothing). */
    poll(dt = 1 / 60) {
      const k = enabled ? mapKeyboard(keys, bindings) : { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
      // keyboard smoothing: steering ramps in, snaps back faster; pedals ramp briefly
      const steerRate = k.steer !== 0 && Math.sign(k.steer) === Math.sign(kbSteer) ? 4.2 : 9;
      kbSteer = approach(kbSteer, k.steer, steerRate * dt);
      kbThrottle = approach(kbThrottle, k.throttle, (k.throttle ? 7 : 12) * dt);
      kbBrake = approach(kbBrake, k.brake, (k.brake ? 9 : 14) * dt);
      let steer = kbSteer, throttle = kbThrottle, brake = kbBrake, handbrake = k.handbrake;
      let gUp = k.gearUp, gDown = k.gearDown;
      if (k.steer || k.throttle || k.brake) info.lastDevice = "keyboard";

      let gp = null;
      const pads = readPads() || [];
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) { gp = pads[i]; break; }
      info.gamepadConnected = !!gp;
      if (gp && enabled) {
        const m = mapGamepad(gp, pad);
        const active = Math.abs(m.steer) > 0.02 || m.throttle > 0.02 || m.brake > 0.02 || m.handbrake;
        if (active) info.lastDevice = "gamepad";
        if (Math.abs(m.steer) > Math.abs(steer)) steer = m.steer;
        throttle = Math.max(throttle, m.throttle);
        brake = Math.max(brake, m.brake);
        handbrake = Math.max(handbrake, m.handbrake);
        gUp = gUp || m.gearUp;
        gDown = gDown || m.gearDown;
        if (m.camera && !prev.camera) fire("camera");
        if (m.reset && !prev.reset) fire("reset");
        if (m.pause && !prev.pause) fire("pause");
        prev.camera = m.camera; prev.reset = m.reset; prev.pause = m.pause;
      }

      if (touch.enabled && enabled) {
        const t = touch.state;
        if (touch.tilt) steer = Math.abs(touch.tiltSteer) > Math.abs(steer) ? touch.tiltSteer : steer;
        else if (Math.abs(t.steer) > Math.abs(steer)) steer = t.steer;
        throttle = Math.max(throttle, t.throttle);
        brake = Math.max(brake, t.brake);
        handbrake = Math.max(handbrake, t.handbrake);
        if (touch._pressGear.up) gUp = true;
        if (touch._pressGear.down) gDown = true;
        touch._pressGear.up = touch._pressGear.down = false;
      }

      // gear buttons are edge-triggered
      out.gearUp = gUp && !prev.gearUp;
      out.gearDown = gDown && !prev.gearDown;
      prev.gearUp = gUp;
      prev.gearDown = gDown;
      out.steer = clamp(steer, -1, 1);
      out.throttle = clamp(throttle, 0, 1);
      out.brake = clamp(brake, 0, 1);
      out.handbrake = clamp(handbrake, 0, 1);
      return out;
    },
    dispose() {
      T.removeEventListener("keydown", onKeyDown);
      T.removeEventListener("keyup", onKeyUp);
      api.setTilt(false);
      if (touch._dom && touch._dom.remove) touch._dom.remove();
    },
  };

  // ---- on-screen controls -------------------------------------------------------------------
  api.mountTouch = (parent) => {
    if (typeof document === "undefined" || touch._dom) return;
    const root = document.createElement("div");
    root.className = "touch-controls";
    root.hidden = true;
    root.innerHTML = `
      <div class="tc-steer" data-z="steer" aria-label="Steer"><div class="tc-knob"></div><span class="tc-arrow l">&#9664;</span><span class="tc-arrow r">&#9654;</span></div>
      <div class="tc-right">
        <button class="tc-btn tc-gas" data-z="gas" aria-label="Throttle">GAS</button>
        <button class="tc-btn tc-brake" data-z="brake" aria-label="Brake">BRAKE</button>
        <button class="tc-btn tc-hb" data-z="hb" aria-label="Handbrake">HAND</button>
      </div>
      <div class="tc-gears"><button class="tc-btn sm" data-z="gdn" aria-label="Gear down">-</button><button class="tc-btn sm" data-z="gup" aria-label="Gear up">+</button></div>
      <button class="tc-btn sm tc-cam" data-z="cam" aria-label="Camera">CAM</button>`;
    parent.appendChild(root);
    touch._dom = root;
    const steerEl = root.querySelector(".tc-steer");
    const knob = root.querySelector(".tc-knob");
    const owners = new Map(); // pointerId -> zone
    const setZone = (zone, on, e) => {
      const t = touch.state;
      if (zone === "steer") {
        if (!on) { t.steer = 0; knob.style.transform = "translateX(0)"; return; }
        const r = steerEl.getBoundingClientRect();
        t.steer = mapTouchSteer(e.clientX, r.left, r.width);
        knob.style.transform = `translateX(${t.steer * (r.width / 2 - 36)}px)`;
      } else if (zone === "gas") t.throttle = on ? 1 : 0;
      else if (zone === "brake") t.brake = on ? 1 : 0;
      else if (zone === "hb") t.handbrake = on ? 1 : 0;
      else if (zone === "gup" && on) touch._pressGear.up = true;
      else if (zone === "gdn" && on) touch._pressGear.down = true;
      else if (zone === "cam" && on) fire("camera");
    };
    root.addEventListener("pointerdown", (e) => {
      const z = e.target.closest("[data-z]");
      if (!z) return;
      e.preventDefault();
      info.lastDevice = "touch";
      owners.set(e.pointerId, z.dataset.z);
      try { z.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      z.classList.add("on");
      setZone(z.dataset.z, true, e);
    });
    root.addEventListener("pointermove", (e) => {
      const zone = owners.get(e.pointerId);
      if (zone === "steer") setZone("steer", true, e);
    });
    const end = (e) => {
      const zone = owners.get(e.pointerId);
      if (!zone) return;
      owners.delete(e.pointerId);
      const z = root.querySelector(`[data-z="${zone}"]`);
      z && z.classList.remove("on");
      setZone(zone, false, e);
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  };
  api.showTouch = (on) => {
    touch.visible = !!on;
    touch.enabled = !!on;
    if (touch._dom) touch._dom.hidden = !on;
    if (!on) Object.assign(touch.state, { steer: 0, throttle: 0, brake: 0, handbrake: 0 });
  };
  return api;
}

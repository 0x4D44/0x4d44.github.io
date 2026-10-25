// Player input: keyboard, gamepad, touch overlay. read() returns a roster.js blankInput() shape.
import { blankInput, clamp } from "./roster.js";

const CSS = `
.kt-touch{position:fixed;inset:0;z-index:30;pointer-events:none;display:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;font-family:"Arial Black",Impact,system-ui,sans-serif}
.kt-touch.kt-on{display:block}
.kt-touch *{box-sizing:border-box;touch-action:none;-webkit-tap-highlight-color:transparent}
.kt-steer{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));width:min(42vw,250px);height:92px;pointer-events:auto;border-radius:46px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.06));border:2px solid rgba(255,255,255,.35);backdrop-filter:blur(2px)}
.kt-steer::before,.kt-steer::after{content:"";position:absolute;top:50%;width:0;height:0;border-style:solid;transform:translateY(-50%);opacity:.55}
.kt-steer::before{left:16px;border-width:11px 16px 11px 0;border-color:transparent #fff transparent transparent}
.kt-steer::after{right:16px;border-width:11px 0 11px 16px;border-color:transparent transparent transparent #fff}
.kt-steer-mid{position:absolute;left:50%;top:18%;bottom:18%;width:2px;background:rgba(255,255,255,.3);transform:translateX(-50%)}
.kt-knob{position:absolute;top:50%;left:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#7fe4ff,#1b8fd0 70%);border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.45)}
.kt-btn{position:absolute;pointer-events:auto;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-style:italic;letter-spacing:.5px;text-shadow:0 2px 4px rgba(0,0,0,.6);border:3px solid rgba(255,255,255,.75);box-shadow:0 4px 12px rgba(0,0,0,.4);transition:transform .06s,filter .06s}
.kt-btn.kt-down{transform:scale(.92);filter:brightness(1.35)}
.kt-drift{right:max(14px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:108px;height:108px;font-size:19px;background:radial-gradient(circle at 35% 30%,#ffb04a,#ef5a12 75%)}
.kt-item{right:calc(max(14px,env(safe-area-inset-right)) + 16px);bottom:calc(max(18px,env(safe-area-inset-bottom)) + 124px);width:78px;height:78px;font-size:15px;background:radial-gradient(circle at 35% 30%,#9ef0ff,#1396c8 75%)}
.kt-brake{right:calc(max(14px,env(safe-area-inset-right)) + 116px);bottom:max(18px,env(safe-area-inset-bottom));width:64px;height:64px;font-size:13px;background:radial-gradient(circle at 35% 30%,#ff7b7b,#c2262f 75%)}
@media (max-height:480px){
 .kt-steer{height:74px;border-radius:37px;width:min(40vw,230px)}
 .kt-knob{width:52px;height:52px;margin:-26px 0 0 -26px}
 .kt-drift{width:92px;height:92px;font-size:16px}
 .kt-item{width:66px;height:66px;font-size:13px;right:calc(max(14px,env(safe-area-inset-right)) + 104px);bottom:calc(max(18px,env(safe-area-inset-bottom)) + 70px)}
 .kt-brake{width:60px;height:60px;right:calc(max(14px,env(safe-area-inset-right)) + 104px);font-size:12px}
}
`;

const GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyW", "KeyA", "KeyS", "KeyD",
  "KeyE", "ControlLeft", "ControlRight", "Enter", "KeyX", "KeyC", "Backspace"]);

export class Controls {
  constructor(domRoot, canvas) {
    this.root = domRoot || document.body; this.canvas = canvas;
    this.enabled = true;
    this.onPause = null;
    this.touchMode = "auto";
    this.device = "keyboard";           // last-used device: keyboard | gamepad | touch
    this._keys = new Set();
    this._item = false;
    this._touch = { steer: 0, drift: false, brake: false, ptrs: new Map() };
    this._touchSeen = false;
    this._coarse = false;
    try { this._coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches) && (navigator.maxTouchPoints || 0) > 0; } catch (e) { /* ignore */ }
    this._pad = { item: false, start: false };
    this._out = blankInput();
    this._buildOverlay();
    this._bind();
    this._applyTouchVisibility();
  }

  setTouchMode(mode) {
    this.touchMode = mode === "on" || mode === "off" ? mode : "auto";
    this._applyTouchVisibility();
  }

  get touchVisible() {
    if (!this.enabled) return false;
    if (this.touchMode === "on") return true;
    if (this.touchMode === "off") return false;
    return this._coarse || this._touchSeen;
  }

  _applyTouchVisibility() {
    const on = this.touchVisible;
    this.overlay.classList.toggle("kt-on", on);
    if (!on) this._resetTouch();
  }

  // Setter-like hook: engine assigns controls.enabled = bool; we poll it cheaply in read() and via defineProperty below.
  _resetTouch() {
    const t = this._touch;
    t.steer = 0; t.drift = false; t.brake = false; t.ptrs.clear();
    this.knob.style.transform = "";
    for (const b of [this.btnDrift, this.btnItem, this.btnBrake]) b.classList.remove("kt-down");
  }

  // ------------------------------------------------ overlay
  _buildOverlay() {
    if (!document.getElementById("kt-style")) {
      const st = document.createElement("style"); st.id = "kt-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    const o = document.createElement("div"); o.className = "kt-touch"; o.setAttribute("aria-hidden", "true");
    o.innerHTML = `<div class="kt-steer"><div class="kt-steer-mid"></div><div class="kt-knob"></div></div>
      <div class="kt-btn kt-brake">BRAKE</div><div class="kt-btn kt-item">ITEM</div><div class="kt-btn kt-drift">DRIFT</div>`;
    this.root.appendChild(o);
    this.overlay = o;
    this.pad = o.querySelector(".kt-steer"); this.knob = o.querySelector(".kt-knob");
    this.btnDrift = o.querySelector(".kt-drift"); this.btnItem = o.querySelector(".kt-item"); this.btnBrake = o.querySelector(".kt-brake");
    const t = this._touch;

    const steerFrom = (e) => {
      const r = this.pad.getBoundingClientRect();
      const half = r.width / 2 - 34;
      const x = clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1);
      const dz = 0.06;
      t.steer = Math.abs(x) < dz ? 0 : Math.sign(x) * (Math.abs(x) - dz) / (1 - dz);
      this.knob.style.transform = `translateX(${x * half}px)`;
    };
    this.pad.addEventListener("pointerdown", (e) => { e.preventDefault(); this.pad.setPointerCapture(e.pointerId); t.ptrs.set(e.pointerId, "steer"); steerFrom(e); this.device = "touch"; });
    this.pad.addEventListener("pointermove", (e) => { if (t.ptrs.get(e.pointerId) === "steer") steerFrom(e); });
    const endSteer = (e) => { if (t.ptrs.get(e.pointerId) === "steer") { t.ptrs.delete(e.pointerId); t.steer = 0; this.knob.style.transform = ""; } };
    this.pad.addEventListener("pointerup", endSteer); this.pad.addEventListener("pointercancel", endSteer); this.pad.addEventListener("lostpointercapture", endSteer);

    const hold = (el, key, onDown) => {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); t.ptrs.set(e.pointerId, key); el.classList.add("kt-down"); this.device = "touch"; onDown(true); });
      const up = (e) => { if (t.ptrs.get(e.pointerId) === key) { t.ptrs.delete(e.pointerId); el.classList.remove("kt-down"); onDown(false); } };
      el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
    };
    hold(this.btnDrift, "drift", (d) => { t.drift = d; });
    hold(this.btnBrake, "brake", (d) => { t.brake = d; });
    hold(this.btnItem, "item", (d) => { if (d && this.enabled) this._item = true; });
    o.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ------------------------------------------------ listeners
  _bind() {
    this._onKeyDown = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const c = e.code;
      if (c === "Escape" || c === "KeyP") {
        if (this.enabled && !e.repeat && this.onPause) { e.preventDefault(); this.onPause(); }
        return;
      }
      if (!GAME_KEYS.has(c)) return;
      if (this.enabled) e.preventDefault();
      this.device = "keyboard";
      if (this.touchMode === "auto" && this._touchSeen && !this._coarse) { this._touchSeen = false; this._applyTouchVisibility(); }
      if (!this.enabled) return;
      if (!this._keys.has(c) && (c === "KeyE" || c === "ControlLeft" || c === "ControlRight" || c === "Enter" || c === "KeyX")) this._item = true;
      this._keys.add(c);
    };
    this._onKeyUp = (e) => { this._keys.delete(e.code); };
    this._onBlur = () => { this._keys.clear(); this._resetTouch(); };
    this._onPointer = (e) => {
      if (e.pointerType === "touch" && !this._touchSeen) { this._touchSeen = true; this._applyTouchVisibility(); }
    };
    this._onVis = () => { if (document.hidden) this._onBlur(); };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    window.addEventListener("pointerdown", this._onPointer, true);
    document.addEventListener("visibilitychange", this._onVis);
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("pointerdown", this._onPointer, true);
    document.removeEventListener("visibilitychange", this._onVis);
    this.overlay.remove();
  }

  // ------------------------------------------------ gamepad
  _readPad(out) {
    let pads;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return false; }
    if (!pads) return false;
    let used = false;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      let ax = p.axes[0] || 0;
      const dz = 0.16;
      ax = Math.abs(ax) < dz ? 0 : Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
      if (b(14)) ax = -1; else if (b(15)) ax = 1;
      const thr = Math.max(b(7), b(0));
      const brk = Math.max(b(6), b(1));
      const drift = b(4) > 0.5 || b(5) > 0.5;
      const item = b(2) > 0.5 || b(3) > 0.5;
      const start = b(9) > 0.5;
      const back = b(10) > 0.5 || b(11) > 0.5;
      if (item && !this._pad.item && this.enabled) this._item = true;
      if (start && !this._pad.start && this.enabled && this.onPause) this.onPause();
      this._pad.item = item; this._pad.start = start;
      if (Math.abs(ax) > 0 || thr > 0.05 || brk > 0.05 || drift || item || back) { used = true; this.device = "gamepad"; }
      if (Math.abs(ax) > Math.abs(out.steer)) out.steer = ax;
      out.throttle = Math.max(out.throttle, thr); out.brake = Math.max(out.brake, brk);
      out.drift = out.drift || drift; out.lookBack = out.lookBack || back;
    }
    return used;
  }

  // ------------------------------------------------ read
  read() {
    const o = this._out;
    o.throttle = 0; o.brake = 0; o.steer = 0; o.drift = false; o.lookBack = false; o.useItem = false;
    // overlay follows `enabled` even if the engine toggles it without calling setTouchMode
    const vis = this.overlay.classList.contains("kt-on");
    if (vis !== this.touchVisible) this._applyTouchVisibility();
    if (!this.enabled) { this._item = false; return o; }

    const k = this._keys;
    const left = k.has("ArrowLeft") || k.has("KeyA"), right = k.has("ArrowRight") || k.has("KeyD");
    o.steer = (right ? 1 : 0) - (left ? 1 : 0);
    o.throttle = (k.has("ArrowUp") || k.has("KeyW")) ? 1 : 0;
    o.brake = (k.has("ArrowDown") || k.has("KeyS")) ? 1 : 0;
    o.drift = k.has("Space") || k.has("ShiftLeft") || k.has("ShiftRight");
    o.lookBack = k.has("KeyC") || k.has("Backspace");

    this._readPad(o);

    if (this.touchVisible) {
      const t = this._touch;
      if (Math.abs(t.steer) > Math.abs(o.steer)) o.steer = t.steer;
      if (t.brake) { o.brake = 1; o.throttle = 0; } else if (o.brake === 0) o.throttle = 1;   // auto-accelerate
      if (t.drift) o.drift = true;
    }
    o.steer = clamp(o.steer, -1, 1);
    o.useItem = this._item; this._item = false;
    return o;
  }
}

// Input: keyboard, gamepad, touch. Owner: flight agent.
// Contract: createInput(game) -> { sample(): Controls, enable(on), init(), bindingsText(), enabled, controls, pad }.
// sample() is called once per FIXED sim step and returns edge-latched controls (barrel / item are true for exactly one sample
// after the press). Emits 'input:pause' (Esc / P / Start / touch pause), 'input:camera' (C / Y / touch), 'input:lookback' (V / R3).
// settings.pitchMode: 'flight' (default) = push forward (W / Up / stick up) is nose DOWN, 'arcade' flips it.
import { createControls, resetControls } from '../controls.js';
import { SIM_DT } from '../config.js';

const DOUBLE_TAP = 0.22;      // s between two presses of A / D for a barrel roll
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const approach = (cur, target, rate, dt) => { const d = target - cur, m = rate * dt; return Math.abs(d) <= m ? target : cur + Math.sign(d) * m; };
const dead = (x, dz) => { const a = Math.abs(x); if (a <= dz) return 0; const n = (a - dz) / (1 - dz); return Math.sign(x) * (n * (0.6 + 0.4 * n)); };

export function createInput(game) {
  const keys = new Set(), latched = new Set(), lastDown = {}, c = createControls();
  const st = { pitch: 0, roll: 0, padBarrel: 0, padItem: false, padPrev: [], tapBarrel: 0, touchBarrel: 0, touchItem: false, tick: 0, touchOn: false };
  const touch = { root: null, ids: {}, stick: { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, held: { boost: false, fire: false, brake: false, back: false, look: false }, built: false, visible: false };
  const emit = (n) => game.events?.emit?.(n, {});
  const isField = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
  const pitchSign = () => (game.settings?.pitchMode === 'arcade' ? -1 : 1);     // 'flight': pull (S / stick down) = +1 = nose up

  const input = {
    enabled: true, controls: c, pad: { connected: false, id: '' }, touchActive: false,
    init() {},
    enable(on) {
      this.enabled = !!on;
      if (!on) { keys.clear(); latched.clear(); st.tapBarrel = 0; st.pitch = 0; st.roll = 0; resetControls(c); }
    },
    /** Controls-screen text: [{ group, rows: [[keys, action], ...] }]. Reflects the current pitchMode. */
    bindingsText() {
      const fl = game.settings?.pitchMode !== 'arcade';
      return [
        { group: 'Keyboard', rows: [
          [fl ? 'W / Up' : 'S / Down', 'Nose down (push)'], [fl ? 'S / Down' : 'W / Up', 'Nose up (pull)'],
          ['A / Left, D / Right', 'Bank left / right'], ['Q / E, or double-tap A / D', 'Barrel roll (dodges missiles)'],
          ['Shift', 'Boost'], ['Ctrl / X', 'Airbrake'], ['Space', 'Cannon'], ['F / Enter', 'Use item (hold B for backwards)'],
          ['V', 'Look back'], ['C', 'Change camera'], ['Esc / P', 'Pause'] ] },
        { group: 'Gamepad', rows: [
          ['Left stick', fl ? 'Pitch (up = nose down) and bank' : 'Pitch (up = nose up) and bank'], ['Right trigger', 'Boost'], ['Left trigger', 'Airbrake'],
          ['LB / RB', 'Barrel roll left / right'], ['A', 'Use item'], ['B', 'Use item backwards'], ['X', 'Cannon'], ['Y', 'Change camera'], ['Right stick click', 'Look back'], ['Start', 'Pause'] ] },
        { group: 'Touch', rows: [
          ['Left thumb: drag', 'Steer (pitch and bank)'], ['BOOST / FIRE / ITEM', 'Boost, cannon, use item'], ['< ROLL / ROLL >', 'Barrel roll'], ['BRAKE', 'Airbrake'], ['Pause (top right)', 'Pause'] ] },
      ];
    },
    sample() {
      st.tick++;
      const dt = SIM_DT, ps = pitchSign();
      if (!this.enabled) { resetControls(c); latched.clear(); return c; }
      const axis = (neg, pos) => (neg.some((k) => keys.has(k)) ? -1 : 0) + (pos.some((k) => keys.has(k)) ? 1 : 0);
      // keyboard: short ramps so a tap is a nudge and a hold is a full input
      const pullKey = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);            // +1 = S / Down
      const kp = pullKey * ps, kr = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      st.pitch = approach(st.pitch, kp, kp === 0 ? 9 : 4.5, dt);
      st.roll = approach(st.roll, kr, kr === 0 ? 12 : 8, dt);
      let pitch = st.pitch, roll = st.roll, yaw = 0;
      let boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      let brake = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyX') ? 1 : 0;
      let fire = keys.has('Space'), itemBack = keys.has('KeyB'), look = keys.has('KeyV');
      let barrel = latched.has('KeyQ') ? -1 : latched.has('KeyE') ? 1 : st.tapBarrel;
      let item = latched.has('KeyF') || latched.has('Enter');
      st.tapBarrel = 0;

      // gamepad
      const gp = readPad();
      if (gp) {
        const lx = dead(gp.axes[0] || 0, 0.12), ly = dead(gp.axes[1] || 0, 0.12), rx = dead(gp.axes[2] || 0, 0.15);
        if (lx !== 0) roll = lx;
        if (ly !== 0) pitch = clamp(ly * ps, -1, 1);                                // stick down = pull
        if (rx !== 0) yaw = rx;
        const b = (i) => !!gp.buttons[i]?.pressed, pb = st.padPrev;
        const edge = (i) => b(i) && !pb[i];
        const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
        if (rt > 0.3) boost = true;
        if (lt > 0.08) brake = Math.max(brake, lt);
        if (b(2)) fire = true;
        if (b(1)) itemBack = true;
        if (b(11)) look = true;
        if (edge(4)) barrel = -1; if (edge(5)) barrel = 1;
        if (edge(0) || edge(1)) item = true;
        if (edge(3)) emit('input:camera');
        if (edge(9)) emit('input:pause');
        if (edge(11)) emit('input:lookback');
        for (let i = 0; i < gp.buttons.length; i++) pb[i] = b(i);
      }

      // touch
      if (touch.built && touch.visible) {
        const s = touch.stick;
        if (s.id >= 0) { if (Math.abs(s.x) > 0.06) roll = clamp(s.x * 1.25, -1, 1); if (Math.abs(s.y) > 0.06) pitch = clamp(s.y * 1.25 * ps, -1, 1); }
        if (touch.held.boost) boost = true; if (touch.held.fire) fire = true; if (touch.held.brake) brake = 1; if (touch.held.look) look = true;
        if (st.touchBarrel) { barrel = st.touchBarrel; st.touchBarrel = 0; }
        if (st.touchItem) { item = true; st.touchItem = false; }
        if (touch.held.back) itemBack = true;
      }

      c.pitch = clamp(pitch, -1, 1); c.roll = clamp(roll, -1, 1); c.yaw = clamp(yaw, -1, 1);
      c.boost = boost; c.airbrake = brake; c.fire = fire; c.itemBack = itemBack; c.lookBack = look;
      c.barrel = barrel; c.item = item;
      latched.clear();
      return c;
    },
  };

  // ---------------- keyboard ----------------
  const onDown = (e) => {
    if (isField(e) && e.code !== 'Escape') return;
    const code = e.code;
    if (code === 'Space' || code.startsWith('Arrow') || code === 'Tab') { if (input.enabled && game.state === 'race') e.preventDefault(); }
    if (e.repeat) return;
    if (code === 'Escape' || code === 'KeyP') emit('input:pause');
    if (!input.enabled) return;
    keys.add(code); latched.add(code);
    if (code === 'KeyC') emit('input:camera');
    if (code === 'KeyV') emit('input:lookback');
    if (code === 'KeyA' || code === 'KeyD' || code === 'ArrowLeft' || code === 'ArrowRight') {
      const now = performance.now() / 1000, last = lastDown[code] ?? -9;
      if (now - last <= DOUBLE_TAP) { st.tapBarrel = code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1; lastDown[code] = -9; } else lastDown[code] = now;
    }
  };
  const onUp = (e) => { keys.delete(e.code); };
  const reset = () => { keys.clear(); latched.clear(); st.tapBarrel = 0; };
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', onDown);
    addEventListener('keyup', onUp);
    addEventListener('blur', reset);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    addEventListener('gamepadconnected', (e) => { input.pad.connected = true; input.pad.id = e.gamepad?.id || ''; });
    addEventListener('gamepaddisconnected', () => { input.pad.connected = !!readPad(); });
  }

  // ---------------- gamepad ----------------
  function readPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const list = navigator.getGamepads();
    for (let i = 0; i < list.length; i++) { const g = list[i]; if (g && g.connected) { input.pad.connected = true; input.pad.id = g.id; return g; } }
    input.pad.connected = false; return null;
  }
  // rumble on hits / tumbles of the player
  game.events?.on?.('racer:hit', ({ racer, severity = 0.5 }) => { if (racer && racer === game.player) rumble(120 + 380 * clamp(severity, 0, 1), 0.3 + 0.7 * severity, 0.5 + 0.5 * severity); });
  game.events?.on?.('racer:tumble', ({ racer, duration = 1 }) => { if (racer && racer === game.player) rumble(Math.min(900, 300 + duration * 300), 0.8, 0.6); });
  game.events?.on?.('racer:boost', ({ racer, kind }) => { if (racer && racer === game.player && (kind === 'ring' || kind === 'item' || kind === 'start')) rumble(140, 0.15, 0.4); });
  function rumble(ms, strong, weak) {
    const gp = readPad(); const a = gp?.vibrationActuator;
    if (!a || game.settings?.rumble === false) return;
    try { a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }); } catch { /* unsupported */ }
  }

  // ---------------- touch ----------------
  function wantTouch() { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; }
  function buildTouch() {
    if (touch.built || typeof document === 'undefined') return;
    touch.built = true;
    const root = document.createElement('div'); touch.root = root;
    root.id = 'sb-touch';
    root.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;display:none';
    const zone = document.createElement('div');
    zone.style.cssText = 'position:absolute;left:0;bottom:0;width:48%;height:62%;pointer-events:auto;touch-action:none';
    const base = document.createElement('div'), knob = document.createElement('div');
    base.style.cssText = 'position:absolute;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;border:3px solid rgba(255,255,255,.55);background:rgba(20,40,80,.28);display:none;pointer-events:none';
    knob.style.cssText = 'position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(255,255,255,.7);box-shadow:0 2px 10px rgba(0,0,0,.35)';
    base.appendChild(knob); root.appendChild(zone); root.appendChild(base);
    const R = 62, s = touch.stick;
    zone.addEventListener('pointerdown', (e) => {
      if (s.id >= 0) return; zone.setPointerCapture?.(e.pointerId); s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = 0; s.y = 0;
      base.style.display = 'block'; base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; knob.style.transform = 'translate(0,0)'; e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.id) return;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      s.x = dx / R; s.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; e.preventDefault();
    });
    const end = (e) => { if (e.pointerId !== s.id) return; s.id = -1; s.x = 0; s.y = 0; base.style.display = 'none'; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const btn = (label, css, hold, tap, color) => {
      const b = document.createElement('div'); b.textContent = label;
      b.style.cssText = `position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;font:900 italic 15px system-ui,sans-serif;letter-spacing:.04em;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);border-radius:50%;border:3px solid rgba(255,255,255,.7);background:${color};opacity:.82;${css}`;
      const on = (e) => { e.preventDefault(); b.style.opacity = '1'; b.style.transform = 'scale(.94)'; if (hold) touch.held[hold] = true; if (tap) tap(); };
      const off = (e) => { b.style.opacity = '.82'; b.style.transform = ''; if (hold) touch.held[hold] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      root.appendChild(b); return b;
    };
    const r = 'right:max(14px,env(safe-area-inset-right))', bt = 'bottom:max(14px,env(safe-area-inset-bottom))';
    btn('FIRE', `${r};${bt};width:92px;height:92px;font-size:18px`, 'fire', null, 'rgba(230,60,60,.7)');
    btn('BOOST', `right:max(116px,calc(env(safe-area-inset-right) + 116px));${bt};width:78px;height:78px`, 'boost', null, 'rgba(255,150,20,.75)');
    btn('ITEM', `${r};bottom:max(118px,calc(env(safe-area-inset-bottom) + 118px));width:72px;height:72px`, null, () => { st.touchItem = true; }, 'rgba(60,140,255,.75)');
    btn('BRAKE', `right:max(106px,calc(env(safe-area-inset-right) + 106px));bottom:max(104px,calc(env(safe-area-inset-bottom) + 104px));width:56px;height:56px;font-size:12px`, 'brake', null, 'rgba(90,90,110,.7)');
    btn('<', `left:max(14px,env(safe-area-inset-left));top:26%;width:52px;height:52px;font-size:20px`, null, () => { st.touchBarrel = -1; }, 'rgba(60,200,160,.7)');
    btn('>', `right:max(14px,env(safe-area-inset-right));top:26%;width:52px;height:52px;font-size:20px`, null, () => { st.touchBarrel = 1; }, 'rgba(60,200,160,.7)');
    btn('II', `right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));width:44px;height:44px;font-size:14px`, null, () => emit('input:pause'), 'rgba(20,30,60,.6)');
    btn('CAM', `right:max(66px,calc(env(safe-area-inset-right) + 66px));top:max(12px,env(safe-area-inset-top));width:44px;height:44px;font-size:11px`, null, () => emit('input:camera'), 'rgba(20,30,60,.6)');
    document.body.appendChild(root);
  }
  function showTouch(on) {
    touch.visible = on && st.touchOn;
    if (on && st.touchOn) buildTouch();
    if (touch.root) touch.root.style.display = touch.visible ? 'block' : 'none';
    if (!touch.visible) { touch.stick.id = -1; touch.stick.x = touch.stick.y = 0; for (const k in touch.held) touch.held[k] = false; }
  }
  function enableTouch() { if (st.touchOn) return; st.touchOn = true; input.touchActive = true; showTouch(game.state === 'race' || game.state === 'finish'); }
  if (typeof addEventListener === 'function') {
    addEventListener('touchstart', () => enableTouch(), { passive: true, once: true });
    if (wantTouch()) enableTouch();
  }
  game.events?.on?.('game:state', ({ to }) => showTouch(to === 'race'));
  // the pause menu (z-index below the overlay) must stay tappable: hide the touch controls while paused
  game.events?.on?.('game:pause', () => showTouch(false));
  game.events?.on?.('game:resume', () => showTouch(game.state === 'race'));

  return input;
}

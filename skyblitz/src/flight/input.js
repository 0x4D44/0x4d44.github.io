// STUB input (keyboard only). The flight agent REPLACES this (gamepad, touch, double-tap barrel, bindings, haptics).
// Contract: createInput(game) -> { sample(): Controls, enable(on), init() }. sample() is called once per FIXED sim step and
// returns edge-latched controls (barrel/item are true for exactly one sample after the press). Emits 'input:pause' on Esc/P.
import { createControls } from '../controls.js';

export function createInput(game) {
  const keys = new Set(), latched = new Set();
  const c = createControls();
  const down = (e) => {
    if (e.repeat) return;
    keys.add(e.code); latched.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') game.events.emit('input:pause', {});
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  addEventListener('keydown', down);
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const axis = (neg, pos) => (neg.some((k) => keys.has(k)) ? -1 : 0) + (pos.some((k) => keys.has(k)) ? 1 : 0);
  return {
    enabled: true, controls: c,
    init() {}, enable(on) { this.enabled = on; },
    sample() {
      const flipped = game.settings.pitchMode === 'flight';         // 'flight': W / Up pushes the nose DOWN
      const pull = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);  // +1 when S/Down held
      c.pitch = flipped ? pull : -pull;
      c.roll = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      c.yaw = 0;
      c.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      c.airbrake = keys.has('ControlLeft') || keys.has('KeyX') ? 1 : 0;
      c.fire = keys.has('Space');
      c.itemBack = keys.has('KeyB');
      c.lookBack = keys.has('KeyV');
      c.barrel = latched.has('KeyQ') ? -1 : latched.has('KeyE') ? 1 : 0;
      c.item = latched.has('KeyF') || latched.has('Enter');
      latched.clear();
      return c;
    },
  };
}

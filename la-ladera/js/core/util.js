// Small shared helpers.

// Yield to the event loop WITHOUT setTimeout: hidden/headless tabs clamp timers to ~1 s, which would turn a
// per-building yield into a minute of loading. MessageChannel tasks are not throttled.
// Under Node an open MessagePort keeps the process alive forever, so the port is ref'd only while a tick is pending
// (ref/unref do not exist in browsers; the optional calls are no-ops there).
const _mc = new MessageChannel();
const _q = [];
_mc.port1.onmessage = () => { const r = _q.shift(); if (r) r(); if (!_q.length) _mc.port1.unref?.(); };
_mc.port1.unref?.();
export function tick() { return new Promise((r) => { _q.push(r); _mc.port1.ref?.(); _mc.port2.postMessage(0); }); }

let _lastPaint = 0;
/** Yield so the loading screen can repaint: a task yield always, plus an animation frame when ~80 ms have passed. */
export async function yieldFrame() {
  await tick();
  const now = performance.now();
  if (now - _lastPaint > 80) {
    _lastPaint = now;
    await Promise.race([new Promise((r) => requestAnimationFrame(r)), new Promise((r) => setTimeout(r, 40))]);
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;
/** Shortest signed angle difference b - a in (-PI, PI]. */
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; }

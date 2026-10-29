// Auto-quality governor (E-05 / V-9). Pure logic: no DOM, no WebGL, so node:test drives it with synthetic traces. Owner: core.
//
// It watches the COST of a frame (CPU sim + render submit, or the GPU time when the browser can report it), never the vsync interval:
// a 60 Hz display shows ~16.7 ms between frames however light the game is, so the interval says nothing about headroom.
//   - Overloaded (median cost over the window above `downMs`): lower the resolution scale one step. Scale is the only knob during a race.
//   - At the scale floor and still overloaded: ask for a lower PRESET. The game applies it at the next race start (behind the loading
//     screen), never mid-race, and keeps the scale it had.
//   - Quiet (median under `upMs`, p90 under `p90Ms`) for `upQuiet` seconds: raise the scale one step, but only if the cost predicted at the
//     larger scale (cost grows with pixels) stays under the overload line with margin, so a steady load settles instead of oscillating.
//   - Dead band between `upMs` and `downMs`: nothing happens. After a step down that follows a step up the quiet time doubles (backoff).
// A median over a 3 s window shrugs off single hitches (GC, shader compile, a first frame after a switch).
export const PRESET_ORDER = ['low', 'med', 'high', 'ultra'];

export const GOV = Object.freeze({
  downMs: 12.5,          // median frame cost above this (75 % of a 60 fps frame) = overloaded
  upMs: 8,               // median under this ...
  p90Ms: 12,             // ... and p90 under this = quiet
  evalEvery: 0.5,        // s between evaluations
  window: 3,             // s of samples each evaluation looks at
  minSpan: 1.5,          // s of fresh samples needed before the first evaluation after a hold
  minSamples: 30,
  downAfter: 2.5,        // s of continuous overload before a step down
  upAfter: 8,            // s of continuous quiet before a step up (doubles after a reversal, up to maxUpQuiet)
  maxUpQuiet: 64,
  reversalWindow: 30,    // a step down this soon after a step up counts as a reversal
  calmReset: 180,        // s without any step down: the quiet time falls back to upAfter
  cooldown: 4,           // s between two scale changes
  settle: 1.2,           // s ignored after a change (render targets were reallocated)
  maxDt: 0.25,           // a longer frame is a hidden tab or a stall, not a cost
  stepDown: 0.1, stepUp: 0.1,
  minScale: 0.4,         // absolute floor of the auto scale
  minEffective: 0.6,     // floor of renderScale * autoScale: below it the picture is too soft to be worth the frames
  headroom: 0.9,         // a step up must predict a cost under downMs * headroom
  presetAfter: 6,        // s of overload at the scale floor before a lower preset is requested
  presetUpAfter: 60,     // s of quiet at scale 1 before a higher preset is requested
});

const r2 = (x) => Math.round(x * 100) / 100;

/** Turns raw per-frame timings into the cost of one "60 Hz frame" (one sim step + one render): independent of the display's refresh rate
 *  and of catch-up steps after a late frame (a 2-step frame is two steps' worth of work, not a double cost). */
export class CostMeter {
  constructor() { this.sim = 0; this.seeded = false; }
  /** simMs: time spent in `steps` fixed steps this frame; renderMs: time to submit the frame; gpuMs: GPU time if known (0 = unknown). */
  push(simMs, steps, renderMs, gpuMs = 0) {
    if (steps > 0) { const per = simMs / steps; this.sim = this.seeded ? this.sim + (per - this.sim) * 0.1 : per; this.seeded = true; }
    const cpu = renderMs + this.sim;
    return gpuMs > cpu ? gpuMs : cpu;
  }
}

export function lowerPreset(id) { const i = PRESET_ORDER.indexOf(id); return i > 0 ? PRESET_ORDER[i - 1] : null; }
export function higherPreset(id, cap) { const i = PRESET_ORDER.indexOf(id), j = PRESET_ORDER.indexOf(cap); return i >= 0 && i < PRESET_ORDER.length - 1 && (j < 0 || i < j) ? PRESET_ORDER[i + 1] : null; }

/** opts: { scale, preset, basePreset, renderScale } + any GOV override. frame() returns null or { type:'scale', scale } | { type:'preset', preset }. */
export function createGovernor(opts = {}) {
  const c = { ...GOV, ...opts };
  const CAP = 512;
  const costs = new Float32Array(CAP), times = new Float32Array(CAP), scratch = new Float32Array(CAP);
  const s = {
    scale: opts.scale ?? 1, preset: opts.preset ?? 'high', basePreset: opts.basePreset ?? opts.preset ?? 'high', renderScale: opts.renderScale ?? 1,
    pending: null, t: 0, holdUntil: 0, nextEval: 0, head: 0, n: 0,
    overT: 0, quietT: 0, floorT: 0, lastChange: -1e9, lastUp: -1e9, lastDown: -1e9, climbedAt: -1e9, upQuiet: c.upAfter, upLocked: false,
    median: 0, p90: 0, changes: 0,
  };

  function hold(sec) { s.holdUntil = s.t + sec; s.nextEval = s.holdUntil + c.minSpan; s.n = 0; s.head = 0; s.overT = s.quietT = s.floorT = 0; }
  function floor() { return Math.max(c.minScale, Math.ceil(c.minEffective / s.renderScale * 100 - 1e-9) / 100); }   // a value r2() can hold, so the floor is reached exactly

  function evaluate() {
    const lo = s.t - c.window;
    let m = 0;
    for (let i = 0; i < s.n; i++) if (times[i] >= lo) scratch[m++] = costs[i];
    if (m < c.minSamples) return null;
    const a = scratch.subarray(0, m); a.sort();
    const med = a[m >> 1], p90 = a[Math.min(m - 1, Math.floor(m * 0.9))];
    s.median = med; s.p90 = p90;
    const over = med > c.downMs, quiet = !over && med < c.upMs && p90 < c.p90Ms;
    if (over) { s.overT += c.evalEvery; s.quietT = 0; } else if (quiet) { s.quietT += c.evalEvery; s.overT = 0; s.floorT = 0; } else { s.overT = s.quietT = s.floorT = 0; }
    if (s.t - s.lastDown > c.calmReset) s.upQuiet = c.upAfter;
    const cooled = s.t - s.lastChange >= c.cooldown;

    if (over && s.overT >= c.downAfter && cooled) {
      const fl = floor();
      const steps = med > c.downMs * 1.8 ? 2 : 1;     // a bad overload (over 22 ms) takes two steps at once; a mild one or a burst, one
      const next = r2(Math.max(fl, s.scale - steps * c.stepDown));
      if (next < s.scale - 1e-6) {
        if (s.t - s.lastUp < c.reversalWindow) s.upQuiet = Math.min(s.upQuiet * 2, c.maxUpQuiet);
        s.scale = next; s.lastChange = s.lastDown = s.t; s.changes++;
        hold(c.settle);
        return { type: 'scale', scale: next };
      }
      s.floorT += c.evalEvery;
      const lower = lowerPreset(s.preset);
      if (s.floorT >= c.presetAfter && lower && !s.pending) {
        if (s.t - s.climbedAt < 600) s.upLocked = true;     // we climbed a preset and had to come back down: stop trying
        s.pending = lower; s.lastChange = s.lastDown = s.t; s.changes++;
        hold(c.settle);
        return { type: 'preset', preset: lower };
      }
      return null;
    }

    if (quiet && s.quietT >= s.upQuiet && cooled) {
      if (s.scale < 1 - 1e-6) {
        const next = r2(Math.min(1, s.scale + c.stepUp));
        if (med * (next / s.scale) ** 2 > c.downMs * c.headroom) { s.quietT = 0; return null; }   // would tip back into overload
        s.scale = next; s.lastChange = s.lastUp = s.t; s.changes++; s.quietT = 0;
        hold(c.settle);
        return { type: 'scale', scale: next };
      }
      if (s.quietT >= c.presetUpAfter && !s.upLocked && !s.pending) {
        const higher = higherPreset(s.preset, s.basePreset);
        if (higher) { s.pending = higher; s.lastChange = s.lastUp = s.climbedAt = s.t; s.changes++; s.quietT = 0; hold(c.settle); return { type: 'preset', preset: higher }; }
      }
    }
    return null;
  }

  return {
    state: s, config: c,
    /** One rendered frame: cost in ms (see CostMeter), dt in s (frame interval). */
    frame(cost, dt) {
      if (!(dt > 0) || !(cost >= 0)) return null;
      if (dt > c.maxDt) { hold(c.settle + 1); return null; }
      s.t += dt;
      if (s.t < s.holdUntil) return null;
      costs[s.head] = cost; times[s.head] = s.t; s.head = (s.head + 1) % CAP; if (s.n < CAP) s.n++;
      if (s.t < s.nextEval) return null;
      s.nextEval = s.t + c.evalEvery;
      return evaluate();
    },
    /** Ignore samples for `sec` seconds and start a fresh window (race start, resize, tab wake, quality switch). */
    hold,
    /** The game applied a preset (the pending request, or the player picked one): follow it. `scale` omitted = keep the current one. */
    applied(preset, renderScale, scale) {
      s.preset = preset; s.renderScale = renderScale; s.pending = null;
      if (scale !== undefined) s.scale = scale;
      if (!s.basePreset || PRESET_ORDER.indexOf(preset) > PRESET_ORDER.indexOf(s.basePreset)) s.basePreset = preset;
      hold(c.settle + 1);
    },
    /** A player's explicit pick (Settings): new base, full scale, fresh start. */
    reset(preset, renderScale) {
      s.preset = s.basePreset = preset; s.renderScale = renderScale; s.scale = 1; s.pending = null; s.upLocked = false; s.upQuiet = c.upAfter;
      s.lastChange = s.lastUp = s.lastDown = -1e9;
      hold(c.settle + 1);
    },
    snapshot() { return { scale: s.scale, preset: s.preset, pending: s.pending, basePreset: s.basePreset, median: +s.median.toFixed(2), p90: +s.p90.toFixed(2), changes: s.changes, upQuiet: s.upQuiet, t: +s.t.toFixed(1) }; },
  };
}

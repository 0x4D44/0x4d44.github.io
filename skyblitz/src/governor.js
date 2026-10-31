// Auto-quality governor (E-05 / V-9). Pure logic: no DOM, no WebGL, so node:test drives it with synthetic traces. Owner: core.
//
// It watches the COST of a frame (CPU sim + render submit, or the GPU time when the browser can report it), never the vsync interval:
// a 60 Hz display shows ~16.7 ms between frames however light the game is, so the interval says nothing about headroom.
//   - Overloaded (median cost over the window above `downMs`): lower the resolution scale one step. Scale is the only knob during a race.
//   - At the scale floor and still overloaded: ask for a lower PRESET. The game applies it at the next race start (behind the loading
//     screen), never mid-race, and keeps the scale it had.
//   - Quiet (median under `upMs`, p90 under `p90Ms`) for `upQuiet` seconds: raise the scale one step.
//   - Dead band between `upMs` and `downMs`: nothing happens. After a step down that follows a step up the quiet time doubles (backoff).
//     The band is what stops a steady load from oscillating: a quiet median (< upMs) grows by at most ((floor + step) / floor)^2 when the scale goes
//     up one step (cost follows pixels), and upMs * that factor stays under downMs for every preset's floor (tested), so a step up can never
//     land in the overload on its own. (An explicit headroom check used to repeat this and was unreachable: R2-E-16.)
// A median over a 3 s window shrugs off single hitches (GC, shader compile, a first frame after a switch).
//
// Two cases the cost alone cannot see (R2-E-01), both handled here:
//   - A machine below ~10 fps: 3 s holds fewer than 30 frames and every frame over `maxDt` looked like a stall, so nothing was ever evaluated. Now the
//     window stretches back to `minSamples` frames, and when the last frames were ALL slow (median over `slowDt`) a long frame is the machine's cost, not
//     a stall. A lone long frame among normal ones (hidden tab, GC, a compile) is still ignored, as is any frame over `maxSlowDt`.
//   - No GPU timer (Safari, Firefox by default): the cost is the CPU's alone, so a GPU-bound frame looks cheap. `frame(cost, dt, gpuKnown = false)`
//     then also judges the frame INTERVAL: a median above `slowIntervalMs` (a 60 Hz display shows 16.7 ms) is overload however small the CPU cost.
//     With the timer the interval is never a cost (a vsync-capped display always shows the same interval).
export const PRESET_ORDER = ['low', 'med', 'high', 'ultra'];

export const GOV = Object.freeze({
  downMs: 12.5,          // median frame cost above this (75 % of a 60 fps frame) = overloaded
  upMs: 8,               // median under this ...
  p90Ms: 12,             // ... and p90 under this = quiet
  evalEvery: 0.5,        // s between evaluations
  window: 3,             // s of samples each evaluation looks at ...
  maxWindow: 20,         // ... stretched back to `minSamples` frames when 3 s holds fewer (below ~3 fps), but never further than this
  minSpan: 1.5,          // s of fresh samples needed before the first evaluation after a hold
  minSamples: 8,         // frames an evaluation needs (it was 30 = 10 fps in 3 s: below that the governor never looked at all)
  downAfter: 2.5,        // s of continuous overload before a step down
  upAfter: 8,            // s of continuous quiet before a step up (doubles after a reversal, up to maxUpQuiet)
  maxUpQuiet: 64,
  reversalWindow: 30,    // a step down this soon after a step up counts as a reversal
  calmReset: 180,        // s without any step down: the quiet time falls back to upAfter
  cooldown: 4,           // s between two scale changes
  settle: 1.2,           // s ignored after a change (render targets were reallocated)
  maxDt: 0.25,           // a lone frame longer than this is a hidden tab or a stall, not a cost ...
  slowDt: 0.1,           // ... unless the median of the last RECENT (8) frames is over this: then the machine is slow and its long frames are the cost ...
  maxSlowDt: 2,          // ... up to this: a frame longer than this is always a stall (sleep, a debugger, a frozen page)
  slowIntervalMs: 22,    // no GPU timer: a median frame interval above this is overload (a 60 Hz display shows 16.7 ms)
  fastIntervalMs: 19,    // no GPU timer: a step up needs the median interval under this
  stepDown: 0.1, stepUp: 0.1,
  minScale: 0.4,         // absolute floor of the auto scale
  minEffective: 0.6,     // floor of renderScale * autoScale: below it the picture is too soft to be worth the frames
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
  const CAP = 512, RECENT = 8;
  const costs = new Float32Array(CAP), times = new Float32Array(CAP), dts = new Float32Array(CAP), scratch = new Float32Array(CAP), dscratch = new Float32Array(CAP);
  const recent = new Float32Array(RECENT), rsort = new Float32Array(RECENT);       // the last RECENT frame intervals (s): a slow machine or a lone stall?
  const s = {
    scale: opts.scale ?? 1, preset: opts.preset ?? 'high', basePreset: opts.basePreset ?? opts.preset ?? 'high', renderScale: opts.renderScale ?? 1,
    pending: null, t: 0, holdUntil: 0, nextEval: 0, lastEval: 0, head: 0, n: 0, recentHead: 0, recentN: 0, gpuKnown: true,
    overT: 0, quietT: 0, floorT: 0, lastChange: -1e9, lastUp: -1e9, lastDown: -1e9, climbedAt: -1e9, upQuiet: c.upAfter, upLocked: false,
    median: 0, p90: 0, medDt: 0, changes: 0,
  };

  function hold(sec) { s.holdUntil = s.t + sec; s.nextEval = s.holdUntil + c.minSpan; s.lastEval = s.nextEval - c.evalEvery; s.n = 0; s.head = 0; s.overT = s.quietT = s.floorT = 0; }
  function floor() { return Math.max(c.minScale, Math.ceil(c.minEffective / s.renderScale * 100 - 1e-9) / 100); }   // a value r2() can hold, so the floor is reached exactly
  /** Is the machine slow on every frame (as opposed to one long stall among normal frames)? Needs a full ring of recent intervals. */
  function machineIsSlow() {
    if (s.recentN < RECENT) return false;
    rsort.set(recent); rsort.sort();
    return rsort[RECENT >> 1] > c.slowDt;
  }

  function evaluate() {
    let lo = s.t - c.window;
    if (s.n >= c.minSamples) {                         // slow frames: 3 s holds too few, so look back as far as it takes to have minSamples (R2-E-01)
      const kth = times[(s.head - c.minSamples + CAP) % CAP];
      if (kth < lo) lo = Math.max(kth, s.t - c.maxWindow);
    }
    let m = 0;
    for (let i = 0; i < s.n; i++) if (times[i] >= lo) { scratch[m] = costs[i]; dscratch[m++] = dts[i]; }
    if (m < c.minSamples) return null;
    const a = scratch.subarray(0, m); a.sort();
    const d = dscratch.subarray(0, m); d.sort();
    const med = a[m >> 1], p90 = a[Math.min(m - 1, Math.floor(m * 0.9))], medDt = d[m >> 1] * 1000;
    s.median = med; s.p90 = p90; s.medDt = medDt;
    // No GPU timer: the cost is the CPU's alone and a GPU-bound frame looks cheap, so the interval itself is judged (against 22 ms, not the 12.5 ms
    // cost line: a 60 Hz display shows 16.7 ms however light the game is). With the timer the interval says nothing and is not used.
    const intervalOver = !s.gpuKnown && medDt > c.slowIntervalMs;
    const over = med > c.downMs || intervalOver;
    const quiet = !over && med < c.upMs && p90 < c.p90Ms && (s.gpuKnown || medDt < c.fastIntervalMs);
    const since = s.t - s.lastEval; s.lastEval = s.t;
    const step = since > c.evalEvery * 1.5 ? since : c.evalEvery;      // frames slower than the evaluation period: one evaluation stands for the time that passed
    if (over) { s.overT += step; s.quietT = 0; } else if (quiet) { s.quietT += step; s.overT = 0; s.floorT = 0; } else { s.overT = s.quietT = s.floorT = 0; }
    if (s.t - s.lastDown > c.calmReset) s.upQuiet = c.upAfter;
    const cooled = s.t - s.lastChange >= c.cooldown;

    if (over && s.overT >= c.downAfter && cooled) {
      const fl = floor();
      const load = Math.max(med / c.downMs, intervalOver ? medDt / c.slowIntervalMs : 0);
      const steps = load > 1.8 ? 2 : 1;               // a bad overload (over 22 ms of cost, or 40 ms between frames) takes two steps at once; a mild one or a burst, one
      const next = r2(Math.max(fl, s.scale - steps * c.stepDown));
      if (next < s.scale - 1e-6) {
        if (s.t - s.lastUp < c.reversalWindow) s.upQuiet = Math.min(s.upQuiet * 2, c.maxUpQuiet);
        s.scale = next; s.lastChange = s.lastDown = s.t; s.changes++;
        hold(c.settle);
        return { type: 'scale', scale: next };
      }
      s.floorT += step;
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
    /** One rendered frame: cost in ms (see CostMeter), dt in s (frame interval). gpuKnown: the cost includes the GPU's time (a GPU timer exists);
     *  without it (false) a frame interval well above the display's own also counts as overload. */
    frame(cost, dt, gpuKnown = true) {
      if (!(dt > 0) || !(cost >= 0)) return null;
      s.gpuKnown = !!gpuKnown;
      recent[s.recentHead] = dt; s.recentHead = (s.recentHead + 1) % RECENT; if (s.recentN < RECENT) s.recentN++;
      // A lone long frame (a hidden tab, GC, a compile, a debugger pause) is not a cost. On a machine that is slow on EVERY frame the long frames are the
      // cost, up to maxSlowDt (R2-E-01: at 5 fps every frame was over maxDt, so every one of them reset the window and the governor never acted).
      if (dt > c.maxDt && !(dt <= c.maxSlowDt && machineIsSlow())) { hold(c.settle + 1); return null; }
      s.t += dt;
      if (s.t < s.holdUntil) return null;
      costs[s.head] = cost; dts[s.head] = dt; times[s.head] = s.t; s.head = (s.head + 1) % CAP; if (s.n < CAP) s.n++;
      if (s.t < s.nextEval) return null;
      s.nextEval = s.t + c.evalEvery;
      return evaluate();
    },
    /** Ignore samples for `sec` seconds and start a fresh window (race start, resize, tab wake, quality switch). */
    hold,
    /** The tab was hidden or shown: whatever the last frames looked like says nothing about the next ones, so the first long frame after it is a stall. */
    wake() { s.recentN = 0; s.recentHead = 0; hold(c.settle + 1); },
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
    snapshot() { return { scale: s.scale, preset: s.preset, pending: s.pending, basePreset: s.basePreset, median: +s.median.toFixed(2), p90: +s.p90.toFixed(2), medDt: +s.medDt.toFixed(1), gpuKnown: s.gpuKnown, slow: machineIsSlow(), changes: s.changes, upQuiet: s.upQuiet, t: +s.t.toFixed(1) }; },
  };
}

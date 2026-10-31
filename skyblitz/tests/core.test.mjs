// Game-shell tests (round 1, core): the auto-quality governor, settings defaults, the debug gate, the boot watchdog, context loss, shader warm-up.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/core.test.mjs
// The first half is pure logic (synthetic traces, no browser). The second half drives the real game in headless Chrome (tests/tools/chrome.mjs:
// hidden, below-normal priority) against its own static server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, CostMeter, GOV, PRESET_ORDER, lowerPreset, higherPreset } from '../src/governor.js';
import { GpuTimer } from '../src/gpu-timer.js';
import { defaultSettings, resolveSettings, settingsToStore, resolveQualityId, REDUCED_MOTION_DEFAULTS, MOTION_KEYS, QUALITY } from '../src/config.js';
import { DEBUG_PARAMS, MAX_ERRORS, debugEnabled } from '../src/debug.js';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

const DT = 1 / 60;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Drive a governor with a synthetic cost trace. costFn(t, scale) -> ms. Returns the actions with their times. */
function drive(secs, costFn, opts = {}) {
  const g = createGovernor({ preset: 'high', renderScale: 1, ...opts });
  g.hold(opts.holdFirst ?? 4);                       // what startRace does
  const acts = [];
  for (let i = 0, n = Math.round(secs * 60); i < n; i++) {
    const t = i * DT, a = g.frame(costFn(t, g.state.scale), DT);
    if (a) acts.push({ t: +t.toFixed(1), ...a });
  }
  return { g, acts, scales: acts.filter((a) => a.type === 'scale'), presets: acts.filter((a) => a.type === 'preset') };
}
const wobble = (t) => Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1;      // deterministic 0..1 noise

// ---------------------------------------------------------------------------------------------------------------- governor (E-05 / V-9)

test('governor: a 60 Hz display with 3-6 ms of work never drops quality, however long it runs', () => {
  const { acts, g } = drive(300, (t) => 3 + 3 * wobble(t));
  assert.deepEqual(acts, [], 'no action at all');
  assert.equal(g.state.scale, 1);
});

test('governor: the dead band between "quiet" and "overloaded" changes nothing (hysteresis)', () => {
  assert.deepEqual(drive(300, () => 10).acts, []);
  assert.deepEqual(drive(300, () => 12.4).acts, []);
});

test('governor: a slow burst drops one step, never the preset, and the scale comes back after the quiet period', () => {
  const { acts, scales, presets, g } = drive(120, (t) => (t > 20 && t < 26 ? 16 : 5));      // 6 s of 16 ms work in a quiet run
  assert.equal(presets.length, 0, 'no preset change');
  assert.ok(scales.length >= 1 && scales[0].scale === 0.9, `first action is one step down: ${JSON.stringify(acts)}`);
  assert.ok(scales.filter((a) => a.scale < 1).length <= 2, `at most two steps down: ${JSON.stringify(acts)}`);
  assert.equal(g.state.scale, 1, 'back to full resolution');
  const back = scales.at(-1);
  assert.ok(back.t > 26 && back.t < 26 + 3 * (GOV.upAfter + 4), `recovered ${back.t - 26} s after the burst`);
});

test('governor: the reviewers\' forced 30 ms trace takes a few monotone steps, not 12 resolution changes, and asks for the preset change only at the scale floor', () => {
  const { scales, presets, acts, g } = drive(18, () => 30);
  assert.ok(scales.length <= 3, `at most 3 resolution changes in 18 s (was 12): ${JSON.stringify(acts)}`);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i].scale < scales[i - 1].scale, 'scale only goes down while overloaded');
  assert.equal(g.state.scale, 0.6, 'ends at the floor');
  const long = drive(60, () => 30);
  assert.equal(long.presets.length, 1, 'one preset request');
  assert.equal(long.presets[0].preset, 'med');
  assert.equal(long.g.state.pending, 'med');
  assert.equal(long.g.state.preset, 'high', 'the running preset is untouched until the game applies the request between races');
  assert.ok(long.presets[0].t > long.scales.at(-1).t + GOV.presetAfter - 1, 'only after the floor was held for presetAfter seconds');
});

test('governor: a GPU-bound load (cost ~ pixels) settles on one scale instead of oscillating', () => {
  const { acts, g } = drive(600, (t, s) => 14 * s * s);       // 14 ms at full scale; over the line, 11.3 ms at 0.9
  assert.ok(acts.length <= 2, `settles quickly: ${JSON.stringify(acts)}`);
  assert.equal(g.state.scale, 0.9);
  const ups = acts.filter((a, i) => i > 0 && a.scale > acts[i - 1].scale);
  assert.deepEqual(ups, [], 'never steps back up into the overload');
});

test('governor: after a long heavy stretch the scale climbs back step by step once the load is gone', () => {
  const { scales, g } = drive(200, (t, s) => (t < 30 ? 22 * s * s : 4));
  assert.equal(g.state.scale, 1);
  const down = scales.filter((a) => a.t < 31), up = scales.filter((a) => a.t >= 31);
  assert.ok(down.length >= 2 && up.length >= 2, JSON.stringify(scales));
  for (let i = 1; i < up.length; i++) assert.ok(up[i].t - up[i - 1].t >= GOV.upAfter - 1, 'a quiet period between steps up');
});

test('governor: stepping up right after a step down doubles the quiet time (backoff)', () => {
  // the load flips between 6 ms and 15 ms every 30 s: each recovery step is followed by an overload
  const { g, scales } = drive(400, (t) => (Math.floor(t / 30) % 2 === 0 ? 6 : 15));
  assert.ok(g.state.upQuiet > GOV.upAfter, `quiet time grew to ${g.state.upQuiet}`);
  assert.ok(scales.length <= 20, `${scales.length} resolution changes in 400 s of a 30 s on / 30 s off load`);
});

test('governor: single hitches (GC, shader compile, a first frame after a switch) do not count', () => {
  const { acts } = drive(120, (t) => (Math.round(t * 60) % 90 === 0 ? 120 : 5));      // one 120 ms frame every 1.5 s
  assert.deepEqual(acts, []);
});

test('governor: a hidden tab / stall frame is not a cost, and resets the window', () => {
  const g = createGovernor({});
  g.hold(0);
  let acts = 0;
  for (let i = 0; i < 600; i++) { if (g.frame(5, DT)) acts++; }
  assert.ok(g.state.n > 100, 'a window of samples exists');
  assert.equal(g.frame(500, 3), null, 'a 3 s frame is ignored');
  assert.equal(acts, 0);
  assert.ok(g.state.t < 11, 'its length did not advance governor time');
  assert.equal(g.state.n, 0, 'the window restarted');
});

test('governor: a lower preset is only requested for a base that has one, and a climb that fails locks further climbs', () => {
  const low = drive(80, () => 30, { preset: 'low', renderScale: 0.7 });
  assert.equal(low.presets.length, 0, 'nothing below low');
  assert.equal(low.g.state.scale, 0.86, 'floor is 0.6 / 0.7 of the effective scale');
  // med -> quiet for a long time -> asks for high -> overloaded again -> asks for med again and locks the climb
  const g = createGovernor({ preset: 'med', basePreset: 'high', renderScale: 0.85, scale: 1 });
  g.hold(0);
  const acts = [];
  let cost = 4;
  for (let i = 0; i < 60 * 400; i++) {
    const a = g.frame(cost, DT);
    if (a) { acts.push(a); if (a.type === 'preset') { g.applied(a.preset, QUALITY[a.preset].renderScale); cost = a.preset === 'high' ? 30 : 4; } }
  }
  const p = acts.filter((a) => a.type === 'preset').map((a) => a.preset);
  assert.deepEqual(p.slice(0, 2), ['high', 'med'], JSON.stringify(acts));
  assert.equal(g.state.upLocked, true);
  assert.equal(p.filter((x) => x === 'high').length, 1, 'does not climb again');
});

test('governor: reset() restarts from the player\'s pick; applied() keeps the scale', () => {
  const { g } = drive(30, () => 30);
  const kept = g.state.scale;
  assert.ok(kept < 1);
  g.applied('med', 0.85);
  assert.equal(g.state.scale, kept, 'a preset step keeps the auto scale');
  assert.equal(g.state.pending, null);
  g.reset('high', 1);
  assert.equal(g.state.scale, 1);
  assert.equal(g.state.upLocked, false);
});

/** Like drive(), with the frame interval (a number, or a function of time) and the GPU-timer flag under test control (R2-E-01). */
function driveAt(secs, dtOf, costFn, { gpuKnown = true, ...opts } = {}) {
  const g = createGovernor({ preset: 'high', renderScale: 1, ...opts });
  g.hold(4);
  const acts = [];
  for (let t = 0; t < secs;) {
    const dt = typeof dtOf === 'function' ? dtOf(t) : dtOf;
    t += dt;
    const a = g.frame(costFn(t, g.state.scale), dt, gpuKnown);
    if (a) acts.push({ t: +t.toFixed(1), ...a });
  }
  return { g, acts, scales: acts.filter((a) => a.type === 'scale'), presets: acts.filter((a) => a.type === 'preset') };
}

test('governor R2-E-01: below 10 fps it still acts (5 fps, 600 ms of GPU work a frame: down to the floor, then a lower preset)', () => {
  const r = driveAt(120, 0.2, () => 600);
  assert.ok(r.scales.length >= 1 && r.scales[0].t < 20, `a first step down within 20 s: ${JSON.stringify(r.acts)}`);
  assert.equal(r.g.state.scale, 0.6, 'ends at the floor');
  assert.equal(r.presets.length, 1, 'and asks for one lower preset');
  assert.equal(r.presets[0].preset, 'med');
});

test('governor R2-E-01: a slow machine whose frames straddle the 250 ms stall limit still acts (a third of the frames are "long")', () => {
  const r = driveAt(120, (t) => 0.12 + 0.2 * wobble(t), () => 600);       // 120-320 ms
  assert.ok(r.scales.length >= 1 && r.g.state.scale < 1, JSON.stringify(r.acts));
});

test('governor R2-E-01: at 2 fps the window stretches back to minSamples frames instead of waiting for 30 frames in 3 s', () => {
  const r = driveAt(240, 0.5, () => 1500);
  assert.ok(r.scales.length >= 1 && r.scales[0].t < 30, `a first step down within 30 s: ${JSON.stringify(r.acts)}`);
});

test('governor R2-E-01: a long frame is a stall in a normal run and a cost on a slow machine; after wake() it is a stall again', () => {
  const g = createGovernor({}); g.hold(0);
  for (let i = 0; i < 100; i++) g.frame(5, 1 / 60);
  const t0 = g.state.t;
  g.frame(900, 1.5);
  assert.equal(g.state.t, t0, 'a lone 1.5 s frame among 60 Hz frames is a stall: governor time does not advance');
  const slow = createGovernor({}); slow.hold(0);
  for (let i = 0; i < 100; i++) slow.frame(600, 0.2);
  const t1 = slow.state.t;
  slow.frame(1500, 1.5);
  assert.ok(Math.abs(slow.state.t - (t1 + 1.5)) < 1e-3, `on a machine that is slow on every frame a 1.5 s frame is its cost: governor time advanced ${t1} -> ${slow.state.t}`);
  slow.wake();
  const t2 = slow.state.t;
  slow.frame(1500, 1.5);
  assert.equal(slow.state.t, t2, 'right after wake() (the tab was hidden) the same frame is a stall');
  const gone = createGovernor({}); gone.hold(0);
  for (let i = 0; i < 100; i++) gone.frame(600, 0.2);
  const t3 = gone.state.t;
  gone.frame(5000, 3);
  assert.equal(gone.state.t, t3, 'a frame over maxSlowDt (a sleep, a debugger) is a stall even on a slow machine');
});

test('governor R2-E-01: without a GPU timer the frame interval counts (40 ms between frames over 4 ms of CPU steps down); at 60 Hz, at 50 Hz, or with the timer it does not', () => {
  const slow = driveAt(90, 0.04, () => 4, { gpuKnown: false });
  assert.ok(slow.scales.length >= 1 && slow.scales[0].t < 20 && slow.g.state.scale <= 0.8, `steps down early, two at once: ${JSON.stringify(slow.acts)}`);
  assert.deepEqual(driveAt(300, 1 / 60, () => 4, { gpuKnown: false }).acts, [], '60 Hz, no timer: nothing');
  assert.deepEqual(driveAt(300, 0.02, () => 4, { gpuKnown: false }).acts, [], '50 Hz, no timer: nothing');
  assert.deepEqual(driveAt(300, 0.04, () => 4, { gpuKnown: true }).acts, [], 'a timer that says the GPU is idle: the interval is not a cost (a display capped at 25 fps)');
});

test('governor R2-E-01: no GPU timer: the scale comes back once the interval is under 19 ms, and not while it sits in the 19-22 ms dead band', () => {
  const back = driveAt(240, (t) => (t < 40 ? 0.04 : 1 / 60), () => 4, { gpuKnown: false });
  assert.ok(back.scales.some((a) => a.scale < 1) && back.g.state.scale === 1, `down, then back to full: ${JSON.stringify(back.acts)}`);
  const stay = driveAt(240, (t) => (t < 40 ? 0.04 : 0.021), () => 4, { gpuKnown: false });
  const low = stay.g.state.scale;
  assert.ok(low < 1, 'it did step down');
  assert.deepEqual(stay.scales.filter((a) => a.t > 45 && a.scale > low), [], 'no step up at a 21 ms interval');
});

test('governor R2-E-16: one step up from a quiet median can never reach the overload line, whatever the preset floor (no headroom check needed)', () => {
  for (const id of PRESET_ORDER) {
    const floor = drive(60, () => 30, { preset: id, renderScale: QUALITY[id].renderScale }).g.state.scale;       // where an overloaded run ends up
    const worst = GOV.upMs * ((floor + GOV.stepUp) / floor) ** 2;                                                   // cost follows pixels
    assert.ok(worst < GOV.downMs, `${id}: floor ${floor}, a quiet ${GOV.upMs} ms median can only reach ${worst.toFixed(2)} ms after one step up (line ${GOV.downMs})`);
  }
});

/** A WebGL2 stand-in with just the timer-query calls. `next.ms` is the GPU time the next query will report; `disjoint` makes the driver void it. */
function fakeGl({ ext = true } = {}) {
  const next = { ms: 2, disjoint: false };
  const gl = {
    next, QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: (n) => (ext && n === 'EXT_disjoint_timer_query_webgl2' ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null),
    createQuery: () => ({}), beginQuery() {}, endQuery() {}, deleteQuery() {},
    getQueryParameter: (q, p) => (p === 1 ? true : next.ms * 1e6), getParameter: () => next.disjoint,      // a result is whatever `next` says when it is polled
  };
  return gl;
}
const timerFrame = (t) => { t.begin(); t.end(); t.begin(); t.end(); };      // begin() polls the queries that are still pending

test('gpu timer: live only once a real reading has arrived; a very slow GPU frame (3.5 s) is read, a garbage one (0, 6 s, a disjoint query) is not', () => {
  const none = new GpuTimer(fakeGl({ ext: false }));
  timerFrame(none);
  assert.deepEqual([none.supported, none.live, none.ms], [false, false, 0], 'no extension: no timer');
  const gl = fakeGl(), t = new GpuTimer(gl);
  assert.deepEqual([t.supported, t.live], [true, false], 'the extension exists but nothing has been read yet');
  gl.next.ms = 2.5; timerFrame(t);
  assert.deepEqual([t.live, t.ms], [true, 2.5]);
  gl.next.ms = 3500; timerFrame(t);
  assert.equal(t.ms, 3500, 'a software renderer at under 1 fps: its real frame time is kept (the old 1 s cut-off dropped it)');
  for (const bad of [0, 6000]) { gl.next.ms = bad; timerFrame(t); assert.equal(t.ms, 3500, `${bad} ms is dropped`); }
  gl.next.ms = 9; gl.next.disjoint = true; timerFrame(t);
  assert.equal(t.ms, 3500, 'a disjoint query is dropped');
  const idle = new GpuTimer(fakeGl()); idle.dead = true;
  assert.deepEqual([idle.supported, idle.live], [false, false], 'a timer that threw is dead');
});

test('cost meter: a 144 Hz display and catch-up frames cost the same as 60 Hz (one sim step + one render)', () => {
  const m60 = new CostMeter(), m144 = new CostMeter(), mLate = new CostMeter();
  let c60, c144, cl;
  for (let i = 0; i < 100; i++) {
    c60 = m60.push(1.0, 1, 4);
    c144 = m144.push(i % 2 ? 0 : 1.0, i % 2 ? 0 : 1, 4);           // 144 Hz: a sim step only on some frames
    cl = mLate.push(i % 5 === 0 ? 2.0 : 1.0, i % 5 === 0 ? 2 : 1, 4);   // a late frame runs two steps in one go
  }
  assert.ok(Math.abs(c60 - 5) < 0.01 && Math.abs(c144 - 5) < 0.01 && Math.abs(cl - 5) < 0.01, `${c60} ${c144} ${cl}`);
  assert.equal(new CostMeter().push(1, 1, 4, 9), 9, 'the GPU time wins when it is the larger');
});

test('governor presets: ladder helpers', () => {
  assert.deepEqual(PRESET_ORDER, ['low', 'med', 'high', 'ultra']);
  assert.equal(lowerPreset('low'), null);
  assert.equal(lowerPreset('high'), 'med');
  assert.equal(higherPreset('med', 'high'), 'high');
  assert.equal(higherPreset('high', 'high'), null);
});

// ---------------------------------------------------------------------------------------------------------------- settings (V-8, E-28)

test('settings: untouched motion defaults follow prefers-reduced-motion', () => {
  const plain = resolveSettings(null, false), reduced = resolveSettings(null, true);
  assert.equal(plain.reduceFlash, false); assert.equal(plain.shake, 1);
  assert.equal(reduced.reduceFlash, true); assert.equal(reduced.shake, REDUCED_MOTION_DEFAULTS.shake);
  assert.ok(reduced.shake < 0.5);
  assert.deepEqual(reduced, { ...defaultSettings(true) }, 'resolveSettings(null) is the defaults');
});

test('settings: a stored choice beats the OS preference, in both directions', () => {
  const opt = settingsToStore({ ...defaultSettings(true), reduceFlash: false, shake: 1 }, true);       // opted out while the OS asks for reduced motion
  assert.equal(opt.reduceFlash, false); assert.equal(opt.shake, 1);
  const back = resolveSettings(JSON.parse(JSON.stringify(opt)), true);
  assert.equal(back.reduceFlash, false, 'the opt-out survives a reload'); assert.equal(back.shake, 1);
  const on = settingsToStore({ ...defaultSettings(false), reduceFlash: true, shake: 0.2 }, false);      // opted in without the OS preference
  const back2 = resolveSettings(JSON.parse(JSON.stringify(on)), false);
  assert.equal(back2.reduceFlash, true); assert.equal(back2.shake, 0.2);
});

test('settings: a key left at its default is not written, so it keeps following the OS', () => {
  const stored = settingsToStore({ ...defaultSettings(false), musicVolume: 0.3 }, false);
  for (const k of MOTION_KEYS) assert.ok(!(k in stored), `${k} not stored`);
  assert.equal(stored.musicVolume, 0.3);
  const later = resolveSettings(JSON.parse(JSON.stringify(stored)), true);
  assert.equal(later.reduceFlash, true, 'the OS preference arrived later and is honoured');
  assert.equal(later.musicVolume, 0.3);
  assert.ok(!('v' in later), 'the blob version is not a setting');
});

test('settings: a blob from before this change (no version) does not freeze the motion defaults', () => {
  const legacy = { ...defaultSettings(false), musicVolume: 0.5 };      // every key was saved, motion keys included
  const r = resolveSettings(legacy, true);
  assert.equal(r.reduceFlash, true); assert.equal(r.shake, REDUCED_MOTION_DEFAULTS.shake);
  assert.equal(r.musicVolume, 0.5);
  assert.equal(resolveSettings({ ...legacy, reduceFlash: true }, false).reduceFlash, true, 'a legacy true was a choice');
});

test('settings: hostile blobs fall back to the defaults', () => {
  for (const bad of [null, undefined, 7, 'x', [], [1, 2], true]) assert.deepEqual(resolveSettings(bad, false), defaultSettings(false));
});

test('settings: auto resolves the same way at boot and at runtime (Med on coarse pointers, High elsewhere), unknown ids fall back to High', () => {
  assert.equal(resolveQualityId('auto', true), 'med');
  assert.equal(resolveQualityId('auto', false), 'high');
  assert.equal(resolveQualityId('low', true), 'low');
  assert.equal(resolveQualityId('ultra', true), 'ultra');
  for (const bad of ['potato', undefined, null, 7, '', 'AUTO', 'constructor', 'toString', '__proto__', ['low']]) assert.equal(resolveQualityId(bad, false), 'high', String(bad));
  assert.equal(defaultSettings(false).rumble, true, 'rumble is a real setting now (input.js reads `rumble === false`)');
});

// ---------------------------------------------------------------------------------------------------------------- debug gate (E-29)

test('debug gate: a bare URL (the real player) gets no test surface; every documented test / debug parameter turns it on', () => {
  assert.equal(debugEnabled(new URLSearchParams('')), false);
  assert.equal(debugEnabled(new URLSearchParams('mute=1')), false, 'mute alone stays a harmless player option');
  assert.equal(debugEnabled(new URLSearchParams('foo=1&utm_source=x')), false);
  for (const k of ['manual', 'debug', 'autostart', 'demo', 'autopilot', 'course', 'craft', 'diff', 'laps', 'bots', 'seed']) {
    assert.ok(DEBUG_PARAMS.includes(k), k);
    assert.equal(debugEnabled(new URLSearchParams(`${k}=1`)), true, k);
  }
  // R2-E-13: `debug` is a switch, and `quality` is a player setting, not a gate
  for (const off of ['debug=0', 'debug=false', 'debug=OFF', 'debug=no', 'quality=low', 'quality=auto', 'mute=1&quality=high', 'debug=0&quality=low']) assert.equal(debugEnabled(new URLSearchParams(off)), false, off);
  for (const on of ['debug=1', 'debug=true', 'debug', 'debug=0&manual=1', 'quality=low&seed=3']) assert.equal(debugEnabled(new URLSearchParams(on)), true, on);
  assert.equal(DEBUG_PARAMS.includes('quality'), false);
  assert.equal(MAX_ERRORS, 200);
});

// ---------------------------------------------------------------------------------------------------------------- browser (one headless Chrome, one static server, started on first use)

let envP = null;
const env = () => (envP ??= (async () => {
  const srv = process.env.SKY_URL ? null : await startStaticServer();
  const chrome = await launchChrome({ width: 1280, height: 720 });
  return { srv, chrome, base: process.env.SKY_URL || `${srv.url}/skyblitz` };
})());
test.after(async () => { if (envP) { const e = await envP.catch(() => null); await e?.chrome.close(); await e?.srv?.close(); } });

const J = async (page, expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
/** Like J for an expression that is a promise. */
const JA = async (page, expr) => JSON.parse(await page.eval(`(async () => JSON.stringify(await ${expr}))()`));
/** Let the page draw `n` frames. For "nothing happens" assertions: the window is measured in frames the page really ran, so a loaded machine gets the same chance for a wrong
 *  reaction to show itself as an idle one (a wall-clock sleep gave it fewer). Positive waits use page.waitFor on the condition instead. */
const frames = (page, n = 3) => page.eval(`new Promise((res) => { let k = ${n}; const f = () => (--k > 0 ? requestAnimationFrame(f) : res(1)); requestAnimationFrame(f); })`);
const TITLE = "document.getElementById('ui') && document.getElementById('ui').dataset.screen === 'title'";
const ALERT = "!!document.getElementById('sb-boot')";
const READY = 'window.__sky && __sky.ready';
const RACE = "window.__sky && __sky.ready && __sky.game.state === 'race' && !!__sky.game.race";

/** A fresh tab on `query` (the part after /skyblitz/): `setup(page)` runs before the navigation, `wait` (an expression) after it, then `fn(page)`. */
async function withPage(query, fn, { setup, wait = READY, timeout = 90000, raw = false } = {}) {
  const { chrome, base } = await env();
  const page = await chrome.newPage();
  try {
    // every tab starts with empty storage (the profile is shared by the whole run, and a closing tab commits its writes late), once per tab: a reload keeps what the page stored
    await page.s('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('__fresh')) { localStorage.clear(); sessionStorage.setItem('__fresh', '1'); } } catch (e) { /* opaque origin */ }` });
    await setup?.(page);
    if (raw) await page.s('Page.navigate', { url: `${base}/${query}` });      // a held module request keeps `load` from firing: do not wait for it
    else await page.goto(`${base}/${query}`);
    if (wait) {
      try { await page.waitFor(wait, { timeout }); } catch (e) {
        const d = await page.eval('JSON.stringify(window.__sky ? { state: __sky.game.state, race: !!__sky.game.race, course: __sky.game.course && __sky.game.course.id, errors: __sky.errors.slice(-5) } : null)').catch((x) => String(x));
        throw new Error(`${e.message}\n  page state: ${d}\n  page errors: ${JSON.stringify(page.errors().slice(0, 5))}\n  page logs: ${JSON.stringify(page.logs.slice(-5))}`);
      }
    }
    return await fn(page);
  } finally { await page.close(); }
}

/** Holds every request whose URL matches `pattern` (CDP Fetch) until `release()`, after which new requests go straight through; with `delayMs` each one is
 *  passed on that long after it was made instead (a slow network). `ids`: the requests being held. */
function holdRequests(pattern, { delayMs = null } = {}) {
  const h = { ids: [], open: false, page: null };
  h.setup = async (page) => {
    h.page = page;
    page.cdp.on((m) => {
      if (m.sessionId !== page.sid || m.method !== 'Fetch.requestPaused') return;
      const requestId = m.params.requestId, go = () => page.s('Fetch.continueRequest', { requestId }).catch(() => {});
      if (delayMs != null) setTimeout(go, delayMs); else if (h.open) go(); else h.ids.push(requestId);
    });
    await page.s('Fetch.enable', { patterns: [{ urlPattern: pattern, requestStage: 'Request' }] });
  };
  h.release = async () => { h.open = true; for (const requestId of h.ids.splice(0)) await h.page.s('Fetch.continueRequest', { requestId }).catch(() => {}); };
  return h;
}
const holdScenery = () => holdRequests('*src/world/courses/*-scenery.js*');     // the demo race's build waits on one of these

// ---- E-29

test('E-29: a bare URL (and ?mute alone) exposes no test surface and leaves console.error alone', async () => {
  for (const q of ['', '?mute=1', '?utm_source=x', '?debug=0', '?quality=low', '?mute=1&debug=false&quality=med']) {
    await withPage(q, async (page) => {
      await page.waitFor(TITLE, { timeout: 150000 });                          // generous: a loaded machine took over 60 s once
      await frames(page, 20);
      assert.equal(await page.eval('typeof window.__sky'), 'undefined', `${q || 'bare URL'}: window.__sky`);
      assert.match(await page.eval('Function.prototype.toString.call(console.error)'), /native code/, `${q || 'bare URL'}: console.error is native`);
      assert.equal(await page.eval(ALERT), false, 'a healthy start shows no failure overlay');
      assert.deepEqual(page.errors(), [], `${q || 'bare URL'}: page errors`);
    }, { wait: null });
  }
});

test('E-29: ?debug=1 installs window.__sky, and its error log keeps the newest 200 entries (same array, no growth)', async () => {
  await withPage('?debug=1&manual=1&mute=1', async (page) => {
    const r = await J(page, `(() => { const a = __sky.errors; for (let i = 0; i < 500; i++) console.error('boom ' + i); return { n: a.length, first: a[0], last: a[a.length - 1], same: a === __sky.errors }; })()`);
    assert.equal(r.n, MAX_ERRORS);
    assert.match(r.first, /boom 300$/); assert.match(r.last, /boom 499$/); assert.equal(r.same, true);
    assert.equal(await page.eval('typeof __sky.step + typeof __sky.start + typeof __sky.governor'), 'functionfunctionfunction');
  });
});

// ---- E-11

test('E-11: a game module that fails to download gives a "failed to load" overlay with a Reload button, not a blank page', async () => {
  const t0 = Date.now();
  await withPage('?mute=1', async (page) => {
    await page.waitFor(ALERT, { timeout: 15000 });
    const o = await J(page, `(() => { const a = document.getElementById('sb-boot'); return { text: a.innerText, buttons: [...a.querySelectorAll('button')].map((b) => b.textContent) }; })()`);
    assert.match(o.text, /Skyblitz failed to load/); assert.match(o.text, /did not download/, 'the module error path, not the 8 s timer');
    assert.deepEqual(o.buttons, ['Reload']);
    assert.ok(Date.now() - t0 < 12000, 'shown at once, long before the 8 s watchdog would fire');
    assert.equal(await page.eval('typeof window.__sky'), 'undefined');
  }, { wait: null, setup: async (page) => { await page.s('Network.enable'); await page.s('Network.setBlockedURLs', { urls: ['*src/race/items.js'] }); } });
});

// R2-E-03: a slow connection is not a failure. The clocks are shortened through window.__skyBootTimings (index.html reads it before anything else runs).
const OVERLAY = `(() => { const a = document.getElementById('sb-boot'); return a && { text: a.innerText, role: a.getAttribute('role'), buttons: [...a.querySelectorAll('button')].map((b) => b.textContent) }; })()`;
const bootTimings = (t) => ({ source: `window.__skyBootTimings = ${JSON.stringify(t)};` });

test('E-11 / R2-E-03: a module request that is slow to arrive shows "Still loading" (no failure wording, no Reload button) after the soft time, and the message goes away when the game does start', async () => {
  const hold = holdRequests('*src/race/items.js*');
  let t0 = 0;
  await withPage('?mute=1', async (page) => {
    await page.waitFor(ALERT, { timeout: 20000 });
    const o = await J(page, OVERLAY);
    assert.ok(Date.now() - t0 >= 1300, `not before the soft time (${Date.now() - t0} ms after the navigation)`);
    assert.match(o.text, /Still loading/); assert.doesNotMatch(o.text, /fail|error|reload/i, 'a slow load is not a failure'); assert.deepEqual(o.buttons, []); assert.equal(o.role, 'status');
    await delay(2500);                                                           // long after the soft time, well inside the stall time: it stays that way
    assert.match((await J(page, OVERLAY)).text, /Still loading/);
    assert.ok(hold.ids.length >= 1, 'the request was held');
    await hold.release();                                                        // the slow network finally delivers
    await page.waitFor(TITLE, { timeout: 60000 });
    assert.equal(await page.eval(ALERT), false, 'the soft message is withdrawn once the game is running');
  }, {
    wait: null, raw: true,
    setup: async (page) => { await page.s('Page.addScriptToEvaluateOnNewDocument', bootTimings({ soft: 1500, stall: 60000 })); await hold.setup(page); t0 = Date.now(); },
  });
});

test('R2-E-03: when no file has finished downloading for the stall time the overlay says it failed and offers Reload; the game starting still removes it', async () => {
  const hold = holdRequests('*src/race/items.js*');
  let t0 = 0;
  await withPage('?mute=1', async (page) => {
    await page.waitFor(`/Still loading/.test(document.getElementById('sb-boot')?.innerText || '')`, { timeout: 20000 });
    await page.waitFor(`/failed to load/.test(document.getElementById('sb-boot')?.innerText || '')`, { timeout: 20000 });
    const o = await J(page, OVERLAY);
    assert.ok(Date.now() - t0 >= 3000, `not before the stall time (${Date.now() - t0} ms after the navigation)`);
    assert.match(o.text, /Skyblitz failed to load/); assert.match(o.text, /Nothing has downloaded for 3 seconds/); assert.deepEqual(o.buttons, ['Reload']); assert.equal(o.role, 'alert');
    await hold.release();
    await page.waitFor(TITLE, { timeout: 60000 });
    assert.equal(await page.eval(ALERT), false, 'withdrawn once the game is running');
  }, {
    wait: null, raw: true,
    setup: async (page) => { await page.s('Page.addScriptToEvaluateOnNewDocument', bootTimings({ soft: 1000, stall: 3000 })); await hold.setup(page); t0 = Date.now(); },
  });
});

test('R2-E-03: a load that is slow but keeps making progress (every file 0.8 s late, the whole start longer than the stall time) is never called a failure', async () => {
  const slow = holdRequests('*src/*.js*', { delayMs: 800 });
  const t0 = Date.now(); let took = 0;
  await withPage('?mute=1', async (page) => {
    const texts = new Set();
    for (;;) {                                                                    // watch the overlay until the title is up
      const s = await J(page, `({ title: ${TITLE}, o: ${OVERLAY} })`).catch(() => null);
      if (s?.o) texts.add(s.o.text.split('\n')[0]);
      if (s?.title) break;
      assert.ok(Date.now() - t0 < 90000, 'the game started');
      await delay(150);
    }
    took = Date.now() - t0;
    assert.ok(took > 3500, `the load really was slower than the stall time (${took} ms against 2500)`);
    assert.ok(texts.has('Still loading...'), `the soft message was shown: ${[...texts]}`);
    assert.ok(![...texts].some((t) => /fail/i.test(t)), `no failure wording while files keep arriving: ${[...texts]}`);
    assert.equal(await page.eval(ALERT), false);
  }, {
    wait: null, raw: true,
    setup: async (page) => { await page.s('Page.addScriptToEvaluateOnNewDocument', bootTimings({ soft: 1000, stall: 2500 })); await slow.setup(page); },
  });
});

test('R2-E-03: a dynamic import that rejects before the game is up shows the failure card; an unrelated rejection does not', async () => {
  const hold = holdRequests('*src/race/items.js*');
  await withPage('?mute=1', async (page) => {
    for (let i = 0; i < 600 && !hold.ids.length; i++) await delay(50);          // the module graph is loading (the held request arrived): the watchdog has been installed for a while
    assert.ok(hold.ids.length >= 1, 'the request was held');
    await page.eval("Promise.reject(new Error('boom')); 1"); await frames(page, 20);
    assert.equal(await page.eval(ALERT), false, 'an unrelated rejection is not a load failure');
    await page.eval("Promise.reject(new TypeError('Failed to fetch dynamically imported module: http://x/y.js')); 1");
    await page.waitFor(ALERT, { timeout: 5000 });
    const o = await J(page, OVERLAY);
    assert.match(o.text, /Skyblitz failed to load/); assert.match(o.text, /did not download/); assert.deepEqual(o.buttons, ['Reload']);
  }, {
    wait: null, raw: true,
    setup: async (page) => { await page.s('Page.addScriptToEvaluateOnNewDocument', bootTimings({ soft: 60000, stall: 60000 })); await hold.setup(page); },
  });
});

test('E-11: without WebGL the page keeps its "WebGL2 is not available" message (and offers no useless reload)', async () => {
  await withPage('?mute=1', async (page) => {
    await page.waitFor(ALERT, { timeout: 20000 });
    const o = await J(page, `(() => { const a = document.getElementById('sb-boot'); return { text: a.innerText, buttons: a.querySelectorAll('button').length }; })()`);
    assert.match(o.text, /WebGL2 is not available in this browser\./);
    assert.equal(o.buttons, 0);
  }, { wait: null, setup: (page) => page.s('Page.addScriptToEvaluateOnNewDocument', { source: 'HTMLCanvasElement.prototype.getContext = function () { return null; };' }) });
});

// ---- E-12

test('E-12 / R2-V-18: losing the WebGL context pauses the race and shows a notice; restoring it leaves the race paused on the pause menu with Resume focused (no restart mid-air); Resume flies on; nothing throws', async () => {
  await withPage('?debug=1&autostart=1&mute=1&course=sunrise&seed=7', async (page) => {
    await page.waitFor("__sky.game.state === 'race' && __sky.game.simTime > 0.5", { timeout: 90000 });
    const snap = () => J(page, `(() => { const g = __sky.game; return { lost: g.contextLost, paused: g.paused, sim: g.simTime, frame: g.frame, notice: document.getElementById('sb-notice')?.innerText ?? null, screen: document.getElementById('ui').dataset.screen }; })()`);
    const before = await snap();
    assert.equal(before.lost, false); assert.equal(before.paused, false); assert.equal(before.notice, null);
    await page.eval("window.__ext = __sky.game.renderer.getContext().getExtension('WEBGL_lose_context'); __ext.loseContext(); 1");
    await page.waitFor('__sky.game.contextLost === true', { timeout: 5000 });
    await page.waitFor(`__sky.game.paused === true && !!document.getElementById('sb-notice') && document.getElementById('ui').dataset.screen === 'pause'`, { timeout: 30000 });
    const a = await snap(); await frames(page, 45); const b = await snap();
    assert.equal(a.paused, true, 'the race is paused'); assert.equal(a.screen, 'pause');
    assert.match(a.notice, /Graphics context lost/);
    assert.equal(b.sim, a.sim, 'the simulation is frozen'); assert.equal(b.frame, a.frame, 'nothing is drawn into the dead context');
    await page.eval('__sky.step(3, 1); __sky.game.renderFrame(1, 1 / 60); 1');            // the loop already stands down; the test surface and any other direct caller must not draw into the dead context either
    const d = await snap();
    assert.equal(d.frame, a.frame, 'renderFrame is a no-op while the context is gone'); assert.equal(d.sim, a.sim, 'and so is the sim step');
    await page.eval('__sky.game.setPaused(false); 1');
    assert.equal((await snap()).paused, true, 'resuming into a blank frame is refused');
    await page.eval('__ext.restoreContext(); 1');
    await page.waitFor('__sky.game.contextLost === false', { timeout: 10000 });
    await page.waitFor(`__sky.game.frame > ${b.frame + 10}`, { timeout: 30000 });                  // drawing again
    await frames(page, 90);                                                               // long enough for an automatic resume (the old behaviour) to show itself
    const c = await snap();
    assert.equal(c.paused, true, 'still paused: the race does not restart mid-air'); assert.equal(c.screen, 'pause'); assert.equal(c.notice, null, 'notice removed');
    assert.equal(c.sim, b.sim, 'the simulation has not moved'); assert.ok(c.frame > b.frame + 10, 'drawing again');
    const f = await J(page, `(() => { const a = document.activeElement; return { tag: a && a.tagName, text: a ? a.textContent.trim() : '', inPause: !!a && !!a.closest('[data-screen=pause]') }; })()`);
    assert.equal(f.tag, 'BUTTON'); assert.match(f.text, /^Resume/, 'Resume has the focus'); assert.equal(f.inPause, true);
    await page.key('Enter');                                                              // the player's answer
    await page.waitFor(`__sky.game.simTime > ${b.sim + 0.5}`, { timeout: 15000 });
    assert.equal((await snap()).paused, false, 'Resume flies on');
    assert.deepEqual(page.errors(), []);
  });
});

test('E-12: a race the player had paused stays paused after the context comes back', async () => {
  await withPage('?debug=1&autostart=1&mute=1&course=sunrise&seed=7', async (page) => {
    await page.waitFor("__sky.game.state === 'race' && __sky.game.simTime > 0.5", { timeout: 90000 });
    await page.eval("__sky.game.setPaused(true); window.__ext = __sky.game.renderer.getContext().getExtension('WEBGL_lose_context'); __ext.loseContext(); 1");
    await page.waitFor('__sky.game.contextLost === true', { timeout: 5000 });
    await page.eval('__ext.restoreContext(); 1');
    await page.waitFor('__sky.game.contextLost === false', { timeout: 10000 });
    await frames(page, 20);
    assert.equal(await page.eval('__sky.game.paused'), true);
    assert.equal(await page.eval("document.getElementById('sb-notice')"), null);
    assert.deepEqual(page.errors(), []);
  });
});

// ---- R2-V-01

const CANVAS_OPACITY = "getComputedStyle(document.querySelector('canvas')).opacity";

test('R2-V-01: on a first load the title is up before the demo race is built (canvas held back), and the scene fades in behind it afterwards', async () => {
  const hold = holdScenery();
  await withPage('?debug=1&mute=1', async (page) => {
    await page.waitFor(TITLE, { timeout: 30000 });
    const a = await J(page, `({ race: !!__sky.game.race, state: __sky.game.state, op: ${CANVAS_OPACITY}, overlay: !!document.getElementById('sb-boot') })`);
    assert.deepEqual(a, { race: false, state: 'title', op: '0', overlay: false }, 'the title screen is showing while the demo race is still waiting for its scenery; the half-built scene is not');
    await hold.release();
    await page.waitFor('!!__sky.game.race', { timeout: 60000 });
    await page.waitFor(`${CANVAS_OPACITY} === '1'`, { timeout: 10000 });
    const b = await J(page, `({ state: __sky.game.state, screen: __sky.game.ui.cur && __sky.game.ui.cur.name, inline: document.querySelector('canvas').style.opacity, demo: !!__sky.game.race.demo })`);
    assert.deepEqual(b, { state: 'title', screen: 'title', inline: '', demo: true }, 'the demo runs behind the title, which is still the screen');
    assert.deepEqual(page.errors(), []);
  }, { wait: null, setup: hold.setup });
});

test('R2-V-01: a race the player starts while the demo is still being built wins: the demo steps aside, the canvas is not left hidden, the title does not come back over the race', async () => {
  const hold = holdScenery();
  await withPage('?debug=1&mute=1', async (page) => {
    await page.waitFor(TITLE, { timeout: 30000 });
    await page.eval("window.__states = []; window.__ready = 0; __sky.game.events.on('game:state', (e) => window.__states.push(e.to)); __sky.game.events.on('game:loadProgress', (e) => { if (e.label === 'Ready') window.__ready++; }); 1");
    await page.eval("window.__mine = __sky.start({ courseId: 'sunrise', craftId: 'falcon', seed: 7, bots: 1, laps: 1 }); 1");       // the player picks Quick Race before the title demo exists
    await hold.release();
    await page.waitFor("__sky.game.state === 'race' && !!__sky.game.race && !__sky.game.race.demo", { timeout: 90000 });
    // C1: the superseded demo build ends with its own 'Ready' (the player's race is the second); then a few frames let its continuation (token check, canvas restore) run
    await page.waitFor('window.__ready >= 2', { timeout: 90000 });
    await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
    const r = await J(page, `({ state: __sky.game.state, screen: __sky.game.ui.cur && __sky.game.ui.cur.name, demo: !!__sky.game.race.demo, op: ${CANVAS_OPACITY}, inline: document.querySelector('canvas').style.opacity, course: __sky.game.course && __sky.game.course.id, states: window.__states })`);
    assert.deepEqual(r, { state: 'race', screen: null, demo: false, op: '1', inline: '', course: 'sunrise', states: ['loading', 'race'] }, 'the superseded demo never put the title state back over the player\'s loading race');
    assert.deepEqual(page.errors(), []);
  }, { wait: null, setup: hold.setup });
});

// ---- V-8

const REDUCE = (v) => ({ features: [{ name: 'prefers-reduced-motion', value: v }] });
const SETTINGS_KEY = 'skyblitz.settings.v1';
/** The motion settings as the game reads them, plus what the two flash consumers (post chain, HUD overlay) do with a 0.9 flash. */
const motion = (page) => J(page, `(() => {
  const g = __sky.game, hud = g.ui.hud;
  g.post.state.flash = 0; g.post.flash(1, 1, 1, 0.9); const post = g.post.state.flash;
  hud.fx(hud.flash, 0.9); const hudA = Number(hud.flash.style.getPropertyValue('--a'));
  return { reduceFlash: g.settings.reduceFlash, shake: g.settings.shake, calm: g.ui.root.classList.contains('calm'), os: matchMedia('(prefers-reduced-motion: reduce)').matches,
           stored: JSON.parse(localStorage.getItem('${SETTINGS_KEY}') || 'null'), post, hudA };
})()`);

test('V-8: an untouched profile starts with reduced flashing and gentler shake when the OS asks for less motion; a stored choice wins; flashes stay capped', async () => {
  await withPage('?debug=1&manual=1&mute=1', async (page) => {
    const m = await motion(page);
    assert.equal(m.os, true);
    assert.equal(m.reduceFlash, true, 'reduceFlash follows the OS'); assert.equal(m.shake, REDUCED_MOTION_DEFAULTS.shake); assert.equal(m.calm, true, 'the UI is in its calm mode');
    assert.ok(m.post <= 0.12 * 0.9 + 1e-6, `post-chain flash alpha ${m.post}`); assert.ok(m.hudA <= 0.2, `HUD flash alpha ${m.hudA}`);
    assert.equal(m.stored, null, 'nothing was written: the defaults are not a choice');
    // the player turns both off: that is a choice, it is stored, and it survives a reload under the same OS preference
    await page.eval("__sky.game.ui.setSetting('reduceFlash', false); __sky.game.ui.setSetting('shake', 1); 1");
    const stored = await J(page, `JSON.parse(localStorage.getItem('${SETTINGS_KEY}'))`);
    assert.equal(stored.reduceFlash, false); assert.equal(stored.shake, 1);
    await page.goto(await page.eval('location.href')); await page.waitFor(READY, { timeout: 60000 });
    const m2 = await motion(page);
    assert.equal(m2.os, true, 'the emulation still applies after the reload');
    assert.equal(m2.reduceFlash, false, 'the stored choice beats the OS preference'); assert.equal(m2.shake, 1); assert.equal(m2.calm, false);
    assert.equal(m2.post, 0.5, 'a full flash is capped at half'); assert.equal(m2.hudA, 0.5);
  }, { setup: (page) => page.s('Emulation.setEmulatedMedia', REDUCE('reduce')) });
});

test('V-8: with no OS preference the defaults are unchanged, and a live change of the preference is followed unless the player chose', async () => {
  await withPage('?debug=1&manual=1&mute=1', async (page) => {
    // C1: wait for what the game observes (the page's own media query and the game's copy of it), not for a fixed time
    const set = async (v) => {
      await page.s('Emulation.setEmulatedMedia', REDUCE(v));
      const want = v === 'reduce';
      await page.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches === ${want} && __sky.game.reducedMotion === ${want}`, { timeout: 30000 });
    };
    const m = await motion(page);
    assert.equal(m.os, false); assert.equal(m.reduceFlash, false); assert.equal(m.shake, 1); assert.equal(m.calm, false);
    assert.equal(m.post, 0.5); assert.equal(m.hudA, 0.5);
    await set('reduce');
    let r = await motion(page);
    assert.equal(r.reduceFlash, true, 'followed the OS while open'); assert.equal(r.shake, REDUCED_MOTION_DEFAULTS.shake); assert.equal(r.calm, true);
    assert.equal(await page.eval('__sky.game.ui.root.classList.contains("calm") && __sky.game.reducedMotion'), true);
    await set('no-preference');
    r = await motion(page);
    assert.equal(r.reduceFlash, false); assert.equal(r.shake, 1); assert.equal(r.calm, false);
    // an explicit choice is not touched by the preference, in either direction
    await page.eval("__sky.game.ui.setSetting('reduceFlash', true); __sky.game.ui.setSetting('shake', 0.7); 1");
    await set('reduce'); await set('no-preference');
    r = await motion(page);
    assert.equal(r.reduceFlash, true, 'the choice survived two preference changes'); assert.equal(r.shake, 0.7);
    // Settings > Reset to defaults uses the defaults of the current preference
    await set('reduce');
    await page.eval('__sky.game.ui.resetSettings(); 1');
    r = await motion(page);
    assert.equal(r.reduceFlash, true); assert.equal(r.shake, REDUCED_MOTION_DEFAULTS.shake);
    assert.deepEqual(page.errors(), []);
  });
});

// ---- E-05 / V-9

/** Feed the governor `secs` seconds of synthetic frames at `hz` with `cost` ms of work each (frame interval = 1/hz: the display's rhythm, not the work). */
const feed = (page, secs, cost, { hz = 60, race = false } = {}) => J(page, `(() => {
  const g = __sky.game, acts = [];
  for (let i = 0, n = ${Math.round(secs * hz)}; i < n; i++) { ${race ? 'g.fixedUpdate();' : ''} const a = g.governorFrame(${1 / hz}, ${cost}, 1, 0); if (a) acts.push(a); }
  return { acts, scale: g.autoScale, quality: g.qualityId, setting: g.settings.quality, pr: g.pixelRatio, sim: g.simTime, gov: __sky.governor() };
})()`);

test('E-05 / V-9: a 60 Hz display with light work never drops; a slow burst costs a step and recovers; presets change only between races; the player\'s pick wins', async () => {
  await withPage('?manual=1&autostart=1&mute=1&quality=auto&course=sunrise&seed=7&bots=7', async (page) => {
    const g0 = await J(page, '({ q: __sky.game.qualityId, s: __sky.game.settings.quality, scale: __sky.game.autoScale, pr: __sky.game.pixelRatio })');
    assert.deepEqual([g0.q, g0.s, g0.scale], ['high', 'auto', 1]);
    // 1. a minute of racing at 60 Hz, 6 ms of work per frame (16.7 ms between frames): nothing happens
    const r1 = await feed(page, 60, 6, { race: true });
    assert.deepEqual(r1.acts, [], 'no governor action'); assert.equal(r1.scale, 1); assert.equal(r1.quality, 'high'); assert.equal(r1.pr, g0.pr); assert.ok(r1.sim > 55, `the race ran (${r1.sim} s)`);
    // 2. a 6 s burst of 16 ms work in the middle of quiet racing: at most one step down, never a preset, and the full resolution comes back
    const r2 = await feed(page, 6, 16);
    assert.ok(r2.acts.filter((a) => a.type === 'scale').length <= 1 && r2.acts.every((a) => a.type === 'scale'), JSON.stringify(r2.acts));
    const r3 = await feed(page, 70, 5);
    assert.ok(r3.acts.every((a) => a.type === 'scale' && a.scale > 0.85), JSON.stringify(r3.acts));
    assert.equal(r3.scale, 1, 'recovered'); assert.equal(r3.quality, 'high'); assert.equal(r3.pr, g0.pr, 'the render resolution is back');
    // 3. sustained overload: the scale goes down step by step to the floor, the preset is only REQUESTED and the running race keeps its preset
    const r4 = await feed(page, 70, 30);
    assert.ok(r4.acts.filter((a) => a.type === 'scale').length <= 4, `few resolution changes: ${JSON.stringify(r4.acts)}`);
    assert.equal(r4.scale, 0.6); assert.ok(Math.abs(r4.pr - 0.6 * g0.pr) < 1e-6, `pixel ratio ${r4.pr}`);
    assert.equal(r4.gov.pending, 'med', 'a lower preset is requested ...'); assert.equal(r4.quality, 'high', '... but not applied mid-race'); assert.equal(r4.setting, 'auto', 'and the player\'s setting is untouched');
    // 4. the next race start applies it (behind the loading screen) and keeps the scale
    await page.eval("__sky.start({ courseId: 'sunrise', seed: 8 }).then(() => 1)");
    const r5 = await J(page, '({ q: __sky.game.qualityId, s: __sky.game.settings.quality, scale: __sky.game.autoScale, gov: __sky.governor(), aniso: __sky.game.assets.aniso })');
    assert.equal(r5.q, 'med'); assert.equal(r5.s, 'auto'); assert.equal(r5.scale, 0.6); assert.equal(r5.gov.pending, null); assert.equal(r5.gov.preset, 'med'); assert.equal(r5.aniso, 4);
    // 5. an explicit pick in Settings wins: full scale, and the governor leaves it alone however slow the frames are
    await page.eval("__sky.quality('low'); 1");
    const r6 = await feed(page, 60, 30);
    assert.deepEqual(r6.acts, []); assert.equal(r6.scale, 1); assert.equal(r6.quality, 'low'); assert.equal(r6.setting, 'low');
    // 6. back on Auto: a paused game is not a measurement; a running one is
    await page.eval("__sky.quality('auto'); __sky.game.setPaused(true); 1");
    assert.deepEqual((await feed(page, 60, 30)).acts, [], 'paused: no action');
    await page.eval('__sky.game.setPaused(false); 1');
    const r7 = await feed(page, 40, 30);
    assert.ok(r7.acts.length >= 1 && r7.scale < 1, 'running again: it reacts');
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE });
});

test('E-05: the real loop feeds the cost meter (and the GPU timer where the browser has one) and a few quiet seconds change nothing', async () => {
  await withPage('?debug=1&autostart=1&mute=1&quality=auto&course=sunrise&seed=7', async (page) => {
    await page.waitFor("__sky.game.state === 'race' && __sky.game.simTime > 4", { timeout: 90000 });
    const p = await J(page, '({ perf: __sky.perf(), gov: __sky.governor(), gpu: !!__sky.game.gpuTimer && __sky.game.gpuTimer.supported, scale: __sky.game.autoScale, q: __sky.game.qualityId })');
    assert.ok(p.perf.costMs > 0.2 && p.perf.costMs < 80, `smoothed frame cost ${p.perf.costMs} ms`);
    assert.ok(Number.isFinite(p.perf.gpuMs) && p.perf.gpuMs >= 0, `gpuMs ${p.perf.gpuMs} (timer supported: ${p.gpu})`);
    assert.equal(p.gov.changes, 0); assert.equal(p.scale, 1); assert.equal(p.q, 'high');
    assert.deepEqual(page.errors(), []);
  });
});

test('R2-E-01: the game tells the governor whether a GPU timer is reading: without one a 40 ms frame interval over 2 ms of CPU work is overload, with one it is a slow display', async () => {
  await withPage('?manual=1&autostart=1&mute=1&quality=auto&course=sunrise&seed=7&bots=7', async (page) => {
    assert.equal(await page.eval('!!__sky.game.gpuTimer && __sky.game.gpuTimer.live'), false, 'manual mode never runs the GPU timer, so there is no reading');
    assert.deepEqual((await feed(page, 60, 2, { hz: 60 })).acts, [], '60 Hz over 2 ms of work: nothing');
    const slow = await feed(page, 40, 2, { hz: 25 });
    assert.ok(slow.acts.length >= 1 && slow.scale < 1, `no GPU timer, a frame every 40 ms: ${JSON.stringify(slow.acts)}`);
    assert.equal(slow.gov.gpuKnown, false); assert.ok(slow.gov.medDt > 30, `median interval ${slow.gov.medDt} ms`);
    await page.eval("__sky.quality('auto'); __sky.game.gpuTimer = { live: true, ms: 2, supported: true }; 1");       // full scale again, and a timer that reads 2 ms of GPU work
    const fast = await feed(page, 60, 2, { hz: 25 });
    assert.deepEqual(fast.acts, [], 'with a GPU timer the same frames are a display that runs at 25 Hz, not a load');
    assert.equal(fast.gov.gpuKnown, true); assert.equal(fast.scale, 1);
    await page.eval("__sky.game.gpuTimer = { live: false, ms: 0, supported: true }; 1");                             // a timer that exists but has not read anything yet is no timer
    assert.ok((await feed(page, 40, 2, { hz: 25 })).acts.length >= 1, 'an extension that has produced no reading does not count');
    // a hidden or shown tab: the first long frame after it is a stall, however slow the frames before it were
    const tNow = () => page.eval('__sky.governor().t'), long = () => page.eval('__sky.game.governorFrame(1.5, 900, 1, 0); 1');
    await feed(page, 20, 600, { hz: 5 });                                                                            // a machine that is slow on every frame
    const t0 = await tNow(); await long();
    assert.ok(await tNow() - t0 > 1.4, 'a 1.5 s frame on a machine that is slow on every frame is its cost');
    await page.eval("document.dispatchEvent(new Event('visibilitychange')); 1");
    const t1 = await tNow(); await long();
    assert.equal(await tNow(), t1, 'after a visibility change the same frame is a stall');
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE });
});

// ---- R2-V-16

/** Real loop (no `manual`). Wraps post.render to log, for every frame that really draws, how many programs it had to create. */
const WATCH_DRAWS = `(() => {
  const g = __sky.game, orig = g.post.render.bind(g.post); window.__draws = [];
  g.post.render = (dt) => { const n0 = g.renderer.info.programs.length; orig(dt); window.__draws.push({ add: g.renderer.info.programs.length - n0, warming: g._warming, held: g._holdDraw, frame: g.frame }); };
  return 1; })()`;

test('R2-V-16: switching the preset with a race built links the new programs before the first frame that uses them (no compile inside a drawn frame), and the held frame is released', async () => {
  await withPage('?debug=1&autostart=1&mute=1&course=redrock&seed=7&quality=high&bots=3&laps=1', async (page) => {
    await page.waitFor('__sky.game.simTime > 1', { timeout: 60000 });
    await page.eval('__sky.game.setPaused(true); 1');                                  // what Settings does: the pause menu is up
    await page.eval(WATCH_DRAWS);
    for (const [id, minNew, maxHidden] of [['low', 20, 4], ['high', 0, 20]]) {      // maxHidden: the post chain's own programs (High: bloom blurs, SMAA's three passes, grade, output; Low: grade, output)
      const p0 = await page.eval('__sky.game.renderer.info.programs.length');
      await page.eval('window.__draws.length = 0; 1');
      await page.eval(`__sky.game.setQuality('${id}'); 1`);
      await page.waitFor(`__sky.game.qualityId === '${id}' && __sky.game._warming === 0 && !__sky.game._holdDraw`, { timeout: 30000 });
      assert.ok((await page.eval('__sky.game.renderer.info.programs.length')) - p0 >= minNew, `${id}: the warm-up linked the new preset's programs (>= ${minNew})`);
      await page.eval('new Promise((res) => { const n0 = window.__draws.length; const f = () => (window.__draws.length >= n0 + 8 ? res(1) : requestAnimationFrame(f)); f(); })');   // drawing goes on afterwards
      const draws = await J(page, 'window.__draws');
      const live = draws.filter((d) => !d.warming);
      assert.ok(live.length >= 8, `${id}: frames were drawn after the switch (${live.length})`);
      assert.deepEqual(live.map((d) => d.add), live.map(() => 0), `${id}: no program was created inside a live frame`);
      const hidden = draws.filter((d) => d.warming);
      assert.ok(hidden.length <= 1, `${id}: only the one hidden frame drew while the warm-up ran (${hidden.length})`);
      assert.ok(hidden.reduce((s, d) => s + d.add, 0) <= maxHidden, `${id}: the hidden frame only builds the post chain's own programs (${JSON.stringify(hidden)})`);   // Low: 19 without the pre-pass, the parallel link covered fewer
    }
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE });
});

test('R2-V-16: a new race that starts while a preset warm-up runs is not left with a held frame, and manual mode never holds', async () => {
  await withPage('?debug=1&autostart=1&mute=1&course=redrock&seed=7&quality=high&bots=1&laps=1', async (page) => {
    await page.waitFor('__sky.game.simTime > 1', { timeout: 60000 });
    await page.eval("__sky.game.setQuality('low'); window.__hold = __sky.game._holdDraw; window.__next = __sky.start({ courseId: 'sunrise', seed: 3, bots: 1, laps: 1 }); 1");
    assert.equal(await page.eval('window.__hold'), true, 'the switch holds the frame while it links');
    await page.waitFor("__sky.game.state === 'race' && __sky.game.course && __sky.game.course.id === 'sunrise' && __sky.game.simTime > 0.5", { timeout: 120000 });
    assert.equal(await page.eval('__sky.game._holdDraw'), false, 'the new race draws');
    assert.equal(await page.eval('__sky.game._warming'), 0);
  }, { wait: RACE });
  await withPage('?debug=1&manual=1&autostart=1&mute=1&course=sunrise&seed=7&quality=high&bots=1&laps=1', async (page) => {
    await page.eval("__sky.game.setQuality('low'); 1");
    assert.equal(await page.eval('__sky.game._holdDraw'), false, 'manual mode: a harness draws by hand, so nothing is ever held');
  }, { wait: RACE });
});

// ---- R2-E-04 / R2-E-05

test('R2-E-04: a second race on the same course re-links only the programs three keys by per-race shader ids (about a third), not all of them', async () => {
  await withPage('?debug=1&manual=1&autostart=1&mute=1&course=redrock&seed=7&quality=high&bots=3&laps=1', async (page) => {
    const first = await J(page, '__sky.game.renderer.info.programs.length');
    assert.ok(first >= 40, `the first race linked its programs (${first})`);
    const r = await JA(page, `(async () => {
      const g = __sky.game, before = new Set(g.renderer.info.programs), t = performance.now();
      await __sky.start({ courseId: 'redrock', seed: 8, bots: 3, laps: 1 });
      const fresh = g.renderer.info.programs.filter((p) => !before.has(p)).length;
      return { fresh, total: g.renderer.info.programs.length, kept: g._kept.size };
    })()`);
    assert.ok(r.kept >= first * 0.4, `programs are held across the race change (${r.kept} of ${first})`);
    assert.ok(r.total <= first + 3, `the program count does not grow race over race (${first} -> ${r.total}; programs keyed by per-race shader ids must not be held, leak.test.mjs)`);
    // ShaderMaterial programs (water, terrain...) are keyed by shader-source ids that three frees with their last material, so about a fifth are still rebuilt (14 of 68 on Redrock)
    assert.ok(r.fresh <= first * 0.35, `the second race linked ${r.fresh} new programs (a rebuilt-from-scratch race links ${first})`);
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE });
});

test('R2-E-04: held programs are forgotten when the context is lost', async () => {
  await withPage('?debug=1&manual=1&autostart=1&mute=1&course=sunrise&seed=7&quality=low&bots=1&laps=1', async (page) => {
    await page.eval('__sky.game.keepPrograms(); 1');
    assert.ok(await page.eval('__sky.game._kept.size') > 10);
    await page.eval("window.__ext = __sky.game.renderer.getContext().getExtension('WEBGL_lose_context'); __ext.loseContext(); 1");
    await page.waitFor('__sky.game.contextLost === true', { timeout: 10000 });
    assert.equal(await page.eval('__sky.game._kept.size'), 0, 'the programs died with the context; their handles are dropped');
    await page.eval('__ext.restoreContext(); 1');
    await page.waitFor('__sky.game.contextLost === false', { timeout: 10000 });
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE });
});

test('R2-E-05: the shadow pass has met every depth variant and the speed pass has been drawn once by the time the race goes live (neon, high): nothing links in the first 14 s', async () => {
  await withPage('?debug=1&autostart=1&mute=1&autopilot=1&course=neon&seed=7&quality=high&bots=7&laps=2', async (page) => {
    const r = await JA(page, `(async () => {
      const g = __sky.game, seen = new Set(g.renderer.info.programs.map((p) => p.cacheKey)), late = [], t0 = performance.now(), s0 = g.simTime;
      while (g.simTime - s0 < 14 && performance.now() - t0 < 90000) {
        await new Promise((res) => requestAnimationFrame(res));
        for (const p of g.renderer.info.programs) if (!seen.has(p.cacheKey)) { seen.add(p.cacheKey); late.push({ sim: +g.simTime.toFixed(1), key: p.cacheKey.slice(0, 60) }); }
      }
      return { late, simmed: g.simTime - s0 };
    })()`);
    assert.ok(r.simmed >= 14, `the race ran 14 s (${r.simmed})`);
    assert.deepEqual(r.late, [], 'no program was linked after go');
    assert.deepEqual(page.errors(), []);
  }, { wait: RACE, timeout: 120000 });
});

// ---- E-28

test('E-28: the quality preset reaches texture anisotropy', async () => {
  await withPage('?debug=1&manual=1&autostart=1&mute=1&quality=high&course=sunrise&seed=7', async (page) => {
    const r = await J(page, `(() => {
      const g = __sky.game, max = g.renderer.capabilities.getMaxAnisotropy(), real = [...g.assets.cache.values()].filter((t) => !t.userData.placeholder), out = { max, n: real.length };
      for (const id of ['low', 'med', 'high', 'ultra']) { g.setQuality(id, true); out[id] = { want: Math.min(g.q.aniso, max), got: [...new Set(real.map((t) => t.anisotropy))] }; }
      return out;
    })()`);
    assert.ok(r.n >= 1, `textures were loaded (${r.n})`);
    for (const id of ['low', 'med', 'high', 'ultra']) assert.deepEqual(r[id].got, [r[id].want], `${id}: texture anisotropy`);
  }, { wait: RACE });
});

test('E-28: Auto quality resolves the same way at boot and when picked at run time (Med on a touch phone, High on a desktop)', async () => {
  const phone = (page) => Promise.all([page.setViewport(390, 844, { dpr: 3, mobile: true }), page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })]);
  await withPage('?debug=1&manual=1&mute=1', async (page) => {
    const boot = await J(page, "({ coarse: matchMedia('(pointer: coarse)').matches, setting: __sky.game.settings.quality, id: __sky.game.qualityId })");
    assert.equal(boot.coarse, true, 'the emulated phone has a coarse pointer'); assert.equal(boot.setting, 'auto'); assert.equal(boot.id, 'med', 'boot: Med');
    await page.eval("__sky.quality('high'); 1");
    assert.equal(await page.eval('__sky.game.qualityId'), 'high');
    await page.eval("__sky.quality('auto'); 1");
    assert.equal(await page.eval('__sky.game.qualityId'), 'med', 'run time: the same Med, not a hard-coded High');
    assert.equal(await page.eval('__sky.game.settings.quality'), 'auto', 'and the setting stays Auto');
  }, { setup: phone });
  await withPage('?debug=1&manual=1&mute=1', async (page) => {
    assert.equal(await page.eval('__sky.game.qualityId'), 'high', 'desktop boot: High');
    await page.eval("__sky.quality('low'); __sky.quality('auto'); 1");
    assert.equal(await page.eval('__sky.game.qualityId'), 'high', 'desktop run time: High');
  });
});

test('E-28: Settings has a Controller vibration toggle (default on) that really gates the gamepad rumble, and Reset restores it', async () => {
  await withPage('?debug=1&manual=1&autostart=1&mute=1&course=sunrise&seed=7', async (page) => {
    await page.eval(`window.__rumbles = 0; navigator.getGamepads = () => [{ connected: true, id: 'fake pad', buttons: [], axes: [], vibrationActuator: { playEffect: () => { window.__rumbles++; return Promise.resolve(); } } }]; 1`);
    const boost = () => page.eval("__sky.game.events.emit('racer:boost', { racer: __sky.game.player, kind: 'ring' }); window.__rumbles");
    assert.equal(await page.eval('__sky.game.settings.rumble'), true, 'on by default');
    assert.equal(await boost(), 1, 'the pad rumbles on a boost ring');
    await page.eval("__sky.game.ui.goto('settings'); 1");                                  // the real Settings screen, the real switch
    const sw = `document.querySelector('[data-screen=settings] button.toggle[aria-label="Controller vibration"]')`;
    assert.equal(await page.eval(`${sw}.getAttribute('aria-checked')`), 'true');
    await page.eval(`${sw}.click(); 1`);
    assert.equal(await page.eval('__sky.game.settings.rumble'), false); assert.equal(await page.eval(`${sw}.getAttribute('aria-checked')`), 'false');
    assert.equal(await boost(), 1, 'no rumble once it is switched off');
    assert.equal(await J(page, `JSON.parse(localStorage.getItem('${SETTINGS_KEY}')).rumble`), false, 'and the choice is stored');
    await page.eval('__sky.game.ui.resetSettings(); 1');
    assert.equal(await page.eval('__sky.game.settings.rumble'), true, 'Reset to defaults switches it back on'); assert.equal(await boost(), 2);
  }, { wait: RACE });
});

// ---- V-35

const PROGRAM_LOGS = `(() => { window.__plogs = []; const P = WebGL2RenderingContext.prototype, o = P.getProgramInfoLog; P.getProgramInfoLog = function (p) { const l = o.call(this, p); if (l && l.length) window.__plogs.push(l.slice(0, 200)); return l; }; })()`;

for (const [course, quality] of [['sunrise', 'high'], ['redrock', 'high'], ['redrock', 'low'], ['redrock', 'med']]) {      // med: the only preset with the FXAA pass (R2-E-01 nit)
  test(`V-35: ${course} on ${quality}: the scene's shaders are compiled behind the loading screen, with no console warnings and no shader logs`, async () => {
    const logWarnings = [];
    await withPage(`?debug=1&manual=1&autostart=1&mute=1&course=${course}&seed=7&bots=7&quality=${quality}`, async (page) => {
      const n0 = await page.eval('__sky.game.renderer.info.programs.length');
      await page.eval('__sky.step(400, 5); 1');
      const n1 = await page.eval('__sky.game.renderer.info.programs.length');
      assert.ok(n0 >= 20, `the warm-up compiled the scene before the race went live (${n0} programs)`);
      assert.ok(n1 - n0 <= 6, `${n1 - n0} programs still had to compile during the first 400 steps (${n0} -> ${n1})`);
      assert.deepEqual(await J(page, 'window.__plogs'), [], 'no program info log (X4122 / X3595 and friends)');
      assert.deepEqual(page.logs.filter((l) => l.type === 'warning'), [], 'console warnings');
      assert.deepEqual(logWarnings, [], 'browser log warnings');
      assert.deepEqual(page.errors(), []);
    }, {
      wait: RACE, timeout: 120000,
      setup: async (page) => {
        await page.s('Page.addScriptToEvaluateOnNewDocument', { source: PROGRAM_LOGS });
        page.cdp.on((m) => { if (m.sessionId === page.sid && m.method === 'Log.entryAdded' && m.params.entry.level === 'warning') logWarnings.push(m.params.entry.text.slice(0, 200)); });
      },
    });
  });
}

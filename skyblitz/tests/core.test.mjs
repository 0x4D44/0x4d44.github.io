// Game-shell tests (round 1, core): the auto-quality governor, settings defaults, the debug gate, the boot watchdog, context loss, shader warm-up.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/core.test.mjs
// The first half is pure logic (synthetic traces, no browser). The second half drives the real game in headless Chrome (tests/tools/chrome.mjs:
// hidden, below-normal priority) against its own static server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, CostMeter, GOV, PRESET_ORDER, lowerPreset, higherPreset } from '../src/governor.js';
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
  for (const k of ['manual', 'debug', 'autostart', 'demo', 'autopilot', 'course', 'craft', 'diff', 'laps', 'bots', 'seed', 'quality']) {
    assert.ok(DEBUG_PARAMS.includes(k), k);
    assert.equal(debugEnabled(new URLSearchParams(`${k}=1`)), true, k);
  }
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

// ---- E-29

test('E-29: a bare URL (and ?mute alone) exposes no test surface and leaves console.error alone', async () => {
  for (const q of ['', '?mute=1', '?utm_source=x']) {
    await withPage(q, async (page) => {
      await page.waitFor(TITLE, { timeout: 60000 });
      await delay(300);
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

test('E-11: a module request that never finishes shows the "has not started" message after 8 s, and the message goes away when the game does start', async () => {
  let held = null, t0 = 0;
  await withPage('?mute=1', async (page) => {
    await page.waitFor(ALERT, { timeout: 20000 });
    const o = await J(page, `(() => { const a = document.getElementById('sb-boot'); return { text: a.innerText, buttons: [...a.querySelectorAll('button')].map((b) => b.textContent) }; })()`);
    assert.ok(Date.now() - t0 >= 7000, `not before the 8 s mark (${Date.now() - t0} ms after the navigation)`);
    assert.match(o.text, /Skyblitz failed to load/); assert.match(o.text, /has not started after 8 seconds/); assert.deepEqual(o.buttons, ['Reload']);
    assert.ok(held, 'the request was held');
    await page.s('Fetch.continueRequest', { requestId: held });                  // the slow network finally delivers
    await page.waitFor(TITLE, { timeout: 60000 });
    assert.equal(await page.eval(ALERT), false, 'the soft message is withdrawn once the game is running');
  }, {
    wait: null, raw: true,
    setup: async (page) => {
      page.cdp.on((m) => { if (m.sessionId === page.sid && m.method === 'Fetch.requestPaused') held = m.params.requestId; });
      await page.s('Fetch.enable', { patterns: [{ urlPattern: '*src/race/items.js*', requestStage: 'Request' }] });
      t0 = Date.now();
    },
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

test('E-12: losing the WebGL context pauses the race and shows a notice; restoring it resumes; nothing throws', async () => {
  await withPage('?debug=1&autostart=1&mute=1&course=sunrise&seed=7', async (page) => {
    await page.waitFor("__sky.game.state === 'race' && __sky.game.simTime > 0.5", { timeout: 90000 });
    const snap = () => J(page, `(() => { const g = __sky.game; return { lost: g.contextLost, paused: g.paused, sim: g.simTime, frame: g.frame, notice: document.getElementById('sb-notice')?.innerText ?? null, screen: document.getElementById('ui').dataset.screen }; })()`);
    const before = await snap();
    assert.equal(before.lost, false); assert.equal(before.paused, false); assert.equal(before.notice, null);
    await page.eval("window.__ext = __sky.game.renderer.getContext().getExtension('WEBGL_lose_context'); __ext.loseContext(); 1");
    await page.waitFor('__sky.game.contextLost === true', { timeout: 5000 });
    await delay(300);
    const a = await snap(); await delay(800); const b = await snap();
    assert.equal(a.paused, true, 'the race is paused'); assert.equal(a.screen, 'pause');
    assert.match(a.notice, /Graphics context lost/);
    assert.equal(b.sim, a.sim, 'the simulation is frozen'); assert.equal(b.frame, a.frame, 'nothing is drawn into the dead context');
    await page.eval('__sky.game.setPaused(false); 1');
    assert.equal((await snap()).paused, true, 'resuming into a blank frame is refused');
    await page.eval('__ext.restoreContext(); 1');
    await page.waitFor('__sky.game.contextLost === false', { timeout: 10000 });
    await page.waitFor(`__sky.game.simTime > ${b.sim + 0.5}`, { timeout: 15000 });
    const c = await snap();
    assert.equal(c.paused, false, 'resumed'); assert.equal(c.notice, null, 'notice removed'); assert.ok(c.frame > b.frame + 10, 'drawing again');
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
    await delay(300);
    assert.equal(await page.eval('__sky.game.paused'), true);
    assert.equal(await page.eval("document.getElementById('sb-notice')"), null);
    assert.deepEqual(page.errors(), []);
  });
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
    const set = async (v) => { await page.s('Emulation.setEmulatedMedia', REDUCE(v)); await delay(150); };
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

// ---- V-35

const PROGRAM_LOGS = `(() => { window.__plogs = []; const P = WebGL2RenderingContext.prototype, o = P.getProgramInfoLog; P.getProgramInfoLog = function (p) { const l = o.call(this, p); if (l && l.length) window.__plogs.push(l.slice(0, 200)); return l; }; })()`;

for (const [course, quality] of [['sunrise', 'high'], ['redrock', 'high'], ['redrock', 'low']]) {
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

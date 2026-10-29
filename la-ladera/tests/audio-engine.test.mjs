// The audio engine in the real page (owner: A1): silent until a real gesture, dry (no device) under automation, the soundscape follows the place and
// the hour, volume and mode scale the master, and every way the browser can refuse us (no context, no worker, no sound at all) ends quietly.
// Quiet box: headless only, and NO real AudioContext is ever made here: the init script below swaps window.AudioContext for a stand-in built on an
// OfflineAudioContext (it renders nothing and never opens a device), counts constructions, and can be told to refuse (?acstub=refuse). It can also
// take the audio worker away (?acstub=noworker) or kill it at birth (?acstub=badworker), leaving every other Worker (Draco) alone.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-engine.test.mjs
// One group per boot; run a single group with --test-name-pattern="<word from its name>" (locked, gestured, selfTest, off, live, refused, workers, absent).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const STUB = `(() => {
  const q = location.search, st = window.__ac = { made: 0, engine: 0, refused: 0, engineRefused: 0 };
  const OAC = window.OfflineAudioContext;
  if (OAC) {
    class Fake extends OAC {
      constructor(o) {
        const mine = !!(o && o.latencyHint === 'interactive');                       // the engine's own call; the NPC babble's has no options
        if (/[?&]acstub=refuse/.test(q)) { st.refused++; if (mine) st.engineRefused++; throw new DOMException('refused by the test', 'NotAllowedError'); }
        super(2, 128, 44100); st.made++; if (mine) st.engine++;
      }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
    }
    window.AudioContext = Fake; window.webkitAudioContext = Fake;
  }
  const RW = window.Worker, m = q.match(/[?&]acstub=(noworker|badworker)/);
  if (RW && m) {
    window.Worker = class extends RW {
      constructor(url, o) {
        if (!/audio\\/worker\\.js/.test(String(url))) { super(url, o); return; }
        if (m[1] === 'noworker') throw new DOMException('workers are not allowed here', 'SecurityError');
        const dead = { postMessage() {}, terminate() {}, onmessage: null, onerror: null };
        setTimeout(() => { try { dead.onerror && dead.onerror({ message: 'boom', preventDefault() {} }); } catch (e) {} }, 30);
        return dead;
      }
    };
  }
})();`;

const T = { timeout: 420000 };
const CORE = ['bed:wind', 'bed:traffic', 'bed:murmur', 'bed:children', 'bed:crickets', 'bed:room', 'chime', 'tick', 'bell'];
const ready = (keys) => `${JSON.stringify(keys)}.every((k) => __ladera.ctx.audio.engine.bank.has(k))`;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const isQuiet = (m) => m === 'idle' || m === 'blocked';
let b, page;
const A = (expr, t) => page.eval(expr, t);
const boot = (q = '') => page.goto(`${b.baseUrl}/la-ladera/index.html?${q}`, { timeout: 300000 });
const gesture = async () => { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button: 'left', clickCount: 1 }); await tick(350); };
const clean = (what = '') => { const s = page.summary(); assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []], 'console must stay clean ' + what); };
/** Move, let the mix settle (about 2.4 s of game time), report what the engine says. */
const mixAt = (js) => A(`(() => { ${js}; for (let i = 0; i < 12; i++) __ladera.step(6, 1 / 30); const s = __ladera.ctx.audio.state();
  return { zone: s.zone, alt: s.alt, indoor: s.indoor, cutoff: s.bedCutoff, beds: s.beds, voices: s.voices.map((v) => v.kind), master: s.master }; })()`);
const sum = (beds) => ['wind', 'traffic', 'crickets', 'murmur', 'children'].reduce((a, k) => a + (beds[k] ?? 0), 0);
const SPAWN = '__ladera.teleport(-6.5, 92.5, { yaw: 0, pitch: 0 })', MIRADOR = '__ladera.teleport(26, -91, { yaw: 0, pitch: 0 })';

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = b.page;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
});
after(async () => { await b?.close(); });

// ---- before any gesture ---------------------------------------------------------------------------------------------------------------------------------
test('locked: before a real gesture nothing sounds (no AudioContext, script-made events and calls are ignored, console clean)', T, async () => {
  await boot('autostart&manual');
  const s0 = await A(`({ mode: __ladera.ctx.audio.state().mode, ua: navigator.userActivation.hasBeenActive, ac: window.__ac, context: __ladera.ctx.audio.context(), out: __ladera.ctx.audio.out })`);
  assert.equal(s0.ua, false, 'precondition: the page has had no real input');
  assert.ok(isQuiet(s0.mode), s0.mode); assert.equal(s0.context, null); assert.equal(s0.out, null); assert.equal(s0.ac.made, 0);
  const s1 = await A(`(() => {
    const a = __ladera.ctx.audio;
    a.unlock(); a.unlock(new Event('click'));
    for (const t of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'touchend']) window.dispatchEvent(new Event(t));      // plain events: no code, no key
    document.body.click(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    __ladera.ctx.events.emit('player:step', { surface: 'asphalt', speed: 2.6 }); __ladera.ctx.events.emit('player:land', { speed: 6, surface: 'concrete' });
    a.chime(); a.tick(); a.paper(); a.setVolume(0.5); a.setVolume(0.8); a.play('chime'); a.playAt('bell', 0, 0, 0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    for (let i = 0; i < 10; i++) __ladera.step(6, 1 / 30);
    return { mode: a.state().mode, ac: window.__ac, context: a.context(), out: a.out, ua: navigator.userActivation.hasBeenActive, shots: a.state().activeShots, ready: a.state().samples.ready };
  })()`);
  assert.equal(s1.ua, false, 'script-made events must not count as a gesture');
  assert.ok(isQuiet(s1.mode), 'a script cannot start the engine: ' + s1.mode); assert.equal(s1.context, null); assert.equal(s1.out, null);
  assert.equal(s1.ac.made, 0, 'no AudioContext may be constructed before a real gesture'); assert.equal(s1.shots, 0); assert.equal(s1.ready, 0, 'no samples are rendered before there is a use for them');
  clean('while locked');
});

// ---- the first real gesture: one boot, five checks --------------------------------------------------------------------------------------------------------
test('gestured: a real gesture starts the engine DRY under automation and the mix follows the player', T, async (t) => {
  await boot('autostart&manual');
  await gesture();

  await t.test('dry: no device, events counted, samples rendered in the worker, console clean', async () => {
    const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, ua: navigator.userActivation.hasBeenActive, context: !!a.context(), out: !!a.out, kind: a.engine.ac.constructor.name, engine: window.__ac.engine }; })()`);
    assert.equal(s.ua, true); assert.equal(s.mode, 'dry'); assert.equal(s.context, false, 'dry mode shares no context'); assert.equal(s.out, false);
    assert.equal(s.kind, 'OfflineAudioContext'); assert.equal(s.engine, 0, 'the engine itself must not construct an AudioContext under automation');
    await page.waitFor(ready(CORE), 90000);
    const st0 = await A('__ladera.ctx.audio.state().stats');
    await A('__ladera.teleport(-6.5, 92.5, { yaw: 0, pitch: 0 }); __ladera.walk(1, 0, 3)');                   // real footfalls from the player
    await A('__ladera.walk(0, 0, 0.7, { jump: true }); __ladera.walk(0, 0, 1.5)');                              // a jump and its landing
    const door = await A(`(() => { const c = __ladera.ctx; for (const [id, st] of c.archDoors.entries()) if (st.geo && st.kind !== 'arch') { __ladera.teleport(st.geo.cx + 2, st.geo.cz + 2); __ladera.step(2); c.events.emit('door:toggle', { doorId: id, open: true, by: 'player' }); return id; } return null; })()`);
    assert.ok(door, 'the scene has a door to open');
    await A('__ladera.ctx.audio.chime(); __ladera.ctx.audio.tick(); __ladera.ctx.audio.paper(); __ladera.ctx.events.emit("npc:talk", {}); __ladera.ctx.events.emit("npc:end", {})');
    const st1 = await A('__ladera.ctx.audio.state()');
    assert.ok(st1.stats.steps - st0.steps >= 4, `footsteps: ${st1.stats.steps - st0.steps}`);
    assert.ok(st1.stats.jumps - st0.jumps >= 1, 'jump'); assert.ok(st1.stats.lands - st0.lands >= 1, 'landing');
    assert.equal(st1.stats.doors - st0.doors, 1, 'the door in earshot'); assert.equal(st1.stats.chimes - st0.chimes, 1); assert.equal(st1.stats.ticks - st0.ticks, 1);
    assert.ok(st1.samples.ready >= 9 && st1.samples.via === 'worker', JSON.stringify(st1.samples));
    assert.ok(await A(`!!__ladera.ctx.audio.play('chime', { bus: 'uiBus' })`), 'a ready sample plays');
    assert.deepEqual(st1.errors, []); assert.deepEqual(st1.samples.errors, []);
    clean('after the first gesture');
  });

  await t.test('hour: crickets and a quiet street at night, traffic, talk and children by day', async () => {
    const night = await mixAt(`__ladera.setHour(2); ${SPAWN}`), noon = await mixAt('__ladera.setHour(12)');
    assert.equal(night.zone, 'plan'); assert.equal(noon.zone, 'plan');
    assert.ok(night.beds.crickets > 0.2 && noon.beds.crickets < 0.05, `crickets ${night.beds.crickets} / ${noon.beds.crickets}`);
    assert.ok(noon.beds.traffic > 0.4 && noon.beds.traffic > 2 * night.beds.traffic, `traffic ${noon.beds.traffic} / ${night.beds.traffic}`);
    assert.ok(noon.beds.murmur > 0.3 && night.beds.murmur < 0.1, `talk ${noon.beds.murmur} / ${night.beds.murmur}`);
    assert.ok(noon.beds.children > 0.1 && night.beds.children < 0.05, `children ${noon.beds.children} / ${night.beds.children}`);
    assert.ok(noon.voices.includes('school'), 'the school is audible from the street at noon: ' + noon.voices);
    assert.ok(!night.voices.includes('school'), 'and silent at 02:00: ' + night.voices);
  });

  await t.test('place: the ridge is wind and nothing else, the street is not', async () => {
    const street = await mixAt(`__ladera.setHour(12); ${SPAWN}`), ridge = await mixAt(MIRADOR);
    assert.notEqual(street.zone, ridge.zone); assert.equal(ridge.zone, 'ridge');
    assert.ok(ridge.beds.wind > 0.5 && ridge.beds.wind > 3 * street.beds.wind, `wind ${ridge.beds.wind} / ${street.beds.wind}`);
    assert.ok(ridge.beds.traffic < 0.1 && ridge.beds.murmur < 0.15, JSON.stringify(ridge.beds));
    assert.deepEqual(ridge.voices, [], 'nothing to hear at the mirador but the wind');
    assert.ok(ridge.alt > 0.8 && street.alt < 0.2, `altitude ${ridge.alt} / ${street.alt}`);
  });

  await t.test('indoors: stepping through a door closes the bed filter and lowers the outdoor beds', async () => {
    const e = await A(`(() => { const bp = __ladera.buildings().find((x) => x.entrances && x.entrances.length); const e = bp.entrances[0]; return { id: bp.id, inside: e.inside, outside: e.outside, yaw: e.yawIn ?? 0 }; })()`);
    const go = (p) => `__ladera.setHour(12); __ladera.teleport(${p[0]}, ${p[2]}, { y: ${p[1]}, yaw: ${e.yaw} })`;
    const out = await mixAt(go(e.outside)), inn = await mixAt(go(e.inside)), ctxt = JSON.stringify({ e, out, inn });
    assert.equal(out.indoor, 0, ctxt); assert.ok(out.cutoff > 10000, 'outside the filter is open: ' + out.cutoff);
    assert.equal(inn.indoor, 1, ctxt); assert.ok(inn.cutoff < 1500, 'inside it is closed: ' + inn.cutoff);
    assert.ok(sum(out.beds) > 0.2 && sum(inn.beds) < 0.6 * sum(out.beds), `outdoor beds ${sum(out.beds).toFixed(2)} outside, ${sum(inn.beds).toFixed(2)} inside`);
  });

  await t.test('volume and mode: slider, pause, title and silence scale the master', async () => {
    const master = async (js) => (await mixAt(js)).master, close = (a, c) => Math.abs(a - c) < 0.012;
    const mode = (m) => A(`__ladera.ctx.audio.engine.onMode({ mode: "${m}" })`);                       // the engine's own hook: nothing else reacts to it
    await A('__ladera.ctx.settings.set("volume", 0.5); __ladera.ctx.settings.set("volume", 0.8)'); await mode('play');
    const play = await master(SPAWN);
    assert.ok(close(play, Math.pow(0.8, 1.6) * 0.9), 'playing at 0.8: ' + play);
    await A('__ladera.ctx.settings.set("volume", 0.2)');
    assert.equal(await A('__ladera.ctx.audio.state().volume'), 0.2, 'the settings slider reaches the engine');
    assert.ok(close(await master('0'), Math.pow(0.2, 1.6) * 0.9), 'playing at 0.2');
    await A('__ladera.ctx.settings.set("volume", 0)');
    assert.equal(await master('0'), 0, 'volume 0 is silence');
    await A('__ladera.ctx.settings.set("volume", 0.8)');
    const m = {};
    for (const k of ['paused', 'panel', 'title', 'play']) { await mode(k); m[k] = await master('0'); }
    assert.ok(close(m.paused, play / 2) && close(m.panel, play / 2), `paused ${m.paused} panel ${m.panel} vs play ${play}`);
    assert.ok(close(m.title, play * 0.3), 'title ' + m.title); assert.ok(close(m.play, play), 'back to play ' + m.play);
    assert.deepEqual(await A('__ladera.ctx.audio.state().errors'), []);
    clean('while mixing');
  });
});

test('selfTest: four offline scenes through the real graph, no gesture and no device (finite, below full scale, the right character)', T, async () => {
  await boot('autostart&manual');
  const r = await A(`__ladera.ctx.audio.selfTest({ seconds: 2 }).then((r) => ({ ok: r.ok, scenes: r.scenes, samples: r.samples, mode: __ladera.ctx.audio.state().mode, made: window.__ac.made }))`, 240000);
  assert.equal(r.ok, true, JSON.stringify(r.scenes.filter((s) => !s.ok)));
  assert.ok(isQuiet(r.mode), 'a self test is not a gesture: ' + r.mode); assert.equal(r.made, 0);
  assert.deepEqual(r.scenes.map((s) => s.name), ['spawn-day', 'mirador-day', 'plaza-night', 'spawn-indoors']);
  const by = Object.fromEntries(r.scenes.map((s) => [s.name, s]));
  for (const s of r.scenes) {
    assert.equal(s.finite, true, s.name); assert.ok(s.peak > 0.05 && s.peak <= 1, `${s.name} peak ${s.peak}`);
    assert.ok(s.dbfs > -45 && s.dbfs < -8, `${s.name} level ${s.dbfs} dBFS`); assert.ok(s.ambDbfs > -50 && s.ambDbfs < -12, `${s.name} ambience ${s.ambDbfs} dBFS`);
    assert.ok(Math.abs(s.dc) < 0.01, `${s.name} DC offset ${s.dc}`); assert.deepEqual(s.errors, [], s.name);
  }
  assert.ok(by['mirador-day'].beds.wind > 0.5 && by['mirador-day'].beds.wind > 3 * by['mirador-day'].beds.traffic, 'the mirador is wind, not traffic: ' + JSON.stringify(by['mirador-day'].beds));
  assert.ok(by['plaza-night'].beds.crickets > 0.3 && by['plaza-night'].beds.crickets > 2 * by['plaza-night'].beds.murmur, 'the plaza at night is crickets: ' + JSON.stringify(by['plaza-night'].beds));
  assert.ok(by['spawn-day'].beds.traffic > 0.4, 'the street is busy by day: ' + JSON.stringify(by['spawn-day'].beds));
  assert.ok(by['spawn-day'].bedCutoff > 10000 && by['spawn-indoors'].bedCutoff < 1500, `indoors is dull: ${by['spawn-day'].bedCutoff} vs ${by['spawn-indoors'].bedCutoff}`);
  assert.deepEqual(r.samples.errors, []);
  clean('after selfTest');
});

// ---- the ways it can be switched off or refused -----------------------------------------------------------------------------------------------------
test('off: ?audio=0 switches the engine off for good (no context, no events, every call still safe)', T, async () => {
  await boot('autostart&manual&audio=0');
  await gesture();
  const r = await A(`(() => {
    const a = __ladera.ctx.audio, ev = __ladera.ctx.events;
    const un = a.unlock(); ev.emit('player:step', { surface: 'asphalt' }); ev.emit('door:toggle', { doorId: 'x', open: true });
    const calls = [a.chime(), a.tick(), a.paper(), a.play('chime'), a.playAt('bell', 0, 0, 0), a.ring(3)];
    a.setVolume(0.3); for (let i = 0; i < 6; i++) __ladera.step(6, 1 / 30);
    const st = a.state(); return { un, mode: st.mode, ctxState: st.ctxState, steps: st.stats.steps, ready: st.samples.ready, context: a.context(), engine: window.__ac.engine, calls: calls.map((c) => !!c), volume: st.volume };
  })()`);
  assert.equal(r.un, 'off'); assert.equal(r.mode, 'off'); assert.equal(r.ctxState, null); assert.equal(r.context, null); assert.equal(r.engine, 0);
  assert.equal(r.steps, 0, 'an off engine does not even listen'); assert.equal(r.ready, 0); assert.deepEqual(r.calls, [false, false, false, false, false, false]); assert.equal(r.volume, 0.3);
  clean('with audio off');
});

test('live: ?audio=live uses a real-mode context (here a stand-in): one context for any number of gestures, graph built, calls play, console clean', T, async () => {
  await boot('autostart&manual&audio=live');
  const before = await A('({ mode: __ladera.ctx.audio.state().mode, engine: window.__ac.engine })');
  assert.ok(isQuiet(before.mode)); assert.equal(before.engine, 0);
  await gesture(); await gesture();
  const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, engine: window.__ac.engine, context: !!a.context(), out: a.out?.constructor?.name, kind: a.context()?.constructor?.name, ctxState: st.ctxState, errors: st.errors }; })()`);
  assert.equal(s.mode, 'live'); assert.equal(s.engine, 1, 'two gestures, one context'); assert.equal(s.context, true); assert.equal(s.out, 'GainNode'); assert.equal(s.kind, 'Fake');
  await page.waitFor(ready(['chime', 'tick', 'bed:wind', 'bed:traffic']), 120000);
  const r = await A(`(() => {
    const a = __ladera.ctx.audio; for (let i = 0; i < 20; i++) __ladera.step(6, 1 / 30);
    const played = !!a.play('chime', { bus: 'uiBus' }), tick = !!a.tick(); a.setVolume(0.4);
    document.dispatchEvent(new Event('visibilitychange'));                                    // the tab-hidden handler of the live path
    for (let i = 0; i < 5; i++) __ladera.step(6, 1 / 30);
    const st = a.state(); return { played, tick, mode: st.mode, shots: st.activeShots, beds: Object.keys(st.beds), errors: st.errors, volume: st.volume };
  })()`);
  assert.equal(r.played, true); assert.equal(r.tick, true); assert.equal(r.mode, 'live'); assert.ok(r.shots >= 2, 'voices: ' + r.shots);
  assert.ok(['wind', 'traffic'].every((k) => r.beds.includes(k)), 'the beds start: ' + r.beds); assert.deepEqual(r.errors, []); assert.equal(r.volume, 0.4);
  clean('in live mode');
});

test('refused: a browser that refuses the AudioContext ends in "failed" (one attempt, no retry on later gestures, every call safe, console clean)', T, async () => {
  await boot('autostart&manual&audio=live&acstub=refuse');
  await gesture();
  const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, errors: st.errors, tries: window.__ac.engineRefused, context: a.context() }; })()`);
  assert.equal(s.mode, 'failed'); assert.equal(s.tries, 1); assert.equal(s.context, null); assert.ok(s.errors.some((e) => /unlock/.test(e) && /refused/.test(e)), JSON.stringify(s.errors));
  await gesture();
  const r = await A(`(() => {
    const a = __ladera.ctx.audio, ev = __ladera.ctx.events, un = a.unlock();
    ev.emit('player:step', { surface: 'wood' }); ev.emit('player:land', { speed: 5 }); a.chime(); a.tick(); a.paper(); a.setVolume(0.6); a.ring(2); a.play('chime'); a.playAt('bell', 1, 2, 3);
    for (let i = 0; i < 10; i++) __ladera.step(6, 1 / 30);
    return { un, mode: a.state().mode, tries: window.__ac.engineRefused, chimes: a.state().stats.chimes };
  })()`);
  assert.equal(r.un, 'failed'); assert.equal(r.mode, 'failed'); assert.equal(r.tries, 1, 'it does not keep knocking'); assert.equal(r.chimes, 1);
  clean('after a refused context');
});

test('workers: no audio Worker (or one that dies at birth) falls back to rendering on the main thread: same samples, no errors in the page', T, async () => {
  for (const stub of ['noworker', 'badworker']) {
    await boot(`autostart&manual&acstub=${stub}`);
    await gesture();
    await page.waitFor(ready(CORE), 120000);
    const s = await A('(() => { const st = __ladera.ctx.audio.state(); return { mode: st.mode, via: st.samples.via, ready: st.samples.ready, errors: st.errors, bankErrors: st.samples.errors }; })()');
    assert.equal(s.mode, 'dry', stub); assert.equal(s.via, 'main', stub); assert.ok(s.ready >= 9, `${stub}: ${s.ready}`); assert.deepEqual(s.errors, [], stub);
    if (stub === 'badworker') assert.ok(s.bankErrors.some((e) => /boom/.test(e)), 'the worker failure is recorded: ' + JSON.stringify(s.bankErrors)); else assert.deepEqual(s.bankErrors, [], stub);
    clean('with ' + stub);
  }
});

test('absent: the game still plays when ctx.audio is absent (start button, volume slider and a discovery chime all tolerate it)', T, async () => {
  await boot('manual');
  await A('__ladera.ctx.audio = undefined');
  await A('document.getElementById("start").click()'); await tick(300);
  await A('__ladera.ctx.settings.set("volume", 0.3)');
  await A('__ladera.ctx.events.emit("discover", { id: "audio-test-spot", name: "Prueba", en: "Test" })'); await tick(200);
  assert.equal(await A('__ladera.ctx.mode'), 'play'); assert.equal(await A('__ladera.ctx.errors.length'), 0);
  assert.equal(await A('__ladera.state().audio'), null);
  clean('without ctx.audio');
});

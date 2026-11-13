// End-to-end test of the simulator in headless Chromium (Playwright).
//   node tools/test_sim.mjs [--shots DIR] [--base URL]
// Serves the repo root with python3 -m http.server unless --base is given. Exits non-zero on failure.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/work/a5/node_modules/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('--shots', '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/work/a5/shots');
fs.mkdirSync(SHOTS, { recursive: true });
let BASE = arg('--base', null), server = null;
if (!BASE) { const port = 8130 + Math.floor(Math.random() * 50); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 900)); }
const URL0 = `${BASE}/glasgow-subway/tools/test_sim.html`;
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };

async function open(browser, query, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1000, height: 600 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('  [console.error]', m.text().slice(0, 200)); } });
  p.on('pageerror', (e) => { errors.push(e.message); console.log('  [pageerror]', e.message); });
  await p.goto(URL0 + '?pr=1&aa=0&' + query);
  await p.waitForFunction(() => window.__sim, null, { timeout: 90000 });
  if (/mode=/.test(query)) await p.waitForFunction(() => __sim.mode(), null, { timeout: 90000 });   // go() loads the station halls first
  await p.evaluate(() => __sim.loop(false)); // time is driven explicitly (swiftshader frames are slow)
  return p;
}
const shot = async (p, name) => { await p.evaluate(() => window.__sim.render()); await p.waitForTimeout(100); await p.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 180000 }); };
const ev = (p, fn, a) => p.evaluate(fn, a);
// Records every door sound the sim asks of its audio, tagged with the service whose event caused it ('player' / 'bg' - the other circle's train; '?' = anything else).
// The tags are listeners wrapped around each service's own, so call it again after anything that rebuilds the services (boarding the other train).
// `tag = false` only installs the recorder and defines window.__tagDoors(), for a test that must count the services' own listeners first.
const doorLog = (p, tag = true) => ev(p, (tagNow) => {
  const s = __sim.sim, A = s.audio; if (!window.__dl) { const D = window.__dl = { log: [], src: '?', orig: A.doors.bind(A) }; A.doors = (open, o) => { const r = D.orig(open, o); D.log.push({ src: D.src, open, played: r, gain: o && o.gain, pan: o && o.pan, lp: o && o.lp }); return r; }; }
  window.__tagDoors = () => { const D = window.__dl; for (const [name, svc] of [['player', s.svc], ['bg', s.bg && s.bg.svc]]) if (svc && !(svc.__tag && svc.listeners.includes(svc.__tag))) { svc.__tag = () => { D.src = name; }; svc.__untag = () => { D.src = '?'; }; svc.listeners.unshift(svc.__tag); svc.listeners.push(svc.__untag); } };
  if (tagNow) window.__tagDoors();
}, tag);

const browser = await chromium.launch(launch);
try {
  // ---------------------------------------------------------------- DRIVE: ATO lap
  let p = await open(browser, 'mode=drive&station=buchanan-street');
  ok('sim starts in drive mode at Buchanan Street', (await ev(p, () => __sim.state())).mode === 'drive' && (await ev(p, () => __sim.info())).nextName === 'Buchanan Street');
  await shot(p, '01_cab_platform');
  // manual: refuse doors when wrong side / moving; vigilance etc covered in unit tests. Open correct side at start.
  await doorLog(p);
  await ev(p, () => { __sim.svc().dwellT = 3; });
  await p.keyboard.press('o');
  await p.waitForTimeout(100);
  await ev(p, () => __sim.ff(4, 0.1));
  ok('doors open at platform on correct side (key O)', await ev(p, () => __sim.svc().doorsOpen));
  await ev(p, () => __sim.render());
  await shot(p, '02_cab_doors_open');
  // real key presses: close doors, power up
  await p.keyboard.press('p'); await ev(p, () => __sim.ff(4, 0.1));
  ok('doors close (key P)', await ev(p, () => __sim.svc().doorsClosed));
  const dl = await ev(p, () => window.__dl.log.filter((e) => e.src === 'player'));
  ok('sound: keys O and P give exactly one door-opening sound and one door-closing sound (the closing chime no longer doubles it), at cab level', dl.length === 2 && dl[0].open === true && dl[1].open === false && dl.every((e) => e.played && e.gain === 0.7 && e.pan === 0 && e.lp === 0), JSON.stringify(dl));
  await ev(p, () => { __sim.svc().dwellT = 100; }); await ev(p, () => __sim.ff(1, 0.1));
  await p.keyboard.press('w'); await p.keyboard.press('w'); await p.keyboard.press('w');
  await ev(p, () => __sim.ff(12, 0.1));
  ok('keyboard W applies power and train accelerates', (await ev(p, () => __sim.info())).kmh > 20, 'kmh=' + (await ev(p, () => __sim.info().kmh.toFixed(1))));
  await shot(p, '03_cab_tunnel_manual');
  // engage ATO and run a full lap
  await p.keyboard.press('a');
  const NEED = process.env.QUICK ? 2 : 15;
  const lap = await ev(p, (need) => {
    const s = __sim, svc = s.svc(); const arr = []; svc.on((t, d) => { if (t === 'arrive') arr.push({ idx: d.idx, err: d.err, ip: d.inPlatform }); });
    let g = 0, shotPending = false; window.__approachShot = false;
    while (arr.length < need && g++ < 400000) { s.ff(0.25, 0.1); }
    return { arr, t: svc.t, spads: svc.score.spads };
  }, NEED);
  ok('ATO lap: stops at all 15 stations', new Set(lap.arr.map((a) => a.idx)).size === NEED, 'stops=' + lap.arr.length);
  ok('ATO lap: every berthing within 1.0 m and inside the platform', lap.arr.every((a) => Math.abs(a.err) < 1 && a.ip), 'max|err|=' + Math.max(...lap.arr.map((a) => Math.abs(a.err))).toFixed(2));
  ok('ATO lap: no SPAD', lap.spads === 0);
  ok('lap time plausible (< 40 min sim)', lap.t < 2400, 't=' + lap.t.toFixed(0));
  // approach shot + station arrival
  await ev(p, () => { const s = __sim; let g = 0; while (s.svc().distToStop > 100 && g++ < 9999) s.ff(0.5, 0.1); });
  await shot(p, '04_cab_approach_station');
  await ev(p, () => { const s = __sim; let g = 0; while (!(s.svc().phase === 'station' && s.svc().doorsOpen) && g++ < 9999) s.ff(0.5, 0.1); });
  await shot(p, '05_cab_stopped_doors_open');
  // ---------------------------------------------------------------- STATION mode: step out
  const ctxKind = await ev(p, () => { __sim.sync(); return __sim.context() && __sim.context().kind; });
  ok('prompt offers to step out of the cab at the platform', ctxKind === 'stepout', String(ctxKind));
  await p.keyboard.press('e');
  await ev(p, () => __sim.ff(0.5, 0.1));
  ok('E steps out into explore mode', (await ev(p, () => __sim.mode())) === 'explore');
  await shot(p, '06_platform_stepped_out');
  // walk with real key presses toward the stairs: face the ramp (+z), hold W
  // platform -> stairs portal (hall stations: E at the exit marker fades to the foot of the stair/escalator ramp)
  const portalCtx = await ev(p, () => { const s = __sim, v = s.station(), pt = v.anchors.portals[0], w = s.walker(); w.place(pt.x, pt.z - Math.sign(pt.z || 1) * 1.0, 0); s.sync(); return s.context() && s.context().kind; });
  ok('platform offers the stairs at the exit marker', portalCtx === 'portal', String(portalCtx));
  await p.keyboard.press('e'); await p.waitForTimeout(900);
  const walk = await ev(p, () => {
    const s = __sim, w = s.walker(), inf = s.station().info; const out = {};
    s.setLook(Math.PI, 0); // facing +z up the ramp
    s.key('w', true); const t0 = { x: w.x, z: w.z }; for (let i = 0; i < 80; i++) s.tick(0.1); out.afterPlatform = { x: w.x, z: w.z, y: w.y };
    for (let i = 0; i < 160; i++) s.tick(0.1); out.afterRamp = { x: w.x, z: w.z, y: w.y }; out.Hc = inf.Hc; out.zc0 = inf.zc0;
    s.key('w', false); return out;
  });
  ok('walker is carried/climbs the ramp to the concourse', walk.afterRamp.y > walk.Hc - 0.6 || walk.afterRamp.z > walk.zc0 - 1, JSON.stringify(walk.afterRamp));
  await shot(p, '07_ramp_or_concourse');
  // concourse + info panels
  await ev(p, () => { const s = __sim, i = s.station().info; s.walker().place(i.rc, i.zc0 + 3, Math.PI); s.setLook(Math.PI, 0.02); s.walker().y = i.Hc; });
  await shot(p, '08_concourse');
  await ev(p, () => { const s = __sim, i = s.station().info; s.walker().place(i.rc + 5, i.zc0 + 10, Math.PI / 2 * -1); s.setLook(-Math.PI / 2, 0.02); s.walker().y = i.Hc; });
  await shot(p, '09_concourse_panel');
  // collision: cannot walk off the platform edge onto the track
  const edge = await ev(p, () => {
    const s = __sim, w = s.walker(), i = s.station().info; w.place(i.xe + i.S * 0.6, 0, 0);
    s.setLook(i.S > 0 ? Math.PI / 2 : -Math.PI / 2, 0); // face the track
    s.key('w', true); for (let k = 0; k < 40; k++) s.tick(0.1); s.key('w', false);
    return { x: w.x, y: w.y, xe: i.xe, S: i.S, PY: i.PY };
  });
  ok('platform edge blocks the walker (cannot fall onto the track)', Math.abs(edge.y - edge.PY) < 0.05 && (edge.S > 0 ? edge.x >= edge.xe - 0.02 : edge.x <= edge.xe + 0.02), JSON.stringify(edge));
  // exit to the street
  await ev(p, () => { const s = __sim, a = s.station().anchors; s.walker().place(a.exit.x, a.exit.z - 0.4, 0); s.walker().y = a.exit.y; s.sync(); });
  ok('exit landing offers the street', (await ev(p, () => __sim.context() && __sim.context().kind)) === 'street');
  await p.keyboard.press('e');
  await p.waitForFunction(() => __sim.mode() === 'street', null, { timeout: 20000 }).catch(() => {});
  ok('street scene entered', (await ev(p, () => __sim.mode())) === 'street');
  await p.waitForTimeout(500);
  await shot(p, '10_street');
  await ev(p, () => { __sim.setLook(Math.PI * 0.75, 0.05); });
  await shot(p, '11_street_look');
  await ev(p, () => { const s = __sim, w = s.walker(); const st = s.sim.street; w.place(st.stair.x - 2, st.stair.z + 0.5, 0); s.sync(); });
  ok('street offers descent', (await ev(p, () => __sim.context() && __sim.context().kind)) === 'descend');
  await p.keyboard.press('e');
  await p.waitForFunction(() => __sim.mode() === 'explore', null, { timeout: 20000 }).catch(() => {});
  ok('descended back into the station', (await ev(p, () => __sim.mode())) === 'explore');
  // ---------------------------------------------------------------- board again
  await ev(p, () => { const s = __sim; const inf = s.station().info; s.walker().place(inf.xe + inf.S * 1.4, 4, 0); });
  await ev(p, () => { const s = __sim; let g = 0; while (!(s.shuttle().state === 'dwell' && s.svc().doorsOpen) && g++ < 6000) s.ff(0.5, 0.1); });
  await ev(p, () => { const s = __sim; const inf = s.station().info; const sim = s.sim; const zc = sim._trainCentreZl(); s.walker().place(inf.xe + inf.S * 0.9, zc + sim.doorZ[3], 0); s.sync(); });
  await shot(p, '12_platform_train_doors');
  ok('prompt to board when train doors are open', (await ev(p, () => __sim.context() && __sim.context().kind)) === 'board');
  await p.keyboard.press('e');
  ok('boarding switches to ride mode', (await ev(p, () => __sim.mode())) === 'ride');
  await ev(p, () => { __sim.setLook(0, 0); __sim.walker().place(0.0, 2, 0); });
  await shot(p, '13_saloon');
  await ev(p, () => __sim.ff(25, 0.1));
  await shot(p, '14_saloon_moving');
  ok('train departs with passenger', (await ev(p, () => __sim.info())).kmh > 5 || (await ev(p, () => __sim.svc().idx)) !== 0);
  // alight at next stop
  await p.keyboard.press('n');
  await ev(p, () => { const s = __sim; let g = 0; while (!(s.svc().phase === 'station' && s.svc().doorsOpen) && g++ < 6000) s.ff(0.5, 0.1); s.walker().place(0.5, s.sim.doorZ[3], 0); s.sync(); });
  ok('alight prompt at next stop', (await ev(p, () => __sim.context() && __sim.context().kind)) === 'alight');
  await p.keyboard.press('e');
  ok('alighting returns to explore mode at the new station', (await ev(p, () => __sim.mode())) === 'explore');
  await shot(p, '15_alighted');
  // ride again, then take the driver's seat
  await ev(p, () => { const s = __sim; let g = 0; while (!(s.shuttle().state === 'dwell' && s.svc().doorsOpen) && g++ < 6000) s.ff(0.5, 0.1); const inf = s.station().info; const sim = s.sim; s.walker().place(inf.xe + inf.S * 0.9, sim._trainCentreZl() + sim.doorZ[3], 0); s.sync(); });
  await p.keyboard.press('e');
  await ev(p, () => { const s = __sim; s.walker().place(0, -(s.sim.trainLen / 2 - 2.5), 0); s.sync(); });
  ok('cab door prompt in the saloon', (await ev(p, () => __sim.context() && __sim.context().kind)) === 'cab');
  await p.keyboard.press('e');
  ok('E at the cab door -> drive mode (seamless)', (await ev(p, () => __sim.mode())) === 'drive' && !(await ev(p, () => __sim.svc().ato)));
  await ev(p, () => __sim.ff(2, 0.1)); await shot(p, '16_drive_after_cab');
  // pause menu + help
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); await shot(p, '17_menu');
  ok('pause menu opens with Esc', await ev(p, () => !!document.querySelector('.gs-modal') && getComputedStyle(document.querySelector('.gs-modal')).display === 'flex'));
  await p.keyboard.press('Escape'); await p.keyboard.press('h'); await p.waitForTimeout(200); await shot(p, '18_help');
  await p.keyboard.press('h');
  ok('overspeed / unit-tested rules wired (score object present)', typeof (await ev(p, () => __sim.info().score.total)) === 'number');
  // station teleport via API for all stations (builds every station without error)
  const built = await ev(p, async () => { const s = __sim; let n = 0; for (let i = 0; i < 15; i++) { const v = await s.stationView(i); if (v && v.info.hall) n++; } return n; });
  ok('all 15 station halls (A3 GLBs) load and build', built === 15, 'hall stations=' + built);
  // continuous rails: the hall's own rails must reach the tunnel rings (rings start at the hall's full extent)
  const gaps = await ev(p, async () => { const bad = []; for (let i = 0; i < 15; i++) { const r = await __sim.railExt(i); if (!r || r.z0 > -r.skipHalf - 0.001 + 0.15 || r.z1 < r.skipHalf - 0.15) bad.push(i + ':' + (r ? r.z0.toFixed(1) + '..' + r.z1.toFixed(1) : 'null')); } return bad; });
  ok('hall rails run out to where the tunnel rings start (no track gap, 15 stations)', gaps.length === 0, gaps.join(' '));
  // inner line
  await ev(p, () => __sim.go({ mode: 'drive', station: 'cowcaddens', line: 'inner' }));
  ok('inner circle drive starts', (await ev(p, () => __sim.state())).line === 'inner');
  await ev(p, () => { __sim.svc().dwellT = 100; __sim.ato(true); __sim.ff(30, 0.1); });
  await shot(p, '19_inner_tunnel');
  // mouse look: handlers attached; locked movementX/Y rotates yaw/pitch (sensitivity + invert-Y honoured); drag-to-look fallback; arrow keys still work
  const m0 = await ev(p, () => { __sim.setLook(0, 0); __sim.mouseSet({ sens: 1, invertY: false }); return __sim.mouse(); });
  const m1 = await ev(p, () => { __sim.mouseMove(100, 50, true); return __sim.mouse(); });
  const m2 = await ev(p, () => { __sim.setLook(0, 0); __sim.mouseSet({ sens: 2, invertY: true }); __sim.mouseMove(100, 50, true); const r = __sim.mouse(); __sim.mouseSet({ sens: 1, invertY: false }); return r; });
  ok('mouse look: handlers attached and pointer-lock movement turns the view (yaw/pitch, sensitivity, invert-Y)', m0.handlers && m1.yaw < -0.3 && m1.pitch < -0.1 && Math.abs(m2.yaw) > Math.abs(m1.yaw) * 1.8 && m2.pitch > 0.1, JSON.stringify([m0, m1, m2]));
  await ev(p, () => __sim.setLook(0, 0));
  const cb = await p.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(cb[0], cb[1]); await p.mouse.down(); await p.mouse.move(cb[0] + 80, cb[1] + 20, { steps: 4 }); await p.mouse.up();
  const m3 = await ev(p, () => { const r = __sim.mouse(); try { document.exitPointerLock(); } catch (e) {} return r; });
  ok('mouse look: clicking + moving the mouse on the view changes yaw (pointer lock or drag fallback)', Math.abs(m3.yaw) > 0.1, JSON.stringify(m3));
  await ev(p, () => __sim.setLook(0, 0)); await p.keyboard.down('ArrowLeft'); await ev(p, () => __sim.tick(0.3)); await p.keyboard.up('ArrowLeft');
  ok('mouse look: arrow-key look still works alongside', Math.abs((await ev(p, () => __sim.mouse())).yaw) > 0.1);
  // audio: silent immediately while the tab is hidden; manual mute is kept; nothing queued plays on return
  const au = await ev(p, async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms)), hide = (h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); };
    await __sim.audioStart(); await W(100); const a0 = __sim.audioState();
    hide(true); const a1 = __sim.audioState(); await W(150); const a1b = __sim.audioState(); __sim.audioSpeak('hello'); __sim.audioChime(); const a2 = __sim.audioState();
    hide(false); await W(250); const a3 = __sim.audioState();
    __sim.audioMute(true); await W(100); hide(true); await W(100); hide(false); await W(250); const a4 = __sim.audioState(); __sim.audioMute(false); await W(200); const a5 = __sim.audioState();
    return { a0, a1, a1b, a2, a3, a4, a5 }; });
  ok('audio: silent immediately when the tab is hidden (gain 0, context suspended, no speech, announcements dropped)', au.a1.hidden && au.a1.gain === 0 && au.a1b.ctx !== 'running' && !au.a1b.speaking && au.a2.blocked >= 2, JSON.stringify(au.a1b) + JSON.stringify(au.a2));
  ok('audio: resumes on return; manual mute is kept across hide/show', !au.a3.hidden && au.a3.gain > 0.5 && (au.a3.ctx === 'running' || au.a0.ctx !== 'running') && au.a4.muted && au.a4.gain === 0 && au.a5.gain > 0.5, JSON.stringify([au.a3, au.a4, au.a5]));
  // door sounds: the synthesised sounds (rendered offline and measured), then the engine's routing and gating
  const syn = await ev(p, async () => {
    const m = await import('/glasgow-subway/js/sim/audio.js'), SR = 22050, out = {}, envs = {};
    const track = (x, f) => { const N = 512, w = 2 * Math.cos(2 * Math.PI * f / SR), env = []; for (let s = 0; s + N <= x.length; s += 110) { let a = 0, b = 0; for (let i = 0; i < N; i++) { const c = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) + w * a - b; b = a; a = c; } env.push((a * a + b * b - w * a * b) / (N * N)); } return env; };   // Goertzel power of one tone, every 5 ms
    const runs = (env, thr) => { const r = []; let st = -1; env.forEach((v, i) => { if (v > thr && st < 0) st = i; if ((v <= thr || i === env.length - 1) && st >= 0) { r.push([st * 0.005, (i - st) * 0.005]); st = -1; } }); return r; };
    for (const k of ['doorOpen', 'doorClose', 'bong']) {
      const x = await m.renderSynth(k, k === 'bong' ? 2.4 : 3.4, SR); let pk = 0, bad = 0, tail = 0;
      for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (!isFinite(a)) bad++; pk = Math.max(pk, a); if (i > (k === 'bong' ? 2.3 : 2.9) * SR) tail = Math.max(tail, a); }
      envs[k] = track(x, m.BEEP_HZ); out[k] = { peak: +pk.toFixed(3), bad, tail: +tail.toFixed(5) };
      if (k === 'bong') { const e1 = track(x, 659.3), e2 = track(x, 523.3), at = (e, t) => Math.max(...e.slice(Math.floor(t / 0.005), Math.floor((t + 0.2) / 0.005))); out.bongTones = { hi0: at(e1, 0.05), lo0: at(e2, 0.05), hi1: at(e1, 0.5), lo1: at(e2, 0.5) }; }
    }
    const thr = 0.25 * Math.max(...envs.doorClose);   // a beep = a 2.1 kHz burst within 6 dB (power) of the closing sound's strongest
    for (const k of ['doorOpen', 'doorClose']) out[k].runs = runs(envs[k], thr).map((r) => r.map((v) => +v.toFixed(3)));
    return out;
  });
  const bst = syn.doorClose.runs.map((r) => r[0]), bgap = bst.slice(1).map((v, i) => v - bst[i]);
  ok('sound: the closing sound carries the warning beeps - 9 of them, 2.1 kHz, every 250 ms, across the 2.6 s the leaves take', syn.doorClose.runs.length === 9 && bgap.every((g) => Math.abs(g - 0.25) < 0.012) && bst[0] < 0.1 && bst[8] < 2.3, JSON.stringify(syn.doorClose.runs));
  ok('sound: the opening sound has no beeps', syn.doorOpen.runs.length === 0, JSON.stringify(syn.doorOpen.runs));
  ok('sound: every synthesised sound is finite, not clipped (peak 0.1 .. 0.95) and has died away before its buffer ends', ['doorOpen', 'doorClose', 'bong'].every((k) => syn[k].bad === 0 && syn[k].peak > 0.1 && syn[k].peak < 0.95 && syn[k].tail < 0.001), JSON.stringify(['doorOpen', 'doorClose', 'bong'].map((k) => [syn[k].peak, syn[k].tail])));
  ok('sound: the PA bell is a falling two-tone (E5 then C5)', syn.bongTones.hi0 > 20 * syn.bongTones.lo0 && syn.bongTones.lo1 > 20 * syn.bongTones.hi1, JSON.stringify(syn.bongTones));
  const eng = await ev(p, async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms)), hide = (h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); };
    const m = await import('/glasgow-subway/js/sim/audio.js'), o = {};
    const cold = new m.SimAudio(); o.cold = cold.doors(true); o.coldPlays = JSON.stringify(cold.plays); cold.dispose();
    const A = __sim.sim.audio; await __sim.audioStart(); await W(150); o.running = __sim.audioState().ctx;
    const base = Object.assign({}, A.plays), d = () => { const r = {}; for (const k of ['doorOpen', 'doorClose', 'bong']) r[k] = (A.plays[k] || 0) - (base[k] || 0); return r; };
    o.open = __sim.audioDoors(true); o.d1 = d(); o.last1 = A.last;
    o.close = __sim.audioDoors(false, { gain: 0.5, pan: -0.6, lp: 3000 }); o.d2 = d(); o.last2 = A.last;
    o.far = __sim.audioDoors(true, { gain: 0.01 }); o.d3 = d();
    A.chime('close'); A.chime('door'); o.d4 = d(); A.chime('vigil'); A.chime('trip'); o.d5 = d();
    __sim.audioBong(); o.d6 = d(); const b0 = A.blocked;
    hide(true); o.hOpen = __sim.audioDoors(true); o.hBong = __sim.audioBong(); o.d7 = d(); o.hBlocked = A.blocked - b0; hide(false); await W(250);
    __sim.audioMute(true); await W(100); o.mOpen = __sim.audioDoors(true); o.mBong = __sim.audioBong(); o.d8 = d(); __sim.audioMute(false); await W(150);
    o.back = __sim.audioDoors(false); o.d9 = d();
    __sim.audioSpeak('Next stop test'); o.t1 = A._speakT !== 0; o.d10 = d(); hide(true); o.t2 = A._speakT === 0; hide(false); await W(150);   // the bell is immediate, the voice follows after a pause - unless the tab is hidden in between
    const K = {}, c0 = A.cut; A.doors(true, { key: K }); const c1 = A.cut; A.doors(false, { key: K }); const c2 = A.cut; A.doors(true, { key: {} }); o.cut = [c1 - c0, c2 - c1, A.cut - c2];   // a train's doors reverse mid-sound: the running sound is cut, once; another train's is not
    o.samples = A.state().samples; o.loadErr = A.state().loadErr;
    return o;
  });
  ok('sound: before the first gesture the doors make no sound (and cost nothing)', eng.cold === false && eng.coldPlays === '{}');
  ok('sound: opening and closing play their own sounds, counted separately (synthesised unless a recording is listed in SAMPLES)', eng.running === 'running' && eng.open && eng.d1.doorOpen === 1 && eng.last1.name === 'doorOpen' && eng.close && eng.d2.doorClose === 1 && eng.last2.name === 'doorClose' && ['synth', 'sample'].includes(eng.last1.via) && Object.keys(eng.loadErr).length === 0, JSON.stringify([eng.d2, eng.last1, eng.samples, eng.loadErr]));
  ok('sound: the distance chain is passed through (level, pan, muffling), and a train too far away to hear is not even started', eng.last2.gain === 0.5 && eng.last2.pan === -0.6 && eng.last2.lp === 3000 && eng.far === false && eng.d3.doorOpen === 1, JSON.stringify([eng.last2, eng.far, eng.d3]));
  ok('sound: the old chime names still work - "close" and "door" give the closing and opening sounds; "vigil" and "trip" are left alone', eng.d4.doorClose === eng.d3.doorClose + 1 && eng.d4.doorOpen === eng.d3.doorOpen + 1 && eng.d5.doorClose === eng.d4.doorClose && eng.d5.doorOpen === eng.d4.doorOpen, JSON.stringify([eng.d3, eng.d4, eng.d5]));
  ok('sound: hidden tab - doors and PA bell are silenced (not queued) and counted as blocked; they work again on return', eng.d6.bong === 1 && eng.hOpen === false && eng.hBong === false && eng.hBlocked >= 2 && eng.d7.doorOpen === eng.d6.doorOpen && eng.d7.bong === eng.d6.bong && eng.back === true, JSON.stringify([eng.hBlocked, eng.d6, eng.d7]));
  ok('sound: manual mute silences the doors and the bell; unmuting restores them', eng.mOpen === false && eng.mBong === false && eng.d8.doorOpen === eng.d7.doorOpen && eng.d8.bong === eng.d7.bong && eng.d9.doorClose === eng.d8.doorClose + 1, JSON.stringify([eng.d7, eng.d8, eng.d9]));
  ok('sound: an announcement is the PA bell now and the voice after a pause; hiding the tab in between cancels the voice', eng.t1 && eng.d10.bong === eng.d9.bong + 1 && eng.t2);
  ok('sound: when a train\'s doors reverse while its sound is still running, that sound is cut short (once) - and another train\'s sound is left alone', JSON.stringify(eng.cut) === '[0,1,0]', JSON.stringify(eng.cut));
  // the recordings: they load, fit the door travel, sit level with the synthesised sounds they replace; a door event then plays the recording; a missing file leaves the synthesised sound in its place
  const rec = await ev(p, async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms)), m = await import('/glasgow-subway/js/sim/audio.js'), A = __sim.sim.audio, o = {};
    for (let n = 0; n < 200 && !(A.buf.doorOpen && A.buf.doorClose) && !Object.keys(A.loadErr).length; n++) await W(50);
    const loud = (d, w) => { let best = 0; for (let i = 0; i + w <= d.length; i += w / 10) { let e = 0; for (let j = 0; j < w; j++) e += d[i + j] * d[i + j]; best = Math.max(best, Math.sqrt(e / w)); } return best; };   // the loudest second's RMS
    for (const [k, name] of [['open', 'doorOpen'], ['close', 'doorClose']]) {
      const b = A.buf[name]; if (!b) { o[k] = null; continue; }
      const d = b.getChannelData(0), g = m.SAMPLES[name].gain, syn = await m.renderSynth(name); let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      o[k] = { dur: +b.duration.toFixed(3), ch: b.numberOfChannels, peak: +(peak * g).toFixed(3), dB: +(20 * Math.log10(loud(d, Math.round(b.sampleRate)) * g / loud(syn, 22050))).toFixed(1) };   // as played: its peak, and how much louder than the synthesised sound it replaces
    }
    A.doors(true, { gain: 1 }); o.lastOpen = A.last; A.doors(false, { gain: 1 }); o.lastClose = A.last; o.loadErr = A.state().loadErr;
    const keep = m.SAMPLES.doorOpen.file; m.SAMPLES.doorOpen.file = 'no-such-file.mp3';
    try { const B = new m.SimAudio(); await B.start(); for (let n = 0; n < 100 && !B.loadErr.doorOpen; n++) await W(50); o.missing = { err: !!B.loadErr.doorOpen, closeOk: !!B.buf.doorClose, played: B.doors(true, { gain: 1 }), via: B.last && B.last.via }; B.dispose(); }
    finally { m.SAMPLES.doorOpen.file = keep; }
    return o;
  });
  ok('sound: the recorded door sounds load and decode (one channel, as long as the 2.6 s the leaves take), and as played they sit level with the synthesised ones they replace (within 6 dB) with headroom to spare', !!rec.open && !!rec.close && Object.keys(rec.loadErr).length === 0 && [rec.open, rec.close].every((r) => r.ch === 1 && Math.abs(r.dur - 2.6) < 0.15 && r.peak > 0.15 && r.peak < 0.7 && Math.abs(r.dB) < 6), JSON.stringify([rec.open, rec.close, rec.loadErr]));
  ok('sound: with the recordings loaded, the door events play them', rec.lastOpen.via === 'sample' && rec.lastOpen.name === 'doorOpen' && rec.lastClose.via === 'sample' && rec.lastClose.name === 'doorClose', JSON.stringify([rec.lastOpen, rec.lastClose]));
  ok('sound: a recording that cannot be fetched leaves the synthesised sound in its place (and the other recording still loads)', rec.missing.err && rec.missing.closeOk && rec.missing.played && rec.missing.via === 'synth', JSON.stringify(rec.missing));
  // ?sfx=synth: the recordings are not even fetched, and the doors are the synthesised ones
  { const q = await open(browser, 'sfx=synth');
    const sy = await ev(q, async () => { const A = __sim.sim.audio, W = (ms) => new Promise((r) => setTimeout(r, ms)); await __sim.audioStart(); await W(600); const o = {}; A.update({ v: 12, traction: 1, brake: 0, curv: 0, inTrain: true, doorsOpen: false }); o.st = A.state(); A.doors(true, { gain: 1 }); o.last = A.last; return o; });
    ok('sound: ?sfx=synth keeps to the synthesised sounds (no recording is fetched or decoded - doors, rumble, whine or hiss - and no loop is started)', sy.st.ctx === 'running' && Object.values(sy.st.samples).every((v) => !v) && Object.keys(sy.st.loadErr).length === 0 && sy.st.loops.length === 0 && sy.last.via === 'synth' && sy.st.run && !sy.st.run.rumble.rec && !sy.st.run.motor.rec && !sy.st.run.hiss.rec, JSON.stringify(sy));
    await q.close(); }
  // the running sound: the recordings of the rumble, the motor's whine and the brake hiss load and decode, the loops are seamless in this browser, each sits level with the synthesised layer it replaces
  // (A-weighted - the way it was calibrated), and the engine drives them from the train
  const rn = await ev(p, async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms)), m = await import('/glasgow-subway/js/sim/audio.js'), A = __sim.sim.audio, o = {}, names = ['rumble', 'motor', 'brakeHiss1', 'brakeHiss2'];
    for (let n = 0; n < 240 && !names.every((k) => A.buf[k]) && !names.some((k) => A.loadErr[k]); n++) await W(50);
    o.loaded = Object.fromEntries(names.map((k) => [k, A.buf[k] ? { dur: +A.buf[k].duration.toFixed(3), ch: A.buf[k].numberOfChannels } : null])); o.loadErr = A.state().loadErr;
    const fft = (re, im) => { const n = re.length;
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } };
    // the A-weighted mean-square level (dB, relative - only differences between two sounds mean anything) of x[i0..i1), Hann-windowed
    const aLevel = (x, sr, i0, i1) => { const len = i1 - i0; let N = 1; while (N < len) N <<= 1; const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < len; i++) re[i] = x[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (len - 1)));
      fft(re, im); let e = 0;
      for (let k = 1; k < N / 2; k++) { const f = k * sr / N, f2 = f * f, a = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); e += (re[k] * re[k] + im[k] * im[k]) * a * a; }
      return 10 * Math.log10(e / (len * N) + 1e-30); };
    const snr = (d, a, b, n) => { let ea = 0, ed = 0; for (let i = 0; i < n; i++) { const u = d[a + i], w = d[b + i]; ea += u * u; ed += (u - w) * (u - w); } return +(10 * Math.log10(ea / Math.max(ed, 1e-20))).toFixed(1); };
    // loops: the buffer holds the cycle repeated either side of the loop points, and playing it round the loop reads exactly the samples it should - at this browser's own rate and at 48 kHz.
    // 'after' and 'before' compare a quarter second either side of the loop's end with the same quarter second either side of its start (they are one cycle apart, so they should be alike to within the
    // codec's noise); 'skew' is the same comparison deliberately 3 samples out, to show the comparison can tell. The browser's playback is rendered offline from part-way round the loop, through the loop
    // point and on into the next pass, and compared with the samples that should have been read; the lag (0, or 1 sample either way from how the start offset was rounded) must not change at the wrap.
    const lagged = (x, want, a, b) => { let best = { snr: -1e9, lag: 0 }; for (const lag of [-1, 0, 1]) { let ea = 0, ed = 0; for (let i = a; i < b; i++) { const w = want[i + lag]; if (w === undefined) continue; ea += w * w; ed += (x[i] - w) ** 2; } const v = 10 * Math.log10(ea / Math.max(ed, 1e-20)); if (v > best.snr) best = { snr: +v.toFixed(1), lag }; } return best; };
    const geo = async (k, b) => {
      const d = b.getChannelData(0), sr = b.sampleRate, [ls, le] = m.SAMPLES[k].loop, i0 = Math.floor(ls * sr), i1 = Math.floor(le * sr), P = i1 - i0, n = Math.round(0.25 * sr), kk = Math.floor(0.9 * P), wrap = P - kk;
      const c = new window.OfflineAudioContext(1, Math.round(1.3 * P), sr), s = c.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = ls; s.loopEnd = le; s.connect(c.destination); s.start(0, (i0 + kk) / sr);
      const x = (await c.startRendering()).getChannelData(0), want = new Float32Array(x.length); for (let i = 0; i < x.length; i++) want[i] = d[i0 + ((kk + i) % P)];
      return { sr, cycle: +(P / sr).toFixed(4), whole: ls * sr === i0 && le * sr === i1, after: snr(d, i1, i0, Math.min(n, b.length - i1 - 4)), before: snr(d, i1 - n, i0 - n, n), skew: snr(d, i1, i0 + 3, Math.min(n, b.length - i1 - 4)), pass1: lagged(x, want, 8, wrap - 8), pass2: lagged(x, want, wrap + 8, x.length - 8) };
    };
    o.geo = {};
    for (const k of ['rumble', 'motor']) if (A.buf[k]) {
      o.geo[k] = await geo(k, A.buf[k]);
      const bytes = await (await fetch('/glasgow-subway/audio/' + m.SAMPLES[k].file)).arrayBuffer();
      o.geo[k + '@48k'] = await geo(k, await new window.OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes));
    }
    // level against the synthesised layers: the same mix rendered both ways (the recordings only where given)
    const SR = 44100, base = { v: 12, traction: 0, brake: 0, curv: 0, inTrain: true, doorsOpen: false }, at = (a, b) => [Math.round(a * SR), Math.round(b * SR)], lv = {};
    if (A.buf.rumble) { const s0 = await m.renderRunning(base, { secs: 12, sr: SR, only: 'rumble' }), s1 = await m.renderRunning(base, { secs: 12, sr: SR, only: 'rumble', rec: { rumble: A.buf.rumble } }), [a, b] = at(2, 12); lv.rumble = +(aLevel(s1, SR, a, b) - aLevel(s0, SR, a, b)).toFixed(1); }
    if (A.buf.motor) { const st = Object.assign({}, base, { v: 6, traction: 1 }), s0 = await m.renderRunning(st, { secs: 7, sr: SR, only: 'motor' }), s1 = await m.renderRunning(st, { secs: 7, sr: SR, only: 'motor', rec: { motor: A.buf.motor } }), [a, b] = at(2, 7); lv.motor = +(aLevel(s1, SR, a, b) - aLevel(s0, SR, a, b)).toFixed(1); }
    { // the hiss: a full release of the synthesised hiss (gain 0.18) against each take as played at full strength, its loudest 0.45 s
      const h0 = await m.renderRunning({ v: 0, traction: 0, brake: 1, curv: 0, inTrain: true, doorsOpen: false }, { secs: 3, sr: SR, rel: 0.03, only: 'hiss' }), syn = aLevel(h0, SR, ...at(1.5, 1.95));
      for (const k of ['brakeHiss1', 'brakeHiss2']) if (A.buf[k]) { const buf = A.buf[k], d = buf.getChannelData(0), w = Math.round(0.45 * buf.sampleRate), g = m.SAMPLES[k].gain, x = new Float32Array(d.length); for (let i = 0; i < d.length; i++) x[i] = d[i] * g;
        let best = -1e9; for (let i = 0; i + w <= x.length; i += Math.round(0.05 * buf.sampleRate)) best = Math.max(best, aLevel(x, buf.sampleRate, i, i + w)); lv[k] = +(best - syn).toFixed(1); } }
    o.lv = lv;
    // the game's own engine: the recordings are running, and follow the train
    for (let i = 0; i < 20; i++) { __sim.tick(1 / 30); __sim.sync(); } await W(300); o.live = A.state(); o.liveV = __sim.sim.svc.train.v;   // (audio.update is called from sync(), not tick())
    return o;
  });
  ok('sound: the rumble and whine loops and both brake-hiss takes are fetched and decoded - one channel, of the length they were built to (10.84, 2.42, 0.75 and 1.5 s)', Object.keys(rn.loadErr).length === 0 && ['rumble', 'motor', 'brakeHiss1', 'brakeHiss2'].every((k) => rn.loaded[k] && rn.loaded[k].ch === 1) && Math.abs(rn.loaded.rumble.dur - 10.843) < 0.12 && Math.abs(rn.loaded.motor.dur - 2.417) < 0.12 && Math.abs(rn.loaded.brakeHiss1.dur - 0.75) < 0.12 && Math.abs(rn.loaded.brakeHiss2.dur - 1.5) < 0.12, JSON.stringify([rn.loaded, rn.loadErr]));
  { const g = rn.geo, row = (r) => r && r.whole && r.after > 18 && r.before > 18 && r.after - r.skew > 6 && r.pass1.snr > 40 && r.pass2.snr > 40 && r.pass1.lag === r.pass2.lag;
    ok('sound: each loop is the same cycle either side of its loop points (the encoder\'s padding is never in the loop) and the browser plays it round the loop point-for-point - here, and decoded for a 48 kHz sound card', ['rumble', 'motor', 'rumble@48k', 'motor@48k'].every((k) => row(g[k])), JSON.stringify(g)); }
  ok('sound: as played, each recording sits level with the synthesised layer it replaces (A-weighted, within 3 dB: rumble at 12 m/s, whine at 6 m/s under power, hiss for a full release)', ['rumble', 'motor', 'brakeHiss1', 'brakeHiss2'].every((k) => Math.abs(rn.lv[k]) < 3), JSON.stringify(rn.lv));
  ok('sound: in the game, the recorded rumble and whine are running (not their synthesised stand-ins) and the rumble\'s level and pitch have come off the moving train', rn.liveV > 1 && rn.live.loops.includes('rumble') && rn.live.loops.includes('motor') && !!rn.live.run && rn.live.run.rumble.rec && rn.live.run.motor.rec && rn.live.run.rumble.gain > 0 && rn.live.run.rumble.rate >= 0.5, JSON.stringify([rn.live.loops, rn.live.run, rn.liveV]));
  const dr = await ev(p, async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms)), m = await import('/glasgow-subway/js/sim/audio.js'), o = {}, cruise = { v: 12, traction: 0, brake: 0, curv: 0, inTrain: true, doorsOpen: false };
    const mk = async () => { const B = new m.SimAudio(); await B.start(); return B; };
    // a fresh engine of its own (the game would keep calling update): before the recordings are ready the synthesised layers play; once they are, they take over
    const B = await mk(); B.update(cruise); o.early = B.run; B.update(Object.assign({}, cruise, { brake: 1 }));
    for (let n = 0; n < 240 && !(B.loops.rumble && B.loops.motor && B.buf.brakeHiss1 && B.buf.brakeHiss2); n++) await W(50);
    const u = (st) => { B.update(Object.assign({}, cruise, st)); }, rd = () => ({ rum: B.loops.rumble.g.gain.value, rate: B.loops.rumble.src.playbackRate.value, mot: B.loops.motor.g.gain.value, mrate: B.loops.motor.src.playbackRate.value, sRum: B.rG.gain.value, sMot: B.mG.gain.value, sq: B.sG.gain.value });
    u({}); await W(1800); o.cruise = rd(); o.cruiseRun = B.run;
    u({ v: 6, traction: 1 }); await W(1800); o.accel = rd();
    u({ v: 0 }); await W(1800); o.stand = rd();
    u({ inTrain: false }); await W(1800); o.outside = rd();
    // brake: held at 1 for a while, then let off -> exactly one recorded hiss, then nothing more for a while
    u({ brake: 1 }); u({ brake: 1 }); const p0 = B.plays.brakeHiss || 0; u({ brake: 0.8 }); u({ brake: 0.5 }); u({ brake: 0.2 }); u({ brake: 0 });
    o.hiss = { fired: (B.plays.brakeHiss || 0) - p0, last: B.lastHiss }; B.dispose();
    // a file that cannot be fetched: its layer keeps its synthesised stand-in, the others are recordings
    const keep = m.SAMPLES.rumble.file, keep2 = m.SAMPLES.brakeHiss1.file, keep3 = m.SAMPLES.brakeHiss2.file;
    m.SAMPLES.rumble.file = 'no-such-file.mp3'; m.SAMPLES.brakeHiss1.file = 'no-such-file.mp3'; m.SAMPLES.brakeHiss2.file = 'no-such-file.mp3';
    try { const D = await mk(); for (let n = 0; n < 240 && !(D.loops.motor && D.loadErr.rumble && D.loadErr.brakeHiss1 && D.loadErr.brakeHiss2); n++) await W(50);
      D.update(Object.assign({}, cruise, { brake: 1 })); D.update(Object.assign({}, cruise, { brake: 0.5 })); await W(1500);
      o.missing = { err: [!!D.loadErr.rumble, !!D.loadErr.brakeHiss1, !!D.loadErr.brakeHiss2], rumbleLoop: !!D.loops.rumble, motorLoop: !!D.loops.motor, run: D.run, sRum: D.rG.gain.value, sMot: D.mG.gain.value, sHiss: D.hG.gain.value, fired: D.plays.brakeHiss || 0 }; D.dispose(); }
    finally { m.SAMPLES.rumble.file = keep; m.SAMPLES.brakeHiss1.file = keep2; m.SAMPLES.brakeHiss2.file = keep3; }
    return o;
  });
  ok('sound: until its recording has loaded a layer is its synthesised stand-in; once the loops run, the synthesised rumble and whine are faded out of the mix', !dr.early.rumble.rec && !dr.early.motor.rec && !dr.early.hiss.rec && dr.cruiseRun.rumble.rec && dr.cruiseRun.motor.rec && dr.cruise.sRum < 0.005 && dr.cruise.sMot < 0.002 && Math.abs(dr.cruise.rum - 0.39) < 0.02, JSON.stringify([dr.early, dr.cruise]));
  ok('sound: the loops follow the train - the rumble at 12 m/s is as recorded (rate 1) and at the calibrated level, slower and quieter as the train slows, silent at a standstill, a quarter as loud from outside', Math.abs(dr.cruise.rate - 1) < 0.03 && dr.accel.rum < dr.cruise.rum * 0.6 && dr.accel.rate < dr.cruise.rate - 0.2 && dr.stand.rum < 0.005 && Math.abs(dr.outside.rum - dr.cruise.rum * 0.25) < 0.01 && Math.abs(dr.outside.rate - dr.cruise.rate) < 0.03, JSON.stringify([dr.cruise, dr.accel, dr.stand, dr.outside]));
  ok('sound: the whine is loud under power, a murmur when coasting, and rises in pitch with speed', dr.accel.mot > 0.1 && dr.cruise.mot > 0.02 && dr.cruise.mot < dr.accel.mot * 0.4 && dr.accel.mrate > 0.7 && dr.accel.mrate < dr.cruise.mrate && dr.stand.mot < 0.005, JSON.stringify([dr.cruise, dr.accel, dr.stand]));
  ok('sound: letting the brake off plays one recorded hiss (not one per frame), at a strength that follows the brake it released', dr.hiss.fired === 1 && dr.hiss.last && /^brakeHiss[12]$/.test(dr.hiss.last.name) && dr.hiss.last.strength > 0.9 && dr.hiss.last.gain > 0.15, JSON.stringify(dr.hiss));
  ok('sound: a recording that cannot be fetched leaves its synthesised stand-in running (rumble, hiss) while the others stay recordings (whine)', JSON.stringify(dr.missing.err) === '[true,true,true]' && !dr.missing.rumbleLoop && dr.missing.motorLoop && !dr.missing.run.rumble.rec && dr.missing.run.motor.rec && !dr.missing.run.hiss.rec && dr.missing.sRum > 0.05 && dr.missing.sMot < 0.002 && dr.missing.sHiss > 0 && dr.missing.fired === 0, JSON.stringify(dr.missing));
  // camera sway: low-frequency only (< 2 Hz), small amplitude; no high-frequency head jitter
  const sw = await ev(p, () => { const s = __sim.sim, T = s.THREE, f = new T.Vector3(), q = new T.Quaternion(), ys = [], ls = []; const v0 = s.svc.train.v;
    for (let i = 0; i < 240; i++) { __sim.tick(1 / 30); __sim.sync(); s.trainView.eyeWorld(f, q); ys.push(s.camera.position.y - f.y); ls.push(Math.hypot(s.camera.position.x - f.x, s.camera.position.z - f.z)); }
    const hf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; let c = 0, mx = 0; for (let i = 1; i < a.length; i++) { if ((a[i] - m) * (a[i - 1] - m) < 0) c++; mx = Math.max(mx, Math.abs(a[i] - m)); } return { hz: c / 2 / 8, amp: mx }; };
    return { v0, y: hf(ys), l: hf(ls) }; });
  ok('camera sway is low-frequency and small (<= 2 Hz, <= 2 cm)', sw.v0 > 8 && sw.y.hz <= 2.2 && sw.y.amp <= 0.02, JSON.stringify(sw));
  await p.close();

  // ---------------------------------------------------------------- RIDE start + explore start + street per station
  p = await open(browser, 'mode=ride&station=kelvinhall');
  await ev(p, () => __sim.ff(10, 0.1)); await shot(p, '20_ride_start');
  ok('ride mode runs on ATO', (await ev(p, () => __sim.state())).mode === 'ride');
  const fovR = await ev(p, () => { const c = __sim.sim.camera; return { v: c.fov, a: c.aspect }; });
  ok('ride/walk field of view is wide (>= 85 deg vertical at 16:9)', fovR.v >= 85, JSON.stringify(fovR));
  // walk the whole 4-car train from the rear cab to the front cab
  const trainWalk = await ev(p, () => {
    const s = __sim, sim = s.sim, w = s.walker(); const half = sim.trainLen / 2 - 2.5;
    w.place(0, half - 0.5, 0); s.setLook(0, 0); const z0 = w.z; const seen = new Set();
    s.key('w', true); for (let i = 0; i < 400; i++) { s.tick(0.1); seen.add(sim.trainView.carAt(w.z)); } s.key('w', false);
    const zEnd = w.z;
    s.key('Shift', true); w.place(0, -half + 0.5, Math.PI); s.setLook(Math.PI, 0); s.key('w', true); for (let i = 0; i < 200; i++) s.tick(0.1); s.key('w', false); s.key('Shift', false);
    return { z0, zEnd, back: w.z, cars: seen.size, half, ncars: sim.trainView.cars.length };
  });
  ok('can walk the full length of the train through every car', trainWalk.zEnd < -trainWalk.half + 1 && trainWalk.cars === trainWalk.ncars, JSON.stringify(trainWalk));
  // people: real skinned-vertex audit (soles on the floor / seat, heads under the curved ceiling, inside the walls, no overlaps) + scale + eye height
  const au1 = await ev(p, () => { __sim.render(); __sim.render(); return __sim.peopleAudit(); });
  ok('saloon people: feet on floor/seat, heads below the ceiling profile, inside the walls, no overlaps', au1.checked >= 5 && au1.bad.length === 0, JSON.stringify(au1));
  const pi = await ev(p, () => { const w = __sim.walker(); w.sit = false; w.sitK = 0; w.place(0, w.z, 0); return __sim.peopleInfo(); });
  ok('people scale: every character <= 1.80 m (+2 cm for hair/arms), clips shared (idle/walk/sit/phone/talk/pole)', pi.maxH <= 1.82 && pi.chars >= 10 && ['idle', 'walk', 'sit', 'phone', 'talk', 'pole'].every((k) => pi.clips.includes(k)), JSON.stringify(pi));
  const bind = await ev(p, () => __sim.peopleBind());
  ok('every clip binds on all characters (53-bone rig) and on the LOD models', bind && bind.chars >= 20 && bind.miss === 0 && bind.lodMiss === 0, JSON.stringify(bind));
  const pf = await ev(p, () => __sim.peopleFit());
  ok('skirts / dresses / kilts are held off the thighs (every wearer fitted, LOD too, sane thigh radii, thigh skin slimmed, strength switch works) and no skin triangle joins a hand to a leg',
    pf && pf.rows.length >= 9 && pf.rows.every((r) => r.g >= 1 && r.gLod >= 1 && r.thigh >= 0.05 && r.thigh <= 0.14) && pf.rows.filter((r) => r.slim > 0).length >= 8 && pf.k1 === 1 && pf.k0 === 0 && pf.kEnd === 1 && pf.web === 0, JSON.stringify(pf));
  const af = await ev(p, () => __sim.armFit(3)), afWorst = af ? af.map((r) => r.worst).sort((a, b) => a - b) : [0];
  ok('arms hang outside the hips, skirts and coats: every character has turned-out arm clips (names and lengths unchanged), no clip the crowd plays buries a hand more than 4.5 cm (median < 1 cm; the unturned idle clip of the kilt / skirt wearers is 8+ cm deep), kid_bounce is not played',
    af && af.length >= 20 && af.every((r) => r.baked >= 6 && r.same && r.worst <= 4.5 && !r.names.includes('kid_bounce')) && afWorst[Math.floor(afWorst.length / 2)] < 1 &&
    ['girl_school_kilt', 'boy_kilt', 'teen_skirt', 'woman_mini'].every((id) => { const r = af.find((x) => x.id === id); return r && r.base >= 8; }), JSON.stringify(af && af.map((r) => r.id + ':' + r.baked + '/' + r.worst + '(' + r.base + ')')));
  ok('user eye height is 1.50-1.55 m standing', pi.eye >= 1.49 && pi.eye <= 1.555, 'eye=' + pi.eye.toFixed(3));
  const sitT = await ev(p, () => { const s = __sim, sim = s.sim, w = s.walker(), tv = sim.trainView; const rg = sim.walkable.cars[1].benchZRanges[0];
    let zs = null; for (let z = rg[0] + 0.4; z < rg[1] - 0.4; z += 0.1) if (!sim.saloon.people.some((q) => q.state === 'sit' && Math.abs(q.x) > 0.5 && Math.abs(q.z + tv.carInfo[tv.cars.indexOf(q.parent)].zc - z) < 0.8)) { zs = z; break; }
    if (zs == null) return { skip: true };
    w.place(0.1, zs, 0); s.key('c', true); s.key('c', false); s.tick(1.0); const seated = { sit: w.sit, x: w.x, eye: w.eyeY() - w.y };
    s.key('c', true); s.key('c', false); s.tick(1.0); return { seated, up: { sit: w.sit, x: w.x, eye: w.eyeY() - w.y } }; });
  ok('C sits on a free bench (eye ~1.13 m, facing across) and stands up again', sitT.skip || (sitT.seated.sit && Math.abs(Math.abs(sitT.seated.x) - 0.74) < 0.02 && sitT.seated.eye > 1.08 && sitT.seated.eye < 1.2 && !sitT.up.sit && sitT.up.eye > 1.49), JSON.stringify(sitT));
  // double (bi-parting) doors: open ~1.2 m clear, hold while someone stands in the doorway, then close
  const dd = await ev(p, () => { const s = __sim, svc = s.svc(); let g = 0; while (svc.phase !== 'station' && g++ < 4000) s.ff(1, 0.1); s.ff(1, 0.1); if (!svc.doorsOpen) { svc.openDoors(svc.doorSel, true); s.ff(4, 0.05); } s.sync(); const v1 = s.doorLeaves(); svc.closeDoors(); s.ff(4, 0.05); s.sync(); const v0 = s.doorLeaves(); return { v0, v1 }; });
  const gap = (v) => Math.abs(v.leaves[0][1] - v.leaves[0][0]);
  ok('train has double (two-leaf) doors that part ~1.2 m when open', dd.v0.double && Math.abs(gap(dd.v1) - gap(dd.v0) - 1.2) < 0.06, JSON.stringify(dd));
  const hold = await ev(p, () => { const s = __sim, sim = s.sim, w = s.walker(), svc = s.svc(); let g = 0; while (svc.phase !== 'station' && g++ < 4000) s.ff(1, 0.1); svc.openDoors(svc.doorSel, true); s.ff(4, 0.05); const sx = svc.doors.R > svc.doors.L ? 1 : -1;
    w.place(sx * 1.0, sim.doorZ[2], 0); svc.closeDoors(); s.tick(3); const held = { f: svc.doors.L + svc.doors.R, obs: svc.doorObstructed }; w.place(0, sim.doorZ[2] + 2, 0); s.tick(4); return { held, closed: svc.doorsClosed }; });
  ok('doors hold open while a passenger stands in the doorway, then close when clear', hold.held.obs && hold.held.f > 0.9 && hold.closed, JSON.stringify(hold));
  // every hall station, both circles: platform side matches the hall, exit portals lie on walkable platform
  p = await open(browser, 'mode=explore&station=partick');
  await ev(p, () => { __sim.ff(1, 0.1); __sim.render(); __sim.render(); });
  const cl0 = await ev(p, () => __sim.crowdClearance());
  ok('explore start: no one spawns within 2.5 m or in the near view cone of the walker', cl0.n > 5 && cl0.d >= 2.4 && cl0.front >= 3.4, JSON.stringify(cl0));
  p = await open(browser, 'mode=explore&station=buchanan-street');
  const portals = await ev(p, async () => {
    const s = __sim, out = [], stairs = [];
    for (const line of ['outer', 'inner']) {
      await s.go({ mode: 'explore', station: 'buchanan-street', line });
      for (let i = 0; i < 15; i++) {
        const v = await s.stationView(i), inf = v.info, w = s.walker();
        if (!inf.hall) { out.push(v.station.name + ': no hall'); continue; }
        if (!v.anchors.portals.length) out.push(v.station.name + ': no portal');
        for (const pt of v.anchors.portals) {
          w.setWorld(v.zones, v.obstacles); w.place(pt.x, pt.z, 0); if (w.heightAt(pt.x, pt.z, inf.PY) == null) out.push(v.station.name + ' portal off platform ' + pt.x.toFixed(1) + ',' + pt.z);
          // the way out is a real flight of steps: it must exist, rise through the ceiling, and be climbable with W held (pure walker maths, no teleport)
          const sg = pt.stair, tag = `${v.station.name}/${line}@${pt.z > 0 ? '+' : '-'}z`;
          if (!sg) { stairs.push(tag + ': no stairs'); continue; }
          if (sg.yTop - inf.PY < 2.8 || sg.yTop - inf.PY > 4.2) stairs.push(tag + ': odd rise ' + (sg.yTop - inf.PY).toFixed(2));
          w.setWorld(v.zones, v.obstacles); w.place(pt.x, pt.z - sg.dir * 3, sg.dir > 0 ? Math.PI : 0); let maxY = 0, off = 0;
          for (let k = 0; k < 420; k++) { w.update(0.033, 1, 0); maxY = Math.max(maxY, w.y); if (w.y > inf.PY + 0.4 && (w.x < sg.x0 - 0.02 || w.x > sg.x1 + 0.02)) off++; }
          if (maxY < sg.yTop - 0.2) stairs.push(tag + ': cannot climb (max y ' + maxY.toFixed(2) + ' of ' + sg.yTop.toFixed(2) + ')');
          if (off) stairs.push(tag + ': left the flight sideways');
          w.place(pt.x, pt.z - sg.dir * 3, sg.dir > 0 ? Math.PI : 0); for (let k = 0; k < 30; k++) w.update(0.033, -1, 0);   // backing off the foot must keep you on the platform
          if (Math.abs(w.y - inf.PY) > 0.02) stairs.push(tag + ': not back on the platform floor after reversing');
        }
        if (Math.abs(Math.abs(inf.xe) - 1.25) > 0.2) out.push(v.station.name + ' edge gap ' + inf.xe);
      }
    }
    return { out, stairs };
  });
  ok('every hall: platform edge matches the train and exit portals are walkable (both circles)', portals.out.length === 0, portals.out.slice(0, 4).join(' | '));
  ok('every hall, both circles: each way out is a real staircase, climbable with W held, rising through the vault', portals.stairs.length === 0, portals.stairs.slice(0, 4).join(' | '));
  const pa = await ev(p, async () => { const bad = []; for (const id of ['govan', 'buchanan-street', 'cessnock', 'kelvinhall', 'st-enoch', 'hillhead']) { await __sim.go({ mode: 'explore', station: id, line: 'outer' }); __sim.render(); __sim.render(); const cl = __sim.crowdClearance(); if (cl.n > 3 && (cl.d < 2.4 || cl.front < 3)) bad.push(id + ': spawned ' + cl.d.toFixed(2) + ' m from the walker (front ' + cl.front.toFixed(1) + ')'); __sim.ff(8, 0.1); __sim.render(); __sim.render(); const a = __sim.peopleAudit(); if (a.platform < 3 || a.bad.length) bad.push(id + ':' + a.platform + ':' + a.bad.slice(0, 2).join(';')); } return bad; });
  ok('platform crowds (6 halls): nobody spawns within 2.4 m / the near view cone of the walker; soles on the platform, nobody inside furniture or each other', pa.length === 0, pa.join(' | '));
  // phones: some of the people waiting are on one (typing, or a call), the phone in the right hand where the hold put it and the wrists on their targets; nobody is who should not be (children, staff, anyone
  // on the move); setPhones(false) - what ?phones=0 does from the start - puts every one away, and setPhones(true) lets them take them out again
  const pho = await ev(p, async () => {
    const s = __sim.sim, o = { samples: 0, people: 0, holding: 0, text: 0, call: 0, steady: 0, shown: 0, strayed: 0, kids: 0, staff: 0, moving: 0, dead: 0, maxStray: 0, maxHand: 0, maxMiss: 0, maxFlex: 0, maxReach: 0 }, run = (sec) => { for (let i = 0; i < sec * 10; i++) { s.tick(0.1); s.sync(0.1); } };
    for (const id of ['govan', 'buchanan-street', 'cessnock', 'kelvinhall', 'st-enoch', 'hillhead']) {
      await __sim.go({ mode: 'explore', station: id, line: 'outer' }); __sim.render();
      for (let k = 0; k < 4; k++) {
        run(5); const a = __sim.phoneAudit(); o.samples++;
        for (const f of ['people', 'holding', 'text', 'call', 'steady', 'shown', 'strayed', 'kids', 'staff', 'moving', 'dead']) o[f] += a[f];
        for (const f of ['maxStray', 'maxHand', 'maxMiss', 'maxFlex', 'maxReach']) o[f] = Math.max(o[f], a[f]);
      }
    }
    __sim.phones(false); run(3); const off = __sim.phoneAudit();   // the platform's crowd and the riders' (each train's saloon is a crowd of its own)
    __sim.phones(true); run(25); const on = __sim.phoneAudit();
    return { o, off, on };
  });
  ok('phones: people on the platform hold them (typing and calling), the phone in the hand where the hold put it, wrists on their targets', pho.o.people > 100 && pho.o.holding >= 10 && pho.o.text > 0 && pho.o.call > 0 && pho.o.steady > 0 && pho.o.strayed === 0 && pho.o.maxMiss < 0.03 && pho.o.maxFlex < 150 && pho.o.maxReach < 0.95 && pho.o.dead === 0, JSON.stringify(pho.o));
  ok('phones: no child, no member of staff and nobody on the move is ever on one', pho.o.kids === 0 && pho.o.staff === 0 && pho.o.moving === 0, JSON.stringify({ kids: pho.o.kids, staff: pho.o.staff, moving: pho.o.moving }));
  ok('phones: setPhones(false) puts every phone away (none held, none shown), setPhones(true) brings them back', !pho.off.phonesOn && pho.off.holding === 0 && pho.off.shown === 0 && pho.on.phonesOn && pho.on.holding > 0, JSON.stringify({ off: pho.off, on: pho.on }));
  await p.close();
  // ---------------------------------------------------------------- the stairs for real: climb with W through the full sim, reach the ticket hall, come back down
  p = await open(browser, 'mode=explore&station=shields-road&line=outer');
  const climb = await ev(p, async () => {
    const s = __sim.sim, v = s.activeStation, pt = v.anchors.portals[0], w = s.walker, dir = pt.stair.dir, out = { ctxFoot: null };
    w.place(pt.x, pt.z - dir * 1.0, dir > 0 ? Math.PI : 0); s.look.yaw = w.yaw; s.tick(0.033); s.sync(0.033); out.ctxFoot = s.context && s.context.kind;
    w.place(pt.x, pt.z - dir * 4, dir > 0 ? Math.PI : 0); s.look.yaw = w.yaw; s.keys.add('w'); let maxY = 0, n = 0;
    while (n++ < 1500 && !s.fadeLock) { s.tick(0.033); s.sync(0.033); maxY = Math.max(maxY, w.y); }
    s.keys.delete('w'); out.maxY = maxY; out.top = pt.stair.yTop; out.fade = s.fadeLock; out.t = n * 0.033; return out;
  });
  ok('walking up the stairs reaches the top and hands over to the ticket hall (and a flight is offered 1 m before its foot)', climb.fade && climb.maxY > climb.top - 0.3 && climb.ctxFoot === 'portal', JSON.stringify(climb));
  await p.waitForTimeout(1200);
  const down = await ev(p, async () => { const s = __sim.sim; for (let i = 0; i < 10; i++) { s.tick(0.033); s.sync(0.033); } const a = { x: s.walker.x, y: s.walker.y }; await __sim.platform(); await new Promise((r) => setTimeout(r, 900)); for (let i = 0; i < 10; i++) { s.tick(0.033); s.sync(0.033); } const w = s.walker, pt = s.activeStation.anchors.portals[0]; return { access: a, x: w.x, z: w.z, y: w.y, pt: [pt.x, pt.z], PY: s.activeStation.info.PY }; });
  ok('coming back down from the ticket hall lands on the platform beside the foot of the stairs, facing away', Math.abs(down.y - down.PY) < 0.02 && Math.abs(down.x - down.pt[0]) < 0.3 && Math.abs(down.z - down.pt[1]) < 3, JSON.stringify(down));
  await ev(p, () => { const s = __sim.sim, pt = s.activeStation.anchors.portals[0], yaw = pt.stair.dir > 0 ? Math.PI : 0; s.walker.place(pt.x, pt.z - pt.stair.dir * 3.2, yaw); s.look.yaw = yaw; s.look.pitch = 0.12; s.tick(0.033); s.sync(0.033); });
  await shot(p, '24_stairs_platform');
  await p.close();
  // ---------------------------------------------------------------- rats on the track bed
  p = await open(browser, 'mode=explore&station=shields-road&line=outer');
  const rat = await ev(p, async () => {
    const s = __sim.sim, R = __sim.rats(); const out = {};
    let n = 0; while (s.shuttle.state !== 'wait' && n++ < 8000) { s.tick(0.1); s.sync(0.05); }
    { const inf = s.activeStation.info; s.walker.place((inf.xe + inf.xo) / 2, -12, 0); s.tick(0.05); s.sync(0.05); }   // mid-platform, far from the +z tunnel the test rats come out of
    const quiet = () => { s.shuttle.state = 'wait'; s.shuttle.timer = 400; if (s.bg && s.bg.sh) { s.bg.sh.state = 'wait'; s.bg.sh.timer = 400; s.bg.mode = 'shuttle'; } };
    quiet(); R.clear(); R.gap = 1e9; const r = R.spawn(0, 1); const seen = new Set(); let bad = 0, t = 0, vmax = 0, vrun = 0, amax = 0, prevV = 0, prevSt = '';
    while (R.rats.includes(r) && t < 120) { quiet(); s.tick(0.05); s.sync(0.05); t += 0.05; seen.add(r.state); if (![r.x, r.z, r.yaw, r.speed].every(isFinite) || Math.abs(r.x) > 6 || Math.abs(r.z) > 34) bad++;
      vmax = Math.max(vmax, r.speed); if (r.state === 'run') vrun = Math.max(vrun, r.speed); if (r.state === prevSt) amax = Math.max(amax, Math.abs(r.speed - prevV) / 0.05); prevV = r.speed; prevSt = r.state; }
    out.life = { seen: [...seen], gone: !R.rats.includes(r), t: +t.toFixed(1), bad }; out.pace = { vrun: +vrun.toFixed(2), vmax: +vmax.toFixed(2), amax: +amax.toFixed(1) };
    // the scheduler lets a visit happen now and then while the tracks are quiet (and never twice at once beyond a pair)
    R.clear(); R.gap = 5; const v0 = R.stats.spawned; let maxLive = 0; for (let i = 0; i < 4000; i++) { quiet(); s.tick(0.1); s.sync(0.1); maxLive = Math.max(maxLive, R.rats.length); }
    out.visits = R.stats.spawned - v0; out.maxLive = maxLive;
    // never one on a track while that track's train is in: run the real shuttle cycle for a few minutes and watch
    R.clear(); R.gap = 3; s.shuttle.state = 'wait'; s.shuttle.timer = 30; let viol = 0, trains = 0, lastSt = '', worst = '';
    for (let i = 0; i < 6000; i++) { s.tick(0.1); s.sync(0.1); const st = s.shuttle.state; if (st !== lastSt) { if (st === 'arriving') trains++; lastSt = st; }
      if (st === 'dwell' || st === 'leaving') for (const q of R.rats) if (q.track === 0) { viol++; worst = st + ' z=' + q.z.toFixed(1); }
      if (st === 'arriving' && s.svc.distToStop < 60) for (const q of R.rats) if (q.track === 0) { viol++; worst = 'arriving ' + s.svc.distToStop.toFixed(0) + ' m out, z=' + q.z.toFixed(1); }
      const bst = s.bg && s.bg.mode === 'shuttle' && s.bg.sh ? s.bg.sh.state : null;      // the other circle's train, on the other track
      if (bst === 'dwell' || bst === 'leaving' || (bst === 'arriving' && s.bg.svc.distToStop < 60)) for (const q of R.rats) if (q.track === 1) { viol++; worst = 'other track, ' + bst + ' z=' + q.z.toFixed(1); } }
    out.viol = viol; out.trains = trains; out.worst = worst;
    return out;
  });
  ok('a rat runs out of a tunnel, sniffs about, bolts back into the tunnel and is gone (no NaN, stays in the pit)', rat.life.gone && rat.life.seen.includes('sniff') && rat.life.seen.includes('bolt') && rat.life.bad === 0, JSON.stringify(rat.life));
  ok('rats move at a rat\'s speeds: pottering at most 1.3 m/s, flat out at most 3 m/s (they were 2.5 and 4.7), never starting or stopping faster than 15 m/s^2', rat.pace.vrun <= 1.31 && rat.pace.vmax <= 3.05 && rat.pace.vmax >= 2 && rat.pace.amax <= 15, JSON.stringify(rat.pace));
  ok('rats visit now and then while the tracks are quiet (>=3 visits in 400 s, at most 3 out at once)', rat.visits >= 3 && rat.maxLive <= 3, `visits=${rat.visits} maxLive=${rat.maxLive}`);
  ok('no rat is ever on a track while its train is in the station or within 60 m of it', rat.viol === 0 && rat.trains >= 2, `viol=${rat.viol} trains=${rat.trains} ${rat.worst}`);
  await p.close();
  // ---------------------------------------------------------------- both circles' trains carry passengers (island platform: the other circle's train stands across the platform)
  p = await open(browser, 'mode=explore&station=kinning-park&line=outer');
  await doorLog(p, false);
  // the riders first, while both trains stand in the station together as they do when the page opens
  const salA = await ev(p, () => {
    const s = __sim.sim; let n = 0; while (!(s.bg.sh && s.bg.sh.state === 'dwell') && n++ < 20000) { s.tick(0.1); s.sync(0.05); }
    for (let i = 0; i < 20; i++) { s.tick(0.05); s.sync(0.05); }   // (the other train is seated a car a frame)
    const before = __sim.saloons(), audit = __sim.peopleAudit();
    return { bgDwell: s.bg.sh.state === 'dwell', line0: s.line, before, audit: { bad: audit.bad, trains: audit.trains } };
  });
  const trains = Object.values(salA.before);
  ok('the other circle\'s train carries passengers too: every car of BOTH trains has riders, and the ones in view are shown', salA.bgDwell && trains.length === 2 && trains.every((t) => t.built && t.perCar.length === 4 && t.perCar.every((c) => c >= 1) && (!t.trainVisible || t.shown.every((c, i) => c >= 1 || t.near[i] === 0))), JSON.stringify(salA.before));   // a car with nobody inside the crowd's view range (a train still pulling in or away) is rightly undrawn
  ok('riders of both circles pass the people audit (feet, seats, ceiling, walls, overlaps)', salA.audit.bad.length === 0 && Object.keys(salA.audit.trains).length === 2, JSON.stringify(salA.audit));
  // phones on the train: a rider on one (seated) has it where the hold put it; no child and no member of staff has one
  const salP = await ev(p, () => {
    const s = __sim.sim, o = { samples: 0, people: 0, holding: 0, sit: 0, steady: 0, strayed: 0, kids: 0, staff: 0, moving: 0, dead: 0, maxStray: 0, maxHand: 0, maxMiss: 0, maxFlex: 0, maxReach: 0 };
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < 40; i++) { s.tick(0.05); s.sync(0.05); }   // a couple of seconds of the riders' lives between samples
      const a = __sim.phoneAudit(); o.samples++;
      for (const f of ['people', 'holding', 'sit', 'steady', 'strayed', 'kids', 'staff', 'moving', 'dead']) o[f] += a[f];
      for (const f of ['maxStray', 'maxHand', 'maxMiss', 'maxFlex', 'maxReach']) o[f] = Math.max(o[f], a[f]);
    }
    return o;
  });
  ok('phones on the train: whoever holds one (seated) has it where the hold put it, the arms inside what arms can do; no child, no member of staff', salP.people > 0 && salP.strayed === 0 && salP.kids === 0 && salP.staff === 0 && salP.dead === 0 && salP.maxMiss < 0.03 && salP.maxFlex < 150 && salP.maxReach < 0.95, JSON.stringify(salP));
  // sound at the island platform: the other circle's train opens and closes its doors across the platform, and you hear it - from its doorways, to the left or right, fainter with distance
  const kps = await ev(p, async () => {
    const s = __sim.sim, T = s.THREE, o = {}, m = await import('/glasgow-subway/js/sim/audio.js');
    await __sim.audioStart(); await new Promise((r) => setTimeout(r, 100));
    let n = 0; while (s.bg.sh && s.bg.sh.state === 'dwell' && n++ < 20000) { s.tick(0.1); s.sync(0.05); }          // let the dwell it is in run out ...
    n = 0; while (!(s.bg.sh && s.bg.sh.state === 'dwell') && n++ < 40000) { s.tick(0.1); s.sync(0.05); }          // ... and catch the next one from its start
    o.dwell = s.bg.sh.state === 'dwell'; o.listeners = s.bg.svc.listeners.length;   // (counted before the test tags it)
    const D = window.__dl; window.__tagDoors(); const i0 = D.log.length;
    n = 0; while (!D.log.some((e, i) => i >= i0 && e.src === 'bg' && !e.open) && n++ < 3000) { s.tick(0.1); s.sync(0.05); }   // its dwell: the doors open by themselves, then close
    o.bg = D.log.slice(i0).filter((e) => e.src === 'bg');
    // where you stand decides how it arrives. First straight above the first doorway of the platform side, 2 m .. 150 m up
    const tv = s.bg.view, side = s.bg.svc.platSide, list = side > 0 ? tv.doorsR : tv.doorsL, cam = s.camera, P = new T.Vector3(); list[0].leaves[0].n.getWorldPosition(P); o.nDoors = list.length;
    const at = (pos) => { cam.position.copy(pos); cam.updateMatrixWorld(true); const i = D.log.length, r = __sim.doorSound(tv, false, true, side); return { r, n: D.log.length - i, e: D.log[D.log.length - 1] }; };
    o.rise = [2, 20, 60, 150].map((h) => { const x = at(P.clone().add(new T.Vector3(0, h, 0))); return { h, played: x.r, n: x.n, gain: x.e.gain, lp: x.e.lp, want: m.reach(h), ear: __sim.trainEar(tv, side).dist }; });
    // ... then 5 m out from that doorway on the platform side, turned so that it is on the right / on the left / straight ahead
    const car = tv.cars[Math.floor(tv.cars.length / 2)].matrix.elements, u = new T.Vector3(car[0], 0, car[2]).normalize().multiplyScalar(side), out = P.clone().add(u.clone().multiplyScalar(5));
    const turn = (rx, rz) => { cam.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(-rz, rx)); };
    turn(-u.x, -u.z); o.onRight = at(out).e; turn(u.x, u.z); o.onLeft = at(out).e; turn(-u.z, u.x); o.ahead = at(out).e;
    return o;
  });
  const kOpen = kps.bg.filter((e) => e.open), kClose = kps.bg.filter((e) => !e.open);
  ok('sound: the other circle\'s train opens and closes its doors once each while it stands at the island platform, and both are heard (one listener wires its doors to the speakers)', kps.dwell && kps.listeners === 1 && kOpen.length === 1 && kClose.length === 1 && kps.bg.every((e) => e.played && e.gain > 0 && e.gain <= 1 && Math.abs(e.pan) <= 1 && isFinite(e.lp)), JSON.stringify(kps.bg));
  ok('sound: the level falls with distance from the doorway (full within 4 m, then inverse-ish), the highs go first, and nothing is started when it is out of earshot', kps.nDoors >= 4 && kps.rise.every((x) => x.n === 1 && Math.abs(x.ear - x.h) < 1e-6 && Math.abs(x.gain - x.want.gain) < 1e-9 && Math.abs(x.lp - x.want.lp) < 1e-6) && kps.rise[0].gain === 1 && kps.rise[0].lp === 0 && kps.rise[1].gain < 0.2 && kps.rise[2].gain < kps.rise[1].gain && kps.rise[2].lp < kps.rise[1].lp && kps.rise[3].played === false && kps.rise.slice(0, 3).every((x) => x.played), JSON.stringify(kps.rise));
  ok('sound: stereo position follows the doorway - on your right when it is on your right, on your left when on your left, centred straight ahead', kps.onRight.pan > 0.5 && kps.onLeft.pan < -0.5 && Math.abs(kps.ahead.pan) < 0.15, JSON.stringify([kps.onRight.pan, kps.onLeft.pan, kps.ahead.pan]));
  const sal = await ev(p, async () => {
    const s = __sim.sim; let n = 0; while (s.bg.sh && s.bg.sh.state === 'dwell' && n++ < 20000) { s.tick(0.1); s.sync(0.05); }
    n = 0; while (!(s.bg.sh && s.bg.sh.state === 'dwell') && n++ < 40000) { s.tick(0.1); s.sync(0.05); }   // the next time it stands in the station, doors open
    for (let i = 0; i < 20; i++) { s.tick(0.05); s.sync(0.05); }
    const uBg = s.bg.unit, uPl = s.tracks[s.line].unit;
    // riders now get on and off at every stop, so the counts are compared across the swap itself, not against the start of the test
    const pre = __sim.saloons(); await __sim.boardOther(); const post = __sim.saloons(); for (let i = 0; i < 20; i++) { s.tick(0.05); s.sync(0.05); }
    return { pre, post, after: __sim.saloons(), line1: s.line, mode: s.mode, listeners: [s.svc.listeners.length, s.bg.svc.listeners.length], units: { uBg, uPl, now: s.tracks[s.line].unit, bgNow: s.bg.unit } };
  });
  ok('boarding the other circle\'s train: each train keeps its riders (nobody vanishes or is re-seated)', sal.mode === 'ride' && sal.line1 !== salA.line0 && ['outer', 'inner'].every((l) => sal.post[l].total === sal.pre[l].total && sal.after[l].total >= 4) && sal.after[sal.line1].player, JSON.stringify({ pre: sal.pre, post: sal.post, after: sal.after }));
  ok('boarding the other circle\'s train: each unit stays the same train - you are now on the one that was on the other circle, and the one you left carries on under its own number', sal.units.uBg != null && sal.units.uPl != null && sal.units.uBg !== sal.units.uPl && sal.units.now === sal.units.uBg && sal.units.bgNow === sal.units.uPl, JSON.stringify(sal.units));
  // ... and the sounds follow the swap: each service has exactly one door listener again; aboard, your own doors are full level and centred; the train you left is heard through the walls
  await doorLog(p);
  const post = await ev(p, () => {
    const s = __sim.sim, T = s.THREE, D = window.__dl, cam = s.camera, o = {};
    const l0 = D.log.length; __sim.doorSound(s.trainView, true, true, 1); o.own = D.log[D.log.length - 1]; o.ownN = D.log.length - l0;
    const tv = s.bg.view, side = s.bg.svc.platSide, P = new T.Vector3(); (side > 0 ? tv.doorsR : tv.doorsL)[0].leaves[0].n.getWorldPosition(P);
    cam.position.copy(P).add(new T.Vector3(0, 2, 0)); cam.updateMatrixWorld(true); __sim.doorSound(tv, false, true, side); o.through = D.log[D.log.length - 1];
    return o;
  });
  ok('sound: after boarding the other circle\'s train each service has exactly one door listener; aboard, your own doors play at full level and centred, and the train you left is muffled and halved', sal.listeners[0] === 1 && sal.listeners[1] === 1 && sal.mode === 'ride' && post.ownN === 1 && post.own.played && post.own.gain === 1 && post.own.pan === 0 && post.own.lp === 0 && post.through.played && post.through.gain === 0.5 && post.through.lp === 2500, JSON.stringify([sal.listeners, post]));
  await p.close();
  // ---------------------------------------------------------------- swept volume: the train must never touch a solid station mesh
  p = await open(browser, 'mode=drive&station=buchanan-street');
  for (const line of ['outer', 'inner']) {
    await ev(p, (l) => __sim.go({ mode: 'drive', station: 'buchanan-street', line: l }), line);
    const bad = [];
    for (let i = 0; i < 15; i++) { const r = await ev(p, (k) => __sim.sweep(k, { step: 1.0, range: 70 }), i); if (r.hits.length) bad.push(`${r.station}(${r.island ? 'island' : 'side'}):${r.hits.length}x ${r.hits[0].mesh}@${r.hits[0].pt.join(',')}`); }
    ok(`swept train volume intersects no solid station mesh - ${line} circle, all 15 stations`, bad.length === 0, bad.slice(0, 3).join(' | '));
    const cv = await ev(p, () => __sim.sweepCurves(8));
    ok(`train does not poke through the tunnel lining on the 8 tightest curves (<= 12 grazing rays of ~1500) - ${line} circle`, cv.every((c) => c.hits <= 12), JSON.stringify(cv.filter((c) => c.hits)));
  }
  await p.close();
  p = await open(browser, 'mode=explore&station=hillhead&diff=easy');
  await shot(p, '21_explore_hillhead');
  await p.close();

  // ---------------------------------------------------------------- the fleet: numbered units on both circles, one roster, countdowns that only fall
  p = await open(browser, 'mode=explore&station=shields-road&line=outer');
  const fl = await ev(p, () => {
    const f = __sim.fleet(), r = f.roster(), all = [...r.outer, ...r.inner, ...r.spare];
    return { r, n: all.length, distinct: new Set(all).size, lo: Math.min(...all), hi: Math.max(...all), lap: { outer: f.cycles.outer.period, inner: f.cycles.inner.period } };
  });
  ok('fleet: 17 distinct units numbered 301-317; six run each circle, five are spare in the depot', fl.n === 17 && fl.distinct === 17 && fl.lo === 301 && fl.hi === 317 && fl.r.outer.length === 6 && fl.r.inner.length === 6 && fl.r.spare.length === 5, JSON.stringify(fl.r));
  ok('fleet: a lap is the real service\'s lap - 24 to 27 minutes on both circles (measured from the ATO service on the track, not typed in)', ['outer', 'inner'].every((l) => fl.lap[l] > 24 * 60 && fl.lap[l] < 27 * 60), JSON.stringify(fl.lap));
  const pl = await ev(p, () => {
    const s = __sim.sim; let n = 0; while (!(s.shuttle.state === 'dwell' && s.svc.doorsOpen) && n++ < 8000) s.tick(0.1);
    s.tick(0.6); s._indT = 0; s.tick(0.1);   // let the boards redraw
    const r = __sim.fleet().roster(), u = __sim.unit('outer'), tv = s.tracks.outer.view, due = __sim.due('outer', 'shields-road'), st = __sim.state();
    const side = tv._plates ? tv._plates.filter((q) => !q.nose).map((q) => q.car + ':' + q.set.text + ':' + q.mesh.visible) : null;
    const nose = tv._plates ? tv._plates.filter((q) => q.nose).map((q) => q.car + ':' + q.set.text + ':' + q.mesh.visible) : null;
    const ind = [...s.stationViews.values()].flatMap((v) => (v.indicators || []).map((i) => i.key));
    const bg = __sim.unit('inner');
    return { state: s.shuttle.state, u, inOuter: r.outer.includes(u), due, st: st.unit, side, nose, bg, bgOk: bg == null || (r.inner.includes(bg) && !r.outer.includes(bg)), ind };
  });
  ok('the train standing at the platform is a numbered unit of its own circle\'s roster, and the HUD state names it', pl.state === 'dwell' && pl.inOuter && pl.st === pl.u, JSON.stringify([pl.state, pl.u, pl.st]));
  ok('its bodywork carries the number: <unit>A-D on both flanks of the four cars, <unit> on both cab fronts', !!pl.side && pl.side.length === 8 && ['A', 'B', 'C', 'D'].every((c, i) => pl.side.filter((q) => q === `${i}:${pl.u}${c}:true`).length === 2) && pl.nose.length === 2 && pl.nose.every((q, i) => q === `${[0, 3][i]}:${pl.u}:true`), JSON.stringify([pl.side, pl.nose]));
  ok('the platform board names the unit that is in the station; the other circle\'s train, when on show, is one of the inner circle\'s units (never an outer one)', !!pl.due && pl.due.unit === pl.u && pl.due.eta === 0 && pl.bgOk && pl.ind.some((k) => new RegExp('/' + pl.u + '(\\||$)').test(k)), JSON.stringify([pl.due, pl.bg, pl.ind]));
  const cd = await ev(p, () => {
    const out = { outer: [], inner: [] };
    for (let t = 0; t < 800; t++) { __sim.ff(1, 0.125); for (const l of ['outer', 'inner']) { const d = __sim.due(l, 'shields-road'); out[l].push(d ? [d.unit, +d.eta.toFixed(2), +__sim.fleet().clock.toFixed(1)] : null); } }
    return { seq: out, roster: __sim.fleet().roster(), lap: { outer: __sim.fleet().cycles.outer.period, inner: __sim.fleet().cycles.inner.period } };
  });
  for (const l of ['outer', 'inner']) {
    let worstUp = 0, prev = null; const arr = [];
    cd.seq[l].forEach((q) => { if (!q) return; if (prev && prev[0] === q[0]) worstUp = Math.max(worstUp, q[1] - prev[1]); if (q[1] === 0 && (!prev || prev[0] !== q[0] || prev[1] !== 0)) arr.push([q[0], Math.round(q[2])]); prev = q; });   // (times are the fleet clock: sim seconds)
    const R = cd.roster[l], head = cd.lap[l] / R.length;
    const inOrder = arr.every((a, i) => i === 0 || R[(R.indexOf(arr[i - 1][0]) + 1) % R.length] === a[0]), gaps = arr.slice(1).map((a, i) => a[1] - arr[i][1]);
    ok(`${l} circle, 800 s at Shields Road: each unit's countdown only falls (never steps up when a train leaves), ${arr.length} trains arrive in roster order, one headway (${head.toFixed(0)} s) apart`, worstUp <= 1.5 && arr.length >= 3 && arr.every((a) => R.includes(a[0])) && inOrder && gaps.every((g) => Math.abs(g - head) < 6), `worst rise ${worstUp.toFixed(2)} s; arrivals ${JSON.stringify(arr)}; gaps ${JSON.stringify(gaps)}; headway ${head.toFixed(1)}`);
  }
  const seat = [];
  for (const [mode, line] of [['drive', 'outer'], ['ride', 'inner'], ['explore', 'inner']]) {
    const r = await ev(p, async ([m, ln]) => { await __sim.go({ mode: m, station: 'partick', line: ln }); __sim.ff(3, 0.1); const f = __sim.fleet().roster(), u = __sim.unit(ln); return { m, ln, u, ok: f[ln].includes(u), st: __sim.state().unit, other: __sim.fleet().lineOfUnit(u) }; }, [mode, line]);
    seat.push(r);
  }
  ok('every way in (drive / ride / explore, either circle) puts you on a numbered unit of that circle\'s roster, and the roster is the one fleet throughout', seat.every((r) => r.ok && r.st === r.u && r.other === r.ln), JSON.stringify(seat));
  const rost2 = await ev(p, async () => { const a = JSON.stringify(__sim.fleet().roster()); await __sim.go({ mode: 'explore', station: 'govan', line: 'outer', diff: 'easy' }); return { a, b: JSON.stringify(__sim.fleet().roster()) }; });
  ok('the same units run the same circles after a restart (changing station / difficulty does not reshuffle the fleet)', rost2.a === rost2.b, JSON.stringify(rost2));
  await p.close();

  // ---------------------------------------------------------------- MOBILE 390x844 touch
  p = await open(browser, 'mode=drive&station=partick', { viewport: { width: 390, height: 844 }, touch: true });
  await ev(p, () => { __sim.svc().dwellT = 100; });
  await p.tap('.gs-lever button[data-n="3"]', { timeout: 40000 }).catch((e) => console.log('  tap failed', e.message.slice(0, 120)));
  await ev(p, () => __sim.ff(10, 0.1));
  await shot(p, '22_mobile_drive');
  const overflow = await ev(p, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('mobile drive: no horizontal scroll', overflow.sw - overflow.cw <= 1, JSON.stringify(overflow));
  const tl = await ev(p, () => { const out = []; for (const b of document.querySelectorAll('.gs-root button, .gs-root [data-a]')) { const r = b.getBoundingClientRect(); if (r.width && r.height && getComputedStyle(b).display !== 'none' && r.left < 109 && r.top < 41) out.push(b.textContent); } return out; });
  ok('nothing interactive under the top-left 109x41 (mobile)', tl.length === 0, tl.join(','));
  ok('touch lever moved the train', (await ev(p, () => __sim.info())).kmh > 5);
  await ev(p, () => __sim.go({ mode: 'explore', station: 'partick' }));
  await ev(p, () => __sim.ff(3, 0.1)); await shot(p, '23_mobile_explore');
  const ov2 = await ev(p, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('mobile explore: no horizontal scroll', ov2.sw - ov2.cw <= 1);
  const fovM = await ev(p, () => { const c = __sim.sim.camera; return 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * c.aspect) * 180 / Math.PI; });
  ok('portrait: horizontal FOV stays wide (>= 70 deg)', fovM >= 70, 'hfov=' + fovM.toFixed(0));
  const joy = await ev(p, () => getComputedStyle(document.querySelector('.gs-joy')).display);
  ok('touch joystick shown in walk modes', joy === 'block');
  await p.close();
} finally {
  await browser.close(); if (server) server.kill();
}
const hardErrors = errors.filter((e) => !/favicon|404/i.test(e));
ok('no console errors', hardErrors.length === 0, hardErrors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

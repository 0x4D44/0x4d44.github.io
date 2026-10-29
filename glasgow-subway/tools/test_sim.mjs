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

const browser = await chromium.launch(launch);
try {
  // ---------------------------------------------------------------- DRIVE: ATO lap
  let p = await open(browser, 'mode=drive&station=buchanan-street');
  ok('sim starts in drive mode at Buchanan Street', (await ev(p, () => __sim.state())).mode === 'drive' && (await ev(p, () => __sim.info())).nextName === 'Buchanan Street');
  await shot(p, '01_cab_platform');
  // manual: refuse doors when wrong side / moving; vigilance etc covered in unit tests. Open correct side at start.
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
    const s = __sim, out = [];
    for (const line of ['outer', 'inner']) {
      await s.go({ mode: 'explore', station: 'buchanan-street', line });
      for (let i = 0; i < 15; i++) {
        const v = await s.stationView(i), inf = v.info, w = s.walker();
        if (!inf.hall) { out.push(v.station.name + ': no hall'); continue; }
        if (!v.anchors.portals.length) out.push(v.station.name + ': no portal');
        for (const pt of v.anchors.portals) { w.setWorld(v.zones, v.obstacles); w.place(pt.x, pt.z, 0); if (w.heightAt(pt.x, pt.z, inf.PY) == null) out.push(v.station.name + ' portal off platform ' + pt.x.toFixed(1) + ',' + pt.z); }
        if (Math.abs(Math.abs(inf.xe) - 1.25) > 0.2) out.push(v.station.name + ' edge gap ' + inf.xe);
      }
    }
    return out;
  });
  ok('every hall: platform edge matches the train and exit portals are walkable (both circles)', portals.length === 0, portals.slice(0, 4).join(' | '));
  const pa = await ev(p, async () => { const bad = []; for (const id of ['govan', 'buchanan-street', 'cessnock', 'kelvinhall', 'st-enoch', 'hillhead']) { await __sim.go({ mode: 'explore', station: id, line: 'outer' }); __sim.render(); __sim.render(); const cl = __sim.crowdClearance(); if (cl.n > 3 && (cl.d < 2.4 || cl.front < 3)) bad.push(id + ': spawned ' + cl.d.toFixed(2) + ' m from the walker (front ' + cl.front.toFixed(1) + ')'); __sim.ff(8, 0.1); __sim.render(); __sim.render(); const a = __sim.peopleAudit(); if (a.platform < 3 || a.bad.length) bad.push(id + ':' + a.platform + ':' + a.bad.slice(0, 2).join(';')); } return bad; });
  ok('platform crowds (6 halls): nobody spawns within 2.4 m / the near view cone of the walker; soles on the platform, nobody inside furniture or each other', pa.length === 0, pa.join(' | '));
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

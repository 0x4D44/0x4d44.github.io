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
  await p.evaluate(() => __sim.loop(false)); // time is driven explicitly (swiftshader frames are slow)
  return p;
}
const shot = async (p, name) => { await p.evaluate(() => window.__sim.render()); await p.waitForTimeout(100); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
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
  const walk = await ev(p, () => {
    const s = __sim, w = s.walker(), inf = s.station().info; const out = {};
    w.place(inf.rc, inf.PL - 2.2, Math.PI); s.setLook(Math.PI, 0); // facing +z (towards the ramp)
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
  const built = await ev(p, () => { const s = __sim; let n = 0; for (let i = 0; i < 15; i++) { s.stationView(i); n++; } return n; });
  ok('all 15 station interiors build', built === 15);
  // inner line
  await ev(p, () => __sim.go({ mode: 'drive', station: 'cowcaddens', line: 'inner' }));
  ok('inner circle drive starts', (await ev(p, () => __sim.state())).line === 'inner');
  await ev(p, () => { __sim.svc().dwellT = 100; __sim.ato(true); __sim.ff(30, 0.1); });
  await shot(p, '19_inner_tunnel');
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
  // regression (reviewer 1): a standing eye must see end to end - the gangway apertures are full height, no header/wall at head level
  const gang = await ev(p, () => {
    const s = __sim, sim = s.sim, tv = sim.trainView, T = sim.THREE, PYv = 0.695; tv.root.updateMatrixWorld(true);
    const meshes = []; tv.root.traverse((m) => { if (m.isMesh && !/glass/.test(m.name + (m.parent ? m.parent.name : ''))) meshes.push(m); });
    const ci = tv.cars.length - 1, car = tv.cars[ci], info = tv.carInfo[ci], res = [];
    const rot = new T.Matrix4().extractRotation(car.matrix), dir = new T.Vector3(0, 0, -1).applyMatrix4(rot);
    for (const h of [0.9, 1.3, 1.6]) {
      const o = new T.Vector3(0, PYv + h, 12 - info.zc).applyMatrix4(car.matrix);
      const rc = new T.Raycaster(o, dir, 0, 24); rc.firstHitOnly = true;
      const hit = rc.intersectObjects(meshes, false); res.push({ h, hit: hit.length ? (hit[0].object.name + '@' + hit[0].distance.toFixed(1)) : null });
    }
    return res;
  });
  ok('saloon: clear line of sight along the 4-car gangways at eye heights 0.9 / 1.3 / 1.6 m', gang.every((g) => !g.hit), JSON.stringify(gang));
  ok('and sprint back to the rear', (await ev(p, () => __sim.walker().z)) > trainWalk.half - 1.5);
  await p.close();
  // regression (reviewer 1): the escalator ramp must open through the end pier of island vaults (no tile wall in the walking path)
  p = await open(browser, 'mode=explore&station=buchanan-street');
  const pier = await ev(p, () => {
    const s = __sim, T = s.sim.THREE, out = [];
    for (let i = 0; i < 15; i++) {
      const v = s.sim._ensureStation(i); v.group.updateMatrixWorld(true); const inf = v.info;
      const meshes = []; v.group.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const o = v.group.localToWorld(new T.Vector3(inf.rc, inf.PY + 1.2, inf.PL - 1.5));
      const d = new T.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion);
      const rc = new T.Raycaster(o, d, 0, 3.0); rc.firstHitOnly = true; const h = rc.intersectObjects(meshes, false);
      if (h.length) out.push(v.station.name + ':' + (h[0].object.name || h[0].object.type) + '@' + h[0].distance.toFixed(2));
    }
    return out;
  });
  ok('every station: walking path from platform to the ramp is not blocked by a wall', pier.length === 0, pier.slice(0, 3).join(' | '));
  await p.close();
  // ---------------------------------------------------------------- swept volume: the train must never touch a solid station mesh
  p = await open(browser, 'mode=drive&station=buchanan-street');
  for (const line of ['outer', 'inner']) {
    await ev(p, (l) => __sim.go({ mode: 'drive', station: 'buchanan-street', line: l }), line);
    const bad = [];
    for (let i = 0; i < 15; i++) { const r = await ev(p, (k) => __sim.sweep(k, { step: 1.0, range: 70 }), i); if (r.hits.length) bad.push(`${r.station}(${r.island ? 'island' : 'side'}):${r.hits.length}x ${r.hits[0].mesh}@${r.hits[0].pt.join(',')}`); }
    ok(`swept train volume intersects no solid station mesh - ${line} circle, all 15 stations`, bad.length === 0, bad.slice(0, 3).join(' | '));
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

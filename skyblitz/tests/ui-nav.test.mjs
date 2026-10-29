// Keyboard-flow audit in real headless Chrome: real key events, one browser, one static server.
// Run: node skyblitz/tests/ui-nav.test.mjs   (set UI_NAV_TRACE=1 to print every step)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary' };
const server = http.createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/').replace(/^\/+/, '');
    const f = p.endsWith('/') || !p ? p + 'index.html' : p; const data = await readFile(join(root, f)); p = f;
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data);
  } catch { console.log('404', req.url); res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const trace = !!process.env.UI_NAV_TRACE;

const chrome = await launchChrome({ width: 1280, height: 720 });
let failed = 0;
try {
  const page = await chrome.newPage();
  await page.goto(`http://127.0.0.1:${port}/skyblitz/?debug=1&mute=1`);
  try { await page.waitFor('window.__sky && __sky.ready', { timeout: 100000 }); } catch (e) { console.log(await page.eval('document.readyState+" "+location.href+" "+!!window.__sky+" "+document.body.innerText.slice(0,200)')); console.log(page.logs.slice(0, 20).map((l) => l.text).join(' | ')); throw e; }
  await page.waitFor('__sky.game.ui.cur && __sky.game.ui.cur.name', { timeout: 20000 }).catch(() => {}); await delay(500);
  const state = () => page.eval(`(() => {
    const u = __sky.game.ui, a = document.activeElement, r = a && a.getBoundingClientRect();
    return { screen: u.cur && u.cur.name, tag: a && a.tagName, cls: a && String(a.className), label: a && ((a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)),
      visible: !!(a && a.offsetParent !== null && r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight),
      underPill: !!(r && r.left < 112 && r.top < 44 && a !== document.body), nav: !!(a && a.dataset && 'nav' in a.dataset) };
  })()`);
  const press = async (k) => { await page.key(k); await delay(220); const s = await state(); if (trace) console.log(k.padEnd(11), JSON.stringify(s)); return s; };
  const goto = async (name, params) => { await page.eval(`__sky.game.ui.goto(${JSON.stringify(name)}, ${JSON.stringify(params || {})})`); await delay(450); return page.eval('0').then(state); };
  const only = process.env.UI_NAV_ONLY && new RegExp(process.env.UI_NAV_ONLY, 'i');
  const check = async (name, fn) => { if (only && !only.test(name)) return; try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } };

  await check('title: Enter reaches the main menu', async () => {
    assert.equal((await state()).screen, 'title');
    assert.equal((await press('Enter')).screen, 'main');
  });

  await check('main menu: first focus is an interactive control and not under the pill', async () => {
    const s = await state(); assert.ok(s.nav && s.visible && !s.underPill, JSON.stringify(s));
  });

  await check('aircraft: Enter on the stage continues; Up/Down cycle livery; Left/Right cycle aircraft', async () => {
    await page.eval(`__sky.game.ui.startFlow('quick')`); await delay(700);
    let s = await state(); assert.equal(s.screen, 'aircraft'); assert.ok(/stage/.test(s.cls), 'stage has first focus: ' + JSON.stringify(s));
    const liv = () => page.eval(`document.querySelector('.liv-n').textContent`), name = () => page.eval(`document.querySelector('.ac-name').textContent`);
    const l0 = await liv(); s = await press('ArrowDown'); assert.ok(/stage/.test(s.cls), 'focus stays on the stage'); assert.notEqual(await liv(), l0, 'ArrowDown changes livery');
    await press('ArrowUp'); assert.equal(await liv(), l0, 'ArrowUp restores livery');
    const n0 = await name(); await press('ArrowRight'); assert.notEqual(await name(), n0, 'ArrowRight changes aircraft'); await press('ArrowLeft'); assert.equal(await name(), n0);
    assert.ok(/Esc/.test(await page.eval(`document.querySelector('.keyhint').textContent`)), 'key hint shown');
    assert.equal((await press('Enter')).screen, 'course', 'Enter on the stage = Continue');
  });

  await check('every flow screen: Escape goes back one screen; first focus is visible and clear of the pill', async () => {
    const chain = [['course', 'aircraft'], ['options', 'course'], ['aircraft', 'main']];
    for (const [scr, back] of chain) {
      const s = await goto(scr);
      assert.equal(s.screen, scr); assert.ok(s.nav && s.visible && !s.underPill, scr + ' first focus ' + JSON.stringify(s));
      assert.equal((await press('Escape')).screen, back, scr + ' Escape');
    }
  });

  await check('course select lists sunrise, redrock, neon, frost', async () => {
    await goto('course');
    const ids = await page.eval(`[...document.querySelectorAll('.scr.course .card')].map((c) => c.dataset.id || c.textContent.trim().slice(0, 14))`);
    assert.ok(ids.length >= 4, JSON.stringify(ids));
    const txt = (await page.eval(`document.querySelector('.scr.course').textContent`)).toLowerCase();
    for (const n of ['sunrise', 'redrock', 'neon', 'frost']) assert.ok(txt.includes(n), n + ' missing');
  });

  await check('course select: all four cards visible without scrolling at 1280x720, 1366x768, 1920x1080; each shows its own outline', async () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await goto('course'); await delay(2500);
      const r = await page.eval(`(() => { const g = document.querySelector('.scr.course .cards'); const cs = [...document.querySelectorAll('.scr.course .card')].map((c) => c.getBoundingClientRect()); return { n: cs.length, inside: cs.every((b) => b.top >= g.getBoundingClientRect().top - 1 && b.bottom <= g.getBoundingClientRect().bottom + 1 && b.left >= 0 && b.right <= innerWidth), scrolls: g.scrollHeight > g.clientHeight + 1, dbg: [g.scrollHeight, g.clientHeight], vis: cs.every((b) => b.bottom <= innerHeight) }; })()`);
      assert.equal(r.n, 4); assert.ok(r.inside && r.vis && !r.scrolls, `${w}x${h}: cards fit without scrolling ${JSON.stringify(r)}`);
    }
    const sums = await page.eval(`[...document.querySelectorAll('.scr.course canvas.map')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { s += (i >> 2) % c.width * 7 + Math.floor((i >> 2) / c.width) * 13; n++; } return n ? s : 0; })`);
    assert.ok(sums.every((x) => x > 0), 'every card has a drawn outline: ' + sums); assert.equal(new Set(sums).size, 4, 'the four outlines differ: ' + sums);
    await page.setViewport(1280, 720, { dpr: 1 });
  });

  await check('settings, controls, credits: reachable in <=2 arrows from first focus; Escape returns to the opener', async () => {
    for (const scr of ['settings', 'controls', 'credits']) {
      let s = await goto(scr, { back: 'main' });
      assert.equal(s.screen, scr); assert.ok(s.nav && s.visible && !s.underPill, scr + ' ' + JSON.stringify(s));
      assert.equal((await press('Escape')).screen, 'main', scr + ' Escape');
    }
  });

  const seq = async (keys) => { let s; for (const k of keys) s = await press(k); return s; };
  const finish = async () => { await page.eval(`(() => { __sky.autopilot(true); for (let i = 0; i < 80 && __sky.game.state !== 'results'; i++) __sky.step(240); })()`); await delay(900); return state(); };
  const toMain = async () => { await page.eval(`__sky.game.ui.goto('main')`); await delay(400); };

  await check('quick race: keys only from main to results, 1 lap', async () => {
    await toMain();
    let s = await seq(['Enter', 'Enter', 'Enter']);   // quick race -> aircraft -> course -> options
    assert.equal(s.screen, 'options', JSON.stringify(s));
    s = await seq(['ArrowUp']);   // Start race -> laps row (the selected value) in one arrow
    assert.equal(await page.eval(`document.activeElement.dataset.id`), 'opt-laps', 'laps row reachable: ' + JSON.stringify(s));
    for (let i = 0; i < 3 && (await state()).label !== '1'; i++) await press('ArrowLeft');
    await press('Enter');
    const lapsOn = await page.eval(`document.querySelector('.scr.options .opt.on[data-id=opt-laps]').textContent`);
    assert.equal(lapsOn, '1', 'laps chosen by keyboard');
    await seq(['ArrowDown']);
    s = await state(); assert.ok(/Start race/.test(s.label), 'Start race reachable by arrows: ' + JSON.stringify(s));
    await press('Enter');
    await page.waitFor(`__sky.game.state === 'race' || __sky.game.ui.hintOpen`, { timeout: 90000 }); await delay(600);
    s = await state();
    if (s.screen === 'hint') { assert.ok(/Got it/.test(s.label), 'hint focus ' + JSON.stringify(s)); await press('Enter'); }
    assert.equal(await page.eval(`__sky.game.paused`), false, 'race resumes after hint');
    // pause with Escape, check, resume with Enter
    s = await press('Escape'); assert.equal(s.screen, 'pause'); assert.ok(/Resume/.test(s.label), JSON.stringify(s));
    s = await seq(['ArrowDown', 'ArrowDown']); assert.ok(/Settings/.test(s.label), 'pause: Settings within 2 arrows ' + JSON.stringify(s));
    s = await press('Enter'); assert.equal(s.screen, 'settings');
    s = await press('Escape'); assert.equal(s.screen, 'pause', 'Escape from settings returns to pause');
    s = await press('Escape'); assert.equal(await page.eval(`__sky.game.paused`), false, 'Escape on pause resumes');
    s = await finish(); assert.equal(s.screen, 'results', JSON.stringify(s));
    assert.ok(s.nav && s.visible && !s.underPill && /Retry/.test(s.label), 'results primary: ' + JSON.stringify(s));
    s = await seq(['ArrowRight', 'ArrowRight']);
    assert.ok(/Quit/.test(s.label), 'results: Quit within 2 arrows ' + JSON.stringify(s));
    await seq(['ArrowLeft', 'ArrowLeft']);
    s = await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 }); await delay(400);
    s = await state(); assert.equal(s.screen, 'main', 'Escape on results returns to the main menu'); assert.ok(s.nav && s.visible, JSON.stringify(s));
  });

  await check('settings: every control reachable by arrows, operable by keys, persisted; volume reaches the audio bus', async () => {
    await toMain();
    let s = await seq(['ArrowDown', 'ArrowDown', 'ArrowDown']); assert.ok(/Settings/.test(s.label), JSON.stringify(s));
    s = await press('Enter'); assert.equal(s.screen, 'settings');
    const total = await page.eval(`document.querySelectorAll('.scr.settings [data-nav]').length`);
    const seen = new Set(); let guard = 0;
    for (; guard < total + 6; guard++) {
      s = await state(); assert.ok(s.visible && s.nav && !s.underPill, 'settings focus ' + JSON.stringify(s));
      seen.add(await page.eval(`[...document.querySelectorAll('.scr.settings [data-nav]')].indexOf(document.activeElement)`));
      await page.key('ArrowDown'); await delay(120);
      const st = await state(); if (!/settings/.test(st.screen)) break;
      if (!(await page.eval(`document.activeElement.dataset.nav !== undefined`))) break;
    }
    // arrows only walk one control per row (left/right move within a row); walk right/left too
    for (let i = 0; i < 12; i++) { await page.key('ArrowRight'); await delay(60); seen.add(await page.eval(`[...document.querySelectorAll('.scr.settings [data-nav]')].indexOf(document.activeElement)`)); }
    assert.ok(seen.size >= 6, 'settings walk reached ' + seen.size + ' of ' + total);
    // master volume slider: focus it directly through arrows from the top
    await page.eval(`document.querySelector('.scr.settings input[aria-label="Master volume"]').focus()`);
    const v0 = await page.eval(`__sky.game.settings.masterVolume`);
    await page.key('ArrowLeft'); await page.key('ArrowLeft'); await delay(250);
    const v1 = await page.eval(`__sky.game.settings.masterVolume`);
    assert.ok(v1 < v0 - 0.05, `ArrowLeft lowers master volume ${v0} -> ${v1}`);
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).masterVolume, v1, 'volume persisted');
    // toggle with Enter, then Space, persisted
    await page.eval(`document.querySelector('.scr.settings .toggle[aria-label="Show FPS counter"]').focus()`);
    const t0 = await page.eval(`__sky.game.settings.showFps`);
    await press('Enter'); assert.equal(await page.eval(`__sky.game.settings.showFps`), !t0, 'Enter toggles');
    await press('Space'); assert.equal(await page.eval(`__sky.game.settings.showFps`), t0, 'Space toggles back (exactly once)');
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).showFps, t0);
    // K-1: the double-tap barrel-roll toggle exists, is off by default, and is operable and persisted
    assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), false, 'double-tap roll defaults off');
    await page.eval(`document.querySelector('.scr.settings .toggle[aria-label="Double-tap bank key = barrel roll"]').focus()`);
    await press('Enter'); assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), true);
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).doubleTapRoll, true, 'double-tap roll persisted');
    await press('Enter');
    // segmented control by keys
    await page.eval(`document.querySelector('.scr.settings .opt[data-id=quality]').focus()`);
    await press('ArrowRight'); await press('Enter');
    assert.notEqual(await page.eval(`__sky.game.settings.quality`), 'auto', 'segmented option chosen by keyboard');
    // reset restores defaults; then Escape goes back
    await page.eval(`[...document.querySelectorAll('.scr.settings .btn')].find((b) => /Reset/.test(b.textContent)).focus()`);
    await press('Enter');
    assert.equal(await page.eval(`__sky.game.settings.masterVolume`), 1, 'reset restores master volume');
    s = await press('Escape'); assert.equal(s.screen, 'main');
  });

  const raceReady =() => page.waitFor(`__sky.game.state === 'race'`, { timeout: 120000 });
  await check('time trial: keys only to results; Retry primary, Escape back to menu', async () => {
    await toMain();
    let s = await seq(['ArrowDown', 'ArrowDown']); assert.ok(/Time Trial/.test(s.label), JSON.stringify(s));
    await seq(['Enter', 'Enter', 'Enter']);   // aircraft -> course -> launch
    await raceReady(); await delay(300);
    s = await finish(); assert.equal(s.screen, 'results'); assert.ok(/Retry/.test(s.label), JSON.stringify(s));
    assert.match(await page.eval(`document.querySelector('.scr.results h2').textContent`), /TIME TRIAL/);
    await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 });
  });

  await check('grand prix: 4 races by keys, standings each time, podium', async () => {
    await delay(400); await toMain();
    let s = await press('ArrowDown'); assert.ok(/Grand Prix/.test(s.label), JSON.stringify(s));
    await seq(['Enter', 'Enter']);   // aircraft -> options
    s = await state(); assert.equal(s.screen, 'options');
    await press('Enter');
    for (let r = 0; r < 4; r++) {
      await raceReady(); await delay(300);
      s = await finish(); assert.equal(s.screen, 'results', 'race ' + r + ' ' + JSON.stringify(s));
      assert.match(s.label, r < 3 ? /Next race/ : /Final standings/, 'primary on race ' + r);
      assert.ok(s.visible && !s.underPill);
      assert.match(await page.eval(`document.querySelector('.scr.results h2').textContent`), new RegExp('RACE ' + (r + 1)));
      assert.ok((await page.eval(`document.querySelectorAll('.res-gp tbody tr').length`)) >= 8, 'championship table has 8 pilots');
      if (r === 1) { s = await press('ArrowDown'); assert.ok(s.nav && s.visible, 'second button reachable: ' + JSON.stringify(s)); await press('ArrowUp'); }
      await press('Enter');
    }
    await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'podium'`, { timeout: 30000 }); await delay(500);
    s = await state(); assert.equal(s.screen, 'podium'); assert.ok(/New Grand Prix/.test(s.label) && s.visible && !s.underPill, JSON.stringify(s));
    s = await press('ArrowRight'); assert.ok(/Quit/.test(s.label), JSON.stringify(s));
    await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 });
  });
  await check('U-2: no menu screen is drawn during a race; only results after it; U-3: stunt popups merge and never overlap', async () => {
    await page.goto(`http://127.0.0.1:${port}/skyblitz/?debug=1&manual=1&autostart=1&mute=1&laps=1&bots=3&course=sunrise`);
    await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await page.eval('__sky.step(60)'); await delay(300);
    const drawn = () => page.eval(`[...document.querySelectorAll('#ui .scr')].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' || r.width > 0 || r.height > 0; }).map((e) => e.dataset.screen)`);
    assert.deepEqual(await drawn(), [], 'screens drawn during the race');
    // U-3
    await page.eval(`(() => { const h = __sky.game.ui.hud; for (let i = 0; i < 3; i++) h.stunt('BARREL ROLL', '#ffd02e', 6); h.stunt('LOOP', '#ffd02e', 4); h.stunt('NEAR MISS', '#ff3d9a', 2); h.stunt('SHORTCUT!', '#ff8a1f', 0); h.stunt('INVERTED', '#ffd02e', 1); })()`);
    const lines = await page.eval(`[...document.querySelectorAll('.hud-popups .popup')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.top, r.bottom]; })`);
    assert.ok(lines.length <= 4, 'max 4 popups: ' + lines.length);
    for (let i = 1; i < lines.length; i++) assert.ok(lines[i][1] >= lines[i - 1][2] - 0.5, 'popups overlap: ' + JSON.stringify(lines));
    await page.eval(`(() => { const h = __sky.game.ui.hud; h.stack.replaceChildren(); h.popups.length = 0; for (let i = 0; i < 3; i++) h.stunt('BARREL ROLL', '#ffd02e', 6); })()`);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('.hud-popups .popup')].map((e) => e.textContent)`), ['BARREL ROLL x3 +18%'], 'consecutive identical stunts merge');
    const s = await finish(); assert.equal(s.screen, 'results');
    assert.deepEqual(await drawn(), ['results'], 'only the results screen is drawn after the race');
  });

  const GAME = `http://127.0.0.1:${port}/skyblitz/`;
  const fakePad = () => page.eval(`(() => { window.__pad = { connected: true, id: 'Fake Pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; })()`);
  const padBtn = async (i) => { await page.eval(`__pad.buttons[${i}] = { pressed: true, value: 1 }`); await delay(160); await page.eval(`__pad.buttons[${i}] = { pressed: false, value: 0 }`); await delay(200); };

  await check('gamepad (faked pad): D-pad/A/B drive the menus, no traps', async () => {
    await page.goto(GAME + '?debug=1&mute=1'); await page.waitFor('window.__sky && __sky.ready', { timeout: 100000 });
    await page.waitFor('__sky.game.ui.cur && __sky.game.ui.cur.name', { timeout: 20000 }); await delay(400); await fakePad(); await delay(300);
    await padBtn(0); let s = await state(); assert.equal(s.screen, 'main', 'A on title: ' + JSON.stringify(s));
    await padBtn(13); s = await state(); assert.ok(/Grand Prix/.test(s.label), 'D-pad down: ' + JSON.stringify(s));
    await padBtn(0); s = await state(); assert.equal(s.screen, 'aircraft');
    await padBtn(15); await padBtn(14); assert.equal((await state()).screen, 'aircraft', 'left/right stay on the stage');
    await padBtn(0); s = await state(); assert.equal(s.screen, 'options', 'A on the stage continues (GP skips course): ' + JSON.stringify(s));
    assert.ok(/Start race/.test(s.label));
    await padBtn(1); s = await state(); assert.equal(s.screen, 'aircraft', 'B goes back');
    await padBtn(1); s = await state(); assert.equal(s.screen, 'main', 'B goes back to main');
    assert.ok(s.nav && s.visible);
  });

  await check('gamepad: sticks, triggers and buttons fly the aircraft', async () => {
    await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await fakePad(); await delay(400);
    await page.eval(`__pad.axes[0] = 1; __pad.axes[1] = 0.8; __pad.buttons[7] = { pressed: true, value: 1 }; __pad.buttons[6] = { pressed: true, value: 0.9 };`);
    await delay(300);
    const c = await page.eval(`(() => { const c = { ...__sky.game.input.sample() }; return { roll: c.roll, pitch: c.pitch, boost: c.boost, airbrake: c.airbrake, connected: __sky.game.input.pad.connected }; })()`);
    assert.ok(c.connected, 'pad detected'); assert.ok(c.roll > 0.8, 'stick right banks right: ' + JSON.stringify(c)); assert.ok(Math.abs(c.pitch) > 0.5, 'stick pitches'); assert.ok(c.boost, 'RT boosts'); assert.ok(c.airbrake > 0.5, 'LT brakes');
    await page.eval(`__pad.axes[0] = 0; __pad.axes[1] = 0; __pad.buttons[7] = { pressed: false, value: 0 }; __pad.buttons[6] = { pressed: false, value: 0 };`);
    await page.goto(GAME + '?debug=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await fakePad(); await delay(400);
    await page.eval(`__pad.buttons[9] = { pressed: true, value: 1 }`); await delay(1200); await page.eval(`__pad.buttons[9] = { pressed: false, value: 0 }`); await delay(400);
    let s = await state(); assert.equal(s.screen, 'pause', 'Start pauses: ' + JSON.stringify(s) + JSON.stringify(await page.eval('({ st: __sky.game.state, paused: __sky.game.paused, pad: __sky.game.input.pad, frame: __sky.game.frame, sim: __sky.game.simTime })'))); assert.ok(/Resume/.test(s.label));
    await padBtn(0); assert.equal(await page.eval(`__sky.game.paused`), false, 'A on Resume resumes');
  });

  await check('touch: on-screen controls usable and clear of the HUD at 844x390 and 390x844', async () => {
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const [w, h] of [[844, 390], [390, 844]]) {
      await page.setViewport(w, h, { dpr: 1, mobile: true });
      await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
      const tp = (type, pts) => page.s('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await tp('touchStart', [{ x: 5, y: h - 5, id: 1 }]); await tp('touchEnd', []); await delay(300);   // first touch enables the overlay
      await page.eval(`(() => { const p = __sky.game.player; p.shield = 6; p.item = { type: 'missile', count: 3 }; __sky.game.events.emit('race:wrongway', { racer: p, on: true }); __sky.step(3); })()`); await delay(300);
      const info = await page.eval(`(() => {
        const t = document.getElementById('sb-touch'); if (!t) return null;
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
        const btns = [...t.children].filter((e) => e.textContent.trim()).map((e) => ({ n: e.textContent.trim(), r: vis(e) })).filter((x) => x.r).map((x) => ({ n: x.n, l: x.r.left, t: x.r.top, w: x.r.width, h: x.r.height }));
        const hud = [...document.querySelectorAll('#ui .hud > *, #ui .hud-top > *, #ui .hud-bottom > *, #ui .hud-bc > *')].map((e) => ({ c: String(e.className), r: vis(e) })).filter((x) => x.r && x.r.width < innerWidth * 0.8 && x.r.height < innerHeight * 0.6 && getComputedStyle(x.r ? document.body : document.body).display).map((x) => ({ c: x.c, l: x.r.left, t: x.r.top, rr: x.r.right, b: x.r.bottom }));
        return { btns, hud };
      })()`);
      if (trace) console.log(w + 'x' + h, JSON.stringify(info));
      assert.ok(info && info.btns.length >= 4, `${w}x${h}: touch overlay with buttons ${JSON.stringify(info && info.btns.map((b) => b.n))}`);
      for (const b of info.btns) assert.ok(b.w >= 44 && b.h >= 44, `${w}x${h}: touch target ${b.n} ${Math.round(b.w)}x${Math.round(b.h)}`);
      const crit = info.hud.filter((x) => /map|pos|lap|speed|item|boost|shield|ticker/.test(x.c));
      for (const b of info.btns) for (const x of crit) {
        const ox = Math.min(b.l + b.w, x.rr) - Math.max(b.l, x.l), oy = Math.min(b.t + b.h, x.b) - Math.max(b.t, x.t);
        assert.ok(!(ox > 2 && oy > 2), `${w}x${h}: touch button ${b.n} covers HUD ${x.c}`);
      }
      // stick: drag in the left zone banks right
      await tp('touchStart', [{ x: w * 0.2, y: h * 0.7, id: 1 }]); await tp('touchMove', [{ x: w * 0.2 + 70, y: h * 0.7, id: 1 }]); await delay(250);
      const roll = await page.eval(`__sky.game.input.sample().roll`); await tp('touchEnd', []);
      assert.ok(roll > 0.3, `${w}x${h}: virtual stick banks (${roll})`);
      // boost button held
      const boostB = info.btns.find((b) => /BOOST/i.test(b.n)); assert.ok(boostB, 'BOOST button');
      await tp('touchStart', [{ x: boostB.l + boostB.w / 2, y: boostB.t + boostB.h / 2, id: 2 }]); await delay(200);
      const boosting = await page.eval(`__sky.game.input.sample().boost`); await tp('touchEnd', []);
      assert.ok(boosting, `${w}x${h}: BOOST touch button works`);
    }
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewport(1280, 720, { dpr: 1, mobile: false });
  });

  await check('volume sliders reach the audio graph (unmuted page)', async () => {
    await page.goto(`http://127.0.0.1:${port}/skyblitz/?debug=1`);
    await page.waitFor('window.__sky && __sky.ready', { timeout: 100000 }); await delay(800);
    await press('Enter');   // title -> main (a key gesture starts audio)
    await page.eval(`__sky.game.ui.goto('settings', { back: 'main' })`); await delay(500);
    const gain = () => page.eval(`(() => { const a = __sky.game.audio; return a && a.master ? [a.master.gain.value, a.sfxBus.gain.value, a.musicBus.gain.value] : null; })()`);
    const g0 = await gain(); assert.ok(g0, 'audio graph exists after a key press');
    for (const [label, idx] of [['Master volume', 0], ['Effects volume', 1], ['Music volume', 2]]) {
      await page.eval(`document.querySelector('.scr.settings input[aria-label="${label}"]').focus()`);
      for (let i = 0; i < 8; i++) await page.key('ArrowLeft');
      await delay(900);
      const g1 = await gain(); assert.ok(g1[idx] < g0[idx] - 0.2, `${label}: bus gain ${g0[idx]} -> ${g1[idx]}`);
    }
  });
} finally {
  await chrome.close(); server.close();
}
if (failed) { console.log(failed + ' failure(s)'); process.exit(1); }
console.log('ui-nav: all passed');

// A phone gets the touch controls without `?touch` (owner: A1, js/ui/flow.js `goCoarse`, js/ui/touch.js), with REAL touch events (CDP Input.dispatchTouchEvent).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-touch-detect.test.mjs
// Review R2d-001 (round 5): on a touch phone the page booted into play and nothing answered: no drag-look, no stick, and the hint said "W A S D para caminar". The page
// asked `(pointer: coarse)` once at boot; a browser that learns it is touch-driven later (a late emulation, a laptop with a touch screen, a tablet in desktop mode) never asked again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 390, H = 844;

/** A phone page: `emulate` = 'before' (touch emulation on before the page loads: a real phone), 'after' (switched on once it has booted: R2d's setup), 'none' (a desktop). */
async function phone(emulate) {
  const b = await launch({ width: W, height: H });
  const page = b.page;
  if (emulate === 'before') { await page.viewport(W, H, true); await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  await b.open('la-ladera/index.html?manual');
  if (emulate === 'after') { await page.viewport(W, H, true); await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await delay(400); }
  const t = {
    page, b,
    down: (x, y, id = 0) => page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] }),
    move: (x, y, id = 0) => page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] }),
    up: () => page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    tap: async (x, y, ms = 60) => { await t.down(x, y); await delay(ms); await t.up(); },
    centre: (sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`),
    state: () => page.eval('(() => { const s = __ladera.state(); return { mode: __ladera.ctx.flow.mode, panel: __ladera.ctx.flow.current, yaw: s.yaw, x: s.pos[0], z: s.pos[2] }; })()'),
    close: () => b.close(),
  };
  return t;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Everything a phone needs once the touch layer is on, from the title card to the buttons. Shared by the 'before' and 'after' phones. */
async function playThrough(t, label) {
  const { page } = t;
  const pre = JSON.parse(await page.eval(`JSON.stringify({ body: document.body.classList.contains('touch'), ui: !!document.getElementById('touch'), coarse: __ladera.ctx.flow.coarse, mode: __ladera.ctx.flow.mode })`));
  assert.equal(pre.mode, 'title');
  // Entrar by finger: the first finger is the tap on the button, so a page that had not heard yet turns the layout on before the click lands
  const [sx, sy] = await t.centre('#start'); await t.tap(sx, sy); await delay(900);
  const m = JSON.parse(await page.eval(`JSON.stringify({ body: document.body.classList.contains('touch'), ui: !!document.getElementById('touch'), hidden: document.getElementById('touch')?.classList.contains('hidden'), coarse: __ladera.ctx.flow.coarse,
    mode: __ladera.ctx.flow.mode, lock: !!document.pointerLockElement, toast: document.getElementById('toast')?.textContent ?? '', stick: !!document.querySelector('#touch .stick'),
    menu: (() => { const r = document.getElementById('menubtn').getBoundingClientRect(); return r.width > 0 && r.height > 0; })(), label: document.getElementById('gl').getAttribute('aria-label') })`));
  assert.equal(m.mode, 'play', `${label}: Entrar by finger starts the game`);
  assert.equal(m.body, true, `${label}: body.touch`); assert.equal(m.coarse, true, `${label}: flow.coarse`);
  assert.ok(m.ui && m.stick && m.hidden === false, `${label}: the touch layer is built and shown while playing`);
  assert.equal(m.lock, false, `${label}: no pointer lock is asked of a finger`);
  assert.match(m.toast, /Palanca a la izquierda/, `${label}: the first hint speaks of the thumbs`); assert.doesNotMatch(m.toast, /W A S D|Esc/, `${label}: not of the keyboard`);
  assert.ok(m.menu, `${label}: the menu button is on screen`);
  assert.doesNotMatch(m.label, /W A S D|Haz clic/, `${label}: nor does the screen-reader name of the view`);

  // drag on the right half looks (R2d: yaw stayed at 0). The page runs ?manual (no frame loop), so the frames are stepped by hand after the finger moved.
  const s0 = await t.state();
  await t.down(280, 400); for (let i = 1; i <= 10; i++) { await t.move(280 - i * 12, 400); await delay(30); } await t.up();
  await page.eval('__ladera.step(4)');
  const s1 = await t.state();
  assert.ok(Math.abs(s1.yaw - s0.yaw) > 0.05, `${label}: a 120 px drag turned the view (yaw ${s0.yaw} -> ${s1.yaw})`);
  assert.ok(dist(s0, s1) < 0.05, `${label}: and moved nobody`);

  // the stick: a thumb held in the lower left walks the player (a second of game time with the thumb down)
  await t.down(80, 700); for (let i = 1; i <= 8; i++) { await t.move(80, 700 - i * 7); await delay(40); }
  const mid = JSON.parse(await page.eval(`JSON.stringify({ f: __ladera.ctx.player.input.f, idle: document.querySelector('#touch .stick').classList.contains('idle') })`));
  await page.eval('__ladera.step(60)');
  const s2 = await t.state();
  await t.up(); await delay(150);
  assert.ok(mid.f > 0.5 && mid.idle === false, `${label}: the stick is pushed forward under the thumb: ${JSON.stringify(mid)}`);
  assert.ok(dist(s1, s2) > 0.8, `${label}: the player walked ${dist(s1, s2).toFixed(2)} m in a second with the stick held`);
  assert.equal(await page.eval('__ladera.ctx.player.input.f'), 0, `${label}: the stick lets go on release`);

  // a short, steady touch on the right half is E; a drag is not
  await page.eval(`(() => { const i = __ladera.ctx.interact; window.__uses = 0; const u = i.use.bind(i); i.use = (...a) => { window.__uses++; return u(...a); }; })()`);
  await t.tap(300, 300, 80); await delay(150);
  assert.equal(await page.eval('window.__uses'), 1, `${label}: a tap on the right half uses what the crosshair is on`);
  await t.down(300, 300); for (let i = 1; i <= 6; i++) { await t.move(300 + i * 10, 300); await delay(20); } await t.up(); await delay(150);
  assert.equal(await page.eval('window.__uses'), 1, `${label}: a drag does not`);
  await t.down(300, 300); await delay(600); await t.up(); await delay(150);
  assert.equal(await page.eval('window.__uses'), 1, `${label}: nor does a long rest of the thumb`);
  const [ux, uy] = await t.centre('#touch .tbtn.use'); await t.tap(ux, uy); await delay(150);
  assert.equal(await page.eval('window.__uses'), 2, `${label}: the E button still does`);

  // the run toggle: on, it sets the sprint input; off, it clears it
  const [rx, ry] = await t.centre('#touch .tbtn.run');
  await t.tap(rx, ry); await delay(100);
  assert.equal(await page.eval('__ladera.ctx.player.input.sprint'), true, `${label}: run on`);
  assert.equal(await page.eval(`document.querySelector('#touch .tbtn.run').classList.contains('on')`), true);
  await t.tap(rx, ry); await delay(100);
  assert.equal(await page.eval('__ladera.ctx.player.input.sprint'), false, `${label}: run off`);

  // the map button opens the map over the game, its X closes it again
  const [mx, my] = await t.centre('#touch .tbtn.map'); await t.tap(mx, my); await delay(500);
  const p = await t.state(); assert.deepEqual([p.mode, p.panel], ['panel', 'map'], `${label}: the map button opens the map`);
  const [cx, cy] = await t.centre('#panelclose'); await t.tap(cx, cy); await delay(400);
  assert.equal((await t.state()).mode, 'play', `${label}: and the panel's own X closes it`);

  // the pause menu button, then Continuar
  const [bx, by] = await t.centre('#menubtn'); await t.tap(bx, by); await delay(400);
  assert.equal((await t.state()).mode, 'paused', `${label}: the menu button pauses`);
  const [rsx, rsy] = await t.centre('#resume'); await t.tap(rsx, rsy); await delay(400);
  assert.equal((await t.state()).mode, 'play', `${label}: Continuar by finger plays again`);
  const sum = page.summary(); assert.deepEqual([sum.errors, sum.netErrors, sum.consoleErrors, sum.consoleWarnings], [[], [], [], []], `${label}: a clean console`);
}

test('a phone whose touch emulation is on from the start (no ?touch) gets the touch layer, and every control answers a real finger', async () => {
  const t = await phone('before');
  try {
    const pre = JSON.parse(await t.page.eval(`JSON.stringify({ body: document.body.classList.contains('touch'), ui: !!document.getElementById('touch') })`));
    assert.deepEqual([pre.body, pre.ui], [true, true], 'the touch layer is there from the title card on');
    await playThrough(t, 'phone');
  } finally { await t.close(); }
});

test('a page that learns it is on a phone after it loaded (R2d-001: emulation switched on late) turns the touch layer on by itself', async () => {
  const t = await phone('after');
  try {
    // the primary pointer became coarse: the media query's change event is enough, before any finger lands
    const pre = JSON.parse(await t.page.eval(`JSON.stringify({ q: matchMedia('(pointer: coarse)').matches, body: document.body.classList.contains('touch'), ui: !!document.getElementById('touch') })`));
    assert.equal(pre.q, true, 'the browser now says coarse');
    assert.equal(pre.body, true, 'and the page followed it: body.touch');
    assert.equal(pre.ui, true, 'and built the touch layer');
    await playThrough(t, 'late phone');
  } finally { await t.close(); }
});

test('the first finger alone turns the layout on, when the media query never changes (a laptop with a touch screen); a mouse never does', async () => {
  const t = await phone('none');
  try {
    const { page } = t;
    assert.equal(await page.eval(`matchMedia('(pointer: coarse)').matches`), false, 'a desktop pointer');
    const off = JSON.parse(await page.eval(`JSON.stringify({ body: document.body.classList.contains('touch'), ui: !!document.getElementById('touch'), label: document.getElementById('gl').getAttribute('aria-label') })`));
    assert.deepEqual([off.body, off.ui], [false, false], 'the desktop page has no touch layer');
    assert.match(off.label, /W A S D/, 'and its canvas speaks of the keyboard');
    // a mouse press anywhere changes nothing
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 300, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 300, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    await delay(150);
    assert.equal(await page.eval(`document.body.classList.contains('touch')`), false, 'a click is not a finger');
    // a finger does (a pen is not one either)
    await page.eval(`window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', bubbles: true }))`); await delay(80);
    assert.equal(await page.eval(`document.body.classList.contains('touch')`), false, 'a pen is not a finger');
    await page.eval(`document.getElementById('start').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }))`); await delay(150);
    const on = JSON.parse(await page.eval(`JSON.stringify({ body: document.body.classList.contains('touch'), ui: !!document.querySelector('#touch .stick'), coarse: __ladera.ctx.flow.coarse, label: document.getElementById('gl').getAttribute('aria-label'),
      tkeys: getComputedStyle(document.querySelector('#title .tkeys')).display, keys: getComputedStyle(document.querySelector('#title .keys')).display })`));
    assert.equal(on.body, true, 'a finger: body.touch'); assert.equal(on.ui, true, 'the layer is built'); assert.equal(on.coarse, true, 'flow.coarse');
    assert.equal(on.tkeys, 'flex', 'the title card shows the phone strip'); assert.equal(on.keys, 'none', 'and hides the keyboard one');
    assert.doesNotMatch(on.label, /W A S D/);
    await page.eval(`document.getElementById('start').click()`); await delay(500);
    const m = JSON.parse(await page.eval(`JSON.stringify({ mode: __ladera.ctx.flow.mode, toast: document.getElementById('toast')?.textContent ?? '', lock: !!document.pointerLockElement, hidden: document.getElementById('touch').classList.contains('hidden') })`));
    assert.equal(m.mode, 'play'); assert.match(m.toast, /Palanca a la izquierda/); assert.equal(m.lock, false); assert.equal(m.hidden, false);
    const sum = page.summary(); assert.deepEqual([sum.errors, sum.netErrors, sum.consoleErrors, sum.consoleWarnings], [[], [], [], []]);
  } finally { await t.close(); }
});

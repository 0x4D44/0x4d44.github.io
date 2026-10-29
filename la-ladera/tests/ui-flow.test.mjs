// Title / pause / panel flow, hotkeys, settings, discovery toast and the layout contract (owner: A1), in headless Chrome.
// Quiet box: the browser comes only from tests/chrome.mjs (pointer lock is simulated there, speech is recorded).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-flow.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, page;
const OVER = 'document.documentElement.scrollWidth - document.documentElement.clientWidth';
// interactive elements that are visibly on screen and overlap the Almanac pill box [0,0,109,41] by >= 6 px in both axes
const UNDER_PILL = `(() => {
  const out = [], pill = { l: 0, t: 0, r: 109, b: 41 };
  for (const el of document.querySelectorAll('a, button, input, select, textarea, [role=button]')) {
    const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    const ow = Math.min(r.right, pill.r) - Math.max(r.left, pill.l), oh = Math.min(r.bottom, pill.b) - Math.max(r.top, pill.t);
    if (ow >= 6 && oh >= 6) out.push((el.id || el.className || el.tagName) + ':' + (el.textContent || '').trim().slice(0, 20));
  }
  return out;
})()`;
const S = () => page.eval(`(() => { const c = __ladera.ctx; return { mode: c.mode, running: c.running, lock: document.pointerLockElement ? document.pointerLockElement.id : null,
  title: !document.getElementById('title').classList.contains('hidden'), pause: !document.getElementById('pause').classList.contains('hidden'),
  panel: !document.getElementById('panel').classList.contains('hidden'), ptitle: document.getElementById('paneltitle').textContent, hud: !document.getElementById('hud').classList.contains('off') }; })()`);
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?manual');
});
after(async () => { await b?.close(); });

test('boots to the title card: enabled start button, live view behind it, no errors', async () => {
  const s = await S();
  assert.equal(s.mode, 'title'); assert.equal(s.title, true); assert.equal(s.running, false); assert.equal(s.hud, false);
  assert.equal(await page.eval('document.getElementById("start").disabled'), false);
  assert.match(await page.eval('document.getElementById("start").textContent'), /Entrar/);
  assert.equal(await page.eval('__ladera.ctx.errors.length'), 0);
});

test('Entrar -> play with pointer lock; Esc pauses; Continuar resumes', async () => {
  await page.eval('document.getElementById("start").click()'); await tick();
  let s = await S();
  assert.deepEqual([s.mode, s.running, s.title, s.hud, s.lock], ['play', true, false, true, 'gl']);
  await page.key('Escape'); await tick();
  s = await S();
  assert.deepEqual([s.mode, s.running, s.pause, s.lock, s.hud], ['paused', false, true, null, false]);
  await page.eval('document.getElementById("resume").click()'); await tick();
  s = await S();
  assert.deepEqual([s.mode, s.running, s.pause, s.lock], ['play', true, false, 'gl']);
});

test('losing the pointer lock (the browser handles Esc that way) pauses', async () => {
  await page.eval('document.exitPointerLock()'); await tick(120);
  assert.equal((await S()).mode, 'paused');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('M / J / H open panels from play; the same key toggles back to play; Esc from a panel lands in the pause menu', async () => {
  for (const [code, title] of [['KeyM', 'Mapa del barrio'], ['KeyJ', 'Diario del barrio'], ['KeyH', 'Ayuda']]) {
    await page.key(code); await tick();
    let s = await S();
    assert.deepEqual([s.mode, s.running, s.panel, s.ptitle, s.lock], ['panel', false, true, title, null], code);
    await page.key(code); await tick();
    s = await S();
    assert.deepEqual([s.mode, s.running, s.panel, s.lock], ['play', true, false, 'gl'], code + ' toggle');
  }
  await page.key('KeyM'); await tick(); await page.key('Escape'); await tick();
  let s = await S();
  assert.deepEqual([s.mode, s.panel, s.pause], ['paused', false, true]);
  await page.key('KeyJ'); await tick();                                            // panel over the pause menu
  s = await S();
  assert.deepEqual([s.mode, s.panel, s.pause], ['panel', true, true]);
  await page.key('Escape'); await tick();
  s = await S();
  assert.equal(s.mode, 'paused');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('hotkeys are ignored while typing in a form field and while a dialogue holds the player', async () => {
  await page.eval('__ladera.ctx.player.lock("dialogue")');
  await page.key('KeyM'); await tick();
  assert.equal((await S()).mode, 'play', 'a dialogue owns the keyboard');
  await page.eval('__ladera.ctx.player.unlock("dialogue")');
  await page.key('Escape'); await tick();
  await page.eval('document.querySelector("#pause [data-open=settings]").click()'); await tick();
  assert.equal((await S()).ptitle, 'Ajustes');
  await page.eval('document.querySelector("#panelbody select").dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", bubbles: true }))'); await tick();
  assert.equal((await S()).ptitle, 'Ajustes', 'typing in a select must not switch panels');
  await page.key('Escape'); await tick();
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('settings apply live and persist', async () => {
  await page.eval('__ladera.ctx.settings.set("fov", 90); __ladera.step(2)');
  assert.ok(Math.abs((await page.eval('__ladera.ctx.camera.fov')) - 90) < 0.6);
  assert.equal(JSON.parse(await page.eval('localStorage.getItem("la-ladera.settings.v1")')).fov, 90);
  await page.eval('__ladera.ctx.settings.set("quality", "low")');
  assert.equal(await page.eval('__ladera.ctx.quality'), 'low');
  await page.eval('__ladera.ctx.settings.set("quality", "auto")');
  assert.equal(await page.eval('__ladera.ctx.qualityMode'), 'auto');
  await page.eval('__ladera.ctx.settings.set("fov", 999)');                        // out of range values are clamped, never stored raw
  assert.equal(await page.eval('__ladera.ctx.settings.v.fov'), 100);
  await page.eval('__ladera.ctx.settings.reset()');
  assert.equal(await page.eval('__ladera.ctx.settings.v.fov'), 72);
});

test('"Cómo te llaman": the address setting defaults to m, is a select in Ajustes, is validated, persisted and reset', async () => {
  assert.equal(await page.eval('__ladera.ctx.settings.v.address'), 'm', 'default: vecino, mijo, señor');
  await page.key('Escape'); await tick();
  await page.eval('document.querySelector("#pause [data-open=settings]").click()'); await tick();
  const sel = 'document.querySelector("#panelbody select[aria-label^=\\"Cómo te llaman\\"]")';
  assert.deepEqual(await page.eval(`[...${sel}.options].map((o) => o.value)`), ['m', 'f']);
  assert.equal(await page.eval(`${sel}.value`), 'm');
  await page.eval(`${sel}.value = "f"; ${sel}.dispatchEvent(new Event("change", { bubbles: true }))`);
  assert.equal(await page.eval('__ladera.ctx.settings.v.address'), 'f');
  assert.equal(JSON.parse(await page.eval('localStorage.getItem("la-ladera.settings.v1")')).address, 'f', 'persisted like the other keys');
  await page.eval('__ladera.ctx.settings.set("address", "x")');                     // like every enum key: anything but m / f falls back to the default, never stored raw
  assert.equal(await page.eval('__ladera.ctx.settings.v.address'), 'm');
  assert.equal(JSON.parse(await page.eval('localStorage.getItem("la-ladera.settings.v1")')).address, 'm');
  await page.eval('__ladera.ctx.settings.set("address", "f"); __ladera.ctx.settings.reset()');
  assert.equal(await page.eval('__ladera.ctx.settings.v.address'), 'm', 'reset restores the default');
  await page.key('Escape'); await tick();
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('the place label and the discovery toast follow the player', async () => {
  await page.eval('__ladera.step(2)');
  assert.ok((await page.eval('document.getElementById("place").textContent')).length > 2, 'a place name is shown at the spawn');
  await page.eval(`(() => { const c = __ladera.ctx, p = c.player.s; c.discover.register({ id: 'ui-test', name: 'Mural de prueba', en: 'A test mural', x: p.x, y: p.y, z: p.z, radius: 4, kind: 'mural' }); __ladera.step(2); })()`);
  assert.deepEqual(await page.eval('__ladera.ctx.discover.order'), ['ui-test']);
  assert.match(await page.eval('document.getElementById("toast").textContent'), /Mural de prueba/);
  await page.key('KeyJ'); await tick();
  assert.match(await page.eval('document.getElementById("panelbody").textContent'), /1 de 1 descubrimientos[\s\S]*Mural de prueba/);
  await page.key('KeyJ'); await tick();
  assert.equal((await S()).mode, 'play');
});

for (const [w, h] of [[390, 844], [768, 1024], [1280, 720]]) {
  test(`layout at ${w}x${h}: no sideways scroll, nothing tappable under the Almanac pill, in every screen`, async () => {
    await page.viewport(w, h); await tick(200);
    const check = async (label) => {
      assert.ok((await page.eval(OVER)) <= 1, `${label}: scrolls sideways`);
      assert.deepEqual(await page.eval(UNDER_PILL), [], `${label}: a control sits under the Almanac pill`);
    };
    if ((await S()).mode === 'play') { await page.key('Escape'); await tick(); }
    await check('pause');
    for (const name of ['map', 'journal', 'help', 'settings']) {
      await page.eval(`document.querySelector('#pause [data-open=${name}]').click()`); await tick(120);
      await check(`panel ${name}`);
      await page.key('Escape'); await tick();
    }
    await page.eval('document.getElementById("resume").click()'); await tick();
    await check('play');
    await page.viewport(1280, 720);
  });
}

test('no console errors, warnings or failed requests during all of the above', async () => {
  const sum = page.summary();
  // Chrome warns when an AudioContext is created from a script-made (untrusted) key event: that is this test's page.key(), a person's key is fine
  const warnings = sum.consoleWarnings.filter((w) => !/AudioContext was not allowed to start/.test(w));
  assert.deepEqual([sum.errors, sum.netErrors, sum.consoleErrors, warnings], [[], [], [], []]);
  assert.equal(await page.eval('__ladera.ctx.errors.length'), 0);
});

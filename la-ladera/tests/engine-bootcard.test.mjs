// The loading card in the real page (owner: A1: js/main.js, js/core/bootbar.js, index.html; the table and the arithmetic are tests/engine-bootbar.test.mjs).
// Review R2c-013: at 8 Mbit/s and 120 ms the title is ready after 44-55 s; the first 3 s show no text and the bar at 0; from about 40 s the bar sits at 100 % with
// 'Calentando la primera vista...' for 10-15 s and looks hung. One boot, watched from before the first script (a MutationObserver on the message and the bar, the long
// tasks, the calls to fetch), with the people models held back for 5 s so that the 'people' stage really has to wait:
//   * the card already says something when the HTML has been parsed;
//   * the stage that waits does not leave the bar standing still;
//   * the warm-up frame blocks the page for seconds: its label is handed to the browser (a task boundary) before the frame runs, and the bar reads well under 100 % then;
//   * the engine's animation loop starts after the warm-up frame (its first frame is the heaviest real one; ahead of the warm-up it froze the page with the card unpainted);
//   * the people models (9.5 MB, the biggest download) are asked for once, while the rooms are furnished, not after the houses are built.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-bootcard.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const HOLD_MS = 5000;
let b, page, T;
const HOOK = `(() => {
  const T = window.__card = { first: null, label: [], bar: [], finish: null, peopleFetch: [], metaFetch: [], raf: 0 };
  const raf0 = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf0((t) => { T.raf++; return cb(t); });       // the animation frames the page has been given
  // 'interactive' = the HTML is parsed and no script has run yet (the module scripts run after it, before DOMContentLoaded): the card as the HTML alone made it
  document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive' && !T.first) T.first = { msg: document.getElementById('loadmsg')?.textContent ?? null, bar: document.getElementById('loadbar')?.getAttribute('aria-valuenow') ?? null }; });
  const watch = () => {
    const msg = document.getElementById('loadmsg'), bar = document.getElementById('loadbar'); if (!msg || !bar) return false;
    new MutationObserver(() => T.label.push([performance.now(), msg.textContent, T.raf])).observe(msg, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => T.bar.push([performance.now(), +bar.getAttribute('aria-valuenow')])).observe(bar, { attributes: true, attributeFilter: ['aria-valuenow'] });
    return true;
  };
  if (!watch()) { const mo = new MutationObserver(() => { if (watch()) mo.disconnect(); }); mo.observe(document, { childList: true, subtree: true }); }
  // the warm-up frame ends with gl.finish() (nothing else calls it during a boot): had the card's new message been handed to the browser by then? A MutationObserver is
  // told when the script that changed the message gives control back, so it already has the message only if the stage let go of the page before drawing.
  const fin = WebGL2RenderingContext.prototype.finish;
  // frames: the real frames (ctx.render()) the game had drawn by then; the warm-up frame goes through the post chain directly and is not counted
  WebGL2RenderingContext.prototype.finish = function () { if (!T.finish) T.finish = { at: performance.now(), sawLabel: T.label.some((l) => /^Calentando/.test(l[1])), raf: T.raf, visible: document.visibilityState === 'visible', frames: window.__ladera?.ctx?.stats?.frames ?? -1 }; return fin.call(this); };
  // the people models are held until the test lets them go; every call to fetch for them is noted when it is MADE (the request itself starts later)
  let release; const held = new Promise((r) => { release = r; }); window.__holdPeople = { release };
  const f = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = String(u?.url ?? u);
    if (/people\\/people\\.glb/.test(url)) { T.peopleFetch.push(performance.now()); return held.then(() => f(u, o)); }
    if (/people\\/people_meta\\.json/.test(url)) T.metaFetch.push(performance.now());
    return f(u, o);
  };
})()`;

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = b.page;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await page.send('Page.navigate', { url: `${b.baseUrl}/la-ladera/index.html?autostart` });
  await page.waitFor(`!!window.__card && window.__card.label.some((l) => /^Despertando/.test(l[1]))`, 120000, 100);        // the people stage has begun: it waits for the models
  await new Promise((r) => setTimeout(r, HOLD_MS));
  await page.eval('window.__holdPeople.release()');
  await page.waitFor('!!window.__ladera && !!window.__ladera.ready', 60000);
  const r = await page.send('Runtime.evaluate', { expression: 'window.__ladera.ready.then(() => true, (e) => String(e))', awaitPromise: true, returnByValue: true }, 240000);
  assert.equal(r.result.value, true, 'the game booted once the models were let through');
  await new Promise((r2) => setTimeout(r2, 1500));                                           // the long-task entries arrive after the task
  T = JSON.parse(await page.eval('JSON.stringify(window.__card)'));
  T.after = JSON.parse(await page.eval('JSON.stringify({ frames: __ladera.ctx.stats.frames, visible: document.visibilityState === "visible" })'));
});
after(async () => { await b?.close(); });

test('the card already says something when the parser reaches the end of the HTML, before any script has run', () => {
  assert.ok(T.first && (T.first.msg ?? '').replace(/ /g, ' ').trim().length > 5, `#loadmsg when the HTML was parsed: ${JSON.stringify(T.first)}`);
});

test('a stage that only waits does not leave the bar standing still (the people stage, held for 5 s)', () => {
  const start = T.label.find(([, t]) => /^Despertando/.test(t));
  assert.ok(start, 'the people stage was announced');
  const during = T.bar.filter(([t]) => t >= start[0] - 1 && t <= start[0] + HOLD_MS - 300).map((x) => x[1]);
  const distinct = [...new Set(during)];
  assert.ok(distinct.length >= 3, `the bar moved ${distinct.length - 1} time(s) in the ${HOLD_MS / 1000} s the stage waited: ${JSON.stringify(during)}`);
  for (let i = 1; i < during.length; i++) assert.ok(during[i] >= during[i - 1], `and never went back: ${JSON.stringify(during)}`);
});

test('the warm-up label is on the card before the frame that blocks the page, and the bar reads well under 100 % then', () => {
  const warm = T.label.find(([, t]) => /^Calentando/.test(t));
  assert.ok(warm, `the card said it was warming up: ${JSON.stringify(T.label.map((l) => l[1]))}`);
  assert.ok(T.finish, 'the warm-up frame ran');
  assert.equal(T.finish.sawLabel, true, `the message was set in the same task as the frame that blocks the page (it was handed over at ${warm[0].toFixed(1)} ms, the frame ended at ${T.finish.at.toFixed(1)} ms): nobody sees it before the freeze`);
  assert.ok(warm[0] < T.finish.at, 'and it came before the frame');
  // a message handed over is not yet a message painted: the page has to be given an animation frame between the two (a hidden page gets none: the stage then waits ~100 ms)
  if (T.finish.visible) assert.ok(T.finish.raf - warm[2] >= 1, `the browser got ${T.finish.raf - warm[2]} animation frame(s) between the message and the warm-up frame: nothing was painted`);
  else assert.ok(T.finish.at - warm[0] >= 90, `a hidden page gets no frame: the stage waits instead (${(T.finish.at - warm[0]).toFixed(0)} ms)`);
  const at = T.bar.filter(([t]) => t <= warm[0] + 1).pop();
  assert.ok(at && at[1] <= 90, `while it runs the bar reads ${at?.[1]} %`);
});

test('no real frame is drawn before the warm-up frame (the first one compiles and uploads what the camera sees: it must not be the one that freezes the unpainted card), and the loop runs once the boot is done', () => {
  assert.ok(T.finish, 'the warm-up frame ran');
  assert.equal(T.finish.frames, 0, `${T.finish.frames} real frame(s) were drawn before the warm-up frame: the engine's first animation frame ran ahead of it`);
  // a hidden page is given no animation frames at all: the loop is then built but nothing can be counted
  if (T.after.visible) assert.ok(T.after.frames >= 3, `the loop ran after the warm-up: ${T.after.frames} frames 1.5 s after the boot`);
});

test('the bar only goes forward, and it is not full for long before the card says "Listo"', () => {
  const v = T.bar.map((x) => x[1]);
  assert.ok(v.length > 15, `the bar moved ${v.length} times`);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1], `the bar went back at step ${i}: ${v[i - 1]} -> ${v[i]}`);
  const full = T.bar.find(([, p]) => p >= 100), done = T.label.find(([, t]) => t === 'Listo');
  assert.ok(full && done, 'the bar filled and the card said Listo');
  assert.ok(done[0] - full[0] < 500, `the bar stood full for ${(done[0] - full[0]).toFixed(0)} ms before "Listo"`);
});

test('the people models are asked for once, while the rooms are furnished, before the houses are built', () => {
  const building = T.label.find(([, t]) => /^Construyendo/.test(t));
  assert.ok(building, 'the build stage was announced');
  assert.equal(T.peopleFetch.length, 1, 'people.glb was asked for once');
  assert.equal(T.metaFetch.length, 1, 'and so was people_meta.json: the early start and the people stage share ONE load (a second one is a second PeopleWorld; three coalesces the model request, the JSON it does not)');
  assert.ok(T.peopleFetch[0] < building[0], `people.glb was asked for at ${T.peopleFetch[0].toFixed(0)} ms, the houses started at ${building[0].toFixed(0)} ms`);
});

test('nothing in the console', () => {
  const s = page.summary();
  assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
});

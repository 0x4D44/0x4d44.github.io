// Title / pause / panel flow, hotkeys, settings, discovery toast and the layout contract (owner: A1), in headless Chrome.
// Quiet box: the browser comes only from tests/chrome.mjs (pointer lock is simulated there, speech is recorded).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-flow.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';
import { KIND } from '../js/ui/panels.js';
import { LM_PRI } from '../js/ui/map.js';

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
// Closes whatever a failed assertion left open (a panel, the pause card) and goes on to the game, so that one red test does not turn every test after it red too.
// The tests of R2c-016 register it with t.after(): they end on a panel or the pause card when they fail.
const backToPlay = async () => {
  for (let i = 0; i < 3; i++) {
    const m = (await S()).mode;
    if (m === 'panel') await page.eval('__ladera.ctx.flow.closePanel()');
    else if (m === 'paused') await page.eval('document.getElementById("resume").click()');
    else return;
    await tick(150);
  }
};

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

test('the page keeps Chrome from offering to translate it (Arthur: the translate bar): <html lang="en" translate="no"> and <meta name="google" content="notranslate">; the Spanish the game shows says lang="es", its English lines lang="en"', async () => {
  const m = JSON.parse(await page.eval(`(() => {
    const c = __ladera.ctx, u = c.people._world.ui, q = (s) => document.querySelector(s), r = {};
    const l = (s) => q(s)?.closest('[lang]')?.getAttribute('lang') ?? null;                       // the language that applies to the element: its own lang or the nearest ancestor's
    r.html = [document.documentElement.getAttribute('lang'), document.documentElement.getAttribute('translate'), q('meta[name="google"]')?.getAttribute('content') ?? null];
    c.ui.subtitle({ who: 'Marta', es: 'Buenas tardes, vecino.', en: 'Good afternoon, neighbour.' }); r.subtitle = [l('#subtitle .es'), l('#subtitle .en')]; c.ui.subtitle(null);
    c.ui.toast({ tag: 'Hallazgo', title: 'La olla', sub: 'The pot' }, 50); r.toast = [l('#toast b'), l('#toast span')];
    u.show({ name: 'Marta', role: 'tendera' }, {}); u.setChoices([{ id: 'a', es: 'Buenas tardes.', en: 'Good afternoon.' }]); r.dialogue = [l('#dlg'), l('#dlg .es'), l('#dlg .en')]; u.hide();
    r.cards = ['#title .card', '#pause .card', '#nogl .card', '#fatal .card', '#gl'].map(l);
    return JSON.stringify(r); })()`));
  assert.deepEqual(m, {
    html: ['en', 'no', 'notranslate'],                     // <html lang translate> and the meta: the document says it is English, not to be translated, and says so to Chrome
    subtitle: ['es', 'en'],                                // a subtitle: the Spanish line, the English line
    toast: ['es', 'en'],                                   // a discovery toast: the Spanish title, the English line
    dialogue: ['es', 'es', 'en'],                          // the conversation card, its answers (Spanish) and the English small under them
    cards: ['es', 'es', 'es', 'es', 'es'],                 // the title, pause, no-WebGL and error cards, and the view (its aria-label)
  });
});

test('the title card lists every key the game uses (Espacio, C, Esc, J, 1-4 included) and the strip wraps inside a phone screen with the start button in view', async () => {
  const kbds = await page.eval('[...document.querySelectorAll("#title .keys kbd")].map((k) => k.textContent)');
  for (const k of ['W', 'A', 'S', 'D', 'Shift', 'Espacio', 'C', 'E', '1', '2', '3', '4', 'M', 'J', 'H', 'Esc']) assert.ok(kbds.includes(k), `the key strip lists ${k}: ${kbds}`);
  assert.ok(!kbds.some((k) => /ctrl|control/i.test(k)), 'Ctrl is not a game key');
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await page.viewport(w, h); await tick(200);
    const m = JSON.parse(await page.eval(`(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(), k = r('#title .keys'), c = r('#title .card'), s = r('#start');
      const sp = [...document.querySelectorAll('#title .keys > span')].map((e) => e.getBoundingClientRect());
      return JSON.stringify({ over: ${OVER}, kl: k.left, kr: k.right, sl: Math.min(...sp.map((q) => q.left)), sr: Math.max(...sp.map((q) => q.right)), cl: c.left, cr: c.right, startTop: s.top, startBottom: s.bottom, vh: innerHeight, vw: innerWidth }); })()`));
    assert.ok(m.over <= 1, `${w}x${h}: the title card scrolls sideways`);
    assert.ok(m.kl >= m.cl - 1 && m.kr <= m.cr + 1 && m.cr <= m.vw + 1, `${w}x${h}: the key strip stays inside the card: ${JSON.stringify(m)}`);
    assert.ok(m.sl >= m.cl - 1 && m.sr <= m.cr + 1, `${w}x${h}: every key in the strip stays inside the card (the strip wraps): ${JSON.stringify(m)}`);
    assert.ok(m.startTop >= 0 && m.startBottom <= m.vh, `${w}x${h}: the start button is on screen without scrolling: ${JSON.stringify(m)}`);
  }
  await page.viewport(1280, 720); await tick(200);
});

test('R2a-010: once the game is ready the loading bar and message are gone (not faded under the button), and nothing visible on the title card touches the start button, at 1280x720, 390x844 and 768x1024', async () => {
  for (const [w, h] of [[1280, 720], [390, 844], [768, 1024]]) {
    await page.viewport(w, h); await tick(250);
    const m = JSON.parse(await page.eval(`(() => { const R = (e) => e.getBoundingClientRect(), s = R(document.getElementById('start'));
      const gone = ['loadmsg', 'loadbar'].map((id) => getComputedStyle(document.getElementById(id)).display);
      const shown = [...document.querySelectorAll('#title .card > *:not(#start)')].filter((e) => { const cs = getComputedStyle(e), r = R(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 0 && r.height > 0 && e.textContent.trim(); });
      const hit = shown.filter((e) => { const r = R(e); return r.left < s.right + 1 && r.right > s.left - 1 && r.top < s.bottom + 1 && r.bottom > s.top - 1; }).map((e) => e.id || e.className || e.tagName);
      return JSON.stringify({ gone, hit, shown: shown.length, mode: document.getElementById('title').className }); })()`));
    assert.ok(/ready/.test(m.mode), `${w}x${h}: the title card is in its ready state`);
    assert.deepEqual(m.gone, ['none', 'none'], `${w}x${h}: #loadmsg and #loadbar take no room once ready: ${JSON.stringify(m)}`);
    assert.ok(m.shown >= 4, `${w}x${h}: the card's own text is still there (${m.shown} blocks)`);
    assert.deepEqual(m.hit, [], `${w}x${h}: no visible block of the card touches the start button (1 px margin): ${JSON.stringify(m)}`);
  }
  await page.viewport(1280, 720); await tick(200);
});

// R2c-016: a panel closes to where it was opened from. The title card is the third place (the others: the game and the pause menu, in the hotkeys test below).
test('a panel opened over the title card closes back to the title card: H opens Ayuda there, Esc returns, M does nothing there (R2c-016)', async (t) => {
  t.after(backToPlay);                                                                              // a panel left open over the title card by a red run is closed again
  assert.equal((await S()).mode, 'title');
  await page.key('KeyM'); await tick();
  assert.equal((await S()).mode, 'title', 'M does nothing on the title card');
  await page.key('KeyH'); await tick();
  let s = await S();
  assert.deepEqual([s.mode, s.panel, s.ptitle], ['panel', true, 'Ayuda'], 'H opens Ayuda over the title card');
  await page.key('Escape'); await tick();
  s = await S();
  assert.deepEqual([s.mode, s.title, s.panel, s.running], ['title', true, false, false], 'Esc goes back to the title card, not into the game');
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

test('M / J / H open panels from play and the same key toggles back; Esc closes a panel to where it was opened from: the game over play (R2c-016), the pause menu over the pause menu; Esc in the game is the pause menu', async (t) => {
  t.after(backToPlay);
  for (const [code, title] of [['KeyM', 'Mapa del barrio'], ['KeyJ', 'Diario del barrio'], ['KeyH', 'Ayuda']]) {
    await page.key(code); await tick();
    let s = await S();
    assert.deepEqual([s.mode, s.running, s.panel, s.ptitle, s.lock], ['panel', false, true, title, null], code);
    await page.key(code); await tick();
    s = await S();
    assert.deepEqual([s.mode, s.running, s.panel, s.lock], ['play', true, false, 'gl'], code + ' toggle');
    // R2c-016: Esc does what the key does and what the reader does: the panel was opened over the game, so Esc closes it back to the game (the pointer asked for again), not into the pause menu
    await page.key(code); await tick(); await page.key('Escape'); await tick();
    s = await S();
    assert.deepEqual([s.mode, s.running, s.panel, s.pause, s.lock, s.hud], ['play', true, false, false, 'gl', true], code + ' then Esc: back in the game');
  }
  // Ajustes has no key of its own: the flow opens it over the game (the pause card's button does it over the pause menu), and Esc treats it the same
  await page.eval('__ladera.ctx.flow.openPanel("settings")'); await tick();
  let s = await S();
  assert.deepEqual([s.mode, s.running, s.ptitle], ['panel', false, 'Ajustes'], 'Ajustes is open over the game');
  await page.key('Escape'); await tick();
  s = await S();
  assert.deepEqual([s.mode, s.running, s.panel, s.pause, s.lock], ['play', true, false, false, 'gl'], 'Ajustes then Esc: back in the game');
  await page.key('Escape'); await tick();                                          // with no panel open, Esc in the game is the pause menu as ever
  s = await S();
  assert.deepEqual([s.mode, s.running, s.panel, s.pause], ['paused', false, false, true], 'Esc in the game pauses');
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

test('Esc during a conversation only leaves the talk: the pause menu does not open on top of it; with no conversation Esc pauses as usual', async () => {
  await page.eval('__ladera.ctx.player.lock("dialogue")');
  await page.key('Escape'); await tick();
  assert.equal((await S()).mode, 'play', 'a conversation owns Esc (the dialogue panel leaves on it)');
  await page.eval('__ladera.ctx.player.unlock("dialogue")');
  await page.key('Escape'); await tick();
  assert.equal((await S()).mode, 'paused', 'no conversation: Esc pauses');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

// R2b (round 2): in a real browser Esc is NOT a key while the pointer is locked: the browser eats it, drops the lock and sends no keydown. The old flow
// paused on that lost lock, so Esc during a conversation opened the pause menu on top of it and the keydown emulation above never saw it. The conversation
// now lets go of the pointer on purpose when it opens (Esc, Q and 1-4 then arrive as keys) and asks for it back when it ends.
const LOCK = '__ladera.ctx.player';
const shopkeepers = () => page.eval('__ladera.npcs().filter((n) => n.shop && n.drawn).map((n) => n.id)');
const talkTo = async (k = 0) => {
  const id = (await shopkeepers())[k];
  assert.ok(id, `shopkeeper ${k} to talk to`);
  assert.equal(await page.eval(`__ladera.ctx.people.talk(${JSON.stringify(id)})`), true, 'the conversation started');
  await tick(150);
};
const held = () => page.eval(`${LOCK}.locked`);
test('a conversation lets go of the pointer, so Esc is a key again: Esc leaves the talk, the pointer comes back, the game never pauses (real people.talk, real dialogue panel)', async () => {
  let s = await S(); assert.deepEqual([s.mode, s.lock], ['play', 'gl'], 'play, pointer locked');
  await talkTo();
  s = await S();
  assert.deepEqual([s.mode, s.lock, await held()], ['play', null, true], 'talking: still play, the player is held, the pointer was let go on purpose');
  assert.equal(await page.eval('!document.getElementById("dlg").hidden'), true, 'the dialogue panel is up');
  // what a real browser does with Esc while the lock is HELD: lock lost, pointerlockchange, no keydown (here: the page sees the lock gone and the event)
  await page.eval(`Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null }); document.dispatchEvent(new Event('pointerlockchange'))`); await tick(100);
  try { s = await S(); assert.equal(s.mode, 'play', 'a lost lock during a conversation is not an Esc for the pause menu'); }
  finally { await page.eval(`delete document.pointerLockElement`); }
  // and the key itself, which now reaches the page: it leaves the talk, only the talk
  await page.key('Escape'); await tick(200);
  s = await S();
  assert.deepEqual([s.mode, s.pause, s.lock, await held()], ['play', false, 'gl', false], 'Esc left the conversation; play goes on with the pointer locked again');
  assert.equal(await page.eval('!document.getElementById("dlg").hidden'), false, 'the dialogue panel is gone');
  await page.key('Escape'); await tick(100);                                                      // with no conversation Esc is the pause as ever
  assert.equal((await S()).mode, 'paused');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl']);
});

test('while a conversation runs, a click on the world and a late lock request do not take the pointer back (the next Esc would be eaten); Q leaves and the pointer returns', async () => {
  await talkTo();
  assert.equal((await S()).lock, null);
  const grabs = () => page.eval('window.__quiet.locks');                                           // how many times the simulated pointer was really taken
  const n0 = await grabs();
  await page.eval(`document.getElementById('gl').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`); await tick(100);
  assert.equal((await S()).lock, null, 'a click on the world during a talk must not grab the pointer (the next Esc would be eaten)');
  assert.equal(await grabs(), n0, 'it was not even asked for (the flow would let a late lock go again, but the click must not start one)');
  await page.eval(`document.getElementById('gl').requestPointerLock()`); await tick(150);          // a request that was already on its way when the talk opened
  let s = await S(); assert.deepEqual([s.mode, s.lock], ['play', null], 'a lock that lands during a talk is let go again, and it does not pause either');
  await page.key('KeyQ'); await tick(200);
  s = await S(); assert.deepEqual([s.mode, s.lock, await held()], ['play', 'gl', false], 'Q leaves the talk and the pointer is back');
});

test('when the browser refuses the pointer after a conversation the usual click-to-resume shows (a toast and the pause card), never a cursor-less limbo; no new talk is paused by it', async () => {
  await page.eval(`document.getElementById('gl').requestPointerLock = () => undefined`);            // a browser that says no (this canvas only; deleted below)
  try {
    await talkTo(); await page.key('Escape'); await tick(900);
    const s = await S();
    assert.deepEqual([s.mode, s.pause], ['paused', true], 'refused: the pause card offers Continuar');
    assert.match(await page.eval('document.getElementById("toast").textContent'), /Continuar/);
  } finally { await page.eval(`delete document.getElementById('gl').requestPointerLock`); }
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl']);
  // a second conversation that opens inside the 0.6 s the guard waits is not paused by it (the guard only looks at a free player)
  await page.eval(`document.getElementById('gl').requestPointerLock = () => undefined`);
  try {
    await talkTo(0); await page.eval('__ladera.ctx.people.leave()'); await tick(60);
    await talkTo(1); await tick(900);
    assert.deepEqual([(await S()).mode, await held()], ['play', true], 'still talking, not paused behind the conversation');
  } finally { await page.eval(`delete document.getElementById('gl').requestPointerLock`); }
  await page.eval('__ladera.ctx.people.leave()'); await tick(200);
  assert.deepEqual([(await S()).mode, (await S()).lock, await held()], ['play', 'gl', false], 'the second talk ends, the pointer is asked for again and now the browser agrees');
});

// R2c-016: Esc closes a panel opened over the game back to the game, and Esc is not a user gesture, so a browser may refuse to give the pointer back. Then the usual
// click-to-resume shows (a toast and the pause card), never a cursor-less limbo: what the reader's Esc always did, now for every panel.
test('Esc from a panel opened over the game while the browser refuses the pointer: the pause card and its toast show, never a cursor-less limbo (R2c-016)', async (t) => {
  t.after(backToPlay);
  // The test before ends a talk, which arms the 0.6 s re-lock guard; run out in the middle of this test, with the browser saying no, it would pause the game with the same toast
  // and hide a missing guard on the Esc path (the mutant without it passed). So let it run out first, with the pointer still granted: only this test's Esc may pause now.
  await tick(700);
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl'], 'in the game, the pointer granted, no guard left to fire');
  await page.eval(`document.getElementById('gl').requestPointerLock = () => undefined`);            // a browser that says no (this canvas only; deleted below)
  try {
    await page.key('KeyJ'); await tick();
    assert.equal((await S()).mode, 'panel', 'the journal is open over the game');
    await page.eval(`document.getElementById('toast').textContent = ''`);                          // so that a toast left over from an earlier test cannot pass this one
    await page.key('Escape'); await tick(900);
    const s = await S();
    assert.deepEqual([s.mode, s.pause, s.lock], ['paused', true, null], 'refused: the pause card offers Continuar');
    assert.match(await page.eval('document.getElementById("toast").textContent'), /Continuar/, 'and says why');
  } finally { await page.eval(`delete document.getElementById('gl').requestPointerLock`); }
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl'], 'with the browser agreeing again Continuar takes the pointer');
});

// R2c-012 (rubric cap C1): Chrome REJECTS the promise of a refused requestPointerLock (Continuar within a second of Esc, the re-lock after a talk). lockPointer() asks with
// { unadjustedMovement: true } and, when that rejects, asks again plainly: the second promise was dropped, so a second refusal was 'Uncaught (in promise) DOMException'.
test('a pointer lock the browser refuses by REJECTING its promise (both asks) is no unhandled rejection: from a direct request, from the end of a talk and from Continuar (R2c-012)', async () => {
  await page.eval(`window.__refused = 0; document.getElementById('gl').requestPointerLock = () => { window.__refused++; return Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError')); }`);
  const e0 = page.summary().errors.length, p0 = await page.eval('__ladera.errors().length');
  try {
    await page.eval(`${LOCK}.lockPointer()`); await tick(200);                                      // a direct request
    assert.equal(await page.eval('window.__refused'), 2, 'asked twice: with the options, then plainly (both rejected)');
    await talkTo(); await page.key('KeyQ'); await tick(900);                                          // the re-lock after a talk, refused: the pause card
    assert.equal((await S()).mode, 'paused', 'the refusal shows the pause card');
    await page.eval('document.getElementById("resume").click()'); await tick(900);                  // Continuar: asks again, refused again
    assert.ok(await page.eval('window.__refused') >= 6, `every ask was refused (${await page.eval('window.__refused')})`);
    assert.deepEqual(page.summary().errors.slice(e0), [], 'no Uncaught (in promise) reached the console');
    assert.equal(await page.eval('__ladera.errors().length'), p0, 'and none reached the error list of the page itself');
  } finally {
    await page.eval(`delete document.getElementById('gl').requestPointerLock; delete window.__refused`);
    // put the page back: paused -> Continuar asks for the lock; still playing after a refused Continuar (no pause card on that path) -> the player's next click would ask, so ask here
    if ((await S()).mode !== 'play') await page.eval('document.getElementById("resume").click()'); else await page.eval(`${LOCK}.lockPointer()`);
    await tick(300);
  }
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl'], 'with the browser agreeing again the game is back in play, pointer locked');
});

test('a conversation that ends while the game is paused does not grab the pointer behind the pause card: Continuar asks for it', async () => {
  await talkTo();
  assert.equal((await S()).lock, null);
  await page.eval('__ladera.ctx.flow.pause()'); await tick(100);                                  // the touch menu button can do this in the middle of a talk
  assert.equal((await S()).mode, 'paused');
  await page.eval('__ladera.ctx.people.leave()'); await tick(200);
  assert.deepEqual([(await S()).mode, (await S()).lock, await held()], ['paused', null, false], 'still paused, and the pointer stays free');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl'], 'Continuar takes it back');
});

test('only a conversation lets go of the pointer: any other hold on the player (a cutscene) keeps it, and a lost lock there is still the pause', async () => {
  assert.equal((await S()).lock, 'gl');
  await page.eval(`${LOCK}.lock('cutscene')`); await tick(100);
  assert.deepEqual([(await S()).mode, (await S()).lock, await held()], ['play', 'gl', true], 'held but not talking: the pointer stays');
  await page.eval(`${LOCK}.unlock('cutscene')`); await tick(100);
  assert.deepEqual([(await S()).mode, (await S()).lock, await held()], ['play', 'gl', false]);
  await page.eval(`${LOCK}.lock('cutscene')`); await page.eval('document.exitPointerLock()'); await tick(120);
  assert.equal((await S()).mode, 'paused', 'no conversation owns Esc here: the lost lock is the pause menu as before');
  await page.eval(`${LOCK}.unlock('cutscene')`);
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.deepEqual([(await S()).mode, (await S()).lock], ['play', 'gl']);
});

test('Ctrl is not a game key (Ctrl+W closes the browser tab): neither Ctrl crouches, C does, and letting go stands up', async () => {
  const crouching = () => page.eval('__ladera.ctx.player.crouching');
  for (const code of ['ControlLeft', 'ControlRight']) {
    await page.key(code, true); await page.eval('__ladera.step(20)');
    assert.equal(await crouching(), false, `${code} held`);
    await page.key(code, false);
  }
  await page.key('KeyC', true); await page.eval('__ladera.step(20)');
  assert.equal(await crouching(), true, 'C crouches');
  await page.key('KeyC', false); await page.eval('__ladera.step(60)');
  assert.equal(await crouching(), false, 'letting go of C stands up');
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

test('a portrait phone widens the vertical field of view but never past 90 degrees, even at the slider maximum; landscape keeps the setting', async () => {
  try {
    await page.viewport(390, 844); await tick(250);
    await page.eval('__ladera.ctx.settings.set("fov", 100); __ladera.step(4)');
    assert.ok((await page.eval('__ladera.ctx.camera.aspect')) < 1, 'the camera follows the phone shape');
    const tall = await page.eval('__ladera.ctx.camera.fov');
    assert.ok(tall <= 90.01 && tall > 85, `portrait, slider at 100: ${tall} degrees (it was 135)`);
    await page.eval('__ladera.ctx.settings.set("fov", 55); __ladera.step(4)');
    assert.ok(Math.abs((await page.eval('__ladera.ctx.camera.fov')) - 55 * 1.35) < 0.7, 'a narrow setting is still widened by the full 1.35 on a phone');
    await page.viewport(1280, 720); await tick(250);
    await page.eval('__ladera.ctx.settings.set("fov", 100); __ladera.step(4)');
    assert.ok(Math.abs((await page.eval('__ladera.ctx.camera.fov')) - 100) < 0.7, 'landscape: the setting as it is');
  } finally {
    await page.eval('__ladera.ctx.settings.reset(); __ladera.step(2)');
    await page.viewport(1280, 720); await tick(200);
  }
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

test('Help names Q (leave a conversation) and says what opens with E, in both languages; every Settings control has its name and hint in Spanish AND English', async () => {
  await page.key('Escape'); await tick();
  await page.eval('document.querySelector("#pause [data-open=help]").click()'); await tick();
  const help = JSON.parse(await page.eval(`JSON.stringify({ rows: [...document.querySelectorAll('#panelbody .helpgrid > div')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()),
    tips: [...document.querySelectorAll('#panelbody .tips li')].map((l) => l.textContent), en: [...document.querySelectorAll('#panelbody .tips li')].map((l) => l.querySelector('small')?.textContent ?? '') })`));
  assert.ok(help.rows.some((r) => /Salir de una conversación.*Leave a conversation.*Q/.test(r)), `a Help row for Q: ${help.rows}`);
  assert.ok(help.tips.some((t) => /armarios, cajones, alacenas y neveras se abren con E.*diarios.*hallazgos/.test(t) && /Wardrobes, drawers, cupboards and fridges open with E; diaries/.test(t)), 'the container tip, in both languages');
  assert.ok(help.en.length >= 6 && help.en.every((t) => t.length > 30 && /\b(the|and|or|to|of|with|is|are|you)\b/.test(t)), `every tip carries its English line: ${help.en}`);
  await page.key('Escape'); await tick();                                                         // the panel closes to the pause card
  await page.eval('document.querySelector("#pause [data-open=settings]").click()'); await tick();
  const set = JSON.parse(await page.eval(`JSON.stringify({
    rows: [...document.querySelectorAll('#panelbody .row')].map((r) => ({ en: r.querySelector('label small.en')?.textContent ?? '', es: r.querySelector('label').firstChild?.textContent ?? '', aria: (r.querySelector('select, input'))?.getAttribute('aria-label') ?? '', hint: [...r.querySelectorAll('label small:not(.en)')].map((s) => s.textContent) })),
    heads: [...document.querySelectorAll('#panelbody h3')].map((e) => e.textContent), buttons: [...document.querySelectorAll('#panelbody .actions button')].map((b) => b.textContent),
    options: [...document.querySelectorAll('#panelbody select option')].map((o) => o.textContent) })`));
  assert.ok(set.rows.length >= 14, `${set.rows.length} settings rows`);
  for (const r of set.rows) {
    assert.ok(r.es.trim().length > 2 && /[A-Za-z]{3}/.test(r.en), `a label with both languages: ${JSON.stringify(r)}`);
    assert.ok(r.aria.includes(' · ') && r.aria.startsWith(r.es.trim()), `its control is named in both: ${r.aria}`);
    for (const h of r.hint) assert.ok(h.includes(' · '), `a hint in both languages: ${h}`);
  }
  assert.ok(set.heads.every((h) => h.includes(' · ')), `bilingual headings: ${set.heads}`);
  assert.ok(set.buttons.every((b) => b.includes(' · ')), `bilingual buttons: ${set.buttons}`);
  assert.ok(set.options.filter((o) => /^(Automática|Baja|Media|Alta|Español e inglés|Solo español|Solo inglés)/.test(o)).every((o) => o.includes(' · ')), `bilingual options: ${set.options}`);
  await page.key('Escape'); await tick();
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('the journal lists what is still to find by area (a row each: the count left, the progress, one hint of kinds, no names), not one "???" card per thing; a found thing becomes a card and leaves its area\'s count', async () => {
  const read = async () => JSON.parse(await page.eval(`JSON.stringify({ locked: document.querySelectorAll('#panelbody .jitem.locked').length, cards: [...document.querySelectorAll('#panelbody .jgrid .jitem b')].map((b) => b.textContent),
    head: document.querySelector('#panelbody .jhead strong').textContent, note: document.querySelector('#panelbody .note')?.textContent ?? null,
    rows: [...document.querySelectorAll('#panelbody .jarea')].map((r) => ({ id: r.dataset.area, name: r.querySelector('b').firstChild.textContent, left: +r.querySelector('.left').firstChild.textContent.match(/^\\d+/)[0], hint: r.querySelector('.hint').textContent, bar: r.querySelector('.jbar i').style.width })),
    text: document.getElementById('panelbody').textContent })`));
  const reopen = async () => { await page.key('KeyJ'); await tick(80); await page.key('KeyJ'); await tick(120); };
  await page.key('KeyJ'); await tick(150);
  let j = await read();
  const total = await page.eval('__ladera.ctx.discover.total - __ladera.ctx.discover.count'), areas = await page.eval('__ladera.ctx.plan.areas.length');
  assert.equal(j.locked, 0, 'no card says ???'); assert.ok(!/\?\?\?|Todavía por descubrir/.test(j.text), 'and no text does');
  assert.ok(j.rows.length >= 1 && j.rows.length <= areas, `${j.rows.length} rows for ${areas} areas`);
  assert.equal(j.rows.reduce((s, r) => s + r.left, 0), total, 'the counts of the rows add up to what is not found yet');
  assert.ok(j.rows.every((r) => /^Por aquí: \d+ [a-zñáéíóú ]+( · \d+ [a-zñáéíóú ]+)*Around here: \d+ [a-z ]+( · \d+ [a-z ]+)*$/.test(r.hint)), `one hint of kinds in both languages: ${j.rows.map((r) => r.hint).join(' | ')}`);
  const kinds = await page.eval('[...new Set([...__ladera.ctx.discover.items.values()].map((d) => d.kind))]');
  for (const k of kinds) assert.ok(Object.hasOwn(KIND, k), `the journal knows the kind "${k}" (add it to ui/panels.js KIND and NOUN)`);
  await page.key('KeyJ'); await tick(100);
  // a fixture registry (the world's own is put back afterwards): El Plan holds one found mural and one thing far off the map (it goes to the nearest area); La Cumbre holds a view
  await page.eval(`(() => { const d = __ladera.ctx.discover; window.__realDiscoveries = { items: d.items, found: d.found, order: [...d.order] };
    d.items = new Map(); d.found = new Set(); d.order.length = 0;
    for (const [id, name, en, kind, x, z] of [['f1', 'Mural del plan', 'The flat mural', 'mural', 0, 80], ['f2', 'Vista alta', 'High view', 'vista', 10, -65], ['f3', 'Fuera del mapa', 'Off the map', 'story', -120, 200]]) d.items.set(id, { id, name, en, kind, x, y: 0, z, radius: 3 });
    d.found.add('f1'); d.order.push('f1'); })()`);
  try {
    await page.key('KeyJ'); await tick(150);
    j = await read();
    assert.match(j.head, /^1 de 3 descubrimientos/); assert.deepEqual(j.cards, ['Mural del plan'], 'the found thing is a card');
    assert.deepEqual(j.rows.map((r) => [r.id, r.name, r.left]), [['plan', 'El Plan', 1], ['cumbre', 'La Cumbre', 1]], 'the plan\'s order; the far-off thing went to El Plan');
    assert.deepEqual(j.rows.map((r) => r.hint), ['Por aquí: 1 historiaAround here: 1 story', 'Por aquí: 1 vistaAround here: 1 view']);
    assert.deepEqual(j.rows.map((r) => r.bar), ['50%', '0%'], 'El Plan has given one of its two');
    assert.ok(!/Fuera del mapa|Vista alta/.test(j.rows.map((r) => r.hint).join()), 'a hint never names what is still hidden');
    await page.eval(`(() => { const d = __ladera.ctx.discover; d.found.add('f2'); d.order.push('f2'); })()`); await reopen();
    j = await read();
    assert.deepEqual([j.rows.map((r) => r.id), j.cards], [['plan'], ['Mural del plan', 'Vista alta']], 'La Cumbre is finished: its row goes and its thing becomes a card');
    await page.eval(`(() => { const d = __ladera.ctx.discover; d.found.add('f3'); d.order.push('f3'); })()`); await reopen();
    j = await read();
    assert.deepEqual([j.rows.length, j.cards.length, j.locked], [0, 3, 0]); assert.match(j.note, /Lo has descubierto todo/);
  } finally {
    await page.eval(`(() => { const d = __ladera.ctx.discover, r = window.__realDiscoveries; if (!r) return; d.items = r.items; d.found = r.found; d.order.length = 0; d.order.push(...r.order); delete window.__realDiscoveries; })()`);
    if ((await S()).mode === 'panel') { await page.key('KeyJ'); await tick(100); }
  }
  assert.equal((await S()).mode, 'play');
});

const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
test('the map places its labels by priority: apart from each other, inside the canvas, clear of the buttons and the legend, at every zoom, on a desktop and on a phone', async () => {
  const labels = async () => JSON.parse(await page.eval(`(() => { const cv = document.querySelector('#panelbody canvas'), wr = cv.parentElement.getBoundingClientRect(), box = (e) => { const r = e.getBoundingClientRect(); return [r.left - wr.left, r.top - wr.top, r.width, r.height]; };
    const lm = __ladera.ctx.plan.landmarks;
    return JSON.stringify({ L: cv.__labels, taken: cv.__taken, v: cv.__view, ui: [...cv.parentElement.querySelectorAll('.mapctl, .maplegend')].map(box), legend: box(cv.parentElement.querySelector('.maplegend')), names: lm.map((l) => l.name), first: lm.filter((l) => ['viewpoint', 'chapel', 'school', 'clinic', 'hall', 'court'].includes(l.kind)).map((l) => l.name),
      areas: __ladera.ctx.plan.areas.map((a) => a.name.toUpperCase()) }); })()`));
  const check = (m, label) => {
    const R = m.L.map((l) => [l.x - l.w / 2, l.y - l.h / 2, l.w, l.h]);
    for (let i = 0; i < R.length; i++) {
      if (m.L[i].text === 'N') continue;                                                          // the compass letter sits in its own reserved spot
      const r = R[i];
      assert.ok(r[0] >= 1.9 && r[1] >= 1.9 && r[0] + r[2] <= m.v.W - 1.9 && r[1] + r[3] <= m.v.H - 1.9, `${label}: "${m.L[i].text}" leaves the canvas: ${JSON.stringify(r.map(Math.round))} in ${Math.round(m.v.W)}x${Math.round(m.v.H)}`);
      for (let k = i + 1; k < R.length; k++) if (m.L[k].text !== 'N') assert.ok(!overlap(r, R[k]), `${label}: "${m.L[i].text}" and "${m.L[k].text}" overlap`);
      for (const u of m.ui) assert.ok(!overlap(r, u), `${label}: "${m.L[i].text}" sits under a button or the legend`);
      for (const u of m.ui) assert.ok(!overlap(r, [u[0] - 2, u[1] - 2, u[2] + 4, u[3] + 4]), `${label}: "${m.L[i].text}" touches a button or the legend (it keeps 2 px clear)`);
      const f = m.v.frame;                                                                          // R2c-015: nor does a label run over the line of the plan's frame (the map's edge)
      assert.ok(r[0] >= f[0] + 3 && r[1] >= f[1] + 3 && r[0] + r[2] <= f[0] + f[2] - 3 && r[1] + r[3] <= f[1] + f[3] - 3, `${label}: "${m.L[i].text}" leaves the plan's frame or runs over its line: ${JSON.stringify(r.map(Math.round))} in ${JSON.stringify(f.map(Math.round))}`);
    }
  };
  // R2c-015: on the whole barrio the legend has a strip of its own below the plan (it used to sit on the south end of the map: the labels there ran into it)
  const legendApart = (m, label) => {
    const f = m.v.frame;
    assert.ok(!overlap(f, m.legend), `${label}: the legend sits on the plan (legend ${JSON.stringify(m.legend.map(Math.round))}, plan ${JSON.stringify(f.map(Math.round))})`);
    assert.ok(!overlap([f[0] - 8, f[1] - 8, f[2] + 16, f[3] + 16], m.legend), `${label}: the legend keeps 8 px clear of the plan's frame (legend ${JSON.stringify(m.legend.map(Math.round))}, plan ${JSON.stringify(f.map(Math.round))})`);
  };
  const named = (m, list) => list.filter((n) => m.L.some((l) => l.text === n));
  for (const k of await page.eval('[...new Set(__ladera.ctx.plan.landmarks.map((l) => l.kind))]')) assert.ok(Object.hasOwn(LM_PRI, k), `the map ranks the landmark kind "${k}" (add it to ui/map.js LM_PRI)`);
  const zoomBtn = (label) => page.eval(`document.querySelector('.mapctl button[aria-label="${label}"]').click()`);
  if ((await S()).mode === 'title') { await page.eval('document.getElementById("start").click()'); await tick(300); }            // alone (--test-name-pattern) it starts the game itself
  await page.key('KeyM'); await tick(400);
  let m = await labels(); check(m, 'desktop default'); legendApart(m, 'desktop default');
  assert.ok(m.legend[0] + m.legend[2] + 8 <= m.v.frame[0], `desktop default: the wide canvas keeps the legend in the margin beside the plan, a clear 8 px from it: legend ${JSON.stringify(m.legend.map(Math.round))}, plan ${JSON.stringify(m.v.frame.map(Math.round))}`);
  const first = JSON.stringify(m.L);
  const diamonds = m.taken.filter((r) => Math.abs(r[2] - 14) < 0.01 && Math.abs(r[3] - 14) < 0.01).length;
  assert.ok(diamonds >= m.names.length, `every landmark's marker (a 14 px square) is an obstacle for the labels: ${diamonds} for ${m.names.length} landmarks`);
  assert.ok(named(m, m.names).length >= 10, `${named(m, m.names).length} of ${m.names.length} landmark names are on the map at the default zoom`);
  assert.ok(named(m, m.first).length >= 5, `the important kinds (viewpoint, chapel, school, clinic, hall, court) are named first: ${named(m, m.first)}`);
  assert.ok(named(m, m.areas).length >= 2, 'and some area names find a place too');
  assert.ok(m.L.some((l) => l.text === 'N'), 'the compass letter is there');
  await zoomBtn('Centrar en mí'); await tick(250); m = await labels(); check(m, 'centred on the player');
  for (let i = 0; i < 3; i++) { await zoomBtn('Acercar'); await tick(150); m = await labels(); check(m, `zoomed in ${i + 1}x`); }
  assert.ok(m.v.s > 8, 'well zoomed in'); assert.ok(m.L.length >= 4, 'close up there are labels again (the lots\' names)');
  const wheel = (dy) => page.eval(`(() => { const cv = document.querySelector('#panelbody canvas'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true, cancelable: true })); })()`);
  for (const dy of [900, 900, 500]) { await wheel(dy); await tick(120); check(await labels(), `wheel ${dy}`); }
  await zoomBtn('Ver todo'); await tick(250); m = await labels(); legendApart(m, 'Ver todo');
  assert.equal(JSON.stringify(m.L), first, 'back on the whole barrio the labels are exactly the ones of the first look: placement depends on the view, not on how you got there');
  await page.key('KeyM'); await tick(150);
  try {
    for (const [w, h] of [[390, 844], [320, 568], [768, 1024], [700, 720]]) {                      // 700x720: a margin of 63 px beside the plan, too narrow for the legend column
      await page.viewport(w, h); await tick(250);
      await page.key('KeyM'); await tick(400);
      m = await labels(); check(m, `${w}x${h}`); legendApart(m, `${w}x${h}`);
      assert.ok(named(m, m.names).length >= (w < 400 ? 4 : 6), `${w}x${h}: ${named(m, m.names).length} landmark names`);
      await page.key('KeyM'); await tick(150);
    }
  } finally { await page.viewport(1280, 720); await tick(250); }
  assert.equal((await S()).mode, 'play');
});

test('the place label and the discovery toast follow the player', async () => {
  // The fixture owns its discovery list: the world registers its own (a number that grows with the content), so the real registry is set aside
  // for this test and put back afterwards. Counts and order below then depend on nothing but this test.
  await page.eval(`(() => { const d = __ladera.ctx.discover; window.__realDiscoveries = { items: d.items, found: d.found, order: [...d.order] };
    d.items = new Map(); d.found = new Set(); d.order.length = 0; })()`);
  try {
    await page.eval('__ladera.step(2)');
    assert.ok((await page.eval('document.getElementById("place").textContent')).length > 2, 'a place name is shown at the spawn');
    assert.equal(await page.eval('__ladera.ctx.discover.total'), 0, 'the fixture starts with an empty registry');
    await page.eval(`(() => { const c = __ladera.ctx, p = c.player.s; c.discover.register({ id: 'ui-test', name: 'Mural de prueba', en: 'A test mural', x: p.x, y: p.y, z: p.z, radius: 4, kind: 'mural' }); __ladera.step(2); })()`);
    assert.deepEqual(await page.eval('__ladera.ctx.discover.order'), ['ui-test']);
    assert.match(await page.eval('document.getElementById("toast").textContent'), /Mural de prueba/);
    await page.key('KeyJ'); await tick();
    assert.match(await page.eval('document.getElementById("panelbody").textContent'), /1 de 1 descubrimientos[\s\S]*Mural de prueba/);
    await page.key('KeyJ'); await tick();
    assert.equal((await S()).mode, 'play');
  } finally {
    await page.eval(`(() => { const d = __ladera.ctx.discover, r = window.__realDiscoveries; if (!r) return;
      d.items = r.items; d.found = r.found; d.order.length = 0; d.order.push(...r.order); delete window.__realDiscoveries; })()`);
  }
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

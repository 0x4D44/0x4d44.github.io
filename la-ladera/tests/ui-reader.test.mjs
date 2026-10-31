// The reader panel, the journal tab 'Papeles y hallazgos' and the toast of a find (owner: A1), in headless Chrome: a paper opens as a sheet (pointer released, world paused),
// pages turn with the keys, Esc closes ONLY the reader (play resumes, not the pause menu), a paper opened from the journal returns to the journal, and a special find shows
// its toast, is marked as a discovery of its own kind and moves its shelf counter without touching the world's "N de M".
// Quiet box: the browser comes only from tests/chrome.mjs (pointer lock simulated, speech recorded); the voice here is a stub that records, nothing is spoken.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-reader.test.mjs
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';
import { FINDS } from '../js/interiors/finds.js';
import { SHELVES } from '../js/ui/collections.js';

let b, page;
const OVER = 'document.documentElement.scrollWidth - document.documentElement.clientWidth';
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
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

const DOC = { id: 'dia_camila', kind: 'diary', cover: 'notebook', title: { es: 'Diario de Camila', en: "Camila's diary" }, who: 'Camila', building: 'L07', pages: [
  { when: '3 de marzo', es: 'Hoy mamá me dejó ir a la cancha.\nMe dolían los pies de tanto correr.', en: 'Today mum let me go to the court.\nMy feet hurt from all the running.' },
  { when: '9 de marzo', es: 'No me sale la tarea de matemáticas.', en: 'I cannot get the maths homework.' },
  { when: '20 de marzo', es: 'Sacamos el domingo para subir al mirador.', en: 'We took Sunday to climb up to the viewpoint.' },
] };
const LETTER = { id: 'carta_abuela', kind: 'letter', cover: 'envelope', title: 'Carta de la abuela', en: "Grandmother's letter", who: 'Abuela', pages: [{ when: 'Navidad', es: 'Mija querida: ya casi llego.', en: 'Dear girl: I am almost there.' }] };
const words = (n, w) => Array.from({ length: n }, (_, i) => w + (i % 7)).join(' ');
const LONG = { id: 'larga', kind: 'diary', cover: 'notebook', title: { es: 'Un diario con muchas páginas de texto largo', en: 'A diary with many pages of long text' }, who: 'Rosalba', pages: Array.from({ length: 6 }, (_, k) => ({ when: `${k + 1} de abril`, es: words(88, 'palabra'), en: words(88, 'word') })) };

const S = () => page.eval(`(() => { const c = __ladera.ctx, $ = (q) => document.querySelector(q), vis = (id) => !document.getElementById(id).classList.contains('hidden');
  return JSON.stringify({ mode: c.mode, running: c.running, panel: vis('panel'), pause: vis('pause'), name: document.getElementById('panel').dataset.panel ?? null, current: c.flow.current,
    ptitle: document.getElementById('paneltitle').textContent, lock: document.pointerLockElement ? document.pointerLockElement.id : null, reader: c.reader.state(),
    es: $('#panel .rd-text.es')?.innerText ?? null, en: $('#panel .rd-text.en')?.innerText ?? null, when: $('#panel .rd-when')?.textContent ?? null, count: $('#panel .rd-count')?.textContent ?? null,
    cover: $('#panel .reader')?.dataset.cover ?? null, kind: $('#panel .reader')?.dataset.kind ?? null, focus: document.activeElement?.className ?? null, next: $('#panel .rd-next')?.textContent ?? null,
    prevDisabled: $('#panel .rd-prev')?.disabled ?? null, voiceShown: !!$('#panel .rd-voice') && !$('#panel .rd-voice').classList.contains('hidden'), ev: window.__ev ?? [] }); })()`).then(JSON.parse);
const open = (doc, o) => page.eval(`__ladera.ctx.reader.open(${J(doc)}, ${J(o ?? {})})`);

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?manual');
  await page.eval('document.getElementById("start").click()'); await tick(120);
  await page.eval(`(() => { const c = __ladera.ctx; window.__ev = []; for (const n of ['reader:open', 'reader:page', 'reader:close']) c.events.on(n, (p) => window.__ev.push([n, p])); })()`);
});
after(async () => { await b?.close(); });
// every test starts in play with nothing open (a failed test must not leak its sheet into the next one)
beforeEach(async () => {
  await page.eval(`(() => { const c = __ladera.ctx; let n = 0; while (c.flow.current && n++ < 4) c.flow.closePanel(); if (c.mode === 'paused') c.flow.resume(); })()`); await tick(30);
});

test('open from play: the sheet appears, the pointer is released and the world waits', async () => {
  assert.equal((await S()).mode, 'play');
  assert.equal(await open(DOC), true);
  const s = await S();
  assert.deepEqual([s.mode, s.running, s.panel, s.name, s.current, s.lock], ['panel', false, true, 'reader', 'reader', null]);
  assert.equal(s.ptitle, 'Diario de Camila');
  assert.deepEqual([s.cover, s.kind, s.reader.open, s.reader.page, s.reader.pages], ['notebook', 'diary', true, 1, 3]);
  assert.deepEqual(s.es.split(/\n+/), ['Hoy mamá me dejó ir a la cancha.', 'Me dolían los pies de tanto correr.'], 'two paragraphs in Spanish');
  assert.deepEqual(s.en.split(/\n+/), ['Today mum let me go to the court.', 'My feet hurt from all the running.'], 'and the English below');
  assert.equal(s.when, '3 de marzo'); assert.match(s.count, /^Página 1 de 3/);
  assert.equal(s.focus, 'rd-paper', 'focus is on the sheet, not on a button that Space would press');
  assert.equal(s.next, 'Siguiente ›'); assert.equal(s.prevDisabled, true);
  assert.deepEqual(s.ev.slice(-1)[0], ['reader:open', { id: 'dia_camila', pages: 3 }]);
  assert.equal(await page.eval('__ladera.ctx.reader.isOpen'), true);
});

test('pages: E, Space, Enter and the arrows turn forward; arrows, PageUp and Backspace turn back; Home and End jump; one entry per page', async () => {
  await open(DOC);
  await page.key('KeyE'); await tick();
  let s = await S(); assert.deepEqual([s.reader.page, s.when, s.es], [2, '9 de marzo', 'No me sale la tarea de matemáticas.']); assert.equal(s.prevDisabled, false);
  await page.key('ArrowLeft'); await tick(); assert.equal((await S()).reader.page, 1);
  await page.key('ArrowRight'); await tick(); await page.key('Space'); await tick();
  s = await S(); assert.deepEqual([s.reader.page, s.next], [3, 'Cerrar'], 'the last page offers to close');
  await page.key('PageUp'); await tick(); assert.equal((await S()).reader.page, 2);
  await page.key('Backspace'); await tick(); assert.equal((await S()).reader.page, 1);
  await page.key('End'); await tick(); assert.equal((await S()).reader.page, 3);
  await page.key('Home'); await tick(); assert.equal((await S()).reader.page, 1);
  await page.key('ArrowDown'); await tick(); await page.key('PageDown'); await tick(); assert.equal((await S()).reader.page, 3);
  await page.key('ArrowUp'); await tick(); assert.equal((await S()).reader.page, 2);
  await page.key('Enter'); await tick(); assert.equal((await S()).reader.page, 3);
  const pages = (await S()).ev.filter((e) => e[0] === 'reader:page');
  assert.deepEqual(pages[0][1], { id: 'dia_camila', page: 2, pages: 3 }, 'reader:page carries the 1-based page and the total');
  assert.ok(pages.length >= 10);
  const before = pages.length;
  await page.key('Home'); await tick(); await page.key('ArrowLeft'); await tick();
  assert.equal((await S()).ev.filter((e) => e[0] === 'reader:page').length, before + 1, 'turning back past the first page is no change and no event');
});

// R4-111 (round 2): the old E on the last page closed the paper, which hands the pointer back to a game whose NEXT Esc is the pause menu: a reader who pressed
// one key too many and then Esc (as the sheet says) paused the game. Keys now stop on the last page and say how to close; closing is deliberate.
test('E, Space, Enter and the arrows stop on the last page (the Cerrar button pulses, nothing closes); the Cerrar button then closes ONLY the reader: play again (not the pause menu), pointer lock back, reader:close says how much was read', async () => {
  await open(DOC); await page.key('KeyE'); await tick(); await page.key('KeyE'); await tick();
  assert.equal((await S()).reader.page, 3);
  const evs = (await S()).ev.length;
  for (const k of ['KeyE', 'Space', 'Enter', 'NumpadEnter', 'ArrowRight', 'ArrowDown', 'PageDown', 'KeyE']) {
    await page.key(k); await tick(50);
    const s = await S();
    assert.deepEqual([s.mode, s.current, s.reader.open, s.reader.page, s.lock], ['panel', 'reader', true, 3, null], `${k} on the last page does not close it`);
  }
  assert.equal((await S()).ev.length, evs, 'no reader:close and no reader:page: nothing happened to the reading');
  assert.equal(await page.eval(`document.querySelector('#panel .rd-next').classList.contains('nudge')`), true, 'the Cerrar button pulses so the reader sees how to close');
  assert.equal(await page.eval(`document.querySelector('#panel .rd-hint').dataset.last`), 'true', 'and the hint line stresses Esc');
  await tick(1350);                                                                                  // the pulse is a nudge of about a second, not a standing animation
  assert.equal(await page.eval(`document.querySelector('#panel .rd-next').classList.contains('nudge')`), false, 'the pulse ends by itself');
  await page.eval(`document.querySelector('#panel .rd-next').click()`); await tick(150);
  const s = await S();
  assert.deepEqual([s.mode, s.running, s.panel, s.pause, s.lock, s.current], ['play', true, false, false, 'gl', null]);
  assert.deepEqual(s.ev.slice(-1)[0], ['reader:close', { id: 'dia_camila', pagesSeen: 3, pages: 3 }]);
  assert.equal(s.reader.open, false); assert.equal(await page.eval('__ladera.ctx.reader.isOpen'), false);
  assert.equal(await page.eval('document.querySelector("#panelbody").children.length'), 0, 'the sheet is torn down');
});

test('the real-browser order of events: one Esc closes ONLY the reader (even after extra E presses on the last page), and only a SECOND Esc, which the browser takes as a lost pointer lock, pauses', async () => {
  await open(DOC); await page.key('End'); await tick();
  for (let i = 0; i < 3; i++) { await page.key('KeyE'); await tick(40); }
  assert.equal((await S()).mode, 'panel', 'still reading after three E presses on the last page');
  await page.key('Escape'); await tick(150);                                                       // the sheet is open and the pointer free, so Esc arrives as a key
  let s = await S();
  assert.deepEqual([s.mode, s.pause, s.panel, s.lock], ['play', false, false, 'gl'], 'the first Esc leaves the paper, not the game');
  await page.eval('document.exitPointerLock()'); await tick(150);                                // the second Esc: locked, so the browser drops the lock and sends no key
  s = await S(); assert.deepEqual([s.mode, s.pause], ['paused', true], 'the second one is the pause, as it always was');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('Esc closes only the reader: back in play, not in the pause menu; Esc again then pauses as it always did', async () => {
  await open(DOC); await page.key('ArrowRight'); await tick();
  await page.key('Escape'); await tick(150);
  let s = await S();
  assert.deepEqual([s.mode, s.running, s.panel, s.pause, s.lock], ['play', true, false, false, 'gl'], 'Esc leaves the paper, not the game');
  assert.deepEqual(s.ev.slice(-1)[0], ['reader:close', { id: 'dia_camila', pagesSeen: 2, pages: 3 }], 'two pages seen: the first and the second');
  await page.key('Escape'); await tick();
  s = await S(); assert.deepEqual([s.mode, s.pause], ['paused', true], 'a second Esc is the old pause');
  await page.eval('document.getElementById("resume").click()'); await tick();
  assert.equal((await S()).mode, 'play');
});

test('the x button and a click beside the sheet close it too; a single page does not close on E either, Esc or the Cerrar button does', async () => {
  await open(DOC); await page.eval('document.getElementById("panelclose").click()'); await tick(150);
  assert.deepEqual([(await S()).mode, (await S()).panel], ['play', false]);
  await open(DOC);
  await page.eval(`document.getElementById('panel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`); await tick(150);
  assert.equal((await S()).mode, 'play', 'pointerdown on the backdrop');
  assert.equal(await open(LETTER), true);
  let s = await S(); assert.deepEqual([s.reader.pages, s.cover, s.kind, s.next], [1, 'envelope', 'letter', 'Cerrar']);
  assert.equal(s.ptitle, 'Carta de la abuela', 'a plain string title works too');
  await page.key('KeyE'); await tick(100);
  assert.equal((await S()).mode, 'panel', 'one page, one E: the paper stays (E turns pages, Esc closes)');
  await page.key('Escape'); await tick(150);
  assert.equal((await S()).mode, 'play');
  await open(LETTER); await page.eval(`document.querySelector('#panel .rd-next').click()`); await tick(150);
  assert.equal((await S()).mode, 'play', 'the Cerrar button closes a one-page paper');
});

test('while a paper is open M, J and H do nothing; a second paper replaces the first and closes it properly', async () => {
  await open(DOC);
  for (const k of ['KeyM', 'KeyJ', 'KeyH']) { await page.key(k); await tick(); const s = await S(); assert.deepEqual([s.current, s.mode], ['reader', 'panel'], k); }
  const n0 = (await S()).ev.length;
  assert.equal(await open(LETTER), true);
  const s = await S(); assert.deepEqual([s.current, s.reader.id, s.ptitle], ['reader', 'carta_abuela', 'Carta de la abuela']);
  const tail = s.ev.slice(n0).map((e) => e[0] + ':' + e[1].id);
  assert.deepEqual(tail, ['reader:close:dia_camila', 'reader:open:carta_abuela'], 'the first reading is closed, then the second opens');
  await page.key('Escape'); await tick(150);
  assert.equal((await S()).mode, 'play', 'one Esc closes the replacement and nothing is left behind');
});

test('language: both = Spanish with the English below; es and en alone; a change of setting repaints the open sheet', async () => {
  await open(DOC);
  let s = await S(); assert.ok(s.es && s.en, 'both');
  await page.eval(`__ladera.ctx.settings.set('subLang', 'es')`); await tick();
  s = await S(); assert.ok(s.es && s.en === null, 'es only'); assert.equal(s.ptitle, 'Diario de Camila');
  await page.eval(`__ladera.ctx.settings.set('subLang', 'en')`); await tick();
  s = await S(); assert.ok(s.es === null && s.en.startsWith('Today mum let me go'), 'en only'); assert.equal(s.ptitle, "Camila's diary", 'the header follows the language');
  assert.equal(await page.eval(`document.querySelector('#panel .rd-title').textContent`), "Camila's diary");
  await page.eval(`__ladera.ctx.settings.set('subLang', 'both')`); await tick();
  s = await S(); assert.ok(s.es && s.en); assert.match(await page.eval(`document.querySelector('#panel .rd-title').textContent`), /Diario de Camila.*Camila's diary/);
  await page.key('Escape'); await tick(150);
  assert.equal((await S()).mode, 'play');
});

// R2c-011 (round-3 reviewer, major): with the subtitles on 'Solo inglés' the sheet printed a literal 'null' line under the date (replaceChildren() turns a null into the TEXT 'null':
// an English-only sheet has no Spanish block, a page may have no date, and identical Spanish and English is shown once), and the buttons, the page count and the key hints stayed Spanish.
test('no sheet prints a stray "null" or "undefined" in any language mode (a page with no date, identical Spanish and English, an English-only sheet), and the sheet\'s own words follow the language', async () => {
  const PLAIN = { id: 'sin_fecha', kind: 'list', cover: 'loose', title: { es: 'Lista del mercado', en: 'Market list' }, who: '', pages: [{ es: 'Panela\nArroz', en: 'Panela\nArroz' }, { when: '', es: 'Sin fecha.', en: 'No date.' }] };
  const SHEET = `(() => { const p = document.querySelector('#panel .rd-paper'), t = (q) => document.querySelector(q)?.textContent ?? null, a = (q) => document.querySelector(q)?.getAttribute('aria-label') ?? null;
    return JSON.stringify({ stray: [...p.childNodes].filter((n) => n.nodeType !== 1).map((n) => n.textContent), text: p.innerText, kids: p.children.length, kind: t('.rd-kind'), count: t('.rd-count'), prev: t('.rd-prev'), next: t('.rd-next'), voice: t('.rd-voice'),
      hint: t('.rd-hint'), prevAria: a('.rd-prev'), nextAria: a('.rd-next') }); })()`;
  const sheet = async () => JSON.parse(await page.eval(SHEET));
  try {
    for (const mode of ['both', 'es', 'en']) {
      await page.eval(`__ladera.ctx.settings.set('subLang', '${mode}')`);
      for (const doc of [DOC, PLAIN]) {
        await open(doc);
        for (let k = 0; k < doc.pages.length; k++) {
          const s = await sheet();
          const where = `${mode} ${doc.id} page ${k + 1}`;
          assert.deepEqual(s.stray, [], `${where}: text sits loose on the paper (a null passed to replaceChildren): ${J(s.stray)}`);
          assert.doesNotMatch(s.text, /\b(null|undefined|NaN)\b/, `${where}: ${J(s.text)}`);
          assert.ok(s.kids >= 3, `${where}: kind, title and at least one block of text`);
          if (k < doc.pages.length - 1) await page.key('ArrowRight'); await tick(30);
        }
        await page.key('Escape'); await tick(60);
      }
    }
    // the words of the sheet: Spanish (with the English small beside the count, the kind and the hint) by default, one language alone otherwise; a change of the setting repaints the open sheet
    await open(DOC);
    const WANT = {
      both: { kind: /^Diario\s+Diary\b/, count: 'Página 1 de 3 Page 1 of 3', prev: '‹ Anterior', next: 'Siguiente ›', voice: 'Leer en voz alta R', hint: /siguiente.*páginas.*cerrar.*next · pages · close/, prevAria: 'Página anterior', nextAria: 'Página siguiente' },
      es: { kind: /^Diario(?!.*Diary)/, count: 'Página 1 de 3', prev: '‹ Anterior', next: 'Siguiente ›', voice: 'Leer en voz alta R', hint: /^E siguiente · ←→ páginas · Esc cerrar$/, prevAria: 'Página anterior', nextAria: 'Página siguiente' },
      en: { kind: /^Diary(?!o)/, count: 'Page 1 of 3', prev: '‹ Previous', next: 'Next ›', voice: 'Read aloud R', hint: /^E next · ←→ pages · Esc close$/, prevAria: 'Previous page', nextAria: 'Next page' },
    };
    for (const mode of ['en', 'es', 'both', 'en']) {
      await page.eval(`__ladera.ctx.settings.set('subLang', '${mode}')`); await tick(40);
      const s = await sheet(), w = WANT[mode];
      assert.match(s.kind, w.kind, `${mode}: the kind of paper`); assert.equal(s.count, w.count, `${mode}: the page count`);
      for (const k of ['prev', 'next', 'voice', 'prevAria', 'nextAria']) assert.equal(s[k], w[k], `${mode}: ${k}`);
      assert.match(s.hint, w.hint, `${mode}: the key hints (${s.hint})`);
      if (mode === 'en') assert.doesNotMatch(`${s.kind} ${s.count} ${s.prev} ${s.next} ${s.voice} ${s.hint}`, /Diario|Página|Anterior|Siguiente|voz|siguiente|páginas|cerrar/, 'nothing Spanish is left on an English-only sheet');
    }
    await page.key('End'); await tick(40);
    const last = await sheet();
    assert.deepEqual([last.next, last.nextAria, last.count], ['Close', 'Close the reading', 'Page 3 of 3'], 'the last page offers Close in English');
    await page.eval(`__ladera.ctx.settings.set('subLang', 'both')`); await tick(40);
    assert.deepEqual([(await sheet()).next, (await sheet()).nextAria], ['Cerrar', 'Cerrar la lectura']);
    await page.key('Escape'); await tick(150);
  } finally { await page.eval(`__ladera.ctx.settings.set('subLang', 'both')`); }
});

test('read aloud: R speaks the page with the author\'s kind of voice, again stops it, a page turn stops it; no voice or speech off hides the button', async () => {
  // ctx.people.speech is the people system's own, fixed object: its voice is replaced by own properties on that instance for this test (they shadow the class's) and removed afterwards
  await page.eval(`(() => { const c = __ladera.ctx, sp = c.people.speech; window.__said = [];
    Object.defineProperty(sp, 'available', { configurable: true, get: () => !window.__noVoice });
    sp.speak = (t, o) => { const r = { t, o, cancelled: false, cancel() { this.cancelled = true; } }; r.done = new Promise((res) => { r.end = () => res('spoken'); }); window.__said.push(r); return r; };
    sp.cancel = () => {}; window.__noVoice = false; c.settings.set('ttsOn', true); })()`);
  try {
    await open(DOC);
    assert.equal((await S()).voiceShown, true, 'the button is there when a voice is');
    await page.key('KeyR'); await tick();
    let said = JSON.parse(await page.eval(`JSON.stringify(window.__said.map((r) => ({ t: r.t, o: r.o, c: r.cancelled })))`));
    assert.equal(said.length, 1); assert.match(said[0].t, /^3 de marzo\. Hoy mamá me dejó ir a la cancha\./); assert.equal(said[0].o.gender, 'f', 'Camila: a woman\'s voice');
    assert.ok(Number.isFinite(said[0].o.seed) && said[0].o.pitch === 1 && said[0].o.rate === 1);
    assert.equal(await page.eval(`document.querySelector('#panel .rd-voice').getAttribute('aria-pressed')`), 'true'); assert.equal((await S()).reader.reading, true);
    await page.key('KeyR'); await tick();
    assert.equal(await page.eval('window.__said[0].cancelled'), true, 'R again stops it'); assert.equal((await S()).reader.reading, false);
    await page.key('KeyR'); await tick();
    assert.equal(await page.eval('window.__said.length'), 2); assert.equal(await page.eval('window.__said[1].o.seed === window.__said[0].o.seed'), true, 'the same paper has the same voice');
    await page.key('ArrowRight'); await tick();
    assert.equal(await page.eval('window.__said[1].cancelled'), true, 'turning the page stops the reading');
    await page.eval(`document.querySelector('#panel .rd-voice').click()`); await tick();
    assert.equal(await page.eval('window.__said.length'), 3); assert.match(await page.eval('window.__said[2].t'), /^9 de marzo\. No me sale la tarea/);
    await page.key('Escape'); await tick(150);
    assert.equal(await page.eval('window.__said[2].cancelled'), true, 'closing the reader stops the voice');
    await page.eval(`__ladera.ctx.settings.set('ttsOn', false)`);
    await page.eval(`window.__noVoice = true`);
    await open(DOC); assert.equal((await S()).voiceShown, false, 'no voice: no button'); await page.key('KeyR'); await tick();
    assert.equal(await page.eval('window.__said.length'), 3, 'R does nothing without a voice');
    await page.key('Escape'); await tick(150);
  } finally {
    await page.eval(`(() => { const c = __ladera.ctx, sp = c.people.speech; delete sp.available; delete sp.speak; delete sp.cancel; c.settings.set('ttsOn', true); delete window.__said; delete window.__noVoice; })()`);
  }
});

test('each cover has its own look (eight different sheets), and the paper never overflows the screen sideways or sits under the Almanac pill', async () => {
  const covers = ['notebook', 'school', 'leather', 'loose', 'envelope', 'card', 'ledger', 'postcard'];
  const sig = new Map();
  for (const cover of covers) {
    await open({ ...DOC, cover });
    const look = await page.eval(`(() => { const p = document.querySelector('#panel .rd-paper'), cs = getComputedStyle(p), a = getComputedStyle(p, '::after');
      return [cs.backgroundColor, cs.backgroundImage.length, cs.borderTopWidth, cs.borderTopStyle, cs.fontFamily.slice(0, 20), cs.paddingLeft, cs.textAlign, cs.fontStyle, a.content].join('|'); })()`);
    sig.set(cover, look);
    await page.key('Escape'); await tick(40);
  }
  assert.equal(new Set(sig.values()).size, covers.length, `every cover is its own look: ${J([...sig])}`);
  try {
    for (const [w, h] of [[390, 844], [320, 568], [768, 1024], [1280, 720]]) {
      await page.viewport(w, h); await tick(150);
      for (const cover of covers) {
        await open({ ...LONG, cover }); await page.key('End'); await tick(40);
        assert.ok((await page.eval(OVER)) <= 1, `${w}x${h} ${cover}: scrolls sideways`);
        assert.deepEqual(await page.eval(UNDER_PILL), [], `${w}x${h} ${cover}: a control under the Almanac pill`);
        const m = await page.eval(`(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(), s = r('#panel .sheet'), p = r('#panel .rd-paper'); return JSON.stringify([s.left, s.right, p.left, p.right, innerWidth]); })()`);
        const [sl, sr, pl, pr, vw] = JSON.parse(m);
        assert.ok(sl >= -1 && sr <= vw + 1 && pl >= sl - 1 && pr <= sr + 1, `${w}x${h} ${cover}: the sheet fits: ${m}`);
        await page.key('Escape'); await tick(40);
      }
    }
    await page.viewport(390, 844); await tick(150);
    await open({ ...LONG, cover: 'notebook' });
    const r = JSON.parse(await page.eval(`JSON.stringify(['.rd-next', '.rd-prev', '#panelclose'].map((q) => { const b = document.querySelector(q).getBoundingClientRect(); return [q, b.top >= 0 && b.bottom <= innerHeight, Math.round(b.width), Math.round(b.height)]; }))`));
    for (const [q, onScreen, bw, bh] of r) { assert.ok(onScreen, `390x844: ${q} is on screen without scrolling`); assert.ok(bw >= 40 && bh >= 40, `${q} is a tap target: ${bw}x${bh}`); }
    await page.key('Escape'); await tick(40);
  } finally { await page.viewport(1280, 720); await tick(150); }
});

test('the title on the sheet is in the paper\'s ink and size, not the panel\'s pale small-caps heading (a white copy of it was almost invisible on the cream)', async () => {
  for (const cover of ['notebook', 'envelope', 'card', 'ledger', 'school']) {
    await open({ ...DOC, cover });
    const t = JSON.parse(await page.eval(`(() => { const p = document.querySelector('#panel .rd-paper'), h = p.querySelector('.rd-title'), s = h.querySelector('small'), ps = getComputedStyle(p), hs = getComputedStyle(h), ss = s && getComputedStyle(s);
      return JSON.stringify({ ink: ps.color, title: hs.color, caps: hs.textTransform, spacing: hs.letterSpacing, px: parseFloat(hs.fontSize), paperPx: parseFloat(ps.fontSize), bold: +hs.fontWeight, small: !!s, smallInk: ss?.color ?? null, smallBlock: ss?.display ?? null, text: h.textContent }); })()`));
    assert.equal(t.title, t.ink, `${cover}: the title is written in the paper's ink (${t.title} on ${t.ink})`);
    assert.deepEqual([t.caps, t.spacing], ['none', 'normal'], `${cover}: not the panel's uppercase heading`);
    assert.ok(t.px > t.paperPx && t.bold >= 700, `${cover}: bigger and bolder than the text (${t.px}px vs ${t.paperPx}px, weight ${t.bold})`);
    assert.ok(t.small, `${cover}: the English title follows in both-languages mode: ${t.text}`);
    assert.deepEqual([t.smallInk, t.smallBlock], [t.ink, 'block'], `${cover}: and in the same ink, on its own line`);
    await page.key('Escape'); await tick(40);
  }
});

test('the journal: a tab "Papeles y hallazgos" with the counters, the four shelves, the papers read (click one to read it again) and the finds', async () => {
  const total = SHELVES.map((s) => FINDS.filter((f) => f.collection === s.id).length);
  await page.eval(`(() => { const c = __ladera.ctx; window.__realCollection = c.collection;
    const finds = new Map([['moneda1', { id: 'moneda1', name: { es: 'Un centenario de oro', en: 'A gold centenario' }, collection: 'Monedas de oro', react: { es: '¡Brilla como el sol!', en: 'It shines like the sun!' } }],
      ['reloj1', { id: 'reloj1', es: 'Un reloj de bolsillo', en: 'A pocket watch', collection: 'watches', react: ['Todavía da la hora.', 'It still keeps time.'] }]]);
    const papers = new Map([['dia_camila@L07', ${J(DOC)}], ['carta_abuela@L03', ${J(LETTER)}]]);
    c.collection = { papers, finds, counts: () => ({ papers: papers.size, finds: finds.size, byCollection: { 'Monedas de oro': 1, Relojes: 1 }, total: { papers: 74, finds: 41 } }) }; })()`);
  try {
    await page.key('KeyJ'); await tick();
    let s = await S(); assert.deepEqual([s.current, s.ptitle], ['journal', 'Diario del barrio']);
    const tabs = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#panelbody .jtab')].map((t) => [t.dataset.tab, t.getAttribute('aria-selected'), t.textContent.replace(/\\s+/g, ' ')]))`));
    assert.deepEqual(tabs.map((t) => [t[0], t[1]]), [['discover', 'true'], ['papers', 'false']]);
    assert.match(tabs[1][2], /Papeles y hallazgos.*2 · 2/);
    await page.eval(`document.querySelector('#panelbody .jtab[data-tab=papers]').click()`); await tick();
    const head = await page.eval(`document.querySelector('#panelbody .jhead').textContent`);
    assert.match(head, /Papeles 2 de 74/); assert.match(head, /Hallazgos 2 de 41/);
    const shelves = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#panelbody .jshelf')].map((e) => [e.dataset.shelf, e.querySelector('span').textContent, e.classList.contains('has')]))`));
    assert.deepEqual(shelves, [['coins', `1 de ${total[0]}`, true], ['watches', `1 de ${total[1]}`, true], ['jewels', `0 de ${total[2]}`, false], ['oddities', `0 de ${total[3]}`, false]], 'four shelves, counted by the stub\'s counts()');
    const finds = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#panelbody .jitem.find')].map((e) => [e.dataset.id, e.querySelector('.kind').textContent, e.querySelector('b').textContent, e.querySelector('.react').textContent.replace(/\\s+/g, ' ')]))`));
    assert.deepEqual(finds, [['moneda1', 'Monedas de oro', 'Un centenario de oro', '¡Brilla como el sol! It shines like the sun!'], ['reloj1', 'Relojes', 'Un reloj de bolsillo', 'Todavía da la hora. It still keeps time.']]);
    const papers = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#panelbody .jitem.paper')].map((e) => [e.dataset.id, e.querySelector('.kind').textContent, e.querySelector('b').textContent, e.tagName]))`));
    assert.deepEqual(papers, [['dia_camila', 'Diario', 'Diario de Camila', 'BUTTON'], ['carta_abuela', 'Carta', 'Carta de la abuela', 'BUTTON']]);
    // a paper from the list opens in the reader and Esc returns to the journal, on the same tab
    await page.eval(`document.querySelector('#panelbody .jitem.paper[data-id=carta_abuela]').click()`); await tick();
    s = await S(); assert.deepEqual([s.current, s.mode, s.ptitle, s.reader.id], ['reader', 'panel', 'Carta de la abuela', 'carta_abuela']);
    await page.key('Escape'); await tick(150);
    s = await S(); assert.deepEqual([s.current, s.mode, s.ptitle], ['journal', 'panel', 'Diario del barrio'], 'Esc returns to the journal');
    assert.equal(await page.eval(`document.querySelector('#panelbody .jtab.on').dataset.tab`), 'papers', 'on the tab the paper was opened from');
    await page.eval(`document.querySelector('#panelbody .jitem.paper[data-id=dia_camila]').click()`); await tick();
    await page.key('End'); await tick(); await page.key('KeyE'); await tick(100);
    s = await S(); assert.deepEqual([s.current, s.mode], ['reader', 'panel'], 'E on the last page does not close the paper');
    await page.eval(`document.querySelector('#panel .rd-next').click()`); await tick(150);
    s = await S(); assert.deepEqual([s.current, s.mode], ['journal', 'panel'], 'reading to the end and pressing Cerrar returns to the journal too');
    await page.key('Escape'); await tick(150);
    s = await S(); assert.deepEqual([s.mode, s.running, s.panel, s.pause, s.lock], ['play', true, false, false, 'gl'], 'Esc in the journal goes back to the game it was opened from, as Esc in the reader does (R2c-016)');
    // no collection (the interiors are not loaded): the tab is empty, not broken
    await page.eval(`__ladera.ctx.collection = undefined`);
    await page.key('KeyJ'); await tick();
    await page.eval(`document.querySelector('#panelbody .jtab[data-tab=papers]').click()`); await tick();
    assert.match(await page.eval(`document.querySelector('#panelbody .jhead').textContent`), /Papeles 0 de/);
    assert.equal(await page.eval(`document.querySelectorAll('#panelbody .jshelf').length`), 4);
    await page.eval(`document.querySelector('#panelbody .jtab[data-tab=discover]').click()`); await tick();
    await page.key('KeyJ'); await tick();
    assert.equal((await S()).mode, 'play');
  } finally {
    await page.eval(`(() => { __ladera.ctx.collection = window.__realCollection; delete window.__realCollection; })()`);
  }
});

test('a find: ctx.discover.mark shows the toast Hallazgo with its shelf counter, rings the coin, is a discovery of its own kind and leaves "N de M" alone', async () => {
  const total = FINDS.filter((f) => f.collection === 'coins').length;
  await page.eval(`(() => { const c = __ladera.ctx; window.__rings = []; window.__hadAudio = !!c.audio; c.audio ??= {}; window.__realFind = c.audio.find; c.audio.find = (o) => window.__rings.push(o);
    window.__realCollection = c.collection; c.collection = { papers: new Map(), finds: new Map([['moneda1', { id: 'moneda1', collection: 'Monedas de oro' }]]), counts: () => ({ papers: 0, finds: 1, byCollection: { 'Monedas de oro': 1 }, total: { papers: 74, finds: 41 } }) }; })()`);
  try {
    const before = JSON.parse(await page.eval(`JSON.stringify({ n: __ladera.ctx.discover.count, t: __ladera.ctx.discover.total, f: __ladera.ctx.discover.finds, label: document.querySelector('#pause .count')?.textContent })`));
    const rec = { id: 'find:moneda1:L07', name: 'Un centenario de oro', en: 'A gold centenario', kind: 'hallazgo', collection: 'Monedas de oro', x: 1, y: 1, z: 1, rarity: 3 };
    assert.equal(await page.eval(`__ladera.ctx.discover.mark(${J(rec)})`), true);
    await tick(80);
    const toast = JSON.parse(await page.eval(`(() => { const t = document.getElementById('toast'); return JSON.stringify({ on: t.classList.contains('on'), rich: t.classList.contains('rich'), tag: t.querySelector('em')?.textContent, title: t.querySelector('b')?.textContent, sub: t.querySelector('span')?.textContent ?? null }); })()`));
    assert.deepEqual(toast, { on: true, rich: true, tag: `Hallazgo · Monedas de oro 1 de ${total}`, title: 'Un centenario de oro', sub: 'A gold centenario' });
    assert.deepEqual(JSON.parse(await page.eval('JSON.stringify(window.__rings)')), [{ collection: 'coins', rarity: 3 }], 'the coin rings once, by shelf and rarity');
    const after = JSON.parse(await page.eval(`JSON.stringify({ n: __ladera.ctx.discover.count, t: __ladera.ctx.discover.total, f: __ladera.ctx.discover.finds, label: document.querySelector('#pause .count')?.textContent, has: __ladera.ctx.discover.found.has('find:moneda1:L07'), kind: __ladera.ctx.discover.items.get('find:moneda1:L07').kind })`));
    assert.deepEqual([after.n, after.t, after.f, after.label, after.has, after.kind], [before.n, before.t, before.f + 1, before.label, true, 'hallazgo'], 'marked, counted as a find, and the world\'s N de M did not move');
    assert.equal(await page.eval(`__ladera.ctx.discover.mark(${J(rec)})`), false, 'the second time is old news'); await tick(50);
    assert.equal(await page.eval('window.__rings.length'), 1, 'and silent');
    // the language of the toast follows the subtitles setting
    await page.eval(`__ladera.ctx.settings.set('subLang', 'en')`);
    await page.eval(`__ladera.ctx.discover.mark(${J({ ...rec, id: 'find:moneda2:L07' })})`); await tick(60);
    assert.deepEqual(JSON.parse(await page.eval(`JSON.stringify([document.querySelector('#toast b').textContent, document.querySelector('#toast span')?.textContent ?? null])`)), ['A gold centenario', null]);
    await page.eval(`__ladera.ctx.settings.set('subLang', 'es')`);
    await page.eval(`__ladera.ctx.discover.mark(${J({ ...rec, id: 'find:moneda3:L07', rarity: undefined, collection: 'nada' })})`); await tick(60);
    assert.deepEqual(JSON.parse(await page.eval(`JSON.stringify([document.querySelector('#toast b').textContent, document.querySelector('#toast span')?.textContent ?? null, document.querySelector('#toast em').textContent.startsWith('Hallazgo · Rarezas')])`)), ['Un centenario de oro', null, true]);
    assert.deepEqual(JSON.parse(await page.eval('JSON.stringify(window.__rings.slice(1))')), [{ collection: 'coins', rarity: 3 }, { collection: 'oddities', rarity: 1 }]);
    // a plain world discovery still gets the old toast, the old chime and moves N de M
    await page.eval(`__ladera.ctx.settings.set('subLang', 'both')`);
    const n0 = await page.eval('__ladera.ctx.discover.count');
    await page.eval(`(() => { const d = __ladera.ctx.discover; d.register({ id: 'plain-1', name: 'Un mural', en: 'A mural', x: 0, y: 0, z: 0, radius: 1, kind: 'mural', manual: true }); d.mark({ id: 'plain-1' }); })()`); await tick(60);
    assert.match(await page.eval(`document.querySelector('#toast em').textContent`), /^Descubrimiento \d+ de \d+$/);
    assert.equal(await page.eval('__ladera.ctx.discover.count'), n0 + 1);
    assert.equal(await page.eval('window.__rings.length'), 3, 'a mural does not ring the coin');
  } finally {
    await page.eval(`(() => { const c = __ladera.ctx; if (window.__hadAudio) c.audio.find = window.__realFind; else c.audio = undefined; c.collection = window.__realCollection; delete window.__rings; delete window.__realFind; delete window.__realCollection; delete window.__hadAudio;
      for (const id of [...c.discover.items.keys()]) if (/^(find:moneda|plain-1)/.test(id)) { c.discover.items.delete(id); c.discover.found.delete(id); } })()`);
  }
});

test('no console errors, warnings or failed requests during all of the above', async () => {
  const sum = page.summary();
  const warnings = sum.consoleWarnings.filter((w) => !/AudioContext was not allowed to start/.test(w));
  assert.deepEqual([sum.errors, sum.netErrors, sum.consoleErrors, warnings], [[], [], [], []]);
  assert.equal(await page.eval('__ladera.ctx.errors.length'), 0);
});

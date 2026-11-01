// Reader (owner: A1): a diary, letter, list or receipt found in a drawer, shown as a sheet of paper in the panel machinery of ui/flow.js
// (mode 'panel': the pointer is released and the world waits, like the map and the journal).
//
//   ctx.reader.open(doc, o?) -> true | false
//       doc = { id, kind, title: 'Diario de Camila' | { es, en }, en?, who, cover, pages: [{ when, es, en }], building? }   (the lead's resolvePaper() shape works as is)
//       o   = { back: 'journal'   return to that panel on close (the journal list re-opens a paper this way),
//               tokens: { W, M, S, K, K2, T }   safety net: fills any {W} {M} {S} {K} {K2} {T} still left in the text,
//               page: 1           first page shown (1-based),  onClose(info) }
//   ctx.reader.isOpen, .close(), .next(), .prev(), .goto(n), .read() (aloud), .state()
//   events  'reader:open' { id, pages }   'reader:page' { id, page, pages } (1-based, only on a change)   'reader:close' { id, pagesSeen, pages }
// One entry per page. Language follows settings.subLang: both = Spanish with the English below, es, en; the sheet's own words (buttons, page count, key hints) follow it too (WORDS).
// Keys: E / Space / Enter / Right / Down / PageDown next (they STOP on the last page: the Cerrar button pulses and nothing closes, because a closed reader hands the
// pointer back to a game whose next Esc is the pause menu, and a reader who pressed one key too many and then Esc paused the game), Left / Up / PageUp / Backspace
// previous, Home / End, R reads the page aloud with the Spanish voice of the dialogues (only when speech is on and available). Esc / the x button / a click beside
// the sheet / the Cerrar button on the last page close ONLY the reader.
import { h } from './panels.js';
import { speechOf } from './tts.js';
import { genderOf } from '../interiors/content.js';
import { KINDS, COVERS } from './collections.js';

export { KINDS, COVERS };
const TOKEN = /\{(K2|[AWMSKT])\}/g;

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
/** 'f' | 'm' | '?' for the voice that reads a paper aloud: the author's first name (content.js knows the barrio's names), else the way they sign ('doña', 'tío', 'mamá'). */
export function voiceGender(who) {
  const s = text(who).trim(); if (!s) return '?';
  const g = genderOf(s) ?? s.split(/\s+/).map((w) => genderOf(w)).find(Boolean);
  if (g) return g;
  if (/^(do[ñn]a|mam[áa]|abuela|t[ií]a|se[ñn]ora|madre|hermana)(?!\p{L})/iu.test(s)) return 'f';
  if (/^(don|pap[áa]|abuelo|t[ií]o|se[ñn]or|padre|hermano)(?!\p{L})/iu.test(s)) return 'm';
  return '?';
}
export const langMode = (v) => (v === 'es' || v === 'en' ? v : 'both');
export const paragraphs = (s) => text(s).split(/\n+/).map((t) => t.trim()).filter(Boolean);

/** The sheet's own words, [Spanish, English] (R2c-011: with the subtitles on 'Solo inglés' the buttons, the page count and the key hints stayed Spanish). 'both' (the default) keeps
 *  Spanish on the buttons and the English small beside the kind of paper, the page count and the hint line; 'es' and 'en' show one language alone. */
export const WORDS = {
  prev: ['‹ Anterior', '‹ Previous'], next: ['Siguiente ›', 'Next ›'], done: ['Cerrar', 'Close'],
  prevAria: ['Página anterior', 'Previous page'], nextAria: ['Página siguiente', 'Next page'], doneAria: ['Cerrar la lectura', 'Close the reading'],
  voice: ['Leer en voz alta ', 'Read aloud '], empty: ['No hay nada que leer.', 'There is nothing to read.'], title: ['Lectura', 'Reading'],
  count: [(i, n) => `Página ${i} de ${n}`, (i, n) => `Page ${i} of ${n}`],
  hint: [{ next: ' siguiente · ', pages: ' páginas · ', close: ' cerrar' }, { next: ' next · ', pages: ' pages · ', close: ' close' }],
};
/** One of the sheet's words in a language mode ('both' is Spanish: only the count, the kind and the hint add the English beside it). */
export const word = (key, mode, ...a) => { const w = WORDS[key][langMode(mode) === 'en' ? 1 : 0]; return typeof w === 'function' ? w(...a) : w; };

/** A reader document from whatever a caller passes: { id, kind, cover, title: {es,en}, who, building, pages: [{ when, es, en }] } or null when there is nothing to read. */
export function normalizeDoc(doc, tokens = null) {
  if (!doc || !Array.isArray(doc.pages)) return null;
  const fill = (s) => { s = text(s); return tokens ? s.replace(TOKEN, (m, k) => (tokens[k] != null ? text(tokens[k]) : m)) : s; };
  const pages = [];
  for (const p of doc.pages) {
    const es = fill(p?.es ?? p?.en), en = fill(p?.en ?? p?.es);
    if (es.trim() || en.trim()) pages.push({ when: fill(p?.when), es, en });
  }
  if (!pages.length) return null;
  const kind = KINDS[doc.kind] ? doc.kind : 'note';
  const t = doc.title, tes = fill(typeof t === 'string' ? t : t?.es), ten = fill(typeof t === 'string' ? doc.en : t?.en);
  return {
    id: text(doc.id) || 'papel', kind, cover: COVERS.includes(doc.cover) ? doc.cover : 'loose', building: doc.building ?? null,
    title: { es: tes || KINDS[kind][0], en: ten || tes || KINDS[kind][1] }, who: fill(doc.who), pages,
  };
}

/** What one page shows in a language mode: { es, en } as paragraph lists (null = not shown), the heading and the date line. */
export function pageView(doc, i, lang) {
  const p = doc.pages[Math.max(0, Math.min(doc.pages.length - 1, i | 0))], mode = langMode(lang);
  const showEs = mode !== 'en', showEn = mode !== 'es' && !!p.en.trim() && (mode === 'en' || p.en !== p.es);
  return {
    es: showEs ? paragraphs(p.es) : null, en: showEn ? paragraphs(p.en) : (mode === 'en' && !p.en.trim() ? paragraphs(p.es) : null), when: p.when,
    title: showEs ? doc.title.es : doc.title.en, titleEn: mode === 'both' && doc.title.en !== doc.title.es ? doc.title.en : null,
  };
}

const seedOf = (s) => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0) % 1000; };

export function createReader(ctx) {
  const S = { doc: null, i: 0, o: {}, seen: new Set(), rec: null, ui: null, nudgeT: 0 };
  const st = () => ctx.settings?.v ?? {};
  const flow = () => ctx.flow;
  const emit = (n, p) => ctx.events?.emit?.(n, p);
  const lang = () => langMode(st().subLang);
  const speech = () => { const sp = speechOf(ctx); return sp && st().ttsOn !== false && sp.available ? sp : null; };

  const cancelRead = () => {
    const r = S.rec; S.rec = null;
    if (r) { try { r.cancel?.(); } catch { /* ignore */ } }
    if (S.ui) S.ui.voice.classList.remove('on');
    if (S.ui) S.ui.voice.setAttribute('aria-pressed', 'false');
  };
  const read = () => {
    if (!S.doc) return false;
    if (S.rec) { cancelRead(); return true; }
    const sp = speech(); if (!sp) return false;
    const pg = S.doc.pages[S.i], line = [pg.when, pg.es].filter(Boolean).join('. ');
    const rec = sp.speak(line, { pitch: 1, rate: st().ttsRate ?? 1, gender: voiceGender(S.doc.who), seed: seedOf(S.doc.id) });
    S.rec = rec ?? null;
    if (S.ui) { S.ui.voice.classList.add('on'); S.ui.voice.setAttribute('aria-pressed', 'true'); }
    rec?.done?.then?.(() => { if (S.rec === rec) { S.rec = null; if (S.ui) { S.ui.voice.classList.remove('on'); S.ui.voice.setAttribute('aria-pressed', 'false'); } } }, () => {});
    return true;
  };

  /** The key-hint line in a language mode: Spanish, the English small after it in 'both', English alone in 'en'. */
  const hintNodes = (mode) => {
    const w = word('hint', mode);
    const line = [h('kbd', {}, 'E'), w.next, h('kbd', {}, '←'), h('kbd', {}, '→'), w.pages, h('span', { class: 'rd-esc' }, h('kbd', {}, 'Esc'), w.close)];
    return mode === 'both' ? [...line, ' ', h('small', { lang: 'en' }, 'next · pages · close')] : line;
  };
  /** Fill the sheet for the current page. */
  const paint = (flip) => {
    const u = S.ui, d = S.doc; if (!u || !d) return;
    const mode = lang(), v = pageView(d, S.i, mode), n = d.pages.length, last = S.i >= n - 1, kind = KINDS[d.kind];
    u.root.dataset.cover = u.paper.dataset.cover = d.cover; u.root.dataset.kind = u.paper.dataset.kind = d.kind;     // the look (css) hangs on the paper itself
    u.root.lang = mode === 'en' ? 'en' : 'es';                                                                     // the page is English (index.html): the sheet's words and buttons are Spanish, the small English lines say lang="en"
    // replaceChildren turns a null into the TEXT 'null' (R2c-011: an English-only sheet has no Spanish block, a page may have no date): only nodes go in
    u.paper.replaceChildren(...[
      h('p', { class: 'rd-kind' }, h('span', {}, mode === 'en' ? kind[1] : kind[0]), mode === 'both' ? [' ', h('small', { lang: 'en' }, kind[1])] : null, d.who ? h('span', { class: 'rd-who' }, ' · ', d.who) : null),
      h('h3', { class: 'rd-title', lang: mode === 'en' ? 'en' : 'es' }, v.title, v.titleEn ? h('small', { lang: 'en' }, ' ', v.titleEn) : null),
      v.when ? h('p', { class: 'rd-when' }, v.when) : null,
      v.es ? h('div', { class: 'rd-text es', lang: 'es' }, v.es.map((t) => h('p', {}, t))) : null,
      v.en ? h('div', { class: 'rd-text en', lang: 'en' }, v.en.map((t) => h('p', {}, t))) : null,
    ].filter(Boolean));
    u.paper.scrollTop = 0;
    u.count.replaceChildren(...(mode === 'both' ? [word('count', 'es', S.i + 1, n), ' ', h('small', { lang: 'en' }, word('count', 'en', S.i + 1, n))] : [word('count', mode, S.i + 1, n)]));
    u.dots.replaceChildren(...d.pages.map((_, k) => h('i', { class: k === S.i ? 'on' : k < S.i ? 'past' : '' })));
    u.prev.disabled = S.i <= 0;
    u.prev.replaceChildren(word('prev', mode)); u.prev.setAttribute('aria-label', word('prevAria', mode));
    u.next.replaceChildren(word(last ? 'done' : 'next', mode)); u.next.setAttribute('aria-label', word(last ? 'doneAria' : 'nextAria', mode));
    u.voice.replaceChildren(word('voice', mode), h('kbd', {}, 'R'));
    u.hint.replaceChildren(...hintNodes(mode));
    u.voice.classList.toggle('hidden', !speech());
    u.root.classList.toggle('single', n < 2);
    u.hint.dataset.last = String(last);                                                                          // on the last page the hint stresses Esc (css)
    if (flip) { u.paper.classList.remove('flip'); void u.paper.offsetWidth; u.paper.classList.add('flip'); }
    const t = flow()?.mode === 'panel' ? document.getElementById('paneltitle') : null; if (t) t.textContent = v.title;
  };
  const goto = (n) => {
    const d = S.doc; if (!d) return false;
    n = Math.max(0, Math.min(d.pages.length - 1, n | 0)); if (n === S.i) return false;
    S.i = n; S.seen.add(n); cancelRead(); paint(true);
    emit('reader:page', { id: d.id, page: n + 1, pages: d.pages.length });
    return true;
  };
  const close = () => { if (flow()?.current === 'reader') flow().closePanel(); else finish(); };
  const next = () => { if (!S.doc) return false; if (S.i >= S.doc.pages.length - 1) { close(); return true; } return goto(S.i + 1); };     // the button and the API: Cerrar on the last page
  /** The page-turning KEYS: forward, and on the last page nothing but a pulse on Cerrar (a stray key never closes the paper). */
  const turn = () => {
    if (!S.doc) return false;
    if (S.i < S.doc.pages.length - 1) return goto(S.i + 1);
    const b = S.ui?.next; if (!b) return false;
    b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    clearTimeout(S.nudgeT); S.nudgeT = setTimeout(() => b.classList.remove('nudge'), 1100);
    return false;
  };
  const prev = () => goto(S.i - 1);
  /** The one place a reading ends (any way it ends): stop the voice, say so, call back. */
  const finish = () => {
    const d = S.doc; if (!d) return;
    const info = { id: d.id, pagesSeen: S.seen.size, pages: d.pages.length }, o = S.o;
    cancelRead(); clearTimeout(S.nudgeT); S.doc = null; S.ui = null; S.o = {}; S.seen = new Set();
    emit('reader:close', info);
    try { o.onClose?.(info); } catch (e) { console.error('[reader] onClose', e); }
  };

  /** The panel definition ui/flow.js drives (title, render, close, key; modal: M / J / H do nothing meanwhile). Esc closes it like any panel: back to where it was opened from. */
  const panel = {
    get title() { return S.doc ? pageView(S.doc, S.i, lang()).title : word('title', lang()); },
    modal: true, focus: '.rd-paper',
    render(body) {
      if (!S.doc) { body.replaceChildren(h('p', { class: 'note' }, word('empty', lang()))); return; }
      const ui = S.ui = {                                                    // the words on the buttons and in the hint come from paint(), in the language of the setting
        root: h('div', { class: 'reader' }), paper: h('article', { class: 'rd-paper', tabindex: '-1', 'aria-live': 'polite' }),
        count: h('span', { class: 'rd-count' }), dots: h('span', { class: 'rd-dots', 'aria-hidden': 'true' }),
        prev: h('button', { type: 'button', class: 'btn quiet rd-prev', onclick: () => prev() }),
        next: h('button', { type: 'button', class: 'btn rd-next', onclick: () => next() }),
        voice: h('button', { type: 'button', class: 'btn quiet rd-voice', 'aria-pressed': 'false', onclick: () => read() }),
        hint: h('p', { class: 'rd-hint' }),
      };
      ui.root.append(ui.paper, h('div', { class: 'rd-nav' }, ui.prev, h('span', { class: 'rd-mid' }, ui.count, ui.dots), ui.next),
        h('div', { class: 'rd-tools' }, ui.voice, ui.hint));
      body.replaceChildren(ui.root);
      paint(false);
    },
    close() { finish(); },
    key(e) {
      if (!S.doc) return false;
      const onButton = e.target?.tagName === 'BUTTON';
      switch (e.code) {
        case 'KeyE': case 'ArrowRight': case 'ArrowDown': case 'PageDown': turn(); return true;
        case 'Space': case 'Enter': case 'NumpadEnter': if (onButton) return false; turn(); return true;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': prev(); return true;
        case 'Home': goto(0); return true;
        case 'End': goto(S.doc.pages.length - 1); return true;
        case 'KeyR': read(); return true;
        default: return false;
      }
    },
  };

  const api = {
    open(doc, o = {}) {
      const d = normalizeDoc(doc, o.tokens), f = flow();
      if (!d || !f || f.mode === 'loading') return false;
      if (S.doc) finish();                                                    // a reading is replaced by this one
      S.doc = d; S.o = o; S.seen = new Set(); S.i = Math.max(0, Math.min(d.pages.length - 1, (o.page ?? 1) - 1)); S.seen.add(S.i);
      f.openPanel('reader', { back: o.back });
      if (f.current !== 'reader') { S.doc = null; S.ui = null; S.o = {}; return false; }
      emit('reader:open', { id: d.id, pages: d.pages.length });
      return true;
    },
    close, next, prev, goto: (n) => goto((n | 0) - 1), read,
    get isOpen() { return !!S.doc && flow()?.current === 'reader'; },
    state() { const d = S.doc; return { open: !!d && flow()?.current === 'reader', id: d?.id ?? null, page: d ? S.i + 1 : 0, pages: d ? d.pages.length : 0, lang: lang(), reading: !!S.rec, canRead: !!speech() }; },
  };
  ctx.settings?.on?.((k) => { if ((k === 'subLang' || k === 'ttsOn') && S.doc && S.ui) { paint(false); if (k === 'ttsOn') cancelRead(); } });
  return { api, panel };
}

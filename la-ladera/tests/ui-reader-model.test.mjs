// The reader's and the journal's pure parts (owner: A1): how a paper becomes a sheet (js/ui/reader.js normalizeDoc, pageView, voiceGender) and how finds are shelved
// (js/ui/collections.js). The DOM side is tests/ui-reader.test.mjs. Pure node.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-reader-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoc, pageView, voiceGender, langMode, paragraphs, KINDS, COVERS, WORDS, word } from '../js/ui/reader.js';
import { SHELVES, findCollection, shelfProgress, shelfTotals } from '../js/ui/collections.js';
import { PAPERS, resolvePaper } from '../js/interiors/papers.js';
import { FINDS } from '../js/interiors/finds.js';
import { PAPER_KINDS, COVERS as LEAD_COVERS, FIND_COLLECTIONS } from '../js/interiors/content.js';

const HH = { kind: 'family', kids: 2, team: { n: 'rojiblancos' }, names: { woman: 'Rosalba', man: 'Hernán', sur: 'Gómez', kid: 'Camila', kid2: 'Mateo' } };
const DOC = { id: 'dia', kind: 'diary', cover: 'notebook', title: 'Diario de Camila', en: "Camila's diary", who: 'Camila', pages: [{ when: '3 de marzo', es: 'Hoy fue un buen día.', en: 'Today was a good day.' }, { when: '4 de marzo', es: 'Llovió.\nMucho.', en: 'It rained.\nA lot.' }] };

test('normalizeDoc: the lead\'s paper shape and A3\'s {es,en} title both become one shape', () => {
  const a = normalizeDoc(DOC);
  assert.deepEqual([a.id, a.kind, a.cover, a.title, a.who, a.pages.length], ['dia', 'diary', 'notebook', { es: 'Diario de Camila', en: "Camila's diary" }, 'Camila', 2]);
  assert.deepEqual(a.pages[0], { when: '3 de marzo', es: 'Hoy fue un buen día.', en: 'Today was a good day.' });
  const b = normalizeDoc({ ...DOC, title: { es: 'Diario', en: 'Diary' }, en: undefined, building: 'L07' });
  assert.deepEqual(b.title, { es: 'Diario', en: 'Diary' }); assert.equal(b.building, 'L07');
});

test('normalizeDoc: nothing to read is null; odd input is made safe, never thrown at', () => {
  for (const bad of [null, undefined, 3, {}, { pages: 'x' }, { pages: [] }, { pages: [{}] }, { pages: [{ es: '  ', en: '' }] }]) assert.equal(normalizeDoc(bad), null);
  const d = normalizeDoc({ id: 7, kind: 'weird', cover: 'gold', title: null, pages: [{ es: 'Hola' }, { when: 'x' }, { en: 'Only English' }] });
  assert.equal(d.id, '7'); assert.equal(d.kind, 'note'); assert.equal(d.cover, 'loose');
  assert.equal(d.pages.length, 2, 'a page with no text at all is dropped');
  assert.deepEqual([d.pages[0].es, d.pages[0].en, d.pages[1].es, d.pages[1].en], ['Hola', 'Hola', 'Only English', 'Only English'], 'the missing language falls back to the other');
  assert.deepEqual(d.title, { es: 'Nota', en: 'Note' }, 'a missing title is the kind of paper');
  assert.equal(normalizeDoc({ pages: [{ es: 'a' }] }).id, 'papel');
});

test('normalizeDoc: tokens left in the text are filled from o.tokens; without them the text is untouched; the input is never edited', () => {
  const src = { id: 't', kind: 'letter', title: 'Carta de {W}', en: "{W}'s letter", who: '{W}', pages: [{ when: '{S}', es: '{K} y {K2} con {M}. {T}. {Z}', en: '{K} and {K2}' }] };
  const frozen = JSON.stringify(src);
  const d = normalizeDoc(src, { W: 'Rosalba', M: 'Hernán', S: 'Gómez', K: 'Camila', K2: 'Mateo', T: 'rojiblancos' });
  assert.equal(d.title.es, 'Carta de Rosalba'); assert.equal(d.title.en, "Rosalba's letter"); assert.equal(d.who, 'Rosalba');
  assert.equal(d.pages[0].when, 'Gómez'); assert.equal(d.pages[0].es, 'Camila y Mateo con Hernán. rojiblancos. {Z}', 'K2 is not eaten by K; unknown tokens stay');
  assert.equal(d.pages[0].en, 'Camila and Mateo');
  assert.equal(normalizeDoc(src).pages[0].es, '{K} y {K2} con {M}. {T}. {Z}');
  assert.equal(JSON.stringify(src), frozen);
  assert.equal(normalizeDoc(src, { W: 'X' }).pages[0].es, '{K} y {K2} con {M}. {T}. {Z}', 'a token the caller does not supply stays');
});

test('pageView: the language mode picks what is shown; one entry per page; index clamped', () => {
  const d = normalizeDoc(DOC);
  let v = pageView(d, 0, 'both');
  assert.deepEqual([v.es, v.en, v.when, v.title, v.titleEn], [['Hoy fue un buen día.'], ['Today was a good day.'], '3 de marzo', 'Diario de Camila', "Camila's diary"]);
  v = pageView(d, 1, 'es'); assert.deepEqual([v.es, v.en, v.titleEn, v.title], [['Llovió.', 'Mucho.'], null, null, 'Diario de Camila'], 'paragraphs split on line breaks');
  v = pageView(d, 1, 'en'); assert.deepEqual([v.es, v.en, v.titleEn, v.title], [null, ['It rained.', 'A lot.'], null, "Camila's diary"]);
  assert.deepEqual(pageView(d, 99, 'es').when, '4 de marzo'); assert.deepEqual(pageView(d, -5, 'es').when, '3 de marzo'); assert.deepEqual(pageView(d, 0.9, 'es').when, '3 de marzo');
  assert.deepEqual(pageView(d, 0, 'nonsense').en, ['Today was a good day.'], 'an unknown mode is both');
  assert.deepEqual(pageView(d, 0, undefined).es, ['Hoy fue un buen día.']);
});

test('pageView: English under identical Spanish is not repeated; an English-only reader still gets text when a page has no English', () => {
  const same = normalizeDoc({ id: 's', kind: 'list', title: 'Lista', pages: [{ es: 'Panela', en: 'Panela' }] });
  assert.equal(pageView(same, 0, 'both').en, null, 'identical text is shown once');
  assert.deepEqual(pageView(same, 0, 'en').en, ['Panela'], 'but an English reader still sees it');
  assert.equal(pageView(same, 0, 'both').titleEn, null, 'same title in both languages is shown once');
  const onlyEs = normalizeDoc({ id: 'o', kind: 'note', title: 'Nota', pages: [{ es: 'Solo español', en: '' }] });
  assert.deepEqual(pageView(onlyEs, 0, 'en').en, ['Solo español']);
});

// R2c-011: with the subtitles on 'Solo inglés' the buttons, the page count and the key hints of the sheet stayed Spanish.
test('WORDS: every word of the sheet exists in both languages, the English ones are English, and the mode picks one (both = Spanish, the English goes beside the count, the kind and the hint)', () => {
  const SPANISH = /[áéíóúñ¿¡]|\b(página|páginas|siguiente|anterior|cerrar|leer|voz|alta|nada|lectura|hay|que|de)\b/i, ENGLISH = /\b(next|previous|close|read|aloud|page|pages|reading|nothing|of)\b/i;
  const leaves = (v) => (typeof v === 'function' ? [v(2, 5)] : v && typeof v === 'object' ? Object.values(v) : [v]);
  assert.deepEqual(Object.keys(WORDS).sort(), ['count', 'doneAria', 'done', 'empty', 'hint', 'next', 'nextAria', 'prev', 'prevAria', 'title', 'voice'].sort());
  for (const [key, pair] of Object.entries(WORDS)) {
    assert.equal(pair.length, 2, key);
    const [es, en] = pair.map(leaves);
    assert.equal(es.length, en.length, `${key}: one English word for each Spanish one`);
    es.forEach((s, i) => { assert.ok(typeof s === 'string' && s.trim() && typeof en[i] === 'string' && en[i].trim(), `${key} ${i}: not empty`); assert.notEqual(s, en[i], `${key} ${i}: translated`); });
    for (const s of en) assert.doesNotMatch(s, SPANISH, `${key}: Spanish in the English words: ${s}`);
    for (const s of es) assert.match(s, /[áéíóúñ]|\b(anterior|siguiente|cerrar|leer|lectura|hay|que)\b|^‹|›$|\bcerrar\b/i, `${key}: the Spanish word is Spanish: ${s}`);
  }
  assert.doesNotMatch(leaves(WORDS.hint[1]).join(' '), SPANISH); assert.match(leaves(WORDS.hint[1]).join(' '), ENGLISH);
  assert.deepEqual(['both', 'es', undefined, null, 'nonsense'].map((m) => word('next', m)), Array(5).fill('Siguiente ›'), 'both and unknown modes are Spanish on the buttons');
  assert.equal(word('next', 'en'), 'Next ›'); assert.equal(word('done', 'en'), 'Close'); assert.equal(word('done', 'both'), 'Cerrar'); assert.equal(word('doneAria', 'en'), 'Close the reading');
  assert.equal(word('count', 'es', 2, 5), 'Página 2 de 5'); assert.equal(word('count', 'en', 2, 5), 'Page 2 of 5'); assert.equal(word('count', 'both', 2, 5), 'Página 2 de 5');
  assert.deepEqual(word('hint', 'en'), { next: ' next · ', pages: ' pages · ', close: ' close' }); assert.equal(word('hint', 'es').close, ' cerrar');
  assert.equal(word('title', 'en'), 'Reading'); assert.equal(word('empty', 'en'), 'There is nothing to read.'); assert.equal(word('voice', 'en'), 'Read aloud '); assert.equal(word('prev', 'en'), '‹ Previous');
});

test('langMode and paragraphs', () => {
  assert.deepEqual(['es', 'en', 'both', 'x', undefined, null].map(langMode), ['es', 'en', 'both', 'both', 'both', 'both']);
  assert.deepEqual(paragraphs('a\n\n  b  \n'), ['a', 'b']);
  assert.deepEqual(paragraphs(null), []);
  assert.deepEqual(paragraphs(''), []);
});

test('voiceGender: the author\'s first name, then the way they sign, else unknown', () => {
  assert.equal(voiceGender('Camila'), 'f'); assert.equal(voiceGender('Hernán'), 'm'); assert.equal(voiceGender('Luz Marina'), 'f'); assert.equal(voiceGender('Juan David'), 'm');
  assert.equal(voiceGender('Doña Rosalba'), 'f'); assert.equal(voiceGender('Don Libardo'), 'm'); assert.equal(voiceGender('don Heriberto'), 'm');
  assert.equal(voiceGender('Mamá'), 'f'); assert.equal(voiceGender('Tío Beto'), 'm'); assert.equal(voiceGender('Abuela'), 'f');
  assert.equal(voiceGender('El Banco'), '?'); assert.equal(voiceGender(''), '?'); assert.equal(voiceGender(null), '?'); assert.equal(voiceGender(undefined), '?');
});

test('the vocabulary matches the lead\'s: every paper kind has a label, every cover is known, every shelf exists', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), [...PAPER_KINDS].sort());
  assert.deepEqual([...COVERS].sort(), [...LEAD_COVERS].sort());
  for (const [es, en] of Object.values(KINDS)) assert.ok(es && en && es !== en || es === 'Nota', `${es}/${en}`);
  assert.deepEqual(SHELVES.map((s) => [s.id, s.es, s.en]), FIND_COLLECTIONS.map((s) => [s.id, s.es, s.en]));
});

test('every paper the lead wrote becomes a readable sheet for a real household, in every language mode', () => {
  assert.ok(PAPERS.length >= 20, `${PAPERS.length} papers`);
  for (const p of PAPERS) {
    const d = normalizeDoc(resolvePaper(p, HH));
    assert.ok(d, p.id); assert.ok(d.pages.length >= 1 && d.pages.length <= 6, `${p.id}: ${d.pages.length} pages`);
    assert.equal(d.kind, p.kind, p.id); assert.equal(d.cover, p.cover, `${p.id} cover ${p.cover}`);
    for (let i = 0; i < d.pages.length; i++) for (const m of ['both', 'es', 'en']) {
      const v = pageView(d, i, m); assert.ok((v.es?.length ?? 0) + (v.en?.length ?? 0) > 0, `${p.id} p${i + 1} ${m} has text`);
      assert.ok(!/\{[A-Z0-9]+\}/.test(JSON.stringify(v)), `${p.id} p${i + 1} ${m}: a token is left in ${JSON.stringify(v).slice(0, 80)}`);
    }
  }
});

test('shelves: a find belongs to the shelf its id, its Spanish name or its English name says; anything else is Rarezas; totals add up to the lead\'s finds', () => {
  const t = shelfTotals();
  assert.equal(Object.values(t).reduce((a, n) => a + n, 0), FINDS.length, 'every find sits on a known shelf');
  for (const s of SHELVES) assert.ok(t[s.id] > 0, `${s.id} has finds`);
  for (const s of SHELVES) for (const ref of [s.id, s.es, s.en, ` ${s.es.toUpperCase()} `]) assert.equal(findCollection(ref).id, s.id, String(ref));
  for (const odd of [undefined, null, '', 'nada', 42]) assert.equal(findCollection(odd).id, 'oddities');
  assert.equal(findCollection('coins').total, t.coins); assert.equal(findCollection('Relojes').es, 'Relojes');
  assert.deepEqual(shelfTotals(), t); assert.equal(shelfTotals(), shelfTotals(), 'cached');
});

test('shelfProgress: A3\'s counts() keyed by the Spanish shelf name (or id) fill the four counters in order', () => {
  const p = shelfProgress({ byCollection: { 'Monedas de oro': 2, watches: 1, Joyas: 3 } });
  assert.deepEqual(p.map((s) => s.id), ['coins', 'watches', 'jewels', 'oddities']);
  assert.deepEqual(p.map((s) => s.n), [2, 1, 3, 0]);
  assert.deepEqual(p.map((s) => s.total), SHELVES.map((s) => shelfTotals()[s.id]));
  for (const bad of [null, undefined, {}, { byCollection: null }]) assert.deepEqual(shelfProgress(bad).map((s) => s.n), [0, 0, 0, 0]);
});

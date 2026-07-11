// Static oracle for the DARMOK kanji database (darmok/kanji.js).
// Loads the engine + curriculum + kanji data in a jsdom-free harness and asserts:
//   - every kanji actually taught in the vocab has a breakdown entry;
//   - every entry is well-formed (meaning, readings, radicals, mnemonic, note);
//   - on'yomi are katakana, kun'yomi are hiragana (with okurigana dots);
//   - DK.rubyK makes a known kanji tappable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const load = (f) => (0, eval)(readFileSync(join(dir, f), 'utf8'));
globalThis.window = globalThis; // engine.js does `window.DK = ...`
globalThis.DK = undefined;
load('engine.js');
for (const f of ['weeks01-03.js', 'weeks04-06.js', 'weeks07-09.js', 'weeks10-12.js', 'kanji.js']) load(f);

const KANJI_CHAR = /[㐀-䶿一-鿿]/gu; // real CJK ideographs (excludes 々 iteration mark)
const KATAKANA = /^[ァ-ヴー・]+$/;
const HIRAGANA_KUN = /^[ぁ-ゖ.ー・]+$/;

function curriculumKanji() {
  const set = new Set();
  for (const w of DK.CURRICULUM)
    for (const l of w.lessons)
      for (const v of (l.vocab || []))
        for (const ch of (DK.plain(v[0]).match(KANJI_CHAR) || [])) set.add(ch);
  return [...set];
}

test('kanji database is populated', () => {
  assert.ok(DK.KANJI && typeof DK.KANJI === 'object');
  assert.ok(Object.keys(DK.KANJI).length >= 390, `only ${Object.keys(DK.KANJI).length} kanji`);
});

test('every taught kanji has a breakdown', () => {
  const missing = curriculumKanji().filter((k) => !DK.KANJI[k]);
  assert.deepEqual(missing, [], `missing breakdowns for: ${missing.join(' ')}`);
});

test('every entry is well-formed', () => {
  const problems = [];
  for (const [k, v] of Object.entries(DK.KANJI)) {
    if (typeof v.m !== 'string' || !v.m.trim()) problems.push(`${k}: empty meaning`);
    for (const key of ['on', 'kun', 'rad']) if (!Array.isArray(v[key])) problems.push(`${k}: ${key} not array`);
    if (typeof v.mn !== 'string') problems.push(`${k}: mn not string`);
    if (typeof v.cn !== 'string') problems.push(`${k}: cn not string`);
    for (const r of (v.rad || [])) {
      if (!r || typeof r.c !== 'string' || !r.c) problems.push(`${k}: radical missing component`);
      else if (typeof r.m !== 'string' || !r.m.trim()) problems.push(`${k}: radical ${r.c} missing gloss`);
    }
    for (const o of (v.on || [])) if (!KATAKANA.test(o)) problems.push(`${k}: on'yomi "${o}" is not katakana`);
    for (const u of (v.kun || [])) if (!HIRAGANA_KUN.test(u)) problems.push(`${k}: kun'yomi "${u}" is not hiragana`);
    if (!(v.on.length || v.kun.length)) problems.push(`${k}: no readings at all`);
  }
  assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problem(s): ${problems.slice(0, 40).join(' | ')}`);
});

test('DK.rubyK makes a known kanji tappable and leaves unknown text alone', () => {
  const out = DK.rubyK('日本語[にほんご]');
  assert.match(out, /data-kanji="日"/);
  assert.match(out, /<rt>にほんご<\/rt>/);
  assert.ok(!DK.rubyK('はい').includes('data-kanji'), 'kana-only word must not be tappable');
});

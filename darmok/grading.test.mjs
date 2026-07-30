// Regression oracle for DARMOK answer grading (engine.js DK.normalizeAnswer).
// Guards ALM-BUG-KILN-00006: the typeback grader must accept the exact rōmaji the
// vocab card prints, and must NOT collapse distinct taught words into each other.
//   1. long vowels  — こーひー vs card rōmaji "koohii" must meet (folded, not deleted);
//   2. apostrophe    — ten'in must resolve to てんいん (syllabic-n kept through IME);
//   3. yotsugana     — Hepburn "tsuzukemasu" (づ→zu) must match つづけます;
//   4. no collision  — かれー(curry)/かれ(he), すきー(skiing)/すき(liked) stay distinct.
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

// The typeback accept list, mirroring engine.js (accept:[plain(v0),v1]) + app.js
// submitType (accept ∪ readingForm(accept)).
function accepts(v) {
  const a = [DK.plain(v[0]), v[1]].filter(Boolean);
  return a.concat(a.map((x) => DK.readingForm(x)));
}

test('every reported KILN-00006 word accepts its own card rōmaji', () => {
  const cases = ['koohii', 'geemu', 'takushii', 'biiru', 'gitaa', 'shawaa',
    'chokoreeto', 'sukii', 'karee', "ten'in", 'tsuzukemasu'];
  const vocab = DK.allVocab().map((e) => e.v);
  for (const romaji of cases) {
    const v = vocab.find((x) => x[2] === romaji);
    assert.ok(v, `test corpus should still contain rōmaji "${romaji}"`);
    assert.ok(DK.answersMatch(romaji, accepts(v)),
      `typing card rōmaji "${romaji}" must be accepted for ${v[1]} (${v[3]})`);
  }
});

test('long-vowel / apostrophe / du-zu do not silently collapse distinct words', () => {
  // Folding ー (not deleting) keeps these apart; the pre-fix grader accepted either.
  assert.equal(DK.normalizeAnswer('かれー') === DK.normalizeAnswer('かれ'), false,
    'curry かれー must not fold to he かれ');
  assert.equal(DK.normalizeAnswer('すきー') === DK.normalizeAnswer('すき'), false,
    'skiing すきー must not fold to liked すき');
});

test('yotsugana: Hepburn zu/ji accept the づ/ぢ spelling', () => {
  assert.ok(DK.answersMatch('tsuzukemasu', ['つづけます']), 'zu must accept づ');
  assert.equal(DK.normalizeAnswer('づ'), DK.normalizeAnswer('ず'));
  assert.equal(DK.normalizeAnswer('ぢ'), DK.normalizeAnswer('じ'));
});

test('ALM-BUG-KILN-00014: every entry\'s furigana folds to its kana reading', () => {
  // readingForm strips furigana brackets to the reading; katakana folds to hiragana. That
  // must equal the card's kana (v[1]) — a mis-split like お茶[おちゃ] (→おおちゃ) or
  // 問[と]題[だい] (→とだい) both breaks the ruby and, via typeback accept, the grader.
  // The only sanctioned difference is a leading 〜 counter placeholder, absent from v[1].
  const strip = (s) => s.replace(/^〜/, '');
  const fails = [];
  for (const { v } of DK.allVocab()) {
    if (!v[0] || !v[1]) continue;
    const fold = strip(DK.kataToHira(DK.readingForm(v[0])));
    if (fold !== strip(v[1])) fails.push(`${v[0]} folds to ${fold}, not ${v[1]} (${v[3]})`);
  }
  assert.deepEqual(fails, [], `${fails.length} furigana/kana mismatch(es): ${fails.join(' | ')}`);
});

test('corpus round-trip: typing every card rōmaji is accepted', () => {
  const fails = [];
  for (const v of DK.allVocab().map((e) => e.v)) {
    if (!v[1] || !v[2]) continue;
    if (!DK.answersMatch(v[2], accepts(v))) fails.push(`${v[2]} vs ${v[1]} (${v[3]})`);
  }
  assert.deepEqual(fails, [], `${fails.length} word(s) reject their own card rōmaji: ${fails.join(' | ')}`);
});

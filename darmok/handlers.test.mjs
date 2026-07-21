// Static oracle for DARMOK's delegated click/keyboard handlers (app.js).
// Guards ALM-BUG-KILN-00007: every data-act="X" the UI emits must have a matching
// `act === "X"` branch in the delegated click handler, or the control is dead
// (close-kanji was emitted by the kanji-modal X with no handler, so the modal
// could not be closed by its own button). Also guards the Escape close path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');

test('every emitted data-act has a matching act === handler', () => {
  const emitted = new Set([...src.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]));
  const handled = new Set([...src.matchAll(/act === "([^"]+)"/g)].map((m) => m[1]));
  const dead = [...emitted].filter((a) => !handled.has(a));
  assert.deepEqual(dead, [], `data-act value(s) with no handler branch: ${dead.join(', ')}`);
});

test('close-kanji has a handler and the kanji modal has an Escape path', () => {
  assert.match(src, /act === "close-kanji"[\s\S]{0,40}closeKanji\(\)/,
    'close-kanji must call closeKanji()');
  assert.match(src, /S\.kanjiOpen && e\.key === "Escape"[\s\S]{0,60}closeKanji\(\)/,
    'Escape must close the kanji modal, before the lesson/drill queue guard');
});

test('ALM-BUG-KILN-00012: finishing a drill records a training day', () => {
  // The drill branch of finishSession must add today to P.days, or drilling — the habit
  // the app promotes — never advances "Training days" and the 30-day Long Tour medal.
  assert.match(src, /if \(S\.drill\) \{(?:(?!return)[\s\S])*?P\.days\.push\(today\)(?:(?!return)[\s\S])*?checkMedals\(null,/,
    'the drill branch (before its return) must push today into P.days');
});

test('ALM-BUG-KILN-00017: the mc/listen hint does not call an English gloss a reading', () => {
  // meaning/listen answers are the English gloss; only a Japanese answer (reverse) has a
  // "reading". The hint branch must gate the "reads" framing on JP_RE and state a
  // non-Japanese answer plainly.
  assert.match(src, /ex\.t === "mc" \|\| ex\.t === "listen"[\s\S]{0,320}JP_RE\.test\(ans\)[\s\S]{0,200}The correct answer is/,
    'the mc/listen hint must gate "reads" on JP_RE and state an English answer plainly');
});

test('ALM-BUG-KILN-00016: a medal crossed during a drill is shown, not recorded silently', () => {
  // The drill branch must collect pops (not checkMedals(null, null)) and the drill-complete
  // view must render them, or Universal Translator (drill-only) is never celebrated.
  assert.match(src, /if \(S\.drill\) \{(?:(?!return)[\s\S])*?checkMedals\(null, pops\)/,
    'the drill branch must pass a real pops array to checkMedals');
  assert.doesNotMatch(src, /if \(S\.drill\) \{(?:(?!return)[\s\S])*?checkMedals\(null, null\)/,
    'the drill branch must not discard medal pops');
  assert.match(src, /\(D\.pops \|\| \[\]\)\.map/,
    'the drill-complete view must render D.pops commendations');
});

test('ALM-BUG-KILN-00010: a re-render preserves the in-progress typed answer', () => {
  // The type input must render the stashed value, and rerenderEx must stash the live
  // value before replacing #excard — otherwise ASK DATA / the IME toggle wipe the answer.
  assert.match(src, /id="type-in"[^>]*value="\$\{DK\.esc\(ex\._typed \|\| ""\)\}"/,
    'the type input must render ex._typed as its value');
  assert.match(src, /rerenderEx\(\)\s*\{[\s\S]*?getElementById\("type-in"\)[\s\S]*?_typed = cur\.value[\s\S]*?holder\.innerHTML/,
    'rerenderEx must stash the live typed value before rebuilding #excard');
});

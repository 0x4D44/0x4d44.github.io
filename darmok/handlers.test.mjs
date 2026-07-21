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

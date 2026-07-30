// Regression oracle for DARMOK's wrong-answer requeue copy (app.js `answer()`).
// Guards ALM-BUG-KILN-00008: a failed exercise is requeued for one retry, but the
// copy used to enumerate the transient fields it reset and OMITTED _matchMistakes,
// so a match exercise inherited its already-failing tap count and a flawless retry
// was still graded WRONG (n <= ceil(pairs/2) unsatisfiable). The fix rebuilds the
// copy from the exercise definition only — stripping EVERY _-prefixed field — so no
// future transient field can reintroduce the bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');

test('requeue copy is built by stripping all _-prefixed keys (not an allowlist)', () => {
  assert.match(src, /Object\.fromEntries\(\s*Object\.entries\(ex\)\.filter\(\(\[k\]\) => !k\.startsWith\("_"\)\)\s*\)/,
    'the retry copy must strip every transient _-field, so a new _field cannot leak in');
});

test('executing the real requeue expression drops _matchMistakes so a clean retry passes', () => {
  // Extract the exact copy-construction the fix lands and run it against a failed
  // match exercise, faithfully to app.js. This exercises the real source string.
  const m = src.match(/const copy = (Object\.fromEntries\([\s\S]*?\));\s*copy\._retry = true;\s*copy\._dataNudge = ([^;]+);/);
  assert.ok(m, 'requeue copy construction not found in app.js — did the fix shape change?');
  const buildCopy = new Function('ex', 'L',
    `const copy = ${m[1]}; copy._retry = true; copy._dataNudge = ${m[2]}; return copy;`);

  const failed = {
    t: 'match', pairs: [1, 2, 3, 4], gen: 'g',
    _matchMistakes: 3, _done: new Set([0, 1]), _placed: ['x'], _hints: 2, _assisted: true,
  };
  const copy = buildCopy(failed, { streakWrong: 1 });

  // No transient field survives; definition fields do.
  for (const k of Object.keys(copy)) {
    if (k.startsWith('_')) assert.ok(['_retry', '_dataNudge'].includes(k), `unexpected transient field ${k} on retry`);
  }
  assert.equal(copy._matchMistakes, undefined, '_matchMistakes must reset on retry');
  assert.equal(copy.t, 'match');
  assert.deepEqual(copy.pairs, [1, 2, 3, 4]);
  assert.equal(copy._retry, true);

  // A flawless retry: match grading is `answer(mistakes <= ceil(pairs/2))`.
  const mistakes = copy._matchMistakes || 0;
  assert.ok(mistakes <= Math.ceil(copy.pairs.length / 2), 'a flawless match retry must be winnable');
});

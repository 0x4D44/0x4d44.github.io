// Regression oracles for DARMOK engine state hygiene (engine.js).
// Covers a family of "shared mutable state" defects in the SRS / session layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const load = (f) => (0, eval)(readFileSync(join(dir, f), 'utf8'));
globalThis.window = globalThis;
globalThis.DK = undefined;
globalThis.localStorage = undefined; // engine.js DK.load/save guard on try/catch
load('engine.js');
for (const f of ['weeks01-03.js', 'weeks04-06.js', 'weeks07-09.js', 'weeks10-12.js', 'kanji.js']) load(f);

function lessonWithExercises() {
  for (const w of DK.CURRICULUM)
    for (const l of w.lessons)
      if ((l.exercises || []).length) return { w, l };
  throw new Error('no authored-exercise lesson found');
}

test('ALM-BUG-KILN-00009: each session gets its own authored-exercise instances', () => {
  const { w, l } = lessonWithExercises();
  const s1 = DK.buildSession(w, l);
  const s2 = DK.buildSession(w, l);
  const a1 = s1.find((e) => l.exercises.some((x) => x.q === e.q || x.t === e.t));
  // Write per-attempt play-state onto the first session's exercise, as app.js does.
  s1[0]._placed = ['leak']; s1[0]._assisted = true; s1[0]._matchMistakes = 3;
  // The curriculum object and the next session must be untouched.
  assert.notEqual(s1[0], l.exercises[0], 'session exercise must not BE the curriculum object');
  assert.equal(l.exercises[0]._placed, undefined, 'curriculum object must not carry play-state');
  assert.equal(s2[0]._placed, undefined, 'a fresh session must not inherit prior play-state');
  assert.equal(s2[0]._assisted, undefined);
  assert.equal(s2[0]._matchMistakes, undefined);
  assert.ok(a1);
});

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

test('ALM-BUG-KILN-00011: srsDue drops keys orphaned by a gloss edit (badge == drillable)', () => {
  const realKey = DK.vocabKey(DK.allVocab()[0].v);
  assert.ok(DK.vocabByKey(realKey), 'a real vocab key resolves');
  const now = Date.now();
  const progress = {
    srs: {
      [realKey]: { s: 0, due: now - 1000, seen: 1, lapses: 0 },
      // an orphaned key: same shape but its gloss no longer exists in the curriculum
      'たべる|to eat (OLD GLOSS)': { s: 0, due: now - 1000, seen: 1, lapses: 0 },
    },
  };
  const due = DK.srsDue(progress);
  assert.ok(due.includes(realKey), 'the resolvable key is still due');
  assert.ok(!due.some((k) => !DK.vocabByKey(k)), 'no orphaned key is reported due');
  // The count must equal what a drill can actually be built from.
  const drill = DK.buildDrill(progress, 15);
  assert.equal(due.length, 1, 'only the one resolvable key is counted');
  assert.equal(drill.length, due.length, 'every counted key yields a drillable exercise');
});

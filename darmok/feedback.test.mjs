// Static oracle for DARMOK's "why was I wrong" feedback layer (engine.js + weeks).
// Guards the contrastive-feedback contract:
//   - every generated MC/listen exercise carries a wrongGloss for each distractor;
//   - authored whyWrong keys always name a real *wrong* choice (never the answer,
//     never a typo) — a stray key would silently never render;
//   - DK.identifyAnswer maps a typed reading/rōmaji back to its vocab entry.
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

test('every generated MC/listen exercise glosses each wrong option', () => {
  const pool = DK.allVocab().map((e) => e.v);
  const problems = [];
  for (const v of pool) {
    for (const kind of ['meaning', 'reverse', 'listen']) {
      const ex = DK.genExercise(v, kind);
      const wrong = ex.choices.filter((_, i) => i !== ex.a);
      for (const wc of wrong) {
        if (!ex.wrongGloss || typeof ex.wrongGloss[wc] !== 'string' || !ex.wrongGloss[wc].trim())
          problems.push(`${kind} for ${v[3]}: no gloss for "${wc}"`);
      }
    }
  }
  assert.deepEqual(problems.slice(0, 20), [], `${problems.length} problem(s): ${problems.slice(0, 20).join(' | ')}`);
});

test('ALM-BUG-KILN-00017: generated answer hints use exercise language metadata', () => {
  const problems = [];
  for (const { v } of DK.allVocab()) {
    for (const kind of ['meaning', 'listen']) {
      const ex = DK.genExercise(v, kind);
      const hint = DK.answerHint(ex);
      if (hint !== `The correct answer is 「${DK.esc(v[3])}」.`)
        problems.push(`${kind} for ${v[3]}: ${hint}`);
    }

    const reverse = DK.genExercise(v, 'reverse');
    const reverseHint = DK.answerHint(reverse);
    if (!reverseHint.startsWith('The correct entry reads 「'))
      problems.push(`reverse for ${v[3]}: ${reverseHint}`);
  }
  assert.deepEqual(problems.slice(0, 20), [], `${problems.length} problem(s): ${problems.slice(0, 20).join(' | ')}`);
});

test('authored whyWrong keys name a real wrong choice, never the answer', () => {
  const problems = [];
  let authored = 0;
  for (const w of DK.CURRICULUM)
    for (const l of w.lessons)
      for (const ex of (l.exercises || [])) {
        if ((ex.t !== 'mc' && ex.t !== 'listen') || !ex.whyWrong) continue;
        authored++;
        const wrong = ex.choices.filter((_, i) => i !== ex.a);
        for (const key of Object.keys(ex.whyWrong)) {
          if (key === ex.choices[ex.a]) problems.push(`[${l.id}] whyWrong keys the correct answer: "${key}"`);
          else if (!wrong.includes(key)) problems.push(`[${l.id}] whyWrong key is not a choice: "${key}"`);
          if (typeof ex.whyWrong[key] !== 'string' || !ex.whyWrong[key].trim())
            problems.push(`[${l.id}] empty whyWrong note for "${key}"`);
        }
      }
  assert.ok(authored >= 61, `expected the weeks01-03 MC set authored (>=61), saw ${authored}`);
  assert.deepEqual(problems.slice(0, 20), [], `${problems.length} problem(s): ${problems.slice(0, 20).join(' | ')}`);
});

test('DK.identifyAnswer maps a typed reading (kana and rōmaji) to its vocab entry', () => {
  const neko = DK.identifyAnswer('ねこ');
  assert.ok(neko && neko[3] === 'cat', 'ねこ should resolve to cat');
  assert.equal(DK.identifyAnswer('neko')?.[3], 'cat', 'rōmaji neko should resolve to cat');
  assert.equal(DK.identifyAnswer('xyzzy'), null, 'nonsense resolves to null');
});

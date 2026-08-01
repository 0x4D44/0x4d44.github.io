# ALM-BUG-KILN-00017 — Data second hint labels the English answer as a Japanese "reading"

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** darmok
- **Raised:** 2026-07-13
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Open (2026-07-30, REOPENED by Claude on independent verification — the mislabelling still reproduces for five vocab glosses whose English text contains kana) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260731T175847Z-p35276-n343976000-c1 branch=task/bug-ALM-BUG-KILN-00017-run-fix-20260731T175847Z-p35276-n343976000-c1 code=9e1e099ba4dfd8049a6b4f2ddee27f08a7d66a84 gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit 9e1e099 verified; all five recorded glosses now read correctly and a full 514-entry corpus sweep finds 0 mislabelled meaning/listen hints)

## Observation
On a multiple-choice or listen exercise, the second ASK DATA hint says the correct entry "reads ..." but fills that slot with the English gloss, not a Japanese reading.

## Notes
Confirmed: for mc/listen exercises genExercise builds choices from the English gloss v[3] (engine.js:306-343), so ex.choices[ex.a] is English. hintLines (app.js:419) then emits `The correct entry reads ...` around that English string -- mislabelling English as a Japanese reading. Cosmetic but confusing on the learning path.

Fix: for mc/listen, either drop the "reads" framing for the meaning kinds, or derive the actual reading (DK.plain(DK.readingForm(...)) of the Japanese form) rather than the gloss. Reported by the devil's-advocate lens; verified.

## Fix (2026-07-21)
The second ASK DATA hint for mc/listen now only uses the "reads 「…」" framing when the
correct choice is actually Japanese (`JP_RE.test(ans)` — the "reverse" MC); a meaning or
listen answer is the English gloss and is stated plainly as "The correct answer is 「…」".
Regression: darmok/handlers.test.mjs.

## Independent verification (2026-07-30) — REOPENED

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. **The bug is being returned to Open — the recorded symptom still reproduces.**

**The fix sniffs the answer string instead of using the exercise kind.** `darmok/app.js:417-427` gates the "reads 「…」" framing on `JP_RE.test(ans)` where `ans = ex.choices[ex.a]` and `JP_RE = /[぀-ヿ一-鿿]/` (`app.js:492`). For `meaning` and `listen` exercises the answer *is* the English gloss `v[3]` — so any gloss containing kana is misclassified as Japanese and framed as a reading. Lifting the fixed branch verbatim and running it on real `DK.genExercise` output:

```
--- normal English gloss (the bug's case) ---
meaning -> The correct answer is 「I, me」.
listen  -> The correct answer is 「I, me」.
reverse -> The correct entry reads 「私」.

--- glosses containing Japanese in a parenthetical ---
gloss="side, direction (の方が)"  ->  The correct entry reads 「side, direction (の方が)」.
gloss="yeah (casual はい)"        ->  The correct entry reads 「yeah (casual はい)」.
gloss="nah (casual いいえ)"       ->  The correct entry reads 「nah (casual いいえ)」.
gloss="to ride, board (に)"       ->  The correct entry reads 「to ride, board (に)」.
gloss="to meet (person に)"       ->  The correct entry reads 「to meet (person に)」.
```

That last group is the recorded symptom verbatim: a `meaning`/`listen` answer, which is the English gloss, framed as a Japanese reading. Independently confirmed the five entries exist in the shipped corpus — `方[ほう]`, `うん`, `ううん`, `乗[の]ります`, `会[あ]います` in `weeks04-06.js` and `weeks07-09.js`. `genExercise` builds `meaning` and `listen` for any vocab entry (`engine.js:395-410`, `:427-441`) and `buildDrill`/`buildSession` cycle all four kinds, so all five are reachable in normal play.

**Why the guard missed it.** The regression test in `darmok/handlers.test.mjs` is a source regex that only checks the `JP_RE` gate *exists*. It has no vocab-corpus oracle, which is exactly why five live failures sat behind a green test.

**Suggested fix (root cause, not the string).** The bug's own Notes identify the cause correctly: the *exercise kind* determines the answer's language, and that is already on the object — `engine.js:420` sets `choicesJp: true` on the `reverse` MC and on nothing else. Replacing `JP_RE.test(ans)` at `app.js:422` with `ex.choicesJp` is correct by construction. The converse was checked safe: 0 of 513 `reverse` answers fail `JP_RE`. A corpus oracle over all `meaning`/`listen` hints should be added alongside, or this recurs.

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `9e1e099`). **The recorded symptom no longer reproduces.**

**The five glosses named in the 2026-07-30 reopen now all read correctly:**

```
gloss="side, direction (の方が)" meaning/listen -> The correct answer is 「side, direction (の方が)」.
gloss="yeah (casual はい)"        meaning/listen -> The correct answer is 「yeah (casual はい)」.
gloss="nah (casual いいえ)"       meaning/listen -> The correct answer is 「nah (casual いいえ)」.
gloss="to ride, board (に)"       meaning/listen -> The correct answer is 「to ride, board (に)」.
gloss="to meet (person に)"       meaning/listen -> The correct answer is 「to meet (person に)」.
```

**Whole-corpus sweep, both directions:** over all 514 vocab entries, meaning/listen hints
mislabelled as a reading = **0**; reverse hints *not* framed as a reading = **0**. So the fix
neither under- nor over-applies the "reads" framing.

**Root cause, fixed by construction — exactly what the reopen prescribed.** The reopen said to
replace the answer-string sniff `JP_RE.test(ans)` with the exercise metadata `ex.choicesJp`,
which `engine.js:420` sets only on the reverse MC. The fix does that, in a new
`DK.answerHint(ex)` (`darmok/engine.js:470`), and `darmok/app.js:417` now simply calls it — the
language of the answer is no longer inferred from its characters.

**Proven to bite (fails-before / passes-after).** Reverting the gate to `JP_RE.test(ans)` on a
scratch copy makes `darmok/feedback.test.mjs` fail with **"10 problem(s)"** naming precisely the
five recorded glosses in both kinds. Restored, it passes.

**The vacuous guard was replaced, not kept.** The old source-regex assertion in
`darmok/handlers.test.mjs` (which only checked the `JP_RE` gate *existed* — the reason five live
failures sat behind a green test) was deleted, and a real corpus oracle over every entry x every
kind added to `darmok/feedback.test.mjs`.

**Gates:** root `npm test` and `npm run build` both exit 0 on this tree.

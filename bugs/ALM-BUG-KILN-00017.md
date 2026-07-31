# ALM-BUG-KILN-00017 — Data second hint labels the English answer as a Japanese "reading"

- **State:** Open
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Open (2026-07-30, REOPENED by Claude on independent verification — the mislabelling still reproduces for five vocab glosses whose English text contains kana)

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

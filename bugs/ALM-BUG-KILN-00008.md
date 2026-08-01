# ALM-BUG-KILN-00008 — Match-exercise retry is unwinnable -- _matchMistakes not reset in the requeue copy

- **State:** Closed
- **Priority:** Must
- **Severity:** Medium
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — retry copy strips all _-prefixed play state; flawless retry now grades PASS)

## Observation
Failing a "match" exercise (too many wrong taps) requeues it, but a flawless retry is still graded WRONG and demotes the word again.

Repro over http://localhost:8000/darmok/: reach a match exercise (e.g. shift 1.2, 4 pairs -> threshold 2), make 3 wrong taps, finish -> marked wrong, requeued at the shift end. On the retry, match all 4 pairs perfectly. Expected: passed. Actual: "REVISION REQUIRED" again, and no further retry.

## Notes
Confirmed by direct code read: grading is `answer(ex._matchMistakes <= Math.ceil(pairs/2))` (app.js:1113) and _matchMistakes only ever increments (app.js:1118). The requeue copy (app.js:585) enumerates the fields it resets -- _bank,_placed,_left,_right,_done,_hints,_hidden,_assisted,_dataNudge -- but OMITS _matchMistakes, so the copy inherits the already-failing count, making `n <= ceil(pairs/2)` unsatisfiable. Because the copy has _retry:true, the re-requeue guard (app.js:583) blocks a third attempt, so the item ends wrong; L.wrongTotal double-counts (can mis-award the "Shields Held" >=5-miss medal). All 6 authored match exercises (4 pairs) are affected.

Fix: add `_matchMistakes: 0` to the reset object (app.js:585-587). Better (kills the whole class): build the copy by stripping ALL underscore-prefixed keys -- `Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith('_')))` -- then set _retry/_dataNudge, so any future _field is reset by construction. Reported by 2 lenses; verified directly.

## Fix (2026-07-21)
The wrong-answer requeue copy in `answer()` (darmok/app.js) now rebuilds the retry
from the exercise **definition only** —
`Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith("_")))` — then
sets just `_retry`/`_dataNudge`. This strips every transient `_`-field by construction
(the audit confirmed all `_`-prefixed fields are per-attempt state, none is part of the
exercise definition), so `_matchMistakes` resets to a clean 0 and a flawless match retry
now satisfies `mistakes <= ceil(pairs/2)`. It also kills the whole class: any future
`_field` resets automatically. Regression: darmok/requeue.test.mjs — statically pins the
strip-all construction and executes the real requeue expression against a failed match
exercise to prove `_matchMistakes` no longer survives; fails before, passes after. Wired
into `npm run build`/`npm test`.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `f0ab329`.

**Original observation re-checked — resolved.** `darmok/app.js:619-621` now builds the requeue copy by stripping every `_`-prefixed key rather than resetting a named list. Running the real expression against a failed 4-pair match carrying `_matchMistakes: 3`:

```
retry copy keys: t,q,pairs,_retry,_dataNudge
_matchMistakes on copy: undefined
flawless retry graded: PASS (0 <= 2)
pre-fix (inherited count) would grade: FAIL
```

**This is the class fix, not the field fix**, and that was checked exhaustively: every write to an exercise object in `app.js` (`_hidden:502`, `_bank:523`, `_placed:524/1132/1137/1207`, `_left/_right/_done:532-534/1152`, `_matchMistakes:1156/1162`, `_hints/_assisted/_dataNudge:1235-1237`, `_typed:1258`) is `_`-prefixed, and no definition field (`t/q/pairs/tokens/choices/a/accept/gen/why/show/alsoOk/extra/wrongGloss`) is — so stripping `_*` cannot drop anything a retry needs. Regression coverage `darmok/requeue.test.mjs` passes 2/2 and is behavioural: it extracts the copy expression from live `app.js` source and executes it.

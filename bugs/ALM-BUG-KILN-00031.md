# ALM-BUG-KILN-00031 — Shipshape difficulty adjusts after a single feedback log instead of the intended run of 3 (or 2)

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** shipshape
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — single-session feedback no longer moves difficulty; legacy migration verified)

## Observation
A single session's feedback moves an exercise's difficulty level: one "too_easy" bumps the level up (targets get harder), one "too_hard" drops it down (targets get easier) — even though the code intends a sustained run before adjusting. The effect is user-visible via the next day's target reps/seconds/weight.

Repro (verified by running the shipped engine): with a fresh progression (empty history), `updateProgression` with a single `{status:'done', feedback:'too_easy'}` returns `currentLevel = 1` (from 0), and a single `{status:'done', feedback:'too_hard'}` returns `currentLevel = level-1`. Expected (per the variable names and the "three easy completions" test): no change until a genuine run accumulates.

## Notes
Two root causes in `shipshape/engine.js` `updateProgression` (lines 153-160):
1. `easyRun = recentFeedback.slice(-3).every(f => f === 'too_easy') && recentStatuses.slice(-3).every(s => s === 'done')` and `hardRun = recentFeedback.slice(-2).every(f => f === 'too_hard') || ...`. `Array.prototype.every` is **vacuously true** on an array shorter than the slice window, so with 1-2 prior entries the "run" condition is satisfied by a single matching log. The intended thresholds (3 easy, 2 hard) are not enforced until history reaches that length. The existing test (engine.test.mjs:33-36) primes two prior `too_easy` entries before the third, so it never exercises the short-history case.
2. `recentFeedback` and `recentStatuses` are built by **independent** `.filter(Boolean)` passes (lines 153-154), so a log with a status but no feedback (e.g. a 'skipped' duty) advances `recentStatuses` but not `recentFeedback`. Verified: after 2 easy+done then one status-only 'skipped', the arrays are length 2 vs 3. The `easyRun` AND-condition then compares `slice(-3)` of two misaligned arrays — it no longer verifies that the SAME three events were both `too_easy` and `done`.

Impact: difficulty (level 0-8, which drives `targetFromExercise` reps/seconds/weight) swings on one session's feedback rather than a trend — contradicting the design. Low severity: self-correcting, no data loss, and a fitness app adapting a touch fast is a soft failure.

Fix: (a) require the window to be full before adjusting — e.g. `recentFeedback.length >= 3 && recentFeedback.slice(-3).every(...)`; (b) keep feedback and status aligned by recording combined entries (one array of `{feedback, status}`) and slicing that, so the run check reasons over the same events. Add a test for the empty-history and status-only-log cases.

## Fix (2026-07-21)
`updateProgression` now (a) requires the full window before adjusting
(`recentLog.length >= 3 && last(3).every(...)`, `>= 2` for the hard run), closing the
vacuous-`every()` short-history hole, and (b) reasons over a single aligned `recentLog` of
`{feedback, status}` per duty (migrating from the legacy `recentFeedback`/`recentStatuses`
columns), so a status-only 'skipped' duty can no longer shift feedback and status out of
step. Difficulty now moves on a genuine run, not one session. Regression:
shipshape/tests/engine.test.mjs adds the empty-history single-feedback cases and a
status-only alignment check, and keeps the three-easy-completions progression test.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `91940a3`.

**Original observation re-checked — resolved, driven against the real engine.** `shipshape/engine.js:156-168` replaces the two independently-filtered arrays with a single aligned `recentLog` of `{feedback, status}` (with positional migration from the legacy columns) and adds explicit length gates, so `every` can no longer be vacuously true on a short slice:

```
A. fresh progression, ONE too_easy/done: level= 0   (was 1)
B. after 1 easy=0, after 2 easy=0, after 3 easy=1, after 4 easy=2
C. level 3 + ONE too_hard: level= 3   (was 2);  + a second too_hard: level= 2
D. 2 easy+done, then status-only 'skipped', then 1 easy+done -> level 0
   (the skipped entry correctly breaks the run)
E. legacy {recentFeedback:[easy,easy], recentStatuses:[done,done]} + 1 easy -> level 1
```

Row D is the alignment hole from the observation: `easyRun` now also requires `status === 'done'` on the *same* entry. Row E confirms the legacy-column migration does not silently reset an existing user's history — a real risk with this shape of change.

**Over-correction probed.** `pain_or_discomfort` still drops the level on a single report (4→3), which is the deliberate immediate branch; three status-only `skipped` entries from empty history leave the level at 0 because it is already floored. Regression coverage `shipshape/tests/engine.test.mjs:51-62` passes, along with `storage.test.mjs` and `validate-static.mjs`.

# ALM-BUG-KILN-00009 — Authored exercises are shared curriculum objects -- transient play-state leaks into replays

- **State:** Fixed
- **Priority:** Should
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
Replaying a completed lesson (or abandoning one and re-entering) shows exercises pre-solved: a "build the sentence" card renders already filled with the previous correct answer and an enabled SUBMIT (auto-pass); a multiple-choice card shows two wrong options already greyed out.

Repro over http://localhost:8000/darmok/: complete a lesson containing a build exercise, then replay it from the roster ("nothing is locked"). Expected: fresh, empty exercise. Actual: the build slots are pre-filled with the prior answer; MC distractors are pre-faded.

## Notes
Confirmed empirically against the engine: DK.buildSession does `(lesson.exercises||[]).slice()` (engine.js:357) -- it copies the ARRAY but its elements remain the live DK.CURRICULUM exercise objects. app.js writes per-attempt UI state (_bank/_placed app.js:516-517, _hidden :495, _hints/_assisted :1189-1190) directly onto that shared object and never clears it (the only resets act on a fresh requeue copy). So state survives to the next play.

Secondary corruption: once "ASK DATA" is used on an exercise, _assisted stays true forever, so `L.firstTry[idx] = ok && !ex._assisted` (app.js:576) can never again be a clean first try -- permanently depressing that lesson's replay score and blocking the perfect-score medal.

Fix: give each session its own exercise instances -- `const authored = (lesson.exercises||[]).map(e => Object.assign({}, e));` in buildSession, or keep curriculum objects immutable and hold all transient _-state in queue-local copies only. Verified by an adversarial skeptic that reproduced the leaked object.

## Fix (2026-07-21)
`DK.buildSession` now instantiates per-session copies of the authored exercises —
`(lesson.exercises||[]).map(e => Object.assign({}, e))` — instead of `.slice()` (which
copied only the array, leaving the elements the live DK.CURRICULUM objects). Transient
play-state that app.js writes onto the exercise object (`_placed`/`_bank`/`_hidden`/
`_hints`/`_assisted`/`_matchMistakes`/`_typed`) therefore lands on the session copy and
never leaks into a replay, and the secondary `_assisted`-forever score depression is gone
with it. Regression: darmok/engine-state.test.mjs (fails on the pre-fix `.slice()`).

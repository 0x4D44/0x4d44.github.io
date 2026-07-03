# ALM-BUG-FLUXHOMEARPA-00005 — Nihon Quest review exposes locked future material to new users

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)

## Observation
`createInitialProgress()` creates review cards for every chapter phrase and sign immediately in `japanese-travel-rpg/engines.js:7`. `dueCards()` filters only by due timestamp in `japanese-travel-rpg/engines.js:20`, and the shipped review tab uses that result directly at `japanese-travel-rpg/index.html:798`.

Expected: a new learner's review queue should contain learned/unlocked material only, matching the app copy that says completing lessons adds more cards.

Actual: all phrase and sign cards start due immediately, including locked future chapters.

## Notes
Concrete fix: either create review cards inactive and schedule them on `completeLesson()`, or have `dueCards()` filter by `learnedPhraseIds` and `learnedSignIds`. Add a regression assertion that initial progress has no review cards due until the first lesson is completed.

# ALM-BUG-FLUXHOMEARPA-00005 — Nihon Quest review exposes locked future material to new users

- **State:** Closed
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — a new learner's due queue measured 40 cards before the fix, 0 after)

## Observation
`createInitialProgress()` creates review cards for every chapter phrase and sign immediately in `japanese-travel-rpg/engines.js:7`. `dueCards()` filters only by due timestamp in `japanese-travel-rpg/engines.js:20`, and the shipped review tab uses that result directly at `japanese-travel-rpg/index.html:798`.

Expected: a new learner's review queue should contain learned/unlocked material only, matching the app copy that says completing lessons adds more cards.

Actual: all phrase and sign cards start due immediately, including locked future chapters.

## Notes
Concrete fix: either create review cards inactive and schedule them on `completeLesson()`, or have `dueCards()` filter by `learnedPhraseIds` and `learnedSignIds`. Add a regression assertion that initial progress has no review cards due until the first lesson is completed.

## Fix (2026-07-21)
`dueCards()` (engines.js) now gates by learned status as well as due time: a card is
eligible only if its `sourceId` is in `learnedPhraseIds` (phrase) or `learnedSignIds`
(sign). A fresh `createInitialProgress()` learner therefore sees an empty review queue,
and `completeLesson()` brings that chapter's phrase/sign cards into review — matching the
app copy ("Complete lessons to add more"). Regression: tests/self-check.mjs asserts a new
learner has 0 due cards and that after completing uk-home only uk-home cards are due;
fails on the pre-fix engine.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix.

**Original observation re-checked — resolved, measured.** `dueCards` (`engines.js:20`) now intersects the due filter with the learner's `learnedPhraseIds`/`learnedSignIds` sets. Driving the real engine:

```
total review cards created: 144
PRE-FIX dueCards(new learner,'deep'): 40 -> chapters: uk-home,airport-flight,arrival-japan,tokyo-transport-hotel,tokyo-food-conbini
POST-FIX dueCards(new learner,'deep'): 0
POST-FIX dueCards(new learner,'daily'): 0
after completing uk-home: due=9  chapters=uk-home            types=phrase,sign
after also airport-flight: due=18 chapters=uk-home,airport-flight
```

The pre-fix row reproduces the recorded symptom (40 cards spanning 5 chapters, 4 of them locked); post-fix the queue is empty until a lesson is completed, then grows by exactly that chapter's 5 phrases + 4 signs. Guard `tests/self-check.mjs:19-22` mutation-tested: reverting to the bare timestamp filter fires *"a new learner has no due review cards until material is learned"*.

**Refutation attempts that held.** Existing saves are unaffected — `mergeProgress` (`engines.js:10`) preserves both learned-id lists. Id consistency under the content overlay holds because the overlay (`index.html:519-524`) runs before `mergeProgress`, so `sourceId` and `learnedPhraseIds` are drawn from the same mutated chapter objects; signs are never overlaid. `createInitialProgress` still mints all 144 cards, but they are inert — by design, not a defect.

# ALM-BUG-KILN-00007 — Kanji breakdown modal close (X) button is dead -- no close-kanji handler

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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — close-kanji handler present; dead-data-act oracle reports [close-kanji] pre-fix and [] now)

## Observation
Tapping the X in the corner of a kanji breakdown modal does nothing; the modal stays open.

Repro over http://localhost:8000/darmok/: open a lesson vocab card or Reference -> Kanji, tap any kanji to open its breakdown modal, then tap the X (top corner). Expected: modal closes. Actual: a "nav" chirp plays (so the tap registered) but the modal remains. The only working dismissal is tapping the thin dark backdrop margin -- hard to hit on a phone where the card fills the viewport, so the app reads as hung.

## Notes
Confirmed by direct code read: the X is emitted as `<button class="kd-x" data-act="close-kanji">` (app.js:770), but the delegated click handler's act if/else chain (app.js:1128-1201) has NO `close-kanji` branch -- it is the only data-act value emitted with no matching handler. `closeKanji()` (app.js:789) is reachable only from the `.kanji-scrim` backdrop branch (app.js:1044). There is no Escape path either (the keydown listener early-returns unless a lesson/drill queue is live).

Fix: add `else if (act === "close-kanji") { closeKanji(); }` to the act chain; also handle Escape (`if (S.kanjiOpen && e.key === "Escape") closeKanji();`) placed before the queue guard in the keydown listener. Tapping a kanji is a headline feature promoted by the orientation tour, so this is squarely on the primary path. Reported by 3 independent review lenses; verified directly.

## Fix (2026-07-21)
Added the missing `else if (act === "close-kanji") { closeKanji(); }` branch to the
delegated click handler in darmok/app.js, so the modal's own X button now closes it.
Also added an Escape path (`if (S.kanjiOpen && e.key === "Escape") closeKanji();`)
placed **before** the lesson/drill queue guard in the keydown listener, since the
kanji modal can open outside a live lesson. Regression: darmok/handlers.test.mjs — a
static oracle asserting every emitted `data-act` has a matching `act === ` handler
(close-kanji was the only orphan) plus the Escape path; fails on the pre-fix app.js,
passes after. Wired into `npm run build`/`npm test`.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `636972b`.

**Original observation re-checked — resolved.** The handler now exists at `darmok/app.js:1174-1175` (`if (act === "close-kanji") { closeKanji(); }`), with an Escape path at `app.js:1270` placed before the queue guard at `:1272`. The full delegated path was traced: the ✕ emits `data-act="close-kanji"` (`app.js:814`), matches the delegated selector (`app.js:1089`), passes no earlier branch, reaches the `act` dispatch at `:1170` and hits `:1174`; `closeKanji()` (`app.js:833-837`) removes `.kanji-scrim`, so the modal is genuinely torn down. Regression coverage `darmok/handlers.test.mjs` passes 6/6, and the oracle discriminates: its dead-`data-act` list reports `["close-kanji"]` against pre-fix `app.js` (`c152a6c`) and `[]` against current.

**Limit of this verification:** no browser click was performed; the DOM path was read, not exercised.

**Residual noted, not separately tracked.** The keydown listener returns early when focus is inside an `INPUT` (`app.js:1267`) *before* the Escape branch at `:1270`, so Escape is inert if a learner opens a kanji breakdown from a live typeback while focus sits in `#type-in`. The ✕ still works, so the recorded symptom is unaffected.

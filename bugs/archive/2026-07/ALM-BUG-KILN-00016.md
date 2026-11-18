# ALM-BUG-KILN-00016 — Medals earned during a drill are awarded silently -- no popup, no chime

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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — drill now collects pops, plays the chime, and renders COMMENDATION cards)

## Observation
Crossing a medal threshold during a spaced-review drill records the medal but shows the user nothing -- no popup, no medal chime, nothing on the drill-complete screen.

## Notes
Confirmed by direct code read: the drill branch of finishSession calls `checkMedals(null, null)` (app.js:635) with a null pops list; award() only records a popup when popList is truthy (app.js:45). So a medal crossed mid-drill is added to P.medals silently, and the drill-complete view (app.js:706-719) renders no commendation. This hits the one medal earnable ONLY in a drill -- "Universal Translator" (300 drill reviews, app.js:65) -- which is therefore never celebrated; it also sits at index 9, outside the bridge's first-6 preview (app.js:248), so it stays invisible until the user hunts the LOG.

Fix: give the drill branch a real pops array -- `const pops = []; checkMedals(null, pops);` -- stash it on S.drill, render the medal-pop markup in the drill-complete view (as doneHtml does at app.js:677), and play the "medal" chime when pops.length. Reported by the devil's-advocate lens; verified.

## Fix (2026-07-21)
The drill branch of `finishSession` now collects medal pops — `const pops = [];
checkMedals(null, pops); S.drill.pops = pops;` — plays the medal chime when `pops.length`,
and the drill-complete view renders each as a COMMENDATION card (mirroring the lesson
done view). So a medal crossed mid-drill — notably Universal Translator, earnable ONLY in
a drill — is celebrated instead of recorded silently. Regression: darmok/handlers.test.mjs
asserts the drill branch passes a real pops array (not null,null) and the view renders
D.pops.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `0e87a14`.

**Original observation re-checked — resolved.** `darmok/app.js:675-680` now passes a real `pops` array into `checkMedals`, stores it on `S.drill`, and schedules the `medal` tone; the drill-complete view renders `(D.pops || []).map(...)` as COMMENDATION cards at `app.js:757`. All three prerequisites were checked to exist: `award()` only pushes to a truthy `popList` (`app.js:42-47`) — now truthy; the `medal` tone exists in `DK.beep` (`engine.js:566`); the `.medal-pop` class exists (`darmok/lcars.css:905`). `award` dedupes against `P.medals`, so only genuinely new medals pop, and every id passed to `award` in `checkMedals` exists in the `MEDALS` table (`app.js:27-41`), so `pops` cannot receive an `undefined` that would throw on `m.ic`. `universal-translator` (`P.reviews >= 300`, `app.js:65`) is reached in the same call and `P.reviews` increments on the drill path (`app.js:627`).

**Limits of this verification:** the popup and chime were not observed — this is a visual/audio outcome — and the regression guard in `darmok/handlers.test.mjs` is a source-shape oracle (3 assertions, all confirmed to fail against pre-fix `app.js`).

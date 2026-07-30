# ALM-BUG-KILN-00016 — Medals earned during a drill are awarded silently -- no popup, no chime

- **State:** Fixed
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

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

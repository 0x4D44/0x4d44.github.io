# ALM-BUG-KILN-00011 — SRS keys embed the mutable English gloss -- a content edit inflates the drill badge and can make BEGIN DRILL inert

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
After any edit to a word's English gloss, a returning user's "Drills Due" tile and DRILLS badge over-count, and if the due keys are all orphaned the BEGIN DRILL button does nothing when tapped.

Repro: with existing SRS progress in localStorage, change a vocab entry's English gloss (v[3]) -- e.g. "I, me" -> "I / me" -- reload http://localhost:8000/darmok/. Expected: drill count unchanged, drill runs. Actual: the badge counts the stale key, but the drill cannot include it.

## Notes
Confirmed: DK.vocabKey is `DK.plain(v[0]) + "|" + v[3]` (engine.js:260) -- keyed on the mutable gloss. DK.srsDue returns every due key (engine.js:251-254); DK.buildDrill silently drops keys DK.vocabByKey cannot resolve (`if (e)`, engine.js:386). So an orphaned key is counted forever but never drilled and never rescheduled. If all sampled keys are orphans, startDrill's empty-queue bail (app.js:741-742) just re-renders the same BEGIN DRILL(N) button -> a dead click; the completion screen says "N still due" in an endless loop. This is the single most likely future edit (curriculum content) silently breaking a distant subsystem (SRS).

Fix: filter at the source -- `DK.srsDue` returns only keys where `DK.vocabByKey(k)` resolves (fixes badge, tile, and sampling at once); in startDrill, when the queue is empty but keys are due, prune the orphans from P.srs and save. Longer term, key SRS on a stable id (drop v[3] from vocabKey) and record the key as a persistence contract in CLAUDE.md. Reported by 2 lenses; verified.

## Fix (2026-07-21)
`DK.srsDue` now returns only keys that still resolve via `DK.vocabByKey(k)`. Because
`vocabKey` embeds the mutable English gloss, editing a gloss orphans that word's stored
SRS key; the orphan could never be drilled (buildDrill drops unresolved keys) yet was
counted forever, inflating the "Drills Due" tile/badge and — if every sampled key was an
orphan — leaving BEGIN DRILL inert. Filtering at the source fixes the count, the tile, and
sampling together, so the badge now equals what a drill can actually build. Regression:
darmok/engine-state.test.mjs asserts an orphaned key is not reported due and that
`buildDrill(...).length === srsDue(...).length`.

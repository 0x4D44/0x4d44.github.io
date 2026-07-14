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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

## Observation
On a multiple-choice or listen exercise, the second ASK DATA hint says the correct entry "reads ..." but fills that slot with the English gloss, not a Japanese reading.

## Notes
Confirmed: for mc/listen exercises genExercise builds choices from the English gloss v[3] (engine.js:306-343), so ex.choices[ex.a] is English. hintLines (app.js:419) then emits `The correct entry reads ...` around that English string -- mislabelling English as a Japanese reading. Cosmetic but confusing on the learning path.

Fix: for mc/listen, either drop the "reads" framing for the meaning kinds, or derive the actual reading (DK.plain(DK.readingForm(...)) of the Japanese form) rather than the gloss. Reported by the devil's-advocate lens; verified.

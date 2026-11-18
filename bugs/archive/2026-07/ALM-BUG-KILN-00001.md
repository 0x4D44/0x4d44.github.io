# ALM-BUG-KILN-00001 — Morning Run average lap shows unit pace instead of lap time

- **State:** Closed
- **Priority:** Should
- **Severity:** Medium
- **Area:** morning-run
- **Raised:** 2026-07-10
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
- **State history:** Open (2026-07-10, raised by Codex from Arthur's report) -> Fixed (2026-07-10, fixed by Codex in f1b02ca; awaiting independent verification) -> Closed (2026-07-13, independently verified and closed by Claude — not the fixer)

## Observation
Arthur reported: “I'm not convinced the average laptime works - on my first laps (which are about 4mins) it report ~6 or 7 minutes.”

Repro: start a ship run, mark the start line, then record one or more laps of about four minutes. The live “avg / lap” card and saved-run “avg / lap” summary should show about 4:00. Instead, both convert the average lap duration into pace per mile or kilometre, producing a larger value that varies with the configured lap length.

## Notes
Confirmed in `morning-run/app.jsx`: the stored lap durations and arithmetic mean are correct, but both “avg / lap” render paths pass that duration through `paceSecPerUnit()` before formatting it. The fix should format the average duration directly and cover both the live run and saved summary with an automated source-level regression test.

Fixed in `f1b02ca`. Both “avg / lap” cards now format the arithmetic mean as elapsed time, while the separate pace columns retain unit-pace formatting. The same change makes auto-count opt-in. The regression proves 4:00, 4:10, and 4:05 laps average to 4:05, checks both display paths, and checks both auto-count defaults. `npm test`, `npm run build`, and an HTTP-served Chrome boot check passed. Independent closure is still required.

## Independent verification (2026-07-13)
Verified by a second pair of eyes (fresh context; did not author the fix).

- **Symptom gone (observed, not asserted):** drove the real app in headless Chrome over HTTP
  with a clock-offset shim, recording three ~4-minute ship laps. With the product source
  reverted to `f1b02ca~1` the original symptom reproduces verbatim — laps of 4:01/4:11/4:06
  render "avg / lap" as **10:15** on both the live card and the saved summary. On the current
  source the same drive renders **4:06** on both, while the separate per-lap *pace* columns
  correctly still show unit pace.
- **Guard bites:** reverting only `app.jsx` + `geo.js` (tests kept at HEAD) fails 3 of 4 tests
  in `morning-run/tests/layout.test.mjs` (incl. `TypeError: L.meanMs is not a function`); 4/4
  pass on restore.
- **Root cause addressed, no functional residual:** every remaining `paceSecPerUnit()` call site
  was enumerated and each is a legitimate pace, not a lap duration. Saved history runs re-render
  through the same fixed summary sheet, so older saves display correctly too.
- **Disclosed caveat (not a defect):** the fixing commit also flipped `autoCount` from
  `useState(true)` to `useState(false)` — auto lap counting became opt-in. That is unrelated to
  the reported symptom. It is disclosed in the ledger; **flagged to Arthur to confirm it was
  intended.**
- Coverage note: two of the three assertions are source-text regexes, so they pin the current
  spelling rather than the invariant. Tracked systemically as ALM-BUG-KILN-00029.

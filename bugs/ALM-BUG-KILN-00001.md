# ALM-BUG-KILN-00001 — Morning Run average lap shows unit pace instead of lap time

- **State:** Fixed
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
- **State history:** Open (2026-07-10, raised by Codex from Arthur's report)
- **State history:** Fixed (2026-07-10, fixed by Codex in f1b02ca; awaiting independent verification)

## Observation
Arthur reported: “I'm not convinced the average laptime works - on my first laps (which are about 4mins) it report ~6 or 7 minutes.”

Repro: start a ship run, mark the start line, then record one or more laps of about four minutes. The live “avg / lap” card and saved-run “avg / lap” summary should show about 4:00. Instead, both convert the average lap duration into pace per mile or kilometre, producing a larger value that varies with the configured lap length.

## Notes
Confirmed in `morning-run/app.jsx`: the stored lap durations and arithmetic mean are correct, but both “avg / lap” render paths pass that duration through `paceSecPerUnit()` before formatting it. The fix should format the average duration directly and cover both the live run and saved summary with an automated source-level regression test.

Fixed in `f1b02ca`. Both “avg / lap” cards now format the arithmetic mean as elapsed time, while the separate pace columns retain unit-pace formatting. The same change makes auto-count opt-in. The regression proves 4:00, 4:10, and 4:05 laps average to 4:05, checks both display paths, and checks both auto-count defaults. `npm test`, `npm run build`, and an HTTP-served Chrome boot check passed. Independent closure is still required.

# ALM-BUG-KILN-00001 — Morning Run average lap shows unit pace instead of lap time

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-10, raised by Codex from Arthur's report)

## Observation
Arthur reported: “I'm not convinced the average laptime works - on my first laps (which are about 4mins) it report ~6 or 7 minutes.”

Repro: start a ship run, mark the start line, then record one or more laps of about four minutes. The live “avg / lap” card and saved-run “avg / lap” summary should show about 4:00. Instead, both convert the average lap duration into pace per mile or kilometre, producing a larger value that varies with the configured lap length.

## Notes
Confirmed in `morning-run/app.jsx`: the stored lap durations and arithmetic mean are correct, but both “avg / lap” render paths pass that duration through `paceSecPerUnit()` before formatting it. The fix should format the average duration directly and cover both the live run and saved summary with an automated source-level regression test.

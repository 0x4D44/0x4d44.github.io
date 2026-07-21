# ALM-BUG-KILN-00032 — Shipshape longestStreak miscounts across a DST transition (fixed 86,400,000 ms day comparison)

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
- **Area:** shipshape
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
The "longest streak" statistic undercounts any maintained streak that spans a British Summer Time change: genuinely-consecutive days are split into two shorter runs twice a year.

Repro (verified by running the shipped engine in Europe/London): three consecutive maintained days across the 2026 spring-forward (Mar 28, 29, 30) yield `longestStreak = 2` instead of 3. The code's day comparison `new Date('2026-03-29T12:00:00') - new Date('2026-03-28T12:00:00')` is 82,800,000 ms (23 h), not the 86,400,000 the code requires.

## Notes
`shipshape/engine.js` `calculateStats` (line 213): the longest-streak loop treats two dates as consecutive only when `(new Date(`${date}T12:00:00`) - new Date(`${prev}T12:00:00`)) === 86400000`. A local date-time with no timezone offset is parsed in the browser's local zone, so across a DST transition the noon-to-noon delta is 23 h (spring) or 25 h (autumn) — never exactly 86,400,000 — and `run` resets to 1, splitting the streak.

The inconsistency is telling: the sibling `currentStreak` (lines 203-210) walks days with `cursor.setDate(cursor.getDate() - 1)` and `isoDate(cursor)`, which is DST-safe. Only `longestStreak` uses the brittle millisecond comparison.

Impact: Low — a cosmetic stat, wrong only around the two annual DST transitions, and it under-reports (never over-reports). Fix: compare calendar days, not milliseconds — e.g. derive the previous calendar date with `setDate` (as `currentStreak` does) and compare the `isoDate` strings, or check the delta is within a tolerant 23-25 h window. Add a DST-boundary test.

## Fix (2026-07-21)
The longest-streak loop in `calculateStats` now compares CALENDAR days instead of a fixed
86,400,000 ms delta: an `isConsecutive(prev, date)` helper derives prev's next date via
`setDate(getDate()+1)` and compares `isoDate` strings (the DST-safe method `currentStreak`
already used). A maintained streak spanning a BST transition is no longer split. Regression:
shipshape/tests/streak-dst.test.mjs runs under `TZ=Europe/London` and asserts 28→29→30 Mar
2026 (spring-forward) counts as 3; wired into the test script.

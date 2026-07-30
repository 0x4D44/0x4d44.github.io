# ALM-BUG-KILN-00032 — Shipshape longestStreak miscounts across a DST transition (fixed 86,400,000 ms day comparison)

- **State:** Closed
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
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — calendar-day comparison verified under Europe/London in BOTH DST directions plus six boundary cases)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `2170103`.

**Original observation re-checked — resolved, and it is a root-cause fix, not a widened constant.** `shipshape/engine.js:214-222` compares calendar days by advancing a date and comparing `isoDate` strings — exactly the DST-safe method `currentStreak` already used (`engine.js:203-210`). Driven against the real engine under `TZ=Europe/London`, first confirming the underlying hazard still exists at the `Date` level so the old code would still be wrong:

```
process TZ = Europe/London | resolved = Europe/London
spring noon-to-noon ms = 82800000 (86400000? false)
autumn noon-to-noon ms = 90000000 (86400000? false)
SPRING 28,29,30 Mar -> longestStreak = 3 (expect 3)
AUTUMN 24,25,26 Oct -> longestStreak = 3 (expect 3)   <- the ledger only tested spring
```

**Adversarial boundary cases, all held:** a real gap 28→30 Mar → 1; month-end 30/31 Mar → 1 Apr → 3; leap 2028-02-28/29 → 03-01 → 3; non-leap 2027-02-28 → 03-01 → 2; year boundary 2026-12-31 → 2027-01-01 → 2; and a 400-day continuous run → 400, with no hidden split anywhere in a full year. Regression coverage `shipshape/tests/streak-dst.test.mjs` passes and is wired into the root `test` script.

**Pre-existing characteristic noted, not a regression of this fix:** `isoDate` formats in a hardcoded `Europe/London` (`engine.js:4`) while `new Date('…T12:00:00')` parses in the *viewer's* local zone, so a user at UTC+14 would see streaks break. `currentStreak` has the identical property, so this is a whole-module characteristic rather than something this fix introduced.

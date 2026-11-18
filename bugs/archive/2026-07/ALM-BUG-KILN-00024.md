# ALM-BUG-KILN-00024 — Masthead date mixes the local weekday with the UTC calendar date -- wrong for an hour a day in BST

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** news
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — 0 weekday/date mismatches across the whole BST midnight straddle)

## Observation
The news masthead can show a weekday that disagrees with its own date near midnight in a timezone offset from UTC.

## Notes
Confirmed: dayStr takes the weekday from `now.getDay()` (local clock) and concatenates fmtDate(now.toISOString()), where fmtDate slices the calendar date out of the UTC string (news.js:125-130, 163-165). Two clocks, one dateline. Reproduced: TZ=Europe/London at 2026-07-13T23:30 local prints the Monday weekday against Tuesday's UTC date (or vice versa) for the offset window each night (one hour under BST).

Fix: derive both the weekday and the date from the same clock -- use the local getFullYear/getMonth/getDate for the printed date, or format both from the UTC values. Trivial.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
The masthead now derives both the weekday and the printed date from the same (local)
clock: it builds a `YYYY-MM-DD` string from `now.getFullYear/getMonth/getDate` and feeds
that to `fmtDate`, instead of pairing `now.getDay()` (local) with `fmtDate(now.toISOString())`
(UTC). The weekday and dateline can no longer disagree in the sub-UTC hour each night.
Regression: news/tests/validate-static.mjs drives header() with a faked clock where local
is a day ahead of UTC and asserts the printed weekday matches the printed date.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `e5bd068`.

**Original observation re-checked — resolved.** `news/news.js:254-261` builds a local `YYYY-MM-DD` from `now.getFullYear()/getMonth()/getDate()` and feeds *that* to `fmtDate`, so the weekday and the date now come from one clock. Driving the real `header()` across the BST midnight straddle (UTC 21:00→02:00 in 15-minute steps, local = UTC+1):

```
local 2026-07-13 22:00 BST (UTC 21:00) -> "Monday, 13 Jul 2026"   agree=true
local 2026-07-13 23:00 BST (UTC 22:00) -> "Monday, 13 Jul 2026"   agree=true
local 2026-07-14 00:00 BST (UTC 23:00) -> "Tuesday, 14 Jul 2026"  agree=true
local 2026-07-14 01:00 BST (UTC 00:00) -> "Tuesday, 14 Jul 2026"  agree=true
mismatches over 21 samples spanning the midnight straddle: 0
```

The same probe against the pre-fix renderer at local Tue 14 Jul 00:00 BST prints **`Tuesday, 13 Jul 2026`** — and 13 Jul 2026 is a Monday — so the oracle discriminates. This is a root-cause fix rather than a window patch: both values derive from one `Date` instance, so no straddle can split them. Regression coverage `news/tests/validate-static.mjs:288-307` passes.

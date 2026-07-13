# ALM-BUG-KILN-00024 — Masthead date mixes the local weekday with the UTC calendar date -- wrong for an hour a day in BST

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

## Observation
The news masthead can show a weekday that disagrees with its own date near midnight in a timezone offset from UTC.

## Notes
Confirmed: dayStr takes the weekday from `now.getDay()` (local clock) and concatenates fmtDate(now.toISOString()), where fmtDate slices the calendar date out of the UTC string (news.js:125-130, 163-165). Two clocks, one dateline. Reproduced: TZ=Europe/London at 2026-07-13T23:30 local prints the Monday weekday against Tuesday's UTC date (or vice versa) for the offset window each night (one hour under BST).

Fix: derive both the weekday and the date from the same clock -- use the local getFullYear/getMonth/getDate for the printed date, or format both from the UTC values. Trivial.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

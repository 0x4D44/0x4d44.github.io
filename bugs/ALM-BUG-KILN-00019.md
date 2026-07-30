# ALM-BUG-KILN-00019 — Any data-file load failure blanks the whole news page -- no guards on seq[0..8] or pickAds()[0]

- **State:** Fixed
- **Priority:** Should
- **Severity:** Medium
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
If articles.js or ads.js fails to load (network hiccup, blocked script, a syntax error in a future data edit), every news page renders completely blank instead of degrading.

## Notes
Confirmed by 3-skeptic panel: news.js:14-15 coerces a failed load to `[]`. renderHome then indexes `seq[0]`..`seq[8]` unguarded (news.js:327, 332-338) and `pickAds()[0]` (news.js:245/327), and adHtml (news.js:247, `var fx = ad.fx || []`) / heroHtml(seq[0]) -> articleUrl (news.js:279, `a.id`) throw on `undefined`. The throw aborts the whole `mount.innerHTML = out.join("")`, so #app (which starts with only a `<noscript>`) stays empty -- a blank page, no error visible to the reader. The very next loop bounds-checks, so the unguarded head indexing is inconsistent with the code around it.

Fix: guard the head-of-sequence reads (early-return a friendly "nothing to show" if `!ARTICLES.length`), and make adHtml tolerate an empty ad list (`if (!ad) return "";`). Same-origin robustness matters because every almanac doc shares the origin.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
`renderHome` now early-returns a friendly "Nothing to show" notice (still wrapped in the
header/footer) when the rotated sequence is empty, instead of indexing seq[0..8] and
`pickAds()[0]` unguarded and throwing — which aborted `mount.innerHTML = ...` and left #app
blank. `adHtml` also returns "" for a missing ad, tolerating an empty/failed ads.js.
Regression: news/tests/validate-static.mjs renders a fresh news.js against an empty
NEWS_ARTICLES/NEWS_ADS and asserts no throw plus the notice.

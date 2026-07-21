# ALM-BUG-KILN-00021 — Search highlighting regex-replaces over already-escaped HTML, corrupting its own <mark> tags and HTML entities

- **State:** Fixed
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
Search-result highlighting mangles the result text: a query that overlaps a previously-inserted <mark>, or that matches an HTML entity name (amp, quot, lt, gt), corrupts the rendered DOM.

## Notes
Confirmed: highlight() first `esc()`s the text (news.js:527, turning & -> &amp; etc.), then loops the query terms building a case-insensitive regex per term and running `out = out.replace(re, "<mark>...")` over the already-escaped string (news.js:528-531). Reproduced: q="a mar" against "a market" yields nested/broken `<<mark>mar</mark>k>...`; q="amp" turns "Fish & Chips" into `Fish &<mark>amp</mark>; Chips`. The highlighter rewrites the very markup and entities esc() produced.

Fix: highlight on the raw text BEFORE escaping, or tokenize and escape each span separately, so the replace never runs over inserted tags or entity sequences. Low severity (reflected from the user's own query, cosmetic on a static site) but a real DOM-corruption path.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
`highlight()` now matches on the RAW text with a single combined term-alternation regex,
escaping each non-match and match span separately and wrapping matches in `<mark>` — instead
of escaping first and then running per-term replaces over the escaped string. So a query like
"amp" no longer tears open the `&amp;` entity, and "a mar" no longer re-matches "mar" inside
an inserted `<mark>` tag. Regression: news/tests/validate-static.mjs renders search results for
those queries against crafted articles and asserts the entity and mark tags stay well-formed.

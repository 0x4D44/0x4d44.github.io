# ALM-BUG-KILN-00020 — Malformed percent-encoding in the query string throws an uncaught URIError and blanks the page

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
Visiting a news URL whose ?id= or ?q= contains a stray percent sign (e.g. `article.html?id=%`, `search.html?q=100%`) throws and renders a blank page instead of "Story not found" / empty results.

## Notes
Confirmed: the query-param reader does `decodeURIComponent(m[1].replace(/\+/g," "))` with no guard (news.js:158). A lone `%` or a truncated escape (`%E0%A4%A`) makes decodeURIComponent throw URIError; nothing catches it, so the mount never runs and #app stays empty. Reproduced by running the exact function: `?id=%`, `?q=100%`, `?id=%E0%A4%A` all raise "URI malformed".

Fix: wrap the decode in try/catch and return "" on failure, e.g. `try { return decodeURIComponent(...); } catch (e) { return ""; }`. Trivial, and turns a blank page into the intended graceful path.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
`qs()` now wraps the `decodeURIComponent` in try/catch and returns "" on a URIError, so a
stray or truncated percent-escape (`?id=%`, `?q=100%`, `?id=%E0%A4%A`) yields the intended
"Story not found" / empty-results path instead of an uncaught throw that blanks #app.
Regression: news/tests/validate-static.mjs renders article + search for those inputs and
asserts no throw.

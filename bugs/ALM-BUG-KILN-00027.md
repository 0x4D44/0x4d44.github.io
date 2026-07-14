# ALM-BUG-KILN-00027 — renderSearch/renderAbout dereference article fields with no guard -- one malformed appended article blanks the whole page

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
If a single article object in articles.js is appended without a category / headline / standfirst (or with a non-string one), the category-browse, search, and About pages throw and render completely blank, instead of that one story being skipped.

Repro: append `{ id:"x", body:["..."] }` (no category/headline/standfirst) to news/articles.js and open http://localhost:8000/news/search.html?cat=Science (or ?q=anything). Expected: the malformed story is skipped. Actual: `a.category.toLowerCase()` (news.js:499) / `a.headline.toLowerCase()` (511) / `a.standfirst.toLowerCase()` (512) throw TypeError, the mount never runs, and #app stays blank.

## Notes
The current 355-article corpus is clean (verified: no article missing id/category/headline/standfirst, no empty body, no unknown category, no duplicate id), so this is a LATENT robustness + test-coverage gap, not a live defect. But it is a real one: rendering everywhere else uses the null-safe `esc()` (news.js:92-96, `String(s == null ? "" : s)`), while the search scorer/haystack (news.js:499, 507-508, 511-512) and the raw sort key call the field methods directly. And the About page advertises exactly the workflow that triggers it: "a contributor appends one object to articles.js and it appears... automatically. There is no editorial oversight because there is no editor." One fat-fingered append silently blanks three page types.

Fix: (1) guard the raw field access — coerce with `String(a.category || "")` / `(a.headline || "")` before `.toLowerCase()`, matching esc()'s null-tolerance; and/or filter out shape-invalid articles once at load (`ARTICLES = (window.NEWS_ARTICLES||[]).filter(a => a && a.id && a.category && a.headline)`). (2) Add a cheap corpus-shape oracle (a node test over articles.js asserting every entry has id/category∈known-set/headline/standfirst/non-empty body, and unique ids) wired into the repo-root package.json test script, so a bad append fails `npm test` rather than the live page. Found in the deliberate news/ review pass.

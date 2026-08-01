# ALM-BUG-KILN-00027 — renderSearch/renderAbout dereference article fields with no guard -- one malformed appended article blanks the whole page

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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — all six recorded malformed shapes now drop at load; a non-array body/tags residual split to ALM-BUG-KILN-00047)

## Observation
If a single article object in articles.js is appended without a category / headline / standfirst (or with a non-string one), the category-browse, search, and About pages throw and render completely blank, instead of that one story being skipped.

Repro: append `{ id:"x", body:["..."] }` (no category/headline/standfirst) to news/articles.js and open http://localhost:8000/news/search.html?cat=Science (or ?q=anything). Expected: the malformed story is skipped. Actual: `a.category.toLowerCase()` (news.js:499) / `a.headline.toLowerCase()` (511) / `a.standfirst.toLowerCase()` (512) throw TypeError, the mount never runs, and #app stays blank.

## Notes
The current 355-article corpus is clean (verified: no article missing id/category/headline/standfirst, no empty body, no unknown category, no duplicate id), so this is a LATENT robustness + test-coverage gap, not a live defect. But it is a real one: rendering everywhere else uses the null-safe `esc()` (news.js:92-96, `String(s == null ? "" : s)`), while the search scorer/haystack (news.js:499, 507-508, 511-512) and the raw sort key call the field methods directly. And the About page advertises exactly the workflow that triggers it: "a contributor appends one object to articles.js and it appears... automatically. There is no editorial oversight because there is no editor." One fat-fingered append silently blanks three page types.

Fix: (1) guard the raw field access — coerce with `String(a.category || "")` / `(a.headline || "")` before `.toLowerCase()`, matching esc()'s null-tolerance; and/or filter out shape-invalid articles once at load (`ARTICLES = (window.NEWS_ARTICLES||[]).filter(a => a && a.id && a.category && a.headline)`). (2) Add a cheap corpus-shape oracle (a node test over articles.js asserting every entry has id/category∈known-set/headline/standfirst/non-empty body, and unique ids) wired into the repo-root package.json test script, so a bad append fails `npm test` rather than the live page. Found in the deliberate news/ review pass.

## Fix (2026-07-21)
`ARTICLES` is now filtered at load to entries that have string `id`/`category`/`headline`/
`standfirst`, so a fat-fingered append (the exact workflow the About page invites) is
skipped once at the trust boundary instead of throwing in the search scorer / sort key and
blanking the category-browse, search, and About pages. Regression: news/tests/validate-static.mjs
adds a corpus-shape oracle (every shipped article is well-formed) and a behavioral check that
a malformed appended article is dropped at load while search/about still render.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `36abbf6`.

**Original observation re-checked — resolved for every shape the observation names.** `news/news.js:19-22` filters `ARTICLES` at load to entries with string `id`/`category`/`headline`/`standfirst`. Appending each hostile object to the live corpus and rendering four page types:

```
[missing category/headline/standfirst] droppedAtLoad=true  search / cat / about / home / article: all ok
[null category]     droppedAtLoad=true  all ok
[numeric headline]  droppedAtLoad=true  all ok
[missing id]        droppedAtLoad=true  all ok
[null entry]        droppedAtLoad=true  all ok
[empty object]      droppedAtLoad=true  all ok
```

The pre-fix renderer on the same probes throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` and `TypeError: a.headline.toLowerCase is not a function`, so the check discriminates. Regression coverage `news/tests/validate-static.mjs:321-343` is a corpus-shape oracle over all 1104 shipped articles (it does assert `Array.isArray(a.body)`, so a bad body in the repo fails the gate) plus a behavioural drop-at-load check; wired into both `npm test` and `npm run build`. Passes.

**Residual split to ALM-BUG-KILN-00047.** The load filter validates only the four string fields, so an appended article whose `body` or `tags` is a string rather than an array survives and still blanks the search page:

```
[body as a string] droppedAtLoad=false
    renderSearch?q=anything: THREW TypeError: (a.body || []).join is not a function   (news.js:837)
    renderArticle?id=x4:     THREW TypeError: (a.body || []).some is not a function
[tags as a string] droppedAtLoad=false
    renderSearch?q=anything: THREW TypeError: (a.tags || []).join is not a function   (news.js:837)
```

The static oracle covers the committed corpus, so this bites only a runtime append — which is exactly the workflow the About page advertises. Real but narrow.

# ALM-BUG-KILN-00047 — News home and search still blank on a 1-8 article corpus and on non-array body/tags

- **State:** Fixed
- **Priority:** Should
- **Severity:** Low
- **Area:** news
- **Raised:** 2026-07-30
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T233047Z-p18484-n378881000-c1 branch=task/bug-ALM-BUG-KILN-00047-run-fix-20260730T233047Z-p18484-n378881000-c1 code=c06d6ab gate=manual)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00019** and **ALM-BUG-KILN-00027** (2026-07-30). Both of those fixes resolve their recorded observations; each leaves a narrow same-symptom gap that the other's fix can now feed.

**1. A corpus of 1-8 valid articles still blanks the home page.** `news/news.js:592-600` guards only the fully-empty case (`!seq.length`); `seq[1..8]` remain unguarded. Sweeping corpus sizes 0-12 through the real `renderHome`:

```
corpus= 0 -> ok (7793 chars, mount populated)
corpus= 1 -> THREW TypeError: Cannot read properties of undefined (reading 'id')
             @ articleUrl (news.js:233:77) | mount left BLANK
corpus= 2..8 -> same THROW, mount left BLANK
corpus= 9 -> ok (19512 chars, mount populated)
```

The comment at `news.js:589-591` claims the guard prevents "throwing on the unguarded seq[0..8]", which it does not.

**2. A non-array `body` or `tags` survives the load filter and blanks the search page.** `news/news.js:19-22` validates only the four string fields (`id`, `category`, `headline`, `standfirst`):

```
[body as a string (not array)] droppedAtLoad=false
    renderSearch?q=anything: THREW TypeError: (a.body || []).join is not a function   (news.js:837)
    renderArticle?id=x4:     THREW TypeError: (a.body || []).some is not a function
[tags as a string]             droppedAtLoad=false
    renderSearch?q=anything: THREW TypeError: (a.tags || []).join is not a function   (news.js:837)
```

**These two interact.** The KILN-00027 fix now *filters* articles at load, so a badly-corrupted `articles.js` can be reduced to a handful of survivors — and the KILN-00019 guard then does not catch a 1-8 article result. That is the realistic route to reproducing this in the wild.

**Expected:** any corpus size, and any malformed article shape, degrades to a rendered page rather than a blank `#app`.

## Fix

<unfixed — raised only>

## Notes

Both are small:
- widen the existing guard to `if (seq.length < 9)` (or bounds-check the `seq[0..8]` head reads) at `news/news.js:592`;
- add `Array.isArray(a.body) && Array.isArray(a.tags)` to the load filter at `news/news.js:19-22`.

Severity is Low because the committed corpus is 1104 articles and the static oracle at `news/tests/validate-static.mjs:321-343` already asserts `Array.isArray(a.body)` over everything in the repo — so this bites a *runtime* append, which is the workflow the About page advertises, rather than the shipped site. Regression coverage should extend the existing empty-corpus test to sizes 1-8.

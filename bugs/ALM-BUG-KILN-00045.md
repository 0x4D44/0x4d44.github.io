# ALM-BUG-KILN-00045 — Tidecall KILN-00028 focus guard uses an LF-only regex, so npm test and npm run build fail on every Windows checkout

- **State:** Closed
- **Priority:** Must
- **Severity:** High
- **Area:** tests
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T230957Z-p71804-n342386000-c1 branch=task/bug-ALM-BUG-KILN-00045-run-fix-20260730T230957Z-p71804-n342386000-c1 code=f2dd9d653a73ea23bfbd2b5d38b35cfc040942d2 gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit f2dd9d6 verified by reproducing the CRLF condition on a converted checkout — pre-fix exit 1 with the recorded AssertionError, post-fix exit 0)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00028** (2026-07-30). The shipped focus fix in `tidecall/app.js` is correct; **its regression guard fails on every Windows checkout and takes the whole gate down with it.**

```
$ node tidecall/validate-static.test.js ; echo REAL_EXIT=$?
✗ a modal moves focus to its first VISIBLE control, not a hidden one (KILN-00028)
AssertionError [ERR_ASSERTION]: openModal function should be found
    at .../tidecall/validate-static.test.js:136:10
REAL_EXIT=1

$ npm run build   ->   exit 1   (dies at this same assertion)
$ npm test        ->   exit 1   (same; the segments after tidecall never run)
```

The extractor at `tidecall/validate-static.test.js:135` is

```js
const openModal = app.match(/function openModal[\s\S]*?\n  \}\n/);
```

which requires `}` to be immediately followed by LF. With the fleet-default `core.autocrlf=true`, `tidecall/app.js` is checked out as pure CRLF, so the match never succeeds:

```
working tree: CRLF lines 1169, bare LF 0   ->  LF-only regex matches: false
committed blob: CRLF 0, LF 1169            ->  LF-only regex matches: true
CRLF-tolerant variant /...\r?\n  \}\r?\n/ ->  matches: true
```

That is why the fixer saw it green — it passes under WSL/Linux. Normalising line endings makes both assertions pass, which also confirms the guard's *inner* behavioural assertion is genuinely satisfied by the shipped code:

```
AS CHECKED OUT (CRLF):       regex MATCH=false -> assert.ok fails
LINE-ENDING NORMALISED (LF): regex MATCH=true, inner rAF+offsetParent+.focus assertion = true
```

**Expected:** `node tidecall/validate-static.test.js` passes on a stock Windows checkout, so `npm test` and `npm run build` are green.

## Fix

<unfixed — raised only>

## Notes

Minimal fix: make the extractor line-ending agnostic — `/function openModal[\s\S]*?\r?\n {2}\}\r?\n/` — or normalise once in `read()` at `tidecall/validate-static.test.js:9` with `.replace(/\r\n/g,'\n')`. Normalising in `read()` is preferable: it inoculates all seven remaining source-regex guards in that file at once.

A durable alternative is adding `*.js text eol=lf` to the root `.gitattributes`, which would make every checkout LF and remove the whole class. That is a wider change and should be a deliberate decision rather than a side effect of this fix.

A repo-wide sweep during the verification found this is the **only** affected extractor: `onu/tests/validate-static.mjs:191` (`\n\}`) and `tidecall/celebrate.test.js:15` (`\n {2}\}`) both survive CRLF because their terminators place the newline before the brace. See also ALM-BUG-KILN-00046 — this is a live instance of the guard-quality problem ALM-BUG-KILN-00029 described.

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `f2dd9d6`). **The recorded symptom no longer reproduces.**

**The Windows condition was reproduced, not assumed.** The verifier ran on macOS, so a stock
Windows checkout was simulated by CRLF-converting a copy of the tree. That copy matches the line
counts this bug recorded exactly:

```
tidecall/app.js in the simulated checkout: CRLF lines 1169, bare LF 0     (the bug records 1169 / 0)
```

**Against that CRLF checkout, with the fix:**

```
$ node tidecall/validate-static.test.js
✓ a modal moves focus to its first VISIBLE control, not a hidden one (KILN-00028)
All Tidecall static checks passed.                                        exit 0
```

**Proven to bite (fails-before / passes-after).** Reverting just the fix hunk — `read()` back to a
raw `readFileSync` without `normaliseSource` — on that same CRLF checkout reproduces the recorded
failure verbatim:

```
✗ a modal moves focus to its first VISIBLE control, not a hidden one (KILN-00028)
AssertionError [ERR_ASSERTION]: openModal function should be found         exit 1
```

**The fix is the one this bug recommended, at the better layer.** It normalises once in `read()`
(`tidecall/validate-static.test.js:9`) rather than patching the single regex, so all the
source-pattern guards in that file are inoculated at once — the bug's own stated preference. It
also adds a direct unit assertion that `normaliseSource` collapses CRLF. The wider
`*.js text eol=lf` option the bug flagged as "a deliberate decision rather than a side effect"
was correctly **not** taken.

**Gates:** root `npm test` and `npm run build` both exit 0 on this tree.

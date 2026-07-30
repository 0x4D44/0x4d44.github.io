# ALM-BUG-KILN-00019 — Any data-file load failure blanks the whole news page -- no guards on seq[0..8] or pickAds()[0]

- **State:** Closed
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
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — the recorded load-failure symptom degrades gracefully; a narrow short-corpus residual split to ALM-BUG-KILN-00047)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `9a86ec0`.

**Original observation re-checked — resolved.** `news/news.js:592-600` early-returns a "Nothing to show" page when `!seq.length`, and `adHtml` guards its input at `news.js:510` (`if (!ad) return "";`). Driving the real `renderHome` with the recorded failure modes:

```
[articles=[] ads=[]]               renderHome -> ok 7793ch [Nothing to show]
[articles=undefined ads=undefined] renderHome -> ok 7793ch [Nothing to show]
[articles=live ads=[]]             renderHome -> ok 26476ch  (adHtml guard holds)
```

A data-file load failure yields `[]`, which is exactly the recorded trigger, and it now degrades instead of blanking.

**Residual split to ALM-BUG-KILN-00047.** `seq[1..8]` remain unguarded, so a corpus of 1–8 valid articles still reproduces the blank-page symptom:

```
corpus= 0 -> ok (7793 chars, mount populated)
corpus= 1..8 -> THREW TypeError: Cannot read properties of undefined (reading 'id')
                @ articleUrl (news.js:233:77) | mount left BLANK
corpus= 9 -> ok (19512 chars, mount populated)
```

The fix's own comment at `news.js:589-591` claims it prevents "throwing on the unguarded seq[0..8]", which it does not. Reachability is low but non-zero — the KILN-00027 fix now *filters* articles at load, so a badly-corrupted corpus can be reduced to a handful and the two guards then interact. Closed rather than reopened because the recorded **Observation** names a load failure (which yields `[]`), and that case is verified fixed; the short-corpus trigger is a different input reaching the same symptom, and the bug's *title* naming `seq[0..8]` is why it is being tracked rather than dropped. Regression coverage `news/tests/validate-static.mjs:309-319` passes but tests only the fully-empty corpus.

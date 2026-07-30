# ALM-BUG-KILN-00018 — based-on-truth articles still carry the "this story never happened" satire notice, contradicting the About page

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
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — all 169 based-on-truth articles rendered; 0 assert total fiction)

## Observation
The 100 articles tagged `based-on-truth` retell real events (Tacoma Narrows collapse, Gerald Ratner's 1991 speech, the Emu War, the Boston Molasses Flood). On each of their article pages the site prints a satire notice saying the opposite of what the About page now says.

Repro over http://localhost:8000/news/: open any based-on-truth story. Expected: a notice acknowledging the underlying event is real. Actual: renderArticle prints "The Daily Flange is fiction. This story never happened, the people quoted do not exist" (news.js:459-460), plus a footer "Any resemblance to real events, persons ... is coincidental. Nothing here is true." (news.js:229-232) -- while the About page (same commit) says "A run of stories tagged based-on-truth retells things humans genuinely, bewilderingly did; the underlying events are real."

## Notes
Confirmed by 3-skeptic panel + data load: 100 of 255 articles carry the tag; renderArticle has `a.tags` in scope (builds tag chips at news.js:430) but never branches on it, so the notice and footer are emitted unconditionally. The commit that added the honest About copy updated only that one paragraph; the two point-of-consumption disclaimers were left asserting total fiction. Net effect: the article page a reader actually lands on tells them the Tacoma Narrows collapse "never happened" and that Gerald Ratner (a real, living person) "does not exist".

Fix: branch the notice on the tag the data already carries -- `var basedOnTruth = (a.tags||[]).indexOf('based-on-truth') !== -1;` -- and emit a truthful variant (event real, correspondents/quotes invented) at news.js:459; give footerHtml the same conditional exception. The figcaption "entirely made up" at news.js:456 needs the same treatment.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
`renderArticle` now derives `basedOnTruth = (a.tags||[]).indexOf('based-on-truth') !== -1`
and branches all three point-of-consumption disclaimers on it: the default notice becomes
"Based on a true story: the underlying event really happened…" (instead of "never
happened"), the default hero figcaption drops "entirely made up" for "…of real events;
illustration invented", and `footerHtml(basedOnTruth)` swaps the "Nothing here is true"
legal line for one that says the underlying event is real while the reporting/quotes are
invented. Articles with their own `notice`/`imageCaption` keep them; pure-satire stories are
unchanged. Regression: news/tests/validate-static.mjs renders a based-on-truth article
(asserts no "never happened"/"Nothing here is true", presence of the truthful line) and a
control satire article (asserts the fiction disclaimers remain).

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `0db33f4`.

**Original observation re-checked — resolved, exhaustively.** `news/news.js:750` derives `basedOnTruth` from the article's own tag and branches the hero figcaption (`:753`), the notice (`:755-761`) and the footer via `footerHtml(basedOnTruth)` (`:801`, definition `:462`, branch `:487-495`). Rendering **every** tagged article through the real `renderArticle` — not a sample:

```
based-on-truth articles rendered: 169
  footer/notice asserting total fiction: 0
  containing "underlying event really happened": 169
-- control: 5 pure-satire articles --
  all 5: neverHappened=true nothingTrue=true
```

The 55 tagged articles that carry a *custom* `notice` (which bypasses the new branch) were checked separately: 0 still assert total fiction, and 0 have an "entirely made up" image caption.

**This is a root-cause fix.** It branches on the data's own tag, so the corpus growing from the recorded 100 tagged articles to 169 was absorbed automatically. The oracle discriminates: the same check against the pre-fix renderer (`f992e42^`) over the *current* corpus reports 114 of 114 untagged-notice articles still rendering "never happened". Regression coverage `news/tests/validate-static.mjs:400-421` passes.

# ALM-BUG-KILN-00018 — based-on-truth articles still carry the "this story never happened" satire notice, contradicting the About page

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

## Observation
The 100 articles tagged `based-on-truth` retell real events (Tacoma Narrows collapse, Gerald Ratner's 1991 speech, the Emu War, the Boston Molasses Flood). On each of their article pages the site prints a satire notice saying the opposite of what the About page now says.

Repro over http://localhost:8000/news/: open any based-on-truth story. Expected: a notice acknowledging the underlying event is real. Actual: renderArticle prints "The Daily Flange is fiction. This story never happened, the people quoted do not exist" (news.js:459-460), plus a footer "Any resemblance to real events, persons ... is coincidental. Nothing here is true." (news.js:229-232) -- while the About page (same commit) says "A run of stories tagged based-on-truth retells things humans genuinely, bewilderingly did; the underlying events are real."

## Notes
Confirmed by 3-skeptic panel + data load: 100 of 255 articles carry the tag; renderArticle has `a.tags` in scope (builds tag chips at news.js:430) but never branches on it, so the notice and footer are emitted unconditionally. The commit that added the honest About copy updated only that one paragraph; the two point-of-consumption disclaimers were left asserting total fiction. Net effect: the article page a reader actually lands on tells them the Tacoma Narrows collapse "never happened" and that Gerald Ratner (a real, living person) "does not exist".

Fix: branch the notice on the tag the data already carries -- `var basedOnTruth = (a.tags||[]).indexOf('based-on-truth') !== -1;` -- and emit a truthful variant (event real, correspondents/quotes invented) at news.js:459; give footerHtml the same conditional exception. The figcaption "entirely made up" at news.js:456 needs the same treatment.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

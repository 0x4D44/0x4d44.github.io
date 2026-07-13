# ALM-BUG-KILN-00023 — Seven articles quote their own byline correspondent as the independent expert source

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
In seven of the new articles the bylined correspondent is also quoted in the body as the independent expert -- the reporter interviews themselves.

## Notes
Confirmed by corpus read: e.g. biz-gerald-ratner-total-crap-speech-1991 has byline "By Delia Cornish, Retail Correspondent" (articles.js:3893) and body "said retail analyst Delia Cornish" (3900), quoted again as "Cornish" (3903-3904) and in the pull-quote (3906). Same shape in biz-leonard-pepsi-harrier-jet-lawsuit, hea-radithor-radium-tonic-eben-byers, hea-tobacco-smoke-enema-resuscitation, sci-mars-climate-orbiter-metric-mixup-1999, sci-piltdown-man-hoax-1912, wea-great-smog-of-london-1952. Breaks the fiction's own realism (a reporter does not source-quote themselves).

Fix (content): give the expert quote a distinct invented name in each of the seven, or reframe the correspondent's line as reporting rather than a quoted source.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

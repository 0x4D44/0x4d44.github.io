# ALM-BUG-KILN-00022 — "a fictitious oceanographer at the University of Aberdeen" -- LLM-guardrail phrasing leaked into 20 shipped articles

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
20 of the based-on-truth article bodies contain visible model-guardrail phrasing -- the literal words "a fictitious ..." naming an invented expert -- which reads as a generation artifact, not editorial voice.

## Notes
Confirmed by corpus load: exactly 20 article bodies contain the literal string "a fictitious" (articles.js:5211, 5236, 5261, 5289, 5311, 5336, 5361, 5386, 5411, 5436, 5461, 5486, 5511, 5536, 5561, 5586, 5611, 5636, 5661, 5686 -- line numbers drift a few lines by build). The phrasing is the kind an LLM inserts to disclaim an invented attribution; on a satire paper it breaks the voice and telegraphs the pipeline.

Fix (content): sweep the 20 bodies and rewrite "a fictitious <role>" into in-world phrasing (or drop the hedge). A cheap corpus lint (grep the article bodies for "fictitious"/"as an AI"/"I cannot") would keep future drops clean.

Provenance: surfaced by the deep-review workflow during the darmok review pass (the workflow fell back to reviewing the most recent commit -- the 100-article news drop -- when the fresh worktree had an empty diff). Adversarially verified (confirmed, not refuted). news/ has NOT been formally logged as reviewed in the coverage ledger, so it still needs its own deliberate pass; these are the confirmed defects that pass would otherwise re-derive.

## Fix (2026-07-21)
Swept all 21 "a fictitious <role>" occurrences out of the article bodies, rewriting them
into plain editorial voice (`<Name>, an oceanographer at …`) with correct a/an agreement,
so the invented-expert attribution no longer telegraphs the generation pipeline. Recurrence
guard: news/tests/validate-static.mjs now lints every body paragraph for LLM-guardrail
phrasing (`a fictitious`, `as an AI`, `as a language model`, refusal preambles) and fails on
a match — the narrow pattern avoids legitimate in-world prose like "subscriptions I cannot
name".

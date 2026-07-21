# ALM-BUG-FLUXHOMEARPA-00003 — Nihon Quest roleplay safe answers disappear after content overlay

- **State:** Fixed
- **Priority:** Must
- **Severity:** High
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
The shipped DC app applies `content-extra.js` in `japanese-travel-rpg/index.html:516` and replaces each overlaid phrase with a new ID at `japanese-travel-rpg/index.html:517`. Roleplay steps were already built in `japanese-travel-rpg/content.js:29` from the original generated phrase IDs. Later, roleplay feedback and safe-answer rendering look up `expectedPhraseIds` in the overlaid phrase map at `japanese-travel-rpg/engines.js:27` and `japanese-travel-rpg/index.html:910`, filtering out every missing result.

Expected: roleplay feedback should show the safe phrase suggestions for each step after authored content is overlaid.

Actual: the expected phrase IDs no longer exist after overlay, so safe-answer lists and feedback suggestions are empty.

## Notes
Static verification applied the same overlay as `index.html` and found every roleplay `expectedPhraseIds` entry missing. Concrete fix: preserve explicit stable phrase IDs through the overlay, or rebuild each chapter's roleplay steps after applying authored phrases. Add a self-check that imports the shipped content graph and asserts all roleplay expected phrase IDs resolve.

## Fix (2026-07-21)
The shipped overlay in `index.html` (componentDidMount) already re-points every
roleplay step to its overlaid phrase id — after remapping `ch.phrases` to the new
`<chapter>-p<i>` ids it runs
`ch.roleplay.steps.forEach((st,i)=>{ ... st.expectedPhraseIds=[np.id]; ... })`. So the
recorded observation no longer reproduces: reproducing the exact index.html overlay and
resolving each `expectedPhraseId` yields **0 of 48 missing**, and both safe-answer
lookup sites (scriptedFeedback + index.html rpSafe) use that same overlaid `pLookup`.

What was still missing — and what this bug's Notes explicitly asked for — was the
regression guard, since the self-check only ever tested the *pre-overlay* graph. Added
to `tests/self-check.mjs`: it (a) asserts `index.html` still carries the step re-point
(`st.expectedPhraseIds=[np.id]`), and (b) applies the same overlay on a fresh content
module and asserts every roleplay `expectedPhraseId` resolves and `scriptedFeedback`
still returns suggestions. The guard passes on the current tree and fails if the
re-point is removed (verified by deleting it in a throwaway copy). No product-code
change was needed — the correctness already held; this locks it in for the two-eyes
verify.

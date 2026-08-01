# ALM-BUG-FLUXHOMEARPA-00003 — Nihon Quest roleplay safe answers disappear after content overlay

- **State:** Closed
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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — measured 48/48 missing phrase ids before the re-point, 0/48 after)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix.

**Original observation re-checked — resolved, measured both ways.** The overlay at `index.html:519-524` now re-points each roleplay step to the overlaid phrase id (`st.expectedPhraseIds=[np.id]`, `index.html:522`). Reproducing the overlay in Node with and without that line:

```
repoint=false: expectedPhraseIds total=48 missing=48; uk-home step0 safe-answer suggestions=0
repoint=true:  expectedPhraseIds total=48 missing=0;  uk-home step0 safe-answer suggestions=1
```

The `repoint=false` row reproduces the recorded symptom exactly. History corroborates that the symptom was real: `git log -S'st.expectedPhraseIds=[np.id]'` shows the re-point first appearing in `3402ff2`, with revisions `07132ad`, `16225e2`, `0f7ffec` lacking it. As with 00002, the product fix predates the bug's own commit `81157a1`, which added the guard; the fix note says so. Guard `tests/self-check.mjs:38-61` mutation-tested: removing the re-point fires *"index.html overlay must re-point roleplay steps to the overlaid phrase ids"*.

**Latent path checked.** The re-point skips when `ch.phrases[i]` is undefined. All 16 chapters currently have 3 steps against 5 overlay phrases, so the skip is unreachable today, and the guard's `missing` assertion would fire if a 6th step were ever added.

**Residual noted, not separately tracked.** `self-check.mjs:50-53` re-implements the overlay rather than executing the copy in `index.html`, so the guard can drift from production while still passing; the `st.expectedPhraseIds=[np.id]` source assertion at `:46` is the only thing tying them together. Acceptable given there is no DOM harness for these documents.

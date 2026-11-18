# ALM-BUG-FLU-00009 — sulzer-12lda28 scrolls sideways by 8px at tablet width (768px)

- **State:** Closed
- **Priority:** Should
- **Severity:** Low
- **Area:** sulzer-12lda28
- **Raised:** 2026-11-02T05:16:47Z
- **Discovery source:** Automation
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
- **State history:** Open (2026-11-02T05:16:47Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium) -> Fixed (2026-11-02T05:41:54Z, deltic:auto role=fix run=fix-20261102T051825Z-e2ff7f8c branch=task/bug-ALM-BUG-FLU-00009-run-fix-20261102T051825Z-e2ff7f8c code=fc0c67217bbb90442a500d3c82edd555c7dc73a6 gate=manual) -> Closed (2026-11-03T16:42:01Z, deltic:manual role=verify run=verify-20261103T162923Z-27018fc6 verified_fix_run=fix-20261102T051825Z-e2ff7f8c verdict=close)

## Observation

Observed 2026-11-02 running 'node tests/responsive.test.mjs' on a branch off origin/main 29e4ff8 that touched only data.js, the root index.html and a new bogle-castle/ directory. Output: 'Responsive test: 1 failure(s) across 171 documents / sulzer-12lda28 @ tablet (768px): scrolls sideways by 8px'. Expected: scrollWidth - clientWidth <= 1 at 768x1024. The phone viewport (390px) passed. Cause not investigated.

Evidence fingerprint: `manual:v1:sulzer-12lda28-scrolls-sideways-by-8px-at-tablet-width-768px`


## Fix

<unfixed — raised only>

### Verification summary (2026-11-03T16:42:01Z, deltic:manual run=verify-20261103T162923Z-27018fc6 verified_fix_run=fix-20261102T051825Z-e2ff7f8c verdict=close)

Verifier note: Manual verify: Verified on origin/main 1b97eeda (contains fc0c672 and its successor 5c156984, the border-image band that ships). node tests/responsive.test.mjs -> 'Responsive test: 171 documents, no horizontal overflow ... at 390px and 768px' (exit 0; a first run aborted in the harness with CDP 'Inspected target navigated or closed', no assertion reached; rerun clean). Fails-before: in a throwaway worktree, sulzer-12lda28/style.css replaced with 07f2a8a bytes (only diff: the .block.alt ::before inset calc(50% - 50vw) rule) -> 'Responsive test: 1 failure(s) across 171 documents / sulzer-12lda28 @ tablet (768px): scrolls sideways by 8px' (exit 1; the recorded observation). Restored trunk bytes, git diff empty. Root cause (100vw counts scrollbar gutter) removed: trunk band uses border-image outset, which adds no scrollable overflow.

## Notes

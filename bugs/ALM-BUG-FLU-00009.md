# ALM-BUG-FLU-00009 — sulzer-12lda28 scrolls sideways by 8px at tablet width (768px)

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** sulzer-12lda28
- **Raised:** 2026-11-02T05:16:47Z
- **Discovery source:** Automation
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20261102T051825Z-e2ff7f8c
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-FLU-00009-run-fix-20261102T051825Z-e2ff7f8c
- **Owner base:** 07f2a8ac56c7931fe7a5ccdda73400acb774b13e
- **Owner fingerprint:** -
- **Owner since:** 2026-11-02T05:18:25Z
- **Owner until:** 2026-11-02T09:18:25Z
- **Owner session:** flux/2a9090d7-08f7-48c7-bee8-7b7d1d963ab2 (run fix-20261102T051825Z-e2ff7f8c)
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-11-02T05:16:47Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

Observed 2026-11-02 running 'node tests/responsive.test.mjs' on a branch off origin/main 29e4ff8 that touched only data.js, the root index.html and a new bogle-castle/ directory. Output: 'Responsive test: 1 failure(s) across 171 documents / sulzer-12lda28 @ tablet (768px): scrolls sideways by 8px'. Expected: scrollWidth - clientWidth <= 1 at 768x1024. The phone viewport (390px) passed. Cause not investigated.

Evidence fingerprint: `manual:v1:sulzer-12lda28-scrolls-sideways-by-8px-at-tablet-width-768px`


## Fix

<unfixed — raised only>

## Notes

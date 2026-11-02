# ALM-BUG-FLU-00009 — sulzer-12lda28 scrolls sideways by 8px at tablet width (768px)

- **State:** Fixed
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
- **State history:** Open (2026-11-02T05:16:47Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium) -> Fixed (2026-11-02T05:41:54Z, deltic:auto role=fix run=fix-20261102T051825Z-e2ff7f8c branch=task/bug-ALM-BUG-FLU-00009-run-fix-20261102T051825Z-e2ff7f8c code=fc0c67217bbb90442a500d3c82edd555c7dc73a6 gate=manual)

## Observation

Observed 2026-11-02 running 'node tests/responsive.test.mjs' on a branch off origin/main 29e4ff8 that touched only data.js, the root index.html and a new bogle-castle/ directory. Output: 'Responsive test: 1 failure(s) across 171 documents / sulzer-12lda28 @ tablet (768px): scrolls sideways by 8px'. Expected: scrollWidth - clientWidth <= 1 at 768x1024. The phone viewport (390px) passed. Cause not investigated.

Evidence fingerprint: `manual:v1:sulzer-12lda28-scrolls-sideways-by-8px-at-tablet-width-768px`


## Fix

<unfixed — raised only>

## Notes

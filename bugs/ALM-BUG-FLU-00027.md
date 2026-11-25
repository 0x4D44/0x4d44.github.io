# ALM-BUG-FLU-00027 — KX mutation drivers kx-tower-top, kx-shed-round3, kx-textures-round6 miss their anchors on main

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src
- **Raised:** 2026-11-25T16:55:33Z
- **Discovery source:** Agent
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
- **State history:** Open (2026-11-25T16:55:33Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

Three mutation drivers under kings-cross-src/tools/mutation/ no longer find their anchor text in the source on main (2fce110e), so they cannot run their mutants and prove nothing:
- kx-tower-top.py: anchor for the "black ticks" mutant is gone (tower cap geometry changed in later rounds).
- kx-shed-round3.py: one or more anchors missing.
- kx-textures-round6.py: one or more anchors missing.
Observed while running drivers for the 2026-11-25 front and tower rounds. The tests themselves still pass; only the mutation drivers are stale. Fix: re-anchor each driver on the current source and confirm every mutant is killed.

Evidence fingerprint: `manual:v1:kx-mutation-drivers-kx-tower-top-kx-shed-round3-51ae15a6bd97910b`


## Fix

<unfixed — raised only>

## Notes

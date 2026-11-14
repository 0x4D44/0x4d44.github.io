# ALM-BUG-FLU-00022 — King's Cross: signal posts render near white at night (unlit MeshBasic material ignores night level)

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** -
- **Raised:** 2026-11-14T00:46:21Z
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
- **State history:** Open (2026-11-14T00:46:21Z, raised via `deltic bugs new --land`)

## Observation

**Observed (independent look review of headlamp frames, 2026-11-14; also present on main before that change):** at night, signal posts about 25 m from the camera render near pure white (brightness 177–201 of 255) in the King's Cross platform view, while the surrounding shed and track sit at 8–40.

**Cause (from the reviewer's reading of the code, not re-verified):** the posts use an unlit MeshBasic material (0x999999), which ignores the night lighting level.

**Fix direction:** give the posts a night level (scale by the scene's light level) or switch them to a lit (Lambert) material like the rest of the trackside furniture; check the draw and shader-program counts don't grow; capture day and night before/after.

Evidence fingerprint: `manual:v1:king-s-cross-signal-posts-render-near-white-at--c729add6f02b8a6a`


## Fix

<unfixed — raised only>

## Notes

# ALM-BUG-FLU-00020 — Camera can be moved below the ground at every station (no terrain clamp on the orbit controls)

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** kings-cross-src/web/main
- **Raised:** 2026-11-13T15:10:43Z
- **Discovery source:** Human
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
- **State history:** Open (2026-11-13T15:10:43Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

**Observed (Arthur, 2026-11-13, dev server, ?station=perth; he reports the same at the other stations):** the camera can be moved below the ground. The view shows the town from underneath: building undersides, the track ribbons hanging from above, a flat beige void below the horizon.

**Likely cause (inference from code, not reproduced):** `web/src/main.ts:191-194` sets OrbitControls `maxPolarAngle = 0.495π` and `minDistance = 8`, which only limit the angle about the target and the zoom. Nothing clamps the controls' target or the camera to the terrain height, so panning (or a target on low ground beside high terrain, as at Perth's hills) puts the camera under the ground surface. Generic across stations.

**Fix direction:** after each controls update, clamp the target to the ground height at its x/z (plus a small margin) and the camera to max(terrain height at its x/z, target height) + a clearance (~2 m), using each station's terrain sampler; keep it cheap (one height lookup per frame). Test: a synthetic terrain with a hill, pan/zoom the controls into it, assert the camera never goes below ground + clearance.

Evidence fingerprint: `manual:v1:camera-can-be-moved-below-the-ground-at-every-s-789163cfbc50892f`


## Fix

<unfixed — raised only>

## Notes

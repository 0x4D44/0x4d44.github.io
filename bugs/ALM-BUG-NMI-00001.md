# ALM-BUG-NMI-00001 — plan-to-build: the camera whips 4.9 m from the living room to the kitchen in 0.45 s

- **State:** Open
- **Priority:** Could
- **Severity:** Low
- **Area:** plan-to-build
- **Raised:** 2026-10-29T22:07:15Z
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
- **State history:** Open (2026-10-29T22:07:15Z, raised via `deltic bugs new --land` model=claude-sonnet-5-5)

## Observation

The "Plan to Build" film (`plan-to-build/index.html`) whips its camera 4.9 m across the plan in 0.45 s while the furniture is placed: the hand-off from the living room to the kitchen.

Measured with a camera probe (the film's own camera at a given time; S = 117.93 s, the 2D-to-3D swap), on the live page (commit f7ee3dc):

| film time (t - S) | target x (m) | target z (m) | azimuth | visible height H |
|---|---|---|---|---|
| 55.63 s | 4.48 | -1.93 | 352.0 deg | 10.5 m |
| 55.87 s | 7.15 | -2.59 | 360.7 deg | 10.49 m |
| 56.08 s | 9.42 | -3.24 | 369.9 deg | 10.5 m |

That is 4.94 m of travel and 18 degrees of turn in 0.45 s (about 11 m/s) at a 10.5 m view. The same move sits at t - S = 64.63 to 65.08 s on the branch task/20261029-TSK-HUM-plan-to-build-wall-flicker-interior-pain, where the paint stage pushed the film 9 s later (identical numbers).

Cause: in `film3D()` (the camera keys at the end of the 3D film) the living-room key is `key((rt.LIVING[1] - S) - 0.6, ...)` and the kitchen key is `key((rt.KITCHEN[0] - S) + 0.5, ...)`. The kitchen's furnishing window starts about when the living room's ends, so the two keys fall 0.45 s apart and the Hermite spline crosses the whole apartment between them.

Found by an independent code review of the branch above; not caused by it, and not changed there (out of scope for the flicker, rug and paint fixes).

Repro: serve the site, open `/plan-to-build/`, read the camera at those times (or play the film and watch the furniture phase, about 3 min in).

Fix idea: key the kitchen view later, or the living-room one earlier, so the move takes at least 1.5 to 2 s; then probe every 0.5 s window of the furniture phase and check that the target never moves more than about 2 m.

Evidence fingerprint: `manual:v1:plan-to-build-the-camera-whips-4-9-m-from-the-l-20ca21749b785680`


## Fix

<unfixed — raised only>

## Notes

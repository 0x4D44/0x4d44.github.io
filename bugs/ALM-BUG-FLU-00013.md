# ALM-BUG-FLU-00013 — glasgow-subway test_sim: man_kilt_casual thigh 0.153 m over the 0.14 cap (buttock skin on thigh)

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** glasgow-subway/people
- **Raised:** 2026-11-07T19:47:03Z
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
- **State history:** Open (2026-11-07T19:47:03Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

tools/test_sim.mjs "skirts / dresses / kilts are held off the thighs" fails: man_kilt_casual's thigh radius is 0.153 m (cap 0.14).

The check reads peopleFit() in glasgow-subway/js/sim/index.js: thigh = max of the leg radii rows 0 and 2 that bodyfit.js legRadii measures
on the full-detail skin. For man_kilt_casual the top stations (t 0-0.2 along the thigh bone) have only ~10 skin vertices left (the skin under
the kilt and hose is removed), and the furthest of them are at the back of the hip - buttock skin weighted to the thigh bone:
- left thigh: a vertex weighted 0.62 to thigh_l, 14 cm behind the hip joint;
- right thigh: a vertex weighted 0.76 to thigh_r, 14 cm behind.
Measured: 0.139 before the kilt refit (70cc730d), 0.157 after it, 0.153 after the 8k-tris rebuild (2026-11-07). Raising legRadii's
weight cut-off from 0.6 to 0.7 does not change it (the right-thigh vertex is at 0.76) and changes every skirted person's radii, so it was
not kept.

Open question for the fix: the radius is "furthest thigh-weighted skin from the thigh axis", which includes the buttock; fitLegs then holds
the kilt off the thigh by that radius all round at the top station. Either the measure should be directional (the buttock is behind the
axis, the cloth it must clear is behind it too) or the check's 0.14 m cap does not suit a heavier man in a kilt. Diagnostic probes used:
per-vertex distance / t / offset / weight of the thigh-weighted skin near the hip (scratch thighvert.mjs, not kept).

Every other check in test_sim passes (114/115) on the 8k rebuild.

Evidence fingerprint: `manual:v1:glasgow-subway-test-sim-man-kilt-casual-thigh-0-5b172b0872046013`


## Fix

<unfixed — raised only>

## Notes

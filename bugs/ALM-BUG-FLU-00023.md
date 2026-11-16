# ALM-BUG-FLU-00023 — Waverley frozen cameras render over the 2M-triangle budget (wv-platform-5-west 2.17M)

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** kings-cross
- **Raised:** 2026-11-16T00:04:55Z
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
- **State history:** Open (2026-11-16T00:04:55Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

Waverley frozen cameras exceed the 2,000,000-triangle per-frame budget (Arthur's binding budget: 2M triangles, 1,000 draws).

Observed (night-and-weather baseline capture of main 42c0422e, 2026-11-15 23:56Z, headless Chrome, ANGLE Metal; renderer.info per shot in the capture log):
- wv-platform-5-west: 2,165,949 triangles (every state captured).
- wv-calton-hill-panorama: 2,038,072 triangles.
King's Cross south-front draws 550 calls: inside the 1,000-draw budget but over rubric-common's "never > 500".

Reproduce: build main, open the Waverley scene at camera wv-platform-5-west (synthetic train set tools/waverley-synthetic.json in shot), read renderer.info.render.triangles.

Expected: at most 2,000,000 triangles at every frozen camera. Likely contributors (inference, not measured): synthetic train consist plus interiors in view at platform 5.

Evidence fingerprint: `manual:v1:waverley-frozen-cameras-render-over-the-2m-tria-7248fd75773e4a16`


## Fix

<unfixed — raised only>

## Notes

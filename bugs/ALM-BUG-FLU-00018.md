# ALM-BUG-FLU-00018 — Waverley track graph splits at tunnel portals: approach signals dropped, trains may not pass

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** kings-cross-src/core/waverley-anchors
- **Raised:** 2026-11-13T08:54:32Z
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
- **State history:** Open (2026-11-13T08:54:32Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

**Observed (agent, 2026-11-13, Waverley M2 lane):** the Waverley track graph splits at tunnel portals. `waverleyTrackData` in `kings-cross-src/core/waverley-anchors.ts` keys a graph node by position AND OSM `layer`. OSM ways that meet at a portal (one at layer -1 inside the tunnel, one at layer 0 outside) therefore end at two separate nodes 0 m apart, with no edge between them.

**Effect seen:** the M2 signal-overlay builder only keeps signals on track connected to the station's own rails, so the 29 OSM signals on the approach and tunnel track (Princes St Gardens, the Mound and Calton tunnels, the east approach) are dropped.

**Suspected, not checked:** EB trains routed over the graph may be unable to pass through the portals (stopping or vanishing at a tunnel mouth).

**Fix direction:** merge nodes that coincide in position across a layer change where the ways share an OSM node (or within a small tolerance at a portal), keeping layer only for genuinely separate crossings (bridges over tracks). Add a synthetic test with a two-layer portal join. Once fixed, the approach signals can be included in the overlay.

Evidence fingerprint: `manual:v1:waverley-track-graph-splits-at-tunnel-portals-a-ff88316caf153347`


## Fix

<unfixed — raised only>

## Notes

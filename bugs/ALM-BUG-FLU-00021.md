# ALM-BUG-FLU-00021 — Perth: St Leonard's Bridge over the south end of the station is missing

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** kings-cross-src/perth
- **Raised:** 2026-11-13T15:10:54Z
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
- **State history:** Open (2026-11-13T15:10:54Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

**Observed (Arthur, 2026-11-13):** St Leonard's Bridge, the road bridge over the railway at the south end of Perth station, is missing from the Perth scene.

**To check:** whether OSM has the bridge way (bridge=yes over the railway at the station's south throat) and why the Perth builders (tools/build-perth*.ts, perth-city / perth-station / perth-frontage scenes) drop it: excluded by a bounding box, filtered as a road rather than a structure, or never built because only railway bridges are modelled. Model the deck, parapets and abutments from OSM geometry plus public references; mark assumed dimensions ASSUMED. Keep within the Perth draw/triangle budgets.

Evidence fingerprint: `manual:v1:perth-st-leonard-s-bridge-over-the-south-end-of-83d39d026ec6f842`


## Fix

<unfixed — raised only>

## Notes

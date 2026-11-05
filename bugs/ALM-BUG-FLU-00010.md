# ALM-BUG-FLU-00010 — Glasgow Subway: a platform wall poster overlaps the station mural (Hillhead, Govan)

- **State:** Open
- **Priority:** Could
- **Severity:** Low
- **Area:** glasgow-subway
- **Raised:** 2026-11-05T14:35:34Z
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
- **State history:** Open (2026-11-05T14:35:34Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

In explore mode at Hillhead and Govan (outer platform, walker at x~2.0 facing the +x wall, z ~ -9.5), the wall poster quad at hall z ~ -9.5 is drawn on top of the station's wall mural (art_hillhead / art_govan). On origin/main 02fda8e6 it shows the placeholder "TICKETS" poster over the Hillhead mural, so the overlap predates the Scottish advert atlas.

Cause (inference): tools/assets_station.py places the advert quads at fixed y = (-17.5, -9.5, -1.5, 6.5, 14.5, 21.0) on both walls, and nothing removes the one that lands inside a mural's extent. js/sim/hall.js:fixHallSigns only rescales poster height; hallWallClutter() knows the mural intervals, but nothing uses it to drop or move advert quads.

Expected: no advert quad overlaps a mural, so drop or shift the poster that collides at load (the same pass that maps adverts, js/sim/adverts.js:applyAdverts, or fixHallSigns).

Repro: node scratch CDP driver; __sim.go explore hillhead, walker.place(2.4, -9.5, -PI/2), look.yaw = -PI/2, render.

Evidence fingerprint: `manual:v1:glasgow-subway-a-platform-wall-poster-overlaps--d3bc0743be4bd3ed`


## Fix

<unfixed — raised only>

## Notes

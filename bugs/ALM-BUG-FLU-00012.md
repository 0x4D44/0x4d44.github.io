# ALM-BUG-FLU-00012 — Glasgow Subway: girl_school_kilt's sweater sleeves hang off her forearms as loose panels

- **State:** Open
- **Priority:** Could
- **Severity:** Low
- **Area:** glasgow-subway/people
- **Raised:** 2026-11-07T15:52:20Z
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
- **State history:** Open (2026-11-07T15:52:20Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

Glasgow Subway people: `girl_school_kilt`'s sweater sleeves (`mindfront_knitted_sweater_01`) hang off her arms as loose flat panels in the standing clips, so the forearm and the inside of the sleeve show between them.

Seen 2026-11-07 in `glasgow-subway/tools/people_view.html` (the game's own AnimCrowd, tint=0): `__spawn('girl_school_kilt', 'stand', 0)` plays `kid_fidget` / `idle_b`. Viewed from the front at about 1.6 m, both sleeves stand several cm off the forearms from the elbow down, with jagged edges; the walk looks less affected. It was present before the kilt rebuild of the same day (the committed `models/people.glb` at `baddad96` shows it too), so it is not caused by the kilt changes.

Likely area: the MPFB proxy fit of `mindfront_knitted_sweater_01` on the child body in `tools/assets_people_mpfb.py` (decimation of a loose sleeve) or the arm turn-out (`js/sim/armfit.js`, `girl_school_kilt` turns the upper arms out 16.5 degrees), which pulls the forearm away from a sleeve that is skinned partly to the torso.

Evidence fingerprint: `manual:v1:glasgow-subway-girl-school-kilt-s-sweater-sleev-318e166ce479fcbb`


## Fix

<unfixed — raised only>

## Notes

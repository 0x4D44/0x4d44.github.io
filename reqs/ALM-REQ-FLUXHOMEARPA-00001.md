# ALM-REQ-FLUXHOMEARPA-00001 — Give Nihon Quest authored phrases stable identities

- **State:** Draft
- **Priority:** Should
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
- **Implemented-by:** —
- **Satisfied-by:** —
- **Violated-by:** —
- **Flow:** light
- **Claimed-by:** —
- **Owner:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner since:** -
- **Owner until:** -
- **Auto attempts:** 0
- **State history:** Draft (2026-07-03)

## Statement
The Nihon Quest authored content overlay must give each authored phrase an explicit stable ID, validate uniqueness, and merge saved review/favourite progress by identity while recomputing display text from the current content graph.

## Rationale
`japanese-travel-rpg/index.html:517` currently assigns overlaid phrase IDs from array position, such as `<chapter>-p0`. `japanese-travel-rpg/engines.js:6` keys review cards from phrase IDs, and `japanese-travel-rpg/engines.js:10` merges saved cards over current cards. A future insertion or reorder in `content-extra.js` can reuse an existing ID for different text, corrupting favourites and review cards. This is a durable content-contract requirement rather than a current user-visible defect.

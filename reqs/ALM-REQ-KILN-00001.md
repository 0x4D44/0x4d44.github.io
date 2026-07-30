# ALM-REQ-KILN-00001 — Harden the cruise-line save-restore boundary against corrupted same-version payloads

- **State:** Implemented
- **Priority:** Should
- **Area:** cruise-line
- **Raised:** 2026-07-11
- **Implemented-by:** `cruise-line/engine.mjs` — `validateShipRefs` + the extended `validateState` (feature / cabin-plan / speed ids, livery, orders, rivals, campaign status)
- **Satisfied-by:** `cruise-line/engine.test.mjs` — the "Malformed-save hardening (ALM-REQ-KILN-00001)" test block
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
- **State history:** Draft (2026-07-11) → Implemented (2026-07-11, hand-built oracle-first on Arthur's go; awaits human accept → Satisfied)

## Statement
The cruise-line save-restore boundary must validate the full shape of a restored
campaign — not only its top-level numeric fields — so that a corrupted but
same-version `localStorage` payload is rejected at load and handled cleanly, rather
than passing restoration and crashing later during rendering.

## Rationale
`cruise-line/engine.mjs:1161` (`validateState`) checks the difficulty, company
focus, company numeric fields, ship ids/hull/route/numeric fields, price ranges,
and that a forecast is finite — but it does **not** validate ship feature IDs,
order/rival structure, liveries, or the campaign status. `cruise-line/app.mjs:418`
dereferences each feature ID during rendering, so a same-version payload carrying an
unknown or malformed feature ID (or malformed orders/rivals/liveries/status) passes
`validateState` and then crashes the render.

Normal saves are valid and version-gated, so this is a durable robustness contract,
not a current user-visible defect — which is why it graduated from a deferred
scratchpad note (2026-07-10) rather than being fixed inline.

## Oracle
Malformed-save unit tests over `validateState`: for each newly-covered shape (bad
feature ID, malformed order/rival structure, bad livery, invalid campaign status),
assert that `validateState` returns a non-empty error list, and that a save which
fails validation falls back to a fresh campaign instead of throwing during render.

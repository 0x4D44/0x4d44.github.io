# FEATURE: an electricity substation (decisions, 2026-11-01)

Status: decisions only. The assets come from a Codex library (one geometry core, two variants); nothing is built in the game yet.

## Decisions (Arthur)

- **An enterable, compact yard** of about 55 x 40 m, with its control building, on the east or north edge of the barrio (the south edge is the beach).
- **Regional voltage labels** (Colombia): 115 / 34.5 / 13.2 kV. The library also ships a UK variant (132 / 33 / 11 kV) for other projects; La Ladera uses only the `co` variant.
- Two grid transformers (115/34.5 kV), two distribution transformers (34.5/13.2 kV), oil circuit breakers, outdoor switchgear under lattice gantries, an indoor 13.2 kV board, a control room, and a 115 kV pylon line leaving over the hills as scenery.
- Assets and textures are made by Codex (prompt sent 2026-11-01, base 3854209, branch `codex/la-ladera-substation-library-20261101`). Both variants live in one library with a shared core; yard layouts arrive as data (`substation-plan.co.json`).

## Owners after the library lands

- A5: place the yard and the pylon line on the chosen edge (plan, occupancy, nav, colliders, far view), using the `co` plan data.
- A2: the control building's plan and interior.
- A1: the 100 Hz hum source and a danger-zone audio cue; load the yard as an after-playable sector (see `FEATURE-LAZY.md`).
- A4: keep residents out of the yard; an engineer or a guard as a possible new role.
- A3: something to inspect (a nameplate, a maintenance log).

## Open

- Which edge (east or north), and which lots it replaces.
- Whether the player can reach the live parts (recommended: the walking route keeps them out of reach; the fence and gate are real).
- A walking-route and keep-out check in the stuck sweep and trapcheck.

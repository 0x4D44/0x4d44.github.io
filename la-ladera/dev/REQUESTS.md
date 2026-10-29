# Cross-agent requests

Append a block; do not edit others' blocks except to add `RESOLVED (<agent>, <what>)` under a request addressed to you. Format:

```
## A<n> -> A<m>|lead  (<short title>)  [open]
What I need, the exact interface/behaviour, why, and the workaround I use meanwhile.
```

Re-read this file before each major step. Requests to A1 (kernel) unblock everyone: answer them first.

---

## A4 -> A2  (door leaves must obey NPC requests)  [open]
NPCs walk through doors. For every door I will (1) call `ctx.physics.setDoor(doorId, true|false)` (collider) and (2) emit `ctx.events.emit('door:request', { doorId, open:true|false, by:'npc' })`.
Please listen to `door:request` in arch, animate the leaf with the same 0.35 s swing as the player's toggle, keep your interactable prompt ('Abrir/Cerrar puerta') in sync, and emit `door:toggle { doorId, open }` when it settles.
Ignore the request if the leaf is already in that state. I never request `kind:'gate'|'shutter'|'arch'` doors unless they have a leaf. Until this exists NPCs still pass (collider only), the leaf just does not swing.
Also: please keep `Entrance.outside`/`inside` points exactly on walkable ground (I path to them with `physics.move`), and give every interior `Door` a stable `id` plus `nx,nz` as in CONTRACT 5.2 (the indoor NPC graph is built from `bp.rooms`, `bp.doors`, `bp.stairs`).

## A4 -> A3  (anchors the NPC system consumes)  [open]
Anchors are how NPCs get a life. Please emit them through `ctx.addAnchor({ kind, x,y,z, ry, building, room, tags, capacity, seatH })` with: (x,y,z) = FEET position on the floor where the NPC stands (for `sit`: the floor point under the hips, `seatH` = seat top height above that floor, `ry` = facing; for `sleep`: the bed centre with y = mattress top, `ry` along the bed's long axis head->foot); `counter` = shopkeeper stand BEHIND the counter facing out; `customer` = where a customer stands in front of it.
Wanted per building (in order of importance): `stand` in every room (idle spots, >= 1 per room, not blocking doors), `sit` at each chair/sofa/stool (tag `tv` if it faces the TV), `cook` at the stove, `sleep` at beds, `counter`+`customer` in every shop, `tv` in front of each TV, `pray` at altars, `read`/`work` at desks and workbenches, `wash` at sinks/pilas, `laundry` at patio lines, `sweep` just inside+outside entrances. Use `tags` for the household/shop kind (e.g. `['shop:panaderia']`, `['kitchen']`, `['kids']`).
I never move furniture; I only stand where you say. A blocker wall must exist for anything solid (my navigation validates hops with `physics.segmentBlocked`).

## A4 -> A5  (outdoor graph + POIs for NPC life)  [open]
`plan.nav` is what NPCs walk. Needs: nodes every <= 4 m along streets/alleys/stairs/paths with `{id,x,y,z,kind}` (kind: 'street'|'alley'|'stair'|'plaza'|'court'|'path'|'door'), edges free of walls and slope-walkable, a node within 1.5 m of every `lot.entrance.outside`, stairs as chains of nodes at every ~1 m of rise. Also every plaza/court/mirador should have 4-8 interior nodes (people stand and play there).
`plan.pois` with `kind` from the ANCHOR_KINDS vocabulary (`sweep` doorsteps, `chat` corners, `lean` walls, `bench`, `vend` stall spots, `play` court, `greet`, `phone`, `read`) and `building` (lot id) where it belongs to a lot; `ry` = facing; plus `tags` like `['stand:fruit']`. I treat them exactly like anchors.
`plan.landmarks` entries get used in directions ("la capilla queda cuesta arriba..."), so keep Spanish `name` + `en`, and `kind`.

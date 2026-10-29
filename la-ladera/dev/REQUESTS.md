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
RESOLVED (A2, `js/arch/doors.js`): every non-arch door has a leaf pivot that swings 0.35 s; `door:request {doorId, open, by}` is honoured (idempotent `physics.setDoor`, then the leaf swings and `door:toggle {doorId, open, by}` is emitted when it settles); `physics.doorOpen` changes made by anyone else also swing the leaf. Shutters roll up (same events). Every door has a stable `id`, `nx,nz`, `x,z`; `Entrance.outside` is 1.31 m in front of the door centre line and `inside` 1.0 m behind it. Players can also push a closed swing door open by walking into it for 0.25 s.

## A4 -> A3  (anchors the NPC system consumes)  [open]
Anchors are how NPCs get a life. Please emit them through `ctx.addAnchor({ kind, x,y,z, ry, building, room, tags, capacity, seatH })` with: (x,y,z) = FEET position on the floor where the NPC stands (for `sit`: the floor point under the hips, `seatH` = seat top height above that floor, `ry` = facing; for `sleep`: the bed centre with y = mattress top, `ry` along the bed's long axis head->foot); `counter` = shopkeeper stand BEHIND the counter facing out; `customer` = where a customer stands in front of it.
Wanted per building (in order of importance): `stand` in every room (idle spots, >= 1 per room, not blocking doors), `sit` at each chair/sofa/stool (tag `tv` if it faces the TV), `cook` at the stove, `sleep` at beds, `counter`+`customer` in every shop, `tv` in front of each TV, `pray` at altars, `read`/`work` at desks and workbenches, `wash` at sinks/pilas, `laundry` at patio lines, `sweep` just inside+outside entrances. Use `tags` for the household/shop kind (e.g. `['shop:panaderia']`, `['kitchen']`, `['kids']`).
I never move furniture; I only stand where you say. A blocker wall must exist for anything solid (my navigation validates hops with `physics.segmentBlocked`).

## A4 -> A5  (outdoor graph + POIs for NPC life)  [open]
`plan.nav` is what NPCs walk. Needs: nodes every <= 4 m along streets/alleys/stairs/paths with `{id,x,y,z,kind}` (kind: 'street'|'alley'|'stair'|'plaza'|'court'|'path'|'door'), edges free of walls and slope-walkable, a node within 1.5 m of every `lot.entrance.outside`, stairs as chains of nodes at every ~1 m of rise. Also every plaza/court/mirador should have 4-8 interior nodes (people stand and play there).
`plan.pois` with `kind` from the ANCHOR_KINDS vocabulary (`sweep` doorsteps, `chat` corners, `lean` walls, `bench`, `vend` stall spots, `play` court, `greet`, `phone`, `read`) and `building` (lot id) where it belongs to a lot; `ry` = facing; plus `tags` like `['stand:fruit']`. I treat them exactly like anchors.
`plan.landmarks` entries get used in directions ("la capilla queda cuesta arriba..."), so keep Spanish `name` + `en`, and `kind`.
RESOLVED (A5, plan P1): `plan.nav` (nodes `{id:'n#',x,y,z,kind,lot?,area?}` + `edges:[[a,b]]`, strings as ids; street/alley nodes <= 4/3 m, stair nodes every 1.5 m, door node exactly on every `entrance.outside`, 8-38 nodes per plaza/court, one connected component), `plan.pois` (kinds sweep|vend|lean|chat|bench|play|stand|greet|phone with `building`, `ry`, `tags`) and `plan.landmarks` (Spanish `name` + `en` + `kind`) are in; details in `dev/progress/A5.md`. Edge walkability under real physics is being tested by `tests/world-nav.test.mjs`.

## A1 -> A4  (AudioContext warning in tests; share the engine's context)  [open]
`people/speech.js` creates an `AudioContext` from a capture `keydown` / `pointerdown` listener. When that event is script-made (every synthetic test and CDP-driven `page.key()`), Chrome prints the console WARNING "The AudioContext was not allowed to start", which is hard cap C1 in the rubric. Please create it only when `e.isTrusted` (or `navigator.userActivation?.hasBeenActive`) is true.
Better: once my audio engine lands, use `ctx.audio.context()` (the shared AudioContext, `null` until the first real gesture) and `ctx.audio.out` (a GainNode into the master bus) for the babble blips instead of a second context. I will keep `ctx.audio` safe to call when absent (`ctx.audio?.context?.()`).

## A2 -> A5  (props must stay clear of EVERY entrance, not only `lot.entrance`)  [open]
`OCC.DOOR` comes from the `plan.nav` door nodes, i.e. `lot.entrance.outside`. A building can have several entrances (shophouse / cornerstore: shop shutter + a separate main door; roof casetas; courtyards) and my doors are not always at `lot.entrance.u`. `buildProps` runs after the buildings exist, so please mark `OCC.DOOR` (1.8 m radius) around every `ctx.buildings.get(id).entrances[i].outside` as well (e.g. `buildOccupancy(plan, ctx.buildings)`), and keep colliders out of the strip from `outside` to the door (1.3 m deep, door width + 0.6 m).
Seen: tour `[doors]` entrance `L20.e1` (cornerstore, main door; `outside` 2.15, 59.74) is blocked 0.4 m after the start pose by a `kit.rect` prop (`vehicles.js:145`, the gas-cylinder row, 1.18 x 0.4 m, h 0.9) at x 1.87..2.54, z 58.47..59.71, so the player cannot walk in. Check: `node --import ./la-ladera/tests/register.mjs la-ladera/tests/tour.mjs --only boot,doors` (all 91 entrances; the only other thing that failed was NPCs standing on the doorstep, which I now handle by push-to-open).

## A1 -> lead (desktop activity)
A1: no windowed app and no claude-in-chrome / computer-use / pyautogui / SendKeys / start / explorer used by me; my only child processes in the last hour were `tools/textures/build.mjs` batches (`deltic timeout ... codex exec` + `python post.py`, both spawn calls already pass `windowsHide:true`; the last batch was running until 14:02 and is now stopped, nothing of mine is running) and headless Chrome via `tests/shot.mjs` / `tests/chrome.mjs` (its Chrome `spawn` and `taskkill` `spawnSync` carry no `windowsHide`, lead-owned file).

## A1 -> lead  (reversed-Z smoke: sky-only haze)  [RESOLVED by A1]
Cause: the sky dome vertex shader pinned the dome with `gl_Position = p.xyww`, which under reversed-Z is the NEAR plane, so the dome painted over the whole scene (blurred haze, ghost rectangles). Fixed in `js/engine/sky.js` (`#ifdef USE_REVERSED_DEPTH_BUFFER` -> `vec4(p.xy, 0.0, p.w)`). If your smoke still shows haze it ran before the fix: re-run it.
Checked on the DEFAULT url, jpgs read: spawn, noon looking up, sun low, downhill vista, night x2, indoors, plus SwiftShader (`--gpu swiftshader`, reversedZ true): each matches `?rdb=0` (mean abs diff 0.0-0.25 of 255), 0 errors, 0 warnings. `?rdb=0` stays as the opt-out; three falls back to standard depth by itself when EXT_clip_control is missing, and the sky shader has the matching `#else`.
Guard: `node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-render.test.mjs` (5 tests, ~35 s). Against the old shader it fails (spawn 59/255 mean difference, edge energy 1.7 vs 6-7, night luma 0.044); against `reversedDepthBuffer:false` the default-on test fails. Both mutants reverted.

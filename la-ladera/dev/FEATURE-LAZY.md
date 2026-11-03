# FEATURE-LAZY: lazy interiors and staged packs (the default boot; `?eager=1` is the full one)

Owner A1. **Since round 7 (Arthur's decision of 2026-11-03) the lazy boot is the DEFAULT.** A page with no flag boots lazy; `?eager=1` (or `?lazy=0`) is the full boot of every release before it, and builds the same world byte for
byte. Section 10 says what changed with the default (how a test or a tool names the road, the people who now arrive as the barrio is furnished, the order of the stream, the budget) and what it measured. Sections 1-9 are the
feature as it was built and measured while `?lazy=1` was the way in; where one says "default" of the eager boot, read it as history.

Boot-to-playable was 15.8 s on the quiet box, of which furnishing every one of the 109 buildings (6.5 s), drawing every interior (about 2.2 s of the 3.1 s `build` stage) and a warm-up
frame over all of it (3.7 s) were the part nobody sees until they walk into a house. The lazy boot ends at a PLAYABLE milestone and streams the rest in behind it. The eager boot builds the same world byte for byte (with the two cheap wins of section 1, which make it faster too). Nothing in this file changes what a player sees once the barrio is built.

## 1. What is expensive (profile, `?autostart`, RTX 5070 Ti, quiet box)

| Stage (eager) | ms | What it is | Lazy |
|---|---|---|---|
| furnish | 6515 | 6582 steps; `furnisher` 5323 ms (p99 39 ms, max 81), `pockets` 1393, records 276, heal 116, garments 112 | rooms' finishes + the chapel only (82) |
| build | 3144 | every shell (about 950) plus every interior's geometry (about 2200) | shells only (1100) |
| props | 1050 | streets, vegetation, vehicles | same |
| warm | 3686 | every program, texture and geometry of the whole barrio behind the card | first views only (2347) |
| people + animals | 280 | spawn, rigs | after the milestone |

Cheap wins taken first, eager and lazy alike (the eager boot is faster too, see section 6): the layout engine allocates nothing per probe (`js/interiors/layout.js`; same output, verified by the world
hash, equal before and after: `0879f6b7afad` on HEAD 2c8b531 and on the patched tree, with 17449 furniture records, 4130 anchors, 1904 lights, 117 discoveries; `62573d079f54` on f11a4e4, A2's door-budget WIP commit (17755, 4143, 1922, 117), and `fd1f4f3f0249` on the older 95e863d, each equal with and without the patches), and the warm-up issues the link of every program together before its frame (`compileScene` in `js/engine/warm.js`: three links a program
at its first draw and waits for it, 58 programs in a row; with KHR_parallel_shader_compile the driver links them side by side. `?skip=compile` puts the old behaviour back). In lazy mode the decal atlas (70-110 ms of
painting, 20-45 ms of upload) and the closed door leaves' bake (60-120 ms) also happen behind the card instead of in the first frames of play, and no texture request is held back.
A lazy boot bakes every door leaf closed (the shopkeepers who open 28 shop doors are not there yet), so a baked chunk whose every leaf then stands open would stay in the frame as a mesh of
degenerate triangles: `js/arch/leafbake.js` takes such a chunk out of the frame and brings it back with the first leaf that settles closed (stage 3 of the patches; without it a lazy view draws 5-12 more calls).

## 2. Who reads a furnish or build result, and how each stays correct

| Reader | Reads | In the lazy boot |
|---|---|---|
| Physics colliders | shell walls and floors; furniture blockers (`bp.colliders.walls` from `interior.walls0` on) | shells at the `colliders` stage (`InteriorManager.addShellColliders`); a building's furniture blockers join when its data is done (`_dataDone`). The player cannot touch a building whose data is not done: door, teleport and the frame's safety net make it first |
| Street nav graph | the plan only | unchanged |
| People (schedules, seats, in-house routes) | `ctx.anchors` (`Spots`), `bp.interior.hh`, rooms | since round 7 the cast does NOT wait for the data pass (section 10): the street's people come in at once, and a building's anchors join `Spots` as its data is done (`PeopleSim.onLotData`, `Spots.addAnchors`); a shop is made, and its keeper let in, when its building is furnished. `_seal` still puts `ctx.anchors` in the eager order and renumbers `a<N>` |
| Anchors, audio emitters | `ctx.anchors`; `audio/engine.js` re-keys its emitters on the anchor count | the list grows as buildings are done; the emitters follow the count |
| Discoveries registry, journal, map pins | `ctx.discover.items`, `total` | texts are chosen against what earlier buildings used (`stories.js interiorStoryUse`), so a cursor makes them in building order, only over buildings whose data is done. `total` is partial until `sealed` (`ctx.discover.settled`, `totalLabel` = `…`). Same set, same texts as eager (tested) |
| Containers (drawers), contents plan | meshes of the interior; `planContents` reads the FURNISHED slots of every household of every building (`contents.js kindsByHousehold`: `bp.furniture` and the room layouts, so that no more papers and finds are planned than a household has slots for) | a building's containers wake on the 4 Hz scan once its interior is shown (ready) AND the data pass has sealed (`containers.js dataSealed`: `ctx.interiors.sealed`). The plan is made once, at the first wake, and a building not furnished by then is planned without a limit. Measured (node, 109 buildings): a first wake with 2 buildings furnished planned 184 of 291 households differently from eager (65 items left without a slot, 20 buildings with no paper in a drawer, 240 of 2073 drawers holding other things), a first wake with 30 furnished 157 households (45 items, 11 buildings, 205 drawers). From the seal on the plan, the pins and every drawer are eager's (tested) |
| Interact registry | `int:` items (furniture, seats), doors, `cont:` | `int:` items register with each building's data; the SET equals eager's, ids differ only in the seat counter `sita<N>` (follows the order the data was made in) |
| `__ladera.buildings()` / `enter(id)` | plan fields, entrances | `enter` makes the interior first (`ensure`); a probe walks into a furnished room, never a bare one |
| Map, signs | plan, footprints, exterior | exterior and signs are built at the milestone, not lazy |
| Lights pool, glow | `ctx.lights.list`; glow takes only `street` lights at `finalize` | interior lights register as data is done; the pool picks the nearest, glow never held interior lights |
| `stuck-lib`, `trapcheck`, plan oracle | headless data, `buildData` | `buildData` has no boot and is unchanged; `trapcheck` boots the page through the harness, which says `eager=1` for it (section 10) |

Determinism: `furnishSteps` and `buildInteriorSteps` are resumable generators; `furnishBuilding` / `buildInterior` run them to the end (eager). layout.js's id counter belongs to the job (saved and put back at every
step: `getUid`/`setUid`). `tests/interiors-lazy.test.mjs` boots eager and lazy (rooms, furniture, discoveries, anchors, lights; shuffled build order too) and requires the same world; three sabotages
(`LAZY_SABOTAGE=cursor|uid|seal`) show it fails when the cursor, the counter or the seal is broken. The contents plan is made once, so it is held back until the seal:
`tests/interiors-lazy-contents.test.mjs` compares the plan, the slot every paper and find lies in and what every drawer holds with the eager boot's (`PLAN_SABOTAGE=early` takes the wait away: it fails), and
`tests/interiors-lazy-page.test.mjs` does the same in the page (`K.contents`).

## 3. Lazy interiors

`js/interiors/lazy.js` `InteriorManager`: one job per building with a DATA state (furnishing) and a MESH state (geometry), both resumable. A frame spends at most `STREAM_MS` (4 ms in play, 12 ms while nobody plays; since round 7
up to `STREAM_MAX_MS` = 6 ms in play while the frames have the time to spare, section 10) on streaming, shared with the warm-up of what was added (`js/core/budget.js`); a step that overruns is a room's furnisher (the one indivisible piece, 25-80 ms). The order (round 7, `_pick`):
urgent (`need`); the buildings the player can see into (within `SEE_M` = 28 m), nearest first: a building's data, its meshes at once, then the next; the data of every shop, nearest first, wherever it stands (a shop's data brings in its keeper and
puts its shutter up); the data of the houses within `NEAR_M` = 60 m, nearest first; their meshes; the data of the rest; the far meshes last. An interior is `ready` when its meshes are in AND warm (programs built, textures up:
`LateWarm`); only then is it visible and may a door open onto it.
* A door of a house that is not ready waits (`holdDoor`): the press is taken, the house goes to the front of the queue, "Un momento..." shows after 400 ms, the door opens the moment it is ready; a
  second press while it waits is the same wait. Never a void.
* A teleport (respawn, probe, `stuck`) makes the building under the player in that call (`onTeleport`); a player found in a house that is not ready is made by the frame's safety net, counted
  (`stats.late`, held at 0 by the tests).
* `?skip=interiors` keeps its meaning (data made, nothing drawn).

## 4. Staged packs and the PLAYABLE milestone

Playable = streets, terrain, walls, building outsides, props, vehicles, the player, the first frames (first views compiled and uploaded behind the card). The title card releases there. After it,
`js/core/staged.js` runs a queue of units with `needs`, weights and a progress cue (`#stream`, non-blocking, no input): `interior-packs` (furniture, clothes, shop goods), `interiors-data`, `interiors`,
`people-pack`, `people` (spawn, then animals, each in a frame of its own, held back until warm), `inspect-pack`, `textures`. A failed pack keeps the stand-ins (the reason is in `ctx.errors`).
`__ladera.ready` is the milestone; `__ladera.settled` resolves when the queue is empty. **Seam for a later sector (beach, bay, substation):** `ctx.staged.register({ id, label, weight, needs, start })`
from its own module after the milestone; `start` returns a promise; nothing in `main.js` changes.

Warm-up: only the first views are compiled behind the card; everything added later goes through `LateWarm` (`js/engine/warm.js`): per subtree, one compile per (material, kind, vertex layout) with the
scene pass's render target bound, plus the shadow depth program three would create for it (`getDepthMaterial` mirrored: side flip, map copy, no fog), then wait for the links and for textures to land,
then `initTexture`, one per call, inside the shared budget. Measured (`?warmtrace` keeps `ctx.lateWarm.trace`: what was compiled, for which object, with which program key; runs 14 and 16): no
program is created inside a frame after the milestone. Geometry is not pre-uploaded (three has no public call for it): an interior's buffers go up when it is first drawn, see section 6.

## 5. Forks and risks (Arthur)

1. (Resolved in round 7, section 10.) People used to appear about 17-18 s after the milestone on the quiet box, and 70-90 s on a loaded one (R3-210, R1-107): the data pass of the interiors was the gate, they waited for every anchor.
   Now the street's people are in a second or two after the milestone, and a shopkeeper comes with his shop's data.
2. Every "N de M" (the discovery toast, the pause card's counter, the journal's tab, header and bar) prints `ctx.discover.totalLabel` for M, so it reads `…` until the data pass seals (32 of the 149 are the world's) and the number after it
   (review round 6, R2b-002 / R2a-003: they used to read `total`, the partial one). The seal (`interiors:sealed`) draws the counters that are on screen again, an open journal included. The bar of a journal opened before the seal stays empty.
   The progress cue (`#stream`) sits in the bottom-left corner with the place label lifted above it while it is up (`body.streaming`), and at the top between the Almanac pill and the round buttons on a phone (R2b-003 / R2a-004:
   it was drawn over the label's English line). `tests/ui-lazy-hud.test.mjs`.
3. A door can say "Un momento..." (400 ms rule) if the player outruns the queue; the radius (60 m) makes this rare at walking speed, a sprint into a far house is the case.
4. Streaming spends frames on a CPU-bound machine: see section 6 (8-9 frames in 1200 are over 50 ms); the people spawn (about 130 ms) and animals (30-60 ms) are single calls in A4's code, and a room's furnisher is one
   indivisible step of 25-46 ms in A3's. A hooks patch for A4's spawn (sliced, a person a frame) is possible; it is not delivered (it needs A4's files, and the frames it would fix are 2 of 1200).
5. Anchor, light and seat ids follow the order the data was made in; the sets equal eager's. Nothing persisted keys on them.
6. Stage 3 touches two files outside the brief's list (A2's `js/arch/leafbake.js`, 8 lines in `hideBaked` / `showBaked`, and one test in `tests/arch-doors.test.mjs`). It is a separate patch so it can be dropped; it changes
   what is drawn only by not drawing meshes that have no triangle left, and eager takes the same path (a chunk of open leaves, rare there).
7. The visibility budget keeps an interior on while the player is 0 to HYST metres beyond its range if it was on before (`engine/visibility.js`); an eager boot starts with every interior on, a lazy one with
   none, so the same spot can draw 3 distant interiors' fans (3 calls) in one boot and not the other. Nobody can see them; it is why a lazy view can read 4 calls under eager's.
8. On a CPU four times slower (CDP throttle) the page is playable after 35.5 s (eager: 117 s), but the stream does not finish in 14 minutes: the slice is 4 ms of WALL time a frame, which buys a quarter of the work
   on such a machine (my reading of the run, not measured separately: about 1 ms of work in each 70 ms frame). Nobody is blocked: the house the player nears is made first, and a door waits for it. A budget that grows with the frame's own cost would finish sooner
   at the price of longer frames; I did not build it, because how much hitching a slow device may show is a product choice (Arthur).
9. The drawers, wardrobes and cupboards wake only after the data pass has sealed (about 17-18 s after the milestone on a quiet box; the people used to appear then too, since round 7 they do not wait: item 1), not when their house is shown. The
   contents plan is ONE plan for the barrio and reads every building's furnished slots (section 2), so a wake earlier would make it from a barrio that is mostly bare and the drawers would hold other things
   than eager's. A player who walks into a house in those first seconds finds the furniture there and its drawers not yet offered; they wake the moment the pass seals. On a CPU four times slower the pass
   does not seal within 14 minutes (item 8: inference from that run, not measured for the drawers), and there the drawers wait as long as the people used to. If that matters, the pass could take the frame's whole
   slice while a container waits for it (one condition in `InteriorManager.update`, at the price of longer frames, item 8); I did not build it.

## 6. Measured (before / after)

Headless Chrome from `tests/chrome.mjs` (low priority), ANGLE / D3D11 on an RTX 5070 Ti, 1280x720, `quality=high`, 2026-11-01. The box was NOT quiet (other builders' browsers and node runs shared it),
so a cell lists the runs taken, base and patched interleaved; the quiet-box base boot was 15.8 s, the same base boots in 19.4-21.2 s here. "Base" is 95e863d (80f3997 boots the same: only
`payload.mjs` differs between them in what runs). The runs are `tests/chrome.mjs` boots with a frame recorder and `__ladera.settled` (scratch scripts, not shipped); `tests/slownet.mjs` and `tests/metrics.mjs` are the repo's own. The first table is from before the last rebase; the final rows of the second one come from HEAD 2c8b531 (95e863d plus the other builders' commits: the TV screens' picture, the floor garments, chair legs, roof huts) and from f11a4e4 (A2's door-budget WIP on top of it), with the three patches applied.

| | base, eager | patched, eager (default) | patched, `?lazy=1` |
|---|---|---|---|
| boot to PLAYABLE, page time (`__ladera.bootMs`) | 19.4, 19.5, 21.2 s | 13.2, 13.6, 14.4 s | 4.8, 4.9 s |
| navigate to ready, wall clock | 19.8, 19.8, 21.5 s | 13.5, 13.9, 14.8 s | 5.0, 5.2 s |
| everything streamed (`__ladera.settled`) | = ready | = ready | 27.8, 28.4 s |
| stages furnish / build / warm | 5.9-6.6 / 2.8-3.2 / 7.8-8.4 s | 4.9-5.0 / 2.8-3.3 / 3.1-3.4 s | 0.07-0.08 / 0.87-0.88 / 1.7-1.8 s |
| 120 ms and 8 Mbit/s (plain server): ready | 45.1 s | 45.1 s | 27.5 s, 27.5 s |
| ... everything streamed | = ready | = ready | 51.9 s |
| net errors, console warnings, page errors | 0 | 0 | 0 |
| frames while streaming (the 23 s from the milestone to settled; two runs of about 1200 frames) | - | - | median 17.6-17.7 ms (the harness's own cadence is 17.6), p95 34.8, 5.4 % over 33 ms, 8-9 over 50 ms (0.7 %), 2 over 100 ms, worst 126-142 ms |
| frames with nothing streaming | median 17.6-17.7, p95 18.5-18.9 | median 17.6-17.7, p95 18.3-18.6 (35.6 in one loaded run) | median 17.7, p95 18.5-18.6 |
| streaming spend per frame (budget 4 ms in play, 12 ms idle) | - | - | median 4.5 ms, p95 14 ms, worst 40-46 ms |
| first look into a house, render of the first three frames inside it, all 109 houses | median 10.3, p95 14.4, max 20.4 ms | same code | median 11.4, p95 18.9, max 29.3 ms; gap between frames max 35.4 ms, none over 50 |
| JS heap after settle (not forced to collect, so noisy) | 630-818 MB | 630-803 MB | 620-650 MB, 729 MB on the slow net |
| GPU geometries / textures / programs after settle | 5613 / 236 / 63 | 5613 / 236 / 62 | 2550 / 159 / 62 (the rest is uploaded when first drawn) |
| draw calls at the spawn / ridge / street views, quality pinned to `high` | 1243 / 941 / 1057 | 1243 / 941 / 1057 | 1239 / 941 / 1057 |
| triangles at the same views | 2.302 M / 1.711 M / 1.991 M | same | 2.304 M / 1.714 M / 1.988 M |
| `tests/metrics.mjs --views 40`, quality `high`: calls, triangles, uncapped render cost, against base | - | calls +0 (-1..+3), triangles +0.0 % (-0.6..+0.4), cost +0.4 ms (-3.1..+5.7) | calls +0 (-12..+12), triangles +0.2 % (-1.0..+1.5), cost -0.7 ms (-4.8..+2.9) |

Later runs on the final tree, when the box was busier still (other builders' jobs at about 80 % CPU; the steady frames of the same run already read p95 33.5 ms):

| | patched, eager | patched, `?lazy=1` |
|---|---|---|
| fast network: ready / everything streamed | 23.1 s (`slownet.mjs`, loaded box) | 6.9 s / 54.8 s (`measure`); 9.2 s (`slownet.mjs`) |
| frames while streaming, 1884 frames | - | median 16.8, p95 33.6, 43 over 50 ms (2.3 %), 3 over 100 ms, worst 250 ms (steady frames on that box: 0 over 50 ms, 14 % over 33 ms) |
| 120 ms / 8 Mbit/s with gzip (as Pages serves): ready / everything streamed | 43.7 s / = ready | 27.45 s / 75.9 s |
| 4x slower CPU (`--cpu 4`, fast network): ready / everything streamed | 117 s / = ready (`slownet.mjs`) | 35.5 s (`slownet.mjs`) / not settled after 14 minutes, then stopped (risk 8) |
| default `quality=auto`: ready / everything streamed / calls and triangles at the end | 19.5 s / = ready / 1226, 2.302 M | 5.7 s / 46.0 s / 1223, 2.277 M; streaming frames 1703: median 16.8, p95 33.5, 1.6 % over 50 ms, 2 over 100 ms (steady frames: none over 50) |
| the three patches applied to 95e863d itself (the lead's base), `quality=high`, box busy (steady frames median 33 ms): ready / everything streamed | 18.3 s / = ready | 5.7 s / 48.6 s; streaming frames 1756: median 16.8, p95 33.6, 2.0 % over 50 ms, 3 over 100 ms, worst 233 ms; heap 675 MB against eager's 798 MB |
| HEAD 2c8b531 with the patches, `quality=high`, a node suite running beside the first runs (HEAD without the patches: 23.2 s): ready / everything streamed | 15.4 s / = ready | 4.8 s (5.2 s wall) / 32.4 s; streaming frames 1416: median 16.7, p95 33.4, 0.8 % over 50 ms, 2 over 100 ms, worst 167 ms (steady frames: none over 33 ms); heap 696 MB against eager's 839 MB |
| HEAD 2c8b531 again, at 120 ms / 8 Mbit/s, plain server: ready | 46.3 s | 26.6 s; 0 page errors, 0 net errors |
| the newest HEAD f11a4e4 (A2's door-budget WIP) with the patches, quiet box, `quality=high`, HEAD without the patches 20.5 s: ready / everything streamed | 13.7 s / = ready | 4.5 s / 25.6 s; streaming frames 1186: median 16.7, p95 16.9, 0.6 % over 50 ms, 2 over 100 ms, worst 150 ms (steady frames: worst 17 ms); heap 659 MB (eager 635 MB, HEAD without the patches 846 MB); at 120 ms / 8 Mbit/s ready in 27.6 s |
| HEAD 2c8b531 again, `tests/metrics.mjs --views 40`, `quality=high`, against HEAD without the patches | calls +0 (-9..+8), triangles +0.0 % (-0.8..+0.9), cost -0.2 ms (-4.3..+15.6, a loaded box) | calls +0 (-13..+10), triangles +0.1 % (-0.7..+0.7), cost -1.2 ms (-17.7..+3.8); no gate failed |

## 7. Against the targets of the brief

| Target | Result |
|---|---|
| boot to playable <= 8 s (was 15.8 s quiet; 19.4-21.2 s here) | MET at moderate load: 4.8-5.2 s. At 80 % load 5.7-6.9 s (`measure`) and 9.2 s (`slownet.mjs`, over 8 s), where the eager boot took 19.5-23.1 s. |
| slow network (120 ms, 8 Mbit/s) playable <= 30 s | MET, thin: 27.45, 27.5, 27.45 s (gzip), 29.6 s (`slownet.mjs`, loaded box), 26.6 s (HEAD 2c8b531 with the patches). It is bandwidth-bound: 21.3 MB come down before the milestone at 1 MB/s, so the margin is the load. |
| ... everything streamed <= 60 s, 0 net errors | MET at moderate load (51.9 s), NOT at 80 % load (75.9 s: the stream is CPU-bound, 4 ms of each frame). 0 net errors in every run. |
| no frame > 50 ms while streaming | NOT MET: 8-9 of about 1200 frames (0.7 %) at moderate load, 2.3 % at 80 %; worst 126-142 ms at moderate load. Cause: a room's furnisher is one indivisible step of 25-46 ms (A3's code), the people spawn (126-133 ms) and the animals (30-60 ms) are single calls (A4's). The first look into a house is clean: none over 50 ms. A test measures it (`engine-streamframes.test.mjs`). |
| metrics views (calls, triangles, cost) unchanged once built | MET: calls equal at the three benchmark views (1239 / 941 / 1057 against 1243 / 941 / 1057), 40 views of `metrics.mjs`: calls median +0 (-12..+12), triangles +0.2 %, cost -0.7 ms. Stage 3 is part of it (without it +5..+12 calls). |
| memory not higher | MET: JS heap 620-650 MB against 630-818 MB; GPU geometries 2550 against 5613, textures 159 against 236 (the rest is uploaded when first drawn). |

## 8. Tests

New: `core-budget` 4, `core-staged` 7, `engine-latewarm` 14, `interiors-lazy` 7 (node); `interiors-lazy-page` 7, `engine-streamframes` 3 (page); `arch-doors` +1. Each was seen failing first (a sabotage table in scratch breaks one thing at a time; the three
`LAZY_SABOTAGE` switches break the determinism test; the new `arch-doors` test fails with either half of the chunk visibility removed). Round 6 and before: `LADERA_LAZY=1` made `tests/chrome.mjs` boot every la-ladera page through `?lazy=1` and start the test once settled. Since round 7 the harness has three roads, `LADERA_BOOT=eager|lazy|shipped` (section 10); `LADERA_LAZY=1` is kept as an alias of `lazy`. On HEAD 2c8b531 with the patches the page tests that walk into houses give the same results over the lazy road as over the eager one: `interiors-page` 10 / 10 (the TV screens' picture is back there; on the older 95e863d that test was red at 9 / 10), `glow` 9 / 9, `interact-people` 2 / 2,
`furniture-world` 1 / 1, `interiors-lazy-page` 7 / 7 (`quiet-page` opens a document of its own, not the game).
Follow-up (the contents plan waits for the seal, section 2): `interiors-lazy-contents` 2 (node: eager against lazy, the plan, the slot every paper and find lies in and every drawer, 109 buildings; `PLAN_SABOTAGE=early` fails it) and `interiors-lazy-page` now 8 (a second lazy boot whose player walks into a house in its first second: no container wakes before the seal, and `K.contents` compares the settled page's plan, pins and drawers with the eager page's; the teleport test waits for the seal before it expects its drawers); each was seen failing on the code without the wait.
Whole node suite on HEAD 2c8b531 with the three patches applied: 135 files, 1592 tests, 1590 pass. The two reds are on that HEAD without the patches too: `live-paths` "every file the asset manifests name is exact-case and exists" (the substation and beach manifests name files that are not where they say: `signs-uk.png`, `signs-co.png`, the two `substation-plan` json files, `beach.catalog.json`, `beach.sources.json`, `signs-proof.png`; other builders' work), and `people-assets` "the installed bundles ... decoded asset gate" (it fails on any LF export of the tree and passes in the CRLF worktree).
On the newest HEAD f11a4e4 (A2's door-budget WIP commit, which says "7 downstream tests red until A3/A4 land their fixes"): with the patches 136 files, 1599 tests, 1591 pass, 8 red; without them 132 files, 1566 tests, 1558 pass, the same 8 red (the two above and six downstream reds of the WIP, whose commit message announces seven: placement of papers and finds, the bedroom's last resort, a find lies where it can be seen, the day at home, `lookPose`, the three-hour soak). The patches add 33 passing tests and no failure. There too: `interiors-lazy-page` 7 / 7, `engine-streamframes` 3 / 3, `interiors-page` 10 / 10 on both roads, `live-paths` 396 requests and 0 problems on both roads, `tour` lazy (boot, spawn, doors 201 / 201) passes.
The other browser test files on the same tree, eager road: `engine-bootcard` 7 / 7, `engine-warm` 6 / 6, `engine-render` 9 / 9, `engine-heap` 4 / 4, `engine-triplanar` 6 / 6, `engine-streamframes` 3 / 3, `audio-engine` 19 / 19, `ui-flow` 31 / 31 (with the two mouse-capture tests), `ui-reader` 15 / 15, `ui-touch` 5 / 5, `ui-touch-detect` 3 / 3, `quiet-page` 5 / 5, `world-canopy-page` 3 / 3.
Eager `stuck.mjs --cell 0.2` on HEAD 2c8b531 with the patches: 1 011 093 lattice nodes, 4 trap clusters, boundary 0, missing 0, and `trapcheck.mjs` out 2, tight 2 (L45, L93), STUCK 0, misplaced 0, page errors 0: the same numbers and the same two tight spots as on the older tree before the patches. (At the default cell 0.3: 476 589 nodes, no cluster, trapcheck clean.) The sections of the world hash that carry collisions (`furniture-colliders`, `shell-colliders`, `physics`) are identical before and after the patches there. A responsive probe mirroring `tests/responsive.test.mjs` for la-ladera (eager and lazy, 4 cases each: 0 px sideways, nothing under the pill) is clean on the same tree.
Last integration check, HEAD 2c8b531 with the three patches: `live-paths` 396 requests and 0 problems on both roads; `tour` eager all four checks (boot, spawn, doors 201 / 201, talk 6 / 6) and lazy (boot, spawn, doors) pass; `payload.mjs` OK; `slownet.mjs` 26.6 s lazy and 46.3 s eager, 0 errors; `metrics.mjs --views 40` in section 6.

## 9. Not verified

Real-ear audio effects of the late-built interiors (nothing measured: the emitters follow the anchor count); any GPU but the RTX 5070 Ti; touch and mobile in lazy mode; quality `auto` under streaming beyond the run above;
devices slower than the 4x throttle (round 7 did not re-measure the 4x CPU run of section 5, item 8).

## 10. Round 7: the lazy boot is the default (Arthur, 2026-11-03)

**The switch.** `js/main.js`: `lazy = eager !== '1' && lazy !== '0'`. A page that says nothing boots lazy. `?eager=1` (or `?lazy=0`) is the full boot of every release before it and builds the same world byte for byte;
`?lazy=1` is still lazy; `?eager=1&lazy=1` is eager (the explicit full boot wins). A `?manual` page pumps nothing by itself: `await __ladera.settle()` makes the rest now (and brings the whole cast in, below).
`tests/interiors-lazy-page.test.mjs` boots a bare URL, `?eager=1`, `?lazy=0` and `?eager=1&lazy=1` as shipped and checks each against what the page says it is.

**The roads in the harness** (`tests/chrome.mjs` `Page.goto`; `launch({ boot })` and `b.open(path, { boot })` choose for one browser or one page, `LADERA_BOOT` for a whole run):

| `LADERA_BOOT` | what the harness does with a la-ladera URL | the test starts at |
|---|---|---|
| `eager` (the harness default) | a URL that names neither `eager=` nor `lazy=` gets `eager=1` | `ready` (the whole barrio is built) |
| `lazy` (`LADERA_LAZY=1` is an alias) | as written: the shipped boot | `ready`, then `__ladera.settle()`: the barrio is finished |
| `shipped` | as written | `ready` only: the test sees what a visitor sees |

`tests/slownet.mjs` and `tests/metrics.mjs` boot as shipped and take `--eager` for the old road; `tests/tour.mjs` is eager unless `LADERA_BOOT=lazy`; `stuck.mjs` and `trapcheck.mjs` read headless data (`buildData`) and boot
through the harness, so the default does not touch them. Design call (A1; Arthur may reverse it): the harness default stays eager, because those tests were written against a finished barrio (a bare URL in a test is the boot of every
earlier round); flipping it is one line in `Page.goto` (`?? 'eager'`), and `LADERA_BOOT=lazy` already runs the page tests over the shipped road.

**The defects every visitor would have seen, fixed first (R3-210, R1-107).** After the milestone the street stood empty, its shutters down, for 75-90 s on a loaded box, and then all 86 people came at once. Cause: the `people` unit
needed `interiors-data`, because the cast reads every anchor of every building (`Spots`) and a keeper needs his shop's furniture, and the data pass is slow (68 % of it is the bedrooms' bed packing, `rooms.js` `repackBedsSteps` /
`fillBedsSteps`). Now:
* `people` needs only `people-pack`. `spawnPeople(ctx, { progressive: true })` makes the cast (`PeopleSim.build(..., { progressive: true })`: every person exists, nobody is placed, no shop is made) and `main.js` makes
  every rig, hidden, a few a frame (`prepareViews(5)`; 86 of them are about 110 ms in one call).
* The people come into the barrio as `PeopleSim.pumpCast` finds them ready: the arrival cohort of the first view (`pickArrivals`) first, then the nearest to the arrival point. Who is ready: everybody but a shopkeeper at
  once (a street, a bench or a door that hides them needs no furniture); a shopkeeper when his shop's building has its data (`onLotData`, on `interiors:data`). `onLotData` adds the building's anchors to `Spots`
  (`addAnchors`: each anchor once, by identity), has `homelife` and `classroom` read the building again (`forget`) and queues the shop (`_makeShops(plan, lot)`: its door, the keeper's post, the customers' spots; it puts the shutter up).
* The feed is a slice of every frame (`people/world.js`, system `people-cast`, order 7.2, before the late warm (7.5) and the interiors (8), so the interiors do not starve it; 3 ms in play, 8 ms on the card), taken
  from the streaming budget, and a rAF / timer driver while nobody plays. The `people` unit ends with `await world.whenAllIn()`: `settled` still means everybody and every shop is in.
* The interiors' stream follows what the street shows (`lazy.js` `_pick`): urgent; what the player sees into (within `SEE_M` = 28 m), nearest first, a building's data and then its meshes; the data of every shop, nearest
  first, wherever it stands (a shop's data is its keeper and its open shutter); the data of the houses within `NEAR_M` = 60 m; their meshes; the data of the rest; the far meshes last. In Node, on 7dbc7c48, over the real data steps of the 108
  data jobs (`ring-cost`): the 28 shops are 25 % of the data work (12.6 of 51.4 s of CPU), the last shop is made after 31 % of the pass (56 % under the round-6 order); counting steps instead of time (`ring-probe`: one fake step for each data job and each mesh job, 217 in all), the last shop is made by step 49, against step 141 under the round-6 order.
Tested in Node (`tests/people-progressive.test.mjs`, 6 tests; the order test in `tests/interiors-lazy.test.mjs`) and in the page (`tests/interiors-lazy-page.test.mjs`). Each was seen failing first: `PROG_SABOTAGE=early|order|noshop|noanchors`
(a shopkeeper let in before his shop, the arrival order lost, no shop made, no anchors added) each fail the test that holds the property; `LAZY_SABOTAGE=order` (the round-6 order) fails the order test ("every shop's data is in before the data
of any house outside the ring ... (last shop 63, first house 31)"); with the round-6 order the page's teleport test fails too (the last shop furnished as number 36, a house outside the ring as number 1) and on the old default
the bare-URL test fails (`no lazy= and no eager=: the boot is lazy`).

**R2a-104, how long the stream takes.** The frame's streaming slice was a fixed 4 ms (`STREAM_MS`). `core/budget.js` `streamAdapt` (called once a frame from `engine/index.js`) now lets it rise to `STREAM_MAX_MS` = 6 ms
while the frames have the time to spare: the cap is 70 % of (the display's frame interval less the smoothed cost of the frame without its streaming) less 1 ms, between 4 and 6. A machine that draws a frame in 5 ms streams at 6
ms, one that needs 10 ms or more stays at 4, and a 120 Hz display practically never has the time to spare, so the machines that hitched before still get the floor. The cast shares this budget and takes its 3 ms first. The rest of
the length is work, not scheduling: the data pass is 68 % bed packing (follow-up 1).
**Measured, and it does nothing here.** `cap-probe` runs the real animation loop (no `?manual`): one boot, then the player at the spawn and in six buildings, 5 s each, the stream still running; two runs of each tree on 7dbc7c48, alternated, the patched tree against the same export booted with `?lazy=1` (a fixed 4 ms), the box at 49-55 % CPU.
The cap sat at 4.00 ms at the median in all 14 place-runs of the patched tree (its highest value in any frame: 5.92 ms in one kiosk run, 4.10 in one school run) and the stream's spend per frame is what it is with the fixed cap, 4.6-5.4 ms at the median against 4.8-5.6 (inference: the step that crosses the cap finishes, so the spend overshoots it).
Why it never left the floor: the frame's smoothed cost without its stream (`ctx.streamWork`) was 16-28 ms in eleven of the 14 place-runs and 9.2, 9.5 and 11.5 ms in the other three (a school once, the kiosk twice), and the formula needs it under 9.5 ms at 60 Hz to leave 4 ms and under 6.7 ms to reach 6. In those three the display-interval estimate (`ctx.streamRefresh`, the shortest recent frame interval)
read 4.7-7.9 ms against a median interval of 17-18 ms (inference: this headless box delivers frames back to back after a long one), but with the interval right the formula gives 4.0, 4.5 and 5.0 ms there (computed from the logged values, not measured): the estimate is not what holds the cap down on this box, the frame's own work is. Not shown: a machine whose frames cost under 7 ms, or a real display with vsync.

**R2a-005, the heap.** There is no retention in the JS heap to remove, and the patch changes nothing in it. `performance.memory.usedJSHeapSize` counts the garbage a major collection has not taken yet, and a page that streams for two
minutes with no idle time gets few collections. After a forced collection (CDP `HeapProfiler.collectGarbage`) the live heap is 115-119 MB on every road: 117 MB patched lazy, 115-117 MB old `?lazy=1`, 119 MB eager (patched or not). Round 6
(`handoff/r6/r6-4`) measured 111 MB on the lazy boot the same way and listed what the live set holds (three.js objects 33 MB, the interiors' layout 13 MB, physics walls 9 MB: none worth cutting).
The figure a review reads at `settled` is a point on a saw-tooth: 762-843 MB patched lazy, 811-913 old lazy, 665-845 eager (the ranges overlap), and ten seconds later 248-300, 265-393 and 137-246 MB with nothing released by the code. The peak is higher on the
lazy roads (patched 980-1034 MB, old lazy 931-956, eager 827-874): the same garbage is made over two minutes of busy frames instead of behind the loading screen (inference; the patched run also makes the cast's rigs in that window, not isolated).
The memory that matters is not in this number: three.js keeps the CPU copy of every uploaded geometry (422 MB of typed arrays in round 6's measure; the same geometry is built on both roads, only later). Freeing those is a task of its own
(round 6 proposal: who reads each group's arrays after its last build, free group by group, a test that sums the attribute bytes); it was not started here. A review should count the live heap after a collection, plus the renderer's working set.

**Measured** (`?autostart`, headless Chrome from `tests/chrome.mjs`, `LADERA_PRIO=idle`, 1280x720, `quality=auto`, the RTX 5070 Ti; the box ran at 35-70 % CPU for all of it, other builders' browsers and node runs sharing it, so the runs were taken back to back
and every column has several; read them as ranges on a loaded box, not as the quiet-box timings of sections 1 and 6). "Old default" is the tree before this round with no flag, "old lazy" the same tree with `?lazy=1`, "new default" the patched tree with no flag,
"new eager flag" the patched tree with `?eager=1`. Seconds are counted from the page's own `ready` (`__ladera.bootMs`), because the script that polls the page sees `ready` late when the page is busy; `0.0` is "already in when the page said ready" (the eager boot
builds the whole cast behind the loading screen). Tools: `measure.mjs` and `table.mjs`, kept with the round-7 handoff (A1's scratch), not in the repo.

| | old default (eager) | old lazy | new default (lazy) | new eager flag |
|---|---|---|---|---|
| runs | 2 | 4 | 3 | 1 |
| boot to PLAYABLE, page seconds | 44.1 - 55.3 | 6.2 - 37.8 | 7.1 - 12.8 | 42.0 |
| people in: first / half / all (s) | 0.0 / 0.0 / 0.0 | 98.8 - 254.8 / 98.8 - 254.8 / 98.8 - 254.8 | 1.4 - 4.6 / 1.6 - 4.8 / 50.4 - 67.3 | 0.0 / 0.0 / 0.0 |
| shops open: first / half / all (s) | 0.0 / 0.0 / 0.0 | 98.8 - 254.8 / 98.8 - 254.8 / 98.8 - 254.8 | 4.4 - 7.1 / 34.1 - 42.3 / 50.4 - 67.3 | 0.0 / 0.0 / 0.0 |
| data sealed / all drawn / settled (s) | - / - / - | 98.8 - 254.8 / 112.6 - 270.8 / 113.0 - 271.2 | 126.1 - 180.9 / 135.9 - 196.8 / 136.1 - 197.1 | - / - / - |
| JS heap MB at ready / at settle / max | 665 - 845 / 665 - 845 / 827 - 874 | 259 - 379 / 811 - 913 / 931 - 956 | 276 - 386 / 762 - 843 / 980 - 1034 | 872 / 872 / 898 |
| JS heap MB 10 s after settle / live after GC | 137 - 246 / 119 | 265 - 393 / 115 - 117 | 248 - 300 / 117 | 288 / 119 |
| frames while streaming: median / p95 ms, > 100 ms | (no stream: the eager boot is finished at ready) | 18.0 - 20.2 / 36.3 - 69.2, 0.2 - 2.6 % | 18.2 - 34.9 / 37.1 - 55.0, 0.3 - 1.5 % | (no stream) |
| frames after settle (steady): median / p95 ms | 18.1 - 34.8 / 36.9 - 55.4 | 18.0 - 35.2 / 36.1 - 55.6 | 17.7 - 18.2 / 18.7 - 37.2 | 18.1 / 37.2 |
| stream spend per frame p50 / p95 (ms) | 0.0 / 0.0 | 5.0 - 5.1 / 9.3 - 12.4 | 5.0 / 9.4 - 10.1 | 0.0 / 0.0 |
| errors / net errors / console errors | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

What the table says: a visitor's first person is in 1.4-4.6 s after the game is playable, half the cast in under 5 s, and every shop is open and every person in 50-67 s (old `?lazy=1`: 99-255 s, all at once); the eager boot is as it was
(`?eager=1` is the old default within the spread of the box). The time to the end of the stream (136-197 s here against 113-271 s for the old `?lazy=1`) did not move: it is the data pass (follow-up 1), and the stream spends 5 ms of a frame at the median on both.
The old `?lazy=1` row has a 37.8 s boot (one outlier on the loaded box). The patched default has two more attempts that are not in the table: the first lost its page load to the harness's 60 s `readyState` wait on a busy box (the harness now tries the
navigation twice), the second had not settled after the 420 s the tool then allowed (the tool now waits 900 s and records a timeout instead of throwing); the three that are in the table settled in 136-197 s. I could not show the cause of the second one
(no timeline was kept).
The table was measured on this round's snapshot trees, which predate A4's landed commits. One more run of the new default on the rebased tree (origin/main ae74b2d9 with the patch, same tool, one run): playable at 6.5 s of the page's clock (7.3 s by the polling script), first / half / all people at 0.9 / 1.4 / 60.2 s, 28 of 28 shops open, settled at 174 s,
live heap after a collection 118 MB (264 MB ten seconds after settle, 1 040 MB at the peak, 6 MB above the table's range), frames while streaming median 18.6 ms, p95 41.8, 51 of 5 758 over 100 ms, the worst 4.6 s (steady: median 18.2, the worst 0.99 s), 0 errors; the rest is inside the table's ranges.
The 4.6 s frame may be mine: a second browser of mine (a probe I had queued behind this run by mistake) started for 25 s inside the streaming window; I did not isolate it.
**Not in any of these numbers: the vegetation library** (origin/main bdcc0727, the instanced plant models in `mixed` mode), which landed after the last run. It loads its assets in `buildProps` (before the milestone: `vegetation-assets`) and runs a `vegetation` system at order 8; the lazy boot was not
measured with it, so the boot-to-playable and streaming figures here are those of 7dbc7c48 and older trees. The library is neutral to the staged queue by design (it adds no unit); what it costs the milestone and the frames is for the next measurement.

**What shops first costs.** The round-6 order made the nearest building first. The new one makes what the player sees into first (within 28 m), then the data of all 28 shops wherever they stand, then the houses within 60 m (`lazy.js` `_pick`). The shops are a quarter to a third of the data work (30 % in the first measure, 25 % on 7dbc7c48: 12.6 of 51.4 s of CPU in Node), so the
houses between 28 and 60 m of the player wait behind them. Measured with `lazy-stall-probe` (the loop of test 2 of `interiors-lazy-page`: the player stands at the spawn, one step per call, until every building within 60 m is made; 12 buildings; two runs of each tree, alternated, on an LF export of origin/main
7dbc7c48: with this round, and the same export without it booted with `?lazy=1`, the round-6 order): all 12 are made after 1 923 and 1 783 frames on the new order and after 541 and 557 on the old (3.2 to 3.6 times as many; 34-39 s of the probe's wall clock against 14 s). The first pairs of this round (ae74b2d9 with the patch against the
round's start snapshot, which is not the same commit without the patch: 39 files differ from 7dbc7c48) gave 1 747, 1 737 and 1 797 frames against 525, 523 and 515, the same ratio. What the new order buys is in the sections above: the last shop is
made at 31 % of the data pass instead of 56 % on 7dbc7c48 (36 % and 57 % in the first measure), by step 49 of 217 instead of step 141, and the street's shops are all open and its people in by 50-67 s. A player who reaches a house that is not made yet is not blocked: the door waits for it and opens when it is ready (`interiors-lazy-page` test 3), and a teleport
makes it in the call (test 4); the probe walks into no house (`ensured: 0`), so I have no measure of how often that happens in play. Which order ships (shops first, nearest first, or something in between that I have not built, such as one house for every three shops) is Arthur's call; the order lives in `_pick`, and two tests hold it: the order test of `tests/interiors-lazy.test.mjs` and the teleport test of `tests/interiors-lazy-page.test.mjs` (both go red under the round-6 order, section 10 above).

**Stalls.** The first runs of the loop on the patched tree saw multi-second calls: in `r3c-stall` (two runs on the box's usual load) one call of 2.6 s of which 187 ms was spent in any system, then in the second run 3.8 s and 2.2 s inside the `interiors` system 26 calls apart (the manager's longest step 3 833 ms)
and a first call of 1.2 s in `look`; the red run of `interiors-lazy-page` test 2 had a call of 2.5 s. The old tree was not run in that window. Seven alternated pairs followed, the same probe, the patched tree and the old one back to back, one browser at a time: three on ae74b2d9 and two on 7dbc7c48 against the round's start snapshot (not the same commit without the patch: 39 files differ from 7dbc7c48,
so those pairs also hold the work of the commits in between), and two on 7dbc7c48 against that same commit without the patch (`r5-stall-*`; the box's mean CPU 49-55 %). Over the seven runs of each tree: calls over 100 ms, 14 of 15 415 on the patched tree and 6 of 6 495 on the old (0.09 % on both); calls over 250 ms, 3 on the patched tree
(370 ms and 726 ms in one run, 296 ms in another) and 1 on the old (336 ms). In the last two pairs, the only ones whose control is the same commit: the longest call 296 and 209 ms patched against 336 and 234 ms; p50 6.7 and 6.4 ms against 6.1 and 6.1; p99 40.7 and 31.3 against 39.1 and 38.8; the manager's longest step 295 and 206 ms against 45 and 233 ms.
The patched tree runs 2.3 to 2.5 times as many calls (the near houses come later, above), which is part of the difference. What the long calls are made of is the same on both trees: one indivisible step of the `interiors` system (A3's data or mesh work: 111, 181, 206, 233 and 295 ms; the manager keeps the length, not which job), `arch-doors` (68 and 88 ms)
and `interact.update` (`core/interact.js`, called by the player system: 208 ms on the old tree, told apart by timers inside the player system; two patched runs had 199 and 365 ms in the player system at 13.6 and 13.7 s into the loop, before those timers were there). In two of the eight slow calls of the last pairs the JS heap drops by 20-28 MB (a collection ran inside
the call), in the others it does not. None of these is code of this round: the old tree has all three kinds. What I cannot say is what the 2-4 s calls were, nor the one call of 726 ms that was outside every system (57 ms in any): a process that was not running looks like that (inference: the box was at 45-69 % CPU with other builders'
browsers on it), but that one was seen on the patched tree only (one in 7 runs against none in 7), and I cannot rule out something of the patch that the later runs did not reproduce. No step of the code runs that long (the longest the manager reports is 295 ms).

**Stalls, what they were (the rebase onto f2d42524).** The ceiling of `interiors-lazy-page` test 2 (no call of a frame over 250 ms of the clock) failed on a tree of f2d42524 + this patch + A3's uncommitted interiors work: twice, on calls of 310.3 and 387.3 ms (p95 18.7 and 22.8 ms), and a third run did not get past loading the page (60 s). Clean exports of f2d42524 + this patch passed it: the file 9 of 9 (263 s) and the test alone 3 of 3 (longest call 53, 152 and 145 ms by the clock, the manager's longest step 48, 149 and 150 ms; the 12 buildings of the radius made after 1 728, 1 778 and 1 908 frames).
The failing runs had passed every order assertion before the ceiling (the last shop furnished before the first house outside the ring, the last house of the radius before the first beyond it), and **no step was a whole interior**: in plain Node over the real data steps (`step-costs`: 16 720 steps, 109 buildings) the longest is 137 ms on the failing tree and 148 ms on the clean one, the pass 34.9 s and 34.6 s of CPU.
**The long calls are waits, not work.** The same tree that had been 9 of 9 before (bdcc0727 + this patch) failed the same assertion twice in a saturated quarter hour (a call of 3 765 ms, the manager's longest step 3 763 ms, p95 111.5 ms against 13; the second run's page did not load); an idle-priority renderer on a box with every core busy does not run, and `LADERA_PRIO=idle` makes it the first to be held. A reading of the renderer's CPU shows it (the process's count, this pass's first instrument, which is at least what the main thread did): on the failing tree one run passed with ten calls over 250 ms of the clock, the longest **54 817 ms with 134 ms of CPU**, the others 4-77 ms of CPU; a passing run on a clean tree had `443.7 ms (10 ms of CPU), 313.5 ms (85 ms of CPU)`. (The 2-4 s calls of the first stall runs above are the same thing, as far as one can tell: inference, those runs had no CPU reading.) On a quiet box nothing in the loop is long: the longest call is 40 ms on a clean tree and 51.9 ms on the lead's, the manager's longest step 46.6 and 54.3 ms (the 149 and 150 ms of the clean runs above are clock readings of busier moments: inference); seven calls of 155-301 ms of the clock on a loaded box (three probe runs, `tools/step-probe2.mjs`), each holding one data step of 154-247 ms, read 17-47 ms of CPU (the process's).
So test 2 holds a call to the CPU it used, not to the clock. `tests/chrome.mjs` `launch().cpuSampler(ms)` samples the CPU of the page's main thread every 25 ms (`ThreadTime` of CDP `Performance.getMetrics`: the thread's own cycles, cumulative) and the pure `cpuBetween(samples, t0, t1)` turns the samples into the CPU of a stretch of time (`tests/chrome-cpu.test.mjs`: four tests of the arithmetic, each seen failing under three breaks of it, and one on a blank page that reads a fixed loop, a wait and a Worker's loop). A call that took 250 ms or more of the clock (what the old test failed) must have used under 250 ms of CPU: the ceiling is the old number, measured in work instead of waiting. Where the CPU cannot be read, the clock decides, as before. A call that blocks the main thread is answered when it ends, so its CPU is read across it, with a few ms of its neighbours: the figure is good to a few tens of ms.
It is the thread's CPU, not the process's (`SystemInfo.getProcessInfo`, the first instrument of this pass), because a renderer has other threads (V8's collectors and compilers, the compositor) that work while the main thread waits, and the process's count adds them in: on a blank page a Worker's loop of 300 ms read 302-304 ms of process time against 1-2 ms of thread time (`tools/thread-probe.mjs`), and one run on the lead's tree read 473 ms of process CPU for a call of 425 ms in which, by inference, no step ran for more than 50 ms (the heap across the call was not recorded then; the test now prints it for every call it lets through: a drop is a collection that ran inside). The process's count also read 0 ms for a loop of 150 ms in the blank-page test of `chrome-cpu`, which fails under it. The faults are fixed loops, not spins of the clock: a fixed loop costs the same CPU however long the box holds the thread (`tools/burn-calib.mjs`: 1e8 steps cost 75 ms, 2e8 149 ms, 3e8 223 ms, 4e8 303-399 ms of thread CPU). Seen: a loop of 4.3e8 steps in the fifth mesh step fails the test (a call of 432.8 ms, 405 ms of CPU), so does one of 3.6e8 (357.7 ms, 337 ms); the renderer held with `NtSuspendProcess` (no CPU, the clock runs on) passes it (three calls of 3 013.7-3 025.9 ms in the loop, 3-11 ms of CPU each), where the clock alone fails it.
One more count of that test was the box's too: after the radius is made it steps on 400 frames and asks for 10 houses beyond it with their data, which the stream reached with a margin of one (11-12 in quiet runs, 10 in the starved one above, with the same code: how many steps a frame gets in is the box's). It now steps at least 400 frames and until 14 such houses have their data (4 000 frames at most), so the count asked of it no longer depends on how many steps a frame gets in. Seen: on a stream a third as fast (two calls of three do nothing) the old tail fails the count (3 houses beyond the radius, where 10 are asked) and the new one passes (the 12 buildings of the radius after 5 294 frames, the 14 houses beyond it after 1 356 more); on a stream that never leaves the radius the cap ends the tail after 4 000 frames and the count fails it (0 houses beyond).
What this does not change: the work of a data step is held in poses by `tests/interiors-stepcost.test.mjs`, machine-independent; on a quiet box the longest step of the loop is 47-54 ms and the longest call 40-52 ms, a fifth of the ceiling. Other tests that hold a wall-clock number (`engine-streamframes`, `metrics`) are as sensitive to a busy box as before, and a page that does not finish loading in the harness's 60 s on a saturated box fails whatever the test holds (`LADERA_LOAD_MS=240000` gives it four minutes; the default is unchanged; six page runs of this pass died there on that box).

* **Worst frame while it streams** (`tests/engine-streamframes.test.mjs`, run alone; it needs a quiet box and I did not change it). The last pair: 7dbc7c48 with the patch, then the same export booted with `?lazy=1`, back to back, the box's mean CPU 52 % and 50 % (both include the test's own browser): **1 of 3 on both trees.**
  Patched: 6 197 frames in 187.5 s, median 22 ms, p95 47.7, 65 frames over 100 ms (the test allows 62), 20 over 250 ms, the worst 768 ms; streaming spend p50 5.1 ms, p95 11.2, 5 frames over 60 ms, the longest single step of the interiors 470 ms; steady after settle: median 17.9 ms, 5 frames over 100 ms, the worst 192 ms.
  Control: 5 967 frames in 147.4 s, median 18, p95 38.4, 47 over 100 ms (allowed 60), 18 over 250 ms, the worst 699 ms; spend p50 5.1, p95 11.5, 11 frames over 60 ms, the longest step 452 ms; steady: median 18.1 ms, none over 100 ms, the worst 64 ms.
  Both fail the spend assertions (frames over 60 ms of spend, the 200 ms ceilings on the worst frame and on the longest step) and the one on frames over 250 ms; the patched tree also misses the over-100 count by 3 frames (1.05 % of its window against the 1 % allowed). What differs is the window: its median frame is 4 ms longer (22 against 18: the street has its people in it, as in the cap probe),
  and it ran 187.5 s against 147.4 s (both inside the ranges of the table above). A step of 450-470 ms is in both trees; the tail (frames over 250 ms, the worst frame) is the same on both within one run each. The steady window's 5 long frames on the patched tree, against none, I cannot separate from the box or from a collection of the 760-840 MB heap right after settle (inference: R2a-005); I did not repeat it.
  An earlier pair, in a quieter window (box 35 % for the patched run, 57 % for the old one; the old tree was the round's start snapshot, not the same commit): patched 3 of 3 pass, 5 217 frames in 114 s, median 18.1 ms, p95 36.2, 10 frames over 100 ms, the worst 242 ms, none over 250; old tree 2 of 3, the third "2 frames over 250 ms (the worst was 420 ms)": 5 561 frames in 125 s, median 18.1, p95 36.8, 22 over 100 ms.
  In busier windows (box at 60-80 % CPU) the test fails on both trees (patched 53 and 24 frames over 250 ms in two runs, old 50 in one).
* **Render cost once settled** (`tests/metrics.mjs --views 10`, boots as shipped, quality auto, 1920x1080; 7dbc7c48 with the patch, which boots lazy, against the same export without it, which boots eager; alternated, two runs of each, the box at 55-56 % CPU in the last pair, with other builders' browsers on it; the first patched run is the one with a 20 s soak:
  22.5 simulated seconds, 0 stuck, 0 NaN, 0 falls). Uncapped render cost per view, mean / median / max (ms): patched 17.1 / 15.9 / 24.1 and 15.6 / 15.0 / 22.6, control 15.5 / 16.1 / 20.3 and 15.1 / 16.0 / 19.7; best of five repeats per view, median / max: patched 15.8 / 18.1 and 14.3 / 17.6, control 14.8 / 19.4 and 14.5 / 19.1;
  views over the 16 ms gate: patched 5 and 3 of 10, control 5 and 5; the largest draw-call count 1 235 and 1 236 patched, 1 257 and 1 257 control; boot to `ready` 13.4 and 32.4 s patched, 58.2 and 52.7 s control (over the tool's 40 s gate both times). **The 16 ms cost gate fails on both trees on this box.** The patched mean is 1.5 and 0.4 ms above the control run beside it,
  and the two patched runs differ from each other by 1.5 ms (the two control runs by 0.4), so two runs each do not separate the patch from the load. One view is higher in both patched runs: `street-n370`, best of five 16.4 and 16.6 ms against 14.9 and 13.0 on the control (848 and 855 draw calls against 857 and 856); the other nine are within the spread between runs of one tree, or lower
  (`spawn`, best of five 17.6 and 17.6 against 19.4 and 19.1). Across every metrics run I have that has the view (four of the patched lazy road and four of the old eager one, on the snapshot trees and on 7dbc7c48) its best of five ranges from 11.7 to 18.9 ms on both roads (patched 11.7, 12.0, 16.4, 16.6; control 13.0, 14.9, 17.0, 18.9,
  the last in a window where the box was contended), so the gap of the last pair is inside the spread between runs and I do not take it for a finding (inference; no run was aimed at that view). Once settled the scene is the same one on both roads, so no difference is expected (inference).
* **slownet** (latency 120 ms, 8 Mbit/s, `?autostart`, plain server, 0 page errors and nothing logged in every run; one run each): playable after 31.8 s on the patched default (settled after 239 s), 28.2 s on the old `?lazy=1`, 50.6 s on the
  patched `?eager=1`, 59.1 s on the old default (eager). The default's milestone is the old lazy one (this round touches nothing before it), so 31.8 against 28.2 s is the spread of a loaded box, not a cost: one run each cannot separate them.
  What changed for a visitor on that line is the 59.1 s wait (the old default) becoming about 30 s.
* **Payload gate** (`tests/payload.mjs`): PAYLOAD OK, shipped total 65.7 of 150 MB, models 34.6 of 40 MB, textures 27.8 of 40 MB, estimated GPU texture memory 505 of 800 MB (the cap on models is 40 MB from 958d0ec; nothing shipped changed in size by this round).
* **Tour** (`tests/tour.mjs`): eager road boot 54.3 s, spawn, doors 201 / 201, talk 6 / 6, all pass; lazy road (`LADERA_BOOT=lazy`, ready plus settle) boot 57.9 s, spawn, doors 201 / 201, talk 6 / 6, all pass.
* **Responsive** (the la-ladera cases of `tests/responsive.test.mjs`, 390x844 and 768x1024, loading and playing): 4 cases, 0 px sideways, nothing under the pill.
* **Stuck, trapcheck** (`tests/stuck.mjs --cell 0.3`, the page's world, jump arcs on, idle priority, 2 753 s; then `tests/trapcheck.mjs`; on origin/main ae74b2d9 with this round, a tree `stuck.mjs` reads through `buildData`: none of the 23 files is on its import path, so this checks main and
  not the patch): 472 555 lattice nodes, 3 621 123 edges, 2 trap clusters, boundary 0, missing 0 (exit 1 is the lattice's count of trap nodes, 758, as in round 6). They are the two clusters of round 6's baseline (A3's `06-NOTES`, the lead's run and the patched one: the same 758 nodes): a 754-cell, 67.9 m2
  outdoor basin at (3.2..16.8, 20.9..31.8), y 8.8 to 11.35, and 4 cells (0.4 m2) in L75 at (35.5, -2.4), y 17, the niche behind the shower of a 2.02 x 1.83 m bathroom. `trapcheck.mjs` with the real controller: out 1 (the basin), tight 1 (L75, best 1.58 m), STUCK 0, misplaced 0, page errors 0.
  The 0.2 m sweep of the earlier runs of this round did not finish (500 000 of about 1 070 000 nodes inside the tool's 1 500 s bound, and 50 000 in 16 minutes on the loaded box), so the 0.3 m sweep of rounds 5 and 6 is the one that was run.
* **Page tests over the shipped road**: `interiors-lazy-page`, `interiors-lazy-hud` and `interiors-lazy` pass, and `glow` + `furniture-world` with `LADERA_BOOT=lazy` pass (10 of 10); the Node suite of the people, interiors and core tests passes 357 of 357.

**Follow-ups.**
1. The data pass (and with it the drawers' wake, which waits for the seal, section 5 item 9) is mostly one function: the bedrooms' bed packing, `rooms.js` `repackBedsSteps` / `fillBedsSteps` and under it `layout.js` `_make`,
   `connectivity`, `wallPoses`, `_wallCands`, `inMainRegion`, `_frontZone`: 68 % of the data pass in a profile of the lazy boot (A3's files). Halving it would shorten the stream more than any budget.
2. A spot made before the seal keeps the anchor's id of that moment in `spot.id` (`_seal` renumbers `ctx.anchors` into the eager order afterwards); the debug description of a scene (`people/world.js` `describe`) is its only reader.
3. Comments elsewhere that name `?lazy=1` stay true (it is still lazy); they were not rewritten.

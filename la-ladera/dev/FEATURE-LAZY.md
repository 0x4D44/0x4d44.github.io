# FEATURE-LAZY: lazy interiors and staged packs (`?lazy=1`)

Owner A1. Boot-to-playable was 15.8 s on the quiet box, of which furnishing every one of the 109 buildings (6.5 s), drawing every interior (about 2.2 s of the 3.1 s `build` stage) and a warm-up
frame over all of it (3.7 s) were the part nobody sees until they walk into a house. `?lazy=1` ends the boot at a PLAYABLE milestone and streams the rest in behind it. The default boot is
still the eager one and builds the same world byte for byte (with the two cheap wins of section 1, which make it faster too); the tests, `stuck` and `trapcheck` stay on it. Nothing in this file changes what a player sees once the barrio is built.

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

| Reader | Reads | Under `?lazy=1` |
|---|---|---|
| Physics colliders | shell walls and floors; furniture blockers (`bp.colliders.walls` from `interior.walls0` on) | shells at the `colliders` stage (`InteriorManager.addShellColliders`); a building's furniture blockers join when its data is done (`_dataDone`). The player cannot touch a building whose data is not done: door, teleport and the frame's safety net make it first |
| Street nav graph | the plan only | unchanged |
| People (schedules, seats, in-house routes) | `ctx.anchors` (`Spots`), `bp.interior.hh`, rooms | the `people` unit waits for `interiors-data` (every building furnished and sealed). `_seal` puts `ctx.anchors` in the eager order and renumbers `a<N>` before they read it |
| Anchors, audio emitters | `ctx.anchors`; `audio/engine.js` re-keys its emitters on the anchor count | the list grows as buildings are done; the emitters follow the count |
| Discoveries registry, journal, map pins | `ctx.discover.items`, `total` | texts are chosen against what earlier buildings used (`stories.js interiorStoryUse`), so a cursor makes them in building order, only over buildings whose data is done. `total` is partial until `sealed` (`ctx.discover.settled`, `totalLabel` = `…`). Same set, same texts as eager (tested) |
| Containers (drawers), contents plan | meshes of the interior; `planContents` reads the FURNISHED slots of every household of every building (`contents.js kindsByHousehold`: `bp.furniture` and the room layouts, so that no more papers and finds are planned than a household has slots for) | a building's containers wake on the 4 Hz scan once its interior is shown (ready) AND the data pass has sealed (`containers.js dataSealed`: `ctx.interiors.sealed`). The plan is made once, at the first wake, and a building not furnished by then is planned without a limit. Measured (node, 109 buildings): a first wake with 2 buildings furnished planned 184 of 291 households differently from eager (65 items left without a slot, 20 buildings with no paper in a drawer, 240 of 2073 drawers holding other things), a first wake with 30 furnished 157 households (45 items, 11 buildings, 205 drawers). From the seal on the plan, the pins and every drawer are eager's (tested) |
| Interact registry | `int:` items (furniture, seats), doors, `cont:` | `int:` items register with each building's data; the SET equals eager's, ids differ only in the seat counter `sita<N>` (follows the order the data was made in) |
| `__ladera.buildings()` / `enter(id)` | plan fields, entrances | `enter` makes the interior first (`ensure`); a probe walks into a furnished room, never a bare one |
| Map, signs | plan, footprints, exterior | exterior and signs are built at the milestone, not lazy |
| Lights pool, glow | `ctx.lights.list`; glow takes only `street` lights at `finalize` | interior lights register as data is done; the pool picks the nearest, glow never held interior lights |
| `stuck-lib`, `trapcheck`, plan oracle | headless data, `buildData` | eager by default; `?lazy=0` is the same code path as before |

Determinism: `furnishSteps` and `buildInteriorSteps` are resumable generators; `furnishBuilding` / `buildInterior` run them to the end (eager). layout.js's id counter belongs to the job (saved and put back at every
step: `getUid`/`setUid`). `tests/interiors-lazy.test.mjs` boots eager and lazy (rooms, furniture, discoveries, anchors, lights; shuffled build order too) and requires the same world; three sabotages
(`LAZY_SABOTAGE=cursor|uid|seal`) show it fails when the cursor, the counter or the seal is broken. The contents plan is made once, so it is held back until the seal:
`tests/interiors-lazy-contents.test.mjs` compares the plan, the slot every paper and find lies in and what every drawer holds with the eager boot's (`PLAN_SABOTAGE=early` takes the wait away: it fails), and
`tests/interiors-lazy-page.test.mjs` does the same in the page (`K.contents`).

## 3. Lazy interiors

`js/interiors/lazy.js` `InteriorManager`: one job per building with a DATA state (furnishing) and a MESH state (geometry), both resumable. A frame spends at most `STREAM_MS` (4 ms in play, 12 ms while nobody plays)
on streaming, shared with the warm-up of what was added (`js/core/budget.js`); a step that overruns is a room's furnisher (the one indivisible piece, 25-80 ms). The order: urgent (`need`), the building
under way, then the nearest within `NEAR_M` = 60 m (data, then meshes), then the far data pass, then the far meshes. An interior is `ready` when its meshes are in AND warm (programs built, textures up:
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

1. People appear about 17-18 s after the milestone (measured on the fast boot and at 120 ms / 8 Mbit/s alike: the data pass of the interiors is the gate, they need every anchor), not before it.
   A player who waits at the arrival point sees the street empty for that long. Alternative: spawn a first batch (the five arrival NPCs) early; not done, it needs A4's sim.
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
9. The drawers, wardrobes and cupboards wake only after the data pass has sealed (about 17-18 s after the milestone on a quiet box, the moment the people appear: item 1), not when their house is shown. The
   contents plan is ONE plan for the barrio and reads every building's furnished slots (section 2), so a wake earlier would make it from a barrio that is mostly bare and the drawers would hold other things
   than eager's. A player who walks into a house in those first seconds finds the furniture there and its drawers not yet offered; they wake the moment the pass seals. On a CPU four times slower the pass
   does not seal within 14 minutes (item 8: inference from that run, not measured for the drawers), and there the drawers wait as long as the people do. If that matters, the pass could take the frame's whole
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
`LAZY_SABOTAGE` switches break the determinism test; the new `arch-doors` test fails with either half of the chunk visibility removed). `LADERA_LAZY=1` makes `tests/chrome.mjs` boot every la-ladera page through `?lazy=1` and start the test once settled (a page that names `lazy=` keeps it; the switch was seen to work: `interiors-lazy-page`'s eager-default test fails
under it until it says `lazy=0`). On HEAD 2c8b531 with the patches the page tests that walk into houses give the same results over the lazy road as over the eager one: `interiors-page` 10 / 10 (the TV screens' picture is back there; on the older 95e863d that test was red at 9 / 10), `glow` 9 / 9, `interact-people` 2 / 2,
`furniture-world` 1 / 1, `interiors-lazy-page` 7 / 7 (`quiet-page` opens a document of its own, not the game).
Follow-up (the contents plan waits for the seal, section 2): `interiors-lazy-contents` 2 (node: eager against lazy, the plan, the slot every paper and find lies in and every drawer, 109 buildings; `PLAN_SABOTAGE=early` fails it) and `interiors-lazy-page` now 8 (a second lazy boot whose player walks into a house in its first second: no container wakes before the seal, and `K.contents` compares the settled page's plan, pins and drawers with the eager page's; the teleport test waits for the seal before it expects its drawers); each was seen failing on the code without the wait.
Whole node suite on HEAD 2c8b531 with the three patches applied: 135 files, 1592 tests, 1590 pass. The two reds are on that HEAD without the patches too: `live-paths` "every file the asset manifests name is exact-case and exists" (the substation and beach manifests name files that are not where they say: `signs-uk.png`, `signs-co.png`, the two `substation-plan` json files, `beach.catalog.json`, `beach.sources.json`, `signs-proof.png`; other builders' work), and `people-assets` "the installed bundles ... decoded asset gate" (it fails on any LF export of the tree and passes in the CRLF worktree).
On the newest HEAD f11a4e4 (A2's door-budget WIP commit, which says "7 downstream tests red until A3/A4 land their fixes"): with the patches 136 files, 1599 tests, 1591 pass, 8 red; without them 132 files, 1566 tests, 1558 pass, the same 8 red (the two above and six downstream reds of the WIP, whose commit message announces seven: placement of papers and finds, the bedroom's last resort, a find lies where it can be seen, the day at home, `lookPose`, the three-hour soak). The patches add 33 passing tests and no failure. There too: `interiors-lazy-page` 7 / 7, `engine-streamframes` 3 / 3, `interiors-page` 10 / 10 on both roads, `live-paths` 396 requests and 0 problems on both roads, `tour` lazy (boot, spawn, doors 201 / 201) passes.
The other browser test files on the same tree, eager road: `engine-bootcard` 7 / 7, `engine-warm` 6 / 6, `engine-render` 9 / 9, `engine-heap` 4 / 4, `engine-triplanar` 6 / 6, `engine-streamframes` 3 / 3, `audio-engine` 19 / 19, `ui-flow` 31 / 31 (with the two mouse-capture tests), `ui-reader` 15 / 15, `ui-touch` 5 / 5, `ui-touch-detect` 3 / 3, `quiet-page` 5 / 5, `world-canopy-page` 3 / 3.
Eager `stuck.mjs --cell 0.2` on HEAD 2c8b531 with the patches: 1 011 093 lattice nodes, 4 trap clusters, boundary 0, missing 0, and `trapcheck.mjs` out 2, tight 2 (L45, L93), STUCK 0, misplaced 0, page errors 0: the same numbers and the same two tight spots as on the older tree before the patches. (At the default cell 0.3: 476 589 nodes, no cluster, trapcheck clean.) The sections of the world hash that carry collisions (`furniture-colliders`, `shell-colliders`, `physics`) are identical before and after the patches there. A responsive probe mirroring `tests/responsive.test.mjs` for la-ladera (eager and lazy, 4 cases each: 0 px sideways, nothing under the pill) is clean on the same tree.
Last integration check, HEAD 2c8b531 with the three patches: `live-paths` 396 requests and 0 problems on both roads; `tour` eager all four checks (boot, spawn, doors 201 / 201, talk 6 / 6) and lazy (boot, spawn, doors) pass; `payload.mjs` OK; `slownet.mjs` 26.6 s lazy and 46.3 s eager, 0 errors; `metrics.mjs --views 40` in section 6.

## 9. Not verified

Real-ear audio effects of the late-built interiors (nothing measured: the emitters follow the anchor count); any GPU but the RTX 5070 Ti; touch and mobile in lazy mode; quality `auto` under streaming beyond the run above;
devices slower than the 4x throttle.

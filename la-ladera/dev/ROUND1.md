# Review round 1: verified findings, by owner

Frozen build reviewed: commit `09a036f` (export `.scratch/verify-09a036f/`, same as the live preview). Reviewers: R1 art director + architect (cats 1, 2, 7, 9), R4 interiors + human scale (cat 3), R2 tester (cats 6, 8, 10; report not finished), R3 people + Spanish (waits for the people swap).
Sheets: `.scratch/verify-09a036f/.scratch/R1/score.json`, `.../R4/score.json` (images in the same folders; R4's room shots are under `.scratch/verify-09a036f/H_/worktrees/0x4d44.github.io/20261029-DEV-CLA-la-ladera-explorable-3d-hillside-barrio/.scratch/verify-09a036f/.scratch/R4/shots/`).

## Scores so far (pass = overall > 9.0 and no category < 8.5)

| cat | R1 | R4 | mean | note |
|---|---|---|---|---|
| 1 layout, scale | 6.0 | 7.5 | 6.75 | reads as a suburb with a park |
| 2 architecture | 6.0 | 7.0 | 6.5 | cloned shopfronts, pristine facades |
| 3 interiors | 5.5 | 6.0 | 5.75 | no furniture models ship, missing fixtures, same decor everywhere |
| 4 people | 5.5 | - | - | R3 pending the swap |
| 6 controls/physics | - | 7.0 | - | sitting cancels itself, E captured by wall decor |
| 7 visual | 6.0 | - | - | morning = evening, icy concrete, crude props |
| 9 discovery | 7.0 | - | - | mirador without a view, murals are small boards |

R2 (tester, report in at 21:19): cat 6 = 6.0 (cap C3: 8 stuck pockets), cat 8 = 8.5, cat 10 = 8.5, cat 5 (secondary, thin) = 8.0. Aggregate so far (lead's arithmetic, cat 4 and 5 provisional): overall about 6.7, far under the 9.0 bar; categories under 8.5: 1, 2, 3, 4, 6, 7, 9. Only cap triggered: C3. Boot clean (0 errors/warnings/404) in every reviewer boot.

## Working rules for this window

- The 5-hour account limit hit at 18:03 after about 1 h 50 min of full-fleet work and stalled everyone for 3 h; assume the same again. Work in small verified steps, keep the node suite green at every step, update your progress log about every 30 min.
- Mutation / "make it fail once" checks: do them on a COPY of the file or revert in the same command. An in-place mutation left behind when the limit hit is the worst failure mode. Before anything else check `git diff` of the files you own for leftovers from the interrupted session.
- Handoff only, never `deltic board`. Quiet-box rules as before. Time matters: do not spend time that can be avoided.

## A1 (engine, look, textures, audio)

1. R1-005 morning looks like evening. Verified by me (`.scratch/lead/sun/h7_url.jpg` vs `h172_url.jpg`): the sun azimuth flips (`celestial()` is right) but the palette is a function of elevation only, so both are the same pink-gold golden hour. Add a morning/evening asymmetry in `samplePalette`/`setHour`: morning cooler, brighter, bluer-shadowed sky and horizon, valley mist (more fog near the ground, lower sun intensity); evening warm, dusty, smoky. Test: render 7.0 and 17.2 at one pose, require a clear mean-colour difference.
2. R1-008 concrete, paving, alleys and the court read as blue-white ice in warm light (`R1/e06_cancha.jpg`, `e01_spawn.jpg`): the shadow fill (hemi sky 0x94aad0 at golden hour) plus cool-grey albedos. Warm the cement/paving/asphalt albedos and cut the blue fill at low sun.
3. Texture batch (Codex pipeline, within 24 MB): for A2 weathering decals (damp/efflorescence, peeling paint over plaster/brick, rust streaks, soot, graffiti tags, 8+ wheatpaste posters), 6+ roll-up shutter textures (corrugated, painted, rusty, tagged), meter-box/door/frame variants; for A3 10-12 more interior wall prints/photos/icons; for A5 high-resolution mural textures. Requests arrive in `dev/REQUESTS.md`.
4. R4-010 / shutter from inside: slat texture + light (with A2).

## A2 (architecture, shells)

Special layouts (courtyard, tenement, school, clinic, hall) first, then:
1. R1-003 shopfront clones (`R1/e04_lowrow_s.jpg`, `q00_n00.jpg`, `e12_row28.jpg`): same flat grey shutter with one dot, same black meter box in a white frame, same two posters, pristine paint everywhere. Per-lot variety: 6+ shutter styles (corrugated roll-up with slat relief, painted green/blue/yellow/rust, half-open, glazed display window with grille, folding gate, wooden shutters), meter boxes only on some lots, conduits/cable runs, wall AC units, hand-painted signs, awnings, hanging goods. Weathering by lot seed: damp rise at the base, rain streaks under sills and balcony slabs, peeling patches, repair patches in another colour, graffiti tags, different wheatpaste posters. Acceptance: no two adjacent shopfronts alike, every facade at least 3 weathering marks, the poster set not shared across a street. Decals/textures: file the request to A1 in REQUESTS.md.
2. R1-009 chapel L48 (`R1/e20_capilla.jpg`; R4: 0.9 m house door): stucco box with a shop-style sign. Bell gable or small tower, cross, arched double door >= 1.6 m wide, niche or round window, painted parish name, tile pitched roof, entry step. A3 does pews/altar/stations.
3. R4-007 the 8 rowhouses L24-L33 share one plan (4 m2 kitchens, same tiny second bedroom): 3-4 variants (mirror, widths 3.6-5 m, stair position, kitchens >= 5 m2, second bedrooms with room for a real bed). Agree the interface with A3.
4. Doors are flat slabs (R4): panel/moulded and glazed-top doors, metal gates for shops. Shutter seen from inside is one flat grey panel (R4-010).
5. Density support (A5 is densifying the plan): taller stacked houses (3-5 storeys downhill, 1-2 uphill), party walls, unfinished 'autoconstruccion' houses (rebar, bare brick, open slab), stair towers, rooftop terraces. Take new lot kinds from REQUESTS.md through the data-driven shell pipeline.

## A3 (interiors, furniture)

Order matters.
- P0 sitting undoes itself (R4-001, 14/14 seats): `sit.js:15` stands you up when the PLAYER is > 0.45 m from `a.stand`, and `stories.js:159` passes `stand:[s.t.x,s.t.z]` = the seat's interaction target (radius 1.9 m), so a sit from 1 m cancels at 0.3-1.1 s. Reference the player's position at sit time. Test: sit from 1.5 m, hold still 3 s, still seated; W stands up. R4-009: from 1-1.2 m looking at a seat, 18/58 lose E to a clock/mirror/calendar/fan/door (L13: the ceiling fan stays the target facing the sofa). Seats and doors beat wall decor; ceiling items only when looking up or very close.
- P1 fixtures as hard invariants in a test: every bathroom WC + basin + shower (51/114 have none); every kitchen sink + stove and every home a fridge (19/61 kitchens no sink, 46/61 homes no fridge); every bedroom a real bed (13/125 none; 11 are 1.9 x 2.08 m second bedrooms with a leaned mattress: single bed or bunk); barber L05 needs barber chairs + mirror; restaurante L14 one table only (4-6 tables with chairs); carniceria L04 shows the grocery list (meat cuts); chapel Stations of the Cross all read 'IV' (`atlas.js` `stations` hard-codes it, `special.js:62` places six: number I..XIV).
- P1 shop fit-outs (R1-004): bakery L02 and ferreteria L41 get the same black shelf unit of the same coloured cubes. Each shop type needs its own recognisable fit-out and real stock objects (loaves + trays, tins/jars/bottles, tools + paint cans, medicine boxes, fabric rolls, notebooks, fruit crates).
- P1 sameness (R4-008, R1-013): wall clock in 61/61 living rooms, 61/61 kitchens, 109/125 bedrooms; the same family photo in 58/61 living rooms; shoes in 119/125 bedrooms; the same beach print / 'Los abuelos' / Sagrado Corazon repeat across L06, L18, L34, L28. Household style seeds + decor pools; target no item or decal in more than 35% of the rooms of its type and no repeated wall art inside one building.
- P2 R1-010 L35: enter, walk 1.5 m, the eye ends up inside a glass cabinet (collider). R4-007 rowhouse variants with A2. R4-010 shutter inside with A2/A1.
- Biggest lever, category 3 (weight 14): Blender furniture GLB heroes. The frozen export shipped `manifest.furniture.json` = `{"files":[]}`, so every piece is a stand-in. Land heroes into the manifest as the suite stays green (beds, sofa, wardrobe, fridge, stove, sink, table + chairs, TV, shop counters/shelves with stock, bathroom fixtures), models total <= 32 MB.

## A4 (people, dialogue, TTS)

1. R1 could not frame faces: its script aimed at `__ladera.npcs()` positions and missed, apparently because they did not match where the models were drawn in `?manual` mode after `step()`. Make `npcs()` report the DRAWN position/heading, and add `__ladera.lookAtNpc(id, {dist:1.3})` (nearest NPC when no id) that puts the player in front of an NPC aimed at the face. Test it. Document in `dev/REVIEWER-BRIEF.md` for R3.
2. R1 impression of the shipped people: 73 NPCs, 25 base meshes (72 tints), low-poly heads with painted faces; rubric 5.5. People realism (cat 4, weight 12) is the largest gap. Land the atomic swap as soon as the node suite and the tour are green (rebuilt 30-character library: people.glb + people_lod.glb + people_meta.json through a temp name then rename, the five new ids back into the persona lists in the same step, `sim.js`/`brain_v2.js`/`world_v2.js`/`indoor.js` wired in). Tell me the moment it is on disk and green so I can launch R3. Then face/hair/clothing realism with A1's Codex textures, indoor routing.

## A5 (world, plan, props, discoveries)

1. MAJOR density (R1-001; `R1/e27_aerial_n.jpg`, `e37_roofs.jpg`, `e32_east.jpg`, `e33_west.jpg`): 49 buildings in short tidy rows separated by lawns. Write a one-page proposal first in REQUESTS.md (how many, where, which lot kinds, new alleys/stairs/passages), then edit `layout.js`: >= 75-90 enterable buildings, about 35% built coverage on the low and mid slope; terraced lots that step up the slope (one yard is the next roof), houses on retaining walls, walkable gaps 1.2-2.5 m, covered passages, enclosed patios, rooftop terraces linked by catwalks. Open ground only for the court, the park plaza, the huerta and a few deliberate viewpoints. Every new building enterable; ask A2/A3 for kinds through REQUESTS.md. Budgets bind: draw calls <= 1500, triangles <= 2.5 M, textures <= 24 MB, boot <= 25 s; plan-oracle, stuck, trapcheck and the NPC routes stay green.
2. MAJOR mirador without a view (R1-002; `R1/m0.jpg`; `teleport(26,-88.6,{yaw:3.14,pitch:-0.25})`): your `vista.js` (city beyond the rim) is in the working tree but not in the frozen build: verify it fixes the mirador, add a railing/edge and a framed sightline, check mirador195/23/7 too.
3. Murals (R1-006; `R1/e13_condor.jpg`, `e16_cerro.jpg`, `e19_fiesta.jpg`): small framed boards on retaining walls. Paint 6-12 m wide, 3 m+ tall straight on a blind party wall or retaining wall: no frame, brush edge, weathering, seen from a plaza or stair.
4. Rows of red-brown mulch cones along the foot of the retaining walls (R1-007; `e13`, `e19`): find the source, replace with ground cover/ivy/gutter/stacked brick.
5. Cancha El Cerro without line markings (R1-008; `e06_cancha.jpg`).
6. Black region outside the plot seen from above/outside (R1-011; `e36_aerial_low_s.jpg`, `e34_aerial_top.jpg`): make sure no reachable position (rooftops included) looking outward shows black.
7. Crude props (R1-012; `e01_spawn.jpg`, `e10`, `e28`): motorbikes flat slabs with disc wheels, rubbish bags faceted blobs, the dog a white blob, eucalyptus trees cards of hanging strips. Order: motorbikes, eucalyptus, dog, bags.
8. Earlier queue continues (terrain cracks, micro-traps, discoveries >= 24, flora).

## R2 (tester) final: cat 6 = 6.0 (cap C3), cat 8 = 8.5, cat 10 = 8.5, cat 5 (secondary) = 8.0

Clean: UI/state flow (title, help, settings saved, pause/resume, M/J/H panels, 320-1920 px, nothing under the pill, hour wrap-around), 0 errors/warnings/404 in every boot, 600/600 random teleports land on ground, 130 doors spammed 7x each (nobody ejected or stuck), seeds deterministic, payload 17.5/60 MB, boot 5.5 s. Full detail: `.scratch/verify-09a036f/.scratch/R2/score.json`, `trap.log`.

**C3: trapcheck confirms 8 STUCK pockets** (`node --import ./la-ladera/tests/register.mjs la-ladera/tests/stuck.mjs --cell 0.2 --json <f> && node la-ladera/tests/trapcheck.mjs <f>`; best escape in brackets). Target after this round: STUCK 0 and tight pockets listed below fixed.
- A3: L38 (-1.1, 7.3) y 22.15 upper bedroom on/at the bed [0.73 m] (R2-002: the bed's step-up is 0.5 m, you can walk onto it and the headboard/walls box you in; make beds and similar low furniture either not steppable or always leave an exit); L36 (-13.6, -12.2) y 16.7 inside a shower stall [0.22 m] (R2-001: `trap_1.jpg`); L27 (-31.3, 67.9) y 9.3 [0.35 m]; the 'tight' ones: 7 in L06 (3.9..10.1, 77.4..82.4; y 0.6, 3.4, 6.2, 9), L16 (35.5, 61.4) y 1.05/3.85, L36 (-15.7, -11.7) y 19.5, L37 (-31.1, -12.8) y 19.8, L47 (-32.2, -63.7) y 30.5, L45 (-47.1, -61.3) y 30.75.
- A2: roof/terrace spots L48 (6.1, -85.9) y 28.25 [0.22 m], L44 (7.3, -27.7) y 28.8 [0.06 m], L21 (-15.6, 46.7) y 6.05 [0.07 m]: find out whether each is a parapet/stair/roof-furniture pocket and close it.
- A5: the two outdoor spots (-32.0, 39.6) y 3.55 and (-27.5, -15.0) y 16.7 [0 m, i.e. inside something]. You believe they are artefacts of a sweep that has no world walls: then port your `labs/a5/stuck-world.mjs` approach into `tests/stuck.mjs` (flag or default: build the world, so unreachable spots are not listed) and make `trapcheck.mjs` use that sweep, so the tool and the page agree; real ones get fixed. Goal: `trapcheck` prints STUCK 0.
- A1: add a generic runtime safety net in the kernel/player: when movement keys are held and the grounded player has moved < 0.1 m over ~1.2 s, move them to the nearest standable point (physics `_pocket`/nav grid) with a short toast ('Te desatascaste'), so any pocket we miss is escapable by walking. Then lengthen trapcheck's per-heading walk to 3 s so it sees the rescue. Keep the existing 'Volver al punto de partida'.

Other R2 defects, all A1: **R2-004 (major)** crouch is also bound to Left Ctrl (`js/engine/player.js:199`, also `js/interiors/sit.js:5`): Ctrl+W (the FPS crouch-walk habit) closes the browser tab and pages cannot block it; Ctrl is not in Help. Remove Ctrl from crouch (C only, optionally Shift+C) and fix Help. **R2-005** Esc in a conversation ends it AND opens the pause menu (`js/ui/flow.js:129-134` takes Esc in 'play' mode even while a dialogue owns the keyboard; `js/people/ui.js:66`): Esc should only leave the dialogue. **R2-007** portrait widens vertical FOV up to 1.35x (`player.js:277`): at slider max 100 a 390x844 phone gets 135 degrees (fisheye); clamp (e.g. portrait vertical FOV never above ~90). **R2-008** title-screen key strip (`index.html:36-39`) omits Space, C, Esc, J, 1-4. **R2-006** at 1920x1080 on this GPU one render costs 13.8 ms at spawn and 12.6 ms at the valley view (the repo's own gate is 12 ms; p95 up to 35 ms, partly load noise from the builders): find the cheapest wins (shadow-map size and MSAA by resolution in `auto`, bloom resolution, merge more) with `tests/metrics.mjs --w 1920 --h 1080`; density work will add cost, so this is the budget the rest has to fit in.

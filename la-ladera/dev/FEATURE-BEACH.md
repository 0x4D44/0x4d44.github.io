# FEATURE: the beachfront and real water sports (design, option C; Arthur chose it, relayed by the lead, 2026-10-31)

The lead relayed, verbatim: "Arthur chose the big option for the beachfront: option C, real water sports, with the ocean at the bottom of the hill, the SOUTH edge (the spawn side; the spawn is at about z 92.5, so the shore must lie beyond the current south boundary). My assumption, change it in the doc if the numbers say otherwise: the neighbourhood stays 200 m x 200 m and we add a beach strip and sea beyond its south edge."

Status: DESIGN ONLY (A5). No code, no shipped file touched. Tags: **[M]** measured on today's tree in this session (headless, low priority, quiet box), **[A]** an assumption or a budget I chose (change it if you disagree), **[I]** inference, not measured. Spanish names are proposals. Paths are relative to `la-ladera/`. Each ask is addressed to an owner; the lead copies it into `dev/REQUESTS.md`.

## 0. The answer on one screen

1. **Where.** The plot stays 200 x 200 m. Sea level is y = -1.20 m (plot datum) [A]. From the south edge (z = 100): promenade z 100-108, sea wall, 29 m of dry sand, a foreshore, the waterline at z = 144.2, waist-deep at z = 161, swimming from z = 175, a buoy line at z = 210 (3.0 m deep), a hard stop at z = 220. The walkable area grows by 24 k m2 (+61 %) [A]. East and west the beach is held by the existing x = +-99.4 walls and two rock groynes; beyond them the shore curves south into two headlands that frame the bay.
2. **The old south goes.** The valley city (1,453 of the 1,855 far houses lie south of z = 100 [M]) and the valley floor (-15 m by z = 200 [M]) give way to the bay. A smaller village and a lighthouse stand on the headlands.
3. **The spawn keeps yaw 0** (the oracle's `spawn.look` demands an uphill view [M `tests/plan-oracle.mjs:281`]). The beach is behind the player: surf and gulls from the first frame say "turn round". A new Plaza del Mar at the spawn opens one axis: Virgen shrine, Paseo, spawn, stairs, pier, sea.
4. **Water.** Three world-fixed meshes (about 19 k triangles, 3 calls, culled whenever the frustum misses them), one transparent shader, one analytic swell shared by CPU and GPU, depth from a per-vertex seabed value (no depth pass), fake sky reflection from the sky's own uniforms, shore foam, wet sand, caustics. Underwater: fog, grade, camera far 60 m.
5. **Budget.** The sea is cheap. The beach and the full town rarely share a frame, because the beach lies behind the hill view. The one view where they do (the beach looking north at the town) lands at 2.43-2.53 M triangles [I] against the 2.5 M gate; I can pay for it with terrain thinning (up to 164 k triangles: 35.7 k hidden under buildings and 128 k on flat open ground [M]; the thinning itself is unproven [I]) and range culls. Details and the cut order in 2.4 and 2.5.
6. **Player.** Wade, swim, dive, surface, a soft non-lethal breath, a swim limit made of buoys, resistance and a hard stop. The physics kernel needs no change; `Player.update` does (14 exact asks to A1, 3.3).
7. **People.** +33 NPCs (16 visitors, 13 riders, 2 lifeguards, 2 vendors), 9 spot kinds, 5 modes, 28 new clips (17 are first priority), swimwear gated on Codex's wearable layer, with a street-clothes fallback.
8. **Audio.** A surf bed with a distance law (audible at the spawn), gulls, underwater low-pass, splash and stroke one-shots, six new footstep surfaces.
9. **Plan.** Phase 0 data and gates, 1 the sea exists, 2 the front, 3 the people, 4 polish and cuts. Every new test is seen failing first (`C_SABOTAGE` pattern). The gates: stuck sweep, trapcheck, responsive, payload under 60 MB, boot under 25 s.
10. **Forks for Arthur** are in section 8 (breath, tide, a second spawn, a rideable board, the lost valley city).

### Baseline, measured today [M]

Headless `tests/metrics.mjs --soak 0 --views 40`, low priority, other builders running (so costs are pessimistic):

| fact | value |
|---|---|
| boot | 14.8 s (gate 25 s) |
| busiest view | `door-L06` 2,469,335 triangles, 1,012 calls (gate 2.5 M / 1,800) |
| spawn view (looks north) | 2,282,788 triangles, 977 calls, 7.31 ms cost |
| `ridge-looking-south` | 1,681,773 triangles, 664 calls, 6.70 ms |
| worst cost | `interior-L10-hall` 13.29 ms (min 10.64) over the 12 ms gate in this run; it is an interior and not caused by this work, so re-measure on a quiet box before blaming anyone |
| world groups | terrain 320,000 (64 tiles of 5,000), far terrain 66,080 (one mesh, rings of 5 m and 15 m cells), vista 51,982 (1,855 houses), walls 35,980, streets 12,948, stairs 12,202 |
| payload (`tests/payload.mjs`) | shipped 31.8 / 60 MB; textures 11.4 / 24; models 17.9 / 32; `models/world` 0.0 / 6; GPU textures 169 / 220 MB |
| people | 86 NPCs from 30 bodies (10 men, 9 women, 4 elders, 2 boys, 2 girls, 3 teens); 32 clips (30 loops, 2 one-shots) at 24 fps; `VIEW_MAX` 95 m; full mesh inside 32 m, 1,600-triangle LOD beyond 38 m |
| south edge | spawn (-6.5, 0.22, 92.5) yaw 0; plot ground at z = 100 is -0.04 to +0.12; `makeBaseTerrain` falls 0.022 per metre there and is then clamped flat beyond z = 140; far ground at x = 0: +0.1 (z 100), -0.5 (120), -6.0 (150), -14.9 (200), +0.7 (400), +23 (500) |
| south row | lots L11-L15, L50, L51 end at z = 98.1 with their backs to the boundary wall (z = 99.55); the gap x -32.5 to 6 (39 m) holds the spawn and the Paseo axis (x = -6.5); the gate arch and bus stop stand at x = 46 and 41.5 |
| sun | `look.js:13` latitude 6, declination -13: the sun crosses the SOUTH sky at noon (elevation 71 degrees), rises east-south-east, sets west-south-west, so the sea gets the glitter road all day |

## 1. World

### 1.1 Profile (u = z - 100, sea level S = -1.20) [A]

| zone | z (m) | y (m) | notes |
|---|---|---|---|
| plot south strip | 88-100 | +0.30 to +0.10 | Calle del Comercio at z = 88; old wall at 99.55 goes (see 1.3) |
| Plaza del Mar and promenade (Malecon de El Plan) | 100-108 | +0.22 flat | 8 m deck, flush with the gate road; the plaza (x -31 to 4, z 89-100) fills the gap in the south row and the spawn stands in the middle of it |
| sea wall and stairs | 108-108.8 | +0.22 to -0.55 | 0.77 m drop; five 5-step flights (rise 0.154, run 0.28, gradient 0.55) and one ramp 1:12 |
| dry sand | 108.8-138 | -0.55 to -0.80 | 29 m; dunes +-0.06 m |
| foreshore | 138-152 | -0.80 to -1.70 | 1:16; the waterline (y = -1.20) is at z = 144.2, 51.7 m from the spawn (22 s at walking pace) |
| shallows | 152-190 | -1.70 to -3.40 | 1:22; depth 0.9 m at z = 160.9, 1.3 m at 169.9, 1.55 m at 175.5 (swimming starts) |
| swim zone | 190-210 | -3.40 to -4.20 | 1:25; buoy line at z = 210, depth 3.0 m |
| soft stop, hard stop | 210-220 | -4.20 to -4.60 | resistance from z = 204; kernel wall at z = 220 (3.4 m deep) |
| open sea | 220-500+ | -4.6 to -15 | never walked; colour and fog only |

East and west the shore is straight (z = 144.2) for |x| <= 100, then curves south: z = 144.2 + 0.0035 (|x| - 100)^2 (z = 172 at |x| = 190, z = 284 at |x| = 300). The seabed profile is sheared along that curve. Outside it stands the old flank land (`periphery.js` `flank`), so the bay is a concave cove with its horns pointing south. Two rock headlands cap the horns: west (-300, 330) radius 80 m, +30 m; east (330, 370) radius 90 m, +40 m. Seen from the promenade they sit 46 to 48 degrees off the south axis, 250-300 m out: the frame edge, in soft haze (fog is 64 % at 300 m [I]).

### 1.2 What replaces the old south (A5, `js/world/periphery.js`, `vista.js`, `terrain.js`)

- **Far height** (`makeFarHeight`): the `valley` and `opposite` terms and the roll noise (x 0.15) give way, south of z = 125, to the bay; the headlands are smooth bumps added to it. The far tiles over water deeper than 6 m are not built: about -15 k triangles [I], and the sea hides them anyway.
- **Coast terrain** (new `js/world/coastmesh.js`, group `world.coast.terrain`): sand, foreshore, seabed and the headland tiles as one mesh set at 2 m cells to z = 160 and 4 m beyond: about 14 k triangles [A]. It uses the same height function as physics, so mesh and feet agree to a millimetre on dunes [I].
- **Vista** (`buildVista`, `urbanDensity`): the `south` term goes. Houses whose ground lies under S + 1.5 m or inside the bay are dropped: about 1,100 of the 1,453 southern ones [I], some 31 k triangles in south-looking views. About 160 houses go on the west headland (lit at night through `ctx.glow`), a lighthouse on the east one (the vista's beacon code). `sky.js:46-60` `cityGlow` must move off due south (A1 ask 4).
- **The road.** `roadPath` runs S1 south into the valley today; it becomes: gate arch (46, 100), a T on the promenade at z = 104, a shared lane east along the back edge (bollards, paint), a second lowered barrier where it meets the x = 99.4 wall, then up the east flank (about 420 m, as now). The arch stays; the player cannot pass either barrier.
- **Boundary.** `buildBoundary` (`periphery.js:171`): the south wall run (about 185 m of the 788 m [M `boundary stats`]) is removed except two 3 m returns at the corners and the arch; the rear walls of the south row become the promenade frontage. `buildPerimeter` (`terrain.js:130`): the south collider goes; the east and west colliders extend to z = 221; a kernel wall closes z = 221 from x = -99.4 to 99.4 (NPC and safety net; the player is stopped earlier, 1.5).

### 1.3 Promenade, accesses, pier, groynes, swim line (A2 builds, A5 gives the data)

- **Promenade.** 8 m deck from x = -99 to 99: pavers, a sea-wall parapet (a wall only blocks when its top is more than 0.4 m over the walker's feet, `physics.js` WALL_CLEAR; checked in a scratch run [M]: a 0.45 m wall stopped a walker, a 0.35 m wall did not; so the rail runs 0.9 m high, with sitting stretches as separate benches), lamps every 14 m (15), palm planters every 18 m, bench stretches with `sit` anchors. The rears of L12, L14 and L50 get a beach door and a terrace, and L11, L13, L15, L51 a dressed rear facade; the lot boundaries do not move, so `lots.bounds` is untouched. No code makes a back door today: every `S.extDoor` call in `js/arch/layouts*.js` is on the `'front'` side [M], and the contract's `lot.extraEntrances` is declared but read nowhere in `js/` [M: no match]. So A5's plan flags the three lots (`lot.beachDoor`) and A2 adds `S.extDoor(room, 'back', u, { entrance: 'alley' })` to their layouts; `makeEntrances` (`arch/plan.js:48`) already ranks an `alley` kind, and the oracle only checks the primary `lot.entrance` (`plan-oracle.mjs:142-145` [M]), so the flag trips nothing.
- **Five accesses** (stairs) at x = -90, -56, -6.5, 30, 70, plus one 1:12 ramp beside the axis stair. The axis stair (10 m wide) is the grand one.
- **Pier (Muelle de los Pescadores).** On the axis x = -6.5, from z = 108.8 to 190, 3 m wide, deck at +0.22 (1.42 m over the sea), piles every 4 m, rails 0.9 m, a lamp every 10 m, bollards, an 8 x 6 m end platform with a diving ladder and a rail gap for jumping. The deck is a floor patch, so nobody walks under it on the sand (head-bump rule), but swimmers pass under in the water (about 0.85 m of air at the surface [I]); the piles are wall boxes. This is the best underwater set piece.
- **Raft (La Balsa).** (34, 185), 4 x 4 m deck at -0.90 with a skirt wall around it so swimmers cannot pass under (a swimmer's head tops out at -0.92 m, 2 cm under the deck top, so the kernel would treat the raft as a ceiling and let them drift under it [I]); a ladder is a `plan.coast.climbs` entry.
- **Groynes.** Rock mounds at x = +-(100..106), z 100 to 185, 40 instances each, outside the physics walls.
- **Swim line.** 20 buoys at z = 210, x = -95 to 95 step 10, a rope (`LineSegments`), two flags, one bell buoy at x = 0.

### 1.4 The beach, item by item [A]

| item | n | where | notes |
|---|---|---|---|
| kiosks | 6 | z = 111, x = -80, -50, -22, 14, 40, 76 | 4 x 3 m; counter and `vend` anchors; Cocadas, Ceviche, Jugos, Helados, Alquiler de tablas, Cooperativa de pescadores |
| changing huts | 8 | banks of 4 at (-70, 112) and (58, 112) | 1.2 x 1.2 m |
| showers | 3 | (-45, 116), (20, 116), (62, 116) | a water loop each |
| loungers, umbrellas, towels | 40, 20, 18 | rows at z = 119 and 125, x -34 to 34 (gap x -10 to -3 for the pier) and 50 to 84; towels z 115-135 | towels and loungers carry `lie` anchors |
| volleyball court | 1 | (-62, 126), 16 x 8 m | posts, net, lines; 4 `volley` spots |
| lifeguard tower | 1 | (6, 128) | 2.4 m stilts, flags, a `watch` anchor, a logbook (a paper) |
| palapas | 2 | (-88, 114), (88, 114) | thatch, tables |
| palms | 22 | z = 113-115, every 9 m | the flora `FROND` tile |
| boats on the sand | 5 | x -88 to -70, z = 132 | 5.5 m launches, nets on poles |
| moored boats | 2 | (-3, 172), (-10, 186) | bob on `sea.level` |
| bins, benches, signs | 8, 18, 10 | along the promenade | Spanish signs: Zona de bano, Bandera roja, Prohibido el paso |
| dunes grass, driftwood | - | sea wall toe, both ends | `tufts` machinery of `flora.js` |

### 1.5 Where the walkable area ends

East and west: x = +-99.4 (as now). South: the swim limit (3.1). The player is never clamped at z = 99: `player.js:282` becomes `plan.coast.limit(x, z)`; the toast ("Mas alla solo hay monte...", line 285) gets a sea variant. The map and the stuck tools take the same limit (1.6).

### 1.6 Effects on the plan oracle, nav graph, tools, map, vista

- **Plan oracle** (`tests/plan-oracle.mjs`, the lead's file). Existing checks keep passing if: lots stay inside the square (kiosks and huts are props, not lots); new streets and plazas use the existing vocabularies (`PLAZA_KINDS`, `STREET_KINDS`, `SURFACES`); the stairs obey the oracle's flight rule (gradient 0.50-0.72: 0.55 does); nav nodes sit within 0.45 m of `heightAt` and the graph stays one component (so wade nodes only where depth <= 0.5 m); `spawn.*` unchanged. New checks live in my `tests/world-coast.test.mjs` (1.7); the lead may fold them into the oracle as `checkCoast`.
- **`plan.heightAt`** becomes the composite: the grid inside the plot, `coast.heightAt` south of z = 100 for |x| <= 100. Every consumer (physics, nav heights, NPC snap, audio height range, map relief) then sees the beach as ground without a change. `field.js` sample() already extends beyond the grid with the analytic base term; the coast replaces it where it matters.
- **Nav.** New streets S16 (Malecon, kind street, 8 m, concrete), S17-S21 (the five stairs, kind stair), S22 (the ramp, kind path), P6 Plaza del Mar (kind plaza, x -31 to 4, z 89-100, clear of L15 at x 6 and L50 at x -32.5), plus `plan.coast` nodes: a sand grid at 7 m (diagonals stay under the oracle's 10 m edge limit), wade nodes at depth <= 0.5 m on three lines, a pier chain. `buildNav` (`nav.js:89`) gains a `plaza.step` override. Swim, paddle and ride routes are NOT graph nodes: `plan.coast.lanes[]` (polylines), so `nav.connected` and `nav.ground` stay true and street people never wade out.
- **Stuck tools** (lead's). `tests/stuck-lib.mjs` flags positions within 1 m of the plot edge as "walk off the map"; it must read `plan.coast.limit` or the promenade (z = 100) reads as a trap edge. The lattice search grows by about 60 % of cells [I] (about 1 min to about 1.7 min). The kernel has no water, so the sweep proves the GROUND of the beach (no pit, no cliff, every access works) and not swimming; swimming is tested at controller level (3.4).
- **Map** (`ui/map.js`, A1): the relief canvas and the frame grow from 200 x 200 to 200 x 320 m (ask 9).
- **Discoveries.** +8: pier end, raft, the lifeguard's logbook, the cooperative's board, a message in a bottle, a sunken moped (3.0 m), an anchor (2.2 m), a coral patch (3.0 m); `ctx.discover` is proximity based, so depth works.

### 1.7 World tests (A5, `tests/world-coast.test.mjs`, pure Node)

1. Continuity: |`coast.heightAt(x, 100.01)` - `plan.heightAt(x, 99.99)`| <= 0.05 for x in [-99, 99] step 1.
2. Slopes: no gradient over 0.10 on the sand and foreshore, over 0.08 in the water; no step over 0.12 m per 0.25 m outside the wall footprint.
3. Profile points: waterline within z 140-150 for |x| <= 95; depth at the buoy line 2.4-3.6 m; no seabed above S between waterline and hard stop (no islands).
4. Nav: every node south of z = 100 is on land or in water <= 0.5 m; one component; each of the five stairs and the ramp joins deck and sand within 1.5 m of nodes on both sides; ramp gradient <= 0.09.
5. Walk: the real kernel walks spawn to every access, down to the waterline and on to depth 1.5 m (the sweep proves the rest).
6. Data: areas (Playa, Mar), landmarks (malecon, muelle, playa, salvavidas, balsa), at least 40 beach POIs (`lie` 24, `wade` 8, `swim` 6, `fish` 6, `volley` 4, `vend` 8, `watch` 2, `moor` 6, `launch` 6).
7. Determinism: two builds with one seed give identical `plan.coast`.

Each check is seen failing first by an environment mutation (`C_SABOTAGE=notch|island|gap|ramp|...`, the pattern of `tests/interiors-content.test.mjs`): a 0.6 m step at z = 150, a seabed bump above S at (20, 170), a stair link removed, a ramp at 1:6.

## 2. Water

### 2.1 Surface (A1: new `js/core/sea.js`, new `js/engine/water.js`)

- **Meshes.** Three, world-fixed, transparent, `depthWrite` false, drawn after the opaque pass and before the sky: near (x +-130, z 125-260, 2.5 m cells, 11.2 k triangles), mid (x +-450, z 125-560 minus near, 12 m cells, 4.9 k), far (to 900 m, 80 m cells, flat, 2.5 k). 18.6 k triangles, 3 calls [A]. A camera at z < 100 looking north does not intersect their boxes, so they cost nothing there (test 2.6).
- **Swell** (`sea.level(x, z, t)`, pure JS and mirrored in GLSL): four waves, directions toward north (the wind is a south breeze): wavelengths 38, 17, 7.5 and 2.8 m; amplitudes 0.16, 0.07, 0.03, 0.01 m at calm morning and x 1.8, 2.0, 2.7, 4.0 in the afternoon breeze [A]. Amplitude grows by up to 1.2x between depth 3.0 and 0.6 m (shoaling) and a swash term runs the surface up to 0.10 m over the foreshore. `seaState(hour)` gives wind 0.35 at dawn and 1.0 from 13:00 to 17:30 (the kite hours). Parity of CPU and GLSL is a test (3.4).
- **Depth** is a per-vertex attribute (`aBed`, seabed height from `coast.seabed`), so no depth pass and no bathymetry texture. Linear interpolation over 2.5 m cells on a 1:16 foreshore is exact to a few millimetres [I]. Fragments with depth under -0.02 are discarded, so water shows on sand only where the swash covers it.
- **Shading.** Base colour by depth (shallow 0.18, 0.72, 0.70 to deep 0.015, 0.20, 0.34); alpha 0.35 to 0.96 over depth 0.1 to 2.5 m, so the sand shows through the shallows and a swimmer's submerged half fades (no clip plane needed); Fresnel (power 5); reflection is the sky function with the reflected vector, fed by the sky's own uniforms (`uZenith`, `uHorizon`, `uSunDir`, `uSunCol`, `uMoonDir`, shared by reference, `sky.js:22-23`), a tight sun term for the glitter road that bloom picks up, and the moon at night. Fog chunk on, so the far sea melts into the horizon colour. No planar reflection; a soft dark decal under boats and pier fakes contact.
- **Foam.** Three bands from depth and swell: a swash edge (depth under 0.35 + 0.15 sin of the swash phase), a break line (depth 0.6-1.1, on wave crests) and light white-caps in deep water scaled by `wind`. A small tileable foam noise (256 px) drives them.
- **Wet sand and caustics** need shader patches on terrain materials (A1 `shaderpatch.js`): the sand darkens and gets a spec boost below S + 0.12 + 0.10 sin (swash), and the seabed gets a scrolling caustic term for depth under 5 m.
- **Sea state is data:** `seaState(hour)` also drives the audio surf level, the riders' speeds and the kite lines, so one clock moves everything.
- **Quality tiers** (`ctx.quality`): high as above; medium: near cell 3.5 m, no caustics; low: far-style flat water plus Fresnel, no foam noise, no wet-sand patch.

### 2.2 Underwater view (A1: `look.js`, `post.js`, `water.js`, `visibility.js`)

- **Detect** camera y < `sea.level` - 0.02; blend `uw` over 0.12 m.
- **Fog:** colour (0.02, 0.30, 0.36) scaled by daylight, density 0.06 at the surface rising to 0.10 at 3 m (90 % fogged at about 25 m and 15 m); `Look.apply` (`look.js:172-189`, fog at 189) lerps by `uw`. Sky mesh hidden.
- **Grade:** drive the existing `LaderaGrade` uniforms (`post.js:17-33`: `uCool`, `uSat`, `uVig`): bluer, saturation 0.85, vignette 0.38. No new shader.
- **Surface from below:** the same mesh `DoubleSide` with `uUnder` flipping the normal and a bright Snell window (bright inside 48 degrees, fog colour outside).
- **Cost goes down underwater:** `camera.far` 60 m, vista, far terrain and sky off. Underwater is the cheapest view in the game [I].
- **Dressing** (A5 `shorelife.js`, `coastprops.js`): seagrass cards (at most 400 within 40 m, one call), rock patches, a coral patch, the piles with mussels, a sunken moped, an anchor, three shoals of 14 fish (flip-book cards). Marine snow (120 points) is the first cut.

### 2.3 Cost inside the budgets

Beach groups, budgeted [A] (a theoretical ceiling if all were in view):

| group | triangles | calls | owner |
|---|---|---|---|
| sea (3 meshes) | 19 k | 3 | A1 |
| coast terrain, seabed, headlands | 14 k | 4 | A5 |
| promenade, wall, stairs, lamps, benches, rails | 30 k | 8 | A2 |
| pier and raft | 14 k | 5 | A2 |
| kiosks, huts, palapas, tower, showers | 30 k | 10 | A2 |
| loungers, umbrellas, towels, net, bins, signs | 36 k | 10 | A5 |
| boats, nets, buoys, rope | 20 k | 8 | A5 |
| groyne rocks, dune grass, driftwood | 24 k | 6 | A5 |
| palms | 20 k | 3 | A5 |
| riders: boards, sails, kites | 6 k | 4 | A4 |
| gulls, crabs, fish | 5 k | 3 | A5 |
| **static and props** | **about 220 k** | **about 64** | |
| people (nearest 40 inside 95 m: 12 full at 8.3 k, 28 LOD at 1.6 k) | up to 145 k | up to 48 | A4 |

Calls: the highest count today is 1,016 of 1,800 [M]; +110 worst case still leaves about 670 [I]. Boot: 14.8 s today [M]; the coast adds under 2.5 s (mesh builds, 150 props, about 12 textures, 1.5 MB of models, 2 MB of clips) [I].

Payload [A]: textures +4.5 MB (sand x2, seabed, rock, pavers, planks, canvas, atlases, sprites), models +2.5 MB in `models/world` (cap 6 MB), clips +2 MB in `models/people` (9.4 of 14 MB): shipped about 41 MB of 60. GPU textures +24 MB: 193 of 220.

**Which views.** A camera at z <= 100 looking north sees none of the beach, and a camera on the beach looking south sees none of the hill. Only these share the town: the beach looking north (the postcard), the pier end, a swimmer looking back, and oblique looks along the promenade. The postcard is the spawn view (2.28 M [M]) plus the near promenade and beach (150-250 k [A]) = 2.43-2.53 M [I]. The top of that range is over the gate, so the pay list in 2.4 belongs to Phase 1, not to a last resort. New harness views (A1 `tests/metrics.mjs`): `beach-promenade-south`, `beach-sand-north`, `beach-shore-east`, `pier-end-north`, `swim-north`, `swim-south`, `underwater`; the existing `ridge-looking-south` now includes the sea. Caps: town-sharing views 2.5 M; non-sharing beach views 1.2 M [A].

### 2.4 Cull and pay (in this order of safety)

1. Sea groups hidden by frustum (box test) and by a camera rule: draw nothing from the coast groups while the camera is north of z = 62 and looking north (this also keeps their shadow casters out of the shadow pass [I]). A1 `visibility.js`.
2. Far houses over the bay (-31 k in south views), far tiles over deep water (-15 k).
3. Range culls (A1 `visibility.js` rules next to `INT_RANGE` 28): small beach props (`props.coast.small.*`) hidden beyond 100 m; people keep `VIEW_MAX` 95; riders switch to impostors beyond 95 m.
4. Crowd cap: only the nearest 40 beach people are drawn; the sim throttles the rest as it does today.
5. **Terrain thinning (A5 `terrain.js`, benefits every town view).** Measured on this tree [M]: 35,676 terrain triangles (11.1 %) lie fully under building footprints (shrunk 0.25 m) and can be dropped with no visual change; 21,344 of 40,000 2 x 2 cell blocks (53 %) are open hillside, far from any street, plaza, stair or building and flat within 4 cm, and a 1 m cell there saves 128,064 triangles. Together up to 164 k of 320 k. The risk is T-junction cracks at the edge of a thinned block (use an edge-matched fan or the apron trick of `buildFarTerrain`) and per-vertex colour and dirt blending (vertex colours are per node). Share in a given frame depends on the frustum [I].
6. Underwater: far 60 m (2.2).

### 2.5 Cut first if the budget bites (cheapest loss first)

1 groyne rocks 40 to 20 each; 2 loungers 40 to 24, umbrellas 20 to 12, towels 18 to 8; 3 palms 22 to 12; 4 crowd cap 40 to 24; 5 riders 13 to 8; 6 near sea cell 2.5 to 3.5 m (-5.4 k) and drop the foam noise; 7 caustics, marine snow, wakes off; 8 pier piles to instanced rows, raft out; 9 shore life to gulls only; 10 beach props stop casting shadows (umbrellas and kiosks last).

### 2.6 Water and budget tests

`tests/core-sea.test.mjs` (A1, Node): `level` is finite, bounded and periodic; a JS transliteration of the GLSL wave sum agrees with it within 1 mm at 2,000 random points (mutation: change one constant in the transliteration). `tests/engine-water.test.mjs` (A1, headless Chrome through `tests/chrome.mjs`): the page boots with the sea, `renderer.info.render.calls` rises by 3 looking south and by 0 looking north from z = 90 (mutation: force the sea visible), underwater mode changes fog and hides the sky (mutation: skip the `uw` blend). Harness gates above.

## 3. Player (A1: `js/engine/player.js`, `js/core/config.js`)

### 3.1 States and numbers [A]

`depth` = `sea.level(x, z, t)` - ground (`physics.groundAt`, which exists, `physics.js:101`).

| state | enters when | behaviour |
|---|---|---|
| dry | depth <= 0.10 | as today |
| wade | depth > 0.10 | speed x (1 - 0.5 x clamp((depth - 0.10) / 0.8)): 2.3 to 1.15 m/s; footsteps become splashes (surface `shallow` under 0.45 m, `wade` above) |
| deep wade | depth >= 0.90 | no sprint, no jump; eyes still dry |
| swim | depth >= 1.55 (leaves swim below 1.30) | feet off the ground; eye 0.14 m over the surface; 1.4 m/s, Shift 2.2; horizontal; stroke events every 1.4 s; no footsteps |
| dive | crouch (C) or look down more than 35 degrees with W while swimming | moves along the look direction under water; 1.1 m/s down, Space 1.4 m/s up; floor limit seabed + 0.3 m, depth limit 3.4 m below the surface |
| surface | eye above surface again | splash, `player:surface` event |

- **Camera.** In swim, `camY` follows `level + 0.14 - eye` so the swell lifts the head (about +-0.15 m calm, +-0.3 m breeze, about 0.1-0.2 Hz) with roll up to 0.8 degrees on the slope; a setting `Movimiento del mar` (0-1, 0 off) scales it.
- **Breath, soft.** 25 s under the surface, then a heartbeat and a closing vignette; at 40 s a gentle lift to the surface with a gasp. Never lethal. Refills 3x faster in air. Fork 1 in section 8.
- **Jump into the sea** (pier end, raft, wall): `move()` runs unchanged until feet cross the surface, then `vy` x 0.35 and a plunge with drag 3 per second: about 0.6-1.0 m under the surface after a 1.4 m fall [I], then buoyancy 1.0 m/s. Event `player:splash {speed, depth}`.
- **Getting out.** Walking toward land: below depth 1.30 the feet find the ground and `move()` takes over. At a raft, ladder or pier: Space or W within 0.7 m of a `plan.coast.climbs` entry eases the feet to its top in 0.4 s.
- **Swim limit** (the south edge; replaces `player.js:282-286` for z > 99): resistance from z = 204 (speed x (1 - smooth over 6 m) down to 0.2 at z = 215) plus a 0.8 m/s push toward land; a lifeguard whistle once per minute from z = 207; hard clamp at z = 220 and the kernel wall at 221. Toast: "Mas alla la corriente es fuerte. El salvavidas te silba."
- **Why the kernel is unchanged.** In swim and dive `Player` passes `gravity: 0` to `move()` (`o.gravity ?? 9.8` keeps 0) with `s.vy = 0`, so the vertical branch leaves `y` alone, then sets `s.y` itself clamped above `s.ground`. Horizontal motion, walls, pier piles and the raft skirt work as they do on land. Checked in a scratch run [M]: over a seabed at -3.0, 120 frames of `move()` with gravity 0 kept `y` at -1.50 while the walker advanced 2.4 m; with the default gravity it fell to -3.0.

### 3.2 Hints and controls

First wade: toast "Espacio: subir. C: bucear. Shift: nadar mas rapido." Touch UI: while swimming the jump and crouch buttons read Subir and Bucear (`ui/touch.js`).

### 3.3 Exact asks to A1 (each with its anchor today)

1. **`js/core/sea.js`** (new, pure, no THREE): `seaState(hour)`, `level(x, z, t)`, `slope(x, z, t)`, `crestTimes(x, t0, t1)`; constants shared with GLSL. Test 2.6.
2. **`js/engine/water.js`** (new): the three meshes, shader, `aBed` attribute from `plan.coast.seabed`, quality tiers, system order 5 (before people at 20), `ctx.sea = { level, depth, submerged, state }`.
3. **`player.js:225-338`**: the state machine of 3.1. Concretely: after intent (line 248) compute depth and state; lines 256-262 use state speed; line 266-274 jump only when not wading deep; line 277 pass `gravity: 0` when swimming; lines 279 skip `_stallNet` (line 203) while swimming; lines 282-286 call `plan.coast.limit`; lines 288-293 update `safe` every 0.6 s while swimming (else a fault teleports back to the last wading spot); lines 306-313 emit stroke events instead of footsteps; lines 316-331 camera rules.
4. **`look.js:172-189`**: underwater blend `uw` on fog colour and density, hemi and sun intensity, bloom; sky visibility; share `sky.uniforms` with the water material. **`sky.js:46-60`**: move `cityGlow` from due south to west-south-west and thin it (the valley city is gone; the lights are on the headland village).
5. **`post.js:17-33`**: underwater grade through `uCool`, `uSat`, `uVig`.
6. **`shaderpatch.js`**: wet-sand and caustics patches with `uSeaLevel`, `uSwash`.
7. **`surface.js`** (`SurfaceMap.kind`): coast surfaces from `plan.coast.surfaceAt(x, z)`: `sand`, `wetsand`, `shallow`, `wade`, `deck`, `jetty`, `rock`.
8. **`visibility.js`** (next to `INT_RANGE`, line 11): range rules `props.coast.small.*` 100 m, the camera-side rule for coast groups, `camera.far` 60 m underwater.
9. **`ui/map.js`**: `makeRelief` (lines 52-68) and `fit` (line 85) and the frame (line 115) grow to 200 x 320 m; draw sea by depth, sand, deck, pier, groynes, buoy line, raft; legend Playa and Mar; labels PLAYA and EL MAR.
10. **`audio/*`**: section 5.
11. **`core/registries.js`** `ANCHOR_KINDS` (CONTRACT 5.4): add `lie swim wade raft fish volley watch launch moor`.
12. **`core/config.js:7-11`**: `PLAYER` gains `swim 1.4, swimFast 2.2, dive 1.1, rise 1.4, swimEye 0.14, wadeMin 0.10, deep 0.90, swimOn 1.55, swimOff 1.30, breath 25`.
13. **`engine/debug.js`**: `__ladera.tp('beach' | 'pier' | 'swim' | 'under')`, and the swim state in `__ladera.state()`; **`main.js`**: flag `?skip=coast`.
14. **`engine/settings.js`, `ui/touch.js`**: `Movimiento del mar`, water quality, swim buttons.

### 3.4 Player tests

`tests/engine-swim.test.mjs` (A1, Node, fake ctx): depth to state at each threshold with hysteresis; speeds; breath timeline (25 s, 40 s); limit resistance and clamp; plunge depth from a 1.4 m fall. Each assertion is seen failing by moving its threshold. Controller-level `trapcheck` proves a deep cluster is left (3 s of swimming is over 3 m).

## 4. People and sports (A4)

### 4.1 Cast [A]

+33 NPCs on the 30 existing bodies (recolour slots), 86 to 119.

- **Visitors, 16**, arrive by the bus stop (x 41.5, z 95.5 stands 4 m from the promenade) between 10:00 and 17:00, leave by 18:30. Adults wear swimwear from the garment library once the wearable layer lands; children in their own shorts or dress, wading only.
- **Riders, 13**: 3 windsurfers, 3 kitesurfers (13:00-17:30 in the breeze), 4 paddleboarders (07:30-18:00), 2 kayakers, 1 rower.
- **Lifeguards, 2** (08:00-17:30; one on the tower, one patrolling on a rescue board 12:00-16:00).
- **Vendors, 2** walking with coolers (`walk_carry` plus `sell`), plus the six kiosk keepers drawn from existing vendors.
- **Residents** (existing 86) gain beach choices in `freeOutdoors` (`schedule.js:131`): kids `wade` after school (14:30-17:30), teens `swim` and `lie`, elders `stroll` at dawn and `bench` on the sea wall at dusk, three men `fish` (04:30-09:00 and 16:00-18:00).

### 4.2 Spots, modes, drivers

- **Spot kinds** (`spots.js` CAPACITY; A1 adds the same to `ANCHOR_KINDS`): `lie` 1, `wade` 4, `swim` 6 (waterline starts), `raft` 6, `fish` 1, `volley` 4, `watch` 1, `launch` 2, `moor` 1.
- **Modes** (`npc.js`): `swim` (follow a lane polyline with lateral wander, `y = sea.level - offset`, body pitched by the rig), `float`, `ride` (closed course; the board follows `level` and slope; speed 6-9 m/s windsurf and kite, 1.2-2 m/s paddle; roll from turn rate), `row`, `fish`.
- **Drivers** (`brain.js`, patterned on `do_bench` and `do_court`, lines 376 and 420): `do_wade`, `do_swim`, `do_lie`, `do_ride`, `do_fish`, `do_volley`, `do_watch`, `do_launch`, `do_row`. `toSpot` (line 116) is reused. Swimmers do not speak; the E prompt hides while `mode` is `swim`.
- **Schedule** (`schedule.js`): `beachWeight(hour)` peaks 11-16 h; `CLIP_FOR_ACT` (line 156) gains `swim: swim_crawl, wade: wade, lie: lie_back, fish: fish_wait, paddle: paddle_stand, ride: ride_windsurf|ride_kite, volley: volley_bump, watch: lifeguard_watch`.
- **Lanes** (`plan.coast.lanes`): swim lanes inside the buoy line and out to the raft; paddle and kayak loops outside it; ride courses east-west at z 230-420 (the south breeze makes both tacks beam reaches, so riders cross the view left to right and right to left, and leave and re-enter behind the headlands, so no turn is ever on screen).
- **Reactions** (`reactions.js`): the lifeguard whistles and calls "Mas aca, joven. Dentro de las boyas." when the player is within 12 m of the line and heading out.
- **Lines** (`people/lines/`): vendors (cocadas, jugos, agua de coco), the fisherman, the lifeguard, visitors; Spanish, with the English line as everywhere else.

### 4.3 Clips needed (none of these exist; `tools/blender/people_build.py`, same rig, 24 fps)

Priority 1 (17): `swim_crawl` 32 frames, `swim_breast` 48, `tread` 48, `float_back` 96, `dive_in` 30 (one-shot), `wade` 24, `wade_run` 16, `lounge_sit` 96, `paddle_stand` 36, `ride_windsurf` 48, `ride_kite` 48, `fish_cast` 60 (one-shot), `fish_wait` 120, `fish_reel` 48, `lifeguard_watch` 120, `whistle` 36 (one-shot), `lie_back` 120.
Priority 2 (11): `splash` 48, `lie_front` 120, `dry_off` 72, `throw_ball` 40, `volley_bump` 36, `volley_set` 36, `volley_spike` 36, `kick_ball` 30, `paddle_kneel` 36, `row` 48, `haul_net` 72.
Reuse: `run` (jog), `walk`, `wave`, `sell`, `walk_carry`, `sit_idle`, `talk`.

Until `lie_back` exists, sunbathers reuse the sleep trick (`idle_a` with the root laid down, `world.js`). Swimmers are authored with the torso horizontal relative to the root (the runtime pitches the root), so the clips carry limb motion only. The sea mesh's own alpha hides the submerged half. A ring ripple quad (instanced) under each swimmer sells the waterline. Size: about +2 MB in `people.glb` or a separate animation-only file loaded with it [A].

### 4.4 Props and riders

- **Riders are NPCs** (same schedule, sim and clips) with a vehicle prop: windsurf rig (board 2.6 x 0.65 m, 5.5 m2 sail, boom, mast: 450 triangles), SUP 3.2 m with a 1.7 m paddle, kitesurf twin-tip 1.4 m, kayak 3.4 m, lancha 5.5 m with an outboard, rowing boat 3.6 m.
- **Kites.** 9 m wing of 6 panels (140 triangles, vertex colours or a small atlas), flying 20-30 m up on two lines: one `LineSegments` for the whole fleet (24 vertices, rebuilt each frame), taut, so no sag model.
- **Far riders.** `VIEW_MAX` is 95 m (`world.js:15`); riders live to 480 m: beyond 95 m an `InstancedMesh` impostor (board 20 + body 40 + wing 40 triangles, one call, per-instance colour) replaces the figure.
- **Wakes** (cut-first): a uniform array of 16 positions feeds a foam trail term in the sea shader.
- Other props: umbrellas, loungers, towels, balls, rods, nets, coolers, buoys, flags, volley net.

### 4.5 People tests (A4)

`tests/people-beach.test.mjs` (Node, with `Spots` and `brain`): at 13:00 at least 12 beach spots are held; at 05:00 the fishermen stand at the pier; no lane leaves the swim polygon or crosses sand; swimmers' lanes lie in depth >= 1.5 m; riders never enter the swim polygon. Mutations: move a lane onto sand, empty the 13:00 pool, delete a clip. `tests/people-art.test.mjs` (or `people-legs.test.mjs`) gains the new clip names, frame counts and loop flags. The rubric's C9 (T-pose, sliding feet) needs the swim clip speed matched to `swim` speed: the new clips carry `walkSpeedMps`-style speeds in `people_meta.json`.

Dependency: the new figures and the wearable swimwear layer (Codex). Fallback until then: street clothes with a darker, wet tint through the existing recolour alpha slot.

## 5. Audio (A1: `js/audio/mix.js`, `beds.js`, `library.js`, `foley.js`, `engine.js`)

- **Zones.** `ZONES` (`mix.js:14-24`) gains `playa` (wind 0.7, traffic 0.35, murmur 0.6, children 0.7, birds 0.9, dogs 0.2, horns 0.2) and `mar`; keys `surf` and `gulls` join `ZONE_KEYS`. `plan.areas` gets Playa and Mar polygons.
- **Surf bed.** Level `surfGain = exp(-dist / 45) x (0.5 + 0.5 x wind) x zone.surf`, with `dist` the distance to the nearest shore point; at the spawn that is 51.7 m, so gain about 0.32 and the surf is faintly audible behind the player: the invitation to turn round [I]. It is a moving point emitter at `coast.nearestShore(x, z)` (a line source made of one point per listener). Synth: noise with a 7-9 s swell envelope (2.5 s rise, 3 s crash, 2 s hiss), two decorrelated channels, low-pass about 3.5 kHz; a second shoreline wash layer, high-passed pink noise at 0.12 Hz. New beds in `BEDS` (`beds.js:9`) and `MAKERS` (`:225`): `surf`, `underwater`.
- **Gulls.** `rates.gulls = 6 per minute x zone.gulls x day`, four call variants (one-shots, `foley.js` `bird` machinery).
- **Emitters** (`buildEmitters`, `mix.js:126`): kiosk radios (`radio`), kiosk grills (`cook`), the volleyball court (`court`, ball thuds from A4's `volley` events), buoy bell (new `bell`, positional, one clank every 5-9 s), kite flutter (up to 3 nearest kites within 120 m, AM noise 6-10 Hz), halyard clinks at the pier.
- **One-shots.** `player:splash` (small, medium, large by speed), strokes (alternating plash 0.7 s apart), dive bloop, surfacing gasp, lifeguard whistle, a wave crash timed by `sea.crestTimes` at the nearest shore (at most one per 6 s).
- **Footsteps** (`foley.js` SURFACES): `sand`, `wetsand`, `shallow`, `wade`, `jetty` (hollow planks), `rock`.
- **Underwater.** Reuse the indoor `bedLP`: cut-off 500 Hz, all beds x 0.25 except `underwater` (brown noise low-passed at 400 Hz plus bubbles, heartbeat when breath is low), crossfade 0.15 s at the surface.
- **Night.** Crickets x (1 - 0.5 x surf); gulls follow `day`.
- **Tests.** `tests/audio-mix.test.mjs`: surf at the spawn above 0.2 and at the ridge near 0, underwater cut-off 500 Hz; `audio-library.test.mjs`: new beds render finite, non-silent, no clipping. Mutations: set the surf distance law to 0, remove the LP.

## 6. Phased plan

### 6.1 Files per builder

**A5 (world, `js/world/**`, `tools/blender/world_*`, `assets/models/world/**`):** new `coast.js` (pure: constants, `seabed`, `heightAt`, `surfaceAt`, `limit`, shore, swim polygon, lanes, climbs, POIs, nav, areas, landmarks), `coastmesh.js`, `coastprops.js`, `shorelife.js` (gulls, crabs, fish, system order 41, patterned on `life.js`); edits `plan.js` (composite `heightAt`, `plan.coast`), `nav.js`, `places.js`, `periphery.js`, `vista.js`, `terrain.js` (perimeter, thinning, `coast` step after `terrain`), `props.js` (steps `coastprops`, `shorelife` before `navfit`), `occupancy.js` (grid to z = 160), `kit.js` (a `claimBackView` fan south of the spawn), `matdefs.js`, `names.js`, `signs.js`, `discover.js`; Blender `world_beach_*.py` for the prop sets. Tests: `world-coast.test.mjs`, edits to `world-nav`, `world-plan`, `headless.mjs` (the physics world includes the coast colliders).
**A1 (engine and water):** section 3.3 (14 asks) and 5.
**A2 (promenade architecture, `js/arch/**`):** new `promenade.js`, `pier.js`, `kiosks.js`, `beachfronts.js` (A5's `coast` step calls them; A2 owns geometry and colliders); edits `layouts.js` (the `alley` back door for lots flagged `beachDoor`: L12, L14, L50) and the rear facade passes for L11, L13, L15, L51; tests `arch-promenade.test.mjs`, `arch-pier.test.mjs`, edits to `arch-entrances` (the new doors open and join the street graph) and `arch-walk`.
**A4 (people and sports):** section 4 (`spots.js`, `brain.js`, `schedule.js`, `npc.js`, `world.js`, `rig.js`, `props.js`, `cast.js`, `reactions.js`, `lines/`, `index.js`, `people_build.py`, `people_meta.json`).
**Lead:** the oracle hook, `stuck-lib.mjs` limit, metrics views and gates, `dev/REQUESTS.md`, Codex runs through A1.
**A3 (interiors):** nothing unless the kiosks get an interior; the lifeguard logbook is a paper in the shared reader.

### 6.2 Phases, tests, gates

| phase | what | exit |
|---|---|---|
| 0 | A5 `coast.js`, composite `heightAt`, perimeter, nav, `world-coast.test.mjs`; lead oracle hook, `stuck-lib` limit, quiet re-baseline | every current suite green; stuck sweep (new limit) and trapcheck: no new clusters, none STUCK; every new check seen failing |
| 1 | the sea exists: A5 `coastmesh.js`, periphery and vista edits, terrain thinning; A1 `sea.js`, `water.js`, underwater, swim, surfaces, map, base surf and splash, metrics views | walk spawn, sand, wade, swim, dive, surface, meet the limit; postcard view at or under 2.5 M with the pay list applied; non-sharing beach views under 1.2 M; boot under 25 s; no console error |
| 2 | the front: A2 promenade, pier, kiosks, rear facades; A5 furniture, boats, palms, dunes, signs, discoveries, shore life; A1 audio set; Codex textures and models | rubric 1, 2, 7 evidence by screenshots (LOOK at them); stuck sweep; payload under 60 MB; responsive pass |
| 3 | the people: A4 clips, spots, modes, schedule, riders, impostors, lines (needs the new figures; swimwear as fallback) | `people-beach` green; 13:00 and 05:00 snapshots; C9 check; budget with the crowd |
| 4 | polish and cuts (2.5 order), reviewers on categories 1, 2, 4, 6, 7, 8, 9 | caps C1-C11 clear |
| 5 (optional) | a rideable board for the player (fork 4) | separate request |

Every phase: stuck sweep (`tests/stuck.mjs`) and `tests/trapcheck.mjs` with no new clusters; `npm run test:responsive` filtered to la-ladera (M12: no sideways scroll, nothing under the almanac pill, the new toasts and legend included); `tests/payload.mjs` under 60 MB; boot under 25 s and draw calls and triangles per view from `tests/metrics.mjs`; zero console errors, 404s and magenta (C1, C7); the suites of the files touched. All headless, quiet, low priority; scratch in `.scratch/<agent>`.

### 6.3 Acceptance, for the reviewers

1. From the spawn the surf is audible; turning round shows the Plaza del Mar, the stairs, the pier and the sea on one axis.
2. A visitor reaches the sand by five stairs and a ramp, never by a gap; no gap in the promenade rail.
3. Wade, swim to the raft, climb it, jump off the pier, dive to the moped, surface, and be turned back at the buoys, in under five minutes, with no stuck spot.
4. Sun glitter at golden hour; the horizon melts into haze; at night a moonlit sea and the headland village lights.
5. At 15:00 there are swimmers, waders, sunbathers, a volleyball game, vendors and at least six riders crossing the view; at 05:30 fishermen on the pier.
6. Each new test fails once when its feature is broken.

## 7. Codex asset prompts (A1 runs Codex; textures and sprites; geometry is Blender procedural by A5, A2 and A4)

Materials go into `js/world/matdefs.js` as `{ color, rough, tile, prio, desc }` with `desc` as the brief (style as the existing entries). Suffix for every image: photographic, flat even daylight, no cast shadow, no text unless stated; tile 1024 or 512 as marked.

| material (tile m) | `desc` brief |
|---|---|
| `sand_dry` (2.5, 1024) | warm pale-gold beach sand, fine grains with scattered tiny shell fragments and a few dark mineral flecks, subtle wind ripples, top-down, seamless |
| `sand_wet` (2.5, 1024) | the same sand soaked, darker tan-brown, smooth with a faint sheen, tiny bubble holes and a few worm casts, top-down, seamless |
| `seabed_sand` (3, 1024) | clean submerged sand ripples in parallel ridges, pale grey-gold, a few shell bits, even lighting as if photographed in a shallow clear lagoon, seamless |
| `seabed_rock` (3, 512) | rounded dark volcanic stones in sand, green algae film, a few barnacles, seamless |
| `rock_sea` (2, 1024) | angular grey-brown granite breakwater boulders with white salt crust, black wet patches, barnacle bands at the base, seamless |
| `seawall_concrete` (2, 512) | poured pale concrete sea wall with horizontal formwork lines, salt staining, a few rust streaks from rebar, seamless |
| `promenade_pavers` (2.4, 512) | sand-coloured concrete pavers 40 cm square with thin joints, sand drifts in the joints, a few cracks, top-down, seamless |
| `jetty_planks` (2, 512) | weathered silver-grey hardwood pier planks with dark nail heads and gaps, salt bleaching, top-down, seamless |
| `pile_wood` (1.5, 512) | creosoted wood pile, dark brown, green slime at the base, white barnacles and mussels, vertical wood grain, seamless horizontally |
| `rope_hemp` (0.5, 256) | thick twisted hemp rope, tan, seamless along its length |
| `thatch_palm` (1.5, 512) | palm-leaf thatch roof, overlapping dry fronds, golden-brown and silver, top-down, seamless |
| `canvas_stripe` (1, 512, tintable) | beach umbrella and lounger canvas, thick cotton, vertical bands (white and one colour, the colour is tinted in code), faint weave |
| `water_ripple_n` (6, 256, normal map) | tileable small-wave ripple normal map, soft overlapping ripples, no dominant direction |
| `foam_noise` (6, 256, alpha) | tileable sea-foam lace: white bubbles and tendrils on black, soft edges |
| `caustic_tile` (4, 256) | tileable underwater caustic network of bright cell lines on black, soft |
| `boat_hull_paint` (3, 512) | scuffed fibreglass fishing-boat hull, white above and cobalt blue below a red waterline stripe, rope scars, dirty waterline, seamless |

Atlases and decals (non-tiling, `uv: 'unit'`, alpha where marked):

1. **Sail and kite panels** (1024 x 512 atlas): 6 colourways of a windsurf sail (panelled cloth with a clear window and a printed number) and 6 colourways of an inflatable kite wing (striped panels, white seams), flat, front view.
2. **Board decks** (1024 x 512): 8 designs for SUP, windsurf and kite boards (deck pad texture with bold graphics, flat top-down).
3. **Towels and bags** (512 x 512): 12 striped and printed beach towels, flat top-down, plus 4 canvas bag tops.
4. **Signs and menus** (1024 x 512, Spanish, text allowed): Zona de bano, Bandera roja, Prohibido el paso, Cocadas, Ceviche, Jugos naturales, Helados, Alquiler de tablas, Cooperativa de pescadores, Salvavidas. Hand-painted lettering on weathered boards.
5. **Boat names** (512 x 256, alpha): hand-painted names on a transom (Maria del Mar, La Esperanza, San Pedro, Brisa), cream and red lettering.
6. **Gull sprite sheet** (1024 x 256, alpha, 8 frames): a seagull in flight (4 flap frames, side view) and standing, walking, and cleaning poses, no background.
7. **Fish sprites** (512 x 256, alpha): three reef species (silver jack, yellow-striped grunt, blue tang), side view, 2 tail frames each.
8. **Crab and shell** (256 x 256, alpha): a pale ghost crab top-down, a conch, a scallop.
9. **Seagrass and coral cards** (512 x 512, alpha): a tuft of turtle grass, a branching coral head, a brain coral, as vertical cards.
10. **Palms**: use the existing `FROND` and trunk machinery; ask for a coconut palm crown variant (1024 x 512, alpha) only if the atlas shows repetition on the promenade.

Geometry briefs (Blender, procedural, textures above): windsurf rig 450 triangles; SUP 120 + paddle 40; twin-tip 60; kite wing 140 and bar 30; kayak 150; lancha with outboard 700; rowing boat 300; buoy 60 and bell buoy 250; umbrella 120; lounger 250; volleyball net 12 (alpha mesh) and posts 40; lamp 150; rock instances 3 variants x 120; gull 80 (two wing poses, flap by vertex animation); crab 90; fish 60 x 3; ladder 120; piles 16. Sets: `world/beach_props.glb` at most 1.5 MB, `world/pier_parts.glb` 0.4 MB, `world/coast_life.glb` 0.4 MB (inside the 6 MB `models/world` cap).

## 8. Forks for Arthur, and risks

**Forks (my recommendation first):**
1. Breath: soft and never lethal (recommended); none; or real drowning with a respawn.
2. Spawn: keep it facing the hill (the oracle requires it; recommended) and add a title-card option "Empezar en la playa" later; or turn the spawn to the sea and rewrite the oracle rule.
3. Tide: none in v1 (recommended); a slow 0.12 m tide later would move the waterline 2 m.
4. A board the player can ride (rent a SUP at a kiosk): out of v1 (Phase 5); it needs a first-person paddle and a vehicle state.
5. The valley city across the old south is lost (1,453 far houses and their night lights). The headland village and lighthouse replace it. Confirm.
6. Hazards (jellyfish, rip currents, sharks): none (recommended); the "current" at the buoys is the only barrier.
7. Children: at the water in their own clothes, never in swimwear (the garment library is adult only).

**Risks:**
- R1. `HALF = 100` and the literal 100 are everywhere: 142 matches in 54 files of `js/` (`field.js` 13, `periphery.js` 18, `walls.js` 12, `vista.js` 7, `terrain.js` 7 [M]), plus `player.js:282` and the oracle. I keep `HALF` as the plot and add the coast as a second sector in `coast.js`; a grep sweep in Phase 0 lists every consumer.
- R2. Clips are the longest pole (28 clips plus the new figures plus wearable swimwear). Swimmers and riders can slip behind the world; sand, sea, pier and sound do not wait for them.
- R3. The 12 ms gate already failed once on an interior in my low-priority run (13.29 ms, min 10.64) [M]; re-measure quiet before attributing any beach cost.
- R4. Terrain thinning touches every town view; it needs the crack fix and a before and after screenshot pair. It is also the cheapest way to pay for the beach.
- R5. Water shader cost on weak GPUs; the quality tiers (2.1) are the answer.
- R6. The south view of every existing frame changes (no valley city). Re-check the `ridge-looking-south` and `landmark-mirador` views by eye.
- R7. `nav.connected`: any wade node past depth 0.5 m or a plaza step over 7 m breaks the oracle; the lanes stay out of the graph.
- R8. The far-tile seam and the coast mesh share one height function; the seam test in `world-coast.test.mjs` (item 1) guards it.

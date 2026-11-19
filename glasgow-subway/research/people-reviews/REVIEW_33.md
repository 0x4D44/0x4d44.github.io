# Under Glasgow: independent review of the people (review 33)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4d8e3ea0`. Two commits since review 32 touch the people (read-only `git diff 32e10c8a 4d8e3ea0`):
- `index.js` alighting: a seated rider is not made a leaver when anyone not seated is within 0.6 m of their rise spot (was 0.55 m), or when another chosen leaver's rise spot in the same car is within 0.6 m.
- `people.js` haggis: for each seated person near it, a second avoid point 0.45 m in front of their centre (their feet) is added.
- `gait.js`: `P.bob = P.bob0 * (1 + 0.39 * smoother((kv - 1) / 0.3))`, so the pelvis bob grows by up to 39 % above about 1.2 m/s.

`people.glb`, `people_lod.glb`, `_canSit`, garments, faces and the rest of the walk code did not change. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before reading bones. The container restarted once, after every batch had finished; only the haggis-on-stairs loop was cut short (1 of 5 stations ran; that one caught the owner on the stairs).

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.89 (7.890). Gate NOT met.** Four categories are at 8 or above: Behaviour 8.32, Luggage 8.08, Range 8.06, Arms 8.04. Below 8: Walking 7.60, Faces 7.68, Clothing 7.70, Whole bodies 7.98.

In short:
- **Claim 1 works.** In 12 rides of 200 s, 66 seated riders rose to get off. The nearest non-seated person to any rise spot was 0.61 m (median well over 1 m). No standing pair in a car was closer than 0.61 m, and no hand came within 10 cm of another body in any of the 12 rides (review 32: hands 1-9 cm on thighs in 4 of 14).
- **Claim 2 works for seated legs.** In 6 runs with the owner seated in a car (including review 32's Shields Road outer case), the haggis was never inside another person's legs (review 32: 68 s in a stranger's foot).
- **But the haggis has two new faults** that the claims do not touch. Its height is always its owner's height (`poseHaggis(pet, p.y)`), and nothing keeps it off walls:
  - **Inside the wall:** Partick inner ride, the owner stood with his back to the platform wall. The haggis's place, 0.78 m behind him, was inside the wall for 60 s (603 ticks off the floor). The lead runs from his hand down into the wall (`e/PETOFF.png`, first two panels). Govan outer: 13 s.
  - **Buried in the stairs:** Govan explore, the owner walked down the stairs with the haggis 1 m behind him. For about 8 s the haggis was 0.60 m below the steps under it (`e/st_govan.log`: `py - fy` = -0.60 from t = 17 to 23 s). Going up, it would float the same amount above them.
- **Claim 3: the numbers are exact, but it is a trade.** Overall 9.48, SMO p10 7.8, mid-stance knee 17.6 deg, LEG 7.7 (p10 5.8), loading knee 27.5 deg: all as stated. But the worst recording dropped to 7.6 (adult_heel_boots @1.9), swing-knee and loading-knee scores fell (8.8 to 8.5, 8.1 to 7.7), and the pelvis bob at 1.7-1.9 m/s rose from a median of 55 mm to **78 mm (max 92 mm)**. Published centre-of-mass excursion at 1.6 m/s is about 48 mm, so brisk walkers now bounce. Stills at 1.8 m/s still show the heel wearers crouched (`n/BW.png`).
- **Not changed and still there:**
  - Stop slides: **16 of 30** pauses over 10 cm (review 32: 7 of 24). ya_smile_dress slid 0.26 m on the near model, 2.1 m from the camera. Toggles up to 47 a minute (teen_hood).
  - Turned-away boarders: 2 of 12 ended within 1 m of the edge. sum_chino_shorts_m stood 185 s at 0.54 m from the edge (21 m from the camera).
  - Who sits: every seated rider in two runs wore trousers, shorts, leggings or trews.
  - Children alone at poles: girl_school_kilt again (`e/EYE.png`).
  - Garments: kilt knee, the sporran off the side, midi slit and waist fragments, strip sleeves (`n/KW.png`).
  - Faces (18 new ones looked at) and cap hair: code and models unchanged.
- **Stander drift after arrival: not seen.** I tracked every stander's position every 0.5 s in 12 rides (`DR` lines). None moved more than 10 cm while standing. I could not reproduce review 32's 0.72 to 0.40 m drift, so I cannot say it is gone.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review33/`. I deleted the walking recording (542 MB) after scoring; `m/items.log` holds the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.4 | **7.60** |
| 2 | Arms and hands | 10 | 8.6 | 7.2 | **8.04** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.8 | 7.6 | **8.32** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.0 | **8.08** |
| 8 | Whole bodies | 15 | 8.5 | 7.2 | **7.98** |
| | **Weighted mean** | 100 | | | **7.89** (7.890) |

0.20x7.60 + 0.10x8.04 + 0.10x7.68 + 0.10x8.32 + 0.10x8.06 + 0.15x7.70 + 0.10x8.08 + 0.15x7.98 = 1.520 + 0.804 + 0.768 + 0.832 + 0.806 + 1.155 + 0.808 + 1.197 = 7.890.

Changes against review 32 (7.874):
- **Behaviour +0.10 (typical 8.7 to 8.8, worst 7.5 to 7.6).** Rises now keep room, and there are no 0.40 m pairs. Still in the worst tenth: turned-away boarders at the edge, who sits, children alone, and the player once held 5 s in an aisle.
- **Arms +0.18 (typical 8.5 to 8.6, worst 6.9 to 7.2).** No hand on a neighbour in 12 rides. Grips at most 6.7 cm (2 of 85 over 4 cm; review 32 saw 14 cm). The phone hand and the tote are unchanged.
- **Walking -0.04 (worst 6.5 to 6.4).** SMO p10 is better, but the worst recording is worse, pause slides are worse in this sample, and the brisk bob is now well above normal.
- **Luggage -0.04 (worst 7.1 to 7.0).** Out of seated legs now, but into walls and stairs.
- **Faces, Range, Clothing, Whole bodies: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A seated rider does not rise within 0.6 m of another riser's spot or a stander | **True, and it works.**<br>- 66 rises in 12 rides. The closest non-seated person at the rise was 0.61 m.<br>- No standing pair closer than 0.61 m.<br>- 0 hand hits under 10 cm (review 32: 4 of 14 rides). | `e5/n6_*.log` (`RISE`, `P`, `H` lines) |
| 2 | The haggis keeps 0.36 m from a seated person's feet | **True for seated legs.**<br>- 6 runs with the owner seated in a car: 0 ticks inside anyone's legs. Review 32 had 68 s.<br>- On platforms: 3 ticks inside a walker's foot (Partick outer), and 0.4 s inside woman_dress's foot at a door (`e/p3_sr.log`, t = 42 s).<br>- **New:** in the wall for 60 s; 0.6 m under the stairs (see below). | `e/pet_*.log`, `e/p3_sr.log`, `e/PETOFF.png`, `e/st_govan.log` |
| 3 | Bigger bob above 1.2 m/s; overall 9.48, SMO p10 7.8, kneeSt 17.6, LEG 7.7/5.8, kneeLd 27.5 | **The numbers are exact.**<br>- Also: worst recording 7.7 to 7.6, kneeSw 8.8 to 8.5, kneeLd score 8.1 to 7.7.<br>- Bob at 1.7-1.9 m/s: median 55 to 78 mm, max 66 to 92 mm (adult_camo_cap). About 1.6 times a real brisk walk.<br>- Heel wearers still crouch at 1.8 m/s. | `m/items.log`, `n/BW.png` |
| 4 | Not changed: drift, slides, toggles, turned-away, who sits, garments, grips, children, cap hair, faces, phone hand, tote | **True, except two I could not see again.**<br>- Slides: 16 of 30 over 10 cm. Toggles up to 47 a minute.<br>- Turned away: 2 of 12 at the edge.<br>- Who sits, garments, children: as before.<br>- **Drift: not seen** in 12 rides.<br>- **Grips:** at most 6.7 cm this sample. | `pz/p_bs.log`, `v/aw_*.log`, `g/*.json`, `n/KW.png`, `c/sg.log`, `e5/n6_*.log` (`DR`) |

## 2. Status of REVIEW_32's top ten

| # | REVIEW_32 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | **Partly.** SMO p10 7.1 to 7.8. LEG unchanged (7.7, p10 5.8). The worst recording is worse (7.6). The bob is now too big. Heel wearers still crouch. | `m/items.log`, `n/BW.png` |
| 2 | Garments and who sits | Not fixed. | `n/KW.png`, `g/pa.json`, `g/se.json` |
| 3 | Pairs 0.40 m apart, hands on thighs | **Fixed in this sample:** 0 pairs under 0.61 m and 0 hands within 10 cm in 12 rides. | `e5/n6_*.log` |
| 4 | Stop slide, toggles | Not fixed, and worse in this sample: 16 of 30 over 10 cm; 0.26 m at 2.1 m; 47 a minute. | `pz/p_bs.log` |
| 5 | Turned-away boarders at the edge | Not fixed: 2 of 12; 185 s at 0.54 m from the edge. | `v/aw_ib.log` |
| 6 | Grips open | Not seen this round: max 6.7 cm, 2 of 85 over 4 cm. The code is unchanged, so the 14 cm case may still occur. | `c/sg.log` |
| 7 | The haggis under seated legs | **Fixed.** New faults instead: in the wall, and under the stairs. | `e/pet_*.log`, `e/PETOFF.png`, `e/st_govan.log` |
| 8 | Faces | Not fixed. 18 new faces looked at; see 3.3. | `f/N.png`, `f/S.png`, `f/Z.png` |
| 9 | Cap hair, phone hand, tote | Not fixed (code unchanged). | — |
| 10 | Children alone at poles | Not fixed: girl_school_kilt alone at a pole, Kelvinhall inner. | `e/EYE.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.60 (typical 8.4, worst 6.4)
- Instrument over all 99: overall 9.48; LEG 7.7, p10 5.8; SMO p10 7.8; worst adult_heel_boots @1.9 m/s = 7.6. 8 of 495 recordings under 8.5 (review 32: 10).
- Bob at 1.7-1.9 m/s: median 78 mm, eight people at 88-92 mm. The instrument's PEL.bob still gives 10, but that is above published values. A bouncing brisk walk is likely, though I could not watch it.
- Stills at 1.8 m/s (`n/BW.png`): ya_tube_heels and adult_heel_boots still walk with bent knees and feet close together for most of the stride. woman_midi crouches in one phase.
- Stop slides at St Enoch inner: 16 of 30 pauses over 10 cm; ya_smile_dress 0.26 m on the near model at 2.1 m; adult_vneck 0.29 m at 12 m.
- Toggles: teen_hood 47 a minute, adult_casual2 39 a minute.

### 3.2 Arms and hands: 8.04 (typical 8.6, worst 7.2)
- No hand within 10 cm of another body in 12 rides.
- Grips: pole median 2 cm, max 6.7 cm; rail median 1.2 cm, max 4.3 cm (`c/sg.log`).
- Unchanged: the phone hand is flat in `phone_call`. Sit-phone shows an empty hand in the viewer (`n/SIT.png`), but a phone shows in the game (`e/EYE.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
I looked at 18 faces not in review 32's list, neutral and smiling (`f/N.png`, `f/S.png`; ids in `f/ids.txt`). They differ by age, sex and skin tone. Smiles are small and fitted, but barely visible on some (ya_knit). Faults (`f/Z.png`):
- elder_shorts: a separate forehead patch with a jagged edge under the hair, a red dot on the cheek, grey-blue squinting eyes and blue-grey brows. It reads as a broken face at 1 m.
- teen_ginger: a hairline cut straight, with bald temples.
- girl_ginger: a crooked smile even at neutral, and hair strands across the face.
- Dotted brows on most faces (adult_camo_cap, staff_woman).
- Thick, downturned mouths on several.
- Unchanged from review 32: girl_small, sum_denim_shorts_m, woman_elder.

### 3.4 Standing, sitting, behaviour: 8.32 (typical 8.8, worst 7.6)
Good:
- Rises keep room (66 rises, min 0.61 m).
- No pair under 0.61 m, no knee-zone contact (`leg<0.10` = 0 in all 12 rides), and no stander drift.
- No far model within 6 m, no duplicates, no overlaps, no stair stalls (`g/pa.json`, `g/se.json`).
- No vanishing near the camera (`v/go.log`: releases at 4-23 m, all standing still).

Worst tenth:
- Turned-away boarders: sum_chino_shorts_m stood 185 s at 0.54 m from the edge.
- Skirts, dresses, kilts and luggage owners never sit.
- girl_school_kilt alone at a pole.
- The player's walk through a full St Enoch outer train was held 5.3 s at z = 3.71 between a pole holder (teen_girl, x = 0.22) and a seated knee (woman_elder). 5 of 6 walks finished (review 32: 6 of 6).

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- Children alone at poles again.

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
Mix:
- Cars: 0 of 56 car samples over half (Hillhead outer).
- Kelvinbridge ride saloon: trousers at most 6 of 12 by the game's classes (7 of 12 if trews count as trousers).
- Cowcaddens explore: 0 samples over half.
- Seated: 8 more people the game seats, in all four sit clips, front and side (adult_camisole, sum_crop_denim, sum_tube_denim, ya_tube_heels, adult_cyclist, ya_tattoo_tank, adult_harem, adult_fisherman_leggings). All clean at body scale (`n/SIT.png`).

Faults (unchanged, `n/KW.png`):
- man_kilt_casual: knee through the kilt; sporran swinging off the side.
- woman_midi: jagged slit; red fragments at the waist.
- girl_school_kilt: ragged strip sleeves.
- Seated cars are trousers, shorts and leggings only.

### 3.7 Luggage: 8.08 (typical 8.8, worst 7.0)
- Bags are on laps when seated (carrier, ruck, shopper, handbag, tote); trolleys stand on the floor; cases and holdalls are held (census in `g/*.json`). Eight bag kinds on new bodies, standing, walking and seated (`n/BAG.png`).
- A long-haired wearer's rucksack becomes a tote by design (teen_girl).
- The haggis:
  - out of seated legs now;
  - in the wall behind a wall-backed owner for 60 s (Partick inner), with the lead into the wall;
  - 0.6 m into the stairs for about 8 s (Govan);
  - 3 ticks in a walker's foot (Partick outer) and 0.4 s in a boarder's foot at a door.
  - When its owner sits it tucks under his shins (`e/PETOFF.png`, last panel). This is acceptable.

### 3.8 Whole bodies: 7.98 (typical 8.5, worst 7.2)
- Near model: cap hair (unchanged), kilt knee, school sleeves, midi waist, elder_shorts' forehead patch.
- Far model: 10 people, standing and walking (`n/FAR.png`). Whole and readable. ya_ginger_long's blouse shows dark triangles at one side. Never within 6 m in play (`lod6 = 0`).

## 4. Top ten defects, in priority order

1. **Brisk walk: crouch remains, and now a big bob.** LEG 7.7 (p10 5.8). Worst recording adult_heel_boots @1.9 = 7.6. Bob at 1.7-1.9 m/s is a median of 78 mm and a max of 92 mm, against about 48-60 mm in life. Heel wearers walk bent-kneed.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12` (look at the `bob` column at 1.6+). For stills: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`.
2. **Garments and who sits:** kilt knee and sporran, midi slit and waist, strip sleeves; no skirt, dress, kilt or luggage owner ever sits.
   - Reproduce: `node shoot2.mjs 0 man_kilt_casual,woman_midi,girl_school_kilt none walk@150,walk@162,walk@174 n/kw/k legs 1.7`; `python3 cen3.py g/pa.json`.
3. **Foot slide while stopping, toggles:** 16 of 30 pauses over 10 cm; 0.26 m on the near model at 2.1 m (ya_smile_dress); up to 47 a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=st-enoch" 200`.
4. **The haggis in walls and stairs.**
   - Its place 0.78 m behind the owner is not checked against the floor. A wall-backed owner puts it in the wall: 60 s at Partick inner, 13 s at Govan outer.
   - Its height is the owner's (`poseHaggis(pet, p.y)`), so on stairs it is 0.6 m under the steps going down (or over them going up).
   - Fix: clamp its place to the crowd's floor (`_onFloor`), and take its y from `q.yAt(h.x, h.z)` when the owner has one.
   - Reproduce: `node gpet2.mjs "mode=ride&q=high&line=inner&station=partick" 150 e/x` (floor False 603); `node gstair.mjs "mode=explore&q=high&line=outer&station=govan" 120 e/st_govan`. The owner spawns at random.
5. **Faces:** elder_shorts' forehead patch and squint; teen_ginger's cut hairline; girl_ginger's crooked neutral mouth; dotted brows; plus review 32's girl_small and sum_denim_shorts_m.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/n "0:0" 0 8611 "" 14`.
6. **Turned-away boarders at the edge:** 2 of 12; 185 s at 0.54 m from the edge.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=ibrox" 300 > x.log; python3 aw2.py x.log`.
7. **Children alone at poles** (girl_school_kilt, Kelvinhall inner).
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=inner&station=kelvinhall" e/x 40 6`.
8. **Hair through caps on the near model** (adult_sport_cap, adult_cap_shorts), the flat phone hand in `phone_call`, the tote lifted by the phone hand. All unchanged code.
   - Reproduce: as in review 32 item 9.
9. **The player blocked in a full car's aisle** for 5.3 s, between a pole holder at x = 0.22 and a seated knee (St Enoch outer, 1 of 6 walks).
   - Reproduce: `node gwalk.mjs "mode=ride&q=high&line=outer&station=st-enoch" c/wk`.
10. **Grips** (not seen this round, code unchanged; review 32 saw 14 cm), and **pole holders in the aisle centre** narrowing it.
    - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=st-georges-cross" c/x 150`.

## 5. What I could not observe

- **No motion watched.** Bounce, slides, toggles and the haggis come from per-tick positions, bone distances and the instrument.
- **A clean picture of the haggis under the stairs.** Wall-side cameras hit the stairwell walls. The evidence is the logged heights: haggis y = owner y, and stair floor 0.6 m above it.
- **The 0.72 to 0.40 m stander drift.** It did not happen in 12 rides, so I cannot say whether it is fixed.
- **Blink and smile timing** in play.
- **Gaps under 0.6 m planned by boarders.** The 0.6 m rule applies to rises and fallback spots. Pole spots were never under 0.61 m in this sample.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk walk stills, side, 6 phases at 1.8 m/s | adult_heel_boots, woman_midi, man_commuter, teen_runner, elder_man_suit, ya_tube_heels | `n/BW.png` |
| Faces, neutral and smiling | 18 not in review 32 (`f/ids.txt`) | `f/N.png`, `f/S.png`, `f/Z.png` |
| Seated, 4 sit clips, front and side | 8 people the game seats (listed in 3.6) | `n/SIT.png` |
| Bags: stand, phone, walk, sit | 8 kinds on 8 new bodies | `n/BAG.png` |
| Garments in the walk | man_kilt_casual, woman_midi, girl_school_kilt | `n/KW.png` |
| Far model, standing and walking | 10 people incl. kilts, piper, top hat, dresses | `n/FAR.png` |
| Rises, pairs, hands, knees, drift, boarding log, 200 s rides | 12 rides: Govan, Partick, Hillhead, Ibrox, Kinning Park inner; Shields Road, Cessnock, West Street, St George's Cross, Kelvinhall, Cowcaddens, Buchanan Street outer | `e5/n6_*.log` (`gnb6.mjs`) |
| The haggis | 10 runs (6 with owner seated in a car, 4 on platforms) + 1 with the owner's own legs + stairs | `e/pet_*.log`, `e/p3_sr.log`, `e/st_govan.log`, `e/PETOFF.png` |
| Overlaps, far within 6 m, duplicates, census, who sits | Kelvinbridge outer ride, Cowcaddens inner explore, 200 s each | `g/pa.json`, `g/se.json` |
| Paused walkers | St Enoch inner, 200 s | `pz/p_bs.log` |
| Turned-away boarders | Ibrox inner, Partick outer, 300 s each | `v/aw_ib.log`, `v/aw_hh.log` |
| Vanishings | Bridge Street inner ride, 300 s | `v/go.log` |
| Car garment mix and grips | Hillhead outer, 150 s | `c/sg.log` |
| Walk through a full train | St Enoch outer, 6 walks | `c/wk.log` |
| Eye height in a car | Kelvinhall inner, 4 people x 3 views | `e/EYE.png` |

Next round, look at:
- the haggis against walls, at platform ends and on stairs;
- the bob at 1.6-1.9 m/s (watch it if anyone can);
- pole-spot spacing;
- pause slides on the near model.

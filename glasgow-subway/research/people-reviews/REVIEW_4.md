# Under Glasgow: independent review of the people (review 4)

Reviewed: HEAD `42c0422e` ("act on adversarial review 3"), served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611.
Scored against `research/people-rubric.md`: each category is 0.6 x typical + 0.4 x worst tenth. I judged from scratch and
did not start from REVIEW_1-3's numbers. Nothing in the repository was edited.

**Result: weighted mean 6.6. Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

All evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review4/`.
In stills, `_F` is the front quarter, `_S` the side, `_B` the back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.0 | 4.5 | **6.0** |
| 4 | Standing, sitting, behaviour | 10 | 8.0 | 5.5 | **7.0** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 4.0 | **5.8** |
| 7 | Luggage | 10 | 8.0 | 6.0 | **7.2** |
| 8 | Whole bodies | 15 | 6.5 | 3.5 | **5.3** |
| | **Weighted mean** | 100 | | | **6.6** (6.555) |

0.20x7.2 + 0.10x7.4 + 0.10x6.0 + 0.10x7.0 + 0.10x6.9 + 0.15x5.8 + 0.10x7.2 + 0.15x5.3 = 6.555.

The two cheap fixes the builder made (cross-fades, rider attention) are real and verified. They move categories 2-4 up a
little. The scores stay low because of cloth and body faults that are unchanged, and because of two faults new to this
round's sampling: the far model of `adult_oxford_shirt` and the seated long coats.

## What I could not observe

- **No motion watched.** Walking and clip changes are judged from 8-phase stills, the instrument and per-frame bone traces.
- **Game crowd stepping.** I drove the game with `sim.tick(0.1)` + `sim.sync(0.1)`, exactly as `frame()` does, and rendered only
  for screenshots. That is 10 fps of game time. The crowd's LOD choice, attention and smiles run in `sync`, so the counts are true
  frame-by-frame counts (`g4.mjs`).
- **Seated stills in the viewer have no seat.** In the viewer, `sitalt` clips (`sit_look`, `sit_cross_legs`) spawn in `stand` mode.
  Cloth judgements were made on `clip-sit` (true sit mode) wherever they differ. The seated far-model forearms raised in the viewer
  are the known viewer artefact. In the game, riders' hands are down (`v/kb_t20_y6.png`), so I did not score it.
- **Whether `adult_oxford_shirt`'s far model was already broken before this build:** not checked. `people_lod.glb` was rebuilt in this commit.
- **Faces of riders in the game.** Most riders look down at phones, and the faces I could frame were hair (`v/kb_t20_faces.png`).
  Rider smiles and gaze are measured, not seen.
- **Clip-change rates** across the two trains are inflated where the same id rides both circles (key collision in my tally).
  I used per-transition counts only from the ride run and the Ibrox run.

## 1. What I sampled (47 people)

| What | Who | Evidence |
|---|---|---|
| Stand (3 views) + `sit_idle`, `sit_phone`, `sit_look`, `sit_cross_legs`, full model. **22 people no earlier review leaned on** | man_hoodie, woman_bob, man_kilt_casual, woman_mini, teen_skater, ya_fedora, ya_tube_heels, ya_bootcut, adult_cap_baggy, adult_cyclist, adult_oxford_shirt, adult_camo_cap, adult_harem, girl_leggings, sum_tube_denim, sum_loose_shorts_w, teen_cutoffs, sum_denim_shorts_m, boy_shorts, girl_shorts, ya_knit, ya_shorts | `a/rA1.png`-`a/rA4.png` |
| 8 stride phases (frames 150-206), front and side | woman_coat, adult_beret, woman_midi, elder_woman_coat, man_highland, teen_skirt, man_kilt_casual, woman_mini, ya_tube_heels, adult_harem, sum_loose_shorts_w, adult_oxford_shirt, girl_shorts, ya_fedora (14) | `w/rW1F.png`, `w/rW1S.png`, `w/rW2F.png`, `w/rW2S.png`; leg zoom `w/rZ.png` |
| Seated cloth zoom, 3 sit clips | woman_coat, adult_beret, woman_midi, ya_winter, elder_woman_coat, adult_tattoo_muscle, woman_mini, man_kilt_casual | `b/rZS.png` |
| Faces at 0.85 m, neutral and smile 0.7: **36** | the 22 above + woman_student, teen_girl, teen_tee, teen_hippy, ya_ginger_long, sum_shorts_asian_m, woman_puffer, woman_scarf, girl, woman_elder, girl_school_kilt, adult_tattoo_muscle, teen_crop_leggings, girl_ginger | `f/F1.png`, `f/F2.png`, `f/S1.png`, `f/S2.png`; smile 0 vs 1.0 close `f/Z.png`; hair 3 views `b/rH.png` |
| Luggage: 10 kinds x stand / sit / walk / stair | ya_tube_heels, man_kilt_casual, adult_oxford_shirt | `l/bags_tube.png`, `l/bags_kilt.png`, `l/bags_ox.png` |
| Far model: stand, sit, walk | 12 people (`lod/rL1.png`, `lod/rL2.png`); **all 99 standing** (`lod/allF1.png`, `lod/allF2.png`) | zooms `lod/z_oxford.png`, `lod/z_misc.png` |
| Clip changes with cross-fade, 60-90 s each, standing and seated | adult_tie_suit, woman_midi, teen_runner, man_hoodie, ya_tube_heels, girl_shorts, adult_oxford_shirt | `pop4.txt` (and the first two in this report) |
| Walking instrument, whole roster | 99 people | `motion_all.txt`, `motion_worst40.txt`, recordings `motall/` |
| **Game**: Ibrox platform 150 s; St Enoch platform 60 s then board and ride 90 s; ride from Ibrox 150 s; Kelvinbridge board + ride (views at 20/45/90 s); Ibrox platform views at 12/35 s; Ibrox stair walkers | | `g/*.log`, `g/*_stats.json`, `g/*_c*.json`, `v/*.png`, `v/stair_ibx*` |

## 2. Per-category reasoning

### 2.1 Walking: 7.2 (typical 8.0, worst 6.0)

What works:
- Stride stills show heel strike, swing-knee flexion and toe-off on all 14 people (`w/rW1S.png`, `w/rW2S.png`).
- Elders stoop; the pencil skirts take a shorter step.

What the instrument says (whole roster, `motion_all.txt`):
- Overall 9.23 against 9.22 last round. **Nothing in the gait changed.**
- LEG mean 7.5, p10 5.2. ARM p10 5.1. SMO p10 6.9. TRN p10 3.3.
- Gate NOT MET. Worst recording: teen_skirt @1.6 m/s, 7.5.

Faults (`motion_worst40.txt`):
- **Crouched gait in short women and teens, not addressed** (the builder says so):
  - teen_skirt: knee 31 deg at mid-stance, 46 deg at loading.
  - Also ya_ginger_braid, sum_crop_bike, teen_crop_leggings.
  - In stills, adult_harem walk174 and ya_tube_heels 158/166 show both knees bent (`w/rW2S.png`).
- **A new fault from the pencil-skirt fix:**
  - woman_coat and adult_beret at 1.6 m/s: cadence 150 steps/min, step 0.54 m (STR.cad 3.0-3.5).
  - That is a mincing shuffle at speed. It comes from `cad x1.2` with `_paceK 0.85` (`people.js` `_gaitVar`, `_paceK`).
- In the game, stair walkers stand in `go` mode on the walk clip at 0 m/s for 5-15 s (2.4).

### 2.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)

What works:
- **Cross-fades are back.** `crowd.crossfade = 0.3` at runtime (`people.js:170`).
- Every clip change is now spread over about 0.3 s (`pop4.txt`):
  - Seated sit-to-sit: largest per-frame move 0.2-2.1 cm.
  - Standing phone raise: 2.8-5.3 cm per frame, over a 55-90 cm hand path.
  - Last round it was 7-9 cm in one frame with nothing after it.

Faults:
- **One arm swings about half as much as the other** (ARM.sym 52-66%) on teen_skirt, adult_beret, woman_coat, ya_ginger_braid and sum_crop_bike.
- adult_beret ARM.splay 3.8: the hand is outside the shoulder line.
- **The phone grip is a claw.** In phone clips, the fingers splay around the phone instead of closing on it (adult_cap_baggy, elder_man_cap; `f/Z.png`, bottom row).
- teen_runner has one 4.6 cm per-frame spike outside any transition (`pop4.txt`, baseMax).

### 2.3 Faces: 6.0 (typical 7.0, worst 4.5)

What works:
- **Riders now smile and look about.** Measured share of face samples within 9 m smiling above 0.3:
  - Ride: 2196 of 19286 rider samples (11.4%).
  - St Enoch: 3867 of 45875 (8.4%).
  - Ibrox: 953 of 10423 (9.1%).
  - Last round: 0 of 1512.
- Riders' eye targets change: 27-240 distinct gaze states per rider in 150 s (`g/ride_stats.json`).
- The 11 re-haired people now read female from the front: woman_puffer, woman_scarf, girl, teen_girl, woman_student, teen_tee, girl_school_kilt, girl_ginger, teen_crop_leggings (`f/F1.png`).
- girl_school_kilt's scalp band is gone (`b/rH.png`).
- woman_elder now has a lined, older face (`f/F1.png`).

Faults:
- **Smiles are faint and closed-mouthed.** At 0.7 they barely differ from neutral (`f/S1.png`, `f/S2.png` against `f/F1.png`, `f/F2.png`).
  At 1.0, man_hoodie's mouth is a lopsided smirk, and it is skewed even at rest (`f/Z.png`).
- **ya_fedora: a crumpled grey hat-band shard floats through the hair across the forehead,** and a spike sticks out at the side (`f/F2_ya_fedora_0_0.png`, `b/rH.png` row 3). There is no fedora.
- **Clone faces:**
  - man_hoodie and sum_denim_shorts_m have the same face and the same spiky black hair (`f/F2.png`). man_kilt_casual is near-identical.
  - woman_mini, ya_knit, girl_leggings and adult_harem are near-identical heads (`f/F2.png`).
- adult_cyclist has near-white irises: a blank stare (`f/F2.png`).
- Eyebrows are thin painted dashes on most young faces (`f/Z.png`).
- Hair cards:
  - teen_hippy: big flat sheets.
  - woman_puffer: strand cards with gaps.
  - sum_shorts_asian_m: notched temples and nape (unchanged).
  - adult_tattoo_muscle: speckled nape (`b/rH.png`).
- Platform waiters mostly face the track, and riders mostly look down at phones. So in the game you rarely see a face; I can neither credit nor fault that much.

### 2.4 Standing, sitting, behaviour: 7.0 (typical 8.0, worst 5.5)

What works:
- Clip changes blend (2.2).
- Riders are attentive (2.3).
- Boarding goes through the doors (`v/ibx_t35_y2.png`: teen_hood walking into the door gap).
- A full car reads well at eye height: riders on phones, a standing girl, poles held (`v/kb_t20_y6.png`, `v/kb_t20_y2.png`).
- Seated people sit on the seats.
- **Stair walkers now come down the stairs** (y 4.6 to 1.3 m; `g/ibx_stats.json` "stair"). Last round they were parked in one hidden spot.

Faults:
- **They jam at the foot of the stairs.** On the Ibrox platform beside the "Way out / Stairs" sign:
  - ya_ginger_long (case), ya_tee_jeans (holdall) and adult_smile_blouse (tote) stood in `go` mode on the `walk` clip at v = 0 for 5+ s (`v/stair_ibx.log`, `v/stair_ibx.png`).
  - Over 150 s, a dozen stair walkers crept down at about 5 cm/s, or stopped dead (man_beard, ya_spiky with a trolley, adult_heel_boots with a case; `g/ibx_stats.json`).
  - The same happened at St Enoch (elder_man_suit, adult_camo_cap stopped at y 0.6 for more than 10 s; `g/sten_stats.json`).
- **Seated cloth** (2.6): pencil skirts tent, and long coats balloon.
- Riders turn face and eyes only, by design. Their heads and bodies never turn.

### 2.5 Range of people: 6.9 (typical 7.5, worst 6.0)

What works:
- Platforms and cars mix women, men, teens, children, elders and staff.
- Elders are 1-8 per platform; there are children in every car.
- Skin tones are varied.

Faults:
- **Shared garments behind the variety:**
  - The "printed tee" garment (one mesh, re-printed per spawn) is on 10 of my 22 new people: ya_fedora, teen_skater, ya_bootcut, adult_cyclist, sum_denim_shorts_m, boy_shorts, girl_shorts, sum_loose_shorts_w, teen_cutoffs, ya_shorts (`a/rA*.png`).
  - The same red-soled trainers are on man_hoodie, adult_camo_cap, sum_denim_shorts_m, boy_shorts and girl_shorts.
  - The same cable-knit sweater is on woman_bob, ya_knit and girl_leggings.
  - boy_shorts is a scaled-down sum_denim_shorts_m: same outfit, same hair.
- **The "one blue suit on six" fix is a hue rotation of the same texture,** so the same garment and the same logo are still there in another colour (`tools/assets_people_mpfb.py` `hue_shift`).
- **The same person twice in one train:** man_puffer, seated, 10.9 m and 15.1 m from the player in `sal_outer` (`g/ride_c8.json`, `g/ride_c9.json`).
- **Names still do not match bodies:** ya_fedora has no fedora; man_puffer and woman_puffer wear no puffer; woman_scarf has no scarf.
- Still no mobility aids or buggies. Children are scaled adults.

### 2.6 Clothing: 5.8 (typical 7.0, worst 4.0)

**Mix** (`census4.py` over `g/*_c*.json`):
- Cars on the Ibrox ride: 30-45% trousers. Better than last round.
- St Enoch car: 53-58% trousers, every census.
- **Ibrox platform: 52-65% trousers over the whole 150 s,** 7 of 10 censuses over 50%.
- **The platform passed on the ride: 71-88% trousers** (`g/ride_c5.json`-`c9`: 20 of 23, 22 of 25).
- The rubric line is half.

**Cloth not whole, full model:**
- **ya_winter and elder_woman_coat seated:** the coat skirt balloons into a faceted, crumpled blob with white triangles and dark holes. This holds in `sit_idle`, `sit_phone` and `sit_cross_legs`, front, side and back (`b/rZS.png` rows 4-5). It is the worst cloth in the roster, and these are riders.
- **woman_midi walking:** a hole at the left thigh showing skin (walk190 front), and a ragged slit (walk174 side) (`w/rZ.png` row 3). Not fixed.
- **elder_woman_coat walking:** the coat front splits to show the jeans (walk166 and 198 front), and the hem is ragged and crumpled behind (`w/rZ.png` row 4). Not fixed.
- **Seated pencil skirts tent** (woman_coat, adult_beret, and woman_midi at the back). woman_coat's skirt sticks out as angular flaps in `sit_cross_legs` side (`b/rZS.png` rows 1-3). Not fixed (acknowledged).
- **adult_beret's boot tops are ragged,** with pale wedges at the knee, walking and seated (`w/rZ.png` row 2, `b/rZS.png` row 2).
- woman_coat's front skirt holes are gone. What is left is a small hem notch and a back vent showing skin (walk198 back) (`w/rZ.png` row 1).

### 2.7 Luggage: 7.2 (typical 8.0, worst 6.0)

What works:
- 10 kinds, all hung correctly from hand or back on three new bodies (`l/bags_*.png`).
- Cases tow tilted on their wheels.
- On the viewer's stair, cases and trolleys are lifted off the floor by the handle.
- In the game, bags are worn sensibly: platform hand / back / floor, riders on the lap (`census4.py` "where").

Faults:
- **Rucksacks, day and hiking, are still hugged upright on the lap,** on all three bodies (`l/bags_*.png` rows 1-2, sit).
- In the game the case carriers jam at the stair foot (2.4), so I saw no case carried up or down real stairs in motion.

### 2.8 Whole bodies: 5.3 (typical 6.5, worst 3.5)

**Far model close to the player** (every 0.1 s step, `g/*_stats.json`):

| Where | Far model within 6 m |
|---|---|
| Ibrox platform | at most 2, in 97 of 1500 steps, all at 5-6 m |
| Ibrox ride | 1 of 1500 steps |
| After boarding at St Enoch | 2 in the first frame, then 0 (`g/sten.log`) |
| **St Enoch platform beside a train** | **up to 10 at once, in 234 of 1530 steps** |

- At the St Enoch census, 7 of 21 and 4 of 19 people within 6 m were on the far model: seated riders at 4.4-5.4 m (`g/sten_c1.json`, `g/sten_c2.json`).
- Walkers came toward the player down to 4.0 m on it: woman_mini, girl_shorts, ya_smile_dress (`g/sten_stats.json` lodIds).
- **Cause:** in `people.js:798` the new `p.lod && dist < 5` override only lifts the 4-swaps-a-frame limit. `wantLod = !hiSet.has(p)` still keeps the person on the far model when the saloon's `maxHi` (16 when exploring, `index.js:297`) is full.

**Far-model faults:**
- **adult_oxford_shirt: the black shirt collapses to one large triangle.** The chest shows white with button dots, the forearms are bare, and it is the same from the front and the back (`lod/z_oxford.png`, `lod/rL1.png` row 5). Broken: 0-3 on the scale.
- ya_winter and elder_woman_coat: white wedges in the back of the coat, jeans through the coat front, crumpled seated (`lod/rL2.png`).
- adult_tophat: blocky white jacket with black wedges at the hem.
- ya_fedora: white shards at the waistband.
- man_kilt_casual: orange shards across the jumper.
- woman_elder's black wedge shoes are fixed (`lod/rL2.png` row 1).

**Full-model faults:** the cloth in 2.6, and ya_fedora's hat shard (2.3).

## 3. REVIEW_3 top ten: verification

| # | REVIEW_3 item | Verdict | Evidence |
|---|---|---|---|
| 1 | No cross-fade; platform `maxHi` undefined | **Fixed.** crossfade 0.3, maxHi 28; transitions spread over about 0.3 s, max 0.2-5.3 cm per frame. | `pop4.txt` |
| 2 | woman_coat skirt holes walking | **Mostly fixed.** Front clean in 8 phases. A hem notch and a back vent showing skin remain. New side effect: 150 steps/min at 1.6 m/s. | `w/rZ.png` row 1, `motion_worst40.txt` |
| 3 | Riders never smile or attend | **Fixed** (face and eyes): riders smile above 0.3 in 8-11% of samples, gaze varies. Head and body never turn. | `g/ride_stats.json`, `g/sten_stats.json` |
| 4 | adult_tattoo_muscle tee shoulders; girl_school_kilt scalp band | **Mostly fixed.** girl_school_kilt re-haired, clean. The tee was clean in viewer sit / sit_phone. The tattoo man's nape hair is still speckled. Not re-seen in the game. | `b/rH.png`, `b/rZS.png` row 6 |
| 5 | Crouched gait, ARM.sym | **Not fixed** (acknowledged). Instrument unchanged: LEG 7.5 / 5.2, ARM p10 5.1, TRN p10 3.3. | `motion_all.txt` |
| 6 | Cloth not whole (woman_midi, elder_woman_coat, kilt, ya_winter seated hem) | **Not fixed.** woman_midi tear and elder_woman_coat split remain. Seated ya_winter / elder_woman_coat coats are crumpled blobs. The kilt was clean in my phases. | `w/rZ.png`, `b/rZS.png` |
| 7 | Seated pencil-skirt tents; adult_beret boot tops | **Not fixed** (acknowledged for tents). | `b/rZS.png` rows 1-2 |
| 8 | Hairlines; women reading as boys | **Partly fixed.** All re-haired people read female. sum_shorts_asian_m temples, teen_hippy sheet hair and the tattoo man's nape remain. New: ya_fedora hat shard. | `f/F1.png`, `b/rH.png` |
| 9 | Far model within 6 m beside a train; far-model faults | **Partly fixed.** Boarding and riding are fixed. Beside a train at St Enoch: up to 10 at once, 15% of steps, walkers to 4.0 m. woman_elder shoes fixed. Coat holes remain. New: adult_oxford_shirt shirt collapsed. | `g/sten_stats.json`, `lod/z_oxford.png` |
| 10 | Garment repetition, car trousers, names, rucksacks on lap | **Partly fixed.** Blue tee recoloured (same garment and logo). Ride cars 30-45% trousers, but St Enoch car 53-58% and platforms 52-88%. Names unchanged. Rucksacks still hugged upright. man_puffer twice in one train. | census, `l/bags_*.png` |

## 4. Top ten defects, in priority order

1. **adult_oxford_shirt's far model has no shirt.**
   - What: the shirt is one big black triangle over a white chest with button dots; the forearms are bare. Front and back, standing, seated and walking.
   - Reproduce: `node shoot.mjs 1 adult_oxford_shirt none stand,clip-sit-0-30,walk@174 lod/L`.
   - In the game: anyone beyond about 11 m, or near a train when the budget is full.
   - Evidence: `lod/z_oxford.png`, `lod/rL1.png` row 5.
2. **Seated long coats balloon into crumpled faceted blobs.**
   - What: white triangles and dark holes in every sit clip, full and far model.
   - Who: ya_winter, elder_woman_coat.
   - Reproduce: `node shoot.mjs 0 ya_winter,elder_woman_coat none clip-sit-0-30,clip-sitphone-0-30,clip-sitalt-1-30 b/ZS legs`.
   - Evidence: `b/rZS.png` rows 4-5, `lod/rL2.png` rows 3-4.
3. **The far model stays within 6 m beside a train.**
   - St Enoch platform with a train in: up to 10 at once, 234 of 1530 steps. Riders sit at 4.4-5.4 m on it, and walkers come to 4.0 m on it.
   - Cause: the `dist < 5` override in `people.js:798` only relaxes the swap rate. The saloon's `maxHi` (16 when exploring, `index.js:297`) still decides.
   - Reproduce: `node g4.mjs "mode=explore&q=high&line=outer&station=st-enoch" g/sten 150 0.1 15 40`.
   - Evidence: `g/sten_stats.json` lodIds, `g/sten_c1.json`.
4. **The crowd mix is over half trousers on platforms and in some cars.**
   - Ibrox platform: 52-65% across 150 s.
   - The platform passed on the Ibrox ride: 71-88%.
   - St Enoch car: 53-58%.
   - Reproduce: `python3 census4.py g/ibx g/ride g/sten`.
5. **Gait: crouch, one-sided arm swing, and a new pencil-skirt shuffle.**
   - Crouch: teen_skirt knee 31 deg mid-stance and 46 deg at loading; also ya_ginger_braid, sum_crop_bike, teen_crop_leggings.
   - Arm swing: ARM.sym 52-66%.
   - Shuffle: woman_coat and adult_beret at 150 steps/min, 0.54 m steps at 1.6 m/s (STR.cad 3.0).
   - Reproduce: `people_motion.mjs --people all --rec DIR`, then `--from DIR --items --worst 40`.
   - Evidence: `motion_worst40.txt`.
6. **Skirt and coat tears while walking:**
   - woman_midi: a thigh hole showing skin (walk190 front) and a ragged slit (walk174 side).
   - elder_woman_coat: the coat splits to show the jeans (walk166 and 198 front), with a crumpled hem.
   - Reproduce: `node shoot.mjs 0 woman_midi,elder_woman_coat none walk@166,walk@174,walk@190,walk@198 w/Z legs`.
   - Evidence: `w/rZ.png`.
7. **ya_fedora's head is broken.**
   - What: a crumpled grey hat-band shard floats through the hair across the forehead, with a spike at the side. There is no fedora. The far model has shards at the waistband.
   - Reproduce: `node face.mjs ya_fedora f/x`, or `shoot.mjs 0 ya_fedora none stand b/H face`.
   - Evidence: `f/F2_ya_fedora_0_0.png`, `b/rH.png` row 3, `lod/z_misc.png`.
8. **Seated pencil skirts tent between the thighs, and adult_beret's boot tops are ragged.**
   - What: pale wedges at the knees, walking and seated. woman_coat's skirt sticks out as angular flaps in `sit_cross_legs`.
   - Reproduce: `shoot.mjs 0 woman_coat,adult_beret none clip-sit-0-30,clip-sitalt-1-30 b/ZS legs`.
   - Evidence: `b/rZS.png` rows 1-2, `w/rZ.png` row 2.
9. **Stair walkers jam at the stair foot.**
   - Ibrox: three people with a case, a holdall and a tote stood in `go` mode on the walk clip at v = 0 for 5+ s beside the "Way out / Stairs" sign. About a dozen others crept down at about 5 cm/s, or stopped, over 150 s.
   - St Enoch: two walkers stood at the bottom for more than 10 s.
   - Reproduce: `node stair4.mjs "mode=explore&q=high&line=outer&station=ibrox" v/stair_ibx 40`.
   - Evidence: `v/stair_ibx.log`, `g/ibx_stats.json` "stair".
10. **Faces and identity repetition:**
    - Smiles are faint, closed-mouthed and lopsided (man_hoodie at 1.0), and eyebrows are painted dashes.
    - man_hoodie and sum_denim_shorts_m share one face and one hairstyle.
    - man_puffer sits twice in one train, about 4 m apart.
    - Hair is card-like (teen_hippy, woman_puffer), and sum_shorts_asian_m's temples are notched.
    - Rucksacks are hugged upright on the lap.
    - Evidence: `f/Z.png`, `f/F2.png`, `g/ride_c8.json`, `b/rH.png`, `l/bags_*.png`.

## 5. For the next round

- Watch motion in real time (a GPU browser recording), above all the stair foot and boarding.
- Check whether `adult_oxford_shirt`'s far model broke in this rebuild. Render every far model seated and walking, not only standing; I did all 99 standing.
- Re-run the St Enoch platform count after any LOD budget change.
- Look at the remaining ~25 faces not yet shot in any round (e.g. man_commuter, man_student, staff_hivis, boy, boy_small, teen_runner, adult_runner, adult_casual2).

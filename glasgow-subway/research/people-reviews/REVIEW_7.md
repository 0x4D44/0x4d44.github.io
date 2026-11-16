# Under Glasgow: independent review of the people (review 7)

Reviewed: `glasgow-subway` at `d5bbac2d` ("act on adversarial review 6"), served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611.
Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Judged from scratch. Nothing in the repository was edited.

**Result: weighted mean 6.6 (6.63). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review7/`. In stills, `_F` = front quarter, `_S` = side and `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 7.5 | 6.0 | **6.9** |
| 3 | Faces | 10 | 7.0 | 5.5 | **6.4** |
| 4 | Standing, sitting, behaviour | 10 | 8.0 | 5.0 | **6.8** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 4.0 | **5.8** |
| 7 | Luggage | 10 | 8.0 | 6.5 | **7.4** |
| 8 | Whole bodies | 15 | 7.0 | 4.0 | **5.8** |
| | **Weighted mean** | 100 | | | **6.6** (6.63) |

0.20x7.2 + 0.10x6.9 + 0.10x6.4 + 0.10x6.8 + 0.10x6.9 + 0.15x5.8 + 0.10x7.4 + 0.15x5.8 = 6.63.

In one line: the vest no longer flies apart, and nobody is held up on the stairs or held in someone else for long. But the vest is still ragged close up and is a patchwork on the far model. The duplicate fix misses most cases: the same person still appears twice in one car, twice on one platform, and in two trains at once. The gait is unchanged (9.23).

## Method note: earlier far-model stills may show the full model

`tools/people_view.html?forcelod=1` builds people from the LOD file. But the reviewers' shooters (`shoot.mjs`, `all.mjs`) then call `crowd.update(..., cam.position)` with the camera 3.6 m away. Since review 4, the crowd swaps anyone within 6 m of the camera to the full model. The shooter's own log shows this happening: `"lod":false` for every `forcelod=1` shot (`lod/vest.log`).

I changed both shooters to pass a far camera position (0, 1.6, 40) to `update` when `forcelod=1`. The log then reads `"lod":true` for all 99 (`lod/wa.log`). So "far model standing is clean for all 99" (REVIEW_5, REVIEW_6) was very likely judged on the full model. The real far model shows faults those reviews did not see (2.6, 2.8).

## What I could not observe

- **No motion watched.** Walking is judged from stills at frames 158/166/170/174/182, the instrument (`motion_all_run.log`) and the game traces.
- **Blink rate** was not measured.
- **Game close-ups:** `g4.mjs`'s nearest-person shots aim at body parts, not faces (`g/kvp.png`). In-game faults are mostly measured (ids, distances, clips). Their look comes from the viewer, which builds the same people.
- **The viewer has no seat, stair, phone or pole.** `sitalt` clips spawn in stand mode, and the viewer's "stair" state is drawn on flat ground.
- The sims are not deterministic, so a moment found in one run cannot be replayed exactly.

## 1. What I sampled (45 people in stills, all 99 on the far model, 4 game runs)

| What | Who | Evidence |
|---|---|---|
| **Staff vest**, full model: stand, walk 158/166/174/182 and all four sit clips (sit_idle, sit_phone, sit_look, sit_cross_legs), body view and chest close-up | staff_hivis, staff_woman | `w/vest.png`, `w/vest_s.png`, `w/vz.png`, `w/vz_s.png` |
| **Far model (true LOD)**: walk 166 and sit_idle | staff_hivis, staff_woman, elder_woman_coat, ya_winter, adult_lusekofta, woman_coat | `lod/far.png`, `lod/far_s.png` |
| **Far model, all 99** standing and walking | everyone | `lod1s/s0.png`, `lod1s/s1.png`, `lod/waF0.png`, `lod/waF1.png` |
| **18 people no earlier review leaned on**: stand, walk 158/170/182 (F/S/B) and every sit clip | adult_camisole, adult_string_vest, adult_tattoo_muscle, adult_tie_suit, adult_tophat, adult_vneck, boy_cap, elder_shorts, girl_shorts, man_hoodie, sum_shorts_asian_m, teen_skater, teen_tube, teen_shorts_lad, ya_tube_heels, ya_tee_jeans, woman_sash, girl_small | `w/A1.png`, `w/A2.png`, `b/SF.png` |
| **12 REVIEW_6 re-checks**: walk 158/170/182 and every sit clip | elder_woman_coat, ya_winter, man_longcoat, adult_lusekofta, woman_coat, woman_midi, adult_beret, teen_skirt, woman_mini, ya_spiky, ya_shorts, woman_dress | `w/B.png`, `w/Bz.png` (zoom), `b/SF.png`, `b/z.png` (seated zoom) |
| **20 faces at 0.85 m**, neutral, and smiling 0.8 with gaze; includes the four REVIEW_6 had not shot smiling | woman_student, adult_piper, adult_heel_boots, teen_hood, adult_camisole, adult_tattoo_muscle, adult_tophat, elder_shorts, girl_shorts, sum_shorts_asian_m, teen_skater, ya_tube_heels, ya_tee_jeans, woman_sash, adult_cyclist, staff_woman, girl_ginger, teen_girl, man_highland, adult_vneck | `f/n.png`, `f/sm.png`, `f/z.png` |
| **Hands on handles**: handbag, case, shopper and holdall, hands view | adult_tie_suit, ya_tube_heels, teen_skater, woman_scarf | `a/G.png`, `a/g2.png` |
| **Luggage**: 10 kinds x stand / walk / stair / sit_idle | adult_vneck, elder_shorts | `l/L.png` |
| **Walking instrument**, whole roster (891 recordings) | 99 | `motion_all_run.log`, `motall/` |
| **Game** (`gp7.mjs`: 0.1 s steps, one rendered frame in ten; records overlaps with their longest continuous run, far models within 6 m, duplicates in every crowd within 40 m, stair stalls and the garment mix within 15 m) | Ibrox platform 150 s; Partick (inner) platform 150 s; Buchanan St (inner) platform 120 s; ride from Cowcaddens (outer) 180 s | `g/ibx.json`, `g/pk.json`, `g/bch.json`, `g/ride.json` |
| **Game eye-height frames** inside a car (ride from Kelvinhall) | | `g/kve.png`, `g/kvp.png` |

## 2. Per-category reasoning

### 2.1 Walking: 7.2 (typical 8.0, worst 6.0)

- **Instrument, whole roster: 9.23, the same as reviews 4-6** (`motion_all_run.log`).
  - LEG 7.5 (p10 5.3), ARM p10 5.1, SMO p10 7.0, TRN p10 3.3.
  - Worst recording: teen_skirt at 1.6 m/s = 7.5.
  - Gate not met. This commit did not touch the gait.
- **Stride stills of 30 people:** heel strike, swing-knee flexion and toe-off read in every one (`w/A1.png`, `w/A2.png`, `w/B.png`). teen_tube and woman_coat walk visibly knee-bent.
- **Stair walkers flow:** 0 stalls of 3 s or more among 55 stair walkers in three platform runs (`g/ibx.json`, `g/pk.json`, `g/bch.json`, `stair`).
- **Walkers still pass through each other.** The longest overlaps are now short, but they still happen:
  - At Partick, adult_harem and man_elder stayed 0.13 m apart (centre to centre) for 2.4 s. A knot of three people formed with teen_crop_leggings at 0.10 m, 1.9 s (`g/pk.json` `ov`, t = 39 s, at 12.5 m).
  - sum_tube_denim and ya_ginger_braid came within 0.02 m at **3.0 m from the player** (`g/pk.json`).
  - girl_small and ya_tube_heels came within 0.07 m at 2.3 m from the player (`g/bch.json`).

### 2.2 Arms and hands: 6.9 (typical 7.5, worst 6.0)

- Arm swing reads in every walk still. ARM p10 is 5.1: on the worst recordings one arm swings about half as far as the other (unchanged).
- **Better than REVIEW_6 said.** In the hands view, the fingers close on the handle of the handbag, case, shopper and holdall on ya_tube_heels, teen_skater and woman_scarf (`a/G.png`). I found no 3-5 cm gap on these four bodies.
- **Phone poses hide the face:**
  - adult_camisole and teen_girl hold the phone in both hands directly in front of the mouth and nose (`f/n.png` columns 5 and 18).
  - man_highland holds a call phone at the cheek, with the hand away from the ear (`f/n.png` last but one).
  - adult_tie_suit, on his phone, holds the case against his belly (`a/g2.png`).

### 2.3 Faces: 6.4 (typical 7.0, worst 5.5)

- Ages and sexes read correctly; children read as children; elders are wrinkled (elder_shorts, adult_tophat; `f/n.png`).
- **The same young male face again.** adult_piper, adult_tattoo_muscle, adult_cyclist, ya_tee_jeans and teen_hood share one narrow face, the same short black skull-cap hair and pale icy irises (`f/z.png`, `f/n.png`). adult_cyclist's irises are still near white.
- **Eyebrows are thin painted dashes.** Smiles at 0.8 are closed-mouth and slight or lopsided: adult_tattoo_muscle and girl_ginger smirk (`f/z.png`).
- **Hair:**
  - Skin shows through the top of staff_woman's hair (`f/z.png` 5th).
  - Flat red hair slabs cross girl_ginger's cheek.
  - adult_heel_boots' long hair is a few flat cards (`f/n.png`).

### 2.4 Standing, sitting, behaviour: 6.8 (typical 8.0, worst 5.0)

- **Stairs: fixed.** No stall in 55 stair walkers.
- **Pass-through at the stair foot: much reduced but not gone.** Walkers still come within 0.17-0.29 m of people standing at the stair foot for up to 0.9 s:
  - boy_kilt (standing) and teen_girl (walking): 0.17 m, 0.9 s (`g/ibx.json`).
  - adult_cap_baggy and adult_lusekofta: 0.20 m, 0.8 s.
  - This matches the new `passT = 1.0` in `js/sim/people.js:976`: a walker held up for 1.5 s then walks on for a second without looking.
- **The same person twice: the fix covers only a hand-over into a crowd where that person already is.** Measured (any crowd, visible, within 40 m):
  - **Twice in one car:** girl_shorts seated twice in `sal_inner`, 4.9 m and 6.2 m from the player, for 27 s; woman_dress twice at 5.9 m and 18.1 m; man_trews twice at 11.8 m and 20 m (`g/pk.json` `dup`).
  - **Twice in one train:** adult_casual5 seated twice in `sal_outer`, at 8.2 m and 16.8 m, for 56 s. The gangway is open, so the far copy is visible down the train (`g/ride.json`, `g/kve.png`).
  - **Twice on one platform:** teen_crop_leggings walking twice, at 6 m and 12 m, for 7 s (`g/pk.json`).
  - **In two trains at once:** at Cowcaddens, 13 people sat in both the outer train (the player's) and the inner train beside it for 30 s. Examples: man_hoodie at 2.2 m and 12.4 m; teen_tee at 2.0 m and 12.6 m; sum_tee_leggings at 4.2 m and 7.8 m (`g/ride.json`).
  - **On the platform and in the train:** boy_cap standing on the platform at 3.8 m and holding a pole in the inner train at 12.7 m; ya_ginger_long at 4.9 m and 11.7 m (`g/ride.json`). At Partick, 7 people were on the platform and in the train at once (`g/pk.json`).
- **Seated pencil and midi skirts in sit_idle** (unchanged; `b/z.png`):
  - woman_coat's skirt splits, with thigh showing through the flap.
  - woman_midi's skirt flares out like a shelf.
  - adult_beret has pale wedges at the knees.
  - teen_tube's mini balloons outward.
- **Good:**
  - The clip-change rate is human: 2.1-2.5 changes per person-minute in all four runs.
  - A car reads well at eye height (`g/kve.png`), with riders on phones and looking about.

### 2.5 Range of people: 6.9 (typical 7.5, worst 6.0)

- The census is unchanged (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff), with a spread of heights and skin tones (`lod1s/s0.png`, `lod1s/s1.png`).
- **The template look:** a printed tee, painted shorts and white socks is worn by elder_shorts, girl_shorts, sum_shorts_asian_m, teen_skater, teen_shorts_lad and ya_tee_jeans, among others (`w/A1.png` rows 3-6).
- **Shared outfits:**
  - teen_skirt, woman_mini and teen_tube share the red tartan mini (`w/B.png`, `w/A1.png`).
  - teen_skirt and woman_mini also share the pink paisley top and long black hair.
  - The male face template is shared (2.3).
- The duplicates in 2.4 also cut the range a player sees.

### 2.6 Clothing: 5.8 (typical 7.0, worst 4.0)

**Staff vest: partly fixed.**
- No more shards flying 10-20 cm out of the body when walking or seated. The vest now follows the torso in every phase and in every sit clip (`w/vest_s.png`).
- Close up it is still broken (`w/vz_s.png`):
  - the upper edge is torn and jagged, with the navy suit showing through in flame-like notches front and back;
  - lumps stand out on the chest;
  - on staff_hivis an orange sliver about 10 cm long sticks out from the shoulder strap.
- **On the true far model the vest is a patchwork of orange fragments on navy, standing, walking and seated** (`lod/far_s.png` rows 1-2, `lod1s/s1.png` row 1 columns 2-3, `lod/waF1.png`). In the game, staff walk the platform and the stairs on the far model (staff_hivis on the Partick stairs, `g/pk.json` `stair`).

**Long coats (unchanged):**
- ya_winter's coat walking shows a jeans-blue hole at the left thigh (`w/Bz.png`).
- On the far model, both long coats have holes showing jeans walking and seated (`lod/far_s.png` rows 3-4).

**Other faults (unchanged):**
- adult_lusekofta's trouser hems hang in long jagged shards on both models (`w/Bz.png`, `lod/far_s.png` row 5).
- adult_beret has pale wedges above the boots, walking and seated (`w/Bz.png`, `b/z.png`).
- Seated skirts, as in 2.4.
- A pale skin spike shows through ya_smile_halter's pink halter in the game, seated at 2.2 m (`g/kv_s0_p3_ya_smile_halter_FULL_f.png`).

**Garment mix within 15 m, in 10 s samples:**
- Trousers: 51% across the Ibrox run, with peaks of **70%** on the Ibrox platform and **73%** on a platform during the ride.
- Shorts: 41% across the Partick run. Saloons peak at 60-62% in one garment.
- The rubric allows no more than half of any crowd in one kind of garment, so this fails at moments (`g/*.json` `cen`).

### 2.7 Luggage: 7.4 (typical 8.0, worst 6.5)

- All ten kinds hang right from the hand or sit right on the back, standing and walking. Cabin and large trolleys stand beside the person and are towed on their wheels (`l/L.png`).
- The hand grip on handles has improved (2.2).
- **Day and hiking rucksacks still stand upright on the lap, with the hands on the thighs** (`l/L.png` row 1 columns 4 and 8; row 4 columns 8 and 12).
- I could not see how a case is handled on a real stair. The viewer's stair state is flat, and the game shooters do not frame stair walkers.

### 2.8 Whole bodies: 5.8 (typical 7.0, worst 4.0)

**Far models within 6 m of the player:**

| Run | Far-model person-steps within 6 m | Most at once | All person-steps within 6 m |
|---|---|---|---|
| Ibrox 150 s | 3 | 2 | 7888 |
| Partick 150 s | 4 | 2 | 12888 |
| Buchanan St 120 s | 0 | 0 | 5263 |
| Cowcaddens ride 180 s | 10 | **5** (5.1-5.4 m) | 39900 |

The near-swap holds; the ride had a moment with five far models at 5.1-5.4 m.

- **The far model is worse than earlier reviews reported** (see the method note): the staff vest is a patchwork, the long coats have holes, and the lusekofta hems are shards. These faults are visible on anyone moving at 6-20 m.
- Elsewhere the far model is clean for the other 94 people standing and walking (`lod1s/*.png`, `lod/waF*.png`).
- Scalp shows on staff_woman. The skin spike on ya_smile_halter appears in the game.

## 3. REVIEW_6 top ten: verification

| # | REVIEW_6 item | Verdict | Evidence |
|---|---|---|---|
| 1 | Staff hi-vis vest tears into shards | **Partly fixed.** No flying shards on the full model in any walk phase or sit clip. The edges are still torn and jagged, with lumps and a strap sliver close up. On the true far model the vest is a patchwork in every pose. | `w/vest_s.png`, `w/vz_s.png`, `lod/far_s.png`, `lod1s/s1.png` |
| 2 | Same person twice (train, platform) | **Not fixed (narrow fix only).** Twice in one car: girl_shorts, woman_dress, man_trews. Twice in one train: adult_casual5, 56 s. Twice on one platform: teen_crop_leggings. 13 people in two trains at once. Platform plus train at once: boy_cap at 3.8 m. | `g/pk.json`, `g/ride.json` (`dup`) |
| 3 | People pass through one another | **Mostly fixed.** Overlaps last at most 0.9 s on stairs and 2.4 s on the platform (was 8.7 s). Close passes remain: 0.02 m at 3 m from the player, and stair-foot passes of 0.17-0.29 m. | `g/ibx.json`, `g/pk.json`, `g/bch.json` (`ov`) |
| 4 | Gait: crouch, one-sided arm swing | **Not fixed** (not attempted). 9.23; worst teen_skirt at 1.6 m/s = 7.5. | `motion_all_run.log` |
| 5 | Long coat splits walking | **Not fixed.** Hole at the thigh on ya_winter; holes on the far model. | `w/Bz.png`, `lod/far_s.png` |
| 6 | Seated pencil/midi skirts; adult_beret | **Not fixed.** | `b/z.png`, `w/Bz.png` |
| 7 | Bags below the hand; phone hands; lap rucksacks | **Partly.** Hands now close on handles (4 bodies). Phones held in front of the mouth on adult_camisole and teen_girl. Lap rucksacks unchanged. | `a/G.png`, `f/n.png`, `l/L.png` |
| 8 | Ragged cloth edges (lusekofta, tee hems) | **Not fixed** (lusekofta shards on both models). | `w/Bz.png`, `lod/far_s.png` |
| 9 | Outfit repetition; shorts over half | **Not fixed / shifted.** Trousers peak at 70-73%, shorts at 41% of a run; tartan mini on three people; tee template. | `g/*.json` `cen`, `w/A1.png` |
| 10 | Faces and hair up close | **Not fixed.** Shared male face and hair; white irises; staff_woman scalp; girl_ginger hair on her cheek; lopsided smiles. | `f/z.png`, `f/n.png`, `f/sm.png` |

## 4. Top ten defects, in priority order

1. **The same person twice: in one car, one train, one platform, two trains, and on the platform and in a train.**
   - What:
     - girl_shorts seated twice in one car, 1.3 m apart, at 4.9 and 6.2 m from the player, for 27 s (Partick, inner);
     - adult_casual5 twice in the outer train for 56 s;
     - teen_crop_leggings walking twice on the Partick platform;
     - at Cowcaddens, 13 riders sitting in both trains at once (man_hoodie at 2.2 m and 12.4 m);
     - boy_cap on the platform at 3.8 m and in the train.
   - Why: the commit only stops a person *handed over* with their look into a crowd that already holds them (`js/sim/people.js:401`). Duplicates across crowds, and duplicates made by other paths within a crowd, still occur.
   - Reproduce: `node gp7.mjs "mode=explore&q=high&line=inner&station=partick" g/pk 150` and `node gp7.mjs "mode=ride&q=high&line=outer&station=cowcaddens" g/ride 180`, then read `dup`.
2. **The staff vest is still broken: a patchwork on the far model, torn edges on the full model** (staff_hivis, staff_woman).
   - What: on the far model (every moving staff member at more than 6 m), orange fragments with navy holes, standing, walking and seated. On the full model, a jagged notched top edge, chest lumps and a strap sliver about 10 cm long.
   - Reproduce: `node shoot.mjs 1 staff_hivis,staff_woman none walk@166,clip-sit-0-30 lod/far` (this review's `shoot.mjs`, with the far camera passed to `update`); `node shoot.mjs 0 staff_hivis,staff_woman none stand,walk@166 w/vz chest`.
   - Evidence: `lod/far_s.png`, `lod1s/s1.png`, `w/vz_s.png`.
3. **Gait unchanged:** 9.23; LEG 7.5 (p10 5.3), ARM p10 5.1, TRN p10 3.3; teen_skirt at 1.6 m/s = 7.5.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`.
   - Evidence: `motion_all_run.log`.
4. **Long coats have holes** (elder_woman_coat, ya_winter): jeans show through at the thigh walking, and holes appear on the far model walking and seated.
   - Reproduce: `node shoot.mjs 0 elder_woman_coat,ya_winter none walk@170 w/B`; `node shoot.mjs 1 ... walk@166,clip-sit-0-30 lod/far`.
   - Evidence: `w/Bz.png`, `lod/far_s.png` rows 3-4.
5. **People still pass through one another for up to 2.4 s.**
   - What: three alighting walkers knotted at 0.10-0.13 m for 1.9-2.4 s (adult_harem, man_elder, teen_crop_leggings; Partick t = 39 s). sum_tube_denim and ya_ginger_braid at 0.02 m, 3 m from the player. Stair walkers pass standing people at the stair foot at 0.17-0.29 m for up to 0.9 s, because of the 1 s `passT` free walk (`js/sim/people.js:976`).
   - Reproduce: `gp7.mjs` on Partick, Ibrox and Buchanan St, then read `ov`.
   - Evidence: `g/pk.json`, `g/ibx.json`, `g/bch.json`.
6. **Seated skirts in sit_idle:** woman_coat's skirt splits; woman_midi's flares into a shelf; teen_tube's mini balloons; adult_beret has knee wedges.
   - Reproduce: `node shoot.mjs 0 woman_coat,woman_midi,adult_beret,teen_tube none clip-sit-0-30 b/S`.
   - Evidence: `b/z.png`.
7. **adult_lusekofta's trouser hems in long jagged shards**, on both models, standing, walking and seated.
   - Reproduce: `node shoot.mjs 0 adult_lusekofta none walk@170 w/B`.
   - Evidence: `w/Bz.png` row 2, `lod/far_s.png` row 5.
8. **One garment over half a crowd; repeated outfits.**
   - What: trousers reach 70-73% within 15 m at Ibrox and on a ride platform; shorts are 41% of the Partick run. The printed tee, painted shorts and white socks template is worn by six or more young people. The red tartan mini appears on teen_skirt, woman_mini and teen_tube.
   - Reproduce: `gp7.mjs`, then read `cen`.
   - Evidence: `g/*.json`, `w/A1.png`.
9. **Faces:**
   - adult_piper, adult_tattoo_muscle, adult_cyclist, ya_tee_jeans and teen_hood share one face, the same skull-cap hair and pale irises (adult_cyclist's near white).
   - Phones are held over the mouth (adult_camisole, teen_girl).
   - staff_woman's scalp shows; girl_ginger's hair crosses her cheek; smiles are lopsided.
   - Reproduce: `node face.mjs adult_piper,adult_tattoo_muscle,adult_cyclist,staff_woman,girl_ginger f/sm "0.3:-0.05" 0.8`.
   - Evidence: `f/z.png`, `f/n.png`.
10. **Small faults the player sees at 2-6 m:**
    - A skin spike through ya_smile_halter's halter, seated in the car at 2.2 m (`g/kv_s0_p3_ya_smile_halter_FULL_f.png`; `node g4.mjs "mode=ride&q=high&line=inner&station=kelvinhall" g/kv 90 0.1 30`).
    - Five far models at once at 5.1-5.4 m on the ride (`g/ride.json` `lod6max`).
    - Day and hiking rucksacks upright on the lap with the hands on the thighs (`l/L.png`).

## 5. For the next round

- Shoot the far model with a far camera position in `crowd.update`. Otherwise the 6 m swap quietly shows the full model.
- Dedupe across every crowd (the platform and both trains) and on every path a person is added by, then re-run `gp7.mjs` `dup` on a ride and on a platform with two trains in.
- Rebuild the vest on the LOD file, not only on the full one.
- Not yet looked at closely: wheeled cases on a real stair in the game; how a kilt hangs seated on the far model; blink rate.

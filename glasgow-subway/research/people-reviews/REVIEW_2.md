# Under Glasgow: independent review of the people (review 2)

Reviewed: the 99 characters in `models/people.glb` / `people_lod.glb` at HEAD `1d9f13c7`
(builder commit `43848cdf`, "act on adversarial review 1"), served from
`/home/user/0x4d44.github.io` on 127.0.0.1:8611. Scored against `research/people-rubric.md`
(category = 0.6 x typical + 0.4 x worst tenth). I did not use REVIEW_1's scores as a starting point.

**Result: weighted mean 6.3. Gate NOT met.** The gate needs a mean above 9 and no category below 8.
The best category scores 6.9.

All evidence paths are under `$RV = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review2/`.
In my copy of the shooter, `_F` is the front quarter, `_S` the side and `_B` the back quarter (I fixed REVIEW_1's
naming quirk). I also fixed its LOD flaw by forcing `maxHi = 0` under `forcelod=1`. Every LOD walking still
reports `"lod":true` (`$RV/lod/L1.log`).

## What I could not do

- **I watched no motion.** Walking is judged from 8-phase stills and from limb positions.
- **The rubric's walking instrument crashes at HEAD.** `node tools/people_motion.mjs --people ... --base http://127.0.0.1:8611`
  fails with `TypeError: Cannot read properties of undefined (reading 'position') at stepBag (bags.js:303)`, reached
  from `AnimCrowd._bagOn`. `people_motion.html` never loads `luggage.glb`, so the procedural-bag fallback runs, and that
  fallback has no `rig.handle`. Output: `$RV/motion.txt`. **I have no foot-slide or cadence numbers.** Per the rubric,
  I marked Walking down for this.
- **No stair stills.** The stair close-up camera ended up inside a wall. I have numbers only (`$RV/g/stair.log`).
- **In-car close-ups need care.** A camera placed 2.6 m from a seated rider ends up outside the car. I used the
  player's own eye view instead (`$RV/g/eyes_ride_r*.png`).

## 1. What I sampled (chosen to differ from REVIEW_1)

| What | Who | Evidence |
|---|---|---|
| Stand / sit, 3 views, full model | 14 summer people (all `sum_*`, teen_crop_leggings, teen_cutoffs, teen_shorts_lad, elder_shorts, boy_shorts, girl_shorts) | `$RV/a/sheet_G1_SS.png`, `sheet_G1b_SS.png` |
| Same | 6 people made elders (adult_tie_suit, adult_vneck, adult_oxford_shirt, adult_camisole, adult_lusekofta, adult_leggings_knit), boy, girl | `$RV/a/sheet_G2_SS.png` |
| Same | boy_cap, staff_hivis, man_highland, adult_piper, boy_kilt, woman_mini, woman_coat, adult_beret | `$RV/a/sheet_G2b_SS.png` |
| Same | man_hoodie, ya_tattoo_tank, adult_tattoo_muscle, ya_ginger_braid, adult_casual2, ya_fedora, woman_bob, adult_fisherman_leggings, man_puffer, adult_camo_cap | `$RV/a/sheet_G3_SS.png` |
| Walk, 3 phases, side and front, all 40 above | | `$RV/a/sheet_*_W.png` |
| Walk, 8 phases of one stride, side and front | 12 people: sum_tube_denim, teen_shorts_lad, elder_shorts, girl_shorts, adult_tie_suit, adult_lusekofta, boy, woman_coat, man_highland, adult_camo_cap, ya_tattoo_tank, adult_leggings_knit | `$RV/w/sheet_stride1.png`, `sheet_stride2.png` |
| LOD model: stand, walk (3 phases, truly LOD), sit | 12 people | `$RV/lod/sheet_L1.png`, `sheet_L2.png`; zooms `z_lod1.png`, `z_lod2.png` |
| Skin painted red (hole finder), seated, full and LOD | 40 full + 8 LOD (incl. REVIEW_1's man_commuter, teen_hood, woman_elder, woman_midi, man_trews) | `$RV/t/sheet_A..D.png`, `sheet_L.png`; zooms `z_A.png`, `z_L.png` |
| Faces at 0.85 m, neutral and smiling | 34 people | `$RV/f/sheet_faces1.png`, `sheet_faces2.png`, zoom `z_faces.png` |
| Face layers over 120 s at 4-6 m (smile, blink, gaze) | 7 people, standing and sitting | `$RV/probe.mjs` (results in section 2.3) |
| All 10 luggage kinds x stand / walk / sit / stair | sum_tee_leggings, adult_tie_suit, teen_shorts_lad, adult_camisole | `$RV/l/sheet_<id>.png`, zoom `z_bags.png` |
| Hands holding bags | elder_shorts, ya_ginger_braid, teen_shorts_lad, adult_camisole | `$RV/h/sheet_hands.png`, `sheet_handr.png` |
| Re-check of REVIEW_1's cloth faults | man_commuter, teen_hood, man_trews, adult_heel_boots, woman_midi, elder_woman_coat | `$RV/v/sheet_V.png`, `z_V.png` |
| **Real game**, platform, ~100 s of sim each | Ibrox, Buchanan St, Hillhead | `$RV/g/<st>_r{0,1,2}_census.json`, `_eye_y*.png`, `eyes_ibrox_r1.png`, `eyes_bs.png`, `sheet_*` |
| **Real game**, in a car (ride mode) | Ibrox to Govan, 3 rounds over ~110 s | `$RV/g/ride_r*_census.json`, `eyes_ride_r0/r1/r2.png`, `z_ride_pose.png` |

## 2. Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 7.5 | 6.0 | **6.9** |
| 2 | Arms and hands | 10 | 7.5 | 5.0 | **6.5** |
| 3 | Faces | 10 | 6.5 | 4.5 | **5.7** |
| 4 | Standing, sitting, behaviour | 10 | 7.0 | 4.5 | **6.0** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 4.5 | **6.0** |
| 7 | Luggage | 10 | 7.5 | 5.5 | **6.7** |
| 8 | Whole bodies | 15 | 6.5 | 3.5 | **5.3** |
| | **Weighted mean** | 100 | | | **6.3** |

0.20x6.9 + 0.10x6.5 + 0.10x5.7 + 0.10x6.0 + 0.10x6.9 + 0.15x6.0 + 0.10x6.7 + 0.15x5.3 = 6.27.

### 2.1 Walking: 6.9

What works:
- At 3.6 m every stride shows a clear heel strike, a flexed swing knee and toe-off.
- Arms now swing back as well as forward.
- The 40 people differ a little in step width and arm carriage (`$RV/a/sheet_*_W.png`, `$RV/w/sheet_stride*.png`).

Faults:
- **The cloth breaks during the stride.**
  - woman_coat: a torn, ragged skirt with skin showing through on 7 of 8 phases, front and side (`$RV/w/sheet_stride2.png` row 3-4, `$RV/a/z_walkcloth.png` top row).
  - man_highland: the kilt opens in a sharp triangular slit at the front thigh, walk170_F and 190_F (`$RV/a/z_walkcloth.png`).
- **Age does not change the walk.**
  - elder_shorts, adult_tie_suit, adult_lusekofta and adult_camisole stride like the young adults: same length, same upright posture, no slower cadence (`$RV/a/sheet_G2_W.png`, `$RV/w/sheet_stride1.png`).
  - adult_camisole is an "elder" walking in red stilettos.
- Starts, stops and turns were not measured (the instrument crashed), and nothing was watched in motion. I scored down for both.

### 2.2 Arms and hands: 6.5

What works:
- Walking hands hang close to the hip with the fingers curled. REVIEW_1's open "begging" hand is gone (`$RV/w/sheet_stride*.png`, `$RV/h/sheet_handr.png`).
- Seated idle hands rest palms-down on the thighs (`$RV/a/sheet_G1_SS.png`, sit columns).

Faults:
- **Bags raised to the chest by phone and gesture clips.**
  - sum_tee_leggings types on her phone with the holdall dangling from the texting hand at chest height (`$RV/l/z_bags.png`, first).
  - adult_camisole holds the carrier out at arm's length (`$RV/l/sheet_adult_camisole.png`, carrier stand_S) and the briefcase at waist height while gesturing (`$RV/h/sheet_handr.png`, last row).
- **In the game:** at Buchanan St, sum_shorts_asian_m stands with both forearms out level and his hands reach into the back of the woman in front (`$RV/g/z_bs.png`, left).
- **adult_piper:** the drone pipe runs through his face, full model, standing, walking and sitting. He also makes phone calls while holding the pipes (`$RV/a/z_piper.png`; LOD `$RV/lod/z_lod2.png`).
- **sit_cross_legs:** one arm hangs in the air in front of the body (see 2.4).

### 2.3 Faces: 5.7

What works (measured with `$RV/probe.mjs`, camera 4-6 m, 120 s):
- **Eyes move:** 39-47 distinct gaze positions in 2 minutes.
- **Blinks:** 7.5 to 13.5 a minute.
- **Smiles come and go without the player approaching:** peak 0.43-0.60, above 0.3 for 10-15 s of each 120 s.
- No red irises in my 34 faces.

Limits:
- Beyond 9 m (`BLINK.range`) nobody blinks or looks about. That is acceptable.
- The smile is closed-mouth and the eyes do not narrow; `js/sim/smile.js` says so itself.
- No one in the three platform censuses was smiling at the instant sampled.

Faults (`$RV/f/z_faces.png`, `sheet_faces1.png`, `sheet_faces2.png`):
- **Hair slabs over an eye.**
  - teen_crop_leggings: a black shard slab across one eye, with stray spikes.
  - ya_ginger_braid: a slab across the forehead and one eye.
- **Notched, blocky hairlines** with a rectangular step: sum_crop_bike, man_beard, sum_shorts_asian_m.
- **man_beard still has no beard.**
- **Smiles read as a crooked pout:** teen_shorts_lad, ya_ginger_braid, sum_shorts_asian_m. The eyebrows are thin dashes.
- **Elders have young faces.** adult_camisole, adult_vneck and adult_leggings_knit are young faces under grey hair.
- **girl** (kind girl) reads as a boy from the front.
- **In the car:** right after boarding (ride r0), the rider at ~1 m was on the LOD model. His face showed black blotches and no eyes. After more frames he was on the full model (`$RV/g/z_ride_pose.png`, left vs right). This may be only a transient after fast-forward (`ff`), but the player can catch it.

### 2.4 Standing, sitting, behaviour: 6.0

What works:
- sit_idle hands rest on the thighs. sit_phone is believable.
- People stand where they wait; nobody paces.
- A rider stood up before Govan to get off (`$RV/g/eyes_ride_r2.png`, top-left).

Faults:
- **`sit_cross_legs` is broken.** The legs do not cross. One leg sticks straight out forward and one forearm hovers in the air.
  - Seen on all 5 sampled people who drew it: sum_crop_bike, teen_shorts_lad, boy_cap, adult_lusekofta, adult_fisherman_leggings (`$RV/a/sheet_G1_SS.png` row 3, `sheet_G1b_SS.png` row 4, `sheet_G2b_SS.png` row 1, `sheet_G2_SS.png` row 5, `sheet_G3_SS.png` row 8; LOD `$RV/lod/sheet_L1.png` row 2).
  - In the real car it was 10 of 59 riders' clip (`$RV/g/ride_r1_census.json`).
- **Texting with a bag held up** (2.2).
- **A walker stood still on the stairs for at least 6 s.** At Ibrox, adult_cap_baggy with a cabin case stayed at exactly the same position and height through 4 samples 1.5 s apart (`$RV/g/stair.log`).
- **Repetition across stations.** adult_tie_suit, adult_leggings_knit, sum_chino_shorts_m, ya_bootcut and boy_small were on all three platforms (Ibrox, Buchanan St, Hillhead). 17 of 78 people appeared on two or more. Census script output, `$RV/g/*_r2_census.json`.
- **Seated poses barely change.** In the car, sum_denim_shorts_m held the same head-turned sit_idle pose across three samples ~50 s apart (`$RV/g/eyes_ride_r0..r2.png`).

### 2.5 Range of people: 6.9

What works:
- Roster of 99: woman 34, man 26, elder 13, teen 13, girl 6, boy 5, staff 2.
- Heights run 1.12 to 1.87 m, with six people over 1.80.
- A good spread of skin tones on the platforms.
- On the three platforms, elders were 18 of 78 people and children 7.

Faults:
- **"Elder" is often only grey hair.** 6 of the 13 elders are the former adult characters re-tagged with grey hair, on young bodies with young faces and young clothes: camisole and stilettos (adult_camisole), spaghetti-strap top (adult_vneck). They walk like young adults (`$RV/a/sheet_G2_SS.png`, `sheet_G2_W.png`).
- **No mobility aids, babies or buggies.** Children are scaled adults.
- **Meta does not match the models.** `girl` is outfit `trousers` in `people_meta.json` but wears denim shorts. man_puffer wears a blue logo tee, not a puffer, and looks like adult_casual2 recoloured (`$RV/a/sheet_G3_SS.png`). So the census of outfits is not quite what is on screen.

### 2.6 Clothing: 6.0

What works:
- The roster now includes shorts (15), leggings (9), crop and tube tops and Lycra.
- Kilts are down to a few.

Faults:
- **More than half of some crowds wear trousers.** "trousers" is 16 of 26 at Ibrox (62%) and 15 of 26 at Buchanan St (58%). In the Hillhead car crowds it is 41 of 68 (60%) (`$RV/g/*_r2_census.json`). The meta bucket mixes jeans and trousers, so this is a soft breach, but it is the rubric's line.
- **One T-shirt mesh is shared and recoloured.** The summer people share it, so many wear the same tee with the same prints (`$RV/a/sheet_G1_W.png`). Its colour is drawn again on each spawn: in the viewer, three spawns of the same person give three colours. That is fine, as long as it never changes under an LOD swap (not tested).
- **Cloth that is not whole:**
  - woman_coat skirt torn while walking (2.1).
  - woman_midi sweater hem in jagged red shards over the skirt, seated back, full model (`$RV/v/z_V.png`, second). Small skirt tear walking front (`$RV/v/z_V.png`, first).
  - elder_woman_coat coat hem tattered, with white holes, walking front and back (`$RV/v/z_V.png`, 4th and 5th).
  - adult_heel_boots: the jeans show through the knee boot at the shin, walking side (`$RV/v/z_V.png`, 3rd). Not fixed.
  - Seated pencil skirts (adult_beret, woman_coat) stretch into a tent between the thighs, with strap-like bands across the thigh (`$RV/a/z_skirts.png`).
  - Red skin spikes through tee hems and socks seated: sum_loose_shorts_w, teen_crop_leggings (`$RV/t/z_A.png`). This is a close-up fault only.

### 2.7 Luggage: 6.7

What works:
- About half carry something: 14, 12 and 14 of 26 on the three platforms.
- Wheeled cases appear: 4 at Ibrox.
- The ten kinds are distinct, towing looks right, and totes and shoppers lie flat on the lap (`$RV/l/sheet_*.png`).

Faults:
- **Bags raised in phone and gesture clips** (2.2).
- **The large hiking rucksack is hugged upright on the lap** when seated (`$RV/l/sheet_adult_tie_suit.png`, ruck-hike sit).
- **A parked trolley stands beside the person with no hand on it** (stand_F, all four bodies). That is plausible when parked.
- **Stairs: measured, not seen.** At Ibrox the cabin case's base was 0.105 m above the lowest foot bone, which is about at sole height (`$RV/g/stair.log`). That is a token lift.
- **The procedural fallback crashes:** `stepBag` reads `rig.handle` when `luggage.glb` is not loaded. It breaks `tools/people_motion.mjs` (`$RV/motion.txt`).

### 2.8 Whole bodies: 5.3

**The far (LOD) model is seen close.**
- Ibrox with a train in: 17 people within 6 m, **8 of them on LOD** (`$RV/g/ibrox.log`, r1). Hillhead r1: 9 full, 9 LOD within 6 m.
- In the car (ride r1, settled): 5 riders on LOD at 4.6-6 m; ride r2: 7.
- The platform crowd gets 9 full-model people and each saloon 7 (`js/sim/index.js:297`), so a platform with a train beside it shows LOD riders through the windows at 3-5 m.

LOD faults at the distance it is used (`$RV/lod/*`, `$RV/t/z_L.png`):
- woman_midi: jagged red sweater shards over the skirt, walking. Not fixed.
- woman_elder: a red blotch at the thigh, holes in the sweater back seated, black wedge shoes. Not fixed.
- adult_tie_suit: wedge shoes with orange and white specks.
- ya_tattoo_tank: dark blotches on the tank and jeans.
- adult_beret: a hole in the seated skirt.
- sum_crop_denim: a helmet-like hard hairline.

Full-model faults:
- woman_coat skirt hole while walking.
- The piper's drone through his face.
- teen_crop_leggings' shard hair.
- elder_woman_coat's tattered hem.

## 3. REVIEW_1 top ten: what was done

| # | REVIEW_1 item | Verdict | Evidence |
|---|---|---|---|
| 1 | Kilt hole on man_highland and adult_piper; hose-shoe gap | **Mostly fixed.** No side or back triangle standing (full and LOD); hose meets shoe. A front slit still opens to the thigh mid-stride. | `$RV/a/z_skirts.png` (3rd, 4th), `$RV/a/z_walkcloth.png` (bottom middle and right), `$RV/lod/sheet_L1.png` row 5 |
| 2 | Walking arm swing | **Fixed for the most part.** Back-swing present, hands at the hip line, fingers curled. Elders and children still swing like adults. | `$RV/w/sheet_stride1.png`, `sheet_stride2.png` |
| 3 | Skin through cloth (man_commuter, teen_hood, man_trews, adult_beret, woman_midi, adult_heel_boots) | **Partly fixed.** man_commuter, teen_hood and man_trews are clean. adult_heel_boots jeans still through the boot; woman_midi still tears walking; adult_beret seated skirt still distorts. | `$RV/v/sheet_V.png`, `z_V.png`, `$RV/a/z_skirts.png` |
| 4 | Hair: bob slabs, bun shards, man_beard, boy_cap, blocky hairlines | **Partly fixed.** bob01/02 slabs gone (woman_midi, woman_dress fine), bun dropped, boy_cap fine. man_beard still beardless and notched. New slabs on teen_crop_leggings and ya_ginger_braid. Notches on sum_crop_bike and sum_shorts_asian_m. | `$RV/f/z_faces.png`, `sheet_faces2.png` |
| 5 | Seated rest poses; girl_small cross-legs | **Partly fixed.** sit_idle and sit_look rest the hands on the thighs. sit_cross_legs is still broken (leg out, arm hovering) on everyone. | `$RV/a/sheet_G1_SS.png`, `sheet_G3_SS.png` |
| 6 | Hands grip handles and phone; loaded arm hangs | **Partly fixed.** Fingers curl and walking bags hang. Bags are still raised by phone and gesture clips. | `$RV/l/z_bags.png`, `$RV/h/sheet_handr.png` |
| 7 | LOD at close range; LOD shoe, sweater and blotch faults | **Not fixed.** Full count raised to 9 on the platform, but 8-9 LOD people still within 6 m with a train in, 5-7 in the car. woman_midi and woman_elder LOD faults unchanged. | `$RV/g/ibrox.log`, `hillhead.log`, `ride.log`, `$RV/t/z_L.png` |
| 8 | Faces: smile, ambient expression, eye movement, lids, irises, mouths | **Largely fixed.** Eyes move, ambient smiles happen, no red irises. The smile is still closed-mouth with no eye change. | `$RV/probe.mjs` numbers (2.3), `$RV/f/sheet_faces1.png` |
| 9 | Crowd mix: tartan, shorts, build, height, age, per-station variety | **Partly fixed.** Tartan about 5%, shorts 17%, taller people, 13 elders. Trousers still over half at 2 of 3 platforms. 5 people on all 3 stations. Half the new elders are only grey hair. | `$RV/g/*_r2_census.json`, `$RV/a/sheet_G2_SS.png` |
| 10 | Luggage handling and hems | **Partly fixed.** About half carry something, trolleys present, lap bags flat, case lifted about 1-3 cm on stairs (numbers only). Hems still ragged: woman_midi, elder_woman_coat; woman_coat skirt worse. | `$RV/l/sheet_*.png`, `$RV/g/stair.log`, `$RV/v/z_V.png` |

## 4. Top ten defects, in priority order

1. **LOD model within 6 m.**
   - What: 8-9 people within 6 m are on LOD on a platform with a train in, and 5-7 in a car.
   - Reproduce: `game2.mjs "mode=explore&q=high&line=outer&station=ibrox"`, round r1; `"mode=ride&...station=ibrox"`, r1/r2.
   - Evidence: `$RV/g/ibrox.log`, `$RV/g/ride.log`.
   - Also: right after boarding, a rider ~1 m away was briefly on LOD, with a broken face (`$RV/g/z_ride_pose.png`).
   - Fix: raise the per-saloon `maxHi` (6-7, `index.js:297`) or budget across all crowds together.
2. **woman_coat skirt torn while walking.**
   - What: a hole with skin showing, and a ragged rear flap, on 7 of 8 stride phases, front and side, full model.
   - Reproduce: `shoot.mjs 0 woman_coat none walk@150..206`.
   - Evidence: `$RV/w/sheet_stride2.png` rows 3-4, `$RV/a/z_walkcloth.png`.
3. **`sit_cross_legs` is broken for every body.**
   - What: one leg juts straight forward and a forearm hovers in mid-air. 17% of riders draw it.
   - Seen on: sum_crop_bike, teen_shorts_lad, boy_cap, adult_lusekofta, adult_fisherman_leggings (stand-in `__spawn(id,'sit')` picks it).
   - Evidence: `$RV/a/sheet_G1_SS.png` row 3, `$RV/a/sheet_G1b_SS.png` row 4.
4. **LOD cloth shards.**
   - woman_midi: red sweater shards over the skirt, walking.
   - woman_elder: thigh blotch, holed sweater back seated, wedge shoes.
   - Also: adult_tie_suit shoe specks, ya_tattoo_tank blotches, adult_beret seated skirt hole.
   - Reproduce: `shoot.mjs 1 ... sit,walk@170`.
   - Evidence: `$RV/t/z_L.png`, `$RV/lod/z_lod1.png`, `$RV/lod/z_lod2.png`.
5. **adult_piper: the drone pipe passes through the face** on full and LOD, standing, walking and sitting. He also takes phone calls while holding the pipes.
   - Evidence: `$RV/a/z_piper.png`, `$RV/lod/z_lod2.png`.
6. **Bags raised by phone and gesture clips.** The bag follows the hand up to chest height.
   - sum_tee_leggings types with the holdall hanging from the texting hand (holdall stand_S).
   - adult_camisole holds the carrier out at arm's length (stand_S) and the briefcase at waist height (stand_S).
   - Fix: suppress phone and gesture clips for the bag hand, or move the bag to the other hand.
   - Evidence: `$RV/l/z_bags.png`, `$RV/l/sheet_adult_camisole.png`.
7. **Hair and beard.**
   - teen_crop_leggings and ya_ginger_braid: slabs over an eye.
   - sum_crop_bike, man_beard and sum_shorts_asian_m: notched, rectangular hairlines.
   - man_beard: still no beard.
   - Evidence: `$RV/f/z_faces.png`.
8. **Cloth not whole, full model, from REVIEW_1:**
   - adult_heel_boots: jeans through the boot at the shin (walk side).
   - woman_midi: sweater hem shards seated (back) and a skirt tear walking (front).
   - elder_woman_coat: tattered coat hem walking.
   - adult_beret and woman_coat: seated pencil skirt tents with bands across the thigh.
   - Evidence: `$RV/v/z_V.png`, `$RV/a/z_skirts.png`.
9. **"Elders" that are young people with grey hair.**
   - adult_camisole (camisole and red stilettos), adult_vneck (strappy top) and adult_leggings_knit have young faces, bodies and walks.
   - No elder gait at all: slower, shorter steps, a stoop.
   - Also man_puffer is a recolour of adult_casual2 with no puffer, and `girl`'s meta says trousers while she wears shorts.
   - Evidence: `$RV/a/sheet_G2_SS.png`, `sheet_G2_W.png`, `sheet_G3_SS.png`, `$RV/f/sheet_faces2.png`.
10. **Crowd mix and repetition.**
    - "trousers" is over half the platform crowd at Ibrox (62%) and Buchanan St (58%), and 60% of the Hillhead riders.
    - adult_tie_suit, adult_leggings_knit, sum_chino_shorts_m, ya_bootcut and boy_small are on all three platforms.
    - A cabin-case walker (adult_cap_baggy) stood motionless on the Ibrox stairs for at least 6 s.
    - Also fix `stepBag`'s missing `rig.handle` fallback, so the rubric's own walking instrument (`tools/people_motion.mjs`) runs again.
    - Evidence: `$RV/g/*_r2_census.json`, `$RV/g/stair.log`, `$RV/motion.txt`.

## 5. Where the next round should look

Not covered here:
- Watching motion: the walking instrument must be repaired first.
- Starts, stops and turns.
- A busy rush-hour car with standees on the poles.
- Boarding and alighting through the doors.
- Whether a T-shirt's colour changes on an LOD swap.
- Stair stills with cases.
- Pet and dog-lead behaviour.
- The other half of the roster's faces: about 60 faces not shot this round or last.

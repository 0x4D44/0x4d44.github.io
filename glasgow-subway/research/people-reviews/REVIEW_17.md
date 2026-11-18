# Under Glasgow: independent review of the people (review 17)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `3fcc3d3a`. The changes since review 16 are `a57aa59f` (a clear way through every car; three skirts stand; floor bags out of the aisle), `f643c2bd` (platform near the player kept under half one garment) and `50030efd` (the smile lifts the whole lip line). I read the diffs read-only: 20 lines in `bags.js`, `index.js`, `people.js` and `smile.js`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited. To compare old and new behaviour, I served a scratch copy of the four changed files at `068cfb1d` on port 8612 (models and data symlinked). I deleted that copy afterwards.

**Result: weighted mean 7.77 (7.765). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Three categories reach 8: Arms and hands (8.10), Standing/sitting/behaviour (8.32) and Luggage (8.28). Five are below 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review17/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. The raw walking recording (`m/rec`) was deleted after scoring; `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.3 | 6.0 | **7.38** |
| 2 | Arms and hands | 10 | 8.7 | 7.2 | **8.10** |
| 3 | Faces | 10 | 8.0 | 6.8 | **7.52** |
| 4 | Standing, sitting, behaviour | 10 | 8.8 | 7.6 | **8.32** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.5 | **8.28** |
| 8 | Whole bodies | 15 | 8.2 | 6.8 | **7.64** |
| | **Weighted mean** | 100 | | | **7.77** (7.765) |

0.20x7.38 + 0.10x8.10 + 0.10x7.52 + 0.10x8.32 + 0.10x7.66 + 0.15x7.70 + 0.10x8.28 + 0.15x7.64 = 1.476 + 0.810 + 0.752 + 0.832 + 0.766 + 1.155 + 0.828 + 1.146 = 7.765.

In one line: up 0.15 from review 16. The walk through a full train is fixed: 48 of 48 walks on eight loads the builder did not use. The knees through skirts are gone, because those three women no longer sit. The rest is small or unchanged:
- Walking carries 20 % of the score and is byte-for-byte unchanged.
- Seated coats and woman_dress still have ragged hems.
- The garment mix still goes over half, on platforms (9 of 101 samples, up to 67 %) and in cars (19 of 232, up to 57 %).
- The V smile is gone from about half the faces.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Walk through a full train: no standing rider within 1 m along the car of one across the aisle (pending spots included); a stranded boarder keeps >= 0.14 m off the middle. 24 of 24 walks | **True.** Review 16's `gwalk.mjs` on eight loads the builder did not use (inner Hillhead, Bridge Street, Kelvinhall, Shields Road; outer Ibrox, Partick, Cowcaddens, West Street), at t = 20, 70 and 130 s, both ways: **48 of 48 reached the far end**. The longest stand-still was 0.1 s. The nearest pass to a standing rider was 0.35-0.44 m. Boarding stats over 400 s rides, old code against new (Buchanan Street inner, Hillhead outer, plus St Enoch outer for new): new 56 routed, 13 sat, 4 stood, 1 lost; old 50 routed, 7 sat, 2 stood, 1 lost. The wider spacing did not cost boarders. | `c/wk_*.log`, `c/x_*.log` |
| 2 | woman_sash, woman_midi, adult_beret no longer sit | **True** (the code bars them; in game they were seen only standing: woman_sash holding a pole at Partick, woman_midi standing at Ibrox). The defect is avoided, not fixed: they stand forever. Other seated skirts and coats still have hem faults; see 3.6. | `people.js` canSit, `p/PT.png`, `n/SK.png`, `n/SKZ.png` |
| 3 | Turned floor bags keep their thin side to the aisle | **True, but only partly a fix.** I measured the closest point of every floor bag to the car's middle line, 26 bags on three rides (Ibrox inner, Kinning Park outer, St Enoch outer). Turned totes and carriers now come to 4-17 cm from the middle, against 0-6 cm in review 16. Three of eleven turned bags are still within 5 cm: adult_tattoo_muscle's carrier at 4 cm and tote at 5 cm, sum_shorts_asian_m's carrier at 5 cm. Untouched by the change: a seated rider's large trolley case stands on the middle line (woman_dress at Ibrox, adult_harem at St Enoch: 0 cm), and a seated case reaches 1 cm. Seen along the aisle, turned bags are still thin wedges: a red handbag and a yellow carrier read as spikes, and a black tote as a sliver. | `bs/bx_*.log`, `gx/IB.png`, `gx/IBZ.png` |
| 4 | Platform garment mix: a rider does not get off on to a platform they would tip over half; the pick rule starts at two near | **True for the builder's two stations; not for the platform crowd in general.** I ran `gp8.mjs` + `cen3.py` (5 groups, crowds within 15 m of the player). Buchanan Street explore: 0 of 17 over half, which confirms the builder. On other stations: Cowcaddens ride **4 of 23, up to 67 % trousers (10 of 15)**; Kelvinbridge explore 2 of 20 (56 %); Govan explore 3 of 20 (the train in the station, 62 %, 8 of 13); Hillhead explore-and-board 0 of 21. That is **9 of 101 samples (9 %)**, against 13 of 65 (20 %) in review 16. Better, not fixed. | `g/*.log`, `g/*.json` |
| 5 | Smile lifts the whole lip line as a U | **True in code; half true to the eye.** 12 faces at 0.85 m, fov 11, neutral and smiling, cropped to the mouth. man_highland, woman_elder, elder_man_cap, adult_beret, boy_cap and woman_bob now smile with a smooth U. The V remains on adult_tattoo_muscle, sum_shorts_asian_m and teen_girl. girl_ginger and ya_smile_dress have the V even at rest, so it is in the mesh, not the morph. Triangular facets show at the corners of several smiles. | `f/Z.png`, `f/MOUTH.png` |
| 6 | Not changed: brisk crouch, seated shorts bulge, coat flap, brows, skin, sum_shorts_asian_m, phone hands, arm splay, open pole hands | **True.** I re-recorded the instrument on the whole roster: the item table is identical to review 16, line for line (overall 9.44; LEG 7.6, p10 5.2; SMO p10 6.9; worst adult_heel_boots @ 0.4 m/s 7.9). Shorts still balloon behind the hips when seated. Coats flap into a split bell. On high pole grips, 2 of 4 hands are open. | `m/items.log`, `n/SK.png`, `w/S.png`, `p/PT.png` |

## 2. Status of REVIEW_16's top ten

| # | REVIEW_16 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated skirts with the knee through a hole | **Avoided** for woman_sash, woman_midi and adult_beret (they stand). **Not fixed** for the skirts and coats still seated: woman_dress's hem has a torn panel beside the left knee; woman_coat's skirt shows its dark underside over the thigh; ya_winter's and elder_woman_coat's coats end in jagged triangles and a balloon. All of these are visible at 2 m. | `n/SK.png`, `n/SKZ.png` |
| 2 | Brisk-walk crouch, pelvis jolts | **Not fixed** (identical numbers). | `m/items.log` |
| 3 | No way through a full train | **Fixed** (48 of 48 on eight new loads). | `c/wk_*.log` |
| 4 | Platform mix near the player over half | **Better, not fixed**: 9 of 101 samples, up to 67 % (Cowcaddens ride). | `g/cc.json` |
| 5 | Faces | **Partly**: the U smile works on about half the faces. The V and the jagged brows remain, the skin is still doll-smooth, and sum_shorts_asian_m is still soft. | `f/Z.png`, `f/MOUTH.png`, `f/N.png` |
| 6 | Open hands on high pole grips | **Not fixed**: girl (axis 6 cm) and woman_sash (hand 2.18 m up, fingers 7-12 cm off the pole) are open-handed at Partick. | `p/PT.png`, `p/pt.log` |
| 7 | Turned floor bags: spikes along the aisle, edge near the middle | **Partly**: the edge is now 4-17 cm off the middle. It still reads as spikes along the aisle. | `bs/bx_*.log`, `gx/IBZ.png` |
| 8 | Phone_stand hands | **Not fixed**. New: a shopper or handbag carried in the phone hand hangs against the belly while the person texts. | `l/Z.png` |
| 9 | Arm splay on brisk walks | **Not fixed**. | `m/items.log` |
| 10 | Small items | heel_boots 7.9 unchanged. boy_cap's black hair still shows through his red cap on the far model. Legs in bags: 1 one-tenth-second walk-through in 300 s (Hillhead, St Enoch). The large case on real stairs is still unseen. | `n/LOD.png`, `bs/hh.log`, `bs/se.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.38 (typical 8.3, worst 6.0)
The instrument output is identical to review 16 (`m/items.log`). Stride stills of six people at 1.6 m/s from the side (`w/S.png`: adult_harem, elder_woman_coat, teen_skater, man_longcoat, ya_winter, sum_crop_denim) read as walking. man_longcoat shows the bent-knee crouch. The worst tenth is still the brisk crouch (LEG p10 5.2) and pelvis jolts (SMO p10 6.9).

### 3.2 Arms and hands: 8.10 (typical 8.7, worst 7.2)
Grip-to-pole medians across five rides: 1.2-3.3 cm on the pole clip, 0.9-2.7 cm on the rail clip. 10 of about 280 holder-samples were over 4 cm (max 11.2 cm, Kelvinbridge). At Partick, 2 of 4 close-ups were open hands (girl, woman_sash on a high grip). Phone_stand hands are unchanged. A bag held in the phone hand is pressed to the belly (`l/Z.png`). Unchanged overall.

### 3.3 Faces: 7.52 (typical 8.0, worst 6.8)
24 faces in this round, 12 of them new (`f/N.png`). The U smile has helped about half the mouths. Worst tenth:
- the V on adult_tattoo_muscle, sum_shorts_asian_m and teen_girl;
- girl_ginger and ya_smile_dress have the V even at rest;
- adult_smile_blouse, ya_smile_halter and girl_ginger look smiling at rest, so for them a smile does not "come and go";
- jagged cut-out brows (girl, boy, teen_skater, adult_cap_baggy);
- doll-smooth skin.

### 3.4 Standing, sitting, behaviour: 8.32 (typical 8.8, worst 7.6)
- Good:
  - the walk through the train is fixed;
  - far model within 6 m: 0 in 5 runs;
  - duplicates: 0;
  - boarders are not lost more often than before.
- Worst tenth:
  - at Cowcaddens a standing elder_woman_coat stood 4 cm from a seated woman_elder for 0.5 s (a rider rising and a boarder sitting at the same seat);
  - 2 of 14 stair walkers at Buchanan Street stalled on the stairs for 3-4 s (review 16: 0 of 41);
  - 1 of 56 boarders vanished inside the car ("no place", Buchanan Street);
  - about 70 % of routed boarders walk to the doors and stay on the platform. That is old behaviour (the old code gives the same) and looks odd if watched.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged at 99. 21 people new to recent reviews were checked standing, walking and sitting (`n/A.png`, `n/B.png`, `n/C.png`). The skin tones, builds, ages and the top-hat, tartan-trews, harem and hi-vis outfits all read well. Children are still 11 %. Three more skirt-wearers can no longer sit, so seated skirts are now down to woman_dress, ya_smile_dress, woman_coat and girl_school_kilt (eleven skirt and kilt wearers are barred from seats). Seated rows are thinner in skirts.

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
- Good:
  - the knee-through-skirt holes are gone from what a player sees;
  - variety is real.
- Worst tenth:
  - seated woman_dress hem torn at the knee;
  - woman_coat skirt underside showing;
  - ya_winter and elder_woman_coat seated coats jagged and ballooned;
  - shorts ballooning behind the hips (`n/SK.png` row 4);
  - ya_winter's walking coat splits into a flap mid-stride (`w/S.png` row 5).
- Mix:
  - platforms near the player over half in 9 of 101 samples (max 67 %);
  - cars over half in **19 of 232** car-samples (Partick 8 of 60 and 1 of 48, Govan 10 of 15, St George's Cross 0 of 49, Kelvinbridge 0 of 60), max 57 % (4 of 7, 5 of 9 trousers). In the Partick log the over-half car was made by boarders at the first stop (3 of 7 trousers became 5 of 9). The old code gives the same (5 of 54 on Partick), so this is not a regression. Review 16's 0 of 165 was a lucky sample: boarders are not checked against the car's mix.

### 3.7 Luggage: 8.28 (typical 8.8, worst 7.5)
- Good:
  - every kind on two bodies, standing, walking and seated, hangs, stands and tows correctly (`l/A.png`);
  - turned bags have moved off the middle line.
- Worst tenth:
  - a seated rider's large trolley case on the middle line (2 of 3 rides);
  - turned bags still spikes from along the aisle;
  - one trolley-in-holdall overlap (Hillhead);
  - the shopper held at the belly while texting.

### 3.8 Whole bodies: 7.64 (typical 8.2, worst 6.8)
The worst-tenth faults from review 16 are gone from play. What remains:
- the torn and jagged hems on seated woman_dress and the seated coats (3.6), visible at 2 m;
- boy_cap's hair through his cap on the far model (`n/LOD.png`).

The far model is otherwise whole (8 people standing and seated) and never within 6 m in play.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.6, p10 5.2; SMO p10 6.9). Unchanged for two rounds, and Walking carries 20 %. It is the biggest single drag on the mean.
   - Reproduce: `people_motion.mjs --people all --rec DIR`, then `--from DIR --items --worst 12`.
2. **Seated skirts and coats still break**: woman_dress (torn hem panel at the knee), woman_coat (dark skirt underside over the thigh), ya_winter (jagged triangles), elder_woman_coat (balloon with notches); shorts balloon behind the hips (sum_loose_shorts_w, sum_denim_shorts_m). Standing more people up is not a fix: eleven skirt and kilt wearers are now barred from seats.
   - Reproduce: `node shoot.mjs 0 woman_dress,woman_coat,ya_winter,elder_woman_coat,sum_loose_shorts_w none sit n/x legs`.
   - Evidence: `n/SKZ.png`, `n/SK.png`.
3. **Garment mix over half, cars and platforms.** Cars: 19 of 232 car-samples (boarders are not checked against the car's mix). Platforms: 9 of 101, up to 67 % trousers at Cowcaddens.
   - Reproduce: `node gcar.mjs "mode=ride&q=high&line=inner&station=govan" c/x 150`; `node gp8.mjs "mode=ride&q=high&line=inner&station=cowcaddens" g/x 150` then `python3 cen3.py g/x.json`.
4. **Faces**: the V smile on about 5 of 12 (adult_tattoo_muscle, sum_shorts_asian_m, teen_girl; in the mesh for girl_ginger and ya_smile_dress); "smile" characters smiling at rest; jagged brows; doll skin; facets at the corners of the smile.
   - Reproduce: `node face2.mjs adult_tattoo_muscle,girl_ginger,ya_smile_dress f/x "0:0" 1 8611 "" 11`.
5. **Open hands on high pole grips**: girl and woman_sash at Partick.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=inner&station=partick" p/x 30 10`.
6. **Floor luggage in the aisle**: seated riders' trolley cases on the middle line; turned carriers and totes 4-5 cm from it; spikes along the aisle.
   - Reproduce: `node gbagx.mjs "mode=ride&q=high&line=inner&station=ibrox" 60`; `node gaisle.mjs "mode=ride&q=high&line=inner&station=ibrox" gx/x 60`.
7. **Phone hands**: phone_stand fingers cross; a bag carried in the phone hand is pressed to the belly.
   - Reproduce: `node shoot.mjs 0 adult_camo_cap shopper,handbag stand l/x body`.
8. **Arm splay on brisk walks** (ARM.splay unchanged).
9. **Coat flap while walking**: ya_winter's and elder_woman_coat's coats split and bell mid-stride (`w/S.png`).
10. **Small behaviour items**:
    - 2 of 14 stair walkers stalled for 3-4 s (Buchanan Street explore, `g/bx.json`);
    - a 0.5 s stand-in-seat overlap (Cowcaddens, `g/cc.json`);
    - 1 boarder in 56 vanishes;
    - boy_cap's hair through his cap on the far model;
    - adult_heel_boots @ 0.4 m/s 7.9.

## 5. What I could not observe

- No motion watched. Walking was judged from the instrument and from stills.
- A large case on a real station stair.
- Blink and smile timing in play: code only.
- Loads are random. The per-car mix result swings from 0 of 60 to 10 of 15 between loads.
- The 4 cm stand-in-seat overlap and the vanishing boarder were measured, not rendered.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster, re-recorded | all 99 | `m/rec.log`, `m/items.log` |
| End-to-end walk, 48 walks | inner Hillhead, Bridge Street, Kelvinhall, Shields Road; outer Ibrox, Partick, Cowcaddens, West Street | `c/wk_*.log` |
| Boarding outcomes, old against new code | Buchanan Street inner, Hillhead outer (400 s), St Enoch outer (300 s) | `c/x_*.log` |
| Garment groups per car, grip distances | Partick outer x2 (and old code), St George's Cross inner, Govan inner, Kelvinbridge outer | `c/*.log` |
| Census within 15 m (far model, overlaps, duplicates, stairs, mix) | Kelvinbridge, Govan, Buchanan Street explore; Hillhead explore then board; Cowcaddens ride | `g/*.log`, `g/*.json` |
| Floor-bag positions across the car | Ibrox inner, Kinning Park outer, St Enoch outer | `bs/bx_*.log` |
| Legs in bags, 150 s | Hillhead inner, St Enoch outer | `bs/hh.log`, `bs/se.log` |
| Along-the-aisle views, eye and seated height, 4 cars | Ibrox inner | `gx/IB.png`, `gx/IBZ.png` |
| Holders close up (0.4 m, two sides, 1.2 m) | Partick inner: girl_ginger, girl, girl_shorts, woman_sash | `p/PT.png` |
| Holders at eye height | Kelvinhall outer: man_kilt_casual | `e/KH.png` |
| 21 people new to recent reviews: stand, walk, sit | adult_camo_cap, adult_cap_baggy, adult_cap_shorts, adult_harem, adult_smile_blouse, adult_sport_cap, adult_suit_bun, adult_tophat, adult_oxford_shirt, man_trews, man_longcoat, sum_chino_shorts_m, sum_crop_denim, teen_crop_leggings, teen_skater, ya_smile_halter, ya_knit, ya_winter, staff_woman, girl, boy | `n/A.png`, `n/B.png`, `n/C.png` |
| Seated skirts, coats, shorts, close | ya_winter, woman_coat, elder_woman_coat, woman_dress, ya_smile_dress, girl_school_kilt, sum_loose_shorts_w, sum_denim_shorts_m | `n/SK.png`, `n/SKZ.png` |
| Far model, standing and seated | woman_dress, elder_woman_coat, boy_cap, adult_tophat, ya_smile_halter, teen_crop_leggings, man_trews, adult_harem | `n/LOD.png` |
| Every luggage kind, two bodies, stand/walk/sit | ya_winter, adult_camo_cap | `l/A.png`, `l/Z.png` |
| Faces, neutral and smiling | 12 close (fov 11) + 12 at fov 22 | `f/Z.png`, `f/MOUTH.png`, `f/N.png` |
| Stride sequences, 8 frames side view, 1.6 m/s | 6 people | `w/S.png` |

Next round, look at:
- boarders against the car's garment mix;
- seated coats and woman_dress;
- the platform mix on stations other than Buchanan Street;
- stair stalls at Buchanan Street;
- a large case on a real stair.

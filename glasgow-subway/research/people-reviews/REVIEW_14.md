# Under Glasgow: independent review of the people (review 14)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `bd899fc5` (the code changes since review 13 are in `50515750` (`_bagNear` reads the drawn bag), `6752e825` (plain boots, coats and mini) and `bd899fc5` (far-to-full swap exception widened to 6.5 m); I read the diffs read-only). The model files (people.glb, people_lod.glb, people_meta.json) are the same files reviews 12 and 13 saw. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.49 (7.487). Gate NOT met.** The gate needs a mean above 9 and no category below 8. One category (Luggage, 8.02) reaches 8. The other seven are below 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review14/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. The work was interrupted twice by container restarts. Every run cited below finished after the last restart, or its output survived it.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.3 | 6.0 | **7.38** |
| 2 | Arms and hands | 10 | 8.2 | 6.0 | **7.32** |
| 3 | Faces | 10 | 7.7 | 6.0 | **7.02** |
| 4 | Standing, sitting, behaviour | 10 | 8.5 | 6.8 | **7.82** |
| 5 | Range of people | 10 | 8.1 | 6.8 | **7.58** |
| 6 | Clothing | 15 | 8.1 | 6.6 | **7.50** |
| 7 | Luggage | 10 | 8.7 | 7.0 | **8.02** |
| 8 | Whole bodies | 15 | 8.0 | 6.5 | **7.40** |
| | **Weighted mean** | 100 | | | **7.49** (7.487) |

0.20x7.38 + 0.10x7.32 + 0.10x7.02 + 0.10x7.82 + 0.10x7.58 + 0.15x7.50 + 0.10x8.02 + 0.15x7.40 = 1.476 + 0.732 + 0.702 + 0.782 + 0.758 + 1.125 + 0.802 + 1.110 = 7.487.

In one line: up slightly from 7.47. All four builder claims are true. The plain boots, coats and mini are real fixes. The far model was never seen within 6 m in four game runs, against 2-3 people in three of four runs before. Standing riders in floor bags dropped from 3 of 6 rides to 2 of 7. Two things hold the score down. First, nothing in the gait, faces or seated garments changed. Second, this round I checked the pole and rail holds, which no earlier review checked, and **every rider in a pole or rail hold grips air**: the nearest pole is 0.26-1.08 m from the hand. That costs Arms and Behaviour what the other fixes gained.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Standing riders kept 0.5 m from the floor bag where `stepBag` draws it | **True in the code, and it helps, but some cases remain.** `_bagNear` (`people.js` ~516) now reads the bag mesh's world position, converted into the car's frame. Seven rides, 120-150 s each (gbag probe: the bag's own box against every other person's shin, foot, toe and knee points): Ibrox outer, Buchanan outer, Partick inner, Cessnock outer and Kelvinhall inner were clean. In Hillhead inner run 1, man_elder stood with his left shin and toe in woman_scarf's large trolley case for 6 s near Kelvinhall. In Hillhead inner run 2, **teen_hippy stood with her right foot in adult_suit_bun's tote for 16 s**; this one was rendered, and the foot plainly overlaps the tote at the door pole (`bs/HH2.png` panels b and d). Brief walk-throughs of 1 s also occurred. Review 13: 3 of 6 rides, 12-15 s each. Likely gaps: `_routeBoarder` (`index.js` ~279) picks a seat for a boarder without checking whether a standing rider is already where that boarder's floor bag will go, and a standing spot is checked only against riders already in state `sit`. A rider still walking to a seat has no bag on the floor yet. Both cases happened while the train was approaching or at Kelvinhall. | `bs/hh.log`, `bs/hh2.log`, `bs/HH2.png`, `bs/{ib,bc,pt,ce,kv}.log` |
| 2 | lusekofta's boots plain brown, beret's riding boots near-black | **True.** No white wedges standing, walking or seated (`n/K.png`). lusekofta's boots now read as plain, slightly plasticky brown. beret's boots use a texture multiplied by 0.05, not the 'flat' setting, but they come out black throughout. **Still faulty:** seated, beret's skirt hangs as a bell below the thighs, and the boot tops show V-shaped skin notches (`n/beret_sitF_z.png`). | `n/K.png`, `n/beret_sitF_z.png` |
| 3 | elder_woman_coat plain camel, ya_winter plain navy, teen_tube plain blue mini | **True** on both models (`w/CF.png` rows 1-4). The two coats are still the same mesh, with the same belt and the same hem that balloons when walking, but they no longer read as one garment. woman_mini's green tartan is still a bright, near-neon green. | `w/CF.png` |
| 4 | No far model within 6 m (swap exception now 6.5 m) | **True in four runs.** `lod6` (visible people on the far model within 6 m of the camera, counted every 0.1 s) = **0** in Buchanan inner explore, Kelvinhall outer ride, Cowcaddens inner ride and St Enoch outer explore, over 58,875 person-samples within 6 m. Review 13: 2-3 people in three of four runs. I did not watch a swap happen. | `g/*.log`, `g/*.json` |
| 5 | Not changed: brisk crouch, faces, seated garment edges, garment mix, arm splay | **True.** Instrument reproduced exactly: overall 9.44, LEG 7.6 (p10 5.3), SMO p10 6.9, ARM.splay 9.2, worst recording adult_heel_boots @ 0.4 m/s 7.9. Crouch visible in new brisk stills (`n/C.png`). Faces (`f/F.png`) and seated edges (`s/Z.png`) as before. Garment mix: over half in 7 of 84 samples (max 57 %). | `m/items.log`, `n/C.png`, `f/F.png`, `s/Z.png`, `python3 cen3.py g/*.json` |

## 2. Status of REVIEW_13's top ten

| # | REVIEW_13 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch and pelvis jolts | **Not fixed** (LEG p10 5.3, SMO p10 6.9). In new stills, sum_tee_leggings and ya_bootcut at 1.6 m/s land on bent knees with a forward trunk. | `m/items.log`, `n/C.png` |
| 2 | Faces | **Not fixed.** Smiles are lopsided closed-lip smirks (ya_spiky, man_commuter, teen_skater, adult_tattoo_muscle). sum_shorts_asian_m's face is still blurred with slit eyes. adult_oxford_shirt has a flat orange face with smeared dark eye sockets. | `f/F.png` |
| 3 | Boots with white wedges | **Fixed** (both pairs). beret's seated skirt bell and boot-top notches remain. | `n/K.png`, `n/beret_sitF_z.png` |
| 4 | Standing riders in floor bags | **Better, not fixed:** 2 of 7 rides (6 s and 16 s); one rendered. | `bs/HH2.png` |
| 5 | Seated garment edges | **Not fixed.** woman_coat's skirt flap and dark notch between the thighs are seen at eye height in the Govan car (`gx/gv_t30_woman_coat_e.png`). sum_chino_shorts_m's and elder_shorts' shorts balloon behind the hips. elder_man_cap's T-shirt hangs below the hips as a sheet. | `s/Z.png`, `gx/gv_t30_woman_coat_e.png` |
| 6 | Shared looks | **Largely fixed** for the coat and the mini (now different colours). The coat mesh is still shared, and several young men still share one face template. | `w/CF.png`, `f/F.png` |
| 7 | Arm splay and small free-arm swing | **Not fixed** (ARM.splay 9.2 mean; same recordings). Bag carriers look right (`l/A.png`). | `m/items.log`, `l/A.png` |
| 8 | Far model within 6 m | **Fixed** in 4 of 4 runs (0). Far-model edges at a distance look acceptable on 12 new people (`w/F1.png`). | `g/*.json`, `w/F1.png` |
| 9 | Garment mix over half | **Not fixed:** 7 of 84 samples over half (Buchanan seated cars 55-57 %, St Enoch 53-57 %); review 13: 8 of 81. | `cen3.py g/*.json` |
| 10 | Small items | adult_heel_boots @ 0.4 m/s still 7.9 (unchanged). Stair stalls: none in 4 runs (`maxStallGo` 0). Large case on stairs: not checked. | `m/items.log`, `g/*.json` |

## 3. Per-category reasoning

### 3.1 Walking: 7.38 (typical 8.3, worst 6.0)
- Instrument, whole roster (99 people, re-recorded this round): identical to review 13. GRD 9.6, STR 9.9, TIM 10, PEL 9.8, TRN 10.0/9.9, but **LEG 7.6 (p10 5.3)** (knee 28 deg in loading and 20 deg in mid-stance on average, against textbook ~15-20 and ~5-10), **SMO p10 6.9** (pelvis vertical acceleration 99th percentile 9.2 m/s^2 mean). Worst recording 7.9.
- Stills at 1.6 m/s, 6 phases, side (`n/C.png`): teen_skirt reads well. sum_tee_leggings and ya_bootcut walk with flexed knees in stance and a forward lean. woman_student looks heavy-footed. This is visible at 2-6 m.
- Nothing changed, so the score is unchanged.

### 3.2 Arms and hands: 7.32 (typical 8.2, worst 6.0)
- Good: empty-handed ARM 9.5 / p10 8.5. Every hand bag tried (handbag, holdall, towed case, shopper, case, hiking rucksack) on woman_puffer, man_trews and elder_woman_dress is held by the handle or worn on the back, and the free arm swings (`l/A.png`). The hand-on-handle close-ups on four new bodies are right (`l/H.png`).
- **New, worst tenth: the pole and rail holds grip nothing.** In the game, standing riders get `mode: 'pole'` at a random spot with a random heading (`index.js` ~189: `rng() < 0.55 ? 'pole' : 'stand'`), and boarders who stand get it whenever their character has pole clips (`index.js` ~294). The `stand_hold_pole` / `stand_hold_rail` clip then raises a hand to a pole or rail that is not there. I measured the distance from each holder's hands to the nearest vertex of the car's `orange_pole` meshes. Over 14 samples in two rides (Cowcaddens inner and Shields Road outer, every 20 s for 100 s) it was **0.26-1.08 m. No hand was ever on a pole.** Rendered at Shields Road (`v/P.png`): girl_small, ya_smile_halter, elder_man_cap and adult_heel_boots each hold an open hand up in empty air. The eye-height car views show the same for boy_kilt and teen_tube (`v/FF.png`). A raised arm clutching nothing reads at 2-6 m, and these are among the most common poses in a full car. Review 13 could not judge this because the viewer has no pole.
- Also still present: ARM.splay on brisk recordings; small free-arm swing at moderate speed.

### 3.3 Faces: 7.02 (typical 7.7, worst 6.0)
- 16 faces at 0.85 m, neutral and smiling, 12 of them not in review 13's set (`f/F.png`): adult_oxford_shirt, woman_elder, elder_man_suit, boy_kilt, girl_school_kilt, ya_ginger_braid, man_commuter, adult_tattoo_muscle, staff_woman, teen_skater, ya_spiky, woman_sash, ya_tube_heels, adult_piper; plus sum_shorts_asian_m and ya_smile_halter rechecked.
- Ages and sexes read. Gaze is fine. Smiles are one-sided closed-lip smirks on most of the young men. adult_oxford_shirt's face is a flat orange-brown mask with smeared, dark eye sockets. sum_shorts_asian_m is unchanged: blurred, with slit eyes. Doll-smooth skin throughout. Unchanged files, so the score is unchanged.

### 3.4 Standing, sitting, behaviour: 7.82 (typical 8.5, worst 6.8)
- Better: far model within 6 m 0 in 4 runs. Duplicates 0 in 4 runs. Stair stalls 0 (58 stair walkers). Overlaps: none in three runs; Kelvinhall had 12 brief walking passes of at most 0.5 s. Seated cars at eye height look right (`gx/E.png`). girl_school_kilt sits properly in the game with the seated skirt weights (`gx/gv_t30_girl_school_kilt_l.png`). The viewer's `clip-sit` shows her kilt hanging as a curtain with the thighs through it (`s/Z3.png`), but that is a viewer artefact, not the game.
- Worst tenth: riders reaching for absent poles (3.2); teen_hippy's foot in a tote for 16 s (`bs/HH2.png`).

### 3.5 Range of people: 7.58 (typical 8.1, worst 6.8)
- Roster unchanged: 99 people, of whom 37 are women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys and 2 staff. The two long coats and the two minis are now told apart by colour (`w/CF.png`), so the most obvious shared looks are gone. Still shared: one coat silhouette, and similar young dark-haired male faces (`f/F.png` row 2-4). Children make up only 11 % of the roster. Skin tones span the range (`n/S.png`).

### 3.6 Clothing: 7.50 (typical 8.1, worst 6.6)
- Better: no white wedges on any boot; no maze-striped coats.
- Worst tenth: these seated faults, which are what a seated car shows:
  - woman_coat's skirt flap and the notch between her thighs (seen in a real car at eye height);
  - sum_chino_shorts_m's and elder_shorts' shorts ballooning behind the hips;
  - elder_man_cap's T-shirt hanging below the hips as a sheet;
  - adult_beret's skirt bell and boot-top notches (`s/Z.png`, `n/beret_sitF_z.png`).

  Also: the Lycra shorts carry a sculpted crotch crease (`l/H.png`: ya_tattoo_tank, boy_shorts); woman_mini's tartan is still near-neon; and the garment mix is over half in 7 of 84 samples.

### 3.7 Luggage: 8.02 (typical 8.7, worst 7.0)
- Good: every kind is carried, towed or worn correctly on new bodies (`l/A.png`). Bag inside bag: 0 in 7 rides. Seated riders' legs are never in their own bag. Floor bags stand end-on.
- Worst tenth: standing feet in floor bags in 2 of 7 rides (one rendered, 16 s). End-on totes, carriers and handbags at seated riders' feet read from eye height as thin red or pink slivers standing on the floor (`gx/E.png`, `gx/gv_t30_woman_coat_e.png`). Large case on stairs: not checked.

### 3.8 Whole bodies: 7.40 (typical 8.0, worst 6.5)
- Better: the boots are whole, and no far model was seen within 6 m.
- Worst tenth: the seated shorts balloon, the T-shirt sheet, the skirt flap and notch, and beret's notches, all as in 3.6.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG p10 5.3, SMO p10 6.9; teen_tee, teen_girl, woman_bob, teen_skirt, sum_tee_leggings at 1.6-1.9 m/s). Walking carries 20 % of the weight, and its instrument still fails.
   - Reproduce: `cd glasgow-subway && NODE_PATH=/opt/node22/lib/node_modules node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 12`; stills: `node shoot.mjs 0 sum_tee_leggings,ya_bootcut none walk@160,walk@168,walk@176 n/c body 1.6`.
   - Evidence: `m/items.log`, `n/C.png`.
2. **Pole and rail holds grip air** (new). Standing riders are put at random spots with random headings and then play `stand_hold_pole` / `stand_hold_rail`. Their hands end up 0.26-1.08 m from the nearest pole: 14 of 14 samples in two rides. Either place pole-holders at an actual pole and point them at it (and reach the hand to it), or give riders who are not at a pole an ordinary standing clip.
   - Reproduce: `node gpole3.mjs "mode=ride&q=high&line=inner&station=cowcaddens"` (distances); `node gpole.mjs "mode=ride&q=high&line=outer&station=shields-road" v/p 40` (stills).
   - Evidence: `v/pc.log`, `v/ps.log`, `v/P.png`, `v/FF.png`.
3. **Faces**: lopsided smirk smiles, sum_shorts_asian_m's blurred slit-eyed face, adult_oxford_shirt's flat orange mask, doll skin.
   - Reproduce: `node face.mjs adult_oxford_shirt,sum_shorts_asian_m,ya_spiky,man_commuter f/x "0:0" 1`.
   - Evidence: `f/F.png`.
4. **Seated garment edges**: woman_coat's flap and notch, shorts ballooning behind the hips (sum_chino_shorts_m, elder_shorts), elder_man_cap's T-shirt sheet, adult_beret's skirt bell and boot-top notches.
   - Reproduce: `node shoot.mjs 0 woman_coat,elder_man_cap,sum_chino_shorts_m,elder_shorts,adult_beret none clip-sit-0-30 s/a body`.
   - Evidence: `s/Z.png`, `n/beret_sitF_z.png`, `gx/gv_t30_woman_coat_e.png`.
5. **Standing riders still stand in floor bags** (2 of 7 rides; 6 s and 16 s; both near Kelvinhall). Check a seated boarder's bag position against standing riders before choosing the seat, and treat a boarder walking to a seat as already having the bag on the floor.
   - Reproduce: `node gbagshot2.mjs "mode=ride&q=high&line=inner&station=hillhead" bs/hh2 150` (varies per load).
   - Evidence: `bs/HH2.png`, `bs/hh.log`, `bs/hh2.log`.
6. **Garment mix**: trousers over half in 7 of 84 samples (max 57 %), in the seated cars at Buchanan and on the platform at St Enoch.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan" g/bch 150`; `python3 cen3.py g/*.json`.
7. **Arm splay on brisk walks and small free-arm swing** (ARM.splay; `m/items.log`).
8. **End-on floor bags read as slivers** from eye height in the car: red and pink spikes at seated riders' feet.
   - Reproduce: `node gsk.mjs "mode=ride&q=high&line=inner&station=govan" gx/gv 30,80,130 14`.
   - Evidence: `gx/E.png`.
9. **Shared face template and coat silhouette**: several young men look alike; the two long coats share one mesh and its ballooning hem.
   - Evidence: `f/F.png`, `w/CF.png`.
10. **Small items**:
    - adult_heel_boots @ 0.4 m/s swing-foot clearance (worst recording 7.9);
    - the Lycra crotch crease on ya_tattoo_tank and boy_shorts (`l/H.png`);
    - woman_mini's near-neon tartan;
    - the large case on stairs, still unchecked.

## 5. What I could not observe

- No motion was watched. Walking was judged from stills and the instrument.
- Blink and smile timing: code only. In the car views, smile weights of 0.16-0.51 were seen on riders (`v/sh.log`).
- The far-to-full swap itself: counted (0 within 6 m), not seen happening.
- The large case on a real station stair: not checked.
- Whether the remaining floor-bag events come from the boarding race described in 1.1: inferred from the code and from when they happened, not traced.
- Every game load differs; numbers are per run. Two container restarts killed earlier runs; everything cited was rerun or survived.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Walking instrument, whole roster (99), re-recorded and scored with items and worst 12 | all | `m/rec.log`, `m/items.log`, `m/rec/` |
| Brisk walk 1.6 m/s, six phases, side | teen_skirt, sum_tee_leggings, ya_bootcut, woman_student | `n/C.png` |
| Boots: standing, seated and walking, F/S/B | adult_lusekofta, adult_beret | `n/K.png`, `n/beret_sitF_z.png` |
| Coats and minis, stand and walk, both models | elder_woman_coat, ya_winter, teen_tube, woman_mini | `w/CF.png` |
| Standing, both models, 12 people new to review 13 | adult_camo_cap, adult_cap_baggy, adult_vneck, adult_string_vest, elder_man_suit, woman_elder, boy_cap, girl_leggings, teen_ginger, teen_shorts_lad, ya_knit, ya_ginger_long | `n/S.png` |
| Far model standing, F/B | woman_dress, ya_smile_dress, teen_cutoffs, man_beard, staff_hivis, girl_school_kilt, adult_runner, ya_tattoo_tank, sum_crop_bike, woman_puffer, man_trews, elder_woman_dress | `w/F1.png` |
| Seated, three sit clips, F/S/B | woman_coat, elder_man_cap, sum_chino_shorts_m, ya_shorts, elder_shorts, woman_midi, man_kilt_casual, ya_smile_dress, girl_school_kilt, adult_cyclist, sum_crop_denim, ya_tube_heels | `s/Fr.png`, `s/S.png`, `s/Bk.png`, `s/Z.png`, `s/Z2.png`, `s/Z3.png` |
| Bags walking (hiking ruck, large trolley, shopper, handbag, case) | woman_puffer, man_trews, elder_woman_dress | `l/A.png` |
| Hands on handles, walking | ya_tattoo_tank, woman_elder, boy_shorts, adult_suit_bun x handbag, holdall, cabin trolley, none | `l/H.png` |
| 16 faces at 0.85 m, neutral and smiling | listed in 3.3 | `f/F.png` |
| Floor bags vs legs, bag vs bag | Hillhead inner x2, Ibrox outer, Buchanan outer, Partick inner (120 s); Cessnock outer, Kelvinhall inner (150 s) rides | `bs/*.log`, `bs/HH0.png`, `bs/HH2.png` |
| In-car seated close views, eye height and low, t = 30/80/130 s | Govan inner ride, 15+ seated riders incl. girl_school_kilt, woman_coat, woman_midi, woman_sash, woman_dress | `gx/K.png`, `gx/E.png`, `gx/gv_*` |
| Game census `gp8.mjs`, 150 s each (far model < 6 m, overlaps, duplicates, stair stalls, garment mix) | Buchanan inner explore, Kelvinhall outer ride, Cowcaddens inner ride, St Enoch outer explore | `g/*.json`, `g/*.log` |
| Eye-height views in a moving car, 8 directions, nearest 10 faces | Shields Road outer ride, t = 40 and 90 s | `v/Y.png`, `v/FF.png`, `v/sh.log` |
| Pole and rail holds: hand-to-pole distance, stills | Cowcaddens inner and Shields Road outer rides (14 samples); Shields Road stills | `v/pc.log`, `v/ps.log`, `v/P.png` |

Next round, look at: the large case on a real station stair; pole holds after any fix (hand-to-pole distance under ~5 cm); watch a boarding at Kelvinhall for the bag race; the platform crowd at eye height with the far-model swap happening as a train arrives.

# Under Glasgow: independent review of the people (review 5)

Reviewed: HEAD of `glasgow-subway` = `81eee787` ("act on adversarial review 4"), served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611.
Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Judged from scratch; REVIEW_1-4 numbers were not used as a starting point.
Nothing in the repository was edited. A copy of the previous build (`42c0422e`, via `git archive`) was served from the scratchpad on port 8613 only to date one defect.

**Result: weighted mean 6.6 (6.58). Gate NOT met** (needs mean > 9 and no category < 8; no category reaches 8).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review5/`. In stills `_F` = front quarter, `_S` = side, `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.0 | 5.0 | **6.2** |
| 4 | Standing, sitting, behaviour | 10 | 8.0 | 4.5 | **6.6** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 3.5 | **5.6** |
| 7 | Luggage | 10 | 8.0 | 6.0 | **7.2** |
| 8 | Whole bodies | 15 | 7.0 | 4.0 | **5.8** |
| | **Weighted mean** | 100 | | | **6.6** (6.58) |

0.20x7.2 + 0.10x7.4 + 0.10x6.2 + 0.10x6.6 + 0.10x6.9 + 0.15x5.6 + 0.10x7.2 + 0.15x5.8 = 6.58.

The builder's fixes are mostly real (far model near the player, the oxford far shirt, the fedora, seated long coats, crowd trousers share in most places). They are offset by
(a) a broken waist on two trouser-wearers that every earlier review missed (it predates this commit), and (b) the stair jam, which is now worse: whole staircases of
people stand frozen in single file on the walk clip for 40-97 s.

## What I could not observe

- **No motion watched.** Walking and transitions are judged from stride stills, the instrument (`motion_all.txt`) and per-step position traces.
- **Game stepping** is `sim.tick(0.1)+sim.sync(0.1)` (10 fps game time), rendering every 10th step (`g4.mjs`), so LOD and attention counts are true per-step counts.
- **Clip-change rates in the ride run are inflated** (49.6 per person-minute) by the known key collision when one id rides both trains (`g4.mjs` keys by id + crowd name). Platform runs, without the collision, give 1.7/min (`g/hh_stats.json`, `g/sten_stats.json`). I did not re-measure per-rider transition sizes.
- **Viewer sit stills have no seat; `sitalt` clips spawn in stand mode; phone clips in the viewer ignore the bag** (the shooter sets the bag after the clip is chosen). So I did not fault phone-with-bag poses seen in the viewer (`a/hr.png`); in the game no hand-bag carrier was on a phone (`g/ride_c0.json` check).
- **My first boarding attempt (`g/sten.log`, after t=138) was invalid:** the driver boarded a train standing at the next station, 600 m away, so riders were invisible and views show bare tunnel. Re-done properly in `v/bd2.log` (board at St Enoch while stopped). The `g/sten_c4-9` and `g/sten_s4-8` files are therefore not evidence.
- Faces of platform waiters in the game are rarely visible (they face the track; `g/sten_s0_near.png`, `v/faces.png` are mostly backs of heads and train bodies).

## 1. What I sampled (52 people)

| What | Who | Evidence |
|---|---|---|
| The 12 people now in shorts: stand (F/S/B) + walk at frames 158/174/190; legs close-up stand + walk174 for 5 | teen_skater, teen_runner, ya_tee_jeans, ya_spiky, adult_cap_baggy, adult_camo_cap, teen_ginger, ya_tattoo_tank, ya_ginger_braid, adult_tattoo_muscle, ya_bootcut, teen_tee | `a/sh1.png`, `a/sh2.png`, `a/lg.png` |
| **26 people no earlier review leaned on**: stand + walk166 (F/S) | man_commuter, man_student, staff_hivis, boy, boy_small, adult_runner, adult_casual2, adult_casual5, man_longcoat, woman_dress, girl_small, man_trews, woman_sash, boy_kilt, teen_tube, adult_lusekofta, adult_suit_bun, elder_woman_dress, staff_woman, adult_fisherman_leggings, adult_string_vest, adult_piper, ya_smile_halter, sum_tee_leggings, elder_shorts, sum_chino_shorts_m | `a/nw1.png`, `a/nw2.png`; waist/hem zooms `a/z.png` |
| **All 99 at the waist**, full model, front + back | everyone | `waist0/s1.png`, `s2.png`, `s3.png` |
| Every sit clip (sit_idle, sit_phone, sit_look, sit_cross_legs), F/S/B, full model | woman_midi, woman_coat, adult_beret, teen_tube, woman_sash, adult_suit_bun, ya_bootcut, adult_cap_baggy, elder_shorts, man_commuter, boy_kilt, sum_chino_shorts_m | `b/s1.png`, `b/s2.png`; skirt zoom `b/zs.png` |
| Walking cloth re-check (4 phases, legs) | woman_midi, elder_woman_coat, woman_coat | `w/z.png` |
| Faces at 0.85 m, neutral: 30; smile 0.85 at two gazes: 10 | 30 listed in `f/n.log` (incl. man_commuter, staff_hivis, boy, boy_small, teen_runner, adult_runner, adult_casual2/5, man_longcoat, woman_dress, girl_small, man_trews, woman_sash, boy_kilt, teen_tube, adult_lusekofta, adult_suit_bun, elder_woman_dress, staff_woman, ya_fedora, man_hoodie, sum_denim_shorts_m, adult_cyclist, teen_ginger, adult_cap_baggy) | `f/n1.png`, `f/n2.png`, `f/sm.png` |
| Hands: 8 standing with a handbag; left and right hand at 0.9 m with handbag / holdall / case / shopper on 3 bodies | adult_suit_bun, woman_dress, man_longcoat (+5) | `a/h.png`, `a/hl.png`, `a/hr.png` |
| Luggage: 9 kinds x stand / sit / walk / stair | woman_dress, adult_casual2 | `l/woman_dress.png`, `l/adult_casual2.png` |
| Far model: all 99 standing and all 99 in sit_idle; 7 walking (F/B) | everyone; adult_oxford_shirt, ya_winter, elder_woman_coat, man_kilt_casual, adult_tophat, ya_fedora, man_commuter | `lod/st-1.png`, `lod/st-2.png`, `lod/sit-1.png`, `lod/w.png` |
| Previous build (42c0422e) for dating | man_commuter, man_trews, adult_oxford_shirt far | `waistold/s.png` |
| Walking instrument, whole roster, every scenario | 99 | `motion_all.txt`, `motion_worst8.txt`, recordings `motall/` |
| **Game**: St Enoch platform 60 s (train in at ~60 s); Ibrox ride (`mode=ride`) 150 s; Hillhead (inner) platform 120 s; Ibrox platform views at 15/60/110 s; board at St Enoch with doors open and ride 25 s; stair traces Ibrox 120 s and St Enoch 90 s; Ibrox stair-foot views | | `g/sten*`, `g/ride*`, `g/hh*`, `v/ibx*`, `v/bd2*`, `v/stair_ibx.log`, `v/stair_sten.log`, `v/stv*.png`, `v/sv2.png` |

## 2. Per-category reasoning

### 2.1 Walking: 7.2 (typical 8.0, worst 6.0)
- Instrument, whole roster (`motion_all.txt`): overall **9.23, identical to review 4**; LEG 7.6 / p10 5.3, ARM p10 5.1, SMO p10 6.9, TRN p10 3.3. Gate not met. The gait did not change.
- Worst recordings (`motion_worst8.txt`): teen_skirt@1.6 7.5 (knee 31 deg mid-stance, 46 deg at loading, ARM.sym 51%), ya_ginger_braid@1.6 7.6, sum_crop_bike@1.2 7.6, adult_heel_boots@0.4 7.9, teen_crop_leggings, teen_girl, teen_tee, woman_puffer at 8.0-8.1. The crouched gait of short women/teens is unchanged (acknowledged).
- Pencil-skirt shuffle eased a little: woman_coat 145 steps/min at 1.61 m/s with 0.67 m steps (was 150 / 0.54), adult_beret 143. Still brisk but no longer mincing.
- Stills: the 12 new shorts wearers and 26 new people all show heel strike, swing-knee flexion and toe-off (`a/sh1.png`, `a/sh2.png`, `a/nw1.png`, `a/nw2.png`).
- Stair walkers stand on the walk clip at zero speed for long periods (2.4); scored there.

### 2.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)
- Arm swing reads in every walk still; ARM.sym 50-54% on the worst recordings (one arm swings about half the other), unchanged.
- **Phone grips unchanged:** in `phone_stand` the fingers splay round the phone like a claw (man_longcoat, adult_suit_bun, teen_tube `f/sm.png`; man_longcoat `a/hl.png` row 4); in `phone_call` adult_suit_bun holds the phone against the ear with a flat open palm (`a/hr.png` row 1).
- Bag handles: the curled fingers meet the handle for adult_suit_bun and woman_dress (`a/hl.png`), but man_longcoat's open hand sits about 3 cm above the handbag and holdall handles (`a/hl.png` rows 3-4): a close-up fault.

### 2.3 Faces: 6.2 (typical 7.0, worst 5.0)
- Fixed: **ya_fedora now has a real fedora** (`f/n2.png`, `lod/w.png`, in game `g/sten_s0_eye.png`); teen_ginger's hair is ginger (`a/sh2.png` row 1).
- Smiles are larger (ambient 0.45-0.85, `waiting.js:123`) and are seen: smile > 0.3 in 11.2% of St Enoch platform samples, 11.7% at Hillhead, 10.4% of riders (`g/sten_stats.json`, `g/hh_stats.json`). Close up they are still closed-mouth lip-corner pulls; ya_ginger_braid's is a pursed duck-lip, man_hoodie's a lopsided smirk (`f/sm.png`).
- **One male face template on many people:** man_commuter, staff_hivis, boy, adult_casual5, boy_kilt, man_student share the frowning thin-brow face (`f/n1.png`); man_hoodie and sum_denim_shorts_m are still the same face and hair (`f/n2.png`).
- adult_cyclist still has near-white irises (`f/n2.png`). Hair is blocky cards on man_student, adult_casual5, adult_string_vest (`f/n1.png`, `f/n2.png`).
- Good: elders (man_longcoat, adult_lusekofta, elder_shorts) read old; women read female from the front.

### 2.4 Standing, sitting, behaviour: 6.6 (typical 8.0, worst 4.5)
- Good: a full car reads well at eye height (`g/ride_s0_eye.png`, `v/bd2.png`); seated riders on phones; long-coat wearers now stand (ya_winter `stand` in `g/sten_c0.json`, never seated in any census).
- **The stair jam is worse.** Stair traces (every 0.5 s, `stair5.mjs`):
  - Ibrox (`v/stair_ibx.log`): 16 of 17 stair walkers stood still (moved < 10 cm in 3 s) in `go` mode on the `walk` clip; adult_cap_baggy (trolley), elder_man_cap (shopper), sum_chino_shorts_m (holdall) for 90-98 s at the stair foot; a single-file column of 10 more from y 1.6 to 4.6 m for 28-59 s each.
  - St Enoch (`v/stair_sten.log`): 12 of 14 stalled 11-68 s, the same column pattern.
  - Seen in `v/sv2.png`: twelve people one behind the other up the Ibrox stairs, all on `walk`, at 0.32 m vertical spacing (log line in `v/sv2` run output). Review 4 saw 5-15 s stalls.
- Seated pencil skirts still tent and split (woman_coat, adult_beret; `b/zs.png`).
- The same person twice in one train: woman_scarf seated at 4.6 m and 14.1 m in `sal_outer`, both on `sit_phone` at once; sum_tube_denim at 2.0 m and 19.4 m (`g/ride_c2.json`, `g/ride_c8.json`).

### 2.5 Range of people: 6.9 (typical 7.5, worst 6.0)
- Census of `people_meta.json`: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff; adult heights 1.55-1.87 m; skin tones varied. Spawned crowds mix all kinds (`census4.py` output: kinds field).
- Repetition behind the variety: the printed tee (one mesh, recoloured per spawn) is on most of the 12 new shorts wearers and most young men (`a/sh1.png`, `a/sh2.png`, `lod/st-2.png`); **staff_hivis and staff_woman wear the same lime dungarees and yellow tee, with no hi-vis** (`a/nw1.png` row 2, `a/nw2.png` row 3); ya_winter and elder_woman_coat wear the same coat (`lod/w.png`); duplicates in one train (2.4).
- Names still do not match bodies: man_longcoat wears a suit, man_puffer a jumper, adult_cap_baggy tight shorts.
- No mobility aids or buggies; children are scaled adults.

### 2.6 Clothing: 5.6 (typical 7.0, worst 3.5)
**Mix** (`census4.py g/hh g/sten g/ride`):
- Platforms: St Enoch 42-50% trousers, Hillhead 35-38%, Ibrox (ride start) 33-41%. **Platforms passed on the ride: 52-60%** (`g/ride_c5`-`c9`).
- Cars: 42-50% trousers. Much better than review 4 (52-88%), but the rubric's "no more than half" still fails on passed platforms.
- Shorts are now 30-42% of most crowds, in a deep-level station; the rubric lists shorts, so I do not penalise the share, but the **painted shorts** are flat colour on the skin with a thin hem flare: no seams, pockets or folds, a skin-tight seat (`a/lg.png`). Passable at 2-6 m, plastic under 1 m.

**Cloth not whole:**
- **man_commuter and man_trews: a ragged band of bare skin all round the waist** between shirt and trousers, standing, walking and seated, front and back, full and far model (`a/z.png` rows 1-2, `waist0/s2.png` rows 2-3, `b/s2.png` row 4, `lod/w.png` row 5). Visible at 3-4 m. Present in the previous build too (`waistold/s.png`), so missed by every review, not introduced now. 0-3 on the scale.
- elder_woman_coat walking: the coat front splits to show the jeans and the hem is ragged (`w/z.png` row 2; far model `lod/w.png` row 2). Not fixed.
- woman_coat seated: the pencil skirt splits into angular flaps with skin showing; adult_beret: pale wedges at the boot tops, seated (`b/zs.png`). Not fixed (acknowledged).
- Smaller: sum_loose_shorts_w's tee hem is ragged at the back with a skin notch, seen in the game at 1-2 m (`g/sten_s0_eye.png`, `g/sten_s0_near.png`); white sock cuffs saw-toothed on ya_bootcut and teen_tee (`a/lg.png` rows 1 and 5); adult_lusekofta's cropped trouser hems are jagged (`a/nw2.png` row 2).
- Fixed: woman_midi's thigh hole when walking (now a clean side slit, `w/z.png` row 1); seated long coats (they stand).

### 2.7 Luggage: 7.2 (typical 8.0, worst 6.0)
- Nine kinds hang correctly from hand or back when standing and walking; cases are towed on their wheels (`l/woman_dress.png`, `l/adult_casual2.png`). In game, bags sit on laps, the floor, hands and backs (`census4.py` "where").
- **Rucksacks (day and hiking) are still hugged upright on the lap** (`l/woman_dress.png` row 1, sit).
- Carriers of trolleys, cases, holdalls and shoppers are among those frozen on the stairs for up to 98 s (2.4), so no case is carried up or down a real stair in motion.
- Hand gap of about 3 cm on man_longcoat (2.2).

### 2.8 Whole bodies: 5.8 (typical 7.0, worst 4.0)
**Far model near the player (fixed):**

| Where | Far model within 6 m |
|---|---|
| St Enoch platform, 60 s, train arriving and standing | 0 in 600 steps (`g/sten.log` t=15-60; the post-board part of that run is invalid) |
| Hillhead platform 120 s | 0 in 1200 steps (`g/hh_stats.json`) |
| Ibrox ride 150 s | 1 step of 1500 (max 5 at once, the first frame), ids at 5.1-5.9 m (`g/ride_stats.json`) |
| St Enoch, beside the train with doors open / just after boarding / 25 s riding | 0 of 20, 0 of 15, 0 of 15 (`v/bd2.log`) |

- adult_oxford_shirt's far shirt is whole (`lod/st-1.png`, `lod/w.png` row 1; the old build's broken one `waistold/s.png`). ya_fedora's and adult_tophat's far models are clean.
- Still broken: man_commuter / man_trews waist on both models (2.6); ya_winter and elder_woman_coat far models walking show the coat splitting and a white flap under the back hem (`lod/w.png` rows 1-2).
- Hair cards and the shared face (2.3) keep the typical case at 7.

## 3. REVIEW_4 top ten: verification

| # | REVIEW_4 item | Verdict | Evidence |
|---|---|---|---|
| 1 | adult_oxford_shirt far model has no shirt | **Fixed.** Shirt whole standing, seated and walking. | `lod/st-1.png`, `lod/w.png`; old build `waistold/s.png` |
| 2 | Seated long coats balloon | **Fixed by avoidance.** ya_winter / elder_woman_coat never sit in any census (`people.js` `_canSit` longCoat). The coat still splits when walking. | `g/sten_c0.json`; `w/z.png` row 2 |
| 3 | Far model within 6 m beside a train | **Fixed.** 0 within 6 m on platforms, beside an open train and after boarding; 1 step in the ride run. | table in 2.8 |
| 4 | Crowds over half trousers | **Mostly fixed.** Platforms 33-50%, cars 42-50%; platforms passed on the ride still 52-60%. | `census4.py` on `g/hh`, `g/sten`, `g/ride` |
| 5 | Crouch, ARM.sym, pencil-skirt shuffle | **Not fixed** (crouch, ARM.sym: instrument identical, 9.23). Shuffle **partly** eased (150 to 145 steps/min, step 0.54 to 0.67 m). | `motion_all.txt`, `motion_worst8.txt` |
| 6 | woman_midi tear, elder_woman_coat split walking | **Partly.** woman_midi fixed (clean side slit). elder_woman_coat split and ragged hem remain. | `w/z.png` |
| 7 | ya_fedora broken head | **Fixed.** A real fedora; no shard. | `f/n2.png`, `lod/w.png` |
| 8 | Seated pencil-skirt tents; adult_beret boot tops | **Not fixed** (acknowledged). | `b/zs.png` |
| 9 | Stair walkers jam at the foot | **Not fixed; worse.** 12-16 per staircase stand on `walk` at v = 0 for 11-98 s, a frozen column up the stairs. | `v/stair_ibx.log`, `v/stair_sten.log`, `v/sv2.png` |
| 10 | Faint smiles, clone faces, man_puffer twice in a train, card hair, rucksacks on lap | **Partly.** Smiles stronger and frequent (still closed-mouth). Clones, duplicates in one train (woman_scarf, sum_tube_denim), card hair, lap rucksacks unchanged. | `f/sm.png`, `f/n2.png`, `g/ride_c2.json`, `l/woman_dress.png` |

## 4. Top ten defects, in priority order

1. **man_commuter and man_trews: bare skin all round the waist.**
   - What: a ragged skin-coloured band with dark shards between shirt and trousers, in every pose (stand, walk, all sit clips), front and back, full and far model. Visible at 3-4 m. Predates this commit (also in `42c0422e`).
   - Reproduce: `node shoot.mjs 0 man_commuter,man_trews none stand,walk@174 a/Z body`; far: `node shoot.mjs 1 man_commuter none stand,walk@170 lod/W`; all 99: `node all.mjs 0 waist0 waist stand 3.7,0.6`.
   - Evidence: `a/z.png`, `waist0/s2.png`, `b/s2.png` row 4, `lod/w.png` row 5, `waistold/s.png`.
2. **Stair walkers freeze in a column on the stairs.**
   - What: 12-16 people per staircase stand still in `go` mode on the `walk` clip for 11-98 s, single file up the stairs; trolley/holdall/shopper carriers stuck at the foot for 90+ s.
   - Reproduce: `node stair5.mjs "mode=explore&q=high&line=outer&station=ibrox" v/stair_ibx 120` (and `station=st-enoch`); view `node stv2.mjs "mode=explore&q=high&line=outer&station=ibrox" v/sv2 70`.
   - Evidence: `v/stair_ibx.log`, `v/stair_sten.log`, `v/sv2.png`.
3. **Gait unchanged: crouch and one-sided arm swing** (instrument 9.23, LEG p10 5.3, ARM p10 5.1, TRN p10 3.3).
   - Who: teen_skirt@1.6 (knee 31 deg mid-stance, 46 deg loading, ARM.sym 51%), ya_ginger_braid, sum_crop_bike, teen_crop_leggings, teen_girl, teen_tee, woman_puffer.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 8`.
   - Evidence: `motion_all.txt`, `motion_worst8.txt`.
4. **Seated pencil skirts split and tent; adult_beret boot tops.**
   - What: woman_coat's skirt breaks into angular flaps showing skin in sit_idle and sit_cross_legs; adult_beret pale wedges at the knees.
   - Reproduce: `node shoot.mjs 0 woman_coat,adult_beret none clip-sit-0-30,clip-sitalt-1-30 b/S`.
   - Evidence: `b/zs.png`, `b/s1.png` rows 2-3.
5. **elder_woman_coat / ya_winter: the long coat splits when walking** to show the jeans, ragged hem, white flap under the back hem on the far model.
   - Reproduce: `node shoot.mjs 0 elder_woman_coat none walk@166,walk@198 w/Z legs`; `node shoot.mjs 1 ya_winter,elder_woman_coat none walk@170 lod/W`.
   - Evidence: `w/z.png` row 2, `lod/w.png` rows 1-2.
6. **The same person twice in one train.**
   - What: woman_scarf seated at 4.6 m and 14.1 m in the same saloon, both on sit_phone together; sum_tube_denim at 2.0 m and 19.4 m.
   - Reproduce: `node g4.mjs "mode=ride&q=high&line=outer&station=ibrox" g/ride 150 0.1 15`, then look for repeated ids per `c` in `g/ride_c2.json`, `g/ride_c8.json`.
7. **One face for many men; clones.**
   - What: man_commuter, staff_hivis, boy, adult_casual5, boy_kilt, man_student share one frowning thin-brow face; man_hoodie = sum_denim_shorts_m (face and hair); adult_cyclist's near-white irises.
   - Reproduce: `node face.mjs man_commuter,staff_hivis,boy,adult_casual5,boy_kilt,man_hoodie,sum_denim_shorts_m,adult_cyclist f/N`.
   - Evidence: `f/n1.png`, `f/n2.png`.
8. **Garment repetition and staff without hi-vis.**
   - What: staff_hivis and staff_woman wear identical lime dungarees and a yellow tee (no hi-vis); the printed tee is on most young men and the new shorts wearers; ya_winter and elder_woman_coat share one coat.
   - Evidence: `a/nw1.png` row 2, `a/nw2.png` row 3, `a/sh1.png`, `lod/w.png`.
9. **Rucksacks hugged upright on the lap; hands that do not grip.**
   - What: day and hiking rucksacks sit upright on the lap; phone_stand fingers splay round the phone; phone_call phone held by a flat palm; man_longcoat's hand about 3 cm above the bag handle.
   - Reproduce: `node shoot.mjs 0 woman_dress ruck:day,ruck:hike clip-sit-0-30 l/L`; `node shootl.mjs 0 man_longcoat handbag,holdall stand a/HL handr`.
   - Evidence: `l/woman_dress.png`, `a/hl.png`, `a/hr.png`, `f/sm.png`.
10. **Small ragged cloth edges and flat painted shorts.**
    - What: sum_loose_shorts_w's ragged tee hem with a skin notch (seen in the game at 1-2 m); saw-toothed white sock cuffs (ya_bootcut, teen_tee); jagged trouser hems (adult_lusekofta); painted shorts with no seams or folds and a skin-tight seat. Platforms passed on the ride are still 52-60% trousers.
    - Evidence: `g/sten_s0_eye.png`, `a/lg.png`, `a/nw2.png` row 2, `census4.py g/ride`.

## 5. For the next round

- Watch motion in real time, above all the stairs, boarding, and the swap to the full model at 6 m.
- Re-run the all-99 waist sweep (`all.mjs ... waist`) after any garment or `trimUnderTop` change; this round found a hole nobody had looked for.
- Faces not yet shot in any round: woman_student close smile, girl_small smile, adult_piper, adult_heel_boots, ya_smile_polo, teen_hood.
- Fix the reviewers' `g4.mjs` clip-change key (id + crowd name collides across the two trains).

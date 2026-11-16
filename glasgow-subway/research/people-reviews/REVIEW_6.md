# Under Glasgow: independent review of the people (review 6)

Reviewed: `glasgow-subway` at `7b1efd1c` ("act on adversarial review 5"; repo HEAD `9b103c34` does not touch `glasgow-subway`), served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611.
Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Judged from scratch; REVIEW_1-5 numbers were not used as a starting point. Nothing in the repository was edited.

**Result: weighted mean 6.5 (6.54). Gate NOT met** (needs mean > 9 and no category < 8; no category reaches 8).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review6/`. In stills `_F` = front quarter, `_S` = side, `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 7.5 | 6.0 | **6.9** |
| 3 | Faces | 10 | 7.0 | 5.5 | **6.4** |
| 4 | Standing, sitting, behaviour | 10 | 8.0 | 5.0 | **6.8** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 3.0 | **5.4** |
| 7 | Luggage | 10 | 8.0 | 6.0 | **7.2** |
| 8 | Whole bodies | 15 | 7.0 | 4.0 | **5.8** |
| | **Weighted mean** | 100 | | | **6.5** (6.54) |

0.20x7.2 + 0.10x6.9 + 0.10x6.4 + 0.10x6.8 + 0.10x6.9 + 0.15x5.4 + 0.10x7.2 + 0.15x5.8 = 6.54.

Three of REVIEW_5's top items are genuinely fixed (the waist band, the stair jam, the shared male face). They are offset by
(a) **the new hi-vis vest, which tears into flying orange shards whenever either member of staff walks or sits**, on both models, and staff ride the trains seated;
(b) **the duplicate-person fix covers only boarding**: the same person is still seen twice in one train, twice on one platform, and in a train and on the platform beside it at once;
(c) the stair fix lets stair walkers pass through people standing at the stair foot; and (d) the gait is unchanged (instrument 9.23, identical to review 5).

## What I could not observe

- **No motion watched.** Walking and transitions are judged from stride stills (frames 158/166/174/182), the instrument (`motion_all.txt`) and per-step traces.
- **Blink rate not measured** this round.
- **Game-camera close-ups failed.** My own close-up shooters (`gpair.mjs`, `gov.mjs`, `gfind.mjs`) could not reliably put the game camera next to a given person (the camera frame differs from the crowd's world frame in some views; shots in `v/ov*`, `v/fd*` mostly show walls or the wrong place). So in-game faults below are **measured** (positions, ids, clips), and their look is taken from the viewer (`tools/people_view.html`), which builds the same people. In particular I did not see the staff vest *in a game frame*; I saw it in the viewer on both models and measured staff seated in trains at 6-20 m in the game.
- **Viewer limits:** sit stills have no seat; `sitalt` clips spawn in stand mode; phone/pole clips in the viewer have no phone or pole, so I did not fault an empty phone hand there.
- The sims are not deterministic between runs, so a moment found in one run cannot be replayed in another.
- Game stepping: `sim.tick(0.1)+sim.sync(0.1)`, rendering every 10th step. My clip-change counter (`gp6.mjs`) keys by person object, fixing the id-collision in the earlier `g4.mjs` count (whose `cpm` 23-44 is inflated and not used).

## 1. What I sampled (60+ people)

| What | Who | Evidence |
|---|---|---|
| **All 99 at the waist**, full model, front + back | everyone | `waist0/s0.png`..`s6.png` |
| **All 99 faces** (head view) | everyone | `face0/r1.png`, `face0/r2.png` (+ the 42 below) |
| **Faces at 0.85 m, neutral and smile 0.8 with gaze**, the 39 newly faced people + 3 | man_commuter, man_hoodie, man_longcoat, man_elder, man_puffer, man_beard, staff_hivis, man_student, woman_coat, woman_puffer, woman_dress, woman_elder, woman_student, woman_scarf, woman_bob, teen_boy, teen_girl, boy, boy_small, girl, girl_small, man_highland, man_kilt_casual, man_trews, woman_sash, girl_school_kilt, boy_kilt, woman_mini, woman_midi, teen_skirt, ya_ginger_long, ya_ginger_braid, ya_ginger_lad, girl_ginger, ya_smile_dress, ya_smile_polo, ya_tattoo_tank, adult_smile_blouse, ya_smile_halter, adult_casual5, sum_denim_shorts_m, adult_cyclist | `f/n1.png`, `f/n2.png`, `f/sm1.png`, `f/sm2.png` |
| **22 people least used by earlier reviews**: stand + walk 158/166/174/182 (F/S/B) | adult_baggy_knit, adult_cap_shorts, teen_boy, adult_smile_blouse, adult_sport_cap, sum_crop_denim, ya_ginger_lad, teen_cutoffs, woman_bob, ya_smile_halter, ya_spiky, adult_fisherman_leggings, girl_leggings, sum_tee_leggings, ya_smile_polo, boy_shorts, sum_tube_denim, ya_shorts, ya_smile_dress, adult_harem, elder_man_suit, girl_ginger | `w/a0.png`..`w/a5.png` |
| **15 REVIEW_5 re-checks**, same states | man_commuter, man_trews, staff_hivis, staff_woman, woman_coat, adult_beret, elder_woman_coat, ya_winter, man_longcoat, sum_loose_shorts_w, adult_lusekofta, ya_bootcut, teen_tee, teen_skirt, woman_midi | `w/b0.png`..`w/b3.png`; vest zoom `w/vest_zoom.png` |
| **Every sit clip** (sit_idle, sit_phone, sit_look, sit_cross_legs) F/S/B, 14 people | woman_coat, adult_beret, woman_midi, teen_skirt, woman_mini, elder_woman_dress, man_trews, ya_smile_dress, adult_harem, girl_school_kilt, man_highland, staff_woman, man_commuter, adult_sport_cap | `b/s0.png`..`b/s6.png`; zoom `b/zs.png` |
| **Luggage**: 10 kinds x stand / walk / stair / sit on two bodies | elder_man_suit, sum_tube_denim | `l/l0.png`..`l/l3.png` |
| **Hands**: right hand at 0.9 m with handbag / holdall / case / shopper on 3 bodies; phone and pole clips (left hand) on 4 | man_longcoat, woman_dress, adult_suit_bun; woman_student, man_beard, teen_hood, ya_knit | `a/hr.png`, `a/h.png` |
| **Far model**: all 99 standing; 8 walking and seated | all; staff_hivis, staff_woman, elder_woman_coat, ya_winter, woman_coat, adult_lusekofta, sum_loose_shorts_w, man_commuter | `lod1/s1.png`, `lod1/s2.png`, `lod1/z.png`, `lod/w.png` |
| Walking instrument, whole roster | 99 | `motion_all.txt`, `motion_worst8.txt`, `motall/` |
| **Game**: Partick (inner) platform 120 s; ride from Cowcaddens (outer) 150 s (via Buchanan St, St Enoch); Ibrox platform 120 s and 150 s (true clip rate, overlaps); ride from Kelvinhall (inner) 150 s; stair traces Ibrox 120 s and Buchanan Street 120 s | | `g/pk*`, `g/ride*`, `g/gp_ibx.json`, `g/gp_ride.json`, `v/stair_ibx.*`, `v/stair_bch.out`, `v/ov.log`, `v/ov2.log` |

## 2. Per-category reasoning

### 2.1 Walking: 7.2 (typical 8.0, worst 6.0)
- Instrument, whole roster (`motion_all.txt`): **9.23, identical to reviews 4 and 5**. LEG 7.5 / p10 5.3, ARM p10 5.1, SMO p10 7.0, TRN p10 3.3. Gate not met. Worst recordings unchanged (`motion_worst8.txt`): teen_skirt@1.6 7.5, ya_ginger_braid@1.6 7.6, sum_crop_bike@1.2 7.7, adult_heel_boots@0.4 7.9, teen_crop_leggings, teen_girl, teen_tee, woman_scarf at 8.0-8.1. The gait was not touched in this commit.
- Stills of 37 people through four phases: heel strike, swing-knee flexion and toe-off read in every one (`w/a*.png`, `w/b*.png`). woman_coat and teen_skirt walk visibly knee-bent (`w/b1.png` row 1, `w/b3.png` row 2).
- Stair walkers now flow (2.4); a stand at the stair foot of 2-3.5 s on the `walk` clip remains (woman_sash t=70-76 s, `v/stair_ibx.json`).
- Walkers interpenetrate: two `go` walkers held 0.16-0.20 m apart (centre to centre) for 5-8.7 s at Ibrox (adult_cyclist/ya_smile_polo 8.7 s, girl_shorts/teen_girl 7.3 s, adult_smile_blouse/adult_suit_bun 5.2 s at 2.9 m from the player; `g/gp_ibx.json` `ov`). Scored under 4 and 8 as well.

### 2.2 Arms and hands: 6.9 (typical 7.5, worst 6.0)
- Arm swing reads in every walk still; ARM p10 5.1 (one arm swings about half the other on the worst recordings), unchanged.
- **Bag handles do not reach the hand on any of three bodies:** man_longcoat, woman_dress and adult_suit_bun all hold handbag, case and shopper with a loosely curled hand 3-5 cm above the handle (`a/hr.png`, every `_F` frame). REVIEW_5 saw this on man_longcoat only; it is general.
- Phone poses: man_elder and man_puffer stand with both hands interlaced in front of the mouth over the phone (`f/n1.png` row 1); with a holdall in hand, man_longcoat and adult_suit_bun hold the phone at chest height in a splayed two-hand claw (`a/hr.png`).

### 2.3 Faces: 6.4 (typical 7.0, worst 5.5)
- **Fixed:** the six-man shared face. man_commuter, staff_hivis, boy, adult_casual5, boy_kilt, man_student now differ, as do man_hoodie and sum_denim_shorts_m (`f/n1.png`, `f/n2.png`). Ages and sexes read correctly; children read as children; elders wrinkle.
- Still: faces are flat-shaded with painted-looking eyes; many men share a heavy, angled frowning brow (man_highland, boy_kilt, ya_ginger_lad, staff_hivis, man_kilt_casual; `f/n2.png`). adult_cyclist's irises are still near white (`f/n2.png` last). Smiles at 0.8 are closed-mouth and slight; ya_smile_polo's is a lopsided smirk (`f/sm2.png`). In the game, smile > 0.3 on 10.7% of platform and 11.8% of rider samples (`g/ride.log` final line).
- Hair: blocky cards (woman_puffer's strands, man_student, man_kilt_casual); scalp shows through on staff_woman and at teen_girl's parting; a hair card crosses girl_ginger's cheek when she smiles (`f/sm2.png`); long black hair is one flat slab from behind (teen_skirt, woman_mini, woman_coat; `waist0/s4.png`).

### 2.4 Standing, sitting, behaviour: 6.8 (typical 8.0, worst 5.0)
- **Stair jam fixed.** Ibrox 120 s (`v/stair_ibx.out`): 18 stair walkers, longest stall 3.5 s, 13 of 18 never stall. Buchanan Street 120 s (`v/stair_bch.out`): 12 walkers, longest 1.5 s. Review 5 saw 11-98 s.
- **But the fix lets stair walkers walk through people.** `_railStep` now ignores anyone not on the move (`js/sim/people.js:966`), so a stair walker passes straight through a waiter at the stair foot: 15 episodes in 120 s at Ibrox at centre spacing 0.22-0.29 m, each 0.3-0.9 s (`g/gp_ibx.json`: adult_piper/elder_man_suit, adult_heel_boots/teen_girl, adult_camo_cap/adult_smile_blouse ...); again at 93-97 s in a second run (woman_mini/man_elder, man_elder/ya_ginger_braid, `v/ov2.log`).
- **The same person twice is not fixed; only boarding was guarded** (`js/sim/index.js` new line):
  - in one train: adult_casual2 seated twice, 0.6 m apart, both on `sit_phone`, `sal_outer`, t = 150 s (`g/ride_c9.json`);
  - on one platform: adult_lusekofta walking at 3.6 m and standing on her phone at 9.3 m; sum_crop_denim walking at 3.0 m and standing at 10.3 m (`g/ride_c7.json`, alighting passengers duplicating waiters);
  - in a train and beside it: ya_ginger_braid seated in the car at 2.0 m and standing on the platform at 2.8 m (`g/ride_c7.json`); girl_leggings, sum_shorts_asian_m, sum_tee_leggings the same (`g/ride_c6`-`c8`); staff_hivis seated in the inner train at 6.1 m and standing on the platform at 7.6 m (`g/ride_c0.json`).
- Seated pencil skirts: cross-legs is now avoided (no pencil/midi wearer on `sit_cross_legs` in 30+ game samples), but in **sit_idle** woman_coat's skirt still splits into a flap with a spike under the seat and woman_midi's flares out like a shelf (`b/zs.png`); woman_coat and adult_beret sit on sit_idle in the game (12 samples).
- True clip-change rate is human: 2.3-2.4 per person-minute on Ibrox platform and the Kelvinhall ride (`g/gp_ibx.json`, `g/gp_ride.json`), minimum gap per person 4-9 s.
- Good: a full car reads well at eye height (`g/ride_eye.png`); riders on phones, looking about.

### 2.5 Range of people: 6.9 (typical 7.5, worst 6.0)
- Census of `people_meta.json` unchanged (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff; varied heights and skin tones). Crowds mix all kinds (`census4.py g/pk`).
- Staff now look different from the public (navy + orange vest) - but see 2.6.
- Repetition: teen_skirt and woman_mini wear the identical pink paisley vest and red tartan mini with the same long black hair (`waist0/s4.png` rows 2 and 4); teen_girl, teen_hippy and teen_hood wear the same navy padded jacket (`waist0/s4.png` row 1); ya_winter and elder_woman_coat share one coat (`w/b1.png`); the printed tee + painted shorts + white socks template is on most young people (`w/a0`, `w/a1`, `w/b2`, `w/b3`), seen as two red printed tees side by side in a car (`g/ride_eye.png`); duplicates (2.4).

### 2.6 Clothing: 5.4 (typical 7.0, worst 3.0)
**Fixed:** man_commuter's and man_trews' waist band (tucked shirt and belt, no skin; `waist0/s2.png` row 3, `waist0/s3.png` row 1, `w/b0.png`).

**New and broken - the staff hi-vis vest (`build_vest`).** On staff_hivis and staff_woman the vest's upper edge is ragged when standing; **walking, it throws orange and grey shards 10-20 cm out of the chest and back in every phase; seated, the shards are larger than the torso** (`w/b0.png` rows 3-4, `w/vest_zoom.png`, `b/s5.png` row 2). Same on the far model walking and seated (`lod/w.png` row 1). Standing far model is clean (`lod1/z.png`). In the game staff sit in trains on `sit_look` / `sit_cross_legs` / `sit_idle` at 6-20 m (`g/pk_c0.json`, `g/ride_c0.json`). 0-3 on the scale.

**Mix:** Partick platform **56% shorts** (10 of 18, `g/pk_c1.json`) and 46-50% at other moments; shorts are now the over-half garment where trousers were. Cars 33-45% trousers. Across all my game samples within 15 m: trousers 268, shorts 240, leggings 81, everything else 141.

**Not whole (unchanged):**
- elder_woman_coat and ya_winter walking: the coat front splits to show the jeans (`w/b1.png` rows 3-4; far `lod/w.png` row 2).
- woman_coat seated: skirt flap and spike; adult_beret: pale wedges at the boot tops (`b/zs.png`).
- adult_lusekofta: cropped trouser hems hang in long jagged shards, visible at 3 m and on the far model (`w/b2.png` row 3, `lod1/z.png`).
- Ragged tee hems with skin notches on ya_spiky (front and back), ya_shorts, teen_cutoffs, sum_tee_leggings, sum_loose_shorts_w, ya_bootcut, adult_cap_shorts, and woman_midi's jumper hem (`waist0/s3.png`-`s5.png`).
- Painted shorts: flat colour on the skin, skin-tight seat (`waist0/*`, `w/b2.png`).

### 2.7 Luggage: 7.2 (typical 8.0, worst 6.0)
- Ten kinds hang right from hand or back standing and walking; cabin and large cases are towed on their wheels and lifted clear in the viewer's stair state (`l/l1.png` rows 4-5). In the game bags sit on laps, the floor, hands and backs (`census4.py g/pk`: lap 23-29, floor 6-7, hand 1-9, back 3-5).
- Day and hiking rucksacks still stand upright on the lap with the hands on the thighs, not on the bag (`l/l0.png` rows 1-2).
- Hand gap of 3-5 cm above every handle (2.2).
- Cases now go down real stairs in motion (adult_camo_cap and sum_loose_shorts_w with trolleys, adult_cap_baggy with a case, Ibrox, `v/stair_ibx.out`); I did not see how the case is held on a real stair in the game.

### 2.8 Whole bodies: 5.8 (typical 7.0, worst 4.0)
**Far model near the player (still fixed):**

| Where | Far-model person-frames within 6 m |
|---|---|
| Partick platform 120 s | 3 frames of 1200, max 2 at once (`g/pk.log`) |
| Cowcaddens ride 150 s | 1 frame of 1500 (`g/ride.log`) |
| Ibrox platform 120 s | 3 person-steps (`g/gp_ibx.json` `lod6`) |
| Kelvinhall ride 150 s | 3 person-steps (`g/gp_ride.json`) |

- Far models standing are clean for all 99 (`lod1/s1.png`, `lod1/s2.png`).
- Broken: the staff vest on both models walking and seated (2.6); the long-coat split on both models; lusekofta hems; woman_coat's seated skirt on both models (`lod/w.png` row 3).
- Hair cards, scalp patches and the flat faces (2.3) keep the typical case at 7.

## 3. REVIEW_5 top ten: verification

| # | REVIEW_5 item | Verdict | Evidence |
|---|---|---|---|
| 1 | man_commuter / man_trews bare waist band | **Fixed.** Tucked shirt and belt, front and back, standing, walking, seated, both models. | `waist0/s2.png`, `waist0/s3.png`, `w/b0.png`, `lod/w.png` row 4 |
| 2 | Stair walkers freeze in a column | **Fixed** (longest stall 3.5 s Ibrox, 1.5 s Buchanan St; 30 walkers). **New side effect:** walkers pass through people standing at the stair foot (15 episodes / 120 s at 0.22-0.29 m). | `v/stair_ibx.out`, `v/stair_bch.out`, `g/gp_ibx.json`, `v/ov2.log` |
| 3 | Gait: crouch, one-sided arm swing | **Not fixed** (not attempted): 9.23, same worst recordings. | `motion_all.txt`, `motion_worst8.txt` |
| 4 | Seated pencil skirts split; adult_beret boot tops | **Partly.** Cross-legs avoided for pencil/midi in the game; sit_idle still splits (woman_coat flap + spike, woman_midi shelf); adult_beret wedges remain. | `b/zs.png`, game census |
| 5 | Long coat splits walking | **Not fixed.** | `w/b1.png` rows 3-4, `lod/w.png` row 2 |
| 6 | The same person twice in one train | **Partly.** No duplicate boarding seen, but adult_casual2 seated twice in one car; duplicates on one platform and in-car + on-platform at once. | `g/ride_c9.json`, `g/ride_c7.json`, `g/ride_c0.json` |
| 7 | One face for many men; adult_cyclist irises | **Mostly fixed.** 39 people have their own faces; adult_cyclist's irises still near white; a shared frowning brow style remains. | `f/n1.png`, `f/n2.png` |
| 8 | Garment repetition; staff without hi-vis | **Partly / regressed.** Staff now in navy + orange vest, but the vest shatters when they move or sit. teen_skirt = woman_mini outfit, three teens in one jacket, one coat on two women. | `w/vest_zoom.png`, `b/s5.png`, `waist0/s4.png` |
| 9 | Rucksacks upright on lap; hands not gripping | **Not fixed.** Lap rucksacks unchanged; hand gap now seen on all three bodies tried. | `l/l0.png`, `a/hr.png` |
| 10 | Ragged edges, flat painted shorts, 52-60% trousers on passed platforms | **Not fixed / shifted.** Ragged hems on ~8 people; painted shorts unchanged; trousers now 33-45% but shorts reach 56% on a platform. | `waist0/s3-s5.png`, `g/pk_c1.json` |

## 4. Top ten defects, in priority order

1. **Staff hi-vis vest tears into flying shards (staff_hivis, staff_woman).**
   - What: walking (every phase) and seated (every sit clip), orange/grey shards 10-20 cm out of the chest and back; seated they exceed the torso; ragged upper edge standing. Full and far model. Staff ride trains seated (6-20 m from the player).
   - Reproduce: `node shoot.mjs 0 staff_hivis,staff_woman none walk@158,walk@166,clip-sit-0-30,clip-sitalt-1-30 X body`; far: `node shoot.mjs 1 staff_hivis none walk@166,clip-sit-0-30 X body`.
   - Evidence: `w/vest_zoom.png`, `w/b0.png` rows 3-4, `b/s5.png` row 2, `lod/w.png` row 1, `g/pk_c0.json`.
2. **The same person twice, in a train and on a platform.**
   - What: adult_casual2 seated twice side by side in one car (0.6 m apart, both sit_phone); adult_lusekofta and sum_crop_denim each twice on one platform (an alighting copy plus a waiting copy); ya_ginger_braid in the car at 2 m and on the platform at 2.8 m; staff_hivis in a train and on the platform.
   - Reproduce: `node g4.mjs "mode=ride&q=high&line=outer&station=cowcaddens" g/ride 150 0.1 15`, then group each `g/ride_c*.json` by id (any crowd, vis, d < 40).
   - Evidence: `g/ride_c9.json`, `g/ride_c7.json`, `g/ride_c0.json`.
3. **People pass through one another.**
   - What: stair walkers walk through waiters at the stair foot (0.22-0.29 m, 15 episodes / 120 s at Ibrox) because `_railStep` now ignores standing people; two walkers held 0.16-0.20 m apart for up to 8.7 s on the platform (one pair at 2.9 m from the player).
   - Reproduce: `node gp6.mjs "mode=explore&q=high&line=outer&station=ibrox" g/gp_ibx 120` (see `ov`); `node gov.mjs ... v/ov2 150 8`.
   - Evidence: `g/gp_ibx.json`, `v/ov.log`, `v/ov2.log`.
4. **Gait unchanged: crouch and one-sided arm swing** (9.23; LEG p10 5.3, ARM p10 5.1, TRN p10 3.3; teen_skirt@1.6 7.5, ya_ginger_braid, sum_crop_bike, adult_heel_boots).
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 8`.
   - Evidence: `motion_all.txt`, `motion_worst8.txt`.
5. **Long coat splits when walking (elder_woman_coat, ya_winter)** - jeans show through the front of the coat, both models.
   - Reproduce: `node shoot.mjs 0 elder_woman_coat,ya_winter none walk@158,walk@166 X body`.
   - Evidence: `w/b1.png` rows 3-4, `lod/w.png` row 2.
6. **Seated pencil/midi skirts in sit_idle (woman_coat, woman_midi); adult_beret boot tops.**
   - What: woman_coat's skirt splits into a flap with a spike under the seat; woman_midi's flares out flat; pale wedges at adult_beret's knees. sit_idle is what they use in the game.
   - Reproduce: `node shoot.mjs 0 woman_coat,woman_midi,adult_beret none clip-sit-0-30 X body`.
   - Evidence: `b/zs.png`, `b/s0.png`, `b/s1.png`.
7. **Bags hang below the hand; phone hands.**
   - What: on man_longcoat, woman_dress and adult_suit_bun the curled fingers sit 3-5 cm above handbag, case and shopper handles; man_elder and man_puffer hold the phone with both hands interlaced across the mouth; rucksacks upright on the lap, hands on the thighs.
   - Reproduce: `node shootl.mjs 0 man_longcoat,woman_dress,adult_suit_bun handbag,case,shopper stand a/HR handr`; `node face.mjs man_elder,man_puffer f/N`; `node shoot.mjs 0 elder_man_suit ruck:day,ruck:hike clip-sit-0-30 l/L`.
   - Evidence: `a/hr.png`, `f/n1.png`, `l/l0.png`.
8. **Ragged cloth edges** - adult_lusekofta's trouser hems in long shards (3 m, both models); ragged tee hems with skin notches on ya_spiky, ya_shorts, teen_cutoffs, sum_tee_leggings, sum_loose_shorts_w, ya_bootcut, adult_cap_shorts; woman_midi's jumper hem.
   - Reproduce: `node all.mjs 0 waist0 waist stand 3.7,0.6`.
   - Evidence: `w/b2.png` row 3, `lod1/z.png`, `waist0/s0.png`, `s3.png`-`s5.png`.
9. **Garment and outfit repetition; shorts over half a crowd.**
   - What: teen_skirt and woman_mini identical outfits and hair; teen_girl / teen_hippy / teen_hood one jacket; one coat on two women; printed-tee template; Partick platform 56% shorts.
   - Evidence: `waist0/s4.png`, `w/b1.png`, `g/ride_eye.png`, `g/pk_c1.json` (`census4.py g/pk`).
10. **Faces and hair up close** - adult_cyclist's near-white irises; shared frowning brow on many men; scalp through staff_woman's hair and at teen_girl's parting; a hair card through girl_ginger's cheek when smiling; long black hair as one slab from behind; closed-mouth, lopsided smiles.
    - Reproduce: `node face.mjs adult_cyclist,staff_hivis,man_highland,teen_girl,girl_ginger f/N "0.3:-0.05" 0.8`; `node all.mjs 0 face0 face stand 3.5`.
    - Evidence: `f/n2.png`, `f/sm2.png`, `face0/r2.png`, `waist0/s4.png`.

## 5. For the next round

- Look at any new garment walking and seated before trusting it standing (the vest is clean standing).
- Dedupe by person across all crowds at every spawn, alight and board, then re-run the duplicate check over every crowd (not just boarding).
- Give stair walkers a way round (or a wait) for standing people instead of a pass-through; measure overlaps with `gp6.mjs`.
- Build a game-camera shooter that works in the crowd's frame, so in-game close-ups replace viewer stand-ins.
- Faces not yet shot smiling: woman_student, adult_piper, adult_heel_boots, teen_hood.

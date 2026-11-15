# Under Glasgow: independent review of the people (review 3)

Reviewed: the 99 people at HEAD `d0a3d93c` ("act on adversarial review 2"), plus the working-tree change that landed
during this review (`trimUnderTop` for the far model: `js/sim/bodyfit.js`, `people.js`, `tools/assets_people_mpfb.py`).
Served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611. Scored against `research/people-rubric.md`
(category = 0.6 x typical + 0.4 x worst tenth). I re-judged from scratch and did not start from REVIEW_2's numbers.

**Result: weighted mean 6.5. Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

All evidence paths are under `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review3/`.
In stills, `_F` is the front quarter, `_S` the side, `_B` the back quarter.

## What I could not do, and caveats

- **I watched no motion.** Walking is judged from 8-phase stills, the rubric's instrument, and per-frame bone traces.
- **The far-model fix landed mid-review.** The full-model stills (`a/`, `w/`, `c/`, `f/`, `l/`) were shot before it. That
  fix only touches the far model, so they are unaffected. All far-model stills (`lod/`, `ls/`) and all game runs come after it.
- **`test_sim` tick vs render.** In `tools/test_sim.html`, the crowd (LOD swaps, attention, smiles) advances only when
  `__sim.render()` is called, not on `__sim.tick()` alone. Counts taken right after a fast-forward (`game2.mjs` census
  rounds) overstate far-model use and understate smiles. I re-measured both with a render every frame (`lodcount.mjs`, `gatt3.mjs`, `gatt4.mjs`).
- **Seated far model in the viewer.** `people_view.html?forcelod=1` showed `sit_idle` with both forearms raised
  (`ls/lod_vs_full_sit.png`). In the game, a far-model `sit_idle` rider had hands on the thighs (`g/ridelod_sheet.png`, top-left),
  so I treat the viewer result as a viewer artefact and do not score it.
- **Stairs with cases: not seen in the game.** Every `q.stair` walker I sampled was parked at one hidden point inside the station walls (see 2.4).

## 1. What I sampled (43 people, chosen to differ from REVIEW_1 and REVIEW_2)

| What | Who | Evidence |
|---|---|---|
| Stand, every sit clip (`sit_idle`, `sit_phone`, `sit_look`, `sit_cross_legs`), walk; full model | The 20 people that neither earlier review named: woman_puffer, woman_student, woman_scarf, teen_boy, teen_girl, teen_runner, teen_tee, teen_hippy, ya_tee_jeans, ya_spiky, ya_winter, adult_baggy_knit, adult_cap_shorts, adult_casual5, adult_sport_cap, ya_ginger_long, ya_ginger_lad, teen_ginger, ya_smile_polo, adult_smile_blouse | `a/sA1a.png`, `sA1b.png`, `sA2a.png`, `sA2b.png`; cross-legs zoom `a/z_cross.png` |
| Same, re-checking REVIEW_2 | adult_piper, woman_midi, adult_beret, woman_coat, man_beard, adult_camisole, adult_vneck, adult_leggings_knit, girl, man_puffer, elder_man_suit, elder_woman_dress, staff_woman, girl_school_kilt, man_elder, woman_elder | `c/sC1a.png`, `sC1b.png`, `sC2a.png`, `sC2b.png`; seated cloth zoom `c/z_sitcloth.png` |
| 8 phases of one stride, side and front | woman_coat, man_highland, elder_woman_coat, adult_heel_boots, woman_midi, adult_piper, elder_man_cap, man_longcoat, girl_small, ya_winter, woman_sash, teen_skirt | `w/sW1F.png`, `sW1S.png`, `sW2S.png`; zoom `w/z_cloth.png` |
| Faces at 0.85 m, neutral and smiling (0.7) | 36: all 20 above, plus teen_crop_leggings, ya_ginger_braid, sum_crop_bike, man_beard, sum_shorts_asian_m, adult_camisole, adult_vneck, adult_leggings_knit, girl, man_elder, elder_man_cap, woman_elder, elder_woman_dress, man_longcoat, adult_tophat, adult_lusekofta | `f/faces1.png`, `faces2.png`, `faces3.png` |
| Face layers over 120 s at 4 m | teen_hippy, ya_smile_polo, man_elder; standing and sitting | `f/probe.txt` |
| All 10 luggage kinds x stand / sit / walk / stair | teen_runner, elder_man_suit, ya_smile_halter, adult_casual5 | `l/bags_<id>.png` |
| Far model: stand, sit, walk | woman_midi, woman_elder, adult_tie_suit, ya_tattoo_tank, adult_beret, sum_crop_denim, ya_winter, teen_hippy, woman_student, adult_casual5, man_highland, elder_woman_coat | `lod/sL1.png`, `sL2.png` |
| Clip changes, per-frame bone jump | adult_tie_suit, woman_midi, teen_runner (90 s each, standing and seated) | `pop_hand.txt`, `pop_foot.txt` |
| Walking instrument | default 6 people; then all 99 | `motion.txt`, `motion_items.txt`, `motion_all.txt`, `motion_all_worst40.txt` |
| **Real game**: platforms, 3 rounds over ~90 s each | Ibrox, St Enoch, Kelvinbridge (explore) | `g/<st>_r*_census.json`, `g/census_summary.txt`, `g/ibrox_r0_eyes.png`, `g/stenoch_r1_eyes.png`, `g/ibrox_r1_close.png` |
| **Real game**: ride, Ibrox to Govan | 3 rounds; far-model count re-measured with rendering | `g/ride_r*_eyes.png`, `g/z_ride_r1_tank.png`, `g/z_ride_r1_faces.png`, `g/lodcount_ride2.txt`, `g/lodcount_stenoch2.txt` |
| Real-game smiles, attention, statics | Ibrox platform 30 s; ride 14 s; every frame rendered | `g/gatt3_ibrox.txt`, `g/gatt4_ride.txt`, `g/gstatic_ride.txt` |
| Stair walkers over 13.5 s | Ibrox | `g/probe_ibrox.txt`, `g/stairv.png` |

## 2. Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 8.0 | 6.0 | **7.2** |
| 3 | Faces | 10 | 6.5 | 4.5 | **5.7** |
| 4 | Standing, sitting, behaviour | 10 | 7.5 | 5.0 | **6.5** |
| 5 | Range of people | 10 | 7.5 | 6.0 | **6.9** |
| 6 | Clothing | 15 | 7.0 | 4.5 | **6.0** |
| 7 | Luggage | 10 | 8.0 | 6.0 | **7.2** |
| 8 | Whole bodies | 15 | 6.5 | 4.0 | **5.5** |
| | **Weighted mean** | 100 | | | **6.5** |

0.20x7.2 + 0.10x7.2 + 0.10x5.7 + 0.10x6.5 + 0.10x6.9 + 0.15x6.0 + 0.10x7.2 + 0.15x5.5 = 6.52.

### 2.1 Walking: 7.2

What works:
- The instrument runs again. Default 6 people: 9.28 (`motion.txt`). Whole roster: **9.22** (`motion_all.txt`).
- Stills show a clear heel strike, swing-knee flexion and toe-off on all 12 stride subjects (`w/sW1S.png`, `sW2S.png`).
- Elders now walk differently: man_longcoat and elder_man_cap stoop and take shorter steps (`w/sW2S.png` rows 1-2).

Faults:
- **The whole-roster instrument fails its own gate.** LEG 7.5 (p10 5.2), ARM p10 5.1, SMO p10 6.9, **TRN p10 3.3**. Worst recording: teen_skirt @1.6 m/s, 7.5.
- **A crouched gait in a group of mostly female and teen bodies:**
  - Knee at mid-stance 25-31 deg (scored 0-3); the norm is about 5-10 deg.
  - Knee at loading 37-48 deg.
  - Seen on teen_skirt, ya_ginger_braid, sum_crop_bike, teen_crop_leggings, teen_tee, ya_winter (`motion_all_worst40.txt`).
- **One arm swings about half as much as the other** (ARM.sym 50-54%): teen_skirt, ya_ginger_braid, sum_crop_bike, teen_crop_leggings.
- Not watched in motion. Starts and stops are covered only by the instrument's TRN.

### 2.2 Arms and hands: 7.2

What works:
- **Bags are no longer raised by phone or gesture clips.** None of the game censuses had a standing person with a bag in hand on a phone or gesture clip.
- adult_piper's drones lean out over the shoulder, standing, walking and sitting (`c/sC1a.png` row 1, `w/sW1F.png` row 6).
- Seated hands rest on the thighs, and the cross-legs forearm no longer hovers (`a/z_cross.png`).

Faults:
- **No cross-fade between clips: every clip change snaps in one frame.**
  - Cause: `people.js:168` puts `this.crossfade = 0.3; this.maxHi = ...` after a `//`, so both are undefined (confirmed at runtime: `__crowd.crossfade` is undefined).
  - Measured hand or head jump in a single 1/60 s frame (`pop_hand.txt`):
    - 8.1 cm: adult_tie_suit, sit_idle to sit_cross_legs.
    - 7.8 cm: woman_midi, phone_stand to phone_call.
    - 9.1 cm: woman_midi, sit_phone to sit_cross_legs.
  - The frames after the change move 0-0.1 cm (`pop2.mjs` trace), so the whole change happens in one frame.
  - Over the next minute that is several pops per person, in every seated rider and standing waiter.
- ARM.sym asymmetry (2.1).
- In the viewer, a bag set after spawn can co-exist with a phone (`l/bags_elder_man_suit.png`, tote and handbag stand_S). That is a harness order effect, not seen in the game.

### 2.3 Faces: 5.7

What works:
- man_beard now has a full beard (`f/faces2.png`).
- REVIEW_2's slabs over the eye are gone on teen_crop_leggings and ya_ginger_braid.
- The true elders read old: man_elder, elder_man_cap, man_longcoat, adult_tophat, adult_lusekofta (`f/faces3.png`).
- In the viewer over 120 s: 13-23 blinks (6.5-11.5 a minute), 43-60 distinct gaze positions, smiles above 0.3 for 11-19 s (`f/probe.txt`).
- On a real platform, rendered every frame, 61 of 785 attentive samples were smiling above 0.3 (`g/gatt3_ibrox.txt`).

Faults:
- **Seated riders never smile, and never look at anything.**
  - Every rider is `static` (`g/gstatic_ride.txt`), and `_attend` (attention and smiles) runs only for non-static people (`people.js:792`).
  - Measured: 1512 rider samples over 14 s of rendered ride, none smiling (`g/gatt4_ride.txt`).
  - In a car, the people nearest the player are all riders.
- **Hairlines:**
  - Blocky, stepped hairline: woman_student and teen_girl (`f/faces1.png`).
  - Notched fringe: teen_tee.
  - Flat card strands with gaps: teen_hippy.
  - Scalp through the parting: ya_ginger_long.
  - Notched temples, still: sum_shorts_asian_m (`f/faces3.png`).
  - In the game at about 2 m: girl_school_kilt has a band of scalp under a ragged hair edge, and adult_tattoo_muscle has speckled holes in the hair (`g/z_ride_r1_tank.png`).
- **Sex reads wrong from the front:** woman_puffer, woman_scarf and girl read as boys; teen_crop_leggings is ambiguous (`f/faces1.png`, `f/faces3.png`).
- woman_elder (kind elder) still has a young face and brown hair (`f/faces3.png`).
- **Smiles are faint and lopsided.** At 0.7 the smile reads as a smirk (ya_tee_jeans, ya_smile_polo). Eyebrows are thin painted dashes on most young men.

### 2.4 Standing, sitting, behaviour: 6.5

What works:
- **`sit_cross_legs` is rebuilt:** one knee over the other, the shin hanging, hands resting. Checked on 20+ bodies (`a/z_cross.png`, `c/sC1*.png`, `c/sC2*.png`).
- About 40% of seated riders are on phones, which is plausible for the Subway.
- Platform waiters stand still and attend to the player.

Faults:
- **Clip pops** (2.2).
- **Riders are static** (2.3): no attention, no head turns, no smiles.
- **Stair walkers parked out of sight.** Six `go`/`stair` walkers sat at exactly one point (-2176.2, 4.6, 592.1), 3.3 m above the platform, unmoving for 13.5 s (`g/probe_ibrox.txt`). Cameras there land inside the walls (`g/stairv.png`), so it is hidden, but it means I never saw anyone, or any case, on the stairs.
- Seated pencil skirts tent (2.6).

### 2.5 Range of people: 6.9

What works:
- A good spread on platforms: elders 1-5 of about 20-28, children present, skin tones varied.
- Young "elders" fixed: adult_camisole, adult_vneck and adult_leggings_knit are now women. `girl`'s meta is now shorts (`people_meta.json`).

Faults:
- **Clones by outfit:**
  - One blue logo tee with orange shoulder stripes is worn by woman_puffer, woman_scarf, girl, man_puffer and adult_sport_cap (crop), and by ya_ginger_lad (long sleeve) (`a/sA1a.png`, `sA2a.png`, `sA2b.png`, `c/sC2a.png`).
  - The same black hoodie and jeans are worn by woman_student, teen_girl and teen_hippy (`a/sA1a.png`, `sA1b.png`).
  - The same dark-red bob is on ya_winter and woman_sash.
- **Names do not match bodies:** man_puffer and woman_puffer wear no puffer; teen_ginger has black hair; woman_scarf has no scarf; staff_woman wears green dungarees.
- Still no mobility aids or buggies. Children are scaled adults.
- Across three fresh page loads, boy_small and sum_chino_shorts_m were on all three platforms (`g/census_summary.txt`). The game is seeded, so this is a fresh-load effect; repetition within one session was not tested.

### 2.6 Clothing: 6.0

What works:
- A real mix of shorts, leggings, skirts, kilts, dresses, hoodies, coats and suits.
- On platforms "trousers" is down to 26-62% of the crowd.

Faults:
- **Over half the car riders wear trousers in every census:** 53-58% (St Enoch 56% and 55%, Kelvinbridge 58% and 57%, Ibrox ride 53%) (`g/census_summary.txt`). One platform round was 62% (St Enoch r1). This is the rubric's line.
- **Cloth not whole, full model:**
  - woman_coat: skirt holes with skin showing at the front thigh, walking, on most phases (`w/z_cloth.png`; `w/sW1F.png` row 1).
  - woman_midi: skirt tear walking front, and red sweater-hem shards over the skirt in `sit_cross_legs` (`w/z_cloth.png`, `c/z_sitcloth.png`).
  - elder_woman_coat: a gash in the coat showing the jeans, with a ragged hem, walking (`w/z_cloth.png`).
  - Seated pencil skirts (woman_coat, adult_beret) still tent between the thighs with a band across the thigh. adult_beret's boot tops are ragged (`c/z_sitcloth.png`).
  - ya_winter: seated coat hem ragged, with torn triangles (`a/z_cross.png`).
  - **In the game at about 2 m**, adult_tattoo_muscle's grey tee has jagged holes at both shoulders (`g/z_ride_r1_tank.png`).
- adult_heel_boots is fixed: no jeans through the boot (`w/z_cloth.png`, last).

### 2.7 Luggage: 7.2

What works:
- 10 distinct kinds. All four bodies carry each one correctly standing and walking (`l/bags_*.png`).
- Cases tow on their wheels. Totes, shoppers, handbags and holdalls lie on the lap seated.
- About half the people carry something (12-16 of 23-28 on platforms, 30-50 of 57-86 riders).

Faults:
- **Rucksacks hugged upright on the lap**, both day and hiking, on all four bodies (`l/bags_ya_smile_halter.png`, `l/bags_elder_man_suit.png`, rows 1-2, sit).
- Stair carrying: not observed in the game (2.4), so not credited.
- A parked trolley stands with no hand on it. That is plausible.

### 2.8 Whole bodies: 5.5

**Far model close to the player** (rendered every frame):
- Platform beside a train (St Enoch), steady state: 24 people within 6 m, **4 on the far model**; right after the train arrived, 22 (`g/lodcount_stenoch2.txt`). The train's riders are capped at `maxHi` 16 when exploring.
- Ride, steady state: 0-3 within 6 m on the far model.
- Right after boarding or a fast-forward: 21-27 within 6 m, clearing within 30 rendered frames (`g/lodcount_ride2.txt`).
- So it is much better than REVIEW_2's 8 of 17, but not gone beside a train.

**Far-model faults** (`lod/sL1.png`, `sL2.png`):
- woman_elder: black wedge shoes.
- adult_tie_suit and adult_casual5: orange or red specks at the shoes.
- ya_winter and elder_woman_coat: dark holes in the coat seated and walking, and crumpled white triangles at the seated back.
- woman_midi's red shards over the skirt are gone.

**Full-model faults:** the cloth holes in 2.6, the kilt slit to skin on man_highland at walk190 front (`w/z_cloth.png`), and the scalp bands and hair holes in 2.3.

## 3. REVIEW_2 top ten: verification

| # | REVIEW_2 item | Verdict | Evidence |
|---|---|---|---|
| 1 | LOD within 6 m (8 of 17 on a platform, 5-7 in a car) | **Partly fixed.** Car steady 0-3. Platform beside a train: 4 of 24 stay on the far model. All near people are on it for ~0.5 s after boarding or a fast-forward. Budget raised to 16/24/12, but the platform crowd's own `maxHi` is undefined (comment bug). | `g/lodcount_stenoch2.txt`, `g/lodcount_ride2.txt` |
| 2 | woman_coat skirt torn walking | **Not fixed.** Holes at the front thigh on most phases. | `w/z_cloth.png`, `w/sW1F.png` row 1 |
| 3 | `sit_cross_legs` broken | **Fixed.** | `a/z_cross.png`, `c/sC*.png` |
| 4 | LOD cloth shards | **Partly fixed.** woman_midi clean. woman_elder wedge shoes and adult_tie_suit shoe specks remain. New coat holes on ya_winter and elder_woman_coat. | `lod/sL1.png`, `lod/sL2.png` |
| 5 | Piper drone through face; phone over pipes | **Fixed.** | `c/sC1a.png` row 1, `w/sW1F.png` row 6 |
| 6 | Bags raised by phone and gesture clips | **Fixed in the game.** No case found in any census. The viewer can still show it, because the viewer sets the bag after spawn. | `g/census_summary.txt`; `l/bags_elder_man_suit.png` (viewer only) |
| 7 | Hair slabs, notched hairlines, man_beard | **Partly fixed.** Beard added; two slabs gone. sum_shorts_asian_m still notched. New: woman_student, teen_girl, teen_tee, teen_hippy, ya_ginger_long; in the game, girl_school_kilt and adult_tattoo_muscle. | `f/faces1-3.png`, `g/z_ride_r1_tank.png` |
| 8 | Cloth not whole (heel boots, woman_midi, elder_woman_coat, pencil skirts) | **Partly fixed.** adult_heel_boots fixed. woman_midi, elder_woman_coat and the pencil-skirt tents remain. | `w/z_cloth.png`, `c/z_sitcloth.png` |
| 9 | Young elders; no elder gait; man_puffer; girl meta | **Mostly fixed.** Elders reverted or made; stooped, shorter gait; girl meta fixed. woman_elder still young; man_puffer still no puffer. | `c/sC1b.png`, `w/sW2S.png`, `f/faces3.png` |
| 10 | Crowd mix, repetition, stuck stair walker, instrument crash | **Partly fixed.** Instrument runs. Platforms 26-62% trousers, cars 53-58%. Stair walkers are now parked out of sight rather than visibly stuck. | `motion_all.txt`, `g/census_summary.txt`, `g/probe_ibrox.txt` |

## 4. Top ten defects, in priority order

1. **No cross-fade: every clip change snaps in one frame.**
   - What: `people.js:168` has `this.crossfade = 0.3; this.maxHi = quality === 'low' ? 3 : 8;` inside a `//` comment, so both are undefined.
   - Effect: idle to phone, sit to sit, and stand to walk all pop. Hand or head jumps 7-9 cm in one 1/60 s frame.
   - Also: the platform crowd has no `maxHi` budget at all.
   - Reproduce: `node pop.mjs adult_tie_suit,woman_midi`.
   - Evidence: `pop_hand.txt`, `pop_foot.txt`.
2. **woman_coat skirt has holes with skin showing while walking** (full model, front, most stride phases). REVIEW_2 #2 is not fixed.
   - Reproduce: `shoot.mjs 0 woman_coat none walk@150,walk@174`.
   - Evidence: `w/z_cloth.png`.
3. **Riders never smile, attend or look at the player.**
   - What: they are `static`, and `_attend` skips static people.
   - Measured: 0 smiles in 1512 rider samples (`g/gatt4_ride.txt`), against 7.8% on the platform (`g/gatt3_ibrox.txt`).
   - Reproduce: `gatt4.mjs "mode=ride&...station=ibrox"`.
4. **Holes in cloth seen in the running game at about 2 m.**
   - adult_tattoo_muscle's tee is jagged at both shoulders (seated, `sit_phone`, full model).
   - girl_school_kilt shows a band of scalp under a ragged hairline.
   - Reproduce: `game2.mjs "mode=ride&q=high&line=outer&station=ibrox"`, round r1, look yaw 1.57.
   - Evidence: `g/z_ride_r1_tank.png`.
5. **Crouched gait and one-sided arm swing in part of the roster.**
   - What: knee 25-31 deg at mid-stance, 37-48 deg at loading; ARM.sym 50-54%.
   - Who: teen_skirt, ya_ginger_braid, sum_crop_bike, teen_crop_leggings, teen_tee, ya_winter.
   - Instrument on the whole roster: LEG p10 5.2, ARM p10 5.1, TRN p10 3.3.
   - Reproduce: `people_motion.mjs --people all`, then `--from ... --items --worst 40`.
   - Evidence: `motion_all.txt`, `motion_all_worst40.txt`.
6. **Cloth not whole on the full model:**
   - woman_midi: skirt tear walking, and sweater-hem shards in `sit_cross_legs`.
   - elder_woman_coat: coat gash showing the jeans, walking.
   - man_highland: kilt slit to the thigh (walk190, front).
   - ya_winter: seated coat hem torn.
   - Evidence: `w/z_cloth.png`, `c/z_sitcloth.png`, `a/z_cross.png`.
7. **Seated pencil skirts tent between the thighs, with a band across the thigh.**
   - Who: woman_coat, adult_beret (`clip-sit-0`); adult_beret's boot tops are also ragged.
   - Evidence: `c/z_sitcloth.png`.
8. **Hairlines and hair:**
   - Stepped hairline: woman_student, teen_girl.
   - Notched fringe: teen_tee.
   - Card strands with gaps: teen_hippy.
   - Scalp at the parting: ya_ginger_long.
   - Notched temples: sum_shorts_asian_m.
   - Read as boys from the front: woman_puffer, woman_scarf, girl.
   - Evidence: `f/faces1.png`, `f/faces2.png`, `f/faces3.png`.
9. **Far model still within 6 m beside a train.**
   - What: 4 of 24 at St Enoch in steady state, with a render every frame; all near people for ~0.5 s after arrival or boarding.
   - Also on the far model: coat holes (ya_winter, elder_woman_coat), black wedge shoes (woman_elder), shoe specks (adult_tie_suit, adult_casual5).
   - Evidence: `g/lodcount_stenoch2.txt`, `lod/sL1.png`, `lod/sL2.png`.
10. **Garment and identity repetition, and car crowds over half trousers:**
    - One blue logo tee on 6 characters; one black hoodie-and-jeans outfit on 3.
    - Riders are 53-58% trousers in every census.
    - Names do not match (puffer, scarf, ginger).
    - Rucksacks are hugged upright on the lap when seated.
    - Evidence: `a/sA1a.png`, `c/sC2a.png`, `g/census_summary.txt`, `l/bags_ya_smile_halter.png`.

## 5. Where the next round should look

- Watching motion in real time: a GPU browser recording, now that pops are a known issue.
- Boarding and alighting through the doors, close up.
- Someone with a case actually on the stairs (I found the stair walkers parked out of sight).
- The roughly 30 faces not yet shot in any round.
- Repetition within one long session.
- The viewer's seated far-model forearms (`ls/lod_vs_full_sit.png`): confirm it is only a viewer artefact.

# Under Glasgow: independent review of the people (review 12)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611. File dates: people.js 21:40, armfit.js 21:58, legradii.js 21:56, people.glb / people_lod.glb / people_meta.json 21:54-21:56 (rebuilt since review 11), gait.js 18:23 and bags.js 18:07 (unchanged). Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.23 (7.226). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review12/`. In viewer stills `_F` = front quarter, `_S` = side, `_B` = back quarter. In-game close shots `gx/hh_*`, `gx/ib_*` hide nobody standing in front; `_e` = standing eye height (1.5 m, 1.25 m away), `_l` = low (0.9 m, 1.0 m away).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 5.5 | **7.0** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.7 | 6.0 | **7.02** |
| 4 | Standing, sitting, behaviour | 10 | 8.5 | 6.5 | **7.7** |
| 5 | Range of people | 10 | 8.0 | 6.5 | **7.4** |
| 6 | Clothing | 15 | 7.9 | 6.0 | **7.14** |
| 7 | Luggage | 10 | 8.5 | 6.0 | **7.5** |
| 8 | Whole bodies | 15 | 7.7 | 6.0 | **7.02** |
| | **Weighted mean** | 100 | | | **7.23** (7.226) |

0.20x7.0 + 0.10x7.4 + 0.10x7.02 + 0.10x7.7 + 0.10x7.4 + 0.15x7.14 + 0.10x7.5 + 0.15x7.02 = 1.400 + 0.740 + 0.702 + 0.770 + 0.740 + 1.071 + 0.750 + 1.053 = 7.226.

In one line: up from 7.18. The short minis no longer sit, so the worst seated-skirt sight of review 11 is gone from the game. The far-model staff vest now shows continuous bands. Men's brows are natural. Two jumpers and one pair of trainers are no longer shared. Holding the score down: the gait (re-measured, identical to review 11 line for line); elder_woman_dress seated in a car with bare thighs up to the hip; adult_beret's torn boot tops; and a luggage fault this review found that review 11 did not. Standing riders' shins stand inside seated riders' floor bags, in one ride for 30-120 s, and two neighbours' floor bags sit inside each other in every ride.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | woman_mini and teen_skirt no longer sit; seated skirt weights now end at the garment's hem and share the middle between both thighs | **True.** `_canSit` (people.js ~783) now refuses woman_mini and teen_skirt, and every seat path (static spawn and boarding, index.js 274) goes through `_canSit`. Neither was seated in any of 4 census runs (`g/*.json` `sit`). `_sitWeights` computes `endY = max(kneeY, hemY+0.03)` and blends `bl` across the middle line. In the viewer, with the sit state forced, both minis now lie along the thighs, not as a hoop (`s/A2.png` rows 4-5). The change does not fix three other seated skirts (see claim 5 and section 4). | `s/A1.png`, `s/A2.png`, `g/*.json` |
| 2 | man_kilt_casual's jumper dark burgundy; teen_skater's trainers black | **True.** `GARMENT_TINT` in people.js line 165. The jumper reads dark burgundy beside man_beard's red (`f/ns.png` row 3; `w/F.png` row 5). teen_skater's trainers are dark grey-black (`n/K.png` row 3). sum_loose_shorts_w now wears khaki shorts with white trainers, so the two no longer share a template (`w/F.png` rows 6-7). | `f/ns.png`, `w/F.png`, `n/K.png` |
| 3 | 27 men moved to thick natural brows (eyebrow009/012) incl. man_trews, ya_fedora, staff_hivis | **True.** `tools/assets_people_mpfb.py`: 14 men on eyebrow009 and 13 on eyebrow012 (27). At 0.85 m the brows of man_trews, staff_hivis, man_commuter, man_kilt_casual and others are level, thick and dark. The glare has gone (`f/ns.png`, `f/z.png`). The brows still look painted on, as short flat dark bars, up close. | `f/ns.png`, `f/z.png` |
| 4 | Far-model staff suit keeps 3200 faces so the vest bands hold their straight cuts | **Mostly true.** Before and after, same pose (`w/vcmp.png`: review 11 left, review 12 right of each pair). The grey bands are now continuous stripes, no longer shards. Their edges and the vest hem are still saw-toothed (`w/vz.png`), so "straight cuts" is generous. It now passes at a normal far distance. | `w/vcmp.png`, `w/vz.png`, `w/F.png` rows 1-2 |
| 5 | Not changed: gait, arm-swing asymmetry, Buchanan mix from hand-overs, adult_beret's boots, elder_woman_dress seated, coat stripes, smile shape | **True.** Whole roster on the instrument: the output is identical to review 11 (`diff` of `m/all.log` against review 11's is empty apart from the timing line): 9.23 overall, LEG p10 5.3, ARM p10 5.1, SMO p10 6.9, TRN p10 3.3, worst teen_skirt @1.6 = 7.5. adult_beret's boot tops: white wedges walking, torn into skin notches seated, in the viewer and in the car (`n/K.png` row 2, `gx/ib2.png`). elder_woman_dress seated: see section 4, item 2. Coat stripes on elder_woman_coat and ya_winter (`w/F.png` rows 3-4). Smile: closed-lip corner pull, lopsided on ya_fedora, girl_ginger and teen_crop_leggings (`f/z.png`, `f/w2.png`). Buchanan this run was fine (1 of 17 samples over half), but that is run variance, not a fix. | `m/all.log`, `m/all_items.log` |

## 2. Status of REVIEW_11's top ten

| # | REVIEW_11 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated short pleated skirts as a hoop with the crotch on show | **Fixed in the game** (they no longer sit). With the sit state forced in the viewer they also lie better now. | `s/A2.png`, `g/*.json` |
| 2 | Gait worst tenth | **Not fixed** (identical numbers). | `m/all.log`, `m/all_items.log` |
| 3 | Garment mix at Buchanan | **Not reproduced this time.** Buchanan 1 of 17 samples over half (57 %, 4 of 7). Over four runs: 5 of 80 samples over half (review 11: 12 of 103). The worst was Cowcaddens ride platform, trousers 60 % (9 of 15). | `g/bch.json`, `g/cow.json`, `g/ste.json`, `g/pkr.json`; `python3 cen3.py g/*.json` |
| 4 | Far-model staff vest shards | **Largely fixed**: continuous bands, ragged edges. | `w/vcmp.png` |
| 5 | Standing pairs inside each other for 12-14 s | **Not seen**: 0 events of 2 s or more in 4 census runs. The longest was 0.3 s (`g/pkr.json` `ov`). A dedicated probe on the Cowcaddens ride found none (`ov/cow.json`). | `g/*.json`, `ov/cow.json` |
| 6 | adult_beret's boots | **Not fixed.** | `n/K.png`, `gx/ib2.png` |
| 7 | Arm-swing asymmetry | **Not fixed** (ARM.sym up to 66 %, ARM p10 5.1). | `m/all_items.log` |
| 8 | elder_woman_dress seated | **Not fixed, and worse than review 11 reported**: in the car the dress parts down the middle and both thighs are bare to the hip. | `gx/hh2.png`, `gx/ewd_cmp.png` |
| 9 | Shared outfits and coat stripes | **Partly fixed**: the jumper and the tee/shorts template are now distinct. Still shared: the long coat with maze stripes (elder_woman_coat / ya_winter), and the pleated tartan mini on woman_mini and teen_tube. | `w/F.png` |
| 10 | Faces and small faults | **Brows fixed.** Still there: smirk smiles; sum_shorts_asian_m's tiny dark slit eyes and blurred face; girl_ginger's and teen_crop_leggings' chunky flat hair cards; man_kilt_casual's knee notch through the kilt hem (`n/K.png` row 1, cols 4 and 7). | `f/w2.png`, `n/K.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.0 (typical 8.0, worst 5.5)
- Whole roster on the instrument: identical to review 11. LEG 7.6 (p10 5.3), SMO p10 6.9, TRN p10 3.3, worst recording 7.5.
- Stills: 12 people not in review 11's walking sets, standing and at walk frames 160/168/176, front and side (`n/a.png`). Heel strike, toe-off and knee flexion read. The arms of boy_cap and girl_leggings swing little.

### 3.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)
- Hands hold handles in the curled fingers: holdall, handbag and cabin case on four bodies (`l/H.png`). The phone is at the ear on ya_fedora and woman_elder.
- Worst: ARM.sym 50-66 % on many recordings, ARM p10 5.1. The large case is carried on the stair rig at arm's length with no lean (`l/S.png`).

### 3.3 Faces: 7.02 (typical 7.7, worst 6.0)
- Better: men's brows are natural now (`f/ns.png`).
- Worst tenth: sum_shorts_asian_m has a blurred, flat face with tiny dark slit eyes. girl_ginger, ya_fedora and teen_crop_leggings have lopsided smirk smiles. Hair is made of chunky flat cards with dark edges (girl_ginger, teen_crop_leggings, ya_tube_heels). The skin looks like a doll's (`f/w2.png`, `f/z.png`).
- Blink rate: judged from the code only.

### 3.4 Standing, sitting, behaviour: 7.7 (typical 8.5, worst 6.5)
- Good: 0 duplicates in 4 runs; no standing overlap of 2 s or more in 4 runs plus a probe; stair hold-ups 0. Minis are no longer seated. The view inside a moving car reads as a real carriage (`gx/hv.png`).
- Worst tenth: standing riders with a shin through a seated rider's floor bag (see 3.7). elder_woman_dress seated with bare thighs. A brief far model within 6 m: 3-5 people at once at 5.0-5.8 m in 3 of 4 runs, under 1 s each (`g/*.json` `lod6ids`; review 11 had at most 1).

### 3.5 Range of people: 7.4 (typical 8.0, worst 6.5)
- The roster is unchanged (99). Two shared looks have been broken up (jumper; tee/shorts/trainers).
- Still shared: the long coat (two women), the tartan mini (two girls). Several similar young dark-haired men with one face template (man_kilt_casual, adult_piper, man_highland, `f/ns.png` row 3). adult_suit_bun's suit is loud fuchsia.

### 3.6 Clothing: 7.14 (typical 7.9, worst 6.0)
- Better: the short-skirt hoop is out of the game; the far vest is clean enough; the garment mix was over half in only 5 of 80 samples.
- Worst tenth:
  - elder_woman_dress seated in the car: the dress parts and both thighs are bare to the hip (`gx/hh2.png`).
  - adult_beret's boot tops: white wedges, and skin notches when seated (`gx/ib2.png`, `n/K.png`).
  - woman_coat's pencil skirt hangs as a sheet below the seat with a pointed flap (`s/z1.png` col 3). The seat may hide part of this in the game.
  - Seated shorts balloon into a round bulb behind the hips (adult_camo_cap, ya_bootcut: `s/M.png` B views).
  - Coat maze stripes; kilt knee notch.

### 3.7 Luggage: 7.5 (typical 8.5, worst 6.0)
- Good: all kinds in the hand, towed and carried on the stair rig. Seated riders' own legs were never inside their own bag: 0 hits in 4 rides, 12,585 bag samples.
- **Worst tenth (new finding):** other people's legs are inside floor bags.
  - Hillhead inner ride (`gx/hhb.json`), 12 pairs. adult_runner standing with his right shin in adult_suit_bun's holdall for all 120 s. woman_elder at a rail, shin in ya_tube_heels' shopper, 115 s. man_kilt_casual at a rail in teen_tee's holdall, 98 s. boy_kilt at a pole with shin and thigh in adult_casual5's wheeled case, 97 s. adult_runner in ya_tattoo_tank's tote, 72 s. elder_man_cap in a rucksack, 30 s.
  - A second Hillhead ride (`gx/bt.log`): 7 pairs, longest 10 s. The picture shows teen_crop_leggings standing with her ankle and shin through a red carrier bag (`gx/bt1d.png`).
  - Partick ride: 1 pair, 2 s. A third Hillhead ride: 0.
- **Bag inside bag** in every ride: two pairs for the whole 120 s in `gx/hhb.json` (holdall x tote; carrier x wheeled case); 1-2 pairs of 35-120 s in each other ride. You can see it in `gx/hh1.png`: a white bag rests on, or in, a shopper at elder_woman_dress's feet.
- bags.js has not changed since review 11, so this is probably not a regression. Review 11's single Kelvinhall ride did not catch it.

### 3.8 Whole bodies: 7.02 (typical 7.7, worst 6.0)
- Better: no short-skirt hoop; far vest bands.
- Worst tenth: elder_woman_dress bare to the hip; adult_beret's torn boots; kilt knee notch; seated shorts bulb; the far model briefly within 6 m.

## 4. Top ten defects, in priority order

1. **Gait worst tenth** (LEG p10 5.3, SMO p10 6.9, TRN p10 3.3, worst teen_skirt @1.6 = 7.5), unchanged for three reviews. Walking carries 20 % of the weight.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 12`.
2. **elder_woman_dress seated: the dress parts and both thighs are bare to the hip**, seen at 1 m in the car. This was in review 11 as a "green strip"; it is worse than that.
   - Reproduce: `node gsk.mjs "mode=ride&q=high&line=inner&station=hillhead" gx/hh 40,100 16`.
   - Evidence: `gx/hh2.png`, `gx/ewd_cmp.png`.
3. **Standing riders' shins inside seated riders' floor bags**, for up to 120 s; 6 pairs over 30 s in one ride.
   - Reproduce: `node gbag.mjs "mode=ride&q=high&line=inner&station=hillhead" gx/hhb 120`; `node gbagshot.mjs` (same arguments) renders the first event to last 5 s.
   - Evidence: `gx/hhb.json`, `gx/bt1d.png`.
4. **Floor bags inside each other**, in every ride, for 35-120 s.
   - Evidence: `gx/hhb.json`, `gx/bs.log`, `gx/bt.log`, `gx/bu.log`, `gx/hh1.png`.
5. **adult_beret's boot tops**: white wedges walking, torn into skin notches seated, in the car.
   - Reproduce: `node shoot.mjs 0 adult_beret none walk@160,clip-sit-0-30 n/K legs`.
   - Evidence: `n/K.png`, `gx/ib2.png`.
6. **Arm-swing asymmetry** (ARM.sym 50-66 %, ARM p10 5.1).
   - Evidence: `m/all_items.log`.
7. **Faces**: lopsided smirk smiles; sum_shorts_asian_m's slit eyes and blurred face; flat hair cards.
   - Reproduce: `node face.mjs sum_shorts_asian_m,girl_ginger,teen_crop_leggings f/ws "0:0" 1`.
   - Evidence: `f/w2.png`.
8. **Seated garment edges**: woman_coat's skirt flap below the seat; shorts bulb behind the hips (adult_camo_cap, ya_bootcut); man_kilt_casual's knee notch.
   - Evidence: `s/z1.png`, `s/M.png`, `n/K.png`.
9. **Shared looks**: one long coat with maze stripes on two women; one tartan mini on two girls; a cluster of near-identical young dark-haired male faces.
   - Evidence: `w/F.png`, `f/ns.png`.
10. **Small items**: far model briefly within 6 m (3-5 people, under 1 s, `g/*.json` `lod6ids`); far vest band edges saw-toothed (`w/vz.png`); the large case is carried on stairs with no lean (`l/S.png`); garment mix still reaches 60 % trousers on a platform (`g/cow.json`).

## 5. What I could not observe

- No motion watched. Walking was judged from stills and the instrument.
- Blink and smile timing: code only.
- The longest leg-in-bag events (`gx/hhb.json`) came from a run I could not render. `gbagshot.mjs` caught a shorter one (`gx/bt1d.png`). Its camera often lands inside crowded cars, so most of its shots are not usable.
- A wheeled case on a real station stair (viewer rig only).
- The far-model-within-6 m events were counted, not seen.
- Game runs differ per page load; all numbers are per run.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Every seated skirt/dress wearer in sit_idle, sit_phone and sit_look, sit state forced, F/S/B low views | adult_beret, elder_woman_dress, girl_school_kilt, girl_small, woman_coat, woman_dress, woman_midi, woman_sash, ya_smile_dress, woman_mini, teen_skirt | `s/A1.png`, `s/A2.png`, `s/z1.png` |
| Seated trousers/shorts/heels in sit_idle and sit_cross_legs | adult_camo_cap, man_trews, ya_bootcut, sum_crop_bike, teen_shorts_lad, ya_tube_heels | `s/M.png` |
| In-car seated close views, eye height and low | Ibrox outer ride (adult_sport_cap, adult_fisherman_leggings, woman_puffer, adult_beret, girl_small, ya_ginger_braid); Hillhead inner ride (elder_woman_dress, woman_midi, woman_dress, boy_shorts, girl_leggings, sum_tee_leggings, teen_hood, and others) | `gx/ib*.png`, `gx/hh*.png` |
| 12 people new to walking stills: stand, walk 160/168/176, F and S | woman_puffer, ya_tube_heels, adult_harem, sum_crop_bike, adult_fisherman_leggings, elder_shorts, adult_tattoo_muscle, girl_leggings, boy_cap, ya_bootcut, adult_suit_bun, teen_crop_leggings | `n/a.png`, `n/z.png` |
| Far model stand and walk | staff_hivis, staff_woman, elder_woman_coat, ya_winter, man_kilt_casual, teen_skater, sum_loose_shorts_w | `w/F.png`, `w/vz.png`, `w/vcmp.png` |
| 22 faces at 0.85 m, neutral and smiling | 12 men (brows) + 10 others | `f/ns.png`, `f/w.png`, `f/z.png`, `f/w2.png` |
| Bags walking (5 kinds x 3 bodies), hands close (3 kinds x 4 bodies), wheeled cases on the stair rig | elder_man_suit, ya_fedora, woman_bob, girl_small, ya_tube_heels, adult_harem, boy_cap | `l/W.png`, `l/H.png`, `l/S.png` |
| Kilt hem, boots, trainers (legs view) | man_kilt_casual, adult_beret, teen_skater | `n/K.png` |
| Walking instrument, whole roster (99), all scenarios | all | `m/all.log`, `m/all_items.log` |
| Game census `gp8.mjs`, 150 s each | Buchanan inner explore, Cowcaddens outer ride, St Enoch outer explore, Partick inner ride | `g/*.json` |
| Game floor-bag test `gbag.mjs` / `gbagshot.mjs` (new: renders events), 120 s each | Hillhead inner ride x3, Partick outer ride | `gx/hhb.json`, `gx/bs*`, `gx/bt*`, `gx/bu*` |
| Overlap probe `gov.mjs` | Cowcaddens outer ride | `ov/cow.json` (no events) |
| Eye-height view inside a moving car, 8 directions | St Enoch outer ride, t = 45 s | `gx/hv.png` |

Next round, look at: floor bags against standing riders' legs and against each other, over several rides; elder_woman_dress seated in a car; adult_beret seated; the far model inside 6 m when a train arrives.

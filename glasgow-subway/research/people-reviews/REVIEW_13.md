# Under Glasgow: independent review of the people (review 13)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at the commit after `9c50e4ad` (the three commits since review 12: `b512669f` floor bags, `238b2502` stop-test window, `9c50e4ad` empty-handed recorder; I read the diffs read-only). The models (people.glb, people_lod.glb, people_meta.json, 21:54-21:56) are the same files review 12 saw. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.47 (7.469). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8 (two reach 7.96).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review13/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. In-car close shots `gx/hh_*`: `_e` standing eye height (1.5 m, 1.25 m away), `_l` low (0.9 m, 1.0 m away), standing riders hidden.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.3 | 6.0 | **7.38** |
| 2 | Arms and hands | 10 | 8.5 | 7.0 | **7.9** |
| 3 | Faces | 10 | 7.7 | 6.0 | **7.02** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.0 | **7.96** |
| 5 | Range of people | 10 | 8.0 | 6.5 | **7.4** |
| 6 | Clothing | 15 | 7.9 | 6.3 | **7.26** |
| 7 | Luggage | 10 | 8.6 | 7.0 | **7.96** |
| 8 | Whole bodies | 15 | 7.8 | 6.3 | **7.2** |
| | **Weighted mean** | 100 | | | **7.47** (7.469) |

0.20x7.38 + 0.10x7.9 + 0.10x7.02 + 0.10x7.96 + 0.10x7.4 + 0.15x7.26 + 0.10x7.96 + 0.15x7.2 = 1.476 + 0.790 + 0.702 + 0.796 + 0.740 + 1.089 + 0.796 + 1.080 = 7.469.

In one line: up from 7.23. The floor-bag fix is real and large (standing legs in seated riders' bags: from 12 pairs for 30-120 s in one ride to at most 2 pairs of 12-15 s; bags inside bags: from every ride to none in six). elder_woman_dress no longer sits. The walking instrument changes are legitimate measurement fixes, but they do not touch the gait: LEG p10 5.3 and SMO p10 6.9 are exactly as before, and the brisk-walk crouch is visible in stills. Faces, clothing, range and the far model are the same files as review 12, so those scores barely move. A new clothing fault: adult_lusekofta's tan boots carry the same white wedges as adult_beret's.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Floor bags: seated placed first, standing keep 0.5 m from a seated rider's floor bag; second of two neighbours (beside or across) starts bagless; boarders with bags prefer a seat with no bag beside; floor bags end-on; elder_woman_dress no longer sits | **True, and it works, but not completely.** The code does all of it (`index.js` ~182-191 and ~278-283, `people.js` `_bagNear` ~515, `bags.js` ~324 rotation 0, `_canSit` regex now includes elder_woman_dress). Measured over six rides (9,645 bag samples): bag inside bag **0 in all six**. Standing legs inside a seated rider's floor bag: Buchanan outer 1 pair 13 s (adult_harem in man_elder's tote); Ibrox outer 2 pairs 12-13 s (man_elder in teen_hood's holdall, adult_casual5 in adult_casual2's shopper); Hillhead inner (2nd run) 1 pair 15 s (teen_cutoffs' ankle in teen_hippy's tote, rendered: `bs/hh_0d.png`, plainly visible at eye height); Hillhead inner (1st run), Partick, Cessnock: none standing (only 1-sample walk-throughs). `_bagNear` estimates the bag at a fixed 0.5 m in from the hips, not where `stepBag` actually draws it (in front of the toes); standing boarders who arrive after the check, or riders who shift, can still stand in one. elder_woman_dress: never seated in 4 census runs (`g/*.json` `sit`), seen standing at a rail in the Cowcaddens car (`v/cow.log`). Side effect: fewer floor bags - seated riders with bags are ~24 % of seated in the Govan ride (`g/gov.json` `cen`). | `gx/*.log`, `gx/*.json`, `bs/hh.json`, `bs/hh_0[a-d].png`, `g/*.json` |
| 2a | Start-stop scenario gives 9.5 s to walk 6.5 m | **True and legitimate.** `motion_metrics.mjs` SCEN.startstop: walk 9.5 s, window 13.2 s. The elders walk at ~0.78 of the pace asked; 6.5 m at ~0.94 m/s plus acceleration does not fit in 7 s, so the old test measured nothing and scored 0. The new window measures their actual stop. TRN now 10.0 / p10 9.9 (`m/all.log`). This is a measurement fix, not gaming: the stop itself was not changed and is now actually observed. | `m/all.log` |
| 2b | Recorder walks people empty-handed | **True, and legitimate as a definition of the gait instrument, with a caveat.** `people_motion.html` now passes `bag: null`. One-handed carrying genuinely reduces that arm's swing, so 50-68 % asymmetry with a bag was not a gait fault. ARM now 9.5 / p10 8.5, ARM.sym 0.4 %. Caveat: a large share of walkers in the game carry a bag in the hand (`g/bch.json` Buchanan platform census: 72 of 140 person-samples hold a tote, holdall, case or carrier), so ARM no longer describes about half of what a player sees on that platform; I judged those from stills (below). | `m/all.log`, `m/items.log`, `l/W1.png`, `l/W2.png` |
| 2c | Whole roster: 9.44 overall, TRN p10 9.9, ARM p10 8.5, LEG 7.6 (p10 5.3), SMO p10 6.9 | **Reproduced exactly** (99 people, 712 s). Note the worst recording is now adult_heel_boots @ 0.4 m/s = 7.9 (swing-foot clearance 0.7 mm), also below the instrument's own 8. | `m/all.log` |
| 2d | Bag carriers' arms look right in the game | **Mostly true.** Handbag, holdall, carrier, tote, shopper and towed cabin case on four bodies through four walk phases: the loaded arm hangs nearly straight with the handle in the fingers, the free arm swings, the towing arm trails (`l/W1.png`, `l/W2.png`, `l/z1.png`). The holdall arm is held some 20 degrees out from the side, a little wide but plausible. Free-arm swing is modest at 1.28 m/s. | `l/W1.png`, `l/W2.png`, `l/z1.png`, `l/HD.png` |
| 3 | Not changed: brisk crouch, adult_beret's boots, coat stripes, smile shape, seated garment edges | **True** (same model files). Crouch: teen_tee and teen_girl at 1.6 m/s land on a bent knee (kneeLd 44-48 deg, mid-stance 28-31 deg, `m/items.log`; `n/C.png`). adult_beret's boot tops and seated skirt notches (`n/K.png` row 2). Coat stripes on elder_woman_coat far model (`w/A2.png` row 5). Smirk smiles (`f/F.png`, `f/z.png`). | as listed |

## 2. Status of REVIEW_12's top ten

| # | REVIEW_12 item | Now | Evidence |
|---|---|---|---|
| 1 | Gait worst tenth | **Not fixed.** The TRN 3.3 was an artefact and is gone. LEG p10 5.3 and SMO p10 6.9 unchanged; brisk teens visibly crouch. | `m/all.log`, `m/items.log`, `n/C.png` |
| 2 | elder_woman_dress seated bare to the hip | **Fixed by standing her.** Never seated in 4 census runs; standing at a rail in a car. | `g/*.json`, `v/cow.log` |
| 3 | Standing shins inside seated riders' floor bags | **Largely fixed.** From 12 pairs (6 over 30 s) in one ride to 0-2 pairs per ride of 12-15 s; still seen in 3 of 6 rides. | `gx/*.log`, `bs/hh_0d.png` |
| 4 | Floor bags inside each other | **Fixed**: 0 in 6 rides. | `gx/*.json`, `bs/*.json` |
| 5 | adult_beret's boots | **Not fixed**; and adult_lusekofta has the same kind of white wedges (new). | `n/K.png` |
| 6 | Arm-swing asymmetry | **Resolved as an instrument artefact** (bag hand); bag carriers look right in stills. | `m/all.log`, `l/W1.png` |
| 7 | Faces: smirks, sum_shorts_asian_m, hair cards | **Not fixed.** | `f/F.png`, `f/z.png` |
| 8 | Seated garment edges | **Not fixed** (woman_coat flap and adult_beret notches seen in the car; elder_man_cap's T-shirt hangs as a sheet behind the seat). | `gx/z1.png`, `s/z.png` |
| 9 | Shared looks | **Not fixed.** | `w/A2.png` |
| 10 | Small items | Far model within 6 m: 2-3 people at 5.1-5.8 m in 3 of 4 census runs (same as review 12). Large case on stairs: not re-checked, code unchanged. Garment mix over half in 8 of 81 samples (max 57 %; review 12: 5 of 80). | `g/*.json`, `python3 cen3.py g/*.json` |

## 3. Per-category reasoning

### 3.1 Walking: 7.38 (typical 8.3, worst 6.0)
- Instrument (whole roster, reproduced): 9.44 overall; GRD 9.6, STR 9.9, TIM 10, PEL 9.8, TRN 10.0/9.9, but **LEG 7.6 (p10 5.3)** and **SMO p10 6.9**, worst recording 7.9. The low items are knee flexion in loading (up to 48 deg against ~15-20) and mid-stance (up to 31 deg against ~5-10) in brisk teens and short women, plus pelvis vertical acceleration spikes (99th pct 15-22 m/s^2) and tremor 3-4 mm.
- Stills, 16 people new to walking stills, 4 phases, F/S/B (`n/A.png`, `n/B.png`): heel strike and toe-off read; teen_hippy and man_elder walk with bent knees and a forward trunk; arms swing modestly. At 1.6 m/s teen_tee and teen_girl land on a bent knee every stride (`n/C.png`) - this is visible at 2-6 m.
- Typical up from 8.0 because the stop measurement is now real; worst tenth 6.0 because the crouch is real and unchanged.

### 3.2 Arms and hands: 7.9 (typical 8.5, worst 7.0)
- ARM 9.5, p10 8.5 empty-handed. Bag carriers in stills: loaded arm still, free arm swings, towing arm trails (`l/W1.png`, `l/W2.png`). Handles sit in the fingers (`l/z1.png`).
- Worst: ARM.splay 5.1-5.8 on several brisk recordings (hands 14-15 cm outside the shoulder line); the holdall carried with the arm held out; swing small at moderate speed in stills; the large case carried up stairs with no lean (code unchanged since review 12).

### 3.3 Faces: 7.02 (typical 7.7, worst 6.0)
- Unchanged files. 16 faces at 0.85 m, neutral and smiling (`f/F.png`): doll-like skin, closed-lip corner-pull smiles that are lopsided on ya_smile_halter and teen_hippy (`f/z.png`); sum_shorts_asian_m still has a blurred flat face with tiny slit eyes; ya_smile_halter's hair hangs across half the face as a flat black slab.

### 3.4 Standing, sitting, behaviour: 7.96 (typical 8.6, worst 7.0)
- Good: 0 duplicates in 4 census runs; no overlap of 2 s or more (longest 0.4 s, `g/kel.json`) and none in the Shields Road ride probe (`ov/sh.log`); elder_woman_dress standing; seated cars look right at eye height (`gx/HH.png`, `v/cowE.png`).
- Worst tenth: teen_cutoffs standing with her ankle in a tote for 15 s (`bs/hh_0d.png`); a stair stall of 2 s (man_beard, St Enoch, `g/ste.json` `stair`); far model 2-3 people at 5.1-5.8 m in 3 of 4 runs (counted, not seen).

### 3.5 Range of people: 7.4 (typical 8.0, worst 6.5)
- Roster unchanged (99: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff). Same shared looks as review 12 (long striped coat on two women, tartan mini on two girls, similar young dark-haired male faces). Random tee prints vary nicely between spawns (`n/A.png` rows 6, 8).

### 3.6 Clothing: 7.26 (typical 7.9, worst 6.3)
- Better: elder_woman_dress's parted dress is out of the seats.
- Worst tenth: adult_beret's boot tops (white rims standing, skin notches through the skirt seated, `n/K.png` row 2); **adult_lusekofta's tan boots have white wedge stripes down both shafts, standing, walking, seated and on the far model** (`n/K.png` row 1, `n/z1.png`, `w/A.png` row 1) - new; woman_coat's skirt flap seated; seated shorts bulb; elder_man_cap's T-shirt hem hangs as a sheet behind the hips seated (`s/z.png` col 4); maze stripes on the long coat. Garment mix over half in 8 of 81 samples (Buchanan and St Enoch, trousers 51-57 %).

### 3.7 Luggage: 7.96 (typical 8.6, worst 7.0)
- Good: all kinds carried, towed and set at the feet; seated riders' own legs never in their own bag (0 in 6 rides); bag in bag 0 in 6 rides; floor bags end-on.
- Worst tenth: 4 standing-in-bag events of 12-15 s in 3 of 6 rides, one rendered (`bs/hh_0d.png`). The tote standing on edge in front of the toes reads as a white sliver from low in the car (`gx/z1.png` cols 1-2). Large case on stairs (unchanged).

### 3.8 Whole bodies: 7.2 (typical 7.8, worst 6.3)
- Better: no parted dress in the seats.
- Worst tenth: the two pairs of boots above; seated shorts bulb and T-shirt sheet; far model briefly within 6 m; far vest band edges and elder_man_cap's ragged far-model T-shirt hem (`w/A2.png` row 3).

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG p10 5.3, SMO p10 6.9; teen_tee, teen_girl, woman_bob, teen_skirt, sum_tee_leggings at 1.6-1.9 m/s). Walking is 20 % of the weight and the only category whose instrument still fails.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 12`; stills `node shoot.mjs 0 teen_tee,teen_girl,woman_bob none walk@160,walk@164,walk@168,walk@172,walk@176 n/c body 1.6`.
   - Evidence: `m/items.log`, `n/C.png`.
2. **Faces**: lopsided smirk smiles, sum_shorts_asian_m's blurred slit-eyed face, flat hair slabs over faces (ya_smile_halter), doll skin.
   - Reproduce: `node face.mjs ya_smile_halter,sum_shorts_asian_m,teen_hippy f/x "0:0" 1`.
   - Evidence: `f/F.png`, `f/z.png`.
3. **Boots with white wedges: adult_lusekofta (new) and adult_beret** (beret also shows skin notches through the seated skirt).
   - Reproduce: `node shoot.mjs 0 adult_lusekofta,adult_beret none stand,clip-sit-0-30 n/k legs`.
   - Evidence: `n/K.png`, `w/A.png` row 1.
4. **Standing riders still stand in floor bags** for 12-15 s in half the rides. `_bagNear` uses an estimated bag position, not the drawn one.
   - Reproduce: `node gbagshot.mjs "mode=ride&q=high&line=inner&station=hillhead" bs/hh 120` (varies per load; also `gbag.mjs` on ibrox/buchanan outer).
   - Evidence: `bs/hh_0d.png`, `gx/ibb.log`, `gx/bcb.log`.
5. **Seated garment edges**: woman_coat's skirt flap, shorts bulb behind the hips, elder_man_cap's T-shirt hanging as a sheet behind the seat.
   - Evidence: `s/z.png`, `gx/z1.png` col 4.
6. **Shared looks**: the long maze-striped coat (elder_woman_coat, ya_winter), the tartan mini, one face template for several young men.
   - Evidence: `w/A2.png` row 5.
7. **Arm splay and small free-arm swing** at moderate speeds; the holdall arm held out from the side.
   - Evidence: `m/items.log` (ARM.splay), `l/W1.png`, `n/A.png`.
8. **Far model within 6 m** (2-3 people at 5.1-5.8 m in 3 of 4 runs) and far-model edges (vest bands, elder_man_cap hem).
   - Evidence: `g/*.json` `lod6ids`, `w/A2.png`.
9. **Garment mix** over half in 8 of 81 samples (trousers to 57 %), Buchanan and St Enoch platforms.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan" g/bch 150`; `python3 cen3.py g/*.json`.
10. **Small items**: adult_heel_boots @ 0.4 m/s swing-foot clearance 0.7 mm (worst recording 7.9); 2 s stair stall (man_beard, St Enoch); large case on stairs with no lean.

## 5. What I could not observe

- No motion watched; walking from stills and the instrument.
- Blink and smile timing: code only.
- Only one leg-in-bag event was rendered; the others were measured.
- Pole and rail holds with a bag: the viewer has no pole, so the hold clip shows no grip; not judged this round.
- The large case on a real station stair; the far model inside 6 m (counted, not seen).
- Every game run differs per load; numbers are per run.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Walking instrument, whole roster (99), all scenarios, re-scored with items and worst 12 | all | `m/all.log`, `m/items.log`, `m/rec/` |
| 16 people new to walking stills: stand, walk 160/168/176/184, F/S/B | man_hoodie, man_longcoat, man_elder, woman_scarf, woman_student, teen_runner, teen_hippy, adult_cyclist, adult_tophat, adult_lusekofta, adult_heel_boots, adult_camisole, ya_smile_halter, sum_tube_denim, teen_cutoffs, boy_small | `n/A.png`, `n/B.png`, `n/z1.png` |
| Brisk walk 1.6 m/s, five phases, side | teen_tee, teen_girl, woman_bob | `n/C.png` |
| Bag carriers walking, 4 phases, F/S/B | woman_scarf, man_longcoat (handbag, holdall, carrier); adult_tophat, teen_cutoffs (tote, shopper, towed cabin case) | `l/W1.png`, `l/W2.png`, `l/z1.png` |
| Hands on handles walking | adult_camisole, elder_man_cap x 5 kinds | `l/HD.png` |
| Seated sit_idle / sit_look / sit_phone, F/S/B | the 10 people of `s/A.png` | `s/A.png`, `s/z.png` |
| Boots and legs, standing and seated | adult_lusekofta, adult_beret | `n/K.png` |
| Far model stand and walk | adult_lusekofta, man_hoodie, adult_heel_boots, ya_smile_halter, sum_tube_denim, teen_hippy, adult_tophat, elder_man_cap, woman_coat, elder_woman_coat | `w/A.png`, `w/A2.png` |
| 16 faces at 0.85 m, neutral and smiling | man_hoodie, woman_scarf, adult_lusekofta, teen_hippy, ya_smile_halter, sum_tube_denim, adult_camisole, elder_woman_coat, man_puffer, woman_bob, adult_tophat, teen_runner, sum_shorts_asian_m, girl_ginger, ya_fedora, elder_man_cap | `f/F.png`, `f/z.png` |
| Floor bags vs legs and bag vs bag, 120 s each | Hillhead inner x2, Ibrox outer, Partick inner, Buchanan outer, Cessnock outer rides | `gx/*.log`, `bs/*` |
| In-car seated close views (eye height and low), t = 40 and 100 s | Hillhead inner ride, 21 seated riders incl. woman_coat, adult_beret, woman_dress, woman_midi, girl_small, ya_smile_polo, adult_harem | `gx/HH.png`, `gx/z1.png` |
| Game census `gp8.mjs`, 150 s each | Buchanan inner explore, Govan inner ride, Kelvinhall outer ride, St Enoch outer explore | `g/*.json` |
| Overlap probe | Shields Road inner ride, 150 s | `ov/sh.log` (none) |
| Eye-height views inside a moving car, 8 directions, plus nearest faces | Cowcaddens outer ride, t = 30 and 75 s | `v/cowE.png`, `v/cowF.png` |

Next round, look at: pole and rail holds with a bag in the game; adult_lusekofta in a car; whether a standing boarder's spot is checked against the bag where it is drawn; the far model when a train arrives.

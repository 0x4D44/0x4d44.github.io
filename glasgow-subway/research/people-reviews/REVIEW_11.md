# Under Glasgow: independent review of the people (review 11)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611. File dates: people.js 18:11, bags.js 18:07, gait.js 18:23 (touched, but the walking instrument gives the same numbers as review 10), people.glb / people_lod.glb / people_meta.json unchanged since review 10 (17:36-17:37). Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.18 (7.176). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8; luggage comes closest (7.9).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review11/`. In viewer stills, `_F` = front quarter, `_S` = side, `_B` = back quarter. In-game close shots (`gx/hh_*`, `gx/ib_*`) are taken with the standing people hidden so the seated rider can be seen; `_e` = standing eye height (1.5 m, 1.25 m away), `_l` = low (0.9 m, 1.0 m away).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 5.5 | **7.0** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.5 | 6.0 | **6.9** |
| 4 | Standing, sitting, behaviour | 10 | 8.5 | 6.5 | **7.7** |
| 5 | Range of people | 10 | 7.8 | 6.5 | **7.28** |
| 6 | Clothing | 15 | 7.7 | 5.5 | **6.82** |
| 7 | Luggage | 10 | 8.5 | 7.0 | **7.9** |
| 8 | Whole bodies | 15 | 7.5 | 6.0 | **6.9** |
| | **Weighted mean** | 100 | | | **7.18** (7.176) |

0.20x7.0 + 0.10x7.4 + 0.10x6.9 + 0.10x7.7 + 0.10x7.28 + 0.15x6.82 + 0.10x7.9 + 0.15x6.9 = 1.400 + 0.740 + 0.690 + 0.770 + 0.728 + 1.023 + 0.790 + 1.035 = 7.176.

In one line: up from 7.10. The floor bags are now clean (no shin in a rucksack, no toes in a briefcase, in the viewer or the game), the garment mix held in four of five runs, and four more skirt wearers now sit. Holding the score down: the gait (whole roster re-measured, unchanged), the short skirts that now sit (woman_mini, teen_skirt) and become a frilly hoop round the hips with the crotch on show, a Buchanan run where trousers were 58-67 % of the people near the player, and the unchanged far-model vest, coat stripes, faces and shared outfits.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Seated skirts and dresses take a second set of skin weights; woman_coat, woman_midi, woman_mini, adult_beret, girl_school_kilt sit again; teen_tube, man_kilt_casual, man_highland, adult_piper, boy_kilt never sit | **True as code and as behaviour; the result is good for long dresses and bad for short skirts.** `_skirtSit`/`_sitWeights` in people.js hand each garment vertex below the hip to the thigh on its own side. In the game the swap is applied (`skirtSit: true` on every seated skirt wearer in `gx/hh.json`, `gx/ib.json`). woman_coat, woman_midi, woman_mini, adult_beret and girl_school_kilt were all seen seated in game runs; none of the five stand-only people sat in any run (`g/*.json` `sit`). **Long garments are better:** woman_dress, woman_sash, ya_smile_dress and woman_midi lie along the thighs at eye height in a car (`gx/sk2e.png`, `gx/sk2l.png`). **Short pleated skirts are broken:** woman_mini and teen_skirt, seated in the car, show the skirt as a thin frilly hoop round the hips and thighs, the crotch (pale underwear) visible between the thighs, and a separate strip of hem hanging below the seat edge between the knees (`gx/skz2.png`: both woman_mini shots and teen_skirt). woman_mini sat in no car before this change, so this is newly visible. **Others:** elder_woman_dress still shows a lime underside bowl under the thighs in the viewer and from the far model (`s/s1.png` row 1, `w/z.png`); in the car a green strip of hem shows at the seat edge. adult_beret seated: the pencil skirt hangs as a dark curtain below the thighs and the boot tops tear into skin notches and white wedges at the knees (`gx/beret.png`, `n/K.png` col 6). | `s/AF.png`, `s/AS.png`, `s/s1.png`, `gx/sk2e.png`, `gx/sk2l.png`, `gx/skz2.png`, `gx/beret.png` |
| 2 | Floor bags of seated riders stand in front of the toes | **True.** Viewer, all 99 people x {sit_idle, sit_phone, sit_look} x 8 kinds, full model: 6 of 2,370 poses with a limb point inside a bag (left toe tip of adult_oxford_shirt and elder_man_suit in a rucksack); review 10 had 142 of 1,584. Far model (ruck, case, shopper, trolley): 21 of 1,185, all the left toe tip of seven long-footed men (adult_oxford_shirt, adult_tie_suit, adult_tophat, elder_man_suit, elder_shorts, man_elder, man_longcoat) in the rucksack. (sit_cross_legs puts the left foot into the bag in 65 people, but the game never crosses the legs of anyone with a bag.) Game ride from Kelvinhall, 120 s, 3,899 seated-bag samples: 0 own legs inside a bag, 0 bags inside bags; one other person's toe in a bag (man_kilt_casual holding a pole, toe in adult_leggings_knit's carrier for 1.5 s). Bags stand 0.5-0.75 m in front of the hips and read naturally in the car (`gx/sk2l.png`). | `bp6_0.log`, `bp6_0.json`, `bp6_1.log`, `bp6_1_ruckcaseshoppertrolley.json`, `gx/kvb.log`, `gx/kvb.json`, `l/A.png` |
| 3 | A garment group already worn by 45 % of the people within 15 m is left out of the draw; 0 samples over half at Ibrox and Partick | **Mostly true at Ibrox and Partick; false at Buchanan.** By garment with children counted (`cen3.py`): Ibrox 0 of 23 samples over half (max 50 %); Partick 2 of 20 (saloon trousers 52 %, 22 of 42 and 17 of 33); Cowcaddens ride 0 of 22; St Enoch 1 of 23 (53 %, 8 of 15); **`station=buchanan` 9 of 15** (saloon trousers **61 %, 17 of 28; 58 %, 25 of 43**; platform 67 %, 4 of 6 for the last 30 s). By the builder's own grouping (`cen2.py`, children apart) Buchanan is still 6 of 15 over half. In all: 12 of 103 samples over half (review 10: 17 of 107). The saloon numbers are train hand-overs, which keep their look and are not redrawn. | `g/ibx.json`, `g/pk.json`, `g/cow.json`, `g/ste.json`, `g/bch.json`, `cen2.py`, `cen3.py` |
| 4 | Walk-past hold gives way after 3 s | **True.** Longest stair stand-still in walking mode over five runs: 3 s (Buchanan, adult_smile_blouse); 1.5, 0.5, 0, 0 s elsewhere. Review 10 had 4 s; the builder's 8 s case not seen. | `g/*.json` `stair` |
| 5 | Not changed: gait, arm-swing asymmetry, far vest bands, faces/brows, shared outfits, coat stripes | **True.** Whole roster on the instrument (99 people, all scenarios, re-measured this time): overall 9.23, LEG 7.6 (p10 5.3), ARM p10 5.1, SMO p10 6.9, **TRN p10 3.3**, worst recording teen_skirt at 1.6 m/s = 7.5; review 10's eight worst give line-for-line the same numbers (8.84). Far vest shards (`w/z.png`), coat maze-stripes on elder_woman_coat and ya_winter (`w/F.png` rows 2-3), man_kilt_casual's red jumper, man_kilt_casual's knee through the kilt hem at walk frame 160 (`n/K.png` col 1): all still there. | `m/all.log`, `m/all_items.log`, `m/sub.log` |

## 2. Status of REVIEW_10's top ten

| # | REVIEW_10 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated dresses and skirts ring and balloon round the knees | **Partly fixed.** Long dresses and the midi lie on the thighs in the car. **Short pleated skirts (woman_mini, teen_skirt) are now hoops round the hips with the crotch showing**; elder_woman_dress keeps a lime-underside bowl in the viewer and far model; adult_beret's skirt hangs as a curtain and her boot tops tear. | `gx/skz2.png`, `s/s1.png`, `w/z.png`, `gx/beret.png` |
| 2 | Gait worst tenth unchanged | **Not fixed** (not attempted). Whole roster now re-measured: same 9.23, same worst recordings. | `m/all.log`, `m/all_items.log` |
| 3 | Left shin into the floor rucksack | **Fixed.** 0 shins; 6 toe tips (full) / 21 toe tips (far) of long-footed men. 0 in the game. | `bp6_0.log`, `bp6_1.log`, `gx/kvb.log` |
| 4 | Far-model staff vest: shattered silver bands | **Not fixed.** Grey shards in the orange at every distance. | `w/z.png` right, `w/F.png` row 1 |
| 5 | Toes into the floor briefcase | **Fixed.** 0 case hits on either model. | `bp6_*.json` |
| 6 | Arm-swing asymmetry 51-69 % | **Not fixed.** ARM.sym 50.7 % on teen_skirt @1.6; ARM p10 5.1 over the roster. | `m/all_items.log` |
| 7 | Garment mix over half in all five runs | **Better, not fixed.** 12 of 103 samples over half, mostly at Buchanan (up to 61 % of 28 and 58 % of 43 in a saloon). | claim 3 |
| 8 | Long coat stripes and shared outfits | **Not fixed.** | `w/F.png`, `n/a2.png` |
| 9 | Faces: smirks, glaring brows, ragged hairline, smudged lashes, doll skin | **Not fixed.** New examples: man_trews, ya_fedora and staff_hivis glare (steep inner brows); girl_ginger's smile is a lopsided smirk under chunky flat hair strands; man_hoodie's hood edge is a ragged black fringe round the face; sum_shorts_asian_m's eyes are tiny dark slits. | `f/ns.png` |
| 10 | Small faults | Kilt hem knee: **not fixed** (`n/K.png`). Vest strap stair-steps: not re-shot. Pole-holder inside a seated rider: **not seen**, but in the Cowcaddens ride two **standing pairs** stood inside each other for 12-14 s (see 4.6). Stair stall: now capped at 3 s. Seated shorts ballooning: not re-shot. | `g/cow.json` `ov` |

## 3. Per-category reasoning

### 3.1 Walking: 7.0 (typical 8.0, worst 5.5)
- 14 people not in review 10's walking sets, stand and walk frames 160/168/176/184, front and side (`n/a1.png`, `n/a2.png`): heel strike, toe-off and knee flexion read; no sliding in a still.
- Whole roster, all scenarios: overall 9.23; discriminating 55 points 8.96; LEG 7.6 (p10 5.3: knee 46 deg in loading, 31 deg at mid-stance on the worst); SMO p10 6.9; TRN p10 3.3 (stopping still fails the tests for about one person in ten); worst recording teen_skirt at 1.6 m/s = 7.5, then ya_ginger_braid 7.6, sum_crop_bike 7.7.
- Unchanged from review 10, so the score is unchanged.

### 3.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)
- Handles in the curled fingers walking with handbag, holdall, shopper and towed cabin case; the cabin case is lifted by its top handle on the stair rig, at arm's length, with no lean away from the weight (`l/H.png`).
- No hand inside any bag (viewer and game).
- Worst: left/right swing difference 51 % (ARM.sym, teen_skirt), ARM p10 5.1; many viewer walks swing the arms very little at 1.3 m/s (`n/a1.png` rows 2, 5).

### 3.3 Faces: 6.9 (typical 7.5, worst 6.0)
- 16 new faces at 0.85 m, neutral and smiling (`f/ns.png`). Age, sex and skin tone read.
- Faults as in review 10, with new examples (2, item 9). The smile is still a closed-lip corner pull; with the steep brows it reads as a smirk.
- Blink rate by code only (not watched).

### 3.4 Standing, sitting, behaviour: 7.7 (typical 8.5, worst 6.5)
- **Good:** 0 duplicates in five runs; floor bags placed naturally; skirts and dresses now in the seated half of the car; eye-height view in a moving car reads as a real carriage (`gx/hv.png`); stair hold capped at 3 s.
- **Worst tenth:**
  - woman_mini and teen_skirt seated with the skirt as a hoop and the crotch showing (3.6);
  - **two pairs standing inside each other in the saloon for 12-14 s**: Cowcaddens outer ride, boy_kilt holding a pole 0.05 m (centre to centre) from girl_shorts standing, 14 s, 6.9 m from the camera; adult_heel_boots holding a pole 0.15 m from man_beard standing, 12.5 s, 9.1 m (`g/cow.json` `ov`). Not repeated in two further rides with a dedicated probe (`ov/cow.json`, `ov/ste.json`: none), so it is intermittent;
  - a pole-holder's toe in a seated rider's carrier for 1.5 s (`gx/kvb.json`).

### 3.5 Range of people: 7.28 (typical 7.8, worst 6.5)
- Roster unchanged (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff). Better than review 10 in one way: skirts and dresses now appear among seated riders (woman_coat, woman_midi, woman_mini, adult_beret, girl_school_kilt seen seated).
- Still repeated: shared long coat (elder_woman_coat / ya_winter), shared sweatshirt, man_beard / man_kilt_casual in one red jumper; sum_loose_shorts_w and teen_skater are the same printed-tee / blue-shorts / white-trainer template on similar dark-skinned bodies (`n/a2.png` rows 5-6); woman_mini and teen_tube wear the same pleated tartan mini in two colours (`n/a1.png` rows 3, 5).

### 3.6 Clothing: 6.82 (typical 7.7, worst 5.5)
- **Better:** mix held in four of five runs; long dresses seated.
- **Worst tenth:**
  - **woman_mini / teen_skirt seated: skirt hoop, crotch visible, loose hem strip below the seat** (`gx/skz2.png`), every sit clip in the viewer too (`s/AF.png` rows 3 and 5);
  - Buchanan: trousers 58-67 % of the people near the player for 60 s (claim 3);
  - elder_woman_dress seated bowl with lime underside (`s/s1.png`, `w/z.png`);
  - adult_beret's boots: white wedges at the top of both boots standing and walking, torn into skin notches seated (`n/K.png` cols 4-6, `gx/beret.png`);
  - far vest shards; long-coat stripes; man_kilt_casual's knee through the hem.

### 3.7 Luggage: 7.9 (typical 8.5, worst 7.0)
- **Good:** all eight kinds, made in Blender; held in the hand walking, towed, carried on the stair rig; seated, every bag stands on the floor in front of the toes with no leg in it (2,364 of 2,370 viewer poses clean; 0 of 3,899 in the game); nothing floats or sinks (bag bottoms 0.24-0.55 m below the pelvis-origin line, all on the floor).
- **Worst:** toe tips of seven long-footed men inside the rucksack on the far model; a pole-holder's toe in a neighbour's carrier; the cabin case carried at arm's length with no lean on stairs; not seen: a wheeled case on a real stair.

### 3.8 Whole bodies: 6.9 (typical 7.5, worst 6.0)
- **Worst tenth:** short-skirt hoops with the crotch showing; adult_beret's torn boot tops; far vest shards; kilt hem knee; elder_woman_dress bowl; man_hoodie's ragged hood edge round the face; (carried) sum_crop_denim's stepped hairline, staff_woman's parting.
- The LOD swap was not seen to pop (lod6max 1 in every run; near people are on the full model).

## 4. Top ten defects, in priority order

1. **Seated short pleated skirts are a hoop round the hips, crotch on show, hem strip below the seat** (woman_mini, teen_skirt; every sit clip; in the game at 1-2 m).
   - Reproduce: `node gsk.mjs "mode=ride&q=high&line=inner&station=hillhead" gx/hh 40,100 16` (woman_mini) and `node gsk.mjs "mode=ride&q=high&line=outer&station=ibrox" gx/ib 50,110 16` (teen_skirt); viewer: `node shoot.mjs 0 woman_mini,teen_skirt none clip-sit-0-30,clip-sitphone-0-30 s/A vlow` (shoot.mjs here sets the sit state so the seated weights apply).
   - Evidence: `gx/skz2.png`, `s/AF.png`.
2. **Gait worst tenth unchanged**, whole roster: LEG p10 5.3, SMO p10 6.9, TRN p10 3.3, teen_skirt @1.6 = 7.5.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR` (about 10 min, about 550 MB), then `--from DIR --items --worst 12`.
   - Evidence: `m/all.log`, `m/all_items.log`.
3. **Garment mix at Buchanan**: trousers 61 % of 28 and 58 % of 43 people in the arriving saloon, 67 % of the platform for 30 s; 9 of 15 samples over half. Hand-overs keep their look.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan" g/bch 150`; `python3 cen3.py g/bch.json`.
4. **Far-model staff vest** silver bands in grey shards.
   - Reproduce: `node shoot.mjs 1 staff_hivis none stand,walk@166,clip-sit-0-30 w/F body`. Evidence: `w/z.png`.
5. **Standing people inside each other in the saloon for 12-14 s** (boy_kilt at a pole 0.05 m from girl_shorts; adult_heel_boots at a pole 0.15 m from man_beard). Intermittent.
   - Reproduce: `node gp8.mjs "mode=ride&q=high&line=outer&station=cowcaddens" g/cow 150` and read `ov`; `gov.mjs` renders such pairs when it catches one.
6. **adult_beret's boots**: white wedges at the boot tops, torn into skin notches when seated (she now sits).
   - Reproduce: `node shoot.mjs 0 adult_beret none walk@160,clip-sit-0-30 n/K legs`. Evidence: `n/K.png`, `gx/beret.png`.
7. **Arm-swing asymmetry** (ARM.sym 51 %, ARM p10 5.1) and small swings at 1.3 m/s. Evidence: `m/all_items.log`.
8. **elder_woman_dress seated**: lime-underside bowl under the thighs (viewer, far model), green hem strip at the seat edge in the car. Evidence: `s/s1.png`, `w/z.png`, `gx/sk2e.png`.
9. **Shared outfits and coat stripes**: one long coat on two women with maze-like light stripes; one red jumper on two men; one tee/shorts/trainer template on sum_loose_shorts_w and teen_skater; one mini on woman_mini and teen_tube. Evidence: `w/F.png`, `n/a1.png`, `n/a2.png`.
10. **Faces and small faults**: glaring brows (man_trews, ya_fedora, staff_hivis), smirk smiles, girl_ginger's chunky hair, man_hoodie's ragged hood edge; man_kilt_casual's knee through the hem; long-footed men's toe tips in floor rucksacks on the far model; a pole-holder's toe in a carrier.
    - Reproduce: `node face.mjs adult_beret,...,staff_hivis f/n "0:0" 0` (list in `f/n_list.txt`), `KINDS=ruck,case,shopper,trolley node bp6.mjs 1`.

## 5. What I could not observe

- **No motion watched.** Walking from stills and the instrument.
- Blink and smile timing: code only.
- The 12-14 s standing overlaps were caught by the census in one ride only; my dedicated overlap probe (`gov.mjs`) found none in two further rides, so I have no picture of them.
- A wheeled case on a real station stair (viewer stair rig only).
- The full-model vest strap stair-steps and adult_camo_cap's seated shorts were not re-shot.
- Game runs differ per page load; numbers are per run.
- My in-game close shots hide standing people to see the seated ones; at eye height in a real car some of these views are partly blocked by standing riders.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Every skirt/dress sitter in all four sit clips (sit_idle, sit_phone, sit_look, sit_cross_legs), seated weights applied, F/S/B low views | adult_beret, elder_woman_dress, girl_school_kilt, girl_small, teen_skirt, woman_coat, woman_dress, woman_midi, woman_mini, woman_sash, ya_smile_dress | `s/AF.png`, `s/AS.png`, `s/AB.png`, `s/s1.png` |
| Seated skirt/dress wearers and floor bags inside moving cars, eye height and low, standing riders hidden | woman_mini, woman_dress, girl_small (Hillhead inner ride); ya_smile_dress, woman_sash, elder_woman_dress, adult_beret, woman_dress, teen_skirt, girl_small (Ibrox outer ride); plus other bag holders | `gx/hh_*`, `gx/ib_*`, `gx/sk2e.png`, `gx/sk2l.png`, `gx/skz2.png`, `gx/beret.png` |
| 14 people not in review 10's walking sets: stand + walk 160/168/176/184, F and S | adult_beret, woman_coat, woman_mini, girl_school_kilt, teen_tube, adult_piper, boy_kilt, man_highland, woman_sash, ya_smile_halter, adult_string_vest, sum_loose_shorts_w, teen_skater, man_puffer | `n/a1.png`, `n/a2.png` |
| Far model stand / walk / sit | staff_hivis, elder_woman_coat, ya_winter, ya_smile_dress, woman_mini, elder_woman_dress, teen_skirt, adult_beret | `w/F.png`, `w/z.png` |
| 16 new faces at 0.85 m, neutral and smiling | `f/n_list.txt` | `f/ns.png` |
| Bags in hand walking and on the stair rig (4 kinds x 3 bodies) | woman_mini, man_highland, teen_skater | `l/H.png` |
| Seated floor bags, 4 kinds x 2 clips, feet view | adult_camo_cap, adult_oxford_shirt, woman_dress, boy_cap | `l/A.png` |
| Floor-bag geometry, 99 people x {sit, sitphone, sitalt x2} x 8 kinds (full), x 4 kinds (far) | all | `bp6.mjs`, `bp6_0.*`, `bp6_1*` |
| Kilt hem and boots, legs view | man_kilt_casual, adult_beret | `n/K.png` |
| Walking instrument: whole roster (99) and review 10's eight worst | all | `m/all.log`, `m/all_items.log`, `m/sub.log` |
| Game census `gp8.mjs` (overlaps, duplicates, stairs, sit census, garment census within 15 m) | Ibrox outer explore, Partick inner explore, `station=buchanan` inner explore, Cowcaddens outer ride, St Enoch inner explore; 150 s each | `g/*.json`, `cen2.py`, `cen3.py` |
| Game bag test (`gbag.mjs`): every seated floor bag vs every person's legs, bag vs bag | Kelvinhall inner ride 120 s, 3,899 bag samples | `gx/kvb.json` |
| Overlap probe with pictures (`gov.mjs`) | Cowcaddens outer ride, St Enoch inner ride | `ov/*.json` (no events) |
| Eye-height view inside a moving car, 8 directions | Partick inner ride, t = 45 s | `gx/hv.png` |

New scripts in `$R`: `gsk.mjs` (in-game close views of seated skirt wearers and bag holders, standing riders hidden), `gbag.mjs` (in-game floor bags against everyone's legs and each other), `gov.mjs` (catches and renders standing overlaps), `bp6.mjs` now covers sitalt and forces the sit state; `shoot.mjs` forces the sit state for `clip-sit*` so the seated skin weights apply. Next round, look at: short skirts seated after any fix, Buchanan and other big-saloon hand-overs for the mix, standing overlaps in rides, a wheeled case on a real stair.

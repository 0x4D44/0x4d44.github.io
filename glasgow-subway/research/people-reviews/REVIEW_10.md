# Under Glasgow: independent review of the people (review 10)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611 (people.glb and people_lod.glb dated 2026-11-17 17:37, people_meta.json 17:36, bags.js and people.js 17:27, armfit.js 17:39). Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.1 (7.10). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review10/`. In viewer stills, `_F` = front quarter, `_S` = side, `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 5.5 | **7.0** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.5 | 6.0 | **6.9** |
| 4 | Standing, sitting, behaviour | 10 | 8.5 | 6.5 | **7.7** |
| 5 | Range of people | 10 | 7.6 | 6.5 | **7.16** |
| 6 | Clothing | 15 | 7.5 | 5.5 | **6.7** |
| 7 | Luggage | 10 | 8.0 | 6.5 | **7.4** |
| 8 | Whole bodies | 15 | 7.5 | 6.0 | **6.9** |
| | **Weighted mean** | 100 | | | **7.10** (7.096) |

0.20x7.0 + 0.10x7.4 + 0.10x6.9 + 0.10x7.7 + 0.10x7.16 + 0.15x6.7 + 0.10x7.4 + 0.15x6.9 = 1.400 + 0.740 + 0.690 + 0.770 + 0.716 + 1.005 + 0.740 + 1.035 = 7.096.

In one line: up from 6.95. The full-model staff vest is now clean, hands no longer go into bags (no lap bags at all), and the adult_tie_suit / elder_shorts lookalike is gone. Holding the score down: the gait (unchanged; same worst tenth), seated dresses that still ring the knees, the far-model vest whose silver bands are broken shards, the long coat's stripes, and two new faults from moving every bag to the floor: the left shin passes into a floor rucksack for two thirds of the roster, and long shoes go into a floor briefcase.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Staff vest painted on to the work suit; orange + silver bands; navy sleeves; full model undecimated; far model keeps material boundaries | **True on the full model, false in effect on the far model.** Full model: the bib top edge is now straight, the bands are clean straight stripes front and back, the dungaree strap and buckle no longer show through a hole, no shoulder flap when walking. What is left up close (1.2 m chest view): the outer edges of the orange shoulder straps are stair-stepped (2-3 cm teeth), and the orange bib with its two buckles reads as a hi-vis bib-and-brace rather than a vest (acceptable). Far model (`forcelod=1`): the silver bands break into grey triangles and shards, front and back, with navy notches in the orange; it reads as camouflage at 3-4 m and as a grey-blotched patch beyond 6 m. Triangle counts: staff_hivis 15,124 full / 3,744 far, 8 materials on each. | `w/vz.png`, `w/vzoom.png` (full), `w/vf.png`, `w/vfzoom.png` (far) |
| 2 | Every seated rider's bag stands on the floor at the feet | **True.** Viewer, all 99 people x {sit_idle, sit_phone} x 8 bag kinds, both models (3,168 poses): 0 bags on the lap; every bag bottom is at floor level. Game ride from Kelvinhall inner, 120 s: 394 seated-with-bag samples, all on the floor, 0 lap bags, 0 phone-with-lap-bag, 0 hands inside a bag (review 9: 195 samples of one woman's hand in her holdall). **New fault from it:** see 4.1 and 4.5 (shins into rucksacks, toes into briefcases). | `bp6_0.log`, `bp6_1.log`, `bp6_0.json`, `bp6_1.json`, `gx/kv.log`, `gx/kv.json`, `l/SL.png`, `l/rk.png`, `l/cs.png` |
| 3 | The 45 % re-roll counts the people within 15 m of where each newcomer appears | **True as code; better but still over half at times.** `people.js` `_pick` now counts `near()` = within 15 m of the spawn point. Loopholes remain: the re-roll only fires when *every* candidate in the rolled pool is the same group; it gives up after 4 tries; it needs at least 6 people near; people handed on/off the train keep their look; and children are their own group, so a child in trousers is not counted as trousers. Measured by garment (kids included) within 15 m of the camera, sampled every 10 s: Ibrox platform/saloon 2 of 24 samples over half (max 57 %, 4 of 7; 56 %, 9 of 16); Partick 2 of 21 (62 %, 5 of 8, last 20 s); Cowcaddens ride 4 of 21 (trousers 67 %, 6 of 9; shorts 67 %, 4 of 6; 56 %; 55 %); St Enoch 5 of 23 (saloon trousers 71 %, 5 of 7, for 30 s; 54 %, 21 of 39); `station=buchanan` 4 of 18 (saloon trousers **62 %, 25 of 40**; 61 %, 23 of 38; 57 %, 25 of 44). By the builder's own grouping (children apart, shorts and leggings together as 'bare'), the Buchanan platform was 60-64 % 'bare' for the last 50 s of the run (10 of 18 samples over half). In all: 17 of 107 samples over half, in all five runs. Review 9 had 54-62 % in all four runs. The saloon numbers on 38-44 people show this is not only small-count noise: train hand-overs keep their look and are never re-rolled. | `g/ibx.json`, `g/pk.json`, `g/cow.json`, `cen3.py` |
| 4 | elder_shorts has a different, darker haircut | **True that it differs; it is not darker.** He now has a long grey side-swept fringe over one eye; adult_tie_suit has black spiky hair with grey. They no longer read as one man. (An old man with a fringe over one eye is a slightly odd look.) | `f/x.png`, `f/s.png` (first two) |
| 5 | Not changed: seated dresses, gait, thin brows, tee/shorts/socks template, arm-swing asymmetry | **True.** Seated dresses still ring the knees (`s/D.png`, `l/SL.png` row 3, `l/rk.png` row 2). The instrument on review 9's eight worst walkers gives line-for-line the same numbers: teen_skirt at 1.6 m/s 7.5, LEG 7.1 (p10 5.6), ARM p10 5.1, ARM.sym 50.7-68.9 % on four recordings. | `m/sub.log`, `m/sub_items.log` |

## 2. Status of REVIEW_9's top ten

| # | REVIEW_9 item | Now | Evidence |
|---|---|---|---|
| 1 | Staff vest torn, strap and buckle through a hole | **Fixed on the full model** (small stair-steps on the strap edges at 1 m). **Not fixed on the far model**: shattered silver bands. | `w/vzoom.png`, `w/vfzoom.png` |
| 2 | Seated dresses flare into a ring round the knees | **Not fixed** (not attempted). ya_smile_dress, woman_dress, woman_sash, elder_woman_dress, teen_skirt, girl_small all ring or balloon; elder_woman_dress shows a bright lime underside at the hem. | `s/D.png`, `l/SL.png`, `l/ruckz.png` |
| 3 | Whole-roster gait crouched, jolting worst tenth | **Not fixed** (not attempted); same numbers on the worst eight. | `m/sub.log` |
| 4 | One garment over half within 15 m | **Not fixed in effect.** Still over half in all five runs (up to 62 % of 40 people in a saloon; 60-64 % 'bare' on one platform by the builder's own grouping). | claim 3 |
| 5 | Forearms through lap holdalls and totes | **Fixed** by putting every bag on the floor (0 hands inside a bag, viewer and game). | `bp6_*.log`, `gx/kv.log` |
| 6 | Lookalikes and shared outfits | **Partly fixed.** tie_suit/elder_shorts fixed. Still: the two long-coat women share one coat; ya_ginger_lad/adult_casual2 share a sweatshirt; teen_skirt/woman_mini share top, hair and skirt (from review 9, not re-shot); **man_beard and man_kilt_casual wear the same red jumper** (new find). | `w/coat.png`, `n/B.png` rows 3-4 |
| 7 | Arm-swing asymmetry 50-68 % | **Not fixed.** | `m/sub_items.log` |
| 8 | Faces: smirks, slanted brows, doll skin; staff_woman's scalp | **Not fixed.** Smile still a closed-lip corner pull; ya_spiky and adult_tophat glare; new: sum_crop_denim has a ragged, stepped hairline with skin showing at the left temple; woman_elder's lash lines are heavy black smudges. | `f/s.png`, `f/ns2.png`, `f/z.png` |
| 9 | Seated trains almost all trousers and shorts (12 people may not sit) | **Not fixed.** Seated census, Cowcaddens ride: 60 different sitters, none of the 12 stand-only people; skirts/dresses seated only on elder_woman_dress, woman_dress, woman_sash, ya_smile_dress, teen_skirt, girl_small. | `g/cow.json` `sit` |
| 10 | Small faults: stiff holdall straps on the lap; cushion tote; coat UV stripes; stopping fails 1 in 8 | Lap items gone with the lap. **Coat stripes are not faint:** clear light vertical bands front and back on the full model and broad patches on the far model. Stopping not re-measured (whole roster could not be recorded, see section 5). | `w/coat.png`, `n/F.png` row 1 |

## 3. Per-category reasoning

### 3.1 Walking: 7.0 (typical 8.0, worst 5.5)
- 16 people not in review 9's walking set, standing and at frames 160/168/176/184, front and side (`n/A.png`, `n/B.png`): heel strike, toe-off and swing read in every one; nobody slides in a still.
- Instrument on review 9's eight worst (teen_skirt, ya_ginger_braid, sum_crop_bike, adult_heel_boots, woman_scarf, ya_winter, teen_crop_leggings, woman_puffer): overall 8.84, LEG 7.1 (p10 5.6), ARM p10 5.1, SMO p10 5.7; worst recording teen_skirt at 1.6 m/s = 7.5 (knee 61 deg peak, hip 59, bob 43 mm). Identical to review 9; gait.js has not changed since 2026-11-16.
- The worst tenth is still the crouched, bouncing brisk walk of the young women. Score unchanged.

### 3.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)
- **Fixed:** no hand or forearm inside any bag, in 3,168 viewer poses (both models) or 394 in-game seated samples.
- Bag handles sit in the curled fingers walking (`l/H.png`); the large case is carried on the stair rig by its top handle (`l/st.png`), though at arm's length with no lean of the body away from the weight.
- **Worst:** left/right swing differs by 51-69 % on four of the eight recordings (one arm hangs). In the viewer walks many arms swing very little at 1.3-1.4 m/s (`n/A.png` rows 1, 4).

### 3.3 Faces: 6.9 (typical 7.5, worst 6.0)
- 20 faces at 0.85 m, 12 not in review 9's set, neutral and smiling (`f/x.png`, `f/s.png`, `f/ns2.png`). Age, sex and skin tone read.
- **Faults:** the smile is still a small closed-lip pull that reads as a smirk with the thin slanted brows (adult_tophat, ya_spiky, teen_girl); sum_crop_denim's hairline is stepped with a skin notch at the left temple (`f/z.png` right); woman_elder's lash lines are thick black smudges, the brows thin dashes (`f/z.png` left); skin smooth and doll-like under 1 m.
- Blink: by code (`blink.js`) one blink every 1.8-7.5 s, 0.21 s long, halved on a phone: a human rate. Not watched.

### 3.4 Standing, sitting, behaviour: 7.7 (typical 8.5, worst 6.5)
- **Good:** 0 duplicates in five game runs; no moving overlap under 0.3 m near the player; eye-height views in a moving car look like a real carriage: a row of riders on phones, a case standing in the aisle, bags at feet (`gx/hv40_y2z.png`, `gx/hv95.png`).
- **Worst tenth:**
  - seated dress rings (3.6);
  - shin into rucksack, toes into briefcase (3.7);
  - **A pole-holder stands inside a seated rider**, twice in five runs. Partick: adult_tie_suit holding a pole 0.05 m (centre to centre) from girl seated, for 0.5 s at 13 m. Buchanan: ya_winter holding a pole 0.03 m from woman_sash seated, for 0.5 s at 8.4 m (`g/pk.json`, `g/bch.json` `ov`);
  - Ibrox: adult_fisherman_leggings stood still on the stair in walking mode for 4 s (`g/ibx.json` `stair`, `maxStallGo` 4); review 9 had no stall in 51.

### 3.5 Range of people: 7.16 (typical 7.6, worst 6.5)
- Roster unchanged (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff); good spread of skin tones and heights.
- One lookalike pair fixed (claim 4).
- Still repeated: the shared long coat; the shared sweatshirt; man_beard and man_kilt_casual in the same red jumper (`n/B.png` rows 3-4, `w/coat.png`); the printed-tee/denim-shorts/red-trainer template (boy_shorts in `n/A.png` row 7); seated half of the car almost all trousers and shorts (2.9).

### 3.6 Clothing: 6.7 (typical 7.5, worst 5.5)
- **Better:** the full-model staff vest (claim 1).
- **Mix still over half in every run** (claim 3): trousers 62 % of 40 people in one saloon, 'bare' 60-64 % of one platform for 50 s.
- **Worst tenth:**
  - seated dresses ring and balloon: ya_smile_dress, woman_dress, woman_sash, elder_woman_dress (lime-green underside at the hem), teen_skirt (pleats fan into a disc), girl_small (`s/D.png`, `l/rk.png` row 2);
  - the far-model staff vest's shattered bands (`w/vfzoom.png`);
  - the long coat's light vertical stripes, full and far (`w/coat.png`, `n/F.png` row 1);
  - **new:** man_kilt_casual's knee pokes out through a triangular hole in the front hem of the kilt as he walks (frames 160 and 184) (`n/kz.png`).

### 3.7 Luggage: 7.4 (typical 8.0, worst 6.5)
- **Good:** no lap bags; all eight kinds stand at the feet, handled bags upright beside or between the shins, the wheeled case upright beside the knees; nothing floats or sinks (bag bottoms at floor level in all 3,168 poses). Handles in the hand walking; the case carried by its top handle on the stair rig.
- **Worst:**
  - **floor rucksack through the left shin:** the left shin bone line is inside the rucksack in 132 of 198 full-model poses (66 of 99 people) and 144 of 198 far-model poses (72 people). In the game, 34 different seated riders with a rucksack had a leg point inside it in one 120 s ride (`gx/kv.json` `crossIn`). It shows as the shin vanishing into the side of the bag (`l/ruckz.png`, `l/rk.png` row 1).
  - **Toes into the floor briefcase:** both shoe toes inside the case for adult_lusekofta, adult_oxford_shirt, adult_tophat, elder_man_suit and ya_smile_polo (10 of 198 full, 26 of 198 far). Visible from the side (`l/cs.png` cols 2 and 5).
  - Large case carried one-handed on the stair rig with no lean.

### 3.8 Whole bodies: 6.9 (typical 7.5, worst 6.0)
- **Fixed:** the full-model vest's holes and strap-through.
- **Worst tenth:**
  - far vest shards;
  - dress rings with bare thighs inside;
  - kilt hem with the knee through it;
  - shins into rucksacks;
  - sum_crop_denim's ragged hairline;
  - staff_woman's pale parting (not re-shot; carried from review 9).
  - adult_camo_cap's seated shorts balloon into a large beige bulge behind the seat line (`l/rk.png` row 1, col 3); hidden by the seat in a car.

## 4. Top ten defects, in priority order

1. **Seated dresses and skirts ring and balloon round the knees.** Six people, every sit clip.
   - Reproduce: `node shoot.mjs 0 elder_woman_dress,ya_smile_dress,woman_dress,woman_sash,girl_small none clip-sit-0-30,clip-sitphone-0-30 s/D vlow`.
   - Evidence: `s/D.png`, `l/rk.png` row 2, `l/ruckz.png`.
2. **Gait worst tenth unchanged** (teen_skirt 1.6 m/s = 7.5; LEG p10 5.6; SMO p10 5.7).
   - Reproduce: `node tools/people_motion.mjs --people teen_skirt,ya_ginger_braid,sum_crop_bike,adult_heel_boots,woman_scarf,ya_winter,teen_crop_leggings,woman_puffer --base http://127.0.0.1:8611 --rec DIR`.
   - Evidence: `m/sub.log`, `m/sub_items.log`.
3. **The left shin passes into the floor rucksack** for two thirds of the roster, both models, in the game too.
   - Reproduce: `KINDS=ruck node bp6.mjs 0`; `node shoot.mjs 0 adult_camo_cap,man_student ruck:day clip-sit-0-30 l/rk feet`; `node gseat2.mjs "mode=ride&q=high&line=inner&station=kelvinhall" gx/kv 120`.
   - Evidence: `bp6_0.json`, `l/rk.png`, `gx/kv.json`.
4. **Far-model staff vest:** silver bands shattered into grey triangles, navy notches in the orange.
   - Reproduce: `node shoot.mjs 1 staff_hivis,staff_woman none stand,walk@166,clip-sit-0-30 w/vf body`.
   - Evidence: `w/vfzoom.png`.
5. **Toes into the floor briefcase** for five long-footed men.
   - Reproduce: `node shoot.mjs 0 adult_oxford_shirt,elder_man_suit case clip-sit-0-30 l/cs feet`.
   - Evidence: `l/cs.png`.
6. **Arm-swing asymmetry 51-69 %** with empty hands.
   - Evidence: `m/sub_items.log`.
7. **Garment mix:** one garment still over half of the people within 15 m in all five runs (17 of 107 samples; up to 62 % of 40 people in a saloon, 71 % of 7).
   - The re-roll fires only when the whole rolled pool is one group, gives up after 4 tries, skips hand-overs (the saloons) and does not count children's trousers as trousers.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan" g/bch 150`, `python3 cen3.py g/bch.json` and `python3 cen2.py g/bch.json`.
8. **Long coat stripes and shared outfits.**
   - elder_woman_coat's light vertical bands, full and far.
   - The same coat on ya_winter, the same sweatshirt on two men, and the same red jumper on man_beard and man_kilt_casual.
   - Evidence: `w/coat.png`, `n/F.png`, `n/B.png`.
9. **Faces:** smirk smiles and glaring brows; sum_crop_denim's ragged hairline; woman_elder's smudged lash lines; doll-smooth skin.
   - Reproduce: `node face.mjs man_elder,woman_elder,girl,boy_small,adult_tophat,adult_suit_bun,man_beard,ya_knit,adult_harem,sum_crop_denim,teen_tube,woman_midi f/n2 "0.3:0" 0`.
   - Evidence: `f/ns2.png`, `f/z.png`.
10. **Small faults:**
    - the knee through man_kilt_casual's kilt hem when walking (`n/kz.png`);
    - stair-stepped strap edges on the full-model vest at 1 m (`w/vzoom.png`);
    - a pole-holder standing inside a seated rider for 0.5 s, twice in five runs (`g/pk.json`, `g/bch.json`);
    - one 4 s stair stall (`g/ibx.json`);
    - seated shorts ballooning behind (`l/rk.png`).

## 5. What I could not observe

- **No motion watched.** Walking judged from stills at frames 160-184 and the instrument.
- **Whole-roster instrument not re-run.** The machine's disk filled (`ENOSPC`) at 757 recordings, so that run was abandoned and deleted. I re-measured review 9's eight worst walkers instead; their numbers are identical, and gait.js is unchanged. The whole-roster figures (9.23, TRN p10 3.3) are carried from review 9, not re-measured.
- **Blink and smile timing:** read from code, not watched.
- **Viewer `sitalt` clips** spawn in stand mode, so the rucksack stays on the back; I left sit_look and sit_cross_legs out of the floor-bag census (they appear in the game census).
- My in-game close-shot camera in `gseat2.mjs` points out of the car (as in review 9); those images (`gx/kv_*.png`) show nothing and were not used. The `gview.mjs` face crops at 2 m (`gx/hvf40.png`) frame the hair, not the face, and were not used.
- **Not seen:** a wheeled case on a real stair (viewer stair rig only).
- **Not deterministic:** game runs differ per page load.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Staff vest, full and far, stand / walk 166 / sit_idle | staff_hivis, staff_woman | `w/vz.png`, `w/vzoom.png`, `w/vf.png`, `w/vfzoom.png` |
| 16 people not in review 9's walking sets: stand and walk 160/168/176/184, F and S | adult_baggy_knit, adult_camo_cap, adult_fisherman_leggings, adult_oxford_shirt, adult_runner, adult_suit_bun, boy_shorts, elder_man_cap, elder_man_suit, elder_woman_coat, man_beard, man_kilt_casual, sum_crop_bike, teen_tube, woman_midi, ya_knit | `n/A.png`, `n/B.png`, `n/kz.png` |
| Far model stand / walk / sit | elder_woman_coat, man_kilt_casual, ya_smile_dress, teen_skirt, woman_puffer, adult_tattoo_muscle, girl_small, man_longcoat | `n/F.png` |
| 20 faces at 0.85 m, neutral and smiling | 8 in `f/x_list.txt`, 12 in `f/n2_list.txt` | `f/x.png`, `f/s.png`, `f/ns2.png`, `f/z.png` |
| Seated bags at the feet, 7-8 kinds | elder_woman_dress, man_student, ya_smile_dress, adult_smile_blouse, teen_ginger, adult_camo_cap, teen_skirt, adult_oxford_shirt, elder_man_suit | `l/S.png`, `l/SL.png`, `l/ruckz.png`, `l/rk.png`, `l/cs.png` |
| Floor-bag geometry: all 99 x {sit_idle, sit_phone} x 8 kinds, both models (shin, foot, toe, thigh and hand points tested against each bag's own box) | all | `bp6.mjs`, `bp6_0.json`, `bp6_1.json`, `bp6_*.log` |
| Hands with bags walking; stair carry | elder_man_suit, teen_tube, adult_runner; woman_scarf, adult_tie_suit, teen_tube | `l/H.png`, `l/st.png` |
| Seated dresses, two sit clips, low view | elder_woman_dress, ya_smile_dress, woman_dress, woman_sash, girl_small | `s/D.png` |
| Walking instrument, review 9's eight worst | listed in 3.1 | `m/sub.log`, `m/sub_items.log` |
| Game `gp8.mjs` (overlaps, duplicates, stairs, sit census, garment census within 15 m) | Ibrox outer explore 150 s; Partick inner explore 150 s; ride from Cowcaddens outer 150 s; St Enoch inner explore 150 s; `station=buchanan` inner explore 150 s | `g/ibx.json`, `g/pk.json`, `g/cow.json`, `g/ste.json`, `g/bch.json`, `cen2.py`, `cen3.py` |
| Game seated bags, hands, legs (`gseat2.mjs`) | ride from Kelvinhall inner 120 s (394 samples) | `gx/kv.log`, `gx/kv.json` |
| Game eye-height views inside a moving car | ride from Hillhead outer, t = 40 s and 95 s | `gx/hv40.png`, `gx/hv40_y2z.png`, `gx/hv95.png` |

New scripts in `$R`: `bp6.mjs` (floor-bag limb test in the bag's own frame; `KINDS=` env), `cen3.py` (garment census by garment, children included), and `shoot.mjs` gained `feet` and `vlow` views centred on the knee. Next round, look at:
- the rucksack and briefcase floor placement;
- seated dresses after any fix;
- the whole roster on the instrument (it needs about 1 GB of free disk);
- a wheeled case on a real stair.

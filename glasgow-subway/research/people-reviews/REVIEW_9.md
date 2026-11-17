# Under Glasgow: independent review of the people (review 9)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611 (people.glb, people_lod.glb dated 2026-11-17 16:47, people_meta.json 16:45). Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 6.9 (6.95). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review9/`. In viewer stills, `_F` = front quarter, `_S` = side, `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 5.5 | **7.0** |
| 2 | Arms and hands | 10 | 8.0 | 6.0 | **7.2** |
| 3 | Faces | 10 | 7.5 | 6.0 | **6.9** |
| 4 | Standing, sitting, behaviour | 10 | 8.5 | 6.5 | **7.7** |
| 5 | Range of people | 10 | 7.5 | 6.5 | **7.1** |
| 6 | Clothing | 15 | 7.0 | 5.0 | **6.2** |
| 7 | Luggage | 10 | 8.0 | 6.0 | **7.2** |
| 8 | Whole bodies | 15 | 7.5 | 5.5 | **6.7** |
| | **Weighted mean** | 100 | | | **6.9** (6.945) |

0.20x7.0 + 0.10x7.2 + 0.10x6.9 + 0.10x7.7 + 0.10x7.1 + 0.15x6.2 + 0.10x7.2 + 0.15x6.7 = 1.40 + 0.72 + 0.69 + 0.77 + 0.71 + 0.93 + 0.72 + 1.005 = 6.945.

In one line: real progress on behaviour (alighters no longer walk through each other, far-model lap bags sit on the lap, no kilt or broken skirt is seated, no phone over a lap bag), but the staff vest is still torn on both models, seated dresses balloon into rings, one garment is still over half of the people within 15 m in every run, forearms go through lap holdalls, and the first whole-roster walking run shows a worse worst tenth than the default six ever did.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Far-model seated lap bags no longer rise to the chin; tall shoppers and carriers go on the floor | **True.** Viewer, far model, all 99 x {sit_idle, sit_phone} x 7 bag kinds (1,386 poses): 5 have the bag top within 15 cm of the head bone, all holdall or case on the three smallest children (boy_small, girl_small, adult_piper). Review 8 found 32 of 52. Shoppers and carriers stand at the feet in 392 of 396 poses. In two game rides, 0 lap bags reached the face (6,882 and 355 seated samples). | `bp5_1.json`, `bp4.mjs 1 clip` (0 of 52), `l/F.png`, `l/teen_skater.png` row 4, `gx/kv.json` (`lapFace` 0), `gx/hh.json` (`faceBag` 0) |
| 2 | Alighters keep a 0.32 m core and edge round people | **True.** Overlaps under 0.3 m (centre to centre) on platforms: Partick 0; Buchanan St 0; Ibrox 0.22 m for one 0.1 s frame at 3.5 m; Cowcaddens (ride run) 0.14-0.17 m for 0.2 s at 22 m. Review 8: 0.06-0.25 m for up to 1.8 s at 2.4-3.3 m. No stair stalls in 51 stair walkers. | `g/pk.json`, `g/ibx.json`, `g/bch.json`, `g/cow.json` (`ov`, `stair`) |
| 3 | No garment group over half the people within 15 m | **False.** The 45 % re-roll counts the whole crowd, not the people near the player, and passengers handed on and off the train bypass it. Most common garment within 15 m: Ibrox platform trousers 60-62 % (8 of 13, 9 of 15) for the last 60 s of the run; Partick saloon trousers 54 % (14 of 26) and 62 % (5 of 8); Buchanan St saloon trousers 54 % (13 of 24); Cowcaddens platform trousers 55 % (6 of 11) and shorts+leggings 60 % (6 of 10). Better than review 8 (62-80 %), but over half in all four runs. | `g/*.json` `cen`; `cen.py`, `cen2.py` |
| 4 | Kilt wearers, woman_mini, adult_beret no longer sit | **True.** None of the 12 stand-only people was seen seated in five runs (`sit` census in `g/*.json`; `forb` {} in `gx/kv.json`). Side effect: see 3.5. | `g/*.json`, `gx/kv.json` |
| 5 | No seated phone with a lap bag; no crossed legs with a bag at the feet | **True, measured geometrically.** In the game, sit_phone only ever pairs with a floor bag (rucksack, carrier, shopper, trolley): 0 cases of a phone with a bag actually on the lap (bag bottom above pelvis - 0.2 m) in the Hillhead ride; in the Kelvinhall ride sit_phone appeared only with ruck/carrier/shopper/trolley. sit_cross_legs appears with lap bags and with **a wheeled trolley at the side** (39 samples at Kelvinhall, 8 at Hillhead); I did not see a leg through a trolley. | `gx/kv.json` `combo`, `gx/hh.json` `combos`, `g/cow.json` |
| 6 | Long coats camel and navy; ya_ginger_lad's suit and woman_mini's top recoloured | **True as recolours; the pairs still read as pairs.** elder_woman_coat is camel, ya_winter navy, but it is visibly the same coat cut, belt and pocket, and the UV-island bands still show as lighter vertical stripes (weaker than in review 8). ya_ginger_lad (green) and adult_casual2 (purple) still wear the same sweatshirt with the same round chest logo. woman_mini's top is now a dark violet; with teen_skirt's pink paisley top, the same long black hair and the same pleated mini, the two still read as one outfit. | `w/coat.png` (rows 1-2 full and far, rows 3-4, rows 5-6) |
| 7 | Staff vest cut with plane cuts; dungaree suit deleted under it; far vest pushed out | **False on what a player sees.** Full model: the top edge is still jagged, with orange tongues and navy notches; the reflective bands have stepped, torn edges and dark holes; a navy dungaree strap **with its black buckle** still shows across staff_hivis's chest through a hole in the vest; an orange flap still stands off the left shoulder when walking. Far model: navy patches through the upper vest, front and back, and a patchwork across the shoulders when seated. | `w/vzoom.png`, `w/vz.png`, `w/vf.png` |
| 8 | Gait, eyebrows, tee/shorts/socks template unchanged | **True.** Default six: 9.30, identical to review 8, line for line. Whole roster (first time run by a reviewer): 9.23, see 3.1. | `motion_run.log`, `motion_all.log`, `motion_all_items.log` |

## 2. Status of REVIEW_8's top ten

| # | REVIEW_8 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated kilts, thighs through the front | **Fixed by removal.** Kilt wearers stand. The same fault remains on seated dresses (new item 2). | `g/*.json`, `s/Lz.png` |
| 2 | Full-model staff vest torn | **Not fixed.** Torn edges, holes, dungaree strap and buckle showing, shoulder flap. Far vest patchy too. | `w/vzoom.png`, `w/vf.png` |
| 3 | Far-model lap bags at the chin | **Fixed.** | `bp5_1.json`, `l/F.png` |
| 4 | Gait unchanged | **Not fixed** (not attempted). Whole roster shows a crouched worst tenth. | `motion_all.log` |
| 5 | Alighters walk through each other | **Fixed** to within rubric noise (one 0.1-0.2 s brush per run, none near the player). | `g/*.json` |
| 6 | One garment over half a platform | **Partly fixed.** 54-62 % now, against 62-80 %; still over half in every run. | `g/*.json` `cen` |
| 7 | adult_beret's seated skirt; woman_mini's balloon | **Fixed by removal** (they stand). | `g/*.json` |
| 8 | Hands and phones through lap bags; leg through floor rucksack | **Phones fixed. Hands not:** forearms pass into lap holdalls and totes (full and far model, viewer and game). No leg-through-rucksack seen. | `l/H.png`, `gx/sbz.png`, `gx/kv.json` `handIn` |
| 9 | Long coats as striped bathrobes; identical coats | **Partly fixed.** Two colours now; the stripes are fainter but still there; same coat. | `w/coat.png` |
| 10 | Faces and repeated looks | **Not fixed.** Brows, smirks, staff_woman's scalp unchanged; a new lookalike pair found (new item 6). | `f/n.png`, `f/s.png`, `f/z.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.0 (typical 8.0, worst 5.5)
- 47 people not leaned on in review 8's "new people" set, standing and at walk frames 160/168/176/184, front and side: heel strike, toe-off and swing read in every one; adult_heel_boots and ya_tube_heels walk credibly in heels (`n/A1.png`, `n/A2.png`, `n/B1.png`, `n/B2.png`, `n/zS.png`).
- Instrument, default six: 9.30, unchanged.
- **Instrument, whole roster (99 people, 5 speeds, all scenarios): 9.23, gate NOT met.** LEG 7.5 (p10 5.3), ARM p10 5.1, SMO p10 6.9, **TRN p10 3.3**, worst recording teen_skirt at 1.6 m/s = 7.5.
  - teen_skirt at 1.6 m/s: knee 46 deg at loading and 31 deg at mid-stance (scored 0 and 0), pelvis vertical acceleration 15 m/s², tremor 3.6 mm. That is a visibly crouched, bouncing walk.
  - ya_ginger_braid 1.6 (7.6), sum_crop_bike 1.2 (7.7), adult_heel_boots 0.4 (7.9) are the next worst.
  - Mean knee at mid-stance across the roster is 19.9 deg (6.3), worse than the 17.3 the default six show.
  - TRN items (stopping deceleration, settle, slide, stance) each score 8.8 mean, which is pass/fail: about one start/stop in eight fails.
- The worst tenth is therefore a crouched, jolting walk on the young women at brisk speed, which is common on a platform.

### 3.2 Arms and hands: 7.2 (typical 8.0, worst 6.0)
- Arm swing reads in every walk still. Handles sit in the fingers for 10 bag kinds on two new bodies (`l/teen_skater.png`, `l/woman_scarf.png`).
- In-game phones: 787 full-model phone samples (Ibrox ride), none within 0.22 m of the head except calls at the ear; nearest seated texter 0.40 m (`gx/ib.log`).
- **Worst cases:**
  - Forearms through lap holdalls: adult_smile_blouse and teen_ginger, sit_idle, full model in the viewer (`l/H.png` side views) and teen_ginger on the far model in the game at 12.9 m, both wrists inside the bag (`gx/sbz.png` left pair). In the Kelvinhall ride adult_smile_blouse had a hand inside her holdall in 195 one-second samples (`gx/kv.json` `handIn`); ya_tattoo_tank's hand was inside a tote for 33.
  - Whole-roster ARM.sym: left/right swing differs by 50-68 % on ten recordings (teen_skirt, ya_ginger_braid, sum_crop_bike, teen_crop_leggings, woman_scarf, ya_winter, woman_puffer, woman_bob, adult_vneck) with no bag in the hand: one arm hangs while the other swings (`motion_all_items.log` lines 592-720).

### 3.3 Faces: 6.9 (typical 7.5, worst 6.0)
- 20 faces at 0.85 m, 16 not in review 8's face set, neutral and with full smile (`f/n.png`, `f/s.png`). Age, sex and skin tone read correctly.
- **Faults:**
  - The smile is a small closed-lip pull at the corners; with the thin slanted brows many read as smirks or sneers (ya_spiky reads as glaring, `f/z.png` middle).
  - **adult_tie_suit and elder_shorts have the same grey spiky hair and very nearly the same face** (`f/z.png` left two). On a platform they would read as one man in two outfits.
  - staff_woman's scalp shows pale at the parting and temples (`f/z.png`, fourth).
  - Faces are smooth and doll-like at under 1 m.
- Blink rate and smile timing not measured.

### 3.4 Standing, sitting, behaviour: 7.7 (typical 8.5, worst 6.5)
- **Good:** 0 duplicates in four game runs; no pass-through near the player; 51 stair walkers with no stall; clip-change rates 1.8-2.3 per person-minute; nobody who should stand was seated; no phone over a lap bag; seated riders sit in the seats (`gx/sb.png`).
- **Worst tenth:** seated dress wearers whose dress forms a ring round the knees (3.6); forearms through lap bags (3.2).

### 3.5 Range of people: 7.1 (typical 7.5, worst 6.5)
- Roster unchanged: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff; good spread of skin tones and heights.
- **Repeated looks:** printed tee, shorts and white trainers/socks on sum_shorts_asian_m, elder_shorts, adult_cyclist, girl_shorts, teen_skater and others (`n/A2.png` row 8, `n/B1.png` row 4, `n/B2.png`); three black hoodies over dark trousers (man_hoodie, teen_hood, teen_girl, `n/B1.png` rows 1, 8, 9); the shared coat, sweatshirt and top/hair pairs (claim 6); the new grey-haired lookalike pair (3.3).
- **Side effect of claim 4:** 10 of the 16 skirt, dress and kilt wearers, plus the two long-coat women, may not sit. Only six skirt or dress wearers can still be seated (woman_dress, ya_smile_dress, elder_woman_dress, woman_sash, teen_skirt, girl_small), so the seated half of every car is almost all trousers and shorts.

### 3.6 Clothing: 6.2 (typical 7.0, worst 5.0)
- **Staff vest still torn on both models** (claim 7). Staff sit and stand in cars at arm's length.
- **Seated dresses balloon into rings.** elder_woman_dress (sit_idle), ya_smile_dress (sit_idle and sit_phone) and teen_skirt (sit_cross_legs): the hem flares into a horizontal ring at knee height, the bare thighs sit inside it, and a dark gap shows between the thighs and the cloth. Seen in the viewer (`s/Lz.png`) and in the game on ya_smile_dress at 10.5 m (`gx/sbz.png` right pair). woman_dress's crossed shin carries a black band (`s/Lz.png`, right).
- **Mix over half within 15 m in all four runs** (claim 3).
- Long coats: same coat twice, stripes fainter (claim 6).
- Fixed this round by not seating them: kilts, adult_beret's skirt, woman_mini's mini.

### 3.7 Luggage: 7.2 (typical 8.0, worst 6.0)
- **Good:** ten kinds hang right standing, walking and on the stair rig (`l/teen_skater.png`, `l/woman_scarf.png`); shoppers and carriers on the floor and rucksacks between the feet when seated; far-model lap bags on the lap (`l/F.png`); a black handbag stands on ya_ginger_long's lap in the game (`gx/sb.png` row 4).
- **Worst:** forearms through lap holdalls and totes (3.2). The holdall's carry straps stand up stiffly in an arch above it when it lies on a lap (`l/H.png` row 1). The tote on a lap reads as a beige cushion with no handles visible (`l/H.png`). woman_scarf given `ruck:day` or `ruck:hike` gets a tote instead (`l/woman_scarf.png` cols 6-7; may be deliberate, for her long hair).
- Not seen: a wheeled case on a real stair.

### 3.8 Whole bodies: 6.7 (typical 7.5, worst 5.5)
- No missing limbs, no scalp through hair except staff_woman, no broken faces in 47 new walkers on the full model and the far-model seated set.
- **Worst tenth:** the torn vest (both models), the dress rings, forearms through bags.

## 4. Top ten defects, in priority order

1. **Staff vest still torn, with the dungaree strap and buckle showing through.**
   - Full model: jagged top edge, castellated bands with holes, a navy strap and black buckle across staff_hivis's chest through a hole, an orange flap off the left shoulder when walking. Far model: navy patches through the vest, worst on the back when seated.
   - Reproduce: `node shoot.mjs 0 staff_hivis,staff_woman none stand,walk@166,clip-sit-0-30 w/vz chest` (and `1` for the far model, `w/vf`).
   - Evidence: `w/vzoom.png`, `w/vz.png`, `w/vf.png`.
2. **Seated dresses flare into a ring round the knees** with the bare thighs inside and a dark gap.
   - Who: ya_smile_dress, elder_woman_dress, teen_skirt (cross-legged); a black band on woman_dress's crossed shin.
   - Reproduce: `node shoot.mjs 0 elder_woman_dress,teen_skirt,woman_dress,woman_sash,ya_smile_dress none clip-sit-0-30,clip-sitphone-0-30,clip-sitalt-0-30,clip-sitalt-1-30 s/L body`; in the game `node gt9.mjs "mode=ride&q=high&line=outer&station=hillhead" gx/sb 40 "."`.
   - Evidence: `s/Lz.png`, `gx/sbz.png`.
3. **Whole-roster gait: crouched, jolting worst tenth.** 9.23; LEG p10 5.3, ARM p10 5.1, SMO p10 6.9, TRN p10 3.3; teen_skirt at 1.6 m/s has knee 46 deg at loading and 31 deg in mid-stance.
   - Reproduce: `node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec DIR`, then `--from DIR --items --worst 15`.
   - Evidence: `motion_all.log`, `motion_all_items.log`.
4. **One garment is still over half of the people within 15 m** in every run (54-62 %). The rule counts the whole crowd, and train hand-overs skip it.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=outer&station=ibrox" g/ibx 150`, `python3 cen2.py g/ibx.json`.
   - Evidence: `g/ibx.json`, `g/pk.json`, `g/bch.json`, `g/cow.json`.
5. **Forearms and hands pass through lap holdalls and totes**, full and far model, in the game.
   - Who: adult_smile_blouse (195 samples in one ride), teen_ginger, ya_tattoo_tank, adult_fisherman_leggings, teen_hippy.
   - Reproduce: `node shoot.mjs 0 adult_smile_blouse,teen_ginger holdall,tote clip-sit-0-30 l/H legs`; `node gseat2.mjs "mode=ride&q=high&line=outer&station=hillhead" gx/hh 120` (`handIn`).
   - Evidence: `l/H.png`, `gx/sbz.png`, `gx/kv.json`.
6. **Lookalikes and shared outfits:** adult_tie_suit and elder_shorts share hair and face; adult_casual2 / ya_ginger_lad share a sweatshirt and logo; teen_skirt / woman_mini share top, hair and skirt; the two long-coat women share one coat; three black hoodies.
   - Reproduce: `node face.mjs adult_tie_suit,elder_shorts f/x "0.3:0" 0`; `node shoot.mjs 0 elder_woman_coat,ya_winter,ya_ginger_lad,adult_casual2,woman_mini,teen_skirt none stand,walk@166 w/c`.
   - Evidence: `f/z.png`, `w/coat.png`, `n/B1.png`.
7. **Arm swing asymmetry 50-68 %** on ten whole-roster recordings with empty hands.
   - Evidence: `motion_all_items.log` (ARM.sym).
8. **Faces: smirks and slanted brows, doll-smooth skin; staff_woman's scalp.**
   - Reproduce: `node face.mjs ya_spiky,staff_woman,man_commuter f/y "0.3:0" 1`.
   - Evidence: `f/s.png`, `f/z.png`.
9. **Seated trains are almost all trousers and shorts**, because 12 skirt, dress, kilt and long-coat wearers may not sit. Making those garments sit properly is the real fix for items 1-2 of review 8 and item 2 here.
   - Evidence: `js/sim/people.js` `_canSit`; `g/*.json` `sit`.
10. **Small faults:** the holdall straps stand up stiff when it lies on a lap; the lap tote reads as a cushion; the long coats keep faint UV stripes; stopping fails the instrument on about one in eight stops (TRN).
    - Evidence: `l/H.png`, `w/coat.png`, `motion_all.log`.

## 5. What I could not observe

- **No motion watched.** Walking judged from stills at frames 160-184, the whole-roster instrument and the game traces.
- **Blink rate and smile timing** were not measured.
- **The viewer's `sitalt` clips spawn in stand mode;** I judged their poses from those stills and from the game.
- **No wheeled case on a real stair.**
- My first in-game eye-height shooter (`gseat.mjs`, `gseat2.mjs` close shots) pointed the camera out of the car; those images (`gx/kv_eye*.png`, `gx/hh_*.png`) show nothing and were not used. `gx.mjs` and `gt9.mjs` shots were used instead.
- **Not deterministic:** game runs and viewer bag rolls differ per page load.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| 47 people not in review 8's new-people set: stand and walk 160/168/176/184, F and S | lists in `n/A.ids`, `n/B.ids` | `n/A1.png`, `n/A2.png`, `n/B1.png`, `n/B2.png`, `n/zS.png` |
| Staff vest, full and far, stand / walk 166 / sit_idle | staff_hivis, staff_woman | `w/vz.png`, `w/vf.png`, `w/vzoom.png` |
| Coats and recoloured pairs, full and far | elder_woman_coat, ya_winter, ya_ginger_lad, adult_casual2, woman_mini, teen_skirt | `w/coat.png` |
| Every dress and skirt wearer still allowed to sit, four sit clips | elder_woman_dress, girl_small, teen_skirt, woman_dress, woman_sash, ya_smile_dress | `s/L.png`, `s/Lz.png` |
| 20 faces neutral and smiling at 0.85 m | listed in `f/n.log` | `f/n.png`, `f/s.png`, `f/z.png` |
| Luggage: 10 kinds x stand / walk / stair / sit | teen_skater, woman_scarf | `l/teen_skater.png`, `l/woman_scarf.png` |
| Far-model seated bags, sit_idle and sit_phone | man_student, ya_ginger_long, elder_shorts | `l/F.png` |
| Lap-bag height and hands in bag, all 99 x 2 sit clips x 7 kinds, far model | all | `bp5.mjs`, `bp5_1.json` |
| Hands in lap holdall/tote, full model | adult_smile_blouse, teen_ginger, adult_fisherman_leggings | `l/H.png` |
| Walking instrument: default six and whole roster | 6 and 99 | `motion_run.log`, `motion_all.log`, `motion_all_items.log` |
| Game, `gp7.mjs`/`gp8.mjs` (overlaps, duplicates, stairs, sit census, garment census) | Partick inner 150 s; Ibrox outer 150 s; Buchanan St inner 150 s; ride from Cowcaddens outer 150 s | `g/*.json`, `g/*.log` |
| Game, seated combos (clip x bag), forbidden sitters, hands in bags | ride from Kelvinhall inner 120 s (6,882 seated samples); ride from Hillhead outer 120 s | `gx/kv.json`, `gx/hh.json` |
| Game, close shots of 12 seated riders | ride from Hillhead outer | `gx/sb.png`, `gx/sbz.png` |
| Game, eye-height car views and phone distances | ride from Ibrox inner | `gx/ibe.png`, `gx/ib.log` |

New scripts in `$R`: `bp5.mjs`, `gp8.mjs` (census with id, state, bag and clip), `cen.py`, `cen2.py`, `gseat.mjs`, `gseat2.mjs`, `gt9.mjs` (seated only), `pools.mjs`. Next round, look at: seated dresses after any fix, the whole-roster instrument again, a wheeled case on a real stair, blink and smile timing.

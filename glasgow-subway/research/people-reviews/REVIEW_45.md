# Under Glasgow: independent review of the people (review 45)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `7cf93f03`. The people commits since review 44 (read-only `git show`):
- `fc5ee1ed`, `js/sim/people.js`:
  - `_place`: into or out of a sit (`state === 'sit'` or `wasSit`, while the crossfade runs), the body's height is `yFrom + (target - yFrom) x w`, where `w` is the crossfade's progress. The old 25 %-per-frame ease applies only outside a sit transition.
  - The near/far model swap is held back while a sit or rise crossfade runs.
- `7cf93f03`, `js/sim/haggis.js`: the lead is 10 short pieces along a parabola as long as the 1.25 m lead. Any slack is clamped to the floor.
- No model, face, gait or bag file changed. `_canSit` is unchanged.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks, and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review45/`. Running notes are in `NOTES.md`. The container restarted once, part-way through; the run lost then (`n1`, `n3`) is listed under section 5.

**Result: weighted mean 8.25 (8.253). Gate NOT met.** The mean is not above 9. Every category is now at 8 or above.

- **Sitting down and getting up are fixed where review 44 found them broken.**
  - Across 9 settles at 60 Hz on three stations, no foot went under the floor (the lowest was 1.7 cm).
  - Nobody sat on air.
  - The model swap came only after the crossfade had finished.
  - Across 5 rises, no foot lifted above its standing height.
- **What is left in the sit-down:**
  - The feet skate 15-25 cm across the floor in every settle, and 50 cm in one.
  - Someone who sits down while texting puts the phone away. Their hands then fly up beside the face, and they sit in the phone pose holding nothing for more than 1.4 s.
- **The haggis lead now hangs as a smooth curve.** It also passes straight through seated riders.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.3 | **8.20** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 8.9 | 7.6 | **8.38** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.6 | **8.32** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.25** (8.253) |

0.20x8.16 + 0.10x8.20 + 0.10x8.32 + 0.10x8.38 + 0.10x8.30 + 0.15x8.24 + 0.10x8.32 + 0.15x8.22 = 1.632 + 0.820 + 0.832 + 0.838 + 0.830 + 1.236 + 0.832 + 1.233 = 8.253.

Changes against review 44 (8.185):
- **Behaviour +0.50.** Nobody sinks through the floor, sits on air or floats on rising any more. The feet still skate during the sit-down.
- **Luggage +0.12.** No bag sinks into the floor during a sit-down. Bags at the feet still go through shins as people sit.
- **Whole bodies +0.12.** Legs no longer vanish into the floor. In exchange, the far model stays in use at 6-7 m for about 0.9 s, and its swap to the near model is a visible texture pop.
- **Arms -0.12.** Phone put away mid-sit, then hands raised with no phone (`n5/CD.png`).
- **Walking, Faces, Range and Clothing are unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Into and out of a sit, the height follows the crossfade; feet no longer sink while sitting down or float while getting up | **True.**<br>- **Settles** (60 Hz, my own `gsink4/6`, which also logs foot slide and the model in use). Hillhead inner: `teen_skater`, `ya_smile_dress`, `woman_elder`, `woman_bob`. Kelvinhall outer: `teen_skater`, `teen_boy`, `sum_tube_denim`, `ya_smile_polo`, `sum_crop_denim`. The lowest foot or toe bone stayed 1.7-3.6 cm above the floor at its lowest, and never higher than its standing height of 8-10 cm.<br>- **The pelvis comes down in a straight line** from 0.40-0.49 m above the seat to the seat over 1 s. The knees bend as it drops (`n4/BOB.png`, `s3/TBfront.png`).<br>- **Rises:** `adult_baggy_knit` (near model, 4.1 m), `adult_vneck`, `boy_small` (2 m), `sum_loose_shorts_w`. The feet stayed at 1.7-10.9 cm, with no float (`s2/BKfront.png`).<br>- **New residual: the feet skate.** The root is tweened to the seat while the feet are on the floor, so the feet slide 15-25 cm in every settle. `teen_boy`'s hips started 0.74 m from his seat, and his feet slid 50 cm as he turned and sat. | `an.py` over `s1/`, `s2/`, `s3/`, `n4/`, `n5/` logs |
| 2 | Nobody is swapped mid-transition; a near boarder no longer sits on air | **True.**<br>- **When the swap came:** in all 5 settles that ended in a swap, it came at frame 53-54, at a crossfade weight of 0.98-1.0. The pelvis moved 0-11 mm and the foot 1-5 mm across it.<br>- **No one sat on air:** `woman_bob` at 6.9 m and `sum_crop_denim` at 7 m went down smoothly onto the seat.<br>- **Cost:** the far model is kept at 6.4-7 m for about 0.9 s. The swap then shows as a texture pop: `woman_bob`'s sweater goes from smooth to knit (`n4/BOB.png`, frames 07 to 08). | `n4/log.txt`, `n5/log.txt`, `s3/log.txt` |
| 3 | Not changed: brisk crouch, heel wearers, mouths, white eye, kilt gap, turn-aways, pole hands, bursts, phones in hair, hair, far holes, `ya_smile_dress` hem | **Confirmed where re-checked.**<br>- **Walking instrument on 6 people not measured before** (`sum_crop_bike`, `elder_shorts`, `man_highland`, `adult_heel_boots`, `girl_shorts`, `adult_tie_suit`): overall 9.37; LEG p10 6.4, ARM p10 7.4, SMO p10 7.5, STR p10 7.7. Worst: `adult_heel_boots` at 1.9 m/s, 7.9.<br>- **Faces:** 14 people, 12 of them not looked at in review 44 (`f/N.png`, `f/S.png`). Same kind of faults as before. | `m/rec.log`, `f/` |
| 4 | (Mid-review) The haggis lead is a smooth hanging curve | **True for the shape.**<br>- On the Partick platform, standing and boarding, it hangs in a gentle curve and reads as a lead (`e/PETs.png`; `leadLen` 0.42-1.07 m).<br>- **Fault:** it has no collision. In the builder's own car stills (`mine/lead/S.png`, row 4 frame 2, row 5 frames 3-4), it runs through a seated boy's thigh and through a seated woman's legs. | `e/pet.log` |

## 2. Status of REVIEW_44's top ten

| # | REVIEW_44 item | Now |
|---|---|---|
| 1 | Near boarders sit on air | **Fixed.** The swap waits for the crossfade to end (`n4`, `n5`). |
| 2 | Far sit-downs sink through the floor; holdall sinks | **Fixed.** Lowest foot 1.7 cm or more above the floor in 9 of 9 settles. No bag sank. |
| 3 | Stand-up floats | **Fixed.** No foot above its standing height in 5 of 5 rises. |
| 4 | Brisk-walk crouch / heel wearers | **Unchanged.** LEG p10 6.4 on the new set of 6; `adult_heel_boots` worst at 7.9. |
| 5 | `ya_smile_dress`'s seated hem | **Not re-shot near (code unchanged).** Her far model at 12.9 m sits with a stiff flared hem and one knee raised high (`s1/SD.png`). |
| 6 | Resting mouths and smiles; pale eye | **Unchanged.** `adult_camisole` and `adult_suit_bun` pout at rest. `elder_woman_coat` is downturned. `ya_smile_dress`'s smile pushes the lower lip out. `adult_smile_blouse` is crooked. `man_longcoat`'s eyes are pale (`f/N.png`, `f/S.png`). |
| 7 | Aisle walkers through seated knees; hands raised without a phone after sit-down | **The phone part is still there, by a new route.** The phone is put away during the sit and the phone pose shows empty (`n5/CD.png`; `s3/SKfront.png`, `s3/SK2.png`; `s1/SD.png` `woman_elder`). Knee passing not re-measured. |
| 8 | Kilt opens mid-stride; `woman_sash` sack | Unchanged code; not re-shot. |
| 9 | Turn-aways; 56 % shorts sample | Census at Cowcaddens inner ride: 0 of 20 saloon and 0 of 8 platform samples over 50 %; the highest was 50 % trousers. No far model within 6 m, no duplicates, no overlaps (`g/cc.json`). |
| 10 | Hair, far tops, lead V | **The lead V is fixed.** Hair is unchanged: `teen_hippy` and `sum_shorts_asian_m` wear helmet-like caps of hair with a hard hairline (`f/N.png`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- No gait change.
- A fresh set of 6 people scores lower than the default 6 did: 9.37 overall against 9.54.
  - LEG p10 is 6.4.
  - `adult_heel_boots` at 1.9 m/s scores 7.9.
- The foot skate during a sit-down (15-50 cm) is counted under Behaviour.

### 3.2 Arms and hands: 8.20 (typical 8.8, worst 7.3)
- **`sum_crop_denim`** was texting while standing, then sat down.
  - The hold weight falls from 0.6 to 0 and the phone vanishes.
  - Her hands then rise to either side of her face with the fingers spread (frames 02-04).
  - She then sits in the `sit_phone` clip with the hold at 0 for at least 1.4 s, cupping nothing.
  - She was 7 m from the game camera (`n5/CD.png`, `n5/log.txt` hold column).
- **`teen_skater`** (Kelvinhall outer) sat with one hand at his nose and the other raised, palm up, with no phone (`s3/SK2.png`).
- **`woman_elder`** showed the same (`s1/SD.png`, last two frames).
- That is 3 of 11 sit-downs.
- Rises are clean: `adult_baggy_knit`'s phone goes away as she stands.

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- **14 faces at 0.6 m, neutral and smiling.**
- **Good:** gentle smiles read naturally on `woman_bob`, `teen_girl`, `man_beard` and `sum_crop_denim`.
- **Faults:**
  - pouting resting mouths: `adult_camisole`, `adult_suit_bun`;
  - `elder_woman_coat` turned down at rest;
  - `ya_smile_dress`'s smile pushes the lower lip out;
  - `adult_smile_blouse`'s smile is crooked;
  - `man_longcoat`'s eyes are pale.

### 3.4 Standing, sitting, behaviour: 8.38 (typical 8.9, worst 7.6)
**Good:**
- A sit-down now reads as a person lowering onto the seat. The knees bend as the hips drop, and the feet stay on the floor (`n4/BOB.png`, `s3/TBfront.png`).
- Rises are clean.

**Worst tenth:**
- **Every settle skates the feet** 15-25 cm. `teen_boy` slid 50 cm while turning from 0.74 m out.
- **The hips hang 0.4 m ahead of the seat** in a deep unsupported squat at 0.3-0.5 s.
- **The haggis lead goes through seated riders.**

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged: 99 people.
- The Cowcaddens census saw every age group and kind.

### 3.6 Clothing: 8.24 (typical 8.8, worst 7.4)
- **Census:** no sample over 50 % of one garment (`g/cc.json`).
- **Kinds seen:** trousers 324, shorts 208, leggings 94, skirt 76, kilt 39, highland dress 20, pleated skirt 11.
- **Seated hem faults** carried over from review 44 (code unchanged).

### 3.7 Luggage: 8.32 (typical 8.8, worst 7.6)
- No bag sinks any more.
- During settles, bags at the feet go through the shins:
  - `ya_smile_dress`'s pink shopper (`s1/SD.png`, frames 2-3);
  - `teen_boy`'s rucksack (`s3/TBfront.png`, frames 05-06).

### 3.8 Whole bodies: 8.22 (typical 8.7, worst 7.5)
- **Better:** legs no longer vanish into the floor.
- **New:** the far model stays in use at 6.4-7 m for about 0.9 s during a sit-down, followed by a texture pop on the swap.
- **Carried over:** hair caps on `teen_hippy` and `sum_shorts_asian_m`, and the far-model raggedness review 44 found.

## 4. Top ten defects, in priority order

1. **Sitting down while on a phone: the phone vanishes, the hands fly up, then the person sits in the phone pose holding nothing for more than 1.4 s.** Seen in 3 of 11 settles.
   - Reproduce: `PC=1 MAXD=8 KIND=settle node gsink6.mjs "mode=ride&q=high&line=outer&station=kelvinhall" n5/a 900 3`. Look at `n5/CD.png`; the hold weight is the last column in `n5/log.txt`.
   - Fix: keep the phone through the settle when the sit clip is `sit_phone`, or choose `sit_idle` when the phone is being put away.
2. **Feet skate during every sit-down,** 15-25 cm and up to 50 cm (`teen_boy`, hips 0.74 m from the seat). The root is tweened to the seat while the soles are on the floor.
   - Reproduce: `an.py s3/log.txt` (the slide column).
   - Fix: plant the feet (or take a step) first, then lower; or start the settle closer to the seat.
3. **The walking instrument on 6 new people: LEG p10 6.4, ARM p10 7.4, SMO p10 7.5.** `adult_heel_boots` at 1.9 m/s scores 7.9.
   - Reproduce: `people_motion.mjs --people sum_crop_bike,elder_shorts,man_highland,adult_heel_boots,girl_shorts,adult_tie_suit`. Results in `m/rec.log`.
4. **The haggis lead passes through seated riders' legs** in the car.
   - See `mine/lead/S.png`, row 4 frame 2 and row 5 frames 3-4.
   - Fix: route it over or around nearby bodies, or keep the haggis on the owner's side.
5. **Far model kept within 7 m during a sit-down,** then a texture pop at the swap (`n4/BOB.png`, frames 07 to 08).
6. **Bags at the feet go through the shins** as people sit (`s1/SD.png`, `s3/TBfront.png`).
7. **Resting mouths and smiles:**
   - pouting at rest: `adult_camisole`, `adult_suit_bun`;
   - smiles that push the lower lip out or go crooked: `ya_smile_dress`, `adult_smile_blouse`;
   - `man_longcoat`'s pale eyes.
   - Reproduce: `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0`, with `1` as the last argument for the smile.
8. **`ya_smile_dress`'s seated hem** (review 44's hoop, not re-shot near). Her far-model seated pose raises one knee high with a stiff flared hem (`s1/SD.png`).
9. **Deep squat in the air 0.4 m ahead of the seat** at 0.3-0.5 s into each settle. It reads as plausible lowering at 10 m; it may look unsupported close up.
10. **Carried over:** hair caps (`teen_hippy`, `sum_shorts_asian_m`); kilt opening mid-stride; `woman_sash`'s stiff seated sack; turn-aways.

## 5. What I could not observe

- **No near-model sit-down within 6 m.** No settle came within 6 m of the game camera in 700 s at St Enoch outer (`n3`), and the closest elsewhere were 6.4-7 m. A run in `n1` was lost when the container restarted.
- **The player-camera render in `gsink5/6` was broken** (a distorted view: `n4/BOBp.png`). Nothing is judged from it.
- **The in-car lead in my own run:** the cameras were inside the car walls. The in-car judgement relies on the builder's stills.
- **Not re-measured (code unchanged):** turn-aways, the kids in the car, the player walking through full trains, eye-height views, stair feet, pole hands, phones in long hair, and the seated skirts near.
- **No motion was watched.** Everything here comes from 0.1 s stills and per-frame bone logs.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Settles at 60 Hz: pelvis, lowest foot, foot slide, model in use, clip and hold | Hillhead inner ×2 runs, Kelvinhall outer ×2 runs: 9 settles (`teen_skater` ×2, `ya_smile_dress`, `woman_elder`, `teen_boy`, `sum_tube_denim`, `ya_smile_polo`, `woman_bob`, `sum_crop_denim`) | `s1/`, `s3/`, `n4/`, `n5/`, `an.py` |
| Rises at 60 Hz | Hillhead inner: 5 rises (`sum_tube_denim`, `adult_baggy_knit`, `adult_vneck`, `boy_small`, `sum_loose_shorts_w`) | `s2/` |
| Faces at 0.6 m, neutral and smiling | 14 people | `f/N.png`, `f/S.png` |
| Walking instrument | 6 people not measured before, 5 speeds | `m/rec.log` |
| Census, far model within 6 m, duplicates, overlaps | Cowcaddens inner ride, 200 s | `g/cc.json`, `g/cc.log` |
| Haggis and lead | Partick outer explore (platform, boarding); builder's car stills | `e/PETs.png`, `e/pet.log` |

Next round, look at:
- a sit-down within 3 m of the player, with a working player-camera render;
- a phone user sitting down (item 1) after any fix;
- the lead in a car seen from inside;
- `ya_smile_dress` and `girl_small` seated near.

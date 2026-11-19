# Under Glasgow: independent review of the people (review 40)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4b4e8ed3`. Commits since review 39 that touch the people (read-only `git show 3aeee139 4b4e8ed3`):
- `people.glb` / `people_lod.glb` rebuilt: `ya_winter` in `ponytail01`; `ya_ginger_long` with `toigo_light_skin_female_ginger`, brown eyes and `elvs_ashley_may_hair`.
- `people.js` `_fingerStep`: texting hands keep the fingers flat (`want = 0` for a text); callers keep 0.55 on the phone hand.
- `people.js` `_skirtSit` / update: a seated skirt's sit weights are applied again when `p.obj` changes (`p.skirtObj !== p.obj`).
- `armfit.js` entries for `ya_ginger_long`, `ya_winter`; skin budgets.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review40/`. The scripts are the review 39 set copied into `$R`, plus three new ones (`gcall3.mjs` side/top/front phone views, `gplat.mjs` platform eye-height views, `gstair2.mjs` stair walkers). I deleted the instrument recording after scoring; `m/items.log` holds the result. Running notes: `NOTES.md`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.21 (8.207). Gate NOT met.**
- At 8 or above (seven categories): Behaviour 8.48, Arms 8.36, Luggage 8.36, Range 8.30, Whole bodies 8.26, Faces 8.22, Walking 8.16.
- Below 8: Clothing 7.76.

In short:
- **Claim 1 holds.** `ya_winter`'s ponytail reads as a ponytail on both models, with no slab, dark ends or hole. `ya_ginger_long` is no longer `woman_bob`'s twin. But:
  - `ya_ginger_long`'s new hair hangs over her forehead and one eye as flat, ragged cards, with comb-tooth ends at the chin, and her new face smirks at rest.
  - `ya_winter`'s ponytail has dark brown blotches over the crown and round the tie (close, from behind or above).
- **Claim 2 holds.** Texters hold the phone in the hand, thumb on the screen and fingers under it. The phone no longer floats over the fingers (0 of 11 texter views). Callers keep their fingers round the phone (6 of 6).
- **Claim 3 is a code change I read and could not see.** The logic is right (`p.skirtObj !== p.obj` re-applies the sit weights after a swap), but no skirt, dress or kilt is seated in the game, so there is nothing to see.
- **Claim 4 (not changed) is confirmed** item by item (table below).
- **New and worse than review 39:**
  - **Hillhead inner platform:** trousers over half in 16 of 20 samples. From t 50 to 200 s, 7-8 of 9-13 people within 15 m wore trousers (62-78 %). Review 39 found 8 of 20, and the builder claimed 0 of 20.
  - People within 0.6 m of the platform edge are back: 21 and 20 samples in two of three runs (review 39: 0 in 3).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.7 | **8.36** |
| 3 | Faces | 10 | 8.7 | 7.5 | **8.22** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.7 | **8.48** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.4 | 6.8 | **7.76** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.21** (8.207) |

0.20x8.16 + 0.10x8.36 + 0.10x8.22 + 0.10x8.48 + 0.10x8.30 + 0.15x7.76 + 0.10x8.36 + 0.15x8.26 = 1.632 + 0.836 + 0.822 + 0.848 + 0.830 + 1.164 + 0.836 + 1.239 = 8.207.

Changes against review 39 (8.194):
- **Walking 0.** The instrument result is identical (9.46; LEG 7.8, p10 6.1; SMO p10 7.2; worst `adult_heel_boots` @1.9 = 7.9). The stop-start bursts are the same within noise (St Enoch worse, Buchanan Street better).
- **Arms +0.04.** The texting phone is fixed. Open pole hands are still there.
- **Faces +0.10.** The last lookalike pair is broken up, but the new face smirks at rest and its hair crosses the eye.
- **Behaviour -0.04.** The same turn-away pattern, plus people at the platform edge again.
- **Range 0.**
- **Clothing -0.08.** One platform run is the worst since review 38. Who sits is unchanged.
- **Luggage 0.**
- **Whole bodies +0.10.** `ya_winter`'s slab is gone. Her blotched crown and `ya_ginger_long`'s ragged cards are minor by comparison.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `ya_winter` in a blonde `ponytail01`; `ya_ginger_long` with her own face (freckled ginger skin, brown eyes, wavy `elvs_ashley_may_hair`) | **True, with new small faults.**<br>- `ya_winter`: a whole ponytail, near and far, front, side, back and top (`n/HR0s.png`, `n/HR1s.png`). Dark brown blotches over the crown and round the tie, visible from behind or above at about 1 m (`n/HRc.png`, first two tiles).<br>- `ya_ginger_long`: freckles, brown eyes, wavy ginger hair; she no longer resembles `woman_bob` (`f/TW.png` rows 1-2; `f/ALLs3.png`). **But** the front hair is a curtain of flat, ragged cards across the forehead and one eye, ending in comb teeth at the chin. Her mouth is curved up into a smirk at neutral, and the smile is a wide grin (`f/TW.png` row 1 right). From behind the card ends are ragged but read at distance (`n/HRc.png`). | `f/TW.png`, `f/ALLs3.png`, `n/HR*.png` |
| 2 | Texters' fingers flat on the phone's back; callers bent round it | **True.**<br>- Texters: 6 texters from behind at 0.5 m (`h/PH.png` bottom row, `h/TZ.png`) and 5 more from the side, from over the shoulder and from in front (`h/TX.png`). The phone lies in the hand with the thumb at the screen. A few are held by one corner between thumb and fingers, so most of the phone sticks out past the hand. None floats.<br>- Callers: 6 of 6 hold the phone at the ear with the fingers round it (`h/PH.png` top row). | `h/PH.png`, `h/TZ.png`, `h/TX.png` |
| 3 | Seated skirt weights re-applied on a near/far swap | **Code is right; not observable.** `people.js` line 907 now re-applies `_skirtSit` when `p.skirtObj !== p.obj`. No skirt, dress or kilt is seated in any of my 5 census runs (`who.py g/*.json`), and `_canSit` still excludes all 16 wearers by id. | `who.py g/*.json`, `people.js` 507, 849-856, 907 |
| 4 | Not changed: who sits, cars over half trousers, crouch / heels, stride garment faults, stop-start bursts, turned-away repeats, `woman_mini`'s hair, caps, `woman_sash`'s specks, beret, smirks/pouts, `man_longcoat`'s white eye | **Confirmed.**<br>- Ibrox inner ride at eye height: 5 of 7 standers in a skirt, dress or kilt (`e2/EYEs.png`). Hillhead outer ride: 3 of 5 (`e/EYEs.png`).<br>- Crouch: `n/BWs.png`; instrument identical.<br>- Kilt slit and flat sporran; notched hems on `woman_coat` and `ya_smile_dress`; `ya_winter`'s coat a bell (`n/Gs.png`).<br>- Stop-start: Buchanan Street outer, top eight 22 toggles, worst `woman_mini` 6 in 11.6 s (31 a minute). St Enoch inner 33 toggles, worst `woman_mini` 7 in 11.3 s (37 a minute), `boy` 9 in 32.5 s (`pz/*.log`).<br>- Turn-aways: 20 in 3 runs; repeats `sum_chino_shorts_m` (third review running), `elder_woman_coat`, `adult_vneck`, `woman_puffer`, `girl_school_kilt` (`v/aw_*.log`).<br>- `woman_mini`'s black slab and `woman_sash`'s crown speck (`n/HR0s.png`).<br>- Pouts, and `man_longcoat`'s iris lost at a 0.4 rad glance (`f/TW.png` row 4 left, `f/R.png`). | as listed |

## 2. Status of REVIEW_39's top ten

| # | REVIEW_39 item | Now | Evidence |
|---|---|---|---|
| 1 | Who sits: every skirt, dress and kilt stands | **Not fixed.** 5 of 7 (Ibrox inner) and 3 of 5 (Hillhead outer) standers at eye height wear one; 0 seated in 5 runs. | `e2/EYEs.png`, `e/EYEs.png`, `who.py g/*.json` |
| 2 | Brisk-walk crouch | Not fixed (`adult_heel_boots`, `ya_tube_heels` at 1.8 m/s; instrument LEG 7.8, p10 6.1). | `n/BWs.png`, `m/items.log` |
| 3 | Car garment mix over half | **Run-dependent, and worse on one platform.** Shields Road inner ride saloon: 2 of 20 (review 39: 16 of 20). Ibrox outer, St Enoch inner, Cowcaddens outer: 0 of 20. **Hillhead inner platform: 16 of 20, max 78 %.** | `g/*.json`, `cen4.py` |
| 4 | `ya_winter`'s slab hair | **Fixed** (ponytail). New small fault: blotched crown. | `n/HRc.png` |
| 5 | Last lookalike pair; smirks, pouts, white eye | **Pair fixed.** Smirks (now also `ya_ginger_long` and `girl_ginger` at rest), pouts and `man_longcoat`'s white eye remain. | `f/TW.png`, `f/R.png` |
| 6 | Turn-aways (garment mix, children, repeats) | Not fixed: 20 in 3 runs, 8 of them "garment mix", 4 children, 5 repeat people. | `v/aw_*.log` |
| 7 | Garment faults in the stride | Unchanged. | `n/Gs.png` |
| 8 | Jam stop-start bursts | Unchanged (37 a minute, St Enoch). | `pz/*.log` |
| 9 | Standing texting phone | **Fixed.** | `h/TX.png`, `h/TZ.png` |
| 10 | Hair: `woman_mini`, caps, `woman_sash`, beret | Unchanged (builder says so; `woman_mini` and `woman_sash` re-seen). | `n/HR0s.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- Instrument, all 99 people at 5 speeds: 9.46, identical to reviews 38 and 39 (`m/items.log`).
- Foot bones every 1/30 s for 100 s, Partick outer explore (`sl/po.log`, `flick.py`, `jump.py`, `skid2.py`):
  - one-tick jumps: 0;
  - fast flicks: 8, none on a near model within 8 m;
  - skids over 5 cm: 1 (`elder_woman_dress`, ball of foot 6.3 cm, at 8.4 m).
- Side and front walks of six people read right: `ya_winter`, `ya_ginger_long`, `adult_cyclist`, `elder_woman_coat`, `teen_skater`, `boy_cap` (`n/WSs.png`).
- Stair walkers coming down at St Enoch (`teen_tee` with a rucksack; `girl_small` behind `woman_dress`) read right in the stills (`e/S2.png`).

Worst tenth:
- The heel wearers' crouch at 1.8 m/s (`n/BWs.png`).
- Stop-start bursts: up to 37 a minute for 11 s.
- Paused-foot moves on near models: `adult_fisherman_leggings` 15 cm at 1.8 m, `woman_coat` 17 cm at 2.3 m, `ya_bootcut` 21 cm at 5.2 m (`pz/p_bs.log`). As before, the measure cannot tell a slide from a short step.

### 3.2 Arms and hands: 8.36 (typical 8.8, worst 7.7)
Good:
- Texters now hold the phone (11 views, `h/TX.png`).
- Callers' fingers are round the phone (6 of 6).
- Grips measured in a Kinning Park outer ride: pole median 3.0 cm, max 4.2 cm; rail max 2.7 cm (`c/cw.log`).

Worst tenth:
- At eye height 1.1 m away, `woman_coat`'s and `teen_girl`'s pole hands are open and flat beside the pole, not round it (`e2/POLE.png`). The distance measure passes, but they read as a wave.
- Some texters pinch the phone at one corner.
- In the viewer, a shopper is lifted to the chest by a texting hand (`b/BGs.png`, `elder_shorts`). The game rules this combination out (`_phoneUse`), so it is not counted.

### 3.3 Faces: 8.22 (typical 8.7, worst 7.5)
I looked at:
- all 99 at 1.6 m (`f/ALLs0-3.png`);
- 16 at 0.85 m: neutral, glancing 0.4 rad or -0.3 rad, and smiling (`f/TW.png`, `f/R.png`).

Better:
- No identical pair is left. `ya_ginger_long` is a different woman.

Faults:
- **Smirks at rest:** `ya_ginger_long` (new face) and `girl_ginger` both have their mouths curved up at neutral. `girl_ginger`'s fixed grin with dimples reads as uncanny on a child. `ya_ginger_braid`'s mouth is lopsided at rest.
- **Pouts at rest:** `adult_camisole`, `elder_woman_coat`, `teen_hippy`, `sum_shorts_asian_m`, among others.
- **White eye at a glance:** `man_longcoat` at 0.4 rad.
- **Near-lookalikes:**
  - pale, black-haired young men: `man_commuter`, `man_highland`, `man_hoodie`, `man_kilt_casual`, `man_student`;
  - two blonde fringe-bob girls: `girl_school_kilt`, `girl_small`;
  - three dark-haired boys: `boy`, `boy_kilt`, `boy_shorts` (`f/ALLs1.png`).
- **Hair crossing the face:** `ya_ginger_long`'s hair over one eye; at 0.85 m, `teen_crop_leggings` has a dark slab of hair across half her face (`f/TW.png` row 3 right).

### 3.4 Standing, sitting, behaviour: 8.48 (typical 9.0, worst 7.7)
Good:
- Five 200 s census runs: no duplicates and no far model within 6 m. Overlaps are rare: 3 short, moving ones at Ibrox and 1 at St Enoch (`g/*.log`).
- The player crossed full trains 12 of 12 times (Buchanan Street outer and Cessnock inner rides; `c/wk*.log`).
- Seated people sit in the seat; the sit clips are whole on 6 more wearers (`n/ST0s.png`, `n/ST1s.png`).
- Children in cars: boys seated; `girl_school_kilt` stands about 100 s in a Govan inner ride, 0.94 m from a seated teenager (`k/kid2_inner_govan.log`).

Worst tenth:
- 20 people turned away in 3 runs of 300 s, 8 "to keep the garment mix" and 4 of them children. Five people were turned away from both trains. `sum_chino_shorts_m` has been a repeat in three reviews running (`v/aw_*.log`).
- Crowd samples within 0.6 m of the platform edge: Partick 21 and Govan 20 (review 39: none).
- Stop-start bursts.

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- 99 people, a good spread of skin tones and ages (`f/ALLs*.png`). A freckled ginger woman now joins the two ginger teens, the ginger girl and the ginger lad.
- Children are still turned away (4 in 3 runs). Two girls can never sit.
- Worst tenth: the look-alike pale young men and the look-alike children.

### 3.6 Clothing: 7.76 (typical 8.4, worst 6.8)
Census (`cen4.py`; samples with over half of the people in one garment group; "trousers" includes jeans):

| run | platform within 15 m | saloon within 15 m | all within 15 m |
|---|---|---|---|
| **Hillhead inner explore** | **16 of 20 (max 78 %: 7 of 9)** | 0 of 8 | **15 of 20 (max 73 %)** |
| Shields Road inner ride | 2 of 10 (max 73 %) | 2 of 20 (max 62 % shorts) | 2 of 20 |
| Ibrox outer ride | 0 of 6 | 0 of 20 | 0 of 20 |
| St Enoch inner ride | 0 of 8 | 0 of 20 | 0 of 20 |
| Cowcaddens outer explore | 0 of 20 | 0 of 7 | 0 of 20 |
| Kinning Park outer ride, per car (n of 5 or more) | - | 1 of 15 | - |

At Hillhead at t 120 s, 8 of 11 people on the platform within 15 m wore trousers: `adult_tophat`, `teen_boy`, `adult_casual5`, `teen_girl`, `staff_hivis`, `man_elder`, `teen_hood`, `ya_winter`. This lasted 150 s, so a player standing there sees it.

Faults:
- No skirt, dress or kilt sits: 0 seated samples in 5 runs. Seated riders are trousers, shorts and leggings, and standers are skirts and kilts (`e2/EYEs.png`, `e/EYEs.png`).
- Stride faults are unchanged: the kilt slit and flat oval sporran; notched hems on `woman_coat` and `ya_smile_dress`; `ya_winter`'s bell coat (`n/Gs.png`).

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- Eight kinds (rucksack, large trolley, holdall, handbag, shopper, carrier, tote) on `elder_shorts` and `teen_tee`, standing, walking and seated: worn, held, towed and set at the feet correctly (`b/BGs.png`).
- In the game, a rucksack wearer comes down the stairs at St Enoch (`e/S2.png`).
- The haggis:
  - in the viewer, its lead is taut;
  - when the owner sits, it sits against and partly inside his calves (`n/PET.png`, bottom row);
  - in the Partick outer game run, the owner spent most of the time seated in the saloon. On the platform: nobody's leg within 12 cm of it; lead at most 2.16 m (`pets.py e/p5_partick.log`).
  - I again got no usable still of it in the game (the camera ended in a door).
- Worst tenth: the shopper on the texting hand (viewer only); the seated haggis in its owner's legs; bags close against seated riders' shoes.

### 3.8 Whole bodies: 8.26 (typical 8.7, worst 7.6)
Good:
- `ya_winter`'s slab, dark ends and hole are gone.
- The far models of the changed people read right (`n/HR1s.png`).
- Far models are only seen from 11 m on the platform (`pl/SE.png` list), and none came within 6 m in 5 runs.
- The sit clips are whole on 6 more seated wearers, near and far.

Faults:
- `ya_winter`'s crown has dark blotches (close, from behind or above).
- `ya_ginger_long`'s hair is flat, ragged cards over the face, with comb-tooth ends.
- `teen_crop_leggings`' hair slab crosses her face at 0.85 m.
- `woman_sash`'s crown speck; `woman_mini`'s black slab (`n/HR0s.png`).
- Square hair blocks under caps and `adult_beret`'s pillbox beret (builder: unchanged; not re-shot).

## 4. Top ten defects, in priority order

1. **Who sits: every skirt, dress and kilt stands** (16 ids excluded in `_canSit`). 5 of 7 standers at eye height at Ibrox inner, 3 of 5 at Hillhead outer; no seated skirt in 5 runs. This also makes the cars trousers-and-shorts and the standers skirts.
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=inner&station=ibrox" e2/eye 40 6`
   - Census: `python3 who.py g/*.json`
2. **Platform garment mix over half at Hillhead inner:** 16 of 20 samples, 62-78 % trousers for 150 s. Builder's claim was 0 of 20; review 39 found 8 of 20.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=hillhead" g/hh 200; python3 cen4.py g/hh.json`
3. **Brisk-walk crouch** (`adult_heel_boots`, `ya_tube_heels`; LEG 7.8, p10 6.1).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,woman_dress none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
4. **Turn-aways:** 20 in 3 runs, 8 for the garment mix, 4 children, 5 repeats (`sum_chino_shorts_m` for the third review running). People at under 0.6 m from the edge are back (21 and 20 samples).
   - Reproduce: `OUT=w/x node gaway5.mjs "mode=explore&q=high&line=inner&station=partick" 300`, then read `XAWAY`, `REPEATS` and `CROWD_EDGE`.
5. **Smirks and pouts at rest:** `ya_ginger_long`'s new face, `girl_ginger`'s fixed grin, `ya_ginger_braid`'s lopsided mouth; pouts on many. Also `man_longcoat`'s white eye at 0.4 rad.
   - Reproduce: `DIST=0.85 node face3.mjs ya_ginger_long,girl_ginger,ya_ginger_braid,man_longcoat,adult_camisole f/x "0:0;0.4:0.1" 0 8611 "" 14`
6. **Garment faults in the stride:** the kilt slit and flat sporran; notched hems (`woman_coat`, `ya_smile_dress`); `ya_winter`'s bell coat.
   - Reproduce: `ANGS='[["F",2.8,0.1],["S",1.9,0.1]]' node shoot2.mjs 0 man_highland,woman_coat,ya_smile_dress,ya_winter none walk@162 n/g legs`
7. **Open pole hands:** `woman_coat` and `teen_girl` hold a flat open hand beside the pole at 1.1 m.
   - Reproduce: `geye2.mjs` as in item 1, then look at `*_stand_hold_pole_near.png`.
8. **Jam stop-start bursts:** `woman_mini` 7 toggles in 11.3 s (St Enoch inner), `boy` 9 in 32.5 s.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=st-enoch" 200`
9. **New hair faults:** `ya_ginger_long`'s card curtain over the eye with comb-tooth ends; `ya_winter`'s blotched crown; `teen_crop_leggings`' slab across the face at 0.85 m.
   - Reproduce: `ANGS='[["F",3.4,0.15],["B",0.6,0.15],["T",3.14,1.2]]' FD=1.0 node shoot2.mjs 0 ya_winter,ya_ginger_long,teen_crop_leggings none stand n/hr face`
10. **Old hair faults:** `woman_mini`'s black slab, square hair blocks under caps, `woman_sash`'s crown speck, `adult_beret`'s pillbox beret.
    - Reproduce: review 39 item 10.

## 5. What I could not observe

- **No motion watched.** Motion was judged from bones every 1/30 s and from stills.
- **A seated skirt after a near/far swap (claim 3):** nobody in a skirt sits.
- **The haggis on the stairs or on a platform, in a still from the game:** the camera ended in a door. The owner was seated most of the Partick run, and the Kelvinbridge stair probe found no owner on the stairs.
- **Near-model feet on stairs.** In explore mode every stair walker was a far model. The foot-to-tread measure (`gstair2.mjs`: 664 of 1633 samples a foot more than 4 cm under `yAt`, worst `teen_skater` 19 cm) is probably measuring a ramp, or stale far-model bones. The stills look right, so I did not score it.
- **Blink and smile timing in play.**
- **Whether the paused-foot moves are slides or short steps.**
- **Caps and the beret:** not re-shot; the builder says they are unchanged.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | Partick outer explore, 100 s | `sl/po.log`, `flick.py`, `jump.py`, `skid2.py` |
| Brisk walk at 1.8 m/s, 6 phases | `adult_heel_boots`, `ya_tube_heels`, `woman_dress` | `n/BWs.png` |
| Walk, 4 phases from the side and front | `ya_winter`, `ya_ginger_long`, `adult_cyclist`, `elder_woman_coat`, `teen_skater`, `boy_cap` | `n/WSs.png` |
| Garments in the stride | 9 skirt, dress, kilt, coat and changed wearers | `n/Gs.png` |
| All 4 sit clips, 2 views, near and far | `ya_ginger_long`, `woman_puffer`, `adult_camisole`, `staff_woman`, `teen_tee`, `ya_fedora` | `n/ST0s.png`, `n/ST1s.png` |
| Faces | all 99 at 1.6 m; 16 at 0.85 m neutral, glancing, smiling | `f/ALLs*.png`, `f/TW.png`, `f/R.png` |
| Hair: front, back, top, side, near and far | `ya_winter`, `ya_ginger_long`, `teen_crop_leggings`, `woman_sash`, `woman_mini` | `n/HR0s.png`, `n/HR1s.png`, `n/HRc.png` |
| Phones | 6 callers, 11 texter views (behind, side, over the shoulder, front), St Enoch | `h/PH.png`, `h/TZ.png`, `h/TX.png` |
| Luggage, 8 kinds × stand / walk / sit | `elder_shorts`, `teen_tee` | `b/BGs.png` |
| The haggis | viewer walk/stand/sit; Partick outer game run | `n/PET.png`, `e/p5_partick.log` |
| Turned-away boarders, platform edge | Kinning Park inner, Govan outer, Partick inner (300 s each) | `v/aw_*.log` |
| Children in cars | Govan inner, West Street outer rides | `k/kid2_*.log` |
| Census, overlaps, far within 6 m, duplicates, who sits | Shields Road inner, Ibrox outer, St Enoch inner (rides); Hillhead inner, Cowcaddens outer (explore), 200 s each | `g/*.json`, `g/*.log` |
| Grips and per-car mix | Kinning Park outer ride, 150 s | `c/cw.log` |
| Player walks through full trains | Buchanan Street outer, Cessnock inner rides | `c/wk*.log` |
| Eye height in a car | Ibrox inner, Hillhead outer rides | `e2/EYEs.png`, `e/EYEs.png`, `e2/POLE.png` |
| Platform at eye height, near and far models | St Enoch inner | `pl/SE.png` |
| Stairs | St Enoch outer explore | `e/S2.png`, `e/s2se.log` |
| Jam pauses | Buchanan Street outer, St Enoch inner, 200 s | `pz/*.log` |

Next round, look at:
- the Hillhead platform mix over several runs;
- pole hands at eye height in more cars;
- a haggis still from the game;
- near-model feet on the stairs (walk the player to the stairs first).

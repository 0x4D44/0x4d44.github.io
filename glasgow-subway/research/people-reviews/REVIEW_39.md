# Under Glasgow: independent review of the people (review 39)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `a1e70d56`. Commits since review 38 that touch the people (read-only `git diff 24188585 a1e70d56 -- glasgow-subway`):
- `people.js` `_pool`: the "bare legs" share of the adult draw is now `r < 0.72` (was 0.68): shorts and leggings about 43 %, trousers about 28 %.
- `people.glb` and `people_lod.glb` rebuilt (`assets_people_mpfb.py`):
  - `adult_beret`: Eurasian middle-aged skin, brown eyes, hair `#2e1d12` (was pale, light blue eyes, red);
  - `elder_man_suit`: `old_asian_male`, brown eyes;
  - `adult_tie_suit`: `mindfront_skin_male_african_middleage`, mixed race weights, brown eyes, hair `#5a5a5a`;
  - `ya_winter`: hair `long01` (was `elvs_hazel_hair`).
- `armfit.js` entries for `adult_tie_suit` and `elder_man_suit`; skin budgets in `sim.test.mjs`.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review39/`. The scripts are the review 38 set, copied into `$R`. I deleted the instrument recording after scoring; `m/items.log` holds the result. Running notes: `NOTES.md`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.19 (8.194). Gate NOT met.**
- At 8 or above (seven categories): Behaviour 8.52, Luggage 8.36, Arms 8.32, Range 8.30, Walking 8.16, Whole bodies 8.16, Faces 8.12.
- Below 8: Clothing 7.84.

In short:
- **Claim 1 mostly holds.** `adult_beret`, `elder_man_suit` and `adult_tie_suit` now have faces of their own, and `ya_winter` no longer shows scalp. But:
  - `woman_bob` and `ya_ginger_long` are still the same pale, green-eyed face under the same red bob. They were two of the three in review 38's red-bob trio, and the claim does not mention them.
  - `ya_winter`'s new hair is a flat slab, blonde at the top and fading to near-black at the ends, with a small hole by the left shoulder.
- **Claim 2 is true on average, not in every run.** At Hillhead inner, two runs of the builder's own `gmix.mjs` gave 0 of 20 samples over half (max 44 % and 50 %), but my `gp8` run gave 8 of 20 (7 of 12 = 58 % for 130 s). That is 8 of 60 samples across the three runs, against 19 of 20 in review 38. Partick outer, Bridge Street inner and Kelvinhall outer: 0 of 20 on the platform.
  - **But in the car it got worse.** In a Shields Road inner ride, the people within 15 m of the player in the car were over half in trousers in 16 of 20 samples (9 of 16 to 11 of 19, 56-58 %, for 150 s). Review 38's worst was 6 of 20.
- **Claim 3 (not changed) is confirmed.** No skirt, dress or kilt sits. In an Ibrox inner ride, 7 of the 11 standers at eye height wore a skirt, dress or kilt (`e2/EYE.png`), the same as review 38. The crouch, the stride faults, the stop-start bursts, the texting phone, the hair under caps, `woman_mini`'s hair, the turn-aways and `woman_sash`'s specks are all still there.
- **Better by chance or by the platform change:**
  - 4 children turned away in 3 runs (review 38: 8 in 4);
  - no crowd sample within 0.6 m of the platform edge in 3 runs (review 38: 9 at Hillhead).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.6 | **8.32** |
| 3 | Faces | 10 | 8.6 | 7.4 | **8.12** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.8 | **8.52** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.6 | 7.5 | **8.16** |
| | **Weighted mean** | 100 | | | **8.19** (8.194) |

0.20x8.16 + 0.10x8.32 + 0.10x8.12 + 0.10x8.52 + 0.10x8.30 + 0.15x7.84 + 0.10x8.36 + 0.15x8.16 = 1.632 + 0.832 + 0.812 + 0.852 + 0.830 + 1.176 + 0.836 + 1.224 = 8.194.

Changes against review 38 (8.158):
- **Walking 0.** The instrument gives exactly the same result (9.46; LEG 7.8, p10 6.1; SMO p10 7.2; worst `adult_heel_boots` @1.9 = 7.9). Stop-start bursts are the same within noise.
- **Arms 0.**
- **Faces +0.14.** Two lookalike trios broken up; one red-bob pair is left, with the smirks and pouts.
- **Behaviour 0.** Fewer child turn-aways and no one at the platform edge, but people are still turned away by train after train, and some are turned away to keep the garment mix.
- **Range +0.10.** An older East Asian man and a man of mixed descent widen the roster; fewer children turned away.
- **Clothing +0.04.** The platforms are better; the car I rode in was worse; who sits is unchanged.
- **Luggage 0.**
- **Whole bodies +0.04.** `ya_winter`'s scalp is covered, but by a worse hair.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The remaining lookalikes made distinct: `adult_beret` dark brown hair, brown eyes, Eurasian skin; `elder_man_suit` an older East Asian man; `adult_tie_suit` mixed African and European with dark grey hair; `ya_winter` in `long01` | **Mostly true.**<br>- `adult_beret`: dark brown bob, brown eyes; no longer one of a red-bob trio (`f/TW.png`).<br>- `elder_man_suit`: reads as an older East Asian man with white hair (`f/TW.png`, `n/TH.png`).<br>- `adult_tie_suit`: reads as a dark-skinned Black man rather than as mixed. His hair looks black from the front and a smooth mid-grey shell from behind (`n/TH.png`), but he no longer looks like `man_longcoat`.<br>- `ya_winter`: no scalp through the crown now (`n/HAIR.png`). **But** the `long01` hair is a faceted flat slab. From behind, the blonde turns near-black over the lower third, with dark specks near the crown and a small triangular hole at the left shoulder (`n/NF.png`, `n/HC.png`). This shows on both the near and the far model (`n/FAR.png`).<br>- **Not addressed:** `woman_bob` and `ya_ginger_long` are still the same pale, green-eyed face under the same red bob (`f/TW.png`, `f/CS.png`). | `f/TW.png`, `f/CS.png`, `n/HAIR.png`, `n/HC.png`, `n/NF.png`, `n/TH.png`, `n/FAR.png` |
| 2 | Platform draw about 28 % trousers / 43 % shorts and leggings. Hillhead inner, 200 s, everyone within 15 m every 10 s: trousers over half in 0 of 20 samples (most 44 %) | **True on average; the single number is a good run.**<br>- Hillhead inner, builder's `gmix.mjs` ×2: 0 of 20 (max 0.44) and 0 of 20 (max 0.50) (`g/gmix_hh1.log`, `g/gmix_hh2.log`).<br>- Hillhead inner, my `gp8.mjs`: platform within 15 m over half in 8 of 20 samples. From t 70 to 200 s a static crowd held 7 trousers of 12-14 people (58 %) (`g/hh.json`).<br>- Partick outer, Bridge Street inner, Kelvinhall outer: 0 of 20 on the platform (max 41 %, 33 %, 40 %).<br>- **In the car:** Shields Road inner ride, the saloon within 15 m of the player was over half trousers in 16 of 20 samples (56-58 % from t 30 to 180) (`g/sr.json`). Partick outer explore, the train's saloon was over half in 4 of 9 samples (5 of 8). In a light Kinning Park ride, one car of 5 held 3 in trousers for the whole run (`c/cw.log`).<br>- The platform change does not touch who is already on the train, and the seated riders are the trousers and shorts wearers (Shields Road: 197 seated trouser-samples, 114 shorts, 26 leggings, 0 skirts). | `g/*.json`, `cen4.py`, `who.py`, `c/cw.log` |
| 3 | Not changed: who sits, brisk-walk crouch / heels, stride garment faults, stop-start bursts, texting phones, `woman_mini`'s hair and caps, children and the same people turned away, `woman_sash`'s specks | **Confirmed, item by item.**<br>- No skirt, dress or kilt sits in 5 game runs (`who.py` on `g/*.json`); 7 of 11 standers at eye height in skirts, dresses or kilts (`e2/EYE.png`).<br>- Crouch: `n/BW.png`; instrument identical (`m/items.log`).<br>- Kilt slit at the knee and flat sporran; notched hems on `woman_coat` and `ya_smile_dress`; `woman_puffer`'s blotchy shorts; `ya_winter`'s coat a stiff bell (`n/G.png`).<br>- Stop-start: Buchanan Street outer, top-eight toggles 28 (review 38: 20), worst `teen_hood` 4 in 7.9 s (30 a minute); St Enoch inner 39 (25), worst 18.8 a minute (`pz/*.log`).<br>- Texting phone: flat bar over the fingers at the waist, 6 of 6 (`h/T3.png`).<br>- `woman_mini`'s black slab and the square hair blocks under caps (`n/HC.png`).<br>- Turn-aways: 20 in 3 runs; 4 children; repeats `adult_cyclist` (Kinning Park), `adult_cap_baggy` and `sum_chino_shorts_m` (Govan) (`v/aw_*.log`).<br>- `woman_sash`'s scalp specks at the crown (`n/HAIR.png`). | as listed |

## 2. Status of REVIEW_38's top ten

| # | REVIEW_38 item | Now | Evidence |
|---|---|---|---|
| 1 | Who sits: every skirt, dress and kilt stands | **Not fixed.** 7 of 11 standers at eye height in an Ibrox inner ride wear skirts, dresses or kilts (review 38: 7 of 9). | `e2/EYE.png`, `who.py g/*.json` |
| 2 | Brisk-walk crouch | Not fixed (LEG 7.8, p10 6.1; `adult_heel_boots` @1.9 = 7.9). | `n/BW.png`, `m/items.log` |
| 3 | Lookalike faces and scalp holes | **Mostly fixed.** Both trios broken up. Left: the `woman_bob` / `ya_ginger_long` pair; `woman_sash`'s specks. `ya_winter`'s scalp is covered by a worse hair (see new item 4). | `f/TW.png`, `n/HAIR.png`, `n/NF.png` |
| 4 | Platform garment mix over half | **Improved on the platform** (Hillhead 8 of 60 samples across 3 runs, was 19 of 20). **Worse in the car:** 16 of 20 saloon samples at Shields Road. | `g/hh.json`, `g/gmix_hh*.log`, `g/sr.json` |
| 5 | Children turned away | **Fewer:** 4 in 3 runs (Govan outer: `boy_kilt`, `girl_school_kilt`; Cowcaddens outer: `boy_kilt`, `girl_small`). Review 38: 8 in 4. | `v/aw_*.log` |
| 6 | The same people turned away train after train | Not fixed: `adult_cyclist` (Kinning Park); `adult_cap_baggy` and `sum_chino_shorts_m` (Govan). `adult_cap_baggy` again, as in review 38 at St Enoch. | `v/aw_*.log` |
| 7 | Garment faults in the stride | Unchanged. | `n/G.png` |
| 8 | Jam stop-start bursts | Unchanged within noise (worst 30 a minute over 7.9 s; frozen-walk frames 350 and 420, review 38 282 and 329). | `pz/*.log` |
| 9 | Texting phone | Unchanged (6 of 6). | `h/T3.png` |
| 10 | `woman_mini`'s slab; hair blocks under caps | Unchanged. | `n/HC.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
Instrument (all 99 people, 5 speeds): 9.46, identical to review 38 in every category (`m/items.log`).

In the game, foot bones every 1/30 s for 100 s in a Kelvinhall outer explore and an Ibrox outer ride:
- One-tick foot moves over 30 cm on a near model: none.
- Fast flicks: 19 and 5. Near ones peaking over 20 cm: 0 and 0.
- Skids over 5 cm: none at Kelvinhall. At Ibrox, `adult_heel_boots`' ankle 5 times at 22.6 m (the case reviews 37 and 38 found), and two far models at 55 m and 69 m.

The side stills of eight more walkers (`n/WS.png`: `elder_man_suit`, `adult_tie_suit`, `girl_small`, `boy_kilt`, `elder_woman_coat`, `teen_hood`, `adult_string_vest` with the haggis lead, `woman_elder`) read right.

Worst tenth:
- The heel wearers' crouch at 1.8 m/s: knees bent through the stride, as if stalking (`n/BW.png`).
- Stop-start bursts in jams (30 a minute over 8 s).
- Paused-foot moves while waiting: `adult_sport_cap` 14 cm at 4.5 m, `teen_skirt` 6 cm at 4.6 m (`pz/p_bs.log`). As in review 38, this measure cannot tell a slide from a low step.

### 3.2 Arms and hands: 8.32 (typical 8.8, worst 7.6)
Good:
- Pole grip median 2.9 cm, max 3.2 cm; rail max 4.5 cm, 2 over 4 cm (Kinning Park inner ride, `c/cw.log`).
- Pole grips at eye height read right (`e2/eye_ya_smile_dress_stand_hold_pole_near.png`).
- Seated texters hold the phone at the lap, angled, and it reads right (`sd/CE.png`).

Worst tenth:
- Standing texters hold the phone flat at the waist, a bar floating over the fingers (`h/T3.png`, 6 of 6).
- `woman_coat`'s pole hand is open and flat beside the pole, not round it (`e2/eye_woman_coat_stand_hold_pole_near.png`).
- In the viewer, a shopper hangs from the hand that is texting, so the bag is held up at the chest (`b/bg_adult_tie_suit_shopper_stand_Q.png`). I did not see this in the game.

### 3.3 Faces: 8.12 (typical 8.6, worst 7.4)
I looked at:
- all 99 faces at 1.6 m (`f/ALLs0-3.png`);
- 8 at 0.85 m (`f/TW.png`);
- the same 8 smiling, looking ahead and with the eyes turned 0.4 rad (`f/CS.png`).

Better:
- The two grey-haired suited men and the beret woman are now three different people.

Faults:
- **One lookalike pair left:** `woman_bob` and `ya_ginger_long` (pale, green eyes, the same red bob, one face).
- **Smirks:** `ya_ginger_long`; `ya_winter` smiles crooked.
- **Pouts at rest:** many, as in review 38.
- **Eyes turned 0.4 rad:** `man_longcoat`'s iris disappears into the corner of one eye, leaving it white (`f/CS.png`, bottom right).
- **Look-alike young men:** several pale, black-haired young men still look alike across the roster (`man_commuter`, `man_hoodie`, `staff_hivis`, `man_student`, `man_kilt_casual`; `f/ALLs0.png`).

### 3.4 Standing, sitting, behaviour: 8.52 (typical 9.0, worst 7.8)
Good:
- Five 200 s game runs: no overlapping people, no duplicates, no far model within 6 m (`lod6 0`, `ndup 0`, `nov 0`).
- The player crossed full trains 12 of 12 times (Buchanan Street inner, Cessnock outer rides; `c/wk*.log`).
- No crowd sample within 0.6 m of the platform edge in 3 runs.
- 13 seated riders in a Cessnock inner ride sit in the seat from three views, with their bags at their feet (`sd/CE.png`).
- Standing children in cars stand beside a grown-up at the pole, 0.65-0.78 m away (`k/*.log`).

Worst tenth:
- 20 people turned away in 3 runs of 300 s, 6 of them (Kinning Park 5, Govan 1) "to keep the garment mix". The player sees people not board a half-empty train.
- The same people are turned away by both trains (3 people).
- Stop-start bursts.

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Roster: 99 people (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff). It now includes an older East Asian man in a suit and a Black man in a suit, and a good spread of skin tones (`f/ALLs*.png`).
- Child turn-aways down to 4 in 3 runs.
- Two girls (`girl_small`, `girl_school_kilt`) can never sit. In rides they stand at a pole for 100 s beside a woman (`k/kid2_outer_kelvinbridge.log`). That is plausible, but they are the only children who always stand.
- Worst tenth: the remaining red-bob pair; the look-alike pale young men.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
Census (`cen4.py`; samples with over half of the people in one garment group; "trousers" includes jeans, as in review 38):

| run | platform within 15 m | saloon within 15 m | all within 15 m |
|---|---|---|---|
| Hillhead inner explore (`gp8`) | 8 of 20 (max 58 %) | 3 of 8 | 8 of 20 |
| Hillhead inner explore (`gmix` ×2, builder's script) | 0 of 20, 0 of 20 (max 44 %, 50 %) | - | - |
| Partick outer explore | 0 of 20 | 4 of 9 (5 of 8) | 0 of 20 |
| Bridge Street inner explore | 0 of 20 | 0 of 7 | 0 of 20 |
| Kelvinhall outer ride | 0 of 8 | 0 of 20 | 0 of 20 |
| **Shields Road inner ride** | 1 of 10 | **16 of 20** (56-58 %) | 10 of 20 (max 60 %) |

Faults:
- Still nobody in a skirt, dress or kilt sits. Seated riders are all trousers, shorts and leggings; standers are mostly skirts and kilts (`e2/EYE.png`).
- So cars are trousers-heavy whatever the platform draw does (Shields Road).
- Stride faults unchanged: the kilt slit at the knee and a flat oval sporran on the apron; notched hems on `woman_coat` and `ya_smile_dress`; `woman_puffer`'s blotchy shorts (`n/G.png`).

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- Rucksack, large trolley, holdall, handbag and shopper on `adult_tie_suit` and `ya_winter`, standing, walking and seated: held, worn, towed and set at the feet correctly (`b/BG.png`).
- `ya_winter`'s hiking rucksack is swapped for a tote, which is sensible with her long hair.
- In cars, cases, a holdall and a rucksack stand at the riders' feet (`sd/CE.png`).
- The haggis:
  - on the platform it stays on its lead (lead 1.0-1.6 m) with no jumps in 5 runs;
  - it rides on the platform floor as its owner walks;
  - on the stairs its height ramps smoothly (5.35 to 4.74 m at about 4 cm a tick, `e/pet_ride_inner_partick.log`);
  - once, at Partick, the piper's foot passed through it for 0.3 s while both walked (`e/p5_partick.log`, t 40.1-40.3);
  - I got no usable still of it on the stairs: the camera ended inside walls.
- Worst tenth: the shopper on the texting hand (viewer); bags close against seated riders' shoes.

### 3.8 Whole bodies: 8.16 (typical 8.6, worst 7.5)
Good:
- `ya_winter`'s scalp is covered.
- The sit clips are whole on six people the game seats, including the two rebuilt men (`n/STF.png`).
- The far models of the rebuilt people read right at 3.6 m (`n/FAR.png`). The far model is only used beyond 6 m (in practice mostly beyond 11 m), and none was within 6 m in five runs.

Faults:
- **`ya_winter`'s new hair:** a faceted slab that goes from blonde to near-black over the lower third, with dark specks near the crown and a small hole at the left shoulder (`n/NF.png`). Seen from behind at normal distance.
- `woman_sash`'s scalp specks (`n/HAIR.png`).
- `woman_mini`'s black slab and the square hair blocks under caps (`n/HC.png`).
- `adult_beret`'s beret is a stiff pillbox cylinder with a nub on top (`n/HAIR.png`). Within 0.3 m from behind, her bob's nape is torn into light diamond gaps (`e/eye_sum_crop_bike_idle_a_far.png`, close only).
- `adult_tie_suit`: the shirt collar is ragged on the far model (`n/FAR.png`, 3.6 m; not visible at the distances where the far model is used).

## 4. Top ten defects, in priority order

1. **Who sits: every skirt, dress and kilt stands.** 7 of 11 standers at eye height in an Ibrox inner ride; no seated skirt in 5 runs. This now also drives the car garment mix (item 3).
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=inner&station=ibrox" e2/eye 40 6`
   - Census: `node gp8.mjs "mode=ride&q=high&line=inner&station=shields-road" g/sr 200; python3 who.py g/sr.json`
2. **Brisk-walk crouch** (LEG 7.8, p10 6.1; SMO p10 7.2; `adult_heel_boots` @1.9 = 7.9).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,man_commuter none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
3. **Car garment mix over half.** Shields Road inner ride, saloon within 15 m: trousers 56-58 % in 16 of 20 samples. Hillhead platform still reaches 58 % in some runs (8 of 20 in one of three).
   - Reproduce: `node gp8.mjs "mode=ride&q=high&line=inner&station=shields-road" g/sr 200; python3 cen4.py g/sr.json`
4. **`ya_winter`'s new hair:** blonde slab fading to near-black at the ends, dark specks, a small hole at the shoulder.
   - Reproduce: `for l in 0 1; do ANGS='[["F",3.4,0.15],["B",0.6,0.15]]' node shoot2.mjs $l ya_winter none stand n/nf$l chest; done`
5. **The last lookalike pair:** `woman_bob` and `ya_ginger_long`. Also smirks, pouts and the white eye at a 0.4 rad glance (`man_longcoat`).
   - Reproduce: `DIST=0.85 node face3.mjs woman_bob,ya_ginger_long,man_longcoat f/cs "0:0;0.4:0.1" 1 8611 "" 14`
6. **Turn-aways:** 20 in 3 runs, 6 of them "to keep the garment mix", 4 of them children. Repeats: `adult_cyclist`, `adult_cap_baggy`, `sum_chino_shorts_m`.
   - Reproduce: `OUT=w/x node gaway5.mjs "mode=explore&q=high&line=inner&station=kinning-park" 300`, then read `XAWAY` and `REPEATS`.
7. **Garment faults in the stride:** the kilt slit and flat sporran; notched hems (`woman_coat`, `ya_smile_dress`); `woman_puffer`'s blotchy shorts.
   - Reproduce: `ANGS='[["F",2.8,0.1],["S",1.9,0.1]]' node shoot2.mjs 0 man_highland,woman_midi,woman_coat,adult_beret,teen_skirt,woman_puffer,ya_smile_dress,ya_winter none walk@162 n/g legs`
8. **Jam stop-start bursts:** `teen_hood` 4 toggles in 7.9 s (Buchanan Street outer).
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`
9. **Standing texting phone:** a flat bar floating over the fingers at the waist (6 of 6).
   - Reproduce: `KIND=text DIST=0.5 N=6 node gcall2.mjs h/t3`
10. **Hair:** `woman_mini`'s black slab, square hair blocks under caps, `woman_sash`'s scalp specks, `adult_beret`'s pillbox beret.
    - Reproduce: `ANGS='[["B",0,0.15],["Q",0.8,0.2]]' FD=0.9 node shoot2.mjs 0 woman_mini,adult_sport_cap,boy_cap,ya_winter none stand n/hc face`
    - And: `ANGS='[["F",3.14,0.5],["T",3.14,1.2],["B",0,0.3]]' FD=1.0 node shoot2.mjs 0 ya_winter,woman_sash,adult_beret,elder_man_suit,adult_tie_suit none stand n/hair face`

## 5. What I could not observe

- **No motion watched.** Motion was judged from bones every 1/30 s and from stills.
- **The haggis on stairs in a still.** Its height ramps smoothly on the stairs, but every camera I placed ended inside a wall.
- **Blink and smile timing in play.**
- **The shopper on the texting hand in the game:** seen only in the viewer.
- **Whether the paused-foot moves are slides or low steps.**
- **Whether "trousers" should be split into jeans and trousers.** The meta lumps them, and I followed review 38 in doing so. Split, the car and platform shares would fall below half.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | Kelvinhall outer explore; Ibrox outer ride (100 s each) | `sl/*.json`, `jump.py`, `flick.py`, `skid2.py` |
| Brisk walk at 1.8 m/s, 6 phases | `adult_heel_boots`, `ya_tube_heels`, `man_commuter` | `n/BW.png` |
| Walk, 8 phases from the side | 8 people incl. the rebuilt men, children, the haggis owner | `n/WS.png` |
| Garments in the stride | 8 skirt, dress, kilt and coat wearers | `n/G.png` |
| All 4 sit clips, 2 views | 6 people the game seats (incl. `elder_man_suit`, `adult_tie_suit`, `girl_shorts`) | `n/STF.png`, `n/STS.png` |
| Seated in the game, 3 views | Cessnock inner ride, 13 riders | `sd/CE.png` |
| Faces | all 99 at 1.6 m; 8 at 0.85 m neutral, smiling, glancing | `f/ALLs*.png`, `f/TW.png`, `f/CS.png` |
| Hair from above, behind and 3/4 | `ya_winter`, `woman_sash`, `adult_beret`, `elder_man_suit`, `adult_tie_suit`, `woman_mini`, `adult_sport_cap`, `boy_cap` | `n/HAIR.png`, `n/HC.png`, `n/TH.png`, `n/NF.png` |
| Far model | 6 incl. the 4 rebuilt, standing and walking | `n/FAR.png`, `n/NF.png`, `n/TH.png` |
| Luggage, 5 kinds × stand / walk / sit | `adult_tie_suit`, `ya_winter` | `b/BG.png` |
| Texting hands in the game | 6 texters, St Enoch | `h/T3.png` |
| Turned-away boarders | Govan outer, Kinning Park inner, Cowcaddens outer (300 s each) | `v/aw_*.log` |
| Children in cars | Govan outer, West Street inner, Kelvinbridge outer rides | `k/kid2_*.log` |
| Census, overlaps, far within 6 m, duplicates, who sits | Hillhead inner, Partick outer, Bridge Street inner (explore); Kelvinhall outer, Shields Road inner (ride), 200 s each; builder's `gmix` ×2 at Hillhead | `g/*.json`, `g/gmix_hh*.log` |
| Grips and per-car mix | Kinning Park inner ride, 150 s | `c/cw.log` |
| Player walks through full trains | Buchanan Street inner, Cessnock outer rides | `c/wk*.log` |
| Eye height in a car | St George's Cross outer ride, Ibrox inner ride | `e/EYE.png`, `e2/EYE.png` |
| The haggis | Partick inner ride, Kelvinbridge outer, Partick outer, Hillhead inner, Govan outer, St Enoch inner | `e/pet_*.log`, `e/p5_*.log` |
| Jam pauses | Buchanan Street outer, St Enoch inner, 200 s | `pz/*.log` |

Next round, look at:
- a seated skirt or dress that holds up in all four sit clips;
- the car garment mix in several rides, not just the platform;
- `ya_winter` from behind in a car;
- the haggis on stairs, with a camera that clears the walls.

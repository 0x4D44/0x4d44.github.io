# Under Glasgow: independent review of the people (review 41)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `499db447`. One commit since review 40 touches the people (read-only `git show 499db447`):
- `tools/assets_people_mpfb.py`: the baked smile is `0.6 * spec.smile`; `FACE_REGIONS.mouth` is 0.3 (was 0.45).
- `people.glb` and `people_lod.glb` rebuilt; `armfit.js`, `legradii.js` (one `woman_coat` radius), the skin budgets and `people_meta.json` triangle counts re-derived. No change to `people.js` or any other runtime code.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review41/`. The scripts are the review 40 set copied into `$R`, plus:
- `face4.mjs`: `face3.mjs` with `OLD=<dir>`, which routes `models/people.glb` and `people_meta.json` to the files from `HEAD~1`. This gives a true before/after on the same camera.
- `shoot3.mjs`: the same for `shoot2.mjs` (and the far model).
- `sheetl.py`: a labelled contact sheet.
- `gpet6.mjs` / `gpet7.mjs`: haggis stills. They failed; see section 5.

The old model files are in `$R/old/`. I deleted the instrument recording after scoring; `m/items.log` holds the result. Running notes: `NOTES.md`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.23 (8.229). Gate NOT met.**
- At 8 or above (seven categories): Behaviour 8.48, Arms 8.36, Luggage 8.36, Faces 8.32, Range 8.30, Whole bodies 8.26, Walking 8.16.
- Below 8: Clothing 7.84.

In short:
- **Claim 1 mostly holds.** I compared the same 12 faces from the old and new files, neutral and smiling, at 0.6 m (`f/OC1.png`, `f/OC2.png`).
  - **Better at rest:** `ya_smile_polo`'s and `ya_tattoo_tank`'s smirks are gone. `ya_ginger_braid`'s and `woman_student`'s mouths are neutral.
  - **Better, not fixed:** `girl_ginger` still has a faint dimpled smile at rest, and `ya_ginger_long` still smirks.
  - **No better:** `teen_runner`'s corner is still pulled down.
  - **Worse:** `adult_smile_blouse` now rests with pursed, down-turned lips, and her full smile barely shows.
  - Full smiles on the rest still read as closed-mouth smiles (`f/S0-4.png`).
- **Claim 2 (not changed) is confirmed** wherever I re-checked it. One exception: the Hillhead platform mix was fine in both of my runs. The cars are the opposite story: a Kelvinbridge inner ride's saloon was over half trousers in 17 of 20 samples, because no skirt sits.
- **No new breakage from the rebuild.** I checked the 16 people whose skin budgets moved most, near and far, standing, sitting and walking. The far-model holes I found (`adult_vneck`'s shoulders, `ya_smile_polo`'s hem) are in the old file too.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.7 | **8.36** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.7 | **8.48** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.23** (8.229) |

0.20x8.16 + 0.10x8.36 + 0.10x8.32 + 0.10x8.48 + 0.10x8.30 + 0.15x7.84 + 0.10x8.36 + 0.15x8.26 = 1.632 + 0.836 + 0.832 + 0.848 + 0.830 + 1.176 + 0.836 + 1.239 = 8.229.

Changes against review 40 (8.207):
- **Faces +0.10.** Four resting smirks are gone. Three remain, and one face got worse.
- **Clothing +0.08.** Hillhead's 78 % trousers platform did not come back in two runs. The worst case is now a car that is just over half trousers (52 %) for most of a ride, which is a milder breach.
- **Every other category is unchanged.** The walking instrument is identical (9.46).

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Baked smile at 60 %; seeded mouth range 0.3; both files rebuilt and repaired | **True in the code, and mostly better on screen.**<br>- Code: `assets_people_mpfb.py` has `sm = 0.6 * spec.get('smile', 0)` and `mouth=0.3`. Both `.glb` files changed and the skin budgets moved slightly.<br>- **Neutral, before and after (0.6 m):**<br>&nbsp;&nbsp;- `ya_smile_polo`: lopsided smirk gone.<br>&nbsp;&nbsp;- `ya_tattoo_tank`: upturned smirk gone.<br>&nbsp;&nbsp;- `ya_ginger_braid`: crooked mouth now straight.<br>&nbsp;&nbsp;- `woman_student`: neutral.<br>&nbsp;&nbsp;- `girl_ginger`: grin softened to a faint dimpled smile. It still reads as smiling at rest.<br>&nbsp;&nbsp;- `ya_ginger_long`: smirk slightly weaker, still there.<br>&nbsp;&nbsp;- `teen_runner`: corner-down lopsided mouth unchanged.<br>&nbsp;&nbsp;- `teen_ginger`, `adult_tattoo_muscle`: still crooked.<br>&nbsp;&nbsp;- **`adult_smile_blouse`: worse.** She rests with pursed, down-turned lips, and her full smile is barely visible.<br>- **Smiling (morph 1.0):** most read as natural closed-mouth smiles. `teen_ginger`'s and `ya_tattoo_tank`'s go up one side more than the other. `man_highland` and `man_kilt_casual` smile lopsided.<br>- **The narrower mouth range left many neutral faces sulky,** with pouting lips or turned-down corners: `woman_dress`, `man_puffer`, `teen_hippy`, `ya_smile_dress`, `adult_harem`, `adult_camisole`, `sum_tee_leggings`, `adult_lusekofta` (`f/N0-3.png`). | `f/OC1.png`, `f/OC2.png`, `f/N0-4.png`, `f/S0-4.png` |
| 2 | Not changed: who sits, Hillhead platform mix, platform edge, crouch / heels, stride garment faults, turn-aways, open pole hands, jam bursts, hair items, `man_longcoat`'s white eye | **Confirmed, item by item:**<br>- **Who sits:** no skirt, dress or kilt is seated in any of 5 census runs (`who.py g/*.json`). Kelvinbridge inner: skirts stand 53, trousers sit 234. Bridge Street outer: kilts stand 38.<br>- **Hillhead inner platform: not reproduced.** 0 of 20 samples over half (max 46 %) and 1 of 16 (67 % of 6 people) in two runs (`g/hh.json`, `g/hh2.json`).<br>- **Edge:** 41 of 599 crowd samples within 0.6 m at Govan inner, 0 at Hillhead outer and St Enoch outer (`v/aw_*.log`).<br>- **Crouch:** `adult_heel_boots`, `ya_tube_heels` at 1.8 m/s (`n/BWs.png`). Instrument identical.<br>- **Open pole hands:** `woman_coat` and `teen_girl`, Ibrox inner ride, the same standers as review 40 (`e2/POLE.png`).<br>- **Jams:** `woman_bob` 8 toggles in 13.4 s (36 a minute) at Buchanan Street inner (`pz/p_bs.log`).<br>- **Hair:** `woman_mini`, `woman_sash`, `ya_ginger_long`, `teen_crop_leggings` unchanged (`n/HRs.png`).<br>- **White eye:** `man_longcoat` at 0.4 rad, still mostly white in one eye (`f/MK.png`). | as listed |

## 2. Status of REVIEW_40's top ten

| # | REVIEW_40 item | Now | Evidence |
|---|---|---|---|
| 1 | Who sits: every skirt, dress and kilt stands | **Not fixed.** 0 seated in 5 runs. At Kelvinbridge inner, the seated part of the saloon was 11 trousers, 6 shorts, 4 leggings and 0 skirts. Skirts are only at the poles. Ibrox inner standers at eye height are again `woman_coat`, `elder_woman_dress`, `ya_smile_dress`, `teen_skirt`, `man_highland` and `teen_girl`. | `g/kb.json`, `who.py`, `e2/EYE*` |
| 2 | Hillhead platform mix (78 %) | **Not seen in two runs** (0 of 20, 1 of 16). The builder changed nothing, so the spread is run-to-run. The worst case moved to the cars (item 2 below). | `g/hh*.json` |
| 3 | Brisk-walk crouch | Not fixed. | `n/BWs.png`, `m/items.log` |
| 4 | Turn-aways; people at the edge | **Not fixed, and more for the garment mix.** 22 turned away in 3 runs: 14 for the garment mix (review 40: 8), 1 child (`girl_ginger`). Repeats: `adult_cap_baggy` 3 times in 2 runs, `adult_vneck`, `adult_camo_cap`. Edge: 41 samples at Govan inner. | `v/aw_*.log` |
| 5 | Smirks and pouts; white eye | **Partly fixed** (claim 1). Smirks: 3 left, plus 1 new pursed mouth. Pouts unchanged, and the white eye unchanged. | `f/OC*.png`, `f/MK.png` |
| 6 | Garment faults in the stride | Builder: unchanged. Not re-shot. | - |
| 7 | Open pole hands | Unchanged. | `e2/POLE.png` |
| 8 | Jam stop-start bursts | Unchanged: 36 a minute (Buchanan Street inner), 20 a minute (St Enoch outer). | `pz/*.log` |
| 9 | `ya_ginger_long`'s cards, `ya_winter`'s crown, `teen_crop_leggings`' slab | Unchanged. | `n/HRs.png`, `f/N3.png` |
| 10 | `woman_mini`, caps, `woman_sash`, beret | `woman_mini` and `woman_sash` unchanged. The caps look acceptable at 0.9 m from front, back and above (`adult_cap_baggy`, `boy_cap`, `adult_camo_cap`). The beret is still a pillbox with a nub. | `n/HRs.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- Instrument, all 99 people at 5 speeds: 9.46, identical to review 40 (`m/items.log`). LEG 7.8 (p10 6.1), SMO p10 7.2; worst recording `adult_heel_boots` at 1.9 m/s, 7.9.
- Worst tenth:
  - The heel crouch (`n/BWs.png`).
  - Jam bursts: `woman_bob` 8 toggles in 13.4 s; `woman_midi` 6 in 10.5 s.
  - Paused-foot moves on near models (`pz/p_bs.log`): `woman_puffer` 15.7 cm at 2.2 m, `teen_skirt` 14.9 cm at 2.5 m. As before, the measure cannot tell a slide from a short step.

### 3.2 Arms and hands: 8.36 (typical 8.8, worst 7.7)
Good:
- 6 texters and 6 callers in the game at 0.5 m hold the phone properly (`h/PH.png`).
- Grips, Shields Road inner car: pole median 1.9 cm, max 3.0 cm; rail max 1.6 cm (`c/cw.log`).

Worst tenth: `woman_coat`'s and `teen_girl`'s open, flat pole hands at 1.1 m (`e2/POLE.png`).

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
I looked at:
- all 99 at 0.85 m, neutral and smiling (`f/N0-4.png`, `f/S0-4.png`);
- 12 faces before and after at 0.6 m (`f/OC*.png`);
- 6 faces before and after, plus a 0.4 rad glance, at 0.5 m (`f/MK.png`).

Better: four of the fixed smirks are gone.

Faults:
- **Still smiling at rest:** `girl_ginger` (faint, dimpled), `ya_ginger_long`.
- **Crooked at rest:** `teen_runner`, `teen_ginger`, `adult_tattoo_muscle`.
- **New:** `adult_smile_blouse`'s pursed, down-turned rest, and a smile that hardly shows.
- **Sulky or pouting at rest:** about 8 more faces. The roster as a whole reads a little glum.
- **Marks:** dark smudges at the eye corners of `teen_boy`, `woman_midi` and `sum_denim_shorts_m`; a red speck on `elder_shorts`' cheek; a grey patch on `girl_school_kilt`'s cheek. All are in the old file too (`f/MK.png`).
- **White eye:** `man_longcoat` at a 0.4 rad glance.
- **Lookalikes:** unchanged. Pale, black-haired young men: `man_commuter`, `man_hoodie`, `staff_hivis`, `man_student`, `man_highland`, `man_kilt_casual`. Blonde fringe girls: `girl_school_kilt`, `girl_small`.
- **Hair across the face:** `ya_ginger_long`; `woman_puffer`'s fringe cards over both eyes; `adult_cyclist`'s side slab.

### 3.4 Standing, sitting, behaviour: 8.48 (typical 9.0, worst 7.7)
Good:
- Five 200 s census runs: no duplicates, no far model within 6 m, and 3 short, moving overlaps in all.
- The player crossed full 4-car trains 12 of 12 times (West Street inner and Kelvinhall outer rides; `c/wk*.log`).
- Children are seated in the cars almost all the time (`k/*.log`).
- The Govan platform at eye height reads right (`pl/GV.png`).

Worst tenth:
- 22 turned away in 3 runs, 14 of them for the garment mix. `adult_cap_baggy` was turned away 3 times in 2 runs.
- 41 samples within 0.6 m of the edge at Govan inner.
- `boy_shorts` stands about 10 s at 5.5 m from the nearest adult, Partick inner ride, probably while alighting.
- Jam bursts.

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged roster and spread. `woman_student` and `man_hoodie` wear the same black zipped hoodie and jeans (`n/B0as.png`), which adds to the lookalike problem.
- A child turned away (`girl_ginger`).

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
Census (`cen4.py`; samples where over half the people within 15 m are in one garment group; "trousers" includes jeans):

| run | platform | saloon | all |
|---|---|---|---|
| Hillhead inner explore | 0 of 20 (max 46 %) | 0 of 8 | 0 of 20 |
| Hillhead inner explore, repeat | 1 of 16 (67 % of 6) | 3 of 8 (56 % shorts) | 0 of 20 |
| **Kelvinbridge inner ride** | 0 of 8 | **17 of 20 (52 % trousers, 13-14 of 25-27)** | 12 of 20 |
| Bridge Street outer ride | 0 of 10 | 0 of 20 | 0 of 20 |
| Partick outer explore | 0 of 20 | 4 of 8 (62 %, n = 8) | 0 of 20 |
| Shields Road inner ride, per car (n of 5 or more) | - | 1 of 23 | - |

Faults:
- The cars are the weak spot. No skirt, dress or kilt sits, so the seated rows are trousers, shorts and leggings, and only the standers wear skirts.
- Stride faults not re-shot; the builder says they are unchanged.

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- No luggage change. A rucksack and a holdall show on standers in the St Enoch outer car (`e/EYEs.png`); a shopper hangs from `man_longcoat`'s hand.
- The haggis owner was seated in the saloon for the whole of two Partick inner runs. My stills ended outside the car shell (`pet/PA.png`, `pet/PQ.png`), so I have no new view of it.
- Worst tenth: as in review 40.

### 3.8 Whole bodies: 8.26 (typical 8.7, worst 7.6)
Good:
- The 16 people whose budgets changed most are whole near and far, standing, sitting and walking (`n/B0as.png`, `n/B0bs.png`, `n/B1as.png`, `n/B1bs.png`).

Faults:
- Far model:
  - `adult_vneck` has dark blobs at the straps;
  - `ya_smile_polo` has dark holes at the polo's hem, worst when seated.
  - Both are in the old file too (`n/OLD1.png`), and the near models are clean (`n/N0B.png`). The far model is only used from about 11 m, so they are small.
- Hair: as listed in section 2, items 9 and 10.

## 4. Top ten defects, in priority order

1. **Who sits: every skirt, dress and kilt stands.** It makes the seated rows trousers, shorts and leggings, and keeps a Kelvinbridge saloon just over half trousers.
   - Reproduce: `node gp8.mjs "mode=ride&q=high&line=inner&station=kelvinbridge" g/kb 200; python3 cen4.py g/kb.json; python3 who.py g/kb.json`
2. **Car garment mix over half:** Kelvinbridge inner saloon 17 of 20 samples (52 %); Partick outer saloon 4 of 8. Same reproduce as item 1.
3. **Brisk-walk crouch** (`adult_heel_boots`, `ya_tube_heels`; LEG 7.8, p10 6.1).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,woman_dress none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
4. **Turn-aways and the edge:** 22 in 3 runs (14 for the garment mix, 1 child). `adult_cap_baggy` turned away 3 times. 41 samples under 0.6 m from the edge at Govan inner.
   - Reproduce: `OUT=w/x node gaway5.mjs "mode=explore&q=high&line=inner&station=govan" 300`, then read `XAWAY`, `REPEATS` and `CROWD_EDGE`.
5. **Resting mouths:** `girl_ginger`'s faint smile; `ya_ginger_long`'s smirk; `teen_runner`, `teen_ginger` and `adult_tattoo_muscle` crooked; `adult_smile_blouse` now pursed, with a weak smile; about 8 sulky pouts.
   - Reproduce: `OLD=$R/old DIST=0.6 node face4.mjs <ids> f/o "0:0" 0` against the same command without `OLD`.
6. **`man_longcoat`'s white eye at a 0.4 rad glance**, and the lookalike pale, dark-haired young men.
   - Reproduce: `DIST=0.5 node face4.mjs man_longcoat f/k "0:0;0.4:0.1" 0`
7. **Open pole hands** (`woman_coat`, `teen_girl`).
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=inner&station=ibrox" e2/eye 40 6`
8. **Jam stop-start bursts** (36 a minute, `woman_bob`, Buchanan Street inner).
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 200`
9. **Hair:** `ya_ginger_long`'s cards over the eye, `woman_puffer`'s fringe over both eyes, `woman_mini`'s slab, `woman_sash`'s specks, `teen_crop_leggings`' strips.
   - Reproduce: `ANGS='[["F",3.4,0.15],["B",0.6,0.15],["T",3.14,1.2]]' FD=1.0 node shoot2.mjs 0 ya_winter,ya_ginger_long,teen_crop_leggings,woman_mini,woman_sash none stand n/hr face`
10. **Far-model holes:** `ya_smile_polo`'s hem (seated) and `adult_vneck`'s straps. Also the garment faults in the stride (not re-shot).
    - Reproduce: `node shoot2.mjs 1 adult_vneck,ya_smile_polo none sit,stand n/b1 body`

## 5. What I could not observe

- **No motion watched.** Motion was judged from bones and stills.
- **The haggis in the game:** the owner sat in the saloon through two Partick runs, and my cameras ended outside the car shell. The third run had no owner.
- **Garment faults in the stride, and near-model feet on the stairs:** not re-shot.
- **Blink and smile timing in play.**
- **Whether the Hillhead result is a fix or luck:** no runtime code changed, so it is run-to-run spread.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Brisk walk, 6 phases | `adult_heel_boots`, `ya_tube_heels`, `woman_dress` | `n/BWs.png` |
| Faces | all 99 at 0.85 m, neutral and smiling; 12 before/after at 0.6 m; 6 before/after with a glance at 0.5 m | `f/N*.png`, `f/S*.png`, `f/OC*.png`, `f/MK.png` |
| Bodies after the rebuild | 8 near and 8 far people, stand / sit / walk, 3 views; old/new far model | `n/B0*.png`, `n/B1*.png`, `n/OLD1.png`, `n/N0B.png` |
| Hair and caps | 9 people, front / back / top at 0.9 m | `n/HRs.png` |
| Phones in the game | 6 texters, 6 callers | `h/PH.png` |
| Eye height in cars | Ibrox inner, St Enoch outer rides | `e2/POLE.png`, `e/EYEs.png` |
| Platform at eye height | Govan inner | `pl/GV.png` |
| Census, overlaps, far within 6 m, duplicates, who sits | Hillhead inner x2 (explore), Kelvinbridge inner (ride), Bridge Street outer (ride), Partick outer (explore) | `g/*.json`, `g/*.log` |
| Turned-away boarders, edge | Hillhead outer, Govan inner, St Enoch outer (300 s each) | `v/aw_*.log` |
| Children in cars | Partick inner, Cowcaddens outer rides | `k/*.log` |
| Player walks through full trains | West Street inner, Kelvinhall outer rides | `c/wk*.log` |
| Grips and per-car mix | Shields Road inner ride | `c/cw.log` |
| Jam pauses | Buchanan Street inner, St Enoch outer | `pz/*.log` |
| Haggis | Partick inner x2 (failed stills) | `pet/*` |

Next round, look at:
- the car mix on more rides (Kelvinbridge especially);
- a haggis still taken inside the car's own frame;
- the stride garment faults;
- `adult_smile_blouse`'s face.

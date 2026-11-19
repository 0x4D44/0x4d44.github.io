# Under Glasgow: independent review of the people (review 32)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `32e10c8a` (people code). Three commits since review 31 touch the people (read-only `git diff 46f5de47 32e10c8a`):
- `index.js` `_routeBoarder`: the seat filter now applies `footOn(s)` to every boarder, not only those with a bag.
- `index.js` alighting: a seated rider is not made a leaver when anyone not seated is within 0.55 m of their rise spot `(±0.2, z)`.
- `index.js` fallback stand spot: 0.6 m (was 0.5) from other standers and planned stands.
- `haggis.js` / `people.js`: `followStep` takes an avoid list (everyone in the same group within a 1 m box, except the owner) and pushes the haggis out to 0.36 m from each one's **centre**.

`people.glb`, `people_lod.glb` and the walk code did not change. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before reading bones. The container restarted mid-review; the interrupted runs (one ride, the batch of misc runs, the walking instrument) were re-run from the start.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.87 (7.874). Gate NOT met.** Four categories are at 8 or above: Behaviour 8.22, Luggage 8.12, Range 8.06. Whole bodies is 7.98. Below 8: Walking 7.64, Faces 7.68, Clothing 7.70, Arms 7.86, Whole bodies 7.98.

In short:
- **Claim 1 works.** In 14 rides of 200 s (8 of them the stations of reviews 30-31), no stander's legs came within 8 cm of a seated rider's legs (`leg<0.06` and `leg<0.10` both 0 in every ride). Review 31 had 75-85 s contacts in 3 of 26 rides. No seated hand rested on a stander.
- **Claims 2 and 3 are true as code. The 0.40 m stander pairs remain** in 4 of 14 rides (review 31: 7 of 26), each with a hand 1-9 cm from the neighbour's thigh:
  - Govan inner, t = 105-115 s: ya_bootcut and teen_tee. Both boarded **to seats** at t = 3.7 s (`RB` line), so at t = 105 they are alighters who rose and wait shoulder to shoulder at a door. Hand 1.1 cm from her thigh (`e5/HIP.png`, first panel).
  - Shields Road outer, t = 185-195 s: sum_loose_shorts_w and ya_smile_halter, hands 3.5 and 4.4 cm on each other's legs (second panel).
  - Cessnock outer, t = 90 s: boy_cap and boy_shorts (third panel).
  - West Street outer, t = 70-90 s: ya_bootcut (pole) and elder_man_suit (stand), both boarders. **Planned 0.72 m apart** (pole spot (-0.22, 5.04), fallback spot (-0.20, 5.76)), but they **ended 0.40 m apart** for 25 s with his hand 8 cm from her thigh (`e5/outer_west-street_h_elder_man_suit-ya_bootcut.png`). The 0.6 m rule holds at planning; something moves one of them afterwards.
- **Claim 4 helps on the platform but misses seated people.** The push is from each person's centre (the pelvis). A seated person's feet are about 0.5 m in front of their pelvis, so the haggis can sit under them.
  - Shields Road outer explore: the owner rode seated in a passing train. The haggis sat **inside adult_camisole's right foot for 68 s** (every tick from t = 5.5 to 73.5 s, foot 7.5 cm from its centre, inside its body). See `e/PETA.png`: her red heel is in the haggis.
  - On platforms: one tick with a walker's foot inside it (Partick), against 5 samples in review 31.
  - 8 runs; the owner appeared in 5.
- **Not changed and still there:**
  - Instrument identical to review 31 (`m/items.log`; only the header lines differ).
  - Stop slides: 7 of 24 pauses over 10 cm. woman_bob 0.14 m at 3.9 m; woman_mini 0.41 m at 9.1 m. Toggles up to 31 a minute.
  - Turned-away boarders: 4 of 18 ended within 1 m of the edge. man_elder stood 111 s at 0.44 m from the edge, 2.2 m from the camera; sum_shorts_asian_m stood 211 s at 0.8 m, 2.1 m from the camera.
  - Grips: up to **14 cm** off the rail (adult_tattoo_muscle, St George's Cross inner), 5 of 69 holders over 4 cm (review 31: 9.3 cm).
  - Kilt knee, midi hem, school sleeves and notched tees: all seen again (`n/CL.png`, `n/KW.png`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review32/`. I deleted the walking recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.5 | **7.64** |
| 2 | Arms and hands | 10 | 8.5 | 6.9 | **7.86** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.5 | **8.22** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.1 | **8.12** |
| 8 | Whole bodies | 15 | 8.5 | 7.2 | **7.98** |
| | **Weighted mean** | 100 | | | **7.87** (7.874) |

0.20x7.64 + 0.10x7.86 + 0.10x7.68 + 0.10x8.22 + 0.10x8.06 + 0.15x7.70 + 0.10x8.12 + 0.15x7.98 = 1.528 + 0.786 + 0.768 + 0.822 + 0.806 + 1.155 + 0.812 + 1.197 = 7.874.

Changes against review 31 (7.840):
- **Behaviour +0.18 (typical 8.6 to 8.7, worst 7.2 to 7.5).** No knee-zone contact in 14 rides. No alighter rose into a stander, and no body overlap in a car. Still in the worst tenth:
  - 0.40 m pairs at doors;
  - turned-away boarders at the edge;
  - who sits;
  - the haggis under a seated stranger's foot.
- **Arms +0.06 (worst 6.75 to 6.9).** No seated hand on a stander. But hands still rest on neighbours' thighs in 4 of 14 rides, and grips opened to 14 cm.
- **Luggage +0.04 (worst 7.0 to 7.1).** The haggis keeps out of standing legs; it does not keep out of seated legs.
- **Whole bodies +0.04 (worst 7.1 to 7.2).** No 0.09 m or 0.19 m overlap this round. The garment and cap-hair faults are unchanged.
- **Walking, Faces, Range, Clothing: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Every boarder passes over a seat with someone standing in front of it (`footOn` for all) | **True, and it works.**<br>- In 14 rides of 200 s: 0 knee-zone pairs under 10 cm, and 0 seated hands on standers.<br>- Review 31 had 3 of 26 rides with 75-85 s contacts. | `e5/n5_*.log` (`KNEEPAIRS`, `K`, `RB` lines) |
| 2 | A seated rider does not rise to alight with a stander within 0.55 m of the rise spot | **True as code. No fault seen.**<br>- No overlap in a car in the Partick outer ride (`g/pa.json`).<br>- No knee or rise contact in 14 rides.<br>- Not proved directly: my hip metric skips walkers, and I did not log each rise.<br>- The rule only checks the rise spot. Alighters still wait at doors 0.40 m apart, hand on thigh (Govan inner, Shields Road outer). | `e5/HIP.png`, `e5/n5_inner_govan.log` |
| 3 | Fallback stand spot keeps 0.6 m from other standers | **True as code, but the gap does not last.**<br>- West Street outer: the boarders were planned 0.72 m apart and stood 0.40 m apart for 25 s.<br>- Pole spots (`poleSpot`) do not use the 0.6 m rule. | `e5/n5_outer_west-street.log`, `e5/outer_west-street_h_elder_man_suit-ya_bootcut.png` |
| 4 | The haggis is pushed to 0.36 m from anyone other than its owner | **True as code. Good on platforms, wrong for seated people.**<br>- The distance is from the person's centre, so a seated person's feet are about 0.5 m outside it.<br>- In a car: inside adult_camisole's foot for 68 s.<br>- Platform: one tick in a walker's foot (Partick), against 5 samples last round. | `e/pet_*.log`, `e/PETA.png`, `e/PETB.png` |
| 5 | Not changed: crouch, slide, toggles, turned-away boarders, who sits, garments, snaps, grips, cap hair, faces, tote | **True.**<br>- Instrument identical.<br>- Slides: 7 of 24 pauses; 0.41 m at 9.1 m.<br>- Turned away: 4 of 18 at the edge.<br>- `_canSit` list unchanged.<br>- Garments as before.<br>- No snap in 300 s at Govan outer.<br>- Grips to 14 cm. | `m/items.log`, `pz/p_bs.log`, `v/aw_*.log`, `v/go.log`, `c/sg.*`, `n/CL.png` |

## 2. Status of REVIEW_31's top ten

| # | REVIEW_31 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). | `m/items.log` |
| 2 | A boarder sits in front of a stander | **Fixed in this sample:** 0 of 14 rides. | `e5/n5_*.log` |
| 3 | Standers hip to hip, hands on thighs | **Improved, not fixed:** 4 of 14 rides (was 7 of 26), pelvises 0.40 m apart, hands 1.1-9 cm from thighs. They are alighters waiting at doors, or boarders whose gap shrank after planning. No overlaps under 0.3 m in a car. | `e5/HIP.png`, `e5/n5_outer_west-street.log` |
| 4 | Stop slide, toggles | Not fixed: 7 of 24 over 10 cm; 0.14 m at 3.9 m; 0.41 m at 9.1 m; up to 31 a minute. | `pz/p_bs.log` |
| 5 | Turned-away boarders at the edge | Not fixed: 4 of 18. man_elder 111 s at 0.44 m from the edge (2.2 m from the camera); sum_shorts_asian_m 211 s at 0.8 m (2.1 m from the camera). | `v/aw_ib.log`, `v/aw_hh.log` |
| 6 | Who sits | Not fixed. Census of the Partick outer ride: every seated rider wears trousers, shorts or leggings; skirts, dresses and kilts stand. | `g/pa.json` (`cen`) |
| 7 | Garments | Not fixed: midi hem fragments, kilt knee through the kilt in the walk, strip sleeves, notched tees. New: a hole at man_kilt_casual's left hip in the standing quarter view. | `n/CL.png`, `n/KW.png` |
| 8 | The haggis | **Partly fixed.** It keeps out of standing and walking legs. It does not keep out of seated legs (68 s inside a seated stranger's foot). | `e/PETA.png` |
| 9 | Grips, snaps | Grips **worse in this sample**: 14 cm (rail). No snaps (Govan outer, 300 s). | `c/sg.json`, `v/go.log` |
| 10 | Cap hair, faces, phone hand, tote | Not fixed (code unchanged). 22 new faces (below). | `f/N.png`, `f/S.png`, `f/Z.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.64 (typical 8.4, worst 6.5)
- The instrument over all 99 is identical to reviews 30-31: overall 9.47; LEG 7.8, p10 5.9; SMO p10 7.1; worst adult_heel_boots @1.9 m/s = 7.7; LEG.kneeSt 6.9.
- Stop slide at Buchanan Street outer: woman_bob 0.14 m at 3.9 m; adult_baggy_knit 0.18 m at 5.7 m; woman_mini 0.41 m at 9.1 m.
- Toggles up to 31 a minute (sum_loose_shorts_w).

### 3.2 Arms and hands: 7.86 (typical 8.5, worst 6.9)
- Seated hands on standers: none in 14 rides.
- Standers' hands on neighbours' thighs:
  - ya_bootcut on teen_tee, 1.1 cm;
  - ya_smile_halter on sum_loose_shorts_w, 3.5 cm;
  - elder_man_suit on ya_bootcut, 8 cm.
- Grips: rail grips at 14 and 12.3 cm (adult_tattoo_muscle), 11 cm (adult_beret), 10.9 cm (elder_woman_dress). The median is 1.8-1.9 cm, which is good.
- Sit-phone stills show an empty hand in the viewer (as before).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
I looked at 22 faces not in the lists of reviews 25-31, neutral and smiling (`f/N.png`, `f/S.png`; ids in `f/ids.txt`). They differ by age, sex and skin tone, and the smiles are small but fitted. Faults (`f/Z.png`):
- girl_small: a lumpy, swollen face; the smile lifts one corner into a crooked crease.
- sum_denim_shorts_m: lids of different heights (one eye half shut), a black shard of hair across one eye, blotchy pale skin.
- woman_elder: spidery black lashes.
- adult_suit_bun: a flat, featureless face.
- Several have hairlines cut straight across: teen_crop_leggings, sum_shorts_asian_m.
- Brows are dotted on most.

### 3.4 Standing, sitting, behaviour: 8.22 (typical 8.7, worst 7.5)
Good:
- No knee-zone contact in 14 rides.
- The walk through a full Buchanan Street inner train finished 6 of 6 (min 0.40 m, `c/wk.log`).
- No far model within 6 m and no duplicates (`g/pa.log`, `g/se.log`).
- No overlap in a car.
- No snap in 300 s.
- Seated people sit in their seats (`n/SIT0.png`, `n/SIT1.png`, `e/EYE.png`).

Worst tenth:
- 0.40 m pairs at doors with hands on thighs.
- Turned-away boarders 111-211 s within 1 m of the edge, about 2 m from the camera.
- Skirts, dresses, kilts and luggage owners never sit.
- The haggis inside a seated stranger's foot.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- girl_small and girl_school_kilt again stand alone at poles (`e/EYE.png`).

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
Mix:
- Cars: 0 of 55 car samples over half (St George's Cross inner).
- Census within 15 m in the Partick outer ride: 1 of 40 over half (platform, trousers 7 of 12).
- Seated: 6 more people shot in all four sit clips, front and side (sum_shorts_asian_m, teen_crop_leggings, woman_bob, adult_oxford_shirt, woman_scarf, ya_shorts). All clean; ya_shorts' denim hem is ragged at the hip.

Faults (unchanged):
- woman_midi's red hem fragments over the waistband, and a jagged slit in the walk.
- man_kilt_casual's knee through the kilt in mid-stride, a sporran swinging off the side, a hole at the left hip.
- girl_school_kilt's strip sleeves.
- teen_runner's notched hem.
- No seated skirt, dress or kilt.

### 3.7 Luggage: 8.12 (typical 8.8, worst 7.1)
- Bags as before: on laps when seated (tote, ruck, carrier, shopper); cases and trolleys stand (`g/pa.json` census).
- Holdall, case and trolley owners never sit.
- The haggis:
  - On the platform it stays on the floor and keeps out of walkers' legs (one tick in 5 runs).
  - The lead runs to the owner's hand.
  - In a car, beside its seated owner, it sits under the seated neighbour's foot for 68 s (`e/PETA.png`).

### 3.8 Whole bodies: 7.98 (typical 8.5, worst 7.2)
- Near model faults: cap hair (code unchanged), kilt knee and hip hole, girl_school_kilt's sleeves, woman_midi's hem, sum_denim_shorts_m's hair shard.
- Far model: 8 people with forcelod=1, standing and walking (`n/FAR.png`). Readable and whole, haggis included. Never within 6 m in play.
- No body overlap in a car this round.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Garments:** man_kilt_casual's knee through the kilt and a hole at his hip; woman_midi's hem; girl_school_kilt's strip sleeves; notched tees. And **who sits**: no skirt, dress, kilt or luggage owner ever sits, so a seated car is all trousers and shorts.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 woman_midi,man_kilt_casual,girl_school_kilt,teen_runner none stand n/cl waist`; `node shoot2.mjs 0 man_kilt_casual,woman_midi none walk@150,walk@162,walk@174 n/kw legs 1.7`.
3. **Pairs 0.40 m apart with hands on thighs** (4 of 14 rides).
   - Alighters waiting at a door are not spaced.
   - A boarder pair planned 0.72 m apart ends 0.40 m apart.
   - Fix: give alighters' door-wait spots the same 0.6 m rule, and find what moves a placed stander after arrival.
   - Reproduce: `TH=0.10 node gnb5.mjs "mode=ride&q=high&line=inner&station=govan" 200 e5/x` (`P`, `H` and `RB` lines); also `outer west-street`, `outer shields-road`.
4. **Foot slide while stopping, toggles:** 7 of 24 pauses over 10 cm; 0.14 m at 3.9 m; 0.41 m at 9.1 m; 31 a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`.
5. **Turned-away boarders at the edge:** 4 of 18; 111 s at 0.44 m from the edge and 211 s at 0.8 m, each about 2 m from the camera.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=hillhead" 300 > x.log; python3 aw2.py x.log`; also `outer ibrox`.
6. **Grips open to 14 cm** on the rail (adult_tattoo_muscle 14 and 12.3 cm, adult_beret 11 cm, elder_woman_dress 10.9 cm); 5 of 69 over 4 cm.
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=st-georges-cross" c/x 150`.
7. **The haggis under seated legs.** The push uses each person's centre; a seated person's feet are about 0.5 m forward of it.
   - Fix: also push from seated people's foot bones (or from their feet's floor spot `(sign(x)*0.24, z)`, as `footOn` does).
   - Reproduce: `node gpet2.mjs "mode=explore&q=high&line=outer&station=shields-road" 150 e/x`. The owner spawns at random, so it is not in every run.
8. **Faces:** girl_small's swollen face and crooked smile; sum_denim_shorts_m's uneven lids and hair shard; spidery lashes (woman_elder); dotted brows; straight-cut hairlines.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.
9. **Hair through caps on the near model** (adult_sport_cap, adult_cap_shorts); the phone hand flat in `phone_call`; the tote lifted by the phone hand. All unchanged code.
   - Reproduce: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",2.4,0.1]]' node shoot2.mjs 0 adult_sport_cap,adult_cap_shorts none stand n/x face`.
10. **Children alone:** girl_small and girl_school_kilt hold poles by themselves in a car (`e/EYE.png`).
    - Reproduce: `node geye2.mjs "mode=ride&q=high&line=outer&station=hillhead" e/x 40 6`.

## 5. What I could not observe

- **No motion watched.** Slides, toggles, contacts and the haggis's path come from per-tick positions and bone distances.
- **Rises directly.** I did not log each alighter's rise against nearby standers. The evidence that claim 2 works is indirect: no overlap in a car, and no knee contact.
- **What moves the West Street stander** from 0.72 m to 0.40 m. The boarding log shows the planned spots only.
- **Haggis jitter** when it is pushed between two people at once. I logged jumps over 0.5 m only, and they all came from the train's own movement.
- **Snaps:** none seen in one 300 s ride; the code is unchanged.
- **Blink and smile timing** in play.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Faces, neutral and smiling | 22 not seen in reviews 25-31 (`f/ids.txt`) | `f/N.png`, `f/S.png`, `f/Z.png` |
| Garments, waist, standing; walk at 1.7 m/s, 3 phases | woman_midi, man_kilt_casual, girl_school_kilt, teen_runner | `n/CL.png`, `n/KW.png` |
| Far model, standing and walking | adult_string_vest (with haggis), woman_bob, teen_skater, sum_shorts_asian_m, woman_scarf, boy_shorts, ya_shorts, adult_oxford_shirt | `n/FAR.png` |
| Seated, 4 sit clips, front and side | 6 people the game seats (listed in 3.6) | `n/SIT0.png`, `n/SIT1.png` |
| Knee zone, hands, hip pairs, boarding log, 200 s rides | 14 rides: Cowcaddens, Kelvinhall, Shields Road, Govan, Partick, Hillhead, Bridge Street inner; Shields Road, Cessnock, Kelvinbridge, Ibrox, St George's Cross, West Street, Partick outer | `e5/n5_*.log`, `e5/HIP.png` |
| The haggis | 4 explore, 4 ride runs (owner present in 5) | `e/pet_*.log`, `e/PETA.png`, `e/PETB.png` |
| Overlaps, far within 6 m, duplicates, census | Partick outer ride, St Enoch inner explore, 200 s each | `g/pa.*`, `g/se.*` |
| Paused walkers | Buchanan Street outer, 200 s | `pz/p_bs.log` |
| Turned-away boarders | Ibrox outer, Hillhead inner, 300 s each | `v/aw_ib.log`, `v/aw_hh.log` |
| Vanishings, snaps | Govan outer ride, 300 s | `v/go.log` |
| Car garment mix and grips | St George's Cross inner, 150 s | `c/sg.*`, `c/GRIP.png` |
| Walk through a full train | Buchanan Street inner, 6 walks | `c/wk.log` |
| Eye height in a car | Hillhead outer, 6 holders x 3 views | `e/EYE.png`, `e/eye.log` |

Next round, look at:
- alighters waiting at doors;
- what moves a placed stander after arrival;
- the haggis beside seated people;
- the rise itself, logged per alighter.

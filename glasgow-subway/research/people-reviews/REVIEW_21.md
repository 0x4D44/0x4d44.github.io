# Under Glasgow: independent review of the people (review 21)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `5025e6f8` ("rebuilt people (review 20: brows, adult_vneck, elder_shorts)"). I read the diff since `a6394f66` read-only: 5 changed lines in `index.js` / `people.js`, the brow tint in `assets_people_mpfb.py`, and rebuilt GLBs. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.73 (7.734). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Only Luggage reaches 8 (8.16). The other seven are below 8.

The four behaviour claims hold as worded, but the most important one moved a fault instead of removing it:
- **Claim 3.** Nobody vanishes in the aisle any more. Instead, a boarder with no seat and nowhere to stand is never routed, keeps walking to the door point on the platform, and is **deleted there** (or after 2.5 s stuck in the crowd), usually with the doors open. **27 of 30** such boarders vanished on the platform over 5 rides and 1 explore run. Rendered: `v/IB.png` (a man at the open door is there, 0.6 s later he is gone).
- **Claim 1.** Stair feet are clear at 4 of 5 stations. Govan is not: one newcomer stood 0.9 m from the step for 81 s, and `waitAudit` `far` is **0.11** there, so the e2e test that wants `far > 1` still fails at Govan.
- **Claim 4.** The frozen walk at a stop is 0.25-0.3 s (was 0.5) and toggling is slower. But the 0.8 s hold before walking on means a pushed walker can **glide in the standing pose at up to 1.07 m/s** for 0.75 s (0.3-0.42 m, 2 episodes per 200 s run).
- **Claim 5.** Ginger brows now read as ginger. But the tint uses the *spec* hair colour, and the rendered hair colour is often different. girl_school_kilt has **olive-green brows** under auburn hair, and grey-haired men have dark blue-grey brows.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review21/`. The walking instrument was run without `--rec`, so no raw recording was kept. `m/rec.log` holds the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.4 | **7.60** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.0 | 6.6 | **7.44** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 5.8 | **7.48** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.4 | 7.0 | **7.84** |
| | **Weighted mean** | 100 | | | **7.73** (7.734) |

0.20x7.60 + 0.10x7.88 + 0.10x7.44 + 0.10x7.48 + 0.10x7.66 + 0.15x7.84 + 0.10x8.16 + 0.15x7.84 = 1.520 + 0.788 + 0.744 + 0.748 + 0.766 + 1.176 + 0.816 + 1.176 = 7.734.

Against review 20 (7.741):
- **Walking +0.04:** shorter freeze, fewer toggles; new standing-pose glides offset part of it.
- **Faces +0.10:** ginger brows fixed, adult_vneck has brows, elder_shorts' eye is uncovered; new tint faults on fair and grey hair.
- **Behaviour -0.48:** stair feet mostly fixed, but turned-away boarders now vanish in plain view on the platform, at about five per ride.
- **Luggage +0.14:** no seated case in three rides.
- **Whole bodies +0.06:** the elder_shorts hair slab is gone.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Waiting places within 2.2 m of a stair foot are passed over while any other is free | **True at 4 of 5 stations; Govan still fails.**<br>`gstair.mjs`, 180 s explore each, arrivals within 1 m of the bottom step:<br>- Cessnock inner 0 of 16;<br>- Hillhead inner 0 of 16;<br>- Partick outer 0 of 14;<br>- Buchanan Street inner 0 of 12;<br>- **Govan outer 1 of 17** (adult_heel_boots 0.9 m for 81 s; teen_cutoffs 1.2 m for 99 s).<br>Overall 1 of 75 (review 20: 16 of 81).<br>`waitAudit` `arr.far`: Govan **0.11** (fails `far > 1`); Partick 1.94; Buchanan St 4.5; Hillhead 8.3; Cessnock 11.3.<br>The fallback (`if (clear.length)`) lets a full platform end put people back near the foot. A render after 110 s at Govan shows a dense cluster under the "Way out / Stairs" sign, sum_shorts_asian_m 0.75 m from the step (`st/gv.log`, `st/GV.png`). | `st/*.log`, `st/GV.png` |
| 2 | Riders carrying a suitcase stand like those with a holdall or wheeled case | **True.** No seated `case` in 3 rides (Bridge Street outer, Shields Road outer, Govan inner). The `case` riders stand (ya_winter, adult_beret).<br>Seated carriers come to 2.8-14.7 cm from the middle line.<br>Note: `case` is the brown briefcase (`l/BAGS.png`), so every briefcase owner now stands for the whole ride. | `bs/b_*.log`, `l/BAGS.png` |
| 3 | A boarder with no seat and nowhere to stand waits for the next train (none walk in and vanish) | **True as worded; the fault moved to the platform.**<br>`_routeBoarder` now returns before routing. But a stair streamer was created by `crowd.stream()` with `mode: 'go'` toward the door and **no `onArrive`**. On reaching the door point (dd < 0.35), or after 2.5 s stuck, `people.js:942` drops them.<br>`gkeep3.mjs`, 5 rides of 200 s + 1 explore: **30 turned away; 27 vanished on the platform**, the other 3 were still walking at the end of the run. `gvan.mjs` confirms the reason is "no place" (7 of 7), with 6 of 7 vanishing while the doors were open.<br>Examples:<br>- adult_camo_cap vanished at the Ibrox stair foot (3.1, 19.99);<br>- ya_smile_polo vanished standing, 7.7 m short of the door;<br>- boy_small (a child) vanished at a Kelvinbridge door in explore mode.<br>Render: `v/IB.png` (black cap and tee at the open door, then gone 0.6 s later).<br>Routed boarders left behind: 15 of 46 resolved (33 %; review 20: 50 %). | `k/k3_*.log`, `k/k3x_*.log`, `v/*.log`, `v/IB.png` |
| 4 | Held-up walkers stand after 0.3 s still; walk on only on a clear move (> 0.25 m/s) after 0.8 s | **True.**<br>`gpause.mjs`, 3 rides: the frozen walk at the start of a stop is now a mean 0.29 s (review 20: 0.48). Highest sustained toggle rate is 17 a minute (girl, 6 in 21 s; review 20: 39).<br>**New:** `gglide.mjs` at Kinning Park and Partick: 4-5 % of paused frames move faster than 0.08 m/s. ya_ginger_braid glides 0.42 m at up to 1.07 m/s in the idle pose; woman_midi 0.42 m at 0.81 m/s; ya_tee_jeans 0.40 m.<br>**Unchanged:** a planted foot slides more than 10 cm in 35 of 69 paused episodes (p90 0.27 m, max 0.65 m; review 20: 40 of 84). | `pz/p_*.log`, `pz/glide_*.log` |
| 5 | Brows take the colour of light hair; adult_vneck eyebrow010; elder_shorts short02 | **Mostly true, with new tint faults.**<br>Better: teen_ginger, ya_ginger_braid, girl_ginger, ya_ginger_long, ya_ginger_lad and adult_beret have ginger brows (`f/NS_neutral.png`); adult_vneck has visible brows; elder_shorts' eye is clear (`n/HF.png`).<br>New faults: the tint is the spec `hair_col`, but the rendered hair is texture x tint, often a different colour.<br>- **girl_school_kilt:** olive-green brows under auburn hair.<br>- elder_man_suit, adult_tie_suit: dark blue-grey brows under white or grey hair.<br>- woman_elder (spec #d0d0d0, renders brown): spidery black lashes.<br>- elder_shorts: short02 has a hard straight hairline cut across the forehead. | `f/Z1.png`, `f/NS_*.png`, `n/HF.png` |
| 6 | Not changed: brisk crouch, seated coats/shorts/kilt, V smile, doll skin, dotted lashes, open high grips, phone hands, splay, coat bell, ragged hairlines, foot jumps | **True.**<br>- Instrument row-for-row identical: 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7.<br>- Seated man_kilt_casual shows skin through holes in the kilt; elder_woman_coat's coat is a bell (`n/SIT.png`).<br>- girl_ginger and ya_ginger_braid have a V smirk.<br>- Pole hands: boy_cap's palm is flat on the pole; man_highland's fist sits beside it (4-5 cm) (`p/SE.png`).<br>- elder_shorts holds his phone on a flat open palm (`n/HF.png`). | `m/rec.log`, `n/SIT.png`, `p/SE.png` |

## 2. Status of REVIEW_20's top ten

| # | REVIEW_20 item | Now | Evidence |
|---|---|---|---|
| 1 | Half the boarders miss the train; 1 in 10 vanish in the car | **Moved, not fixed.**<br>Routed boarders left behind: 33 % (was 50 %).<br>None vanish in the aisle, but 27 of 30 turned-away boarders vanish on the platform, about 5 per ride. | `k/`, `v/` |
| 2 | Newcomers stop at stair feet | **Mostly fixed.** 1 of 75 within 1 m (was 16 of 81).<br>Govan `waitAudit` far is 0.11, so the e2e still fails there. | `st/` |
| 3 | Brisk crouch, pelvis jolts | **Not fixed** (identical numbers; `w/BS.png`, adult_heel_boots at 1.9 m/s). | `m/rec.log`, `w/BS.png` |
| 4 | Jam stop-start, 0.5 s freeze, foot jumps | **Partly fixed.** The freeze is 0.3 s and toggles are at most 17 a minute.<br>Planted-foot slides are unchanged (half of the episodes are over 10 cm).<br>New: gliding in the standing pose. | `pz/` |
| 5 | Seated cases in the aisle middle | **Fixed** (case riders stand). | `bs/` |
| 6 | Faces | **Partly fixed.** Ginger brows, adult_vneck's brows and elder_shorts' eye are fixed.<br>Still wrong: V smiles, dotted lashes, doll skin, green or blue tinted brows. | `f/` |
| 7 | Open hands on high grips | **Not fixed.** | `p/SE.png`, `c/car_*.log` (2 of about 53 holders over 4 cm per ride, max 7.6 cm) |
| 8 | Seated garments | **Not fixed.** | `n/SIT.png` |
| 9 | Ragged hairlines, helmet hair | **Not fixed** (adult_runner's temple patches, `n/HF.png`). | `n/HF.png` |
| 10 | Flat phone palm, splay, coat bell | **Unchanged.** | `n/HF.png`, `e/BSs.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.60 (typical 8.4, worst 6.4)
- The instrument is unchanged (LEG 7.8, p10 5.9; SMO p10 7.1).
- Better: the freeze is 0.3 s, and toggling is calmer.
- Worst tenth:
  - the brisk crouch (heel_boots at 1.9 m/s, `w/BS.png`);
  - planted feet sliding 10-65 cm while paused;
  - new 0.3-0.4 m glides in the idle pose at walking speed.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Walking arms are fine (ARM 9.5).
- Pole hands still lie flat or make a fist beside the pole (`p/SE.png`).
- Rail holders stretch their arms out sideways. elder_woman_dress holds hers in a T at shoulder height.
- boy_shorts' "rail" hand is held out in the air (`e/BSs.png`).
- elder_shorts' phone sits on a flat palm.

### 3.3 Faces: 7.44 (typical 8.0, worst 6.6)
- 16 faces at fov 14, neutral and smiling (`f/NS_neutral.png`, `f/NS_smile.png`).
- Ginger brows now match the hair, a clear gain.
- Faults:
  - girl_school_kilt: green brows;
  - grey-haired men: blue-grey brows;
  - girl_ginger and ya_ginger_braid: V smirks;
  - elder_shorts: a crooked smile;
  - woman_elder: spider lashes;
  - everyone: dotted lashes and doll skin;
  - girl_school_kilt's far model has a pink lower lid and a smeared mouth (`n/HF.png`, row 3).

### 3.4 Standing, sitting, behaviour: 7.48 (typical 8.6, worst 5.8)
- Waiting, walk-throughs and seating are good:
  - walk-through 6 of 6 done, nearest pass 0.40 m (`c/wk_outer_ibrox.log`);
  - 0 duplicates;
  - stair stalls 0.
- The worst tenth is the boarders. About a quarter of decided boarders now disappear on the platform in front of open doors, and some disappear standing in the crowd. Per the rubric, a person vanishing is "broken".
- Also in the worst tenth:
  - one walker overlap of 1.2 s at 3.4 m from the camera (boy_cap and teen_skirt, min 0.18 m, `g/kh.json`);
  - the Govan stair foot.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- Mix is fine within 15 m: 0 of 42 samples over half (`g/*.json` via `cen3.py`).
- Cars: 1 of 117 car-samples over half (Hillhead, 3 trousers of 5).
- Seated kilt holes and the coat bell remain (`n/SIT.png`).

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- Seated cases are gone. Bags hang, wheel and sit correctly in the viewer (`l/BAGS.png`).
- Remaining: seated carriers' bags reach 2.8 cm from the middle line, and briefcase owners never sit.

### 3.8 Whole bodies: 7.84 (typical 8.4, worst 7.0)
- elder_shorts is fixed.
- Remaining:
  - adult_runner's ragged hairline;
  - the hard straight hairline on elder_shorts' short02;
  - holes in the seated kilt;
  - sum_crop_denim's far-model hair reads as a cap;
  - one far model within 6 m (ya_bootcut at 6.0 m, Kelvinhall).

## 4. Top ten defects, in priority order

1. **Turned-away boarders vanish on the platform.** 27 of 30 in 6 runs, most at the open door, some at a stair foot or standing in the crowd.
   - Cause: the stream walker has no `onArrive`, so `people.js:942` drops them on arrival or after 2.5 s stuck.
   - Fix: give a turned-away boarder an `onArrive` that returns `'keep'` (or `release()` them to a waiting place) so they wait for the next train.
   - Reproduce: `node gkeep3.mjs "mode=ride&q=high&line=outer&station=st-enoch" 200`, then `python3 rej.py k/k3_*.log`; render with `node gvan.mjs "mode=ride&q=high&line=inner&station=ibrox" 120 v/ib`.
2. **Brisk-walk crouch and pelvis jolts.** Unchanged: LEG p10 5.9, SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7.
   - Reproduce: `people_motion.mjs --people all --items --worst 12`.
3. **Feet slide while paused, and walkers glide in the idle pose.** 35 of 69 paused episodes have a foot slide over 10 cm (max 0.65 m). Glides reach 0.42 m at 1.07 m/s.
   - Fix: leave the pause at once if v > 0.5 (keep the 0.8 s hold only for creeping), and pin the planted feet while paused.
   - Reproduce: `node gglide.mjs "mode=ride&q=high&line=inner&station=kinning-park" 200`; `node gpause.mjs "mode=ride&q=high&line=outer&station=partick" 200`.
4. **Brow tint taken from the spec colour, not the rendered hair.** girl_school_kilt has green brows; elder_man_suit and adult_tie_suit have blue-grey brows.
   - Reproduce: `node face2.mjs girl_school_kilt,elder_man_suit,adult_tie_suit f/x "0:0" 0 8611 "" 14`.
5. **Faces otherwise:** V smirks (girl_ginger, ya_ginger_braid), dotted lashes, woman_elder's spider lashes, doll skin.
6. **Open or flat hands at the poles, T-armed rail holders.** boy_cap's palm is flat; man_highland's fist is beside the pole.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=inner&station=st-enoch" p/se 50 8`.
7. **Seated garments.** man_kilt_casual's kilt is holed; elder_woman_coat's coat is a bell.
   - Reproduce: `node shoot.mjs 0 man_kilt_casual,elder_woman_coat none sit n/x body`.
8. **Govan stair foot.** `waitAudit` far is 0.11; a newcomer stands 0.9 m from the step for 81 s.
   - Reproduce: `node gstair.mjs "mode=explore&q=high&line=outer&station=govan" 180 st/x`.
9. **Hairlines:** adult_runner's patches; elder_shorts' short02 cut straight across the forehead.
   - Reproduce: `node shoot.mjs 0 elder_shorts,adult_runner none stand n/x face`.
10. **Small items:**
    - elder_shorts' flat phone palm;
    - a 1.2 s walker overlap at 3.4 m (Kelvinhall explore);
    - one far model at 6.0 m;
    - briefcase owners never sit.

## 5. What I could not observe

- **No motion watched.** Glides, slides and vanishings come from per-frame numbers plus two-frame renders.
- **Blink and smile timing** in play.
- **In-game hair colour.** The viewer runs with `tint=0`. If the game tints hair at runtime, brow and hair colours may differ from what I saw.
- **Randomness:** loads vary, so turned-away counts per station range from 2 to 11.
- **A large case on a real stair.**

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log` |
| Brisk-walk stills, side, 4 phases | adult_heel_boots, man_puffer, teen_skater, woman_mini @ 1.9 m/s | `w/BS.png` |
| Held-up walkers (0.05 s) | Kinning Park inner, Shields Road outer, Partick outer rides | `pz/p_*.log` |
| Idle-pose glides | Kinning Park inner, Partick outer | `pz/glide_*.log` |
| Boarding outcomes incl. turned-away | rides: Partick outer, Ibrox inner, St Enoch outer, West Street inner, Shields Road outer; explore: Kelvinbridge outer | `k/k3*.log` |
| Vanish renders, reason (mix / place) | St Enoch outer, Ibrox inner | `v/*.log`, `v/IB.png` |
| Bag pop-in check | Ibrox inner, 200 s | `v/bp_ibrox.log` (0 changes) |
| Stair-foot census + waitAudit | Govan outer, Cessnock inner, Hillhead inner, Partick outer, Buchanan Street inner; render at Govan | `st/*.log`, `st/GV.png` |
| Seated bags vs middle line | Bridge Street outer, Shields Road outer, Govan inner | `bs/b_*.log` |
| Car garment mix and grips | Shields Road inner, Hillhead outer | `c/car_*.log` |
| Platform census (overlaps, duplicates, far model, 15 m mix) | Kelvinhall inner explore, Cowcaddens outer ride | `g/*.log/json` |
| Walk through a full train | Ibrox outer, 6 walks | `c/wk_outer_ibrox.log` |
| Eye-height car views | Buchanan Street outer: adult_piper, boy_shorts, woman_mini, woman_sash | `e/BSs.png` |
| Pole-hand close-ups | St Enoch inner: boy_cap, man_highland, elder_woman_dress | `p/SE.png` |
| Faces, neutral and smiling, fov 14 | teen_ginger, ya_ginger_braid, girl_ginger, ya_ginger_long, ya_ginger_lad, adult_heel_boots, elder_man_suit, woman_elder, adult_vneck, elder_shorts, adult_beret, teen_hippy, adult_piper, adult_tie_suit, girl_school_kilt, teen_runner | `f/NS_*.png`, `f/Z1.png` |
| Heads on both models | elder_shorts, girl_school_kilt, elder_man_suit, adult_runner | `n/HF.png` |
| Full body, both models | staff_hivis, sum_crop_denim, adult_piper, woman_puffer, ya_knit, teen_hippy | `n/LOD.png` |
| Seated garments | woman_coat, ya_smile_dress, man_kilt_casual, elder_woman_coat, adult_tie_suit, sum_loose_shorts_w | `n/SIT.png` |
| Luggage, stand / walk / sit | teen_tee, elder_woman_dress x case, large trolley, hike rucksack, holdall, handbag, shopper | `l/BAGS.png` |

Next round, look at:
- what turned-away boarders do once fixed (do they block the door?);
- in-game hair and brow colours with tint on;
- pausing walkers pushed at speed;
- the Govan stair end under a full platform.

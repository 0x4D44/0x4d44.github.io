# Under Glasgow: independent review of the people (review 19)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `9cbce5dd`. The changes since review 18 are `77958254` (boarders keep their own bag; the car mix leaves out leavers and drops pending boarders who give up or arrive), `440b4ce7` (woman_scarf and teen_hippy get the full hair on the far model; `people_lod.glb` rebuilt) and `9cbce5dd` (woman_dress and woman_coat no longer sit). I read the diffs read-only: 8 lines in `index.js`, 4 in `people.js` and 2 in `tools/people_lodhair.py`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.75 (7.751). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Only Luggage reaches 8 (8.02). The other seven are below 8.

All four builder claims are true. But two of the fixes uncover faults that were hidden before, and a long-standing boarding fault turned out to be much bigger than earlier reviews reported:
- **Bags now come aboard (claim 1).** Seated boarders now put their own suitcase or holdall on the floor in front of them, and it reaches the middle of the aisle (0 cm in 4 of 18 seated floor bags).
- **Most boarders miss the train.** I measured, for the first time, what happens to routed boarders. Most of them never get on: 24 of 34 whose outcome was decided were left on the platform when the doors closed. Some freeze mid-stride for 2-5 s in a jam in front of the open doors.

The score is flat: what the fixes gained, these findings take back.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review19/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. I deleted the raw walking recording (`m/rec`, 542 MB) after scoring. `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.2 | **7.52** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.0 | 6.8 | **7.52** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.0 | **7.96** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.7 | 7.0 | **8.02** |
| 8 | Whole bodies | 15 | 8.3 | 7.0 | **7.78** |
| | **Weighted mean** | 100 | | | **7.75** (7.751) |

0.20x7.52 + 0.10x7.88 + 0.10x7.52 + 0.10x7.96 + 0.10x7.66 + 0.15x7.84 + 0.10x8.02 + 0.15x7.78 = 1.504 + 0.788 + 0.752 + 0.796 + 0.766 + 1.176 + 0.802 + 1.167 = 7.751.

Against review 18 (7.753):
- **Up:** Clothing (+0.14: car mix fixed, two broken seated skirts gone), Whole bodies (+0.22: far-model hair fixed), Luggage (+0.06: no bag swap, but new aisle cases).
- **Down:** Arms and hands (-0.22: three of five high grips at Cowcaddens off the pole) and Standing/sitting/behaviour (-0.40: missed boardings and frozen walkers, now measured).

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A boarder's own bag comes aboard with them, so no swap at the door, and the wheeled-case-stands rule holds | **True.**<br>`gbcont.mjs` on 5 rides the builder did not name (Shields Road inner, Govan outer, Kelvinhall inner, St Enoch outer, Bridge Street inner): **18 of 18 boarders who reached the car kept their bag** (case, holdall, shopper, handbag, tote, ruck, trolley; review 18: 16 of 19 changed). Renders across the door: adult_cyclist (shopper), ya_tee_jeans (ruck, then on lap seated), elder_woman_coat (tote) (`d/BU.png`).<br>No seated rider had a trolley in 6 `gbag2` rides. Trolley boarders stood.<br>**Side effect:** seated boarders now put their own case or holdall on the floor in front of them, and those reach the middle line (see section 2, item 6). | `bs/cont_*.log`, `d/BU.png`, `bs/b_*.log` |
| 2 | Car mix drops pending boarders who give up or arrive; leavers do not count. Govan inner and Partick outer 0 over half | **True.**<br>`gcar.mjs`, 8 rides of 200 s: Govan inner 0/71, Partick outer 0/78, Hillhead inner 0/49, Ibrox outer 0/71, St Enoch inner 0/80, Cessnock outer 0/59, Cowcaddens inner 0/60, Kelvinhall outer 9/67. **0 of 535 car-samples over half by five garment kinds; 9 of 535 (1.7 %) by the code's own four groups.** Review 18: 53 of 487.<br>The 9 are one car at Kelvinhall: 2 shorts + 1 leggings of 5, which the code calls three "bare". `gmix.mjs` shows the checks now mark leavers and refuse correctly (Buchanan Street t = 110.7: car 3 BBBTTT refuses B). | `c/car_*.log/json`, `c/mix_*.log` |
| 3 | woman_scarf and teen_hippy keep their full long hair on the far model | **True.**<br>Full against far model, front, side and back, for 10 long- or bob-haired people: both now keep their waist-length hair and flower on `forcelod=1` (`n/LH.png` rows 1-2). The other 8 are also fine. | `n/LH.png` |
| 4 | woman_dress and woman_coat no longer sit | **True.**<br>`_canSit` lists them. In 4 platform/ride censuses they were seen 69 times and seated 0 times. The walker passed woman_dress and woman_coat standing in the car (`c/wk_*.log`).<br>Side effect: the seated crowd is now almost all legwear. In the censuses, skirts and dresses were 28 of 686 seated sightings (4 %) and kilts 1. | `g/*.json`, `c/wk_*.log` |
| 5 | Not changed: brisk crouch, seated coats and shorts, kilt flare, V smile, brows, doll skin, open high-grip hands, floor carriers 4-5 cm from the middle, phone hands, arm splay, coat bell | **True** for every item I re-checked.<br>The instrument is identical to review 18: 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7, ARM.splay 9.2.<br>Seated elder_woman_coat, ya_winter, sum_loose_shorts_w and girl_school_kilt still break (`n/SK.png`). girl_ginger's V smile is visible at rest (`f/NS.png`).<br>Two items are worse than the builder's summary: the high-grip hands and the floor luggage (section 2, items 5 and 6). | `m/items.log`, `n/SK.png`, `f/NS.png`, `p/CC.png` |

## 2. Status of REVIEW_18's top ten

| # | REVIEW_18 item | Now | Evidence |
|---|---|---|---|
| 1 | Bags swap at the door | **Fixed** (18 of 18 kept). | `bs/cont_*.log` |
| 2 | Brisk-walk crouch, pelvis jolts | **Not fixed** (numbers identical). New stills at 1.9 m/s: teen_tee and adult_cyclist walk sitting-back on bent knees in half the phases. | `m/items.log`, `w/BW.png` |
| 3 | Car garment mix over half | **Fixed** (0 of 535 by garment kind). Platforms within 15 m: 0 of 64 by kind. By the code's four groups, 9 of 15 samples at Buchanan Street, where shorts plus leggings together pass half. | `c/car_*.log`, `g/*.json` |
| 4 | Seated skirts, coats, shorts break | **Partly**: woman_dress and woman_coat now stand.<br>Still broken seated:<br>- elder_woman_coat: balloon with a jagged hem;<br>- ya_winter: ragged front hem, balloon behind;<br>- sum_loose_shorts_w: balloon behind the hips, white specks at the T-shirt hem;<br>- girl_school_kilt: kilt flares into a hoop;<br>- ya_smile_dress: hem a stiff ring at the knees. | `n/SK.png` |
| 5 | Far model drops long hair | **Fixed** for woman_scarf and teen_hippy. | `n/LH.png` |
| 6 | Faces | **Not fixed.** girl_ginger's V at rest; dotted lashes and brows; doll skin. Also, teen_girl's full model shows pale scalp specks through the front of her hair (`n/LH.png` row 5, first still). | `f/NS.png`, `n/LH.png` |
| 7 | Open hands on high grips | **Worse in this sample.** Cowcaddens inner, 5 holders close up (`gph.mjs`). 3 of the 5 hands on the 2.05-2.13 m grip are off the pole:<br>- teen_girl: a closed fist 8.7 cm beside it;<br>- teen_tube: open palm, thumb 10.6 cm off;<br>- elder_woman_coat: splayed fingers, 7.3 cm off.<br>Over 8 rides, 18 of 467 holder-samples are over 4 cm (max 10.2 cm). | `p/CC.png`, `p/cc.log`, `c/car_*.log` |
| 8 | Floor luggage near the middle line | **Worse.** Seated riders' floor bags, `gbagx.mjs`, 2 rides: **4 of 18 reach the middle line (0 cm)**: holdalls of ya_ginger_long and sum_denim_shorts_m (Bridge Street, boarders at the first stop), cases of ya_ginger_long and ya_tee_jeans (Govan inner).<br>A render shows a black holdall standing in the middle of the aisle in front of sum_shorts_asian_m (`gx/CS.png`).<br>Standing pole holders' trolleys also sit 1.5 cm (man_puffer, Partick outer), 5 cm (sum_tube_denim, Cowcaddens inner) and 7 cm (woman_mini, Shields Road outer) from the middle line. | `gx/bx_*.log`, `gx/CS.png`, `bs/b_*.log` |
| 9 | Phone hands, arm splay, coat bell | **Unchanged.** Phones in play look held (`d/BU.png`: platform and seated phone users). The viewer's clip mode (`__clip`) draws no phone at all, so `ph/P.png` shows empty hands. That is a tool artefact, not a game fault. ARM.splay p95 0.097 m. | `ph/P.png`, `d/BU.png` |
| 10 | Small items | Stair stalls 0 of 69 stair walkers (4 runs); duplicates 0; far model within 6 m: 0 in 4 runs.<br>Walk-through: 18 of 18 on three new loads, nearest pass 0.40 m.<br>Overlaps: 5 brief ones, max 0.3 s:<br>- 1 at 1.9 m from the camera (elder_woman_dress through sum_crop_bike, St George's Cross);<br>- 4 at 19 m (Kelvinbridge).<br>"No place" losses: 3 in about 80 routed. | `g/*.log`, `g/*.json`, `c/wk_*.log`, `bs/b_*.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.52 (typical 8.4, worst 6.2)
- **Instrument:** identical to review 18 (`m/items.log`): LEG 7.8 (kneeSt 6.9, kneeLd 8.1, dorsi 8.2), SMO p10 7.1, worst recording 7.7.
- **Brisk stills:** new people at 1.9 m/s, 8 phases from the side (teen_tee, man_puffer, woman_mini, elder_man_suit, sum_crop_bike, adult_cyclist; `w/BW.png`). man_puffer, woman_mini and elder_man_suit read well. teen_tee and adult_cyclist dip into a bent-knee, bottom-out crouch every other phase. That is the worst-tenth look.
- **No change, no change in score.**

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- **Grips, 8 rides:**
  - pole clip median 1.0-1.9 cm;
  - rail clip median 0.5-2.6 cm;
  - 18 of 467 holder-samples over 4 cm, max 10.2 cm (Kelvinhall outer).
- **Close-ups at Cowcaddens** (`p/CC.png`): 3 of 5 hands on the high grip are visibly not holding: a fist beside the pole, an open palm, splayed fingers. girl and girl_shorts hold properly.
- **Walking arms** measure well (ARM 9.5).
- **Score:** down from review 18 because the open hand is now the common case on the high grip, not one person.

### 3.3 Faces: 7.52 (typical 8.0, worst 6.8)
12 new faces at fov 14, neutral and smiling (`f/NS.png`):
- girl_ginger, teen_girl, elder_woman_dress, man_commuter, adult_baggy_knit, boy_cap;
- ya_bootcut, adult_tophat, woman_elder, teen_skater, sum_crop_bike, ya_fedora.

They differ and read as their age and sex. The smiles are small and fitted on most of them.

Worst tenth:
- girl_ginger's V smile at rest (a grimace);
- dotted lashes and brows on nearly every face;
- doll-smooth skin on the young;
- teen_skater and sum_crop_bike glare under heavy brows.

Unchanged.

### 3.4 Standing, sitting, behaviour: 7.96 (typical 8.6, worst 7.0)
**New measurement: most boarders do not board.** `gkeep.mjs` follows every boarder the game routes to a door, on three 200 s rides (West Street inner, St Enoch outer, Hillhead inner):
- Of 48 routed, 6 sat, 3 stood, 1 was lost, and 14 were still walking at the end.
- **24 were left on the platform when the doors closed (`onArrive` returned `keep`).** That is 24 of the 34 whose outcome was decided (71 %).
- Typical: routed 3.6 s after the doors open, given up at 13-17 s.

`gkeep2.mjs` shows why:
- Boarders queue in a jam between the stairs and the doors and stand still (`sp` 0, `stuckT` 2.6-5.4 s) 1.5-8 m from an open door.
- While stuck they hold the `walk` clip at timeScale 0. They freeze mid-stride (Shields Road: boy_shorts 5.1 s, man_longcoat 1.4 s, teen_hood).
- Renders of the jam at the foot of the stairs at Kinning Park and Shields Road (`bs/ST.png`, `bs/S2.png`): ya_smile_dress is frozen in a bent-knee half stride among 6-8 people.

A rider at the window or a player on the platform sees people walk towards the train, stop short and let it go. This is old behaviour (review 18's xstat ratios are similar), but it has never been measured this way. It is not a rare case.

Otherwise:
- walk-throughs 18 of 18;
- no stair stalls, duplicates or far models near the camera;
- seated people sit in their seats (`gx/SE.png`).

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged (99). Nothing changed here.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- **Mix:** car mix and the 15 m platform mix are now within half by garment kind (0 of 535, 0 of 64).
- **Seated breakage:** two broken seated skirts are gone, by standing their wearers. Five seated garments still break at 2 m (`n/SK.png`, listed in section 2 item 4).
- **Seated range:** the price of standing the skirts is a seated crowd that is 96 % trousers, shorts and leggings.

### 3.7 Luggage: 8.02 (typical 8.7, worst 7.0)
**Better:**
- bags are continuous across the door;
- no seated trolleys;
- walking with a towed case, a carried case and a holdall looks right (`l/W.png`);
- seated bags stand at the feet (`l/S.png`, `l/S2.png`).

**Worse:** big bags brought aboard by seated boarders stand across the middle line of the aisle:
- 4 of 18 seated floor bags at 0 cm in two rides;
- `gx/CS.png`: a holdall in the middle of the aisle.

`gbag2.mjs` counts only bags marked `floor`, so it misses these "lap" bags at the feet. Use `gbagx.mjs`.

Smaller faults:
- standing pole holders' trolleys 1.5-7 cm from the middle line;
- in the viewer, ya_ginger_lad's seated case sits over the toe of his shoe, and the holdall's strap stands up stiff as a rod (`l/S2.png`).

### 3.8 Whole bodies: 7.78 (typical 8.3, worst 7.0)
- **Far-model hair:** fixed. The far model is whole on 10 more people (`n/LOD.png`: piper, woman_sash, school kilt, crop/denim, elder_shorts, trews, hi-vis, knit, string vest, runner).
- **Small far-model faults:** staff_hivis's vest edges are jagged; sum_crop_denim's hair front is a flat band.
- **Full model:** teen_girl's scalp specks through her hair at the front.
- **Worst tenth:** the seated coats from 3.6.

## 4. Top ten defects, in priority order

1. **Boarders miss the train and freeze mid-stride.** 24 of 34 decided boarders are left on the platform; the stuck ones hold the walk clip at timeScale 0 for up to 5 s, 1.5-8 m from an open door, in a jam between the stairs and the doors.
   - Fix: hold the doors (or the dwell) for routed boarders, clear the stair-foot jam, and switch a stopped walker to idle.
   - Reproduce: `node gkeep.mjs "mode=ride&q=high&line=inner&station=west-street" 200`, `node gkeep2.mjs "mode=ride&q=high&line=outer&station=shields-road" bs/k4 120`, `node gstuck.mjs "mode=ride&q=high&line=outer&station=shields-road" bs/st 3`.
2. **Brisk-walk crouch and pelvis jolts**: LEG 7.8 (p10 5.9), SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7. teen_tee and adult_cyclist crouch at 1.9 m/s.
   - Reproduce: `people_motion.mjs --people all --rec DIR`, then `--from DIR --items --worst 12`; `node shoot.mjs 0 teen_tee,adult_cyclist none walk@170,walk@174,...,walk@198 w/BW body 1.9`. Each phase must be its own `walk@` token.
3. **Seated boarders' cases and holdalls stand across the middle of the aisle** (4 of 18 at 0 cm). Standing trolleys are 1.5-7 cm from the middle line.
   - Fix: turn big bags lengthwise against the seat front, or keep them within about 0.35 m of the seat edge.
   - Reproduce: `node gbagx.mjs "mode=ride&q=high&line=outer&station=bridge-street" 30`; `node gcase.mjs "mode=ride&q=high&line=inner&station=govan" gx/cs 120`.
4. **Hands off the high grip**: 3 of 5 close-ups at Cowcaddens are 7-9 cm off the pole (a fist beside it, an open palm, splayed fingers).
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=inner&station=cowcaddens" p/cc 50 8`.
5. **Seated coats, shorts, kilt and dress still break**: elder_woman_coat, ya_winter, sum_loose_shorts_w, girl_school_kilt, ya_smile_dress. Seated skirts and dresses are now only 4 % of seated people.
   - Reproduce: `node shoot.mjs 0 ya_smile_dress,girl_small,girl_school_kilt,elder_woman_coat,ya_winter,sum_loose_shorts_w none sit n/x legs`.
6. **Faces**: girl_ginger's V at rest; dotted lashes and brows; doll skin; teen_girl's scalp specks.
   - Reproduce: `node face2.mjs girl_ginger,teen_girl n/x "0:0" 0 8611 "" 14` (and smile 1).
7. **The code's garment groups still let shorts plus leggings pass half** (9 of 15 platform samples at Buchanan Street; one car at Kelvinhall for 80 s). By the rubric's "same kind of garment" this passes, so it is low priority.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan-street" g/bu 150`, then the census script in section 6.
8. **Phone hands, arm splay, coat bell**: unchanged (ARM.splay p95 0.097 m, worst recording 0.142 m).
9. **Small far-model faults**: staff_hivis's jagged vest, sum_crop_denim's flat hair front. They are seen beyond 6 m, so the priority is low.
   - Reproduce: `node shoot.mjs 1 staff_hivis,sum_crop_denim none stand n/x body`.
10. **Small items**:
    - 3 "no place" losses in about 80 routed boarders (adult_cap_baggy twice at Bridge Street and Partick, sum_chino_shorts_m at Cowcaddens);
    - one pass-through overlap at 1.9 m from the camera (St George's Cross, 0.3 s);
    - the seated holdall's strap stands up stiff as a rod.

## 5. What I could not observe

- No motion watched. The freeze of stuck walkers is inferred from `timeScale` 0 on the walk clip plus stills, not seen playing.
- Blink and smile timing in play.
- A large case on a real stair.
- My `gkeep2` and `gdoor` cameras sometimes landed inside walls (`bs/k2_0.png`, `d/IB.png`). The usable renders are `d/BU.png`, `bs/ST.png` and `bs/S2.png`.
- Loads are random between runs of the same station (the Govan case list changed between `gbagx` and `gcase`). Only the first 30 s of Bridge Street repeated review 18 exactly.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster, re-recorded | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stride stills, 8 phases at 1.9 m/s | teen_tee, man_puffer, woman_mini, elder_man_suit, sum_crop_bike, adult_cyclist | `w/BW.png` |
| Bag continuity across the door | Shields Road inner, Govan outer, Kelvinhall inner, St Enoch outer, Bridge Street inner | `bs/cont_*.log` |
| Boarders rendered before, in and after the door | Ibrox outer, Buchanan Street inner | `d/IB.png`, `d/BU.png` |
| Boarding outcomes, stuck walkers | West Street inner, St Enoch outer, Hillhead inner; Shields Road outer (stuck renders) | `bs/keep_*.log`, `bs/k3.log`, `bs/k4.log`, `bs/ST.png`, `bs/S2.png` |
| Car garment groups and grip distances, 200 s rides | inner Govan, Hillhead, St Enoch, Cowcaddens; outer Partick, Ibrox, Cessnock, Kelvinhall | `c/car_*.log/json` |
| Every boarder mix check | outer Govan, inner Buchanan Street, inner Govan, outer Partick | `c/mix_*.log` |
| Floor bags (`floor`) every 10 s | outer Bridge Street, Shields Road, Partick; inner West Street, Cowcaddens, Kinning Park | `bs/b_*.log/json` |
| Seated floor bags ("lap") nearest the middle | outer Bridge Street (30 s), inner Govan (120 s); render of one | `gx/bx_*.log`, `gx/CS.png` |
| Eye- and seated-height views along the aisle, 4 cars | St Enoch outer | `gx/SE.png` |
| Walk through a full train, 18 walks | outer Cessnock, Hillhead; inner Partick | `c/wk_*.log` |
| Census within 15 m (mix, far model, overlaps, duplicates, stairs, who sits) | Buchanan Street inner explore (boarded), Kelvinbridge inner ride, Govan outer explore, St George's Cross inner explore | `g/*.log`, `g/*.json` |
| Pole-hand close-ups | Cowcaddens inner: teen_girl, girl, girl_shorts, teen_tube, elder_woman_coat | `p/CC.png`, `p/cc.log` |
| Faces, neutral and smiling, fov 14 | 12 listed in 3.3 | `f/NS.png` |
| Seated garments | ya_smile_dress, girl_small, girl_school_kilt, elder_woman_coat, ya_winter, sum_loose_shorts_w, man_longcoat, adult_harem, sum_tube_denim, teen_cutoffs, woman_puffer, adult_baggy_knit | `n/SK.png` |
| Long hair, full against far model, 3 views | woman_scarf, teen_hippy, ya_ginger_long, adult_camisole, teen_girl, ya_smile_halter, woman_student, teen_tube, adult_harem, ya_tube_heels | `n/LH.png` |
| Full against far model, whole body | adult_piper, woman_sash, girl_school_kilt, sum_crop_denim, elder_shorts, man_trews, staff_hivis, ya_knit, adult_string_vest, teen_runner | `n/LOD.png` |
| Luggage walking and seated | woman_mini and adult_tie_suit with large trolley, case, holdall (walking); adult_smile_blouse and man_hoodie with handbag, shopper, hiking ruck, tote (seated); ya_ginger_lad and woman_elder with case, holdall, carrier, cabin trolley (seated) | `l/W.png`, `l/S.png`, `l/S2.png` |
| Phone and pole clips (viewer) | man_commuter, teen_girl, elder_man_cap, girl, adult_tattoo_muscle, woman_elder | `ph/P.png` (no phone drawn in clip mode) |

Platform census grouping, for item 7: five kinds (skirt/dress, kilt, shorts, leggings, trousers) against the code's four (shorts and leggings together as "bare"). The census script is inline in this review's shell history. It reads `cen[].oc` keys `crowd:id|outfit|state|bag|clip|dist` from `g/*.json`.

Next round, look at:
- boarding completion (`gkeep.mjs`);
- the walk clip frozen at timeScale 0;
- seated big bags against the middle line (`gbagx.mjs`, not `gbag2`);
- the high-grip hands at more stations;
- the seated skirts if any are let back on seats.

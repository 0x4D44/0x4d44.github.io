# Under Glasgow: independent review of the people (review 18)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `9a5150c0`. The changes since review 17 are `4af60779` (boarders counted together for a car's garment mix; wheeled cases stand) and `9a5150c0` (a few per cent quicker steps at a brisk walk). I read the diffs read-only: 14 lines in `gait.js`, `index.js` and `people.js`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.75 (7.753). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Two categories reach 8: Arms and hands (8.10) and Standing/sitting/behaviour (8.36). Six are below 8. Luggage falls from 8.28 to 7.96 because of a new finding: a boarder's bag is swapped for a new random one as they step into the car.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review18/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. I deleted the raw walking recording (`m/rec`, 542 MB) after scoring. `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.2 | **7.52** |
| 2 | Arms and hands | 10 | 8.7 | 7.2 | **8.10** |
| 3 | Faces | 10 | 8.0 | 6.8 | **7.52** |
| 4 | Standing, sitting, behaviour | 10 | 8.8 | 7.7 | **8.36** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.6 | 7.0 | **7.96** |
| 8 | Whole bodies | 15 | 8.2 | 6.6 | **7.56** |
| | **Weighted mean** | 100 | | | **7.75** (7.753) |

0.20x7.52 + 0.10x8.10 + 0.10x7.52 + 0.10x8.36 + 0.10x7.66 + 0.15x7.70 + 0.10x7.96 + 0.15x7.56 = 1.504 + 0.810 + 0.752 + 0.836 + 0.766 + 1.155 + 0.796 + 1.134 = 7.753.

In one line: down 0.01 from review 17. The cadence change helps the walk a little: LEG p10 rises from 5.2 to 5.9. The two in-game fixes do not do what they claim in play:
- **Car garment mix:** boarders who never reach the car are counted in the pending list, and riders about to get off are counted as staying. Cars go over half in 53 of 487 car-samples (11 %), against 8 % in review 17.
- **Wheeled cases:** a boarder's bag is rolled again when they enter the car, so seated riders still get trolley cases on the middle line. This happened in 3 of 6 rides.

Two older faults surfaced for the first time this round. Bags change as boarders cross the door (16 of 19 boarders). On the far model, two long-haired women lose their hair to a cap with black splinters.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Boarders already walking to a car count toward that car's garment mix | **True in code; it does not keep cars under half.** I logged every `mixOver` check in 4 rides (`gmix.mjs`). Two holes remain.<br>**(a) The pending list counts boarders who never board.** At Govan outer t = 3.6 s, car 3 (B B S T T) passed five boarders (B, T, B, T, B). Only the two T arrived, so the car became 4 T of 7 for 100 s.<br>**(b) Riders about to get off are counted as staying.** At Buchanan Street inner t = 110.7, car 3 was B B B S\* T T T (\* = leaving). A T boarder passed, the S got off, and the car became 4 T of 7.<br>Over-half car-samples (n >= 5), `gcar.mjs` on 8 rides the builder did not name: Cessnock 0/67, Ibrox 25/58, Kelvinhall 0/69, Partick inner 0/63, Buchanan Street outer 8/69, Govan outer 10/20, Hillhead outer 0/71, St Enoch outer 10/70. **53 of 487 (11 %)**, max 63 % (5 T of 8). Review 17 found 19 of 232 (8 %). Four of the five over-half cars were made by boarders. The fifth (Ibrox car 2, 3 of 5) came from the spawn. | `c/mix_*.log`, `c/car_*.log`, `c/car_*.json` |
| 2 | Seated riders no longer keep a trolley; boarders with one stand. No trolley on the aisle's middle line | **False in play.** The spawn strips trolleys from seated riders, and `_routeBoarder` keeps a trolley-carrier off seats. But a boarder's bag is not carried into the car: `sc.add` gets `look = {char, print, teeColour}` with no bag, so `_rollBag` picks a fresh one. A boarder with no case can sit and then receive a trolley in the seat.<br>`gbag2.mjs`, 6 rides of 200 s: **a seated rider's trolley reached the middle line (0-1 cm) in 3 of 6 rides**: Shields Road adult_casual2; West Street adult_tattoo_muscle for 60 s; Bridge Street sum_crop_denim for 190 s, a boarder at the first stop.<br>A standing rider's trolley also touched the middle line: woman_mini at Kelvinbridge, 0.5 cm for 30 s. Standing trolley boarders elsewhere kept their case 29-60 cm off the middle line. | `bs/b_*.log`, `bs/b_*.json`, `index.js` lines 185, 323, 340-344 |
| 3 | Cadence about 3 % higher above 1.2 m/s; overall 9.44 -> 9.47, LEG 7.6 -> 7.8 (p10 5.2 -> 5.9), SMO p10 6.9 -> 7.1, worst adult_heel_boots @ 1.9 m/s 7.7 | **True, number for number** (whole roster re-recorded, 99 people, 723 s). STR.cad is still 9.9. The new worst recording is made by this change: adult_heel_boots at 1.9 m/s now steps at 153/min, and STR.cad scores 6.3 for that recording. The gate is still not met (LEG 7.8, LEG p10 5.9, SMO p10 7.1, worst recording 7.7). | `m/rec.log`, `m/items.log` |
| 4 | Not changed: seated hems, shorts bulge, V smile, brows, doll skin, open pole hands, phone hands, arm splay, coat bell, platform mix | **True.** Seated woman_dress hem is still torn at the knee; elder_woman_coat and ya_winter coats are still ragged balloons; sum_loose_shorts_w still balloons behind the hips (`n/SK.png`). girl_ginger's V smile is visible at rest (`f/NS.png`). adult_casual2 on a high grip at Hillhead has an open hand 10-12 cm off the bar (`p/HH.png`). The platform mix is a little better than review 17: 5 of 101 samples over half, max 62 %, against 9 of 101 and 67 %. | `n/SK.png`, `f/NS.png`, `p/hh.log`, `g/*.json` |

## 2. Status of REVIEW_17's top ten

| # | REVIEW_17 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | **Slightly better**: LEG 7.8 (p10 5.9), SMO p10 7.1. LEG.kneeSt still scores 6.9, with 19 deg of knee bend at mid-stance. boy_small at 1.9 m/s walks bent-kneed (`w/BS.png` row 2). | `m/items.log`, `w/BS.png` |
| 2 | Seated skirts and coats break | **Not fixed** (unchanged). | `n/SK.png` |
| 3 | Garment mix over half | **Cars: not fixed** (53 of 487, 11 %; see claim 1). **Platforms: better** (5 of 101, max 62 %). | `c/`, `g/` |
| 4 | Faces: V smile, brows, skin | **Not fixed.** | `f/NS.png` |
| 5 | Open hands on high pole grips | **Not fixed**: adult_casual2, Hillhead. | `p/HH.png` |
| 6 | Floor luggage in the aisle | **Not fixed**: seated trolleys on the middle line in 3 of 6 rides (claim 2). Turned carriers and shoppers are still 4-5 cm from the middle line (Bridge Street: sum_denim_shorts_m carrier 4 cm, adult_casual5 shopper 5 cm). | `bs/b_*.log`, `gx/bxb.log`, `gx/BX.png` |
| 7 | Phone hands | **Not changed** (not re-shot; the builder lists it as unchanged). | — |
| 8 | Arm splay | **Unchanged** (ARM.splay 9.2). | `m/items.log` |
| 9 | Coat flap walking | **Unchanged** (builder's own list). | — |
| 10 | Small behaviour items | **Better**: 0 stair stalls in 86 stair walkers (5 runs), and 0 duplicates. Far model within 6 m: 0 in 5 runs. Overlaps: 7 brief ones (max 0.3 s, 6 cm) among people walking at 23 m (Ibrox ride). 3 of about 80 routed boarders were lost with "no place" (Kinning Park, Bridge Street x2). | `g/*.log`, `g/ib.json`, `bs/b_*.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.52 (typical 8.4, worst 6.2)
- **Instrument:** overall 9.47 (`m/items.log`). LEG is still below 8 (kneeSt 6.9, kneeLd 8.1, dorsi 8.2). SMO p10 is 7.1: teen_tee at 1.6 m/s has SMO.trem 3.9 and pelAcc 4.7.
- **Brisk stills, short and unusual people** (girl_small, boy_small, elder_woman_dress, adult_heel_boots) at 1.9 m/s, 8 phases (`w/BS.png`). They read as walking. boy_small's bent knees and forward-poked arms are the worst-tenth look. heel_boots walks on bent knees.
- **Score:** a small rise over review 17, from the instrument.

### 3.2 Arms and hands: 8.10 (typical 8.7, worst 7.2)
- **Grip distances** on 8 rides (`c/car_*.log`):
  - pole clip median 1.4-3.1 cm;
  - rail clip median 0.8-2.4 cm;
  - 13 of about 300 holder-samples over 4 cm, max 9.5 cm (Govan outer).
- **High grip:** adult_casual2's open hand hovers 10 cm off the bar (`p/HH.png`).
- **Score:** unchanged.

### 3.3 Faces: 7.52 (typical 8.0, worst 6.8)
12 faces at fov 14, neutral and smiling (`f/NS.png`). The smile works on woman_scarf, teen_ginger, adult_vneck and ya_spiky. Worst tenth:
- girl_ginger's V smile at rest, with stretched creases (she reads as grimacing);
- teen_girl's lopsided smile;
- jagged white-notched hairlines on adult_tattoo_muscle, teen_ginger and ya_spiky;
- dotted brows and lashes on most faces;
- doll skin.

The score is unchanged.

### 3.4 Standing, sitting, behaviour: 8.36 (typical 8.8, worst 7.7)
- **Walk through a full train:** 24 of 24 on four new loads (Kelvinbridge outer, Bridge Street inner, St George's Cross outer, Govan inner), nearest pass 0.40 m (`c/wk_*.log`).
- **Census:**
  - stair stalls 0 of 86;
  - duplicates 0;
  - far model within 6 m: 0.
- **Worst tenth:**
  - brief walk-through overlaps in the alighting crush (girl_ginger and man_longcoat, 6 cm for 0.3 s);
  - 3 lost boarders;
  - boarders who walk to the doors and stay on the platform (old behaviour).
- **Score:** up slightly because the stair stalls are gone.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged (99). Nothing changed here.

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
- **Platform mix:** better (5 of 101 over half).
- **Car mix:** no better (11 % of car-samples, max 63 %).
- **Seated hems and shorts:** unchanged and visible at 2 m (`n/SK.png`):
  - woman_dress torn at the knee;
  - elder_woman_coat ballooned with jagged triangles;
  - ya_winter ragged;
  - sum_loose_shorts_w ballooned behind the hips.

  Also: girl_school_kilt's seated kilt flares up and out, and sum_loose_shorts_w's T-shirt shows white specks at the hem.

### 3.7 Luggage: 7.96 (typical 8.6, worst 7.0)
**New and serious: boarders swap bags at the door.** `gbcont.mjs` follows each routed boarder's bag on the platform and again once they are in the car. Over 4 rides (Shields Road inner, Hillhead inner, Cowcaddens outer, Ibrox outer), **16 of 19 boarders who reached the car had a different bag**. Examples:
- ya_smile_polo: case -> carrier;
- woman_student: carrier -> trolley, then sat with it;
- adult_beret: trolley -> tote;
- adult_cyclist: case -> rucksack;
- teen_ginger: rucksack -> carrier;
- ya_tube_heels: nothing -> trolley, seated.

The cause is in `index.js` `onArrive`: `look = { char, print, teeColour, force }` does not pass `p.bag`, so `people.js` line 474 rolls a new one.

A player watching people board would see a suitcase turn into a tote in the doorway. I measured this but could not get a clean render: `bs/SW.png` is inconclusive. The swap is also why claim 2 fails.

Other luggage faults:
- seated trolleys on the middle line in 3 of 6 rides;
- turned carriers 4-5 cm from the middle line, still spikes seen along the aisle (`gx/BX.png`).

The rest of the luggage is as review 17 found.

### 3.8 Whole bodies: 7.56 (typical 8.2, worst 6.6)
**New: the far model drops two long-haired women's hair.**
- **woman_scarf and teen_hippy:** waist-length black hair with a red flower on the full model. On the far model (`forcelod=1`) both become a brown skull cap with the flower perched on top and loose black splinter polygons sticking out (`n/HIPPY.png`, `n/LH.png` pair 2, `n/LOD.png` row 1).
  - The far model is used beyond 6 m, so the swap is visible: a long-haired woman's hair vanishes as she walks away.
  - 10 other long-haired people checked are fine.

The seated hems from 3.6 remain. Otherwise the far model is whole (12 people standing and seated, `n/LOD.png`).

## 4. Top ten defects, in priority order

1. **Bags swap as boarders enter the car** (16 of 19). The new bag can be a trolley given to a seated rider, which puts it on the middle line. This defeats claim 2.
   - Fix: pass `bag: p.bag` in `look` and re-apply the seat rule.
   - Reproduce: `node gbcont.mjs "mode=ride&q=high&line=inner&station=shields-road" 220`; `node gbag2.mjs "mode=ride&q=high&line=outer&station=bridge-street" bs/x 200`.
2. **Brisk-walk crouch and pelvis jolts**: LEG 7.8 (p10 5.9), SMO p10 7.1. adult_heel_boots @ 1.9 m/s is now 7.7, because its cadence is too high (153/min).
   - Reproduce: `people_motion.mjs --people all --rec DIR`, then `--from DIR --items --worst 12`.
3. **Car garment mix over half** in 11 % of car-samples. The pending list credits boarders who never arrive, and leavers count as staying.
   - Reproduce: `node gmix.mjs "mode=ride&q=high&line=outer&station=govan" 140` and `node gmix.mjs "mode=ride&q=high&line=inner&station=buchanan-street" 220`.
4. **Seated skirts, coats and shorts break**: woman_dress, elder_woman_coat, ya_winter, woman_coat, sum_loose_shorts_w.
   - Reproduce: `node shoot.mjs 0 woman_dress,woman_coat,elder_woman_coat,ya_winter,sum_loose_shorts_w,girl_school_kilt none sit n/x legs`.
5. **Far model drops long hair** on woman_scarf and teen_hippy (cap plus splinters).
   - Reproduce: `node shoot.mjs 1 teen_hippy,woman_scarf none stand n/x face` against `node shoot.mjs 0 ...`.
6. **Faces**: girl_ginger's V at rest; teen_girl's lopsided smile; notched hairlines; dotted brows; doll skin.
   - Reproduce: `node face2.mjs girl_ginger,teen_girl,adult_tattoo_muscle f/x "0:0" 1 8611 "" 14`.
7. **Open hands on high grips** (adult_casual2, Hillhead, 10-12 cm off the bar).
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=hillhead" p/x 40 6`.
8. **Floor luggage near the middle line**: turned carriers and shoppers 4-5 cm from it; a standing rider's trolley at 0.5 cm (woman_mini, Kelvinbridge).
   - Reproduce: `node gbagx.mjs "mode=ride&q=high&line=outer&station=bridge-street" 30`.
9. **Phone hands, arm splay and coat bell while walking**: unchanged.
10. **Small items**:
    - 3 boarders lost with "no place" in about 80;
    - brief walk-through overlaps in the alighting crush (`g/ib.json`);
    - girl_school_kilt's seated kilt flares;
    - specks on sum_loose_shorts_w's T-shirt hem.

## 5. What I could not observe

- No motion watched. Walking was judged from the instrument and stills.
- The bag swap at the door was measured, not seen. My render attempt (`bs/SW.png`) placed the camera badly.
- A large case on a real stair.
- Blink and smile timing in play.
- Loads are random. The car-mix result swings from 0 of 71 to 10 of 20 between loads.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster, re-recorded | all 99 | `m/rec.log`, `m/items.log` |
| Brisk stride stills, 8 phases at 1.9 m/s | girl_small, boy_small, elder_woman_dress, adult_heel_boots | `w/BS.png` |
| Car garment groups and grip distances, 200 s rides | inner Cessnock, Ibrox, Partick, Kelvinhall; outer Buchanan Street, Govan, St Enoch, Hillhead | `c/car_*.log/json` |
| Every boarder mix check | outer Govan, inner Buchanan Street, outer Partick, inner St Enoch | `c/mix_*.log` |
| Floor bags, any owner state, every 10 s | inner Shields Road, West Street, St George's Cross; outer Kinning Park, Bridge Street, Kelvinbridge | `bs/b_*.log/json` |
| Bag continuity across the door | Shields Road inner, Hillhead inner, Cowcaddens outer, Ibrox outer | `bs/cont_*.log` |
| Walk through a full train, 24 walks | outer Kelvinbridge, St George's Cross; inner Bridge Street, Govan | `c/wk_*.log` |
| Census within 15 m (mix, far model, overlaps, duplicates, stairs) | St Enoch outer, Partick inner, Hillhead (explore then board), Cowcaddens outer explore; Ibrox outer ride | `g/*.log`, `g/*.json` |
| Eye- and seated-height views along the aisle, 4 cars, and floor bag positions | Bridge Street outer | `gx/BX.png`, `gx/bxb.log` |
| Holder close-up | Hillhead outer: adult_casual2 | `p/HH.png`, `p/hh.log` |
| Faces, neutral and smiling, fov 14 | girl_ginger, ya_smile_dress, adult_tattoo_muscle, teen_girl, sum_shorts_asian_m, woman_scarf, man_beard, elder_man_suit, teen_ginger, ya_spiky, girl_leggings, adult_vneck | `f/NS.png` |
| Seated skirts, coats, shorts | woman_dress, woman_coat, elder_woman_coat, ya_winter, sum_loose_shorts_w, girl_school_kilt | `n/SK.png` |
| Far against full model, standing and seated | man_puffer, woman_puffer, teen_hippy, adult_lusekofta, boy_kilt, elder_woman_dress | `n/LOD.png`, `n/FULL.png` |
| Long hair, far against full model, back view | ya_ginger_long, woman_scarf, teen_girl, adult_camisole, girl_ginger, ya_ginger_braid, woman_student, ya_smile_halter, teen_tube, woman_puffer, plus teen_hippy close | `n/LH.png`, `n/HIPPY.png` |

Next round, look at:
- bag continuity once fixed, including trolleys reaching seats;
- the far model's hair on every long-haired character;
- the car mix with leavers excluded;
- the phone hands and coat bell, which I did not re-shoot.

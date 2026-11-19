# Under Glasgow: independent review of the people (review 36)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `451372d9`. Commits since review 35 that touch the people (read-only `git diff 74799573 451372d9 -- glasgow-subway/js`):
- `gait.js` `walkStep`: a swing that starts late (the phase already past toe-off by more than 1.5 ticks) keeps the foot's pitch and counts its progress from the phase it left at (`f.sw.pf0`), not from S.
- `people.js`:
  - `standBack(q, retry)`: a turned-away boarder stuck on the way back tries again, up to 13 more times, waiting `min(6, 1.5 x (tries - 2))` s between tries. A fresh turn-away resets the count.
- `index.js` `_routeBoarder`: `withAdult` now counts only a grown-up who is not seated and within 1.0 m, or a grown-up's stand spot booked at this stop.
- `index.js` `petAudit`: a test-only fix.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones.

One tool fix: review 35's `gaway4.mjs` wraps `crowd.standBack` with a one-argument function. That would drop the new `retry` flag and reset the count on every try. I used `gaway5.mjs`, which passes the flag through and counts retries per person.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review36/`. I deleted the walking-instrument recording after scoring; `m/items.log` holds the result.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.05 (8.053). Gate NOT met.**
- At 8 or above (six categories): Behaviour 8.52, Luggage 8.28, Range 8.24, Arms 8.08, Walking 8.02, Whole bodies 8.02.
- Below 8: Clothing 7.76, Faces 7.70.

In short:
- **Claim 1 holds.** One-tick foot jumps over 30 cm fell from 13-26 per 100 s run to 0-1, and none of those was on a near model within 8 m.
  - What is left is a very fast first step: the foot covers 50-70 cm in 3-4 ticks, peaking at 20-26 cm per tick, at 0.7-0.9 m/s.
  - Rendered from the side at 2 m, it reads as a quick step, not a flicker (`pop/POP.png`, row 2).
- **Claim 2 holds.** I logged 33 turn-aways in six 300 s runs. All of them ended 1.52-3.2 m from the edge, and nobody stayed near the edge.
- **Claim 3 holds.** boy_kilt stood 69 s in a car beside a standing man_commuter 0.9 m away. No child stood in a moving car beside only a seated stranger.
- **New fault.** In one of five rides (Partick outer), two standers spent about 70 s with their pelvises 0.30 m apart, and one woman's hand stayed 5 cm from the other's thigh for about 80 s. The bodies visibly pass into each other in the aisle (`e/outer_partick_h_adult_beret-ya_bootcut.png`).
- **Better without a claim:**
  - Saloon garment mix: 0 of 40 ride samples over half one garment; review 35 had 10 of 20.
  - Grips: max 3.8 cm; review 35 had 6.5 cm.
  - Worst jam toggling: 30 a minute; review 35 had 38.
  - The haggis seen on stairs for the first time, correctly.
- **Not changed:**
  - The heel wearers' crouch.
  - Who sits: no skirt, dress or kilt is ever seated, and at eye height the car's standers are all skirts and dresses.
  - Garment faults, faces, the phone hand.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.7 | 7.0 | **8.02** |
| 2 | Arms and hands | 10 | 8.6 | 7.3 | **8.08** |
| 3 | Faces | 10 | 8.1 | 7.1 | **7.70** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.8 | **8.52** |
| 5 | Range of people | 10 | 8.6 | 7.7 | **8.24** |
| 6 | Clothing | 15 | 8.4 | 6.8 | **7.76** |
| 7 | Luggage | 10 | 8.8 | 7.5 | **8.28** |
| 8 | Whole bodies | 15 | 8.5 | 7.3 | **8.02** |
| | **Weighted mean** | 100 | | | **8.05** (8.053) |

0.20x8.02 + 0.10x8.08 + 0.10x7.70 + 0.10x8.52 + 0.10x8.24 + 0.15x7.76 + 0.10x8.28 + 0.15x8.02 = 1.604 + 0.808 + 0.770 + 0.852 + 0.824 + 1.164 + 0.828 + 1.203 = 8.053.

Changes against review 35 (7.970):
- **Walking +0.30** (worst tenth 6.4 to 7.0). The 50-70 cm one-frame foot teleport is gone. The crouch and a very fast first step remain.
- **Behaviour +0.04.**
  - Better: nobody is left at the edge, and jams toggle less.
  - Worse: the new overlapping standers.
- **Clothing +0.10.** The car mix is now within the rubric's half limit in every sample I took. The garment faults and the seated split are unchanged.
- **Luggage +0.04.** The haggis is correct on stairs.
- **Arms, faces, range and whole bodies: no change.**
  - Grips are better, but a hand on a stranger's thigh replaces them as the worst arms case.
  - The overlap is set against fewer platform faults in whole bodies.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | First-step foot teleport fixed (`sw.pf0`); jumps over 30 cm 21 -> 1 | **True.**<br>- `jump.py 0.3`, 100 s, ALL=1, 1/30 s ticks:<br>  - St Enoch inner x2: 0 and 1 (boy, far model, 13 m).<br>  - Buchanan Street outer: 0.<br>  - Partick inner: 1 (adult_beret, 32 cm, 3.3 m).<br>  - Kelvinbridge outer ride: 0.<br>  - Hillhead inner ride: 2, both far models at 92-124 m.<br>- Heel flips over 40 mm at a start (`pop2.py`): 0 in all six runs (review 35: 15-24 a run).<br>- **Residual:** the late swing is now squeezed into the rest of the stride phase. `flick.py` flags a foot moving more than 12 cm in a tick at over 5x body speed, at v < 1. It finds 25, 27, 32 and 35 per 100 s (5-17 near). Peaks are now 17-32 cm (review 35's bs.json: 65 cm).<br>  - man_beard, Buchanan Street, 2 m: 94, 213, 237 and 173 mm in four ticks.<br>  - Rendered from the side, the foot passes through the frames in order, as a quick step (`pop/POP.png`, row 2). | `sl/*.json`, `jump.py`, `pop2.py`, `flick.py`, `pop/POP.png` |
| 2 | A turned-away boarder keeps trying to step back | **True.**<br>- `gaway5.mjs`, 300 s each, at Cowcaddens inner x2, Ibrox inner, Govan outer, Hillhead inner and St Enoch outer.<br>- 20-25 boarded and 4-8 turned away per run (33 in all).<br>- Every one ended 1.52-3.2 m from the edge.<br>- Retries were seldom needed: sum_chino_shorts_m 2, woman_mini 1.<br>- 0 removed in view.<br>- But the same people are turned away from both trains (boy_kilt 5 times in 4 runs; girl_school_kilt, adult_cap_baggy, ya_fedora, woman_elder twice). | `v/aw_*.log` |
| 3 | A child stands only by a standing grown-up within 1.0 m | **True.**<br>- `gkid2.mjs`, 200 s rides: Cowcaddens inner, Govan inner, Hillhead outer, St Enoch outer.<br>- boy_kilt stood 69 s with man_commuter standing 0.9 m away.<br>- Every other child in a car was seated, apart from about 13 s standing as a riser before their stop. Two risers then had only a seated adult near (girl, 0.56 m from adult_runner seated) or nobody within 2.5 m (girl at Hillhead).<br>- That is alighting, not the routed case the claim covers. | `k/kid2_*.log` |
| 4 | Not changed: crouch, who sits, garments, faces, woman_mini's hair, cap hair, phone hand, tote, grips, jam stop-start, far model close, cars over half trousers | **True in code.** Observed:<br>- Crouch: unchanged (`n/BW.png`, `m/items.log`).<br>- Who sits: unchanged (`who.py` on `g/*.json`: 0 skirt, dress or kilt seated).<br>- Garments: unchanged (`n/G.png`).<br>- Faces: unchanged (`f/A.png`).<br>- Phone hand: unchanged (`h/H.png`).<br>- Grips: better, max 3.8 cm, 0 of 34 over 4 cm (`c/cwE.log`).<br>- Jams: max 30 toggles a minute at Buchanan Street, 25 at St Enoch (`pz/*.log`).<br>- Cars over half one garment: 0 of 40 saloon samples on two rides and 9 of 50 per-car samples at exactly 50 %. | as listed |

## 2. Status of REVIEW_35's top ten

| # | REVIEW_35 item | Now | Evidence |
|---|---|---|---|
| 1 | First-step foot jump | **Fixed as a teleport** (0-1 per run, none near). A fast 3-4-tick step remains (new item 2). | `sl/*`, `pop/POP.png` |
| 2 | Brisk-walk crouch | Not fixed. Instrument 9.47; LEG 7.8 (p10 6.1); SMO p10 7.2; adult_heel_boots @1.9 = 7.9. | `m/items.log`, `n/BW.png` |
| 3 | Garments and who sits | Garment faults and seating not fixed. The saloon mix is fixed in my samples (0 of 40 over half). | `n/G.png`, `g/pa.json`, `g/pb.json`, `e/EYE.png` |
| 4 | Faces | Not changed. Two new pairs of near-identical faces found. | `f/N.png`, `f/S.png`, `f/A.png` |
| 5 | Boarder stuck at the edge | **Fixed** in 6 runs (all at 1.52 m or more). | `v/*` |
| 6 | Cap hair, phone hand, tote, woman_mini's hair | Phone hand unchanged. The rest were not re-shot in the game (woman_mini was not aboard my eye-height ride). | `h/H.png` |
| 7 | Jam stop-start | A little better: 30 a minute at worst (was 38); 26 pause episodes at Buchanan Street (was 39). | `pz/p_bs.log`, `pz/p_se.log` |
| 8 | girl_small alone in a car | Fixed in the routed case (claim 3). | `k/*` |
| 9 | Open grips | Better: max 3.8 cm. | `c/cwE.log` |
| 10 | Far model close up | Not used within 6 m (`lod6 = 0` in three 200 s runs). Fine at platform distance. | `g/*.log`, `l/L.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.02 (typical 8.7, worst 7.0)
Instrument (all 99 people, 5 speeds), unchanged: overall 9.47. Its gate fails on LEG 7.8 (p10 6.1), SMO p10 7.2 and adult_heel_boots @1.9 = 7.9.

In game:
- No start skids over 5 cm in 6 runs (`skid2.py`).
- No near hovers. The two hover hits were measuring artefacts: a stale bone cache after a model swap (boy, se2), and a far model at 37 m.
- No heel flips.
- One-tick jumps over 30 cm: 0-1 per run.

Worst tenth:
- **The crouch.** adult_heel_boots and ya_tube_heels walk bent-kneed at 1.8 m/s (`n/BW.png`, rows 1-2).
- **The fast first step.** 3-4 ticks at 20-26 cm a tick, 2-4 near cases per 100 s at a busy platform.
- **Jam toggling** at 25-30 a minute.

### 3.2 Arms and hands: 8.08 (typical 8.6, worst 7.3)
Good:
- Grips: pole median 1.8 cm, max 3.8 cm.
- 5 rides: 0 knee pairs under 10 cm.
- The arm swing is fine in the brisk stills.

Worst tenth:
- adult_beret's left hand 5.3 cm from ya_bootcut's pelvis and thigh for about 80 s (Partick outer ride, 1 ride in 5).
- The `phone_call` hand is still a flat open palm in front of the ear and chin (`h/H.png`).
- woman_student holds the shopper up across her chest in the phone pose (`b/B.png`, row 2, column 4).

### 3.3 Faces: 7.70 (typical 8.1, worst 7.1)
I looked at 18 faces not on review 34's or 35's lists, neutral and smiling (`f/N.png`, `f/S.png`, ids in `f/ids.txt`), plus 6 known problem faces (`f/A.png`). They differ in age, sex and skin tone.

Faults:
- Dotted brows and lash lines on nearly all of them.
- Smiles that are lopsided smirks: ya_tattoo_tank, teen_runner, woman_student.
- Twin faces: woman_bob and woman_sash have near-identical faces with the same red bob; man_longcoat and man_elder are near-identical.
- teen_runner's ragged fringe.
- Unchanged: ya_smile_polo's mouth, teen_ginger's hairline, elder_shorts' squint, girl_small's lip, adult_tophat's stare and cheek streak, boy_small's hairline.

### 3.4 Standing, sitting, behaviour: 8.52 (typical 9.0, worst 7.8)
Good:
- Nobody turned away is left at the edge.
- 6 of 6 player walks through full trains finished (max still 0.1 s; `c/wkE.log`, `c/wk2E.log`).
- No duplicates.
- No far model within 6 m.
- Overlaps on platforms: 0, 0, and 1 one-sample case.

Worst tenth:
- The two standers interpenetrating for about 70 s.
- The seat split by garment, visible at eye height (`e/EYE.png`: the four standers are woman_sash, woman_dress, teen_skirt and elder_woman_dress; the seated are in trousers and shorts).
- Jam toggles.
- The same few people turned away from train after train.

### 3.5 Range of people: 8.24 (typical 8.6, worst 7.7)
- Roster unchanged: 99 people (woman 37, man 24, teen 13, elder 12, girl 6, boy 5, staff 2).
- In cars, children are seated or by a standing adult.
- But children are turned away more often: 7 in 6 runs (boy_kilt 5 times, girl_school_kilt 2), against 6 in 11 runs in review 35. They then wait alone on the platform. boy_kilt and girl_school_kilt cannot sit, so they board only when a standing adult happens to be placed beside them.

### 3.6 Clothing: 7.76 (typical 8.4, worst 6.8)
Census:

| run | scope | samples over half one garment | worst |
|---|---|---|---|
| St Enoch inner ride | saloon | 0 of 20 | 47 % trousers |
| Cowcaddens outer ride | saloon | 0 of 20 | 41 % |
| Partick outer explore | platform | 0 of 20 | |
| Partick outer explore | saloon | 1 of 8 | 54 % shorts |
| Ibrox inner ride | per car | 0 of 50 over half; 9 at exactly 50 % | |

- Seated garments on the people who sit are clean in all four sit clips (`n/S.png`: 8 people x sit_idle, sit_phone, sit_look, sit_cross_legs).
- Unchanged faults (`n/G.png`):
  - In the stride, the knee punches a hole through the kilt hem (man_highland, adult_piper).
  - Pencil and midi hems jag into notches (woman_midi, ya_smile_dress, woman_coat).
  - woman_puffer's shorts are blotchy (`n/BW.png`, row 3).
- No skirt, dress, kilt or long coat is ever seated (`g/cansit.txt`: 21 of 99 people can never sit).

### 3.7 Luggage: 8.28 (typical 8.8, worst 7.5)
- 8 bag kinds on two new bodies (woman_student, elder_man_suit), standing, walking and seated: all held or worn right (`b/B.png`). The trolley is towed by its handle and stands upright.
- The haggis:
  - On the platform: on the floor, lead 1.05-1.1 m (`e/pet_ride_outer_partick_ok.png`).
  - **On stairs for the first time** (Hillhead inner, t 64-74 s, 103 samples): on the floor (dy 0), lead 0.84-1.12 m. Measured only, no picture.
- Faults: the shopper raised in the phone pose; the tote in the phone hand (review 35, not re-shot).

### 3.8 Whole bodies: 8.02 (typical 8.5, worst 7.3)
- The two interpenetrating standers.
- The kilt knee hole.
- Cap hair and woman_mini's hair slab (not re-observed in the game; code unchanged).
- The far model reads well at platform distance (`l/L.png`) and is never used within 6 m.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch** (LEG 7.8, p10 6.1; SMO p10 7.2; adult_heel_boots @1.9 = 7.9). The heel wearers walk bent-kneed with short steps.
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,woman_puffer,sum_crop_bike none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
2. **Very fast first step.** A boarder setting off at 0.7-0.9 m/s swings a foot 50-70 cm in 3-4 ticks, at up to 26 cm a tick (about 8 m/s, 2-3 times a normal swing at that speed). 2-4 near cases per 100 s at a busy platform.
   - Likely cause: a late swing (`sw.pf0`) is given only the rest of the stride phase, `(pf - pf0)/(1 - pf0)`, so a swing that starts at pf 0.8 has a third of the normal time.
   - Reproduce: `ALL=1 node gslide.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 100 sl/bs.json; python3 flick.py sl/bs.json; python3 dump.py sl/bs.json 11:34.9:35.7`
   - Rendered: `node gpop3.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 33.5 36 pop/bs`
3. **Garments and who sits.**
   - Kilt knee hole and jagged pencil hems in the stride.
   - No skirt, dress or kilt ever sits, so at eye height a car's standers are the skirts and dresses.
   - Reproduce: `ANGS='[["F",2.8,0.1],["S",2.8,0.1],["B",2.8,0.1]]' node shoot2.mjs 0 man_highland,woman_midi,teen_skirt,adult_piper,ya_smile_dress,woman_coat,adult_beret none stand,walk@162 n/g legs`; `node gp8.mjs "mode=ride&q=high&line=outer&station=cowcaddens" g/pb 200; python3 who.py g/pb.json`; `node geye2.mjs "mode=ride&q=high&line=outer&station=ibrox" e/eyeE 40 6`
4. **Two standers inside each other.**
   - adult_beret (routed to stand at x 0.2, z -1.51) and ya_bootcut (pole) in car 3, pelvises 0.30 m apart for about 70 s. adult_beret's hand rests 5 cm from ya_bootcut's thigh for about 80 s.
   - 1 ride in 5; it did not recur in a rerun.
   - Reproduce: `TH=0.10 node gnb6.mjs "mode=ride&q=high&line=outer&station=partick" 200 e/x` (look for `P` lines with d < 0.45 and `H` lines).
5. **Faces:**
   - Dotted brows; lopsided smirks (ya_tattoo_tank, teen_runner, woman_student).
   - Twin faces: woman_bob and woman_sash; man_longcoat and man_elder.
   - The known problem faces.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/n "0:0" 0 8611 "" 14`, and with `f/s "0.3:0" 1`.
6. **Children in kilts turned away again and again.** boy_kilt was turned away 5 times in 4 of 6 runs and girl_school_kilt twice; they then wait alone on the platform. They cannot sit, and may stand only by a standing adult.
   - Reproduce: `node gaway5.mjs "mode=explore&q=high&line=inner&station=cowcaddens" 300`
7. **Phone hand:** a flat open palm in front of the chin, and the shopper raised in the phone pose.
   - Reproduce: `ANGS='[["F",3.4,0.15],["S",1.9,0.1]]' node shoot2.mjs 0 adult_runner,woman_bob tote clip-phone-1-40 h/h handr`
8. **Jam stop-start:** up to 30 toggles a minute (sum_loose_shorts_w, Buchanan Street outer); 49 pause episodes in 200 s at St Enoch inner.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`
9. **The same people turned away from train after train.** woman_elder, adult_cap_baggy, ya_fedora and girl_school_kilt were turned away by both trains in a 300 s run. Each walks up to the doors and back again.
   - Reproduce: as item 6; look at `REPEATS`.
10. **woman_puffer's blotchy shorts; hair under caps; woman_mini's hair slab** (the last two not re-observed in the game).
    - Reproduce: `n/BW.png`, row 3; review 35's `geye2` on a Kelvinhall inner ride.

## 5. What I could not observe

- **No motion watched.** The fast first step comes from bones every 1/30 s and one rendered five-frame sequence. Two other render attempts had the camera inside a wall (`pop/POP2.png`).
- **The haggis on stairs:** measured only (`gstair.mjs` saved no shot).
- **woman_mini's hair and cap hair in the game:** woman_mini was not aboard my eye-height ride.
- **Blink and smile timing** in play.
- **A doorway left occupied at door close:** not looked for this round.
- **The cause of the overlapping pair:** not found. It did not recur.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | St Enoch inner x2, Buchanan Street outer, Partick inner (explore); Kelvinbridge outer and Hillhead inner rides (100 s each) | `sl/*.json`, `jump.py`, `pop2.py`, `flick.py`, `skid2.py`, `hover.py` |
| Rendered first steps from the side | Buchanan Street outer (man_beard 2 m, elder_woman_dress), St Enoch inner | `pop/POP.png`, `pop/POP2.png` |
| Brisk walk at 1.8 m/s, 6 phases | adult_heel_boots, ya_tube_heels, woman_puffer, sum_crop_bike | `n/BW.png` |
| Garments of non-sitters, stand and walk | man_highland, woman_midi, teen_skirt, adult_piper, ya_smile_dress, woman_coat, adult_beret | `n/G.png` |
| Seated garments of sitters, 4 sit clips | sum_crop_denim, teen_cutoffs, adult_fisherman_leggings, adult_tie_suit, sum_loose_shorts_w, elder_man_suit, man_trews, ya_tattoo_tank | `n/S.png` |
| Who can sit | all 99 | `g/cansit.txt` |
| Faces, neutral and smiling | 18 new (`f/ids.txt`) plus 6 problem faces | `f/N.png`, `f/S.png`, `f/A.png` |
| Hands (phone call, tote) | adult_runner, woman_bob | `h/H.png` |
| Bags: 8 kinds x stand, walk, sit | woman_student, elder_man_suit | `b/B.png` |
| Far model at 3.4 m and 9 m | woman_bob, adult_piper, sum_crop_denim, elder_man_suit, teen_hood, girl_ginger | `l/L.png` |
| Turned-away boarders | Cowcaddens inner x2, Ibrox inner, Govan outer, Hillhead inner, St Enoch outer (300 s each) | `v/aw_*.log` |
| Children in cars | Cowcaddens inner, Govan inner, Hillhead outer, St Enoch outer rides | `k/kid2_*.log` |
| Hands, knees and hips between riders | Partick outer x2, Govan inner, Kelvinhall outer, Bridge Street inner rides | `e/n6_*.log`, `e/*_h_*.png` |
| Census, overlaps, far within 6 m, duplicates, who sits | St Enoch inner ride, Cowcaddens outer ride, Partick outer explore (200 s) | `g/pa.json`, `g/pb.json`, `g/se.json`, `cen4.py`, `who.py` |
| Grips and per-car mix | Ibrox inner ride, 150 s | `c/cwE.log` |
| Player walks through full trains | St Enoch outer and Hillhead inner rides | `c/wkE.log`, `c/wk2E.log` |
| Eye height in a car | Ibrox outer ride, 5 people x 3 views | `e/EYE.png` |
| The haggis | Partick outer and Ibrox inner rides (platform); Hillhead inner, Buchanan Street outer and St Enoch inner explore (stairs at Hillhead) | `e/pet_*.log`, `e/st_*.log` |
| Jam pauses | Buchanan Street outer and St Enoch inner, 200 s | `pz/p_bs.log`, `pz/p_se.log` |

Next round, look at:
- the fast first step, rendered at 60 fps;
- standers' spacing in cars;
- children in kilts on platforms;
- woman_mini and the cap wearers at eye height in a car.

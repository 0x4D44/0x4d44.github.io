# Under Glasgow: independent review of the people (review 34)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `bca1d3b1`. Commits since review 33 that touch the people (read-only `git diff 4d8e3ea0 bca1d3b1`):
- `gait.js`: `P.bob = P.bob0` (the brisk-walk bob boost removed). In `startSwing`, a foot already in the air keeps its height (`c0`) and lowers over 85 % of the new swing.
- `people.js`:
  - The haggis is pushed back onto the platform floor (`_toFloor`, 0.15 m margin) when its owner has no stair route. On a stair route its height is `p.yAt(h.x, h.z)`.
  - Static spawns in cars and elsewhere refuse children unless seated.
  - `goT`: a walker who has just walked on cannot stop again for 1 s. `stillT` is cleared on walking on.
  - `standBack` scores 24 candidate spots. A stuck walker-back retries up to 3 times.
- `index.js`:
  - Anyone left on the platform at door close is sent to `standBack`.
  - A child with no seat is turned away.
- Models: elder_shorts and teen_ginger have new hair. `armfit.js` and `people_meta.json` were re-derived.
- New tool: `tools/people_pause_slide.mjs`.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review34/`. I deleted the walking recording (about 550 MB) after scoring; `m/items.log` holds the results.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.96 (7.958). Gate NOT met.** Five categories are at 8 or above: Behaviour 8.46, Luggage 8.24, Range 8.14, Whole bodies 8.02, Arms 8.00. Below 8: Walking 7.70, Faces 7.76, Clothing 7.70.

In short:
- **Most claims hold.**
  - The bob is back to its review-32 size.
  - The haggis stands on the stair treads.
  - Turned-away boarders now step back.
  - Children no longer stand in cars.
  - elder_shorts has lost his forehead patch.
  - The player got through full trains 12 times out of 12.
- **Claim 3 (the pause slide was a measuring artefact) is right about pauses.** With each foot's floor taken as its lowest height over the person's whole run, no foot slid more than 1 cm during any stop or pause.
- **But feet do slide when people set off.** For the first 0.15-0.2 s after a waiting person starts walking (mostly boarders heading for the doors), a foot that is on the floor moves along it at 1-2 m/s while the body has barely moved. This happens 3-5 times per 100 s within 8 m of the camera, on the near model:

  | person | slide | distance from camera |
  |---|---|---|
  | boy_shorts | 15 cm | 3.7 m |
  | staff_hivis | 13 cm | 4.3 m |
  | woman_coat | 12.7 cm | 4.5 m |
  | ya_bootcut | 12 cm | 5.7 m |
  | woman_midi | 11.7 cm | 3.4 m |

  When someone walks on from a pause, a planted foot also snaps 5-7 cm up and 7-9 cm forward in one 1/30 s tick (7-8 times per 100 s).
- **Not changed and still there:**
  - The heel wearers' brisk-walk crouch (LEG 7.8, p10 5.9; SMO p10 7.1).
  - Who sits: every standing rider in the eye-height views wore a skirt or kilt, and every seated rider wore trousers or shorts.
  - The garment faults.
  - Cap hair, the phone hand and the tote.
  - Open grips: up to 8.5 cm this round.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.5 | 6.5 | **7.70** |
| 2 | Arms and hands | 10 | 8.6 | 7.1 | **8.00** |
| 3 | Faces | 10 | 8.2 | 7.1 | **7.76** |
| 4 | Standing, sitting, behaviour | 10 | 8.9 | 7.8 | **8.46** |
| 5 | Range of people | 10 | 8.5 | 7.6 | **8.14** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.5 | 7.3 | **8.02** |
| | **Weighted mean** | 100 | | | **7.96** (7.958) |

0.20x7.70 + 0.10x8.00 + 0.10x7.76 + 0.10x8.46 + 0.10x8.14 + 0.15x7.70 + 0.10x8.24 + 0.15x8.02 = 1.540 + 0.800 + 0.776 + 0.846 + 0.814 + 1.155 + 0.824 + 1.203 = 7.958.

Changes against review 33 (7.890):
- **Walking +0.10** (typical 8.4 to 8.5, worst 6.4 to 6.5):
  - Better: the bob is back to normal, and stops do not slide.
  - Worse: the slides found at walk starts, the start snaps and hovering feet. These are new findings, not regressions; I measured them in a way review 33 did not.
  - Unchanged: the crouch.
- **Faces +0.08** (worst 6.9 to 7.1): elder_shorts' patch is gone. teen_ginger is better, but his hairline is still a hard edge with a step in it.
- **Behaviour +0.14** (typical 8.8 to 8.9, worst 7.6 to 7.8):
  - Turned-away boarders now step back.
  - No children stand in cars.
  - No player walk was held up.
- **Range +0.08** (worst 7.4 to 7.6): no children stand alone at poles. Children are still turned away alone on platforms (24 of the 83 turned away).
- **Luggage +0.16** (worst 7.0 to 7.4): the haggis stands on the stair treads.
- **Whole bodies +0.04** (worst 7.2 to 7.3): elder_shorts' forehead patch is gone.
- **Arms -0.04** (worst 7.2 to 7.1): one seated hand 8.5 cm from a neighbour's thigh, and a pole grip open by 8.5 cm.
- **Clothing: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Brisk bob withdrawn | **True.**<br>- Bob at 1.65 m/s and above: median 53 mm, max 66 mm (review 33: 78 and 92 mm).<br>- Every instrument figure is back to review 32: overall 9.47; LEG 7.8 (p10 5.9); SMO p10 7.1; kneeSt 19.0 deg; worst adult_heel_boots @1.9 = 7.7.<br>- The crouch is back with it. | `m/items.log`, `n/BW.png` |
| 2 | The haggis stays on the floor and stands on the tread on stairs | **True as far as I saw.**<br>- Hillhead inner: owner on the stairs 130 rows, haggis minus tread height = 0.000 every time.<br>- Buchanan Street outer: the haggis 0.67 m above its descending owner, on the step behind him (`e/P4.png`).<br>- No wall case in 9 runs.<br>- One St Enoch inner ride logged 23 s "off the platform floor" with the owner standing. In two reruns it did not recur, and the shots are blocked by a passer-by (`e/SE_OFF.png`). The same probe at Buchanan Street flagged a stair landing as off-floor even though `_toFloor` found 0 m to the floor, so it is probably the same false flag. Not proven. | `e/st_inner_hillhead.log`, `e/p4_3dd0.log`, `e/pet_*.log` |
| 3a | Pause slide is a measuring artefact | **True for pauses.**<br>- The builder's tool: 35 episodes, 0 over 5 cm.<br>- My own measure takes each bone's floor as its lowest height relative to the root over the person's whole run, at 30 Hz, for ankle and ball bones. St Enoch inner: 35 stops, each slid at most 7 mm; no slide in pause episodes.<br>- In frame dumps a foot left in the air when a pause began finishes its step with clearance (4 cm) and then sets down (teen_girl, t 38.9-39.2).<br>- The reasoning is sound: a running minimum counts a landing step as sliding.<br>- **But the same measure finds real slides at walk starts** (see top ten, item 2). | `sl/builder_se.log`, `sl/se2_start.txt`, `slide_an.py`, `start_an.py`, `skid.py` |
| 3b | A re-aimed swing keeps its height | **True in the cases I dumped.** teen_girl's foot rose 29 to 43 mm, then came down over 0.33 s, with no one-frame drop until the last 15 mm of the landing. | `dump.py` on `sl/se2.json` |
| 4 | Fewer toggles | **True.**<br>- St Enoch inner 200 s: worst 28.6 a minute, but that is 2 toggles in 4.2 s.<br>- Buchanan Street outer: adult_camisole 8 in 20 s (23.8 a minute).<br>- Review 33: 47 a minute. | `pz/p_se.log`, `pz/p_bs.log` |
| 5 | Turned-away boarders step back | **True, with one sticking case.**<br>- 6 stations x 300 s: 83 turned away. 79 ended well back.<br>- girl_small (Hillhead inner, near the end of the run) was sent back 4 times and stayed at 0.98 m each time.<br>- Next to review 33 (185 s at 0.54 m), fixed. | `v/aw_*.log`, `aw2.py` |
| 6 | Children do not stand in cars | **True.**<br>- 3 rides x 200 s: every child in the saloon was seated.<br>- The only standing children were risers waiting to alight (boy, boy_cap, 12 s each at x = 0.2).<br>- In eye-height views there was no child at a pole. | `k/*.log`, `e/EYE.png` |
| 7 | New hair for elder_shorts and teen_ginger | **Partly.**<br>- elder_shorts: the forehead patch is gone. He still has the grey-blue squint, the red dot on his cheek and dotted brows.<br>- teen_ginger: spiky hair now, but the hairline is a hard straight edge across a high forehead, with a square step at the left temple, seen at 1 m from the front and from above. | `f/A.png`, `f/H.png` |
| 8 | Not changed: crouch, who sits, garments, faces, cap hair, phone hand, tote, the player in a full aisle, grips | **True for code.**<br>- The player was not held: 12 of 12 walks finished, the longest still 0.2 s.<br>- Grips: pole max 8.5 cm, 4 of 45 over 4 cm. | `c/wk*.log`, `c/sg.log`, `e/EYE.png` |

## 2. Status of REVIEW_33's top ten

| # | REVIEW_33 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, big bob | **Bob fixed.** The crouch is unchanged: adult_heel_boots and ya_tube_heels walk bent-kneed at 1.8 m/s, and woman_puffer's knees bend a lot. | `m/items.log`, `n/BW.png` |
| 2 | Garments and who sits | Not fixed. | `e/EYE.png` |
| 3 | Stop slide, toggles | **The stop slide was a measuring artefact; toggles are halved.** The slide is real at walk starts (new item 2). | `sl/*`, `pz/*` |
| 4 | The haggis in walls and on stairs | **Fixed** in this sample. | `e/*` |
| 5 | Faces | Partly: elder_shorts is fixed, teen_ginger is better. The others are unchanged; ya_smile_polo is new to the list. | `f/*` |
| 6 | Turned-away boarders at the edge | **Fixed** (1 of 83 stuck at 0.98 m). | `v/*` |
| 7 | Children alone at poles | **Fixed.** | `k/*` |
| 8 | Cap hair, phone hand, tote | Not fixed (code unchanged). | — |
| 9 | The player held in an aisle | Not seen: 12 of 12 walks finished. | `c/wk*.log` |
| 10 | Grips | Still there: up to 8.5 cm (woman holders at Cowcaddens outer). | `c/sg.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.70 (typical 8.5, worst 6.5)
Instrument over all 99 people: 9.47 overall. The gate fails on LEG 7.8 (p10 5.9), SMO p10 7.1 and the worst recording, adult_heel_boots @1.9 = 7.7. 19 of 495 recordings are under 8.5.

Good:
- Normal bob.
- Stops are clean.
- Toggles are rarer.

Worst tenth:
- **Walk starts slide.** Every waiting person who sets off (in practice the boarders going to the doors) holds the old foot positions while the stride begins. For about 5 ticks a foot that is on the floor (ball 0-3 mm above its floor) slides at 1-2 m/s while the root moves 4-11 mm a tick.
  - Example: staff_hivis's landing right foot skids 12 cm along the floor at about 2 m/s (`sl/se2.json`, t = 35.66-35.83).
  - Over three 100-120 s runs there were 10, 11 and 16 events over 5 cm, and 3-5 per run on the near model within 8 m.
  - This happens just when the player is watching a train come in.
- **Start snaps.** Walking on from a pause, a planted foot jumps 5-7 cm up and 7-9 cm forward in one tick (teen_shorts_lad at 3.2 m, boy_shorts at 3.4 m).
- **Hovering feet.** A paused walker can keep one foot 3-4 cm off the floor, still, for up to 1.4 s (teen_ginger, 6.8 m). This happens 0-2 times a run.
- **Heel wearers crouch** at brisk speed.

### 3.2 Arms and hands: 8.00 (typical 8.6, worst 7.1)
- 6 rides: 1 hand within 10 cm of another body. At Kelvinbridge inner, ya_smile_polo's seated left hand was 8.5 cm (bone to bone) from man_trews' thigh (`e5/inner_kelvinbridge_h_*.png`).
- Pole grips: median 2.1 cm, max 8.5 cm, 4 of 45 over 4 cm.
- Unchanged: the flat phone hand in `phone_call`, and the tote held by the phone hand.
- The swing itself is good (ARM 9.5).

### 3.3 Faces: 7.76 (typical 8.2, worst 7.1)
I looked at 16 faces not looked at since reviews 25-27, neutral and smiling (`f/N.png`, `f/S.png`, ids in `f/ids.txt`), plus the six earlier problem faces (`f/A.png`).
- They differ by age, sex and skin tone. Smiles are small and fitted.
- Faults:
  - ya_smile_polo: a lopsided, twisted mouth at neutral and smiling.
  - Thick, sullen mouths: sum_crop_bike, adult_fisherman_leggings.
  - Dotted brows almost everywhere.
  - girl_ginger: crooked neutral mouth (unchanged).
  - girl_small and sum_denim_shorts_m (unchanged).
  - elder_shorts: squint and red cheek dot.
  - teen_ginger: hard, stepped hairline.

### 3.4 Standing, sitting, behaviour: 8.46 (typical 8.9, worst 7.8)
Good:
- 40 rises in 6 rides with no hip pair under 0.45 m and no knee contact (`e5/n6_*.log`).
- No far model within 6 m, no overlaps, no duplicates, no stair stalls (`g/pa.log`, `g/se.log`).
- 12 of 12 aisle walks finished.
- Turned-away boarders step back.

Worst tenth:
- Who sits: skirts, dresses and kilts always stand (`e/EYE.png`: all four standing riders in skirts or kilts).
- Many turned away: 19-20 per 300 s at Hillhead inner and Govan outer, against 4-7 boarding. The trains are not visibly full from the platform.
- girl_small stuck at 0.98 m from the edge.

### 3.5 Range of people: 8.14 (typical 8.5, worst 7.6)
- Roster unchanged (99).
- No children stand in cars.
- But children wait and are turned away on platforms by themselves: 24 of 83 turned away were children, with no adult with them.

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
Code and models unchanged except two hair meshes.
- Mix:
  - Buchanan Street inner ride: 0 of 29 samples with one garment kind over half.
  - Kelvinbridge outer explore: 4 of 26 over half, all small saloon groups of 6-7 trousers-heavy riders.
  - Hillhead/St George's Cross car samples: 0 of 55 over half.
  - Some cars do show a good mix (e.g. 3 trousers, 2 shorts, 1 skirt).
- Faults as in review 33: kilt knee, sporran off the side, midi slit and waist, strip sleeves, and the seated/standing split by garment.

### 3.7 Luggage: 8.24 (typical 8.8, worst 7.4)
- Six bag kinds on six new bodies, standing, walking and seated, all held or worn correctly (`n/BAG.png`). In the viewer the seated bag stands on the floor; the game puts it on the lap.
- The haggis: on the treads on stairs and never in a wall in 9 runs. When its owner sits, it rests 0.4 m above his root (tucked under his shins), as in review 33.

### 3.8 Whole bodies: 8.02 (typical 8.5, worst 7.3)
- Near model: cap hair, kilt knee, school sleeves and midi waist (unchanged); teen_ginger's stepped hairline.
- woman_mini's long black hair, seen from behind at 1.2 m in a car, is a flat black slab (`e/EYE.png`, row 2).
- elder_shorts' forehead patch is gone.
- Far model: never within 6 m (`lod6 = 0` in both 200 s runs).

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch.**
   - LEG 7.8 (p10 5.9); SMO p10 7.1; adult_heel_boots @1.9 = 7.7.
   - Heel wearers walk bent-kneed with their feet close together.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`. Stills: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,woman_puffer none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`.
2. **Feet slide when a waiting person sets off.**
   - In the first 0.15-0.2 s of a walk from standing (boarders leaving their waiting spot), a foot on the floor slides 10-15 cm at 1-2 m/s.
   - Examples: boy_shorts 15 cm at 3.7 m, staff_hivis 13 cm at 4.3 m, woman_coat 12.7 cm at 4.5 m.
   - 10-16 events over 5 cm per 100 s run.
   - The builder's tool misses it because it only looks while v < 0.08; the slide carries on to v ≈ 0.24.
   - Reproduce: `ALL=1 node gslide.mjs "mode=explore&q=high&line=inner&station=st-enoch" 100 sl/x.json; python3 skid.py sl/x.json`, then frame dumps with `python3 dump.py sl/x.json <uid>:<t0>:<t1>`.
3. **Garments and who sits:** kilt knee and sporran, midi slit and waist, strip sleeves. No skirt, dress, kilt or luggage owner ever sits, so cars split by garment.
   - Reproduce: `node shoot2.mjs 0 man_kilt_casual,woman_midi,girl_school_kilt none walk@150,walk@162,walk@174 n/kw/k legs 1.7`; `node geye2.mjs "mode=ride&q=high&line=outer&station=cowcaddens" e/eye 40 6`.
4. **Start snap and hovering feet.**
   - Walking on from a pause, a planted foot jumps 5-7 cm up and 7-9 cm forward in one tick (7-8 per 100 s).
   - A paused walker can hold one foot 3-4 cm up for up to 1.4 s.
   - Reproduce: `python3 hover.py sl/se2.json sl/bs.json`.
5. **Faces:** ya_smile_polo's twisted mouth; teen_ginger's stepped hairline; elder_shorts' squint and cheek dot; dotted brows; girl_ginger, girl_small and sum_denim_shorts_m.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/n "0:0" 0 8611 "" 14`; `FD=0.6 ANGS='[["F",3.14,0.05],["Q",2.4,0.1],["S",1.57,0.05],["T",3.14,0.6]]' node shoot2.mjs 0 teen_ginger,elder_shorts none stand f/h face`.
6. **Hair through caps on the near model, the flat phone hand, the tote in the phone hand** (unchanged code; see review 32 item 9). Also woman_mini's hair is a slab from behind.
7. **Open grips:** up to 8.5 cm, 4 of 45 over 4 cm.
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=st-georges-cross" c/sg 150`.
8. **Turned away often, children alone.**
   - 19-20 turned away per 300 s at two stations, 24 of 83 of them children with nobody.
   - girl_small stuck at 0.98 m from the edge after 4 tries.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=hillhead" 300 > x.log; python3 aw2.py x.log`.
9. **Seated hand on a neighbour's thigh:** ya_smile_polo's hand 8.5 cm from man_trews' thigh (Kelvinbridge inner, t = 5 s).
   - Reproduce: `TH=0.10 node gnb6.mjs "mode=ride&q=high&line=inner&station=kelvinbridge" 200 e5/x`.
10. **Stop-start toggles in a jam:** still up to 24 a minute over 20 s (adult_camisole). Halved, but a jam still stutters.
    - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`.

## 5. What I could not observe

- **No motion watched.** The start slides, snaps and hovers come from bone positions every 1/30 s, not from video. A 12-15 cm slide over 0.17 s at 4 m is, I judge, visible as a skate as the boarders move off, but I have not seen it play.
- **The 23 s "off the floor" at St Enoch inner.** It did not recur and the shots were blocked.
- **The haggis on stairs from the side:** only top-down shots and logged heights.
- **Blink and smile timing** in play.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s (ankle, ball), whole-run floor | St Enoch inner x2, Buchanan Street outer (100-120 s) | `sl/*.json`, `sl/skid1.txt`, `sl/hover.txt`, `sl/se2_start.txt` |
| Builder's pause tool | St Enoch inner 100 s | `sl/builder_se.log` |
| Pauses and toggles | St Enoch inner, Buchanan Street outer, 200 s | `pz/*.log` |
| Brisk walk, side, 6 phases at 1.8 m/s | adult_heel_boots, ya_tube_heels, woman_puffer, teen_shorts_lad | `n/BW.png` |
| Faces, neutral and smiling | 16 people least recently seen (`f/ids.txt`) plus 6 earlier problem faces | `f/N.png`, `f/S.png`, `f/A.png`, `f/H.png` |
| Bags: stand, walk, sit | ruck:hike, trolley:large, handbag, holdall, shopper, tote on six new bodies | `n/BAG.png` |
| Turned-away boarders | Ibrox, Hillhead, Cowcaddens inner; Partick, St Enoch, Govan outer; 300 s each | `v/aw_*.log` |
| Rises, pairs, hands, knees | 6 rides: Partick, Kelvinbridge, West Street inner; Govan, Bridge Street, Hillhead outer | `e5/n6_*.log` |
| Children in cars | Kelvinhall inner, Govan inner, Cowcaddens outer rides, 200 s | `k/*.log` |
| The haggis | 6 gpet2 runs, 4 gpet4 runs, 6 stair runs | `e/pet_*.log`, `e/p4_*.log`, `e/st_*.log`, `e/P4.png`, `e/SE_OFF.png` |
| Overlaps, far models within 6 m, duplicates, census | Buchanan Street inner ride, Kelvinbridge outer explore, 200 s | `g/pa.*`, `g/se.*` |
| Car garment mix and grips | St George's Cross inner, 150 s | `c/sg.log` |
| Player walks through full trains | St Enoch outer, Buchanan Street inner, 6 walks each | `c/wk.log`, `c/wk2.log` |
| Eye height in a car | Cowcaddens outer, 4 people x 3 views | `e/EYE.png` |

Next round, look at:
- walk starts on the near model (boarders when the doors open);
- the haggis from the side on stairs;
- grips on women holders;
- the turn-away rate.

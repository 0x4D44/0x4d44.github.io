# Under Glasgow: independent review of the people (review 53)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `ad42737d`. The changes since review 52 (`git diff 28a34ee2 HEAD -- glasgow-subway/js`) are two lines in `js/sim/people.js`:
- `rise()` line 923: a seated rider who still carries a gait object has it restored and dropped before standing up.
- `_bagHow()` line 597: while `settleTurn` or `settleGait` is set, the wheeled case's tow weight is 1 (its towing pose).

Models, `gait.js`, `bags.js`, `people_meta.json` and the faces have not changed.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review53/`; running notes are in `NOTES.md`.

New tools this round:
- `ctl6.mjs`: review 52's `ctl5.mjs`, plus `GIVE=1`, which hands the chosen rider a wheeled case through the `_bagSet` test hook. No case owner was in car 1 at Buchanan Street or Kelvinhall.
- `bagan.py` and `bagj.py`: the case's floor path, its bearing round the owner, and its per-frame speed.
- `pop.mjs`: every seated rise in the train, logged at 60 Hz from the call to 1.25 s after, with no rendering.
- `popan.py`: summarises the `pop.mjs` logs.
- `hag3.mjs`: puts the haggis owner on the platform in the crowd's own `go` mode.
- `tcen.mjs`: where wheeled-case owners are during a ride, and every `rise()` made on one.

**Result: weighted mean 8.29 (8.287). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:** the seated-rise skate.
  - At 60 Hz, 43 of 43 seated rises in two rides were smooth tweens. The largest grounded foot speed was 0.54 m/s.
  - In 6 further rendered tween rises, the feet slid 6-13 cm at no more than 0.75 m/s. Review 52's worst was 21 cm at 2.7 m/s.
- **Mostly fixed:** a standing case owner who steps round now tips the case on to its wheels and holds the grip throughout the turn.
  - New fault: at the end of each turn the case drops back to its standing place. It travels about 36 cm in about 0.25 s, peaking at 5.4-7.3 m/s at its base. This happened in all 3 controlled turns.
  - A pole holder's case is not covered. `bags.js` forces tow to 0 in the `pole` state, so it still sweeps rigidly round its owner: 1.18-1.29 m of floor at 0.72-0.80 m/s. In one case it ended half inside a seat end.
- **Found this round (none of them caused by the new code):**
  - `woman_scarf` and `adult_harem` have near-identical faces and hair.
  - `ya_spiky` shows a pink scalp patch at the front hairline.
  - `teen_boy` has a dark mark under his left eye.
  - `sum_shorts_asian_m`'s smile is twisted.
  - Seen from behind at 0.8 m, `woman_midi`'s black bob is a flat-sided slab.
  - One car sample was 57 % in shorts, above the rubric's half.
  - A haggis that cannot reach its place trots on the spot.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.8 | **8.46** |
| 3 | Faces | 10 | 8.7 | 7.6 | **8.26** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.8 | **8.58** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.5 | **8.28** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.29** (8.287) |

0.20x8.12 + 0.10x8.46 + 0.10x8.26 + 0.10x8.58 + 0.10x8.30 + 0.15x8.24 + 0.10x8.28 + 0.15x8.26 = 1.624 + 0.846 + 0.826 + 0.858 + 0.830 + 1.236 + 0.828 + 1.239 = 8.287.

Changes against review 52 (8.283):
- **Behaviour +0.12** (worst tenth 7.5 to 7.8).
  - The rise skate is gone.
  - The worst sit-down slide this round was 14 cm. Review 52's was 27 cm.
- **Arms and hands +0.04** (worst tenth 7.7 to 7.8). A case owner's hand is on the grip while they step round.
- **Luggage +0.04** (worst tenth 7.4 to 7.5). Credit for the turn, held back by:
  - the end-of-turn scoot;
  - the unchanged orbit for pole holders.
- **Faces -0.10** (typical 8.8 to 8.7, worst tenth 7.7 to 7.6). The faces did not change. I sampled 18 faces new to review 52 and found the faults listed above.
- **Clothing -0.04** (worst tenth 7.5 to 7.4). One car sample was above half in one garment.
- **Walking, range and whole bodies are unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Standing up from a seat drops any gait left from before the person sat | **TRUE.**<br>- `pop.mjs`, 60 Hz from the call, Govan outer and Partick inner, 700 s each: 43 seated rises, every one a plain 0.9 s tween. The pelvis rises 0.47 to 0.85 m at no more than 1.3 cm a frame. Grounded feet move at no more than 0.54 m/s.<br>- Rendered rises at Hillhead inner and Govan outer: 6 tween rises (`boy_small`, `ya_tube_heels`, `ya_ginger_long`, `sum_shorts_asian_m`, `sum_crop_bike`, `teen_tee`). Grounded slide in the rise 6-13 cm at 0.12-0.75 m/s. No skate.<br>- The 3 rises that `gsit.mjs` logged as already standing (`girl_leggings`, `ya_shorts`, `adult_casual5`) are a logging artefact: the 60 Hz probe shows no pop in any of 43. This settles review 52's open question.<br>- `r/CROP.png` (`sum_crop_bike`) stands and steps round cleanly. | `pop_g.json`, `pop_p.json`, `python3 popan.py pop_*.json`, `r/*.json`, `python3 an2.py r/*.json`, `r/CROP.png` |
| 2 | Stepping round or to a new spot, a wheeled case goes to its towing pose and turns with them from the hand | **TRUE for a standing owner, with a new snap at the end. NOT TRUE for a pole holder.**<br>- `ctl6.mjs`, Buchanan Street outer, 150-degree turns on the spot with a case handed over: `woman_sash`, `adult_beret`, `adult_piper`.<br>- During the turn the case is tipped on its wheels and the grip is in her hand (`tr/SASHt.png`, frames 1.4-4.0 s). The wheels roll at about 0.83 m/s. This reads as towing.<br>- When the turn ends, the tow weight eases back to 0 at 14 % a frame. The case crosses about 0.36 m to its standing place in about 0.25 s, at 5.4, 5.7 and 7.3 m/s peak (`bagj.py`, frames 258-272), and rights itself as it goes (`tr/SASH.png`, row 2).<br>- At the start, the change to towing moves the base about 0.3 m at 1.5-2.3 m/s.<br>- Kelvinhall inner, pole holders (`teen_skirt`, `woman_midi`) given a case and turned 150 degrees in `pole` mode: unchanged from review 52. The case is rigid to the pelvis and sweeps 1.18-1.29 m of floor at 0.72-0.80 m/s. For `woman_midi` it ends half inside the seat end (`tr/PMIDI.png`). Cause: in `stepBag`, the `pole` state forces `tow` to 0.<br>- How often this happens in play: in a 500 s ride from Ibrox outer, all 78 case-owner samples were on the platform and none was in a car (`tc_i.log`). So the pole case is rare. | `tr/t_*.json`, `tr/p_*.json`, `python3 bagan.py tr/*.json`, `VT=1.6 python3 bagj.py tr/*.json`, `tr/SASH.png`, `tr/SASHt.png`, `tr/PMIDI.png`, `tc_i.log` |
| 3 | Not changed: turn speed, sit-down slide, crouch, faces, `boy_kilt`, clip-change slide, toe drag, start-up dip, kilts, hairlines, pole reach, children alone | **Confirmed unchanged where measured.**<br>- Turns after a rise: 90 degrees in 2.2-2.3 s. Standing pole moves: 168 degrees in 3.7 s (`man_highland`, `elder_man_cap`).<br>- Sit-downs at Kelvinhall outer (`woman_bob`, `ya_knit` twice, `teen_skater`): grounded slide during the sit 9-19 cm at no more than 0.64 m/s; end displacement 4-14 cm.<br>- Faces as review 52 found them, plus new faults (section 3.3).<br>- `gait.js` and the models are untouched, so the walking instrument carries over (9.51; LEG p10 and SMO p10 7.4). | `s/*.json`, `python3 an2.py s/*.json`, `r/h_1*`, `r/h_4*`, `f/` |

## 2. Status of REVIEW_52's top ten

| # | REVIEW_52 item | Now |
|---|---|---|
| 1 | Seated-rise skate (21 cm at 2.7 m/s) | **Fixed.** 43 of 43 rises at 60 Hz and 6 rendered rises are clean. |
| 2 | Slow stepped turns | Unchanged: 90 degrees in 2.2-2.3 s; 150 degrees in about 3.0-3.2 s (controlled); 168 degrees in 3.7 s. |
| 3 | Wheeled case sweeps round its owner | **Partly fixed.** Standing owners now tow it round by the grip, but it scoots 36 cm at up to 7.3 m/s when the turn ends. Pole holders' cases still orbit (1.18-1.29 m at 0.8 m/s). |
| 4 | Sit-down foot slide 6-27 cm | Unchanged in kind: 4-14 cm end displacement and 9-19 cm accumulated in 4 sit-downs this round. |
| 5 | Heel and pencil-skirt crouch; LEG p10 and SMO p10 7.4 | Unchanged (gait and models untouched). |
| 6 | Faces | Unchanged, and more faults found among faces not sampled before (section 3.3). |
| 7 | `boy_kilt` seated band | Not re-rendered. The model and `_skirtSit` are unchanged, so it carries over. |
| 8 | Clip-change slide; start-up dip | Not re-measured; the code is unchanged. |
| 9 | Release-phase toe drag | Present: in the rendered rises the grounded R-phase slide is 1-5 cm, and 2-9 cm on the controlled turns. |
| 10 | Minor and carried over | Unchanged: kilt mid-stride, ragged hairlines, pole hands, children alone. A girl sat alone in a car at St Enoch inner (`eye/E2.png`, row 2). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- `gait.js`, `people_meta.json` and the models did not change (`git diff 28a34ee2 HEAD`). I did not re-run `people_motion.mjs`; review 52's 9.51 (LEG p10 7.4, SMO p10 7.4) stands.
- Turns stay slow: 90 degrees takes 2.2-2.3 s (about 40 degrees per second).
- The rise no longer drags the feet, but rises are scored under behaviour. Walking is unchanged.

### 3.2 Arms and hands: 8.46 (typical 8.9, worst tenth 7.8)
- Gain: a case owner stepping round now has the grip in the left hand (`tr/SASHt.png`, frames 1.4-4.0 s).
- Still there:
  - A standing owner's hand is not on the case: it stands beside the leg with the handle up (`tr/SASHt.png`, frames 0 and 4.7 s).
  - The pole holder turning with a case has no hand on it.
- At the player's eye height, `man_highland`, face to face in the aisle, holds his left arm straight out at shoulder height with no rail visible in the frame (`eye/se_09.jpg`). I could not see what the hand meets, so I did not mark it down.

### 3.3 Faces: 8.26 (typical 8.7, worst tenth 7.6)
- 25 faces at 0.85 m, neutral and at smile 0.6 (`f/N.png`, `f/S.png`, zooms `f/Z.png`): 7 flagged before and 18 not sampled in review 52.
- Good:
  - `ya_ginger_braid`, `adult_smile_blouse`, `woman_bob`, `elder_woman_coat`, `adult_tophat`, `adult_camisole` and `man_commuter` read as their age and sex.
  - Their gentle smiles look natural.
- Still there:
  - `teen_hood`'s smile is lopsided, and there is a pink dot at his crown.
  - `woman_midi` and `sum_crop_bike` frown.
  - `sum_crop_bike` and `sum_denim_shorts_m` show crown dots.
  - `sum_denim_shorts_m` has a mark under his eye.
  - Neutral mouths are dour across the set.
- New this round:
  - **`woman_scarf` and `adult_harem` are near-twins**: the same hair (`elvs_island_princess_hair`, `#17120e`), the same brows, the same skin family and almost the same face (`f/Z.png`, bottom row). They differ only below the neck. `tools/assets_people_mpfb.py` lines 56 and 152.
  - `ya_spiky`: a pink scalp patch at the front hairline (`f/Z.png`, top left).
  - `teen_boy`: a dark bruise-like mark under his left eye (`f/Z.png`, top middle).
  - `sum_shorts_asian_m`: at smile 0.6 the mouth twists and does not read as a smile (`f/Z.png`, bottom left).
  - `adult_casual5`: dark marks under both eyes.
- The long black "princess" hair is planar and chunky at 0.85 m (`f/N.png`, row 2 column 5 and row 3 column 4).

### 3.4 Standing, sitting, behaviour: 8.58 (typical 9.1, worst tenth 7.8)
- Typical:
  - Rises are clean.
  - Standing pole moves step round without spin.
  - Platform and car crowds look natural at eye height (`eye/E1.png`, `eye/E2.png`).
- Worst tenth:
  - Sit-down slides of 9-19 cm accumulated and up to 14 cm at the end (`s/`).
  - Turns of 2.2-3.7 s.
  - The case scoot (scored under luggage).

### 3.5 Range of people: 8.30 (unchanged)
- 99 characters: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff. The outfit census is unchanged.
- The twin faces are scored under faces.
- Children alone: a young girl seated alone in a car at St Enoch inner (`eye/E2.png`).

### 3.6 Clothing: 8.24 (typical 8.8, worst tenth 7.4)
- Cessnock inner, explore, board at 60 s, then ride; 419 s (`cen/ce.json`, `python3 cen4.py cen/ce.json`):
  - Platform samples within 15 m: at most 50 % trousers.
  - **One of 8 car samples was 57 % shorts (4 of 7).** The rubric allows no more than half in one garment.
  - Families seen: trousers 161, shorts 128, skirts and dresses 63, leggings 51, kilts 44, highland trews 6, highland dress 5, pleated 4.
- Carried over: `boy_kilt`'s seated band, and the kilt opening mid-stride.

### 3.7 Luggage: 8.28 (typical 8.8, worst tenth 7.5)
- Gain: the towed turn (claim 2).
- Worst tenth:
  - The 0.36 m end-of-turn scoot at 5-7 m/s, seen in every controlled turn.
  - The pole-holder case orbit, which can end inside a seat end (`tr/PMIDI.png`). I weighted this lightly because no case owner reached a car in 500 s of riding.
- The haggis is not luggage, but its follow is scored here as a carried companion. In `hg/h.log` it stays 0.42 m from its standing owner at the platform edge for 3 s or more with `v` held at 1.42 m/s and its position fixed.
  - By the code, it trots on the spot. `followStep` advances the leg phase by the step before the floor clamp or the leg-avoidance pushes it back, and `poseHaggis` swings the legs fully once `v` is above 0.6 m/s.
  - So a haggis that cannot reach its place behind and left of the owner (at the platform edge, or against legs) scuttles at about 12 cycles a second without moving.
  - This is the execution of the requested haggis, not its existence.

### 3.8 Whole bodies: 8.26 (unchanged)
- Cessnock run: no far model within 6 m, no overlaps, no duplicates, 47 stair walks with none stalled (`cen/ce.log`).
- New, at the player's eye height: from behind at about 0.8 m, `woman_midi`'s black bob is a flat-sided, hard-edged slab (`eye/se_12.jpg`).
- Scalp dots and hairlines are as noted under faces.

## 4. Top ten defects, in priority order

1. **Wheeled case scoots back at the end of every stepped turn**: about 0.36 m in about 0.25 s, peaking at 5.4-7.3 m/s, and it rights itself as it goes. At the start the base moves 0.3 m at 1.5-2.3 m/s.
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=300 node ctl6.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 3 150`, then `VT=1.6 python3 bagj.py tr/t_*.json`; see `tr/SASH.png`.
   - Likely fix: let go of the case with a slower blend, or keep the towing pose until the feet settle and then set the case down where it is rather than at the fixed standing offset.
2. **Pole holders' cases still orbit them rigidly** (1.18-1.29 m at 0.8 m/s) and can end inside a seat end.
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=300 node ctl6.mjs "mode=ride&q=high&line=inner&station=kelvinhall" tr/p pole 2 150`; see `tr/PMIDI.png`.
   - Cause: `bags.js` `stepBag` sets `tow = 0` whenever `pole` is true.
3. **Stepped turns are slow:** 90 degrees in 2.2-2.3 s; 168 degrees in 3.7 s.
   - Reproduce: `r/h_1*.json`, `r/h_4*.json`; `python3 an2.py`.
4. **Sit-down foot slide:** 9-19 cm accumulated during the sit, and 4-14 cm at the end.
   - Reproduce: `NEARCAM=3 SIDE=1 FR=240 node gsit.mjs "mode=ride&q=high&line=outer&station=kelvinhall" s/k 900 5`, then `python3 an2.py s/*.json`.
5. **Faces:**
   - `woman_scarf` and `adult_harem` are twins.
   - `ya_spiky`'s scalp patch.
   - `teen_boy`'s under-eye mark.
   - `sum_shorts_asian_m`'s twisted smile.
   - Lopsided `teen_hood`.
   - Frowning `woman_midi` and `sum_crop_bike`.
   - Crown dots on 3 people.
   - Dour neutral mouths.
   - Reproduce: `node face4.mjs <ids> f/n 0:0 0` and `... f/s 0:0 0.6`; see `f/Z.png`.
6. **Heel and pencil-skirt crouch**, and the walking worst cases: LEG p10 and SMO p10 7.4 (review 52's `m/def.log`; the code is unchanged).
7. **Haggis trots on the spot** when it cannot reach its place (`hg/h.log`: `v` 1.42 with a fixed position for 3 s or more; `hg/H.png`).
   - Reproduce: `node hag3.mjs "mode=explore&q=high&line=inner&station=buchanan-street" hg/h`.
   - Cause: `haggis.js` `followStep` advances `ph` before the push-back; `poseHaggis` uses `v`, not the distance actually moved.
8. **A car sample over half in one garment:** 57 % shorts (4 of 7), Cessnock inner ride.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=cessnock" cen/ce 360 60`, then `python3 cen4.py cen/ce.json`.
   - The `_pick` cap allows a 4th of 7 when the car has fewer than 4 people at the moment of the pick (`nOwn >= 4`).
9. **`woman_midi`'s bob from behind** is a flat black slab at 0.8 m (`eye/se_12.jpg`). `boy_kilt` seated band (carried over).
10. **Minor and carried over:**
    - Release-phase toe drag of 2-9 cm.
    - The clip-change slide.
    - The start-up dip.
    - The kilt opening mid-stride.
    - Ragged hairlines.
    - Pole hands at long reach.
    - Children alone (`eye/E2.png`).

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **The haggis walking.** This was the 4th attempt.
  - `hag3.mjs` added the owner in the crowd's `go` mode, but he never set off.
  - I judged its following only from a standing owner and from the code.
- **Case owners in a train.** In 500 s of riding no case owner boarded, so the turn fixes were seen only under forced (`GIVE=1`) conditions.
- **Not re-measured** (the code and models are unchanged since review 52):
  - the walking instrument;
  - `boy_kilt` seated;
  - the clip-change slide;
  - stair feet;
  - far models walking at 7 m.
- **The container restarted mid-review.** A second sit-down run was stopped after 2 events to finish in time.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Controlled case-owner turns, 150 degrees, standing | Buchanan outer: `woman_sash`, `adult_beret`, `adult_piper` (case handed over) | `tr/t_*`, `tr/SASH.png`, `tr/SASHt.png` |
| Controlled case-owner turns, pole holders | Kelvinhall inner: `teen_skirt`, `woman_midi` | `tr/p_*`, `tr/PMIDI.png` |
| Seated rises, 60 Hz, no render | Govan outer and Partick inner, 700 s each: 43 rises (25 + 37 calls logged) | `pop_g.json`, `pop_p.json` |
| Seated rises and standing moves, rendered | Hillhead inner (7) and Govan outer (6) | `r/`, `r/CROP.png` |
| Sit-downs | Kelvinhall outer: `woman_bob`, `ya_knit` (2), `teen_skater` | `s/` |
| Faces, neutral and smile 0.6 | 25 people (18 new) | `f/N.png`, `f/S.png`, `f/Z.png` |
| Census, far models, overlaps, duplicates, stairs | Cessnock inner explore, board, ride, 419 s | `cen/ce.json`, `cen/ce.log` |
| Case owners in play | Ibrox outer ride, 500 s | `tc_i.log` |
| Player eye height, walking the cars | St Enoch inner ride | `eye/E1.png`, `eye/E2.png`, `eye/se_09.jpg`, `eye/se_12.jpg` |
| Haggis | Buchanan inner, owner put on the platform | `hg/h.log`, `hg/H.png` |

Next round, look at:
- A case owner who boards a train, without forcing.
- The haggis with its owner actually walking: a hook that makes him a platform walker would make this observable.
- `boy_kilt` seated.
- The walking instrument, if `gait.js` changes.

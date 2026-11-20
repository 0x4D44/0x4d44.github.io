# Under Glasgow: independent review of the people (review 52)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `28a34ee2`. Changes since review 51 (`git diff 5ac0d0cf HEAD -- glasgow-subway`):
- `js/sim/people.js` line 981: at the end of a stepped turn, `p.yaw = w.yaw` became `p.yaw += angDiff(p.yaw, w.yaw)` (the short way round).
- `models/people.glb`, `people_lod.glb`, `people_meta.json` rebuilt: new hair on `man_kilt_casual`, `adult_casual5`, `sum_denim_shorts_m`; `elder_shorts`'s eyes. `armfit.js` and `legradii.js` re-fitted for two of those men; test budgets updated.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review52/`; running notes are in `NOTES.md`. New tools this round: `spin.py` (each foot's heading, ankle to ball, frame by frame: the worst rate and the largest net turn in any 0.25 s), `ctl5.mjs` (controlled stepped turns whose target is given wrapped to plus or minus pi, so that the turn crosses the wrap the way the game's do), `body.mjs` (full-model whole-body stills in the viewer, front three-quarter) and `hag2.mjs` (an attempt to make the haggis owner walk).

**Result: weighted mean 8.28 (8.283). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:** the foot spin at the end of a stepped turn that crosses plus or minus pi. 9 controlled wrap-crossing turns and 1 game move that crossed -pi: no yaw jump, no spin.
- **Partly:** the repeated spiky-black-hair men. `man_kilt_casual` now looks different. `adult_casual5`'s new hair renders black and short, so he still reads as the same template as `ya_smile_polo` and `man_hoodie`.
- **Found this round:**
  - The seated-rise skate is not gone everywhere. `ya_knit` (Hillhead inner) slid both feet 21 cm sideways at 2.4-2.7 m/s while her standing gait blended in. That was 1 of the 6 sideways-tween rises I logged.
  - Sit-down slides reach 19-27 cm (`man_trews`).
  - The wheeled case's swing round its owner, now measured: 1.29 m of floor path at up to 0.79 m/s.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.7 | **8.36** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.5 | **8.46** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.5 | **8.28** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.28** (8.283) |

0.20x8.12 + 0.10x8.42 + 0.10x8.36 + 0.10x8.46 + 0.10x8.30 + 0.15x8.28 + 0.10x8.24 + 0.15x8.26 = 1.624 + 0.842 + 0.836 + 0.846 + 0.830 + 1.242 + 0.824 + 1.239 = 8.283.

Changes against review 51 (8.275):
- **Faces +0.04** (worst tenth 7.6 to 7.7). One of the three re-haired men now has a face of his own, and `elder_shorts`'s pale eyes are brown. Everything else on the faces is as it was.
- **Behaviour +0.04** (worst tenth 7.4 to 7.5).
  - Gain: the foot spin, which review 51 saw in 3 of 4 standing moves, is gone.
  - Losses found this round: the 21 cm skate in 1 of 6 seated rises, and a 27 cm sit-down slide.
- **Every other category is unchanged.** The walking instrument reads exactly as before (9.51; LEG p10 and SMO p10 7.4).

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A stepped turn ends the short way; no yaw jump; toes after the turn at most 0.36 m/s | **TRUE.**<br>- Controlled, wrap-crossing 150-degree turns (`ctl5.mjs`, target given wrapped). Ibrox outer: `woman_sash` (6.02 to -2.88), `teen_runner`, `adult_tie_suit`, `ya_smile_dress`, `woman_midi`. Kelvinhall inner, pole and rail holders: `woman_mini`, `teen_girl`, `woman_midi`, `man_kilt_casual`.<br>- Results: max yaw step 0.03 rad. Foot heading at most 284 degrees/s, with at most 53 degrees net in any 0.25 s (review 51's spins were 3,500 degrees/s and 357 degrees). Toe after the turn 0.17-0.34 m/s.<br>- In the game: Govan outer, `elder_man_cap` stood at yaw -2.81 and turned through -pi to -4.71 (the case that spun before). No jump, no spin, toe 0.38 m/s.<br>- 6 other game turns at Hillhead and Govan: no jump; toe 0.24-0.34 m/s.<br>- `c/SASH.png`: the feet step round cleanly.<br>- Side note: in the release phase a grounded toe still drags 2-9 cm (`woman_sash` 8.7 cm; `man_kilt_casual` 6 cm at up to 1.04 m/s). | `c/w_*.json`, `c/p_*.json`, `r/g_5_*.json`, `python3 spin.py c/*.json r/*.json`, `python3 turn.py ...`, `c/SASH.png` |
| 2 | Three men re-haired (`man_kilt_casual` short03, `adult_casual5` short02, `sum_denim_shorts_m` short04); `elder_shorts`'s eyes brown | **TRUE as stated. Half effective.**<br>- `man_kilt_casual`: an auburn, side-swept fringe over one eye. Distinct, though it reads as a bob (`b/B0.png` top row).<br>- `adult_casual5`: short02 renders black and close-cropped, with a notched hairline. Beside `ya_smile_polo`, `man_hoodie`, `teen_hood` and `ya_tee_jeans` he still reads as the same young dark-haired template (`f/N.png`).<br>- `sum_denim_shorts_m`: dark, slicked back, reads older. Different, but his face keeps the dark-red mark under the left eye and at the smile's mouth corner, and a pink dot at the crown (`f/zoom1.png`).<br>- `elder_shorts`: brown eyes now. The face is still blotchy and the smile twisted. | `f/N.png`, `f/S.png`, `f/zoom1.png`, `b/B0.png` |
| 3 | Not changed: turn speed, case orbit, crouch, start-up dip, sit/rise slide, clip-change slide, faces, `boy_kilt`, kilts, hair, pole reach, children alone, clumping | **Confirmed unchanged, and two are worse in the samples than earlier reviews said.**<br>- Turns: 90 degrees 2.03-2.30 s; 150 degrees 3.05-3.57 s.<br>- Case orbit measured: 150 degrees round the owner, 1.29 m of floor at up to 0.79 m/s (`tr/TR.png`).<br>- Rise slide 6-12 cm in 5 of 6 rises, **but 21 cm at 2.7 m/s in one**.<br>- Sit-down slide 6-27 cm.<br>- A child's clip change slid one foot 9.1 cm (`girl`, `idle_a` to `kid_fidget`).<br>- `boy_kilt`'s band (`g/S1.png`); the kilt opening mid-stride (`far/F.png`).<br>- Instrument 9.51 / 7.4 / 7.4. | see section 3 |

## 2. Status of REVIEW_51's top ten

| # | REVIEW_51 item | Now |
|---|---|---|
| 1 | 360-degree foot spin after a wrap-crossing stepped turn | **Fixed** (10 wrap-crossing turns, none spin). |
| 2 | Slow stepped turns | Unchanged: 90 degrees 2.0-2.3 s, 108 degrees 2.30 s, 150 degrees 3.05-3.57 s. |
| 3 | Wheeled case orbits its owner | Unchanged, now measured: 1.29 m of floor path, up to 0.79 m/s, 150 degrees round her. |
| 4 | Heel and pencil-skirt crouch | Unchanged. LEG p10 7.4; `woman_coat` loading knee 4.2-4.7. |
| 5 | Seated-rise slide 6-13 cm | **Worse in the worst case.** 5 of 6 tween rises slide 8-12 cm at 0.35-0.8 m/s; `ya_knit` 21 cm at 2.7 m/s. |
| 6 | Sit-down foot slide | Measured: 6-27 cm end displacement over 5 sit-downs; `man_trews` 18.6 and 26.9 cm. |
| 7 | Faces | Partly: one man's template look gone; eye colour fixed. Lopsided smiles, mouth-corner dot, frown, dour mouths unchanged. |
| 8 | `boy_kilt` seated band | Unchanged (`g/S1.png`, row 2). |
| 9 | Start-up dip; clip-change slide | Unchanged; the clip-change slide is 9.1 cm on a child (`girl`). |
| 10 | Minor and carried over | Unchanged: kilt mid-stride, ragged hairlines (`teen_hood`, `adult_tattoo_muscle`, `adult_casual5`), children alone (a girl seated alone in a car, `eye/E2.png`). Clumping is better at Ibrox (at most 50 %). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- `people_motion.mjs --people default`: 9.51; LEG p10 7.4 and SMO p10 7.4, both below 8.
- Worst items (`m/worst.log`):
  - `woman_coat`: knee in loading 4.2-4.7.
  - `woman_midi` and `boy`: pelvis acceleration 5.0-5.3.
  - `girl_school_kilt`: high-frequency joint power 5.8.
- Turns are unchanged and slow (about 45-50 degrees per second).
- `gait.js` did not change.

### 3.2 Arms and hands: 8.42 (unchanged)
- The re-fit `armfit.js` rows for `adult_casual5` and `man_kilt_casual` change arm clearance by 1.5 degrees. Their idle, phone and walk poses show no arm through the body (`b/B0.png`).
- A wheeled case owner does not hold the handle while standing; the case simply stands by her (`tr/TR.png`). This is as before.

### 3.3 Faces: 8.36 (typical 8.8, worst tenth 7.7)
- 25 faces at 0.6 m, neutral and at full smile: the 9 flagged before and 16 new picks (seed 52, none seen in review 51). See `f/N.png`, `f/S.png`, `f/zoom1.png`.
- Gains:
  - `man_kilt_casual` has his own look.
  - `elder_shorts`'s eyes are brown.
- Still there:
  - `teen_hood` and `ya_smile_polo` smile lopsided.
  - `woman_midi` smiles over a frown.
  - `girl_shorts` and `sum_denim_shorts_m` show a dark dot at the mouth corner in the smile; `sum_denim_shorts_m` also has a red mark under the left eye.
  - Neutral mouths are dour.
  - Pink scalp dots show at the crown on `sum_denim_shorts_m`, `teen_hood` and `sum_crop_bike`.
  - Five young dark-haired men still share one look.
- Most smiles are gentle and read as natural: `woman_coat`, `staff_hivis`, `girl_small`, `woman_sash`, `elder_man_suit`.

### 3.4 Standing, sitting, behaviour: 8.46 (typical 9.1, worst tenth 7.5)
- **Typical:**
  - Pole and rail holders in a moving car (St George's Cross inner) move 0.1-0.2 cm in 20 s; platform standers move 1.0-1.5 cm (`st_sg.json`).
  - Wrap-crossing turns are clean.
  - Most rises slide 8-12 cm, which reads acceptably at 3 m.
- **Worst tenth:**
  - **`ya_knit` rise (Hillhead inner, sitting with her phone, full model, sideways tween).** `r/h_3_rise_ya_knit.json`, frames 0-5: the static gait blends in (wL 0.58 to 1) and both feet slide 21 cm sideways together along the floor at 2.4-2.7 m/s (y constant). That is review 50's skate. The other 5 tween rises were 0.35-0.8 m/s.
    - Probable cause: the guard at people.js:1070, `!(p.tween && !p.settleGait && !p.gait)`, only holds the gait off when the rider has no gait object. A seated rider who still carries one, for example a dormant one left from sitting down, gets it blended in during the tween.
  - **Sit-down slides** of 6-27 cm (`s/k_3_settle_man_trews`: 18.6 and 26.9 cm at 0.5 m/s).
  - A child's clip change slid one foot 9.1 cm (`girl`, St George's Cross platform).
  - Release-phase toe drags of 2-9 cm.
  - Turns of 2-3.6 s.

### 3.5 Range of people: 8.30 (unchanged)
- 99 characters: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff. The outfit census is unchanged.
- Children alone: a young girl seated alone with a pink bag in a car (`eye/E2.png`, row 2).

### 3.6 Clothing: 8.28 (unchanged)
- Ibrox outer, explore then board then ride, 360 s (`cen/ib.json`):
  - Platform samples within 15 m: at most 42 % trousers.
  - Cars: at most 50 % trousers, never above.
  - Every family was seen (trousers 214, shorts 200, skirts and dresses 95, kilts 62, leggings 59, pleated 5, trews 1).
- `boy_kilt` seated still shows the kilt as a band at the hips with the thighs bare, at 2.4 m (`g/S1.png`, row 2).
- `man_highland`'s kilt opens mid-stride on both models (`far/F.png`).
- `man_kilt_casual` and `woman_mini` cannot sit (`_canSit` false on every seat at St Enoch), so their seated garments are not a factor.

### 3.7 Luggage: 8.24 (unchanged)
- The case orbit, measured (`tr/t_0_woman_mini.json`, `tr/TR.png`):
  - The case is rigid to her pelvis and sweeps from -124 degrees to +86 degrees bearing round her.
  - It travels 1.29 m along the floor at up to 0.79 m/s, without tipping on to its wheels and without her hand on it.
- Rucksacks on the back, totes, shoppers, a holdall and the trolley all look right standing and seated (`eye/SE.png`, `b/B0.png`, `g/S1.png`).

### 3.8 Whole bodies: 8.26 (unchanged)
- Ibrox run: no far model within 6 m, no overlaps, no duplicates, 27 stair walks with none stalled.
- Near and far models match at 7 m for 8 walkers (`far/F.png`).
- The new hair is whole on both models. The scalp dots and ragged hairlines are as noted under faces.

## 4. Top ten defects, in priority order

1. **Seated-rise skate in some rises: both feet slide 21 cm at 2.7 m/s** while the standing gait blends in (`ya_knit`, Hillhead inner, 1 of 6 tween rises).
   - Reproduce: `NEARCAM=3 KIND=rise SIDE=1 FR=300 node gsit.mjs "mode=ride&q=high&line=inner&station=hillhead" r/h 900 8`, then `python3 an2.py r/h_3*.json` (S row, gv 2.66) and the per-frame print in `NOTES.md`.
   - Likely fix: hold the gait's weight at 0 for the whole tween, or drop a dormant gait when the person sits.
2. **Stepped turns are slow:** 90 degrees in 2.0-2.3 s; 150 degrees in 3.05-3.57 s.
   - Reproduce: `NOMOVE=1 FR=300 node ctl5.mjs "mode=ride&q=high&line=outer&station=ibrox" c/w move 5 150`, then `python3 turn.py c/*.json`.
3. **Wheeled case sweeps round its owner:** 1.29 m of floor at 0.79 m/s.
   - Reproduce: `BAG=trolley NOMOVE=1 FR=300 node ctl5.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 2 150`; see `tr/TR.png`.
4. **Sit-down foot slide** of 6-27 cm (`man_trews` 27 cm).
   - Reproduce: `NEARCAM=3 SIDE=1 FR=240 node gsit.mjs "mode=ride&q=high&line=outer&station=kelvinhall" s/k 900 5`, then `python3 an2.py s/k_*.json`.
5. **Heel and pencil-skirt crouch**, and the walking worst cases: LEG p10 and SMO p10 7.4 (`m/def.log`, `m/worst.log`).
6. **Faces:**
   - The lopsided smiles of `teen_hood` and `ya_smile_polo`.
   - `woman_midi`'s frown.
   - The mouth-corner dot on `girl_shorts` and `sum_denim_shorts_m`, and the mark under `sum_denim_shorts_m`'s eye.
   - Dour neutral mouths.
   - Five dark-haired young men still alike (`adult_casual5`'s new hair renders black).
   - Pink scalp dots at the crown on 3 of 25.
   - See `f/zoom1.png`.
7. **`boy_kilt` seated:** the kilt is a band at the hips (`g/S1.png`).
   - Reproduce: `node gseat.mjs "mode=ride&q=high&line=outer&station=st-enoch" g/s boy_kilt`.
8. **Clip-change foot slide:** 9.1 cm on a child (`girl`, `idle_a` to `kid_fidget`; `st_sg.json`).
   - Reproduce: `node stand.mjs "mode=ride&q=high&line=inner&station=st-georges-cross" st_sg.json 20 30 1 1`.
   - The start-up dip is unchanged.
9. **Release-phase toe drag** of 2-9 cm after every stepped turn (`ball_* Rg` in `an2.py` on `c/*.json`), at up to 1.04 m/s (`man_kilt_casual`).
10. **Minor and carried over:**
    - The kilt opening mid-stride (`far/F.png`).
    - Ragged hairlines.
    - Pole hands at long reach.
    - Children alone (`eye/E2.png`).
    - `man_kilt_casual`'s fringe covering one eye, which reads as a woman's bob.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **The haggis walking.**
  - In three game runs (Cowcaddens outer explore 300 s; St Enoch outer ride 900 s; plus St Enoch for seating) the string-vest man was seated in a train throughout.
  - Forcing him to walk on a platform (`hag2.mjs`, Buchanan and Kelvinhall) did not work: the crowd returned him to standing.
  - Standing, the haggis sits at his heel 0.4-0.8 m away and does not float (`hg/A.png`). Seated, it is at his feet (`g/S1.png`).
  - I cannot judge its trot or the lead in motion.
- **Several logged rises** (`girl_small`, `adult_cap_shorts`, as with review 51's "no tween" cases) were fully standing, clip weight 1, after the single 0.1 s tick in which the rise was called. I could not establish whether that is a pop from seat to standing or a logging artefact, so I did not score it.
- **The viewer has no pole or game phone holds**, so hands on poles and phones were judged only from game stills, which were few this round.
- **Trains were sparse** in both rides (Buchanan outer, Ibrox outer). I did not see a full car.
- **Not re-measured:** platform-bench rises; stair feet (the counts only: 27 walks, none stalled); the start-up dip.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Wrap-crossing stepped turns, controlled | Ibrox outer standers: `ya_smile_dress`, `woman_sash`, `woman_midi`, `teen_runner`, `adult_tie_suit`. Kelvinhall inner pole/rail holders: `woman_mini`, `teen_girl`, `woman_midi`, `man_kilt_casual` | `c/`, `c/SASH.png` |
| Game rises and moves, 60 Hz | Hillhead inner (7): `adult_oxford_shirt`, `adult_beret`, `ya_knit`, `elder_man_cap`, `woman_puffer`, `girl_small`, `girl_leggings`. Govan outer (5): `adult_lusekofta`, `sum_tee_leggings`, `ya_ginger_long`, `adult_cap_shorts`, `elder_man_cap` (wrap crossing) | `r/`, `r/KNIT*.png`, `r/GSM.png` |
| Sit-downs, 60 Hz | Kelvinhall outer: `sum_crop_bike`, `woman_dress`, `man_trews`, `ya_knit`, `sum_tube_denim` | `s/` |
| Wheeled case in a turn | Buchanan outer: `woman_mini` | `tr/` |
| Standing and pole feet, 20 s, moving train | St George's Cross inner: 6 pole/rail holders, 12 platform standers | `st_sg.json`, `st_sg.log` |
| Seated garments as the game seats them | St Enoch outer: `boy_kilt`, `girl_school_kilt`, `adult_string_vest` (haggis); refusals for `man_kilt_casual`, `woman_mini` | `g/S1.png`, `g/s.log` |
| Faces at 0.6 m, neutral and full smile | 25 people (16 new) | `f/` |
| Whole bodies, full model, 6 poses | `man_kilt_casual`, `adult_casual5`, `sum_denim_shorts_m`, `elder_shorts`; long-haired women in phone/talk poses (`woman_coat`, `ya_ginger_long`, `teen_girl`, `woman_student`, `adult_heel_boots`, `teen_hippy`) | `b/B0.png`, `b/P.png` |
| Near against far model at 7 m | 8 walkers | `far/F.png` |
| Census, far models within 6 m, overlaps, duplicates, stairs | Ibrox outer explore, board, ride, 360 s | `cen/ib.json`, `cen/ib.log` |
| Player eye height | Buchanan outer ride (walking the cars); St Enoch inner platform | `eye/E1.png`, `eye/E2.png`, `eye/SE.png` |
| Walking instrument | Default set | `m/def.log`, `m/worst.log` |
| Haggis | Cowcaddens outer explore; St Enoch outer ride; forced on Buchanan and Kelvinhall platforms | `hg/` |

Next round, look at:
- The rise skate's trigger: which seated riders carry a gait object.
- The haggis walking: a test hook that walks its owner would make it observable.
- A full car.
- Platform-bench rises.

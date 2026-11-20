# Under Glasgow: independent review of the people (review 58)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `f931e2a3`. The changes since review 57 (`git diff 4243b766 HEAD -- glasgow-subway`) are:
- `js/sim/bags.js` `stepBag`: a new `rig.park`. After a turn on the spot (`o.settle` with the walk weight at 0 and the tow above 0.5) the case's towed spot is stored, and the case is stood up there. `park` is cleared when the walk weight goes above 0.5 outside a settle.
- `js/sim/people.js` `mixOver`: `n + 1 >= 4` (was `n >= 4`).
- Models rebuilt with `REST_MOUTH_UP = 0.3` (MakeHuman `mouth-angles-up`) on every face. `armfit.js` arm-out numbers moved a little for 15 people. Triangle counts changed by 1 on 4 people.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review58/`. Running notes are in `NOTES.md`.

New tools this round:
- `tlog.mjs`: the real game, run frame by frame at 1/30 s. Every frame it logs every wheeled-case owner in every crowd: where the case's base is (in world and parent frame), the pelvis, the grip hand, state, tow and park. `give=N` in the query gives a case to every Nth grown-up on the first platform, so that boarding, riding and alighting with cases can be watched.
- `tlan.py` and `gj.py` read the log. They report:
  - one-frame jumps of the case and of the grip hand;
  - floor slides with no hand on the case;
  - the hand-over between the platform crowd and the car.
- `pturn.mjs`: a platform stander turned through `yawT`, as `release`, `_faceTrack` and the player-attending code do. It can then walk them off.
- `cansit.mjs`: runs `_canSit` for all 99 people on all 72 seats of a car, and says why each one is refused.
- `face4.mjs` with `OLD=$R/old`: the faces with review 57's `people.glb` (from `4243b766`). Cropped old | new | smile strips are in `f/M1.png` and `f/M2.png`.

**Result: weighted mean 8.29 (8.285). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Better:**
  - Resting mouths are less glum, and there is no grin.
  - Small cars are now checked.
  - The case no longer shuffles back to the leg at the end of a turn.
- **Worse (new, caused by claim 1):** a parked case is put back beside the leg in **one frame**. With the owner part-way through picking the case up, it jumps 0.13-0.30 m. In 2 cases the owner was standing still and the case jumped 0.24 m and 0.35 m with nobody touching it. This happened 9 times among 14 case owners in one 260 s run.
- **Found this round, older than this change:**
  - Platform standers turn 100 degrees in 0.8 s with both feet planted (feet 80 degrees off the body), and an upright case swings 0.55 m round them at 1 m/s.
  - At the door, a boarder's towed case jumps 1.0 m into its standing place.
  - **25 of 99 people never sit**, not the 11 given. 11 tall men are added by the feet-reach rule.
  - The car garment rule can still be beaten by a boarder counted as coming who never comes (Partick car 0: 6 of 11 in shorts or leggings for 72 s).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.0 | **8.08** |
| 2 | Arms and hands | 10 | 8.9 | 7.8 | **8.46** |
| 3 | Faces | 10 | 8.9 | 7.6 | **8.38** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.6 | **8.44** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.0 | 7.3 | **8.32** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.29** (8.285) |

0.20x8.08 + 0.10x8.46 + 0.10x8.38 + 0.10x8.44 + 0.10x8.40 + 0.15x8.24 + 0.10x8.32 + 0.15x8.22 = 1.616 + 0.846 + 0.838 + 0.844 + 0.840 + 1.236 + 0.832 + 1.233 = 8.285.

Against review 57 (8.337):
- **Faces +0.12** (typical 8.7 to 8.9): the resting mouths really are less dour (claim 3). The worst tenth is unchanged: the same smirks, smudges, caps and stare.
- **Luggage -0.46** (worst tenth 8.3 to 7.3):
  - The end-of-turn shuffle is gone.
  - In its place there are one-frame teleports of 0.13-0.35 m, 2 of them with the owner standing still. I also measured a 1.0 m jump at the door, an upright case swung round a platform turn at 1 m/s, and 0.23-0.40 m one-frame flickers of a towed case.
  - The case itself and how it is towed still look good. The worst tenth now holds a fault that falls in the rubric's "sliding" band, for one frame at a time.
- **Standing, sitting, behaviour -0.14** (worst tenth 7.8 to 7.6):
  - The platform pivot over planted feet (80 degrees of twist).
  - A quarter of the roster can never sit.
- **Arms -0.04** (worst tenth 7.9 to 7.8): a pole held with the arm straight out at shoulder height, twice within 1.5 m of the player (`eye/E2.png`).
- Walking, range, clothing and whole bodies are unchanged. The gait code is unchanged, and the default six walkers measure the same as in review 57.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | After a turn on the spot, a wheeled case stays where it was towed and is stood up there; it moves about 5 cm | **TRUE for the turn itself. But the change brings a new fault: when `park` is cleared, the case jumps in one frame.**<br>- **The turn** (`ctl6.mjs` `GIVE=1 BAG=trolley NOMOVE=1`, 150 degrees, Buchanan Street outer, `tr/`):<br>&nbsp;&nbsp;- `woman_mini`: after the turn (4.25-5.75 s) the base goes out 8 cm and comes back, ending at (0.01, -0.30) against (0.03, -0.28). The hand stays at the grip (`dHl` 0.93-0.97).<br>&nbsp;&nbsp;- `adult_beret`: out 11 cm and back.<br>&nbsp;&nbsp;- Review 57 measured 0.47 m with the hand off. So the turn is fixed.<br>- **A second turn with a move** (`ctl7.mjs` `SAME=1`, `tr2/`): the case ends in the same place relative to the body as after the first turn (-0.33, 0.4-0.5 m), so there is no slide back to the old park spot. Benign.<br>- **Walking off: broken.** `park` is cleared on the first frame the walk weight goes above 0.5. The case is then drawn between its place beside the leg and the grip, at a tow of about 0.2, and not between the park spot and the grip. It jumps.<br>&nbsp;&nbsp;- `tl_pk.json` (Partick outer, cases given to half the platform, then a ride): **7 walk-offs** with a one-frame jump of 0.13-0.30 m. Examples: `ya_winter` and `ya_smile_dress` 0.23 m at t = 33.10; `teen_runner` 0.30 m at t = 36.57; `adult_runner` 0.20; `teen_hood` 0.24; `adult_cyclist` 0.13; `sum_tee_leggings` 0.23.<br>&nbsp;&nbsp;- **2 with the owner standing still** (tow 0, root unmoved): `sum_tee_leggings` 0.35 m at t = 141.90 and `ya_tee_jeans` 0.24 m at t = 139.57. The case leaps from its parked spot to the leg with no hand on it.<br>- **Park is set far more often than after turns.** Park is set on any stop where the tow is still above 0.5 when the walk weight reaches 0. So queuers and people who walk and stop on the platform park too. Park time reached 105 s (`teen_hood`), and each of them has a jump waiting. | `tr/`, `tr2/`, `tl_pk.json`, `python3 tlan.py tl_pk.json 0.05`, `python3 gj.py tl_pk.json` |
| 2 | The car garment check counts from the one who would make 4 | **TRUE.**<br>- `mixOver` returns `n + 1 >= 4 && same + 1 > 0.5 x (n + 1)`.<br>- Two 480 s runs: Partick outer, boarding at 40 s (`cen/pk.json`), and Hillhead inner, boarding at 50 s (`cen/hh.json`). No car under 6 people was ever over half one group (largest 2 of 4, 3 of 6).<br>- Garment mix turned 17 and 10 boarders away.<br>- **But** the other hole is still open: someone counted as coming who then never comes. At Partick, at t = 32.9, `sum_tee_leggings` (bare) passed the check for car 0 (10 aboard: 5 bare, 4 trousers, 1 kilt). Five others routed in the same instant never boarded: `ya_smile_dress`, `ya_winter`, `woman_dress`, `woman_midi`, `boy_cap` (the doors closed as the player boarded). One of them was presumably counted in car 0's `pend`. Result: 6 of 11 bare for 72 s (t = 40-112).<br>- At Hillhead, car 0 held 8 of 15 in trousers for 2 s (a leaver's moment). | `cen/pk.json`, `cen/hh.json`, `python3 cen5.py cen/*.json` |
| 3 | Every face's resting mouth is a little up at the corners: subtle, less glum, not a grin | **TRUE.**<br>- 40 faces, old (review 57's glb) against new, cropped side by side (`f/M1.png`, `f/M2.png`).<br>- Clearly less glum: `woman_elder`, `teen_runner` (was a lopsided frown), `sum_crop_denim`, `teen_shorts_lad`, `adult_vneck`, `staff_woman`, `man_commuter`, `woman_student`.<br>- On the dark-skinned faces the change is hard to see.<br>- Nobody grins. At smile 0.6 the smile still reads as gentle and natural on most.<br>- **Not helped:**<br>&nbsp;&nbsp;- `adult_smile_blouse`'s resting smirk is if anything a little stronger.<br>&nbsp;&nbsp;- `ya_smile_halter`'s lopsided mouth with a notch in the lower lip, old and new; the smile shows it more.<br>&nbsp;&nbsp;- `ya_tattoo_tank`'s smile pulls to one side. | `f/N1.png`, `f/N2.png`, `f/M1.png`, `f/M2.png`, `f/Z.png` |
| 4 | Not changed: heel crouch, faces, turn speed, eleven non-sitters, kilts, sit-down slide, pole arms, nape, bob, black caps, haggis legs, children alone, overlaps | **Confirmed unchanged where measured, with two corrections.**<br>- Default walk 9.51, LEG p10 7.4, SMO p10 7.4 (`m.log`, identical to review 57).<br>- `teen_girl`'s parting, `man_elder`'s ash, the black banded caps (`adult_harem`, `ya_smile_dress`, `teen_skater`, `adult_casual2`), `girl_small`'s and `teen_boy`'s smudges and `teen_hippy`'s stare are all still there (`f/N1.png`, `f/N2.png`).<br>- **Correction:** it is not eleven non-sitters but **25** (see top ten, item 4).<br>- **Correction:** the pole arm straight out *was* seen this round, twice, close up (`eye/E2.png`, views 3 and 7). | `m.log`, `f/`, `cansit.mjs`, `eye/` |

## 2. Status of REVIEW_57's top ten

| # | REVIEW_57 item | Now |
|---|---|---|
| 1 | Heel crouch; roster LEG p10 6.1 | **Unchanged** (gait code unchanged; default six identical). |
| 2 | Case shuffles at the end of a stepped turn | **Fixed for the turn.** It is replaced by a one-frame jump when the parked case is next picked up, and sometimes when nobody touches it (new item 1). |
| 3 | Faces | **Partly better.** The dour resting mouths are fixed. The rest is unchanged: `man_elder`, `adult_harem`, `teen_girl`, `adult_smile_blouse`, the smudges, `sum_shorts_asian_m`, `teen_hippy`. |
| 4 | Slow stepped turns (riders) | Unchanged in the code. Platform turns are the opposite fault: too fast, over planted feet (new item 3). |
| 5 | Small cars not checked | **Fixed.** The no-show hole remains (item 6). |
| 6 | Eleven skirt and kilt wearers never sit | **Worse than stated: 25 never sit** (item 4). |
| 7 | Kilts open mid-stride | Carried; the code and models are unchanged. |
| 8 | Sit-down foot slide | Carried; not re-measured. |
| 9 | Pole arms, nape, bob, banded caps | Pole arm seen twice close up (`eye/E2.png`). Banded caps on 4 more faces. |
| 10 | Minor: haggis legs, children alone, overlaps | Carried. 3 one-frame walker overlaps at Hillhead. Haggis: see item 10. |

## 3. Per-category reasoning

### 3.1 Walking: 8.08 (unchanged)
- Default six: 9.51, LEG p10 7.4, SMO p10 7.4 (`m.log`).
- The gait code is unchanged, so the whole roster (9.45, LEG p10 6.1) and the heel crouch stand as in reviews 56 and 57.
- Not re-run in full, to stay within the disk budget.

### 3.2 Arms and hands: 8.46
- Phones in both hands, seated, look right (`eye/E1.png`, `seat/WD.png`).
- Pole arms straight out at shoulder height, within 1.5 m of the player: a suited man (view 3) and a woman in a red tartan dress (view 7) (`eye/E2.png`).
- At the stop, `adult_heel_boots`'s grip hand snaps 0.31 m in one frame (walk to stand, t = 152.57 in `tl_pk.json`). `sum_tee_leggings`'s hand snaps 0.24 m at the start of a queue walk.

### 3.3 Faces: 8.38
- 40 faces, neutral (new and old) and at smile 0.6.
- Resting mouths read less dour: claim 3.
- The faults listed under §2 item 3 are all still there.
- New this round: `elder_man_suit`'s skin reads orange.

### 3.4 Standing, sitting, behaviour: 8.44
- Seated as the game seats them (Ibrox outer ride; `seat/`): `woman_dress`, `sum_crop_bike`, `girl_ginger`, `woman_puffer` and `sum_loose_shorts_w` sit in the seat with their bags at their feet.
- St Enoch inner ride, 24 eye-height views (`eye/`): natural.
- **Platform turns over planted feet** (`pt/`, `pturn.mjs`):
  - `ya_knit` and `elder_shorts` turn 85 degrees in 0.8 s with both feet still where they were (feet 80 degrees off the body), then re-plant them at 0.9-1.8 s.
  - The game does this whenever a platform stander's `yawT` jumps (`release`, `_faceTrack`, turning to the player). The natural run `tl_bu.json` caught `ya_bootcut` doing it, 100 degrees at t = 14.
- **25 of 99 never sit** (`cansit.mjs`).

### 3.5 Range of people: 8.40 (unchanged)
- Roster unchanged.
- The never-sitters are mostly tall men, so seated rows lean shorter and female. I count this under behaviour, not here.

### 3.6 Clothing: 8.24 (unchanged)
- The small-car gap is closed.
- The no-show hole gave 6 of 11 in shorts or leggings for 72 s. In summer that looks ordinary, which is why the score is not lowered for it.
- Cars at eye height held kilts, tartan minis, tube tops, suits, shorts and leggings.

### 3.7 Luggage: 8.32 (typical 9.0, worst tenth 7.3)
- New one-frame teleports of a parked case (claim 1).
- 1.0 m jump at the door when a boarder is handed to the car (`teen_hood`, t = 39.17).
- Platform-turn swing: 0.55 m at 1 m/s, upright, the hand at handle height.
- Towed-case one-frame flickers of 0.23-0.40 m: `sum_tee_leggings` t = 4.13 (0.40 m out and back), `ya_tee_jeans` t = 88.6 and 93.8, `adult_baggy_knit` t = 90.6.
- Bags on backs, at feet and in hands are fine (`far/F.png`, `seat/`).
- Alighting hand-over: no jump (`teen_hood`, t = 113.47).

### 3.8 Whole bodies: 8.22 (unchanged)
- Near and far models match at 4 m for 6 people not used in review 57: `adult_tie_suit`, `woman_sash`, `teen_tube`, `man_puffer`, `elder_woman_dress`, `girl_school_kilt` (`far/F.png`).
- Both census runs: no far model within 6 m, no duplicates, 84 stair walks with none stalled.
- Carried faults: banded caps, the parting scalp, `man_elder`'s hair, the kilt opening.

## 4. Top ten defects, in priority order

1. **A parked case teleports 0.13-0.35 m in one frame**: 9 times among 14 owners in 260 s, 2 of them with the owner standing still.
   - Cause: `park` is cleared when the walk weight goes above 0.5, and the case is then drawn from the leg spot, not the park spot. It is also set at almost every stop, not only after turns.
   - Fix: blend the case from `park` towards the grip (keep `park` as the `sx, sz` until the tow reaches 1), and never clear it while standing.
   - Reproduce: `node tlog.mjs "mode=explore&q=high&line=outer&station=partick&give=2" tl_pk 260 0.0333333 40`, then `python3 gj.py tl_pk.json`.
2. **Heel wearers walk crouched**: roster LEG p10 6.1 (carried).
   - Reproduce: `people_motion.mjs --people ya_tube_heels,adult_heel_boots,teen_girl`.
3. **Platform standers pivot up to 100 degrees in 0.8 s over planted feet** (80 degrees of leg twist), and an upright case swings 0.55 m round them at 1 m/s.
   - Riders were given stepped turns in review 48; platform people still use `STEER.PIVOT`.
   - Reproduce: `GIVE=1 FR=240 node pturn.mjs "mode=explore&q=high&line=inner&station=buchanan-street" pt/p 1.75 2`, then `python3 ptan.py pt/*.json`.
4. **25 of 99 people never sit**, not 11:
   - the 11 named;
   - 11 long-legged people whose soles would be more than 7 cm below the floor (`adult_camo_cap`, `adult_cap_baggy`, `adult_cyclist`, `adult_heel_boots`, `adult_lusekofta`, `adult_oxford_shirt`, `adult_tie_suit`, `adult_tophat`, `elder_man_cap`, `man_longcoat`, `sum_chino_shorts_m`);
   - 2 long coats (`ya_winter`, `elder_woman_coat`);
   - `adult_piper` (the ceiling).
   - Tall men always stand.
   - Reproduce: `node cansit.mjs`.
5. **Faces:**
   - `adult_smile_blouse`'s smirk.
   - `ya_smile_halter`'s notched, lopsided mouth.
   - `ya_tattoo_tank`'s one-sided smile.
   - `man_elder`'s ash; `elder_man_suit`'s orange skin.
   - `teen_girl`'s parting; banded black caps on 5 people.
   - Smudges on `girl_small` and `teen_boy`.
   - `teen_hippy`'s stare.
   - Reproduce: `OLD=$R/old node face4.mjs <ids> f/o 0:0 0` against `node face4.mjs <ids> f/n 0:0 0`.
6. **The car garment rule can be beaten by a pending boarder who never boards** (6 of 11 bare for 72 s).
   - Fix: re-check the car when a routed boarder is released, or count `pend` only once they are within a few metres of the door.
   - Reproduce: `node gp9.mjs "mode=explore&q=high&line=outer&station=partick" cen/pk 480 40`, then `python3 cen5.py cen/pk.json`.
7. **Door hand-over jump**: a boarder's towed case jumps 1.0 m into its standing place as they are taken into the car (the saloon rig starts at tow 0). In the same log as item 1.
8. **Pole arms straight out at shoulder height**, close to the player (`eye/E2.png`). Reproduce: `node geye.mjs "mode=ride&q=high&line=inner&station=st-enoch" eye/e`.
9. **One-frame snaps**: a towed case flickers 0.23-0.40 m; the grip hand snaps 0.24-0.31 m at stops and starts (`gj.py`).
10. **Minor:**
    - Kilts open mid-stride.
    - The sit-down slide.
    - Haggis: at Kelvinbridge (`hc/k.json`, `python3 crab.py hc/k.json`) it backed up for 3 frames and then spun 155 degrees in about 0.15 s beside `boy_small`, and once moved 58 degrees sideways at 1.9 m/s.
    - Children alone.
    - One-frame walker overlaps.

## 5. What I could not observe

- **No motion was watched.** Everything comes from stills and logs at 30-60 Hz.
- The case jumps are measured, not seen. One frame at 30 fps is visible as a pop, not a slide.
- **Natural case owners riding are rare.** The ride logs used cases given by the script (`give=2`). The one natural run (`tl_bu.json`) had none aboard.
- **The whole-roster walk was not re-run** (disk budget; gait unchanged).
- **The haggis in a car aisle:** still not seen.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Case-owner turn and move | `woman_mini`, `adult_beret`, Buchanan Street outer | `tr/`, `tr2/` |
| All case owners frame by frame through boarding, riding, alighting | Partick outer (14 owners); Buchanan Street outer ride (5) | `tl_pk.json`, `tl_bu.json` |
| Platform turn and walk-off with a case | `ya_knit`, `elder_shorts`, Buchanan Street inner | `pt/` |
| Faces, old vs new vs smile 0.6 | 40 people | `f/` |
| Garment census per car with provenance; far models, duplicates, stairs, overlaps | Partick outer, Hillhead inner, 480 s each | `cen/` |
| Player eye height through all cars | St Enoch inner ride, 24 views | `eye/E1.png`, `eye/E2.png` |
| Seated as the game seats them | 12 asked, 5 seatable, Ibrox outer | `seat/` |
| Who can sit | all 99 on 72 seats | `cansit.mjs` |
| Near and far at 4 m | 6 people | `far/F.png` |
| Haggis past standers | Kelvinbridge outer, 3 trials | `hc/k.json` |
| Walking instrument | default six | `m.log` |

Next round, look at:
- Case owners who stand in a car and then alight.
- Platform turns after a fix.
- The haggis in an aisle.
- Whether tall men can be seated with their knees up.

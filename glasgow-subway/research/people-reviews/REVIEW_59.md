# Under Glasgow: independent review of the people (review 59)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `9f15b0cd`. The changes since review 58 (`git diff f931e2a3 HEAD -- glasgow-subway/js`) are two lines:
- `js/sim/bags.js` `stepBag`: `rig.park` is now cleared only when `rig.tow > 0.99` (fully in tow), not as soon as the walk weight passes 0.5.
- `js/sim/people.js` `_bagOn`: when a person's model is swapped (near/far), the new bag rig takes the old rig's `tow`, `park`, mesh position, rotation and handle height.

No model, gait, face or seating code changed. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before reading bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review59/`. Running notes are in `NOTES.md`.

New tools this round:
- `jb.py`: reads a `tlog` log and measures each one-frame move of the case and of the grip **relative to the pelvis, corrected for the body's turn**. It also lists every `park` change and how far the case moved on that frame. (`tlan.py` measured in the parent frame, so a normal walking frame of 4 cm counted as a "jump".)
- `tlog2.mjs`: `tlog.mjs` plus gait weights, LOD, current clip, grip in the body frame, `paused`, and gait state.
- `st.py`: measures the case's move on the frames where the owner gets on or off a staircase.
- `tsnap.mjs` / `tsnap2.mjs`: when a case owner's grip moves more than 12 cm in the body frame in one frame, it logs how much each bone from the pelvis to the hand turned, and how far the pelvis moved.
- `pdip2.mjs` / `pdip3.mjs`: logs anyone whose pelvis drops more than 0.35 m below their standing height in the body frame, gives per-person statistics, and renders 4 views of the first ten.

**Result: weighted mean 8.11 (8.107). Gate NOT met.** The mean is not above 9, and Walking is below 8.

- **Better:**
  - The parked-case teleport is gone. There were 9 parked-case clears in two runs, and on each one the case moved at most 2 cm.
  - A bag survives a near/far swap: 12 swaps, at most 1.5 cm.
- **Found this round, older than these changes (the gait is unchanged since review 58):**
  - **Passengers boarding the train drop into a kneel, a deep lunge or the splits in the doorway.** The pelvis falls 0.35-0.47 m on adults and to a quarter of their standing height on the piper and on children, for 0.2-1 s. About a quarter of boarders do it (9 of 36 at Hillhead, 3 of 19 at Ibrox). No walker who is not boarding did it.
  - This is what most of the builder's "grip-hand snaps" are: the arm barely turns (1-3 degrees). The whole body drops.
  - **Every case owner who comes down a staircase** (4 of 4) has their case jump 0.24-0.67 m in one frame at the foot of the stairs, from carried to towed.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.7 | 5.0 | **7.22** |
| 2 | Arms and hands | 10 | 8.9 | 7.8 | **8.46** |
| 3 | Faces | 10 | 8.8 | 7.5 | **8.28** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.6 | **8.44** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.0 | 7.4 | **8.36** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.11** (8.107) |

0.20x7.22 + 0.10x8.46 + 0.10x8.28 + 0.10x8.44 + 0.10x8.40 + 0.15x8.24 + 0.10x8.36 + 0.15x8.22 = 1.444 + 0.846 + 0.828 + 0.844 + 0.840 + 1.236 + 0.836 + 1.233 = 8.107.

Against review 58 (8.285):
- **Walking -0.86** (worst tenth 7.0 to 5.0): the boarding kneel. A person sinking to one knee or doing the splits mid-stride is in the rubric's "broken" band. It happens at the doors, which is where a player getting on stands.
- **Luggage +0.04** (worst tenth 7.3 to 7.4):
  - The park teleports are gone, and so are the swap flickers.
  - The stair-foot jumps are now measured, and are bigger (up to 0.67 m) and certain for every case owner coming down.
  - The door hand-over jump of about 1 m is unchanged.
- **Faces -0.10** (worst tenth 7.6 to 7.5): this round I looked at the 59 faces that review 58 did not, and found more of the same kinds of fault (see section 3.3). Nothing changed in the models.
- The other categories are unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A parked case is let go only once fully in tow, so the standing case no longer jumps 0.13-0.35 m as its owner sets off | **TRUE.**<br>- Partick outer, `give=2`, 260 s: 21 park changes, 7 of them clears (1 to 0). On the clearing frame the case moved 0.001-0.019 m relative to the pelvis.<br>- Hillhead inner: 2 clears, 0.005 and 0.015 m.<br>- No jump with the owner standing still.<br>- `gj.py` lists no event at a park change. | `tl_pk.json`, `tl_hh.json`; `python3 jb.py tl_pk.json 0.1`, `grep "park 1->0" jb_pk.txt` |
| 2 | A bag carried across a near/far swap keeps its pose, tow and parked spot; the towed case still jumps 0.16-0.39 m after one-frame grip snaps; the hand snap is not fixed | **Swap part TRUE.** 12 swaps; the case moved at most 0.015 m relative to the pelvis.<br><br>**Towed-case jumps: the builder's explanation is incomplete.** With yaw-corrected, pelvis-relative measurement, the jumps over 0.1 m in two runs come from three different causes:<br>**(a) Stair foot.** The biggest jumps are at the foot of the stairs, with the hand still (moved less than 3 cm). On the stairs the case is carried by its top handle, and the `lift` branch returns early. Coming off the stairs, `tow` is already 1, so in one frame the case goes from beside the hand to tipped 0.5-0.6 m behind the heel, and drops 0.16-0.27 m. Measured 4 of 4 times: `elder_shorts` 0.24 m, `woman_mini` 0.49 m, `adult_cap_baggy` 0.37 m, `sum_loose_shorts_w` 0.67 m.<br>**(b) The boarding dip.** In `go` walks, the "grip snaps" of 0.12-0.30 m per frame are the pelvis moving (0.85 to 0.20 to 0.80 m in about 6 frames, `adult_runner`, St Enoch t = 37.2 and 121.7). The upper arm and forearm turn only 1-3 degrees. It is the whole body dropping (see top ten, item 1), and the case follows a frame later.<br>**(c) A real hand snap at a stop.**<br>&nbsp;&nbsp;- `sum_loose_shorts_w` (Hillhead t = 201.13): `paused` flips to 1 and the clip changes from `walk` to `idle_a` in the same frame, with `wU` = 1. The grip moves 0.24 m in the body frame, mostly backwards (z +0.13 to -0.10). Next frame the case follows by 0.19 m.<br>&nbsp;&nbsp;- `adult_runner` (Partick t = 149.40, walk to stand): 0.32 m.<br>&nbsp;&nbsp;- `woman_mini` (t = 186.93, `go`, root still): 0.27 m.<br>&nbsp;&nbsp;- `teen_tube` standing (`wU` 0, a clip crossfade ending): spine_03 turned 18 degrees in one frame.<br>&nbsp;&nbsp;- **My reading:** at a stop or pause the arm is handed between the gait's trailing case arm and the idle clip's arm in one frame. The hand itself follows the clip (`gait_three.js`: "hands stay with the clip"), and the clip is switched with no fade when `paused` flips. The case is then placed from the previous frame's hand (`stepBag` reads `matrixWorld` as last drawn), so it jumps one frame later.<br>&nbsp;&nbsp;- I could not isolate which bone carries the snap in (c): `tsnap` caught none at a stop, only the `go` dips. | `tl_hh.json`, `python3 st.py tl_pk.json tl_hh.json`; `sn_se2.json` (`dPel`, `ang`); `jb_hh.txt` |
| 3 | Not changed (heel crouch, faces, platform turns, 25 non-sitters, car garment rule hole, door hand-over, pole arms, kilts, sit-down slide, haggis spin, children alone, walker overlaps) | **Confirmed where re-measured.**<br>- Default six: 9.51, LEG p10 7.4, SMO p10 7.4 (`m/`, identical).<br>- `cansit.mjs`: 25 of 99 never sit (`cansit.log`).<br>- Door hand-over: `teen_hood` 0.99 m at Partick t = 39.20.<br>- Faces: see section 3.3.<br>- Not re-measured: platform turns, kilts, sit-down slide, haggis (the code is unchanged). | `m/`, `cansit.log`, `tl_pk.json` |

## 2. Status of REVIEW_58's top ten

| # | REVIEW_58 item | Now |
|---|---|---|
| 1 | Parked case teleports 0.13-0.35 m | **Fixed** (claim 1). |
| 2 | Heel crouch, LEG p10 6.1 | Unchanged (gait unchanged; default six identical). |
| 3 | Platform pivots over planted feet; case swung round | Unchanged in the code; not re-measured. |
| 4 | 25 of 99 never sit | **Unchanged**: 25 (`cansit.log`). |
| 5 | Faces | Unchanged models. The new sample found more of the same kinds of fault (section 3.3). |
| 6 | Car garment rule beaten by a no-show boarder | Not reproduced at Govan (420 s ride: max 3 of 6, none over half, 12 turned away for the mix). The code is unchanged, so the hole remains. |
| 7 | Door hand-over jump of 1.0 m | **Unchanged**: 0.99 m (`teen_hood`, Partick t = 39.20). |
| 8 | Pole arms out | Not seen in 24 Cowcaddens ride views (`eye/`). Carried. |
| 9 | One-frame snaps of the case and grip | Swap flickers fixed. The rest split into the stair-foot jump (new item 3), the boarding dip (new item 1) and the stop hand snap (new item 4). |
| 10 | Minor: kilts, sit-down slide, haggis spin, children alone, overlaps | Carried. Govan 420 s: 0 overlaps, 0 duplicates, no far model within 6 m, 33 stair walks with none stalled. |

## 3. Per-category reasoning

### 3.1 Walking: 7.22 (typical 8.7, worst tenth 5.0)
- **The instrument:** default six 9.51, LEG p10 7.4, SMO p10 7.4. The roster's heel crouch (LEG p10 6.1) stands.
- **The boarding kneel.**
  - `pdip3`, Hillhead inner, natural crowd: **9 of 36 `go` walkers** dropped more than 0.25 m; 0 of 43 others did.
    - `adult_piper` fell to 0.22 of his standing pelvis height (13 frames).
    - `man_hoodie` spent 29 frames more than 0.25 m down.
  - Ibrox outer ride: 3 of 19 `go` walkers.
  - St Enoch (`give=2`): 11 events of more than 0.35 m in 150 s.
  - The renders show what this looks like:
    - `boy_small` kneeling on one knee in the doorway (`dip2/A.png`, row 1);
    - `woman_coat` kneeling (row 2);
    - `adult_runner` in a deep lunge with his case, and `teen_girl` squatting (row 3);
    - the piper on one knee, `teen_tee` kneeling, and `teen_skirt` doing the splits across the door sill (`dip3/A.png`).
  - **The state at the moment:**
    - `gait.walking` true, both feet in stance, `v` about 1 m/s;
    - one foot planted 0.55-0.73 m ahead of the pelvis and the other at -0.1 m;
    - `lowerForReach` then lowers the pelvis until both legs reach.
  - Not seen in any non-boarding walk. Reviews 52-58 never logged it.
- Typical stays 8.7: ordinary walkers are unchanged.

### 3.2 Arms and hands: 8.46 (unchanged)
- The real hand snaps at stops (claim 2c) are carried from review 58, and so are the pole arms.
- The large `go` "hand snaps" belong to the boarding dip, which is scored under Walking.

### 3.3 Faces: 8.28 (typical 8.8, worst tenth 7.5)
59 faces not in review 58's set, neutral and at smile 0.6 (`f/P0.png`-`f/P3.png`; the camera at 0.85 m with a 22-degree field of view, so magnified).
- **Smiles:** gentle and natural on most. Nobody grins.
- **Faults:**
  - One-sided mouths, already a smirk at rest: `girl_ginger` (the smile reads a little sly), `teen_ginger`, `ya_ginger_braid`, `teen_tee`, `adult_tattoo_muscle`, `adult_cyclist`.
  - Orange scalp dots at the crown or parting: `teen_hood`, `sum_crop_bike`, `teen_cutoffs`, `sum_denim_shorts_m`. `ya_winter` has a patchy blond hairline.
  - Banded black hair caps on 2 more people: `boy_small`, `sum_tube_denim`.
  - Dark smudges at the eye: `teen_hood`, `teen_ginger`, `adult_tattoo_muscle`, `sum_denim_shorts_m`.
  - `woman_midi` scowls.
  - `man_student` and `woman_puffer` read younger than their kind.
  - Black specks through `adult_sport_cap`'s white cap; an orange patch on `adult_cap_shorts`'s cap.
  - `adult_casual5` has a notched hairline.
- Review 58's list (`adult_smile_blouse`, `ya_smile_halter`, `man_elder`, `elder_man_suit`, `teen_girl`, `teen_hippy`, `girl_small`, `teen_boy`) stands: the models are unchanged.

### 3.4 Standing, sitting, behaviour: 8.44 (unchanged)
- 25 never sit.
- Platform pivots carried.
- Cowcaddens ride (`eye/E1.png`, `eye/E2.png`): seated people, a phone user, aisle walkers and standers all look natural.

### 3.5 Range of people: 8.40 (unchanged)
The roster is unchanged.

### 3.6 Clothing: 8.24 (unchanged)
Govan census: no car over half one group.

### 3.7 Luggage: 8.36 (typical 9.0, worst tenth 7.4)
- Fixed: park teleports and swap flickers.
- Still there:
  - the stair-foot jump, 0.24-0.67 m with a drop of up to 0.27 m, at every staircase arrival;
  - the door hand-over, 0.99 m;
  - the case following the stop hand snap a frame late (0.19-0.29 m);
  - the platform-turn swing (carried).

### 3.8 Whole bodies: 8.22 (unchanged)
- No far model within 6 m, no duplicates, no missing parts seen in car views.
- Carried: banded caps, scalp at partings, kilt opening.

## 4. Top ten defects, in priority order

1. **Boarders drop to a kneel, a lunge or the splits at the car door.**
   - The pelvis falls 0.35-0.65 m for 0.2-1 s, in about a quarter of `go` walkers.
   - Seen on `adult_piper`, `teen_tee`, `teen_skirt`, `boy_small`, `woman_coat`, `adult_runner`, `girl_ginger`, `boy_cap`, `elder_woman_dress` and others.
   - **Cause (from the state logged):** a foot is planted 0.55-0.73 m ahead of a pelvis that then does not carry on over it. At the door the root slows or is pushed and turned, while the stride placed for walking speed stands. `gait.js` `lowerForReach` drops the pelvis until both legs reach, instead of shortening or re-stepping.
   - **Fix:** cap the drop (for example 8 cm below the walking bob); when the cap binds, re-plant the trailing foot or move the root.
   - **Reproduce:** `node pdip3.mjs "mode=explore&q=high&line=inner&station=hillhead" dip3/hh 200 50 0.35` (stats in `dip3/hh.json` `.S`, stills `dip3/hh_*`); also `pdip2.mjs ... st-enoch&give=2 dip2/se 150 45 0.35`.
2. **Heel wearers walk crouched** (roster LEG p10 6.1, carried). `people_motion.mjs --people ya_tube_heels,adult_heel_boots,teen_girl`.
3. **A case jumps 0.24-0.67 m in one frame at the foot of every staircase.**
   - It goes from carried (`lift`) to fully towed in one frame (`tow` is already 1 on the stairs) and drops up to 0.27 m.
   - Fix: blend from the carried pose (keep a lift weight that decays over 0.3-0.5 s).
   - Reproduce: `node tlog2.mjs "mode=explore&q=high&line=inner&station=hillhead&give=2" tl_hh 240 0.0333333 50`, then `python3 st.py tl_hh.json`.
4. **The grip hand snaps 0.24-0.32 m at a stop or pause**, and the case follows a frame later by 0.19-0.29 m.
   - `paused` and the walk-to-idle clip switch happen in one frame with no fade, while the hand follows the clip.
   - Fix: fade the clip on pause, and place the case from this frame's pose.
   - Reproduce: as for item 3, then `python3 jb.py tl_hh.json 0.1` (`sum_loose_shorts_w` t = 201.13) or `tl_pk.json` (`adult_runner` t = 149.40).
5. **Platform standers pivot up to 100 degrees in 0.8 s over planted feet**, and an upright case swings round them (carried). `pturn.mjs` as in review 58.
6. **25 of 99 people never sit** (carried). `node cansit.mjs`.
7. **Door hand-over: a towed case jumps 1.0 m into its standing place** (`teen_hood`, Partick t = 39.20). `tlog.mjs ... partick&give=2 ... 40`, then `python3 tlan.py tl_pk.json 0.05 | grep HANDOVER`.
8. **Faces:**
   - one-sided smirks on the ginger family, `teen_tee` and `adult_tattoo_muscle`;
   - orange scalp dots on 4 people;
   - banded caps, now on 7;
   - eye smudges on 4;
   - plus review 58's list.
   - Reproduce: `node face4.mjs $(cat ids_f.txt) f/n 0:0 0` and `... f/s 0:0 0.6`.
9. **The car garment rule hole** (a no-show boarder still counted), and **pole arms straight out** (carried, not seen this round).
10. **Minor, carried:**
    - kilts open mid-stride;
    - the sit-down slide;
    - the haggis's fast spins;
    - children alone;
    - one-frame walker overlaps.

## 5. What I could not observe

- **No motion was watched.** The boarding kneel is seen in stills and measured at 30 Hz. Its look in motion (a bob down and up over 0.2-1 s) is inferred.
- **Why the root stalls at the door** (a separation push, a door clamp, a sharp turn) was not isolated. The hand snap at a stop was not caught by `tsnap`, so its bone-level cause is inferred.
- Not re-measured: platform turns, kilts, sit-down slide, haggis, seating of skirts (code unchanged). Garment census on platforms within 15 m was not repeated.
- The whole-roster walk was not re-run (gait unchanged).

## 6. What I sampled

| What | Where | Evidence |
|---|---|---|
| All case owners frame by frame, boarding and riding (13 + 11 owners) | Partick outer, Hillhead inner (`give=2`) | `tl_pk.json`, `tl_hh.json`, `jb_*.txt` |
| Grip-snap bone analysis | Partick outer, St Enoch inner (x2) | `sn_pk.json`, `sn_se.json`, `sn_se2.json` |
| Pelvis dips, with renders | St Enoch (with and without cases), Partick, Hillhead, Ibrox ride | `dip/`, `dip2/A.png`, `dip3/A.png` |
| 59 new faces, neutral and smiling | the viewer | `f/P0.png`-`f/P3.png` |
| Garment census per car, far models, duplicates, stairs, overlaps | Govan outer ride, 420 s | `cen/gv.json` |
| Player eye height through all cars | Cowcaddens outer ride, 24 views | `eye/E1.png`, `eye/E2.png` |
| Who can sit | 99 people on 72 seats | `cansit.log` |
| Walking instrument | default six | `m/` |

Next round, look at:
- The boarding dip after a fix: whether cases and children board cleanly.
- Alighters at the door.
- Stair arrivals with cases.
- The haggis in an aisle.

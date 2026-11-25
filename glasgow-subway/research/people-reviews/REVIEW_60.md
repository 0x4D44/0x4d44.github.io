# Under Glasgow: independent review of the people (review 60)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4faf4e2e`. Changes since review 59 (`git diff dc14c837~1 HEAD -- glasgow-subway/js`):
- `js/sim/gait.js`: `REACH_DROP = 0.12`. The pelvis is lowered by `lowerForReach` at most 12 cm below the stride's own (fitted) height.
- `js/sim/bags.js`: a lift weight `rig.lw` blends the case between carried (stairs) and the floor pose. It moves 0.15 per frame towards carried and 0.12 per frame back. The floor pose was moved into `floorPose()`.
- `js/sim/people.js` / `index.js`: `AnimCrowd.bagCarry` gives a boarder's case its old `tow` and `lw` on the car side of the hand-over and places it at once. `lw` is also carried across a near/far swap.

No model, face, seating or clothing code changed. I edited nothing in the repository. One technique: to compare with the previous gait, a Playwright route served `git show dc14c837~1:glasgow-subway/js/sim/gait.js` in place of `gait.js`, in my own browser only (`OLDGAIT=` in `pdip4.mjs` and `fgap.mjs`). Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review60/`. Running notes are in `NOTES.md`.

New tools this round:
- `fgap.mjs` / `fgap2.mjs`: every frame, the distance between each gait-driven person's drawn ankle and the ankle the gait has planted or planned for it (`feet[s].cur.A`). It finds feet the gait has lost hold of, and renders 4 views of the worst.
- `hov.mjs`: logs every person handed between crowds (platform to car, car to platform) and how far the pelvis, feet, hands, head and bag jump in that frame.
- `pdip4.mjs`: `pdip3` with the old-gait route.
- `st2.py`: the case's yaw-corrected, pelvis-relative frame moves over the 20 frames after each stair on or off.
- `ho.py`: frame-by-frame print-out around each hand-over.

**Result: weighted mean 8.19 (8.187). Gate NOT met.** The mean is not above 9, and Walking (7.62) is below 8.

- **Better:**
  - The boarding kneel is mostly gone. At St Enoch with cases, the same run with the old gait has 15 of 37 boarders dipping more than 0.25 m; the new gait has 3 of 38.
  - The stair-foot case jump is gone: 0.05-0.07 m, was 0.24-0.67 m.
  - The hand-over case jump is about halved.
- **Still there, or newly measured:**
  - A crouched lunge-walk in queues that the cap does not touch.
  - A 0.36 m lunge at a door.
  - A frozen straddle in a car doorway.
  - At every platform-to-car hand-over, the whole pose pops in one frame: feet 0.20-0.44 m, hands up to 0.53 m.
  - The grip-hand snap at a stop (0.35 m).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.7 | 6.0 | **7.62** |
| 2 | Arms and hands | 10 | 8.9 | 7.6 | **8.38** |
| 3 | Faces | 10 | 8.8 | 7.5 | **8.28** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.4 | **8.36** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.0 | 7.8 | **8.52** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.19** (8.187) |

0.20x7.62 + 0.10x8.38 + 0.10x8.28 + 0.10x8.36 + 0.10x8.40 + 0.15x8.24 + 0.10x8.52 + 0.15x8.22 = 1.524 + 0.838 + 0.828 + 0.836 + 0.840 + 1.236 + 0.852 + 1.233 = 8.187.

Against review 59 (8.107):
- **Walking +0.40** (worst tenth 5.0 to 6.0). The door kneel is now rare, but it is not gone, and the queue crouch and the hand-over pop are still in the worst tenth.
- **Luggage +0.16** (worst tenth 7.4 to 7.8). Stair foot fixed; hand-over jump halved but now followed by a slide.
- **Arms -0.08** (worst tenth 7.8 to 7.6). The hand pop at the hand-over is newly measured (up to 0.53 m), and the stop snap is confirmed.
- **Standing -0.08** (worst tenth 7.6 to 7.4). Frozen mid-stride stands of 7-8 s on the platform.
- The other categories are carried unchanged: the models are unchanged and were not re-sampled.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Boarders no longer kneel or lunge at the door: at most 12 cm drop; Hillhead 3 of 38 dip more than 0.25 m, none more than 0.35 m, no non-boarder dips | **MOSTLY TRUE, overstated.**<br>**Hillhead inner (natural, board at 50 s):** 1 of 33 `go` walkers more than 0.25 m (`teen_skirt`, 6 frames, to 0.68 of standing height); none more than 0.35 m. But one non-boarder also dipped more than 0.25 m (`adult_vneck`, 6 frames, to 0.67).<br>**St Enoch inner, `give=2`, old gait against new in the same run conditions:**<br>- more than 0.25 m: old 15 of 37, new 3 of 38;<br>- more than 0.35 m: old 5, new 1.<br>**Left over:**<br>- `adult_harem` lunges 0.36 m at the door (`dip/se_sheet.png`, rows 5-6). The 12 cm cap is measured from the fitted bob, and `trackReach` logs the unclamped reach, so the fit itself can sink.<br>- `woman_dress` lunges 0.26 m on the stairs (rows 7-8).<br>- `ya_smile_dress` walks a queue at 0.52 m/s for about 4 s in a deep lunge, her pelvis at 0.64 of its height (rows 1-4). **Identical with the old gait** (115 frames, minimum 0.644), so it is older than this change and untouched by it.<br>**What the cap left behind:** the claim that "the foot that cannot reach lifts and is stepped in" has no stepping code behind it. The IK clamps the leg (`gaitSolve`, `D > Dmax`), and when the body has stopped (`v` = 0) the gait phase does not advance, so the foot stays where it is. `fgap` shows feet held 0.2-0.43 m from their gait target for 2-9 s: 1-8 people per run, against 4 with the old gait (the spread between runs is too wide to call it worse). Seen as `woman_scarf` standing frozen in mid-stride for 8 s (`gap/ws.png`) and `adult_suit_bun` frozen in a wide straddle in the car doorway (`gap2/sheet.png`, row 1). | `dip/hh.json`, `dip/se.json`, `dipold/se.json`, `dip/se_sheet.png`, `gap/`, `gapold/`, `gap2/` |
| 2 | A towed case no longer jumps at the foot of the stairs | **TRUE.**<br>- Partick: `ya_knit` 0.071 m and `adult_tattoo_muscle` 0.047 m at most per frame over the 20 frames after leaving the stairs, `dy` at most 0.03 m (was 0.24-0.67 m).<br>- Buchanan Street, `give=1`: `adult_harem` 0.058 m.<br>- No stair-on frame over 0.08 m in any run. Only 3 stair arrivals with cases were caught across 4 runs. | `tl_pk.json`, `tl_bs.json`; `python3 st2.py tl_pk.json tl_bs.json` |
| 3 | Grip-hand snaps at stops: none over 0.10 m | **FALSE.** Partick, `man_puffer` t = 150.50, walk to stand (clip `walk` to `idle_a`, `wU` 1): the grip moves **0.35 m** in the body frame in one frame, and the case follows by 0.27 m the next frame. This is the review 59 item 4 mechanism, unchanged. The builder's Hillhead run had no case owner stopping. | `jb_pk.txt` (`python3 jb.py tl_pk.json 0.1`) |
| 4 | The hand-over keeps the case's tow instead of standing it up 1 m away | **PARTLY TRUE.**<br>Bag world jump in the hand-over frame: 0.33 m (`teen_hood`), 0.32 m (`adult_runner`), 0.52 m (`ya_smile_dress`), was 0.99 m. Relative to the pelvis it is 0.19-0.40 m, because the pelvis itself jumps 0.13-0.15 m in that frame.<br>**New:** for the two pole riders, the case then slides **0.5 m in 0.3 s** on the floor with the root still and the yaw unchanged (`grip-bag` 0.52 to 0.26 m).<br>After the pivot, with `tow` back to 0 (4.6 s later), the case is stood up and slides about 0.6 m over 3 s while the hand lets go (`grip-bag` 0.24 to 0.82 m).<br>Alighting the other way: 0.03-0.12 m. Alighting `woman_coat` (`hov`): 0.47 m. | `ho.py tl_pk.json`, `tlan.py tl_pk.json 0.05 \| grep HANDOVER`, `hov/pk.json` |
| 5 | Not changed: faces, heel crouch, 25 never-sitters, turn speed, pivots, kilts, sit-down slide, haggis | **Confirmed where re-measured.**<br>- Default six: 9.51, LEG p10 7.4, SMO p10 7.4 (`m/`, identical).<br>- The other items' code is unchanged; not re-measured. | `mrec.log` |

## 2. Status of REVIEW_59's top ten

| # | REVIEW_59 item | Now |
|---|---|---|
| 1 | Boarding kneel | **Much reduced** (St Enoch 15 to 3 boarders over 0.25 m). Residue: one 0.36 m door lunge, a stairs lunge, a frozen doorway straddle. |
| 2 | Heel crouch | Unchanged (instrument identical). |
| 3 | Stair-foot case jump | **Fixed.** |
| 4 | Grip snap at a stop | **Unchanged**: 0.35 m (`man_puffer`). |
| 5 | Platform pivots | Carried, not re-measured. |
| 6 | 25 never sit | Carried (code unchanged). |
| 7 | Hand-over case jump of 1.0 m | **Halved** (0.32-0.52 m), with a new 0.5 m slide after it for pole riders. |
| 8 | Faces | Carried (models unchanged). |
| 9 | Garment rule hole, pole arms | Carried. Not seen in 24 Kelvinhall ride views (`eye/K1.png`, `eye/K2.png`). |
| 10 | Minor | Carried. |

## 3. Per-category reasoning

### 3.1 Walking: 7.62 (typical 8.7, worst tenth 6.0)
- **Instrument:** default six 9.51, LEG and SMO p10 7.4; the roster heel crouch stands.
- **Door kneel:** now about 1 in 12 boarders with cases at St Enoch, and 1 in 33 at Hillhead, against about 1 in 3 before. What is left is still a broken-band pose when it happens:
  - `adult_harem`, a lunge to 0.57 of standing height;
  - `adult_suit_bun`, a wide straddle frozen in the doorway.
- **Queue crouch (older than this change, not seen by review 59):** `ya_smile_dress` shuffles about 2 m of queue in a deep lunge, 4 s at 0.52 m/s (`dip/se_sheet.png`, rows 1-4). The same in old and new gait.
- **Hand-over pop (newly measured):** `hov.mjs`, Partick, 11 of 11 hand-overs.
  - One foot jumps 0.20-0.44 m in one frame.
  - Boarders' pelvises jump 0.13 m (alighters' 0.02-0.04 m).
  - It happens at every door, both ways: a visible one-frame pop where a player getting on is watching.
- Worst tenth 6.0: better than review 59's frequent kneels, but every boarder pops, and the lunge residue and queue crouch remain.

### 3.2 Arms and hands: 8.38 (typical 8.9, worst tenth 7.6)
- The stop snap is confirmed (0.35 m).
- At the hand-over, hands jump up to 0.53 m in one frame (`teen_skirt` and `woman_midi`, pole to `go`; `hov/pk.json`, `hr`).
- Pole arms are not seen at Kelvinhall.

### 3.3 Faces: 8.28 (carried)
Models unchanged. I did not re-sample faces this round, so review 59's lists stand: one-sided smirks on the ginger family, `teen_tee` and `adult_tattoo_muscle`; orange scalp dots; banded caps; eye smudges.

### 3.4 Standing, sitting, behaviour: 8.36 (typical 9.0, worst tenth 7.4)
- Ride views at Kelvinhall (`eye/K1.png`, `eye/K2.png`) and the Ibrox platform (`eye/I.png`) are natural: seated phone users, standers, a hi-vis worker, a queue.
- New in the worst tenth: platform standers frozen in a half stride for 7-8 s (`woman_scarf` at Hillhead, `gap/ws.png`; `ya_tee_jeans` 7 s, `fgap`). A foot was left in `swing` when the body stopped, and the phase does not advance at `v` = 0.
- 25 never sit; platform pivots (both carried).

### 3.5 Range of people: 8.40 (carried; roster unchanged)

### 3.6 Clothing: 8.24 (carried; no clothing change)

### 3.7 Luggage: 8.52 (typical 9.0, worst tenth 7.8)
- **Fixed:** stair foot (at most 0.07 m).
- **Improved:** hand-over (0.32-0.52 m, was 0.99 m).
- **Still there:**
  - the slide after the hand-over (0.5 m in 0.3 s, pelvis still);
  - the case stood up on the car floor sliding about 0.6 m over 3 s with the hand off the handle;
  - the stop snap carried to the case (0.27 m);
  - the alighting case jump (`woman_coat`, 0.47 m).

### 3.8 Whole bodies: 8.22 (carried)
No far model or broken body seen in 30 game views; the models are unchanged.

## 4. Top ten defects, in priority order

1. **Every crowd hand-over at the door pops the whole pose in one frame.**
   - Feet 0.20-0.44 m, hands up to 0.53 m, pelvis 0.13 m on boarding; 11 of 11 at Partick.
   - **Cause (inferred):** `index.js` boarding makes a new person in the car crowd (`sc.add(...)`) with a fresh clip and a fresh gait planted from the clip's ankles. Nothing carries over the old person's bone pose or foot plants (the bag now is carried over, the body is not).
   - **Fix:** carry over the gait state (feet, phase, `wU`/`wL`), or copy the old skeleton's local bone rotations into the new one for the first frame and cross-fade from there, in the same way `_bagOn` carries a bag across a near/far swap.
   - **Reproduce:** `node hov.mjs "mode=explore&q=high&line=outer&station=partick&give=2" hov/pk 120 40`, then read `hov/pk.json` (`fl`, `fr`, `hr`, `pel`).
2. **The lunge residue, and the queue crouch.**
   - `adult_harem` lunges 0.36 m at the door; `woman_dress` 0.26 m on the stairs; `ya_smile_dress` walks a queue 4 s at 0.64 of her height (older than this change).
   - **Cause:** `REACH_DROP` caps the drop below the *fitted* bob, and `trackReach` logs the uncapped `lowerForReach(…, 10)`, so long strides at low speed drag the fit, and with it the whole walk, down.
   - **Fix:** clamp the reach log, and the fit `hp`, to `P.hPeak - REACH_DROP` too. At low `v`, shorten the planned step instead.
   - **Reproduce:** `node pdip4.mjs "mode=explore&q=high&line=inner&station=st-enoch&give=2" dip/se 150 45 0.25` (and with `OLDGAIT=$R/gait_old.js` for the comparison).
3. **Feet left out of reach freeze: half strides held for seconds, and a straddle in the car doorway.**
   - `woman_scarf` 8 s, `ya_tee_jeans` 7 s, `adult_suit_bun` in the doorway.
   - **Cause:** with the pelvis capped, a target out of reach is simply clamped by the IK. A swing driven by the phase never ends while `v` < 0.02, because `walkStep` advances the phase only when moving. The builder's "lifts and is stepped in" is not implemented.
   - **Fix:** when `!walking` or `v` is about 0 with a foot in `swing` (or out of reach), finish the step on a timed swing (`startSwing` with `T`) to a stand target.
   - **Reproduce:** `node fgap2.mjs "mode=explore&q=high&line=inner&station=hillhead" gap2/hh 200 50 0.15`; `python3 gsum.py gap2/hh.json`.
4. **Heel wearers walk crouched** (LEG p10 7.4 on the default six, 6.1 on the roster; carried). `people_motion.mjs --people ya_tube_heels,adult_heel_boots,teen_girl`.
5. **The grip hand snaps 0.35 m at a stop, and the case follows by 0.27 m** (`man_puffer`, Partick t = 150.50).
   - `paused` or arrival switches `walk` to `idle_a` in one frame while the hand follows the clip, and the case is placed from last frame's hand.
   - **Fix:** fade the clip on pause, and place the case after the pose.
   - **Reproduce:** `node tlog2.mjs "mode=explore&q=high&line=outer&station=partick&give=2" tl_pk 260 0.0333333 40; python3 jb.py tl_pk.json 0.1`.
6. **Hand-over case:**
   - a 0.32-0.52 m jump;
   - for pole riders, then a 0.5 m slide in 0.3 s with the body still;
   - later stood up with a 0.6 m slide as the hand lets go;
   - alighting `woman_coat` 0.47 m.
   - **Cause:** `bagCarry` keeps `tow` but places the case from the new skeleton's clip pose (the pole clip's raised hand), not from the old mesh's world position.
   - **Fix:** copy the old mesh's world transform into the new parent's frame, and blend from it over 0.3 s (as for the near/far swap). When standing it up, plant it where it is rather than lerping to `park`.
   - **Reproduce:** as for item 5, then `python3 ho.py tl_pk.json`.
7. **Platform pivots and the swing of an upright case** (carried). `pturn.mjs` as in review 58.
8. **25 of 99 people never sit** (carried). `node cansit.mjs`.
9. **Faces** (carried from review 59: smirks, orange scalp dots, banded caps, eye smudges). `node face4.mjs $(cat ids_f.txt) f/n 0:0 0`.
10. **Minor, carried:**
    - the car garment rule hole;
    - pole arms;
    - kilts opening mid-stride;
    - the sit-down slide;
    - the haggis spin;
    - children alone;
    - one-frame walker overlaps.

## 5. What I could not observe

- No motion was watched; the pops and slides are measured at 30 Hz and seen in stills.
- Only 3 stair arrivals with cases occurred across 4 runs (random), so claim 2 rests on 3 events.
- The frozen-foot rate varies widely from run to run (people frozen 2 s or more: 8, 1 and 5 with the new gait; 4 with the old), so I do not claim the cap made it worse, only that it remains, and that it now shows as a straddle instead of a kneel.
- Faces, clothing, range and whole bodies were not re-sampled (models unchanged).

## 6. What I sampled

| What | Where | Evidence |
|---|---|---|
| Pelvis dips, new and old gait, with renders | Hillhead inner (natural), St Enoch inner (`give=2`), x2 gaits | `dip/`, `dipold/` |
| Drawn foot against gait target, new and old gait | Hillhead x2, Partick, Hillhead old | `gap/`, `gap2/`, `gapold/` |
| Case owners frame by frame, boarding and stairs | Partick outer (`give=2`), Hillhead inner (`give=2`), Buchanan Street outer (`give=1`) | `tl_pk.json`, `tl_hh.json`, `tl_bs.json`, `jb_*.txt` |
| Whole-body hand-over jumps | Partick outer (`give=2`) | `hov/pk.json`, `hov/*.jpg` |
| Walking instrument | default six | `m/`, `mrec.log` |
| Player eye height | Kelvinhall inner ride (24 views), Ibrox platform (6) | `eye/K1.png`, `eye/K2.png`, `eye/I.png` |

Next round, look at:
- the hand-over after a fix;
- alighters with cases;
- the queue walk at low speed;
- faces in car lighting.

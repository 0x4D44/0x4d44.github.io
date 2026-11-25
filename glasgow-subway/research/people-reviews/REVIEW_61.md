# Under Glasgow: independent review of the people (review 61)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `e1665407` (the people code is that of `bd27e743`; the merge adds nothing under `glasgow-subway/js`). Changes since review 60 (`git log -4 -p -- glasgow-subway/js`):
- `adac9c0d` (`people.js`, `index.js`): `snapPose` takes each bone's local transform from the person being handed over. `_poseBlend` slerps the new body from that pose to its own over `POSE_FADE` = 0.4 s (smoothstep). `rootOff` eases the root from where the old body stood.
- `bb63627c` (`gait.js`): `trackReach` floors the logged reach at `CAP_FLOOR` = 0.06 m below the bob's foot.
- `7cf616b2`, `bd27e743` (`people.js`, `gait.js`): a far person (more than `rAnim` = 40 m) is animated while the gait is walking, while `wk` or `wU` is above 0, and for 1 s after a clip fade. In `standStep`, a swing still timed by the phase is re-aimed on a 0.3 s timed swing to the stand target.

No model, face, seating or clothing code changed. I edited nothing in the repository. For comparisons with the old code I used Playwright routes in my own browser only: `gait.js` at `adac9c0d`, and `people.js` and `index.js` at `4faf4e2e` (files `*_r60.js`). Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review61/`. Running notes are in `NOTES.md`.

New tools this round:
- `hov2.mjs` records frames -10 to +30 around every hand-over between crowds. It tracks people by object, not by `char.id`: `hov.mjs` keyed by id, and in this round it aliased duplicates 2.6 km away.
- `hv.py` and `hvs.py` analyse it: jumps, second differences against a baseline, and foot glide during the blend.
- `sp.mjs` is `hov2` plus a window on every walk start. `sps.py` finds one-frame foot pops at the start.
- `tt.mjs` traces one person's hands, hold weight and distance to the camera. `OLD=$R` serves the review-60 code.

**Result: weighted mean 8.36 (8.361). Gate NOT met:** the mean is not above 9. **For the first time in this series, no category is below 8.** Walking is 8.30, up from 7.62.

- **Fixed:**
  - the whole-body pop at the train door;
  - the queue crouch;
  - frozen half strides and the doorway straddle;
  - the grip snap at a stop;
  - the case jump on boarding.
- **Left, or newly measured:**
  - Alighters' feet glide about 0.2 m over the 0.4 s blend.
  - The alighting case still jumps 0.20-0.27 m.
  - A one-frame foot pop at about half of all walk starts (older than this change).
  - A 0.12 m hand snap when a phone is put away (older than this change).
  - The heel crouch.
  - The carried model faults.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.9 | 7.4 | **8.30** |
| 2 | Arms and hands | 10 | 9.0 | 7.9 | **8.56** |
| 3 | Faces | 10 | 8.8 | 7.5 | **8.28** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.8 | **8.52** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.0 | 7.9 | **8.56** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.36** (8.361) |

0.20x8.30 + 0.10x8.56 + 0.10x8.28 + 0.10x8.52 + 0.10x8.40 + 0.15x8.24 + 0.10x8.56 + 0.15x8.22 = 1.660 + 0.856 + 0.828 + 0.852 + 0.840 + 1.236 + 0.856 + 1.233 = 8.361.

Against review 60 (8.187):
- **Walking +0.68** (worst tenth 6.0 to 7.4): the hand-over pop, the queue crouch and the frozen straddles are gone.
- **Arms +0.18**: no hand-over hand pop and no stop snap. A phone put-away snap is newly measured.
- **Standing +0.16**: no frozen half strides.
- **Luggage +0.04**: the boarding case is now smooth, but the alighting jump and the pole riders' slide remain.
- The other categories are carried: their models and code are unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Hand-over pose carried across: every bone moves 2-5 cm in the hand-over frame | **TRUE for the frame; residue in the blend.**<br>`hov2`, 14 real hand-overs (Partick outer `give=2`: 3; St Enoch inner `give=2`: 11). In the hand-over frame:<br>- pelvis 0.02-0.04 m;<br>- feet 0.02-0.03 m;<br>- hands 0.02-0.05 m.<br>Review 60 had feet 0.20-0.44 m and hands up to 0.53 m. No bone's second difference in frames 0-1 exceeds 0.05 m, against a walking baseline p99 of 0.05 m.<br>**Residue:**<br>- (a) Alighters (`stand` to `go`): the flat feet glide 0.08-0.23 m over the 0.4 s blend (`ya_tube_heels` 0.20 m, `elder_woman_dress` 0.20 m, `teen_ginger` 0.22 m), and both feet rise 2-3 cm in frame 0. The gait plants the new feet at the new root, and the blend drags the drawn feet across to them.<br>- (b) 12-14 frames later the first step pops 0.11-0.17 m in one frame. That is an older start fault (item 3 of the top ten), not the hand-over. | `hv/pk.json`, `hv/se.json`; `python3 hv.py hv/se.json`, `python3 hvs.py hv/*.json` |
| 2 | Queue crouch: St Enoch, 0 dips over 0.25 m; `ya_smile_dress` minimum 0.819; instrument 9.51 | **TRUE.**<br>- `pdip4` St Enoch inner `give=2`, TH 0.25: 38 `go` walkers, 0 over 0.25 m and 0 over 0.35 m (review 60: 3 and 1).<br>- `ya_smile_dress` minimum is exactly 0.819 (was 0.644).<br>- The lowest of anybody is 0.746, `boy_small`, a child.<br>- Default six: 9.51, LEG p10 7.4, SMO p10 7.4, unchanged. | `dip/se.json`, `mrec.log` |
| 3 | No frozen half strides: Hillhead feet off plan for 2 s or more 1 to 0, frame share 0.0001 | **TRUE.**<br>`fgap2` Hillhead inner 200 s: 72 people, **0** off plan for 2 s or more, frame share 0.0002.<br>What is left are 2-3 frame gaps of about 0.2 m on boarders in the car, during the pose blend, and one pole re-plant (`ya_ginger_lad`, 0.27 m for 3 frames, `gap2/gl.png`: a normal step). | `gap2/hh.json`; `python3 gsum.py gap2/hh.json` |
| 4 | Grip-hand snap at a stop gone | **TRUE in my sample.**<br>`tlog2` at Partick outer `give=2` (260 s) and St Enoch inner `give=2` (200 s): 33 walk-stops by case owners, 15 of them on the far model. No grip move over 0.12 m in the body frame.<br>Two exceptions, both unrelated:<br>- `sum_tee_leggings` at t 0.07-0.20, the first frames of the sim, at a far-to-near swap;<br>- `teen_tube` 0.15 m, a phone put-away (top-ten item 5), the same with the review-60 code.<br>`man_puffer` was not a case owner in my runs (the roster differs), so the exact review-60 case is not re-run. Its mechanism (frozen at v < 0.2 m/s, gait stripped) is removed in code. | `jb_pk.txt`, `jb_se.txt`, `tt.mjs` |
| 5 | Case at the hand-over: not re-measured by the builder | **Boarding: FIXED. Alighting: NOT FIXED.**<br>**Boarding** (`teen_shorts_lad`, `adult_runner`, `elder_woman_dress`, St Enoch): the case moves 0.01-0.03 m per frame through the hand-over, then drifts 0.15-0.2 m over 0.4 s still in tow (was 0.32-0.52 m in one frame).<br>**Pole rider** (`ya_tee_jeans`): no jump (0.03 m), but the case then slides **0.85 m across the floor in 0.4 s**, at up to 0.15 m per frame, while the pelvis is nearly still. It is still sliding at 0.9 m/s 1 s later. Review 60's pole-rider slide is still there.<br>**Alighting:** `tow` goes from 0 to 1 in one frame. The case jumps **0.20-0.27 m** in that frame (`teen_shorts_lad` 0.27 m, `adult_runner` 0.20 m), then slides another 0.2 m in 0.15 s with the body still. | `tl_se.json`; `python3 ho.py tl_se.json`; `hv/se.json` (`ya_tee_jeans`) |
| 6 | Not changed: heel crouch, pivots, skirt/kilt never-sitters, faces, clothing, sit-down slide, haggis | **Confirmed where re-measured.**<br>- Instrument identical.<br>- Code for the others unchanged; not re-measured.<br>- Ride views at Govan (24) and the Kelvinbridge platform (6) show nothing broken. | `mrec.log`, `eye/G1.png`, `eye/G2.png`, `eye/KB1.png` |

**Far-person animation: does it add a fault?** I found none.
- The one far-related hand snap I chased (`teen_tube`, `jb_se`) was 9.8 m from the camera and identical with the review-60 code.
- 15 far-model stops showed no snap.
- The `dirty` branch no longer re-applies the gait (`7cf616b2` added that, and `bd27e743` removed it). A far, still person whose clip changes without a fade (`fadeEnd` = 0), or who is moved by a tween, still has the gait legs stripped in one frame. That is as before review 60, and beyond 40 m.

## 2. Status of REVIEW_60's top ten

| # | REVIEW_60 item | Now |
|---|---|---|
| 1 | Hand-over pose pop | **Fixed** (0.02-0.05 m). Residue: a 0.2 m foot glide on alighting, over the 0.4 s blend. |
| 2 | Lunge residue, queue crouch | **Fixed** at St Enoch (0 over 0.25 m). |
| 3 | Frozen half strides, doorway straddle | **Fixed** (0 people at 2 s or more). |
| 4 | Heel crouch | Unchanged (LEG p10 7.4). |
| 5 | Grip snap at a stop | **Fixed** in 33 stops. |
| 6 | Hand-over case | **Boarding fixed.** Alighting 0.20-0.27 m jump and pole-rider slide remain. |
| 7 | Platform pivots | Carried. |
| 8 | Never-sitters | Carried. |
| 9 | Faces | Carried. |
| 10 | Minor | Carried. |

## 3. Per-category reasoning

### 3.1 Walking: 8.30 (typical 8.9, worst tenth 7.4)
- **Instrument:** 9.51; LEG p10 7.4 and SMO p10 7.4 (heel wearers, `girl_school_kilt`, `boy` at 1.9 m/s).
- **Gone from the worst tenth:**
  - the door pop at every boarding;
  - the queue lunge;
  - frozen straddles.
- **What fills the worst tenth now:**
  - the heel crouch (carried);
  - alighters' feet gliding about 0.2 m over 0.4 s at the door (`hvs.py`; every alighter measured, 0.08-0.23 m);
  - a newly measured start pop. At about half of all walk starts, 0.27 s in, the first swing foot jumps 0.12-0.15 m in one frame (rising 5-6 cm), with 0.01-0.03 m in the frames either side. Counts: 25 of 55 starts at St Enoch, 24 of 48 at Hillhead; 32 of 63 with the review-60 code, so it is older. It shows on both models, and is a small, frequent tick.
- Platform pivots (carried).

### 3.2 Arms and hands: 8.56 (typical 9.0, worst tenth 7.9)
- The hand-over hand pop and the stop snap are gone.
- **Newly measured (older than this change):** at the end of a phone put-away, `teen_tube` at 9.8 m: the hands move 4-5 cm per frame while the hold weight falls to 0. The left hand then jumps 0.12 m in the last frame and stops dead (`tt.mjs`; same with `OLD`).
- Pole arms carried.

### 3.3 Faces: 8.28 (carried)
Models unchanged. Two close faces in the Govan ride views (`eye/G1.png` row 3) read correctly. Review 59's list stands:
- one-sided smirks;
- orange scalp dots;
- banded caps;
- eye smudges.

### 3.4 Standing, sitting, behaviour: 8.52 (typical 9.0, worst tenth 7.8)
- No frozen half strides.
- Govan ride and Kelvinbridge platform views are natural: seated phone users, standers, a door queue.
- Never-sitters, pivots and the sit-down slide are carried.

### 3.5 Range of people: 8.40 (carried)

### 3.6 Clothing: 8.24 (carried)

### 3.7 Luggage: 8.56 (typical 9.0, worst tenth 7.9)
- **Better:** boarding with a case is now smooth.
- **Still there:**
  - the alighting case jump (0.20-0.27 m) and slide;
  - the pole riders' 0.85 m slide in 0.4 s, and the later slow slide with the body still;
  - towed-case one-frame jitters of 0.10-0.16 m in the body frame while walking (`jb_*`, mostly far model; as in review 60).

### 3.8 Whole bodies: 8.22 (carried)
Nothing broken in 30 game views; the models are unchanged.

## 4. Top ten defects, in priority order

1. **The alighting case jumps 0.20-0.27 m, and pole riders' cases slide up to 0.85 m in 0.4 s.**
   - **Cause:**
     - **Alighting:** `walkOn`, then `add`, makes the platform person with a fresh bag. `bagCarry` is called only on the boarding path in `index.js`. The case goes from `tow` 0 (stood up in the car) to 1 in one frame, then eases.
     - **Pole riders:** `bagCarry` gives the case its old `tow`. The case is then pulled by the blended grip hand (0.73 m to 0.21 m from the left hand) as the pose fades to the pole clip, and afterwards moves to its park spot at about 0.9 m/s.
   - **Fix:**
     - Call `bagCarry` on the alighting path too, and copy the old case's world transform into the new parent's frame.
     - For a case that ends up parked, plant it where it is at the hand-over, and let the hand reach to it, rather than move it to the hand.
   - **Reproduce:** `node tlog2.mjs "mode=explore&q=high&line=inner&station=st-enoch&give=2" tl_se 200 0.0333333 45; python3 ho.py tl_se.json`. For the pole rider: `node hov2.mjs "mode=explore&q=high&line=inner&station=st-enoch&give=2" hv/se 150 45`, then trace `ya_tee_jeans`.
2. **Heel wearers walk crouched** (LEG p10 7.4 on the default six; carried).
   - **Reproduce:** `people_motion.mjs --people ya_tube_heels,adult_heel_boots,teen_girl`.
3. **A one-frame first-step pop at about half of all walk starts.**
   - About 0.27 s after a start, the swing foot jumps 0.12-0.15 m in one frame (rising 5-6 cm), against 0.01-0.03 m in the frames either side. Counts: 25 of 55 at St Enoch, 24 of 48 at Hillhead; 32 of 63 with the review-60 code.
   - **Cause (inferred):** the first swing is started from the stance or toe-off pose with its arc progress counted from somewhere other than where the foot is. The jump is mostly in height, as at review 35's swing-start fault.
   - **Fix:** start the first swing from `f.cur` with `c0` and `s` 0, as `startSwing` does for re-aimed feet.
   - **Reproduce:** `node sp.mjs "mode=explore&q=high&line=inner&station=hillhead" hv/sp_hh 150 50; python3 sps.py hv/sp_hh.json`.
4. **Alighters' feet glide about 0.2 m during the 0.4 s pose blend** (and lift 2-3 cm in frame 0).
   - **Cause:** the new gait plants both feet from the clip at the new root (`np.x`, not `x + rootOff`), and the bone blend draws the feet across to those plants.
   - **Fix:** seed the new gait's `F[s].H` from the old body's drawn ankles (world to new parent). Let the stand logic step them in as it does after a stop, or blend only the upper body and the root.
   - **Reproduce:** as in item 1 (`hv2`); `python3 hvs.py hv/se.json` (`stand -> go` rows).
5. **The hand snaps 0.12 m at the end of a phone put-away, then stops dead.**
   - **Cause:** the hold weight falls linearly to 0. In the last frame the IK target is dropped and the clip pose is shown.
   - **Fix:** ease the hold weight out (smoothstep) and blend the last 2-3 frames.
   - **Reproduce:** `node tt.mjs "mode=explore&q=high&line=inner&station=st-enoch&give=2" teen_tube 8.9 9.2`.
6. **Platform pivots and the swing of an upright case** (carried). `pturn.mjs` as in review 58.
7. **Never-sitters** (carried; the 11 skirt and kilt wearers whose garments break when seated). `node cansit.mjs`.
8. **Faces** (carried: smirks, orange scalp dots, banded caps, eye smudges). `node face4.mjs $(cat ids_f.txt) f/n 0:0 0`.
9. **Towed-case one-frame jitter of 0.10-0.16 m in the body frame while walking**, mostly on the far model (`jb_pk.txt`, `jb_se.txt`; also in review 60).
10. **Minor, carried:**
    - the car garment rule hole;
    - pole arms;
    - kilts opening mid-stride;
    - the sit-down slide;
    - the haggis spin;
    - one-frame walker overlaps;
    - a far still person whose clip changes without a fade, or who is tweened, losing the gait legs in one frame (beyond 40 m).

## 5. What I could not observe

- No motion was watched. Pops and glides are measured at 30 Hz.
- `man_puffer` (review 60's stop snap) was not a case owner in my runs. Claim 4 rests on 33 other stops and on the code.
- Only 3 boarding and 2 alighting case owners, and 1 pole-rider case, were caught.
- Faces, clothing, range and whole bodies were not re-sampled (models unchanged).

## 6. What I sampled

| What | Where | Evidence |
|---|---|---|
| Hand-overs, frames -10 to +30 | Partick outer `give=2`, St Enoch inner `give=2` | `hv/pk.json`, `hv/se.json` |
| Walk starts, new and review-60 code | St Enoch, Hillhead, Hillhead old | `hv/sp_*.json` |
| Pelvis dips | St Enoch inner `give=2` | `dip/se.json` |
| Drawn foot against gait plan | Hillhead inner 200 s | `gap2/` |
| Case owners frame by frame | Partick outer, St Enoch inner (`give=2`) | `tl_pk.json`, `tl_se.json`, `jb_*.txt` |
| Hand trace, phone put-away | St Enoch, new and old code | `tt.mjs` |
| Walking instrument | default six | `m/`, `mrec.log` |
| Player eye height | Govan outer ride (24), Kelvinbridge platform (6) | `eye/G1.png`, `eye/G2.png`, `eye/KB1.png` |

Next round, look at:
- alighters with cases after a fix;
- the first-step pop;
- faces in car light;
- the never-sitters.

# Under Glasgow: independent review of the people (review 54)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4a793512`. The changes since review 53 (`git diff ad42737d HEAD -- glasgow-subway/js`) are three lines:
- `js/sim/bags.js` `stepBag` line 293: the tow weight eases down at 0.035 a frame (was 0.14) when the owner has settled, and a pole holder's case is towed while `o.turn` is set.
- `js/sim/people.js` `_bagHow` line 597: adds `turn` (`settleTurn || settleGait`) and `settle` (not walking).
- `js/sim/haggis.js` `followStep` lines 32-39: the leg phase advances by the distance actually moved after the leg push-back, and `v` decays by `6/s` when the haggis moves less than 30 % of its step.

Models, `gait.js`, `people_meta.json` and the faces have not changed.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review54/`; running notes are in `NOTES.md`.

New tools this round:
- `hag4.mjs` / `hag5.mjs`: the haggis owner is put on the platform with the crowd's own `walkOn` route (this got him walking, after four failed attempts in earlier reviews), then stood with his back to an off-floor boundary, then a stander is put between the haggis and its place. 60 Hz log of the haggis root, `v`, leg phase and leg angle.
- `hagan.py`: per 0.5 s window, how far the owner and the haggis moved, the leg cycles made, and the leg swing.

**Result: weighted mean 8.27 (8.268). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Better:** the case's end-of-turn set-back is about a quarter as fast (peak about 2 m/s, was 5.4-7.3 m/s). A pole holder now tows her case round by the handle, and an unforced case owner did ride as a pole holder this round.
- **Not fixed:** the case still slides about 0.4-0.5 m across the floor after the turn with no hand on it. The haggis still trots on the spot when the floor clamp (wall or platform edge) stops it, and when legs stop it, it freezes in mid-stride instead of standing.
- **Found this round:** scalp showing through the hair of `teen_girl` and `teen_skirt`; `man_elder`'s ashen skin and near-white eyes; a translucent pink nape on `ya_ginger_lad`; a train crowd that was 71 % trousers for 80 s.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.9 | **8.50** |
| 3 | Faces | 10 | 8.6 | 7.5 | **8.16** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.8 | **8.58** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.7 | 7.2 | **8.10** |
| 7 | Luggage | 10 | 8.9 | 7.7 | **8.42** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.27** (8.268) |

0.20x8.12 + 0.10x8.50 + 0.10x8.16 + 0.10x8.58 + 0.10x8.30 + 0.15x8.10 + 0.10x8.42 + 0.15x8.22 = 1.624 + 0.850 + 0.816 + 0.858 + 0.830 + 1.215 + 0.842 + 1.233 = 8.268.

Changes against review 53 (8.287):
- **Luggage +0.14** (typical 8.8 to 8.9, worst tenth 7.5 to 7.7): the slower set-back and the pole tow. Held back by the unhandled slide, the unchanged start-of-turn jump and the haggis.
- **Arms and hands +0.04** (worst tenth 7.8 to 7.9): a pole holder has the grip in her free hand while she steps round.
- **Faces -0.10** (typical 8.7 to 8.6, worst tenth 7.6 to 7.5): new faults among 26 faces not sampled before.
- **Clothing -0.14** (typical 8.8 to 8.7, worst tenth 7.4 to 7.2): a train crowd above half in one garment for most of a ride.
- **Whole bodies -0.04** (worst tenth 7.6 to 7.5): scalp holes in two heads of hair, the translucent nape.
- **Walking, behaviour and range are unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | After a stepped turn, a towed case sets back upright slowly (about a second) instead of snapping 36 cm back in 0.25 s | **PARTLY TRUE.**<br>- Four controlled 150-degree turns with a case handed over (`adult_piper` and `teen_skirt` standing at Buchanan Street outer; `adult_suit_bun` and `teen_skirt` as pole holders at Kelvinhall inner).<br>- The set-back now peaks at 1.70-1.96 m/s (was 5.4-7.3 m/s) and takes about 1-1.5 s.<br>- But the base still travels across the floor: `adult_piper`'s case goes from (0.43, -0.29) to (0.72, 0.12) in the car frame, about 0.48 m, while he stands still. `bags.js` still lerps `mesh.position` from the towed place to the standing place; only the rate changed.<br>- In `tr/PIPER.png` (rows 2-3) the case leans tipped on its wheels with the handle well away from his hand, then slides upright. Nobody holds it while it moves.<br>- The rate is per frame, not per second, so at a low frame rate the set-back is slower in real time and at a high one faster.<br>- Not covered by the claim and unchanged: picking the case up at the start of the turn moves the base about 0.4 m in 0.25 s at a peak of 1.9-2.25 m/s, in all four turns. | `tr/t_*.json`, `tr/p_*.json`, `python3 bagan.py tr/*.json`, `VT=0.6 python3 bagj.py tr/*.json`, `tr/PIPER.png` |
| 2 | A pole holder stepping round tows her case round by the handle | **TRUE.**<br>- `teen_skirt` in `pole`: the right hand stays up on the pole, the left holds the grip, and the case is tipped on its wheels through the turn (`tr/PSKIRT.png`, rows 1-2). The wheels roll at 0.9-1.0 m/s.<br>- `adult_suit_bun`: the same in the log.<br>- How often this happens: in a 500 s ride from St Enoch outer, an unforced case owner was in a car in `pole` for 8 samples, and one `stand->pole` rise was made on a case owner (`tc_se.log`). So the old orbit was reachable in play, and it is now fixed. | `tr/p_*.json`, `tr/PSKIRT.png`, `tc_se.log` |
| 3 | The haggis no longer trots on the spot when pushed back by legs: the legs move only as far as it went; blocked, it slows and stands | **PARTLY TRUE.**<br>- **Walking (first observation in five reviews).** At Buchanan Street inner the owner walked about 4 m in the crowd's own `go` mode. Leg cycles equal distance / 0.12 m exactly; the scuttle is about 11-12 Hz at 1.4 m/s and looks right in `hg/W1.png`. While walking it lags 1.2-1.9 m behind its owner, more than the 1.25 m lead, so the lead is drawn straight and stretched.<br>- **Pushed back by legs: no longer trots, but it does not stand.** With `teen_hood` placed between the haggis and its place (St Enoch outer), the haggis stops moving and its legs stop. But `v` settles at 1.05 m/s and not 0: the `6/s` decay balances the 7 m/s^2 acceleration. So `poseHaggis` holds the legs splayed at 0.60 rad mid-stride for as long as it is blocked (5.5 s logged).<br>- **Stopped by the floor clamp: still trots on the spot.** With the owner 0.25 m from an off-floor boundary and his back to it, the haggis's place is off the floor. `people.js` `_petStep` calls `_toFloor` after `followStep`, so the `moved` that `followStep` measures counts a step that the clamp then takes back. Result: position fixed (0.000 m per 0.5 s for 3 s or more), yet 3.3 leg cycles per 0.5 s (6.6 Hz), full 0.75 rad swing, `v` 0.82, body turned 90 degrees from its owner. This is review 53's platform-edge case, unchanged. | `hg/h.json`, `hg/e.json`, `python3 hagan.py hg/e.json`, `hg/W1.png` |
| 4 | Not changed: turn speed, sit-down slide, crouch, faces, `woman_midi`'s bob, `boy_kilt` seated, toe drag, clip-change slide, start-up dip, kilts, hairlines, pole reach, children alone, garment clumping | **Confirmed unchanged where measured.**<br>- Walking instrument (`m.log`): overall 9.51, LEG p10 7.4, SMO p10 7.4, as in review 52.<br>- Turns: 150 degrees in about 3.2 s (`tr/`, `T` flag from 1.0 to 4.2 s).<br>- Faces: every review 53 fault is still there (section 3.3).<br>- `boy_kilt` seated (first look since review 51): whole; the kilt reads as a short kilt over bare thighs from 1.5 m (`seat/SEAT.png`, row 1).<br>- Garment clumping: see section 3.6.<br>- Children alone: a girl alone at the platform edge at Hillhead (`eye/E3.png`). | `m.log`, `seat/SEAT.png`, `eye/E3.png` |

## 2. Status of REVIEW_53's top ten

| # | REVIEW_53 item | Now |
|---|---|---|
| 1 | Case scoots back at the end of every stepped turn (0.36 m, 5-7 m/s) | **Partly fixed.** Peak 1.7-2.0 m/s over about 1-1.5 s, but the case still slides 0.4-0.5 m across the floor with no hand on it. The 0.4 m start jump at about 2 m/s is unchanged. |
| 2 | Pole holders' cases orbit rigidly | **Fixed.** Towed by the free hand (`tr/PSKIRT.png`). |
| 3 | Slow stepped turns | Unchanged: 150 degrees in about 3.2 s. |
| 4 | Sit-down foot slide | Not re-measured; the code is unchanged. |
| 5 | Faces | Unchanged, plus new faults (section 3.3). |
| 6 | Heel and pencil-skirt crouch; LEG and SMO p10 7.4 | Unchanged (`m.log`). |
| 7 | Haggis trots on the spot | **Partly fixed.** Blocked by legs: it no longer trots but freezes mid-stride. Stopped by the floor clamp: it still trots on the spot. |
| 8 | Car sample over half in one garment | **Worse this round:** a train crowd was 71 % trousers (5 of 7) for 80 s and above half in 28 of 43 samples (Kelvinbridge inner). Partick outer stayed at or below half. |
| 9 | `woman_midi`'s bob from behind; `boy_kilt` seated | Bob: not re-rendered, carried over. `boy_kilt` seated is acceptable. |
| 10 | Minor and carried over | Toe drag, clip-change slide, start-up dip, kilt mid-stride, hairlines and pole hands are carried over (code unchanged). Children alone: seen again (`eye/E3.png`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- `people_motion.mjs --people default` re-run: 9.51, LEG p10 7.4, SMO p10 7.4, worst recording `boy` at 1.9 m/s, 8.8 (`m.log`).
- Turns stay slow: about 47 degrees a second.
- The haggis owner, walking with `walkOn`, stalled in `go` for 5-6 s in both runs, standing in `idle_a`. That reads as waiting, not as a fault.

### 3.2 Arms and hands: 8.50 (typical 8.9, worst tenth 7.9)
- Gain: a pole holder's free hand takes the grip during her turn.
- Still there: during the set-back the hand has left the grip while the case is still tipped (`tr/PIPER.png`, rows 2-3). A standing owner's hand is not on the case.

### 3.3 Faces: 8.16 (typical 8.6, worst tenth 7.5)
- 32 faces at 0.85 m, neutral and at smile 0.6 (`f/N.png`, `f/S.png`, zoom `f/Z.png`): 6 rechecks and 26 not sampled in reviews 52 or 53.
- Good:
  - `woman_dress`, `woman_elder`, `woman_student`, `ya_knit`, `adult_tie_suit`, `staff_woman`, `adult_string_vest` and `boy_shorts` read as their age and sex.
  - The 0.6 smiles are gentle and mostly natural (`f/S.png`).
- Unchanged from review 53:
  - `woman_scarf` and `adult_harem` are twins.
  - `ya_spiky` has a hard, straight hairline with a pink patch.
  - `teen_boy` has a dark mark under his eye.
  - `sum_shorts_asian_m`'s smile twists.
  - `teen_hood`'s smile is lopsided.
  - Neutral mouths are dour.
- New this round:
  - `teen_girl` and `teen_skirt`: pink scalp shows through holes in the hair at the parting and front hairline (`f/Z.png`, top left and second).
  - `man_elder`: ashen grey skin and pale, near-white eyes. He looks ill, not old (`f/Z.png`, top right).
  - `sum_tube_denim`: the hair is a stepped, blocky cap (`f/Z.png`, bottom left).

### 3.4 Standing, sitting, behaviour: 8.58 (unchanged)
- Car crowds at eye height look natural: riders on phones, standers at poles, a mix of postures (`eye/E1.png`, `eye/E2.png`).
- Seated garment wearers sit whole (`seat/SEAT.png`).
- Carried over: turns of about 3 s and the sit-down slide.

### 3.5 Range of people: 8.30 (unchanged)
- The roster is unchanged: 99 characters (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff).
- A girl stands alone at the platform edge (`eye/E3.png`).

### 3.6 Clothing: 8.10 (typical 8.7, worst tenth 7.2)
- Partick outer (`cen/pa.json`): the platform reached 50 % shorts at most; train samples reached 44 % at most.
- Kelvinbridge inner (`cen/kb.json`): the platform reached 46 % trousers at most. The train crowd was over half in one garment in 28 of 43 samples:
  - 5 of 7 in trousers (71 %) from 140 to 220 s;
  - 4 of 6 (67 %) from 250 to 330 s.
  - The rubric says no more than half.
  - Trousers here span jeans, suit trousers and joggers, which softens how it looks but not the rule.
- Families seen: trousers, shorts, skirts and dresses, leggings, kilts, highland dress and trews.
- Seated skirts and kilts on the people the game seats (`boy_kilt`, `girl_school_kilt`, `girl_small`, `woman_dress`) are whole. `adult_piper` and `adult_heel_boots` are not seated (`_canSit` false).

### 3.7 Luggage: 8.42 (typical 8.9, worst tenth 7.7)
- Gains: claims 1 and 2.
- Worst tenth:
  - The case slides 0.4-0.5 m on its own at up to 2 m/s after every stepped turn, and jumps 0.4 m at about 2 m/s at the start.
  - The haggis (scored here as review 53 did): it trots on the spot against the floor clamp, freezes mid-stride against legs, and its lead stretches past its 1.25 m length while it lags.
- The haggis's walking itself is good.

### 3.8 Whole bodies: 8.22 (typical 8.7, worst tenth 7.5)
- Far models (`far/F.png`): 6 people walking at 7 m match their near models.
- Both rides: no far model within 6 m, no duplicates, and 54 stair walks with none stalled.
- Kelvinbridge: 6 brief overlaps between walkers on the platform, at least 0.1 m apart, lasting up to 0.3 s.
- New: scalp holes in `teen_girl`'s and `teen_skirt`'s hair. `ya_ginger_lad`'s nape shows translucent, pinkish hair cards against a bright background at 0.6 m (`eye/z18.png`).

## 4. Top ten defects, in priority order

1. **The wheeled case still slides on its own after a stepped turn.** It travels 0.4-0.5 m at up to 1.7-2.0 m/s over about 1-1.5 s with no hand on it, leaning tipped first. At the start of the turn the base also jumps about 0.4 m at 1.9-2.25 m/s in 0.25 s.
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=360 node ctl6.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 3 150`, then `VT=0.6 python3 bagj.py tr/t_*.json`; see `tr/PIPER.png`.
   - Cause: `bags.js` lerps the mesh position between the towed and standing places with the tow weight.
   - Likely fix: when the tow weight falls, keep the wheels where they are on the floor and rotate the case upright about them. At the start, tip it about its standing base.
2. **The haggis still trots on the spot against a wall or the platform edge.** Position fixed, legs at 6.6 Hz with full swing, body turned sideways (`hg/e.json`, phase `edge`).
   - Reproduce: `node hag5.mjs "mode=explore&q=high&line=outer&station=st-enoch" hg/e`, then `python3 hagan.py hg/e.json`.
   - Cause: `_petStep` applies `_toFloor` after `followStep` has advanced the phase. Measure the step after the floor clamp, or clamp inside `followStep`.
3. **A blocked haggis freezes mid-stride.** `v` settles at 1.05 m/s, so the legs hold a splayed 0.60 rad pose for as long as it is blocked (`hg/e.json`, phase `block`).
   - Fix: let `v` fall to 0 when blocked (for example, drop `want` to 0), so `poseHaggis` returns to the standing pose.
4. **A train crowd over half in one garment:** 71 % trousers for 80 s; 28 of 43 samples above half.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=kelvinbridge" cen/kb 480 40`, then `python3 cen4.py cen/kb.json`.
5. **Faces:**
   - New: scalp holes in `teen_girl`'s and `teen_skirt`'s hair; `man_elder` ashen with near-white eyes; `sum_tube_denim`'s blocky hair.
   - Unchanged: `woman_scarf` and `adult_harem` twins, `ya_spiky`'s hairline, `teen_boy`'s mark, the twisted and lopsided smiles, dour neutral mouths.
   - Reproduce: `node face4.mjs <ids> f/n 0:0 0` and `... f/s 0:0 0.6`; see `f/Z.png`.
6. **Stepped turns are slow:** 150 degrees in about 3.2 s (`tr/`).
7. **Heel and pencil-skirt crouch; LEG and SMO p10 7.4** (`m.log`).
8. **Sit-down foot slide** of 4-19 cm (carried over; code unchanged).
9. **The haggis lags 1.2-1.9 m behind a walking owner** on a 1.25 m lead, so the lead is drawn taut and longer than itself (`hg/h.json`, walk phase `dOwner`). `ya_ginger_lad`'s translucent nape (`eye/z18.png`).
10. **Minor and carried over:**
    - `woman_midi`'s slab bob from behind.
    - Toe drag, the clip-change slide, the start-up dip.
    - The kilt opening mid-stride; ragged hairlines; pole hands at long reach.
    - Children alone (`eye/E3.png`).
    - Brief walker overlaps on the platform (0.1 m, 0.3 s).

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz logs.
- **Haggis edge and block stills.** The camera in `hag5.mjs` ended up inside the wall, so these two cases rest on the 60 Hz log only. The walking case has stills (`hg/W1.png`).
- **Which boundary.** The off-floor boundary in the edge test was found by a scan (3.7 m from the owner, at 45 degrees). I did not confirm whether it was the back wall or the track edge. Both are places people stand.
- **A natural case-owner turn in a car.** One unforced `stand->pole` rise happened in `tc_se.log`, but I did not render it. The turns judged were forced with `GIVE=1`.
- **Not re-measured** (the code is unchanged): sit-down slides, seated rises, stair feet, the clip-change slide.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Controlled case-owner turns, 150 degrees, standing | Buchanan Street outer: `adult_piper`, `teen_skirt` (case handed over) | `tr/t_*`, `tr/PIPER.png` |
| Controlled case-owner turns, pole holders | Kelvinhall inner: `adult_suit_bun`, `teen_skirt` | `tr/p_*`, `tr/PSKIRT.png` |
| Haggis walking with its owner | Buchanan Street inner, `walkOn`, 10 s | `hg/h.json`, `hg/W1.png` |
| Haggis against a boundary and blocked by a stander | St Enoch outer | `hg/e.json` |
| Faces, neutral and smile 0.6 | 32 people (26 new) | `f/N.png`, `f/S.png`, `f/Z.png` |
| Seated garments as the game seats them | Hillhead outer car: `boy_kilt`, `girl_school_kilt`, `girl_small`, `sum_crop_denim` (with a case), `woman_dress`, `ya_tube_heels` | `seat/SEAT.png`, `seat/s.log` |
| Census, far models, overlaps, duplicates, stairs | Partick outer (486 s) and Kelvinbridge inner (480 s): explore, board, ride | `cen/pa.json`, `cen/kb.json`, `cen_*.log` |
| Case owners in play | St Enoch outer ride, 500 s | `tc_se.log` |
| Player eye height, walking all cars | Ibrox inner ride (24 views) | `eye/E1.png`, `eye/E2.png`, `eye/z18.png` |
| Platform at eye height | Hillhead inner explore | `eye/E3.png` |
| Near and far models walking at 7 m | `teen_girl`, `adult_lusekofta`, `woman_puffer`, `sum_chino_shorts_m`, `elder_woman_dress`, `boy_shorts` | `far/F.png` |
| Walking instrument | default roster | `m.log`, `m/` |

Next round, look at:
- The haggis edge and block cases with a camera placed from the owner's side.
- A rendered, unforced case-owner `stand->pole` rise in a car.
- Sit-downs, if any sit code changes.

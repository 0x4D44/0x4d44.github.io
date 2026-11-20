# Under Glasgow: independent review of the people (review 48)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `2b295095`. The people commits since review 47 (read with `git diff 33f32fd5 HEAD`) touch only `js/sim/people.js`, `js/sim/gait.js` and `js/sim/steer.js`. No model, garment or face file changed.
- `3186b2b4`: `rise` on a seated rider first stands them straight up over their feet (`plain`, linear over the whole 0.9 s), then turns them with `_stepTurn`. `rise` on a STANDING rider (a boarder given a place to stand, room made, a pole taken) sets `settleGait`, runs the old eased tween (`E`, position AND yaw) with the gait holding the legs, then calls `_stepTurn`. The phone is no longer put away while `settleGait` is set.
- `305d07be`: `STEP_CAP = 1.15` steps on a landing during acceleration; `STEER.A` 1.6 to 1.35 m/s2.
- `2b295095`: during a stepped turn the gait's standing targets are the `idle_a` clip's ankles (`standAt`).

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review48/`. Running notes are in `NOTES.md`.

New tools this round:
- `ctl.mjs`, `ctl2.mjs`, `ctl3.mjs`: controlled rises and moves on riders in a running ride. They hide the other riders, use two leg-height cameras, and log at 60 Hz. `ctl3.mjs` also logs the thighs and calves, and `NOMOVE=1` makes it turn the rider without moving them.
- `tw2.py`: the largest angle between each foot (ankle to ball) and the body's heading, per phase.
- `hip.py`: the same angle against the pelvis's own hip line.
- `ghag.mjs`: finds the haggis owner in the running game and films him walking.

**Result: weighted mean 8.27 (8.271). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:**
  - The seated stand-up is no longer a turntable. The body rises straight up, then the feet step round.
  - The start-up lunge is gone.
  - The sit-down hand-back glide is mostly fixed: 2-18 cm, against 35-39 cm in review 47.
- **New, and the worst thing in this round: a standing rider who is turned to a new facing has their hips spun over planted feet.**
  - `rise` on a standing rider still runs the eased yaw tween for the first 0.5 s, but now the gait pins the feet instead of letting them glide.
  - In the game, 5 of 7 standing-rider moves twisted the feet 85-133 degrees off the body (the hip line turns with the body: `hip.py`). Only then does one foot step. The other is swept round 20-42 cm along the floor in the 0.35 s hand-back.
  - At 1.5 m the legs read as scissored and knock-kneed, a foot kicked out sideways (`c2/MV1t.png`).
- **The hand-back sweep survives on every path except the sit-down.** After a stepped turn one foot is often still 70-90 degrees off. The clip then swings it round along the floor, 20-32 cm at 0.8-1.1 m/s. This happened in 4 of 5 seated rises in the game and in 5 of 7 moves.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.7 | **8.36** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.3 | **8.32** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.6 | **8.32** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.27** (8.271) |

0.20x8.12 + 0.10x8.42 + 0.10x8.36 + 0.10x8.32 + 0.10x8.30 + 0.15x8.24 + 0.10x8.32 + 0.15x8.26 = 1.624 + 0.842 + 0.836 + 0.832 + 0.830 + 1.236 + 0.832 + 1.239 = 8.271.

Changes against review 47 (8.275):
- **Walking +0.04.** The lunge is gone. Heel wearers still crouch: a second instrument set scored LEG p10 5.4.
- **Behaviour -0.12.**
  - Better: the seated rise no longer spins, and the sit-down hand-back is mostly fixed.
  - Worse: the standing-move twist is a new fault, and it is easier to see than the glide it replaced. The hand-back sweep still follows the rise and the move.
- **Every other category is unchanged.** No asset changed, and I re-checked them where I could.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A seated rider stands straight up, then turns with stepped feet; a standing rider moved to a new spot or a pole is stepped there; the phone is not put away for the gait's steps; feet lift 20-65 cm; grounded slide 7-40 cm over 4 s | **The seated rise is true. The standing move is mostly FALSE.**<br>- **Seated rise:** 5 game rises (Ibrox outer, Hillhead inner: `teen_tee`, `boy_small`, `ya_shorts`, `girl_leggings`, `woman_puffer`) and 4 controlled ones (`c/up_*`).<br>&nbsp;&nbsp;- The hips go up and over the feet with no yaw (phase L, 0.8-0.9 s). Then the turn is stepped, with 20-46 cm of lifted travel per foot.<br>&nbsp;&nbsp;- But during the rise each ball bone slides 5-18 cm flat at up to 0.88 m/s while the stance widens from 24-34 to 30-43 cm. This is the sit's feet-narrowing fault in reverse.<br>&nbsp;&nbsp;- During the turn the body leads the planted foot by 72-92 degrees before it steps.<br>&nbsp;&nbsp;- In the 0.35 s hand-back, one foot sweeps 20-32 cm along the floor at 0.8-1.1 m/s, in 4 of 5 game rises and 2 of 4 controlled ones (`r/r_6_rise_ya_shorts`, `r2/h_5_rise_girl_leggings`, `r2/h_6_rise_woman_puffer`, `c/up_3_staff_hivis`). The ball bone is 3-5 cm up, which is its height when standing, so the foot is on the floor.<br>- **Standing move:** the tween still turns the body by its eased yaw over 0.5 s. The gait pins the feet meanwhile. The feet only step after the body has turned.<br>&nbsp;&nbsp;- Game: 5 of 7 moves twisted the feet 85-133 degrees off the body (`adult_beret` 89, `man_highland` 85, `woman_coat` 133, `elder_woman_dress` 99; `tw2.py r/*.json r2/*.json`).<br>&nbsp;&nbsp;- Controlled: 6 of 6 moves (110-120 degree turns) twisted the feet 105-129 degrees.<br>&nbsp;&nbsp;- `hip.py` on `c3/` confirms that the pelvis bone turns with the body, so the legs really twist.<br>&nbsp;&nbsp;- One foot then stays twisted until the hand-back sweeps it 21-42 cm at 0.9-1.7 m/s (`woman_coat` `ball_r` 32 cm at 1.44 m/s; `teen_skirt` 31 cm at 1.7 m/s).<br>&nbsp;&nbsp;- `woman_coat` went to `stand_hold_pole`, but `standAt` is always the `idle_a` ankles.<br>- **Phone:** kept through moves (`c2/mv_2_teen_tube`, `c3/nm_0_adult_beret`: calls at 1.0 throughout). It is still put away as a seated texter rises:<br>&nbsp;&nbsp;- On the near model: 0.98 to 0 over about 0.6 s (`c/up_1`).<br>&nbsp;&nbsp;- On the far model: 0.87 to 0 in one frame (`r/r_2`, `r/r_6`, `r2/h_6`).<br>&nbsp;&nbsp;That is acceptable for someone getting off. | `an2.py`, `tw2.py`, `hip.py` over `r/`, `r2/`, `c/`, `c2/`, `c3/`; stills `c2/MV1t.png`, `c2/mv_2_teen_tube_z.png`, `r2/GL.png` |
| 2 | Landing at most 1.15 steps on, 1.35 m/s2; longest step 0.61-0.75 m within 5 % of steady; pelvis dip 2-14 cm; default set 9.52, LEG p10 7.4 | **True.**<br>- Viewer at 1.2 m/s, 14 people including review 47's worst three: the longest step is 0.44-0.75 m, each within 0.04 m of that person's steady stride (`lunge12.txt`).<br>- The pelvis dip is still 10-14 cm for `man_puffer`, `man_commuter` and `man_kilt_casual`, against 2-6 cm for the others. `man_commuter` is visibly bent-kneed at 0.9-1.1 s (`w/SC.png`). The fencer's lunge is gone; a crouch remains.<br>- Default instrument set: **9.52, LEG p10 7.4, SMO p10 7.4**, exactly as claimed (`m/def.log`). | `lunge12.txt`, `w/SC.png`, `m/def.log` |
| 3 | The stepped turn before sitting ends at the clip's feet; grounded slide while standing 0-7 cm for most, at most 17.6 cm | **True for the sit-down.**<br>- 6 turned sit-downs (Kelvinhall outer, Hillhead inner). The hand-back moves the leading foot 2-18 cm.<br>- Worst: `boy_kilt` (Hillhead) with 18 cm grounded plus 5 cm lifted, at 1.2 m/s, and the foot rotated 87 degrees in that 0.35 s. Next is `teen_girl` at 16 cm.<br>- Down from 35-39 cm in review 47. | `an2.py s/*.json`, `tw2.py s/*.json`, `s/H1.png` |
| 4 | Not changed: heel and pencil-skirt short steps, feet drawn together in the sit, faces, seated skirt shells, `sit_phone` knee, kilts, turn-aways, pole hands, phones in hair, hair caps, far holes | **Confirmed.**<br>- **Second instrument set** (`adult_heel_boots`, `adult_beret`, `ya_tube_heels`, `elder_woman_dress`, `adult_piper`, `girl_small`, `teen_skater`, `adult_harem`): overall 9.30; LEG 7.8 with **p10 5.4**; STR p10 7.0; SMO p10 7.3. Worst is `ya_tube_heels` at 1.6 m/s with 8.0: mid-stance knee 31 degrees and loading knee 40 degrees, a crouch.<br>- **Sit:** feet slide 11-21 cm; stance goes from 37-46 to 25-35 cm.<br>- **Faces:** unchanged (`f/n.png`, `f/s.png`).<br>- **Kilt:** `man_kilt_casual` still opens wide mid-stride on both models (`far/F0.png`, `far/F1.png`). | `m/set2.log`, `s/`, `f/`, `far/` |

## 2. Status of REVIEW_47's top ten

| # | REVIEW_47 item | Now |
|---|---|---|
| 1 | Standing up is a turntable spin | **Fixed for seated riders.** The same tween now drives standing-rider moves with the feet pinned: a 85-133 degree leg twist (new item 1). |
| 2 | Hand-back glide 35-39 cm | **Fixed for the sit-down** (2-18 cm). **Not fixed after a rise or a move**: 20-42 cm at about 1 m/s in 4 of 5 game rises and 5 of 7 moves (new item 2). |
| 3 | Walking LEG p10 | Default set LEG p10 7.4; heel set p10 5.4. Unchanged code for heels. |
| 4 | Lunge on setting off | **Fixed** (step length). A 10-14 cm pelvis dip remains for three men. |
| 5 | Feet drawn together in the sit | Unchanged: 11-21 cm. Its mirror image is now on the rise: 5-18 cm, stance widening. |
| 6 | Faces | Unchanged (`f/n.png`, `f/s.png`). |
| 7 | Seated skirt shells | Not changed (no asset change); not re-imaged. Review 47's `g/MS.png` and `g/S2.png` stand. |
| 8 | `sit_phone` knee | Not changed; not re-imaged. |
| 9 | Phone put away while the body spins | **Fixed as stated.** The spin is gone. The phone goes away during the plain rise. |
| 10 | Hair caps, kilt, turn-aways, pole hands, phones in hair | Unchanged where seen (`far/`, `f/`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (typical 8.8, worst 7.1)
- **Default set 9.52** (`m/def.log`). The lunge on setting off is gone (`lunge12.txt`).
- **Heel set 9.30**, with LEG p10 5.4. `ya_tube_heels` and `adult_heel_boots` walk with 30-40 degree bent knees at mid-stance and loading (`m/set2.log`).
- The start-up pelvis dip of 10-14 cm in three men reads as a crouch for half a second (`w/SC.png`).

### 3.2 Arms and hands: 8.42 (unchanged)
- Phones are kept through moves and stepped turns.
- Close standing riders seen from the aisle sometimes show arms held out 30-45 degrees (`eye/arms.png`). The camera was within 0.5 m with a wide lens, so I did not score it.

### 3.3 Faces: 8.36 (unchanged)
- 24 faces at 0.6 m, neutral and smiling, unchanged from review 47.
- `woman_midi` still frowns, and her smile under those brows reads as a smirk.
- Lopsided smiles: `girl_ginger`, `ya_smile_polo`, `ya_smile_dress`.
- `man_elder` has pale, blank eyes. `teen_hood` has heavy lips. `girl_small` has a puckered mouth. `elder_man_cap` has a dark scowl.
- Ragged fringe edges.

### 3.4 Standing, sitting, behaviour: 8.32 (typical 9.0, worst 7.3)
- **Good:** the seated rise, the sit-down turn and hand-back, phones kept, no seated glides, the lowest foot at 1.3 cm or more.
- **Worst tenth:**
  - The standing-move leg twist (85-133 degrees, scissored legs at 1.5 m).
  - The hand-back sweeps after rises and moves (20-42 cm).
  - The feet narrowing in the sit and widening in the rise.
- Standing moves happen to most standing boarders, so this is not a rare fault.

### 3.5 Range of people: 8.30 (unchanged)
- No change to the roster.
- The Cessnock census saw every outfit kind.

### 3.6 Clothing: 8.24 (unchanged)
- Census, Cessnock outer explore then ride, 214 s (`cen/ce.json`): no sample over 50 %. The highest was shorts at 50 % in a saloon.
- Kinds seen: trousers, shorts, skirts, highland dress, kilts, leggings, pleated skirts, trews.
- In a controlled move with a 0.4 m shift, `teen_tube`'s pleated skirt opened and showed skin as the legs scissored into a 20 cm squat (`c2/mv_2_teen_tube_z.png`). That was my test, not a seen game event, so I note it and do not score it.

### 3.7 Luggage: 8.32 (unchanged)
- The haggis walked on its lead about 1 m behind `adult_string_vest` on Hillhead's platform, legs moving, lead slack (`hg/PA1.png`). The execution is good.

### 3.8 Whole bodies: 8.26 (unchanged)
- Near and far models walking at 4 m are near-identical (`far/F0.png`, `far/F1.png`).
- No far model was within 6 m, and there were no duplicates or overlaps in the Cessnock run.

## 4. Top ten defects, in priority order

1. **A standing rider turned to a new facing has the hips spun over pinned feet.**
   - `rise()` on a standing rider (`stepIt`) keeps the eased yaw tween (0.5 s) while `settleGait` lets the gait plant the feet. The feet end 85-133 degrees off the hip line. Only then does `_stepTurn` step one foot.
   - At 1.5 m: scissored, knock-kneed legs, a foot kicked sideways (`c2/MV1t.png`, frames 05-07). With a translation the pelvis also drops 15-22 cm (`c2/mv_2_teen_tube_z.png`).
   - 5 of 7 game moves; 6 of 6 controlled.
   - Reproduce, in the game: `KIND=rise FR=300 NEARCAM=2.5 SIDE=1 node gsit.mjs "mode=ride&q=high&line=inner&station=hillhead" r2/h 1200 6`, then `python3 tw2.py r2/*.json`.
   - Reproduce, controlled: `node ctl2.mjs "mode=ride&q=high&line=inner&station=govan" c2/mv move 4 120`; `NOMOVE=1 node ctl3.mjs "mode=ride&q=high&line=outer&station=ibrox" c3/nm move 4 110`, then `python3 hip.py c3/*.json`.
   - Fix: do not tween the yaw for a stepped move. Hand the whole turn (and the translation) to `_stepTurn` / the gait.
2. **The hand-back sweep after a rise or a move: 20-42 cm along the floor at 0.8-1.7 m/s.**
   - The stepped turn ends while one foot is still 70-90 degrees off the body. The `w.done` timer releases it, and the clip swings it round.
   - Seen in 4 of 5 game seated rises (`ya_shorts`, `girl_leggings`, `woman_puffer`, `boy_small`) and in 5 of 7 moves. A pole clip makes it worse: `standAt` always uses the `idle_a` ankles.
   - Reproduce: `python3 an2.py r/*.json r2/*.json` (the R rows).
   - Fix: do not release until both feet are within about 25 degrees of the facing; use the target clip's ankles.
3. **Walking: heel and pencil-skirt crouch.** Heel set LEG p10 5.4; `ya_tube_heels` at 1.6 m/s has a 31 degree mid-stance knee.
   - Reproduce: `node tools/people_motion.mjs --people adult_heel_boots,adult_beret,ya_tube_heels,elder_woman_dress,adult_piper,girl_small,teen_skater,adult_harem --rec m/set2`.
4. **Feet slide during the sit (11-21 cm, narrowing) and during the plain rise (5-18 cm, widening, up to 0.88 m/s).** `an2.py` S rows in `s/` and `c/up_*`.
5. **Faces:** `woman_midi`'s frown and smirk; lopsided smiles on `girl_ginger`, `ya_smile_polo` and `ya_smile_dress`; `man_elder`'s blank eyes; `teen_hood`'s lips. `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0`; `f/n.png`, `f/s.png`.
6. **Seated skirt shells** (`woman_midi`'s bell, `woman_sash`'s sack, `ya_smile_dress`'s ring): carried over from review 47's `g/`.
7. **A 10-14 cm start-up crouch** for `man_puffer`, `man_commuter` and `man_kilt_casual` (`lunge12.txt`, `w/SC.png`).
8. **The stepped turn itself lets the body lead the planted foot by 90-140 degrees** before stepping, in sit-downs as well (`tw2.py s/*.json`). At normal distance it reads as a pivot with crossed knees (`r2/GL.png`). Real people step at about 45 degrees.
9. **`sit_phone` crossed-leg knee lift** (carried over; not re-imaged).
10. **Carried over:**
    - The kilt opening wide mid-stride (`far/F0.png`).
    - Hair caps and ragged hairlines.
    - Turn-aways, open pole hands, phones in long hair.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **Game-side camera views of the standing moves were often blocked by the car walls.** The clear leg stills come from controlled moves (`c2/`), which use the game's own `rise()` with a 110-120 degree turn. Two of those (`c/`, `c2/`) also added a 0.4 m shift, which exaggerates the squat.
- **I did not catch an alighting leaver taken by `sc.take()` in the middle of a stepped turn.** The code allows it: `p.tween` is null during `settleTurn`.
- **Not re-imaged this round:**
  - Seated skirt shells, the `sit_phone` knee, stair feet close up, pole hands at 1 m, children alone on platforms.
- **I deleted the instrument recordings** (`m/def`, `m/set2`) for disk space. Their summary and items output is in `m/def.log` and `m/set2.log`.
- **The arms held out** in `eye/arms.png` are unconfirmed.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Game rises and moves, 60 Hz, phases, twist | 12 events, Ibrox outer and Hillhead inner rides: 5 seated rises, 5 turned moves, 2 unturned moves | `r/`, `r2/` |
| Controlled seated rises | Partick outer: `boy_cap`, `teen_shorts_lad` (texter), `adult_runner`, `staff_hivis` | `c/up_*` |
| Controlled standing moves | Partick (`teen_skirt`); Govan inner (`elder_woman_dress`, `adult_beret`, `teen_tube` on a call, `teen_girl`); Ibrox turn-only with hips (`adult_beret` on a call, `ya_smile_polo` far model) | `c/`, `c2/`, `c3/` |
| Sit-downs, 60 Hz | 10 events (6 turned), Kelvinhall outer and Hillhead inner, including 3 texters | `s/` |
| Walking instrument | Default set; a second set of 8 (heels, kilt, child, harem) | `m/def.log`, `m/set2.log` |
| Starts from standstill | 14 people at 1.2 m/s; side stills of `man_commuter` | `lunge12.txt`, `w/SC.png` |
| Faces at 0.6 m, neutral and smiling | 24 people | `f/n.png`, `f/s.png` |
| Near against far model at 4 m | 12 people, including kilts, piper, haggis owner | `far/F0.png`, `far/F1.png` |
| Census, far model within 6 m, duplicates, overlaps, stairs | Cessnock outer explore then ride, 214 s | `cen/ce.json` |
| Player eye walking every car | St Enoch inner ride | `eye/SE.png`, `eye/arms.png` |
| Haggis walking in the game | Hillhead outer platform | `hg/PA1.png`, `hg/pa.log` |

Next round, look at:
- A leaver taken mid-turn.
- The seated skirts and the `sit_phone` knee re-imaged.
- Pole takers' hand-back to `stand_hold_pole`.
- Stair feet.

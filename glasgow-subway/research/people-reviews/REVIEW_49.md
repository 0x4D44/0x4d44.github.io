# Under Glasgow: independent review of the people (review 49)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `261164c8`. The only code change since review 48 (`git diff 2b295095 HEAD`) is 14 lines of `js/sim/people.js`:
- `rise()` on a standing rider (`stepIt`) now keeps the yaw (`tween.a1 = p.yaw`). The 0.9 s tween still moves the body to the new spot, with the gait on the legs. `_stepTurn` then turns them.
- `_settleTurnStep` releases only when both feet are within 0.45 rad (26 degrees) of the new facing. The fallbacks are `w.done > 2` or `w.t > 5`.
- The stepped turn runs at `STEP_TURN = 1.0` rad/s. Its target is clamped to 0.8 rad (46 degrees) past the mean of the feet.
- While turning, the gait's `standAt` is the pole clip's ankles when the rider is going to a pole.
- The gait is created for a standing rider with `settleGait` set.

No model, garment, face, bag or gait file changed. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review49/`. Running notes are in `NOTES.md`.

New tools this round:
- `ctl4.mjs`: review 48's `ctl3.mjs`, plus filters by bag kind (`BAG=trolley`) and by id (`ID=teen_tube`), and a log of the bag's position.
- `take.mjs`: logs every rise and every leaver taken off the train by `sc.take()`, with that rider's turn state.
- `plat.mjs`: logs how far the feet and the pelvis move for standing people on the platform and in the car over 6 s.
- `ovl.mjs`: logs riders closer than 0.3 m to each other in the train.

**Result: weighted mean 8.26 (8.255). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:**
  - The standing-move leg twist. Feet-to-body twist is now 44-56 degrees in the turn and 8-24 degrees at release, against 85-133 degrees in review 48.
  - The hand-back sweep. A foot now slides 1-8 cm in the 0.35 s hand-back, against 20-42 cm.
  - `teen_tube`'s skirt stays whole in a controlled move.
- **New, or newly found:**
  1. **Standing feet slide.** In the `idle_a` and `stand_hold_rail` clips, the pelvis is pinned in place and both feet slide together 8-12 cm side to side, about every 5 s. This is true for every standing person whose legs are not held by the gait: riders, and platform people who have not walked.
     - I measured it in 17 of 17 such people (pelvis range 0.0 cm).
     - It is an old fault. No earlier review reported it.
  2. **The stepped turn is slow, and turns over about 140 degrees end in a foot pop.**
     - The turn runs at 35-45 degrees per second.
     - Turns over about 140 degrees outlast the `w.t > 4` failsafe. The legs then snap from the gait back to the clip in one frame: the feet jump 4-8 cm.
  3. **A standing wheeled suitcase swings round its owner** on the floor, untouched, through the whole stepped turn (90 cm of travel in 3 s).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 8.9 | 7.6 | **8.38** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.3 | **8.20** |
| 7 | Luggage | 10 | 8.8 | 7.3 | **8.20** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.26** (8.255) |

0.20x8.12 + 0.10x8.42 + 0.10x8.32 + 0.10x8.38 + 0.10x8.30 + 0.15x8.20 + 0.10x8.20 + 0.15x8.26 = 1.624 + 0.842 + 0.832 + 0.838 + 0.830 + 1.230 + 0.820 + 1.239 = 8.255.

Changes against review 48 (8.271):
- **Behaviour +0.06.** The twist and the sweep are fixed. Marked down for the idle feet slide, the slow turn and the 4-8 cm foot pop on long turns.
- **Luggage -0.12.** The wheeled case swings round its owner during a stepped turn. It also tips into its towing pose and back in the first 0.4 s of a move.
- **Faces -0.04.** One more blank, twisted face found (`elder_shorts`).
- **Clothing -0.04.** One car was 62 % shorts (5 of 8 riders).
- **Every other category is unchanged.** No asset or gait code changed.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A moved standing rider is stepped to the new spot facing as they were, then stepped round at 1 rad/s, the body at most 46 degrees past the feet, released once both feet are within about 26 degrees; pole takers stand at the pole clip's feet. Twist 47-56 degrees in the turn, 3-26 at release; slide 2-12 cm per foot over 5 s; feet lift 68-99 cm; a 120-degree turn takes about 2.7 s; sit/rise twist at most 53 | **Mostly TRUE. The timing claim is false, and the change brings two new faults.**<br>- **Twist:** controlled moves (Govan inner, with a 0.39 m shift) and turns on the spot (Ibrox outer), 7 people at 120 degrees: 44-56 in the turn, 8-24 at release (`tw2.py c3/*.json c4/*.json`). `hip.py`, measured against the pelvis's own hip line, gives the same numbers, so the legs are not twisted.<br>- **Game:** 4 standing moves and 2 seated rises at Hillhead inner: turn 46-54, release 9-15. 5 turned sit-downs at Kelvinhall outer: turn 46-55, release 10-21.<br>- **Slides:** grounded slide in the turn 0.3-3.5 cm per bone. Hand-back 1-8 cm. Lifted travel in the turn 31-106 cm per bone (`an2.py`). The move's translation is stepped: 4-45 cm lifted, 2-13 cm grounded.<br>- **Time:** **a 120-degree turn takes 3.1-3.5 s plus a 0.35 s hand-back, not 2.7 s.** 150 degrees takes 3.7 s. In the game, sit-down turns of about 90 degrees took 1.75-2.55 s. At 35-45 degrees per second this reads as slow and laboured for a teenager or an adult: real people turn 120 degrees in 1-1.5 s.<br>- **Pole:** 3 controlled 150-degree moves to a pole. The release came at frame 293, past the `w.t > 4` limit, so `settleTurn` ended in the same frame and the legs snapped from the gait to the clip. The feet jumped 4.4-8.0 cm in 1/60 s (2.6-4.8 m/s) (`c6/pole_*.json`). In the Ibrox game log a pole move of 161 degrees happened (`adult_cyclist`, `take_ibrox.log`), so turns this long do occur.<br>- **Suitcase:** a standing case orbits its owner during the turn; see top-ten item 3. | `c3/`, `c4/`, `c5/`, `c6/`, `r/`, `s/`; stills `c3/MH.png`, `c3/TJ.png`, `r/EW.png`, `r/EWf.png` |
| 2 | Not changed: heel crouch, the 10-14 cm dip on setting off, feet slide in the sit and rise, faces, seated skirts, `sit_phone` knee, kilts, turn-aways, pole hands, phones in hair, hair caps, far holes | **Confirmed unchanged.**<br>- **Default instrument set:** 9.52, LEG p10 7.4, SMO p10 7.4 (`m/def.log`). `gait.js` is unchanged, so review 48's heel set (LEG p10 5.4) stands.<br>- **Sit:** feet slide 9-21 cm on the floor; stance narrows from 39-46 to 29-36 cm (5 game sit-downs).<br>- **Rise:** feet slide 8-13 cm; stance widens from 30-32 to 40-42 cm (`staff_woman`, `woman_dress`).<br>- **Faces:** unchanged (`f/N.png`, `f/S.png`).<br>- **Seated skirts:** re-imaged (`g/S1.png`, `g/S2.png`). Still shells. | as listed |
| 3 | (Review 48, unscored) `teen_tube`'s skirt split in a 0.4 m move; arms held out at 0.5 m | **The skirt is fixed:** the same controlled move at Partick inner keeps it whole, with no squat (`c6/TTs.png`). **Arms:** seen again only through a wide lens within 0.6 m (`eye/E1.png` #2, #3). Still unconfirmed and not scored. | |

## 2. Status of REVIEW_48's top ten

| # | REVIEW_48 item | Now |
|---|---|---|
| 1 | Standing rider's hips spun over pinned feet (85-133 degrees) | **Fixed.** 44-56 degrees in the turn, 8-24 at release. |
| 2 | Hand-back sweep 20-42 cm after rises and moves | **Fixed** for turns under about 140 degrees (1-8 cm). Longer turns now end in a one-frame 4-8 cm foot pop (new item 2). |
| 3 | Heel and pencil-skirt crouch (LEG p10 5.4) | Unchanged (no gait change). |
| 4 | Feet slide in the sit (11-21 cm) and in the rise (5-18 cm) | Unchanged: sit 9-21 cm, rise 8-13 cm. |
| 5 | Faces | Unchanged. `elder_shorts` added to the list. |
| 6 | Seated skirt shells | Unchanged (`g/S1.png`, `g/S2.png`): `woman_midi` dome, `ya_smile_dress` hem sheet between the knees, `woman_sash` bell, `boy_kilt`'s kilt up to a band. |
| 7 | 10-14 cm start-up dip for three men | Unchanged (no gait change). |
| 8 | Body leads the planted foot by 90-140 degrees in the stepped turn | **Fixed.** At most 56 degrees. The cost is a slow turn. |
| 9 | `sit_phone` knee lift | Not re-imaged. `adult_string_vest`'s `sit_phone` is legs-apart and clean (`g/S2.png` row 4). |
| 10 | Kilt mid-stride, hair caps, turn-aways, pole hands, phones in hair | Unchanged where seen (`far/F01.png`, `f/`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (typical 8.8, worst 7.1)
- Unchanged code. Default set 9.52 (`m/def.log`).
- Heel walkers still crouch (review 48's set 2: LEG p10 5.4).
- The three men still dip 10-14 cm when setting off.

### 3.2 Arms and hands: 8.42 (unchanged)
- Phones are kept through moves.
- Reaching for the pole is a 0.9 s clip blend. The hand moves 3-6 cm a frame for the first 0.2 s, a quick snatch, but in the right direction.
- The arms held out are still unconfirmed.

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- 24 faces at 0.6 m, neutral and smiling (`f/N.png`, `f/S.png`).
- Smiles are gentle and read as natural on `adult_smile_blouse`, `ya_bootcut` and `girl`.
- `ya_smile_polo` and `teen_hood` smirk lopsidedly. `woman_midi` frowns.
- `elder_shorts` has pale, blank eyes and a twisted mouth. `teen_ginger`'s nose and mouth are asymmetric. `elder_man_cap` scowls.
- Many neutral mouths turn down, so a resting crowd looks dour.

### 3.4 Standing, sitting, behaviour: 8.38 (typical 8.9, worst 7.6)
- **Good:**
  - Moves, rises and sit-downs are all stepped, with no scissored legs (`c3/MH.png`, `r/EWf.png`).
  - Leavers were never taken off the train mid-turn: 17 of 17 at Ibrox outer had finished turning (`take_ibrox.log`).
- **Typical case:** the feet slide in place while standing, 8-12 cm with the pelvis pinned. This affects most standing people (`r/SWAY.png`, `plat.log`). Watched for 3 s at 2-4 m, a standing person's shoes drift side to side together.
- **Worst tenth:**
  - The stepped turn at 35-45 degrees per second.
  - The 4-8 cm foot pop after turns over about 140 degrees.
  - The feet narrowing in the sit (9-21 cm) and widening in the rise.

### 3.5 Range of people: 8.30 (unchanged)

### 3.6 Clothing: 8.20 (typical 8.8, worst 7.3)
- **Census:**
  - Buchanan inner, explore then ride, 295 s: the most was trousers at 57 %, in one platform sample of 7 people.
  - Partick outer, explore then ride, 306 s: shorts were 62 % of one car (5 of 8 riders), in 2 of 7 car samples. That breaks the rubric's "no more than half".
- Every garment kind was seen.
- The seated skirt shells are unchanged. `teen_tube`'s skirt is now whole.

### 3.7 Luggage: 8.20 (typical 8.8, worst 7.3)
- `ya_smile_polo` with a wheeled case, controlled 120-degree turn on the spot (Ibrox outer): the case stands on the floor beside her and swings round her through the 3 s turn. It travels 228 cm along an arc, 90 cm end to end, and no hand is on it (`c5/TRs.png`, `c5/tr_ibrox_0_ya_smile_polo.json`).
- In the first 0.4 s, while she stands still, it also tips back into its towing pose, lifts up to 6 cm and drops back. Its fastest frame moves 2.8 m/s.
- The cause: `bags.js` places a standing case at a fixed spot in the owner's own frame. The tow weight is the gait's upper-body weight, which rises when the gait is created for the move.
- `ya_tee_jeans`'s case does the same in a move with a shift (`c3/TJ.png`).
- The haggis is good: it trails on a slack lead and waits at the seated owner's feet (`hg/H.png`, `g/S2.png`).

### 3.8 Whole bodies: 8.26 (unchanged)
- Near and far models at 4 m are near-identical (`far/F01.png`).
- In two census rides, no far model came within 6 m and there were no duplicates.
- One overlap: two seated riders 7 cm apart for 2.5 s in the passing outer train, 23 m from the camera (`cen/bu.json`, `woman_elder` and `ya_ginger_braid`). A 700 s watch at Buchanan outer did not reproduce it (`ovl_bu.log`). Noted, not marked down.

## 4. Top ten defects, in priority order

1. **Standing feet slide with the pelvis pinned.**
   - The `idle_a`, `idle_b` and `stand_hold_*` clips animate only the pelvis's rotation (about ±2 degrees), never its translation. The legs swing like a pendulum under hips that do not move. Both shoes slide 8-12 cm side to side together, at up to about 0.1 m/s, every 5 s or so.
   - Affected: every static rider and every platform person who has not walked (gait `wL` 0). I measured 17 of 17. Hips moving over planted feet is how people shift their weight.
   - Reproduce: `node plat.mjs "mode=explore&q=high&line=inner&station=cowcaddens"`. The A rows of any `ctl3`/`gsit` log show `foot range 8-12 cm, pelvis 0.0`. Stills: `r/SWAY.png`.
   - Fix: plant the feet (foot IK, or the gait's standing solve) for clip-legged standers, or move the pelvis rather than the feet.
2. **The stepped turn is slow, and long turns end in a foot pop.**
   - Speed: 120 degrees takes 3.1-3.5 s, 150 degrees 3.7 s, sit-down turns of about 90 degrees 1.75-2.55 s. That is 35-45 degrees per second against 90-120 for people.
   - The pop: with turns this slow, any turn over about 140 degrees outlasts `w.t > 4` in the second clause of `_settleTurnStep`. The gait is dropped in the same frame as it is released, and the feet jump 4.4-8.0 cm in one frame (`c6/pole_*`).
   - Reproduce: `FR=360 node ctl4.mjs "mode=ride&q=high&line=inner&station=govan" c6/pole pole 3 150`, then `python3 an2.py c6/pole_*.json` (look for gv max A 2-5 m/s, at frame 293).
   - Fix: faster steps (2 rad/s, with the body still clamped to its feet), and time the failsafe from the release, not from the start of the turn.
3. **A standing wheeled suitcase orbits its owner during a stepped turn** (90 cm, untouched), and tips up and back at the start of a move.
   - Reproduce: `NOMOVE=1 BAG=trolley FR=300 node ctl4.mjs "mode=ride&q=high&line=outer&station=ibrox" c5/tr move 2 120`; `c5/TRs.png`.
   - Fix: leave a standing case where it is on the car floor while its owner turns, then pick it up again. Keep `tow` at 0 unless the owner is walking.
4. **Walking: heel and pencil-skirt crouch**, LEG p10 5.4 (review 48 set 2; code unchanged).
5. **Feet slide during the sit (9-21 cm, stance narrowing) and the plain rise (8-13 cm, widening).** `python3 an2.py s/*.json r/h_3*.json r/h_7*.json` (S rows).
6. **Faces:**
   - `woman_midi`'s frown.
   - `ya_smile_polo`'s and `teen_hood`'s lopsided smirks.
   - `elder_shorts`'s blank eyes and twisted mouth, and `man_elder`'s pale eyes.
   - Generally dour resting mouths.
   - Reproduce: `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0` (ids in `f/n.log`); `f/N.png`, `f/S.png`.
7. **Seated skirt shells:** `woman_midi`'s dome, `ya_smile_dress`'s hem sheet between the knees, `woman_sash`'s bell, `boy_kilt`'s kilt riding to a band. `node gseat.mjs "mode=ride&q=high&line=outer&station=buchanan" g/a <ids>`; `g/S1.png`, `g/S2.png`.
8. **A 10-14 cm start-up dip** for `man_puffer`, `man_commuter` and `man_kilt_casual` (unchanged).
9. **Garment mix in small cars:** 5 of 8 riders in shorts (62 %), in 2 of 7 car samples. `node gp8.mjs "mode=explore&q=high&line=outer&station=partick" cen/pa 260 80; python3 cen4.py cen/pa.json`.
10. **Carried over, and minor:**
    - The kilt opening mid-stride.
    - Hair caps and ragged fringes.
    - Pole hands, turn-aways, phones in long hair.
    - A one-frame 4 cm foot pop when `rise` is called on a rider who is still turning (`r/h_2_rise_man_longcoat`).
    - The single seat overlap in `cen/bu.json`.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs. I judged the slow turn from its timing; I could not see it play.
- **Not re-imaged this round:**
  - The `sit_phone` crossed-knee clip (no crossed-leg `sit_phone` came up).
  - Stair feet close up. The census logged 35 stair walks with no stalls.
  - Children alone on platforms close up.
- **Two people in one seat** was seen once, far off and in another train, and not reproduced.
- **The arms held out** were seen only with a wide lens within 0.6 m.
- **I did not see a 150-degree pole move in the game**, only one in the Ibrox rise log (161 degrees) without bones. The foot pop comes from controlled moves that use the game's own `rise()`.
- **I deleted the instrument recordings** (`m/def`) for disk space. The scores are in `m/def.log`.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Controlled standing moves (0.39 m + 120 degrees) | Govan inner: `ya_tee_jeans` (with a wheeled case), `man_longcoat`, `man_highland` (on a call) | `c3/`, `c3/MH.png`, `c3/TJ.png` |
| Controlled turns on the spot, 120 degrees | Ibrox outer: `elder_woman_coat` (texter), `ya_ginger_lad`, `ya_tube_heels`, `teen_skirt` (texter); `ya_smile_polo` with a wheeled case | `c4/`, `c5/` |
| Controlled pole moves, 150 degrees | Govan inner: `elder_woman_dress`, `teen_girl`, `adult_beret` | `c6/pole_*` |
| `teen_tube`'s skirt in a move | Partick inner | `c6/TTs.png` |
| Game rises and moves | Hillhead inner, 7 events: 2 standing moves, 2 seated rises, 3 without a turn or already turning | `r/`, `r/EW.png`, `r/SWAY.png` |
| Game sit-downs | Kelvinhall outer, 7 events (5 turned), including a texter | `s/` |
| Leavers and rises over time | Ibrox outer ride, 650 s, 17 leavers | `take_ibrox.log` |
| Standing feet on the platform and in a car | Cowcaddens inner, 16 people | `plat.log` |
| Walking instrument | Default set | `m/def.log` |
| Faces at 0.6 m, neutral and smiling | 24 people (8 flagged before, 16 drawn at random) | `f/N.png`, `f/S.png` |
| Seated skirted people in the game's seats (`_canSit`) | `woman_dress`, `girl_small`, `woman_sash`, `girl_school_kilt`, `boy_kilt`, `woman_midi`, `ya_smile_dress` (`adult_piper` cannot sit anywhere), plus `adult_string_vest` with the haggis | `g/S1.png`, `g/S2.png` |
| Near against far model at 4 m | 12 people, including kilts, minis, the case owner and the haggis owner | `far/F01.png` |
| Census, far model within 6 m, duplicates, overlaps, stairs | Buchanan inner and Partick outer, explore then ride with boarding, 295 s and 306 s | `cen/bu.json`, `cen/pa.json` |
| Overlap watch | Buchanan outer ride, 700 s | `ovl_bu.log` |
| Player eye walking every car | Govan outer ride | `eye/E0.png` - `eye/E2.png` |
| Haggis walking | Hillhead outer platform | `hg/H.png`, `hg/hh.log` |

Next round, look at:
- Clip-legged standers' feet: a `plat.mjs` run after any fix.
- A long pole turn in the game, with bones logged.
- Wheeled-case owners turned and moved in the game.
- The `sit_phone` crossed knee.
- Stair feet close up.

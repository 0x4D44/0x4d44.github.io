# Under Glasgow: independent review of the people (review 50)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `83671cd6`. The only code change since review 49 (`git diff 261164c8 HEAD -- glasgow-subway/js`) is in `js/sim/people.js`:
- `STEP_TURN` 1.0 -> 1.6 rad/s. `_settleTurnStep` releases at `w.t > 7` (was 5) and drops the gait at `w.t > 9` (was 4).
- A static person whose state is `stand` or `pole` (or who already has a gait) now runs `_gaitStep` every animated frame. `_gaitStep` creates a gait for anyone `standing`, and sets `standAt` to the ankles of the clip they are in.
- A gait made for someone not walking starts with `hold = GAIT_TAIL`, so its upper body does not blend in.

No model, garment, face, bag or `gait.js` file changed. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review50/`. Running notes are in `NOTES.md`.

New tools this round:
- `stand.mjs <query> <out.json> [secs] [warm] [gait 0|1] [moving 0|1]`: every standing person and pole holder within 20 m of the camera, on the platform and in each car. It logs both feet and the pelvis in the parent (car) frame at 60 Hz, knee flexion, clips, gait weight and gait swings. `moving=1` waits until the train is above 15 km/h. Unlike review 49's `plat.mjs`, it includes the `pole` state.
- `sv.mjs`: front and side stills of the nearest standing people, with the gait on and then off (clip legs).

**Result: weighted mean 8.25 (8.253). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:**
  - Standing feet slide, for people in the `stand` state (platform and car). Feet move 0-0.2 cm over 20 s, against 8-12 cm.
  - The one-frame foot pop after long turns.
  - The wheeled case tipping into its towing pose at the start of a move.
- **Not fixed, though claimed:**
  - **Pole and rail holders' feet still slide.** Their state is `pole`, and `_gaitStep`'s `standing` test does not include it. They are 4 of the 7 standing riders near the camera in a moving car. Each foot slides 50-100 cm along the floor in 20 s, within an 8-11 cm range.
  - **The stepped turn is barely quicker.** 120 degrees still takes 3.1 s, and a game sit-down turn of about 95 degrees takes 2.3-2.6 s.
- **New regression:** in a **seated rise that moves the body sideways out of the seat**, one foot now skates 24-39 cm along the floor in about 0.3 s, at up to 2.6 m/s. This happened in 4 of 4 such rises. The new branch gives the rising person a gait during the rise tween. In review 49 the same rise (`woman_dress`) slid 8-13 cm at 0.37 m/s.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.3 | **8.32** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.3 | **8.20** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.25** (8.253) |

0.20x8.12 + 0.10x8.42 + 0.10x8.32 + 0.10x8.32 + 0.10x8.30 + 0.15x8.20 + 0.10x8.24 + 0.15x8.26 = 1.624 + 0.842 + 0.832 + 0.832 + 0.830 + 1.230 + 0.824 + 1.239 = 8.253.

Changes against review 49 (8.255):
- **Behaviour -0.06.**
  - Typical +0.1: people in the `stand` state now stand still on their feet.
  - Worst tenth -0.3:
    - The 24-39 cm, 2.6 m/s foot skate in seated rises is a worse fault, and a more frequent one, than the 4-8 cm pop it replaced.
    - Pole holders still slide.
    - The turn is still slow.
- **Luggage +0.04.** The tip-up is gone. The case still orbits its owner in a turn.
- **Every other category is unchanged.** No asset or `gait.js` change. The walking instrument reads the same.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Anyone standing near enough to be animated (platform people and riders, standing or at a pole) has the gait on the legs. Feet stay put while the clip sways the body, and step back if they drift. 0-0.2 cm over 6 s. No upper-body blend for a standing gait | **TRUE for the `stand` state. FALSE for pole and rail holders. The change also brings a regression in seated rises.**<br>- **`stand` state:** at Cowcaddens inner, 10 platform standers and 5 car standers, 20 s: foot range 0-0.2 cm, pelvis 0. At Buchanan outer, in a moving train, 11 platform and 3 car standers: 0-0.2 cm. One exception: changing clip (for example `idle_a` to `phone_stand`) moves the clip's ankles, and the foot slides 4-8 cm with no step (`teen_skater` 7.7 cm, `teen_tube` 3.6 cm).<br>- **Pole holders:** `wL` is 0 for every rider in the `pole` state. At Cowcaddens (`teen_girl`, `teen_skirt` on `stand_hold_pole`, `woman_coat` on `stand_hold_rail`), feet range 8.5-9.6 cm. In the moving Buchanan car (`teen_skirt`, `woman_coat`, `man_kilt_casual`, `adult_fisherman_leggings`), feet range 8-11 cm and the grounded slide is 50-100 cm per foot in 20 s (`st_bu_ride.json`). The cause: `_gaitStep`'s `standing` test is `state === 'stand'` (or paused, or `settleGait`), so a static rider at a pole returns early. After a controlled 150-degree pole move, the gait lets go (`wL` 1 to 0 over 0.35 s) and both shoes then slide 6-7 cm side to side together on `stand_hold_rail` (`c1/pole_0_man_highland.json`, frames 320-470).<br>- **Legs:** the gait's standing legs look like the clip's. In front and side views at 2.6 m, gait on against gait off, the legs are near identical and no one looks stiff (`sv/SV1.png`). Measured: the clip bends both knees 9-11 degrees. The gait holds one knee at 4 degrees, nearly straight, and lets the other vary 4-15 degrees. It reads as weight on one leg, which is natural.<br>- **Upper-body blend:** confirmed off. A standing wheeled case no longer lifts at the start of a move (bag height 0-1.1 cm; it was up to 6 cm).<br>- **Regression:** a seated rise moved sideways by its tween now gets a gait in its first frames (`wL` 0.58 to 1 in 0.1 s). The planted foot is then dragged across the floor. Measured 4 of 4 times:<br>&nbsp;&nbsp;- `woman_dress` (Hillhead inner): 39 cm. In review 49 the same rise slid 12.6 cm at 0.37 m/s.<br>&nbsp;&nbsp;- `adult_baggy_knit`: 24-28 cm.<br>&nbsp;&nbsp;- `elder_shorts` (Govan outer): 37.6 cm at 2.49 m/s.<br>&nbsp;&nbsp;- `ya_knit` (Govan outer): 37.5 cm at 2.60 m/s.<br>All of this is grounded travel (y within 1.5 cm of the floor), most of it in 0.33 s. `r/ES.png` (3 m, side view): the near foot is dragged across on its toe while the legs scissor. Rises with no tween are clean (`girl`, `boy_cap`, `adult_tattoo_muscle`). | `st_cc.json`, `st_cc_g0.json`, `st_bu_ride.json`, `sv/SV1.png`, `c1/`, `c5/`, `r/h_*.json`, `r/g_*.json`, `r/WD.png`, `r/ES.png` |
| 2 | Stepped turns at 1.6 rad/s (were 1.0). The failsafe now waits 9 s | **Failsafe TRUE. Speed: the constant changed, but turns are barely quicker.**<br>- **Failsafe:** 3 controlled 150-degree pole moves at Govan inner. The gait lets go over 21 frames, with a top foot speed in the release of 0.15-0.36 m/s and no one-frame pop. A 174-degree game rise (`adult_cyclist`) is also clean.<br>- **Speed:** 4 controlled 120-degree turns on the spot at Ibrox outer: the turn phase is 187-190 frames, 3.1-3.2 s (review 49: 3.1-3.5 s). The yaw does 43 degrees in the first 0.6 s, then about 38 degrees per second, held back by the clamp to the feet. It reaches its target at 2.55 s, and the release follows 0.5 s later. 150-degree pole moves take 4.0 s. Game sit-down turns of 91-103 degrees take 2.27-2.62 s (review 49: 1.75-2.55 s). A 174-degree rise takes 4.47 s. | `c2/`, `c1/`, `s/k_*`, `r/h_1` |
| 3 | Not changed: heel crouch, start-up dip, sit/rise slides, case orbit, faces, seated skirts, garment mix, kilts, hair caps, pole hands, turn-aways, phones in hair | **Confirmed unchanged, except that the rise slide got worse (above).**<br>- Default walking set 9.51, LEG p10 7.4, SMO p10 7.4 (`m/def.log`).<br>- Sit-down slide: grounded 14-17 cm, stance 37-42 to 29-34 cm (`s/`).<br>- The case orbits its owner: 113 cm of path, 93 cm end to end, in a 120-degree turn (`c5/tr_0_woman_mini.json`).<br>- Faces as before (`f/N.png`, `f/S.png`).<br>- A platform sample of 4 in 6 in shorts (67 %) (`cen/se.json`). | as listed |

## 2. Status of REVIEW_49's top ten

| # | REVIEW_49 item | Now |
|---|---|---|
| 1 | Standing feet slide with the pelvis pinned | **Fixed for the `stand` state. Not fixed for `pole`** (8-11 cm, 50-100 cm of grounded travel in 20 s in a moving car). Clip changes slide a foot 4-8 cm. |
| 2 | Slow stepped turn, and a foot pop on long turns | **Pop fixed. Turn still slow** (120 degrees in 3.1 s; game turns of about 95 degrees in 2.3-2.6 s). |
| 3 | Standing wheeled case orbits, and tips up | **Tip-up fixed. Orbit unchanged** (93 cm end to end). |
| 4 | Heel and pencil-skirt crouch | Unchanged. |
| 5 | Feet slide in the sit (9-21 cm) and the rise (8-13 cm) | **Sit unchanged (14-17 cm). Rise worse: 24-39 cm at 2.5-2.6 m/s** wherever the rise has a sideways tween. |
| 6 | Faces | Unchanged. |
| 7 | Seated skirt shells | Unchanged (no asset change; not re-imaged). |
| 8 | 10-14 cm start-up dip for three men | Unchanged. |
| 9 | Garment mix in small groups | One platform sample within 15 m was 67 % shorts (4 of 6). Cars were at most 44 %. |
| 10 | Kilt mid-stride, hair caps, turn-aways, pole hands, phones in hair | Unchanged. The ragged fringes and hairlines are still seen (`f/N.png`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- `gait.js` is unchanged.
- The instrument gives 9.51 with LEG p10 and SMO p10 at 7.4.
- The heel crouch and the start-up dip stand.

### 3.2 Arms and hands: 8.42 (unchanged)
- Standing arms are unchanged: the upper-body blend is now off for a standing gait.
- Phones and poles were held as before (`eye/E0.png`).

### 3.3 Faces: 8.32 (unchanged)
- 24 faces at 0.6 m, neutral and smiling. 20 were new picks (random seed 50); 4 were flagged before.
- Smiles are gentle and mostly read as natural.
- Faults:
  - `teen_hood` and `ya_smile_polo` smirk lopsidedly.
  - `woman_midi` frowns and has a ragged fringe.
  - `elder_shorts` has pale, blank eyes.
  - `adult_cap_shorts` scowls, and his cap has a notch.
  - Hairlines are ragged on `ya_tee_jeans`, `teen_cutoffs`, `girl_school_kilt` and `teen_hood`.
  - Neutral mouths are dour.

### 3.4 Standing, sitting, behaviour: 8.32 (typical 9.0, worst tenth 7.3)
- **Typical:** platform waiters and standing riders now stand with their feet still, and the legs look natural (`sv/SV1.png`). This is a real gain.
- **Worst tenth:**
  - **Seated rises with a sideways tween.** A foot skates 24-39 cm in a third of a second, so the legs scissor at the moment of standing up. This happened in 4 of 4 such rises, and it is visible at 3 m (`r/ES.png`).
  - Pole and rail holders still shuffle both shoes 8-11 cm side to side. In a moving car they are the majority of the standing riders near the player.
  - Turns run at about 38 degrees per second.
  - The sit-down slide.

### 3.5 Range of people: 8.30 (unchanged)
- 99 characters: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff. A spread of skin tones (`f/N.png`).

### 3.6 Clothing: 8.20 (unchanged)
- St Enoch inner, explore then ride, 365 s. Every garment kind was seen: trousers, shorts, skirts, leggings, kilts, trews and a highland dress.
- One platform sample within 15 m was 67 % shorts. Cars were at most 44 % (trousers).

### 3.7 Luggage: 8.24 (typical 8.8, worst tenth 7.4)
- The tip-up is fixed.
- The standing case still swings 93 cm round its owner during a turn, untouched.

### 3.8 Whole bodies: 8.26 (unchanged)
- In the St Enoch census, no far model came within 6 m, there were no duplicates and no overlaps, and 23 people walked the stairs with no stall.

## 4. Top ten defects, in priority order

1. **A seated rise with a sideways tween skates a foot 24-39 cm along the floor at up to 2.6 m/s** (new; 4 of 4).
   - The new `else if (gaitOn && (state === 'stand' || ...)) _gaitStep` branch gives a static rider a gait as soon as `rise()` sets the state to `stand`, while the 0.9 s tween is still carrying the body out of the seat.
   - Reproduce: `NEARCAM=3 KIND=rise SIDE=1 FR=300 node gsit.mjs "mode=ride&q=high&line=outer&station=govan" r/g 360 6`, then `python3 an2.py r/g_*.json` (S rows: `Sg` 37 cm, `gv max S` 2.5).
   - Stills: `r/ES.png`, `r/WD.png`.
   - Fix: don't run the standing gait during a seated rise's tween (or start it planted at the tween's end spot, as the moves do).
2. **Pole and rail holders' feet still slide** (8-11 cm, 50-100 cm of grounded travel in 20 s in a moving car).
   - Cause: `standing` in `_gaitStep` excludes `state === 'pole'`. After a pole move, the gait lets go and the shuffle resumes.
   - Reproduce: `node stand.mjs "mode=ride&q=high&line=outer&station=buchanan" x.json 20 20 1 1` (look at the `sal_` rows with `st` `pole`, `wL` 0).
3. **The stepped turn is still slow.** 120 degrees takes 3.1 s, and a game sit-down turn of about 95 degrees takes 2.3-2.6 s.
   - The 1.6 rad/s rate only shows in the first 0.6 s. After that the clamp to the feet holds it to about 38 degrees per second.
   - Reproduce: `NOMOVE=1 FR=300 node ctl4.mjs "mode=ride&q=high&line=outer&station=ibrox" c2/turn move 4 120`. Read the yaw over time from `c2/*.json`.
   - Fix: faster or longer steps in the turn, not a faster yaw.
4. **A standing wheeled case orbits its owner in a turn** (93 cm end to end, untouched).
   - Reproduce: `NOMOVE=1 BAG=trolley FR=300 node ctl4.mjs "mode=ride&q=high&line=outer&station=ibrox" c5/tr move 2 120`.
5. **Heel and pencil-skirt crouch** (LEG p10 5.4 in review 48's set; default set LEG p10 7.4, `m/def.log`).
6. **Feet slide in the sit:** 14-17 cm, with the stance narrowing from 37-42 to 29-34 cm (`s/`).
7. **Faces:** lopsided smirks (`teen_hood`, `ya_smile_polo`), `woman_midi`'s frown, `elder_shorts`'s blank eyes, `adult_cap_shorts`'s scowl, and dour resting mouths (`f/N.png`, `f/S.png`).
8. **Seated skirt shells:** `woman_midi`'s dome, `ya_smile_dress`'s hem sheet, `woman_sash`'s bell, `boy_kilt`'s band (review 49 `g/S1.png`, `g/S2.png`; no asset change).
9. **A 10-14 cm start-up dip** for `man_puffer`, `man_commuter` and `man_kilt_casual`. A clip change while standing slides a foot 4-8 cm with no step.
10. **Minor and carried over:**
    - Garment clumps in small groups (67 % shorts once on a platform).
    - The kilt opening mid-stride.
    - Ragged hairlines and fringes.
    - Pole hands, turn-aways, phones in long hair.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **Not re-imaged this round:**
  - Seated skirts, the `sit_phone` crossed knee, the haggis and children close up. None of their assets or code changed.
  - Near against far models.
- **Some `sv.mjs` cameras were blocked by walls or benches**, so I have side and front stills for only 4 `stand`-state people. I have no stills of a pole holder's sliding shoes this round; that finding comes from bone logs only.
- **The walking-instrument recording was cut short** by a container restart. The analysis ran on what was recorded, which included the whole default set's score line.
- **Platform benches:** I did not check whether rises from a platform bench also skate.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Standing feet, gait on, 20 s | Cowcaddens inner explore: 15 platform people (10 stayed standing), 8 in a car (3 at poles) | `st_cc.json` |
| Standing legs with the gait off (clip baseline) | Cowcaddens inner, 15 people | `st_cc_g0.json` |
| Standing feet in a moving train | Buchanan outer ride: 11 platform people, 7 car riders (4 at poles) | `st_bu_ride.json` |
| Gait-on against clip stills, front and side | Buchanan outer: `staff_hivis`, `teen_tube`, `sum_chino_shorts_m`, `adult_cyclist` (with a case) | `sv/SV1.png` |
| Controlled turns on the spot, 120 degrees | Ibrox outer: `woman_mini`, `teen_runner` (texter), `man_longcoat`, `elder_woman_dress` | `c2/` |
| Controlled pole moves, 150 degrees | Govan inner: `man_highland`, `man_puffer`, `adult_cyclist` | `c1/` |
| Wheeled case in a turn | Ibrox outer: `woman_mini` | `c5/` |
| Game sit-downs | Kelvinhall outer: `teen_skater`, `woman_student`, `teen_hippy` | `s/` |
| Game rises | Hillhead inner, 5 (`adult_cyclist`, `adult_casual5`, `woman_dress`, `adult_tattoo_muscle`, `adult_baggy_knit`). Govan outer, 6 (`adult_oxford_shirt`, `elder_shorts`, `girl`, `woman_midi`, `ya_knit`, `boy_cap`) | `r/`, `r/WD.png`, `r/ES.png` |
| Faces at 0.6 m, neutral and smiling | 24 people | `f/N.png`, `f/S.png` |
| Census, far models, duplicates, overlaps, stairs | St Enoch inner, explore then ride with a boarding, 365 s | `cen/se.json` |
| Player eye walking the cars | Partick inner ride | `eye/E0.png` |
| Walking instrument | Default set | `m/def.log` |

Next round, look at:
- Seated rises after a fix.
- Pole holders' feet in a moving car.
- Platform-bench rises.
- A turn's angular speed in the game.

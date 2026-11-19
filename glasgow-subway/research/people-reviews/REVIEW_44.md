# Under Glasgow: independent review of the people (review 44)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `30c83495`. The people commits since review 43 are `63d0921e` and `30c83495` (read-only `git show`):
- `63d0921e`, `js/sim/people.js`:
  - `_seatMorph`: `on = state === 'sit'` (no longer waits for `!p.tween`). The weight moves in over 1.0 s and out over 0.5 s.
  - `settle()`: the sit pose fades in over `min(1.0, dur)` instead of 0.5 s.
  - `_canSit`: `woman_coat`, `man_kilt_casual` and `man_highland` are added to the stand-only list.
- `30c83495`, `js/sim/haggis.js`: the lead is two segments, with the middle let down by `0.3 x sqrt(1.25^2 - L^2)`.
- No model, face, gait or bag file changed.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review44/`. Running notes are in `NOTES.md`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.19 (8.185). Gate NOT met.** The mean is not above 9, and Behaviour (7.88) is below 8.

- **The three bad seated garments are off the seats.** In three rides `woman_coat`, `man_kilt_casual` and `man_highland` only stood or held a rail. Claim 3 is true.
- **Sitting down is broken in the game.** It was already faulty, and the change made it worse.
  - **What goes wrong.** As soon as `settle()` runs, `_place` sets the body's height to the seated height and closes the gap by 25 % per frame. At 60 fps the hips are at seat height within about 0.25 s. The legs, though, now take a full second to bend.
  - **Far-model boarders** (the model they are added with) sink with straight legs. Their feet go 22-28 cm through the car floor for about 0.7 s. One man went in to the shins, and his holdall sank with him so that only its handles showed.
  - **Near boarders** are swapped to the full model on the first frame. The swap replays the clip with no crossfade, so the sit pose and the seated drape arrive in one frame. They then sit in mid-air 0.5 m in front of the seat and glide back onto it over a second.
  - **Every sit-down I logged at 60 Hz in the game was one of the two (8 of 8).**
  - **Review 43 missed this.** Its game probes ticked in 0.1 s steps, which slows the 25 %-per-frame height blend about sixfold.
- **Standing up floats.** For about 0.4 s the body rises with the knees still bent and the feet 10-12 cm off the floor. This code did not change; it was not reported before.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.6 | **8.32** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 8.8 | 6.5 | **7.88** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.3 | **8.20** |
| 8 | Whole bodies | 15 | 8.7 | 7.2 | **8.10** |
| | **Weighted mean** | 100 | | | **8.19** (8.185) |

0.20x8.16 + 0.10x8.32 + 0.10x8.32 + 0.10x7.88 + 0.10x8.30 + 0.15x8.24 + 0.10x8.20 + 0.15x8.10 = 1.632 + 0.832 + 0.832 + 0.788 + 0.830 + 1.236 + 0.820 + 1.215 = 8.185.

Changes against review 43 (8.237):
- **Behaviour -0.68.** Measured at the game's real frame rate, the sit-down sinks the far model through the floor and seats the near model on air. The rise floats.
- **Clothing +0.24.** The coat split and the kilt windows are off the seats. `ya_smile_dress`'s hem hoop under the seat and the kilt stride gap remain.
- **Luggage -0.16.** A holdall sinks into the floor with its owner's legs during a sit-down.
- **Arms -0.04.** For about a second after a near boarder's sit-down snaps in, the hands are raised with no phone showing.
- **Walking, Faces, Range and Whole bodies are unchanged.** Whole bodies gains from the seated skin-through being gone and loses the same to legs vanishing into the floor.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The seated drape starts when the person starts to sit and comes in over the 1 s settle; out over the 0.5 s rise | **True in the viewer and for far-model riders. False for near boarders.**<br>- **In the viewer** `seatW` goes 0.1, 0.2 ... 1.0 over the settle and 0.8 ... 0 over the rise (`tr5/s.log`).<br>- **For near boarders** the lod-to-full swap rebuilds the model. `_seatMorph` then sets `p.seatW = on` on the new model, so the drape is at full weight in the first frame. `ya_smile_dress` had `seatW` 1 from the first logged frame while still 0.53 m from her seat (`s3/log.txt`).<br>- **For the near model that is the one players see**, then, the drape snaps on. It is matched to a body that has also snapped into the sit, so it does not show as a cloth fault. | `tr5/s.log`, `s3/log.txt` |
| 2 | The sit pose blends in over the settle (1 s), so the body should no longer squat in the air ahead of the seat | **False. It made the sit-down worse.**<br>- **The height leads the pose.** `_place` moves the root towards the seated height at 25 % a frame from the first frame of the sit, and the pose now bends the legs over 1 s.<br>- **Viewer (60 Hz, she backs onto a box, floor drawn).** The hips are at seat height by 0.3 s while still 0.3 m in front of the seat spot. The legs are nearly straight, so the shins go through the floor from 0.1 to 0.7 s. The foot bone is 22-26 cm below the floor (`tr5/DRESS.png`, `tr5/s.log`). With review 43's 0.5 s fade forced, the same probe has the feet below the floor for 0-0.4 s, at most 20 cm (`tr5o/s.log`). The change doubled how long the feet are under the floor.<br>- **Game, far model** (`adult_leggings_knit`, `woman_puffer`, `ya_tee_jeans`, `man_student`): the lowest foot or toe bone is 22-28 cm below the car floor from 0.2 to 0.7 s (`s1/log.txt`, `s3/log.txt`). `man_student` is cut off at the shins, with his holdall sunk to its handles (`s3/STU.png`, `s3/SETs.png`).<br>- **Game, near model** (`teen_ginger`, `adult_camisole`, `ya_ginger_long`, `ya_smile_dress`): the sit pose is at weight 1.0 on the first frame and the pelvis is already at its final height above the seat, 0.53 m out. They sit on air in the aisle and glide back over 1 s (`s2/SET2.png` is the clearest, `s2/SET1.png`, `s3/SETs.png`).<br>- **Why the near model snaps:** each boarder is added on the far model (`lodAtCall true`, `s3/log.txt`). `_swapLod` then replays the clip with fade 0 (people.js:623). | as listed |
| 3 | `woman_coat`, `man_kilt_casual` and `man_highland` stand again; 8 of the 16 skirted people sit | **True.**<br>- `_canSit` is true for exactly `woman_dress`, `woman_midi`, `ya_smile_dress`, `woman_sash`, `girl_small`, `girl_school_kilt`, `boy_kilt` and `adult_piper` (`cansit.txt`).<br>- In the game the three only stood or held a rail. Cowcaddens outer: `woman_coat` stand 40, `man_kilt_casual` pole 20, `man_highland` stand 19. Govan inner: `woman_coat` pole, `man_kilt_casual` stand (`g1/log.txt`, `g2/log.txt` STATES).<br>- `man_highland` was seen at a rail at eye height (`e2/EYE.png`).<br>- **The 8 seated, viewer near and far:** all whole (`v0/S.png`).<br>- **Seen seated in the game:** `woman_midi`, `woman_sash`, `woman_dress`, `girl_school_kilt`, `ya_smile_dress`, `boy_kilt` (`g/SO.png`, `g3/S.png`, `k/kid.log`).<br>- **Still wrong:** `ya_smile_dress`'s red hem shows as a hoop under the seat between her calves. | as listed |
| 4 | The haggis's lead hangs with its slack | **True, roughly.**<br>- Two straight segments with a kink. It reads as a lead rather than a rod on the Partick platform and while boarding (`e/PETs.png`).<br>- In the car, from the seated owner's hand to the haggis at his feet, it is short and near straight, which is plausible (`e/PETCAR.png`).<br>- Close up, the kink is a sharp V, not a curve. | `e/pet.log` (`leadLen` 0.5-1.08 m) |
| 5 | Not changed: brisk-walk crouch, mouths, white eye, kilt stride gap, turn-aways, pole hands, bursts, phones in hair, hair, far holes | **Confirmed where re-checked.**<br>- **Instrument:** 9.54, LEG p10 7.4, SMO p10 7.8, worst `woman_coat` at 1.9 m/s 8.6. Identical (`m/rec.log`).<br>- **Faces** as before (`f/NS.png`).<br>- **Walking at 1.5 m/s:** heel crouch on `ya_tube_heels` and `adult_heel_boots`, and `man_kilt_casual`'s kilt gap (`wk/W.png`). | as listed |

## 2. Status of REVIEW_43's top ten

| # | REVIEW_43 item | Now | Evidence |
|---|---|---|---|
| 1 | `woman_coat`'s seated skirt split | **Fixed by standing her.** | `g1/log.txt`, `g2/log.txt` |
| 2 | `man_kilt_casual`'s seated thigh windows; `man_highland`'s band | **Fixed by standing them.** | same |
| 3 | The drape lags on sitting down | **Fixed for the lag.** In the viewer and on far models it comes in with the sit. On near boarders it snaps on with the snapped pose. | `tr5/s.log`, `s3/log.txt` |
| 4 | Squat in the air while settling | **Not fixed. Worse.**<br>- Far: the body sinks with straight legs through the floor.<br>- Near: the person sits on air 0.5 m out and glides back. | `tr5/DRESS.png`, `s2/SET2.png`, `s3/STU.png` |
| 5 | Brisk-walk crouch / heel wearers | Unchanged (LEG p10 7.4). | `m/rec.log`, `wk/W.png` |
| 6 | Resting mouths; white eye | Unchanged. | `f/NS.png` |
| 7 | Kilt opens mid-stride | Unchanged in the stride. The seated kilts that were bad now stand. | `wk/W.png` |
| 8 | Turn-aways | Kelvinbridge inner, 300 s:<br>- 9 of 25 turned away: 7 "no seat or spot", 2 "garment mix".<br>- No repeats.<br>- Edge: 0 of 591 under 0.6 m. | `w/kb.log` |
| 9 | Phones in long hair, open pole hands | Not re-measured (unchanged code). Rail hands looked closed at eye height. | `e2/EYE.png` |
| 10 | Hair, far holes; the rigid lead | Hair unchanged. The far `girl_school_kilt` and `boy_kilt` tops are ragged at the arms and hem. The lead now sags. | `v0/S.png`, `e/PETs.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- No gait change, and the instrument numbers are identical.
- The heel wearers still walk crouched at 1.5 m/s (`wk/W.png`).

### 3.2 Arms and hands: 8.32 (typical 8.8, worst 7.6)
- Steady-state seated phones are held: in 240 s of a ride, sampled at 60 Hz, 1 of 5,892 seated phone-clip samples showed the phone pose without a phone (`ph/a.log`).
- After `ya_smile_dress`'s snapped sit-down, her hands were raised with fingers spread and no phone visible, for at least 1 s (`s3/SET5b.png`).
- The "phone pose with no phone" on `woman_dress` in `g/WD.png` comes from the 0.1 s probe and is not a game fault.

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- Unchanged (`f/NS.png`, 12 faces at 0.6 m, neutral and smiling):
  - `adult_smile_blouse`'s mouth is pursed and downturned;
  - `girl_ginger` smirks at rest;
  - `teen_runner`'s mouth is crooked;
  - `man_longcoat`'s eyes are pale and white-looking;
  - `ya_smile_halter`'s smile pushes out a duck lower lip;
  - `adult_tattoo_muscle`'s smile is lopsided.
- `ya_smile_polo`'s and `woman_elder`'s smiles read naturally.

### 3.4 Standing, sitting, behaviour: 7.88 (typical 8.8, worst 6.5)
Good:
- The player crossed full trains 6 of 6 times (maxStill 0.1 s, `c/wk.log`).
- No crowding at the edge.
- No repeat turn-aways.
- Kids sit (`k/kid.log`).
- Waiting and pole riders are calm.

Worst tenth: every sit-down I logged at 60 Hz in the game was faulty (8 of 8).
- **Far boarders** sink 22-28 cm through the floor with straight legs.
- **Near boarders** sit on air and glide 0.5 m back.
- **Rises float:** the feet are 10-12 cm off the floor for about 0.4 s, with the body lifted in a bent-knee sit (`s1/RISE1.png`, frame 00).
- **A walking boarder passes through a seated boy's knees** in the aisle (`s2/SET1.png`, frames 03-06).
- These are short (about 1 s), but they happen at every station in view of a riding player. The rubric calls sliding and clipping through things "broken".

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged: 99 people.
- A child (`boy_shorts`) stood for 12 samples with the nearest grown-up 1.09 m away, and that grown-up was seated (`k/kid.log`).

### 3.6 Clothing: 8.24 (typical 8.8, worst 7.4)
Census (`cen4.py`):

| run | platform | saloon | all within 15 m |
|---|---|---|---|
| Ibrox inner ride | 0 of 11 | **1 of 20** (shorts 5 of 9, 56 %) | 0 of 20 |
| Buchanan Street outer explore | 0 of 20 | 0 of 5 | 0 of 20 (max 43 %) |

- The worst seated garments are gone.
- What remains:
  - `ya_smile_dress`'s rigid red hem hoop showing under the seat, at seated eye height across the aisle (`g3/S.png`);
  - `woman_sash`'s seated dress as a stiff sack round the knees (`g/SO.png`);
  - `woman_dress`'s dark flap below the thigh in the knee view;
  - the kilt stride gap.

### 3.7 Luggage: 8.20 (typical 8.8, worst 7.3)
- Totes, handbags and suitcases stand at seated people's feet (`g/SO.png`, `g3/S.png`).
- `man_student`'s red holdall sinks into the floor with his feet during his sit-down. Only the handles show for about 0.3 s, then it pops up into shape (`s3/STU.png`).
- The haggis rides in the car at its owner's feet (`e/PETCAR.png`).

### 3.8 Whole bodies: 8.10 (typical 8.7, worst 7.2)
- Better: no skin shows through the seated garments any more.
- Worse: during far-model sit-downs the lower legs vanish into the floor.
- `lod6` is 0 in both censuses: no far model within 6 m.
- The far tops of `girl_school_kilt` and `boy_kilt` are ragged at the arms and hem (`v0/S.png`).

## 4. Top ten defects, in priority order

1. **Near boarders sit on air.** A boarder added on the far model is swapped to the full model on the first frame. `_swapLod` replays the clip with fade 0, so the full sit pose (and `seatW = 1`) arrives at once, 0.5 m in front of the seat. They then glide back over 1 s.
   - Reproduce: `KIND=settle node gsink3.mjs "mode=ride&q=high&line=inner&station=hillhead" s3/a 400 5` or `KIND=settle node gsink2.mjs "mode=ride&q=high&line=outer&station=kelvinhall" s2/a 400 5`. Look at `s2/SET2.png`.
   - Fix: carry the crossfade's progress across the swap, or swap before the settle starts.
2. **Far-model sit-downs sink through the floor.** `_place` drives the root to the seated height at 25 % a frame from the first frame of the sit, while the legs bend over 1 s. The feet are 22-28 cm under the floor for about 0.7 s, the shins vanish, and a holdall at the feet sinks too.
   - Reproduce: the same scripts (`s3/STU.png`, `s1/log.txt`). In the viewer: `node trans5.mjs woman_dress tr5/s` (`tr5/DRESS.png`).
   - Fix: blend the height with the pose's weight (and per second, not per frame), or keep the soles on the floor (clamp to the floor until the knees bend).
3. **Stand-up floats:** the body lifts with seated, bent legs and the feet 10-12 cm off the floor for about 0.4 s.
   - Reproduce: `gsink.mjs` rise events (`s1/RISE1.png`, frame 00; `s1/log.txt` foot column 0.20-0.23 against 0.10 standing).
4. **Brisk-walk crouch / heel wearers:** LEG p10 7.4, SMO p10 7.8.
   - Reproduce: `people_motion.mjs --people default`; `ANGS='[["L",4.71,0.1]]' node shoot2.mjs 0 ya_tube_heels,adult_heel_boots none walk@170,walk@178 wk/w body 1.5`.
5. **`ya_smile_dress`'s seated hem** stands as a red hoop under the seat between the calves, at seated eye height.
   - Reproduce: `node gsd3.mjs "mode=ride&q=high&line=inner&station=partick" g3/a 450 "^(ya_smile_dress|boy_kilt|girl_small|adult_piper|woman_dress)$" 120` (`g3/S.png`).
6. **Resting mouths and smiles:** `adult_smile_blouse` pursed, `girl_ginger` smirking, `teen_runner` crooked, `ya_smile_halter`'s duck-lip smile, `adult_tattoo_muscle` lopsided. Also `man_longcoat`'s pale eyes.
   - Reproduce: `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0` and `... f/s "0:0" 1` (`f/NS.png`).
7. **Aisle walkers pass through seated knees,** and after a snapped sit-down the hands are raised with no phone for about 1 s.
   - Reproduce: `s2/SET1.png` frames 03-06; `s3/SET5b.png`.
8. **The kilt opens mid-stride** (`man_kilt_casual`, `wk/W.png`). **`woman_sash`'s seated dress is a stiff sack** (`g/SO.png`).
9. **Turn-aways:** 9 of 25 at Kelvinbridge (2 for garment mix). **One saloon sample was 56 % shorts.**
   - Reproduce: `node gaway5.mjs "mode=explore&q=high&line=inner&station=kelvinbridge" 300`; `node gp8.mjs "mode=ride&q=high&line=inner&station=ibrox" g/ib 200`, then `python3 cen4.py g/ib.json`.
10. **Hair and far-model raggedness** (the far tops of `girl_school_kilt` and `boy_kilt`), phones lost in long hair (not re-measured), and the lead's sharp V kink.
    - Reproduce: `ANGS='[["F",3.4,0.15],["L",4.4,0.1]]' node shoot2.mjs 1 girl_school_kilt,boy_kilt none sit v1/s`; `e/PETs.png`.

## 5. What I could not observe

- **No motion watched.** Transitions are judged from 0.1 s stills taken at 60 Hz steps and from logged bone heights.
- **Sit-downs were seen mostly at 10-13 m.** The settle probe only takes events within 14 m of the game camera, and boarders sit away from the player's door. The near boarders' snap was seen at 9.6-11 m, from my own camera placed 1 m away.
- **`girl_small` and `adult_piper` seated in the game:** neither was seated in my rides. They were checked only in the viewer, where they look whole.
- **Not re-measured:** phone calls in long hair, pole-hand close-ups, jam bursts, stair feet. The walking instrument ran on the default 6 people.
- **Whether the rise float is as visible on near models:** the rises I framed were at 6.5-10 m.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Settle and rise at 60 Hz in the game: pelvis height, lowest foot bone, pose weight, `seatW`, frames every 0.1 s with others hidden | St Enoch inner, Kelvinhall outer and Hillhead inner rides: 8 settles (`adult_leggings_knit`, `teen_ginger`, `adult_camisole`, `ya_ginger_long`, `woman_puffer`, `ya_tee_jeans`, `man_student`, `ya_smile_dress`) and 6 rises | `s1/`, `s2/`, `s3/` |
| Viewer sit-down and stand-up from the side, with a floor, at 60 Hz; also with review 43's 0.5 s fade | `woman_dress`, `adult_piper` | `tr5/`, `tr5o/` |
| `_canSit` for all 99 | viewer | `cansit.txt` |
| Seated skirted people in the game (near, knee, far) | Cowcaddens outer, Govan inner, Partick inner rides | `g/SO.png`, `g3/S.png`, `g1/`, `g2/`, `g3/` |
| The 8 seated skirted people, near and far, front and side | viewer | `v0/S.png` |
| Seated phone hold over time | Cowcaddens outer ride, 240 s | `ph/a.log` |
| Faces neutral and smiling at 0.6 m | 12 people | `f/NS.png` |
| Walk at 1.5 m/s, 4 phases, side view | 6 people | `wk/W.png` |
| Walking instrument | default 6 people, 5 speeds | `m/rec.log` |
| Haggis | Partick outer platform and boarding; in a car at Govan inner | `e/PETs.png`, `e/PETCAR.png`, `e/pet.log` |
| Census, far model within 6 m, duplicates, overlaps | Ibrox inner ride, Buchanan Street outer explore | `g/ib.*`, `g/bu.*` |
| Turn-aways, edge | Kelvinbridge inner explore, 300 s | `w/kb.log` |
| Player walk-through | Shields Road outer ride, 6 crossings | `c/wk.log` |
| Eye height in a car | Hillhead inner ride | `e2/EYE.png` |
| Children in the car | Partick outer ride | `k/kid.log` |

Next round, look at:
- sit-downs at 60 Hz near the player's own seat;
- the rise on near models;
- `girl_small` and `adult_piper` seated in the game;
- phone calls in long hair and pole-hand close-ups.

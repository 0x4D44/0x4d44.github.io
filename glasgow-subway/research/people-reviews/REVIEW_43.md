# Under Glasgow: independent review of the people (review 43)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `bc79fdc3`. The people commits since review 42 are `dedc94c6` and `bc79fdc3` (read-only `git show`). Both change only `js/sim/people.js`:
- `_seatMorph`: the `_seat` offset becomes a morph target with full-float normal deltas. Its weight `seatW` moves towards `on = state === 'sit' && !tween` at 1/0.5 s.
- `bc79fdc3` puts the morph on a cloned geometry (`userData.morphGeo`) that only meshes with morph influences use.
- `_canSit` returns false for `woman_mini`, `teen_skirt`, `teen_tube`, `elder_woman_dress` and `adult_beret`.
- No model, face, gait, bag or crowd-logic file changed.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review43/`. The scripts are the review 42 set copied into `$R`, plus:
- `trans2.mjs` / `trans3.mjs`: review 42's `trans.mjs`. The person is made `static` so the settle tween runs. There are 16 frames of 0.1 s sitting down and 7 standing up, each logging `seatW`, state and tween. `trans3` shoots from the front three-quarter.
- `gsd3.mjs`: `gsd2.mjs` with 17 frames of 0.1 s through each sit-down and 8 through each stand-up. Each frame is shot from across the aisle (1.3 m) and along the car (1.8 m, 0.9 m high), once per person and event.
- `gset.mjs`: in the game, logs every settle in the player's saloon every 0.1 s. It records the pelvis height above the seat surface, how far the hips are from their seat spot, `seatW`, the clip and the tween.
- `zoom.py`: crops.

Running notes: `NOTES.md`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.24 (8.237). Gate NOT met.** No category is below 8, but the mean is not above 9.

- **The seated cloth is fixed where it was broken by code.** Normals are right and seated skirts are shaded in the viewer and the game. Standing up, the drape and the body now blend together.
- **The five bad seated garments are gone from the seats.** In three rides `woman_mini`, `teen_skirt`, `teen_tube`, `elder_woman_dress` and `adult_beret` only stood or held poles.
- **But one of the 11 who may still sit is broken.** Seated, `woman_coat`'s skirt splits up between the thighs, with a flap at the crotch and a sheet hanging below the seat edge. This was seen in the game at seated eye height, about 1.5 m across the aisle.
- **`man_kilt_casual`'s seated kilt shows both thighs through window-like gaps.**
- **Sitting down still has a lag.** The drape only starts when the 1.0 s settle tween ends. That is 0.5 s after the body is fully seated. So for half a second the seated body wears the standing-weight skirt, and the cloth then visibly "settles" for another 0.5 s while the person sits still.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.7 | **8.36** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.9 | **8.56** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 6.8 | **8.00** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.7 | 7.2 | **8.10** |
| | **Weighted mean** | 100 | | | **8.24** (8.237) |

0.20x8.16 + 0.10x8.36 + 0.10x8.32 + 0.10x8.56 + 0.10x8.30 + 0.15x8.00 + 0.10x8.36 + 0.15x8.10 = 1.632 + 0.836 + 0.832 + 0.856 + 0.830 + 1.200 + 0.836 + 1.215 = 8.237.

Changes against review 42 (8.143):
- **Behaviour +0.04.** The stand-up pop is gone. The sit-down lag remains, but it is smaller than review 42's bustle. Two garment-mix turn-aways came back.
- **Clothing +0.38.** Typical +0.1: the seated cloth is shaded. Worst tenth +0.8: the three shredded minis and two poor garments are off the seats. It is held down by `woman_coat` and the kilts.
- **Whole bodies +0.22.** No zero-normal cloth. Skin still shows through `woman_coat`'s split and the kilt gaps.
- **Every other category is unchanged.** No code for them changed, and the re-checks match review 42.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Seated drape is a morph target with full-float normal deltas, on its own geometry, blended in and out over 0.5 s with the sit | **Normals: true. Stand-up blend: true. Sit-down blend: only partly true.**<br>- **Normals:** seated skirts are shaded in the viewer and the game, not black or flat (`tr3/Z_*.png`, `g1/A.png`, `g2/A.png`, `g3/SO.png`).<br>- **Stand-up:** `seatW` falls 0.8, 0.6, 0.4, 0.2, 0 over the first 0.5 s, together with the body's 0.5 s crossfade. `woman_dress` and `ya_smile_dress` rise smoothly (`g2/TR.png`, `g4/RK.png`). The kilts still show bare thigh through gaps for the first 0.2 s (`g4/RK.png`).<br>- **Sit-down:** `on` needs `!p.tween`, and `settle()` runs a 1.0 s tween while the pose crossfades in 0.5 s.<br>&nbsp;&nbsp;- Measured in the viewer (`trans2` log) and the game (`g/set1.log`, `woman_dress`): `seatW` is 0 up to 1.0 s, then 0.2, 0.4, 0.6, 0.8, and 1 at 1.5 s.<br>&nbsp;&nbsp;- So from 0.5 to 1.0 s a fully seated body wears the standing-weight garment. `woman_coat` shows a skin-coloured hole in her skirt at 0.4-0.6 s (`g3/Zset.png`), and `woman_dress` has dark flaps below the thigh at 0.7 s (`tr3/Z_woman_dress.png`).<br>&nbsp;&nbsp;- Then the cloth reshapes over 0.5 s while the body is still. | `NOTES.md`, logs as listed |
| 2 | The five broken seated garments stand; the other 11 skirted people may sit | **The five stand: true. "May sit": true. But one of the 11 is broken seated.**<br>- **The five:** across rides they were seen at poles or standing: Ibrox outer `woman_mini` pole, `elder_woman_dress` stand (`g2/log.txt`); eye-height shots of `adult_beret`, `elder_woman_dress` and `teen_skirt` standing (`e/EYE.png`). Not one sat in three rides.<br>- **Seated in the game:** `woman_midi`, `woman_sash`, `woman_dress`, `ya_smile_dress`, `girl_small`, `girl_school_kilt`, `boy_kilt`, `man_highland`, `man_kilt_casual`, `woman_coat`. `adult_piper` sat only in the viewer (`v0/S.png`).<br>- **Good seated:** `woman_dress`, `woman_sash`, `girl_small`, `girl_school_kilt`, `boy_kilt`, `woman_midi` (its hem slightly ragged).<br>- **`woman_coat`: broken.** The skirt splits up between the thighs, with a flap or strap at the crotch and a dark sheet hanging below the seat front between the calves. Seen in the game across the aisle at seated eye height and knee height (`g4/Zcoat.png`), and in the viewer in both views, with a pointed flap below the knees from the side (`v0/Zcoat.png`).<br>- **`man_kilt_casual`: poor to broken.** Both thighs show through two window-like gaps, with a kilt panel hanging between the knees. Seen in both clips (`g3/Z1.png`, `g3/SO.png`).<br>- **`man_highland`:** the kilt sits as a band at the hips, with bare thigh down to the garters (`g3/Z1.png`).<br>- **`ya_smile_dress`:** a red hem hoop shows under the seat between the calves (`g3/Z1.png`). | as listed |
| 3 | Not changed: brisk-walk crouch / heel wearers, resting mouths, white eye, kilt stride gap, turn-away repeats, open pole hands, stop-start bursts, hair, far holes | **Confirmed where re-checked.**<br>- **Instrument** (default 6 people): 9.54, LEG p10 7.4, SMO p10 7.8; worst `woman_coat` at 1.9 m/s, 8.6. Identical to review 42 (`m/items.log`).<br>- **Faces:** the same as review 42 (`f/NS.png`). `adult_smile_blouse` pursed, `girl_ginger` smiling at rest, `teen_runner` crooked, `ya_ginger_long`'s hair over the eye.<br>- **Turn-aways:** `adult_camo_cap` turned away twice again (`w/hh.log`). | as listed |

## 2. Status of REVIEW_42's top ten

| # | REVIEW_42 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated minis shred | **Fixed by standing them.** None of the three sat in three rides. | `g*/log.txt`, `e/EYE.png` |
| 2 | Zero normals on seated drapes | **Fixed.** | `tr3/Z_*.png`, `g1/A.png` |
| 3 | `elder_woman_dress` to the crotch; `adult_beret`'s thigh band | **Fixed by standing them.** Both are seen standing in cars. | `g2/log.txt`, `e/EYE.png` |
| 4 | Sit-down and stand-up pops | **Stand-up fixed. Sit-down only half fixed:** a 0.5 s lag, then a 0.5 s settle with the body still. | `g/set1.log`, `tr2` log, `g3/Zset.png` |
| 5 | Brisk-walk crouch | Not fixed (LEG p10 7.4). | `m/items.log` |
| 6 | Resting mouths; white eye | Unchanged. | `f/NS.png` |
| 7 | Kilt stride gap; seated kilts show thigh | Unchanged in the stride. Seated, `man_kilt_casual`'s gaps read worse now that the cloth is shaded. | `g3/Z1.png` |
| 8 | Turn-away repeats | Unchanged.<br>- `adult_camo_cap` x2 at Hillhead outer.<br>- 6 of 25 turned away: 4 "no seat or spot" and **2 "garment mix"** (review 42: 0 for the mix).<br>- Edge: 0 of 610 under 0.6 m. | `w/hh.log` |
| 9 | Open pole hands, jam bursts | Not re-measured (unchanged code). | - |
| 10 | Hair, far holes | Hair unchanged in `f/NS.png`. Far seated drapes match the near ones; `woman_coat`'s far skirt also splits (`g3/FA.png`). The far model is only used beyond 6 m (0 within 6 m in two censuses). | `g/po.log`, `g/hh.log` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- No gait change. The instrument gives the same numbers as review 42: LEG p10 7.4 and SMO p10 7.8 still fail the instrument's own gate.

### 3.2 Arms and hands: 8.36 (typical 8.8, worst 7.7)
- Unchanged.
- Seated phone holders in skirts hold the phone well (`g1/A.png`, `g3/SO.png`).
- Of six phone calls at 0.5 m (`h/C.png`), two phones disappear into long hair. They are hidden by the hair rather than clipping the head, so the score is unchanged.

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- Unchanged (`f/NS.png`). The gentle smiles read as natural on most people. `ya_ginger_long`'s smile looks smeared, and `adult_smile_blouse`'s resting mouth is pursed.

### 3.4 Standing, sitting, behaviour: 8.56 (typical 9.0, worst 7.9)
Good:
- Standing up now blends.
- The player crossed full trains 6 of 6 times (`c/wk.log`).
- Kids sit (`k/kid.log`).
- No crowding at the edge.

Worst tenth:
- **The sit-down lag** (claim 1).
- **A short squat in the air.** At 0.3 s into a settle the pose is about 60 % seated, but the hips are still 0.35 m forward of their seat spot and 13 cm above their final height. At 0.5 s, fully in the sit pose, they are 0.19 m forward and 7 cm high, and then they glide back. This is the same for every rider (`g/set1.log`) and happens because the pose crossfade (0.5 s) is shorter than the tween (1.0 s).
- **Turn-aways:** 2 garment-mix turn-aways and a repeat (`w/hh.log`).

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged roster: 99 people.

### 3.6 Clothing: 8.00 (typical 8.8, worst 6.8)
Census (`cen4.py`):

| run | platform | saloon | all within 15 m |
|---|---|---|---|
| Partick outer ride | 0 of 11 (max 45 % shorts) | 0 of 20 (max 42 % trousers) | 0 of 20 |
| Hillhead inner explore | 0 of 20 | 0 of 8 (max 50 %) | 0 of 20 |

- Typical: a real mix of clothes, and seated skirts and dresses are now shaded and whole.
- Worst tenth:
  - `woman_coat` seated (split skirt, crotch flap, sheet below the seat);
  - `man_kilt_casual`'s seated thigh windows;
  - `man_highland`'s kilt as a band;
  - the kilt stride gap;
  - the standing-weight skirt during the sit-down lag.

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- Unchanged.
- Totes, handbags and rucksacks sit at seated people's feet (`g3/SO.png`).
- `woman_coat`'s handbag lands tilted on one corner mid-settle (`g3/SC.png`).
- **The haggis on its lead, on the Partick platform** (`e/PET.png`): a brown ovoid with a red bonnet, small dark legs, and the lead running from the owner's hand. It reads as a small odd creature at 1.5 m.
  - The lead is a perfectly straight line with no sag.
  - The body texture is flat.
  - The in-car cameras of `gpet7` again ended outside the car.

### 3.8 Whole bodies: 8.10 (typical 8.7, worst 7.2)
- No zero-normal cloth any more.
- Skin through cloth:
  - `woman_coat`'s seated split, and her skirt hole during the settle;
  - `man_kilt_casual`'s kilt gaps, seated and for the first 0.2 s of standing up.
- Far seated drapes match the near ones, faults included.

## 4. Top ten defects, in priority order

1. **`woman_coat`'s seated skirt splits, with a crotch flap and a sheet under the seat.** She is one of the 11 still allowed to sit.
   - Reproduce: `node gsd3.mjs "mode=ride&q=high&line=outer&station=buchanan-street" g4/a 400 "$(cat re.txt)" 140`, then look at `g4/a_woman_coat_sit_phone_seatopp.png` and `_knee.png`.
   - Viewer: `ANGS='[["F",3.4,0.15],["L",4.4,0.1]]' node shoot2.mjs 0 woman_coat none sit v0/s`.
   - Stand her, or re-simulate her drape.
2. **`man_kilt_casual`'s seated kilt shows both thighs through window-like gaps,** and `man_highland`'s kilt rides up to a band.
   - Reproduce: `node gsd3.mjs "mode=ride&q=high&line=inner&station=partick" g3/a 400 "$(cat re.txt)" 140`, then look at `g3/a_man_kilt_casual_*_seatopp.png`.
3. **The drape lags on sitting down.** It is gated on `!p.tween`, so it starts only after the 1.0 s settle tween, 0.5 s after the body is seated. Drive it from the sit pose's crossfade weight instead, as standing up already effectively does.
   - Reproduce: `node gset.mjs "mode=ride&q=high&line=inner&station=st-enoch" 300` (`seatW` column), and `node trans3.mjs woman_midi,woman_dress,woman_coat tr3/t`.
4. **Squat in the air while settling:** the pose finishes (0.5 s) before the hips reach the seat (1.0 s).
   - Reproduce: `gset.mjs` (columns `dh` and `dist`).
5. **Brisk-walk crouch / heel wearers:** LEG p10 7.4, SMO p10 7.8.
   - Reproduce: `people_motion.mjs --people default`.
6. **Resting mouths** (`adult_smile_blouse`, `girl_ginger`, `teen_runner`, `ya_ginger_long`) and `man_longcoat`'s white eye.
   - Reproduce: `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0`.
7. **Turn-aways:** `adult_camo_cap` twice in one run; 2 garment-mix turn-aways are back (6 of 25 turned away in all).
   - Reproduce: `node gaway5.mjs "mode=explore&q=high&line=outer&station=hillhead" 300`.
8. **The kilt opens mid-stride and in the first 0.2 s of standing up** (`man_kilt_casual`, `man_highland`).
   - Reproduce: `g4/RK.png` via item 2's command at Buchanan Street outer.
9. **Phones lost in long hair during calls** (2 of 6 at 0.5 m), and the open pole hands (not re-measured).
   - Reproduce: `KIND=call DIST=0.5 N=6 node gcall2.mjs h/c3`.
10. **Hair** (`ya_ginger_long`'s hair over the eye) and the far-model holes. Also the haggis's rigid straight lead.
    - Reproduce: `f/NS.png`; `node gpet7.mjs "mode=explore&q=high&line=outer&station=partick" 120 e/pet`.

## 5. What I could not observe

- **No motion watched.** The transitions are judged from 0.1 s stills and logged weights.
- **`adult_piper` seated in the game:** he was not seated in three rides. He was checked only in the viewer, where he looks whole.
- **The haggis in a car:** the cameras ended outside the car. I saw it only on the platform.
- **Not re-measured:** pole-hand close-ups, jam bursts, stair feet. The walking instrument ran on the default 6 people, not all 99.
- **The settle side-view camera in `gsd3`** framed the person three-quarter from the front, not in true profile, so the squat in the air is measured rather than seen.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Sit-down / stand-up transitions in the viewer, 0.1 s frames with `seatW` | `woman_midi`, `woman_dress`, `woman_sash`, `boy_kilt`, `ya_smile_dress`, `man_kilt_casual`, `girl_small`, `woman_coat` | `tr2/`, `tr3/S_*.png`, `tr3/Z*.png` |
| Seated skirts in the game: 4 near views and 2 far, both clips | Kelvinbridge inner, Ibrox outer, Partick inner, Buchanan Street outer rides: 10 of the 11 allowed | `g1/A.png`, `g2/A.png`, `g3/SO.png`, `g3/FA.png`, `g4/COAT.png` |
| Game transitions | rise: `woman_dress`, `woman_coat`, `ya_smile_dress`, `man_highland`, `man_kilt_casual`, `girl_school_kilt`; settle: `girl_school_kilt`, `woman_coat` | `g2/TR.png`, `g3/SC.png`, `g4/RK.png` |
| Settle kinematics log | St Enoch inner ride, 4+ settles | `g/set1.log` |
| Viewer seated near and far | `woman_coat`, `adult_piper`, `man_highland`, `man_kilt_casual`, `woman_dress`, `woman_sash` | `v0/S.png` |
| Census, far model within 6 m, duplicates, overlaps | Partick outer ride, Hillhead inner explore | `g/po.*`, `g/hh.*` |
| Turn-aways, edge | Hillhead outer explore, 300 s | `w/hh.log` |
| Eye-height car views (pole holders, the banned five standing) | Ibrox inner ride | `e/EYE.png` |
| Player walk-through | St Enoch outer ride, 6 crossings | `c/wk.log` |
| Children in the car | Partick inner ride | `k/kid.log` |
| Phone calls at 0.5 m | 6 people | `h/C.png` |
| Faces neutral and smiling at 0.6 m | 11 people | `f/NS.png` |
| Haggis | Partick outer platform | `e/PET.png` |
| Walking instrument | default 6 people, 5 speeds | `m/items.log` |

Next round, look at:
- `woman_coat` and `man_kilt_casual` seated;
- the drape weight during the first second of a sit;
- `adult_piper` seated in the game;
- pole-hand close-ups and the haggis inside a car.

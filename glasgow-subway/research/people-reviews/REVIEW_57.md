# Under Glasgow: independent review of the people (review 57)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4243b766`. The changes since review 56 (`git diff a76129e4 HEAD -- glasgow-subway`) are:
- `js/sim/haggis.js` `followStep`: the step round a stander is 0.6 of a full step. The whole move each frame is capped at `vmax x dt`, and after the cap it is pushed out of people's legs again. It faces the way it actually moved.
- `js/sim/index.js` `_routeBoarder`: the car garment check counts only those in `pend` who are still walking to the train (`routed`).
- Nothing else changed: models, gait, faces, seating and bags are as in review 56.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review57/`. Running notes are in `NOTES.md`.

New tool this round: `crab.py hc/b.json`. For each frame where the haggis moves faster than 0.4 m/s, it gives the angle between the way it moves and the way it faces. It also gives its top ground speed. I ran it on review 56's log as well, for a direct comparison.

**Result: weighted mean 8.34 (8.337). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Better:** the haggis going round legs.
  - Top ground speed 2.00 m/s, against 3.57 in review 56.
  - One frame more than 45 degrees sideways, against 18.
  - It still never gets more than 1.20 m from its owner.
- **Found this round:** the car garment rule has a second gap. `mixOver` checks only when a car **already** holds 4 or more people. So the third and fourth people into a two-person car are never checked.
  - Partick: car 3 held 4 of 4 in trousers for 98 s.
  - Hillhead: car 1 held 3 of 4 in trousers for 80 s.
- **Unchanged:** the heel crouch, the case's shuffle at the end of a turn, the faces, the 11 people who never sit, the kilt opening as he walks, and the rest.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.0 | **8.08** |
| 2 | Arms and hands | 10 | 8.9 | 7.9 | **8.50** |
| 3 | Faces | 10 | 8.7 | 7.6 | **8.26** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.8 | **8.58** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.1 | 8.3 | **8.78** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.34** (8.337) |

0.20x8.08 + 0.10x8.50 + 0.10x8.26 + 0.10x8.58 + 0.10x8.40 + 0.15x8.24 + 0.10x8.78 + 0.15x8.22 = 1.616 + 0.850 + 0.826 + 0.858 + 0.840 + 1.236 + 0.878 + 1.233 = 8.337.

Against review 56 (8.329):
- **Luggage +0.08** (worst tenth 8.1 to 8.3): the haggis's crabbing and dash are gone. The worst tenth is now held down by the case's end-of-turn shuffle, which is unchanged.
- **Clothing unchanged.** The hole review 56 found is closed in the code, and I did not see it again. The small-car gap is new, but 4 of 4 or 3 of 4 in trousers in a near-empty car is what a real car often looks like, so I do not lower the score for it.
- **The other six categories are unchanged.** None of their code or models changed, and every fault re-measured is still there.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The car garment-mix check counts only boarders still on their way | **TRUE in the code, and not seen to fail.**<br>- `live()` keeps a name from `pend` only while a crowd person with that character is still `routed`. `release` clears `routed`, so a boarder who gave up no longer counts.<br>- In two 480 s runs (Partick outer, `cen/pk.json`; Hillhead inner, `cen/hh.json`), no car of 5 or more people was over half one group. The largest was Partick car 0: 5 trousers and 5 bare (shorts or leggings) out of 10.<br>- Garment mix turned 8 and 15 boarders away.<br>- **But** a separate gap remains: `mixOver` returns false while the car already holds fewer than 4 (`n >= 4` is tested before the newcomer is added). So 2 seated + 2 boarders made **4 of 4 trousers** in Partick car 3 for 98 s (t = 328-426: `ya_fedora` and `adult_baggy_knit` seated; `man_beard` and `adult_oxford_shirt` boarded at 326.3 and 326.8 s). At Hillhead, car 1 held 3 of 4 trousers for 80 s. | `cen/pk.json`, `cen/hh.json`, `python3 cen5.py cen/pk.json` |
| 2 | The haggis going round legs: a gentler slide, its move capped at 2.3 m/s and kept out of legs after the cap, and it faces the way it goes | **TRUE.**<br>- `hag7` at Buchanan Street inner, four walks past 9-10 standers each (`hc/b.json`). Measured with `crab.py`, against review 56's log of the same walks:<br>&nbsp;&nbsp;- Top ground speed 2.00 / 1.94 / 1.63 / 2.00 m/s; review 56 had a top of 3.57.<br>&nbsp;&nbsp;- Frames more than 45 degrees sideways: 1 (45.5 degrees, rounding a walking `adult_tophat`); review 56 had 18, up to 64 degrees.<br>&nbsp;&nbsp;- Frames more than 30 degrees sideways: 14; review 56 had 38.<br>- Owner-haggis distance at most 1.20 m. Closest approach to anyone 0.35 m. The lead never crossed anyone.<br>- `hag6` (`hg/b.json`, `hg/HB.png`):<br>&nbsp;&nbsp;- Walking, its leg cycles match the distance it covers.<br>&nbsp;&nbsp;- At the platform edge it arrives and stands.<br>&nbsp;&nbsp;- Blocked by `ya_tee_jeans`, it slides round her in about 1 s and stands beside its owner.<br>- Small side effect: in the first 0.5 s of the block, the legs did 6.67 cycles against 6.07 for the ground covered. The leg phase is advanced before the speed cap is applied, so the legs run about 10% fast while it is held back. That is not visible. | `hc/b.json`, `crab.py`, `hg/b.json`, `hg/HB.png` |
| 3 | Not changed: heel crouch, case shuffle, faces, turn speed, eleven non-sitters, sit-down slide, pole arm, nape, bob, black hair, kilts, children alone, overlaps | **Confirmed unchanged where measured.**<br>- Default walk 9.51, LEG p10 7.4, SMO p10 7.4 (`m.log`, identical).<br>- The three heel walkers re-measured (`mh.log`): overall 8.97, LEG 6.9 (p10 4.4). `ya_tube_heels` at 1.6 m/s: knee 40 degrees in loading and 31 in mid-stance. `adult_heel_boots` at 0.4 m/s: 7.8.<br>- `_canSit` list identical.<br>- The case turn (`tr/`) and the faces (`f/`) are as before. | `m.log`, `mh.log`, `tr/`, `f/` |

## 2. Status of REVIEW_56's top ten

| # | REVIEW_56 item | Now |
|---|---|---|
| 1 | Heel crouch; whole-roster LEG p10 6.1 | **Unchanged.**<br>- `mh.log` gives the same numbers for `ya_tube_heels`, `adult_heel_boots` and `teen_girl`.<br>- At 1.2 m/s (`wk/W.png`, row 1), `ya_tube_heels` creeps with bent knees and her hips back. That shows at platform speed, not only at 1.6 m/s. |
| 2 | Case shuffles at the end of a stepped turn | **Unchanged.**<br>- `adult_piper`, 150 degrees, Buchanan Street outer: after the turn (4.25-5.0 s), the case slides about 0.47 m by itself. The hand comes off the grip (hand-to-case distance 0.97 m), and the base peaks at 1.99 m/s.<br>- `woman_sash`: 1.52 m/s. |
| 3 | Faces (`man_elder`, `adult_harem`'s cap, `teen_girl`'s parting, smirk, smudges, pout, stare, dour mouths) | **All still there** (`f/N2.png` rows 2-3). |
| 4 | Garment-mix hole: a routed boarder who never boards | **Fixed.** A separate gap, for cars under 4 people, was found (new item 5). |
| 5 | Slow stepped turns | Unchanged: 150 degrees in 2.75 s (`tr/`, 1.0-3.75 s). |
| 6 | Haggis crabbing and its 3.6 m/s dash | **Fixed** (claim 2). |
| 7 | Eleven skirt and kilt wearers never sit | Unchanged. |
| 8 | Sit-down foot slide | Not re-measured; the code is unchanged. |
| 9 | Pole arm straight out; `ya_ginger_lad`'s nape | Not seen in this round's 24 car views. The nape is not visible from behind at 4 m (`far/F.png`). The code and model are unchanged, so it is carried over. |
| 10 | Minor | Carried over.<br>- `man_highland`'s kilt splits at the back as he walks, showing the bare back of his thigh, on both models at 4 m (`far/F.png`, 5th column).<br>- `woman_midi`'s slab bob (3rd column). |

## 3. Per-category reasoning

### 3.1 Walking: 8.08 (unchanged)
- Default six: 9.51 (`m.log`).
- Heel walkers: LEG p10 4.4 on their own (`mh.log`).
- The whole-roster run was stopped at 304 MB to stay within the disk budget. The gait code is unchanged and the default six give identical numbers, so review 56's whole-roster `mall.log` (9.45, LEG p10 6.1) stands.
- Stills at 1.2 m/s (`wk/W.png`):
  - `ya_tube_heels` creeps with bent knees.
  - `adult_heel_boots` walks with bent knees, less markedly.
  - `adult_beret`, `woman_mini` and `elder_woman_coat` walk normally.

### 3.2 Arms and hands: 8.50 (unchanged)
- Phones in both hands, seated, look right (`seat/SEAT.png`).
- A stander holds the pole above her head naturally (`eye/E2.png`, view 8).
- The case-owner's hand comes off the grip during the shuffle (`tr/`).

### 3.3 Faces: 8.26 (unchanged)
- 41 faces at 0.85 m, neutral and at smile 0.6 (`f/N1.png`, `f/N2.png`, `f/S1.png`, `f/S2.png`). 34 had not been sampled in review 56.
- Good:
  - The 0.6 smile reads as a gentle, natural smile on most people (`elder_woman_coat`, `ya_ginger_braid`, `adult_beret`, `girl_ginger`, `ya_smile_polo`).
  - `man_beard`, `adult_tophat`, `adult_lusekofta` and `elder_man_cap` read clearly as their age.
- Still there: `man_elder`'s ashen skin; `adult_harem`'s banded black cap; `teen_girl`'s pink parting; `adult_smile_blouse`'s lopsided smile; `girl_small`'s smudged mouth; `sum_shorts_asian_m`'s pout; `teen_hippy`'s pale stare.
- Newly noticed:
  - `teen_boy` has dark smudges under one eye and on the cheek (`f/N1.png`, row 2, 1st).
  - Banded, stair-stepped black hair caps on `boy_small`, `ya_tee_jeans` and `ya_smile_dress`.
  - `teen_skirt` has a jagged parting.
  - `ya_spiky` has a light patch in the hair at the temple.
- Neutral mouths turn down on most people.

### 3.4 Standing, sitting, behaviour: 8.58 (unchanged)
- Seated as the game seats them (Kelvinhall inner ride, `seat/SEAT.png`): `ya_tube_heels`, `adult_camisole`, `teen_crop_leggings`, `elder_shorts`, `sum_crop_denim`, `girl_shorts`, `man_elder`, `woman_elder`, `adult_string_vest` and `teen_hippy` all sit in the seat. Phones are held in two hands; bags are at the feet.
- The Cowcaddens outer ride, 24 eye-height views (`eye/E1.png`, `eye/E2.png`), looks natural.
- Carried over: slow turns, the sit-down slide, the 11 who never sit.

### 3.5 Range of people: 8.40 (unchanged)
- Roster unchanged at 99 people.
- No lookalike pair among the 41 faces.

### 3.6 Clothing: 8.24 (unchanged)
- The routed-boarder hole is closed.
- The cars I saw held a real mix: shorts, leggings, jeans, a tube top, a string vest, kilts, a tartan mini and a plaid skirt.
- The small-car gap (4 of 4 trousers) is a real gap in the rule, but it looks ordinary.
- Kilt opening at the back as he walks: visible at 4 m.

### 3.7 Luggage: 8.78 (typical 9.1, worst tenth 8.3)
- The haggis now moves like one animal. It does not crab, and it does not dash.
- Bags in `wk/W.png` hang from the hand, sit on the back, or roll on wheels.
- The worst tenth is now set mostly by the case shuffle: about 0.47 m in 0.75 s, hand off the grip.

### 3.8 Whole bodies: 8.22 (unchanged)
- Near and far models match at 4 m for 6 people (`far/F.png`).
- Both rides: no far model within 6 m, no duplicates, 61 stair walks with none stalled, one 1-frame overlap.
- Carried faults: banded black hair caps, scalp at the parting, `man_elder`'s blotched hair, the kilt opening.

## 4. Top ten defects, in priority order

1. **Heel wearers walk crouched.** Whole-roster LEG p10 6.1; on the heel walkers alone, LEG p10 4.4.
   - `ya_tube_heels`: knee 40 degrees in loading and 31 in mid-stance. Visible at 1.2 m/s (`wk/W.png`).
   - Reproduce: `NODE_PATH=/opt/node22/lib/node_modules node tools/people_motion.mjs --people ya_tube_heels,adult_heel_boots,teen_girl --base http://127.0.0.1:8611 --rec <dir>`, then `--from <dir> --items --worst 6`. For stills: `node wk.mjs ya_tube_heels,adult_heel_boots wk/w 1.2`.
2. **The case shuffles by itself after a stepped turn:** about 0.47 m in 0.75 s, at up to 2.0 m/s, with the hand off the grip.
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=360 node ctl6.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 2 150`, then `python3 bagan.py tr/*.json`.
3. **Faces:**
   - `man_elder`'s ashen skin.
   - `adult_harem`'s cap.
   - `teen_girl`'s parting.
   - `adult_smile_blouse`'s smirk.
   - Smudges on `girl_small` and `teen_boy`.
   - `sum_shorts_asian_m`'s pout.
   - `teen_hippy`'s stare.
   - Dour neutral mouths.
   - Reproduce: `node face4.mjs <ids> f/n 0:0 0` (and `... f/s 0:0 0.6`).
4. **Slow stepped turns:** 150 degrees in 2.75 s.
5. **The car garment check skips cars under 4 people.** `mixOver` tests `n >= 4` before adding the newcomer, so the 3rd and 4th into a car are never checked. Result: Partick car 3 held 4 of 4 in trousers for 98 s.
   - Fix: test `n + 1 >= 4`, or always refuse a 4th of the same group.
   - Reproduce: `node gp9.mjs "mode=explore&q=high&line=outer&station=partick" cen/pk 480 40`, then `python3 cen5.py cen/pk.json`.
6. **Eleven skirt and kilt wearers never sit** (`_canSit`).
7. **Kilts open at the back mid-stride,** showing bare thigh, on both models at 4 m (`far/F.png`, `man_highland`).
8. **Sit-down foot slide** (carried; not re-measured).
9. **Pole arms straight out; `ya_ginger_lad`'s nape; `woman_midi`'s slab bob; banded black hair caps.**
10. **Minor:**
    - The haggis's legs run about 10% fast for 0.5 s when it is blocked (leg phase advanced before the cap).
    - Children alone.
    - Brief walker overlaps (one 1-frame overlap per run).

## 5. What I could not observe

- **No motion was watched.** Everything comes from stills and 60 Hz logs.
- **The whole-roster walk was not re-run in full**, to stay within the disk budget. Only the three heel walkers were re-run.
- **The haggis in a car aisle with its owner walking** past seated riders' feet: still not seen.
- **An unforced case-owner turn:** the turn judged was forced with `GIVE=1`.
- **Not re-measured** (the code is unchanged): the sit-down slide and seated rises.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Haggis past standers: speed and heading | Buchanan Street inner, 4 lines past 9-10 standers each | `hc/b.json`, `crab.py`, `hag7an.py` |
| Haggis walking, at the edge, blocked | Buchanan Street inner | `hg/b.json`, `hg/HB.png` |
| Faces, neutral and smile 0.6 | 41 people (34 new) | `f/N1.png`, `f/N2.png`, `f/S1.png`, `f/S2.png` |
| Garment census per car, with provenance; far models, duplicates, stairs, overlaps | Partick outer and Hillhead inner: explore, board, ride, 480 s each | `cen/pk.json`, `cen/hh.json` |
| Player eye height through all cars | Cowcaddens outer ride, 24 views | `eye/E1.png`, `eye/E2.png` |
| Seated as the game seats them | Kelvinhall inner ride, 10 people | `seat/SEAT.png` |
| Case-owner turn, 150 degrees | `adult_piper`, `woman_sash`, Buchanan Street outer | `tr/` |
| Side strides at 1.2 m/s | `ya_tube_heels`, `adult_heel_boots`, `adult_beret`, `man_highland`, `woman_mini`, `elder_woman_coat` | `wk/W.png` |
| Near and far models walking at 4 m | `teen_girl`, `ya_ginger_lad`, `woman_midi`, `boy_small`, `man_highland`, `adult_piper` | `far/F.png` |
| Walking instrument | default six; the three heel walkers | `m.log`, `mh.log` |

Next round, look at:
- The haggis in a car aisle.
- An unforced case turn.
- Whether small cars are checked once the gap is fixed.

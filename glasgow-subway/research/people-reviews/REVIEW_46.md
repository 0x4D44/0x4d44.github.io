# Under Glasgow: independent review of the people (review 46)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `d1a3f53d`. The people commits since review 45 (read-only `git show` / `git diff 7cf93f03 HEAD`):
- `cfe3ffdd`, `9a4491be` (`people.js`): the slide into a seat no longer counts as walking off; texting standing and seated hand over; a texter who sits takes `sit_phone`; the hold is never let go faster than the clip's arms come down; the call-to-text branch restored.
- `1e5a4680` (`people.js`, `index.js`): `seatFeet` - a boarder walks to where the seated feet will be; `settle` first runs a turn tween (0.3-0.6 s) that rotates the person about the mean of the foot and ball bones, then sits straight down with a linear hip tween. A boarder held up more than 0.5 m short stands instead.
- `4a03a45c` (`people.js`): near/far swaps may happen mid-blend (`_manFade`); `_floorFeet` lifts a half-sat body so no foot or ball bone is under 2.5 cm.
- `d1a3f53d` (`haggis.js`): seated owner's haggis at 0.4 m ahead, 0.27 m aside.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before reading bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review46/`. Running notes are in `NOTES.md`; per-settle analysis is `an.py` over the `*.json` frame logs written by `gsit.mjs`.

**Result: weighted mean 8.27 (8.267). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **The sit-down proper is now good.** After the turn, the hips go straight back and down onto the seat; the lowest foot or ball bone stayed 1.8-2.5 cm above the floor in all 19 settles; the pelvis never moved more than 1.3 cm in a frame; mid-sit model swaps (2 natural ones) were seamless.
- **But the foot skate has only changed shape.** The new "turn on the spot" is a rigid rotation of the standing pose about the middle of both feet. The *mean* of the feet stays put (0.5-4.5 cm, as claimed), but **each foot slides 24-53 cm along an arc at up to 1.5 m/s, flat on the floor, with no step**, in 18 of 19 settles. At 2-3 m it reads as a person on a turntable (`c/turn_ms.png`).
- **Texters who sit still show empty hands by the face.** The turn tween counts as walking off, so the phone is put away during the turn; the phone clip's hands come up empty to the chin for 0.4-0.6 s (2 of 2 texting boarders; `d/GL_hands.png`).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.4 | **8.24** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 8.9 | 7.7 | **8.42** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.6 | **8.32** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.27** (8.267) |

0.20x8.16 + 0.10x8.24 + 0.10x8.32 + 0.10x8.42 + 0.10x8.30 + 0.15x8.24 + 0.10x8.32 + 0.15x8.26 = 1.632 + 0.824 + 0.832 + 0.842 + 0.830 + 1.236 + 0.832 + 1.239 = 8.267.

Changes against review 45 (8.253):
- **Behaviour +0.04.** The sit-down after the turn is clean, the hips no longer hang 0.4 m ahead of the seat, and the haggis lead no longer crosses the next rider. The skate is now a 24-53 cm per-foot pivot slide instead of a 15-50 cm translation: different, not gone.
- **Arms +0.04.** The empty phone pose no longer lasts 1.4 s seated; it now lasts 0.4-0.6 s during the turn, and in `sit_phone` the phone comes back.
- **Whole bodies +0.04.** The far model is no longer kept at 6-7 m through a sit-down; mid-blend swaps showed no jump.
- **Walking, Faces, Range, Clothing, Luggage unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Sitting texters keep the phone throughout; every seated phone pose has the phone at weight 1 by 0.2 s | **Partly true.**<br>- The slide into the seat no longer puts the phone away, and once sat in `sit_phone` the phone comes back (`ya_ginger_lad`: hold 0.19 to 1 by 0.5 s into the sit).<br>- **But the turn on the spot (new in `1e5a4680`) is a tween that moves `p.x`, in state `stand`, so `_pace` reads it as moving off and puts the phone away.** Both texting boarders I caught lost the phone in the turn: hold 1 to 0.27 over 0.4 s while the `phone_stand` clip's hands rise to the chin, empty, fingers spread (`ya_ginger_lad` Kelvinhall outer at 2.6 m, near model, `d/GL_hands.png`, `d/k_1_settle_ya_ginger_lad_E.png` frames 02-05; `man_student` Kelvinhall outer, hands 1.43-1.46 m with head at 1.66 m and hold 0, then `sit_idle`, `a/k_4_settle_man_student.json`).<br>- Calls are put away during the turn as intended (`adult_runner`, `sum_shorts_asian_m`): the hand comes down from the ear. | `d/log.txt`, `an.py d/*.json` |
| 2 | Sitting down without foot skate: turn on the spot about the middle of the foot, then straight down; mid-foot moves 0.3-2.6 cm | **The numbers are true; the conclusion is not.**<br>- 19 settles on 4 stations (Kelvinhall outer ×2, Hillhead inner, Partick outer, Ibrox inner). Turns of 45-124 degrees (18 of 19 over 75 degrees) in 0.5-0.6 s.<br>- Mean of the 4 foot and ball bones during the turn: 0.5-4.5 cm. Ankle mean: 2.6-12 cm. Matches the builder.<br>- **Each foot bone, however, slides 24-53 cm along an arc, flat on the floor, peak 0.6-1.5 m/s.** The pivot is the middle between both feet, not each foot's ball, and the pose is a frozen idle: no heel lifts, no step. With an idle stance up to 40 cm wide (`adult_smile_blouse`), the feet swing round like a turntable (`c/turn_ms.png`, `man_student` at 3 m: shoes go from side by side to heel-to-toe in profile without leaving the floor).<br>- After the turn the feet move a further 5-8 cm as the sit blend draws them together.<br>- The sit phase itself is good: knees bend as the hips go straight down; nobody squats in the air ahead of the seat (`c/p_2_settle_man_student_S.png`, `b/h_3_settle_teen_boy_S.png`). | `an.py */*_settle_*.json`; mid-turn table in `NOTES.md` |
| 3 | Mid-blend near/far swaps carried across; no foot under 2.5 cm half sat | **True.**<br>- Forced with the builder's `gswap.mjs` (Hillhead inner): pelvis step 2.0 cm at a settle swap, 2.8 cm at a rise swap (`adult_casual2`; the builder said 2.3), lowest foot 2.2-2.5 cm (`s/log.txt`). Note the forced swap is reverted by the game the next frame, so this is a one-frame test.<br>- **Natural mid-sit swaps** (my `gsit.mjs` with the player moved to 2.2 m at 0.9 s, Ibrox inner): `girl_school_kilt` and `ya_smile_polo` swapped at frame 54, pelvis step at most 1.2 cm, lowest bone 2.5 cm, no visible jump (`w/SW.png`).<br>- In rides most boarders are on the near model already (24 near models), so few swaps happen at all. | `s/log.txt`, `w/i_2*.json`, `w/i_5*.json` |
| 4 | Haggis waits by the seated owner's boot; lead hangs straight down | **True.** Seated `adult_string_vest` (forced seat, Buchanan outer ride): haggis 0.39 m ahead, 0.27 m aside of the pelvis, by his right boot; the lead runs from his hand down to it and touches nobody (`g/S3.png` row 1). Walking on the Partick platform the lead hangs in a smooth curve from his hand (`e/l3_0.png`). | `g/log.txt` |
| 5 | Not changed: brisk crouch, mouths, pale eyes, kilts, turn-aways, pole hands, bursts, phones in hair, hair caps, far holes, seated hems, bags through shins | **Confirmed where re-checked.**<br>- Walking instrument, 8 people not measured before: overall 9.52, LEG p10 7.1, SMO p10 7.7; worst `ya_tube_heels` at 1.6 m/s, 8.0 (`m/rec.log`).<br>- Faces: same kinds of fault (section 3.3).<br>- Seated skirts near: `woman_midi` and `woman_sash` still sit in stiff domes (`g/MS.png`); `ya_smile_dress`'s hem is a stiff flared ring (`g/S2.png` row 3). | `m/`, `f/`, `g/` |

## 2. Status of REVIEW_45's top ten

| # | REVIEW_45 item | Now |
|---|---|---|
| 1 | Sitting while on a phone: phone vanishes, hands fly up, empty phone pose 1.4 s | **Shorter, not gone.** Now 0.4-0.6 s of empty hands at the chin during the turn, then the phone returns if `sit_phone` is drawn (`d/GL_hands.png`). 2 of 2 texting boarders. |
| 2 | Feet skate 15-50 cm in every sit-down | **Changed shape.** Translation is gone; a rigid pivot slides each foot 24-53 cm along an arc (18 of 19 settles). |
| 3 | Walking instrument LEG p10 6.4 | Unchanged code. New 8 people: LEG p10 7.1, worst 8.0. |
| 4 | Haggis lead through seated riders | **Fixed.** Lead hangs straight down from the hand to a haggis at his boot (`g/S3.png`). |
| 5 | Far model kept within 7 m during a sit-down | **Fixed.** Swaps now come mid-blend without a jump. |
| 6 | Bags at the feet through shins | Not cleanly re-measured. `teen_boy`'s rucksack goes to the floor before he sits and is in front of his shin as his knees come forward (`b/h_3_settle_teen_boy_S.png`, frames 08-10); ambiguous at that angle. |
| 7 | Resting mouths, smiles, pale eyes | **Unchanged** (`f/n.png`, `f/s.png`). |
| 8 | `ya_smile_dress`'s seated hem | **Unchanged.** Seen near now: a stiff flared ring standing off the thighs (`g/S2.png` row 3). |
| 9 | Squat in the air 0.4 m ahead of the seat | **Fixed.** The hips go straight down over the feet. A new mid-blend oddity: with `sit_phone` (crossed legs) the lifted knee rises while the hips are still at standing height, a "climbing a step" pose for ~0.3 s (`a/BLs.png` frames 06-09, `adult_smile_blouse`). |
| 10 | Hair caps; kilt gap; `woman_sash` sack; turn-aways | Unchanged. `woman_sash` seated near is still a domed sack (`g/MS.png` row 2). |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- No gait change. 8 new people (`ya_tube_heels`, `woman_midi`, `adult_piper`, `elder_woman_dress`, `teen_tube`, `adult_string_vest`, `ya_smile_halter`, `man_longcoat`): overall 9.52; LEG p10 7.1 (knee in loading 34 degrees and mid-stance 23 degrees too bent for heel wearers), SMO p10 7.7, ARM p10 8.0. Worst `ya_tube_heels` at 1.6 m/s, 8.0; `adult_piper` at 1.6 m/s 9.0 with 4 cm/s planted-foot slip and hands outside the shoulder line.

### 3.2 Arms and hands: 8.24 (typical 8.8, worst 7.4)
- Texters who sit: hands rise empty to the chin, fingers spread, during the 0.5 s turn (2 of 2). Close up at 2.6 m it reads as someone waving both hands (`d/GL_hands.png`).
- Calls put away during a sit are clean. Seated phone holders in cars hold phones properly (`g/MS.png`, `g/S2.png`).

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- 16 faces at 0.6 m, neutral and smiling (`f/n.png`, `f/s.png`).
- Neutral: `adult_smile_blouse` pouts with a frown; `ya_smile_halter` and `woman_midi` have heavy, lowered inner brows that read as a scowl; `elder_woman_coat` turned down; `man_longcoat`'s pale cyan eyes.
- Smiles: most read as gentle, but `ya_smile_dress` and `ya_smile_halter` are lopsided smirks, `girl_ginger`'s is crooked, and `woman_midi`'s smile under the scowling brows reads as a sneer.

### 3.4 Standing, sitting, behaviour: 8.42 (typical 8.9, worst 7.7)
- **Good:** the sit phase (feet stay within a few cm, hips straight down, knees bend as they drop), clean rises, the haggis.
- **Worst tenth:** the turntable pivot before every sit-down (each foot slides 24-53 cm flat at up to 1.5 m/s, `c/turn_ms.png`); the crossed-leg knee lifting before the hips drop; the empty-handed texter turn.

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged roster of 99. St Enoch inner ride and Govan outer explore crowds showed every age group; seated children ride with dangling feet (correct).

### 3.6 Clothing: 8.24 (typical 8.8, worst 7.4)
- **Census** (`cen/se.json` St Enoch inner ride 200 s; `cen/gv.json` Govan outer explore 150 s): no sample over 50 % of one garment (max 50 % trousers on a platform, 44 % in a saloon). Kinds: trousers, shorts, leggings, skirts and dresses, kilts, highland dress, pleated skirts, trews.
- **Seated skirts near (game-seated with `_canSit`, Buchanan outer ride):** `woman_dress`, `girl_small`, `girl_school_kilt`, `boy_kilt` read well. `woman_midi`'s skirt is a stiff dome over the thighs at 1 m, `woman_sash` a domed sack, `ya_smile_dress` a stiff flared ring (`g/MS.png`, `g/S2.png`, `g/S3.png`). `adult_piper` cannot sit on any seat (stands, which is safe).

### 3.7 Luggage: 8.32 (typical 8.8, worst 7.6)
- Bags come off and stand on the floor at the feet (tote, rucksack). Suitcases stand upright by seats. No floating or sinking seen. Bags at the feet vs shins: unresolved (section 2, item 6).

### 3.8 Whole bodies: 8.26 (typical 8.7, worst 7.6)
- No far model within 6 m in either census run; no duplicates; one one-frame moving overlap at Govan.
- Mid-sit swaps carry across. Hair caps and far-model raggedness carried over.

## 4. Top ten defects, in priority order

1. **The turn on the spot is a turntable spin: each foot slides 24-53 cm across the floor, flat, at up to 1.5 m/s,** in 18 of 19 settles (turns of 75-124 degrees in 0.5-0.6 s).
   - Reproduce: `NEARCAM=2.5 SIDE=1 node gsit.mjs "mode=ride&q=high&line=outer&station=partick" c/p 600 5`, then `python3 an.py c/*.json` (per-bone `turnPath`); look at `c/turn_ms.png`.
   - Fix: step round (two or three small steps with heel lifts, e.g. the `turn_left`/`turn_right` clips the rig already has), or pivot each foot about its own ball with the heel lifted; at the very least turn less (approach the seat backwards-facing) and narrow the stance first.
2. **Texters who sit lose the phone in the turn; their hands rise empty to the chin for 0.4-0.6 s** (2 of 2).
   - Cause: the turn tween moves `p.x` in state `stand`, and `_pace` puts the phone away when `p.v > 0.15 && p.state !== 'sit'`. Exempt `p.settling` (or `p.tween.pivot`) as the seat slide was exempted.
   - Reproduce: `HOLD=1 NEARCAM=2.0 SIDE=1 node gsit.mjs "mode=ride&q=high&line=outer&station=kelvinhall" d/k 1200 4`; `d/GL_hands.png`; hold column `hw` in the JSON.
3. **Walking instrument: LEG p10 7.1, SMO p10 7.7** on 8 new people; heel wearers walk with bent knees (`ya_tube_heels` 8.0). `m/rec.log`.
4. **Crossed-leg sit (`sit_phone`): the knee lifts before the hips drop,** a "stepping up" pose for about 0.3 s in the linear blend (`a/BLs.png` frames 06-09). Blend the legs later than the hips, or uncross after seating.
5. **Faces:** scowling resting brows (`ya_smile_halter`, `woman_midi`), pout (`adult_smile_blouse`), smirk-like lopsided smiles (`ya_smile_dress`, `ya_smile_halter`, `girl_ginger`), `man_longcoat`'s pale eyes. `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0` (1 for the smile).
6. **Seated skirts that are stiff shells close up:** `woman_midi` (dome over thighs), `woman_sash` (sack), `ya_smile_dress` (flared ring). `node gseat.mjs "mode=ride&q=high&line=outer&station=buchanan" g/a woman_midi,woman_sash,ya_smile_dress`; `g/MS.png`, `g/S2.png`.
7. **Feet are drawn together 5-8 cm during the sit blend** after the turn (seat feet measured from `sit_idle`, but `sit_phone`/`sit_look` put them elsewhere). `an.py` `mid4 end`.
8. **Bags at the feet vs shins as people sit** (carried over; ambiguous in `b/h_3_settle_teen_boy_S.png`).
9. **Rise swap step 2.8 cm in one frame** (`adult_casual2`, `s/log.txt`): small, at 60 Hz a hitch.
10. **Carried over:** hair caps (`teen_hippy`, `sum_shorts_asian_m`), kilt opening mid-stride, turn-aways, pole hands, far-model raggedness.

## 5. What I could not observe

- **No motion was watched**; everything comes from 0.1 s stills and 60 Hz bone logs.
- **Only two texting boarders** in about 40 min of game time on Kelvinhall outer; the builder's claim that a texter sat and kept the phone throughout may hold for a texter who needs no turn (I saw none).
- **Natural mid-sit swaps:** only 2, both provoked by moving the player to 2.2 m at 0.9 s; in rides nearly everyone is already on the near model.
- **Side cameras were often blocked by passengers** in the aisle (`c/p_5_settle_woman_midi_S.png`), and one capture camera sat inside a rider.
- **Not re-measured:** stair feet, pole hands, aisle walkers through knees, the player walking into seated people, alighting, kilts mid-stride, far-model holes.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Settles at 60 Hz (per-bone foot/ball slide, pelvis, lowest bone, LOD, clip, hold), player placed 2-2.5 m away, eye and low side views | 19 settles: Kelvinhall outer ×2 runs, Hillhead inner, Partick outer, Ibrox inner (`adult_smile_blouse`, `teen_hood`, `teen_hippy`, `man_student` ×2, `sum_shorts_asian_m` ×2, `adult_camisole`, `teen_boy`, `woman_puffer`, `adult_casual2`, `boy_kilt`, `woman_midi`, `ya_ginger_lad`, `adult_runner`, `woman_dress`, `girl_school_kilt`, `girl_small`, `teen_cutoffs`, `ya_smile_polo`) | `a/`, `b/`, `c/`, `d/`, `w/`, `an.py` |
| Forced swaps (builder's probe) | Hillhead inner: 1 settle, 3 rises | `s/log.txt` |
| Game-seated skirts/kilts near, 4 views each | `woman_midi`, `woman_sash`, `woman_dress`, `ya_smile_dress`, `girl_small`, `girl_school_kilt`, `boy_kilt`, `adult_string_vest` (+ haggis); `adult_piper` cannot sit | `g/` |
| Faces at 0.6 m neutral and smiling | 16 people | `f/n.png`, `f/s.png` |
| Walking instrument | 8 people not measured before, 5 speeds | `m/rec.log` |
| Census, far model within 6 m, duplicates, overlaps | St Enoch inner ride 200 s, Govan outer explore 150 s | `cen/` |
| Player-eye views | Cowcaddens outer ride, every car fore and aft; Partick inner platform, 6 directions | `eye/r.png`, `eye/p.png` |
| Haggis walking | Partick outer | `e/` |

Next round, look at: a texter who sits with no turn; stair feet and pole hands; aisle walkers past seated knees; bags at the feet from the front during a sit.

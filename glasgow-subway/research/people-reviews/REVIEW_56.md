# Under Glasgow: independent review of the people (review 56)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `a76129e4`. The changes since review 55 (`git diff 8ea9a81c HEAD -- glasgow-subway`) are:
- `js/sim/haggis.js` `followStep`: after a blocker pushes the haggis out to its 0.36 m clearance circle, it also takes a full step along the circle's tangent, on the side that leads to its place.
- Models rebuilt (`tools/assets_people_mpfb.py`): `woman_bob` takes `middleage_caucasian_female` skin and brown eyes; `adult_harem` takes `afro01` hair and `eyebrow010`; `man_elder` takes brown eyes. `people_meta.json` changes only `adult_harem`'s measurements; `armfit.js` only her arm offsets. The grey eye material has left the credits.
- Nothing else in `js/` has changed: gait, bags, boarding, faces and seating are as in review 55.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones (one exception, flagged in section 5, was caught and redone). Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review56/`. Running notes are in `NOTES.md`.

New tools this round:
- `hag7.mjs` and `hag7an.py`: the haggis owner walked along the four lines through a platform that pass closest to the most standers (9 or 10 people within 0.9 m of each line). Logged at 60 Hz: owner-haggis distance, the haggis's clearance from everyone else, its speed, and whether it moves sideways to the way it faces.
- `wk.mjs`: eight side stills through a stride at a chosen speed.
- `bagr2.mjs`: every hand bag's distance from its owner over 2 s of rendered 60 Hz play.
- The walking instrument was run on the **whole roster** (99 people) as well as the default six.

**Result: weighted mean 8.33 (8.329). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Better:**
  - The haggis no longer stands behind someone's legs while its owner walks away. In five walks it was never more than 1.20 m from its owner.
  - `woman_bob` reads as a woman with normal skin and brown eyes, not a doll.
  - `adult_harem` and `woman_scarf` are no longer twins.
  - `man_elder`'s eyes are brown.
- **Found this round:**
  - The whole-roster walk is worse than the default six show: overall 9.45, LEG mean 7.8 and p10 6.1. `ya_tube_heels` walks at 1.6 m/s with her knee bent 31 degrees in mid-stance. `adult_heel_boots` at 0.4 m/s clears the floor by 1 mm in swing.
  - `adult_harem`'s new afro is a hard black cap with stair-stepped edges and a ruler-straight hairline at 0.45 m.
  - Going round a stander, the haggis crabs up to 60 degrees sideways to the way it faces, and once ran at 3.6 m/s (its `vmax` is 2.3).
  - The garment-mix rule has a hole: a boarder counted as "coming" who never boards lets the car go over half one group. Partick: 6 of 11 in shorts or leggings for 72 s.
- **Unchanged:** the case's end-of-turn shuffle, the slow turns, and the other faces flagged before.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.0 | **8.08** |
| 2 | Arms and hands | 10 | 8.9 | 7.9 | **8.50** |
| 3 | Faces | 10 | 8.7 | 7.6 | **8.26** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.8 | **8.58** |
| 5 | Range of people | 10 | 8.8 | 7.8 | **8.40** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.1 | 8.1 | **8.70** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.33** (8.329) |

0.20x8.08 + 0.10x8.50 + 0.10x8.26 + 0.10x8.58 + 0.10x8.40 + 0.15x8.24 + 0.10x8.70 + 0.15x8.22 = 1.616 + 0.850 + 0.826 + 0.858 + 0.840 + 1.236 + 0.870 + 1.233 = 8.329.

Changes against review 55 (8.303):
- **Luggage +0.14** (typical 9.0 to 9.1, worst tenth 7.9 to 8.1): the haggis's lag on a stretched lead is gone. It is held back from more by the case shuffle, which is unchanged, and by the haggis's crabbing and its brief dash.
- **Faces +0.10** (8.6 / 7.5 to 8.7 / 7.6): `woman_bob`'s doll stare, the twins and `man_elder`'s pale eyes are fixed. The rest of the faults stand, and `adult_harem`'s new hair cap is one more.
- **Range +0.10** (8.7 / 7.7 to 8.8 / 7.8): no lookalike pair among the 32 faces sampled.
- **Walking -0.04** (worst tenth 7.1 to 7.0): the whole roster puts the heel walkers' crouch into numbers. The code has not changed; this is new evidence, not a new fault.
- **The other four categories are unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A blocked haggis goes round the legs: pushed out from someone, it also slides round them toward its place, instead of standing behind them while its owner walks on. In the hag6 walk at Buchanan Street it stayed 0.8-1.2 m from its owner, with leg cycles matching distance, and was still when the owner stopped | **TRUE.**<br>- **hag6 at Buchanan Street inner** (`hg/b.json`, `python3 hagan.py hg/b.json`): walk phase, owner-haggis distance 0.95-1.20 m, leg cycles equal to distance / stride in every 0.5 s window. Still (0 m, legs at 0) once the owner stopped. At the edge it arrives and stands, with no trotting on the spot.<br>- **Blocked by a stander put on its path:** it slid round the stander to within 0.09 m of its place in about 1 s, then stood. Review 55 saw it stand behind the legs.<br>- **Dense crowd** (`hag7.mjs`, `hc/b.json`, `python3 hag7an.py hc/b.json`): four 4 s walks past 9-10 standers each. Owner-haggis distance never above 1.20 m. Closest approach to anyone 0.36 m (its clearance). The lead never crossed within 0.12 m of anyone's centre.<br>- **Side effects of the tangent step:**<br>&nbsp;&nbsp;- Rounding `man_puffer` (trial 0, frames 4-18), it moved 42-60 degrees off the way it faced for 0.25 s: it crabs sideways.<br>&nbsp;&nbsp;- Rounding `adult_tophat` (trial 3, frames 115-122), it covered ground at 2.6-3.6 m/s for about 0.15 s. Its `vmax` is 2.3 m/s. The push-out keeps most of the forward step, and then a full step is added along the tangent.<br>&nbsp;&nbsp;- Both are brief and at ankle height. | `hg/b.json`, `hc/b.json`, `hc/HC.png` |
| 2 | Models rebuilt: `woman_bob` brown eyes and middle-aged skin; `adult_harem` afro01 hair and eyebrow010; `man_elder` brown eyes. Everything else in the models as before | **TRUE.**<br>- `woman_bob`: normal skin and brown eyes, neutral and smiling (`f/N1.png` 1st; `f/Z.png` 1st). It reads as a woman in her forties. Fixed.<br>- `adult_harem`: short black afro and different brows. She no longer looks like `woman_scarf` (`f/N1.png` 2nd and 3rd). **But** at 0.45 m the afro is a hard black cap with stair-stepped, aliased edges and a straight hairline across the forehead (`f/Z.png` 2nd). From behind at 3 m it reads as hair (`far/F.png`).<br>- `man_elder`: brown eyes, fixed. The skin is still ashen grey (`f/Z.png` 3rd).<br>- Diff check: only these three entries changed in `assets_people_mpfb.py`, and only `adult_harem` in `people_meta.json`. Near and far models of all three match at 3 m (`far/F.png`). | `f/N1.png`, `f/S1.png`, `f/Z.png`, `far/F.png`, git diff |
| 3 | Not changed: case shuffle, turn speed, heel and pencil-skirt crouch, faces, garment mix, non-sitting skirts, sit-down slide, pole arms, nape, `woman_midi`'s bob, toe drag, clip-change slide, start-up dip, kilts, children alone, overlaps | **Confirmed unchanged where measured.**<br>- Case turn (`man_kilt_casual`, Buchanan Street outer, `tr/t_0_*.json`): the base moved 0.29 m in 0.25 s at the end of the turn, peaking at 1.93 m/s (review 55: 1.5).<br>- Turn: 150 degrees from 1.0 to 3.75 s.<br>- Default walk: 9.51, LEG p10 7.4, SMO p10 7.4 (`m.log`, identical).<br>- `_canSit` list identical.<br>- Pole arm straight out sideways (`eye/E2.png` view 7). | `tr/`, `m.log`, `eye/E2.png` |

## 2. Status of REVIEW_55's top ten

| # | REVIEW_55 item | Now |
|---|---|---|
| 1 | Haggis held behind legs while the owner walks away; 4.7 m lead, then a 2.3 m/s dash | **Fixed.** Never more than 1.20 m away in five walks. Replaced by smaller faults: sideways crabbing, and one dash at 3.6 m/s round a stander (new item 6). |
| 2 | Case shuffles 0.35 m after a stepped turn | **Unchanged.** 0.29 m in 0.25 s at up to 1.93 m/s (`man_kilt_casual`). |
| 3 | Faces | **Partly fixed.**<br>- Fixed: `woman_bob`, the twins, `man_elder`'s eyes.<br>- Still there: `man_elder`'s ashen skin; scalp at `teen_girl`'s parting (`f/N2.png`); dour neutral mouths; `girl_small`'s smudged face; `adult_smile_blouse`'s lopsided smirk (`f/S2.png`). |
| 4 | Heel and pencil-skirt crouch; LEG and SMO p10 7.4 | **Unchanged, and worse on the whole roster:** LEG p10 6.1 (new item 1). |
| 5 | Slow stepped turns | Unchanged: 150 degrees in about 2.75 s. |
| 6 | Garment mix left to chance | **One car over half for 72 s** by the game's own grouping (new item 4). |
| 7 | Eleven skirt and kilt wearers never sit | Unchanged (`_canSit`). |
| 8 | Sit-down foot slide | Not re-measured; the code is unchanged. |
| 9 | Pole arms straight out; `ya_ginger_lad`'s nape | Pole arm seen again (`eye/E2.png` view 7). Nape not re-rendered; the model is unchanged. |
| 10 | Minor and carried over | Carried over. Walker overlaps: `ya_fedora` and `ya_ginger_lad` at 0.08 m for 2 frames at 16 m; `man_longcoat` and `man_puffer` at 0.12 m for 3 frames at 15.6 m. |

## 3. Per-category reasoning

### 3.1 Walking: 8.08 (typical 8.8, worst tenth 7.0)
- Default six (`m.log`): 9.51; LEG p10 7.4; SMO p10 7.4. Identical to review 55.
- **Whole roster** (`mall.log`, 99 people x 5 speeds): 9.45; LEG 7.8 (p10 6.1); SMO p10 7.3; worst recording `adult_heel_boots` at 0.4 m/s, 7.8.
  - `ya_tube_heels` at 1.6 m/s: knee 40 degrees in loading and 31 in mid-stance (normal is about 5-10); pelvis acceleration 24.5 m/s^2.
  - `teen_girl` at 1.6 m/s: knee 43 degrees in loading.
  - `adult_heel_boots` at 0.4 m/s: swing-foot clearance 1 mm, so the toe brushes the floor.
  - Fast walkers (`adult_runner`, `sum_tee_leggings`, `sum_crop_bike` at 1.9 m/s): pelvis acceleration 18-28 m/s^2 and a 3-4 mm hand or head shake.
- Side stills at 1.4 m/s (`wk/W.png`): `ya_tube_heels` and `adult_heel_boots` walk with visibly bent knees, a creeping walk that shows at 3 m. `teen_girl` and `woman_coat` read normally at this speed.
- Turns: 150 degrees in about 2.75 s.
- Typical stays 8.8 because most of the roster walks well at platform speeds. The worst tenth drops to 7.0 on the whole-roster evidence.

### 3.2 Arms and hands: 8.50 (unchanged)
- The case owner's hand is off the grip while the case shuffles upright (`tr/`).
- Pole holder with an arm straight out sideways at shoulder height (`eye/E2.png` view 7).
- Phones held at the face and in two hands look right (`seat/SEAT.png`, `eye/E2.png` views 2-3).

### 3.3 Faces: 8.26 (typical 8.7, worst tenth 7.6)
- 32 faces at 0.85 m, neutral (`f/N1.png`, `f/N2.png`) and at smile 0.6 (`f/S1.png`, `f/S2.png`), plus 6 close-ups at 0.45 m (`f/Z.png`). 26 had not been sampled in review 55.
- Good:
  - `woman_bob`, `woman_puffer`, `ya_knit`, `adult_camisole`, `woman_elder`, `adult_string_vest`, `adult_suit_bun`, `staff_woman`, `woman_student` and `adult_runner` read as their age and sex.
  - The 0.6 smiles are gentle and natural on most people (`adult_harem`, `woman_bob`, `woman_student`, `adult_runner`, `girl`).
- Fixed: `woman_bob`'s doll stare; the twins; `man_elder`'s pale eyes.
- Still there:
  - `man_elder`'s ashen grey skin.
  - Pink scalp at `teen_girl`'s parting (`f/N2.png`, row 2, 5th).
  - `adult_smile_blouse`'s smile pulls to one side, and the neutral face already looks like a smirk.
  - `girl_small`'s blotchy lower face.
  - Neutral mouths are dour, with the corners turned down, on almost everyone.
- New:
  - `adult_harem`'s afro cap: hard, aliased edges and a straight hairline at 0.45 m.
  - `sum_shorts_asian_m`: lips parted and pushed forward at neutral, like a pout (`f/Z.png` 6th).
  - `teen_hippy`: pale cyan, wide-open eyes that read as a stare (`f/N1.png` 7th).

### 3.4 Standing, sitting, behaviour: 8.58 (unchanged)
- Seated as the game seats them (Partick inner ride, `seat/SEAT.png`): `woman_dress`, `girl_small`, `boy_kilt`, `girl_school_kilt`, `man_trews`, `adult_string_vest` (haggis at his feet), `adult_harem`, `woman_bob` and `elder_shorts` sit in the seat, with phones and bags at their feet. Small children's feet hang 9 cm above the floor, as they should. `adult_piper` cannot sit.
- Two rides (`eye/E1.png`, `eye/E2.png`) and the Ibrox platform (`eye/X.png`): natural.
  - In the car, a kilted man walks the aisle on his phone.
  - On the platform, a woman in a beret and pencil skirt walks crouched, with her phone hand forward (`eye/X.png` view 4).
- Carried over: about 2.75 s turns; the sit-down slide; the 11 who never sit.

### 3.5 Range of people: 8.40 (typical 8.8, worst tenth 7.8)
- Roster unchanged: 99 characters (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff). Skin tones and builds are spread.
- The twin pair is gone. Among 32 faces I found no new lookalikes.
- Many young faces still share one base shape: a broad nose and a small, pursed mouth (`f/N2.png`).

### 3.6 Clothing: 8.24 (typical 8.8, worst tenth 7.4)
- Partick outer (`cen/pk.json`, explore, board at 40 s, ride to 480 s):
  - Car 3 was over half one garment group for 72 s (t = 40-110), by the game's own `garmentGroup`: 6 of 11 in shorts or leggings.
  - Provenance (`python3 cen5.py cen/pk.json`):
    - At 32.9 s, `teen_hood`, `adult_runner`, `woman_dress` and `adult_fisherman_leggings` were all routed to car 3. `woman_dress` was counted as a coming skirt.
    - `woman_dress` never boarded. `adult_fisherman_leggings` and `adult_runner` boarded at 39.1 and 39.3 s.
    - `mixOver` counts routed people in `pend`, but nothing takes them out again if they do not arrive.
  - What that car looked like: 3 in shorts and 3 in leggings, so not a wall of one garment. This is why the worst tenth is not lowered.
- Hillhead inner (`cen/hh.json`): no car over half. Car 0 was 8 of 16 in trousers.
- Turned away for garment mix: 9 and 12 boarders.
- Families seen: trousers, jeans, shorts, Lycra, leggings, skirts, dresses, a pencil skirt, kilts, highland dress, trews; crop tops, a tube top, a string vest, camisoles, knits, coats, suits; trainers, boots and heels.

### 3.7 Luggage: 8.70 (typical 9.1, worst tenth 8.1)
- The haggis stays with its owner in a crowd (claim 1).
- Worst tenth:
  - The case's end-of-turn shuffle: 0.29 m in 0.25 s at up to 1.9 m/s, with the hand off the grip.
  - The haggis crabbing round legs, and its brief 3.6 m/s dash.
- Rendered at 60 Hz with matrices updated (`bagr2.mjs`), every hand bag on the Ibrox platform stayed within 0.7 m of its owner.
- Rucksacks, totes, a shopper, holdalls and cases on walkers (`wk/W.png`), with bags at seated feet (`seat/SEAT.png`).

### 3.8 Whole bodies: 8.22 (unchanged)
- Near and far models match at 3 m for the three rebuilt people, `woman_scarf`, `teen_tube` and `adult_string_vest` (`far/F.png`).
- Both rides: no far model within 6 m and no duplicates. 90 stair walks, none stalled.
- `adult_harem`'s new hair cap is aliased at its edge. The other carried faults are unchanged: scalp at a parting, `ya_ginger_lad`'s nape, banded black hair caps, `man_elder`'s grey and black blotched hair.

## 4. Top ten defects, in priority order

1. **Heel wearers walk crouched; whole-roster LEG p10 6.1.**
   - `ya_tube_heels` at 1.6 m/s: knee 40 degrees in loading and 31 in mid-stance, pelvis acceleration 24.5 m/s^2.
   - `adult_heel_boots` at 0.4 m/s: 1 mm toe clearance.
   - `teen_girl` at 1.6 m/s: 43 degrees in loading.
   - Visible at 3 m (`wk/W.png`, rows 1-2).
   - Reproduce: `cd glasgow-subway && NODE_PATH=/opt/node22/lib/node_modules node tools/people_motion.mjs --people all --base http://127.0.0.1:8611 --rec <dir>`, then `--from <dir> --items --worst 12`. For stills: `node wk.mjs ya_tube_heels,adult_heel_boots wk/w 1.4`.
2. **The wheeled case still shuffles on its own at the end of a stepped turn:** 0.29 m in 0.25 s at up to 1.9 m/s, with the hand off the grip.
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=360 node ctl6.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 2 150`, then `python3 bagan.py tr/*.json`.
3. **Faces:**
   - `man_elder`'s ashen skin.
   - `adult_harem`'s new aliased afro cap with a straight hairline.
   - Scalp at `teen_girl`'s parting.
   - `adult_smile_blouse`'s smirk.
   - `girl_small`'s smudges.
   - `sum_shorts_asian_m`'s pout.
   - `teen_hippy`'s pale stare.
   - Dour neutral mouths.
   - Reproduce: `node face4.mjs <ids> f/n 0:0 0`, `... f/s 0:0 0.6`, and `DIST=0.45` for close-ups.
4. **Garment-mix hole: a routed boarder who never boards still counts.** Partick car 3 was 6 of 11 in shorts or leggings for 72 s.
   - Reproduce: `node gp9.mjs "mode=explore&q=high&line=outer&station=partick" cen/pk 480 40`, then `python3 cen5.py cen/pk.json`.
   - Fix: take a routed person out of `pend` when they are turned away or stop boarding, or count only riders aboard plus those inside the doors.
5. **Stepped turns are slow:** 150 degrees in about 2.75 s.
6. **The haggis going round legs:**
   - It crabs up to 60 degrees sideways to the way it faces.
   - It once covered ground at 3.6 m/s, against a `vmax` of 2.3, because the tangent step is added on top of the push-out.
   - Reproduce: `node hag7.mjs "mode=explore&q=high&line=inner&station=buchanan-street" hc/b 4`, then `python3 hag7an.py hc/b.json` and the per-frame check in `NOTES.md`.
   - Fix: clamp the total move per frame to `v x dt`, and turn the body toward the way it actually moves.
7. **Eleven skirt and kilt wearers never sit** (a hard-coded list in `_canSit`). On a long ride the seats hold trousers, shorts and leggings.
8. **Sit-down foot slide** of 4-19 cm (carried over; code unchanged).
9. **Pole holders with an arm straight out sideways** (`eye/E2.png` view 7). `ya_ginger_lad`'s translucent nape.
10. **Minor and carried over:**
    - `woman_midi`'s slab bob from behind; banded black hair caps.
    - The clip-change slide, the start-up dip, the kilt opening mid-stride.
    - Children alone.
    - Brief walker overlaps: 0.08 m for 2 frames at 16 m.

## 5. What I could not observe

- **No motion was watched.** Everything comes from stills and 60 Hz logs.
- **The haggis in a car aisle with its owner walking.** It was seen seated at its owner's feet, but not walking among seated riders' feet.
- **An unforced case-owner turn.** The turn judged was forced with `GIVE=1`.
- **Not re-measured** (the code is unchanged): sit-down slides, seated rises, stair feet, the clip-change slide, `woman_midi`'s bob, `ya_ginger_lad`'s nape.
- **A harness artefact, caught and discarded.** My first bag scan (`bagx.mjs`, `bagr.mjs`) warmed up with 0.1 s ticks and no matrix updates. It showed hand bags 4-8 m from their owners, because `stepBag` read stale hand matrices. Redone with matrices updated and 60 Hz rendering (`bagr2.mjs`), every bag was within 0.7 m. The lone red holdall in `eye/X.png` view 1 is probably the same artefact of `geye.mjs`'s warm-up. Neither is scored.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Haggis walking, at an off-floor edge, blocked by a stander | Buchanan Street inner, `walkOn` owner | `hg/b.json`, `hagan.py` |
| Haggis walked past crowds, four lines past 9-10 standers each | Buchanan Street inner | `hc/b.json`, `hag7an.py`, `hc/HC.png` |
| Faces, neutral and smile 0.6; close-ups | 32 people (26 new), plus 6 at 0.45 m | `f/N1.png`, `f/N2.png`, `f/S1.png`, `f/S2.png`, `f/Z.png` |
| Seated as the game seats them | Partick inner ride: 10 ids, 9 seatable | `seat/SEAT.png` |
| Per-car garment census with provenance; overlaps, far models, duplicates, stairs | Partick outer and Hillhead inner: explore, board, ride, 480 s each | `cen/pk.json`, `cen/hh.json`, `cen5.py` |
| Player eye height walking all cars | St Enoch outer ride, 24 views | `eye/E1.png`, `eye/E2.png` |
| Platform at eye height | Ibrox outer explore | `eye/X.png` |
| Hand bags against their owners, 60 Hz | Ibrox outer explore | `bagr2.mjs` |
| Case-owner turn, 150 degrees | `man_kilt_casual`, Buchanan Street outer | `tr/` |
| Near and far models walking at 3 m | 6 people, incl. the 3 rebuilt | `far/F.png` |
| Side strides at 1.4 m/s | `ya_tube_heels`, `adult_heel_boots`, `teen_girl`, `woman_coat` | `wk/W.png` |
| Walking instrument | default six (`m.log`) and the whole roster (`mall.log`) | `m.log`, `mall.log` |

Next round, look at:
- The haggis in a car aisle while its owner walks past seated riders' feet.
- The heel walkers in the game at platform speed.
- Whether `pend` is cleaned when a routed boarder does not arrive.

# Under Glasgow: independent review of the people (review 55)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `8ea9a81c` (merged as `fc7aa23e`). The changes since review 54 (`git diff 4a793512 HEAD -- glasgow-subway/js`) are three lines:
- `js/sim/haggis.js` `followStep` takes a `clamp` argument and runs it before the leg phase is advanced. When blocked, `v` now falls by `2 x acc` a second (it was multiplied by a decay factor).
- `js/sim/people.js` `_petStep` passes the floor clamp into `followStep` instead of applying it afterwards.
- `js/sim/bags.js` `stepBag` line 293: when the owner is not walking (`settle`), the tow weight moves at 0.035 a frame in both directions. Before, only the set-down was slow.

Models, `gait.js`, `people_meta.json`, the faces and the boarding rules have not changed.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and calls `scene.updateMatrixWorld(true)` before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review55/`. Running notes are in `NOTES.md`.

New tools this round:
- `hag6.mjs`: review 54's `hag5.mjs`, with the camera placed on the owner's open side, so the edge stills are no longer taken from inside the wall.
- `gp9.mjs`: review 54's `gp8.mjs`, plus:
  - a garment census of every car every 2 s;
  - a log of every rider in and out of each car, with the exchange state;
  - a wrapper round `_routeBoarder` that records each boarder and why any were turned away.
- `cen5.py` lists every car sample over half one garment, with the moves that led to it.

**Result: weighted mean 8.30 (8.303). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Better:**
  - Against a wall, the haggis now stops and stands, and blocked by legs it stands too.
  - A case's pick-up at the start of a stepped turn is about half as fast and half as far.
  - In two rides, no car was ever above half one garment for longer than one sample.
- **Found this round:**
  - Behind a stander's legs, the haggis now stands still while its owner walks on. In one natural walk, the owner got 4.75 m away on a 1.25 m lead, so the lead was drawn as a 4.7 m line across the platform for 3 s. The haggis then sprinted at 2.3 m/s to catch up.
  - New face faults among 33 faces not sampled before.
- **Unchanged:** the walk (instrument 9.51, LEG and SMO p10 7.4), the slow turns, and the faces flagged before.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.9 | **8.50** |
| 3 | Faces | 10 | 8.6 | 7.5 | **8.16** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.8 | **8.58** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 9.0 | 7.9 | **8.56** |
| 8 | Whole bodies | 15 | 8.7 | 7.5 | **8.22** |
| | **Weighted mean** | 100 | | | **8.30** (8.303) |

0.20x8.12 + 0.10x8.50 + 0.10x8.16 + 0.10x8.58 + 0.10x8.30 + 0.15x8.24 + 0.10x8.56 + 0.15x8.22 = 1.624 + 0.850 + 0.816 + 0.858 + 0.830 + 1.236 + 0.856 + 1.233 = 8.303.

Changes against review 54 (8.268):
- **Luggage +0.14** (typical 8.9 to 9.0, worst tenth 7.7 to 7.9):
  - The haggis stands at a wall and when blocked.
  - The case's pick-up is gentler.
  - Held back by the stretched lead when the haggis is held up behind legs, and by the case's end-of-turn slide.
- **Clothing +0.14** (typical 8.8, worst tenth 7.4):
  - No car above half one garment for a sustained run in about 1,900 car samples.
  - Held at 7.4 and not higher: the mix rules have not changed, and review 54 saw 71 % trousers for 80 s with the same code. This round's clean result is partly luck of the draw.
- **The other six categories are unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The haggis's floor clamp now runs inside its step, before its legs are moved, so against a wall or the platform edge it no longer trots on the spot. Blocked by legs, it brakes to a stand instead of freezing mid-stride at about 1 m/s | **TRUE, but it causes a new fault.**<br>- **Edge:** two stations (St Enoch outer, at an off-floor boundary 3.7 m away at 45 degrees; Buchanan Street inner, 2.1 m away at 22 degrees). The owner was put 0.25 m from the boundary with his back to it. The haggis arrives, `v` falls to 0 within about 0.5 s, the legs go to 0 rad, and the position is still: 0.000-0.011 m per 0.5 s. No trotting on the spot. Stills from the open side (`hg/EB.png`): it stands beside its owner.<br>- **Blocked:** with a stander (`teen_hood`, `ya_tee_jeans`) put in its path, `v` is 0 and the legs are at 0 within 0.5 s, held for 5.5 s. It stands; it does not freeze mid-stride.<br>- **New consequence:** in the natural `walkOn` walk at Buchanan Street inner (`hg/b.json`, walk phase from 1.0 to 4.0 s), the haggis was caught behind the legs of the woman in the pencil skirt and the girl beside her. It stood (`v` 0, 0.006 m per 0.5 s) while its owner walked on at 1.2 m/s. The owner-haggis distance grew from 0.95 to 4.75 m on a 1.25 m lead, and the lead was drawn as a straight 4.7 m red line across the platform (`hg/BW.png`, bottom row). Then the haggis ran at 2.3 m/s (its `vmax`) for 1.5 s to catch up. Nothing steers it round the legs; the push-out in `followStep` holds it on the circle round the blocker. | `hg/e.json`, `hg/b.json`, `python3 hagan.py hg/b.json`, `hg/EB.png`, `hg/BW.png` |
| 2 | When the owner is not walking, a wheeled case eases into its towed pose as slowly as it eases out (about a second each way), so the start of a stepped turn no longer jumps it 0.4 m at about 2 m/s. The case still slides 0.4-0.5 m between its standing and towed places | **TRUE as stated. The remaining slide is smaller than the builder says, but it starts abruptly.**<br>- Three controlled 150-degree turns with a case handed over, at Buchanan Street outer: `adult_beret`, `man_highland` (far model) and `woman_coat`.<br>- **Start:** the base moves 0.24-0.28 m over about 1 s, peaking at 0.9-1.0 m/s. It peaked at 1.56 m/s for `adult_beret`, whose hand was coming down from her phone. Review 54 measured 0.4 m in 0.25 s at 1.9-2.25 m/s.<br>- **End:** 0.34-0.36 m in about 0.7 s, peaking at 1.33-1.51 m/s (review 54: 1.7-2.0).<br>- The ease is exponential at 0.035 a frame, so the speed jumps from 0 to its peak in one frame and then dies away. It is still per frame, so it depends on the frame rate.<br>- How it reads (`tr/COAT.png`, `tr/BERET.png`):<br>&nbsp;&nbsp;- At the start, the case tips toward her hand gradually, and the grip is near the hand. `adult_beret`'s grip was about 15 cm from her hand at 0.3-0.6 s.<br>- At the end, the tipped case swings out from behind her leg and stands upright at her side, with her hand 10-15 cm off the grip for about 0.3 s. At 2 m this reads as a small shuffle, not a scoot. The base slides; the wheels do not roll. | `tr/t_*.json`, `python3 bagan.py tr/*.json`, `VT=0.9 python3 bagj.py tr/*.json`, `tr/COAT.png`, `tr/BERET.png` |
| 3 | Not changed: turn speed, sit-down slide, crouch, faces, the haggis lagging, `ya_ginger_lad`'s neck hair, garment clumping, `woman_midi`'s bob, toe drag, clip-change slide, start-up dip, kilts, hairlines, children alone, walker overlaps | **Confirmed unchanged where measured.**<br>- Walking instrument: 9.51, LEG p10 7.4, SMO p10 7.4 (`m.log`).<br>- Turns: 150 degrees from 1.0 to 4.0 s (`tr/`).<br>- Faces: every review 54 fault is still there (section 3.3).<br>- Clothing clumping: not reproduced this round, with provenance logged (section 3.6).<br>- Overlaps: one walker pair, 1 frame, 0.18 m, at 25 m. | `m.log`, `f/N2.png`, `cen/*.json` |

## 2. Status of REVIEW_54's top ten

| # | REVIEW_54 item | Now |
|---|---|---|
| 1 | Case slides after a stepped turn; 0.4 m start jump | **Improved.**<br>- Start: 0.25 m over about 1 s at up to 1 m/s.<br>- End: 0.35 m in 0.7 s at up to 1.5 m/s, with the hand off the grip briefly. |
| 2 | Haggis trots on the spot at a wall or the edge | **Fixed** at both stations tried. |
| 3 | Blocked haggis freezes mid-stride | **Fixed:** it stands. But it now stands while its owner walks away (new item 1). |
| 4 | Train crowd over half one garment | **Not reproduced.**<br>- Kelvinbridge inner: 0 of 960 car samples over half.<br>- Govan outer: 1 of 960, a single 2 s sample during alighting.<br>- Rules unchanged, so still a risk. |
| 5 | Faces | Unchanged, plus new faults (section 3.3). |
| 6 | Slow stepped turns | Unchanged: about 3 s for 150 degrees. |
| 7 | Heel and pencil-skirt crouch; LEG and SMO p10 7.4 | Unchanged (`m.log`). |
| 8 | Sit-down foot slide | Not re-measured; the code is unchanged. |
| 9 | Haggis lags with a stretched lead; `ya_ginger_lad`'s nape | Lag: **worse in the worst case**, a 4.75 m stretch when held behind legs. Nape: not re-rendered; the model is unchanged. |
| 10 | Minor and carried over | Carried over (code and models unchanged). Pole reach: two standers in the Cowcaddens ride held an arm straight out sideways at shoulder height (`eye/E1.png`, views 6 and 10). |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- `people_motion.mjs --people default`: 9.51; LEG p10 7.4; SMO p10 7.4; worst recording `boy` at 1.9 m/s, 8.8.
- Worst items: `woman_coat` loading-response knee 32.5 degrees; `boy` and `woman_midi` pelvis acceleration 13.7-14 m/s^2; `woman_midi` hand and head tremor 3.5 mm.
- Turns: about 50 degrees a second.

### 3.2 Arms and hands: 8.50 (unchanged)
- A case owner's hand is on the grip through the turn. It is off the grip by 10-15 cm while the case sets itself upright, and at the very start when the hand is still coming off a phone.
- Pole holders with an arm out straight sideways at full reach (`eye/E1.png`).

### 3.3 Faces: 8.16 (typical 8.6, worst tenth 7.5)
- 38 faces at 0.85 m, neutral (`f/N1.png`, `f/N2.png`) and at smile 0.6 (`f/S1.png`, `f/S2.png`), plus 6 close-ups at 0.45 m (`f/Z.png`). 33 had not been sampled in review 54.
- Good:
  - `man_longcoat`, `man_beard`, `adult_tophat`, `elder_woman_coat`, `ya_fedora`, `man_puffer` and `teen_runner` read as their age and sex.
  - Most 0.6 smiles are gentle and natural: `man_commuter`, `staff_hivis`, `ya_smile_dress`, `ya_ginger_braid`.
- Unchanged:
  - `woman_scarf` and `adult_harem` are identical twins (`f/N2.png`, last two).
  - `man_elder` has ashen grey skin and pale eyes.
  - `teen_girl` and `teen_skirt` show pink scalp at the parting.
  - Neutral mouths are dour almost everywhere.
- New:
  - `woman_bob`: chalk-white skin with bright cyan eyes reads as a doll, staring.
  - `girl_small`: a smudged, mottled lower face, visible at 0.45 m.
  - `adult_smile_blouse`, one of the "smiling" set: the 0.6 smile is a pinched, lopsided smirk.
  - `boy_small`, `teen_skater`, `ya_tee_jeans`: black hair caps with light horizontal bands, like a stretched texture.
  - Hard, ruler-straight hairlines on `man_highland`, `boy` and `staff_hivis`.
  - `adult_vneck` and `adult_smile_blouse` are near-lookalike blondes.

### 3.4 Standing, sitting, behaviour: 8.58 (unchanged)
- Cars (24 views on a Cowcaddens outer ride, `eye/E1.png`, `eye/E2.png`) and the St Enoch platform (`eye/X.png`) look natural: phones, rucksacks, a case owner standing with her case.
- Seated `teen_crop_leggings` and `sum_tube_denim` sit in the seat, with phones and a bag at the feet (`seat/SEAT.png`).
- 11 skirt and kilt wearers are hard-coded never to sit (`people.js` `_canSit`, line 890): `woman_mini`, `woman_midi`, `teen_skirt`, `woman_sash`, `man_kilt_casual`, `man_highland` and others, plus `adult_cyclist` by fit. A long ride shows standing skirts beside seated trousers. This is judged as the game seats people; it is behaviour, not a broken garment.
- Carried over: about 3 s turns; the sit-down slide.

### 3.5 Range of people: 8.30 (unchanged)
- Roster unchanged: 99 characters (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff).
- Garment groups in the roster: 45 trousers, 38 shorts or leggings, 11 skirts and dresses, 5 kilts.

### 3.6 Clothing: 8.24 (typical 8.8, worst tenth 7.4)
- Kelvinbridge inner (`cen/kb.json`, explore, board at 40 s, ride to 480 s):
  - 4 cars x 240 samples; none over half.
  - 37 boarders routed, 10 turned away (7 for garment mix).
  - Platform within 15 m: one sample at 55 % trousers (11 of 20, t = 460 s).
- Govan outer (`cen/gv.json`):
  - One car sample over half: car 0 at t = 330 s, 3 of 5 trousers.
  - Provenance: `teen_runner` (shorts) and `girl_school_kilt` got off at 329.1-329.3 s. `ya_smile_halter` (trousers) was marked leaving and was still aboard.
  - Not counting leavers, as `mixLeaves` does, the car was 2 of 4. The rules were not bypassed; this is the moment of alighting.
  - 39 routed, 18 turned away (13 for garment mix). Platform at most 44 %.
- No bypass of the boarding or alighting rules was seen. Two paths would allow one:
  - `mixOver` and `mixLeaves` do nothing below 4 people.
  - A standing child (`kidUp`) skips both rules.
- Families seen: trousers, shorts, leggings, skirts, dresses, kilts, highland dress, trews.

### 3.7 Luggage: 8.56 (typical 9.0, worst tenth 7.9)
- Gains: claims 1 and 2.
- Worst tenth:
  - The haggis held behind legs with a 4.7 m lead, then a 2.3 m/s sprint.
  - The case's end-of-turn shuffle, 0.35 m at up to 1.5 m/s with the hand off the grip.
- Rucksacks on backs and bags at seated feet look right (`eye/X.png`, `seat/SEAT.png`).

### 3.8 Whole bodies: 8.22 (unchanged)
- Far models at 7 m match their near models (`far/F.png`): `woman_mini`, `adult_piper`, `ya_ginger_lad`, `sum_crop_bike`, `elder_man_cap`, `girl_ginger`.
- Both rides: no far model within 6 m, no duplicates, 65 stair walks with none stalled.
- Carried over: scalp in two heads of hair, `ya_ginger_lad`'s nape, `sum_tube_denim`'s blocky hair. New: banded black hair caps.

## 4. Top ten defects, in priority order

1. **A haggis held behind someone's legs stands still while its owner walks away.** The lead stretches to 4.7 m (3.8 times its length), then the haggis sprints at 2.3 m/s.
   - Reproduce: `node hag6.mjs "mode=explore&q=high&line=inner&station=buchanan-street" hg/b`, then `python3 hagan.py hg/b.json` (walk phase, 1.0-4.0 s); see `hg/BW.png`.
   - Fix: when blocked, steer it round the blocker (take the tangent of the `clear` circle), or let the lead's length pull it through. Whatever is done, the lead should never be drawn longer than 1.25 m.
2. **The wheeled case still shuffles about 0.35 m on its own at the end of a stepped turn**, at up to 1.5 m/s with a velocity step, and with the hand off the grip briefly. At the start it moves 0.25 m (gentler, at up to 1 m/s).
   - Reproduce: `GIVE=1 BAG=trolley NOMOVE=1 FR=360 node ctl6.mjs "mode=ride&q=high&line=outer&station=buchanan-street" tr/t move 3 150`; see `tr/COAT.png` row 3.
   - Fix: pivot the case upright about its wheels rather than lerping its base. Use a per-second, smoothstep ease so the speed starts from 0.
3. **Faces:**
   - Unchanged: the `woman_scarf`/`adult_harem` twins; `man_elder` ashen; scalp at the parting of `teen_girl` and `teen_skirt`; dour neutral mouths.
   - New: `woman_bob`'s chalk-white skin and cyan stare; `girl_small`'s smudged face; `adult_smile_blouse`'s lopsided smirk; banded black hair caps; ruler-straight hairlines.
   - Reproduce: `node face4.mjs <ids> f/n 0:0 0` and `... f/s 0:0 0.6`; `DIST=0.45` for close-ups.
4. **Heel and pencil-skirt crouch; LEG and SMO p10 7.4** (`m.log`): `woman_coat`'s knee in loading 32.5 degrees; pelvis acceleration 14 m/s^2 in `boy` and `woman_midi`.
5. **Stepped turns are slow:** 150 degrees in about 3 s (`tr/`, flag `TT`).
6. **Garment mix is still left to chance.** Clean this round, but 71 % for 80 s in review 54 with the same code. The rules skip cars under 4 people and standing children.
   - Reproduce: `node gp9.mjs "mode=explore&q=high&line=inner&station=kelvinbridge" cen/kb 480 40`, then `python3 cen5.py cen/kb.json`.
7. **Eleven skirt and kilt wearers never sit** (a hard-coded list in `_canSit`). Over a ride the seats hold trousers, shorts and leggings, and the skirts all stand.
8. **Sit-down foot slide** of 4-19 cm (carried over; code unchanged).
9. **Pole holders at full reach** with an arm straight out sideways at shoulder height (`eye/E1.png`). `ya_ginger_lad`'s translucent nape (carried over).
10. **Minor and carried over:**
    - `woman_midi`'s slab bob from behind.
    - Toe drag, the clip-change slide, the start-up dip.
    - The kilt opening mid-stride.
    - Children alone.
    - Brief walker overlaps (1 frame, 0.18 m this round).

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz logs.
- **The haggis at the track edge, as against the back wall.** The two boundaries found by the scan were not identified. Both behaved the same.
- **An unforced case-owner turn in a car.** The three turns judged were forced with `GIVE=1`.
- **Not re-measured** (the code is unchanged): sit-down slides, seated rises, stair feet, the clip-change slide, `woman_midi`'s bob, `ya_ginger_lad`'s nape.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Haggis walking, at an off-floor boundary, blocked by a stander | St Enoch outer and Buchanan Street inner, `walkOn` owner | `hg/e.json`, `hg/b.json`, `hg/EB.png`, `hg/BW.png` |
| Controlled case-owner turns, 150 degrees | Buchanan Street outer: `adult_beret`, `man_highland` (far model), `woman_coat` | `tr/t_*.json`, `tr/BERET.png`, `tr/COAT.png` |
| Faces, neutral and smile 0.6; close-ups | 38 people (33 new) plus 6 close-ups | `f/N1.png`, `f/N2.png`, `f/S1.png`, `f/S2.png`, `f/Z.png` |
| Per-car garment census with provenance; overlaps, far models, duplicates, stairs | Kelvinbridge inner and Govan outer: explore, board, ride, 480 s each | `cen/kb.json`, `cen/gv.json`, `cen5.py` |
| Seated garments as the game seats them | Partick inner car: 9 ids tried, 2 seatable | `seat/SEAT.png`, `seat/s.log` |
| Player eye height walking all cars | Cowcaddens outer ride, 24 views | `eye/E1.png`, `eye/E2.png` |
| Platform at eye height | St Enoch inner explore | `eye/X.png` |
| Near and far models walking at 7 m | 6 people | `far/F.png` |
| Walking instrument | default roster | `m.log`, `m/` |

Next round, look at:
- The haggis in a dense crowd, with the owner walking: how often it is held up, and the lead's length.
- An unforced case-owner turn in a car.
- Sit-downs, if any sit code changes.

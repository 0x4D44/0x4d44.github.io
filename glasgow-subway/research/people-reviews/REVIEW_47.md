# Under Glasgow: independent review of the people (review 47)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `33f32fd5`. The people commits since review 46 (read with `git show` / `git diff d1a3f53d HEAD`):
- `21438996` (`people.js`, `index.js`): `settle` hands a boarder who must turn more than 0.3 rad to the gait (`settleTurn`, `settleGait`; the rider is briefly not static). Once they face the seat, `gaitRelease` gives the legs back to the idle clip while they still stand, and only then does the linear sit tween start. `_pace` no longer puts the phone away while `settleTurn` is set. In `index.js`, a boarder held up more than 0.5 m short of their seat takes a free seat whose feet spot is within 0.3 m. A child with no such seat still goes to their own.
- `f408ce5c`, `33f32fd5` (`assets_people_mpfb.py`, rebuilt `people.glb` / `people_lod.glb`): the face build skips mouth-angle, lip-ext, mouth depth, mouth forward/back and brows-angled-down targets. `man_longcoat` now has brown eyes. `armfit.js` ARM_OUT values changed slightly with the rebuild.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review47/`. Running notes are in `NOTES.md`. Per-settle phase analysis is `an2.py` over the `*.json` frame logs written by `gsit.mjs`. That script is review 46's, extended to log the settle phase and gait weights and to add side and front cameras that hide the rider's own crowd.

**Result: weighted mean 8.28 (8.275). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **The turn before sitting is now a real stepped turn.** In all 11 turned sit-downs the feet lift and step: 10-48 cm of lifted travel per foot bone, and under 1 cm of grounded slide during the turn itself. The turntable spin reported in review 46 is gone from the sit-down.
- **Two slides are left around it:**
  - **The hand-back to the clip.** Each foot bone slides 4-20 cm along the floor in 0.35 s. In 2 of 11 settles one foot glides 35-39 cm at about 1.1 m/s, lifted only 1-3 cm: the turn ends with the feet together, and the idle clip's stance pulls one foot out (`d/h_2_settle_sum_shorts_asian_m_R.png`).
  - **The sit itself.** Each foot bone travels 5-20 cm along the floor as the stance narrows.
- **New finding: standing up still uses the turntable.** `rise` turns the body 86 degrees in 0.75 s as an eased tween while the hips rise. Each ball bone slides 30-52 cm along the floor, lifted 2-6 cm, at up to 1.2 m/s (2 of 3 rises; `r/r_1_rise_woman_midi_R.png`).
- **Texters keep their phones through the turn** (3 of 3: hold 1.0 at every frame).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.0 | **8.08** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.7 | **8.36** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.6 | **8.44** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.4 | **8.24** |
| 7 | Luggage | 10 | 8.8 | 7.6 | **8.32** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.28** (8.275) |

0.20x8.08 + 0.10x8.42 + 0.10x8.36 + 0.10x8.44 + 0.10x8.30 + 0.15x8.24 + 0.10x8.32 + 0.15x8.26 = 1.616 + 0.842 + 0.836 + 0.844 + 0.830 + 1.236 + 0.832 + 1.239 = 8.275.

Changes against review 46 (8.267):
- **Arms +0.18.** Texters no longer show empty hands at the chin during the turn.
- **Faces +0.04.** `adult_smile_blouse`'s pout is gone, and `man_longcoat`'s eyes are brown. But `woman_midi` still frowns, and `girl_ginger` and `ya_smile_polo` are still lopsided.
- **Behaviour +0.02.**
  - Better: the sit-down turn is stepped.
  - Not fixed: the hand-back glide, and the feet narrowing during the sit.
  - Found this round: the same turntable fault on the rise.
- **Walking -0.08.** A different sample of 8 people scored LEG p10 6.2 (review 46: 7.1). I also found an overlong lunging step when people set off. The gait code is unchanged; this is a sampling difference, not a regression.
- **Range, Clothing, Luggage, Whole bodies unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The turn is stepped by the gait; the phone stays out; the gait hands the legs back while standing, then the sit starts. Feet lift and step 20-45 cm; slide 3-25 cm in the hand-back; ankles end 5-14 cm from the sit start; stance 37-44 to 27-34 cm | **Mostly true. The hand-back can be worse than claimed.**<br>- 13 settles on 5 stations: Partick outer, Ibrox inner, Kelvinhall outer, Hillhead inner (×2 runs). 11 needed a turn (73-125 degrees). The phases are always: turn under the gait (1.2-1.65 s), release (0.35 s), linear sit (1.0 s).<br>- **Turn:** feet lift 3-5 cm and step; lifted travel is 10-48 cm per bone; grounded slide is 0.3-0.9 cm. Body yaw turns at a steady rate while the feet stay planted between steps. That is a natural pivot.<br>- **Release:** grounded slide is 4-20 cm per bone. In 2 of 11 settles a foot glides 35-39 cm along the car, lifted 1-3 cm, at a peak of 1.06-1.15 m/s:<br>&nbsp;&nbsp;- `ya_spiky`, Ibrox inner: `ball_l` z 1.49 to 1.88 m in 0.3 s.<br>&nbsp;&nbsp;- `sum_shorts_asian_m`, Hillhead inner: `ball_r` z 5.00 to 4.65 m.<br>&nbsp;&nbsp;The gait's quiet stance leaves the feet together, and the clip's stance slides one out. The builder's "3-25 cm" counts only the part within 1.5 cm of the floor; the rest of the glide is 2-4 cm up, still not a step.<br>- **Sit:** grounded path 5-20 cm per bone at 0.4-0.7 m/s; ankles end 3-14 cm from where the sit began; stance 38-46 to 25-36 cm. Matches the claim. Visible from the front at 1 m as the feet drawing together (`d/h_1_settle_ya_bootcut_Vf.png`, bottom row).<br>- **Phone:** 3 texting boarders (`ya_bootcut` Hillhead, `sum_shorts_asian_m` Kelvinhall, `adult_tattoo_muscle` already seated) held at 1.0 in every logged frame. `ya_spiky` kept a call through the turn and put it away in the sit (that is intended).<br>- Pelvis step at most 1.4 cm per frame; lowest foot bone 1.7-2.5 cm. | `an2.py a/*.json b/*.json c/*.json d/*.json` |
| 2 | A boarder held up short takes a free seat within 0.3 m; a child with none still glides to theirs | **Code is as described; the effect was not seen.** In the 13 settles the pelvis travelled 29-47 cm horizontally during the sit, so none glided seated. I did not catch a held-up boarder or a gliding child. | `index.js` diff; `an2.py` "pelvis travel" lines |
| 3 | Faces rebuilt without held expressions; `woman_midi`'s scowl and `adult_smile_blouse`'s pout gone; `man_longcoat` brown eyes; `ya_smile_dress` may still be lopsided | **Partly true.**<br>- `adult_smile_blouse`: lips now flat and neutral, pout gone.<br>- `man_longcoat`: brown eyes.<br>- `ya_smile_halter`: brows are now level.<br>- **`woman_midi` still reads as frowning at 0.6 m:** the inner brows sit low and the forehead and glabella have crease lines. Her smile under those brows still reads as wry (`f/close.png`, top left pair). That is milder than review 46, not gone.<br>- `girl_ginger`: mouth lopsided at rest, one corner up, and a crooked smile.<br>- `ya_smile_polo`: lopsided smile.<br>- `ya_smile_dress`: slightly lopsided, as the builder said.<br>- `man_elder`: grey eyes so pale they read as blank at 0.6 m (`f/n.png`, row 4 col 3).<br>- `teen_hood`: thick, puckered lips and a ragged hairline. | `f/n.png`, `f/s.png`, `f/close.png` (24 people) |
| 4 | Not changed: brisk crouch / heels, kilts, turn-aways, pole hands, bursts, phones in hair, hair caps, far holes, seated skirt shells, `sit_phone` knee, bags at shins | **Confirmed where re-checked.**<br>- **Walking instrument**, 8 people not measured by review 46: overall 9.39; LEG 7.6 with p10 6.2; STR p10 7.0; SMO p10 7.4. Worst is `adult_heel_boots` at 1.9 m/s with 7.9: cadence 154 against an expected 132, step 0.74 against 0.86, loading knee 36 degrees. `adult_beret` (heels) also takes short steps.<br>- **Seated skirts**, game-seated with `_canSit` (Cowcaddens inner ride):<br>&nbsp;&nbsp;- `woman_midi`: still a stiff domed bell over the thighs (`g/MS.png`).<br>&nbsp;&nbsp;- `woman_sash`: a sack (`g/S2.png` row 4).<br>&nbsp;&nbsp;- `ya_smile_dress`: hem a stiff ring (row 5).<br>&nbsp;&nbsp;- `woman_dress`, `girl_small`: fine.<br>&nbsp;&nbsp;- `_canSit` is false on every seat for `woman_coat`, `adult_beret`, `woman_mini`, `teen_tube`, `teen_skirt`, `elder_woman_dress` and `man_kilt_casual`. They stand, which is safe. | `m/items.log`, `g/` |

## 2. Status of REVIEW_46's top ten

| # | REVIEW_46 item | Now |
|---|---|---|
| 1 | Turntable spin before sitting, 24-53 cm per foot | **Fixed for the sit-down.** Stepped in 11 of 11 turned settles. Left over: the hand-back glide, 4-20 cm and up to 35-39 cm (2 of 11). **The same turntable is still in `rise`**: 30-52 cm per foot in 2 of 3 stand-ups (new item 1). |
| 2 | Texters lose the phone in the turn | **Fixed.** 3 of 3 held at 1.0. |
| 3 | Walking LEG p10 7.1, SMO p10 7.7 | Unchanged code. New sample: LEG p10 6.2, STR p10 7.0, SMO p10 7.4. |
| 4 | `sit_phone` knee lifts before the hips drop | Not changed (builder says so). Not re-imaged. |
| 5 | Faces: scowls, pout, lopsided smiles, pale eyes | **Partly fixed.** The pout and `man_longcoat`'s eyes are fixed. `woman_midi`'s brows, `girl_ginger` and `ya_smile_polo` remain. |
| 6 | Stiff seated skirts | **Unchanged** (`g/MS.png`, `g/S2.png`). |
| 7 | Feet drawn together 5-8 cm in the sit | **Unchanged in kind.** Ankles end 3-14 cm from the sit start; grounded path 5-20 cm. |
| 8 | Bags at feet vs shins | **Partly answered.** `teen_shorts_lad`'s carrier stands at his shin as he sits, beside it rather than through it (`b/i_1_settle_teen_shorts_lad_S.png`). |
| 9 | Rise swap step 2.8 cm | Rise pelvis step measured at 1.9-2.5 cm per frame. |
| 10 | Hair caps, kilt gap, `woman_sash` sack, turn-aways | **Unchanged.** `teen_hood`'s ragged hairline (`f/n.png`); `man_kilt_casual`'s kilt opens wide mid-stride (`far/F0.png`). |

## 3. Per-category reasoning

### 3.1 Walking: 8.08 (typical 8.8, worst 7.0)
- **Instrument** (`m/rec.log`, `m/items.log`): 8 new people, overall 9.39. LEG mean 7.6, p10 6.2. Heel and pencil-skirt wearers walk with short, fast steps and bent knees: `adult_heel_boots` 7.9 at 1.9 m/s.
- A second run on `man_puffer`, `man_commuter` and `man_kilt_casual` scored 9.40 (`m/items2.log`).
- **Lunge on setting off** (not scored by the instrument):
  - Viewer walk demanded at 1.2 m/s from a standstill: `man_puffer`, `man_kilt_casual` and `man_commuter` take a 0.90-0.97 m step at 0.7-0.9 s. The pelvis drops 15-21 cm, a fencer's lunge (`far/SP.png` frames 3-4). The other 7 tested peak at 0.43-0.70 m.
  - In the game (`gstart.mjs`, Partick outer explore, 52 starts): peak ankle separation reached 0.81-0.84 m with a pelvis drop of 11-14 cm (`woman_midi`, `adult_cyclist` at 0.84 m/s, `teen_hood`). Steady walking is about 0.6 m. About 1 start in 10 is visibly overlong.
- **The stepped turn before sitting reads as a natural pivot-and-step.** Good.

### 3.2 Arms and hands: 8.42 (typical 8.9, worst 7.7)
- Texters keep the phone up at the chest through the turn and into `sit_phone` (`d/h_1_settle_ya_bootcut_Vs.png`).
- Seated riders who pick a phone up after sitting do so cleanly (`man_elder`, `sum_shorts_asian_m`).
- Worst tenth: carried-over open pole hands. The phone is put away during the rise: hold 0.8 to 0 over 0.3 s while the body spins (`r/`).

### 3.3 Faces: 8.36 (typical 8.8, worst 7.7)
- 24 faces at 0.6 m, neutral and smiling (`f/n.png`, `f/s.png`). Most smiles are gentle, closed-mouth and fitted.
- Worst tenth:
  - `woman_midi`: furrowed, low inner brows with crease lines.
  - `girl_ginger`: lopsided at rest and when smiling.
  - `ya_smile_polo`: crooked smile.
  - `man_elder`: blank pale eyes.
  - `teen_hood`: puckered thick lips and a ragged hairline.

### 3.4 Standing, sitting, behaviour: 9.0 typical, 7.6 worst = 8.44
- **Good:** stepped turn, straight-down sit, phones kept, no seated glides seen, no foot below 1.7 cm.
- **Worst tenth:**
  - The stand-up spin with feet gliding 30-52 cm flat (2 of 3 rises).
  - The 35-39 cm hand-back glide (2 of 11 settles).
  - The feet narrowing 5-20 cm during the sit.
  - The `sit_phone` knee (carried over).

### 3.5 Range of people: 8.30 (unchanged)
- Roster of 99. Every kind was seen in the Bridge Street ride and the Buchanan Street explore.

### 3.6 Clothing: 8.24 (unchanged)
- **Census:**
  - `cen/bs.json`, Bridge Street outer ride, 200 s: no sample over 50 %. Highest: shorts 44 % on the platform, trousers 39 % in a saloon.
  - `cen/bu.json`, Buchanan Street inner explore, 150 s: highest 48 %.
  - Kinds seen: trousers, shorts, leggings, skirts and dresses, kilts, highland dress, trews, pleated skirts.
- **Seated skirt shells unchanged:** `woman_midi` dome, `woman_sash` sack, `ya_smile_dress` ring.

### 3.7 Luggage: 8.32 (unchanged)
- Bags stand at the feet during and after the sit (`teen_shorts_lad` carrier, `woman_midi` handbag).
- The haggis waits at the string vest's boot on a lead that hangs straight down (`g/S2.png` row 1).
- No floating or sinking seen.

### 3.8 Whole bodies: 8.26 (unchanged)
- No far model within 6 m, no duplicates and no overlaps in either census run.
- The far model walking at 4 m is near-identical to the near one (`far/F0.png` against `far/F1.png`).
- Hair caps and ragged hairlines carried over.

## 4. Top ten defects, in priority order

1. **Standing up is a turntable spin.**
   - `rise` rotates the whole standing-up pose about 86 degrees in 0.75 s (eased tween `E`) while the hips rise. The feet are not stepped: each ball bone glides 30-52 cm along the floor, lifted 2-6 cm, at up to 1.2 m/s.
   - Seen in `woman_midi` (near model) and `adult_suit_bun` (2 of 3 rises).
   - Reproduce: `KIND=rise FR=150 NEARCAM=2.5 SIDE=1 node gsit.mjs "mode=ride&q=high&line=outer&station=ibrox" r/r 1200 3`, then `python3 an2.py r/*.json`. Look at `r/r_1_rise_woman_midi_R.png`.
   - Fix: rise straight up facing the seat's way, then turn under the gait as the sit-down now does.
2. **The hand-back from gait to clip glides a foot up to 35-39 cm.**
   - The stepped turn leaves the feet together. The idle clip's stance then slides one foot out in 0.35 s, 1-3 cm up, at about 1.1 m/s (2 of 11 settles); the other settles slide 4-20 cm.
   - Reproduce: `FR=240 NEARCAM=2.2 SIDE=1 node gsit.mjs "mode=ride&q=high&line=inner&station=hillhead" d/h 1200 4`; `d/h_2_settle_sum_shorts_asian_m_R.png`, frames 17-20.
   - Fix: plant the gait's last step at the clip's stance (`plantAt` the clip ankles), or step the foot out.
3. **Walking instrument: LEG p10 6.2, STR p10 7.0, SMO p10 7.4.**
   - Heel and pencil-skirt wearers walk with short, fast, bent-knee steps: `adult_heel_boots` 7.9 at 1.9 m/s; `adult_beret`.
   - Reproduce: `node tools/people_motion.mjs --people teen_skirt,adult_heel_boots,woman_mini,man_kilt_casual,elder_shorts,girl_shorts,adult_beret,sum_crop_bike --rec m/rec`, then `--from m/rec --items --worst 12`.
4. **Lunge on setting off.**
   - The second or third step after a start is 0.8-0.97 m long with a 11-21 cm pelvis drop. Worst in the viewer: `man_puffer`, `man_commuter`, `man_kilt_casual`. In the game: `woman_midi`, `adult_cyclist`, `teen_hood`.
   - Reproduce: `node lunge.mjs man_puffer,man_commuter 1.2`; `node side.mjs man_puffer far/sp 1.2` (`far/SP.png`); `node gstart.mjs "mode=explore&q=high&line=outer&station=partick" 90`.
   - The instrument has no item for it. Cap the step length during acceleration.
5. **The feet are drawn together 5-20 cm during the sit blend** (ankles end 3-14 cm from where the sit began).
   - Visible from the front at 1 m: `d/h_1_settle_ya_bootcut_Vf.png`, bottom row.
6. **Faces.**
   - `woman_midi` still frowns: low inner brows and crease lines.
   - `girl_ginger` is lopsided at rest and when smiling; `ya_smile_polo`'s smile is crooked.
   - `man_elder` has blank pale eyes; `teen_hood` has puckered lips.
   - Reproduce: `DIST=0.6 node face4.mjs <ids> f/n "0:0" 0` (`1` for the smile); `f/close.png`.
7. **Seated skirt shells:** `woman_midi`'s bell, `woman_sash`'s sack, `ya_smile_dress`'s ring.
   - Reproduce: `node gseat.mjs "mode=ride&q=high&line=inner&station=cowcaddens" g/a woman_midi,woman_sash,ya_smile_dress`; `g/MS.png`, `g/S2.png`.
8. **`sit_phone` crossed-leg knee lifts before the hips drop** (carried over; not re-imaged).
9. **Phone put away as a rider stands, while the body spins** (hold 0.8 to 0 in 0.3 s): two motions at once, easy to read as a fumble.
10. **Carried over:**
    - Hair caps and ragged hairlines (`teen_hood`).
    - The kilt opening wide mid-stride (`man_kilt_casual`, `far/F0.png`).
    - Turn-aways, open pole hands, phones in long hair.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **Claim 2 (nearby seat for a held-up boarder; a child gliding to theirs) was not seen in action.** No settle in 13 had a seated glide over 0.47 m horizontally.
- **Side cameras were still sometimes blocked** by walkers in the platform crowd, which my hiding did not cover (`c/k_1_..._Vs.png`, staff in hi-vis).
- **Only 3 rises were logged.** The rise spin is 2 of 3; its rate across the game is not known.
- **Not re-measured:**
  - Stair feet.
  - Pole hands close up.
  - Aisle walkers past seated knees.
  - Haggis walking (seated only).
  - The `sit_phone` knee.
  - Kilts mid-stride beyond `far/F0.png`.
  - Children alone on platforms.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Sit-downs at 60 Hz with phase split (turn / release / sit), per-bone grounded and lifted travel, pelvis, lowest bone, LOD, hold; player 2.2-2.5 m away; eye, side and front cams | 13 settles: Partick outer, Ibrox inner, Kelvinhall outer, Hillhead inner ×2 runs (`man_elder`, `sum_shorts_asian_m` ×3, `boy_kilt`, `teen_shorts_lad`, `ya_spiky`, `adult_tattoo_muscle`, `ya_smile_halter`, `staff_woman`, `ya_ginger_lad`, `ya_bootcut`, `man_puffer`, `adult_casual2`) | `a/`, `b/`, `c/`, `d/`, `an2.py` |
| Stand-ups at 60 Hz | Ibrox outer: `woman_midi`, `ya_smile_dress`, `adult_suit_bun` | `r/` |
| Game-seated skirts, kilts and the haggis near, 4 views × 3 moments | `woman_midi`, `woman_sash`, `ya_smile_dress`, `woman_dress`, `girl_small`, `adult_string_vest` + haggis; `_canSit` false for 7 others | `g/` |
| Faces at 0.6 m, neutral and smiling | 24 people, including every one review 46 named | `f/` |
| Walking instrument | 8 + 3 people | `m/` |
| Starts in the game | Partick outer explore, 52 starts | `gstart.mjs` output in `NOTES.md` |
| Near against far model walking at 4 m | 12 people | `far/F0.png`, `far/F1.png` |
| Census, far model within 6 m, duplicates, overlaps | Bridge Street outer ride 200 s; Buchanan Street inner explore 150 s | `cen/` |
| Player-eye views | St Enoch inner platform, 6 directions; Govan inner ride, walking every car | `eye/se.png`, `eye/gv.png` |

Next round, look at: more rises (an alighting crowd); a held-up boarder taking a nearby seat; stair feet; pole hands at 1 m; the haggis walking in a crowd.

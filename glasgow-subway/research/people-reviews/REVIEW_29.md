# Under Glasgow: independent review of the people (review 29)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `40172623`. Two commits since review 28 touch the people, both in `js/sim/people.js` (read-only diff):
- `7d925402`, `_settle()` (line 1218): `p.standingBack = false` is now cleared when a stepping-aside walk settles.
- `40172623`, `_play()` (line 616): a rider choosing a `sitalt` clip (`sit_look*`, `sit_cross*`) takes plain `sit` instead if someone is already in `state === 'sit'` on the same bench side (`sign(x)`) within 0.75 m along the car.

`people.glb`, `people_lod.glb` and the walk code did not change. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices each tick before reading bones (I rewrote `gcar.mjs` as `gcar2.mjs` to do so; review 28's `gcar.mjs` did not yield).

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.88 (7.882). Gate NOT met.** Four categories are at 8 or above: Luggage 8.12, Range 8.06, Behaviour 8.04 and Whole bodies 8.04. Four are below 8: Walking 7.68, Faces 7.68, Arms 7.80 and Clothing 7.80.

In short:
- **Claim 1 (standingBack cleared on arrival) holds.** Two 600 s explore runs: 0 person-seconds with the flag set while not walking (review 28: 1314 and 1867) and 0 later wander walks carrying it (review 28: 7 and 13) (`v/sticky_bu.log`, `v/sticky_se.log`).
- **Claim 2 (no wide-armed sit next to a seated neighbour) holds as code, and the fault it targeted is largely gone.** In eight rides (1,600 s of ride) I found no seated hand resting on a seated neighbour's knee at the 10 cm threshold review 28 used; at 12 cm there were two marginal ones (teen_tee in the plain `sit_idle`, 11.5 cm from boy's leg, Kelvinbridge outer; man_trews in `sit_cross_legs`, 12.0 cm, at t = 5 s) (`e/nb_*.log`). The limit the builder named is real: in 6 of 8 rides one rider was in a look-about or crossed-leg sit with a seated neighbour 0.55 m away, every time at t = 5 s, i.e. riders placed together at spawn. Those clips are re-chosen later, so it clears itself.
- **But the hand-contact problem has moved to standers:**
  - A standing rider is placed over a seated rider's knees, and the seated rider's hand rests on the stander's leg for the whole sample: ya_shorts (`sit_phone`) with man_highland (pole) between her knees, 3.6 cm, 85 s (Hillhead inner, `e/nh_ya_shorts-man_highland.png`); teen_boy (`sit_look`) with his hand on teen_skirt's shin, 5.7 cm, 85 s (Kinning Park inner, `e/nbk_teen_boy-teen_skirt.png`).
  - Standers in `idle_a` stand hip to hip with their hand against the neighbour's thigh, 2.5-6.5 cm, in 4 of 8 rides (Govan, Cowcaddens, Shields Road; `e/ST.png`, `e/NB3.png`). woman_mini's phone hand was 3.3 cm from adult_fisherman_leggings' neck line (St George's Cross).
- **Claim 3 (not changed) holds.** The walking instrument over the whole roster is identical to review 28 line for line (`m/items.log`). The other listed items are as before (`pz/p_bu.log`, `n/CL.png`, `n/FAR.png`, `l/*.png`).
- **New this round:**
  - **Turned-away boarders at the edge: 12 of 43 (28%)** across six explore runs, against 7 of 54 (13%) in review 28. Several are close to the camera: man_highland 0.68 m from the edge for 207 s at 1.9 m (Ibrox outer); man_beard 0.24 m from the edge at 2.2 m and woman_scarf 0.64 m at 2.1 m (Hillhead inner); woman_puffer 0.33 m for 200 s at 5.6 m (Buchanan Street outer, again 4 of 12) (`v/aw3_*.log`).
  - **A visible 0.6 m snap at 3 m.** At Govan (inner ride), alighter girl_ginger stalled 0.3 m beyond the platform edge line, was released, and jumped 0.6 m in one `setBays` snap 3.0 m from the camera, then stood 0.3 m from the edge through departure (`v/go.log`). Review 28's snap was at 12.8 m.
  - **adult_sport_cap's hair comes through her white cap on the near model** (black patches at both temples and along the brim; front and quarter views, `n/HAT.png`, `f/Z.png`). Review 25 called her near model clean; the far model is clean now (`n/FAR.png`), so the patches appear as she comes inside 11 m.
  - **Two platform people merged:** woman_mini and elder_woman_dress stood with centres 4 cm apart for 1.2 s at 11.9 m (Partick outer ride, `v/pa.log`).
  - **Grips:** in steady holds (state > 3 s, clip weight 1) up to 9.3 cm; teen_skirt's fist is visibly in the air beside the pole (`c/GRIP.png`). The 48-57 cm readings are hands still reaching in the first 0.3 s of a hold.
- **Unchanged and good:** the walk through a full Shields Road inner train finished 6 of 6 with no hold-up (min 0.40 m) (`c/wk.log`); 0 far models within 6 m and 0 duplicates in Cowcaddens explore and Kelvinhall ride (`g/cc.log`, `g/kh.log`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review29/`. I deleted the walking recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.5 | 6.75 | **7.80** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.2 | **8.04** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 6.9 | **7.80** |
| 7 | Luggage | 10 | 8.8 | 7.1 | **8.12** |
| 8 | Whole bodies | 15 | 8.6 | 7.2 | **8.04** |
| | **Weighted mean** | 100 | | | **7.88** (7.882) |

0.20x7.68 + 0.10x7.80 + 0.10x7.68 + 0.10x8.04 + 0.10x8.06 + 0.15x7.80 + 0.10x8.12 + 0.15x8.04 = 1.536 + 0.780 + 0.768 + 0.804 + 0.806 + 1.170 + 0.812 + 1.206 = 7.882.

Changes against review 28 (7.900):
- **Arms +0.06.** The seated hand on a seated neighbour's knee (review 28: 2 of 3 rides) is essentially gone (0 of 8 at 10 cm). Against that, seated hands now rest on standers' legs for 85 s at a time in 2 of 8 rides, standers' hands touch neighbours' thighs in 4 of 8, and steady grips still open to 9.3 cm.
- **Behaviour -0.18.** The sticky flag is fixed. But this round's sample shows more turned-away boarders at the edge (28%), three of them within 2.2 m of the camera; a 0.6 m snap at 3 m; standers parked over seated riders' knees; and a 1.2 s merge of two platform people.
- **Whole bodies -0.04.** adult_sport_cap's near-model hair through the cap joins adult_cap_shorts' in the worst tenth.
- **Walking, Faces, Range, Clothing, Luggage: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The turned-away boarder's standingBack flag is cleared when the walk settles | **True.**<br>- Code: `_settle()` clears it (line 1218); stand-backs have `revert = 'stand'`, so arrival goes through `_settle`.<br>- Buchanan Street inner and St Enoch inner, 600 s each: 14 and 11 stand-backs; flagged while not walking 0 s; flagged later walks 0 (review 28: 1314 / 1867 s and 7 / 13). | `v/sticky_bu.log`, `v/sticky_se.log` |
| 2 | A seated rider with someone seated within 0.75 m on the same bench takes the plain sit; limit: only neighbours already seated when the clip is chosen | **True, and it works.**<br>- 0 seated-on-seated hand contacts under 10 cm in 8 rides (review 28: 2 of 3 rides at 11.7-11.9 cm). At 12 cm, 2 marginal: teen_tee in plain `sit_idle` (11.5 cm, boy) and man_trews in `sit_cross_legs` (12.0 cm, adult_casual5, t = 5 s).<br>- The named limit shows at spawn: 9 look-about / crossed-leg sitters with a neighbour 0.55 m away, all at t = 5-15 s, across 6 rides. Clips are re-chosen later (the same riders appear in other clips), so it is temporary.<br>- The check ignores standers, and the new contacts are with standers (section 4, item 4). | `e/nb_go.log`, `e/nb_cc.log`, `e/nb_sg.log`, `e/nb_ib.log`, `e/nb_kp.log`, `e/nb_kb.log`, `e/nb_hh.log`, `e/nb_sr.log` |
| 3 | Not changed: brisk crouch, stop slide, toggling, turned-away boarders at the edge, grips to ~9 cm, nobody in skirt/dress/kilt/long coat/suit or with luggage sits, girl_school_kilt's sleeves, painted tees, faces, adult_cap_shorts' temple hair, woman_puffer's fringe, bag lifted by the phone hand, far-model leftovers, one-frame jumps | **True (nothing changed), but some measure worse in this sample.**<br>- Instrument identical to review 28.<br>- Stop slide: 11 of 27 pauses over 10 cm, max 0.32 m (man_puffer, 8.4 m); 0.25 m (teen_shorts_lad) at 2.0 m. Toggles up to 35 a minute (teen_tube).<br>- Turned-away at the edge: 12 of 43 (28%).<br>- Steady grips to 9.3 cm.<br>- One-frame jump: 0.6 m at 3.0 m (girl_ginger, Govan).<br>- Sleeves, hems, temple hair, far leftovers and the phone-hand handbag: as before. | `m/items.log`, `pz/p_bu.log`, `v/aw3_*.log`, `c/g2_*.json`, `v/go.log`, `n/CL.png`, `n/FAR.png`, `l/ya_knit.png` |

## 2. Status of REVIEW_28's top ten

| # | REVIEW_28 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical: LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). woman_midi at 1.7 m/s in a pencil skirt takes a long, bent-knee stride (`w/WB.png`). | `m/items.log`, `w/WB.png` |
| 2 | Foot slide while stopping, toggles | Not fixed: 11 of 27 over 10 cm; 0.25 m at 2.0 m; toggles to 35 a minute. | `pz/p_bu.log` |
| 3 | Turned-away boarders at the edge; standingBack leak | **Leak fixed.** Edge endings not fixed: 12 of 43 (28%); Buchanan Street outer 4 of 12 again; man_highland 207 s at 0.68 m, 1.9 m from the camera. | `v/sticky_*.log`, `v/aw3_*.log` |
| 4 | Seated hands on the neighbour's knee | **Fixed for seated neighbours** (0 of 8 rides at 10 cm). Replaced by seated hands on standers' legs (2 of 8 rides, 85 s each). | `e/nb_*.log`, `e/NB3.png`, `e/nbk_teen_boy-teen_skirt.png` |
| 5 | Who sits | Not fixed. Bridge Street inner: man_highland, woman_coat and elder_woman_coat stand unsupported in `idle_a` in mid-aisle beside empty seats. `_canSit` refuses 18 of 99 (`chars.json`). | `e/BS.png`, `e/bs.log` |
| 6 | Grips open to 9.4 cm | Not fixed. Steady holds to 9.3 cm (girl_school_kilt, St Enoch); teen_skirt's fist floats beside the pole (8.7 cm); elder_woman_dress 9.2 cm departing Cessnock. | `c/GRIP.png`, `c/g2_*.json`, `c/car_*.json` |
| 7 | girl_school_kilt's strip sleeves | Not fixed: background shows between strips at the cuff. | `n/CL.png` |
| 8 | Painted-on tees, stepped hems | Not fixed (ya_spiky navy and maroon, teen_runner). | `n/CL.png` |
| 9 | Faces | Not fixed. adult_tattoo_muscle's smile goes up one side and down the other; girl_ginger's smile creases into folds; elder_shorts' near face has a smeared seam, salmon lids and a red speck; lashes dotted on most. | `f/F.png`, `f/Z.png` |
| 10 | Small items | Not fixed: adult_cap_shorts' temple hair, phone hand lifting the handbag (`l/ya_knit.png`), far leftovers (adult_vneck's strap wedges, boy_shorts' face, red eye wedges on elder_shorts and ya_spiky). The snap moved closer: 0.6 m at 3.0 m. | `n/HAT.png`, `n/FAR.png`, `v/go.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is identical to review 28 (`diff` differs only in the path and timing header).
- New brisk stills at 1.7 m/s, side, five phases: man_commuter and teen_skater stride cleanly; elder_woman_coat takes short steps, plausibly; woman_midi in a pencil skirt strides wider than the skirt would allow, with knees bent (`w/WB.png`).
- Stop slide 0.25 m at 2 m from the camera, toggles to 35 a minute.

### 3.2 Arms and hands: 7.80 (typical 8.5, worst 6.75)
Better:
- No seated-on-seated knee contact under 10 cm in 8 rides.

Worst tenth:
- Seated hand on a stander's leg for 85 s (ya_shorts / man_highland; teen_boy / teen_skirt).
- Standers' hands against neighbours' thighs (ya_shorts / staff_woman, man_puffer / adult_vneck with his forearm across her hip, woman_puffer / teen_skater, sum_loose_shorts_w / elder_man_cap).
- Steady grips to 9.3 cm; teen_skirt's closed fist in the air.
- Handbag lifted to the chest by the phone hand (`l/ya_knit.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
16 new faces (seed 29, `f/ids.txt`), neutral and smiling (`f/F.png`). They differ and read as their age and sex. Faults:
- adult_tattoo_muscle's smile is lopsided (one corner up, the other down).
- girl_ginger's smile pushes deep folds into the cheeks.
- elder_shorts (near): a smeared texture seam down the face, salmon lids, a red speck on the cheek, slate brows.
- Lashes are dotted; ragged dark hairline on elder_shorts and adult_tattoo_muscle.

### 3.4 Standing, sitting, behaviour: 8.04 (typical 8.6, worst 7.2)
Good:
- standingBack leak fixed.
- Train walk-through 6 of 6, no hold-up.
- 0 far within 6 m, 0 duplicates (Cowcaddens explore 200 s, Kelvinhall ride 200 s).
- Seated people sit in the seat (`n/SIT0.png`, `n/SIT1.png`, in-game shots).

Worst tenth:
- 12 of 43 turned-away boarders end within 1 m of the edge, three within 2.2 m of the camera; man_highland stays 207 s.
- girl_ginger's 0.6 m snap at 3 m after stalling past the edge line as an alighter.
- Standers placed over a seated rider's knees for 85 s; standers hip to hip in an uncrowded car.
- A 1.2 s merge of two platform people at 11.9 m.
- Skirts, kilts and coats stand unsupported in mid-aisle beside empty seats.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- Roster unchanged (99). Skin tones, ages and builds as before (`f/F.png`).
- Children still travel and stand alone (girl_school_kilt, girl_small at poles; teen_skirt standing against a seated teen_boy).

### 3.6 Clothing: 7.80 (typical 8.4, worst 6.9)
Mix:
- Car samples: West Street outer 60 / 0 over half; Bridge Street inner 55 / 0 (`gcar`) but 49 / 24 in a second run (3 of 5 in trousers in two cars, `c/g2_bs.log`); Cessnock 49 / 0; St Enoch 54 / 0.
- Cowcaddens inner platform, 29 samples: 1 over half (56% trousers).

Seated, as the game seats them: 10 new `_canSit` people (ya_tee_jeans, adult_harem, sum_tee_leggings, man_student, adult_leggings_knit, ya_knit, ya_spiky, teen_hippy, teen_shorts_lad, adult_camisole), 4 sit clips, front and side: all clean (`n/SIT0.png`, `n/SIT1.png`).

Faults: girl_school_kilt's sleeves, stepped hems (teen_runner, ya_spiky), no seated skirt/dress/kilt ever.

### 3.7 Luggage: 8.12 (typical 8.8, worst 7.1)
- Ten kinds on ya_knit and man_student, standing, walking and seated (`l/ya_knit.png`, `l/man_student.png`). Rucksacks on the back, bags from the hand, trolleys upright and towed, bags at the feet when seated.
- Unchanged: the handbag rises with the phone hand; holdall, briefcase and trolley owners never sit.

### 3.8 Whole bodies: 8.04 (typical 8.6, worst 7.2)
Near model:
- adult_sport_cap: black hair through the white cap at both temples and the brim (`n/HAT.png`). High contrast; visible at 2-4 m.
- adult_cap_shorts: brown hair through the green cap at the temple (`n/HAT.png`).
- girl_school_kilt's sleeves; elder_shorts' face seam.
- Other hats clean: boy_cap, adult_cap_baggy, ya_fedora, adult_beret, adult_piper, adult_tophat.

Far model (forcelod=1, about 1 m): adult_sport_cap and the other hats clean; leftovers as before (`n/FAR.png`). In play the far model never came within 6 m.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9, 7.7). Largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Turned-away boarders end at the edge: 12 of 43**, three within 2.2 m of the camera (man_highland 207 s at 0.68 m, Ibrox outer; man_beard 0.24 m, Hillhead inner).
   - Fix: on a timeout within 1 m of the edge, pick another spot and try again rather than settle.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=hillhead" 300 > x.log; python3 aw2.py x.log` (also `line=outer&station=ibrox`, `line=outer&station=buchanan-street`).
3. **Foot slide while stopping, stop-start toggling.** 11 of 27 over 10 cm, 0.25 m at 2 m; toggles to 35 a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 200`.
4. **Standers parked against seated riders and each other.** man_highland at a pole between ya_shorts' knees, her hand on his leg, 85 s (Hillhead inner); teen_skirt against teen_boy's knees, his hand on her shin, 85 s (Kinning Park inner); standers hip to hip with a hand on the neighbour's thigh in 4 of 8 rides.
   - Fix: keep standers' feet out of the seated knee zone (about 0.55 m from the bench face); keep standers at least shoulder width apart; extend the 0.75 m sit check to standers in front.
   - Reproduce: `TH=0.12 node gnb3.mjs "mode=ride&q=high&line=inner&station=hillhead" 200 e/nh`.
5. **Who sits.** Skirts, dresses, kilts, long coats and suits (and luggage owners) never sit, so they stand unsupported in mid-aisle beside empty seats (Bridge Street inner: man_highland, woman_coat, elder_woman_coat).
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=inner&station=bridge-street" e/bs 50 8`.
6. **Visible snaps.** girl_ginger 0.6 m at 3 m (Govan inner ride, alighter stalled 0.3 m past the edge line, then `setBays` snap).
   - Reproduce: `node gvan13.mjs "mode=ride&q=high&line=inner&station=govan" 300 | grep TELE`.
7. **Grips open to 9.3 cm in a steady hold;** teen_skirt's fist is in the air beside the pole.
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=st-enoch" c/g2_se 150` (writes a shot of every hold over 8 cm).
8. **Hair through caps on the near model:** adult_sport_cap (new to the list, black on white) and adult_cap_shorts.
   - Reproduce: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",2.4,0.1]]' node shoot2.mjs 0 adult_sport_cap,adult_cap_shorts none stand n/x face`.
9. **Garments:** girl_school_kilt's strip sleeves; stepped painted hems on teen_runner and ya_spiky.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 girl_school_kilt,teen_runner,ya_spiky none stand n/x chest`.
10. **Faces and small items:** lopsided smiles (adult_tattoo_muscle), cheek folds (girl_ginger), elder_shorts' near face seam and speck, dotted lashes; the handbag lifted by the phone hand; far leftovers (adult_vneck's straps, boy_shorts, red eye wedges); a 1.2 s merge of two platform people (woman_mini / elder_woman_dress, Partick, `v/pa.log`).
    - Reproduce faces: `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.

## 5. What I could not observe

- **No motion watched.** Slides, toggles, snaps and contacts come from per-tick positions and bone distances.
- **Whether the stair-top removal at Partick was visible.** ya_smile_dress was removed in `go` at the top of the stairs (y 4.05) 3.4 m from the ride camera (`v/pa.log`). A wall probably hides it; I did not render it, so I did not count it.
- **Whether the woman_mini hand-to-neck contact (3.3 cm, St George's Cross) was a phone hand inside another head.** The shot (`e/SG.png`) is too close to read, and a re-run did not reproduce the same riders (`e/at_wm.log`: the sim is not deterministic across runs).
- **teen_skater's T-shirt colour** changes between viewer spawns (`w/WB.png`); I assume a per-spawn variant, not a mid-walk change.
- **Blink and smile timing** in play.
- **The turned-away rate across stations:** review 28 sampled different stations; part of the 13% to 28% rise may be sampling.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, side, 1.7 m/s, 5 phases | woman_midi, man_commuter, teen_skater, elder_woman_coat | `w/WB.png` |
| Faces, neutral and smiling | 16 new (seed 29) | `f/F.png`, `f/Z.png` |
| Hats, near model, 4 views | adult_sport_cap, boy_cap, adult_cap_baggy, ya_fedora, adult_beret, adult_piper, adult_cap_shorts, adult_tophat | `n/HAT.png` |
| Far heads, front and back | adult_vneck, boy_shorts, elder_shorts, ya_spiky, adult_cap_baggy, adult_sport_cap | `n/FAR.png` |
| Seated, people the game seats, 4 sit clips, front and side | 10 new | `n/SIT0.png`, `n/SIT1.png` |
| Sleeves, hems, temple hair | adult_cap_shorts, girl_school_kilt, teen_runner, woman_puffer, ya_spiky | `n/CL.png` |
| Luggage, 10 kinds x stand/walk/sit | ya_knit, man_student | `l/ya_knit.png`, `l/man_student.png` |
| standingBack after arrival | Buchanan Street inner, St Enoch inner, 600 s each | `v/sticky_*.log` |
| Turned-away boarders | Buchanan Street inner and outer, St Enoch inner, Partick outer, Ibrox outer, Hillhead inner (300 s each) | `v/aw3_*.log` |
| Paused walkers | Buchanan Street inner, 200 s | `pz/p_bu.log` |
| Hands on other riders, sit clip vs neighbour | Govan, Cowcaddens, Kinning Park, Hillhead inner; St George's Cross, Ibrox, Kelvinbridge, Shields Road outer (200 s each) | `e/nb_*.log`, `e/ST.png`, `e/SG.png`, `e/NB3.png`, `e/nbk_*.png` |
| Car garment mix and grips | West Street outer, Bridge Street inner (x2), Cessnock outer (x2), St Enoch inner (x2) | `c/car_*.log`, `c/g2_*.log`, `c/GRIP.png` |
| Eye height in a car | Bridge Street inner, 5 standers x 3 views | `e/BS.png`, `e/bs.log` |
| Walk through a full train | Shields Road inner, 6 walks | `c/wk.log` |
| Vanishings, snaps, overlaps | Partick outer and Govan inner rides, 300 s each | `v/pa.log`, `v/go.log` |
| Platform/ride census, far within 6 m, duplicates | Cowcaddens inner explore, Kelvinhall inner ride, 200 s each | `g/cc.log`, `g/cc.json`, `g/kh.log` |

Next round, look at:
- where standers are placed relative to the bench face and each other;
- turned-away boarders at the same six stations, to separate sampling from change;
- girl_ginger-style alighters that stall past the edge line;
- far faces at native resolution.

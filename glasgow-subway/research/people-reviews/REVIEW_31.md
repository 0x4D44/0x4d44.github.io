# Under Glasgow: independent review of the people (review 31)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `46f5de47` (the people code; the checkout head is a later merge that touches nothing in `glasgow-subway/js`). One change since review 30 touches the people. In `js/sim/index.js` (read-only diff of `46f5de47`):
- `_standOk` (the pole spot) now also rejects a spot within 0.55 m along the car of a seat on the same side that a boarder is **walking to** (`st.p` set, not yet seated).
- The fallback stand spot in `_routeBoarder` now rejects a spot within 0.55 m along the car of **any** seat on its side that is taken or claimed (`st.p`).

`people.glb`, `people_lod.glb`, `people.js` and the walk code did not change. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before reading bones.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.84 (7.840). Gate NOT met.** Three categories are at 8 or above: Luggage 8.08, Range 8.06 and Behaviour 8.04. Five are below 8: Walking 7.64, Faces 7.68, Clothing 7.70, Arms 7.80 and Whole bodies 7.94.

In short:
- **Claim 1 is true as code, and it helps, but the fault is still there in play.**
  - In 26 rides of 200 s, a stander stood in a seated rider's knee zone for 75-85 s in **3 rides** (review 30: 4 of 13). Every time a boarder was involved, and the seated rider's hand rested on the stander's leg or seat:
    - Cowcaddens inner: teen_skirt (placed at the start, holding a pole) and man_commuter (a boarder who sat down in front of her). 4-7 cm, 85 s. His hand is on her thigh for 60 s (`e5/KN.png`, first panel).
    - Shields Road outer: woman_puffer (a boarder at a pole) and woman_elder (a boarder, seated). 4 cm, 75 s. Woman_elder's hand is on her shorts for 85 s. When woman_elder rose to alight, the two pelvises were **0.09 m apart**: one body inside the other (`e/SR.png`).
    - Kelvinhall inner: teen_hippy (a boarder at a pole) and sum_loose_shorts_w (a boarder, seated). 3.5 cm, 85 s (`e5/KN.png`, second panel).
  - **The cause the builder did not touch:** when a boarder **chooses a seat**, nothing checks whether someone is already standing (or about to stand) in front of it. `footOn()` is only applied to boarders with a bag (`index.js` ~329). Proved in the Cowcaddens ride: the boarding log shows man_commuter chose seat (0.74, -2.81) at t = 3.6 s, in front of teen_skirt, who was already holding the pole at (0.25, -2.74) (`e5/n5_inner_cowcaddens_16026.log`, the `RB` line). The other two pairs were both boarders in the same batch, which fits the same order (the stander picks first, the sitter second), but that ride was not logged with `RB`.
- **Claim 2 (nothing else changed) holds.** The walking instrument over the whole roster matches review 30 line for line (`m/items.log`; `diff` empty). Hair through caps, girl_school_kilt's sleeves, woman_midi's hem, the kilt knee, notched tees, grips and turned-away boarders behave as before.
- **New this round:**
  - **adult_string_vest's companion is a cartoon haggis.** It is a brown lump with a tartan tam o' shanter, a red collar and lead, and legs shorter on one side (`js/sim/haggis.js`). It is made from three.js primitives, not in Blender, and the code says it "collides with nothing". On the Shields Road platform it walked through adult_baggy_knit's and man_kilt_casual's legs (2.3-3.6 cm from their leg bones, 5 samples). It carries no fault of its own: it stays on the floor, the lead is attached, and it sits by its owner's feet in a car. But it is a joke figure in a page whose goal is realistic people (`e/PET1.png`, `e/PET2.png`, `../review30/l/adult_string_vest.png`).
  - **Standers hip to hip with hands on each other's thighs** in 7 of 26 rides: pelvises 0.40 m apart, hands 0.2-5 cm from the neighbour's thigh, 10-30 s, mostly around a station stop. A further 0.19 m overlap lasted 12.4 s (adult_cap_shorts and elder_woman_coat, Shields Road inner, `g/sr.json`).
  - **No snap this round** (Govan inner and Hillhead outer, 300 s each, `v/go.log`, `v/hho.log`). The man_trews case of review 30 did not recur in this sample. The code is unchanged, so it is not fixed.
  - **Faces:** ya_spiky has a gap in the hair above the forehead where the background shows; man_highland's hairline is cut ragged; sum_tee_leggings has hollow cheeks and a downturned mouth (`f/Z.png`).
- **Unchanged and good:**
  - The walks through a full Cowcaddens outer train finished 6 of 6 (min 0.40 m, `c/wk.log`).
  - No far models within 6 m and no duplicates (Kelvinhall outer explore, Shields Road inner ride, `g/*.log`).
  - Car garment mix: 0 of 97 car samples over half (`c/g2_*.log`).
  - Eight more people the game seats were shot in all four sit clips, front and side: all clean (`n/SIT0.png`, `n/SIT1.png`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review31/`. I deleted the walking recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.5 | **7.64** |
| 2 | Arms and hands | 10 | 8.5 | 6.75 | **7.80** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.2 | **8.04** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.0 | **8.08** |
| 8 | Whole bodies | 15 | 8.5 | 7.1 | **7.94** |
| | **Weighted mean** | 100 | | | **7.84** (7.840) |

0.20x7.64 + 0.10x7.80 + 0.10x7.68 + 0.10x8.04 + 0.10x8.06 + 0.15x7.70 + 0.10x8.08 + 0.15x7.94 = 1.528 + 0.780 + 0.768 + 0.804 + 0.806 + 1.155 + 0.808 + 1.191 = 7.840.

Changes against review 30 (7.840):
- **Behaviour +0.04 (worst 7.1 to 7.2).** Knee-zone contact fell from 4 of 13 rides to 3 of 26, and no snap was seen. But a body overlap of 0.09 m and one of 0.19 m for 12 s remain, and three turned-away boarders stood near the edge for 99-218 s.
- **Luggage -0.04 (worst 7.1 to 7.0).** I inspected the haggis this round. It is a cartoon, not Blender-made, and it walks through other people's legs. The rest of the luggage is unchanged.
- **Everything else: no change.** No code changed, and the samples matched review 30 within noise.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A boarder's standing spot (pole via `_standOk`, and the fallback in `_routeBoarder`) keeps 0.55 m along the car from any seat on its side that is taken or being walked to | **True as code. It is not enough to stop the fault in play.**<br>- The diff does exactly what it says, in both places.<br>- In 26 rides of 200 s: 3 knee-zone contacts of 75-85 s, each with a seated hand on the stander (Cowcaddens inner, Shields Road outer, Kelvinhall inner). Review 30 had 4 in 13.<br>- The fix guards the stander's choice only. The **seat** choice of a boarder without a bag ignores standers (`footOn` is gated on `q.bag`). Proved at Cowcaddens: man_commuter chose the seat in front of teen_skirt, who was already at the pole.<br>- When a seated rider in such a pair rises to alight, they rise into the stander (0.09 m, Shields Road). | `e/n4_*.log`, `e5/n5_*.log` (`RB` lines), `e/SR.png`, `e5/KN.png` |
| 2 | Not changed: brisk crouch, foot slide, toggling, standers hip to hip, turned-away boarders, who sits, woman_midi's hem, kilt knee, girl_school_kilt's sleeves, notched tees, door-close snap, grips, cap hair, faces, tote with the phone hand, the string vest's companion | **True (nothing changed).**<br>- Instrument identical to review 30.<br>- Foot slide: 13 of 30 pauses over 10 cm; 0.21 m at 1.8 m (man_student), 0.18 m at 2.9 m. Toggles up to 32 a minute.<br>- Turned-away boarders at the edge: 8 of 55. Three stood 99-218 s within 1 m of the edge (adult_cyclist 148 s at 2.2 m from the camera); five were caught in the last 16 s.<br>- Hip to hip: 7 of 26 rides.<br>- Grips to 9.3 cm (rail), 7.4 cm (pole).<br>- Cap hair, sleeves, hem, kilt knee and notched tees: as before. | `m/items.log`, `pz/p_seo.log`, `v/aw3_*.log`, `c/g2_*.log`, `n/HAT.png`, `n/CL.png` |

## 2. Status of REVIEW_30's top ten

| # | REVIEW_30 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). | `m/items.log` |
| 2 | Boarders in seated knee zones | **Improved, not fixed.** 3 of 26 rides (was 4 of 13), 75-85 s each. Stander-side checks are in; the seat-side check is missing. | `e5/KN.png`, `e/SR.png`, `e5/n5_inner_cowcaddens_16026.log` |
| 3 | Foot slide while stopping, toggles | Not fixed: 13 of 30 over 10 cm; 0.21 m at 1.8 m; 32 a minute. | `pz/p_seo.log` |
| 4 | Standers touching each other | Not fixed: 7 of 26 rides hip to hip with hands on thighs. Overlaps of 0.09 m (an alighter rising into a stander) and 0.19 m for 12.4 s. | `e/n4_*.log`, `e5/*.log`, `g/sr.json` |
| 5 | Turned-away boarders at the edge | Not fixed: 8 of 55; three for 99-218 s. | `v/aw3_*.log` |
| 6 | Who sits | Not fixed: skirts, dresses, kilts, long coats and luggage owners never sit (`_canSit` list unchanged). | code |
| 7 | Garments (midi hem, kilt knee, school sleeves, notched hems) | Not fixed: all four seen again. | `n/CL.png` |
| 8 | Visible snaps | Not seen in this sample (2 rides of 300 s). Code unchanged, so not fixed. | `v/go.log`, `v/hho.log` |
| 9 | Grips open to 9.6 cm | Not fixed: 9.3 cm on a rail (Bridge Street inner), 6 of 90 holders over 4 cm. | `c/g2_bs.log` |
| 10 | Cap hair, faces, tote, phone hand | Not fixed. Cap hair on adult_sport_cap and adult_cap_shorts as before; phone_call hand flat beside the phone. 16 new faces (below). | `n/HAT.png`, `f/F.png`, `f/Z.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.64 (typical 8.4, worst 6.5)
- The instrument is identical to review 30 (overall 9.47; LEG 7.8, p10 5.9; SMO p10 7.1; worst adult_heel_boots @1.9 m/s = 7.7).
- Stop slide: 13 of 30 pauses over 10 cm (review 30: 18). The near ones are man_student, 0.21 m at 1.8 m, and ya_smile_dress, 0.18 m at 2.9 m. Further away: ya_ginger_braid 0.37 m at 12.7 m.
- Toggles up to 32 a minute (boy_kilt).

### 3.2 Arms and hands: 7.80 (typical 8.5, worst 6.75)
- Seated hands on standers' legs: man_commuter on teen_skirt for 60 s, woman_elder on woman_puffer for 85 s, sum_loose_shorts_w on teen_hippy for 25 s.
- Standers' hands on neighbours' thighs in 7 of 26 rides (e.g. sum_shorts_asian_m on adult_cap_shorts at 0.2 cm, Cessnock outer).
- Grips to 9.3 cm. The phone_call hand is flat beside a slab phone (adult_sport_cap, ya_fedora, `n/HAT.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
16 faces not looked at in reviews 25-30, neutral and smiling (`f/F.png`, ids in `f/ids.txt`). They differ, and they read as their age and sex, with a spread of skin tones. Smiles are small but fitted. Faults:
- ya_spiky: a gap in the hair at the top of the forehead (background shows through), and a ragged hairline.
- man_highland: a hairline cut in a jagged line.
- sum_tee_leggings: hollow cheeks and a drooping mouth; looks ill.
- woman_puffer: a shredded fringe over the eyes; reddened lids.
- adult_harem: faceted, helmet-like hair.
- adult_tophat: blotchy skin; heavy blue-grey brows.
- Lashes are dotted on most.

### 3.4 Standing, sitting, behaviour: 8.04 (typical 8.6, worst 7.2)
Good:
- 23 of 26 rides had no knee-zone contact.
- The walk through a full train finished 6 of 6.
- No far models within 6 m and no duplicates.
- No snaps in 600 s of door cycles.
- Seated people sit in the seat (`n/SIT0.png`, `n/SIT1.png`, `e/EYE.png`).

Worst tenth:
- Knee-zone contacts of 75-85 s in 3 rides.
- An alighter rising into a stander (0.09 m).
- A 0.19 m overlap for 12.4 s.
- Turned-away boarders within 1 m of the edge for up to 218 s.
- The haggis walking through people's legs on the platform.
- Skirts, kilts and coats never sit.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- Children still ride and stand alone: girl_small at a pole by herself, girl_school_kilt alone at a pole (`e/EYE.png`, `g/sr.json`).

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
Mix:
- Cars: 0 of 97 car samples over half (Partick outer, Bridge Street inner).
- Census within 15 m: 3 of 57 samples over half (shorts 6 of 9 in the Shields Road saloon at t = 200 s; platform trousers 11 of 20).

Seated, as the game seats them: 8 people not shot seated before (man_commuter, woman_elder, ya_smile_halter, teen_cutoffs, sum_crop_bike, ya_ginger_lad, adult_casual5, woman_puffer), 4 clips each, front and side. All clean.

Faults (unchanged):
- woman_midi's red hem fragments over the skirt's waistband.
- man_kilt_casual's knee through the front of the kilt in mid-stride.
- girl_school_kilt's strip sleeves.
- teen_runner's notched tee hem (`n/CL.png`).
- No seated skirt, dress or kilt, ever.

### 3.7 Luggage: 8.08 (typical 8.8, worst 7.0)
- Bags as before: rucksacks on the back, bags in the hand and on the lap, trolleys upright and towed.
- The holdall, briefcase and trolley owners never sit.
- The haggis on a lead (adult_string_vest):
  - It is a cartoon with a tam o' shanter, built from primitives in code rather than in Blender.
  - The lead is held in the same hand as his bag.
  - It walks through other people's legs.
  - It stays on the floor and sits by his feet in a car (`e/PET2.png`, second panel).

### 3.8 Whole bodies: 7.94 (typical 8.5, worst 7.1)
- Near model: hair through adult_sport_cap's and adult_cap_shorts' caps; the kilt knee; girl_school_kilt's sleeves; woman_midi's hem; ya_spiky's hair gap.
- In play: woman_elder rising into woman_puffer (0.09 m); adult_cap_shorts and elder_woman_coat at 0.19 m for 12 s.
- Far model: 8 more people with forcelod=1, standing and walking (`n/FAR.png`). Readable and whole. It never came within 6 m in play.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **A boarder sits down in front of a stander.** Seat choice ignores standers for anyone without a bag. 3 of 26 rides had 75-85 s of knee contact with a seated hand on the stander.
   - Fix:
     - In `_routeBoarder`, apply a stander check to every seat. Reject a seat when anyone in `sc.people` who is not seated, or any `X.stands` entry, is within 0.55 m along the car on that side at |x| > 0.12. This is `footOn` without the `q.bag` gate, at the knee distance.
     - When a seated rider rises to alight, do not let `rise` put them into a stander.
   - Reproduce: `node gnb5.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 200 e5/x` (read the `RB` line); also `outer shields-road`, `inner kelvinhall`.
3. **Standers hip to hip, hands on each other's thighs.** 7 of 26 rides, pelvises 0.40 m apart. Overlaps of 0.09 m and 0.19 m (12.4 s).
   - Fix: keep at least 0.5 m between standers after a stop, alighters waiting at a door included.
   - Reproduce: `node gnb4.mjs "mode=ride&q=high&line=outer&station=cessnock" 200 e/x` (the `P` and `H` lines); `node gp8.mjs "mode=ride&q=high&line=inner&station=shields-road" g/sr 200`.
4. **Foot slide while stopping, stop-start toggling.** 13 of 30 pauses over 10 cm; 0.21 m at 1.8 m; up to 32 toggles a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=st-enoch" 200`.
5. **Turned-away boarders at the edge.** 8 of 55; three stood 99-218 s within 1 m of the edge.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=outer&station=ibrox" 300 > x.log; python3 aw2.py x.log`.
6. **Who sits.** Skirts, dresses, kilts, long coats, suits and luggage owners never sit (`people.js` `_canSit`).
7. **Garments:** woman_midi's red hem fragments; man_kilt_casual's knee through the kilt in a walk; girl_school_kilt's strip sleeves; notched hems.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 woman_midi,man_kilt_casual,girl_school_kilt,teen_runner none stand n/x waist`; `node shoot2.mjs 0 man_kilt_casual none walk@162 n/x legs 1.7`.
8. **The haggis.**
   - A cartoon pet with a tam o' shanter, in a game whose people are meant to be realistic. It is built from primitives, not in Blender.
   - It walks through other people's legs (2-4 cm from leg bones, Shields Road).
   - Fix: replace it with a modelled dog, steered round people. Or drop it.
   - Reproduce: `node gpet.mjs "mode=ride&q=high&line=inner&station=shields-road" 150 e/x`, then `python3 pets.py e/x.log`. The owner spawns at random, so it is not seen in every run.
9. **Grips open to 9.3 cm** in a steady hold (Bridge Street inner, rail), and **door-close snaps** (code unchanged; none seen this round).
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=bridge-street" c/x 150`; `node gvan13.mjs "mode=ride&q=high&line=inner&station=govan" 300 | grep TELE`.
10. **Hair through caps on the near model** (adult_sport_cap, adult_cap_shorts). Faces: ya_spiky's hair gap, man_highland's jagged hairline, sum_tee_leggings' gaunt face, dotted lashes. The phone hand is flat in `phone_call`, and the tote is lifted by the phone hand.
    - Reproduce: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",2.4,0.1]]' node shoot2.mjs 0 adult_sport_cap,adult_cap_shorts none stand n/x face`; `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.

## 5. What I could not observe

- **No motion watched.** Slides, toggles, contacts and the haggis's path come from per-tick positions and bone distances.
- **The boarding order in the Shields Road and Kelvinhall pairs.** Those rides used `gnb4` (no boarding log), so I cannot prove the stander chose first. Only Cowcaddens is proved.
- **Whether the 0.40 m hip pairs are alighters waiting at a door.** They cluster around t = 100-115 s (a station stop) and none is a boarder, but I did not trace them.
- **Whether the haggis ever stands over the platform edge.** My floor test counted the tactile strip as "off floor", so it cannot tell; in one still it stands on the tactile strip.
- **The phone in seated stills.** The viewer's `sit_phone` stills show an empty hand (as review 30 found). Phones show in play.
- **Blink and smile timing** in play.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Faces, neutral and smiling | 16 not seen in reviews 25-30 (adult_harem, adult_smile_blouse, adult_tie_suit, adult_tophat, adult_vneck, elder_woman_coat, man_highland, man_longcoat, man_trews, sum_chino_shorts_m, sum_tee_leggings, teen_hippy, woman_puffer, woman_student, ya_fedora, ya_spiky) | `f/F.png`, `f/Z.png` |
| Hats, near model | adult_sport_cap, adult_cap_shorts, ya_fedora, man_highland | `n/HAT.png` |
| Garments, waist, standing and 4 walk phases at 1.7 m/s | woman_midi, man_kilt_casual, girl_school_kilt, teen_runner | `n/CL.png` |
| Far model, standing and walking | woman_puffer, man_trews, adult_tophat, teen_hippy, sum_tee_leggings, woman_student, adult_harem, man_longcoat | `n/FAR.png` |
| Seated, 4 sit clips, front and side | 8 people the game seats (listed in 3.6) | `n/SIT0.png`, `n/SIT1.png` |
| Knee zone, hands, hip pairs, 200 s rides | 18 rides with gnb4 (Govan, Kinning Park, Cowcaddens, Partick, Buchanan Street, Kelvinhall, Hillhead, St Enoch, Bridge Street inner; Kelvinbridge, Shields Road, St George's Cross, Ibrox, West Street, Cessnock, Govan, Partick, Cowcaddens outer) + 8 with the boarding log (gnb5) | `e/n4_*.log`, `e5/n5_*.log`, `e/SR.png`, `e5/KN.png` |
| Turned-away boarders (300 s each) | Hillhead inner, Ibrox outer, Buchanan Street outer and inner, St Enoch inner, Partick outer | `v/aw3_*.log` |
| Paused walkers | St Enoch outer, 200 s | `pz/p_seo.log` |
| Vanishings, snaps | Govan inner, Hillhead outer rides, 300 s each | `v/go.log`, `v/hho.log` |
| The haggis | 3 explore and 6 ride runs (seen in 7) | `e/pet*.log`, `e/PET1.png`, `e/PET2.png` |
| Car garment mix and grips | Partick outer, Bridge Street inner (150 s each) | `c/g2_*.log` |
| Eye height in a car | Kelvinbridge outer, 6 standers x 3 views | `e/EYE.png`, `e/eye.log` |
| Walk through a full train | Cowcaddens outer, 6 walks | `c/wk.log` |
| Platform/ride census, far within 6 m, duplicates, overlaps | Kelvinhall outer explore, Shields Road inner ride, 200 s each | `g/kho.*`, `g/sr.*` |

Next round, look at:
- the seat choice of boarders without a bag against standers;
- where an alighter rises when a stander is in front of them;
- the 0.40 m stander pairs at stops;
- the haggis at the platform edge.

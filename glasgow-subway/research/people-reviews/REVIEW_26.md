# Under Glasgow: independent review of the people (review 26)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `5bb932df` (a merge; the only change to `glasgow-subway` since review 25's `84632dc7` is `3c2cb1e0`). I read the diff, read-only:
- `tools/people_lodhair.py`: `HATTED` now has all ten hat wearers, and three new parts are copied to the far model (`tophatband`, `beret`, `fedora` and `fedoraband`). `people_lod.glb` was rebuilt.
- `js/sim/people.js:844`: `ya_smile_dress` added to the `_canSit` stand-list.
- `js/sim/sim.test.mjs`: far-model skin budgets rose: adult_cap_baggy 210 to 283, adult_sport_cap 56 to 188, adult_tophat 854 to 2094, boy_cap 281 to 857, ya_fedora 42 to 779.

`people.glb` (the near model) did not change. Both skin tests pass (`node --test --test-name-pattern=skin js/sim/sim.test.mjs`).

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited; git was only read. Every game script yields to the page between ticks and updates world matrices each tick.

**Result: weighted mean 7.86 (7.859). Gate NOT met.** No category reaches 8.2. Three reach 8: Luggage 8.16, Behaviour 8.14 and Range 8.06.

In short:
- **Claim 1 (six more far-model hats) holds.** I looked at all seven hatted far heads (the six plus the top hat) from six directions, including from above and below (`n/OH.png`, near model for comparison `n/OHN.png`). No hair comes through any hat, and the top hat and fedora bands are back. No scalp or skin shows between hat and hair, so the much higher skin budgets do not show on screen. They do make the test looser: a real hole under these hats would now pass. ya_fedora's budget rose from 42 to 779.
- **Claim 2 (ya_smile_dress stands) holds.** `_canSit` returns false for her (`chars.txt`). She was never seated in 7 rides, and stands at a pole in the Shields Road car (`e/SR.png`).
- **Correcting review 25.** Most of its seated skirt faults were forced in the viewer on people the game never seats. adult_beret, woman_sash, woman_mini, woman_midi, teen_tube, man_kilt_casual and elder_woman_coat (long coat) all fail `_canSit`. Those faults are not game defects, and I have not counted them.
- **But the two skirted people the game does seat are faulty** (new):
  - girl_small's shift dress opens at the lap and shows the crotch in every sit clip. In `sit_cross_legs` her knee and thigh come through the dress, with a ragged hem (`n/GZ.png`, `n/GS.png`).
  - girl_school_kilt's kilt flares stiffly over a dark gap. Her jumper's sleeves are cut into strips from elbow to wrist, so the forearm shows through and the hand looks detached. This happens **standing as well as seated** (`n/JM.png`, `n/GZ.png`), and it can be seen in the Kelvinhall ride (`k/KH.png`, second row).
- **New:** teen_runner and ya_spiky wear a top that is painted on the body (`cloth_crude_male_tex`), with a ragged, stepped hem against the shorts. Side on, ya_spiky's "top" shows the shape of his buttocks (`n/CR.png`).
- **Claim 3 (not changed) holds.** The walking instrument is identical to review 25 row for row (`m/items.log`): overall 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7. The other claimed-unchanged items also showed as before: brisk crouch, foot slide, rail hands, faces, adult_cap_shorts' temple hair, far heads, briefcase owners never sitting, and stop-start toggles.
- **Turned-away boarders are no better.**
  - Buchanan Street, 300 s: 7 of 9 ended under 1 m from the edge. Two were never sent anywhere and stood at 0.77-0.88 m for 74-110 s. teen_shorts_lad again ended at 0.37 m.
  - St Enoch, 400 s: 3 of 9 ended under 1 m from the edge. teen_shorts_lad spent 212 s within 1 m.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review26/`. I deleted the walking recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.3 | **8.14** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 6.8 | **7.76** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.5 | 6.7 | **7.78** |
| | **Weighted mean** | 100 | | | **7.86** (7.859) |

0.20x7.68 + 0.10x7.88 + 0.10x7.68 + 0.10x8.14 + 0.10x8.06 + 0.15x7.76 + 0.10x8.16 + 0.15x7.78 = 1.536 + 0.788 + 0.768 + 0.814 + 0.806 + 1.164 + 0.816 + 1.167 = 7.859.

Changes against review 25 (7.842):
- **Whole bodies +0.10.** The far hats are clean on all ten hat wearers and the bands are back. The faults that remain:
  - far-model shard hair (man_commuter shows skin between the shards; man_beard, ya_ginger_lad);
  - woman_puffer's blonde slab;
  - adult_cap_shorts' hair through the cap at the temple on the near model;
  - girl_school_kilt's slit sleeves;
  - girl_small's seated dress hole.
- **Clothing +0.04.** I no longer count review 25's viewer-only seated faults, and ya_smile_dress stands. Against that:
  - girl_small and girl_school_kilt are seated in play with broken garments;
  - the painted-on, ragged tops on teen_runner and ya_spiky;
  - one Hillhead car sample was 60% trousers.
- **Behaviour -0.04.** More turned-away boarders end at the edge at Buchanan Street (7 of 9), two of them never sent. Every woman in a skirt or dress now stands in the car (15 people are on the stand-list), so in a car with free seats the seated women are all in trousers, shorts or leggings while the skirts stand (`e/SR.png`, `k/KH.png`).
- **Walking, Arms, Faces, Range, Luggage: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Six more hat wearers get full hair and full hat on the far model; top hat and fedora bands copied; skin budgets re-derived | **True.**<br>- adult_sport_cap, boy_cap, adult_cap_baggy, ya_fedora, adult_beret, adult_piper and adult_tophat, far model (`forcelod=1`), from front, quarter, side, back, above and below: no hair through any hat (`n/OH.png`). The near model matches (`n/OHN.png`).<br>- The top hat's maroon band and the fedora's band show on the far model.<br>- No skin shows at any hairline on these heads. The budget rise is head skin hidden under the lifted hat, not a visible gap. The skin tests pass.<br>- Caveat: a budget of 779 (ya_fedora) or 2094 (adult_tophat) no longer guards those heads against a real hole.<br>- The far faces on these heads still have red lids (adult_piper) and an open red mouth (boy_cap), but only within 1 m, which the far model never is. | `n/OH.png`, `n/OHN.png`, the skin test run |
| 2 | ya_smile_dress no longer sits | **True.** `_canSit` is false for her (`chars.txt`). She was not seated in Kelvinhall outer, Hillhead inner, Govan outer, St Enoch inner or Partick outer rides (`k/*.log`). At Shields Road she holds a pole in the car (`e/SR.png`). | `chars.txt`, `k/`, `e/SR.png` |
| 3 | Not changed: brisk crouch, paused-foot slide, turned-away boarders short of the edge, pole/rail hands, faces, adult_cap_shorts' temple hair, other far heads, seated kilt gap and elder_woman_coat's bell, briefcase/holdall/trolley owners never sit, stop-start toggling | **True (nothing changed).** Measured again:<br>- Instrument identical to review 25 (`m/items.log`).<br>- Brisk stills at 1.7 m/s: adult_heel_boots bent-kneed and pitched forward; man_longcoat on bent knees (`w/WB.png`).<br>- St Enoch pauses: 11 of 30 slide over 10 cm, max 0.34 m (man_trews). One is within 6 m: man_highland, 0.20 m at 2.4 m (`pz/p_se.log`).<br>- Stop-start toggles up to 30 a minute (woman_sash).<br>- Bridge Street rail: man_highland's fist is beside the rail, not round it. The hand bone is 11.5 cm off and the fingertips 4-5 cm (`p/HH.png`, `p/bs.log`).<br>- adult_cap_shorts: brown hair still shows on the green cap at the left temple (`f/N.png` row 3, `n/CS.png`).<br>- Faces: no change (`f/N.png`, `f/S.png`).<br>- elder_woman_coat never sits in play (long coat), so her "bell" is not a game defect. The kilt gap that does show in play is girl_school_kilt's (below). | `m/`, `w/WB.png`, `pz/`, `p/`, `f/`, `n/CS.png` |

## 2. Status of REVIEW_25's top ten

| # | REVIEW_25 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical). | `m/items.log`, `w/WB.png` |
| 2 | Far-model hair through hats on six more | **Fixed.** | `n/OH.png` |
| 3 | Seated skirts and dresses | **Re-scoped.** Of the people listed, only ya_smile_dress was seated in play, and she now stands. The rest were viewer-forced. The two skirted people the game does seat (girl_small, girl_school_kilt) are faulty (new items 3 and 4). | `n/GS.png`, `n/GZ.png`, `chars.txt` |
| 4 | Foot slide in the walk-to-stand blend | Not fixed. St Enoch: 11 of 30 over 10 cm, max 0.34 m, 1 within 6 m. | `pz/p_se.log` |
| 5 | Turned-away boarders wait at the edge | Not fixed; Buchanan Street worse: 7 of 9 end under 1 m, 2 never sent. St Enoch 3 of 9. | `v/aw_bu.log`, `v/aw_se.log` |
| 6 | Pole and rail hands do not grip | Not fixed (man_highland 11.5 cm). Pole-clip grips in the Govan census: median 1.8 cm, max 5.6 cm. | `p/HH.png`, `c/car_go.log` |
| 7 | Faces: lopsided smiles, dotted lashes, brows | Not fixed. ya_smile_polo's smile is still lopsided. The lashes are still dotted lines. adult_casual5 and teen_ginger have dark marks under the eye. | `f/N.png`, `f/S.png` |
| 8 | adult_cap_shorts near-model temple hair | Not fixed. | `f/N.png`, `n/CS.png` |
| 9 | Other far heads, ragged hair | Not fixed. man_commuter's far hair is black shards with skin between them, the worst I saw. Also ya_ginger_lad's orange shards, man_beard's shards and woman_puffer's slab. | `n/LF2.png` |
| 10 | Small items: briefcase/holdall/trolley owners never sit; toggles; top-hat band; 99 faces | Band fixed; the rest unchanged (`index.js:329`). | `n/OH.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- Instrument identical (LEG 7.8, p10 5.9; SMO p10 7.1).
- Normal-speed side strides look natural for elder_woman_coat, boy_small, man_kilt_casual, ya_smile_dress, teen_tube and adult_runner (`w/WN.png`).
- Brisk walk is still a crouch for adult_heel_boots (`w/WB.png`).
- The foot still slides up to 0.34 m in the blend.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- The rail fist is not on the rail.
- New, small: at one stride phase woman_student's and adult_smile_blouse's right fingertips sink into the thigh (`l/HR.png`, rows 1 and 3).
- Bag handles are held (`l/A.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
20 new faces (seed 26, list in `f/ids.txt`), neutral and smiling, at fov 14.
- The faces differ and read as their age and sex.
- Many neutral mouths are turned down and sullen.
- Smiles are small and closed, the eyes take no part, and ya_smile_polo's smile is lopsided.
- Lashes are dotted lines.
- The boy's brows are thin black strokes.

### 3.4 Standing, sitting, behaviour: 8.14 (typical 8.7, worst 7.3)
Good:
- 0 visible vanishings in Cessnock inner and Govan outer rides (300 s each; `v/ce_in.log`, `v/go_out.log`), and no door-close snap seen.
- One brief overlap (woman_coat and woman_mini, 0.22 m, at 6.7 m).
- Hillhead inner platform over 200 s: 0 far models within 6 m, 0 duplicates, 0 overlaps (`g/hh.log`).
- Walk through a full Kelvinbridge outer train: 6 of 6 done, nearest pass 0.40 m (`c/wk5.log`).
- Seated riders in play sit on the seat, at standing and seated eye height (`k/KH.png`, `k/HH.png`, `k/G.png`).

Worst tenth:
- turned-away boarders at the edge (7 of 9 at Buchanan Street);
- paused-foot slide;
- stop-start toggles;
- briefcase, holdall and trolley owners never sit;
- every skirt and dress stands, so the seated half of a car is all trousers, shorts and leggings.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- Roster unchanged (99: woman, man, teen, boy, girl, elder, staff; a spread of skin tones).
- The same 99 repeat.

### 3.6 Clothing: 7.76 (typical 8.4, worst 6.8)
Mix:
- Govan outer ride: 57 car samples, 0 over half in 4 or 5 groups (`c/car_go.log`).
- Hillhead (`cen3.py g/hh.json`): 6 of 28 samples over half "trousers", worst 9 of 15 (60%) in the train at 60 s. "Trousers" lumps jeans, suit trousers and joggers, so this is a mild point.

Faults the game shows:
- girl_small seated: the dress opens at the lap, and with crossed legs the thigh comes through (`n/GZ.png`);
- girl_school_kilt: sleeves in strips standing and seated, and the seated kilt flares over a gap (`n/JM.png`, `n/GZ.png`);
- teen_runner and ya_spiky: painted-on tees with a ragged stepped hem (`n/CR.png`);
- boy_small's jumper has small white flecks at the hem (`n/JM.png` row 2).

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- Nine kinds on teen_skater and elder_woman_dress, standing and walking (`l/A.png`), and five kinds seated on teen_skater and adult_harem (`l/S.png`): bags hang from the hand, sit on the back or stand on the floor by the feet.
- A large trolley carried at the side clears the leg (`l/ST2.png`).
- In the viewer, adult_harem's `ruck:day` showed a tote (a viewer artefact, as in review 25).
- Briefcase, holdall and trolley owners still never sit.

### 3.8 Whole bodies: 7.78 (typical 8.5, worst 6.7)
Far models:
- all ten hats clean;
- shard hair on man_commuter (skin visible), ya_ginger_lad and man_beard;
- woman_puffer's slab (`n/LF2.png`).

Near models:
- adult_cap_shorts' temple hair;
- girl_school_kilt's forearms showing through the slit sleeves, at 1-2 m in a car;
- girl_small's seated dress opening.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @ 1.9 m/s 7.7). This is still the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`. Stills: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,man_longcoat none walk@100,walk@116,walk@132 w/x body 1.7`.
2. **Foot slide in the walk-to-stand blend:** St Enoch 11 of 30 pauses over 10 cm, max 0.34 m, man_highland 0.20 m at 2.4 m from the camera.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=st-enoch" 200`.
3. **girl_school_kilt's jumper sleeves are slit into strips from elbow to wrist**, standing and seated, with the forearm showing and the hand looking detached. The seated kilt also flares over a dark gap. She is seated in play.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 girl_school_kilt none stand,sit n/x chest`. In game: `SEL=girl_school_kilt DX=0.8 DY=0.5 node gsk2.mjs "mode=ride&q=high&line=outer&station=kelvinhall" 40 k/x`.
4. **girl_small seated:** the shift dress opens at the lap in every sit clip, and in `sit_cross_legs` the thigh and knee come through the dress. She is not on the stand-list, so the game seats her.
   - Reproduce: `ANGS='[["F",3.14,0.05],["Q",2.6,0]]' node shoot2.mjs 0 girl_small none clip-sit-0-30,clip-sitalt-1-30 n/x waist`.
   - Fix: stand her, or fit the dress to the seated skin weights as for the kilts.
5. **Turned-away boarders wait at the edge:** Buchanan Street 7 of 9 end under 1 m, two never sent (spot under 1 m away) and standing 0.77-0.88 m from the edge for 74-110 s; teen_shorts_lad ends at 0.37 m. St Enoch 3 of 9.
   - Fix suggestion: treat "spot under 1 m away" as a reason to pick a further spot, not to stay put.
   - Reproduce: `node gaway.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 300`, then `python3 aw.py v/<log>`.
6. **Far-model shard hair:** man_commuter (black shards with skin between), ya_ginger_lad, man_beard, sum_tube_denim; woman_puffer's slab. These now stand out more next to the clean hatted heads.
   - Fix: put them in `RECIPE_HAIR` (full hair on the far model), as for the hatted ten.
   - Reproduce: `ANGS='[["F",3.14,0.05],["Q",3.9,0.1],["B",0,0.1]]' node shoot2.mjs 1 man_commuter,ya_ginger_lad,man_beard,woman_puffer none stand n/x face`.
7. **Painted-on tops with a ragged hem:** teen_runner and ya_spiky (`cloth_crude_male_tex`). The tee is a texture on the skin, with a stepped hem against the shorts, and from the side it follows the buttocks.
   - Reproduce: `ANGS='[["F",3.14,0.1],["S",1.57,0.1],["B",0,0.1]]' node shoot2.mjs 0 teen_runner,ya_spiky none stand n/x waist`.
8. **Pole and rail hands do not grip:** man_highland's fist sits beside the rail (hand 11.5 cm off).
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=inner&station=bridge-street" p/x 60 4`.
9. **Faces:** sullen down-turned neutral mouths, small closed smiles with no eye involvement, ya_smile_polo lopsided, dotted lashes, adult_cap_shorts browless and with hair through the cap at the temple.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.
10. **Who sits:** 15 people are on the stand-list (every adult skirt, dress and kilt, plus two long coats), and briefcase, holdall and trolley owners never sit. In a car with free seats, the seated women are all in trousers, shorts or leggings while the skirts and dresses stand around them. Also: stop-start toggles up to 30 a minute; fingertips into the thigh at one stride phase; skin budgets of 779 and 2094 no longer guard the hatted far heads.

## 5. What I could not observe

- **No motion watched.** Slides come from per-tick foot positions.
- **Far hats in the game camera.** I did not frame a far-model hat wearer in play. The evidence is from the viewer, which loads the same `people_lod.glb`.
- **Blink and smile timing** in play.
- **girl_small seated in play.** She was not seated in any of my 7 rides, so her dress fault is from the viewer. She passes `_canSit` (only seat geometry can still refuse her), so the game will seat her.
- **Door-close snap:** not seen in 2 more 300 s rides (Cessnock inner, Govan outer), so 5 in a row without it.
- **The aisle walk in explore mode.** `gwalk.mjs` in explore mode (Ibrox outer, Kelvinbridge inner and outer) placed the walker and it never moved (`c/wk*.log`, `cars: 1`). That is the script, not the people: review 25's run was a ride, and in ride mode it walks 6 of 6 (`c/wk5.log`).
- The viewer's `handr` view framed the empty hand, so `l/HR.png` shows fingers and thighs, not bag grips.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, side, 1.7 m/s, 6 phases | adult_heel_boots, man_longcoat, elder_man_suit, ya_smile_halter | `w/WB.png` |
| Normal walk stills, side, 6 phases | elder_woman_coat, boy_small, man_kilt_casual, ya_smile_dress, teen_tube, adult_runner | `w/WN.png` |
| Far hats, 6 views, near and far | adult_sport_cap, boy_cap, adult_cap_baggy, ya_fedora, adult_beret, adult_piper, adult_tophat | `n/OH.png`, `n/OHN.png` |
| Far heads, random 12 (seed 2626) plus 3 known | woman_sash, girl_leggings, man_commuter, man_longcoat, man_highland, sum_shorts_asian_m, adult_baggy_knit, woman_student, boy_cap, ya_winter, ya_ginger_lad, adult_tophat, man_beard, sum_tube_denim, woman_puffer | `n/LF2.png` |
| Who the game seats | `_canSit` per character, with materials | `chars.txt` |
| Seated, people the game seats | girl_school_kilt, girl_small (every sit clip), man_trews, ya_smile_halter, adult_harem, woman_puffer, sum_crop_denim, elder_man_suit, teen_hippy, adult_tophat | `n/SIT.png`, `n/GS.png`, `n/GZ.png`, `n/PUF.png` |
| Seated riders in play, standing and seated eye height | Kelvinhall outer (all 16 seated), Hillhead inner, Govan outer, St Enoch inner, Partick outer | `k/KH.png`, `k/HH.png`, `k/G.png` |
| Jumpers close | girl_school_kilt, boy_small, girl_leggings | `n/JM.png` |
| Painted tops | teen_runner, ya_spiky, ya_fedora | `n/CR.png` |
| Faces, neutral and smiling, fov 14 | 20 random (seed 26) | `f/N.png`, `f/S.png` |
| Luggage, 9 kinds x stand/walk; 5 kinds seated; trolley carried | teen_skater, elder_woman_dress, adult_harem, ya_tube_heels, elder_man_cap | `l/A.png`, `l/S.png`, `l/ST.png`, `l/ST2.png` |
| Hands near bags | woman_student, elder_man_cap, teen_runner, adult_smile_blouse | `l/H.png`, `l/HR.png` |
| Paused walkers | St Enoch inner explore, 200 s | `pz/p_se.log` |
| Turned-away boarders | Buchanan Street outer (300 s), St Enoch inner (400 s) | `v/aw_bu.log`, `v/aw_se.log` |
| Vanishings, releases, overlaps | Cessnock inner ride, Govan outer ride, 300 s each | `v/ce_in.log`, `v/go_out.log` |
| Car garment mix and grips | Govan outer ride, 150 s | `c/car_go.log` |
| Platform census, far within 6 m, duplicates | Hillhead inner explore, 200 s | `g/hh.log`, `g/hh.json` |
| Eye height in a car | Shields Road outer ride | `e/SR.png` |
| Walk through a full train | Kelvinbridge outer ride, 6 walks | `c/wk5.log` |
| Rail hands | Bridge Street inner ride | `p/HH.png`, `p/bs.log` |

Next round, look at:
- girl_small seated in a running car;
- the full roster's jumpers and tops close up for more slit or painted garments;
- turned-away boarders over a 10-minute run at a busy station;
- whether the stand-list leaves too few women seated.

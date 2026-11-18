# Under Glasgow: independent review of the people (review 27)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `59ea2c2b`. The only change since review 26 (`8bfb6d27`) is that commit. I read its diff (read-only):
- `tools/people_lodhair.py`: man_commuter, ya_ginger_lad, man_beard and sum_tube_denim added to `RECIPE_HAIR`. `people_lod.glb` was rebuilt.
- `js/sim/people.js:844`: girl_small and girl_school_kilt added to the `_canSit` stand-list.
- `js/sim/people.js:1198` (`standBack`): it now draws up to 8 waiting spots until one is more than 1.5 m from the edge. If none is, the person is not sent at all.

`people.glb` (the near model) and the walk code did not change. Nothing in the repository was edited, and git was only read. Every game script yields to the page between ticks and updates world matrices each tick.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.86 (7.863). Gate NOT met.** No category reaches 8.2. Three are at 8 or above: Behaviour 8.18, Luggage 8.12 and Range 8.06. Five are below 8.

In short:
- **Claim 1 (four more full-hair far heads) holds.** man_commuter, ya_ginger_lad, man_beard and sum_tube_denim now have the same hair on the far model as on the near one, from five directions (`n/LF.png` against `n/LN.png`). No shards, and no skin between them.
- **But the same fault is on other people.** I took 24 random far heads that are on neither list (seed 27, `far_ids.txt`). Six still have shard hair with skin between the shards (`n/FR1.png`, `n/FR2.png`): man_hoodie, boy_shorts, ya_shorts, teen_crop_leggings, ya_tattoo_tank and teen_runner. adult_vneck's camisole straps break into black wedges on the far model (`n/VN.png`).
- **Claim 2 (girl_small and girl_school_kilt stand) holds.**
  - `_canSit` returns false for both (`chars.txt`).
  - In play, girl_small holds a pole in the Partick inner ride (`c/car_pa.json`), and both girls hold poles in the Ibrox inner ride (`e/IB.png`).
  - The cost: all 81 people the game seats wear trousers, shorts or leggings, and none of the 18 in skirts, dresses, kilts or long coats can sit. In a car with 5 to 9 riders and most seats free, the one or two standing are the skirted ones, now including a five-year-old alone at a pole.
- **Claim 3 (turned-away boarders sent more than 1.5 m back) holds as code, not always as outcome.**
  - 37 turn-aways in five explore runs. Every one was sent to a spot 1.54 to 3.38 m from the edge.
  - 8 of the 37 gave up the walk within 1 to 3 s and stood where they were, 0.55 to 0.95 m from the edge, for 34 to 216 s with the doors shut. That is 3 of 4 at Buchanan Street inner. woman_mini did it 2.1 m from the camera at Partick, and woman_midi 2.0 m from the camera at Buchanan Street.
  - The cause is `people.js:915`: in `walk` mode a single frame without movement (`!moved`) ends the walk on the spot.
  - This is better than review 26 (10 of 18 at the edge), but still visible.
- **Claim 4 (not changed) holds.**
  - The walking instrument is identical to review 26 row for row (`m/items.log`): overall 9.47; LEG 7.8 with p10 5.9; SMO p10 7.1; worst adult_heel_boots at 1.9 m/s, 7.7.
  - Brisk crouch: `w/WB.png`.
  - Foot slide when stopping, Buchanan Street inner: 16 of 30 pauses slide over 10 cm, the largest 0.33 m. 4 of them are within 6 m, including boy_shorts 0.21 m at 1.9 m from the camera (`pz/p_bu.log`).
  - Toggling up to 31 a minute (teen_shorts_lad).
  - girl_school_kilt's strip sleeves and the painted, stepped-hem tees on teen_runner and ya_spiky: `n/CL.png`.
  - Faces: `f/F.png`.
- **New:**
  - **Seated neighbours touch knees.** A seated rider's hand rests on the next rider's knee or thigh: man_beard on sum_denim_shorts_m at Govan (`e/nbg_man_beard-sum_denim_shorts_m.png`, hand 11.5 cm from the thigh axis) and staff_hivis on a boy at Ibrox (`e/IBN.png`, third panel); man_student was 9.2 cm from adult_casual2's knee. Hand-to-neighbour contacts under 12 cm turned up in all three rides I measured (`e/nb_*.log`).
  - **A carried bag follows the phone hand.** While a standing person uses their phone, a tote or holdall is lifted to waist or chest height (`l/A.png`: ya_smile_halter's tote, man_student's holdall).
  - **The player was held for 40 s at the end of a car**, by boy_kilt at a pole and adult_cyclist with a rucksack (`c/wk.log`, t=130). The walk still finished, 6 of 6.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review27/`. I deleted the walking recording (477 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.6 | **7.80** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.4 | **8.18** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 6.9 | **7.80** |
| 7 | Luggage | 10 | 8.8 | 7.1 | **8.12** |
| 8 | Whole bodies | 15 | 8.5 | 6.8 | **7.82** |
| | **Weighted mean** | 100 | | | **7.86** (7.863) |

0.20x7.68 + 0.10x7.80 + 0.10x7.68 + 0.10x8.18 + 0.10x8.06 + 0.15x7.80 + 0.10x8.12 + 0.15x7.82 = 1.536 + 0.780 + 0.768 + 0.818 + 0.806 + 1.170 + 0.812 + 1.173 = 7.863.

Changes against review 26 (7.859):
- **Whole bodies +0.04.** The four named far heads are fixed, and girl_small's seated dress is gone from play. But six of 24 random far heads still show shard hair, and adult_vneck's far straps break up. The worst tenth hardly moves.
- **Clothing +0.04.** Neither broken seated garment can now be seen in play. girl_school_kilt's slit sleeves still show standing. Every seated rider is in trousers, shorts or leggings. One St Enoch platform sample was 58% shorts (7 of 12).
- **Behaviour +0.04.** Fewer turned-away boarders end at the edge (8 of 37 against 10 of 18). Against that: in near-empty cars the skirted riders, now including a small child, stand while everyone else sits; one 40 s hold-up in the aisle; toggling unchanged.
- **Arms -0.08.** New: seated hands on the neighbour's knee.
- **Luggage -0.04.** New: a bag lifted with the phone hand.
- **Walking, Faces, Range: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | man_commuter, ya_ginger_lad, man_beard and sum_tube_denim get full-detail hair on the far model | **True.**<br>- From front, quarter, side, back and above (`forcelod=1`), all four far heads match the near model. No shards, and no skin between strands.<br>- sum_tube_denim has a thin white line at the left temple on both models, a small fault.<br>- woman_puffer (not claimed) still has a fringe slab hanging over the eyes, on the near model as well.<br>- The fault class remains: 6 of 24 random far heads not on any list still have shard hair (see 3.8). | `n/LF.png`, `n/LN.png`, `n/FR1.png`, `n/FR2.png` |
| 2 | girl_small and girl_school_kilt no longer sit | **True.**<br>- `_canSit` is false for both.<br>- In play they stand holding poles: girl_small in every Partick inner car sample, and both in the Ibrox inner ride.<br>- Side effect: the stand-list now has 18 people, and all 81 who can sit wear trousers, shorts or leggings. | `chars.txt`, `c/car_pa.json`, `e/IB.png`, `e/IBN.png` |
| 3 | A turned-away boarder walks to a waiting place more than 1.5 m from the edge | **True as a target. Not reliably true as a result.**<br>- All 37 targets were 1.54 to 3.38 m back. None was left unsent.<br>- 8 of 37 stopped within 1 to 3 s of setting off and stood 0.55 to 0.95 m from the edge:<br>&nbsp;&nbsp;- Buchanan Street outer: woman_puffer 0.57 m for 103 s; adult_casual5 0.69 m for 39 s.<br>&nbsp;&nbsp;- St Enoch inner: boy and ya_bootcut, on their second turn-away.<br>&nbsp;&nbsp;- Partick inner: woman_mini 0.95 m for 111 s, 2.1 m from the camera.<br>&nbsp;&nbsp;- Buchanan Street inner: 3 of 4. teen_crop_leggings 0.55 m, 27 m short of her spot; teen_cutoffs 0.86 m; woman_midi 0.87 m for 98 s, 2.0 m from the camera.<br>- For comparison, 15-19% of all waiting people stand within 1 m of the edge with the doors shut (`CROWD_EDGE` in `v/aw3_*.log`). The aborted ones are an excess, not the norm.<br>- Cause: `people.js:915`, `if (!moved \|\| p.stuckT > 1.6)` ends a `walk` (and `_settle`s a `revert` walk) after one blocked frame. Near the doors, where alighters and boarders mill, that frame comes at once. | `v/aw_bu.log`, `v/aw_se.log`, `v/aw_pa.log`, `v/aw3_bu.log`, `v/aw3_kb.log` |
| 4 | Not changed: brisk crouch, stop slide, rail/pole hands, faces, adult_cap_shorts' temple hair and brows, woman_puffer's far slab, girl_school_kilt's sleeves, painted tops, nobody in a skirt/dress/kilt or with a briefcase/holdall/trolley sits, stop-start toggling | **True (nothing changed).**<br>- Instrument identical to review 26 (`diff` of `m/items.log` is empty).<br>- adult_heel_boots at 1.7 m/s is hunched and bent-kneed in 2 of 5 phases. elder_man_suit walks on bent knees.<br>- Stop slide: 16 of 30 over 10 cm at Buchanan Street inner, max 0.33 m, boy_shorts 0.21 m at 1.9 m.<br>- Toggling up to 31 a minute.<br>- Strip sleeves and stepped hems as before (`n/CL.png`).<br>- Faces as before (`f/F.png`).<br>- The boarding code still skips seats for trolley, holdall and case owners (`index.js:329`). | `m/`, `w/WB.png`, `pz/p_bu.log`, `n/CL.png`, `f/F.png` |

## 2. Status of REVIEW_26's top ten

| # | REVIEW_26 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical). | `m/items.log`, `w/WB.png` |
| 2 | Foot slide in the walk-to-stand blend | Not fixed. Buchanan Street inner: 16 of 30 over 10 cm, 4 within 6 m. | `pz/p_bu.log` |
| 3 | girl_school_kilt's slit sleeves, seated kilt gap | **Half fixed.** She no longer sits, so the kilt gap is gone from play. The strip sleeves still show standing, and she stands at a pole in the car at 1-2 m. | `n/CL.png`, `e/IBN.png` |
| 4 | girl_small's seated dress | **Fixed in play** (she stands). The garment is unchanged. | `chars.txt`, `c/car_pa.json` |
| 5 | Turned-away boarders wait at the edge | **Improved, not fixed.** 8 of 37 end within 1 m (review 26: 10 of 18). Every target is now beyond 1.5 m, but one blocked frame ends the walk. | `v/` |
| 6 | Far shard hair on man_commuter, ya_ginger_lad, man_beard, sum_tube_denim; woman_puffer's slab | **Fixed for the four.** woman_puffer is unchanged. Six other far heads have the same fault. | `n/LF.png`, `n/FR*.png` |
| 7 | Painted-on tops with a ragged hem (teen_runner, ya_spiky) | Not fixed. | `n/CL.png` |
| 8 | Pole and rail hands do not grip | Not re-measured at the rail. Pole clip grips in the Partick inner census: median 2.2 cm, max 3.6 cm. Rail clip: median 0.9 cm, max 3.9 cm. None over 4 cm. | `c/car_pa.log` |
| 9 | Faces: sullen mouths, small lopsided smiles, dotted lashes | Not fixed. 16 new faces show the same: teen_tee's and man_student's smiles are lopsided, and teen_runner's neutral mouth hangs open showing red. | `f/F.png` |
| 10 | Who sits (stand-list); toggles; fingertips into the thigh; loose skin budgets | Worse on who sits: the stand-list is now 18. Toggles unchanged. | `chars.txt`, `pz/p_bu.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is identical (LEG 7.8, p10 5.9; SMO p10 7.1).
- At normal speed, ya_tee_jeans at 1.7 m/s strides cleanly (`w/WB.png`, row 3).
- adult_heel_boots is crouched and pitched forward at a brisk pace (row 1).
- The stopping foot slides up to 0.33 m, and 0.21 m within 2 m of the camera.

### 3.2 Arms and hands: 7.80 (typical 8.6, worst 6.6)
- Pole grips are within 4 cm (`c/car_pa.log`), and bag handles are held (`l/A.png`).
- New: seated riders' hands land on the neighbour's knee:
  - man_beard on sum_denim_shorts_m (`e/nbg_*.png`);
  - staff_hivis on a boy in shorts (`e/IBN.png`);
  - man_student 9 cm from adult_casual2's knee (`e/nb_*.log`, Ibrox run in the session log).
- ya_spiky's phone pose interlaces the fingers over the chest (`n/CL.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
16 new faces (seed 2727, `f/ids.txt`), neutral and smiling, fov 14 (`f/F.png`).
- The faces differ and read as their age and sex.
- Smiles are small and closed, and the eyes take no part. teen_tee's and man_student's smiles are lopsided.
- Lashes are dotted lines (man_elder, adult_beret).
- teen_runner's neutral mouth is parted, with red showing, and there are marks at the mouth corners.
- adult_cyclist's fringe covers one eye completely.

### 3.4 Standing, sitting, behaviour: 8.18 (typical 8.7, worst 7.4)
Good:
- Kelvinhall outer ride, 300 s: 0 visible platform vanishings (`v/kh_out.log`).
- St Enoch outer platform, 200 s: 0 far models within 6 m, 0 duplicates, 0 overlaps (`g/se.log`).
- Walk through a Hillhead inner train: 6 of 6 done, nearest pass 0.40 m (`c/wk.log`).
- Seated riders sit on the seat (`e/IB.png`).

Worst tenth:
- 8 of 37 turned-away boarders abort their walk and wait at the edge, two of them 2 m from the camera.
- Every skirt, dress and kilt stands, now including girl_small, who holds a pole alone in a car of 5 with most seats free (`c/car_pa.json`).
- Seated neighbours' hands on each other's knees.
- One 40 s hold-up of the player at a car end.
- Stop-start toggling up to 31 a minute.
- The same four people were turned away from two trains running at St Enoch (8 minutes' wait). This is plausible at rush hour, but they were the only ones turned away.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- Roster unchanged (99).
- Children travel alone and stand alone at poles; no adult is with them.

### 3.6 Clothing: 7.80 (typical 8.4, worst 6.9)
Mix:
- Partick inner ride: 56 car samples, none over half in 4 or 5 groups (`c/car_pa.log`).
- St Enoch outer platform: 1 of 27 samples over half, 58% shorts (`g/se.json` via `cen3.py`).

Faults:
- girl_school_kilt's sleeves are cut into strips (standing, in the car at 1-2 m).
- teen_runner's and ya_spiky's painted tees with stepped hems.
- Seated, every rider is in trousers, shorts or leggings. The car's seated half never shows a skirt.

### 3.7 Luggage: 8.12 (typical 8.8, worst 7.1)
- Nine kinds on ya_smile_halter and man_student, standing and walking. Rucksacks sit on the back, and bags hang from the hand. The cabin trolley stands upright and is towed on its wheels (`l/A.png`).
- New: in the phone idle, the tote (ya_smile_halter) and the holdall (man_student) rise with the phone hand to waist or chest height.
- Briefcase, holdall and trolley owners still never sit.

### 3.8 Whole bodies: 7.82 (typical 8.5, worst 6.8)
Far models (`forcelod=1`; used beyond 6-11 m; shot here at about 1 m, fov 30):
- The four claimed heads are clean.
- In the random 24, shard hair with skin between the shards:
  - man_hoodie (black shards over the forehead);
  - boy_shorts;
  - ya_shorts (red shards over the face);
  - teen_crop_leggings;
  - ya_tattoo_tank (with a teal sliver at the cheek);
  - teen_runner (a dark spike hanging at the ear).
- teen_cutoffs has a bare patch at the hairline.
- adult_vneck's camisole straps become black wedges on the shoulders, with white flaps (`n/VN.png`).
- woman_puffer's slab.

Near models:
- girl_school_kilt's sleeves;
- adult_cap_shorts' temple hair (not re-shot; the model is unchanged).

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots at 1.9 m/s, 7.7). This is still the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
   - Stills: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots none walk@100,walk@108,walk@116,walk@124,walk@132 w/b body 1.7`.
2. **Foot slide while stopping.** Buchanan Street inner: 16 of 30 pauses over 10 cm, max 0.33 m (adult_vneck); boy_shorts 0.21 m at 1.9 m from the camera; toggles up to 31 a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 200`.
3. **Far-model shard hair on more heads:** man_hoodie, boy_shorts, ya_shorts, teen_crop_leggings, ya_tattoo_tank, teen_runner (6 of a random 24 not on any list); also teen_cutoffs' hairline. The four fixed heads show the fix works.
   - Fix: check the whole roster with the scalp measure and put every failing head in `RECIPE_HAIR`.
   - Reproduce: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",3.9,0.1],["B",0,0.15]]' node shoot2.mjs 1 man_hoodie,boy_shorts,ya_shorts,teen_crop_leggings,ya_tattoo_tank,teen_runner none stand n/x face`.
4. **Turned-away boarders abort and wait at the edge:** 8 of 37 (Buchanan Street inner 3 of 4), 34-216 s at 0.55-0.95 m, two of them 2 m from the camera.
   - Cause: `people.js:915` ends a walk after one frame without movement.
   - Fix: for a `revert` or stand-back walk, wait (`p.wait`) and retry, or only give up on `stuckT`.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 400` (fields `arrT`, `arrE`, `short`).
5. **Seated hands on the neighbour's knee:** man_beard on sum_denim_shorts_m (Govan outer), staff_hivis on a boy (Ibrox inner), man_student 9 cm from adult_casual2's knee.
   - Reproduce: `TH=0.12 node gnb.mjs "mode=ride&q=high&line=outer&station=govan" 150 e/nbg`. It writes a shot of each pair.
6. **girl_school_kilt's jumper sleeves in strips** from elbow to wrist. She now stands in cars at 1-2 m, so this is seen more, not less.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 girl_school_kilt none stand n/x chest`.
7. **Who sits.** 18 people can never sit (every skirt, dress and kilt, two long coats, and now both small girls), nor can briefcase, holdall or trolley owners. In near-empty cars the seated riders are all in trousers, shorts or leggings, and a five-year-old stands alone at a pole.
   - Reproduce: `node gcar.mjs "mode=ride&q=high&line=inner&station=partick" c/x 150` and read `stand` and `hold` per car.
8. **Painted-on tees with stepped hems** (teen_runner, ya_spiky).
   - Reproduce: `ANGS='[["F",3.14,0.1],["S",1.57,0.1]]' node shoot2.mjs 0 teen_runner,ya_spiky none stand n/x chest`.
9. **Faces:** small closed smiles with no eye involvement, lopsided smiles (teen_tee, man_student, ya_smile_halter), dotted lashes, teen_runner's open red mouth.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.
10. **Small items:**
    - a bag lifted with the phone hand (`l/A.png`);
    - adult_vneck's far straps as black wedges (`n/VN.png`);
    - woman_puffer's fringe slab over the eyes (both models);
    - a 40 s player hold-up at a car end (`c/wk.log`);
    - adult_cap_shorts' temple hair.

## 5. What I could not observe

- **No motion watched.** Slides and toggles come from per-tick positions.
- **Far heads in the game camera.** The far-model evidence is from the viewer at about 1 m. In play the far model is used beyond 6-11 m, where a head is 15-30 px tall. At that size the shards read as a ragged or patchy outline rather than detail.
- **Rail hands** were not re-measured at a rail (only the clip census).
- **adult_cap_shorts and the near-model hats** were not re-shot; `people.glb` is unchanged.
- **Blink and smile timing** in play.
- **Why some boarders were turned away from two trains running** (the `mixOver` gate, presumably). I saw only the outcome.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, side, 1.7 m/s, 5 phases | adult_heel_boots, elder_man_suit, ya_tee_jeans | `w/WB.png` |
| Claimed far heads, 5 views, far and near | man_commuter, ya_ginger_lad, man_beard, sum_tube_denim, woman_puffer | `n/LF.png`, `n/LN.png` |
| Random far heads, 3 views | 24 not on any list (seed 27, `far_ids.txt`) | `n/FR1.png`, `n/FR2.png` |
| Far vs near camisole | adult_vneck | `n/VN.png` |
| Who the game seats | `_canSit` per character | `chars.txt` |
| Seated, people the game seats, sit_idle and sit_cross_legs | man_elder, ya_tee_jeans, adult_cyclist, sum_tube_denim, ya_spiky, teen_shorts_lad (12 drawn, 6 at leg framing) | `n/ST.png`, `sit_ids.txt` |
| Strip sleeves, painted tops | girl_school_kilt, teen_runner, ya_spiky | `n/CL.png` |
| Faces, neutral and smiling | 16 new (seed 2727) | `f/F.png` |
| Luggage, 9 kinds x stand/walk | ya_smile_halter, man_student | `l/A.png` |
| Turned-away boarders | Buchanan Street outer 300 s and inner 400 s, St Enoch inner 600 s, Partick inner 300 s, Kelvinbridge outer 300 s | `v/aw_*.log`, `v/aw3_*.log` |
| Vanishings, releases | Kelvinhall outer ride, 300 s | `v/kh_out.log` |
| Car garment mix, grips, who stands | Partick inner ride, 150 s | `c/car_pa.log`, `c/car_pa.json` |
| Walk through a full train | Hillhead inner ride, 6 walks | `c/wk.log` |
| Platform census, far within 6 m, duplicates, overlaps | St Enoch outer explore, 200 s | `g/se.log`, `g/se.json` |
| Eye height in a car, holders | Ibrox inner ride | `e/IB.png`, `e/IBN.png` |
| Hands on other riders | Ibrox inner, Govan outer, Cowcaddens inner rides | `e/nb_go.log`, `e/nb_co.log`, `e/NB.png` |
| Paused walkers | Buchanan Street inner explore, 200 s | `pz/p_bu.log` |

Next round, look at:
- the whole roster's far heads (not a sample);
- seated neighbour contacts over more rides;
- rail grips;
- whether children ever travel with an adult.

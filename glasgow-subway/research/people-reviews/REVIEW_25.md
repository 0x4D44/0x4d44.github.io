# Under Glasgow: independent review of the people (review 25)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `84632dc7`. I read the diff since review 24's `0ef1d6e7`, read-only:
- `435a7ab2`: `js/sim/index.js:319` (a turned-away boarder now goes to `crowd.standBack`), `js/sim/people.js:1059-1062` (`p.intent`; a paused walker's position is held when the crowd asks for less than 0.5 m/s) and `people.js:1193` (`standBack`);
- `7e15e8dc`: `tools/people_lodhair.py`, the four hatted people get the full hair and their full cap or top hat (lifted 8 mm) on the far model; rebuilt `people_lod.glb`;
- `84632dc7`: `sim.test.mjs`, far-model skin budgets for the four re-derived (adult_camo_cap 161 to 233, adult_cap_shorts 158 to 342, elder_man_cap 136 to 440, adult_tophat 97 to 854).

`people.glb` (the near model) did not change.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited; git was only read. Every game script yields to the page between ticks and updates world matrices each tick (I added the yield to `gpause.mjs`).

**Result: weighted mean 7.84 (7.842). Gate NOT met.** No category reaches 8.2; three reach 8 (Behaviour 8.18, Luggage 8.16, Range 8.06).

In short:
- **Claim 3 (the four hatted far models) holds.** No hair through the hat on adult_camo_cap, adult_cap_shorts, elder_man_cap or adult_tophat from six directions, including from above and below. No scalp or skin shows at the hairline, so the raised skin budgets look harmless.
- **But six other hat wearers have the same fault on the far model, and badly.** REVIEW_24 did not list them: adult_sport_cap (black hair over most of a white cap), boy_cap (black over a red cap), adult_cap_baggy, ya_fedora, adult_beret and adult_piper (`n/OH.png` far, `n/OHN.png` near, same views). Their near models are clean, so the hair appears when they cross about 11 m.
- **Claim 2 (paused walker holds still) holds for the body.** The body moves 1.2 cm at most. The foot still slides during the walk-to-stand blend:
  - Partick: 4 of 13 pauses over 10 cm, max 13 cm, none within 6 m (the builder's numbers reproduce);
  - St Enoch (busier): **13 of 30 over 10 cm, max 0.36 m, 4 within 6 m** (1.8-3.4 m from the camera).
- **Claim 1 (turned-away boarders walk back) is only partly true.** At Buchanan Street, 15 boarders were turned away against 21 boarded (two runs).
  - 6 of 15 walked back and stood 1.1-2.2 m from the edge.
  - 8 of 15 stopped short of their spot and stood 0.39-0.59 m from the edge, some for 200 s. Four of these were still within about 1 m of the door they were turned away from.
  - Several walked 15-35 m along the platform edge to get there.
- **Claim 4 (not changed) holds**, with one exception: the door-close snap did not show in three rides (Cessnock outer, Ibrox inner twice). The walking instrument is identical to review 24, row for row.
- **New:** seated skirts and dresses are worse than REVIEW_24 recorded. From the front:
  - adult_beret's pencil skirt has two holes at the knees;
  - woman_sash's highland dress opens into a ragged hole across the lap;
  - ya_smile_dress, woman_mini, woman_midi and teen_tube show a dark open shell under the hem.

  I confirmed ya_smile_dress in a running ride (`k3/K.png`).
- **New:** adult_cap_shorts' **near** model shows brown hair through the cap at the left temple, above the brim, at face distance (`n/CS.png`, `f/N.png`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review25/`. The walking recording (542 MB) was deleted after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.4 | **8.18** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 6.7 | **7.72** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.4 | 6.6 | **7.68** |
| | **Weighted mean** | 100 | | | **7.84** (7.842) |

0.20x7.68 + 0.10x7.88 + 0.10x7.68 + 0.10x8.18 + 0.10x8.06 + 0.15x7.72 + 0.10x8.16 + 0.15x7.68 = 1.536 + 0.788 + 0.768 + 0.818 + 0.806 + 1.158 + 0.816 + 1.152 = 7.842.

Changes against review 24 (7.868):
- **Behaviour +0.04:** turned-away boarders mostly leave the doorway, and no door-close snap in three rides. But 8 of 15 still wait 0.4-0.6 m from the edge, and the paused-foot slide remains.
- **Clothing -0.12:** seated skirt and dress faults on more people than recorded (adult_beret knee holes, woman_sash lap hole, open hems).
- **Whole bodies -0.08:** four hatted far models fixed, but six more hat wearers have hair through the hat on the far model; adult_cap_shorts has it on the near model; seated dress holes.
- **Walking 0:** the body no longer glides while paused, but the foot still slides up to 0.36 m in the blend, 4 cases within 6 m at St Enoch.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Turned-away boarders walk back from the doors to a place to wait (`standBack`) | **Partly true.**<br>`gaway.mjs` hooks `crowd.standBack` and traces each person. Buchanan Street outer explore, 300 s and 120 s: 15 turned away, 21 boarded.<br>- 14 were sent walking (one had a spot under 1 m away and stayed put at 0.77 m).<br>- 6 reached 1.1-2.2 m from the edge.<br>- 8 stopped short and stood 0.39-0.59 m from the edge. For example, teen_shorts_lad was sent to 2.58 m, walked 18 m along the edge, and stood at 0.40 m for 200 s; man_beard stood at 0.42 m for 200 s.<br>- Four of the 8 were still within about 1 m of their door (adult_casual2, teen_crop_leggings, adult_casual5 and man_beard in one run).<br>- Walks of 15-35 m along the platform edge (ya_ginger_braid 34.8 m, man_commuter 27.8 m).<br>- No visible removals of turned-away people.<br>In rides (Ibrox inner), the 11 turned away were hidden platform people and were dropped, not seen. | `v/aw_bu.log`, `v/aw_bu2.log`, `v/aw_ib.log`, `aw.py` |
| 2 | A paused walker ignores nudges < 0.5 m/s; body moves ~1 cm; 4 of 18 slide > 10 cm (the blend) | **True for the body; the foot slide remains at busy stations.**<br>- Partick outer explore, 200 s (`gpause`, yielding): 13 pauses, 4 over 10 cm (max 13.2 cm), none within 6 m; body at most 1.2 cm.<br>- St Enoch inner explore, 200 s: 30 listed pauses, **13 over 10 cm, max 0.36 m** (adult_piper 6.8 m away, ya_bootcut 0.30 m). Within 6 m: girl 0.18 m at 1.8 m, teen_shorts_lad 0.25 m at 3.0 m, teen_skirt 0.17 m and 0.18 m at 3.1-3.4 m. Body at most 1.2 cm.<br>- Stop-start toggles reach 34 a minute (adult_casual2), as in reviews 23-24. | `pz/p_pa.log`, `pz/p_se.log` |
| 3 | Four hatted people get full hair and full hat on the far model; no hair through; higher skin budgets are hidden scalp | **True for the four.**<br>- Far model from front, quarter, side, back, above and below (`n/LF.png`) and at 0.42 m (`n/LZ.png`): no hair through any of the four hats. No skin gap between hat and hair.<br>- Side effect: the far top hat has no maroon hatband (the near one has), so the band appears and disappears at the swap (`n/LF.png` vs `n/HF.png`, bottom rows).<br>- **Not covered by the fix:** adult_sport_cap, boy_cap, adult_cap_baggy, ya_fedora, adult_beret and adult_piper show hair through the hat on the far model (`n/OH.png`, near `n/OHN.png`). adult_sport_cap and boy_cap are the worst: a white or red cap mostly covered in black hair from the back. | `n/LF.png`, `n/LZ.png`, `n/HF.png`, `n/OH.png`, `n/OHN.png` |
| 4 | Not changed: brisk crouch, door-close snap, pole hands, faces, seated coats/kilt, other far heads, ragged hair, briefcase owners never sit | **True, except that the snap did not show.**<br>- `m/items.log` is identical to review 24 except its header: overall 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7.<br>- Brisk stills at 1.7 m/s: adult_heel_boots and man_longcoat walk on bent knees (`w/WB.png`).<br>- Pole hands open: woman_sash's hand is 8-13 cm off the pole; man_kilt_casual's fist is 4-5 cm short of the rail (`p/HH.png`, `p/kh.log`).<br>- Faces unchanged (`f/N.png`, `f/S.png`).<br>- Briefcase, holdall and trolley owners still skip seats (`index.js:329`).<br>- **Door-close snap:** none in Cessnock outer (`gvan13`), Ibrox inner (`gvan13`) or Ibrox inner (`gsnap2`), 300 s each. I cannot say whether it is gone or this was chance. | `m/`, `w/WB.png`, `p/`, `v/ce.log`, `v/ib.log`, `v/snap_ib.log` |

## 2. Status of REVIEW_24's top ten

| # | REVIEW_24 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical). | `m/`, `w/WB.png` |
| 2 | Feet slide while paused | Body fixed. Foot slide in the blend remains: Partick 4 of 13 over 10 cm (max 13 cm); St Enoch 13 of 30 (max 0.36 m, 4 within 6 m). | `pz/` |
| 3 | Far-model hair through hats (four) | **Fixed for the four.** Six other hat wearers have it (new item 2). Other far heads unchanged: man_beard's shards, woman_puffer's shaggy blonde slab, elder_shorts' orange mouth and crease (`n/LF2.png`). | `n/LF.png`, `n/OH.png`, `n/LF2.png` |
| 4 | Turned-away boarders at the doors for minutes | **Partly fixed:** 6 of 15 go back over 1 m; 8 of 15 stand 0.39-0.59 m from the edge, 4 of them still near their door. | `v/aw_*.log` |
| 5 | Pole and rail hands do not grip | Not fixed (woman_sash 8-13 cm off). | `p/HH.png` |
| 6 | Faces: smirks, lashes, slate brows, faint brows | Not fixed. Lopsided smiles on ya_smile_polo, boy_kilt and teen_tube. Dotted lashes. elder_shorts' slate brows and red lids. adult_cap_shorts is browless. Dark mark under ya_tee_jeans' eye. | `f/N.png`, `f/S.png` |
| 7 | Seated garments | Not fixed, and **wider than recorded** (new item 3). | `n/SIT.png`, `l/ZW.png`, `k3/K.png` |
| 8 | Alighter freeze 2.5 s; door-close snap | No visible removals in 3 rides plus 2 explores. Snap not seen in 3 rides. | `v/` |
| 9 | Ragged hair cards on lifted hair | Not fixed (woman_puffer far and near). | `n/LF2.png` |
| 10 | Briefcase owners never sit; same 99 faces | Unchanged. | `index.js:329` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is unchanged (`m/rec.log`, `m/items.log`).
- Brisk stills: adult_heel_boots walks bent-kneed on stilettos and man_longcoat stoops (`w/WB.png`).
- The paused body no longer glides, but a 17-36 cm foot slide is still common in a busy crowd, including 4 within 6 m at St Enoch.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Hands do not close on poles. woman_sash's flat hand is 8-13 cm from the pole, and man_kilt_casual's fist floats short of the rail (`p/HH.png`).
- Towing a large trolley, the hand reaches the handle (`l/ZW.png`).
- Standing grips in the St Enoch census: median 2.9 cm, max 4.6 cm (`c/car_se.log`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
I looked at 20 faces (seed 25), neutral and smiling, at fov 14 (`f/N.png`, `f/S.png`), plus far faces (`n/LF2.png`, `n/OH.png`).
- Unchanged faults:
  - elder_shorts: slate brows, red lids and crease;
  - lopsided smiles (ya_smile_polo, boy_kilt, teen_tube);
  - dotted lashes on everyone;
  - adult_cap_shorts is browless;
  - on the far model: red lids (adult_camo_cap, adult_piper, staff_hivis) and elder_shorts' orange mouth.
- Smiles are closed-mouth and the eyes take no part.

### 3.4 Standing, sitting, behaviour: 8.18 (typical 8.7, worst 7.4)
Good:
- 0 visible removals in Cessnock and Ibrox rides (`v/ce.log`, `v/ib.log`);
- walk through a full Kelvinbridge train 6 of 6 done, nearest pass 0.40 m (`c/wk.log`);
- Buchanan Street inner platform over 200 s: 0 far models within 6 m, 0 duplicates, 0 overlaps (`g/bu.log`);
- no door-close snap seen.

Worst tenth:
- 8 of 15 turned-away boarders stand 0.4-0.6 m from the edge, up to 200 s, 4 of them near their door;
- paused-foot slide;
- briefcase, holdall and trolley owners never sit;
- stop-start toggles up to 34 a minute.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- Unchanged roster (99).
- The Buchanan Street census mix (woman 6, man 5, teen 5, girl 3, boy 1, elder 1, staff 1) is reasonable, but elders are thin on the ground.

### 3.6 Clothing: 7.72 (typical 8.4, worst 6.7)
- Mix is fine:
  - St Enoch outer ride: 71 car samples, 0 over half (`c/car_se.log`);
  - Buchanan Street platform: 25 samples, 0 over half (`g/bu.json`, `cen3.py`).
- Seated, from the front (`n/SIT.png`, legs view, all 14 skirt, dress and kilt wearers):
  - adult_beret: pencil skirt with two holes at the knees;
  - woman_sash: highland dress torn open in a ragged hole across the lap (`l/ZW.png`), and a pale spot at the hip from the side;
  - ya_smile_dress, woman_mini, woman_midi, teen_tube: dark open shell under the hem. Confirmed in the running Kelvinhall ride for ya_smile_dress (`k3/K.png`);
  - man_kilt_casual and the girls' kilts: gap;
  - elder_woman_coat: shards and bell.

  Seated riders are seen exactly from this angle, across the aisle, at 1-2 m.

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- I rendered 8 kinds (rucksack, handbag, holdall, shopper, large trolley, briefcase, tote, carrier) on adult_tattoo_muscle and woman_sash, standing, walking and sitting (`l/A.png`). All hang, stand or tow correctly.
- In the viewer, adult_tattoo_muscle's `ruck:day` showed a tote in hand: a viewer artefact, not counted.
- Briefcases, holdalls and trolleys never go to a seat.

### 3.8 Whole bodies: 7.68 (typical 8.4, worst 6.6)
Far models:
- hair through the hat on six hat wearers: adult_sport_cap and boy_cap worst, then adult_cap_baggy, ya_fedora, adult_beret, adult_piper;
- man_beard and sum_tube_denim shard hair;
- woman_puffer's slab;
- the top hat's band lost at the swap.

Near models:
- adult_cap_shorts' hair through the cap at the left temple, visible at 2 m (`n/CS.png`);
- woman_sash's seated lap hole;
- adult_beret's knee holes.

The four fixed hats are clean.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @ 1.9 m/s 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Far-model hair through hats on six more people:** adult_sport_cap, boy_cap, adult_cap_baggy, ya_fedora, adult_beret, adult_piper. Clean near models, so it flips at the 11 m swap.
   - Fix: put them in `HATTED` (with their hat material prefixes: beret, fedora, glengarry, sport cap) in `people_lodhair.py`. Check the top hat's band at the same time.
   - Reproduce: `ANGS='[["F",3.14,0.05],["Q",3.9,0.1],["B",0,0.1],["T",3.5,0.9]]' node shoot2.mjs 1 adult_beret,adult_cap_baggy,adult_sport_cap,boy_cap,ya_fedora,adult_piper none stand n/x face`.
3. **Seated skirts and dresses:**
   - adult_beret's knee holes;
   - woman_sash's ragged lap hole;
   - the dark open shells under the hems of ya_smile_dress, woman_mini, woman_midi and teen_tube;
   - the kilt gap, elder_woman_coat's bell.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.5,0.15]]' node shoot2.mjs 0 adult_beret,woman_sash,ya_smile_dress,woman_mini,woman_midi,teen_tube,man_kilt_casual,elder_woman_coat none sit n/x legs`. In game: `node gsk.mjs "mode=ride&q=high&line=outer&station=kelvinhall" 40 k/x`.
4. **Foot slide in the walk-to-stand blend:** St Enoch 13 of 30 pauses over 10 cm, max 0.36 m, 4 within 6 m.
   - Fix suggestion: pin the stance foot (IK) through the 0.4 s blend, or blend to an idle pose matched to the current stance foot.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=st-enoch" 200`.
5. **Turned-away boarders still wait at the edge:** 8 of 15 stop short of their spot and stand 0.39-0.59 m from the edge, up to 200 s, 4 near their door. Some walk 15-35 m along the edge first.
   - Fix suggestion: choose a spot away from the doors and the edge, nearer than 35 m; when blocked, keep trying rather than `stopHere`.
   - Reproduce: `node gaway.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 300`, then `python3 aw.py v/<log>`.
6. **Pole and rail hands do not grip:** woman_sash 8-13 cm off the pole, man_kilt_casual's fist short of the rail.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=kelvinhall" p/x 60 4`.
7. **Faces:** lopsided smiles, dotted lashes, elder_shorts' slate brows and lids, browless adult_cap_shorts, far-model red lids and orange mouths.
   - Reproduce: `node face2.mjs <ids> f/x "0:0" 1 8611 "" 14`.
8. **adult_cap_shorts near model:** brown hair through the green cap at the left temple, above the brim, visible at face distance.
   - Reproduce: `FD=0.5 ANGS='[["F",3.14,0.1],["L",3.9,0.2]]' node shoot2.mjs 0 adult_cap_shorts none stand n/x face`.
9. **Other far heads and ragged hair:** man_beard's and sum_tube_denim's shards, woman_puffer's blonde slab over an eye, ragged light hair edges.
   - Reproduce: `node shoot2.mjs 1 man_beard,sum_tube_denim,woman_puffer none stand n/x face`.
10. **Small items:**
    - briefcase, holdall and trolley owners never sit (`index.js:329`);
    - stop-start toggles up to 34 a minute while held up;
    - the far top hat loses its band at the swap;
    - the same 99 faces repeat.

## 5. What I could not observe

- **No motion watched.** Slides come from per-tick foot positions.
- **The door-close snap:** not seen in 3 rides. I cannot tell whether it is gone or I was unlucky.
- **Far hats in play:** I could not frame a far-model hat wearer in the game camera. The two I found at 18 m and 22 m were hidden behind others (`h/HG.png`). The far-model evidence is from the viewer, which loads the same `people_lod.glb`.
- **Blink and smile timing** in play.
- In the viewer, each still is a fresh spawn, so garment colours differ between frames of one sheet (`b/A.png`, `w/WB.png`). This is not a fault.
- My first `gaway` foot-slide figures (1.8 m and 6.2 m) were a script artefact: a stale foot position after the person had walked off and come back. They are not counted. `gtele.mjs` (traps every x/z write over 0.3 m) found **0** jumps in 240 s at Buchanan Street (`v/tele_bu.log`).

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, 6 phases, side, 1.7 m/s | adult_heel_boots, man_longcoat, teen_runner, ya_tee_jeans | `w/WB.png` |
| Paused walkers (yielding) | Partick outer, St Enoch inner explore | `pz/p_pa.log`, `pz/p_se.log` |
| Turned-away boarders traced | Buchanan Street outer explore x2; Ibrox inner ride | `v/aw_*.log` |
| Removals, releases, jumps, overlaps, door snap | Cessnock outer ride, Ibrox inner ride x2 (300 s each); jump trap at Buchanan Street | `v/ce.log`, `v/ib.log`, `v/snap_ib.log`, `v/tele_bu.log` |
| Far-model hats, 6 views and close | adult_camo_cap, adult_cap_shorts, elder_man_cap, adult_tophat (near and far) | `n/LF.png`, `n/LZ.png`, `n/HF.png`, `n/CS.png` |
| Other hat wearers, near and far | adult_beret, adult_cap_baggy, adult_sport_cap, boy_cap, ya_fedora, adult_piper, man_highland, staff_hivis, staff_woman | `n/OH.png`, `n/OHN.png` |
| Far heads, random 12 (seed 77) | elder_shorts, man_beard, boy, elder_man_cap, adult_vneck, adult_oxford_shirt, girl_leggings, sum_tube_denim, teen_skirt, woman_midi, adult_sport_cap, woman_puffer | `n/LF2.png` |
| Faces, neutral and smiling, fov 14 | 20 random (seed 25, list in `f/ids.txt`) | `f/N.png`, `f/S.png` |
| Bodies, stand / sit / walk | 8 random (seed 2525) | `b/A.png` |
| Seated skirts, dresses, kilts, coats | all 14 wearers plus elder_woman_coat, man_longcoat; in game ya_smile_dress, girl_school_kilt | `n/SIT.png`, `k3/K.png` |
| Luggage, 8 kinds x stand / walk / sit | adult_tattoo_muscle, woman_sash | `l/A.png`, `l/ZW.png` |
| Car garment mix and grips | St Enoch outer ride | `c/car_se.log` |
| Platform census, far within 6 m, duplicates, overlaps | Buchanan Street inner explore, 200 s | `g/bu.log`, `g/bu.json` |
| Eye-height and seated-eye views in every car | Kelvinhall outer ride | `e/KH.png` |
| Walk through a full train | Kelvinbridge inner, 6 walks | `c/wk.log` |
| Pole and rail hands | Kelvinhall outer: boy_small, man_kilt_casual, girl_ginger, woman_sash | `p/HH.png`, `p/kh.log` |
| Far hats in the game camera | St Enoch, Hillhead, Partick explores | `h/` |

Next round, look at:
- the remaining hat wearers' far models once they are fixed;
- seated skirts in a full car, at eye height;
- the turned-away boarders' final spots over a 10-minute run;
- whether the door-close snap is really gone (more rides, e.g. Cessnock inner, Govan).

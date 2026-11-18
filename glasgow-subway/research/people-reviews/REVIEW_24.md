# Under Glasgow: independent review of the people (review 24)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `0ef1d6e7`. I read the diff since review 23's `275d5cf8` read-only:
- `6073b55f`: `tools/assets_people_mpfb.py`, the new `hair_lifted()` (light, non-red hair goes through the grey-hair lift) and the flat-black brow case in `load_image`;
- `d76cdd6f`: `js/sim/people.js:946`, the watchdog now waits 6 s only for routed people with an `onArrive` (boarders); routed alighters get 2.5 s;
- `0ef1d6e7`: rebuilt `people.glb` / `people_lod.glb`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read (`git show` of the old GLBs into the scratch folder for an old/new comparison; deleted afterwards).

**Result: weighted mean 7.87 (7.868). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Three categories reach 8: Luggage (8.16), Behaviour (8.14) and Range (8.06).

In short:
- **Claim 1 (blonde hair) holds.** Old-vs-new renders of the same people: adult_smile_blouse golden-brown to light blonde, teen_hippy black to dark blonde, woman_puffer ginger to blonde, adult_cap_shorts orange to light brown. The lift also catches the `#a87a43` / `#b5854b` light-brown people (teen_boy, man_trews, adult_camo_cap, adult_runner, girl_shorts, adult_cap_shorts), who rendered **black** before and now render light brown. A platform now has eight blondes and five fair-brown heads.
- **Claim 2 (flat-black brows) holds.** adult_smile_blouse, adult_cap_shorts and teen_hippy have no black strips any more. The brows are now a thin blonde line, so faint that adult_cap_shorts looks browless at 1 m.
- **Claim 3 (alighter released after 2.5 s) holds.** Every routed alighter release in 6 game runs reads `stuck 2.5` (it was 6.1). No visible removals on any platform.
- **Claim 4 (nothing else changed) holds.** The walking instrument is identical to review 23 row for row. The door-close snap is still there (0.65 m and 0.66 m). Pole hands, seated garments and the far-model heads are unchanged.
- **New side effect of claim 1:** lifting light-brown hair exposed the far model's hair through the cap on **adult_camo_cap**. It was black hair under a black cap, so you could not see it; now it is light-brown islands on a black cap (`n/OLD1.png` vs `n/LF2.png`). Together with adult_cap_shorts, adult_tophat and elder_man_cap, four of the hat wearers now show hair through the hat on the far model.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review24/`. The walking recording (542 MB) was deleted after scoring; `m/rec.log` and `m/items.log` hold the results.

**Warning about my own scripts:** `gplat.mjs` and `gbagq.mjs` as first written ticked without updating world matrices. `stepBag` reads the bones' `matrixWorld` as last drawn, so hand bags appeared 2-11 m from their owners (a yellow shopper standing alone at the Buchanan Street edge in `v/BU2.png`). Rerun with `updateMatrixWorld` and a render each tick, the same moment gives 0 of 21 bags astray. This is a script artefact, not a game fault; any script that measures bags must render or update matrices every tick. `gbagh.mjs` (224 hand-bag samples in a St Enoch ride, rendered) found 0 bags above 55 % of body height or below the floor.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.3 | **8.14** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.4 | 6.8 | **7.76** |
| | **Weighted mean** | 100 | | | **7.87** (7.868) |

0.20x7.68 + 0.10x7.88 + 0.10x7.68 + 0.10x8.14 + 0.10x8.06 + 0.15x7.84 + 0.10x8.16 + 0.15x7.76 = 1.536 + 0.788 + 0.768 + 0.814 + 0.806 + 1.176 + 0.816 + 1.164 = 7.868.

Changes against review 23 (7.826):
- **Range +0.40:** blondes and fair-brown hair render as specified.
- **Faces +0.10:** no black brow strips under blonde hair.
- **Behaviour +0.04:** the alighter freeze is 2.5 s instead of 6 s.
- **Whole bodies -0.08:** adult_camo_cap's far-model hair through the cap is now visible; with adult_tophat and elder_man_cap, four hat wearers show it.
- Everything else is unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Blonde hair renders blonde (light non-red colours lifted before the tint) | **True.**<br>Old vs new, same viewer, same camera (`f/OLDNEW.png`, old GLBs from `275d5cf8` served by request interception):<br>- adult_smile_blouse: golden brown to light blonde;<br>- teen_hippy: black to dark blonde;<br>- woman_puffer: ginger to blonde;<br>- adult_cap_shorts: orange to light brown, as the builder said;<br>- teen_boy and adult_camo_cap: black to light brown.<br>All eight spec blondes now read blonde at fov 14 (`f/N.png`): woman_puffer, girl_small, girl_school_kilt, teen_hippy, adult_vneck, adult_heel_boots, adult_smile_blouse, sum_crop_denim. They also read blonde walking (`n/WS.png`) and on the far model (`n/LF.png`).<br>Side effects:<br>- the lifted, lighter strands show the hair cards' ragged edges more (adult_heel_boots, woman_puffer: `f/n_adult_heel_boots_0_0.png`);<br>- teen_boy's crown shows dark scalp mottling through the light hair, on both models (`n/HAT.png`, `n/HAT1.png`);<br>- adult_camo_cap's far-model hair through the cap became visible (`n/OLD1.png` old: black on black; `n/LF2.png` new: light-brown islands on the black cap). | `f/OLDNEW.png`, `f/N.png`, `n/LF.png`, `n/LF2.png`, `n/OLD1.png`, `n/WS.png` |
| 2 | Flat-black eyebrow007 becomes an even light grey and takes the tint | **True.**<br>- adult_smile_blouse, adult_cap_shorts and teen_hippy now have thin blonde-to-light-brown brows (`f/Z.png`, fov 7).<br>- adult_cap_shorts' brow is so faint that she reads browless at 1 m.<br>Dark-haired eyebrow007 users (woman_coat, teen_girl, teen_skirt, staff_woman, sum_tee_leggings, ya_ginger_long) still have the same thin, broken, flat-coloured strips: brown-black, or red-brown on ya_ginger_long. Flat colour does not change how thin the texture is. | `f/Z.png`, `f/OLDNEW.png` |
| 3 | An alighter held up in view joins those waiting after 2.5 s (was 6 s) | **True.**<br>`gvan12.mjs` (yielding), 6 runs: Cowcaddens inner ride, Partick outer ride, Ibrox inner ride, Cessnock outer ride (300 s each), Buchanan Street outer explore (240 s and 300 s). Every routed-alighter release (`people.js:946:424`) reads `stuck 2.5`. Platform removals in view: **0** in all 6.<br>Releases are 3-12 a run, 0-3 of them within 6 m.<br>Boarders still wait 6.1 s before release (by design). | `v/cw.log`, `v/pa.log`, `v/ib.log`, `v/ce.log`, `v/bu.log`, `v/bu2.log`, `van2.py` |
| 4 | Not changed: brisk crouch, paused slide, door-close snap, pole hands, faces, seated coats/kilt, far heads, briefcase owners | **True.**<br>- Instrument identical to review 23 (`diff` of `m/rec.log`, `m/items.log`): 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7.<br>- Paused slide, Partick explore: **16 of 30** episodes over 10 cm (review 23: 9 of 30), max 0.41 m, 6 of them within 6 m.<br>- Door-close snap: Cessnock ya_smile_polo 0.65 m (from -0.35 m inside the doorway to 0.30 m on the platform, 13 m from the camera); Ibrox adult_runner 0.66 m (`v/snap_ib.log`).<br>- Kelvinhall pole hands open, 1-9 cm off the pole; teen_tube's fingertips 5-7 cm off (`p/HH.png`).<br>- Kilt gap, bell coat and plate skirt (`n/SIT.png`).<br>- Briefcase, holdall and trolley owners are never given a seat (`index.js:329`). | `m/`, `pz/p_pa.log`, `v/ce.log`, `v/snap_ib.log`, `p/`, `n/SIT.png` |

## 2. Status of REVIEW_23's top ten

| # | REVIEW_23 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical). | `m/` |
| 2 | Feet slide while paused | Not fixed: 16 of 30 over 10 cm, max 0.41 m. | `pz/p_pa.log` |
| 3 | Blonde brows | **Fixed** for adult_smile_blouse and adult_cap_shorts (no black). The new brows are very faint. elder_shorts still has slate-blue brows, the crease and the red dot. | `f/Z.png` |
| 4 | Pole and rail hands | Not fixed. | `p/HH.png`, `p/kh.log` |
| 5 | Far-model heads | Not fixed:<br>- adult_cap_shorts: hair through the cap;<br>- adult_smile_blouse: shards and a scalp stripe;<br>- elder_woman_coat: the slab over the eye;<br>- girl_school_kilt and girl_small: pink and red lids.<br>**Now visible as well:** adult_camo_cap (hair through the cap), adult_tophat (grey hair through the hatband), elder_man_cap (white islands through the cap top), and brow dots on the forehead on teen_skirt and ya_smile_halter. | `n/LF.png`, `n/LF2.png`, `n/HAT1.png` |
| 6 | Faces: smirks, lashes, elder_shorts, near-browless women | Not fixed. girl_small, teen_boy and ya_ginger_braid smile lopsidedly. ya_ginger_long and girl_ginger look half-smiling at neutral. Lashes are dotted on everyone. Near-browless: adult_cap_shorts, sum_tee_leggings, elder_woman_coat. | `f/S.png`, `f/N.png`, `f/Z.png` |
| 7 | Seated garments | Not fixed. | `n/SIT.png` |
| 8 | Stuck alighters (6 s freeze) and door-close snap | Freeze **cut to 2.5 s**. The snap is not fixed (0.65 m and 0.66 m). | `v/` |
| 9 | Spec blondes rendered auburn, ginger or black | **Fixed.** | `f/OLDNEW.png`, `f/N.png` |
| 10 | Small items | Briefcase owners never sit: unchanged.<br>Garment mix:<br>- St Enoch inner explore: 0 of 23 samples over half (worst 6 of 12 trousers in a car);<br>- St Enoch outer ride cars: 0 of 11.<br>Boarders left on the platform: re-measured, see new item 4. | `g/se.json`, `c/car_se.log`, `v/board_*.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is unchanged (`m/rec.log`).
- Brisk stills at 1.7 m/s show bent-knee stance on all four people sampled, worst on adult_heel_boots in stilettos (`n/WS.png`).
- Paused slide: 16 of 30 over 10 cm.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Unchanged: open pole hands with fingers 1-9 cm off the pole (`p/HH.png`).
- Hand bags hang correctly: 224 rendered in-game samples, none raised or below the floor.

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
I looked at 28 faces neutral and smiling at fov 14, and 28 eye regions at fov 7 (`f/N.png`, `f/S.png`, `f/Z.png`). I also took 24 in-game close-ups at Kelvinbridge (`f/K.png` full model, `f/H.png` far model).
- Better: no black strips under blonde hair.
- Worst tenth:
  - elder_shorts: slate brows, crease, red dot;
  - lopsided smiles (girl_small, teen_boy);
  - dotted lashes on everyone;
  - near-browless faces (adult_cap_shorts, sum_tee_leggings, elder_woman_coat);
  - broken eyebrow007 strips on dark-haired women;
  - far-model faults: pink lids, and brow dots on the forehead (teen_skirt, ya_smile_halter; `n/LF2.png`). In the game, faces beyond about 11 m are drawn with the far model.

### 3.4 Standing, sitting, behaviour: 8.14 (typical 8.7, worst 7.3)
Good:
- 0 visible platform removals in 6 runs;
- walk-through of a full train 6 of 6 done, nearest pass 0.40 m (`c/wk.log`);
- St Enoch platform: 0 far models within 6 m, 0 duplicates, 0 overlaps (`g/se.log`);
- no visible jumps in the train's own crowd in 2 rides (`c/sal_*.log`).

Worst tenth:
- the door-close snap of 0.65 m;
- **boarders turned away** (duplicate or garment-mix rule) stand at the platform edge, 0.3-0.9 m from it, through train after train:
  - Buchanan Street explore: 8 of 12 turned away at the first train;
  - man_commuter, ya_shorts, teen_hood and others stood at the same doors for 250 s, queued for the next train and were turned away again (`v/bu2.log`, the `tr` traces);
  - rides: 13 turn-aways against 30 boardings (`v/board_ib.log`, `v/board_kh.log`);
- paused slide;
- briefcase owners who never sit.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- Blondes and fair-brown hair now show as specified, so a platform has visibly fair heads (`v/BU.png`, `e/HH.png`).
- What holds the worst tenth down: the same 99 faces repeat; several blonde wigs are the same coarse card hair; the lift flattens hair to one tone.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- Mix fine: 0 of 23 platform samples and 0 of 11 car samples over half.
- Seated kilt gap, bell coat and plate skirt are unchanged (`n/SIT.png`).

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- I rendered a briefcase, large trolley and holdall on sum_crop_denim and elder_man_cap, standing, walking and sitting (`l/BAGS.png`). All are right.
  - elder_man_cap's standing holdall is raised to the chest on a phone-like pose in one viewer still (`l/b_elder_man_cap_holdall_stand_S.png`). This is a viewer artefact: the viewer sets the bag after picking the pose, and the game never gives a phone pose to someone with a bag in hand (`people.js:644`; 0 of 224 in-game samples).
- Briefcases still never go to a seat.

### 3.8 Whole bodies: 7.76 (typical 8.4, worst 6.8)
Far models (`n/LF.png`, `n/LF2.png`, `n/HAT1.png`):
- hair through the hat on four hat wearers (adult_cap_shorts, adult_camo_cap (newly visible), adult_tophat, elder_man_cap);
- adult_smile_blouse's shards and scalp stripe;
- elder_woman_coat's slab;
- man_trews' shard hair;
- sum_crop_denim's helmet-like far hair with a hard edge.

Near models: the seated kilt gap; teen_boy's dark scalp patches through the light hair.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG p10 5.9, SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Feet slide while paused:** 16 of 30 over 10 cm, max 0.41 m, 6 within 6 m.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=partick" 200`.
3. **Far-model hair through hats:** adult_camo_cap (newly visible after the lift), adult_cap_shorts, adult_tophat, elder_man_cap. Also adult_smile_blouse's shards, elder_woman_coat's slab, and pink lids and forehead brow dots on the far model.
   - Reproduce: `node shoot.mjs 1 adult_camo_cap,adult_cap_shorts,adult_tophat,elder_man_cap none stand n/x face`.
4. **Turned-away boarders stand at the doors for minutes.** At Buchanan Street, 8 of 12 boarders were turned away at the first train. They stood 0.3-0.9 m from the edge for 250 s and were turned away again at the next train.
   - Fix suggestion: send them back from the edge, or let them on and accept the duplicate.
   - Reproduce: `node gvan13.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 300` (REL at `index.js:319`, then the `tr` traces); `node gboard.mjs ...`.
5. **Pole and rail hands do not grip:** open hands, 1-9 cm off the pole.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=kelvinhall" p/x 60 4`.
6. **Faces:**
   - smirks (girl_small, teen_boy, ya_ginger_braid);
   - dotted lashes;
   - elder_shorts' slate brows, crease and dot;
   - faint or absent brows (adult_cap_shorts, sum_tee_leggings, elder_woman_coat);
   - thin broken eyebrow007 strips on dark-haired women.
   - Reproduce: `node face2.mjs <ids> f/x "0:0" 0 8611 "" 7`.
7. **Seated garments:** man_kilt_casual's kilt gap, elder_woman_coat's bell, woman_coat's plate skirt.
   - Reproduce: `node shoot.mjs 0 man_kilt_casual,elder_woman_coat,woman_coat none sit n/x body`.
8. **Door-close snap:** someone in the doorway is moved 0.65 m in one frame when the bays clear (Cessnock ya_smile_polo, Ibrox adult_runner).
   - Reproduce: `node gvan12.mjs "mode=ride&q=high&line=outer&station=cessnock" 300` (TELE `setBays-snap`).
9. **Hair cards on lifted hair:** the lighter strands show ragged card edges (adult_heel_boots, woman_puffer), and teen_boy's crown shows dark scalp through light hair (`f/N.png`, `n/HAT.png`).
10. **Small items:** briefcase, holdall and trolley owners never sit (`index.js:329`); the same 99 faces repeat.

## 5. What I could not observe

- **No motion watched.** Slides and snaps come from per-tick numbers.
- **Blink and smile timing** in play.
- **Real-time frame pacing.** All game runs used fixed 0.1 s ticks with yields.
- I did not render a door-close snap as an image.
- I did not check whether a released alighter, now let go 3.5 s sooner, ends up blocking boarders more often. Alighter releases per run (3-12) are in the range review 23 saw (7-10).

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk-walk stills, 4 phases, side | adult_smile_blouse, teen_hippy, woman_puffer, adult_heel_boots @ 1.7 m/s | `n/WS.png` |
| Removals, releases, snaps, jumps, overlaps (yielding) | rides: Cowcaddens inner, Partick outer, Ibrox inner, Cessnock outer (300 s); explore: Buchanan Street outer x2 | `v/*.log` |
| Door-close snap | Ibrox inner (`gsnap2`) | `v/snap_ib.log` |
| Boarders routed vs turned away | Buchanan Street explore; Ibrox inner, Kelvinhall outer rides | `v/board_*.log`, `v/bu2.log` |
| Platform eye-height views | Buchanan Street at 31, 34, 62, 80, 135, 140 s | `v/BU.png`, `v/BU2.png` (bag positions in these are stale: script artefact, see the top) |
| Train's own crowd: removals and jumps | Cowcaddens inner, Partick outer | `c/sal_*.log` |
| Paused slide | Partick outer explore | `pz/p_pa.log` |
| Faces neutral and smiling, fov 14; eyes, fov 7 | 28 people incl. every blonde, fair-brown, ginger, grey and eyebrow007 user | `f/N.png`, `f/S.png`, `f/Z.png` |
| Old vs new faces (GLBs from `275d5cf8`) | adult_smile_blouse, teen_hippy, adult_cap_shorts, woman_puffer, teen_boy, adult_camo_cap, woman_coat, ya_ginger_long | `f/OLDNEW.png` |
| In-game face close-ups (full and far) | 24 people, Kelvinbridge outer ride, platform and car | `f/K.png`, `f/H.png` |
| Far-model heads | 22 people incl. every hat wearer and the blondes | `n/LF.png`, `n/LF2.png`, `n/HAT1.png`, `n/OLD1.png` |
| Near-model hats, three views | adult_camo_cap, adult_cap_shorts, adult_tophat, elder_man_cap, teen_boy, man_trews | `n/HAT.png` |
| Seated garments | man_kilt_casual, elder_woman_coat, woman_coat, adult_smile_blouse | `n/SIT.png` |
| Luggage, stand / walk / sit | sum_crop_denim, elder_man_cap x briefcase, large trolley, holdall | `l/BAGS.png` |
| Hand-bag height in game | St Enoch outer ride, 224 samples | `gbagh.mjs` output (0 flagged) |
| Pole-hand close-ups | Kelvinhall outer: girl_leggings, teen_tube, boy_small, elder_woman_dress | `p/HH.png`, `p/kh.log` |
| Eye-height views along every car | Hillhead inner ride | `e/HH.png` |
| Car garment mix and grips | St Enoch outer ride | `c/car_se.log` |
| Platform census | St Enoch inner explore | `g/se.log`, `g/se.json` |
| Walk through a full train | Hillhead outer, 6 walks | `c/wk.log` |

Next round, look at:
- turned-away boarders across a longer run;
- a door-close snap rendered from the platform;
- hat wearers' far models at 11-15 m in the game camera;
- blink and smile timing.

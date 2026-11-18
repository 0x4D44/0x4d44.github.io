# Under Glasgow: independent review of the people (review 15)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `470a559b`. The changes since review 14 are in `58b5da96` (pole holds, bag-aware boarding, per-car garment mix, darker tartan, smile normals), `4c08f055` (two faces rebuilt; people.glb, people_lod.glb and people_meta.json changed) and `470a559b` (gangway poles not held; pole holders off the middle line). I read the diffs read-only. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.62 (7.617). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Two categories reach 8: Standing/sitting/behaviour (8.12) and Luggage (8.10). Six are below 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review15/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. The raw walking recordings (`m/rec`, 540 MB) were deleted after scoring to keep within the disk limit; `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.3 | 6.0 | **7.38** |
| 2 | Arms and hands | 10 | 8.6 | 7.0 | **7.96** |
| 3 | Faces | 10 | 7.9 | 6.5 | **7.34** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.4 | **8.12** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.1 | 6.4 | **7.42** |
| 7 | Luggage | 10 | 8.7 | 7.2 | **8.10** |
| 8 | Whole bodies | 15 | 8.0 | 6.5 | **7.40** |
| | **Weighted mean** | 100 | | | **7.62** (7.617) |

0.20x7.38 + 0.10x7.96 + 0.10x7.34 + 0.10x8.12 + 0.10x7.66 + 0.15x7.42 + 0.10x8.10 + 0.15x7.40 = 1.476 + 0.796 + 0.734 + 0.812 + 0.766 + 1.113 + 0.810 + 1.110 = 7.617.

In one line: up from 7.49. The pole holds are a real fix. Holders now stand at a real door pole, and at eye height in a car they read as holding it. Closer than about 1 m, one of the two hold clips leaves the hand open beside the pole, 4-14 cm from it. adult_oxford_shirt's face is fixed. Against that, **the garment mix got worse.** Over half in one garment group: 23 of 86 census samples, against 7 of 84 in review 14, with up to 73 % trousers. Counting per car: 41 of 180 car-samples. Walking, the seated garments and the remaining faces are unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Pole holders placed at a real door pole, gripping hand on it (0.4-3 cm from the pole axis); gangway poles not held; ~60 % of standing boarders take a pole | **True for the placement; the 0.4-3 cm figure holds for one clip only.** I found the car's `orange_pole` geometry in the game (`pg.mjs`). Each door pole rises straight from the floor (y 0.695) to y 1.95, only **1.26 m above the floor**. It then slants inward to the overhead rail (x 0.58 to 0.45, up to y 2.37). Holders in `stand_hold_rail` grip about 1.05 m above the floor, on the straight part, at **0.1-1.7 cm (rarely up to 9 cm)** from the axis. Holders in `stand_hold_pole` grip about 1.55 m above the floor, which is above the bend. Measured to the vertical axis, their hand looks right (axisD 1.6 cm). Measured to the slanted pole that is actually there, it is **4-14 cm away, median 4.5-8.7 cm** in three rides (`c/*.log`). Over three rides, 80 of 210 holder-samples are more than 4 cm off. Rendered (`p/Z2.png`, `p/BU.png`): the pole-clip hand is an open claw with fingers up, beside or in front of the slant, not round it. The rail-clip hand rests at the pole with the thumb on one side and loose, straight fingers on the other (`p/PT.png`, `p/SE.png`). At eye height, 1.1-2.5 m away, both clips read as holding on (`e/KB.png`). No body vertices inside a pole except one sample of 2 (`p/cow.log`). Holders seen per ride: 1-12. | `p/cow.log`, `c/cow.log`, `c/sr.log`, `c/bu.log`, `p/CW.png`, `p/Z2.png`, `p/BU.png`, `p/PT.png`, `p/SE.png`, `e/KB.png` |
| 2 | Bags: boarders avoid seats with someone standing at their feet; standing boarders keep off a coming bag | **True in code. Mostly effective, one event remains.** Bag probe, 150 s each, on Hillhead inner (the review-14 site), Kelvinhall outer, Ibrox inner (two loads). Three of the four rides had only 1 s walk-throughs. **Ibrox run 1: man_trews (state `stand`, phone_stand) had his left shin in ya_ginger_braid's tote for 14 s.** It was not rendered; the second load did not reproduce it. Review 14 had 2 of 7 rides (6 s and 16 s). | `bs/hh.log`, `bs/kv.log`, `bs/ib.log`, `bs/ib2.log` |
| 3 | Garment mix rule counts the same car only | **True in code, but the mix is worse, not better.** The review-14 census (`cen3.py`, people within 15 m) has **23 of 86 samples over half** (St Enoch outer ride 18 of 22, max 73 % trousers; Buchanan explore 5 of 19, 60 %). Review 14 had 7 of 84. Per car (`gcar.mjs`, every 10 s, cars with 5 or more riders), using the builder's own four groups: **41 of 180 car-samples over half**. Shields Road car 3 had 12 of 20 in trousers (60 %) from the first sample, so the problem is in the spawned crowd, not only in boarders. Cowcaddens car 2 had 7 of 12 in shorts (58 %) after a station stop. Boarders keep the look they had on the platform, so the pick rule never sees them. | `g/*.log`, `g/*.json`, `c/*.log`, `c/*.json` |
| 4 | woman_mini's tartan darker; smile morph normals | **True.** The tartan is now a darker green, no longer neon (`n/A1.png`). Smiles look a little more even: no hard crease on one side, for example woman_bob and adult_oxford_shirt (`f/F.png`). They are still small closed-lip smiles. man_highland's mouth still reads lopsided at rest and smiling. | `n/A1.png`, `f/F.png` |
| 5 | adult_oxford_shirt and sum_shorts_asian_m rebuilt | **adult_oxford_shirt: true and fixed.** He reads as an ordinary grey-haired man, with no orange mask and no smeared sockets (`f/F2.png`). **sum_shorts_asian_m: better, not fixed.** The eyes are open, not slits, but the face texture is still smeared and blurry. The mouth sits off-centre to his left, and at 0.85 m he reads as a low-detail face (`f/F.png` row 1, `f/F2.png`). | `f/F.png`, `f/F2.png` |
| 6 | Not changed: brisk crouch, smile shape, seated garment edges, arm splay, floor-bag orientation | **True.** Instrument re-recorded on the whole roster: overall 9.44, LEG 7.6 (p10 5.2), SMO p10 6.9, ARM.splay 9.2, worst recording adult_heel_boots @ 0.4 m/s 7.9. Seated faults as before: woman_mini's skirt bells round the seat, sum_denim_shorts_m's shorts balloon behind the hips (`n/SIT.png`), and there are dark flaps between the thighs at eye height (`gx/E.png`). End-on floor bags still read as slivers (`gx/E.png`: white, green and yellow spikes). | `m/items.log`, `n/SIT.png`, `gx/E.png` |

## 2. Status of REVIEW_14's top ten

| # | REVIEW_14 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch and pelvis jolts | **Not fixed** (LEG 7.6, p10 5.2; SMO p10 6.9). | `m/items.log` |
| 2 | Pole holds grip air | **Largely fixed.** Holders are at real poles. Rail clip 0-2 cm. Pole clip 4-14 cm from the slanted pole, with an open hand: visible under 1 m, borderline at 1-2 m. | `c/*.log`, `p/Z2.png`, `e/KB.png` |
| 3 | Faces | **Partly fixed.** adult_oxford_shirt fixed. sum_shorts_asian_m still blurry. Smiles still small closed-lip. | `f/F.png`, `f/F2.png` |
| 4 | Seated garment edges | **Not fixed.** | `n/SIT.png`, `gx/E.png` |
| 5 | Standing riders in floor bags | **Better:** 1 of 4 rides (14 s), against 2 of 7. | `bs/*.log` |
| 6 | Garment mix | **Worse:** 23 of 86 over half (max 73 %), against 7 of 84 (max 57 %). | `g/*.json`, `c/*.json` |
| 7 | Arm splay and small free-arm swing | **Not fixed** (ARM.splay 9.2). | `m/items.log` |
| 8 | End-on floor bags read as slivers | **Not fixed.** | `gx/E.png` |
| 9 | Shared face template and coat silhouette | **Not fixed** (unchanged meshes). | — |
| 10 | Small items | heel_boots 7.9 unchanged; tartan now darker (fixed); Lycra crotch crease not rechecked; large case on a real stair still not seen. The viewer's `stair` state is flat ground (`l/ST.png`). | `m/items.log`, `n/A1.png`, `l/ST.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.38 (typical 8.3, worst 6.0)
Unchanged code and an identical instrument result (`m/items.log`). Mid-speed walks of 17 new people look right at a glance (`n/A1.png`, `n/A2.png`). The brisk crouch (knee 28 deg in loading, 20 deg in mid-stance) remains the worst tenth.

### 3.2 Arms and hands: 7.96 (typical 8.6, worst 7.0)
- Better: hands are now at real poles, and at eye height in the car (`e/KB.png`: sum_crop_denim, ya_fedora, adult_piper, man_kilt_casual) the holds read as holding.
- Worst tenth:
  - the `stand_hold_pole` hand is an open claw 4-14 cm from the slanted top of the pole (`p/Z2.png`, ya_smile_polo; `p/BU.png`, man_highland). This is 40-55 % of holders depending on the load.
  - the rail-clip fingers do not wrap the pole.
  - the phone_stand hands cross with splayed fingers in front of the face (`f/F.png` rows 2).
  - ARM.splay on brisk walks.

### 3.3 Faces: 7.34 (typical 7.9, worst 6.5)
Twelve faces at 0.85 m, neutral and smiling (`f/F.png`, `f/F2.png`). adult_oxford_shirt is now fine. sum_shorts_asian_m is still a smeared, off-centre face. Smiles are small and closed-lip. man_highland's mouth reads lopsided. Skin is doll-smooth throughout.

### 3.4 Standing, sitting, behaviour: 8.12 (typical 8.6, worst 7.4)
- Far model within 6 m: 0 in 4 game runs (Buchanan explore; St Enoch ride; Partick explore and board; Hillhead ride; 77,000 person-samples within 6 m).
- Duplicates 0. Stair stalls 0 (51 stair walkers). Overlaps: 3-6 brief moving passes per ride, longest 0.7 s.
- Pole holders stand in the door bays, off the middle line, and nobody holds a gangway pole.
- Worst tenth: man_trews' shin in a tote for 14 s (Ibrox).

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged at 99. The two rebuilt faces add a credible East Asian adult (adult_oxford_shirt). Children are still 11 %. Several young men still share a face template. Skin tones and builds span well (`n/A1.png`, `n/A2.png`, `n/LOD.png`).

### 3.6 Clothing: 7.42 (typical 8.1, worst 6.4)
- Good: the variety is real (harem trousers, top hat and tails, crop top with Lycra shorts, leggings, minis, suits; `n/A1.png`, `n/A2.png`). The tartan is no longer neon.
- Worst tenth:
  - the garment mix, now over half in 27 % of census samples and 23 % of car-samples. The rubric's limit is "no more than half of any spawned crowd".
  - the seated garment faults, unchanged: woman_mini's bell skirt, shorts ballooning behind the hips, the coat flap between the thighs (`n/SIT.png`, `gx/E.png`).

### 3.7 Luggage: 8.10 (typical 8.7, worst 7.2)
- Good: every kind on four bodies, walking, is carried right (`l/WK.png`). Bag inside bag: 0 in 4 rides. Own legs in own bag: 0.
- Worst tenth:
  - one 14 s foot-in-bag event.
  - end-on totes and carriers standing on the car floor read as slivers (`gx/E.png`).
  - the large case on real stairs remains unobserved.

### 3.8 Whole bodies: 7.40 (typical 8.0, worst 6.5)
Nothing changed. Far models look whole at distance (`n/LOD.png`). The worst tenth is the seated garments as in 3.6.

## 4. Top ten defects, in priority order

1. **Garment mix over half, worse than before.** 23 of 86 census samples, up to 73 % trousers on a St Enoch ride; per car, 41 of 180 car-samples, with Shields Road car 3 at 60 % trousers from the start. The per-car rule does not hold the spawned car under half: the 45 % cut-off is applied only while it still leaves a fitting candidate, with `nOwn >= 4`. Boarders and alighters keep their looks and bypass it altogether.
   - Reproduce: `node gcar.mjs "mode=ride&q=high&line=outer&station=shields-road" c/sr 150`; `node gp8.mjs "mode=ride&q=high&line=outer&station=st-enoch" g/sen 150`, then `python3 cen3.py g/*.json`.
2. **Brisk-walk crouch and pelvis jolts** (LEG 7.6, p10 5.2; SMO p10 6.9). Walking carries 20 %.
   - Reproduce: `people_motion.mjs --people all`, then `--from DIR --items --worst 12`.
3. **`stand_hold_pole` hand misses the slanted pole.** The door pole is vertical only to 1.26 m above the floor; the hand is placed on the vertical axis at about 1.55 m, where the pole has bent inward. Result: 4-14 cm off, with an open hand. Fit the grip to the real polyline (vertical plus slant), or use only the rail clip's height range on the vertical part; close the fingers.
   - Reproduce: `node gp15.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 10,30,30`; `node gph.mjs "mode=ride&q=high&line=outer&station=buchanan-street" p/bu 30 6`.
   - Evidence: `p/Z2.png`, `p/BU.png`, `c/*.log`.
4. **Seated garment edges**: woman_mini's bell skirt; sum_denim_shorts_m's and sum_chino_shorts_m's shorts ballooning behind the hips; woman_coat's flap; adult_beret's notches.
   - Reproduce: `node shoot.mjs 0 woman_mini,sum_denim_shorts_m,woman_coat none sit n/x body`.
   - Evidence: `n/SIT.png`, `gx/E.png`.
5. **Faces**: sum_shorts_asian_m smeared and off-centre; smiles small closed-lip; man_highland lopsided; doll skin.
   - Reproduce: `node face.mjs sum_shorts_asian_m,man_highland f/x "0:0" 1`.
6. **End-on floor bags read as slivers** at eye height.
   - Reproduce: `node gsk.mjs "mode=ride&q=high&line=outer&station=kinning-park" gx/kp 30,90 10`.
7. **Hands at close range**: the rail-clip fingers are straight, not wrapped; the phone_stand fingers cross and splay in front of the face (`p/SE.png`, `f/F.png`).
8. **Arm splay on brisk walks** (ARM.splay 9.2).
9. **A standing rider's shin in a seated rider's tote** (Ibrox inner, man_trews in ya_ginger_braid's tote, 14 s). It varies per load.
   - Reproduce: `node gbag.mjs "mode=ride&q=high&line=inner&station=ibrox" bs/ib 150`.
10. **Small items**: adult_heel_boots @ 0.4 m/s (7.9); shared young-male face template and coat mesh; the large case on real stairs still unseen.

## 5. What I could not observe

- No motion watched; walking judged from the instrument and stills.
- The large case on a real station stair: the viewer's `stair` state is flat ground (`l/ST.png`), and I did not catch one on a game stair.
- The 14 s foot-in-tote event was measured, not rendered; the second Ibrox load did not reproduce it.
- Blink and smile timing in play: code only.
- Every load differs; holder counts ranged from 1 to 12 per train.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster (99), re-recorded | all | `m/rec.log`, `m/items.log` |
| Pole holders: grip to the real pole polyline, body inside pole, 6 sub-frames | Cowcaddens inner ride | `p/cow.log` |
| Holders per car every 10 s, grip distance by clip, garment groups per car | Cowcaddens inner, Shields Road outer, Buchanan Street outer rides (150 s) | `c/*.log`, `c/*.json` |
| Holders close up (0.4-0.5 m, two sides) and at 1.2 m | Cowcaddens, Shields Road, Partick, St Enoch, Buchanan Street rides: sum_tee_leggings, ya_smile_polo, ya_smile_halter, teen_skirt, man_elder, elder_woman_dress, ya_winter, woman_dress, adult_suit_bun, boy_kilt, teen_tube, adult_piper, man_highland | `p/CW.png`, `p/Z1.png`, `p/Z2.png`, `p/SH.png`, `p/PT.png`, `p/SE.png`, `p/BU.png` |
| Holders at eye height in the car, 1.1 and 2.5 m, others visible | Kelvinbridge inner ride | `e/KB.png` |
| Pole geometry in the game | Govan car 1 | `pg.mjs` output |
| Floor bags vs legs | Hillhead inner, Kelvinhall outer, Ibrox inner x2 (150 s) | `bs/*.log` |
| Game census (far model < 6 m, overlaps, duplicates, stair stalls, garment mix) | Buchanan Street inner explore; St Enoch outer ride; Partick outer explore and board; Hillhead inner ride | `g/*.log`, `g/*.json` |
| Seated riders and floor bags at eye height, t = 30 and 90 s | Kinning Park outer ride | `gx/E.png`, `gx/kp_*` |
| 17 people new to review 14: stand, walk, sit (F/S/B), full model | woman_mini, adult_harem, adult_tophat, adult_tie_suit, boy_small, girl_ginger, man_hoodie, man_longcoat, man_puffer, man_student, sum_crop_bike, sum_denim_shorts_m, teen_crop_leggings, teen_runner, ya_fedora, ya_knit, woman_scarf | `n/A1.png`, `n/A2.png`, `n/SIT.png` |
| Far model stand and sit | 10 incl. both rebuilt faces | `n/LOD.png` |
| Faces at 0.85 m, neutral and smiling | adult_oxford_shirt, sum_shorts_asian_m, woman_mini, ya_spiky, man_commuter, teen_skater, woman_bob, elder_woman_dress, girl_shorts, man_highland | `f/F.png`, `f/F2.png` |
| Bags walking and "stair" (flat in the viewer) | woman_scarf, man_puffer, teen_girl, elder_man_suit x large trolley, case, hiking ruck, shopper, handbag | `l/WK.png`, `l/ST.png` |

Next round, look at: whether the per-car rule holds the spawned car under half; the pole-clip hand on the slanted pole after any fix (closer than 2 cm to the polyline, fingers closed); a large case on a real station stair.

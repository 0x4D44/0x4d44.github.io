# Under Glasgow: independent review of the people (review 30)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `328bcb7c`. One change since review 29 touches the people, in `js/sim/index.js` `_populateSaloon()` (line 190, read-only diff): an **unsupported stander placed when the train is populated** now keeps 0.5 m along the car from a seated rider on the same side when the train is busy (load > 0.9). Before, the check (0.75 m) only applied when the train was not busy.

`people.glb`, `people_lod.glb`, `people.js` and the walk code did not change. I edited nothing in the repository and only read git. Every game script yields to the page between ticks, and it updates world matrices on every tick before reading bones.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.84 (7.840). Gate NOT met.** Three categories are at 8 or above: Luggage 8.12, Range 8.06 and Behaviour 8.00. Five are below 8: Walking 7.64, Faces 7.68, Clothing 7.70, Arms 7.80 and Whole bodies 7.94.

In short:
- **Claim 1 holds for what it changes, but it does not fix the fault.**
  - Riders placed when a train is populated are clean. I refilled the player's train 80 times (12 busy trips, load 0.93-1.11). No placed stander had a leg within 6 cm of a seated rider's legs, and no stander's hand touched anyone (`e/bz_inner.log`, `e/bz_outer.log`).
  - **But the same contacts still happen in play, and every time a boarder is involved.** In 4 of 13 rides, a stander stood in a seated rider's knee zone for 80-185 s, or a seated rider's hand rested on a stander's leg:
    - Govan inner: adult_tie_suit stands against ya_spiky's knees for 180 s; his shopper bag is in her lap (`e/inner_govan_k_adult_tie_suit-ya_spiky.png`).
    - Kinning Park inner: adult_lusekofta (a boarder) holds the rail in front of teen_ginger (a boarder). His shin is between her knees and her hand is on his leg for 185 s (`e/KN.png`).
    - Cowcaddens inner, a busy train: elder_man_cap (a boarder) stands against ya_tube_heels' knees (a boarder), 4.4 cm, 80 s.
    - Partick inner, a busy train: adult_tophat boards and sits in front of man_kilt_casual at the pole. Her hand is on his leg for 100 s.
  - The cause is in the boarding code (`index.js` 325-339):
    - The fallback standing spot for a boarder checks other standers but not seated riders.
    - The pole spot checks only riders who are already seated. Another boarder still walking to the seat in front of it is not checked.
- **Claim 2 (nothing else changed) holds.** The walking instrument over the whole roster matches review 29 line for line (`m/items.log`). Grips, hats, sleeves, hems, faces, the handbag and snaps behave as before. Several measure worse in this sample (below).
- **New this round:**
  - **Bodies overlapping in a car.** elder_woman_dress and elder_man_cap stood with their pelvises 0.20 m apart for 80 s (Cowcaddens inner). Her hand is on his thigh and their bodies overlap (`e/KN2.png`, third panel). Stander pairs under 0.5 m apart occurred in 6 of 13 rides.
  - **Snap of 1.32 m at 8.2 m from the camera:** man_trews, an alighter, stalled 1.0 m past the edge line (still in the doorway). When the doors closed, `setBays` moved him 1.32 m onto the platform in one tick (Govan inner, `v/go.log`).
  - **woman_midi's jumper hem** shows as torn red fragments over the black waistband of her skirt, from the front (`n/CL.png`, `n/CL2.png`). Earlier reviews looked only under her hem.
  - **man_kilt_casual's knee comes through the front of the kilt** as he walks: skin shows through the tartan. There is also a gap at the left hip, seen from the front quarter (`w/KILT.png`, `n/CL2.png`).
  - **girl_small's face:** a lumpy, mottled mouth area, reddened lids and a worried brow, neutral and smiling (`f/Z.png`).
- **Unchanged and good:** the walks through a full Cowcaddens outer train finished 6 of 6 with no hold-up (min 0.40 m, `c/wk.log`). There were no far models within 6 m and no duplicates (Kelvinhall outer explore and Shields Road inner ride, `g/kho.log`, `g/sr.log`). Platform garment mix: 0 of 56 samples over half (`g/*.json`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review30/`. I deleted the walking recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.5 | **7.64** |
| 2 | Arms and hands | 10 | 8.5 | 6.75 | **7.80** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.1 | **8.00** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.3 | 6.8 | **7.70** |
| 7 | Luggage | 10 | 8.8 | 7.1 | **8.12** |
| 8 | Whole bodies | 15 | 8.5 | 7.1 | **7.94** |
| | **Weighted mean** | 100 | | | **7.84** (7.840) |

0.20x7.64 + 0.10x7.80 + 0.10x7.68 + 0.10x8.00 + 0.10x8.06 + 0.15x7.70 + 0.10x8.12 + 0.15x7.94 = 1.528 + 0.780 + 0.768 + 0.800 + 0.806 + 1.155 + 0.812 + 1.191 = 7.840.

Changes against review 29 (7.882). None of these comes from a change in the code; each comes from what this sample showed.
- **Walking -0.04.** Stop slide was worse in this sample: 18 of 30 pauses slid over 10 cm, with 0.41 m at 3.3 m and 0.24 m at 1.8 m from the camera. Toggles reached 46 a minute.
- **Behaviour -0.04.** The placement fix works, but boarders recreate the knee-zone contact in 4 of 13 rides. This sample also showed an 80 s body overlap and a 1.32 m snap.
- **Clothing -0.10.** Two garment faults not reported before: woman_midi's hem fragments and man_kilt_casual's knee through the kilt.
- **Whole bodies -0.10.** The kilt knee, the 0.20 m body overlap in a car, and the caps as before.
- **Arms, Faces, Range, Luggage: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | On a busy train a standing rider keeps 0.5 m along the car from a seated rider on their own side, so standers no longer stand between seated knees | **True for riders placed when the train is populated; false as a description of play.**<br>- Code: line 190 now applies the seated check when busy (0.5 m). It covers only the unsupported standers placed by `_populateSaloon`.<br>- 80 refills (12 busy): 0 stander legs within 6 cm of seated legs; 0 stander hands within 8 cm of anyone. Seated-to-seated hands at 6.6-7.1 cm in 3 trips.<br>- In 13 rides of 200 s: knee-zone contact or a seated hand on a stander in 4 rides (Govan, Kinning Park, Cowcaddens, Partick), 80-185 s each. A boarder is involved every time (marked `*` in the logs).<br>- The boarder paths do not check seated riders: the fallback stand spot (line ~338) and the pole spot (`_standOk`) ignore seats claimed by boarders still on their way. | `e/bz_inner.log`, `e/bz_outer.log`, `e/n4_*.log`, `e/KN.png`, `e/inner_govan_k_adult_tie_suit-ya_spiky.png` |
| 2 | Not changed: brisk crouch, stop slide, toggling, turned-away boarders at the edge, standers hip to hip, grips to ~9 cm, who sits, near-model cap hair, girl_school_kilt's sleeves, painted tees, faces, phone-hand bag, far leftovers, one-frame jumps | **True (nothing changed).**<br>- Instrument identical to review 29 (`diff` empty below the header).<br>- Stop slide: 18 of 30 over 10 cm; max 0.41 m (adult_piper, 3.3 m from the camera); toggles to 46 a minute (adult_harem).<br>- Turned-away boarders at the edge: 11 of 46. Six of those were turned away in the last 16 s of a run and may still have been on their way. The other five stood 46-213 s within 1 m of the edge (nearest 5.6 m from the camera).<br>- Stander hip to hip / hand on thigh: 5 of 13 rides.<br>- Steady grips to 9.6 cm (woman_bob).<br>- Cap hair, sleeves, hems and the tote lifted by the phone hand: as before. | `m/items.log`, `pz/p_seo.log`, `v/aw3_*.log`, `e/n4_*.log`, `c/g2_*.log`, `c/GRIP.png`, `n/HAT.png`, `n/CL.png`, `l/woman_bob.png` |

## 2. Status of REVIEW_29's top ten

| # | REVIEW_29 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). At 1.7 m/s, sum_loose_shorts_w walks on bent knees and adult_suit_bun pitches forward. | `m/items.log`, `w/WB.png` |
| 2 | Turned-away boarders at the edge | Not fixed: 11 of 46 (5 of 40 if the last-16 s cases are left out). teen_crop_leggings stood 213 s within 1 m of the edge at Buchanan Street inner. | `v/aw3_*.log` |
| 3 | Foot slide while stopping, toggles | Not fixed, and worse in this sample: 18 of 30 over 10 cm; 0.41 m at 3.3 m; 0.24 m at 1.8 m (adult_cap_baggy); 46 a minute. | `pz/p_seo.log` |
| 4 | Standers against seated riders and each other | **Fixed for riders placed when the train is populated** (0 in 80 refills). **Not fixed in play**: boarders in 4 of 13 rides, 80-185 s each. Hip to hip in 5 of 13; one 0.20 m overlap for 80 s. | `e/bz_*.log`, `e/n4_*.log`, `e/KN.png`, `e/KN2.png` |
| 5 | Who sits | Not fixed (18 of 99 refused by `_canSit`). | code; `chars.json` |
| 6 | Visible snaps | Not fixed: man_trews 1.32 m at 8.2 m (Govan inner, an alighter stalled in the doorway). | `v/go.log` |
| 7 | Grips to 9.3 cm | Not fixed: woman_bob 9.6 cm, adult_lusekofta 9.2 cm, man_beard 8.6 cm in steady holds. The open hand sits beside the pole. | `c/g2_bs.log`, `c/g2_ib.log`, `c/GRIP.png` |
| 8 | Hair through caps (near model) | Not fixed: adult_sport_cap (black on white, both temples) and adult_cap_shorts (brown on green). adult_camo_cap and boy_cap are clean. | `n/HAT.png` |
| 9 | girl_school_kilt's sleeves; stepped hems | Not fixed (the background shows between the sleeve strips; notched hems on teen_runner and ya_spiky). | `n/CL.png` |
| 10 | Faces and small items | Not fixed. 16 new faces this round (below); the tote is still lifted by the phone hand; the far-model leftovers are as before. | `f/F.png`, `f/Z.png`, `l/woman_bob.png`, `n/FAR.png` |

## 3. Per-category reasoning

### 3.1 Walking: 7.64 (typical 8.4, worst 6.5)
- The instrument is identical to review 29.
- Brisk stills at 1.7 m/s, side, six phases (`w/WB.png`):
  - adult_suit_bun pitches forward from the hips.
  - sum_loose_shorts_w strides on bent knees with a forward lean: the crouch.
  - man_kilt_casual and woman_scarf are fine; elder_woman_coat takes short steps, which is plausible.
- Stop slide is worse in this sample: 0.41 m at 3.3 m, and 0.24 m at 1.8 m from the camera. Toggles reach 46 a minute.

### 3.2 Arms and hands: 7.80 (typical 8.5, worst 6.75)
- Seated hands on standers' legs: teen_ginger 185 s, adult_tophat 100 s.
- Standers' hands on neighbours' thighs in 5 of 13 rides (ya_ginger_long / sum_crop_denim 2 cm; girl_leggings / ya_smile_polo 1.2 cm; teen_tee / teen_crop_leggings).
- Steady grips open to 9.6 cm.
- In `phone_call` the hand is flat beside the phone rather than round it (adult_sport_cap, adult_cap_shorts, `n/HAT.png`).
- The tote rides up the forearm with the phone hand (`l/woman_bob.png`).

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
16 faces not looked at in reviews 25-29, neutral and smiling (`f/F.png`, ids in `f/ids.txt`). They differ, and they read as their age and sex across a wide range of skin tones. Faults:
- girl_small: a lumpy, mottled mouth area, reddened lids and a worried brow (`f/Z.png`).
- teen_hood: a flat, wide face; the neutral mouth droops.
- boy_shorts: the smile stretches the mouth into a wide, thin shape.
- Hairlines are ragged (sum_shorts_asian_m, man_kilt_casual, sum_loose_shorts_w, teen_hood), and lashes are dotted.

### 3.4 Standing, sitting, behaviour: 8.00 (typical 8.6, worst 7.1)
Good:
- Placed standers are clean on busy trains.
- The walk through the train finished 6 of 6.
- No far models within 6 m and no duplicates.
- Seated people sit in the seat (`n/SIT0.png`, `n/SIT1.png`, `e/EYE.png`).

Worst tenth:
- Boarders in seated riders' knee zones for 80-185 s (4 of 13 rides).
- A 0.20 m body overlap for 80 s.
- A 1.32 m snap at 8.2 m.
- Turned-away boarders standing within 1 m of the edge for up to 213 s.
- Skirts, kilts and coats still never sit.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- Children still ride and stand alone: girl_small with a backpack at a car end, girl_school_kilt at a pole (`e/EYE.png`).

### 3.6 Clothing: 7.70 (typical 8.3, worst 6.8)
Mix:
- Platforms: 0 of 56 samples over half.
- Cars (5 groups): Bridge Street inner 9 of 24 car samples over half (3 of 5 in trousers); Partick outer 8 of 39 (5 of 9 in trousers); Ibrox inner 0 of 20 (`c/g2_*.log`).

Seated, as the game seats them: 10 people the game seats that review 29 did not shoot seated, in 4 sit clips, front and side. All clean (`n/SIT0.png`, `n/SIT1.png`).

Faults:
- woman_midi's jumper hem breaks into red fragments over the skirt's waistband (new to the list).
- man_kilt_casual's knee comes through the kilt as he walks (new to the list).
- girl_school_kilt's strip sleeves.
- Notched painted hems (teen_runner, ya_spiky).
- No seated skirt, dress or kilt, ever.

### 3.7 Luggage: 8.12 (typical 8.8, worst 7.1)
- Ten kinds on woman_bob, standing, walking and seated (`l/woman_bob.png`). adult_string_vest's stills are in `l/adult_string_vest.png`, but I did not inspect them (section 5).
- Rucksacks sit on the back; bags hang from the hand; trolleys stand upright and are towed.
- In play, a boarder's shopper ends up in a seated rider's lap (adult_tie_suit / ya_spiky).
- Unchanged: the tote is lifted by the phone hand; holdall, briefcase and trolley owners never sit.

### 3.8 Whole bodies: 7.94 (typical 8.5, worst 7.1)
- Near model: hair through adult_sport_cap's and adult_cap_shorts' caps; man_kilt_casual's knee through the kilt and the gap at his hip; girl_school_kilt's sleeves; woman_midi's hem.
- In play: elder_woman_dress and elder_man_cap overlapping for 80 s.
- Far model: 8 more people at about 3.6 m with forcelod=1 (`n/FAR.png`). Readable, with no new holes. It never came within 6 m in play.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots @1.9 = 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Boarders end up in seated knee zones.** Seated hands rest on their legs for 80-185 s, in 4 of 13 rides.
   - Fix:
     - Give the boarder fallback stand spot (`index.js` ~338) the same seated check as `_populateSaloon`.
     - In `_standOk`, also treat seats with `seat.p` set (boarders on their way) as occupied.
     - When a boarder chooses a seat, reject it if a stander is within 0.5 m along the car on that side.
   - Reproduce: `node gnb4.mjs "mode=ride&q=high&line=inner&station=kinning-park" 200 e/x` (also `govan`, `cowcaddens`, `partick` inner).
3. **Foot slide while stopping, stop-start toggling.** 18 of 30 pauses slide over 10 cm; 0.41 m at 3.3 m; 46 toggles a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=st-enoch" 200`.
4. **Standers touching each other.** Hip to hip with a hand on the neighbour's thigh in 5 of 13 rides. elder_woman_dress and elder_man_cap overlap at 0.20 m for 80 s (Cowcaddens inner).
   - Fix: when a train stops, enforce at least 0.5 m between standers, boarders included.
   - Reproduce: `node gnb4.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 200 e/x` (the `P` lines).
5. **Turned-away boarders end at the edge.** 11 of 46; five stood 46-213 s within 1 m of the edge.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 300 > x.log; python3 aw2.py x.log`.
6. **Who sits.** Skirts, dresses, kilts, long coats, suits and luggage owners never sit.
7. **Garments:**
   - woman_midi's red hem fragments (new);
   - man_kilt_casual's knee through the kilt in a walk (new);
   - girl_school_kilt's strip sleeves;
   - notched hems on teen_runner and ya_spiky.
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 woman_midi,man_kilt_casual,girl_school_kilt none stand n/x waist`; `node shoot2.mjs 0 man_kilt_casual none walk@174 n/x legs 1.7`.
8. **Visible snaps.** man_trews 1.32 m at 8.2 m: an alighter stalled in the doorway, then `setBays` moved him when the doors closed (Govan inner).
   - Reproduce: `node gvan13.mjs "mode=ride&q=high&line=inner&station=govan" 300 | grep TELE`.
9. **Grips open to 9.6 cm** in a steady hold. The open hand sits beside the pole (woman_bob, Bridge Street inner).
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=bridge-street" c/x 150`.
10. **Hair through caps on the near model** (adult_sport_cap, adult_cap_shorts). Faces: girl_small's mouth and lids, teen_hood, boy_shorts' smile, ragged hairlines. The tote is lifted by the phone hand. The phone hand is flat beside the phone in `phone_call`.
    - Reproduce: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",2.4,0.1]]' node shoot2.mjs 0 adult_sport_cap,adult_cap_shorts none stand n/x face`; `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.

## 5. What I could not observe

- **No motion watched.** Slides, toggles, snaps and contacts come from per-tick positions and bone distances.
- **Whether every knee-zone stander was a boarder.** The `*` marker was added after the Govan run, so adult_tie_suit is unmarked. He first appears at t = 40 s, after the Govan stop, and 80 refills placed no such stander, so I believe he boarded, but I did not prove it.
- **Whether the six turned-away boarders caught in the last 16 s would have walked on.** I counted them in 11 of 46, as review 29's script did, but they may still have been on their way.
- **Whether the handover removals in the Hillhead outer ride were visible.** woman_coat was removed at 7 m and elder_woman_coat at 11.9 m, both boarders reaching the car. I assume a handover to the train's crowd and did not count them.
- **The phone in seated stills.** The viewer's `sit_phone` stills show no phone in hand. In play, phones are shown (`e/EYE.png`).
- **adult_string_vest's dog-like object on a red lead** appears in the viewer even with no bag. I did not look into what it is, or how it behaves in play.
- **Blink and smile timing** in play.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, side, 1.7 m/s, 6 phases | adult_suit_bun, sum_loose_shorts_w, man_kilt_casual, woman_scarf, elder_woman_coat | `w/WB.png`, `w/KILT.png` |
| Faces, neutral and smiling | 16 not seen in reviews 25-29 | `f/F.png`, `f/Z.png` |
| Hats, near model, 3 views | adult_sport_cap, adult_cap_shorts, adult_camo_cap, boy_cap | `n/HAT.png` |
| Garments, chest and waist | girl_school_kilt, teen_runner, ya_spiky, adult_string_vest, man_kilt_casual, woman_midi | `n/CL.png`, `n/CL2.png` |
| Far model, front and back | woman_midi, man_kilt_casual, girl_small, teen_hood, adult_string_vest, boy_shorts, woman_scarf, sum_shorts_asian_m | `n/FAR.png` |
| Seated, people the game seats, 4 sit clips, front and side | 10 (adult_baggy_knit, adult_string_vest, sum_shorts_asian_m, sum_loose_shorts_w, teen_crop_leggings, woman_bob, teen_skater, boy_shorts, girl, sum_denim_shorts_m) | `n/SIT0.png`, `n/SIT1.png` |
| Luggage, 10 kinds x stand / walk / sit | woman_bob (adult_string_vest rendered, not inspected) | `l/woman_bob.png`, `l/adult_string_vest.png` |
| Placed standers vs seated, 80 refills (12 busy) | Hillhead inner, Ibrox outer | `e/bz_inner.log`, `e/bz_outer.log` |
| Knee zone, hands, hip pairs, 200 s rides | Hillhead, Govan, Kinning Park, Cowcaddens, Partick, Buchanan Street, Kelvinhall inner; Kelvinbridge, Shields Road, St George's Cross, Ibrox, West Street, Cessnock outer | `e/n4_*.log`, `e/*.png`, `e/KN.png`, `e/KN2.png` |
| Turned-away boarders (300 s each) | Hillhead inner, Ibrox outer, Buchanan Street outer and inner, St Enoch inner, Partick outer | `v/aw3_*.log` |
| Paused walkers | St Enoch outer, 200 s | `pz/p_seo.log` |
| Vanishings, snaps, overlaps | Govan inner and Hillhead outer rides, 300 s each | `v/go.log`, `v/hho.log` |
| Car garment mix and grips | Partick outer, Ibrox inner, Bridge Street inner (150 s each) | `c/g2_*.log`, `c/GRIP.png` |
| Eye height in a car | Cowcaddens inner, 4 standers x 3 views | `e/EYE.png`, `e/eye.log` |
| Walk through a full train | Cowcaddens outer, 6 walks | `c/wk.log` |
| Platform/ride census, far within 6 m, duplicates | Kelvinhall outer explore, Shields Road inner ride, 200 s each | `g/kho.log`, `g/sr.log` |

Next round, look at:
- where boarders stand relative to seats claimed by other boarders;
- stander spacing after a station stop;
- woman_midi's and man_kilt_casual's garments in play;
- adult_string_vest's dog.

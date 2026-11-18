# Under Glasgow: independent review of the people (review 28)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `392d8f9e`. The only change since review 27 (`5456b67e`) is that commit. I read its diff (read-only):
- `tools/people_lodhair.py:58`: the far model's hair recipe is now `None` (everybody), not `RECIPE_HAIR + HATTED`. `people_lod.glb` was rebuilt (18.0 -> 19.9 MB).
- `js/sim/people.js:915`: a walk now ends on a blocked frame only if `!p.standingBack`; otherwise it ends when `stuckT > 1.6`.
- `js/sim/people.js:1201` (`standBack`): sets `q.standingBack = true`.

`people.glb` (the near model) and the walk code did not change. Nothing in the repository was edited, and git was only read. Every game script yields to the page between ticks and updates world matrices each tick.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.90 (7.900). Gate NOT met.** Three categories are at 8 or above: Behaviour 8.22, Luggage 8.12 and Whole bodies 8.08. Range is 8.06. Four are below 8: Walking 7.68, Faces 7.68, Arms 7.74 and Clothing 7.80.

In short:
- **Claim 1 (full hair on every far head) holds.**
  - In `people_lod.glb` every one of the 99 meshes has a hair primitive with exactly the near model's vertex count. The far bodies are about 51% of the near vertex count (median).
  - I shot all 99 far heads from front, quarter and back (`n/FH_00.png` to `n/FH_08.png`). There is no shard hair and no skin showing between strands on any of them. The six heads review 27 named (man_hoodie, boy_shorts, ya_shorts, teen_crop_leggings, ya_tattoo_tank, teen_runner) are whole.
  - I found no full-detail hair coming through a far-model coat, hood or collar (`n/FB.png`, 16 long-haired, coated and hooded people).
  - Still wrong on the far model:
    - adult_vneck's camisole straps are still black wedges (`n/FB.png`).
    - Some far faces are badly decimated: boy_shorts' face is skewed and flat; elder_shorts and ya_spiky have salmon-coloured wedges under the eyes (`n/z1.png`, `n/FH_02.png`, `n/FH_07.png`).
    - adult_cap_baggy has a pale sliver at the back of the neck (`n/FH_00.png`).
  - In play, the nearest far model I found was 11.0 m away (Hillhead) and 12.1 m (Buchanan Street) (`g/far_*.log`). That is 0 within 6 m in a 200 s St Enoch census (`g/se.log`). At those distances these faults are a few pixels, so I weight them low.
- **Claim 2 (a turned-away boarder keeps trying for up to 1.6 s) holds as code. It helps, but only partly.**
  - I logged 54 turn-aways in six explore runs. 7 of them (13%) ended within 1 m of the edge; review 27 had 8 of 37 (22%).
  - All 7 gave up 2.4 to 2.9 s after being sent, which is the 1.6 s timeout running out, not one blocked frame. Buchanan Street outer is still bad: 4 of 12, 0.33 to 0.79 m from the edge. sum_loose_shorts_w ended 0.43 m *nearer* the edge than she started. teen_crop_leggings stood 0.56 m from the edge for 218 s again at Buchanan Street inner (`v/aw3_*.log`, `aw2.py`).
  - **New bug: the flag is never cleared on arrival.** `standingBack` is reset only on the give-up branch (line 915), not on the arrival branch (line 908). So everyone who arrives keeps the flag. Over 600 s I counted 6 to 9 such people flagged while standing (1314 and 1867 person-seconds). 7 and 13 of their later ordinary wander walks also ignored a blocked frame, standing blocked in the walk for up to 1.5 s with paused/unpaused toggles (`v/sticky_bu.log`, `v/sticky_se.log`). It is small in effect, but it is a latent fault.
- **Claim 3 (not changed) holds.**
  - The walking instrument over the whole roster is identical to review 27, line for line (`diff` of `m/items.log` is empty). Overall 9.47; LEG 7.8 with p10 5.9; SMO p10 7.1; the worst recording is adult_heel_boots at 1.9 m/s, 7.7.
  - adult_heel_boots at 1.7 m/s is still crouched and pitched forward (`w/WB.png`).
  - Foot slide while stopping, Buchanan Street inner, 200 s: 12 of the 30 longest pauses slide over 10 cm. The largest is teen_shorts_lad, 0.42 m, at 1.9 m from the camera. This run had 63 paused episodes (review 27: 34) and toggling up to 38 a minute (woman_midi, girl) (`pz/p_bu.log`).
  - Strip sleeves (girl_school_kilt), stepped painted hems (teen_runner, ya_spiky), adult_cap_shorts' hair through the cap at the temple, woman_puffer's fringe over the eye: all as before (`n/CL.png`).
  - Faces: 16 new faces show the same faults (`f/F.png`).
  - Seated hands on a neighbour: still there in 2 of 3 rides (`e/nbg_*.png`, `e/nbc_*.png`).
  - Nobody in a skirt, dress or kilt sits; standers in idle poses ride unsupported while seats are free (`e/WS.png`).
- **New:**
  - **Pole and rail grips open up.** West Street outer ride: 6 of 48 grip samples are over 4 cm, up to 9.4 cm (teen_tube, pole, departing) and 8.3 cm (elder_woman_dress, rail). Partick inner: girl_small 6.3 cm at departure (`c/car_ws.log`, `c/car_pa.log`). Review 27 had none over 4 cm.
  - **Visible jump.** teen_cutoffs jumped 0.86 m in one setBays snap at 12.8 m (Kelvinhall inner ride, `v/kh.log`).
- **Better this round:** the walk through a full Hillhead outer train finished 6 of 6 with no hold-up (longest still 0.1 s, nearest pass 0.40 m; `c/wk.log`). Review 27 had a 40 s hold-up.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review28/`. I deleted the walking recording (about 470 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.5 | 6.6 | **7.74** |
| 3 | Faces | 10 | 8.2 | 6.9 | **7.68** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.5 | **8.22** |
| 5 | Range of people | 10 | 8.5 | 7.4 | **8.06** |
| 6 | Clothing | 15 | 8.4 | 6.9 | **7.80** |
| 7 | Luggage | 10 | 8.8 | 7.1 | **8.12** |
| 8 | Whole bodies | 15 | 8.6 | 7.3 | **8.08** |
| | **Weighted mean** | 100 | | | **7.90** (7.900) |

0.20x7.68 + 0.10x7.74 + 0.10x7.68 + 0.10x8.22 + 0.10x8.06 + 0.15x7.80 + 0.10x8.12 + 0.15x8.08 = 1.536 + 0.774 + 0.768 + 0.822 + 0.806 + 1.170 + 0.812 + 1.212 = 7.900.

Changes against review 27 (7.863):
- **Whole bodies +0.26.** Far shard hair is gone from the whole roster, which was the largest worst-tenth fault in this category. What is left in the worst tenth is on the near model, seen at 1-2 m: girl_school_kilt's strip sleeves and adult_cap_shorts' hair through the cap. Far faces and adult_vneck's far straps count little at 11 m or more.
- **Behaviour +0.04.** Turned-away boarders at the edge fell from 22% to 13%, and the player was not held up. Against that: the sticky `standingBack` flag, more pauses and toggles in this Buchanan Street run, and the skirted, kilted and suited riders standing unsupported while seats are free.
- **Arms -0.06.** Grips open up to 9.4 cm from the pole on one ride. Hands on a neighbour's knee are unchanged.
- **Walking, Faces, Range, Clothing, Luggage: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Every far model carries its full-detail hair; no shard hair anywhere on the far model; people_lod.glb 18.0 -> 19.9 MB | **True.**<br>- The GLB is 19,938,832 bytes.<br>- All 99 meshes have far hair with the same vertex count as the near hair.<br>- From front, quarter and back, all 99 far heads are whole.<br>- The far bodies are untouched: adult_vneck's straps, the decimated faces (boy_shorts; elder_shorts and ya_spiky eye wedges) and adult_cap_baggy's neck sliver remain. | `n/FH_0*.png`, `n/FB.png`, `n/z1.png`, `n/far.log` |
| 2 | A turned-away boarder walking back keeps trying for up to 1.6 s when blocked | **True as code. Better, not fixed, as outcome.**<br>- 7 of 54 turn-aways ended within 1 m of the edge (review 27: 8 of 37). The worst run was Buchanan Street outer, 4 of 12.<br>- Each of the 7 ended 2.4 to 2.9 s after being sent: blocked for the whole 1.6 s.<br>- Side effect: `standingBack` is never cleared when the person arrives (`people.js:908` resets nothing), so later wander walks also ignore a blocked frame. That was 7 walks in 600 s at Buchanan Street inner and 13 at St Enoch inner; stuck up to 1.5 s, toggling paused/unpaused. | `v/aw3_bu.log`, `v/aw3_buo.log`, `v/aw3_se.log`, `v/aw3_pa.log`, `v/aw3_kb.log`, `v/aw3_go.log`, `v/sticky_*.log` |
| 3 | Not changed: brisk crouch, stop slide, stop-start toggling, hand on a neighbour's knee, girl_school_kilt's sleeves, nobody in a skirt/dress/kilt or with a briefcase/holdall/trolley sits, painted tops, faces, bag rising with the phone hand, adult_vneck's far straps, woman_puffer's slab, adult_cap_shorts' temple hair | **True (nothing changed).**<br>- The instrument is identical to review 27.<br>- Stop slide: 12 of 30 over 10 cm, max 0.42 m at 1.9 m from the camera. Toggling up to 38 a minute.<br>- Hands on a neighbour in 2 of 3 rides.<br>- The garments, hair and faces are as before. | `m/items.log`, `w/WB.png`, `pz/p_bu.log`, `e/nb*`, `n/CL.png`, `f/F.png` |

## 2. Status of REVIEW_27's top ten

| # | REVIEW_27 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch, pelvis jolts | Not fixed (identical). | `m/items.log`, `w/WB.png` |
| 2 | Foot slide while stopping, toggles | Not fixed. 12 of 30 over 10 cm, max 0.42 m (teen_shorts_lad, 1.9 m away); toggles up to 38 a minute. | `pz/p_bu.log` |
| 3 | Far shard hair on six more heads | **Fixed**, roster-wide. | `n/FH_*.png` |
| 4 | Turned-away boarders abort and wait at the edge | **Improved:** 13% against 22%. Still 4 of 12 at Buchanan Street outer. The new flag leaks into later walks. | `v/aw3_*.log`, `v/sticky_*.log` |
| 5 | Seated hands on the neighbour's knee | Not fixed:<br>- teen_hood on adult_tattoo_muscle (Govan inner, 11.9 cm);<br>- adult_vneck on ya_smile_polo (Cowcaddens inner, 11.7 cm);<br>- none at St George's Cross. | `e/nbg_*.png`, `e/nbc_*.png`, `e/nb_*.log` |
| 6 | girl_school_kilt's strip sleeves | Not fixed. She stands alone at a pole in the Partick and West Street rides. | `n/CL.png`, `e/WS.png` |
| 7 | Who sits (stand-list of 18; briefcase/holdall/trolley) | Not fixed. At West Street, man_highland, woman_coat, adult_tie_suit and man_longcoat stand unsupported in idle_a in the running train, with seats free. | `e/WS.png`, `e/ws.log`, `c/car_ws.json` |
| 8 | Painted-on tees with stepped hems | Not fixed. | `n/CL.png` |
| 9 | Faces | Not fixed:<br>- ya_ginger_braid's and ya_ginger_long's neutral mouths are already a crooked smirk;<br>- smiles are small and closed;<br>- lashes are dotted (teen_skirt, teen_cutoffs). | `f/F.png` |
| 10 | Small items | Bag lifted by the phone hand, adult_vneck's far straps, woman_puffer's fringe and adult_cap_shorts' temple hair: not fixed. The player hold-up at a car end: **not seen** this round (6 of 6 walks, no stall). | `n/CL.png`, `n/FB.png`, `c/wk.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is identical: LEG 7.8, p10 5.9; SMO p10 7.1.
- ya_tee_jeans at 1.7 m/s strides cleanly. adult_heel_boots is crouched and leaning forward in all five phases (`w/WB.png`).
- The stopping foot slides 0.42 m within 2 m of the camera.

### 3.2 Arms and hands: 7.74 (typical 8.5, worst 6.6)
- Grips:
  - Partick inner pole grips: median 2.1 cm, but girl_small reached 6.3 cm at departure.
  - West Street outer: median 2.3 cm pole and 1.5 cm rail, but 6 of 48 over 4 cm (teen_tube 9.4 cm, elder_woman_dress 8.3 cm, woman_coat 6.9 cm, girl_school_kilt 6.5 cm).
- Seated hands rest on a neighbour's knee or thigh in 2 of 3 rides.
- Bag handles are held (`l/A.png`).
- In the viewer, the sit_phone clip at 40% shows both palms up with fingers spread and no phone (`n/SIT0.png`). In the game this is presumably where the phone sits, so I did not count it.

### 3.3 Faces: 7.68 (typical 8.2, worst 6.9)
- 16 new faces (seed 28, `f/ids.txt`), neutral and smiling (`f/F.png`). They differ and read as their age and sex.
- Smiles are small and closed. The ginger pair's neutral mouths are lopsided.
- man_hoodie's lips look pursed. Lashes are dotted.

### 3.4 Standing, sitting, behaviour: 8.22 (typical 8.7, worst 7.5)
Good:
- Kelvinhall inner ride, 300 s: 0 visible platform vanishings and 22 releases, none within 6 m (`v/kh.log`).
- St Enoch inner platform, 200 s: 0 far models within 6 m, 0 overlaps, 0 duplicates (`g/se.log`).
- I found no person in a standing state whose root moved more than 0.1 m, in 400 s at Buchanan Street inner (`v/glide_bu.log`).
- Train walk-through 6 of 6 with no hold-up.
- Seated riders sit in their seats (`n/SIT*.png`, `e/WS.png`).

Worst tenth:
- 7 of 54 turned-away boarders at the edge, one for 218 s.
- The leaking `standingBack` flag.
- Paused episodes and toggles up to 38 a minute.
- Every skirt, kilt, long coat and suit stands, often unsupported, while seats are free; girl_small and girl_school_kilt hold poles alone.
- One 0.86 m visible jump (setBays snap) at 12.8 m.

### 3.5 Range of people: 8.06 (typical 8.5, worst 7.4)
- The roster is unchanged (99).
- Children still travel and stand alone.

### 3.6 Clothing: 7.80 (typical 8.4, worst 6.9)
Mix:
- West Street outer ride, 48 car samples: none over half in either grouping (`c/car_ws.log`).
- Partick inner, 15 samples: 1 over half (`c/car_pa.log`).
- St Enoch inner platform, 29 samples: 1 over half, 57% trousers (`g/se.json` via `cen3.py`).

Seated garments, as the game seats them (`_canSit` true):
- In the viewer: 10 new people, 4 sit clips each, front and side (`n/SIT0.png`, `n/SIT1.png`): adult_tie_suit, ya_tattoo_tank, man_trews, ya_ginger_long, man_beard, girl_ginger, boy, adult_smile_blouse, teen_crop_leggings and sum_denim_shorts_m. All clean.
- In play: seated riders at Govan inner, Cowcaddens inner and West Street outer (`e/nb*.png`, `e/WS.png`). All are in trousers, jeans, shorts or leggings.

Faults:
- girl_school_kilt's strip sleeves.
- teen_runner's and ya_spiky's stepped hems.
- Seated, nobody ever shows a skirt, dress or kilt.

### 3.7 Luggage: 8.12 (typical 8.8, worst 7.1)
- Ten kinds on adult_oxford_shirt and woman_bob, standing and walking (`l/A.png`).
- Rucksacks sit on the back; bags hang from the hand; both trolleys stand upright and are towed on their wheels.
- Unchanged: a bag rises with the phone hand, and holdall, briefcase and trolley owners never sit.

### 3.8 Whole bodies: 8.08 (typical 8.6, worst 7.3)
Far model (`forcelod=1`, shot at about 1 m):
- The hair is whole on all 99.
- Faults left: adult_vneck's strap wedges, boy_shorts' skewed face, salmon eye wedges (elder_shorts, ya_spiky), adult_cap_baggy's neck sliver.
- In play the far model starts at 11-12 m, where these faults are a few pixels (`g/FARHH.png`, `g/FARBU.png`: whole heads at 11-19 m).

Near model:
- girl_school_kilt's sleeves (seen in cars at 1-2 m).
- adult_cap_shorts' hair showing through the cap side.
- woman_puffer's fringe over one eye (`n/CL.png`).

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG 7.8, p10 5.9; SMO p10 7.1; adult_heel_boots at 1.9 m/s, 7.7). Still the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
   - Stills: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots none walk@100,walk@108,walk@116,walk@124,walk@132 w/b body 1.7`.
2. **Foot slide while stopping, and stop-start toggling.** 12 of 30 pauses over 10 cm, max 0.42 m (teen_shorts_lad, 1.9 m from the camera); toggles up to 38 a minute.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=inner&station=buchanan-street" 200`.
3. **Turned-away boarders still end at the edge** (7 of 54; Buchanan Street outer 4 of 12, 0.33-0.79 m), each after the full 1.6 s blocked. **And** `standingBack` is not cleared on arrival (`people.js:908`), so it leaks into later wander walks.
   - Fix: clear the flag in both exits. On a timeout near the edge, retry with another spot rather than settle.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 300 | python3 aw2.py`; and `node gsticky.mjs "mode=explore&q=high&line=inner&station=st-enoch" 600`.
4. **Seated hands on the neighbour's knee:** teen_hood on adult_tattoo_muscle (Govan inner), adult_vneck on ya_smile_polo (Cowcaddens inner).
   - Reproduce: `TH=0.12 node gnb.mjs "mode=ride&q=high&line=inner&station=govan" 150 e/nbg`.
5. **Who sits.** Skirts, dresses, kilts, long coats and suits (and luggage owners) never sit, so they ride standing, often unsupported in idle_a, beside free seats (West Street: man_highland, woman_coat, adult_tie_suit, man_longcoat).
   - Reproduce: `node geye2.mjs "mode=ride&q=high&line=outer&station=west-street" e/ws 50 8`.
6. **Grips open up to 9.4 cm from the pole or rail** around departure (teen_tube, elder_woman_dress, woman_coat, girl_school_kilt, girl_small).
   - Reproduce: `node gcar.mjs "mode=ride&q=high&line=outer&station=west-street" c/car_ws 150`.
7. **girl_school_kilt's jumper sleeves in strips.**
   - Reproduce: `ANGS='[["F",3.14,0.1],["Q",2.4,0.1]]' node shoot2.mjs 0 girl_school_kilt none stand n/x chest`.
8. **Painted-on tees with stepped hems** (teen_runner, ya_spiky). Same command, ids `teen_runner,ya_spiky`.
9. **Faces:** small closed smiles; crooked neutral mouths (ya_ginger_braid, ya_ginger_long); dotted lashes.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/x "0:0" 1 8611 "" 14`.
10. **Small items:**
    - adult_cap_shorts' hair through the cap;
    - woman_puffer's fringe over the eye;
    - a bag lifted by the phone hand;
    - far-model leftovers (adult_vneck's straps, boy_shorts' face, salmon eye wedges on elder_shorts and ya_spiky, adult_cap_baggy's neck sliver);
    - teen_cutoffs' 0.86 m snap at Kelvinhall (`v/kh.log`, setBays-snap).
    - Reproduce the far heads: `FD=1.0 ANGS='[["F",3.14,0.05],["Q",3.9,0.1],["B",0,0.15]]' node shoot2.mjs 1 <ids> none stand n/x face`.

## 5. What I could not observe

- **No motion watched.** Slides, toggles and stalls come from per-tick positions.
- **The `slide` field in `gaway3.mjs`** reached 20.7 m for one person. I believe it counts idle weight-shift foot motion and not gliding: a direct root-travel check (`gstglide.mjs`) found no standing person moving more than 0.1 m. I did not use the field.
- **What ya_smile_polo's raised, open hand was doing** at Cowcaddens (no phone was visible); the clip name was not logged.
- **`geye.mjs` at Cessnock outer found no holders** at 120 s (`e/ce.log`), so the eye-height car views come from West Street only.
- **Blink and smile timing** in play.
- **Far heads at the true screen size:** I judged them from magnified game-camera shots at 11-31 m, not at native pixels.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Brisk stills, side, 1.7 m/s, 5 phases | adult_heel_boots, ya_tee_jeans | `w/WB.png` |
| Far hair, GLB check | all 99 meshes, near vs far hair vertex counts | (inline Python, section 1) |
| Far heads, 3 views | all 99 | `n/FH_00.png` to `n/FH_08.png`, `n/z1.png` |
| Far bodies, chest, front and back | 16 long-haired, coated, hooded | `n/FB.png` |
| Far models in the game camera | Buchanan Street outer (24 far, nearest 12.1 m), Hillhead inner (9 far, nearest 11.0 m) | `g/far_*.log`, `g/FARBU.png`, `g/FARHH.png` |
| Seated, people the game seats, 4 sit clips | 10 new (`sit_ids.txt`) | `n/SIT0.png`, `n/SIT1.png` |
| Sleeves, painted tops, temple hair, fringe | girl_school_kilt, teen_runner, ya_spiky, adult_cap_shorts, woman_puffer | `n/CL.png` |
| Faces, neutral and smiling | 16 new (seed 28) | `f/F.png` |
| Luggage, 10 kinds x stand/walk | adult_oxford_shirt, woman_bob | `l/A.png` |
| Turned-away boarders | Buchanan Street inner 400 s and outer 300 s, St Enoch inner 600 s, Partick inner 300 s, Kelvinbridge outer 300 s, Govan inner 400 s | `v/aw3_*.log` |
| standingBack flag after arrival | Buchanan Street inner and St Enoch inner, 600 s each | `v/sticky_*.log` |
| Root glide in a standing state | Buchanan Street inner, 400 s | `v/glide_bu.log` |
| Paused walkers | Buchanan Street inner, 200 s | `pz/p_bu.log` |
| Vanishings, releases, jumps | Kelvinhall inner ride, 300 s | `v/kh.log` |
| Car garment mix, grips, who stands | Partick inner and West Street outer rides, 150 s each | `c/car_pa.*`, `c/car_ws.*` |
| Eye height in a car, standers and holders | West Street outer ride, 7 standers x 3 views | `e/WS.png`, `e/ws.log` |
| Hands on other riders | Govan inner, Cowcaddens inner, St George's Cross outer rides | `e/nb_*.log`, `e/nb*_*.png` |
| Walk through a full train | Hillhead outer ride, 6 walks | `c/wk.log` |
| Platform census, far within 6 m, duplicates, overlaps | St Enoch inner explore, 200 s | `g/se.log`, `g/se.json` |

Next round, look at:
- grips through departure and braking on more rides;
- the whole roster seated in play (who actually sits, not only who can);
- children with adults;
- far faces at native resolution.

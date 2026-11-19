# Under Glasgow: independent review of the people (review 35)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `74799573`. Commits since review 34 that touch the people (read-only `git diff bca1d3b1 74799573 -- glasgow-subway/js`):
- `gait.js`:
  - `opts.plantAt`: a new gait plants each foot where the person's ankle already is (within 0.5 m).
  - `f.fresh`: the first toe-off of a walk leaves from the foot's current (flat) pitch.
  - `standStep`: only the foot further from its target waits on its toes for the closing step.
- `people.js`:
  - `_clipAnkles` feeds `plantAt`.
  - `setBays`: anyone left in a doorway when the doors shut walks off it (`bayOut`, `_exitBays`) instead of being moved in one frame.
- `index.js` `_routeBoarder`:
  - A boarder whose car would go over half one garment tries up to 3 other doors within 9 m.
  - The seat search looks at 16 seats (was 8).
  - A child with no seat may stand where an adult is within 1.2 m.
  - The reasons for turning people away are counted in `_xaway`.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review35/`. I deleted the walking-instrument recording (about 540 MB) after scoring; `m/items.log` holds the result.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 7.97 (7.970). Gate NOT met.** Five categories are at 8 or above: Behaviour 8.48, Range 8.24, Luggage 8.24, Arms 8.08, Whole bodies 8.02. Below 8: Walking 7.72, Faces 7.70, Clothing 7.66.

In short:
- **Claims 1, 2 and 3 hold on the measures they were made with.**
  - Over 4 platform runs, no walk start slid more than 5 cm (review 34: 10-16 per run).
  - `hover.py` finds no start pops and no hovering feet.
- **But the first steps now have a worse fault.** As a boarder speeds up through about 0.7 m/s, a foot snaps its heel up 6-8 cm in one tick. On the next tick (1/30 s) it reappears 50-70 cm further on, while the body has moved 3 cm.
  - 13-26 times per 100 s run, 3-10 of them within 8 m on the near model (review 34's data: 0-6 per run).
  - I rendered it: man_beard, 2.0 m from the game camera. One frame shows his left foot behind him, sole up; the next shows it in front (`pop2/POP.png`).
- **Turned-away boarders are fewer:** about 6 per station per 300 s, against 19-20 in review 34. But one turned-away woman (ya_tube_heels) stood 2-9 cm from the platform edge for 200 s, 2.6 m from the camera.
- **Not changed:**
  - The heel wearers' crouch.
  - Who sits: no skirt, dress or kilt sat in any car I logged.
  - The garment faults, the faces, the hair slab, the phone hand and the tote.
- **The player's saloon was over half trousers** in 10 of 20 samples on a St Enoch outer ride (review 34: 0 of 29).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.6 | 6.4 | **7.72** |
| 2 | Arms and hands | 10 | 8.6 | 7.3 | **8.08** |
| 3 | Faces | 10 | 8.1 | 7.1 | **7.70** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.7 | **8.48** |
| 5 | Range of people | 10 | 8.6 | 7.7 | **8.24** |
| 6 | Clothing | 15 | 8.3 | 6.7 | **7.66** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.5 | 7.3 | **8.02** |
| | **Weighted mean** | 100 | | | **7.97** (7.970) |

0.20x7.72 + 0.10x8.08 + 0.10x7.70 + 0.10x8.48 + 0.10x8.24 + 0.15x7.66 + 0.10x8.24 + 0.15x8.02 = 1.544 + 0.808 + 0.770 + 0.848 + 0.824 + 1.149 + 0.824 + 1.203 = 7.970.

Changes against review 34 (7.958):
- **Walking +0.02** (typical 8.5 to 8.6, worst 6.5 to 6.4):
  - Better: start slides, start pops and hovers are gone.
  - Worse: the first-step foot jumps are 4-8 times as frequent.
  - Unchanged: the crouch. One jam toggled 38 times a minute.
- **Arms +0.08** (worst 7.1 to 7.3): no hand near another body in 6 rides; the largest open grip was 6.5 cm.
- **Faces -0.06** (typical 8.2 to 8.1): a fresh sample of 18 found more lopsided smirks and ragged hairlines. The faces have not changed; I judge the typical case a little lower.
- **Behaviour +0.02:**
  - Far fewer turned away.
  - But one boarder was left on the platform edge for 200 s, and one jam toggled 38 times a minute.
- **Range +0.10:** fewer children turned away (6 in 11 runs); every child in a car is seated except girl_small.
- **Clothing -0.04:** a saloon was over half trousers.
- **Luggage and whole bodies: no change.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Start slides 10-11 -> 0 (plantAt) | **True.**<br>- `gslide.mjs` ALL=1, 100 s, St Enoch inner x3 and Buchanan Street outer, 1/30 s ticks, then `skid.py`/`skid2.py`: 0 start skids over 5 cm in each run (review 34's files: 13 and 16).<br>- `start_an.py`: 157 starts, median contact slide 0.7-2.3 cm, p90 4 cm. Max 7.2 cm, on starts that turn 70-77 deg (sum_tube_denim at 9.8 m, adult_casual2 at 4.7 m).<br>- se1 also had 20 events that were all adult_heel_boots' ankle bone in steady walking (7 cm over two ticks at heel strike, the ball not moving). I take this as the heel rocking about a 12 cm stiletto, not a slide: the instrument puts her slip at 2.8 cm/s. | `sl/se1-3.json`, `sl/bs.json`, `skid2.py`, `start_an.py` |
| 2 | Start pops 6 -> 0; largest one-frame rise at a start 17 mm | **True for `hover.py`'s definition (v < 0.1); false for the walk start as a whole.**<br>- `hover.py`: 0 pops in 5 runs.<br>- But the heel still flips up 60-83 mm in one tick (15-24 times a run, down from 58-59) a little later in the start, at 0.6-0.8 m/s.<br>- On the next tick the foot reappears 50-70 cm ahead (see top ten, item 1). | `pop2.py`, `jump.py`, `pop2/POP.png`, `pop/POP.png` |
| 3 | No hovering feet after a stop | **True.** 0 hovers of 0.3 s or more on the platform in 5 runs. The only hits were measuring artefacts: a far-model woman_midi whose floor reference was thrown off by one frame 3.3 m off, and a far-model man_longcoat at 125 m. | `hover.py` on `sl/*.json` |
| 4 | Left in a doorway: walks off, no jump | **Not observed.** Three 200-300 s explore runs (Govan outer, Hillhead inner, St Enoch inner) each had one door closing and nobody left in a doorway (`bayOut` 0). 0 one-tick moves over 0.25 m for anyone on a platform. The code does make them walk (`_enter(q,'walk')` with the shut doorway still counted as floor). | `gbay.mjs`, `v/bay_*.log` |
| 5 | Fewer turned away; children may stand beside an adult | **True on counts.**<br>- `_xaway` per 300 s: Hillhead inner 10 (routed 13), Govan outer 9 (15), Ibrox 5 (19), Partick outer 5 (19), Cowcaddens inner 3, 1, 8, 10, St Enoch outer 8, Hillhead again 5. Mean about 6 (review 34: 19-20 at the worst stations).<br>- Children turned away ("child, no seat"): 6 over 11 runs.<br>- **But:**<br>  - At Cowcaddens inner, ya_tube_heels was turned away 4 times and stood 2-9 cm from the platform edge for 200 s, 2.6 m from the camera. Her foot drifted 39 cm while she stood. It did not recur in 3 reruns.<br>  - At Hillhead, teen_crop_leggings stuck at 0.91 m for 177 s.<br>  - girl_small stood unheld in the aisle for 90 s of a ride. The "adult within 1.2 m" was a seated stranger 0.97 m away. | `v/aw_*.log`, `v/aw4_*.log`, `aw2.py`, `k/kid2_*.log` |
| 6 | Not changed: crouch, who sits, garments, faces, hair, phone hand, tote, grips, seated hand, jam toggles | **True in code. Observed:**<br>- Crouch: `n/BW.png`.<br>- Who sits: `g/pa.json`, `g/se.json`: 0 skirts, dresses or kilts seated.<br>- Garments: `n/G1.png`, `n/G2.png`.<br>- Faces: `f/A.png`.<br>- Phone hand and tote: `h/H.png`.<br>- woman_mini's hair slab: `e/EYE.png`.<br>- Grips are better this time: max 6.5 cm, 4 of 32 over 4 cm.<br>- No seated hand near another body.<br>- Jam toggles are worse: sum_loose_shorts_w toggled 8 times in 12.7 s (38 a minute). | as listed; `c/cw.log`, `e5/n6_*.log`, `pz/p_bs.log` |

## 2. Status of REVIEW_34's top ten

| # | REVIEW_34 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch | Not fixed. Instrument 9.47; LEG 7.8 (p10 6.1); SMO p10 7.2; worst adult_heel_boots @1.9 = 7.9. adult_heel_boots and ya_tube_heels walk bent-kneed with short steps at 1.8 m/s. | `m/items.log`, `n/BW.png` |
| 2 | Feet slide at walk starts | **Fixed** (0 over 5 cm in 4 runs). | `sl/*` |
| 3 | Garments and who sits | Not fixed. | `n/G*.png`, `g/*.json`, `e/EYE.png` |
| 4 | Start snap and hovering feet | Hovers fixed. The snap at v < 0.1 is fixed, but the first steps now have more one-tick foot jumps (new item 1). | `pop2.py` |
| 5 | Faces | Not changed. | `f/A.png`, `f/N.png`, `f/S.png` |
| 6 | Cap hair, phone hand, tote, woman_mini's hair | Not fixed. | `h/H.png`, `e/EYE.png` |
| 7 | Open grips | Better: max 6.5 cm (was 8.5). | `c/cw.log` |
| 8 | Turned away often, children alone | **Much better** (about 6 per 300 s; 6 children in 11 runs). New stuck-at-the-edge case. | `v/*` |
| 9 | Seated hand on a neighbour's thigh | Not seen: 0 hand hits in 6 rides. | `e5/n6_*.log` |
| 10 | Stop-start toggles | Worse at the worst: 38 a minute (sum_loose_shorts_w, Buchanan Street outer). | `pz/p_bs.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.72 (typical 8.6, worst 6.4)
Instrument (all 99 people, 5 speeds) as in review 34: overall 9.47; gate fails on LEG 7.8 (p10 6.1), SMO p10 7.2 and adult_heel_boots @1.9 = 7.9. Its start test (TRN 9.9) starts from rest in the gait alone and does not see the in-game fault below.

Good:
- Starts no longer skate.
- Stops are clean (median slide 0 mm, p90 2-5 mm).
- No hovering feet.

Worst tenth:
- **First-step foot jump.** As a boarder accelerates through about 0.7 m/s:
  - tick N: the swing foot has just come down (ankle 9 mm over the floor), then its heel flips 60-80 mm up with the ball pinned (teen_tube 57 mm, man_beard 61 mm);
  - tick N+1: the whole foot is 55-65 cm further on, 25-30 mm up;
  - after that the stride goes on normally. A foot moving 60 cm in 1/30 s reads as a flicker of the leg.
  - Counts per 100 s:

    | run | jumps over 30 cm | near model within 8 m |
    |---|---|---|
    | se1 | 20 | 3 |
    | se2 | 24 | 9 |
    | se3 | 26 | 10 |
    | bs | 13 | 6 |
    | Hillhead ride | 6 | 2 |

  - Review 34's recordings: 6 and 3.
  - Rendered: `pop2/POP.png`, row 1: man_beard at 2.0 m; row 3: woman_mini at 8.2 m.
- **The crouch:** `n/BW.png`.
- **A jam stutter** at 38 toggles a minute.

### 3.2 Arms and hands: 8.08 (typical 8.6, worst 7.3)
- 6 rides (Partick, Kelvinbridge, West Street inner; Govan, Bridge Street, Hillhead outer), 200 s each: 0 hands within 10 cm of another body; 0 knee pairs under 0.10 m.
- Grips (Cowcaddens outer ride): pole median 3 cm, max 6.5 cm, 4 of 32 over 4 cm.
- Unchanged and still seen:
  - The `phone_call` hand is a flat, open palm at the ear.
  - In the viewer, a tote held by the phone-call hand stands beside the shoulder with nothing gripping it (`h/H.png`, row 1, columns 3-4).

### 3.3 Faces: 7.70 (typical 8.1, worst 7.1)
I looked at 18 faces not on review 34's list, neutral and smiling (`f/N.png`, `f/S.png`, ids in `f/ids.txt`), plus the six problem faces (`f/A.png`). They differ well in age, sex and skin tone.

Faults:
- Dotted brows on nearly everyone.
- Lopsided smirks rather than smiles (adult_camisole, adult_smile_blouse, elder_woman_coat).
- adult_tophat's pale, wide stare and a streak on his left cheek.
- Ragged black hairlines (boy_small, teen_skater).
- Unchanged: ya_smile_polo's twisted mouth; teen_ginger's hard, stepped hairline; elder_shorts' squint and red cheek dot; girl_small's notched lip; sum_denim_shorts_m's dark mark and a strand of hair across the eye.

### 3.4 Standing, sitting, behaviour: 8.48 (typical 9.0, worst 7.7)
Good:
- Turned away about 6 per 300 s.
- 12 of 12 player walks through full trains finished (max still 0.1 s; `c/wk*.log`).
- No far model within 6 m and no duplicates (`g/*.json`).
- 3 brief overlaps, all among walkers about 20 m away.
- Rises clean.

Worst tenth:
- ya_tube_heels on the platform edge (2-9 cm) for 200 s at 2.6 m.
- teen_crop_leggings stuck 0.91 m from the edge for 177 s.
- Who sits splits the car by garment (St Enoch outer ride: 0 of 34 skirt, dress or kilt samples seated).
- Jam toggles at 38 a minute.

### 3.5 Range of people: 8.24 (typical 8.6, worst 7.7)
- Roster unchanged (99).
- In 4 rides, every child in the saloon was seated except:
  - girl_small, standing unheld in the aisle for 90 s, her "adult" a seated stranger;
  - boy_shorts and girl_leggings for a few seconds near risers.
- Children turned away alone on the platform: 6 in 11 runs (review 34: 24 of 83).

### 3.6 Clothing: 7.66 (typical 8.3, worst 6.7)
Census:

| run | scope | samples over half one garment | worst |
|---|---|---|---|
| St Enoch outer ride, 200 s | player's saloon | 10 of 20 | 9 of 16 and 6 of 10 trousers |
| St Enoch outer ride, 200 s | within 15 m | 5 of 20 | 58 % |
| Hillhead inner explore | platform | 2 of 19 | 5 of 9 trousers |
| Cowcaddens outer ride | per car | 0 of 40 | |

Garment faults, unchanged (`n/G1.png`, `n/G2.png`):
- The kilts' sporran hangs off the side of the hip, and a knee comes through the kilt hem in the stride (man_kilt_casual, man_highland).
- woman_midi's back slit and waist.
- girl_school_kilt's sleeve strip.
- woman_puffer's shorts have a blotchy, dirty-looking texture.

Every seated skirt and kilt still breaks in the viewer, which is why they are never seated.

### 3.7 Luggage: 8.24 (typical 8.8, worst 7.4)
- Seven bag kinds on two new bodies (man_hoodie, elder_woman_coat), standing, walking and seated, all held or worn correctly (`b/B1.png`, `b/B2.png`). The cabin trolley is towed by its handle and stands upright.
- The haggis:
  - On the platform: on the floor, lead from the hand (`e/pet_ride_outer_partick_ok.png`).
  - Seated: 831 samples tucked 0.41 m up under the owner's shins, as before.
  - No floor-false or leg contacts.
  - Not seen on stairs this round (owner never took them).
- Unchanged: the tote held by the phone-call hand.

### 3.8 Whole bodies: 8.02 (typical 8.5, worst 7.3)
- Unchanged:
  - woman_mini's long black hair is a flat slab from behind at eye height in a car (`e/EYE.png`, row 2, column 2).
  - Cap hair, the kilt knee and teen_ginger's hairline.
- Far model:
  - At 3.6 m in the viewer it is faceted, and man_kilt_casual has a red smear at the mouth (`l/L.png`).
  - It is never used within 6 m (`lod6 = 0` in both 200 s runs), so I weigh it lightly.
- T-shirt prints differ per spawn by design (`tees.js`) and are kept through LOD swaps.

## 4. Top ten defects, in priority order

1. **First-step foot jump.**
   - When a waiting person sets off, at about 0.7 m/s the swing foot first flips its heel 6-8 cm up in one tick. On the next tick it is 50-70 cm further on.
   - 13-26 times per 100 s, 3-10 of them on the near model within 8 m. It is 4-8 times as common since the plantAt and fresh-toe-off changes.
   - It looks as if the foot that has just landed a closing (timed) step is already past toe-off in the phase. It takes the toe-off pose in one frame and then starts its swing far into its arc (`f.sw.s` from `eps`).
   - Reproduce:
     - `ALL=1 node gslide.mjs "mode=explore&q=high&line=inner&station=st-enoch" 100 sl/x.json; python3 pop2.py sl/x.json; python3 jump.py 0.3 sl/x.json`
     - frames: `python3 dump.py sl/bs.json 11:34.85:35.25`
     - rendered: `node gpop.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 31 39 pop2/bs`
2. **Brisk-walk crouch** (LEG 7.8, p10 6.1; SMO p10 7.2; adult_heel_boots @1.9 = 7.9).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels,woman_puffer,man_commuter none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
3. **Garments and who sits.**
   - Kilt knee and sporran, midi slit and waist, sleeve strips.
   - No skirt, dress, kilt or long-coat wearer ever sits, so cars split by garment.
   - A saloon over half trousers in 10 of 20 samples.
   - Reproduce: `node shoot2.mjs 0 man_kilt_casual,woman_midi,girl_school_kilt,woman_puffer,teen_tube,man_highland none stand,walk@162,sit n/g legs 1.3`; `node gp8.mjs "mode=ride&q=high&line=outer&station=st-enoch" g/pa 200; python3 cen4.py g/pa.json`
4. **Faces:** ya_smile_polo's mouth; teen_ginger's hairline; elder_shorts' squint and dot; dotted brows; lopsided smirks; adult_tophat's stare; ragged hairlines on boy_small and teen_skater.
   - Reproduce: `node face2.mjs $(cat f/ids.txt) f/n "0:0" 0 8611 "" 14`, and with `f/s "0.3:0" 1`.
5. **A turned-away boarder stuck on the platform edge.**
   - ya_tube_heels, 2-9 cm from the edge for 200 s at 2.6 m from the camera, after 4 tries (1 run in 11). teen_crop_leggings at 0.91 m for 177 s.
   - Reproduce: `node gaway3.mjs "mode=explore&q=high&line=inner&station=cowcaddens" 300 > x.log; python3 aw2.py x.log` (intermittent; `gaway4.mjs` takes shots if it recurs).
6. **Hair through caps, the flat phone hand, the tote in the phone hand, woman_mini's hair slab.**
   - Reproduce: `ANGS='[["F",3.4,0.15],["S",1.9,0.1]]' node shoot2.mjs 0 adult_runner,woman_scarf tote clip-phone-1-40 h/h handr`; `node geye2.mjs "mode=ride&q=high&line=inner&station=kelvinhall" e/eye 40 6`
7. **Stop-start toggles in a jam:** 8 in 12.7 s (38 a minute, sum_loose_shorts_w, Buchanan Street outer).
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`
8. **girl_small standing alone in a moving car.** 90 s unheld in the aisle; the "adult within 1.2 m" was a seated stranger.
   - Reproduce: `node gkid2.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 200`
9. **Open grips:** up to 6.5 cm, 4 of 32 over 4 cm.
   - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=outer&station=cowcaddens" c/cw 150`
10. **Far model close up:** faceted, and man_kilt_casual has a red mouth smear. Not seen within 6 m in play.
    - Reproduce: `ANGS='[["F",3.4,0.1]]' node shoot2.mjs 1 man_kilt_casual,woman_mini,teen_ginger none stand,walk@162 l/l body`

## 5. What I could not observe

- **No motion watched.** The first-step jump comes from bones every 1/30 s and from rendered before/after frames (`pop2/POP.png`), not from video. Half of my rendered pairs had the camera inside a wall (`pop/POP.png`).
- **Claim 4** (walking off a shut doorway): nobody was left in a doorway in 3 runs.
- **The haggis on stairs:** its owner never used the stairs in 3 tries this round.
- **The edge-stuck boarder:** only in the log. It did not recur in 3 reruns, so I have no picture.
- **Blink and smile timing** in play.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | St Enoch inner x3, Buchanan Street outer, Hillhead inner ride (100 s each) | `sl/*.json`, `skid2.py`, `start_an.py`, `hover.py`, `pop2.py`, `jump.py` |
| Rendered first-step frames | St Enoch inner, Buchanan Street outer | `pop/POP.png`, `pop2/POP.png` |
| Brisk walk, side, 6 phases at 1.8 m/s | adult_heel_boots, ya_tube_heels, woman_puffer, man_commuter | `n/BW.png` |
| Garments: stand, walk, sit (legs) | man_kilt_casual, woman_midi, girl_school_kilt, woman_puffer, teen_tube, man_highland | `n/G1.png`, `n/G2.png` |
| Faces, neutral and smiling | 18 new ids (`f/ids.txt`) plus 6 problem faces | `f/N.png`, `f/S.png`, `f/A.png` |
| Hands: phone, tote, pole | adult_runner, woman_scarf, man_hoodie, staff_woman, teen_hippy, elder_man_cap | `h/H.png` |
| Bags: 7 kinds x stand, walk, sit | man_hoodie, elder_woman_coat (also teen_skater, adult_suit_bun shot) | `b/B1.png`, `b/B2.png`, `b/b_list.txt` |
| Near and far model | 8 people, both models | `l/L.png`, `l/H0.png` |
| Turned-away boarders | Govan outer x2, Hillhead inner x2, Ibrox, Partick outer, Cowcaddens inner x4, St Enoch outer (300 s each) | `v/aw_*.log`, `v/aw4_*.log` |
| Doorway at door close, teleports | Govan outer, Hillhead inner, St Enoch inner | `v/bay_*.log` |
| Rises, hands, knees | 6 rides | `e5/n6_*.log` |
| Children in cars | Hillhead outer x2, Govan inner, Cowcaddens inner rides | `k/*.log` |
| Overlaps, far within 6 m, duplicates, census, who sits | St Enoch outer ride, Hillhead inner explore, 200 s | `g/pa.json`, `g/se.json`, `cen4.py` |
| Grips and per-car mix | Cowcaddens outer ride, 150 s | `c/cw.log` |
| Player walks through full trains | St Enoch inner, Buchanan Street outer rides | `c/wk.log`, `c/wk2.log` |
| Eye height in a car | Kelvinhall inner ride, 4 people x 3 views | `e/EYE.png` |
| The haggis | Partick outer ride, St Enoch inner ride, Hillhead explore (absent), 2 stair runs (owner not on stairs) | `e/pet_*.log`, `e/pet_ride_outer_partick_ok.png` |
| Jam pauses | Buchanan Street outer, 200 s | `pz/p_bs.log` |

Next round, look at:
- the first steps of boarders, rendered from the side;
- a doorway left occupied at door close;
- the haggis on stairs;
- children standing in cars.

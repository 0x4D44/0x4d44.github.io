# Under Glasgow: independent review of the people (review 8)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611 (people.glb, people_lod.glb and people_meta.json dated 2026-11-16 05:28). Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 6.9 (6.88). Gate NOT met.** The gate needs a mean above 9 and no category below 8. No category reaches 8.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review8/`. In viewer stills, `_F` = front quarter, `_S` = side, `_B` = back quarter.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.0 | 6.0 | **7.2** |
| 2 | Arms and hands | 10 | 8.0 | 6.5 | **7.4** |
| 3 | Faces | 10 | 7.5 | 6.0 | **6.9** |
| 4 | Standing, sitting, behaviour | 10 | 8.0 | 6.0 | **7.2** |
| 5 | Range of people | 10 | 7.5 | 6.5 | **7.1** |
| 6 | Clothing | 15 | 7.0 | 4.5 | **6.0** |
| 7 | Luggage | 10 | 8.0 | 5.5 | **7.0** |
| 8 | Whole bodies | 15 | 7.5 | 5.0 | **6.5** |
| | **Weighted mean** | 100 | | | **6.9** (6.88) |

0.20x7.2 + 0.10x7.4 + 0.10x6.9 + 0.10x7.2 + 0.10x7.1 + 0.15x6.0 + 0.10x7.0 + 0.15x6.5 = 6.875.

In one line: the duplicates are gone (0 in five game runs), stair walkers flow, hands hold handles and floor rucksacks work. But the staff vest on the full model is still torn with a strap flying off the shoulder, seated kilt wearers have their bare thighs coming out through the front of the kilt, seated bags on the far model ride up to the chin or face, alighters still walk through each other at 2-3 m from the player, one garment is still over half of a platform, and the gait is unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | No duplicates; full train ~60 | **Duplicates: true.** 0 duplicates (any crowd, visible, within 40 m) in all five runs: Partick, Ibrox, Buchanan St, ride from Cowcaddens, ride from Hillhead. **"~60": not borne out.** I counted 74 and 79 visible riders in the inner train (ride from Kelvinhall); the saloon crowd's cap is still 96 (`js/sim/index.js:400`). | `g/*.log` (`ndup` 0), `gx/kv.json` (`counts` 74), `gx/far.json` (79) |
| 2 | Stair give-way, sidestep, 0.3 m core | **Stairs: true.** Stair overlaps are now 0.24-0.30 m for at most 0.3 s (review 7: 0.17 m for 0.9 s). One 3 s stall (girl, Ibrox). **The 0.3 m core does not stop platform pass-through.** Alighters still come within 0.06-0.17 m of each other for up to 1.8 s, at 2.4-3.3 m from the player (details in 2.4). | `g/ibx.json`, `g/pk.json`, `g/bch.json` (`ov`, `stair`) |
| 3 | Vest recut on clean lines; far vest moved out; far coats keep seams | **Far model: largely true.** The far vest is no longer a patchwork (`lod/far.png` rows 1-2). **Full model: false.** The top edge is still jagged with navy notches front and back, the reflective band has castellated edges, and on both staff a strap-like orange ribbon sticks up and out about 10-15 cm from the left shoulder, standing, walking and seated (`w/vz.png`, `w/vest.png`). In the game a staff member stood 0.5 m in front of the player in the car, showing the torn back (`gx/ff.png` bottom row), and the strap spikes show on staff_woman at 14.8 m (`gx/kilt.png` row 2). | `w/vz.png`, `w/vest.png`, `lod/far.png`, `gx/ff.png`, `gx/kilt.png` |
| 4 | Long coats: trousers drawn in | **True as far as I could see.** No jeans showed through elder_woman_coat's or ya_winter's coat in five walk phases, on either model. **New finding, not a regression:** both coats are drawn with broad white bands that trace the texture's UV islands. The coat reads as a striped bathrobe at any distance, and the two women wear the identical coat. | `w/coat.png`, `w/coatz.png`, `w/coat_cmp.png` (review 7's still on the left shows the same bands) |
| 5 | woman_coat, woman_midi, teen_tube stand on trains | **True.** None of the three was seen seated in five runs. The seated-sample census shows kilt wearers, teen_skirt, woman_mini and adult_beret still sit (see 2.6). | `g/*.json` (`sit`) |
| 6 | lusekofta hems level at boot tops | **True.** | `w/coat.png` row 3, `lod/far.png` row 5 |
| 7 | Pleated mini in three colours | **True.** But teen_skirt and woman_mini still share the pink paisley top and long black hair, so they still read as one outfit (skin tones differ). | `s/K2.png` rows 1-2 |
| 8 | Lookalike men re-haired; darker irises; bigger smiles; woman_dress mouth fixed | **Mostly true.** adult_piper, adult_tattoo_muscle, adult_cyclist, ya_tee_jeans and teen_hood now have different hair and no longer read as one man. The base face is still narrow and similar across many young men. Smiles now show. Many read as smirks because the brows are dark slanted dashes (man_commuter, adult_camo_cap, adult_tattoo_muscle). woman_dress's mouth looks right. | `f/n.png`, `f/sm.png`, `f/s0.png` |
| 9 | Handles in curled fingers; wide bags tilt away | **True.** On elder_man_cap, adult_smile_blouse and teen_ginger, the handbag, holdall, shopper, case, tote and carrier handles sit in the fingers, standing and walking. | `a/H.png`, `l/Lw.png`, `l/Lm.png` |
| 10 | Seated rucksacks between the feet | **True.** In the viewer and in the game the rucksack stands between the calves. **But** on a sit_cross_legs rider the crossed leg goes through the bag: woman_dress's shin passes into her blue rucksack, with black holes in the bag (`gx/kilt.png` bottom right). | `l/Lw.png` row 4, `gx/ruck.png`, `gx/kilt.png` |
| 11 | Gait not changed | **True.** Instrument on the default six: **9.30**. LEG 8.0 (p10 7.1); SMO p10 7.0; worst recording woman_midi at 1.6 m/s = 8.2. Knee at loading is 30-33 deg (woman_coat, boy) and in mid-stance 20-21 deg (boy, girl_school_kilt). | `motion_run.log`, `motrec/` |
| note | Phones over the mouth are a viewer artefact | **Confirmed.** In the game, over 1,937 + 271 + 300 full-model phone samples, no texting or seated hand came within 0.39 m of the head joint. Only calls are closer (0.16 m, at the ear, as they should be). The viewer's face shooter still shows two-handed phones in front of the mouth, with the fingers of both hands passing through each other (`f/n.png`). Only `people_view.html` shows that. | `gx/kv.json` (last entry), `gx/far.json` (`ph`) |

## 2. Status of REVIEW_7's top ten

| # | REVIEW_7 item | Now | Evidence |
|---|---|---|---|
| 1 | Same person twice | **Fixed.** 0 in 5 runs. | `g/*.log` |
| 2 | Staff vest broken | **Partly fixed.** The far model is clean. The full model is still torn, with a flying strap. | `w/vz.png`, `gx/ff.png` |
| 3 | Gait | **Not fixed** (not attempted). 9.30 on the default six. | `motion_run.log` |
| 4 | Long coats have holes | **Fixed** (no jeans seen). The coat texture's white UV bands remain. | `w/coat.png` |
| 5 | Pass-through up to 2.4 s | **Partly fixed.** Stairs are fine. Platform alighters still pass at 0.06-0.25 m for up to 1.8 s, 2.4-3.3 m from the player. | `g/pk.json`, `g/bch.json`, `g/ibx.json` |
| 6 | Seated skirts | **Partly fixed by removal.** The three named skirts no longer sit. adult_beret still sits, with a torn skirt (in the game at 6.5 m). woman_mini's mini balloons. Seated kilts are broken (new finding). | `s/K1.png`, `s/K2.png`, `s/z2.png`, `gx/kilt.png` |
| 7 | lusekofta hems | **Fixed.** | `w/coat.png` |
| 8 | Garment over half; repeated outfits | **Not fixed.** One garment is 62-80% of the people within 15 m at moments on four of the five platforms (2.6). The tee, shorts and white socks template is unchanged. | `g/*.json` `cen` |
| 9 | Faces | **Partly fixed.** No lookalike five. staff_woman's scalp still shows at the hairline. Smiles read as smirks. | `f/n.png`, `w/vz.png` row 3 |
| 10 | Small faults | ya_smile_halter's spike was not seen this round (not specifically hunted). Far models within 6 m: at most 3 at once, at 5.1-5.6 m. Rucksacks are now on the floor. | `g/*.json` `lod6ids` |

## 3. Per-category reasoning

### 3.1 Walking: 7.2 (typical 8.0, worst 6.0)
- Instrument (default six): 9.30, the same as before.
  - LEG 8.0 / p10 7.1.
  - SMO p10 7.0: pelvis vertical acceleration reaches 13-17 m/s² on boy and girl_school_kilt at 1.2-1.9 m/s.
  - Crouch: knee at loading 30-33 deg, mid-stance 20-21 deg.
- 41 new people at walk 158/166/174/182 (F and S): heel strike, swing and toe-off read in all (`n/A1.png`, `n/A2.png`, `n/B1.png`, `n/B2.png`). adult_fisherman_leggings and woman_elder are visibly knee-bent in double support (`n/z4.png`).
- Platform alighters still walk through each other (2.4).

### 3.2 Arms and hands: 7.4 (typical 8.0, worst 6.5)
- Handles are in the fingers on six bag kinds and three new bodies (`a/H.png`). Arm swing reads in every walk still.
- In-game phones are held at a sensible height (section 1, note).
- **Worst cases:**
  - Seated riders on a phone with a lap bag type through the bag. In the game, woman_elder's hands and phone are inside her shopper, and teen_runner's are inside a black shopper raised to her chin (`gx/ff5.png`).
  - adult_beret holds a white tote up at chest height with her hands sunk into it (`gx/kilt.png` row 3).
- In the viewer's sitphone clip the fingers of both hands interlace through each other (`f/n.png` columns 4-5), though in the game the hold step lowers the hands.

### 3.3 Faces: 6.9 (typical 7.5, worst 6.0)
- 24 faces at 0.75 m, neutral and smiling (`f/n.png`, `f/sm.png`, `f/s0.png`). Age, sex and skin tone read correctly, and the elders are lined. Smiles now visibly lift.
- **Faults:**
  - Eyebrows are thin dark slanted dashes, so many neutral and smiling men look cross or sly (man_commuter, adult_camo_cap, adult_oxford_shirt, ya_smile_polo).
  - The faces are smooth and doll-like up close.
  - staff_woman's scalp shows through at the parting and temples (`w/vz.png` row 3).
  - girl_ginger's hair is still flat slabs over the cheek (`f/n.png` last column, row 1).
- In-game close faces at about 0.9 m look acceptable (`gx/c20.png`).
- Blink rate not measured.

### 3.4 Standing, sitting, behaviour: 7.2 (typical 8.0, worst 6.0)
- **Good:** no twins; stairs flow (one 3 s stall in 57 stair walkers); a human clip-change rate (2.0-2.4 per person-minute); the car reads well at eye height, with riders on phones (`gx/eye.png`).
- **Pass-through on platforms during alighting** (centre to centre, with distance from the player):
  - Buchanan St: woman_mini and ya_tube_heels 0.06 m, 2.4 m from the player. sum_tee_leggings and ya_tube_heels 0.25 m for 1.8 s, at 2.9 m.
  - Ibrox: woman_midi and ya_shorts 0.13 m at 2.5 m. adult_casual5 and woman_elder 0.07 m.
  - Partick: man_highland and teen_crop_leggings 0.17 m for 1.8 s. adult_cyclist and ya_ginger_braid 0.17 m at 2.9 m.
- **Seated kilts (2.6) and lap bags (2.7)** are what a player sees sitting opposite.

### 3.5 Range of people: 7.1 (typical 7.5, worst 6.5)
- The roster is unchanged: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff, with a good spread of skin tones and heights (`lod1s/st0.png`, `lod1s/st1.png`).
- No twins in the game now.
- **Repeated looks:**
  - Printed tee, shorts and white socks on sum_loose_shorts_w, teen_cutoffs, sum_denim_shorts_m, sum_chino_shorts_m, boy_shorts, teen_ginger and others (`n/B2.png`).
  - adult_casual2 and ya_ginger_lad wear the same sweatshirt with a logo and stripe, recoloured (`n/B1.png` rows 7 and 10).
  - The two long-coat women wear one coat.
  - teen_skirt and woman_mini share a top and hair.

### 3.6 Clothing: 6.0 (typical 7.0, worst 4.5)
- **Full-model staff vest:** torn edges and a flying shoulder strap. Seen in the game at 0.5-15 m (`w/vz.png`, `gx/ff.png`, `gx/kilt.png`).
- **Seated kilts:** the kilt hangs straight down as a curtain behind the legs, and the bare thighs come out through its front. Seen on man_kilt_casual, girl_school_kilt, boy_kilt, man_highland and adult_piper in every sit clip (`s/K1.png`, `s/z2.png`, `s/z3.png`). In the game, man_kilt_casual was seated like this (`gx/kilt.png` row 3, left). Kilt wearers sat in all five runs.
- **adult_beret seated:** the skirt is broken, with skin wedges and black holes at the knees and boot tops. Seen in the viewer and in the game at 6.5 m (`s/z3.png`, `gx/kilt.png` row 3, right).
- woman_mini's mini balloons out into a ring when seated (`s/z3.png`).
- **Long coats:** white UV-island bands (3.1 claim 4).
- **Mix:** the share of the most common garment among the people within 15 m reached:
  - shorts 73% (11 of 15) on the Partick platform;
  - trousers 80% (8 of 10) on the Cowcaddens platform;
  - trousers 67% (8 of 12) at Ibrox;
  - trousers 62% on the Hillhead platform;
  - trousers 59% in a saloon (`g/*.json` `cen`).
  - The rubric allows no more than half.
- **Fixed:** coat holes, lusekofta hems, the far vest.

### 3.7 Luggage: 7.0 (typical 8.0, worst 5.5)
- **Good:** ten kinds on two new bodies, standing, walking and seated, hang right (`l/Lw.png`, `l/Lm.png`); grips (`a/H.png`); floor rucksacks (`gx/ruck.png`).
- **Seated lap bags ride up on the far model.**
  - In the viewer (`forcelod=1`, far camera, seated), 32 of the 52 seated people who carry a bag had it with its top at or above the head and its bottom at about 0.9 m: a bag in front of the face (`lod1s/sit1.png`, `bt/re.png`; measured by `bp4.mjs`). On the full model: 0 of 52.
  - In the game the same measure flagged 6-7 lap-bag riders at once on far models 6-17 m away (woman_elder's shopper on 60 of 60 samples at 10 m; adult_oxford_shirt, teen_girl; `gx/far.json`).
  - A close render of teen_runner (far model) shows the shopper up at her chin with her hands inside it (`gx/ff5.png`).
- **Hands through lap bags while texting** (3.2).
- A cross-legged rider's leg goes through her floor rucksack (`gx/kilt.png`).
- Not seen: a wheeled case on a real stair.

### 3.8 Whole bodies: 6.5 (typical 7.5, worst 5.0)
- **Far model, all 99 standing and sit_idle:** bodies clean. The vest is no longer a patchwork (`lod1s/*.png`, `lod/far.png`). Within 6 m of the player there were at most 3 far models at once, at 5.1-5.6 m.
- **Worst tenth:**
  - the torn vest with its flying strap;
  - thighs through seated kilts;
  - adult_beret's torn seated skirt;
  - far-model lap bags over the face;
  - a leg through a rucksack;
  - staff_woman's scalp.

## 4. Top ten defects, in priority order

1. **Seated kilts: bare thighs come out through the front of the kilt, which hangs as a vertical curtain behind the legs.**
   - Who: man_kilt_casual, girl_school_kilt, boy_kilt, man_highland, adult_piper; every sit clip.
   - These people sit in every run, and the player sees them across the aisle.
   - Reproduce: `node shoot.mjs 0 man_kilt_casual,girl_school_kilt,boy_kilt none clip-sit-0-30 s/K`; in the game, `node gt.mjs "mode=ride&q=high&line=outer&station=cowcaddens" gx/kilt 20 "kilt"`.
   - Evidence: `s/z2.png`, `gx/kilt.png`.
2. **Full-model staff vest still torn.**
   - What: jagged notched top edge and castellated reflective band. An orange ribbon sticks up 10-15 cm off the left shoulder, standing, walking and seated, on both staff.
   - The player meets staff at arm's length in the car.
   - Reproduce: `node shoot.mjs 0 staff_hivis,staff_woman none stand,walk@166,clip-sit-0-30 w/vz chest`.
   - Evidence: `w/vz.png`, `gx/ff.png`.
3. **Far-model seated lap bags rise to the chin or face.**
   - What: 32 of 52 bag carriers in the viewer. 6-7 riders at a time in the game at 6-17 m, with the hands inside the bag.
   - Reproduce: `node bp4.mjs 1 clip` (versus `node bp4.mjs 0 clip`: 0 bad on the full model); in the game, `node gfar.mjs "mode=ride&q=high&line=inner&station=kelvinhall" gx/far 60` (`bagsFace`), and `node gfar3.mjs ... gx/far5 60` for the close render.
   - Evidence: `bt/re.png`, `lod1s/sit1.png`, `gx/ff5.png`.
4. **Gait unchanged:** 9.30 on the default six; LEG 8.0, SMO p10 7.0; crouch at loading 30-33 deg.
   - Reproduce: `node tools/people_motion.mjs --people default --base http://127.0.0.1:8611 --rec DIR`.
   - Evidence: `motion_run.log`.
5. **Alighters walk through each other near the player.**
   - What: 0.06-0.25 m for up to 1.8 s, 2.4-3.3 m away, at t of about 37-41 s (the first train in) on every platform run.
   - Reproduce: `node gp7.mjs "mode=explore&q=high&line=inner&station=buchanan" g/bch 120`, then read `ov`.
   - Evidence: `g/bch.json`, `g/ibx.json`, `g/pk.json`.
6. **One garment over half a platform:** shorts 73% at Partick; trousers 80% at Cowcaddens, 67% at Ibrox, 62% at Hillhead (within 15 m).
   - Reproduce: `gp7.mjs`, then read `cen`.
   - Evidence: `g/*.json`.
7. **adult_beret's seated skirt is broken** (skin wedges and black holes at the knees and boot tops). woman_mini's seated mini balloons.
   - Reproduce: `node shoot.mjs 0 adult_beret,woman_mini none clip-sit-0-30 s/K`.
   - Evidence: `s/z3.png`, `gx/kilt.png` row 3.
8. **Hands and phones pass through lap bags; a crossed leg goes through a floor rucksack** (woman_elder, teen_runner, adult_beret, woman_dress in the game).
   - Reproduce: `gfar3.mjs` and `gt.mjs` as above.
   - Evidence: `gx/ff5.png`, `gx/kilt.png`.
9. **Long coats look like striped bathrobes:** white UV-island bands on the full and far models. Both coat women wear the identical coat.
   - Reproduce: `node shoot.mjs 0 elder_woman_coat,ya_winter none walk@166 w/coatz waist`.
   - Evidence: `w/coatz.png`, `w/coat.png`.
10. **Faces and repeated looks:**
    - slanted dash eyebrows make many faces look cross or sly;
    - staff_woman's scalp shows;
    - the tee, shorts and white socks template;
    - adult_casual2 and ya_ginger_lad share one sweatshirt;
    - teen_skirt and woman_mini share a top and hair.
    - Reproduce: `node face.mjs man_commuter,adult_camo_cap,ya_smile_polo,staff_woman f/s0 "0:0" 1`.
    - Evidence: `f/s0.png`, `f/sm.png`, `n/B1.png`, `n/B2.png`.

## 5. What I could not observe

- **No motion watched.** Walking is judged from stills at frames 158/166/174/182, the instrument (default six only, not the whole roster) and the game traces.
- **Blink rate and smile timing** were not measured. I saw smiles on in-game faces (`gx/c20.png`) but did not time them.
- **The viewer's `sitalt` clips spawn in stand mode,** so sit_look and sit_cross_legs with bags were judged only in the game.
- **No wheeled case on a real stair.**
- **Not deterministic:** the game sims are not deterministic, and bag rolls differ per page load, so a viewer still can show a different bag from a later run of the same probe.

## 6. What I sampled

| What | Who | Evidence |
|---|---|---|
| Staff vest, full and far model, stand, walk 166/174, sit_idle, chest close-ups | staff_hivis, staff_woman | `w/vest.png`, `w/vz.png`, `lod/far.png` |
| Long coats and lusekofta, walk 158-182, full and far; coat close-up | elder_woman_coat, ya_winter, adult_lusekofta, man_longcoat, woman_coat | `w/coat.png`, `w/coatz.png`, `lod/far.png` |
| **41 people not leaned on before:** stand, walk 158/166/174/182 and sit_idle / sit_cross (clip 2), F and S | man_commuter … boy_shorts (lists in `n/A.log`, `n/B.log`) | `n/A1.png`, `n/A2.png`, `n/B1.png`, `n/B2.png`, `n/z*.png` |
| Every skirt, dress and kilt wearer that sits: four sit clips | 13 people | `s/K1.png`, `s/K2.png`, `s/z2.png`, `s/z3.png`, `s/ed.png` |
| Far model, all 99: standing and sit_idle | all | `lod1s/st0.png`, `lod1s/st1.png`, `lod1s/sit0.png`, `lod1s/sit1.png` |
| 24 faces at 0.75 m, neutral and smiling (gaze 0.3) plus 6 smiling straight on | listed in section 3.3 | `f/n.png`, `f/sm.png`, `f/s0.png` |
| Hands on six handle kinds, standing and walking | elder_man_cap, adult_smile_blouse, teen_ginger | `a/H.png` |
| Luggage: 10 kinds x stand / walk / stair / sit | woman_bob, sum_chino_shorts_m | `l/Lw.png`, `l/Lm.png` |
| Seated lap-bag height, viewer, all 99 on both models | all | `bp4.mjs` output (section 3.7) |
| Walking instrument, default six | | `motion_run.log` |
| Game, `gp7.mjs` | Partick inner 150 s; Ibrox outer 150 s; Buchanan St inner 120 s; ride from Cowcaddens outer 180 s; ride from Hillhead inner 150 s | `g/*.json`, `g/*.log` |
| Game, in-car eye-height views and close shots, phones (hand to head) | ride from Kelvinhall | `gx/eye.png`, `gx/c20.png`, `gx/c60.png`, `gx/kv.json` |
| Game, lap bags against head height, train counts | rides from Kelvinhall (x4), Ibrox | `gx/far*.json`, `gx/ff*.png` |
| Game, close shots of seated kilt, skirt and dress wearers and staff; seated rucksack riders | rides from Cowcaddens and Hillhead | `gx/kilt.png`, `gx/ruck.png` |

New scripts in `$R`: `gx.mjs`, `gfar.mjs`, `gfar2.mjs`, `gfar3.mjs`, `gt.mjs`, `gt2.mjs`, `bp4.mjs`, `rows.py`, `bagrows2.py`. Next round, look at: wheeled cases on real stairs, blink and smile timing, sit_cross_legs with every bag kind in the game, and the whole-roster instrument.

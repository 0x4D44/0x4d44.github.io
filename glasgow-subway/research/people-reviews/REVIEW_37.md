# Under Glasgow: independent review of the people (review 37)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `709e0a71`. Commits since review 36 that touch the people (read-only `git diff 451372d9 709e0a71 -- glasgow-subway/js`):
- `gait.js` `walkStep`: a foot found late in its stance, with the other foot down, sets the stride's clock back so that it leaves at its own toe-off and takes a whole swing.
- `index.js`:
  - boarders are routed grown-ups first (`queued` sorted, children last);
  - a boarder who did not reach their place and would stand within 0.5 m of a non-seated rider rises on to the place given (0.9 s).
- `people.js`:
  - brows and lashes blended (`alphaTest 0.04`, no depth write);
  - `_fingers` bends the fingers when `p.hold.w > 0.02` (call hand 0.55, texting 0.3 both hands);
  - `_canSit` no longer refuses `ya_smile_dress` and `elder_woman_dress`.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review37/`. I deleted the walking-instrument recording after scoring; `m/items.log` holds the result. Running notes: `NOTES.md`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.08 (8.083). Gate NOT met.**
- At 8 or above (six categories): Behaviour 8.40, Luggage 8.36, Arms 8.32, Range 8.16, Walking 8.08, Whole bodies 8.02.
- Below 8: Faces 7.88, Clothing 7.68.

In short:
- **Claims 1, 2, 4 and 5 hold.** No foot jump over 30 cm on a near model in six runs; no standers inside each other in five rides; phone hands now close round the phone; brows read as whole soft brows at 1 m and 3 m.
- **Claim 3 does not show in the counts.** Children were turned away 10 times in six 300 s runs (review 36: 7). Govan outer 3, Hillhead inner 2.
- **Claim 6 is half true.** The two dresses do sit now, in every ride I took (3 rides, `sit_idle` and `sit_phone`), but seated they are not whole:
  - `elder_woman_dress`: the skirt rides up to the hip and splays sideways in stiff flaps; from across the aisle her thighs are bare to the crotch, like a leotard (`sd/IBX.png` row 1, `sd/zoom.png` left, `sd/COW.png` 1-2).
  - `ya_smile_dress`: the back of the hem hangs as a red half-disc below the front of the seat, between her calves, in every view (`sd/IBX.png` rows 3-4, `sd/COW.png` 3-4). In the viewer the lap is open from the front and `sit_cross_legs` tears the hem into shards (`n/SD.png`, `n/sd_zoom.png`).
  - Every skirt and kilt still stands, so the car's standers are still mostly skirts.
- **New or worse:**
  - The player was held in one car for 47-56 s on 4 of 6 walks in one St Enoch outer ride (1 ride in 3), by a stander in the aisle with a carrier bag (`c/wk.log`).
  - girl_small stood alone in a moving car for about 95 s after the woman beside her got off (`k/kid2_inner_cowcaddens.log`).
  - Jam stop-start got worse: 50 toggles a minute at Buchanan Street (review 36: 30), 35 at St Enoch (25).
  - New twin faces: ya_ginger_long and ya_winter join woman_bob and woman_sash, making four pale faces under the same red bob (`f/FAR.png`).

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.0 | **8.08** |
| 2 | Arms and hands | 10 | 8.8 | 7.6 | **8.32** |
| 3 | Faces | 10 | 8.4 | 7.1 | **7.88** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.5 | **8.40** |
| 5 | Range of people | 10 | 8.6 | 7.5 | **8.16** |
| 6 | Clothing | 15 | 8.4 | 6.6 | **7.68** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.5 | 7.3 | **8.02** |
| | **Weighted mean** | 100 | | | **8.08** (8.083) |

0.20x8.08 + 0.10x8.32 + 0.10x7.88 + 0.10x8.40 + 0.10x8.16 + 0.15x7.68 + 0.10x8.36 + 0.15x8.02 = 1.616 + 0.832 + 0.788 + 0.840 + 0.816 + 1.152 + 0.836 + 1.203 = 8.083.

Changes against review 36 (8.053):
- **Walking +0.06.** Fewer quick first steps (flicks 12-20 per 100 s, was 25-35; none near over 20 cm). Crouch unchanged; jam toggling worse.
- **Arms +0.24.** The phone hand is fixed. Grips slightly looser (max 5.8 cm, was 3.8). The shopper "held across the chest in the phone pose" was a viewer artefact (below), so it leaves the worst tenth.
- **Faces +0.18.** Brows fixed. Smirks and twins unchanged; one more pair of twins found.
- **Behaviour -0.12.** No overlapping standers, but a player held for most of a minute, a child alone standing, and worse jam toggling.
- **Range -0.08.** More children turned away (10 in 6 runs) and a child alone in a car.
- **Clothing -0.08.** The two dresses now sit, which helps the mix a little, but both are visibly wrong seated at 1.2-1.6 m in the car, and all other skirts still stand.
- **Luggage +0.08.** Review 36's worst case was not a game fault.
- **Whole bodies 0.** Overlap gone; the seated elder dress exposing the lap replaces it.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A late first step takes a whole swing; foot moves over 20 cm 8-10 -> 4, over 30 cm 0, slides over 5 cm 0 | **True for what matters.**<br>- `jump.py 0.3` (one-tick moves over 30 cm): 0 in St Enoch inner x2, Buchanan Street outer, Partick inner, Kelvinbridge outer ride; 2 in a Partick inner ride, both far models at 42 m and 96 m.<br>- Over 20 cm: 5 and 4 at St Enoch (builder: 4), 15 at Buchanan Street, 8 at Partick, 1 and 2 in the rides. Nearly all at a normal walking speed of 1.1-1.4 m/s, which is an ordinary swing peak, not a first step.<br>- `flick.py` (fast first steps): 17, 17, 20, 12, 4, 8 per 100 s (review 36: 25-35); near ones peaking over 20 cm: 0, 0, 1, 1, 0, 0.<br>- `skid2.py` slides over 5 cm: none near. Far only: adult_heel_boots' ankle 7.5 cm a stride at 14 m (St Enoch, far model); three at 41-100 m in the Partick ride (up to 61 cm).<br>- Instrument TRN 9.8 (p10 9.6), was 9.9 (9.9): `TRN.lat` 0.62 s from walk command to first heel strike, slightly slower to set off. | `sl/*.json`, `jump.py`, `flick.py`, `skid2.py`, `m/items.log` |
| 2 | A boarder who would stand inside someone steps on to their place | **True in my rides.** `gnb6.mjs`, 200 s each, Partick outer x2, Govan inner, Kelvinhall outer, Cowcaddens inner: stander pelvises under 0.45 m apart 0 in all five (under 0.7 m: 0, 0, 0, 2, 2); hand on another rider under 10 cm 0; knee pairs under 10 cm 0. | `e/n6_*.log` |
| 3 | Grown-ups routed first, so a child finds a standing grown-up; 1-2 children turned away per 300 s at Govan outer / Hillhead inner | **Not borne out.**<br>- `gaway5.mjs`, 300 s: "child, no seat" turn-aways 1 (Cowcaddens), 2 (Cowcaddens), 2 (Hillhead, girl_school_kilt both trains), 1 (Ibrox), 3 (Govan outer), 1 (St Enoch outer) = 10. Review 36 had 7 in six runs.<br>- In the cars, the routed children stood by a standing grown-up or sat.<br>- But girl_small (in the car from the start) stood with woman_midi until she got off at t 104, then about 95 s more with only seated woman_puffer 0.97 m away. | `v/aw_*.log`, `k/kid2_*.log` |
| 4 | Phone held with the fingers bent round it | **True.** Five callers in the game (`h/C2.png`): fingers curl over the edge of the phone at the ear. Five texters (`h/T3.png`): fingers bent under the phone in both hands. Small faults: the phone is held flat at waist height, and on two texters it seems to float 1-2 cm above the fingers. | `gcall2.mjs`, `h/C2.png`, `h/T3.png` |
| 5 | Brows and lashes blended | **True.** 30 faces at 1 m (`f/N.png`, `f/A.png`) and at 3 m (`f/FAR.png`): solid, soft brows; the dotted dashes are gone. | `face3.mjs`, `f/*.png` |
| 6 | ya_smile_dress and elder_woman_dress may sit | **They sit; the dresses break.**<br>- `gsd.mjs` rides at Ibrox outer, Partick inner and Cowcaddens outer: both women seated for most of each ride (`sit_idle`, `sit_phone`). The builder's own note: "a little full behind".<br>- Seen from a standing rider at 1.6 m and from the seat opposite at 1.15 m eye height, 1.1 m away: the faults described above. Standing, both dresses are fine (`n/ST.png`).<br>- Who sits (`who.py`, 200 s rides): dress samples seated 20 of 29 (St Enoch inner) and 18 of 20 (Cowcaddens outer); every skirt and highland kilt sample standing. At Cowcaddens outer, 27 of the 33 standing samples are skirts, kilts or dresses. | `sd/*.png`, `n/SD.png`, `n/SE.png`, `g/pa.json`, `g/pb.json` |
| 7 | Not changed: crouch, garment faults, other faces, hair under caps, woman_mini's hair, shopper in the phone pose, jam stop-start, repeat turn-aways | **True, with one correction.**<br>- Crouch: `n/BW.png` unchanged; instrument LEG 7.8 (p10 6.1), SMO 8.9 (p10 7.2), adult_heel_boots @1.9 7.9.<br>- Garments: `n/G.png` (woman_coat and woman_midi notched hems, woman_puffer's blotchy shorts).<br>- Faces: `f/A.png`, `f/AS.png`.<br>- woman_mini from behind: a flat black slab (`n/HC.png`). Caps: the hair is a squared block under each cap; none through it.<br>- **The shopper in the phone pose is a viewer artefact.** `shoot2.mjs` sets the bag after the spawn has already chosen the phone clip. In the game, `_phoneUse` returns null for anyone with a bag in the hand. (I reproduced it with adult_harem's handbag in the viewer, `b/B.png`.)<br>- Jams: worse (below). Repeat turn-aways: in 4 of 6 runs. | as listed |

## 2. Status of REVIEW_36's top ten

| # | REVIEW_36 item | Now | Evidence |
|---|---|---|---|
| 1 | Brisk-walk crouch | Not fixed. | `n/BW.png`, `m/items.log` |
| 2 | Very fast first step | **Mostly fixed.** Flicks per 100 s 4-20 (was 25-35), none near peaking over 20 cm in the St Enoch runs; 1 each at Buchanan Street (teen_girl, 20 cm, 3.6 m) and Partick (woman_mini, 20 cm, 2.2 m). | `sl/*`, `flick.py` |
| 3 | Garments and who sits | Two dresses now sit, but break seated (new item 1). Kilt and hem faults unchanged. All skirts and kilts still stand. | `sd/*`, `n/G.png`, `g/*.json` |
| 4 | Two standers inside each other | **Fixed** in 5 of 5 rides. | `e/n6_*.log` |
| 5 | Faces | Brows fixed. Smirks, twins and problem faces unchanged; one more twin pair found. | `f/*.png` |
| 6 | Children in kilts turned away again and again | Not fixed: 10 child turn-aways in 6 runs; girl_school_kilt by both trains at Hillhead and Govan; girl_small now too. | `v/aw_*.log` |
| 7 | Phone hand and shopper in the phone pose | **Phone hand fixed.** Shopper: not a game fault. | `h/C2.png`, `h/T3.png` |
| 8 | Jam stop-start | **Worse:** 50 toggles a minute (sum_crop_bike) and 37 (woman_scarf) at Buchanan Street, 35 (ya_smile_halter) at St Enoch inner. Contact-foot travel over 3 cm while paused: 31 and 26 episodes (was 15 and 29). 5 of them near and over 10 cm at Buchanan Street (woman_scarf 46 cm at 3.6 m). That measure counts a low swing too, and `skid2.py` saw no near skid there, so I count the toggling, not the slides. | `pz/p_bs.log`, `pz/p_se.log` |
| 9 | Same people turned away from train after train | Not fixed: adult_cap_baggy (2 runs), girl_school_kilt, ya_fedora, woman_mini, ya_tattoo_tank, sum_chino_shorts_m. | `v/aw_*.log` |
| 10 | woman_puffer's shorts, cap hair, woman_mini's hair | Unchanged in the viewer. Cap hair is a block, not through the cap. | `n/G.png`, `n/HC.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.08 (typical 8.8, worst 7.0)
Instrument (all 99 people, 5 speeds): 9.46 (was 9.47). LEG 7.8 (p10 6.1), SMO p10 7.2, adult_heel_boots @1.9 = 7.9, TRN 9.8 (p10 9.6, was 9.9).

In the game:
- No near one-tick jumps over 30 cm in 6 runs.
- Quick first steps reduced to 4-20 per 100 s.
- No near skids.

Worst tenth:
- The heel wearers' crouch (`n/BW.png`).
- Stop-start in jams at up to 50 a minute.
- Far-model foot pops of 34-57 cm and a 61 cm slide at 40-100 m (small on screen).

### 3.2 Arms and hands: 8.32 (typical 8.8, worst 7.6)
Good:
- Phone hands now hold the phone (`h/C2.png`, `h/T3.png`).
- No hand on another rider in 5 rides.

Worst tenth:
- Pole grips: median 1.9 cm, max 5.8 cm, 2 of 39 over 4 cm (Ibrox inner ride, `c/cw.log`).
- Texting phones held flat at the waist, a little above the fingers.
- Standers at eye height reaching to door panels for a "rail" (`e/EYE.png`, woman_mini).

### 3.3 Faces: 7.88 (typical 8.4, worst 7.1)
I looked at 18 faces not on reviews 34-36's lists, neutral and smiling (`f/N.png`, `f/S.png`; ids in `f/ids.txt`), 12 known problem faces (`f/A.png`, `f/AS.png`), and all 30 at 3 m (`f/FAR.png`).

Better:
- Brows are whole.

Faults:
- **Twins.** Four pale faces under the same red bob: woman_bob, woman_sash, ya_ginger_long, ya_winter. man_longcoat, man_elder and adult_tophat share one face.
- **Lopsided smiles.** Smirks on ya_tattoo_tank, teen_runner, woman_student, adult_tophat and ya_smile_polo. A twisted smile on man_student. A crooked mouth at rest on ya_ginger_braid and adult_smile_blouse.
- **Sullen mouths.** Many neutral faces have a down-turned pout (elder_woman_coat, man_puffer, teen_skater).
- **Ragged hairlines:** ya_spiky (a pale notch), sum_shorts_asian_m, teen_skater.
- **Eyes and lips:** elder_shorts squints; man_longcoat and man_elder have heavy lids; girl_small has a pouted lip.

### 3.4 Standing, sitting, behaviour: 8.40 (typical 9.0, worst 7.5)
Good:
- No interpenetrating standers.
- No duplicates (`ndup 0` in three 200 s runs).
- No far model within 6 m (`lod6 0`).
- One one-sample platform overlap a run.
- Turned-away boarders end 1.5 m or more from the edge, except woman_mini, still walking back at 0.84 m from the edge when the run ended (4 retries, Cowcaddens).
- The haggis stands on the floor on its lead (1.02-1.1 m) on two platforms (`e/pet_*_ok.png`).

Worst tenth:
- The player blocked for 47-56 s in one car on 4 of 6 walks (St Enoch outer ride; rerun 6 of 6 fine; Hillhead 6 of 6).
- girl_small standing alone for about 95 s.
- Jam toggling up to 50 a minute.
- The same people turned away from both trains.
- The garment split at eye height (`e/EYE.png`: 4 of 7 standers in skirts or dresses).

### 3.5 Range of people: 8.16 (typical 8.6, worst 7.5)
- Roster unchanged (99).
- In cars, routed children sit or stand by a standing grown-up, but girl_small was left alone standing.
- Children turned away 10 times in 6 runs; they then wait on the platform.
- The near-identical red bobs (four of them) narrow the range seen in a crowd.

### 3.6 Clothing: 7.68 (typical 8.4, worst 6.6)
Census:

| run | scope | samples over half one garment | worst |
|---|---|---|---|
| St Enoch inner ride | saloon | 0 of 20 | 44 % trousers |
| Cowcaddens outer ride | saloon | 0 of 20 | 46 % trousers |
| Partick outer explore | platform / all within 15 m | 0 of 20 | 43 % |
| Ibrox inner ride | per car | 0 of 44 | 50 % |

- The two newly seated dresses are wrong at 1.1-1.6 m (claim 6). It is the person a seated rider looks straight at.
- Every skirt and kilt still stands.
- Unchanged: notched pencil and midi hems in the stride, woman_puffer's shorts, the kilt-knee fault from review 36 (not seen in this phase).

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- 6 bag kinds on two new bodies (adult_harem, teen_skater), standing, walking and seated (`b/B.png`): held, worn or set at the feet correctly. The suitcase is towed on its wheels. A long-haired woman's rucksack becomes a tote.
- Review 36's raised shopper is a viewer artefact.
- The haggis is fine on platforms; it was not on stairs in my three stair runs.
- Worst tenth: bags at the feet of seated riders sit close to the shoe (`b/B.png`, sit column).

### 3.8 Whole bodies: 8.02 (typical 8.5, worst 7.3)
- elder_woman_dress seated, bare to the crotch from across the aisle.
- ya_smile_dress's red hem disc under the seat.
- woman_mini's hair slab; ragged hairlines.
- The far model reads well at platform distance (`l/L.png`) and is never used within 6 m.

## 4. Top ten defects, in priority order

1. **Seated dresses break.** elder_woman_dress: the skirt rides to the hip and splays in stiff flaps, thighs bare to the crotch. ya_smile_dress: the hem hangs as a red half-disc below the seat front; open lap and a torn hem in `sit_cross_legs` (viewer). Seen in 3 of 3 rides, from a standing rider and from the seat opposite.
   - Reproduce: `node gsd.mjs "mode=ride&q=high&line=outer&station=ibrox" sd/outer_ibrox 240`
   - Viewer: `ANGS='[["F",3.14,0.05],["Q",2.4,0.3],["S",1.57,0.05],["L",3.14,0.45]]' node shoot2.mjs 0 ya_smile_dress none clip-sit-0-30,clip-sitphone-0-30,clip-sitalt-0-30,clip-sitalt-1-30 n/sd legs`
2. **Brisk-walk crouch** (LEG 7.8, p10 6.1; SMO p10 7.2; adult_heel_boots @1.9 = 7.9).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
3. **The player held in a car for most of a minute.** At St Enoch outer, the dir +1 walk stopped at z 9.01 for 55.8 s at t 20, 70 and 130, and dir -1 stopped at 8.79 for 46.8 s. The blocker was adult_oxford_shirt, standing at x -0.14 with a carrier bag, with teen_crop_leggings seated across. 1 ride in 3.
   - Reproduce: `node gwalk.mjs "mode=ride&q=high&line=outer&station=st-enoch" c/wk` (look for `done:false`); `c/wk.log`.
4. **Faces.**
   - Four red-bob twins (woman_bob, woman_sash, ya_ginger_long, ya_winter).
   - One face on man_longcoat, man_elder and adult_tophat.
   - Lopsided smirks and crooked mouths at rest.
   - Reproduce: `node face3.mjs <ids> f/n "0:0" 0 8611 "" 14`; `DIST=3` for 3 m.
5. **Who sits.** No skirt or kilt sits (14 people), so a car's standers are mostly skirts: 27 of 33 standing samples at Cowcaddens outer.
   - Reproduce: `node gp8.mjs "mode=ride&q=high&line=outer&station=cowcaddens" g/pb 200; python3 who.py g/pb.json`
6. **Children turned away, and a child left alone.**
   - 10 child turn-aways in six 300 s runs (girl_school_kilt by both trains at Hillhead and Govan).
   - girl_small stood about 95 s with no grown-up standing near after woman_midi alighted (Cowcaddens inner ride).
   - Reproduce: `node gaway5.mjs "mode=explore&q=high&line=outer&station=govan" 300`; `node gkid2.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 200`
7. **Jam stop-start, worse:** 50 toggles a minute (sum_crop_bike, Buchanan Street outer), 35 (ya_smile_halter, St Enoch inner).
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`
8. **The same people turned away from train after train** (4 of 6 runs).
   - Reproduce: as item 6; read `REPEATS`.
9. **Garment faults in the stride:** notched pencil and midi hems (woman_coat, woman_midi); woman_puffer's blotchy shorts; the kilt knee (review 36).
   - Reproduce: `ANGS='[["F",2.8,0.1],["S",1.9,0.1]]' node shoot2.mjs 0 man_highland,woman_midi,woman_coat,adult_beret,teen_skirt,woman_puffer none walk@162 n/g legs`
10. **Grips and small hand faults.** Pole grip max 5.8 cm (2 of 39 over 4 cm); texting phone flat at the waist and floating over the fingers; woman_mini's hair slab.
    - Reproduce: `node gcar2.mjs "mode=ride&q=high&line=inner&station=ibrox" c/cw 150`; `KIND=text DIST=0.5 N=5 node gcall2.mjs h/t3`

## 5. What I could not observe

- **No motion watched.** The first steps come from bones every 1/30 s; no rendered sequence this round.
- **The seated dresses in `sit_look` and `sit_cross_legs` in the game.** Both women were never put in them in my 3 rides; the viewer shows a torn hem in `sit_cross_legs`.
- **The cause of the blocked walk.** A rerun did not reproduce it, and my probe (`gblock.mjs`) passed.
- **The haggis on stairs:** not seen this round.
- **Blink and smile timing** in play.
- **Whether the paused-foot "slides" are slides or low swings:** `gpause` counts both.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | St Enoch inner x2, Buchanan Street outer, Partick inner (explore); Kelvinbridge outer and Partick inner rides (100 s each) | `sl/*.json`, `jump.py`, `flick.py`, `skid2.py` |
| Brisk walk at 1.8 m/s, 6 phases | adult_heel_boots, ya_tube_heels | `n/BW.png` |
| Seated dresses, all 4 sit clips, 4 views | ya_smile_dress, elder_woman_dress (viewer); and standing | `n/SD.png`, `n/SE.png`, `n/ST.png` |
| Seated dresses in the game, from standing and opposite eye height | Ibrox outer, Partick inner, Cowcaddens outer rides | `sd/IBX.png`, `sd/COW.png`, `sd/zoom.png` |
| Garments in the stride | man_highland, woman_midi, woman_coat, adult_beret, teen_skirt, woman_puffer | `n/G.png` |
| Faces neutral, smiling, 3 m | 18 new + 12 problem faces | `f/N.png`, `f/S.png`, `f/A.png`, `f/AS.png`, `f/FAR.png` |
| Hair from behind and under caps | woman_mini, adult_sport_cap, adult_camo_cap, boy_cap, elder_man_cap, adult_cap_baggy | `n/HC.png` |
| Phone hands in the game | 10 callers and 15 texters at St Enoch | `h/C2.png`, `h/CALL.png`, `h/T3.png`, `h/TEXT.png` |
| Bags: 6 kinds x stand, walk, sit | adult_harem, teen_skater | `b/B.png` |
| Far model, stand and walk | ya_ginger_long, adult_harem, elder_woman_dress, man_highland, teen_skater, girl_small | `l/L.png` |
| Turned-away boarders | Cowcaddens inner x2, Ibrox inner, Govan outer, Hillhead inner, St Enoch outer (300 s each) | `v/aw_*.log` |
| Children in cars | Cowcaddens inner, Govan inner, Hillhead outer, St Enoch outer rides | `k/kid2_*.log` |
| Hands, knees and hips between riders | Partick outer x2, Govan inner, Kelvinhall outer, Cowcaddens inner rides | `e/n6_*.log` |
| Census, overlaps, far within 6 m, duplicates, who sits | St Enoch inner ride, Cowcaddens outer ride, Partick outer explore (200 s) | `g/*.json`, `cen4.py`, `who.py` |
| Grips and per-car mix | Ibrox inner ride, 150 s | `c/cw.log` |
| Player walks through full trains | St Enoch outer x2, Hillhead inner rides | `c/wk.log`, `c/wk3.log`, `c/wk2.log`, `c/blk_*.png` |
| Eye height in a car | Ibrox outer ride, 7 standers | `e/EYE.png` |
| The haggis | Partick outer and Ibrox inner rides; stairs at Hillhead, Buchanan Street, St Enoch (not seen) | `e/pet_*`, `e/st_*.log` |
| Jam pauses | Buchanan Street outer and St Enoch inner, 200 s | `pz/*.log` |

Next round, look at:
- a seated dress fix in all four sit clips, from the seat opposite;
- the blocked walk at St Enoch outer;
- children left standing after their grown-up alights;
- stop-start in jams.

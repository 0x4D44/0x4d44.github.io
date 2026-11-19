# Under Glasgow: independent review of the people (review 38)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `24188585`. Commits since review 37 that touch the people (read-only `git diff 709e0a71 24188585 -- glasgow-subway`):
- `people.js`:
  - `_canSit` refuses `ya_smile_dress` and `elder_woman_dress` again;
  - a paused walker walks on after `pauseT > 1.5` s (was 0.8).
- `index.js`: a standing child is sorted first among the leavers (`k - 100`) and is not held back by the leaver count or by either garment-mix check.
- `people.glb` and `people_lod.glb` rebuilt with new looks for `woman_sash`, `ya_winter`, `man_elder` and `adult_tophat`, plus matching `armfit.js`, `legradii.js` and skin-budget changes (`woman_sash` lost its `sit_phone` arm entry).

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review38/`. The container restarted mid-review. I re-ran the interrupted part (the rest of runB and `gp8` Cowcaddens outer) and ran the slide and instrument batches after the restart. I deleted the instrument recording after scoring; `m/items.log` holds the result. Running notes: `NOTES.md`.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.16 (8.158). Gate NOT met.**
- At 8 or above (six categories): Behaviour 8.52, Luggage 8.36, Arms 8.32, Range 8.20, Walking 8.16, Whole bodies 8.12.
- Below 8: Faces 7.98, Clothing 7.80.

In short:
- **Claims 1 and 2 hold.**
  - Neither dress sat in three game runs, so the broken seated dresses are gone.
  - No child was left standing alone in five rides.
- **Claim 3 mostly holds.** Total stop-starts are down about half, but one walker still toggled 3 times in 3.8 s (47 a minute).
- **Claim 4 is half true.** The four rebuilt people no longer look like the people they used to resemble, but:
  - `ya_winter` now shows scalp through her crown;
  - two lookalike groups of three remain: the red bobs `woman_bob`, `ya_ginger_long` and `adult_beret`, and the grey-haired men in suits `man_longcoat`, `elder_man_suit` and `adult_tie_suit`.
- **The cost of claim 1:** with every skirt, dress and kilt standing again, the people standing in a car are mostly in skirts (7 of the 9 standers at eye height in an Ibrox inner ride).
- **New:**
  - The Hillhead inner platform had more than half of its people in one garment group (trousers, which here includes jeans) in 19 of 20 samples.
  - Children are still turned away: 8 times in 4 runs, 5 of them at Govan outer.
- **Fixed since review 37:** the player walked the length of a full train in all 18 tries (two St Enoch outer rides and one Partick inner ride). In review 37 the player was held for about a minute in 1 ride of 3.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.6 | **8.32** |
| 3 | Faces | 10 | 8.5 | 7.2 | **7.98** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.8 | **8.52** |
| 5 | Range of people | 10 | 8.6 | 7.6 | **8.20** |
| 6 | Clothing | 15 | 8.4 | 6.9 | **7.80** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.6 | 7.4 | **8.12** |
| | **Weighted mean** | 100 | | | **8.16** (8.158) |

0.20x8.16 + 0.10x8.32 + 0.10x7.98 + 0.10x8.52 + 0.10x8.20 + 0.15x7.80 + 0.10x8.36 + 0.15x8.12 = 1.632 + 0.832 + 0.798 + 0.852 + 0.820 + 1.170 + 0.836 + 1.218 = 8.158.

Changes against review 37 (8.083):
- **Walking +0.08.** About half as many stop-starts in jams. The instrument is unchanged (9.46) and so is the crouch.
- **Arms 0.** Grips slightly tighter (pole max 3.6 cm). The texting phone is unchanged.
- **Faces +0.10.** Four people now have faces of their own, but two lookalike groups of three remain, along with the smirks and pouts.
- **Behaviour +0.12.** The player is no longer held in a car, and no child is left standing alone. People are still turned away by train after train.
- **Range +0.04.** No child left alone in a car, but child turn-aways are unchanged.
- **Clothing +0.12.** The broken seated dresses are gone because the dresses stand again. That brings back the split by garment (seated people in trousers and shorts, standing people in skirts) and one platform over half in one group.
- **Luggage 0.**
- **Whole bodies +0.10.** The bare seated lap is gone; `ya_winter`'s crown shows scalp.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `ya_smile_dress` and `elder_woman_dress` stand again | **True.**<br>- `who.py`: dress samples 22 standing, 0 seated (St Enoch inner ride); 10 standing, 0 seated (Cowcaddens outer ride); 7 standing, 0 seated (Hillhead inner explore).<br>- The seated-dress faults of review 37 cannot happen now.<br>- **But no skirt, dress or highland kilt sits at all.** Standing samples that are skirts, dresses or kilts: 35 of 51 (St Enoch inner), 30 of 73 (Cowcaddens outer).<br>- At eye height in an Ibrox inner ride, 7 of the 9 standers wear skirts, dresses or kilts (`e/EYE.png`). | `g/pa.json`, `g/pb.json`, `g/se.json`, `e/EYE.png` |
| 2 | A standing child gets off at the next stop | **True in 5 of 5 rides** (`gkid2.mjs`, 200 s each: Cowcaddens inner, Hillhead outer, Govan inner, St Enoch outer, Partick inner).<br>- At Hillhead outer, `girl_small` stood beside `adult_piper` at the pole for 0.78 m until t 112, then got off.<br>- The other standing children are risers at a stop (t 104-117), standing for 5-15 s before they leave.<br>- One rising girl was 3.1 m from the nearest grown-up for one sample (Hillhead outer, t 116). | `k/kid2_*.log` |
| 3 | A paused walker walks on after 1.5 s; worst 30 toggles a minute; 348 frozen-walk frames | **Mostly true.**<br>- Buchanan Street outer, 200 s: the top eight walkers toggled 20 times in all (review 37: 49); frozen-walk frames 282 (review 37: 558).<br>- St Enoch inner: 25 (40); frozen frames 329 (393).<br>- **Worst walker:** `woman_bob` toggled 3 times in 3.8 s at Buchanan Street, 47 a minute over that window. At St Enoch, `teen_hood` toggled 5 times in 8.6 s (35 a minute). The builder's 30 is not what I measured, though the windows are short.<br>- Paused-foot moves over 10 cm on near models: 2 at Buchanan Street, 15 at St Enoch (`teen_ginger` 53 cm at 2.9 m). This measure also counts low swings, and `skid2.py` found no near skids, so I count the toggling, not the slides. | `pz/p_bs.log`, `pz/p_se.log` |
| 4 | Lookalikes made distinct | **Half true.**<br>- `woman_sash` is now a freckled brunette with brown eyes; `ya_winter` a blonde; `man_elder` grey and bearded; `adult_tophat` an older Black man with grey brows. Each is distinct (`f/C.png`, `f/CS.png`, `f/CF.png`).<br>- **New fault:** `ya_winter` shows two pink patches of scalp through her parting and crown, seen from the front at 30 degrees above and from above (`f/winter_top.png`, `n/HAIR.png`). `woman_sash` has small scalp specks in the crown of her bob.<br>- **Lookalikes left** (`f/TW.png`, `f/ALLs.png`): `woman_bob` and `ya_ginger_long` are still the same pale, green-eyed face under the same red bob (also at 3 m, `f/CF.png`); `adult_beret` is a third under a beret. `man_longcoat`, `elder_man_suit` and `adult_tie_suit` are three grey-haired, blue-eyed men in dark suits with one face. | `f/*.png`, `n/HAIR.png` |
| 5 | Not changed | **Confirmed.**<br>- Crouch: `n/BW.png`; instrument LEG 7.8 (p10 6.1).<br>- Kilt slit at the knee and the floating sporran; notched hems on `woman_midi`, `woman_coat` and `ya_smile_dress`; `woman_puffer`'s blotchy shorts (`n/G.png`).<br>- `woman_mini`'s black hair slab and the squared hair blocks under caps (`n/HC.png`).<br>- Texting phone flat at the waist, floating over the fingers (`h/T3.png`).<br>- Repeat turn-aways (`v/aw_*.log`).<br>- Lopsided smiles and sullen pouts (`f/TW.png`).<br>- **The player held in an aisle did not happen:** 18 of 18 walks completed. | as listed |

## 2. Status of REVIEW_37's top ten

| # | REVIEW_37 item | Now | Evidence |
|---|---|---|---|
| 1 | Seated dresses break | **Gone, by standing the dresses**, which brings back item 5. | `g/*.json` |
| 2 | Brisk-walk crouch | Not fixed (LEG 7.8, p10 6.1; `adult_heel_boots` @1.9 = 7.9). | `n/BW.png`, `m/items.log` |
| 3 | Player held in a car | **Not seen:** 6 of 6 walks done in each of two St Enoch outer rides and one Partick inner ride. | `c/wk.log`, `c/wk3.log`, `c/wk2.log` |
| 4 | Faces: lookalikes, smirks | Four people changed. Two lookalike groups of three remain; smirks unchanged; new scalp patches on `ya_winter`. | `f/*.png` |
| 5 | Who sits (no skirt or kilt sits) | **Worse again:** now no dress sits either. 7 of 9 standers at eye height wear skirts, dresses or kilts. | `e/EYE.png`, `g/*.json` |
| 6 | Children turned away; a child left alone | **Child left alone fixed.** Turn-aways not fixed: 8 in 4 runs (Govan outer 5, with `girl_small` and `girl_school_kilt` turned away by both trains). | `k/*`, `v/aw_*.log` |
| 7 | Jam stop-start | **Improved:** total toggles roughly halved. The worst short run is still 35-47 a minute. | `pz/*.log` |
| 8 | Same people turned away from train after train | Not fixed: `ya_fedora`, `girl_small` and `girl_school_kilt` at Govan; `adult_cap_baggy` at St Enoch. | `v/aw_*.log` |
| 9 | Garment faults in the stride | Unchanged. | `n/G.png` |
| 10 | Grips, texting phone, `woman_mini`'s hair | Grips better (pole max 3.6 cm, rail 5.6 cm, 1 of 66 over 4 cm). Phone and hair unchanged. | `c/cw.log`, `h/T3.png`, `n/HC.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
Instrument (all 99 people, 5 speeds): 9.46, the same as review 37. LEG 7.8 (p10 6.1), SMO p10 7.2, TRN 9.8 (p10 9.6).

In the game, foot bones every 1/30 s for 100 s at St Enoch inner, Buchanan Street outer and a Kelvinbridge inner ride:
- One-tick foot moves over 30 cm: none on a near model. The only one was `teen_hood` idling on the far model at 104 m.
- Fast first steps per 100 s: 13, 24 and 10. Near ones peaking over 20 cm: 0, 1 (`woman_mini`, 22 cm at 7.6 m) and 0.
- Skids over 5 cm: `adult_heel_boots`' ankle three times at St Enoch (the case review 37 measured on the far model at 14 m), and `man_kilt_casual` at 108 m.

Worst tenth:
- The heel wearers' crouch at a brisk walk.
- Short bursts of stop-start in jams (47 and 35 a minute).

### 3.2 Arms and hands: 8.32 (typical 8.8, worst 7.6)
Good:
- No hand on another rider in two rides.
- Pole grips median 1.7 cm, max 3.6 cm; rail max 5.6 cm.
- The pole grip reads right at eye height (`e/eye_elder_woman_dress_*_near.png`).

Worst tenth:
- Texting phones held flat at waist height, seen edge-on as a thin bar hovering above the fingers (`h/T3.png`: 6 of 6 texters).
- `sit_look` is an arm held out sideways, palm up, in mid-air (`n/ST.png`, column 4).

### 3.3 Faces: 7.98 (typical 8.5, worst 7.2)
I looked at all 99 faces at 1.6 m (`f/ALLs.png`), 25 at 0.85 m (`f/C.png`, `f/TW.png`), the changed four smiling (`f/CS.png`) and the changed four at 3 m (`f/CF.png`).

Better:
- The four rebuilt people are distinct and read as their age, sex and origin.

Faults:
- **Lookalikes.** Three pale red bobs (`woman_bob`, `ya_ginger_long`, `adult_beret`). Three grey men in suits with one face (`man_longcoat`, `elder_man_suit`, `adult_tie_suit`). `woman_midi` and `ya_tube_heels` share a pale face under a black bob.
- **Many pale black-haired young faces** look alike across the roster (`f/ALLs.png`).
- **Smirks and crooked mouths:** `ya_ginger_long`, `ya_ginger_braid` and `man_elder` smiling.
- **Pouts at rest:** `woman_midi`, `teen_hood` (`teen_boy`'s mouth is also a pout).
- **A dark smudge under one eye** on `teen_boy`.

### 3.4 Standing, sitting, behaviour: 8.52 (typical 9.0, worst 7.8)
Good:
- The player crosses full trains 18 of 18 times.
- No overlapping standers or duplicates, and no far model within 6 m (`lod6 0`, `ndup 0`, `nov 0`) in three 200 s runs.
- Hands, hips and knees between riders clear in two rides.
- Seated riders sit in the seat from all three views (`sd/KB.png`).
- The haggis stands on the platform floor on its lead, and sits at its seated owner's feet in a car (`e/PET.png`).

Worst tenth:
- The same people turned away by train after train (3 at Govan).
- Bursts of stop-start in jams.
- At Hillhead, 9 crowd samples within 0.6 m of the platform edge (none in the other runs).

### 3.5 Range of people: 8.20 (typical 8.6, worst 7.6)
- Roster unchanged: 99 people (37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff), with a spread of skin tones.
- Children in cars sit, or stand beside a grown-up and leave with them.
- Still, 8 child turn-aways in 4 runs: `girl_small` and `girl_school_kilt` are turned away by both trains at Govan outer and wait on the platform.
- Lookalike groups narrow the range seen in a crowd.

### 3.6 Clothing: 7.80 (typical 8.4, worst 6.9)
Census (`cen4.py`, samples with over half of the people in one garment group):

| run | platform | saloon | all within 15 m | per car |
|---|---|---|---|---|
| St Enoch inner ride | 0 of 8 | 6 of 20 (10 of 19 trousers, 53 %) | 5 of 20 | - |
| Cowcaddens outer ride | 0 of 9 | 0 of 20 | 0 of 20 | - |
| Hillhead inner explore | **19 of 20** (up to 8 of 13 trousers, 62 %) | 0 of 7 | 12 of 20 | - |
| Ibrox outer ride (`gcar2`) | - | - | - | 0 of 56 |

(The meta's "trousers" group includes jeans.)

Faults:
- Nobody in a skirt, dress or kilt ever sits, so cars split by garment: the seated people are in trousers, shorts and leggings and the standing people are in skirts (`e/EYE.png`).
- Unchanged stride faults: the kilt slit at the knee and the sporran set on the apron; notched hems on `woman_midi`, `woman_coat` and `ya_smile_dress`; `woman_puffer`'s blotchy shorts (`n/G.png`).

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- Not changed since review 37: bags are held or worn correctly, and cases and trolleys are set at the feet of seated riders (`sd/KB.png`: blue holdall, pink trolley case).
- The haggis is fine on the platform and in a car. I did not see it on stairs (the stair probes logged nothing).
- Worst tenth: bags set close against the shoe of seated riders.

### 3.8 Whole bodies: 8.12 (typical 8.6, worst 7.4)
Good:
- The bare seated lap of review 37 is gone.
- The far model reads well at 3.6 m for the rebuilt `adult_tophat` and `ya_winter` and for `man_highland`, `teen_hood` and `elder_woman_dress` (`l/L.png`), and is never used within 6 m.

Faults:
- **New:** `ya_winter`'s scalp shows through her crown in two patches, seen from slightly above. A standing rider looks down on her that way when she is shorter or seated.
- `woman_sash`'s small scalp specks.
- `woman_mini`'s flat hair slab.
- Squared hair blocks under caps.
- `ya_winter`'s coat hem hangs as a stiff bell.

## 4. Top ten defects, in priority order

1. **Who sits: every skirt, dress and kilt stands.** In a car the seated people are in trousers, shorts and leggings and the standing people are in skirts: 7 of 9 standers at eye height (Ibrox inner ride); 35 of 51 standing samples at St Enoch inner. The cure needs seated skirts that do not break, not more refusals.
   - Reproduce: `node gp8.mjs "mode=ride&q=high&line=inner&station=st-enoch" g/pa 200; python3 who.py g/pa.json`
   - Eye height: `node geye2.mjs "mode=ride&q=high&line=inner&station=ibrox" e/eye 40 6`
2. **Brisk-walk crouch** (LEG 7.8, p10 6.1; SMO p10 7.2; `adult_heel_boots` @1.9 = 7.9).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots,ya_tube_heels none walk@150,walk@156,walk@162,walk@168,walk@174,walk@180 n/bw body 1.8`
3. **Lookalike faces and new scalp holes.**
   - Red-bob trio: `woman_bob`, `ya_ginger_long`, `adult_beret`. Grey suited trio: `man_longcoat`, `elder_man_suit`, `adult_tie_suit`.
   - `ya_winter`'s crown shows scalp in two patches; `woman_sash` has scalp specks.
   - Reproduce: `DIST=0.85 node face3.mjs woman_bob,ya_ginger_long,adult_beret,man_longcoat,elder_man_suit,adult_tie_suit f/tw "0:0" 0 8611 "" 14`
   - Hair: `ANGS='[["F",3.14,0.5],["T",3.14,1.2]]' FD=1.0 node shoot2.mjs 0 ya_winter,woman_sash none stand n/hair face`
4. **Platform garment mix over half.** Hillhead inner platform: trousers over half in 19 of 20 samples (up to 62 %). The St Enoch inner saloon is at 53 % for 6 samples.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=hillhead" g/se 200; python3 cen4.py g/se.json`
5. **Children turned away:** 8 times in 4 runs; `girl_small` and `girl_school_kilt` by both trains at Govan outer.
   - Reproduce: `node gaway5.mjs "mode=explore&q=high&line=outer&station=govan" 300`
6. **The same people turned away train after train:** `ya_fedora`, `girl_small`, `girl_school_kilt` (Govan); `adult_cap_baggy` (St Enoch).
   - Reproduce: as item 5; read `REPEATS`.
7. **Garment faults in the stride:** the kilt slit at the knee and the sporran set on the apron; notched hems (`woman_midi`, `woman_coat`, `ya_smile_dress`); `woman_puffer`'s blotchy shorts.
   - Reproduce: `ANGS='[["F",2.8,0.1],["S",1.9,0.1]]' node shoot2.mjs 0 man_highland,woman_midi,woman_coat,adult_beret,teen_skirt,woman_puffer,ya_smile_dress,elder_woman_dress none walk@162 n/g legs`
8. **Jam stop-start bursts:** 3 toggles in 3.8 s (`woman_bob`, Buchanan Street outer); 5 in 8.6 s (`teen_hood`, St Enoch inner).
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=buchanan-street" 200`
9. **Texting phone** flat at the waist, a bar floating over the fingers (6 of 6).
   - Reproduce: `KIND=text DIST=0.5 N=6 node gcall2.mjs h/t3`
10. **Hair:** `woman_mini`'s black slab from behind; squared hair blocks under caps (`adult_sport_cap`, `boy_cap`).
    - Reproduce: `ANGS='[["B",0,0.15],["Q",0.8,0.2]]' FD=0.9 node shoot2.mjs 0 woman_mini,adult_sport_cap,boy_cap none stand n/hc face`

## 5. What I could not observe

- **No motion watched.** Motion was judged from bones every 1/30 s and from stills.
- **The haggis on stairs.** The stair probes at Hillhead inner and Buchanan Street outer logged nothing.
- **Blink and smile timing** in play.
- **Whether the paused-foot moves are slides or low swings:** `gpause` counts both.
- **`ya_winter` seated in the game** seen from above. The scalp patch was seen in the viewer only; she stood at a pole in my rides.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument | all 99, 5 speeds | `m/items.log` |
| Foot bones every 1/30 s | St Enoch inner, Buchanan Street outer (explore); Kelvinbridge inner ride (100 s each) | `sl/*.json`, `jump.py`, `flick.py`, `skid2.py` |
| Brisk walk at 1.8 m/s, 6 phases | `adult_heel_boots`, `ya_tube_heels`, `man_commuter` | `n/BW.png` |
| Garments in the stride | 8 skirt, dress and kilt wearers | `n/G.png` |
| All 4 sit clips, 2 views | 6 people the game seats (shorts, Lycra, heels) | `n/ST.png` |
| Seated in the game, 3 views | Kelvinbridge inner ride, 6 riders incl. 3 children | `sd/KB.png` |
| Faces | all 99 at 1.6 m; 25 at 0.85 m; the changed 4 neutral, smiling and at 3 m | `f/ALLs.png`, `f/TW.png`, `f/C.png`, `f/CS.png`, `f/CF.png` |
| Hair from above and behind | `ya_winter`, `woman_sash`, `man_elder`, `adult_tophat`, `woman_mini`, `adult_sport_cap`, `boy_cap` | `n/HAIR.png`, `n/HC.png` |
| Far model | the changed 4 plus `man_highland`, `teen_hood`, `elder_woman_dress`, stand and walk | `n/HAIRL.png`, `l/L.png` |
| Texting hands in the game | 6 texters, St Enoch | `h/T3.png` |
| Turned-away boarders | Govan outer, Hillhead inner, Cowcaddens inner, St Enoch outer (300 s each) | `v/aw_*.log` |
| Children in cars | Cowcaddens inner, Hillhead outer, Govan inner, St Enoch outer, Partick inner rides | `k/kid2_*.log` |
| Hands, knees and hips between riders | Partick outer, Kelvinhall inner rides | `e/n6_*.log` |
| Census, overlaps, far within 6 m, duplicates, who sits | St Enoch inner ride, Cowcaddens outer ride, Hillhead inner explore (200 s) | `g/*.json`, `cen4.py`, `who.py` |
| Grips and per-car mix | Ibrox outer ride, 150 s | `c/cw.log` |
| Player walks through full trains | St Enoch outer x2, Partick inner rides | `c/wk*.log` |
| Eye height in a car | Ibrox inner ride, 6 standers | `e/EYE.png` |
| The haggis | Partick outer ride (platform); Ibrox inner (in a car, seated owner) | `e/PET.png`, `e/pet_*.log` |
| Jam pauses | Buchanan Street outer and St Enoch inner, 200 s | `pz/*.log` |

Next round, look at:
- a seated skirt or dress that holds up in all four sit clips;
- platform garment mix at other stations;
- children at Govan outer;
- `ya_winter` seated, seen from a standing rider.

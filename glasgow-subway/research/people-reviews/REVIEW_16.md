# Under Glasgow: independent review of the people (review 16)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `ba440214`. The changes since review 15 are in `c5606b8d` (pole grips follow the bend and close; garment mix never over half a car), `e0eb886a` (floor totes, carriers, shoppers and handbags turned to face their owner), `93913466` and `00d9c6b6` (no face target slides the mouth or nose; people.glb and people_lod.glb rebuilt; standing riders off the middle; walker tries the other side). I read the diffs read-only. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited.

**Result: weighted mean 7.62 (7.616). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Three categories reach 8: Arms and hands (8.10), Standing/sitting/behaviour (8.02) and Luggage (8.24). Five are below 8. Faces is up to 7.48 but still among them.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review16/`. Viewer stills: `_F` front quarter, `_S` side, `_B` back quarter. The raw walking recordings (`m/rec`, 540 MB) were deleted after scoring; `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.3 | 6.0 | **7.38** |
| 2 | Arms and hands | 10 | 8.7 | 7.2 | **8.10** |
| 3 | Faces | 10 | 8.0 | 6.7 | **7.48** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.0 | **8.02** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.2 | 6.2 | **7.40** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.0 | 6.0 | **7.20** |
| | **Weighted mean** | 100 | | | **7.62** (7.616) |

0.20x7.38 + 0.10x8.10 + 0.10x7.48 + 0.10x8.02 + 0.10x7.66 + 0.15x7.40 + 0.10x8.24 + 0.15x7.20 = 1.476 + 0.810 + 0.748 + 0.802 + 0.766 + 1.110 + 0.824 + 1.080 = 7.616.

In one line: the same total as review 15, with the gains and losses in different places. Three fixes are real. The per-car garment mix now holds: 0 of 165 car-samples over half, against 41 of 180. Mouths are centred. More pole hands close round the pole. Against that:
- the platform crowd near the player still goes over half one garment in 13 of 65 census samples (up to 67 %);
- the player's walk through a full train still stalls for 30-55 s in 6 of 36 walks;
- seated women's skirts and dresses I had not looked at before have holes with the knee through them (woman_sash, woman_midi);
- walking is unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Pole grips aim at the pole where it is at hand height, and the hand closes round it. Grip to pole 0.2-3.1 cm. Gangway poles not held. Holders >= 0.2 m off the middle. Fewer hold on | **True by the measure; only partly true to the eye.** With review 15's polyline probe on three rides (Shields Road outer, Govan inner, Cessnock outer), the pole clip is at 0.2-9.3 cm, median 1.2-2.2 cm. The rail clip is at 0.5-5.4 cm. Only 6 of 162 holder-samples are over 4 cm. The pole is 1.9 cm in radius, so a finger-bone median of 1-2 cm puts the fingers at, or a little inside, the pole surface. About 54 % of standing riders hold on (140 of 257 samples). Close-ups of 14 holders on three rides: about 6 wrap the pole properly (boy_kilt, girl_shorts, teen_girl, ya_ginger_braid, elder_woman_coat, girl_ginger). About 3 hold it partly (adult_tie_suit, teen_girl at Shields Road). About 5 still show an open hand with the fingers up beside the pole, or splayed in front of it: sum_tee_leggings, adult_baggy_knit, man_beard and sum_crop_bike on the pole clip; adult_leggings_knit on the rail clip, flat-palmed. The bad ones are the high grips, where the hand bone is 2.15-2.3 m up in the car frame. At eye height, 1.1-2.5 m away, holders read as holding (`e/KB.png`). | `c/sr.log`, `c/gv.log`, `c/ce.log`, `p/H.png`, `p/SR.png`, `e/KB.png` |
| 2 | Garment mix: no group over half a car | **True for cars; not for the crowd near the player.** gcar.mjs, cars with 5 or more riders: Shields Road 0 of 54, Govan 0 of 60, Cessnock 0 of 51 over half, on both 4 and 5 groups. The worst is exactly 50 %. The census of people within 15 m (`cen3.py`, 5 groups) is a different picture: **13 of 65 samples over half**, every one of them a platform crowd. Buchanan Street explore: 8 of 20, up to 67 % shorts. St Enoch ride: 5 of 22, up to 67 % trousers, and 9 of 14 at 64 %. Partick: 0 of 23. Review 15 had 23 of 86. Cars were not visibly under-filled; loads ran 4-19 a car. | `c/*.log`, `g/sen.json`, `g/bx.json`, `g/pt.json` |
| 3 | Floor totes, carriers, shoppers and handbags turned broadside to the owner's shins | **True, with a side effect.** From the opposite seat they now show their broad face (`gx/E.png`). But: (a) seen along the aisle, the same bags are now edge on, so a yellow carrier still reads as a spike (`gx/KA.png`, `gx/KA_zoom.png`); (b) the turned bag is pushed out by half its width, so its aisle-side edge is now 0-6 cm from the car's middle line (`gbagx.mjs`, Kinning Park and Ibrox). Holdalls and cases were already there. Legs in bags: Ibrox 2 one-second walk-throughs; Hillhead adult_casual5 (standing, phone_stand) with his shin in ya_tube_heels' handbag for **4 s**; Kinning Park none. Own leg in own bag 0; bag in bag 0. | `gx/E.png`, `gx/KA.png`, `gx/KA_zoom.png`, `bs/*.log` |
| 4 | Faces: mouth-trans and nose-trans no longer applied | **True; the off-centre mouths are gone.** Close-ups at 0.85 m and tighter (`f/Z.png`): sum_shorts_asian_m, ya_spiky, adult_tattoo_muscle and man_highland now have centred mouths at rest and smiling. man_highland now looks normal at rest. His smile, like adult_tattoo_muscle's and ya_spiky's, is a closed-lip V: the lower lip dips to a point at the middle. girl_ginger's smile is a wide, wavy grimace (`f/NS.png` row 3, `f/Z.png`). sum_shorts_asian_m is still soft and low-detail next to the others. The brows are jagged, cut-out black strokes on several faces. | `f/NS.png`, `f/NS2.png`, `f/Z.png` |
| 5 | Standing riders >= 0.14 m off the middle and never abreast; the walker tries the other side | **True in code; the walk through a full train still sticks.** My `gwalk.mjs` walked the whole 4-car train both ways at t = 20, 70 and 130 s on five ride loads (36 walks). **6 walks stalled for 30-55 s**, the whole 60 s budget, and failed to reach the far end. Shields Road load 1: 3 of 6, stuck at the same z both ways. Govan: 3 of 6. Shields Road load 2, Cessnock and St Enoch: 0 of 18. The blockers are two standing riders on opposite sides, 0.6-0.8 m apart along the car: ya_tube_heels (pole, x -0.21) and adult_cyclist (holdall in hand, x +0.20), 0.77 m apart; teen_tube (x 0.14) and woman_mini (x -0.19), 0.63 m apart. The "not abreast" test uses 0.6 m, so a zigzag that a walker cannot get round is allowed. | `c/wk_*.log`, `c/wk_*.json` |
| 6 | Not changed: brisk crouch, seated garments, smile shape, arm splay, skin | **True.** Instrument re-recorded on the whole roster: identical to review 15. Overall 9.44; LEG 7.6 (p10 5.2); SMO p10 6.9; worst recording adult_heel_boots @ 0.4 m/s 7.9. Seated garments: see 3.6. | `m/items.log`, `n/SK.png`, `n/SKZ.png` |

## 2. Status of REVIEW_15's top ten

| # | REVIEW_15 item | Now | Evidence |
|---|---|---|---|
| 1 | Garment mix over half | **Fixed per car** (0 of 165). **Not fixed near the player:** 13 of 65 platform census samples over half, max 67 %. | `c/*.log`, `g/*.json` |
| 2 | Brisk-walk crouch, pelvis jolts | **Not fixed** (identical numbers). | `m/items.log` |
| 3 | stand_hold_pole hand misses the slanted pole | **Mostly fixed** by the measure (median 1-2 cm). Visible open or splayed hands on about a third of close-ups, mostly the high grips. | `p/H.png`, `p/SR.png` |
| 4 | Seated garment edges | **Not fixed, and worse than thought:** woman_sash's dress and woman_midi's skirt have holes with the knee through them, seen at 2 m. | `n/SKZ.png`, `n/WS.png` |
| 5 | Faces | **Partly fixed:** centred mouths. Smiles are a closed V; girl_ginger grimaces; sum_shorts_asian_m is soft; brows are jagged; skin is doll-smooth. | `f/Z.png` |
| 6 | End-on floor bags read as slivers | **Fixed from the front, moved to the aisle view.** | `gx/E.png`, `gx/KA_zoom.png` |
| 7 | Hands at close range (rail clip, phone_stand) | **Partly:** the rail clip's palm is still flat beside the pole (adult_leggings_knit). The phone_stand fingers still cross and splay in front of the face (`f/NS.png` row 2). | `p/H.png`, `f/NS.png` |
| 8 | Arm splay on brisk walks | **Not fixed** (ARM.splay unchanged). | `m/items.log` |
| 9 | Shin in a seated rider's tote | **Better:** at most 4 s (Hillhead), against 14 s. | `bs/hh.log` |
| 10 | Small items | heel_boots 7.9 unchanged. The large case on a real stair is still not seen. | `m/items.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.38 (typical 8.3, worst 6.0)
Identical instrument result. The stills of 6 people through a stride at 1.6 m/s read as walking from the side (`w/S.png`): adult_heel_boots, elder_man_cap, teen_runner, woman_sash, man_puffer, girl_small. The brisk crouch (LEG.kneeLd 27.7 deg, kneeSt 19.9 deg; LEG p10 5.2) remains the worst tenth.

### 3.2 Arms and hands: 8.10 (typical 8.7, worst 7.2)
- Better: more hands close round the pole, and every holder reads as holding at eye height (`e/KB.png`).
- Worst tenth:
  - about a third of close-ups show an open or splayed hand beside the pole: the high pole clip, and the rail clip's flat palm (`p/H.png`, `p/SR.png`: man_beard, sum_crop_bike, sum_tee_leggings, adult_baggy_knit, adult_leggings_knit).
  - the phone_stand hands cross and splay in front of the face.
  - ARM.splay on brisk walks.

### 3.3 Faces: 7.48 (typical 8.0, worst 6.7)
24 faces at 0.85 m, and 6 closer, neutral and smiling (`f/NS.png`, `f/NS2.png`, `f/Z.png`). Mouths are centred: the review 15 fault is gone. What remains:
- V-shaped closed-lip smiles (man_highland, adult_tattoo_muscle, ya_spiky);
- girl_ginger's wavy grimace;
- sum_shorts_asian_m's soft, low-detail face;
- jagged brows;
- doll-smooth skin.

The far-model face at 0.85 m is very rough (`f/NS2.png`, first attempt), but the far model was never within 6 m in play (0 of 31,878 near samples), so it is not scored here.

### 3.4 Standing, sitting, behaviour: 8.02 (typical 8.7, worst 7.0)
- Good:
  - far model within 6 m: 0 in 3 runs;
  - duplicates 0;
  - stair stalls 0 of 41 stair walkers;
  - overlaps up to 5 per run, all moving and up to 0.3 s;
  - standing riders keep off the middle;
  - nobody holds a gangway pole.
- Worst tenth:
  - the player's walk through a full train stalls for good in 6 of 36 walks, on 2 of 5 loads, against two riders zigzagged on opposite sides (`c/wk_govan.json`, `c/wk_shields-road.log` first load, quoted in §1).
  - a standing rider's shin in a seated rider's handbag for 4 s.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged at 99. 18 more people were checked standing, walking and sitting (`n/A1.png`, `n/A2.png`); skin tones, builds and ages span well. Children are still 11 %, and the shared young-male face template is unchanged.

### 3.6 Clothing: 7.40 (typical 8.2, worst 6.2)
- Good:
  - every car is now at or under half one garment;
  - the variety is real: fishnet vest, tube top with denim shorts, sash dress, hi-vis, Lycra, kilts.
- Worst tenth:
  - **seated skirts with holes:**
    - woman_sash's midi dress becomes a stiff tube with a hole through which the knee and thigh show (`n/WS.png`, `n/SKZ.png`, also on the far model, `n/LOD.png`);
    - woman_midi's skirt has two cut-outs with the knees through them;
    - adult_beret's knees go through her pencil skirt, with notched boot tops (`n/SKZ.png`).
  - sum_loose_shorts_w's and sum_denim_shorts_m's shorts still balloon behind the hips (`n/WS.png`).
  - the platform mix near the player is over half in 20 % of samples, up to 67 %.

### 3.7 Luggage: 8.24 (typical 8.8, worst 7.4)
- Better: floor bags show their broad face to the opposite seat (`gx/E.png`). The worst leg-in-bag event is 4 s, down from 14 s.
- Worst tenth:
  - from along the aisle the turned bags are edge-on spikes (`gx/KA_zoom.png`: a yellow carrier);
  - the turned bags reach within 0-6 cm of the middle line;
  - a large case on a real stair is still unseen.

### 3.8 Whole bodies: 7.20 (typical 8.0, worst 6.0)
- Worst tenth, at a normal viewing distance:
  - the knee-through-skirt holes in 3.6 (woman_sash, woman_midi, adult_beret);
  - on the far model, boy_cap's black hair comes through the back of his red cap (`n/LOD.png`, `f/NS2.png`).
- Otherwise the full and far models look whole (`n/LOD.png`).

## 4. Top ten defects, in priority order

1. **Seated skirts and dresses with the knee through a hole.** woman_sash (midi dress: a stiff tube with an open hole), woman_midi (two knee cut-outs), adult_beret (knees through the pencil skirt; boot-top notches); woman_mini and the shorts as before. Visible at 2 m, on both models.
   - Reproduce: `node shoot.mjs 0 woman_sash,woman_midi,adult_beret,sum_loose_shorts_w none sit n/x body`.
   - Evidence: `n/SKZ.png`, `n/WS.png`, `n/SK.png`.
2. **Brisk-walk crouch and pelvis jolts** (LEG 7.6, p10 5.2; SMO p10 6.9). Walking carries 20 %.
   - Reproduce: `people_motion.mjs --people all`, then `--from DIR --items --worst 12`.
3. **The player cannot get through a full train on some loads.** 6 of 36 end-to-end walks stalled for the whole 60 s. Two standing riders on opposite sides, 0.6-0.8 m apart along the car, close the aisle: the "not abreast" gap is 0.6 m, and the walker's sidestep cannot zigzag through.
   - Reproduce: `node gwalk.mjs "mode=ride&q=high&line=inner&station=govan" c/wk_govan` (prints the blockers).
4. **Platform crowd near the player over half one garment.** 13 of 65 census samples, up to 67 % shorts (Buchanan Street explore) or trousers (St Enoch ride). Cars are fixed; platforms are not.
   - Reproduce: `node gp8.mjs "mode=explore&q=high&line=inner&station=buchanan-street" g/bx 150`, then `python3 cen3.py g/bx.json`.
5. **Faces**: V-shaped closed-lip smiles; girl_ginger's grimace; sum_shorts_asian_m soft; jagged brows; doll skin.
   - Reproduce: `node face2.mjs man_highland,girl_ginger,adult_tattoo_muscle f/x "0:0" 1 8611 "" 11`.
6. **Pole hands open at close range** on high pole-clip grips (hand 2.15-2.3 m up) and on the rail clip's flat palm: about a third of close-ups.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=shields-road" p/sr 30 8`.
7. **Turned floor bags**: edge-on spikes along the aisle, and the edge now 0-6 cm from the middle line.
   - Reproduce: `node gaisle.mjs "mode=ride&q=high&line=outer&station=kinning-park" gx/ka 40`; `node gbagx.mjs "mode=ride&q=high&line=inner&station=ibrox" 60`.
8. **Phone_stand hands** cross and splay in front of the face (`f/NS.png` row 2).
9. **Arm splay on brisk walks** (ARM.splay unchanged).
10. **Small items**: adult_heel_boots @ 0.4 m/s (7.9); boy_cap's hair through his cap on the far model; a 4 s shin in a handbag (Hillhead); the large case on real stairs still unseen.

## 5. What I could not observe

- No motion watched. Walking was judged from the instrument and from stills.
- A large case on a real station stair.
- Blink and smile timing in play: code only.
- The 4 s shin-in-handbag event was measured, not rendered.
- Loads differ every time. Walk-through stalls appeared on 2 of 5 loads; the same station (Shields Road) gave 3 of 6 on one load and 0 of 6 on the next.
- My first attempt at close faces in the viewer showed the far model, because `__clip` does not swap models. Only the full-model shots are scored.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster (99), re-recorded | all | `m/rec.log`, `m/items.log` |
| Garment groups per car, holders and grip-to-polyline, every 10 s for 150 s | Shields Road outer, Govan inner, Cessnock outer rides | `c/sr.*`, `c/gv.*`, `c/ce.*` |
| Holder close-ups, 0.4 m from two sides | Cowcaddens inner, Buchanan Street outer, Shields Road outer: 14 holders | `p/H.png`, `p/SR.png`, `p/*.log` |
| Holders at eye height, 1.1 and 2.5 m | Kelvinbridge inner: boy_small, teen_girl, teen_skirt, man_kilt_casual, elder_woman_coat | `e/KB.png` |
| Game census (far model < 6 m, overlaps, duplicates, stair stalls, garment mix within 15 m) | St Enoch outer ride; Buchanan Street inner explore; Partick outer explore and board | `g/*.log`, `g/*.json` |
| Floor bags against legs, 150 s | Ibrox inner, Hillhead inner, Kinning Park outer | `bs/*.log` |
| Floor bags from the opposite seat; along the aisle at 1.6 and 1.15 m | Kinning Park outer ride | `gx/E.png`, `gx/KA.png`, `gx/KA_zoom.png` |
| Floor-bag position across the car | Kinning Park outer, Ibrox inner | `gbagx.mjs` output (in §1) |
| End-to-end walk through the train, 36 walks | Shields Road outer x2, Govan inner, Cessnock outer, St Enoch inner | `c/wk_*.log` |
| 18 people new to the last two reviews: stand, walk, sit (F/S/B), full model | adult_camisole, adult_cyclist, adult_lusekofta, adult_string_vest, elder_shorts, girl_leggings, sum_loose_shorts_w, sum_tube_denim, teen_cutoffs, teen_shorts_lad, woman_sash, ya_bootcut, ya_ginger_lad, ya_tattoo_tank, staff_hivis, woman_puffer, adult_fisherman_leggings, boy_shorts | `n/A1.png`, `n/A2.png` |
| Every skirt, dress and kilt seated | woman_dress, woman_midi, elder_woman_dress, ya_smile_dress, adult_beret, teen_skirt, woman_mini, girl_school_kilt, man_highland, woman_coat, elder_woman_coat, woman_sash | `n/SK.png`, `n/SKZ.png` |
| Far model, standing and sitting | 8 incl. woman_sash, boy_cap, sum_shorts_asian_m | `n/LOD.png` |
| Faces at 0.85 m and closer, neutral and smiling | 22 people incl. sum_shorts_asian_m, ya_spiky, adult_tattoo_muscle, man_highland, girl_ginger, woman_elder, elder_man_cap, man_beard | `f/NS.png`, `f/NS2.png`, `f/Z.png` |
| Stride sequences, 8 frames side view at 1.6 m/s | 6 people | `w/S.png` |

Next round, look at:
- seated skirts and dresses, every one, from the front;
- the walk through a full train on several loads;
- the platform garment mix within 15 m;
- the high pole-clip hand;
- a large case on a real stair.

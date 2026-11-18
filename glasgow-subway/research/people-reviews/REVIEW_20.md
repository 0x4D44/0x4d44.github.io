# Under Glasgow: independent review of the people (review 20)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `d5d6e9ef` ("walkers held up stand instead of freezing mid-stride; reachable boarders"). I read the diff read-only: 3 changed lines in `index.js` and 8 in `people.js`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.74 (7.741). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Only Luggage reaches 8 (8.02). The other seven are below 8.

All four builder claims hold as written. But each fix is narrower than the fault it was aimed at:
- **Claim 1.** The mid-stride freeze is gone, but every stop still begins with half a second frozen in the walk. In a crawling jam, people now flick between walking and standing up to 39 times a minute.
- **Claim 2.** Half of the decided boarders still miss the train: **58 of 115** over 10 rides. Another 10-12 walk into the car and vanish there ("no place").
- **Claim 3.** No seated holdalls. But seated riders with a carried **case** still put it in the middle of the aisle (0 cm). Rendered in `gx/CS.png`.
- **Claim 4.** The builder treated this as a rare e2e fluke. It is not: in 3 of 5 stations the game's own `waitAudit` fails its `far > 1` test (0.22, 0.38 and 0.69 m), and 20 % of newcomers stop within 1 m of a stair foot. A render shows a crowd standing at the foot of the Hillhead stairs (`st/hh_a.png`).

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review20/`. I deleted the raw walking recording (`m/rec`, 542 MB) after scoring. `m/rec.log` and `m/items.log` keep the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.3 | **7.56** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 7.9 | 6.5 | **7.34** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 7.0 | **7.96** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.7 | 7.0 | **8.02** |
| 8 | Whole bodies | 15 | 8.3 | 7.0 | **7.78** |
| | **Weighted mean** | 100 | | | **7.74** (7.741) |

0.20x7.56 + 0.10x7.88 + 0.10x7.34 + 0.10x7.96 + 0.10x7.66 + 0.15x7.84 + 0.10x8.02 + 0.15x7.78 = 1.512 + 0.788 + 0.734 + 0.796 + 0.766 + 1.176 + 0.802 + 1.167 = 7.741.

Against review 19 (7.751):
- **Walking: +0.04.** The mid-stride freeze is gone from the worst tenth.
- **Faces: -0.18.** This is not a regression. The 14 faces I sampled were new ones, and they include worse faults: elder_shorts' fringe covers one eye; ya_ginger_braid has a V smile at rest; woman_bob and adult_vneck have no brows.
- **Behaviour: flat.** Fewer boarders miss the train and the freeze is gone, but people now stand at the stair feet and boarders vanish inside the car.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A walker still for 0.5 s takes the quiet stance and walks on when there is room | **True, with new faults.**<br>`gpause.mjs` at 0.05 s steps on 4 runs of 200 s (Shields Road outer, Kinning Park inner, Cowcaddens inner rides; Buchanan Street inner explore): 117 of 141 held-up episodes switch to `idle_a`. No walker stays in the walk clip at timeScale 0 beyond the designed 0.5 s.<br>**Still wrong:**<br>(a) Every stop begins with 0.45-0.5 s frozen in the walk (by design), followed by a 0.4 s crossfade. 1440 frozen frames across the 4 runs.<br>(b) Crawling jams toggle walk / stand / walk: ya_smile_dress 7 times in 14 s, adult_oxford_shirt 11 times in 32 s, adult_lusekofta 39 times a minute. Each toggle is another 0.5 s freeze, then a set-off.<br>(c) The feet move without a step. `gpfoot.mjs` (`pf/sr.log` rows): adult_cyclist's feet jump 13-17 cm along the walk line between the frozen-walk pose and the idle pose, and back, at y constant. adult_cap_baggy's back foot slides 20 cm over 0.6 s while planted. All seen at 14-21 m on the far model.<br>Renders of the paused stance (`pf/SL0.png`, `pf/SL1.png`) read as people waiting. | `pz/*.log`, `pf/SL*.png`, `pf/*` |
| 2 | Boarders only from stair feet within 12 m of a door: 15 of 30 left behind on review 19's three rides | **True** (my rerun: 17 of 32).<br>Over 10 rides of 200 s (`gkeep`/`gkeepw`), **58 of 115 decided boarders (50 %) were left on the platform** (review 19: 71 %). The spread is wide: Partick outer 13 of 14, Ibrox inner 9 of 15, St Enoch outer 9 of 11; Kinning Park inner 3 of 12.<br>**New finding: 10 of 115 were "lost".** They walked through the door and were deleted in the car. `_xstat.why` gives `no place x=0.09-0.11` at the middle of the aisle, `reached=true`, so a rider sees them vanish in the aisle. `gbag3` saw 2 more at Shields Road. Review 19 counted 3 in about 80. | `k/keep_*.log`, `k/keepw_*.log`, `bs/b_outer_shields-road.log` |
| 3 | Holdall riders stand like those with a wheeled case | **True for holdalls.** No seated holdall in 3 rides (`bs/b_*.log`) or in `gbagx` (`gx/bx_*.log`).<br>**The fault remains under another kind.** The carried **case** is not covered by the `/^(trolley\|holdall)$/` test:<br>- adult_tattoo_muscle (Bridge Street outer): case at 0 cm from the middle line for 190 s;<br>- sum_shorts_asian_m (Shields Road outer): case at 0.5 cm for 200 s.<br>Render: a black case standing in the middle of the aisle (`gx/CS.png`). Seated carriers also reach 3.6-5.8 cm (sum_denim_shorts_m, ya_tee_jeans, man_beard, teen_hood). | `bs/b_*.log`, `gx/CS.png` |
| 4 | One e2e run had a newcomer stop 0.82 m from the stair foot; 5 reruns fine | **Not a fluke.**<br>`gstair.mjs`, 5 explore stations, 180 s each, then the game's own `waitAudit`. `arr.far` was:<br>- Govan outer **0.22**;<br>- Cessnock inner **0.38**;<br>- Hillhead inner **0.69**;<br>- Kelvinbridge outer 1.11;<br>- St George's Cross inner 14.7.<br>So the e2e test that expects `far > 1` fails at 3 of 5 stations.<br>Arrivals stopping within 1 m of the bottom step: **16 of 81 (20 %)**, 7 of 17 at Govan. Standing samples within 1 m: 1153 of 13786 (8.4 %). Some stay there for the whole run: girl_shorts 0.35 m for 170 s at Hillhead; teen_shorts_lad 0.29 m for 180 s at Govan.<br>Render: at Hillhead, a group of seven stands in front of the "Way out / Stairs" stair foot, two of them 0.18-0.39 m from the bottom step (`st/hh_a.png`). | `st/*.log`, `st/hh_a.png` |
| 5 | Not changed: brisk crouch, seated coats/shorts/kilt, V smile, brows, doll skin, open high-grip hands, standing cases 1.5-7 cm from the middle, phone hands, arm splay, coat bell | **True.**<br>The instrument is row-for-row identical to review 19: 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7, ARM 9.5.<br>Seated elder_woman_coat still balloons with a jagged hem (`n/SK.png`).<br>High grips at Kelvinhall outer: 2 of 3 hands open beside the pole (`p/KH.png`). | `m/rec.log`, `m/items.log`, `n/SK.png`, `p/KH.png` |

## 2. Status of REVIEW_19's top ten

| # | REVIEW_19 item | Now | Evidence |
|---|---|---|---|
| 1 | Boarders miss the train and freeze mid-stride | **Partly fixed.**<br>The freeze becomes the idle stance after 0.5 s.<br>Left behind: 50 % (was 71 %).<br>New: up to 39 walk/stand toggles a minute in jams; 10 of 115 boarders vanish in the aisle. | `pz/`, `k/` |
| 2 | Brisk-walk crouch, pelvis jolts | **Not fixed** (identical numbers). | `m/items.log` |
| 3 | Seated big bags across the aisle middle | **Partly fixed.** Holdalls and trolleys no longer sit. Seated *cases* still stand at 0 cm (2 riders, about 200 s each). Seated carriers reach 3.6 cm. | `bs/b_*.log`, `gx/CS.png` |
| 4 | Hands off the high grip | **Not fixed.**<br>Kelvinhall: adult_piper's hand is open, 7.9 cm off; boy_kilt's is flat beside the pole.<br>Over 3 rides of 200 s, 8 of 165 holder-samples are over 4 cm (max 10 cm). | `p/KH.png`, `c/car_*.log` |
| 5 | Seated coats, shorts, kilt, dress | **Not fixed.** elder_woman_coat (`n/SK.png`). The skirts and kilts still stand rather than sit. | `n/SK.png` |
| 6 | Faces | **Not fixed, and new faults found** (section 3.3). | `f/NS1.png`, `f/NS2.png`, `n/HF.png` |
| 7 | Garment groups (shorts + leggings) | **Fine in this sample.** 0 of 212 car-samples over half by either grouping (Cowcaddens outer, Partick inner, Hillhead outer). | `c/car_*.log` |
| 8 | Phone hands, arm splay, coat bell | **Unchanged.** In the viewer, elder_shorts holds the phone to his ear with a flat, open hand (`n/HF.png`, side still). | `n/HF.png` |
| 9 | Small far-model faults | Not re-checked. Unchanged by the diff. | |
| 10 | Small items | **Mixed.**<br>- Duplicates: 0 (2 runs).<br>- Far model within 6 m: 0.<br>- Stair stalls: 0 of 33.<br>- Overlaps: 2 and 4, max run 0.2 s.<br>- Walk-through: 6 of 6 walks done, nearest pass 0.40 m.<br>- "No place" losses are worse: 12 (item 1). | `g/se.log`, `g/ib.log`, `c/wk_*.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.56 (typical 8.4, worst 6.3)
- **Instrument:** unchanged (LEG 7.8, p10 5.9; SMO p10 7.1; worst recording 7.7).
- **Better:** the multi-second mid-stride freeze is gone.
- **Worst tenth now:**
  - a 0.5 s frozen walk pose at every stop;
  - stop-start flicker in crawling jams;
  - feet re-placed without a step when the clip changes;
  - plus the brisk-walk crouch.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Walking arms measure well (ARM 9.5).
- High grips are still open hands beside the pole (`p/KH.png`, and the piper in `e/KP.png`).
- elder_shorts holds his phone to his ear with a flat palm.

### 3.3 Faces: 7.34 (typical 7.9, worst 6.5)
14 new faces at fov 14, neutral and smiling (`f/NS1.png`, `f/NS2.png`):
- woman_bob, adult_beret, man_beard, elder_man_cap, teen_ginger, ya_ginger_braid, adult_vneck;
- boy_small, woman_student, adult_runner, staff_woman, sum_shorts_asian_m, ya_smile_polo, elder_shorts.

They differ and read as their age and sex. Faults:
- **elder_shorts:** a flat slab of grey fringe covers his right eye, on both models (`n/HF.png`), with a red speck on the cheek.
- **ya_ginger_braid:** a V smirk at rest.
- **ya_smile_polo:** a wide crooked V when smiling.
- **woman_bob, adult_vneck:** no visible brows.
- **teen_ginger, ya_ginger_braid:** heavy, jagged black brows under ginger hair.
- **Most faces:** dotted lashes.
- **elder_man_cap:** a glare.

### 3.4 Standing, sitting, behaviour: 7.96 (typical 8.6, worst 7.0)
Gains:
- no mid-stride freeze;
- fewer boarders left behind.

New or confirmed:
- **Boarders:** half of the decided boarders still let the train go. About 1 in 10 vanish inside the car.
- **Stair feet:** newcomers stop at the foot of the stairs (20 % of arrivals within 1 m; `st/hh_a.png`).
- **Jams:** people flicker between walk and stand.

Walk-throughs, seated people and waiting people are otherwise good (`e/KP.png`).

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
The roster is unchanged.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- **Mix:** 0 of 212 car-samples over half.
- **Seated:** elder_woman_coat's seated coat still breaks.
- **Seated range:** seated skirts are still rare, because their wearers stand.

### 3.7 Luggage: 8.02 (typical 8.7, worst 7.0)
- **Better:** holdalls no longer seated.
- **Same fault:** the seated case still stands in the aisle middle (`gx/CS.png`).
- **Smaller:** seated carriers reach 3.6-6 cm from the middle line.

### 3.8 Whole bodies: 7.78 (typical 8.3, worst 7.0)
- **elder_shorts:** the hair slab over his eye, on both models.
- **Ragged hairlines** on the full model: adult_runner (skin patches in the hair), ya_smile_polo, staff_woman, sum_shorts_asian_m.
- **Helmet bobs:** ya_smile_polo and a dark bob in `e/KP.png` read as hard shells.

## 4. Top ten defects, in priority order

1. **Half the boarders miss the train, and 1 in 10 vanish in the car.** 58 of 115 decided boarders are left on the platform; 12 are deleted at the aisle middle ("no place").
   - Fix: hold the doors for routed boarders; give a boarder with no place a standing spot rather than deleting them.
   - Reproduce: `node gkeepw.mjs "mode=ride&q=high&line=outer&station=partick" 200` (13 of 14 kept); `node gbag3.mjs "mode=ride&q=high&line=outer&station=shields-road" bs/x 200` (xstat.why).
2. **Newcomers stop at the foot of the stairs.** `waitAudit` `far` is 0.22, 0.38 and 0.69 at Govan outer, Cessnock inner and Hillhead inner; 20 % of arrivals stop within 1 m.
   - Reproduce: `node gstair.mjs "mode=explore&q=high&line=outer&station=govan" 180 st/x`; render with `node gstairshot.mjs "mode=explore&q=high&line=inner&station=hillhead" 100 st/hh`.
3. **Brisk-walk crouch and pelvis jolts.** Unchanged: LEG p10 5.9, SMO p10 7.1.
   - Reproduce: `people_motion.mjs --people all`.
4. **Jam stop-start.** Each stop begins with 0.5 s frozen in the walk. Crawling queues toggle walk/stand up to 39 times a minute. Feet move 13-20 cm without a step when the clip changes.
   - Fix: a hysteresis of a second or more before walking on, and let the gait take a closing step.
   - Reproduce: `node gpause.mjs "mode=ride&q=high&line=inner&station=kinning-park" 200`; `node gpfoot.mjs "mode=ride&q=high&line=outer&station=shields-road" pf/sr 3`.
5. **Seated riders' carried cases stand in the middle of the aisle** (0 cm; seated carriers 3.6 cm).
   - Fix: extend the stand rule (or a lengthwise placement) to `case`.
   - Reproduce: `node gcase.mjs "mode=ride&q=high&line=outer&station=bridge-street" gx/cs 30`.
6. **Faces:**
   - elder_shorts' fringe over one eye;
   - V smiles (ya_ginger_braid at rest, ya_smile_polo when smiling);
   - missing brows (woman_bob, adult_vneck);
   - black brows on ginger hair;
   - dotted lashes; doll skin.
   - Reproduce: `node face2.mjs elder_shorts,ya_ginger_braid,woman_bob n/x "0:0" 0 8611 "" 14`.
7. **Open hands on the high grips.** At Kelvinhall: adult_piper 7.9 cm off, boy_kilt's hand flat.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=kelvinhall" p/kh 50 8`.
8. **Seated garments.** elder_woman_coat's coat balloons. Skirts, kilts and dresses are kept standing.
   - Reproduce: `node shoot.mjs 0 elder_woman_coat none sit n/x legs`.
9. **Ragged hairlines and helmet hair on the full model:** adult_runner, ya_smile_polo, staff_woman.
   - Reproduce: `node shoot.mjs 0 adult_runner,ya_smile_polo none stand n/x face`.
10. **Phone held with a flat palm** (elder_shorts); arm splay and coat bell unchanged.

## 5. What I could not observe

- **No motion watched.** The stop-start flicker and the foot jumps come from per-frame numbers. They were all at 14-21 m on the far model. My attempt to bring the camera close moved the player into the jam and dispersed it (`pf/EX*.png`).
- **Blink and smile timing** in play.
- **A large case on a real stair.**
- **Far-model faults** from review 19 (staff_hivis, sum_crop_denim): not re-checked.
- **Randomness:** loads are random between runs, so per-station boarding numbers vary widely (Partick 13 of 14 against Kinning Park 3 of 12).

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Held-up walkers, frame by frame (0.05 s) | Shields Road outer, Kinning Park inner, Cowcaddens inner (rides); Buchanan Street inner (explore) | `pz/*.log` |
| Feet through stop and restart, with renders | Shields Road outer: adult_cap_baggy, man_kilt_casual, adult_cyclist, man_puffer, adult_camo_cap, man_longcoat | `pf/sr.log` (console), `pf/SL0-2.png` |
| Boarding outcomes, 10 rides | inner West Street (x2), Hillhead, Kinning Park, Ibrox; outer St Enoch, Shields Road, Bridge Street (x2), Partick | `k/*.log` |
| Stair-foot census + waitAudit | Hillhead inner, Govan outer, St George's Cross inner, Kelvinbridge outer, Cessnock inner | `st/*.log`, `st/hh_a.png` |
| Floor / lap bags, every 10 s | inner Govan; outer Bridge Street, Shields Road | `bs/b_*.log`, `gx/bx_*.log`, `gx/CS.png` |
| Car garment mix and grip distances | outer Cowcaddens, inner Partick, outer Hillhead | `c/car_*.log/json` |
| Pole-hand close-ups | Kelvinhall outer: boy_kilt, teen_tube, adult_piper | `p/KH.png`, `p/kh.log` |
| Eye-height views in a car | Kinning Park inner: girl_shorts, adult_piper, man_highland | `e/KP.png` |
| Platform census (overlaps, duplicates, far model, stairs) | St Enoch outer explore, Ibrox inner ride | `g/se.log`, `g/ib.log` |
| Walk through a full train, 12 walks | outer Kinning Park, inner Kelvinhall | `c/wk_*.log` |
| Faces, neutral and smiling, fov 14 | the 14 listed in 3.3 | `f/NS1.png`, `f/NS2.png` |
| Head views, both models | elder_shorts, ya_smile_polo, adult_runner | `n/HF.png` |
| Seated garments (viewer) | man_kilt_casual, teen_skirt, woman_midi, sum_crop_denim, elder_woman_coat, teen_hippy, ya_bootcut, adult_cap_shorts | `n/SK.png` |

Next round, look at:
- "no place" losses (`gbag3`/`gkeepw`, `xstat.why`);
- stair-foot arrivals (`gstair.mjs`);
- seated `case` and carrier bags against the middle line;
- the walk/stand toggle rate in jams, with a close camera that does not disturb the jam.

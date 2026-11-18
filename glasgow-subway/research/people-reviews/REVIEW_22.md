# Under Glasgow: independent review of the people (review 22)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `60131a8b` ("rebuilt people (review 21: brows the colour the hair renders)"). I read the diff since `04f1bbd2` read-only: `5c152f9b` (`_routeBoarder` releases turned-away boarders; a paused walker moving over 0.5 m/s walks at once; brow colour from `hair_shows()` in `assets_people_mpfb.py`), `025e3397` (fallback when PIL cannot read a hair texture) and the rebuilt GLBs. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.76 (7.762). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Only Luggage reaches 8 (8.16).

Summary of the builder's claims:
- **Claim 1 holds.** 34 of 34 turned-away boarders in 4 rides were stair newcomers that had not yet appeared. All were dropped while hidden, and none was ever shown.
- **But people still vanish on the platform in plain view.** It is a different group: **alighters**. They are made with `walkOn` and have no `onArrive`. When one is stuck for 6 s on its way to the stairs, the `people.js:942` watchdog deletes it. Also:
  - when the doors close, `setBays([])` (`people.js:725`) deletes anyone standing off the floor in a doorway;
  - routed boarders "kept" at the door are sometimes deleted by that same line.

  Over 10 runs I counted **34 visible removals on the platform (27 stuck alighters, 4 door-close drops, 3 kept boarders)**. Two were 1.7 m from the camera in explore mode. Rendered: `v/STK.png`.
- **Claim 2 holds.** No paused episode ran faster than 0.43 m/s, and the longest glide in the standing pose is 0.18 m (was 0.42 m).
- **Claim 3 is only partly true.** girl_school_kilt's brows are now brown, not olive. But:
  - grey and white-haired men (elder_man_suit, adult_tie_suit, man_elder) still have **dark slate-blue brows**, the same pixels as review 21;
  - **adult_smile_blouse has black brows under golden-blonde hair**;
  - elder_woman_coat (the `elvs_50s_updo` texture fallback) has **pale grey-blue brows under brown hair**.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review22/`. The walking instrument was run with `--rec`. I deleted the raw recording (542 MB) after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.0 | 6.7 | **7.48** |
| 4 | Standing, sitting, behaviour | 10 | 8.6 | 6.0 | **7.56** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.4 | 7.0 | **7.84** |
| | **Weighted mean** | 100 | | | **7.76** (7.762) |

0.20x7.68 + 0.10x7.88 + 0.10x7.48 + 0.10x7.56 + 0.10x7.66 + 0.15x7.84 + 0.10x8.16 + 0.15x7.84 = 1.536 + 0.788 + 0.748 + 0.756 + 0.766 + 1.176 + 0.816 + 1.176 = 7.762.

Changes against review 21 (7.734):
- **Walking +0.08:** the idle-pose glide is gone.
- **Faces +0.04:** one green-brow case is fixed; the others remain.
- **Behaviour +0.08:** turned-away boarders and the Govan stair foot are fixed. Visible platform vanishings remain at about 3.4 per run, now from alighters.
- The other categories are unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A turned-away boarder is released to the platform crowd, not left walking to the door | **True.**<br>`gkeep4.mjs` (records hidden/visible at the moment of rejection and every 0.1 s after), rides at Ibrox inner, St Enoch outer, West Street inner and Partick outer, 200 s each: **34 turned away, all 34 hidden stair newcomers**. All were dropped by `release()` while hidden (`hid True, vis False`), so none was ever seen. Every one had mode `go`; no visible queued boarder was turned away in these runs.<br>Side notes:<br>- the same character is streamed several times at once and turned away as "already aboard" (teen_tee x4 and boy_shorts x2 at Partick, t=184), which is harmless while hidden;<br>- routed boarders left on the platform when the doors shut ("keep"): 11 of 46 (24 %), including 7 of 10 at Ibrox. | `k/k4_*.log`, `rej2.py` |
| 1b | (implied: nobody vanishes on the platform) | **False.** `gvan5/6/7.mjs` log every removal from the platform crowd, with visibility, cause (stack) and camera distance. There are 34 visible removals on the platform floor in 10 runs (8 rides and 2 explore).<br>- **27 alighters** made by `walkOn` with `onArrive: null`. After `stuckT > 6` the `people.js:942` watchdog drops them 2.4-23.7 m short of the stairs. Examples:<br>&nbsp;&nbsp;- explore Hillhead: ya_smile_dress and ya_knit **1.7 m from the camera**;<br>&nbsp;&nbsp;- St Enoch: man_commuter 4.5 m, adult_casual5 4.2 m.<br>- **4 door-close drops.** `setBays([])` at `people.js:725` removes anyone off the floor, at a door edge (Kelvinbridge: woman_coat).<br>- **3 kept boarders** released at the door edge and then dropped by the same line: elder_man_cap (Hillhead), woman_sash (Cessnock), adult_casual5 (Kelvinbridge).<br>Rendered with `gstk.mjs`, 0.6 s apart, beside an open train at St George's Cross (`v/STK.png`): ya_shorts, woman_mini and woman_midi each disappear from the middle of a group at the doors. | `v/v5_*.log`, `v/v6_*.log`, `v/v7_*.log`, `van.py`, `v/STK.png` |
| 2 | A paused walker moved at over 0.5 m/s leaves the standing pose at once | **True.** `gglide2.mjs` at Kinning Park inner and Partick outer (200 s): paused vmax over 0.5 m/s in 0 episodes; the largest paused speed is 0.43 m/s.<br>Longest glide: woman_sash, 0.18 m over 9.75 s of slow creep (review 21: 0.42 m at 1.07 m/s).<br>Still possible by design: 0.25-0.5 m/s for up to 0.8 s (0.4 m). Observed maximum: 0.08 m.<br>Leaving the pause cross-fades for 0.4 s, and the walker covers 0.25-0.32 m in that blend (19 of 42 exits over 0.2 m), so for a moment it is half in the standing pose. | `pz/glide_kp.log`, `pz/glide_pa.log` |
| 3 | Brows take the colour the hair actually renders, for every hair colour | **Partly true.**<br>Fixed: girl_school_kilt's brows are brown under auburn hair (`f/Z.png` row 3).<br>Not fixed or new:<br>- **elder_man_suit:** brows dark slate blue under white hair, pixel-identical to review 21 (`f/cmp_old_new.png`);<br>- **adult_tie_suit and man_elder:** the same;<br>- the brow factors in the GLB are neutral grey (#e0e0e0 gives 0.40), so the blue and dark come from the brow texture itself;<br>- **adult_smile_blouse:** black brows under golden hair. The `#d8b86c` brow factors in the GLB run as low as (0.07, 0.02, 0.005), so the texture mean is dark while the hair renders gold;<br>- **elder_woman_coat** (`elvs_50s_updo`, PIL fallback to the tint): pale grey-blue brows under mauve-brown hair. | `f/N.png`, `f/S.png`, `f/Z.png`, `f/cmp_old_new.png` |
| 4 | Not changed: brisk crouch, seated coats/kilt, V smile, doll skin, dotted lashes, pole/rail hands, phone hands, splay, coat bell, hairlines, Govan stair foot, briefcase owners never sit, feet sliding at stops | **True, except Govan.**<br>- Instrument row-for-row identical: 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7.<br>- Paused foot slide: 11 of 20 episodes over 10 cm, p90 0.35 m, max 0.51 m (Partick).<br>- Seated kilt holes, coat bell, woman_coat's flat-plate skirt (`n/SIT.png`).<br>- Smirks on ya_ginger_braid and girl_ginger (`f/S.png`).<br>- Phone on a flat palm (elder_shorts, adult_runner; `n/HF.png`).<br>- Pole hands open (`p/HH.png`).<br>- **Govan is better this run:** 0 of 14 arrivals within 1 m, `waitAudit` far 8.2 (review 21: 0.11). | `m/rec.log`, `pz/p_partick.log`, `n/`, `p/HH.png`, `st/gv.log` |

## 2. Status of REVIEW_21's top ten

| # | REVIEW_21 item | Now | Evidence |
|---|---|---|---|
| 1 | Turned-away boarders vanish on the platform | **Fixed** (all dropped while hidden). The same symptom continues through stuck alighters and door-close drops, at 3.4 visible per run. | `k/`, `v/` |
| 2 | Brisk crouch and pelvis jolts | **Not fixed** (identical numbers). A crouched, forward-leaning walker is visible in `v/crouch.png`. | `m/` |
| 3 | Feet slide while paused; idle-pose glides | **Glides fixed; slides not fixed** (11 of 20 over 10 cm, max 0.51 m). | `pz/` |
| 4 | Brow tint from the spec colour | **Partly fixed** (girl_school_kilt). Grey-haired men are unchanged; adult_smile_blouse and elder_woman_coat are new mismatches. | `f/` |
| 5 | Faces otherwise (V smirks, dotted lashes, spider lashes, doll skin) | **Not fixed.** | `f/N.png`, `f/S.png` |
| 6 | Open hands at poles, T-armed rail holders | **Not fixed.**<br>- Hillhead inner: man_kilt_casual's fingertips are 11-12.5 cm from the pole, with an open hand in front of it;<br>- teen_skirt: 7-8 cm;<br>- adult_cyclist: palm 13 cm from the rail, an open claw;<br>- Bridge Street: man_highland's rail hand is 10.9-12.1 cm from the rail. | `p/HH.png`, `p/hh.log`, `c/car_bs.log` |
| 7 | Seated garments | **Not fixed.** | `n/SIT.png` |
| 8 | Govan stair foot | **Fixed in this sample** (0 of 14 within 1 m; far 8.2). | `st/gv.log` |
| 9 | Hairlines | **Not fixed** (adult_runner's temple patches on both models; `n/HF.png`). | `n/HF.png` |
| 10 | Flat phone palm, 1.2 s overlap, far model at 6 m, briefcase owners never sit | Phone palm unchanged. Cowcaddens explore: 0 overlaps, 0 far models within 6 m, 0 duplicates. Briefcase behaviour unchanged (code). | `g/cw.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is unchanged: LEG 7.8 (p10 5.9) and SMO p10 7.1. The worst recording is adult_heel_boots at 1.9 m/s (7.7).
- At 1.9 m/s, teen_tee, ya_ginger_braid, sum_crop_denim and adult_harem have pelvis acceleration of 14-24 m/s^2 (`m/items.log`).
- The glide is gone, which lifts the worst tenth slightly.
- Still in the worst tenth:
  - feet slide 10-51 cm while paused;
  - a 0.3 m half-blended step when a walker leaves the pause.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Walking arms are good (ARM 9.5).
- In the worst tenth:
  - about half the pole and rail hands examined do not close on the pole: 3 of 6 at Hillhead, with fingertips 7-12 cm off;
  - phones are held on a flat palm (elder_shorts, adult_runner).

### 3.3 Faces: 7.48 (typical 8.0, worst 6.7)
I looked at 24 faces, neutral and smiling, at fov 14 (`f/N.png`, `f/S.png`), and 12 eye regions at fov 7 (`f/Z.png`).
- Better: girl_school_kilt's brows.
- Faults:
  - slate-blue brows on three white or grey-haired men;
  - black brows on a blonde (adult_smile_blouse);
  - pale brows on a brunette (elder_woman_coat);
  - V smirks: ya_ginger_braid, girl_ginger and adult_cyclist;
  - elder_shorts: a crooked smile, a black crease line under the right eye and a red dot on the cheek (`f/Z.png`);
  - woman_elder: spider lashes;
  - everyone: dotted lashes;
  - far models: girl_school_kilt has pink smeared lids, and elder_shorts has orange lower lids (`n/HF.png`).

### 3.4 Standing, sitting, behaviour: 7.56 (typical 8.6, worst 6.0)
Good:
- walk-through 6 of 6 done, nearest pass 0.40 m (`c/wk.log`);
- 0 overlaps and 0 duplicates at Cowcaddens (`g/cw.log`);
- Govan is clear;
- turned-away boarders are fixed.

The worst tenth is still people deleted in plain view, about 3.4 per run (34 in 10 runs). The worst cases are 1.7 m from the player, and the rendered ones are mid-group beside open doors (`v/STK.png`). The rubric calls a vanishing person broken. It scores higher than review 21 only because the turned-away group is fixed and more of the removals are at a distance.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
- The roster is unchanged.
- Spec blondes often render auburn or ginger (girl_school_kilt, adult_heel_boots), so there are few true blondes on a platform.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- Cars: 0 of 45 car-samples over half (Bridge Street, `c/car_bs.log`).
- Within 15 m: 2 of 24 samples over half (Cowcaddens: trousers 5 of 9 on the platform; 11 of 21 in the train crowd; `cen3.py g/cw.json`).
- Seated garments still show kilt holes, the coat bell and woman_coat's flat plate skirt (`n/SIT.png`).

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- adult_cyclist and woman_puffer each carried a large trolley, a daypack, a tote and a holdall, standing, walking and sitting. All hang, tow or sit on the floor correctly (`l/BAGS.png`).
- The `satchel` kind I asked for rendered as a plain white box. It is possibly not a defined kind, so it is not counted.
- Briefcase owners still never sit.

### 3.8 Whole bodies: 7.84 (typical 8.4, worst 7.0)
Unchanged faults:
- adult_runner's temple patches;
- seated kilt holes.

Faults seen this round (`n/HF.png`):
- adult_smile_blouse's far-model hair is a spray of shards with a scalp stripe;
- elder_woman_coat's far model has a hair slab across one eye.

## 4. Top ten defects, in priority order

1. **Alighters and doorway-standers are deleted in view on the platform.** 34 in 10 runs; 27 are alighters stuck 6 s.
   - Cause: `walkOn` passes `onArrive: null`, so the `stuckT > 6` branch of `people.js:942` drops them. `people.js:725` drops anyone off the floor when the bays clear, including kept boarders at the door edge.
   - Fix: give alighters a fallback (`release()` to stand, or retry the route), and move people off the edge rather than deleting them.
   - Reproduce: `node gvan7.mjs "mode=explore&q=high&line=inner&station=hillhead" 200 > x.log; python3 van.py x.log`; render with `node gstk.mjs "mode=ride&q=high&line=outer&station=kelvinbridge" 160 v/stk`.
2. **Brisk-walk crouch and pelvis jolts.** Unchanged: LEG p10 5.9, SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7; pelvis acceleration up to 24.5 m/s^2.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
3. **Feet slide while paused.** 11 of 20 episodes over 10 cm, max 0.51 m. Leaving the pause also travels 0.3 m inside a 0.4 s blend.
   - Reproduce: `node gpause.mjs "mode=ride&q=high&line=outer&station=partick" 200`; `node gglide2.mjs "mode=ride&q=high&line=inner&station=kinning-park" 200`.
4. **Brow colour still wrong for grey and some blonde hair.**
   - elder_man_suit, adult_tie_suit and man_elder have slate-blue brows.
   - adult_smile_blouse has black brows under gold hair. The texture-mean estimate is darker than the rendered hair, and the brow texture is blue-black under a neutral factor.
   - elder_woman_coat (PIL fallback) has pale brows under brown hair.
   - Reproduce: `node face2.mjs elder_man_suit,adult_smile_blouse,elder_woman_coat f/x "0:0" 0 8611 "" 7`.
5. **Pole and rail hands do not grip.** man_kilt_casual's fingertips are 12 cm off the pole, adult_cyclist's palm is 13 cm from the rail, and man_highland's rail hand is 11-12 cm off.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=inner&station=hillhead" p/x 60 8`.
6. **Faces:**
   - V smirks: ya_ginger_braid, girl_ginger, adult_cyclist;
   - elder_shorts: crooked smile, crease line and a red dot;
   - dotted lashes;
   - woman_elder: spider lashes.
7. **Seated garments.** man_kilt_casual's kilt is holed; elder_woman_coat's coat is a bell; woman_coat's skirt is a flat plate.
   - Reproduce: `node shoot.mjs 0 man_kilt_casual,elder_woman_coat,woman_coat none sit n/x body`.
8. **Far-model heads:**
   - adult_smile_blouse: shard hair with a scalp stripe;
   - elder_woman_coat: hair over one eye;
   - girl_school_kilt: smeared lids and mouth.
   - Reproduce: `node shoot.mjs 1 adult_smile_blouse,elder_woman_coat,girl_school_kilt none stand n/x face`.
9. **Hairlines and phone hands:** adult_runner's temple patches; elder_shorts' straight-cut hairline; phones held on flat palms.
10. **Small items:**
    - 24 % of routed boarders are left on the platform (7 of 10 at Ibrox);
    - a platform crowd of 21 had 11 in trousers;
    - briefcase owners never sit.

## 5. What I could not observe

- **No motion watched.** Vanishings, glides and slides come from per-frame numbers plus two-frame renders.
- **Hair and brow colour with the game's runtime tint.** The viewer ran with `tint=0`.
- **Blink and smile timing** in play.
- **A large case on a real stair.**
- **Randomness.** Vanish counts per run ranged from 0 to 8. The Govan result is one 180 s sample.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Turned-away boarders (hidden/visible) and routed outcomes | rides: Ibrox inner, St Enoch outer, West Street inner, Partick outer | `k/k4_*.log` |
| Every platform removal, cause and camera distance | rides: Ibrox inner, Cessnock outer, Hillhead inner (x2), Kelvinbridge outer (x2), St Enoch inner, Govan outer; explore: Kelvinbridge outer, Hillhead inner | `v/v5_*`, `v/v6_*`, `v/v7_*` |
| Vanish renders | Kelvinbridge outer ride (scene at St George's Cross) | `v/STK.png`, `v/crouch.png` |
| Idle-pose glides and blend-out | Kinning Park inner, Partick outer | `pz/glide_*.log` |
| Held-up walkers, foot slide | Partick outer | `pz/p_partick.log` |
| Faces, neutral and smiling, fov 14 | girl_school_kilt, elder_man_suit, adult_tie_suit, woman_elder, adult_vneck, elder_woman_coat, elder_woman_dress, adult_camisole, adult_suit_bun, adult_heel_boots, teen_hippy, ya_ginger_braid, girl_ginger, adult_runner, elder_shorts, man_elder, adult_lusekofta, adult_camo_cap, sum_tee_leggings, adult_cyclist, boy_small, man_puffer, woman_sash, elder_man_cap | `f/N.png`, `f/S.png` |
| Eye regions, fov 7 | 12, including woman_puffer and adult_smile_blouse | `f/Z.png`, `f/cmp_old_new.png` |
| Heads on both models | elder_shorts, adult_runner, adult_smile_blouse, elder_woman_coat, girl_school_kilt, adult_tie_suit | `n/HF.png` |
| Seated garments | man_kilt_casual, elder_woman_coat, woman_coat, boy_kilt, adult_piper, teen_skirt | `n/SIT.png` |
| Luggage, stand / walk / sit | adult_cyclist, woman_puffer x large trolley, daypack, tote, holdall | `l/BAGS.png` |
| Car garment mix and grips | Bridge Street outer ride | `c/car_bs.log/json` |
| Pole-hand close-ups | Hillhead inner: girl_ginger, elder_woman_dress, woman_midi, man_kilt_casual, adult_cyclist, teen_skirt | `p/HH.png`, `p/hh.log` |
| Eye-height car view | Bridge Street outer | `e/BS.png` |
| Platform census (overlaps, duplicates, far models within 6 m, 15 m mix) | Cowcaddens outer explore | `g/cw.log`, `g/cw.json` |
| Stair foot | Govan outer explore | `st/gv.log` |
| Walk through a full train | Partick inner, 6 walks | `c/wk.log` |

Next round, look at:
- alighter routes in crowded platforms (why they stick for 6 s);
- brows with the runtime tint on;
- the remaining blonde and grey heads;
- pole grips in a crowded car.

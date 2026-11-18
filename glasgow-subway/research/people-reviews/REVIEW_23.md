# Under Glasgow: independent review of the people (review 23)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `275d5cf8`. I read the diff since review 22's `60131a8b` read-only:
- `a2d65834`: `people.js` `setBays` and the watchdog at `people.js:946`;
- `2026f4a7` / `665e2344`: `hair_shows()` reads PNGs with bad chunks, brows at the hair colour (factor 1.0 instead of 0.75), rebuilt GLBs.

Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth). Nothing in the repository was edited, and git was only read.

**Result: weighted mean 7.83 (7.826). Gate NOT met.** The gate needs a mean above 9 and no category below 8. Two categories reach 8: Luggage (8.16) and Behaviour (8.10).

In short:
- **Claim 1 holds.** In 7 runs I counted 0 visible removals on the platform: 1 explore run, 3 rides measured to their first stop, and 3 rides of 300 s that let the page load between ticks.
  - The people who used to vanish now stand where they got stuck. That is 2-10 a run, and 0-2 of them are within 6 m of the camera.
  - Before that they stand frozen for 6 s.
  - When the doors shut, an alighter caught in the doorway is moved 0.35-0.82 m in a single frame (4 cases seen).
- **Claim 2 is mostly true.**
  - elder_man_suit and man_elder now have grey brows, and elder_woman_coat has faint brown brows.
  - adult_smile_blouse's brows are **pixel-for-pixel as black as before**.
  - adult_cap_shorts (yellow hair) also has a thin black brow line.
  - elder_shorts still has slate-blue brows.
- **Claim 3 holds.** The walking instrument is identical row for row. Paused feet still slide, and pole hands are still open.
- **A warning about the measuring scripts (mine and review 22's).** A script that runs every tick inside one synchronous `page.evaluate` never lets the station halls load (`_ensureStation` calls `_loadHall`, which is asynchronous, and returns null). So after the first stop, the platform crowd still belongs to the previous station.
  - In those runs, alighters at the second stop were placed 400-760 m away. When the doors shut, `setBays([])` then moved 6-10 of them at once onto the far end of the platform (`v/ib6.log`, `v/ib10.log`, `v/pa10.log`, `v/cw10.log`).
  - The same rides run with the page yielding every 0.5 s show none of this (`v/ib12.log`, `v/pa12.log`, `v/cw12.log`), so it is an artefact of the script, not a fault in the game.
  - Review 22's `gvan7` counts after each ride's first stop may contain the same artefact. Only first-stop numbers from synchronous scripts can be trusted.

Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review23/`. The walking recording (542 MB) was deleted after scoring; `m/rec.log` and `m/items.log` hold the results.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.4 | 6.6 | **7.68** |
| 2 | Arms and hands | 10 | 8.6 | 6.8 | **7.88** |
| 3 | Faces | 10 | 8.1 | 6.8 | **7.58** |
| 4 | Standing, sitting, behaviour | 10 | 8.7 | 7.2 | **8.10** |
| 5 | Range of people | 10 | 8.1 | 7.0 | **7.66** |
| 6 | Clothing | 15 | 8.4 | 7.0 | **7.84** |
| 7 | Luggage | 10 | 8.8 | 7.2 | **8.16** |
| 8 | Whole bodies | 15 | 8.4 | 7.0 | **7.84** |
| | **Weighted mean** | 100 | | | **7.83** (7.826) |

0.20x7.68 + 0.10x7.88 + 0.10x7.58 + 0.10x8.10 + 0.10x7.66 + 0.15x7.84 + 0.10x8.16 + 0.15x7.84 = 1.536 + 0.788 + 0.758 + 0.810 + 0.766 + 1.176 + 0.816 + 1.176 = 7.826.

Changes against review 22 (7.762):
- **Behaviour +0.54:** nobody vanishes on the platform.
- **Faces +0.10:** the grey-haired men's brows are fixed.
- Everything else is unchanged.

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A routed walker stuck in plain view is released to stand with the people waiting; an alighter caught in a doorway when the doors shut steps back on to the platform edge | **True.**<br>`gvan8/12.mjs` log every removal, every `release()` of a visible person, every `setBays` move, every jump over 0.3 m in 0.1 s, and every overlap under 0.3 m.<br>Visible platform removals (`van.py`, `finish()` boarders excluded as before):<br>- explore Hillhead inner: **0**;<br>- rides Kelvinbridge outer, Ibrox inner, St Enoch outer (to the first stop): **0**;<br>- Ibrox inner, Partick outer, Cowcaddens inner (300 s, yielding): **0**.<br>Stuck alighters released to stand: 2-10 a run, 0-2 of them within 6 m. They stand 0.55-2.9 m from the edge for the rest of the run (40-160 s rest).<br>Renders 4 s apart (`v/REL.png`): each stands in the group at the doors, which reads naturally.<br>Side effects:<br>- each one is frozen for 6 s before release, because the watchdog waits the full `stuckT > 6`;<br>- the doorway step-back is a **one-frame snap**: girl 0.35 m, ya_tube_heels 0.44 m, adult_cyclist 0.62 m and adult_runner 0.82 m, all 12-13 m from the camera (`v/snap_ib2.log`, `v/snap_ib4.log`, `v/snap_ce.log`, `v/ib6.log`);<br>- cw12: adult_cap_shorts and adult_casual5 were released 0.40 m apart at the edge, 3 m from the camera (an overlap of 0.13 m for 0.4 s earlier in the run). | `v/*.log`, `van.py`, `v/REL.png` |
| 2 | Brows at the hair's own colour; `elvs_50s_updo` / `elvs_keylth_hair` read | **Mostly true.**<br>Fixed:<br>- elder_man_suit: white-grey brows (`f/cmp_old_new.png` row 3);<br>- man_elder and adult_tie_suit: grey;<br>- elder_woman_coat: brown, though now so sparse that she looks nearly browless at 1 m (row 2).<br>Not fixed:<br>- **adult_smile_blouse:** identical black broken strips under gold hair (row 1, old vs new);<br>- **adult_cap_shorts** (yellow hair): the same thin black line (`f/Z.png`);<br>- **elder_shorts:** slate-blue brows, plus the crease and red dot.<br>Other `keylth` / `updo` users (adult_vneck, adult_suit_bun, adult_camisole, ya_tattoo_tank) have brown or black brows as thin broken strips (`f/K.png`). | `f/N.png`, `f/Z.png`, `f/K.png`, `f/cmp_old_new.png`, `f/cmp2.png` |
| 3 | Not changed: brisk crouch, paused foot slide, pole hands, faces, seated garments, LOD hair, hairlines, phone hands, boarders left, briefcase owners never sit | **True.**<br>- Instrument identical to review 22 row for row (`diff` of `m/rec.log` and `m/items.log`): 9.47, LEG 7.8 (p10 5.9), SMO p10 7.1, worst adult_heel_boots @ 1.9 m/s 7.7.<br>- Paused slide at Partick explore: 9 of 30 episodes over 10 cm, max 0.39 m. Blend-out: 7 of 13 over 0.2 m.<br>- Kelvinhall pole hands: open; fingertips 4-9 cm and thumbs 10-12 cm off the pole.<br>- Seated bell coat, kilt gap and flat-plate skirt (`n/SIT.png`). | `m/`, `pz/`, `p/HH.png`, `n/SIT.png` |

## 2. Status of REVIEW_22's top ten

| # | REVIEW_22 item | Now | Evidence |
|---|---|---|---|
| 1 | Alighters and doorway-standers deleted in view | **Fixed** (0 in 7 runs). Left behind: a 6 s freeze before release, and a one-frame snap of up to 0.82 m at the door edge. | `v/` |
| 2 | Brisk crouch, pelvis jolts | Not fixed (identical). | `m/` |
| 3 | Feet slide while paused | Not fixed (9 of 30 over 10 cm, max 0.39 m). | `pz/p_pa.log` |
| 4 | Brow colour | **Partly fixed:**<br>- grey men fixed;<br>- elder_woman_coat fixed in colour but faint;<br>- adult_smile_blouse unchanged;<br>- adult_cap_shorts and elder_shorts wrong. | `f/` |
| 5 | Pole and rail hands | Not fixed. | `p/HH.png`, `p/kh.log` |
| 6 | Faces: smirks, lashes, elder_shorts | Not fixed. girl_small, ya_ginger_braid and adult_tophat smile lopsidedly; elder_shorts has the crease and red dot. | `f/S.png`, `f/Z.png` |
| 7 | Seated garments | Not fixed. | `n/SIT.png` |
| 8 | Far-model heads | Not fixed:<br>- adult_smile_blouse: shards and a scalp stripe;<br>- elder_woman_coat: hair slab over the eye;<br>- girl_school_kilt: pink lids.<br>**New:** adult_cap_shorts' far model has the hair through the cap, which shows as green islands on orange. | `n/LF.png` |
| 9 | Hairlines, phone palms | Not re-rendered; code unchanged. | - |
| 10 | Small items | Briefcase owners never sitting: unchanged (code). Crowd garment mix:<br>- Buchanan Street explore: 1 of 20 samples over half (a train crowd of 21 with 11 in trousers);<br>- Kelvinhall cars: 0 of 24.<br>Boarders left on the platform: not re-measured. | `g/bu.log`, `c/car_kh.log` |

## 3. Per-category reasoning

### 3.1 Walking: 7.68 (typical 8.4, worst 6.6)
- The instrument is unchanged: LEG p10 5.9, SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7.
- Paused feet still slide up to 0.39 m.
- About half of the exits from the pause travel over 0.2 m inside the 0.4 s blend.

### 3.2 Arms and hands: 7.88 (typical 8.6, worst 6.8)
- Walking arms are good (ARM 9.5).
- Pole hands are open and float 4-12 cm from the pole (woman_sash, ya_ginger_braid; `p/HH.png`).
- The car audit still reads "clipped": its grip-to-pole distance is 0.5-3.9 cm, but the close-ups show no closed fist.

### 3.3 Faces: 7.58 (typical 8.1, worst 6.8)
I looked at 32 faces, neutral and smiling, at fov 14 (`f/N.png`, `f/S.png`), and 21 eye regions at fov 7-9.
- Better: the grey men's brows.
- Worst tenth:
  - adult_smile_blouse and adult_cap_shorts: black strips under blonde hair;
  - elder_shorts: slate brows, crease line, red dot and crooked smile;
  - smirks on girl_small and ya_ginger_braid;
  - dotted lashes on everyone;
  - near-browless women (elder_woman_coat, woman_puffer, adult_heel_boots);
  - far-model lids (girl_school_kilt pink; teen_hippy has red marks under the eyes, `n/LF.png`).

### 3.4 Standing, sitting, behaviour: 8.10 (typical 8.7, worst 7.2)
Good:
- no removals in view;
- walk-through 6 of 6 done, nearest pass 0.42 m (`c/wk.log`);
- Buchanan Street: 0 far models within 6 m, 0 duplicates, 1 overlap of 0.5 s (`g/bu.log`).

The worst tenth now holds:
- stuck alighters frozen for 6 s and then standing at the doors (cw12: 10 in one run);
- one-frame snaps of 0.35-0.82 m when the doors shut;
- the pair at 0.40 m;
- boarders left on the platform (24-35 % in review 22, not changed);
- briefcase owners who never sit.

### 3.5 Range of people: 7.66 (typical 8.1, worst 7.0)
- The roster is unchanged.
- Of six spec blondes (`#c9a25e`/`#d8b86c`), only adult_smile_blouse and adult_cap_shorts render blonde:
  - teen_hippy renders black;
  - adult_vneck, sum_crop_denim, girl_school_kilt, adult_heel_boots and woman_puffer render auburn to ginger.

### 3.6 Clothing: 7.84 (typical 8.4, worst 7.0)
- Cars: 0 of 24 car-samples over half (Kelvinhall).
- Buchanan Street: 1 of 20 samples over half.
- Seated bell coat, kilt gap and flat-plate skirt (`n/SIT.png`).

### 3.7 Luggage: 8.16 (typical 8.8, worst 7.2)
- I rendered a hiking rucksack, handbag, shopper, cabin trolley and carrier, each on elder_woman_dress and teen_tee, standing, walking and sitting (`l/BAGS.png`). All hang, tow or stand on the floor correctly.
- Briefcases are still never taken to a seat by their owners.

### 3.8 Whole bodies: 7.84 (typical 8.4, worst 7.0)
- Far models (`n/LF.png`):
  - adult_cap_shorts' hair through her cap, new in this sample;
  - adult_smile_blouse's shard hair;
  - elder_woman_coat's hair slab.
- Seated kilt gap.
- elder_woman_dress's crown and bob are fine.

## 4. Top ten defects, in priority order

1. **Brisk-walk crouch and pelvis jolts** (LEG p10 5.9, SMO p10 7.1, adult_heel_boots @ 1.9 m/s 7.7). This is the largest weighted loss.
   - Reproduce: `people_motion.mjs --people all --rec <dir>`, then `--from <dir> --items --worst 12`.
2. **Feet slide while paused** (9 of 30 over 10 cm, max 0.39 m) and the 0.2-0.3 m half-blended exit.
   - Reproduce: `node gpause.mjs "mode=explore&q=high&line=outer&station=partick" 200`; `node gglide2.mjs "mode=explore&q=high&line=inner&station=kinning-park" 200`.
3. **Blonde brows.** adult_smile_blouse is unchanged and adult_cap_shorts has the same black strips. The brow texture is near-black and sparse, so tinting it to the hair colour does not lift it. elder_shorts still has slate brows.
   - Reproduce: `node face2.mjs adult_smile_blouse,adult_cap_shorts,elder_shorts f/x "0:0" 0 8611 "" 7`.
4. **Pole and rail hands do not grip:** open hands 4-12 cm from the pole.
   - Reproduce: `node gph.mjs "mode=ride&q=high&line=outer&station=kelvinhall" p/x 60 8`.
5. **Far-model heads:** adult_cap_shorts' hair through the cap (new), adult_smile_blouse's shards, elder_woman_coat's slab, and girl_school_kilt's and teen_hippy's lids.
   - Reproduce: `node shoot.mjs 1 adult_cap_shorts,adult_smile_blouse,elder_woman_coat,teen_hippy none stand n/x face`.
6. **Faces:** smirks (girl_small, ya_ginger_braid, adult_tophat), dotted lashes, elder_shorts' crease and dot, and near-browless women (elder_woman_coat, woman_puffer, adult_heel_boots).
7. **Seated garments:** elder_woman_coat's bell, man_kilt_casual's kilt gap, woman_coat's plate skirt.
   - Reproduce: `node shoot.mjs 0 man_kilt_casual,elder_woman_coat,woman_coat holdall sit n/x body`.
8. **Stuck alighters and the door-close snap.**
   - An alighter stands frozen for 6 s before the watchdog releases them, 2-10 times a run.
   - When the bays clear, someone in a doorway is moved up to 0.82 m in one frame. Walking them back to the floor over 0.5 s would hide it.
   - Reproduce: `node gvan12.mjs "mode=ride&q=high&line=inner&station=cowcaddens" 300` (REL lines with `stuck` 6.1; TELE `setBays-snap`); `node gsnap2.mjs "mode=ride&q=high&line=inner&station=ibrox" 300 v/x`.
9. **Range:** spec blondes render auburn, ginger or (teen_hippy) black, so a platform has almost no blondes.
10. **Small items:** briefcase owners never sit; boarders are left on the platform (not re-measured); the crowd garment mix is at or just over half trousers on some train crowds (11 of 21).

## 5. What I could not observe

- **No motion watched.** Freezes, snaps and slides come from per-tick numbers and paired stills. I did not render a door-close snap.
- **Brows and hair with the runtime tint** (the viewer ran with `tint=0`).
- **Blink and smile timing** in play.
- **Boarders left on the platform:** not re-measured with a yielding script.
- **Real-time frame pacing.** All game runs used fixed 0.1 s ticks. The synchronous-loop artefact above shows that scripts can differ from real play; the yielding runs are the ones I trusted after each ride's first stop.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Walking instrument, whole roster | all 99, 5 speeds | `m/rec.log`, `m/items.log` |
| Every platform removal, release, snap, jump and overlap | explore Hillhead inner; rides Kelvinbridge outer, Ibrox inner, St Enoch outer (sync, first stop); Ibrox inner, Partick outer, Cowcaddens inner (300 s, yielding); Ibrox inner x5 and Partick and Cowcaddens (sync, artefact diagnosis) | `v/*.log` |
| Door-close snaps | Ibrox inner x5, Cessnock outer, West Street inner, Partick outer | `v/snap_*.log` |
| Release renders, 4 s apart | Cowcaddens inner ride (St George's Cross), Hillhead explore | `v/REL.png` |
| Paused slide, glide | Partick outer explore, Kinning Park inner explore | `pz/` |
| Faces, neutral and smiling, fov 14 | 32 people, including every non-dark hair colour | `f/N.png`, `f/S.png` |
| Eye regions, fov 7-9 | 21, including old vs new for 6 | `f/Z.png`, `f/K.png`, `f/cmp_old_new.png`, `f/cmp2.png` |
| Far-model heads | adult_cap_shorts, adult_smile_blouse, elder_man_suit, elder_woman_coat, girl_school_kilt, teen_hippy | `n/LF.png` |
| Seated garments, bags at feet | adult_camisole, elder_woman_coat, man_kilt_casual, woman_coat, ya_tube_heels x briefcase, holdall | `n/SIT.png` |
| Luggage, stand / walk / sit | elder_woman_dress, teen_tee x hiking rucksack, handbag, shopper, cabin trolley, carrier | `l/BAGS.png` |
| Pole-hand close-ups | Kelvinhall outer: woman_sash, ya_ginger_braid | `p/HH.png`, `p/kh.log` |
| Eye-height views along every car | St Enoch outer ride | `e/SE.png` |
| Car garment mix and grips | Kelvinhall inner ride | `c/car_kh.log` |
| Platform census (overlaps, duplicates, far models within 6 m, mix) | Buchanan Street outer explore | `g/bu.log`, `g/bu.json` |
| Walk through a full train | Hillhead outer, 6 walks | `c/wk.log` |

Next round, look at:
- a door-close snap rendered from the platform;
- whether released alighters later board or block the next train's doors;
- boarders left on the platform, measured with a yielding script;
- brows with the runtime tint.

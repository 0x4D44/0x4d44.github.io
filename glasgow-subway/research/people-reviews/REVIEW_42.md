# Under Glasgow: independent review of the people (review 42)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `4dcb9a07`. The people commit since review 41 is `3fbab760` (read-only `git show`):
- `tools/assets_people_mpfb.py`: `seat_drape()` poses each skirted person in `sit_idle` (frame 40), runs a 60-frame Blender cloth simulation of the cloth below the hips onto the body and a box seat, and stores the result as a rest-space offset (`_seat` vertex attribute).
- `js/sim/people.js`: `_skirtSit` adds `_seat` to the garment and calls `computeVertexNormals()` when the person sits. `_seatDraped` lets these people pass `_canSit` and turns `sitalt` into `sit` for them.
- `people_lodhair.py` copies `_seat`. Both `.glb` files rebuilt.

I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review42/`. The scripts are the review 41 set copied into `$R`, plus:
- `gsd2.mjs`: review 37's `gsd.mjs`, extended. It shoots every seated person matching a regex, once per id and clip. Near model: across the aisle at standing eye height (1.6 m), seated eye height (1.15 m), 1 m along, and knee height. Far model: across the aisle and 9 m down the car. It also hooks `settle` and `rise` and shoots seven 0.1 s frames of each sit-down and stand-up.
- `trans.mjs`: the viewer, with a box seat. The person runs the game's `settle()` and `rise()`, and I shoot 0.1 s frames. The camera framing is rough; the garment shapes are what count.
- `probe.mjs`, `probe2.mjs`: read the seated garment geometry (normal lengths, attribute types).
- `mk.py`: contact sheets in chunks.

Running notes: `NOTES.md`. Scored against `research/people-rubric.md` (score = 0.6 x typical + 0.4 x worst tenth).

**Result: weighted mean 8.14 (8.143). Gate NOT met.**
- At 8 or above (six categories): Behaviour 8.52, Arms 8.36, Luggage 8.36, Faces 8.32, Range 8.30, Walking 8.16.
- Below 8 (two categories): Whole bodies 7.88, Clothing 7.62.

In short:
- **The car mix is fixed. A Kelvinbridge inner saloon is now 0 of 20 samples over half (review 41: 17 of 20).** Skirts, dresses and kilts sit in every ride: 14 of the 16 seated in my three rides.
- **The long garments sit well:** `woman_dress`, `woman_midi`, `ya_smile_dress`, `woman_sash`, `girl_small`, `girl_school_kilt` and `boy_kilt`. The kilts pass, though they show more thigh than a kilt would.
- **Three minis break when seated.** `woman_mini`, `teen_skirt` and `teen_tube` sit with the skirt shredded into ribbons round the thighs and the crotch on show. This is at seated eye height from the seat opposite, about 1.5 m away. One of the three is a teenager.
- **Two more garments sit badly.**
  - `elder_woman_dress`'s knee-length dress rides up to the crotch.
  - `adult_beret`'s pencil skirt leaves a band of bare thigh above ragged boot tops.
- **Every draped seated garment has zero-length normals.** `computeVertexNormals` writes into the model's quantised Int8 normal buffer. In the viewer the seated skirts render black. In the game they lose their shading and read as flat colour.
- **The drape pops at both ends of a sit.** It switches on at full strength as the 0.5 s crossfade into the sit starts, and switches off as the crossfade out starts. Standing up, the cloth briefly makes the old barrel or tube shape over bent thighs.

Before this change those people stood whole. Clothing's typical score rises, but its worst tenth falls further, so the category drops.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.2 | **8.16** |
| 2 | Arms and hands | 10 | 8.8 | 7.7 | **8.36** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 9.0 | 7.8 | **8.52** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.7 | 6.0 | **7.62** |
| 7 | Luggage | 10 | 8.8 | 7.7 | **8.36** |
| 8 | Whole bodies | 15 | 8.6 | 6.8 | **7.88** |
| | **Weighted mean** | 100 | | | **8.14** (8.143) |

0.20x8.16 + 0.10x8.36 + 0.10x8.32 + 0.10x8.52 + 0.10x8.30 + 0.15x7.62 + 0.10x8.36 + 0.15x7.88 = 1.632 + 0.836 + 0.832 + 0.852 + 0.830 + 1.143 + 0.836 + 1.182 = 8.143.

Changes against review 41 (8.229):
- **Behaviour +0.04.** Skirted people sit; turn-aways fell to 8 in 2 runs, none for the garment mix; none within 0.6 m of the edge at Govan inner. Against that, the sit-down and stand-up pops.
- **Clothing -0.22.** Typical +0.3: the car mix is fixed and skirts are on the seats. Worst tenth -1.0: shredded seated minis, crotch visible.
- **Whole bodies -0.38.** Skin through shredded cloth, and the dress at the crotch. Zero-normal flat shading on every seated drape.
- **Every other category is unchanged.**

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Skirts, dresses and kilts now sit (Blender cloth drape, `_SEAT`, `_skirtSit`, `_canSit`); draped people kept to plain and phone sits | **True in the code, and they do sit. Mixed on screen.**<br>- **They sit:** Kelvinbridge inner ride: dress sit 30 / stand 1, skirt_midi 20/0, skirt_short 20/0, highland 20/0 (`who.py g/kb.json`). Bridge Street outer: similar (`g/bs.json`). `sitalt` is never used by these people (only `sit_idle` and `sit_phone` were seen).<br>- **Good seated** (across the aisle, standing and seated eye height): `woman_dress`, `woman_midi`, `ya_smile_dress`, `woman_sash` (long tent to the ankle, a small pale wedge on it), `girl_small`, `girl_school_kilt`, `boy_kilt` (`g1/K*.png`, `g2/K*.png`, `g3/K1.png`).<br>- **Acceptable:** `man_highland` and `man_kilt_casual`. The kilt ends mid-thigh, with 10-20 cm of bare thigh above the hose.<br>- **Broken:** `woman_mini`, `teen_skirt` and `teen_tube`. The skirt is shredded into ribbons round the upper thighs and the crotch is visible. Seen in both clips, in two rides, and near and far (`g2/a_woman_mini_sit_idle_seatopp.png`, `g2/a_teen_skirt_sit_idle_stand.png`, `g1/a_teen_tube_sit_phone_seatopp.png`).<br>- **Poor:**<br>&nbsp;&nbsp;- `elder_woman_dress`: the knee dress rides up to the crotch (`g2/K0.png`).<br>&nbsp;&nbsp;- `adult_beret`: the pencil skirt has ridden up, leaving a band of bare thigh, and the boot tops are ragged. Seen in two rides (`g2/a_adult_beret_sit_idle_seatopp.png`, `g3/K0.png`).<br>- **Not seen seated in the game:** `adult_piper` (at a pole) and `woman_coat`. In the viewer they look whole (`v0/S0.png`, `v0/S3.png`).<br>- **Normals:** the seated garment geometry has normal length about 0.006. For `woman_mini`, 933 of 939 vertices are under 0.5. The cause is that the normal attribute is Int8, normalised and interleaved, and `computeVertexNormals` accumulates area-weighted values that round to 0. The same happens on other `cloth_` meshes of these people that the regex does not exclude, such as `adult_piper`'s beret (`probe.mjs`; viewer `v0/S0-3.png` vs `v0/ST0.png`).<br>- **Transitions:** see section 3.4 (`tr/U1.png`, `tr/U3.png`, `g3/K0.png` rise frames).<br>- **"incl. long coats":** no skirted person wears `cloth_coat`, so no long-coat wearer gains a seat. `man_longcoat` still stands. | as listed |
| 2 | Both model files rebuilt; repair chain re-run; `people_lodhair.py` copies `_SEAT` | **True.**<br>- The far model has `_seat` and drapes like the near one (`fr/F0-1.png`).<br>- Standing and walking skirts are unchanged (`v0/ST0.png`, `n/W0.png`).<br>- Faces unchanged (`f/NS.png`). | as listed |
| 3 | Not changed: brisk-walk crouch, stride garment faults, turn-away repeats, edge, open pole hands, jam bursts, resting mouths, hair, far holes, white eye | **Confirmed where re-checked.**<br>- **Faces:** same 12 faces as review 41 (`f/NS.png`). `adult_smile_blouse` pursed, `girl_ginger` smiling at rest, `ya_ginger_long` smirk, `teen_runner` corner down.<br>- **Crouch:** `adult_heel_boots` at 1.6 m/s (`n/W0.png`).<br>- **Stride:** `man_kilt_casual`'s kilt opens at the front in the stride, showing thigh (`n/W0.png`).<br>- **Turn-away repeats:** `adult_camo_cap` twice and `adult_cap_baggy` again in one Hillhead run.<br>- **The edge is better:** 0 of 565 at Govan inner (review 41: 41). The builder changed nothing there, so this is run-to-run spread. | `w/*.log` |

## 2. Status of REVIEW_41's top ten

| # | REVIEW_41 item | Now | Evidence |
|---|---|---|---|
| 1 | Who sits: every skirt, dress and kilt stands | **Fixed as policy.** They sit, but 3 of the 16 sit broken and 2 sit poorly (new items 1-3). | `g/*.json`, `g1-3/` |
| 2 | Car garment mix over half (Kelvinbridge 17 of 20) | **Fixed.**<br>- Kelvinbridge inner: 0 of 20 (max 45 % trousers).<br>- Bridge Street outer: 0 of 20 (max 46 %).<br>- Platforms: 0 of 8 and 0 of 10. | `cen4.py g/kb.json g/bs.json` |
| 3 | Brisk-walk crouch | Not fixed. The instrument (default 6 people) gives 9.54, LEG p10 7.4, SMO p10 7.8; worst `woman_coat` at 1.9 m/s, 8.6. | `m/items.log`, `n/W0.png` |
| 4 | Turn-aways and the edge | **Better.**<br>- 8 turned away in 2 runs (Govan inner 2 of 26, Hillhead outer 6 of 24), all "no seat or spot". None for the garment mix (review 41: 14).<br>- Repeats: `adult_camo_cap` x2; `adult_cap_baggy` again.<br>- Edge: 0 under 0.6 m at Govan inner and at Hillhead outer. | `w/gv.log`, `w/hh.log` |
| 5 | Resting mouths; white eye | Unchanged. | `f/NS.png` |
| 6 | Garment faults in the stride | Unchanged. `man_kilt_casual`'s kilt opens at the front mid-stride. | `n/W0.png` |
| 7 | Open pole hands | Not re-shot (builder: unchanged). | - |
| 8 | Jam stop-start bursts | Not re-measured (builder: unchanged). | - |
| 9 | Hair | Not re-shot; `ya_ginger_long`'s hair is still over the eye in `f/NS.png`. | `f/NS.png` |
| 10 | Far-model holes | Not re-shot. The far seated drapes look like the near ones at 2-9 m. | `fr/F*.png` |

## 3. Per-category reasoning

### 3.1 Walking: 8.16 (typical 8.8, worst 7.2)
- No gait code changed. The instrument on the default 6 people gives 9.54 overall, LEG p10 7.4, SMO p10 7.8 (`m/items.log`). Review 41's 99-person run gave 9.46.
- The heel crouch is still there (`n/W0.png`).

### 3.2 Arms and hands: 8.36 (typical 8.8, worst 7.7)
- No change. Seated phone holders in skirts (`teen_tube`, `ya_smile_dress`, `woman_midi`, `man_highland`) hold the phone properly (`g1/YT0.png`, `g2/K1-2.png`).

### 3.3 Faces: 8.32 (typical 8.8, worst 7.6)
- Unchanged, the same faults as review 41 (`f/NS.png`).

### 3.4 Standing, sitting, behaviour: 8.52 (typical 9.0, worst 7.8)
Good:
- Skirted people sit in the seat, not through it.
- Turn-aways are fewer, and none for the garment mix.
- No edge crowding in two runs.
- The player crossed full trains 6 of 6 times (St Enoch outer ride; `c/wk.log`).
- Kelvinbridge census: 0 far models within 6 m, 0 duplicates, 2 brief overlaps (`g/kb.log`).

Worst tenth:
- **Sit-down pop.** The drape switches on at full strength at the start of the 0.5 s crossfade, while the body is still nearly standing. The dress bulges out behind like a bustle (`tr/U1.png` frames down0-2) and changes shading at once.
- **Stand-up pop.** The drape switches off at the start of the crossfade out. For about 0.3 s the cloth hangs on the standing weights over bent thighs: `elder_woman_dress` a barrel (`tr/U1.png` up0-1), `woman_midi` a stretched tube (`tr/U3.png` up0), and `adult_beret`'s pencil skirt a tube to the shins (`g3/K0.png`, rise frame 0).
- Turn-away repeats.

### 3.5 Range of people: 8.30 (typical 8.7, worst 7.7)
- Unchanged roster.

### 3.6 Clothing: 7.62 (typical 8.7, worst 6.0)
Census (`cen4.py`):

| run | platform | saloon | all within 15 m |
|---|---|---|---|
| Kelvinbridge inner ride | 0 of 8 (max 44 %) | **0 of 20 (max 45 % trousers)** | 0 of 20 |
| Bridge Street outer ride | 0 of 10 (max 50 %) | 0 of 20 (max 46 %) | 0 of 20 |

- Typical: skirts, dresses and kilts now share the seated rows with trousers and shorts.
- Worst tenth:
  - the three shredded minis;
  - `elder_woman_dress` at the crotch;
  - `adult_beret`'s thigh band and boot tops;
  - flat, unshaded seated cloth;
  - `man_kilt_casual`'s stride gap.

  Of the 16 skirted people seen seated, 3 are broken and 2 poor. In Kelvinbridge two of the minis sat at once.

### 3.7 Luggage: 8.36 (typical 8.8, worst 7.7)
- No change. Totes and a holdall stand at seated skirted people's feet without clipping (`g3/K1.png`).
- The haggis sat on the car floor in its bonnet at `teen_skirt`'s feet (`g2/a_teen_skirt_sit_idle_stand.png`). It reads as a small furry creature at 1.5 m.

### 3.8 Whole bodies: 7.88 (typical 8.6, worst 6.8)
- New skin through cloth: the shredded minis, and the dress pulled to the crotch.
- Zero-length normals on every seated drape, and on non-excluded `cloth_` items of the same people such as `adult_piper`'s beret.
- Far seated drapes match the near ones and look acceptable at 9 m.

## 4. Top ten defects, in priority order

1. **Seated minis shred, crotch visible:** `woman_mini`, `teen_skirt` (a teenager), `teen_tube`. Seen in both sit clips, near and far, in two rides.
   - Reproduce: `node gsd2.mjs "mode=ride&q=high&line=inner&station=kelvinbridge" g2/a 300 "$(cat re.txt)" 80`, then look at `*_seatopp.png`.
   - Viewer: `ANGS='[["F",3.4,0.15]]' node shoot2.mjs 0 woman_mini,teen_skirt,teen_tube none sit v0/s`.
   - Until the drape is fixed, these three should stand again.
2. **Zero normals on seated drapes.** `computeVertexNormals` on the Int8 normalised interleaved normal attribute rounds every normal to 0. The cloth renders black in the viewer and flat in the game.
   - Fix: convert `normal` to a Float32 attribute before recomputing (or de-interleave the clone).
   - Reproduce: `node probe.mjs woman_mini,elder_woman_dress,adult_piper 0` (mean normal length 0.006).
3. **`elder_woman_dress`'s dress rides up to the crotch; `adult_beret`'s pencil skirt leaves bare thigh over ragged boot tops.**
   - Reproduce: item 1's command (`g2/K0.png`); `node gsd2.mjs "mode=ride&q=high&line=outer&station=ibrox" g3/a 300 '^(adult_beret|elder_woman_dress)$' 40`.
4. **Sit-down and stand-up pops.** The drape is on or off at full strength while the body crossfades for 0.5 s. It should be blended by the clip weight.
   - Reproduce: `node trans.mjs elder_woman_dress,woman_midi,woman_sash tr/t`; the game rise frames come from `gsd2.mjs` (`*_rise_*`).
5. **Brisk-walk crouch** (`adult_heel_boots`; LEG p10 7.4).
   - Reproduce: `ANGS='[["S",1.57,0.05]]' node shoot2.mjs 0 adult_heel_boots none walk@150,walk@160,walk@170 n/w body 1.6`.
6. **Resting mouths** (`adult_smile_blouse` pursed, `girl_ginger` smiling at rest, `ya_ginger_long` smirk, `teen_runner` / `teen_ginger` crooked), and `man_longcoat`'s white eye.
   - Reproduce: `DIST=0.6 node face4.mjs adult_smile_blouse,girl_ginger,ya_ginger_long,teen_runner f/n "0:0" 0`.
7. **Kilt stride gap:** `man_kilt_casual`'s apron opens mid-stride, showing thigh; kilts seated show 10-20 cm of thigh.
   - Reproduce: `ANGS='[["F",3.4,0.1]]' node shoot2.mjs 0 man_kilt_casual none walk@160,walk@170 n/k body 1.6`.
8. **Turn-away repeats:** `adult_camo_cap` twice and `adult_cap_baggy` in one Hillhead outer run. 6 of 24 boarders turned away there.
   - Reproduce: `OUT=w/hh node gaway5.mjs "mode=explore&q=high&line=outer&station=hillhead" 300`.
9. **Open pole hands and jam bursts** (review 41 items 7-8). Not re-measured; the builder says unchanged.
10. **Hair:** `ya_ginger_long`'s cards over the eye, `woman_puffer`'s fringe, `woman_mini`'s slab. Also the far-model holes (`adult_vneck`, `ya_smile_polo`).
    - Reproduce: review 41 items 9-10.

## 5. What I could not observe

- **No motion watched.** The pops are judged from 0.1 s stills.
- **`adult_piper` and `woman_coat` seated in the game:** the piper was at a pole and the coat did not board. Both were checked only in the viewer.
- **Walking instrument:** I ran only the default 6 people, not all 99.
- **Not re-measured this round:** open pole hands, jam bursts, hair close-ups, far-model holes.
- **A clean seated side view in the game,** to see whether hems pass through the seat front. The aisle views show no cloth through the seat.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| All 16 skirted people seated in the viewer, 3 views, plus standing fronts | all 16 | `v0/S0-3.png`, `v0/ST0.png` |
| Seated skirts in the game, 4 near views + 2 far | Partick outer, Kelvinbridge inner, Ibrox outer rides: 14 of 16 people, both sit clips | `g1/`, `g2/`, `g3/`, `fr/F*.png` |
| Sit-down / stand-up transitions | game: `girl_small`, `teen_tube`, `adult_beret`; viewer: `woman_sash`, `elder_woman_dress`, `man_highland`, `woman_midi` | `g1/T*.png`, `g3/K0.png`, `tr/U*.png` |
| Geometry probe | `woman_mini`, `elder_woman_dress`, `ya_smile_dress`, `man_highland`, `woman_coat`, `adult_piper`, `boy_kilt` | `probe.mjs` output in `NOTES.md` |
| Census, who sits, overlaps, far within 6 m, duplicates | Kelvinbridge inner, Bridge Street outer rides | `g/*.json`, `g/*.log` |
| Turn-aways, edge | Govan inner, Hillhead outer (300 s) | `w/*.log` |
| Player walk-through | St Enoch outer ride, 6 crossings | `c/wk.log` |
| Faces neutral / smiling at 0.6 m | 12 people | `f/NS.png` |
| Walking stills, 3 phases x 2 views | `woman_midi`, `teen_tube`, `man_kilt_casual`, `adult_heel_boots` | `n/W0.png` |
| Walking instrument | default 6 people, 5 speeds | `m/items.log` |

Next round, look at:
- the minis once fixed;
- the drape blend in the transitions;
- `adult_piper` and `woman_coat` seated in the game;
- a seated side view at the seat front.

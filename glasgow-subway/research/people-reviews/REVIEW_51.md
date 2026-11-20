# Under Glasgow: independent review of the people (review 51)

Reviewed: `glasgow-subway` as served from `/home/user/0x4d44.github.io` on 127.0.0.1:8611, at `5ac0d0cf`. The only code change since review 50 (`git diff 83671cd6 HEAD -- glasgow-subway/js`) is in `js/sim/people.js`:
- `_gaitStep`'s `standing` test now includes `state === 'pole'`.
- The static-rider gait branch is skipped while `p.tween && !p.settleGait && !p.gait` (a rider carried by a tween with no gait of their own).
- In a stepped turn the body may lead the feet by 1.0 rad (57 degrees); it was 0.8 rad (46 degrees).
- `_canSit` refuses `woman_midi`, `woman_sash` and `ya_smile_dress`.

No model, garment, face, bag or `gait.js` file changed. I edited nothing in the repository and only read git. Every game script yields to the page between ticks and updates world matrices before it reads bones. Evidence paths are relative to `$R = /tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review51/`. Running notes are in `NOTES.md`. New this round: `turn.py` (turn length, yaw jump at the end of a turn, and toe speed after the turn), and toe (`ball_*`) speeds read alongside ankle speeds. Review 50 read ankles only.

**Result: weighted mean 8.28 (8.275). Gate NOT met.** The mean is not above 9. Every category is at 8 or above.

- **Fixed:**
  - Pole and rail holders' feet slide. They now move 0.1-0.2 cm over 20 s, in a moving car and on a stopped one.
  - The 24-39 cm, 2.6 m/s skate in seated rises. Rises now slide 6-13 cm at 0.3-0.9 m/s, which is review 49's level.
- **Partly fixed:** the stepped turn. A controlled 120-degree turn takes 2.6-2.75 s, against 3.1-3.2 s. A game turn of 90 degrees from a seat still takes 2.23-2.3 s.
- **New (found this round, made more frequent by the pole change):** at the end of a standing rider's stepped turn whose yaw crosses plus or minus pi, **both feet spin a full 360 degrees about the ankle in 0.17 s.** Toes move at 2.5-7 m/s. This happened in 3 of the 4 standing moves I logged in the game.

## Scores

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 8.8 | 7.1 | **8.12** |
| 2 | Arms and hands | 10 | 8.9 | 7.7 | **8.42** |
| 3 | Faces | 10 | 8.8 | 7.6 | **8.32** |
| 4 | Standing, sitting, behaviour | 10 | 9.1 | 7.4 | **8.42** |
| 5 | Range of people | 10 | 8.7 | 7.7 | **8.30** |
| 6 | Clothing | 15 | 8.8 | 7.5 | **8.28** |
| 7 | Luggage | 10 | 8.8 | 7.4 | **8.24** |
| 8 | Whole bodies | 15 | 8.7 | 7.6 | **8.26** |
| | **Weighted mean** | 100 | | | **8.28** (8.275) |

0.20x8.12 + 0.10x8.42 + 0.10x8.32 + 0.10x8.42 + 0.10x8.30 + 0.15x8.28 + 0.10x8.24 + 0.15x8.26 = 1.624 + 0.842 + 0.832 + 0.842 + 0.830 + 1.242 + 0.824 + 1.239 = 8.275.

Changes against review 50 (8.253):
- **Behaviour +0.10.**
  - Typical +0.1: pole holders, who are most of the standing riders near the player in a moving car, now stand still on their feet.
  - Worst tenth +0.1:
    - The rise skate and the pole shuffle are gone.
    - Against that, the new foot spin at the end of standing moves, the 2.2-2.7 s turns and the sit-down slide remain.
- **Clothing +0.08.** The three skirts whose seated shapes were rigid shells now stand. The worst seated skirt left is `boy_kilt`'s band.
- **Every other category is unchanged.** The walking instrument reads the same (9.51; LEG p10 and SMO p10 7.4).

## 1. Builder's claims: verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Pole and rail holders count as standing; feet planted, 0.1-0.2 cm | **TRUE.**<br>- Buchanan outer, moving train, 20 s: `woman_mini` (`stand_hold_pole`) 0-0.2 cm; `woman_coat` (`stand_hold_rail`) 0.2 cm. `wL` is 1 throughout.<br>- Cowcaddens inner, 20 s: `woman_midi`, `woman_coat`, `teen_girl`, `adult_piper`, `teen_tube`, `teen_skirt` and `man_kilt_casual` at poles, all 0.1-0.2 cm.<br>- Legs: front stills, gait on against gait off, look the same (`woman_mini` at a rail, `sv/SV1.png`). Several pole holders hold both knees at 3.6-4 degrees for the full 20 s. The stance reads as straight-legged but natural.<br>- Side effect: pole holders now get the standing gait again after a stepped turn. That exposes the foot spin (item 1 below). | `st_bu_ride.json`, `st_cc.json`, `sv/SV1.png` |
| 2 | No gait for a rider carried by a rise tween; grounded foot at most 0.3-0.6 m/s | **TRUE in substance. The speed bound is slightly exceeded.**<br>- 7 seated rises with a sideways tween (Hillhead inner, Govan outer): grounded travel in the tween is 6-13 cm. Speeds:<br>&nbsp;&nbsp;- `girl_shorts` 0.33 m/s<br>&nbsp;&nbsp;- `staff_woman` 0.36<br>&nbsp;&nbsp;- `ya_ginger_braid` 0.34<br>&nbsp;&nbsp;- `girl_leggings` 0.68-0.79 (toe)<br>&nbsp;&nbsp;- `ya_shorts` 0.77-0.88 (toe)<br>- The 24-39 cm skate at 2.6 m/s is gone. This is back to review 49's 8-13 cm slide, which is still a slide.<br>- `r/GS.png`: `girl_shorts` stands up cleanly. | `r/h_*.json`, `r/g_*.json`, `r/h2_*.json`, `python3 an2.py r/*.json`, `r/GS.png` |
| 3 | Body may lead feet by 57 degrees for quicker turns | **TRUE, modest gain.**<br>- Controlled 120-degree turns on the spot (Ibrox outer, 4 riders): the turn phase is 157-165 frames, 2.62-2.75 s (review 50: 3.1-3.2 s). 90 % of the yaw is done by 1.8 s.<br>- Game turns:<br>&nbsp;&nbsp;- About 90 degrees after a seated rise: 2.23-2.30 s (review 50: 2.27-2.62 s), so no change.<br>&nbsp;&nbsp;- 130 degrees: 2.75 s.<br>&nbsp;&nbsp;- 172-177 degrees: 3.65 s (review 50: 4.47 s).<br>- Still about 45 degrees per second. | `c2/*.json`, `python3 turn.py c2/*.json r/*.json` |
| 4 | `woman_midi`, `woman_sash` and `ya_smile_dress` stand; `woman_dress`, `girl_small`, `girl_school_kilt`, `boy_kilt` and `adult_piper` sit | **TRUE for the three that now stand. Partly wrong about who sits.**<br>- `gseat` at St Enoch outer: `woman_midi`, `woman_sash` and `ya_smile_dress` give `canSit false on all seats`.<br>- `adult_piper` also gives `canSit false on all seats`, so he does not sit here, though the claim lists him.<br>- Seated stills:<br>&nbsp;&nbsp;- `woman_dress`'s dress drapes acceptably (`g/S2.png`).<br>&nbsp;&nbsp;- `girl_small` and `girl_school_kilt` are fine.<br>&nbsp;&nbsp;- **`boy_kilt`'s kilt still rides up to a band at the hips, with the whole thigh bare, visible at 2.4 m** (`g/S1.png`, bottom row). | `g/s.log`, `g/S1.png`, `g/S2.png` |
| 5 | Not changed: crouch, start-up dip, sit slide, clip-change slide, case orbit, faces, kilts, hair, pole hands, turn-aways, phones in hair, garment mix | **Confirmed unchanged.**<br>- Walking instrument: 9.51, LEG p10 7.4, SMO p10 7.4.<br>- Clip-change slide: `teen_tube` 5.6-5.9 cm going from `idle_b` to `phone_stand`.<br>- Case orbit: `ya_tube_heels`'s case moves from her left-rear to her right side during a 172-degree game move (`r/TR.png`).<br>- Faces (`f/N.png`, `f/S.png`).<br>- `man_highland`'s kilt opens mid-stride on both models (`far/F.png`). | `m/def.log`, `st_bu_ride.json`, `r/TR.png`, `f/`, `far/F.png` |

## 2. Status of REVIEW_50's top ten

| # | REVIEW_50 item | Now |
|---|---|---|
| 1 | Seated rise with a sideways tween skates a foot 24-39 cm at 2.6 m/s | **Fixed** (6-13 cm at 0.3-0.9 m/s). |
| 2 | Pole and rail holders' feet slide | **Fixed** (0.1-0.2 cm). |
| 3 | Slow stepped turn | **Partly:** 120 degrees in 2.6-2.75 s (was 3.1). Game 90-degree turns are unchanged at 2.2-2.3 s. |
| 4 | Standing wheeled case orbits its owner in a turn | Unchanged (`r/TR.png`). |
| 5 | Heel and pencil-skirt crouch | Unchanged (LEG p10 7.4). |
| 6 | Feet slide in the sit | Unchanged (code untouched; not re-measured). |
| 7 | Faces | Unchanged. One further detail: the smile pulls a dark dot or seam at the mouth corner on `girl_shorts` and `sum_denim_shorts_m` (`f/zoom1.png`). |
| 8 | Seated skirt shells | **Three of four removed** (they stand). **`boy_kilt`'s band remains.** |
| 9 | Start-up dip; clip-change foot slide | Unchanged (clip change 5.6-5.9 cm). |
| 10 | Garment clumps, kilt mid-stride, hair, pole hands, turn-aways, phones in hair | Unchanged.<br>- Partick: one platform sample within 15 m was 57 % trousers.<br>- Kilt opens mid-stride.<br>- Ragged hairlines on `teen_hood` and `teen_skirt`. |

## 3. Per-category reasoning

### 3.1 Walking: 8.12 (unchanged)
- Instrument: 9.51, with LEG p10 and SMO p10 at 7.4. The worst recordings are `woman_coat` (loading knee 4.2-4.7) and `woman_midi` / `boy` (pelvis acceleration 5.0-5.3).
- Turns are about 15 % quicker but still slow.
- I put the foot spin under behaviour, where moves are judged. Counting it here too would double-count.

### 3.2 Arms and hands: 8.42 (unchanged)
- No arm or hold code changed.
- Riders still hold a rail at a long arm's reach (`r/TR.png`).

### 3.3 Faces: 8.32 (unchanged)
- 25 faces at 0.6 m, neutral and at full smile: 20 new picks (seed 51) and 5 flagged before.
- Faults:
  - `elder_shorts`: blotchy skin, pale eyes, a red dot on the cheek, a twisted smile.
  - `teen_hood`: duck lips and a lopsided smile.
  - `woman_midi`: a frown under a smirk.
  - `adult_cap_shorts`: a crooked smirk and a notched cap.
  - `ya_smile_polo`: lopsided.
  - Dour neutral mouths.
  - The same spiky-black-hair face template on `man_hoodie`, `man_kilt_casual`, `sum_denim_shorts_m`, `adult_casual5` and `ya_smile_polo`.
- Most smiles are gentle and read as natural (`adult_beret`, `ya_bootcut`, `elder_woman_coat`).

### 3.4 Standing, sitting, behaviour: 8.42 (typical 9.1, worst tenth 7.4)
- **Typical:** everyone standing, at a pole or not, now has still feet. Seated rises are smooth enough at 3 m (`r/GS.png`).
- **Worst tenth:**
  - **The foot spin.** In `woman_puffer`, `adult_cyclist` and `adult_harem` (Hillhead inner and Govan outer), the turn gait lets go at the end of a stepped turn and `p.yaw` is rewrapped by 2 pi (-4.712 to 1.571). The new standing gait then blends in over 10 frames. In those frames each foot's heading runs -83, -144, -176, 151, 118, 88, 59, 31, 4, -24, -52, -80 degrees: a full turn, with the two feet spinning opposite ways. Toes move at 2.5-7 m/s and ankles at 0.4-1.4 m/s. In stills, the feet point backwards and the legs look crossed (`r/SPIN.png`, `r/SPIN2.png`). Turns that do not cross the wrap (all seat turns, `ya_tube_heels`) are clean.
  - The seated-rise slide of 6-13 cm.
  - Turns of 2.2-2.7 s.
  - The 5-6 cm clip-change slide.

### 3.5 Range of people: 8.30 (unchanged)
- 99 characters: 37 women, 24 men, 13 teens, 12 elders, 6 girls, 5 boys, 2 staff.
- A child (`girl_small`) stands alone on the platform with a rucksack (`sv/SV1.png`), and a girl in a MIDGE T-shirt stands alone in a car aisle (`eye/E2.png`).

### 3.6 Clothing: 8.28 (typical 8.8, worst tenth 7.5)
- **Gain:** the rigid seated shells of the midi, sash and smile-dress are gone, because those women stand.
- **Remaining:**
  - `boy_kilt` seated as a band over bare thighs.
  - The kilt opening mid-stride.
  - One 57 % trousers platform sample.
- Partick census: every garment kind was seen, and cars were at most 44 % of one kind.

### 3.7 Luggage: 8.24 (unchanged)
- The case orbit is unchanged (`r/TR.png`).
- A holdall, a shopper, a tote, a rucksack and a trolley were all carried normally in the game samples.

### 3.8 Whole bodies: 8.26 (unchanged)
- Partick, explore then board then ride, 366 s: no far model within 6 m, no overlaps, no duplicates, 25 stair walks with no stall.
- Near and far models match at 8 m (`far/F.png`).

## 4. Top ten defects, in priority order

1. **A full 360-degree foot spin in 0.17 s at the end of a standing rider's stepped turn that crosses plus or minus pi.** Seen in 3 of 4 standing moves: `woman_puffer` (stand), and `adult_cyclist` and `adult_harem` (pole).
   - Cause: `_settleTurnStep` sets `p.yaw = w.yaw`, which jumps 2 pi from the unwrapped turning yaw. The standing gait that `_gaitStep` then makes blends its feet from the old heading across the 2 pi difference.
   - Reproduce: `NEARCAM=3 KIND=rise SIDE=1 FR=300 node gsit.mjs "mode=ride&q=high&line=inner&station=hillhead" r/h2 900 8`, then `python3 turn.py r/h2_*.json` (`yaw jump after 6.28`, `max toe v after turn` 5-7 m/s).
   - Stills: `r/SPIN.png`.
   - Fix: wrap the yaw (or the gait's foot `psi`) before the new gait is made, or carry the old gait's feet over.
2. **Stepped turns are still slow for game turns.** 90 degrees takes 2.23-2.3 s, 130 degrees 2.75 s, and 175 degrees 3.65 s. A controlled 120-degree turn takes 2.6-2.75 s.
   - Reproduce: `NOMOVE=1 FR=300 node ctl4.mjs "mode=ride&q=high&line=outer&station=ibrox" c2/turn move 4 120`, then `python3 turn.py c2/*.json`.
3. **A standing wheeled case orbits its owner in a turn.**
   - Reproduce: the `g_4` run above (`ya_tube_heels`); see `r/TR.png`.
4. **Heel and pencil-skirt crouch, and the walking worst cases.** LEG p10 and SMO p10 are 7.4 (`m/def.log`); `woman_coat`'s loading knee scores 4.2.
5. **Seated-rise slide:** 6-13 cm at up to 0.9 m/s (`r/*.json`, `an2.py` S rows).
6. **Sit-down foot slide** (14-17 cm in review 50; code unchanged).
7. **Faces:** `elder_shorts`' blotchy face and blank eyes, the lopsided smiles of `teen_hood` and `ya_smile_polo`, `woman_midi`'s frown, the dot at the smile's mouth corner, the dour neutral mouths, and the repeated spiky-hair template (`f/N.png`, `f/S.png`, `f/zoom1.png`).
8. **`boy_kilt` seated:** the kilt rides to a band at the hips with the thighs bare (`g/S1.png`).
   - Reproduce: `node gseat.mjs "mode=ride&q=high&line=outer&station=st-enoch" g/s boy_kilt`.
9. **Start-up dip** for three men; a **5-6 cm foot slide on a clip change** while standing (`teen_tube`, `st_bu_ride.json`).
10. **Minor and carried over:**
    - The kilt opening mid-stride (`far/F.png`).
    - Garment clumps (57 % trousers once).
    - Ragged hairlines.
    - Pole hands at long reach.
    - Turn-aways and phones in long hair (not re-imaged).
    - Children standing alone.

## 5. What I could not observe

- **No motion was watched.** Everything comes from 0.1 s stills and 60 Hz bone logs.
- **The foot spin is seen in only 2-3 stills per event**, because the stills are 0.1 s apart and the spin lasts 0.17 s. The bone log is unambiguous.
- **The controlled wheeled-case turn found no case-carrier in car 1 at Ibrox or Hillhead** (`c5/log`: `no cand`). The orbit was judged from a game move (`r/TR.png`) and has no number this round.
- **The haggis owner sat in a train for the whole 180 s run**, so I saw the haggis only seated, at his feet (`g/S2.png`). It was not re-imaged walking.
- **Not re-measured:** the sit-down slide, the start-up dip, phones in hair, platform-bench rises.
- **Most `sv.mjs` cameras were blocked** by walls and benches. I have one clear pole-holder front view.

## 6. What I sampled

| What | Who / where | Evidence |
|---|---|---|
| Standing and pole feet, 20 s | Buchanan outer ride (moving); Cowcaddens inner explore: 7 pole holders and about 20 standers | `st_bu_ride.json`, `st_cc.json` |
| Pole-holder legs, gait on and off | Buchanan outer: `woman_mini`, `adult_piper` (blocked), and others | `sv/SV1.png` |
| Game rises and moves, 60 Hz | 14 events, Hillhead inner x2 and Govan outer: `girl_shorts`, `elder_shorts`, `staff_woman` x2, `sum_loose_shorts_w`, `ya_ginger_braid`, `teen_hood`, `woman_puffer`, `adult_cyclist`, `ya_shorts`, `adult_harem`, `girl_leggings`, `sum_shorts_asian_m`, `ya_tube_heels` (trolley) | `r/`, `r/GS.png`, `r/SPIN.png`, `r/TR.png` |
| Controlled 120-degree turns | Ibrox outer: `teen_skirt`, `elder_woman_dress`, `woman_sash`, `teen_crop_leggings` | `c2/` |
| Seated garments as the game seats them | St Enoch outer: `woman_dress`, `girl_small`, `girl_school_kilt`, `boy_kilt`, `adult_string_vest` (with the haggis); refusals for `adult_piper`, `woman_midi`, `woman_sash`, `ya_smile_dress` | `g/S1.png`, `g/S2.png`, `g/s.log` |
| Faces at 0.6 m, neutral and full smile | 25 people (20 new, seed 51) | `f/N.png`, `f/S.png`, `f/zoom1.png`, `f/zoom2.png` |
| Census, far models, duplicates, overlaps, stairs | Partick outer, explore then board then ride, 366 s | `cen/pk.json`, `cen/pk.log` |
| Player walking the full train | Kelvinbridge inner ride | `eye/E1.png`, `eye/E2.png` |
| Near against far models | 6 people at 8 m | `far/F.png` |
| Walking instrument | Default set | `m/def.log` |
| Haggis | Buchanan inner (owner seated throughout) | `hg/log` |

Next round, look at:
- Foot spin after a fix (log toes, not only ankles).
- The wheeled case in a game turn, measured.
- The haggis walking.
- Platform-bench rises.
- The sit-down slide.

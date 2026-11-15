# Under Glasgow: independent review of the people (review 1)

Reviewed: the 85 characters in `models/people.glb` as served from the working tree of
`/home/user/0x4d44.github.io/glasgow-subway` (HEAD 111770ce). Scored against
`research/people-rubric.md`. Each category = 0.6 x typical + 0.4 x worst tenth.

**Result: weighted mean 6.1. Gate NOT met** (needs mean > 9 and no category below 8; every
category is below 8).

All paths below are under
`/tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review/` (written `$RV/`).

Caveats on what I reviewed:

- `js/sim/people.js` has an **uncommitted** edit to `_rollPool` (27% shorts and leggings, 40% trousers).
  The viewer and the game served that edit, so my crowd counts reflect it, not the committed mix. The
  committed mix draws the "rest" pool (67% of a crowd) from a list that is about 80% trousers, so the
  committed crowd is well over half trousers. The comment in that edit also says "58 of the 99 people in
  the file"; the file has 85.
- Nothing here was watched as moving video. Motion is judged from frozen frames (8 phases per stride),
  bone measurements and a tick census. Per the rubric I marked down, not up, for what I could not see.
- A ride at Kelvinhall (`$RV/g/ride_eye.png`, `$RV/g/ride_census.json`) listed 13 people, all standing or
  walking on the platform; it gave me no seated close-ups in a real car, so seated poses are judged from
  the viewer only.
- File-name quirk in the provided shooter: `_b.png` is the front quarter and `_f.png` the back quarter.
- In the provided `shoot.mjs`, `forcelod=1` did not switch walking people to the LOD model (they report
  `lod:false`). **LOD walking was not evaluated**; LOD standing and sitting were.

## 1. What I sampled

| What | Who / how | Sheets |
|---|---|---|
| Bodies: stand, walk, sit, 3 views, full and LOD | 27 people: adult_runner, ya_shorts, woman_midi, adult_harem, woman_sash, adult_beret, ya_smile_dress, adult_cyclist, adult_string_vest, man_highland, man_trews, man_kilt_casual, adult_tophat, man_longcoat, teen_tube, teen_skirt, teen_hood, elder_woman_dress, elder_man_cap, woman_elder, girl_small, girl_school_kilt, girl_leggings, boy_kilt, boy_small, staff_woman, adult_piper | `$RV/a/sheet_g1L0.png`, `g2L0`, `g3L0` (full); `g1L1`, `g2L1`, `g3L1` (LOD); crops `_c0.._c2`; zoomed faults `$RV/a/z1.png` |
| Legs and feet close-up | kilt and trouser wearers | `$RV/b/sheet_legsL0.png`, `$RV/b/sheet_legsL1.png` |
| Walk, 8 phases of one stride, side and front | 14 people: adult_runner, man_elder, girl_small, boy_small, woman_midi, man_highland, adult_string_vest, elder_woman_dress, ya_tube_heels, teen_skater, staff_hivis, woman_coat, adult_heel_boots, man_student | `$RV/w/sheet_side.png`, `$RV/w/sheet_front.png` (+ `_c0.._c2`) |
| Arm measurements while walking | 10 people, hand/elbow/palm per phase (`arms.mjs`) | `$RV/arms0.txt` |
| Faces at 0.6 m: neutral front, 3/4, eyes shut, smile front, smile 3/4 | 18 people: adult_runner, woman_midi, elder_woman_dress, man_elder, girl_small, boy_small, teen_hood, adult_string_vest, woman_sash, ya_smile_dress, adult_tophat, elder_man_suit, girl_ginger, boy_cap, staff_hivis, teen_tube, adult_suit_bun, man_beard | `$RV/f/sheet_A.png`, `$RV/f/sheet_B.png` |
| Blink and smile census, 120 s each, standing and sitting | 6 people (`blink.mjs`) | numbers in section 2.3 |
| Luggage: all 10 kinds, stand/walk/sit/stairs, full and LOD | man_commuter, woman_dress, plus girl_small, adult_string_vest (dog), elder_woman_coat | `$RV/l/sheet_man_commuter_1.png`, `_2.png`, `$RV/l/sheet_woman_dress_1.png`, `_2.png`, `$RV/l/sheet_x1.png`, `x2` (stairs), `x3` (LOD) |
| Hands close-up, 8 hand pairs x 3 views, standing and walking | man_commuter, woman_dress with none / handbag / cabin trolley / holdall | `$RV/h/sheet_A.png` (+ `_c0`, `_c1`) |
| The real game (`tools/test_sim.html`), platform crowds | Buchanan St, Hillhead, Partick, St Enoch: 40 spawned people, census and close-ups | `$RV/g/bs_eye.png`, `$RV/g/sheet_bs.png`, `$RV/g/*_census.json` |
| Roster census | all 85, from `people_meta.json` and the recipes | section 2.5 |

Scripts (all mine, in `$RV/`): `crop.py`, `mont.py`, `face.mjs`, `blink.mjs`, `arms.mjs`, `game.mjs`;
provided: `shoot.mjs`, `sheet.py`. I did not run `tools/test_sim.mjs` (its log shows 124/124).

## 2. Scores by category

| # | Category | Weight | Typical | Worst tenth | Score |
|---|---|---|---|---|---|
| 1 | Walking | 20 | 7.0 | 6.0 | **6.6** |
| 2 | Arms and hands | 10 | 6.0 | 5.0 | **5.6** |
| 3 | Faces | 10 | 6.5 | 4.0 | **5.5** |
| 4 | Standing, sitting, behaviour | 10 | 6.5 | 5.0 | **5.9** |
| 5 | Range of people | 10 | 7.5 | 6.5 | **7.1** |
| 6 | Clothing | 15 | 7.0 | 5.0 | **6.2** |
| 7 | Luggage | 10 | 7.5 | 6.0 | **6.9** |
| 8 | Whole bodies | 15 | 6.5 | 3.0 | **5.1** |
| | **Weighted mean** | 100 | | | **6.1** |

### 2.1 Walking: 6.6 (typical 7.0, worst 6.0)

Legs are the best part: heel strike, toe-off and knee flexion read correctly in all 14 strides.

1. **The upper body spoils every stride** (see 2.2): the forward arm is held out with an open hand, visible
   at 3.6 m, on all 14 people, full model, side and front (`$RV/w/sheet_side.png`).
2. **Everyone walks the same walk.** Elbow angle runs 20 to 48-49 degrees identically for all 10 measured
   people, child and elder included (`$RV/arms0.txt`). man_elder and elder_woman_dress stride like
   adult_runner; girl_small and boy_small are scaled adults.
3. **Narrow, crossing "catwalk" steps**: adult_runner, woman_midi, ya_tube_heels, front view
   (`$RV/w/sheet_front_c0.png`). Fine on a heeled woman, wrong as a universal.
4. **adult_heel_boots**: jeans show through the knee boots at shin and calf on every frame, side view
   (`$RV/w/sheet_side_c2.png`). **woman_coat**: a grey flap hangs detached behind the thigh on frames
   140 and 180-196.
5. Not seen: starts, stops, turns, stairs in motion, LOD walking. Marked down for that.

### 2.2 Arms and hands: 5.6 (typical 6.0, worst 5.0)

1. **Walking arm, all walkers, full model, side and 3/4 view.** The forward-swinging arm is held out in
   front with the elbow at 48 degrees and a flat, open, spread-finger hand. It reads as offering or
   begging. Hand travel relative to the shoulder is -0.06 to +0.33 m: almost no back-swing.
2. **Hands carried wide.** Hands sit 6 to 18 cm outside the shoulder line: man_highland 13-18 cm,
   woman_elder 9-15, woman_midi 9-13 (`$RV/arms0.txt`).
3. **No hand grips anything.** In all 8 close-up hand pairs the fingers are straight. The handbag and
   holdall handles hang beside or below an open hand; the trolley handle sits near an open palm
   (man_commuter, woman_dress, walking and standing, `$RV/h/sheet_A_c0.png`, `_c1.png`).
4. **Carried bags swing forward on the open hand** at waist height when walking: tote, carrier, briefcase,
   handbag, holdall, shopper (`$RV/l/sheet_man_commuter_1_c0.png`). A loaded arm should hang.
5. **Standing phone call**: the hand lies flat against the head, no phone grip (man_commuter stand side,
   `$RV/l/sheet_x3.png` row 1).
6. Standing hands at rest are acceptable: slightly curled, plausible at 2 m.

### 2.3 Faces: 5.5 (typical 6.5, worst 4.0)

1. **Hair slab over one eye.** The bob01/bob02 asset covers an eye or half the face on woman_midi,
   elder_woman_dress, girl_small, woman_sash (front, full model, `$RV/f/sheet_A.png`). The same asset is
   on woman_dress, ya_smile_halter, woman_elder, elder_woman_coat: 8 characters.
2. **adult_suit_bun**: black needle shards across the forehead and beside the ears; the bun is a tangle of
   shards (`$RV/f/sheet_B.png`). Rubric 0-3 territory for that head.
3. **man_beard** has no beard and a fringe slab over one eye. **boy_cap** has a black slab under the cap
   over one eye.
4. **Blocky painted hairlines**: grey rectangular notches on man_elder, elder_man_suit; zigzag steps on
   adult_runner, girl_ginger, staff_hivis, teen_hood. Visible at 1-2 m.
5. **The smile is a closed, crooked "V" smirk** with no cheek or eye change (girl_ginger, staff_hivis,
   adult_tophat, smile columns). 4 of 85 have no mouth found at all (e2e log: 81/85).
6. **No ambient expression.** Smile maximum was 0.000 over 120 s for all 6 people, standing and sitting.
   The smile only fires when the player approaches within 9 m.
7. **Shut eyes are blank flesh ovals**; the lash outline stays open (eyes-shut column). Blinks are short
   (0.12 s) so this mostly escapes notice. Blink rate 8 to 14.5 a minute: real, a little low.
8. **Eyes never move**: fixed straight ahead. Thin pencil brows. Reddish irises on teen_tube,
   ya_smile_dress, teen_hood.

### 2.4 Standing, sitting, behaviour: 5.9 (typical 6.5, worst 5.0)

1. **Seated idle and seated look poses hold both forearms out with palms up**, like a shrug or a
   gesture, not rest. Seen at the sampled frame on adult_harem, adult_beret, ya_shorts,
   adult_string_vest, man_trews, man_longcoat, teen_tube, teen_skirt, woman_elder, girl_small, boy_small,
   staff_woman (full and LOD, front and side, `$RV/a/sheet_g1L0_c2.png` and siblings). With a bag on the
   lap the arms spread round it (woman_dress, holdall and shopper). Caveat: one frozen frame per clip; I
   could not confirm how long the pose lasts in a real car.
2. **girl_small, sit_cross_legs**: legs splay sideways.
3. **adult_piper**: the drone crosses the face when seated; makes a phone call while holding the pipes.
4. **Typing on a phone with a paper shopper raised to the chest** (man_commuter standing, shopper).
5. **Seated bags stand bolt upright on the lap** against the chest; seated trolleys stand against the knee.
6. **The same faces at every station.** ya_knit and elder_man_cap appeared on all four platforms I
   sampled; Buchanan St and St Enoch had the identical ten people. Platform crowds are only 10.
7. Standing idles themselves (weight shift, phone, talk) are plausible.

### 2.5 Range of people: 7.1 (typical 7.5, worst 6.5)

Roster of 85: woman 32, man 26, teen 10, elder 6, girl 5, boy 4, staff 2. Skin sets: 50 / 20 / 15.

1. **Build barely varies.** Weight parameter is 0.35-0.60 for 84 of 85; only adult_string_vest is heavy.
2. **Nobody is tall.** Heights 1.12 to 1.80 m with a hard cap at 1.80.
3. **Age gap.** Nothing between age 0.72 and 0.86; elders are 6 of 85 (7%). No babies, no buggies.
4. **No stick, wheelchair or other mobility aid**, and children are scaled-down adults in proportion.
5. **Kilts are far over-represented.** 11 of 40 spawned people (27%) wore a kilt, trews, sash or Highland
   dress. On a Glasgow platform that is a wedding party, not a crowd.

### 2.6 Clothing: 6.2 (typical 7.0, worst 5.0)

Garment models and fabrics are good at 2 m when standing. Faults:

1. **Roster is 68% trousers** (58 of 85). Lycra shorts: 1 person (adult_cyclist). Crop top: 1
   (adult_runner). Denim shorts: 2, same garment. Heels: 3. T-shirts about 14, 8 of them one garment.
2. **The crowd mix swings the other way under the uncommitted edit**: 40 spawned people gave leggings 12,
   trousers 13, tartan 11, shorts 2, skirts 2. Leggings come from only 7 characters, so ya_knit and
   adult_leggings_knit recur. No garment is over half, but the mix is not a believable street.
3. **Cloth does not stay whole when the body bends** (detail in 2.8): kilt hole, skin through jeans and
   trousers seated, torn skirt walking.
4. **Ragged hems**: woman_midi sweater (back), woman_elder jeans (dark ankle patches), elder_woman_coat
   coat hem (white bits, walking, back), girl_school_kilt sleeves, teen_hood jeans.
5. **Seated kilt rides up to expose the whole thigh** (man_highland, sit, side). boy_kilt has one garter
   flash only. ya_shorts: belly shows under the tee. boy_small: skin band at the waist (back).
   staff_woman: dark blotches on the dungarees.
6. No cloth movement was observable in stills; not credited.

### 2.7 Luggage: 6.9 (typical 7.5, worst 6.0)

The ten bag models are good. Rucksack straps sit correctly on the shoulders.

1. **No hand holds a handle** (2.2 item 3): handbag, holdall, shopper, carrier, tote, briefcase, trolley.
2. **Carried bag rides forward on the swinging open hand** when walking.
3. **Stairs: the large case is not lifted.** Its base stays at or below foot level for man_commuter and
   woman_dress (`$RV/l/sheet_x2.png`); it would pass through the steps. Cabin case lifts about 10 cm.
4. **The dog lead is a rigid straight red line** from the hip, vertical when seated (adult_string_vest,
   `$RV/l/sheet_x1.png`).
5. **Few people carry anything.** 11 of 40 spawned people (27%) had a bag; none had a trolley in 40.
   For a line serving a main rail station that is thin.
6. Seated: bag upright on the lap, arms spread round it; trolley against the knee.

### 2.8 Whole bodies: 5.1 (typical 6.5, worst 3.0)

1. **man_highland and adult_piper: a large triangular hole in the kilt** at the side and back, bare skin
   showing, standing and walking, **full and LOD** (`$RV/b/sheet_legsL0.png`, `$RV/b/sheet_legsL1.png`,
   `$RV/a/z1.png`, `$RV/w/sheet_side_c1.png`). Also a light gap between hose and shoe. Broken at 6 m.
   man_highland appeared on 2 of 4 platforms.
2. **teen_hood, seated**: skin through the jeans at thigh, hip and knee (full); much larger on LOD.
3. **man_commuter (plain black trousers)**: skin-coloured holes on the seat and back of the thighs,
   walking and standing, back view, full model, clear in close-up (`$RV/h/sheet_A_c0.png`, right column).
   Seated: speckles at the hip.
4. **man_trews, seated**: skin patches at the hip, full and LOD. **adult_beret, seated**: holes at the
   thighs in the pencil skirt, front.
5. **woman_midi, walking**: tear with skin at the front thigh, frames 148-164, front
   (`$RV/w/sheet_front_c0.png`). LOD: red sweater blotches over the skirt.
6. **LOD model at close range.** Only the nearest 5 people on a platform get the full model (2-3 on low
   quality), so the 6th-nearest is LOD at 3-4 m. LOD faults: teen_hood trainers are crumpled shards;
   woman_elder shoes are black wedges and her sweater back has big holes seated.
7. **adult_suit_bun hair shards** (2.3). man_kilt_casual: skin streak on the hose (back), holes at the
   boot seated.

## 3. Gate

Weighted mean = 0.20 x 6.6 + 0.10 x 5.6 + 0.10 x 5.5 + 0.10 x 5.9 + 0.10 x 7.1 + 0.15 x 6.2 + 0.10 x 6.9
+ 0.15 x 5.1 = **6.1**. The gate needs more than 9 and no category under 8. **Not met**: the highest
category is 7.1.

## 4. The ten fixes that would raise the score most, in order

1. **Close the kilt hole** on man_highland and adult_piper, full and LOD, standing and walking (side and
   back views); close the hose-to-shoe gap. Evidence: `$RV/b/sheet_legsL0.png`, `$RV/a/z1.png`.
2. **Rebuild the walking arm swing** for everyone: curl the fingers, cut the 48 degree elbow, add real
   back-swing, bring the hands in to the hip line (now 6-18 cm outside the shoulder), and vary it by
   person, age and load. Evidence: `$RV/w/sheet_side.png`, `$RV/arms0.txt`.
3. **Stop skin showing through cloth**: man_commuter trousers (back, walking and standing), teen_hood
   jeans (seated), man_trews (seated hip), adult_beret skirt (seated front), woman_midi skirt (walking
   front, frames 148-164), adult_heel_boots jeans through boots (walking side). Then run the same check
   over all 85 in stand, walk and sit; I sampled 27.
4. **Fix the hair**: bob01/bob02 slab over the eye (8 characters, front), adult_suit_bun shards, man_beard
   fringe and missing beard, boy_cap slab, and the blocky hairlines (man_elder, elder_man_suit,
   adult_runner, girl_ginger, staff_hivis, teen_hood). Evidence: `$RV/f/sheet_A.png`, `sheet_B.png`.
5. **Seated rest poses**: sit_idle and sit_look should rest hands on thighs or lap, not hold forearms out
   palms up; with a lap bag, hands on the bag. Fix girl_small sit_cross_legs. Evidence:
   `$RV/a/sheet_g1L0_c2.png`, `$RV/l/sheet_woman_dress_1.png`.
6. **Make hands grip**: a closed-finger pose for handles (handbag, holdall, shopper, carrier, tote,
   briefcase, trolley) and for the phone; let the loaded arm hang still when walking. Evidence:
   `$RV/h/sheet_A_c0.png`, `_c1.png`.
7. **LOD at close range**: raise the full-model count on platforms above 5, and repair LOD shoes
   (teen_hood, woman_elder), the woman_elder sweater back and the woman_midi blotches. Then shoot LOD
   walking, which nobody has reviewed. Evidence: `$RV/a/sheet_g3L1.png`.
8. **Faces**: a smile that moves cheeks and eyes and is not a crooked V; occasional ambient smiles and
   glances without the player; eye movement; lashes that close with the lid; fix reddish irises
   (teen_tube, ya_smile_dress, teen_hood) and the 4 characters with no mouth target.
9. **Crowd and roster mix**: cut tartan from 27% of a crowd to a few per cent; add more shorts, Lycra,
   crop tops and T-shirt characters so leggings do not rest on 7 people; widen build (only 1 heavy
   person), height (none over 1.80 m) and age (fill 0.72-0.86, more elders); vary the crowd by station
   (ya_knit and elder_man_cap were at all four). Commit or drop the `_rollPool` edit and correct its
   "99 people" comment.
10. **Luggage handling and hems**: lift the large case on stairs (man_commuter, woman_dress,
    `$RV/l/sheet_x2.png`); a slack dog lead; lay lap bags flat; stop phone-typing with a shopper raised;
    more people with bags (27% now, no trolleys in 40); tidy ragged hems on woman_midi, woman_elder,
    elder_woman_coat, girl_school_kilt, and the woman_coat flap.

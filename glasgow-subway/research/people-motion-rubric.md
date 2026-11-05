# How well do the people walk and move? A scoring rubric

Asked for: "Arm movements and walking is still, well, kinda strange. There must be plenty of prior art for us to draw on" - then "define a scoring rubric for people walking and moving, iterate to improve it, get a subagent to adversarially review against the rubric and iterate until the score is > 9."

This note is the rubric, how it is measured, where its targets come from, and a log of the scores. The measuring code is `js/sim/motion_metrics.mjs`; the recorder is `tools/people_motion.html`; the driver is `tools/people_motion.mjs`. The table below is printed by `node tools/people_motion.mjs --rubric`, so the three cannot drift (a unit test compares them).

**What this can and cannot tell you.** It measures the *motion*: where the feet, knees, pelvis, shoulders, hands and head are in every frame, in numbers. It cannot judge whether a walk "looks" natural to a person, and I cannot watch an animation, only measure it and read still frames (`--film` writes filmstrips). The thresholds are my reading of published gait norms (below), not data I fitted or re-derived here; a reviewer is meant to attack them.

## How it is measured
1. **The game's own code walks the person.** `tools/people_motion.html` loads `models/people.glb`, builds an `AnimCrowd`, and drives one person through the real `crowd._step` / `crowd.update` with a scripted plan (stand, walk at speed v, turn, stop). No renderer is needed (the skinning runs on the CPU). Every frame at 60 Hz it records 26 landmarks in world space: 19 bone origins, plus heel, toe, ball-of-foot (sole) and nose points carried rigidly by their bones, their offsets measured once from the skinned foot and head geometry of a clone in the rest pose; and `shoeY`, the lowest vertex of the rendered shoes, which the floor items read in place of the landmarks (see Revisions 3-5).
2. **Scenarios** (`SCEN` in the metrics): steady walks at 0.4, 0.8, 1.2, 1.6 and 1.9 m/s (7 s of a 13 s walk judged, after it settles; 10.5 s of the 0.4 m/s walk, so that it still holds three strides), a start-and-stop over 6.5 m, 90-degree turns left and right at 1.2 m/s, and a 120-degree turn on the spot. People: six by default (adult man, woman, boy, elderly man, schoolgirl in a kilt, woman in a coat), or `--people all` for the 30. A person capped by the game below the requested speed is judged at the speed actually walked, against what a person of that leg length should do at that speed.
3. **Gait events** come from the foot's position relative to the pelvis, not from floor contact (Zeni, Richards & Higginson 2008): a foot is at heel strike when it is furthest ahead of the pelvis and at toe-off when furthest behind. So a foot that skates or floats is segmented the same way as a planted one, and the floor is judged separately (a sole point within 8 mm of the floor is "on it"; slip is the horizontal speed of those points while they are on it and not lifting). How far the sole sinks, how high the planted sole floats and how long neither foot is down are judged on the rendered shoe instead (its lowest skinned vertex, every frame): the gait plants the landmarks itself, so they cannot be the witness of how well it does that. Slip is still measured on the landmarks.
4. **Joint angles** are taken in the sagittal plane of the direction of *travel* (not the model's own heading, so a crab-walker is judged by where it goes), averaged over the left-heel-strike cycles. The ankle angle uses the rigid foot - the heel to the ball-of-foot sole point - not the heel to the toe tip: the toes bend separately at push-off, and a heel lifted 60 degrees off the floor reads as 30 if the toes are included.
5. **Scoring.** Each sub-metric maps to 0-10 by a linear ramp between "full marks" and "no marks" (a band where both too much and too little are wrong). A category scores `0.6 x weighted mean + 0.4 x its worst item`, so one broken sub-metric cannot hide in an average. The overall score is the weighted mean of the ten categories (weights sum to 100). Expected values scale with speed and leg length by dynamic similarity (Alexander): `ve = v * sqrt(0.92 / hipHeight)`, cadence scales as `1/sqrt(leg)` (`expected()` in the metrics).
6. **The gate** for "done": overall > 9.0, **and** every category >= 8.0, **and** no single steady recording below 8.0, **and** an independent reviewer who has tried to break the rubric and the measurements agrees.

## The rubric
Weights: grounding 16, stride/cadence 10, timing 7, legs 13, pelvis/trunk 11, arms 13, head 5, smoothness 7, starts/stops/turns 12, speed range and individuality 6. The bands below are for a 0.92 m hip at 1.2 m/s (they scale with speed and leg length in the code).

<!--RUBRIC_TABLE-->
| item | weight | measured | unit | full marks | no marks |
|---|---|---|---|---|---|
| GRD.slip | 7 | planted-foot slip, RMS | cm/s | <= 1.5 | >= 12 |
| GRD.sink | 2 | deepest a sole goes below the floor | mm | <= 3 | >= 15 |
| GRD.float | 2 | height of the planted sole | mm | <= 4 | >= 20 |
| GRD.flight | 1.5 | time with neither foot on the floor | % | <= 2 | >= 15 |
| GRD.clear | 1.5 | swing-foot clearance (mid-swing) | mm | 10 to 45 | <= 0 or >= 110 |
| GRD.hipH | 2 | hip height / standing hip height |  | 0.93 to 1 | <= 0.84 or >= 1.04 |
| STR.cad | 5 | cadence against speed | steps/min | 101.2 to 118.8 | <= 77 or >= 143 |
| STR.step | 5 | step length against speed | m | 0.602 to 0.707 | <= 0.458 or >= 0.851 |
| TIM.symT | 2 | left/right step-time difference | % | <= 3 | >= 12 |
| TIM.symL | 1.5 | left/right step-length difference | % | <= 4 | >= 15 |
| TIM.stance | 2 | stance share of the stride | % | 58 to 64 | <= 51 or >= 71 |
| TIM.ds | 1.5 | double support | % | 18 to 26 | <= 10 or >= 34 |
| LEG.hip | 3 | hip flexion-extension range | deg | 35.6 to 47.6 | <= 23.6 or >= 59.6 |
| LEG.kneeSw | 3 | knee flexion peak in swing | deg | 54.2 to 68.2 | <= 39.2 or >= 83.2 |
| LEG.kneeLd | 2 | knee flexion in loading response | deg | 8 to 24 | <= 0 or >= 40 |
| LEG.kneeSt | 1 | knee in mid-stance (least flexion) | deg | 0 to 14 | <= -8 or >= 30 |
| LEG.plantar | 2 | ankle plantarflexion at push-off | deg | -28 to -8 | <= -45 or >= 2 |
| LEG.dorsi | 1 | ankle dorsiflexion in late stance | deg | 6 to 20 | <= 0 or >= 34 |
| LEG.hsPitch | 1 | foot pitch at heel strike (toes up) | deg | 8 to 30 | <= 0 or >= 45 |
| PEL.bob | 3 | pelvis vertical excursion, peak to peak | mm | 26 to 56 | <= 12 or >= 88 |
| PEL.bobH2 | 1 | bob at twice the stride rate (two per stride) | share | >= 0.8 | <= 0.4 |
| PEL.sway | 2 | pelvis lateral excursion, peak to peak | mm | 25 to 65 | <= 8 or >= 105 |
| PEL.swayH1 | 1 | sway at the stride rate (one per stride) | share | >= 0.8 | <= 0.4 |
| PEL.yaw | 1.5 | pelvis rotation, peak to peak | deg | 5 to 14 | <= 1.5 or >= 26 |
| PEL.obl | 1 | pelvic obliquity, peak to peak | deg | 3 to 10 | <= 0.5 or >= 18 |
| PEL.thorax | 1 | shoulder-line rotation, peak to peak | deg | 4 to 16 | <= 1 or >= 28 |
| PEL.anti | 0.5 | thorax against pelvis rotation (correlation) | r | <= -0.5 | >= 0.4 |
| ARM.range | 3 | upper-arm swing, peak to peak | deg | 24.8 to 44.8 | <= 9.8 or >= 59.8 |
| ARM.phase | 3 | arm against same-side thigh (correlation) | r | <= -0.8 | >= -0.2 |
| ARM.elbow | 2 | elbow flexion, mean | deg | 15 to 50 | <= 0 or >= 80 |
| ARM.couple | 1 | elbow bends as the arm swings forward (correlation) | r | >= 0.6 | <= 0.1 |
| ARM.sym | 2 | left/right swing difference | % | <= 15 | >= 50 |
| ARM.clear | 2 | hand beyond the hip joint, closest | m | >= 0.03 | <= -0.02 |
| HEA.pitch | 1.5 | head pitch, peak to peak | deg | <= 4 | >= 12 |
| HEA.roll | 1 | head roll, peak to peak | deg | <= 3 | >= 10 |
| HEA.yaw | 1 | head yaw, peak to peak | deg | <= 6 | >= 16 |
| HEA.gaze | 1 | gaze pitch off level, mean | deg | <= 8 | >= 25 |
| HEA.dir | 0.5 | head turned off the direction of travel, mean | deg | <= 6 | >= 20 |
| SMO.hf | 2 | joint-angle power above 6 Hz | % | <= 2 | >= 12 |
| SMO.rate | 2 | fastest joint-angle change | deg/s | <= 700 | >= 1800 |
| SMO.rep | 1.5 | stride-to-stride difference, of the range | % | <= 5 | >= 25 |
| SMO.jump | 1.5 | biggest one-frame move of a hand, foot or head | cm | <= 12 | >= 30 |
| TRN.lat | 1.5 | walk command to first heel strike | s | <= 0.7 | >= 1.6 |
| TRN.glide | 1.5 | distance covered before the first foot leaves the floor | m | <= 0.25 | >= 0.7 |
| TRN.acc | 0.5 | peak acceleration setting off | m/s2 | <= 3 | >= 8 |
| TRN.dec | 1.5 | peak deceleration stopping | m/s2 | <= 3 | >= 8 |
| TRN.settle | 1.5 | time from arrival until the feet are still | s | <= 0.8 | >= 2.5 |
| TRN.slide | 1.5 | distance the planted feet drag after arriving | cm | <= 3 | >= 15 |
| TRN.stand | 1 | one foot ahead of the other once stopped | m | <= 0.22 | >= 0.45 |
| TRN.tslip | 1 | planted-foot slip through a 90-degree turn, RMS | cm/s | <= 3 | >= 14 |
| TRN.trate | 1 | fastest heading change in a walking turn | deg/s | <= 200 | >= 500 |
| TRN.spin | 1 | foot drag turning 120 degrees on the spot | cm | <= 8 | >= 40 |
| RNG.mono | 1.5 | cadence and step length both rise with speed (rank correlation) | r | >= 0.95 | <= 0.5 |
| RNG.slope | 1.5 | step-length growth with speed, against normative | ratio | 0.7 to 1.3 | <= 0.2 or >= 2.2 |
| RNG.cv | 2 | spread of cadence between people at 1.2 m/s | % CV | 2 to 15 | <= 0.3 or >= 30 |
| RNG.legs | 1 | shorter legs, faster cadence (correlation with hip height) | r | <= -0.4 | >= 0.3 |
<!--/RUBRIC_TABLE-->

Where the normative targets come from:
- **Cadence against speed** - a table of steps/min against speed for healthy adults (62 at 0.4 m/s, 90 at 0.8, 110 at 1.2, 126 at 1.6, 143 at 2.0), with step length = speed / cadence. Consistent with the stride/cadence/speed relations of Grieve & Gear (1966), the reference data of Oberg, Karsznia & Oberg (1993) and the comfortable-speed norms of Bohannon (1997; 1.27-1.46 m/s by age and sex). The table values are my reading of those, not their tables.
- **Hip and knee range, arm swing, stance and double support** - `26 + 13 ve` degrees of hip flexion-extension, `48 + 11 ve` of peak swing knee flexion, `12 + 19 ve` of arm swing, stance `61 - 6.4 (ve - 1.2)` %, double support `22 - 6 (ve - 1.2)` %. These are straight lines I fitted by eye to the ranges in standard gait texts (Perry & Burnfield, *Gait Analysis*; Winter, *Biomechanics and Motor Control of Human Movement*), and are the weakest numbers here.
- **Pelvis** - vertical excursion of about 4 cm at 1.2 m/s, lateral about 4-6 cm, rotation about 5-14 degrees and obliquity 3-10 degrees peak to peak, with the thorax counter-rotating: the classic descriptions of Saunders, Inman & Eberhart (1953). Their "six determinants" *explanation* of why has been questioned (Lin, Gfoehler & Pandy 2014); the rubric only uses the observed excursions.
- **Arms** swing in antiphase with the same-side leg, with the elbow flexed and bending more as the arm swings forward, and the amplitude grows with speed (Meyns, Bruijn & Duysens 2013, "The how and why of arm swing during human walking", *Gait & Posture* 38(4):555-562).
- **Footskate** is the standard complaint about cheap walk cycles; the standard cure is planting the foot and solving the leg to it (Kovar, Schreiner & Gleicher 2002, "Footskate Cleanup for Motion Capture Editing", SCA 2002). Boulic, Magnenat-Thalmann & Thalmann (1990, "A global human walking model with real-time kinematic personification", *The Visual Computer* 6(6):344-358) derive step length and cadence from speed and leg length in just this way.
- **Phones** (a later item): Schabrun et al. (2014, "Texting and walking: strategies for postural control and implications for safety", *PLoS ONE* 9(1):e84312) - slower, shorter steps, head flexed, less trunk and arm motion.

Verified this session by search: Zeni et al. 2008 (*Gait & Posture* 27(4):710-714), Grieve & Gear 1966 (*Ergonomics* 9(5):379-399), Oberg et al. 1993 (*J Rehabil Res Dev* 30(2):210-223), Saunders et al. 1953 (*J Bone Joint Surg Am* 35-A:543-558), Bohannon 1997 (*Age and Ageing* 26(1):15-19), Meyns et al. 2013, Kovar et al. 2002, Boulic et al. 1990, Schabrun et al. 2014. Cited from memory and **not** re-checked: Perry & Burnfield, Winter, Alexander's dynamic similarity, Lin et al. 2014 (seen only as a search snippet). I did not read the full text of any of them; the numbers above are summaries, not quotations.

## What it does not judge
Cloth and hair, faces, sound, sitting / phone / talk poses (only standing and walking are scored), how people avoid each other, and anything you would only see by watching: a gait that scores 9 here could still look off in a way these 56 numbers do not capture. Children and short people are judged against dynamic-similarity scaling of an adult norm, which is a convention, not a measurement of children.

## How to run
```
node tools/people_motion.mjs                          # default 6 people, all scenarios (about 20 s)
node tools/people_motion.mjs --gait clip              # the old clip-driven walk, for comparison
node tools/people_motion.mjs --items --worst 3        # every sub-metric, and the three worst recordings in detail
node tools/people_motion.mjs --people all --json out.json --rec recs --film films
```
`--no-mesh` leaves out the rendered-shoe channel (the floor items then read the landmarks). `--detail 1` records the simplified far-crowd model instead of the full-detail one. `--rec DIR` keeps the raw recordings (landmarks and `shoeY` per frame) so someone else can re-score or plot them; `--film DIR` writes side, front and top filmstrips of a stride at 1.2 m/s. Needs Playwright (like `tools/people_holes.mjs`).

## Revisions to the rubric after the first scores
The metrics were written before the procedural gait existed, and the first runs of the gait showed two of them were wrong. Both are disclosed here because they were changed *after* seeing scores, so a reader can judge whether they flatter the result. Neither changes the verdict on the clip walk: the baseline moves from 3.73 to 3.78.
1. **Ankle pitch measured on the rigid foot** (heel to ball-of-foot, `bs_*`) instead of heel to toe tip (`toe_*`). With the toe tip, plantarflexion at push-off could not reach the band whatever the foot did, because the toe bone bends the other way as the heel lifts: the "no push-off" verdict on the clip walk would have been a measuring artefact. The clip baseline's plantarflexion score moved 5.57 -> 5.55 and the overall did not move, so the change neither rescues nor sinks the old walk. The toe tip is still recorded and still used for the floor contact tests.
2. **A longer judged window at 0.4 m/s** (10.5 s instead of 7 s). At 0.4 m/s a person takes about one step a second, and the repeatability item (`SMO.rep`) needs three strides; with too few it returned "no number", which scores 0, so a slow walk was being failed for being slow, not for being wrong. Faster speeds are judged exactly as before. This is the whole of the baseline's 3.73 -> 3.78 (smoothness 7.3 -> 7.8, grounding 0.8 -> 0.9): the slow clip recordings now have strides to measure. Measured by re-scoring the same raw recordings with the old and the new window.

Three more were made later, while the gait was being put into the game, and item 6 is the model fix the third one prompted. Each is given with its effect, measured by re-recording or re-scoring the same code with and without the change: revision 3 moved almost nothing, revision 4 raised the gait's score a good deal, and revision 5 lowered it.
3. **The recorder records the full-detail model by default** (LOD0: what the nearest eight people within 11 m wear, so what the player actually watches; `--detail 1` records the simplified far-crowd model). The first recorder took whichever model `crowd.add` handed a walking person, which is the simplified one. Effect: clip 3.91 (simplified) -> 3.93 (full detail). The gait is reported at both.
4. **Foot landmarks are measured on a clone in the rest pose.** The heel, toe and ball-of-sole points ride on the foot and toe bones, with offsets measured once from the skinned shoe geometry. The first version measured them on whatever pose the person was in when recording began, and an idle clip leaves a foot 3-6 degrees off its rest pitch, which tilts every point defined from it (the heel-to-ball vector the ankle angle is judged on included). Effect: gait 8.68 -> 9.44 (LOD0) and 8.71 -> 9.32 (LOD1); clip 3.90 -> 3.93 (LOD0) and 3.91 -> 3.91 (LOD1). This is the largest revision and it favours the gait, which is why revision 5 exists.
5. **The floor items judge the rendered shoe, not the landmarks.** The gait plants the very landmarks the first `GRD.sink` / `GRD.float` / `GRD.flight` read, so they could not catch a shoe that dips into the floor where the landmark does not: they said 0.0 mm while the drawn shoe sank 6.6-9.7 mm at push-off. The recorder now also stores, every frame, the lowest skinned vertex of the shoe meshes (`shoeY`), and the three items read that when it is present. Effect on the code as it then stood: gait LOD0 9.44 -> 9.29 (the gate failed on one 1.9 m/s recording at 7.8), LOD1 9.32 -> 9.29, clip 3.93 -> 3.95. It cost the gait marks and found a real defect, which was then fixed in the model, not in the metric:
6. **Not a metric change: `fitShoes` (`js/sim/bodyfit.js`, full-detail shoes only).** A shoe is stiff and bends at the ball of the foot; the authored skinning gives much of the shoe a 60/40 blend of the foot and toe bones, so with the heel raised the middle of the shoe sagged below the floor. The fit re-weights each shoe vertex by its place along the foot (a 4 cm smoothstep centred on the ball joint) so the shoe pivots where a shoe does. Effect on the same recordings: the mean of each recording's deepest sole 6.09 -> 3.09 mm, grounding 8.2 -> 9.1, gait LOD0 9.29 -> 9.44, worst recording 7.8 -> 8.5. The remaining 3-5 mm is the gait's rigid foot-and-toe against a real shoe's toe spring and sole offset, and is left. The simplified model keeps its authored weights: its shoes are too coarse for the fit to help (it made its Oxford and monk-strap shoes worse), so its deepest sole stays at 4.3 mm.

Not changed, and worth an adversary's attention: the bands (my reading of the norms, not data), the Zeni events (they overstate stance share and double support when the foot slows against the pelvis before it lands: the gait reads 63.7 % stance / 27 % double support against 61 / 22 expected, and I have left that in the score rather than widen the band), and the fastest rungs of the speed ladder (1.9 m/s is above the Froude-0.4 walking limit for the boy, 1.66 m/s, and above anything the game's own crowd ever walks, 1.6 m/s at most: it is kept because removing the hard case would flatter the score).

## Results log
### Baseline: the clip-driven walk (before any change), `--gait clip`, six people
Overall **3.73 / 10** as first recorded (**3.78** re-scored with the final metrics - see "Revisions" above); gate: no.

| category | score |
|---|---|
| GRD grounding | 0.8 |
| STR stride and cadence | 5.2 |
| TIM timing and symmetry | 4.8 |
| LEG lower limb | 4.1 |
| PEL pelvis and trunk | 2.2 |
| ARM arms | 4.6 |
| HEA head | 8.2 |
| SMO smoothness | 7.3 |
| TRN starts, stops, turns | 2.3 |
| RNG range and individuality | 3.0 |

What the numbers say is wrong with the old walk (man_commuter at 1.2 m/s unless stated):
- **The feet skate.** Planted-foot slip is 30-90 cm/s RMS depending on speed (about 55 at 1.2 m/s; a foot on the floor should move < 1.5). A sole goes 21 mm below the floor on average (30 mm for man_commuter at 1.2 m/s), and neither foot is within 8 mm of it for 56 % of the time: the whole body is lifted about 5 cm so the clip's lowest foot vertex stays above the floor, so the feet hover for much of the stride and still sink at the extremes.
- **The stride is wrong for the speed.** Each person's step is the same 0.6-0.8 m whatever the speed (man_commuter 0.82 m at 0.8, 1.2, 1.6 and 1.9 m/s); expected is 0.55 m at 0.8 m/s, 0.67 m at 1.2 and 0.85 m at 1.9. At 0.4 m/s it cannot find two strides in 7 s: the clip is played at a quarter of its speed. Cadence is 87 steps/min where 107 is expected at 1.2 m/s. Slow-motion giant strides at low speed, a scurry at high.
- **No pelvis motion.** Pelvis vertical bob 0 mm (expected about 40) and lateral sway 0 mm (expected 25-65): the clips carry rotation only, no hip translation, so the body glides rigidly. (Pelvis and shoulder rotation are present.)
- **Weak knee and ankle.** Peak swing knee flexion 42-49 degrees (expected about 61); no push-off - the ankle is +6 degrees (dorsiflexed) where -8 to -28 is normal.
- **Arms.** Swing is 19-43 degrees depending on the person (about 34 expected at 1.2 m/s; man_commuter 20), one arm moves much more than the other (left/right difference 79 % on average over the six people), and the elbow does not bend with the swing (r = -0.1 where > 0.6 is natural).
- **Starts, stops and turns.** Stopping is instantaneous (11 m/s^2 deceleration; full marks need 3 or less), and the feet then keep drifting for about 4 s as the idle clip's weight shift moves them (20 cm of drag); turning while walking slips the planted foot at 72 cm/s; a 120-degree turn on the spot drags a foot 40 cm.
- What is fine: smoothness (no jitter), head stability, and pelvis/shoulder rotation.

The "no strides found at 0.4 m/s" and the capped speeds of the boys and the kilt girl (1.4 m/s, the most the game lets them walk) are real outcomes of the old behaviour, not harness faults.

### After: the procedural gait in the game, six people, five speeds, four scenarios
Overall **9.44 / 10** for the full-detail model (LOD0, what the player watches), **9.29** for the simplified far-crowd model (LOD1), against 3.78 for the clip walk as first scored and 3.95 for the clip walk under the final instrument (revisions 3-5 above). The gate: LOD0 passes; LOD1 does not (below). An independent reviewer has not yet had their say.

| category | clip, first scored | clip, final instrument (LOD0 / LOD1) | gait, LOD0 | gait, LOD1 |
|---|---|---|---|---|
| GRD grounding | 0.8 | 1.0 / 1.0 | 9.1 | 8.2 |
| STR stride and cadence | 5.2 | 5.2 / 5.2 | 10.0 | 10.0 |
| TIM timing and symmetry | 4.8 | 5.1 / 5.1 | 8.6 | 8.6 |
| LEG lower limb | 4.1 | 4.2 / 4.2 | 8.2 | 8.7 |
| PEL pelvis and trunk | 2.2 | 2.2 / 2.2 | 10.0 | 10.0 |
| ARM arms | 4.6 | 4.6 / 4.6 | 10.0 | 10.0 |
| HEA head | 8.2 | 8.3 / 8.3 | 10.0 | 10.0 |
| SMO smoothness | 7.3 | 7.8 / 7.8 | 8.8 | 8.5 |
| TRN starts, stops, turns | 2.3 | 3.2 / 3.1 | 9.9 | 9.5 |
| RNG range and individuality | 3.0 | 3.0 / 3.0 | 10.0 | 10.0 |
| **overall** | **3.73** (3.78 re-scored) | **3.95 / 3.93** | **9.44** | **9.29** |

The clip's own gain from 3.78 to 3.95 is the instrument and the new steering (turns 2.3 -> 3.2 because nobody is stopped dead or spun at 300-600 degrees a second any more); the clip's feet still skate. The gait's gain from there is the walking itself.

**Gate.** LOD0: overall 9.44 > 9, every category 8.2 or more, the worst of the 30 steady recordings 8.5 (woman_coat at her top speed): met. LOD1: overall 9.29 > 9 and every category 8.2 or more, but three recordings at the top of the speed ladder score below 8 - man_elder at 1.82 m/s 7.7, woman_midi at 1.72 m/s 7.8, woman_coat at 1.74 m/s 7.8 - because planted-foot slip there is 5.4-6.7 cm/s (it is 3.9-4.6 for the same three on the full-detail model) and the fastest joint-angle change reaches 1100-1300 degrees a second. These are speeds above what the crowd walks (about 1.6 m/s at most), on the model that is only worn more than 11 m from the camera. I have not changed the gate to let LOD1 through, and I have not found why the simplified rig slips more.

**Where the gait is still short of full marks** (the mean over the six people and five speeds; the value, and the score it earns):
- `LEG.kneeLd` knee flexion in loading response 25.8 degrees, 7.5. Not chased: the category is 8.2, and I have no check that a smaller flexion is truer than the band.
- `TIM.ds` double support 27.5 %, 7.7, and `TIM.stance` 63.8 %, 8.9: the Zeni events overstate both when the foot slows against the pelvis before it lands (see "Not changed" above). The gait's own timing is 61 / 22 by construction at 1.2 m/s.
- `SMO.rate` 789 degrees a second, 8.5, and `SMO.hf` 2.95 %, 8.7: the fastest joint-angle changes are the swing foot landing and the push-off.
- `GRD.slip` 2.78 cm/s RMS, 8.7: 1.1 cm/s at 0.4 m/s rising to 3.7-4.6 cm/s at the top speeds.
- `GRD.sink` 3.09 mm, 9.3: the residual shoe dip described in revision 6.

**Limits of all of this.** I cannot watch an animation; the stills I read show no creasing at push-off and nothing else. The thresholds are my reading of the published norms, not fitted to data. The gait is very regular (stride-to-stride difference 1.3 % of the range), and the rubric rewards regularity, so a metronome scores well: real walkers vary, and nothing here would notice a walk that is too perfect. The far-crowd model has a different skeleton and its own gait body, and its numbers are lower for reasons I have not established. Foot slip is measured on the landmarks, not on the rendered shoe. The top rung of the ladder is each person's capped top speed (the boy and the kilt girl 1.4 m/s, the two short-legged women 1.7, the elderly man 1.8), not a common 1.9.

**What changed in the game to get here** (commits `cbdf3cc7`, `fb1eab83` and the shoe commit): a planted-foot gait on the real skeleton (`js/sim/gait.js`, `gait_three.js`) with a pivot-on-the-spot gait, a closing step onto a planned stop, and pelvis bob and sway that grow with the walk; a steering model that moves a person along the way they face and brakes into a place to stand (`js/sim/steer.js`); stiff shoes (`fitShoes`); and the woman in the coat relabelled as wearing a pencil skirt (she was labelled trousers), so the leg collider treats her as skirted.

**What the gait did to the clothes** (`tools/people_holes.mjs`, skin showing through a garment, cm^2 per view): the legs now move more than the clips did, and a vented pencil skirt shows the thigh through its own back vent when she walks (woman_midi 4.3 -> about 21; the garment doing what a vent does, but it is counted as a hole), and two of the men in trousers (the `elvs_male_trouser` garment) show small seat specks (man_commuter 0.8 -> 5.9, man_trews 1.4 -> 4.0). Two attempts to reduce these were made and dropped: splitting long cloth edges at load time doubled the kilt people's triangles (quadrupled at LOD1) and made woman_sash worse; shortening the stride to keep the legs inside ("hobbling") cost the stride category.

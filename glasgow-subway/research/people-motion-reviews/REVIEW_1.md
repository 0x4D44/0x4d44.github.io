> **Provenance (added when this file was kept; the report below it is unedited).** This is the report of the independent adversarial reviewer for the people-motion rubric, round 1, as it was delivered to me. The reviewer was a separate subagent that could read the code, run the harness and write its own scripts, but cannot watch an animation. Paths in it point into the scratch directory of the session that produced it, where its scripts and recordings were; they are not kept. My answer to it is in [../people-motion-rubric.md](../people-motion-rubric.md), Round 2, part 2.

# REVIEW_1: independent adversarial review of the Glasgow Subway procedural-gait score

Scope: the LOD0 / LOD1 claims, `js/sim/motion_metrics.mjs`, `research/people-motion-rubric.md`, the recorder and the game's crowd code. I was read-only on the site. Everything I wrote is under `/tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review/out/` (scripts in `js/*.mjs` and `*.py`; data in `*.json` and `rec_*`). I cannot watch an animation, so nothing below is a visual judgement.

## 0. Verdict

- **The numbers are real.** My rerun of the author's LOD0 command reproduced his recordings byte for byte (overall 9.435, worst woman_coat@1.9 8.46). I re-implemented six measures from the raw recordings (planted-foot slip, cadence and step length from floor-contact events, 3-D swing-knee peak, pelvis bob, arm range, stance and double support from contact). They agree with the harness. I found no unit, window, sign or off-by-one bug in `motion_metrics.mjs`. The clip baseline also reproduces (3.95; slip 16-91 cm/s, bob 0), and that gap is physical, not an instrument effect.
- **The score is overstated as evidence of motion quality.** 45 of the 100 weight points (STR, PEL, ARM, HEA, RNG) score 9.99, so the headline carries a cushion of about +0.45. The 55 weight points that can fail (GRD, TIM, LEG, SMO, TRN) score 8.97 (LOD0, the author's six) to 9.04 (LOD0, 30 characters), and 8.70 to 8.98 at LOD1. A gait scoring only 8.19 on those 55 points would still clear "overall > 9". The rubric cannot see a 35 degree stoop, a 24 cm wider base, scissoring, splayed arms, a head poked 15 cm forward, or a 5 Hz tremor: seven damaged variants of a real recording scored identically to the control. It has no floor on variability or head motion, so a metronome with a frozen head scores 10.
- **On its own terms.** LOD0 meets the gate on the author's six characters (9.43, every category >= 8.23, worst recording 8.44). It fails the per-recording clause on the 30-character roster the game draws from (man_student@1.9 = 6.94 as scored, 7.28 with rendered-shoe slip; 1 of 150). The LOD1 "not met" stands, but the stated cause is mostly a measurement artefact: rendered LOD1 shoe slip is about half the landmark slip (median 0.51x). With it, LOD1 on the six has 1 recording below 8 instead of 3 (man_elder@1.9 = 7.95, from sink 8.9 mm and joint rate 1300 deg/s).
- **I do not co-sign the gate's last clause as "the motion scores > 9".** I do co-sign that the measurements are correct and that LOD0 meets the numeric bar on the six-character sample.

## 1. My scores

Method: I recorded the game's own walker with the author's recorder (dt = 1/60) and scored it with the author's bands. I removed only artefacts I could demonstrate:
(a) Slip is taken from the rendered shoe vertices (in-page `getVertexPosition`, same 8 mm / 0.12 m/s contact rule) instead of 3 landmarks per foot. Each recording's slip is scaled by its measured rendered/landmark ratio.
(b) LOD1 man_student is dropped. Its 13.7k-vertex "shoe" mesh, matched by the shoe regex, gives a permanent -18.1 mm sink, and it is the only character whose rendered/landmark slip ratio exceeds 1 (1.8-6.4x).
(c) The roster is all 30 characters instead of six.

| | LOD0 six (as author, reproduced) | LOD0 roster 30, rendered slip | LOD1 six (as author) | LOD1 roster minus man_student, rendered slip |
|---|---|---|---|---|
| GRD | 9.11 | 9.42 | 8.22 | 9.07 |
| STR | 10.00 | 10.00 | 10.00 | 10.00 |
| TIM | 8.59 | 8.66 | 8.61 | 8.62 |
| LEG | 8.23 | 8.29 | 8.67 | 8.62 |
| PEL | 10.00 | 9.94 | 10.00 | 9.95 |
| ARM | 10.00 | 10.00 | 10.00 | 10.00 |
| HEA | 10.00 | 10.00 | 10.00 | 10.00 |
| SMO | 8.83 | 8.80 | 8.54 | 8.59 |
| TRN / RNG | 9.89 / 10.00 | 9.70 / 10.00 | 9.52 / 10.00 | 9.45 / 10.00 |
| **overall, 8 steady categories** | 9.33 | 9.39 | 9.20 | 9.35 |
| **overall, all 10 (author's definition)** | 9.43 | 9.47 | 9.28 | 9.40 |
| 55 weight points that can fail (GRD, TIM, LEG, SMO, TRN) | 8.97 | 9.04 | 8.70 | 8.93 |
| worst recording | 8.44 woman_coat@1.9 | 7.28 man_student@1.9 | 7.65 man_elder@1.9 | 6.93 woman_puffer@1.9 |
| recordings < 8 | 0 / 30 | 1 / 150 | 3 / 30 | 4 / 145 |

Other configurations: LOD1 six with rendered slip: GRD 9.19, overall 9.44, worst 7.95 (man_elder@1.9), 1 of 30 below 8. LOD0 roster with the author's landmark slip: overall 9.42, 13 of 150 recordings below 8.5. LOD1 roster with landmark slip: overall 9.23, GRD 8.09, 13 of 150 below 8.

Gate, clause by clause, on my measurements:
- **LOD0:** overall > 9 yes. Every category >= 8 yes (lowest LEG 8.29). No recording < 8: yes on the six, **no on the roster** (1 of 150, top rung only).
- **LOD1:** overall > 9 yes. Every category >= 8 yes. No recording < 8: **no** (six: 3 as scored, 1 with rendered slip; roster: 4 of 145).
- **Sensitivity, not a correction:** dropping the top rung (each person's capped speed, which for most is above anything the game walks). LOD0 roster: 9.52, worst 8.44, 0 of 120 below 8. LOD1 roster minus man_student: 9.46, worst 8.15, 0 of 116. The author is right to keep that rung. Note that for the boy and the kilt girl (cap 1.4 m/s) the 1.6 and 1.9 rungs are the same recording.

## 2. Defects in the rubric and instrument, ranked by how much they could inflate the headline

**R1. Ceiling and circular categories (about +0.45 overall). CONFIRMED. Blocking for "> 9".**
- Evidence: measured cadence / `expected()` cadence is 1.000 (sd 0.002, range 0.992-1.003, n = 150) and step length / expected is 1.000 (0.997-1.008). `gait.js` and `motion_metrics.mjs` carry the same CAD table and formula constants.
- RNG items: slope 1.00, mono 1.00, legs correlation -1.00. A perfect correlation with hip height only arises from a deterministic table; the rubric asks for r <= -0.4.
- STR, PEL, ARM, HEA, RNG average 9.99 (LOD0 and LOD1). The bands are wide (ARM.range full marks within +-10 deg of the formula; PEL.bob 0.65-1.4x), or one-sided (HEA).
- Arithmetic: 0.45 x 9.99 + 0.55 x 8.19 = 9.0, so the 55 discriminating points need only 8.19.
- Not a pure tautology everywhere: LEG.hip is -2.0 +- 4.5 deg from the formula (range -11.0 to +5.4), kneeSw -3.1 +- 5.1 (range -12.9 to +8.2). Those items can and do fail.
- Fix: take the STR / RNG targets from a separate file built from cited regressions that `gait.js` does not import. Add negative controls to `motion.test.mjs`: scale the gait's CAD table by +-15% and require STR < 8.5; score a synthetic marionette (sinusoidal joints at `expected()` amplitudes, feet skating 30 cm/s, zero variability) and require overall < 8. I predict, but did not build, the marionette. Report the 55-point subscore beside the overall and gate on it >= 9.0.

**R2. No lower bounds on variability or head motion (up to about -0.5 if corrected). CONFIRMED that none exist; the size is hypothetical.**
- Evidence, gait (six characters at 0.8/1.2/1.6): step-length CV 0.00-0.10%, arm-range CV 0.02-0.09%, stride-time CV 0-1.05% (that is the 60 Hz frame quantisation: one frame is 1.5% of a 1.1 s stride).
- Healthy adults: stride-time CV about 1.5-3% (confident), step-length CV about 2-4% (moderately confident).
- Head peak-to-peak over 150 recordings: pitch 0.60 / 1.74 / 2.53 deg, roll 0.46 / 0.71 / 0.99, yaw 1.55 / 2.41 / 2.98 (min / mean / max). All HEA items are `fall`-only and SMO.rep is `fall [5,25]`. I believe a walking head is stabilised, not frozen, at a few degrees (moderate confidence); roll under 1 degree is at the stiff end.
- Illustration only: one new variability item of weight 1.5 scoring 0 would take SMO to about 4.3 and LOD0 overall down about 0.3. A head-roll floor would cost about 0.26. I cannot say what the right band is.
- Fix: two-sided bands from a cited source for stride-time CV, step-length CV and SMO.rep, and floors for head pitch / roll / yaw. Falsifiable: today's gait must score < 8 on them, and adding +-2% noise to stride time and step length must recover it.

**R3. Category means hide recording-level failures; "no recording < 8" cannot catch a failed category. CONFIRMED. Affects what the clauses mean, not the overall.**
- Evidence: LEG falls below 8 in 29 of 90 normal-rung roster recordings (6 of 18 on the six; 12 of 90 below 6), TIM in 27 of 90, SMO in 50 of 150 (11 of 30 on the six). The category means (8.2-8.8) hide roughly a third.
- Arithmetic: with all eight categories judged, LEG = 0 and the rest 10 scores 8.41 per recording and passes the clause.
- Real cases (13 of 150 roster recordings pass with a category below 6): teen_girl@1.6 = 8.66 (LEG 4.9), teen_skirt@1.6 = 8.44 (LEG 5.2), girl_school_kilt@1.2 = 8.73 (LEG 5.7), man_student@1.6 = 8.55 (GRD 5.4).
- Fix: apply the 8.0 floor to the 10th percentile of per-recording category scores. Falsifiable: LEG p10 is about 5.7 today (six).

**R4. The default six exclude the worst-shod characters (+1.5 on the worst recording, +0.01 overall). CONFIRMED.**
- Evidence: `--people all` at LOD0 gives worst man_student@1.9 = 6.94 (rendered slip: 7.28). Its sneaker (material `sneakerstexture1`) has its lowest rendered vertex more than 8 mm above the floor in 4.8 / 11.2 / 19.3% of frames at 0.4 / 1.2 / 1.9 m/s (max 14.5 mm), so GRD.flight is 19.3% and scores 0.
- LOD1 roster: worst woman_puffer@1.9 = 6.62 (GRD.flight 21.4%), man_puffer@1.9 = 6.88.
- The overall generalises from the six to the roster (9.43 vs 9.42), which is reassuring: no sign of overfitting to the six.
- Fix: gate on `--people all`. Falsifiable: worst >= 8 on `node tools/people_motion.mjs --people all`.

**R5. Post-hoc revision sensitivity (net about +0.6, partly legitimate). CONFIRMED from the doc's own numbers.**
- Revision 4 (landmarks measured on a rest-pose clone) moved the gait 8.68 -> 9.44, which is larger than the whole margin above 9.0 (0.43). Revision 5 cost 0.15, revision 6 (a model fix) gained 0.15.
- I could not find an unsound revision. I did not independently re-derive the rest-pose landmark offsets, only cross-checked the landmarks against rendered-shoe heights.
- Fix: publish the sha256 of `motion_metrics.mjs` with each score. Re-score every prior result when it changes.

**R6. Blind spots (0 measured on the actual gait, but PEL + ARM + HEA = 29 weight points are uninformative). CONFIRMED.**
- Evidence: `out/js/perturb.mjs` on man_commuter@1.2 LOD0. Control scores 9.51 (all 8 steady categories). Each variant scores 9.51 with every item unchanged: stoop 35 deg (trunk, arms, neck, head forward, gaze kept level), both feet 12 cm further out, feet crossing the midline by 6 cm, hands and forearms splayed 20 cm, head poked 15 cm, 5 Hz 1.5 cm hand tremor, 5 Hz 8 mm whole-trunk tremor. The unscored `trunk.lean` went 3.3 -> 38.3 deg for the stoop.
- Fix: score trunk lean (sagittal and frontal), step width, foot crossover, hand lateral spacing, head forward offset and 2-6 Hz band power. Falsifiable: re-run `perturb.mjs`; each variant must lose at least 1 point.

**R7. Bands that look lenient (SUSPECTED; literature from memory).**
- SMO.rate full marks <= 700 deg/s. The gait averages 790-880, and 1100-1300 at LOD1 top rung. My recollection of healthy knee peak angular velocity is roughly 300-500 deg/s (low-to-moderate confidence), so the band may be 1.5x lenient.
- LEG.kneeLd full marks up to 24 deg; healthy loading-response flexion is about 15-20 deg (moderate).
- Confident only of: stance 60-62% and double support 20-22% at free speed; stride-time CV 1.5-3%.
- Fix: cite sources in the band table and compare. Falsifiable by looking up the values.

**R8. Sampling-rate dependence (mixed direction). CONFIRMED.**
- GRD.slip (weight 7 of 16 in GRD) is not a velocity of the gait: man_commuter reads 2.5 / 2.5 / 4.7 / 14.9 cm/s at 60 / 30 / 20 / 10 Hz, woman_midi 3.4 / 3.3 / 5.6 / 17.8, boy 2.5 / 2.4 / 7.0 / 44.1. Decimating the same 60 Hz data reproduces it, and 120 / 240 Hz give the same as 60 Hz (2.5-3.5). It is the central-difference window plus foot roll. At 60 Hz it is converged, so this deflates only at coarser dt.
- TIM (Zeni) flatters 60 Hz by 1.0-1.3 points against 240 Hz: man_commuter 8.9 -> 8.46 -> 7.63, woman_midi 8.5 -> 8.76 -> 7.45, boy 8.4 -> 8.02 -> 7.30 at 60 / 120 / 240 Hz. That is about +0.07-0.09 overall.
- Fix: define slip as contact-point displacement over a stance. Falsifiable: slip(30 Hz) / slip(120 Hz) within 0.8-1.25 (man_commuter today: 1.0 for 30 vs 120 Hz, 1.9 at 20 Hz, 6 at 10 Hz).

**R9. Landmark versus rendered mesh (deflates; I can correct it). CONFIRMED.**
- Only GRD.sink / float / flight read the rendered shoe, and only as the lowest vertex of either shoe. Slip, clearance, hip height and every angle are landmark / skeleton based.
- Rendered / landmark slip over 150 recordings: LOD0 min 0.22, median 0.79, p90 0.87, max 0.99; LOD1 median 0.51, p10 0.35, p90 0.64 (man_student the only exception, up to 6.4x). So the doc's "I have not found why the simplified rig slips more" has an answer: mostly it does not.
- Correcting it raises LOD1 six GRD 8.22 -> 9.19 and overall 9.28 -> 9.44.
- Instrument fragility: the shoe mesh is found by `/shoe|boot|sneaker/i`. On LOD1 man_student that matched a 13.7k-vertex mesh, a permanent -18.1 mm sink and GRD.sink = 0 on all five rungs (man_student@0.4 scores 7.70 for that alone).
- Fix: assert shoe vertex count < 3000 per mesh and fail loudly.
- Other mesh checks are absent: skin collapse and twist, arm-through-coat, skirt-through-leg (UNVERIFIED).

**R10. Smaller items.**
- SMO.rep returns n/a (scored 0) at 0.6 m/s on LOD1 for some characters because the window rule flips at `v < 0.6`. It is in the game's speed range and outside the ladder. Deflating, minor.
- `--seed` has no effect on the gait (seed 1 and 7 identical). The runs are deterministic, so "pass" is not a sample statistic. Per-recording scores depend on recording order through `_gseed`, which `crowd.clear()` does not reset: same six, different order, worst 8.44 vs 8.46 (<= 0.05).
- STEADY_AT attack **failed**. Judging all eight categories at all five rungs lowers LOD0 six overall 9.43 -> 9.40 (TIM -0.1, PEL -0.2) and raises the worst recording (roster 6.94 -> 8.03), because the extra categories dilute GRD at the extremes. It neither hides much nor flatters the per-recording clause.
- LOD swap mid-stride: I could not break it (shoe <= 3.2 mm, pelvis <= 10.7 mm, foot jump within about 1 cm of the prior range).
- Between-rung speeds (0.6 / 1.0 / 1.4): no cliff (LOD0 per-recording 8.53-9.99, LOD1 8.50-9.83).
- The harness walks one character alone on an empty flat field (`yAt = null`, `camWorld = null`, fixed dt): steering around people, queues, doors and the game's variable dt are not scored (UNVERIFIED).

## 3. Motion defects the rubric does not catch

I measured the faults of R6 on the real gait (six characters x 0.8 / 1.2 / 1.6 m/s, LOD0, steady window). **None occurs.**

| measure | value |
|---|---|
| step width (heel-heel lateral at heel strike) | 6.7-9.6 cm (kilt girl and boy 6.7-7.1) |
| closest heel to pelvis midline (crossover) | +1.7 to +2.9 cm outward; never crosses |
| hand lateral distance from pelvis | 21-28 cm |
| head forward of pelvis | 2.4-6.9 cm |
| trunk lean (author's, unscored) | -1.1 to +4.1 deg over 150 recordings |

Step width looks plausible for healthy adults (moderate confidence about 8-10 cm). The blind spots matter for what the instrument can certify, not for anything I measured.

Defects the rubric does see but the gate averages away (measured, real):
- **Loading-response knee flexion.** Mean 25.4-25.7 deg (full marks end at 24). At 1.6 m/s at least 10 of 30 characters reach 36.6-43 deg (teen_girl 43.0, teen_skirt 39.7, woman_student 39.7, woman_bob 38.7, woman_mini 38.6, woman_scarf 38.3, girl_school_kilt 38.1, woman_elder 37.2, woman_midi 37.1, woman_coat 36.6). A bent-knee landing at brisk walking is my best guess for the most visible fault; not verified visually.
- **Double support and stance.** 27.4-27.5% and 63.7-63.8% at the rubric's own 8 mm contact definition, against the doc's "61 / 22 by construction". At 240 Hz (same Zeni harness): 28.5-29.5% and 64.3-64.7%.
- **Joint angular rate.** Mean 790-860 deg/s, 1100-1300 at the top rung (a "snappy swing" suspicion; not verified visually).
- **Rendered shoe sink grows with speed.** man_commuter -1.6 / -3.6 / -5.5 mm at 0.4 / 1.2 / 1.9; up to -6.9 mm (teen_skirt@1.9). The doc's "3-5 mm" is a mean.
- **Sneaker hover.** man_student at LOD0, puffers at LOD1 (R4).
- **Metronome and near-frozen head** (R2). Whether they look wrong is UNVERIFIED.
- **Lockstep at spawn.** `phase0 = 0` for everyone. SUSPECTED, untested.

## 4. Fixes and what blocks a score above 9

Each finding's fix and falsifiable check is above. Blocking, in order:
1. **R1 (ceiling cushion).** I cannot sign "> 9" until the 55 discriminating points alone reach 9.0 at both LODs (today 8.97-9.04 and 8.70-8.98) and STR / RNG use an external reference.
2. **Three single items hold LEG, TIM and SMO below 9.** What-if on my recordings, clamping each item to the edge of full marks (not a measurement):

| | LEG | TIM | SMO | overall |
|---|---|---|---|---|
| LOD0 roster, as is | 8.3 | 8.7 | 8.8 | 9.47 |
| knee loading <= 24 deg | 9.3 | | | 9.59 |
| double support / stance in band | | 10.0 | | 9.56 |
| joint rate <= 700 deg/s | | | 9.3 | 9.50 |
| all three | 9.3 | 10.0 | 9.3 | 9.72 |
| LOD1 roster minus man_student: as is -> all three | 8.6 -> 9.3 | 8.6 -> 10.0 | 8.6 -> 9.2 | 9.40 -> 9.63 |

   That is the concrete list to get above 9 on every category: knee loading, double support, joint rate.
3. **R4.** Per-recording clause on the roster: man_student sneaker offsets at LOD0; puffer shoes, top-rung sink and joint rate at LOD1.
4. **R2 and R6.** Blocking only for treating 10.0 on PEL / ARM / HEA and SMO.rep as evidence, not for the number.

Not blocking: R3 (needed for the gate wording to mean what it says), R5, R7-R10.

## 5. Doc statements that are wrong, misleading or cherry-picked

1. "The worst of the 30 steady recordings 8.5 ... met." True for the six. The doc never reports `--people all`; the roster fails at 6.94 / 7.28.
2. The Zeni explanation ("overstate stance share and double support when the foot slows against the pelvis before it lands") is largely wrong. At the rubric's own 8 mm contact definition, contact-based stance / DS are 63.7 / 27.4 against Zeni 63.8 / 27.5. At strict 0.5 mm contact they are 62.6 / 25.2: partly the threshold, partly a real +3 excess over the design 22. "61 / 22 by construction" is not what the recordings show in the rubric's terms.
3. "I have not found why the simplified rig slips more": mostly it does not (R9). The doc says slip is measured on landmarks but not that this overstates by about 1.3x (LOD0) to 2x (LOD1).
4. "The remaining 3-5 mm" is a mean over speeds; the sink reaches 5.5-6.9 mm at the top rung.
5. "Every category 8.2 or more" is true of means only (R3).
6. LEG.kneeLd "not chased": at 1.6 m/s ten characters sit at 36.6-43 deg; the mean hides it.
7. Honest and accurate: the metronome admission, the 1.9 rung kept, the bands are "my reading". Gap: the metronome is not quantified (CV 0.0-0.1%), and HEA is `fall`-only.

## 6. What I did not or could not check

- Any visual judgement: arm swing, foot roll-over, knee bend at 1.6 m/s, head stillness, metronome in a crowd, shoe hover at close range.
- A marionette built from scratch (arithmetic and damaged-recording evidence instead).
- The crowd in the real scene: steering, queues, doors, camera-dependent LOD, variable dt.
- Revision 4's rest-pose landmark offsets, re-derived independently.
- TRN thresholds were not attacked in depth.
- Spawn phase lock.
- Literature numbers are from memory. Confident: stride-time CV 1.5-3%, stance 60-62%, DS 20-22%. Moderate: step-length CV 2-4%, step width 8-10 cm, head a few degrees. Low: knee angular velocity 300-500 deg/s, loading flexion 15-20 deg.
- My rendered-slip correction scales author-order landmark slip by a ratio from a separate run (order effect <= 0.05).

How to re-run (all from `out/`): `node js/final.mjs` (tables), `node js/hidden.mjs`, `node js/fixes.mjs`, `node js/perturb.mjs rec_lod0_rerun man_commuter 1.2`, `python3 -I variab.py rec_lod0_rerun man_commuter,woman_midi,boy`, `python3 -I shoes_all.py rec_all0`, `node js/drive.mjs --mode meshslip|dt|speeds` (needs a server on :8360).

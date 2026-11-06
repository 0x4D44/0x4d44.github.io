> **Provenance (added when this file was kept; the report below it is unedited).** This is the report of the independent adversarial reviewer for the people-motion rubric, round 2, after the rolling-foot change, as it was delivered to me. The reviewer was a separate subagent that could read the code, run the harness and write its own scripts, but cannot watch an animation. Paths in it point into the scratch directory of the session that produced it, where its scripts and recordings were; they are not kept. My answer to it is in [../people-motion-rubric.md](../people-motion-rubric.md), Round 2, part 5.

# REVIEW_2: independent adversarial review, round 2, of the Glasgow Subway procedural-gait score

Reviewer: the same independent reviewer as round 1 (REVIEW_1.md is untouched). Snapshot: commit 93bce31b (code of 4decc715), instrument sha 88c5c72187e4, served read-only on :8363 (not mine). I touched nothing in the snapshot or the live repo, made no git changes, and wrote only under `.../scratchpad/review2/out/` and this file. All paths below are under `/tmp/claude-0/-home-user/98342dd5-df6b-53e6-a242-d8a4c2d188e5/scratchpad/review2/`.
I cannot watch animation. Anything about how the walk *looks* is unverified and marked so.

## 0. Verdict

- **The numbers are real, and I found no bug in the code that makes them.** My own whole-roster recordings (30 people x 5 speeds x 4 scenarios, both LODs, made with the author's recorder against the snapshot) score exactly his headline: LOD0 overall 9.370, 55 points 9.163, worst woman_elder@1.6 = 8.24; LOD1 9.326 / 9.040 / worst woman_student@1.6 = 8.35. A numpy re-implementation written from the raw recordings agrees (section 2).
- **I do not co-sign "the motion scores > 9".** I co-sign "at 60 Hz, with the constants as committed, the instrument prints 9.37 / 9.16 and 9.33 / 9.04", and I co-sign his own statement that the gate is NOT met (LEG mean, LEG p10, ARM p10, SMO p10 at both levels, plus TRN p10 at LOD1). I will not put my name to "above 9" as a statement about the motion, for these reasons, heaviest first:
  1. **The margin is smaller than the effect of the author's own late-set constants.** The margin over 9 is 0.37 (overall) and 0.16 / 0.04 (the 55 points, LOD0 / LOD1). Moving the three constants he says he set after looking at the data (loaded-foot threshold 2 mm -> the instrument's own 8 mm; ARM.splay band; SMO.pelAcc band) to modest alternatives gives overall 8.92 / 8.88 and 55 points 8.86 / 8.73, with 5 of 150 recordings below 8 at LOD0 (section 3). I do not claim those alternatives are right; I claim nothing in the repo says they are wrong, and the claim does not survive them.
  2. **LEG is structural, and "a few crouched walkers" understates it.** 42% (LOD0) and 46% (LOD1) of the judged LEG scores are below 8; at 1.6 m/s 11 of 30 (LOD0) and 10 of 30 (LOD1) people are below 7. The pelvis rides low roster-wide and lower with speed (section 5.4).
  3. **It is a 60 Hz number.** The same people, speeds and gait at 1/30 s frame time score 8.71 instead of 9.17 (planted-foot slip 5.7 instead of 3.1 cm/s) and at 1/144 s they score 8.92 (SMO falls from 9.0 to 4.5: the pelvis acceleration p99 is 21-31 m/s^2 in all six rows against a roster mean of 9.3 at 60 Hz, which is what a one-frame velocity step at every heel strike does). The game clamps frame time only at 0.1 s (`js/sim/index.js:1162`). Section 5.1.
  4. **What a high score means is still thin.** About half the weight is ceiling points; a sinusoidal marionette with skating feet and zero variability scores 10.0 on STR, ARM and HEA; white noise on a metronome passes the variability items; head nods not locked to the stride are invisible to HEA; a frozen pelvis *raises* the GRD+TIM+LEG+SMO part of the 55-point score (section 4).
- **What the author got right, plainly.** Every round-1 damage (stoop, wide base, crossover, splayed hands, poked head, hand and trunk tremor) is now detected by an item. A marionette fails the 55-point clause (GRD+TIM+LEG+SMO 3.4). The three tuned constants are disclosed in his own text. The bob has the right phase. The foot's interior stance slip really is 0.4 cm/s. A mid-walk LOD swap does not pop. Lockstep at spawn exists but lasts about a second. I found no sign of deliberate misrepresentation (section 6); one sentence understates (LEG), and the document states the 60 Hz recorder but never says the scores depend on it.

## 1. My scores (REVIEW_1 section 1 form)

Method: the author's recorder, dt = 1/60, 30 characters, 5 speeds, `floorFrom: mesh` (rendered shoe) throughout. Column **A** is his bands, exactly as committed. Column **B** is my reading: the same recordings re-scored with three constants changed, all of which his document says he set after seeing data (line 212: 2 mm; line 281: splay band "set after looking at the data"; line 216: "Both numbers are mine", pelAcc): loaded-foot threshold 2 mm -> 8 mm (`CONTACT_M`, the definition every other floor item uses), `ARM.splay` fall [0.10, 0.20] -> [0.05, 0.15], `SMO.pelAcc` fall [8, 20] -> [5, 15]. B is a sensitivity, not a correction: I have no external reference for either band, and I say so.

| | LOD0 A | LOD0 B | LOD1 A | LOD1 B |
|---|---|---|---|---|
| GRD | 9.48 | 9.48 | 9.36 | 9.36 |
| STR | 10.00 | 10.00 | 10.00 | 10.00 |
| TIM | 10.00 | 8.88 | 10.00 | 8.89 |
| LEG | 7.96 | 7.96 | 7.86 | 7.86 |
| PEL | 9.77 | 9.77 | 9.91 | 9.91 |
| ARM | 9.02 | 6.85 | 9.09 | 6.92 |
| HEA | 10.00 | 10.00 | 10.00 | 10.00 |
| SMO | 8.84 | 7.57 | 9.00 | 7.68 |
| TRN / RNG | 9.74 / 9.71 | 9.74 / 9.71 | 9.36 / 9.71 | 9.36 / 9.71 |
| **overall, 8 steady categories** | 9.29 | 8.74 | 9.29 | 8.74 |
| **overall, all 10 (his definition)** | **9.370** | **8.922** | **9.326** | **8.875** |
| **55 points that can fail (GRD, TIM, LEG, SMO, TRN)** | **9.163** | **8.860** | **9.040** | **8.730** |
| 45 points that cannot fail (STR, PEL, ARM, HEA, RNG) | 9.62 | 9.00 | 9.68 | 9.05 |
| worst recording | 8.24 woman_elder@1.6 | 7.65 woman_elder@1.6 | 8.35 woman_student@1.6 | 7.89 woman_student@1.6 |
| recordings < 8 | 0 / 150 | 5 / 150 | 0 / 150 | 1 / 150 |

Mean per-recording score by speed (A): LOD0 9.96 / 9.61 / 9.30 / 8.98 / 9.01 at 0.4 / 0.8 / 1.2 / 1.6 / 1.9 m/s; LOD1 9.89 / 9.55 / 9.32 / 9.03 / 9.01. The two fastest rungs average 9.0. The game assigns walkers 0.6-1.5 m/s (`js/sim/people.js` lines 45, 61, 430, 438; capped at 1.3 x the character's walk speed, line 633), so game-weighted the score is *higher* than the five-rung mean. That is in the author's favour and I say so.

Where the 9.37 comes from (LOD0): categories at >= 9.7 are STR 10, TIM 10, HEA 10, PEL 9.77, TRN 9.74, RNG 9.71 = 51 weight points; GRD (16) is 9.48 and its whole gap is the slip item (the other GRD items, sink / float / flight / clearance / hip height, are 10.0 on all 150). ARM (13) is 9.02 and its whole gap is the splay item. SMO (7) is 8.84, gap from pelAcc 8.3, hf 9.0, trem 9.1 (rate, rep and jump are 10.0). LEG (13) is 7.96. Of the instrument's items, only a handful discriminate on this gait: slip, splay, pelAcc, hf, trem, and the LEG knee / ankle items.

**My point estimate** of "the instrument-based score" is 8.9-9.4 at LOD0 and 8.9-9.3 at LOD1. The interval straddles 9.

### Gate, clause by clause, on my measurements (published constants)

| clause | LOD0 | LOD1 |
|---|---|---|
| overall > 9 | yes, 9.370 | yes, 9.326 |
| 55 points > 9 | yes, 9.163 | yes, 9.040 (margin 0.04) |
| every category mean >= 8 | **NO: LEG 7.96** | **NO: LEG 7.86** |
| every category p10 >= 8 | **NO: LEG 6.45, ARM 7.90, SMO 7.10** | **NO: LEG 6.13, ARM 7.99, SMO 7.63, TRN 6.56** |
| no recording < 8 | yes, worst 8.24 | yes, worst 8.35 |
| whole roster (30) | yes | yes |
| floor judged on the rendered shoe | yes (`floorFrom: mesh`) | yes |

Gate NOT MET at both levels, by 4 and 5 clauses. Same as the author reports. Under B, "overall > 9", "55 points > 9" and "no recording < 8" fail as well at both levels (LOD1: one recording at 7.89).

**Co-sign answer: no.** What would change it: (a) the author's own stricter clauses met (LEG mean and p10 >= 8); (b) overall and 55 points > 9 at both LODs under B at 60 Hz; (c) the same at 1/30 and 1/120 s. Section 7 lists the falsifiable checks.

## 2. Reproduction and independent re-implementation

- **Exact reproduction.** Fresh recordings (`out/rec_all0`, `out/rec_all1`) scored by the author's tool give his table exactly, including the roster means in his part-4 table (slip 2.26 / 2.46 cm/s, knee mid-stance 18.5 / 19.4, dorsiflexion 22.7 / 23.8, pelAcc 9.26 / 9.22). His stance / double-support-by-threshold table also reproduces on the 30-person browser roster: at 1.2 m/s stance / DS = 61.4 / 22.8 (2 mm), 63.5 / 27.0 (8 mm), 64.6 / 29.2 (Zeni); at 1.6 m/s 59.9 / 19.7, 62.0 / 24.1, 63.8 / 27.6. His emulated numbers: 61.4 / 22.9, 63.6 / 27.2, 64.6 / 29.2 and 59.8 / 19.5, 61.9 / 23.8, 63.6 / 27.1.
- **Numpy re-implementation** (`out/py/r2.py`, `compare.py`, from the raw recordings, not through his code): slip, loaded (2 mm) stance and double support, pelAcc p99 and speed are *exact*. Cadence +0.008, step length and step width (+1 mm), swing knee (+0.4 deg, r = 0.9975), bob (+1.0 mm, definition), arm range (+0.03 deg) are close. CV means agree (1.969 vs 1.969); per-recording r = 0.84 (cvT), 0.80 / 0.57 (cvL); every disagreement is at 0.4 m/s (4-5 cycles; TIM is not judged there). No bug found.
- **The variability is really injected** (the same CV falls out of independent contact events). Its shape: short-memory AR(1), stride-time lag-1 autocorrelation 0.165; corr(step time, step length) = 0.86 (step-length noise is step-time noise at constant pelvis speed; there is no speed variability); CV is flat with speed. The answer to your weak point 2 is therefore: it is close to white noise that lands inside the bands (section 4 shows white noise passes). Real stride-time series have long memory and CV that rises at slow speeds; that is from memory, moderate confidence.
- The 2 mm stance / DS values equal the rubric's own `expected()` formula to within about one point (22.8 vs 22; 19.7 vs 19.6), as his disclosure ("chosen after seeing a table") predicts. Consequence: TIM.stance / ds can no longer fail; at the instrument's own 8 mm TIM is 8.9 with p10 8.0.

## 3. How much of the headline rests on late-set constants

Re-scored from my own recordings with edited copies of the instrument (`--from`, no re-recording; `out/clone/<variant>_{0,1}.json`). Overall = all 10 categories; 55 = GRD+TIM+LEG+SMO+TRN.

| variant | LOD0 overall / 55 | LOD0 worst (n < 8) | LOD1 overall / 55 |
|---|---|---|---|
| as published | 9.370 / 9.163 | 8.24 (0) | 9.326 / 9.040 |
| loaded threshold 1 mm, 4 mm | 9.370 / 9.163, 9.367 / 9.157 | 8.24 (0) | 9.323 / 9.035 (4 mm) |
| loaded threshold 8 mm (= CONTACT_M) | 9.292 / 9.021 | 8.16 (0) | 9.248 / **8.898** |
| splay fall [0.05, 0.15] (was [0.10, 0.20]) | 9.088 / 9.163 | 7.88 (2) | 9.045 / 9.040 |
| splay fall [0.03, 0.10] | **8.907** / 9.163 | 7.72 (3) | **8.857** / 9.040 |
| pelAcc fall [5, 15] (was [8, 20]) | 9.282 / 9.002 | 8.09 (0) | 9.234 / **8.872** |
| pelAcc fall [4, 12] | 9.218 / **8.886** | 8.08 (0) | 9.163 / **8.744** |
| 4 mm + splay [0.05, 0.15] + pelAcc [5, 15] | **8.996 / 8.996** | 7.72 (3) | **8.950 / 8.867** |
| 8 mm + splay [0.05, 0.15] + pelAcc [5, 15] (column B) | **8.922 / 8.860** | 7.65 (5) | **8.875 / 8.730** |

- The 2 mm choice by itself is cheap to defend (0 change up to 4 mm). The cost shows at 8 mm, which is also the threshold the rest of the instrument calls "on the floor".
- **splay**: roster mean 0.120 m (min 0.086, p90 0.163); his band gives full marks to 0.10. **pelAcc**: roster mean 9.26, median 8.6, p90 13.7, max 19.8 m/s^2; his band gives full marks to 8; his own comment in `gait.js` (line 315) says a real walker's pelvis moves at "about 2 - 6". Both bands were set by him after the stomp / the data, as he writes.
- Taken one at a time, the overall stays above 9 except for a very hard splay band; the 55 points at LOD1 fall below 9 under either the 8 mm threshold or the pelAcc band alone (the splay band does not touch them: ARM is not among the 55). Taken together, the margin is gone.

## 4. What the new items catch, and what they do not

Perturbations are applied to kept recordings and scored with the author's own `analyseSteady` / `scoreSteady` / `catScore` (`out/js/perturb2.mjs`). Landmark damage cannot touch GRD (the shoe channel is separate). Control man_commuter@1.2 LOD0: 8 steady categories 9.46, GRD+TIM+LEG+SMO 9.08. Also run on woman_elder@1.6, boy_kilt@0.8, man_longcoat@1.2 (LOD0), man_commuter@1.2, woman_student@1.6 (LOD1). Six recordings in all (the control plus five), not the roster. "GRD+TIM+LEG+SMO" below is the part of the 55 points that a single steady recording can measure (TRN cannot).

**Round-1 damages: all now detected.** stoop 35 deg: PEL 10 -> 5.3 (PEL.lean 0) and HEA 10 -> 5.6 (poke 0.8), 8-category 8.55. Wide base +12 cm and 6 cm crossover: LEG 7.8 -> 4.9 (LEG.width 0). Hands splayed 20 cm: ARM 9.6 -> 5.4. Head poked 15 cm: HEA 5.1. 5 Hz 1.5 cm hand tremor and 5 Hz 8 mm trunk tremor: SMO 9.6 -> 5.0 (SMO.trem 0). Each is caught by an item added for exactly that damage, so this proves the items work, not that the rubric would catch the next damage.

**New damages:**

| damage | result |
|---|---|
| marionette: sinusoidal joints at reference amplitudes, skating feet, zero variability, floor-following pelvis | GRD 2.7 (slip 144 cm/s), TIM 2.2, LEG 4.2, SMO 4.9, **but STR 10, ARM 10, HEA 10, PEL 7.4**. 8-category 6.2, GRD+TIM+LEG+SMO 3.4. Fails the 55-point clause by a wide margin; about 28 points (STR, ARM, HEA) plus PEL and RNG are free to a puppet. Same across the five recordings. |
| frozen pelvis | PEL 1.3, 8-category 8.34, but GRD+TIM+LEG+SMO **rises 9.08 -> 9.24** (pelAcc goes to 0). A dead pelvis is rewarded by SMO. |
| no arm swing | ARM 1.9 (caught) |
| head nod +-10 deg locked to the stride | HEA 4.7 (caught) |
| head nod +-10 deg at 1.7 Hz, not locked | HEA 6.1 on the commuter, but **10.0 (nothing) for woman_elder@1.6 and boy_kilt@0.8**, 8.6 man_longcoat@1.2, 6.7 LOD1 commuter. At 1.8 Hz (near the step rate) no category moved. HEA reads the stride-ensemble mean waveform: motion not locked to the stride cancels. SMO.trem watches landmark positions, not rotation about the head. |
| head *position* bobbing 15 mm at 1.7 Hz | SMO.trem catches it (SMO 6.6) |
| crouch walking 1 / 2 / 3 / 6 / 10 cm | LEG 5.8 / 4.6 / 4.2 / 3.1 / 2.3. GRD.hipH only from 6 cm (GRD 9.1 at 3 cm, 7.5 at 6, 5.2 at 10). Pelvis +1 cm: LEG 7.8 -> 8.8 (commuter), woman_elder@1.6 5.1 -> 6.8, woman_student@1.6 5.2 -> 7.3. The knee items are, to about a centimetre, a pelvis-height gauge. |
| bob inverted (half-step shift) | **PEL stays 10.0** (PEL.bob / bobH2 have no phase check); LEG 7.8 -> 4.9, SMO 9.6 -> 8.6 notice. Bob a quarter step late: PEL 10.0, LEG 7.8 -> 6.0. A mis-phased bob is caught only indirectly. |
| stride-time noise too large (10% step-rate time warp) | cvT 1.96 -> 5.75 (score 5.0), TIM 10 -> 7.5, bobH2 0.62, trem 1.4: caught |
| metronome replica (zero variability) | TIM 10 -> 4.4 (cvT 0.05, cvL 0.12), 8-category 8.94: caught |
| **metronome + 3% step-rate + 2.5% step-length white noise** | **TIM 9.4, 8-category 9.23 (control 9.46): passes.** The variability items cannot tell white noise from gait. |

Bob phase of the *real* gait (90 recordings per LOD at 0.8 / 1.2 / 1.6): pelvis height peaks at 26% of the left cycle (p10 23, p90 28) and is lowest at about 1% (heel strike). That is physiologically right: no inversion, no lag. So the trackReach fit does not make the pelvis lag. The top 1% of pelvis accelerations cluster at heel strike (deciles of the step, LOD0, n = 947: 567 63 214 13 1 2 0 4 23 60; LOD1 678 64 75 1 0 0 0 13 57 62): a sharp trough at each double-support cap notch, reduced but not removed.

## 5. Gait and crowd checks

### 5.1 Frame time (variable dt)

Same recorder, same plan, only the frame time changed (`out/js/drive2.mjs --mode dt`, LOD0; man_commuter, woman_elder, boy_kilt at 1.2 and 1.6 m/s; n = 6 per row, harder speeds, so read the *differences*):

| frame time | fps | mean slip cm/s (range) | GRD | SMO (range) | 8-category score | min |
|---|---|---|---|---|---|---|
| 1/144 | 144 | 1.83 (1.0-2.5) | 9.72 | **4.51** (4.2-4.8) | 8.92 | 8.70 |
| 1/90 | 90 | 2.36 (1.8-3.4) | 9.46 | 7.02 (4.3-8.2) | 9.05 | 8.27 |
| **1/60 (the recorder default)** | 60 | 3.14 (2.2-4.1) | 8.97 | 9.00 (7.8-9.7) | **9.17** | 8.84 |
| 1/40 | 40 | 4.09 (3.1-6.2) | 8.36 | 9.08 | 8.97 | 8.76 |
| 1/30 | 30 | **5.70** (3.6-8.0) | 7.35 | 9.04 | **8.71** | 7.69 |
| 1/20 | 20 | 11.0 (6.5-16.1) | 4.68 | 8.73 | 8.28 | 7.74 |

- Slip grows with frame time; some of that is probably the instrument (my inference, not tested: a longer frame interval lets more heel-strike / toe-off frames through the 8 mm window and the |vy| filter), so I do not claim a viewer sees 5.7 cm/s of skating at 30 fps. I did not watch it.
- pelAcc is the second difference of pelvis height over dt^2, so a one-frame velocity step scales as 1/dt. The roster mean p99 of 9.3 m/s^2 at 60 Hz becomes 20.7-31.1 (item score 0) in all six rows at 144 Hz, and 12-22 at 90 Hz where it is listed among the worst items. His own text (line 279) says the p99 "is set by a handful of one-frame spikes at the double-support transitions". That is consistent with a real kink in pelvis velocity at every heel strike that a 60 Hz recorder samples gently. I did not fit it further.
- The game loop clamps dt to <= 0.1 s (`js/sim/index.js:1162`); `gaitUpdate` documents dt <= 1/30 (`gait.js:284`) and `people.js` sub-steps by `n = min(4, ceil(dt*30))`. The rubric document says the recorder runs at 60 Hz (lines 10 and 12) but never says that the scores depend on the frame time.

### 5.2 Lockstep at spawn (`phase0`)

`phase0` is a dead parameter: it appears only in the default `var` object (`gait.js:253`) and as `phase0: 0` in `people.js:572`, and is read nowhere. At walk-off, `g.phase = wrap1(P.S + (first ? 0.5 : 0))`, so everyone who stands the same way starts in the same phase (or its mirror, by which foot trails). Probe (`out/js/crowd2.mjs`, 12 people stand 1 s, then all told to walk on the same frame, 25 s, LOD0):

| case | step-phase order parameter R_step at 0.3 / 0.6 / 1 / 1.5 / 3 s | stride-phase R |
|---|---|---|
| 12 distinct characters, 1.2 m/s | 0.99 / 0.91 / 0.60 / 0.37 / 0.16 | 0.17 at 0.3 s (the crowd splits roughly 7:5 between first-foot-left and first-foot-right: mirror-image lockstep), then noise level |
| 12 distinct characters, game speeds 0.96-1.34 | 1.00 / 0.94 / 0.68 / 0.37 / 0.14 | similar |
| **12 copies of one character**, 1.2 m/s | 1.00 / 1.00 / 0.97 / 0.91 / 0.51 | **1.00 (0.3 s), 0.94 (2 s), 0.86 (3 s), 0.78 (4 s), 0.57 (6 s), 0.34 (8 s), 0.19 (12 s)**; ninth left heel strike spread sd 0.31 s (first: 0.03 s) |
| 12 distinct, frame time jittered (6% of frames 1/30, 10% 1/120) | 0.99 / 0.91 / 0.59 / 0.45 / 0.23 | same as fixed dt |

Random phases give R about 0.26 for 12. So a simultaneous release steps in unison for about a second (distinct people) and for 4-6 seconds (clones). The 12 "copies" differ only by the per-person `cad` trait (+-5%) and the seeded wander. The game staggers its `go` walkers by 0.45-0.5 s each plus a random 0.3-0.6 s (`people.js:61, 438`), so this needs a genuine same-frame release (a train arrival, a queue release). Low severity; the item to fix is that `phase0` is advertised and does nothing. Variable dt changed nothing.

### 5.3 LOD swap mid-walk

`out/js/swap2.mjs`: six characters at 1.2 m/s, swapped hi->lo at 8 s and lo->hi at 11 s (12 swaps). At the swap frame the lowest-shoe height changes by <= 0.1 mm, the pelvis height by <= 5.7 mm (typical per-frame change 3.5-4.9), the foot-relative displacement is 3-46 mm against a typical swing-foot maximum of 20-50 mm; two of the twelve exceed the preceding 48 frames' maximum by 7-10 mm (man_commuter lo->hi, man_elder lo->hi). `_swapLod` keeps `p.gait` (the phase continues, `people.js:295-298`). No pop above 10 mm; one speed, one phase, not exhaustive.

### 5.4 LEG, trackReach and the low pelvis

- LEG over the judged recordings (0.8 / 1.2 / 1.6): LOD0 mean 7.96, p10 6.45; below 7 in 17%, below 8 in 42%, 9 or above in 23%. By speed 8.80 / 8.05 / 7.04; at 1.6 m/s **11 of 30** below 7. LOD1: mean 7.86, p10 6.13; 19% below 7, 46% below 8, 14% at 9 or above; at 1.6 m/s mean 7.13 and **10 of 30** below 7. Lowest: LOD0 teen_skirt@1.6 4.3, woman_puffer@1.6 4.5, woman_student@1.6 5.0, woman_elder@1.6 5.1; LOD1 woman_puffer@1.6 4.5, woman_puffer@1.2 4.9, girl@1.2 5.2, woman_student@1.6 5.2.
- Mean pelvis height 0.962 of standing hip height; corr(hipRel, LEG) = 0.78 / 0.71; corr(speed, hipRel) = -0.84 / -0.78. The pelvis rides lower the faster the walk, for the whole roster.
- **Does the rubric reward a crouch?** Mostly no: LEG punishes 1-10 cm of crouch steeply (table above). The leak is GRD.hipH (blind to a crouch under ~5 cm) and SMO.pelAcc: a lower pelvis cannot hit the reach cap, which was the stomp the author describes, so the item set pays a little for sitting low and charges LEG for it. I cannot tell from recordings whether a pelvis 1-2 cm higher is reachable without bringing the stomp back; B1 below is the check. I did not vary the 0.42 x bob prior (the gait is frozen).
- Walk start (your weak point 7): lowest pelvis in the first 6 s of walking against the steady 2nd percentile is lower by a mean 28 / 18 / 11 mm at 0.8 / 1.2 / 1.6 m/s (LOD0; LOD1 24 / 15 / 7), p90 up to 45 mm, max 55 mm (girl_small@0.8). Against the steady *mean* the first six seconds are not lower at all. I cannot reproduce a "68 mm" residual sag with either definition, so I do not know which baseline that figure uses.

### 5.5 Slip anatomy and the rolling foot

- His statement that interior-of-stance frames move about 0.4 cm/s and that the rest is the first and last frames of a contact (line 277) is **confirmed**: frames at least 6 from either end of a contact run 0.38 / 0.47 cm/s (LOD0 / LOD1); the first and last three frames of each run are 5.87 / 6.39 cm/s RMS and dominate the 2.45 / 2.69 that I count over all contact frames. Slip by speed (LOD0): 1.3 / 1.8 / 2.45 / 3.0 / 3.0. The item band (full marks at 1.5, zero at 12) is lenient about the edge frames, which include the legitimate heel-strike deceleration.
- **All vertices within 8 mm of the floor** (every vertex of the rendered shoe, same |vy| and 8 mm rule, LOD0, `meshslip0.log`), RMS cm/s against the landmark figure: man_commuter 1.2: 1.97 vs 1.98; 1.6: 2.56 vs 3.47; woman_elder 1.2: 3.09 vs 2.31; **1.6: 5.42 vs 3.10 (p99 35 cm/s, 9.2% of patch samples above 5 cm/s)**; boy_kilt 1.2: 3.55 vs 3.75; 1.6: 3.46 vs 4.22; woman_puffer 1.2: 2.50 vs 2.50; **1.6: 3.81 vs 2.65 (11.7% above 5)**; girl_school_kilt 1.2: 2.77 vs 2.72; 1.6: 3.46 vs 3.06. Sinks: none below -1.7 mm. The rolling-foot claim holds at the patch level to within about a third of the landmark figure for 8 of 10 recordings; woman_elder@1.6 (+75%) and woman_puffer@1.6 (+44%) slide more than the lowest-vertex figure admits. LOD0 only, ten recordings.

### 5.6 Walk start and stop (TRN) and steering

- `TRN.acc` (1.61 m/s^2), `TRN.dec` (1.46) and `TRN.trate` (148 deg/s) take the same value for every person: they score the steering constants, not the gait.
- **Glide**: `TRN.glide` (distance covered before the first foot leaves the floor) is 0.58 m for one person at LOD0 (woman_mini) and 0.54-0.58 m for four at LOD1 (woman_mini, man_student, woman_midi 0.58; woman_bob 0.54; items 2.7-3.6); the other 26 are at about 0. `TRN.lat` (walk command to first heel strike) is 1.15-1.23 s for exactly those people (the other 26 are at most 0.73 s). That is the TRN p10 failure at LOD1 (6.56): a walker slides about 0.6 m, 0.85 s at the game's 1.61 m/s^2, before the first step. It differs between LODs for the same person (man_student 0.58 m at LOD1, none at LOD0), so it depends on tiny differences in how the feet stand.
- Steering with avoidance, queues and doors in the real scene: not tested (section 8).

## 6. The author's part-3 and part-4 statements, checked

| statement | verdict |
|---|---|
| Line 281: "The LEG tail is a few crouched walkers whose reach cap binds at 1.6 m/s" (names woman_puffer, woman_student, teen_skirt, woman_elder) | **Understated.** 42-46% of judged LEG scores are below 8; about a third of the roster is below 7 at 1.6 m/s; at LOD1 it also bites at 1.2 m/s (woman_puffer 4.9, girl 5.2). It is a roster-wide, speed-dependent low pelvis, not a tail. He does say "I have not fixed it". |
| Line 212: any loaded threshold up to 4 mm leaves both quantities in band; at 8 mm DS at 1.2 m/s is 1.2 points out | **Confirmed** (unchanged at 1 and 4 mm; TIM 8.9 and overall -0.08 / -0.14 at 8 mm). Disclosed as tuned. |
| Line 277: interior frames about 0.4 cm/s, remainder is the first and last frames | **Confirmed**, and he says so himself (5.5). |
| Line 279: pelAcc p99 "is set by a handful of one-frame spikes at the double-support transitions"; effect "real and small" | Consistent with my heel-strike clustering and with the 1/dt behaviour (5.1). He does not draw the consequence: it is a 60 Hz figure. |
| Line 216: pelAcc band "Both numbers are mine"; Menz et al. 2003 "not checked" | Disclosed. Sensitivity in section 3 (55-point margin gone at [4, 12]). |
| Line 254: aH = 0.45 "the lowest value that gets almost all of the gain"; "a constant tuned against the metric" | Disclosed; the grid is flat across 0.45-0.47 (0.015). Not independently testable (gait frozen). |
| Line 268 / 273 / 277: slip 3.58 -> 2.26 and 3.44 -> 2.46; "improved / got worse 109 / 2 and 92 / 7 of 150"; +0.20 / +0.16 per recording | The *after* numbers reproduce exactly. The *before* numbers and counts need the old recordings, which are gone; **unverified**. |
| Part 4: a shoe stands on its lowest vertex and that vertex does not move | Holds on average; exceptions in 5.5 (woman_elder@1.6 5.4 vs 3.1 cm/s). |
| Line 191: of the eight new items only three move this gait | Matches my item distributions. Honest. |

Nothing here is a misrepresentation I can show. The two places a reader can be misled are the "few crouched walkers" sentence and a headline that does not say the scores depend on the 60 Hz sampling (the method section states 60 Hz; the dependence is not mentioned).

## 7. What blocks "> 9", ranked, each with a falsifiable check

1. **B1. LEG: the pelvis rides low roster-wide and lower with speed.** Check: `node tools/people_motion.mjs --people all` at both LODs must give LEG mean >= 8.0 and LEG p10 >= 8.0, and the share of judged LEG scores below 7 at most 5% (today 17% / 19%; 11 and 10 of 30 at 1.6 m/s). Pelvis +1 cm is worth +1.0 LEG on the commuter, so the gap is on the order of 1-2 cm; a fix must not bring the pelAcc stomp back (p99 within the same band).
2. **B2. The margin over 9 does not survive the three late-set constants.** Check: re-score with `LOAD_M = 0.008`, `ARM.splay` fall [0.05, 0.15] and `SMO.pelAcc` fall [5, 15] (copy the instrument, `--from out/rec_all0`): overall and 55 points must both exceed 9 at both LODs with no recording below 8. Today 8.92 / 8.86 (5 below 8) and 8.88 / 8.73. Better: take the three bands from cited data the gait does not import.
3. **B3. Frame-rate dependence.** Check: `node out/js/drive2.mjs --mode dt --detail 0 --people man_commuter,woman_elder,boy_kilt --speeds 1.2,1.6 --dts 0.0069444,0.016667,0.033333`: the mean 8-category score at 1/30 and 1/144 must be within 0.15 of its 1/60 value, GRD at least 8.5 at 1/30, SMO at least 8 at 1/144. Today -0.46 and -0.25; GRD 7.35; SMO 4.5. Remove the heel-strike kink in pelvis velocity or compute pelAcc on a fixed 60 Hz resample, and say in the document that the numbers are for 60 Hz.
4. **B4. Walk-start glide.** Check: roster max `TRN.glide` <= 0.15 m and TRN p10 >= 8 at LOD1. Today 0.58 m for five person-LOD cells; LOD1 TRN p10 6.56.
5. **B5. Amplitude-only categories carry no evidence.** Check: the marionette (`puppet` in `out/js/perturb2.mjs`) must score < 8 on STR, ARM and HEA. Today 10 / 10 / 10 (PEL 7.4). This needs an external reference for the amplitude targets; without it the 45 points are formulas.
6. **B6. Variability items pass white noise.** Check: `replica + warp` (metronome + 3% / 2.5% noise) must score TIM < 8 (today 9.4). It needs an item on the structure of the series, not only its CV.
7. **B7. Head orientation not locked to the stride is invisible.** Check: a +-10 deg nod at 1.7 Hz must give HEA < 8 on all five recordings above (today 10.0 on two, 8.6 on one). Use the per-frame head orientation spectrum, not the stride-ensemble mean.
8. **B8 (low). `phase0`.** Check: 12 clones released on one frame must have stride-phase R < 0.5 by 2 s (today 0.94) or the parameter should be deleted.

B1-B4 decide whether the number is honest; B5-B7 decide what the number means.

## 8. What I did not or could not check

- Anything visual: arm swing, foot roll, knee bend at 1.6 m/s, head steadiness, the walk start, the crowd in motion, skating at 30 fps. I cannot watch animation; every slip and smoothness figure above is a measured number, not an observed look.
- Steering with avoidance, queue and door behaviour, camera-driven LOD (`hiSet`, two swaps a frame) and mixed-speed crowds in the real scene; only the same-frame release, jittered dt and mid-walk swap probes above were run.
- The 131 unit tests and 115-check end-to-end suite he cites: not run by me.
- The pre-change recordings behind his before / after tables; they no longer exist.
- Human reference data for any band: literature figures here are from memory (stride-time CV 1.5-3%, stance 60-62%, DS 20-22% with confidence; step-length CV, pelvis acceleration, long-memory stride series with moderate or low).
- The `0.42 x bob` prior and `aH` themselves (gait frozen); the emulator `gait_emu.mjs` (not used).
- Coverage limits: perturbations on six recordings; dt sweep on three people x two speeds at LOD0; contact-patch slip on five people at LOD0; LOD swap at one speed and phase; lockstep at LOD0 with 12 walkers on parallel lanes (no avoidance).
- An IK-planted-feet marionette (mine skates), so the marionette result is for a skating puppet only.

## 9. Where things are

`out/rec_all0`, `out/rec_all1` (raw recordings), `out/all{0,1}.json` (author's tool output), `out/clone/<variant>_{0,1}.{json,log}` (re-scored variants; C8 = column B), `out/py/*.py` (independent measures, bob phase, slip anatomy), `out/js/perturb2.mjs` (perturbations, marionette), `out/js/drive2.mjs` (dt sweep, contact patch), `out/js/crowd2.mjs` (lockstep), `out/js/swap2.mjs` (LOD swap), `out/js/tail.mjs` (LEG tail), `out/logs/*.log`.

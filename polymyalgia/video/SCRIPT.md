# Polymyalgia, Explained — video script & scene plan

Source: <https://0x4d44.github.io/polymyalgia/> (research edition 15 September 2026).
Style: 3Blue1Brown-like explainer — dark canvas, CMU Serif type, shapes that
morph from one arrangement to the next. Built with Manim Community Edition +
manim-voiceover (offline Piper neural TTS, voice `en_GB-cori-high`). Music and
sound effects are composed/synthesised from scratch in `audio/`.

Target length: ~8–9 minutes. One Manim scene per section; each voiceover block
below is one `with self.voiceover(...)` so animation time is fitted to speech.

Palette: inflammation **orange** · structure **blue** · cortisol / hormones
**violet** · measured evidence **mint** · danger (GCA) **red**. Orange labels
= schematic, mint = measured data, as on the web page.

---

## S01 · Hook — "The name says muscle pain"
| # | Narration (summary) | Picture |
|---|---|---|
| 1 | Waking up; a jumper, turning in bed, a chair become painfully difficult | A geometric figure assembles, tries to raise its arms, stalls |
| 2 | Aching around both shoulders and hips, worst after rest | Four orange rings pulse on shoulders & hips |
| 3 | Name: polymyalgia rheumatica — "many muscles aching" — but the muscles mostly aren't the problem | Title writes, splits into poly / my / algia with glosses; "muscle" gets a question mark |
| 4 | Educational, not medical advice | Small caption card |

## S02 · Tissues — "What is actually hurting?"
Shoulder builds up layer by layer (bone arch, humeral head, synovium, tendon,
bursa, muscle); inflamed layers glow orange while the muscle stays blue with
"force intact". Pain ≠ stiffness ≠ weakness triptych. Age axis with a schematic
bump after 50, heavier after 65.

## S03 · Causes — "We don't know the first domino"
Row of dominoes topples; the first carries "?". Susceptibility **landscape**:
a ball on a curve, small influences (genes: HLA, ANKRD55–IL6ST; age; …) tilt the
ground toward an inflamed valley without forcing it. "Association is not blame."

## S04 · Signal — "From a molecule to a morning"
Immune cell emits IL‑6 particles → receptor + gp130 on a cell membrane →
JAK–STAT relay to nucleus → liver → CRP meter rises. Then two interventions:
glucocorticoid dims the *whole* network; IL‑6 receptor blocker snips one link
and CRP falls directly. Lesson: a dimmed warning light ≠ a safe system.

## S05 · Rhythm — "Why mornings are hard"
Axes 00:00–24:00; orange illustrative symptom curve peaking ~04–08, trough ~16;
tracker dot moves through the day. Dashed violet cortisol curve; "higher, not
lower, in the study". Number line at 45 min: 44 and 46 both get "?".

## S06 · Diagnosis — "Assembled, not read off one test"
Four lenses (Pattern, Blood tests, Imaging, Reassessment) slide in and overlap;
the overlap lights up. Mimics orbit the centre (late-onset RA, rotator cuff,
myositis, hypothyroidism, infection/malignancy, fibromyalgia). Steroid response
supports but isn't proof.

## S07 · GCA — "A related disease, a different danger"
Artery cross-section: wall thickens (ValueTracker), lumen shrinks, flow dots
thin out. Emergency panel: vision symptoms → emergency now; new headache, scalp
tenderness, jaw pain chewing → same-day. Treatment may start before
confirmation.

## S08 · Taper — "Control, then reduce"
Bars of 20, 10, 5 units; the same one-unit slice is 5 %, 10 %, 20 %.
Formula `reduction ÷ start × 100`. "Arithmetic only — not a taper." Two clocks:
row A (Active → Suppressed → Tested → Remission) and row B (External steroid →
Reduced drive → Recovery → Resilience) advance out of step. Three reasons for
feeling worse; never stop prolonged steroids abruptly.

## S09 · Trials — "Four trials, four questions"
One bar chart per trial, same 0–100 % scale: SAPHYR 28.3 vs 10.3 (+18.0 pts;
777 vs 2,044 mg; CRP in endpoint); Methotrexate 25 mg/week 80 vs 46
(once weekly — never daily); PMR‑SPARE 63.2 vs 11.8 (n = 36, 16 weeks);
REPLENISH 41.2 / 40.6 vs 20.4. Then all four shrink into a grid with a "do not
compare across" divider and three reading habits.

## S10 · Recovery — "A distribution, not a script"
10 × 10 dot grid: 77 → 51 → 25 % still on glucocorticoids at 1, 2, 5 years
(pooled, heterogeneous cohorts). 43 % relapse in year one. Norwegian 38-year
cohort: no increase in overall mortality. Function goals.

## S11 · Close — "Your next conversation"
Recap montage of motifs; four consultation questions; end card with URL and
"educational synthesis, not medical advice".

---
The full narration text lives in `scenes.py` (each `self.voiceover(text=…)`
block), so the spoken words and the animation cannot drift apart.

# People: the scoring rubric

What "realistic people" means for Under Glasgow, written so that somebody who did not build
them can score them. The walk has its own measured instrument (`people-motion-rubric.md`);
this rubric is the whole person: how they move, what their face does, who they are, what they
wear and what they carry.

**The gate.** An independent reviewer, told to find fault, scores every category below from
evidence the reviewer produces (stills rendered by `tools/people_view.html`, the audits in
`js/sim/index.js`, the unit and browser tests). The result is the weighted mean. The gate is
met when the mean is **above 9** and **no category is below 8**. A score the builder gives
does not count.

**What a reviewer cannot do here.** There is no screen: nobody in this loop can watch the
animation play. Motion is judged from sequences of stills and from measured joint angles, and
a reviewer should mark a category down, not up, for what cannot be seen.

## Scale (every category)

| score | meaning |
|---|---|
| 10 | a passer-by would not look twice; nothing a careful viewer can fault at 2 m |
| 9 | right at a glance and on a second look; small faults only up close (under 1 m) |
| 8 | right at a glance; one visible fault at normal viewing distance (2-6 m) |
| 6-7 | reads as a person doing the thing, but faults are easy to find |
| 4-5 | stylised or stiff: visibly a game character |
| 0-3 | broken: missing parts, sliding, clipping through things |

Score the **worst tenth** of what is sampled as well as the typical case: a category's score
is `0.6 x typical + 0.4 x worst tenth`. One broken person in a crowd is what a player sees.

## Categories

| # | category | weight | what to look at |
|---|---|---|---|
| 1 | Walking | 20 | feet stay planted in stance and do not slide; heel strike, roll, toe-off; knee flexes in swing and gives at loading; pelvis and trunk counter-rotate; speed matches step length and cadence; starts and stops without a hop; people differ. Evidence: `tools/people_motion.mjs` (the measured instrument), eight stills through one stride from the side and front for at least 12 people |
| 2 | Arms and hands | 10 | arms swing against the legs, more with speed, elbows bend on the forward swing; no arm passes through the body or clothing; hands hold what they hold (phone, pole, bag, case handle) |
| 3 | Faces | 10 | faces differ and read as their age and sex; eyes look at something; blinks happen at a human rate; smiles are fitted to each mouth and come and go; no dead stare, no teeth or lids through skin |
| 4 | Standing, sitting, behaviour | 10 | waiting people shift weight and look about without pacing; seated people sit in the seat, not through it; phones are used the way people use them; boarding and alighting go through the doors |
| 5 | Range of people | 10 | young, adult and old; women and men; a spread of builds, heights and skin tones roughly like a Glasgow platform; children are with nobody's legs through them. Evidence: a census of `models/people_meta.json` and of a spawned crowd |
| 6 | Clothing | 15 | a real mix: trousers and jeans, shorts (denim and Lycra), leggings, skirts, dresses, kilts; T-shirts, crop tops, vests, shirts, jumpers, coats, suits; trainers, boots, heels. No more than half of any spawned crowd in the same kind of garment. Cloth is whole |
| 7 | Luggage | 10 | made in Blender (`tools/assets_luggage.py`); several kinds (rucksacks, handbags, holdalls, shoppers, satchels, wheeled suitcases); the right people carry the right things; a bag hangs from the hand or sits on the back or lap; a suitcase stands, is towed on its wheels and is carried on stairs; nothing floats or sinks |
| 8 | Whole bodies | 15 | no missing legs, holes in clothing, skin through cloth, scalp through hair, ragged hairlines or broken faces, on the full model and on the simplified one used at a distance; the swap between them is not seen |

## How to sample

- At least 16 people chosen by the reviewer, not the builder, covering every `kind` in
  `people_meta.json` and every outfit family, each standing, walking and sitting, on both
  models (`forcelod=0` and `1`).
- Close views (1 m) of at least 8 faces and 8 pairs of hands.
- Every luggage kind on at least two different bodies, standing, walking and sitting.
- One real platform and one real train car from the running game (`tools/test_sim.mjs`
  shows how to open them), viewed at eye height.
- The reviewer lists what was looked at, so the next round can look somewhere else.

## Record

Each review is saved as `research/people-reviews/REVIEW_<n>.md` with the per-category
scores, the faults found (with the person, the pose and the view) and the overall mean.
Scores given by earlier reviews of the walk alone are in `people-motion-reviews/`.

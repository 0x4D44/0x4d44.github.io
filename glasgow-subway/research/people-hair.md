# People: bare scalp under the hair

Reported: "some women still have patches of scalp showing through their hair."
Measured with `tools/people_scalp.mjs` (red skin pixels where hair should be, seven
views of each head, 1.3 mm a pixel; the header of the tool says exactly what it counts).

## What was wrong

Three separate things.

1. **The far model's hair was wrecked for 15 more people.** The far model
   (`people_lod.glb`) is what is drawn beyond about 11 m, and for all but the nearest few
   people besides. Its hair is decimated, and thin or loose styles do not survive that:
   a ponytail becomes a tuft on a bald head, a bob becomes a few black wedges with bare
   scalp between them or over the face. Four ponytail people had been repaired before
   (`tools/people_lodhair.py`); the 13 people added later, and the bobs, never were.
   Six of them showed 27,000 to 37,000 pixels of scalp each (a clean head: under 500).
2. **The ponytail and braid styles have real gaps** between their strands, on the full
   model too: small bare triangles behind the ears and on the crown.
3. **One woman (`adult_suit_bun`) was nearly bald**: her hairstyle is a braid down the
   back of the head and nothing else, so the whole skull was skin with a black strip on it.

## What was done

- `tools/people_lodhair.py`: 15 more people now get the full model's hair in the far
  model (it is only about 850 triangles a head). The file grew from 14.40 to 14.86 MB.
- `fitScalp()` in `js/sim/bodyfit.js`: the skin of the head that lies under the hair is
  drawn a second time in the hair's colour, as a cap on the skin (same vertices, same
  bones). A gap between strands now shows hair-coloured roots, not skin. Small holes in
  the cover (up to about 4 cm across) are closed; the face, ears and neck are left alone.
- Where the hair covers less than 60% of the scalp (only the bun woman), the whole scalp
  becomes hair, with a smooth hairline cut in the shader: over the brow, past the temple
  to just above the ear, down to the nape. She now reads as hair pulled back into a braid.

## Numbers (sum over all 85 people, pixels of scalp showing)

| | before | after |
|---|---|---|
| full model | 41,367 | 16,810 |
| far model | 229,176 | 6,179 |
| people over 1,000 px, full / far | 4 / 14 | 2 / 1 |

The people still over 1,000 are the two baseball-cap wearers: the tool hides their caps,
so it counts skin that the cap covers in the game. A few hundred pixels a head are the
tops of the ears.

## Limits

- The cap is one flat colour (the average of the hair's picture). Up close, a wide gap
  shows a smooth patch of that colour, not strands.
- The bun woman's braid still has a few stray black shards near the head; those are in
  the hairstyle itself and were not touched.
- The other 60 or so far-model hairstyles are still decimated. They cover the head, but
  some are blocky. Only the ones that showed scalp or hid the face were replaced.
- Checked by the pixel count and by still pictures of the worst heads. Not watched in
  motion.

## Tests

161 unit tests pass (one new: a made-up head with a gap in its hair). Browser run:
119 of 121. The two failures are not from this work: the known skirt check
(ALM-BUG-FLU-00013), and the riders audit, which this time caught a rider part-way
through sitting down. The commit before this one fails that audit the same way now and
then (1 audit in 110 on the old code, 3 in 110 on the new, different people each time).

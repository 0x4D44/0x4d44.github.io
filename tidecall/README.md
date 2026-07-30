# Tidecall

Tidecall is a four-player, single-player estimation-whist variant built as a dependency-free static web app.

## The variant

Each round announces two special trick positions:

- **Slack Water** is worth 0 marks.
- **High Tide** is worth 2 marks.
- Every other trick is worth 1 mark.

Because the zero and double cancel, the number of available marks still equals the hand size. Players bid the exact number of marks they expect to take, follow suit, and play around the changing value of the lead.

The voyage uses eleven rounds with hand sizes `3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3`. The dealer hook prevents the four calls from summing exactly to the available marks. An exact call scores `12 + 2 × bid`; a miss loses 3 points per mark away. An exact caller who also wins High Tide earns a 3-point Crest bonus.

## Files

- `engine.js` — pure rules, scoring and AI; CommonJS-compatible for tests.
- `app.js` — UI state machine, persistence, audio, canvas atmosphere and accessibility.
- `styles.css` — responsive table, cards, tide instrument and motion.
- `engine.test.js` — deterministic rule tests plus 150 complete AI-autoplay voyages.
- `validate-static.test.js` — DOM, asset, manifest and dependency checks.
- `sw.js` / `manifest.webmanifest` — offline install support.

## Test

```sh
node engine.test.js
node --check engine.js
node --check app.js
node validate-static.test.js
```

No build step or runtime dependency is required.

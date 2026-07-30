# Quality-assurance record

This file records the final retained evidence for the packaged review on 29 July 2026. Earlier review files in `reviews/` remain as an iteration history; numbers here are the final source-of-truth figures.

## Automated checks

Run from the repository root:

```sh
node -c game-of-dracula/engine.js
node -c game-of-dracula/app.js
node -c game-of-dracula/sw.js
node --test game-of-dracula/tests/*.test.js
node game-of-dracula/tests/simulate.js 5000
```

Final result: **18/18 tests passed**.

The tests cover graph connectivity, exact-count movement, HOME handling, candle barriers, all three menace encounters, first and later Dracula bites, Green Vampire transfer and safe release, the reconstructed spinner cycle, seeded opening order, advice/RNG isolation, hostile-save rejection, exact save/restore continuation, and full-game completion.

A static audit additionally confirmed:

- no duplicate HTML IDs;
- every JavaScript and ARIA ID reference resolves;
- local script, stylesheet, manifest, icon, and service-worker references resolve;
- all essential actions have native HTML controls and accessible names;
- service-worker cleanup is limited to `game-of-dracula-` cache keys;
- no tracker, external font, third-party script, or runtime network asset is used;
- all JavaScript entry points and test files parse successfully.

## Rules simulation

A fresh four-automata run covered 5,000 deterministic Night numbers. The first 400 games were serialized and restored every five actions to exercise the save boundary repeatedly.

```json
{
  "runs": 5000,
  "completed": 5000,
  "stalled": 0,
  "winsBySeat": [1152, 1147, 1363, 1338],
  "meanActions": 27.50,
  "medianActions": 27,
  "p95Actions": 49,
  "p99Actions": 61,
  "maximumActions": 104,
  "maximumRounds": 16,
  "meanDraculaBites": 1.185,
  "meanCursePasses": 0.992
}
```

Every spinner sector appeared between 4,489 and 4,731 times. This is evidence of termination, state integrity, broad outcome diversity, and regular use of the central vampire mechanics; it is not presented as proof of perfect strategic balance.

The machine-readable report is included in the delivery as `reports/simulation-5000.json`.

## Chromium playthroughs

The production HTML, CSS, and JavaScript were exercised in real headless Chromium. The sandbox blocks browser navigation to both localhost and `file:` URLs, so the review fixture inlined the unmodified production assets into one document. For test speed only, animation and timer delays were clamped; game rules and state transitions were unchanged.

Fresh complete UI games:

| Mode | Night | Winner | Rounds | Dracula bites | Mask passes |
|---|---:|---|---:|---:|---:|
| Four automata | 1977 | Emerald | 8 | 1 | 0 |
| Four automata | 1978 | Emerald | 3 | 2 | 1 |
| Four automata | 20260729 | Crimson | 7 | 1 | 1 |
| Two humans, pass-and-play | 424242 | completed | — | — | — |

The two-human game exercised 24 privacy hand-offs, 24 spins, and 12 route-resolution actions before victory. On the very first hand-off the game region was inert and `aria-hidden`, focus was on the Ready button, Tab remained inside the gate, and the `R` shortcut did not spin beneath it.

Save/resume restored into the correct privacy gate with no errors. Browser diagnostics contained no console errors and no unhandled page errors.

The machine-readable report is included as `reports/browser-qa.json`.

## Responsive and accessibility checks

At a 390 px viewport the document width remained exactly 390 px and the game completed without horizontal overflow. The final review also checked:

- numbered HTML alternatives for every legal board destination;
- keyboard-operable SVG destinations;
- visible `:focus-visible` treatment;
- tab/tabpanel relationships with Arrow, Home, and End navigation;
- a skip-link target for the command panel;
- text equivalents for state changes and colour-coded pieces;
- reduced-motion guards around spin, pulse, movement, and curse effects;
- a high-contrast presentation mode;
- modal pass-the-device privacy with background interaction blocked.

## Offline/PWA boundary

The service worker and manifest were statically audited. The seven core assets are path-relative, the cache is project-specific, and activation only removes old `game-of-dracula-` caches. A fresh server-stopped navigation could not be repeated in this sandbox because its browser policy rejects all local navigation before the service worker can take control. The package therefore does **not** claim a fresh offline runtime result from this final pass; it includes the complete service-worker source for normal static-host testing.

## Known restoration limits

No complete continuation of the instruction sheet was located. Five underspecified decisions are labelled as restorations rather than represented as verbatim original rules. See `RESEARCH.md` and the in-game Archive.

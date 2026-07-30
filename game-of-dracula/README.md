# Game of Dracula

An unofficial, original browser restoration of Waddingtons' colourful 1977 castle-chase board game, built for the [0x4D44 Almanac](https://0x4d44.github.io/).

This is not a scan, ROM, transcription, or reproduction of the commercial artwork. The castle, box-lid scene, spinner, pawns, hollow vampire pieces, sound effects, interface, rules engine, and prose are newly made for this project. The historical game's name and publisher are used descriptively.

## What is here

- A complete 2–4 player game with any mixture of human and automated seats.
- A deterministic eighteen-sector, two-ended spinner seeded by the visible “Night no.” field.
- Dracula's separate thirty-pool circuit and the guest movement graph on yellow stones.
- Hidey-holes, candle barriers, six vampire perches, two HOME doorways, and the vault.
- The signature first-bite transformation: the victim becomes the player-controlled Green Vampire and the mask later passes to a new victim.
- Original vector artwork, procedural Web Audio effects, exact local save/resume, modal hand-off screens, hints, high contrast, keyboard play, pan/zoom, and reduced-motion support.
- An installable, offline-capable PWA with no build step, framework, tracking, server component, or third-party runtime asset.

## Run it

Serve the repository root with any static server and open `/game-of-dracula/`. For example:

```sh
python3 -m http.server 8000
```

The app also opens directly from `index.html`; service-worker installation is deliberately skipped under `file:`.

## Test it

The rules engine is independent of the DOM and uses Node's built-in test runner:

```sh
node --test game-of-dracula/tests/*.test.js
node game-of-dracula/tests/simulate.js 5000
```

The final retained suite has **18 tests**. A separate 5,000-night simulation completed every game with zero stalls; the first 400 runs repeatedly serialized and restored state. See `QA.md` for exact figures and browser-playthrough evidence.

## Project shape

```text
game-of-dracula/
├── index.html                 semantic table, setup, spinner, and rulebook
├── styles.css                 responsive 1970s-inspired presentation
├── engine.js                  deterministic, DOM-free rules engine
├── app.js                     SVG rendering, interaction, audio, and saves
├── manifest.webmanifest       PWA metadata
├── icon.svg                   original maskable icon
├── sw.js                      path-scoped offline cache
├── RESEARCH.md                evidence and restoration boundary
├── QA.md                      final validation record
├── REVIEW_LOG.md              adversarial review summary
├── reviews/                   six individual critic passes
└── tests/
    ├── engine.test.js         core rules regressions
    ├── invariants.test.js     final hostile-review regressions
    └── simulate.js            deterministic bulk playthrough runner
```

`engine.js` exports a frozen `DraculaEngine` API in browsers and CommonJS. State is serializable JSON. Randomness uses a small xorshift generator, so a saved game resumes exactly and a Night number reproduces the same opening player and spinner sequence. Route advice uses separate deterministic tie-breaking and cannot alter later spins.

## Rules-restoration policy

Only well-supported mechanics are presented as original rules. The surviving first instruction page, component photographs, the spinner card, catalogue records, and period-player recollections establish the core game, but the complete rulebook continuation was not available during research. Five underspecified points are therefore isolated in `RESTORATION_RULES` and disclosed in the in-game Archive:

1. A stone cannot be revisited during one exact-count move.
2. The Blue Vampire returns one exposed guest to the vault.
3. One plastic menace captures one guest per encounter, with deterministic tie-breaks.
4. The first Green holder joins the piece at its current perch.
5. A released Green holder takes the nearest safe cover outside the new Green piece.

See [RESEARCH.md](RESEARCH.md) for the evidence ledger and alternatives considered.

## Accessibility and privacy

All core actions have ordinary HTML controls as well as board targets. Legal SVG destinations are keyboard-focusable and respond to Enter/Space. Rule tabs implement Arrow/Home/End navigation. The game has a skip link, live status text, visible focus, large touch targets, high contrast, reduced motion, and modal pass-the-device privacy screens. Names, settings, and saves stay in local storage. Nothing is transmitted.

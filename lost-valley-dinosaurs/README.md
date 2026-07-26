# Lost Valley of the Dinosaurs

An original, no-build browser adaptation inspired by Waddingtons' 1985 board game. It recreates the physical drama of the set—painted hex valley, mountain rim, volcano, cardboard temple, bright explorer pawns, six tyrannosaurs, swamp monster, pteranodon, treasure coins, lava stones and adventure cards—using original SVG/CSS art and a deterministic JavaScript rules engine.

This is an unofficial, non-commercial historical tribute. It does not contain scans, copied illustrations, transcribed card faces or other assets from the commercial game.

## Play

Open `index.html` through a local HTTP server or at its GitHub Pages path. Choose:

- **Solo expedition** against one to three computer rivals.
- **Pass-and-play** for two to four local human players.
- **Short expedition**: first treasure carried out wins.
- **Long expedition**: first three treasures carried out win.

Every turn draws one of the 54 adventure cards, resolves its event, then moves one explorer. The game implements the original set's signature systems: four explorers per expedition, river and swamp one-space movement, twelve temple treasures, six dinosaur lairs, dinosaur captures and rescues, two secret paths, gun and ammunition cards, six cone eruptions followed by a coherent thirty-stone lava flow, pteranodon relocation, the clockwise swamp monster and the printed survivor tie-break.

The interface supports mouse, touch and keyboard; board pan/zoom; sound; reduced motion; responsive mobile play; deterministic seeds; and automatic local saves with an in-memory fallback when storage is unavailable.

## Architecture

- `engine.js` — DOM-free deterministic game model, board topology, rules, AI and validation.
- `game.js` — rendering, input, animation, audio, saves and dialogs.
- `index.html` / `style.css` — self-contained document shell and original visual design.
- `tests/engine.test.mjs` — exact component/card ledger and rule edge cases.
- `tests/adversarial.test.mjs` — invalid-action, corrupted-state and deterministic-replay checks.
- `tests/playthrough.test.mjs` — seeded full-game witnesses and invariant sweeps.
- `tests/browser.test.mjs` — real-Chrome interaction, hit-testing and desktop/mobile layout checks.
- `tests/static.test.mjs` — integration, accessibility and provenance guards.

## Research basis

The implementation was checked against the English instruction leaflet and complete-set photography. The Field Guide inside the game links the sources and explains the few digital interpretations. Rules are paraphrased rather than reproduced verbatim.

- English instruction leaflet: `uk.fabtintoys.com/pdf/lost-valley-game-instructions.pdf`
- Complete-set inventory and photography: `vintagetoysgames.co.uk`
- Designer and publication credits: BoardGameGeek and Board Game Guys

## Validation

From the repository root:

```sh
npm run test:lost-valley
```

The playthrough oracle runs four turn-by-turn invariant games, twenty-four short games and eight long games. The browser test drives six human turns with AI turns between them, opens the complete card ledger, and checks the 390-pixel mobile layout in an actual Chromium session.

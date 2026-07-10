# Wake & Fortune

A deterministic, turn-based cruise-line management game for the 0x4D44 GitHub Pages collection.

## Play locally

From the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/cruise-line/`.

The game is vanilla HTML, CSS and JavaScript. It has no runtime dependencies and works offline after the first load.

## Test the simulation

```bash
node --test cruise-line/*.test.mjs
```

The tests cover all focus/difficulty openings, seeded determinism, market and operating controls, ship design, construction and delivery, progression locks, refits, repairs, rival-AI stability, save restoration, contextual adviser logic and the static offline shell.

## Architecture

- `content.mjs` — game data, markets, ship technology, rivals and events.
- `engine.mjs` — pure simulation and state transitions; no DOM APIs.
- `app.mjs` — rendering, controls, reports and browser interaction.
- `storage.mjs` — validated local save and preference persistence.
- `guidance.mjs` — pure contextual adviser and guided-tour selection logic.
- `styles.css` — responsive visual system.
- `sw.js` / `manifest.webmanifest` — installable offline shell.

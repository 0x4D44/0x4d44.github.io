# Humanity Retention Programme

A mobile-first static web game for the 0x4D44 almanac. The player runs a suspicious containment dashboard through escalating fictional outbreaks, balancing infection, research, public trust, economy, government cooperation, lab capacity, AI stability, misinformation and ethical cost.

The game is deliberately fictional and satirical. It avoids real pathogen names, real medical advice, external assets, analytics, accounts, remote services and API calls.

## Files

- `index.html` — static app entry, PWA metadata and almanac back-link.
- `styles.css` — mobile-first retro crisis dashboard styling, generated map visuals, panels, modals and accessibility states.
- `content.js` — data-driven scenarios, regions, actions, upgrades, events, lore, achievements, endings, difficulties and mutators.
- `engine.js` — deterministic seeded simulation, campaign generation, event/action resolution, scoring, achievements, endings and save validation.
- `storage.js` — browser-local persistence, autosave, export/import and reset helpers.
- `audio.js` — local procedural WebAudio music and sound effects.
- `app.js` — UI views for menu, tutorial, campaign, quick play, map, actions, codex, achievements, history, options and hidden dev tools.
- `manifest.webmanifest`, `sw.js`, `icons/` — installable offline PWA shell with generated local icons.
- `tests/` — Node-based core simulation and static/PWA validation tests.

## Running locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/humanity-retention/`.

## Tests and static validation

From the repository root:

```bash
npm test
npm run build
```

There is no bundler and no production build step. `npm run build` performs static/PWA validation because the deployable output is the source folder itself.

## Deployment

Deploy the repository through GitHub Pages as usual. The app is static and lives at `/humanity-retention/`. The service worker is scoped to that folder and caches the complete app shell after first load.

## Hidden dev/tuning panel

Open the game with `?dev=1`, or type `retain` while the page is focused. The panel can unlock content, reset unlocks, force events/endings, complete a run, edit meters, grant regional AI control, spawn outbreaks, run seeded ticks, export debug state and show IDs/variables.

## Manual verification notes

The implementation was checked for deterministic campaign generation, bounded meters, regional infection spread, action costs/cooldowns, event choices, AI Administrative Control, scoring, achievements, endings, history, save import/export validation, versioned persistence, manifest/service-worker/icon presence, no remote runtime dependencies, mobile-first responsive CSS and reduced-motion support.

Known limitation: browser audio cannot start before the first user gesture, so procedural audio begins after the first click/tap. This is intentional browser-compliant behaviour.

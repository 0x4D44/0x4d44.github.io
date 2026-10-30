# Under Glasgow: The Trains (glasgow-subway/trains)

Almanac document: engineering deep-dive on Glasgow Subway trains and power. Static, no build.

- `index.html`, `styles.css`, `app.js` (UI, SVG charts, comparator), `sim.js` (lap model), `data.js` (content, sources, confidence marks), `geo.js` (generated from `../data/subway.json`).
- All performance/energy curves are MODELS (see `sim.js` header). Substation positions are estimates placed at their namesake stations.
- Key derived figures are explained in the page section "How the numbers were checked".
- Part of the Under Glasgow site: reached from the Explorer's "Trains & power" buttons (no separate catalog entry).

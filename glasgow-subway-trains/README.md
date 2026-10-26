# glasgow-subway-trains

Almanac document: engineering deep-dive on Glasgow Subway trains and power. Static, no build.

- `index.html`, `styles.css`, `app.js` (UI, SVG charts, comparator), `sim.js` (lap model), `data.js` (content, sources, confidence marks), `geo.js` (generated from `../glasgow-subway/data/subway.json`).
- All performance/energy curves are MODELS (see `sim.js` header). Substation positions are estimates placed at their namesake stations.
- Key derived figures are explained in the page section "How the numbers were checked".
- Catalog entry (slug `glasgow-subway-trains`) is added by the integrator in the root `data.js`.

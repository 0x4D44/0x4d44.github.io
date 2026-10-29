// Registry of extra themes. Each <name>.js default-exports { id, theme, scenery(track, X, K), terrainAmp?, shore?(track, wallDist), onRace?(...) } (or null while unwritten).
// `id` must equal the def's `theme` field. See track.js (createTrack / buildScenery) for X and K.
import mall from "./mall.js";
import highland from "./highland.js";
import canyon from "./canyon.js";
import skyway from "./skyway.js";
export const EXTRA_THEMES = Object.fromEntries([mall, highland, canyon, skyway].filter(Boolean).map((t) => [t.id, t]));

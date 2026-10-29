// Registry of extra track definitions (pure data). One file per track: <name>.def.js, default-exporting a TRACK_DEFS entry (or null while unwritten).
import mall from "./mall.def.js";
import highland from "./highland.def.js";
import canyon from "./canyon.def.js";
import skyway from "./skyway.def.js";
export const EXTRA_DEFS = [mall, highland, canyon, skyway].filter(Boolean);

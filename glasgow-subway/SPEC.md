# Glasgow Subway Explorer + Driver Simulator - shared contract

Slug `glasgow-subway`, lives at `/home/user/0x4d44.github.io/glasgow-subway/` (static site, NO build step, no
bundler: native ES modules + importmap). Final URL https://0x4d44.github.io/glasgow-subway/ . Plain static files only.
Scratch/raw downloads/caches go in `/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/work/`
(NOT in the repo). Repo size budget: whole `glasgow-subway/` dir <= ~45 MB, no single file > 12 MB.
Do NOT touch anything outside `glasgow-subway/` (the integrator edits data.js, index.html etc). Do NOT git commit/push -
the integrator does that. Never write into another agent's owned files; ask via SendMessage or leave a note in `NOTES-<you>.md`.

## Coordinate frame (js/shared/geo.js, tools/geo.py - already written, don't change)
World: +X east, +Y up (metres above sea level / OD), -Z north. Origin lat 55.8600 lon -4.2700. 1 unit = 1 metre.
Blender (Z-up): build X=east, Y=north, Z=up, export glTF with +Y up -> lands in world frame.
Heights: Clyde water ~3 m OD; city centre roughly 10-55 m OD (Garnethill/Cowcaddens/Hillhead high, Clyde banks low).

## Tooling available
Node 22 + npm (registry reachable), Python 3.13, Blender via `bpy`: `/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/venv/bin/python`
(has `bpy` 5.2 - run headless scripts with it; also `pip install` more there, e.g. numpy, shapely, mapbox-earcut, trimesh).
Playwright + Chromium preinstalled: `require('playwright')` works; launch headless with args
`['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']` for WebGL. Outbound HTTPS works via proxy for:
en.wikipedia.org (+API), api.openstreetmap.org (`/api/0.6/map?bbox=` works; max 0.25 sq deg and 50k nodes per call - tile it),
registry.npmjs.org, download.blender.org. overpass-api.de is BLOCKED. Test other hosts with curl before relying on them
(e.g. wikimedia commons, wikidata, s3 elevation tiles, spt.org.uk, glasgowsubway.co.uk/spt sites, geograph, ICE/Historic Env Scotland).
three.js: vendor it locally into `vendor/three/` via npm (`three@0.170.0` or newer, copy `build/three.module.js`,
`build/three.core.js` if present, and the needed `examples/jsm/` loaders/controls (GLTFLoader, DRACOLoader + decoder, OrbitControls,
BufferGeometryUtils, SkeletonUtils...)). The page index.html (agent 4) owns the importmap mapping `three` and `three/addons/` to `vendor/three/...`.

## Ownership
| Agent | Owns | Delivers |
|---|---|---|
| A1 research+data | `research/`, `data/subway.json`, `data/facts.json`, `tools/build_subway.*` | all facts + route geometry |
| A2 city | `data/terrain.json`, `data/city/**`, `js/shared/terrain.js`, `tools/city_*` | 3D central Glasgow GLBs built in Blender |
| A3 assets | `models/**`, `tools/assets_*` | train, station kit, tunnel/portal/depot GLBs built in Blender |
| A4 explorer | `index.html`, `css/**`, `js/main.js`, `js/explorer/**`, `vendor/**`, `tools/test_explorer.*` | the 3D explorer app UI |
| A5 simulator | `js/sim/**`, `tools/test_sim.*` | driver sim + station walk mode, exposed as module |

## data/subway.json  (A1)  -  all coordinates also pre-projected to world frame
```
{ "meta": { "name","operator","opened":"1896-12-14","length_km","stations":15,"gauge_mm":1220,"tunnel_diameter_m",
            "sources":[{"title","url"}], "generated":"ISO date" },
  "stations": [ { "id":"buchanan-street", "name":"Buchanan Street", "order":0..14 (outer-circle order, clockwise),
      "lat","lon","x","z",                 // station centre
      "surfaceY": m OD at the station, "railY": rail-head level m OD at platforms, "depth": m from street to rail head,
      "platform": { "type":"island"|"side"|"split", "lengthM","widthM","headingDeg": bearing of platform long axis,
                    "centreX","centreZ", "tracks":{"outer": {"x","z"},"inner":{"x","z"}} },   // track centre-lines at platform
      "entrances":[{"name","lat","lon","x","z","kind":"street"|"station-building"|"stair"}],
      "opened","rebuilt":[...], "interchange":["Subway"| "National Rail: Queen Street", ...],
      "summary": "<=60 words",  "description": "2-4 paragraphs of detail (HTML-safe plain text, \n\n separators)",
      "facts":[ "short fact", ...], "nearby":["landmark", ...], "architecture":"station building/platform detail notes" } ... ],
  "tracks": {                                  // two separate single-bore tunnels
     "outer": { "name":"Outer Circle","direction":"clockwise", "closed":true,
        "points":[ {"x","y","z","s"} ... ],    // y = rail-head level m OD, s = chainage metres along the loop from Buchanan St platform stop
        "stops":[ {"station":"id","s":chainage_of_platform_stop_for_driver_cab,"dwellS":25} ... ],   // in running order
        "gradient": derivable from points, "speedLimits":[{"s0","s1","kmh"}] },
     "inner": { ... "direction":"anticlockwise" ... } },
  "tunnel": { "innerDiameterM":3.35, "tubeSeparationM": typical, "lining":"cast iron / concrete segmental ...",
              "riverCrossings":[{"name","s0","s1","clearanceBelowBedM"}], "depot": {...Broomloan: lat,lon,x,z, "connection": station/track} },
  "rollingStock": { "current": {...Stadler 2020 data: cars, length_m, width_m, capacity, max_speed_kmh, accel, decel, mass_t, ...},
                    "history":[ {...} ] },
  "timeline":[ {"year":1896,"title","text"} ... ]  }
```
Track points: dense (every <=10 m on curves), smooth (Catmull-Rom/arc fit) so a 1.2 m-gauge simulated train can follow without kinks.
Real geometry source: OSM ways `railway=subway` (+ station nodes) via api.openstreetmap.org map calls; combine with literature for
depths (stations and river crossings), and fall back sensibly (documented in `research/`) where data is missing. Be honest in notes about what is
surveyed vs. estimated. Outer circle runs clockwise, inner anticlockwise (verify!). Verify station order, depths, platform types, interchanges.
`data/facts.json`: short "did you know" strings, glossary, and per-station extras if A1 wants beyond subway.json (optional).

## data/terrain.json + js/shared/terrain.js (A2)
`terrain.json`: `{ "minX","maxX","minZ","maxZ","cell":m, "nx","nz", "heights":[...nz rows of nx values, metres OD, 0.1 precision, row 0 = minZ] }`
(covering at least the Subway loop + 1 km margin; cell <= 20 m). `terrain.js` (ES module, no three import needed): `export async function loadTerrain(url)`,
`export function groundHeight(x,z)` (bilinear, clamps, usable synchronously after load). Also `export const WATER_Y`.

## data/city/** (A2)  - Blender-built, glTF 2.0 binary
Meshes tile/chunk the city (e.g. 500 m chunks `city_<i>_<j>.glb`) so the app can stream or load all; plus `data/city/manifest.json`:
`{ "chunks":[{"file","minX","maxX","minZ","maxZ","tris"}], "layers": ["terrain","buildings","roads","water","green","rail","landmarks"] }`.
Each GLB has separate named meshes per layer (`terrain_*`, `buildings_*`, `roads_*`, `water_*`, `green_*`, `landmarks_*`) so the explorer can hide/fade layers and x-ray the
ground. Buildings must sit on the terrain, use OSM heights (`height`, `building:levels`, `building:part` roofs where cheap) with sensible fallbacks. Quality over raw
count: nice shading (vertex colours / small palette of PBR materials, roofs differ from walls, glass-ish towers, sandstone tenement look for older areas), the Clyde as a proper
water surface, bridges (Kingston, Clyde Arc, Squinty, Glasgow Bridge...), and hand-modelled landmark touches (Finnieston Crane, Armadillo/SEC, Kelvingrove museum towers,
Glasgow University tower, City Chambers, Central Station, Buchanan Galleries..., Ibrox stadium bowl, Govan Town Hall, Clydeside bridges). Terrain mesh must be a separate
mesh `terrain_*` so ground can be made translucent (cutaway) - give it vertex colours/materials suitable for that. Budget total <= 30 MB (use Draco/meshopt only if
a decoder is vendored under `vendor/three/` - coordinate with A4; plain quantised GLB is fine).

## models/** (A3) - Blender-built glTF 2.0 binary + `models/MODELS.md` documenting node names, units (metres), origins and anchors
Required: `train.glb` (Subway train: Stadler 2-car units in SPT orange; modelled to real dimensions from A1 research or standard knowledge; exterior + simple detailed driver cab with
desk, and a separate cab-interior view; passenger saloon interior; doors as separately animatable nodes `door_L_*`, `door_R_*`; headlights; named empties: `cab_eye`, `couple_front`...),
`station_kit.glb` or several (island platform section, side platform section, platform edge/tactile strip, tunnel bore end caps, escalator banks, stairs, ticket hall furniture, gates, benches,
signage panels (blank, text added at runtime), pillars, arches/vaults, SPT-style tiles/lighting, lamps), `tunnel_segment.glb` (ring-lined 3.35 m bore, 1 ring = ~0.6 m, with cable trays, rails/sleepers,
third-rail/ guide rail as appropriate), `portal_depot.glb` (Broomloan depot building/portal), `entrance_kiosk.glb` (typical street entrance canopy + SPT roundel sign). Keep them light (<= 3 MB each).
Rails: 4 ft gauge (1220 mm), centre-rail power arrangement as per research (A1 verifies; Subway is third-rail/side-contact; do your own sanity research on wikipedia).

## Explorer <-> Simulator interface
A4's `js/main.js` creates the renderer, scene, city, tunnels. A5 exports from `js/sim/index.js`:
```
export async function startSim(ctx)   // ctx = { THREE, renderer, canvas, container (DOM div to put HUD in), subway (parsed subway.json), terrain (js/shared/terrain.js module),
                                      //         startStation?: id, line?: 'outer'|'inner', mode?: 'drive'|'ride', onExit(): void, assetBase:'./' }
                                      // returns { dispose(), pause(bool), getState() }.  The sim owns the renderer's render loop while active (A4 must stop its own loop and
                                      // restore on onExit()). Sim creates its own Scene/camera; it may load city GLBs itself (data/city/manifest.json) for street scenes.
export function simAvailable()
```
The explorer shows a "Drive the train" / "Ride" button per station and a main-menu button which calls `startSim`. The sim's HUD and the explorer's overlay UI must
both work on desktop (mouse+keyboard) and have usable touch controls; neither may cause horizontal page scroll at 390x844. Nothing interactive may sit in the top-left
109x41 px of the page (a fixed "<- Almanac" pill lives there: `<script defer src="/almanac-back.js"></script>` is added by integrator; keep first interactive content at x>=112px or y>=48px).

## Quality bar
Handsome, polished, performant (60 fps target on a mid laptop GPU; mobile gets reduced quality). Everything autonomous - make decisions, document them in `NOTES-<agent>.md`
(short) and move on. Test in real headless Chromium with screenshots (view PNGs with the Read tool) - fix what you find. No console errors. Final report to the integrator: <= 250 words,
what exists, file list, known gaps. Accuracy matters for facts - cite sources in research/ notes and mark estimates as estimates.

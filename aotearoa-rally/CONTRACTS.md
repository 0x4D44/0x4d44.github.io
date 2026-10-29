# Aotearoa Rally — module contracts

Six New Zealand special stages, a four-car garage, a championship against seven rivals. Plain static
ES modules + a vendored Three.js (r186). **No bundler, no build step, no network at runtime.**
Everything is served as-is from GitHub Pages under `/aotearoa-rally/`, so every path is relative.

This file is the single source of truth for how the five lanes fit together. Read it fully before
writing code. A lane may **add** exports/fields (document the addition under "Amendments" at the
bottom, append-only, one line each: lane, date-less, what). A lane may **never** rename, remove or
change the meaning of something listed here — other lanes are coding against it right now.

## 0. Ground rules (every lane)

* ES modules only. Pure logic files are `.mjs` and must import cleanly in **Node 22 with no DOM and
  no THREE** (they are unit-tested under `node --test`). Browser-only files (`render/`, `audio/`,
  `ui/`, `game.mjs`) may use DOM/THREE/WebAudio.
* Three.js is imported **only** as `import * as THREE from "three"` (an import map in `index.html`
  maps `three` -> `./vendor/three.module.min.js` and `three/addons` -> `./vendor/three-addons.min.js`).
  The addons bundle exports: `mergeGeometries, mergeVertices, toCreasedNormals, EffectComposer,
  RenderPass, ShaderPass, UnrealBloomPass, OutputPass, SMAAPass, Sky`. Nothing else is vendored; write
  what else you need.
* Determinism: all procedural content draws from `core/rng.mjs` (never `Math.random`). Physics is a
  fixed-step integrator at **120 Hz** (`dt = 1/120`) and is bit-for-bit repeatable for equal inputs.
* No external runtime requests (no CDN, no web fonts, no analytics). System font stack only.
* Original work only: no scans, no copied meshes/textures/sounds/code, no real car makes, no real
  sponsors, no trademarks (the game is "in the spirit of" late-90s rally classics; never name them).
  Do **not** read, copy from or imitate the other rally games in this repository
  (`OxAlphaRally`, `opus-rally`, `southern-cross-rally`, `cairn-run-rally`, `kart-racing`,
  `vector-gp`). Ignore them completely. This is a new standalone game.
* Never `git add/commit/stash/reset/checkout`: **the lead owns git.** Do not run `deltic board`.
  Do not touch files outside your lane (table in section 9) except to read them.
* Scratch goes in `<worktree>/.scratch/<lane>/` and you delete it before you finish.
* Be fast: land the exported API first with a simple but *valid* implementation (milestone M1) so
  other lanes can integrate against real code, then deepen. Write files to disk early and often.
* Performance budgets (high quality, 1080p, mid-range GPU): ≤ 600 draw calls, ≤ 2.0 M visible
  triangles, ≤ 6 ms main-thread JS per frame, no per-frame allocation in hot paths (reuse vectors and
  output objects). Physics step ≤ 0.35 ms.

## 1. Conventions

* **Units**: metres, seconds, radians, kilograms, newtons. Speeds are m/s internally (`kmh()` helper
  in `core/mathx.mjs` for display).
* **World**: right-handed, Three.js style. +Y up. With yaw 0 the car faces **−Z**.
  `yaw` is exactly the Three.js `object.rotation.y` of the car (positive = turn left / counter-
  clockwise seen from above). Forward `(−sin yaw, −cos yaw)` in (x, z); right `(cos yaw, −sin yaw)`.
  Helpers: `forwardOf`, `rightOf`, `yawOfDir` in `core/mathx.mjs`.
* **Car body Euler order** is `'YXZ'` (yaw about Y, then pitch about local X, then roll about local Z).
  `pitch > 0` = nose up. `roll > 0` = right side down.
* **Stage space**: `s` = metres along the centreline from the start line (0) to the finish line
  (`lengthM`). `lat` = signed lateral offset from the centreline, **positive = driver's right** when
  travelling toward increasing `s`. Tangent `(tx, tz)` is the unit travel direction in XZ; the right
  normal is `(−tz, tx)`.
* **Curvature** `curv` in 1/m, **positive = turning right**. `bank` in radians, **positive = right
  edge lower than left edge** (camber of a right-hand bend). `slope` = dy/ds.
* **Surfaces**: ids in `core/surfaces.mjs` (`SURFACE`, `SURFACE_INFO`).
* **Time**: stage clock in seconds, displayed `M:SS.mmm` (`formatTime`).
* **Typed arrays** for per-station data (`Float32Array`, `Uint8Array`).

## 2. Stage API — lane STAGES (`core/stage.mjs`, `core/stagedefs.mjs`)

```js
import { STAGE_DEFS, STAGE_IDS, getStageDef, buildStage } from "./core/stage.mjs";
```

* `STAGE_IDS` — exactly these six, in championship order:
  `["waitomo","whakarewarewa","coromandel","otago","remarkables","fiordland"]`.
* `STAGE_DEFS` / `getStageDef(id)` — **static** metadata, cheap, no build:

```js
{ id, number /*1..6*/, name, region, island: "North"|"South",
  blurb,                       // two evocative sentences (UI briefing)
  lengthTarget,                // metres, 3000..5500
  difficulty,                  // 1..5
  biome,                       // "pasture"|"redwood"|"coast"|"tussock"|"alpine"|"rainforest"
  environment: {
    timeOfDay,                 // hours 0..24
    sunAzimuth, sunElevation,  // radians (azimuth 0 = -Z north, increasing clockwise from above)
    sunColor, sunIntensity,    // hex, 0..~4
    skyTop, skyHorizon, fogColor, // hex
    fogNear, fogFar, fogDensity,  // metres / exp2 density hint for the renderer
    ambient,                   // hex hemisphere fill hint
    weather: { type: "clear"|"cloud"|"mist"|"rain"|"snow"|"storm", intensity /*0..1*/, wetness /*0..1 road+terrain*/ },
    windStrength,              // 0..1 (vegetation sway, particle drift)
    cloudCover,                // 0..1
    stars,                     // 0..1 (night stages)
    headlights                 // bool: dusk/night, the car must run lights
  },
  palette: { grass, grass2, dirtEdge, rock, foliage, foliage2, trunk, accent }, // hex hints for materials
  roadSurfaces: [SURFACE ids used],
  landmarks: [string],         // flavour, e.g. "Waitomo limestone bluffs"
}
```

* `buildStage(id, opts?) -> Stage` — **pure and deterministic** (`opts.seed` default = a fixed seed per
  stage so every player sees the same stage; `opts.detail` `'low'|'high'`, default `'high'`, only
  changes prop *density*, never the road). No THREE, no DOM. Build time budget ≤ 1500 ms in Node.

```js
Stage = {
  id, def, lengthM, ds /*=2*/, N,                 // stations i = 0..N-1 at s = i*ds, last at lengthM
  px, py, pz,        // Float32Array centreline position (py = finished road surface height)
  tx, tz,            // Float32Array unit tangent in XZ
  slope, width, curv, bank,                       // Float32Array (width = drivable width, m)
  surf, verge,       // Uint8Array road surface id / verge (off-road) surface id per station
  sample(s, out?)    -> { s, x, y, z, tx, tz, nx, nz, width, curv, bank, slope, surf, verge, heading }
                        // linear interpolation, s clamped to [0,lengthM]; reuse `out` if given
  project(x, z, hintS?, out?) -> { s, lat, dist, x, y, z, tx, tz }
                        // closest centreline point; `hintS` makes it O(1); always returns valid data
  heightAt(x, z)     -> number                    // ground height: terrain blended smoothly into the road
  normalAt(x, z, out?) -> { x, y, z }             // unit surface normal (finite-difference of heightAt)
  surfaceAt(x, z)    -> SURFACE id                // road surface within width/2, verge outside (water for fords)
  boundaryAt(s, out?) -> { left, right }          // metres from centreline to the invisible soft wall
  obstaclesNear(x, z, r, out?) -> out[]           // collidable props: { x, z, r, kind, hardness /*0..1*/, y0, y1 }
  props: [{ kind, x, y, z, rot, scale, variant, collide, r }],   // ALL scenery for rendering (see PROP_KINDS)
  checkpoints: [{ s, name }],                     // [0]= start s=0, splits ~every 1 km, last = finish s=lengthM
  hazards: [{ s, kind: "jump"|"crest"|"ford"|"bridge"|"cattlegrid"|"hairpin"|"tunnel", x, z }],
  startPose: { x, y, z, yaw },                    // car start, already facing +s
  pacenotes: [Pacenote],                          // see section 2.1
  minimap: Float32Array,                          // [x0,z0,x1,z1,...] ~200 points, whole stage
  bounds: { minX, maxX, minZ, maxZ, minY, maxY }, // terrain extents the renderer must cover (≥ boundary + 250 m)
  parTime: seconds,                               // estimate for an expert; the DYNAMICS bot later refines it
}
```

`PROP_KINDS` (exported array from `core/stage.mjs`; the WORLD lane renders every kind, with a
sensible fallback box if one is unknown). Each has a collision radius in the stage's `props` entry:
`pine, macrocarpa, redwood, beech, pohutukawa, kauri, tree_fern, cabbage_tree, flax, toetoe,
tussock, grass_tuft, fern, shrub, boulder, limestone, schist, log, stump, fence_post, fence_wire,
power_pole, sign_chevron, sign_warning, marker_post, tape_barrier, haybale, marshal, spectator,
spectator_group, car_parked, hut, farm_shed, bridge_deck, bridge_rail, culvert, sheep, cow,
steam_vent, waterfall, cattlegrid, guardrail, tyre_stack, flag, tent, banner_arch`.

### 2.1 Pace notes

```js
Pacenote = {
  s,                    // metres along the stage where the call *applies* (the feature starts here)
  kind,                 // "corner"|"hairpin"|"straight"|"crest"|"jump"|"caution"|"bridge"|"ford"|"finish"|"start"|"surface"
  dir,                  // "left"|"right"|null
  severity,             // 1 (hairpin) .. 6 (flat) — co-driver style numbers: "Left 3"
  length,               // metres the feature lasts
  modifiers,            // subset of: "long","short","tightens","opens","cut","dont_cut","maybe","bumpy","narrows","over_crest","into","caution","jump","slippery","blind"
  text,                 // short HUD label, e.g. "L3 ⟲ tightens"  (ASCII safe form: "L3 tightens")
  speak,                // spoken phrase, e.g. "Left three, tightens, into right four"
  icon,                 // stable key for the HUD glyph: "L1".."L6","R1".."R6","hairpin_l","hairpin_r","crest","jump","caution","bridge","ford","finish","straight","slippery"
  lead,                 // metres BEFORE `s` that the call should be voiced at speed v: use  lead(v) = s - clamp(v*2.6, 40, 220)
}
```

## 3. Vehicle API — lane DYNAMICS (`core/cars.mjs`, `core/physics.mjs`, `core/damage.mjs`, `core/bot.mjs`)

```js
import { CARS, CAR_IDS } from "./core/cars.mjs";
import { createVehicle } from "./core/physics.mjs";
```

* `CAR_IDS = ["huia","kea","takahe","piwakawaka"]`.
  `huia` — turbo AWD saloon, balanced; `kea` — short-wheelbase AWD hot hatch, sharp & twitchy;
  `takahe` — FWD kit car, light, rewards momentum; `piwakawaka` — RWD coupé, big power, loves to slide.
* `CARS[id]` (static spec): `{ id, name, tagline, class, drivetrain: "AWD"|"FWD"|"RWD", mass, wheelbase,
  trackFront, trackRear, cgHeight, weightFront (0..1), wheelRadius, engine: { idleRpm, redline, torqueCurve:[[rpm,Nm]..],
  turbo:{ spoolUp, spoolDown, boostTorqueGain }|null, inertia }, gears:[ratios], reverse, finalDrive, diff:{ front, centre, rear } , steeringLockDeg, brakeBias, brakeTorque,
  suspension:{ spring, damper, travel, antiRollFront, antiRollRear }, aero:{ cd, area, downforce }, stats:{ power, grip, handling, acceleration, toughness } /*1..10 for the UI*/,
  liveries:[{ name, body, accent, number, sponsor }] /*fictional sponsors only*/ }`.
* `createVehicle(spec, options?) -> Vehicle` where options `{ auto: true, tyre: "gravel"|"tarmac"|"snow", setup: { ... } }`.

```js
Vehicle = {
  spec, state,
  reset(pose /* {x,y,z,yaw} */, speed = 0),       // place on the ground, zero velocities, engine idling
  step(dt, input, stage),                           // advance ONE fixed step (use dt = 1/120)
  snapshot() -> plain JSON, restore(snap),          // for ghosts / replays / checkpoints
  repair(partial),                                  // service: restore damage by given fractions
}
input = { steer /*-1..1, negative = left*/, throttle /*0..1*/, brake /*0..1*/, handbrake /*0..1*/,
          gearUp /*bool, edge-triggered*/, gearDown /*bool*/ }
```

`vehicle.state` (consumers treat as read-only; the object identity is stable, fields are mutated):

```js
{ x, y, z, yaw, pitch, roll,                        // body pose (Euler 'YXZ')
  vx, vy, vz, speed /*forward m/s signed*/, speedKmh, lateralSpeed, yawRate, slideAngle /*rad, body vs velocity*/,
  rpm, gear /*-1 R, 0 N, 1..n*/, clutch, boost /*0..1*/, throttle, brake, steerAngle /*road wheel rad*/,
  airborne /*bool*/, onRoad /*bool*/, lat /*lateral offset from stage centreline*/, s /*stage position*/,
  wheels: [ { x, y, z /*hub*/, contactX, contactY, contactZ, steer, spin /*rad, accumulated*/, load /*N*/, slipRatio, slipAngle,
              grounded, compression /*0..1*/, susp /*m, + = compressed*/, surf /*SURFACE id*/, skid /*0..1*/, temp, punctured } ×4 ],  // FL FR RL RR
  damage: { engine, gearbox, steering, suspension: [fl,fr,rl,rr], tyres: [fl,fr,rl,rr], radiator, body: { front, rear, left, right }, total },  // all 0 (new) .. 1 (destroyed)
  events: [],   // drained by the game loop each frame with `state.events.length = 0` after reading
}
// event shapes: { t:"impact", strength /*0..1*/, zone:"front"|"rear"|"left"|"right"|"under", x, z, kind /*obstacle kind or "terrain"*/ }
//               { t:"landing", strength }, { t:"shift", from, to }, { t:"wastegate" }, { t:"limiter" },
//               { t:"bottomout", strength }, { t:"puncture", wheel }, { t:"engine_fail" }, { t:"roll" }, { t:"splash", strength }
```

* Physics must: handle gravel/tarmac/mud/snow/pumice grip via `SURFACE_INFO`; weight transfer; a proper
  combined-slip tyre model; per-wheel suspension with ground contact from `stage.heightAt/normalAt`;
  engine torque curve + turbo spool; automatic (and manual) gearbox; AWD/FWD/RWD with diffs; ABS-free
  braking; handbrake; collisions with `stage.obstaclesNear` (circle vs. car-oriented-box), and the
  invisible soft walls from `stage.boundaryAt`; jumps/landings; slopes; rollover recovery is not needed (the car
  may flip: treat roll > 70° for > 1.5 s as a stuck state the rules layer resolves by respawn).
* `core/bot.mjs`: `createBot(stage, vehicle, opts?) -> { control(dt) -> input, reset() }` — a driver that
  follows the road at the grip limit using look-ahead curvature and the pacenotes' severities, used for
  (a) par-time calibration, (b) browser autodrive tests, (c) the attract-mode demo and rival ghosts.
  It must complete all six stages without leaving the road for more than 2 s, on every car.
* Also exports `core/partimes.mjs`: `export const PAR_TIMES = { waitomo: { huia: seconds, kea: .., ... }, ... }`
  generated by `node aotearoa-rally/tests/calibrate-par.mjs` (bot laps, every car) and committed.

## 4. World renderer API — lane WORLD (`render/renderer.mjs` and friends)

```js
import { createWorld } from "./render/renderer.mjs";
const world = await createWorld(canvas, { quality: "auto"|"low"|"medium"|"high"|"ultra", onProgress(p, label) });
```

```js
world = {
  THREE, renderer, scene, camera,                  // camera is a PerspectiveCamera owned by the world; the camera rig moves it
  dynamicRoot,                                     // THREE.Group: LANE MACHINES parents cars, FX etc. here
  async setStage(stage, { weather? /* override def.environment.weather */ }),  // builds terrain/road/props/sky/weather; disposes the old stage
  update(dt, frame),                               // frame = { time, carPos:{x,y,z}, carVel:{x,y,z}, camPos, speedKmh, stageS }  — moves sun shadow, weather, LOD, sway
  render(),                                        // post-processed frame
  resize(cssW, cssH, dpr?),
  setQuality(level) / get quality / getStats() -> { fps, frameMsAvg, frameMsP95, drawCalls, triangles, geometries, textures, programs, resolutionScale },
  setGovernor(bool),                               // dynamic-resolution FPS governor (on by default in 'auto')
  environment: { sunDir:{x,y,z}, sunColor, ambient, fogColor, wetness, rain, snow, windVec, headlights },  // read by FX / car visuals
  addDecal / skid API: markSkid(wheelIndex, contact:{x,y,z}, yaw, intensity, surfaceId),  // persistent tyre marks on the road
  disposeStage(), dispose(),
}
```

* Terrain is built from `stage.heightAt` into chunked LOD meshes covering `stage.bounds`; the road is a
  ribbon built from the centreline arrays with surface-aware materials and camber; vegetation/props
  are instanced from `stage.props` with distance LOD; sky, sun, clouds, fog, rain/snow/mist, wet look,
  water, steam, waterfalls; shadows follow the car; post-processing (bloom, tone mapping, vignette, light
  grain, speed blur) with quality tiers and an FPS governor.
* Textures: `render/textures.mjs` loads `assets/tex/*` (generated with Codex image generation, then
  compressed to JPEG/WebP and tiled/normal-mapped by a documented script) and falls back to canvas-
  procedural textures when a file is missing, so the game always renders. Total shipped texture weight
  ≤ 24 MB, each file ≤ 600 KB.

## 5. Machines API — lane MACHINES (`render/car.mjs`, `render/fx.mjs`, `render/camera.mjs`, `audio/*`)

```js
import { createCarVisual } from "./render/car.mjs";
import { createFX } from "./render/fx.mjs";
import { createCameraRig, CAMERA_MODES } from "./render/camera.mjs";
import { createAudio } from "./audio/audio.mjs";
```

```js
const car = createCarVisual(THREE, spec /*CARS[id]*/, { livery: 0, number: 7 });
car.object3d                                       // THREE.Group, origin at the car's centre of mass on the ground plane projection; -Z forward
car.update(vehicle.state, dt, world.environment)  // pose, wheel spin/steer/suspension, body roll, lights, brake lights, damage
car.setDamage(state.damage) / car.setDirt(0..1) / car.setLights({ head, brake, reverse })
car.setViewMode("exterior"|"bumper"|"bonnet")      // hides body/driver parts for first-person views, shows the dashboard
car.dispose()

const fx = createFX(THREE, world);                 // adds its own groups to world.dynamicRoot
fx.update(dt, vehicle.state, world.environment, stage)   // dust, mud, spray, sparks, smoke, exhaust flames, debris, rain on the lens
fx.burst(kind, position, params?)                  // "impact_sparks"|"debris"|"splash"|"leaves"
fx.dispose()

const rig = createCameraRig(THREE, world.camera);  // CAMERA_MODES = ["chase","far","bumper","bonnet","cinematic","replay"]
rig.setMode(mode); rig.cycle();
rig.update(dt, vehicle.state, stage, { shake /*0..1*/, fovBoost })   // smooth follow, speed-FOV, look-into-corner, collision with terrain, crash shake
rig.snap(vehicle.state)                              // teleport-no-lerp

const audio = createAudio({ master:1, engine:1, effects:1, voice:1, ambience:1 });   // must be created/resumed from a user gesture
audio.resume(); audio.setStage(stage.def); audio.update(dt, vehicle.state, stage, { cameraMode, paused })
audio.setCarSpec(spec); audio.playUI("click"|"confirm"|"back"|"countdown"|"go"|"finish"|"checkpoint"|"warning")
codriver = audio.codriver  // { enable(bool), setVoice(name|null), say(text), update(stage, s, speedMs), reset(), list voices }
audio.setVolumes({...}); audio.dispose()
```

* Audio is **fully synthesised** with WebAudio (no samples): multi-harmonic engine with turbo whistle,
  wastegate flutter, anti-lag crackle, limiter, transmission whine and gear-change thump; surface-
  dependent tyre/gravel/mud/snow/water noise driven by wheel slip; wind and ambience per biome (birds,
  rain, surf, streams); body impacts, bottoming out, landings, stone pings; start-line crowd murmur;
  UI blips. The co-driver uses `speechSynthesis` (English voice, prefers `en-NZ`/`en-AU`/`en-GB`),
  with a synthesised-tone fallback when no voice exists, and never speaks over itself.

## 6. Game shell API — lane COCKPIT (`index.html`, `game.mjs`, `ui/*`, `core/career.mjs`, `core/rules.mjs`, `core/input.mjs`)

* `index.html` is the entry: canvas + overlay DOM, import map, `<script type="module" src="./game.mjs">`,
  `<script defer src="/almanac-back.js"></script>` just before `</body>`, a manifest-free single page.
  Fully responsive: no horizontal scroll at 390×844 and 768×1024; the almanac back pill is
  top-left, so keep top-left UI clear (≥ 120×44 px) on every screen.
* `core/input.mjs`: `createInput({ target, onPause })` -> `{ poll() -> input, setBindings(), bindings, gamepadConnected, touch }`
  (keyboard WASD/arrows + Space handbrake + Shift/Ctrl gears, gamepad analogue triggers/stick with
  dead-zone and steering smoothing, on-screen touch controls with tilt option). Returns exactly the
  `input` shape of section 3.
* `core/rules.mjs` (pure): `createRun({ stage, vehicle, difficulty })` -> `{ start(), update(dt, state), time, splits, penalties, status:"ready"|"countdown"|"running"|"finished"|"dnf", ...}`
  with countdown 3-2-1-GO, checkpoints, wrong-way detection, stuck/flipped detection and respawn with
  a time penalty, false-start rule, DNF at total damage ≥ 1.
* `core/career.mjs` (pure, injected storage): championship over the six stages in order, 8-car field
  (player + 7 rivals from `core/rivals.mjs`), points 10-8-6-5-4-3-2-1, three difficulty levels,
  service budget between stages (repair minutes) and setup options, cumulative time + penalties,
  standings; `serialize()/deserialize()`; best-times and ghosts per stage/car; save slot via
  `localStorage` through a storage adapter (`createStorage(window.localStorage | memory)`), versioned key `aotearoa-rally.save.v1`.
* Game loop: fixed-step 120 Hz accumulator (max 8 steps/frame) -> `vehicle.step` ; render once per
  rAF; HUD/audio/camera updated per frame. Pause on blur/visibility change.
* **Debug/test API** (always present, no UI): `window.__AR__`:

```js
__AR__.ready                         // Promise: assets loaded, main menu showing
__AR__.version                       // "1.0.0"
__AR__.startStage({ stageId, carId = "huia", livery = 0, weather?, quality?, countdown = false, bot = false })  // Promise resolved when the car can be driven
__AR__.teleport(s, lat = 0, speedKmh = 0)   // put the car on the stage at s facing forward
__AR__.setBot(bool)                  // autodrive with core/bot
__AR__.stepSim(n, dt = 1/120)        // advance physics+rules n fixed steps without rendering
__AR__.renderNow()                   // force one render so a screenshot is current
__AR__.setCamera(mode)
__AR__.state()                       // JSON: { screen, stageId, carId, s, lat, speedKmh, rpm, gear, time, status, damage, splits, camera, quality }
__AR__.perf()                        // world.getStats()
__AR__.errors                        // array of captured window errors / console.error strings (must stay empty)
__AR__.finishRun()                   // drive-through helper for tests: complete the stage instantly using the bot's time
```

* URL params: `?stage=otago&car=kea&livery=1&quality=low&bot=1&mute=1&nomenu=1&weather=rain&camera=bonnet`.
  `nomenu=1` boots straight into the stage (used by screenshot/test tooling).

## 7. File layout

```
aotearoa-rally/
  index.html  game.mjs  CONTRACTS.md  package.json  favicon.svg  THREE-LICENSE (vendor/THREE-LICENSE.txt)
  vendor/   three.module.min.js  three-addons.min.js  THREE-LICENSE.txt           (lead, done)
  core/     mathx rng surfaces                         (lead, done)
            spline terrain stage stagedefs pacenotes rivals                 (STAGES)
            cars tyre physics damage bot partimes                          (DYNAMICS)
            career rules input storage                                      (COCKPIT)
  render/   renderer terrain road scenery sky weather materials textures post quality   (WORLD)
            car cars/* fx camera                                                       (MACHINES)
  audio/    audio engine surface ambience codriver mixer                               (MACHINES)
  ui/       *.mjs *.css                                                                (COCKPIT)
  assets/   tex/* (WORLD, MACHINES)   ui/* (COCKPIT)
  tests/    <lane>-prefixed tests; harness.mjs shoot.mjs browser.test.mjs validate-static.mjs (COCKPIT)
```

## 8. Test commands

* Pure logic: `node --test aotearoa-rally/tests/<name>.test.mjs` (from the worktree root).
* Everything for the game: `npm --prefix aotearoa-rally test` (COCKPIT wires `package.json`: `test` runs all
  `tests/*.test.mjs` with `node --test`, then `validate`; `browser` runs the headless-Chrome suite;
  `shoot` writes screenshots to a directory you pass).
* Headless Chrome with WebGL on this box: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (`CHROME_PATH` overrides) with `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist --enable-webgl --hide-scrollbars`; serve the folder over a local
  `node:http` server (the pattern in the repo's `tests/responsive.test.mjs` shows how to spawn Chrome
  and speak CDP over `WebSocket`; read only that file, none of the games). SwiftShader is slow: tests
  must use `quality=low`, small viewports (e.g. 960×540) and `__AR__.stepSim` instead of real-time play.

## 9. Lane ownership (exclusive write access)

| Lane | Owns |
|---|---|
| STAGES | `core/spline.mjs core/terrain.mjs core/stage.mjs core/stagedefs.mjs core/pacenotes.mjs core/rivals.mjs`, `tests/stages-*.test.mjs` |
| DYNAMICS | `core/cars.mjs core/tyre.mjs core/physics.mjs core/damage.mjs core/bot.mjs core/partimes.mjs`, numeric tuning inside `core/surfaces.mjs`, `tests/dynamics-*.test.mjs`, `tests/calibrate-par.mjs` |
| WORLD | `render/renderer.mjs terrain.mjs road.mjs scenery.mjs sky.mjs weather.mjs materials.mjs textures.mjs post.mjs quality.mjs`, `assets/tex/*`, `tools/textures/*`, `tests/world-*.test.mjs` |
| MACHINES | `render/car.mjs render/cars/* render/fx.mjs render/camera.mjs audio/*`, `assets/tex/car-*`, `tests/machines-*.test.mjs` |
| COCKPIT | `index.html game.mjs package.json favicon.svg ui/* assets/ui/* core/career.mjs core/rules.mjs core/input.mjs core/storage.mjs`, `tests/cockpit-*.test.mjs tests/harness.mjs tests/shoot.mjs tests/browser.test.mjs tests/validate-static.mjs` |
| lead | `vendor/* core/mathx.mjs core/rng.mjs core/surfaces.mjs (structure) CONTRACTS.md`, `data.js`, root `index.html` sprite, root `package.json`, git |

## Amendments (append-only; lane — what)


# OpusRally — module contracts

**This file is the law.** Every module below is owned by exactly one author. If you
need something a contract does not give you, say so in your report — do **not**
change another module's file, and do not invent a different signature.

## Ground rules

- Plain ES modules, no build step, no bundler, no TypeScript, no new dependencies.
  Three.js r158 is vendored at `./three.module.min.js` and is the *only* import
  from outside this directory. Import it as `import * as THREE from "./three.module.min.js";`
- Runs from a static file server (`python -m http.server`). Never `fetch` anything
  outside `opus-rally/`.
- **Units: SI.** metres, seconds, kilograms, newtons, radians. Angles CCW-positive
  about the axis given by the right-hand rule.
- **Axes: Three.js right-handed, +Y up.** Vehicle local frame: `+Z` forward,
  `+X` right, `+Y` up. World heading `yaw` rotates about `+Y`, so the world-space
  forward unit vector is `(sin yaw, 0, cos yaw)` and right is `(cos yaw, 0, -sin yaw)`.
- **No allocation in the per-frame path.** Physics and render update run at up to
  240 Hz / 60 Hz. Preallocate scratch vectors at module scope. `new THREE.Vector3()`
  inside a hot loop is a defect.
- All randomness goes through `rng.js` — seeded, deterministic, no `Math.random()`
  anywhere in the codebase. Determinism is load-bearing: replays, ghosts and the
  physics regression tests all depend on identical output for identical input.
- Everything must run headless under Node for tests: modules that need THREE must
  keep their pure maths in a THREE-free path, or accept THREE by injection.
- **Original assets and branding only.** No real manufacturer, team, driver, event
  or sponsor names. No copied textures, models or audio samples. Everything is
  generated procedurally in code (canvas textures, WebAudio synthesis,
  `BufferGeometry` built from arrays).
- Code comments explain *why*, in the voice of the surrounding repo: sparse,
  declarative, no banner comments, no `// ---- section ----` rulers longer than a
  line, no restating the code in English.

## Shared modules (already written — read them, never edit them)

| File | Exports |
| --- | --- |
| `mathx.js` | `clamp`, `lerp`, `smoothstep`, `smootherstep`, `damp`, `moveToward`, `wrapAngle`, `angleDelta`, `sign`, `mix`, `invLerp`, `remap`, `saturate`, `approach`, `cubicHermite`, `catmullRom`, `easeOutCubic`, `easeInOutCubic` |
| `rng.js` | `makeRng(seed) -> { next(), range(a,b), int(a,b), pick(arr), gauss(mu,sigma), chance(p), fork(salt) }`, `hash2(x,y)`, `hash3(x,y,z)`, `valueNoise2(x,y,seed)`, `fbm2(x,y,seed,octaves,lacunarity,gain)`, `ridged2(...)`, `stringSeed(s)` |
| `surfaces.js` | `SURFACE` enum, `SURFACE_LIST`, `surfaceProps(id)`, `blendSurface(a,b,t)`, `wetnessGrip(props, wetness)` |

### `SURFACE`

```
TARMAC 0, GRAVEL 1, DIRT 2, SNOW 3, ICE 4, GRASS 5, MUD 6, SAND 7, ROCK 8, WATER 9
```

`surfaceProps(id)` returns a frozen object:

```
{
  id, name,
  gripLong, gripLat,     // peak friction coefficient multipliers, tarmac dry = 1.0
  rollingResistance,     // dimensionless, ~0.012 tarmac … 0.06 sand
  looseDepth,            // 0 = hard, 1 = deep loose material — drives the loose-surface
                         // "cut" bonus at high slip and the berm effect
  roughness,             // 0..1, feeds suspension noise and camera shake
  dragOffRoad,           // extra longitudinal drag N per (m/s)^2 when ploughing
  dustRate,              // particles/sec/wheel at 20 m/s
  dustColour: [r,g,b],   // linear 0..1
  sfx,                   // key into audio surface loop bank
  albedo: [r,g,b],
  specular, wetDarken
}
```

## Module ownership

### `physics.js` — vehicle dynamics
Exports:
```js
export const CAR_CLASSES;              // frozen array of class descriptors
export const CARS;                     // frozen array of car specs (original names)
export function carSpec(id);           // -> spec or throws
export function createCar(specId, opts) // -> CarState
export function resetCar(car, x, y, z, yaw)
export function stepCar(car, input, world, dt)   // dt <= 1/120, caller substeps
export function carTelemetry(car)      // -> plain object for HUD/tests, no allocation churn
export const CarInput;                 // factory: makeInput() -> {steer,throttle,brake,handbrake,clutch,shiftUp,shiftDown,gear}
```
`world` is `{ heightAt(x,z), normalAt(x,z,out), surfaceAt(x,z,out), gravity }`
supplied by `stage.js` (see below). `CarState` public fields are pinned in
`physics.js`'s header comment and consumed by `render.js`, `hud.js`, `audio.js`,
`damage.js` — adding fields is fine, renaming is a breaking change.

### `stage.js` — procedural stage + terrain + world queries
```js
export function generateStage(seed, options) // -> Stage
export const STAGE_BOOK;                     // frozen list of authored stage definitions
export function stageWorld(stage)            // -> the `world` object physics.js consumes
```

### `pacenotes.js` — co-driver call generation
```js
export function derivePacenotes(stage, opts) // -> Pacenote[]
export function pacenoteText(note, style)    // -> string for TTS
export function pacenoteGlyphs(note)         // -> [{kind, text, severity}] for the HUD
export function createPacenoteRunner(notes, opts) // -> { update(s, speed, dt), reset(), pending }
```

### `damage.js` — impact + component damage
```js
export function createDamage()
export function applyImpact(damage, car, impact)   // impact: {speed, normal, point, kind}
export function stepDamage(damage, car, dt)
export function damageEffects(damage)  // -> multipliers physics.js reads via car.damage
export function damageReport(damage)   // -> UI rows
```

### `weather.js` — conditions, sky, precipitation, time of day
```js
export const WEATHER_PRESETS;
export function createWeather(THREE, scene, preset)
export function stepWeather(weather, camera, dt)
export function weatherSurfaceModifier(weather) // -> {wetness, gripScale, visibility}
```

### `audio.js` — WebAudio synthesis
```js
export function createAudio(opts)      // -> AudioSystem, no AudioContext until start()
```

### `meshes.js` — procedural geometry + canvas textures
```js
export function buildRoadMesh(THREE, stage, opts)
export function buildTerrainMesh(THREE, stage, opts)
export function buildCarMesh(THREE, spec, livery)
export function buildWheelMesh(THREE, spec)
export function buildSceneryLibrary(THREE, stage)
export function buildPropLibrary(THREE)
export function liveryTexture(THREE, livery)
```

### `render.js` — scene, cameras, lighting, particles, post
```js
export function createRenderer(canvas, opts) // -> RenderSystem
```

### `hud.js` — in-race HUD
```js
export function createHud(root, opts) // -> { update(frame), setPacenote(...), flash(...), destroy() }
```

### `ui.js` — menus, stage select, results, settings
```js
export function createUi(root, opts) // -> UiSystem, event-driven via opts.on*
```

### `career.js` — championship, records, persistence
```js
export function createCareer(storage)
```

### `replay.js` — input recording, ghosts
```js
export function createRecorder(), createGhost(...)
```

### `game.js` + `index.html` — owned by the lead. Do not edit.

## Pinned data shapes

### `Stage` (produced by `stage.js`, consumed by everyone)

```js
{
  id, name, country, seed, notes,          // strings; `country` is invented, not real
  surfaceMix: [SURFACE.GRAVEL, ...],       // dominant surfaces, for UI + audio preload
  length,                                  // metres of centreline
  step,                                    // metres between samples (2.0)
  count,                                   // number of samples
  // Structure-of-arrays, all Float32Array(count) unless noted:
  s, x, y, z,                              // centreline arc length + world point (y = road surface)
  tx, ty, tz,                              // unit tangent (direction of travel)
  nx, ny, nz,                              // unit road-surface normal
  curvature,                               // signed 1/m; POSITIVE = turns LEFT
  grade,                                   // dy/ds, + = climbing
  camber,                                  // radians; POSITIVE = surface banked down to the left
  halfWidth,                               // metres of drivable surface either side of centreline
  surface,                                 // Uint8Array of SURFACE ids
  crest,                                   // Float32Array 0..1, how much the road falls away over the top
  jump,                                    // Float32Array 0..1, launch strength
  features: [{ s, kind, severity, meta }], // "hairpin","crest","jump","bridge","ford","tunnel","narrows","junction","chicane"
  splits: [s, ...],                        // 2 intermediate splits
  start: { x, y, z, yaw },
  finish: { s, x, y, z },
  bounds: { minX, maxX, minZ, maxZ },
  scenery: [{ kind, x, y, z, yaw, scale, variant }],   // trees, rocks, bushes, buildings, poles
  props:   [{ kind, x, y, z, yaw, scale, variant, s }],// gates, hay bales, tape, spectators, signs, banners
  world,                                   // the object below, also returned by stageWorld()
}
```

### `world` (produced by `stage.js`, consumed by `physics.js`)

```js
{
  gravity: 9.81,
  heightAt(x, z),                          // -> ground y at a world point (road or terrain)
  normalAt(x, z, out),                     // -> out {x,y,z} unit normal, returns out
  surfaceAt(x, z, out),                    // -> out; fields below; returns out
  sampleAt(s),                             // -> nearest sample index for arc length s
  project(x, z, hintS, out),               // -> out {s, lateral, signedLateral, index}
  bounds,
}
```

`surfaceAt` fills `out` (caller-owned, never allocates):
```js
{ props,          // a surfaceProps()/blendSurface() object — read-only
  surfaceId,
  onRoad,         // boolean
  lateral,        // |distance| from centreline, metres
  signedLateral,  // + = right of the direction of travel
  s,              // arc length of the projection
  edgeBlend,      // 0 = pure road, 1 = pure verge
  roughness,      // 0..1 including local noise
  ruts }          // 0..1, how deep the racing-line ruts are here
```

### `CarState` public fields (produced by `physics.js`)

```js
{
  spec,                                  // the frozen car spec
  pos:  {x,y,z},                         // centre of mass, world
  vel:  {x,y,z},                         // world m/s
  yaw, pitch, roll,                      // radians, chassis attitude
  yawRate, pitchRate, rollRate,
  quat: {x,y,z,w},                       // chassis orientation, ready for THREE
  speed,                                 // |horizontal velocity|, m/s
  forwardSpeed,                          // signed component along the car's nose
  slipAngle,                             // chassis slip angle, radians (+ = sliding right)
  lateralG, longitudinalG, verticalG,
  engineRpm, engineLoad, turboBoost, turboSpool,
  gear,                                  // -1 reverse, 0 neutral, 1..n
  gearShiftTimer, clutchEngage,
  wheels: [FL, FR, RL, RR],              // see below
  onGround,                              // count of wheels in contact
  airTime,                               // seconds since last contact
  rolledOver,                            // boolean
  damage,                                // the object from damage.js, or null
  input,                                 // the last input applied (after assists)
  odometer,
}
```

Each wheel:
```js
{
  index, isFront, isLeft,
  localPos: {x,y,z},                     // hub position in chassis frame at rest
  worldPos: {x,y,z},
  contact,                               // boolean
  contactPoint: {x,y,z}, contactNormal: {x,y,z},
  compression,                           // 0..1 of travel used
  suspensionForce, load,                 // N
  steerAngle,                            // radians, + = left
  spinRate,                              // rad/s
  slipRatio, slipAngle,                  // dimensionless / radians
  fx, fy,                                // tyre force in wheel frame, N (fx long, fy lat)
  surfaceId, gripUsed,                   // 0..1+ of the friction circle in use
  skidding, dustRate, temperature, wear, punctured,
}
```

### HUD frame (assembled by `game.js`, consumed by `hud.js`)
```js
{ speedKph, gear, rpm, rpmLimit, turbo, throttle, brake, handbrake, steer,
  distance, stageLength, timeMs, splitDeltaMs, lastSplitMs,
  pacenote, nextPacenote, surfaceName, damage, weather, positionPct,
  gripUsed, telemetry }
```

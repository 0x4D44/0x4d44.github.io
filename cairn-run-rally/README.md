# Cairn Run Rally

**Cairn Run Rally** is an original, self-contained point-to-point world-rally game. Six
regions, six fictional cars, authored co-driver calls, weather, damage, service choices,
and a persistent six-event championship share one deterministic simulation.

![Title screen](docs/screenshots/title.png)

![Kestrel Ridge gameplay](docs/screenshots/gameplay.png)

## Run it

Requirements: a modern desktop browser with WebGL2 and Node.js 18 or newer.

```bash
npm start
```

Open the printed address, normally `http://127.0.0.1:4173`. The game has no package
dependencies or install step. Code, shaders, geometry, effects, and spoken pace-note
audio are local files.

## World rally

| Region | Country | Route identity | Weather |
|---|---|---|---|
| Kestrel Ridge | Scotland | damp moor, quarry, bridge hairpin | ridge mist |
| Aurora Forest | Finland | lakeside gravel, spruce corridors, jumps | clear |
| Rift Valley Run | Kenya | savannah gravel, water splash, washboard | dry heat |
| Kurotake Pass | Japan | wet mountain tarmac, cedar tunnels, retaining walls | dusk rain |
| Costa Brava Heights | Spain | sea cliffs, village streets, changing camber | clear air |
| Wattle Creek | Australia | loose red gravel, cattle grids, rough verges | late storm |

The garage contains six mechanically distinct cars: FWD Lumen F2; AWD Cairn R4, Varga
R6, and Nord GT; and RWD Sirocco B1 and Atlas XR. Their torque curves, gearing, mass,
inertia, suspension, tyre balance, silhouettes, and damage limits are authored data.

Quick Rally and Practice/Time Trial expose the complete roster. World Championship runs
all six events in order. After each stage, the 60-minute service plan combines repairs,
standard/tarmac/wet/gravel tyres, and bounded brake-bias, steering-ratio, ride-height,
and damping adjustments. The pure planner reports costs and remaining time before the
choice is committed. Damage, tuning, points, rivals, penalties, standings, and resume
state survive a versioned local save.

## Driving model

The car simulation runs at a fixed 120 Hz. Each axle carries its own wheel speed,
integrated implicitly against a stiff slip curve with the engine and gearbox reflected
through the current ratio, so wheelspin, lockup, and the engine flare that goes with them
come out of the model rather than out of special cases. One combined-slip tyre turns the
slip ratio and slip angle into a single force, so braking, cornering and traction share
the contact patch by geometry. Longitudinal and lateral load transfer (split by
roll-stiffness share), tyre load sensitivity, aero downforce, tyre relaxation length, and
gravity along the road camber move grip between the axles and the wheels.

Braking help is anti-lock on the measured slip ratio; stability help only ever removes
rotation; steering lock is speed- and grip-sensitive, so the useful range of the stick
stays useful at 140 km/h. Compact gravel, loose gravel, grass, tarmac, wet tarmac, snow,
ice, mud, and desert gravel each carry their own friction, resistance, roughness, peak
slip, relaxation, particles, and audio recipe. Damage, collision impulses, airtime and
bounded recovery sit on top; a car off the road that can drive itself back is left to do
so, and one that is bogged is recovered.

The route builder samples authored cumulative distance exactly. Timing, splits, nearest-road
projection, recovery, hazards, barriers, landmarks, scenery, and finish checks use the same
stage geometry. The chase camera blends body yaw, velocity direction, and road heading so
large slides retain useful road context.

## Rendering

Lighting runs in linear space through a filmic tone curve with a per-weather exposure:
hemispheric sky and ground ambient, a desaturated key light, Blinn-Phong specular with
per-material response (wet roads, bodywork, glass), and height-aware fog that scatters the
sun and meets the horizon colour, so distant land dissolves into the sky. The sky is ray-cast
from the inverse view-projection, so the sun disc, glow, drifting cloud deck and night stars
stay put while the car turns under them. The car throws a soft multiplicative contact shadow
that widens with airtime; trees, bushes and rocks carry baked shadows cast away from each
stage's own sun. Roads carry wheel ruts and verge tufts; the wheels spin at their simulated
per-axle speeds and throw rooster tails, lock-up smoke and marks.

## Audio and controls

Each car has a data-derived engine/transmission layer. Surface, collision, wind, and
weather layers consume live simulation state; landing impacts feed the collision layer.
Every authored pace note has a stage-qualified local MP3 and Ogg asset: 119 calls, 238 files.
The queue is predictive, captions match the route card, and stale calls cannot silence later
notes. If audio is unavailable, the game stays finite and reports zero active voices.

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | A / Up | Right trigger / A |
| Brake / reverse | Z / Down | Left trigger / B |
| Steer | ,/. or Left/Right | Left stick |
| Handbrake | Space | X |
| Shift up/down | E / Q | LB / RB |
| Pause / resume | Escape | Menu / Start |
| Restart | R | Y |
| Confirm | Enter | A |
| Navigate menus | Arrows | D-pad |
| Fullscreen | Double-click the game view | — |

Keyboard and gamepad bindings are independently remappable and persist in the local save.
Disconnect, reconnect, pause, and screen transitions clear latched controller state.
Automatic gears, stability help, braking help, and pace-note display are explicit assists.

## Evidence

```bash
npm test             # 146 deterministic and adversarial tests
npm run simulate     # reference-stage regression
npm run simulate:matrix  # all 36 car/stage pairings
npm run smoke        # real browser flow and failure recovery
npm run review       # shell, region, car, and responsive captures
npm run qa           # tests, matrix, and browser smoke
```

`npm run smoke` holds a 1080p hardware frame budget by default. In a container with no
GPU, `CAIRN_ALLOW_SOFTWARE_GL=1 npm run smoke` runs the whole flow on a software renderer
and reports, rather than enforces, that budget.

Observed evidence for the current build:

- `npm test`: **146/146** passed, including unit tests for the slip curve, wheel
  integration, combined slip, load transfer and sensitivity, downforce and relaxation;
  anti-lock, steering-lock, adversarial-input and bit-identical-rerun tests for all six
  cars; and the sky's unprojection, render environment bounds and materials;
- reference matrix: **36/36** pairings finish inside their duration bands, maximum
  **10 recoveries**, maximum aggregate damage **0.29**. The reference driver is a
  fixed-gain controller and the grip-limited tyre model costs it the verge now and then;
  the gate is that every pairing completes with a survivable car. The duration bands were
  recalibrated from this simulation, and they also set the rivals' pace;
- the browser smoke (software GL) passes: a six-event championship visits all six
  stages, classifies, resumes after a reload and keeps stable audio voices; all four
  shader programs link with every uniform bound and no GL error;
- abandon is terminal; corrupt saves recover; no HTTP requests occur after load;
- a forced audio failure remains finite with **0 voices**, and WebGL2 absence produces a
  usable `role="alert"` explanation;
- seven menu shells at 390×844 and 768×1024 have no overflow or clipped controls;
- the previous build measured GPU **0.45 ms** and frame p95 **9.6 ms** at 1920×1080 on an
  Apple M5 Max (ANGLE Metal). The current renderer adds a ray-cast sky, per-pixel fog
  scattering and a shadow pass and has only been measured on SwiftShader, where it is
  roughly four times the previous build's cost; re-measure it on hardware before quoting a
  number.

`npm run review` writes generated captures under `artifacts/review/`. Those captures are
review evidence and are ignored rather than committed product assets.

See [the architecture](docs/ARCHITECTURE.md), [benchmark](docs/BENCHMARK.md),
[quality report](docs/QUALITY_REPORT.md), [gauntlet log](docs/GAUNTLET_LOG.md),
[adversarial review](docs/ADVERSARIAL_REVIEW.md), and [the gauntlet prompt](docs/GAUNTLET_PROMPT.md).

## Human judgement boundary

Automation proves deterministic reachability, state safety, asset presence, measurable
mechanical difference, browser recovery, and performance on the recorded machine. It does
not prove that a first-time player can complete the championship without help, that six
regions remain recognisable in grayscale, or that handling, audio, co-driver delivery,
and atmosphere feel good. Those remain human judgement passes.

## Project structure

```text
index.html                  Game shell, modes, service, settings, and standings
src/content.js              Immutable six-region, six-car, weather, rival, and event catalog
src/content-expansion.js    Expansion region and car definitions
src/contracts.js             Content, tuning, result, and save validators
src/championship.js          Pure service, event, rival, standings, and classification rules
src/session.js               Save-backed practice and championship transitions
src/stage.js                 Route sampling, hazards, colliders, pace notes, and recovery
src/dynamics.js              Tyre, wheel, powertrain, load-transfer and aero model
src/vehicle.js               120 Hz vehicle physics, assists, collision, recovery, and damage
src/race.js                  Countdown, calls, splits, finish, and best-time logic
src/input.js                 Keyboard, gamepad, remapping, menu navigation, and QA input
src/world.js                 Camera, procedural scenery, car silhouettes, weather, and particles
src/renderer.js              WebGL2 renderer, sky, tone mapping, shadows, materials, diagnostics
src/audio.js                 Procedural effects and packaged co-driver playback
src/game.js                  Game-state, instrumentation, and UI orchestration
public/audio/pacenotes/      Stage-qualified MP3 and Ogg calls
scripts/                    Server, simulations, browser smoke, review, and audio tooling
tests/                      Deterministic, browser, content, and adversarial regressions
docs/                       Benchmark, review evidence, screenshots, and quality reports
```

## License

The source code and original project assets are available under the MIT License. See
[LICENSE](LICENSE).

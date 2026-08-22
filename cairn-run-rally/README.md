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

The car simulation runs at a fixed 120 Hz. It uses mass, yaw inertia, axle loads, slip
angles, combined tyre-force limits, drive layout, load transfer, braking, engine braking,
authored gears, surface response, weather grip, suspension texture, airtime, damage,
collision impulses, and bounded recovery. Compact gravel, loose gravel, grass, tarmac,
wet tarmac, snow, ice, mud, and desert gravel each carry their own friction, resistance,
roughness, particles, and audio recipe.

The route builder samples authored cumulative distance exactly. Timing, splits, nearest-road
projection, recovery, hazards, barriers, landmarks, scenery, and finish checks use the same
stage geometry. The chase camera blends body yaw, velocity direction, and road heading so
large slides retain useful road context.

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
npm test             # 123 deterministic and adversarial tests
npm run simulate     # reference-stage regression
npm run simulate:matrix  # all 36 car/stage pairings
npm run smoke        # real browser flow and failure recovery
npm run review       # shell, region, car, and responsive captures
npm run qa           # tests, matrix, and browser smoke
```

Observed evidence for the completed build includes:

- `npm test`: **123/123** passed;
- reference matrix: **36/36** viable, maximum **1 recovery**, maximum aggregate damage
  **0.122**;
- a six-event browser championship visits all six stages, classifies, resumes after a
  reload, and keeps stable audio voices between **9 and 10**;
- abandon is terminal; corrupt saves recover; no HTTP requests occur after load;
- a forced audio failure remains finite with **0 voices**, and WebGL2 absence produces a
  usable `role="alert"` explanation;
- seven menu shells at 390×844 and 768×1024 have no overflow or clipped controls;
- Apple M5 Max headless Chrome using ANGLE Metal at 1920×1080 measured GPU **0.45 ms**,
  frame p95 **9.6 ms**, renderer CPU **0.04 ms**, 17 draw calls, 10,202 triangles,
  285 particles, 10.22 MB heap, and 16.0 ms load time; the low preset also works;
- the root Almanac build and the 136-document responsive overflow/pill suite passed.

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
src/vehicle.js               120 Hz vehicle physics, collision, recovery, and damage
src/race.js                  Countdown, calls, splits, finish, and best-time logic
src/input.js                 Keyboard, gamepad, remapping, menu navigation, and QA input
src/world.js                 Camera, procedural scenery, car silhouettes, weather, and particles
src/renderer.js              WebGL2 renderer, culling, timers, and shaders
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

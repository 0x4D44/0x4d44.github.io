# Builder → Tester → Critic → Improvement Log

Each pass below was judged against running behaviour, deterministic reproduction, screenshots, or measurement—not code style alone. The governing critic question was: **what is the single largest weakness currently preventing commercial credibility?**

## World-rally expansion — 2026-08-22

**Benchmark:** the former release deliberately stopped at its first content slice. The
benchmark now names measurable six-region, six-car, mode, championship, save, rival,
control, audio, responsive, offline, and hardware targets while retaining human judgement
for fun, handling character, art direction, and listening quality.

**Critic:** the current source has no safe expansion seam. Vehicle constants, Kestrel
landmark distances, the car mesh, title text, audio note paths, and the single best-time
key are hard-coded in their consumers. Adding content directly would create identity
switches and false-green QA.

**Reproduction:** the clean baseline passed 31 deterministic tests, completed Kestrel in
290.47 seconds with the reference driver, and passed browser smoke. Source inspection then
confirmed the hard-coded boundaries in `src/vehicle.js`, `src/world.js`, `src/game.js`, and
`src/audio.js`.

**Change:** added executable versioned contracts for cars, stages, regions, weather,
championship events, rivals, tuning, results, and saves. Added the ownership and transition
design in `docs/ARCHITECTURE.md` before new content consumes those contracts.

**Regression:** the contract test was observed failing first when the module was absent,
then again when invalid one-segment routes escaped field validation. The validator now
reports both structural and field errors, and the focused contract suite passes.

**Improvement:** Kestrel's surfaces, weather, region, authored segments, notes, and current
Cairn R4 specification now live in one deeply immutable validated catalog. `buildStage()`
consumes the catalog while retaining the legacy default and exports. The route endpoint is
now the exact authored 5,405 metres instead of accumulated floating-point drift.

**Regression:** the real catalog passes contract and cross-reference validation, two builds
are structurally identical, the full 45-test suite passes, the reference run remains exactly
290.47 seconds with its prior splits/damage/contact evidence, and browser smoke passes. The
browser harness also learned multiline imports; otherwise the new real module graph produced
an unhelpful `Uncaught` failure despite the shipped ES-module page being valid.

**Persistence critic:** directly extending the old `cairn-run:best` key would mix cars,
weather, modes, and championship progress, while a failed migration could destroy the only
existing record. The new pure save boundary normalises a versioned whitelist, bounds arrays
and numeric state, rejects future versions, contains storage exceptions, verifies writes
before removing legacy data, and resets both keys explicitly. Seven red-then-green tests
cover round trips, corrupt/future values, legacy migration, non-finite input, read-only and
throwing storage, failed-write preservation, and reset.

**Vehicle-seam reproduction:** mass, inertia, axle placement, ride height, steering lock,
tyre balance, drag, brake force, suspension response, and damage bounds were constants in
`src/vehicle.js`; changing a garage stat could not change the simulation.

**Improvement:** `RallyCar(stage, profile)` now owns an immutable profile, defaults to the
catalog Cairn R4, and consumes those structural parameters. Mutable caller profiles are
deep-cloned before freezing, so a setup cannot change underneath a deterministic run.

**Regression:** a copied heavy/narrow-steering profile produces a different measured
trajectory without mutating catalog data. A 420-step origin/main-versus-profiled deterministic
trace matched bit for bit for the default car; the reference stage remains 290.47 seconds,
47/47 tests pass, and browser smoke remains green.

**Remaining boundary at this checkpoint:** the powertrain and drive layout remained the
former shared model, and the versioned save core was not yet connected to the game shell.
The completed vertical slice then added Aurora Forest, a mechanically different roster,
quick-rally and championship flow, and deeper torque/gearing/combined-grip behaviour before
the content scale-out.

## 1. Benchmark

**Critic finding:** the initial language was too easy to declare satisfied.

**Improvement:** converted steering, surface difference, slide recovery, road width, route continuity, pace lead, restart, stage duration, collision communication, and performance into testable targets. A second critic pass separated human handling judgement from autonomous-regression evidence and CPU timing from actual hardware frame-rate proof.

## 2. Smallest fun driving loop

**Builder:** the first content slice used a fixed 120 Hz simulation, authored test features,
timing, and restart.

**First physics critic:** tiny road-height transitions could be interpreted as repeated landings, causing hidden suspension deterioration.

**Improvement:** landing damage requires genuine airtime plus meaningful downward velocity.

**Second physics breaker:** handbrake force could create signed propulsion at rest; airborne input had too much authority; low-speed lateral damping was calculated but not applied back to world velocity; steering yaw had the wrong sign in reverse.

**Improvement:** corrected force signs, suppressed airborne tyre/drive authority, reconstructed damped velocity, and reversed steering yaw while backing. Added focused regressions for every reproduced fault.

## 3. Chase camera

**First critic:** direct yaw following made abrupt rotations harsh, while a fixed-height view risked terrain penetration.

**Improvement:** added damped yaw, independent horizontal/vertical smoothing, speed-dependent distance/FOV, forward look target, terrain clearance, and bounded shake.

**Second camera critic:** even a smooth camera remained too coupled to body yaw during sustained oversteer, hiding the next road direction.

**Improvement:** camera heading now blends body yaw, velocity direction, and road heading. A large-slide regression checks that the road remains legible.

## 4. Full stage design

**First critic:** a route can contain every requested feature and still resemble a generated sine wave.

**Improvement:** authored 26 named sections into recognisable sequences: launch crest, downhill chute, birch loose section, quarry braking and hairpin, moor commitment section, blind dip, right-three/left-three combination, bridge hairpin, pine climb, tightening loose right, and finish run.

**Geometry breaker:** route queries assumed a constant sample spacing and nearest-road lookup snapped to individual nodes. This could desynchronise geometry, timing, recovery, and finish placement.

**Improvement:** binary-search cumulative distance, interpolate between real neighbouring `s` values, project onto sample segments, and verify the exact endpoint.

**Stage/visual critic:** the bridge was mentioned but not memorable, and some visible walls/barriers were scenery without collision.

**Improvement:** built a physical bridge landmark with deck, rails, water, and abutments; added authored colliders for it, the stone wall, and hairpin barriers.

## 5. Co-driver

**First critic:** fixed-distance triggers were late at speed and annoyingly early in technical sections.

**Improvement:** retained authored metadata but changed delivery to speed-aware lead time, with longer warning for severe calls.

**Queue breaker:** one missed old trigger could block every later call.

**Improvement:** stale calls are discarded until the next actionable note. The bridge call now identifies the landmark and following hairpin. The card moved upward and shrank to preserve the sightline.

## 6. Rally atmosphere

**First art-direction critic:** repeated road bands and permanent tyre strips looked synthetic; the car silhouette lacked authored shape.

**Improvement:** softened road colour variation, removed rail-like strips, and strengthened body, glass, spoiler, light, fender, bumper, and wheel detail.

**Second presentation critic:** roadside depth was sparse, the bridge lacked identity, and audio depended too heavily on engine/gravel layers.

**Improvement:** deepened terrain and vegetation variation, added the bridge/water landmark, improved route-distance culling to avoid distant floating ribbons, and added restrained wind and transmission whine. Multi-angle captures cover the full shell and representative stage sequences.

## 7. Damage and collision

**First critic:** unbounded component degradation could turn one crash into a miserable run.

**Improvement:** separated engine, steering, suspension, brakes, and body; capped behavioural degradation; scaled damage by impact normal speed; and reserved recovery for broken states.

**Collision breaker:** some solid-looking scenery had no consequence.

**Improvement:** matched authored colliders to stone wall, hairpin barriers, bridge rails, and hazards.

**Damage breaker:** low-speed rubbing repeatedly inherited a minimum damage floor.

**Improvement:** separated physical contact feedback from mechanical severity. Gentle scraping remains tactile but does not steadily destroy the vehicle; real impacts still damage it.

## 8. Complete game loop

**Usability critic:** a browser game beginning with an unexplained canvas fails before driving starts.

**Improvement:** added a legible title, selected stage, distance/surface/conditions, controls, one primary action, countdown, HUD, five-part damage display, pause, persistent settings, local best, split comparison, result, and 0.78-second retry.

**Gamepad critic:** driving axes/buttons worked, but the surrounding shell was incomplete and reconnect state could be stale.

**Improvement:** A confirm/start, Start pause/resume, Y restart, D-pad navigation and settings adjustment, semantic edge actions, focus treatment, and state clearing across disconnect/reconnect and transitions.

## 9. Performance

**First critic:** object-by-object scenery draw calls would dominate before geometry did.

**Improvement:** baked road/terrain/scenery into route chunks, culled by route distance and camera range, used one dynamic car set and one particle draw, bounded device pixel ratio by quality, and reused typed geometry.

**Instrumentation critic:** the old `cpuFrameMs` label represented renderer CPU only, not total frame cost.

**Improvement:** separately record renderer CPU, fixed-step physics average, GPU timer, frame p95, load time, heap, particle count, draw calls, triangles, and backing resolution. GPU timer queries are bounded and dynamic particle data is reused in place.

The final hardware sample superseded the earlier virtual-display measurements. Headless
Chrome on an Apple M5 Max with ANGLE Metal at 1920×1080 recorded GPU **0.45 ms**, renderer
CPU **0.04 ms**, frame p95 **9.6 ms**, 17 draw calls, 10,202 triangles, 285 particles,
10.22 MB heap, and 16.0 ms load time. The low quality preset also passed its browser check.

## 10. Usability breaker

The real browser shell was exercised without invoking internal start methods for the initial interaction:

- title appears first with a discoverable start action;
- virtual gamepad A starts the countdown;
- Start pauses and resumes;
- disconnect/reconnect clears latched state;
- trusted R restarts into a sub-second countdown;
- high-DPI resize produces a 1350×1350 backing canvas;
- low quality reduces it to 900×900;
- no captured runtime errors remain.

## 11. Adversarial bug hunt

The deterministic and browser breaker suite now covers:

- 90 seconds of rapidly varying controls without NaN or runaway damage;
- handbrake at rest;
- airborne throttle/steering;
- low-speed lateral skating;
- reverse steering and reverse checkpoint crossing;
- safe-point advancement while reversing;
- stranded recovery;
- high-speed collision and gentle repeated scrape;
- authored walls and bridge rails;
- checkpoint skipping and finish-trigger confusion;
- stale pace-note queues;
- camera context during a large slide;
- exact route endpoint and continuous projection;
- keyboard/gamepad transitions, reconnect, resize, quality fallback, and runtime error capture.

## 12. Commercial-quality critic at the first content checkpoint

The final ranked defects changed as earlier issues were fixed. The last high-impact sequence was:

1. route-distance/projection drift;
2. physically incorrect handbrake/airborne authority;
3. camera losing the road during slides;
4. visible barriers lacking collision;
5. cumulative scrape damage;
6. stale pace-note queue;
7. incomplete gamepad shell;
8. misleading performance labels;
9. absent bridge landmark and weak presentation depth.

Each became a code change plus regression or repeatable screenshot/browser evidence. The suite grew from 17 to **28 tests** rather than merely changing implementation and declaring success.

## Final expansion verification — 2026-08-22

**Builder:** completed the six-region, six-car world-rally build with shared contracts,
catalog-driven physics/world/audio, quick rally, practice, six-event championship, saves,
service, remapping, assists, and responsive shells.

**Tester:** `npm test` passed **123/123**. The deterministic matrix passed **36/36**
car/stage pairings with maximum **1 recovery** and maximum aggregate damage **0.122**.
The browser championship visited all six stages, resumed after reload, classified correctly,
kept 9–10 audio voices, and preserved terminal abandon semantics. Corrupt saves recovered;
runtime request interception recorded zero HTTP requests.

**Failure checks:** forced audio unavailability stayed finite with zero voices. WebGL2 absence
showed a `role="alert"` explanation. Seven shells at 390×844 and 768×1024 had no overflow
or clipped controls. Persistent keyboard/gamepad remaps and gamepad start, pause, and
disconnect/reconnect passed. Tyre and bounded setup choices shared the 60-minute service
planner with repair and produced invalid-choice errors without mutating state.

**Hardware:** headless Chrome on Apple M5 Max ANGLE Metal at 1920×1080 measured GPU
**0.45 ms**, frame p95 **9.6 ms**, renderer CPU **0.04 ms**, 17 draw calls, 10,202
triangles, 285 particles, 10.22 MB heap, and 16.0 ms load. The low preset passed.

**Review boundary:** `npm run review` generated shell, region, car, and responsive captures
under ignored `artifacts/review/`; they are evidence, not committed product assets.
The first review exposed a floating terrain ribbon before Rift Valley's cattle-track
hairpin. Curvature-aware terrain width and route look-ahead removed it; all 21 captures
were regenerated and inspected. The root build and 136-document responsive suite passed.
The remaining judgement is human: a first-time complete championship, grayscale region
recognition, and the taste of handling, audio, co-driver delivery, and atmosphere.

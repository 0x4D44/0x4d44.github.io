# Builder → Tester → Critic → Improvement Log

Each pass below was judged against running behaviour, deterministic reproduction, screenshots, or measurement—not code style alone. The governing critic question was: **what is the single largest weakness currently preventing commercial credibility?**

## World-rally expansion — 2026-08-22

**Benchmark:** the former release deliberately stopped at one car and one stage. The new
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

**Remaining boundary:** the contracts are not yet wired into the current Kestrel/car path.
The next vertical slice must data-drive the existing car and region, then add one materially
different car and Aurora Forest through quick-rally and championship flow before scaling.

## 1. Benchmark

**Critic finding:** the initial language was too easy to declare satisfied.

**Improvement:** converted steering, surface difference, slide recovery, road width, route continuity, pace lead, restart, stage duration, collision communication, and performance into testable targets. A second critic pass separated human handling judgement from autonomous-regression evidence and CPU timing from actual hardware frame-rate proof.

## 2. Smallest fun driving loop

**Builder:** one car, fixed 120 Hz simulation, authored test features, timing, and restart.

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

One final 1280×720 SwiftShader sample recorded:

- render CPU average: **0.82 ms**;
- physics average: **0.38 ms**;
- draw calls: **16**;
- triangles: **7,254**;
- particles: **318**;
- JavaScript heap reported by CDP: **2.06 MB**;
- load time: **392.4 ms**;
- captured runtime errors: **0**.

SwiftShader itself reported approximately 20 presented fps, 64.35 ms GPU time, and 50 ms frame p95. Those figures do not establish representative laptop performance.

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

## 12. Final commercial-quality critic

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

Remaining criticism is now mainly representative hardware validation, independent first-time human handling judgement, and optional content/art expansion. See `ADVERSARIAL_REVIEW.md` and `QUALITY_REPORT.md` for the evidence and boundaries.

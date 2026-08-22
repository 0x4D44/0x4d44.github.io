# Internal Quality Benchmark

This benchmark turns “feels good” into observable consequences without pretending that automated checks can replace handling judgement.

## Core experience

| Area | Target | Verification |
|---|---|---|
| Input response | Steering begins changing in the same rendered frame and simulation tick as input | Fixed 120 Hz input/physics path; browser smoke exercises trusted keyboard and virtual standard gamepad input |
| Steering | Progressive near centre; maximum angle falls with speed; direction reverses correctly while backing; no instant heading changes | Physics regressions and bounded steering model |
| Grip | Compact dirt is predictable, loose gravel retains materially more lateral slip, and grass has strong scrub | Comparative surface test |
| Oversteer | Handbrake and load transfer can rotate the rear; opposite lock reduces yaw without stopping the car | Rotation/countersteer test |
| Braking | Braking transfers load forward, damaged brakes lengthen stopping performance, and handbrake cannot create propulsion from rest | Physics and damage regressions |
| Airborne behaviour | Crests can unload the car; tyre, steering, and engine forces become negligible until contact returns | Airborne-authority regression |
| Suspension | Only genuine airtime plus meaningful landing velocity creates landing damage | Full-stage and landing thresholds |
| Low-speed behaviour | Residual lateral velocity settles rather than producing indefinite skating | Low-speed damping regression |
| Recovery | The safe recovery point advances only during genuine forward progress; a stranded off-road car recovers to the route | Recovery-point and stranded-state tests |
| Sense of speed | Camera distance/FOV, near-road objects, dust, wind, transmission, engine pitch, and road motion reinforce speed | Camera test, screenshots, browser run |
| Road geometry | Normally 6.6–7.6 m wide; continuous samples reach the exact endpoint and nearest-road queries project between samples | Authored metadata and continuous-sampling tests |
| Collision communication | Visible walls, hairpin barriers, bridge rails, and hazards have matching collision consequence | Authored-collider regression |
| Stage rhythm | Long commitment stretches alternate with technical sequences; calls are not densely spammed | Route and note-density tests |
| Pace-note timing | Normal calls target about 4.35 seconds of lead; severe calls about 5.6 seconds; missing one trigger cannot block later notes | Predictive-call and stale-queue tests |
| Camera | Smooth rotation; road context retained during large slides; speed-aware framing; terrain floor; bounded shake | Camera regressions and multi-angle capture |
| Visual density | Open moor sections provide relief; forests, hazards, posts, spectators, walls, gates, and bridge landmarks increase density near decisions | Screenshot critic pass and stage inspection |
| Game loop | A new player sees one primary start action, controls, countdown, HUD, pause, result, settings, and retry | Browser shell and gamepad smoke checks |
| Restart | From R/Y/Retry to control in less than 2 seconds | Measured 0.78-second retry countdown |
| Stage duration | 205–310 seconds for the deterministic reference driver; human time expected to vary | Reference run: 290.47 seconds |
| Robustness | Long adversarial input remains finite; checkpoint skipping and reverse crossings cannot finish the stage | Breaker regressions |
| Performance | Stable 60 fps at 1920×1080 on a representative recent laptop; no normal CPU/GPU spikes; graceful low-quality fallback | Separate render CPU, physics, GPU, frame-p95, load, heap, draw-call, triangle, and resolution instrumentation; hardware caveat in quality report |

## Benchmark critic attack

The first benchmark draft was rejected because “responsive”, “predictable”, “narrow”, and “early enough” were too easy to self-certify. The revision added fixed-step timing, explicit width and duration ranges, comparative surface behaviour, countersteer and reverse-steering criteria, airborne-force limits, continuous route sampling, severity-dependent co-driver lead windows, a stale-note failure case, collision/visual agreement, a sub-two-second retry threshold, and separately named performance metrics.

A second attack rejected two misleading forms of evidence:

1. A scripted autonomous finish is useful for regression but does not prove that the handling is enjoyable to a person.
2. CPU render time under a software-rendered virtual display does not prove 60 fps on a laptop GPU.

The quality report therefore states both boundaries explicitly rather than converting incomplete evidence into a release claim.

## World-rally expansion targets

The one-stage benchmark remains the regression floor. The world-rally build adds these
observable release targets without treating a checklist as proof of taste.

| Area | Target | Verification |
|---|---|---|
| Regions | Six primary regions, each with one completable 4.5–7.5 km authored route, at least three signature sequences, one unique landmark family, and a distinct surface/weather strategy | Catalog validation, route-feature fingerprints, reference-driver completion matrix, and six labelled screenshot sets |
| Region identity | No two regions share the same ordered surface mix, landmark set, elevation/curvature histogram, or scenery silhouette set | Content validator plus geometry/statistical comparison; silent grayscale captures remain a human judgement gate |
| Cars | Six fictional cars covering FWD, RWD, and AWD, with complete mechanical data and no identical parameter vectors | Catalog validation and garage/browser selection checks |
| Mechanical difference | Every car differs from the roster median in at least two measured outputs: acceleration, coast-down, steady-state yaw, lift-off rotation, rough-road wheel load, braking distance, or damage tolerance | Deterministic differential telemetry under identical controls and conditions |
| Pairing reachability | Every declared car/stage/weather pairing finishes under the deterministic reference driver without NaN, false finish, stuck recovery, runaway energy, or unbounded damage | Full matrix batch with per-pair result records and explicit exclusions only for a reproduced, defensible reason |
| Modes | Quick Rally, Practice/Time Trial, and a six-event championship reach a stage from the title within three deliberate actions | Real browser hit-testing with keyboard and virtual gamepad |
| Championship | Six ordered events preserve stage/overall standings, points, bounded damage, tyre/setup choice, service-time decisions, penalties, retirements, and final classification | Pure rules tests, browser flow, save/resume after every transition, and duplicate-result attack tests |
| Rivals | Seeded rival times are deterministic for the same inputs, monotonic with difficulty within tolerance, and respond to surface, weather, car class, and damage without rubber-banding | Seed repeat tests and parameter sweeps |
| Save safety | One versioned save owns settings, bindings, bests, and championship state; legacy `cairn-run:best` migrates once; corrupt or future data recovers without a crash | Migration fixtures, round trips, interrupted-write/corrupt-storage browser checks, and safe reset |
| Controls | Existing A/Z, comma/period, corrected arrows, and gamepad stay correct; all driving actions can be remapped; disconnect/reconnect cannot latch input | Input-unit tests and trusted browser/gamepad checks |
| Assists | Automatic gears, stability help, braking help, and pace-note display are explicit and produce measured bounded effects without secretly improving rival or scoring rules | Differential simulation tests and settings/browser checks |
| Surfaces and weather | Tarmac, compact gravel, loose gravel, grass, mud/water, and any declared snow/ice have distinct friction, resistance, roughness, particles, and audio; weather changes visibility and grip rather than colour alone | Surface sweeps, renderer/audio state checks, and wet/dry differential runs |
| Co-driver | Every stage note has ordered metadata, a local MP3 and Ogg asset, captions, predictive delivery, stale-call recovery, and no queue overlap at reference speeds | Content/audio tests plus enabled-audio browser runs |
| Sound | Each car exposes a distinct engine/load recipe with click-free bounded voices; surface, tyre, suspension, landing, collision, wind, weather, crowd, and environment cues consume real simulation state | Audio graph/state tests, voice-count instrumentation, and a listening critic boundary |
| Responsive shell | Every mode and unusual state remains usable at 390×844, 768×1024, and desktop 16:9 with no sideways scroll, hidden focus, or Almanac-pill collision | Cairn browser matrix plus root responsive suite |
| Offline/static | No runtime network request is required after local files load; every referenced asset exists and has provenance; WebGL2/audio failures show usable explanations | Request interception, asset manifest validation, and forced-capability failures |
| Performance | Default preset targets 60 fps at 1920×1080 on an integrated laptop GPU, frame p95 ≤20 ms, bounded heap/audio voices over a championship, and a responsive low preset | In-game QA telemetry and an honestly labelled representative hardware run |

## Human judgement boundaries

Automation can prove stability, reachability, consistency, and measurable difference. It
cannot prove that a slide is satisfying, a car has character, scenery is memorable, the
co-driver is pleasant, or the late-1990s atmosphere feels cohesive. Final release evidence
therefore keeps these as explicit first-time-driver, handling, art-direction, and listening
passes. A deterministic finish or a passing screenshot scan is never reported as proof of
fun or commercial polish.

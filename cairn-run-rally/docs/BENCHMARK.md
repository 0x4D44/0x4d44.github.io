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

The benchmark deliberately excludes photorealism, content volume, a career mode, or elaborate vehicle selection. Those additions would not prove that the empty-road driving loop is entertaining.

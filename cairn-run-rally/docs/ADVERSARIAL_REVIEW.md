# Multi-Angle Adversarial Review

Version 1.1 was reviewed through separate specialist tracks so that the implementation pass was not also its only judge. Each track began from a hostile question—what most clearly reveals a hobby project?—and required either running behaviour, a screenshot, a measurement, or a deterministic reproduction before a change was accepted.

These were separated review roles and criteria, not a claim that unrelated human playtesters or external model instances were available.

## Ranked findings and resolutions

| Rank | Specialist track | Adversarial finding | Resolution | Regression or evidence |
|---:|---|---|---|---|
| 1 | Route/stage geometry | Sampling assumed perfectly uniform spacing even though authored samples carry cumulative distance. Finish, nearest-road, recovery, and placement queries could drift or snap between roughly four-metre nodes. | Added cumulative-distance binary search, exact interpolation by neighbouring `s` values, and continuous segment projection. | Exact-endpoint and between-sample projection test. |
| 2 | Physics breaker | The handbrake force used a signed value that could act like propulsion from rest. Tyre/drive authority also remained too strong in the air. | Braking now opposes actual motion; airborne tyre, steering, drive, brake, and rolling forces are near-zero until contact. | Handbrake-at-rest and airborne-authority tests. |
| 3 | Camera critic | Following body yaw too directly made a recoverable slide turn the view away from the road. | Camera heading now blends body yaw, velocity direction, and authored road heading with independent damping and terrain clearance. | Large-slide road-context and general chase-camera tests. |
| 4 | Gameplay/stage breaker | Stone walls, hairpin barriers, and bridge rails looked solid but could be driven through because they were decorative only. | Added authored colliders matching the visible landmark geometry and included them in vehicle collision checks. | Wall and bridge-rail collision test. |
| 5 | Damage critic | Repeated slow contact inherited a minimum damage floor, so rubbing a wall could steadily destroy the car. | Separated contact feedback from mechanical severity and removed minimum damage below a meaningful normal-impact threshold. | Gentle-scrape no-accumulation test; high-speed damage test retained. |
| 6 | Co-driver critic | Missing an old pace-note trigger could leave the queue permanently stuck, preventing every later call. | Stale calls are skipped until the next actionable authored note. | Stale-trigger queue regression plus 18/18 reference-run calls. |
| 7 | Vehicle dynamics critic | A low-speed damping calculation did not write the damped lateral component back to world velocity; the car could skate sideways. Reverse steering also used forward yaw sign. | Reconstructed world velocity after damping and inverted steering yaw correctly while backing. | Low-speed settling and reverse-steering tests. |
| 8 | Recovery breaker | Reversing could advance the “last safe” point, and a stationary car well off the road did not always request recovery. | Safe position advances only with real forward progress; stranded-state detection uses route distance, motion, and elapsed state. | Recovery-point and stranded-off-road tests. |
| 9 | Input/usability critic | Gamepad support existed for driving but did not convincingly cover the shell. Disconnect/reconnect could preserve stale edge state. | Added semantic pad edges, A confirm/start, Start pause/resume, Y restart, D-pad navigation/settings, and transition/disconnect clearing. | Real Chromium virtual-gamepad start, pause, resume, disconnect, reconnect, and keyboard restart. |
| 10 | Presentation critic | The pace card occupied too much of the road sightline; the bridge was described but lacked a memorable physical landmark; wheel/body treatment and ambient audio were thin. | Moved and reduced the callout, built a bridge with deck/rails/water/abutments, improved car/wheel geometry and terrain depth, and added restrained wind/transmission layers. | Multi-angle screenshot capture and local audio/browser run. |
| 11 | Performance critic | The original QA field labelled renderer CPU work as total frame cost, obscuring physics, presentation, and GPU bottlenecks. Dynamic buffers also created avoidable churn. | Added separate render CPU, physics, GPU timer, frame p95, load, heap, particles, draw calls, triangles, and resolution metrics; reused particle buffers and bounded timer queries; tightened route culling. | Browser QA payload and low-quality resolution fallback. |
| 12 | Commercial-quality critic | The implementation could pass subsystem tests while still lacking proof that all visible shells and unusual states worked together. | Expanded capture and browser flows to title, settings, countdown, driving, pause, result, high DPI, quality change, gamepad reconnection, and immediate restart. | `npm run review`, `npm run smoke`, and clean-extraction `npm run qa`. |

## Specialist review notes

### Physics breaker

The breaker attempted stationary handbrake input, airborne throttle/steer, long rapidly varying controls, reversing, lateral settling, high-speed impacts, repeated gentle contact, leaving the road, and stranded recovery. The important outcome was not that the car never misbehaved, but that every reproduced systemic fault became a narrow regression test rather than a broad refactor.

The deterministic reference driver still makes three contacts and finishes with 3.7% aggregate damage. That result is intentionally reported as a completed stress/reference run, not a clean handling endorsement.

### Camera and stage critic

The route is now sampled continuously at authored cumulative distances. The chase view is less tightly coupled to the car body during a slide, and the bridge sequence now has a distinctive, readable physical landmark. Multi-angle captures were reviewed at launch, loose-gravel tightening, quarry hairpin, moor crest, left/right sequence, bridge hairpin, pine loose section, finish run, pause, results, and high-DPI title layout.

### Co-driver critic

All 18 calls remain authored metadata with local MP3/Ogg speech. The call at the bridge was rewritten to identify the landmark and the following hairpin. The visual card moved upward and shrank so it remains glanceable without covering the braking line. Queue logic now recovers from a missed old trigger instead of silencing the remainder of the stage.

### Input and rendering breaker

The browser smoke uses a virtual standard gamepad against the actual game shell. It verifies A start, Start pause/resume, disconnect/reconnect state clearing, trusted keyboard restart, 1.5× high-DPI resize, low-quality backing-resolution reduction, and an empty runtime-error list.

The capture run inspects unusual aspect ratio and high DPI as well as normal 1280×720 views. It is visual evidence, not a pixel-perfect golden-image test.

### Performance critic

The latest packaging sample at 1280×720 recorded 0.82 ms average render CPU, 0.38 ms physics, 16 draw calls, 7,254 triangles, 318 particles, 2.06 MB reported JavaScript heap, and 392.4 ms load time. Those values are useful for regression and architecture sanity.

The same environment used SwiftShader under Xvfb and reported 64.35 ms GPU time, 50 ms frame p95, and roughly 20 presented fps. That is a software-renderer limitation, not evidence of representative laptop GPU performance. No claim of independently verified 1080p/60 is made.

## Remaining release risks

The adversarial pass no longer exposes an obvious missing core subsystem, but two material validation gaps remain:

1. **Independent first-time human playtest.** Automated driving cannot determine whether the steering curve, slide recovery, pace-note voice, or stage learning curve is pleasurable.
2. **Representative hardware matrix.** The 1920×1080/60 target still needs measurement on at least one integrated laptop GPU and more than one production browser.

Those are validation tasks rather than concealed implementation defects. Content expansion, more cars, multiple stages, career structure, and higher-fidelity art are optional scope changes, not evidence that the current five-minute loop is incomplete.

# Cairn Run Rally architecture

Cairn Run Rally is a data-driven six-region, six-car world-rally game. Pure simulation and
competition rules run in Node; the browser consumes their immutable outputs.

## Authoritative layers

- `src/contracts.js` validates car, region, stage, weather, rival, championship, tuning,
  result, and save shapes.
- `src/content.js` combines the immutable Kestrel/Aurora slice with the four expansion
  regions and cars. `src/content-expansion.js` contains the expansion definitions.
- `src/stage.js` converts authored cumulative-distance routes into continuous samples,
  hazards, barriers, pace notes, landmarks, and recovery data.
- `src/vehicle.js` owns deterministic 120 Hz vehicle state. Profiles supply torque,
  gearing, mass, inertia, suspension, tyre, drive-layout, silhouette, and damage data.
- `src/dynamics.js` owns the reusable powertrain, axle-load, drive-share, and combined-tyre
  calculations consumed by every car.
- `src/race.js` owns one timed stage: countdown, controls, calls, splits, finish, and best
  result. It does not know the DOM, renderer, audio, saves, or championship progression.
- `src/championship.js` owns pure six-event progression: seeded rivals, standings, points,
  penalties, retirements, carry-over damage, 60-minute service, tyre choice, bounded setup,
  and final classification.
- `src/session.js` is the save-backed boundary for practice, championship transitions,
  active runs, resume, bests, and abandon.
- `src/save.js` is the only local-storage boundary. It normalises a versioned whitelist,
  migrates the legacy best once, rejects future or corrupt data, and preserves valid data
  when storage fails.
- `src/game.js` coordinates title, selection, service, settings, pause, results, standings,
  and the active `StageRun`. It delegates state changes to pure modules.
- `src/world.js`, `src/renderer.js`, and `src/audio.js` are consumers. Region and car
  identity arrives through palettes, scenery kits, weather recipes, silhouettes, telemetry,
  and local audio assets rather than identity-specific branches.

## Run flow

The title offers Quick Rally, Practice/Time Trial, World Championship, and resume. Selection
chooses a car and difficulty; practice also chooses a stage. A championship creates a frozen
service-phase state with a signed seed and event index zero.

The service screen previews repair, tyre, and setup costs against the event's 60-minute
budget. Applying a pure plan produces a frozen ready state. Starting creates a run ID and
passes copied damage and tuning into the next `RallyCar`. A result is submitted exactly once;
the state either opens the next service phase or becomes classified. Abandon is terminal.

Every transition is validated before it is persisted. Reload resumes service, ready, or live
driving state. Duplicate, stale, reordered, or corrupt transitions cannot change standings.

## Data and compatibility

`buildStage()` and `new RallyCar(stage)` retain Kestrel Ridge and Cairn R4 defaults for
callers that do not select content. New callers use catalog IDs. All six routes share the
same builders, physics, world, audio, save, and championship seams.

The fixed step remains 1/120 second. Route queries use authored cumulative distance, so
timing, nearest-road projection, recovery, colliders, scenery, and finish checks agree. The
catalog and all derived state are deeply frozen at their boundaries.

Invalid content IDs, malformed plans, unsupported tyres, out-of-range setup values, missing
local assets, future saves, WebGL2 absence, and unavailable audio stop at clear boundaries.
Audio fallback remains finite with zero active voices; WebGL2 fallback exposes a visible
`role="alert"` explanation.

The accepted championship state-machine design and proof obligations live in
`wrk_docs/2026.08.22 - HLD - Cairn Run championship state machine.md`.

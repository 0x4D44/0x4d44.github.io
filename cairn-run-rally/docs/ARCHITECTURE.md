# Cairn Run Rally architecture

The world-rally build keeps the current fixed-step simulation, authored route builder,
WebGL2 renderer, Web Audio layer, input manager, and stage-run rules. New content enters
through explicit data contracts; no mode, renderer, or car implementation may switch on a
specific identity.

## Authoritative state

- `src/contracts.js` validates the stable shapes for cars, regions, stages, weather,
  rivals, championship events, tuning, results, and versioned saves.
- `src/content.js` will own immutable authored catalogs. Builders may derive sampled
  geometry or render meshes, but they must not change catalog data.
- `src/vehicle.js` owns deterministic vehicle state. A car profile supplies mechanical
  parameters; rendering and audio consume its public telemetry.
- `src/stage.js` turns a stage definition into continuous route samples, colliders, pace
  notes, and recovery data. Region scenery metadata travels on the built stage.
- `src/race.js` owns one timed stage. It remains independent of the DOM, renderer, audio,
  saves, and championship progression.
- `src/championship.js` will own event order, seeded rivals, standings, penalties, service,
  carry-over damage, and final classification as pure serialisable state.
- `src/save.js` will be the only local-storage boundary. It will migrate the legacy
  `cairn-run:best` record, validate reads, recover from corrupt data, and write the versioned
  save atomically from the application's point of view.
- `src/game.js` will orchestrate modes and screens. It may ask pure systems to transition,
  but it must not duplicate their rules.
- `src/world.js` and `src/audio.js` are consumers. Region/car identity arrives as palette,
  silhouette, scenery, weather, and sound recipes rather than hard-coded IDs.

## Run flow

The title selects `quick`, `practice`, or `championship`, then a car and stage/event.
Starting constructs a fresh `StageRun`, sampled stage, vehicle, world, camera, and audio
consumer from validated data. A stage result is immutable. Quick/practice stores a
namespaced best; championship submits the result once, applies service/setup decisions,
and advances or produces a final classification. Pause, retry, and abandon have explicit
transitions and never mutate standings implicitly.

## Compatibility and failure rules

`buildStage()` and `new RallyCar(stage)` keep Kestrel Ridge and the current Cairn R4 as
defaults while callers migrate. Existing controls and shell element IDs remain valid.
Unknown content IDs, invalid parameters, missing assets, future save versions, WebGL2
absence, and audio failure must stop at a clear boundary rather than producing partial
simulation state. The fixed step remains 1/120 second, and pure rules remain runnable in
Node for deterministic batches.

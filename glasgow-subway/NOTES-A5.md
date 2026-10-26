# NOTES-A5 (simulator)

Entry: `js/sim/index.js` -> `startSim(ctx)` / `simAvailable()`. ctx.mode: `drive` | `ride` | `walk` (alias `explore`); no mode -> start menu.
Harness: `tools/test_sim.html` (own importmap; `?mode=&station=&line=&diff=`), e2e: `node tools/test_sim.mjs`, unit: `node --test js/sim/sim.test.mjs`.

Architecture (pure logic is DOM/THREE free and unit tested): `track.js` (resample to 2 m, straighten + flatten at platforms, grade/curvature, speed + braking-curve profile),
`dynamics.js` (traction/brake lag, resistance, gradient), `ato.js`, `rules.js`, `service.js` (doors, dwell, signal, SPAD, ATP, dead-man, scoring, timetable, pax).
Visual: `trainview.js` (articulated cars from train.glb, generic over car/door count), `tunnelview.js` (instanced tunnel_segment.glb rings in a +-125 m window),
`stationview.js` (procedural station in local frame: platform, vault, ramp with escalators/stairs, concourse, exit), `street.js`, `people.js`, `walker.js`, `hud.js`, `audio.js`, `tms.js`.

Decisions
- Stop mark `s` = cab front; platform is centred on the train centre at the mark (A1 `sCentre` is ignored on purpose so the 3D train sits centred; ~1 m difference).
- Train length/doors/cab eye are read from train.glb (4 cars, 39.3 m); physics from `rollingStock.current` (accel, decel, emergency, max speed, tare mass).
- Platform side per line comes from the platform centre vs track point (island: one side per line); station geometry is built straightened (track is straightened +-~45 m around each stop).
- Station interiors are procedural (stations differ by tile palette, platform type, facts panels); station_kit/people GLBs not yet used (procedural benches/people).
- Other line's train in island stations is not simulated (other bore is a dark stub).
- Street scene uses data/city chunks if manifest exists, else procedural tenements + entrance_kiosk.glb.
- Keys: W/S lever, X emergency, Space vigilance, O/P doors, ,/. side, A ATO, R reverse, E interact, N alight next, H help, M mute, Esc menu, L score log.

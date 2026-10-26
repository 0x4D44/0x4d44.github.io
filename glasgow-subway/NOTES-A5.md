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

Reviewer 1 fixes: full-height gangway apertures (AP_TOP 2.38) so a standing eye sees/walks end to end; cab windscreen enlarged (opaque header bar + desk z-fight removed); island vault end pier has a ramp opening (lintel only); far tunnel tube textured with ring_concrete; dispose now frees materials/textures (was leaking ~27 textures per start/dispose); blur clears stuck keys; low tier trims near tunnel rings. Regression tests in tools/test_sim.mjs (gangway sightline, ramp not walled).


## Round 5 (per-station halls, narrow train)
- `hall.js`: loads `models/station_<id>.glb` (+ `_entrance.glb`) on demand from `stations_index.json`, evicts after 5 (never one in use). `layoutFor(info, line, S)` picks hall orientation per (station, line): outer circle runs on the hall's +x track, inner on -x; the 180 degree flip is chosen so the adjacent platform is on the side the data wants (else the hall's side wins and `svc.sideOf` is overridden). Local frame = own track at x=0, z_l = -u, train centre on z=0 (Track uses `ignoreCentre`).
- `stationview.js` hall mode: hall clone placed in that frame, walker zones from the json platforms, furniture obstacles from occupancy cells of `hall_furniture`, point lights from `light_k_j` empties, `psd` orange leaves hidden while doors are open (Govan/Partick/Ibrox). The hall has no stairs, so the stair/escalator ramp, concourse and street stair are a separate procedural "access complex" 34 m to the side: E at an `exit_marker` fades to the foot of the ramp, the door at its bottom fades back. Hall mode falls back to the older vault/procedural room if a GLB fails to load.
- Tunnel rings are hidden over z=+-30 (hall incl. 3 m bore stubs). Far tube bore axis y=1.225 (tunnel_params.json).
- Train: `train_walkable.json` headroom table drives `Walker.headroomFn` (head cannot enter the arch, strafing stops at 1.5 m headroom), aisle +-0.5 centre (benches solid), doors from the GLB nodes.
- Street scene uses the per-station entrance GLB; orientation chosen by ray-probing the city chunks.
- Test additions: swept train volume over all 15 halls x 2 circles (real train model, ray-cast against every hall mesh incl. instanced), curve sweep against the lining, headroom/aisle walk, whole-train walk, portal reachability for every hall.

# Southern Cross Rally

An original, standalone browser rally game: two cars, six New Zealand-inspired
stages, and a complete time-trial / six-stage rally loop. It uses a small custom
WebGL2 renderer rather than Three.js. All geometry, surfaces, liveries, scenery
and engine audio are generated locally; there are no CDN imports, external
assets, accounts, analytics, runtime packages or build step.

This is a playable first release, not a claim of feature-for-feature or visual
parity with Colin McRae Rally. The graphics are stylised procedural 3D. Routes
are original fictional geometry inspired by New Zealand locations, not surveyed
reproductions of official rally stages. Cars and liveries are fictional.

## Play locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/southern-cross-rally/`. A current browser with WebGL2
and hardware acceleration is recommended. Do not open `index.html` using
`file://`: native ES modules require HTTP. On servers with incorrect `.mjs`
MIME mappings, serve these files as `text/javascript`.

The page is directly deployable to GitHub Pages under `/southern-cross-rally/`.
It includes the shared `/almanac-back.js` navigation. The game itself makes no
external network requests and can run from a local server without Internet.
There is no service worker or installable PWA/offline-reload guarantee.

Start with **Kestrel R4**, automatic transmission, stability assistance and
**Single stage / time trial**. Brake before corners and use short steering
inputs on the keyboard. In **Southern Cross / 6-stage rally**, the event starts
at SS01 and retains the chosen car and damage between stages.

## Cars and roads

| Car | Drivetrain | Power | Mass | Character |
| --- | --- | --- | --- | --- |
| Kestrel R4 | Turbo AWD | 224 kW / approximately 300 bhp | 1,280 kg | Stable and forgiving |
| Tūī Clubman | Naturally aspirated RWD | 190 kW / approximately 255 bhp | 1,050 kg | Lighter, more throttle-sensitive rear grip |

| Stage | Route length to finish control | Setting |
| --- | --- | --- |
| SS01 Whaanga Coast | 2.406 km | Tasman coast, golden hour |
| SS02 Te Akau Run | 2.486 km | Waikato farmland, clear morning |
| SS03 Maramarua Pines | 2.326 km | Narrow forest, low cloud |
| SS04 Waipu Gorge | 2.596 km | Northland grades and rock faces |
| SS05 Raglan Ridge | 2.976 km | Open ridgeline, late afternoon |
| SS06 Riverhead Twilight | 2.936 km | Wet forest, rain at dusk |

Total authored route length to finish controls: **15.726 km**. Cars spawn eight
metres along each route. Every stage is available immediately in time trial.

## Implemented

- Fixed 120 Hz simulation: front/rear slip forces, different grip for the two
  drivetrains, steering smoothing, handbrake rotation, slope gravity, vertical
  spring/damper response, crests, off-road drag and tree/rock collisions.
- Six-speed automatic or manual transmission with actual gear-dependent drive
  force, soft rev limiting, braking and deliberate hold-to-reverse.
- Countdown, millisecond timing, three intermediate controls and a finish gate.
  Controls must be crossed in order and within their finite width; going around
  a control cannot produce a finish. Recovery costs five seconds and cannot
  advance beyond an unearned control.
- Damage reduces engine performance and carries through the rally. Service after
  stages two and four offers full repair for twenty seconds or no repair.
- Stage medals against authored target times, split deltas, rally totals,
  personal bests, a best-run ghost and playback of the most recent stage.
- Visual pace notes and optional locally installed browser speech voices.
  When no local voice is available, the visual notes still work. Synthesised
  Web Audio engine/load, road noise and impact/countdown cues.
- Original car bodies, glass, wings, number plates, steered/spinning wheels;
  instanced vegetation and rocks; roadside fences, posts, control gantries and
  marshals. Procedural gravel, wet patches, animated sea/sky, PCF shadows,
  distance fog, dust/spray particles, tyre marks, rain streaks and post effects.
- Chase, high-chase and bonnet-position cameras; three graphics quality presets.
- Keyboard, touch buttons and standard-mapped gamepad controls. Pause on focus
  loss; modal keyboard focus handling; reduced-motion CSS and responsive menus.
- Local best times isolated by stage, car and assistance setting. Corrupt or
  unavailable storage is handled without preventing a session; failed saves
  display a warning instead of claiming a new stored best.

## Controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Accelerate | W / Up | RT |
| Brake; hold at rest to reverse | S / Down | LT |
| Steer | A/D / Left/Right | Left stick |
| Handbrake | Space | A |
| Shift down/up in manual | Q/E | LB/RB |
| Camera | C | Y |
| Recover (+5 seconds) | R | B |
| Pause/resume | Escape | Start |
| Mute | M | Setup menu |

Touch devices show pedals and steering buttons. Landscape gives more usable
road visibility. Corner grades run from 1 (tightest) to 5 (fast).

## Source map

`core.mjs` contains deterministic road generation, spatial queries, vehicle
simulation, controls, timing, records and ghost interpolation. It has no DOM or
renderer dependency; distances and forces use SI units.

`render.mjs` contains WebGL2 shaders, procedural meshes, GPU resource management,
instance culling, cameras, shadows and effects. Stage-specific GPU resources are
released on a stage change. Dust and tyre-mark buffers have bounded lifetimes.

`game.mjs` owns the fixed-timestep loop, menu/event state machine, input, audio,
HUD and persistence. `index.html` and `style.css` are the static shell. No bundler
or minified output is required. `window.rallyTelemetry` is read-only diagnostic
telemetry; mutating test controls are exposed only with an explicit `?test` URL.

## Tests and actual validation

Node 20 or newer, no package installation needed:

```sh
cd southern-cross-rally
npm test
```

**34 tests passed.** These include both cars driving all six routes at 120 Hz,
with all four controls reached, zero recovery penalties and zero collision
damage under the conservative automated driver. Other tests cover determinism,
road continuity, gear forces, reverse, handbrake, collisions, checkpoint bypass,
recovery anti-skip, persistence failures and ghost angle interpolation.

Optional real-browser tests require Python and Playwright:

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser.py --url http://127.0.0.1:8000/southern-cross-rally/
```

The committed browser harness also supports `--chromium /path/to/chromium`,
`--screenshots ./screenshots`, and `--embedded` for a network-blocked runner.
Embedded mode loads the same source as Blob modules on `about:blank`; its only
source substitution enables test hooks. It uses real WebGL2 shaders, not a
renderer mock.

**45 browser checks passed** in Chromium 144 with SwiftShader, using embedded
mode. Checks include all six rendered stages with no GL errors, a complete
six-stage event, both service stops, service penalties counted once, replay
entry/exit, strictly increasing replay samples, keyboard acceleration,
pause/resume, automatic pause on blur and recovery. Menus were checked at
390×844, 768×1024 and 1440×900: no horizontal document overflow and no interactive
controls in the shared Almanac pill's reserved area. No uncaught JavaScript
exceptions were reported. High quality was rendered for visual inspection;
the longer browser behaviour tests use the performance preset.

Not validated on physical gamepads, mobile GPUs, Safari or Firefox. The test
runner is not evidence of a particular hardware frame rate or of driving feel
at competition pace. Manual play-testing on target devices remains important.

## Deliberate first-release limits

The vehicle is a dynamic bicycle model with a vertical spring/damper, not a
four-independent-wheel simulation. No rollover, deformable bodywork, detailed
mechanical failures, tyre selection or differential tuning is implemented.
Bonnet camera is a forward driving view, not a modelled cockpit. Weather is
stage-authored, not a changing forecast. Targets are fixed times, not simulated
rival drivers. There is no multiplayer, online leaderboard, championship career,
licensing, saved in-progress rally, replay export or photo mode. Best times are
local and can be altered through developer tools; they are not competitive
anti-cheat records. Large visual upgrades and physics refinement can be made in
the separated modules without changing the static hosting model.

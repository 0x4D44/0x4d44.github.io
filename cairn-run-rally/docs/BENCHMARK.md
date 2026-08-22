# Cairn Run Rally quality benchmark

This benchmark records observed consequences of the six-region, six-car build. It separates
deterministic evidence from the human judgement that a script cannot supply.

## Automated and measured gates

| Gate | Evidence | Result |
|---|---|---|
| Test suite | `npm test` | **123/123 passed** |
| Content contracts | Six regions, six stages, six cars, weather, rivals, difficulties, and championship references | Deeply frozen and valid |
| Pairing reachability | `npm run simulate:matrix` | **36/36 viable**, zero failures, maximum 1 recovery, maximum aggregate damage 0.122 |
| Route integrity | Continuous authored-distance sampling, exact endpoints, hazards, barriers, splits, and finish checks | All six stages reach their authored finish |
| Mechanical difference | Fixed-input differential telemetry across drive layouts, powertrains, suspension, tyres, silhouettes, and damage limits | Six distinct car identities; FWD, RWD, and AWD represented |
| Surface/weather response | Grip, rolling resistance, roughness, particles, audio, visibility, and weather grip differ by authored content | Six distinct region/weather/scenery identities; shipped stages exercise dry and wet tarmac, gravel, mud, rain, fog, clear weather, and storm conditions; snow/ice recipes have focused tests |
| Championship | Browser selection, service, six events, resume, standings, result, and final classification | All six stages visited; duplicate/stale transitions rejected; abandon terminal |
| Service | Pure repair, tyre, and setup planner | 60-minute budget; standard/tarmac/wet/gravel tyres; bounded brake bias, steering ratio, ride height, and damping; invalid choices do not mutate state |
| Rivals and points | Seed repeat, difficulty sweep, stage standings, overall standings, penalty and retirement rules | Deterministic seeded rivals and conserved awarded points |
| Save safety | Versioned round trips, legacy migration, corrupt/future input, interrupted state, and storage failures | Corrupt saves recover; valid profile and bests survive |
| Controls | Keyboard, gamepad, remapping, pause/restart, disconnect/reconnect, and menu focus | Existing layouts remain valid; keyboard and gamepad maps persist independently |
| Audio | 119 stage-qualified notes in MP3 and Ogg, telemetry layers, stale queue, voice counter | 238 local files; browser championship holds stable 9/10 voices; unavailable audio stays finite with 0 voices |
| Browser failure handling | Forced no-audio and no-WebGL2 runs | No-audio telemetry remains finite; WebGL2 absence exposes a `role="alert"` explanation |
| Offline/static | Runtime request interception and local asset checks | No HTTP requests after local load |
| Responsive shell | Seven menu shells at 390×844 and 768×1024 | No document overflow, screen overflow, or clipped interactive controls |
| Hardware performance | Headless Chrome on Apple M5 Max, ANGLE Metal, 1920×1080 | GPU 0.45 ms; frame p95 9.6 ms; renderer CPU 0.04 ms; 17 draw calls; 10,202 triangles; 285 particles; 10.22 MB heap; 16.0 ms load |
| Almanac integration | Root build plus 390/768 px responsive suite | Build passed; 136 documents had no horizontal overflow or tappable content under the back pill |
| Preset fallback | Browser run at the low quality preset | Works and lowers backing resolution |

## Repeatable commands

```bash
npm test
npm run simulate:matrix
npm run smoke
npm run review
npm run qa
```

`npm run review` writes shell, region, car, and responsive captures to the ignored
`artifacts/review/` directory. They are review evidence, not committed product assets.

## Human judgement boundaries

The evidence does not establish that a first-time player can complete a full championship
without coaching. It does not establish that the six regions remain recognisable in
grayscale, or that the handling, audio mix, co-driver timing, and atmosphere feel good.
Those are explicit first-time-driver, grayscale-recognition, handling, and listening passes.

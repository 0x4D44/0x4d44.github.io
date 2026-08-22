# Quality Report

## Final working-tree result

The version 1.1 packaging run produced:

- **28/28 deterministic tests passed**;
- authored route length: **5.405 km**;
- deterministic reference-driver finish: **290.47 seconds (4:50.47)**;
- reference-run recoveries: **0**;
- reference-run contacts: **3**;
- aggregate component damage at finish: **0.037 (3.7%)**;
- pace calls delivered: **18/18**;
- split times: **95.63 / 187.18 / 290.47 seconds**;
- maximum reference-run slip angle: **84.3°**;
- maximum reference-run lateral displacement: **12.5 m**;
- retry countdown: **0.78 seconds**;
- browser smoke runtime errors: **0**;
- gamepad A start: **passed**;
- gamepad Start pause/resume: **passed**;
- gamepad disconnect/reconnect state clearing: **passed**;
- trusted keyboard restart: **passed**;
- high-DPI backing resolution: **1350×1350**;
- low-quality fallback resolution: **900×900**.

The autonomous run is a completion and stability regression. It is not described as clean: the driver makes three contacts and finishes with 3.7% damage.

Run `npm run qa` to repeat test, simulation, and browser smoke. Run `npm run review` to regenerate the multi-angle screenshots.

## Browser instrumentation sample

One final 1280×720 packaging sample under Chromium/SwiftShader reported:

| Metric | Result |
|---|---:|
| Renderer CPU average | 0.82 ms |
| Physics average | 0.38 ms |
| GPU timer | 64.35 ms |
| Frame p95 | 50 ms |
| Presented fps | approximately 20 |
| Draw calls | 16 |
| Visible triangles | 7,254 |
| Active particles | 318 |
| JavaScript heap reported by CDP | 2.06 MB |
| Load time | 392.4 ms |
| Runtime errors | 0 |

The render-CPU and physics numbers show that the JavaScript-side work is small in this sample. The GPU/frame/fps values come from SwiftShader under Xvfb and are therefore not a representative laptop-GPU benchmark.

## What the checks establish

The checks establish that:

- the route contains the required authored feature set and reaches its exact endpoint;
- route projection is continuous between authored samples;
- compact dirt and loose gravel differ measurably;
- oversteer can be induced and reduced with countersteer;
- handbrake cannot propel the car from rest;
- airborne controls have negligible authority;
- residual low-speed lateral motion settles;
- reverse steering and recovery-point logic use the correct direction;
- visible authored barriers and bridge rails collide;
- gentle contact does not accumulate mechanical damage while real impacts do;
- damage remains bounded and perceivable;
- a complete stage can be driven without automatic recovery;
- checkpoint skipping and reverse crossing do not produce an invalid finish;
- stale co-driver calls cannot silence the remainder of the stage;
- all spoken calls are packaged locally in MP3 and Ogg;
- the camera remains smooth, above terrain, and oriented toward useful road context during a slide;
- the real browser shell boots, accepts keyboard and gamepad interaction, pauses, reconnects, resizes, changes quality, and restarts without captured runtime errors.

## Performance boundary

The design target remains stable 60 fps at 1920×1080 on a typical recent laptop. The available browser runner uses SwiftShader under Xvfb, so its approximately 20 fps presentation and GPU timing are not meaningful evidence for hardware acceleration. The code has low draw-call/triangle counts, low measured renderer CPU work, bounded particle/timer state, and a working low-quality fallback, but **stable 1080p/60 has not been independently measured on representative hardware**.

A release-machine pass should run at 1920×1080 on at least one integrated laptop GPU in current Chrome/Edge and one other production browser, complete the stage twice, and record frame p95, GPU/CPU timings, thermal behaviour, and audio continuity.

## Human-playtest boundary

The gauntlet used deliberately separated implementation and specialist critic passes, deterministic simulation, source inspection, screenshots, and Chromium interaction. It did not include an unrelated human who had never seen the controls. An independent first-time playtest remains the strongest check for:

- whether empty-road driving is entertaining;
- whether slides feel controllable rather than merely testable;
- whether pace-note timing and speech are intuitively useful;
- whether the stage is memorable and learnable;
- whether the first five minutes feel commercially cohesive.

## Intentional scope

One car and one stage are intentional. The five-minute experience includes driving, camera, atmosphere, authored pace notes, meaningful damage, timing, settings, pause, result, best-time comparison, gamepad/keyboard shell control, and fast retry. Multiple cars, additional stages, championship structure, online services, and a career layer were excluded because they do not improve the quality of the first run by themselves.

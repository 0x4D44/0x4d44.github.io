# OpusRally — what is not finished

The game boots, drives, calls the road, damages, times and finishes, and the whole
suite is green. It is **not** yet at the bar the brief set. This is the honest list,
ordered by how much each one costs the player, so the next session can resume without
re-deriving it.

## Never verified at all

The build fan-out lost several agents to a usage limit mid-flight. Two modules were
written but their author died before writing tests, and their reviews never ran:

- **`physics.js` has no test file.** It is the most important module in the game and the
  only evidence it works is a browser gate that drives it and eight acceleration and
  braking figures measured by hand (0–100 in 5.5–9.2 s, 180–219 km/h top speed, on
  tarmac). Nothing checks the tyre model, the friction ellipse, weight transfer, the
  diffs, or determinism. **Write `tests/physics.test.mjs` first** — the brief for it is
  in the workflow script under `.claude/.../workflows/scripts/opusrally-core-sim-*.js`.
  A defect here was already found this way: with the sim assist preset the gearbox is
  fully manual, so a player holding the throttle pinned first gear at 79 km/h.
- **`stage.js` has no test file.** Same story. `stageFromBook` produces a 12.8 km stage
  where a direct `generateStage(def.seed, def)` produces 8.9 km for the same entry —
  worth understanding before trusting either. Its reverse-variant code path contains
  `entry.seed + (entry.params.reverse ? "" : "")`, which is a no-op and looks like an
  unfinished thought.
- **`replay.js` has no test file.**

## Defect lists that were produced but never acted on

Independent reviewers filed these; the repair agents died before fixing them. Full text
is in the workflow journals under
`~/.claude/projects/.../subagents/workflows/wf_40a46a9c-346/` (render, 67 defects across
correctness/visual/performance/feel) and `wf_dac68166-467/` (meshes, 26+ across
correctness/visual/performance). The ones already confirmed against a screenshot:

1. **The scene is far too dark on the overcast-family presets.** Golden hour reads
   correctly; overcast reads as dusk. Tone mapping is *not* doubled and the HDR render
   target is correct on WebGL2, so the cause is still open — suspect the hemisphere and
   ambient fill against the linear albedos in `surfaces.js`.
2. **Nothing casts a shadow at the quality levels a phone will pick.** The rig fits a
   tight ortho box and looks right in code; it needs to be seen on real hardware.
3. **The scenery LOD, impostor, instance-budget and fade system is dead code on the
   shipping path** (render reviewer, confirmed): zero distance culling of scenery over a
   9 km stage.
4. **The start-gantry banner reads mirrored** — the wordmark is drawn on the back face,
   or the UVs are flipped. Visible in `shots2/startline.png`.
5. **No antialiasing on the default path** — post renders into a non-multisampled
   target, so every edge is aliased.
6. **The auto quality scaler is a one-way ratchet** on a 60 Hz display: its up-threshold
   sits below the vsync quantum, so it can never step back up.
7. **Every stage build leaks a weather rig into the scene** — after three stages the
   renderer carries ten directional lights.
8. Trees render as flat black silhouettes; the terrain shows no texture at distance.

## Not started

- The critic loop the brief asked for: agents driving the built game, shooting it, and
  looping until they stop finding fault. `tests/shoot.mjs` is the instrument and works.
- Touch controls for phones. The menus are responsive; there is no on-screen wheel.
- `tests/responsive.test.mjs` at the repo root has not been run against this document.

## How to resume

```
cd opus-rally
node --test tests/*.test.mjs        # unit
node tests/validate-static.mjs      # wiring, branding, determinism
node tests/browser.test.mjs         # boots, drives, brakes, steers, every stage
node tests/shoot.mjs --out ../shots --quality medium --width 960 --height 540
```

The screenshot tool pins the quality level deliberately: the autoscaler measures
SwiftShader in headless and would otherwise photograph the game with its shadows and
post switched off.

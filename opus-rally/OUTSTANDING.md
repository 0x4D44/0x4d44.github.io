# OpusRally — what is not finished

The game boots, drives, calls the road, damages, times and finishes. Every gate is
green: 434 unit assertions, 86 static checks, a browser gate that drives it with real
key events in headless Chrome, and a drivability oracle that autopilots all twelve
stages to the finish. It is deployed.

It is **not** at the bar the brief set — "stand comparison with the best modern rally
games". Two independent critics looking at real rendered frames have both returned
"not there". This is the honest list.

## How to look at it yourself

```
cd opus-rally
node --test tests/*.test.mjs        # unit + the drivability oracle
node tests/validate-static.mjs      # wiring, branding, determinism
node tests/browser.test.mjs         # boots, drives, brakes, steers, starts every rally
node tests/shoot.mjs --out ../shots --quality medium --width 1280 --height 720
```

`shoot.mjs` drives the car with the same pure-pursuit autopilot the game exposes, so
the frames show a car on the road rather than one abandoned in a field. It writes a
`manifest.json` recording where the car actually was — **if a frame's `surface` reads
`GRASS`, that frame is not evidence.** It pins the quality level deliberately, because
the autoscaler measures SwiftShader in headless and would otherwise photograph the game
with its shadows and post switched off.

## Open, in rough order of what it costs the player

1. **The car reads as a slab.** `buildBodyShell` lofts a *closed* hull whose deck sits
   at belt-line height straight through the cabin. That single fact is why the cockpit
   camera shows bodywork, why the dash and steering wheel are modelled but never
   render (they sit 0.11–0.17 m *below* that deck), and why the exterior has no
   glasshouse depth. There is also no cabin trim, so from inside you see exterior
   livery on the roof and doors.
2. **The car cannot restart on a low-grip climb.** From rest on ice at an 8.8% grade
   the engine bogs below idle instead of the auto-clutch slipping. A player who spins
   on any ice or mud climb is stranded and the stage is unfinishable.
3. **`autoShift` keys off engine rpm**, which during wheelspin comes from the spinning
   wheels rather than road speed. With traction control off on an ice climb the gearbox
   walks to 5th at 15 km/h with slip ratios pinned at 6.0.
4. **The top-class car is the slowest off the line.** Four seconds from rest at full
   throttle on tarmac: `delta-b640` reaches 20.8 km/h against `ardent-r1`'s 57.7 and
   `vireo-r2`'s 42.1 — yet it reaches 100 km/h in 9.2 s and tops 219, so it is not down
   on power. It bogs.
5. **`speedProfile` has no vertical-curvature term**, while `buildAirfield` derives
   crest and jump strength *from* its output. The profile authorises a speed the crest
   then launches the car at.
6. **`speedProfile`'s power pass models the engine as P/(m·v)** — no torque curve, no
   gearing — so it claims 11.9 m/s is sustainable on a mud climb where the real
   drivetrain stops.
7. **Headlights blow out to pure white** in the centre of the pool, losing the road
   surface detail that is readable at its edges.
8. **Snow renders as large hard white squares** rather than as snow, and `night-clear`
   reads as dusk: the moon runs at intensity 3.2 with exposure 2.3 and the terrain
   comes out mid grey.
9. **A 1.7 cm step survives at the road edge**, from the projection tie-breaking
   between two adjacent segments whose tangent planes disagree through a tight corner
   on a steep grade. A wheel does not notice it. The proper fix interpolates the road
   frame along arc length, which changes the surface everywhere and wants its own pass.
10. **`surfaceAt` decides `onRoad` from `|lateral|` alone**, so 50 m past the finish
    line it still reports road grip on open terrain. One line, but `lateral` and
    `signedLateral` are contract fields that scenery placement, pacenotes and physics
    all read.
11. **The terrain skin interpenetrates the road ribbon by up to 0.81 m.** The lattice
    step is chosen from the triangle budget alone, and a patch spanning the road is a
    flat plane between vertices sitting on the verge. The fix is to conform lattice
    vertices near the centreline down to the road surface, in `meshes.js`.
12. **Scenery blows its own triangle budget** on the shipping stages — 272k on
    `kloft-bjornhalt` and 314k on `northmarch-kestrel` against a declared 240k. Terrain
    auto-coarsens to fit; nothing thins scenery.
13. **No touch controls.** The menus are responsive and the HUD has a real portrait
    layout, but there is no on-screen wheel, so a phone can reach the game and not
    drive it.

## Open on the sky and the ground, after the material and dome passes

- **Golden hour's sky is still blown to 209/255 and the dome is not why.** Its
  horizon stop was cut 2.2x (1.0 to 0.46 linear) and the rendered pixel moved
  nine levels; killing the cloud deck, the cloud cover and the sun disc together
  move it about twenty. So roughly ninety per cent of what lights that sky comes
  from downstream of `weather.js`. The remaining suspect is the bloom prefilter
  in `render.js` — `col += tBloom * 0.62` runs BEFORE exposure, and at golden
  hour's exposure of 1.35 a hot sunlit landscape has most of the frame over any
  reasonable bright threshold. Measure the threshold and the prefilter, not the
  dome.
  **Update 2026-08-25: the prefilter is largely ruled out.** It is now a
  nine-tap Karis average (see the white-flash fix), which cuts hard what small
  bright features contribute — and golden hour barely moved: the ring means
  around the brightest sky point went 199/177/177/151 to 199/165/179/151, and
  the frame mean was 107 before and 106 after. Whatever is lighting that sky
  survives a large change to the bright pass, so the remaining suspects are the
  threshold and knee themselves (`uThreshold` 1.0, `uKnee` 0.55), the 0.62
  bloom weight, or the exposure. Sample with `u.uBloom.value` forced to 0 first:
  that one measurement separates "the scene is blown" from "bloom blew it", and
  it is the measurement the white-flash hunt should have started with.
- **The pixel mirror in `tests/weather.test.mjs` is faithful in luminance and
  NOT in chroma.** Its `skyPixel()` put hard noon at 1.41 blue-over-red in the
  bug state and 1.47 after the fix; the real frame measured 1.09 and 1.17 for
  the same two states. Any assertion about the sky's hue written against the
  mirror is measuring something the screen does not do. Luminance tracks: the
  mirror said 220 where the screen said 210-233, which is why the white-ceiling
  test works. Find the divergence before writing a hue assertion.
- **Nothing pins any other output level.** A threefold change in the dome's
  radiance passed all forty-two weather assertions, because every one of them
  measured a ratio, a monotonicity or a relationship. There is now one test that
  pins the sky's output band. The ground, the car and the fog have no equivalent.
- **"The car casts no shadow" is now FALSE, and was a casualty of the unlit
  scene rather than a fault in the shadow rig.** Measured by turning the car's
  43 `castShadow` flags off and diffing the frame: the ground to the lower right
  brightens by up to 52.5 levels per block in a coherent car-shaped region,
  against a control noise floor of 4.1. The rig checks out too — the car is 43
  of the scene's 67 casters, it sits inside the fitted box, and the box resolves
  a 0.111 m texel, so a 4.3 m car is 39 texels long. Do not "fix" this.
  Two things that make this measurement harder than it looks. The composite
  reseeds its ordered dither from `uTime` every frame, so a three-level per-pixel
  threshold reports 40% of the frame as changed when nothing has changed at all;
  compare region means, where zero-mean dither cancels. And `placeAt` leaves the
  car rolling, which swamps everything — place it at zero and let it settle, then
  take a control pair before the real one.
- **A blizzard still puts no snow on the ground.** `meshes.js` now exports
  `setGroundSnow(root, cover)` and both ground shaders carry the uniform;
  `render.js` never calls it, and never reads `weather.metrics.snowCover`.
- **The car never gets dirty.** `setMudLevel` is exported and the car carries a
  `setMud` hook; nothing calls either.
- **The trees are still alpha-card cross-planes** with visible seams and one
  silhouette repeated across a stage.

## Things that turned out to be lies, and are worth remembering

- **A test measuring the right quantity can still miss what the eye sees.** The sky was
  never flat in radiance — it sat on the ACES shoulder, where a 1.9× radiance ratio is
  worth about sixteen levels of pixel. The tests measured ratios and passed while the
  screen showed a white wash. `weather.js` now carries a pixel-accurate mirror of the
  renderer's exposure, ACES and sRGB so its assertions measure output, not input.
- **A test can pass here and fail in a fresh checkout of the same commit.** The render
  source scan anchored on a newline-brace-newline sequence; under Git's CRLF checkout
  that never matched and it scanned a blind 4000-character window into neighbouring
  functions.
- **A gate can stop short of the thing that breaks.** The browser test generated every
  stage and never *started* one — and eleven of the twelve could not start, because the
  stage book named its weather in prose while `weather.js` keys presets by id.
- **A unit can be correct and the composition still wrong.** `THREE.PerspectiveCamera.fov`
  is vertical; the camera numbers were authored as horizontal, and the field the
  widening ramps against is a speed in m/s that had been given a degree value.

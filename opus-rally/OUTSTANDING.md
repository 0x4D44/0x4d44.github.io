# OpusRally — what is not finished

The game boots, drives, calls the road, damages, times and finishes. Every gate is
green: 534 unit assertions, 93 static checks, a browser gate that drives it with real
key events in headless Chrome, and a drivability oracle that autopilots all twelve
stages to the finish. It is deployed.

It is **not** at the bar the brief set — "stand comparison with the best modern rally
games". Three independent critics looking at real rendered frames have all returned
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

## Closed since the last revision

Recorded because the residue matters, and because two of these were half-stale before
anyone re-measured them.

- **The car reading as a slab** was two separate faults, and the first was already
  fixed when the entry was written. The hull, the cabin trim and the glasshouse were
  done; nobody had updated the doc. What was still broken: `buildDash` sank the
  instruments into the *face* of the fascia, where the cockpit eye — 0.215 m above it,
  aiming 0.86° up — projected them to clip y −1.332, a third of a frame below the
  picture. And the shell's deck crown stood 81 mm (101 mm on the heritage cars) proud
  of the bonnet that skins it, so the deck was the visible surface and its atlas UV is
  the deck-stripe band: a stripe of the car's own exterior livery ran across the
  driver's forward view. Both fixed. Residue is items 4 and 16 below.
- **Restarting on a low-grip climb, `autoShift` keying off wheelspin rpm, and the
  top-class bog** were one problem in the launch clutch and the traction servo. Fixed
  for 4WD first, then for the two-wheel-drive cars — which needed the tyre's actual
  slip peak rather than a near-peak approximation. The traction cut had been hunting at
  2.5 Hz, audible as the engine surging; a 550-cell paired sweep puts the mean surge
  rate at 0.949 Hz before and 0.017 Hz after, with no cell worse.
- **The headlights blowing a hole in the road, and `night-clear` reading as dusk.**
  Core pixels over 240 fell 0.37% → 0.01% with the local grain intact; the night grade's
  black point went from 57/255 to 26, so the frame has black in it.
- **Snow reading as hard white squares, and the blizzard having no horizon.** The
  whiteout was the worse half and had never been touched: sky above the horizon read
  216.1 against ground below it at 215.4 — seven tenths of a level, so you could not see
  where the road went.
- **Two of the twelve stages were their forward twins.** `beginStage` spread an
  unconditional `reverse: !!choice.reverse` over the book's own `params.reverse: true`,
  and nothing sets `choice.reverse`. All 61 sampled elevations of `kloft-bjornhalt-rev`
  were bit-identical to `kloft-bjornhalt`.

- **The ground beside the road was painted the road's own colour.** The churned-earth
  apron measured its width from the CENTRELINE, so it reached 19-22 m past the edge —
  the whole of what fills the frame beside the road at driving distances — and its
  palette shaded 5% brighter than the grass it displaced. Value was the only cue left,
  and a hillside tilted into the sun reverses value. Hue does the work now: at 60 m on
  kloft-bjornhalt the ground was within 2 pixel levels of the road with no hue
  difference at all, and is now 11 levels and -3.9%.
- **The cabin is lit and the instruments read the car.** The pod goes from luminance
  16.0 to 35.3 at golden hour; at night from 25.0 to 61.2 with the spread across it
  rising from 1.7 to 22.4, which is the number that matters — a dial you cannot tell
  from its bezel is not an instrument. The needles and shift lights now follow the car
  rather than sitting at fixed sweeps. Done by LIGHTING it: the albedos were already
  honest and capped at 0.20 linear by the material band test.
- **There is a championship.** `career.js` and `stage.js` had disjoint stage universes,
  so nothing could run over the roads the game ships. The calendar is built from
  STAGE_BOOK now — five rallies, 24 runs, a power stage each — and a player can start
  one, drive its events in order, carry a result between them and finish it. The title
  screen shows an attract camera on a real stage instead of a dialog.
- **"Shadows delete the surface they fall on" was never true.** The entry claimed a
  fivefold texture collapse inside shadow — detail-sd 41.5 lit against 8.6 shadowed.
  Measured paired, with the shadow gate on and off and the mask taken from the pixels
  themselves, the detail ratios are 0.50, 0.70 and 0.95 across three distance bands.
  It does not reproduce. Do not "fix" it.
## Open, in rough order of what it costs the player

1. **The car reads as a toy at chase distance.** No shut lines, no boot, no bumper; the
   tail lights are four solid-red ellipses painted on a black panel with no housing or
   lens; the plate is a blank grey rounded rectangle; the wing posts interpenetrate the
   body; two C-pillar fins float clear of the roof; the roof livery is a stretched
   smear. The cockpit and the glasshouse have had two passes now; the outside has had
   none.
2. **Weather has almost no signature beyond fog.** No snow accumulates on the car, no
   plume behind it at speed on snow, no wet-road specular streak, no spray, no wet
   bodywork. Rain streaks are identical in length, angle and opacity at every depth and
   draw over the car. And `setMudLevel` is exported, the car carries a `setMud` hook,
   and **nothing calls either** — the car finishes 12 km of gravel spotless.
3. **In a blizzard you still cannot see the road past about 50 m, and the lever is the
   fog.** The road-edge pass fixed daylight by hue and gave snow a value cue, but a
   0.596 albedo ratio between compacted road and clean verge is worth at most 6.5 pixel
   levels at 20 m where the same ratio unfogged is worth 61. The fog in `weather.js`
   keeps about a tenth of the contrast, and under two levels by 60 m. At some stations
   the snow change even costs contrast (18.7 → 11.0 levels at one). Fixing this means
   the fog curve, not the materials.
4. **Scenery reads as placeholder.** The trees are alpha cross-planes with visible seams
   and one silhouette repeated across a stage; spectators are armless grey cylinders
   standing dead still; the barrier tape is a 1 px red line; telegraph wires are 1 px
   aliased black curves; distant terrain shows horizontal lattice banding at the LOD
   steps.
5. **Touch, the residue.** The controls work and no longer bury the HUD, but the HUD's
   own landscape rail overflows a 360 px screen by 19 px, so at 740x360 the slider
   covers 2.0% of the speed cluster and at 667x375 1.2% — cosmetic, and fixing it means
   restructuring that rail. `tests/touch.test.mjs` models the HUD panel as 120x90 where
   the real element is 152x220, so that unit test is weaker than its numbers look. And
   none of it has run on a real device: contact size, palm rejection, iOS
   `requestPermission`, safe-area insets and browser chrome are all untested, and tilt is
   never exercised in a browser at all because headless Chrome emits no
   `deviceorientation`.
6. **`speedProfile` has no vertical-curvature term**, while `buildAirfield` derives
   crest and jump strength *from* its output. The profile authorises a speed the crest
   then launches the car at.
7. **`speedProfile`'s power pass models the engine as P/(m·v)** — no torque curve, no
   gearing — so it claims 11.9 m/s is sustainable on a mud climb where the real
   drivetrain stops.
8. **The terrain skin interpenetrates the road ribbon by up to 0.81 m.** The lattice
   step is chosen from the triangle budget alone, and a patch spanning the road is a
   flat plane between vertices sitting on the verge. The fix is to conform lattice
   vertices near the centreline down to the road surface, in `meshes.js`. **This got
   more visible, not less:** the road-edge pass took the verge/terrain junction step
   from 1.09x to 1.49x, so a poke-through now reads about five times more contrasty
   where it happens.
9. **Scenery blows its own triangle budget** on the shipping stages — 272k on
   `kloft-bjornhalt` and 314k on `northmarch-kestrel` against a declared 240k. Terrain
   auto-coarsens to fit; nothing thins scenery.
10. **`surfaceAt` decides `onRoad` from `|lateral|` alone**, so 50 m past the finish
    line it still reports road grip on open terrain. One line, but `lateral` and
    `signedLateral` are contract fields that scenery placement, pacenotes and physics
    all read.
11. **A 1.7 cm step survives at the road edge**, from the projection tie-breaking
    between two adjacent segments whose tangent planes disagree through a tight corner
    on a steep grade. A wheel does not notice it. The proper fix interpolates the road
    frame along arc length, which changes the surface everywhere and wants its own pass.
12. **Exterior residue from the cockpit pass.** The shell's shoulder stands up to 29 mm
    above the bonnet's outer edge near the nose — the wing rail sits proud of the bonnet
    — and the roof scoop's inner face reaches the extreme top corner of the cockpit
    frame through a headliner gap. Both are small and both are exterior work.

## Open on the sky and the ground, after the material and dome passes

- **Golden hour's sky is still blown to 209/255 and the dome is not why.** Its
  horizon stop was cut 2.2x (1.0 to 0.46 linear) and the rendered pixel moved
  nine levels; killing the cloud deck, the cloud cover and the sun disc together
  move it about twenty. So roughly ninety per cent of what lights that sky comes
  from downstream of `weather.js`.
  **The bloom prefilter is largely ruled out.** It is now a nine-tap Karis average
  (see the white-flash fix), which cuts hard what small bright features contribute —
  and golden hour barely moved: the ring means around the brightest sky point went
  199/177/177/151 to 199/165/179/151, and the frame mean was 107 before and 106 after.
  Whatever is lighting that sky survives a large change to the bright pass, so the
  remaining suspects are the threshold and knee themselves (`uThreshold` 1.0,
  `uKnee` 0.55), the 0.62 bloom weight, or the exposure. Sample with `u.uBloom.value`
  forced to 0 first: that one measurement separates "the scene is blown" from "bloom
  blew it".
  Separately, golden hour is *also* wrong in hue — sky at the horizon (208,188,173) is
  R−B of 35 where a low sun wants 80–120, and the zenith (177,166,182) is blue. And in
  a low-sun frame the telegraph poles and the chevron board cast no shadow at all.
  It is the default weather on the first stage a player loads.
- **The pixel mirror in `tests/weather.test.mjs` is faithful in luminance and
  NOT in chroma.** Its `skyPixel()` put hard noon at 1.41 blue-over-red in the
  bug state and 1.47 after the fix; the real frame measured 1.09 and 1.17 for
  the same two states. Any assertion about the sky's hue written against the
  mirror is measuring something the screen does not do. Luminance tracks: the
  mirror said 220 where the screen said 210-233, which is why the white-ceiling
  test works. Find the divergence before writing a hue assertion.
- **Nothing pins any other output level.** A threefold change in the dome's
  radiance passed all forty-two weather assertions, because every one of them
  measured a ratio, a monotonicity or a relationship. There are now tests that pin
  the sky's output band, the night black point, the headlight core and the blizzard's
  sky-to-ground asymmetry. The ground, the car and the fog have no equivalent.
- **"The car casts no shadow" is FALSE, and was a casualty of the unlit
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

## Things that turned out to be lies, and are worth remembering

- **Correct engineering, described by a comment that is wrong, is a defect.** Three
  consecutive rounds of adversarial verification found the same failure mode and
  nothing else: the code was right and its committed prose was not. A test comment
  asserted the stage book carried no ice when one stage carries 154 m of it, which
  then justified calibrating that test against a comfortable grade instead of the real
  one. A braking figure was out by 0.7 m, which meant the threshold chosen from it did
  not close the gap it was added to close. A beam was described as "darker than the
  haze around it" when additive blending cannot subtract light — the two numbers came
  from different places in the frame. Write the measurement you took, not the one you
  expected, and re-derive a figure before quoting it from your own earlier report.
- **A test measuring the right quantity can still miss what the eye sees.** The sky was
  never flat in radiance — it sat on the ACES shoulder, where a 1.9× radiance ratio is
  worth about sixteen levels of pixel. The tests measured ratios and passed while the
  screen showed a white wash. `weather.js` now carries a pixel-accurate mirror of the
  renderer's exposure, ACES and sRGB so its assertions measure output, not input.
- **A test can assert the shader line twice and prove nothing.** The snow-flake test
  compared a term computed as `luminance(_hazeCol)` against a term that *was*
  `luminance(_hazeCol)`; on a live frame both read 0.6999. It was deleted rather than
  patched. If a quantity in a test is identically a quantity in the code under test,
  it can only agree with itself.
- **A test can pass here and fail in a fresh checkout of the same commit.** The render
  source scan anchored on a newline-brace-newline sequence; under Git's CRLF checkout
  that never matched and it scanned a blind 4000-character window into neighbouring
  functions.
- **A gate can stop short of the thing that breaks.** The browser test generated every
  stage and never *started* one — and eleven of the twelve could not start, because the
  stage book named its weather in prose while `weather.js` keys presets by id. Later it
  started every stage and never asked whether two of them were the same road.
- **A unit can be correct and the composition still wrong.** `THREE.PerspectiveCamera.fov`
  is vertical; the camera numbers were authored as horizontal, and the field the
  widening ramps against is a speed in m/s that had been given a degree value.
- **A harness that drives the car while you measure the car is worse than no harness.**
  `drive()` never cleared `setAutoDrive`, so a stage started after an auto-driven one
  began with the throttle pinned at the line. It silently corrupted a launch
  measurement, and was caught only because the numbers looked too good.

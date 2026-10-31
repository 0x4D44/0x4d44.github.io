# Hillside vista kit — verification

Date: 31 October 2026.

**Status: asset, foundation, world-test, payload, controlled visible-cost and
40-view geometry verification is complete. The final integrated metrics run
completed; its 12 ms software-rendering costs and ReadPixels warnings fail
the existing gates. The baseline also retains its post-soak counts timeout.**

## Base and scope

The base is fetched `origin/main`, pinned at
`8fa06a5498555afc5dc2b636c06754a4a6b5882c`. Measurements compare that checkout
with the completed kit on the working branch. This actual base contains the
shared `furn_build.py` / `furn_lib.py` pipeline but no `vista.js`, `tower.js`,
`FURNITURE.md` or `furn_validate.mjs`; its furniture manifest is empty. The
payload and test counts below therefore describe the checked-out revision.

The change adds 48 modular designs and their far LODs, registered through
`assets/models/manifest.vista.json`. The planner assembles adjoining, stepped
terraces outside the playable area; distance LODs and instancing bound the
added geometry. The original distant terrain and night lights remain intact.
`?vista=0`, missing assets or a failed kit load retain that fallback. Failure
tests also check that partially allocated geometry is released.

## Generated assets and budgets

The generated files are present, and complete validation reports **48 logical
pieces, 96 actual asset roots, zero errors and zero warnings**. The four-file
kit totals **725,997 bytes**, below the 2,000,000-byte limit.

| File under `assets/models/` | Bytes | Triangles across unique meshes | Maximum per piece |
| --- | ---: | ---: | ---: |
| `vista/vista_near.glb` | 533,384 | 6,958 | 444 |
| `vista/vista_far.glb` | 149,184 | 1,278 | 60 |
| `vista/placement.json` | 15,555 | — | — |
| `manifest.vista.json` | 27,874 | — | — |
| **Total** | **725,997** | — | — |

The inventory is 12 façade/storey shells, 8 roofs, 4 tanks, 4 rebar/unfinished
column pieces, 4 stairs, 6 retaining walls, 4 balconies and 6 washing lines.
Near pieces are strictly below 600 triangles; far pieces are at most 60.
These are library totals; instanced scene costs are measured separately below.

Meshes use existing library material names and vertex colours, with no embedded
or external textures or image resources. Geometry buffers are contained in the
GLBs; no external binary files or compression decoders are required.
Dimensions and stack rules use metre-based placement envelopes. Façade front
mounts are bounded and match both LOD manifest entries. Binary positions,
normals, UVs, colours, indices, triangle areas, winding agreement, accessor
ranges and actual bounds are independently checked against the metadata.

The geometry audit corrected outward gable faces and retained visible concrete
top caps in the far rebar pieces. Omitting concealed beam end caps keeps those
four far variants at 12, 24, 48 and 60 triangles. Winding agreement with normals
alone cannot establish architectural outwardness; the contact-sheet inspection
complements the binary checks.

## Terrain contact

The exact sampler matches the rendered terrain triangles under all **887
foundations**, leaving **zero positive gaps**. It extends **403** foundation
bottoms: 267 first-storey bases and 136 retaining-wall bases, with a maximum
extension of **0.60217 m**. Horizontal layout and all other pieces are unchanged.
Every storey top and wall cap is preserved; the largest recorded floating-point
top difference is approximately 7.11 × 10⁻¹⁵ m. This changes placement transforms
without adding triangles or modifying the 725,997-byte model kit.

`after/foundation-comparison.json` records the changed instances, top invariants
and unchanged LOD modes at five sampled positions. The terrain-contact world
test verifies that foundations remain buried in the actual terrain triangles.

## Tests and shipped payload

| Check | Before | After | Evidence |
| --- | ---: | ---: | --- |
| World tests | 37/37 pass | 70/70 pass | `before/world-tests.log`, `after/world-tests.log` |
| Complete vista validator | Kit absent | Pass; 48 pieces / 96 roots | `after/validation.json` |
| Shipped payload | 17.49 MiB | 18.21 MiB | `before/payload.json`, `after/payload.json` |
| Estimated GPU texture memory | 153.33 MiB | 153.33 MiB | Same payload reports |

The reported payload grows by approximately 0.72 MiB, including runtime code
and model metadata. Both payload checks pass the existing 60 MiB gate. The
payload tool excludes `vendor`, `dev`, `labs`, `tests` and `tools`, so committed
verification screenshots and diagnostic tooling are outside that measurement.

The world suite includes 21 asset-contract/corruption tests. They deliberately
damage container headers, accessor data, indices, winding, bounds, material
names, LOD presence, dependency declarations and front mounts to verify that
invalid files fail validation. The complete world-test run uses:

```sh
node --import ./la-ladera/tests/register.mjs --test --test-isolation=none --test-concurrency=1 la-ladera/tests/world-*.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tools/blender/vista_validate.mjs --complete --json
```

## Headless measurement profile

| Setting | Profile |
| --- | --- |
| Browser | Chrome 156.0.8078.80, headless |
| Renderer | SwiftShader software WebGL |
| Viewport / device pixel ratio | 960 × 540 / 1 |
| Game query | `manual&dpr=1` |
| Timed views and screenshots | `--views 3`: spawn, ridge looking south, valley looking north |
| Additional geometry sweep | `--geometry-views 40` |
| Deterministic navigation soak | `--soak 60` simulated seconds requested |
| Capture mode | `--capture page`, preserving the game's render-target size |
| Optional CDP response wait | `--eval-timeout-ms 600000`; no change to performance gates |
| Uncapped render-cost gate | **12 ms, unchanged** |
| Scene geometry gates | 2,500,000 triangles and 1,800 draw calls |

Both checkouts use the same measurement code, viewport, game query and sample counts.
The final integrated run extends heavy CDP response waits to 600,000 ms; the
baseline used the original response deadlines. This changes no measured loop
or budget threshold. The command options
are `--w 960 --h 540 --views 3 --geometry-views 40 --soak 60 --capture page
--query 'manual&dpr=1'`; `--root` selects the pinned baseline checkout for the before
run. `--json` and `--shots` select the corresponding evidence directory.
The optional 600,000 ms timeout permits longer CDP response waits only; it
changes neither samples, simulation steps nor pass/fail thresholds. The final
integrated run completed. The baseline's existing timeout remains recorded.

In manual mode, the sampled `requestAnimationFrame` intervals measure browser
cadence while the game is stepped explicitly. They do **not** establish a
sustained 60 FPS game loop. The harness separately measures uncapped rendering
with `gl.finish`; the 12 ms gate remains in force. SwiftShader costs describe
this software-rendering environment and cannot establish desktop GPU frame
times. All failed gates remain in the raw reports.

The additional geometry pass settles each viewpoint for 40 simulation steps
and renders once. It checks triangles and draw calls without making timing or
FPS claims. The three timed views and the broader geometry sweep are reported
separately.

### Baseline outcome — partial report with failures retained

`before/metrics.json` contains all three timing measurements, 40 geometry views
and the completed soak. The soak ran **98 simulated seconds** while completing
its routes, with zero stuck events, falls, NaN positions or unreachable targets.
The subsequent final-counts read timed out, so this is not a full passing run.

The unchanged 12 ms render-cost gate fails at spawn (**14.61 ms**) and the ridge
(**19.23 ms**); the valley measures **11.71 ms**. The baseline also records four
software-GPU `ReadPixels` stall warnings, which remain warning-gate failures.
There are no console/page errors or 404s. The final `Runtime.evaluate` CDP timeout
is preserved in the report's failure list along with those timing and warning
failures.

### Visible kit cost in the three required views

`after/shots.json` measures the final kit with its geometry enabled and hidden
at the same camera state. This isolates its visible triangle/draw-call cost.
The hidden-kit values also match the corresponding baseline timing-view rows.

| View | Without kit: triangles | With kit: triangles | Added triangles | Without kit: calls | With kit: calls | Added calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spawn | 1,529,993 | 1,545,223 | **15,230** | 1,075 | 1,158 | **83** |
| Ridge looking south | 1,190,072 | 1,230,540 | **40,468** | 771 | 940 | **169** |
| Valley looking north | 1,323,715 | 1,352,685 | **28,970** | 827 | 938 | **111** |

All three captured views remain below 2,500,000 triangles and 1,800 calls. These
capture measurements establish geometry cost. Timing and the completed
40-view sweep are recorded separately below.

### Three-view timing comparison

| View | Before uncapped ms | After uncapped ms | 12 ms gate after |
| --- | ---: | ---: | --- |
| Spawn | 14.61 | 13.71 | Fail |
| Ridge looking south | 19.23 | 16.14 | Fail |
| Valley looking north | 11.71 | 12.78 | Fail |

Both commands exit 1. The final integrated run completed every phase and
reports only the three uncapped costs above 12 ms and four software-GPU
ReadPixels warnings. Both runs report zero page/console errors and zero
404s. No unknown material or missing-asset warning was reported.

The baseline's final counts read timed out after recording all three timed
views, all 40 geometry views and the completed soak. That failure remains
in `before/metrics.json`; its counts object is empty. The longer response
wait let the integrated run collect its final counts: 49 playable buildings,
all with entrances, 666 rooms, 73 NPCs and 111 discoveries.

Both navigation soaks completed 98 simulated seconds, 118 legs and three
targets with no stuck events, falls, NaNs or unreachable targets. Their
soak console reports are clean. Timing differences are not evidence of a
speed improvement: this shared software renderer varies between runs. The
controlled hide/restore test above establishes the visible geometry cost.

### Broader geometry sweep

**40/40 views pass both geometry gates before and after.** In both runs the
peak is `door-L06`: **1,663,133 → 1,676,633 triangles** and **1,145 → 1,227
draw calls**. The final peak leaves 823,367 triangles and 573 draw calls below
the scene limits. These single-render samples have no timing/FPS claim.

| View | Before triangles | After triangles | Added triangles | Before calls | After calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| spawn | 1,503,809 | 1,517,561 | +13,752 | 1,075 | 1,155 |
| ridge-looking-south | 1,190,072 | 1,230,540 | +40,468 | 771 | 940 |
| valley-looking-north | 1,323,715 | 1,352,685 | +28,970 | 827 | 938 |
| street-n0 | 1,325,303 | 1,354,273 | +28,970 | 828 | 939 |
| street-n61 | 1,370,883 | 1,383,925 | +13,042 | 732 | 802 |
| street-n122 | 970,088 | 993,416 | +23,328 | 565 | 652 |
| street-n183 | 1,553,780 | 1,569,508 | +15,728 | 839 | 917 |
| street-n244 | 1,382,921 | 1,392,397 | +9,476 | 832 | 894 |
| street-n305 | 1,322,463 | 1,336,011 | +13,548 | 824 | 887 |
| street-n366 | 821,746 | 842,882 | +21,136 | 488 | 577 |
| street-n427 | 1,395,873 | 1,411,603 | +15,730 | 799 | 893 |
| street-n488 | 704,455 | 723,831 | +19,376 | 434 | 518 |
| plaza-P1 | 1,421,936 | 1,435,326 | +13,390 | 699 | 767 |
| plaza-P2 | 1,485,720 | 1,497,722 | +12,002 | 831 | 908 |
| plaza-P4 | 1,231,494 | 1,273,266 | +41,772 | 773 | 951 |
| landmark-mirador | 411,141 | 433,851 | +22,710 | 270 | 348 |
| landmark-virgen | 1,288,097 | 1,314,323 | +26,226 | 789 | 895 |
| landmark-almendros | 1,178,077 | 1,208,151 | +30,074 | 704 | 819 |
| landmark-cancha | 664,669 | 686,113 | +21,444 | 330 | 416 |
| door-L00 | 628,971 | 654,135 | +25,164 | 328 | 404 |
| door-L01 | 703,929 | 729,093 | +25,164 | 367 | 443 |
| door-L02 | 1,474,017 | 1,487,541 | +13,524 | 938 | 1,021 |
| door-L06 | 1,663,133 | 1,676,633 | +13,500 | 1,145 | 1,227 |
| door-L09 | 1,473,573 | 1,489,655 | +16,082 | 976 | 1,057 |
| door-L10 | 1,480,328 | 1,497,832 | +17,504 | 964 | 1,051 |
| door-L11 | 670,739 | 696,965 | +26,226 | 382 | 488 |
| door-L12 | 685,825 | 712,051 | +26,226 | 405 | 511 |
| interior-L00-school | 614,847 | 640,011 | +25,164 | 316 | 392 |
| interior-L01-kiosk | 684,955 | 710,117 | +25,162 | 353 | 429 |
| interior-L02-shophouse | 1,381,424 | 1,394,586 | +13,162 | 774 | 856 |
| interior-L06-apartments | 1,535,448 | 1,548,564 | +13,116 | 869 | 948 |
| interior-L09-clinic | 1,482,816 | 1,498,620 | +15,804 | 935 | 1,017 |
| interior-L10-hall | 1,464,132 | 1,481,698 | +17,566 | 917 | 1,002 |
| interior-L11-workshop | 641,929 | 668,155 | +26,226 | 346 | 452 |
| interior-L12-cornerstore | 655,661 | 681,887 | +26,226 | 354 | 460 |
| interior-L13-house | 665,621 | 691,847 | +26,226 | 373 | 479 |
| interior-L18-unfinished | 1,528,850 | 1,545,486 | +16,636 | 793 | 879 |
| interior-L24-rowhouse | 1,022,975 | 1,049,201 | +26,226 | 602 | 708 |
| interior-L34-tenement | 1,244,873 | 1,264,101 | +19,228 | 669 | 740 |
| interior-L35-courtyard | 1,314,621 | 1,332,733 | +18,112 | 701 | 771 |

## Evidence files

The before/after files below are present. The required after screenshots and
controlled costs come from `tests/vista-shots.mjs` at the same three positions,
viewport and manual stepping sequence as the timing harness. Their triangle
and draw totals match the final timed run exactly. Interrupted exploratory
runs are excluded from the committed comparison.

| Evidence | Before | After |
| --- | --- | --- |
| Metrics, geometry sweep and soak | `before/metrics.json` (partial failure) | `after/metrics.json` (completed; timing/warning gate failures) |
| Spawn screenshot | `before/spawn.jpg` | `after/spawn.jpg` |
| Ridge screenshot | `before/ridge-looking-south.jpg` | `after/ridge-looking-south.jpg` |
| Valley screenshot | `before/valley-looking-north.jpg` | `after/valley-looking-north.jpg` |

Additional evidence: `after/shots.json` contains the controlled visible-cost
comparison; `after/foundation-comparison.json` records the terrain-contact fix.

`contact-near.png` and `contact-far.png` are CPU diagnostic projections of all
48 generated meshes per LOD, with vertex colours, backface culling and depth
testing. They are geometry inspection evidence; the screenshots above exercise
the actual game renderer. Regenerate the sheets without Blender or Chrome:

```sh
node la-ladera/tools/nice.mjs --below python3 la-ladera/tools/blender/vista_contact.py --out .scratch/vista
```


### Additional visual audit

The standard spawn/ridge/valley views contain foreground occlusion and the
existing sunset haze. `after/valley-looking-south.jpg` shows the broken roofline
across the opposite hill. A paired elevated east-edge audit provides a closer
view of the installed kit:

- `before/east-edge-audit.jpg` and `after/east-edge-audit.jpg`: 1280 × 720,
  unchanged game fog/materials/time, debug player feet at (96, 44, -40),
  looking at (164, 24, 0). This is an elevated inspection position, not a
  claimed walkable viewpoint.
- The east-edge audit records **747,079 → 779,391 triangles** and **339 → 450
  calls**: an addition of **32,312 triangles and 111 calls**, with identical
  camera position, yaw and pitch in the two JSON capture reports.
- The south-facing valley capture records **457,155 → 483,381 triangles** and
  **242 → 348 calls** when the vista is hidden/restored in the same frame:
  **26,226 added triangles and 106 calls**.
- `audit-camera.json` records the exact integrated capture step. Use
  `node la-ladera/tests/shot.mjs --q 'autostart&manual&dpr=1' --w 1280 --h 720
  --page --steps la-ladera/dev/vista-kit/audit-camera.json`.
- The visible storeys, roof slabs, rooftop room/tank and retaining strips meet
  their supports. No missing roof face or malformed instance was observed.
  Rebar and washing attachments are inspected in the GLB contact sheets and
  placement tests because they occupy too few pixels in the wide game views.

## Sources and provenance

Geometry is original and procedural, built through the existing furniture
helpers. No reference photographs were redistributed or used as textures, and
no external texture download was needed. Colours and feature frequencies are
art direction rather than surveyed statistics. Reference-photo copyrights
remain with their respective sources; no CC0 licence is claimed for them.

- [Medellín municipal tourism, *Comuna 13: memoria y transformación*](https://www.medellin.travel/wp-content/uploads/2021/01/Guion-Comuna-13.pdf): closely packed brick/painted housing, overlapping rooflines and stair corridors.
- [World Bank / La Paz municipal government, Chapuma and Pokeni aerial and street photographs](https://blogs.worldbank.org/en/latinamerica/scaling-up-neighborhood-upgrading-boost-urban-resilience-bolivia): connected development across steep slopes and narrow access routes; photographs credited to GAMLP.
- [UNESCO, Valparaíso description](https://whc.unesco.org/en/list/959/) and [photograph gallery](https://whc.unesco.org/en/list/959/gallery/): hillside-adapted urban fabric, varied roof heights, painted façades and pedestrian terraces.

Sources consulted on 31 October 2026. See
[`tools/blender/VISTA.md`](../../tools/blender/VISTA.md) for regeneration and the
placement/runtime contract.

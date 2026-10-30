# T3.1 furniture library — 30 October 2026

The furniture gap was the empty manifest and missing model files. The existing
catalogue, furnishing engine and discovery implementation were retained. The
current catalogue has **222 entries**, all now represented by distinct named
assets exported by real Blender 4.5.3 LTS.

Base revision: `5e2caaa62217e1b6c6615befc4374b24db844217`.

## Generated deliverable

| GLB under `assets/models/furniture/` | Assets | Actual bytes |
| --- | ---: | ---: |
| `furn_details.glb` | 58 | 1,435,020 |
| `furn_home.glb` | 54 | 1,153,304 |
| `furn_living.glb` | 53 | 1,484,012 |
| `furn_shop.glb` | 57 | 2,381,960 |
| **Total** | **222** | **6,454,296** |

The 138,331-byte `assets/models/manifest.furniture.json` is present alongside the
files and records every asset's named root, size, footprint, tags, origin,
triangle count and measured bounds. File byte lengths and SHA-256 digests are
included. Models plus manifest total **6,592,627 bytes**, below even a decimal
10,000,000-byte interpretation of the 10 MB budget. The manifest is already
registered by `assets/models/manifest.json`.

The complete library contains 115,380 authored triangles. It uses the existing
named materials and textures, without embedded textures or a new runtime
decoder. The generator reuses the existing living builders and geometry library,
completes the home and shop modules, and adds the small-object/detail module.
This covers every required family and all 14 shop types.

## Pipeline and runtime changes

- Full builds export to a temporary directory and run the independent byte-level
  validator before replacing the library. Missing builders, broken geometry and
  excess payload fail the build. Preview filters cannot overwrite the shipped
  manifest. Installation publishes the manifest last and rolls back caught
  failures; this is an offline workflow, not a crash-atomic live deployment.
- The runtime accepts each named asset only after checking its drawable parts,
  finite geometry, indices and material names. Missing or malformed models keep
  their complete procedural fallback. Failed downloads can be retried, and
  flattened geometry/tint caches are reset for a later preload.
- Model parts continue through the existing material batching, tint, bedding,
  variation, rotation and wall/ceiling placement paths. Decals and fan animation
  retain their procedural components. Discoveries were not the missing work and
  their implementation was not replaced.
- Two existing test-tool portability issues were corrected: missing commands in
  `tools/nice.mjs` return 127 on Linux, and the wrong-case path test accepts the
  case-sensitive host's missing-path diagnostic while still requiring rejection.

Build and maintenance commands are in
[`tools/blender/FURNITURE.md`](../../tools/blender/FURNITURE.md).

## Asset and visual verification

- The real Blender build completed. `furn_validate.mjs --complete` passes
  **222/222** assets and checks actual GLB buffers/accessors, roots, materials,
  finite attributes, indices, geometry aliases, bounds, catalogue metadata,
  digests, coverage and budgets.
- The **24 asset tests** and **10 runtime tests** pass. Corrupt fixture cases
  exercise missing files/roots, aliases, non-finite data, invalid indices,
  unknown materials and metadata mismatches. The runtime tests parse all four
  GLBs with the vendored GLTFLoader and check fallback, retry, transforms,
  flags and tint isolation.
- `furniture-visual.mjs` drew **222 GLB records, 0 stand-ins and 0 failed
  records**. Every model-only render contained visible pixels; all four model
  requests returned HTTP 200. The studio run had zero page exceptions, network
  failures, console errors or warnings. All **nine labelled contact sheets**
  were inspected, including an independent second review.
- `interiors-shots.mjs auto` produced **27 actual-world room captures**. Every
  capture was inspected twice. No concrete new-model scale, orientation,
  floating, clipping or missing-geometry defect was found. Two camera-corner
  selections were marked `ok: false` because the helper found no unblocked
  corner; their images remained usable. There were no application, page or
  network errors. Four Chrome GPU `ReadPixels` performance warnings occurred
  during screenshot capture.

Local evidence is under `.scratch/furniture/`: `build-final.log`,
`visual/report.json`, `visual/furniture-01.png` through `furniture-09.png`,
`rooms.log`, and `rooms/*.jpg`. Per the project contract, screenshots, logs and
downloaded tools are not committed. The scripts reproduce them from the
committed models and manifest.

## Full-world integration and render work

The production page loaded all **222 catalogue assets in four GLBs** and built
**49 buildings**. Per-building counters matched **6,235 GLB furniture
placements**, **1,373 procedural decals** and **0 failed records**. Every
non-decal furniture record used a model. All four GLB requests succeeded.

At high quality, sampled interior groups were visible and the following views
stayed inside the 1,800-call / 2.5-million-triangle limits, including shadows and
postprocessing:

| View | Draw calls | Triangles |
| --- | ---: | ---: |
| Spawn street | 1,174 | 1,937,521 |
| L17 house | 817 | 1,695,629 |
| L06 apartments | 901 | 1,717,992 |
| L08 shophouse | 942 | 1,735,572 |
| L00 school | 322 | 685,607 |
| L09 clinic | 1,000 | 1,699,299 |
| L44 workshop | 796 | 1,449,490 |

The existing engine render checks also passed reversed-Z equivalence, merged
versus unmerged image comparisons, exposure/readability and their stricter
1,500-call budget. The full-world test's final browser-cleanliness result is
recorded with the full regression results below; the placement and render-budget
assertions above all completed successfully.

`tests/payload.mjs` passes every budget: all shipped models 13.54 MiB / 32,
textures 8.78 MiB / 24, total application payload 23.78 MiB / 60, estimated GPU
texture memory 153.33 MiB / 220. No oversized files or unreadable image sizes.

The environment was Linux, Node 24.22.1, Blender 4.5.3 LTS and headless Chrome
136.0.7103.25 using software WebGL. These are correctness, visual and render-work
checks; they do not establish 60 FPS or the target workstation's boot latency.

## Complete regression result

```sh
CHROME_PATH=/path/to/chrome node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 --test-reporter=spec la-ladera/tests/*.test.mjs
```

The complete sequential run reported **369 tests: 360 passed, 8 failed,
1 skipped**, with no cancellations (641.5 seconds). The skip is the Windows-only
`.cmd` wrapper test. This is **not an all-green suite** in this environment.

Every failed leaf assertion contained only Chrome's
`GL Driver Message ... GPU stall due to ReadPixels` in its console-warning
array; its page errors, failed requests and console errors were empty. The
seven failing assertions were audio locked/dry/volume cleanliness, engine
render cleanliness, furniture full-world final cleanliness, glow cleanliness
and UI cleanliness. Node also counts the parent audio test as failed, giving
eight reported failures. The actual behavioral assertions, asset checks,
render comparisons, budgets, UI actions and layout checks passed. The strict
warning assertions remain intact.

For a control, the original revision was archived into an isolated scratch
directory, including its unchanged root browser assets. Its furniture manifest
was still `{ "files": [] }`. Running the original audio `locked` and `gestured`
tests with the same Chrome reproduced **7 reported tests: 3 passed, 4 failed**
(three warning-only leaf assertions plus their parent). The final control had
no page exceptions, failed requests or console errors. This demonstrates that
the same driver warning occurs without the new furniture library. Its complete
diagnostics are in `.scratch/furniture/baseline-audio-controls-complete.log`.

Full diagnostics are in `.scratch/furniture/final-tests.log`. `git diff --check`
passes. There is no application bundler/build command for this native-ES-module
project; the real Blender export is the required asset build.

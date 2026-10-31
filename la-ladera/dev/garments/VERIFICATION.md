# Garment object library — verification, 31 October 2026

## Result and scope

Part A supplies **23 adult garment types, 67 applicable object states and 67
separate LODs**. The generated files and matching manifest are present. The
runtime library is **1,840,059 bytes**, below the strict 2,000,000-byte limit.
Independent structural validation and visual review accepted the final build.

This is an **object/data library**, not live-world placement or wearable
integration. The production registration manifests and all 140 runtime
JavaScript files are unchanged. The four fixture screenshots are labelled
preview assemblies using the real garment GLBs and procedural review furniture.

The branch starts from the fetched `origin/main` commit
`8fa06a5498555afc5dc2b636c06754a4a6b5882c`. A later remote check still returned
that commit. It is earlier than the prompt's described snapshot: its furniture
manifest is empty; it lacks `FEATURE-DRAWERS.md`, `js/interiors/contents.js`,
`js/interiors/finds.js` and a contents test suite. It contains the older
25-figure / 32-clip people set. The furniture pipeline guide and validator were
also inspected on `origin/codex/la-ladera-furniture-library-20261030`, without
merging that branch.

**Part B remains gated** because the replacement figures have not landed on
this base. No people, skeleton, clip or child outfit was modified. Missing find
and drawer contracts are recorded in `assortments.json.deferredBindings`, with
an empty `findIds` list rather than fabricated IDs.

## Coverage

| Family | Garments | States |
|---|---:|---:|
| One-piece costume, trunks, separate bikini top and bottom | 4 | 12 |
| Crop top and T-shirt | 2 | 6 |
| Shorts and lycra leggings | 2 | 6 |
| Soft sun hat, straw hat and cap | 3 | 7 |
| Bra, full-cut underwear, panties, thong, knickers, high-leg knickers, briefs, boxers | 8 | 24 |
| Single sock, pair of socks and tights | 3 | 9 |
| Nightdress | 1 | 3 |
| **Total** | **23** | **67** |

All garments have folded, hung and flat states except the stiff straw hat and
peaked cap, whose folded state is explicitly not applicable. Hat flat states
rest intact. Paired socks retain the size of an individual adult sock.

There are **16 shared colour/print variants** and **12 adult-only assortment
recipes** covering drawers, wardrobes, washing lines and shops. The assortments
use 11 verified host furniture catalogue keys. The 256×256 atlas is original
artwork; no reference product photograph or pattern sheet is redistributed.
The [source notes](../../tools/blender/GARMENTS-SOURCES.md) distinguish shape
references, the CC0 cloth reference and original generated work.

## Geometry and payload gates

| Measurement | Final result | Gate |
|---|---:|---:|
| High-detail state count | 67 | 67 |
| LOD state count | 67 | 67 |
| Packed GLB files | 6 | Three high / three LOD |
| Maximum triangles per high-detail state | 772 | ≤800 |
| Maximum triangles per LOD | 212 | ≤240 |
| Triangles across every high-detail state | 35,694 | Per-item gate |
| Triangles across every LOD state | 10,539 | ≥40% reduction per item |
| Complete runtime garment library | 1,840,059 bytes | ≤2,000,000 bytes |
| Shipped site before this branch | 18,340,621 bytes | Baseline tree |
| Shipped site after this branch | 20,180,680 bytes | ≤60 MB |

The existing payload checker reports **19.25 MiB / 60 MiB**, all budgets passing.
Development screenshots, tools, tests and documentation are excluded by its
existing shipped-payload rules. The garment-specific gate includes the six
GLBs, atlas, palette, assortments and garment manifest.

Every GLB uses the existing `laundry` library material, unit UVs and vertex
colours. There are no embedded/external GLB textures, animations or skins.
Atlas binding is optional data implemented in the preview only. Each state has
measured bounds, size, footprint and a floor-centre or hang-point origin.

The generator uses the existing furniture coordinate/export helpers. Cloth
frames are evaluated sequentially and frozen into static geometry. Sewn front
and back panels leave garment openings clear; folded garments use crease
topology and finite-radius hinges. Folded bras/bikini tops use separately
arranged nested cups, a band beneath and loose straps with controlled clearance.

## Tests

| Check | Result |
|---|---|
| Independent `garments_validate.mjs --complete` | PASS: all 67 states and LODs |
| Garment regression/adversarial suite | **22/22 PASS** |
| Interiors/world suites before | **66/66 PASS**, included in the pinned-base run |
| Interiors/world suites after | **66/66 PASS**, zero skips |
| Complete pinned-base Node-only suite | 288 tests: 285 pass, 2 existing platform failures, 1 Windows-only skip |
| Contents suite | Unavailable on the pinned base; no test was invented or silently skipped |
| Payload checker | PASS |
| Runtime source/registration identity | PASS: 140 JS files and both registration manifests unchanged |
| Game boot with garment GLBs blocked | PASS, including an explicit blocked-fetch positive control |
| Isolated `--only cap` regeneration | PASS: two valid states, four GLBs, 60,315 bytes |

The two existing Node failures are in `live-paths.test.mjs` (on Linux, an
incorrectly cased path is diagnosed as nonexistent rather than another letter
case) and `nice.test.mjs` (a nonexistent executable returns 126 rather than the
asserted 127). They occur on the unmodified pinned test set; neither file was
changed. An earlier mixed run accidentally included the not-yet-built garment
test and was excluded from the accepted baseline evidence.

Adversarial tests reject missing files, invalid indices, NaNs, degenerate
triangles, invalid materials, inaccurate bounds, inadequate LOD reduction,
over-budget libraries, bad sources and invalid assortment assignments. A
missing-file mutation is restored after the assertion. The builder requires a
successful JSON validator report and the exact expected state count before
installing a staged build; an empty subprocess log cannot count as success.

## Visual evidence

The final [visual report](evidence/visual-report.json) contains **86 freshly
captured JPEGs**: 67 garment states, six LOD renders, three rear views, four
fixtures and six overview sheets. All screenshot SHA-256 values and 11 source
hashes were independently checked. The manifest hash is:

```text
e747b9385eba8be601bb937a18e3db8ed887c65d1b115e6af3babdc4af7852f2
```

The harness uses the repository's headless-only Chrome wrapper, the actual
vendored Three.js r180 GLTFLoader and the real material library. It checks
actual triangle counts, nonempty visible pixels and camera visibility. A ray
test checks empty space between trouser legs; it was demonstrated to fail on
the first defective model before passing the corrected exports.

Independent close review found and resolved filled concave cutouts, a detached
cap visor and intersecting folded-cup surfaces. The final images supersede all
earlier iterations. The fixtures use authored garment dimensions without model
scaling. An additional actual-GLB bounds check confirmed all five wardrobe
garments remain inside its walls; the partly obscured nightdress is 128 mm
clear of the right wall, correctly occluded by it from the review camera.

There are no browser, network or console errors in the final visual run. Four
Chrome driver warnings concern `ReadPixels` stalls from the deliberate pixel
occupancy measurements; the run is not described as warning-free.

## Runtime availability and frame-metric limitation

The unavailable-GLB probe is recorded separately in the evidence. It blocks
garment URLs before navigating the unmodified game, requires a rendered frame
and zero game errors, then deliberately fetches a real generated GLB as a
positive control. This proves that Part A does not create a new boot dependency;
it does **not** claim a newly integrated garment loader or placement fallback.

The [final availability report](verification/after/unavailable-glb.json) passed:
the game booted and rendered in 22.42 seconds, with **1,075 draw calls and
1,529,993 triangles at its initial view**. State, page, console and network
error counts were zero; no garment GLB was requested by the game. An explicit
fetch of the present 537,044-byte garment GLB was then rejected, and the raw
CDP event recorded `blockedReason: "inspector"`. Two software-driver ReadPixels
warnings are retained. These initial-view counts are not an all-view benchmark.

The accepted [raw verification files](verification/) include the pinned-base
Node log, focused after-test log, complete asset report, 22-test log, payload
reports, source identity proof, availability result and unsuccessful metrics
JSON. Superseded mixed-test and pre-fix positive-control attempts are excluded.
Only trailing whitespace on blank lines in the copied Node log was normalized;
test names, outcomes and diagnostics are preserved.

`tests/metrics.mjs` was run before and after. The original full run and reduced
diagnostics failed with CDP `Runtime.evaluate` timeouts on the shared host's
SwiftShader renderer, before completing a measured view. The final matched
640×360, one-view, one-second-soak manual diagnostics likewise timed out; the
after run also recorded a 31-second boot against its unchanged 25-second gate.
All original thresholds were retained. **The 12 ms frame target and all-view
draw-call/triangle gates are not certified by these runs.** No FPS or timing
improvement is claimed. Unchanged production code/registration and zero garment
requests establish the scope of this assets-only change, not a substitute
performance result.

## Reproduce

See [GARMENTS.md](../../tools/blender/GARMENTS.md) for complete quiet build,
validation and screenshot commands. Representative final checks are:

```sh
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --complete
node la-ladera/tools/nice.mjs node --test --test-isolation=none --test-concurrency=1 la-ladera/tests/garments.test.mjs
node la-ladera/tools/nice.mjs node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/interiors-*.test.mjs la-ladera/tests/world-*.test.mjs
node la-ladera/tools/nice.mjs node la-ladera/tests/garments-visual.mjs
node la-ladera/tools/nice.mjs node la-ladera/tests/garments-fallback.mjs --json .scratch/garments/unavailable-glb.json
node la-ladera/tools/nice.mjs node la-ladera/tests/metrics.mjs --w 640 --h 360 --views 1 --soak 1 --query manual --json .scratch/garments/metrics.json
node la-ladera/tools/nice.mjs node la-ladera/tests/payload.mjs
```

Chrome must be supplied through `CHROME_PATH` when not found automatically.
This execution environment required sandbox approval for nested Node processes
and local HTTP serving; the existing quiet wrappers were retained unchanged.

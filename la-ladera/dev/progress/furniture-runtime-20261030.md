# Furniture runtime integration — 30 October 2026

The interior renderer already understood the Blender part flags and batched geometry by library material. The missing deliverable was the actual model library, not the discovery implementation.

## Changes

- `js/interiors/build.js` accepts an asset as loaded only when its named node has drawable parts. It validates finite geometry, matching attributes, index ranges and material names before appending any vertices. Missing nodes and rejected models retain their complete procedural furniture. Successful geometry keeps its source vertex colours; tint variants are cloned and cached without mutating the shared GLB. Re-running the preload clears flattened geometry caches.
- `js/core/assets.js` removes rejected requests from its promise cache, allowing a transient download or parse failure to be retried. Concurrent requests for the same file remain deduplicated.
- `tests/furniture-runtime.test.mjs` parses the committed GLBs using the vendored Three.js GLTFLoader and renders them through `buildInterior` in three furnished buildings. Separate regression cases cover missing files and roots, invalid second meshes, unknown materials, retries, part flags, independent variant channels, tint isolation, asset hierarchy transforms, building rotation, wall scaling and ceiling placement.

All source models use centred x/z footprints and y=0 at their base. Wall layout records already include their depth offset. Ceiling placement subtracts catalogue height from the ceiling record's y value. The source geometry therefore uses `floor-centre` for all placement kinds.

## Validation status

Initial run: the integration test correctly failed the original empty manifest (`0` assets, minimum `120`). Final generated-library run: **10/10 tests pass**. The real GLTFLoader parsed **222 named assets in 4 GLBs**; **313 of 380 records** in three furnished buildings used the GLB route, with the other **67 records being decals**. No interior errors were reported.

```
node --import ./la-ladera/tests/register.mjs --test --test-isolation=none --test-reporter=spec la-ladera/tests/furniture-runtime.test.mjs
```

On this Linux/Node 24 environment, the restricted sandbox initially prevented child-process test reporting. `--test-isolation=none` exposes subtests there. The final standard process-isolated test run also passed when launched with the authorized local execution permission; no runtime dependency or source change is required.

## Reproducible visual checks

`tests/furniture-visual.mjs` builds scratch-only labelled contact sheets through the real `buildInterior` and `MaterialLib` code, using one headless Chrome and one WebGL renderer. Every tile contains its catalogue key, width × height × depth, and placement kind. Models use neutral studio lighting and individually fitted views. A model-only render (studio floor hidden) must contain visible pixels; every record must count as GLB geometry with no procedural fallback. The report also requires HTTP 200 for every furniture GLB and no browser errors, warnings or failed requests.

```
CHROME_PATH=/absolute/path/to/chrome node la-ladera/tests/furniture-visual.mjs
```

Default output: `.scratch/furniture/visual/furniture-01.png` onwards plus `report.json`. Optional `--only key,key` supports detailed rechecks; the default checks the complete catalogue. Final browser run passed: **222 GLB records / 0 stand-ins / 0 failed records**, all four model HTTP requests returned **200**, and browser exceptions, console errors/warnings and failed network requests were all **0**. Every tile had visible model pixels (minimum 90 for the thin fluorescent light; the floor was hidden for this check). All nine sheets were inspected by eye, including the corrected first-sheet header background. Required furniture families are represented with distinct silhouettes and details; no broken, flipped or floating model was apparent. The inherited vinyl material is strongly mottled at close range, an existing texture-quality limitation rather than a missing geometry issue.

Existing regression suites `interiors-build`, `core-matlib`, and `core-merge`: 19/19 pass; 42 procedural buildings and 5,811 records render without failures (23 median / 31 maximum material meshes per building).

## Full-world regression

`tests/furniture-world.test.mjs` adds one focused browser test of the complete production page, without restricted lots or skipped stages. It compares each real building's render statistics with its furniture records, requiring every non-decal placement to use a GLB and every procedural placement to be a decal. It checks model HTTP responses, page errors, and draw-call/triangle budgets at spawn and the most furnished house, apartment, shophouse, school, clinic and workshop. Every sampled interior group must be visible. It measures no FPS, so software WebGL remains a valid test environment.

The final full-page run loaded all 222 keys and built 49 buildings: 6,235 GLB placements, 1,373 procedural decals and zero failed records. Every selected interior was visible and all seven views passed the render budgets (maximum 1,174 draw calls and 1,937,521 triangles). The final browser-cleanliness assertion failed solely on Chrome's GPU `ReadPixels` warning; page, network and console errors were empty. See [the lead verification report](furniture-integration-20261030.md) for the complete 369-test result and baseline comparison.

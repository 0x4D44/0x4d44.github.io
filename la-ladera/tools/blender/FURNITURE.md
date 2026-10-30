# Furniture library

The shipped library covers all **222 current catalogue entries**. Four actual
Blender-exported GLBs live in `assets/models/furniture/`; their named roots and
layout metadata are recorded in `assets/models/manifest.furniture.json`.
The manifest is already included by `assets/models/manifest.json`.

Measured results and the current software-WebGL warning limitation are recorded
in [the verification report](../../dev/progress/furniture-integration-20261030.md).

The project is served as native ES modules. There is no bundler or application
build step. Furniture generation is an offline development step; visitors need
only the checked-in GLBs, manifests and existing material textures.

## Regenerate

Run from the repository root with Node and Blender 4.5 LTS or newer on PATH.
The checked-in assets were generated with Blender 4.5.3 LTS. The repository's
quiet wrapper and memory gate also support the original Windows workstation.

```sh
node la-ladera/tools/blender/furn_dump_catalog.mjs .scratch/furniture/catalog.json
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/furn_build.py -- --catalog .scratch/furniture/catalog.json
node la-ladera/tools/blender/furn_validate.mjs --complete
```

`--python-exit-code 1` is important: a Blender Python exception must make the
command fail. `--node /absolute/path/to/node` selects a Node executable when it
is not on Blender's PATH.

The generator loads the existing catalogue and the `furn_assets_living.py`,
`furn_assets_home.py`, `furn_assets_shop.py` and `furn_assets_details.py` builders.
Duplicate registrations, missing builders, empty geometry, non-finite data and
over-budget output fail the build. A complete export is staged and validated
from its actual bytes before installation. The furniture directory is replaced
and the manifest is published last; caught installation failures restore the
previous directory. This is an offline workflow, not a crash-atomic live swap.

For a preview, use a separate output directory. Filtered builds are explicitly
refused when they target the shipped model directory:

```sh
blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/furn_build.py -- --catalog .scratch/furniture/catalog.json --only bed_double,chair_plastic --out .scratch/furniture/preview
```

Do not copy a preview manifest over the complete library. A full build is the
only supported way to refresh the shipped library.

## Coordinates, materials and variants

All source meshes use metres, **+Y up, +Z front**, with their footprint centred
on X/Z and their base at Y=0. This also applies to wall and ceiling model files.
Room placement already positions wall records at their depth offset; the
renderer subtracts the catalogue height from ceiling records. Blender uses an
intermediate `(X, -Z, Y)` frame and its glTF exporter converts back to +Y up.

Catalogue `size`, `footprint` and `tags` remain the source of layout metadata.
Manifest `bounds` records the measured model envelope, including small
fittings. The independent validator permits specific, documented tap/net/vice
and handle allowances; it rejects arbitrary rescaling and overhangs.

Meshes reference the existing material library **by name** and contain metric
UVs and linear vertex colours. No textures are embedded in the GLBs, and no
compression decoder or new production dependency is required. `buildInterior`
uses the loaded model parts through the existing `MeshBuilder` batching path.
Materials and geometry remain shared instead of creating one draw call per
furniture instance.

Part names preserve the existing flags:

- `tint`: multiply that part's vertex shade by the furnishing record's tint.
- `made` / `unmade`: bedding variants selected by the record.
- `magnets`: optional refrigerator decorations.
- `pa0`, `pa1`, and corresponding `pb…` channels: deterministic alternatives
  chosen from the record ID; channel indices must be contiguous.

Ceiling fans export the fixed housing. The existing runtime supplies their
animated rotors. Decals and animations continue to use their existing paths.

If a file is missing, parsing fails, a named root is absent or a model has an
invalid part/material, the corresponding furniture record uses the complete
procedural stand-in. A failed download can be retried. Regression tests exercise
these failures as well as tint isolation and record/building transforms.

## Validate and inspect

```sh
node la-ladera/tools/blender/furn_validate.mjs --complete
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-catalog.test.mjs la-ladera/tests/furniture-runtime.test.mjs
node la-ladera/tests/payload.mjs
```

Validation checks actual buffers/accessors, finite vertices and attributes,
triangle indices, unique named roots, shared-mesh aliases, known materials,
metadata, SHA-256 digests, triangle counts and transformed bounds. The complete
catalogue and all required furniture families/shop types must be represented.
The furniture gate uses the stricter decimal **10,000,000-byte** total and
**8,000,000-byte** per-file limits.

With headless Chrome installed (`CHROME_PATH` may point at its executable):

```sh
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/furniture-world.test.mjs
node la-ladera/tests/furniture-visual.mjs
node la-ladera/tests/interiors-shots.mjs auto .scratch/furniture/rooms
```

The full-page regression boots the complete neighbourhood once and compares
every building's rendered counts with its furnishing records: every non-decal
placement must use GLB geometry, only decals may use the procedural path, and
no record may fail. It also requires every catalogue key to load, successful
furniture-model requests, and no browser or application errors. It renders
spawn and representative furnished houses, apartments, shops, school, clinic
and workshop interiors, requiring their furniture groups to be visible and
each view to stay within **1,800 draw calls / 2.5 million triangles**. It does
not measure FPS, so software WebGL can run the check. The assertions describe
the test's acceptance criteria; its current result comes from the test run.

The visual check writes labelled, dimensioned contact sheets and `report.json`
under `.scratch/furniture/visual/`. It loads the actual GLBs with the in-game
material and batching code, requires every catalogue model to draw, checks
model-only visible pixels, and verifies successful GLB requests and a clean
browser console. Inspect the images: pixel counts alone do not establish visual
quality. The room tour checks placement in the actual neighbourhood.

Keep screenshots, tool downloads and logs in `.scratch/`. Commit the builders,
validators, regression tests, generated GLBs and their matching manifest
together. To run all La Ladera tests without starting multiple browser instances
at once:

```sh
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/*.test.mjs
```

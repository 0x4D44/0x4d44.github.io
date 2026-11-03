# Vegetation library

Fourteen species, 47 meshes and a shared far-tree atlas, totalling approximately
**1.64 MB including the manifest**. The complete validator reports the exact byte
count and enforces a strict **3,000,000-byte** limit.

## Regenerate

From the repository root, with Blender on `PATH`:

```sh
node la-ladera/tests/memgate.mjs 6 300 &&
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python la-ladera/tools/blender/veg_build.py -- --out la-ladera/assets/models
node la-ladera/tools/blender/veg_validate.mjs --complete
```

The checked-in files were exported with **Blender 4.5.3 LTS**. A full executable
path may replace `blender`; quote paths containing spaces. Always use the existing
quiet wrapper and `--background`: generation opens no window and plays no audio.
The generator needs Blender's bundled Python and NumPy; no add-on, npm package,
downloaded scan, graphics device or external image library is required. Use
`--out <temporary-models-directory>` for an isolated regeneration, then validate it
with `veg_validate.mjs --models <temporary-models-directory>`. To also run
`--complete` there, copy `assets/models/manifest.json` into that directory first:
complete validation checks the runtime registration as well as the generated files.

Generation is seeded (`20261031`). It writes all 14
`assets/models/vegetation/*.glb` files, `vegetation/billboards.png`, and
`assets/models/manifest.vegetation.json`. Existing furniture helpers provide the
scene reset, game-to-Blender coordinates, colour conversion, material registry and
GLB export. The fetched starting revision contained `furn_lib.py` and
`furn_build.py`, but not the furniture README or validator mentioned in the task.

## Contents and triangle counts

| Tree | LOD 0 | LOD 1 | LOD 2 | Billboard |
|---|---:|---:|---:|---:|
| Eucalyptus | 2,144 | 600 | 116 | 2 |
| Cypress | 1,868 | 560 | 116 | 2 |
| Palm | 1,952 | 636 | 116 | 2 |
| Banana clump | 1,964 | 552 | 100 | 2 |
| Almendro | 2,144 | 592 | 116 | 2 |

The remaining species are **agave, bougainvillea, potted fern, potted succulent,
climbing vine, window box, flower bed, wild grass and leafy shrub**. Each also has
three LODs. Folded leaves, branching stems, feathered palm fronds, split banana
leaves and overlapping irregular foliage sprays distinguish the species. Tree
canopies use open leaf geometry at every LOD, with no smooth ellipsoid cores.
Pots, soil and
flowers share the same mesh and material as their plant.

## Asset contract

- One GLB per species; each LOD is one independent root mesh with one indexed
  triangle primitive and one material. No leaf nodes, skeletons or animations.
- Mesh names are `veg_<species>_lod0`, `_lod1`, `_lod2`, and, for trees,
  `veg_<species>_billboard`. Coordinates are metres, +Y up, with the soil origin
  at Y=0. Manifest entries include measured bounds, triangles, SHA-256 hashes
  and file sizes.
- Material names are **`flora_vertex`** and **`flora_billboard`**, resolved through
  the existing material library. GLBs contain no textures or image resources.
- `COLOR_0.rgb` stores **linear albedo**; `COLOR_0.a` stores **wind flexibility**
  from 0 (rigid) to 1 (flexible). Vertex alpha is not opacity. Ground attachments,
  pots and window boxes remain rigid. The runtime separates alpha into a wind
  attribute before rendering the RGB vertex colours.
- The external **2560 × 512 RGBA PNG atlas** has five tree tiles, rasterised from
  the exact high-detail meshes with an orthographic depth buffer. This process
  requires no visible renderer. Atlas RGB is sRGB, while PNG alpha is cutout
  opacity. Load it with `SRGBColorSpace` and `flipY=false` for glTF UVs.
- All LODs use the same instance scale derived from LOD 0. Billboard bounds
  contain transparent padding; independently fitting each LOD to its bounds
  would make the tree change size at a switch.

The runtime retains the existing procedural flora whenever the manifest, a
required species or its generated files cannot be loaded. `--complete` is the
release check: it requires every species and LOD, validates actual binary
geometry and wind data, checks the atlas, hashes and material names, and fails on
missing files or a breached library budget. Rendering costs and matched street,
courtyard and vista captures are recorded in the
[verification report](../../dev/evidence/vegetation/README.md).

## Runtime and verification

`js/world/vegetation.js` loads complete species, splits wind weights from colour,
and batches instances by species and LOD. Tree distance bands are 13 / 34 / 80 m
with hysteresis; distant hills use two-triangle billboards. A 26,000-triangle
main-pass budget degrades or culls details, with at most six LOD-0 shadow trees
and sixteen LOD-1 trees. The original procedural paths still consume the same
random stream and retain their colliders. Add `?vegetation=procedural` to force
the fallback for diagnosis. Supplemental planting respects facade features,
terrace furniture, door approaches, occupancy and street navigation clearance.

```sh
node la-ladera/tools/nice.mjs node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/vegetation-assets.test.mjs la-ladera/tests/vegetation-runtime.test.mjs
node la-ladera/tools/nice.mjs node la-ladera/tests/vegetation-views.mjs --out .scratch/vegetation/views --require-library
node la-ladera/tools/nice.mjs node la-ladera/tests/metrics.mjs --json .scratch/vegetation/metrics.json
```

The screenshot harness uses the existing headless-only Chrome driver. Set
`CHROME_PATH` if Chrome is not in a standard location. It verifies all fourteen
species loaded and measures the library's actual triangle and draw-call cost by hiding only its
group in a frozen frame; renderer totals include shadow and post passes.

## Sources and provenance

The [Blender Sapling documentation](https://docs.blender.org/manual/en/3.4/addons/add_curve/sapling.html),
[Poly Haven model catalogue](https://polyhaven.com/models), and
[ambientCG](https://ambientcg.com/) were consulted as source options. The delivered
meshes and atlas are **original parameterised geometry generated by this script**;
they do not embed a Sapling preset, add-on code, a downloaded scan or third-party
texture. Sapling is not an installation dependency. This keeps regeneration
self-contained and the geometry, wind data and complete payload auditable.

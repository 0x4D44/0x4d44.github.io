# Teen garment objects

The teen companion is an **offline object library**: 29 styles in two sizes,
162 applicable states and 162 matching LODs. The generated GLB and manifest are
committed separately from the adult library. The combined integration registers
both companion manifests, generates age/size metadata and preloads their named
LOD roots. See [GARMENTS.md](GARMENTS.md) for the combined contract and checks.

## Files and ownership

- `assets/models/garments/garments_teen.glb`: every teen high-detail and LOD root.
- `assets/models/manifest.garments_teen.json`: named roots, measured dimensions,
  default fabric variants and LOD bindings.
- `assets/models/garments/teen/palette.json` and `fabrics.png`: original external
  256 × 256 atlas with 16 fabric/colour tiles. Nothing is embedded in the GLB.
- `garments_teen.catalog.json`: explicit style and applicable-state catalogue.
- `garments_teen_build.py`: teen pattern construction, shared-size export,
  ordinary glTF packing and staged installation, called by `garments_build.py`.
- `garments_teen_textures.py`: deterministic Python standard-library atlas builder.
- `../../tests/garments-teen.test.mjs`: real-export checks and damaged-export tests.
- `../../dev/garments/teen-evidence/`: actual GLB renders and their source hashes.

`manifest.garments_teen.json` is registered once in `manifest.json`. Runtime keys
are qualified by age to distinguish the child and teen sets; source GLB node
names remain unchanged. Both detail levels are in the same GLB, so select
one named root and one detail level; adding the entire file scene would draw all
324 objects at the origin. Every selected root is identity-transformed, with a
scaled mesh child, so clone the whole root rather than only its geometry.

## Regenerate and validate

From the repository root, with Blender 4.5 LTS or later and Node available:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_build.py -- --teen
node --import ./la-ladera/tests/nice.mjs la-ladera/tools/blender/garments_validate.mjs --teen --complete
node --import ./la-ladera/tests/nice.mjs la-ladera/tools/blender/garments_validate.mjs --all --complete
node --import ./la-ladera/tests/nice.mjs --test --test-concurrency=1 la-ladera/tests/garments.test.mjs la-ladera/tests/garments-teen.test.mjs
```

On Linux where the existing Node command wrapper returns without starting its
child, invoke `nice -n 10 blender` with the same Blender arguments. An empty
wrapper log is not a successful build. The builder requires an actual validation
JSON report and a matching exported-state count before installing the teen set.

For an isolated prototype:

```sh
blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_build.py -- --teen --only denim_jeans --out /absolute/teen-prototype/models
```

Partial builds cannot overwrite the shipped directory. Teen installation replaces
only its own directory, GLB and manifest (last), with rollback on caught failures.
The adult builder preserves the teen GLB/textures when rebuilding adult files.

Set `CHROME_PATH` to a headless-capable executable, then capture the actual files:

```sh
node la-ladera/tests/garments-teen-visual.mjs --out la-ladera/dev/garments/teen-evidence
```

The harness uses the project's headless-only browser driver. It renders all 162
high-detail objects, all 162 LODs and 81 small/big comparisons at the same physical
scale. The 29-style overview is a compact catalogue; the state sheets and
individual renders supply close inspection. `visual-report.json` records source
and screenshot hashes, triangle counts, dimensions and browser errors. These
are asset previews, not screenshots of placement in game rooms.

## Coverage and sizes

| Family | Styles |
|---|---|
| T-shirts | Cream, teal, original geometric sun print |
| Cropped tops | Ribbed sleeveless, boxy short-sleeve |
| Everyday bottoms | Chino shorts, stretch cycling shorts, stretch trousers, denim shorts, straight jeans, joggers |
| Dresses | Short T-shirt dress, knee-length, midi, maxi |
| Outerwear | Hoodie with pocket and empty hood; light jacket with central zip |
| School | White collared polo, grey/navy V-neck jumper, navy/grey trousers and skirt |
| Accessories | Paired socks; structured peaked cap |
| Plain underwear | Full-coverage briefs; boxer shorts |
| Plain swimwear | One-piece swimsuit; swim shorts |
| Footwear | Paired closed school shoes; paired strap sandals |

School clothes are generic white/grey/navy art choices for the requested setting,
without school insignia or a claim to represent a specific school's uniform.
Neutral jersey, denim, knit and twill sit alongside coral rib, lavender, olive,
terracotta, teal and an original sun motif. Fabric variants are metadata, not
extra geometry or separately duplicated meshes.

| Key suffix | Requested age label | Uniform scale of adult-reference pattern |
|---|---|---:|
| `small` | About 12–15 | 0.70 |
| `big` | About 16–19 | 0.90 |

Keys follow `garment_<id>_<small|big>_<folded|hung|flat>`; LOD keys append `_lod`.
The age labels and scale factors describe these props; they are not an apparel
sizing standard. Adult-reference widths and lengths appear in the catalogue and
in the independent `TEEN_DIMENSIONS` constants in `garments_validate.mjs`.
`teenLongestRange(id, sizeClass, state)` supplies the permitted measured range in
metres. Unfolded ranges are ±10% of the reference longest dimension, scaled by
0.70 or 0.90; each folded style has its own explicit parcel range.

The validator decodes position/index bytes, walks child transforms, and rejects
HD **and** LOD pieces outside their ranges. It also checks all axes of the 7:9
small/big ratio, and rejects LOD envelope drift beyond 5% or 2 mm. Metadata cannot
raise the limits or redefine the required key set.

All ordinary clothing has folded, hung and flat states. Socks have folded and
flat states. The structured cap has hung and flat states; its stiff visor is not
folded. School shoes and sandals each have one resting pair in the flat state.
This gives **52 folded + 52 hung + 58 flat = 162** high-detail objects, each with
one LOD.

## Geometry, fabric and payload contract

Coordinates match the adult library: metres, +Y up, +Z front. Flat/folded objects
sit at Y=0 and centre on X/Z; hung objects descend from a support point at Y=0.
Empty sewn panels have neck, sleeve, waist and leg openings. Cloth is simulated
offline with the adult builder's sequential bake, then frozen into static meshes.
Long trousers have a hand-arranged leg-over-leg folded parcel. Folded LODs use
simple closed exterior meshes, with collar/shorts outlines and UVs sampled from
the high mesh, to avoid collapsing overlapping cloth layers into crossing
polygons. Other folded high meshes use the adult finite-radius hinge code.
Coordinate conversion, materials and the Blender GLB exporter are also shared
with the adult pipeline. Flat/hung cloth LODs are separately authored sparse
front/back panels with sewn boundaries. The cap's coarse crown and visor have
matching edge samples, so their join stays intact. Only the solid footwear uses
collapse decimation for its LOD; shoes have empty collars or straps and soles.

Each object is one mesh primitive using the existing `laundry` material, unit
UVs and vertex fold shading. Shared mesh children supply the two sizes; the three
T-shirt styles also share geometry. Core glTF storage retains float32 positions
and normals, with normalized uint16 UVs and uint8 colours. No compressed-geometry
decoder, required extension, external buffer, skin or animation is needed.

The new fabric atlas is optional external colour data. Use a white multiplier,
retain vertex colours, and inset the selected 4 × 4 atlas tile by two pixels.
The preview demonstrates the binding. Without the atlas, use the variant's
colour tint; the printed sun requires the atlas. No runtime material is added.

Hard limits are **800 triangles per detailed object**, **240 per LOD**, and at
least 40% fewer LOD triangles. The strict **700,000-byte total** includes the GLB,
manifest and every file in `garments/teen/`, including accidental unreferenced
files. Development renders, tests and sources are outside that runtime payload.
The adult set retains its independent 2,000,000-byte budget.

## Acceptance evidence

See `../../dev/garments/TEEN-VERIFICATION.md` for the completed build's sizes,
validator output, tests and independent review. The Node suite copies the real
export to temporary directories and damages it, then runs the *same acceptance
checks* as child test processes. Missing keys, oversize HD/LOD pieces, extra
triangle primitives and excess payload must each produce exit code 1; the clean
export must pass. Checked-in source assets are never left damaged.

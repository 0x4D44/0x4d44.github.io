# Child garment objects

Twenty original everyday designs for approximately ages 6–10 extend the adult
object library. They use the same `laundry` material, GLB 2 format, metre units,
vertex shading and unit UVs. The adult files remain independent. These are stored
garment objects without bodies, skins or animations.

## Rebuild

From the repository root with Blender 4.5 LTS or newer and Node available:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_child_build.py --
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/blender/garments_validate.mjs --child --complete
node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/interiors-garments.test.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/payload.mjs
```

Use `--out /absolute/isolated/models` for an isolated build. The builder stages
the entire child set, checks the exported bytes with the same validator, then
installs the child directory and manifest. It never installs its temporary
copies of the adult palette or atlas. Do not run a visible Blender window. In an
environment that blocks child processes, request the execution permission rather
than accepting an empty log as a successful build.

## Catalogue and generated metadata

`garments-child.catalog.json` is the editable source. Every ID begins with
`child_`; every record has `sizeTag: "child"`, `scale: 0.6`, nominal `width` and
`length`, and an `adultReferenceLength`. The nominal child length equals exactly
60% of that reference. The top-level age range is `[6, 10]`. Pattern dimensions
describe empty garments; this is an art scale convention rather than a size
chart for real clothing.

The generator builds the reference geometry, applies the uniform 0.6 scale, then
measures each finished state. `manifest.garments-child.json` records those actual
`size`, `bounds`, `footprint`, triangle counts and LOD bindings. Runtime data in
`js/interiors/garments_data.js` comes from `tools/garments_data.mjs`; never edit the
generated module directly.

The set contains school shirt and polo, pinafore, school trousers and shorts,
T-shirt, hoodie, jeans, pleated skirt, dress, pyjama top and bottoms, cardigan,
socks, shoes, cap, backpack, swimming shorts, one-piece costume and rash vest.

## Model contract

- Asset keys: `garment_<child_id>_<folded|hung|flat>`; LOD nodes append `_lod`.
- Six packed files live in `assets/models/garments-child/`:
  `garments_folded.glb`, `garments_hung.glb`, `garments_flat.glb` and their
  separate `_lod.glb` equivalents.
- Seventeen soft designs have all three states. Shoes, cap and backpack have
  flat and hung states with an explicit physical reason for omitting folded.
  There are 57 high detail and 57 LOD assets.
- Coordinates are +Y up and +Z front. Flat/folded items sit at Y=0 and are centred
  on X/Z. Hung items descend from a top support at Y=0.
- Each asset is one `laundry` mesh primitive. No GLB embeds images, texture
  bindings, armatures, skins, morph targets or animation.
- High detail is capped at 900 triangles; separate LODs are capped at 240 and
  remove at least 40% of triangles. The interior loader uses the LOD objects.
  LOD normals split across 50-degree creases after decimation so thin sewn rims
  do not average front and back normals across a large sleeve or hem face.
- The complete child runtime library has an additional 2,500,000-byte gate.
  Validation conservatively includes the shared palette and atlas in that total.

## One shared atlas

Both sets refer to the existing `assets/models/garments/prints.png` and
`palette.json`. No child texture file is generated. The 256×256 RGBA8 atlas uses
349,524 bytes including the complete mip chain, below the child's 6,000,000-byte
GPU texture cap. A consumer that binds the atlas must use the palette's tile
selection, white multiplier and two-pixel inset; the existing tint fallback
continues to work.

## Placement and provenance

Child drawer/wardrobe recipes and the school locker recipe are generated into
`garments-child/assortments.json`, with explicit `roomKinds` and child size tags.
See [child room and school locker placement](../../dev/garments/CHILD-PLACEMENT.md)
for the runtime selection policy, and [original sources and CC0 dedication](GARMENTS-CHILD-SOURCES.md)
for provenance. Only generated geometry and the existing original palette are
used; there are no imported models or branded motifs.

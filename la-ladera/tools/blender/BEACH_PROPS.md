# Beach props library

An original, dormant asset library for La Ladera's Colombian beach and promenade.
There are **97 catalogue items and 97 explicit far LODs**, packed into three GLBs.
The player-facing detail is authored for a 1.6 m eye height; the review pipeline
also shows every item beside a 1.8 m reference figure.

`assets/models/manifest.beach_props.json` is deliberately absent from
`assets/models/manifest.json`. The library adds no game import, boot request,
world placement, collider, light or NPC behaviour. Integration is a separate
change, with its own scene and performance checks.

## Contents

The machine-readable source is [beach_props.catalog.json](beach_props.catalog.json).
The generated manifest adds bounds and triangle counts measured from the actual
exported binary, plus byte counts and SHA-256 pins.

| Group | Items | Contents |
| --- | ---: | --- |
| Parasols | 12 | Six striped colour/pole variants, each open and furled; three steel and three wooden poles |
| Seating | 5 | Two loungers and three chairs in plastic, wood/canvas and folding steel |
| Towels | 24 | Twelve original prints, each flat and draped over a wooden chair |
| Small beach props | 13 | Four canvas bags; cool box, thermos, flip-flop pair and two singles, bucket/spade, sandcastle, buried ball and deflated pool ring |
| Volleyball | 2 | Court with posts, boundary rope and a 12-triangle alpha net; separate ball |
| Vendors | 4 | Palm-thatch kiosk, juice/cocada cart, cooler stand and sign easel |
| Spanish signs | 10 | Zona de baño, Bandera roja, Prohibido el paso, Cocadas, Ceviche, Jugos naturales, Helados, Alquiler de tablas, Cooperativa de pescadores and Salvavidas |
| Lifeguard equipment | 4 | Raised tower with ladder and mast; rescue buoy, first-aid box and red flag |
| Promenade | 10 | Bollard lamp, bench, bin, bike rack, fountain, railing, three sizes of sea-wall steps and shower |
| Shore | 11 | Three groyne rocks, sea-wall stones, three driftwood variants, stranded net/floats, seaweed, conch and scallop |
| Palms | 2 | Small and large coconut palms, with separate crown subtrees |

The packed files are `beach_props/beach_leisure.glb`,
`beach_props/beach_civic.glb` and `beach_props/beach_shore.glb`, relative to
`assets/models/`. Each file contains both LODs for its catalogue entries.

### Library limits

| Resource | Limit |
| --- | ---: |
| Near item | 2,000 triangles |
| Kiosk or lifeguard tower near item | 3,000 triangles |
| Bollard lamp near item | 150 triangles |
| Far item | At most 40% of its corresponding near triangle count |
| All library GLBs together | 3,000,000 bytes |
| All three atlas maps together | 6,000,000 bytes |
| Atlas resolution | 2,048 × 2,048 pixels per map |

The complete independent gate measures **1,429,460 GLB bytes** and **2,473,749 texture
bytes**: 47.6% and 41.2% of their respective decimal-byte budgets. Seven mesh
resources are shared by actual exported nodes. The checked-in manifest and
[verification evidence](../../dev/beach_props/README.md) record the measurements.
The existing project payload limits in `dev/CONTRACT.md` and `tests/payload.mjs`
remain additional gates. Library budgets do not reserve room in any future view.

## Regenerate quietly

Run from the repository root with **Node 22.16.0** and **Blender 5.x** on `PATH`.
The texture generator uses Python's standard library, with no downloaded image
or font dependency. Only the review-sheet compositor needs host Python with
Pillow; it does not run inside Blender.

```sh
node --version
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/beach_props_build.py
node la-ladera/tools/blender/beach_props_validate.mjs --complete
node la-ladera/tests/beach-props-assets.test.mjs
node la-ladera/tests/beach-props-mutations.mjs
node la-ladera/tests/payload.mjs
```

`tools/nice.mjs` imports `tests/nice.mjs`, lowers process priority, and launches
children with hidden windows and piped output. Blender runs in background mode.
None of these commands requires mouse input, audio output or a visible window.
Append `-- --node /absolute/path/to/node` to a Blender build command when Blender
cannot find the intended Node executable.

The builder stages all GLBs, atlas maps and the manifest outside the shipped
asset tree, then runs the independent validator. Before installation it copies
each result to a temporary sibling of its destination; publication and rollback
use renames on that destination's filesystem. It installs the manifest last and
restores previous owned files if installation raises an exception. A failed
validation leaves the installed library untouched.

### Geometry iteration and partial previews

For a geometry-only rebuild, reuse an existing atlas without bypassing its
dimension, decoded-raster, byte-count or SHA-256 checks:

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/beach_props_build.py -- --atlas-from la-ladera/assets/textures/beach_props
```

Use `--counts` to inspect authored triangle counts without exporting. When
intentional metadata changes alter the source dictionaries, regenerate the
catalogue explicitly with `--write-catalogue`; otherwise the builder rejects a
catalogue that differs from those dictionaries.

Filtered previews require a separate output directory:

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/beach_props_build.py -- --only beach_kiosk,beach_lifeguard_tower --out /tmp/beach-preview/models --atlas-from la-ladera/assets/textures/beach_props
node la-ladera/tools/blender/beach_props_validate.mjs --models /tmp/beach-preview/models
```

`--only` requires output outside the production `assets` tree. Any custom output
that aliases a production model, texture or manifest destination is rejected.
A partial manifest has `complete:false`, and `--complete` rejects it. Preview
directories and raw renders are working intermediates.

## Geometry and naming contract

Coordinates are **metres, +Y up and +Z front**. Each root has an identity
transform and is located at the base centre of its nominal footprint, on the
ground datum `y=0`. World sea level `y=-1.20` is a placement concern; it is not
baked into these assets. The catalogue's `size` is `[width, height, depth]` and
`footprint` is `[width, depth]`. Exact measured AABBs are recorded separately;
small fittings have the same 2 cm envelope tolerance as the vehicle pipeline.

Roots are `beach_<id>` and `beach_<id>_lod1`. Near metadata explicitly names its
`lod1`; the consumer draws one of them at a time. These are authored far
silhouettes, preserving major openings, support heights and moving pivots while
omitting close-range trim, small slats, hardware and folds. Distances, culling
and hysteresis are chosen and measured during world integration.

Moving parts are real child subtrees named
`<root>-pivot_<name>`. Their translations and local axes are identical in both
LODs. Catalogue `pivots` records each `position`, rotation `axis` and intended
`motion` (`rotate`, `hinge`, `flap` or `sway`). Examples include cart wheel axles,
canopy and warning-flag fabric, cooler and first-aid lids, the tower's rear flap,
parasol canopies and palm crowns. The library contains no animation clips or
runtime drivers. Animate the declared subtree about its pivot, without baking
it into the stationary mesh.

Repeated cart wheels share exported mesh data. Repeated world pieces are supplied
as reusable roots: the three rocks, sea-wall stones, railing, seaweed and palms
carry `instance:true`. Place those roots through the existing material batching
or instancing machinery. Preserve pivot subtrees for moving parts; avoid making
one independently loaded GLB or one unique material per occurrence.

### Anchors

Catalogue and manifest anchors use the same root-local game frame as geometry.
Apply the instance transform once to positions and yaw. Yaw is in radians,
with zero facing +Z and positive yaw turning toward +X.

| Anchor | Meaning |
| --- | --- |
| `seats[]` | `position` is the supported seat location, `yaw` faces the seated person, and `seatHeight` is the support height above the root datum |
| `lie[]` | `position` is the centre of the resting area; `length` and `width` describe usable space; at yaw zero, feet point +Z and the head is toward −Z |
| `light` | Emission position and normalized RGB colour; the lamp does not create a live light by itself |
| `hinges[]` | Named moving part, hinge position and local rotation axis; matches the corresponding pivot |
| `hands[]` | Left/right cart handle grip positions for the operator's hands |
| `keepOut` | Root-local `[x,z]` polygon reserving the kiosk, tower or volleyball court and their immediate clearance |
| `menuSlot` | Kiosk board position, usable size and facing yaw for a replaceable menu |
| `watch` / `volley[]` | Suggested standing positions and facing directions for later NPC work |

These are attachment and planning data. They do not create nav obstacles,
collision geometry, interaction prompts or pose alignment automatically.

## Shared PBR atlas

All assets share one **8 × 8 atlas layout** with 256 px cells and 8 px extruded
gutters. `beach_props_atlas.py` generates the three maps below in
`assets/textures/beach_props/`. The manifest records the symbol-to-cell mapping,
inner UV rectangles, exact Spanish sign strings and every map's SHA-256.

| Map | Binding |
| --- | --- |
| `albedo.png` | sRGB base colour; RGBA, with cutout alpha for palm fronds, seaweed and net cells |
| `normal.png` | Linear tangent-space normal, +Y/OpenGL convention |
| `orm.png` | Linear packed channels: R occlusion, G roughness, B metalness |

GLBs contain **no images or embedded textures**. They expose material names
`beach_props` and `beach_props_alpha`; the dormant manifest describes their
shared map bindings. A later Three.js adapter must bind all three maps, use
white base colour and roughness/metalness multipliers of one, and use the
existing UV set for occlusion. Both materials are double-sided. Opaque geometry
uses `OPAQUE`; foliage and nets use `MASK` with cutoff **0.5**, not blended
transparency. This avoids sorting the net and crown cards as translucent objects.

Atlas cell coordinates are **bottom-origin game UVs**, matching the vehicle
library's external-texture convention. Blender source UVs are preflipped so its
glTF export produces those game coordinates. Bind external Three textures with
the matching bottom-origin orientation; do not copy a `flipY:false` binding from
an embedded glTF texture without checking it. A Blender re-import reverses V
again, so the review renderer explicitly undoes that import conversion once per
shared mesh. A known readable Spanish sign is a useful visual orientation check.

Twelve towel prints, six parasol stripe palettes and four bag designs occupy
different cells of this shared atlas. Recolour or select a cell during authoring;
do not duplicate the atlas for each colourway. Normal and ORM maps use precisely
the same cell layout as albedo.

## Independent checks and visual evidence

`beach_props_validate.mjs` decodes exported accessors and node transforms rather
than trusting the builder's counts. It verifies finite positions and normals,
index ranges, nondegenerate triangles, winding, padded UV cell containment,
metre bounds, roots, pivot subtrees, LOD pairing, the 40% limit, the lamp cap,
shared mesh data, exact 12-triangle near volleyball net, decoded PNG data,
SHA-256 pins, byte budgets and omission from the active model registry.

Text pins are calculated after converting CRLF to LF. A checkout with
`core.autocrlf=true` therefore has the same catalogue hash. Binary GLB and PNG
pins always describe their exact bytes.

Every asset test has a deliberate broken-input case. The companion mutation
harness first requires the ordinary suite to pass, then runs each selected test
against its matching corruption and requires a failure. Final acceptance output
and the mutation descriptions belong in the PR evidence; this document does
not substitute an authored count for an exported-binary result.

The review scripts import the **exported GLBs**, bind the shared PBR maps and
render every near item in two views: detail and beside the 1.8 m figure. Both
cameras remain at **1.6 m**. Run them at low priority:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/beach_props_render.py -- --scratch /tmp/beach-props-renders
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/blender/beach_props_contact.py --scratch /tmp/beach-props-renders
```

The compositor produces numbered PNG contact sheets, a high-quality JPEG catalogue and a
`review-index.json` linking every item to its cells, camera data and source
hashes. `--resume` on the renderer reuses only images pinned to unchanged
inputs. A filtered render is a preview and cannot be labelled complete.
Inspect the sheets by eye; their existence alone does not establish visual
approval. The world scene, water interaction, NPC poses, runtime performance
and LOD transition appearance require later integration verification.

## Sources and licence

Geometry, textures, lettering and prints are original procedural
**CC0-1.0** designs. No external mesh, photographed texture, manufacturer badge,
real logo or downloaded font is included. The builder follows the existing
furniture/vehicle geometry and export conventions, and the task-specific beach
design in `dev/FEATURE-BEACH.md` sections 1.4, 4.4 and 7. The generic first-aid
pictogram uses white on green.

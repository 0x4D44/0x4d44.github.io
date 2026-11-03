# Exterior kit: dormant asset library

An original library of **65 exterior designs**, each exported at near detail and
LOD1, with a shared prop atlas and twelve seamless wall-material sets. It supplies
the rooftop equipment, washing, exposed services, planting, rejas and unfinished
construction that break up repeated flat facades.

This is an **offline asset library**. Nothing under `la-ladera/js/`, the production
model/texture registries, boot manifests, existing tests or budget files is changed.
The two illustrative review scenes are assembled in Blender from the exported
GLBs. Runtime integration in the game is **untested**.

## Contents

| Family | Designs | Included features |
| --- | ---: | --- |
| Water tanks | 14 | Blue/black, 500/1,000/2,000-litre families, steel/block stands, two raised stands, ribs, shoulder, lid, float/inlet pipe and outlet/feed pipe |
| Laundry | 4 | Balcony line, long roof line, rotary dryer and pole-and-rope line; shaped garments, cloth folds and pegs |
| Dishes and aerials | 5 | Three dish diameters, Yagi and bow-tie aerials |
| Exposed reinforcement | 6 | Three lengths crossed with two levels of rust |
| Gas cages | 2 | Single- and double-cylinder cages with pipas |
| Exposed services | 8 | Straight, elbow, tee and bracket pieces for both pipework and drains |
| Meters and transformer | 3 | Single/triple meter boxes with cable bundles; pole-mounted transformer assembly |
| Cable segments | 2 | Thin and bundled 0.5 m components for later instancing along swags |
| Menu board | 1 | Framed chalkboard with a dedicated blank, writable atlas cell |
| Window grilles | 8 | Distinct reja patterns |
| Shutter boxes | 3 | 1.0, 1.8 and 2.6 m widths |
| Ledge plants | 6 | Sansevieria, aloe, fern, geranium, croton and pothos |
| Breeze-block lattices | 3 | Square, diamond and flower patterns |
| Wall materials | 12 | Six painted-plaster colours, tolete brick, damp tolete brick, mortar-jointed cement block, baldosín, streaked rough render and whitewash |

The requested wall list describes eleven finishes while specifying twelve sets.
The twelfth is a second, damp/weathered tolete-brick finish. Tank capacities are
visual family labels; these are generic scenery designs, not volumetric or
manufacturer-certified reproductions.

## Files and conventions

| Path, relative to `la-ladera/` | Purpose |
| --- | --- |
| `tools/blender/extkit.catalog.json` | Authored design parameters, metre envelopes, features and placement anchors |
| `tools/blender/extkit_build.py`, `extkit_geometry.py` | Headless procedural Blender construction and packed GLB export |
| `tools/blender/extkit_textures.py`, `extkit_texture_codec.py` | Original deterministic surfaces and compressed wall-texture writer/review decoder |
| `tools/blender/extkit_validate.mjs`, `extkit_texture_codec.mjs` | Independent binary inspection, completeness, hash, geometry, texture, anchor and budget gates |
| `assets/models/extkit/extkit_near.glb` | Every near-detail root in one texture-free GLB |
| `assets/models/extkit/extkit_lod.glb` | Every simplified root in one texture-free GLB |
| `assets/models/extkit/materials.json` | External material definitions, shared atlas cells and twelve PBR wall sets |
| `assets/models/manifest.extkit.json` | `libraryOnly`, completeness, measured geometry and complete payload hash inventory |
| `assets/textures/extkit/` | Shared prop atlas planes and wall-material KTX2 mip chains |
| `tests/extkit-assets.test.mjs`, `tests/extkit-mutations.mjs` | Acceptance/corrupt-input tests and exact-test mutation proof |
| `tools/blender/extkit_contact.py`, `extkit_sheets.py` | Actual-file Blender review renders and labelled contact sheets |
| `dev/extkit/VERIFICATION.md`, `logs/` | Fresh command transcripts, results and limitations |

Geometry follows the furniture/substation convention: **metres, +Y up, +Z front**,
root at the floor of the centred X/Z footprint. `size` is `[width,height,depth]`.
Near roots use the catalogue ID, and the matching LOD root adds `_lod1`.
The GLBs contain external material names, positions, normals, UVs and vertex
colours; they contain no images, texture objects, animation, skins or runtime
loader code. The independent validator reads actual binary vertices and indices
instead of trusting manifest counts.

## Placement anchors

Every catalogue record contains `anchors` with the following fields. They are
data for a future building-placement task; the library performs no placement.

| Field | Meaning |
| --- | --- |
| `wallSide` | `rear` for the piece's local -Z mounting side, `floor` for standing pieces, or `pole` for a pole attachment |
| `heightRange` | Recommended interval in metres for the asset root above the local supporting floor or roof surface |
| `wallClearance` | Additional clearance in metres between the rear clearance plane and its supporting wall |
| `facadeZones` | Suitable building zones drawn from `back`, `side`, `roof` |
| `position` | Local `[x,y,z]` reference on the measured near-geometry rear clearance plane, or the floor origin for standing pieces |
| `normal` | Local direction pointing towards the supporting surface |

For a wall-facing piece, rotate local +Z outward from the chosen wall, then
place its local rear clearance reference against the wall plus the declared clearance.
Use the root's height interval relative to that building's own floor or roof,
not a global elevation. These measured references avoid adding the unused depth
of a larger catalogue envelope to the stated clearance. For plants the reference
includes rear foliage; it is not the shelf's bolt plane. Detailed fitting of
ledges, foliage and wall supports belongs to the later placement task. The pole transformer requires a separate pole; it does
not include one. Tank stands and plant ledges are included in their meshes.
Cable segments are short references; later integration should instance them
along a chosen sag curve. The review scene demonstrates that idea with repeated
GLB meshes, without adding long span meshes to the library.

## Texture binding and memory

Props use one shared 4×4 colour atlas and corresponding normal and ORM planes.
Atlas UVs are already packed into the cell rectangles recorded in `materials.json`;
do not apply the cell transform twice. Follow the same exported V orientation as
the substation library. Colour is sRGB; normal and ORM are linear. Multiply the
colour texture by the linear vertex colours; a primitive without `COLOR_0`
uses a white multiplier. ORM channels are ambient occlusion,
roughness and metallic. The chalk cell is blank, and no piece or texture contains
unreviewed lettering. Human-readable catalogue and review labels are Spanish.

Each wall finish has **three 1024×1024 maps and a complete mip chain**. Loading
36 such maps as RGBA8 textures would exceed the requested 40 MB library budget.
The wall sets therefore use standard KTX2 containers with lossless ZLIB
supercompression over native GPU blocks:

| Plane | GPU format | Interpretation |
| --- | --- | --- |
| Albedo | BC1 sRGB | Colour, no alpha |
| Normal | BC5 UNORM | Tangent-space X/Y in R/G; reconstruct positive Z as `sqrt(max(0,1-dot(xy,xy)))` |
| ORM | BC1 UNORM | Linear AO, roughness, metallic |

ZLIB only reduces disk/download bytes; it is inflated before compressed GPU
upload. The validator measures every mip's actual BC block size, plus conservative
RGBA8-with-mipmaps residency for the prop atlas. Its GPU estimate assumes **all
twelve wall sets and all atlas planes are simultaneously resident**.

Future integration must supply KTX2 inflation/native compressed upload, verify
the required GPU format support and reconstruct the BC5 normal's Z component.
The game currently has no new loader or material binding for this kit. An
uncompressed fallback would have a different memory cost and has not been
implemented or budget-approved. The unchanged global payload checker does not
decode KTX2; `VERIFICATION.md` separately adds the independently measured wall
block memory to its existing GPU estimate.

## Reproduce

Use Node **22.16**, Blender **5.x**, and a system Python with NumPy and Pillow
supporting DDS BC1/BC5 encoding. Launch all Blender work headlessly through the
existing low-priority wrapper, with two threads. The commands in the fresh logs
record the exact executables used for this contribution.

```sh
node la-ladera/tests/payload.mjs
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/blender/extkit_textures.py --preview la-ladera/dev/extkit
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/extkit_build.py --
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/blender/extkit_validate.mjs --complete
node la-ladera/tools/nice.mjs --idle node --test --experimental-test-isolation=none --test-concurrency=1 la-ladera/tests/extkit-assets.test.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/extkit-mutations.mjs
node la-ladera/tests/payload.mjs
```

For review images, supply an absolute scratch directory for the individual
renders. Only the assembled contact sheets, two views and evidence reports need
to be committed. Individual filenames in `contact-report.json` identify those
reproducible scratch renders; all 130 views appear in the twelve committed sheets.
Blender uses system Python to decode the shipped compressed
wall maps for its previews; Pillow is not required inside Blender itself.

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/extkit_contact.py -- --out /absolute/scratch/extkit-renders
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/blender/extkit_sheets.py --renders /absolute/scratch/extkit-renders --out la-ladera/dev/extkit
```

Contact images use individually framed orthographic cameras so small fittings
remain legible. Their labels report metre dimensions and actual triangle counts.
Both larger perspective views use cameras exactly **1.60 m** above their walking
surfaces. They use the exported GLBs and decode the shipped compressed wall maps;
they are not beauty renders of a different source mesh.

## Deliberately unverified

Runtime placement, production Three.js material binding, native KTX2 upload,
GPU compatibility, game draw calls/frame time, boot/load timing, collisions,
player occlusion, wind/cloth animation and interactive chalk writing are not
tested or implemented by this dormant library. The static laundry has no cloth
simulation. No game performance claim follows from the offline Blender renders.
Review-scene architecture is illustrative, not a proposed change to the barrio.
See [LICENSE.md](LICENSE.md) for the original-work and CC0 note.

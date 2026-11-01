# Parked vehicle library

Ten designs ship as **20 actual GLB roots**: one near and one `_lod1` model each.
`vehicles/vehicles_road.glb` is 1,134,056 bytes; `vehicles/vehicles_street.glb` is 930,260 bytes.
The shared 1024 × 1024 paint PNG
is 412,617 bytes. Including `manifest.vehicles.json`, the complete payload is
**2,501,472 bytes**, below the decimal 3,000,000-byte limit.

The [manifest](../../assets/models/manifest.vehicles.json) records file hashes and binary-derived bounds.
Dimensions below are nominal catalogue envelopes in metres. The manifest records exact
binary bounds; the validator allows up to 2 cm for small fittings such as mirrors.

| Design / key suffix | Width × height × length | Near triangles | Far triangles |
| --- | --- | ---: | ---: |
| `hatchback_a` | 1.75 × 1.53 × 3.90 | 4,878 | 508 |
| `hatchback_b` | 1.75 × 1.58 × 3.90 | 4,880 | 508 |
| `pickup` | 1.86 × 1.82 × 4.70 | 3,756 | 530 |
| `chiva` | 2.20 × 3.15 × 6.60 | 5,500 | 600 |
| `colectivo` | 2.08 × 2.64 × 5.80 | 5,188 | 540 |
| `motorbike` | 0.72 × 1.30 × 1.95 | 4,968 | 464 |
| `tricycle` | 1.28 × 1.30 × 2.50 | 5,106 | 544 |
| `handcart` | 1.24 × 1.20 × 2.10 | 3,332 | 340 |
| `bicycle` | 0.54 × 1.12 × 1.74 | 3,364 | 332 |
| `rubbish_cart` | 1.18 × 1.58 × 1.70 | 1,780 | 264 |

## Regenerate quietly

From the repository root, with Node and Blender **4.5 LTS or newer** on PATH
(the shipped files use Blender 4.5.3 LTS):

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/vehicles_build.py
node la-ladera/tools/blender/vehicles_validate.mjs --complete
```

The generator reuses `furn_lib.py` geometry and Blender's glTF exporter.
`vehicles.catalog.json` defines dimensions, wheels and paint; `vehicles_geometry.py`
builds shapes; `vehicles_atlas.py` generates the PNG with Python's standard library.
Append `-- --node /absolute/path/to/node` to select Node when absent from Blender's PATH.

The export, atlas and manifest are staged and validated before installation.
The manifest is published last; caught failures restore previous files.
Filtered previews require a separate directory and cannot replace the shipped library:

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/vehicles_build.py -- --only vehicle_chiva,vehicle_bicycle --out .scratch/vehicles/preview/models
node la-ladera/tools/blender/vehicles_validate.mjs --models .scratch/vehicles/preview/models
```

Preview manifests carry `complete:false`; `--complete` rejects them. Checked-in GLBs
and PNG load through native ES modules: **no build step or runtime Blender dependency**.

## Asset and material contract

Roots are `vehicle_<design>` and `vehicle_<design>_lod1`, in metres with **+Y up,
+Z front**, centred footprints and a base at Y=0. Each wheel has an independent
`<root>-wheel_<position>` pivot with its axle along +X, fixed between LODs.
Shared wheel mesh data saves bytes; triangle measurements count every drawn instance.

GLBs contain no images or textures. Material names resolve through `matlib.js`;
`vehicle_paint` selects `assets/textures/vehicles/paint.png` through the texture manifest.
Its 16 tiles have eight-pixel gutters. UVs use bottom-origin game coordinates;
the builder preflips V before Blender's exporter flips it back. The validator
checks tile containment and the intended paint tile. Paint variants, rust, mud
and chiva decoration share this one atlas.

## Runtime and fallback

`world/vehicle-library.js` requires both loaded GLB roots before replacing an
existing procedural vehicle. Missing files, missing roots or rejected geometry
retain the original vehicle; `?vehicles=0` selects that fallback explicitly.
Parked wheel/body parts merge by library material and instance by design/LOD.
Paint choices preserve shared materials. Vehicles receive shadows but omit their own shadow pass.

Near detail switches at **19 m**, far detail ends at **115 m**, with **2 m
hysteresis**, measured from the conservative bounding sphere's surface. One LOD
draws at a time. Added vehicles use catalogue footprints, terrain pitch and
projected clearance, checking doors, nav routes, walls and street widths.
Colliders and occupancy reservations follow that envelope; large vehicles are never scaled to fit an alley.

## Verify and inspect

```sh
node la-ladera/tests/vehicles-assets.test.mjs
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vehicles.test.mjs
```

The 16 asset tests cover malformed buffers, missing files/LODs, false completion,
wheel pivots, atlas corruption/V reversal, hashes and payload limits.
Three street captures, before/after world checks, per-view triangle costs and
performance limitations are documented in [verification evidence](../../dev/vehicles/README.md).

## Sources and licence

Geometry and atlas are original procedural **CC0-1.0** designs. Material references:
ambientCG [Painted Metal 001](https://ambientcg.com/view?id=PaintedMetal001) and
[Rubber 002](https://ambientcg.com/view?id=Rubber002); Poly Haven
[Green Metal Rust](https://polyhaven.com/a/green_metal_rust) and [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal).
See the [ambientCG licence](https://docs.ambientcg.com/license/) and [Poly Haven asset licence](https://polyhaven.com/license).
No external vehicle mesh, brand badge or manufacturer artwork is included; references are not runtime dependencies.

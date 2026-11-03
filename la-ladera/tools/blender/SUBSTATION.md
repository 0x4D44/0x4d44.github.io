# Substation asset library — 132 / 33 / 11 kV

An offline library of 59 original equipment and site pieces, each with a separate
LOD1, for a compact vintage oil-filled substation in La Ladera. The two packed
GLBs, one shared PBR atlas layout, material definitions and illustrative yard
plan are deliberately **not registered with the game**. World placement is a
separate task. Nothing under `js/`, either production asset registry, or the
boot path is changed.

The work follows the furniture, goods, clutter, vista-kit and garment libraries:
an authored catalogue, `furn_lib.py` geometry/export helpers, named GLB roots,
metre dimensions, external materials, staged installation, an independent binary
validator, Node tests and actual-export contact sheets. The original designs
have no brands, manufacturer logos or utility insignia. See
[references and provenance](SUBSTATION-SOURCES.md) and the
[measured acceptance report](../../dev/substation/VERIFICATION.md).

## Regenerate

Run from the repository root. Requirements: Blender 5.x, Node 22.16.0, system
Python with NumPy and Pillow, and a Unicode font. The recorded build used
Blender 5.0.1 on Linux. The tools also accept an explicit font path for Windows
or macOS; font rasterisation can change the atlas bytes between platforms.

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/substation_build.py --
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/blender/substation_validate.mjs --complete
node la-ladera/tools/nice.mjs --idle node --test --experimental-test-isolation=none --test-concurrency=1 la-ladera/tests/substation-assets.test.mjs la-ladera/tests/substation-catenary.test.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/substation-mutations.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/payload.mjs
```

`tools/nice.mjs` uses the existing `tests/nice.mjs` priority convention, launches
hidden children and propagates their exit status. Python subprocesses also use
`CREATE_NO_WINDOW` on Windows. Both Blender entry points reject visible mode.
All rendering uses two CPU threads; no browser, mouse, pointer lock or speakers
are involved. The Node 22 spelling is `--experimental-test-isolation=none`.

Builder options after `--` are `--node PATH`, `--atlas-python PATH`, `--font PATH`
and `--out /absolute/path/to/models`. To review intentional catalogue edits,
run a full build with `--write-catalogue`; a normal build refuses a discrepancy
between the authored dimensions/anchors and the committed catalogue. The plan
can be regenerated with:

```sh
node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/substation_plan.py
```

For isolated experiments, `--only transformer_132_33,breaker_oil_132 --out
/absolute/preview/models` builds a partial set. Partial builds cannot replace
the shipped library or rewrite the full catalogue. Complete builds stage the
atlas, both GLBs and manifest; execute the independent validator on the staged
bytes; require a measured JSON success result; then install the manifest last.
A caught installation failure restores the previous substation directories.
This is an offline update with rollback, not a crash-atomic live deployment.

## Files and contracts

| File | Purpose |
| --- | --- |
| `substation.catalog.json` | All 59 keys, metre envelopes, features, anchors and local navigation polygons |
| `substation_equipment.py` | Transformers, breakers, instrument transformers, disconnectors, indoor equipment and shared components |
| `substation_site.py` | Towers, poles, gantries, civil/building pieces, security and ground pieces |
| `substation_build.py` | Catalogue reconciliation, geometry, packing, sharing, staging and installation |
| `substation_atlas.py` | Deterministic weathering, reuse of existing repository surfaces, original Spanish lettering and PBR maps |
| `assets/models/manifest.substation.json` | Packed-file hashes, root names, bounds, dimensions, triangles, parts, anchors and LOD references |
| `assets/models/substation/substation_near.glb` | 59 detailed roots; 48,546 triangles across one of every type |
| `assets/models/substation/substation_lod.glb` | 59 simplified roots; 8,187 triangles across one of every type |
| `assets/models/substation/materials.json` | Material names, atlas rectangles, PBR semantics, source reuse and texture hashes |
| `assets/models/substation/substation-plan.json` | Yard data only: equipment, spans, bays, trenches, security and building layout |
| `tools/substation_catenary.mjs` | Browser-compatible exact catenary solver and optional Node transform-file CLI |
| `substation_validate.mjs` | Independent GLB/PNG decoding, geometry/atlas/data/budget checks and offline isolation |
| `tests/substation-*.mjs` | 29 asset tests, 8 catenary tests and the real failing-input mutation runner |
| `substation_contact.py`, `substation_sheets.py` | Actual-GLB renders, plan assembly, scale references and labelled contact sheets |

Geometry uses metres, +Y up and +Z front. Roots sit at the base of a centred
X/Z footprint. Sizes are `[width, height, depth]`; keep-out polygons are local
`[x,z]` coordinates. The manifest records the actual exported bounds as well as
the reviewed catalogue envelope. The validator decodes positions and indices,
applies the node hierarchy, and compares the result with both sources.

Every GLB contains legal core glTF 2.0 geometry, named materials and linear
vertex colours. There are no embedded images, skins, animations, external
buffers, Draco dependencies or custom decoder extensions. Positions and normals
remain float32; UVs use normalised unsigned 16-bit components and colours use
normalised unsigned 8-bit components. Index buffers use 16 bits when possible.

Repeated radiator banks, fans, porcelain components, cells and lattice members
are authored as separate components. The builder canonicalises translated
meshes and shares identical geometry/material data. The exported GLBs contain
170 actual repeated mesh references, independently counted by the validator.
Fence panels, board panels, ground tiles and whole transformers are also reused
by reference in the plan. Later integration should preserve sharing and batch
or instance repeated equipment; the preview's objects are not a runtime loader.

## Equipment catalogue

These are original family designs, not reproductions of a manufacturer's
equipment. Dimensions below are width × height × depth in metres. Prefix every
key with `substation_`; its LOD key adds `_lod1`. The machine-readable catalogue
contains the complete features and anchors.

| Keys | Dimensions / contents |
| --- | --- |
| `transformer_132_33` | 7.04 × 6.33 × 5.20; about 40 MVA; tank, four radiator banks, conservator, Buchholz relay, OLTC housing, three HV and three MV bushings, neutral bushing, fans, marshalling kiosk and separate rating/equipment plates |
| `transformer_33_11` | 5.00 × 4.47 × 4.12; about 15 MVA; matching oil-filled family, 33 kV bushings, neutral, 11 kV cable box, radiators, conservator, relay, OLTC, fan, kiosk and rating plate |
| `breaker_oil_132`, `breaker_oil_33` | 5.80 × 4.40 × 4.24 and 3.10 × 3.00 × 2.50; grounded oil-tank outdoor breakers, porcelain terminals and mechanism cubicles |
| `breaker_truck_11` | 0.86 × 1.23 × 1.10; withdrawable oil-breaker truck with wheels and rear contacts |
| `disconnector_centre_132`, `disconnector_centre_33` | 4.00 × 3.35 × 1.30 and 2.90 × 1.93 × 1.28; centre-break single-phase units, repeated three per bay |
| `disconnector_pantograph_132` | 2.30 × 6.23 × 1.56; articulated raised-contact silhouette |
| `ct_132`, `ct_33` | 1.12 × 4.56 × 1.40 and 0.92 × 2.56 × 1.40; current transformers with primary heads and terminal boxes |
| `cvt_132`, `cvt_33` | Same family envelopes as CTs; capacitor stacks and base apparatus |
| `arrester_132`, `arrester_33` | Same family envelopes; porcelain arresters, base and earth tails |
| `post_insulator_132`, `post_insulator_33` | 0.55 × 2.10 × 0.55 and 0.375 × 1.05 × 0.375 |
| `earth_switch_132`, `earth_switch_33` | 2.40 × 3.00 × 1.15 and 1.50 × 1.73 × 1.15; blades, contacts and operating linkage |
| `switchboard_panel_11` | 0.80 × 2.40 × 1.60; metal-clad panel with door, meters, relays and mimic strip; 12 instances form the indoor board |
| `control_panel`, `battery_bank`, `battery_charger` | 0.85 × 2.25 × 0.82; 2.90 × 1.55 × 0.69; 0.75 × 1.55 × 0.72 |
| `station_transformer` | 1.72 × 1.90 × 1.52; small oil-filled station-service unit |
| `radiator_bank`, `cooling_fan` | Separate reusable pieces; 2.04 × 2.10 × 1.70 and 0.74 × 0.77 × 0.32 |
| `insulator_disc`, `insulator_string_132`, `insulator_string_33` | Separate components; disc diameter 0.30 m, string heights 1.72 m and 0.70 m |
| `conductor_segment`, `conductor_spacer` | Unit 1 m conductor along +Y, radius 0.015 m; separate 0.61 × 0.52 × 0.04 m spacer |
| `tower_suspension_132`, `tower_terminal_132` | Original six-arm double-circuit lattice forms; 12 × 32 × 6.4 and 13 × 30 × 8 |
| `pole_hframe_33`, `pole_concrete_11` | Wood H-frame 6.4 × 13 × 1.2; concrete distribution pole 2.8 × 10.5 × 0.65 with crossarms and pin insulators |
| `gantry_132`, `gantry_33` | Lattice portals with tension strings; 12 × 10 × 2 and 7 × 5.5 × 1.3 |
| `busbar_tube` | Short modular tubular busbar, 3 × 0.15 × 0.15; wire bus connections use catenary instances |
| `bund_large`, `bund_small`, `firewall` | Gravel, raised plinth and sump in 10 × 0.65 × 7.4 and 7.2 × 0.55 × 5.6 bunds; wall 0.69 × 6.5 × 8 |
| `wall_brick`, `wall_door`, `wall_window` | 3 × 3.2 × 0.3 shell modules; separate door/window opening types |
| `roof_flat`, `door_steel`, `louvre`, `window` | Modular flat roof 3.2 × 0.32 × 3.2; fitted steel door, louvre and window pieces |
| `oil_store` | 4.5 × 3.2 × 3.5 detached brick oil store |
| `fence_panel`, `fence_post`, `gate` | 2.5 × 2.4 × 0.09 chain-link panel; 2.94 m post with barbed-wire outrigger; 5 m double gate |
| `floodlight_mast`, `lightning_mast` | 8 m floodlight mast and 18 m lightning mast |
| `gravel_tile`, `concrete_tile`, `trench_cover` | 4 × 4 m ground tiles and 1 × 0.6 m cable-trench cover |
| `sign_danger`, `sign_access`, `sign_touch` | Original Spanish safety plates; no real utility symbols or logos |

## Shared atlas and later material binding

The library adds one 4 × 4 shared atlas layout: a 2048 × 2048 RGB colour PNG,
1024 × 1024 tangent normal PNG, and 1024 × 1024 packed ORM PNG. These are the
three PBR planes of the same atlas, not separate per-object textures. Six
existing repository surfaces supply texture variation; their exact paths are
listed in `materials.json`. All new weathering and lettering are deterministic.

The 16 surface regions cover galvanised and rusty steel, chalked grey-green
paint, brown and grey porcelain, concrete, gravel, peeling paint, rubber, oil
stains, brick, wood, three safety signs and equipment/nameplate lettering.
Plate subrectangles distinguish the 40 MVA and 15 MVA ratings, T1/T2 and
`OCB 33-2`. The Spanish text includes `PELIGRO`, `ALTA TENSIÓN`, `132 000 V`,
`PROHIBIDO EL PASO`, and `NO TOCAR` with correct accents.

For later Three.js integration, colour is sRGB; normal and ORM are linear.
ORM channels are ambient occlusion, roughness and metallic. Multiply the colour
texture by the vertex colours. The UVs are already packed into the rectangles
in `materials.json`; use the documented bottom-to-top convention and the
existing `TextureLoader` `flipY=true` path. Do not apply the tile rectangle a
second time. Each surface cell has a 16-pixel colour gutter. The preview binds
the exported data explicitly because production material definitions are
intentionally unchanged.

T2 reuses the T1 transformer mesh. Its plan record includes
`materialOverrides: {"substation_plate_t1": "substation_plate_t2"}`. That
override means both selecting the named material and mapping the plate UVs
from the source rectangle to the target rectangle. `substation_contact.py`
demonstrates this on a private copy of the small label mesh. Simply renaming
the material while retaining the old atlas UVs would still display T1.

## Yard data, anchors and conductor recipe

The compound is 55 × 40 m, centred at `[0,0,0]`, with its gravel surface at
Y=0.12 m. Positions are `[x,y,z]` metres and `rotationY` is a right-handed yaw
in radians about +Y. The plan has 460 equipment/site records and two external tower
records. It includes two large and two small transformers, four separate
bunds, the wall between T1 and T2, two 132 kV bays, 33 kV equipment, 12 indoor
11 kV panels, shell pieces, trenches/covers, fence polyline/gate, floodlights,
lightning protection scenery, and incoming/outgoing tower positions.

Reference phase spacings are 2.7 m at 132 kV and 1.2 m at 33 kV; the data
specifies a 3 m live-equipment fence setback, a 3.5 m service aisle and at
least 4 m live-wire height where the generated curves cross the perimeter.
These are visual plausibility checks. The plan is explicitly **not
engineering-certified** and provides no electrical, structural, fire, oil-volume,
earthing, mechanical line-loading or construction approval.

Each catalogue type has a local keep-out polygon and named anchor collections.
`anchors.hum` on transformer types gives a source position and the requested
100 Hz frequency. `anchors.lamps` and `anchors.hinges` carry names and local
positions; hinges also carry an axis. Empty arrays mean that a type has no
lamp or hinged part. Transform these data with the equipment instance. They
are placement metadata: this library does not create audio, lights, colliders,
door animations or a navigation system. The static door geometry must be
separated or replaced when interactive doors are integrated later.

The 36 spans store endpoints, sag and radius. They generate 903 short segment
instances for the committed yard. No long conductor meshes are shipped.
The exact unequal-height catenary formula, bounded numerical solve and
`THREE.InstancedMesh` transform recipe are documented in
[SUBSTATION-CATENARY.md](SUBSTATION-CATENARY.md).

## Budgets and evidence

| Gate | Measured | Limit |
| --- | ---: | ---: |
| Entire model/data directory plus manifest | 3,115,422 bytes | 4,500,000 bytes |
| Near GLB / LOD GLB | 2,288,968 / 559,920 bytes | Included above |
| Maximum near piece | 5,644 triangles, large transformer | 6,000; every other type ≤3,000 |
| Highest LOD / near ratio | 34.88% | 40% |
| Texture disk bytes | 3,884,196 bytes | 8,000,000 bytes |
| Texture GPU estimate, RGBA8 with mipmaps | 33,554,432 bytes | 40,000,000 bytes |

The validator independently decodes GLB accessors, indices, node transforms,
normals, UVs and triangles; checks metre bounds and caps; requires every
catalogue member in complete mode; checks actual mesh references; verifies PNG
CRCs and inflates raster data; checks material rectangles; includes unlisted stale files in
disk accounting; validates yard coverage, containment and the sampled exact
catenary at fence crossings; and checks that the library stays outside the
production registries and JavaScript imports. It does not trust manifest
triangle or size claims as its measurement source.

For the complete contact sheets and two yard views:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/substation_contact.py -- --out /tmp/substation-renders --lod
node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/substation_sheets.py --renders /tmp/substation-renders --out la-ladera/dev/substation
```

The renderer imports the actual GLBs and binds the external PBR files. Every
one of the 118 near/LOD images uses a camera at 1.60 m and a 1.80 m reference
figure; tall objects are framed by moving the camera farther away, keeping its
height fixed. The overview and yard eye view instantiate the JSON plan and
the catenary tool's transforms. Source hashes accompany the render evidence.
Development images and reports live in `dev/substation/`, which the existing
payload test excludes from shipped bytes. See that directory for exact test,
mutation, validator and payload output and the checks that were not performed.

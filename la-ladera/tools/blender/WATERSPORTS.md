# Watersports, boats and pier kit

This is a standalone, original **CC0-1.0** asset library for the future La Ladera
beach. It contains 41 base designs and 41 separately authored far LOD roots in
three GLBs. Every design is present in the [catalogue](watersports.catalog.json),
the [manifest](../../assets/models/manifest.watersports.json), and the
[local anchor data](../../assets/models/watersports/anchors.json).

The boot does not request these files: `manifest.watersports.json` is deliberately
absent from `assets/models/manifest.json`. The beach's sea sector (round 7:
`js/world/waterlib.js`, the one module of the game that names the library, and
`waterprops.js`) reads the manifest through `Assets.extend` and loads the pieces once
the page is playable; the validator's `SECTOR` list says so, and W20 holds every
other module to it. The atlas is registered in the texture registry under its own
name (`watersports`), as the beach props' is.

The current user brief takes precedence over the earlier nominal sizes in
`dev/FEATURE-BEACH.md`: the windsurf board is 2.30 m, the lancha including its
outboard is 7.00 m, SUPs are approximately 3.3 m, and the raft deck is 3 x 3 m.
The pier-head kit is 4 x 3 m; larger heads can be assembled from deck modules.

## Files and conventions

| File | Contents |
| --- | --- |
| `watersports/watersports_boards.glb` | Windsurf sailing/sand/derigged poses, three SUP designs, paddle, twin-tip, foilboard, control bar, flying/sand kite poses |
| `watersports/watersports_boats.glb` | Single and double kayaks, rowing boat, lancha, four named wooden boats, oar, anchor, rope coil, lifebuoy |
| `watersports/watersports_pier.glb` | Buoys, repeatable swim-line segment, raft, dive targets and all pier kit components |
| `watersports/anchors.json` | Local attachment, rider, ladder, navigation, waterline and suggested motion data |
| `../textures/watersports/watersports_base.png` | Shared base colour and alpha atlas |
| `../textures/watersports/watersports_normal.png` | Normal map using the same atlas layout |
| `../textures/watersports/watersports_orm.png` | Occlusion R, roughness G, metalness B, same layout |

All geometry is in **metres, +Y up, +Z front/bow**. A root is named
`watersports_<design>`; its separate far root is `watersports_<design>_lod1`.
Scene roots have identity transforms. Grounded pieces have their support base
at Y=0. Floating pieces have the waterline at Y=0, with their keel or appendage
below it. The windsurf rig's origin is the board support centre; its sail can
overhang that support. Bounds are measured from the transformed exported
vertices, so an asymmetric rig is not silently recentered away from its mast.

Every near piece is at most 1,500 triangles, with the lancha allowed 2,500.
Additional hard limits are 60 for the simple buoy, 250 for the bell buoy and 16
for a pier pile. Every far piece is at most 40% of its own near triangle count.
Counts include **every drawn instance**, even when GLB meshes are shared.
The library has its own stricter decimal limits of **2,500,000 GLB bytes** and
**4,000,000 texture bytes**, independent of the site's aggregate payload gate.

Repeated planks, floats, rail posts, flotation drums, tyres and repeated boat
hulls share actual glTF mesh data. Static copies use `-instance_<id>` nodes.
Moving parts use `-pivot_<id>` nodes: mast/sail, boom, detached mast and paddle
sections, kite wing, outboard steering, propeller, bell clapper and moped wheels.
Pivots retain their parent-local locations between LODs. A child propeller's
position is relative to its outboard, and a boom is relative to its sail.
`axis` is a unit vector in that pivot's local frame. No animation clips are
included; the later controller applies its own rotations and water motion.

## Shared PBR atlas and six colourways

There is one 2048 x 2048 atlas layout, with three maps and eight-pixel extruded
gutters. Its named UV rectangles are in `manifest.atlas.tiles`. The colour map
is sRGB; normal and ORM maps are linear. UVs are confined to 0..1. Geometry and
atlas pixels are generated procedurally from original code; there are no
downloaded photographs, external model dependencies, manufacturer profiles,
brand badges or logos.

The four named materials are specified in
[`watersports.materials.json`](watersports.materials.json):

| Material name | Binding |
| --- | --- |
| `watersports_atlas` | Opaque PBR for hulls, boards, timber, metal, rubber and encrustation |
| `watersports_fabric` | Same PBR atlas, double sided for thin sail and kite fabric |
| `watersports_alpha` | Same atlas with alpha testing for the four painted transom names |
| `watersports_window` | Same atlas with transparent alpha and no depth writes for the clear sail window and lancha screen |

GLBs contain material **names**, with no embedded images or textures. These
recipes are the integration handoff; the future loader must register/bind them
before putting the library in the world. Use the existing material library's
unit UV convention and default `TextureLoader.flipY=true`: exported UVs and tile
rectangles here are bottom-origin, matching the vehicle library. A generic
glTF-imported Blender preview flips V back before sampling these external maps.
Keep atlas clamp wrapping and mipmaps; share textures and material objects.
The ORM image can serve all three channels, with metalness/roughness factors 1.

Sails and kites each have coral, teal, gold, blue, lime and plum variants.
The base roots use the coral tile; `catalogue.assets[key].variants` supplies the
source tile and all six alternatives. No duplicate whole rig is stored merely
to change colour. The sail has a clear window, white battens, a readable printed
number, a wishbone boom and footstraps. Kites have a thin curved canopy,
inflated leading edge/struts, striped panels and white seams.

For a later consumer that needs a different colourway:

```js
import { applyWatersportsVariant } from './tools/watersports-variants.mjs';

const rig = sourceRig.clone(true);
applyWatersportsVariant(rig, manifest.atlas, 'sail_coral', 'sail_teal');
```

The helper clones affected geometry and UV buffers, preserves shared geometry
within the chosen clone and leaves all source instances untouched. Only vertices
inside the selected source tile move. Variant geometry can then be cached once
per design/LOD/colourway by the future integrator.

The four wooden boats carry actual alpha-mapped transom names: **Maria del Mar,
La Esperanza, San Pedro, Brisa**. They share their opaque hull meshes. Names are
read from the stern (-Z); the visual evidence includes specific stern views.

## Anchors, water motion and navigation

Every anchor is local to its base design root, in the same metre frame as the
GLB. Transform anchor positions by the placed root's world matrix. Anchor lists
use `feet`, `hands`, `seat`/`seats`, `stand`, `lineAttachments`, and named mooring
or socket points as appropriate. `ladder.start` and `ladder.end` give the climb
endpoints; `navKeepOut` is a simple local X/Z polygon, with no duplicated closing
vertex. The raft, deck modules, pier-head platform and individual pier components
carry keep-out polygons. These are a placement/nav handoff, not installed physics.

For a floating root, place its Y at the future sea sampler, including the beach
datum **-1.20 m**. Do not add the draft to its placement. `draftDepth` is the
distance below the root waterline to the lowest physical appendage, including a
fin, foil, keel or raft ladder. The raft also records its shallower
`hullDraftDepth`. For boards, `floatHeight` is the standing/deck surface height
above the waterline; the root waterline offset remains zero.

`bobAmplitude` is a suggested maximum vertical displacement in metres and
`rockAmplitudeDeg` is a suggested peak pitch/roll angle in degrees. They are
authored integration values, not a fluid simulation or measured hydrodynamics.
The consumer computes phase, swell, resistance and damping. Grounded pieces
explicitly have `floating:false` and zero draft/bob/rock values. Set the kite
flying root's elevation using its controller; it is not a floating object.

The 3 m swim-line segment has join endpoints at X=-1.5 and X=+1.5. Repeat it
with shared geometry; the three small floats are mesh instances. The 3 x 2 m
pier deck module joins along Z at -1 and +1. Rails, posts, piles, cross-braces,
cleats, ladders, rod holders, lamps and bait crates remain independent parts.
The end platform leaves a central rail gap for the separate ladder. Kit
assembly and final clearances need to be checked against the placed coast.

## Kite lines: catenary recipe

Long kite-line meshes are deliberately absent from the GLBs. The small
dependency-free [`tools/watersports-lines.mjs`](../watersports-lines.mjs) generates
points or six floats per `THREE.LineSegments` segment, and can reuse a supplied
segment buffer. It also offers an adapter taking the caller's existing THREE
namespace, without importing or starting a renderer.

For endpoints A and B, let `d=|B-A|`, horizontal separation `h`, vertical
difference `dy`, and requested arc length `L=d*(1+slack)`. The helper solves
`sinh(u)/u = sqrt(L*L-dy*dy)/h`, with `a=h/(2u)`, then evaluates the shifted
catenary in the vertical plane through the endpoints. The formula uses a product
of hyperbolic sines to avoid subtracting almost equal cosines for a taut line.
Coincident, zero-slack and vertical spans have explicit limiting branches.

```js
import { catenarySegments, makeCatenaryLineSegments }
  from './tools/watersports-lines.mjs';

const options = { segments: 12, slack: 0.002 }; // nearly taut kite line
const buffer = new Float32Array(options.segments * 6);
catenarySegments(barWorldPoint, kiteWorldPoint, options, buffer);
// Copy multiple line pairs into one fleet buffer and issue one draw call.

const line = makeCatenaryLineSegments(THREE, barWorldPoint, kiteWorldPoint, options);
line.userData.updateEndpoints(nextBarWorldPoint, nextKiteWorldPoint);
```

`slack` is extra length divided by endpoint distance, not a sag in metres.
For a visibly hanging mooring rope, 0.06 is a useful starting value. Twelve
segments are an integration suggestion, not a measured frame-cost claim. Inputs
are checked: 1..256 segments, 0..2 slack, finite metre positions and bounded span.
Dispose the geometry and any owned material when removing the line. Neither
helper is imported by current game code.

## Regenerate and validate quietly

Use Blender **5.x**, Node **22.16.0**, and the existing low-priority wrapper.
All commands are from the repository root:

```sh
node la-ladera/tests/memgate.mjs 6 60
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/watersports_build.py
node la-ladera/tools/blender/watersports_validate.mjs --complete
node la-ladera/tests/watersports-assets.test.mjs
node la-ladera/tests/watersports-mutations.mjs
node la-ladera/tests/payload.mjs
```

Pass `-- --node /absolute/path/to/node` after the Blender script to select the
exact Node executable. `--counts` emits authored counts only; the authoritative
acceptance measurement always decodes exported buffers. `--write-catalogue`
refreshes the reviewable nominal catalogue after deliberate design changes;
normal regeneration reads that checked-in contract.

A filtered preview needs a separate output directory and is marked incomplete:

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/watersports_build.py \
  -- --only watersports_lancha --out /tmp/watersports-preview/models
```

The builder stages the GLBs, atlas and JSON, then runs the independent decoder
before installing anything. It publishes the manifest last and restores previous
owned files on an installation exception. A partial preview cannot pass
`--complete` or replace shipped assets through `--only`.

Binary files use their exact SHA-256 bytes. Catalogue, anchors and material
recipes are pinned after normalizing CRLF to LF, so `core.autocrlf=true` does not
invalidate them. The acceptance suite exercises both LF and CRLF text bytes.

## Visual verification and limitations

[`dev/watersports/README.md`](../../dev/watersports/README.md) contains the actual
acceptance output, catalogue image, paged eye-height contact sheets and dedicated
colourway/transom views. The renderer imports the exported GLBs, binds the
shared PBR maps and records source hashes and camera positions. Eye cameras are
at Y=1.60 m and every item is shown beside a 1.80 m figure. Submerged appendages
are exposed for inspection; a datum indicates Y=0 rather than hiding them in an
opaque water plane. Elevated close views complement the scale checks.

The shipped library has not been placed in the game. World-scale frame time,
GPU draw calls, actual water animation, player/NPC riding, ladder traversal,
collision/nav integration, underwater rendering and the full coast scene are
not claimed as verified by this asset-only change. The future integration must
choose LOD distances, instance repeating kit, and measure those behaviours.

## Inventory

The measured per-design inventory is generated below from the decoded manifest.
Dimensions are width x height x length of the nominal envelope, in metres;
fittings and deliberately asymmetric rigs are explained in the catalogue.

<!-- inventory-start -->
| Design | Nominal W × H × L (m) | Near / far triangles | Floating |
| --- | --- | ---: | --- |
| `windsurf_rig` | 0.72 × 4.57 × 2.83 | 713 / 150 | Yes |
| `windsurf_sand` | 4.89 × 0.65 × 2.83 | 701 / 146 | No |
| `windsurf_derigged` | 1.76 × 0.32 × 2.30 | 634 / 172 | No |
| `sup_a` | 0.80 × 0.45 × 3.30 | 338 / 52 | Yes |
| `sup_b` | 0.78 × 0.45 × 3.35 | 338 / 52 | Yes |
| `sup_c` | 0.82 × 0.45 × 3.20 | 338 / 52 | Yes |
| `paddle` | 0.22 × 1.85 × 0.07 | 184 / 58 | No |
| `kiteboard` | 0.42 × 0.23 × 1.40 | 368 / 72 | Yes |
| `foilboard` | 0.86 × 1.12 × 1.55 | 400 / 100 | Yes |
| `kite_bar` | 0.60 × 0.16 × 0.08 | 236 / 66 | No |
| `kite_flying` | 7.04 × 1.86 × 2.60 | 580 / 136 | No |
| `kite_sand` | 7.04 × 0.59 × 2.60 | 580 / 136 | No |
| `kayak_single` | 0.75 × 0.48 × 3.40 | 510 / 108 | Yes |
| `kayak_double` | 0.86 × 0.51 × 4.60 | 664 / 130 | Yes |
| `rowing_boat` | 1.36 × 0.72 × 3.60 | 660 / 90 | Yes |
| `lancha` | 2.10 × 1.60 × 7.00 | 983 / 188 | Yes |
| `oar` | 0.18 × 0.07 × 2.10 | 92 / 24 | No |
| `anchor` | 0.56 × 0.67 × 0.28 | 166 / 63 | No |
| `rope_coil` | 0.68 × 0.09 × 0.68 | 520 / 90 | No |
| `lifebuoy` | 0.76 × 0.14 × 0.76 | 432 / 48 | Yes |
| `wooden_boat_maria_del_mar` | 1.80 × 0.90 × 5.50 | 794 / 92 | No |
| `wooden_boat_la_esperanza` | 1.80 × 0.90 × 5.50 | 794 / 92 | No |
| `wooden_boat_san_pedro` | 1.80 × 0.90 × 5.50 | 794 / 92 | No |
| `wooden_boat_brisa` | 1.80 × 0.90 × 5.50 | 794 / 92 | No |
| `buoy` | 0.50 × 0.53 × 0.50 | 60 / 16 | Yes |
| `bell_buoy` | 1.00 × 1.60 × 1.00 | 150 / 58 | Yes |
| `swimline_segment` | 3.02 × 0.14 × 0.18 | 112 / 42 | Yes |
| `diving_raft` | 3.00 × 1.65 × 3.00 | 524 / 116 | Yes |
| `sunken_moped` | 0.62 × 1.10 × 1.72 | 640 / 152 | No |
| `sunken_anchor_tyre` | 1.30 × 0.67 × 0.80 | 442 / 111 | No |
| `pier_deck` | 3.00 × 0.22 × 2.00 | 184 / 36 | No |
| `pier_pile` | 0.32 × 3.60 × 0.32 | 16 / 6 | No |
| `pier_crossbrace` | 2.40 × 1.50 × 0.16 | 44 / 12 | No |
| `pier_handrail` | 2.00 × 0.98 × 0.14 | 72 / 24 | No |
| `pier_post` | 0.14 × 0.98 × 0.14 | 36 / 12 | No |
| `mooring_cleat` | 0.36 × 0.16 × 0.14 | 116 / 14 | No |
| `pier_ladder` | 0.66 × 3.00 × 0.38 | 260 / 72 | No |
| `rod_holder` | 0.13 × 0.43 × 0.16 | 100 / 36 | No |
| `pier_lamp` | 0.66 × 2.85 × 0.66 | 204 / 56 | No |
| `bait_crate` | 0.58 × 0.34 × 0.42 | 252 / 60 | No |
| `pier_end_platform` | 4.00 × 1.20 × 3.00 | 352 / 132 | No |
<!-- inventory-end -->

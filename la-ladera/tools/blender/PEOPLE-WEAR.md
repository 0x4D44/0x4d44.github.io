# Optional adult wearable garments

Part B adds 23 wearable designs with a fit for each of the 23 existing adult and
elder residents. The seven child/teen IDs are excluded. It does not replace the
default cast or automatically select an outfit. Swimwear is available only to an
explicit beach selection; this change does not add beach behaviour to the game.

This regeneration starts at requested base
`38542092094aaf0101cc9920fd8628fcdaf0ac35`. Its results must be recomputed; PR #85's
old assets and certificate are not inputs. See `dev/wear/REGENERATION.md` for the
current acceptance status and complete eligible/excluded resident lists.

The source catalogue is `people_wear.catalog.json`. Its garment rows specify
slots, permitted archetypes, contexts, and colour/print sets. The generated
`js/people/wear_data.js` is the small runtime selection table;
`assets/models/manifest.people-wear.json` also records every garment's near/far
node, measured triangles, adult fits, and exact file inventory. `sourceDesign`
links the overlapping designs to the existing Part A object library. Shirt,
blouse, jumper, trousers, jeans, skirt, dress, shoes, and rash vest are additional
original patterns required by the wearable brief.

## Defaults and optional runtime use

`WearLibrary` is inert until explicitly loaded. The game boot and resident
selection paths do not import it. `CharacterLibrary` retains a reference to the
instance's original near geometry and delegates LOD changes when an instance
already has an installed wardrobe. The existing
people GLBs, material atlas, clip bank, and bone contract are unchanged.

```js
import { WearLibrary } from './people/wear.js';

const wear = new WearLibrary('./assets/models/');
await wear.load([resident.id]);
wear.dress(resident, [
  { id: 'tshirt', variant: 'plain_teal' },
  { id: 'trousers', variant: 'plain_navy' },
], { context: 'daily' });

// The ordinary CharacterLibrary.setLod() keeps all installed layers together.
// Removing the wardrobe restores the exact saved geometry/material/visibility.
wear.restore(resident);
wear.dispose();
```

The catalogue contains `daily`, `private`, and `beach` contexts. `studio` is an
explicit asset-inspection context that permits each design on all three contact
sheet bodies; it still rejects every child/teen ID. An invalid garment, colour,
slot combination, context, or skin binding fails before changing the live outfit.
Normal selections require adequate top/bottom coverage. An empty selection
restores the original look.

Each resident file copies the exact source skeleton joint order, rest transforms,
and inverse bind matrices. Installed clothing uses the resident's existing
skeleton and animation mixer. It does not create a second clip player. All 32
original clips therefore remain the source of movement.

Some original motions move an arm through the torso. A fitted cloth surface needs
a pose-dependent correction to remain outside that body. While an outfit is
installed, `WearLibrary` wraps the existing mixer's `update()` and applies a
bounded push-out immediately afterward, before Three.js uploads the frame's
vertex buffers. Each update starts from the immutable exported garment, so
corrections cannot accumulate or distort its rest shape over time. Only private
position/normal streams change; UVs, indices, weights, and bone data are shared.
These streams replace the unrendered garment template's position/normal upload.
Removing the outfit restores the original mixer method as well as its appearance.

Long bottoms also support a precomputed seated hip correction. A pure helper
measures each thigh's forward flexion relative to the hips, using immutable rest
frames from the same rig. Both thighs must flex: activation blends smoothly from
45 to 80 degrees on each side. It does not select a clip by name or run another
animation player. Near and far long-bottom meshes have independent position
streams because their different triangle layouts need different hip curvature.
The target deltas are CPU-only Float32 accessors, never renderer attributes or
GPU morph targets. The ordinary private position stream receives the blend before
the final body push-out and upload. Every total displacement, including both
stages, is checked against the unchanged authored base in bind and posed space;
the target cannot reset the 180 mm limit. An inactive target leaves the standing
mesh unchanged.

For a caller that changes bones directly or invokes `skeleton.pose()`, call
`wear.update(resident)` after the change and before rendering. A correction that
cannot meet the clearance or displacement bound fails and restores the original
look. An invalid replacement is checked before removing the preceding outfit.

The original people meshes include their default clothes as body surfaces and do
not contain a complete unclothed body underneath. The optional wardrobe supplies
its own closed, generated body when installed. The original head/hair triangle
indices borrow the existing near mesh's attributes and material, preserving the
resident's identity without another head atlas or duplicate attribute upload.
The optional body is removed with the outfit. Borrowed attributes are detached
from temporary identity geometry before disposal so the original GPU buffers
remain usable.

## Geometry, atlas, and provenance

Garment patterns are original generated geometry in `people_wear_shapes.py`.
`people_wear_body.py` now calls the current native hand, leg and sandal-skin
recipes and follows the current torso and arm contours. It closes hidden open
boundaries and explicitly records the inferred anatomy in covered regions: the
protected cast has clothes instead of a complete unclothed body. The builder
reads the existing resident proportions and skin-weight recipes without
executing the original builder's output side effects.
It uses the exact original source skeleton for every exported fit. Boolean sewing
removes buried torso/sleeve and crotch panels; face provenance opens the neck,
waist and hems while retaining exposed shoulder and crotch cap fragments.
Coincident seam vertices receive identical skin weights. Close-fitting patterns
follow the body's bust and hip rows, including the corresponding far-LOD rows.
UV seams remain separate. No downloaded clothing mesh, commercial pattern, logo, or
photograph is shipped.

Trousers and jeans share a fitted cut; shorts and the board-style swim trunks
share another. Each retains its own garment ID, eligible colours and contexts.
Identical final attributes and index buffers are deduplicated within the resident
file, so this reuse reduces storage and GPU allocation without removing seam
detail or altering the per-garment triangle and clearance checks.

The only reused model-derived content is the existing resident head/hair. Its
MakeHuman-derived head data is CC0; see `vendor/MAKEHUMAN_SOURCE.md` and
`vendor/MAKEHUMAN_CC0.txt`. Existing procedural hair and the Part A prints are
generated repository assets. `GARMENTS-SOURCES.md` records Part A's reference
distinction. NumPy, SciPy, Pillow, and Manifold are authoring software, not shipped
mesh or texture sources.

One external 256 × 256 sRGB atlas reuses the actual Part A print tiles at their
native resolution and retains their palette IDs, with deterministic fine cloth
grain. There are no embedded images. Variant
textures share one Three.js `Texture.source` and sampler parameters; offset and
repeat select the tile without allocating another GPU image. Packed attributes
use `KHR_mesh_quantization`, four-byte vertex alignment, no more than four skin
influences, and weights summing to 255. Near and far meshes share attributes where
possible. The independent validator measures actual uploaded buffer storage and
RGBA8 atlas storage including mipmaps, with a strict **12,000,000-byte** ceiling.
Each near garment is limited to **1,800 triangles**.
Every far garment is limited to **600 triangles** and **40% of its near mesh**;
the far body also satisfies the 40% ratio. `people_wear_lod.py` reduces source
edges to existing endpoints, preserves component/opening topology, and leaves
positions, skin weights and UVs unchanged. It does not certify posed clearance.
Compressed wardrobe models are limited to **6,000,000 bytes**.

Metadata and the independent validator pin both current people LODs, metadata,
three texture pages, six protected Python sources and the two unchanged
manifests. The explicit source-input map uses LF hashes for text and exact hashes
for binary files. Narrow `.gitattributes` rules keep new wear text in LF form;
the pre-existing release fingerprints continue to bind protected checkout bytes
with `core.autocrlf=true`.

## Rebuild

Run from the repository root. This is a headless Python authoring pipeline; it
does not open Blender or require a runtime Python dependency. The tested authoring
environment uses Python 3.12, NumPy 2.3.5, SciPy 1.17.0, Pillow 12.3.0, and
Manifold3D 3.5.4 and Zopfli 0.4.3. Install these in an authoring environment; if Manifold is installed
in a separate directory, set `PEOPLE_WEAR_PYSITE` to it.

```sh
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/blender/people_wear_build.py
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/blender/people_wear_build.py --fit-faces --gzip
node --import ./la-ladera/tests/register.mjs la-ladera/tools/people_wear_data.mjs --write
```

`--only <adult-id> ...` rebuilds a diagnostic subset. It is not a complete release
build. `--refresh-metadata` updates byte/hash measurements after an explicit
authoring fit; it does not certify collision clearance. The data generator rejects
stale metadata and source hashes. Never edit generated tables or manifests to
claim different counts, fits, or a successful collision result.

`--fit-faces` starts from fresh generated files. It first fits rest-pose vertices,
then uses `people_wear_fit_faces.mjs` to fit triangle centroids and edge midpoints
for the expanded 19-recipe set at the contact sheet's fixed `idle_a` pose. The
separate original seven-recipe regression remains in the test suite.
Coincident positions with identical skin influences move together across UV and
normal seams. A relaxed projection keeps the surface continuous and rechecks
raw-rest clearance after each pass. Total displacement stays within 80 mm of the
untouched generated bind positions. `people_wear_fit_targets.mjs` then audits all
23 garments at rest and in the idle pose before fitting the seated long-bottom
targets independently for each LOD. The target writer serializes CPU-only Float32
deltas from the actual shipped base positions, then re-decodes and checks the
combined target and push-out against the 180 mm bind/posed limit. Independent
solid-angle checks verify the contact-pose vertex and face probes.

PR #85's `WEAR_TOPOLOGY_CHOICES` and exact cook's-hip repair remain supported for
legacy fixtures, with their original guards. The current-body route uses
independent near cuts and far reduction, so it never makes near and far equal.
The new cook's-hip guard binds all six current source files and the complete raw
mesh instead of applying old triangle 185 to unrelated new topology. Any further
pattern adjustment requires a fresh guard, build and clearance run.

For a target that approaches the displacement limit, the authoring helper may
propose moving the actual base positions five percent toward that target, capped
at 10 mm. This proposal is accepted only after rechecking the unchanged 80 mm
distance from pristine raw geometry, raw-rest clearance, every idle face probe,
and the seated target's full 180 mm bound. The target delta is then recomputed
from those physically changed base positions. It cannot substitute a new
accounting origin for an unchanged mesh.

The command rejects already-fitted inputs and publishes the selected files only
after every fit converges and the measured GPU budget passes. Metadata records
the exact raw input hashes, topology choices, target storage and fit results.
Four idle-priority workers fit separate residents by default (`--author-jobs`
accepts one through eight). A failed run retains its printed checkpoint directory.
After correcting and regenerating a failed raw fit, pass that directory with
`--resume-author` to reuse successful work only when raw bytes, fit metadata,
numerical dependencies and saved output hashes still match. All requested fits
must pass before any fitted files are published.

`--fit-rest` remains available for rest-only authoring diagnostics. The full
animation bank is checked separately with the bounded runtime correction. The
lossless `.glb.gz` transport uses deterministic Zopfli with 15 iterations,
preserves every decoded GLB byte and reduces the
actual model payload counted by the unchanged payload gate. The loader accepts
both compressed bytes and a server response that is already HTTP-decoded, and
uses the explicit model resource directory for external references. GPU budgets
are always measured from decoded attributes and image dimensions.

## Required verification

The fast suites test the exported files, the actual runtime loader, and deliberate
corruptions. The full posed clearance sweep writes a mandatory release certificate.
The fast suite verifies that certificate against the current files and exact pose
schedule; missing, partial, or stale certificates fail. After rebuilding assets or
changing a fingerprinted implementation file, run the full sweep before the final
fast suite. An unchanged checkout can reuse its committed certificate without
executing the full sweep twice.

```sh
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/blender/people_wear_validate.mjs --mode all --report la-ladera/dev/wear/clearance.json
node --import ./la-ladera/tests/register.mjs la-ladera/tests/people-wear.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/people-wear-runtime.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/people-assets.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/interiors-garments.test.mjs
node la-ladera/tests/payload.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/people-wear-shots.mjs --out la-ladera/dev/wear
```

Set `CHROME_PATH` if necessary. The contact-sheet tool uses the repository's
headless, muted, low-priority Chrome launcher and closes only its own processes.
It renders every garment on `w_joven`, `m_tendero`, and `w_vecina` at both LODs,
walking, and seated. A neutral companion garment provides coverage where needed;
the label identifies the garment being inspected. The driver records asset hashes
before and after rendering and fails if bytes change or browser errors appear.

For a shorter authoring diagnostic, `people_wear_probe.mjs --group 0 --groups 6`
checks one sixth of the adults at rest and five phases of each clip. Run groups
0 through 5 to cover the cast. These reports explicitly remain incomplete and
cannot be aggregated into a release pass; the full sweep above is still required.

### Clearance semantics

The independent checker decodes the actual exported GLB positions, indices,
joints, weights, and inverse bind matrices. It skins vertices from the original
32-clip bank using the same quaternion interpolation as the vendored Three.js
runtime. It checks the bind pose, every saved key time, interior quaternion
component extrema, and intermediate samples. STEP changes include both sides of
the discontinuity. The report records the exact sample count and source hashes.
This is a finite, reproducible pose sweep, not a proof about arbitrary new clips
or every continuous animation time.

Raw bind-pose inputs must pass clearance before any runtime correction is
considered. For animated samples the exact bounded pose correction is applied,
stored in float32 bind-space position values, and skinned again. A separate final
containment pass then tests every referenced near/far garment vertex against the union of the
actual rendered near body, actual far body, and a conservative closed head proxy.
Overlapping anatomical components use union semantics. Within each closed
component, signed crossing multiplicity also handles a limb that folds over
itself: winding two remains occupied, and a ray crossing from two layers to one
is not an exit. Ambiguous rays use signed solid-angle winding. Boundary probes
stay local to the next distinct sheet; an internal overlapping sheet remains
occupied on both sides, while boundary tolerance applies only at the union's
exterior. These rules avoid false clears from tangencies, folded limbs, and thin
overlaps.
The retained source head
vertices must themselves remain inside that proxy at every sampled pose. Open,
nonmanifold, reversed, degenerate, malformed, or omitted body components fail;
they cannot create a false clear result. Each correction is limited to 0.18 metres
in both posed and bind coordinates, with a 2 mm surface margin. A penetration fails with resident,
garment, vertex, clip, and time. A saved report never exempts changed geometry
from a fresh check.

The fast suite checks every triangle centroid and edge midpoint for all 23
garments on the three evidence bodies, at both LODs in the fixed idle contact
pose. It retains the earlier seven-garment check and adds dedicated far-top and
seated long-bottom regressions. The seated check covers complete near/far
trousers, jeans, and leggings at `sit_idle` phase 0.25, including the hip seams and
knees. All use the same near-body, far-body and head-proxy union, after the actual
bounded pose correction, without masking covered body regions. They catch a
face crossing the body even when its three vertices are clear. Separate
self-overlap regressions compare real folded-arm poses with independent
solid-angle occupancy and exercise thin nested and coincident surfaces.

The explicit authoring utilities can fit rest vertices and contact-pose faces,
but they do not approve their output. Both authoring and pose corrections must
exit the whole body union, remain bounded, and pass the independent full sweep afterward. Tests
deliberately move a real exported garment vertex into its actual torso, corrupt
an inverse bind matrix, remove a body triangle, reverse a face, exceed budgets,
misalign packed attributes, introduce a child fit, and corrupt palette/context
inputs. These mutations must fail the same predicates used by the release gate.

See `dev/wear/REGENERATION.md` for this revision's measured results and
contact sheets.

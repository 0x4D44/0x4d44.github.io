# Garment object libraries

The adult, child and teen libraries use the same Blender entry point, material
conventions and independent Node validator. They have separate manifests and
payload budgets. The combined integration is based on current main `017eab9`,
with the child release `f0f91d2` and teen release `18a37a7` ported from `621ff65`.
Adult assets, the adult manifest, catalogue and existing tests are preserved.

| Library | Styles | Size/state objects | Design scales | Own runtime cap |
|---|---:|---:|---|---:|
| Adult | 23 | 67 | Adult reference | 2,000,000 bytes |
| Child | 17 | 90 | Small 0.55; big 0.75 | 700,000 bytes |
| Teen | 29 | 162 | Small 0.70; big 0.90 | 700,000 bytes |

Every object has a separate named LOD. The child set shares the adult palette
and print atlas; the teen set has one separate fabric atlas. These are object
libraries, with no changes to resident rigs or wearable clothing.

## Combined registration and generated data

`assets/models/manifest.json` includes both `manifest.garments_child.json` and
`manifest.garments_teen.json`. Runtime keys qualify these sets by age because
their source manifests share 56 names: for example, the child and teen cap
must remain distinct even though both GLBs contain `garment_cap_small_flat`.
Original manifest keys and GLB node names remain unchanged.

`tools/garments_data.mjs` generates `js/interiors/garments_data.js`, retaining
its existing generated header and adult exports. Its additional sized registry
records `age: 'child' | 'teen'`, `size: 'small' | 'big'`, measured dimensions,
variants and file/node bindings. The game loads both companion GLBs and selects
their named LOD roots; adult room placement and its existing loader contract
remain unchanged. Adding automatic child/teen placement is a separate task.

After rebuilding a library, regenerate and check all three sets:

```sh
node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --all --complete
node la-ladera/tools/nice.mjs node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/garments.test.mjs la-ladera/tests/garments-child.test.mjs la-ladera/tests/garments-teen.test.mjs la-ladera/tests/interiors-garments.test.mjs
node la-ladera/tools/nice.mjs node la-ladera/tests/payload.mjs
```

These commands support Node 22.16 and newer without `--test-isolation=none`.
Mutation subprocesses clear the inherited `NODE_TEST_CONTEXT`, run the selected
acceptance assertion, and require an actual test failure with exit code 1.
The combined payload gate remains 150 MB shipped and 800 MB estimated GPU
texture memory, together with all existing per-directory and file limits.
Combined acceptance output and every-test mutation evidence are in
`dev/garments-child-teen/`.

## Adult library — Part A

This is an offline object library: 23 garment types and 67 applicable states,
with a separate low-detail mesh for every state. The manifest and six packed
GLBs are in `assets/models/`; palette, print atlas and assortment recipes are
in `assets/models/garments/`. See [sources](GARMENTS-SOURCES.md) for the inspected
shape references and the original artwork policy.

The adult set is registered by the existing interior garment loader rather
than the top-level model manifest. Its assortments drive the existing adult
room placement, with procedural stand-ins as the fallback. This integration
preserves that behaviour and its unchanged tests.

### Regenerate and validate

Run from the repository root, with Node and Blender 4.5 LTS or newer available:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_build.py --
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --complete
node la-ladera/tools/nice.mjs node --test --test-concurrency=1 la-ladera/tests/garments.test.mjs
```

Set `CHROME_PATH` to a headless-capable Chrome executable, then capture all
actual GLB states, contact sheets, LOD comparisons, prints and four fixtures:

```sh
node la-ladera/tools/nice.mjs node la-ladera/tests/garments-visual.mjs --out la-ladera/dev/garments/evidence
```

Every browser is launched by the existing headless-only `tests/chrome.mjs`.
Never launch a visible Blender or browser window. If a sandbox blocks child
processes or local HTTP serving, use the environment's execution approval;
an empty log is not evidence that validation ran.

The builder reuses `furn_lib.py` for material names, coordinate conversion and
GLB export. It advances cloth frames sequentially and freezes the resulting
vertices; folds, hems and seams are static geometry. Hat crowns and brims are
authored rigid/soft forms. Every full build is staged, independently validated
from its exported bytes, and installed with its manifest last. A caught install
failure restores the previous garment directory; this is an offline update,
not a crash-atomic live deployment.

Adult regeneration stages and preserves both companion GLBs and manifests,
plus the teen texture directory, from the selected output model tree. It rejects
an incomplete companion set before replacing anything. It does not copy a
companion release from another output directory.

For selected adult experiments, use `--only tshirt,bra,cap --out /absolute/preview/models`.
A partial build cannot overwrite the shipped directory. The validator's normal
mode checks supplied assets; `--complete` additionally requires every catalogue
state, source mapping, assortment and referenced file.

### Asset contract

- Keys are `garment_<id>_<folded|hung|flat>`. Catalogue widths and lengths describe
  adult garments; manifest size, bounds and footprint measure each exported state.
- Coordinates are metres, +Y up, +Z front. Flat/folded objects have their base
  at Y=0 and centre on X/Z. Hung objects have a top support at Y=0 and extend
  downward. Hats in the flat state rest intact; stiff caps and straw hats have
  an explicit `notApplicable.folded` reason.
- Each object uses one `laundry` library material, unit UVs and linear vertex
  colours. No GLB contains textures, skins or animations. Variants use material
  tint with the existing untextured material, or the optional external 256×256
  original print atlas. Atlas tiles require a white multiplier, a two-pixel
  inset and the palette's top-left tile convention. The preview implements this
  data binding; the production material library is not altered.
- High detail is capped at 800 triangles; every separate LOD is capped at 240
  and must remove at least 40% of triangles. The manifest recommends switching
  at 8 m, culling at 30 m (16 m for tiny items), and at most 24 detailed garments
  at once. These are integration recommendations, not active runtime behaviour.
- The strict **2,000,000-byte** adult gate includes files under the garment data
  directory plus `manifest.garments.json`, excluding only the separately declared
  `garments_child.glb`, `garments_teen.glb` and `garments/teen/` only when the
  corresponding companion manifest declares that exact library. Other
  prefixed or unlisted files are not silently exempted. The
  shared palette and atlas count here once. Development screenshots, source code,
  tests and reference documentation are not runtime assets.

### Assortments and prerequisites

`assortments.json` defines 12 adult-only recipes and uses verified furniture
catalogue keys. It leaves `findIds` empty. The original adult and companion
verification reports under `dev/garments/` describe their historical builds;
the combined report under `dev/garments-child-teen/` records the current
integration. Wearable clothing is outside these object-library contracts.

## Child everyday clothing companion

The child set contains **17 garment IDs, 90 applicable size/state objects and
90 matching LOD roots**. Items are ordinary, unbranded outer clothing, plus the
explicitly requested socks, cap and footwear. No underwear, swimwear, fitted
underlayers, figures or worn outfits are generated. The school clothes are a
plain warm-white polo, navy trousers and jumper, grey pleated skirt and
sash-style tie; they do not represent a particular school's branded uniform.

Outputs are exactly:

- `assets/models/garments/garments_child.glb`
- `assets/models/manifest.garments_child.json`

The child manifest is registered exactly once in `assets/models/manifest.json`.
Its generated registry entries carry child age and small/big size tags. The
contact sheets demonstrate the assets themselves, without asserting room
placement.

### Build, validate and render

From the repository root, using the same Node and headless Blender prerequisites
as the adult set:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_build.py -- --child
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --child --complete
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --all --complete
node la-ladera/tools/nice.mjs node --test --test-concurrency=1 la-ladera/tests/garments.test.mjs la-ladera/tests/garments-child.test.mjs
node la-ladera/tools/nice.mjs node la-ladera/tests/garments-child-visual.mjs --out la-ladera/dev/garments/child-evidence
```

The final command uses `CHROME_PATH` and the existing `tests/chrome.mjs`
headless launcher. It renders every high-detail and LOD object from the actual
GLB, checks browser errors and coverage, and writes folded, hung, flat and LOD
comparison contact sheets with a `visual-report.json`. Small and big items
share a camera scale within each comparison. The preview is
`dev/garments/child-preview.html`.

`--child` always validates the complete fixed child set; it has no partial
release mode. Without `--child`, `--teen` or `--all`, the validator retains its adult
behaviour. `--json path/to/report.json` saves measured dimensions, counts,
file sizes and validation errors. `--all` reports all three libraries independently
and returns a failing exit code if any one fails. Its JSON report has `adult`,
`child` and `teen` results plus an aggregate `ok`. A custom `--catalogue` applies
only to a single adult or teen run; it cannot override the fixed child contract
or a combined run.

The tests deliberately scale real position buffers beyond the size limits,
append valid triangle indices beyond each detail budget, remove a required
key and inflate the payload. They refresh affected metadata, require the
validator to reject each input, and rerun the ordinary acceptance assertion to
prove it fails. Source assets remain untouched. Set
`GARMENTS_CHILD_PROOF_DIR=la-ladera/dev/garments/child-verification` when running
the child tests to save those intentional failing TAP transcripts.

`garments_build.py --child` dispatches to `garments_child.py`, with paired shoe
and sandal geometry in `garments_child_footwear.py`. It shares the adult
coordinate, mesh, material, simplification and export helpers. Child folds and
drape are **authored static geometry**, not a cloth simulation. The builder
stages both files, validates the exported bytes, then replaces the GLB and
manifest, restoring their previous contents if installation throws an error.

For `--child --out /absolute/preview/models`, the destination must already be a
model tree containing `garments/palette.json`, `garments/prints.png` and
`manifest.json`. The builder checks those destination resources before
replacing either child file. `--only` and a custom `--catalogue` are unsupported
for the child set. Adult regeneration preserves the child pair at that same
output destination.

### Keys, sizes and measured dimensions

Keys are `garment_<id>_<small|big>_<folded|hung|flat>`; the matching LOD node
appends `_lod`. `small` uses **0.55** of the authored adult-reference geometry
and is intended for approximately ages **4–7**; `big` uses **0.75**, approximately
ages **8–12**. These are object design scales, not fitted clothing size charts.

The following independent **longest-side ranges are in metres**. They apply to
both high and LOD geometry and are enforced from decoded vertex positions and
node transforms. F = folded, H = hung, L = laid flat. “Unfolded” means whichever
of H/L the row permits. The manifest records each state's actual X/Y/Z size,
bounds and footprint; those measurements must agree with its exported mesh.

| Garment ID | States | Small folded | Big folded | Small unfolded | Big unfolded |
|---|---|---:|---:|---:|---:|
| `tshirt_teal` | F, H, L | 0.187–0.2695 | 0.255–0.3675 | 0.396–0.5115 | 0.54–0.6975 |
| `tshirt_coral` | F, H, L | 0.187–0.2695 | 0.255–0.3675 | 0.396–0.5115 | 0.54–0.6975 |
| `tshirt_motif` | F, H, L | 0.187–0.2695 | 0.255–0.3675 | 0.396–0.5115 | 0.54–0.6975 |
| `shorts` | F, H, L | 0.1265–0.187 | 0.1725–0.255 | 0.2475–0.3355 | 0.3375–0.4575 |
| `cotton_dress` | F, H, L | 0.165–0.264 | 0.225–0.36 | 0.451–0.594 | 0.615–0.81 |
| `hoodie` | F, H, L | 0.198–0.308 | 0.27–0.42 | 0.4675–0.6325 | 0.6375–0.8625 |
| `joggers` | F, H, L | 0.1595–0.231 | 0.2175–0.315 | 0.484–0.605 | 0.66–0.825 |
| `school_jumper` | F, H, L | 0.187–0.286 | 0.255–0.39 | 0.429–0.583 | 0.585–0.795 |
| `school_polo` | F, H, L | 0.187–0.2695 | 0.255–0.3675 | 0.396–0.528 | 0.54–0.72 |
| `school_trousers` | F, H, L | 0.1595–0.231 | 0.2175–0.315 | 0.484–0.605 | 0.66–0.825 |
| `school_skirt` | F, H, L | 0.1485–0.231 | 0.2025–0.315 | 0.286–0.418 | 0.39–0.57 |
| `school_tie` | F, H, L | 0.0715–0.132 | 0.0975–0.18 | 0.209–0.352 | 0.285–0.48 |
| `socks_pair` | F, L | 0.088–0.1375 | 0.12–0.1875 | 0.165–0.242 | 0.225–0.33 |
| `cap` | H, L | — | — | 0.1485–0.198 | 0.2025–0.27 |
| `light_jacket` | F, H, L | 0.198–0.308 | 0.27–0.42 | 0.4675–0.6325 | 0.6375–0.8625 |
| `school_shoes` | L | — | — | 0.143–0.198 | 0.195–0.27 |
| `sandals` | L | — | — | 0.143–0.198 | 0.195–0.27 |

The contract lives in `CHILD_GARMENTS` and `CHILD_SIZES` inside
`garments_validate.mjs`, independently of the builder's pattern dimensions.
The validator also compares corresponding small/big dimensions, checks both
origin conventions, and rejects stale size, bounds or triangle metadata.
Socks and footwear are complete pairs. The cap remains intact; its folded
state is inapplicable. These state exceptions yield 45 objects per size.

### Materials, packing and budgets

Every child mesh uses the existing **`laundry`** material name and reuses
`garments/palette.json` plus `garments/prints.png`. Each asset declares a
`defaultVariant` from that palette. The two plain T-shirt IDs select teal and
coral; the third adds a small star motif through geometry and vertex shading.
There are no new textures, embedded images, skins or animations. As in the
adult preview, a consumer can apply the palette tint or bind the shared atlas
with its two-pixel tile inset and white material multiplier.

The **700,000-byte** child gate counts its single GLB and manifest together.
Shared adult palette/atlas files are verified and reported separately; they
are already counted by the adult gate and are not duplicated. Development
renders, tools and tests do not enter either runtime payload budget.

Each high-detail piece must contain at most **800 triangles**. Its LOD must
contain at most **240** and remove at least **40%** of the high-detail triangles.
Small and big roots share mesh buffers with uniform scale on their child mesh
nodes; named asset roots retain identity transforms. Positions and normals
remain FLOAT. UVs use normalized UNSIGNED_SHORT VEC2 and vertex colours use
normalized UNSIGNED_BYTE VEC4, standard glTF attribute formats requiring no
compression extension or decoder.

High and LOD roots occupy the **same child GLB**. A consumer must select and
clone the manifest's named high root **or** its named LOD root for an item;
adding the entire GLB scene would draw every item, both sizes and both detail
levels together. Preserve the manifest's floor-centre origin for folded/flat
objects and hang-point origin for hung objects. The manifest's LOD and culling
recommendations are data for later integration, not active game behaviour.

See `dev/garments/child-verification/` and `dev/garments/child-evidence/` for the
current validation reports, deliberate-failure proofs and rendered contact
sheets. Rebuild and recapture those records after changing geometry.
## Teen companion catalogue

A separate 29-style, two-size teen library now uses this same build entry point
with `-- --teen`, and the same independent validator with `--teen --complete`.
Use `--all --complete` to check adult, child and teen payloads together, each under
its own byte cap. The adult rebuild preserves both companion payloads. See
[GARMENTS-TEEN.md](GARMENTS-TEEN.md) for the exact state/size contract, regeneration,
external fabrics, damage tests and rendered evidence. The teen manifest is
registered beside the child manifest and its generated entries carry teen age
and small/big size tags. Small is 0.70 of the authored adult reference (roughly
ages 12–15); big is 0.90 (roughly ages 16–19). These describe prop dimensions,
not fitted clothing measurements.

# Teen garment library — verification, 31 October 2026

## Delivered result

**29 original everyday teen styles, two sizes, 162 high-detail objects and 162
matching LODs**. The generated GLB, manifest and new external fabric atlas are
present in this branch. The complete runtime payload is **679,737 bytes**, below
the **700,000-byte** limit by **20,263 bytes**.

- Branch: `codex/la-ladera-teen-garments-20261031`.
- Exact base: `621ff65dd086969373e17ae18a2eb8f01997e9be`, fetched from
  `codex/la-ladera-garment-objects-20261031`.
- The new set is **not integrated into rooms**. No `js/` file, adult runtime asset,
  adult manifest or production `manifest.json` is changed. All 151 protected
  baseline files, including 140 runtime JavaScript files, were byte-compared.
- The teen manifest is separate and is **not registered** in `manifest.json`.

## Contents

The set includes two plain T-shirts and one with an original sun print; two crop
tops; chino, cycling and denim shorts; stretch trousers, jeans and joggers; four
dress lengths; a hoodie and a light jacket; a white school polo, grey/navy school
jumper, navy/grey school trousers and skirt; paired socks, a peaked cap, plain
briefs and boxers, plain one-piece swimwear and swim shorts; paired school shoes
and sandals.

Each style has both `small` (0.70 adult-reference scale; about 12–15) and `big`
(0.90; about 16–19) roots. These are game-prop sizing labels rather than a body or
apparel sizing standard. The 16 new fabric tiles mix ordinary neutral colours
with coral, lavender, teal, olive, terracotta and the simple sun print. There are
no brands, badges, school crests or copied product graphics.

| Applicable states | High-detail objects | Matching LODs |
|---|---:|---:|
| Folded | 52 | 52 |
| Hung | 52 | 52 |
| Flat | 58 | 58 |
| **Total** | **162** | **162** |

Socks have folded/flat states, the structured cap has hung/flat states, and each
shoe/sandal pair has one flat resting state. The other 25 styles have all three.

## File and geometry budgets

All paths below are relative to `assets/models/`.

| Runtime file | Bytes |
|---|---:|
| `garments/garments_teen.glb` | 563,196 |
| `manifest.garments_teen.json` | 110,236 |
| `garments/teen/fabrics.png` | 2,474 |
| `garments/teen/palette.json` | 3,831 |
| **Total** | **679,737** |
| **Budget** | **700,000** |

The GLB has 324 named identity roots and 150 shared meshes. Both sizes share
geometry through scaled children, and the three T-shirt styles also share
geometry. Each selected object uses one mesh primitive and the existing
`laundry` material. The maximum is **232 triangles per high-detail piece**
(800 allowed) and **96 per LOD** (240 allowed); every LOD reduces triangles by
at least 40%.

The independent reader checks actual accessor and index bytes, not just manifest
claims. Positions and normals remain float32; UVs are normalized uint16 and
colours normalized uint8. No texture, animation, skin, external buffer or
required decoder extension enters the GLB.

## Validator and tests

Executed against the actual installed assets:

```text
PASS garments (complete): 67 states, 23 garments, 1840059/2000000 bytes, max 772/212 high/LOD triangles
PASS garments_teen (complete): 162 states, 29 garments, 679737/700000 bytes, max 232/96 high/LOD triangles
```

```sh
node --import ./tests/nice.mjs tools/blender/garments_validate.mjs --all --complete
node --import ./tests/nice.mjs --test --test-isolation=none --test-concurrency=1 --test-reporter=tap tests/garments.test.mjs tests/garments-teen.test.mjs
```

**37/37 tests pass, zero failures, zero skips:** 22 existing adult tests and 15
new teen tests. The teen test file independently checks every required key and
LOD, measured dimensions and 7:9 size ratios, triangle counts, payload bytes,
dress-length ordering, state exceptions and the full validator contract.

The validator has a fixed 29-style inventory and explicit dimensions/ranges in
metres. Both high-detail and LOD positions are transformed and measured from the
GLB binary. Unfolded longest-side ranges are ±10% of the specified scaled adult
reference; folded pieces have individually declared parcel ranges. The LOD
physical envelope must stay within 5% or 2 mm of the high-detail envelope. Neither
catalogue edits nor manifest budget fields can relax the independent constants.

### Deliberately broken inputs

The tests copy the real final export into temporary directories, alter those
copies, and run the **same acceptance test file** as child Node processes. Each
case below returned **exit code 1** with the named acceptance gate failing:

| Deliberate damage | Observed rejection |
|---|---|
| Delete a required T-shirt key | Required-key acceptance fails |
| Enlarge a high-detail T-shirt threefold | 1.764137 m, outside 0.529200–0.646800 m |
| Enlarge the matching LOD threefold | Same independent size gate fails |
| Append actual high-detail triangle primitives | 928 triangles, exceeding 800 |
| Append actual LOD triangle primitives | 312 triangles, exceeding 240 |
| Add 700,000 bytes of unintended payload | 1,379,737 bytes, exceeding 700,000 |

The retained TAP includes the failing child-test output. Original generated files
remain unchanged, and the clean acceptance suite passes. Further adversarial
checks reject relaxed limits/reference dimensions, unlisted GLBs and malformed
variant lists.

## Visual and independent review

The evidence uses the project's headless Three.js r180 GLB preview. It renders
all 162 detailed states and 162 LOD states, and makes 81 small/big comparisons
with a shared physical scale and camera. The overview shows all 29 styles. Full
state sheets, per-state high/LOD sheets, fabric swatches and individual detailed
images are included in `teen-evidence/`; `visual-report.json` binds them to the
exact final source and image hashes. These are asset renders, not game-room
placement screenshots.

Review caught and corrected folded trouser flaps, crossing thin-panel LODs, a
folded print UV discontinuity and a cap crown/visor gap. Final folded trousers
use a hand-arranged closed parcel; folded LODs use closed exterior shapes. Other
cloth LODs use sparse sewn original-outline panels, and the cap uses aligned
coarse profiles. Solid footwear keeps its budgeted decimated LOD. No overlapping
cloth layers are collapsed together in the final LOD path.

A separate Python/NumPy reader, importing neither generator nor validator,
confirmed the full independent key set, transformed bounds, 7:9 ratios, index
validity, nondegenerate triangles, material contract, origins, metadata,
triangle reduction and payload totals. Its final report contains SHA-256 hashes
for all four runtime files.

## Rebuild and scope safeguards

The shared entry point is `garments_build.py -- --teen`; the teen branch uses the
adult coordinate/export helpers and sequential cloth bake. The teen builder
stages files and requires independent validation before installing its own GLB,
textures and manifest, with the manifest last. It cannot overwrite the shipped
set with an experimental partial or unvalidated build.

An actual isolated adult `--only cap` rebuild was run with the complete teen
payload already present. All four teen files remained byte-identical. The adult
builder now preserves this companion set when replacing adult files. Direct
low-priority Node imports are used for validation so a silent command-wrapper
failure cannot be mistaken for a successful validation.

### Evidence files

- `teen-verification/build.log`: full Blender build and its required validation.
- `teen-verification/validator.log`: concise complete adult and teen results.
- `teen-verification/validation.json`: all measured states and expected ranges.
- `teen-verification/node-tests.tap`: clean pass and deliberately failing children.
- `teen-verification/independent-geometry.json`: independent binary audit and hashes.
- `teen-verification/adult-rebuild-preservation.json`: actual rebuild preservation.
- `teen-verification/scope-identity.json`: baseline byte identity for protected files.
- `teen-evidence/visual-report.json`: complete renders, geometry checks and hashes.

Regeneration, selection, atlas binding and size contracts are documented in
[`GARMENTS-TEEN.md`](../../tools/blender/GARMENTS-TEEN.md).

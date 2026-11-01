# Child garment objects — verification, 31 October 2026

## Delivered result

Branch: `codex/la-ladera-child-garments-20261031`.

Base: `621ff65dd086969373e17ae18a2eb8f01997e9be`, the tip of
`origin/codex/la-ladera-garment-objects-20261031` when this branch was created.
The fetched `origin/main` did not yet contain the adult garment commit, so this
work branches directly from the requested adult-library commit.

The generated child GLB and its separate manifest are present. They provide
**17 everyday clothing types, two sizes, 90 applicable object states and 90
LODs**. This is an object library for subsequent room wiring. It is not placed
in rooms, registered with the main manifest, or assigned to characters.

The new types are plain teal and coral T-shirts, a T-shirt with a small star
print, loose cotton shorts, a short-sleeved cotton dress, a hoodie, loose
joggers, a school jumper, a warm-white school polo, navy school trousers, a
grey pleated school skirt, a sash-style school tie, paired socks, a plain cap,
a light jacket, paired school shoes and paired sandals. Shapes are original,
unbranded empty clothing objects. The child catalogue has no underwear,
swimwear, sleepwear, fitted base layers, body meshes or worn clothing.

| State | Garment types | Both sizes | Corresponding LODs |
|---|---:|---:|---:|
| Folded | 14 | 28 | 28 |
| Hung | 14 | 28 | 28 |
| Flat | 17 | 34 | 34 |
| **Total** | | **90** | **90** |

Socks have folded and flat states. The cap has hung and flat states; its stiff
peak is stored intact. Each footwear pair has one flat state. Every other
garment has all three states.

## Measured payload and geometry

| File or measurement | Result | Limit |
|---|---:|---:|
| `assets/models/garments/garments_child.glb` | 540,212 bytes | |
| `assets/models/manifest.garments_child.json` | 73,916 bytes | |
| **New child runtime payload** | **614,128 bytes** | **700,000 bytes** |
| Remaining new-payload allowance | 85,872 bytes | |
| Shared existing `palette.json` | 3,038 bytes | Reused |
| Shared existing `prints.png` | 7,605 bytes | Reused |
| Child files plus shared palette and atlas | 624,771 bytes | Under 700,000 even if counted again |
| Maximum high-detail triangles per piece | 414 | 800 |
| Maximum LOD triangles per piece | 160 | 240 |
| High-detail triangles across all 90 instances | 22,564 | Per-piece gate |
| LOD triangles across all 90 instances | 8,816 | Per-piece gate |
| Named GLB roots | 180 | 90 high + 90 LOD |
| Unique shared meshes | 84 | |
| Material primitives per selected object | 1 | One `laundry` material |

Development renders, test logs, source code and this report are excluded from
the runtime payload gate. The existing adult library remains 1,840,059 bytes.

Both sizes share geometry buffers below separate identity roots. The small
mesh instance scale is **0.55**, for approximately ages **4–7**; the big scale
is **0.75**, for approximately ages **8–12**. T-shirt colour alternatives also
share geometry. The manifest records measured dimensions, bounds, footprint,
origin, default palette variant and the matching LOD for every key.

The validator checks decoded positions and descendant transforms against
independent, fixed metre ranges for every garment, size and state. These ranges
are declared in `CHILD_GARMENTS` in the same `garments_validate.mjs` and listed
in the [pipeline guide](../../tools/blender/GARMENTS.md#child-everyday-clothing-companion).
Examples of actual longest dimensions:

| Flat object | Small | Big |
|---|---:|---:|
| T-shirt | 0.462 m | 0.630 m |
| Cotton dress | 0.524 m | 0.714 m |
| School trousers | 0.561 m | 0.765 m |
| Pleated skirt | 0.374 m | 0.510 m |
| Pair of school shoes | 0.1705 m | 0.2325 m |

Positions and normals remain float32. UVs use standard normalized uint16 and
vertex colours use standard normalized uint8; no compressed-mesh decoder or
required glTF extension is introduced. There are no images, textures, skins or
animations inside the GLB. The existing adult palette and external print atlas
are reused unchanged.

## Passing validation

Command from the repository root:

```sh
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --all --complete
```

Actual final output:

```text
PASS garments (complete): 67 states, 23 garments, 1840059/2000000 bytes, max 772/212 high/LOD triangles
PASS garments_child (complete): 90 states, 17 garments, 614128/700000 bytes, max 414/160 high/LOD triangles
```

The final [validator log](child-verification/validator.log) and
[decoded-geometry report](child-verification/validator.json) accompany the files.
The build independently validates its staged exported bytes before installing
the child GLB and manifest. See the [build log](child-verification/build.log).

## Tests and deliberate failures

**39 of 39 tests pass: 17 child tests and all 22 existing adult garment tests.**
This is the garment-specific suite, not a claim that the entire game test suite
was rerun. The [passing TAP transcript](child-verification/tests-pass.tap)
records the final assets.

The corruption tests copy the actual files to temporary directories and mutate
binary positions or index buffers. They refresh accessor bounds, manifest
dimensions and counts, file lengths and SHA256 values. Their failures therefore
exercise the actual limits rather than merely stale metadata. Each then runs
the ordinary corresponding acceptance test in a subprocess and requires exit
status 1. Source hashes are checked afterward to confirm the shipped files were
not changed.

| Deliberate input break | Observed rejection | Saved failing ordinary test |
|---|---|---|
| Scale a small T-shirt's actual POSITION bytes up 10× | 4.620 m outside 0.396–0.5115 m | [Oversize](child-verification/reject-oversize.tap) |
| Scale actual POSITION bytes down to 25% | 0.1155 m outside 0.396–0.5115 m | [Undersize](child-verification/reject-undersize.tap) |
| Append valid detailed-mesh triangle indices | 801 triangles exceeds 800 | [High triangles](child-verification/reject-high-triangles.tap) |
| Append valid LOD triangle indices | 241 triangles exceeds 240 | [LOD triangles](child-verification/reject-lod-triangles.tap) |
| Remove a required manifest key | Exact coverage assertion fails | [Missing key](child-verification/reject-missing-key.tap) |
| Add payload to an otherwise valid GLB | 1,424,918 bytes exceeds 700,000 | [Payload](child-verification/reject-payload-budget.tap) |

Each intentional-failure transcript records one failed ordinary test. The
enclosing adversarial tests pass because those failures are required.

Reproduce from `la-ladera/`:

```sh
GARMENTS_CHILD_PROOF_DIR=dev/garments/child-verification \
node tools/nice.mjs node --test --test-isolation=none --test-reporter=tap --test-concurrency=1 \
  tests/garments-child.test.mjs tests/garments.test.mjs
```

## Actual GLB renders

The headless preview uses the repository's Three.js r180, material library,
exported GLB and adult atlas. Both sizes share a camera within each comparison,
so their relative physical size is visible. Every high-detail state and LOD was
rendered, with no browser, network or console errors.

- [Folded contact sheet](child-evidence/contact-folded.jpg): 28 objects.
- [Hung contact sheet](child-evidence/contact-hung.jpg): 28 objects.
- [Flat contact sheet](child-evidence/contact-flat.jpg): 34 objects.
- [High-detail/LOD comparison](child-evidence/contact-lod.jpg): all 17 types.
- [Visual report with source hashes](child-evidence/visual-report.json).
- [Final capture log](child-verification/visual.log).

Review caught and corrected a print intersecting the cloth, excessively
overlapping flat socks, a decimated cap rim and incomplete sandal LOD strap
surfaces. Prints and seams now attach to the triangulated cloth surface; the
cap LOD is authored at lower resolution. Final sheets show intact star prints,
two separate sock silhouettes, a clean cap rim and recognizable footwear.

## Scope and handoff

The [scope check](child-verification/scope.json) compares 151 protected files
against the base commit: all **140 files under `js/`**, the main registration
manifest and the existing adult runtime files are byte-for-byte unchanged.
No new manifest entry was added to `assets/models/manifest.json`.

The shared GLB contains both detail levels and all keys. A future consumer must
select the named object root and its matching LOD from the manifest; adding the
whole GLB scene would draw every garment at once. Palette selection uses each
entry's `defaultVariant`, and the existing origin convention is retained.

The adult builder preserves the destination's child GLB/manifest pair when
regenerating its own assets. An actual isolated adult-cap rebuild preserved the
child pair, shared resources and registration manifest by SHA256, then passed
child validation again; see the [preservation check](child-verification/regeneration-preservation.json).
Child `--out` expects an existing model tree with
the adult palette, print atlas and main manifest. See the pipeline guide for
all regeneration commands and the full dimension table.

Final artifact SHA256 values:

```text
garments_child.glb
1c6c3c7c30cff154cc73f450e9efb25f2af279f2f2fd871fc619267d3ff1dfb2

manifest.garments_child.json
7fb41efca5a233702342ce71609db8294b3769354098e27f397d5a8dd5fbfc8d
```

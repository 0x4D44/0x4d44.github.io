# La Ladera body rebuild v2

Rebuilt all **30 residents** from authorized base
`8f93ade042cdb4bfc1a796b889bbe39786241ebf` on
`codex/la-ladera-bodies-v2`. The deliverable includes both production GLBs, all
three existing atlas pages, metadata, the refreshed six-file inventory, source
generators and review evidence. Changes are confined to `la-ladera/`.

## What changed

The torso now follows a shaped ribcage, waist and shoulder slope. Arms have
deltoid volume, distinct upper-arm/forearm profiles, an elbow transition and a
taper into the wrist. Hands have shaped palms, thenar volume, separated curved
fingers, opposed thumbs and near-view nails. The existing hand bones drive this
geometry; no finger bones or animation channels were added. Legs have separate
thigh, knee, calf and ankle profiles. Footwear has shaped toe boxes, uppers,
separate soles and style-specific seams, laces or sandal straps.

The trouser rise and both legs form a continuous branching surface with a shared
crotch seam. It replaces the old pelvis block and overlapping thigh caps. The
weights blend across the rise and separate below the crotch. Covered upper
trouser surfaces are omitted beneath untucked garments, and tucked shirts clear
the belt. Garments include turned sleeve/cuff and hem edges, waist/knee/elbow
folds, fitted pockets, shirt plackets, coat openings and welt pockets. The skirt
hem also has a real return rather than coincident faces.

The wardrobe keeps each resident's established role, age, skin and hair casting,
with 30 explicit clothing palettes and wear levels. Generated interlaced yarn
normals and roughness distinguish cotton, denim, suit cloth, wool, jersey and
knit. Recolourable stripes and checks use the two previously unused atlas cells;
contrasting panels and original botanical motifs add two-tone and printed
garments. All details continue to share the existing material and primitive.

### Named defects

| Defect | Repair and evidence |
| --- | --- |
| Jaw edges / flat pink mouth wedge on `m_don`, `m_elder`, `m_abuelo`, `w_elder` | Protect the anatomical lips and jaw during body reduction; confine lip tint to the vermilion ridge; pull the open head rim inside the neck. Compare the head/neck sheets below. |
| Faceted pelvis on `m_tendero`, `m_vendedor`, `m_abuelo`, `m_don`, `b_escolar`, `m_mecanico` | Continuous trouser rise and shared seam, blended hip/thigh weights, shaped leg profiles and corrected belt clearance. The eight-resident sheets show three of these; the all-cast sheets show all six, including walking and seated poses. |
| Blue strip below `m_panadero`'s apron | End the tucked shirt at its actual waist and omit the redundant lower shirt shell. The front and three-quarter sheets show the repaired overlap. |
| Far-LOD `m_afro` specks | Omit separate curl accents from the far recipe, keep its continuous hair cap and constrain atlas/recolour regions during reduction. The diagnostic far sheet shows a clean shirt. |
| Beard shell and colour-edge artifacts exposed during this rebuild | Replace the separate beard shell with a feathered per-vertex tint on the skin surface. It adds neither a material edge nor extra facial geometry. |
| Short sleeves lost during far reduction | Preserve the twelve shared cloth/skin cuff vertices on short-sleeved residents while allowing other small far details to simplify. |

## Measured budgets

Counts come from the exported binary accessors and the complete validator. File
sizes and texture dimensions are also recorded in the before/after JSON reports.
MiB below means 1,048,576 bytes.

| Measurement | Base | Rebuilt | Required / retained gate |
| --- | ---: | ---: | --- |
| Residents, near and far | 30 / 30 | 30 / 30 | 30 / 30 |
| Near triangles per resident | 6,181–6,182 | **6,732–7,782** | Existing **8,000**, stricter than requested 9,000 |
| Far triangles per resident | 1,416–1,432 | **1,417–1,424** | **1,500** |
| Near triangles across all 30 | 185,438 | 227,466 | Per-resident gate above |
| Far triangles across all 30 | 42,683 | 42,657 | Per-resident gate above |
| `people.glb` | 6,302,176 B / 6.0102 MiB | **6,989,112 B / 6.6653 MiB** | **8 MiB** |
| `people_lod.glb` | 1,977,764 B / 1.8861 MiB | **1,909,016 B / 1.8206 MiB** | 1,500 triangles per resident |
| Six-file people inventory | 9,380,060 B / 8.9455 MiB | **9,909,777 B / 9.4507 MiB** | Existing people payload gate unchanged |
| Albedo / normal / ORM dimensions | 2048² / 2048² / 1024² | **Unchanged** | Existing three pages |
| People GPU textures, RGBA8 plus mipmaps | 48 MiB | **48 MiB; +0 MiB** | Increase no greater than 20 MB |
| Whole-game estimated GPU textures | 246.3 MiB | **246.3 MiB** | No increase |

The atlas remains 8×8. Cells 0–61 keep their indices; new stripe/check fabric
occupies previously unused cells 62–63. Material names, recolour slots, asset
filenames and runtime loading code are unchanged. No test, validator, contract
fixture or budget was deleted, weakened or raised.

All 21 bone names and parents are retained. A comparison against the base GLB
found numerically identical local rest transforms and byte-identical inverse
bind matrices when matched by bone name. All **32 clips and 672 rotation tracks**
remain byte-exact; the common rotation signature is
`24af871aaa2e54baf066004f122c39268fb84e241cdbbd86ba9c317420499c16`.
The exporter's internal joint ordering differs from the base, but the two new
LODs agree exactly and weights/tracks use the corresponding mapped bones.
The [binary compatibility result](validation/compatibility.json) records this
comparison against the authorized Git base.

## Before / after at 1.600 m

Each sheet contains the same eight residents: `m_tendero`, `m_don`, `m_elder`,
`m_abuelo`, `w_elder`, `m_panadero`, `m_afro`, `w_ama`. These are screenshots of
the shipped GLB geometry and materials, rendered through the existing Three.js
loader; they are not painted mockups.

| View | Before | After |
| --- | --- | --- |
| Full body, front | [Before](before/near-front.png) | [After](after/near-front.png) |
| Full body, three-quarter | [Before](before/near-threequarter.png) | [After](after/near-threequarter.png) |
| Full body, back | [Before](before/near-back.png) | [After](after/near-back.png) |
| Walking | [Before](before/near-walk.png) | [After](after/near-walk.png) |
| Far LOD, deliberately inspected close up | [Before](before/far-front.png) | [After](after/far-front.png) |
| Torso / hands, labelled detail crop | [Before](before/torso-hands.png) | [After](after/torso-hands.png) |
| Head / neck, labelled detail crop | [Before](before/head-neck.png) | [After](after/head-neck.png) |

The full-body camera is at 1.600 m **horizontal distance from the character
root**, height 1.000 m, aimed at `[0, 0.900, 0]`, with a fixed 74° vertical FOV.
The labelled torso/hand and head/neck crops keep the same distance and use 36°
and 21° lenses. Lighting, metre scale and animation phase match before/after;
there is no per-character automatic fitting. The diagnostic far sheet uses
this same close camera; the game's existing 32/38 m LOD hysteresis is unchanged.

Both [before](before/body-shots.json) and [after](after/body-shots.json) reports
record all six asset hashes, texture headers, cameras, triangle counts and pixel
masks. Each full-body sheet verifies every posed vertex lies in frame, a
nonblank silhouette and no silhouette pixels on the image edge. Captures have
no page, network, shader, material or animation errors. Detail crops are
explicitly exempt from full-body clipping checks.

Additional final-cast evidence:

- [All 30, near](all-cast/people-near.png) and [far](all-cast/people-far.png).
- [Walking](all-cast/people-walk.png), [seated](all-cast/people-sit_idle.png) and
  [portraits](all-cast/people-portraits.png).
- [All-cast report](all-cast/people-shots.json): 30 IDs, 32 clips,
  **374,592 posed vertex checks**, `ok: true`, no failures. This run used
  `--skip-boot`; it checks the asset/animation gallery rather than repeating the
  separate game-boot/fallback suite.

## Required acceptance output

All three requested commands exited **0** on the final six assets. They were
run with `LADERA_PRIO=idle` and `nice -n 19`. Browser checks used the existing
headless, muted, quiet-input wrapper. No mouse or speaker interaction occurred.
The [acceptance record](validation/acceptance.json) binds these results to the
final asset hashes and records their exit codes.

```sh
node la-ladera/tools/blender/people_validate.mjs --complete
```

```text
PEOPLE OK: 30 IDs, 32 clips, 9.45 MiB (complete)
```

The [complete output](validation/people-validate.log) includes all 30 actual
near/far triangle counts and their unchanged limits.

```sh
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-assets.test.mjs la-ladera/tests/people-art.test.mjs la-ladera/tests/people-legs.test.mjs
```

```text
✔ la-ladera/tests/people-art.test.mjs (417.252717ms)
✔ la-ladera/tests/people-assets.test.mjs (4054.474179ms)
✔ la-ladera/tests/people-legs.test.mjs (13006.495471ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13040.520612
```

This environment reports the three test files at the outer Node runner level.
The [unmodified command output](validation/people-tests.log) is preserved.

```sh
node la-ladera/tests/payload.mjs
```

```text
ok   textures                                                12.0 / 24 MB
ok   models                                                  22.0 / 32 MB
ok   models/people                                            9.5 / 14 MB
ok   models/furniture                                         5.2 / 10 MB
ok   models/world                                             0.0 / 6 MB
ok   models/arch                                              0.0 / 2 MB
ok   shipped total (excl. vendor,dev,labs,tests,tools)       36.7 / 150 MB
ok   estimated GPU texture memory                           246.3 / 800 MB
PAYLOAD OK
```

The [full payload output](validation/payload.log) includes its largest-file list.
The existing game-wide gate is 800 MiB; this change also independently satisfies
the tighter requested **zero-growth / +20 MB people** texture constraint.

At the authorized base, complete validation found a stale byte count/hash for
`people_meta.json` in `manifest.people.json`. Regeneration refreshed the exact
six-file inventory normally; the validator and its failure checks were not
changed. [Base validator output](validation/base-people-validate.log) records
that pre-existing failure.

## Reproduce and provenance

The final build used Blender **4.5.11 LTS**, matching Python 3.11 / Pillow 12.0.0,
Node **24.22.1**, and Chrome Headless Shell **156.0.8078.80**. The render reports
identify ANGLE / SwiftShader. These are functional and visual checks; software
rendering does not establish the separate hardware frame-time benchmark.

See [PEOPLE.md](../../tools/blender/PEOPLE.md) for the build recipe. Regenerate
near and far before refreshing the inventory. With `CHROME_PATH` set to a
headless-capable Chrome binary, the evidence commands are:

```sh
LADERA_PRIO=idle nice -n 19 node la-ladera/tests/people-bodies-shots.mjs \
  --label after --out la-ladera/dev/people-bodies-v2/after
LADERA_PRIO=idle nice -n 19 node la-ladera/tests/people-shots.mjs \
  --skip-boot --gpu swiftshader --out la-ladera/dev/people-bodies-v2/all-cast
```

For a before capture, extract the same six filenames from the authorized base
into `la-ladera/dev/people-bodies-v2/.work/before-assets/`, and pass
`--base ../dev/people-bodies-v2/.work/before-assets/ --label before` to the new
runner. The base manifest inconsistency does not alter those archived bytes.

The new body meshes, garment details, botanical motifs and fabric generators are
**original procedural CC0-1.0 work**. No downloaded body, garment, texture, logo
or print was introduced. The inherited MakeHuman head/morph data remains CC0
with its pinned provenance and licence in
[MAKEHUMAN_SOURCE.md](../../tools/blender/vendor/MAKEHUMAN_SOURCE.md) and
[MAKEHUMAN_CC0.txt](../../tools/blender/vendor/MAKEHUMAN_CC0.txt). Source file
headers also record the new procedural work's licence.

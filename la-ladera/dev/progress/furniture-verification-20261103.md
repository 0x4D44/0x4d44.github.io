# Furniture library verification and repairs — 3 November 2026

The empty-manifest snapshot in the task brief had already been superseded.
The starting revision, `f2d425248c01ce8cefd512dad8cfa386912d55d7`, contained
224 catalogue assets in four actual Blender GLBs, their populated manifest,
and the live material-batched loader. This work verifies that delivery, repairs
four visible support defects, and makes the visual gate inspect the correct
models without disabling working opening furniture.

While verification ran, `main` advanced by two interior-layout commits. The
review branch applies the verified changes to
`831f2fd11c96f1afec6c7b6a3521b3a6c5ee707e`. Test provenance below distinguishes
the original full regression run from the checks on that updated base.

## Actual generated files and budget

| File under `assets/models/` | Catalogue assets | Actual bytes |
| --- | ---: | ---: |
| `furniture/furn_details.glb` | 58 | 1,130,876 |
| `furniture/furn_home.glb` | 56 | 961,340 |
| `furniture/furn_living.glb` | 53 | 1,080,624 |
| `furniture/furn_shop.glb` | 57 | 2,231,540 |
| **Base library** | **224** | **5,404,380** |

The populated `manifest.furniture.json` is 139,785 bytes. The base GLBs and their
manifest total **5,544,165 bytes**, below the stricter decimal 10,000,000-byte
budget. Including the three existing hero GLBs and both manifests totals
**7,066,306 bytes**; the 47 heroes override catalogue keys, rather than adding
47 to the unique asset count. No new runtime textures or decoder are required.

All 224 base assets were rebuilt using the existing catalogue and builders with
**Blender 5.2.1 LTS**, via its official `bpy` module under Python 3.13.16.
The staged complete build passed the independent byte-level validator. The
original build reproduced three of four base bundles byte for byte; the fourth
had identical JSON and size, with one triangle index selecting between two
vertices with identical position/UV and normals differing by about 0.0001 in Z.
The original unchanged bundle was retained. All three original hero bundles
reproduced byte for byte.

Only the affected base and hero living-room bundles were installed after the
repairs. Their named-root geometry comparison identifies exactly the four base
keys and two hero keys described below. The base manifest's size, digest and
measured chair bounds match the installed GLB. The hero manifest maps names and
layout metadata; none of its fields changed, so it remains unchanged. The base
library contains **87,474 triangles**, the same as before these repairs.

## Support geometry and regression checks

| Model | Verified defect | Repair |
| --- | --- | --- |
| `table_formica_4`, `table_formica_6` | Legs stopped 10 mm below the tabletop, in both base and hero sets | Extend legs by 20 mm, placing their open ends 10 mm inside the top |
| `stool_plastic` | Legs stopped 5 mm below the seat | Extend legs by 15 mm, placing their ends 10 mm inside the seat |
| `chair_metal` | Leg centres sat outside the seat's depth | Move them from ±0.4D to ±0.3D, underneath the seat and in line with the rear posts |

The existing support rule previously excluded these models. Adding them first
produced **six failures** against the original files. Regeneration then passed
**41/41 leg tests**, including a new requirement that each affected model retains
all four supports. No triangles were added. The other stool and rocking-chair
branches are unchanged. Catalogue sizes, footprints, collisions and anchors are
unchanged.

Eight independent Blender Cycles CPU closeups compare the original and repaired
GLBs with identical cameras and the existing game textures, metric UVs, vertex
colours and material properties. The support junctions were inspected; the
corrected legs enter the seat/top instead of floating below or alongside it.

## Correct model-only visual verification

The old contact-sheet tool called the production room builder for every key
and required every result to be a GLB. That stopped at `nightstand_a`: the game
now deliberately draws hollow procedural carcasses for 38 opening-furniture
keys. It also loaded the full registry, allowing hero models to substitute for
the base models that the sheet purported to inspect.

The repaired tool defaults to **base-library-only** loading. `--source runtime`
explicitly inspects the effective models, including hero overrides. Each sample
uses the existing production `drawGlb` implementation, shared materials and
batching, tint multiplication and variant selection. Exporting that function
does not change the production rendering policy. Model-only inspection and
actual-world checks are labelled separately.

The three new Node regressions prove actual base/hero source selection, direct
GLB inspection of an opening nightstand while its world placement retains its
carcass, and rejection of a missing root without a procedural substitute.

The visual check also uses bounded asynchronous WebGL2 pixel readback. The
previous blocking readback provoked four driver stall warnings. All **224
visible-pixel counts were identical** before and after the change; the revised
check passes the existing strict warning gate without filtering warnings.

Browser model-inspection results:

- **224 base models**, nine labelled contact sheets, zero stand-ins or failed
  samples, all four GLB requests HTTP 200.
- **Six effective-model samples**: both repaired Formica tables, the plastic
  stool, metal chair, opening nightstand and double bed; all seven effective
  GLB requests HTTP 200 and per-sample source-file checks passed.
- Both runs had **zero application errors, page exceptions, failed requests,
  console errors or warnings**. Every model produced visible pixels with the
  studio floor hidden.
- All nine base sheets and the effective-model sheet were visually inspected.
  These are model-file views: runtime fan rotors, opening carcasses and room
  add-ons are checked separately.

## Actual-world integration on the updated base

The full production page loaded **224 catalogue keys from seven GLBs** and built
**109 buildings**. Every building's counters matched its furnishing records:
**13,987 GLB placements**, **3,337 procedural decals**, **1,465 opening
carcasses**, and **zero failed records**. Every required model request returned
HTTP 200. The intentional procedural paths and missing-model fallbacks remain.

All representative furniture groups were visible, and all seven sampled views
passed the existing stricter 1,800-call / 2.5-million-triangle test limits:

| View | Draw calls | Triangles |
| --- | ---: | ---: |
| Spawn street | 1,245 | 2,339,885 |
| L80 house | 826 | 1,756,044 |
| L71 apartments | 847 | 1,824,096 |
| L81 shophouse | 847 | 1,683,482 |
| L00 school | 437 | 939,066 |
| L09 clinic | 1,140 | 2,179,905 |
| L44 workshop | 1,033 | 1,929,041 |

**The full-world test is not an all-green result in this environment.** Its
final clean-console assertion fails on three `GPU stall due to ReadPixels`
driver warnings. All placement, loading, application-error and render-budget
assertions before that assertion pass. The same check on an untouched archive
of the starting revision reproduced the same three warnings and identical
render counts to the patched starting revision. No warning assertion or filter
was relaxed. The later interior changes alter the placement and render counts
to the table above; they retain the same warning-only failure.

The actual-room tour, on the starting revision with the repaired assets,
produced **30 captures**, zero capture/application/network/console errors and
four readback driver warnings from the existing screenshot path. Representative
living room, bedroom, kitchen, dining room, school, grocery, bakery, clinic and
workshop images were inspected. Five automatic camera selections had no clear
corner and used the helper's existing fallback: patio L00, office L00,
clinic-office L09, clinic-bathroom L09 and workshop L11. A wardrobe edge partly
obscures the bedroom view; the clinic privacy screen hides part of its bed.
Those views are not presented as unobstructed visual coverage.

## Regression provenance and reproduction

- On the updated base, **111/111 focused tests pass**: the furniture pipeline,
  real runtime loader, support geometry, visual-source tests, hero catalogue,
  and the three new upstream interior suites (`interiors-nooks`,
  `interiors-obra`, `interiors-shops`).
- Complete byte-level validation passes **224/224** assets on the updated base.
  The application payload check, JS/Python syntax checks and `git diff --check`
  also pass.
- The broader **167-file non-browser sweep** completed on the original base
  with these furniture changes: **1,969 tests, 1,967 passed, one failed, one
  skipped, zero cancelled and zero todo**; exit code 1. The only skip is the
  Windows `.cmd` wrapper test on Linux. Node reported 3,262,373.547 ms
  (54 minutes 22 seconds). This run is separate from the 111/111 updated-base
  result above.

The broad run exposed an existing failure in `people-assets.test.mjs`:
`manifest.people.json: stale bytes/SHA-256 for people/people_meta.json`.
The manifest records 45,255 bytes, while the actual metadata is 42,675 bytes;
their SHA-256 digests also differ. Both files are byte-for-byte unchanged from
the starting revision, and independent validation of that revision reproduces
the mismatch. This furniture change does not modify either people file.

The browser environment is Linux, Node 24.22.1 and Chrome Headless Shell
136.0.7103.25 with software WebGL. The dedicated headless binary uses the
repository's unchanged quiet Chrome harness; full desktop Chrome cannot create
its singleton IPC socket in this environment. These checks establish model
loading, geometry, visual appearance and render work, not target-hardware FPS or
boot-time performance. The 23 broader browser test files were not part of the
non-browser sweep; the furniture-specific world and studio checks were run
separately.

```sh
node la-ladera/tools/blender/furn_validate.mjs --complete
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/furniture-pipeline.test.mjs la-ladera/tests/furniture-runtime.test.mjs la-ladera/tests/furniture-legs.test.mjs la-ladera/tests/furniture-visual.test.mjs la-ladera/tests/interiors-catalog.test.mjs
node la-ladera/tests/furniture-visual.mjs
node la-ladera/tests/furniture-visual.mjs --source runtime --only table_formica_4,table_formica_6,stool_plastic,chair_metal,nightstand_a,bed_double
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/furniture-world.test.mjs
node la-ladera/tests/interiors-shots.mjs auto .scratch/furniture/rooms
node la-ladera/tests/payload.mjs
```

Set `CHROME_PATH` to a compatible headless Chrome executable for browser checks.
Full generation and preview commands remain in
[`tools/blender/FURNITURE.md`](../../tools/blender/FURNITURE.md).
La Ladera uses native ES modules and has no application bundler build step.

Per project convention, downloaded tools, logs and rendered images remain in
scratch. Evidence under `.scratch/furniture/` includes the build and rebuild
logs, byte-comparison summary, before/after support images, both studio reports,
the room-tour report and images, complete non-browser run, focused checks on
the updated base, full-world runs and untouched-base control. The tracked
builders, generated bundles, manifest and regression scripts reproduce the
deliverable.

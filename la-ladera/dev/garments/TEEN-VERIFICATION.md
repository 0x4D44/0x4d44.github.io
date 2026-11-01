# Teen garment library: verification of this integration

This records what was run to bring Codex PR #82's teen garment set (head `a1a1152`, base
`017eab9`) onto the child-library mechanism of PR #80 (`aa455e0`): the teen bytes, the
combined validator, the data module and loader, the tests and the browser. #82's own build
evidence (the Blender 4.5.3 build log, independent geometry measurements, adult-rebuild
preservation: 346 KB under `dev/garments/teen-verification/`) stays at a1a1152 and is not
copied, because it records #82's base, not this one. The library is described in
`tools/blender/GARMENTS-TEEN.md`, its uses in `TEEN-PLACEMENT.md`. Nothing here places a teen
garment in a room.

## The bytes are #82's

The five files below have the same SHA-256 as in #82 (a1a1152), and the five source hashes in
#82's `teen-evidence/visual-report.json` all match them, so those renders show these files.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/models/garments/garments_teen.glb` | 563,196 | `c081a8b821a187e97634ff0d07bc5faf6813bed9faf4771c10907a1c41726f35` |
| `assets/models/manifest.garments_teen.json` | 110,236 | `31479045fb49755317fffeb8809b662b4023ba2fd73435e5cc7fda8e55f725d6` |
| `assets/models/garments/teen/palette.json` | 3,831 | `87fdd2580ac08732ec308056fa50207950ee3bde9ad1f0ca5553ee9d3fd3b5c2` |
| `assets/models/garments/teen/fabrics.png` | 2,474 | `ca247ef2b7c7db9e60aca366d1eaf900d3c5f1b46459810e27347799254c1c99` |
| `tools/blender/garments_teen.catalog.json` | 13,244 | `56317732b0c95ddf29a3ab80162ac1958e572f7381fc2ecfd44a86b370178fdb` |

Not taken from #82: its child set (`f0f91d2`; #80's child library and mechanism stay), its
age-keyed asset-key changes in `js/core/assets.js` (the teen keys register through
`registerGarmentAssets` like the child keys), its edits to the child validator and tests, and
its child-part evidence.

## The validator (`garments_validate.mjs --all --complete`)

One command validates the three libraries, each against its own caps. Node v22.16.0:

```
PASS garments (complete): 67 states, 23 garments, 1840059/2000000 bytes, max 772/212 high/LOD triangles
PASS garments-child (complete): 57 states, 20 garments, 1628852/2500000 bytes, max 872/212 high/LOD triangles
PASS garments_teen (complete): 162 states, 29 garments, 679737/700000 bytes, max 232/96 high/LOD triangles
```

The adult and child numbers are the ones the base tree prints: both were run in a pristine copy
of `2a94f0b` (`PASS garments (complete): 67 states ... 1840059/2000000` and `PASS garments
(complete): 57 states ... 1628852/2500000`). The child line now reads `garments-child` instead
of `garments`, so that `--all` shows three distinct lines; nothing else about it changed.

Teen: 29 styles in two sizes, 52 folded + 52 hung + 58 flat = 162 states and 162 LODs. The
runtime payload is the GLB, the manifest and everything in `garments/teen/`, with 20,263 bytes
of headroom. A CRLF checkout (`core.autocrlf=true`, as on the Windows boxes) adds 187 bytes:
`palette.json` has 186 line breaks and the manifest one. Run on CRLF copies of those two files,
the teen validator reports `679924/700000 bytes` and passes, 20,076 bytes of headroom. The
adult scan leaves the teen files inside `garments/` to the teen validator only while
`manifest.garments_teen.json` declares the library.

## Run time

- The clothes load asks for seven files: the six adult and child LOD GLBs and the one teen GLB
  (+563,196 bytes). No teen manifest, palette or atlas is fetched. `ctx.garmentGlb` holds all
  286 keys (67 adult, 57 child, 162 teen).
- The real page, headless Chrome through `tests/chrome.mjs` (`tests/garments-teen-boot.mjs`,
  report in `teen-evidence/browser-boot.json`): as shipped, the seven requests, 286 keys, no
  page, console or network error; with `garments_teen.glb` refused, 124 keys (adult and
  child), no teen key, the one expected failed request, no page or console error. The first
  frame is the same in both runs (1224 draw calls, 2,424,195 triangles): nothing places a teen
  garment yet.
- `tests/payload.mjs` (base, then this tree): shipped total 39.5 to 40.2 of 150 MB, models
  24.5 to 25.2 of 32 MB, estimated GPU texture memory 246.3 to 246.7 of 800 MB (the 256 x 256
  atlas is counted; the game does not bind it).
- The furnished world of the 109 real buildings (17,449 records, 594 garment records, all
  adult) hashes the same in the base tree and in this one: records, garment records and the
  garment statistics (SHA-256 `1a8388c3...`, `4cfb4e7c...`, `b291f4d5...`). Adult and child
  clothes did not change.

## Tests (Node v22.16.0, stdin closed, `--test-concurrency=1`)

```
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 \
  la-ladera/tests/garments.test.mjs la-ladera/tests/garments-teen.test.mjs la-ladera/tests/garments-teen-validate.test.mjs \
  la-ladera/tests/interiors-garments.test.mjs la-ladera/tests/interiors-garments-teen.test.mjs \
  la-ladera/tests/interiors-rails.test.mjs la-ladera/tests/interiors-contents.test.mjs
```

95 tests, 95 pass, 0 fail, 92 s (garments 22, garments-teen 15, garments-teen-validate 8,
interiors-garments 23, interiors-garments-teen 14, interiors-rails and interiors-contents 13).
New: `garments-teen-validate.test.mjs` (8: the combined CLI and its arguments, a failing library
in `--all`, the adult and child reports with and without the teen files, the adult scan's
exemption, the teen complete-mode checks) and `interiors-garments-teen.test.mjs` (14: the data
module against the validator's own garment/size/state list, the 9/7 size ratio, the teen
palette, the registration, the guard that no garment manifest is in the root manifest, the
one-request load, drawing all 162 keys from their GLB, the tint rule, three recovery cases, the
generator's refusals, the recipes and the recipe checks). `garments-teen.test.mjs` (15, #82's,
unchanged) runs its nested mutation checks as ordinary child processes (its own comment: default
process isolation, no `--test-isolation=none`), so it passes on Node 22.16. `interiors-garments.test.mjs`
(23) gained the teen manifest in its drift guard, key and registration checks and nothing else.

## Mutation checks

Each new or changed test was made to fail by changing the code under test, one line at a time,
and restoring it byte for byte. 71 mutants in all. 66 failed a test at the first run. Of the
other five, four were killed after a test was added or the mutant's match was fixed, and one
survives `garments.test.mjs` by design (the new validator suite kills it).

| Tests | Mutants | Killed at the first run | Not killed at the first run, and what changed |
| --- | ---: | ---: | --- |
| `garments-teen-validate.test.mjs` | 17: the adult scan's exemption (removed, unconditional, GLB only, directory only, prefix without a slash), `--all` (verdict, a dropped library, the catalogue guard, exclusive targets, help, a missing path), the teen cap, the reason length, the sources, the hash, the key set, the style list | 15 | The teen cap raised to the adult cap survived, because the manifest's own limit held the line: a case that raises the manifest limit was added. The sources mutant matched two identical blocks and was skipped: re-run with a teen-specific match. Both killed |
| `interiors-garments-teen.test.mjs` | 46: 13 generator refusals, 8 loader, tint, registration and catalogue, 5 data module, 3 served-file inputs, 17 recipe checks and recipe data | 44 | A size class missing from the generator's known list but present in a key, and a size class not written into the generated record, both survived: a generator case for the first, and a comparison of the committed module with what the generator makes of the manifests for the second. Both killed |
| `interiors-garments.test.mjs` | 4: the drift guard, the registration, the loads kept apart, teen left out of the test's inputs | 4 | |
| `garments.test.mjs` | 2: the exemption removed, the exemption unconditional | 1 | The unconditional exemption survives that suite; the new validator suite kills it |
| `garments-size-compare.mjs`, `garments-teen-boot.mjs` | 2 | 2 | A damaged data record fails the sheet (`garment_tshirt_cream_big_flat: drawn 75.6,62.6 cm, the data says 85.6,62.6 cm`). The registration pointing child and teen keys at the adult files fails the boot check (3 garment files asked for instead of 7, no child or teen key) |

`tools/blender/garments_build.py` gained one teen-only hook (`preserve_teen`, so an adult
rebuild keeps the teen files). The module imports `bpy`, so the function was lifted out by AST
and run in a scratch script (no teen library, a partial one, a complete one); no suite
covers it. The three builders byte-compile. The Blender builders were not run: the helper
names the teen builder uses from `garments_build.py` and `furn_lib.py` all exist at this base,
but a rebuild is unverified here (#82's `teen-verification/build.log` shows it run under
Blender 4.5.3 on its own base).

## Evidence kept here (`teen-evidence/`)

Made here: `contact-sizes-all.jpg` and `.json` (`size-compare.html`: ten garments, six in all
four sizes and four with no adult counterpart, 36 shipped LOD models at 200 px per metre,
each size checked against the data module) and `browser-boot.json` (the two page boots).

Copied from #82 (same bytes): `contact-overview.jpg` (29 styles), `contact-lod.jpg`,
`contact-sizes-flat.jpg`, `contact-sizes-folded.jpg`, `contact-sizes-hung.jpg` (81 small/big
pairs at one scale), `fabric-swatches.jpg` and `visual-report.json` (the full run: 162
high-detail and 162 LOD items, 81 size pairs, three.js r180 on SwiftShader). Not copied: the
per-pose sheets (`contact-flat`, `-folded`, `-hung` and the three `contact-lod-*`) and `items/`
(191 single renders, 4.6 MB), which are #82's and which the full run regenerates. That full run
was not repeated here: the five source hashes in `visual-report.json` match the shipped files,
so its renders are of these bytes. `node la-ladera/tests/garments-teen-visual.mjs --quick` does
pass in this tree (6 high-detail renders, 6 LOD renders, 6 size pairs, 16 image files).

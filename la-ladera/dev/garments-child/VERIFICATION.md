# Child garment library — verification, 1 November 2026

## Result

The child library adds **20 original designs, 57 applicable object poses and 57
separate LODs** alongside the existing 23 adult designs. The branch starts at
`8f93ade042cdb4bfc1a796b889bbe39786241ebf`; all changes are under `la-ladera/`.
The adult model files, palette, atlas, catalogue and assortments are unchanged.

| Family | Designs |
| --- | --- |
| School uniform | Shirt, polo, pinafore, trousers, shorts |
| Everyday | T-shirt, hoodie, jeans, skirt, dress, cardigan |
| Sleepwear | Pyjama top and bottoms |
| Accessories | Socks, small shoes, cap, school backpack |
| Swimwear | Swimming shorts, one-piece costume, rash vest |

Seventeen soft designs have flat, folded and hung poses. Shoes, cap and backpack
have flat and hung poses; their source catalogue explains why folding does not
apply. All shapes and details are generated original work, with a CC0 dedication
for the generated assets. See [provenance](../../tools/blender/GARMENTS-CHILD-SOURCES.md).

## Asset and runtime data

The six packed GLBs live in `assets/models/garments-child/`, with their measured
geometry in `assets/models/manifest.garments-child.json`. They retain the adult
GLB 2 conventions: metres, +Y up, +Z front, one `laundry` material, unit UVs,
vertex colours, floor-centred flat/folded poses and top-supported hung poses.
The GLBs contain no images, skins or animations.

`tools/garments_data.mjs` now reads both manifests and generates explicit
`sizeTag: 'adult' | 'child'` records plus the per-size `GARMENT_FILES` mapping.
The runtime catalogue and loader retain those tags and route each key to its
own LOD pack. The committed data module was regenerated, rather than edited by
hand. Existing adult variants and assortment selection are preserved.

Child drawer, wardrobe and school locker recipes are generated into the child
`assortments.json`. [Placement guidance](../garments/CHILD-PLACEMENT.md) identifies
`child_bedroom` and `school_locker` as the intended room kinds and distinguishes
them from nurseries, teenage bedrooms and adult staff lockers. Place these
already-scaled objects at their measured dimensions; do not apply 0.6 again.

This delivery supplies the asset library, recipes, size metadata and loader
wiring. At this base, drawer and locker contents are separate procedural props;
their renderer has not been converted to garment GLBs. The existing adult loose
garment pass continues to skip child rooms and keep schools neat, as its original
tests require.

## Measured limits

| Check | Final measurement | Limit |
| --- | ---: | ---: |
| Designs | 20 | Requested 15–25 |
| High-detail / LOD poses | 57 / 57 | Every applicable pose |
| Maximum high-detail triangles per pose | 872 | 900 |
| Maximum LOD triangles per pose | 212 | 240 |
| LOD triangle reduction | At least 40% for every pose | At least 40% |
| Added child assets and manifest | 1,618,209 bytes | Included in site payload |
| Child validation total, conservatively counting the shared inputs | 1,628,852 bytes | 2,500,000 bytes |
| Shared 256×256 atlas, RGBA8 with complete mip chain | 349,524 bytes | 6,000,000 bytes |
| Additional texture files | 0 | One shared atlas |
| Actual hung child/adult T-shirt length ratio | 0.5996816161 | Approximately 0.60 |

The nominal source dimensions use 60% of each documented adult reference length.
The tee comparison also checks the exported vertices independently of those
metadata claims. Detailed and LOD models both satisfy the byte-level validator.
The original adult validator still reports 67 poses and its unchanged
1,840,059-byte runtime library.

`payload.mjs` passes every existing budget. It reports **37.79 MiB / 150 MiB**
shipped total, **23.02 MiB / 32 MiB** models and an unchanged **246.33 MiB / 800 MiB**
estimated total GPU texture memory. The checker labels these units MB but divides
by 1,048,576. Contact sheets, scripts and verification logs are development files
excluded by its existing rules. See [before](verification/payload-before.json)
and [after](verification/payload-after.json).

## Tests and deliberate failure

The full extended `interiors-garments.test.mjs` suite passes **23/23**, with no
skips. Its original placement, child-room exclusion, school tidiness,
determinism, collision, furniture hash, triangle budget and fallback assertions
remain in force. File, catalogue, loader and request checks now cover both size
sets. The four new child tests check inventory/tags, actual GLB triangles and
LODs, scale, and the shared atlas memory cap.

The required negative demonstration changed the real manifest entry
`garment_child_tshirt_flat.sizeTag` from `child` to `adult`. The selected extended
suite exited **1**, failing both the generated-data drift guard and child size-tag
contract. The source was restored byte-for-byte in a `finally` block before the
full passing run. Its recorded restored SHA-256 still matches the final manifest.
See [failure output](verification/red-size-tag.tap) and
[mutation/restoration proof](verification/mutation-proof.json).

The existing adult validator regression suite passes **22/22** with its tests
unchanged. Both complete asset validators pass. Full results are in
[interiors-garments output](verification/interiors-garments.tap),
[command/result record](verification/interiors-garments-result.json),
[adult regression output](verification/adult-validator-tests.tap),
[child validation](verification/child-validation.json) and
[adult validation](verification/adult-validation.json).

Commands run from the repository root:

```sh
LADERA_PRIO=idle node --import ./la-ladera/tests/register.mjs --test --test-isolation=none --test-concurrency=1 --test-reporter=tap la-ladera/tests/interiors-garments.test.mjs
LADERA_PRIO=idle node --test --test-concurrency=1 la-ladera/tests/garments.test.mjs
LADERA_PRIO=idle node la-ladera/tools/blender/garments_validate.mjs --child --complete
LADERA_PRIO=idle node la-ladera/tools/blender/garments_validate.mjs --complete
LADERA_PRIO=idle node la-ladera/tests/payload.mjs
LADERA_PRIO=idle node la-ladera/tests/garments-child-visual.mjs
```

The visual command requires `CHROME_PATH` where Chrome is not found automatically.
The [build guide](../../tools/blender/GARMENTS-CHILD.md) provides the quiet,
headless, two-thread Blender regeneration command.

## Visual evidence

The review harness rendered **77 actual child GLB views** in headless Chromium
through the existing `tests/chrome.mjs`. Each card places an adult tee beside the
child item at model scale `[1, 1, 1]`, with the same 1.92 m orthographic camera
width. The images therefore preserve size differences; the cards do not fit
each object independently.

- [Hung contact sheet with adult tee](evidence/contact-hung.jpg): 20 designs.
- [Flat contact sheet](evidence/contact-flat.jpg): 20 designs.
- [Folded contact sheet](evidence/contact-folded.jpg): 17 designs.
- [Hung LOD contact sheet](evidence/contact-hung-lod.jpg): 20 designs.

All rendered geometry stayed inside the camera frame, every child object had
visible pixels, and counts matched the manifest. The browser reported zero
console, network or runtime errors. The renderer was SwiftShader; this is static
asset and scale evidence, not a hardware frame-time measurement.

Visual review caught dark wedges where decimation had averaged normals across
thin cloth boundaries. The child builder now splits LOD normals across 50-degree
creases, preserving positions and triangle counts. The final four sheets were
recaptured and reviewed after that correction. The
[visual report](evidence/visual-report.json) records final source and screenshot
hashes and confirms that the sources stayed unchanged during capture.

# Furniture bytes, coverage and small-object builders — 30 October 2026

## Implemented

`tools/blender/furn_validate.mjs` checks actual GLB files against the live catalogue.
It requires at least 120 valid named assets and the furniture-family and all 14
shop-type representatives. `--complete` additionally requires every catalogue
entry (currently 222). Empty manifests, missing files, repeated aliases, invalid
node references, malformed GLB/buffer/accessor ranges, non-finite positions,
invalid indices/normals/UVs/colours, absent triangles, unknown materials, missing
variation-channel choices and out-of-scale geometry fail the check. The CLI
returns nonzero on failure. Files must be self-contained without textures or
extra required decoders. The hard size limits are 10,000,000 bytes total and
8,000,000 bytes for an individual GLB.

When generated provenance metadata is present, the validator checks actual byte
lengths, SHA-256 digests, source catalogue digest, asset count, triangle counts,
origin and measured transformed bounds. Bounds default to a 2.5 cm tolerance;
specific authored taps, nets, vices, appliance handles and work-surface items
have narrow named allowances. Their true bounds remain recorded and checked.

`tests/interiors-catalog.test.mjs` validates the shipped complete catalogue and
deliberately broken in-memory fixtures. Before generation the shipped-assets
test failed because the manifest was empty; the corruption cases passed, proving
they rejected those broken inputs instead of accepting the missing library.

`tools/blender/furn_assets_details.py` supplies 58 assigned catalogue assets:
electronics, fan cages, religious furniture and statues, plants with pointed
leaf geometry, kitchen vessels, books/toys/school possessions, utility items,
pets/canary cage/pigeon loft, a guitar and textiles. It reuses `furn_lib.Asset` and
the existing material definitions. A raw-geometry audit exercised all 58 without
exceptions or bounds violations, totaling 23,984 triangles; the highest count
was 1,188 for each caged fan. This audit itself is not a Blender-export or visual
quality claim; the lead performs the real build and screenshot checks.

## Commands

```sh
node la-ladera/tools/blender/furn_validate.mjs --complete
node --test la-ladera/tests/interiors-catalog.test.mjs
```

## Verified generated files

After the real Blender 4.5.3 LTS build completed, independent validation passed
**222/222 assets, 6,454,296 bytes** across the four GLBs (details 1,435,020;
home 1,153,304; living 1,484,012; shop 2,381,960 bytes). All manifest digests,
triangle counts and measured bounds matched the exported bytes. All 24 tests
passed, including a second named root incorrectly reusing the same geometry.

The generation pipeline was reviewed: full builds validate in a temporary
directory before replacing the shipped library; ordinary install errors restore
the prior directory, and the manifest is replaced last. A partial build cannot
target the shipped models directory. The two directory renames have a short
gap, so this is a safe offline generation workflow, not an atomic hot deployment.
The lead handles browser loading, complete contact sheets and room screenshots.

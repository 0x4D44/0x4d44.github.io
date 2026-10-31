# Inspect library verification

Verified on 31 October 2026. Base `origin/main`:
`8fa06a5498555afc5dc2b636c06754a4a6b5882c`.
Frozen `manifest.inspect.json` SHA-256:
`3ba8f0a9933d0dc59836caad60e4947fe840a108a9efc504dd24f9f5a4b5dd81`.

The generated GLBs and manifest are present and pass asset validation. The
library is registered with the asset registry; drawer integration remains blocked.

## Measured result

| Check | Result |
|---|---:|
| Objects / authored LODs | 24 / 24 |
| Runtime library, including atlas and metadata | **1,732,878 / 2,000,000 bytes** |
| GLBs | 1,326,056 bytes |
| Shared 2048 × 2048 atlas PNG | 362,704 bytes |
| Maximum detail / LOD triangles | 2,480 / 684 |
| Maximum draw calls for one object | 8 |
| Detail / LOD triangles across the collection | 24,280 / 6,610 |
| Headless captures | 72: front, reverse and LOD for every object |

## Evidence

- [validation.json](validation.json): default validator passed; actual binary
  geometry, material names, white vertex colors, pivots, LODs, hashes and budget.
- [completion.json](completion.json): `--complete` correctly returned failure for
  missing source files and unverified ID bindings; no asset validation failures.
- [tests.txt](tests.txt): 59 relevant interior/material/path tests passed; the
  18 inspect tests passed again after the final medal geometry changes.
- [report.json](report.json): 72 final captures through the real `Assets` and
  `MaterialLib`; no browser, network or console errors/warnings and no changed
  source hashes during capture. Each source and image has a size and SHA-256.
- [payload.json](payload.json): all payload gates passed; shipped total 19.14 MiB
  of 60 MiB and estimated GPU texture memory 174.67 MiB of 220 MiB. The existing
  script excludes `vendor`, `dev`, `labs`, `tests` and `tools` from shipped total.

## Outstanding integration gates

The base lacks `dev/FEATURE-DRAWERS.md`, `js/interiors/finds.js`,
`js/interiors/contents.js`, `papers*.js`, and the requested `interiors-content`
and `contents` tests. Existing find/content IDs cannot be verified, so the binding
map remains empty with status `blocked-missing-drawer-baseline`. No placeholder
or discovery behavior was replaced.

Captures use the documented reference inspect studio, not verified game inspect
lighting. Rendering was headless with SwiftShader. This evidence does not measure
the 12 ms frame target or busiest world view. No full-suite or 930-test pass is
claimed; a broader attempt was stopped in unrelated browser fixtures.

## Compatibility details

The small `live-paths.test.mjs` helper resolves directory-entry spelling so Linux
reports an existing wrong-case import as wrong-case, as Windows already does.
Exact-case rejection and all assertions remain unchanged. Manifest atlas and
binding references use `dir: "../.."` to resolve from `assets/models` to the site
root under the existing manifest path checker; GLB paths remain model-relative.

Regeneration and validation commands are in [INSPECT.md](../../tools/blender/INSPECT.md).

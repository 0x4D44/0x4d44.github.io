# Goods library verification — 31 October 2026

Base: `8fa06a5498555afc5dc2b636c06754a4a6b5882c` from `origin/main`.
At this commit, the furniture manifest contains `{"files":[]}`; the brief's
224-piece furniture snapshot differs from this base. These checks exercise the
existing procedural fixtures with the new generated goods.

## Assets and tests

[Complete asset validation](goods-validation.json) passes with **58 goods and 58
far LODs**, a **1,266,492-byte** library, and maximum **326 near / 142 far
triangles per article**. That total includes the GLB, one 1024² label atlas,
manifest, generated catalogue and assortment data, against a strict
2,000,000-byte ceiling. The atlas has 16
invented Spanish labels; assortment data covers 14 shop types and 32 fixtures.
All GLB material names resolve through the material library; no textures are
embedded in the models. See [regeneration instructions](../../tools/blender/GOODS.md).

| Check | Result | Evidence |
|---|---:|---|
| Interiors build, data, reachability and stories | 29/29 passed | [Log](interiors-verified.log) |
| Goods placement and fallback | 10/10 passed | [Log](goods-data-tests.log) |
| Binary assets, corruption checks and actual runtime LODs | 10/10 passed | [Log](goods-assets-tests.log) |
| Payload checker | Passed | [JSON](payload.json) |

The payload checker reports **18.71 MiB** for its configured scope, which excludes
`vendor`, `dev`, `labs`, `tests` and `tools`. Runtime files including `vendor`
total **22,358,984 bytes (21.32 MiB)**.

## Geometry and draw calls

The [geometry sweep](../../tests/goods-budget.mjs) completed **40/40 matching
viewpoints before and after**, at 640×360, high quality, using the original
`metrics.mjs` viewpoint expression. View IDs, positions and expression hashes
match. Both geometry runs have empty failure lists.

| Maximum across the 40 views | Before | After | Limit |
|---|---:|---:|---:|
| Submitted triangles | 1,660,899 | 1,661,311 | 2,500,000 |
| Draw calls | 1,144 | 1,146 | 1,800 |

[geometry.json](geometry.json) records every view's before/after values, deltas,
and actually submitted near/far goods rooms, records, meshes and triangles.
`onBeforeRender` observations include frustum culling. Near goods were submitted
in 8 views and far goods in 13; some views use both. The largest paired-view
increases were **20,634 triangles** and **3 calls**. The maximum submitted goods
geometry in one view was 22,434 triangles. All 58 goods were ready and the atlas
loaded. Geometry runs had no application errors, network errors, unknown
materials or lost contexts; SwiftShader emitted four `ReadPixels` driver-stall
warnings in each run.

## Timing and soak: failed / incomplete

The unchanged original `tests/metrics.mjs` was run with the following options.
To reproduce the diagnostic and write its report directly into this directory:

```sh
node la-ladera/tests/metrics.mjs --w 640 --h 360 \
  --query 'manual&quality=high&dpr=1' --views 40 --soak 60 \
  --json la-ladera/dev/goods-verification/metrics.json
```

The [timing report](metrics.json) completed only the spawn view: **19.29 ms
uncapped render cost**, exceeding the unchanged **12 ms** gate, with 1,077 calls
and 1,535,253 triangles. Boot took 24.1 seconds. A `Runtime.evaluate` CDP timeout
during the next view ended the run with exit code 1. **Soak and final counts were
not reached.**

The earlier [1280×720 live-loop baseline](baseline-metrics.json) also timed out
before collecting a view, so these runs cannot establish a timing delta. This
executor uses **SwiftShader software rendering**. The separate 40-view geometry
pass does not certify the target GPU's 12 ms frame-time requirement; timing and
soak acceptance remain outstanding.

## Five headless shop captures

Final 1280×720 captures: [tienda](shops/tienda.jpg),
[panadería](shops/panaderia.jpg), [fruver](shops/fruver.jpg),
[ferretería](shops/ferreteria.jpg), [droguería](shops/drogueria.jpg).
[Capture metadata](shops/shots.json) records all 58 assets ready, the atlas
loaded, and the stock geometry used in each room.

Visual review found upright labels, recognizable products and clean shelf
contact. Two data-only adjustments improved coverage: two rows of bakery rack
stock and one pharmacy row per tier. The refreshed images show every bakery
rack tier and all five pharmacy shelf tiers stocked, with no remaining visible
placement blockers in these captures.

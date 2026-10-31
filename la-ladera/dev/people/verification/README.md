# Resident asset verification — 31 October 2026

Base: `origin/main` at `8fa06a5498555afc5dc2b636c06754a4a6b5882c`.
Branch: `improve/la-ladera-residents-20261031`.

The committed deliverable contains the actual near/far GLBs, metadata, three
external shared atlas maps, and their byte/hash inventory in
[`manifest.people.json`](../../../assets/models/manifest.people.json).
This is an asset and authoring-pipeline change. The runtime loader, rig,
appearance selection, casting, animation and boot behavior are unchanged.
The only runtime JavaScript edit registers `people_pbr` as material data.

## Contract and budgets

[`people-validation.json`](people-validation.json) is a successful `--complete`
run over the actual decoded binaries, with no errors or warnings.

| Check | Result | Limit / contract |
|---|---:|---:|
| Source IDs exported at both LODs | 30 | Same 30 source IDs |
| Animation clips | 32 | Original quaternion/time bytes |
| Bone names per skeleton | 21 | Original hierarchy, rest and bind transforms |
| Near triangles, maximum per figure | 6,182 | 8,000 |
| Far triangles, maximum per figure | 1,432 | 1,500 |
| Near triangles, entire library | 185,439 | Baseline's 25 figures: 205,954 |
| Far triangles, entire library | 42,687 | Baseline's 25 figures: 39,706 |
| Primitives per figure | 1 | One shared named material |
| World draw calls, observed maximum | 1,144 | 1,800 |
| World triangles, observed maximum | 1,605,520 | 2,500,000 |
| People inventory | 9,569,221 bytes / 9.13 MiB | 14 MiB |
| Shipped site payload | 19.37 MiB | 60 MiB |
| Estimated GPU texture memory | 217.33 MiB | 220 MiB |

Payload values use the existing check's binary-megabyte calculation. See
[`payload.json`](payload.json). The GPU texture estimate has only 2.67 MiB
headroom; it is a static inventory estimate, not a measured driver allocation.

The manifest SHA-256 for these final files is
`ec14eabfd72d6a7f6bab7c1222001695f7d60d2c82747e55ecd192dc9bca3f0e`.
Reports record individual asset hashes. The tests decode Draco geometry rather
than trusting accessor or metadata triangle counts. They also check skinning,
near/far joint ordering, scale, recolour slots, UV-cell bounds, external image
references, material names and all 672 original rotation tracks.

## Visual evidence and design coverage

These are headless Three.js r180 renders of the shipped GLBs through the existing
`CharacterLibrary`, not offline beauty renders:

- [All 30 near](people-near.png) and [all 30 far](people-far.png).
- [Portraits](people-portraits.png), [walking](people-walk.png) and
  [seated](people-sit_idle.png).
- Starting commit: [25 near figures](baseline-near.png) and
  [25 portraits](baseline-portraits.png).

[`people-shots.json`](people-shots.json) passes with 30 IDs, 32 clips and 374,784
posed-vertex checks across two phases of every clip at both LODs. It also checks
nonempty rendered cells, recolouring, finite skinning and the same asset hashes
before and after capture. [`baseline-people-shots.json`](baseline-people-shots.json)
records the original 25 figures and their triangle counts.

[`people_cast.py`](../../../tools/blender/people_cast.py) separately authors
heritage, skin, hair, age and facial variation. It contains 30 distinct skin
colours, 29 hair colours and 14 hairstyle settings. Heritage is explicit design
context rather than an identity inferred from colour or measurements.

| Authored background | Adults | Elders | Children |
|---|---:|---:|---:|
| Andean | 4 | 1 | 1 |
| Mestizo | 8 | 1 | 1 |
| Afro-Colombian | 3 | 1 | 1 |
| European-descent | 4 | 1 | 1 |

The remaining three residents are teens: two Afro-Colombian and one mestizo.
Wardrobes include `m_abuelo`'s ruana, two school uniforms, three aprons, two work
overalls, church clothing, four football shirts, three sandal variants and three
boot variants. The source retains the original procedural body and clothing
recipes, with a pinned CC0 MakeHuman-derived head dataset. See the
[source ledger](../../../tools/blender/vendor/MAKEHUMAN_SOURCE.md) and
[regeneration instructions](../../../tools/blender/PEOPLE.md).

Visual review found clearer facial structure, skin and hair variation, and age
differences. Remaining limits are visible in the evidence: localized dark
intersections at far shirt/apron hems, small angular neck seams in enlarged
portraits, and coarse hair/hat silhouettes. Some layered hems intersect during
motion. Far sheets magnify geometry intended for the existing 32/38 m LOD
hysteresis. These assets are not claimed to be seamless at portrait distance,
and no new rubric score has been assigned.

## Tests and missing-file behavior

[`people-tests.json`](people-tests.json): **52 / 52 pass**, comprising 14 asset
tests, 19 bank/casting tests, 11 dialogue tests and 8 speech tests. The report
binds to the final manifest hash and verifies its six files remained unchanged.

[`node-tests.json`](node-tests.json): 28 pure-Node files, **302 cases: 294 pass,
7 fail, 1 skip**. Five browser-dependent test files are explicitly excluded from
that count. These cases were run directly with TAP output because nested Node
test subprocesses in this environment did not reliably expose individual cases.
The later final people run above refreshes the asset-sensitive tests.
Saved text logs trim trailing whitespace only; failures and TAP cases are intact.

All seven failures reproduce with untouched source from the starting commit;
see [`baseline-test-failures.json`](baseline-test-failures.json) and its log.
One deliberately wrong-case path fixture expects Windows-specific wording on
Linux. Five quiet-wrapper assertions receive empty nested Node stdout here; one
expects POSIX exit 127 where this environment returns 126. The skipped case is
Windows-only. The real source path and manifest checks pass. This is not an
all-green full-suite claim.

The screenshot harness blocks the actual asset request in each missing-file
case and boots the existing game headlessly:

| Case | World boots | NPCs | Observed diagnostics |
|---|---|---:|---|
| Both bundles present | Yes | 73 | No console, page or network errors/warnings |
| Far bundle missing | Yes | 73 | Expected LOD warning; near models retained |
| Main bundle missing | Yes | 0 | Expected isolated people-stage fetch error |

See [normal boot](boot.png), [missing far](boot-missing-people_lod.glb.png) and
[missing main](boot-missing-people.glb.png). All three keep the fatal overlay
hidden, the world active, and the quiet test hooks enabled. Missing main does
**not** recover procedural NPCs automatically: that runtime fallback was absent
at the starting commit. Preserving the no-game-code-change constraint preserves
this limitation. The original procedural authoring recipes remain available
through `--procedural`; that is an offline regeneration path.

Both original procedural exports were regenerated in a separate `PEOPLE_OUT`
using Blender 4.5.4, `tools/nice.mjs`, background mode and two threads. The
complete procedural library passes the same strict validator: 30 IDs, 32 clips,
maximum 6,182 near / 1,420 far triangles, no errors or warnings. The six
production files and both production manifests remained byte-identical.
See [`people-procedural-run.json`](people-procedural-run.json) and
[`people-procedural-validation.json`](people-procedural-validation.json).

## World geometry sweep

[`people-counts.json`](people-counts.json) records all **40** viewpoints from the
existing metrics script at **1920 x 1080**, high quality, with 73 NPCs throughout.
All viewpoints are within 1,800 draw calls and 2.5 million triangles. Both maxima
occur at `door-L06`: 1,144 calls and 1,605,520 triangles.

The strict diagnostic result is **exit 1 / `ok: false`**, solely because
SwiftShader emitted four `GPU stall due to ReadPixels` warnings. Page errors,
network errors and console errors are empty, and game error counts are zero.
The warnings remain in the report. This manual geometry sweep does not measure
uncapped frame cost and does not certify the 12 ms gate.

## Original metrics gate

The unchanged `tests/metrics.mjs` was run through `tools/nice.mjs` with its
original defaults: 1920 x 1080, 40 views, 60-second soak, 12 ms uncapped cost and
1 ms frame slack. No gate, resolution or timeout was relaxed.

Result: **exit 1**, boot **4.3 seconds**, then `CDP timeout: Runtime.evaluate`
before the first viewpoint completed. This machine reports **ANGLE / SwiftShader**
software rendering. There are no completed frame-cost measurements and the soak
was not reached. The unmodified starting commit also timed out before its first
viewpoint on the same renderer. Therefore the **12 ms frame budget remains
unverified**; a run on a supported hardware GPU is still required.

See [`metrics.json`](metrics.json), [`metrics-run.json`](metrics-run.json),
[`metrics.log`](metrics.log) and [`baseline-metrics.json`](baseline-metrics.json).
The run record binds the result to the final asset hashes and the unchanged
metrics/wrapper sources. Chrome was closed after the run.

## Starting-commit differences

The actual base contained 25 generated residents while its builder declared 30.
Its furniture manifest was empty, and the referenced complete furniture
documentation and validator were absent. Its people loader directly uses glTF
materials instead of rebinding them through `matlib`. The new external atlas is
registered as `people_pbr`, and the existing loader continues to use its glTF
material without a behavior change. These differences are documented so the
delivered result can be assessed against the actual repository.

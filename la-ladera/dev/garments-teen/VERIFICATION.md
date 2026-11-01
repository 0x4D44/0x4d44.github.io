# Teen garment port verification

Base: `c4e8f46e8f617896f508728f77cda029ec494e88`, the head of PR #80.
Source designs: `18a37a7e29888cecc733e16bcd623b21c599916e`.
Branch: `codex/la-ladera-teen-garments-v2`; target: `main`.
All changes are under `la-ladera/`. This branch includes PR #80 as its parent
and therefore depends on that child-library change.

## Delivered and measured

The port retains all 29 original teen styles, two size classes and original
fabric artwork. It uses the child library's six-pack convention: flat, folded
and hung, each with a separate LOD pack. Every asset carries `sizeTag: 'teen'`,
its original `styleId`, and `sizeClass: 'small' | 'big'`.

| Check | Result |
| --- | ---: |
| Styles / explicit style-size records | 29 / 58 |
| Applicable detailed poses / matching LODs | 162 / 162 |
| Flat / folded / hung poses | 58 / 52 / 52 |
| Maximum detailed triangles | 232 / 800 |
| Maximum LOD triangles | 96 / 240 |
| Minimum LOD triangle reduction | 48.28% |
| Largest detailed/LOD envelope difference | 0.000000483 m |
| Complete teen runtime directory plus manifest | 759,920 / 3,500,000 bytes |
| Additional texture pages beyond the existing teen tile | 0 |
| Teen atlas allocation, RGBA8 with complete mip chain | 349,524 bytes |
| Site model payload | 23.75 / 32 MiB |
| Site shipped payload | 38.53 / 150 MiB |
| Estimated total GPU texture memory | 246.67 / 800 MiB |

Independent comparison with the old teen GLB found every detailed and LOD
triangle count and every measured dimension unchanged. The teen palette and
fabric PNG are byte-identical to the old branch. Two full headless builds were
byte-identical across all 11 outputs. A further build using normal staged
validation and a separate partial footwear export passed.

Evidence: [geometry comparison](verification/asset-comparison.json),
[rebuild hashes](verification/asset-rebuild.json),
[builder output](verification/asset-build.log).

## Adult and child preservation

[Base preservation evidence](verification/base-preservation.json) compares 187
protected files against the exact base Git blobs, including all 164 existing
test and harness files, both original builders, both catalogues, and every
adult and child runtime asset and manifest. Every comparison is unchanged.

[Generated-data comparison](verification/generated-preservation.json) also
confirms unchanged values for all 43 existing adult/child garment records,
their file bindings, all 16 shared palette colours and all 12 adult assortments.
The generated module was rebuilt using `tools/garments_data.mjs`.

The default `GARMENT_KEYS`, registration and page preload retain the existing
124 adult/child keys. `ALL_GARMENT_KEYS` exposes all 286 keys, and
`garmentKeysFor(['teen'])` selects the 162 teen keys. An explicit consumer can
call `loadGarmentAssets(ctx, { sizeTags: ['teen'] })`; this requests exactly the
three teen LOD packs and loads both teen size classes. The integration test
decodes all 162 through the production Three.js loader, checks runtime mesh
validation, and checks cache cleanup when returning to the default libraries.

Fourteen teen drawer, wardrobe and locker recipes cover all 29 styles in each
size. They are data for an explicit future furnishing pass. No room, container
or loose-clothing placement was added. The preview binds the real fabric atlas;
the current room renderer retains its existing colour-tint fallback.

## Acceptance: Node 22.16.0 and Node 24.22.1

Both runtimes ran this same command, headlessly at low priority:

```sh
nice -n 15 node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 --test-reporter=tap la-ladera/tests/interiors-garments.test.mjs la-ladera/tests/garments.test.mjs la-ladera/tests/garments-teen.test.mjs la-ladera/tests/interiors-garments-teen.test.mjs
```

| Suite | Node 22.16.0 | Node 24.22.1 |
| --- | ---: | ---: |
| Existing adult validator regressions | 22 / 22 | 22 / 22 |
| Existing interiors and child contracts | 23 / 23 | 23 / 23 |
| Ported teen contracts and added validator coverage | 18 / 18 | 18 / 18 |
| New generator and production-loader integration | 5 / 5 | 5 / 5 |
| Total | **68 / 68** | **68 / 68** |
| Failed / skipped | **0 / 0** | **0 / 0** |

Exact TAP output: [Node 22.16](verification/acceptance-node22.tap),
[Node 24](verification/acceptance-node24.tap). Both end with:

```text
1..68
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### Complete validator

```sh
node la-ladera/tools/blender/garments_validate.mjs --complete
```

```text
PASS garments (complete): 67 states, 23 garments, 1840059/2000000 bytes, max 772/212 high/LOD triangles
PASS garments-child (complete): 57 states, 20 garments, 1628852/2500000 bytes, max 872/212 high/LOD triangles
PASS garments-teen (complete): 162 states, 29 garments, 759920/3500000 bytes, max 232/96 high/LOD triangles
```

`--all --complete` has the same scope. Explicit `--adult`, `--child` and
`--teen` select a single library. The legacy selector-free `--catalogue` call
continues to select adult, preserving the original adult builder. The exported
adult/child validation API and its implementation remain unchanged.

[Complete output](verification/complete-validator.txt) and
[independently decoded measurements](verification/complete-validator.json).

### Payload

```sh
node la-ladera/tests/payload.mjs
```

```text
ok   textures                                                12.0 / 24 MB
ok   models                                                  23.7 / 32 MB
ok   models/people                                            8.9 / 14 MB
ok   models/furniture                                         5.2 / 10 MB
ok   models/world                                             0.0 / 6 MB
ok   models/arch                                              0.0 / 2 MB
ok   shipped total (excl. vendor,dev,labs,tests,tools)       38.5 / 150 MB
ok   estimated GPU texture memory                           246.7 / 800 MB
PAYLOAD OK
```

The script labels its binary-megabyte units `MB`; the measurements table above
uses `MiB`. [Full output](verification/payload.txt), including the largest files,
and [numeric report](verification/payload.json).

## Mutation proof for every new or ported test

Both runtimes passed the green suites, killed the mutants below, and verified
restored input hashes. Mutations operate on temporary copies. Positive
contracts receive damaged real data or implementation regressions; negative
contracts receive deliberately bypassed validator gates. Test assertions are
never edited to manufacture a failure.

| Proof | Tests covered | Meaningful mutants killed, on each runtime |
| --- | ---: | ---: |
| Teen assets, validator and CLI | 18 / 18 | 22 / 22 |
| Generated data and production loader | 5 / 5 | 10 / 10 |
| Total | **23 / 23** | **32 / 32** |

The six nested damaged-export acceptance checks require exit code 1 and the
exact failing test name and diagnostic. Subprocesses use `process.execPath`,
remove inherited `NODE_TEST_CONTEXT`, and use the portable Node test runner.
The unsupported isolation option is absent. A sandbox that suppressed child
process output was detected; acceptance was rerun with approved process
execution, and all named tests and expected failures appeared.

Reproduce with:

```sh
nice -n 15 node la-ladera/tools/blender/garments_teen_mutate.mjs --json /tmp/teen-mutants.json
nice -n 15 node la-ladera/tools/garments_teen_integration_mutations.mjs --json /tmp/teen-integration-mutants.json
```

| Runtime | Teen proof | Integration proof |
| --- | --- | --- |
| Node 22.16.0 | [Log](verification/teen-mutations-node22.log) · [Matrix and hashes](verification/teen-mutations-node22.json) | [Log](verification/integration-mutations-node22.log) · [Matrix and hashes](verification/integration-mutations-node22.json) |
| Node 24.22.1 | [Log](verification/teen-mutations-node24.log) · [Matrix and hashes](verification/teen-mutations-node24.json) | [Log](verification/integration-mutations-node24.log) · [Matrix and hashes](verification/integration-mutations-node24.json) |

## Contact sheets at one common world scale

Every card shows an actual adult tee, child tee, teen small and teen big. All
selected roots have scale 1.0; the orthographic camera width is always 3.90 m.
There is no independent thumbnail normalization. The capture rendered all 162
detailed and all 162 LOD teen objects, alongside the two reference garments.

| Pose | Detailed | LOD |
| --- | --- | --- |
| Hung | [Contact sheet](evidence/contact-hung.webp) | [Contact sheet](evidence/contact-hung-lod.webp) |
| Flat | [Contact sheet](evidence/contact-flat.webp) | [Contact sheet](evidence/contact-flat-lod.webp) |
| Folded | [Contact sheet](evidence/contact-folded.webp) | [Contact sheet](evidence/contact-folded-lod.webp) |

The measured hung-tee length ratios are adult **1.0000**, child **0.5997**,
teen small **0.6972** and teen big **0.8964**. All six sheets were visually
inspected, including the final compressed output. The capture recorded no
clipping, browser, network, console-error or warning failures and confirmed
29 source hashes remained unchanged. Six full-resolution WebP sheets total
2,046,884 bytes; development evidence is excluded from shipped payload.

[Full capture output](evidence-run.log), [visual measurements and hashes](evidence/visual-report.json),
[capture source](capture.mjs), [asset contract](../../tools/blender/GARMENTS-TEEN.md),
and [placement guidance](../garments/TEEN-PLACEMENT.md).

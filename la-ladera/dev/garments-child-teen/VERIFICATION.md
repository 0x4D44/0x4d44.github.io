# Combined child and teen garment integration

Date: 1 November 2026. Branch: `codex/la-ladera-garments-child-teen`.

## Scope and source preservation

This change applies child commit `f0f91d2567b28d7f9bf82bdd0ce82a0d90080ca2`
and teen commit `18a37a7e29888cecc733e16bcd623b21c599916e`, both originally
based on `621ff65dd086969373e17ae18a2eb8f01997e9be`, onto current main
`017eab90a749d317f181872aa620b5facaea06f8` as one integration.

All repository changes are under `la-ladera/`. `preservation.json` records
SHA256 checks proving that the 15 existing adult asset, manifest, catalogue
and test files are byte-identical to main. The six imported child/teen GLB,
manifest, palette and atlas files are byte-identical to their requested source
commits. The previous generated adult data module is an exact prefix of the
extended module. The original adult and interiors garment tests are unchanged.

## Integration decisions

- The shared validator supports the adult default, `--child`, `--teen`, and
  `--all --complete`. A combined run reports all three sets, enforces each
  independent byte/geometry cap, and exits 1 if any fails. A combined run cannot
  take a single-set catalogue override. An adult budget exemption requires a
  valid declaration of the corresponding companion library.
- Adult regeneration stages both companion sets from its selected output tree
  before replacing the garment directory. It preserves the child GLB, teen GLB
  and teen texture directory, and rejects incomplete companion sets. Companion
  manifests remain unchanged at installation. No adult assets were regenerated
  to make this integration.
- Both companion manifests are registered in the master manifest. The source
  libraries share 56 keys, so runtime registration uses `garment_child_*` and
  `garment_teen_*` while preserving original source keys and GLB node names.
- `tools/garments_data.mjs` generates additive `SIZED_GARMENTS` and
  `SIZED_VARIANTS` exports. The 252 entries carry `age: child|teen` and
  `size: small|big`, dimensions, variants and named high/LOD bindings. The
  generated header and adult exports retain their existing form.
- Page startup preloads the two new GLBs once each and selects their named LOD
  roots into `ctx.sizedGarmentGlb`. It clears cached detail parts when rebinding,
  tolerates a missing library independently, and permits failed downloads to be
  retried. Adult placement and its 67-state loader contract remain unchanged;
  automatic child/teen room placement is outside this registration change.
- Teen mutation subprocesses use default Node process isolation and clear
  inherited `NODE_TEST_CONTEXT`. Both imported suites require actual named
  failures, including exit code 1, rather than accepting launcher failures.
  The child fixture now keeps compact generated JSON: pretty-printing alone
  previously exceeded its payload cap and masked an ineffective payload mutant.

## Acceptance environment

All work was headless. Test processes ran at nice level 10 with idle I/O priority
on Linux. Node v22.16.0 was downloaded from nodejs.org and checked against the
official SHA256 manifest; the newer runtime was Node v24.22.1. Nested test
processes ran with the executor's subprocess permission enabled because the
restricted sandbox returns EPERM for those spawns. No assertions or tests were
removed to accommodate the environment.

### Validator

Run on both Node versions:

```sh
node la-ladera/tools/blender/garments_validate.mjs --all --complete
```

Actual output:

```text
PASS garments (complete): 67 states, 23 garments, 1840059/2000000 bytes, max 772/212 high/LOD triangles
PASS garments_child (complete): 90 states, 17 garments, 614128/700000 bytes, max 414/160 high/LOD triangles
PASS garments_teen (complete): 162 states, 29 garments, 679737/700000 bytes, max 232/96 high/LOD triangles
```

### Test suites

Run with each runtime:

```sh
node --import ./la-ladera/tests/register.mjs --test --test-reporter=tap --test-concurrency=1 \
  la-ladera/tests/garments.test.mjs \
  la-ladera/tests/garments-child.test.mjs \
  la-ladera/tests/garments-teen.test.mjs \
  la-ladera/tests/interiors-garments.test.mjs \
  la-ladera/tests/garments-integration.test.mjs
```

| Suite | Node 22.16.0 | Node 24.22.1 |
|---|---:|---:|
| Existing adult garment tests | 22/22 | 22/22 |
| Child garment tests | 17/17 | 17/17 |
| Teen garment tests | 15/15 | 15/15 |
| Existing interiors garment tests | 19/19 | 19/19 |
| New integration tests | 7/7 | 7/7 |
| Total | **80/80** | **80/80** |

Both runs report zero failures, cancellations, skips and todos. Full named TAP
is in `node-22.16-acceptance.tap` and `node-24.22-acceptance.tap`. The four
requested suites contribute 73 tests; the additional integration suite
contributes seven. The existing `furniture-runtime.test.mjs` also passed 10/10
on Node 22.16, verifying the shared asset-registry path for furniture.

### Payload

```sh
node la-ladera/tests/payload.mjs
```

```text
ok   textures                                                12.0 / 24 MB
ok   models                                                  22.7 / 32 MB
ok   models/people                                            8.9 / 14 MB
ok   models/furniture                                         5.2 / 10 MB
ok   models/world                                             0.0 / 6 MB
ok   models/arch                                              0.0 / 2 MB
ok   shipped total (excl. vendor,dev,labs,tests,tools)       37.6 / 150 MB
ok   estimated GPU texture memory                           246.7 / 800 MB
largest files:
  6.01 MB  assets/models/people/people.glb
  2.28 MB  assets/textures/foliage_cards.png
  2.13 MB  assets/models/furniture/furn_shop.glb
  1.89 MB  assets/models/people/people_lod.glb
  1.08 MB  assets/models/furniture/furn_details.glb
  1.03 MB  assets/models/furniture/furn_living.glb
  0.92 MB  assets/models/furniture/furn_home.glb
  0.88 MB  assets/models/goods/goods.glb
PAYLOAD OK
```

Full output and precise values are in `payload-node22.log` and
`payload-node22.json`. Existing budget constants and payload tests are unchanged.

## Every-new-test mutation evidence

All 39 tests introduced relative to main (17 child, 15 teen, seven integration)
have a deliberate mutation that makes the intended named test fail. Input
mutations run against isolated copied exports. Negative-test audits disable
only the fixture's deliberate corruption, retaining its rejection assertions.
Runtime mutation audits modify isolated source copies. A syntax error, import
failure, unsupported flag, process failure or unrelated named failure does not
count as a killed mutation.

| Audit | Node 22.16.0 | Node 24.22.1 | Evidence |
|---|---:|---:|---|
| All 17 child + 15 teen tests | 32/32 killed | 32/32 killed | `mutations-node-*/summary.json` and 32 failing TAP files per version |
| All seven new integration tests, including a second cache regression | 8/8 killed | 8/8 killed | `registry-mutations-node*/summary.json` and eight failing TAP files per version |
| Combined CLI contract | 6/6 killed | 6/6 killed | `validator-cli-node-*.json` and `.log` |
| Builder companion preservation (Python, AST-loaded production helper) | 8/8 killed | Runtime-independent | `builder-preservation.json` and `.log` |

The six nested child defect probes and six nested teen defect probes also run
inside their normal suites on both Node versions. They fail on the intended
dimension, triangle, key or payload assertion, and their parent tests pass.

Reproduce the audits from the repository root:

```sh
node la-ladera/dev/garments-child-teen/mutation-audit.mjs
node la-ladera/dev/garments-child-teen/registry-mutation-audit.mjs
node la-ladera/dev/garments-child-teen/validator-cli-audit.mjs
python3 la-ladera/dev/garments-child-teen/builder-preservation.py
```

Run each Node command under both supported executables. Audit reports retain
their runtime versions and logs. The builder/CLI reports fingerprint the
production source they exercise. No Blender render or asset regeneration is
needed for these preservation checks.

## Independent review

A separate review agent approved the final implementation with no remaining
correctness blockers. It independently verified adult/source byte preservation,
the 56 collision cases, selected LOD triangle counts, cache invalidation,
fallback/retry behaviour, all mutation summaries and representative failing TAP
assertions. It also checked builder preservation and combined CLI exit/status
behaviour. This is automated code review; the PR remains available for maintainer
review. Historical visual contact sheets and generation evidence from both
source commits are retained under `dev/garments/`.

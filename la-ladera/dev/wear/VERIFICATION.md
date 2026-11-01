# Adult wearable wardrobe: verification

Base: `8f93ade042cdb4bfc1a796b889bbe39786241ebf`. All repository changes are under
`la-ladera/`. The wardrobe is optional: the existing 30 residents keep their
current appearances, and the game does not load or select the new clothes.

## Base and upstream compatibility

All results below certify the exact requested base, `8f93ade`, plus this PR.
The PR is a **draft** because upstream `main` advanced to
[`3854209`](https://github.com/0x4D44/0x4d44.github.io/commit/38542092094aaf0101cc9920fd8628fcdaf0ac35) during
the work and replaced all six people model/metadata/texture files. The upstream
manifest records a source `people.glb` SHA-256 change from
`e65905df1afdbf37b65c0d220fed2b15201c97c1b9837b0a5b72c2d4d3bb9f24` to
`b4af02dba31dafb3d27125775585d54e389b130a62ea693ee78b079786971b5f`.
The source metadata and head/body inputs also changed.

This PR preserves the user's specified starting commit. Its assets and
certificate do **not** certify that newer body set. Before integration onto the
observed `main`, regenerate the wardrobe from those new sources and rerun the
complete gates; retain the new main manifest values when resolving the inventory
entry. [base-compatibility.json](base-compatibility.json) records the observed
commit, source paths and both sets of hashes. No test or fingerprint check is
bypassed for this upstream change.

## Delivered assets and policy

The library contains **23 designs fitted to all 23 adult/elder residents**
(529 garment/resident combinations), each with near and far geometry. The seven
child/teen residents are excluded from the catalogue, loader and selection API.

| Family | Designs |
| --- | --- |
| Everyday tops | Tee, shirt, blouse, jumper |
| Bottoms and dresses | Trousers, jeans, skirt, dress, shorts, leggings |
| Headwear | Cap, sun hat, straw hat |
| Feet | Socks, shoes |
| Underwear | Briefs, boxers, bra |
| Swimwear | Bikini top and bottom, one-piece swimsuit, trunks, rash vest |

`assets/models/manifest.people-wear.json` records every design, fit, LOD, actual
triangle count and file hash. `js/people/wear_data.js` provides the small frozen
archetype/colour/context table for `js/people`. The four archetypes are adult man,
adult woman, elder man and elder woman. The catalogue links overlapping designs
to Part A and retains its palette/print IDs. Swimwear requires an explicit beach
selection; no beach behaviour or automatic outfit change is added.

Every fit preserves the exact existing **21-bone order, hierarchy, rest transforms
and inverse bind matrices**, and uses the resident's existing mixer and all
**32 clips**. Original people GLBs, animation sources, the bone contract and Part A
assets are unchanged. The optional body supplies the surface missing underneath
the original baked-in clothes; original head/hair indices borrow the resident's
existing attributes and material.

## Measured budgets

These measurements describe the final exported bytes, including every adult fit.

| Measurement | Final value | Limit |
| --- | ---: | ---: |
| Largest near garment | 1,258 triangles | 1,800 |
| Largest far garment | 600 triangles | — |
| Additional geometry GPU storage | 10,824,802 bytes | Included below |
| Shared atlas, RGBA8 with conservative mip storage | 349,526 bytes | One page |
| **Total additional GPU storage** | **11,174,328 bytes** | **< 12,000,000 bytes** |
| CPU-only seated target deltas | 541,284 bytes | No GPU morph allocation |
| All 23 compressed model files | 5,159,318 bytes | Payload gate |
| Shared atlas PNG | 70,197 bytes | One 256 × 256 image |
| Total models payload | 28.76 MiB | 32 MiB |
| Total shipped payload, per payload.mjs exclusions | 43.63 MiB | 150 MiB |

One external 256 × 256 atlas provides all 16 palette variants. CPU seated target
deltas are stored separately from renderer attributes and do not allocate GPU
morph targets. GPU accounting includes actual referenced attribute/index storage,
retained-head indices and conservative RGBA8 atlas mip storage; original resident
attributes and textures already present in the scene are shared.

## Clearance certificate

The complete release gate **passes**: **178,549 resident poses**,
**1,888,357,513 garment vertex checks**, and **747,499,270 retained-head
enclosure checks**, with **zero final penetrations and zero issues**. Each of the
23 adult fits covers the same 7,763 samples from all 32 clips plus rest. All
243,251 raw-rest garment vertices are clear before
runtime correction. Both garment LODs are included.

The largest total corrected displacement is
155.160676 mm in posed space and
170.999041 mm in bind space, each below 180 mm.
[clearance.json](clearance.json) contains the complete per-fit counts, clip
coverage, current input hashes, and displacement results. Its input fingerprint is
`ac945c15a10e929caed2a7e3af82b424ea57f6e3d8924a51ef6eb81de3f47bf0`.


The sweep includes the raw bind pose, every saved animation key, interior
quaternion component extrema, intermediate samples and both sides of STEP
changes. At each sample it tests every referenced vertex of both garment LODs
against the union of the actual near body, actual far body and a closed retained
head proxy. The original visible head vertices must also remain enclosed by that
proxy. After correction, the exact Float32 upload is re-skinned and checked again.

Raw bind-pose inputs must clear before runtime correction. Static authoring stays
within 80 mm of the pristine generated positions. The seated target and final
push-out share one immutable shipped-position origin and a total 180 mm limit in
both bind and posed space, with a 2 mm push-out margin. An over-limit or unresolved
runtime correction fails and restores the original outfit.

Folded body parts use signed occupancy: a doubly occupied point stays inside, and
a two-to-one crossing is not an exit. Thin-sheet and actual folded-arm regressions
compare the ray predicate with independent solid-angle winding. These checks
retain the original tolerances and displacement bounds.

The certificate fingerprints the exact assets, palette, recipes, rig, runtime,
checker, relevant vendored Three.js sources and pose schedule. The fast suite
rejects a missing, incomplete or stale certificate. This is a finite, reproducible
sweep of the current clip bank. Changed assets or new clips require a fresh sweep;
the report does not claim coverage of arbitrary new motions or every continuous
animation time.

## Test and mutation evidence

| Gate | Result | Saved evidence |
| --- | --- | --- |
| `people-wear.test.mjs` | 41 / 41; no skips | [log](people-wear-tests.txt) |
| `people-wear-runtime.test.mjs` | 19 / 19; no skips | [log](people-wear-runtime-tests.txt) |
| `people-assets.test.mjs` | 14 / 14; no skips | [log](people-assets-tests.txt) |
| `interiors-garments.test.mjs` | 19 / 19; no skips | [log](interiors-garments-tests.txt) |
| `payload.mjs` | Pass; zero budget failures | [report](payload.json) |
| Headless browser and contact sheets | Pass; zero diagnostics | [report](people-wear-shots.json) |
| Complete clearance gate | Pass; 178,549 / 178,549 poses | [certificate](clearance.json) |

The actual-input mutation changes the exported `m_tendero` tee's POSITION
vertex 0 to a point **91.127051 mm inside
the actual torso**. The geometric checker rejects it at raw rest, before any pose
or correction runs (`rawRestClear: false`, `processedPoses: 0`,
`correctedVertices: 0`). The untouched control passes. This exercises containment
directly, beyond the inventory checksum checks.

A separate 190 mm seated-target mutation must exceed the unchanged 180 mm
correction bound and restore the original outfit. The final mutation diagnostic
and all 41 test results are in [people-wear-tests.txt](people-wear-tests.txt).


Other deliberate corruptions cover inverse bind matrices and joint order,
nonmanifold/reversed/omitted body faces, bad weights and accessor alignment,
triangle/GPU limits, gzip integrity, child fits, palette/context eligibility,
CPU target completeness and bounds, and incomplete/stale split reports. The
complete-cut test rejects a metadata-only substitution, a removed triangle or
a changed vertex. Existing tests were retained.

The first final fast-suite run exposed a stage-mismatched face-authoring fixture
(40/41 passed): it supplied an already seated-targeted mesh to the earlier
face-fitting stage. The corrected fixture removes only later-stage CPU-target
metadata and asserts that every physical mesh byte remains unchanged. The same
test now explicitly rejects the out-of-order targeted input and verifies its
immutability. All original shared-cut, full-face-coverage, 81 mm corruption and
invalid-option assertions remain. The complete final suite passes 41/41; assets,
runtime, checker and authoring implementations stayed frozen, preserving the
completed certificate's input fingerprint.

Face regressions supplement the required vertex sweep: every triangle centroid
and edge midpoint on all 23 designs is checked on the three evidence bodies at
both LODs in the idle contact pose. Dedicated seated tests cover complete trousers,
jeans and leggings; dedicated far-top tests and the original seven-design face
regression also remain. No covered body regions are hidden from these checks.

## Reviewed source choices

Some detailed cuff and hip meshes did not clear the body at triangle interiors.
The explicit `WEAR_TOPOLOGY_CHOICES` source table selects a complete lower-detail
cut for those near meshes. This retains garment coverage and near/far nodes;
structural validation compares the actual triangle-expanded attributes with the
declared cut. It does not omit faces from testing or force a runtime LOD change.

| Resident fit | Near meshes using the complete lower-detail cut |
| --- | --- |
| `w_afro` | `shirt`, `jumper`, `trousers`, `jeans`, `leggings` |
| `w_ama` | `shirt`, `jumper`, `trousers`, `jeans`, `leggings` |
| `w_beata` | `shirt`, `jumper`, `trousers`, `jeans` |
| `w_cocinera` | `shirt`, `jumper`, `trousers`, `jeans` |
| `w_elder` | `shirt`, `jumper`, `trousers`, `jeans` |
| `w_farmaceutica` | `shirt` |
| `w_maestra` | `jumper` |
| `w_peluquera` | `trousers`, `jeans`, `leggings` |
| `w_tendera` | `shirt`, `jumper`, `trousers`, `jeans` |
| `w_vecina` | `trousers`, `jeans` |

The source adds 4 mm of nominal, body-scaled cloth ease to `m_don` and `w_elder`
leggings and to `w_afro` trousers/jeans. The `w_cocinera` trousers/jeans retain
their original ease and split one guarded far-cut triangle at its centroid,
interpolating UVs and skin weights; the complete cut has 514 triangles. These are
physical pattern changes, validated with the same body and clearance predicates.

Where a seated leggings target approached the displacement bound, a guarded
5% proposal moved the actual exported base by less than 10 mm. It was accepted
only after the pristine-source 80 mm bound, raw-rest checks, idle face probes and
independent seated upload checks all passed. The displacement origin is the
resulting shipped base, with no change to the 180 mm runtime limit.

Caps and hats retain additional crown samples for `m_afro`, `m_panadero`,
`m_vendedor`, `m_abuelo`, `w_farmaceutica` and `w_elder`. The first four have 4 mm
of body-scaled radial allowance; the last two have 8 mm plus measured vertical
allowances of 17 mm and 24 mm. This preserves the original retained hairstyles
and keeps both garment LODs outside the complete head proxy.

The final authoring reports record **358,958 raw-rest vertex checks**, **2,028,988 idle face probes**, and **5,422,229 independent solid-angle checks**, with zero vertex or face failures. The largest static adjustment from the pristine generated mesh is 79.998994 mm, within the 80 mm authoring bound. [authoring.json](authoring.json) retains the per-fit details; [preflight.json](preflight.json) is explicitly marked diagnostic-only and is not the release certificate.

All new geometry and texture grain are original generated sources. Reused head
data is the repository's existing CC0 MakeHuman-derived source; procedural hair
and Part A prints are existing generated assets. NumPy, SciPy, Pillow and Manifold
are authoring tools, not downloaded garment assets. The authoring source and
rebuild instructions are in `tools/blender/PEOPLE-WEAR.md`.

## Contact sheets and real runtime checks

Every design is rendered on **w_joven (slender), m_tendero (regular), and w_vecina
(fuller)** through the public optional wardrobe API. Neutral companion garments
provide coverage; each cell labels the inspected design and chosen palette.

- [Near, idle](contact-near.jpg)
- [Far, idle](contact-far.jpg)
- [Walking](contact-walk.jpg)
- [Seated](contact-seated.jpg)

[people-wear-shots.json](people-wear-shots.json) records all 32 clips on the
three reference fits at both LODs, with 63,808 posed vertices sampled by the real
browser driver. All 16 palette variants together add exactly one GPU texture
(six original textures to seven). Disposal returns to the original 25 GPU
buffers, with zero leaked or lost original buffers, six textures and four
geometries. Each tested resident's original appearance is restored. Browser,
network, console-error and console-warning counts are all zero.

The browser report pins asset hashes before and after capture. Work used the
repository's headless, muted browser harness and idle-priority authoring and
validation processes. No visible browser, board post, main-branch push, merge or
deployment is part of this change.

## Pre-existing inventory repair

At the requested base, `people-assets.test.mjs` passed 13 of 14 tests: the manifest
recorded stale size/hash values for the unchanged `people/people_meta.json`.
The existing generator's measured entry was refreshed to 42,600 bytes and SHA-256
`4fc44594b6cb7071b4a21820a8476e94928a2aadc22ff17ab59980780bc688ba`.
Only that manifest inventory entry changed; the source metadata and test remain
unchanged. `baseline-notes.json` and `baseline-payload.json` retain the base findings.

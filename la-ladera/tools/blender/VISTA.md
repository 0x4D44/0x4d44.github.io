# Hillside vista kit

48 modular designs, each with a hand-simplified far LOD: 96 named asset roots in
two GLBs. The final generated kit is **725,997 bytes**, including placement data
and its manifest, against a 2,000,000-byte limit. Near pieces must have fewer than 600 triangles; far pieces may
have at most 60. All meshes use existing library material names and vertex
colours; no textures, image resources or compression decoders are embedded.

| File under `assets/models/` | Bytes | Unique mesh triangles | Maximum per piece |
| --- | ---: | ---: | ---: |
| `vista/vista_near.glb` | 533,384 | 6,958 | 444 |
| `vista/vista_far.glb` | 149,184 | 1,278 | 60 |
| `vista/placement.json` | 15,555 | — | — |
| `manifest.vista.json` | 27,874 | — | — |

Gable roof faces have outward winding and normals. Far rebar pieces retain
visible concrete top caps; concealed beam end caps are omitted to keep their
four variants at 12, 24, 48 and 60 triangles.

| Category | Designs |
| --- | ---: |
| Façade/storey shells, doors, windows and brick variants | 12 |
| Tin, gable, parapet and stepped rooflines | 8 |
| Water tanks | 4 |
| Unfinished columns and rebar frames | 4 |
| Stairs | 4 |
| Retaining walls | 6 |
| Balcony strips | 4 |
| Washing lines | 6 |

## Regenerate and validate

Run from the repository root. Blender 4.5.9 LTS was used; `furn_lib.py` supplies
the shared furniture geometry, coordinate conversion and Blender export helpers.
Replace `blender` with the local executable path when necessary. These commands
are headless and use the existing quiet-box wrappers.

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --threads 2 --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/vista_build.py -- --out la-ladera/assets/models
node --import ./la-ladera/tests/register.mjs la-ladera/tools/blender/vista_validate.mjs --complete
node --import ./la-ladera/tests/register.mjs --test --test-isolation=none --test-concurrency=1 la-ladera/tests/world-*.test.mjs
```

Outputs: `assets/models/vista/vista_near.glb`, `vista_far.glb`, `placement.json`,
and `assets/models/manifest.vista.json`. The root `manifest.json` registers the
set. `--complete` independently inspects the binary data and requires the full
kit, near/far pairs, legal materials, placement rules and the total byte budget.
Normal validation also supports checking a partially generated directory.

For a lightweight geometry/LOD audit, generate CPU diagnostic contact sheets:

```sh
node la-ladera/tools/nice.mjs --below python3 la-ladera/tools/blender/vista_contact.py --out .scratch/vista
```

This requires Pillow and reads the actual GLB triangles into `contact-near.png`
and `contact-far.png`, using vertex colours, backface culling and a depth buffer.
Optional `--models <models-directory>` and `--columns 8` select the inputs/layout.
These diagnostic projections complement headless game screenshots; per-view
scene costs require separate `tests/metrics.mjs` measurements.

The current world suite passes **70/70** tests and shipped payload is **18.21
MiB**, up from 17.49 MiB at the pinned base. Comparable headless runs use
`--w 960 --h 540 --views 3 --geometry-views 40 --soak 60 --capture page --query 'manual&dpr=1'`.
Optional `--eval-timeout-ms 600000` changes only CDP response waits; the 12 ms
render-cost gate and geometry limits remain unchanged. Final timing, all 40
geometry views and the software-renderer gate failures are recorded in the
[verification report](../../dev/vista-kit/VERIFICATION.md), which preserves the
baseline's timing, warning and final-counts timeout failures.

## Placement and runtime

Coordinates are metres, +Y up and front +Z. Each logical piece has `near` and
`far` asset names, a `[width,height,depth]` placement envelope, and a `stack`
record: `on` names legal supports, `supports` names legal children, `height` is
the upper mounting plane, and `maxLevels` bounds vertical repetition. Actual
mesh bounds and triangle counts are recorded separately in the manifest.
Façades also publish `mounts.front={y,z}` in placement and both manifest LOD
entries; balconies attach to this wall plane within the larger placement envelope.
The exact terrain sampler closes all 887 foundations with zero positive gaps.
It extends 403 foundation bottoms by at most 0.60217 m while preserving the
layout, every top and the triangle counts. Evidence is recorded in
`dev/vista-kit/after/foundation-comparison.json` and the world tests.

`js/world/vista-plan.js` uses the existing `urbanDensity` and `makeFarHeight`
functions to select adjoining terrace runs outside the playable plot, keeping
the river and approach road clear. The runtime instances the GLB geometry in
spatial tiles, switches LODs by distance, and drops small far-away detail.
The whole active vista is capped at 60,000 triangles, including instances
outside the camera frustum. It casts no shadows. Inspect `__ladera.ctx.world.vista`
for measured runtime counters. `?vista=0` disables the kit. A missing, incomplete
or unloadable kit retains the original terrain and night lights.

## References and provenance

The meshes are original procedural geometry; reference photographs are neither
copied into the repository nor used as textures. No external texture download
was needed. The palette and feature frequencies are art direction, not city
survey measurements. Reference photographs retain their source copyrights;
they are not claimed as CC0 assets. Sources consulted on 31 October 2026:

- [Medellín municipal tourism, *Comuna 13: memoria y transformación*](https://www.medellin.travel/wp-content/uploads/2021/01/Guion-Comuna-13.pdf): dense brick/painted housing, overlapping roofs and stair corridors.
- [World Bank / La Paz municipal government, Chapuma and Pokeni aerial and street photographs](https://blogs.worldbank.org/en/latinamerica/scaling-up-neighborhood-upgrading-boost-urban-resilience-bolivia): connected development across steep slopes and narrow access routes.
- [UNESCO, Valparaíso description](https://whc.unesco.org/en/list/959/) and [photograph gallery](https://whc.unesco.org/en/list/959/gallery/): varied hillside roof heights, painted façades and pedestrian terraces.

The implementation starts at `8fa06a5498555afc5dc2b636c06754a4a6b5882c`, the
fetched `origin/main` on 31 October 2026. That revision has `furn_build.py` and
`furn_lib.py` but no `vista.js`, `tower.js`, `FURNITURE.md` or `furn_validate.mjs`,
and its furniture manifest is empty. This kit adds the vista modules against
that actual base.

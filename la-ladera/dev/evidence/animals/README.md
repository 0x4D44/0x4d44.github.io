# Animal library verification — 31 October 2026

The generated assets, regeneration, fallback behaviour and integration checks pass.
**The full default-quality world performance gate did not pass in this environment.**
Its failures and the separate integration measurements are recorded below.

## Source and delivery

- Pinned `origin/main` base: `8fa06a5498555afc5dc2b636c06754a4a6b5882c`.
- Final `manifest.animals.json` SHA-256: `00f7c7d3e04670297db4526ae55dd5f30bc1d41dcc17fa27a9dd42ae29d57913`.
- Delivered: seven species, fourteen GLBs, the manifest and `animals/CREDITS.md`.
- Library size: **612,220 bytes / 2,000,000-byte limit**, including manifest and credits.
- A separate regeneration produced **sixteen byte-identical files**: fourteen GLBs, manifest and credits.
- Original geometry, rigs and clips are dedicated to CC0-1.0 in the asset credits.
  All GLB materials resolve by name to `fur` or `galvanised`; no images, textures,
  external buffers or runtime model decoders are included.

Counts below are taken from the final manifest and checked against the GLB bytes.

| Animal | Near triangles | Far triangles | Both GLBs, bytes |
|---|---:|---:|---:|
| Dog | 1,148 | 287 | 75,284 |
| Cat | 1,202 | 288 | 78,732 |
| Pigeon | 1,064 | 146 | 64,352 |
| Hen | 1,312 | 194 | 77,296 |
| Mule | 1,380 | 288 | 83,732 |
| Caged parrot, including stand | 2,136 | 266 | 113,736 |
| Caged canary, including stand | 1,984 | 266 | 106,716 |

The actual base differs from the task's premise: `js/world/life.js` already had
primitive dogs, pigeons and hens, while the furniture manifest was empty. This
branch leaves `life.js` unchanged. Missing animal assets preserve that existing
world, including its procedural life; the fallback does not remove it or create
substitute animal meshes.

## Automated and visual evidence

`tests.log` contains the existing passed logs, with commands and labels:

- **11 asset tests + 10 runtime tests = 21 new tests passing.** Coverage includes
  corrupt files, budgets, atomic loading, missing assets, timeouts and aborts,
  independent poses, shared materials, existing path following, LOD and unchanged
  people/physics/random state on fallback.
- **Six existing people/world test files passed:** `people-bank`,
  `people-dialogue`, `people-speech`, `world-mesh`, `world-nav` and `world-plan`.
  The runner reported file-level results. This is not a claim that the full
  approximately 930-test suite ran.
- `report.json` records **50 headless pose images**: two poses for each of 21
  clips, seven far views and `contact-sheet.jpg`. All clips change actual skinned
  geometry; all seven species and both LOD budgets pass; the browser was clean.
- `pose-sanity.json` independently evaluates **189 poses / 230,661 vertex
  positions** through the vendored Three.js r180 loader and animation mixer. It
  records input hashes and per-clip bounds/displacements. Results: zero non-finite
  positions, zero cage/perch movement, zero cage-envelope overrun and zero caged
  eating foot drift at recorded precision. The largest stride floor penetration
  is **10.891 mm**, during the hen's walk.
- `payload.json` passes: shipped site payload **18.09 MiB / 60 MiB**, excluding
  vendor, development evidence, labs, tests and tools as defined by the existing
  payload checker.

## World integration and performance limits

`world-probe.json` matches the final manifest hash. It is a **960 × 540 manual
integration probe**, with `shadows=0`, `post=0` and `dpr=1`, on SwiftShader. It
finds ten added animals and 73 people, with no page errors, console warnings or
network failures. At the captured spawn view, nine animals were visible and three
used near meshes: **5,003 animal triangles and 11 animal draw calls before frustum
culling**. The actual complete render reported **1,006,545 triangles and 854 draw
calls**. `world-spawn.jpg` is additional to the fifty pose images. These figures
demonstrate scene integration at the recorded settings.

The unmodified `tests/metrics.mjs` was also run:

| Evidence | Configuration and observed result |
|---|---|
| `metrics-baseline.json` | 1920 × 1080, normal shadows/post-processing, `skip=animals`; CDP timed out before a benchmark view completed. |
| `metrics.json` | 1920 × 1080, manual mode, normal shadows/post-processing; boot took **42.9 s**, exceeding the **25 s** gate, then CDP timed out before the first benchmark view completed. |

Both used SwiftShader. Neither report is a performance pass. Default-quality
uncapped render cost, the full-view 2.5-million-triangle / 1,800-draw-call gates,
and the metrics navigation soak remain unverified by these incomplete runs.

### Reduced-resolution metrics

A separate **640 × 360** run with normal shadows and post-processing is retained
in `metrics-640.json`. It also failed: boot took **33.1 s**, followed by a CDP
timeout before the first benchmark view completed. Lowering the viewport did not
produce a usable performance or navigation-soak result. The original harness and
all its acceptance thresholds remain unchanged. A run on a suitable GPU is still
needed to establish the default-resolution 12 ms render target and full-view
geometry/draw-call limits.

## Repeat the checks

Run from the repository root; set `CHROME_PATH` if needed. The browser helpers
are headless-only and suppress real audio and pointer lock. Blender runs in the
background through the existing quiet wrapper.

```sh
node la-ladera/tests/memgate.mjs 3 60
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/animals_build.py -- --out .scratch/animals/rebuild-models
node la-ladera/tools/blender/animals_validate.mjs --models .scratch/animals/rebuild-models --complete
node la-ladera/tools/blender/animals_validate.mjs --complete
node la-ladera/tests/animals-assets.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/animals-runtime.test.mjs
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/people-*.test.mjs la-ladera/tests/world-*.test.mjs
node la-ladera/tests/animals-shots.mjs
node la-ladera/tests/animals-world.mjs
node la-ladera/tests/payload.mjs --json
node la-ladera/tests/metrics.mjs --query skip=animals --json la-ladera/dev/evidence/animals/metrics-baseline.json
node la-ladera/tests/metrics.mjs --query manual --json la-ladera/dev/evidence/animals/metrics.json
node la-ladera/tests/metrics.mjs --w 640 --h 360 --query manual --json la-ladera/dev/evidence/animals/metrics-640.json
```

See [ANIMALS.md](../../../tools/blender/ANIMALS.md) for generation, runtime and
fallback details, and [the contact sheet](contact-sheet.jpg) for the final assets.

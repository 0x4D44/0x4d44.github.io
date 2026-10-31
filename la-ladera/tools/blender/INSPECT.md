# Close-inspection objects

24 original handheld objects, each with a detailed node and an authored LOD in
`assets/models/inspect/`. `manifest.inspect.json` records actual triangles,
draw calls, bounds, byte counts and SHA-256 hashes. Everything uses the existing
`furn_lib.py` geometry, batching and Blender export helpers. No embedded textures,
decoder or page build step is required.

## Source baseline and integration status

Built from `origin/main` at `8fa06a5498555afc5dc2b636c06754a4a6b5882c`.
That revision does **not** contain `dev/FEATURE-DRAWERS.md`, `finds.js`,
`contents.js`, `papers*.js`, or the requested `interiors-content` / `contents`
tests. The published furniture branch lacks the drawer files too.

The library is registered with the existing asset registry, but is **not wired
into a drawer/inspection flow**. `js/interiors/inspect-bindings.json` has an
explicit blocked status and an empty binding map. The new `inspect_*` names are
asset keys, not invented find IDs. No discovery handler or placeholder has been
replaced. The lab uses documented reference studio lighting; it cannot verify the
missing game inspection lighting.

When that source revision is available, add exact bindings such as
`"existing_id": {"asset":"inspect_gold_coin","source":"js/interiors/finds.js","export":"FINDS"}`.
The validator imports the specified source export and checks the actual ID.
Use the existing placeholder until its corresponding GLB has loaded and its
node has been found; an entry in a manifest alone is not proof of a loaded model.

## Regenerate quietly

From the repository root, with Python + Pillow and Blender on PATH:

```sh
node la-ladera/tools/nice.mjs --below python3 la-ladera/tools/blender/inspect_atlas.py
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --below blender --background --threads 2 --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/inspect_build.py --
node la-ladera/tools/blender/inspect_validate.mjs
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-inspect.test.mjs
```

Tested with Blender 4.3.2. On Windows, replace `blender` with the quoted full path
to `blender.exe` and `python3` with `python`. Always retain `nice.mjs` and
`--background`. `--only gold_coin,pocket_watch` produces diagnostic subsets
without overwriting the complete manifest. `--out <models-directory>` writes an
alternate model export; full regeneration preserves existing ID bindings.

The atlas uses URW Base35 fonts when available (`--font-dir` selects a font
directory); the same fonts and Pillow version give byte-identical atlas output.
The atlas generator records its hash. Models are in metres, +Y up, +Z front, with
a centred rotation pivot. Each child mesh has exactly one named library
material. Colour attributes are packed into normalized 8-bit RGBA; positions and
normals remain floats. Atlas UVs compensate Blender's V flip for MaterialLib.

## Validate and review

```sh
node la-ladera/tools/blender/inspect_validate.mjs --complete
node la-ladera/tests/payload.mjs
CHROME_PATH=/path/to/headless-chrome node --import ./la-ladera/tests/register.mjs la-ladera/tests/inspect-shots.mjs --out la-ladera/dev/inspect-previews --size 720 --gpu swiftshader
```

Default validation checks every generated object, its LOD, real binary geometry,
materials, atlas, hashes and the strict **2,000,000-byte** runtime-library budget.
Limits are **3,000 triangles** per detail node and **700** per LOD. `--complete`
also requires the missing source files and verified existing-ID bindings; it is
expected to fail at the recorded baseline. This gate must not be weakened to
claim integration.

The headless capture uses only `tests/chrome.mjs`, one browser, the real
`Assets`/`MaterialLib`, and closes the browser in `finally`. It captures front,
reverse and LOD views of every object. `dev/inspect-previews/report.json` records
source/image hashes, actual draw counts, lighting and browser errors. These
development screenshots are excluded from the runtime payload by `payload.mjs`.
Open `labs/inspect/` through a static server for the developer turntable.

## Artwork and references

All meshes and atlas faces here are original procedural work. Portraits are
sepia illustrations, and letters, stamps, currency and lottery inscriptions are
fictional Spanish text. There are no downloaded models, real brands or real
banknotes. The empty pink bloomers have real waist/leg openings and a comic bow.
The 16 paper/engraving faces share one 2048-square PNG with 16-pixel tile bleed;
the metal material alias shares that PNG with different reflectance.

Requested CC0 catalogues: [Poly Haven models](https://polyhaven.com/models)
([licence](https://polyhaven.com/license)) and [ambientCG](https://ambientcg.com)
([licence](https://docs.ambientcg.com/license/)). No external asset is bundled.

# Close-inspection objects

24 original handheld objects, each with a detailed node and an authored LOD in
`assets/models/inspect/`. `manifest.inspect.json` records actual triangles,
draw calls, bounds, byte counts and SHA-256 hashes. Everything uses the existing
`furn_lib.py` geometry, batching and Blender export helpers. No embedded textures,
decoder or page build step is required.

## Integration status

Built on `origin/main` at `8fa06a5`, which had no drawer system. The library is
now wired into the drawers (status `integrated`).

- `js/interiors/inspect-bindings.json` holds the bindings: one entry per thing a
  model stands for, `"existing_id": {"asset": "inspect_gold_coin", "source":
  "js/interiors/finds.js", "export": "FINDS"}`. `source` is `finds.js` (FINDS),
  `papers*.js` (PAPERS) or `props.js` (ITEMS). Every one of the 24 assets is
  bound at least once. A model stands in for a thing only where it does not
  contradict the thing's own text (colour, year, number of people, denomination),
  so a few ids are deliberately left on their stand-in.
- `js/interiors/inspect_data.js` is **generated** from the manifest and the
  bindings (`node la-ladera/tools/inspect_data.mjs > la-ladera/js/interiors/inspect_data.js`;
  the wiring test fails when it drifts). It carries the sizes and triangle counts
  the drawer packer needs, so a drawer's layout never depends on whether a GLB has
  loaded yet.
- `js/interiors/inspect.js` is the runtime: `modelFor(id, size, scale)` gives the
  footprint and pose, `loadInspectAssets(ctx)` preloads the GLBs (alongside the
  furniture and the garments, in `loadInteriorAssets`) and `inspectParts(ctx, key)`
  hands the drawing code a loaded, sound node or `null`. `Pen.model` in
  `standins.js` draws the node; `drawProp`/`drawPaper`/`drawFind` in `props.js` try
  it first and fall back to the stand-in. The stand-in is drawn until the GLB has
  loaded, and for good if the download or the geometry is bad.
- The coin is the one model that is resized to its find's own `size`; the lace
  doily is drawn at twice its library size so a tapete reads as a tapete.
- The lab uses documented reference studio lighting; the drawers draw the models
  under the interior's own lights.

To bind another thing: add the entry to `inspect-bindings.json`, regenerate
`inspect_data.js`, run `inspect_validate.mjs --complete` and
`tests/interiors-inspect-wiring.test.mjs`.

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
also requires every asset to be bound to an id that exists in its declared source
export, and the manifest and bindings status to agree; it passes now (58
bindings). Keep it that way: do not claim a binding the validator cannot verify.

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

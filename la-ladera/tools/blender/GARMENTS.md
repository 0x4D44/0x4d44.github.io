# Adult garment objects — Part A

This is an offline object library: 23 garment types and 67 applicable states,
with a separate low-detail mesh for every state. The manifest and six packed
GLBs are in `assets/models/`; palette, print atlas and assortment recipes are
in `assets/models/garments/`. See [sources](GARMENTS-SOURCES.md) for the inspected
shape references and the original artwork policy.

The production game is unchanged. This set is deliberately **not registered**
in `assets/models/manifest.json`; the assortments are placement data, and the
drawer, wardrobe, washing-line and shop screenshots are preview assemblies.
Existing procedural objects remain the production fallback. No wearable layer,
figure, skeleton, animation or child outfit is changed.

## Regenerate and validate

Run from the repository root, with Node and Blender 4.5 LTS or newer available:

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/garments_build.py --
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/garments_validate.mjs --complete
node la-ladera/tools/nice.mjs node --test --test-isolation=none --test-concurrency=1 la-ladera/tests/garments.test.mjs
```

Set `CHROME_PATH` to a headless-capable Chrome executable, then capture all
actual GLB states, contact sheets, LOD comparisons, prints and four fixtures:

```sh
node la-ladera/tools/nice.mjs node la-ladera/tests/garments-visual.mjs --out la-ladera/dev/garments/evidence
```

Every browser is launched by the existing headless-only `tests/chrome.mjs`.
Never launch a visible Blender or browser window. If a sandbox blocks child
processes or local HTTP serving, use the environment's execution approval;
an empty log is not evidence that validation ran.

The builder reuses `furn_lib.py` for material names, coordinate conversion and
GLB export. It advances cloth frames sequentially and freezes the resulting
vertices; folds, hems and seams are static geometry. Hat crowns and brims are
authored rigid/soft forms. Every full build is staged, independently validated
from its exported bytes, and installed with its manifest last. A caught install
failure restores the previous garment directory; this is an offline update,
not a crash-atomic live deployment.

For selected experiments, use `--only tshirt,bra,cap --out /absolute/preview/models`.
A partial build cannot overwrite the shipped directory. The validator's normal
mode checks supplied assets; `--complete` additionally requires every catalogue
state, source mapping, assortment and referenced file.

## Asset contract

- Keys are `garment_<id>_<folded|hung|flat>`. Catalogue widths and lengths describe
  adult garments; manifest size, bounds and footprint measure each exported state.
- Coordinates are metres, +Y up, +Z front. Flat/folded objects have their base
  at Y=0 and centre on X/Z. Hung objects have a top support at Y=0 and extend
  downward. Hats in the flat state rest intact; stiff caps and straw hats have
  an explicit `notApplicable.folded` reason.
- Each object uses one `laundry` library material, unit UVs and linear vertex
  colours. No GLB contains textures, skins or animations. Variants use material
  tint with the existing untextured material, or the optional external 256×256
  original print atlas. Atlas tiles require a white multiplier, a two-pixel
  inset and the palette's top-left tile convention. The preview implements this
  data binding; the production material library is not altered.
- High detail is capped at 800 triangles; every separate LOD is capped at 240
  and must remove at least 40% of triangles. The manifest recommends switching
  at 8 m, culling at 30 m (16 m for tiny items), and at most 24 detailed garments
  at once. These are integration recommendations, not active runtime behaviour.
- The strict **2,000,000-byte** gate includes all files under the garment data
  directory plus `manifest.garments.json`. Development screenshots, source code,
  tests and reference documentation are not runtime assets.

## Assortments and prerequisites

`assortments.json` defines 12 adult-only recipes and uses verified furniture
catalogue keys. It leaves `findIds` empty instead of inventing IDs. The pinned
base is `8fa06a5498555afc5dc2b636c06754a4a6b5882c`: this fetched `origin/main`
does not contain `FEATURE-DRAWERS.md`, `contents.js` or `finds.js`. Their future
bindings are explicitly deferred. The referenced furniture pipeline was read
on `origin/codex/la-ladera-furniture-library-20261030`, without merging it.

Part B is gated: this base has the older 25-figure / 32-clip people set, and the
new-figure work has not landed. The object library must be reviewed before a
later adult-only wearable pass. See the committed verification report under
`dev/garments/` for actual tests, byte counts, screenshots and performance limits.

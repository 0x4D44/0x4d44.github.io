# Shelf goods

58 original goods cover fruit, vegetables, bread, cheese, jars, tins, bottles,
grain sacks, meat, flowers, newspapers, shoes, toys, hardware, pharmacy boxes,
café cups, and a few fabric/stationery/snack items. Every item has a near mesh
and a cheaper far mesh, each below 400 triangles. The library uses one external
1024 × 1024 label atlas with sixteen fictional Spanish designs. No real brand
marks, third-party models, or images embedded in GLBs are included.

## Regenerate

Run from the repository root. Requires Node 22+, Blender (tested with 4.5.3 LTS),
and Python with Pillow. Use the existing quiet-box wrappers: **never start a
visible Blender or browser window**. Replace `/path/to/blender` with the local
Blender executable; on Windows quote its full path and use the installed Python
command in place of `python3`.

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/goods_atlas.py
node la-ladera/tools/nice.mjs --idle /path/to/blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/goods_build.py --
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/blender/goods_validate.mjs --complete
```

The trailing `--` separates Blender options from generator options. Atlas
generation uses DejaVu Sans Bold when available, otherwise Arial Bold;
`goods_atlas.py --font PATH` selects the same DejaVu font for consistent
lettering on another platform. The
checked-in atlas was made with DejaVu Sans Bold and Pillow 12.3.0. The generator
uses `furn_lib.py` for mesh collection, analytic normals, winding correction,
Blender object creation, and glTF export. It fits geometry to its catalogue box
and rejects large authoring overshoots, a visible Blender session, or
400-triangle items. The generator checks its generated files against 2 MB;
the complete validator also includes the assortment data in that limit.

Generated files:

- `assets/models/goods/goods.glb`: all 58 near nodes and 58 far nodes.
- `assets/models/manifest.goods.json`: node names, size, footprint, family,
  triangle counts, label IDs, atlas rectangles, and the corresponding LOD node.
- `assets/textures/goods_labels.png`: the sole goods texture.
- `js/interiors/goods-catalog.js`: planner metadata generated from the same
  authoring records as the manifest.

`goods_catalog.py` owns the keys, dimensions, categories, and label designs.
`goods_build.py` owns the geometry. Edit these sources and regenerate instead of
hand-editing generated metadata. Materials are named `goods_surface` and
`goods_label`; the runtime binds them through the normal material library.
Colours are per vertex. Labels use unit UVs within their atlas tile, with an
eight-pixel gutter; the exporter V flip and the library TextureLoader flip are
accounted for by the authoring UVs.

## Place and stock

Goods use the furniture convention: metres, +Y up, +Z front, bottom-centre
origin. `size` is `[width,height,depth]`; `footprint` is `[width,depth]`. The
planner can reject an item that does not fit its shelf before adding it. Each
manifest entry names its near root with `node`, its far root with `lodNode`, and
their actual triangle totals with `triangles` and `lodTriangles`.

Per-shop stock belongs in `js/interiors/goods-assortments.js`, a data module
mapping shop types and fixture kinds to goods keys. Change those data records
to restock a shop. Runtime placement uses the catalogue dimensions and existing
furniture surfaces. The procedural stock remains available whenever a goods
asset or catalogue entry cannot be loaded.

The final generated library has fewer than 10,000 near triangles and fewer
than 3,300 far triangles across all 58 models. The binary, atlas, manifest,
catalogue, and assortment data together are about 1.3 MB. The strict validator
measures the actual committed files and enforces the 2,000,000-byte limit,
complete catalogue coverage, known material names, no embedded textures,
per-LOD triangle caps, footprints, normals, winding, and atlas UVs.

## Verify and inspect

```sh
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-*.test.mjs
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/goods-*.test.mjs
node la-ladera/tests/goods-shots.mjs
node la-ladera/tests/goods-budget.mjs
node la-ladera/tests/metrics.mjs --json goods-metrics.json
```

The test harness starts Chrome headlessly through `tests/chrome.mjs`, including
the existing quiet pointer-lock/speech shims. `metrics.mjs` keeps its own
frame-time, triangle and draw-call gates. The goods budget companion checks the
benchmark's same 40 viewpoints against fixed 2.5 M triangle / 1,800 draw-call
limits of its own and does not assess timing.

## How the page uses them (interiors, A3)

- **Catalogue.** Each goods key is also a catalogue entry (`js/interiors/catalog.js`)
  marked `ware: true` and made non-enumerable, like the clothes: the furniture
  pipeline (`Object.keys(CATALOG)`, the catalogue hash in `manifest.furniture.json`)
  never sees it. Do not call the marker `goods`: a shelf piece's own `goods` is its
  stand-in's stock type.
- **Loading.** `loadGoodsAssets` (`goods-render.js`) loads `goods.glb` and the atlas
  apart from the furniture; `index.js loadInteriorAssets` runs it with the furniture,
  clothes and inspect loads. A file or the atlas that fails leaves every shop with its
  own stock; a fixture is stocked whole or not at all.
- **What is replaced.** A model carries its own baked stock (bottles on a shelf, loaves
  on a rack). `GOODS_FIXTURES[fixture].stockParts` (`goods-assortments.js`) names those
  parts, `{ part number: material }`; `build.js` leaves them out of a fixture the goods
  stock. The pieces that open (the counters) are drawn by `standins.js`, which skips
  its own boxes when `rec.flags.stockReplaced`. A piece whose model did not load is
  drawn by its plain stand-in and keeps that stand-in's stock (`drawnAsMeasured`).
- **Where the goods stand.** The support planes of `resolveGoodsSurfaces` are measured
  on what the page draws for the piece (the library model, or the carcass stand-in of a
  piece that opens), not on the catalogue box. After changing a furniture model, a
  stand-in or a plane, run `node --import ./la-ladera/tests/register.mjs --test
  la-ladera/tests/interiors-goods.test.mjs`: it checks every planned article against
  the drawn triangles (support within 10 mm below / 6 mm above, no intersection) and the
  parts snapshot of each model.
- **Which rooms.** Only rooms fitted as shops are stocked, by that room's own shop type
  (`interior.rooms[room].shopType`, set in `index.js`), not the building's.

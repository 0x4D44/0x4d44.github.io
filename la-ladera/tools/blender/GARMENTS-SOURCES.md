# Garment object references and provenance

This library contains original, generic adult garment meshes and original print artwork. The references below inform silhouettes, seam placement, construction and cloth behaviour. No product photograph, logo, commercial pattern sheet or downloaded reference mesh is packaged. Sources were inspected on 31 October 2026. A pattern or shop page offering children's sizes was used only for its adult construction views; the generated catalogue has no children's sizes or styles.

The source IDs are the stable `sourceIds` used in `garments.catalog.json`. These references describe shapes; the generated meshes are not sewing patterns or guaranteed replicas of a retail garment.

| Source ID | Primary reference | Use and licence distinction |
| --- | --- | --- |
| `freesewing-teagan` | [FreeSewing Teagan](https://freesewing.eu/docs/designs/teagan/) and [instructions](https://freesewing.eu/docs/designs/teagan/instructions/) | Neck band, sleeve/shoulder seams and hems for the T-shirt. The shorter crop top is an original derivative of generic T-shirt construction, not copied pattern geometry. Reference only. |
| `uniqlo-tee-flatlay` | [UNIQLO adult crew-neck T-shirt 422697](https://www.uniqlo.com/jp/ja/products/E422697-000/00) | The laid-flat product photograph was inspected for sleeve angles, the neck opening and folds near the underarms and hem. No label, photograph or trademark is reproduced. |
| `jalie-swimwear` | [Jalie 969 one- and two-piece swimsuits](https://jalie.com/products/one-and-two-piece-swimsuits-sewing-pattern) | Ordinary adult swimwear proportions, shoulder straps and bound arm/leg openings. Commercial pattern reference only; pattern sheets are not included. |
| `freesewing-bee` | [FreeSewing Bee](https://freesewing.eu/docs/designs/bee/) | Soft bikini-top panels, supporting straps and underbust band. Reference only. |
| `freesewing-shin` | [FreeSewing Shin](https://freesewing.eu/docs/designs/shin/) | Swim-trunk elastic waistband, leg hems and curved seams; everyday shorts use an original looser construction. Reference only. |
| `freesewing-lumina` | [FreeSewing Lumina](https://freesewing.eu/docs/designs/lumina/) and [instructions](https://freesewing.eu/docs/designs/lumina/instructions/) | Long tapered stretch legs and elastic waist. Lumina avoids an inside-leg seam; these generic meshes need not reproduce that pattern's exact seam layout. Tights combine these proportions with closed sock feet as an original modelling choice. |
| `jalie-bra` | [Jalie 3131 bra and camisole](https://jalie.com/products/bra-and-camisole-sewing-pattern) | Adult wireless bra: shallow collapsed cups, shoulder straps and a separate band. The pattern cover was inspected for construction; no cover artwork is included. |
| `jalie-underwear` | [Jalie 3242 underwear](https://jalie.com/products/underwear-for-men-women-and-children-sewing-pattern) | **Adult views only.** Low/high waists, leg-edge binding, elastic waist, thong versus full back, briefs and short-leg underwear. Commercial reference only. The separate catalogue terms describe intentionally different coverage and rise, not a claim that all retail names have universal definitions. |
| `ms-high-leg-flatlay` | [M&S cotton high-leg knickers](https://www.marksandspencer.com/7-pack-pure-cotton-high-leg-knickers/p/clp60778889) | Arranged flat adult garment photograph: higher leg arches, tall side waist and thin elastic. Shape reference only; no retail artwork or label is included. |
| `freesewing-bruce` | [FreeSewing Bruce](https://freesewing.eu/docs/designs/bruce/) | Boxer-brief panel and waistband construction. The library's loose boxers are an original wider-legged cloth interpretation, not the fitted product pattern. |
| `jalie-socks` | [Jalie 2448 stretch socks](https://jalie.com/products/stretch-socks-sewing-pattern) | Adult heel/foot/cuff construction. The original ordinary socks use the shape, not the source's particular fleece material. Pairs retain two visible socks. |
| `clothhouse-bucket-hat` | [Cloth House bucket-hat guide](https://www.clothhouse.com/blogs/news/free-pattern-the-bucket-hat) | Soft crown, side band and downward brim; the hanging-hat image informed the hung state. Reference only. |
| `katagami-cap` | [Katagami adult six-panel cap guide](https://katagami.org/en/howto-cap.html) | Adult panel crown, curved stiffened peak and rear adjustment construction. Reference only; no pattern sheets are redistributed. |
| `ms-straw-hat` | [M&S paper-straw fedora](https://www.marksandspencer.com/paper-straw-fedora-hat/p/clp60778207) | Generic indented crown, band and wide-brim proportions. Shape reference only; decorative branding is omitted. |
| `ms-nightdress` | [M&S cotton-rich ribbed nightdress](https://www.marksandspencer.in/cotton-rich-ribbed-nightdress/p/P60708507.html) | Adult loose sleepwear, neckline, hem and placket construction. A lighter original nightdress shape is appropriate to this art brief; the generated mesh does not claim to reproduce the pictured long-sleeved retail garment. |

## Cloth surface and simulation

- [Poly Haven Fabric Pattern 07](https://polyhaven.com/a/fabric_pattern_07) was inspected for matte woven cotton and subtle yarn variation. Poly Haven's [asset licence](https://polyhaven.com/license) is **CC0**. It is a surface reference only: no large PBR texture was downloaded or bundled. The small shipped print atlas is original generated artwork.
- [Blender cloth introduction](https://docs.blender.org/manual/en/latest/physics/cloth/introduction.html) documents simulating through intermediate frames and applying the Cloth modifier to freeze a static state. [Cloth Shape settings](https://docs.staging.blender.org/manual/en/latest/physics/cloth/settings/shape.html) document weighted pin groups. These are the technique references for static fold baking; the exported object meshes carry no live simulation or wearable rig.
- No ambientCG asset is listed as used because its asset/licence pages could not be reliably inspected in this session.

## Original art choices

`palette.json` defines six plain colours, two narrow-stripe patterns, two small floral patterns, four generic football-colour combinations and two straw tones. Flowers, leaves and stripes are generated from simple original motifs. There are no crests, sponsors, player names, brand labels or copied kit graphics. Colours and assortments are art choices for varied everyday stock, not ethnographic claims about the neighbourhood.

The atlas is an optional external binding of the existing `laundry` material. That material already exists in `js/world/matdefs.js`; its white base and vertex-colour support allow plain tint fallback. GLBs contain no embedded images. See `GARMENTS.md` for the actual generator, validation and preview procedure.

## Repository contracts actually available

The work starts at `origin/main` commit `8fa06a5498555afc5dc2b636c06754a4a6b5882c`. Verified furniture keys in `js/interiors/catalog.js` include `dresser_4`, `dresser_low`, `wardrobe_2`, `wardrobe_3`, `wardrobe_metal`, `clothesline`, `drying_rack`, `shelf_fabric`, `shelf_tienda`, `shop_counter_wood` and `cutting_table`. They are suitable container *types*, not exact placed instances.

`dev/FEATURE-DRAWERS.md`, `js/interiors/contents.js` and `js/interiors/finds.js` are absent in this baseline. Consequently `assortments.json` records those bindings as deferred and leaves `findIds` empty. It does not fabricate discovery IDs or change game placement code. The object library does not imply that the conditional wearable Part B is implemented.

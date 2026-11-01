# Teen garment object provenance

All teen meshes, seams, trim, pockets, hoods, straps, shoes and the cap are original
procedural work created for La Ladera. The fabric atlas and the sun motif are original
generated artwork. No third-party model, sewing pattern, logo, badge, school insignia,
image, photograph, rig or animation was imported. The garments are ordinary everyday
objects, stored without a wearer; the two sizes are game-prop scales of an
adult-reference pattern, not a sizing standard.

| Source ID | Source | Use |
| --- | --- | --- |
| `original-teen-patterns` | `garments_teen_build.py`, with the cloth bake, folding, export and material helpers of `garments_build.py`; the catalogue is `garments_teen.catalog.json` | Original generic silhouettes (tops, bottoms, dresses, hoodie, jacket, school wear, socks, cap, plain underwear and swimwear, shoes and sandals), relaxed empty cloth, hand-arranged folded parcels, seams, collars, pockets, hood, zip and straps. |
| `original-teen-fabrics` | `garments_teen_textures.py` and `assets/models/garments/teen/palette.json` | One 256 × 256 atlas of 16 deterministic fabric tiles (jersey, rib, stretch, denim, fleece, piqué, knit, twill, weave, matte, canvas and a geometric sun) drawn with the Python standard library; nothing is embedded in the GLB. |

The set follows the age brief `small` (about 12 to 15) and `big` (about 16 to 19) as a
uniform 0.70 and 0.90 scale of one adult-reference pattern per style. The age labels
are art direction. School clothes are plain white, grey and navy without a crest and
make no claim to represent a particular school's uniform. Colours are art choices, not
a regional uniform specification.

The generated files are `assets/models/garments/garments_teen.glb`,
`assets/models/garments/teen/` and `assets/models/manifest.garments_teen.json`. They
reuse the library's single `laundry` material and carry no third-party content, so no
third-party licence applies to them. This document makes no further licence claim for
the generated files.

Room use is explicit and not yet wired (see `dev/garments/TEEN-PLACEMENT.md`):
`teen_bedroom` drawers and wardrobes and `school_locker` storage. The two plain
underwear styles and the swimwear are everyday stored clothing for those rooms, not an
adult-intimate range and not a claim that the barrio has a pool.

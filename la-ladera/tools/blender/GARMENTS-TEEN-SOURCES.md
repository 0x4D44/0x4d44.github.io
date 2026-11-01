# Teen garment sources and original artwork

| Source ID | Source and provenance |
| --- | --- |
| `original-teen-patterns` | Original procedural clothing geometry and fabric artwork from commit `18a37a7e29888cecc733e16bcd623b21c599916e`; no downloaded model or copied print. |

## `original-teen-patterns`

The 29 teen style outlines, sewn details, closed school shoes and strap sandals
were authored procedurally in `garments_teen_build.py` on teen branch commit
`18a37a7e29888cecc733e16bcd623b21c599916e`. This port retains those designs and the
catalogue, replacing the old single-file packaging with the six-pack convention
from child-library commit `c4e8f46e8f617896f508728f77cda029ec494e88`.

The builder reuses the adult library's original outline, sequential cloth-bake,
fold, material and export helpers. `garments_teen_textures.py` generates the
original 256×256 fabric atlas: sixteen fabric/colour tiles, including a simple
geometric sun motif. No product photograph, downloaded garment mesh, copied
print, real brand, school crest or logo is included. School colours are generic
art choices, not a representation of one school's uniform.

The source ID `original-teen-patterns` remains attached to all catalogue styles.
The plain clothing is stored as empty objects; there are no people, bodies,
skins, animations or wearable fittings in this library.

## Reuse terms

The original teen geometry, atlas artwork, palette and catalogue are dedicated
to CC0 1.0, consistently with the original garment library. This dedication
covers the original generated artwork; it does not change source-code licensing.
The adult and child asset files are retained byte-for-byte; this port does not
alter their provenance or licensing.

Reference: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
See [the teen asset contract](GARMENTS-TEEN.md) and
[placement guidance](../../dev/garments/TEEN-PLACEMENT.md) for the current layout.

# Ground and sky — offline texture library

This library supplies original Andean ground materials, soft terrain-patch
decals, terrain blend masks, a layered fictional valley city, haze ramps and
far-field vegetation. It is deliberately dormant: the game does not import,
register or instantiate any part of it.

The intended later uses are softer dirt/grass/gravel transitions, replacing a
hard-edged distant haze card, and giving the mirador a city-facing vista. No
terrain coordinates or runtime placement are changed by this PR.

## Contents

| Group | Delivered content |
| --- | --- |
| Ground | 24 seamless 1024 × 1024 PBR sets; separate albedo, OpenGL tangent normal and packed ORM maps |
| Patches | 16 organic, soft-alpha 512 × 512 decals, with authored world sizes between 1 and 4 metres |
| Splatting | Eight independent, tileable 1024 × 1024 masks, packed into two RGBA texture planes |
| Valley city | Three 4096 × 512 depth layers, each in day, dusk and night variants, spanning a 200-degree cylindrical arc |
| Haze | Five 256 × 4 colour/opacity ramps for 7, 12, 17.2, 19.5 and 22 hours |
| Vegetation | Six four-cell billboard atlases, each at 1024, 512 and 256 pixels |

Every texture has a kind-specific filename, metre dimensions, intended use,
tiling flags, colour-space notes and byte/SHA-256 pins. Source PNG masters live
under `masters/`; their runtime copies live under
`../../assets/textures/groundsky/`. The independent manifest is
[`../../assets/models/manifest.groundsky.json`](../../assets/models/manifest.groundsky.json),
and the catalogue is
[`../../tools/groundsky.catalog.json`](../../tools/groundsky.catalog.json).

### Ground families

Lush, dry, trampled and clover-edge kikuyu; brown and pale dry dirt; dry and wet
red clay; fine grey and coarse river gravel; tyre-tracked and footworn packed
earth; rutted and puddled mud; dark and pale stone scatter; eucalyptus and mixed
leaf litter; moss at cobble edges; light and dark cracked concrete; repaired
and gravel-edged asphalt; sand transitioning to kikuyu.

### City and vegetation

The fictional city combines brick towers, irregular hillside houses, wooded
drainage lines, far ridges, a church spire, stadium and radio masts. These are
generic original shapes, with no real landmarks or logos. Day/dusk/night
masters share each layer's alpha silhouette exactly; lit windows change with
the phase. The procedural style is intentionally suited to distant use.

The vegetation families are eucalyptus stands, kikuyu slopes, banana groves,
cypress hedges, cloud-forest edge and rooftop container gardens. Four cells
per atlas provide variants. Cell layout, pivots and transparent gutters remain
registered at all three LODs. These are flat far-field cards, not close-up
trees or animated plants.

## Delivery format and budgets

The requested full texture inventory cannot fit 80 MB as uncompressed RGBA8
with mipmaps. This library therefore supplies **ASTC LDR in KTX2** with 4 × 4 blocks for vegetation, 6 × 6 blocks
for other textures, and Zstandard supercompression and a complete mip chain down to 1 × 1. All 122 runtime
textures, including every time-of-day variant and every vegetation LOD, are
included in the allocation calculation. The estimate is not limited to an
assumed active subset.

**Native ASTC support is required for the budgeted delivery.** A future loader
must inflate KTX2 Zstandard scheme 2 and upload the resulting ASTC blocks. These are
not universal Basis/UASTC payloads. Support must be checked before loading;
silently expanding every texture to RGBA8 would exceed this library's cap.
Alternative target formats can be generated from the PNG masters, but their
memory and quality need separate verification. This PR does not add a loader
or test target-device support.

The fixed independent limits are 12,000,000 bytes for **all master PNGs plus
all delivered KTX2 files**, 4,000,000 bytes for any one texture and 80,000,000
bytes for all delivered GPU mip blocks. Review images and source code are not
runtime textures. The existing repository payload gate remains unchanged;
it does not understand KTX2 allocations, so the independent Ground/Sky gate
adds the actual block accounting instead of treating compressed PNG size as
GPU size. See [VERIFICATION.md](VERIFICATION.md) for measured results.

The encoder performs a bounded simplification of low-contrast texture blocks,
using legal constant-colour ASTC blocks with quantized endpoints. Vegetation
uses 4 × 4 blocks so its guaranteed 16/8/4-pixel cell gutters align with whole
blocks at the three delivered LODs. It preserves
the original 1024 px PNG masters. High-contrast regions retain Arm's ASTC
encoding. The fidelity auditor measures the final exported bytes against
those masters with fixed colour, opacity, normal, seam and gutter limits.

## Colour, scale and alpha contract

- Albedo, city, vegetation and haze RGB are sRGB. Normal, ORM and mask values
  are linear data. Colour mipmaps are filtered in linear light.
- Normals use tangent-space +Y (OpenGL) and +Z outward. Mip vectors are
  renormalized. A consuming material should normalize sampled normals.
- ORM channels are **R = ambient occlusion, G = roughness, B = metallic**.
  These ground surfaces are nonmetallic, so B is zero in the PNG masters.
- The two blend-mask files contain four independent masks apiece. **Their A
  channel is mask data, not opacity.** Do not premultiply their RGB by A.
- Decals, city and vegetation use straight alpha. Their colour mips use
  premultiplied filtering followed by unpremultiplication, preserving the
  straight-alpha delivery contract. Haze opacity increases with distance.
- PNG tiling edges match exactly on the declared axes. Lossy ASTC edges have
  separately measured error limits; bit-exact matching is not claimed for
  block-compressed copies.
- Panorama `u` maps to -100 through +100 degrees. The catalogue records each
  layer's nominal radius and arc length in metres. Layers must follow the
  viewer's position to remain a distant backdrop; game-side parallax,
  vertical placement and haze blending are later integration work.
- The mask atlas is two channel-packed planes of one eight-mask set. All
  eight masks retain full 1024 px resolution; no 256 px subcells are presented
  as 1024 px masks.

## Contact sheets and eye-height examples

- [All 24 PBR sets](contact-ground.png)
- [All 16 soft decals](contact-decals.png)
- [All eight blend masks](contact-masks.png)
- [City layers and lighting phases](contact-city.png)
- [Six vegetation families and all three LODs](contact-vegetation.png)
- [Five haze ramps](contact-haze.png)
- [Master / decoded-delivery comparison](contact-delivery.png)
- [Ground transitions at 1.60 m eye height](eye-height-ground.png)
- [Mirador and city at 1.60 m eye height](eye-height-mirador.png)

The two scenes are illustrative review layouts rendered with Blender 5.x,
Cycles CPU and two threads. They use pixels decoded from the delivered KTX2
files and a measured 1.80 m reference figure. They are not game screenshots,
and the scene furniture is review scaffolding, not additional shipped assets.

## Rebuild and verify

Requirements: Python 3 with NumPy/Pillow/zstandard, Node 22.16.0, Arm astcenc 5.7.0,
Khronos KTX-Software 4.4.2, and Blender 5.x. Supply your own executable paths.
Nothing is downloaded by the build scripts.

```sh
node la-ladera/tests/payload.mjs
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_ground.py
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_sky.py
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_build.py --astcenc /path/to/astcenc
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_fidelity.py --ktx /path/to/ktx --astcenc /path/to/astcenc --decoded /scratch/groundsky-decoded
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/groundsky_render.py -- --decoded /scratch/groundsky-decoded
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_contact.py --decoded /scratch/groundsky-decoded
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/groundsky_build.py --manifest-only
node la-ladera/tools/groundsky_verify.mjs
```

The independent Node validator decodes PNG chunks, CRCs, filters, palettes and
alpha itself; parses/inflates every KTX2 mip; measures file and GPU budgets;
checks inventory, hashes, channel roles, scale, tiling, alpha and source pairing;
and rejects accidental game imports or active registry entries. The per-test
mutation runner proves every named assertion can fail on its deliberately
wrong input. The additional fidelity auditor uses the official Khronos and
Arm tools, rather than the generator, to check actual compressed exports.

## Not verified

Runtime integration in La Ladera is untested. The original reported terrain
patches at (5, 30) and (25, 8), the live mirador vista, boot time, draw calls,
GPU frame time, target-browser ASTC support, a runtime KTX2 loader, time-of-day
crossfades, alpha sorting/depth behavior, temporal shimmer and platform-specific
texture sampling have not been tested. This pack supplies assets and evidence
for the builders who will wire them in; it does not claim those game defects
are already fixed. CPU image decoding and offline renders do not establish
native GPU performance.

See [LICENSE.md](LICENSE.md) for original-work provenance and licensing.

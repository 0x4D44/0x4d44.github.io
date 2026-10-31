# Vendored MakeHuman head data

makehuman_head.json.gz is a compact, deterministic subset of the **CC0 1.0**
MakeHuman HM08 base mesh and eighteen MPFB age/sex/shape targets. It contains
geometry and morph data only; no MPFB program code, add-on, material or rig.
The existing La Ladera skeleton, clothes and animations remain the authoring
contract. MAKEHUMAN_CC0.txt contains the upstream asset license.

- Upstream: <https://github.com/makehumancommunity/mpfb2>
- Pinned commit: 6ff1eb358f6c1959ced77e79e6dd2406d9a71f49
- License explanation: <https://www.makehumancommunity.org/about/license.html>
- Base mesh SHA-256:
  8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c
- Derived gzip SHA-256:
  e26a048f91055f77e397ede9215e69a1a8459dec42ca0f813a87cc7adb9c10db

The embedded sourceHashes ledger records the exact files used. Source vertex
indices are retained for audit. Coordinates are quantized in original MakeHuman
units at 1/10,000, and source target offsets at their native 1/1,000 precision.
The subset contains the body faces above source Y=5.8 and the original helper
eyeballs. The build discards the source rig, fits the head between the existing
chin/crown, decimates the head in Blender, and assigns the existing head weights.
No upstream texture is required: generated skin, eye, hair and clothing details
use the existing shared atlas and material name.

The three historical source-morph labels (African, Asian and Caucasian) are file
names, not a claim that an Andean or mestizo phenotype is one source template.
Each resident has authored mixtures and independent individual proportions.
Skin colours, ancestry descriptions and morph weights are separate art inputs.

## Recreate the vendored source

Obtain an MPFB checkout at the pinned commit, then from the repository root run:

    node la-ladera/tools/nice.mjs python la-ladera/tools/blender/people_head_source.py /path/to/mpfb2

The recipe verifies both the commit and base-mesh hash, emits compact sorted JSON
with a fixed gzip timestamp, and copies the CC0 license. It is an offline source
preparation step. Normal resident regeneration consumes the committed gzip and
does not download or install MPFB.

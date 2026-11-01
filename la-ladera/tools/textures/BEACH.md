# Beach texture and sprite library

This is the offline texture pack from `dev/FEATURE-BEACH.md`, sections 1.4,
4.4 and 7. The base was verified as
`38542092094aaf0101cc9920fd8628fcdaf0ac35`.

The library has **25 entries, 51 PNGs and 70 occupied atlas cells**. Its
independent manifest is `assets/textures/manifest.beach.json`. Neither active
manifest lists it. No game JavaScript, material registry, existing texture,
existing test or budget is changed.

## Contents and scale

| Materials | Albedo / primary size | Repeat in metres |
| --- | --- | --- |
| `sand_dry`, `sand_wet` | 1024 square | 2.5 |
| `seabed_sand` | 1024 square | 3 |
| `rock_sea` | 1024 square | 2 |
| `seabed_rock` | 512 square | 3 |
| `seawall_concrete`, `jetty_planks` | 512 square | 2 |
| `promenade_pavers` | 512 square | 2.4; six by six 40 cm pavers |
| `pile_wood`, `thatch_palm` | 512 square | 1.5 |
| `canvas_stripe` | 512 square, neutral tintable bands | 1 |
| `boat_hull_paint` | 512 square | 3 |
| `rope_hemp` | 256 square | 0.5 |
| `water_ripple_n`, `foam_noise` | 256 square | 6 |
| `caustic_tile` | 256 square | 4 |

Each of the thirteen physical materials has an albedo, a **256 square normal
map** and a **256 square scalar roughness map**. The smaller data maps retain
the requested albedo resolutions while fitting the fixed eight-million-byte
pack limit. Albedo uses sRGB; normals, roughness and water effects use linear
data. Normal maps use OpenGL +Y tangent space and normalized positive-Z vectors.
The normals and roughness are derived artistic approximations from source
luminance, not measured photogrammetric material properties.

Most tiles repeat in both axes. `pile_wood` and `boat_hull_paint` repeat only
in X, preserving their lower growth/waterline bands. `rope_hemp` repeats only
along Y. These axes follow the beach brief and are explicit on every map.

| Atlas | Size | Occupied cells |
| --- | --- | ---: |
| `sails_kites` | 1024 × 512 | 6 numbered sails with windows + 6 kite wings |
| `board_decks` | 1024 × 512 | 8 original deck designs |
| `towels_bags` | 512 × 512 | 12 towels + 4 bag tops |
| `signs_menus` | 1024 × 512 | 10 Spanish signs |
| `boat_names` | 512 × 256, alpha | 4 names |
| `gull_sprites` | 1024 × 256, alpha | 4 flap frames, standing, 2 walk frames, cleaning |
| `fish_sprites` | 512 × 256, alpha | silver jack, yellow-striped grunt, blue tang; 2 frames each |
| `crab_shells` | 256 × 256, alpha | ghost crab, conch, scallop |
| `seagrass_coral` | 512 × 512, alpha | turtle grass, branching coral, brain coral |

The bottom-right cells of the crab/shell and vegetation atlases are empty.
They are not declared as assets. Every occupied cell has an integer
`rect: [x, y, width, height]`, a `contentRect`, a gutter and normalized UVs.
Pixel rectangles and UVs have **top-left origin**. Convert V for a
bottom-origin consumer; do not silently invert the atlas.

Gull and fish animation groups share a measured eye anchor and one scale per
group. Metadata records the source eye coordinates, output anchor, pivot,
frame order and rate. The gull flap cycle visits `[0,1,2,3,2,1]`, the walk cycle
uses `[5,6]`, and fish pairs use `[0,3]`, `[1,4]`, `[2,5]`.
Static gull pivots are at their feet; animated pivots are at the registered eye.
Eye coordinates were visually measured; the validator checks their consistency
and actual alpha bounds, not semantic eye recognition.

This texture-only deliverable has no GLBs, triangles or model LODs. The
separate, explicitly sized repeat tiles and nine atlases are the inputs for
the later beach model libraries.

## Original sources and licence

All visual source artwork was made with the **built-in OpenAI image generator**,
with no external reference images, real brands, logos or downloaded artwork.
`beach.sources.json` retains every selected prompt, raw SHA-256, source
dimensions and crop/registration measurements. The sea-green turtle-grass
revision also retains its original generation prompt and edit-input hash.
The manifest carries per-texture provenance and SHA-256 pins for every PNG.

The original artwork is dedicated under **CC0-1.0**, to the extent rights in
the contributed artwork can be waived. The existing repository licence
continues to apply to code. No third-party source image is included.

The selected high-resolution source PNGs are build inputs and are not part of
the shipped pack. Image generation is not deterministic. Regenerating the
same prompt will not reproduce the pinned source; the exporter requires the
selected source bytes and rejects a mismatched source hash. PNG export and
proof refresh are deterministic for the selected inputs and tool versions.

## Quiet rebuild

From the repository root, use **Node 22.16.0**. Python requires Pillow and NumPy,
as the existing texture factory does. The exporter imports the existing
`post.py` periodic/normal functions without editing them.

```sh
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/textures/beach_build.py --raw-dir /path/to/selected-sources
```

The source directory contains `<id>.png` for the 25 IDs in
`beach.sources.json`; no API key or external service is invoked by the export.
Inspect the final `dev/beach-textures/signs-proof.png`, then attest that review:

```sh
node la-ladera/tools/nice.mjs --idle python la-ladera/tools/textures/beach_build.py --refresh-only --signs-verified
```

`--refresh-only` rebuilds the manifest and contact sheets from the delivered
PNGs without source images or another generation. It does not rewrite artwork.
Do not assert `--signs-verified` before inspecting the actual exported lettering.
The proof preserves “Zona de baño” with ñ and the requested unaccented
“Maria del Mar”; the other phrases are transcribed verbatim.

The builder exports indexed PNGs without dithering, smooth scalar roughness
and genuine source alpha. Periodic correction followed by a four-pixel taper
matches opposite boundary samples exactly on declared axes. A common palette
preserves those matches. Sprite packing fits silhouettes without stretching;
animated groups use one affine scale and anchor. Subvisible alpha values at
or below 2/255 are cleared, and palette encoding preserves fully transparent
gutters rather than averaging them into a faint opaque edge.

## Independent acceptance

```sh
node la-ladera/tools/textures/beach_validate.mjs --complete
node --test-reporter=tap la-ladera/tests/beach-textures.test.mjs
node la-ladera/tests/beach-textures-mutations.mjs --out la-ladera/dev/beach-textures/verification
node la-ladera/tests/payload.mjs
```

The decoder is independent of Pillow and the exporter. It checks PNG chunk
CRC/length/order, every scanline filter, indexed transparency, complete
inflation, dimensions and actual pixels. The gate checks the full catalogue,
metre scales, POT dimensions, map roles, unit normals, scalar roughness,
promised alpha, cell bounds/UVs/content/gutters, animation registration,
provenance, sign proof, binary hashes, LF-normalized input hashes, unlisted
payload files and inactive loaders.

Seam tolerance is **maximum 0 and mean 0 per 8-bit channel** at the two opposite
boundary samples. This is checked after final PNG decoding. The mutation suite
shifts one actual edge and updates the hash and byte totals; the seam gate must
still reject it. Exact edge matching is supplemented by inspecting every
repeatable map tiled 3 × 3; it does not prove an absence of recognizable pattern
repetition at every viewing distance.

The fixed pack cap is **8,000,000 bytes**, including PNGs and its manifest.
The standalone GPU cap is **160 MiB**. GPU accounting assumes RGBA8 plus the
complete mip chain for every supplied map, even indexed or grayscale PNGs;
it claims no palette compression on the GPU. Review PNGs under `dev/` are
documentation, separate from this asset pack, and are not loaded by the game.

Every named Node test has its own deliberately wrong fixture. The mutation
runner records a green baseline and checks that each changed input produces
the expected named assertion failure. The registration mutant moves an eye
anchor and updates its pivot consistently, so cross-frame drift must be caught.

## Rendered review

```sh
CHROME_PATH=/path/to/chrome node la-ladera/tests/beach-textures-gallery.mjs
```

The harness is headless, low priority, muted and hidden. It loads the isolated
review page and vendored Three.js r180, with no game boot. All 25 entries have
front and oblique views at **1.60 m camera height**, beside a measured **1.80 m
reference figure**. Atlas panels are enlarged proof displays, not proposed
physical object sizes.

See [review and acceptance evidence](../../dev/beach-textures/README.md).
World integration, game boot timing, swimming, draw calls, triangle budgets and
target-hardware frame time are not verified by these offline texture renders.

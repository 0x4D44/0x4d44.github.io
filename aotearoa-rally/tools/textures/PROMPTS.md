# Texture pipeline

Raw PNGs are generated with Codex image generation, then post-processed by `build-textures.py`.
Raw files are NOT shipped. One raw file per entry, named `NAME.png` (NAME = key in `specs.py` / `manifest.json`).

## Commands

Run from `aotearoa-rally/`. SCRATCH = `.scratch/tex` (delete afterwards).

    # generate (4 parallel; skips existing NAME.png; --force to redo; or list names)
    python tools/textures/gen-raw.py .scratch/tex [name ...] [--jobs 4] [--force]

    # post-process -> assets/tex/*.jpg|webp + *_n.jpg + manifest.json
    python tools/textures/build-textures.py .scratch/tex [name ...]

Each generation is this command (prompt text built in `specs.py`), stdin closed, one PNG per call:

    deltic timeout 280 codex exec --json --skip-git-repo-check -C <SCRATCH> -s workspace-write \
      -c approval_policy=never -m gpt-6.1-sol -c model_reasoning_effort=medium \
      "Use your built-in image generation tool to generate ONE square <DESC>; <SUFFIX>. Then save the resulting PNG into the current working directory as NAME.png and reply with only the saved file path." </dev/null

Tile SUFFIX (road, ground, bark):
`photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark`

Foliage SUFFIX:
`front view, photographic, a single subject centred and fully inside the frame with margin, on a FLAT PURE MAGENTA (#FF00FF) background, nothing else, no shadows, no text, no watermark`

## Descriptions (DESC)

| NAME | DESC | size | tile m |
|---|---|---|---|
| road_gravel | loose crushed grey-brown rally gravel over hardpack, with a faint tyre-compacted track | 1024 | 3 |
| road_dirt | packed light-brown clay farm track surface with hairline cracks | 1024 | 3 |
| road_tarmac | worn dark-grey chip-seal asphalt with subtle aggregate, no road markings | 1024 | 3 |
| road_mud | wet churned dark brown clay mud with ruts and puddle sheen | 1024 | 3 |
| road_snow | packed snow and ice, slightly blue-white, tyre-polished | 1024 | 3 |
| road_pumice | pale cream volcanic pumice sand and gravel | 1024 | 3 |
| gnd_grass | lush New Zealand pasture grass | 1024 | 6 |
| gnd_tussock | golden-brown dry tussock grass ground | 1024 | 6 |
| gnd_leaf | forest floor of leaf litter and conifer needles | 1024 | 6 |
| gnd_schist | grey-green layered schist rock surface | 1024 | 6 |
| gnd_limestone | pale weathered limestone karst rock surface | 1024 | 6 |
| gnd_moss_rock | dark rock covered in green moss | 1024 | 6 |
| gnd_sand | tan beach sand | 1024 | 6 |
| gnd_snow | fresh snow with fine sparkle | 1024 | 6 |
| gnd_fern | forest floor with small fern fronds and moss | 1024 | 6 |
| bark_redwood | deep furrowed reddish-brown fibrous redwood bark | 512 | 1.5 |
| bark_beech | grey-brown mossy southern beech bark | 512 | 1.5 |
| bark_pine | rough orange-grey pine and macrocarpa bark plates | 512 | 1.5 |
| foliage_fern | lush fern frond | 512 | 1 |
| foliage_pine | dense conifer needle branch spray | 512 | 1 |
| foliage_broadleaf | leafy twig of glossy dark-green leaves | 512 | 1 |
| foliage_flax | fan of long strap-like flax and toetoe blades pointing upward | 512 | 1 |
| foliage_grass | tuft of long grass blades | 512 | 1 |

## Post-processing (build-textures.py)

- Tiles: centre-crop square, resize, divide out low-frequency lighting (FFT blur), make seamless by
  blending with the half-offset copy under a sin^2 weight, restore contrast, JPEG (<=600 KB, quality
  steps down from 85). Normal map only for road_* and gnd_grass, gnd_schist, gnd_limestone (others
  get `"normal": null`): 512px, Sobel on luminance, strength 2, wrapped
  edges, +Y up (OpenGL), `NAME_n.jpg`.
- Foliage: magenta chroma key with soft edge and de-spill, crop to subject, pad to square, resize to
  512 (premultiplied), bleed colours into transparent pixels, WebP with alpha (quality 85, <=300 KB).
- `manifest.json` lists only the entries that were produced.

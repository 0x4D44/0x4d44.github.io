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
| gnd_grass2 | lush New Zealand pasture grass (replaces gnd_grass in round 4; the old file is removed) | 1024 | 6 |
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
  steps down from 85). Normal map only for road_*, rock_*, gnd_grass2, gnd_schist and gnd_limestone (others
  get `"normal": null`): 512px, Sobel on luminance, strength 2, wrapped
  edges, +Y up (OpenGL), `NAME_n.jpg`.
- Foliage: magenta chroma key with soft edge and de-spill, crop to subject, pad to square, resize to
  512 (premultiplied), bleed colours into transparent pixels, WebP with alpha (quality 85, <=300 KB).
- `manifest.json` lists only the entries that were produced.

## Round 4, lead-run

These ten prompts were run through Codex by the lead, not by the build agent; the raw PNGs are in the lane scratch folder (not committed) and were built with build-textures.py. Prompts verbatim:

- gnd_grass2:
  ```
  Use your built-in image generation tool to generate ONE square short lush green New Zealand pasture grass seen from above, dense fine blades in varied greens and yellow-green with a few clover leaves, soft and natural, no leaf veins, no net pattern; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as gnd_grass2.png and reply with only the saved file path.
  ```
- rock_schist:
  ```
  Use your built-in image generation tool to generate ONE square blue-grey layered Central Otago schist rock face with thin foliation planes, rusty orange iron staining along joints and sparse yellow-green lichen; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_schist.png and reply with only the saved file path.
  ```
- rock_limestone:
  ```
  Use your built-in image generation tool to generate ONE square pale cream-grey weathered New Zealand limestone karst rock face with solution pits, dark water-streak stains and moss in the crevices; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_limestone.png and reply with only the saved file path.
  ```
- rock_volcanic:
  ```
  Use your built-in image generation tool to generate ONE square dark brown-black volcanic scoria and ignimbrite rock face with vesicular holes, rusty orange oxide stains and pale ash dust in the cracks; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_volcanic.png and reply with only the saved file path.
  ```
- rock_coastal:
  ```
  Use your built-in image generation tool to generate ONE square warm brown and orange weathered coastal sandstone rock face with horizontal bedding, salt-bleached pale patches and small pits; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_coastal.png and reply with only the saved file path.
  ```
- rock_fiord:
  ```
  Use your built-in image generation tool to generate ONE square dark wet grey granite gneiss rock face streaked by running water, with patches of green moss and tiny ferns in the cracks; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_fiord.png and reply with only the saved file path.
  ```
- rock_cliff:
  ```
  Use your built-in image generation tool to generate ONE square weathered grey-green New Zealand greywacke cliff rock face with fine vertical strata, hairline cracks and lichen flecks; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as rock_cliff.png and reply with only the saved file path.
  ```
- wool_fleece:
  ```
  Use your built-in image generation tool to generate ONE square creamy off-white sheep wool fleece with soft dense curls and slight grey-brown dirt flecks; photographic, top-down orthographic view, seamless tileable texture, even flat diffuse lighting, no shadows, no perspective, no text, no watermark. Then save the resulting PNG into the current working directory as wool_fleece.png and reply with only the saved file path.
  ```
- foliage_toetoe:
  ```
  Use your built-in image generation tool to generate ONE square single toetoe grass plant: one tall arching stalk carrying a long soft feathery cream-silver seed plume, with a few long arching green-gold blades at the base; front view, photographic, a single subject centred and fully inside the frame with margin, on a FLAT PURE MAGENTA (#FF00FF) background, nothing else, no shadows, no text, no watermark. Then save the resulting PNG into the current working directory as foliage_toetoe.png and reply with only the saved file path.
  ```
- foliage_pohutukawa:
  ```
  Use your built-in image generation tool to generate ONE square dense leafy pohutukawa branch with glossy dark-green oval leaves, pale grey undersides and several clusters of bright crimson-red bottlebrush flowers; front view, photographic, a single subject centred and fully inside the frame with margin, on a FLAT PURE MAGENTA (#FF00FF) background, nothing else, no shadows, no text, no watermark. Then save the resulting PNG into the current working directory as foliage_pohutukawa.png and reply with only the saved file path.
  ```

Round 4 post-processing additions: rock_* use the tile pipeline with a 300 KB JPEG limit (quality floor 50) and get a 512px normal map; gnd_grass2 replaces gnd_grass (also has a normal map); wool_fleece is a 512px ground tile; foliage_toetoe and foliage_pohutukawa use the foliage pipeline (WebP alpha, <=300 KB, despilled so no pink fringe). rock_*, wool_fleece and the two foliage cards are loaded lazily, only for stages that use them.

## Round 5: roadside adverts

The 14 poster pictures (`ad_*.png`, 1774x887, text-free) were generated by the lead with Codex (prompts not recorded here); `tools/textures/build-adverts.py` crops them to 2:1, adds the captions (title and one line, Impact / Arial Bold; the house ad is `0x4d44 software` in Consolas Bold) and packs `assets/tex/adverts.webp` + `adverts.json`. Run: `python tools/textures/build-adverts.py <folder with ad_*.png>`.

# UI art: prompts and commands

The key art, the six stage cards and the loading backdrop in `assets/ui/*.webp` were generated with an
AI image generator (Codex image generation, model `gpt-6.1-sol`) and then processed (resized, converted
to WebP). They are not hand-drawn or photographed. Raw PNGs are not shipped.

## Command (one image per call, stdin closed)

    deltic timeout 280 codex exec --json --skip-git-repo-check -C <SCRATCH> -s workspace-write \
      -c approval_policy=never -m gpt-6.1-sol -c model_reasoning_effort=medium \
      "Use your built-in image generation tool to generate ONE wide cinematic <DESC> No text, no letters, no logos, no watermarks. Then save the resulting PNG into the current working directory as <NAME>.png and reply with only the saved file path." </dev/null

## Descriptions (DESC)

| NAME | DESC |
|---|---|
| keyart | painterly photoreal 16:9 illustration of a rally car with a green and yellow livery sliding sideways on a gravel road, dust plume lit by golden-hour sun, New Zealand snow-capped mountains and golden tussock behind, dramatic sky. |
| card-waitomo | landscape of rolling green pasture hills in Waikato New Zealand with pale limestone bluffs, shelterbelt trees, sheep, a gravel road winding, clear morning with light mist in hollows. No cars. |
| card-whakarewarewa | view of giant redwood forest in Rotorua New Zealand, tree ferns, rising steam, a pumice gravel road through trees, dappled overcast light. No cars. |
| card-coromandel | Coromandel Coast New Zealand at golden-hour sunset, red pohutukawa trees on sea cliffs, a coastal road above a beach, sea glare on the water. No cars. |
| card-otago | Central Otago New Zealand vast golden tussock plains, schist rock tors, huge bright sky, a dusty hardpack road, strong wind. No cars. |
| card-remarkables | Remarkables alpine pass near Queenstown New Zealand, switchback gravel road with snow patches, rock walls, drop-offs, low cloud and snow flurries, cold blue light. No cars. |
| card-fiordland | Fiordland New Zealand beech rainforest at dusk in heavy rain, moss and ferns, a waterfall, a wet muddy road with puddles reflecting, moody blue-green light. No cars. |
| loading | dark atmospheric abstract backdrop of New Zealand silver fern fronds and koru spirals in deep forest green and black with soft kowhai-yellow rim light, subtle depth, space for a logo in the centre. |

## Processing

Pillow, plain `python` (no `-I`, it needs the user site-packages): each PNG is converted to RGB, shrunk with
`thumbnail((1600, 1600), LANCZOS)` and saved as WebP, lowering quality from 82 to 50 until the file is
at most 340 KB. Result: `assets/ui/<NAME>.webp`, about 2.1 MB in total.

## What is not generated

Everything else in the UI (icons, pace-note glyphs, charts, the koru mark, the silhouettes) is SVG or canvas
drawn in code. The 3D world, car models, audio and physics are procedural code, not generated images. Terrain
and road textures are logged separately in `tools/textures/PROMPTS.md`.

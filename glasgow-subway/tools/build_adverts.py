"""Pack advert posters into a 2048^2 atlas of 4x4 square cells (512 px).

    python3 tools/build_adverts.py <dir holding ad01.png .. ad16.png>                              -> models/adverts.jpg
    python3 tools/build_adverts.py <dir holding land01.png ..> land models/adverts_land.jpg        -> landscape set

The sources are 1024x1536 portrait or 1536x1024 landscape posters (generated with Codex's image tool; the briefs are
in tools/adverts_prompts.md). A poster maps one whole cell, so it is squeezed into the square cell here and stretched
back to its own aspect on the wall. Cells with no source repeat the earlier posters in order. Each cell keeps an 8 px gutter of repeated edge pixels so mipmaps do not bleed one
poster into the next; js/sim/adverts.js maps the quads inside the gutter (CELL_INSET).
"""
import os, sys
from PIL import Image

N, GRID, GUTTER = 2048, 4, 8
CELL = N // GRID
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'models', 'adverts.jpg')

def main(src, prefix='ad', dest=out):
    atlas = Image.new('RGB', (N, N))
    inner = CELL - 2 * GUTTER
    have = sorted(f for f in os.listdir(src) if f.startswith(prefix) and f.endswith('.png') and f[len(prefix):-4].isdigit())
    if not have: sys.exit(f'no {prefix}NN.png in {src}')
    for i in range(GRID * GRID):
        im = Image.open(os.path.join(src, have[i % len(have)])).convert('RGB').resize((inner, inner), Image.LANCZOS)
        cell = Image.new('RGB', (CELL, CELL))
        cell.paste(im, (GUTTER, GUTTER))
        g, e = GUTTER, GUTTER + inner   # repeat the edge rows / columns into the gutter
        cell.paste(cell.crop((g, g, e, g + 1)).resize((inner, g)), (g, 0))
        cell.paste(cell.crop((g, e - 1, e, e)).resize((inner, g)), (g, e))
        cell.paste(cell.crop((g, 0, g + 1, CELL)).resize((g, CELL)), (0, 0))
        cell.paste(cell.crop((e - 1, 0, e, CELL)).resize((g, CELL)), (e, 0))
        atlas.paste(cell, ((i % GRID) * CELL, (i // GRID) * CELL))
    atlas.save(dest, quality=84, optimize=True, progressive=True)
    print(dest, len(have), 'posters', os.path.getsize(dest))

if __name__ == '__main__':
    main(*sys.argv[1:4])

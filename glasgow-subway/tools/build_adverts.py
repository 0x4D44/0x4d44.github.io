"""Pack the 16 platform-wall adverts into models/adverts.jpg (2048^2, 4x4 cells of 512 px).

    python3 tools/build_adverts.py <dir holding ad01.png .. ad16.png>

The sources are 1024x1536 portrait posters (generated with Codex's image tool; the briefs are in tools/adverts_prompts.md).
Each wall poster quad is 0.9 x 1.3 m and maps one whole cell, so a poster is squeezed into the square cell here and
stretched back out on the wall. Each cell keeps an 8 px gutter of repeated edge pixels so mipmaps do not bleed one
poster into the next; js/sim/adverts.js maps the quads inside the gutter (CELL_INSET).
"""
import os, sys
from PIL import Image

N, GRID, GUTTER = 2048, 4, 8
CELL = N // GRID
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'models', 'adverts.jpg')

def main(src):
    atlas = Image.new('RGB', (N, N))
    inner = CELL - 2 * GUTTER
    for i in range(GRID * GRID):
        im = Image.open(os.path.join(src, f'ad{i + 1:02d}.png')).convert('RGB').resize((inner, inner), Image.LANCZOS)
        cell = Image.new('RGB', (CELL, CELL))
        cell.paste(im, (GUTTER, GUTTER))
        g, e = GUTTER, GUTTER + inner   # repeat the edge rows / columns into the gutter
        cell.paste(cell.crop((g, g, e, g + 1)).resize((inner, g)), (g, 0))
        cell.paste(cell.crop((g, e - 1, e, e)).resize((inner, g)), (g, e))
        cell.paste(cell.crop((g, 0, g + 1, CELL)).resize((g, CELL)), (0, 0))
        cell.paste(cell.crop((e - 1, 0, e, CELL)).resize((g, CELL)), (e, 0))
        atlas.paste(cell, ((i % GRID) * CELL, (i // GRID) * CELL))
    atlas.save(out, quality=84, optimize=True, progressive=True)
    print(out, os.path.getsize(out))

if __name__ == '__main__':
    main(sys.argv[1])

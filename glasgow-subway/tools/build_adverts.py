"""Pack advert posters into a 2048^2 atlas of 4x4 square cells (512 px).

    python3 tools/build_adverts.py <dir holding ad01.png .. ad16.png>                              -> models/adverts.jpg
    python3 tools/build_adverts.py <dir holding land01.png ..> land models/adverts_land.jpg        -> landscape set
    python3 tools/build_adverts.py <dir holding card01.png ..> card models/adverts_cards.jpg       -> in-train car-cards

Car-cards are different: each source carries a wide banner on a white page; it is cropped to its content, then fitted to
3:1 and packed 2 across x 4 down into 2048x1408 (cells 1024x352, same 8 px gutter; js/sim/carcards.js maps them).

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

def gutter_cell(im, cw, ch):
    """im fitted inside a cw x ch cell with GUTTER px of repeated edge pixels all round."""
    iw, ih = cw - 2 * GUTTER, ch - 2 * GUTTER
    cell = Image.new('RGB', (cw, ch)); cell.paste(im.resize((iw, ih), Image.LANCZOS), (GUTTER, GUTTER))
    g, ex, ey = GUTTER, GUTTER + iw, GUTTER + ih
    cell.paste(cell.crop((g, g, ex, g + 1)).resize((iw, g)), (g, 0)); cell.paste(cell.crop((g, ey - 1, ex, ey)).resize((iw, g)), (g, ey))
    cell.paste(cell.crop((g, 0, g + 1, ch)).resize((g, ch)), (0, 0)); cell.paste(cell.crop((ex - 1, 0, ex, ch)).resize((g, ch)), (ex, 0))
    return cell

def cards(src, dest):
    from PIL import ImageChops
    have = sorted(f for f in os.listdir(src) if f.startswith('card') and f.endswith('.png') and f[4:-4].isdigit())[:8]
    if not have: sys.exit(f'no cardNN.png in {src}')
    CW, CH = 1024, 352; atlas = Image.new('RGB', (2 * CW, 4 * CH))
    for i in range(8):
        im = Image.open(os.path.join(src, have[i % len(have)])).convert('RGB')
        bb = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0) + im.size
        im = im.crop(bb); w, h = im.size
        if w / h > 3: nw = int(h * 3); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))     # fit to 3:1 by trimming the long side
        else: nh = int(w / 3); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        atlas.paste(gutter_cell(im, CW, CH), ((i % 2) * CW, (i // 2) * CH))
    atlas.save(dest, quality=86, optimize=True, progressive=True)
    print(dest, len(have), 'cards', os.path.getsize(dest))

def main(src, prefix='ad', dest=out):
    if prefix == 'card': return cards(src, dest)
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

"""Pack the T-shirt chest prints into one atlas with transparency: 6 x 4 cells of 256 px -> models/tee_prints.png (1536 x 1024).

    python3 tools/build_tee_prints.py <dir holding tee01.png .. tee24.png>

The sources are 1024 x 1024 designs generated with Codex's image tool (the briefs are in tools/tee_prompts.md), each drawn on a flat pure-magenta
(#FF00FF) ground, which is keyed out here: how magenta a pixel is (its red and blue both above its green) sets its transparency, and the edge pixels
have the magenta taken back out of their colour, so no pink fringe is left round the artwork. Each print is shrunk into its cell inside a GUTTER of fully
transparent pixels, so mipmaps do not bleed one print into the next. Cell k (0-based, row-major from the top left) is print k + 1; js/sim/tees.js maps them.
"""
import os, sys
from PIL import Image

COLS, ROWS, CELL, GUTTER = 6, 4, 256, 6
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'models', 'tee_prints.png')

def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def key(im):
    """magenta ground -> transparent; returns RGBA with the magenta removed from partly transparent edge pixels"""
    im = im.convert('RGB'); px = im.load(); w, h = im.size
    outp = Image.new('RGBA', (w, h)); po = outp.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            k = (min(r, b) - g) / 255.0                     # 1 on pure magenta, <= 0 on any colour without both red and blue above green
            a = 1.0 - smooth(0.30, 0.70, k)
            if a <= 0.0: po[x, y] = (0, 0, 0, 0); continue
            if a < 1.0:                                     # observed = a * colour + (1 - a) * magenta
                r = (r - (1 - a) * 255) / a; g = g / a; b = (b - (1 - a) * 255) / a
            po[x, y] = (int(max(0, min(255, r))), int(max(0, min(255, g))), int(max(0, min(255, b))), int(round(a * 255)))
    return outp

def main(src):
    atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    inner = CELL - 2 * GUTTER
    for k in range(COLS * ROWS):
        p = os.path.join(src, 'tee%02d.png' % (k + 1))
        if not os.path.exists(p): sys.exit('missing ' + p)
        im = key(Image.open(p))
        im = im.convert('RGBa').resize((inner, inner), Image.LANCZOS).convert('RGBA')   # premultiplied while resampling: no dark halo
        atlas.paste(im, ((k % COLS) * CELL + GUTTER, (k // COLS) * CELL + GUTTER))
    atlas.save(out, optimize=True)
    print('wrote', os.path.normpath(out), atlas.size, round(os.path.getsize(out) / 1e6, 2), 'MB')

if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])

"""Draw the one external goods-label atlas; original fictional Spanish packaging.

Run using the quiet wrapper and a Python with Pillow, before goods_build.py:
    node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/goods_atlas.py

No downloads, real logos, image-generation services, or GUI are involved.
"""
import argparse
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from goods_catalog import ATLAS_SIZE, TILE_SIZE, ATLAS_FILE, LABELS

ROOT = Path(__file__).resolve().parents[2]
SCALE = 2


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=ROOT / 'assets' / 'textures' / ATLAS_FILE)
    ap.add_argument('--font', type=Path, help='DejaVuSans-Bold.ttf (uses a system copy by default)')
    args = ap.parse_args()
    candidates = [args.font, Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
                  Path('/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'),
                  Path('C:/Windows/Fonts/arialbd.ttf'),
                  Path('/Library/Fonts/Arial Bold.ttf')]
    font_path = next((p for p in candidates if p and p.is_file()), None)
    if not font_path:
        raise SystemExit('No suitable font: pass --font /path/to/DejaVuSans-Bold.ttf')
    im = Image.new('RGB', (ATLAS_SIZE * SCALE, ATLAS_SIZE * SCALE))
    for index, (ident, brand, product, bg, ink, accent) in enumerate(LABELS):
        tile = Image.new('RGB', (TILE_SIZE * SCALE, TILE_SIZE * SCALE), bg)
        d = ImageDraw.Draw(tile)

        def box(x0, y0, x1, y1, fill, outline=None, width=1):
            d.rectangle(tuple(int(v * SCALE) for v in (x0, y0, x1, y1)), fill, outline, width * SCALE)

        def line(points, color, width=1):
            d.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=color, width=width * SCALE)

        def ellipse(x0, y0, x1, y1, fill, outline=None, width=1):
            d.ellipse(tuple(int(v * SCALE) for v in (x0, y0, x1, y1)), fill, outline, width * SCALE)

        def poly(points, fill):
            d.polygon([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill)

        def words(s, y, size, color=ink, maxw=226):
            f = ImageFont.truetype(str(font_path), round(size * SCALE))
            while d.textbbox((0, 0), s, font=f)[2] > maxw * SCALE and size > 6:
                size -= 1
                f = ImageFont.truetype(str(font_path), round(size * SCALE))
            d.text((128 * SCALE, y * SCALE), s, font=f, fill=color, anchor='mt')

        # Eight-pixel perimeter is duplicated background: no neighbouring label
        # can bleed into these authored UVs under bilinear sampling/mipmaps.
        box(9, 9, 247, 247, bg, ink, 2)
        box(14, 14, 242, 34, accent)
        words('DESDE EL BARRIO', 18, 10, ink)
        if ident == 'periodico':
            box(14, 14, 242, 242, bg)
            words(brand, 19, 24)
            line([(17, 51), (239, 51)], ink, 2)
            words('EDICIÓN LOCAL  ·  31 OCT', 58, 9)
            words(product, 78, 19)
            box(20, 110, 139, 174, accent)
            # A little original block-print hillside panorama.
            for j, (x, y, color) in enumerate([(26, 143, ink), (51, 132, bg), (74, 119, ink), (103, 127, bg)]):
                box(x, y, x + 24, 171, color)
                poly([(x - 3, y), (x + 12, y - 10), (x + 27, y)], color)
                box(x + 9, y + 11, x + 15, y + 20, accent)
            for col in range(3):
                xx = 20 + col * 75
                start = 114 if col == 2 else 183
                for row in range(15 if col == 2 else 7):
                    yy = start + row * 7
                    if yy < 235:
                        end = xx + 64 - ((row * 7 + col * 13) % 19)
                        line([(xx, yy), (end, yy)], ink, 1)
        else:
            words(brand, 48, 26)
            line([(26, 84), (230, 84)], accent, 3)
            # Intentionally simple icons stay legible on a 10 cm bottle label.
            ellipse(87, 96, 169, 174, accent)
            if ident in ('conservas', 'jugo', 'gaseosa'):
                ellipse(109, 116, 147, 156, ink)
                poly([(127, 117), (119, 105), (139, 108)], ink)
                line([(130, 108), (131, 100)], ink, 2)
            elif ident in ('granos', 'harina'):
                line([(127, 161), (132, 109)], ink, 3)
                for j in range(4):
                    yy = 117 + j * 10
                    poly([(129, yy + 9), (112, yy), (116, yy - 5)], ink)
                    poly([(130, yy + 7), (146, yy - 3), (143, yy - 8)], ink)
            elif ident == 'aceite':
                line([(112, 160), (144, 110)], ink, 2)
                for j in range(3):
                    yy, xx = 120 + j * 13, 137 - j * 9
                    ellipse(xx - 15, yy - 9, xx, yy + 1, ink)
                    ellipse(xx + 2, yy - 3, xx + 17, yy + 6, ink)
            elif ident in ('botica', 'vendas'):
                box(118, 109, 138, 160, ink)
                box(102, 124, 154, 144, ink)
            elif ident in ('cafe', 'leche'):
                box(107, 123, 139, 150, ink)
                ellipse(132, 123, 154, 144, None, ink, 3)
                line([(102, 155), (146, 155)], ink, 3)
                line([(116, 116), (114, 108), (119, 101)], ink, 2)
                line([(129, 116), (127, 108), (132, 101)], ink, 2)
            elif ident == 'azucar':
                for xx, yy in [(112, 119), (134, 132), (112, 143)]:
                    poly([(xx, yy - 9), (xx + 12, yy), (xx, yy + 9), (xx - 12, yy)], ink)
            elif ident == 'chips':
                for j in range(3):
                    ellipse(107 + j * 7, 111 + j * 9, 143 + j * 7, 139 + j * 9, ink, accent, 2)
            elif ident == 'pintura':
                box(106, 113, 147, 152, ink)
                line([(110, 118), (109, 104), (144, 104), (145, 118)], ink, 2)
                line([(110, 132), (145, 132)], accent, 3)
            elif ident == 'papel':
                box(106, 110, 150, 158, ink)
                box(111, 114, 146, 154, bg)
                for yy in (124, 133, 142):
                    line([(118, yy), (138, yy)], ink, 2)
            else:
                poly([(128 + 28 * math.cos(j * math.pi / 5), 135 + 28 * math.sin(j * math.pi / 5))
                      if j % 2 == 0 else (128 + 12 * math.cos(j * math.pi / 5), 135 + 12 * math.sin(j * math.pi / 5))
                      for j in range(10)], ink)
            words(product, 185, 18)
            line([(27, 215), (229, 215)], accent, 2)
            words('SELECCIÓN DEL CERRO', 225, 9)
        im.paste(tile, ((index % 4) * TILE_SIZE * SCALE, (index // 4) * TILE_SIZE * SCALE))
    im = im.resize((ATLAS_SIZE, ATLAS_SIZE), Image.Resampling.LANCZOS)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out, optimize=True)
    print(f'{args.out}: {len(LABELS)} fictional labels, {ATLAS_SIZE} x {ATLAS_SIZE}, {args.out.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()

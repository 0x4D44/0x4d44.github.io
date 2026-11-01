"""Original teen fabric swatches, packed in an external deterministic atlas.

No photographs, logos or third-party pattern artwork are used.  The tiny weave,
rib, knit and denim marks describe fabric at the intended asset-review distance.
The sun is a single original geometric print rather than a repeated logo.
This module deliberately needs only Python's standard library, including when
called by Blender.  Run it directly to rebuild just the texture set.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import zlib

SIZE = 256
TILE = 64

# Position is stable: catalogue variant IDs refer to these tiles.
SWATCHES = (
    ('jersey_cream', 'Jersey crudo', '#e3ddcd', 'jersey', .95),
    ('jersey_teal', 'Jersey verde azulado', '#43817c', 'jersey', .95),
    ('sun_print', 'Jersey con sol geométrico', '#e5dfcf', 'sun', .95),
    ('rib_coral', 'Canalé coral', '#bd737b', 'rib', .96),
    ('stretch_charcoal', 'Punto elástico carbón', '#3e444f', 'stretch', .84),
    ('denim_indigo', 'Mezclilla índigo lavado', '#566a87', 'denim', .96),
    ('fleece_navy', 'Felpa azul marino', '#3c4b65', 'fleece', .98),
    ('pique_white', 'Piqué blanco', '#ebe8dd', 'pique', .96),
    ('knit_grey', 'Tejido gris escolar', '#82878b', 'knit', .98),
    ('twill_navy', 'Sarga azul marino', '#39465e', 'twill', .95),
    ('cotton_lavender', 'Algodón lavanda', '#aa98b5', 'weave', .96),
    ('cotton_olive', 'Algodón verde oliva', '#78816a', 'weave', .96),
    ('cotton_rust', 'Algodón terracota', '#b47765', 'weave', .96),
    ('shoe_black', 'Zapato negro mate', '#393c43', 'matte', .82),
    ('canvas_sand', 'Lona arena', '#b8a58a', 'canvas', .97),
    ('swim_blue', 'Tejido de baño azul', '#4a839b', 'stretch', .78),
)


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def grain(x, y, fabric):
    """Small periodic yarn shading; no high-entropy photographic noise."""
    if fabric in ('jersey', 'sun'):
        return (1 if (x + y // 2) % 4 < 2 else -1) + (1 if y % 3 == 0 else 0)
    if fabric == 'rib':
        return (2, 3, 1, -3, -2, 0)[x % 6] + (1 if y % 4 == 0 else 0)
    if fabric == 'denim':
        return (3, 2, -3, -1)[(x + y) % 4] + (1 if (x - y) % 8 == 0 else 0)
    if fabric == 'twill':
        return (2, 1, -2, -1)[(x + y) % 4]
    if fabric == 'pique':
        return 2 if (x % 4 in (1, 2) and y % 4 in (1, 2)) else -1
    if fabric == 'knit':
        return 3 if (x - (y if y % 8 < 4 else -y)) % 8 in (0, 1) else -1
    if fabric == 'fleece':
        return (1, -1, 0, 1)[(x // 2 + y // 2 * 3) % 4]
    if fabric == 'stretch':
        return 1 if (x + y) % 3 == 0 else 0
    if fabric in ('weave', 'canvas'):
        strength = 2 if fabric == 'canvas' else 1
        return strength if ((x // 2) % 2) == ((y // 2) % 2) else -strength
    return 0


def pixel(x, y, color, fabric):
    # Every tile has two pixels of edge bleed; atlas sampling is inset as in
    # the adult library.  Printing lives on the front panel's chest UV region.
    x = max(2, min(TILE - 3, x))
    y = max(2, min(TILE - 3, y))
    shade = grain(x, y, fabric)
    base = tuple(max(0, min(255, value + shade)) for value in color)
    if fabric == 'sun':
        dx, dy = x - 32, y - 26
        radius = math.hypot(dx, dy)
        angle = math.atan2(dy, dx)
        ray = abs(math.sin(angle * 8)) < .19 and 10 <= radius <= 14
        if radius <= 7.5 or ray:
            return (193, 128, 66)
        if 9 <= radius <= 9.5:
            return (205, 152, 87)
    return base


def _png(path, pixels):
    # RGB avoids needless alpha bytes.  PNG Sub filters improve compression of
    # these quiet fabrics without introducing a build-time image dependency.
    rows = []
    stride = SIZE * 3
    for y in range(SIZE):
        row = pixels[y * stride:(y + 1) * stride]
        filtered = bytearray(stride)
        for i, value in enumerate(row):
            filtered[i] = (value - (row[i - 3] if i >= 3 else 0)) & 255
        rows.append(b'\x01' + filtered)
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    header = struct.pack('>IIBBBBB', SIZE, SIZE, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
                     + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))


def build_textures(out_dir):
    """Write palette.json + fabrics.png to out_dir and return palette metadata."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    variants = {}
    pixels = bytearray(SIZE * SIZE * 3)
    for index, (ident, label, color, fabric, roughness) in enumerate(SWATCHES):
        tx, ty = index % 4, index // 4
        variants[ident] = {'label': label, 'color': color, 'pattern': fabric,
                           'tile': [tx, ty], 'roughness': roughness}
        if fabric == 'sun':
            variants[ident]['accent'] = '#c18042'
        base = rgb(color)
        for y in range(TILE):
            for x in range(TILE):
                offset = ((ty * TILE + y) * SIZE + tx * TILE + x) * 3
                pixels[offset:offset + 3] = bytes(pixel(x, y, base, fabric))
    palette = {
        'schemaVersion': 1, 'set': 'garments_teen', 'ageGroup': 'teen',
        'material': 'laundry', 'colourSpace': 'srgb',
        'atlas': {'file': 'fabrics.png', 'size': [SIZE, SIZE], 'grid': [4, 4],
                  'tileOrder': 'column,row from the image top-left', 'insetPixels': 2,
                  'embeddedInGlb': False,
                  'binding': 'External colour atlas. Use a white material multiplier and preserve vertex colours. Remap unit UVs to the selected tile, inset by two pixels; flipY=false. Without the atlas, use the variant color.'},
        'variants': variants,
        'provenance': 'Original procedural fabric textures and original geometric sun motif. No product photos, brand marks, logos, badges or copied print designs. Colours are art choices, not a regional uniform specification.',
    }
    _png(out_dir / 'fabrics.png', pixels)
    (out_dir / 'palette.json').write_text(json.dumps(palette, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    return palette


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[2] / 'assets/models/garments-teen/teen')
    args = parser.parse_args()
    build_textures(args.out)
    print('Teen fabric textures:', ', '.join(f'{p.name}={p.stat().st_size} bytes' for p in sorted(args.out.iterdir()) if p.is_file()))

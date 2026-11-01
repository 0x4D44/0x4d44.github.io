"""Deterministic, original weathered vehicle paint atlas; no external images.

The 4 x 4 tiles use bottom-to-top GAME texture UVs. Blender's exporter flips V,
so geometry authored through furn_lib preflips V as clutter_build.py does.
Run with Python 3, or import write_atlas from the Blender generator. Stdlib only.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import zlib

WIDTH = HEIGHT = 1024
CELL = 256
GUTTER = 8
TILE_NAMES = [
    'faded_red', 'faded_blue', 'ochre', 'dusty_cream',
    'green', 'turquoise', 'white_grey', 'burgundy',
    'rust', 'mud', 'chiva_pattern', 'route_plate',
    'blue_rust', 'red_mud', 'cream_aged', 'green_worn',
]
PALETTE = [(157, 58, 43), (54, 91, 126), (206, 159, 48), (192, 180, 145),
           (53, 104, 77), (60, 137, 137), (194, 194, 181), (108, 47, 53),
           (122, 72, 38), (100, 83, 57), (211, 167, 54), (221, 195, 108),
           (51, 89, 118), (147, 58, 43), (186, 173, 136), (58, 102, 74)]


def atlas_tiles():
    return {name: [((i % 4) * CELL + GUTTER) / WIDTH,
                   ((i // 4) * CELL + GUTTER) / HEIGHT,
                   ((i % 4 + 1) * CELL - GUTTER) / WIDTH,
                   ((i // 4 + 1) * CELL - GUTTER) / HEIGHT]
            for i, name in enumerate(TILE_NAMES)}


def _chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def _mix(a, b, t):
    return tuple(int(x * (1 - t) + y * t) for x, y in zip(a, b))


def _tile(index):
    rng = random.Random(31012026 + index * 917)
    base = PALETTE[index]
    spots = [(rng.randrange(16, 240), rng.randrange(145, 245), rng.uniform(3, 17), rng.uniform(1, 6))
             for _ in range(25 if index >= 12 else 10)]
    scratches = [(rng.randrange(18, 237), rng.randrange(24, 230), rng.randrange(6, 40)) for _ in range(18)]
    pix = []
    for y in range(CELL):
        row = []
        for x in range(CELL):
            xx = max(GUTTER, min(CELL - GUTTER - 1, x))
            yy = max(GUTTER, min(CELL - GUTTER - 1, y))
            # Faded paint with broad unevenness, tiny pores and road dirt at its lower edge.
            wave = 3 * math.sin(xx * .037 + index) + 2 * math.sin(yy * .019 + xx * .007)
            grain = ((xx * 17 + yy * 37 + (xx * yy) % 41 + index * 13) % 9) - 4
            fade = 0.04 + 0.07 * (1 - yy / CELL)
            col = _mix(base, (207, 202, 180), fade)
            col = tuple(max(0, min(255, int(v + wave + grain * .5))) for v in col)
            dirt = max(0, (yy - 180) / 76) * (.22 if index < 12 else .42)
            col = _mix(col, (98, 81, 56), dirt)
            if index in (8, 9):
                coarse = (math.sin(xx * .081 + math.sin(yy * .041) * 2) + math.sin(yy * .057)) * .5
                col = _mix(base, (66, 47, 31) if index == 8 else (146, 129, 95), (coarse + 1) * .22)
            elif index == 10:
                # Invented chiva coachwork decoration: lozenges and bands, no badge or logo.
                band = yy % 80
                if band < 8 or band > 71:
                    col = (32, 72, 92)
                elif band < 15 or band > 64:
                    col = (180, 58, 41)
                elif abs((xx % 64) - 32) + abs(band - 40) < 23:
                    col = (39, 117, 105) if (xx // 64) % 2 else (184, 64, 43)
                else:
                    col = (219, 181, 81)
            elif index == 11:
                # Abstract faded route/plate strip. Lettering is model-independent and unbranded.
                col = (220, 193, 103) if yy > 120 else (209, 212, 192)
                if 50 < yy < 78 and 25 < xx < 230:
                    col = (45, 61, 56) if (xx // 16) % 3 else col
                if 158 < yy < 191 and 34 < xx < 222 and (xx // 13) % 3:
                    col = (53, 53, 45)
            if index != 10 and index != 11:
                for sx, sy, rx, ry in spots:
                    d = ((xx - sx) / rx) ** 2 + ((yy - sy) / ry) ** 2
                    edge = .82 + .2 * math.sin(xx * .8 + yy * .43)
                    if d < edge:
                        col = (111 + grain * 2, 63 + grain, 32)
                        break
                    if d < edge + .35:
                        col = _mix(col, (159, 151, 122), .6)
                for sx, sy, length in scratches:
                    if sx <= xx < sx + length and abs(yy - (sy + (xx - sx) * .08)) < .7:
                        col = _mix(col, (174, 162, 130), .65)
                        break
            row.append(bytes(max(0, min(255, int(v))) for v in col))
        pix.append(row)
    # Extrude the gutter pixels, so mipmaps cannot sample an adjacent paint colour.
    for y in range(CELL):
        for x in range(CELL):
            if x < GUTTER or x >= CELL - GUTTER or y < GUTTER or y >= CELL - GUTTER:
                pix[y][x] = pix[max(GUTTER, min(CELL - GUTTER - 1, y))][max(GUTTER, min(CELL - GUTTER - 1, x))]
    return pix


def write_atlas(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tiles = [_tile(i) for i in range(16)]
    scanlines = []
    for y in range(HEIGHT):
        row = 3 - y // CELL
        scanlines.append(b'\x00' + b''.join(b''.join(tiles[row * 4 + col][y % CELL]) for col in range(4)))
    data = (b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', WIDTH, HEIGHT, 8, 2, 0, 0, 0))
            + _chunk(b'IDAT', zlib.compress(b''.join(scanlines), 9)) + _chunk(b'IEND', b''))
    path.write_bytes(data)
    return {'path': '../textures/vehicles/paint.png', 'width': WIDTH, 'height': HEIGHT,
            'material': 'vehicle_paint', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'gutter': GUTTER, 'tiles': atlas_tiles()}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[2] / 'assets/textures/vehicles/paint.png')
    print(json.dumps(write_atlas(p.parse_args().out), indent=2))

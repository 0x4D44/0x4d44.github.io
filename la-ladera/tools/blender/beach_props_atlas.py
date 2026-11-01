"""Original, deterministic beach-prop PBR atlas. Python standard library only.

One 2048-square layout is shared by albedo, tangent-space normal and ORM maps.
Cells count left-to-right, then bottom-to-top in game UV coordinates. Each cell
has an eight-pixel extruded gutter. The source contains the sign letterforms;
there is no downloaded image, system font, font licence or network dependency.

    python tools/blender/beach_props_atlas.py --out assets/textures/beach_props

All artwork, patterns and letterforms are original procedural CC0-1.0 designs.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

WIDTH = HEIGHT = 2048
GRID = 8
CELL = 256
GUTTER = 8
INNER = CELL - GUTTER * 2

CELL_NAMES = (
    [f'towel_{i:02d}' for i in range(1, 13)]
    + [f'parasol_{i:02d}' for i in range(1, 7)]
    + [f'bag_{i:02d}' for i in range(1, 5)]
    + ['wood_teak', 'wood_weathered', 'thatch', 'paint_white', 'paint_red',
       'steel', 'rubber', 'rock_salt', 'sand', 'seawall', 'palm_frond',
       'seaweed', 'net', 'rope', 'canvas_cream', 'plastic_blue',
       'plastic_coral', 'plastic_yellow', 'conch', 'scallop', 'coconut',
       'water', 'sign_zona_bano', 'sign_bandera_roja', 'sign_prohibido_paso',
       'sign_cocadas', 'sign_ceviche', 'sign_jugos', 'sign_helados',
       'sign_alquiler_tablas', 'sign_cooperativa', 'sign_salvavidas',
       'first_aid', 'fruit', 'wicker', 'volleyball', 'ball', 'flag_red',
       'driftwood', 'plank_blue', 'black', 'menu'])
CELL_MAP = {name: i for i, name in enumerate(CELL_NAMES)}
SIGN_TEXTS = {
    'sign_zona_bano': 'Zona de baño',
    'sign_bandera_roja': 'Bandera roja',
    'sign_prohibido_paso': 'Prohibido el paso',
    'sign_cocadas': 'Cocadas',
    'sign_ceviche': 'Ceviche',
    'sign_jugos': 'Jugos naturales',
    'sign_helados': 'Helados',
    'sign_alquiler_tablas': 'Alquiler de tablas',
    'sign_cooperativa': 'Cooperativa de pescadores',
    'sign_salvavidas': 'Salvavidas',
}

PALETTE = [(37, 130, 153), (207, 80, 64), (220, 158, 49), (50, 119, 102),
           (102, 91, 150), (49, 103, 161), (222, 124, 79), (99, 143, 139),
           (173, 73, 105), (116, 132, 65), (62, 151, 166), (195, 140, 61)]
CREAM = (232, 224, 201)


def atlas_tiles():
    """Inner rectangles in bottom-origin game UV space; all maps use these."""
    return {name: [(i % GRID * CELL + GUTTER) / WIDTH,
                   (i // GRID * CELL + GUTTER) / HEIGHT,
                   ((i % GRID + 1) * CELL - GUTTER) / WIDTH,
                   ((i // GRID + 1) * CELL - GUTTER) / HEIGHT]
            for name, i in CELL_MAP.items()}


def _clamp(v):
    return max(0, min(255, int(v)))


def _mix(a, b, t):
    return tuple(_clamp(x + (y - x) * t) for x, y in zip(a, b))


def _noise(x, y, seed):
    # Coordinate hashing, no random-number state or platform-dependent floats.
    n = (x * 374761393 + y * 668265263 + seed * 1442695041) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 255) / 255


def _smooth_noise(x, y, seed):
    """Continuous mineral/salt mottling, without grid-shaped colour blocks."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = _noise(ix, iy, seed) * (1 - fx) + _noise(ix + 1, iy, seed) * fx
    b = _noise(ix, iy + 1, seed) * (1 - fx) + _noise(ix + 1, iy + 1, seed) * fx
    return a * (1 - fy) + b * fy


class Tile:
    def __init__(self):
        self.color = bytearray(INNER * INNER * 4)
        self.bump = bytearray(INNER * INNER)
        self.rough = bytearray(INNER * INNER)
        self.metal = bytearray(INNER * INNER)

    def set(self, x, y, col, bump=128, rough=205, metal=0, alpha=255):
        i = y * INNER + x
        self.color[i * 4:i * 4 + 4] = bytes((*map(_clamp, col), _clamp(alpha)))
        self.bump[i], self.rough[i], self.metal[i] = _clamp(bump), _clamp(rough), _clamp(metal)

    def paint(self, x, y, col, opacity=1, alpha=None):
        if not 0 <= x < INNER or not 0 <= y < INNER:
            return
        i = (y * INNER + x) * 4
        self.color[i:i + 3] = bytes(_mix(self.color[i:i + 3], col, opacity))
        if alpha is not None:
            self.color[i + 3] = max(self.color[i + 3], _clamp(alpha))

    def line(self, start, end, col, width=2, alpha=None):
        """Round-capped analytic stroke with a one-pixel antialias fringe."""
        x0, y0 = start
        x1, y1 = end
        dx, dy = x1 - x0, y1 - y0
        length = dx * dx + dy * dy
        radius = width / 2
        for y in range(max(0, int(min(y0, y1) - radius - 1)), min(INNER, int(max(y0, y1) + radius + 2))):
            for x in range(max(0, int(min(x0, x1) - radius - 1)), min(INNER, int(max(x0, x1) + radius + 2))):
                t = max(0, min(1, ((x - x0) * dx + (y - y0) * dy) / length)) if length else 0
                distance = math.hypot(x - x0 - t * dx, y - y0 - t * dy)
                coverage = max(0, min(1, radius + .6 - distance))
                if coverage:
                    self.paint(x, y, col, coverage, None if alpha is None else coverage * alpha)

    def path(self, points, col, width=2, alpha=None):
        for a, b in zip(points, points[1:]):
            self.line(a, b, col, width, alpha)

    def circle(self, cx, cy, radius, col, width=2, alpha=None):
        points = [(cx + radius * math.cos(i * math.tau / 48), cy + radius * math.sin(i * math.tau / 48)) for i in range(49)]
        self.path(points, col, width, alpha)


# A small original monoline sign alphabet, in a 6 x 10 unit em. It deliberately
# retains slight asymmetry like brushed lettering; there is no font dependency.
GLYPHS = {
    'A': [[(0, 10), (2.7, 0), (3.3, 0), (6, 10)], [(1.2, 6.5), (4.9, 6.5)]],
    'B': [[(0, 10), (0, 0), (3.8, 0), (5.7, 1.3), (5.7, 3.3), (4, 4.6), (0, 4.6)], [(4, 4.6), (6, 6.2), (5.9, 8.5), (4, 10), (0, 10)]],
    'C': [[(6, 1), (4.6, .1), (1.6, .1), (.1, 1.8), (0, 8.1), (1.6, 9.8), (4.6, 9.8), (6, 8.8)]],
    'D': [[(0, 10), (0, 0), (3.3, 0), (5.7, 2), (6, 5), (5.6, 8.1), (3.2, 10), (0, 10)]],
    'E': [[(6, 0), (0, 0), (0, 10), (6, 10)], [(0, 4.8), (5, 4.8)]],
    'F': [[(6, 0), (0, 0), (0, 10)], [(0, 4.8), (4.8, 4.8)]],
    'G': [[(6, 1.1), (4.5, 0), (1.6, 0), (.1, 2), (.1, 8), (1.7, 10), (4.6, 10), (6, 8.5), (6, 5.2), (3.5, 5.2)]],
    'H': [[(0, 0), (0, 10)], [(6, 0), (6, 10)], [(0, 5), (6, 5)]],
    'I': [[(0, 0), (6, 0)], [(3, 0), (3, 10)], [(0, 10), (6, 10)]],
    'J': [[(0, 0), (6, 0), (6, 8.2), (4.6, 10), (1.6, 10), (0, 8)]],
    'K': [[(0, 0), (0, 10)], [(6, 0), (0, 5.3), (6, 10)]],
    'L': [[(0, 0), (0, 10), (6, 10)]],
    'M': [[(0, 10), (0, 0), (3, 5.5), (6, 0), (6, 10)]],
    'N': [[(0, 10), (0, 0), (6, 10), (6, 0)]],
    'Ñ': [[(0, 10), (0, 0), (6, 10), (6, 0)], [(.7, -2), (2, -2.6), (4, -1.7), (5.3, -2.3)]],
    'O': [[(1.5, 0), (4.5, 0), (6, 1.9), (6, 8.1), (4.5, 10), (1.5, 10), (0, 8.1), (0, 1.9), (1.5, 0)]],
    'P': [[(0, 10), (0, 0), (4.4, 0), (6, 1.5), (6, 3.9), (4.4, 5.4), (0, 5.4)]],
    'Q': [[(1.5, 0), (4.5, 0), (6, 1.9), (6, 8.1), (4.5, 10), (1.5, 10), (0, 8.1), (0, 1.9), (1.5, 0)], [(3.3, 7), (6.5, 10.8)]],
    'R': [[(0, 10), (0, 0), (4.4, 0), (6, 1.5), (6, 3.9), (4.4, 5.4), (0, 5.4)], [(3.1, 5.4), (6.1, 10)]],
    'S': [[(5.8, 1), (4.5, 0), (1.5, 0), (.1, 1.5), (.2, 3.5), (1.5, 4.5), (4.7, 5.6), (6, 6.8), (5.8, 8.5), (4.5, 10), (1.3, 10), (0, 8.7)]],
    'T': [[(0, 0), (6, 0)], [(3, 0), (3, 10)]],
    'U': [[(0, 0), (0, 8.2), (1.5, 10), (4.5, 10), (6, 8.2), (6, 0)]],
    'Ú': [[(0, 0), (0, 8.2), (1.5, 10), (4.5, 10), (6, 8.2), (6, 0)], [(2.3, -1.5), (4.1, -3)]],
    'V': [[(0, 0), (2.8, 10), (3.2, 10), (6, 0)]],
    'W': [[(0, 0), (1.1, 10), (3, 4.8), (4.9, 10), (6, 0)]],
    'X': [[(0, 0), (6, 10)], [(6, 0), (0, 10)]],
    'Y': [[(0, 0), (3, 5), (6, 0)], [(3, 5), (3, 10)]],
    'Z': [[(0, 0), (6, 0), (0, 10), (6, 10)]],
}


def _lettering(tile, text, y, height, color):
    scale = height / 10
    advance = 8 * scale
    total = sum(4 * scale if c == ' ' else advance for c in text) - 2 * scale
    x = (INNER - total) / 2
    for c in text:
        if c == ' ':
            x += 4 * scale
            continue
        for path in GLYPHS[c]:
            tile.path([(x + a * scale + .1 * math.sin(b), y + b * scale) for a, b in path], color, max(1.4, scale * 1.05))
        x += advance


def _sign(tile, index):
    text_lines = [
        ['ZONA DE', 'BAÑO'], ['BANDERA', 'ROJA'], ['PROHIBIDO', 'EL PASO'],
        ['COCADAS'], ['CEVICHE'], ['JUGOS', 'NATURALES'], ['HELADOS'],
        ['ALQUILER', 'DE TABLAS'], ['COOPERATIVA', 'DE PESCADORES'], ['SALVAVIDAS'],
    ][index - 44]
    color = (35, 89, 105) if index not in (45, 46, 53) else (166, 48, 41)
    tile.path([(11, 16), (227, 16), (228, 223), (12, 223), (11, 16)], color, 3)
    tile.path([(17, 22), (221, 22), (222, 217), (18, 217), (17, 22)], color, 1)
    heights = [min(34, 185 / (len(line.replace(' ', '')) * .8 + line.count(' ') * .4 - .2)) for line in text_lines]
    step = 51
    start = 101 - (len(text_lines) - 1) * step / 2
    for n, (line, height) in enumerate(zip(text_lines, heights)):
        _lettering(tile, line, start + n * step - height / 2, height, color)
    # Two understated brush waves make each board feel intentionally painted.
    for y in (176, 184):
        tile.path([(x, y + 2.4 * math.sin(x / 9)) for x in range(53, 188, 3)], color, 2)
    # Weathered nail heads, held clear of text.
    for x in (23, 216):
        for y in (28, 211):
            tile.circle(x, y, 2.1, (100, 91, 71), 2)


def _tile(index):
    t = Tile()
    name = CELL_NAMES[index]
    for y in range(INNER):
        for x in range(INNER):
            grain = int(_noise(x // 2, y // 2, index) * 5) - 2
            fine = ((x & 1) - (y & 1)) * .7
            bump, rough, metal, alpha = 128, 205, 0, 255
            if index < 12:
                base = PALETTE[index]
                dark = _mix(base, (25, 38, 47), .3)
                if index == 0: motif = y % 43 < 16
                elif index == 1: motif = (x // 25 + y // 25) % 2 == 0
                elif index == 2: motif = (x + y) % 45 < 11
                elif index == 3: motif = abs(y % 44 - 21 + 9 * math.sin(x / 17)) < 6
                elif index == 4: motif = math.hypot(x % 46 - 23, y % 46 - 23) < 9
                elif index == 5: motif = x % 38 < 14
                elif index == 6: motif = abs(x % 50 - 25) + abs(y % 50 - 25) < 16
                elif index == 7: motif = ((x + y // 30 * 15) % 54 < 10) and y % 30 < 19
                elif index == 8: motif = abs(y % 48 - 24) < 3 or abs(x % 48 - 24) < 3
                elif index == 9: motif = (x // 30 + y // 15) % 3 == 0
                elif index == 10: motif = abs(x % 56 - 28) < 3 or abs(y % 56 - 28) < 3 or math.hypot(x % 56 - 28, y % 56 - 28) < 11
                else: motif = (x // 21) % 3 == (y // 21) % 3
                col = CREAM if motif else base
                if 12 < y < 19 or INNER - 20 < y < INNER - 13: col = dark
                if y < 7 or y > INNER - 8: col = _mix(base, CREAM, .5)
                bump = 128 + (3 if (x + y) % 4 < 2 else -3)
                rough = 230
                col = tuple(v + grain + fine for v in col)
            elif index < 18:
                col = PALETTE[(index - 12) % 6] if x % 72 < 36 else CREAM
                # Fine canvas weave plus a stitched stripe edge.
                if x % 72 in (0, 35, 36, 71): col = _mix(col, (119, 112, 93), .3)
                col = tuple(v + grain + fine for v in col)
                bump = 128 + (2 if (x + y) % 4 < 2 else -2)
                rough = 224
            elif index < 22:
                col = _mix(CREAM, PALETTE[index - 18], .12)
                if (index == 18 and x % 55 < 15 or index == 19 and y % 55 < 15
                        or index == 20 and abs(x % 50 - 25) + abs(y % 50 - 25) < 12
                        or index == 21 and (x + y) % 70 < 14):
                    col = PALETTE[index - 18]
                if y < 11 or y > INNER - 12: col = _mix(col, (95, 80, 55), .25)
                col = tuple(v + grain + fine for v in col)
                bump, rough = 126 + (x + y) % 5, 227
            elif name in ('wood_teak', 'wood_weathered', 'driftwood', 'plank_blue'):
                woodgrain = math.sin(x * .18 + 1.6 * math.sin(y * .014)) + .55 * math.sin(x * .65 + y * .023)
                col = {'wood_teak': (138, 100, 62), 'wood_weathered': (158, 149, 128),
                       'driftwood': (170, 159, 133), 'plank_blue': (73, 122, 131)}[name]
                col = tuple(v + woodgrain * 7 + grain for v in col)
                if x % 62 < 2:
                    col = _mix(col, (56, 46, 35), .55)
                bump, rough = 128 + woodgrain * 5, 213 if name != 'plank_blue' else 187
            elif name == 'thatch':
                layer = (y + (x // 19 % 2) * 18) % 57
                strand = (x + int(4 * math.sin(y * .03))) % 11
                col = (166 + layer * .35 + grain * 3, 132 + layer * .30 + grain * 2, 76 + layer * .27 + grain)
                if strand < 2: col = _mix(col, (87, 76, 42), .35)
                if layer < 5: col = _mix(col, (62, 58, 37), .42)
                bump, rough = 104 + layer * .6 + strand * 2, 239
            elif name in ('paint_white', 'paint_red', 'plastic_blue', 'plastic_coral', 'plastic_yellow', 'flag_red', 'black'):
                col = {'paint_white': (227, 225, 211), 'paint_red': (188, 46, 43), 'plastic_blue': (46, 119, 161),
                       'plastic_coral': (216, 94, 70), 'plastic_yellow': (229, 174, 54), 'flag_red': (203, 43, 42), 'black': (32, 35, 36)}[name]
                col = tuple(v + grain for v in col)
                rough = 125 if name.startswith('plastic') else 180
                bump = 128 + (grain if name == 'flag_red' else 0)
            elif name == 'steel':
                line = (x * 17 % 13) - 6
                col = (166 + line, 170 + line, 164 + line)
                bump, rough, metal = 128, 145 + grain * 2, 245
            elif name == 'rubber':
                pattern = (x + (y // 24 % 2) * 15) % 32 < 7
                col = (34, 38, 36) if pattern else (49, 52, 48)
                bump, rough = (117 if pattern else 134), 226
            elif name in ('rock_salt', 'seawall'):
                broad = math.sin(x * .073 + math.sin(y * .043)) + .7 * math.sin(y * .1 - x * .015)
                col = (119, 119, 105) if name == 'rock_salt' else (177, 175, 153)
                cloud = .7 * _smooth_noise(x / 23, y / 19, index) + .3 * _smooth_noise(x / 9, y / 11, index + 41)
                salt = max(0, min(1, (cloud - .52) * 3))
                col = tuple(v + broad * 7 + grain * 2 for v in col)
                col = _mix(col, (203, 201, 181), salt * .65)
                bump, rough = 128 + broad * 8 + grain, 237
                if name == 'seawall' and y % 61 < 3:
                    col = _mix(col, (110, 106, 88), .35)
            elif name == 'sand':
                ripple = math.sin(y * .08 + math.sin(x * .02))
                col = (208 + ripple * 4 + grain * 3, 185 + ripple * 4 + grain * 3, 138 + ripple * 4 + grain * 2)
                bump, rough = 128 + ripple * 9 + grain, 245
            elif name in ('palm_frond', 'seaweed', 'net'):
                col = {'palm_frond': (54, 105, 52), 'seaweed': (67, 97, 54), 'net': (192, 176, 132)}[name]
                alpha, rough = 0, 222
            elif name == 'rope':
                twist = math.sin((x + y * .65) * .25)
                col = (168 + twist * 18 + grain, 140 + twist * 16 + grain, 91 + twist * 12 + grain)
                bump, rough = 127 + twist * 17, 232
            elif name == 'canvas_cream':
                col = tuple(v + grain + fine for v in CREAM)
                bump, rough = 128 + (2 if (x + y) % 4 < 2 else -2), 225
            elif name in ('conch', 'scallop'):
                band = math.sin((y + 8 * math.sin(x * .04)) * .12)
                col = (224 + band * 7, 185 + band * 13, 159 + band * 17)
                if name == 'scallop':
                    band = math.cos(math.atan2(x - 120, 240 - y) * 34)
                    col = (221 + band * 8, 185 + band * 10, 147 + band * 9)
                bump, rough = 128 + band * 12, 168
            elif name == 'coconut':
                stripe = math.sin(x * .32 + math.sin(y * .028))
                col = (112 + stripe * 9 + grain * 2, 82 + stripe * 8 + grain * 2, 42 + stripe * 5 + grain)
                bump, rough = 128 + stripe * 10, 235
            elif name == 'water':
                ripple = math.sin(x * .05 + math.sin(y * .07))
                col = (53 + ripple * 2, 146 + ripple * 2, 153 + ripple * 2)
                bump, rough = 128 + ripple * 4, 54
            elif 44 <= index <= 53 or name in ('first_aid', 'menu'):
                grainwood = math.sin(x * .4 + math.sin(y * .017))
                col = (224 + grain + grainwood * 2, 217 + grain + grainwood * 2, 190 + grain + grainwood * 2)
                bump, rough = 128 + grainwood * 2, 210
                if y % 77 < 2: col = _mix(col, (115, 99, 73), .22)
                if name == 'menu': col, rough = (43 + grain, 69 + grain, 66 + grain), 235
            elif name == 'fruit':
                col = (220, 150, 46) if (x // 40 + y // 40) % 2 else (106, 143, 61)
                col = tuple(v + grain * 2 for v in col)
                bump, rough = 128 + grain, 173
            elif name == 'wicker':
                weave = (x // 7 + y // 7) % 2
                col = (170 + weave * 20 + grain, 136 + weave * 17 + grain, 85 + weave * 12 + grain)
                bump, rough = 116 + weave * 24, 228
            elif name in ('volleyball', 'ball'):
                col = CREAM
                panel = (x // 80 + y // 120) % 3
                if panel == 1: col = (56, 123, 163)
                elif panel == 2: col = (226, 176, 57) if name == 'volleyball' else (213, 83, 59)
                if x % 80 < 2 or y % 120 < 2: col = _mix(col, (70, 77, 73), .35)
                col = tuple(v + grain for v in col)
                bump, rough = 128 + grain, 180
            else:
                raise ValueError(name)
            t.set(x, y, col, bump, rough, metal, alpha)
    if name == 'palm_frond':
        # One long pinnate frond. Green RGB is retained in transparent pixels.
        spine = [(x, 119 + 12 * math.sin(x / 91)) for x in range(8, 233, 4)]
        for n, x in enumerate(range(17, 223, 7)):
            y = 119 + 12 * math.sin(x / 91)
            span = 82 * math.sin((x - 7) / 228 * math.pi) ** .7
            for sign in (-1, 1):
                col = (57 + n % 4 * 4, 108 + n % 3 * 7, 49 + n % 5 * 2)
                t.path([(x - 10, y), (x + 8, y + sign * span * .48), (x + 27, y + sign * span)], col, 4.6, 255)
                t.path([(x - 9, y), (x + 8, y + sign * span * .48), (x + 27, y + sign * span)], (116, 142, 66), .7, 255)
        t.path(spine, (142, 151, 76), 3.4, 255)
    elif name == 'seaweed':
        for stem in range(13):
            bottom = 57 + stem * 10
            end_y = 22 + (stem * 37) % 69
            path = [(bottom + math.sin(y * .037 + stem) * (234 - y) * .1, y)
                    for y in range(233, end_y, -4)]
            t.path(path, (65 + stem % 3 * 14, 102 + stem % 4 * 9, 50 + stem % 3 * 9), 4 + stem % 3, 255)
            for x, y in path[::6]:
                t.line((x, y), (x + (-1 if stem % 2 else 1) * 12, y - 13), (99, 133, 67), 3, 255)
    elif name == 'net':
        for x in range(1, INNER, 24):
            t.line((x, 0), (x, INNER - 1), (177, 160, 121), 2.3, 255)
        for y in range(1, INNER, 24):
            t.line((0, y), (INNER - 1, y), (206, 191, 151), 2.3, 255)
        for x in range(1, INNER, 24):
            for y in range(1, INNER, 24):
                t.line((x - 1.6, y - 1.6), (x + 1.6, y + 1.6), (163, 146, 107), 2.8, 255)
    elif 44 <= index <= 53:
        _sign(t, index)
    elif name == 'first_aid':
        # Generic white first-aid pictogram on green, not a Red Cross emblem.
        for y in range(26, 214):
            for x in range(26, 214):
                t.paint(x, y, (44, 119, 88))
        for y in range(50, 190):
            for x in range(50, 190):
                if 98 <= x <= 142 or 98 <= y <= 142:
                    t.paint(x, y, (236, 231, 211))
        t.path([(18, 18), (221, 18), (221, 221), (18, 221), (18, 18)], (44, 119, 88), 3)
    elif name == 'menu':
        _lettering(t, 'MENÚ', 28, 28, (226, 222, 201))
        for row in range(5):
            y = 88 + row * 23
            t.path([(35, y), (145 - row % 2 * 18, y)], (209, 210, 187), 2)
            t.path([(175, y), (204, y)], (209, 210, 187), 2)
    return t


def _chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def _png(width, height, channels, rows):
    # Sub filter improves compression while retaining a trivial standard decoder.
    raw = bytearray()
    for row in rows:
        raw.append(1)
        raw.extend(row[:channels])
        raw.extend((row[i] - row[i - channels]) & 255 for i in range(channels, len(row)))
    return (b'\x89PNG\r\n\x1a\n'
            + _chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6 if channels == 4 else 2, 0, 0, 0))
            + _chunk(b'IDAT', zlib.compress(raw, 9)) + _chunk(b'IEND', b''))


def _raster_maps(tile):
    maps = {'albedo': bytearray(CELL * CELL * 4),
            'normal': bytearray(CELL * CELL * 3), 'orm': bytearray(CELL * CELL * 3)}
    # Compute normal from the authored height field. OpenGL +Y normal convention;
    # image rows grow down, so the image-y derivative has the opposite UV sign.
    normals = bytearray(INNER * INNER * 3)
    for y in range(INNER):
        for x in range(INNER):
            dx = (tile.bump[y * INNER + min(INNER - 1, x + 1)] - tile.bump[y * INNER + max(0, x - 1)]) / 140
            dy = (tile.bump[min(INNER - 1, y + 1) * INNER + x] - tile.bump[max(0, y - 1) * INNER + x]) / 140
            length = math.sqrt(dx * dx + dy * dy + 1)
            i = (y * INNER + x) * 3
            normals[i:i + 3] = bytes((_clamp(127.5 - 127.5 * dx / length),
                                    _clamp(127.5 + 127.5 * dy / length), _clamp(127.5 + 127.5 / length)))
    for y in range(CELL):
        sy = max(0, min(INNER - 1, y - GUTTER))
        for x in range(CELL):
            sx = max(0, min(INNER - 1, x - GUTTER))
            src, dst = sy * INNER + sx, y * CELL + x
            maps['albedo'][dst * 4:dst * 4 + 4] = tile.color[src * 4:src * 4 + 4]
            maps['normal'][dst * 3:dst * 3 + 3] = normals[src * 3:src * 3 + 3]
            maps['orm'][dst * 3:dst * 3 + 3] = bytes((255, tile.rough[src], tile.metal[src]))
    return maps


def write_atlas(directory):
    """Generate all maps and return a self-contained manifest textures record."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    assert len(CELL_NAMES) == 64 and len(CELL_MAP) == 64
    tiles = [_raster_maps(_tile(index)) for index in range(64)]
    maps = {}
    for name, channels in [('albedo', 4), ('normal', 3), ('orm', 3)]:
        rows = []
        for y in range(HEIGHT):
            cell_row = GRID - 1 - y // CELL
            local_row = y % CELL
            rows.append(b''.join(tiles[cell_row * GRID + col][name][local_row * CELL * channels:(local_row + 1) * CELL * channels] for col in range(GRID)))
        data = _png(WIDTH, HEIGHT, channels, rows)
        path = directory / (name + '.png')
        path.write_bytes(data)
        maps[name] = {'path': '../textures/beach_props/' + name + '.png',
                      'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    total = sum(v['bytes'] for v in maps.values())
    if total > 6_000_000:
        raise ValueError(f'Beach textures {total:,} bytes exceed 6,000,000')
    return {'width': WIDTH, 'height': HEIGHT, 'grid': GRID, 'cellSize': CELL,
            'gutter': GUTTER, 'maps': maps, 'cells': CELL_MAP, 'tiles': atlas_tiles(),
            'alphaCells': [32, 33, 34], 'signTexts': SIGN_TEXTS,
            'uvConvention': 'bottom-origin; row 0 is the bottom PNG row of cells',
            'channels': {'normal': 'tangent-space +Y/OpenGL',
                         'orm': 'R occlusion, G roughness, B metalness'},
            'totalBytes': total, 'license': 'CC0-1.0'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[2] / 'assets/textures/beach_props')
    print(json.dumps(write_atlas(parser.parse_args().out), indent=2, ensure_ascii=False))

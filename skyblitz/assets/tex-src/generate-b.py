#!/usr/bin/env python3
"""Generate SKYBLITZ city, sky and effect texture set B."""
from __future__ import annotations

import json
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tex"
SRC = ROOT / "tex-src"
OUT.mkdir(parents=True, exist_ok=True)
SRC.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(20261029)


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def save_rgb_webp(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255)), "RGB").save(
        OUT / name, "WEBP", quality=88, method=6
    )


def save_rgba_png(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255)), "RGBA").save(
        OUT / name, "PNG", optimize=True, compress_level=9
    )


def save_seamless_atlas_webp(name, a, cols, rows, cell):
    """Use q88 visual encoding, then preserve matching cell edges losslessly."""
    buf = io.BytesIO()
    Image.fromarray(np.uint8(np.clip(a, 0, 255)), "RGB").save(
        buf, "WEBP", quality=88, method=6
    )
    buf.seek(0)
    decoded = np.asarray(Image.open(buf).convert("RGB")).copy()
    # WebP chroma subsampling can pull colour from an atlas neighbour. Average and
    # match the outermost texel on each side of every repeatable cell before final save.
    for row in range(rows):
        for col in range(cols):
            y0, x0 = row*cell, col*cell
            tile = decoded[y0:y0+cell, x0:x0+cell]
            vertical = ((tile[:, 0].astype(np.uint16) + tile[:, -1].astype(np.uint16)) // 2).astype(np.uint8)
            tile[:, 0] = vertical
            tile[:, -1] = vertical
            horizontal = ((tile[0].astype(np.uint16) + tile[-1].astype(np.uint16)) // 2).astype(np.uint8)
            tile[0] = horizontal
            tile[-1] = horizontal
    Image.fromarray(decoded, "RGB").save(
        OUT / name, "WEBP", quality=88, method=6, lossless=True
    )


def periodic_edge_rgb(a):
    a[:, -1] = a[:, 0]
    a[-1, :] = a[0, :]
    return a


def facade_masks(size=512, style=0):
    yy, xx = np.mgrid[0:size, 0:size]
    u = xx % 64
    v = yy % 64
    # Distinct curtain wall, punched windows, arches, strip windows and fins.
    if style == 0:
        outer = (u >= 5) & (u <= 59) & (v >= 5) & (v <= 59)
        inner = (u >= 9) & (u <= 55) & (v >= 9) & (v <= 55)
    elif style in (5, 11, 13):
        outer = (u >= 18) & (u <= 46) & (v >= 5) & (v <= 59)
        inner = (u >= 21) & (u <= 43) & (v >= 8) & (v <= 56)
    elif style == 3:
        outer = (((u >= 12) & (u <= 52) & (v >= 22) & (v <= 58)) |
                 (((u - 32) / 20) ** 2 + ((v - 23) / 20) ** 2 <= 1.0))
        inner = (((u >= 16) & (u <= 48) & (v >= 25) & (v <= 54)) |
                 (((u - 32) / 16) ** 2 + ((v - 25) / 16) ** 2 <= 1.0))
    elif style == 6:
        outer = (u >= 7) & (u <= 57) & (v >= 17) & (v <= 48)
        inner = (u >= 11) & (u <= 53) & (v >= 20) & (v <= 45)
    elif style == 12:
        outer = (u >= 7) & (u <= 57) & (v >= 20) & (v <= 55)
        inner = (u >= 10) & (u <= 54) & (v >= 23) & (v <= 52)
    elif style == 14:
        outer = ((u - 32) ** 2 + (v - 32) ** 2 <= 27 ** 2)
        inner = ((u - 32) ** 2 + (v - 32) ** 2 <= 22 ** 2)
    else:
        outer = (u >= 13) & (u <= 51) & (v >= 11) & (v <= 55)
        inner = (u >= 17) & (u <= 47) & (v >= 15) & (v <= 51)
    # Every window shape repeats on the 64 px facade module.
    return xx, yy, u, v, outer, inner


FACADE_PALETTES = [
    ((31, 75, 111), (60, 126, 158), (15, 44, 69), (62, 164, 195), (111, 206, 214)),
    ((159, 166, 158), (204, 207, 187), (106, 120, 119), (29, 66, 91), (116, 190, 208)),
    ((142, 57, 43), (187, 83, 57), (84, 42, 39), (38, 71, 91), (242, 172, 92)),
    ((222, 212, 184), (245, 235, 207), (151, 143, 128), (43, 71, 91), (138, 206, 211)),
    ((37, 47, 62), (61, 76, 90), (14, 25, 40), (133, 95, 44), (240, 174, 71)),
    ((54, 50, 69), (212, 160, 69), (26, 31, 47), (53, 90, 112), (237, 185, 92)),
    ((108, 178, 158), (159, 211, 185), (55, 120, 116), (35, 79, 100), (139, 214, 210)),
    ((119, 129, 129), (158, 164, 158), (75, 89, 93), (27, 46, 57), (103, 159, 170)),
    ((236, 188, 128), (250, 218, 163), (178, 119, 83), (41, 77, 98), (124, 209, 219)),
    ((43, 93, 111), (73, 137, 151), (21, 58, 79), (30, 65, 90), (94, 209, 222)),
    ((186, 111, 74), (218, 150, 90), (120, 68, 53), (41, 68, 83), (116, 191, 205)),
    ((74, 112, 105), (121, 158, 133), (39, 73, 75), (24, 56, 71), (111, 205, 200)),
    ((199, 216, 207), (230, 237, 214), (107, 153, 159), (38, 84, 109), (99, 189, 220)),
    ((71, 65, 104), (112, 91, 141), (38, 38, 72), (32, 59, 86), (193, 126, 219)),
    ((202, 161, 93), (230, 199, 128), (128, 100, 63), (49, 71, 86), (224, 184, 102)),
    ((49, 130, 127), (82, 174, 161), (25, 80, 91), (23, 62, 81), (105, 218, 207)),
]


def facade_tile(style):
    size = 512
    xx, yy, u, v, outer, inner = facade_masks(size, style)
    base, accent, seam, glass, reflect = FACADE_PALETTES[style]
    # Integer-period harmonics keep the material grain continuous at all edges.
    nx, ny = xx / size, yy / size
    wave = (0.46 * np.sin(2 * np.pi * (3 * nx + 2 * ny) + style * .8) +
            0.28 * np.sin(2 * np.pi * (7 * nx - 4 * ny) + style * 1.6) +
            0.16 * np.cos(2 * np.pi * (13 * nx + 9 * ny) + style * .4))
    panel = 0.5 * np.cos(2 * np.pi * (u / 64)) + 0.35 * np.cos(2 * np.pi * (v / 64))
    mat = np.zeros((size, size, 3), np.float32)
    for c in range(3):
        mat[..., c] = base[c] + wave * (5.0 if style in (2, 3, 8, 10, 14) else 8.0) + panel * 2.2
    # A thin, periodic construction grid, with warmer decorative fins on selected tiles.
    edge = np.minimum(np.minimum(u, 64 - u), np.minimum(v, 64 - v))
    seam_mask = edge <= (2 if style in (1, 2, 7, 8, 10, 14) else 1)
    if style in (5, 11):
        fin = (u % 16) <= 3
        mat[fin] = np.array(accent) * .83 + np.array(base) * .17
    else:
        mat[seam_mask] = np.array(seam)
    # Window frame and glass field.
    mat[outer] = np.array(seam) * .72 + np.array(base) * .28
    if style == 7:  # deeply recessed brutalist openings
        mat[inner] = np.array((18, 31, 37), np.float32)
    else:
        gx = (u.astype(np.float32) - 32) / 32
        gy = (v.astype(np.float32) - 32) / 32
        g = np.zeros_like(mat)
        for c in range(3):
            g[..., c] = glass[c] + (1 - gy) * 7 + (1 - np.abs(gx)) * 5
        reflection = (np.abs((u % 64) - (23 + (style % 5))) <= 2) & inner
        g[reflection] = np.array(reflect)
        if style in (1, 2, 4, 6, 8, 10, 12):
            # Fine transoms and brick/stone lintels remain part of each repeating module.
            transom = ((v % 16) <= 1) & inner
            g[transom] *= .72
        mat[inner] = g[inner]
    # Subtle sunlit masonry or metallic highlights.
    if style in (2, 8, 10, 14):
        mortar = ((v % 64) <= 2) | ((u % 32) <= 1)
        mat[mortar & ~outer] = np.array(accent) * .52 + np.array(base) * .48
    if style == 5:
        stripes = (u % 16) <= 2
        mat[stripes & ~outer] = np.array(accent)
    if style == 13:
        horizontal = (v % 16) <= 1
        mat[horizontal & ~outer] = np.array(accent) * .4 + np.array(base) * .6
    # Make the source tile exactly periodic. The one-pixel edge correction is visually invisible.
    periodic_edge_rgb(mat)
    return np.uint8(np.clip(mat, 0, 255)), inner


def make_facades():
    albedo = np.zeros((2048, 2048, 3), np.uint8)
    emission = np.zeros((2048, 2048, 3), np.uint8)
    rng = np.random.default_rng(704)
    for i in range(16):
        tile, inner = facade_tile(i)
        row, col = divmod(i, 4)
        y0, x0 = row * 512, col * 512
        albedo[y0:y0+512, x0:x0+512] = tile
        # Roughly half of all windows glow, with a warm/cool/pink mix.
        lit_grid = np.zeros((8, 8), bool)
        lit_grid.flat[rng.choice(64, size=int(rng.integers(26, 39)), replace=False)] = True
        yy, xx = np.mgrid[0:512, 0:512]
        lit = inner & lit_grid[yy // 64, xx // 64]
        colors = np.array([[255, 174, 72], [255, 202, 112], [71, 215, 255],
                           [116, 238, 255], [255, 93, 193]], np.uint8)
        cell_colors = colors[rng.integers(0, len(colors), size=(8, 8))]
        emission_tile = np.zeros((512, 512, 3), np.uint8)
        tiled_colors = cell_colors[yy // 64, xx // 64]
        emission_tile[lit] = tiled_colors[lit]
        # Avoid any accidental edge channels and preserve exact window-only emission.
        emission[y0:y0+512, x0:x0+512] = emission_tile
    save_seamless_atlas_webp("facade_atlas.webp", albedo, 4, 4, 512)
    Image.fromarray(emission, "RGB").save(OUT / "facade_emissive.png", "PNG", optimize=True, compress_level=9)


def neon_sign(index):
    S = 512
    bg = np.zeros((S, S, 3), np.uint8)
    yy, xx = np.mgrid[0:S, 0:S]
    glow = 4 + 4 * np.exp(-(((xx - 256) / 260) ** 2 + ((yy - 270) / 230) ** 2))
    bg[..., 0] = 4 + glow * .18
    bg[..., 1] = 8 + glow * .48
    bg[..., 2] = 23 + glow
    bg = np.uint8(np.clip(bg, 0, 255))
    base = Image.fromarray(bg, "RGB")
    color_sets = [((20, 230, 255), (255, 50, 188), (255, 206, 60)),
                  ((255, 62, 191), (55, 229, 255), (255, 213, 80)),
                  ((255, 210, 60), (34, 218, 255), (255, 65, 191))]
    c1, c2, c3 = color_sets[index % len(color_sets)]
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(core)
    def line(points, color=c1, width=9, joint="curve"):
        d.line(points, fill=(*color, 255), width=width, joint=joint)
    def ellipse(box, color=c1, width=9):
        d.ellipse(box, outline=(*color, 255), width=width)
    def polygon(points, color=c1, width=9):
        d.line(points + [points[0]], fill=(*color, 255), width=width, joint="curve")
    if index == 0:  # jet silhouette with wing lights
        line([(256, 82), (240, 214), (110, 300), (108, 330), (239, 292), (242, 408), (196, 438), (196, 458), (256, 442), (316, 458), (316, 438), (270, 408), (273, 292), (404, 330), (402, 300), (272, 214), (256, 82)], c1, 8)
        line([(163, 315), (214, 298)], c2, 5); line([(349, 315), (298, 298)], c2, 5)
    elif index == 1:  # noodle bowl, chopsticks, steam
        line([(146, 288), (175, 376), (337, 376), (366, 288)], c1, 10)
        line([(130, 278), (382, 278)], c2, 9)
        line([(186, 252), (168, 198), (196, 145), (183, 111)], c3, 7)
        line([(250, 247), (232, 193), (258, 151), (247, 103)], c2, 7)
        line([(307, 245), (327, 194), (300, 145), (316, 108)], c1, 7)
        line([(278, 109), (392, 187)], c3, 7)
        line([(304, 99), (413, 173)], c2, 5)
    elif index == 2:  # star and orbit
        pts = []
        for k in range(10):
            ang = -math.pi/2 + k * math.pi/5
            radius = 155 if k % 2 == 0 else 68
            pts.append((256 + math.cos(ang) * radius, 253 + math.sin(ang) * radius))
        polygon(pts, c3, 9)
        ellipse((82, 118, 430, 390), c1, 5)
        ellipse((365, 228, 392, 255), c2, 2)
    elif index == 3:  # lightning bolt in a rounded energy loop
        line([(286, 74), (168, 260), (250, 260), (212, 436), (360, 223), (275, 223), (286, 74)], c3, 14)
        ellipse((100, 99, 412, 411), c1, 6)
    elif index == 4:  # wing crest
        line([(256, 342), (256, 176), (290, 206), (322, 164)], c3, 10)
        for k in range(4):
            y = 197 + k * 38
            line([(250, y), (190 - k * 14, y - 37), (94 - k * 7, y - 28)], c1 if k % 2 == 0 else c2, 8)
            line([(262, y), (322 + k * 14, y - 37), (418 + k * 7, y - 28)], c1 if k % 2 == 0 else c2, 8)
        polygon([(256, 104), (297, 150), (256, 196), (215, 150)], c3, 6)
    elif index == 5:  # twin arrows / race loop
        d.arc((102, 102, 410, 410), 205, 345, fill=(*c1, 255), width=11)
        line([(377, 139), (406, 145), (391, 174)], c1, 10)
        d.arc((102, 102, 410, 410), 25, 165, fill=(*c2, 255), width=11)
        line([(135, 375), (106, 368), (122, 340)], c2, 10)
        ellipse((207, 207, 305, 305), c3, 8)
    elif index == 6:  # planet, ring and comet
        ellipse((157, 143, 354, 340), c2, 10)
        d.arc((86, 142, 425, 345), 190, 350, fill=(*c1, 255), width=10)
        d.arc((86, 142, 425, 345), 10, 170, fill=(*c1, 255), width=6)
        line([(91, 230), (55, 218)], c3, 5); line([(111, 196), (83, 172)], c3, 5)
        ellipse((244, 191, 276, 223), c3, 3)
    else:  # racing gate with a flying spark
        line([(130, 398), (130, 153), (194, 104), (318, 104), (382, 153), (382, 398)], c1, 10)
        line([(165, 362), (165, 173), (211, 137), (300, 137), (347, 173), (347, 362)], c2, 6)
        line([(222, 295), (271, 248), (304, 262), (348, 205)], c3, 11)
        ellipse((338, 190, 357, 209), c3, 2)
    # Add a restrained glow around crisp tubes, preserving a dark opaque sign panel.
    glow1 = core.getchannel("A").filter(ImageFilter.GaussianBlur(24))
    glow2 = core.getchannel("A").filter(ImageFilter.GaussianBlur(9))
    glow_arr1 = np.asarray(glow1, np.float32)[..., None] / 255
    glow_arr2 = np.asarray(glow2, np.float32)[..., None] / 255
    core_rgb = np.asarray(core.convert("RGB"), np.float32)
    base_arr = np.asarray(base, np.float32)
    # Three neon hues are composed using the tube's local hue and soft additive bloom.
    hue = np.where(core_rgb[..., 0:1] > core_rgb[..., 1:2], core_rgb, core_rgb)
    out = np.clip(base_arr + glow_arr1 * np.array([30, 65, 170]) + glow_arr2 * np.array([60, 150, 245]) + core_rgb * .72, 0, 255)
    return np.uint8(out)


def make_neon():
    atlas = np.zeros((1024, 2048, 3), np.uint8)
    for i in range(8):
        row, col = divmod(i, 4)
        atlas[row*512:(row+1)*512, col*512:(col+1)*512] = neon_sign(i)
    save_rgb_webp("neon_signs.webp", atlas)


def make_stars():
    w, h = 2048, 1024
    yy, xx = np.mgrid[0:h, 0:w]
    xn, yn = xx / w, yy / h
    band_y = .50 + .16 * np.sin(2 * np.pi * xn + .5) + .055 * np.sin(4 * np.pi * xn + 1.7)
    band = np.exp(-((yn - band_y) / .105) ** 2)
    base = np.zeros((h, w, 3), np.float32)
    vertical = np.sin(np.pi * yn) ** .55
    base[..., 0] = 3.0 + vertical * 3.3 + band * 2.5
    base[..., 1] = 5.0 + vertical * 7.0 + band * 7.5
    base[..., 2] = 17.0 + vertical * 20.0 + band * 17.0
    # Very faint periodic nebular structure around the Milky Way band.
    grain = (np.sin(2*np.pi*(13*xn + 3*yn)) + .55*np.cos(2*np.pi*(21*xn - 7*yn))) * band
    base += grain[..., None] * np.array([1.2, 2.0, 3.2])
    out = base
    rng = np.random.default_rng(991)
    count = 5100
    sx = rng.integers(0, w, count)
    sy = rng.integers(8, h-8, count)
    chance = .56 + .85 * band[sy, sx]
    keep = rng.random(count) < chance
    colors = np.array([[189, 215, 255], [220, 233, 255], [255, 232, 194], [155, 202, 255], [255, 255, 255]], np.float32)
    for x, y, bright, ci in zip(sx[keep], sy[keep], rng.uniform(.28, 1.0, keep.sum()), rng.integers(0, 5, keep.sum())):
        c = colors[ci] * bright
        out[y, x] += c
        if bright > .73:
            radius = 1 if bright < .92 else 2
            for dy in range(-radius, radius+1):
                for dx in range(-radius, radius+1):
                    if dx == 0 and dy == 0:
                        continue
                    weight = math.exp(-(dx*dx+dy*dy)/(1.2 if radius == 1 else 2.3)) * .26 * bright
                    out[(y+dy) % h, (x+dx) % w] += c * weight
    # Match the equirectangular seam exactly; no pole-sized stars or pinched gradients.
    out[:, 0] = (out[:, 0] + out[:, -1]) * .5
    out[:, -1] = out[:, 0]
    out[-1, :] = out[-2, :]
    save_rgb_webp("stars.webp", np.uint8(np.clip(out, 0, 255)))


def make_aurora():
    w, h = 1024, 256
    yy, xx = np.mgrid[0:h, 0:w]
    x, y = xx / w, yy / (h - 1)
    ridge = .68 + .075*np.sin(2*np.pi*(2*x)+.5) + .045*np.sin(2*np.pi*(5*x)+1.1)
    curtain = .36 + .64*np.exp(-((y - ridge) / .28) ** 2)
    fade_up = np.clip(y, 0, 1) ** 1.65
    rays = .49 + .31*np.sin(2*np.pi*(18*x + .22*np.sin(4*np.pi*y))) + .20*np.sin(2*np.pi*(31*x + .08*np.cos(6*np.pi*y)))
    rays = np.clip(rays, .09, 1.0)
    folds = .82 + .18*np.cos(2*np.pi*(4*x + .18*y))
    intensity = np.clip(curtain * fade_up * rays * folds, 0, 1)
    # Spectral curtain: violet above, cyan through the middle, vivid green near the lower edge.
    t = np.clip(y, 0, 1)
    violet = np.array([145, 91, 255], np.float32)
    cyan = np.array([52, 235, 241], np.float32)
    green = np.array([112, 255, 121], np.float32)
    upper = smooth(t, .10, .53)[..., None]
    lower = smooth(t, .49, .92)[..., None]
    color = violet[None, None, :] * (1-upper) + cyan[None, None, :] * upper
    color = color * (1-lower) + green[None, None, :] * lower
    alpha = intensity * (0.18 + 0.70 * np.clip(y + .08, 0, 1))
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., :3] = color
    rgba[..., 3] = alpha * 255
    rgba[:, -1] = rgba[:, 0]
    save_rgba_png("aurora.png", rgba)


def make_sun():
    s = 256
    yy, xx = np.mgrid[0:s, 0:s]
    x = (xx - (s-1)/2) / (s*.5)
    y = (yy - (s-1)/2) / (s*.5)
    r = np.sqrt(x*x + y*y)
    theta = np.arctan2(y, x)
    radial = .68*np.exp(-(r/.18)**2) + .31*np.exp(-(r/.62)**2) + .12*np.exp(-(r/.98)**2)
    rays = 1 + .075 * np.maximum(0, np.cos(3*theta))**18 * np.exp(-(r/.78)**2)
    alpha = np.clip(radial * rays, 0, 1)
    gold = np.clip((r-.12)/.8, 0, 1)
    rgb = np.zeros((s, s, 3), np.float32)
    rgb[..., 0] = 255
    rgb[..., 1] = 252 - 55*gold
    rgb[..., 2] = 224 - 160*gold
    rgba = np.dstack([rgb, alpha*255])
    save_rgba_png("sun_glow.png", rgba)


def cloud_shape(index, rng):
    # Ellipses are in normalized cell coordinates (0..1); each family has a distinct silhouette.
    family = (index % 4 + index // 4) % 4
    blobs = []
    if family == 0:  # classic stacked cumulus
        cx = rng.uniform(.45, .55); cy = rng.uniform(.46, .55)
        blobs = [(cx, cy+.11, .35, .23), (cx-.22, cy+.06, .22, .24), (cx+.20, cy+.04, .24, .25),
                 (cx-.08, cy-.12, .24, .27), (cx+.13, cy-.17, .22, .24)]
        if rng.random() < .58:
            blobs.append((cx-.32, cy+.13, .16, .17))
    elif family == 1:  # broad flat-bottomed cloud bank
        cx = rng.uniform(.47, .53); cy = rng.uniform(.46, .51)
        blobs = [(cx, cy+.20, .39, .18), (cx-.25, cy+.08, .22, .21), (cx+.23, cy+.07, .24, .22),
                 (cx-.12, cy-.10, .24, .23), (cx+.14, cy-.14, .23, .26)]
    elif family == 2:  # stretched wispy / cirrus-like puffs
        cx = rng.uniform(.47, .53); cy = rng.uniform(.48, .54)
        blobs = [(cx-.22, cy+.05, .29, .15), (cx, cy-.015, .37, .17), (cx+.24, cy-.04, .27, .14),
                 (cx-.03, cy-.12, .29, .15)]
    else:  # tall towers
        cx = rng.uniform(.46, .54); cy = rng.uniform(.48, .54)
        blobs = [(cx, cy+.20, .28, .20), (cx-.12, cy+.03, .24, .24), (cx+.09, cy-.09, .23, .23),
                 (cx-.06, cy-.20, .20, .19), (cx+.08, cy-.27, .15, .14)]
    # Independent lobe shifts and scales make all sixteen silhouettes distinct.
    varied = [(cx+rng.normal(0,.016), cy+rng.normal(0,.018),
               rx*rng.uniform(.88,1.14), ry*rng.uniform(.88,1.14))
              for cx,cy,rx,ry in blobs]
    return fit_blobs(varied, .065)


def fit_blobs(blobs, margin=.065):
    """Fit soft metaball bounds within an atlas cell's clear inset."""
    edge_factor=.80
    ex=max(abs(cx-.5)+rx*edge_factor for cx,cy,rx,ry in blobs)
    ey=max(abs(cy-.5)+ry*edge_factor for cx,cy,rx,ry in blobs)
    sx=min(1.0,(.5-margin)/max(ex,1e-5))
    sy=min(1.0,(.5-margin)/max(ey,1e-5))
    return [(.5+(cx-.5)*sx,.5+(cy-.5)*sy,rx*sx,ry*sy) for cx,cy,rx,ry in blobs]


def metaball_field(size, blobs, threshold_scale=1.0):
    yy, xx = np.mgrid[0:size, 0:size]
    x, y = xx/(size-1), yy/(size-1)
    density = np.zeros((size, size), np.float32)
    for cx, cy, rx, ry in blobs:
        dx = (x-cx) / max(rx*.68, 1e-3)
        dy = (y-cy) / max(ry*.68, 1e-3)
        contribution = np.exp(-2.2*(dx*dx + dy*dy))
        density = 1 - (1-density)*(1-contribution)
    return x, y, density


def cloud_tile(i):
    rng = np.random.default_rng(4400+i)
    size = 512
    blobs = cloud_shape(i, rng)
    x, y, density = metaball_field(size, blobs)
    family = (i % 4 + i // 4) % 4
    support_shapes = [(.50,.55,.34,.20),(.50,.61,.37,.17),(.50,.52,.41,.11),(.50,.54,.21,.34)]
    cx,cy,rx,ry=support_shapes[family]
    support=np.exp(-2.2*(((x-cx)/(.68*rx))**2+((y-cy)/(.68*ry))**2))
    density=1-(1-density)*(1-support)
    # Soft multi-pixel alpha edge; no keyed backdrop and no fringe.
    alpha = smooth(density, .075, .34) * .96
    gy, gx = np.gradient(density)
    norm = np.sqrt(gx*gx + gy*gy) + 1e-5
    light_dot = np.clip((-.48*gx - .88*gy)/norm, 0, 1)
    top = np.clip(1 - y, 0, 1)
    underside = smooth(y, .47, .96)
    detail = 2.4*np.sin(2*np.pi*(3*x + .7*y) + i) + 1.5*np.sin(2*np.pi*(7*y - 2*x) + i*.31)
    shade = .88 + .12*light_dot + .10*top + detail/255
    bright = np.array([251, 253, 255], np.float32)
    shadow = np.array([147, 176, 204], np.float32)
    color = bright[None, None, :] * (1-underside[..., None]) + shadow[None, None, :] * underside[..., None]
    color *= np.clip(shade[..., None], .82, 1.08)
    # Thin silver-blue rims keep the puffs readable over a bright sky.
    rim = np.clip(np.sqrt(gx*gx+gy*gy)*1.9, 0, 1) * (1-underside)
    color = color*(1-rim[...,None]*.07) + np.array([255,255,255],np.float32)*rim[...,None]*.07
    rgba = np.zeros((size,size,4),np.float32)
    rgba[...,:3] = color
    rgba[...,3] = alpha*255
    rgba[alpha < .004, :3] = 0
    return np.uint8(np.clip(rgba,0,255))


def make_clouds():
    atlas = np.zeros((2048,2048,4),np.uint8)
    for i in range(16):
        row,col=divmod(i,4)
        atlas[row*512:(row+1)*512,col*512:(col+1)*512]=cloud_tile(i)
    save_rgba_png("cloud_atlas.png",atlas)


def smoke_tile(i):
    rng=np.random.default_rng(5500+i)
    size=256
    family=(i%4+i//4)%4
    cx=rng.uniform(.46,.54); cy=rng.uniform(.45,.55)
    if family==0:
        blobs=[(cx,cy,.23,.25),(cx-.15,cy-.11,.18,.18),(cx+.16,cy-.10,.17,.18),(cx-.12,cy+.15,.18,.15)]
    elif family==1:
        blobs=[(cx,cy+.13,.31,.15),(cx-.20,cy-.03,.18,.20),(cx+.18,cy-.13,.20,.23),(cx-.03,cy-.24,.17,.16)]
    elif family==2:
        blobs=[(cx-.22,cy+.01,.25,.11),(cx,cy-.04,.28,.12),(cx+.23,cy-.08,.20,.10)]
    else:
        blobs=[(cx,cy+.20,.19,.16),(cx-.06,cy+.03,.20,.18),(cx+.07,cy-.13,.19,.19),(cx-.04,cy-.30,.15,.15)]
    blobs=[(bx+rng.normal(0,.026),by+rng.normal(0,.026),rx*rng.uniform(.82,1.22),ry*rng.uniform(.82,1.22))
           for bx,by,rx,ry in blobs]
    blobs=fit_blobs(blobs,.08)
    x,y,density=metaball_field(size,blobs)
    support_shapes=[(.50,.52,.23,.22),(.50,.56,.29,.18),(.50,.51,.37,.12),(.50,.53,.19,.32)]
    cx0,cy0,rx0,ry0=support_shapes[family]
    support=np.exp(-2.2*(((x-cx0)/(.68*rx0))**2+((y-cy0)/(.68*ry0))**2))
    density=1-(1-density)*(1-support)
    alpha=smooth(density,.055,.30)*.89
    # Soft graphite edges and a lighter, slightly warm interior.
    core=smooth(density,.18,.82)
    gy,gx=np.gradient(density)
    contour=np.clip(np.sqrt(gx*gx+gy*gy)*2.1,0,1)
    tone=108+101*core-10*contour+5*np.sin(2*np.pi*(4*x+3*y+i))
    shade=np.zeros((size,size,3),np.float32)
    shade[...,0]=tone+3; shade[...,1]=tone+5; shade[...,2]=tone+8
    shade += (1-y)[...,None]*4
    rgba=np.zeros((size,size,4),np.float32)
    rgba[...,:3]=shade; rgba[...,3]=alpha*255
    rgba[alpha<.004,:3]=0
    return np.uint8(np.clip(rgba,0,255))


def make_smoke():
    atlas=np.zeros((1024,1024,4),np.uint8)
    for i in range(16):
        row,col=divmod(i,4)
        atlas[row*256:(row+1)*256,col*256:(col+1)*256]=smoke_tile(i)
    save_rgba_png("smoke_atlas.png",atlas)


def explosion_frame(i):
    size=512
    yy,xx=np.mgrid[0:size,0:size]
    x=(xx-(size-1)/2)/(size*.5); y=(yy-(size-1)/2)/(size*.5)
    r=np.sqrt(x*x+y*y); th=np.arctan2(y,x)
    radii=[.035,.105,.205,.315,.395,.435,.460,.458,.444,.425,.402,.382,.362,.325,.270,.205]
    opacities=[1,1,1,1,1,.99,.95,.88,.77,.67,.55,.42,.31,.17,.085,.035]
    phase=i*.63
    jagged=1+.105*np.sin(7*th+phase)+.052*np.sin(13*th-phase*.8)+.026*np.sin(21*th+phase*1.3)
    # Add small turbulent radial bands, advected through the 16-frame sequence.
    turbulence=1+.018*np.sin(25*r-2.5*th+phase)+.012*np.sin(37*r+4*th-phase)
    boundary=radii[i]*jagged*turbulence
    q=r/(boundary+1e-6)
    fire=smooth(1.08-q,.0,.24)*opacities[i]
    core=smooth(.44-q,.02,.25)
    white=smooth(.24-q,.01,.13)
    yellow=np.array([255,190,53],np.float32)
    orange=np.array([255,82,12],np.float32)
    red=np.array([180,25,8],np.float32)
    fire_rgb=red[None,None,:]*(1-smooth(q,.62,1.0)[...,None]) + orange[None,None,:]*smooth(q,.62,1.0)[...,None]
    fire_rgb=fire_rgb*(1-core[...,None])+yellow[None,None,:]*core[...,None]
    fire_rgb=fire_rgb*(1-white[...,None])+np.array([255,249,218],np.float32)*white[...,None]
    # Frame 0 is a sharp white flash; the peak is bright around frames 4-6.
    if i==0:
        fire_rgb=np.ones_like(fire_rgb)*np.array([255,252,230],np.float32)
    if i>=8:
        dark=smooth(i,7,13)*.62
        fire_rgb=fire_rgb*(1-dark)+np.array([132,31,17],np.float32)*dark
    fire_alpha=np.clip(fire,0,1)
    # Delayed, rising billows turn the outer blast into charcoal-grey smoke.
    smoke_alpha=np.zeros((size,size),np.float32)
    smoke_density=np.zeros((size,size),np.float32)
    if i>=7:
        t=(i-7)/8
        centers=[]
        count=7
        for k in range(count):
            ang=2*np.pi*k/count + phase*.26
            cx=.5+math.cos(ang)*(.20+.06*t)
            cy=.54+math.sin(ang)*(.20+.045*t)-.16*t
            rx=.15+.018*math.sin(k*2+i); ry=.14+.02*math.cos(k+i)
            centers.append((cx,cy,rx,ry))
        _,_,smoke_density=metaball_field(size,centers)
        smoke_strength=.52*smooth(i,7,10)*(1-.82*smooth(i,12,15))
        smoke_alpha=smooth(smoke_density,.065,.33)*smoke_strength
        # Suppress smoke in the early, hot core; leave it visible around and above the fire.
        smoke_alpha *= np.clip(1-fire_alpha*.8,0,1)
    smoke_rgb=np.zeros((size,size,3),np.float32)
    smoke_core=smooth(smoke_density,.15,.75)
    soot=np.array([34,38,48],np.float32)
    smoke_light=np.array([119,109,104],np.float32)
    smoke_rgb=soot[None,None,:]*(1-smoke_core[...,None])+smoke_light[None,None,:]*smoke_core[...,None]
    smoke_rgb += (1-y)[...,None]*4
    # Composite smoke behind the flame using straight alpha.
    out_alpha=fire_alpha+smoke_alpha*(1-fire_alpha)
    out_rgb=(fire_rgb*fire_alpha[...,None]+smoke_rgb*smoke_alpha[...,None]*(1-fire_alpha[...,None]))/(out_alpha[...,None]+1e-6)
    rgba=np.zeros((size,size,4),np.float32)
    rgba[...,:3]=out_rgb; rgba[...,3]=out_alpha*255
    rgba[out_alpha<.003,:3]=0
    return np.uint8(np.clip(rgba,0,255))


def make_explosion():
    atlas=np.zeros((2048,2048,4),np.uint8)
    for i in range(16):
        row,col=divmod(i,4)
        atlas[row*512:(row+1)*512,col*512:(col+1)*512]=explosion_frame(i)
    save_rgba_png("explosion_atlas.png",atlas)


def make_spark():
    s=128
    yy,xx=np.mgrid[0:s,0:s]
    x=(xx-(s-1)/2)/(s*.5); y=(yy-(s-1)/2)/(s*.5)
    r=np.sqrt(x*x+y*y)
    alpha=.94*np.exp(-(r/.22)**2)+.48*np.exp(-(r/.57)**2)+.16*np.exp(-(r/.96)**2)
    rgb=np.zeros((s,s,3),np.float32)
    mix=np.clip(r/.55,0,1)
    rgb[...,0]=255; rgb[...,1]=255-47*mix; rgb[...,2]=248-165*mix
    save_rgba_png("spark.png",np.dstack([rgb,alpha*255]))


def flare_cell(index):
    s=256
    yy,xx=np.mgrid[0:s,0:s]
    x=(xx-(s-1)/2)/(s*.5); y=(yy-(s-1)/2)/(s*.5)
    r=np.sqrt(x*x+y*y); th=np.arctan2(y,x)
    if index==0:  # soft glass ring
        ring=np.exp(-((r-.48)/.033)**2)
        alpha=.58*ring+.10*np.exp(-((r-.48)/.10)**2)
    elif index==1:  # hexagonal iris
        # Distance from a regular hexagon boundary in polar coordinates.
        sector=np.abs(((th+math.pi/6)%(math.pi/3))-math.pi/6)
        hex_r=.53*np.cos(math.pi/6)/np.cos(sector)
        ring=np.exp(-((r-hex_r)/.034)**2)
        alpha=.64*ring+.14*np.exp(-((r-hex_r)/.09)**2)+.08*np.exp(-(r/.20)**2)
    elif index==2:  # horizontal anamorphic streak
        streak=np.exp(-(y/.027)**2)*np.exp(-np.abs(x)/.47)
        alpha=.82*streak+.50*np.exp(-((x)/.045)**2-(y/.14)**2)
        alpha += .24*np.exp(-((x-.34)/.035)**2-(y/.08)**2)+.24*np.exp(-((x+.34)/.035)**2-(y/.08)**2)
    else:  # 8-ray starburst with a compact white core
        rays=np.abs(np.cos(4*th))**22
        alpha=.74*np.exp(-(r/.045)**2)+.58*rays*np.exp(-(r/.58)**1.5)+.13*np.exp(-(r/.26)**2)
    alpha=np.clip(alpha,0,1)
    rgba=np.zeros((s,s,4),np.float32)
    rgba[...,:3]=255
    rgba[...,3]=alpha*255
    rgba[alpha<.003,:3]=0
    return np.uint8(rgba)


def make_flare():
    atlas=np.zeros((256,1024,4),np.uint8)
    for i in range(4): atlas[:,i*256:(i+1)*256]=flare_cell(i)
    save_rgba_png("flare_atlas.png",atlas)


def make_shockwave():
    s=512
    yy,xx=np.mgrid[0:s,0:s]
    x=(xx-(s-1)/2)/(s*.5); y=(yy-(s-1)/2)/(s*.5)
    r=np.sqrt(x*x+y*y)
    ring=np.exp(-((r-.62)/.018)**2)
    halo=.24*np.exp(-((r-.62)/.055)**2)
    alpha=np.clip(.90*ring+halo,0,1)
    rgba=np.zeros((s,s,4),np.float32)
    rgba[...,:3]=255; rgba[...,3]=alpha*255
    rgba[alpha<.003,:3]=0
    save_rgba_png("shockwave.png",rgba)


def lightning_path(rng, start=(128,0), end=(128,255), depth=5):
    points=[start,end]
    # Recursive midpoint displacement, leaving the bolt centered at both ends.
    def split(a,b,d,scale):
        if d==0: return [a,b]
        mid=((a[0]+b[0])*.5+rng.normal(0,scale*19), (a[1]+b[1])*.5)
        mid=(float(np.clip(mid[0],36,220)),mid[1])
        left=split(a,mid,d-1,scale*.68)
        right=split(mid,b,d-1,scale*.68)
        return left[:-1]+right
    return split(start,end,depth,1.0)


def lightning_cell(index):
    rng=np.random.default_rng(6600+index)
    s=256
    pts=lightning_path(rng,depth=5)
    glow=Image.new("L",(s,s),0); gd=ImageDraw.Draw(glow)
    core=Image.new("L",(s,s),0); cd=ImageDraw.Draw(core)
    # At least one fork on each bolt, with tapered secondary branches.
    gd.line(pts,fill=205,width=12,joint="curve"); cd.line(pts,fill=255,width=3,joint="curve")
    branch_count=1+(index%3)
    for b in range(branch_count):
        pick=int((b+1)*len(pts)/(branch_count+2))
        x0,y0=pts[pick]
        direction=-1 if (b+index)%2==0 else 1
        run=rng.uniform(32,72)
        branch=[(x0,y0)]
        px,py=x0,y0
        for _ in range(4):
            py=min(253,py+run/4)
            px=np.clip(px+direction*rng.uniform(6,19),13,243)
            branch.append((float(px),float(py)))
        gd.line(branch,fill=180,width=7,joint="curve"); cd.line(branch,fill=225,width=2,joint="curve")
    outer=glow.filter(ImageFilter.GaussianBlur(15))
    mid=glow.filter(ImageFilter.GaussianBlur(5))
    inner=core.filter(ImageFilter.GaussianBlur(1.4))
    oa=np.asarray(outer,np.float32)/255*.68
    ma=np.asarray(mid,np.float32)/255*.68
    ia=np.asarray(inner,np.float32)/255*.90
    ca=np.asarray(core,np.float32)/255
    alpha=np.maximum(np.maximum(oa,ma),np.maximum(ia,ca))
    rgba=np.zeros((s,s,4),np.float32)
    rgba[...,:3]=np.array([119,119,255])[None,None,:]*oa[...,None]
    rgba[...,:3]+=np.array([154,213,255])[None,None,:]*ma[...,None]
    rgba[...,:3]+=np.array([224,243,255])[None,None,:]*ia[...,None]
    rgba[...,:3]=np.clip(rgba[...,:3],0,255)
    rgba[ca>.01]=[255,255,255,255]
    rgba[...,3]=alpha*255
    return np.uint8(np.clip(rgba,0,255))


def make_lightning():
    atlas=np.zeros((512,1024,4),np.uint8)
    for i in range(8):
        row,col=divmod(i,4)
        atlas[row*256:(row+1)*256,col*256:(col+1)*256]=lightning_cell(i)
    save_rgba_png("lightning_atlas.png",atlas)


META = {
    "facade_atlas.webp": (2048,2048,4,4,"srgb",False,"Repeating daytime building facade albedo tiles."),
    "facade_emissive.png": (2048,2048,4,4,"linear",False,"Window-only night emissive map aligned to facade_atlas."),
    "neon_signs.webp": (2048,1024,4,2,"srgb",False,"Fictional glowing neon sign illustrations on navy panels."),
    "stars.webp": (2048,1024,1,1,"srgb",False,"Horizontally seamless equirectangular night sky with Milky Way."),
    "aurora.png": (1024,256,1,1,"srgb",True,"Horizontally wrapping green cyan violet aurora curtain."),
    "sun_glow.png": (256,256,1,1,"srgb",True,"Soft additive white gold sun glow with subtle six ray star."),
    "cloud_atlas.png": (2048,2048,4,4,"srgb",True,"Sixteen soft volumetric cloud puffs for billboards."),
    "smoke_atlas.png": (1024,1024,4,4,"srgb",True,"Sixteen feathered grey smoke puffs."),
    "explosion_atlas.png": (2048,2048,4,4,"srgb",True,"Sixteen frame expanding fireball and smoke flipbook."),
    "spark.png": (128,128,1,1,"srgb",True,"Small white yellow additive glow dot."),
    "flare_atlas.png": (1024,256,4,1,"srgb",True,"Ring, hex iris, anamorphic streak and starburst flare elements."),
    "shockwave.png": (512,512,1,1,"srgb",True,"Thin white expanding shockwave ring."),
    "lightning_atlas.png": (1024,512,4,2,"srgb",True,"Eight forked white core blue violet lightning bolts."),
}


def make_manifest():
    data={name:{"w":w,"h":h,"cols":cols,"rows":rows,"colorSpace":space,"alpha":alpha,"use":use}
          for name,(w,h,cols,rows,space,alpha,use) in META.items()}
    (OUT/"manifest-b.json").write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8")


def checker(w,h,cell=16):
    yy,xx=np.mgrid[0:h,0:w]
    v=np.where(((xx//cell)+(yy//cell))%2==0,128,166).astype(np.uint8)
    return Image.fromarray(np.dstack([v,v,v]),"RGB")


def make_contact_sheet():
    names=list(META)
    card_w,card_h=420,270
    cols=4; rows=math.ceil(len(names)/cols)
    sheet=Image.new("RGB",(cols*card_w,rows*card_h),(36,39,47))
    draw=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype("arial.ttf",16)
    except OSError: font=ImageFont.load_default()
    for i,name in enumerate(names):
        x=(i%cols)*card_w; y=(i//cols)*card_h
        path=OUT/name
        im=Image.open(path).convert("RGBA")
        im.thumbnail((card_w-20,card_h-52),Image.Resampling.LANCZOS)
        ix=x+(card_w-im.width)//2; iy=y+30+(card_h-52-im.height)//2
        if META[name][5]:
            backdrop=checker(im.width,im.height)
            backdrop.paste(im,(0,0),im.getchannel("A"))
            sheet.paste(backdrop,(ix,iy))
        else:
            sheet.paste(im.convert("RGB"),(ix,iy))
        draw.text((x+10,y+7),name,fill=(248,249,255),font=font)
        draw.rectangle((x+3,y+3,x+card_w-4,y+card_h-4),outline=(83,90,105),width=1)
    sheet.save(SRC/"contact-sheet-b.jpg","JPEG",quality=90,optimize=True)


def checks():
    errors=[]
    total=0
    for name,(w,h,cols,rows,space,alpha,use) in META.items():
        p=OUT/name
        im=Image.open(p)
        if im.size!=(w,h): errors.append(f"{name}: expected {(w,h)}, got {im.size}")
        size=p.stat().st_size; total+=size
        if size>=3*1024*1024: errors.append(f"{name}: {size} bytes exceeds 3 MB")
        print(f"CHECK {name}: {w}x{h}, {size:,} bytes")
    if total>=16*1024*1024: errors.append(f"total size {total} exceeds 16 MB")
    print(f"CHECK total: {total:,} bytes")
    # Check cloud alpha coverage per cell with a 16/255 threshold.
    clouds=np.asarray(Image.open(OUT/"cloud_atlas.png").convert("RGBA"))[...,3]
    cover=[]
    for r in range(4):
        for c in range(4):
            cell=clouds[r*512:(r+1)*512,c*512:(c+1)*512]
            cover.append(np.mean(cell>16))
    print("CHECK cloud alpha coverage:", ", ".join(f"{v:.1%}" for v in cover))
    if any(v<.15 or v>.85 for v in cover): errors.append("cloud cell alpha coverage outside 15-85%")
    # Emissive pixels must stay inside matching window masks, with 40-60% lit per tile.
    emission=np.asarray(Image.open(OUT/"facade_emissive.png").convert("RGB"))
    ratios=[]
    for i in range(16):
        row,col=divmod(i,4); y0,x0=row*512,col*512
        inner=facade_masks(512,i)[5]
        tile=emission[y0:y0+512,x0:x0+512]
        active=np.any(tile>0,axis=2)
        if np.any(active & ~inner): errors.append(f"facade emissive tile {i} lights outside windows")
        lit_count=0
        for wy in range(8):
            for wx in range(8):
                lit_count += int(np.any(tile[wy*64:(wy+1)*64,wx*64:(wx+1)*64]>0))
        ratio=lit_count/64
        ratios.append(ratio)
        if ratio<.40 or ratio>.60: errors.append(f"facade emissive tile {i} lit-window ratio {ratio:.1%} outside 40-60%")
    print("CHECK facade lit-window ratio:", ", ".join(f"{v:.1%}" for v in ratios))
    # Verify facade seams and the wrapped stars after lossy WebP encoding.
    facade=np.asarray(Image.open(OUT/"facade_atlas.webp").convert("RGB"))
    seams=[]
    for r in range(4):
        for c in range(4):
            cell=facade[r*512:(r+1)*512,c*512:(c+1)*512]
            seams += [float(np.abs(cell[:,0].astype(np.int16)-cell[:,-1].astype(np.int16)).mean()),
                      float(np.abs(cell[0].astype(np.int16)-cell[-1].astype(np.int16)).mean())]
    print(f"CHECK facade per-tile mean seam difference: max={max(seams):.2f}, avg={np.mean(seams):.2f} / 255")
    stars=np.asarray(Image.open(OUT/"stars.webp").convert("RGB"))
    sd=float(np.abs(stars[:,0].astype(np.int16)-stars[:,-1].astype(np.int16)).mean())
    print(f"CHECK stars horizontal mean seam difference: {sd:.2f} / 255")
    aur=np.asarray(Image.open(OUT/"aurora.png").convert("RGBA"))
    ad=float(np.abs(aur[:,0].astype(np.int16)-aur[:,-1].astype(np.int16)).mean())
    print(f"CHECK aurora horizontal mean seam difference: {ad:.3f} / 255")
    if max(seams)>18: errors.append("facade seam difference is visually high")
    if sd>8: errors.append("stars seam difference is visually high")
    if ad>1: errors.append("aurora seam is not matched")
    if errors:
        raise RuntimeError("; ".join(errors))


def main():
    make_facades()
    make_neon()
    make_stars()
    make_aurora()
    make_sun()
    make_clouds()
    make_smoke()
    make_explosion()
    make_spark()
    make_flare()
    make_shockwave()
    make_lightning()
    make_manifest()
    checks()
    make_contact_sheet()
    print(f"Wrote {len(META)} textures, manifest and contact sheet.")


if __name__=="__main__":
    main()

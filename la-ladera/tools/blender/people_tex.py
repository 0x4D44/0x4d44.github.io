"""Procedural PBR texture pages for people.glb (numpy + PIL only).
Three maps share the original 8x8 atlas: 2048px ALBEDO and NORMAL, 1024px ORM
(the builder downsamples the assembled ORM). ALBEDO is multiplied in-engine by
per-vertex garment tint and baked AO; NORMAL is tangent-space; ORM stores
roughness in G and metallic in B.
Fabric cells are grey-scale detail (tinted by vertex colour) except tartans / faces / eyes which carry their own colour.  All fabric tiles are seamless (periodic).
Also builds the hair-card sheet (RGBA, alpha tested).

Bodies-v2 textile designs are original deterministic mathematical constructions,
released as CC0-1.0 with the generated assets. No sampled photographs, commercial
fabric designs, brand marks or downloaded texture assets are incorporated.
Existing cells 0..61 retain their meanings; the two formerly unused cells 62/63
hold yarn-dyed stripe/check cloth. No page, material or draw call is added.
"""
import math, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 256
PAGE = 2048
NCOL = PAGE // CELL            # 8 cells per row

def hx(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0

def fnoise(n, beta, seed, aniso=(1.0, 1.0)):
    """periodic 1/f^beta noise, zero mean unit std"""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(n)[:, None] * n / aniso[0]; fx = np.fft.rfftfreq(n)[None, :] * n / aniso[1]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1.0
    spec = (rng.normal(size=f.shape) + 1j * rng.normal(size=f.shape)) / f ** beta
    spec[0, 0] = 0
    a = np.fft.irfft2(spec, s=(n, n))
    return (a - a.mean()) / (a.std() + 1e-9)

def to_normal(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / L, ny / L, nz / L], -1) * 0.5 + 0.5

def tile_out(alb, h, rough, metal, nstrength):
    """alb: HxW or HxWx3 float 0..1 -> (albedo u8, normal u8, orm u8)"""
    if alb.ndim == 2: alb = np.repeat(alb[:, :, None], 3, 2)
    n = to_normal(h, nstrength)
    orm = np.stack([np.ones_like(rough), np.clip(rough, 0, 1), np.clip(metal, 0, 1) * np.ones_like(rough)], -1)
    u8 = lambda a: np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    return u8(alb), u8(n), u8(orm)

XX, YY = np.meshgrid(np.arange(CELL), np.arange(CELL))

# ---------------------------------------------------------------- fabrics (grey albedo ~0.8 so tints stay saturated)
def f_skin(seed=1):
    n1 = fnoise(CELL, 1.4, seed); pores = fnoise(CELL, 0.2, seed + 1)
    pit = np.clip(pores - 2.4, 0, None)           # fewer and shallower pits: at 1.5 m the sun glinted off every one of them (bright specks on every forearm, like a rash)
    alb = 0.94 + 0.030 * n1 - 0.02 * pit
    h = 0.35 * n1 * 0.2 - 0.40 * pit
    return tile_out(alb, h, 0.62 + 0.06 * fnoise(CELL, 1.0, seed + 2), 0.0, 0.9)

def woven_fields(seed, twill=False):
    """Rounded crossing yarns, not a checkerboard height discontinuity.

    Four pixels form a yarn pair; the low contrast survives minification without
    making dark cloth sparkle. Every analytic frequency divides the 256px cell.
    """
    wx = (0.5 + 0.5 * np.cos(2 * np.pi * (XX + .5) / 4)) ** 1.6
    wy = (0.5 + 0.5 * np.cos(2 * np.pi * (YY + .5) / 4)) ** 1.6
    over = ((XX // 2 + YY // 2) % (4 if twill else 2)) < (3 if twill else 1)
    yarn = np.where(over, .74 * wx + .26 * wy, .26 * wx + .74 * wy)
    slub = .016 * fnoise(CELL, .9, seed, (1, 9))
    fuzz = .008 * fnoise(CELL, .15, seed + 1)
    return yarn, slub, fuzz


def f_denim():
    yarn, slub, fuzz = woven_fields(3, twill=True)
    # The light weft is exposed at twill crests. Broad knee/seat fading belongs to
    # the geometry colour bake, so the atlas does not repeat large stains.
    crest = np.maximum(0, np.cos(2 * np.pi * (XX + YY) / 8)) ** 2
    wear = .018 * fnoise(CELL, 1.5, 5)
    alb = .77 + .10 * yarn + .045 * crest + slub + wear + fuzz
    h = .23 * yarn + .12 * crest + .65 * slub + .35 * fuzz
    return tile_out(alb, h, .87 - .035 * crest + .018 * fnoise(CELL, 1, 6), 0.0, 1.35)

def f_cotton():
    yarn, slub, fuzz = woven_fields(7)
    alb = .86 + .065 * yarn + .55 * slub + fuzz
    return tile_out(alb, .22 * yarn + .55 * slub, .84 + .012 * fnoise(CELL, .8, 9), 0.0, 1.1)

def f_suit():
    # Subtle broken twill appropriate to everyday trousers and older jackets.
    yarn, slub, fuzz = woven_fields(11, twill=True)
    diagonal = np.cos(2 * np.pi * (YY + np.abs((XX % 32) - 16)) / 8)
    alb = .84 + .035 * diagonal + .035 * yarn + .65 * slub + fuzz
    return tile_out(alb, .16 * yarn + .065 * diagonal + .4 * slub, .89 + .012 * fnoise(CELL, 1, 13), 0.0, 1.1)

def f_wool_coat():
    nap = fnoise(CELL, .7, 14, (2.0, 1.0)); fuzz = fnoise(CELL, .1, 15)
    alb = .86 + .020 * nap + .010 * fuzz
    return tile_out(alb, .12 * nap + .045 * fuzz, .94 + .012 * nap, 0.0, .55)

def f_knit():
    # Stockinette loops: two soft inclined yarns meet at a V and tuck under the
    # next row. An 8x16px repeat closes exactly at both atlas cell borders.
    x = (XX % 8) - 3.5; y = (YY % 16) / 16
    ridge = np.exp(-((np.abs(x) - (1.1 + 2.1 * y)) / .85) ** 2)
    tuck = .5 + .5 * np.cos(2 * np.pi * y)
    yarn = ridge * (.8 + .2 * tuck)
    fuzz = fnoise(CELL, .35, 17)
    alb = .77 + .12 * yarn + .016 * fuzz
    return tile_out(alb, .52 * yarn + .025 * fuzz, .95 + .012 * fuzz, 0.0, 1.65)

def f_jersey():
    x = (XX % 4) - 1.5; y = (YY % 8) / 8
    stitch = np.exp(-((np.abs(x) - (.6 + .9 * y)) / .58) ** 2)
    n = fnoise(CELL, .55, 19)
    alb = .85 + .05 * stitch + .012 * n
    return tile_out(alb, .18 * stitch + .025 * n, .90 + .012 * n, 0.0, 1.2)


def f_stripe_cotton():
    """Unbranded yarn-dyed double stripe; recolourable through the top slot."""
    yarn, slub, fuzz = woven_fields(101)
    y = YY % 64
    broad = (y >= 13) & (y < 29)
    fine = (y >= 36) & (y < 39)
    # Soft thread margins, slight pale fibres through the dyed band. No painted
    # normal ridge at a colour change: stripe cloth is still flat woven cloth.
    pigment = np.where(broad, .65, np.where(fine, .76, .94))
    alb = pigment * (.95 + .055 * yarn + .45 * slub + fuzz)
    return tile_out(alb, .22 * yarn + .55 * slub, .86 + .012 * fuzz, 0.0, 1.1)


def f_check_cotton():
    """An original small windowpane check with warp/weft colour mixing."""
    yarn, slub, fuzz = woven_fields(105)
    x, y = XX % 64, YY % 64
    warp = np.where((x >= 14) & (x < 27), .74, .96)
    weft = np.where((y >= 14) & (y < 27), .74, .96)
    fine_x = (x >= 36) & (x < 39); fine_y = (y >= 36) & (y < 39)
    over = ((XX // 2 + YY // 2) % 2) == 0
    pigment = .5 * (warp + weft) + .13 * np.where(over, warp - weft, weft - warp)
    pigment *= np.where(fine_x | fine_y, .78, 1.0)
    alb = pigment * (.94 + .055 * yarn + .45 * slub + fuzz)
    return tile_out(alb, .22 * yarn + .55 * slub, .86 + .012 * fuzz, 0.0, 1.1)

def f_puffer():
    per = 128
    y = (YY % per) / per
    bulge = np.sin(np.pi * y) ** 0.6                              # baffle profile
    seam = np.exp(-(np.minimum(y, 1 - y) * per) ** 2 / 3.0)
    rip = ((XX % 8 == 0) | (YY % 8 == 0)).astype(np.float32)
    n = fnoise(CELL, 1.2, 11)
    alb = 0.58 + 0.30 * bulge - 0.22 * seam + 0.02 * rip + 0.015 * n
    h = 3.2 * bulge - 0.5 * seam + 0.15 * rip + 0.1 * n
    return tile_out(alb, h, 0.42 + 0.1 * (1 - bulge), 0.0, 3.0)

def f_leather():
    rng = np.random.default_rng(12)
    pts = rng.random((90, 2)) * CELL
    d = np.full((CELL, CELL), 1e9, np.float32); d2 = d.copy()
    for px_, py_ in pts:
        for ox in (-CELL, 0, CELL):
            for oy in (-CELL, 0, CELL):
                dd = np.hypot(XX - px_ - ox, YY - py_ - oy)
                m = dd < d; d2 = np.where(m, d, np.minimum(d2, dd)); d = np.where(m, dd, d)
    edge = np.clip((d2 - d) / 6.0, 0, 1)
    n = fnoise(CELL, 1.2, 13)
    alb = 0.62 + 0.20 * edge + 0.05 * n
    return tile_out(alb, edge * 1.0 + 0.1 * n, 0.50 - 0.1 * edge, 0.0, 3.0)

def f_rubber():
    n = fnoise(CELL, 0.7, 14)
    return tile_out(0.5 + 0.05 * n, 0.3 * n, 0.84, 0.0, 1.0)

def f_mesh():
    gx = (XX % 6 < 4) & (YY % 6 < 4)
    n = fnoise(CELL, 0.6, 15)
    alb = np.where(gx, 0.88, 0.35) + 0.03 * n
    return tile_out(alb, gx.astype(np.float32) * 1.0, 0.7, 0.0, 2.0)

def f_nylon():
    rip = ((XX % 10 < 1) | (YY % 10 < 1)).astype(np.float32)
    n = fnoise(CELL, 0.9, 16)
    return tile_out(0.80 + 0.06 * rip + 0.02 * n, 0.5 * rip + 0.1 * n, 0.46, 0.0, 1.4)

def f_reflective():
    r = 4.0
    hxg = XX / r; hyg = YY / (r * 0.866)
    cell = ((hxg.astype(int) + (hyg.astype(int) % 2) * 0.5) % 1.0)
    prism = np.abs(np.sin(XX * 0.7) * np.sin(YY * 0.8))
    return tile_out(0.82 + 0.1 * prism, prism, 0.30 + 0.1 * (1 - prism), 0.25, 1.6)

def f_metal():
    n = fnoise(CELL, 1.0, 17)
    return tile_out(0.78 + 0.03 * n, 0.1 * n, 0.32, 0.95, 0.6)

def f_plastic():
    n = fnoise(CELL, 1.0, 18)
    return tile_out(0.85 + 0.02 * n, 0.05 * n, 0.42, 0.0, 0.5)

def f_hair():
    # strands run along v (image rows): anisotropic noise
    s1 = fnoise(CELL, 0.4, 19, (14.0, 1.0)); s2 = fnoise(CELL, 0.8, 20, (6.0, 1.0)); s3 = fnoise(CELL, 1.2, 21)
    alb = np.clip(0.68 + 0.14 * s1 + 0.08 * s2 + 0.05 * s3, 0.2, 1.0)
    h = 0.6 * s1 + 0.35 * s2
    return tile_out(alb, h, 0.58 + 0.10 * (0.5 - 0.5 * s2).clip(0, 1), 0.0, 0.9)

# ---------------------------------------------------------------- tartans (coloured twill)
TARTAN_COL = {'G': '#1f5236', 'N': '#17254b', 'K': '#0e0e11', 'R': '#b3161f', 'Y': '#d8ac22', 'W': '#e6e6e0', 'B': '#1c3f92', 'A': '#8c9199', 'D': '#d8d8d4'}
TARTANS = [
    [('G', 8), ('K', 2), ('N', 6), ('K', 2), ('G', 8), ('K', 2), ('N', 2), ('K', 2)],
    [('R', 10), ('K', 2), ('R', 2), ('Y', 1), ('R', 1), ('G', 6), ('R', 1), ('W', 1), ('R', 2), ('N', 2), ('R', 2), ('K', 2)],
    [('B', 10), ('K', 2), ('G', 8), ('K', 2), ('B', 4), ('G', 2), ('K', 2), ('B', 2)],
    [('A', 10), ('K', 6), ('A', 4), ('D', 2), ('A', 2), ('K', 4), ('A', 4)],
]
SETT = 48        # px per sett (CELL / SETT is not an integer: use 32-thread sett scaled to 32 px, repeated 8x)
def f_tartan(tid):
    seq = []
    for c, n in TARTANS[tid]: seq += [c] * n
    assert len(seq) == 32
    pal = np.stack([hx(TARTAN_COL[c]) for c in seq])
    ix = (XX // 1) % 32; iy = (YY // 1) % 32
    warp = pal[ix]; weft = pal[iy]
    tw = (((XX + YY) % 4) < 2)[:, :, None]
    img = np.where(tw, warp, weft)
    rng = np.random.default_rng(31 + tid)
    yarn = fnoise(CELL, 0.5, 40 + tid)
    alb = img * (0.84 + 0.18 * tw) * (1.0 + 0.07 * yarn[:, :, None])
    # blend the thread colours slightly where they cross (wool fuzz)
    im = Image.fromarray(np.clip(alb * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.45))
    alb = np.asarray(im, np.float32) / 255.0
    h = tw[:, :, 0].astype(np.float32) * 0.8 + 0.35 * yarn + 0.2 * ((XX + YY) % 2)
    return tile_out(alb, h, 0.92, 0.0, 2.2)

FABRICS = {'skin': (f_skin, 0.45), 'denim': (f_denim, 0.12), 'cotton': (f_cotton, 0.10), 'suit': (f_suit, 0.12), 'wool_coat': (f_wool_coat, 0.12),
           'knit': (f_knit, 0.19), 'jersey': (f_jersey, 0.10), 'puffer': (f_puffer, 0.20), 'leather': (f_leather, 0.10), 'rubber': (f_rubber, 0.2),
           'mesh': (f_mesh, 0.06), 'nylon': (f_nylon, 0.1), 'reflective': (f_reflective, 0.05), 'metal': (f_metal, 0.1), 'plastic': (f_plastic, 0.1),
           'hair': (f_hair, 0.16),
           'tartan0': (lambda: f_tartan(0), 0.15), 'tartan1': (lambda: f_tartan(1), 0.15), 'tartan2': (lambda: f_tartan(2), 0.15), 'tartan3': (lambda: f_tartan(3), 0.15),
           'stripe_cotton': (f_stripe_cotton, .32), 'check_cotton': (f_check_cotton, .32)}
FABRIC_ORDER = list(FABRICS.keys())
EYE_COLORS = ['#4a6b8a', '#5a4630', '#6a8a9a', '#2a1a10', '#5a7a6a', '#4a3020', '#3a2a1a', '#6a4a2a', '#5a7a9a', '#7a8a95', '#4a3a28', '#5a3a20']      # 12 tiles: cells 30..41 (a 13th would land on fabric cell 42)

# ---------------------------------------------------------------- cells
def cell_index(kind, i):
    """face tiles 0..29, eye tiles 30..41, original fabrics 42..61, stripes/checks 62/63"""
    return {'face': i, 'eye': 30 + i, 'fab': 42 + i}[kind]

def cell_rc(idx): return idx // NCOL, idx % NCOL

# ---------------------------------------------------------------- eyes
def eye_tile(col, seed=0):
    S = CELL * 2
    im = Image.new('RGB', (S, S), (238, 236, 232)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed + 5)
    c = S / 2; ri = S * 0.245
    # sclera: faint vessels toward the corners + shading toward the lid margin
    for _ in range(26):
        a = rng.uniform(0, 2 * math.pi); r0 = rng.uniform(S * 0.30, S * 0.44); l = rng.uniform(8, 22)
        d.line((c + r0 * math.cos(a), c + r0 * math.sin(a), c + (r0 + l) * math.cos(a + 0.2), c + (r0 + l) * math.sin(a + 0.2)), fill=(214, 168, 160), width=1)
    rgb = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5))
    d.ellipse((c - ri - 3, c - ri - 3, c + ri + 3, c + ri + 3), fill=tuple(int(v * 0.35) for v in rgb))          # limbal ring
    d.ellipse((c - ri, c - ri, c + ri, c + ri), fill=tuple(int(v * 0.75) for v in rgb))
    for _ in range(140):                                                                                    # radial iris fibres
        a = rng.uniform(0, 2 * math.pi); r0 = rng.uniform(ri * 0.35, ri * 0.55); r1 = rng.uniform(ri * 0.8, ri * 0.97)
        k = rng.uniform(0.7, 1.35)
        d.line((c + r0 * math.cos(a), c + r0 * math.sin(a), c + r1 * math.cos(a), c + r1 * math.sin(a)), fill=tuple(min(255, int(v * k)) for v in rgb), width=1)
    rp = ri * 0.42
    d.ellipse((c - ri * 0.55, c - ri * 0.55, c + ri * 0.55, c + ri * 0.55), outline=tuple(min(255, int(v * 1.25)) for v in rgb), width=2)
    d.ellipse((c - rp, c - rp, c + rp, c + rp), fill=(8, 8, 10))
    d.ellipse((c - ri * 0.42, c - ri * 0.62, c - ri * 0.12, c - ri * 0.34), fill=(250, 250, 250))             # catch-light
    im = im.filter(ImageFilter.GaussianBlur(0.8)).resize((CELL, CELL), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    yy_, xx_ = np.mgrid[0:CELL, 0:CELL] / CELL
    a *= (1.0 - 0.38 * np.clip((0.40 - yy_) / 0.40, 0, 1) ** 1.5)[:, :, None]                          # lid shadow on the upper eyeball
    a *= (1.0 - 0.22 * np.clip((np.hypot(xx_ - 0.5, yy_ - 0.5) - 0.38) / 0.12, 0, 1))[:, :, None]       # sclera darkens toward the rim
    h = np.zeros((CELL, CELL), np.float32)
    return tile_out(a, h, np.full((CELL, CELL), 0.16, np.float32), 0.0, 0.3)

# ---------------------------------------------------------------- faces (supersampled 2x then reduced)
def paint_face2(pd, SKIN, HAIR, seed):
    S = CELL * 2
    def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    base = np.array(rgb(pd.get('skin_hex', SKIN[pd['skin']])), np.float32)
    # the face tile is full-colour: skin tone x subtle tonal variation
    n1 = fnoise(S, 1.5, seed); n2 = fnoise(S, 0.3, seed + 1)
    yy = np.linspace(0, 1, S)[:, None]; xx = np.linspace(0, 1, S)[None, :]
    img = base[None, None, :] * (1 + 0.035 * n1[:, :, None] + 0.012 * n2[:, :, None])
    # forehead/nose highlights, cheek flush, orbital shading, jaw shadow
    g = lambda cx, cy, sx, sy: np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2))
    flush = (g(0.27, 0.62, 0.10, 0.09) + g(0.73, 0.62, 0.10, 0.09) + 0.6 * g(0.5, 0.58, 0.05, 0.08))
    fem = pd['kind'] in ('woman', 'girl') or pd.get('fem')
    fl = 0.06 if (fem or pd['kind'] in ('boy', 'girl')) else 0.035
    img[:, :, 0] *= 1 + fl * flush; img[:, :, 1] *= 1 - 0.5 * fl * flush; img[:, :, 2] *= 1 - 0.4 * fl * flush
    orb = g(0.306, 0.50, 0.075, 0.045) + g(0.694, 0.50, 0.075, 0.045)       # eye sockets (v measured from the top: eye row)
    img *= (1 - 0.14 * orb)[:, :, None]
    img *= (1 - 0.10 * np.clip((yy - 0.80) / 0.2, 0, 1))[:, :, None]            # under-chin shadow
    img *= (1 + 0.04 * g(0.5, 0.15, 0.20, 0.10))[:, :, None]                    # forehead light
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im, 'RGBA')
    U = lambda u: u * S; V = lambda v: (1 - v) * S
    hair = rgb(pd.get('hair_hex', HAIR[pd['hair'][0]]) if pd['hair'][1] != 'bald' else '#3a2a1e')
    dark = tuple(int(c * 0.55) for c in base)
    eye_v = 0.50
    for sg in (-1, 1):
        cx = U(0.5 + sg * 0.194); cy = V(eye_v)
        # R3-007 LID_UP: the modelled upper lid edge moved up from 0.16 to 0.35 of the eyeball radius (people_build.py), i.e. 0.012 of the head height; the upper lash line and the crease move with it
        cyu = V(eye_v + 0.012)
        # lid crease + upper lid shadow + lash line + lower lid line
        d.arc((cx - 0.085 * S, cyu - 0.056 * S, cx + 0.085 * S, cyu - 0.004 * S), 200, 340, fill=tuple(int(c * 0.62) for c in base) + (170,), width=4)
        d.arc((cx - 0.070 * S, cyu - 0.011 * S, cx + 0.070 * S, cyu + 0.011 * S), 190, 350, fill=(24, 18, 16, 235), width=int(S * (0.011 if fem else 0.0075)))
        d.arc((cx - 0.066 * S, cy - 0.026 * S, cx + 0.066 * S, cy + 0.026 * S), 15, 165, fill=tuple(int(c * 0.72) for c in base) + (150,), width=3)
        if fem or pd['kind'] in ('girl',):       # lashes
            for t in np.linspace(200, 340, 12):
                a = math.radians(t); r0x, r0y = 0.070 * S, 0.011 * S
                x0, y0 = cx + r0x * math.cos(a), cyu + r0y * math.sin(a)
                d.line((x0, y0, x0 + 10 * math.cos(a) * (0.7 if sg > 0 else 0.7) + sg * 2, y0 + 10 * math.sin(a)), fill=(24, 18, 16, 220), width=2)
        # brows: a soft tapered mass (thick at the inner end, thin at the tail) with strokes of individual hairs over it.
        # R3-007: they were 110 strokes 2 px wide, which blurred away at 1 m: a face with no brows (and the fringe hid them anyway, see people_build.py FRINGE).
        rng = np.random.default_rng(seed + 7 + sg)
        bw = 0.16 * S * (0.9 if fem else 1.08); by = V(eye_v + (0.115 if not fem else 0.125))
        thick = 0.030 * S * (0.72 if fem else 1.0)
        prof = lambda t: thick * (1.0 - 0.62 * t ** 1.4) * (0.6 + 0.4 * min(1.0, t * 6))
        cen = lambda t: (cx - sg * bw / 2 + sg * t * bw, by - math.sin(0.12 + t * 0.78 * math.pi) * 0.016 * S + 0.010 * S * t)
        ts = np.linspace(0, 1, 14)
        top_ = [(cen(t)[0], cen(t)[1] - prof(t) / 2) for t in ts]; bot_ = [(cen(t)[0], cen(t)[1] + prof(t) / 2) for t in ts]
        d.polygon(top_ + bot_[::-1], fill=hair + (105,))
        for _ in range(170):
            t = rng.uniform(0, 1); x, y = cen(t)
            y += rng.normal(0, prof(t) * 0.22)
            l = rng.uniform(8, 16); ang = -0.30 + 0.45 * t + rng.normal(0, 0.12)
            d.line((x, y, x + l * math.cos(ang) * sg, y + l * math.sin(ang) * 0.35), fill=hair + (225,), width=3)
    # nose: alar creases + nostrils + tip shading
    nx, ny = U(0.5), V(0.318)
    for sg in (-1, 1):
        d.arc((nx + sg * 0.045 * S - 14, ny - 6, nx + sg * 0.045 * S + 14, ny + 26), 60 if sg < 0 else 240, 120 if sg < 0 else 300, fill=dark + (130,), width=3)
        d.ellipse((nx + sg * 0.032 * S - 7, ny + 12, nx + sg * 0.032 * S + 7, ny + 24), fill=tuple(int(c * 0.32) for c in base) + (230,))
    d.line((nx - 10, ny + 36, nx + 10, ny + 36), fill=dark + (90,), width=3)               # philtrum root shadow
    # mouth: lips with gradient, centre line, corners, philtrum highlight
    my = V(0.185); lip = rgb(pd.get('lips', '#a05a52' if pd['skin'] < 4 else '#6a3028'))
    lw = 0.27 * S * (1.0 if not fem else 0.95)
    d.polygon([(U(0.5) - lw / 2, my), (U(0.5) - lw * 0.22, my - 0.030 * S), (U(0.5), my - 0.020 * S), (U(0.5) + lw * 0.22, my - 0.030 * S), (U(0.5) + lw / 2, my), (U(0.5), my + 0.003 * S)], fill=tuple(int(c * 1.0) for c in lip) + (255,))
    d.polygon([(U(0.5) - lw / 2, my), (U(0.5), my + 0.003 * S), (U(0.5) + lw / 2, my), (U(0.5) + lw * 0.30, my + 0.040 * S), (U(0.5), my + 0.048 * S), (U(0.5) - lw * 0.30, my + 0.040 * S)], fill=tuple(min(255, int(c * 1.08)) for c in lip) + (255,))
    d.line((U(0.5) - lw / 2, my, U(0.5), my + 0.004 * S, U(0.5) + lw / 2, my), fill=tuple(int(c * 0.35) for c in lip) + (255,), width=4)
    d.ellipse((U(0.5) - 0.025 * S, my + 0.022 * S, U(0.5) + 0.02 * S, my + 0.033 * S), fill=(255, 255, 255, 40))
    for sg in (-1, 1): d.ellipse((U(0.5) + sg * lw / 2 - 4, my - 3, U(0.5) + sg * lw / 2 + 4, my + 4), fill=tuple(int(c * 0.5) for c in base) + (160,))
    if pd.get('stubble') or pd.get('beard'):
        rng = np.random.default_rng(seed + 11); hc = hair
        cnt = 3500 if pd.get('beard') else 1500
        for _ in range(cnt):
            u = rng.uniform(0.10, 0.90); v = rng.uniform(0.02, 0.36 if not pd.get('beard') else 0.50)
            if abs(u - 0.5) < 0.09 and 0.17 < v < 0.24 and pd.get('beard'): continue
            if abs(u - 0.5) < 0.075 and 0.22 < v < 0.29: continue
            if (u - 0.5) ** 2 / 0.40 ** 2 + ((v - 0.18) / 0.36) ** 2 > 1.0: continue
            a = 160 if pd.get('beard') else 80
            d.point((U(u), V(v)), fill=tuple(int(0.6 * c + 0.4 * b) for c, b in zip(hc, base)) + (a,))
            d.point((U(u) + 1, V(v)), fill=tuple(int(0.6 * c + 0.4 * b) for c, b in zip(hc, base)) + (a,))
    if pd.get('wrinkles'):
        for sg in (-1, 1):
            cx, cy = U(0.5 + sg * 0.34), V(eye_v)
            for k_ in range(4): d.line((cx + sg * 5, cy - 8 + k_ * 7, cx + sg * 24, cy - 14 + k_ * 9), fill=dark + (120,), width=2)
        d.arc((U(0.5) - 56, my - 40, U(0.5) + 56, my + 36), 20, 160, fill=dark + (110,), width=2)
        for k_ in range(4): d.line((U(0.22), V(0.78) + k_ * 11, U(0.78), V(0.78) + k_ * 11 - 2), fill=dark + (70,), width=2)
    if pd['kind'] in ('girl', 'boy') or pd['skin'] <= 1 and pd['hair'][0] in (3, 4, 7, 2):       # freckles
        rng = np.random.default_rng(seed + 13)
        for _ in range(55 if pd['kind'] in ('girl', 'boy') else 35):
            u = rng.uniform(0.18, 0.82); v = rng.uniform(0.40, 0.58)
            if abs(u - 0.5) < 0.04: continue
            r = rng.uniform(1.2, 2.6); d.ellipse((U(u) - r, V(v) - r, U(u) + r, V(v) + r), fill=tuple(int(c * 0.70) for c in base) + (110,))
    im = im.filter(ImageFilter.GaussianBlur(0.9)).resize((CELL, CELL), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    # pores / micro relief on the face + roughness (lips glossier)
    pores = fnoise(CELL, 0.2, seed + 3)
    pit = np.clip(pores - 1.9, 0, None)
    a = a * (1 - 0.03 * pit[:, :, None])
    h = -0.5 * pit + 0.2 * fnoise(CELL, 1.4, seed + 4) * 0.2
    gx = lambda cx, cy, sx, sy: np.exp(-(((np.arange(CELL)[None, :] / CELL - cx) / sx) ** 2 + (((np.arange(CELL)[:, None]) / CELL - cy) / sy) ** 2))
    lipmask = gx(0.5, 1 - 0.185 + 0.0, 0.10, 0.045)
    # a little sheen where skin catches the light: forehead, nose bridge and tip, cheekbones (rows are measured from the top: crown 0, chin 1)
    shine = 0.10 * gx(0.5, 0.17, 0.16, 0.07) + 0.12 * gx(0.5, 0.64, 0.045, 0.08) + 0.06 * (gx(0.30, 0.58, 0.07, 0.05) + gx(0.70, 0.58, 0.07, 0.05))
    rough = 0.56 - 0.20 * lipmask - shine + 0.05 * fnoise(CELL, 1.0, seed + 6)
    return tile_out(a, h, rough, 0.0, 1.6)

# ---------------------------------------------------------------- hair card sheet (RGBA 512x512: 4x4 strand-clump cards, alpha tapered)
def hair_sheet(size=512):
    """Each 128x128 card tile: long strand clumps running down v, alpha-tested, tapered at the tip (v=1), root dark at v=0. Grey-scale, tinted by vertex colour."""
    rng = np.random.default_rng(77)
    img = np.zeros((size, size, 4), np.float32)
    T = size // 4
    for ty in range(4):
        for tx in range(4):
            yy, xx = np.meshgrid(np.linspace(0, 1, T), np.linspace(0, 1, T), indexing='ij')
            a = np.zeros((T, T), np.float32); lum = np.zeros((T, T), np.float32)
            nstr = 22 + 6 * ty
            for _ in range(nstr):
                x0 = rng.uniform(0.04, 0.96); w = rng.uniform(0.012, 0.03); wav = rng.uniform(-0.05, 0.05); ln = rng.uniform(0.55 + 0.1 * tx / 3, 1.0)
                cx = x0 + wav * np.sin(yy * 3.0 + rng.uniform(0, 6)) + (wav * yy)
                prof = np.exp(-((xx - cx) / w) ** 2) * (yy < ln) * np.clip((ln - yy) / 0.22, 0, 1) ** 0.6
                a = np.maximum(a, prof)
                lum = np.maximum(lum, prof * rng.uniform(0.55, 1.0))
            a = (a > 0.42).astype(np.float32)
            lum = 0.45 + 0.55 * lum * (0.7 + 0.3 * yy)
            lum *= 0.55 + 0.45 * np.clip(yy * 3, 0, 1)         # darker toward the root
            img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 0] = lum; img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 1] = lum; img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 2] = lum
            img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 3] = a
    return np.clip(img * 255, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- page assembly
def build_pages(people, SKIN, HAIR):
    A = np.full((PAGE, PAGE, 3), 128, np.uint8); N = np.zeros((PAGE, PAGE, 3), np.uint8); N[:] = (128, 128, 255); O = np.zeros((PAGE, PAGE, 3), np.uint8); O[:] = (255, 200, 0)
    put = lambda idx, t: None
    def place(idx, tile):
        r, c = cell_rc(idx)
        for page, im in zip((A, N, O), tile): page[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = im
    for i, pd in enumerate(people):
        place(cell_index('face', i), paint_face2(pd, SKIN, HAIR, 100 + i * 7))
    for i, c in enumerate(EYE_COLORS): place(cell_index('eye', i), eye_tile(c, i))
    assert len(people) <= 30 and 42 + len(FABRIC_ORDER) <= NCOL * NCOL
    for i, name in enumerate(FABRIC_ORDER): place(cell_index('fab', i), FABRICS[name][0]())
    return A, N, O


def eye_cell_for(hexc):
    c = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    d = [np.linalg.norm(c - np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)) for h in EYE_COLORS]
    return int(np.argmin(d))

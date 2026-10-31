"""Shop counters and shelving hero furniture (A3).  Same conventions as furn_assets_living.py (game frame, base at y = 0, front = +z = the customer side)."""
import math
from furn_lib import asset, shade, mulc, mixc

FLAT = 'plastic_solid'
BOOKS = (0x8a3a2a, 0x2f4a6a, 0x3a5a3a, 0xc8a040, 0x5a3a52, 0xd8d0c0, 0x6a2a2a, 0x2a3a4a, 0xa87a3a)
GOODS = {
    'shop_counter_glass': (0xe4dccb, 0xc23a30, 0x6a8f5a, 0xd4a830, 0x2f6fbf, 0xd9a0a8),      # sweets, biscuits, small boxes
    'pharmacy_counter': (0xf0efe8, 0x2f6fbf, 0x2f9a58, 0xd23a32, 0xe8c332),                    # medicine boxes
    'bread_case_glass': (0xc98a4a, 0xe8d0b0, 0xa8683a, 0xb87a3a, 0xd9b070),                    # bread, rolls, cakes
    'fridge_meat': (0xa8403c, 0xc25a50, 0xe8d0b0, 0x8a2a2c, 0xd89a8a),                         # cuts of meat, sausages
}


def _goods(A, key, x0, x1, y, z, depth, rows=1):
    pal = GOODS[key]
    n = max(4, int((x1 - x0) / 0.2))
    for i in range(n):
        u = (i * 0.6180339) % 1.0
        w = 0.1 + 0.07 * u
        x = x0 + (i + 0.5) * (x1 - x0) / n
        zz = z + (u - 0.5) * depth * 0.2
        col = pal[i % len(pal)]
        if key == 'bread_case_glass':                                                                    # loaves: long ones lying towards the customer, every third a round one
            if i % 3 == 2: A.sph(FLAT, x, y + 0.04, zz, 0.07 + 0.02 * u, 0.04, 0.07 + 0.02 * u, 10, col)
            else: A.hcyl(FLAT, x, y + 0.04, zz, 0.036 + 0.01 * u, depth * 0.6, 'z', 10, col)
        elif key == 'fridge_meat':                                                                       # steaks and joints (flattened lumps), a string of sausages every third
            if i % 3 == 2: A.hcyl(FLAT, x, y + 0.025, zz, 0.025, 0.2, 'x', 8, col)
            else: A.sph(FLAT, x, y + 0.03, zz, 0.06 + 0.025 * u, 0.03, 0.05 + 0.02 * u, 10, col)
        else: A.box(FLAT, x, y, zz, w, 0.06 + 0.12 * ((i * 0.37) % 1.0), 0.1 + 0.08 * u, col, False, r=0.006, ry=(u - 0.5) * 0.3)    # boxes of sweets, biscuits, medicine


def _till(A, x, y, z, ry=0.0):
    """A cash register: body, a tilted display, a drawer front and a keypad."""
    A.box(FLAT, x, y, z, 0.3, 0.11, 0.3, 0x2a2a2c, False, r=0.012, ry=ry)
    A.box(FLAT, x, y + 0.11, z - 0.04, 0.22, 0.025, 0.2, 0x38383a, False, r=0.008, ry=ry)
    A.box('tv_screen_c', x, y + 0.12, z - 0.12, 0.14, 0.09, 0.012, None, False, rx=-0.4, ry=ry)
    A.box(FLAT, x, y + 0.115, z + 0.05, 0.2, 0.012, 0.09, 0xb8b8b2, False, r=0.004, ry=ry)


@asset('shop', 'shop_counter_glass', 'pharmacy_counter', 'bread_case_glass', 'fridge_meat')
def counter_glass(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    white = key in ('pharmacy_counter', 'fridge_meat')                                                      # painted white: the library colour, no tint
    tn = not white
    body = 0xeeeeea if key == 'fridge_meat' else None
    bh = 0.62 if key in ('shop_counter_glass', 'pharmacy_counter') else 0.5                           # height of the solid base
    A.box('metal_dark', 0, 0, 0, W - 0.06, 0.07, D - 0.06, None, False, skip=('ny',))
    A.box(m, 0, 0.07, 0, W, bh - 0.07, D, body, tn, r=0.008)                                             # the solid base
    kk = max(2, round(W / 0.55))
    for i in range(kk):                                                                                     # panelled front
        x = -W / 2 + (i + 0.5) * W / kk
        A.box(m, x, 0.1, D / 2 + 0.001, W / kk - 0.07, bh - 0.16, 0.01, body if body else shade(0.84), tn, r=0.003)
    A.box(m, 0, bh, -D / 2 + 0.12, W, H - bh, 0.24, body, tn, r=0.008)                                   # the shopkeeper's side, raised
    A.box(m, 0, H - 0.03, -D / 2 + 0.12, W + 0.04, 0.03, 0.28, body if body else shade(0.8), tn, r=0.008)
    gz0, gz1 = -D / 2 + 0.24, D / 2 - 0.02                                                                  # the glass case, customers' side
    A.box('metal_chrome', 0, bh, (gz0 + gz1) / 2, W - 0.04, 0.014, gz1 - gz0, None, False)                  # chrome floor of the case
    _goods(A, key, -W / 2 + 0.08, W / 2 - 0.08, bh + 0.014, (gz0 + gz1) / 2, gz1 - gz0)
    A.box('glass', 0, bh + 0.014, gz1, W - 0.06, H - bh - 0.04, 0.008, None, False)                         # front pane
    A.box('glass', 0, H - 0.03, (gz0 + gz1) / 2, W - 0.06, 0.008, gz1 - gz0, None, False)                   # top pane (a hair under the roof of the case)
    for sx in (-1, 1):
        A.box('glass', sx * (W / 2 - 0.03), bh + 0.014, (gz0 + gz1) / 2, 0.008, H - bh - 0.04, gz1 - gz0, None, False)
        A.box('metal_chrome', sx * (W / 2 - 0.03), bh, gz1, 0.022, H - bh - 0.03, 0.022, None, False, r=0.004)
    A.box('metal_chrome', 0, H - 0.032, gz1, W - 0.04, 0.02, 0.022, None, False, r=0.004)                  # the case frame
    if key == 'shop_counter_glass':
        _till(A, -W / 2 + 0.3, H - 0.0, -D / 2 + 0.14, 0.0)
        A.box(FLAT, W / 2 - 0.3, H, -D / 2 + 0.14, 0.26, 0.012, 0.26, 0xd8d0c0, False, r=0.004)           # a weighing scale pan
        A.cyl(FLAT, W / 2 - 0.3, H + 0.012, -D / 2 + 0.14, 0.1, 0.012, 14, col=0xc8ccd0)
    if key == 'fridge_meat':
        A.box('metal_chrome', 0, bh, gz1 + 0.0, W - 0.04, 0.006, 0.012, None, False)


@asset('shop', 'shop_counter_wood', 'shop_counter_short', 'cafe_counter')
def counter_solid(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    A.box('metal_dark', 0, 0, 0, W - 0.06, 0.07, D - 0.06, None, False, skip=('ny',))
    A.box(m, 0, 0.07, 0, W, H - 0.07 - 0.04, D, shade(0.9), True, r=0.008)
    kk = max(2, round(W / 0.5))
    for i in range(kk):                                                                                     # panelled front
        x = -W / 2 + (i + 0.5) * W / kk
        A.box(m, x, 0.12, D / 2 + 0.001, W / kk - 0.08, H - 0.28, 0.012, shade(0.78), True, r=0.003)
        A.box(m, x, 0.13, D / 2 + 0.004, W / kk - 0.2, H - 0.3, 0.008, shade(0.95), True)
    A.box(m, 0, H - 0.04, 0, W + 0.05, 0.04, D + 0.05, shade(0.8), True, r=0.01)                           # the top, overhanging
    A.box(m, 0, H - 0.07, -D / 2 + 0.01, W - 0.06, 0.04, 0.02, shade(0.7), True)
    if key == 'cafe_counter':
        A.hcyl('metal_chrome', 0, 0.16, D / 2 + 0.07, 0.022, W - 0.2, 'x', 10)                                # foot rail
        for sx in (-1, 1): A.box('metal_chrome', sx * (W / 2 - 0.1), 0.12, D / 2 + 0.04, 0.02, 0.08, 0.07, None, False)
        A.box('metal_chrome', 0, H, D / 2 - 0.12, W * 0.5, 0.004, 0.2, None, False)                          # a steel drip tray
    else:
        _till(A, W / 2 - 0.34, H, -0.02, 0.0)


# ------------------------------------------------------------------------------------------------------ shelving
@asset('shop', 'bookshelf', 'bookshelf_low')
def bookshelf(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    for sx in (-1, 1): A.box(m, sx * (W / 2 - 0.02), 0, 0, 0.04, H, D, None, True, r=0.004, skip=('ny',))
    A.box(m, 0, 0.02, -D / 2 + 0.008, W - 0.08, H - 0.02, 0.016, shade(0.78), True)                        # back
    rows = max(2, round(H / 0.38))
    A.box(m, 0, H - 0.03, 0, W + 0.02, 0.03, D + 0.02, shade(0.92), True, r=0.006)
    n = 0
    for k in range(rows):
        ly = 0.04 if k == 0 else (H - 0.03) * k / rows
        A.box(m, 0, ly, 0, W - 0.08, 0.03, D, None, True, r=0.003)
        x = -W / 2 + 0.07
        j = 0
        while x < W / 2 - 0.1 and j < 14:
            u = ((k * 17 + j * 7) * 0.6180339) % 1.0
            bw, bh = 0.03 + 0.04 * u, 0.18 + 0.12 * (((k * 5 + j * 13) * 0.4142) % 1.0)
            if (k + j) % 7 == 6 and x < W / 2 - 0.3:                                                         # a few books lean on their neighbours
                A.box(FLAT, x + bh / 2 - 0.02, ly + 0.03, 0.0, bw, bh, D * 0.7, BOOKS[(k * 3 + j) % len(BOOKS)], False, r=0.003, rz=-0.35)
                x += bh * 0.65
            else:
                A.box(FLAT, x + bw / 2, ly + 0.03, 0.0, bw, bh, D * 0.7, BOOKS[(k * 3 + j) % len(BOOKS)], False, r=0.003)
                x += bw + 0.004
            j += 1
        n += j
    if H > 1.5:
        A.box(FLAT, W / 2 - 0.18, (H - 0.03) * (rows - 1) / rows + 0.03, 0.0, 0.1, 0.12, 0.1, 0xb5603a, False, r=0.01)                          # a small pot on the top shelf

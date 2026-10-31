"""Bedroom, kitchen and bathroom hero furniture (A3).  Same conventions as furn_assets_living.py (game frame, base at y = 0, front = +z,
lathe profiles walked from the bottom up, `tint` parts take the record's tint, flags pick variants: made / unmade, p<channel><k>)."""
import math
from furn_lib import asset, shade, mulc, mixc, arc

FLAT = 'plastic_solid'
BLANKETS = ('blanket_andean', 'bedspread_floral', 'fabric_bedding')
FRAME_COLS = (0xd9d4c4, 0x2f3a45, 0x6f8f7a, 0x8b3a2e)


# ------------------------------------------------------------------------------------------------------ beds
def bedding(A, W, D, y0, d_head=0.0):
    """Mattress, sheet (tinted), pillows and a blanket (made / unmade, three kinds).  y0 = the underside of the mattress."""
    A.box('fabric_bedding', 0, y0, 0.0, W - 0.1, 0.19, D - 0.12, 0xd6d2ca, False, r=0.05, skip=('ny', 'py'))    # the mattress: bedding cloth, so a bed costs no extra draw call (mattress_ticking would); the sheet covers its top
    A.box('fabric_bedding', 0, y0 + 0.1, 0.0, W - 0.07, 0.1, D - 0.1, None, True, r=0.04, skip=('ny',))
    top = y0 + 0.2
    two = W > 1.2
    pw = W * 0.4 if two else W * 0.7
    for sx in ((-1, 1) if two else (0,)):                                              # pillows
        px, pz = sx * W * 0.23, -D / 2 + 0.3 + d_head
        A.box('fabric_bedding', px, top - 0.01, pz, pw, 0.12, 0.38, 0xf4f0e8, False, r=0.055, skip=('ny',), flags=('made',))
        A.box('fabric_bedding', px, top - 0.01, pz, pw, 0.12, 0.38, 0xf4f0e8, False, r=0.055, ry=0.15 * (sx or 1), rx=-0.08, skip=('ny',), flags=('unmade',))
    for k, bm in enumerate(BLANKETS):
        tn = bm == 'fabric_bedding'
        ch = ('pb%d' % k,)
        z0, zl = D * 0.17, D * 0.62
        A.box(bm, 0, top - 0.015, z0, W - 0.04, 0.08, zl, None, tn, r=0.03, skip=('ny',), flags=('made',) + ch)      # laid over the lower three quarters
        for sx in (-1, 1): A.box(bm, sx * (W - 0.04) / 2, y0 + 0.02, z0, 0.014, 0.2, zl - 0.02, shade(0.92) if tn else None, tn, flags=('made',) + ch)
        A.box(bm, 0, y0 + 0.02, z0 + zl / 2, W - 0.04, 0.2, 0.014, shade(0.92) if tn else None, tn, flags=('made',) + ch)
        A.box(bm, W * 0.1, top - 0.015, D * 0.2, W * 0.66, 0.09, D * 0.5, None, tn, r=0.04, ry=0.12, skip=('ny',), flags=('unmade',) + ch)   # pushed down, rumpled
        A.hcyl(bm, W * 0.1, top + 0.06, D * 0.0, 0.055, W * 0.55, 'x', 10, None, tn, flags=('unmade',) + ch)


@asset('home', 'bed_single', 'bed_double', 'bed_double_wood')
def wood_bed(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    head = c.get('head', 0.78)
    fancy = key == 'bed_double_wood'
    foot = 0.6 if fancy else 0.42
    ps = 0.07
    for sx in (-1, 1):
        x = sx * (W / 2 - ps / 2)
        A.box(m, x, 0, -D / 2 + ps / 2, ps, head, ps, shade(0.95), False, r=0.008)                                          # head posts
        A.box(m, x, 0, D / 2 - ps / 2, ps, foot, ps, shade(0.95), False, r=0.008)                                            # foot posts
        if fancy:
            A.sph(m, x, head + 0.015, -D / 2 + ps / 2, 0.04, 0.045, 0.04, 10, shade(0.9))
            A.sph(m, x, foot + 0.015, D / 2 - ps / 2, 0.036, 0.04, 0.036, 10, shade(0.9))
        A.box(m, x, 0.16, 0.0, 0.035, 0.15, D - 2 * ps, shade(0.9), False)                                                   # side rails
    iw = W - 2 * ps
    A.box(m, 0, head - 0.12, -D / 2 + 0.03, W - 0.04, 0.11, 0.05, shade(0.97), False, r=0.016)                               # headboard top rail
    A.box(m, 0, 0.14, -D / 2 + 0.03, iw, 0.1, 0.035, shade(0.9), False)
    A.box(m, 0, 0.24, -D / 2 + 0.03, iw, head - 0.37, 0.03, shade(0.94), False)                                             # headboard panel
    for sx in (-1, 1): A.box(m, sx * iw * 0.25, 0.3, -D / 2 + 0.05, iw * 0.38, head - 0.55, 0.012, shade(0.82), False, r=0.004)   # raised panels
    A.box(m, 0, foot - 0.11, D / 2 - 0.03, W - 0.04, 0.1, 0.045, shade(0.97), False, r=0.016)                                # footboard
    A.box(m, 0, 0.14, D / 2 - 0.03, iw, foot - 0.27, 0.03, shade(0.92), False)
    A.box(m, 0, 0.27, 0.0, iw, 0.03, D - 2 * ps, shade(0.8), False)                                                         # slats
    bedding(A, W, D, 0.29)


@asset('home', 'bed_single_metal')
def metal_bed(A, key, c):
    W, H, D = A.W, A.H, A.D
    top, low = H, 0.58
    for k, fc in enumerate(FRAME_COLS):
        ch = ('pf%d' % k,)
        for sx in (-1, 1):
            x = sx * (W / 2 - 0.03)
            A.tube('metal_painted', [(x, 0, -D / 2 + 0.03), (x, top, -D / 2 + 0.03)], 0.017, 8, fc, flags=ch)               # head posts
            A.tube('metal_painted', [(x, 0, D / 2 - 0.03), (x, low, D / 2 - 0.03)], 0.017, 8, fc, flags=ch)                 # foot posts
            A.tube('metal_painted', [(x, 0.3, -D / 2 + 0.03), (x, 0.3, D / 2 - 0.03)], 0.012, 6, fc, flags=ch)               # side rails
        for ly in (top - 0.04, 0.46):
            A.tube('metal_painted', [(-W / 2 + 0.03, ly, -D / 2 + 0.03), (W / 2 - 0.03, ly, -D / 2 + 0.03)], 0.013, 6, fc, flags=ch)
        for ly in (low - 0.04, 0.3):
            A.tube('metal_painted', [(-W / 2 + 0.03, ly, D / 2 - 0.03), (W / 2 - 0.03, ly, D / 2 - 0.03)], 0.013, 6, fc, flags=ch)
        for i in range(1, 7):
            x = -W / 2 + 0.03 + i * (W - 0.06) / 7
            A.tube('metal_painted', [(x, 0.46, -D / 2 + 0.03), (x, top - 0.04, -D / 2 + 0.03)], 0.007, 5, fc, flags=ch)
        for i in range(1, 5):
            x = -W / 2 + 0.03 + i * (W - 0.06) / 5
            A.tube('metal_painted', [(x, 0.3, D / 2 - 0.03), (x, low - 0.04, D / 2 - 0.03)], 0.007, 5, fc, flags=ch)
        for sx in (-1, 1):
            A.sph('metal_painted', sx * (W / 2 - 0.03), top + 0.015, -D / 2 + 0.03, 0.024, 0.024, 0.024, 8, fc, flags=ch)
    A.box('metal_dark', 0, 0.3, 0.0, W - 0.08, 0.025, D - 0.08, 0x3a3a3c, False)                                              # the springs
    bedding(A, W, D, 0.32)


# ------------------------------------------------------------------------------------------------------ wardrobes, dresser, nightstand
@asset('home', 'wardrobe_2', 'wardrobe_3')
def wardrobe(A, key, c):
    W, H, D = A.W, A.H, A.D
    m, dn = c['mat'], c.get('doors', 2)
    A.box(m, 0, 0, 0, W - 0.06, 0.07, D - 0.06, shade(0.45), True, skip=('ny',))                         # recessed plinth
    A.box(m, 0, 0.07, 0, W, H - 0.13, D, None, True, r=0.008)                                            # carcass
    A.box(m, 0, H - 0.06, 0, W + 0.03, 0.06, D + 0.02, shade(0.88), True, r=0.01)                        # cornice
    A.box(m, 0, H - 0.075, D / 2 + 0.002, W + 0.0, 0.02, 0.02, shade(0.8), True)
    dw = W / dn
    for i in range(dn):
        x = -W / 2 + dw * (i + 0.5)
        A.box(m, x, 0.09, D / 2 - 0.004, dw - 0.012, H - 0.17, 0.02, shade(0.96), True, r=0.004)          # door
        A.box(m, x, 0.16, D / 2 + 0.01, dw - 0.14, (H - 0.17) * 0.5, 0.008, shade(0.85), True)           # raised panels
        A.box(m, x, 0.16 + (H - 0.17) * 0.55, D / 2 + 0.01, dw - 0.14, (H - 0.17) * 0.3, 0.008, shade(0.85), True)
        hx = x + (1 if i % 2 == 0 else -1) * (dw / 2 - 0.045)
        A.box('metal_chrome', hx, H * 0.46, D / 2 + 0.018, 0.016, 0.16, 0.022, None, False, r=0.005)
    if c['tags'] and 'wardrobe' in c['tags'] and H > 1.6:
        x = -W / 2 + dw * (dn - 0.5)                                                                     # a long mirror on the last door
        A.box('mirror', x, H * 0.18, D / 2 + 0.0165, dw * 0.62, H * 0.58, 0.003, None, False)
        A.box('metal_chrome', x, H * 0.18 - 0.012, D / 2 + 0.0155, dw * 0.62 + 0.024, 0.012, 0.004, None, False)
    for sx in (-1, 1):
        for sz in (-1, 1): A.sph('wood_dark', sx * (W / 2 - 0.06), 0.02, sz * (D / 2 - 0.06), 0.03, 0.03, 0.03, 8)


@asset('home', 'dresser_4')
def dresser(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    for sx in (-1, 1):
        for sz in (-1, 1): A.cyl(m, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 0.022, 0.09, 8, r1=0.03, col=shade(0.85), tint=True, caps=False)
    A.box(m, 0, 0.08, 0, W, H - 0.08 - 0.03, D, None, True, r=0.008)
    A.box(m, 0, H - 0.03, 0, W + 0.025, 0.03, D + 0.025, shade(0.9), True, r=0.01)                      # the top, overhanging
    rows = 4
    dh = (H - 0.08 - 0.03 - 0.04) / rows
    for i in range(rows):
        y = 0.1 + i * dh
        A.box(m, 0, y, D / 2 - 0.006, W - 0.06, dh - 0.01, 0.02, shade(0.97), True, r=0.004)
        A.box(m, 0, y + 0.03, D / 2 + 0.006, W - 0.16, dh - 0.07, 0.006, shade(0.86), True)
        for sx in (-1, 1): A.sph('wood_dark', sx * W * 0.2, y + dh * 0.5, D / 2 + 0.018, 0.017, 0.017, 0.012, 6, shade(0.4))


@asset('home', 'nightstand_a')
def nightstand(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    for sx in (-1, 1):
        for sz in (-1, 1): A.cyl(m, sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03), 0.014, 0.18, 6, r1=0.019, col=shade(0.8), tint=True, caps=False)
    A.box(m, 0, 0.16, 0, W, 0.04, D, shade(0.95), True, r=0.006)                                           # lower shelf
    A.box(m, 0, 0.2, -D / 2 + 0.01, W - 0.04, H - 0.26, 0.015, shade(0.8), True)                           # back
    for sx in (-1, 1): A.box(m, sx * (W / 2 - 0.011), 0.2, 0.0, 0.022, H - 0.26, D - 0.02, shade(0.95), True)
    A.box(m, 0, H - 0.04, 0, W + 0.02, 0.04, D + 0.02, None, True, r=0.008)                                # top
    A.box(m, 0, H - 0.21, D / 2 - 0.012, W - 0.05, 0.16, 0.02, shade(0.97), True, r=0.004)                 # the drawer
    A.sph('wood_dark', 0, H - 0.13, D / 2 + 0.008, 0.016, 0.016, 0.012, 8, shade(0.4))
    A.box(FLAT, 0, 0.2, 0.0, W - 0.08, 0.002, D - 0.08, 0x2a2a2c, False)


# ------------------------------------------------------------------------------------------------------ kitchen
@asset('home', 'stove_gas')
def stove(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    A.box('metal_dark', 0, 0, 0, W - 0.06, 0.06, D - 0.06, None, False, skip=('ny',))
    A.box(m, 0, 0.06, 0, W, H - 0.11, D, None, False, r=0.012)
    A.box('metal_dark', 0, H - 0.05, 0, W, 0.05, D, None, False, r=0.006)                                  # hob plate
    for sx in (-1, 1):
        for sz in (-1, 1):                                                                                  # four burners: ring, cap, pan support
            x, z = sx * W * 0.22, sz * D * 0.2
            r = 0.055 if (sx > 0) == (sz > 0) else 0.045
            A.lathe('metal_chrome', x, H, z, [(r, 0.0), (r, 0.008), (r * 0.62, 0.008)], 12)                                  # the ring
            A.lathe('metal_dark', x, H + 0.008, z, [(r * 0.62, 0.0), (r * 0.62, 0.016), (0.0, 0.016)], 10, 0x1c1c1e)         # the burner cap
            for a in (0.0, math.pi / 2): A.box('metal_dark', x, H + 0.012, z, 0.2, 0.012, 0.014, 0x232325, False, ry=a)
    A.box(m, 0, 0.1, D / 2 - 0.004, W - 0.04, 0.12, 0.018, None, False, r=0.006)                         # lower drawer
    A.box('metal_chrome', 0, 0.17, D / 2 + 0.018, W * 0.4, 0.014, 0.018, None, False, r=0.005)
    A.box(m, 0, 0.24, D / 2 - 0.004, W - 0.04, H - 0.5, 0.02, None, False, r=0.006)                      # oven door
    A.box('metal_dark', 0, 0.3, D / 2 + 0.008, W - 0.2, H - 0.62, 0.004, 0x15171b, False)                 # its window
    A.hcyl('metal_chrome', 0, H - 0.22, D / 2 + 0.04, 0.011, W - 0.16, 'x', 10)                           # the handle
    for sx in (-1, 1): A.cyl('metal_chrome', sx * (W / 2 - 0.1), H - 0.22, D / 2 + 0.006, 0.008, 0.03, 8, rx=math.pi / 2)
    A.box(m, 0, H - 0.2, D / 2 - 0.004, W - 0.04, 0.15, 0.02, None, False, r=0.006)                       # control panel
    for i in range(-2, 3): A.cyl('metal_dark', i * 0.095, H - 0.145, D / 2 + 0.004, 0.019, 0.026, 8, col=0x1c1c1e, rx=math.pi / 2)
    A.box(FLAT, 0.0, H - 0.075, D / 2 + 0.008, 0.07, 0.014, 0.004, 0x40e060, False)


@asset('home', 'fridge')
def fridge(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    split = 0.62
    A.box('metal_dark', 0, 0, 0, W - 0.08, 0.04, D - 0.08, None, False, skip=('ny',))
    A.box(m, 0, 0.03, 0, W, H - 0.03, D - 0.02, None, False, r=0.03, skip=('ny',))                    # the cabinet
    lo_h, up_y = H * split - 0.05 - 0.004, H * split + 0.004
    A.box(m, 0, 0.05, D / 2 - 0.022, W - 0.015, lo_h, 0.03, None, False, r=0.02)                       # fridge door
    A.box(m, 0, up_y, D / 2 - 0.022, W - 0.015, H - up_y - 0.012, 0.03, None, False, r=0.02)           # freezer door
    for y0, hh in ((0.05 + lo_h * 0.5 - 0.1, 0.3), (up_y + 0.06, 0.2)):                                  # vertical bar handles
        A.box('metal_chrome', W / 2 - 0.07, y0, D / 2 + 0.032, 0.02, hh, 0.016, None, False, r=0.006)
        for dy in (0.02, hh - 0.04): A.box('metal_chrome', W / 2 - 0.07, y0 + dy, D / 2 + 0.014, 0.014, 0.02, 0.02, None, False)
    A.box('metal_chrome', -W * 0.22, H - 0.17, D / 2 + 0.0085, 0.08, 0.016, 0.003, None, False)           # badge
    A.box('metal_dark', 0.0, H * split - 0.002, D / 2 - 0.004, W - 0.02, 0.008, 0.01, None, False)
    for k in range(5):                                                                                    # magnets on the door (variant: the record asks for them)
        A.box(FLAT, -W * 0.28 + (k * 0.37 % 1) * W * 0.45, H * 0.5 + k * 0.09, D / 2 + 0.0105, 0.05 + (k % 3) * 0.012, 0.05, 0.008,
              (0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xf0efe8)[k], False, r=0.003, flags=('magnets',))


@asset('home', 'counter_base', 'counter_base_long', 'sink_kitchen')
def kitchen_base(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    sink = key == 'sink_kitchen'
    A.box('metal_dark', 0, 0, 0, W - 0.04, 0.08, D - 0.06, None, False, skip=('ny',))
    A.box(m, 0, 0.08, 0, W, H - 0.04 - 0.08, D, None, True, r=0.006)
    k = max(1, round(W / 0.6))
    dw = W / k
    for i in range(k):
        x = -W / 2 + dw * (i + 0.5)
        A.box(m, x, 0.1, D / 2 - 0.004, dw - 0.014, H - 0.04 - 0.14, 0.02, shade(0.97), True, r=0.004)
        A.box(m, x, 0.17, D / 2 + 0.01, dw - 0.15, H - 0.04 - 0.28, 0.006, shade(0.86), True)
        hx = x + (dw / 2 - 0.06) * (1 if i % 2 == 0 else -1)
        A.box('metal_chrome', hx, H - 0.04 - 0.22, D / 2 + 0.02, 0.016, 0.12, 0.022, None, False, r=0.005)
    A.box('formica', 0, H - 0.04, 0, W + 0.02, 0.04, D + 0.02, 0xd8d0c0, False, r=0.006)                   # worktop
    if sink:
        sw, sd = W * 0.38, D * 0.7
        A.box('metal_chrome', -W * 0.17, H - 0.0, 0.02, sw + 0.03, 0.006, sd + 0.03, None, False, r=0.003)     # steel rim
        A.box('metal_dark', -W * 0.17, H + 0.004, 0.02, sw, 0.002, sd, 0x55595c, False)                      # the bowl
        tx, tz = -W * 0.17, -D / 2 + 0.07                                                                    # gooseneck tap: up, over, spout down
        A.tube('metal_chrome', [(tx, H, tz), (tx, H + 0.12, tz)] + [(tx, H + 0.12 + 0.055 * math.sin(p), tz + 0.055 - 0.055 * math.cos(p)) for p in (0.6, 1.2, 1.57, 2.0, 2.6)]
               + [(tx, H + 0.1, tz + 0.115)], 0.011, 8)
        A.box(FLAT, W * 0.3, H, 0.02, 0.3, 0.03, 0.42, 0xe4e0d4, False, r=0.004)                             # plastic dish drainer
        for i in range(5): A.box(FLAT, W * 0.3, H + 0.03, -0.17 + i * 0.085, 0.28, 0.006, 0.01, 0xc8c4b8, False)


@asset('home', 'kitchen_upper')
def kitchen_upper(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    A.box(m, 0, 0, 0, W, H, D, None, True, r=0.006)
    k = max(2, round(W / 0.45))
    dw = W / k
    for i in range(k):
        x = -W / 2 + dw * (i + 0.5)
        A.box(m, x, 0.02, D / 2 - 0.002, dw - 0.014, H - 0.04, 0.018, shade(0.97), True, r=0.004)
        A.box(m, x, 0.07, D / 2 + 0.011, dw - 0.12, H - 0.14, 0.006, shade(0.86), True)
        hx = x + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        A.box('metal_chrome', hx, 0.06, D / 2 + 0.018, 0.016, 0.1, 0.02, None, False, r=0.005)


# ------------------------------------------------------------------------------------------------------ bathroom
@asset('home', 'toilet')
def toilet(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = 'ceramic_white'
    A.box(m, 0, 0, -0.14, 0.2, 0.3, 0.2, None, False, skip=('ny',))                                          # the trap, against the wall
    A.lathe(m, 0, 0.17, 0.05, [(0, 0), (0.11, 0), (0.15, 0.04), (0.19, 0.12), (0.2, 0.2), (0.19, 0.23), (0.0, 0.23)], 14, None, False, crease=75, scl=(1.0, 1.0, 1.4))   # the bowl
    A.lathe(m, 0, 0.395, 0.05, [(0, 0), (0.2, 0), (0.205, 0.012), (0.2, 0.024), (0, 0.026)], 16, 0xf6f6f2, False, crease=60, scl=(1.0, 1.0, 1.4), hero=True)             # the seat and its lid, down (the round outline people look at: its segments stay)
    A.lathe(m, 0, 0.395, 0.05, [(0, 0.022), (0.17, 0.022), (0.175, 0.03), (0.16, 0.04), (0, 0.045)], 14, 0xfafaf6, False, crease=60, scl=(1.0, 1.0, 1.35), hero=True)
    A.box(m, 0, 0.4, -D / 2 + 0.085, W - 0.02, 0.36, 0.17, None, False, r=0.025, skip=('ny', 'nz'))          # cistern (its back is the wall, its underside is behind the bowl)
    A.box(m, 0, H - 0.03, -D / 2 + 0.085, W + 0.012, 0.03, 0.19, 0xfafaf6, False, r=0.008)               # its lid
    A.cyl('metal_chrome', 0.1, H, -D / 2 + 0.085, 0.022, 0.012, 10)                                          # the flush button


@asset('home', 'basin_pedestal', 'basin_vanity')
def basin(A, key, c):
    W, H, D = A.W, A.H, A.D
    vanity = key == 'basin_vanity'
    m = 'ceramic_white'
    if vanity:
        A.box('wood_painted', 0, 0, 0, W, H - 0.15, D, 0xe8e4da, False, r=0.006, skip=('ny',))
        for sx in (-1, 1):
            A.box('wood_painted', sx * W * 0.245, 0.06, D / 2 - 0.002, W * 0.46, H - 0.28, 0.016, 0xf0ece2, False, r=0.004)
            A.sph('metal_chrome', sx * 0.04, H * 0.5, D / 2 + 0.018, 0.014, 0.014, 0.012, 8)
    else:
        A.lathe(m, 0, 0, -D * 0.1, [(0, 0), (0.1, 0), (0.1, 0.02), (0.065, 0.06), (0.06, 0.4), (0.09, 0.62), (0.0, 0.62)], 16, None, False, crease=60)
    A.box(m, 0, H - 0.15, 0, W, 0.15, D, None, False, r=0.05, skip=('ny',) if not vanity else ())
    A.lathe(m, 0, H - 0.002, 0.02, [(0, 0), (0.19, 0), (0.2, 0.003), (0, 0.003)], 22, 0xdedcd6, False, scl=(W / 0.42, 1.0, D / 0.36 * 0.78), drop0=True)        # the dish (its underside lies on the basin top)
    A.tube('metal_chrome', [(0, H, -D / 2 + 0.07), (0, H + 0.07, -D / 2 + 0.07), (0, H + 0.1, -D / 2 + 0.1), (0, H + 0.1, -D / 2 + 0.15), (0, H + 0.085, -D / 2 + 0.17)], 0.011, 8)
    for sx in (-1, 1): A.cyl('metal_chrome', sx * 0.09, H, -D / 2 + 0.08, 0.014, 0.04, 8, r1=0.01)

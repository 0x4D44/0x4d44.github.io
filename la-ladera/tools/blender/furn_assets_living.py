"""Living-room hero furniture (A3): sofas, armchairs, chairs, tables, TV stand and TVs, lamps, the ceiling-fan housing.
Every builder draws in the game frame (see furn_lib.py): x right, y up from the floor, +z = front; sizes come from the catalogue entry `c`.
A lathe profile is walked from the bottom up (outward normal = (dy, -dr)); a thin shell is walked up the outside and back down the inside."""
import math
from furn_lib import asset, shade, mulc, mixc

FLAT = 'plastic_solid'
BLACK, CREAM = 0x1c1c1e, 0xe9e2d2


# ------------------------------------------------------------------------------------------------------ sofas and armchairs
@asset('living', 'sofa_3_vinyl', 'sofa_3_fabric', 'sofa_2_fabric', 'sofa_2_vinyl', 'armchair_vinyl', 'armchair_fabric')
def sofa(A, key, c):
    W, H, D = A.W, A.H, A.D
    m, n = c['mat'], c['seat'][1]
    chair = key.startswith('armchair')
    arm = 0.16 if chair else 0.17
    seat = c['seat'][0]
    fab = m == 'fabric_sofa'
    for sx in (-1, 1):                                                                   # turned wooden feet
        for sz in (-1, 1):
            A.cyl('wood_dark', sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1), 0.03, 0.08, 8, r1=0.022, caps=False)
    A.box(m, 0, 0.07, 0, W, 0.2, D, shade(0.85), True, r=0.03, skip=('ny',))              # base
    A.box(m, 0, 0.07, -D / 2 + 0.085, W, H - 0.1, 0.17, shade(0.9), True, r=0.055)       # back
    for sx in (-1, 1):                                                                   # rolled arms
        ax = sx * (W / 2 - arm / 2)
        A.box(m, ax, 0.07, 0.0, arm, 0.49, D, shade(0.92), True, r=0.04)
        A.hcyl(m, ax, 0.56, 0.0, arm / 2, D - 0.04, 'z', 14, shade(0.97), True)
    iw = (W - 2 * arm) / n
    for i in range(n):
        x = -W / 2 + arm + iw * (i + 0.5)
        A.box(m, x, 0.27, 0.1, iw - 0.012, seat - 0.27, D - 0.2, None, True, r=0.05)                             # seat cushion
        A.box(m, x, 0.4, -D / 2 + 0.27, iw - 0.016, H - 0.46, 0.17, shade(0.95), True, r=0.06, rx=-0.14)         # back cushion
    if fab:                                                                              # crochet covers on the back and the arms
        A.box('crochet_cover', 0, H - 0.026, -D / 2 + 0.085, min(0.55, W * 0.4), 0.012, 0.2, None, False, r=0.004)
        for sx in (-1, 1): A.box('crochet_cover', sx * (W / 2 - arm / 2), 0.638, 0.0, 0.15, 0.012, 0.3, None, False, r=0.004)
    else:                                                                                # vinyl: button-tufted back cushions
        for i in range(n):
            x = -W / 2 + arm + iw * (i + 0.5)
            for dx in ((-0.1, 0.1) if iw > 0.4 else (0.0,)):
                A.sph(FLAT, x + dx, 0.62, -D / 2 + 0.352, 0.012, 0.012, 0.008, 6, shade(0.3))
    if n >= 3:                                                                           # a throw pillow in the corner (two colourways)
        for k, colr in enumerate((0xb23a2a, 0x2f6fbf)):
            A.box('fabric_sofa', -W / 2 + arm + 0.17, seat - 0.01, -D / 2 + 0.36, 0.36, 0.34, 0.12, colr, False, r=0.055, rx=-0.55, ry=0.25, flags=('pa%d' % k,))


# ------------------------------------------------------------------------------------------------------ chairs
@asset('living', 'chair_plastic', 'chair_plastic_arm')
def chair_plastic(A, key, c):
    W, H, D = A.W, A.H, A.D
    sh = c['seat'][0]
    arms = key.endswith('arm')
    A.box(FLAT, 0, sh - 0.035, 0.01, W - 0.01, 0.035, D - 0.04, None, True, r=0.014)                         # moulded seat
    A.box(FLAT, 0, sh - 0.075, 0.01, W - 0.1, 0.045, D - 0.14, shade(0.9), True, skip=('py',))               # the rim under the seat
    for k in range(4):                                                                   # slotted backrest, leaning back
        x = -W / 2 + 0.07 + k * (W - 0.14) / 3
        A.box(FLAT, x, sh + 0.02, -D / 2 + 0.05, 0.075, H - sh - 0.04, 0.025, None, True, r=0.008, rx=-0.16)
    A.box(FLAT, 0, H - 0.075, -D / 2 + 0.01, W - 0.01, 0.07, 0.03, None, True, r=0.012, rx=-0.16)            # top rail of the back
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.045), sz * (D / 2 - 0.05)
            A.cyl(FLAT, x, 0, z, 0.017, sh - 0.07, 8, r1=0.024, col=shade(0.88), tint=True, caps=False, rz=-sx * 0.05, rx=sz * 0.04)
    if arms:
        for sx in (-1, 1):
            A.box(FLAT, sx * (W / 2 - 0.02), sh, 0.0, 0.04, 0.045, D * 0.7, None, True, r=0.016)
            A.box(FLAT, sx * (W / 2 - 0.02), sh - 0.01, -D * 0.2, 0.035, 0.2, 0.035, shade(0.92), True, r=0.01)


@asset('living', 'chair_wood', 'chair_wood_padded')
def chair_wood(A, key, c):
    W, H, D = A.W, A.H, A.D
    sh, m = c['seat'][0], c['mat']
    padded = key.endswith('padded')
    t = 0.036
    for sx in (-1, 1):
        A.box(m, sx * (W / 2 - t / 2 - 0.01), 0, D / 2 - t / 2 - 0.01, t, sh - 0.03, t, shade(0.9), True, skip=('ny',))          # front legs
        A.box(m, sx * (W / 2 - t / 2 - 0.01), 0, -D / 2 + t / 2 + 0.01, t, H, t, shade(0.9), True, skip=('ny',))                 # rear legs run up into the back posts
        A.box(m, sx * (W / 2 - t / 2 - 0.01), 0.2, 0.0, 0.022, 0.026, D - 0.07, shade(0.85), True)                                # side stretchers
    A.box(m, 0, 0.22, D / 2 - t / 2 - 0.01, W - 0.07, 0.022, 0.022, shade(0.85), True)
    A.box(m, 0, sh - 0.035, 0.0, W - 0.01, 0.035, D - 0.01, None, True, r=0.008)                                  # seat
    if padded: A.box('vinyl_sofa', 0, sh, 0.01, W - 0.05, 0.045, D - 0.06, None, True, r=0.02)
    for ly, hh in ((H - 0.13, 0.09), (sh + 0.1, 0.07)):                                  # back rails
        A.box(m, 0, ly, -D / 2 + t / 2 + 0.01, W - 2 * t, hh, 0.024, None, True, r=0.005)
    for k in range(3):
        A.box(m, -0.1 + k * 0.1, sh + 0.1, -D / 2 + t / 2 + 0.01, 0.034, H - sh - 0.22, 0.02, shade(0.92), True)


# ------------------------------------------------------------------------------------------------------ tables
@asset('living', 'table_plastic')
def table_plastic(A, key, c):
    W, H, D = A.W, A.H, A.D
    A.box(FLAT, 0, H - 0.035, 0, W, 0.035, D, None, True, r=0.014)
    A.box(FLAT, 0, H - 0.085, 0, W - 0.12, 0.05, D - 0.12, shade(0.9), True, skip=('py',))
    for sx in (-1, 1):
        for sz in (-1, 1):
            A.cyl(FLAT, sx * (W / 2 - 0.07), 0, sz * (D / 2 - 0.07), 0.024, H - 0.07, 10, r1=0.035, col=shade(0.9), tint=True, caps=False)


@asset('living', 'table_formica_4', 'table_formica_6')
def table_formica(A, key, c):
    W, H, D = A.W, A.H, A.D
    A.box('formica', 0, H - 0.04, 0, W, 0.04, D, None, True, r=0.008)                    # the top
    cloth = c.get('top', 'oilcloth_check')
    A.box(cloth, 0, H, 0, W + 0.03, 0.012, D + 0.03, None, False, r=0.005)                # an oilcloth over it, hanging a little over the edge
    for sz in (-1, 1): A.box(cloth, 0, H - 0.075, sz * (D / 2 + 0.0105), W + 0.03, 0.08, 0.006, None, False)
    for sx in (-1, 1): A.box(cloth, sx * (W / 2 + 0.0105), H - 0.075, 0, 0.006, 0.08, D + 0.03, None, False)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.06), sz * (D / 2 - 0.06)
            A.cyl('metal_chrome', x, 0.016, z, 0.016, H - 0.066, 10, r1=0.019, caps=False)
            A.cyl(FLAT, x, 0, z, 0.019, 0.018, 10, col=0x1c1c1c)


@asset('living', 'table_wood_6')
def table_wood(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    A.box(m, 0, H - 0.045, 0, W, 0.045, D, None, True, r=0.012)
    for sz in (-1, 1): A.box(m, 0, H - 0.14, sz * (D / 2 - 0.07), W - 0.2, 0.095, 0.03, shade(0.9), True)    # aprons
    for sx in (-1, 1): A.box(m, sx * (W / 2 - 0.1), H - 0.14, 0, 0.03, 0.095, D - 0.14, shade(0.9), True)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.1), sz * (D / 2 - 0.07)                               # turned legs
            A.lathe(m, x, 0, z, [(0, 0), (0.022, 0), (0.026, 0.05), (0.03, 0.3), (0.036, 0.42), (0.03, 0.46), (0.04, 0.5), (0.04, 0.58), (0.0, 0.58)], 10, shade(0.88), True, crease=70)
            A.box(m, x, H - 0.045 - 0.14, z, 0.062, 0.14, 0.062, shade(0.9), True, skip=('ny',))


# ------------------------------------------------------------------------------------------------------ TV and its stand
@asset('living', 'tv_stand')
def tv_stand(A, key, c):
    W, H, D = A.W, A.H, A.D
    m = c['mat']
    cw = W * 0.4                                                                          # the open bay in the middle
    for sx in (-1, 1):
        for sz in (-1, 1): A.cyl('wood_dark', sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.05), 0.026, 0.07, 8, r1=0.018, caps=False)
    A.box(m, 0, 0.065, 0, W, 0.02, D, shade(0.9), True, skip=('ny',))                                  # bottom board
    A.box(m, 0, H - 0.018, 0, W + 0.02, 0.018, D + 0.02, shade(0.88), True, r=0.006)                  # the top, overhanging a little
    for sx in (-1, 1):
        A.box(m, sx * (W / 2 - 0.009), 0.085, 0, 0.018, H - 0.103, D, None, True)                      # the two ends
        A.box(m, sx * cw / 2, 0.085, 0, 0.018, H - 0.103, D - 0.02, None, True)                        # the dividers around the bay
    A.box(m, 0, 0.085, -D / 2 + 0.01, W - 0.04, H - 0.103, 0.014, shade(0.85), True)                    # back
    A.box(m, 0, 0.23, 0.0, cw - 0.018, 0.016, D - 0.04, shade(0.9), True)                              # shelf in the bay
    A.box(FLAT, 0, 0.246, 0.0, cw - 0.1, 0.05, D * 0.55, 0x24262a, False, r=0.006)                     # a decoder box on it
    A.box(FLAT, 0.1, 0.273, D * 0.275, 0.012, 0.007, 0.004, 0x40e060, False)                           # its little green light
    A.box(FLAT, 0, 0.105, 0.04, cw - 0.1, 0.07, D * 0.5, 0x2a2a2d, False, r=0.006)                     # a second box below
    for sx in (-1, 1):                                                                   # the two doors with a recessed panel and a bar handle
        dx = sx * (cw / 2 + (W - cw) / 4)
        dw = (W - cw) / 2 - 0.022
        A.box(m, dx, 0.088, D / 2 - 0.009, dw, H - 0.108, 0.016, shade(0.96), True, r=0.004)
        A.box(m, dx, 0.13, D / 2 + 0.0, dw - 0.08, H - 0.19, 0.006, shade(0.82), True)
        A.box('metal_chrome', dx - sx * (dw / 2 - 0.035), H * 0.45, D / 2 + 0.006, 0.012, 0.11, 0.012, None, False, r=0.004)


@asset('living', 'tv_flat', 'tv_wall')
def tv_flat(A, key, c):
    W, H, D = A.W, A.H, A.D
    wall = key == 'tv_wall'
    y0 = 0.0 if wall else 0.07
    body = 0x15171b
    A.box(FLAT, 0, y0, -0.005, W, H - y0, D - 0.016, body, False, r=0.008)                                   # the panel
    A.box(FLAT, 0, y0 + 0.08, -D / 2 + 0.0, W * 0.5, (H - y0) * 0.52, 0.02, 0x101216, False, r=0.01)         # the electronics hump at the back
    t = 0.014
    for (cx, cy, sx, sy) in ((0, y0, W, t), (0, H - t, W, t), (-W / 2 + t / 2, y0 + t, t, H - y0 - 2 * t), (W / 2 - t / 2, y0 + t, t, H - y0 - 2 * t)):
        A.box(FLAT, cx, cy, D / 2 - 0.007, sx, sy, 0.014, body, False, r=0.003)                          # bezel
    for k, scr in enumerate(('tv_screen_a', 'tv_screen_b')):
        A.box(scr, 0, y0 + t, D / 2 - 0.004, W - 2 * t, H - y0 - 2 * t, 0.008, None, False, flags=('pa%d' % k,))
    A.box(FLAT, W * 0.38, y0 + 0.003, D / 2 - 0.0, 0.01, 0.005, 0.003, 0xff3020, False)                  # standby light
    if not wall:
        A.box(FLAT, 0, 0.012, -0.01, 0.07, y0 - 0.012, 0.04, body, False)                                # neck
        A.box(FLAT, 0, 0, 0, 0.3, 0.014, min(0.18, D), body, False, r=0.005)                                  # foot


@asset('living', 'tv_crt')
def tv_crt(A, key, c):
    W, H, D = A.W, A.H, A.D
    body = 0x2c2b2a
    A.box(FLAT, 0, 0.012, D / 2 - 0.12, W, H - 0.012, 0.24, body, False, r=0.025, m=2)                  # front cabinet
    A.box(FLAT, 0, 0.06, -0.11, W * 0.74, H * 0.74, 0.18, mulc(body, 0.85), False, r=0.02)              # the tube behind it
    A.box(FLAT, 0, 0.12, -D / 2 + 0.035, W * 0.4, H * 0.4, 0.07, mulc(body, 0.8), False, r=0.02)
    for sx in (-1, 1): A.box(FLAT, sx * (W / 2 - 0.06), 0, 0.0, 0.07, 0.012, D - 0.1, 0x151515, False)       # feet
    for k, scr in enumerate(('tv_screen_a', 'tv_screen_b')):
        A.sph(scr, -W * 0.07, H * 0.5, D / 2 - 0.01, W * 0.36, H * 0.38, 0.02, 16, flags=('pa%d' % k,))
    A.box(FLAT, W * 0.42, 0.09, D / 2 - 0.004, 0.06, 0.28, 0.008, 0x1c1c1e, False, r=0.003)             # control strip
    for k in range(3): A.cyl(FLAT, W * 0.42, 0.14 + k * 0.07, D / 2 + 0.0, 0.012, 0.012, 8, col=0x8a8a8a, rx=math.pi / 2)
    A.box(FLAT, W * 0.42, 0.1, D / 2 + 0.002, 0.04, 0.01, 0.003, 0x0a0a0a, False)
    A.box(FLAT, W * 0.35, H - 0.04, D / 2 + 0.0, 0.05, 0.004, 0.003, 0x9a9a9a, False)                   # brand plate


# ------------------------------------------------------------------------------------------------------ lamps
@asset('living', 'lamp_floor')
def lamp_floor(A, key, c):
    W, H, D = A.W, A.H, A.D
    A.lathe('metal_dark', 0, 0, 0, [(0, 0), (0.15, 0), (0.15, 0.012), (0.13, 0.026), (0.05, 0.04), (0.02, 0.05), (0, 0.05)], 20)
    A.cyl('metal_dark', 0, 0.04, 0, 0.011, 1.0, 8, caps=False)
    A.sph('metal_chrome', 0, 0.62, 0, 0.026, 0.026, 0.026, 10)
    A.cyl('metal_dark', 0, 1.0, 0, 0.03, 0.03, 10)
    y0, y1, rb, rt = H - 0.44, H - 0.02, 0.175, 0.105                                    # thin shade shell: seen from outside and from below
    A.lathe(c['mat'], 0, 0, 0, [(rb, y0), (rt, y1), (rt - 0.004, y1), (rb - 0.004, y0)], 24, None, True, crease=120)


@asset('living', 'lamp_table')
def lamp_table(A, key, c):
    W, H, D = A.W, A.H, A.D
    A.lathe('ceramic_white', 0, 0, 0, [(0, 0), (0.07, 0), (0.075, 0.015), (0.085, 0.07), (0.055, 0.15), (0.03, 0.19), (0.026, 0.215), (0, 0.215)], 18, 0xdad6c8, crease=70)
    A.cyl('metal_chrome', 0, 0.215, 0, 0.008, 0.06, 8, caps=False)
    y0, y1, rb, rt = H - 0.22, H - 0.01, 0.12, 0.07
    A.lathe(c['mat'], 0, 0, 0, [(rb, y0), (rt, y1), (rt - 0.004, y1), (rb - 0.004, y0)], 20, None, True, crease=120)


# ------------------------------------------------------------------------------------------------------ ceiling fan (the static housing; the blades are anim.js)
@asset('living', 'fan_ceiling')
def fan_ceiling(A, key, c):
    H = A.H
    A.lathe('metal_dark', 0, 0, 0, [(0.0, H - 0.03), (0.08, H - 0.034), (0.082, H - 0.026), (0.06, H - 0.006), (0.05, H), (0.0, H)], 18, 0xd8d0c0, crease=80)   # canopy
    A.cyl('metal_dark', 0, H - 0.1, 0, 0.012, 0.075, 8, col=0x2a2a2c, caps=False)                                                            # down-rod
    A.sph('metal_dark', 0, H - 0.09, 0, 0.026, 0.02, 0.026, 10, 0x2a2a2c)
    A.lathe('metal_dark', 0, 0, 0, [(0.0, 0.113), (0.06, 0.115), (0.075, 0.125), (0.1, 0.15), (0.108, 0.165), (0.1, 0.18), (0.065, 0.215), (0.035, 0.226), (0.0, 0.225)], 22,
            shade(0.55), True, crease=50)                                                                                                        # motor housing, tinted like the blades
    A.cyl('metal_dark', 0, 0.152, 0, 0.088, 0.02, 20, col=0x2a2a2c)                                                                          # blade-iron ring at the waist
    A.cyl('metal_dark', 0, 0.075, 0, 0.034, 0.045, 10, col=shade(0.55), tint=True)
    A.lathe('lamp_shade', 0, 0, 0, [(0.0, 0.0), (0.04, 0.0), (0.08, 0.012), (0.092, 0.045), (0.07, 0.078), (0.036, 0.095),
                                    (0.034, 0.092), (0.067, 0.075), (0.088, 0.045), (0.076, 0.015), (0.04, 0.003), (0.0, 0.003)], 22, 0xf4ead0, crease=70)         # frosted light-kit bowl


# ------------------------------------------------------------------------------------------------------ additional seating and work tables
@asset('living', 'chair_metal', 'rocking_chair', 'office_chair', 'stool_wood', 'stool_bar', 'stool_plastic', 'pouf', 'bench_wood', 'kneeler', 'bench_pew', 'bench_pew_short', 'waiting_row', 'barber_chair', 'shampoo_chair', 'desk_school')
def practical_seating(A, key, c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; seat=c.get('seat',[H,1])[0]
    if key=='pouf':
        A.box('fabric_sofa',0,0,0,W,H,D,None,True,r=.065)
        A.box('fabric_sofa',0,H-.025,0,W+.004,.018,D+.004,shade(.85),True,r=.05)
        return
    if key=='desk_school':
        sw=W*.67; z=-D*.26
        for sx in (-1,1):
            A.tube('metal_painted',[(sx*W*.4,0,-D*.42),(sx*W*.4,.43,-D*.42),(sx*W*.4,.43,D*.15),(sx*W*.4,H-.03,D*.3)],.014,8,col=0x416177)
            A.tube('metal_painted',[(sx*W*.4,0,D*.38),(sx*W*.4,H-.03,D*.3)],.014,8,col=0x416177)
        A.box('wood_pine',0,.4,z,sw,.035,D*.38,None,True,r=.009)
        A.box('wood_pine',0,.5,-D*.4,sw,.16,.025,None,True,r=.01)
        A.box('wood_pine',0,H-.03,D*.21,W,.03,D*.48,None,True,r=.015)
        return
    if key in ('barber_chair','shampoo_chair'):
        A.lathe('metal_chrome',0,0,0,[(0,0),(W*.43,0),(W*.43,.025),(.12,.06),(.08,.08),(.07,seat-.14),(0,seat-.14)],16)
        A.box(m,0,seat-.12,D*.03,W*.82,.12,D*.49,None,True,r=.04)
        A.box(m,0,seat-.04,-D*.22,W*.8,H-seat-.04,.13,None,True,r=.045,rx=-.12)
        for sx in (-1,1):
            A.tube('metal_chrome',[(sx*W*.43,seat-.04,D*.18),(sx*W*.43,seat+.18,D*.18),(sx*W*.43,seat+.18,-D*.22)],.014,8)
            A.box('vinyl_sofa',sx*W*.43,seat+.17,0,.085,.045,D*.44,None,True,r=.015)
        A.tube('metal_chrome',[(-W*.28,seat-.08,D*.22),(-W*.28,.18,D*.42),(W*.28,.18,D*.42),(W*.28,seat-.08,D*.22)],.015,8)
        A.box('rubber_black',0,.16,D*.4,W*.58,.04,D*.16)
        if key=='shampoo_chair':
            A.lathe('ceramic_white',0,H-.16,-D*.35,[(0,0),(.22,.04),(.25,.12),(.24,.15),(.2,.15),(.16,.06),(0,.035)],14,scl=(1,1,.55))
        else: A.box('vinyl_sofa',0,H-.12,-D*.23,W*.4,.12,.14,None,True,r=.03)
        return
    if key=='office_chair':
        A.cyl('metal_dark',0,.055,0,.035,seat-.09,10)
        for i in range(5):
            a=i*math.tau/5; x,z=math.cos(a)*W*.39,math.sin(a)*D*.39
            A.tube('plastic_solid',[(0,.12,0),(x,.065,z)],.018,6,col=BLACK)
            A.hcyl('rubber_black',x,.035,z,.035,.035,'x',8)
        A.box(FLAT,0,seat-.05,.04,W*.82,.05,D*.74,None,True,r=.035)
        A.box(FLAT,0,seat+.1,-D*.3,W*.72,H-seat-.1,.06,None,True,r=.035)
        A.box('metal_dark',0,seat-.01,-D*.33,.07,.18,.025)
        return
    if key=='waiting_row':
        A.hcyl('metal_dark',0,.35,0,.025,W*.92,'x',8)
        for x in (-W*.36,W*.36):
            A.box('metal_dark',x,0,0,.045,.36,.045)
            A.box('metal_dark',x,0,0,.09,.035,D*.8)
        for i in range(3):
            x=(i-1)*W/3
            A.box('metal_painted',x,.42,.03,W*.3,.03,D*.8,None,True,r=.012)
            A.box('metal_painted',x,.46,-D*.32,W*.3,H-.46,.025,None,True,r=.012)
            for j in range(4): A.box('metal_dark',x-W*.1+j*W*.065,.58,-D*.29,.012,.14,.003)
        return
    if key in ('bench_pew','bench_pew_short','bench_wood','kneeler'):
        sh=.45 if key.startswith('bench_pew') else H-.04
        for x in (-W*.38,W*.38):
            A.box(m,x,0,0,.075,sh,D*.82,None,True)
            if key.startswith('bench_pew'):
                A.box(m,x,sh,-D*.3,.07,H-sh,.09,None,True)
                A.box(m,x,sh+.16,0,.09,.04,D*.8,None,True,r=.007)
        A.box('vinyl_sofa' if key=='kneeler' else m,0,sh-.03,.02,W,.04,D*.8,None,True,r=.009)
        if key.startswith('bench_pew'):
            for y in (sh+.12,H-.22): A.box(m,0,y,-D*.34,W,.18,.04,None,True,r=.005)
        return
    stool=key.startswith('stool')
    if stool:
        round_=key in ('stool_bar','stool_wood')
        if round_: A.cyl(m,0,seat-.04,0,W/2,.04,16,col=shade(.97),tint=True)
        else: A.box(m,0,H-.03,0,W,.03,D,None,True,r=.01)
        A.legs4(m,W,D,seat-.035,.03,inset=.035,col=shade(.9),tint=True,round_=key=='stool_bar')
        for sz in (-1,1): A.box(m,0,seat*.35,sz*(D/2-.05),W-.1,.022,.022,None,True)
        if key=='stool_bar': A.box('plastic_solid',0,seat-.04,0,W*.9,.04,D*.9,None,True,r=.025)
        return
    # Metal side chair and timber rocker use a real open frame, never a solid proxy.
    rocking=key=='rocking_chair'; sh=seat
    for sx in (-1,1):
        if rocking:
            pts=[(sx*W*.4,.035+((j-5)/5)**2*.065,-D*.47+j*D*.094) for j in range(11)]
            A.tube(m,pts,.022,8)
        for sz in (-1,1):
            z=sz*D*(.27 if rocking else .4)
            A.box(m,sx*W*.4,.05 if rocking else 0,z,.035,sh-(.05 if rocking else 0),.035,None,True)
        A.box(m,sx*W*.4,sh,-D*.3,.035,H-sh,.035,None,True)
    A.box(m,0,sh-.03,0,W*.94,.03,D*.72,None,True,r=.007)
    for y in (sh+.09,H-.1): A.box(m,0,y,-D*.3,W*.88,.08,.028,None,True,r=.006)
    if rocking:
        for sx in (-1,1):
            A.box(m,sx*W*.44,sh+.16,0,.06,.03,D*.67,None,True,r=.006)
            A.box(m,sx*W*.44,sh,D*.2,.03,.17,.03,None,True)


@asset('living','coffee_table','side_table','cutting_table','folding_table','dough_table','table_pingpong','table_foosball','table_round_small','table_cafe_round','desk_wood','desk_student','desk_teacher','desk_office','sewing_table','workbench','workbench_metal','cobbler_bench')
def practical_tables(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; round_='round' in key; bench='workbench' in key or key=='cobbler_bench'
    if round_:
        A.cyl(m,0,H-.035,0,W/2,.035,20,col=shade(.98),tint=True)
        A.cyl('metal_dark',0,.03,0,.03,H-.065,10)
        for a in (0,math.tau/3,math.tau*2/3): A.tube('metal_dark',[(0,.12,0),(math.cos(a)*W*.4,.02,math.sin(a)*D*.4)],.018,6)
        return
    if key=='table_foosball':
        bd=D*.7  # catalogue depth includes the rods and grips
        A.legs4(m,W*.9,bd*.82,H-.24,.065,inset=.025,col=shade(.9),tint=True)
        A.box('plastic_solid',0,H-.19,0,W*.9,.025,bd*.84,0x356545)
        for sx in (-1,1): A.box(m,sx*(W/2-.035),H-.2,0,.07,.2,bd,None,True)
        for sz in (-1,1): A.box(m,0,H-.2,sz*(bd/2-.035),W,.2,.07,None,True)
        for i in range(6):
            x=-W*.35+i*W*.14
            A.hcyl('metal_chrome',x,H-.07,0,.008,D*.96,'z',8)
            A.hcyl('plastic_solid',x,H-.07,(-1 if i%2 else 1)*D*.44,.018,.08,'z',8,col=BLACK)
            for j in range(3): A.box('plastic_solid',x,H-.16,-bd*.25+j*bd*.25,.026,.12,.025,0xb9312d if i%2 else 0xe4c749)
        return
    A.box('formica' if key=='coffee_table' else m,0,H-.04,0,W,.04,D,None,True,r=.008)
    A.legs4('metal_dark' if key in ('folding_table','table_pingpong') else m,W,D,H-.04,.045 if not bench else .07,inset=.06,col=None,tint=not bench)
    for sz in (-1,1): A.box(m,0,H-.14,sz*(D/2-.06),W-.15,.09,.025,shade(.85),True)
    if key.startswith('desk') or key in ('sewing_table','cobbler_bench'):
        x=-W*.34
        A.box(m,x,.08,0,W*.25,H-.14,D*.9,None,True)
        for i in range(3):
            y=.13+i*(H-.2)/3
            A.box('metal_dark',x,y,D*.455,W*.22,.006,.004)
            A.box('metal_chrome',x,y+.08,D*.465,W*.08,.014,.014)
    if bench:
        A.box('wood_old',0,.16,0,W-.12,.03,D-.13)
        A.box('metal_dark',W*.31,H-.01,D*.3,.18,.13,.15)
        A.box('metal_steel',W*.31,H+.1,D*.35,.18,.035,.025)
        A.hcyl('metal_steel',W*.31,H+.04,D*.46,.009,.15,'x',8)
    if key=='table_pingpong':
        A.box('plastic_solid',0,H-.003,0,W,.004,D,0x315b72)
        for sx in (-1,1): A.box('paper',sx*(W/2-.012),H+.001,0,.02,.003,D)
        for sz in (-1,1): A.box('paper',0,H+.001,sz*(D/2-.012),W,.003,.02)
        A.box('paper',0,H+.001,0,W,.003,.012)
        A.box('metal_dark',0,H,0,.008,.15,D)
        for j in range(8): A.box('paper',0,H+j*.02,0,.009,.004,D)
    elif key=='folding_table':
        for sx in (-1,1): A.tube('metal_dark',[(sx*W*.35,.04,-D*.35),(sx*W*.35,H-.08,D*.35)],.012,6)
    elif key=='dough_table':
        A.box('paper',W*.14,H,0,W*.45,.008,D*.7)
        A.hcyl('wood_pine',W*.13,H+.035,0,.025,W*.35,'x',10)
    elif key=='coffee_table':
        A.box(m,0,H*.3,0,W-.12,.02,D-.1,None,True)

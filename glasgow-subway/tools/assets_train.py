"""Builds models/train.glb and models/train_lod.glb  (Stadler 4-car articulated Glasgow Subway set).   REVISION 3 (see research/train-appearance.md)
Blender frame: +Y = direction of travel (nose).  glTF: nose along -Z.  Origin: set centre, between the rails, at rail-head level.
39.3 m, 2.32 m wide, 2.64 m high, floor 0.695 m.  White gloss body, orange door zones, black window surrounds + skirt, closed roof and ceiling,
glazed doors/windows, open gangways with bellows, longitudinal moquette seating, orange poles, LED strips, route diagrams.
"""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

W = 1.16                 # half width of the body (2.32 m wide)
FLOOR = 0.695            # floor top above rail head
UF = 0.44                # underframe / skirt bottom
SKIN, LIN = 0.02, 0.02   # exterior skin / interior lining thickness
GAP = 0.17
CAR_LENS = [10.5, 8.9, 8.9, 10.5]
DOORS_END = [-1.0]; DOORS_MID = [-2.2, 2.2]       # car-local door centres (end cars: 1 door, middle cars: 2)
DOOR_W = 1.3             # opening width (leaf 1.2 m, single sliding leaf per node)
DOOR_Z0, DOOR_Z1 = 0.70, 1.95
WIN_Z0, WIN_Z1 = 1.15, 1.88       # window band
SKIRT_Z = 0.82
_th = [math.pi * i / 8 for i in range(9)]
FULL_ROOF = [(W * math.cos(t), 1.95 + 0.67 * math.sin(t)) for t in _th]      # outer roof, right belt -> crown -> left belt
CEIL = [(1.10 * math.cos(t), 1.93 + 0.64 * math.sin(t)) for t in _th]        # inner ceiling
CFG = dict(seat_mat='seat_moquette', pole_mat='orange_pole')

def build_car(idx, yc, s, root, L, DOORS, has_cab):
    HALF = L / 2
    CAB_Y = HALF - 2.25 if has_cab else HALF            # saloon ends here (cab partition) - car-local y
    ROOFEND = HALF - 0.85 if has_cab else HALF
    lights = []
    def P(x, y, z): return (x, yc + s * y, z)
    car = group(f'car_{idx}', parent=root)
    ext = M(); sal = M(); cab = M(); gls = M()

    # ------------------------------------------------------------ side walls: skin + lining with a hollow between (door pockets)
    edges = [-HALF]
    for d in DOORS: edges += [d - DOOR_W / 2, d + DOOR_W / 2]
    edges.append(CAB_Y)
    segs = [(edges[2 * k], edges[2 * k + 1]) for k in range(len(DOORS) + 1)]
    for sg in (-1, 1):
        xs = sg * (W - SKIN / 2); xl = sg * (W - 0.12 + LIN / 2); xg = sg * (W - 0.06)
        for (a, b) in segs:
            ym = (a + b) / 2; Ln = b - a
            ext.box(P(xs, ym, (UF + SKIRT_Z) / 2), (SKIN, Ln, SKIRT_Z - UF), 'skirt_black')                       # black skirt band
            ext.box(P(xs, ym, (SKIRT_Z + WIN_Z0) / 2), (SKIN, Ln, WIN_Z0 - SKIRT_Z), 'livery_white')
            sal.box(P(xl, ym, (FLOOR + WIN_Z0) / 2), (LIN, Ln, WIN_Z0 - FLOOR), 'interior_panel')
            ext.box(P(xs, ym, (WIN_Z1 + 2.10) / 2), (SKIN, Ln, 2.10 - WIN_Z1), 'livery_white')
            sal.box(P(xl, ym, (WIN_Z1 + 2.10) / 2), (LIN, Ln, 2.10 - WIN_Z1), 'interior_panel')
            n = max(1, int(round(Ln / 1.7))); pw = 0.30 if n > 1 else 0.14; wl = (Ln - pw * (n + 1)) / n
            if Ln < 0.6: n = 0
            for k in range(n + 1):
                yk = a + pw / 2 + k * (wl + pw)
                if n == 0: break
                ext.box(P(xs, yk, (WIN_Z0 + WIN_Z1) / 2), (SKIN, pw, WIN_Z1 - WIN_Z0), 'livery_white')
                sal.box(P(xl, yk, (WIN_Z0 + WIN_Z1) / 2), (LIN, pw, WIN_Z1 - WIN_Z0), 'interior_panel')
            for k in range(n):
                y0 = a + pw + k * (wl + pw) + wl / 2
                gls.box(P(xg, y0, (WIN_Z0 + WIN_Z1) / 2), (0.012, wl, WIN_Z1 - WIN_Z0), 'glass_window')
                for zz, hh in ((WIN_Z0 - 0.03, 0.06), (WIN_Z1 + 0.03, 0.06)):                                    # black surround
                    ext.box(P(sg * (W - 0.008), y0, zz), (0.012, wl + 0.08, hh), 'glass_black')
                for yy in (y0 - wl / 2 - 0.02, y0 + wl / 2 + 0.02):
                    ext.box(P(sg * (W - 0.008), yy, (WIN_Z0 + WIN_Z1) / 2), (0.012, 0.04, WIN_Z1 - WIN_Z0 + 0.12), 'glass_black')
                sal.box(P(xl - sg * 0.02, y0, WIN_Z1 - 0.03), (0.03, wl, 0.012), 'led_warm')                      # LED strip along the window head
                sal.box(P(xl - sg * 0.02, y0, 2.0), (0.035, wl, 0.1), 'panel_ceiling')                          # vent grille above windows
        for d in DOORS:
            ext.box(P(xs, d, (DOOR_Z1 + 2.10) / 2), (SKIN, DOOR_W, 2.10 - DOOR_Z1), 'subway_orange')            # orange header
            sal.box(P(xl, d, (DOOR_Z1 + 2.10) / 2), (LIN, DOOR_W, 2.10 - DOOR_Z1), 'interior_panel')
            ext.box(P(xs, d, (UF + DOOR_Z0) / 2), (SKIN, DOOR_W, DOOR_Z0 - UF), 'skirt_black')                    # sill
            ext.box(P(sg * (W - 0.09), d, DOOR_Z0 - 0.005), (0.14, DOOR_W, 0.012), 'steel_dark')                  # threshold wedge
            ext.box(P(sg * (W - 0.02), d, DOOR_Z0 + 0.006), (0.04, DOOR_W, 0.012), 'sign_yellow')
            sal.box(P(sg * (W - 0.4), d, FLOOR + 0.004), (0.7, DOOR_W, 0.008), 'floor_light')                    # light threshold band
            ext.box(P(sg * (W + 0.0015), d + DOOR_W / 2 + 0.25, (SKIRT_Z + 2.0) / 2), (0.004, 0.5, 2.0 - SKIRT_Z), 'subway_orange')   # orange door-zone bands
            ext.box(P(sg * (W + 0.0015), d - DOOR_W / 2 - 0.25, (SKIRT_Z + 2.0) / 2), (0.004, 0.5, 2.0 - SKIRT_Z), 'subway_orange')
            ext.box(P(sg * (W - 0.09), d, DOOR_Z1 + 0.03), (0.05, DOOR_W + 1.4, 0.04), 'steel_dark')             # track
            sal.box(P(sg * (W - 0.22), d + DOOR_W / 2 + 0.12, 1.25), (0.05, 0.1, 0.12), 'sos_green')              # door emergency release
    # ------------------------------------------------------------ floor + underframe
    sal.box(P(0, (-HALF + CAB_Y) / 2, FLOOR - 0.02), (2 * W - 0.24, CAB_Y + HALF, 0.04), 'floor_dark')
    sal.box(P(0, (-HALF + CAB_Y) / 2, FLOOR - 0.045), (2 * W - 0.06, CAB_Y + HALF, 0.012), 'steel_dark')
    ext.box(P(0, 0 if not has_cab else -0.3, (UF + FLOOR) / 2), (2 * W - 0.24, L - 0.3, FLOOR - UF), 'skirt_black')
    for yy in (-HALF * 0.35, 0.0, HALF * 0.35):
        ext.box(P(0.0, yy, UF + 0.02), (1.3, min(1.1, HALF * 0.25), 0.2), 'steel_dark')
    # ------------------------------------------------------------ roof: closed outer shell + inner ceiling (explicit normals)
    def roof_strip(M_, prof, y0, y1, m, **kw):
        a, b = sorted((yc + s * y0, yc + s * y1))
        M_.strip_y(prof, a, b, m, **kw)
    roof_strip(ext, FULL_ROOF, -HALF, ROOFEND, 'livery_white', away=(0.0, 1.5))
    roof_strip(sal, CEIL, -HALF, CAB_Y, 'interior_ceiling', toward=(0.0, 1.5))
    ext.box(P(0, (ROOFEND - HALF) / 2, 2.625), (0.55, ROOFEND + HALF - 0.5, 0.012), 'panel_ceiling')      # lighter grey roof panel strip
    # ------------------------------------------------------------ end walls with the open gangway aperture + bellows
    AP_W = 1.5
    AP_TOP = 2.38                                  # gangway aperture is full height (a standing eye at ~2.2 m must fit)
    arch = lambda x: 1.95 + 0.67 * math.sqrt(max(0.0, 1 - (x / W) ** 2))
    xs_in = [0.55, 0.3, 0.0, -0.3, -0.55]
    for e in ((-1,) if has_cab else (-1, 1)):
        ye = e * (HALF - 0.03)
        for sgx in (-1, 1):
            ext.box(P(sgx * ((AP_W / 2 + W) / 2), ye, (UF + 2.0) / 2), (W - AP_W / 2, 0.06, 2.0 - UF), 'livery_white')
            sal.cyl(P(sgx * (AP_W / 2 - 0.06), e * (HALF - 0.12), (FLOOR + AP_TOP - 0.1) / 2), 0.02, AP_TOP - 0.1 - FLOOR, CFG['pole_mat'], seg=8)   # orange poles each side of the gangway
            xa = AP_W / 2; xb = [sgx * x for x in (1.1, 1.0, 0.9)]
            sliver = [(sgx * xa, 1.95), (sgx * W, 1.95)] + [(x, arch(x)) for x in xb] + [(sgx * xa, arch(xa))]
            f = ext.poly([P(x, ye, z) for x, z in sliver], 'livery_white'); f[ext.fx] = 1
        head = [(-AP_W / 2, AP_TOP), (AP_W / 2, AP_TOP), (AP_W / 2, arch(AP_W / 2))] + [(x, arch(x)) for x in xs_in] + [(-AP_W / 2, arch(AP_W / 2))]
        f = ext.poly([P(x, ye, z) for x, z in head], 'livery_white'); f[ext.fx] = 1
        ext.box(P(0, ye, (UF + FLOOR) / 2), (AP_W, 0.06, FLOOR - UF), 'skirt_black')
        bell = [(-0.78, FLOOR - 0.02), (0.78, FLOOR - 0.02), (0.78, 2.2), (0.55, AP_TOP), (-0.55, AP_TOP), (-0.78, 2.2)]
        ya, yb = sorted((yc + s * e * HALF, yc + s * e * (HALF + GAP / 2 + 0.01)))
        ext.strip_y(bell, ya, yb, 'rubber_black', closed=True)
        ya, yb = sorted((yc + s * e * (HALF - 0.1), yc + s * e * (HALF + GAP / 2 + 0.05)))
        sal.bbox((-AP_W / 2, ya, FLOOR - 0.03), (AP_W / 2, yb, FLOOR + 0.005), 'steel_bright')                 # turn-plate
        sal.box(P(0.95 * (1 if e > 0 else 1), e * (HALF - 0.1), 1.95), (0.2, 0.04, 0.08), 'sos_green')           # passenger help unit
        sal.sphere(P(0.8, e * (HALF - 0.5), 2.35), 0.06, 'plastic_grey', sz=0.6, seg=8)                         # CCTV dome
        sal.sphere(P(-0.8, e * (HALF - 0.5), 2.35), 0.06, 'plastic_grey', sz=0.6, seg=8)
    # ------------------------------------------------------------ cab partition (white, glazed, door opening)
    if has_cab:
        for sgx in (-1, 1):
            sal.box(P(sgx * 0.80, CAB_Y, (FLOOR + 1.45) / 2), (0.7, 0.05, 1.45 - FLOOR), 'interior_panel')
            sal.box(P(sgx * 0.80, CAB_Y, 1.95), (0.7, 0.05, 0.3), 'interior_panel')
            gls.box(P(sgx * 0.80, CAB_Y, 1.68), (0.6, 0.02, 0.45), 'glass_clear')
        sal.box(P(0, CAB_Y, 2.1), (1.0, 0.05, 0.1), 'interior_panel')
        sal.box(P(0, CAB_Y, (FLOOR + 1.0) / 2), (0.92, 0.05, 1.0 - FLOOR), 'interior_panel')
        gls.box(P(0, CAB_Y, 1.62), (0.9, 0.02, 0.4), 'glass_clear')
        sal.quad_uv(P(0.62, CAB_Y - 0.03, 1.55), P(0.98, CAB_Y - 0.03, 1.55), P(0.98, CAB_Y - 0.03, 1.9), P(0.62, CAB_Y - 0.03, 1.9), 'screen_blank') if False else None
    # ------------------------------------------------------------ seating: longitudinal benches (+ tip-up seats and wheelchair space in end cars)
    be = [-HALF + 0.30]
    for d in DOORS: be += [d - DOOR_W / 2 - 0.05, d + DOOR_W / 2 + 0.05]
    be.append(CAB_Y - (0.2 if has_cab else 0.30))
    bays = [(be[i], be[i + 1]) for i in range(0, len(be), 2)]
    for bi, (a, b) in enumerate(bays):
        wc = has_cab and bi == len(bays) - 1                  # wheelchair space at the cab end of an end car
        build_bay(sal, P, a, b - (1.25 if wc else 0.0), CFG, end_a=(bi > 0), end_b=(not wc and bi < len(bays) - 1))
        if wc:
            for sg in (-1, 1):
                for k in (0, 1):
                    yy = b - 0.35 - k * 0.5
                    sal.box(P(sg * (W - 0.15), yy, FLOOR + 0.85), (0.05, 0.44, 0.42), 'plastic_dark')           # tip-up seats (folded)
                    sal.box(P(sg * (W - 0.18), yy, FLOOR + 0.85), (0.03, 0.40, 0.38), 'seat_moquette')
            sal.quad_uv(P(W - 0.1, b - 0.9, 1.45), P(W - 0.1, b - 0.6, 1.45), P(W - 0.1, b - 0.6, 1.75), P(W - 0.1, b - 0.9, 1.75), 'sign_blue') if False else None
            sal.box(P(W - 0.1, b - 0.75, 1.55), (0.02, 0.3, 0.3), 'sign_blue')                                   # wheelchair pictogram plate
    # ------------------------------------------------------------ orange poles & rails
    for d in DOORS:
        for yy in (d - DOOR_W / 2 - 0.12, d + DOOR_W / 2 + 0.12):
            for sgx in (-1, 1):
                sal.cyl_between(P(sgx * 0.98, yy, FLOOR), P(sgx * 0.98, yy, 1.85), 0.019, CFG['pole_mat'], seg=8)
                sal.cyl_between(P(sgx * 0.98, yy, 1.85), P(sgx * 0.62, yy, 2.30), 0.019, CFG['pole_mat'], seg=8)      # curved top sweeps toward the middle
        for sgx in (-1, 1):
            sal.cyl_between(P(sgx * 0.45, d, FLOOR), P(sgx * 0.45, d, 2.28), 0.019, CFG['pole_mat'], seg=8)           # vestibule poles
    for sgx in (-1, 1):
        sal.cyl(P(sgx * 0.62, (-HALF + CAB_Y) / 2, 2.30), 0.016, CAB_Y + HALF - 0.5, CFG['pole_mat'], axis='y', seg=8)   # overhead rails
    # ------------------------------------------------------------ ceiling LED strips, route diagrams
    nl = max(2, int((CAB_Y + HALF - 1.0) // 2.4))
    for k in range(nl):
        yy = -HALF + 1.4 + k * 2.4
        sal.box(P(0, yy, 2.545), (0.18, 1.6, 0.014), 'strip_light'); lights.append(yc + s * yy)
    sal.box(P(0, (-HALF + CAB_Y) / 2, 2.55), (0.18, CAB_Y + HALF - 0.8, 0.008), 'strip_light')
    for sg in (-1, 1):
        for (a, b) in segs:
            if b - a < 2.0: continue
            w_ = min(1.7, b - a - 0.4); ym = (a + b) / 2; xq = sg * (W - 0.125)
            f = sal.quad_uv(P(xq, ym - w_ / 2, 0.97), P(xq, ym + w_ / 2, 0.97), P(xq, ym + w_ / 2, 1.12), P(xq, ym - w_ / 2, 1.12), 'route_map_panel')
            f[sal.fx] = 1
            if f.normal.x * -sg < 0: f.normal_flip()
    # ------------------------------------------------------------ exterior details: roundels (side), stripe
    for sg in (-1, 1):
        for yy in (-HALF + 0.9, (CAB_Y - DOOR_W / 2 - 0.6) if False else CAB_Y - 1.0):
            xo = sg * (W + 0.002)
            q = ext.quad_uv(P(xo, yy - 0.2, 0.86), P(xo, yy + 0.2, 0.86), P(xo, yy + 0.2, 1.26), P(xo, yy - 0.2, 1.26), 'sign_roundel')
            q[ext.fx] = 1
            if q.normal.x * sg < 0: q.normal_flip()
    # ------------------------------------------------------------ doors (animatable leaves with real glass)
    nodes = {}
    for sgx, nm in ((-1, 'L'), (1, 'R')):
        for di, d in enumerate(DOORS):
            wy = yc + s * d
            lm = M(); lw = DOOR_W - 0.1; lh = DOOR_Z1 - DOOR_Z0; zc = (DOOR_Z0 + DOOR_Z1) / 2
            pz0, pz1 = WIN_Z0 - zc, WIN_Z1 - zc                # window opening within the leaf (local z)
            lm.box((0, 0, (-lh / 2 + pz0) / 2), (0.04, lw, pz0 + lh / 2), 'subway_orange')
            lm.box((0, 0, (pz1 + lh / 2) / 2), (0.04, lw, lh / 2 - pz1), 'subway_orange')
            for yy in (-lw / 2 + 0.07, lw / 2 - 0.07):
                lm.box((0, yy, (pz0 + pz1) / 2), (0.04, 0.14, pz1 - pz0), 'subway_orange')
            lm.box((0, 0, (pz0 + pz1) / 2), (0.008, lw - 0.28, pz1 - pz0), 'glass_window')                  # GLASS in the door window
            for yy in (-lw / 2 + 0.14, lw / 2 - 0.14):
                lm.box((sgx * 0.021, yy, (pz0 + pz1) / 2), (0.004, 0.02, pz1 - pz0), 'glass_black')
            lm.box((sgx * 0.021, 0, pz1 - 0.01), (0.004, lw - 0.26, 0.02), 'glass_black')
            lm.box((sgx * 0.021, 0, pz0 + 0.01), (0.004, lw - 0.26, 0.02), 'glass_black')
            for k in (-1, 1):
                lm.box((0, k * (lw / 2 - 0.01), 0), (0.045, 0.02, lh - 0.02), 'rubber_black')
            o = lm.to_obj('tmp', parent=None, loc=(sgx * (W - 0.04), wy, zc))
            nodes.setdefault(nm, []).append((wy, o))
    # ------------------------------------------------------------ bogies
    for by in (-HALF + 1.9, HALF - 1.9):
        bg = M()
        for sx in (-1, 1):
            bg.box((sx * 0.80, 0, 0.42), (0.1, 2.1, 0.20), 'steel_dark')
        bg.box((0, 0.0, 0.50), (1.7, 0.24, 0.14), 'steel_dark')
        for ay in (-0.9, 0.9):
            bg.cyl((0, ay, 0.27), 0.04, 1.5, 'steel_bright', axis='x', seg=8)
            for sx in (-1, 1):
                bg.cyl((sx * 0.55, ay, 0.27), 0.27, 0.11, 'steel_bright', axis='x', seg=24)
                bg.cyl((sx * 0.50, ay, 0.27), 0.30, 0.03, 'steel_dark', axis='x', seg=24)
            bg.box((0, ay, 0.36), (0.5, 0.35, 0.26), 'steel_dark')
        for sx in (-1, 1):
            bg.box((sx * 0.92, 0.55, 0.15), (0.14, 0.35, 0.05), 'conductor_rail')
            bg.box((sx * 0.92, 0.55, 0.28), (0.04, 0.06, 0.26), 'steel_dark')
        bg.to_obj(f'car_{idx}_bogie_{"a" if by < 0 else "b"}', parent=car, loc=(0, yc + s * by, 0))
    if has_cab:
        build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y)
    ext.to_obj(f'car_{idx}_exterior', parent=car)
    sal.to_obj(f'car_{idx}_saloon', parent=car)
    gls.to_obj(f'car_{idx}_glass', parent=car)
    if has_cab: cab.to_obj(f'car_{idx}_cab', parent=car)
    nodes['_lights'] = lights
    return nodes

def build_bay(sal, P, a, b, cfg, end_a=False, end_b=False):
    """Longitudinal bench seating between car-local y=a..b on both walls: moquette cushions + high backs on a dark plinth, dark end panels with perspex screens."""
    L = b - a
    if L < 0.6: return
    n = max(1, int(L / 0.52)); sw = L / n
    for sg in (-1, 1):
        xc = sg * (W - 0.12 - 0.22)
        for i in range(n):
            ym = a + sw * (i + 0.5)
            sal.box(P(xc, ym, FLOOR + 0.43), (0.44, sw - 0.015, 0.07), cfg['seat_mat'])                                           # cushion
            sal.box(P(sg * (W - 0.12 - 0.04), ym, FLOOR + 0.80), (0.07, sw - 0.015, 0.52), cfg['seat_mat'], rot=(0, sg * 0.10, 0))   # high back
        sal.box(P(xc, (a + b) / 2, FLOOR + 0.20), (0.42, L - 0.02, 0.40), 'interior_panel')                                       # white plinth behind
        sal.box(P(xc - sg * 0.215, (a + b) / 2, FLOOR + 0.20), (0.012, L - 0.02, 0.38), 'plastic_dark')                           # dark grey front panel
        sal.box(P(sg * (W - 0.12 - 0.06), (a + b) / 2, FLOOR + 0.52), (0.05, L, 0.12), 'plastic_dark')                           # back-rest base
        for yy, flag in ((a, end_a), (b, end_b)):
            sal.box(P(xc - sg * 0.02, yy, FLOOR + 0.5), (0.46, 0.04, 1.0), 'plastic_dark')                                        # moulded end panel
            if flag:
                sal.box(P(xc - sg * 0.02, yy + (0.03 if yy == a else -0.03), FLOOR + 1.28), (0.40, 0.012, 0.5), 'glass_clear')    # perspex draught screen

def build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y):
    def Y(t): return HALF - t                    # car-local y at distance t behind the nose tip
    X0 = 0.86
    NOSE_Y = Y(0.03)
    ZG0, ZG1 = 0.70, 2.30                        # black glazing panel (front)
    ZW0 = 1.50                                   # windscreen (transparent) starts here; below it is opaque black glass
    cab.box(P(0, (CAB_Y + NOSE_Y) / 2, FLOOR - 0.02), (2 * W - 0.24, NOSE_Y - CAB_Y, 0.04), 'floor_dark')
    for sg in (-1, 1):
        xs = sg * (W - SKIN / 2); xl = sg * (W - 0.12 + LIN / 2)
        for (t0, t1) in ((0.75, 0.95), (1.85, 2.25)):
            ym = Y((t0 + t1) / 2); Ln = t1 - t0
            ext.box(P(xs, ym, (SKIRT_Z + 2.10) / 2), (SKIN, Ln, 2.10 - SKIRT_Z), 'livery_white')
            ext.box(P(xs, ym, (UF + SKIRT_Z) / 2), (SKIN, Ln, SKIRT_Z - UF), 'skirt_black')
            cab.box(P(xl, ym, (FLOOR + 2.10) / 2), (LIN, Ln, 2.10 - FLOOR), 'interior_panel')
        ext.box(P(xs, Y(1.4), (DOOR_Z1 + 2.10) / 2), (SKIN, 0.9, 2.10 - DOOR_Z1), 'subway_orange')
        ext.box(P(xs, Y(1.4), (UF + DOOR_Z0) / 2), (SKIN, 0.9, DOOR_Z0 - UF), 'skirt_black')
        cab.box(P(xl, Y(1.4), (FLOOR + 2.10) / 2), (LIN, 0.9, 0.0001), 'interior_panel') if False else None
        # two-stage plan chamfer (white) from the full width to the nose face
        for (xa, ta, xb, tb) in ((W, 0.90, 1.05, 0.45), (1.05, 0.45, X0, 0.03)):
            ext.poly([P(sg * xa, Y(ta), UF), P(sg * xb, Y(tb), UF), P(sg * xb, Y(tb), 2.0), P(sg * xa, Y(ta), 2.0)], 'livery_white')
        # cab side door: hinged at the front edge (t=0.95), glazed, swings outwards
        dm = M(); dw = 0.9; dz = (DOOR_Z0 + DOOR_Z1) / 2; lh = DOOR_Z1 - DOOR_Z0
        dm.box((0, 0, (-lh / 2 + (WIN_Z0 - dz)) / 2), (0.04, dw, (WIN_Z0 - dz) + lh / 2), 'subway_orange')
        dm.box((0, 0, ((WIN_Z1 - dz) + lh / 2) / 2), (0.04, dw, lh / 2 - (WIN_Z1 - dz)), 'subway_orange')
        for yy in (-dw / 2 + 0.06, dw / 2 - 0.06): dm.box((0, yy, (WIN_Z0 + WIN_Z1) / 2 - dz), (0.04, 0.12, WIN_Z1 - WIN_Z0), 'subway_orange')
        dm.box((0, 0, (WIN_Z0 + WIN_Z1) / 2 - dz), (0.008, dw - 0.24, WIN_Z1 - WIN_Z0), 'glass_window')
        nm = 'L' if (sg * s) < 0 else 'R'
        suffix = '' if s > 0 else '_rear'
        hinge = empty(f'cab_door_{nm}{suffix}', loc=(sg * (W - 0.04), P(0, Y(0.95), 0)[1], dz), parent=car, kind='ARROWS', size=0.2)
        dm.to_obj(f'cab_door_{nm}{suffix}_mesh', parent=hinge, loc=(0, -s * 0.45, 0))
        cab.box(P(sg * (W - 0.14), Y(0.55), (FLOOR + 1.55) / 2), (0.1, 0.8, 1.55 - FLOOR), 'plastic_dark')
    # white lower nose, black glazing panel (opaque lower part + transparent windscreen)
    ext.poly([P(-X0, NOSE_Y, UF), P(X0, NOSE_Y, UF), P(X0, NOSE_Y, ZG0), P(-X0, NOSE_Y, ZG0)], 'livery_white')
    ext.poly([P(-X0, NOSE_Y, ZG0), P(X0, NOSE_Y, ZG0), P(X0, NOSE_Y, ZW0), P(-X0, NOSE_Y, ZW0)], 'glass_black')
    ext.box(P(0, NOSE_Y - 0.03, UF + 0.08), (1.7, 0.12, 0.16), 'steel_dark')                       # bumper plate
    gls.poly([P(-X0, NOSE_Y, ZW0), P(X0, NOSE_Y, ZW0), P(0.90, Y(0.30), ZG1), P(-0.90, Y(0.30), ZG1)], 'glass_window')
    # central evacuation door outline on the front glazing
    for (cx, cz, sx, sz) in ((0, 0.74, 0.84, 0.02), (0, 1.95, 0.84, 0.02)):
        ext.box(P(cx, NOSE_Y + 0.004, cz), (sx, 0.01, sz), 'steel_dark')
    for xx in (-0.42, 0.42):
        ext.box(P(xx, NOSE_Y + 0.004, 1.35), (0.02, 0.01, 1.22), 'steel_dark')
    # roof front: loft from the roof profile at t=0.85 to the header at t=0.30
    ringA = FULL_ROOF
    ringB = [(0.80 * x, ZG1 + (z - 1.95) * 0.37) for x, z in ringA]
    n = len(ringA)
    a = [ext.bm.verts.new(P(x, Y(0.85), z)) for x, z in ringA]; b = [ext.bm.verts.new(P(x, Y(0.30), z)) for x, z in ringB]
    fs = []
    for i in range(n - 1):
        f = ext.bm.faces.new((a[i], a[i + 1], b[i + 1], b[i])); f[ext.fx] = 1
        mid = 0.5 * (ringA[i][1] + ringA[i + 1][1])
        if f.normal.z < 0: f.normal_flip()
        fs.append(f)
    cap = ext.bm.faces.new(b); cap[ext.fx] = 1
    if cap.normal.y * s < 0: cap.normal_flip()
    fs.append(cap)
    ext._tag(fs, 'livery_white')
    # vertical LED head/tail light strips + 2x4 dot clusters
    front = s > 0
    lm = 'headlight' if front else 'taillight'
    for sg in (-1, 1):
        ext.box(P(sg * 0.80, NOSE_Y + 0.006, 1.40), (0.035, 0.012, 0.95), lm)
        for r in range(4):
            for c in range(2):
                ext.cyl(P(sg * (0.76 + c * 0.04), NOSE_Y + 0.006, 0.80 + r * 0.04), 0.011, 0.012, lm, axis='y', seg=8)
    nm = 'headlight' if front else 'taillight'
    empty(f'{nm}_L', loc=P(-0.80 * (1 if s > 0 else -1), NOSE_Y + 0.05, 1.4), parent=car)
    empty(f'{nm}_R', loc=P(0.80 * (1 if s > 0 else -1), NOSE_Y + 0.05, 1.4), parent=car)
    # front roundel on the lower black glazing (centre)
    q = ext.quad_uv(P(-0.19, NOSE_Y + 0.008, 0.72), P(0.19, NOSE_Y + 0.008, 0.72), P(0.19, NOSE_Y + 0.008, 1.10), P(-0.19, NOSE_Y + 0.008, 1.10), 'sign_roundel')
    q[ext.fx] = 1
    if q.normal.y * s < 0: q.normal_flip()
    ext.box(P(0, NOSE_Y + 0.10, 0.56), (0.3, 0.3, 0.16), 'steel_dark')       # Scharfenberg coupler cover
    # ---------------- cab interior: ceiling, desk, controls, driver's seat (slightly left of centre)
    cab.strip_y(CEIL, *sorted((yc + s * CAB_Y, yc + s * Y(0.60))), 'interior_ceiling', toward=(0.0, 1.5))
    DZ = FLOOR + 0.80
    cab.box(P(0, Y(0.75), (FLOOR + DZ - 0.012) / 2), (1.9, 0.62, DZ - 0.012 - FLOOR), 'plastic_black')   # 12 mm under the grey top (no z-fight)
    cab.poly([P(-0.95, Y(1.06), DZ), P(0.95, Y(1.06), DZ), P(0.95, Y(0.44), DZ - 0.06), P(-0.95, Y(0.44), DZ - 0.06)], 'plastic_grey')
    cab.cyl(P(-0.58, Y(0.90), DZ + 0.03), 0.075, 0.06, 'steel_dark', seg=14)                 # master controller
    cab.cyl(P(-0.58, Y(0.90), DZ + 0.13), 0.016, 0.16, 'steel_bright', seg=8)
    cab.box(P(-0.58, Y(0.93), DZ + 0.22), (0.04, 0.12, 0.04), 'plastic_black')
    cab.sphere(P(-0.58, Y(0.97), DZ + 0.22), 0.028, 'plastic_black', seg=8)
    cab.cyl(P(-0.38, Y(0.90), DZ + 0.03), 0.065, 0.06, 'steel_dark', seg=14)                 # brake handle
    cab.cyl(P(-0.38, Y(0.90), DZ + 0.12), 0.014, 0.14, 'steel_bright', seg=8)
    cab.box(P(-0.38, Y(0.90), DZ + 0.20), (0.12, 0.03, 0.03), 'button_red')
    for xx, mm in ((0.16, 'button_green'), (0.26, 'button_green'), (0.36, 'button_red'), (0.46, 'button_amber')):
        cab.cyl(P(xx, Y(0.86), DZ - 0.02), 0.025, 0.02, mm, seg=12)
    cab.cyl(P(0.70, Y(0.86), DZ - 0.01), 0.04, 0.05, 'button_red', seg=14)
    cab.box(P(0.84, Y(0.82), DZ - 0.01), (0.08, 0.14, 0.05), 'plastic_black')
    for i in range(6):
        cab.cyl(P(-0.86 + i * 0.05, Y(0.82), DZ - 0.02), 0.012, 0.01, ('button_green', 'button_amber', 'button_red')[i % 3], seg=8)
    # (no header bar: the windscreen is open to the roof loft so the driver sees the road ahead)
    DX = -0.28 * s          # driver seat slightly LEFT of the centre line (rear cab: +X)
    cab.cyl(P(DX, Y(1.55), FLOOR + 0.2), 0.05, 0.3, 'steel_dark', seg=8)
    cab.box(P(DX, Y(1.55), FLOOR + 0.43), (0.46, 0.46, 0.08), 'plastic_dark')
    cab.box(P(DX, Y(1.78), FLOOR + 0.78), (0.44, 0.08, 0.55), 'plastic_dark')
    cab.box(P(DX, Y(1.80), FLOOR + 1.12), (0.30, 0.07, 0.2), 'plastic_dark')
    cab.box(P(0, Y(1.15), 2.50), (0.3, 0.8, 0.012), 'strip_light')
    sfx = '' if idx == 0 else '_rear'
    def screen(name, c_t, c_x, c_z, w, h, tilt):
        sm = M(); hw, hh = w / 2, h / 2
        dz = hh * math.cos(tilt); dy = hh * math.sin(tilt)
        pts = [(-hw, -dy, -dz), (hw, -dy, -dz), (hw, dy, dz), (-hw, dy, dz)]
        f = sm.quad(*[P(c_x + px, Y(c_t) + py, c_z + pz) for px, py, pz in pts], 'screen_blank')
        uvl = sm.bm.loops.layers.uv.verify()
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
        f[sm.cuv] = 1; f[sm.fx] = 1
        return sm.to_obj(name, parent=car, uv=False)
    screen(f'cab_screen{sfx}', 0.70, -0.10, DZ + 0.16, 0.40, 0.25, math.radians(25))
    screen(f'cab_speedo{sfx}', 0.74, 0.30, DZ + 0.14, 0.20, 0.13, math.radians(25))
    empty('cab_eye' if s > 0 else 'cab_eye_rear', loc=P(DX, Y(1.55), FLOOR + 1.15), parent=car, kind='SPHERE', size=0.08)
    empty('cab_light' if s > 0 else 'cab_light_rear', loc=P(0, Y(1.15), 2.46), parent=car)

def layout():
    total = sum(CAR_LENS) + GAP * (len(CAR_LENS) - 1)
    out = []; y = total / 2
    for i, L in enumerate(CAR_LENS):
        out.append((y - L / 2, L, +1 if i < 2 else -1, DOORS_END if i in (0, 3) else DOORS_MID, i in (0, 3)))
        y -= L + GAP
    return total, out

def build_train():
    reset()
    root = group('train')
    total, cars = layout()
    nodes = []; lights = []
    for i, (yc, L, s, doors, cab) in enumerate(cars):
        n = build_car(i, yc, s, root, L, doors, cab); lights += n.pop('_lights'); nodes.append(n)
    for nm in ('L', 'R'):
        leaves = [t for n in nodes for t in n.get(nm, [])]
        leaves.sort(key=lambda t: -t[0])
        for i, (wy, o) in enumerate(leaves):
            o.name = f'door_{nm}_{i}'; o.data.name = o.name; o.parent = root
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.56), parent=root, kind='ARROWS', size=0.3)
    empty('couple_rear', loc=(0, -(nose + 0.25), 0.56), parent=root, kind='ARROWS', size=0.3)
    for k, wy in enumerate(sorted(lights, reverse=True)):
        empty(f'interior_light_{k}', loc=(0, wy, 2.45), parent=root)
    return root

def build_lod():
    reset()
    root = group('train')
    total, cars = layout()
    for idx, (yc, L, sg, doors, cab) in enumerate(cars):
        HALF_ = L / 2
        car = group(f'car_{idx}', parent=root)
        m = M()
        prof = [(-W, UF), (W, UF)] + FULL_ROOF
        if cab:
            a, b = (yc - HALF_, yc + HALF_ - 0.6) if sg > 0 else (yc - HALF_ + 0.6, yc + HALF_)
            m.prism_y(prof, a, b, 'livery_white')
            m.box((0, yc + sg * (HALF_ - 0.3), 1.3), (1.9, 0.6, 1.7), 'livery_white')
            m.box((0, yc + sg * (HALF_ - 0.0), 1.5), (1.7, 0.02, 1.0), 'glass_black')
        else:
            m.prism_y(prof, yc - HALF_, yc + HALF_, 'livery_white')
        for sx in (-1, 1):
            m.box((sx * (W + 0.005), yc, 1.5), (0.01, L - 1.0, 0.73), 'glass_black')
            for d in doors:
                m.box((sx * (W + 0.007), yc + sg * d, 1.3), (0.01, 1.3, 1.25), 'subway_orange')
        m.box((0, yc, 0.62), (2.3, L - 0.2, 0.36), 'skirt_black')
        m.to_obj(f'car_{idx}_body', parent=car)
        bm_ = M()
        for by in (yc - HALF_ + 1.9, yc + HALF_ - 1.9):
            bm_.box((0, by, 0.28), (1.5, 1.6, 0.5), 'steel_dark')
        bm_.to_obj(f'car_{idx}_bogies', parent=car)
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.56), parent=root); empty('couple_rear', loc=(0, -(nose + 0.25), 0.56), parent=root)
    empty('headlight_L', loc=(-0.8, nose + 0.05, 1.4), parent=root); empty('headlight_R', loc=(0.8, nose + 0.05, 1.4), parent=root)
    return root

if __name__ == '__main__':
    build_train(); export('train.glb')
    build_lod(); export('train_lod.glb')

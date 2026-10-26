"""Builds models/train.glb and models/train_lod.glb  (Stadler-style 4-car articulated Glasgow Subway set).   REVISION 3
Blender frame: +Y = direction of travel (nose).  glTF: nose along -Z.  Origin: set centre, between the rails, at rail-head level.
Dimensions: 39.3 m, 2.32 m wide, 2.64 m high, floor 0.695 m.  Closed roof + ceiling, glazed doors/windows, open gangways.
"""
import math, sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

W = 1.16                 # half width of the body (2.32 m wide)
FLOOR = 0.695            # floor top above rail head
UF = 0.44                # underframe / skirt bottom
SKIN, LIN = 0.02, 0.02   # exterior skin / interior lining thickness
GAP = 0.17
CAR_LENS = [10.5, 8.9, 8.9, 10.5]
DOORS_END = [-1.0]; DOORS_MID = [-2.2, 2.2]
DOOR_W = 1.3             # opening width (leaf 1.2 m)
DOOR_Z0, DOOR_Z1 = 0.70, 1.95
WIN_Z0, WIN_Z1 = 1.20, 1.85       # window band
# outer roof profile (right half, from belt up to the crown); mirrored for the left
ROOF_R = [(1.16, 1.95), (1.12, 2.10), (0.94, 2.36), (0.52, 2.56), (0.0, 2.62)]
ROOF = [(-x, z) for x, z in ROOF_R[:0:-1]][::-1]  # placeholder, rebuilt below
ROOF = [(x, z) for x, z in ROOF_R] + [(-x, z) for x, z in ROOF_R[-2::-1]]
ROOF = ROOF_R[:]            # start at right belt
ROOF = [(x, z) for x, z in ROOF_R] ; ROOF = ROOF[::-1][:-1][::-1] if False else ROOF
FULL_ROOF = [(1.16, 1.95), (1.12, 2.10), (0.94, 2.36), (0.52, 2.56), (0.0, 2.62), (-0.52, 2.56), (-0.94, 2.36), (-1.12, 2.10), (-1.16, 1.95)]
CEIL = [(x * 0.97, z - 0.07) for x, z in FULL_ROOF[1:-1]]
CEIL = [(1.10, 2.02)] + CEIL[:] + [(-1.10, 2.02)]

# --- configuration for the interior (kept in one place so it can follow the research notes)
CFG = dict(
    seat_style='longitudinal',     # longitudinal benches along both walls
    seat_mat='moquette_orange', seat_mat2='moquette_grey',
    pole_mat='pole_yellow',
)

def build_car(idx, yc, s, root, L, DOORS, has_cab):
    HALF = L / 2
    CAB_Y = HALF - 2.25 if has_cab else HALF            # saloon ends here (cab partition) - car-local y
    ROOFEND = HALF - 0.85 if has_cab else HALF
    lights = []
    def P(x, y, z): return (x, yc + s * y, z)
    car = group(f'car_{idx}', parent=root)
    ext = M(); sal = M(); cab = M(); gls = M()

    # ------------------------------------------------------------ side walls (skin + lining, pocketed doors)
    edges = [-HALF]
    for d in DOORS: edges += [d - DOOR_W / 2, d + DOOR_W / 2]
    edges.append(CAB_Y)
    segs = [(edges[2 * k], edges[2 * k + 1]) for k in range(len(DOORS) + 1)]
    for sg in (-1, 1):
        xs = sg * (W - SKIN / 2); xl = sg * (W - 0.12 + LIN / 2)
        xg = sg * (W - 0.06)
        for (a, b) in segs:
            ym = (a + b) / 2; Ln = b - a
            # lower panel (skin + lining) from underframe to window sill
            ext.box(P(xs, ym, (UF + WIN_Z0) / 2), (SKIN, Ln, WIN_Z0 - UF), 'subway_orange')
            sal.box(P(xl, ym, (FLOOR + WIN_Z0) / 2), (LIN, Ln, WIN_Z0 - FLOOR), 'interior_panel')
            # upper band above windows
            ext.box(P(xs, ym, (WIN_Z1 + 2.10) / 2), (SKIN, Ln, 2.10 - WIN_Z1), 'subway_orange')
            sal.box(P(xl, ym, (WIN_Z1 + 2.10) / 2), (LIN, Ln, 2.10 - WIN_Z1), 'interior_panel')
            n = max(1, int(round(Ln / 1.25))); pw = 0.12; wl = (Ln - pw * (n + 1)) / n
            for k in range(n + 1):
                yk = a + pw / 2 + k * (wl + pw)
                ext.box(P(xs, yk, (WIN_Z0 + WIN_Z1) / 2), (SKIN, pw, WIN_Z1 - WIN_Z0), 'subway_orange')
                sal.box(P(xl, yk, (WIN_Z0 + WIN_Z1) / 2), (LIN, pw, WIN_Z1 - WIN_Z0), 'interior_panel')
            for k in range(n):
                y0 = a + pw + k * (wl + pw) + wl / 2
                gls.box(P(xg, y0, (WIN_Z0 + WIN_Z1) / 2), (0.012, wl, WIN_Z1 - WIN_Z0), 'glass_window')
                # window reveal frames (inner)
                for zz in (WIN_Z0 + 0.01, WIN_Z1 - 0.01):
                    sal.box(P(xl - sg * 0.02, y0, zz), (0.03, wl, 0.02), 'steel_bright')
            # interior advert panels / route map (above windows, inside lining)
        for d in DOORS:
            ext.box(P(xs, d, (DOOR_Z1 + 2.10) / 2), (SKIN, DOOR_W, 2.10 - DOOR_Z1), 'subway_orange')       # header
            sal.box(P(xl, d, (DOOR_Z1 + 2.10) / 2), (LIN, DOOR_W, 2.10 - DOOR_Z1), 'interior_panel')
            ext.box(P(xs, d, (UF + DOOR_Z0) / 2), (SKIN, DOOR_W, DOOR_Z0 - UF), 'livery_grey')               # sill
            ext.box(P(sg * (W - 0.09), d, DOOR_Z0 - 0.005), (0.14, DOOR_W, 0.01), 'steel_bright')            # threshold plate
            sal.box(P(sg * (W - 0.3), d, FLOOR + 0.004), (0.55, DOOR_W, 0.008), 'tactile_yellow')            # yellow door-zone floor strip
            # door tracks (header rail)
            ext.box(P(sg * (W - 0.09), d, DOOR_Z1 + 0.03), (0.05, DOOR_W + 1.4, 0.04), 'steel_dark')
    # ------------------------------------------------------------ floor + underframe
    sal.box(P(0, (-HALF + CAB_Y) / 2 - 0.0, FLOOR - 0.02), (2 * W - 0.24, CAB_Y + HALF, 0.04), 'floor_grey')
    sal.box(P(0, (-HALF + CAB_Y) / 2, FLOOR - 0.045), (2 * W - 0.06, CAB_Y + HALF, 0.012), 'steel_dark')
    ext.box(P(0, 0 if not has_cab else -0.3, (UF + FLOOR) / 2 - 0.0), (2 * W - 0.24, L - 0.3, FLOOR - UF), 'livery_grey')
    for yy in (-HALF * 0.35, 0.0, HALF * 0.35):
        ext.box(P(0.0, yy, UF + 0.02), (1.3, min(1.1, HALF * 0.25), 0.2), 'steel_dark')
    # ------------------------------------------------------------ roof : closed outer shell + inner ceiling (explicit normals)
    def roof_strip(M_, prof, y0, y1, m, **kw):
        a, b = sorted((yc + s * y0, yc + s * y1))
        M_.strip_y(prof, a, b, m, **kw)
    roof_strip(ext, FULL_ROOF, -HALF, ROOFEND, 'livery_white', away=(0.0, 1.3))
    roof_strip(sal, CEIL, -HALF, CAB_Y, 'interior_ceiling', toward=(0.0, 1.3))
    # roof equipment: HVAC pods with louvres, antenna fins
    for yy in (-HALF * 0.45, HALF * 0.20 if not has_cab else HALF * 0.10):
        ext.box(P(0, yy, 2.64), (0.95, 1.9, 0.07), 'livery_grey')
        for k in range(6):
            ext.box(P(0, yy - 0.7 + k * 0.28, 2.685), (0.8, 0.03, 0.012), 'steel_dark')
    # ------------------------------------------------------------ end walls with the open gangway aperture (+ bellows)
    AP_W, AP_Z1 = 1.5, 2.05
    for e in ((-1,) if has_cab else (-1, 1)):
        ye = e * (HALF - 0.03)
        for sgx in (-1, 1):
            ext.box(P(sgx * ((AP_W / 2 + W) / 2), ye, (UF + 2.0) / 2), (W - AP_W / 2, 0.06, 2.0 - UF), 'steel_dark')
        ext.box(P(0, ye, (AP_Z1 + 2.1) / 2 + 0.0), (2 * W, 0.06, 2.1 - AP_Z1 + 0.0), 'steel_dark')
        ext.box(P(0, ye, (UF + FLOOR) / 2), (AP_W, 0.06, FLOOR - UF), 'steel_dark')
        # closing roof ends
        for sg_ in (-1, 1): pass
        # end wall above 2.1: fill between belt and roof with the roof's front face
        face = [(x, z) for x, z in FULL_ROOF] ; face = [(-1.16, 2.0)] + FULL_ROOF[1:-1] + [(1.16, 2.0)]
        pts = [P(x, e * HALF, z) for x, z in face]
        f = ext.poly(pts, 'steel_dark'); f[ext.fx] = 1
        if f.normal.y * s * e < 0: f.normal_flip()
        # bellows tube joining to the next car: closed loop, both sides visible
        bell = [(-0.78, FLOOR - 0.02), (0.78, FLOOR - 0.02), (0.78, 2.05), (0.5, 2.18), (-0.5, 2.18), (-0.78, 2.05)]
        ya, yb = sorted((yc + s * e * HALF, yc + s * e * (HALF + GAP / 2 + 0.01)))
        ext.strip_y(bell, ya, yb, 'rubber_black', closed=True, toward=None)
    if not has_cab: pass
    # gangway turntable floor plates
    for e in ((-1,) if has_cab else (-1, 1)):
        ya, yb = sorted((yc + s * e * (HALF - 0.1), yc + s * e * (HALF + GAP / 2 + 0.05)))
        sal.bbox((-AP_W / 2, ya, FLOOR - 0.03), (AP_W / 2, yb, FLOOR + 0.005), 'steel_bright')
    # ------------------------------------------------------------ cab partition (glazed, with door opening)
    if has_cab:
        for sgx in (-1, 1):
            sal.box(P(sgx * 0.80, CAB_Y, (FLOOR + 1.45) / 2), (0.7, 0.05, 1.45 - FLOOR), 'interior_panel')
            sal.box(P(sgx * 0.80, CAB_Y, 1.9), (0.7, 0.05, 0.4), 'interior_panel')
            gls.box(P(sgx * 0.80, CAB_Y, 1.62), (0.6, 0.02, 0.4), 'glass_clear')
        sal.box(P(0, CAB_Y, 2.05), (1.0, 0.05, 0.12), 'interior_panel')
        sal.box(P(0, CAB_Y, (FLOOR + 1.0) / 2), (0.92, 0.05, 1.0 - FLOOR), 'interior_panel')
        gls.box(P(0, CAB_Y, 1.62), (0.9, 0.02, 0.4), 'glass_clear')
    # ------------------------------------------------------------ seating (layout from CFG)
    be = [-HALF + 0.35]
    for d in DOORS: be += [d - DOOR_W / 2 - 0.05, d + DOOR_W / 2 + 0.05]
    be.append(CAB_Y - (0.2 if has_cab else 0.35))
    bays = [(be[i], be[i + 1]) for i in range(0, len(be), 2)]
    for (a, b) in bays:
        build_bay(sal, P, a, b, CFG)
    # ------------------------------------------------------------ poles, handrails
    for d in DOORS:
        for xx in (-0.55, 0.55):
            sal.cyl(P(xx, d, (FLOOR + 2.0) / 2), 0.02, 2.0 - FLOOR + 0.02, CFG['pole_mat'], seg=8)      # central door-zone poles
        for yy in (d - DOOR_W / 2 - 0.1, d + DOOR_W / 2 + 0.1):
            for xx in (-0.98, 0.98):
                sal.cyl(P(xx, yy, (FLOOR + 2.05) / 2), 0.018, 2.05 - FLOOR + 0.02, CFG['pole_mat'], seg=8)  # door-side poles
    for xx in (-0.55, 0.55):
        sal.cyl(P(xx, (-HALF + CAB_Y) / 2, 2.30), 0.016, CAB_Y + HALF - 0.4, CFG['pole_mat'], axis='y', seg=8)  # overhead rails
    # ------------------------------------------------------------ ceiling lights, panels, signage
    nl = max(2, int((CAB_Y + HALF - 1.0) // 2.4))
    for k in range(nl):
        yy = -HALF + 1.4 + k * 2.4
        sal.box(P(0, yy, 2.545), (0.20, 1.5, 0.015), 'strip_light'); lights.append(yc + s * yy)
        sal.box(P(0, yy, 2.535), (0.26, 1.56, 0.012), 'steel_bright')
    for sg in (-1, 1):
        # route map strips above windows (between door headers) and adverts
        for (a, b) in segs:
            if b - a < 2.2: continue
            sal.quad_uv(P(sg * (W - 0.1) - 0.0, a + 0.3, 1.96), P(sg * (W - 0.1), b - 0.3, 1.96), P(sg * (W - 0.1), b - 0.3, 2.08), P(sg * (W - 0.1), a + 0.3, 2.08), 'route_map_panel') if False else None
    for sg in (-1, 1):
        for (a, b) in segs:
            if b - a < 2.0: continue
            w_ = min(1.6, b - a - 0.4); ym = (a + b) / 2
            xq = sg * (W - 0.1)
            f = sal.quad_uv(P(xq, ym - w_ / 2, 1.88), P(xq, ym + w_ / 2, 1.88), P(xq, ym + w_ / 2, 2.07), P(xq, ym - w_ / 2, 2.07), 'route_map_panel')
            f[sal.fx] = 1
            if f.normal.x * -sg < 0: f.normal_flip()
    # ------------------------------------------------------------ exterior details: roundels, stripe
    for sg in (-1, 1):
        for yy in (-HALF + 1.2, CAB_Y - 1.0):
            xo = sg * (W + 0.002)
            q = ext.quad_uv(P(xo, yy - 0.2, 0.74), P(xo, yy + 0.2, 0.74), P(xo, yy + 0.2, 1.14), P(xo, yy - 0.2, 1.14), 'sign_roundel')
            q[ext.fx] = 1
            if q.normal.x * sg < 0: q.normal_flip()
        ext.box(P(sg * (W + 0.002), (CAB_Y - HALF) / 2, 1.1), (0.006, CAB_Y + HALF - 0.2, 0.02), 'livery_white')
    # ------------------------------------------------------------ doors (animatable leaves with real glass)
    nodes = {}
    for sgx, nm in ((-1, 'L'), (1, 'R')):
        for di, d in enumerate(DOORS):
            wy = yc + s * d
            lm = M(); lw = DOOR_W - 0.1; lh = DOOR_Z1 - DOOR_Z0; zc = (DOOR_Z0 + DOOR_Z1) / 2
            pane_z0, pane_z1 = WIN_Z0 - zc, WIN_Z1 - zc          # window opening within the leaf (local z)
            lm.box((0, 0, (-lh / 2 + pane_z0) / 2), (0.04, lw, pane_z0 + lh / 2), 'subway_orange')      # lower panel
            lm.box((0, 0, (pane_z1 + lh / 2) / 2), (0.04, lw, lh / 2 - pane_z1), 'subway_orange')       # upper rail
            for yy in (-lw / 2 + 0.06, lw / 2 - 0.06):
                lm.box((0, yy, (pane_z0 + pane_z1) / 2), (0.04, 0.12, pane_z1 - pane_z0), 'subway_orange')   # stiles
            lm.box((0, 0, (pane_z0 + pane_z1) / 2), (0.008, lw - 0.24, pane_z1 - pane_z0), 'glass_window')     # GLASS PANE in the opening
            lm.box((sgx * -0.022, 0, -lh / 2 + 0.1), (0.004, lw - 0.04, 0.16), 'livery_grey')
            for k in range(2):   # door rubber edges
                lm.box((0, (-1 if k == 0 else 1) * (lw / 2 - 0.01), 0), (0.045, 0.02, lh - 0.02), 'rubber_black')
            o = lm.to_obj('tmp', parent=None, loc=(sgx * (W - 0.04), wy, zc))
            nodes.setdefault(nm, []).append((wy, o))
    # ------------------------------------------------------------ bogies
    for by in (-HALF + 1.9, HALF - 1.9):
        bg = M()
        for sx in (-1, 1):
            bg.box((sx * 0.80, 0, 0.45), (0.1, 2.1, 0.22), 'steel_dark')
        bg.box((0, 0.0, 0.52), (1.7, 0.24, 0.16), 'steel_dark')
        for ay in (-0.9, 0.9):
            bg.cyl((0, ay, 0.30), 0.045, 1.5, 'steel_bright', axis='x', seg=8)
            for sx in (-1, 1):
                bg.cyl((sx * 0.55, ay, 0.30), 0.30, 0.11, 'steel_bright', axis='x', seg=24)
                bg.cyl((sx * 0.50, ay, 0.30), 0.34, 0.03, 'steel_dark', axis='x', seg=24)
            bg.box((0, ay, 0.38), (0.5, 0.35, 0.3), 'steel_dark')
        for sx in (-1, 1):
            bg.box((sx * 0.92, 0.55, 0.15), (0.14, 0.35, 0.05), 'conductor_rail')
            bg.box((sx * 0.92, 0.55, 0.30), (0.04, 0.06, 0.30), 'steel_dark')
        bg.to_obj(f'car_{idx}_bogie_{"a" if by < 0 else "b"}', parent=car, loc=(0, yc + s * by, 0))
    # ------------------------------------------------------------ cab
    if has_cab:
        build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y)
    ext.to_obj(f'car_{idx}_exterior', parent=car)
    sal.to_obj(f'car_{idx}_saloon', parent=car)
    gls.to_obj(f'car_{idx}_glass', parent=car)
    if has_cab: cab.to_obj(f'car_{idx}_cab', parent=car)
    nodes['_lights'] = lights
    return nodes

def build_bay(sal, P, a, b, cfg):
    """Longitudinal bench seating between y=a..b on both walls: contoured individual seat cushions + backs + armrests, with stanchion panels."""
    L = b - a
    if L < 0.8: return
    n = max(1, int(L / 0.50)); sw = L / n
    for sg in (-1, 1):
        xc = sg * (W - 0.12 - 0.22)
        for i in range(n):
            ym = a + sw * (i + 0.5)
            mm = cfg['seat_mat'] if (i % 2 == 0) else cfg['seat_mat2']
            sal.box(P(xc, ym, FLOOR + 0.43), (0.44, sw - 0.02, 0.07), cfg['seat_mat'])                 # cushion
            sal.box(P(xc + sg * 0.03, ym, FLOOR + 0.40), (0.38, sw - 0.04, 0.02), 'steel_dark')
            sal.box(P(sg * (W - 0.12 - 0.03), ym, FLOOR + 0.78), (0.05, sw - 0.02, 0.50), cfg['seat_mat'])   # back
            sal.box(P(sg * (W - 0.12 - 0.065), ym, FLOOR + 0.78), (0.02, sw - 0.02, 0.46), cfg['seat_mat2'])
        sal.box(P(xc, (a + b) / 2, FLOOR + 0.21), (0.40, L - 0.1, 0.40), 'steel_dark')                  # base box (heater/ducting)
        for i in range(n + 1):
            ya = a + sw * i
            sal.box(P(xc, ya, FLOOR + 0.58), (0.44, 0.02, 0.02), 'steel_bright')                         # divider armrest

def build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y):
    def Y(t): return HALF - t                    # car-local y at distance t behind the nose tip
    X0 = 0.88
    ZW0, ZW1 = 1.62, 2.25                        # windscreen bottom / top
    NOSE_Y = Y(0.03)
    # cab floor, lining
    cab.box(P(0, (CAB_Y + NOSE_Y) / 2, FLOOR - 0.02), (2 * W - 0.24, NOSE_Y - CAB_Y, 0.04), 'floor_grey')
    for sg in (-1, 1):
        xs = sg * (W - SKIN / 2); xl = sg * (W - 0.12 + LIN / 2)
        # side wall in cab zone: pieces around the cab door opening (t=0.95..1.85) and side window
        for (t0, t1) in ((0.75, 0.95), (1.85, 2.25)):
            ym = Y((t0 + t1) / 2); Ln = t1 - t0
            ext.box(P(xs, ym, (UF + 2.10) / 2), (SKIN, Ln, 2.10 - UF), 'subway_orange')
            cab.box(P(xl, ym, (FLOOR + 2.10) / 2), (LIN, Ln, 2.10 - FLOOR), 'interior_panel')
        ext.box(P(xs, Y(1.4), (DOOR_Z1 + 2.10) / 2), (SKIN, 0.9, 2.10 - DOOR_Z1), 'subway_orange')
        ext.box(P(xs, Y(1.4), (UF + DOOR_Z0) / 2), (SKIN, 0.9, DOOR_Z0 - UF), 'livery_grey')
        # chamfer panels at the nose (lower) and A-pillar
        ext.poly([P(sg * W, Y(0.75), UF), P(sg * X0, NOSE_Y, UF), P(sg * X0, NOSE_Y, ZW0), P(sg * W, Y(0.75), ZW0)], 'subway_orange')
        ext.poly([P(sg * W, Y(0.75), ZW0), P(sg * X0, NOSE_Y, ZW0), P(sg * 0.95, Y(0.57), ZW1), P(sg * W, Y(0.75), 2.10)], 'subway_orange_dk')
        gls.poly([P(sg * W, Y(0.75), ZW0), P(sg * W, Y(0.75), 2.10), P(sg * W, Y(0.95), 2.10), P(sg * W, Y(0.95), ZW0)], 'glass_window') if False else None
        # side corner window glass (small)
        # cab door: hinged at the front edge (t=0.95), swings outwards.  Leaf with glass.
        dm = M(); dw = 0.9; dh = 1.25; dz = (DOOR_Z0 + DOOR_Z1) / 2
        dm.box((0, 0, -0.30), (0.04, dw, 0.65), 'subway_orange'); dm.box((0, 0, 0.55), (0.04, dw, 0.15), 'subway_orange')
        for yy in (-dw / 2 + 0.05, dw / 2 - 0.05): dm.box((0, yy, 0.13), (0.04, 0.10, 0.5), 'subway_orange')
        dm.box((0, 0, 0.13), (0.008, dw - 0.2, 0.5), 'glass_window')
        nm = 'L' if (sg * s) < 0 else 'R'
        suffix = '' if s > 0 else '_rear'
        hinge = empty(f'cab_door_{nm}{suffix}', loc=(sg * (W - 0.04), P(0, Y(0.95), 0)[1], dz), parent=car, kind='ARROWS', size=0.2)
        dm.to_obj(f'cab_door_{nm}{suffix}_mesh', parent=hinge, loc=(0, -s * 0.45, 0))
        # door aperture side window (above door) and side window glass in the pillar panels - front 'quarter' glass
        gls.box(P(sg * (W - 0.06), Y(0.75 + 0.1), 1.62), (0.012, 0.0001, 0.0001), 'glass_window') if False else None
        # nose lining
        cab.box(P(sg * (W - 0.14), Y(0.55), (FLOOR + 1.55) / 2), (0.1, 0.8, 1.55 - FLOOR), 'plastic_black')
    # lower front, bumper, windscreen
    ext.poly([P(-X0, NOSE_Y, UF), P(X0, NOSE_Y, UF), P(X0, NOSE_Y, ZW0), P(-X0, NOSE_Y, ZW0)], 'subway_orange')
    ext.box(P(0, NOSE_Y - 0.03, UF + 0.12), (1.78, 0.14, 0.2), 'steel_dark')
    gls.poly([P(-X0, NOSE_Y, ZW0), P(X0, NOSE_Y, ZW0), P(0.95, Y(0.57), ZW1), P(-0.95, Y(0.57), ZW1)], 'glass_window')
    ext.box(P(0, NOSE_Y - 0.0, ZW0 - 0.02), (1.82, 0.05, 0.05), 'livery_grey')
    # roof front: loft from the roof profile at t=0.85 to the windscreen header at t=0.57
    ringA = FULL_ROOF
    ringB = [(0.84 * x, ZW1 + (z - 1.95) * 0.42) for x, z in ringA]
    n = len(ringA)
    a = [ext.bm.verts.new(P(x, Y(0.85), z)) for x, z in ringA]; b = [ext.bm.verts.new(P(x, Y(0.57), z)) for x, z in ringB]
    fs = []
    for i in range(n - 1):
        f = ext.bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
        f[ext.fx] = 1
        if f.normal.z < 0 and (ringA[i][1] > 2.0): f.normal_flip()
        fs.append(f)
    cap = ext.bm.faces.new(b); cap[ext.fx] = 1
    if cap.normal.y * s < 0: cap.normal_flip()
    fs.append(cap)
    ext._tag(fs, 'livery_white')
    # header over the windscreen (below the roof loft) in livery grey
    ext.box(P(0, Y(0.57) + 0.0, ZW1 + 0.02), (1.9, 0.06, 0.06), 'livery_grey')
    # lights
    front = s > 0
    lm = 'headlight' if front else 'taillight'; lm2 = 'taillight' if front else 'headlight'
    for sg in (-1, 1):
        ext.cyl(P(sg * 0.62, NOSE_Y + 0.005, 0.95), 0.07, 0.03, lm, axis='y', seg=14)
        ext.cyl(P(sg * 0.62, NOSE_Y + 0.005, 0.78), 0.04, 0.03, lm2, axis='y', seg=10)
    nm = 'headlight' if front else 'taillight'
    empty(f'{nm}_L', loc=P(-0.62 * (1 if s > 0 else -1), NOSE_Y + 0.05, 0.95), parent=car)
    empty(f'{nm}_R', loc=P(0.62 * (1 if s > 0 else -1), NOSE_Y + 0.05, 0.95), parent=car)
    # front roundel
    q = ext.quad_uv(P(-0.19, NOSE_Y + 0.004, 0.52), P(0.19, NOSE_Y + 0.004, 0.52), P(0.19, NOSE_Y + 0.004, 0.52 + 0.38), P(-0.19, NOSE_Y + 0.004, 0.52 + 0.38), 'sign_roundel')
    q[ext.fx] = 1
    if q.normal.y * s < 0: q.normal_flip()
    ext.box(P(0, NOSE_Y + 0.1, UF + 0.18), (0.3, 0.3, 0.2), 'steel_dark')       # coupler cover
    # ---------------- cab interior : ceiling, desk, controls, driver's seat
    cab.strip_y(CEIL, *sorted((yc + s * CAB_Y, yc + s * Y(0.8))), 'interior_ceiling', toward=(0.0, 1.3))
    DZ = FLOOR + 0.80                                           # desk top height
    cab.box(P(0, Y(0.75), (FLOOR + DZ) / 2), (1.9, 0.62, DZ - FLOOR), 'plastic_black')          # desk body
    cab.poly([P(-0.95, Y(1.06), DZ + 0.0), P(0.95, Y(1.06), DZ + 0.0), P(0.95, Y(0.44), DZ - 0.06), P(-0.95, Y(0.44), DZ - 0.06)], 'plastic_grey')
    cab.box(P(0, Y(0.30), DZ + 0.02), (1.9, 0.06, 0.03), 'plastic_black')       # dash top shelf below windscreen
    # master controller (left of centre) - base + lever + handle ; brake handle beside
    for (xx, rr, mm) in ((-0.36, 0.08, 'button_red'),):
        pass
    cab.cyl(P(-0.36, Y(0.90), DZ + 0.03), 0.075, 0.06, 'steel_dark', seg=14)
    cab.cyl(P(-0.36, Y(0.90), DZ + 0.13), 0.016, 0.16, 'steel_bright', seg=8)
    cab.box(P(-0.36, Y(0.93), DZ + 0.22), (0.04, 0.12, 0.04), 'plastic_black')
    cab.sphere(P(-0.36, Y(0.97), DZ + 0.22), 0.028, 'plastic_black', seg=8)
    cab.cyl(P(-0.13, Y(0.90), DZ + 0.03), 0.065, 0.06, 'steel_dark', seg=14)
    cab.cyl(P(-0.13, Y(0.90), DZ + 0.12), 0.014, 0.14, 'steel_bright', seg=8)
    cab.box(P(-0.13, Y(0.90), DZ + 0.20), (0.12, 0.03, 0.03), 'button_red')
    for i, (xx, mm) in enumerate(((0.14, 'button_green'), (0.24, 'button_green'), (0.34, 'button_red'), (0.44, 'button_amber'))):
        cab.cyl(P(xx, Y(0.86), DZ - 0.02), 0.025, 0.02, mm, seg=12)
    cab.cyl(P(0.68, Y(0.86), DZ - 0.01), 0.04, 0.05, 'button_red', seg=14)           # emergency stop
    cab.box(P(0.84, Y(0.82), DZ - 0.01), (0.08, 0.14, 0.05), 'plastic_black')          # radio handset
    for i in range(6):
        cab.cyl(P(-0.84 + i * 0.05, Y(0.82), DZ - 0.02), 0.012, 0.01, ('button_green', 'button_amber', 'button_red')[i % 3], seg=8)
    cab.box(P(0, Y(0.58), 2.14), (1.7, 0.2, 0.025), 'plastic_black')                     # sun visor
    # driver's seat (centre)
    cab.cyl(P(0, Y(1.55), FLOOR + 0.2), 0.05, 0.3, 'steel_dark', seg=8)
    cab.box(P(0, Y(1.55), FLOOR + 0.43), (0.46, 0.46, 0.08), 'seat_fabric_dk')
    cab.box(P(0, Y(1.78), FLOOR + 0.78), (0.44, 0.08, 0.55), 'seat_fabric_dk')
    cab.box(P(0, Y(1.80), FLOOR + 1.12), (0.30, 0.07, 0.2), 'seat_fabric_dk')
    cab.box(P(0, Y(1.15), 2.50), (0.3, 0.8, 0.012), 'strip_light')
    # screens (separate nodes, UV 0..1; front-facing toward the driver)
    sfx = '' if idx == 0 else '_rear'
    def screen(name, c_t, c_x, c_z, w, h, tilt):
        sm = M(); hw, hh = w / 2, h / 2
        dz = hh * math.cos(tilt); dy = hh * math.sin(tilt)
        pts = [(-hw, -dy, -dz), (hw, -dy, -dz), (hw, dy, dz), (-hw, dy, dz)]
        f = sm.quad(*[P(c_x + px, Y(c_t) + py, c_z + pz) for px, py, pz in pts], 'screen_blank')
        uvl = sm.bm.loops.layers.uv.verify()
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
        f[sm.cuv] = 1
        return sm.to_obj(name, parent=car, uv=False)
    screen(f'cab_screen{sfx}', 0.70, 0.0, DZ + 0.16, 0.40, 0.25, math.radians(25))
    screen(f'cab_speedo{sfx}', 0.74, 0.55, DZ + 0.14, 0.20, 0.13, math.radians(25))
    empty('cab_eye' if s > 0 else 'cab_eye_rear', loc=P(0, Y(1.55), FLOOR + 1.15), parent=car, kind='SPHERE', size=0.08)
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
    empty('couple_front', loc=(0, nose + 0.25, 0.52), parent=root, kind='ARROWS', size=0.3)
    empty('couple_rear', loc=(0, -(nose + 0.25), 0.52), parent=root, kind='ARROWS', size=0.3)
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
        prof = [(-1.16, UF), (1.16, UF), (1.16, 1.95)] + [(x, z) for x, z in FULL_ROOF[1:-1][::-1]][:0] + [(1.12, 2.10), (0.94, 2.36), (0.52, 2.56), (0.0, 2.62), (-0.52, 2.56), (-0.94, 2.36), (-1.12, 2.10), (-1.16, 1.95)]
        if cab:
            a, b = (yc - HALF_, yc + HALF_ - 0.8) if sg > 0 else (yc - HALF_ + 0.8, yc + HALF_)
            m.prism_y(prof, a, b, 'subway_orange')
            m.box((0, yc + sg * (HALF_ - 0.4), 1.2), (2.0, 0.8, 1.5), 'subway_orange')
            m.box((0, yc + sg * (HALF_ - 0.04), 1.95), (1.7, 0.05, 0.6), 'glass_window')
        else:
            m.prism_y(prof, yc - HALF_, yc + HALF_, 'subway_orange')
        for sx in (-1, 1):
            m.box((sx * (W + 0.01), yc, 1.52), (0.02, L - 1.4, 0.62), 'glass_window')
        m.box((0, yc, 0.62), (2.0, L - 0.3, 0.2), 'livery_grey')
        m.box((0, yc, 2.65), (0.9, L * 0.5, 0.04), 'livery_grey')
        m.to_obj(f'car_{idx}_body', parent=car)
        bm_ = M()
        for by in (yc - HALF_ + 1.9, yc + HALF_ - 1.9):
            bm_.box((0, by, 0.30), (1.5, 1.6, 0.5), 'steel_dark')
        bm_.to_obj(f'car_{idx}_bogies', parent=car)
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.52), parent=root); empty('couple_rear', loc=(0, -(nose + 0.25), 0.52), parent=root)
    empty('headlight_L', loc=(-0.62, nose + 0.05, 0.95), parent=root); empty('headlight_R', loc=(0.62, nose + 0.05, 0.95), parent=root)
    return root

if __name__ == '__main__':
    build_train(); export('train.glb')
    build_lod(); export('train_lod.glb')

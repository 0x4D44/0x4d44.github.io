"""Builds models/train.glb and models/train_lod.glb  (Stadler-style 2-car Glasgow Subway unit).
Blender frame: +Y = direction of travel (nose).  glTF: nose along -Z.  Origin: unit centre, between rails, at rail-head level.
"""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

W = 1.16            # half width of body (2.32 m wide)
FLOOR = 0.80        # floor top above rail head
CAR_L = 13.5; GAP = 0.17
CAR_LENS = [10.5, 8.9, 8.9, 10.5]   # 4-car articulated set, total ~39.3 m
DOORS_END = [-1.0]; DOORS_MID = [-2.2, 2.2]
ZSHIFT = -0.105     # whole body (not bogies) lowered: floor 0.695 m, roof apex 2.615 m
HALF = CAR_L / 2
CAB_Y = 4.5         # cab partition (car-local y)
ROOF = [(1.15, 2.2), (0.95, 2.5), (0.5, 2.68), (0.0, 2.72), (-0.5, 2.68), (-0.95, 2.5), (-1.15, 2.2)]
DOORS = [-3.3, 1.2]         # door opening centres (car-local y)
DOOR_W = 1.3
DOOR_Z0, DOOR_Z1 = 0.80, 2.10
SPEC = dict(length=2 * CAR_L + 2 * GAP + 0.4, width=2 * W, height=2.72)

def build_car(idx, yc, s, root, L, DOORS, has_cab):
    HALF = L / 2; CAR_L = L
    CAB_Y = HALF - 2.25 if has_cab else HALF
    ROOFEND = HALF - 0.85 if has_cab else HALF
    dy = HALF - 6.75
    lights = []
    """s=+1: cab at +Y end (front car); s=-1: cab at -Y end (rear car)."""
    def P(x, y, z): return (x, yc + s * y, z)
    car = group(f'car_{idx}', parent=root)
    ext = M(); sal = M(); cab = M(); gls = M()
    def seg_walls(sg, ext, sal, gls):
        x = sg * (W - 0.03)
        # build list of solid y-intervals (non-door) for saloon region [-HALF, CAB_Y]
        edges = [-HALF]
        for d in DOORS:
            edges += [d - DOOR_W / 2, d + DOOR_W / 2]
        edges += [CAB_Y]
        # solid segments: edges[0..1], [2..3], [4..5]
        segs = [(edges[2 * k], edges[2 * k + 1]) for k in range(len(DOORS) + 1)]
        for (a, b) in segs:
            ym = (a + b) / 2; L = b - a
            ext.box(P(x, ym, 1.075 - 0.0), (0.06, L, 0.55 + 0.0), 'subway_orange')       # lower panel z0.80..1.35 (+skirt below)
            ext.box(P(x, ym, 0.675), (0.06, L, 0.25), 'livery_grey')                       # skirt 0.55..0.80
            ext.box(P(x, ym, 2.125), (0.06, L, 0.15), 'subway_orange')                     # upper band 2.05..2.2
            # windows: z 1.35..2.05 ; pillars
            n = max(1, int(round(L / 1.3))); wl = (L - 0.1 * (n + 1)) / n
            for k in range(n + 1):
                yk = a + 0.05 + k * (wl + 0.1)
                ext.box(P(x, yk, 1.70), (0.06, 0.1, 0.70), 'subway_orange')
            for k in range(n):
                y0 = a + 0.1 + k * (wl + 0.1) + wl / 2
                gls.box(P(sg * (W - 0.02), y0, 1.70), (0.03, wl, 0.70), 'glass_window')
            # interior lining
            sal.box(P(sg * (W - 0.08), ym, 1.075), (0.02, L, 0.55), 'interior_wall')
            sal.box(P(sg * (W - 0.08), ym, 2.125), (0.02, L, 0.15), 'interior_wall')
        for d in DOORS:
            # header above door and threshold sill
            ext.box(P(x, d, 2.15), (0.06, DOOR_W + 0.02, 0.10), 'subway_orange')
            ext.box(P(x, d, 0.675), (0.06, DOOR_W + 0.02, 0.25), 'livery_grey')
            sal.box(P(sg * (W - 0.08), d, 2.15), (0.02, DOOR_W, 0.10), 'interior_wall')
            sal.box(P(sg * (W - 0.55), d, FLOOR + 0.005), (0.7, DOOR_W, 0.01), 'tactile_yellow')   # door threshold zone
    # --- floor & underframe
    sal.box(P(0, -0.1 if has_cab else 0, FLOOR - 0.04), (2 * W - 0.1, CAR_L - 0.2, 0.08), 'floor_grey')
    ext.box(P(0, 0, 0.66), (2 * W - 0.12, CAR_L - 0.3, 0.18), 'livery_grey')
    # equipment boxes under floor (between bogies)
    for yy in (-1.3, 0.0, 1.3):
        ext.box(P(0.0, yy, 0.55), (1.4, 0.9, 0.22), 'steel_dark')
    # --- side walls
    for sg in (-1, 1): seg_walls(sg, ext, sal, gls)
    # --- roof (outer + inner shell)
    ext.strip_y(ROOF, *( (yc - HALF, yc + HALF) if s > 0 else (yc - HALF, yc + HALF) ), 'subway_orange_dk') if False else None
    def roof_strip(M_, prof, y0, y1, m):
        a, b = sorted((yc + s * y0, yc + s * y1))
        M_.strip_y(prof, a, b, m)
    roof_strip(ext, ROOF, -HALF, ROOFEND, 'livery_white')
    inner = [(x * 0.96, z - 0.08) for x, z in ROOF]
    roof_strip(sal, inner, -HALF, CAB_Y, 'interior_ceiling')
    # roof equipment (HVAC pods)
    for yy in (-HALF * 0.45, HALF * 0.25):
        ext.box(P(0, yy, 2.72), (0.9, 1.8, 0.04), 'livery_grey')
    # --- gangway ends: end wall with aperture + bellows (cab cars: one end; middle cars: both)
    for e in ((-1,) if has_cab else (-1, 1)):
        for sgx in (-1, 1):
            ext.box(P(sgx * 0.85, e * (HALF - 0.03), 1.5), (0.6, 0.06, 1.4), 'steel_dark')
        ext.box(P(0, e * (HALF - 0.03), 2.16), (2.3, 0.06, 0.1), 'steel_dark')
        ext.prism_y([(-0.7, 0.62), (0.7, 0.62), (0.7, 2.25), (-0.7, 2.25)], *sorted((yc + s * e * HALF, yc + s * e * (HALF + GAP / 2))), 'rubber_black', cap=False)
    if has_cab:
        # glazed cab partition with door opening
        for sgx in (-1, 1):
            sal.box(P(sgx * 0.80, CAB_Y, 1.5), (0.7, 0.05, 1.4), 'interior_wall')
        sal.box(P(0, CAB_Y, 2.15), (1.0, 0.05, 0.1), 'interior_wall')
        sal.box(P(0, CAB_Y, 0.9), (0.92, 0.05, 0.1), 'interior_wall')
        gls.box(P(0, CAB_Y, 1.55), (0.9, 0.03, 0.6), 'glass_clear')
    # --- seating (longitudinal benches) in the three bays
    be = [-HALF + 0.35]
    for d in DOORS: be += [d - DOOR_W / 2 - 0.1, d + DOOR_W / 2 + 0.1]
    be.append(CAB_Y - (0.15 if has_cab else 0.35))
    bays = [(be[i], be[i + 1]) for i in range(0, len(be), 2)]
    for (a, b) in bays:
        L = b - a; ym = (a + b) / 2
        for sg in (-1, 1):
            sx = sg * (W - 0.08 - 0.22)
            sal.box(P(sx, ym, FLOOR + 0.40), (0.44, L, 0.08), 'seat_fabric')               # cushion
            sal.box(P(sg * (W - 0.12), ym, FLOOR + 0.70), (0.08, L, 0.5), 'seat_fabric')   # back
            sal.box(P(sx, ym, FLOOR + 0.20), (0.40, L - 0.1, 0.36), 'seat_fabric_dk')      # base box
            # bay dividers (armrests) every ~0.5 m
            n = max(1, int(L / 0.52))
            for k in range(1, n):
                sal.box(P(sx, a + k * L / n, FLOOR + 0.5), (0.4, 0.015, 0.02), 'steel_dark')
    # --- grab poles + ceiling rails
    for d in DOORS:
        for dd in (-0.68, 0.68):
            for xx in (-0.55, 0.55):
                sal.cyl(P(xx, d + dd * 0.0 + (dd), 0), 0.017, 0, 'pole_yellow') if False else None
        for xx in (-0.9, 0.9):
            sal.cyl(P(xx, d - DOOR_W / 2 - 0.05, (FLOOR + 2.3) / 2), 0.018, 2.3 - FLOOR - 0.05, 'pole_yellow', seg=8)
            sal.cyl(P(xx, d + DOOR_W / 2 + 0.05, (FLOOR + 2.3) / 2), 0.018, 2.3 - FLOOR - 0.05, 'pole_yellow', seg=8)
        sal.cyl(P(0, d, 2.38), 0.018, 0, 'pole_yellow') if False else None
    for xx in (-0.45, 0.45):
        sal.cyl(P(xx, (-HALF + CAB_Y) / 2, 2.38), 0.016, CAB_Y + HALF - 0.6, 'pole_yellow', axis='y', seg=8)
    # --- strip lights on ceiling + panels
    for k in range(max(2, int((CAB_Y + HALF - 1.0) // 2.4))):
        yy = -HALF + 1.4 + k * 2.4
        sal.box(P(0, yy, 2.61), (0.22, 1.4, 0.03), 'strip_light'); lights.append(yc + s * yy)
    # info screens / adverts above windows
    for yy in (-HALF + 1.5, (CAB_Y - HALF) / 2, CAB_Y - 1.5):
        sal.box(P(0.0, yy, 2.45), (0.5, 0.5, 0.01), 'sign_blank') if False else None
        for sg in (-1, 1):
            sal.box(P(sg * (W - 0.09), yy, 2.24), (0.01, 0.7, 0.14), 'sign_blank')
    # --- exterior: roundel and details
    for sg in (-1, 1):
        for d in (-HALF / 2 - 0.25,):
            pass
        # roundel on skirt side: disc + bar
        for yy in (-HALF + 1.0, CAB_Y - 0.9):
            xo = sg * (W + 0.005)
            ext.cyl(P(xo, yy, 1.1), 0.22, 0.01, 'livery_white', axis='x', seg=20)
            ext.cyl(P(xo + sg * 0.003, yy, 1.1), 0.17, 0.01, 'subway_orange_dk', axis='x', seg=20)
            ext.box(P(xo + sg * 0.006, yy, 1.1), (0.01, 0.50, 0.06), 'roundel_blue')
        # waist stripe
        ext.box(P(sg * (W + 0.002), (CAB_Y - HALF) / 2, 1.38), (0.01, CAB_Y + HALF - 0.2, 0.025), 'livery_white')
    # --- doors (animatable) : leaves
    nodes = {}
    for sg, nm in ((-1, 'L'), (1, 'R')):
        pass
    # world-side naming: world -X = left of the unit's forward direction (-Z glTF)
    for sgx, nm in ((-1, 'L'), (1, 'R')):
        for di, d in enumerate(DOORS):
            k = (idx * len(DOORS) + di) * 2
            for half in (0,):
                w_leaf = DOOR_W - 0.1
                yl = d   # car-local centre (half 0 = towards cab end of opening)
                # world front/rear half: front half has larger world y
                wy = yc + s * yl
                lm = M()
                lm.box((0, 0, 0), (0.05, w_leaf - 0.01, DOOR_Z1 - DOOR_Z0), 'subway_orange')
                lm.box((sgx * 0.003, 0, 0.15), (0.045, w_leaf - 0.2, 0.7), 'glass_window')
                lm.box((-sgx * 0.03, 0, 0), (0.01, w_leaf - 0.01, DOOR_Z1 - DOOR_Z0), 'interior_wall')
                lm.box((sgx * 0.03, 0, -0.85 + 0.075), (0.02, w_leaf - 0.1, 0.1), 'livery_grey')
                # world index: front half of opening gets even index within the opening
                front_half = wy > yc + s * d
                wid = 2 * (idx * len(DOORS) + (di if s > 0 else len(DOORS) - 1 - di)) if False else None
                o = lm.to_obj('tmp', parent=car, loc=(sgx * (W - 0.04), wy - yc * 0, (DOOR_Z0 + DOOR_Z1) / 2))
                o.location = (sgx * (W - 0.01), wy, (DOOR_Z0 + DOOR_Z1) / 2)
                o.parent = None
                nodes.setdefault(nm, []).append((wy, o))
    # --- end bogies
    for by in (-HALF + 1.9, HALF - 1.9):   # car-local y
        bg = M()
        for sx in (-1, 1):
            bg.box((sx * 0.80, 0, 0.45), (0.1, 2.1, 0.22), 'steel_dark')                  # side frames
        bg.box((0, 0.0, 0.55), (1.7, 0.24, 0.2), 'steel_dark')                              # bolster
        for ay in (-0.9, 0.9):
            bg.cyl((0, ay, 0.30), 0.045, 1.5, 'steel_bright', axis='x', seg=8)             # axle
            for sx in (-1, 1):
                bg.cyl((sx * 0.55, ay, 0.30), 0.30, 0.11, 'steel_bright', axis='x', seg=24)   # wheel
                bg.cyl((sx * 0.50, ay, 0.30), 0.34, 0.03, 'steel_dark', axis='x', seg=24)     # flange
            bg.box((0, ay, 0.38), (0.5, 0.35, 0.3), 'steel_dark')                          # traction motor / gearbox
        for sx in (-1, 1):
            bg.box((sx * 0.92, 0.55, 0.15), (0.14, 0.35, 0.05), 'conductor_rail')          # current collector shoe
            bg.box((sx * 0.92, 0.55, 0.30), (0.04, 0.06, 0.30), 'steel_dark')
        bg.to_obj(f'car_{idx}_bogie_{"a" if by < 0 else "b"}', parent=car, loc=(0, yc + s * by, 0))
    # --- coupler at free end
    # --- build cab (nose) at +s end
    if has_cab:
        build_cab(idx, yc, s, car, ext, cab, gls, lambda x, y, z: P(x, y + dy, z))
    ext.to_obj(f'car_{idx}_exterior', parent=car, smooth=False)
    sal.to_obj(f'car_{idx}_saloon', parent=car)
    gls.to_obj(f'car_{idx}_glass', parent=car)
    if has_cab: cab.to_obj(f'car_{idx}_cab', parent=car)
    nodes['_lights'] = lights
    return nodes

def build_cab(idx, yc, s, car, ext, cab, gls, P):
    NOSE = 6.72
    # cab floor + lining
    cab.box(P(0, (CAB_Y + 6.4) / 2, FLOOR - 0.04), (2 * W - 0.1, 6.4 - CAB_Y, 0.08), 'floor_grey')
    # side walls in cab zone (4.5..6.0): lower, window, upper ; cab door opening at y 4.9..5.8 (0.9 wide)
    for sg in (-1, 1):
        x = sg * (W - 0.03)
        ext.box(P(x, 5.9, 1.075), (0.06, 0.3, 0.55), 'subway_orange')
        ext.box(P(x, 5.35, 2.15), (0.06, 1.0, 0.1), 'subway_orange')
        ext.box(P(x, 4.65, 1.075), (0.06, 0.3, 0.55), 'subway_orange')
        ext.box(P(x, (4.5 + 6.0) / 2, 0.675), (0.06, 1.5, 0.25), 'livery_grey')
        ext.box(P(x, 4.65, 1.70), (0.06, 0.3, 0.7), 'subway_orange')
        ext.box(P(x, 5.9, 1.70), (0.06, 0.3, 0.7), 'subway_orange')
        cab.box(P(sg * (W - 0.08), 4.65, 1.075), (0.02, 0.3, 0.55), 'interior_wall')
        # cab door : hinged at y=5.8 (front edge) swinging out
        dm = M()
        dm.box((0, 0, 0), (0.05, 0.9, 1.3 + 0.0), 'subway_orange')
        dm.box((sg * 0.003, 0, 0.18), (0.045, 0.6, 0.55), 'glass_window')
        dm.box((-sg * 0.03, 0, 0), (0.01, 0.9, 1.3), 'interior_wall')
        # hinge empty at front edge of door, mesh offset so it rotates about the hinge
        wy_hinge = P(0, 5.8, 0)[1]
        nm = 'L' if (sg * s) < 0 else 'R'
        # world naming: unit-forward-left is world -X for front car; for the rear car (facing -Y) its left is world +X
        # => 'cab_door_L' (front) at -X ; rear cab: 'cab_door_L_rear' at +X
        suffix = '' if s > 0 else '_rear'
        hinge = empty(f'cab_door_{nm}{suffix}', loc=(sg * (W - 0.01), wy_hinge, 1.45), parent=car, kind='ARROWS', size=0.2)
        dm.to_obj(f'cab_door_{nm}{suffix}_mesh', parent=hinge, loc=(0, -s * 0.45, 0))
    # ---- nose & roof
    def NP(x, y, z): return P(x, y, z)
    X0 = 0.88; XB = 0.94
    # lower front
    ext.poly([NP(-X0, NOSE, 0.55), NP(X0, NOSE, 0.55), NP(X0, NOSE, 1.42), NP(-X0, NOSE, 1.42)], 'subway_orange')
    for sg in (-1, 1):
        ext.poly([NP(sg * W, 6.0, 0.55), NP(sg * X0, NOSE, 0.55), NP(sg * X0, NOSE, 1.42), NP(sg * W, 6.0, 1.42)], 'subway_orange')
        # upper corner pillar
        ext.poly([NP(sg * W, 6.0, 1.42), NP(sg * X0, NOSE, 1.42), NP(sg * XB, 6.18, 2.28), NP(sg * W, 5.9, 2.2)], 'subway_orange_dk')
        # filler wall between 5.8..6.0 above lower
        ext.poly([NP(sg * W, 6.0, 1.42), NP(sg * W, 6.0, 2.2), NP(sg * W, 5.8, 2.2), NP(sg * W, 5.8, 1.42)], 'subway_orange')
    ext.box(P(0, NOSE - 0.02, 0.62), (1.7, 0.1, 0.12), 'steel_dark')   # bumper bar
    # windscreen glass (raked)
    gls.poly([NP(-X0, NOSE, 1.42), NP(X0, NOSE, 1.42), NP(XB, 6.18, 2.28), NP(-XB, 6.18, 2.28)], 'glass_window')
    # centre pillar-less; frame bottom/top edges
    ext.box(P(0, NOSE - 0.02, 1.40), (1.78, 0.06, 0.06), 'livery_grey')
    # roof front: loft from y=5.9 ring to y=6.18 ring
    ringA = ROOF; ringB = [(0.82 * x, 2.28 + (z - 2.2) * 0.55) for x, z in ROOF]
    n = len(ROOF); a = [ext.bm.verts.new(P(x, 5.9, z)) for x, z in ringA]; b = [ext.bm.verts.new(P(x, 6.18, z)) for x, z in ringB]
    fs = [ext.bm.faces.new((a[i], a[i + 1], b[i + 1], b[i])) for i in range(n - 1)]
    fs.append(ext.bm.faces.new(b[::-1] if False else b))
    ext._tag(fs, 'livery_white')
    # headlights / tail lights
    front = (s > 0) if True else True
    lm = 'headlight' if s > 0 else 'taillight'
    for sg in (-1, 1):
        ext.cyl(P(sg * 0.62, NOSE + 0.005, 0.98), 0.07, 0.03, lm, axis='y', seg=12)
        ext.cyl(P(sg * 0.62, NOSE + 0.005, 0.80), 0.04, 0.03, 'taillight' if s > 0 else 'headlight', axis='y', seg=10)
    nm = 'headlight' if s > 0 else 'taillight'
    empty(f'{nm}_L', loc=P(-0.62 * (1 if s > 0 else -1), NOSE + 0.05, 0.98), parent=car)
    empty(f'{nm}_R', loc=P(0.62 * (1 if s > 0 else -1), NOSE + 0.05, 0.98), parent=car)
    # roundel on nose
    ext.cyl(P(0, NOSE + 0.004, 1.0), 0.0, 0.0, 'livery_white', axis='y', seg=3) if False else None
    ext.cyl(P(0, NOSE + 0.01, 0.9), 0.0, 0, 'livery_white') if False else None
    # coupler / buffers stub
    ext.box(P(0, NOSE + 0.1, 0.62), (0.3, 0.3, 0.2), 'steel_dark')
    # ---- inside the cab
    cab.box(P(0, 6.15, 1.05), (1.9, 0.8, 0.5), 'plastic_black')            # desk body
    # sloped desk top
    cab.poly([P(-0.95, 5.72, 1.30), P(0.95, 5.72, 1.30), P(0.95, 6.32, 1.20), P(-0.95, 6.32, 1.20)], 'plastic_grey')
    cab.box(P(0, 6.18, 1.45), (1.9, 0.6, 0.08), 'plastic_black') if False else None
    # master controller (left of centre) - base + lever
    cab.cyl(P(-0.38, 5.86, 1.33), 0.08, 0.06, 'steel_dark', seg=12)
    cab.cyl(P(-0.38, 5.86, 1.42), 0.016, 0.16, 'steel_bright', seg=8)
    cab.box(P(-0.38, 5.86, 1.52), (0.035, 0.10, 0.035), 'plastic_black')       # handle
    cab.sphere(P(-0.38, 5.84, 1.55), 0.025, 'plastic_black', seg=8)
    # brake handle (right of controller)
    cab.cyl(P(-0.15, 5.86, 1.33), 0.07, 0.06, 'steel_dark', seg=12)
    cab.cyl(P(-0.15, 5.86, 1.42), 0.014, 0.16, 'steel_bright', seg=8)
    cab.box(P(-0.15, 5.86, 1.52), (0.09, 0.025, 0.025), 'steel_dark')
    # door buttons
    for i, (xx, mm) in enumerate(((0.12, 'button_green'), (0.22, 'button_green'), (0.32, 'button_red'), (0.42, 'button_amber'))):
        cab.cyl(P(xx, 5.84, 1.325), 0.025, 0.02, mm, seg=12)
    # emergency stop
    cab.cyl(P(0.65, 5.85, 1.34), 0.035, 0.05, 'button_red', seg=12)
    # radio handset + indicator lamps
    cab.box(P(0.80, 5.82, 1.325), (0.08, 0.14, 0.05), 'plastic_black')
    for i in range(6):
        cab.cyl(P(-0.8 + i * 0.05, 5.82, 1.325), 0.012, 0.01, ('button_green', 'button_amber', 'button_red')[i % 3], seg=8)
    # sun visor + wiper
    cab.box(P(0, 6.12, 2.24), (1.7, 0.2, 0.03), 'plastic_black')
    gls.box(P(0, 5.95, 1.36), (0.01, 0.01, 0.01), 'glass_clear') if False else None
    # driver seat (centre) : base, cushion, back
    cab.cyl(P(0, 5.15, FLOOR + 0.2), 0.05, 0.3, 'steel_dark', seg=8)
    cab.box(P(0, 5.15, FLOOR + 0.43), (0.46, 0.46, 0.08), 'seat_fabric_dk')
    cab.box(P(0, 4.93, FLOOR + 0.75), (0.44, 0.08, 0.55), 'seat_fabric_dk')
    cab.box(P(0, 4.9, FLOOR + 1.12), (0.30, 0.07, 0.2), 'seat_fabric_dk')
    # side lining
    for sg in (-1, 1):
        cab.box(P(sg * 1.06, 6.0, 1.0), (0.18, 0.5, 0.4), 'plastic_black')
    cab.box(P(0, 5.55, 2.60), (0.3, 0.8, 0.03), 'strip_light')
    # screen quads (separate objects with 0..1 UV)
    def screen(name, c, w, h, tilt, matname):
        sm = M()
        hw, hh = w / 2, h / 2
        # tilted back by `tilt` (rotation about x): top edge further forward (+Y*s)
        dz = hh * math.cos(tilt); dy = hh * math.sin(tilt)
        pts = [(-hw, -dy, -dz), (hw, -dy, -dz), (hw, dy, dz), (-hw, dy, dz)]   # (x, y, z) relative, car-local y
        f = sm.quad(*[P(c[0] + p[0], c[1] + p[1], c[2] + p[2]) for p in pts], matname)
        uvl = sm.bm.loops.layers.uv.verify()
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
        o = sm.to_obj(name, parent=car, uv=False)
        return o
    screen_desc = []
    sfx = '' if s > 0 else '_rear'
    screen(f'cab_screen{sfx}', (0.0, 5.99, 1.355), 0.40, 0.25, math.radians(35) * -1 if False else math.radians(65), 'screen_blank')
    screen(f'cab_speedo{sfx}', (0.50, 6.02, 1.34), 0.18, 0.12, math.radians(65), 'screen_blank')
    # cab_eye
    empty('cab_eye' if s > 0 else 'cab_eye_rear', loc=P(0, 5.20, 1.98), parent=car, kind='SPHERE', size=0.08)

def layout():
    total = sum(CAR_LENS) + GAP * (len(CAR_LENS) - 1)
    out = []; y = total / 2
    for i, L in enumerate(CAR_LENS):
        out.append((y - L / 2, L, +1 if i < 2 else -1, DOORS_END if i in (0, 3) else DOORS_MID, i in (0, 3)))
        y -= L + GAP
    return total, out

def build_train():
    import re
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
    empty('couple_front', loc=(0, nose + 0.25, 0.62), parent=root, kind='ARROWS', size=0.3)
    empty('couple_rear', loc=(0, -(nose + 0.25), 0.62), parent=root, kind='ARROWS', size=0.3)
    for k, wy in enumerate(sorted(lights, reverse=True)):
        empty(f'interior_light_{k}', loc=(0, wy, 2.55), parent=root)
    dy0 = cars[0][1] / 2 - 6.75
    empty('cab_light', loc=(0, cars[0][0] + 5.55 + dy0, 2.55), parent=root)
    empty('cab_light_rear', loc=(0, cars[3][0] - (5.55 + dy0), 2.55), parent=root)
    # lower the whole body (not bogies): floor 0.695 m above rail head
    for o in list(bpy.data.objects):
        if re.match(r'^car_\d$', o.name) or 'bogie' in o.name or o is root: continue
        if o.parent is root or (o.parent is not None and re.match(r'^car_\d$', o.parent.name)):
            o.location.z += ZSHIFT
    return root

def build_lod():
    reset()
    root = group('train')
    total, cars = layout()
    prof = [(-W, 0.55), (W, 0.55), (W, 2.2), (0.95, 2.5), (0.5, 2.68), (-0.5, 2.68), (-0.95, 2.5), (-W, 2.2)]
    for idx, (yc, L, sg, doors, cab) in enumerate(cars):
        HALF_ = L / 2
        car = group(f'car_{idx}', parent=root)
        m = M()
        if cab:
            a, b = (yc - HALF_, yc + HALF_ - 0.8) if sg > 0 else (yc - HALF_ + 0.8, yc + HALF_)
            m.prism_y(prof, a, b, 'subway_orange')
            m.box((0, yc + sg * (HALF_ - 0.4), 1.4), (2.0, 0.8, 1.7), 'subway_orange')
            m.box((0, yc + sg * (HALF_ - 0.04), 1.75), (1.7, 0.05, 0.7), 'glass_window')
        else:
            m.prism_y(prof, yc - HALF_, yc + HALF_, 'subway_orange')
        for sx in (-1, 1):
            m.box((sx * (W + 0.01), yc, 1.7), (0.02, L - 3.0, 0.65), 'glass_window')
        m.box((0, yc, 0.62), (2.0, L - 0.3, 0.22), 'livery_grey')
        m.box((0, yc, 2.72), (0.9, L * 0.5, 0.04), 'livery_grey')
        o = m.to_obj(f'car_{idx}_body', parent=car); o.location.z = ZSHIFT
        bm_ = M()
        for by in (yc - HALF_ + 1.9, yc + HALF_ - 1.9):
            bm_.box((0, by, 0.30), (1.5, 1.6, 0.5), 'steel_dark')
        bm_.to_obj(f'car_{idx}_bogies', parent=car)
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.62 + ZSHIFT), parent=root); empty('couple_rear', loc=(0, -(nose + 0.25), 0.62 + ZSHIFT), parent=root)
    empty('headlight_L', loc=(-0.62, nose + 0.05, 0.98 + ZSHIFT), parent=root); empty('headlight_R', loc=(0.62, nose + 0.05, 0.98 + ZSHIFT), parent=root)
    return root

if __name__ == '__main__':
    build_train()
    export('train.glb')
    build_lod()
    export('train_lod.glb')
